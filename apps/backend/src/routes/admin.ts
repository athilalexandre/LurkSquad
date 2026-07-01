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

const updateUserPlanSchema = z.object({
  plan: z.enum(['STANDARD', 'VIP']),
});

const createAuctionSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  durationMinutes: z.number().int().min(1, 'Duração deve ser de pelo menos 1 minuto'),
  minBid: z.number().int().min(1).default(50),
  bidIncrement: z.number().int().min(1).default(10),
  highlightDurationMinutes: z.number().int().min(1).default(60),
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
        plan: true,
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

  // 9. Update user plan (Standard / VIP)
  fastify.put('/users/:id/plan', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { plan } = updateUserPlanSchema.parse(request.body);
      const actorId = request.user!.userId;

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        return reply.status(404).send({ error: 'Usuário não encontrado' });
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: { plan },
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'user.update_plan',
        targetId: id,
        details: { plan },
        ipAddress: request.ip
      });

      return reply.send({ success: true, user: updatedUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      return reply.status(400).send({ error: 'Erro ao atualizar plano' });
    }
  });

  // 10. Create new manual auction
  fastify.post('/auctions', async (request, reply) => {
    try {
      const { title, durationMinutes, minBid, bidIncrement, highlightDurationMinutes } = createAuctionSchema.parse(request.body);
      const actorId = request.user!.userId;

      const startsAt = new Date();
      const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      // Cancel any active auctions first to prevent multiple simultaneous auctions
      await prisma.auction.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'ENDED' },
      });

      const auction = await prisma.auction.create({
        data: {
          title,
          status: 'ACTIVE',
          minBid,
          bidIncrement,
          startsAt,
          endsAt,
          highlightDuration: highlightDurationMinutes,
          createdBy: actorId,
        }
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'auction.create',
        targetId: auction.id,
        details: { title, durationMinutes, minBid, bidIncrement },
        ipAddress: request.ip
      });

      // Notify clients of started auction
      const { broadcastToAll } = await import('../ws/handler.js');
      broadcastToAll({
        type: 'auction:started',
        auctionId: auction.id,
      });

      return reply.send({ success: true, auction });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(400).send({ error: 'Erro ao criar leilão' });
    }
  });

  // 11. Get all shop purchases
  fastify.get('/shop/purchases', async (request, reply) => {
    const purchases = await prisma.coinPurchase.findMany({
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
          }
        },
        package: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ purchases });
  });

  // 12. Confirm purchase
  fastify.post('/shop/purchases/:id/confirm', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const purchase = await tx.coinPurchase.findUnique({
          where: { id },
          include: { user: true }
        });

        if (!purchase) throw new Error('Pedido de compra não encontrado');
        if (purchase.status !== 'PENDING') throw new Error('Este pedido já foi processado');

        // Confirm purchase
        const updatedPurchase = await tx.coinPurchase.update({
          where: { id },
          data: {
            status: 'CONFIRMED',
            confirmedBy: actorId,
            confirmedAt: new Date(),
          }
        });

        if (purchase.type === 'VIP') {
          // Grant VIP plan
          await tx.user.update({
            where: { id: purchase.userId },
            data: { plan: 'VIP' }
          });
        } else {
          // Grant Coins
          const balance = await tx.coinBalance.upsert({
            where: { userId: purchase.userId },
            update: {
              balance: { increment: purchase.coins }
            },
            create: {
              userId: purchase.userId,
              balance: purchase.coins,
              reserved: 0,
            }
          });

          // Create ledger entry
          await tx.coinTransaction.create({
            data: {
              userId: purchase.userId,
              type: 'ADMIN_ADJUST',
              amount: purchase.coins,
              balanceAfter: balance.balance,
              reason: `Compra de moedas confirmada: ID ${purchase.id}`,
            }
          });
        }

        return updatedPurchase;
      });

      // Broadcast update
      const { broadcastToAll } = await import('../ws/handler.js');
      broadcastToAll({
        type: 'shop:purchase_confirmed',
        purchaseId: id,
        userId: result.userId,
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.confirm_purchase',
        targetId: result.userId,
        details: { purchaseId: id, type: result.type, amount: result.coins },
        ipAddress: request.ip
      });

      return reply.send({ success: true, purchase: result });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao confirmar compra' });
    }
  });

  // 13. Reject purchase
  fastify.post('/shop/purchases/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    try {
      const purchase = await prisma.coinPurchase.findUnique({ where: { id } });
      if (!purchase) {
        return reply.status(404).send({ error: 'Pedido de compra não encontrado' });
      }
      if (purchase.status !== 'PENDING') {
        return reply.status(400).send({ error: 'Este pedido já foi processado' });
      }

      const updated = await prisma.coinPurchase.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectedBy: actorId,
          rejectedAt: new Date(),
        }
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.reject_purchase',
        targetId: purchase.userId,
        details: { purchaseId: id },
        ipAddress: request.ip
      });

      return reply.send({ success: true, purchase: updated });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao rejeitar compra' });
    }
  });

  // 14. Update PIX configuration
  fastify.put('/shop/pix', async (request, reply) => {
    const actorId = request.user!.userId;
    const updatePixSchema = z.object({
      keyType: z.string().min(1),
      keyValue: z.string().min(1),
      holderName: z.string().min(1),
    });

    try {
      const { keyType, keyValue, holderName } = updatePixSchema.parse(request.body);

      const pix = await prisma.pixConfig.upsert({
        where: { id: 'global' },
        update: { keyType, keyValue, holderName },
        create: { id: 'global', keyType, keyValue, holderName }
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.update_pix',
        details: { keyType, keyValue, holderName },
        ipAddress: request.ip
      });

      return reply.send({ success: true, pix });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar PIX' });
    }
  });

  // 15. List all packages (including inactive)
  fastify.get('/shop/packages', async (request, reply) => {
    const packages = await prisma.coinPackage.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    return reply.send({ packages });
  });

  // 16. Create package
  fastify.post('/shop/packages', async (request, reply) => {
    const actorId = request.user!.userId;
    const packageSchema = z.object({
      name: z.string().min(1),
      coins: z.number().int().min(1),
      priceCents: z.number().int().min(1),
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().default(0),
    });

    try {
      const data = packageSchema.parse(request.body);
      const pkg = await prisma.coinPackage.create({ data });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.create_package',
        details: { packageId: pkg.id, name: pkg.name },
        ipAddress: request.ip
      });

      return reply.send({ success: true, package: pkg });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao criar pacote' });
    }
  });

  // 17. Update package
  fastify.put('/shop/packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;
    const packageSchema = z.object({
      name: z.string().min(1),
      coins: z.number().int().min(1),
      priceCents: z.number().int().min(1),
      isActive: z.boolean(),
      sortOrder: z.number().int(),
    });

    try {
      const data = packageSchema.parse(request.body);
      const pkg = await prisma.coinPackage.update({
        where: { id },
        data
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.update_package',
        targetId: id,
        details: { name: pkg.name },
        ipAddress: request.ip
      });

      return reply.send({ success: true, package: pkg });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar pacote' });
    }
  });

  // 18. Delete package
  fastify.delete('/shop/packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    try {
      await prisma.coinPackage.delete({ where: { id } });

      await createAuditLog(prisma, {
        actorId,
        action: 'shop.delete_package',
        targetId: id,
        ipAddress: request.ip
      });

      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao deletar pacote' });
    }
  });

  // 19. Add manual infraction flag to user
  fastify.post('/users/:id/flag', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;
    
    const addFlagSchema = z.object({
      color: z.enum(['yellow', 'orange', 'red']),
      reason: z.string().min(3),
    });

    try {
      const { color, reason } = addFlagSchema.parse(request.body);

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'Usuário não encontrado' });
      }

      const nextInfraction = user.infractionCount + 1;
      
      if (nextInfraction >= 4) {
        // Delete user
        await prisma.user.delete({ where: { id } });
        
        const { broadcastToAll } = await import('../ws/handler.js');
        broadcastToAll({ type: 'user:deleted', userId: id });

        await createAuditLog(prisma, {
          actorId,
          action: 'user.delete_manual_warning',
          targetId: id,
          details: { username: user.username, reason },
          ipAddress: request.ip
        });

        return reply.send({ success: true, message: 'Usuário atingiu o limite de infrações e foi deletado.' });
      }

      let durationHours = 24;
      if (color === 'orange') durationHours = 48;
      if (color === 'red') durationHours = 72;

      const suspendedUntil = new Date();
      suspendedUntil.setHours(suspendedUntil.getHours() + durationHours);

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            status: 'SUSPENDED',
            flagColor: color,
            infractionCount: nextInfraction,
            suspendedUntil,
          }
        });

        await tx.userFlag.create({
          data: {
            userId: id,
            level: nextInfraction,
            color,
            reason,
            suspendedUntil,
            issuedBy: actorId,
          }
        });

        // Revoke active sessions
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() }
        });

        return updated;
      });

      const { broadcastToAll } = await import('../ws/handler.js');
      broadcastToAll({
        type: 'user:suspended',
        userId: id,
        displayName: user.displayName,
        flagColor: color,
        suspendedUntil,
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'user.add_flag',
        targetId: id,
        details: { color, reason, infractionCount: nextInfraction },
        ipAddress: request.ip
      });

      return reply.send({ success: true, user: result });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao aplicar flag' });
    }
  });

  // 20. Clear flags / Restore user (unflag)
  fastify.post('/users/:id/unflag', async (request, reply) => {
    const { id } = request.params as { id: string };
    const actorId = request.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'Usuário não encontrado' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: {
            status: user.status === 'SUSPENDED' ? 'APPROVED' : user.status,
            flagColor: 'green',
            infractionCount: 0,
            suspendedUntil: null,
            lastActiveAt: new Date(),
          }
        });

        await tx.userFlag.updateMany({
          where: { userId: id, isActive: true },
          data: { isActive: false, removedBy: actorId, removedAt: new Date() }
        });

        return updated;
      });

      const { broadcastToAll } = await import('../ws/handler.js');
      broadcastToAll({
        type: 'user:restored',
        userId: id,
        displayName: user.displayName,
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'user.clear_flags',
        targetId: id,
        ipAddress: request.ip
      });

      return reply.send({ success: true, user: result });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao limpar flags' });
    }
  });

  // 21. Update global config parameters
  fastify.put('/config', async (request, reply) => {
    const actorId = request.user!.userId;
    const configSchema = z.object({
      coinsPerMinute: z.number().min(0).optional(),
      vipMultiplier: z.number().min(1).optional(),
      inactivityThresholdHours: z.number().int().min(1).optional(),
      vipPriceCents: z.number().int().min(1).optional(),
      maxDailyCoins: z.number().int().min(1).optional(),
      channelCheckIntervalSec: z.number().int().min(10).optional(),
    });

    try {
      const data = configSchema.parse(request.body);
      const updated = await prisma.appConfig.update({
        where: { id: 'global' },
        data
      });

      await createAuditLog(prisma, {
        actorId,
        action: 'config.update',
        details: data,
        ipAddress: request.ip
      });

      return reply.send({ success: true, config: updated });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message || 'Erro ao atualizar configurações' });
    }
  });
}
