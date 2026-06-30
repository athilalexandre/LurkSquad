import { create } from 'zustand';
import { apiFetch } from '../services/api.js';

export interface CoinTransaction {
  id: string;
  type: 'EARNED' | 'SPENT' | 'AUCTION_BID' | 'AUCTION_REFUND' | 'ADMIN_ADJUST';
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

interface CoinState {
  balance: number;
  reserved: number;
  transactions: CoinTransaction[];
  isLoading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  updateBalance: (balance: number, reserved?: number) => void;
}

export const useCoinStore = create<CoinState>((set) => ({
  balance: 0,
  reserved: 0,
  transactions: [],
  isLoading: false,
  error: null,

  fetchBalance: async () => {
    try {
      const data = await apiFetch<{ balance: number; reserved: number }>('/coins/balance');
      set({ balance: data.balance, reserved: data.reserved });
    } catch (err: any) {
      console.error('Erro ao buscar saldo:', err);
    }
  },

  fetchHistory: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<{ transactions: CoinTransaction[] }>('/coins/history');
      set({ transactions: data.transactions, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao carregar extrato', isLoading: false });
    }
  },

  updateBalance: (balance, reserved) => {
    set((state) => ({
      balance,
      reserved: reserved !== undefined ? reserved : state.reserved,
    }));
  },
}));
