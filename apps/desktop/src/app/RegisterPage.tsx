import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { UserPlus, Mail, User, Type, Key, ShieldCheck, ShieldAlert, Radio } from 'lucide-react';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

export function RegisterPage({ onNavigateToLogin }: RegisterPageProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [kickSlug, setKickSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !displayName || !password || !kickSlug) return;

    setLoading(true);
    try {
      const msg = await register(email, username, displayName, password, kickSlug);
      setSuccessMessage(msg);
    } catch (err) {
      // Error handled by store
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div style={styles.container}>
        <div className="glass-card" style={styles.card}>
          <div style={styles.header}>
            <div style={styles.successBadge}>
              <ShieldCheck size={28} color="#10b981" />
            </div>
            <h2 style={styles.title}>Cadastro Enviado!</h2>
            <p style={styles.successText}>{successMessage}</p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={styles.submitBtn}
            onClick={onNavigateToLogin}
          >
            Ir para o Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>
            <UserPlus size={28} color="#8b5cf6" />
          </div>
          <h2 style={styles.title}>Criar Cadastro</h2>
          <p style={styles.subtitle}>Junte-se à watch-party privada</p>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <ShieldAlert size={18} color="#ef4444" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">
              E-mail
            </label>
            <div style={styles.inputWrapper}>
              <Mail size={16} style={styles.inputIcon} />
              <input
                id="email"
                className="input-field"
                style={styles.input}
                type="email"
                placeholder="Ex: athilalexandre@gmail.com"
                value={email}
                onChange={(e) => {
                  clearError();
                  setEmail(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Nome de Usuário
            </label>
            <div style={styles.inputWrapper}>
              <User size={16} style={styles.inputIcon} />
              <input
                id="username"
                className="input-field"
                style={styles.input}
                type="text"
                placeholder="Ex: athila_lurk"
                value={username}
                onChange={(e) => {
                  clearError();
                  setUsername(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="displayName">
              Nome de Exibição
            </label>
            <div style={styles.inputWrapper}>
              <Type size={16} style={styles.inputIcon} />
              <input
                id="displayName"
                className="input-field"
                style={styles.input}
                type="text"
                placeholder="Ex: Alexandre Athila"
                value={displayName}
                onChange={(e) => {
                  clearError();
                  setDisplayName(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="kickSlug">
              Slug do seu Canal Kick
            </label>
            <div style={styles.inputWrapper}>
              <Radio size={16} style={styles.inputIcon} />
              <input
                id="kickSlug"
                className="input-field"
                style={styles.input}
                type="text"
                placeholder="Ex: leokaos (apenas o username)"
                value={kickSlug}
                onChange={(e) => {
                  clearError();
                  setKickSlug(e.target.value);
                }}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Senha (mínimo 6 dígitos)
            </label>
            <div style={styles.inputWrapper}>
              <Key size={16} style={styles.inputIcon} />
              <input
                id="password"
                className="input-field"
                style={styles.input}
                type="password"
                placeholder="Crie uma senha forte"
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
            disabled={loading || !email || !username || !displayName || !password || !kickSlug}
          >
            {loading ? 'Processando cadastro...' : 'Enviar para Aprovação'}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={styles.footerText}>Já tem uma conta?</span>
          <button type="button" style={styles.loginLink} onClick={onNavigateToLogin}>
            Fazer Login
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
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: '#0a0a0f',
    padding: '2rem 1rem',
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
    border: '1px solid rgba(139, 92, 246, 0.2)',
    marginBottom: '1rem',
  },
  successBadge: {
    display: 'inline-flex',
    padding: '0.75rem',
    borderRadius: '12px',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    marginBottom: '0.35rem',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  successText: {
    fontSize: '0.9rem',
    color: '#d1d5db',
    lineHeight: '1.6',
    marginTop: '0.5rem',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '1.5rem',
    fontSize: '0.85rem',
    color: '#f87171',
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
    pointerEvents: 'none' as const,
  },
  input: {
    paddingLeft: '38px',
  },
  submitBtn: {
    width: '100%',
    marginTop: '1.5rem',
    justifyContent: 'center',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '2rem',
    fontSize: '0.85rem',
  },
  footerText: {
    color: '#9ca3af',
  },
  loginLink: {
    background: 'none',
    border: 'none',
    color: '#a78bfa',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
  },
};
