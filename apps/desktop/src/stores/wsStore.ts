import { create } from 'zustand';
import { getMemoryAccessToken } from '../services/api.js';
import { useCoinStore } from './coinStore.js';

interface WSState {
  socket: WebSocket | null;
  status: 'disconnected' | 'connecting' | 'connected';
  error: string | null;

  connect: () => void;
  disconnect: () => void;
  sendHeartbeat: (channelId: string) => void;
}

export const useWSStore = create<WSState>((set, get) => {
  let reconnectTimeout: number | null = null;

  const clearReconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  return {
    socket: null,
    status: 'disconnected',
    error: null,

    connect: () => {
      const token = getMemoryAccessToken();
      if (!token) {
        set({ error: 'Nenhum token disponível para conexão WebSocket' });
        return;
      }

      const currentStatus = get().status;
      if (currentStatus === 'connected' || currentStatus === 'connecting') {
        return;
      }

      set({ status: 'connecting', error: null });
      clearReconnect();

      const wsUrl = `ws://localhost:3001/ws?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS Client] Conectado ao servidor');
        set({ socket: ws, status: 'connected', error: null });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WS Client] Mensagem recebida:', message);

          if (message.type === 'heartbeat:ack') {
            // Update user balance in coinStore
            useCoinStore.getState().updateBalance(message.balance);
          } else if (message.error) {
            set({ error: message.error });
          }
        } catch (err) {
          console.error('[WS Client] Erro ao parsear mensagem:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS Client] Erro na conexão:', err);
        set({ error: 'Erro de conexão WebSocket' });
      };

      ws.onclose = (event) => {
        console.log('[WS Client] Desconectado. Código:', event.code, 'Razão:', event.reason);
        set({ socket: null, status: 'disconnected' });

        // Auto-reconnect if it wasn't a clean close by us
        if (event.code !== 1000 && event.code !== 1005) {
          console.log('[WS Client] Tentando reconectar em 5 segundos...');
          reconnectTimeout = setTimeout(() => {
            get().connect();
          }, 5000) as any;
        }
      };
    },

    disconnect: () => {
      clearReconnect();
      const ws = get().socket;
      if (ws) {
        ws.close(1000, 'Logout do usuário');
      }
      set({ socket: null, status: 'disconnected', error: null });
    },

    sendHeartbeat: (channelId: string) => {
      const ws = get().socket;
      const wsStatus = get().status;

      if (ws && wsStatus === 'connected') {
        ws.send(JSON.stringify({ type: 'heartbeat', channelId }));
      } else {
        console.warn('[WS Client] Não foi possível enviar heartbeat: soquete não está conectado.');
      }
    },
  };
});
