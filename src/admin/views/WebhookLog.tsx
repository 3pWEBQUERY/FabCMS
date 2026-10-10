import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { adminLocale, t, tm } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Dialog } from '../ui/kit';
import { useToast } from '../ui/toast';

interface Delivery {
  id: string;
  event: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  ms: number | null;
  attempts: number;
  created_at: string;
  finished_at: string | null;
}

/**
 * What a webhook sent lately and what came back – with the exact body, and
 * «Erneut senden» for what failed (same id, so receivers can drop doubles).
 */
export function WebhookLog({ hookId }: { hookId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ deliveries: Delivery[] }>(open ? `/api/webhooks/${hookId}/deliveries` : null);
  const [show, setShow] = useState<{ id: string; body: unknown; error: string | null } | null>(null);
  const list = data?.deliveries ?? [];
  const failed = list.filter((d) => d.finished_at && !d.ok).length;

  const retry = async (d: Delivery) => {
    try {
      const r = await api.post<{ ok: boolean; status: number; ms: number; error?: string }>(`/api/webhooks/deliveries/${d.id}/retry`);
      toast(r.ok ? t('Antwort {status} in {ms} ms', { status: r.status, ms: r.ms }) : t('Fehlgeschlagen: {error}', { error: r.error ? tm(r.error) : r.status }), {
        kind: r.ok ? 'info' : 'bad',
      });
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const inspect = async (d: Delivery) => {
    try {
      const r = await api.get<{ delivery: { body: unknown; error: string | null } }>(`/api/webhooks/deliveries/${d.id}`);
      setShow({ id: d.id, body: r.delivery.body, error: r.delivery.error });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  return (
    <div className="wh-log">
      <button type="button" className="linkish xsmall" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size="s" /> {t('Zustellungen')}
        {open && failed > 0 && <span className="wh-bad"> · {t('{n} fehlgeschlagen', { n: failed })}</span>}
      </button>
      {open &&
        (!data ? (
          <p className="xsmall muted">{t('Lade …')}</p>
        ) : !list.length ? (
          <p className="xsmall muted">{t('Noch nichts gesendet. Zustellungen bleiben 14 Tage sichtbar.')}</p>
        ) : (
          <ul className="wh-list">
            {list.map((d) => (
              <li key={d.id} className={!d.finished_at ? 'wait' : d.ok ? 'ok' : 'bad'}>
                <i aria-hidden="true" />
                <code>{d.event}</code>
                <span className="xsmall muted">{new Date(d.created_at).toLocaleString(adminLocale(), { dateStyle: 'short', timeStyle: 'medium' })}</span>
                <span className="xsmall">
                  {!d.finished_at ? t('wartet') : d.ok ? `${d.status} · ${d.ms} ms` : tm(d.error ?? '') || String(d.status)}
                  {d.attempts > 1 && ` · ${t('{n} Versuche', { n: d.attempts })}`}
                </span>
                <span className="grow" />
                <button type="button" className="btn ghost s" onClick={() => void inspect(d)}>
                  {t('Inhalt')}
                </button>
                {d.finished_at && !d.ok && (
                  <button type="button" className="btn s" onClick={() => void retry(d)}>
                    <Icon name="redo" size="s" /> {t('Erneut senden')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      <Dialog open={Boolean(show)} onOpenChange={(o) => !o && setShow(null)} title={t('Gesendeter Inhalt')} description={show ? `X-Nova-Delivery: ${show.id}` : undefined} wide>
        {show && <pre className="code-out">{JSON.stringify(show.body, null, 2)}</pre>}
      </Dialog>
    </div>
  );
}
