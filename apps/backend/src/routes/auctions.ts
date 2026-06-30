import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireApproved } from '../middleware/auth.js';
import { getActiveAuction, getActiveHighlightSlot, placeBid } from '../services/auctionService.js';
import { broadcastToAll } from '../ws/handler.js';

const placeBidSchema = z.object({
  channelId: z.string().min(1, 'ID do canal é obrigatório'),
  amount: z.number().int().min(1, 'O valor do lance deve ser maior que 0'),
});

export async function auctionRoutes(fastify: FastifyInstance) {
  // Apply auth and approved check globally
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. Get active auction and current highlight slot
  fastify.get('/active', async (request, reply) => {
    try {
      const auction = await getActiveAuction();
      const highlight = await getActiveHighlightSlot();
      return reply.send({ auction, highlight });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar leilão ativo' });
    }
  });

  // 2. Place a bid in the active auction
  fastify.post('/:id/bid', async (request, reply) => {
    try {
      const { id: auctionId } = request.params as { id: string };
      const { channelId, amount } = placeBidSchema.parse(request.body);
      const userId = request.user!.userId;

      const { bid, finalEndsAt } = await placeBid(userId, auctionId, channelId, amount);

      // Fetch updated auction info to broadcast
      const updatedAuction = await getActiveAuction();

      // Notify all connected clients of the new bid in real time
      broadcastToAll({
        type: 'auction:bid',
        auction: updatedAuction,
      });

      return reply.send({
        success: true,
        message: 'Lance efetuado com sucesso!',
        bid,
        endsAt: finalEndsAt,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      const msg = error instanceof Error ? error.message : 'Falha ao processar lance';
      return reply.status(400).send({ error: msg });
    }
  });
}
