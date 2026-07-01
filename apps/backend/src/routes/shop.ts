import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { authenticate, requireApproved } from '../middleware/auth.js';

const purchaseSchema = z.object({
  packageId: z.string().optional(),
  type: z.enum(['COINS', 'VIP']),
  proofUrl: z.string().min(1, 'Comprovante/justificativa é obrigatório'),
});

export async function shopRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. Get packages & VIP price
  fastify.get('/packages', async (request, reply) => {
    try {
      const packages = await prisma.coinPackage.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const config = await prisma.appConfig.findFirst();

      return reply.send({
        packages,
        vipPriceCents: config?.vipPriceCents ?? 2500,
        vipDurationDays: config?.vipDurationDays ?? 30,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao listar pacotes' });
    }
  });

  // 2. Get PIX details
  fastify.get('/pix', async (request, reply) => {
    try {
      let pix = await prisma.pixConfig.findUnique({ where: { id: 'global' } });
      if (!pix) {
        // Create default if not exists
        pix = await prisma.pixConfig.create({
          data: {
            id: 'global',
            keyType: 'email',
            keyValue: 'suporte@lurksquad.com',
            holderName: 'LurkSquad Inc',
          }
        });
      }
      return reply.send(pix);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar PIX' });
    }
  });

  // 3. Get user purchases
  fastify.get('/purchases', async (request, reply) => {
    const userId = request.user!.userId;
    try {
      const purchases = await prisma.coinPurchase.findMany({
        where: { userId },
        include: { package: true },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ purchases });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao listar compras' });
    }
  });

  // 4. Submit purchase (PIX proof)
  fastify.post('/purchase', async (request, reply) => {
    const userId = request.user!.userId;
    try {
      const { packageId, type, proofUrl } = purchaseSchema.parse(request.body);

      const config = await prisma.appConfig.findFirst();
      const maxDaily = config?.maxPurchasesPerDay ?? 2;
      const cooldownMinutes = config?.purchaseCooldownMinutes ?? 60;

      // 4.1 Cooldown check
      const lastPurchase = await prisma.coinPurchase.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      if (lastPurchase) {
        const diffMs = Date.now() - lastPurchase.createdAt.getTime();
        const cooldownMs = cooldownMinutes * 60000;
        if (diffMs < cooldownMs) {
          const remainingMinutes = Math.ceil((cooldownMs - diffMs) / 60000);
          return reply.status(400).send({
            error: `Aguarde ${remainingMinutes} minutos antes de solicitar outra compra.`
          });
        }
      }

      // 4.2 Daily limit check
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyCount = await prisma.coinPurchase.count({
        where: {
          userId,
          createdAt: { gte: startOfDay }
        }
      });

      if (dailyCount >= maxDaily) {
        return reply.status(400).send({
          error: `Limite diário de ${maxDaily} compras atingido.`
        });
      }

      // 4.3 Determine price and coins
      let priceCents = 0;
      let coins = 0;

      if (type === 'VIP') {
        priceCents = config?.vipPriceCents ?? 2500;
      } else {
        if (!packageId) {
          return reply.status(400).send({ error: 'packageId é obrigatório para compra de moedas.' });
        }
        const coinPackage = await prisma.coinPackage.findUnique({
          where: { id: packageId }
        });
        if (!coinPackage || !coinPackage.isActive) {
          return reply.status(404).send({ error: 'Pacote não encontrado ou inativo.' });
        }
        priceCents = coinPackage.priceCents;
        coins = coinPackage.coins;
      }

      // Create purchase request (PENDING)
      const purchase = await prisma.coinPurchase.create({
        data: {
          userId,
          packageId: type === 'COINS' ? packageId : undefined,
          type,
          coins,
          priceCents,
          proofUrl,
          status: 'PENDING',
        }
      });

      return reply.status(201).send({
        message: 'Comprovante PIX enviado! Aguardando aprovação do admin.',
        purchase,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao processar solicitação de compra' });
    }
  });
}
