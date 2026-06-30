import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore.js';
import { LoginPage } from './app/LoginPage.js';
import { RegisterPage } from './app/RegisterPage.js';
import { PendingPage } from './app/PendingPage.js';
import { DashboardPage } from './app/DashboardPage.js';
import { AdminPage } from './app/AdminPage.js';
import { RefreshCw, Radio } from 'lucide-react';

function App() {
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);

  // Router view state
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [appView, setAppView] = useState<'dashboard' | 'admin'>('dashboard');

  // Trigger auth initialization on boot
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Loading Splash Screen during boot
  if (isInitializing) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashContent}>
          <Radio size={48} color="#8b5cf6" className="pulse" />
          <h2 style={styles.splashTitle}>LurkSquad</h2>
          <div style={styles.loadingArea}>
            <RefreshCw size={16} className="spin" color="#8b5cf6" />
            <span style={styles.loadingText}>Iniciando conexão segura...</span>
          </div>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated Router Flow
  if (!isAuthenticated || !user) {
    if (authView === 'register') {
      return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onNavigateToRegister={() => setAuthView('register')} />;
  }

  // 2. Pending Admin Approvals/Bans Flow
  if (user.status !== 'APPROVED') {
    return <PendingPage />;
  }

  // 3. Approved User App Flow
  if (appView === 'admin' && (user.role === 'ADMIN' || user.role === 'OWNER')) {
    return <AdminPage onNavigateBack={() => setAppView('dashboard')} />;
  }

  return <DashboardPage onNavigateToAdmin={() => setAppView('admin')} />;
}

const styles = {
  splash: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#0a0a0f',
  },
  splashContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
  },
  splashTitle: {
    fontSize: '1.75rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    background: 'linear-gradient(135deg, #fff, #a78bfa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  loadingArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  loadingText: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    fontWeight: 500,
  },
};

export default App;
