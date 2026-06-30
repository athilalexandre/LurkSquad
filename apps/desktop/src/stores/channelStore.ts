import { create } from 'zustand';
import { apiFetch } from '../services/api.js';
import { fetchLocalKickChannelInfo } from '../services/token.js';

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

      // Fetch actual live information asynchronously for each channel
      data.channels.forEach(async (channel) => {
        if (channel.isActive) {
          try {
            const localInfo = await fetchLocalKickChannelInfo(channel.slug);
            set((state) => ({
              channels: state.channels.map((c) =>
                c.id === channel.id
                  ? {
                      ...c,
                      isLive: localInfo.isLive,
                      viewers: localInfo.viewers,
                      status: localInfo.isLive ? 'live' : 'offline',
                    }
                  : c
              ),
            }));
          } catch (err) {
            console.error(`Erro ao atualizar dados locais do canal ${channel.slug}:`, err);
          }
        }
      });
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
