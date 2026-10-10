import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { entryUrl } from '../lib/actions';
import { useApi } from '../lib/hooks';
import { adminLocale, t, tl } from '../lib/i18n';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { PageHead, Segmented, Skeleton } from '../ui/kit';
import { useToast } from '../ui/toast';
import type { CollectionDef } from '../../shared/types';

interface Item {
  id: string;
  collection: string;
  title: string;
  kind: 'published' | 'scheduled' | 'expires';
  at: string;
}

const DRAG = 'application/x-nova-entry';
/** Entries a day shows before «+ n weitere». */
const MAX = 4;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Editorial calendar: what went online, what is planned and what expires, by day.
 * Planned and expiring entries move to another day by dragging.
 */
export function Calendar() {
  const { can } = useSession();
  const toast = useToast();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [show, setShow] = useState<'all' | 'planned'>('all');
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Six weeks from the Monday on or before the first of the month.
  const start = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const { data, reload } = useApi<{ items: Item[] }>(`/api/calendar?from=${day(addDays(start, -1))}&to=${day(addDays(start, 43))}`);
  const { data: cols } = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const icon = (c: string) => cols?.collections.find((x) => x.id === c)?.icon ?? 'page';
  const colName = (c: string) => tl(cols?.collections.find((x) => x.id === c)?.singular) || c;
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of data?.items ?? []) {
      if (show === 'planned' && it.kind === 'published') continue;
      const k = day(new Date(it.at));
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  }, [data, show]);
  const today = day(new Date());
  const weekdays = days.slice(0, 7).map((d) => d.toLocaleDateString(adminLocale(), { weekday: 'short' }));
  const movable = (it: Item) => can('content.publish') && it.kind !== 'published';

  const move = async (it: Item, to: string) => {
    const old = new Date(it.at);
    const [y, mo, d] = to.split('-').map(Number);
    const at = new Date(y, mo - 1, d, old.getHours(), old.getMinutes());
    if (at.getTime() <= Date.now()) return toast(t('Dieser Zeitpunkt liegt in der Vergangenheit.'), { kind: 'bad' });
    try {
      if (it.kind === 'scheduled') await api.post(`/api/entries/${it.id}/publish`, { at: at.toISOString() });
      else await api.post(`/api/entries/${it.id}/expiry`, { at: at.toISOString() });
      toast(t('«{name}» verschoben auf {when}.', { name: it.title, when: at.toLocaleString(adminLocale(), { dateStyle: 'medium', timeStyle: 'short' }) }));
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const chip = (it: Item) => (
    <Link
      key={`${it.kind}-${it.id}`}
      to={entryUrl(it.collection, it.id)}
      className={`cal-item ${it.kind}`}
      draggable={movable(it)}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, JSON.stringify(it));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setOver(null)}
      title={`${colName(it.collection)} · ${it.kind === 'published' ? t('Veröffentlicht') : it.kind === 'scheduled' ? t('Geplant') : t('Läuft ab')} · ${new Date(it.at).toLocaleTimeString(adminLocale(), { hour: '2-digit', minute: '2-digit' })}`}
    >
      <Icon name={it.kind === 'expires' ? 'clock' : icon(it.collection)} size="s" />
      <span className="ellipsis">{it.title || t('Ohne Titel')}</span>
    </Link>
  );

  const agenda = days.filter((d) => d.getMonth() === month.getMonth() && byDay.get(day(d))?.length);

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Redaktionskalender')}
        sub={t('Was online ging, was geplant ist und was abläuft. Geplantes ziehst du auf einen anderen Tag.')}
        actions={
          <Segmented
            label={t('Anzeigen')}
            value={show}
            onChange={setShow}
            options={[
              { value: 'all' as const, label: t('Alles') },
              { value: 'planned' as const, label: t('Nur Geplantes') },
            ]}
          />
        }
      />
      <div className="cal-head">
        <button className="btn ghost icon-only" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label={t('Voriger Monat')}>
          <Icon name="chevronLeft" />
        </button>
        <h2>{month.toLocaleDateString(adminLocale(), { month: 'long', year: 'numeric' })}</h2>
        <button className="btn ghost icon-only" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label={t('Nächster Monat')}>
          <Icon name="chevronRight" />
        </button>
        <button
          className="btn s"
          onClick={() => {
            const n = new Date();
            setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
          }}
        >
          {t('Heute')}
        </button>
        <span className="grow" />
        <span className="cal-legend">
          <i className="published" /> {t('Veröffentlicht')} <i className="scheduled" /> {t('Geplant')} <i className="expires" /> {t('Läuft ab')}
        </span>
      </div>
      {!data ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <div className="cal-grid" role="grid" aria-label={month.toLocaleDateString(adminLocale(), { month: 'long', year: 'numeric' })}>
            {weekdays.map((w) => (
              <div key={w} className="cal-wd" role="columnheader">
                {w}
              </div>
            ))}
            {days.map((d) => {
              const k = day(d);
              const items = byDay.get(k) ?? [];
              return (
                <div
                  key={k}
                  role="gridcell"
                  className={`cal-day${d.getMonth() !== month.getMonth() ? ' other' : ''}${k === today ? ' today' : ''}${over === k ? ' over' : ''}`}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(DRAG)) return;
                    e.preventDefault();
                    setOver(k);
                  }}
                  onDragLeave={() => setOver((o) => (o === k ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const it = JSON.parse(e.dataTransfer.getData(DRAG) || 'null') as Item | null;
                    if (it && movable(it) && day(new Date(it.at)) !== k) void move(it, k);
                  }}
                >
                  <span className="cal-num">{d.getDate()}</span>
                  <div className="cal-items">
                    {(open === k ? items : items.slice(0, MAX)).map(chip)}
                    {items.length > MAX && (
                      <button type="button" className="cal-more" onClick={() => setOpen(open === k ? null : k)}>
                        {open === k ? t('weniger') : t('+ {n} weitere', { n: items.length - MAX })}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cal-agenda">
            {agenda.length === 0 ? (
              <p className="small muted">{t('In diesem Monat ist nichts geplant oder erschienen.')}</p>
            ) : (
              agenda.map((d) => (
                <section key={day(d)}>
                  <h3 className={day(d) === today ? 'today' : ''}>{d.toLocaleDateString(adminLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                  {(byDay.get(day(d)) ?? []).map((it) => (
                    <button key={`${it.kind}-${it.id}`} className={`cal-row ${it.kind}`} onClick={() => navigate(entryUrl(it.collection, it.id))}>
                      <i />
                      <span className="grow ellipsis">{it.title || t('Ohne Titel')}</span>
                      <span className="xsmall muted">{new Date(it.at).toLocaleTimeString(adminLocale(), { hour: '2-digit', minute: '2-digit' })}</span>
                    </button>
                  ))}
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
