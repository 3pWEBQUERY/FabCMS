import { Reorder, useDragControls } from 'motion/react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useApi, formatDate } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Dialog, Empty, Field, PageHead, Segmented, Skeleton, Select, SuggestInput, Toggle, confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { FIELD_TYPE_LABELS, type FieldDef, type FieldType } from '../../shared/fields';
import { shortId } from '../../shared/text';
import type { CollectionDef, Webhook } from '../../shared/types';
import { HOOK_EVENTS, type HookEvent, type ServerHook } from '../../shared/hooks';
import { SaveBar, useSettingsDraft } from './settingsDraft';

/* ---------- content types ---------- */

const FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'richtext',
  'number',
  'money',
  'date',
  'datetime',
  'boolean',
  'select',
  'multiselect',
  'tags',
  'image',
  'images',
  'file',
  'url',
  'email',
  'color',
  'location',
  'relation',
  'group',
  'json',
];

function FieldEditor({ field, onChange, onRemove, nested = false }: { field: FieldDef; onChange: (f: FieldDef) => void; onRemove: () => void; nested?: boolean }) {
  const controls = useDragControls();
  const [open, setOpen] = useState(!field.label);
  const { data: cols } = useApi<{ collections: CollectionDef[] }>(field.type === 'relation' ? '/api/collections' : null);
  return (
    <Reorder.Item
      value={field}
      dragListener={false}
      dragControls={controls}
      className="repeat-item"
      style={{ listStyle: 'none' }}
      whileDrag={{ scale: 1.01, zIndex: 4, boxShadow: 'var(--shadow-3)' }}
    >
      <header onPointerDown={(e) => !(e.target as HTMLElement).closest('button') && controls.start(e)}>
        <span className="grip">
          <Icon name="grip" size="s" />
        </span>
        <button className="title ellipsis" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: '0.3rem 0' }} onClick={() => setOpen(!open)}>
          {field.label || 'Neues Feld'} <span className="field-key">{field.key}</span> <span className="xsmall faint">{FIELD_TYPE_LABELS[field.type]}</span>
        </button>
        <button className="btn ghost s icon-only" aria-label="Feld entfernen" onClick={onRemove}>
          <Icon name="trash" size="s" />
        </button>
      </header>
      {open && (
        <div className="body">
          <div className="grid-2">
            <Field label="Beschriftung im Studio" help="Alltagssprache, z. B. «Preis pro Person»">
              <input
                className="input"
                value={field.label}
                onChange={(e) =>
                  onChange({
                    ...field,
                    label: e.target.value,
                    key: field.key.startsWith('feld_')
                      ? e.target.value
                          .toLowerCase()
                          .normalize('NFKD')
                          .replace(/[̀-ͯ]/g, '')
                          .replace(/[^a-z0-9]+/g, '_')
                          .replace(/^_|_$/g, '')
                          .replace(/^(\d)/, 'f_$1') || field.key
                      : field.key,
                  })
                }
              />
            </Field>
            <Field label="Schlüssel" keyName="key" help="Für API und Code. Kleinbuchstaben, Zahlen, _">
              <input className="input mono" value={field.key} onChange={(e) => onChange({ ...field, key: e.target.value })} />
            </Field>
            <Field label="Typ">
              <Select
                value={field.type}
                onChange={(v) => onChange({ ...field, type: v as FieldType })}
                options={FIELD_TYPES.filter((t) => !(nested && t === 'group')).map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] }))}
              />
            </Field>
            <Field label="Hilfetext" help="Erklärt im Studio, was hier hingehört.">
              <input className="input" value={field.help ?? ''} onChange={(e) => onChange({ ...field, help: e.target.value })} />
            </Field>
          </div>
          {['select', 'multiselect'].includes(field.type) && (
            <Field label="Auswahl" help="Eine pro Zeile. Optional «wert: Beschriftung».">
              <textarea
                className="textarea"
                defaultValue={(field.options ?? []).map((o) => (o.value === o.label ? o.label : `${o.value}: ${o.label}`)).join('\n')}
                onBlur={(e) =>
                  onChange({
                    ...field,
                    options: e.target.value
                      .split('\n')
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .map((l) => {
                        const [v, ...rest] = l.split(':');
                        return rest.length ? { value: v.trim(), label: rest.join(':').trim() } : { value: l, label: l };
                      }),
                  })
                }
              />
            </Field>
          )}
          {field.type === 'relation' && (
            <Field label="Verknüpft mit">
              <Select
                value={field.collection ?? ''}
                onChange={(v) => onChange({ ...field, collection: v })}
                placeholder="Wählen …"
                options={(cols?.collections ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
          )}
          {['number', 'money'].includes(field.type) && (
            <div className="grid-2">
              <Field label="Minimum">
                <input
                  className="input num"
                  type="number"
                  value={field.min ?? ''}
                  onChange={(e) => onChange({ ...field, min: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </Field>
              <Field label="Maximum">
                <input
                  className="input num"
                  type="number"
                  value={field.max ?? ''}
                  onChange={(e) => onChange({ ...field, max: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </Field>
            </div>
          )}
          <div className="row wrap" style={{ gap: '1.5rem' }}>
            <Toggle checked={Boolean(field.required)} onChange={(v) => onChange({ ...field, required: v })} label="Pflichtfeld" />
            <Toggle checked={Boolean(field.pro)} onChange={(v) => onChange({ ...field, pro: v })} label="Nur in der Werkbank sichtbar" />
            {['file', 'image'].includes(field.type) && (
              <Toggle checked={Boolean(field.private)} onChange={(v) => onChange({ ...field, private: v })} label="Privat (nie öffentlich)" />
            )}
          </div>
          {field.type === 'group' && (
            <div className="stack tight">
              <Field label="Bezeichnung eines Eintrags">
                <input className="input" value={field.itemLabel ?? ''} onChange={(e) => onChange({ ...field, itemLabel: e.target.value })} placeholder="z. B. Zimmer" />
              </Field>
              <span className="section-title">Felder pro Eintrag</span>
              <FieldsBuilder fields={field.fields ?? []} onChange={(f) => onChange({ ...field, fields: f })} nested />
            </div>
          )}
        </div>
      )}
    </Reorder.Item>
  );
}

function FieldsBuilder({ fields, onChange, nested }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void; nested?: boolean }) {
  return (
    <div className="stack tight">
      <Reorder.Group axis="y" values={fields} onReorder={onChange} style={{ padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {fields.map((f, i) => (
          <FieldEditor
            key={i + f.type}
            field={f}
            nested={nested}
            onChange={(nf) => onChange(fields.map((x) => (x === f ? nf : x)))}
            onRemove={() => onChange(fields.filter((x) => x !== f))}
          />
        ))}
      </Reorder.Group>
      <button className="btn s" style={{ justifySelf: 'start' }} onClick={() => onChange([...fields, { key: `feld_${shortId(4)}`, type: 'text', label: '' }])}>
        <Icon name="plus" size="s" /> Feld
      </button>
    </div>
  );
}

export function ContentTypes() {
  const toast = useToast();
  const { reloadSettings } = useSession();
  const { data, reload } = useApi<{ collections: (CollectionDef & { count: number; active: boolean })[] }>('/api/collections');
  const [edit, setEdit] = useState<(Partial<CollectionDef> & { isNew?: boolean }) | null>(null);
  const [codeView, setCodeView] = useState(false);
  const save = async () => {
    if (!edit) return;
    try {
      const { isNew, ...body } = edit;
      if (isNew) await api.post('/api/collections', body);
      else await api.put(`/api/collections/${edit.id}`, body);
      toast('Inhaltstyp gespeichert. Im Studio erscheint er als Formular.');
      setEdit(null);
      void reload();
      void reloadSettings();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async (c: CollectionDef & { count: number }) => {
    if (!(await confirm({ title: `«${c.name}» löschen?`, message: c.count ? `Mit allen ${c.count} Einträgen.` : undefined, confirm: 'Löschen', danger: true }))) return;
    await api.del(`/api/collections/${c.id}?force=1`);
    void reload();
  };
  return (
    <>
      <PageHead
        title="Inhaltstypen"
        sub="Eigene Typen mit Feldern, Relationen und Validierung. Jedes Feld bekommt eine Studio-Beschriftung – so bleibt alles auch für Laien bedienbar."
        actions={
          <button
            className="btn primary"
            onClick={() =>
              setEdit({
                isNew: true,
                id: '',
                name: '',
                singular: '',
                icon: 'layers',
                fields: [{ key: 'title', type: 'text', label: 'Titel', required: true }],
                route: null,
                list_route: null,
                has_blocks: false,
                title_field: 'title',
              })
            }
          >
            <Icon name="plus" size="s" /> Neuer Typ
          </button>
        }
      />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : (
          <ul className="list">
            {data.collections.map((c) => (
              <li key={c.id} className="list-item">
                <Icon name={c.icon} className="faint" />
                <div className="grow">
                  <div className="title">
                    {c.name} <span className="field-key">{c.id}</span>
                  </div>
                  <div className="xsmall muted">
                    {c.fields.length} Felder · {c.count} Einträge{c.route ? ` · ${c.route}` : ''}
                    {c.builtin ? ' · eingebaut' : ''}
                  </div>
                </div>
                <button className="btn s" onClick={() => setEdit({ ...c })}>
                  {c.builtin ? 'Adressen' : 'Bearbeiten'}
                </button>
                {!c.builtin && (
                  <button className="btn ghost s icon-only" aria-label="Löschen" onClick={() => void remove(c)}>
                    <Icon name="trash" size="s" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.isNew ? 'Neuer Inhaltstyp' : `${edit?.name}`} wide>
        {edit && (
          <div className="stack">
            <div className="grid-2">
              <Field label="Name (Mehrzahl)" help="z. B. «Rezepte»">
                <input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={edit.builtin} />
              </Field>
              <Field label="Ein Eintrag heisst" help="z. B. «Rezept»">
                <input className="input" value={edit.singular ?? ''} onChange={(e) => setEdit({ ...edit, singular: e.target.value })} disabled={edit.builtin} />
              </Field>
              {edit.isNew && (
                <Field label="Technischer Name" keyName="id" help="Für API und Code, z. B. «rezepte»">
                  <input className="input mono" value={edit.id ?? ''} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />
                </Field>
              )}
              <Field label="Detailseite" help="z. B. /rezepte/:slug – leer = keine eigenen Seiten">
                <input className="input mono" value={edit.route ?? ''} onChange={(e) => setEdit({ ...edit, route: e.target.value || null })} />
              </Field>
              <Field label="Übersichtsseite" help="z. B. /rezepte">
                <input className="input mono" value={edit.list_route ?? ''} onChange={(e) => setEdit({ ...edit, list_route: e.target.value || null })} />
              </Field>
            </div>
            {!edit.builtin && (
              <>
                <Toggle
                  checked={Boolean(edit.has_blocks)}
                  onChange={(v) => setEdit({ ...edit, has_blocks: v })}
                  label="Mit Seiteninhalt (Blöcke)"
                  help="Einträge bekommen zusätzlich den visuellen Editor."
                />
                <div className="row between">
                  <span className="section-title">Felder</span>
                  <button className="btn ghost s" onClick={() => setCodeView((v) => !v)} aria-pressed={codeView}>
                    <Icon name="code" size="s" /> {codeView ? 'Formular' : 'Als Code'}
                  </button>
                </div>
                {codeView ? (
                  <textarea
                    className="textarea code"
                    style={{ minHeight: '18rem' }}
                    spellCheck={false}
                    defaultValue={JSON.stringify(edit.fields, null, 2)}
                    onBlur={(e) => {
                      try {
                        setEdit({ ...edit, fields: JSON.parse(e.target.value) });
                      } catch (x) {
                        toast(`JSON: ${(x as Error).message}`, { kind: 'bad' });
                      }
                    }}
                  />
                ) : (
                  <FieldsBuilder fields={edit.fields ?? []} onChange={(f) => setEdit({ ...edit, fields: f })} />
                )}
                <Field label="Titelfeld" help="Dieses Feld erscheint in Listen.">
                  <Select
                    value={edit.title_field ?? 'title'}
                    onChange={(v) => setEdit({ ...edit, title_field: v })}
                    options={(edit.fields ?? []).filter((f) => ['text', 'email'].includes(f.type)).map((f) => ({ value: f.key, label: f.label || f.key }))}
                  />
                </Field>
                <Field label="Leerer Zustand" help="Was Laien sehen, bevor es Einträge gibt – erklär, was sie tun sollen.">
                  <input className="input" value={edit.empty_hint ?? ''} onChange={(e) => setEdit({ ...edit, empty_hint: e.target.value })} />
                </Field>
              </>
            )}
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setEdit(null)}>
                Abbrechen
              </button>
              <button className="btn primary" onClick={save}>
                Speichern
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/* ---------- CSS & tokens ---------- */

const TOKEN_HINTS = [
  '--accent',
  '--bg',
  '--ink',
  '--ink-2',
  '--surface',
  '--line',
  '--accent-ink',
  '--max',
  '--measure',
  '--display-weight',
  '--display-tracking',
  '--btn-radius',
  '--hero-size',
];

export function CodeSettings() {
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [newKey, setNewKey] = useState('--accent');
  if (!draft) return <Skeleton />;
  const t = draft.theme;
  const tokens = Object.entries(t.tokens);
  return (
    <>
      <PageHead title="CSS & Design-Tokens" sub="Tokens überschreiben die Variablen des Stils. Eigenes CSS kommt zuletzt und gewinnt." />
      <div className="card">
        <div className="form-section">
          <header>
            <h2>Design-Tokens</h2>
          </header>
          {tokens.map(([k, v]) => (
            <div key={k} className="row">
              <span className="mono small" style={{ width: '11rem' }}>
                {k}
              </span>
              {/^#|rgb|hsl|oklch/.test(v) && (
                <input
                  type="color"
                  value={v.startsWith('#') ? v.slice(0, 7) : '#000000'}
                  onChange={(e) => set('theme', { ...t, tokens: { ...t.tokens, [k]: e.target.value } })}
                  style={{ width: '2.25rem', height: '2.25rem', border: 0, background: 'none' }}
                />
              )}
              <input className="input mono grow" value={v} onChange={(e) => set('theme', { ...t, tokens: { ...t.tokens, [k]: e.target.value } })} />
              <button
                className="btn ghost s icon-only"
                aria-label="Entfernen"
                onClick={() => {
                  const next = { ...t.tokens };
                  delete next[k];
                  set('theme', { ...t, tokens: next });
                }}
              >
                <Icon name="x" size="s" />
              </button>
            </div>
          ))}
          <div className="row">
            <SuggestInput
              className="input mono"
              style={{ width: '11rem' }}
              aria-label="Token-Name"
              value={newKey}
              onChange={setNewKey}
              suggestions={TOKEN_HINTS.map((x) => ({ value: x }))}
            />
            <button className="btn s" onClick={() => /^--[a-z0-9-]+$/.test(newKey) && set('theme', { ...t, tokens: { ...t.tokens, [newKey]: '' } })}>
              <Icon name="plus" size="s" /> Token
            </button>
          </div>
        </div>
        <div className="form-section">
          <header>
            <h2>Eigenes CSS</h2>
            <p>Gilt für die ganze Website. Pro Block geht es auch im Editor unter «Code».</p>
          </header>
          <textarea
            className="textarea code"
            style={{ minHeight: '16rem' }}
            spellCheck={false}
            value={t.css}
            onChange={(e) => set('theme', { ...t, css: e.target.value })}
            placeholder={'.b-hero h1 {\n  text-transform: uppercase;\n}'}
          />
        </div>
        <div className="form-section">
          <Toggle
            checked={draft.security.allowCustomScripts}
            onChange={(v) => set('security', { allowCustomScripts: v })}
            label="Eigene Scripts in «Eigener Code»-Blöcken erlauben"
            help="Lockert die Content-Security-Policy. Nur einschalten, wenn du weisst, woher der Code kommt."
          />
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- API & webhooks ---------- */

const EVENTS: [string, string][] = [
  ['entry.published', 'Inhalt veröffentlicht'],
  ['entry.unpublished', 'Inhalt offline genommen'],
  ['form.submitted', 'Formular gesendet'],
  ['lead.created', 'Neuer Kontakt'],
  ['order.created', 'Bestellung eingegangen'],
  ['order.paid', 'Bestellung bezahlt'],
  ['comment.created', 'Neuer Kommentar'],
];

export function ApiSettings() {
  const toast = useToast();
  const tokens = useApi<{ tokens: { id: string; name: string; scopes: string[]; last_used_at: string | null; created_at: string }[] }>('/api/tokens');
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const [newToken, setNewToken] = useState({ name: '', write: false });
  const [secret, setSecret] = useState<string | null>(null);
  const [explorer, setExplorer] = useState('/api/v1/pages?limit=3');
  const [out, setOut] = useState('');
  const [mode, setMode] = useState<'rest' | 'graphql'>('rest');
  const [gql, setGql] = useState('{\n  site { name }\n  pages(limit: 3) {\n    total\n    items { title path updatedAt }\n  }\n}');
  const create = async () => {
    try {
      const r = await api.post<{ secret: string }>('/api/tokens', { name: newToken.name, scopes: newToken.write ? ['read', 'write'] : ['read'] });
      setSecret(r.secret);
      setNewToken({ name: '', write: false });
      void tokens.reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  if (!draft) return <Skeleton />;
  const hooks = draft.webhooks;
  const setHook = (i: number, patch: Partial<Webhook>) =>
    set(
      'webhooks',
      hooks.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    );
  return (
    <>
      <PageHead title="API & Webhooks" sub="Nova ist headless-fähig: dieselben Inhalte für Apps, andere Websites oder Automationen (Zapier, Make, n8n)." />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>Explorer</h2>
            <Segmented
              label="Schnittstelle"
              value={mode}
              onChange={(v) => {
                setMode(v);
                setOut('');
              }}
              options={[
                { value: 'rest', label: 'REST' },
                { value: 'graphql', label: 'GraphQL' },
              ]}
            />
          </div>
          <div className="form-section">
            {mode === 'rest' ? (
              <form
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await fetch(explorer);
                  setOut(`${r.status} ${r.statusText}\n\n${JSON.stringify(await r.json().catch(() => null), null, 2)}`);
                }}
              >
                <span className="badge">GET</span>
                <input className="input mono grow" value={explorer} onChange={(e) => setExplorer(e.target.value)} aria-label="Adresse" />
                <button className="btn">Senden</button>
              </form>
            ) : (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await fetch('/api/v1/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: gql }) });
                  setOut(`${r.status} ${r.statusText}\n\n${JSON.stringify(await r.json().catch(() => null), null, 2)}`);
                }}
              >
                <textarea
                  className="textarea code"
                  rows={8}
                  value={gql}
                  spellCheck={false}
                  aria-label="GraphQL-Abfrage"
                  onChange={(e) => setGql(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                  }}
                />
                <div className="row">
                  <button className="btn">
                    Abfrage senden <kbd>⌘↵</kbd>
                  </button>
                  <a className="small" href="/api/v1/graphql/schema.graphql" target="_blank" rel="noreferrer">
                    Schema ansehen
                  </a>
                  <a className="small" href="/api/v1/sdk.ts" download="nova.ts">
                    TypeScript-SDK laden
                  </a>
                  <a className="small" href="/api/v1/cli.mjs" download="nova.mjs">
                    CLI laden
                  </a>
                </div>
              </form>
            )}
            {out && <pre className="code-out">{out}</pre>}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>API-Tokens</h2>
          </div>
          <ul className="list">
            {tokens.data?.tokens.map((t) => (
              <li key={t.id} className="list-item">
                <Icon name="key" className="faint" />
                <div className="grow">
                  <div className="title">{t.name}</div>
                  <div className="xsmall muted">
                    {t.scopes.join(' + ')} · {t.last_used_at ? `zuletzt ${formatDate(t.last_used_at, true)}` : 'nie benutzt'}
                  </div>
                </div>
                <button
                  className="btn ghost s"
                  onClick={async () => {
                    if (await confirm({ title: `Token «${t.name}» widerrufen?`, confirm: 'Widerrufen', danger: true })) {
                      await api.del(`/api/tokens/${t.id}`);
                      void tokens.reload();
                    }
                  }}
                >
                  Widerrufen
                </button>
              </li>
            ))}
          </ul>
          <div className="form-section row wrap">
            <input
              className="input"
              style={{ maxWidth: '16rem' }}
              placeholder="Name, z. B. «iOS-App»"
              value={newToken.name}
              onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
            />
            <Toggle checked={newToken.write} onChange={(v) => setNewToken({ ...newToken, write: v })} label="Darf schreiben" />
            <button className="btn" onClick={create} disabled={!newToken.name}>
              Token erstellen
            </button>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Webhooks</h2>
            <button className="btn s" onClick={() => set('webhooks', [...hooks, { id: '', url: 'https://', events: ['form.submitted'], secret: '', active: true }])}>
              <Icon name="plus" size="s" /> Webhook
            </button>
          </div>
          {!hooks.length && <Empty title="Keine Webhooks">Nova schickt bei Ereignissen ein signiertes JSON (Header X-Nova-Signature, HMAC-SHA256) an deine Adresse.</Empty>}
          {hooks.map((h, i) => (
            <div key={i} className="form-section">
              <div className="row">
                <input className="input mono grow" value={h.url} onChange={(e) => setHook(i, { url: e.target.value })} />
                <Toggle checked={h.active} onChange={(v) => setHook(i, { active: v })} label="aktiv" />
                <button
                  className="btn ghost s icon-only"
                  aria-label="Entfernen"
                  onClick={() =>
                    set(
                      'webhooks',
                      hooks.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Icon name="trash" size="s" />
                </button>
              </div>
              <div className="chips">
                {EVENTS.map(([ev, label]) => (
                  <button
                    key={ev}
                    type="button"
                    className="chip"
                    aria-pressed={h.events.includes(ev)}
                    onClick={() => setHook(i, { events: h.events.includes(ev) ? h.events.filter((x) => x !== ev) : [...h.events, ev] })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {h.secret && (
                <div className="row small">
                  <span className="muted">Signatur-Schlüssel:</span> <code className="mono">{h.secret}</code>
                  <button
                    className="linkish xsmall"
                    onClick={() =>
                      api
                        .post<{ ok: boolean; status: number; ms: number; error?: string }>('/api/webhooks/test', { url: h.url })
                        .then((r) => toast(r.ok ? `Antwort ${r.status} in ${r.ms} ms` : `Fehlgeschlagen: ${r.error ?? r.status}`, { kind: r.ok ? 'info' : 'bad' }))
                        .catch((e) => toast(e.message, { kind: 'bad' }))
                    }
                  >
                    Test senden
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)} title="Dein neues Token" description="Es wird nur jetzt angezeigt. Bewahre es sicher auf.">
        <code className="code-out" style={{ display: 'block' }}>
          {secret}
        </code>
        <pre className="code-out" style={{ marginTop: '0.75rem' }}>{`curl -H "Authorization: Bearer ${secret}" ${location.origin}/api/v1/posts?status=all`}</pre>
        <div className="dialog-actions">
          <button className="btn primary" onClick={() => setSecret(null)}>
            Gespeichert
          </button>
        </div>
      </Dialog>
    </>
  );
}

/* ---------- redirects ---------- */

export function Redirects() {
  const toast = useToast();
  const { data, reload } = useApi<{ redirects: { id: string; from_path: string; to_path: string; code: number; auto: boolean; hits: number }[] }>('/api/redirects');
  const [f, setF] = useState({ from: '', to: '', code: 301 });
  const add = async () => {
    try {
      await api.post('/api/redirects', { from_path: f.from, to_path: f.to, code: f.code });
      setF({ from: '', to: '', code: 301 });
      void reload();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <>
      <PageHead
        title="Weiterleitungen"
        sub="Wenn sich die Adresse einer veröffentlichten Seite ändert, legt Nova automatisch eine 301-Weiterleitung an. Hier kannst du eigene ergänzen, z. B. nach einem Umzug von WordPress."
      />
      <section className="card">
        <div className="form-section row wrap">
          <input className="input mono" style={{ flex: 1, minWidth: '10rem' }} placeholder="/alte-adresse" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Icon name="arrowRight" className="faint" />
          <input className="input mono" style={{ flex: 1, minWidth: '10rem' }} placeholder="/neue-adresse" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Select
            inline
            label="Art der Weiterleitung"
            value={String(f.code)}
            onChange={(v) => setF({ ...f, code: Number(v) })}
            options={[
              { value: '301', label: '301 dauerhaft' },
              { value: '302', label: '302 vorübergehend' },
              { value: '410', label: '410 entfernt' },
            ]}
          />
          <button className="btn primary" onClick={add} disabled={!f.from || (!f.to && f.code !== 410)}>
            Hinzufügen
          </button>
        </div>
        {!data ? (
          <Skeleton />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Von</th>
                  <th>Nach</th>
                  <th>Code</th>
                  <th className="right">Aufrufe</th>
                  <th aria-label="Aktionen" />
                </tr>
              </thead>
              <tbody>
                {data.redirects.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.from_path}</td>
                    <td className="mono">{r.to_path}</td>
                    <td>
                      {r.code}
                      {r.auto && (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          automatisch
                        </span>
                      )}
                    </td>
                    <td className="right num">{r.hits}</td>
                    <td className="right">
                      <button className="btn ghost s icon-only" aria-label="Entfernen" onClick={() => api.del(`/api/redirects/${r.id}`).then(reload)}>
                        <Icon name="trash" size="s" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ---------- SQL ---------- */

export function SqlConsole() {
  const [q, setQ] = useState('select collection, status, count(*) from entries group by 1, 2 order by 1');
  const [res, setRes] = useState<{ columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; ms: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    try {
      setRes(await api.post('/api/sql', { query: q }));
    } catch (e) {
      setErr((e as Error).message);
      setRes(null);
    }
  };
  return (
    <>
      <PageHead title="SQL-Abfrage" sub="Nur lesend, eine Anweisung, maximal 5 Sekunden und 1000 Zeilen. Jede Abfrage wird protokolliert." />
      <div className="card form-section">
        <textarea
          className="textarea code"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run();
          }}
        />
        <div className="row between">
          <span className="xsmall muted">
            Tabellen: entries, collections, media, forms, submissions, contacts, orders, coupons, comments, redirects, analytics_events, users, audit_log
          </span>
          <button className="btn primary" onClick={run}>
            Ausführen
          </button>
        </div>
        {err && <p className="field-error">{err}</p>}
        {res && (
          <>
            <p className="xsmall muted">
              {res.rows.length} Zeilen{res.truncated ? ' (gekürzt)' : ''} · {res.ms} ms
            </p>
            <div className="table-wrap" style={{ maxHeight: '28rem' }}>
              <table className="table mono">
                <thead>
                  <tr>
                    {res.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.map((r, i) => (
                    <tr key={i}>
                      {res.columns.map((c) => (
                        <td key={c} className="ellipsis" style={{ maxWidth: '20rem' }}>
                          {typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : String(r[c] ?? '∅')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- audit ---------- */

export function AuditLog() {
  const { data } = useApi<{
    entries: { id: number; action: string; entity: string; entity_id: string; meta: Record<string, unknown>; ip: string; created_at: string; user_name: string | null }[];
  }>('/api/audit?limit=300');
  return (
    <>
      <PageHead title="Protokoll" sub="Wer hat wann was getan. Einträge werden zwei Jahre aufbewahrt." />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Person</th>
                  <th>Aktion</th>
                  <th>Objekt</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDate(e.created_at, true)}</td>
                    <td>{e.user_name ?? '–'}</td>
                    <td className="mono">{e.action}</td>
                    <td className="ellipsis" style={{ maxWidth: '18rem' }}>
                      {(e.meta.title as string) ?? e.entity} {e.entity_id && <span className="faint mono xsmall">{e.entity_id.slice(0, 8)}</span>}
                    </td>
                    <td className="mono xsmall faint">{e.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

interface HookTest {
  input: Record<string, unknown>;
  run: { ok: boolean; result: Record<string, unknown> | null; error: string | null; logs: string[]; ms: number };
}

export function HooksSettings() {
  const toast = useToast();
  const { draft, set, dirty, save, reset } = useSettingsDraft();
  const cols = useApi<{ collections: CollectionDef[] }>('/api/collections');
  const [tests, setTests] = useState<Record<number, HookTest | 'busy'>>({});
  if (!draft) return <Skeleton />;
  const hooks = draft.hooks ?? [];
  const setHook = (i: number, patch: Partial<ServerHook>) =>
    set(
      'hooks',
      hooks.map((h, j) => (j === i ? { ...h, ...patch } : h)),
    );
  const add = () => {
    const ev = HOOK_EVENTS[0];
    set('hooks', [...hooks, { id: '', name: 'Neuer Hook', event: ev.value, collection: '', code: ev.template, active: true }]);
  };
  const test = async (i: number) => {
    setTests((t) => ({ ...t, [i]: 'busy' }));
    try {
      const h = hooks[i];
      const r = await api.post<HookTest>('/api/hooks/test', { code: h.code, event: h.event, collection: h.collection });
      setTests((t) => ({ ...t, [i]: r }));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      setTests((t) => {
        const { [i]: _drop, ...rest } = t;
        return rest;
      });
    }
  };
  return (
    <>
      <PageHead
        title="Hooks"
        sub="Kleine JavaScript-Funktionen, die bei Ereignissen auf dem Server laufen – abgeschottet in einer eigenen Sandbox: kein Netz, keine Dateien, 50 ms und 16 MB pro Aufruf."
        actions={
          <button className="btn" onClick={add}>
            <Icon name="plus" size="s" /> Hook
          </button>
        }
      />
      <div className="stack loose">
        {!hooks.length && (
          <section className="card">
            <Empty
              title="Noch keine Hooks"
              action={
                <button className="btn primary" onClick={add}>
                  Ersten Hook anlegen
                </button>
              }
            >
              Zum Beispiel: Titel vor dem Speichern bereinigen, Veröffentlichen ohne Kurzfassung verhindern oder Formular-Spam mit eigenen Regeln aussortieren. Mit{' '}
              <code>throw new Error(«…»)</code> wird abgelehnt – die Meldung erscheint so im Studio bzw. beim Besucher.
            </Empty>
          </section>
        )}
        {hooks.map((h, i) => {
          const ev = HOOK_EVENTS.find((e) => e.value === h.event) ?? HOOK_EVENTS[0];
          const t = tests[i];
          return (
            <section key={i} className="card">
              <div className="card-head">
                <input
                  className="input"
                  style={{ maxWidth: '20rem', fontWeight: 600 }}
                  value={h.name}
                  aria-label="Name des Hooks"
                  onChange={(e) => setHook(i, { name: e.target.value })}
                />
                <div className="row">
                  <Toggle checked={h.active} onChange={(v) => setHook(i, { active: v })} label="aktiv" />
                  <button
                    className="btn ghost s icon-only"
                    aria-label="Hook entfernen"
                    onClick={async () => {
                      if (await confirm({ title: `Hook «${h.name}» entfernen?`, confirm: 'Entfernen', danger: true }))
                        set(
                          'hooks',
                          hooks.filter((_, j) => j !== i),
                        );
                    }}
                  >
                    <Icon name="trash" size="s" />
                  </button>
                </div>
              </div>
              <div className="form-section stack">
                <div className="grid-2">
                  <Field label="Ereignis" help={ev.help}>
                    <Select
                      value={h.event}
                      onChange={(v) => {
                        const next = HOOK_EVENTS.find((e) => e.value === v)!;
                        const untouched = HOOK_EVENTS.some((e) => e.template === h.code);
                        setHook(i, { event: v as HookEvent, code: untouched ? next.template : h.code, collection: v === 'form.beforeSubmit' ? '' : h.collection });
                      }}
                      options={HOOK_EVENTS.map((e) => ({ value: e.value, label: e.label }))}
                    />
                  </Field>
                  {h.event !== 'form.beforeSubmit' && (
                    <Field label="Für Inhaltstyp">
                      <Select
                        value={h.collection}
                        onChange={(v) => setHook(i, { collection: v })}
                        options={[
                          { value: '', label: 'Alle Inhaltstypen' },
                          ...(cols.data?.collections ?? []).filter((c) => c.id !== 'sections').map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    </Field>
                  )}
                </div>
                <textarea
                  className="textarea code"
                  style={{ minHeight: '14rem' }}
                  spellCheck={false}
                  value={h.code}
                  aria-label="Code"
                  onChange={(e) => setHook(i, { code: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const at = el.selectionStart;
                      setHook(i, { code: `${h.code.slice(0, at)}  ${h.code.slice(el.selectionEnd)}` });
                      requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
                    }
                  }}
                />
                <div className="row">
                  <button className="btn s" onClick={() => test(i)} disabled={t === 'busy'} data-busy={t === 'busy' || undefined}>
                    Mit echten Daten testen
                  </button>
                  <span className="xsmall muted">Speichert nichts – läuft mit dem zuletzt geänderten Eintrag bzw. dem ersten Formular.</span>
                </div>
                {t && t !== 'busy' && (
                  <div className="stack">
                    <p className={`hint${t.run.ok ? '' : ' bad'}`}>
                      <span>
                        {t.run.ok ? `Durchgelaufen in ${t.run.ms} ms.` : `Abgelehnt: ${t.run.error}`}
                        {t.run.ok && h.event === 'form.beforeSubmit' && t.run.result?.spam === true ? ' Würde als Spam verworfen.' : ''}
                      </span>
                    </p>
                    {t.run.logs.length > 0 && <pre className="code-out">{t.run.logs.join('\n')}</pre>}
                    <details>
                      <summary className="small">Eingabe und Ergebnis</summary>
                      <pre className="code-out">{`// event\n${JSON.stringify(t.input, null, 2)}\n\n// Ergebnis\n${JSON.stringify(t.run.result, null, 2)}`}</pre>
                    </details>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}
