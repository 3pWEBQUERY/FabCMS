import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../ui/toast';
import { choose } from '../ui/kit';
import { addNavigationGuard } from '../lib/router';
import type { SiteSettings } from '../../shared/types';
import { t } from '../lib/i18n';

/* ---------- draft helper: edit a copy, save only what changed ---------- */

/** Asks before leaving a view with unsaved changes: own dialog instead of losing them silently. */
export function useLeaveGuard(dirty: boolean, save: () => Promise<boolean>, discard: () => void) {
  const latest = useRef({ dirty, save, discard });
  latest.current = { dirty, save, discard };
  useEffect(
    () =>
      addNavigationGuard(async () => {
        const { dirty, save, discard } = latest.current;
        if (!dirty) return true;
        const answer = await choose({
          title: t('Ungespeicherte Änderungen'),
          message: t('Du hast hier etwas geändert und noch nicht gespeichert.'),
          options: [
            { label: t('Weiter bearbeiten'), value: 'stay', kind: 'ghost' },
            { label: t('Verwerfen'), value: 'discard' },
            { label: t('Speichern'), value: 'save', kind: 'primary' },
          ],
        });
        if (answer === 'save') return save();
        if (answer === 'discard') discard();
        return answer === 'discard';
      }),
    [],
  );
}

type StoredDraft = Record<string, { base: string; value: unknown }>;
const storeKey = () => `nova-draft:${location.pathname}`;
const readStore = (): StoredDraft | null => {
  try {
    return JSON.parse(localStorage.getItem(storeKey()) ?? 'null') as StoredDraft | null;
  } catch {
    return null;
  }
};
const writeStore = (v: StoredDraft | null) => {
  try {
    if (v) localStorage.setItem(storeKey(), JSON.stringify(v));
    else localStorage.removeItem(storeKey());
  } catch {
    /* storage unavailable: the leave dialog still protects in-app navigation */
  }
};

export function useSettingsDraft() {
  const { settings, setSettings } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<SiteSettings | null>(settings ? structuredClone(settings) : null);
  const restored = useRef(false);
  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings));
  }, [settings, draft]);
  const changedKeys = useMemo(() => {
    if (!draft || !settings) return [];
    return (Object.keys(draft) as (keyof SiteSettings)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(settings[k]));
  }, [draft, settings]);
  const reset = () => {
    writeStore(null);
    if (settings) setDraft(structuredClone(settings));
  };

  // Closing the tab or reloading keeps unsaved changes as a local draft (no browser dialog needed);
  // they come back next time, but only where nobody changed the same setting in the meantime.
  useEffect(() => {
    if (!settings || !draft || restored.current) return;
    restored.current = true;
    const stored = readStore();
    if (!stored) return;
    const apply = Object.entries(stored).filter(([k, v]) => JSON.stringify(settings[k as keyof SiteSettings]) === v.base);
    if (!apply.length) return writeStore(null);
    setDraft((d) => (d ? { ...d, ...Object.fromEntries(apply.map(([k, v]) => [k, v.value])) } : d));
    toast(t('Ungespeicherte Änderungen von vorhin wiederhergestellt.'), { kind: 'notice', icon: 'history', ms: 8000, action: { label: t('Verwerfen'), run: reset } });
  }, [settings, draft]);
  useEffect(() => {
    if (!settings || !draft || !restored.current) return;
    writeStore(changedKeys.length ? Object.fromEntries(changedKeys.map((k) => [k, { base: JSON.stringify(settings[k]), value: draft[k] }])) : null);
  }, [changedKeys, draft, settings]);

  const save = async (): Promise<boolean> => {
    if (!draft) return true;
    const patch = Object.fromEntries(changedKeys.map((k) => [k, draft[k]]));
    try {
      const r = await api.patch<{ settings: SiteSettings }>('/api/settings', patch);
      setSettings(r.settings);
      setDraft(structuredClone(r.settings));
      writeStore(null);
      toast(t('Gespeichert. Die Website ist aktualisiert.'));
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      return false;
    }
  };
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = changedKeys.length > 0;
  useLeaveGuard(dirty, save, reset);
  return { draft, set, setDraft, dirty, save, reset };
}

export function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => unknown; onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!dirty) return null;
  return (
    <div className="save-bar" role="region" aria-label={t('Ungespeicherte Änderungen')}>
      <span>{t('Ungespeicherte Änderungen')}</span>
      <div className="row">
        <button className="btn ghost" onClick={onReset} disabled={busy}>
          {t('Verwerfen')}
        </button>
        <button
          className="btn primary"
          aria-busy={busy || undefined}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave();
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('Speichern')}
        </button>
      </div>
    </div>
  );
}
