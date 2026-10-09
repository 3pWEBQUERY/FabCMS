import { lazy, StrictMode, Suspense, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { api } from './lib/api';
import { SessionProvider, type SessionUser } from './lib/session';
import { ToastProvider } from './ui/toast';
import { TooltipProvider } from './ui/kit';
import { Login, SetupOwner, TwoFactor } from './views/Auth';
import { Shell } from './shell/Shell';
import { Splash, TopProgress } from './ui/loading';
import type { Capability } from '../shared/roles';

const Onboarding = lazy(() => import('./views/Onboarding').then((m) => ({ default: m.Onboarding })));

interface SessionResponse {
  user: SessionUser | null;
  caps?: Capability[];
  twoFactorPending?: boolean;
  setupRequired: boolean;
  site: { name: string; setupDone?: boolean };
}

// Theme preference (light / dark / system) is per device.
try {
  const t = localStorage.getItem('nova-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  /* storage unavailable */
}

function App() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setSession(await api.get<SessionResponse>('/api/session'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener('nova:unauthorized', on);
    return () => window.removeEventListener('nova:unauthorized', on);
  }, [load]);

  useEffect(() => {
    document.title = session?.site.name ? `${session.site.name} · Nova` : 'Nova';
  }, [session?.site.name]);

  if (error)
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Keine Verbindung</h1>
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={load}>
            Nochmals versuchen
          </button>
        </div>
      </div>
    );
  if (!session) return <Splash />;
  if (session.setupRequired) return <SetupOwner onDone={load} />;
  if (session.twoFactorPending) return <TwoFactor onDone={load} />;
  if (!session.user) return <Login siteName={session.site.name} onDone={load} />;
  return (
    <SessionProvider user={session.user} caps={session.caps ?? []} onLogout={load}>
      {session.site.setupDone === false && (session.caps ?? []).includes('settings.manage') ? (
        <Suspense fallback={<Splash />}>
          <Onboarding onDone={load} />
        </Suspense>
      ) : (
        <Shell />
      )}
    </SessionProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <TooltipProvider>
        <TopProgress />
        <App />
      </TooltipProvider>
    </ToastProvider>
  </StrictMode>,
);
