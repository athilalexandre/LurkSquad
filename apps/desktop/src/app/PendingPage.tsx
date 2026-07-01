import { useAuthStore } from '../stores/authStore.js';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';

function SuspensionCountdown({ suspendedUntil }: { suspendedUntil: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const diff = new Date(suspendedUntil).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Sua suspensão terminou! Clique em "Atualizar Status".');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`Faltam ${hours}h ${minutes}m ${seconds}s para liberar sua conta.`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [suspendedUntil]);

  return (
    <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '1rem', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
      {timeLeft}
    </div>
  );
}

export function PendingPage() {
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const logout = useAuthStore((state) => state.logout);
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    await initialize();
    setChecking(false);
  };

  const getStatusTextAndColor = () => {
    switch (user?.status) {
      case 'REJECTED':
        return {
          title: 'Cadastro Rejeitado',
          description: 'Seu cadastro foi rejeitado pelo administrador. Entre em contato se achar que isso foi um engano.',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.1)',
        };
      case 'BANNED':
        return {
          title: 'Conta Banida',
          description: 'Sua conta foi banida permanentemente por violar os termos de uso da plataforma.',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.1)',
        };
      case 'SUSPENDED':
        return {
          title: 'Conta Suspensa',
          description: `Sua conta foi suspensa temporariamente devido a inatividade (mais de 24h sem entrar no aplicativo). Cor da sua flag atual: ${user?.flagColor?.toUpperCase()}`,
          color: user?.flagColor === 'red' ? '#ef4444' : user?.flagColor === 'orange' ? '#f97316' : '#f59e0b',
          bg: user?.flagColor === 'red' ? 'rgba(239, 68, 68, 0.1)' : user?.flagColor === 'orange' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(245, 158, 11, 0.1)',
        };
      default:
        return {
          title: 'Aguardando Aprovação',
          description: 'Seu cadastro foi enviado e está aguardando a aprovação manual de um administrador para evitar vazamentos.',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.1)',
        };
    }
  };

  const config = getStatusTextAndColor();

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.header}>
          <div style={{ ...styles.badge, backgroundColor: config.bg, borderColor: `${config.color}33` }}>
            <ShieldAlert size={32} color={config.color} />
          </div>
          <h2 style={styles.title}>{config.title}</h2>
          <p style={styles.desc}>{config.description}</p>
          {user?.status === 'SUSPENDED' && user.suspendedUntil && (
            <SuspensionCountdown suspendedUntil={user.suspendedUntil} />
          )}
        </div>

        <div style={styles.userCard}>
          <span style={styles.userLabel}>Usuário conectado:</span>
          <span style={styles.userName}>{user?.displayName} (@{user?.username})</span>
          <span style={styles.userEmail}>{user?.email}</span>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            style={styles.actionBtn}
            onClick={handleRefresh}
            disabled={checking}
          >
            <RefreshCw size={16} className={checking ? 'spin' : ''} />
            {checking ? 'Verificando...' : 'Atualizar Status'}
          </button>
          
          <button
            type="button"
            className="btn btn-secondary"
            style={styles.actionBtn}
            onClick={() => void logout()}
            disabled={checking}
          >
            <LogOut size={16} />
            Sair da Conta
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    padding: '2.5rem 2rem',
    textAlign: 'center' as const,
  },
  header: {
    marginBottom: '2rem',
  },
  badge: {
    display: 'inline-flex',
    padding: '1rem',
    borderRadius: '16px',
    border: '1px solid',
    marginBottom: '1.25rem',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
  },
  desc: {
    fontSize: '0.875rem',
    color: '#9ca3af',
    lineHeight: '1.5',
  },
  userCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '10px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '2rem',
  },
  userLabel: {
    fontSize: '0.75rem',
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.35rem',
  },
  userName: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#f3f4f6',
  },
  userEmail: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    marginTop: '0.15rem',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  actionBtn: {
    width: '100%',
    gap: '0.5rem',
  },
};
