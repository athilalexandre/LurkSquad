import { prisma } from './db.js';
import { broadcastToAll } from '../ws/handler.js';

interface KickApiChannelResponse {
  slug: string;
  user?: {
    username?: string;
    name?: string;
    profile_pic?: string;
    profilepic?: string;
    avatar?: string;
  };
  user_username?: string;
  username?: string;
  profile_pic?: string;
  is_live?: boolean;
  livestream?: {
    id: number;
    session_title?: string;
    title?: string;
    viewer_count?: number;
    viewers?: number;
    category?: {
      name: string;
      slug: string;
    };
  } | null;
  chatroom?: {
    id: number;
  } | null;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getKickAccessToken() {
  const config = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  if (!config?.kickClientId || !config?.kickClientSecret) {
    return null;
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  try {
    const response = await fetch('https://api.kick.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.kickClientId,
        client_secret: config.kickClientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedToken;
  } catch (error) {
    console.error('[KickService] Failed to fetch App Access Token:', error);
    return null;
  }
}

export async function fetchKickChannel(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase().replace(/^@/, '');
  const token = await getKickAccessToken();

  if (token) {
    try {
      const response = await fetch(`https://api.kick.com/public/v1/channels/${normalizedSlug}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json() as any;
        return {
          slug: normalizedSlug,
          displayName: data.username ?? slug,
          avatarUrl: data.profile_pic ?? '',
          isLive: data.is_live ?? false,
          title: data.livestream?.session_title ?? data.livestream?.title ?? '',
          category: data.livestream?.category?.name ?? '',
          viewers: data.livestream?.viewer_count ?? data.livestream?.viewers ?? 0,
          chatroomId: data.chatroom?.id,
          notFound: false,
        };
      } else if (response.status === 404) {
        return {
          slug: normalizedSlug,
          displayName: slug,
          avatarUrl: '',
          isLive: false,
          notFound: true,
          title: '',
          category: '',
          viewers: 0,
          chatroomId: undefined,
        };
      }
    } catch (err) {
      console.warn(`[KickService] Official API failed for '${slug}':`, err);
    }
  }

  // Fallback to internal API
  const url = `https://kick.com/api/v2/channels/${normalizedSlug}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      return {
        slug: normalizedSlug,
        displayName: slug,
        avatarUrl: '',
        isLive: false,
        notFound: true,
        title: '',
        category: '',
        viewers: 0,
        chatroomId: undefined,
      };
    }

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const data = (await response.json()) as KickApiChannelResponse;

    const livestream = data.livestream;
    const user = data.user;

    const isLive = livestream ? true : (data.is_live ?? false);
    const viewers = livestream?.viewer_count ?? livestream?.viewers ?? 0;
    const title = livestream?.session_title ?? livestream?.title ?? '';
    const category = livestream?.category?.name ?? '';
    
    const avatarUrl = user?.profile_pic ?? user?.profilepic ?? user?.avatar ?? data.profile_pic ?? '';
    const displayName = user?.username ?? user?.name ?? data.user_username ?? data.username ?? slug;

    return {
      slug: normalizedSlug,
      displayName,
      avatarUrl,
      isLive,
      title,
      category,
      viewers,
      chatroomId: data.chatroom?.id,
      notFound: false,
    };
  } catch (error) {
    console.warn(`[KickService] Internal API fallback failed for '${slug}':`, error);
    return {
      slug: normalizedSlug,
      displayName: slug,
      avatarUrl: '',
      isLive: false,
      notFound: false,
      title: '',
      category: '',
      viewers: 0,
      chatroomId: undefined,
    };
  }
}

// Return active channels cached in the database (used by endpoints)
export async function syncActiveChannels() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    include: {
      owner: {
        select: {
          flagColor: true,
          status: true,
        }
      }
    }
  });

  return channels.map(channel => ({
    id: channel.id,
    slug: channel.slug,
    displayName: channel.displayName ?? channel.slug,
    avatarUrl: channel.avatarUrl,
    isActive: channel.isActive,
    isLive: channel.isLive,
    viewers: channel.viewerCount,
    category: channel.isLive ? 'Streaming' : '',
    title: channel.isLive ? 'Live' : '',
    thumbnailUrl: channel.thumbnailUrl,
    owner: channel.owner ? {
      flagColor: channel.owner.flagColor,
      status: channel.owner.status,
    } : null,
  }));
}

// Background sync worker that updates the channels' live status in the database
export async function runBackgroundChannelSync() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
  });

  console.log(`[KickService] Starting background status check for ${channels.length} channels...`);

  let changed = false;
  for (const channel of channels) {
    try {
      const info = await fetchKickChannel(channel.slug);
      
      if (info.notFound) {
        if (channel.isLive) {
          await prisma.channel.update({
            where: { id: channel.id },
            data: { isLive: false, viewerCount: 0, lastCheckedAt: new Date() },
          });
          changed = true;
        }
        continue;
      }

      const isLiveChanged = channel.isLive !== info.isLive;
      const viewerCountChanged = channel.viewerCount !== info.viewers;

      if (isLiveChanged || viewerCountChanged || info.avatarUrl !== channel.avatarUrl || info.displayName !== channel.displayName) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            isLive: info.isLive,
            viewerCount: info.viewers,
            avatarUrl: info.avatarUrl || channel.avatarUrl,
            displayName: info.displayName || channel.displayName,
            thumbnailUrl: info.isLive ? `https://player.kick.com/thumbnails/${channel.slug}` : null,
            lastCheckedAt: new Date(),
          },
        });
        changed = true;
      }
    } catch (err) {
      console.error(`[KickService] Error checking channel ${channel.slug}:`, err);
    }
  }

  if (changed) {
    console.log('[KickService] Channels state changed, broadcasting update...');
    const updatedChannels = await syncActiveChannels();
    broadcastToAll({
      type: 'channels:updated',
      channels: updatedChannels,
    });
  }
}
