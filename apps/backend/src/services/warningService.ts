import { prisma } from './db.js';
import { createAuditLog } from '../utils/audit.js';
import { broadcastToAll } from '../ws/handler.js';

export async function checkUserInactivity() {
  const config = await prisma.appConfig.findFirst();
  const thresholdHours = config?.inactivityThresholdHours ?? 24;
  
  // Cut-off date for inactivity
  const cutOff = new Date();
  cutOff.setHours(cutOff.getHours() - thresholdHours);

  // Find all approved users who haven't sent a heartbeat for +24h
  // We check lastActiveAt or if they have never sent a heartbeat since creation (createdAt)
  const inactiveUsers = await prisma.user.findMany({
    where: {
      status: 'APPROVED',
      role: { not: 'OWNER' }, // Don't suspend the owner
      OR: [
        { lastActiveAt: { lte: cutOff } },
        {
          lastActiveAt: null,
          createdAt: { lte: cutOff } // First access window
        }
      ]
    }
  });

  if (inactiveUsers.length === 0) return;

  console.log(`[WarningService] Detected ${inactiveUsers.length} inactive users. Processing flags...`);

  for (const user of inactiveUsers) {
    try {
      const nextInfraction = user.infractionCount + 1;
      
      if (nextInfraction >= 4) {
        // 4th infraction: Permanent Ban / Delete Account
        console.log(`[WarningService] User ${user.displayName} reached 4th infraction. Deleting account.`);
        
        // Audit log before delete (actor is SYSTEM)
        const systemUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
        await createAuditLog(prisma, {
          actorId: systemUser?.id ?? user.id,
          action: 'user.delete_inactive',
          targetId: user.id,
          details: { username: user.username, displayName: user.displayName, infractionCount: nextInfraction }
        });

        // Delete user (cascade will clean up sessions, coins, etc.)
        await prisma.user.delete({
          where: { id: user.id }
        });

        // Broadcast user deleted
        broadcastToAll({
          type: 'user:deleted',
          userId: user.id,
        });

      } else {
        // Infractions 1, 2, 3: Suspension
        let durationHours = 24;
        let color = 'yellow';
        
        if (nextInfraction === 2) {
          durationHours = 48;
          color = 'orange';
        } else if (nextInfraction === 3) {
          durationHours = 72; // 3 days
          color = 'red';
        }

        const suspendedUntil = new Date();
        suspendedUntil.setHours(suspendedUntil.getHours() + durationHours);

        console.log(`[WarningService] Suspending user ${user.displayName} for ${durationHours}h. Flag: ${color}.`);

        await prisma.$transaction(async (tx) => {
          // Update User
          await tx.user.update({
            where: { id: user.id },
            data: {
              status: 'SUSPENDED',
              flagColor: color,
              infractionCount: nextInfraction,
              suspendedUntil,
            }
          });

          // Create Flag history
          await tx.userFlag.create({
            data: {
              userId: user.id,
              level: nextInfraction,
              color,
              reason: `Inatividade de mais de ${thresholdHours} horas sem acessar o aplicativo.`,
              suspendedUntil,
              issuedBy: 'SYSTEM',
            }
          });

          // Revoke sessions
          await tx.session.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() }
          });
        });

        // Broadcast warning/suspension
        broadcastToAll({
          type: 'user:suspended',
          userId: user.id,
          displayName: user.displayName,
          flagColor: color,
          suspendedUntil,
        });
      }
    } catch (err) {
      console.error(`[WarningService] Failed to process inactivity for user ${user.id}:`, err);
    }
  }
}

export async function checkSuspensionExpiration() {
  const now = new Date();

  // Find suspended users whose suspension period ended
  const expiredSuspensions = await prisma.user.findMany({
    where: {
      status: 'SUSPENDED',
      suspendedUntil: { lte: now }
    }
  });

  if (expiredSuspensions.length === 0) return;

  console.log(`[WarningService] Restoring ${expiredSuspensions.length} users from suspension...`);

  for (const user of expiredSuspensions) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: 'APPROVED',
            suspendedUntil: null,
            // We set lastActiveAt to now so they get a fresh 24h window
            lastActiveAt: new Date(),
          }
        });

        // Mark active flags as expired/inactive
        await tx.userFlag.updateMany({
          where: { userId: user.id, isActive: true },
          data: { isActive: false }
        });
      });

      broadcastToAll({
        type: 'user:restored',
        userId: user.id,
        displayName: user.displayName,
      });
    } catch (err) {
      console.error(`[WarningService] Failed to restore user ${user.id}:`, err);
    }
  }
}

export async function checkVipExpirations() {
  const config = await prisma.appConfig.findFirst();
  const vipDurationDays = config?.vipDurationDays ?? 30;

  const vipUsers = await prisma.user.findMany({
    where: { plan: 'VIP' }
  });

  if (vipUsers.length === 0) return;

  const cutOff = new Date();
  cutOff.setDate(cutOff.getDate() - vipDurationDays);

  for (const user of vipUsers) {
    try {
      // Find if they have any active confirmed VIP purchase
      const activePurchase = await prisma.coinPurchase.findFirst({
        where: {
          userId: user.id,
          type: 'VIP',
          status: 'CONFIRMED',
          confirmedAt: { gte: cutOff }
        }
      });

      if (!activePurchase) {
        console.log(`[WarningService] VIP plan expired for user ${user.displayName}. Reverting to STANDARD.`);
        await prisma.user.update({
          where: { id: user.id },
          data: { plan: 'STANDARD' }
        });

        broadcastToAll({
          type: 'user:plan_expired',
          userId: user.id,
          displayName: user.displayName,
        });
      }
    } catch (err) {
      console.error(`[WarningService] Failed to check VIP expiration for user ${user.id}:`, err);
    }
  }
}
