import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { Link, navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { Dialog, Empty, Field, PageHead, Segmented, Skeleton, Toggle, confirm, Select } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { shortId, slugify } from '../../shared/text';
import type { FormDef, FormFieldDef } from '../../shared/types';

type FormRow = FormDef & { submissions: number; unread: number };

const TYPES: { value: FormFieldDef['type']; label: string; icon: string }[] = [
  { value: 'text', label: 'Kurzer Text', icon: 'text' },
  { value: 'email', label: 'E-Mail', icon: 'mail' },
  { value: 'tel', label: 'Telefon', icon: 'phone' },
  { value: 'textarea', label: 'Langer Text', icon: 'posts' },
  { value: 'select', label: 'Auswahl', icon: 'chevronDown' },
  { value: 'checkbox', label: 'Häkchen', icon: 'check' },
  { value: 'date', label: 'Datum', icon: 'calendar' },
  { value: 'number', label: 'Zahl', icon: 'stats' },
  { value: 'file', label: 'Datei-Upload', icon: 'upload' },
  { value: 'step', label: 'Neuer Schritt', icon: 'arrowRight' },
];

export function FormsList() {
  const { can } = useSession();
  const toast = useToast();
  const { data } = useApi<{ forms: FormRow[] }>('/api/forms');
  const create = async () => {
    try {
      const { form } = await api.post<{ form: FormDef }>('/api/forms', {
        name: 'Neues Formular',
        fields: [
          { id: shortId(8), type: 'text', label: 'Name', name: 'name', required: true },
          { id: shortId(8), type: 'email', label: 'E-Mail', name: 'e_mail', required: true },
          { id: shortId(8), type: 'textarea', label: 'Nachricht', name: 'nachricht', required: true },
        ],
        settings: { submitLabel: 'Senden', successMessage: 'Danke! Wir melden uns bald.', notifyEmail: '', createLead: true, turnstile: false },
      });
      navigate(`/formulare/${form.id}?tab=fields`);
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
        title="Formulare"
        sub="Ohne Rätsel-CAPTCHA: Spam fängt Nova mit unsichtbarem Feld, Zeitprüfung und Rate-Limit ab."
        actions={
          can('forms.manage') && (
            <button className="btn primary" onClick={create}>
              <Icon name="plus" size="s" /> Neues Formular
            </button>
          )
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : !data.forms.length ? (
          <Empty title="Noch keine Formulare" action={<button className="btn primary" onClick={create}>Erstes Formular anlegen</button>}>
            Ein Kontaktformular ist ein guter Anfang. Einbauen kannst du es danach mit dem Block «Formular».
          </Empty>
        ) : (
          <ul className="list">
            {data.forms.map((f) => (
              <li key={f.id}>
                <Link to={`/formulare/${f.id}`} className="list-item">
                  <Icon name="form" className="faint" />
                  <div className="grow">
                    <div className="title">{f.name}</div>
                    <div className="xsmall muted">
                      {f.fields.filter((x) => x.type !== 'step').length} Felder · {f.submissions} Einträge
                    </div>
                  </div>
                  {f.unread > 0 && <span className="badge sel">{f.unread} neu</span>}
                  <Icon name="chevronRight" size="s" className="faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FieldRow({ f, all, onChange, onRemove }: { f: FormFieldDef; all: FormFieldDef[]; onChange: (f: FormFieldDef) => void; onRemove: () => void }) {
  const { pro } = useSession();
  const controls = useDragControls();
  const [open, setOpen] = useState(false);
  const type = TYPES.find((t) => t.value === f.type)!;
  if (f.type === 'step')
    return (
      <Reorder.Item value={f} dragListener={false} dragControls={controls} className="repeat-item" style={{ listStyle: 'none', background: 'var(--sunken)' }}>
        <header onPointerDown={(e) => !(e.target as HTMLElement).closest('input,button') && controls.start(e)}>
          <span className="grip">
            <Icon name="grip" size="s" />
          </span>
          <Icon name="arrowRight" size="s" className="faint" />
          <input className="input" style={{ border: 0, background: 'transparent', fontWeight: 600 }} value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} aria-label="Name des Schritts" />
          <button className="btn ghost s icon-only" onClick={onRemove} aria-label="Schritt entfernen">
            <Icon name="trash" size="s" />
          </button>
        </header>
      </Reorder.Item>
    );
  const others = all.filter((x) => x.id !== f.id && ['select', 'checkbox'].includes(x.type));
  return (
    <Reorder.Item value={f} dragListener={false} dragControls={controls} className="repeat-item" style={{ listStyle: 'none' }} whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-3)', zIndex: 4 }}>
      <header onPointerDown={(e) => !(e.target as HTMLElement).closest('button') && controls.start(e)}>
        <span className="grip">
          <Icon name="grip" size="s" />
        </span>
        <Icon name={type.icon} size="s" className="faint" />
        <button className="title ellipsis" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: '0.3rem 0' }} onClick={() => setOpen(!open)}>
          {f.label}
          {f.required && <span className="faint"> *</span>}
          {f.showIf?.field && <span className="badge" style={{ marginLeft: 6 }}>bedingt</span>}
        </button>
        <span className="xsmall faint hide-m">{type.label}</span>
        <button className="btn ghost s icon-only" onClick={onRemove} aria-label="Feld entfernen">
          <Icon name="trash" size="s" />
        </button>
        <button className="btn ghost s icon-only" onClick={() => setOpen(!open)} aria-label={open ? 'Zuklappen' : 'Bearbeiten'}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size="s" />
        </button>
      </header>
      {open && (
        <div className="body">
          <div className="grid-2">
            <Field label="Beschriftung">
              <input className="input" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value, name: pro ? f.name : slugify(e.target.value).replace(/-/g, '_') })} />
            </Field>
            <Field label="Art">
              <Select value={f.type} onChange={(v) => onChange({ ...f, type: v as FormFieldDef['type'] })} options={TYPES.filter((t) => t.value !== 'step')} />
            </Field>
          </div>
          {f.type === 'select' && (
            <Field label="Auswahlmöglichkeiten" help="Eine pro Zeile.">
              <textarea className="textarea" value={(f.options ?? []).join('\n')} onChange={(e) => onChange({ ...f, options: e.target.value.split('\n') })} onBlur={() => onChange({ ...f, options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })} />
            </Field>
          )}
          <div className="grid-2">
            <Field label="Hilfetext">
              <input className="input" value={f.help ?? ''} onChange={(e) => onChange({ ...f, help: e.target.value })} />
            </Field>
            {!['checkbox', 'select', 'file', 'date'].includes(f.type) && (
              <Field label="Platzhalter">
                <input className="input" value={f.placeholder ?? ''} onChange={(e) => onChange({ ...f, placeholder: e.target.value })} />
              </Field>
            )}
          </div>
          <Toggle checked={f.required} onChange={(v) => onChange({ ...f, required: v })} label="Pflichtfeld" />
          {others.length > 0 && (
            <Field label="Nur zeigen, wenn …" help="Zum Beispiel: «Firma» nur, wenn bei «Kundenart» «Geschäftlich» gewählt ist.">
              <div className="grid-2" style={{ gap: '0.5rem' }}>
                <Select
                  label="Abhängig von Feld"
                  value={f.showIf?.field ?? ''}
                  onChange={(v) => onChange({ ...f, showIf: v ? { field: v, equals: f.showIf?.equals ?? '' } : null })}
                  options={[{ value: '', label: '– immer zeigen –' }, ...others.map((o) => ({ value: o.name, label: o.label }))]}
                />
                {f.showIf?.field && (
                  <Select
                    label="Wert"
                    placeholder="Bitte wählen"
                    value={f.showIf.equals}
                    onChange={(v) => onChange({ ...f, showIf: { field: f.showIf!.field, equals: v } })}
                    options={(() => {
                      const src = others.find((o) => o.name === f.showIf!.field);
                      if (src?.type === 'checkbox') return [{ value: 'ja', label: 'angehakt' }];
                      return [...new Set(src?.options ?? [])].filter(Boolean).map((o) => ({ value: o, label: o }));
                    })()}
                  />
                )}
              </div>
            </Field>
          )}
          {pro && (
            <Field label="Technischer Name" keyName="name" help="Schlüssel in Einträgen, CSV und Webhooks.">
              <input className="input mono" value={f.name} onChange={(e) => onChange({ ...f, name: e.target.value })} />
            </Field>
          )}
        </div>
      )}
    </Reorder.Item>
  );
}

interface Submission {
  id: string;
  data: Record<string, string>;
  files: { field: string; media: string; filename: string }[];
  page: string;
  read: boolean;
  created_at: string;
}

export function FormDetail({ id }: { id: string }) {
  const { can, settings } = useSession();
  const toast = useToast();
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<'entries' | 'fields' | 'settings'>((params.get('tab') as 'fields') ?? 'entries');
  const subs = useApi<{ form: FormDef; submissions: Submission[] }>(`/api/forms/${id}/submissions`);
  const [form, setForm] = useState<FormDef | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<Submission | null>(null);
  useEffect(() => {
    if (subs.data && !form) setForm(subs.data.form);
  }, [subs.data, form]);

  const update = (patch: Partial<FormDef>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
  };
  const save = async () => {
    if (!form) return;
    try {
      const r = await api.put<{ form: FormDef }>(`/api/forms/${id}`, { name: form.name, fields: form.fields, settings: form.settings });
      setForm(r.form);
      setDirty(false);
      toast('Formular gespeichert.');
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async () => {
    const n = subs.data?.submissions.length ?? 0;
    if (!(await confirm({ title: 'Formular löschen?', message: n ? `Mit ${n} Einträgen. Exportiere sie vorher, wenn du sie brauchst.` : undefined, confirm: 'Löschen', danger: true }))) return;
    await api.del(`/api/forms/${id}?force=1`);
    navigate('/formulare');
  };
  const openSub = async (s: Submission) => {
    setOpen(s);
    if (!s.read) {
      await api.patch(`/api/submissions/${s.id}`, { read: true });
      subs.setData((d) => (d ? { ...d, submissions: d.submissions.map((x) => (x.id === s.id ? { ...x, read: true } : x)) } : d));
    }
  };

  if (!form || !subs.data) return <div className="page"><Skeleton lines={6} /></div>;
  const fields = form.fields.filter((f) => f.type !== 'step');
  const preview = fields.slice(0, 3);

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/formulare" className="crumb">
            <Icon name="chevronLeft" size="s" /> Formulare
          </Link>
        }
        title={form.name}
        actions={
          <>
            <Segmented
              label="Bereich"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'entries', label: `Einträge (${subs.data.submissions.length})` },
                ...(can('forms.manage') ? [{ value: 'fields' as const, label: 'Felder' }, { value: 'settings' as const, label: 'Einstellungen' }] : []),
              ]}
            />
            {tab === 'entries' && (
              <a className="btn" href={`/api/forms/${id}/submissions?format=csv`} download>
                <Icon name="download" size="s" /> CSV
              </a>
            )}
          </>
        }
      />
      {tab === 'entries' && (
        <section className="card">
          {!subs.data.submissions.length ? (
            <Empty title="Noch keine Einträge">Sobald jemand das Formular absendet, erscheint es hier{settings?.business.email ? ` und per E-Mail an ${form.settings.notifyEmail || settings.business.email}` : ''}.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    {preview.map((f) => (
                      <th key={f.id}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subs.data.submissions.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => void openSub(s)} style={{ fontWeight: s.read ? 400 : 650 }}>
                      <td className="nowrap">
                        {!s.read && <span className="dot sel" style={{ display: 'inline-block', marginRight: 6 }} />}
                        {formatDate(s.created_at, true)}
                      </td>
                      {preview.map((f) => (
                        <td key={f.id} className="ellipsis" style={{ maxWidth: '16rem' }}>
                          {s.data[f.name] || '–'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {tab === 'fields' && (
        <div className="stack">
          <Reorder.Group axis="y" values={form.fields} onReorder={(next) => update({ fields: next })} style={{ padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {form.fields.map((f) => (
              <FieldRow key={f.id} f={f} all={form.fields} onChange={(nf) => update({ fields: form.fields.map((x) => (x.id === f.id ? nf : x)) })} onRemove={() => update({ fields: form.fields.filter((x) => x.id !== f.id) })} />
            ))}
          </Reorder.Group>
          <div className="row wrap">
            {TYPES.map((t) => (
              <button
                key={t.value}
                className="btn s"
                onClick={() =>
                  update({
                    fields: [
                      ...form.fields,
                      { id: shortId(8), type: t.value, label: t.value === 'step' ? 'Schritt 2' : t.label, name: slugify(t.label).replace(/-/g, '_') + '_' + shortId(3), required: false, options: t.value === 'select' ? ['Option A', 'Option B'] : undefined },
                    ],
                  })
                }
              >
                <Icon name="plus" size="s" /> {t.label}
              </button>
            ))}
          </div>
          <p className="xsmall muted">«Neuer Schritt» teilt lange Formulare in Etappen. Ohne JavaScript erscheinen alle Schritte untereinander.</p>
        </div>
      )}
      {tab === 'settings' && (
        <section className="card form-section">
          <Field label="Name" htmlFor="f-name">
            <input id="f-name" className="input" value={form.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Beschriftung des Knopfs" htmlFor="f-sub">
              <input id="f-sub" className="input" value={form.settings.submitLabel} onChange={(e) => update({ settings: { ...form.settings, submitLabel: e.target.value } })} />
            </Field>
            <Field label="Benachrichtigung an" htmlFor="f-mail" help={`Leer = ${settings?.business.email || 'Kontakt-E-Mail aus den Einstellungen'}`}>
              <input id="f-mail" className="input" type="email" value={form.settings.notifyEmail} onChange={(e) => update({ settings: { ...form.settings, notifyEmail: e.target.value } })} />
            </Field>
          </div>
          <Field label="Bestätigung nach dem Absenden" htmlFor="f-ok">
            <textarea id="f-ok" className="textarea" value={form.settings.successMessage} onChange={(e) => update({ settings: { ...form.settings, successMessage: e.target.value } })} />
          </Field>
          <Toggle checked={form.settings.createLead} onChange={(v) => update({ settings: { ...form.settings, createLead: v } })} label="Als Kontakt speichern" help="Anfragen mit E-Mail erscheinen unter «Kontakte» mit Status und Notizen." />
          <Toggle
            checked={form.settings.turnstile}
            onChange={(v) => update({ settings: { ...form.settings, turnstile: v } })}
            label="Zusätzlicher Spamschutz (Cloudflare Turnstile)"
            help="Unsichtbar für Menschen. Braucht TURNSTILE_SITE_KEY und TURNSTILE_SECRET in den Railway-Variablen."
          />
          <div className="row">
            <button className="btn danger" onClick={remove}>
              <Icon name="trash" size="s" /> Formular löschen
            </button>
          </div>
        </section>
      )}
      {dirty && (
        <div className="save-bar">
          <span>Ungespeicherte Änderungen am Formular</span>
          <div className="row">
            <button className="btn ghost" onClick={() => (setForm(subs.data!.form), setDirty(false))}>
              Verwerfen
            </button>
            <button className="btn primary" onClick={save}>
              Speichern
            </button>
          </div>
        </div>
      )}
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open ? `Eintrag vom ${formatDate(open.created_at, true)}` : ''}>
        {open && (
          <div className="stack">
            <dl className="stack tight" style={{ margin: 0 }}>
              {fields.map((f) => (
                <div key={f.id}>
                  <dt className="xsmall muted">{f.label}</dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {f.type === 'file'
                      ? open.files
                          .filter((x) => x.field === f.name)
                          .map((x) => (
                            <a key={x.media} href={`/api/media/${x.media}/download`}>
                              {x.filename}
                            </a>
                          ))
                      : open.data[f.name] || '–'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="xsmall faint">Gesendet von {open.page}</p>
            <div className="dialog-actions">
              {can('forms.manage') && (
                <button
                  className="btn danger"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Eintrag löschen?', confirm: 'Löschen', danger: true }))) return;
                    await api.del(`/api/submissions/${open.id}`);
                    subs.setData((d) => (d ? { ...d, submissions: d.submissions.filter((x) => x.id !== open.id) } : d));
                    setOpen(null);
                  }}
                >
                  Löschen
                </button>
              )}
              {Object.values(open.data).find((v) => /@/.test(v)) && (
                <a className="btn primary" href={`mailto:${Object.values(open.data).find((v) => /@/.test(v))}`}>
                  <Icon name="mail" size="s" /> Antworten
                </a>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
