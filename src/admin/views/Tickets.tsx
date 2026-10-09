import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { Icon } from '../ui/icons';
import { Dialog, Empty, Field, Menu, PageHead, Skeleton, Toggle, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { formatMoney } from '../../shared/text';

interface Row {
  id: string;
  collection: 'events' | 'courses';
  title: string;
  when: string;
  past: boolean;
  cancelled: boolean;
  ticketed: boolean;
  sold: number;
  checked: number;
  capacity: number | null;
  revenue: number;
  waiting: number;
}
interface Category {
  name: string;
  price: number;
  capacity: number | null;
  left: number | null;
}
interface Order {
  id: string;
  name: string;
  email: string;
  phone: string;
  total: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled';
  source: string;
  created_at: string;
  token: string;
  tickets: { id: string; category: string; code: string; checked_in_at: string | null }[];
}
interface Detail {
  entry: { id: string; collection: string; title: string; when: string; path: string | null; cancelled: boolean };
  categories: Category[];
  orders: Order[];
  waitlist: { id: string; name: string; email: string; created_at: string; notified_at: string | null }[];
}

const STATUS = { paid: { label: 'Bezahlt', cls: 'ok' }, pending: { label: 'Zahlung offen', cls: 'warn' }, cancelled: { label: 'Storniert', cls: 'muted' } } as const;

export function Tickets() {
  const { query } = usePath();
  const id = query.get('event');
  return id ? <EventTickets key={id} id={id} /> : <Overview />;
}

function Overview() {
  const data = useApi<{ entries: Row[]; currency: string }>('/api/tickets');
  const [past, setPast] = useState(false);
  const rows = (data.data?.entries ?? []).filter((r) => r.ticketed && r.past === past);
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Tickets & Anmeldungen"
        sub="Verkauf, Teilnehmerlisten und Einlass für Events und Kurse."
        actions={
          <Link to="/einlass" className="btn primary">
            <Icon name="qr" size="s" /> Einlass
          </Link>
        }
      />
      <div className="toolbar">
        <Toggle checked={past} onChange={setPast} label="Vergangene zeigen" />
      </div>
      <section className="card">
        {!data.data ? (
          <Skeleton lines={4} />
        ) : !rows.length ? (
          <Empty title={past ? 'Nichts Vergangenes' : 'Nichts mit Tickets geplant'}>
            {past ? undefined : 'Leg unter «Inhalte → Events» oder «Kurse» einen Anlass an und füge unter «Tickets» mindestens eine Kategorie hinzu – gratis oder mit Preis.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Anlass</th>
                  <th className="right">Verkauft</th>
                  <th className="right">Eingecheckt</th>
                  <th className="right">Umsatz</th>
                  <th className="right">Warteliste</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/tickets?event=${r.id}`)}>
                    <td>
                      <div className="ellipsis">
                        {r.title} {r.cancelled && <span className="badge bad">Abgesagt</span>}
                      </div>
                      <div className="xsmall muted ellipsis">
                        {r.collection === 'courses' ? 'Kurs · ' : ''}
                        {r.when}
                      </div>
                    </td>
                    <td className="right num">
                      {r.sold}
                      {r.capacity !== null && <span className="faint"> / {r.capacity}</span>}
                    </td>
                    <td className="right num">{r.checked}</td>
                    <td className="right num">{r.revenue ? formatMoney(r.revenue, data.data!.currency) : '–'}</td>
                    <td className="right num">{r.waiting || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EventTickets({ id }: { id: string }) {
  const toast = useToast();
  const data = useApi<Detail>(`/api/tickets/${id}`);
  const [adding, setAdding] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const d = data.data;
  if (!d)
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    );
  const orders = d.orders.filter((o) => showCancelled || o.status !== 'cancelled');
  const paidTickets = d.orders.filter((o) => o.status === 'paid').flatMap((o) => o.tickets);
  const checked = paidTickets.filter((t) => t.checked_in_at).length;
  const cancel = async (o: Order) => {
    if (
      !(await confirm({
        title: `Bestellung von ${o.name} stornieren?`,
        message: `${o.tickets.length} ${o.tickets.length === 1 ? 'Ticket wird' : 'Tickets werden'} ungültig, ${o.name} bekommt eine E-Mail. ${o.total ? 'Das Geld zahlst du im Stripe-Dashboard zurück.' : ''} Wer auf der Warteliste steht, erfährt vom freien Platz.`,
        confirm: 'Stornieren',
        danger: true,
      }))
    )
      return;
    try {
      await api.post(`/api/ticket-orders/${o.id}/cancel`);
      toast('Storniert.');
      void data.reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const resend = async (o: Order) => {
    await api.post(`/api/ticket-orders/${o.id}/resend`);
    toast(`Tickets nochmals an ${o.email} geschickt.`);
  };
  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to="/tickets" className="crumb">
            <Icon name="chevronLeft" size="s" /> Tickets
          </Link>
        }
        title={d.entry.title}
        sub={`${d.entry.when} · ${paidTickets.length} ${paidTickets.length === 1 ? 'Ticket' : 'Tickets'}, ${checked} eingecheckt`}
        actions={
          <>
            {d.entry.path && (
              <a className="btn" href={d.entry.path} target="_blank" rel="noreferrer">
                <Icon name="external" size="s" /> Ansehen
              </a>
            )}
            <a className="btn" href={`/api/tickets/${id}/teilnehmer.csv`} download>
              <Icon name="download" size="s" /> Teilnehmerliste
            </a>
            <button className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" size="s" /> Eintragen
            </button>
            <Link to={`/einlass?event=${id}`} className="btn primary">
              <Icon name="qr" size="s" /> Einlass
            </Link>
          </>
        }
      />
      <div className="kpis" style={{ marginBottom: '1.25rem' }}>
        {d.categories.map((c) => (
          <div className="kpi" key={c.name}>
            <span className="label">
              {c.name} · {c.price ? formatMoney(c.price, d.orders[0]?.currency ?? 'CHF') : 'Gratis'}
            </span>
            <span className="value">{c.capacity === null ? paidTickets.filter((t) => t.category === c.name).length : `${c.capacity - (c.left ?? 0)} / ${c.capacity}`}</span>
            <span className="delta">{c.left === null ? 'ohne Limit' : c.left ? `${c.left} frei` : 'ausverkauft'}</span>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Bestellungen</h2>
          <Toggle checked={showCancelled} onChange={setShowCancelled} label="Stornierte zeigen" />
        </div>
        {!orders.length ? (
          <Empty title="Noch keine Bestellungen">Sobald jemand Tickets bestellt oder sich anmeldet, erscheint es hier.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tickets</th>
                  <th>Status</th>
                  <th className="right">Betrag</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="ellipsis">{o.name}</div>
                      <div className="xsmall muted ellipsis">
                        {o.email}
                        {o.source === 'admin' ? ' · eingetragen' : ''} · {formatDate(o.created_at, true)}
                      </div>
                    </td>
                    <td>
                      <div className="chips">
                        {o.tickets.map((t) => (
                          <span
                            key={t.id}
                            className={`chip${t.checked_in_at ? ' on' : ''}`}
                            title={t.checked_in_at ? `Eingecheckt ${formatDate(t.checked_in_at, true)}` : 'Noch nicht eingecheckt'}
                          >
                            {t.checked_in_at && <Icon name="check" size="s" />}
                            {t.category} <span className="mono faint">{t.code}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                    </td>
                    <td className="right num">{o.total ? formatMoney(o.total, o.currency) : 'Gratis'}</td>
                    <td className="right">
                      {o.status !== 'cancelled' && (
                        <Menu
                          trigger={
                            <button className="btn ghost small" aria-label={`Aktionen für ${o.name}`}>
                              <Icon name="more" size="s" />
                            </button>
                          }
                          items={[
                            { label: 'Tickets nochmals senden', icon: 'mail', onSelect: () => void resend(o), hidden: o.status !== 'paid' },
                            { label: 'Ticketseite öffnen', icon: 'external', onSelect: () => window.open(`/tickets/${o.token}`, '_blank') },
                            'sep',
                            { label: 'Stornieren', icon: 'trash', danger: true, onSelect: () => void cancel(o) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {d.waitlist.length > 0 && (
        <section className="card" style={{ marginTop: '1.25rem' }}>
          <div className="card-head">
            <h2>Warteliste</h2>
            <span className="xsmall muted">Wird ein Platz frei, bekommen die Ersten automatisch eine E-Mail.</span>
          </div>
          <div className="list">
            {d.waitlist.map((w, i) => (
              <div key={w.id} className="list-item">
                <span className="faint num">{i + 1}.</span>
                <span className="grow ellipsis">
                  {w.name} <span className="muted small">{w.email}</span>
                </span>
                <span className="xsmall muted">{w.notified_at ? `benachrichtigt ${formatDate(w.notified_at, true)}` : `seit ${formatDate(w.created_at)}`}</span>
                <button
                  className="btn ghost small"
                  aria-label={`${w.name} von der Warteliste nehmen`}
                  onClick={async () => {
                    await api.del(`/api/ticket-waitlist/${w.id}`);
                    void data.reload();
                  }}
                >
                  <Icon name="x" size="s" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <AddDialog open={adding} entryId={id} categories={d.categories} onClose={() => setAdding(false)} onDone={() => void data.reload()} />
    </div>
  );
}

function AddDialog({ open, entryId, categories, onClose, onDone }: { open: boolean; entryId: string; categories: Category[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const full = categories.some((c) => (qty[c.name] ?? 0) > 0 && c.left !== null && (qty[c.name] ?? 0) > c.left);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/tickets/${entryId}/orders`, { name, email, quantities: qty, override });
      toast(`Eingetragen. ${name} bekommt die Tickets per E-Mail.`);
      setName('');
      setEmail('');
      setQty({});
      setOverride(false);
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Eintragen" description="Für Anmeldungen per Telefon oder Verkauf an der Abendkasse. Gilt als bezahlt.">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid-2">
          <Field label="Name">
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="E-Mail" help="Dorthin gehen die Tickets.">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        {categories.map((c) => (
          <div key={c.name} className="row between">
            <span>
              {c.name} <span className="xsmall muted">{c.left === null ? '' : `${c.left} frei`}</span>
            </span>
            <input
              className="input num"
              type="number"
              min={0}
              max={100}
              style={{ width: '6rem' }}
              aria-label={`Anzahl ${c.name}`}
              value={qty[c.name] ?? 0}
              onChange={(e) => setQty({ ...qty, [c.name]: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        ))}
        {(full || override) && <Toggle checked={override} onChange={setOverride} label="Trotzdem eintragen" help="Über das Kontingent hinaus, z. B. für Gäste auf der Liste." />}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={busy || !Object.values(qty).some(Boolean)} data-busy={busy || undefined}>
            Eintragen
          </button>
        </div>
      </form>
    </Dialog>
  );
}
