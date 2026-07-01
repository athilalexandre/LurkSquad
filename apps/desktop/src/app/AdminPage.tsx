import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api.js';
import {
  Users,
  Coins,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  UserCheck,
  UserX,
  FileSpreadsheet,
  AlertTriangle,
  ShoppingBag,
  Settings,
  X,
  Flag
} from 'lucide-react';

interface AdminPageProps {
  onNavigateBack: () => void;
}

interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED' | 'SUSPENDED';
  plan?: 'STANDARD' | 'VIP';
  flagColor?: string;
  infractionCount?: number;
  suspendedUntil?: string | null;
  createdAt: string;
  coinBalance?: {
    balance: number;
    reserved: number;
  };
}

interface LedgerEntry {
  id: string;
  userId: string;
  user: {
    username: string;
    displayName: string;
  };
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  createdAt: string;
  actor: {
    username: string;
  };
  target?: {
    username: string;
  } | null;
  details?: any;
}

interface CoinPurchase {
  id: string;
  userId: string;
  user: {
    username: string;
    displayName: string;
  };
  packageId?: string | null;
  package?: {
    name: string;
  } | null;
  type: 'COINS' | 'VIP';
  coins: number;
  priceCents: number;
  proofUrl: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  createdAt: string;
}

export function AdminPage({ onNavigateBack }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [purchases, setPurchases] = useState<CoinPurchase[]>([]);
  
  const [activeTab, setActiveTab] = useState<'users' | 'coins' | 'audit' | 'auctions' | 'shop' | 'config'>('users');
  const [loading, setLoading] = useState(false);

  // AppConfig State
  const [coinsPerMinute, setCoinsPerMinute] = useState('1');
  const [vipMultiplier, setVipMultiplier] = useState('2');
  const [inactivityThresholdHours, setInactivityThresholdHours] = useState('24');
  const [vipPriceCents, setVipPriceCents] = useState('2500');
  const [maxDailyCoins, setMaxDailyCoins] = useState('1000');
  const [channelCheckIntervalSec, setChannelCheckIntervalSec] = useState('300');

  // PIX Config State
  const [pixKeyType, setPixKeyType] = useState('email');
  const [pixKeyValue, setPixKeyValue] = useState('');
  const [pixHolderName, setPixHolderName] = useState('');

  // Coin Adjustment Form State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Auction Form State
  const [auctionTitle, setAuctionTitle] = useState('');
  const [auctionDuration, setAuctionDuration] = useState('10');
  const [auctionMinBid, setAuctionMinBid] = useState('50');
  const [auctionIncrement, setAuctionIncrement] = useState('10');
  const [auctionHighlightDuration, setAuctionHighlightDuration] = useState('60');
  const [auctionLoading, setAuctionLoading] = useState(false);

  // Manual Flag State
  const [flaggedUserId, setFlaggedUserId] = useState<string | null>(null);
  const [flagColor, setFlagColor] = useState<'yellow' | 'orange' | 'red'>('yellow');
  const [flagReason, setFlagReason] = useState('');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const usersData = await apiFetch<{ users: AdminUser[] }>('/admin/users');
      setUsers(usersData.users);

      const ledgerData = await apiFetch<{ transactions: LedgerEntry[] }>('/admin/coins/ledger');
      setLedger(ledgerData.transactions);

      const auditData = await apiFetch<{ logs: AuditLogEntry[] }>('/admin/audit-logs');
      setAuditLogs(auditData.logs);

      // Load shop purchases
      const purchasesData = await apiFetch<{ purchases: CoinPurchase[] }>('/admin/shop/purchases');
      setPurchases(purchasesData.purchases);

      // Load PIX settings
      const pixData = await apiFetch<any>('/shop/pix');
      setPixKeyType(pixData.keyType);
      setPixKeyValue(pixData.keyValue);
      setPixHolderName(pixData.holderName);

      // Load AppConfig
      const configs = await apiFetch<{ packages: any[]; vipPriceCents: number; vipDurationDays: number }>('/shop/packages');
      // We can also fetch the actual AppConfig object if we define an admin endpoint. Or we edit/save configs directly.
      setVipPriceCents(configs.vipPriceCents.toString());
    } catch (err) {
      console.error('Erro ao buscar dados do administrador:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleCreateAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auctionTitle) return;
    setAuctionLoading(true);
    try {
      await apiFetch('/admin/auctions', {
        method: 'POST',
        body: JSON.stringify({
          title: auctionTitle,
          durationMinutes: parseInt(auctionDuration),
          minBid: parseInt(auctionMinBid),
          bidIncrement: parseInt(auctionIncrement),
          highlightDurationMinutes: parseInt(auctionHighlightDuration),
        }),
      });
      alert('Leilão criado com sucesso e ativado!');
      setAuctionTitle('');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar leilão');
    } finally {
      setAuctionLoading(false);
    }
  };

  const handleToggleUserPlan = async (userId: string, currentPlan: 'STANDARD' | 'VIP') => {
    const nextPlan = currentPlan === 'STANDARD' ? 'VIP' : 'STANDARD';
    try {
      await apiFetch(`/admin/users/${userId}/plan`, {
        method: 'PUT',
        body: JSON.stringify({ plan: nextPlan }),
      });
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar plano do usuário');
    }
  };

  const handleUserStatusChange = async (userId: string, action: 'approve' | 'reject' | 'ban' | 'unban') => {
    if (!confirm(`Deseja aplicar a ação "${action}" no usuário?`)) return;

    try {
      await apiFetch(`/admin/users/${userId}/${action}`, { method: 'POST' });
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status do usuário');
    }
  };

  const handleAdjustCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !adjustAmount || !adjustReason) return;

    setAdjustLoading(true);
    setAdjustSuccess(null);
    setAdjustError(null);

    try {
      const amountInt = parseInt(adjustAmount, 10);
      if (isNaN(amountInt) || amountInt === 0) {
        throw new Error('A quantidade deve ser um número inteiro diferente de zero.');
      }

      await apiFetch('/admin/coins/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUserId,
          amount: amountInt,
          reason: adjustReason,
        }),
      });

      setAdjustSuccess('Ajuste de moedas realizado com sucesso!');
      setAdjustAmount('');
      setAdjustReason('');
      await fetchAdminData();
    } catch (err: any) {
      setAdjustError(err.message || 'Falha ao ajustar moedas');
    } finally {
      setAdjustLoading(false);
    }
  };

  // Confirm PIX purchase
  const handleConfirmPurchase = async (purchaseId: string) => {
    if (!confirm('Tem certeza de que deseja aprovar este pagamento e creditar os benefícios?')) return;
    try {
      await apiFetch(`/admin/shop/purchases/${purchaseId}/confirm`, { method: 'POST' });
      alert('Compra aprovada e liberada com sucesso!');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao confirmar compra');
    }
  };

  // Reject PIX purchase
  const handleRejectPurchase = async (purchaseId: string) => {
    if (!confirm('Deseja rejeitar este pedido de compra?')) return;
    try {
      await apiFetch(`/admin/shop/purchases/${purchaseId}/reject`, { method: 'POST' });
      alert('Compra rejeitada.');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao rejeitar compra');
    }
  };

  // Save Config settings
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/config', {
        method: 'PUT',
        body: JSON.stringify({
          coinsPerMinute: parseFloat(coinsPerMinute),
          vipMultiplier: parseFloat(vipMultiplier),
          inactivityThresholdHours: parseInt(inactivityThresholdHours),
          vipPriceCents: parseInt(vipPriceCents),
          maxDailyCoins: parseInt(maxDailyCoins),
          channelCheckIntervalSec: parseInt(channelCheckIntervalSec),
        })
      });
      alert('Configurações atualizadas!');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações');
    }
  };

  // Save PIX settings
  const handleSavePix = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/shop/pix', {
        method: 'PUT',
        body: JSON.stringify({
          keyType: pixKeyType,
          keyValue: pixKeyValue,
          holderName: pixHolderName,
        })
      });
      alert('Dados PIX atualizados com sucesso!');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar dados PIX');
    }
  };

  // Manual Flag / Warning
  const handleApplyFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggedUserId || !flagReason) return;
    try {
      const res = await apiFetch<any>(`/admin/users/${flaggedUserId}/flag`, {
        method: 'POST',
        body: JSON.stringify({
          color: flagColor,
          reason: flagReason,
        })
      });
      alert(res.message || 'Flag de infração aplicada com sucesso!');
      setFlaggedUserId(null);
      setFlagReason('');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao aplicar flag');
    }
  };

  const handleClearFlags = async (userId: string) => {
    if (!confirm('Deseja redefinir as flags de infração deste usuário para VERDE e liberar suspensões?')) return;
    try {
      await apiFetch(`/admin/users/${userId}/unflag`, { method: 'POST' });
      alert('Flags de infração limpas e acesso restaurado!');
      await fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir flags');
    }
  };

  return (
    <div className="app-container" style={styles.container}>
      {/* HEADER NAVBAR */}
      <header style={styles.header}>
        <div style={styles.headerTitleArea}>
          <button type="button" style={styles.backBtn} onClick={onNavigateBack}>
            <ArrowLeft size={16} />
            <span>Voltar ao Grid</span>
          </button>
          <div style={styles.divider} />
          <div style={styles.headerTitle}>
            <ShieldCheck size={20} color="#8b5cf6" />
            <h2>Painel de Controle Admin</h2>
          </div>
        </div>

        <button type="button" className="btn btn-secondary" style={styles.refreshBtn} onClick={fetchAdminData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Sincronizar Dados
        </button>
      </header>

      {/* ADMIN TABS & CONTENT */}
      <div style={styles.content}>
        {/* TABS SELECTOR */}
        <div style={styles.tabsHeader}>
          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'users' ? '#8b5cf6' : 'transparent', color: activeTab === 'users' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('users')}
          >
            <Users size={16} />
            Usuários e Moderadores
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'coins' ? '#8b5cf6' : 'transparent', color: activeTab === 'coins' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('coins')}
          >
            <Coins size={16} />
            Ajustar Moedas
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'shop' ? '#8b5cf6' : 'transparent', color: activeTab === 'shop' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('shop')}
          >
            <ShoppingBag size={16} />
            Aprovações PIX / Loja
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'auctions' ? '#8b5cf6' : 'transparent', color: activeTab === 'auctions' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('auctions')}
          >
            <ShieldCheck size={16} />
            Gerenciar Leilões
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'config' ? '#8b5cf6' : 'transparent', color: activeTab === 'config' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('config')}
          >
            <Settings size={16} />
            Configurações Globais
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'audit' ? '#8b5cf6' : 'transparent', color: activeTab === 'audit' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('audit')}
          >
            <FileSpreadsheet size={16} />
            Logs de Auditoria
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div style={styles.tabPane}>
          {loading && (
            <div style={styles.loadingOverlay}>
              <RefreshCw size={24} className="spin" color="#8b5cf6" />
              <span>Carregando dados...</span>
            </div>
          )}

          {/* TAB 1: USER LIST & MODERATION */}
          {activeTab === 'users' && (
            <div style={styles.pane}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableTh}>Nome / Username</th>
                    <th style={styles.tableTh}>E-mail</th>
                    <th style={styles.tableTh}>Nível</th>
                    <th style={styles.tableTh}>Plano</th>
                    <th style={styles.tableTh}>Status Acesso</th>
                    <th style={styles.tableTh}>Warning Flag</th>
                    <th style={styles.tableTh}>Saldo</th>
                    <th style={styles.tableTh}>Ações de Moderação</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={styles.tableRow}>
                      <td style={styles.tableTd}>
                        <div style={styles.userMain}>
                          <span style={styles.userDisplay}>{u.displayName}</span>
                          <span style={styles.userSub}>@{u.username}</span>
                        </div>
                      </td>
                      <td style={styles.tableTd}>{u.email}</td>
                      <td style={styles.tableTd}>
                        <span style={{ ...styles.roleBadge, color: u.role === 'OWNER' || u.role === 'ADMIN' ? '#8b5cf6' : '#9ca3af' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={styles.tableTd}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            color: u.plan === 'VIP' ? '#f59e0b' : '#9ca3af',
                            borderColor: u.plan === 'VIP' ? 'rgba(245,158,11,0.3)' : 'var(--border-color)',
                          }}
                          onClick={() => handleToggleUserPlan(u.id, u.plan || 'STANDARD')}
                        >
                          {u.plan === 'VIP' ? '🌟 VIP' : 'Standard'}
                        </button>
                      </td>
                      <td style={styles.tableTd}>
                        <span style={{
                          ...styles.statusBadge,
                          color: u.status === 'APPROVED' ? '#10b981' : u.status === 'PENDING' ? '#f59e0b' : '#ef4444',
                          background: u.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.1)' : u.status === 'PENDING' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }}>
                          {u.status}
                        </span>
                      </td>
                      <td style={styles.tableTd}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>
                            {u.flagColor === 'yellow' ? '🟡' : u.flagColor === 'orange' ? '🟠' : u.flagColor === 'red' ? '🔴' : '🟢'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            ({u.infractionCount || 0}/3)
                          </span>
                        </div>
                      </td>
                      <td style={styles.tableTd}>{u.coinBalance?.balance ?? 0} 🪙</td>
                      <td style={styles.tableTd}>
                        <div style={styles.actionGroup}>
                          {u.status === 'PENDING' && (
                            <>
                              <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#10b981' }} onClick={() => handleUserStatusChange(u.id, 'approve')}>
                                <UserCheck size={14} /> Aprovar
                              </button>
                              <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#ef4444' }} onClick={() => handleUserStatusChange(u.id, 'reject')}>
                                <UserX size={14} /> Rejeitar
                              </button>
                            </>
                          )}
                          {u.status === 'APPROVED' && u.role !== 'OWNER' && (
                            <>
                              <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#fbbf24' }} onClick={() => setFlaggedUserId(u.id)}>
                                <Flag size={13} style={{ marginRight: 4 }} /> Flag Warning
                              </button>
                              <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#ef4444' }} onClick={() => handleUserStatusChange(u.id, 'ban')}>
                                Banir
                              </button>
                            </>
                          )}
                          {u.status === 'SUSPENDED' && (
                            <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#10b981' }} onClick={() => handleClearFlags(u.id)}>
                              Limpar Flags / Reativar
                            </button>
                          )}
                          {u.status === 'BANNED' && (
                            <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#10b981' }} onClick={() => handleUserStatusChange(u.id, 'unban')}>
                              Desbanir
                            </button>
                          )}
                          {u.role === 'OWNER' && (
                            <span style={styles.actionDisabled}>Sem Ação (Owner)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Apply Manual Flag Modal/Form Overlay */}
              {flaggedUserId && (
                <div style={styles.modalOverlay}>
                  <div style={styles.modalCard} className="glass-card">
                    <div style={styles.modalHeader}>
                      <h3 style={styles.modalTitle}>Aplicar Flag de Infração Manual</h3>
                      <button type="button" style={styles.closeBtn} onClick={() => setFlaggedUserId(null)}>
                        <X size={18} />
                      </button>
                    </div>
                    <form onSubmit={handleApplyFlag} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Cor da Flag (Nível)</label>
                        <select
                          className="input-field"
                          value={flagColor}
                          onChange={(e: any) => setFlagColor(e.target.value)}
                        >
                          <option value="yellow">🟡 Amarela (24h de suspensão)</option>
                          <option value="orange">🟠 Laranja (48h de suspensão)</option>
                          <option value="red">🔴 Vermelha (72h de suspensão)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Motivo da Infração</label>
                        <textarea
                          className="input-field"
                          style={{ minHeight: '80px', padding: '0.5rem' }}
                          placeholder="Ex: Farm de moedas suspeito ou inatividade prolongada"
                          value={flagReason}
                          onChange={(e) => setFlagReason(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                        Aplicar Infração e Suspender
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COINS ADJUSTMENT */}
          {activeTab === 'coins' && (
            <div style={styles.coinsSplit}>
              {/* Form Side */}
              <div className="glass-card" style={styles.formCard}>
                <h3 style={styles.formTitle}>Ajustar Saldo Manualmente</h3>
                <p style={styles.formSubtitle}>Cada transação alterará o saldo e será registrada de forma auditável no ledger.</p>

                {adjustSuccess && <div style={styles.successBox}>{adjustSuccess}</div>}
                {adjustError && <div style={styles.errorBox}>{adjustError}</div>}

                <form onSubmit={handleAdjustCoins}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="user-select">
                      Usuário Alvo
                    </label>
                    <select
                      id="user-select"
                      className="input-field"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                    >
                      <option value="">Selecione um usuário...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} (@{u.username}) - {u.coinBalance?.balance ?? 0} moedas
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="coin-amount">
                      Quantidade de Moedas (Use negativo para remover)
                    </label>
                    <input
                      id="coin-amount"
                      className="input-field"
                      type="number"
                      placeholder="Ex: 500 ou -200"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="adjust-reason">
                      Motivo / Justificativa
                    </label>
                    <input
                      id="adjust-reason"
                      className="input-field"
                      type="text"
                      placeholder="Ex: Compra manual ou prêmio de evento"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={styles.formBtn}
                    disabled={adjustLoading}
                  >
                    {adjustLoading ? 'Processando ajuste...' : 'Realizar Ajuste de Saldo'}
                  </button>
                </form>
              </div>

              {/* Ledger Side */}
              <div style={styles.ledgerArea}>
                <h3 style={styles.formTitle}>Extrato Recente do Ledger</h3>
                <div style={styles.ledgerList}>
                  {ledger.map((entry) => (
                    <div key={entry.id} style={styles.ledgerRow}>
                      <div style={styles.ledgerRowLeft}>
                        <strong>@{entry.user.displayName}</strong>
                        <span style={styles.ledgerReason}>{entry.reason || 'Ajuste do sistema'}</span>
                      </div>
                      <div style={styles.ledgerRowRight}>
                        <span style={{
                          ...styles.ledgerAmount,
                          color: entry.amount > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                        </span>
                        <span style={styles.ledgerDate}>Novo: {entry.balanceAfter} 🪙</span>
                      </div>
                    </div>
                  ))}
                  {ledger.length === 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                      Nenhuma transação registrada no ledger.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SHOP PURCHASES APPROVAL & PIX CONFIG */}
          {activeTab === 'shop' && (
            <div style={styles.coinsSplit}>
              {/* Left Side: PIX Setup */}
              <div className="glass-card" style={styles.formCard}>
                <h3 style={styles.formTitle}>Configurar Chave PIX da Loja</h3>
                <p style={styles.formSubtitle}>Atualize os dados bancários para onde os usuários farão as transferências PIX.</p>
                <form onSubmit={handleSavePix} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Tipo de Chave</label>
                    <select
                      className="input-field"
                      value={pixKeyType}
                      onChange={(e) => setPixKeyType(e.target.value)}
                    >
                      <option value="email">E-mail</option>
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                      <option value="phone">Telefone</option>
                      <option value="random">Chave Aleatória</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor da Chave</label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Ex: suporte@lurksquad.com"
                      value={pixKeyValue}
                      onChange={(e) => setPixKeyValue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nome do Titular da Conta</label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Ex: LurkSquad Serviços Digitais LTDA"
                      value={pixHolderName}
                      onChange={(e) => setPixHolderName(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                    Salvar Dados PIX
                  </button>
                </form>
              </div>

              {/* Right Side: Purchases requests */}
              <div style={styles.ledgerArea}>
                <h3 style={styles.formTitle}>Solicitações de Compra Pendentes/Aprovadas</h3>
                <div style={styles.ledgerList}>
                  {purchases.map((pur) => (
                    <div key={pur.id} style={{ ...styles.ledgerRow, borderLeft: pur.status === 'PENDING' ? '3px solid #f59e0b' : 'none' }}>
                      <div style={styles.ledgerRowLeft}>
                        <strong>@{pur.user.displayName}</strong>
                        <span style={styles.ledgerReason}>
                          {pur.type === 'VIP' ? 'Compra de plano VIP' : `Pacote ${pur.coins} moedas`} (R$ {(pur.priceCents/100).toFixed(2)})
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                          Comprovante: <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{pur.proofUrl}</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {pur.status === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                              onClick={() => handleConfirmPurchase(pur.id)}
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: '#ef4444' }}
                              onClick={() => handleRejectPurchase(pur.id)}
                            >
                              Recusar
                            </button>
                          </div>
                        ) : (
                          <span style={{
                            ...styles.statusBadge,
                            color: pur.status === 'CONFIRMED' ? '#10b981' : '#ef4444',
                            backgroundColor: pur.status === 'CONFIRMED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          }}>
                            {pur.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {purchases.length === 0 && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                      Nenhum pedido de compra enviado.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GERENCIAR LEILÕES */}
          {activeTab === 'auctions' && (
            <div style={styles.pane}>
              <div className="glass-card" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={styles.formTitle}>Iniciar Novo Leilão Manual</h3>
                <p style={styles.formSubtitle}>O leilão 24/7 funciona automaticamente, mas você pode usar esta ferramenta para forçar o início de um leilão de destaque com configurações específicas.</p>

                <form onSubmit={handleCreateAuction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auc-title">Título / Edição do Leilão</label>
                    <input
                      id="auc-title"
                      className="input-field"
                      type="text"
                      placeholder="Ex: Super Vitrine Lurk - Edição Especial"
                      value={auctionTitle}
                      onChange={(e) => setAuctionTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="auc-dur">Duração (Minutos)</label>
                      <input
                        id="auc-dur"
                        className="input-field"
                        type="number"
                        value={auctionDuration}
                        onChange={(e) => setAuctionDuration(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="auc-min">Lance Mínimo (Moedas)</label>
                      <input
                        id="auc-min"
                        className="input-field"
                        type="number"
                        value={auctionMinBid}
                        onChange={(e) => setAuctionMinBid(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="auc-inc">Incremento Mínimo (Moedas)</label>
                      <input
                        id="auc-inc"
                        className="input-field"
                        type="number"
                        value={auctionIncrement}
                        onChange={(e) => setAuctionIncrement(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="auc-hld">Tempo de Vitrine (Minutos)</label>
                      <input
                        id="auc-hld"
                        className="input-field"
                        type="number"
                        value={auctionHighlightDuration}
                        onChange={(e) => setAuctionHighlightDuration(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '1rem' }} disabled={auctionLoading}>
                    {auctionLoading ? 'Criando leilão...' : 'Criar e Forçar Início de Leilão'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: CONFIGURAÇÕES GLOBAIS */}
          {activeTab === 'config' && (
            <div style={styles.pane}>
              <div className="glass-card" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={styles.formTitle}>Variáveis do Ecossistema</h3>
                <p style={styles.formSubtitle}>Edite os parâmetros de economia do app. Estas variáveis serão sincronizadas em tempo real.</p>
                <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Moedas por minuto</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.1"
                        value={coinsPerMinute}
                        onChange={(e) => setCoinsPerMinute(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Multiplicador VIP</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.1"
                        value={vipMultiplier}
                        onChange={(e) => setVipMultiplier(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Limite diário de moedas</label>
                      <input
                        className="input-field"
                        type="number"
                        value={maxDailyCoins}
                        onChange={(e) => setMaxDailyCoins(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Limite de Inatividade (Horas)</label>
                      <input
                        className="input-field"
                        type="number"
                        value={inactivityThresholdHours}
                        onChange={(e) => setInactivityThresholdHours(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Valor do VIP PIX (Centavos)</label>
                      <input
                        className="input-field"
                        type="number"
                        value={vipPriceCents}
                        onChange={(e) => setVipPriceCents(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sync de canais (Segundos)</label>
                      <input
                        className="input-field"
                        type="number"
                        value={channelCheckIntervalSec}
                        onChange={(e) => setChannelCheckIntervalSec(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '1rem' }}>
                    Atualizar Variáveis Globais
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div style={styles.pane}>
              <div style={styles.auditDisclaimer}>
                <AlertTriangle size={15} />
                <span>Todos os logs de auditoria são imutáveis e salvos na SQLite do backend.</span>
              </div>
              <div style={styles.ledgerList}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={styles.ledgerRow}>
                    <div style={styles.ledgerRowLeft}>
                      <strong>Ação: {log.action}</strong>
                      <span style={styles.ledgerReason}>
                        Realizado por: @{log.actor?.username || 'Sistema'} 
                        {log.target && ` -> Alvo: @${log.target.username}`}
                      </span>
                    </div>
                    <div style={styles.ledgerRowRight}>
                      <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      {log.details && (
                        <span style={{ fontSize: '0.65rem', color: '#a78bfa', fontFamily: 'monospace' }}>
                          {JSON.stringify(log.details)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                    Nenhum log de auditoria encontrado.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    backgroundColor: '#0a0a0f',
  },
  header: {
    height: '64px',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1.5rem',
    background: 'rgba(10, 10, 15, 0.8)',
    backdropFilter: 'var(--glass-blur)',
  },
  headerTitleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    outline: 'none',
  },
  divider: {
    height: '20px',
    width: '1px',
    backgroundColor: 'var(--border-color)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  refreshBtn: {
    padding: '0.45rem 0.85rem',
    fontSize: '0.8rem',
    gap: '0.4rem',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  tabsHeader: {
    display: 'flex',
    borderBottom: '1px solid var(--border-color)',
    background: 'rgba(18, 18, 30, 0.4)',
    padding: '0 1.5rem',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '1rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    outline: 'none',
    transition: 'var(--transition-fast)',
  },
  tabPane: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1.5rem',
    position: 'relative' as const,
  },
  pane: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    zIndex: 100,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    textAlign: 'left' as const,
  },
  tableHeaderRow: {
    borderBottom: '2px solid var(--border-color)',
  },
  tableTh: {
    padding: '0.75rem 1rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tableRow: {
    borderBottom: '1px solid var(--border-color)',
    background: 'rgba(255, 255, 255, 0.01)',
  },
  tableTd: {
    padding: '0.75rem 1rem',
    fontSize: '0.85rem',
  },
  userMain: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  userDisplay: {
    fontWeight: 600,
    color: '#fff',
  },
  userSub: {
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  roleBadge: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
  },
  statusBadge: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    textTransform: 'uppercase' as const,
  },
  actionGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionBtn: {
    padding: '0.3rem 0.6rem',
    fontSize: '0.75rem',
  },
  actionDisabled: {
    fontSize: '0.75rem',
    color: '#4b5563',
  },
  coinsSplit: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.5fr',
    gap: '1.5rem',
    alignItems: 'start',
  },
  formCard: {
    padding: '1.5rem',
  },
  formTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
    color: '#fff',
  },
  formSubtitle: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    marginBottom: '1.5rem',
    lineHeight: '1.4',
  },
  formBtn: {
    width: '100%',
    justifyContent: 'center',
    marginTop: '0.5rem',
  },
  successBox: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    borderRadius: '8px',
    fontSize: '0.85rem',
    marginBottom: '1rem',
  },
  errorBox: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '0.85rem',
    marginBottom: '1rem',
  },
  ledgerArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  ledgerList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  ledgerRow: {
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerRowLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.15rem',
  },
  ledgerReason: {
    fontSize: '0.8rem',
    color: '#d1d5db',
  },
  ledgerRowRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
  },
  ledgerAmount: {
    fontSize: '0.9rem',
    fontWeight: 700,
  },
  ledgerDate: {
    fontSize: '0.7rem',
    color: '#6b7280',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalCard: {
    width: '90%',
    maxWidth: '440px',
    padding: '1.5rem',
    backgroundColor: '#0c0c14',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
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
    fontSize: '1rem',
    fontWeight: 700,
    color: '#fff',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  auditDisclaimer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.65rem 0.85rem',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    borderRadius: '6px',
    color: '#f59e0b',
    fontSize: '0.8rem',
    marginBottom: '1rem',
  },
};
