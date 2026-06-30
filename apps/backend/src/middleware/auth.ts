import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../utils/jwt.js';

export interface UserPayload {
  userId: string;
  role: string;
  status: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Token não fornecido ou inválido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    
    if (decoded.status === 'BANNED') {
      return reply.status(403).send({ error: 'Usuário banido' });
    }

    request.user = decoded;
  } catch (error) {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
}

export function authorize(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Sem permissão para esta ação' });
    }
  };
}

export async function requireApproved(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user) {
    return reply.status(401).send({ error: 'Não autenticado' });
  }

  if (request.user.status !== 'APPROVED') {
    return reply.status(403).send({ error: 'Sua conta ainda não foi aprovada pelo administrador' });
  }
}
