import { adminLocale } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Loads JSON from the API; `reload` refetches. Keeps the previous data while loading. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, setData, error, loading, reload: load };
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Global keyboard shortcut. `combo` like "mod+k", "mod+.", "mod+z", "mod+shift+z". */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const on = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (parts.includes('mod') !== mod) return;
      if (parts.includes('shift') !== e.shiftKey) return;
      if (parts.includes('alt') !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [combo, enabled]);
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Touch screens: a focused search field would open the keyboard over the list people want to browse. */
export const touchScreen = () => matchMedia('(pointer: coarse)').matches;

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString(adminLocale(), { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
