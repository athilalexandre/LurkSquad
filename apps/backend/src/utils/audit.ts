import { PrismaClient } from '@prisma/client';

export async function createAuditLog(
  prisma: PrismaClient,
  params: {
    actorId: string;
    action: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }
) {
  return prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetId: params.targetId,
      details: params.details ? (params.details as any) : undefined,
      ipAddress: params.ipAddress,
    },
  });
}
