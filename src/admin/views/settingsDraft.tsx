import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { useToast } from '../ui/toast';
import type { SiteSettings } from '../../shared/types';

/* ---------- draft helper: edit a copy, save only what changed ---------- */

export function useSettingsDraft() {
  const { settings, setSettings } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<SiteSettings | null>(settings ? structuredClone(settings) : null);
  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings));
  }, [settings, draft]);
  const changedKeys = useMemo(() => {
    if (!draft || !settings) return [];
    return (Object.keys(draft) as (keyof SiteSettings)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(settings[k]));
  }, [draft, settings]);
  const save = async () => {
    if (!draft) return;
    const patch = Object.fromEntries(changedKeys.map((k) => [k, draft[k]]));
    try {
      const r = await api.patch<{ settings: SiteSettings }>('/api/settings', patch);
      setSettings(r.settings);
      setDraft(structuredClone(r.settings));
      toast('Gespeichert. Die Website ist aktualisiert.');
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const reset = () => settings && setDraft(structuredClone(settings));
  return { draft, set, setDraft, dirty: changedKeys.length > 0, save, reset };
}

export function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="save-bar" role="region" aria-label="Ungespeicherte Änderungen">
      <span>Ungespeicherte Änderungen</span>
      <div className="row">
        <button className="btn ghost" onClick={onReset}>
          Verwerfen
        </button>
        <button className="btn primary" onClick={onSave}>
          Speichern
        </button>
      </div>
    </div>
  );
}

