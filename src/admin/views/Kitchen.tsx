import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { adminLocale, t, tl } from '../lib/i18n';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { Empty, Field, Menu, PageHead, Segmented, Skeleton, Switch, Toggle, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { formatMoney } from '../../shared/text';
import { FOOD_STATUS } from '../../shared/ordering';
import { useLeaveGuard } from './settingsDraft';

interface Order {
  id: string;
  number: number;
  mode: 'pickup' | 'delivery';
  slot_at: string;
  name: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  note: string;
  items: { title: string; size: string; q: number; price: number }[];
  total: number;
  currency: string;
  payment: 'online' | 'onsite';
  status: string;
  paid_at: string | null;
  created_at: string;
}
interface OrderingSettings {
  pickup: boolean;
  delivery: boolean;
  deliveryZips: string[];
  deliveryFee: number;
  deliveryMin: number;
  prepMinutes: number;
  slotMinutes: number;
  payOnSite: boolean;
  paused: boolean;
  note: string;
}
interface Data {
  orders: Order[];
  today: { count: number; revenue: number };
  settings: OrderingSettings;
  stripe: boolean;
  timezone: string;
  currency: string;
}

const LANES = [
  { id: 'new', label: 'Neu' },
  { id: 'preparing', label: 'In Zubereitung' },
  { id: 'ready', label: 'Bereit · unterwegs' },
] as const;

/** Fills {placeholders} in a translated sentence with elements. */
const rich = (text: string, parts: Record<string, ReactNode>) => text.split(/\{(\w+)\}/).map((s, i) => (i % 2 ? <Fragment key={i}>{parts[s]}</Fragment> : s));

/** Short beep for new orders (Web Audio, no file). */
function chime() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.start();
    o.stop(ctx.currentTime + 0.55);
  } catch {
    /* no audio */
  }
}

export function Kitchen() {
  const { can } = useSession();
  const { query } = usePath();
  const toast = useToast();
  const tab = query.get('tab') === 'einstellungen' ? 'einstellungen' : 'board';
  const data = useApi<Data>('/api/kitchen');
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem('nova-kitchen-sound') === '1';
    } catch {
      return false;
    }
  });
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // The board updates itself every 10 seconds; new orders light up (and beep, if wanted).
  useEffect(() => {
    const timer = setInterval(() => void data.reload(), 10_000);
    return () => clearInterval(timer);
  }, [data]);
  useEffect(() => {
    const ids = (data.data?.orders ?? []).filter((o) => o.status === 'new').map((o) => o.id);
    if (!data.data) return;
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    if (added.length) {
      added.forEach((id) => seen.current!.add(id));
      setFresh((f) => new Set([...f, ...added]));
      if (sound) chime();
    }
  }, [data.data, sound]);

  const d = data.data;
  const tz = d?.timezone ?? 'Europe/Zurich';
  const time = (iso: string) => new Date(iso).toLocaleTimeString(adminLocale(), { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const advance = async (o: Order, status: string) => {
    if (
      status === 'cancelled' &&
      !(await confirm({
        title: t('Bestellung {number} stornieren?', { number: o.number }),
        message: o.paid_at
          ? t('{name} bekommt eine E-Mail. Den bezahlten Betrag erstattest du im Stripe-Dashboard.', { name: o.name })
          : t('{name} bekommt eine E-Mail.', { name: o.name }),
        confirm: t('Stornieren'),
        danger: true,
      }))
    )
      return;
    try {
      await api.post(`/api/kitchen/${o.id}/status`, { status });
      setFresh((f) => {
        const n = new Set(f);
        n.delete(o.id);
        return n;
      });
      void data.reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const pause = async (paused: boolean) => {
    try {
      const r = await api.post<{ settings: OrderingSettings }>('/api/kitchen/pause', { paused });
      if (d) data.setData({ ...d, settings: r.settings });
      toast(paused ? t('Pausiert – auf der Website steht «Küche voll».') : t('Bestellungen sind wieder offen.'));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const next = (o: Order): { status: string; label: string } | null =>
    o.status === 'new'
      ? { status: 'preparing', label: t('Annehmen') }
      : o.status === 'preparing'
        ? o.mode === 'delivery'
          ? { status: 'out', label: t('Unterwegs') }
          : { status: 'ready', label: t('Bereit') }
        : o.status === 'ready' || o.status === 'out'
          ? { status: 'done', label: o.mode === 'delivery' ? t('Geliefert') : t('Abgeholt') }
          : null;

  const lane = (id: string) => (d?.orders ?? []).filter((o) => (id === 'ready' ? o.status === 'ready' || o.status === 'out' : o.status === id));
  const finished = (d?.orders ?? []).filter((o) => o.status === 'done' || o.status === 'cancelled');

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Küche')}
        sub={d ? `${d.today.count === 1 ? t('Heute 1 Bestellung') : t('Heute {n} Bestellungen', { n: d.today.count })} · ${formatMoney(d.today.revenue, d.currency)}` : undefined}
        actions={
          d && (
            <>
              <label className="row small" style={{ gap: '.5rem' }}>
                <Switch
                  checked={sound}
                  onChange={(v) => {
                    setSound(v);
                    try {
                      localStorage.setItem('nova-kitchen-sound', v ? '1' : '0');
                    } catch {
                      /* private mode */
                    }
                    if (v) chime();
                  }}
                  label={t('Ton bei neuen Bestellungen')}
                />
                {t('Ton')}
              </label>
              <button className={`btn ${d.settings.paused ? 'primary' : ''}`} onClick={() => void pause(!d.settings.paused)}>
                <Icon name={d.settings.paused ? 'publish' : 'clock'} size="s" /> {d.settings.paused ? t('Wieder öffnen') : t('Küche voll – pausieren')}
              </button>
            </>
          )
        }
      />
      {d?.settings.paused && (
        <p className="hint" role="status" style={{ marginBottom: '1rem', background: 'color-mix(in srgb, var(--bad) 12%, var(--panel))' }}>
          <span>{t('Pausiert: Auf der Website können gerade keine Bestellungen aufgegeben werden.')}</span>
        </p>
      )}
      {can('settings.manage') && (
        <div className="toolbar">
          <Segmented
            label={t('Bereich')}
            value={tab}
            onChange={(v) => navigate(v === 'board' ? '/kueche' : '/kueche?tab=einstellungen', { replace: true })}
            options={[
              { value: 'board', label: t('Bestellungen') },
              { value: 'einstellungen', label: t('Einstellungen') },
            ]}
          />
        </div>
      )}
      {!d ? (
        <Skeleton lines={6} />
      ) : tab === 'einstellungen' ? (
        <OrderingSettingsForm settings={d.settings} stripe={d.stripe} currency={d.currency} onSaved={(s) => data.setData({ ...d, settings: s })} />
      ) : !d.orders.length ? (
        <section className="card">
          <Empty title={t('Noch keine Bestellungen heute')}>
            {rich(t('Neue Bestellungen erscheinen hier von selbst. Auf der Website bestellen Gäste unter {link} – verlinke die Seite im Menü.'), {
              link: (
                <a href="/bestellen" target="_blank" rel="noreferrer">
                  /bestellen
                </a>
              ),
            })}
          </Empty>
        </section>
      ) : (
        <>
          <div className="kanban kitchen">
            {LANES.map((l) => (
              <section key={l.id} className="lane" aria-label={t(l.label)}>
                <header>
                  <span>
                    {t(l.label)} <span className="faint">{lane(l.id).length}</span>
                  </span>
                </header>
                {lane(l.id).map((o) => {
                  const n = next(o);
                  return (
                    <article key={o.id} className={`ko${fresh.has(o.id) ? ' fresh' : ''}`}>
                      <div className="ko-head">
                        <strong className="ko-no num">{o.number}</strong>
                        <span className={`badge ${o.mode === 'delivery' ? 'warn' : 'muted'}`}>{o.mode === 'delivery' ? t('Liefern') : t('Abholen')}</span>
                        <span className="ko-time num">{time(o.slot_at)}</span>
                      </div>
                      <ul className="ko-items">
                        {o.items.map((i, k) => (
                          <li key={k}>
                            <b className="num">{i.q}×</b> {i.title}
                            {i.size && <span className="muted"> {i.size}</span>}
                          </li>
                        ))}
                      </ul>
                      {o.note && <p className="ko-note">{o.note}</p>}
                      <p className="xsmall muted">
                        {o.name} · <a href={`tel:${o.phone.replace(/[^+\d]/g, '')}`}>{o.phone}</a>
                        {o.mode === 'delivery' && (
                          <>
                            <br />
                            {o.street}, {o.zip} {o.city}
                          </>
                        )}
                      </p>
                      <div className="ko-foot">
                        <span className="small num">
                          {formatMoney(o.total, o.currency)}{' '}
                          <span className={o.payment === 'online' ? 'ok-text' : 'muted'}>· {o.payment === 'online' ? t('bezahlt') : t('vor Ort')}</span>
                        </span>
                        <span className="grow" />
                        <Menu
                          trigger={
                            <button className="btn ghost small" aria-label={t('Mehr zu Bestellung {number}', { number: o.number })}>
                              <Icon name="more" size="s" />
                            </button>
                          }
                          items={[
                            { label: t('Bon drucken'), icon: 'receipt', onSelect: () => window.open(`/api/kitchen/${o.id}/bon`, '_blank', 'width=420,height=640') },
                            { label: t('Stornieren'), icon: 'trash', danger: true, onSelect: () => void advance(o, 'cancelled') },
                          ]}
                        />
                        {n && (
                          <button className="btn primary small" onClick={() => void advance(o, n.status)}>
                            {n.label}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
          {finished.length > 0 && (
            <section className="card" style={{ marginTop: '1.25rem' }}>
              <div className="card-head">
                <h2>{t('Erledigt heute')}</h2>
              </div>
              <div className="list">
                {finished.map((o) => (
                  <div key={o.id} className="list-item">
                    <span className="num" style={{ width: '2.5rem', fontWeight: 650 }}>
                      {o.number}
                    </span>
                    <span className="grow ellipsis">
                      {o.name} <span className="muted small">{o.items.map((i) => `${i.q}× ${i.title}`).join(', ')}</span>
                    </span>
                    <span className="small num">{time(o.slot_at)}</span>
                    <span className={`badge ${o.status === 'done' ? 'ok' : 'muted'}`}>{tl(FOOD_STATUS[o.status]?.label ?? o.status)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const chf = (c: number) => (c ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');
const cents = (v: string) => Math.max(0, Math.round(Number(v.replace(',', '.')) * 100) || 0);

function OrderingSettingsForm({ settings, stripe, currency, onSaved }: { settings: OrderingSettings; stripe: boolean; currency: string; onSaved: (s: OrderingSettings) => void }) {
  const toast = useToast();
  const initial = { ...settings, zipsText: settings.deliveryZips.join(', '), feeText: chf(settings.deliveryFee), minText: chf(settings.deliveryMin) };
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const body = {
    pickup: f.pickup,
    delivery: f.delivery,
    deliveryZips: f.zipsText.split(/[,;\s]+/).filter(Boolean),
    deliveryFee: cents(f.feeText),
    deliveryMin: cents(f.minText),
    prepMinutes: Number(f.prepMinutes) || 30,
    slotMinutes: Number(f.slotMinutes) || 15,
    payOnSite: f.payOnSite,
    note: f.note,
  };
  const dirty =
    JSON.stringify(body) !==
    JSON.stringify({
      pickup: settings.pickup,
      delivery: settings.delivery,
      deliveryZips: settings.deliveryZips,
      deliveryFee: settings.deliveryFee,
      deliveryMin: settings.deliveryMin,
      prepMinutes: settings.prepMinutes,
      slotMinutes: settings.slotMinutes,
      payOnSite: settings.payOnSite,
      note: settings.note,
    });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<{ settings: OrderingSettings }>('/api/kitchen/settings', body);
      onSaved(r.settings);
      toast(t('Gespeichert.'));
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  useLeaveGuard(dirty, save, () => setF(initial));
  return (
    <section className="card card-pad stack">
      <Toggle checked={f.pickup} onChange={(v) => setF({ ...f, pickup: v })} label={t('Abholen')} help={t('Gäste holen die Bestellung selbst ab.')} />
      <Toggle checked={f.delivery} onChange={(v) => setF({ ...f, delivery: v })} label={t('Liefern')} help={t('Nur in die Postleitzahlen unten.')} />
      {f.delivery && (
        <div className="grid-2">
          <Field label={t('Postleitzahlen')} help={t('Mit Komma getrennt, z. B. «8400, 8404, 8406».')}>
            <input className="input" value={f.zipsText} onChange={(e) => setF({ ...f, zipsText: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label={t('Liefergebühr')}>
              <div className="input-affix">
                <span>{currency}</span>
                <input className="input num" inputMode="decimal" value={f.feeText} placeholder={t('gratis')} onChange={(e) => setF({ ...f, feeText: e.target.value })} />
              </div>
            </Field>
            <Field label={t('Mindestbestellwert')}>
              <div className="input-affix">
                <span>{currency}</span>
                <input className="input num" inputMode="decimal" value={f.minText} placeholder={t('keiner')} onChange={(e) => setF({ ...f, minText: e.target.value })} />
              </div>
            </Field>
          </div>
        </div>
      )}
      <div className="grid-2">
        <Field label={t('Zubereitungszeit in Minuten')} help={t('So früh kann man frühestens bestellen.')}>
          <input className="input num" type="number" min={5} max={1440} value={f.prepMinutes} onChange={(e) => setF({ ...f, prepMinutes: Number(e.target.value) })} />
        </Field>
        <Field label={t('Zeitfenster alle … Minuten')}>
          <input className="input num" type="number" min={5} max={120} value={f.slotMinutes} onChange={(e) => setF({ ...f, slotMinutes: Number(e.target.value) })} />
        </Field>
      </div>
      <Toggle
        checked={f.payOnSite}
        onChange={(v) => setF({ ...f, payOnSite: v })}
        label={t('Bezahlen vor Ort erlauben')}
        help={stripe ? t('Bar oder TWINT bei Abholung/Lieferung, zusätzlich zu online.') : t('Ohne Stripe ist das die einzige Möglichkeit.')}
      />
      <Field label={t('Hinweis auf der Bestellseite')} help={t('z. B. «Bestellungen bis 20:30, Lieferung bis 21:15».')}>
        <input className="input" value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
      <p className="small muted">{t('Die Zeiten richten sich nach den Öffnungszeiten. Welche Gerichte bestellbar sind, stellst du beim Gericht ein («Online bestellbar»).')}</p>
      <div className="row">
        <button className="btn primary" disabled={!dirty || busy} data-busy={busy || undefined} onClick={() => void save()}>
          {t('Speichern')}
        </button>
      </div>
    </section>
  );
}
