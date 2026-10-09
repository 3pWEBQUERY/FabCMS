import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate, useApi } from '../lib/hooks';
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

function badge(m: Member) {
  if (m.status === 'blocked') return <span className="badge bad">Gesperrt</span>;
  if (!m.email_verified_at) return <span className="badge warn">Unbestätigt</span>;
  if (m.level === 'paid')
    return <span className="badge ok">{m.subscription_status === 'canceling' ? 'Zahlend, gekündigt' : m.subscription_status === 'past_due' ? 'Zahlung offen' : 'Zahlend'}</span>;
  return <span className="badge muted">Kostenlos</span>;
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
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
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
            <Icon name="chevronLeft" size="s" /> Inhalte
          </Link>
        }
        title="Mitglieder"
        sub={d ? `${d.counts.all} ${d.counts.all === 1 ? 'Konto' : 'Konten'}${d.counts.paid ? ` · ${d.counts.paid} zahlend` : ''}` : undefined}
        actions={
          <>
            <a className="btn" href="/api/members.csv" download>
              <Icon name="download" size="s" /> CSV
            </a>
            <button className="btn primary" onClick={() => setInviting(true)}>
              <Icon name="plus" size="s" /> Einladen
            </button>
          </>
        }
      />
      {settings && !settings.modules.includes('members') && (
        <p className="hint" role="note" style={{ marginBottom: '1rem' }}>
          <span>
            Das Modul ist noch aus. Schalte es unter <Link to="/einstellungen/module">Einstellungen → Module</Link> ein – dann gibt es «Anmelden» auf der Website.
          </span>
        </p>
      )}
      <div className="toolbar">
        <Segmented
          label="Bereich"
          value={tab}
          onChange={(t) => navigate(t === 'liste' ? '/mitglieder' : '/mitglieder?tab=einstellungen', { replace: true })}
          options={[
            { value: 'liste', label: 'Mitglieder' },
            { value: 'einstellungen', label: 'Mitgliedschaft' },
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
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `Alle ${d.counts.all}` },
                { value: 'paid', label: `Zahlend ${d.counts.paid}` },
                { value: 'free', label: 'Kostenlos' },
                { value: 'unverified', label: `Unbestätigt ${d.counts.unverified}` },
                ...(d.counts.blocked ? [{ value: 'blocked' as const, label: `Gesperrt ${d.counts.blocked}` }] : []),
              ]}
            />
            <input
              className="input"
              type="search"
              placeholder="Suchen …"
              aria-label="Mitglieder suchen"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ maxWidth: '16rem' }}
            />
          </div>
          <section className="card">
            {!d.members.length ? (
              <Empty title={term || filter !== 'all' ? 'Niemand gefunden' : 'Noch keine Mitglieder'}>
                {term || filter !== 'all'
                  ? undefined
                  : 'Wer sich auf der Website ein Konto erstellt, erscheint hier. Stell bei einer Seite oder einem Beitrag «Wer darf das sehen?» auf «Mitglieder» – alle anderen sehen dort eine Einladung.'}
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Seit</th>
                      <th>Zuletzt da</th>
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
                        <td className="small muted">{m.last_login_at ? relativeTime(m.last_login_at) : '–'}</td>
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
          planName={d?.settings.planName ?? 'Mitgliedschaft'}
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
        planName={d?.settings.planName ?? 'Mitgliedschaft'}
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
        title: `Konto von ${member.name || member.email} löschen?`,
        message: subscription ? 'Das laufende Abo bei Stripe wird sofort beendet. Das lässt sich nicht rückgängig machen.' : 'Das lässt sich nicht rückgängig machen.',
        confirm: 'Löschen',
        danger: true,
      }))
    )
      return;
    await api.del(`/api/members/${member.id}`);
    toast('Konto gelöscht.');
    onDeleted();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={member.name || member.email} description={member.email}>
      <div className="stack">
        <dl className="facts">
          <div>
            <dt>Status</dt>
            <dd>{badge(member)}</dd>
          </div>
          <div>
            <dt>Konto seit</dt>
            <dd>{formatDate(member.created_at)}</dd>
          </div>
          <div>
            <dt>Zuletzt angemeldet</dt>
            <dd>{member.last_login_at ? formatDate(member.last_login_at, true) : 'noch nie'}</dd>
          </div>
          {subscription && (
            <div>
              <dt>Abo</dt>
              <dd>
                {member.subscription_status === 'canceling'
                  ? `Gekündigt, läuft bis ${formatDate(member.paid_until)}`
                  : `Läuft${member.paid_until ? `, nächste Zahlung ${formatDate(member.paid_until)}` : ''}`}
                {member.stripe_customer && (
                  <>
                    {' · '}
                    <a href={`https://dashboard.stripe.com/customers/${member.stripe_customer}`} target="_blank" rel="noreferrer">
                      in Stripe <Icon name="external" size="s" />
                    </a>
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>
        {!subscription && (
          <Field label={`${planName} schenken bis`} help="Zum Beispiel für Vorstand, Presse oder wer bar bezahlt hat. Leer = kein geschenkter Zugang.">
            <div className="row">
              <DateInput value={until} onChange={setUntil} label={`${planName} schenken bis`} />
              <button
                className="btn"
                disabled={until === day(member.paid_until)}
                onClick={() => void patch({ paid_until: until || null }, until ? `Zugang bis ${formatDate(until)} gespeichert.` : 'Geschenkter Zugang entfernt.')}
              >
                Speichern
              </button>
            </div>
          </Field>
        )}
        <Field label="Interne Notiz" help="Sieht nur das Team.">
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== member.note && void patch({ note })} />
        </Field>
        <div className="dialog-actions">
          <button className="btn ghost danger-text" onClick={remove}>
            <Icon name="trash" size="s" /> Löschen
          </button>
          <span className="grow" />
          {member.status === 'blocked' ? (
            <button className="btn" onClick={() => void patch({ status: 'active' }, 'Konto wieder freigegeben.')}>
              Freigeben
            </button>
          ) : (
            <button className="btn" onClick={() => void patch({ status: 'blocked' }, 'Gesperrt. Alle Sitzungen sind beendet.')}>
              <Icon name="lock" size="s" /> Sperren
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            Fertig
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
      toast(`Einladung an ${email} verschickt.`);
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
      title="Mitglied einladen"
      description="Die Person bekommt eine E-Mail mit einem Link, über den sie ihr Passwort selbst festlegt."
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Name">
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="E-Mail">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={`${planName} schenken bis`} help="Optional.">
          <DateInput value={until} onChange={setUntil} label={`${planName} schenken bis`} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={busy} data-busy={busy || undefined}>
            Einladung schicken
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
      toast('Gespeichert.');
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
          <Field label="Wer kann ein Konto erstellen?">
            <Select
              label="Wer kann ein Konto erstellen?"
              value={f.registration}
              onChange={(v) => setF({ ...f, registration: v as MemberSettings['registration'] })}
              options={[
                { value: 'open', label: 'Alle, über «Konto erstellen»' },
                { value: 'invite', label: 'Nur wer eingeladen wird' },
              ]}
            />
          </Field>
          <Field label="Name der Mitgliedschaft">
            <input className="input" value={f.planName} maxLength={60} onChange={(e) => setF({ ...f, planName: e.target.value })} />
          </Field>
          <Field label="Preis" help="Leer lassen, wenn es keine bezahlte Mitgliedschaft gibt.">
            <div className="input-affix">
              <span>{currency}</span>
              <input className="input num" inputMode="decimal" value={f.priceText} placeholder="kostenlos" onChange={(e) => setF({ ...f, priceText: e.target.value })} />
            </div>
          </Field>
          <Field label="Abgerechnet">
            <Select
              label="Abgerechnet"
              value={f.interval}
              onChange={(v) => setF({ ...f, interval: v as MemberSettings['interval'] })}
              options={[
                { value: 'month', label: 'Monatlich' },
                { value: 'year', label: 'Jährlich' },
              ]}
            />
          </Field>
        </div>
        <Field label="Was Mitglieder bekommen" help="Eine Zeile pro Punkt. Erscheint auf der Einladung bei geschützten Inhalten und im Block «Mitgliedschaft».">
          <textarea
            className="textarea"
            rows={4}
            value={f.perks}
            maxLength={2000}
            onChange={(e) => setF({ ...f, perks: e.target.value })}
            placeholder={'Alle Beiträge ganz lesen\nMonatlicher Hintergrundbericht\nEinladung zum Jahresanlass'}
          />
        </Field>
        {body.price > 0 && (
          <p className="small muted">
            Mitglieder zahlen {formatMoney(body.price, currency)} pro {f.interval === 'year' ? 'Jahr' : 'Monat'} über Stripe und können jederzeit selbst kündigen.
          </p>
        )}
        <div className="row">
          <button className="btn primary" disabled={!dirty || busy} data-busy={busy || undefined} onClick={() => void save()}>
            Speichern
          </button>
        </div>
      </section>
      {body.price > 0 && (!data.stripe || !data.webhook) && (
        <p className="hint" role="note">
          <span>
            Für die bezahlte Mitgliedschaft fehlen in Railway noch {!data.stripe && <span className="mono">STRIPE_SECRET_KEY</span>}
            {!data.stripe && !data.webhook && ' und '}
            {!data.webhook && <span className="mono">STRIPE_WEBHOOK_SECRET</span>}. Der Webhook in Stripe braucht die Ereignisse checkout.session.completed,
            customer.subscription.updated und customer.subscription.deleted.
          </span>
        </p>
      )}
      <section className="card card-pad stack tight">
        <h2 style={{ fontSize: 'var(--t-m)', fontWeight: 650 }}>So schützt du Inhalte</h2>
        <p className="small muted">
          Bei jeder Seite und jedem Beitrag gibt es das Feld «Wer darf das sehen?»: Alle, nur angemeldete Mitglieder oder nur zahlende Mitglieder. Wer keinen Zugang hat, sieht
          Titel, Kurzfassung und eine Einladung – Suchmaschinen, RSS und die API ebenso. Der Block «Mitgliedschaft» zeigt Preis und Vorteile auf einer eigenen Seite.
        </p>
      </section>
    </div>
  );
}
