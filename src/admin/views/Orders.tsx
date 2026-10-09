import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Dialog, Empty, Field, PageHead, Segmented, Skeleton, Switch, confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { formatMoney, formatPrice } from '../../shared/text';

interface Line {
  title: string;
  variantName: string | null;
  qty: number;
  unit: number;
  total: number;
  sku: string;
  digital: boolean;
}

interface Order {
  id: string;
  number: string;
  token: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
  email: string;
  customer: { name: string; company: string; phone: string; street: string; zip: string; city: string; country: string; shippingMethod: string };
  items: Line[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  vat: { rate: number; amount: number }[];
  currency: string;
  coupon: string | null;
  payment_method: 'stripe' | 'invoice';
  payment_ref: string | null;
  note: string;
  paid_at: string | null;
  created_at: string;
}

const STATUS: Record<Order['status'], { label: string; cls: string }> = {
  pending: { label: 'Offen', cls: 'edited' },
  paid: { label: 'Bezahlt – versenden', cls: 'sel' },
  fulfilled: { label: 'Erledigt', cls: 'ok' },
  cancelled: { label: 'Storniert', cls: '' },
  refunded: { label: 'Erstattet', cls: '' },
};

export function Orders() {
  const { query } = usePath();
  const [status, setStatus] = useState(query.get('status') ?? '');
  const { data } = useApi<{ orders: Order[]; summary: { revenue: number; to_ship: number } }>(`/api/orders${status ? `?status=${status}` : ''}`);
  const { settings } = useSession();
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Bestellungen"
        sub={data ? `Umsatz bezahlt: ${formatMoney(data.summary.revenue, settings?.shop.currency)} · ${data.summary.to_ship} zu versenden` : undefined}
        actions={
          <a className="btn" href="/api/orders?format=csv" download>
            <Icon name="download" size="s" /> CSV für die Buchhaltung
          </a>
        }
      />
      <div className="toolbar">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Alle' },
            { value: 'paid', label: 'Zu versenden' },
            { value: 'pending', label: 'Offen' },
            { value: 'fulfilled', label: 'Erledigt' },
          ]}
        />
      </div>
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : !data.orders.length ? (
          <Empty title="Keine Bestellungen">{status ? 'Mit diesem Status gibt es gerade nichts.' : 'Sobald jemand im Laden bestellt, erscheint die Bestellung hier – und du bekommst eine E-Mail.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nummer</th>
                  <th>Datum</th>
                  <th>Kunde</th>
                  <th>Status</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/bestellungen/${o.id}`)}>
                    <td className="mono">{o.number}</td>
                    <td>{formatDate(o.created_at, true)}</td>
                    <td>{o.customer.name}</td>
                    <td>
                      <span className={`badge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
                    </td>
                    <td className="right num">{formatPrice(o.total)}</td>
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

export function OrderDetail({ id }: { id: string }) {
  const { can } = useSession();
  const toast = useToast();
  const { data, setData } = useApi<{ order: Order }>(`/api/orders/${id}`);
  if (!data) return <div className="page"><Skeleton lines={6} /></div>;
  const o = data.order;
  const setStatus = async (status: Order['status'], question?: string) => {
    if (question && !(await confirm({ title: question, confirm: 'Ja' }))) return;
    try {
      const r = await api.patch<{ order: Order }>(`/api/orders/${id}`, { status });
      setData(r);
      toast('Status geändert.');
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/bestellungen" className="crumb">
            <Icon name="chevronLeft" size="s" /> Bestellungen
          </Link>
        }
        title={`Bestellung ${o.number}`}
        sub={`${formatDate(o.created_at, true)} · ${o.payment_method === 'stripe' ? 'Online bezahlt via Stripe' : 'Rechnung'}`}
        actions={
          <>
            <a className="btn" href={`/_nova/invoice/${o.id}`} target="_blank" rel="noreferrer">
              <Icon name="receipt" size="s" /> Rechnung drucken
            </a>
            {can('orders.manage') && o.status === 'pending' && (
              <button className="btn primary" onClick={() => setStatus('paid', 'Zahlung eingegangen?')}>
                Als bezahlt markieren
              </button>
            )}
            {can('orders.manage') && o.status === 'paid' && (
              <button className="btn go" onClick={() => setStatus('fulfilled')}>
                <Icon name="check" size="s" /> Versendet / erledigt
              </button>
            )}
          </>
        }
      />
      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>Artikel</h2>
            <span className={`badge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {o.items.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.qty} × {l.title}
                      {l.variantName && <span className="muted"> ({l.variantName})</span>}
                      {l.sku && <div className="xsmall faint mono">{l.sku}</div>}
                    </td>
                    <td className="right num">{formatPrice(l.total)}</td>
                  </tr>
                ))}
                {o.discount > 0 && (
                  <tr>
                    <td>Rabatt {o.coupon && <span className="mono">({o.coupon})</span>}</td>
                    <td className="right num">−{formatPrice(o.discount)}</td>
                  </tr>
                )}
                <tr>
                  <td>Versand ({o.customer.shippingMethod === 'pickup' ? 'Abholung' : 'Post'})</td>
                  <td className="right num">{formatPrice(o.shipping)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Total {o.currency}</strong>
                    <div className="xsmall muted">{o.vat.map((v) => `inkl. ${v.rate} % MwSt. ${formatPrice(v.amount)}`).join(' · ')}</div>
                  </td>
                  <td className="right num">
                    <strong>{formatPrice(o.total)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <div className="stack">
          <section className="card card-pad stack tight">
            <h2 className="section-title">Kunde</h2>
            <address style={{ fontStyle: 'normal' }}>
              {o.customer.company && (
                <>
                  {o.customer.company}
                  <br />
                </>
              )}
              {o.customer.name}
              <br />
              {o.customer.street && (
                <>
                  {o.customer.street}
                  <br />
                </>
              )}
              {o.customer.zip} {o.customer.city} {o.customer.country}
            </address>
            <a href={`mailto:${o.email}`}>{o.email}</a>
            {o.customer.phone && <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a>}
            {o.note && <p className="small" style={{ whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--line-2)', paddingLeft: '0.6rem' }}>{o.note}</p>}
          </section>
          {can('orders.manage') && (
            <section className="card card-pad stack tight">
              <button className="btn" onClick={() => api.post(`/api/orders/${id}/resend`).then(() => toast('Bestätigung erneut gesendet.'))}>
                <Icon name="mail" size="s" /> Bestätigung erneut senden
              </button>
              <a className="btn ghost" href={`/bestellung/${o.token}`} target="_blank" rel="noreferrer">
                <Icon name="eye" size="s" /> Kundenansicht
              </a>
              {o.status === 'pending' && (
                <button className="btn danger" onClick={() => setStatus('cancelled', 'Bestellung stornieren? Der Lagerbestand wird zurückgebucht.')}>
                  Stornieren
                </button>
              )}
              {['paid', 'fulfilled'].includes(o.status) && (
                <button className="btn ghost danger" onClick={() => setStatus('refunded', 'Als erstattet markieren? Die Rückzahlung selbst erfolgt in Stripe bzw. per Überweisung.')}>
                  Als erstattet markieren
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

interface Coupon {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  min_total: number;
  max_uses: number | null;
  uses: number;
  valid_until: string | null;
  active: boolean;
}

export function Coupons() {
  const toast = useToast();
  const { data, reload } = useApi<{ coupons: Coupon[] }>('/api/coupons');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', kind: 'percent' as Coupon['kind'], value: '10', min: '', max: '', until: '' });
  const create = async () => {
    try {
      await api.post('/api/coupons', {
        code: f.code,
        kind: f.kind,
        value: f.kind === 'percent' ? Number(f.value) : Math.round(parseFloat(f.value) * 100),
        min_total: f.min ? Math.round(parseFloat(f.min) * 100) : 0,
        max_uses: f.max ? Number(f.max) : null,
        valid_until: f.until ? new Date(`${f.until}T23:59:59`).toISOString() : null,
      });
      setOpen(false);
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Gutscheine"
        actions={
          <button className="btn primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size="s" /> Gutschein
          </button>
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : !data.coupons.length ? (
          <Empty title="Noch keine Gutscheine">Zum Beispiel «SOMMER10» für 10 % Rabatt. Kundinnen geben den Code im Warenkorb ein.</Empty>
        ) : (
          <ul className="list">
            {data.coupons.map((c) => (
              <li key={c.id} className="list-item">
                <span className="mono" style={{ fontWeight: 650 }}>
                  {c.code}
                </span>
                <span className="grow small muted">
                  {c.kind === 'percent' ? `${c.value} %` : formatPrice(c.value)}
                  {c.min_total ? ` ab ${formatPrice(c.min_total)}` : ''} · {c.uses}
                  {c.max_uses ? `/${c.max_uses}` : ''} eingelöst{c.valid_until ? ` · bis ${formatDate(c.valid_until)}` : ''}
                </span>
                <Switch label={`${c.code} aktiv`} checked={c.active} onChange={(v) => void api.patch(`/api/coupons/${c.id}`, { active: v }).then(reload)} />
                <button
                  className="btn ghost s icon-only"
                  aria-label="Löschen"
                  onClick={async () => {
                    if (await confirm({ title: `${c.code} löschen?`, confirm: 'Löschen', danger: true })) {
                      await api.del(`/api/coupons/${c.id}`);
                      void reload();
                    }
                  }}
                >
                  <Icon name="trash" size="s" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={open} onOpenChange={setOpen} title="Neuer Gutschein">
        <div className="stack">
          <Field label="Code" help="Nur Buchstaben, Zahlen, - und _.">
            <input className="input mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} autoFocus />
          </Field>
          <div className="grid-2">
            <Field label="Art">
              <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Coupon['kind'] })}>
                <option value="percent">Prozent</option>
                <option value="fixed">Fester Betrag</option>
              </select>
            </Field>
            <Field label={f.kind === 'percent' ? 'Prozent' : 'Betrag (CHF)'}>
              <input className="input num" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
            <Field label="Ab Bestellwert (CHF)">
              <input className="input num" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="ohne" />
            </Field>
            <Field label="Höchstens einlösbar">
              <input className="input num" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="unbegrenzt" />
            </Field>
          </div>
          <Field label="Gültig bis">
            <input className="input" type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
          </Field>
        </div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={create} disabled={f.code.length < 3}>
            Anlegen
          </button>
        </div>
      </Dialog>
    </div>
  );
}
