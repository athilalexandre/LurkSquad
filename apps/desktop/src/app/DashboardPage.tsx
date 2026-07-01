import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { useChannelStore } from '../stores/channelStore.js';
import { useCoinStore } from '../stores/coinStore.js';
import { useWSStore } from '../stores/wsStore.js';
import { useHeartbeat } from '../hooks/useHeartbeat.js';
import { useAuctionStore } from '../stores/auctionStore.js';
import { apiFetch } from '../services/api.js';
import {
  LogOut,
  Coins,
  Radio,
  RefreshCw,
  Tv,
  Settings,
  X,
  ShoppingBag,
  AlertCircle,
  Award,
  Check,
  Shield,
  Star
} from 'lucide-react';

function AuctionTimer({ endsAt, onExpire }: { endsAt: string; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const difference = new Date(endsAt).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft('Encerrado');
        onExpire();
        return;
      }
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onExpire]);

  return <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{timeLeft}</span>;
}

export function DashboardPage({ onNavigateToAdmin }: { onNavigateToAdmin: () => void }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const { channels, fetchChannels } = useChannelStore();
  const { balance, fetchBalance } = useCoinStore();
  const { status: wsStatus, connect: wsConnect } = useWSStore();
  const { activeAuction, activeHighlights, fetchActiveAuction, placeBid: storePlaceBid } = useAuctionStore();

  const [manuallySelectedChannel, setManuallySelectedChannel] = useState<any>(null);
  const [rotatedChannel, setRotatedChannel] = useState<any>(null);

  // Leilão State
  const [bidChannelId, setBidChannelId] = useState('');
  const [bidAmount, setBidAmount] = useState(0);
  const [bidLoading, setBidLoading] = useState(false);

  // Shop Modal State
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopPackages, setShopPackages] = useState<any[]>([]);
  const [vipPriceCents, setVipPriceCents] = useState(2500);
  const [pixConfig, setPixConfig] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);

  // Checkout state
  const [selectedProduct, setSelectedProduct] = useState<{ type: 'COINS' | 'VIP'; packageId?: string; coins?: number; priceCents: number } | null>(null);
  const [proofText, setProofText] = useState('');
  const [purchaseStatusMsg, setPurchaseStatusMsg] = useState<string | null>(null);

  // 1. Fetch initial data
  useEffect(() => {
    wsConnect();
    fetchChannels();
    fetchBalance();
    fetchActiveAuction();

    const fetchInterval = setInterval(() => {
      fetchChannels();
      fetchBalance();
      fetchActiveAuction();
    }, 45 * 1000); // refresh every 45s

    return () => clearInterval(fetchInterval);
  }, [wsConnect, fetchChannels, fetchBalance, fetchActiveAuction]);

  // 2. Fetch Shop Details when open
  useEffect(() => {
    if (isShopOpen) {
      const loadShop = async () => {
        try {
          const pkgsData = await apiFetch<{ packages: any[]; vipPriceCents: number }>('/shop/packages');
          setShopPackages(pkgsData.packages);
          setVipPriceCents(pkgsData.vipPriceCents);

          const pixData = await apiFetch<any>('/shop/pix');
          setPixConfig(pixData);

          const purchData = await apiFetch<{ purchases: any[] }>('/shop/purchases');
          setPurchases(purchData.purchases);
        } catch (err) {
          console.error('Erro ao carregar loja:', err);
        }
      };
      loadShop();
    }
  }, [isShopOpen]);

  // 3. Other active channels that are live (excluding the vitrines)
  const otherLiveChannels = useMemo(() => {
    const highlightIds = new Set((activeHighlights || []).map(h => h.channelId));
    return channels.filter(c => c.isActive && c.isLive && !highlightIds.has(c.id));
  }, [channels, activeHighlights]);

  // 4. Handle 5-minute rotation timer for other live channels
  useEffect(() => {
    const rotate = () => {
      if (otherLiveChannels.length > 0) {
        const randomIndex = Math.floor(Math.random() * otherLiveChannels.length);
        setRotatedChannel(otherLiveChannels[randomIndex]);
      } else {
        setRotatedChannel(null);
      }
    };

    rotate();
    const interval = setInterval(rotate, 5 * 60 * 1000); // 5 minutes rotation
    return () => clearInterval(interval);
  }, [otherLiveChannels]);

  // 5. Active stream calculations
  const activeStream = useMemo(() => {
    if (manuallySelectedChannel) return manuallySelectedChannel;
    if (rotatedChannel) return rotatedChannel;
    // Fallback to first active highlight channel
    if (activeHighlights.length > 0 && activeHighlights[0]?.channel?.isLive) {
      return activeHighlights[0].channel;
    }
    return null;
  }, [manuallySelectedChannel, rotatedChannel, activeHighlights]);

  // 6. Staggered Heartbeats for active playing channels on client UI
  const activeChannelIdsToWatch = useMemo(() => {
    const ids = new Set<string>();
    
    // Add main playing channel
    if (activeStream && activeStream.isLive) {
      ids.add(activeStream.id);
    }
    
    // Add all 5 vitrines playing at bottom
    for (const slot of activeHighlights) {
      if (slot.channel && slot.channel.isLive) {
        ids.add(slot.channel.id);
      }
    }
    
    return Array.from(ids);
  }, [activeStream, activeHighlights]);

  useHeartbeat({
    activeChannelIds: activeChannelIdsToWatch,
    enabled: wsStatus === 'connected' && activeChannelIdsToWatch.length > 0,
    intervalSeconds: 30,
  });

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAuction) return;
    if (!bidChannelId) {
      alert('Selecione um canal para destacar');
      return;
    }
    if (!bidAmount) {
      alert('Insira o valor do lance');
      return;
    }

    setBidLoading(true);
    try {
      await storePlaceBid(activeAuction.id, bidChannelId, bidAmount);
      setBidAmount(0);
      alert('Lance efetuado com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao dar lance');
    } finally {
      setBidLoading(false);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !proofText) return;

    try {
      const res = await apiFetch<any>('/shop/purchase', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedProduct.type,
          packageId: selectedProduct.packageId,
          proofUrl: proofText,
        })
      });

      setPurchaseStatusMsg(res.message);
      setProofText('');
      setSelectedProduct(null);
      // Reload purchases
      const purchData = await apiFetch<{ purchases: any[] }>('/shop/purchases');
      setPurchases(purchData.purchases);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar compra');
    }
  };

  const flagColorEmoji = (color: string) => {
    switch (color) {
      case 'yellow': return '🟡';
      case 'orange': return '🟠';
      case 'red': return '🔴';
      default: return '🟢';
    }
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';

  return (
    <div className="app-container" style={styles.appContainer}>
      {/* HEADER NAVBAR */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <Radio size={24} color="#8b5cf6" className="pulse" />
          <div>
            <h1 style={styles.brandTitle}>LurkSquad</h1>
            <span style={{ fontSize: '0.65rem', color: wsStatus === 'connected' ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
              ● {wsStatus === 'connected' ? 'LIVE SYNC' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* VITRINES E ROTAÇÃO CIRCULAR */}
        <div style={styles.circlesRow}>
          {/* Active Vitrines Slots (always 5 slots shown) */}
          {Array.from({ length: 5 }).map((_, index) => {
            const slot = activeHighlights[index];
            const isPlaying = activeStream?.id === slot?.channelId;

            return (
              <div
                key={index}
                style={{
                  ...styles.circleWrapper,
                  transform: isPlaying ? 'scale(1.1)' : 'scale(1)',
                }}
                onClick={() => slot && setManuallySelectedChannel(slot.channel)}
              >
                {slot ? (
                  <div
                    style={{
                      ...styles.circle,
                      ...styles.circleVitrine,
                      borderColor: isPlaying ? '#fbbf24' : '#d97706',
                      boxShadow: isPlaying ? '0 0 15px rgba(251, 191, 36, 0.6)' : 'none',
                    }}
                  >
                    {slot.channel.avatarUrl ? (
                      <img src={slot.channel.avatarUrl} alt="" style={styles.circleImg} />
                    ) : (
                      <span style={styles.circleFallback}>{slot.channel.slug[0].toUpperCase()}</span>
                    )}
                    <span style={styles.starBadge}><Star size={10} color="#000" fill="#fff" /></span>
                  </div>
                ) : (
                  <div style={{ ...styles.circle, ...styles.circleEmpty }} title="Vaga de vitrine livre">
                    <span style={styles.circleFallback}>+</span>
                  </div>
                )}
                <span style={styles.circleLabel}>Vaga {index + 1}</span>
              </div>
            );
          })}

          {/* Divider */}
          <div style={styles.rowDivider} />

          {/* Other rotating channels */}
          {otherLiveChannels.slice(0, 4).map((chan) => {
            const isPlaying = activeStream?.id === chan.id;
            return (
              <div
                key={chan.id}
                style={{
                  ...styles.circleWrapper,
                  transform: isPlaying ? 'scale(1.1)' : 'scale(1)',
                }}
                onClick={() => setManuallySelectedChannel(chan)}
              >
                <div
                  style={{
                    ...styles.circle,
                    borderColor: isPlaying ? '#8b5cf6' : '#4b5563',
                    boxShadow: isPlaying ? '0 0 12px rgba(139, 92, 246, 0.5)' : 'none',
                  }}
                >
                  {chan.avatarUrl ? (
                    <img src={chan.avatarUrl} alt="" style={styles.circleImg} />
                  ) : (
                    <span style={styles.circleFallback}>{chan.slug[0].toUpperCase()}</span>
                  )}
                </div>
                <span style={styles.circleLabel}>{chan.displayName || chan.slug}</span>
              </div>
            );
          })}

          {otherLiveChannels.length === 0 && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>Sem outras lives online</span>
          )}
        </div>

        {/* NAV ACTIONS */}
        <div style={styles.navActions}>
          {/* Loja Button */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ ...styles.navBtn, borderColor: 'rgba(139, 92, 246, 0.3)', color: '#a78bfa' }}
            onClick={() => setIsShopOpen(true)}
          >
            <ShoppingBag size={15} />
            Loja Lurk
          </button>

          {/* Coins Display */}
          <div style={styles.coinsDisplay}>
            <Coins size={18} color="#f59e0b" />
            <span style={styles.coinBalance}>{balance}</span>
          </div>

          {/* Profile mini info */}
          <div style={styles.userMini}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>{flagColorEmoji(user?.flagColor ?? 'green')}</span>
              <span style={styles.userDisplay}>{user?.displayName}</span>
              {user?.plan === 'VIP' && (
                <span style={styles.vipBadge}><Award size={10} style={{ marginRight: 2 }} />VIP</span>
              )}
            </div>
            <span style={styles.userRoleBadge}>{user?.role}</span>
          </div>

          {/* Settings / Admin Link */}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary"
              style={styles.navBtn}
              onClick={onNavigateToAdmin}
            >
              <Settings size={15} />
            </button>
          )}

          {/* Logout */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ ...styles.navBtn, borderColor: 'rgba(239, 68, 68, 0.2)' }}
            onClick={() => void logout()}
          >
            <LogOut size={15} color="#ef4444" />
          </button>
        </div>
      </header>

      {/* DASHBOARD BODY */}
      <div style={styles.body}>
        {/* SIDEBAR: LEILÃO E STATUS */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h3 style={styles.sidebarTitle}>Painel do Leilão</h3>
            <button
              type="button"
              style={styles.sidebarRefresh}
              onClick={() => {
                fetchChannels();
                fetchBalance();
                fetchActiveAuction();
              }}
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Leilão Details */}
          {activeAuction ? (
            <div style={styles.sidebarAuctionBox}>
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={styles.auctionTimerLabel}>Fim do Leilão</span>
                <div style={styles.auctionTimerVal}>
                  <AuctionTimer endsAt={activeAuction.endsAt} onExpire={fetchActiveAuction} />
                </div>
                {activeAuction.bidsHidden ? (
                  <span style={styles.blindIndicator}>🔒 Lances Cegos (Ocultos)</span>
                ) : (
                  <span style={styles.revealedIndicator}>👁️ Lances Revelados!</span>
                )}
              </div>

              {/* Bids List */}
              <div style={styles.bidsListContainer}>
                <span style={styles.bidsTitle}>Lances no Top 5</span>
                
                {activeAuction.bidsHidden ? (
                  <div style={styles.blindBidsPlaceholder}>
                    <Shield size={24} color="#6b7280" style={{ marginBottom: '0.5rem' }} />
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                      Os lances estão ocultos até os últimos 10 minutos (XX:40) para evitar sniping.
                    </span>
                    {activeAuction.bids.length > 0 && (
                      <div style={styles.ownBidBox}>
                        <span>Seu lance ativo:</span>
                        <strong>{activeAuction.bids[0].amount} moedas</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={styles.bidsList}>
                    {activeAuction.bids.slice(0, 5).map((bid, i) => (
                      <div key={bid.id} style={styles.bidRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={styles.bidRank}>{i + 1}º</span>
                          <span style={styles.bidUser}>@{bid.user.displayName}</span>
                        </div>
                        <span style={styles.bidAmount}>{bid.amount} moedas</span>
                      </div>
                    ))}
                    {activeAuction.bids.length === 0 && (
                      <span style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                        Sem lances ainda
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Place Bid Form */}
              <form onSubmit={handlePlaceBid} style={styles.sidebarBidForm}>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Canal para Destacar</label>
                  <select
                    className="input-field"
                    style={{ fontSize: '0.8rem', padding: '0.45rem' }}
                    value={bidChannelId}
                    onChange={(e) => setBidChannelId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {channels.filter(c => c.isActive).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.displayName || c.slug}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.7rem' }}>Valor em Moedas</label>
                  <input
                    className="input-field"
                    style={{ fontSize: '0.8rem', padding: '0.45rem' }}
                    type="number"
                    placeholder={`Mínimo ${activeAuction.minBid}`}
                    value={bidAmount || ''}
                    onChange={(e) => setBidAmount(parseInt(e.target.value) || 0)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={bidLoading}
                >
                  {bidLoading ? 'Processando...' : 'Dar Lance Cego'}
                </button>
              </form>
            </div>
          ) : (
            <div style={styles.noAuctionBox}>
              <AlertCircle size={28} color="#6b7280" />
              <span>Sem leilão aberto no momento.</span>
            </div>
          )}
        </aside>

        {/* MAIN EMBED PLAYER AREA */}
        <main style={styles.mainContent}>
          {/* Main stream player */}
          <div style={styles.mainPlayerCard} className="glass-card">
            {activeStream ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Player header */}
                <div style={styles.playerHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="live-dot" />
                    <span style={styles.playerName}>Assistindo: @{activeStream.displayName || activeStream.slug}</span>
                    {activeHighlights.some(h => h.channelId === activeStream.id) && (
                      <span style={styles.playerHighlightTag}>★ Vitrine</span>
                    )}
                  </div>
                  
                  {manuallySelectedChannel && (
                    <button
                      type="button"
                      style={styles.resetRotationBtn}
                      onClick={() => setManuallySelectedChannel(null)}
                      title="Voltar para rotação automática"
                    >
                      <X size={12} style={{ marginRight: 4 }} />
                      Voltar para Rotação (5m)
                    </button>
                  )}
                </div>

                {/* Iframe */}
                <div style={styles.iframeWrapper}>
                  <iframe
                    src={`https://player.kick.com/${activeStream.slug}?autoplay=true&muted=true`}
                    style={styles.mainIframe}
                    frameBorder="0"
                    scrolling="no"
                    allowFullScreen={false}
                  />
                </div>
              </div>
            ) : (
              <div style={styles.noStreamPlaceholder}>
                <Tv size={64} color="#374151" style={{ marginBottom: '1rem' }} />
                <h3>Nenhuma live online no momento</h3>
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                  Os canais cadastrados estão offline ou aguardando sincronização periódica.
                </p>
              </div>
            )}
          </div>

          {/* BOTTOM VITRINES MINI-PLAYERS (The 5 always embedded playing in background) */}
          <div style={styles.vitrinesPanel}>
            <div style={styles.vitrinesPanelHeader}>
              <Award size={14} color="#fbbf24" />
              <span style={styles.vitrinesPanelTitle}>Vitrines Ativas (Rodando em Background para acúmulo de Farm)</span>
            </div>

            <div style={styles.vitrinesGrid}>
              {Array.from({ length: 5 }).map((_, index) => {
                const slot = activeHighlights[index];
                return (
                  <div key={index} style={styles.vitrineMiniCard} className="glass-card">
                    {slot ? (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <span style={styles.vitrineMiniName}>@{slot.channel.displayName || slot.channel.slug}</span>
                        {slot.channel.isLive ? (
                          <div style={{ flex: 1, backgroundColor: '#000', borderRadius: '4px', overflow: 'hidden' }}>
                            <iframe
                              src={`https://player.kick.com/${slot.channel.slug}?autoplay=true&muted=true`}
                              style={{ width: '100%', height: '100%', border: 'none' }}
                              scrolling="no"
                              frameBorder="0"
                            />
                          </div>
                        ) : (
                          <div style={styles.miniOffline}>
                            <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>offline</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={styles.miniEmpty}>
                        <span style={{ fontSize: '0.65rem', color: '#374151' }}>Vaga Livre</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* LOJA MODAL */}
      {isShopOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} className="glass-card">
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={20} color="#a78bfa" />
                <h2 style={styles.modalTitle}>Loja LurkSquad</h2>
              </div>
              <button type="button" style={styles.closeBtn} onClick={() => { setIsShopOpen(false); setSelectedProduct(null); setPurchaseStatusMsg(null); }}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Product Selection */}
              <div style={styles.productsGrid}>
                {/* VIP Card */}
                <div
                  style={{
                    ...styles.productCard,
                    borderColor: selectedProduct?.type === 'VIP' ? '#a78bfa' : 'rgba(255, 255, 255, 0.05)',
                    background: selectedProduct?.type === 'VIP' ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                  }}
                  onClick={() => setSelectedProduct({ type: 'VIP', priceCents: vipPriceCents })}
                >
                  <div style={styles.vipBadgeBig}>VIP</div>
                  <h4 style={styles.productTitle}>Plano VIP 30 dias</h4>
                  <p style={styles.productDesc}>2x mais farm de moedas + Badge dourada + Prioridade de desempate no leilão.</p>
                  <span style={styles.productPrice}>R$ {(vipPriceCents / 100).toFixed(2)}</span>
                </div>

                {/* Coin Packages */}
                {shopPackages.map((pkg) => (
                  <div
                    key={pkg.id}
                    style={{
                      ...styles.productCard,
                      borderColor: selectedProduct?.packageId === pkg.id ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)',
                      background: selectedProduct?.packageId === pkg.id ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                    }}
                    onClick={() => setSelectedProduct({ type: 'COINS', packageId: pkg.id, coins: pkg.coins, priceCents: pkg.priceCents })}
                  >
                    <div style={styles.coinsIconBadge}><Coins size={14} color="#f59e0b" /></div>
                    <h4 style={styles.productTitle}>{pkg.name}</h4>
                    <p style={styles.productDesc}>Adiciona {pkg.coins} moedas na sua carteira para lances de destaque.</p>
                    <span style={styles.productPrice}>R$ {(pkg.priceCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Checkout Form */}
              {selectedProduct && pixConfig && (
                <form onSubmit={handleCreatePurchase} style={styles.checkoutBox}>
                  <h3 style={styles.checkoutTitle}>Instruções de Pagamento via PIX</h3>
                  <div style={styles.pixInfoCard}>
                    <div style={styles.pixRow}>
                      <span>Chave PIX ({pixConfig.keyType.toUpperCase()}):</span>
                      <strong style={{ fontFamily: 'monospace' }}>{pixConfig.keyValue}</strong>
                    </div>
                    <div style={styles.pixRow}>
                      <span>Titular:</span>
                      <strong>{pixConfig.holderName}</strong>
                    </div>
                    <div style={styles.pixRow}>
                      <span>Valor a pagar:</span>
                      <strong style={{ color: '#10b981' }}>R$ {(selectedProduct.priceCents / 100).toFixed(2)}</strong>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label" htmlFor="proof">
                      Comprovante de Pagamento
                    </label>
                    <textarea
                      id="proof"
                      className="input-field"
                      style={{ fontSize: '0.85rem', minHeight: '60px', padding: '0.5rem' }}
                      placeholder="Cole o código do comprovante PIX, hash da transação ou descrição do comprovante enviado."
                      value={proofText}
                      onChange={(e) => setProofText(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }}>
                    Enviar Comprovante para Validação
                  </button>
                </form>
              )}

              {purchaseStatusMsg && (
                <div style={styles.successAlert}>
                  <Check size={18} color="#10b981" />
                  <span>{purchaseStatusMsg}</span>
                </div>
              )}

              {/* Purchase History */}
              <div style={styles.historyContainer}>
                <h3 style={styles.historyTitle}>Seu Histórico de Compras</h3>
                <div style={styles.historyList}>
                  {purchases.map((pur) => (
                    <div key={pur.id} style={styles.historyRow}>
                      <div>
                        <strong>{pur.type === 'VIP' ? 'Plano VIP 30 dias' : `Pacote ${pur.coins} moedas`}</strong>
                        <span style={styles.historyDate}>{new Date(pur.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>R$ {(pur.priceCents / 100).toFixed(2)}</span>
                        <span
                          style={{
                            ...styles.statusBadge,
                            color: pur.status === 'CONFIRMED' ? '#10b981' : pur.status === 'REJECTED' ? '#ef4444' : '#f59e0b',
                            backgroundColor: pur.status === 'CONFIRMED' ? 'rgba(16, 185, 129, 0.1)' : pur.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          }}
                        >
                          {pur.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {purchases.length === 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                      Nenhuma solicitação enviada ainda.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    backgroundColor: '#0a0a0f',
    overflow: 'hidden',
  },
  header: {
    height: '70px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1.5rem',
    background: 'rgba(10, 10, 15, 0.9)',
    backdropFilter: 'var(--glass-blur)',
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
  },
  brandTitle: {
    fontSize: '1.2rem',
    fontWeight: 800,
    background: 'linear-gradient(135deg, #fff, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  circlesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    flex: 1,
    justifyContent: 'center',
    padding: '0 2rem',
    overflowX: 'auto' as const,
  },
  circleWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
  },
  circle: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    position: 'relative' as const,
  },
  circleVitrine: {
    width: '48px',
    height: '48px',
  },
  circleEmpty: {
    borderColor: '#374151',
    borderStyle: 'dashed',
  },
  circleImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  circleFallback: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#9ca3af',
  },
  starBadge: {
    position: 'absolute' as const,
    bottom: '-1px',
    right: '-1px',
    backgroundColor: '#fbbf24',
    borderRadius: '50%',
    padding: '2px',
    display: 'flex',
  },
  circleLabel: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    marginTop: '0.25rem',
    maxWidth: '50px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  rowDivider: {
    height: '24px',
    width: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: '0 0.25rem',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  coinsDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    padding: '0.4rem 0.65rem',
    borderRadius: '8px',
  },
  coinBalance: {
    fontSize: '0.85rem',
    fontWeight: 800,
    color: '#f59e0b',
  },
  navBtn: {
    padding: '0.45rem',
    fontSize: '0.85rem',
  },
  userMini: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    paddingRight: '0.75rem',
  },
  userDisplay: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#f3f4f6',
  },
  userRoleBadge: {
    fontSize: '0.6rem',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  vipBadge: {
    fontSize: '0.6rem',
    backgroundColor: '#fbbf24',
    color: '#000',
    fontWeight: 800,
    padding: '1px 4px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
  },
  body: {
    display: 'flex',
    flex: 1,
    height: 'calc(100vh - 70px)',
    overflow: 'hidden',
  },
  sidebar: {
    width: '280px',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'rgba(10, 10, 15, 0.5)',
    backdropFilter: 'var(--glass-blur)',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem',
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
  sidebarAuctionBox: {
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflowY: 'auto' as const,
  },
  auctionTimerLabel: {
    fontSize: '0.65rem',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  auctionTimerVal: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#ef4444',
  },
  blindIndicator: {
    fontSize: '0.75rem',
    color: '#fbbf24',
    fontWeight: 600,
    marginTop: '0.25rem',
    display: 'block',
  },
  revealedIndicator: {
    fontSize: '0.75rem',
    color: '#10b981',
    fontWeight: 600,
    marginTop: '0.25rem',
    display: 'block',
  },
  bidsListContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    marginBottom: '1rem',
  },
  bidsTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: '0.5rem',
    textTransform: 'uppercase' as const,
  },
  blindBidsPlaceholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    border: '1px dashed rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '1rem',
  },
  ownBidBox: {
    marginTop: '1rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    borderRadius: '6px',
    width: '100%',
    textAlign: 'center' as const,
    fontSize: '0.8rem',
  },
  bidsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
  },
  bidRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
  },
  bidRank: {
    fontSize: '0.75rem',
    fontWeight: 800,
    color: '#a78bfa',
  },
  bidUser: {
    fontSize: '0.8rem',
    color: '#d1d5db',
  },
  bidAmount: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#f59e0b',
  },
  sidebarBidForm: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '1rem',
  },
  noAuctionBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '1.25rem',
    gap: '1.25rem',
    overflowY: 'auto' as const,
  },
  mainPlayerCard: {
    flex: 1,
    minHeight: '380px',
    backgroundColor: 'rgba(10, 10, 15, 0.6)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  playerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  playerName: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f3f4f6',
  },
  playerHighlightTag: {
    fontSize: '0.65rem',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    color: '#fbbf24',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    padding: '1px 6px',
    borderRadius: '4px',
    fontWeight: 700,
  },
  resetRotationBtn: {
    background: 'none',
    border: 'none',
    color: '#a78bfa',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: 0,
  },
  iframeWrapper: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative' as const,
  },
  mainIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
  },
  noStreamPlaceholder: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    padding: '2rem',
  },
  vitrinesPanel: {
    backgroundColor: 'rgba(18, 18, 28, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    padding: '0.85rem',
  },
  vitrinesPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem',
  },
  vitrinesPanelTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#fbbf24',
    textTransform: 'uppercase' as const,
  },
  vitrinesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '0.75rem',
  },
  vitrineMiniCard: {
    height: '100px',
    backgroundColor: 'rgba(10, 10, 15, 0.8)',
    borderRadius: '8px',
    overflow: 'hidden',
    padding: '0.35rem',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  vitrineMiniName: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: '#d1d5db',
    marginBottom: '0.25rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  miniOffline: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  miniEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px dashed rgba(255, 255, 255, 0.05)',
    borderRadius: '4px',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalCard: {
    width: '90%',
    maxWidth: '720px',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    backgroundColor: '#0c0c14',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '0.75rem',
    marginBottom: '1rem',
  },
  modalTitle: {
    fontSize: '1.15rem',
    fontWeight: 800,
    color: '#f3f4f6',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  modalBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  productsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.85rem',
  },
  productCard: {
    border: '1px solid',
    borderRadius: '10px',
    padding: '1rem',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'all 0.15s ease',
  },
  vipBadgeBig: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
    backgroundColor: '#fbbf24',
    color: '#000',
    fontSize: '0.7rem',
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: '4px',
  },
  coinsIconBadge: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
  },
  productTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#f3f4f6',
    marginBottom: '0.25rem',
  },
  productDesc: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    lineHeight: 1.4,
    marginBottom: '0.75rem',
  },
  productPrice: {
    fontSize: '1rem',
    fontWeight: 800,
    color: '#10b981',
  },
  checkoutBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    padding: '1rem',
  },
  checkoutTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f3f4f6',
    marginBottom: '0.5rem',
  },
  pixInfoCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
  },
  pixRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    color: '#d1d5db',
  },
  successAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.8rem',
    color: '#10b981',
  },
  historyContainer: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '1rem',
  },
  historyTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: '0.5rem',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
    maxHeight: '150px',
    overflowY: 'auto' as const,
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
  },
  historyDate: {
    fontSize: '0.65rem',
    color: '#6b7280',
    display: 'block',
  },
  statusBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
  },
};
