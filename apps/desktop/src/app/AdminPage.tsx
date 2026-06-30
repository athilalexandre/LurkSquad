import { useEffect, useState } from 'react';
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'BANNED';
  plan?: 'STANDARD' | 'VIP';
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

export function AdminPage({ onNavigateBack }: AdminPageProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  
  const [activeTab, setActiveTab] = useState<'users' | 'coins' | 'audit' | 'auctions'>('users');
  const [loading, setLoading] = useState(false);

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
      const usersData = await apiFetch<{ users: AdminUser[] }>('/admin/users');
      setUsers(usersData.users);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar plano do usuário');
    }
  };

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const usersData = await apiFetch<{ users: AdminUser[] }>('/admin/users');
      setUsers(usersData.users);

      const ledgerData = await apiFetch<{ transactions: LedgerEntry[] }>('/admin/coins/ledger');
      setLedger(ledgerData.transactions);

      const auditData = await apiFetch<{ logs: AuditLogEntry[] }>('/admin/audit-logs');
      setAuditLogs(auditData.logs);
    } catch (err) {
      console.error('Erro ao buscar dados do administrador:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

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
            Usuários e Aprovações
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'coins' ? '#8b5cf6' : 'transparent', color: activeTab === 'coins' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('coins')}
          >
            <Coins size={16} />
            Ajustar Moedas (Ledger)
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'audit' ? '#8b5cf6' : 'transparent', color: activeTab === 'audit' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('audit')}
          >
            <FileSpreadsheet size={16} />
            Logs de Auditoria
          </button>

          <button
            type="button"
            style={{ ...styles.tabBtn, borderBottomColor: activeTab === 'auctions' ? '#8b5cf6' : 'transparent', color: activeTab === 'auctions' ? '#fff' : '#9ca3af' }}
            onClick={() => setActiveTab('auctions')}
          >
            <ShieldCheck size={16} />
            Gerenciar Leilões
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

          {/* TAB 1: USER LIST & APPROVALS */}
          {activeTab === 'users' && (
            <div style={styles.pane}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableTh}>Nome / Username</th>
                    <th style={styles.tableTh}>E-mail</th>
                    <th style={styles.tableTh}>Nível (Role)</th>
                    <th style={styles.tableTh}>Plano</th>
                    <th style={styles.tableTh}>Status Acesso</th>
                    <th style={styles.tableTh}>Moedas (Saldo)</th>
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
                            <button type="button" className="btn btn-secondary" style={{ ...styles.actionBtn, color: '#ef4444' }} onClick={() => handleUserStatusChange(u.id, 'ban')}>
                              Banir Usuário
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
            </div>
          )}

          {/* TAB 2: COINS ADJUSTMENT & LEDGER */}
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
                    <label className="form-label" htmlFor="user-select">Selecionar Usuário</label>
                    <select
                      id="user-select"
                      className="input-field"
                      style={styles.select}
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                    >
                      <option value="">Escolha um usuário...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} (@{u.username}) — Saldo: {u.coinBalance?.balance ?? 0}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="amount">Quantidade (moedas)</label>
                    <input
                      id="amount"
                      className="input-field"
                      type="number"
                      placeholder="Ex: 50 para adicionar, -50 para remover"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reason">Justificativa / Motivo</label>
                    <input
                      id="reason"
                      className="input-field"
                      type="text"
                      placeholder="Ex: Recompensa por bug, Ajuste manual"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={styles.submitBtn} disabled={adjustLoading || !selectedUserId || !adjustAmount || !adjustReason}>
                    {adjustLoading ? 'Processando ajuste...' : 'Confirmar Lançamento'}
                  </button>
                </form>
              </div>

              {/* Ledger Side */}
              <div style={styles.ledgerArea}>
                <h3 style={styles.formTitle}>Ledger de Transações (Extrato)</h3>
                <div style={styles.tableScrollWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeaderRow}>
                        <th style={styles.tableTh}>Usuário</th>
                        <th style={styles.tableTh}>Tipo</th>
                        <th style={styles.tableTh}>Quantidade</th>
                        <th style={styles.tableTh}>Saldo Pós</th>
                        <th style={styles.tableTh}>Razão / Histórico</th>
                        <th style={styles.tableTh}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((entry) => (
                        <tr key={entry.id} style={styles.tableRow}>
                          <td style={styles.tableTd}>{entry.user.displayName}</td>
                          <td style={styles.tableTd}>
                            <span style={{
                              ...styles.typeBadge,
                              color: entry.type === 'EARNED' ? '#10b981' : entry.type === 'ADMIN_ADJUST' ? '#8b5cf6' : '#ef4444'
                            }}>
                              {entry.type}
                            </span>
                          </td>
                          <td style={{ ...styles.tableTd, fontWeight: 700, color: entry.amount > 0 ? '#10b981' : '#ef4444' }}>
                            {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                          </td>
                          <td style={styles.tableTd}>{entry.balanceAfter}</td>
                          <td style={styles.tableTd}>{entry.reason || '—'}</td>
                          <td style={styles.tableTd}>{new Date(entry.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div style={styles.pane}>
              <div style={styles.auditDisclaimer}>
                <AlertTriangle size={16} color="#f59e0b" />
                <span>Essas ações gravam logs definitivos e não podem ser apagados pelo cliente.</span>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableTh}>Executor (Actor)</th>
                    <th style={styles.tableTh}>Ação</th>
                    <th style={styles.tableTh}>Alvo (Target)</th>
                    <th style={styles.tableTh}>Metadados / Detalhes</th>
                    <th style={styles.tableTh}>Data de Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={styles.tableRow}>
                      <td style={styles.tableTd}>@{log.actor.username}</td>
                      <td style={{ ...styles.tableTd, fontWeight: 600 }}>{log.action}</td>
                      <td style={styles.tableTd}>{log.target ? `@${log.target.username}` : 'Global'}</td>
                      <td style={styles.tableTd}>{log.details ? JSON.stringify(log.details) : '—'}</td>
                      <td style={styles.tableTd}>{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: LEILÕES */}
          {activeTab === 'auctions' && (
            <div style={styles.pane}>
              <div className="glass-card" style={styles.formCard}>
                <h3 style={styles.formTitle}>Iniciar Novo Leilão</h3>
                <p style={styles.formSubtitle}>Crie um leilão de destaque de canal em tempo real para os usuários competirem.</p>

                <form onSubmit={handleCreateAuction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="auc-title">Título do Leilão</label>
                    <input
                      id="auc-title"
                      className="input-field"
                      type="text"
                      placeholder="Ex: Destaque da Noite - Hora de Pico!"
                      value={auctionTitle}
                      onChange={(e) => setAuctionTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="auc-dur">Duração (minutos)</label>
                      <input
                        id="auc-dur"
                        className="input-field"
                        type="number"
                        value={auctionDuration}
                        onChange={(e) => setAuctionDuration(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="auc-hl">Duração do Destaque (minutos)</label>
                      <input
                        id="auc-hl"
                        className="input-field"
                        type="number"
                        value={auctionHighlightDuration}
                        onChange={(e) => setAuctionHighlightDuration(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="auc-min">Lance Mínimo Inicial</label>
                      <input
                        id="auc-min"
                        className="input-field"
                        type="number"
                        value={auctionMinBid}
                        onChange={(e) => setAuctionMinBid(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="auc-inc">Incremento Mínimo</label>
                      <input
                        id="auc-inc"
                        className="input-field"
                        type="number"
                        value={auctionIncrement}
                        onChange={(e) => setAuctionIncrement(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                    disabled={auctionLoading || !auctionTitle}
                  >
                    {auctionLoading ? 'Criando...' : 'Iniciar Leilão'}
                  </button>
                </form>
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
    height: '100vh',
    width: '100vw',
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
    width: '1px',
    height: '20px',
    backgroundColor: 'var(--border-color)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.95rem',
    color: '#f3f4f6',
  },
  refreshBtn: {
    fontSize: '0.8rem',
    padding: '0.45rem 0.85rem',
    gap: '0.45rem',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '1.5rem',
    overflow: 'hidden',
  },
  tabsHeader: {
    display: 'flex',
    gap: '1rem',
    borderBottom: '1px solid var(--border-color)',
    marginBottom: '1rem',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '0.75rem 0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#9ca3af',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    outline: 'none',
    transition: 'var(--transition-fast)',
  },
  tabPane: {
    flex: 1,
    position: 'relative' as const,
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.7)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    zIndex: 5,
  },
  pane: {
    padding: '0.5rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    textAlign: 'left' as const,
    fontSize: '0.875rem',
  },
  tableHeaderRow: {
    borderBottom: '1px solid var(--border-color)',
  },
  tableTh: {
    padding: '0.75rem 1rem',
    fontWeight: 600,
    color: '#9ca3af',
    fontSize: '0.8rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tableRow: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.01)',
    },
  },
  tableTd: {
    padding: '1rem',
    color: '#e5e7eb',
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
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  statusBadge: {
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
  },
  actionGroup: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionBtn: {
    padding: '0.35rem 0.65rem',
    fontSize: '0.75rem',
    gap: '0.35rem',
  },
  actionDisabled: {
    fontSize: '0.75rem',
    color: '#4b5563',
    fontStyle: 'italic',
  },
  coinsSplit: {
    display: 'grid',
    gridTemplateColumns: '380px 1fr',
    gap: '1.5rem',
    height: '100%',
    alignItems: 'start',
  },
  formCard: {
    padding: '1.5rem',
  },
  formTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    marginBottom: '0.35rem',
  },
  formSubtitle: {
    fontSize: '0.75rem',
    color: '#6b7280',
    lineHeight: '1.4',
    marginBottom: '1.25rem',
  },
  select: {
    width: '100%',
    background: '#12121e',
    cursor: 'pointer',
  },
  submitBtn: {
    width: '100%',
    marginTop: '0.75rem',
  },
  successBox: {
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: '6px',
    color: '#10b981',
    fontSize: '0.75rem',
    marginBottom: '1rem',
  },
  errorBox: {
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '0.75rem',
    marginBottom: '1rem',
  },
  ledgerArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    minHeight: 0,
  },
  tableScrollWrapper: {
    flex: 1,
    overflowY: 'auto' as const,
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    background: 'rgba(18, 18, 30, 0.2)',
  },
  typeBadge: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
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
