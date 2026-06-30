import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { authenticate, authorize, requireApproved } from '../middleware/auth.js';

const updateConfigSchema = z.object({
  coinsPerMinute: z.number().min(0.1).optional(),
  maxDailyCoins: z.number().int().min(10).optional(),
  heartbeatInterval: z.number().int().min(10).max(300).optional(),
  heartbeatTimeout: z.number().int().min(30).max(600).optional(),
  maxActivePlayers: z.number().int().min(1).max(100).optional(),
  maxChannels: z.number().int().min(1).max(500).optional(),
});

export async function configRoutes(fastify: FastifyInstance) {
  // Apply authentication globally
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. Get global config
  fastify.get('/', async (request, reply) => {
    let globalConfig = await prisma.appConfig.findUnique({
      where: { id: 'global' }
    });

    if (!globalConfig) {
      // Seed dynamically if missing
      globalConfig = await prisma.appConfig.create({
        data: {
          id: 'global',
          coinsPerMinute: 1.0,
          maxDailyCoins: 1000,
          heartbeatInterval: 30,
          heartbeatTimeout: 90,
          maxActivePlayers: 20,
          maxChannels: 100
        }
      });
    }

    return reply.send({ config: globalConfig });
  });

  // 2. Update config (Admin/Owner only)
  fastify.post('/', { preHandler: [authorize(['ADMIN', 'OWNER'])] }, async (request, reply) => {
    try {
      const updateData = updateConfigSchema.parse(request.body);

      const updated = await prisma.appConfig.upsert({
        where: { id: 'global' },
        update: updateData,
        create: {
          id: 'global',
          coinsPerMinute: updateData.coinsPerMinute ?? 1.0,
          maxDailyCoins: updateData.maxDailyCoins ?? 1000,
          heartbeatInterval: updateData.heartbeatInterval ?? 30,
          heartbeatTimeout: updateData.heartbeatTimeout ?? 90,
          maxActivePlayers: updateData.maxActivePlayers ?? 20,
          maxChannels: updateData.maxChannels ?? 100
        }
      });

      return reply.send({ message: 'Configurações atualizadas com sucesso!', config: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno ao atualizar configurações' });
    }
  });
}
