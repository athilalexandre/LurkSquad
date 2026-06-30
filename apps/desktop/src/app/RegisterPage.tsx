import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { UserPlus, Mail, User, Type, Key, ShieldCheck, ShieldAlert } from 'lucide-react';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

export function RegisterPage({ onNavigateToLogin }: RegisterPageProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !displayName || !password) return;

    setLoading(true);
    try {
      const msg = await register(email, username, displayName, password);
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
                placeholder="Ex: athila_lurk (letras/números)"
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
            <label className="form-label" htmlFor="password">
              Senha (mínimo 6 digitos)
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
            disabled={loading || !email || !username || !displayName || !password}
          >
            {loading ? 'Processando cadastro...' : 'Enviar para Aprovação'}
          </button>
        </form>

        <div style={styles.footer}>
          <span>Já tem cadastro? </span>
          <button
            type="button"
            onClick={onNavigateToLogin}
            style={styles.linkBtn}
            disabled={loading}
          >
            Fazer login
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
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '1.75rem',
  },
  logoBadge: {
    display: 'inline-flex',
    padding: '0.75rem',
    borderRadius: '12px',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    marginBottom: '1rem',
    border: '1px solid rgba(139, 92, 246, 0.2)',
  },
  successBadge: {
    display: 'inline-flex',
    padding: '0.75rem',
    borderRadius: '12px',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    marginBottom: '1rem',
    border: '1px solid rgba(16, 185, 129, 0.2)',
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
  successText: {
    fontSize: '0.9rem',
    color: '#9ca3af',
    marginTop: '0.75rem',
    lineHeight: '1.4',
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
