import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { verifyAccessToken } from '../utils/jwt.js';
import { processHeartbeat, closeAllUserSessions, closeWatchSession } from './heartbeat.js';

// Global map of active websocket connections to broadcast real-time events
// Map<userId, WebSocket[]>
export const activeConnections = new Map<string, WebSocket[]>();

export function broadcastToUser(userId: string, data: Record<string, unknown>) {
  const sockets = activeConnections.get(userId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export function broadcastToAll(data: Record<string, unknown>) {
  const payload = JSON.stringify(data);
  for (const sockets of activeConnections.values()) {
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, async (connection: WebSocket, request: FastifyRequest) => {
    let userId: string | null = null;
    
    try {
      // 1. Authenticate connection
      const url = new URL(request.url || '', 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        connection.send(JSON.stringify({ error: 'Token de autenticação ausente' }));
        connection.close(4001, 'Unauthorized');
        return;
      }

      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (err) {
        connection.send(JSON.stringify({ error: 'Token inválido ou expirado' }));
        connection.close(4001, 'Unauthorized');
        return;
      }

      if (decoded.status !== 'APPROVED') {
        connection.send(JSON.stringify({ error: 'Conta não aprovada' }));
        connection.close(4003, 'Forbidden');
        return;
      }

      userId = decoded.userId;

      // 2. Register active connection
      const existing = activeConnections.get(userId) || [];
      existing.push(connection);
      activeConnections.set(userId, existing);

      fastify.log.info(`WebSocket conectado para o usuário: ${userId}`);

      // Send initial welcome/ack
      connection.send(JSON.stringify({ type: 'welcome', status: 'connected' }));

      // 3. Handle messages
      connection.on('message', async (messageData: any) => {
        try {
          const payload = JSON.parse(messageData.toString());

          if (payload.type === 'heartbeat') {
            const { channelId } = payload;
            if (!channelId) {
              connection.send(JSON.stringify({ error: 'channelId é obrigatório para heartbeat' }));
              return;
            }

            // Process heartbeat
            const result = await processHeartbeat(userId!, channelId);

            // Send acknowledgment response
            connection.send(JSON.stringify({
              type: 'heartbeat:ack',
              channelId,
              status: result.status,
              coinsEarned: result.coinsEarned,
              totalMinutes: result.totalMinutes,
              balance: result.balance
            }));
          }
        } catch (error) {
          fastify.log.error(error);
          connection.send(JSON.stringify({
            error: error instanceof Error ? error.message : 'Erro ao processar mensagem'
          }));
        }
      });

      // 4. Handle close/disconnect
      connection.on('close', async () => {
        if (userId) {
          fastify.log.info(`WebSocket desconectado para o usuário: ${userId}`);
          
          // Remove connection from active pool
          const sockets = activeConnections.get(userId) || [];
          const filtered = sockets.filter((s) => s !== connection);
          
          if (filtered.length === 0) {
            activeConnections.delete(userId);
            // Close all active database watch sessions for this user if no other active connections
            await closeAllUserSessions(userId);
          } else {
            activeConnections.set(userId, filtered);
          }
        }
      });
      
    } catch (error) {
      fastify.log.error(error);
      connection.close(1011, 'Server error');
    }
  });
}
