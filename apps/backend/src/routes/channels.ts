import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../services/db.js';
import { fetchKickChannel, syncActiveChannels } from '../services/kickService.js';
import { authenticate, authorize, requireApproved } from '../middleware/auth.js';

const addChannelSchema = z.object({
  slug: z.string().min(1, 'Slug do canal obrigatório').regex(/^[a-zA-Z0-9_-]+$/, 'Slug inválido'),
});

export async function channelRoutes(fastify: FastifyInstance) {
  // Apply authentication and approval check globally to all channel routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireApproved);

  // 1. List active channels (with status)
  fastify.get('/', async (request, reply) => {
    try {
      const activeChannels = await syncActiveChannels();
      return reply.send({ channels: activeChannels });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Falha ao sincronizar canais' });
    }
  });

  // 2. Add channel (Admin/Owner only)
  fastify.post('/', { preHandler: [authorize(['ADMIN', 'OWNER'])] }, async (request, reply) => {
    try {
      const { slug } = addChannelSchema.parse(request.body);
      const normalizedSlug = slug.toLowerCase().trim();

      // Check if already exists in DB
      const existingChannel = await prisma.channel.findUnique({
        where: { slug: normalizedSlug }
      });

      if (existingChannel) {
        if (existingChannel.isActive) {
          return reply.status(400).send({ error: 'Este canal já está adicionado e ativo' });
        }
        
        // Reactivate channel
        const updated = await prisma.channel.update({
          where: { id: existingChannel.id },
          data: { isActive: true }
        });
        return reply.send({ message: 'Canal reativado com sucesso!', channel: updated });
      }

      // Fetch Kick channel details to validate slug and get avatar/display name
      let info;
      try {
        info = await fetchKickChannel(normalizedSlug);
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : 'Falha ao verificar canal na Kick' });
      }

      const channel = await prisma.channel.create({
        data: {
          slug: normalizedSlug,
          displayName: info.displayName,
          avatarUrl: info.avatarUrl,
          isActive: true,
          addedBy: request.user!.userId
        }
      });

      return reply.status(201).send({ message: 'Canal adicionado com sucesso!', channel });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro interno ao adicionar canal' });
    }
  });

  // 3. Remove channel (Deactivate, Admin/Owner only)
  fastify.delete('/:id', { preHandler: [authorize(['ADMIN', 'OWNER'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) {
      return reply.status(404).send({ error: 'Canal não encontrado' });
    }

    await prisma.channel.update({
      where: { id },
      data: { isActive: false }
    });

    return reply.send({ success: true, message: 'Canal desativado com sucesso' });
  });

  // 4. Get status for single channel
  fastify.get('/:slug/status', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try {
      const info = await fetchKickChannel(slug);
      return reply.send(info);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Erro ao consultar canal' });
    }
  });
}
