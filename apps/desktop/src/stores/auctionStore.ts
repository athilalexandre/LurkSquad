import { create } from 'zustand';
import { apiFetch } from '../services/api.js';

export interface AuctionBid {
  id: string;
  amount: number;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
  channel?: {
    id: string;
    slug: string;
    displayName: string;
  };
}

export interface Auction {
  id: string;
  title: string;
  description?: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  minBid: number;
  bidIncrement: number;
  startsAt: string;
  endsAt: string;
  highlightDuration: number;
  bidsHidden: boolean; // LurkSquad v4 cego
  bids: AuctionBid[];
}

export interface AuctionSlot {
  id: string;
  channelId: string;
  startsAt: string;
  endsAt: string;
  channel: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    isLive?: boolean;
  };
}

interface AuctionState {
  activeAuction: Auction | null;
  activeHighlight: AuctionSlot | null;
  activeHighlights: AuctionSlot[];
  isLoading: boolean;
  error: string | null;

  fetchActiveAuction: () => Promise<void>;
  placeBid: (auctionId: string, channelId: string, amount: number) => Promise<void>;
  createAuction: (data: {
    title: string;
    durationMinutes: number;
    minBid: number;
    bidIncrement: number;
    highlightDurationMinutes: number;
  }) => Promise<void>;
  setActiveAuction: (auction: Auction | null) => void;
  setActiveHighlight: (highlight: AuctionSlot | null) => void;
  setActiveHighlights: (highlights: AuctionSlot[]) => void;
}

export const useAuctionStore = create<AuctionState>((set, get) => ({
  activeAuction: null,
  activeHighlight: null,
  activeHighlights: [],
  isLoading: false,
  error: null,

  fetchActiveAuction: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<{ auction: Auction | null; highlights: AuctionSlot[] | null }>('/auctions/active');
      const highlights = data.highlights || [];
      set({
        activeAuction: data.auction,
        activeHighlights: highlights,
        activeHighlight: highlights[0] || null,
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao buscar leilão ativo', isLoading: false });
    }
  },

  placeBid: async (auctionId, channelId, amount) => {
    set({ error: null });
    try {
      await apiFetch(`/auctions/${auctionId}/bid`, {
        method: 'POST',
        body: JSON.stringify({ channelId, amount }),
      });
      await get().fetchActiveAuction();
    } catch (err: any) {
      set({ error: err.message || 'Erro ao efetuar lance' });
      throw err;
    }
  },

  createAuction: async (data) => {
    set({ error: null });
    try {
      await apiFetch('/admin/auctions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await get().fetchActiveAuction();
    } catch (err: any) {
      set({ error: err.message || 'Erro ao criar leilão' });
      throw err;
    }
  },

  setActiveAuction: (auction) => set({ activeAuction: auction }),
  setActiveHighlight: (highlight) => set({ activeHighlight: highlight }),
  setActiveHighlights: (highlights) => set({ activeHighlights: highlights, activeHighlight: highlights[0] || null }),
}));
