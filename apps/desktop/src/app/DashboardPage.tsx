import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { useChannelStore } from '../stores/channelStore.js';
import { useCoinStore } from '../stores/coinStore.js';
import { useWSStore } from '../stores/wsStore.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import {
  LogOut,
  Coins,
  Radio,
  RefreshCw,
  Plus,
  Trash2,
  Tv,
  Settings,
  X,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigateToAdmin: () => void;
}

export function DashboardPage({ onNavigateToAdmin }: DashboardPageProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const { channels, isLoading: channelsLoading, fetchChannels, addChannel, removeChannel } = useChannelStore();
  const { balance, fetchBalance } = useCoinStore();
  const { status: wsStatus, connect: wsConnect, disconnect: wsDisconnect } = useWSStore();

  const [newChannelSlug, setNewChannelSlug] = useState('');
  const [filterSlug, setFilterSlug] = useState<string>('all');
  const [adding, setAdding] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);


  // 1. WebSocket & Initial fetches
  useEffect(() => {
    wsConnect();
    fetchChannels();
    fetchBalance();

    const fetchInterval = setInterval(() => {
      fetchChannels();
      fetchBalance();
    }, 45 * 1000); // refresh metadata every 45s

    return () => {
      clearInterval(fetchInterval);
      wsDisconnect();
    };
  }, [wsConnect, wsDisconnect, fetchChannels, fetchBalance]);

  // 2. Identify channels to watch (live and active)
  const liveChannels = useMemo(() => {
    return channels.filter((c) => c.isActive && c.isLive);
  }, [channels]);

  // 3. Staggered Heartbeat Loop for all live channels visible to the user
  const activeChannelIdsToWatch = useMemo(() => {
    // If filtering to a specific channel, only heartbeat for that one
    if (filterSlug !== 'all') {
      const selected = liveChannels.find((c) => c.slug === filterSlug);
      return selected ? [selected.id] : [];
    }
    return liveChannels.map((c) => c.id);
  }, [liveChannels, filterSlug]);

  useHeartbeat({
    activeChannelIds: activeChannelIdsToWatch,
    enabled: wsStatus === 'connected' && activeChannelIdsToWatch.length > 0,
    intervalSeconds: 30,
  });

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelSlug) return;
    setAdding(true);
    try {
      await addChannel(newChannelSlug);
      setNewChannelSlug('');
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar canal');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveChannel = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja remover o canal ${name}?`)) {
      try {
        await removeChannel(id);
        if (expandedSlug === name) setExpandedSlug(null);
      } catch (err: any) {
        alert(err.message || 'Erro ao remover canal');
      }
    }
  };

  // Filter channels to display in the main grid
  const visibleChannels = useMemo(() => {
    const active = channels.filter((c) => c.isActive);
    if (filterSlug === 'all') return active;
    return active.filter((c) => c.slug === filterSlug);
  }, [channels, filterSlug]);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';

  return (
    <div className="app-container">
      {/* HEADER NAVBAR */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <Radio size={24} color="#8b5cf6" className="pulse" />
          <h1 style={styles.brandTitle}>LurkSquad</h1>
          <span style={{ ...styles.wsBadge, color: wsStatus === 'connected' ? '#10b981' : '#f59e0b' }}>
            ● {wsStatus === 'connected' ? 'Servidor Conectado' : 'Conectando...'}
          </span>
        </div>

        <div style={styles.navActions}>
          {/* Coins Display */}
          <div style={styles.coinsDisplay}>
            <Coins size={18} color="#f59e0b" />
            <span style={styles.coinBalance}>{balance} moedas</span>
          </div>

          {/* Admin Panel Link */}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary"
              style={styles.navBtn}
              onClick={onNavigateToAdmin}
            >
              <Settings size={15} />
              Administração
            </button>
          )}

          {/* User profile mini card */}
          <div style={styles.userMini}>
            <span style={styles.userDisplay}>{user?.displayName}</span>
            <span style={styles.userRoleBadge}>{user?.role}</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ ...styles.navBtn, borderColor: 'rgba(239, 68, 68, 0.2)' }}
            onClick={() => void logout()}
          >
            <LogOut size={15} color="#ef4444" />
            Sair
          </button>
        </div>
      </header>

      {/* DASHBOARD BODY */}
      <div style={styles.body}>
        {/* SIDEBAR */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h3 style={styles.sidebarTitle}>Canais Permitidos ({channels.filter(c => c.isActive).length})</h3>
            <button
              type="button"
              style={styles.sidebarRefresh}
              onClick={() => {
                fetchChannels();
                fetchBalance();
              }}
              disabled={channelsLoading}
            >
              <RefreshCw size={14} className={channelsLoading ? 'spin' : ''} />
            </button>
          </div>

          {/* Add Channel Form (Admins Only) */}
          {isAdmin && (
            <form onSubmit={handleAddChannel} style={styles.addForm}>
              <input
                className="input-field"
                style={styles.addInput}
                type="text"
                placeholder="Slug Kick (ex: leokaos)"
                value={newChannelSlug}
                onChange={(e) => setNewChannelSlug(e.target.value)}
                disabled={adding}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={styles.addBtn}
                disabled={adding || !newChannelSlug}
              >
                <Plus size={16} />
              </button>
            </form>
          )}

          {/* Channels list */}
          <div style={styles.sidebarList}>
            <button
              type="button"
              style={{
                ...styles.channelItem,
                background: filterSlug === 'all' ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                borderColor: filterSlug === 'all' ? 'var(--color-primary-glow)' : 'transparent',
              }}
              onClick={() => setFilterSlug('all')}
            >
              <Tv size={15} color="#8b5cf6" />
              <span style={{ fontWeight: filterSlug === 'all' ? 600 : 400 }}>Ver Todas as Lives</span>
              {liveChannels.length > 0 && (
                <span style={styles.liveCountBadge}>{liveChannels.length} ON</span>
              )}
            </button>

            {channels
              .filter((c) => c.isActive)
              .map((channel) => (
                <div key={channel.id} style={styles.channelItemWrapper}>
                  <button
                    type="button"
                    style={{
                      ...styles.channelItem,
                      background: filterSlug === channel.slug ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                      borderColor: filterSlug === channel.slug ? 'var(--color-primary-glow)' : 'transparent',
                      flex: 1,
                    }}
                    onClick={() => setFilterSlug(channel.slug)}
                  >
                    {channel.avatarUrl ? (
                      <img src={channel.avatarUrl} alt={channel.slug} style={styles.avatar} />
                    ) : (
                      <div style={styles.avatarFallback}>{channel.slug[0].toUpperCase()}</div>
                    )}
                    <div style={styles.channelMeta}>
                      <span style={styles.channelName}>{channel.displayName || channel.slug}</span>
                      {channel.isLive ? (
                        <span style={styles.liveSubText}>{channel.category || 'Streaming'}</span>
                      ) : (
                        <span style={styles.offlineSubText}>offline</span>
                      )}
                    </div>
                    {channel.isLive && <div className="live-dot" />}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      style={styles.deleteBtn}
                      onClick={() => handleRemoveChannel(channel.id, channel.slug)}
                      title="Deletar canal"
                    >
                      <Trash2 size={13} color="#ef4444" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        </aside>

        {/* MAIN EMBEDS GRID */}
        <main style={styles.mainGrid}>
          {visibleChannels.length === 0 ? (
            <div style={styles.emptyGrid}>
              <Tv size={48} color="#4b5563" style={{ marginBottom: '1rem' }} />
              <h3>Nenhum canal ativo</h3>
              <p>Adicione slugs no menu lateral para iniciar o LurkSquad.</p>
            </div>
          ) : (
            <div style={expandedSlug ? styles.expandedGrid : styles.grid}>
              {visibleChannels.map((channel) => {
                const isExpanded = expandedSlug === channel.slug;
                
                // If expanded mode is active and this card is NOT the expanded card, hide it
                if (expandedSlug && !isExpanded) return null;

                return (
                  <div
                    key={channel.id}
                    className="glass-card"
                    style={{
                      ...styles.card,
                      gridColumn: isExpanded ? '1 / -1' : 'auto',
                      gridRow: isExpanded ? '1 / -1' : 'auto',
                      borderColor: channel.isLive ? 'rgba(16, 185, 129, 0.2)' : 'var(--border-color)',
                    }}
                  >
                    {/* Card Header */}
                    <div style={styles.cardHeader}>
                      <div style={styles.cardInfo}>
                        {channel.avatarUrl ? (
                          <img src={channel.avatarUrl} alt="" style={styles.avatarMini} />
                        ) : (
                          <div style={styles.avatarFallbackMini}>{channel.slug[0].toUpperCase()}</div>
                        )}
                        <div>
                          <h4 style={styles.cardTitle}>{channel.displayName || channel.slug}</h4>
                          {channel.isLive && (
                            <span style={styles.cardCategory}>{channel.category || 'Live'}</span>
                          )}
                        </div>
                      </div>

                      <div style={styles.cardActions}>
                        {channel.isLive && (
                          <div className="live-indicator">
                            <span className="live-dot" />
                            <span>{channel.viewers} Assistindo</span>
                          </div>
                        )}

                        <button
                          type="button"
                          style={styles.cardActionBtn}
                          onClick={() => setExpandedSlug(isExpanded ? null : channel.slug)}
                          title={isExpanded ? 'Minimizar tela' : 'Maximizar tela'}
                        >
                          {isExpanded ? <X size={14} /> : <Tv size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Stream Embed Player Area */}
                    <div style={styles.playerContainer}>
                      {channel.isLive ? (
                        <iframe
                          src={`https://player.kick.com/${channel.slug}?autoplay=true&muted=true`}
                          style={styles.iframe}
                          frameBorder="0"
                          scrolling="no"
                          allowFullScreen={false}
                        />
                      ) : (
                        <div style={styles.offlinePlaceholder}>
                          <Tv size={36} color="#4b5563" style={{ marginBottom: '0.5rem' }} />
                          <span>Stream offline</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    {channel.isLive && (
                      <div style={styles.cardFooter}>
                        <span style={styles.farmingAlert}>
                          🪙 Ganhando moedas a cada minuto assistido...
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  header: {
    height: '64px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1.5rem',
    background: 'rgba(10, 10, 15, 0.8)',
    backdropFilter: 'var(--glass-blur)',
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  brandTitle: {
    fontSize: '1.25rem',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #fff, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.02em',
  },
  wsBadge: {
    fontSize: '0.75rem',
    fontWeight: 600,
    marginLeft: '0.75rem',
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '0.25rem 0.5rem',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  coinsDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    padding: '0.45rem 0.85rem',
    borderRadius: 'var(--radius-md)',
  },
  coinBalance: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f59e0b',
  },
  navBtn: {
    padding: '0.45rem 0.85rem',
    fontSize: '0.8rem',
    gap: '0.4rem',
  },
  userMini: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    borderRight: '1px solid var(--border-color)',
    paddingRight: '1rem',
  },
  userDisplay: {
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  userRoleBadge: {
    fontSize: '0.65rem',
    color: '#8b5cf6',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  body: {
    display: 'flex',
    flex: 1,
    height: 'calc(100vh - 64px)',
    overflow: 'hidden',
  },
  sidebar: {
    width: '280px',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'rgba(18, 18, 30, 0.4)',
    backdropFilter: 'var(--glass-blur)',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1rem',
    borderBottom: '1px solid var(--border-color)',
  },
  sidebarTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f3f4f6',
  },
  sidebarRefresh: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    outline: 'none',
  },
  addForm: {
    padding: '1rem',
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '1px solid var(--border-color)',
  },
  addInput: {
    flex: 1,
    padding: '0.45rem 0.75rem',
    fontSize: '0.8rem',
  },
  addBtn: {
    padding: '0 0.75rem',
  },
  sidebarList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  channelItemWrapper: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative' as const,
  },
  channelItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid transparent',
    color: '#d1d5db',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'var(--transition-fast)',
    background: 'transparent',
    outline: 'none',
  },
  avatar: {
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  avatarFallback: {
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#8b5cf6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  channelMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
  },
  channelName: {
    fontSize: '0.825rem',
    fontWeight: 600,
    color: '#e5e7eb',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  liveSubText: {
    fontSize: '0.7rem',
    color: '#10b981',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  offlineSubText: {
    fontSize: '0.7rem',
    color: '#6b7280',
  },
  liveCountBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#10b981',
    padding: '0.15rem 0.35rem',
    borderRadius: '4px',
    marginLeft: 'auto',
  },
  deleteBtn: {
    position: 'absolute' as const,
    right: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '4px',
    opacity: 0,
    transition: 'opacity 0.15s ease',
    outline: 'none',
  },
  // Show delete button on hover
  channelItemWrapperHover: {
    '&:hover button': {
      opacity: 1,
    },
  },
  mainGrid: {
    flex: 1,
    padding: '1.5rem',
    overflowY: 'auto' as const,
    background: 'rgba(10, 10, 15, 0.2)',
  },
  emptyGrid: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1.25rem',
  },
  expandedGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    height: '100%',
  },
  card: {
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'rgba(18, 18, 30, 0.5)',
    height: '100%',
    minHeight: '260px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  cardInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    overflow: 'hidden',
  },
  avatarMini: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
  },
  avatarFallbackMini: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#8b5cf6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  cardTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f3f4f6',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardCategory: {
    fontSize: '0.7rem',
    color: '#8b5cf6',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  cardActionBtn: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    outline: 'none',
    '&:hover': {
      color: '#f3f4f6',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
  },
  playerContainer: {
    flex: 1,
    background: '#000',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative' as const,
    aspectRatio: '16/9',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  offlinePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: '#4b5563',
    fontSize: '0.8rem',
  },
  cardFooter: {
    marginTop: '0.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  farmingAlert: {
    fontSize: '0.7rem',
    color: '#10b981',
    fontWeight: 600,
  },
};
