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
import { shopRoutes } from './routes/shop.js';
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

    // Auto-seed default global settings
    await prisma.appConfig.upsert({
      where: { id: 'global' },
      update: {},
      create: {
        coinsPerMinute: 1.0,
        vipMultiplier: 2.0,
        maxDailyCoins: 1000,
        heartbeatInterval: 30,
        heartbeatTimeout: 90,
        maxActivePlayers: 20,
        maxChannels: 100,
        auctionDurationMinutes: 50,
        auctionRevealMinutes: 10,
        auctionSlotsCount: 5,
        auctionMinBid: 30,
        auctionBidIncrement: 10,
        inactivityThresholdHours: 24,
        maxPurchasesPerDay: 2,
        purchaseCooldownMinutes: 60,
        vipPriceCents: 2500,
        vipDurationDays: 30,
        channelCheckIntervalSec: 300,
      }
    });

    // Auto-seed coin packages
    const packagesCount = await prisma.coinPackage.count();
    if (packagesCount === 0) {
      await prisma.coinPackage.createMany({
        data: [
          { name: 'Starter', coins: 200, priceCents: 490, sortOrder: 1 },
          { name: 'Boost', coins: 500, priceCents: 990, sortOrder: 2 },
          { name: 'Power', coins: 1200, priceCents: 1990, sortOrder: 3 },
          { name: 'Ultra', coins: 3000, priceCents: 3990, sortOrder: 4 },
        ]
      });
    }

    // Auto-seed PIX configuration
    const pixCount = await prisma.pixConfig.count();
    if (pixCount === 0) {
      await prisma.pixConfig.create({
        data: {
          id: 'global',
          keyType: 'email',
          keyValue: 'suporte@lurksquad.com',
          holderName: 'LurkSquad Inc',
        }
      });
    }

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
        error: `Muitas requisições. Tente novamente em ${Math.ceil((context.after as any) / 1000)} segundos.`,
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
    await fastify.register(shopRoutes, { prefix: '/api/shop' });
    await fastify.register(websocketRoutes); // WS mounts on /ws inside the handler

    // Start Schedulers
    const { checkAndCloseAuctions } = await import('./services/auctionService.js');
    const { runBackgroundChannelSync } = await import('./services/kickService.js');
    const { checkUserInactivity, checkSuspensionExpiration, checkVipExpirations } = await import('./services/warningService.js');

    let lastChannelSync = 0;
    let lastInactivityCheck = 0;
    let lastSuspensionCheck = 0;

    auctionInterval = setInterval(async () => {
      try {
        await checkAndCloseAuctions();

        const now = Date.now();
        const configGlobal = await prisma.appConfig.findUnique({ where: { id: 'global' } });

        // 1. Background channel sync check (every 5 min)
        const channelIntervalMs = (configGlobal?.channelCheckIntervalSec ?? 300) * 1000;
        if (now - lastChannelSync >= channelIntervalMs) {
          lastChannelSync = now;
          runBackgroundChannelSync().catch(err => fastify.log.error(err));
        }

        // 2. Suspension expiration check (every 5 min)
        if (now - lastSuspensionCheck >= 300000) { // 5 minutes
          lastSuspensionCheck = now;
          checkSuspensionExpiration().catch(err => fastify.log.error(err));
        }

        // 3. User inactivity & VIP expiration check (every 1 hour)
        if (now - lastInactivityCheck >= 3600000) { // 1 hour
          lastInactivityCheck = now;
          checkUserInactivity().catch(err => fastify.log.error(err));
          checkVipExpirations().catch(err => fastify.log.error(err));
        }
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
