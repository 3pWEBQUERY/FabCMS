import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { adminLocale, t } from '../lib/i18n';
import { Icon } from './icons';
import { Dialog, Field, Segmented, Skeleton, confirm } from './kit';
import { useToast } from './toast';

interface Link {
  id: string;
  url: string;
  note: string;
  lang: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  uses: number;
  created_by_name: string | null;
}

const DAYS = ['1', '7', '30'] as const;

/**
 * Links that show the draft to people without an account. They always show
 * the latest saved state, run out by themselves and can be withdrawn.
 */
export function ShareLinks({ entryId, lang, open, onClose }: { entryId: string; lang: string | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { data, reload } = useApi<{ links: Link[] }>(open ? `/api/entries/${entryId}/preview-links` : null);
  const [days, setDays] = useState<(typeof DAYS)[number]>('7');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const full = (l: Link) => `${location.origin}${l.url}`;

  const copy = async (l: Link) => {
    try {
      await navigator.clipboard.writeText(full(l));
      toast(t('Link kopiert.'));
    } catch {
      window.prompt(t('Link kopieren:'), full(l));
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ link: Link }>(`/api/entries/${entryId}/preview-links`, { days: Number(days), note: note.trim(), lang: lang ?? undefined });
      setNote('');
      await reload();
      await copy(r.link);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (l: Link) => {
    if (
      !(await confirm({
        title: t('Link zurückziehen?'),
        message: t('Wer ihn hat, sieht danach nur noch einen Hinweis, dass die Vorschau nicht mehr verfügbar ist.'),
        confirm: t('Zurückziehen'),
        danger: true,
      }))
    )
      return;
    try {
      await api.del(`/api/preview-links/${l.id}`);
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('Vorschau teilen')}
      description={t('Wer den Link hat, sieht den aktuellen Entwurf – ohne Konto und ohne etwas ändern zu können. Suchmaschinen sehen nichts.')}
      wide
    >
      <div className="stack">
        <form
          className="share-new"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field label={t('Für wen (nur für dich)')} htmlFor="share-note">
            <input id="share-note" className="input" value={note} maxLength={120} placeholder={t('z. B. Frau Meier, Druckerei')} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Field label={t('Gültig')}>
            <Segmented
              label={t('Gültig')}
              value={days}
              onChange={setDays}
              options={[
                { value: '1', label: t('1 Tag') },
                { value: '7', label: t('7 Tage') },
                { value: '30', label: t('30 Tage') },
              ]}
            />
          </Field>
          <button className="btn primary" disabled={busy}>
            <Icon name="link" size="s" /> {t('Link erstellen und kopieren')}
          </button>
        </form>
        {!data ? (
          <Skeleton lines={2} />
        ) : data.links.length === 0 ? (
          <p className="small muted">{t('Noch keine gültigen Links.')}</p>
        ) : (
          <ul className="share-list">
            {data.links.map((l) => (
              <li key={l.id}>
                <div className="grow">
                  <div className="title">{l.note || t('Ohne Notiz')}</div>
                  <div className="xsmall muted">
                    {t('gültig bis {date}', { date: new Date(l.expires_at).toLocaleString(adminLocale(), { dateStyle: 'medium', timeStyle: 'short' }) })}
                    {' · '}
                    {l.uses ? t('{n}× geöffnet, zuletzt {date}', { n: l.uses, date: formatDate(l.last_used_at!) }) : t('noch nie geöffnet')}
                    {l.lang && ` · ${l.lang.toUpperCase()}`}
                  </div>
                </div>
                <button type="button" className="btn s" onClick={() => void copy(l)}>
                  <Icon name="copy" size="s" /> {t('Kopieren')}
                </button>
                <a className="btn ghost s icon-only" href={l.url} target="_blank" rel="noreferrer" aria-label={t('Öffnen')}>
                  <Icon name="external" size="s" />
                </a>
                <button type="button" className="btn ghost s icon-only" onClick={() => void revoke(l)} aria-label={t('Link zurückziehen')}>
                  <Icon name="trash" size="s" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
