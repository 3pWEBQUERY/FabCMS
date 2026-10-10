import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { t } from '../lib/i18n';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Dialog, Empty, Field, PageHead, Segmented, Skeleton, Switch, confirm, DateInput, Select } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { formatMoney, formatPrice } from '../../shared/text';
import { isoDay } from '../../shared/dates';

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
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Bestellungen')}
        sub={
          data
            ? `${t('Umsatz bezahlt: {amount}', { amount: formatMoney(data.summary.revenue, settings?.shop.currency) })} · ${t('{n} zu versenden', { n: data.summary.to_ship })}`
            : undefined
        }
        actions={
          <a className="btn" href="/api/orders?format=csv" download>
            <Icon name="download" size="s" /> {t('CSV für die Buchhaltung')}
          </a>
        }
      />
      <div className="toolbar">
        <Segmented
          label={t('Status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('Alle') },
            { value: 'paid', label: t('Zu versenden') },
            { value: 'pending', label: t('Offen') },
            { value: 'fulfilled', label: t('Erledigt') },
          ]}
        />
      </div>
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : !data.orders.length ? (
          <Empty title={t('Keine Bestellungen')}>
            {status ? t('Mit diesem Status gibt es gerade nichts.') : t('Sobald jemand im Laden bestellt, erscheint die Bestellung hier – und du bekommst eine E-Mail.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Nummer')}</th>
                  <th>{t('Datum')}</th>
                  <th>{t('Kunde')}</th>
                  <th>{t('Status')}</th>
                  <th className="right">{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/bestellungen/${o.id}`)}>
                    <td className="mono">{o.number}</td>
                    <td>{formatDate(o.created_at, true)}</td>
                    <td>{o.customer.name}</td>
                    <td>
                      <span className={`badge ${STATUS[o.status].cls}`}>{t(STATUS[o.status].label)}</span>
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
  if (!data)
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    );
  const o = data.order;
  const setStatus = async (status: Order['status'], question?: string) => {
    if (question && !(await confirm({ title: question, confirm: t('Ja') }))) return;
    try {
      const r = await api.patch<{ order: Order }>(`/api/orders/${id}`, { status });
      setData(r);
      toast(t('Status geändert.'));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/bestellungen" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Bestellungen')}
          </Link>
        }
        title={t('Bestellung {number}', { number: o.number })}
        sub={`${formatDate(o.created_at, true)} · ${o.payment_method === 'stripe' ? t('Online bezahlt via Stripe') : t('Rechnung')}`}
        actions={
          <>
            <a className="btn" href={`/_nova/invoice/${o.id}`} target="_blank" rel="noreferrer">
              <Icon name="receipt" size="s" /> {t('Rechnung drucken')}
            </a>
            {can('orders.manage') && o.status === 'pending' && (
              <button className="btn primary" onClick={() => setStatus('paid', t('Zahlung eingegangen?'))}>
                {t('Als bezahlt markieren')}
              </button>
            )}
            {can('orders.manage') && o.status === 'paid' && (
              <button className="btn go" onClick={() => setStatus('fulfilled')}>
                <Icon name="check" size="s" /> {t('Versendet / erledigt')}
              </button>
            )}
          </>
        }
      />
      <div className="dash">
        <section className="card">
          <div className="card-head">
            <h2>{t('Artikel')}</h2>
            <span className={`badge ${STATUS[o.status].cls}`}>{t(STATUS[o.status].label)}</span>
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
                    <td>
                      {t('Rabatt')} {o.coupon && <span className="mono">({o.coupon})</span>}
                    </td>
                    <td className="right num">−{formatPrice(o.discount)}</td>
                  </tr>
                )}
                <tr>
                  <td>{o.customer.shippingMethod === 'pickup' ? t('Versand (Abholung)') : t('Versand (Post)')}</td>
                  <td className="right num">{formatPrice(o.shipping)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>{t('Total {currency}', { currency: o.currency })}</strong>
                    <div className="xsmall muted">{o.vat.map((v) => t('inkl. {rate} % MwSt. {amount}', { rate: v.rate, amount: formatPrice(v.amount) })).join(' · ')}</div>
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
            <h2 className="section-title">{t('Kunde')}</h2>
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
            {o.note && (
              <p className="small" style={{ whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--line-2)', paddingLeft: '0.6rem' }}>
                {o.note}
              </p>
            )}
          </section>
          {can('orders.manage') && (
            <section className="card card-pad stack tight">
              <button className="btn" onClick={() => api.post(`/api/orders/${id}/resend`).then(() => toast(t('Bestätigung erneut gesendet.')))}>
                <Icon name="mail" size="s" /> {t('Bestätigung erneut senden')}
              </button>
              <a className="btn ghost" href={`/bestellung/${o.token}`} target="_blank" rel="noreferrer">
                <Icon name="eye" size="s" /> {t('Kundenansicht')}
              </a>
              {o.status === 'pending' && (
                <button className="btn danger" onClick={() => setStatus('cancelled', t('Bestellung stornieren? Der Lagerbestand wird zurückgebucht.'))}>
                  {t('Stornieren')}
                </button>
              )}
              {['paid', 'fulfilled'].includes(o.status) && (
                <button
                  className="btn ghost danger"
                  onClick={() => setStatus('refunded', t('Als erstattet markieren? Die Rückzahlung selbst erfolgt in Stripe bzw. per Überweisung.'))}
                >
                  {t('Als erstattet markieren')}
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
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Gutscheine')}
        actions={
          <button className="btn primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size="s" /> {t('Gutschein')}
          </button>
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : !data.coupons.length ? (
          <Empty title={t('Noch keine Gutscheine')}>{t('Zum Beispiel «SOMMER10» für 10 % Rabatt. Kundinnen geben den Code im Warenkorb ein.')}</Empty>
        ) : (
          <ul className="list">
            {data.coupons.map((c) => (
              <li key={c.id} className="list-item">
                <span className="mono" style={{ fontWeight: 650 }}>
                  {c.code}
                </span>
                <span className="grow small muted">
                  {c.kind === 'percent' ? `${c.value} %` : formatPrice(c.value)}
                  {c.min_total ? ` ${t('ab {amount}', { amount: formatPrice(c.min_total) })}` : ''} · {t('{n} eingelöst', { n: c.max_uses ? `${c.uses}/${c.max_uses}` : c.uses })}
                  {c.valid_until ? ` · ${t('bis {date}', { date: formatDate(c.valid_until) })}` : ''}
                </span>
                <Switch label={t('{code} aktiv', { code: c.code })} checked={c.active} onChange={(v) => void api.patch(`/api/coupons/${c.id}`, { active: v }).then(reload)} />
                <button
                  className="btn ghost s icon-only"
                  aria-label={t('Löschen')}
                  onClick={async () => {
                    if (await confirm({ title: t('{code} löschen?', { code: c.code }), confirm: t('Löschen'), danger: true })) {
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
      <GiftCards />
      <Dialog open={open} onOpenChange={setOpen} title={t('Neuer Gutschein')}>
        <div className="stack">
          <Field label={t('Code')} help={t('Nur Buchstaben, Zahlen, - und _.')}>
            <input className="input mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} autoFocus />
          </Field>
          <div className="grid-2">
            <Field label={t('Art')}>
              <Select
                value={f.kind}
                onChange={(v) => setF({ ...f, kind: v as Coupon['kind'] })}
                options={[
                  { value: 'percent', label: t('Prozent') },
                  { value: 'fixed', label: t('Fester Betrag') },
                ]}
              />
            </Field>
            <Field label={f.kind === 'percent' ? t('Prozent') : t('Betrag (CHF)')}>
              <input className="input num" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            </Field>
            <Field label={t('Ab Bestellwert (CHF)')}>
              <input className="input num" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder={t('ohne')} />
            </Field>
            <Field label={t('Höchstens einlösbar')}>
              <input className="input num" inputMode="numeric" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder={t('unbegrenzt')} />
            </Field>
          </div>
          <Field label={t('Gültig bis')}>
            <DateInput label={t('Gültig bis')} value={f.until} min={isoDay(new Date())} onChange={(v) => setF({ ...f, until: v })} />
          </Field>
        </div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setOpen(false)}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" onClick={create} disabled={f.code.length < 3}>
            {t('Anlegen')}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

interface GiftCard {
  id: string;
  code: string;
  initial: number;
  balance: number;
  currency: string;
  email: string;
  note: string;
  active: boolean;
  valid_until: string | null;
  created_at: string;
  order_number: string | null;
  order_id: string | null;
  uses: number;
}

/** Gift cards sold in the shop or made by hand: what is left on each, and switching one off. */
function GiftCards() {
  const toast = useToast();
  const { can } = useSession();
  const { data, reload } = useApi<{ cards: GiftCard[] }>('/api/gift-cards');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: '50', email: '', name: '', note: '', until: '' });
  const create = async () => {
    try {
      const amount = Math.round(parseFloat(f.amount.replace(',', '.')) * 100);
      await api.post('/api/gift-cards', { amount, email: f.email || undefined, name: f.name || undefined, note: f.note || undefined, validUntil: f.until || null });
      setOpen(false);
      setF({ amount: '50', email: '', name: '', note: '', until: '' });
      toast(f.email ? t('Geschenkgutschein angelegt und verschickt.') : t('Geschenkgutschein angelegt.'));
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const open_ = (data?.cards ?? []).filter((c) => c.active && c.balance > 0).reduce((n, c) => n + c.balance, 0);
  return (
    <section className="card" style={{ marginTop: '1.5rem' }} aria-labelledby="gc-h">
      <div className="card-head">
        <div>
          <h2 id="gc-h">{t('Geschenkgutscheine')}</h2>
          {Boolean(data?.cards.length) && <p className="small muted">{t('Offenes Guthaben: {amount}', { amount: formatMoney(open_) })}</p>}
        </div>
        {can('orders.manage') && (
          <button className="btn s" onClick={() => setOpen(true)}>
            <Icon name="plus" size="s" /> {t('Von Hand anlegen')}
          </button>
        )}
      </div>
      {!data ? (
        <Skeleton />
      ) : !data.cards.length ? (
        <Empty title={t('Noch keine Geschenkgutscheine')}>
          {t('Mach ein Produkt zum Geschenkgutschein (Schalter «Geschenkgutschein» im Produkt). Nach der Zahlung geht der Code per Mail an die Käuferin.')}
        </Empty>
      ) : (
        <ul className="list">
          {data.cards.map((c) => (
            <li key={c.id} className="list-item">
              <span className="mono" style={{ fontWeight: 650 }}>
                {c.code}
              </span>
              <span className="grow small muted">
                {t('{left} von {initial} übrig', { left: formatMoney(c.balance, c.currency), initial: formatMoney(c.initial, c.currency) })}
                {c.order_number ? ` · ${t('Bestellung {number}', { number: c.order_number })}` : ` · ${t('von Hand')}`}
                {c.email ? ` · ${c.email}` : ''}
                {c.note ? ` · ${c.note}` : ''}
                {c.valid_until ? ` · ${t('bis {date}', { date: formatDate(c.valid_until) })}` : ''}
              </span>
              {can('orders.manage') && (
                <Switch label={t('{code} aktiv', { code: c.code })} checked={c.active} onChange={(v) => void api.patch(`/api/gift-cards/${c.id}`, { active: v }).then(reload)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('Geschenkgutschein anlegen')}
        description={t('Zum Beispiel am Ladentisch verkauft. Mit E-Mail-Adresse geht der Code gleich per Mail raus.')}
      >
        <div className="stack">
          <div className="grid-2">
            <Field label={t('Betrag (CHF)')}>
              <input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus />
            </Field>
            <Field label={t('Gültig bis')} help={t('Leer = unbegrenzt')}>
              <DateInput label={t('Gültig bis')} value={f.until} min={isoDay(new Date())} onChange={(v) => setF({ ...f, until: v })} />
            </Field>
            <Field label={t('E-Mail')} help={t('Leer = nur hier sichtbar')}>
              <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label={t('Name')}>
              <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
          <Field label={t('Notiz')} help={t('Nur intern, z. B. «Ladenverkauf, bar bezahlt».')}>
            <input className="input" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </div>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => setOpen(false)}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" onClick={create} disabled={!(parseFloat(f.amount.replace(',', '.')) >= 1)}>
            {t('Anlegen')}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
