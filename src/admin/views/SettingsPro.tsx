import { Reorder, useDragControls } from 'motion/react';
import { useState, type ReactNode } from 'react';
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
import { t, tl } from '../lib/i18n';

/** Puts an element where {code} stands in a translated sentence. */
function withCode(text: string, el: ReactNode) {
  const [before, after = ''] = text.split('{code}');
  return (
    <>
      {before}
      {el}
      {after}
    </>
  );
}

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
          {field.label || t('Neues Feld')} <span className="field-key">{field.key}</span> <span className="xsmall faint">{tl(FIELD_TYPE_LABELS[field.type])}</span>
        </button>
        <button className="btn ghost s icon-only" aria-label={t('Feld entfernen')} onClick={onRemove}>
          <Icon name="trash" size="s" />
        </button>
      </header>
      {open && (
        <div className="body">
          <div className="grid-2">
            <Field label={t('Beschriftung im Studio')} help={t('Alltagssprache, z. B. «Preis pro Person»')}>
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
            <Field label={t('Schlüssel')} keyName="key" help={t('Für API und Code. Kleinbuchstaben, Zahlen, _')}>
              <input className="input mono" value={field.key} onChange={(e) => onChange({ ...field, key: e.target.value })} />
            </Field>
            <Field label={t('Typ')}>
              <Select
                value={field.type}
                onChange={(v) => onChange({ ...field, type: v as FieldType })}
                options={FIELD_TYPES.filter((ft) => !(nested && ft === 'group')).map((ft) => ({ value: ft, label: tl(FIELD_TYPE_LABELS[ft]) }))}
              />
            </Field>
            <Field label={t('Hilfetext')} help={t('Erklärt im Studio, was hier hingehört.')}>
              <input className="input" value={field.help ?? ''} onChange={(e) => onChange({ ...field, help: e.target.value })} />
            </Field>
          </div>
          {['select', 'multiselect'].includes(field.type) && (
            <Field label={t('Auswahl')} help={t('Eine pro Zeile. Optional «wert: Beschriftung».')}>
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
            <Field label={t('Verknüpft mit')}>
              <Select
                value={field.collection ?? ''}
                onChange={(v) => onChange({ ...field, collection: v })}
                placeholder={t('Wählen …')}
                options={(cols?.collections ?? []).map((c) => ({ value: c.id, label: tl(c.name) }))}
              />
            </Field>
          )}
          {['number', 'money'].includes(field.type) && (
            <div className="grid-2">
              <Field label={t('Minimum')}>
                <input
                  className="input num"
                  type="number"
                  value={field.min ?? ''}
                  onChange={(e) => onChange({ ...field, min: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </Field>
              <Field label={t('Maximum')}>
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
            <Toggle checked={Boolean(field.required)} onChange={(v) => onChange({ ...field, required: v })} label={t('Pflichtfeld')} />
            <Toggle checked={Boolean(field.pro)} onChange={(v) => onChange({ ...field, pro: v })} label={t('Nur in der Werkbank sichtbar')} />
            {['file', 'image'].includes(field.type) && (
              <Toggle checked={Boolean(field.private)} onChange={(v) => onChange({ ...field, private: v })} label={t('Privat (nie öffentlich)')} />
            )}
          </div>
          {field.type === 'group' && (
            <div className="stack tight">
              <Field label={t('Bezeichnung eines Eintrags')}>
                <input className="input" value={field.itemLabel ?? ''} onChange={(e) => onChange({ ...field, itemLabel: e.target.value })} placeholder={t('z. B. Zimmer')} />
              </Field>
              <span className="section-title">{t('Felder pro Eintrag')}</span>
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
        <Icon name="plus" size="s" /> {t('Feld')}
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
      const { isNew, ...all } = edit;
      // Built-in types: Nova's fields are fixed – only addresses and the site's own fields are saved.
      const body = all.builtin ? { route: all.route, list_route: all.list_route, custom_fields: all.custom_fields ?? [] } : all;
      if (isNew) await api.post('/api/collections', body);
      else await api.put(`/api/collections/${edit.id}`, body);
      toast(t('Inhaltstyp gespeichert. Im Studio erscheint er als Formular.'));
      setEdit(null);
      void reload();
      void reloadSettings();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  const remove = async (c: CollectionDef & { count: number }) => {
    if (
      !(await confirm({
        title: t('«{name}» löschen?', { name: tl(c.name) }),
        message: c.count === 1 ? t('Mit dem einen Eintrag.') : c.count ? t('Mit allen {n} Einträgen.', { n: c.count }) : undefined,
        confirm: t('Löschen'),
        danger: true,
      }))
    )
      return;
    await api.del(`/api/collections/${c.id}?force=1`);
    void reload();
  };
  return (
    <>
      <PageHead
        title={t('Inhaltstypen')}
        sub={t('Eigene Typen mit Feldern, Relationen und Validierung. Jedes Feld bekommt eine Studio-Beschriftung – so bleibt alles auch für Laien bedienbar.')}
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
                fields: [{ key: 'title', type: 'text', label: t('Titel'), required: true }],
                route: null,
                list_route: null,
                has_blocks: false,
                title_field: 'title',
              })
            }
          >
            <Icon name="plus" size="s" /> {t('Neuer Typ')}
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
                    {tl(c.name)} <span className="field-key">{c.id}</span>
                  </div>
                  <div className="xsmall muted">
                    {c.fields.length === 1 ? t('1 Feld') : t('{n} Felder', { n: c.fields.length })} · {c.count === 1 ? t('1 Eintrag') : t('{n} Einträge', { n: c.count })}
                    {c.route ? ` · ${c.route}` : ''}
                    {c.builtin ? ` · ${t('eingebaut')}` : ''}
                  </div>
                </div>
                <button
                  className="btn s"
                  onClick={() =>
                    setEdit(c.builtin ? { ...c, fields: c.fields.filter((f) => !c.custom_fields?.some((x) => x.key === f.key)), custom_fields: c.custom_fields ?? [] } : { ...c })
                  }
                >
                  {t('Bearbeiten')}
                </button>
                {!c.builtin && (
                  <button className="btn ghost s icon-only" aria-label={t('Löschen')} onClick={() => void remove(c)}>
                    <Icon name="trash" size="s" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title={edit?.isNew ? t('Neuer Inhaltstyp') : tl(edit?.name)} wide>
        {edit && (
          <div className="stack">
            <div className="grid-2">
              <Field label={t('Name (Mehrzahl)')} help={t('z. B. «Rezepte»')}>
                <input className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} disabled={edit.builtin} />
              </Field>
              <Field label={t('Ein Eintrag heisst')} help={t('z. B. «Rezept»')}>
                <input className="input" value={edit.singular ?? ''} onChange={(e) => setEdit({ ...edit, singular: e.target.value })} disabled={edit.builtin} />
              </Field>
              {edit.isNew && (
                <Field label={t('Technischer Name')} keyName="id" help={t('Für API und Code, z. B. «rezepte»')}>
                  <input className="input mono" value={edit.id ?? ''} onChange={(e) => setEdit({ ...edit, id: e.target.value })} />
                </Field>
              )}
              <Field label={t('Detailseite')} help={t('z. B. /rezepte/:slug – leer = keine eigenen Seiten')}>
                <input className="input mono" value={edit.route ?? ''} onChange={(e) => setEdit({ ...edit, route: e.target.value || null })} />
              </Field>
              <Field label={t('Übersichtsseite')} help={t('z. B. /rezepte')}>
                <input className="input mono" value={edit.list_route ?? ''} onChange={(e) => setEdit({ ...edit, list_route: e.target.value || null })} />
              </Field>
            </div>
            {edit.builtin && edit.id !== 'sections' && (
              <>
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <span className="section-title">{t('Felder von Nova')}</span>
                  <p className="xsmall muted" style={{ margin: 0 }}>
                    {t('Diese Felder gehören zur eingebauten Vorlage und bleiben bei jedem Update erhalten.')}
                  </p>
                  <ul className="field-chips">
                    {(edit.fields ?? []).map((f) => (
                      <li key={f.key}>
                        {tl(f.label)} <span className="muted">· {tl(FIELD_TYPE_LABELS[f.type])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stack" style={{ gap: '0.5rem' }}>
                  <span className="section-title">{t('Eigene Felder')}</span>
                  <p className="xsmall muted" style={{ margin: 0 }}>
                    {t('Erscheinen sofort im Formular jedes Eintrags und auf der Website unter dem Inhalt.')}
                  </p>
                  <FieldsBuilder fields={edit.custom_fields ?? []} onChange={(f) => setEdit({ ...edit, custom_fields: f })} />
                </div>
              </>
            )}
            {!edit.builtin && (
              <>
                <Toggle
                  checked={Boolean(edit.has_blocks)}
                  onChange={(v) => setEdit({ ...edit, has_blocks: v })}
                  label={t('Mit Seiteninhalt (Blöcke)')}
                  help={t('Einträge bekommen zusätzlich den visuellen Editor.')}
                />
                <div className="row between">
                  <span className="section-title">{t('Felder')}</span>
                  <button className="btn ghost s" onClick={() => setCodeView((v) => !v)} aria-pressed={codeView}>
                    <Icon name="code" size="s" /> {codeView ? t('Formular') : t('Als Code')}
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
                <Field label={t('Titelfeld')} help={t('Dieses Feld erscheint in Listen.')}>
                  <Select
                    value={edit.title_field ?? 'title'}
                    onChange={(v) => setEdit({ ...edit, title_field: v })}
                    options={(edit.fields ?? []).filter((f) => ['text', 'email'].includes(f.type)).map((f) => ({ value: f.key, label: f.label || f.key }))}
                  />
                </Field>
                <Field label={t('Leerer Zustand')} help={t('Was Laien sehen, bevor es Einträge gibt – erklär, was sie tun sollen.')}>
                  <input className="input" value={edit.empty_hint ?? ''} onChange={(e) => setEdit({ ...edit, empty_hint: e.target.value })} />
                </Field>
              </>
            )}
            <div className="dialog-actions">
              <button className="btn ghost" onClick={() => setEdit(null)}>
                {t('Abbrechen')}
              </button>
              <button className="btn primary" onClick={save}>
                {t('Speichern')}
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
  const th = draft.theme;
  const tokens = Object.entries(th.tokens);
  return (
    <>
      <PageHead title={t('CSS & Design-Tokens')} sub={t('Tokens überschreiben die Variablen des Stils. Eigenes CSS kommt zuletzt und gewinnt.')} />
      <div className="card">
        <div className="form-section">
          <header>
            <h2>{t('Design-Tokens')}</h2>
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
                  onChange={(e) => set('theme', { ...th, tokens: { ...th.tokens, [k]: e.target.value } })}
                  style={{ width: '2.25rem', height: '2.25rem', border: 0, background: 'none' }}
                />
              )}
              <input className="input mono grow" value={v} onChange={(e) => set('theme', { ...th, tokens: { ...th.tokens, [k]: e.target.value } })} />
              <button
                className="btn ghost s icon-only"
                aria-label={t('Entfernen')}
                onClick={() => {
                  const next = { ...th.tokens };
                  delete next[k];
                  set('theme', { ...th, tokens: next });
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
              aria-label={t('Token-Name')}
              value={newKey}
              onChange={setNewKey}
              suggestions={TOKEN_HINTS.map((x) => ({ value: x }))}
            />
            <button className="btn s" onClick={() => /^--[a-z0-9-]+$/.test(newKey) && set('theme', { ...th, tokens: { ...th.tokens, [newKey]: '' } })}>
              <Icon name="plus" size="s" /> Token
            </button>
          </div>
        </div>
        <div className="form-section">
          <header>
            <h2>{t('Eigenes CSS')}</h2>
            <p>{t('Gilt für die ganze Website. Pro Block geht es auch im Editor unter «Code».')}</p>
          </header>
          <textarea
            className="textarea code"
            style={{ minHeight: '16rem' }}
            spellCheck={false}
            value={th.css}
            onChange={(e) => set('theme', { ...th, css: e.target.value })}
            placeholder={'.b-hero h1 {\n  text-transform: uppercase;\n}'}
          />
        </div>
        <div className="form-section">
          <Toggle
            checked={draft.security.allowCustomScripts}
            onChange={(v) => set('security', { allowCustomScripts: v })}
            label={t('Eigene Scripts in «Eigener Code»-Blöcken erlauben')}
            help={t('Lockert die Content-Security-Policy. Nur einschalten, wenn du weisst, woher der Code kommt.')}
          />
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
    </>
  );
}

/* ---------- API & webhooks ---------- */

const events = (): [string, string][] => [
  ['entry.published', t('Inhalt veröffentlicht')],
  ['entry.unpublished', t('Inhalt offline genommen')],
  ['form.submitted', t('Formular gesendet')],
  ['lead.created', t('Neuer Kontakt')],
  ['order.created', t('Bestellung eingegangen')],
  ['order.paid', t('Bestellung bezahlt')],
  ['comment.created', t('Neuer Kommentar')],
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
      <PageHead title={t('API & Webhooks')} sub={t('Nova ist headless-fähig: dieselben Inhalte für Apps, andere Websites oder Automationen (Zapier, Make, n8n).')} />
      <div className="stack loose">
        <section className="card">
          <div className="card-head">
            <h2>{t('Explorer')}</h2>
            <Segmented
              label={t('Schnittstelle')}
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
                <input className="input mono grow" value={explorer} onChange={(e) => setExplorer(e.target.value)} aria-label={t('Adresse')} />
                <button className="btn">{t('Senden')}</button>
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
                  aria-label={t('GraphQL-Abfrage')}
                  onChange={(e) => setGql(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
                  }}
                />
                <div className="row">
                  <button className="btn">
                    {t('Abfrage senden')} <kbd>⌘↵</kbd>
                  </button>
                  <a className="small" href="/api/v1/graphql/schema.graphql" target="_blank" rel="noreferrer">
                    {t('Schema ansehen')}
                  </a>
                  <a className="small" href="/api/v1/sdk.ts" download="nova.ts">
                    {t('TypeScript-SDK laden')}
                  </a>
                  <a className="small" href="/api/v1/cli.mjs" download="nova.mjs">
                    {t('CLI laden')}
                  </a>
                </div>
              </form>
            )}
            {out && <pre className="code-out">{out}</pre>}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>{t('API-Tokens')}</h2>
          </div>
          <ul className="list">
            {tokens.data?.tokens.map((tok) => (
              <li key={tok.id} className="list-item">
                <Icon name="key" className="faint" />
                <div className="grow">
                  <div className="title">{tok.name}</div>
                  <div className="xsmall muted">
                    {tok.scopes.join(' + ')} · {tok.last_used_at ? t('zuletzt {date}', { date: formatDate(tok.last_used_at, true) }) : t('nie benutzt')}
                  </div>
                </div>
                <button
                  className="btn ghost s"
                  onClick={async () => {
                    if (await confirm({ title: t('Token «{name}» widerrufen?', { name: tok.name }), confirm: t('Widerrufen'), danger: true })) {
                      await api.del(`/api/tokens/${tok.id}`);
                      void tokens.reload();
                    }
                  }}
                >
                  {t('Widerrufen')}
                </button>
              </li>
            ))}
          </ul>
          <div className="form-section row wrap">
            <input
              className="input"
              style={{ maxWidth: '16rem' }}
              placeholder={t('Name, z. B. «iOS-App»')}
              value={newToken.name}
              onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
            />
            <Toggle checked={newToken.write} onChange={(v) => setNewToken({ ...newToken, write: v })} label={t('Darf schreiben')} />
            <button className="btn" onClick={create} disabled={!newToken.name}>
              {t('Token erstellen')}
            </button>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>{t('Webhooks')}</h2>
            <button className="btn s" onClick={() => set('webhooks', [...hooks, { id: '', url: 'https://', events: ['form.submitted'], secret: '', active: true }])}>
              <Icon name="plus" size="s" /> {t('Webhook')}
            </button>
          </div>
          {!hooks.length && (
            <Empty title={t('Keine Webhooks')}>{t('Nova schickt bei Ereignissen ein signiertes JSON (Header X-Nova-Signature, HMAC-SHA256) an deine Adresse.')}</Empty>
          )}
          {hooks.map((h, i) => (
            <div key={i} className="form-section">
              <div className="row">
                <input className="input mono grow" value={h.url} onChange={(e) => setHook(i, { url: e.target.value })} />
                <Toggle checked={h.active} onChange={(v) => setHook(i, { active: v })} label={t('aktiv')} />
                <button
                  className="btn ghost s icon-only"
                  aria-label={t('Entfernen')}
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
                {events().map(([ev, label]) => (
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
                  <span className="muted">{t('Signatur-Schlüssel:')}</span> <code className="mono">{h.secret}</code>
                  <button
                    className="linkish xsmall"
                    onClick={() =>
                      api
                        .post<{ ok: boolean; status: number; ms: number; error?: string }>('/api/webhooks/test', { url: h.url })
                        .then((r) =>
                          toast(r.ok ? t('Antwort {status} in {ms} ms', { status: r.status, ms: r.ms }) : t('Fehlgeschlagen: {error}', { error: r.error ?? r.status }), {
                            kind: r.ok ? 'info' : 'bad',
                          }),
                        )
                        .catch((e) => toast(e.message, { kind: 'bad' }))
                    }
                  >
                    {t('Test senden')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={reset} />
      <Dialog
        open={Boolean(secret)}
        onOpenChange={(o) => !o && setSecret(null)}
        title={t('Dein neues Token')}
        description={t('Es wird nur jetzt angezeigt. Bewahre es sicher auf.')}
      >
        <code className="code-out" style={{ display: 'block' }}>
          {secret}
        </code>
        <pre className="code-out" style={{ marginTop: '0.75rem' }}>{`curl -H "Authorization: Bearer ${secret}" ${location.origin}/api/v1/posts?status=all`}</pre>
        <div className="dialog-actions">
          <button className="btn primary" onClick={() => setSecret(null)}>
            {t('Gespeichert')}
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
        title={t('Weiterleitungen')}
        sub={t(
          'Wenn sich die Adresse einer veröffentlichten Seite ändert, legt Nova automatisch eine 301-Weiterleitung an. Hier kannst du eigene ergänzen, z. B. nach einem Umzug von WordPress.',
        )}
      />
      <section className="card">
        <div className="form-section row wrap">
          <input
            className="input mono"
            style={{ flex: 1, minWidth: '10rem' }}
            placeholder={t('/alte-adresse')}
            value={f.from}
            onChange={(e) => setF({ ...f, from: e.target.value })}
          />
          <Icon name="arrowRight" className="faint" />
          <input className="input mono" style={{ flex: 1, minWidth: '10rem' }} placeholder={t('/neue-adresse')} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <Select
            inline
            label={t('Art der Weiterleitung')}
            value={String(f.code)}
            onChange={(v) => setF({ ...f, code: Number(v) })}
            options={[
              { value: '301', label: t('301 dauerhaft') },
              { value: '302', label: t('302 vorübergehend') },
              { value: '410', label: t('410 entfernt') },
            ]}
          />
          <button className="btn primary" onClick={add} disabled={!f.from || (!f.to && f.code !== 410)}>
            {t('Hinzufügen')}
          </button>
        </div>
        {!data ? (
          <Skeleton />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Von')}</th>
                  <th>{t('Nach')}</th>
                  <th>{t('Code')}</th>
                  <th className="right">{t('Aufrufe')}</th>
                  <th aria-label={t('Aktionen')} />
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
                          {t('automatisch')}
                        </span>
                      )}
                    </td>
                    <td className="right num">{r.hits}</td>
                    <td className="right">
                      <button className="btn ghost s icon-only" aria-label={t('Entfernen')} onClick={() => api.del(`/api/redirects/${r.id}`).then(reload)}>
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
      <PageHead title={t('SQL-Abfrage')} sub={t('Nur lesend, eine Anweisung, maximal 5 Sekunden und 1000 Zeilen. Jede Abfrage wird protokolliert.')} />
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
            {t('Tabellen:')} entries, collections, media, forms, submissions, contacts, orders, coupons, comments, redirects, analytics_events, users, audit_log
          </span>
          <button className="btn primary" onClick={run}>
            {t('Ausführen')}
          </button>
        </div>
        {err && <p className="field-error">{err}</p>}
        {res && (
          <>
            <p className="xsmall muted">
              {res.rows.length === 1 ? t('1 Zeile') : t('{n} Zeilen', { n: res.rows.length })}
              {res.truncated ? ` ${t('(gekürzt)')}` : ''} · {res.ms} ms
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
      <PageHead title={t('Protokoll')} sub={t('Wer hat wann was getan. Einträge werden zwei Jahre aufbewahrt.')} />
      <section className="card">
        {!data ? (
          <Skeleton />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Zeit')}</th>
                  <th>{t('Person')}</th>
                  <th>{t('Aktion')}</th>
                  <th>{t('Objekt')}</th>
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
    set('hooks', [...hooks, { id: '', name: t('Neuer Hook'), event: ev.value, collection: '', code: ev.template, active: true }]);
  };
  const test = async (i: number) => {
    setTests((prev) => ({ ...prev, [i]: 'busy' }));
    try {
      const h = hooks[i];
      const r = await api.post<HookTest>('/api/hooks/test', { code: h.code, event: h.event, collection: h.collection });
      setTests((prev) => ({ ...prev, [i]: r }));
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
      setTests((prev) => {
        const { [i]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };
  return (
    <>
      <PageHead
        title={t('Hooks')}
        sub={t(
          'Kleine JavaScript-Funktionen, die bei Ereignissen auf dem Server laufen – abgeschottet in einer eigenen Sandbox: kein Netz, keine Dateien, 50 ms und 16 MB pro Aufruf.',
        )}
        actions={
          <button className="btn" onClick={add}>
            <Icon name="plus" size="s" /> {t('Hook')}
          </button>
        }
      />
      <div className="stack loose">
        {!hooks.length && (
          <section className="card">
            <Empty
              title={t('Noch keine Hooks')}
              action={
                <button className="btn primary" onClick={add}>
                  {t('Ersten Hook anlegen')}
                </button>
              }
            >
              {t('Zum Beispiel: Titel vor dem Speichern bereinigen, Veröffentlichen ohne Kurzfassung verhindern oder Formular-Spam mit eigenen Regeln aussortieren.')}{' '}
              {withCode(t('Mit {code} wird abgelehnt – die Meldung erscheint so im Studio bzw. beim Besucher.'), <code>throw new Error(«…»)</code>)}
            </Empty>
          </section>
        )}
        {hooks.map((h, i) => {
          const ev = HOOK_EVENTS.find((e) => e.value === h.event) ?? HOOK_EVENTS[0];
          const res = tests[i];
          return (
            <section key={i} className="card">
              <div className="card-head">
                <input
                  className="input"
                  style={{ maxWidth: '20rem', fontWeight: 600 }}
                  value={h.name}
                  aria-label={t('Name des Hooks')}
                  onChange={(e) => setHook(i, { name: e.target.value })}
                />
                <div className="row">
                  {h.ext && (
                    <span className="badge" title={t('Kommt mit einer Erweiterung und wird bei deren Aktualisierung ersetzt.')}>
                      {t('Erweiterung')}
                    </span>
                  )}
                  <Toggle checked={h.active} onChange={(v) => setHook(i, { active: v })} label={t('aktiv')} />
                  <button
                    className="btn ghost s icon-only"
                    aria-label={t('Hook entfernen')}
                    onClick={async () => {
                      if (await confirm({ title: t('Hook «{name}» entfernen?', { name: h.name }), confirm: t('Entfernen'), danger: true }))
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
                  <Field label={t('Ereignis')} help={tl(ev.help)}>
                    <Select
                      value={h.event}
                      onChange={(v) => {
                        const next = HOOK_EVENTS.find((e) => e.value === v)!;
                        const untouched = HOOK_EVENTS.some((e) => e.template === h.code);
                        setHook(i, { event: v as HookEvent, code: untouched ? next.template : h.code, collection: v === 'form.beforeSubmit' ? '' : h.collection });
                      }}
                      options={HOOK_EVENTS.map((e) => ({ value: e.value, label: tl(e.label) }))}
                    />
                  </Field>
                  {h.event !== 'form.beforeSubmit' && (
                    <Field label={t('Für Inhaltstyp')}>
                      <Select
                        value={h.collection}
                        onChange={(v) => setHook(i, { collection: v })}
                        options={[
                          { value: '', label: t('Alle Inhaltstypen') },
                          ...(cols.data?.collections ?? []).filter((c) => c.id !== 'sections').map((c) => ({ value: c.id, label: tl(c.name) })),
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
                  aria-label={t('Code')}
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
                  <button className="btn s" onClick={() => test(i)} disabled={res === 'busy'} data-busy={res === 'busy' || undefined}>
                    {t('Mit echten Daten testen')}
                  </button>
                  <span className="xsmall muted">{t('Speichert nichts – läuft mit dem zuletzt geänderten Eintrag bzw. dem ersten Formular.')}</span>
                </div>
                {res && res !== 'busy' && (
                  <div className="stack">
                    <p className={`hint${res.run.ok ? '' : ' bad'}`}>
                      <span>
                        {res.run.ok ? t('Durchgelaufen in {ms} ms.', { ms: res.run.ms }) : t('Abgelehnt: {error}', { error: res.run.error ?? '' })}
                        {res.run.ok && h.event === 'form.beforeSubmit' && res.run.result?.spam === true ? ` ${t('Würde als Spam verworfen.')}` : ''}
                      </span>
                    </p>
                    {res.run.logs.length > 0 && <pre className="code-out">{res.run.logs.join('\n')}</pre>}
                    <details>
                      <summary className="small">{t('Eingabe und Ergebnis')}</summary>
                      <pre className="code-out">{`// event\n${JSON.stringify(res.input, null, 2)}\n\n// ${t('Ergebnis')}\n${JSON.stringify(res.run.result, null, 2)}`}</pre>
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
