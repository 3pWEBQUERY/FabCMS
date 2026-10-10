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
import { adminLocale, t, tm } from '../lib/i18n';

const SAVE_LABEL: Record<SaveState, () => string> = {
  saved: () => t('gesichert'),
  dirty: () => t('bearbeitet'),
  saving: () => t('sichert …'),
  error: () => t('nicht gesichert'),
  conflict: () => t('Konflikt'),
};
const SAVE_CLASS: Record<SaveState, string> = { saved: 'ok', dirty: 'edited', saving: 'edited', error: 'bad', conflict: 'bad' };

/** Status dot instead of a spinner: «bearbeitet» → «gesichert». */
export function SaveStatus({ state, error, onRetry }: { state: SaveState; error?: string | null; onRetry?: () => void }) {
  return (
    <span className="save-state" role="status" aria-live="polite" title={error ?? undefined}>
      <motion.span className={`dot ${SAVE_CLASS[state]}`} animate={{ scale: state === 'saved' ? [1.6, 1] : 1 }} transition={{ duration: 0.15 }} />
      <span className="hide-m">{SAVE_LABEL[state]()}</span>
      {(state === 'error' || state === 'conflict') && onRetry && (
        <button className="linkish xsmall" onClick={onRetry}>
          {state === 'conflict' ? t('Neu laden') : t('Nochmals')}
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
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [until, setUntil] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 86_400_000);
    d.setHours(8, 0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const past = Boolean(when) && new Date(when).getTime() <= Date.now();
  const e = doc.entry;
  if (!e) return null;
  const canPublish = can('content.publish');
  const q = e.lang ? `?lang=${e.lang}` : '';
  const live = e.status === 'published';
  const changed = live && JSON.stringify(e.published_data) !== JSON.stringify(doc.data);

  const publish = async (at?: string) => {
    setBusy(true);
    try {
      if (!(await doc.saveNow())) throw new Error(doc.error ?? t('Speichern hat nicht geklappt.'));
      const r = await api.post<{ entry: Entry; firstPublish?: boolean; review?: boolean; url?: string }>(`/api/entries/${e.id}/publish${q}`, {
        at: at ? new Date(at).toISOString() : null,
      });
      doc.setEntry(r.entry);
      if (r.review) toast(t('Zur Freigabe eingereicht. Die Redaktion wird informiert.'));
      else if (r.entry.status === 'scheduled')
        toast(t('Geplant für {when}.', { when: new Date(r.entry.publish_at!).toLocaleString(adminLocale(), { dateStyle: 'medium', timeStyle: 'short' }) }));
      else {
        if (r.firstPublish) {
          celebrate();
          await reloadSettings();
        }
        toast(r.firstPublish ? t('Deine Website ist online!') : t('Veröffentlicht.'), r.url ? { action: { label: t('Ansehen'), run: () => window.open(r.url!, '_blank') } } : {});
      }
      onPublished?.(r.entry);
    } catch (err) {
      toast((err as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
      setScheduleOpen(false);
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(adminLocale(), { dateStyle: 'medium', timeStyle: 'short' });
  const expires = e.unpublish_at ?? null;
  const setExpiry = async (at: string | null) => {
    setBusy(true);
    try {
      const r = await api.post<{ entry: Entry }>(`/api/entries/${e.id}/expiry`, { at: at ? new Date(at).toISOString() : null });
      doc.setEntry({ ...e, unpublish_at: r.entry.unpublish_at });
      toast(at ? t('Geht am {when} automatisch offline.', { when: fmt(at) }) : t('Kein Ablaufdatum mehr.'));
      setExpiryOpen(false);
    } catch (err) {
      toast((err as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const openExpiry = () => {
    const d = expires ? new Date(expires) : new Date(Date.now() + 7 * 86_400_000);
    if (!expires) d.setHours(23, 59, 0, 0);
    setUntil(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
    setExpiryOpen(true);
  };
  const untilPast = Boolean(until) && new Date(until).getTime() <= Date.now();

  const unpublish = async () => {
    if (
      !(await confirm({
        title: t('Offline nehmen?'),
        message: t('Die Seite ist danach nicht mehr öffentlich. Der Inhalt bleibt als Entwurf erhalten.'),
        confirm: t('Offline nehmen'),
      }))
    )
      return;
    const r = await api.post<{ entry: Entry }>(`/api/entries/${e.id}/unpublish${q}`);
    doc.setEntry(r.entry);
    toast(t('Offline genommen.'));
  };

  const discard = async () => {
    if (
      !(await confirm({
        title: t('Änderungen verwerfen?'),
        message: t('Der Entwurf wird auf die veröffentlichte Fassung zurückgesetzt. Im Verlauf bleibt alles erhalten.'),
        confirm: t('Verwerfen'),
        danger: true,
      }))
    )
      return;
    await api.post(`/api/entries/${e.id}/discard${q}`);
    await doc.reload();
    toast(t('Auf veröffentlichte Fassung zurückgesetzt.'));
  };

  const label = !canPublish ? t('Zur Freigabe') : live && !changed ? t('Veröffentlicht') : live ? t('Änderungen veröffentlichen') : t('Veröffentlichen');
  return (
    <div className="row" style={{ gap: 2 }}>
      <button
        className={`btn ${live && !changed ? '' : 'go'}`}
        disabled={busy || (live && !changed) || doc.blockers.length > 0}
        aria-busy={busy || undefined}
        onClick={() => publish()}
        title={doc.blockers.map(tm).join(' ') || undefined}
      >
        <Icon name={live && !changed ? 'check' : 'publish'} size="s" />
        <span className="hide-m">{label}</span>
      </button>
      {canPublish && (
        <Menu
          trigger={
            <button className="btn icon-only" aria-label={t('Weitere Optionen zum Veröffentlichen')}>
              <Icon name="chevronDown" size="s" />
            </button>
          }
          items={[
            { label: t('Später veröffentlichen …'), icon: 'calendar', onSelect: () => setScheduleOpen(true), hidden: doc.blockers.length > 0 },
            {
              label: expires ? t('Läuft ab: {when}', { when: fmt(expires) }) : t('Ablaufdatum …'),
              icon: 'clock',
              onSelect: openExpiry,
              hidden: Boolean(e.lang),
            },
            { label: t('Änderungen verwerfen'), icon: 'undo', onSelect: discard, hidden: !changed },
            { label: t('Offline nehmen'), icon: 'eyeOff', onSelect: unpublish, hidden: !live },
          ]}
        />
      )}
      <Dialog
        open={expiryOpen}
        onOpenChange={setExpiryOpen}
        title={t('Ablaufdatum')}
        description={t('Nova nimmt den Inhalt zu diesem Zeitpunkt automatisch offline – ein Angebot, eine Aktion, ein Hinweis. Er bleibt als Entwurf erhalten.')}
      >
        <DateTimeInput label={t('Offline nehmen am')} value={until} onChange={setUntil} min={isoDay(new Date())} defaultTime="23:59" />
        {untilPast && <p className="field-error">{t('Dieser Zeitpunkt liegt in der Vergangenheit.')}</p>}
        <div className="dialog-actions">
          {expires && (
            <button className="btn ghost" disabled={busy} onClick={() => void setExpiry(null)} style={{ marginRight: 'auto' }}>
              {t('Kein Ablaufdatum')}
            </button>
          )}
          <button className="btn ghost" onClick={() => setExpiryOpen(false)}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={busy || !until || untilPast} aria-busy={busy || undefined} onClick={() => void setExpiry(until)}>
            {t('Festlegen')}
          </button>
        </div>
      </Dialog>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen} title={t('Später veröffentlichen')} description={t('Nova veröffentlicht automatisch zum gewählten Zeitpunkt.')}>
        <DateTimeInput label={t('Veröffentlichen am')} value={when} onChange={setWhen} min={isoDay(new Date())} defaultTime="08:00" />
        {past && <p className="field-error">{t('Dieser Zeitpunkt liegt in der Vergangenheit.')}</p>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setScheduleOpen(false)}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={busy || !when || past} aria-busy={busy || undefined} onClick={() => publish(when)}>
            {t('Planen')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
