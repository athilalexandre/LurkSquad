import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { LogIn, Key, User, ShieldAlert } from 'lucide-react';

interface LoginPageProps {
  onNavigateToRegister: () => void;
}

export function LoginPage({ onNavigateToRegister }: LoginPageProps) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail || !password) return;

    setLoading(true);
    try {
      await login(usernameOrEmail, password);
    } catch (err) {
      // Error handled by store
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>
            <LogIn size={28} color="#8b5cf6" />
          </div>
          <h2 style={styles.title}>Entrar no LurkSquad</h2>
          <p style={styles.subtitle}>Watch-party privada e economia interna</p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <ShieldAlert size={18} color="#ef4444" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Usuário ou E-mail
            </label>
            <div style={styles.inputWrapper}>
              <User size={16} style={styles.inputIcon} />
              <input
                id="username"
                className="input-field"
                style={styles.input}
                type="text"
                placeholder="Ex: athilalexandre"
                value={usernameOrEmail}
                onChange={(e) => {
                  clearError();
                  setUsernameOrEmail(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Senha
            </label>
            <div style={styles.inputWrapper}>
              <Key size={16} style={styles.inputIcon} />
              <input
                id="password"
                className="input-field"
                style={styles.input}
                type="password"
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => {
                  clearError();
                  setPassword(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={styles.submitBtn}
            disabled={loading || !usernameOrEmail || !password}
          >
            {loading ? 'Autenticando...' : 'Acessar Plataforma'}
          </button>
        </form>

        <div style={styles.footer}>
          <span>Novo por aqui? </span>
          <button
            type="button"
            onClick={onNavigateToRegister}
            style={styles.linkBtn}
            disabled={loading}
          >
            Criar uma conta
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
    maxWidth: '420px',
    padding: '2.5rem 2rem',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  logoBadge: {
    display: 'inline-flex',
    padding: '0.75rem',
    borderRadius: '12px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    marginBottom: '1rem',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute' as const,
    left: '12px',
    color: '#6b7280',
  },
  input: {
    width: '100%',
    paddingLeft: '36px',
  },
  submitBtn: {
    width: '100%',
    marginTop: '0.75rem',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    fontSize: '0.8rem',
    color: '#ef4444',
    marginBottom: '1.5rem',
  },
  footer: {
    marginTop: '1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#8b5cf6',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
  },
};
