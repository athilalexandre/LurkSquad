import { prisma } from '../services/db.js';

// Keep track of accumulated heartbeat counts in memory to calculate minutes
// Map<"userId:channelId", { heartbeatCount: number, lastHeartbeatTime: number }>
const sessionHeartbeats = new Map<string, { heartbeatCount: number; lastHeartbeatTime: number }>();

export interface HeartbeatResult {
  status: 'started' | 'active' | 'daily_limit_reached' | 'error';
  coinsEarned: number;
  totalMinutes: number;
  balance: number;
}

export async function processHeartbeat(
  userId: string,
  channelId: string
): Promise<HeartbeatResult> {
  const now = Date.now();
  const sessionKey = `${userId}:${channelId}`;

  // Get app configuration
  const globalConfig = await prisma.appConfig.findUnique({
    where: { id: 'global' },
  });

  const config = {
    coinsPerMinute: globalConfig?.coinsPerMinute ?? 1.0,
    vipMultiplier: globalConfig?.vipMultiplier ?? 1.5,
    maxDailyCoins: globalConfig?.maxDailyCoins ?? 1000,
    heartbeatInterval: globalConfig?.heartbeatInterval ?? 30,
    heartbeatTimeout: globalConfig?.heartbeatTimeout ?? 90,
  };

  const heartbeatTimeoutMs = config.heartbeatTimeout * 1000;

  // Validate that user is APPROVED
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { coinBalance: true },
  });

  if (!user || user.status !== 'APPROVED') {
    throw new Error('Usuário não autorizado ou não aprovated');
  }

  // Calculate coins per minute with VIP multiplier
  const multiplier = user.plan === 'VIP' ? config.vipMultiplier : 1.0;
  const coinsPerMinute = Math.floor(config.coinsPerMinute * multiplier);

  // Validate channel exists and is active
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel || !channel.isActive) {
    throw new Error('Canal inválido ou inativo');
  }

  // Find or create active database watch session
  let watchSession = await prisma.watchSession.findFirst({
    where: {
      userId,
      channelId,
      endedAt: null,
    },
  });

  const sessionState = sessionHeartbeats.get(sessionKey);
  const isNewSession = !watchSession || !sessionState || (now - sessionState.lastHeartbeatTime > heartbeatTimeoutMs);

  if (isNewSession) {
    // If there was an old session not closed, close it now
    if (watchSession) {
      await prisma.watchSession.update({
        where: { id: watchSession.id },
        data: { endedAt: new Date(sessionState?.lastHeartbeatTime || now) },
      });
    }

    // Start a new session
    watchSession = await prisma.watchSession.create({
      data: {
        userId,
        channelId,
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        totalMinutes: 0,
        coinsEarned: 0,
      },
    });

    sessionHeartbeats.set(sessionKey, {
      heartbeatCount: 1,
      lastHeartbeatTime: now,
    });

    return {
      status: 'started',
      coinsEarned: 0,
      totalMinutes: 0,
      balance: user.coinBalance?.balance ?? 0,
    };
  }

  // Active session exists. Update heartbeat time
  const currentCount = sessionState!.heartbeatCount + 1;
  sessionHeartbeats.set(sessionKey, {
    heartbeatCount: currentCount,
    lastHeartbeatTime: now,
  });

  await prisma.watchSession.update({
    where: { id: watchSession!.id },
    data: { lastHeartbeat: new Date() },
  });

  let earnedCoins = 0;
  let newMinutes = watchSession!.totalMinutes;
  let userBalance = user.coinBalance?.balance ?? 0;
  let status: 'active' | 'daily_limit_reached' = 'active';

  // If 2 heartbeats have accumulated (representing 1 minute watched, given 30s interval)
  const heartbeatsPerMinute = Math.ceil(60 / config.heartbeatInterval);
  if (currentCount % heartbeatsPerMinute === 0) {
    newMinutes += 1;
    earnedCoins = coinsPerMinute;

    if (earnedCoins > 0) {
      // Run database transaction to update watch session and credit user balance with ledger
      const transactionResult = await prisma.$transaction(async (tx) => {
        // Update Watch Session
        await tx.watchSession.update({
          where: { id: watchSession!.id },
          data: {
            totalMinutes: newMinutes,
            coinsEarned: {
              increment: earnedCoins,
            },
          },
        });

        // Update User Balance
        const balance = await tx.coinBalance.upsert({
          where: { userId },
          update: {
            balance: {
              increment: earnedCoins,
            },
          },
          create: {
            userId,
            balance: earnedCoins,
            reserved: 0,
          },
        });

        // Add Ledger Transaction
        await tx.coinTransaction.create({
          data: {
            userId,
            type: 'EARNED',
            amount: earnedCoins,
            balanceAfter: balance.balance,
            reason: `Ganhou moedas por assistir ao canal ${channel.slug}`,
            sourceId: watchSession!.id,
          },
        });

        return balance.balance;
      });

      userBalance = transactionResult;
    } else {
      // Just update minutes watched
      await prisma.watchSession.update({
        where: { id: watchSession!.id },
        data: { totalMinutes: newMinutes },
      });
    }
  }

  return {
    status,
    coinsEarned: earnedCoins,
    totalMinutes: newMinutes,
    balance: userBalance,
  };
}

// Helper to clean up dead sessions from database when WS disconnects or crashes
export async function closeWatchSession(userId: string, channelId: string) {
  const sessionKey = `${userId}:${channelId}`;
  const sessionState = sessionHeartbeats.get(sessionKey);
  sessionHeartbeats.delete(sessionKey);

  const watchSession = await prisma.watchSession.findFirst({
    where: {
      userId,
      channelId,
      endedAt: null,
    },
  });

  if (watchSession) {
    await prisma.watchSession.update({
      where: { id: watchSession.id },
      data: {
        endedAt: new Date(sessionState?.lastHeartbeatTime || Date.now()),
      },
    });
  }
}

// Clean up all sessions for a user (e.g. on disconnect)
export async function closeAllUserSessions(userId: string) {
  for (const [key, value] of sessionHeartbeats.entries()) {
    if (key.startsWith(`${userId}:`)) {
      const channelId = key.split(':')[1];
      await closeWatchSession(userId, channelId);
    }
  }
}
