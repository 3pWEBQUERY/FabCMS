import { useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { DateTimeInput, Dialog, Menu, confirm } from './kit';
import { isoDay } from '../../shared/dates';
import { Icon } from './icons';
import { useToast } from './toast';
import { celebrate } from './confetti';
import type { EntryDoc, SaveState } from '../lib/useEntryDoc';
import type { Entry } from '../../shared/types';

const SAVE_LABEL: Record<SaveState, string> = { saved: 'gesichert', dirty: 'bearbeitet', saving: 'sichert …', error: 'nicht gesichert', conflict: 'Konflikt' };
const SAVE_CLASS: Record<SaveState, string> = { saved: 'ok', dirty: 'edited', saving: 'edited', error: 'bad', conflict: 'bad' };

/** Status dot instead of a spinner: «bearbeitet» → «gesichert». */
export function SaveStatus({ state, error, onRetry }: { state: SaveState; error?: string | null; onRetry?: () => void }) {
  return (
    <span className="save-state" role="status" aria-live="polite" title={error ?? undefined}>
      <motion.span className={`dot ${SAVE_CLASS[state]}`} animate={{ scale: state === 'saved' ? [1.6, 1] : 1 }} transition={{ duration: 0.15 }} />
      <span className="hide-m">{SAVE_LABEL[state]}</span>
      {(state === 'error' || state === 'conflict') && onRetry && (
        <button className="linkish xsmall" onClick={onRetry}>
          {state === 'conflict' ? 'Neu laden' : 'Nochmals'}
        </button>
      )}
    </span>
  );
}

export function PublishControls({ doc, onPublished }: { doc: EntryDoc; onPublished?: (e: Entry) => void }) {
  const { can, reloadSettings } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(8, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const past = Boolean(when) && new Date(when).getTime() <= Date.now();
  const e = doc.entry;
  if (!e) return null;
  const canPublish = can('content.publish');
  const live = e.status === 'published';
  const changed = live && JSON.stringify(e.published_data) !== JSON.stringify(doc.data);

  const publish = async (at?: string) => {
    setBusy(true);
    try {
      if (!(await doc.saveNow())) throw new Error(doc.error ?? 'Speichern hat nicht geklappt.');
      const r = await api.post<{ entry: Entry; firstPublish?: boolean; review?: boolean; url?: string }>(`/api/entries/${e.id}/publish`, { at: at ? new Date(at).toISOString() : null });
      doc.setEntry(r.entry);
      if (r.review) toast('Zur Freigabe eingereicht. Die Redaktion wird informiert.');
      else if (r.entry.status === 'scheduled') toast(`Geplant für ${new Date(r.entry.publish_at!).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })}.`);
      else {
        if (r.firstPublish) {
          celebrate();
          await reloadSettings();
        }
        toast(r.firstPublish ? 'Deine Website ist online!' : 'Veröffentlicht.', r.url ? { action: { label: 'Ansehen', run: () => window.open(r.url!, '_blank') } } : {});
      }
      onPublished?.(r.entry);
    } catch (err) {
      toast((err as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
      setScheduleOpen(false);
    }
  };

  const unpublish = async () => {
    if (!(await confirm({ title: 'Offline nehmen?', message: 'Die Seite ist danach nicht mehr öffentlich. Der Inhalt bleibt als Entwurf erhalten.', confirm: 'Offline nehmen' }))) return;
    const r = await api.post<{ entry: Entry }>(`/api/entries/${e.id}/unpublish`);
    doc.setEntry(r.entry);
    toast('Offline genommen.');
  };

  const discard = async () => {
    if (!(await confirm({ title: 'Änderungen verwerfen?', message: 'Der Entwurf wird auf die veröffentlichte Fassung zurückgesetzt. Im Verlauf bleibt alles erhalten.', confirm: 'Verwerfen', danger: true }))) return;
    await api.post(`/api/entries/${e.id}/discard`);
    await doc.reload();
    toast('Auf veröffentlichte Fassung zurückgesetzt.');
  };

  const label = !canPublish ? 'Zur Freigabe' : live && !changed ? 'Veröffentlicht' : live ? 'Änderungen veröffentlichen' : 'Veröffentlichen';
  return (
    <div className="row" style={{ gap: 2 }}>
      <button className={`btn ${live && !changed ? '' : 'go'}`} disabled={busy || (live && !changed) || doc.blockers.length > 0} aria-busy={busy || undefined} onClick={() => publish()} title={doc.blockers.join(' ') || undefined}>
        <Icon name={live && !changed ? 'check' : 'publish'} size="s" />
        <span className="hide-m">{label}</span>
      </button>
      {canPublish && (
        <Menu
          trigger={
            <button className="btn icon-only" aria-label="Weitere Optionen zum Veröffentlichen">
              <Icon name="chevronDown" size="s" />
            </button>
          }
          items={[
            { label: 'Später veröffentlichen …', icon: 'calendar', onSelect: () => setScheduleOpen(true), hidden: doc.blockers.length > 0 },
            { label: 'Änderungen verwerfen', icon: 'undo', onSelect: discard, hidden: !changed },
            { label: 'Offline nehmen', icon: 'eyeOff', onSelect: unpublish, hidden: !live },
          ]}
        />
      )}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen} title="Später veröffentlichen" description="Nova veröffentlicht automatisch zum gewählten Zeitpunkt.">
        <DateTimeInput label="Veröffentlichen am" value={when} onChange={setWhen} min={isoDay(new Date())} defaultTime="08:00" />
        {past && <p className="field-error">Dieser Zeitpunkt liegt in der Vergangenheit.</p>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setScheduleOpen(false)}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={busy || !when || past} aria-busy={busy || undefined} onClick={() => publish(when)}>
            Planen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
