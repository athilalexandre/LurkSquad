import { getSecureToken, deleteSecureToken } from './token.js';

const BASE_URL = 'http://localhost:3001/api';

let memoryAccessToken: string | null = null;

export function setMemoryAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getMemoryAccessToken() {
  return memoryAccessToken;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Global fetch wrapper that automatically injects JWT access token
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject Access Token if present
  if (memoryAccessToken && !options.skipAuth) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle Token Refresh on 401
  if (response.status === 401 && !options.skipAuth) {
    fastifyLog('Token expirado (401). Tentando renovar...');
    const refreshed = await tryRefreshTokens();
    if (refreshed) {
      // Retry request with new token
      headers.set('Authorization', `Bearer ${memoryAccessToken}`);
      const retryResponse = await fetch(url, {
        ...options,
        headers,
      });

      if (!retryResponse.ok) {
        const errData = await retryResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Erro de rede: ${retryResponse.status}`);
      }

      return retryResponse.json() as Promise<T>;
    } else {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Erro de rede: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// Function to handle JWT refresh token loop using secure OS keyring
async function tryRefreshTokens(): Promise<boolean> {
  try {
    const refreshToken = await getSecureToken();
    if (!refreshToken) {
      return false;
    }

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      // If refresh failed, delete invalid token
      await deleteSecureToken();
      memoryAccessToken = null;
      return false;
    }

    const data = await res.json();
    memoryAccessToken = data.accessToken;
    return true;
  } catch (error) {
    console.error('Falha ao renovar token:', error);
    return false;
  }
}

function fastifyLog(msg: string) {
  console.log(`[API Client] ${msg}`);
}
