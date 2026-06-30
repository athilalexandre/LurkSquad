import Fastify from 'fastify'; // Reload trigger

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { prisma } from './services/db.js';

// Route imports
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { channelRoutes } from './routes/channels.js';
import { coinRoutes } from './routes/coins.js';
import { configRoutes } from './routes/config.js';
import { auctionRoutes } from './routes/auctions.js';
import { websocketRoutes } from './ws/handler.js';

let auctionInterval: NodeJS.Timeout | undefined;

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

async function main() {
  try {
    // 1. Database Connection Check
    await prisma.$connect();
    fastify.log.info('Conectado ao banco de dados com sucesso.');

    // 2. CORS registration
    await fastify.register(cors, {
      origin: config.cors.origin,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });

    // 3. Rate Limit registration
    await fastify.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.timeWindow,
      errorResponseBuilder: (request, context) => ({
        error: `Muitas requisições. Tente novamente em ${Math.ceil(context.after / 1000)} segundos.`,
      }),
    });

    // 4. WebSocket registration
    await fastify.register(websocket);

    // 5. REST & WebSocket Routes registration
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(adminRoutes, { prefix: '/api/admin' });
    await fastify.register(channelRoutes, { prefix: '/api/channels' });
    await fastify.register(coinRoutes, { prefix: '/api/coins' });
    await fastify.register(configRoutes, { prefix: '/api/config' });
    await fastify.register(auctionRoutes, { prefix: '/api/auctions' });
    await fastify.register(websocketRoutes); // WS mounts on /ws inside the handler

    // Start Auction Scheduler (every 10 seconds)
    const { checkAndCloseAuctions } = await import('./services/auctionService.js');
    auctionInterval = setInterval(async () => {
      try {
        await checkAndCloseAuctions();
      } catch (err) {
        fastify.log.error(err);
      }
    }, 10000);

    // Healthcheck
    fastify.get('/health', async () => ({ status: 'ok', time: new Date() }));

    // 6. Start server
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`Servidor rodando em http://localhost:${config.port}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    fastify.log.info(`Recebido sinal ${signal}. Desconectando e encerrando...`);
    try {
      if (auctionInterval) clearInterval(auctionInterval);
      await prisma.$disconnect();
      await fastify.close();
      fastify.log.info('Servidor encerrado de forma limpa.');
      process.exit(0);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}

main();
