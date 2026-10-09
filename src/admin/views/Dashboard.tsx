import { useState } from 'react';
import { useApi, formatDate } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Link } from '../lib/router';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { Icon } from '../ui/icons';
import { PageHead, ProgressRing, Skeleton, StatusBadge, motion } from '../ui/kit';
import { VisitorsChart, type DayPoint } from '../ui/Chart';
import { useToast } from '../ui/toast';
import { celebrate } from '../ui/confetti';
import type { EntryStatus } from '../../shared/types';
import { relativeTime } from '../../shared/text';

interface DashboardData {
  counts: { unread: number; comments: number; to_ship: number; review: number; new_leads: number; missing_alt: number; pending_bookings: number; today_bookings: number };
  recent: { id: string; collection: string; slug: string; status: EntryStatus; title: string; updated_at: string; author_name: string }[];
  checklist: { id: string; label: string; done: boolean; href: string }[];
  stats: { totals: { visitors: number; pageviews: number; visitorsPrev: number }; series: DayPoint[] } | null;
  sessions: number;
  site: { name: string; baseUrl: string };
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

export function SafetyNote() {
  return (
    <div className="safety">
      <Icon name="shield" />
      Alles wird automatisch gesichert – du kannst nichts kaputt machen.
    </div>
  );
}

export function Dashboard() {
  const { user, can, settings, reloadSettings } = useSession();
  const { data, reload } = useApi<DashboardData>('/api/dashboard');
  const toast = useToast();
  const [launching, setLaunching] = useState(false);
  const done = data?.checklist.filter((c) => c.done).length ?? 0;
  const total = data?.checklist.length ?? 6;
  const launched = Boolean(settings?.firstPublishedAt);

  const launch = async () => {
    setLaunching(true);
    try {
      const r = await api.post<{ firstPublish: boolean; url: string }>('/api/site/launch');
      if (r.firstPublish) celebrate();
      toast('Deine Website ist online.', { action: { label: 'Ansehen', run: () => window.open(r.url, '_blank') } });
      await reloadSettings();
      await reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setLaunching(false);
    }
  };

  const inbox = data
    ? [
        { n: data.counts.pending_bookings, label: 'Reservationsanfragen offen', to: '/reservationen', icon: 'calendar', show: can('bookings.manage') && settings?.modules.includes('booking') },
        { n: data.counts.today_bookings, label: 'Reservationen heute', to: '/reservationen', icon: 'calendar', show: can('bookings.manage') && settings?.modules.includes('booking') },
        { n: data.counts.unread, label: 'neue Formular-Einträge', to: '/formulare', icon: 'inbox', show: can('forms.manage') },
        { n: data.counts.new_leads, label: 'neue Kontakte', to: '/kontakte', icon: 'people', show: can('leads.view') && settings?.modules.includes('leads') },
        { n: data.counts.to_ship, label: 'Bestellungen zu versenden', to: '/bestellungen?status=paid', icon: 'receipt', show: can('orders.view') },
        { n: data.counts.comments, label: 'Kommentare warten auf Freigabe', to: '/kommentare', icon: 'chat', show: can('comments.moderate') },
        { n: data.counts.review, label: 'Beiträge warten auf Freigabe', to: '/inhalte/posts?status=review', icon: 'posts', show: can('content.publish') },
        { n: data.counts.missing_alt, label: 'Bilder ohne Beschreibung', to: '/medien?missingAlt=1', icon: 'image', show: can('media.upload') },
      ].filter((i) => i.show && i.n > 0)
    : [];

  const delta = data?.stats ? data.stats.totals.visitors - data.stats.totals.visitorsPrev : 0;

  return (
    <div className="page">
      <PageHead
        title={`${greeting()}, ${user.name.split(' ')[0]}.`}
        sub={launched ? `${settings?.name} ist online.` : 'Deine Website ist noch nicht öffentlich. Besucher sehen «Hier entsteht etwas».'}
        actions={
          <>
            <a className="btn" href={data?.site.baseUrl ?? '/'} target="_blank" rel="noreferrer">
              <Icon name="external" size="s" />
              Website ansehen
            </a>
            {!launched && can('content.publish') && (
              <button className="btn go" onClick={launch} disabled={launching} aria-busy={launching || undefined}>
                <Icon name="publish" size="s" />
                Website veröffentlichen
              </button>
            )}
          </>
        }
      />
      {data && data.sessions < 3 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <SafetyNote />
        </div>
      )}
      <div className="dash">
        <div className="stack">
          {data && done < total && (
            <section className="card" aria-labelledby="ck">
              <div className="card-head">
                <div className="row" style={{ gap: '0.85rem' }}>
                  <ProgressRing value={done / total} />
                  <div>
                    <h2 id="ck">Startklar</h2>
                    <p className="small muted">
                      {done} von {total} erledigt
                    </p>
                  </div>
                </div>
              </div>
              <ul className="list checklist">
                {data.checklist.map((c) => (
                  <li key={c.id}>
                    <Link to={c.href.replace(/^\/admin/, '')}>
                      <span className={`check-mark ${c.done ? 'done' : ''}`}>{c.done && <Icon name="check" size="s" />}</span>
                      <span className={c.done ? 'done-text' : ''}>{c.label}</span>
                      {!c.done && <Icon name="chevronRight" size="s" className="faint" style={{ marginLeft: 'auto' }} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data?.stats && (
            <section className="card">
              <div className="card-head">
                <h2>Besuche, letzte 7 Tage</h2>
                <Link to="/statistik" className="small muted">
                  Ganze Statistik
                </Link>
              </div>
              <div className="card-pad stack">
                <div className="row" style={{ gap: '1.5rem', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 'var(--t-3xl)', fontWeight: 650, letterSpacing: '-0.03em' }} className="num">
                    {data.stats.totals.visitors.toLocaleString('de-CH')}
                  </span>
                  <span className={`small ${delta > 0 ? '' : 'muted'}`} style={{ color: delta > 0 ? 'var(--ok)' : undefined, fontWeight: 600 }}>
                    {delta === 0 ? 'gleich wie Vorwoche' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} gegenüber Vorwoche`}
                  </span>
                </div>
                {data.stats.totals.visitors + data.stats.totals.visitorsPrev > 0 ? (
                  <VisitorsChart data={data.stats.series} height={150} label="Besuche pro Tag" />
                ) : (
                  <p className="small muted">{launched ? 'Sobald die ersten Besucher kommen, siehst du hier jeden Tag als Balken.' : 'Gezählt wird ab der Veröffentlichung – ohne Cookies und ohne Banner.'}</p>
                )}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Zuletzt bearbeitet</h2>
            </div>
            {!data ? (
              <Skeleton />
            ) : (
              <ul className="list">
                {data.recent.map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Link to={entryUrl(r.collection, r.id)} className="list-item">
                      <Icon name={r.collection === 'pages' ? 'page' : r.collection === 'posts' ? 'posts' : 'layers'} className="faint" />
                      <div className="grow">
                        <div className="title ellipsis">{r.title || '(ohne Titel)'}</div>
                        <div className="xsmall muted">
                          {relativeTime(r.updated_at)}
                          {r.author_name ? ` · ${r.author_name}` : ''}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Für dich</h2>
            </div>
            {!data ? (
              <Skeleton lines={2} />
            ) : inbox.length ? (
              <div className="inbox">
                {inbox.map((i) => (
                  <Link key={i.to} to={i.to}>
                    <Icon name={i.icon} className="faint" />
                    <span className="grow">{i.label}</span>
                    <span className="count">{i.n}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="card-pad muted small">Nichts offen. Schön.</p>
            )}
          </section>
          <section className="card card-pad stack tight">
            <h2 className="section-title">Schnell erledigt</h2>
            <div className="row wrap">
              <Link to="/seiten" className="btn">
                <Icon name="page" size="s" /> Seiten
              </Link>
              {settings?.modules.includes('menu') && (
                <Link to="/inhalte/dishes" className="btn">
                  <Icon name="menu" size="s" /> Speisekarte
                </Link>
              )}
              {settings?.modules.includes('blog') && (
                <Link to="/inhalte/posts" className="btn">
                  <Icon name="posts" size="s" /> Beiträge
                </Link>
              )}
              {settings?.modules.includes('shop') && (
                <Link to="/inhalte/products" className="btn">
                  <Icon name="bag" size="s" /> Produkte
                </Link>
              )}
              <Link to="/medien" className="btn">
                <Icon name="image" size="s" /> Bilder
              </Link>
              <Link to="/einstellungen/website#zeiten" className="btn">
                <Icon name="clock" size="s" /> Öffnungszeiten
              </Link>
            </div>
            {settings?.firstPublishedAt && <p className="xsmall faint">Online seit {formatDate(settings.firstPublishedAt)}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
