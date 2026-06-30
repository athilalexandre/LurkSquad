import { FastifyInstance } from 'fastify';
import { prisma } from '../services/db.js';
import { authenticate, requireApproved } from '../middleware/auth.js';

export async function coinRoutes(fastify: FastifyInstance) {
  // Apply authentication globally to all coin routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. Get user balance
  fastify.get('/balance', async (request, reply) => {
    const userId = request.user!.userId;

    const balanceRecord = await prisma.coinBalance.findUnique({
      where: { userId }
    });

    return reply.send({
      balance: balanceRecord?.balance ?? 0,
      reserved: balanceRecord?.reserved ?? 0
    });
  });

  // 2. Get user transaction history
  fastify.get('/history', async (request, reply) => {
    const userId = request.user!.userId;

    const transactions = await prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ transactions });
  });
}
