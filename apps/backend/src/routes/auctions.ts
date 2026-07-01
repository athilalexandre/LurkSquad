import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireApproved } from '../middleware/auth.js';
import { getActiveAuction, getActiveHighlightSlots, placeBid } from '../services/auctionService.js';
import { broadcastToAll } from '../ws/handler.js';

const placeBidSchema = z.object({
  channelId: z.string().min(1, 'ID do canal é obrigatório'),
  amount: z.number().int().min(1, 'O valor do lance deve ser maior que 0'),
});

export async function auctionRoutes(fastify: FastifyInstance) {
  // Apply auth and approved check globally
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. Get active auction and current highlight slots
  fastify.get('/active', async (request, reply) => {
    try {
      const auction = await getActiveAuction();
      const highlights = await getActiveHighlightSlots();
      
      // Sanitize bids if they are hidden and user is not an admin/owner
      if (auction && auction.bidsHidden && request.user?.role !== 'ADMIN' && request.user?.role !== 'OWNER') {
        // Keep only the user's own bid in the response so they can see if they placed a bid
        auction.bids = auction.bids.filter(b => b.userId === request.user?.userId);
      }
      
      return reply.send({ auction, highlights });
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

      if (updatedAuction) {
        if (updatedAuction.bidsHidden) {
          // If bids are hidden, we broadcast a sanitized version of the auction
          // so other clients know a bid occurred but cannot see the bids array details
          broadcastToAll({
            type: 'auction:bid_placed',
            auction: {
              ...updatedAuction,
              bids: [], // clear bids in broadcast to prevent inspecting network packets
            },
          });
        } else {
          // If revealed, broadcast the full auction details
          broadcastToAll({
            type: 'auction:bid',
            auction: updatedAuction,
          });
        }
      }

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
