import { invoke } from '@tauri-apps/api/core';

// Helper to check if running inside Tauri webview
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function saveSecureToken(token: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('save_secure_token', { token });
    } catch (err) {
      console.error('[TokenService] Failed to save token in Tauri keyring:', err);
      // Fallback
      localStorage.setItem('session_token', token);
    }
  } else {
    localStorage.setItem('session_token', token);
  }
}

export async function getSecureToken(): Promise<string> {
  if (isTauri()) {
    try {
      return await invoke<string>('get_secure_token');
    } catch (err) {
      console.error('[TokenService] Failed to get token from Tauri keyring:', err);
      // Fallback
      return localStorage.getItem('session_token') || '';
    }
  } else {
    return localStorage.getItem('session_token') || '';
  }
}

export async function deleteSecureToken(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('delete_secure_token');
    } catch (err) {
      console.error('[TokenService] Failed to delete token from Tauri keyring:', err);
    }
  }
  localStorage.removeItem('session_token');
}

export async function fetchLocalKickChannelInfo(slug: string): Promise<{ isLive: boolean; viewers: number }> {
  if (isTauri()) {
    try {
      const info = await invoke<{ is_live: boolean; viewers: number }>('get_kick_channel_info', { slug });
      return { isLive: info.is_live, viewers: info.viewers };
    } catch (err) {
      console.error('[TokenService] Failed to fetch channel info via Tauri:', err);
    }
  }

  // Fallback if not in Tauri, or if it failed
  try {
    const res = await fetch(`http://localhost:3001/api/channels/${slug}/status`);
    if (res.ok) {
      const data = await res.json();
      return { isLive: data.isLive, viewers: data.viewers || 0 };
    }
  } catch (err) {
    console.error('[TokenService] Failed fallback channel fetch:', err);
  }

  return { isLive: true, viewers: 0 };
}
