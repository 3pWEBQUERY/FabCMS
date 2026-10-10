import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { clearOffline } from './offline';
import type { Capability } from '../../shared/roles';
import type { Mode, SiteSettings, User } from '../../shared/types';

export interface SessionUser extends User {
  allowed_modes: Mode[];
}

export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  pair: string;
  palettes: { id: string; label: string; bg: string; ink: string; accent: string; surface: string; dark?: boolean }[];
  header: string;
  numbered: boolean;
}

export interface SettingsBundle {
  settings: SiteSettings;
  themes: ThemeInfo[];
  fontPairs: { id: string; label: string; display: string; body: string }[];
  system: { storage: 'bucket' | 'local'; mail: boolean; stripe: boolean; stripeWebhook: boolean; turnstile: boolean; publicUrl: string };
}

interface SessionValue {
  user: SessionUser;
  caps: Capability[];
  can: (cap: Capability) => boolean;
  mode: Mode;
  pro: boolean;
  setMode: (m: Mode) => Promise<void>;
  updateUser: (u: Partial<SessionUser>) => void;
  bundle: SettingsBundle | null;
  settings: SiteSettings | null;
  reloadSettings: () => Promise<void>;
  setSettings: (s: SiteSettings) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ user: initial, caps, children, onLogout }: { user: SessionUser; caps: Capability[]; children: ReactNode; onLogout: () => void }) {
  const [user, setUser] = useState(initial);
  const [bundle, setBundle] = useState<SettingsBundle | null>(null);
  const reloadSettings = useCallback(async () => {
    setBundle(await api.get<SettingsBundle>('/api/settings'));
  }, []);
  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);
  const setMode = useCallback(
    async (m: Mode) => {
      if (!user.allowed_modes.includes(m)) return;
      setUser((u) => ({ ...u, mode: m }));
      await api.patch('/api/me', { mode: m });
    },
    [user.allowed_modes],
  );
  const value: SessionValue = {
    user,
    caps,
    can: (cap) => caps.includes(cap),
    mode: user.mode,
    pro: user.mode === 'werkbank',
    setMode,
    updateUser: (u) => setUser((prev) => ({ ...prev, ...u })),
    bundle,
    settings: bundle?.settings ?? null,
    reloadSettings,
    setSettings: (s) => setBundle((b) => (b ? { ...b, settings: s } : b)),
    logout: async () => {
      await api.post('/api/logout');
      await clearOffline();
      onLogout();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside provider');
  return v;
}
