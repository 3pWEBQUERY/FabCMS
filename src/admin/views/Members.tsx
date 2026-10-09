import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
import { adminLang, t } from '../lib/i18n';
import { Link, navigate, usePath } from '../lib/router';
import { useSession } from '../lib/session';
import { Icon } from '../ui/icons';
import { DateInput, Dialog, Empty, Field, PageHead, Segmented, Select, Skeleton, confirm } from '../ui/kit';
import { useToast } from '../ui/toast';
import { formatMoney, relativeTime } from '../../shared/text';
import { useLeaveGuard } from './settingsDraft';

interface Member {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'blocked';
  email_verified_at: string | null;
  paid_until: string | null;
  stripe_customer: string | null;
  stripe_subscription: string | null;
  subscription_status: string;
  note: string;
  created_at: string;
  last_login_at: string | null;
  level: 'member' | 'paid';
}
interface MemberSettings {
  registration: 'open' | 'invite';
  planName: string;
  price: number;
  interval: 'month' | 'year';
  perks: string;
}
interface Data {
  members: Member[];
  counts: { all: number; paid: number; unverified: number; blocked: number };
  settings: MemberSettings;
  stripe: boolean;
  webhook: boolean;
}
type Filter = 'all' | 'paid' | 'free' | 'unverified' | 'blocked';

const chf = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(/\.00$/, '') : '');
const cents = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Math.round(Number(v.replace(',', '.')) * 100) || 0));
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
/** Fills {placeholders} in a translated sentence with elements. */
const rich = (text: string, parts: Record<string, ReactNode>) => text.split(/\{(\w+)\}/).map((s, i) => (i % 2 ? <Fragment key={i}>{parts[s]}</Fragment> : s));

function badge(m: Member) {
  if (m.status === 'blocked') return <span className="badge bad">{t('Gesperrt')}</span>;
  if (!m.email_verified_at) return <span className="badge warn">{t('Unbestätigt')}</span>;
  if (m.level === 'paid')
    return (
      <span className="badge ok">{m.subscription_status === 'canceling' ? t('Zahlend, gekündigt') : m.subscription_status === 'past_due' ? t('Zahlung offen') : t('Zahlend')}</span>
    );
  return <span className="badge muted">{t('Kostenlos')}</span>;
}

export function Members() {
  const { settings } = useSession();
  const { query } = usePath();
  const tab = query.get('tab') === 'einstellungen' ? 'einstellungen' : 'liste';
  const openId = query.get('id');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  const data = useApi<Data>(`/api/members?filter=${filter}&q=${encodeURIComponent(term)}`);
  const [inviting, setInviting] = useState(false);
  const d = data.data;
  const open = d?.members.find((m) => m.id === openId) ?? null;
  const close = () => navigate('/mitglieder', { replace: true });

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Mitglieder')}
        sub={
          d
            ? [d.counts.all === 1 ? t('1 Konto') : t('{n} Konten', { n: d.counts.all }), d.counts.paid ? t('{n} zahlend', { n: d.counts.paid }) : ''].filter(Boolean).join(' · ')
            : undefined
        }
        actions={
          <>
            <a className="btn" href="/api/members.csv" download>
              <Icon name="download" size="s" /> CSV
            </a>
            <button className="btn primary" onClick={() => setInviting(true)}>
              <Icon name="plus" size="s" /> {t('Einladen')}
            </button>
          </>
        }
      />
      {settings && !settings.modules.includes('members') && (
        <p className="hint" role="note" style={{ marginBottom: '1rem' }}>
          <span>
            {rich(t('Das Modul ist noch aus. Schalte es unter {link} ein – dann gibt es «Anmelden» auf der Website.'), {
              link: <Link to="/einstellungen/module">{t('Einstellungen → Module')}</Link>,
            })}
          </span>
        </p>
      )}
      <div className="toolbar">
        <Segmented
          label={t('Bereich')}
          value={tab}
          onChange={(v) => navigate(v === 'liste' ? '/mitglieder' : '/mitglieder?tab=einstellungen', { replace: true })}
          options={[
            { value: 'liste', label: t('Mitglieder') },
            { value: 'einstellungen', label: t('Mitgliedschaft') },
          ]}
        />
      </div>
      {!d ? (
        <section className="card">
          <Skeleton lines={5} />
        </section>
      ) : tab === 'einstellungen' ? (
        <PlanSettings data={d} onSaved={(s) => data.setData({ ...d, settings: s })} />
      ) : (
        <>
          <div className="toolbar">
            <Segmented
              label={t('Filter')}
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `${t('Alle')} ${d.counts.all}` },
                { value: 'paid', label: `${t('Zahlend')} ${d.counts.paid}` },
                { value: 'free', label: t('Kostenlos') },
                { value: 'unverified', label: `${t('Unbestätigt')} ${d.counts.unverified}` },
                ...(d.counts.blocked ? [{ value: 'blocked' as const, label: `${t('Gesperrt')} ${d.counts.blocked}` }] : []),
              ]}
            />
            <input
              className="input"
              type="search"
              placeholder={t('Suchen …')}
              aria-label={t('Mitglieder suchen')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: '16rem' }}
            />
          </div>
          <section className="card">
            {!d.members.length ? (
              <Empty title={term || filter !== 'all' ? t('Niemand gefunden') : t('Noch keine Mitglieder')}>
                {term || filter !== 'all'
                  ? undefined
                  : t(
                      'Wer sich auf der Website ein Konto erstellt, erscheint hier. Stell bei einer Seite oder einem Beitrag «Wer darf das sehen?» auf «Mitglieder» – alle anderen sehen dort eine Einladung.',
                    )}
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Name')}</th>
                      <th>{t('Status')}</th>
                      <th>{t('Seit')}</th>
                      <th>{t('Zuletzt da')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.members.map((m) => (
                      <tr key={m.id} className="clickable" onClick={() => navigate(`/mitglieder?id=${m.id}`, { replace: true })}>
                        <td>
                          <div className="ellipsis">{m.name || m.email}</div>
                          <div className="xsmall muted ellipsis">{m.email}</div>
                        </td>
                        <td>{badge(m)}</td>
                        <td>{formatDate(m.created_at)}</td>
                        <td className="small muted">{m.last_login_at ? relativeTime(m.last_login_at, new Date(), adminLang()) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {open && (
        <MemberDialog
          member={open}
          planName={d?.settings.planName ?? t('Mitgliedschaft')}
          onClose={close}
          onChanged={(m) => data.setData((x) => (x ? { ...x, members: x.members.map((y) => (y.id === m.id ? m : y)) } : x))}
          onDeleted={() => {
            close();
            void data.reload();
          }}
        />
      )}
      <InviteDialog
        open={inviting}
        planName={d?.settings.planName ?? t('Mitgliedschaft')}
        onClose={() => setInviting(false)}
        onDone={() => {
          setFilter('unverified');
          void data.reload();
        }}
      />
    </div>
  );
}

function MemberDialog({
  member,
  planName,
  onClose,
  onChanged,
  onDeleted,
}: {
  member: Member;
  planName: string;
  onClose: () => void;
  onChanged: (m: Member) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState(member.note);
  const [until, setUntil] = useState(day(member.paid_until));
  const subscription = member.stripe_subscription && ['active', 'trialing', 'past_due', 'canceling'].includes(member.subscription_status);
  const patch = async (body: Partial<{ status: string; paid_until: string | null; note: string }>, message?: string) => {
    try {
      const r = await api.patch<{ member: Member }>(`/api/members/${member.id}`, body);
      onChanged(r.member);
      if (message) toast(message);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async () => {
    if (
      !(await confirm({
        title: t('Konto von {name} löschen?', { name: member.name || member.email }),
        message: subscription ? t('Das laufende Abo bei Stripe wird sofort beendet. Das lässt sich nicht rückgängig machen.') : t('Das lässt sich nicht rückgängig machen.'),
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/members/${member.id}`);
    toast(t('Konto gelöscht.'));
    onDeleted();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={member.name || member.email} description={member.email}>
      <div className="stack">
        <dl className="facts">
          <div>
            <dt>{t('Status')}</dt>
            <dd>{badge(member)}</dd>
          </div>
          <div>
            <dt>{t('Konto seit')}</dt>
            <dd>{formatDate(member.created_at)}</dd>
          </div>
          <div>
            <dt>{t('Zuletzt angemeldet')}</dt>
            <dd>{member.last_login_at ? formatDate(member.last_login_at, true) : t('noch nie')}</dd>
          </div>
          {subscription && (
            <div>
              <dt>{t('Abo')}</dt>
              <dd>
                {member.subscription_status === 'canceling'
                  ? t('Gekündigt, läuft bis {date}', { date: formatDate(member.paid_until) })
                  : member.paid_until
                    ? t('Läuft, nächste Zahlung {date}', { date: formatDate(member.paid_until) })
                    : t('Läuft')}
                {member.stripe_customer && (
                  <>
                    {' · '}
                    <a href={`https://dashboard.stripe.com/customers/${member.stripe_customer}`} target="_blank" rel="noreferrer">
                      {t('in Stripe')} <Icon name="external" size="s" />
                    </a>
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>
        {!subscription && (
          <Field label={t('{plan} schenken bis', { plan: planName })} help={t('Zum Beispiel für Vorstand, Presse oder wer bar bezahlt hat. Leer = kein geschenkter Zugang.')}>
            <div className="row">
              <DateInput value={until} onChange={setUntil} label={t('{plan} schenken bis', { plan: planName })} />
              <button
                className="btn"
                disabled={until === day(member.paid_until)}
                onClick={() =>
                  void patch({ paid_until: until || null }, until ? t('Zugang bis {date} gespeichert.', { date: formatDate(until) }) : t('Geschenkter Zugang entfernt.'))
                }
              >
                {t('Speichern')}
              </button>
            </div>
          </Field>
        )}
        <Field label={t('Interne Notiz')} help={t('Sieht nur das Team.')}>
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== member.note && void patch({ note })} />
        </Field>
        <div className="dialog-actions">
          <button className="btn ghost danger-text" onClick={remove}>
            <Icon name="trash" size="s" /> {t('Löschen')}
          </button>
          <span className="grow" />
          {member.status === 'blocked' ? (
            <button className="btn" onClick={() => void patch({ status: 'active' }, t('Konto wieder freigegeben.'))}>
              {t('Freigeben')}
            </button>
          ) : (
            <button className="btn" onClick={() => void patch({ status: 'blocked' }, t('Gesperrt. Alle Sitzungen sind beendet.'))}>
              <Icon name="lock" size="s" /> {t('Sperren')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {t('Fertig')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function InviteDialog({ open, planName, onClose, onDone }: { open: boolean; planName: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/members', { email, name, paidUntil: until || null });
      toast(t('Einladung an {email} verschickt.', { email }));
      setEmail('');
      setName('');
      setUntil('');
      onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('Mitglied einladen')}
      description={t('Die Person bekommt eine E-Mail mit einem Link, über den sie ihr Passwort selbst festlegt.')}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('Name')}>
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('E-Mail')}>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('{plan} schenken bis', { plan: planName })} help={t('Optional.')}>
          <DateInput value={until} onChange={setUntil} label={t('{plan} schenken bis', { plan: planName })} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={busy} data-busy={busy || undefined}>
            {t('Einladung schicken')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PlanSettings({ data, onSaved }: { data: Data; onSaved: (s: MemberSettings) => void }) {
  const toast = useToast();
  const { settings } = useSession();
  const [f, setF] = useState({ ...data.settings, priceText: chf(data.settings.price) });
  const [busy, setBusy] = useState(false);
  const body = { registration: f.registration, planName: f.planName, price: cents(f.priceText), interval: f.interval, perks: f.perks };
  const dirty =
    JSON.stringify(body) !==
    JSON.stringify({
      registration: data.settings.registration,
      planName: data.settings.planName,
      price: data.settings.price,
      interval: data.settings.interval,
      perks: data.settings.perks,
    });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<{ settings: MemberSettings }>('/api/members/settings', body);
      onSaved(r.settings);
      setF({ ...r.settings, priceText: chf(r.settings.price) });
      toast(t('Gespeichert.'));
      return true;
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  useLeaveGuard(dirty, save, () => setF({ ...data.settings, priceText: chf(data.settings.price) }));
  const currency = settings?.shop.currency ?? 'CHF';
  return (
    <div className="stack">
      <section className="card card-pad stack">
        <div className="grid-2">
          <Field label={t('Wer kann ein Konto erstellen?')}>
            <Select
              label={t('Wer kann ein Konto erstellen?')}
              value={f.registration}
              onChange={(v) => setF({ ...f, registration: v as MemberSettings['registration'] })}
              options={[
                { value: 'open', label: t('Alle, über «Konto erstellen»') },
                { value: 'invite', label: t('Nur wer eingeladen wird') },
              ]}
            />
          </Field>
          <Field label={t('Name der Mitgliedschaft')}>
            <input className="input" value={f.planName} maxLength={60} onChange={(e) => setF({ ...f, planName: e.target.value })} />
          </Field>
          <Field label={t('Preis')} help={t('Leer lassen, wenn es keine bezahlte Mitgliedschaft gibt.')}>
            <div className="input-affix">
              <span>{currency}</span>
              <input className="input num" inputMode="decimal" value={f.priceText} placeholder={t('kostenlos')} onChange={(e) => setF({ ...f, priceText: e.target.value })} />
            </div>
          </Field>
          <Field label={t('Abgerechnet')}>
            <Select
              label={t('Abgerechnet')}
              value={f.interval}
              onChange={(v) => setF({ ...f, interval: v as MemberSettings['interval'] })}
              options={[
                { value: 'month', label: t('Monatlich') },
                { value: 'year', label: t('Jährlich') },
              ]}
            />
          </Field>
        </div>
        <Field label={t('Was Mitglieder bekommen')} help={t('Eine Zeile pro Punkt. Erscheint auf der Einladung bei geschützten Inhalten und im Block «Mitgliedschaft».')}>
          <textarea
            className="textarea"
            rows={4}
            value={f.perks}
            maxLength={2000}
            onChange={(e) => setF({ ...f, perks: e.target.value })}
            placeholder={[t('Alle Beiträge ganz lesen'), t('Monatlicher Hintergrundbericht'), t('Einladung zum Jahresanlass')].join('\n')}
          />
        </Field>
        {body.price > 0 && (
          <p className="small muted">
            {f.interval === 'year'
              ? t('Mitglieder zahlen {price} pro Jahr über Stripe und können jederzeit selbst kündigen.', { price: formatMoney(body.price, currency) })
              : t('Mitglieder zahlen {price} pro Monat über Stripe und können jederzeit selbst kündigen.', { price: formatMoney(body.price, currency) })}
          </p>
        )}
        <div className="row">
          <button className="btn primary" disabled={!dirty || busy} data-busy={busy || undefined} onClick={() => void save()}>
            {t('Speichern')}
          </button>
        </div>
      </section>
      {body.price > 0 && (!data.stripe || !data.webhook) && (
        <p className="hint" role="note">
          <span>
            {rich(
              !data.stripe && !data.webhook
                ? t('Für die bezahlte Mitgliedschaft fehlen in Railway noch {a} und {b}.')
                : t('Für die bezahlte Mitgliedschaft fehlen in Railway noch {a}.'),
              {
                a: <span className="mono">{data.stripe ? 'STRIPE_WEBHOOK_SECRET' : 'STRIPE_SECRET_KEY'}</span>,
                b: <span className="mono">STRIPE_WEBHOOK_SECRET</span>,
              },
            )}{' '}
            {t('Der Webhook in Stripe braucht die Ereignisse {a}, {b} und {c}.', {
              a: 'checkout.session.completed',
              b: 'customer.subscription.updated',
              c: 'customer.subscription.deleted',
            })}
          </span>
        </p>
      )}
      <section className="card card-pad stack tight">
        <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>{t('So schützt du Inhalte')}</h2>
        <p className="small muted">
          {t(
            'Bei jeder Seite und jedem Beitrag gibt es das Feld «Wer darf das sehen?»: Alle, nur angemeldete Mitglieder oder nur zahlende Mitglieder. Wer keinen Zugang hat, sieht Titel, Kurzfassung und eine Einladung – Suchmaschinen, RSS und die API ebenso. Der Block «Mitgliedschaft» zeigt Preis und Vorteile auf einer eigenen Seite.',
          )}
        </p>
      </section>
    </div>
  );
}
