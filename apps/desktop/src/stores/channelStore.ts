import { create } from 'zustand';
import { apiFetch } from '../services/api.js';

export interface Channel {
  id: string;
  slug: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isLive?: boolean;
  status?: 'live' | 'offline' | 'error';
  title?: string;
  category?: string;
  viewers?: number;
}

interface ChannelState {
  channels: Channel[];
  isLoading: boolean;
  error: string | null;
  
  fetchChannels: () => Promise<void>;
  addChannel: (slug: string) => Promise<void>;
  removeChannel: (id: string) => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set) => ({
  channels: [],
  isLoading: false,
  error: null,

  fetchChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiFetch<{ channels: Channel[] }>('/channels');
      set({ channels: data.channels, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao carregar canais', isLoading: false });
    }
  },

  addChannel: async (slug) => {
    set({ error: null });
    try {
      await apiFetch('/channels', {
        method: 'POST',
        body: JSON.stringify({ slug }),
      });
      // Refresh channels list
      const data = await apiFetch<{ channels: Channel[] }>('/channels');
      set({ channels: data.channels });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao adicionar canal' });
      throw err;
    }
  },

  removeChannel: async (id) => {
    set({ error: null });
    try {
      await apiFetch(`/channels/${id}`, {
        method: 'DELETE',
      });
      // Refresh channels list
      const data = await apiFetch<{ channels: Channel[] }>('/channels');
      set({ channels: data.channels });
    } catch (err: any) {
      set({ error: err.message || 'Erro ao remover canal' });
      throw err;
    }
  },
}));
