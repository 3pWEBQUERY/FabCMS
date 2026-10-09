import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, useMediaQuery, formatDate } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { Dialog, Empty, Field, PageHead, Skeleton, confirm, Select } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { formatMoney, formatPrice, relativeTime } from '../../shared/text';
import { t, adminLang, adminLocale } from '../lib/i18n';

type Status = 'new' | 'contacted' | 'offer' | 'won' | 'lost';
const LANES: { id: Status; label: string }[] = [
  { id: 'new', label: 'Neu' },
  { id: 'contacted', label: 'Kontaktiert' },
  { id: 'offer', label: 'Offerte' },
  { id: 'won', label: 'Gewonnen' },
  { id: 'lost', label: 'Verloren' },
];

interface Contact {
  id: string;
  email: string | null;
  name: string;
  phone: string;
  company: string;
  status: Status;
  source: string;
  notes: { id: string; text: string; at: string; by: string }[];
  value_cents: number | null;
  submissions: number;
  last_contact: string | null;
  created_at: string;
  updated_at: string;
}

export function Contacts() {
  const toast = useToast();
  const { settings } = useSession();
  const { data, setData } = useApi<{ contacts: Contact[] }>('/api/contacts');
  const [over, setOver] = useState<Status | null>(null);
  const [adding, setAdding] = useState(false);
  const mobile = useMediaQuery('(max-width: 760px)');

  const move = async (id: string, status: Status) => {
    const prev = data;
    setData((d) => (d ? { contacts: d.contacts.map((c) => (c.id === id ? { ...c, status } : c)) } : d));
    try {
      await api.patch(`/api/contacts/${id}`, { status });
    } catch (e) {
      setData(prev);
      toast((e as Error).message, { kind: 'bad' });
    }
  };

  const pipeline = (status: Status) => (data?.contacts ?? []).filter((c) => c.status === status);
  const sum = (status: Status) => pipeline(status).reduce((s, c) => s + (c.value_cents ?? 0), 0);

  return (
    <div className="page wide">
      <PageHead
        back={
          <Link to="/inhalte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Inhalte')}
          </Link>
        }
        title={t('Kontakte')}
        sub={t('Jede Anfrage aus einem Formular landet hier. Zieh die Karten in die nächste Spalte, wenn sich etwas tut.')}
        actions={
          <>
            <a className="btn" href="/api/contacts?format=csv" download>
              <Icon name="download" size="s" /> CSV
            </a>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size="s" /> {t('Kontakt')}
            </button>
          </>
        }
      />
      {!data ? (
        <Skeleton lines={5} />
      ) : !data.contacts.length ? (
        <section className="card">
          <Empty title={t('Noch keine Kontakte')}>
            {t('Sobald jemand ein Formular mit E-Mail-Adresse absendet, erscheint die Person hier – mit Status, Notizen und allen Anfragen.')}
          </Empty>
        </section>
      ) : (
        <div className="kanban">
          {LANES.map((l) => (
            <section
              key={l.id}
              className={`lane ${over === l.id ? 'over' : ''}`}
              aria-label={t(l.label)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(l.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/contact');
                if (id) void move(id, l.id);
              }}
            >
              <header>
                <span>
                  {t(l.label)} <span className="faint">{pipeline(l.id).length}</span>
                </span>
                {sum(l.id) > 0 && <span className="xsmall muted num">{formatMoney(sum(l.id), settings?.shop.currency, adminLocale())}</span>}
              </header>
              {pipeline(l.id).map((c) => (
                <div
                  key={c.id}
                  className="lead-card"
                  draggable={!mobile}
                  onDragStart={(e) => e.dataTransfer.setData('text/contact', c.id)}
                  onClick={() => navigate(`/kontakte/${c.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/kontakte/${c.id}`)}
                >
                  <strong className="small ellipsis">{c.name || c.email}</strong>
                  {c.company && <span className="xsmall muted">{c.company}</span>}
                  <span className="xsmall faint">
                    {c.source || t('manuell')} · {relativeTime(c.last_contact ?? c.created_at, new Date(), adminLang())}
                  </span>
                  {mobile && (
                    // The card navigates on click/Enter; events from the list (portal) bubble here too.
                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Select
                        label={t('Status')}
                        value={c.status}
                        onChange={(v) => void move(c.id, v as Status)}
                        options={LANES.map((x) => ({ value: x.id, label: t(x.label) }))}
                      />
                    </span>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      <NewContact open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewContact({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', note: '' });
  const save = async () => {
    try {
      const { contact } = await api.post<{ contact: Contact }>('/api/contacts', { ...f, email: f.email || null });
      navigate(`/kontakte/${contact.id}`);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('Kontakt erfassen')}>
      <div className="stack">
        <div className="grid-2">
          <Field label={t('Name')}>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label={t('Firma')}>
            <input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
          </Field>
          <Field label={t('E-Mail')}>
            <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={t('Telefon')}>
            <input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label={t('Notiz')}>
          <textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <div className="dialog-actions">
        <button className="btn ghost" onClick={onClose}>
          {t('Abbrechen')}
        </button>
        <button className="btn primary" onClick={save} disabled={!f.name && !f.email}>
          {t('Speichern')}
        </button>
      </div>
    </Dialog>
  );
}

export function ContactDetail({ id }: { id: string }) {
  const { can, settings } = useSession();
  const toast = useToast();
  const { data, setData } = useApi<{
    contact: Contact;
    submissions: { id: string; form_name: string; data: Record<string, string>; created_at: string; fields: { name: string; label: string; type: string }[] }[];
    orders: { id: string; number: string; total: number; status: string; created_at: string }[];
  }>(`/api/contacts/${id}`);
  const [note, setNote] = useState('');
  if (!data)
    return (
      <div className="page">
        <Skeleton lines={6} />
      </div>
    );
  const c = data.contact;
  const patch = async (p: Record<string, unknown>) => {
    try {
      const r = await api.patch<{ contact: Contact }>(`/api/contacts/${id}`, p);
      setData({ ...data, contact: r.contact });
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/kontakte" className="crumb">
            <Icon name="chevronLeft" size="s" /> {t('Kontakte')}
          </Link>
        }
        title={c.name || c.email || t('Kontakt')}
        sub={[c.company, c.source && t('über «{source}»', { source: c.source })].filter(Boolean).join(' · ')}
        actions={
          <>
            {c.email && (
              <a className="btn" href={`mailto:${c.email}`}>
                <Icon name="mail" size="s" /> {t('E-Mail')}
              </a>
            )}
            {c.phone && (
              <a className="btn" href={`tel:${c.phone}`}>
                <Icon name="phone" size="s" /> {t('Anrufen')}
              </a>
            )}
          </>
        }
      />
      <div className="dash">
        <div className="stack">
          <section className="card card-pad stack">
            <h2 className="section-title">{t('Notizen')}</h2>
            <form
              className="stack tight"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                void patch({ note }).then(() => setNote(''));
              }}
            >
              <textarea
                className="textarea"
                placeholder={t('Was wurde besprochen? Was ist der nächste Schritt?')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ minHeight: '4rem' }}
              />
              <button className="btn primary" style={{ justifySelf: 'start' }} disabled={!note.trim()}>
                {t('Notiz speichern')}
              </button>
            </form>
            {[...c.notes].reverse().map((n) => (
              <div key={n.id} style={{ borderLeft: '2px solid var(--line-2)', paddingLeft: '0.75rem' }}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
                <p className="xsmall faint">
                  {n.by} · {formatDate(n.at, true)}
                </p>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-head">
              <h2>{t('Anfragen ({n})', { n: data.submissions.length })}</h2>
            </div>
            {data.submissions.map((s) => (
              <div key={s.id} className="card-pad" style={{ borderTop: '1px solid var(--line)' }}>
                <p className="small" style={{ fontWeight: 600 }}>
                  {s.form_name} · <span className="muted">{formatDate(s.created_at, true)}</span>
                </p>
                <dl className="small" style={{ margin: '0.4rem 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 1rem' }}>
                  {s.fields
                    .filter((f) => f.type !== 'step' && s.data[f.name])
                    .map((f) => (
                      <div key={f.name} style={{ display: 'contents' }}>
                        <dt className="muted">{f.label}</dt>
                        <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.data[f.name]}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </section>
        </div>
        <div className="stack">
          <section className="card card-pad stack">
            <Field label={t('Status')}>
              <Select value={c.status} onChange={(v) => void patch({ status: v })} options={LANES.map((l) => ({ value: l.id, label: t(l.label) }))} />
            </Field>
            <Field label={t('Möglicher Auftragswert')}>
              <div className="input-affix">
                <span>{settings?.shop.currency ?? 'CHF'}</span>
                <input
                  className="input num"
                  inputMode="decimal"
                  defaultValue={c.value_cents ? (c.value_cents / 100).toFixed(2) : ''}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'));
                    void patch({ value_cents: Number.isFinite(v) ? Math.round(v * 100) : null });
                  }}
                />
              </div>
            </Field>
            <Field label={t('Name')}>
              <input className="input" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && void patch({ name: e.target.value })} />
            </Field>
            <Field label={t('Firma')}>
              <input className="input" defaultValue={c.company} onBlur={(e) => e.target.value !== c.company && void patch({ company: e.target.value })} />
            </Field>
            <Field label={t('Telefon')}>
              <input className="input" defaultValue={c.phone} onBlur={(e) => e.target.value !== c.phone && void patch({ phone: e.target.value })} />
            </Field>
            <p className="xsmall faint">{t('Erfasst {date}', { date: formatDate(c.created_at) })}</p>
          </section>
          {data.orders.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2>{t('Bestellungen')}</h2>
              </div>
              <ul className="list">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link className="list-item" to={`/bestellungen/${o.id}`}>
                      <span className="grow">{o.number}</span>
                      <span className="num small">{formatPrice(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {can('privacy.manage') && (
            <button
              className="btn danger"
              style={{ justifySelf: 'start' }}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: t('Kontakt löschen?'),
                    message: t('Die Anfragen bleiben beim Formular erhalten. Für eine vollständige Löschung nutze «Daten & Datenschutz».'),
                    confirm: t('Löschen'),
                    danger: true,
                  }))
                )
                  return;
                await api.del(`/api/contacts/${id}`);
                navigate('/kontakte');
              }}
            >
              <Icon name="trash" size="s" /> {t('Kontakt löschen')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
