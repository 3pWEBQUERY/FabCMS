import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import type { FieldDef, LinkValue } from '../../shared/fields';
import { defaultsFor } from '../../shared/fields';
import { shortId } from '../../shared/text';
import { useSession } from '../lib/session';
import { useApi } from '../lib/hooks';
import { t, tl } from '../lib/i18n';
import { Icon, SiteIcon } from './icons';
import { DateInput, DateTimeInput, Field, Popover, Select, SuggestInput, Toggle } from './kit';
import { ICON_GROUPS, SITE_ICONS, type IconDef } from '../../shared/icon-set';
import { RichText } from './RichText';
import { AiRewrite } from './Ai';
import type { SlotKind } from '../../shared/text-slots';
import { MediaPicker, useMedia } from './MediaPicker';

type Values = Record<string, unknown>;

export function isVisible(f: FieldDef, values: Values) {
  if (!f.showIf) return true;
  return f.showIf.equals.includes(values[f.showIf.field]);
}

/** Renders a list of fields. Werkbank-only fields are hidden in the Studio. */
export function FieldList({
  fields,
  values,
  onChange,
  errors,
  skip = [],
  locked,
}: {
  fields: FieldDef[];
  values: Values;
  onChange: (key: string, v: unknown) => void;
  errors?: Record<string, string>;
  skip?: string[];
  /** Fields that can't be changed here (e.g. prices while translating). */
  locked?: (f: FieldDef) => string | null;
}) {
  const { pro } = useSession();
  const visible = fields.filter((f) => !skip.includes(f.key) && (pro || !f.pro) && isVisible(f, values));
  // Consecutive half-width fields share a row.
  const rows: FieldDef[][] = [];
  for (const f of visible) {
    const last = rows[rows.length - 1];
    if (f.width === 'half' && last && last.length === 1 && last[0].width === 'half') last.push(f);
    else rows.push([f]);
  }
  const input = (f: FieldDef) => {
    const why = locked?.(f);
    const el = <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} error={errors?.[f.key]} />;
    return why ? (
      <fieldset key={f.key} className="locked-field" disabled title={why}>
        {el}
        <p className="xsmall muted">{why}</p>
      </fieldset>
    ) : (
      el
    );
  };
  return (
    <>
      {rows.map((r) =>
        r.length === 2 ? (
          <div key={r[0].key} className="grid-2">
            {r.map(input)}
          </div>
        ) : (
          input(r[0])
        ),
      )}
    </>
  );
}

export function FieldInput({ field: f, value, onChange, error }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const { pro } = useSession();
  const id = useId();
  const label = (
    <>
      {tl(f.label)}
      {f.required && <span className="faint">*</span>}
    </>
  );
  const keyName = pro ? f.key : undefined;
  const wrap = (control: React.ReactNode, extra?: React.ReactNode) => (
    <Field label={label} help={tl(f.help) || undefined} error={error} htmlFor={id} keyName={keyName} extra={extra}>
      {control}
    </Field>
  );
  const rewrite = (kind: SlotKind) => <AiRewrite value={(value as string) ?? ''} kind={kind} max={f.maxLength} onApply={onChange} />;

  switch (f.type) {
    case 'text':
    case 'email':
    case 'url':
      return wrap(
        <input
          id={id}
          className="input"
          type={f.type === 'email' ? 'email' : f.type === 'url' ? 'text' : 'text'}
          inputMode={f.type === 'url' ? 'url' : f.type === 'email' ? 'email' : undefined}
          value={(value as string) ?? ''}
          placeholder={f.placeholder ? tl(f.placeholder) : f.type === 'url' ? t('/seite oder https://…') : undefined}
          maxLength={f.maxLength ? f.maxLength + 40 : undefined}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />,
        f.type === 'text' && rewrite('plain'),
      );
    case 'textarea':
      return wrap(
        <textarea
          id={id}
          className="textarea"
          value={(value as string) ?? ''}
          placeholder={tl(f.placeholder) || undefined}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />,
        rewrite('multi'),
      );
    case 'richtext':
      return wrap(<RichText id={id} value={(value as string) ?? ''} onChange={onChange} />, rewrite('rich'));
    case 'number':
      return wrap(
        <input
          id={id}
          className="input num"
          type="number"
          inputMode="decimal"
          min={f.min}
          max={f.max}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />,
      );
    case 'money':
      return wrap(<MoneyInput id={id} value={value as number | null} onChange={onChange} />);
    case 'date':
      return wrap(<DateInput id={id} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} />);
    case 'datetime':
      return wrap(<DateTimeInput id={id} value={(value as string)?.slice(0, 16) ?? ''} onChange={(v) => onChange(v || null)} />);
    case 'boolean':
      return (
        <div className="field">
          <Toggle checked={Boolean(value)} onChange={onChange} label={tl(f.label)} help={tl(f.help) || undefined} />
          {keyName && (
            <span className="field-key" style={{ justifySelf: 'start' }}>
              {keyName}
            </span>
          )}
        </div>
      );
    case 'select':
      return wrap(
        <Select
          id={id}
          value={(value as string) ?? ''}
          onChange={onChange}
          options={[...(f.required ? [] : [{ value: '', label: '–' }]), ...(f.options ?? []).map((o) => ({ ...o, label: tl(o.label) }))]}
        />,
      );
    case 'multiselect': {
      const v = (value as string[]) ?? [];
      return wrap(
        <div className="chips" role="group" aria-label={tl(f.label)}>
          {f.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip"
              aria-pressed={v.includes(o.value)}
              onClick={() => onChange(v.includes(o.value) ? v.filter((x) => x !== o.value) : [...v, o.value])}
            >
              {tl(o.label)}
            </button>
          ))}
        </div>,
      );
    }
    case 'tags':
      return wrap(<TagInput id={id} value={(value as string[]) ?? []} onChange={onChange} />);
    case 'image':
    case 'file':
      return wrap(<MediaField value={(value as string) ?? null} onChange={onChange} type={f.type === 'image' ? 'image' : undefined} privateUpload={f.private} />);
    case 'images':
      return wrap(<MediaList value={(value as string[]) ?? []} onChange={onChange} />);
    case 'link':
      return wrap(<LinkInput value={(value as LinkValue) ?? null} onChange={onChange} />);
    case 'form':
      return wrap(<FormSelect id={id} value={(value as string) ?? ''} onChange={onChange} />);
    case 'relation':
      return wrap(<RelationSelect id={id} collection={f.collection ?? 'pages'} value={(value as string) ?? ''} onChange={onChange} />);
    case 'icon':
      return wrap(<IconInput id={id} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} />);
    case 'color':
      return wrap(
        <div className="row">
          <input
            type="color"
            value={(value as string) || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '2.5rem', height: '2.25rem', border: 0, background: 'none' }}
          />
          <input id={id} className="input mono" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>,
      );
    case 'location':
      return wrap(
        <input
          id={id}
          className="input"
          value={(value as { address?: string })?.address ?? ''}
          placeholder={t('Strasse, PLZ Ort')}
          onChange={(e) => onChange({ address: e.target.value })}
        />,
      );
    case 'json':
      return wrap(<CodeInput id={id} value={value} onChange={onChange} raw={f.key === 'code'} />);
    case 'group':
      return (
        <div className="field">
          <span className="field-label">
            {tl(f.label)}
            {keyName && <span className="field-key">{keyName}</span>}
          </span>
          {f.help && <span className="field-help">{tl(f.help)}</span>}
          <GroupInput field={f} value={(value as Values[]) ?? []} onChange={onChange} />
          {error && <span className="field-error">{error}</span>}
        </div>
      );
    default:
      return null;
  }
}

function MoneyInput({ id, value, onChange }: { id: string; value: number | null; onChange: (v: unknown) => void }) {
  const fmt = (v: number | null) => (v === null || v === undefined ? '' : (v / 100).toFixed(2));
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    const parsed = Math.round(parseFloat(text.replace(',', '.').replace(/[’'\s]/g, '')) * 100);
    if (parsed !== value) setText(fmt(value));
  }, [value]);
  return (
    <div className="input-affix">
      <span>CHF</span>
      <input
        id={id}
        className="input num"
        inputMode="decimal"
        value={text}
        placeholder="0.00"
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(',', '.').replace(/[’'\s]/g, ''));
          onChange(Number.isFinite(n) ? Math.round(n * 100) : null);
        }}
        onBlur={() => setText(fmt(value))}
      />
    </div>
  );
}

export function TagInput({ id, value, onChange }: { id?: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const tag = text.trim().replace(/,$/, '');
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setText('');
  };
  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span className="chip" key={tag}>
          {tag}
          <button type="button" aria-label={t('{name} entfernen', { name: tag })} onClick={() => onChange(value.filter((x) => x !== tag))}>
            <Icon name="x" size="s" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        placeholder={value.length ? '' : t('Eintippen, Enter drücken')}
        onChange={(e) => (e.target.value.endsWith(',') ? (setText(e.target.value), setTimeout(add)) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

export function MediaField({
  value,
  onChange,
  type,
  privateUpload,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  type?: 'image' | 'video' | 'file';
  privateUpload?: boolean;
}) {
  const m = useMedia(value);
  const [open, setOpen] = useState(false);
  return (
    <div className="media-field">
      <button type="button" className="preview" onClick={() => setOpen(true)} aria-label={value ? t('Ersetzen') : t('Auswählen')}>
        {m?.thumb ? <img src={m.thumb} alt="" /> : <Icon name={type === 'image' ? 'image' : 'page'} />}
        {m?.image && !m.alt && (
          <span className="warn-alt" title={t('Bild ohne Beschreibung')}>
            !
          </span>
        )}
      </button>
      <div className="stack tight" style={{ gap: '0.3rem', minWidth: 0 }}>
        {m && (
          <span className="small ellipsis" style={{ maxWidth: '14rem' }}>
            {m.filename}
          </span>
        )}
        {m?.image && !m.alt && (
          <span className="xsmall" style={{ color: 'var(--edited)' }}>
            {t('Beschreibung fehlt – in der Mediathek ergänzen')}
          </span>
        )}
        <div className="row">
          <button type="button" className="btn s" onClick={() => setOpen(true)}>
            {value ? t('Ersetzen') : t('Auswählen')}
          </button>
          {value && (
            <button type="button" className="btn s ghost" onClick={() => onChange(null)}>
              {t('Entfernen')}
            </button>
          )}
        </div>
      </div>
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        type={type}
        privateUpload={privateUpload}
        initial={value ? [value] : []}
        onPick={(ids) => {
          onChange(ids[0] ?? null);
          setOpen(false);
        }}
      />
    </div>
  );
}

function Thumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const m = useMedia(id);
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      style={{ position: 'relative', listStyle: 'none' }}
      whileDrag={{ scale: 1.06, zIndex: 3, boxShadow: 'var(--shadow-3)' }}
    >
      <div className="media-tile" style={{ width: '5rem', height: '5rem', cursor: 'grab', touchAction: 'none' }} onPointerDown={(e) => controls.start(e)}>
        {m?.thumb ? <img src={m.thumb} alt={m.alt} draggable={false} /> : <Icon name="image" />}
      </div>
      <button type="button" className="btn s icon-only" style={{ position: 'absolute', top: -8, right: -8, borderRadius: '50%' }} aria-label={t('Entfernen')} onClick={onRemove}>
        <Icon name="x" size="s" />
      </button>
    </Reorder.Item>
  );
}

export function MediaList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack tight">
      {value.length > 0 && (
        <Reorder.Group axis="x" values={value} onReorder={onChange} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: 0, margin: 0 }}>
          {value.map((id) => (
            <Thumb key={id} id={id} onRemove={() => onChange(value.filter((x) => x !== id))} />
          ))}
        </Reorder.Group>
      )}
      <div>
        <button type="button" className="btn s" onClick={() => setOpen(true)}>
          <Icon name="plus" size="s" />
          {t('Bilder hinzufügen')}
        </button>
      </div>
      <MediaPicker
        open={open}
        multiple
        type="image"
        onClose={() => setOpen(false)}
        initial={[]}
        onPick={(ids) => {
          onChange([...value, ...ids.filter((x) => !value.includes(x))]);
          setOpen(false);
        }}
      />
    </div>
  );
}

function LinkInput({ value, onChange }: { value: LinkValue | null; onChange: (v: LinkValue | null) => void }) {
  const { data } = useApi<{ entries: { id: string; slug: string; title: string }[] }>('/api/entries?collection=pages&limit=200');
  const v = value ?? { label: '', href: '' };
  const set = (patch: Partial<LinkValue>) => {
    const next = { ...v, ...patch };
    onChange(!next.label && !next.href ? null : next);
  };
  return (
    <div className="grid-2" style={{ gap: '0.5rem' }}>
      <input className="input" placeholder={t('Beschriftung')} value={v.label} onChange={(e) => set({ label: e.target.value })} aria-label={t('Beschriftung')} />
      <SuggestInput
        className="input"
        placeholder="/kontakt"
        value={v.href}
        onChange={(href) => set({ href })}
        aria-label={t('Ziel')}
        suggestions={(data?.entries ?? []).map((p) => ({ value: p.slug ? `/${p.slug}` : '/', label: p.title }))}
      />
    </div>
  );
}

function FormSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string | null) => void }) {
  const { data } = useApi<{ forms: { id: string; name: string }[] }>('/api/forms');
  return (
    <Select
      id={id}
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      placeholder={t('Formular wählen …')}
      options={(data?.forms ?? []).map((f) => ({ value: f.id, label: f.name }))}
    />
  );
}

function RelationSelect({ id, collection, value, onChange }: { id: string; collection: string; value: string; onChange: (v: string | null) => void }) {
  const { data } = useApi<{ entries: { id: string; title: string }[] }>(`/api/entries?collection=${collection}&limit=500`);
  return (
    <Select id={id} value={value ?? ''} onChange={(v) => onChange(v || null)} options={(data?.entries ?? []).map((e) => ({ value: e.id, label: e.title || t('(ohne Titel)') }))} />
  );
}

function CodeInput({ id, value, onChange, raw }: { id: string; value: unknown; onChange: (v: unknown) => void; raw: boolean }) {
  const [text, setText] = useState(raw ? String(value ?? '') : JSON.stringify(value ?? null, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <textarea
        id={id}
        className="textarea code"
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (raw) return onChange(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr(null);
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      />
      {err && <span className="field-error">JSON: {err}</span>}
    </>
  );
}

interface Item extends Values {
  _k: string;
}

function GroupItem({
  field,
  item,
  index,
  onChange,
  onRemove,
  open,
  setOpen,
}: {
  field: FieldDef;
  item: Item;
  index: number;
  onChange: (v: Item) => void;
  onRemove: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
}) {
  const controls = useDragControls();
  const titleField = field.fields?.find((f) => ['text', 'email'].includes(f.type));
  const title = (titleField && (item[titleField.key] as string)) || (field.itemLabel ? `${tl(field.itemLabel)} ${index + 1}` : t('Eintrag {n}', { n: index + 1 }));
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="repeat-item"
      style={{ listStyle: 'none', position: 'relative' }}
      whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-3)', zIndex: 5 }}
    >
      <header onPointerDown={(e) => (e.target as HTMLElement).closest('button') === null && controls.start(e)}>
        <span className="grip" aria-hidden="true">
          <Icon name="grip" size="s" />
        </span>
        <button
          type="button"
          className="title ellipsis"
          style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: '0.25rem 0' }}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {title}
        </button>
        <button type="button" className="btn ghost s icon-only" aria-label={t('{name} entfernen', { name: title })} onClick={onRemove}>
          <Icon name="trash" size="s" />
        </button>
        <button type="button" className="btn ghost s icon-only" aria-label={open ? t('Zuklappen') : t('Aufklappen')} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size="s" />
        </button>
      </header>
      {open && (
        <div className="body">
          <FieldList fields={field.fields ?? []} values={item} onChange={(k, v) => onChange({ ...item, [k]: v })} />
        </div>
      )}
    </Reorder.Item>
  );
}

/** Repeatable group with drag-to-reorder. Items get a stable client key while editing. */
export function GroupInput({ field, value, onChange }: { field: FieldDef; value: Values[]; onChange: (v: Values[]) => void }) {
  const [items, setItems] = useState<Item[]>(() => value.map((v) => ({ ...v, _k: shortId(6) })));
  const [openKey, setOpenKey] = useState<string | null>(items.length === 1 ? items[0]._k : null);
  useEffect(() => {
    // Keep local keys stable unless the outside value really changed (undo, reload).
    const strip = (x: Item[]) => JSON.stringify(x.map(({ _k, ...rest }) => rest));
    if (strip(items) !== JSON.stringify(value)) setItems(value.map((v, i) => ({ ...v, _k: items[i]?._k ?? shortId(6) })));
  }, [value]);
  const commit = (next: Item[]) => {
    setItems(next);
    onChange(next.map(({ _k, ...rest }) => rest));
  };
  const max = field.max ?? Infinity;
  return (
    <div className="repeat">
      <Reorder.Group axis="y" values={items} onReorder={commit} style={{ padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {items.map((it, i) => (
          <GroupItem
            key={it._k}
            field={field}
            item={it}
            index={i}
            open={openKey === it._k}
            setOpen={(o) => setOpenKey(o ? it._k : null)}
            onChange={(v) => commit(items.map((x) => (x._k === it._k ? v : x)))}
            onRemove={() => commit(items.filter((x) => x._k !== it._k))}
          />
        ))}
      </Reorder.Group>
      {items.length < max && (
        <button
          type="button"
          className="btn s"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            const fresh = { ...defaultsFor(field.fields ?? []), _k: shortId(6) } as Item;
            commit([...items, fresh]);
            setOpenKey(fresh._k);
          }}
        >
          <Icon name="plus" size="s" />
          {field.itemLabel ? t('{name} hinzufügen', { name: tl(field.itemLabel) }) : t('Eintrag hinzufügen')}
        </button>
      )}
    </div>
  );
}

/** One of Nova's website icons: search by word, grouped like a shop shelf. */
function IconInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const hits = (Object.entries(SITE_ICONS) as [string, IconDef][]).filter(([name, d]) => !words || name.includes(words) || d.label.toLowerCase().includes(words));
  const current = SITE_ICONS[value];
  return (
    <div className="row">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ('');
        }}
        className="icon-pop"
        trigger={
          <button id={id} type="button" className="btn icon-pick" aria-haspopup="dialog">
            {current ? <SiteIcon name={value} /> : <span className="icon-pick-empty" aria-hidden="true" />}
            <span>{current ? current.label.split(',')[0] : t('Symbol wählen')}</span>
          </button>
        }
      >
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Suchen, z. B. Kaffee oder Velo')} aria-label={t('Symbol suchen')} />
        <div className="icon-grid-wrap">
          {ICON_GROUPS.map((g) => {
            const list = hits.filter(([, d]) => d.group === g.id);
            if (!list.length) return null;
            return (
              <section key={g.id}>
                <h3 className="xsmall muted">{tl(g.label)}</h3>
                <div className="icon-grid" role="listbox" aria-label={tl(g.label)}>
                  {list.map(([name, d]) => (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={name === value}
                      className="icon-cell"
                      title={d.label}
                      aria-label={d.label.split(',')[0]}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                    >
                      <SiteIcon name={name} />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {!hits.length && <p className="small muted">{t('Kein Symbol passt zu «{q}».', { q })}</p>}
        </div>
      </Popover>
      {current && (
        <button type="button" className="btn ghost s" onClick={() => onChange('')}>
          {t('Entfernen')}
        </button>
      )}
    </div>
  );
}
