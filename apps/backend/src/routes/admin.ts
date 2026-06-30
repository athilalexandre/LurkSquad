import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { createAuditLog } from '../utils/audit.js';

const adjustCoinsSchema = z.object({
  userId: z.string().min(1, 'ID do usuário obrigatório'),
  amount: z.number().int('A quantidade deve ser um número inteiro').refine(val => val !== 0, 'A quantidade não pode ser zero'),
  reason: z.string().min(3, 'A justificativa deve ter pelo menos 3 caracteres').max(255),
});

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply auth and admin check globally to all routes in this plugin
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['ADMIN', 'OWNER']));

  // 1. Get all users
  fastify.get('/users', async (request, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        coinBalance: {
          select: {
            balance: true,
            reserved: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ users });
  });

  // 2. Approve user
  fastify.post('/users/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    if (targetUser.status === 'APPROVED') {
      return reply.status(400).send({ error: 'Usuário já está aprovado' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: 'APPROVED' }
    });

    await createAuditLog(prisma, {
      actorId,
      action: 'user.approve',
      targetId: id,
      ipAddress: request.ip
    });

    return reply.send({ success: true, user: updatedUser });
  });

  // 3. Reject user
  fastify.post('/users/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: 'REJECTED' }
    });

    // Revoke any active sessions
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await createAuditLog(prisma, {
      actorId,
      action: 'user.reject',
      targetId: id,
      ipAddress: request.ip
    });

    return reply.send({ success: true, user: updatedUser });
  });

  // 4. Ban user
  fastify.post('/users/:id/ban', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    if (targetUser.role === 'OWNER') {
      return reply.status(400).send({ error: 'Não é possível banir o proprietário do app' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: 'BANNED' }
    });

    // Revoke all sessions immediately
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await createAuditLog(prisma, {
      actorId,
      action: 'user.ban',
      targetId: id,
      ipAddress: request.ip
    });

    return reply.send({ success: true, user: updatedUser });
  });

  // 5. Unban user
  fastify.post('/users/:id/unban', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    if (targetUser.status !== 'BANNED') {
      return reply.status(400).send({ error: 'Usuário não está banido' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status: 'APPROVED' }
    });

    await createAuditLog(prisma, {
      actorId,
      action: 'user.unban',
      targetId: id,
      ipAddress: request.ip
    });

    return reply.send({ success: true, user: updatedUser });
  });

  // 6. Adjust user coins
  fastify.post('/coins/adjust', async (request, reply) => {
    try {
      const { userId, amount, reason } = adjustCoinsSchema.parse(request.body);
      const actorId = request.user!.userId;

      // Use transaction to ensure consistency
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { coinBalance: true }
        });

        if (!user) {
          throw new Error('Usuário não encontrado');
        }

        const balance = user.coinBalance?.balance ?? 0;
        const newBalance = balance + amount;

        if (newBalance < 0) {
          throw new Error('O saldo resultante não pode ser negativo');
        }

        // Update Balance
        const updatedBalance = await tx.coinBalance.upsert({
          where: { userId },
          update: { balance: newBalance },
          create: { userId, balance: newBalance, reserved: 0 }
        });

        // Record Transaction
        const transaction = await tx.coinTransaction.create({
          data: {
            userId,
            type: 'ADMIN_ADJUST',
            amount,
            balanceAfter: newBalance,
            reason
          }
        });

        return { updatedBalance, transaction };
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'coins.adjust',
        targetId: userId,
        details: { amount, reason },
        ipAddress: request.ip
      });

      return reply.send({
        success: true,
        balance: result.updatedBalance.balance,
        transaction: result.transaction
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      const message = error instanceof Error ? error.message : 'Erro ao ajustar moedas';
      return reply.status(400).send({ error: message });
    }
  });

  // 7. Get coin transaction ledger
  fastify.get('/coins/ledger', async (request, reply) => {
    const transactions = await prisma.coinTransaction.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ transactions });
  });

  // 8. Get audit logs
  fastify.get('/audit-logs', async (request, reply) => {
    const logs = await prisma.auditLog.findMany({
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        },
        target: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return reply.send({ logs });
  });
}
