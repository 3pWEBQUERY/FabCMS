import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Skeleton } from '../ui/kit';
import { useToast } from '../ui/toast';

interface Missing {
  path: string;
  hits: number;
  first_at: string;
  last_at: string;
  referrer: string | null;
  suggestion: string | null;
}

/**
 * Addresses visitors asked for that don't exist – old links, typos, moved
 * pages –, most asked first. Each gets a guess where it should lead; one
 * click turns it into a redirect, or it is set aside.
 */
export function MissingPages({ onRedirected }: { onRedirected?: () => void }) {
  const toast = useToast();
  const { data, reload } = useApi<{ missing: Missing[] }>('/api/not-found');
  const [to, setTo] = useState<Record<string, string>>({});
  const target = (m: Missing) => to[m.path] ?? m.suggestion ?? '';

  const redirect = async (m: Missing) => {
    try {
      await api.post('/api/redirects', { from_path: m.path, to_path: target(m), code: 301 });
      toast(t('{from} leitet jetzt auf {to} weiter.', { from: m.path, to: target(m) }));
      void reload();
      onRedirected?.();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const ignore = async (m: Missing) => {
    try {
      await api.post('/api/not-found/ignore', { paths: [m.path] });
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t('Nicht gefundene Adressen')}</h2>
        <button className="btn s" onClick={() => void reload()}>
          {t('Neu laden')}
        </button>
      </div>
      {!data ? (
        <Skeleton />
      ) : !data.missing.length ? (
        <p className="card-pad small muted">{t('Niemand ist ins Leere gelaufen. Alte Links und Tippfehler, die Besucher auf eine 404-Seite führen, erscheinen hier.')}</p>
      ) : (
        <ul className="nf-list">
          {data.missing.map((m) => (
            <li key={m.path}>
              <div className="nf-from">
                <code className="mono">{m.path}</code>
                <span className="xsmall muted">
                  {m.hits === 1 ? t('1 Aufruf') : t('{n} Aufrufe', { n: m.hits })} · {t('zuletzt {date}', { date: formatDate(m.last_at) })}
                  {m.referrer && (
                    <>
                      {' · '}
                      {t('von {page}', { page: m.referrer.replace(/^https?:\/\//, '') })}
                    </>
                  )}
                </span>
              </div>
              <form
                className="nf-to"
                onSubmit={(e) => {
                  e.preventDefault();
                  void redirect(m);
                }}
              >
                <Icon name="arrowRight" size="s" className="faint" />
                <input
                  className="input mono"
                  value={target(m)}
                  placeholder={t('/neue-adresse')}
                  aria-label={t('Weiterleiten von {path} nach', { path: m.path })}
                  onChange={(e) => setTo({ ...to, [m.path]: e.target.value })}
                />
                <button className="btn s primary" disabled={!target(m)}>
                  {t('Weiterleiten')}
                </button>
                <button type="button" className="btn s ghost" onClick={() => void ignore(m)} title={t('Nicht mehr anzeigen')}>
                  {t('Ignorieren')}
                </button>
              </form>
              {m.suggestion && !to[m.path] && <span className="xsmall muted nf-hint">{t('Vorschlag aus einer Seite mit ähnlicher Adresse.')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
