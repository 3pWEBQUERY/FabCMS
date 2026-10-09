import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useApi, useMediaQuery } from '../lib/hooks';
import { navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { DateInput, Dialog, Field, PageHead, Select, Skeleton, Toggle, TimeInput, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { BOOKING_STATUS, localDay, minutesToTime, type BookingResource, type BookingService } from '../../shared/booking';
import { addDays, longDay } from '../../shared/dates';

interface Booking {
  id: string;
  service_id: string | null;
  resource_id: string | null;
  service_name: string | null;
  resource_name: string | null;
  starts_at: string;
  ends_at: string;
  party_size: number;
  name: string;
  email: string;
  phone: string;
  note: string;
  internal_note: string;
  status: string;
  source: string;
}
interface Block {
  id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
  source: string;
}
interface Setup {
  services: BookingService[];
  resources: BookingResource[];
}

const HOUR_PX = 64;

export function Bookings() {
  const { settings, can } = useSession();
  const { query } = usePath();
  const toast = useToast();
  const tz = settings?.timezone ?? 'Europe/Zurich';
  const today = localDay(new Date(), tz).day;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.get('tag') ?? '') ? query.get('tag')! : today;
  const openId = query.get('id');
  const setup = useApi<Setup>('/api/booking/setup');
  const plan = useApi<{ bookings: Booking[]; blocks: Block[]; pending: { id: string; name: string; starts_at: string; party_size: number }[] }>(`/api/bookings?from=${day}&to=${day}`);
  const [adding, setAdding] = useState(query.get('neu') === '1');
  const wide = useMediaQuery('(min-width: 900px)');
  const table = settings?.booking.mode !== 'appointment';

  const go = (d: string, id?: string) => navigate(`/reservationen?tag=${d}${id ? `&id=${id}` : ''}`, { replace: true });
  const open = plan.data?.bookings.find((b) => b.id === openId) ?? null;
  const resources = (setup.data?.resources ?? []).filter((r) => r.active);
  const live = (plan.data?.bookings ?? []).filter((b) => b.status !== 'cancelled');
  const guests = live.reduce((n, b) => n + b.party_size, 0);

  if (setup.data && !setup.data.services.length)
    return (
      <div className="page">
        <PageHead title="Reservationen" />
        <div className="card card-pad stack">
          <h2>Noch nichts buchbar</h2>
          <p className="muted">Lege zuerst fest, was online gebucht werden kann – zum Beispiel «Tisch, 2 Stunden» oder «Haarschnitt, 45 Minuten» – und mit welchen Tischen oder Personen.</p>
          {can('settings.manage') && (
            <button className="btn primary" style={{ justifySelf: 'start' }} onClick={() => navigate('/einstellungen/reservation')}>
              Reservation einrichten
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div className="page wide">
      <PageHead
        title="Reservationen"
        sub={plan.data ? `${longDay(day)} · ${live.length} ${live.length === 1 ? 'Reservation' : 'Reservationen'}${table ? ` · ${guests} Personen` : ''}` : longDay(day)}
        actions={
          <>
            <div className="row" style={{ gap: '.35rem', flexWrap: 'nowrap' }}>
              <button className="btn ghost icon-only" aria-label="Vorheriger Tag" onClick={() => go(addDays(day, -1))}>
                <Icon name="chevronLeft" size="s" />
              </button>
              <DateInput label="Tag" value={day} onChange={(d) => d && go(d)} clearable={false} />
              <button className="btn ghost icon-only" aria-label="Nächster Tag" onClick={() => go(addDays(day, 1))}>
                <Icon name="chevronRight" size="s" />
              </button>
              {day !== today && (
                <button className="btn ghost" onClick={() => go(today)}>
                  Heute
                </button>
              )}
            </div>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size="s" /> Eintragen
            </button>
          </>
        }
      />

      {plan.data && plan.data.pending.length > 0 && (
        <section className="card bk-pending" aria-labelledby="bk-pend">
          <div className="card-head">
            <h2 id="bk-pend">Offene Anfragen</h2>
            <span className="small muted">Warten auf deine Bestätigung</span>
          </div>
          <ul className="list">
            {plan.data.pending.map((p) => (
              <li key={p.id} className="list-item">
                <Icon name="calendar" className="faint" />
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="xsmall muted">
                    {new Date(p.starts_at).toLocaleString('de-CH', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {table ? ` · ${p.party_size} P.` : ''}
                  </div>
                </div>
                <button
                  className="btn s"
                  onClick={async () => {
                    await api.patch(`/api/bookings/${p.id}`, { status: 'confirmed' });
                    toast(`${p.name} ist bestätigt – die E-Mail ist unterwegs.`);
                    void plan.reload();
                  }}
                >
                  Bestätigen
                </button>
                <button className="btn s ghost" onClick={() => go(localDay(new Date(p.starts_at), tz).day, p.id)}>
                  Ansehen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!plan.data || !setup.data ? (
        <div className="card">
          <Skeleton lines={6} />
        </div>
      ) : wide && resources.length > 0 ? (
        <DayGrid day={day} tz={tz} resources={resources} bookings={plan.data.bookings} blocks={plan.data.blocks} hours={settings?.hours ?? []} onOpen={(id) => go(day, id)} table={table} />
      ) : (
        <DayList bookings={plan.data.bookings} tz={tz} table={table} onOpen={(id) => go(day, id)} />
      )}

      {open && setup.data && (
        <BookingDialog
          booking={open}
          tz={tz}
          table={table}
          resources={resources}
          onClose={() => go(day)}
          onChanged={() => void plan.reload()}
        />
      )}
      {adding && setup.data && (
        <AddDialog
          day={day}
          table={table}
          services={setup.data.services.filter((s) => s.active)}
          resources={resources}
          onClose={() => setAdding(false)}
          onAdded={(d, id) => {
            setAdding(false);
            go(d, id);
            void plan.reload();
          }}
        />
      )}
    </div>
  );
}

/* ---------- day plan: one column per table or person ---------- */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function DayGrid({
  day,
  tz,
  resources,
  bookings,
  blocks,
  hours,
  onOpen,
  table,
}: {
  day: string;
  tz: string;
  resources: BookingResource[];
  bookings: Booking[];
  blocks: Block[];
  hours: { day: number; closed: boolean; slots: { from: string; to: string }[] }[];
  onOpen: (id: string) => void;
  table: boolean;
}) {
  const weekday = localDay(new Date(`${day}T12:00:00Z`), 'UTC').weekday;
  // The visible window: opening hours of the day (business or any resource), widened to fit all bookings.
  const range = useMemo(() => {
    let from = 24 * 60;
    let to = 0;
    for (const h of [hours, ...resources.map((r) => r.hours ?? [])]) {
      const d = h.find((x) => x.day === weekday);
      if (!d || d.closed) continue;
      for (const s of d.slots) {
        from = Math.min(from, toMin(s.from));
        to = Math.max(to, toMin(s.to) <= toMin(s.from) ? 24 * 60 : toMin(s.to));
      }
    }
    for (const b of bookings) {
      const s = localDay(new Date(b.starts_at), tz).minutes;
      const e = s + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000;
      from = Math.min(from, s);
      to = Math.max(to, Math.min(24 * 60, e));
    }
    if (from >= to) return { from: 9 * 60, to: 18 * 60 };
    return { from: Math.floor(from / 60) * 60, to: Math.ceil(to / 60) * 60 };
  }, [hours, resources, bookings, weekday, tz]);
  const top = (iso: string) => ((localDay(new Date(iso), tz).minutes - range.from) / 60) * HOUR_PX;
  const height = (a: string, b: string) => Math.max(26, ((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * HOUR_PX - 3);
  const hoursList = Array.from({ length: (range.to - range.from) / 60 }, (_, i) => range.from + i * 60);
  const nowMin = localDay(new Date(), tz);
  const showNow = nowMin.day === day && nowMin.minutes >= range.from && nowMin.minutes <= range.to;
  const unassigned = bookings.filter((b) => !b.resource_id || !resources.some((r) => r.id === b.resource_id));
  const columns = [...resources.map((r) => ({ id: r.id, name: r.name, sub: r.kind === 'staff' ? '' : `${r.capacity} Pl.` })), ...(unassigned.length ? [{ id: '', name: 'Ohne Zuordnung', sub: '' }] : [])];
  return (
    <div className="card bk-grid-wrap">
      <div className="bk-grid" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(9rem, 1fr))` }}>
        <div className="bk-corner" />
        {columns.map((c) => (
          <div key={c.id || 'none'} className="bk-col-head">
            <strong>{c.name}</strong>
            {c.sub && <span>{c.sub}</span>}
          </div>
        ))}
        <div className="bk-times" style={{ height: hoursList.length * HOUR_PX }}>
          {hoursList.map((m) => (
            <span key={m} style={{ top: (m - range.from) * (HOUR_PX / 60) }}>
              {minutesToTime(m)}
            </span>
          ))}
        </div>
        {columns.map((c) => (
          <div key={c.id || 'none'} className="bk-col" style={{ height: hoursList.length * HOUR_PX }}>
            {blocks
              .filter((b) => b.resource_id === null || b.resource_id === c.id)
              .map((b) => (
                <div key={b.id} className="bk-closed" style={{ top: Math.max(0, top(b.starts_at)), height: Math.min(hoursList.length * HOUR_PX, height(b.starts_at, b.ends_at)) }} title={b.reason || 'Gesperrt'}>
                  <span>{b.reason || (b.source === 'ical' ? 'Kalender' : 'Gesperrt')}</span>
                </div>
              ))}
            {bookings
              .filter((b) => (c.id ? b.resource_id === c.id : !b.resource_id || !resources.some((r) => r.id === b.resource_id)))
              .map((b) => (
                <button key={b.id} className={`bk-item s-${b.status}`} style={{ top: top(b.starts_at), height: height(b.starts_at, b.ends_at) }} onClick={() => onOpen(b.id)}>
                  <span className="bk-item-time">{localTime(b.starts_at, tz)}</span>
                  <strong>{b.name}</strong>
                  <span className="bk-item-meta">{table ? `${b.party_size} P.` : (b.service_name ?? '')}</span>
                  {b.note && <Icon name="chat" size="s" className="bk-item-note" aria-label="Mit Bemerkung" />}
                </button>
              ))}
            {showNow && <div className="bk-now" style={{ top: (nowMin.minutes - range.from) * (HOUR_PX / 60) }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const localTime = (iso: string, tz: string) => minutesToTime(localDay(new Date(iso), tz).minutes);

function DayList({ bookings, tz, table, onOpen }: { bookings: Booking[]; tz: string; table: boolean; onOpen: (id: string) => void }) {
  if (!bookings.length) return <p className="card card-pad muted">An diesem Tag ist noch nichts eingetragen.</p>;
  return (
    <ul className="card list bk-list">
      {bookings.map((b) => (
        <li key={b.id}>
          <button className={`list-item bk-row s-${b.status}`} onClick={() => onOpen(b.id)}>
            <span className="bk-row-time num">{localTime(b.starts_at, tz)}</span>
            <div className="grow">
              <div className="title">{b.name}</div>
              <div className="xsmall muted">{[table ? `${b.party_size} Personen` : b.service_name, b.resource_name].filter(Boolean).join(' · ')}</div>
            </div>
            <span className={`badge ${BOOKING_STATUS[b.status]?.tone ?? ''}`}>{BOOKING_STATUS[b.status]?.label ?? b.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- details ---------- */

function BookingDialog({ booking: b, tz, table, resources, onClose, onChanged }: { booking: Booking; tz: string; table: boolean; resources: BookingResource[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState(b.internal_note);
  const [moving, setMoving] = useState(false);
  const [move, setMove] = useState({ day: localDay(new Date(b.starts_at), tz).day, time: localTime(b.starts_at, tz), resourceId: b.resource_id, party: b.party_size });
  const [busy, setBusy] = useState('');
  useEffect(() => setNote(b.internal_note), [b.internal_note]);
  const patch = async (body: Record<string, unknown>, done: string, key: string) => {
    setBusy(key);
    try {
      await api.patch(`/api/bookings/${b.id}`, body);
      toast(done);
      onChanged();
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      return false;
    } finally {
      setBusy('');
    }
  };
  const status = BOOKING_STATUS[b.status];
  const active = ['pending', 'confirmed', 'awaiting_payment'].includes(b.status);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={b.name} description={`${longDay(localDay(new Date(b.starts_at), tz).day)}, ${localTime(b.starts_at, tz)}–${localTime(b.ends_at, tz)} Uhr`}>
      <div className="stack">
        <div className="row wrap" style={{ gap: '.5rem' }}>
          <span className={`badge ${status?.tone ?? ''}`}>{status?.label ?? b.status}</span>
          <span className="badge">{table ? `${b.party_size} Personen` : (b.service_name ?? 'Termin')}</span>
          {b.resource_name && <span className="badge">{b.resource_name}</span>}
          <span className="xsmall muted">{b.source === 'web' ? 'online gebucht' : b.source === 'phone' ? 'telefonisch' : 'vor Ort'}</span>
        </div>
        <dl className="bk-contact">
          {b.phone && (
            <div>
              <dt>Telefon</dt>
              <dd>
                <a href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a>
              </dd>
            </div>
          )}
          {b.email && (
            <div>
              <dt>E-Mail</dt>
              <dd>
                <a href={`mailto:${b.email}`}>{b.email}</a>
              </dd>
            </div>
          )}
          {b.note && (
            <div>
              <dt>Bemerkung</dt>
              <dd>{b.note}</dd>
            </div>
          )}
        </dl>
        <Field label="Interne Notiz" help="Sieht nur das Team.">
          <textarea className="textarea" style={{ minHeight: '3.5rem' }} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== b.internal_note && void patch({ internal_note: note }, 'Notiz gespeichert.', 'note')} />
        </Field>
        {moving && (
          <div className="card card-pad stack tight" style={{ background: 'var(--panel-2)' }}>
            <div className="row wrap" style={{ gap: '.5rem' }}>
              <DateInput label="Tag" value={move.day} clearable={false} onChange={(d) => d && setMove({ ...move, day: d })} />
              <TimeInput label="Uhrzeit" value={move.time} onChange={(t) => setMove({ ...move, time: t })} />
              {table && <input className="input num" style={{ width: '5rem' }} type="number" min={1} max={99} value={move.party} aria-label="Personen" onChange={(e) => setMove({ ...move, party: Number(e.target.value) || 1 })} />}
            </div>
            <Select label={table ? 'Tisch' : 'Bei'} value={move.resourceId ?? ''} onChange={(v) => setMove({ ...move, resourceId: v || null })} options={[{ value: '', label: 'Ohne Zuordnung' }, ...resources.map((r) => ({ value: r.id, label: r.kind === 'staff' ? r.name : `${r.name} (${r.capacity} Pl.)` }))]} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setMoving(false)}>
                Abbrechen
              </button>
              <button className="btn primary" aria-busy={busy === 'move' || undefined} onClick={async () => (await patch({ move }, 'Verschoben.', 'move')) && setMoving(false)}>
                Verschieben
              </button>
            </div>
          </div>
        )}
        <div className="dialog-actions bk-actions">
          {active && !moving && (
            <button className="btn ghost" onClick={() => setMoving(true)}>
              Verschieben
            </button>
          )}
          {active && (
            <button
              className="btn ghost danger-text"
              aria-busy={busy === 'cancel' || undefined}
              onClick={async () => {
                if (await confirm({ title: 'Reservation stornieren?', message: b.email ? `${b.name} bekommt eine E-Mail, dass die Reservation abgesagt ist.` : undefined, confirm: 'Stornieren', danger: true }))
                  await patch({ status: 'cancelled' }, 'Storniert.', 'cancel');
              }}
            >
              Stornieren
            </button>
          )}
          {b.status === 'confirmed' && (
            <>
              <button className="btn ghost" aria-busy={busy === 'no_show' || undefined} onClick={() => void patch({ status: 'no_show', mail: false }, 'Als «nicht erschienen» markiert.', 'no_show')}>
                Nicht erschienen
              </button>
              <button className="btn" aria-busy={busy === 'done' || undefined} onClick={() => void patch({ status: 'done', mail: false }, 'Erledigt.', 'done')}>
                Ist da
              </button>
            </>
          )}
          {b.status === 'pending' && (
            <button className="btn primary" aria-busy={busy === 'confirm' || undefined} onClick={() => void patch({ status: 'confirmed' }, 'Bestätigt – die E-Mail ist unterwegs.', 'confirm')}>
              Bestätigen
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- phone and walk-in bookings ---------- */

function AddDialog({
  day: initialDay,
  table,
  services,
  resources,
  onClose,
  onAdded,
}: {
  day: string;
  table: boolean;
  services: BookingService[];
  resources: BookingResource[];
  onClose: () => void;
  onAdded: (day: string, id: string) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ serviceId: services[0]?.id ?? '', day: initialDay, time: '', party: 2, resourceId: '', name: '', phone: '', email: '', note: '', source: 'phone', mail: true });
  const free = useApi<{ slots: { time: string; resourceId: string }[] }>(f.serviceId ? `/api/booking/slots?service=${f.serviceId}&day=${f.day}&party=${f.party}` : null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ booking: { id: string } }>('/api/bookings', { ...f, resourceId: f.resourceId || null, party: table ? f.party : 1, mail: f.mail && Boolean(f.email) });
      toast('Eingetragen.');
      onAdded(f.day, r.booking.id);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Reservation eintragen" description="Für Anrufe und Gäste vor Ort. Freie Zeiten sind vorgeschlagen, du kannst aber jede Zeit eintragen.">
      <div className="stack">
        {services.length > 1 && (
          <Field label="Was">
            <Select value={f.serviceId} onChange={(v) => setF({ ...f, serviceId: v, time: '' })} options={services.map((s) => ({ value: s.id, label: `${s.name} (${s.duration_min} Min.)` }))} />
          </Field>
        )}
        <div className="row wrap" style={{ gap: '.75rem', alignItems: 'flex-end' }}>
          <Field label="Tag">
            <DateInput value={f.day} clearable={false} onChange={(d) => d && setF({ ...f, day: d, time: '' })} />
          </Field>
          {table && (
            <Field label="Personen">
              <input className="input num" style={{ width: '5.5rem' }} type="number" min={1} max={99} value={f.party} onChange={(e) => setF({ ...f, party: Number(e.target.value) || 1, time: '' })} />
            </Field>
          )}
          <Field label="Uhrzeit">
            <TimeInput label="Uhrzeit" value={f.time} onChange={(t) => setF({ ...f, time: t })} />
          </Field>
        </div>
        {free.data && (
          <div className="bk-free">
            <span className="xsmall muted">{free.data.slots.length ? 'Frei:' : 'An diesem Tag ist laut Kalender nichts mehr frei.'}</span>
            {free.data.slots.slice(0, 24).map((s) => (
              <button key={s.time} type="button" className="chip num" aria-pressed={f.time === s.time} onClick={() => setF({ ...f, time: s.time, resourceId: '' })}>
                {s.time}
              </button>
            ))}
          </div>
        )}
        <Field label={table ? 'Tisch' : 'Bei'} help="Leer lassen: Nova nimmt den passenden, der frei ist.">
          <Select value={f.resourceId} onChange={(v) => setF({ ...f, resourceId: v })} options={[{ value: '', label: 'Automatisch' }, ...resources.map((r) => ({ value: r.id, label: r.kind === 'staff' ? r.name : `${r.name} (${r.capacity} Pl.)` }))]} />
        </Field>
        <div className="grid-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Telefon">
            <input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="E-Mail" help="Optional – dann bekommt der Gast eine Bestätigung.">
          <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Bemerkung">
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        {f.email && <Toggle checked={f.mail} onChange={(v) => setF({ ...f, mail: v })} label="Bestätigung per E-Mail senden" />}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={!f.name || !f.time} aria-busy={busy || undefined} onClick={submit}>
            Eintragen
          </button>
        </div>
      </div>
    </Dialog>
  );
}
