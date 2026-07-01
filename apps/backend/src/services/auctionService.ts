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
        where: { refunded: false },
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

export async function getActiveHighlightSlots() {
  const now = new Date();
  const slots = await prisma.auctionSlot.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: {
      channel: true,
      auction: {
        include: {
          bids: {
            where: { refunded: false, isWinning: true },
            orderBy: { amount: 'desc' }
          }
        }
      }
    }
  });

  // Sort slots based on the corresponding winning bid amount in descending order
  return slots.sort((a, b) => {
    const bidA = a.auction.bids.find(bid => bid.channelId === a.channelId)?.amount ?? 0;
    const bidB = b.auction.bids.find(bid => bid.channelId === b.channelId)?.amount ?? 0;
    return bidB - bidA;
  });
}

export async function getActiveHighlightSlot() {
  // Backwards compatibility fallback (returns 1st place slot)
  const slots = await getActiveHighlightSlots();
  return slots[0] ?? null;
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
        }
      }
    });

    if (!auction) throw new Error('Leilão não encontrado');
    if (auction.status !== 'ACTIVE') throw new Error('Leilão não está ativo');

    const now = new Date();
    if (now < auction.startsAt || now > auction.endsAt) {
      throw new Error('O leilão está fora do horário ativo');
    }

    // 2. Validate bid amount
    const activeBids = auction.bids.filter(b => !b.refunded).sort((a, b) => b.amount - a.amount);
    const userPreviousBid = activeBids.find(b => b.userId === userId);
    
    // The cut-off bid is the 5th highest bid (index 4) if there are at least 5 bids
    const cutOffBidAmount = activeBids.length >= 5 ? activeBids[4].amount : 0;
    
    // Bid must be strictly greater than the current 5th highest bid to enter top 5
    let minRequired = Math.max(auction.minBid, cutOffBidAmount + 1);

    // If user already has a bid, they must bid strictly more than their own previous bid
    if (userPreviousBid) {
      minRequired = Math.max(minRequired, userPreviousBid.amount + 1);
    }

    if (amount < minRequired) {
      throw new Error('Seu lance não é alto o suficiente para entrar no Top 5. Tente um valor maior.');
    }

    // 3. Check user's balance
    const userBalance = await tx.coinBalance.findUnique({
      where: { userId },
    });

    const balance = userBalance?.balance ?? 0;
    
    // Adjust balance requirement based on if they are upgrading their own previous bid
    const additionalAmountNeeded = userPreviousBid ? (amount - userPreviousBid.amount) : amount;
    if (balance < additionalAmountNeeded) {
      throw new Error('Saldo de moedas insuficiente');
    }

    // 4. Handle refund of user's own previous bid
    if (userPreviousBid) {
      await tx.coinBalance.update({
        where: { userId },
        data: {
          balance: { increment: userPreviousBid.amount },
          reserved: { decrement: userPreviousBid.amount },
        }
      });
      await tx.auctionBid.update({
        where: { id: userPreviousBid.id },
        data: { refunded: true, isWinning: false }
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

    // 6. Create the new bid record
    const newBid = await tx.auctionBid.create({
      data: {
        auctionId,
        userId,
        channelId,
        amount,
        isWinning: true,
      }
    });

    // 7. Recalculate top 5 bids and refund anyone bumped out
    const updatedActiveBids = await tx.auctionBid.findMany({
      where: { auctionId, refunded: false },
      orderBy: { amount: 'desc' },
    });

    if (updatedActiveBids.length > 5) {
      // Bids at index >= 5 are bumped out of the top 5
      const bumpedBids = updatedActiveBids.slice(5);
      for (const bumped of bumpedBids) {
        await tx.coinBalance.update({
          where: { userId: bumped.userId },
          data: {
            balance: { increment: bumped.amount },
            reserved: { decrement: bumped.amount },
          }
        });

        await tx.coinTransaction.create({
          data: {
            userId: bumped.userId,
            type: 'AUCTION_REFUND',
            amount: bumped.amount,
            balanceAfter: (await tx.coinBalance.findUnique({ where: { userId: bumped.userId } }))?.balance ?? 0,
            reason: `Reembolso de lance superado no leilão: ${auction.title}`,
          }
        });

        await tx.auctionBid.update({
          where: { id: bumped.id },
          data: { refunded: true, isWinning: false }
        });
      }
    }

    // 8. Anti-sniping
    let finalEndsAt = auction.endsAt;
    const timeRemainingSec = (auction.endsAt.getTime() - now.getTime()) / 1000;
    if (timeRemainingSec <= auction.antiSnipingSeconds && timeRemainingSec > 0) {
      const limitMinutes = new Date(auction.startsAt);
      limitMinutes.setMinutes(56, 0, 0); // Max extensions up to minute 56
      
      const potentialEndsAt = new Date(now.getTime() + auction.antiSnipingSeconds * 1000);
      if (potentialEndsAt <= limitMinutes) {
        finalEndsAt = potentialEndsAt;
        await tx.auction.update({
          where: { id: auctionId },
          data: { endsAt: finalEndsAt }
        });
      }
    }

    return { bid: newBid, finalEndsAt };
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
        }
      }
    });

    if (!auction || auction.status !== 'ACTIVE') return null;

    // Update status to ENDED
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: 'ENDED' }
    });

    // Top 5 bids are the winners
    const winningBids = auction.bids.slice(0, 5);
    const slots = [];

    // Deactivate all currently active slots
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

    for (const winningBid of winningBids) {
      // Deduct coins from reserved
      await tx.coinBalance.update({
        where: { userId: winningBid.userId },
        data: {
          reserved: { decrement: winningBid.amount }
        }
      });

      // Mark bid as winning
      await tx.auctionBid.update({
        where: { id: winningBid.id },
        data: { isWinning: true }
      });

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
      slots.push(slot);
    }

    return { slots };
  });
}

// Scheduled check to automatically run the hourly Chronos loop
export async function checkAndCloseAuctions() {
  const now = new Date();
  const currentMinutes = now.getMinutes();

  // Get AppConfig parameters
  const config = await prisma.appConfig.findFirst();
  const duration = config?.auctionDurationMinutes ?? 50;
  const revealOffset = config?.auctionRevealMinutes ?? 10;
  const slotsCount = config?.auctionSlotsCount ?? 5;
  const minBid = config?.auctionMinBid ?? 30;
  const bidIncrement = config?.auctionBidIncrement ?? 10;

  // Hourly window
  const startsAt = new Date(now);
  startsAt.setMinutes(0, 0, 0);
  startsAt.setMilliseconds(0);

  const endsAt = new Date(startsAt);
  endsAt.setMinutes(duration, 0, 0);
  endsAt.setMilliseconds(0);

  const revealAt = new Date(startsAt);
  revealAt.setMinutes(duration - revealOffset, 0, 0);
  revealAt.setMilliseconds(0);

  const highlightStartsAt = new Date(startsAt);
  highlightStartsAt.setHours(startsAt.getHours() + 1);

  // 1. Create automatic auction if it doesn't exist
  if (currentMinutes < duration) {
    const targetTitle = `Chronos: Destaque das ${highlightStartsAt.getHours().toString().padStart(2, '0')}:00`;
    
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
          minBid,
          bidIncrement,
          startsAt,
          endsAt,
          revealAt,
          bidsHidden: true,
          slotsCount,
          createdBy: 'system',
        }
      });

      broadcastToAll({
        type: 'auction:started',
      });
    }
  }

  // 2. Handle reveal of bids at XX:40 (endsAt - revealOffset)
  const activeAuction = await prisma.auction.findFirst({
    where: {
      status: 'ACTIVE',
      revealAt: { lte: now },
      bidsHidden: true,
    }
  });

  if (activeAuction) {
    console.log(`[AuctionService] Revelando lances para o leilão: ${activeAuction.title}`);
    await prisma.auction.update({
      where: { id: activeAuction.id },
      data: { bidsHidden: false }
    });

    const updatedAuction = await getActiveAuction();
    broadcastToAll({
      type: 'auction:revealed',
      auction: updatedAuction,
    });
  }

  // 3. Resolve expired auctions
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
          slots: result.slots,
        });
      } else {
        broadcastToAll({
          type: 'auction:resolved',
          auctionId: auction.id,
          slots: [],
        });
      }
    } catch (err) {
      console.error(`[AuctionService] Erro ao encerrar leilão ${auction.id}:`, err);
    }
  }

  // 4. Expire old slots
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
