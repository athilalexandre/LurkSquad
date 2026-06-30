import { prisma } from './db.js';
import { broadcastToAll } from '../ws/handler.js';

export function getHourlyAuctionWindow(date: Date) {
  const startsAt = new Date(date);
  startsAt.setMinutes(0, 0, 0);
  startsAt.setMilliseconds(0);

  const endsAt = new Date(date);
  endsAt.setMinutes(50, 0, 0);
  endsAt.setMilliseconds(0);

  const highlightStartsAt = new Date(date);
  highlightStartsAt.setHours(date.getHours() + 1, 0, 0, 0);

  const highlightEndsAt = new Date(date);
  highlightEndsAt.setHours(date.getHours() + 2, 0, 0, 0);

  return { startsAt, endsAt, highlightStartsAt, highlightEndsAt };
}

export async function getActiveAuction() {
  const now = new Date();
  return await prisma.auction.findFirst({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: {
      bids: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            }
          },
          channel: {
            select: {
              id: true,
              slug: true,
              displayName: true,
            }
          }
        },
        orderBy: { amount: 'desc' },
      }
    }
  });
}

export async function getActiveHighlightSlot() {
  const now = new Date();
  return await prisma.auctionSlot.findFirst({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: {
      channel: true
    }
  });
}

export async function placeBid(userId: string, auctionId: string, channelId: string, amount: number) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch auction
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: {
        bids: {
          where: { refunded: false },
          orderBy: { amount: 'desc' },
          take: 1,
        }
      }
    });

    if (!auction) throw new Error('Leilão não encontrado');
    if (auction.status !== 'ACTIVE') throw new Error('Leilão não está ativo');

    const now = new Date();
    if (now < auction.startsAt || now > auction.endsAt) {
      throw new Error('O leilão está fora do horário ativo (inscrições fecham no minuto 50)');
    }

    // 2. Validate bid amount
    const highestBid = auction.bids[0];
    const minRequired = highestBid ? highestBid.amount + auction.bidIncrement : auction.minBid;

    if (amount < minRequired) {
      throw new Error(`O lance mínimo é de ${minRequired} moedas`);
    }

    // 3. Check user's balance
    const userBalance = await tx.coinBalance.findUnique({
      where: { userId },
    });

    const balance = userBalance?.balance ?? 0;
    if (balance < amount) {
      throw new Error('Saldo de moedas insuficiente');
    }

    // 4. Refund previous highest bidder if it's NOT the same user
    if (highestBid && highestBid.userId !== userId) {
      await tx.coinBalance.update({
        where: { userId: highestBid.userId },
        data: {
          balance: { increment: highestBid.amount },
          reserved: { decrement: highestBid.amount },
        }
      });

      await tx.coinTransaction.create({
        data: {
          userId: highestBid.userId,
          type: 'AUCTION_REFUND',
          amount: highestBid.amount,
          balanceAfter: (await tx.coinBalance.findUnique({ where: { userId: highestBid.userId } }))?.balance ?? 0,
          reason: `Reembolso de lance superado no leilão: ${auction.title}`,
        }
      });

      await tx.auctionBid.update({
        where: { id: highestBid.id },
        data: { refunded: true }
      });
    }

    // If it is the SAME user bidding again, we refund their own previous bid first
    if (highestBid && highestBid.userId === userId) {
      await tx.coinBalance.update({
        where: { userId },
        data: {
          balance: { increment: highestBid.amount },
          reserved: { decrement: highestBid.amount },
        }
      });
      await tx.auctionBid.update({
        where: { id: highestBid.id },
        data: { refunded: true }
      });
    }

    // 5. Reserve coins for the new bid
    const newBalance = await tx.coinBalance.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        reserved: { increment: amount },
      }
    });

    await tx.coinTransaction.create({
      data: {
        userId,
        type: 'AUCTION_BID',
        amount: -amount,
        balanceAfter: newBalance.balance,
        reason: `Lance efetuado no leilão: ${auction.title}`,
      }
    });

    // 6. Create the bid record
    const bid = await tx.auctionBid.create({
      data: {
        auctionId,
        userId,
        channelId,
        amount,
        isWinning: true,
      }
    });

    // 7. Anti-sniping: Check if bid is in the last seconds (cannot extend past minute 50 strictly)
    let finalEndsAt = auction.endsAt;
    const timeRemainingSec = (auction.endsAt.getTime() - now.getTime()) / 1000;
    if (timeRemainingSec <= auction.antiSnipingSeconds && timeRemainingSec > 0) {
      // Only extend if it's less than minute 50
      const limitMinutes50 = new Date(auction.endsAt);
      limitMinutes50.setMinutes(50, 0, 0);
      
      const potentialEndsAt = new Date(now.getTime() + auction.antiSnipingSeconds * 1000);
      if (potentialEndsAt <= limitMinutes50) {
        finalEndsAt = potentialEndsAt;
        await tx.auction.update({
          where: { id: auctionId },
          data: { endsAt: finalEndsAt }
        });
      }
    }

    return { bid, finalEndsAt };
  });
}

export async function resolveAuction(auctionId: string) {
  return await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: {
        bids: {
          where: { refunded: false },
          orderBy: { amount: 'desc' },
          take: 1,
        }
      }
    });

    if (!auction || auction.status !== 'ACTIVE') return null;

    // Update status to ENDED
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'ENDED' }
    });

    const winningBid = auction.bids[0];
    if (winningBid) {
      // Deduct coins from reserved: reserved = reserved - amount
      await tx.coinBalance.update({
        where: { userId: winningBid.userId },
        data: {
          reserved: { decrement: winningBid.amount }
        }
      });

      // Deactivate any currently active slots
      await tx.auctionSlot.updateMany({
        where: { isActive: true },
        data: { isActive: false }
      });

      const now = new Date();
      const startsAt = new Date(now);
      startsAt.setMinutes(0, 0, 0);
      startsAt.setMilliseconds(0);
      startsAt.setHours(startsAt.getHours() + 1);

      const endsAt = new Date(startsAt);
      endsAt.setHours(endsAt.getHours() + 1);

      // Create new Slot for winning channel
      const slot = await tx.auctionSlot.create({
        data: {
          auctionId,
          channelId: winningBid.channelId!,
          startsAt,
          endsAt,
          isActive: true,
        },
        include: {
          channel: true
        }
      });

      return { winnerId: winningBid.userId, slot };
    }

    return null;
  });
}

// Scheduled check to automatically run the hourly Chronos loop
export async function checkAndCloseAuctions() {
  const now = new Date();
  const currentMinutes = now.getMinutes();

  const { startsAt, endsAt, highlightStartsAt } = getHourlyAuctionWindow(now);

  // 1. Bidding window: minute 0 to 50
  if (currentMinutes < 50) {
    const targetTitle = `Chronos: Destaque das ${highlightStartsAt.getHours().toString().padStart(2, '0')}:00`;
    
    // Check if the current hour's auction is registered
    const existing = await prisma.auction.findFirst({
      where: {
        startsAt,
        endsAt,
      }
    });

    if (!existing) {
      console.log(`[AuctionService] Criando leilão Chronos automático: ${targetTitle}`);
      await prisma.auction.create({
        data: {
          title: targetTitle,
          status: 'ACTIVE',
          minBid: 90000, // Starting bid as per screenshot
          bidIncrement: 10,
          startsAt,
          endsAt,
          highlightDuration: 60,
          createdBy: 'system',
        }
      });

      broadcastToAll({
        type: 'auction:started',
      });
    }
  }

  // 2. Resolve expired auctions
  const endedAuctions = await prisma.auction.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { lte: now }
    }
  });

  for (const auction of endedAuctions) {
    try {
      console.log(`[AuctionService] Encerrando e resolvendo leilão: ${auction.title}`);
      const result = await resolveAuction(auction.id);
      
      if (result) {
        broadcastToAll({
          type: 'auction:resolved',
          auctionId: auction.id,
          slot: result.slot,
        });
      } else {
        broadcastToAll({
          type: 'auction:resolved',
          auctionId: auction.id,
          slot: null,
        });
      }
    } catch (err) {
      console.error(`[AuctionService] Erro ao encerrar leilão ${auction.id}:`, err);
    }
  }

  // 3. Expire old slots
  const expiredSlots = await prisma.auctionSlot.findMany({
    where: {
      isActive: true,
      endsAt: { lte: now }
    }
  });

  if (expiredSlots.length > 0) {
    await prisma.auctionSlot.updateMany({
      where: { id: { in: expiredSlots.map(s => s.id) } },
      data: { isActive: false }
    });
    
    broadcastToAll({
      type: 'highlight:expired',
    });
  }
}
