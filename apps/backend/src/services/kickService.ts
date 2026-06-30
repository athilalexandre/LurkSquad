import { prisma } from './db.js';

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

export async function fetchKickChannel(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase().replace(/^@/, '');
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

    const isLive = !!livestream;
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
    console.warn(`[KickService] Falha ao consultar API para '${slug}' (provável bloqueio de Cloudflare):`, error);
    
    // Graceful fallback: assume the channel exists and is live so the frontend iframe can load it
    return {
      slug: normalizedSlug,
      displayName: slug,
      avatarUrl: '',
      isLive: true,
      notFound: false,
      title: 'Watch Party',
      category: 'Kick Stream',
      viewers: 0,
      chatroomId: undefined,
    };
  }
}

export async function syncActiveChannels() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
  });

  const results = [];
  for (const channel of channels) {
    try {
      const info = await fetchKickChannel(channel.slug);
      
      if (info.notFound) {
        results.push({
          ...channel,
          isLive: false,
          status: 'offline',
          viewers: 0,
          title: '',
          category: '',
        });
        continue;
      }

      // Update DB if avatar or display name changed (and we got real data)
      if (info.avatarUrl || info.displayName !== channel.slug) {
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            avatarUrl: info.avatarUrl || channel.avatarUrl,
            displayName: info.displayName || channel.displayName,
          },
        });
      }

      results.push({
        ...channel,
        ...info,
        status: info.isLive ? 'live' : 'offline',
      });
    } catch (error) {
      results.push({
        ...channel,
        isLive: false,
        status: 'error',
        viewers: 0,
        title: '',
        category: '',
      });
    }
  }

  return results;
}
