import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { apiFetch, setMemoryAccessToken } from '../services/api.js';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'OWNER';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  error: string | null;
  
  initialize: () => Promise<void>;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<string>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isInitializing: true,
  error: null,

  clearError: () => set({ error: null }),

  initialize: async () => {
    set({ isInitializing: true, error: null });
    try {
      // Check if secure refresh token exists in keychain
      const refreshToken = await invoke<string>('get_secure_token');
      
      if (!refreshToken) {
        set({ isInitializing: false, isAuthenticated: false, user: null });
        return;
      }

      // Hit refresh endpoint to get accessToken
      const res = await fetch('http://localhost:3001/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        // Token must be expired or invalid
        await invoke('delete_secure_token');
        set({ isInitializing: false, isAuthenticated: false, user: null });
        return;
      }

      const { accessToken } = await res.json();
      setMemoryAccessToken(accessToken);

      // Fetch profile details
      const profile = await apiFetch<{ user: User }>('/auth/me');
      set({
        user: profile.user,
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch (err) {
      console.error('Falha ao inicializar autenticação:', err);
      set({ isInitializing: false, isAuthenticated: false, user: null });
    }
  },

  login: async (usernameOrEmail, password) => {
    set({ error: null });
    try {
      const data = await apiFetch<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail, password }),
        skipAuth: true,
      });

      setMemoryAccessToken(data.accessToken);
      await invoke('save_secure_token', { token: data.refreshToken });

      set({
        user: data.user,
        isAuthenticated: true,
      });
    } catch (err: any) {
      set({ error: err.message || 'Falha ao autenticar' });
      throw err;
    }
  },

  register: async (email, username, displayName, password) => {
    set({ error: null });
    try {
      const data = await apiFetch<{ message: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, displayName, password }),
        skipAuth: true,
      });

      return data.message;
    } catch (err: any) {
      set({ error: err.message || 'Falha ao realizar cadastro' });
      throw err;
    }
  },

  logout: async () => {
    try {
      const refreshToken = await invoke<string>('get_secure_token');
      if (refreshToken) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
          skipAuth: true,
        }).catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      await invoke('delete_secure_token');
      setMemoryAccessToken(null);
      set({
        user: null,
        isAuthenticated: false,
      });
    }
  },
}));
