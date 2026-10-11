import { Reorder, useDragControls } from 'motion/react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { t, tl } from '../lib/i18n';
import { Dialog, Field, Select, Toggle, confirm } from '../ui/kit';
import { Icon } from '../ui/icons';
import { useToast } from '../ui/toast';
import { FIELD_TYPE_LABELS, type FieldDef, type FieldType } from '../../shared/fields';
import { freeAddress, keyFields, newType, STUDIO_FIELD_TYPES, TYPE_PRESETS, type TypePreset } from '../../shared/type-presets';
import { archiveStarter, templateStarter } from '../../shared/elements';
import { shortId } from '../../shared/text';
import type { CollectionDef } from '../../shared/types';

/** Fields as a non-programmer sees them: a label, what kind of value, required or not. Keys stay out of sight. */
function StudioField({ field, kept, onChange, onRemove }: { field: FieldDef; kept: boolean; onChange: (f: FieldDef) => void; onRemove: () => void }) {
  const controls = useDragControls();
  const options = (field.options ?? []).map((o) => o.label).join('\n');
  return (
    <Reorder.Item value={field} dragListener={false} dragControls={controls} className="type-field" whileDrag={{ scale: 1.01, zIndex: 4, boxShadow: 'var(--shadow-3)' }}>
      <span className="grip" onPointerDown={(e) => controls.start(e)} aria-hidden="true">
        <Icon name="grip" size="s" />
      </span>
      <input
        className="input"
        value={field.label}
        placeholder={t('Beschriftung, z. B. «Preis pro Person»')}
        aria-label={t('Beschriftung')}
        onChange={(e) => onChange({ ...field, label: e.target.value })}
      />
      <Select
        value={field.type}
        label={t('Art')}
        disabled={kept}
        onChange={(v) => onChange({ ...field, type: v as FieldType, ...(v === 'select' && !field.options?.length ? { options: [] } : {}) })}
        options={(STUDIO_FIELD_TYPES.includes(field.type) ? STUDIO_FIELD_TYPES : [field.type, ...STUDIO_FIELD_TYPES]).map((ft) => ({
          value: ft,
          label: tl(FIELD_TYPE_LABELS[ft]),
        }))}
      />
      <label className="type-field-req" title={t('Pflichtfeld')}>
        <input type="checkbox" checked={Boolean(field.required)} onChange={(e) => onChange({ ...field, required: e.target.checked || undefined })} /> {t('Pflicht')}
      </label>
      <button type="button" className="btn ghost s icon-only" aria-label={t('Feld entfernen')} onClick={onRemove} disabled={field.key === 'title'}>
        <Icon name="trash" size="s" />
      </button>
      {field.type === 'select' && (
        <textarea
          className="textarea type-field-options"
          rows={3}
          defaultValue={options}
          placeholder={t('Eine Auswahl pro Zeile')}
          aria-label={t('Auswahl')}
          onBlur={(e) => {
            const labels = e.target.value
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            // Values stay what they were for choices that keep their label – entries refer to them.
            onChange({ ...field, options: labels.map((label) => field.options?.find((o) => o.label === label) ?? { value: label, label }) });
          }}
        />
      )}
    </Reorder.Item>
  );
}

function StudioFields({ fields, kept, onChange }: { fields: FieldDef[]; kept: Set<string>; onChange: (f: FieldDef[]) => void }) {
  return (
    <div className="stack tight">
      <Reorder.Group axis="y" values={fields} onReorder={onChange} className="type-fields">
        {fields.map((f, i) => (
          <StudioField
            key={f.key || `new-${i}`}
            field={f}
            kept={kept.has(f.key)}
            onChange={(nf) => onChange(fields.map((x) => (x === f ? nf : x)))}
            onRemove={() => onChange(fields.filter((x) => x !== f))}
          />
        ))}
      </Reorder.Group>
      <button type="button" className="btn s" style={{ justifySelf: 'start' }} onClick={() => onChange([...fields, { key: '', type: 'text', label: '' }])}>
        <Icon name="plus" size="s" /> {t('Feld hinzufügen')}
      </button>
    </div>
  );
}

const missingLabel = (fields: FieldDef[]) => fields.some((f) => !f.label.trim());

/** A new content type in a few steps: a starting point, its name and fields, and – if it has pages – their design. */
export function NewTypeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { reloadSettings } = useSession();
  const [preset, setPreset] = useState<TypePreset | null>(null);
  const [name, setName] = useState('');
  const [singular, setSingular] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [pages, setPages] = useState(true);
  const [blocks, setBlocks] = useState(false);
  const [design, setDesign] = useState(true);
  const [busy, setBusy] = useState(false);
  const pick = (p: TypePreset) => {
    setPreset(p);
    setName(tl(p.name));
    setSingular(tl(p.singular));
    setFields(
      p.fields.map((f) => ({
        ...f,
        label: tl(f.label),
        help: f.help ? tl(f.help) : undefined,
        ...(f.options ? { options: f.options.map((o) => ({ value: o.value, label: tl(o.label) })) } : {}),
      })),
    );
    setPages(p.pages);
    setBlocks(p.blocks);
    setDesign(p.pages);
  };
  const close = () => {
    setPreset(null);
    onClose();
  };
  const { data: cols } = useApi<{ collections: CollectionDef[] }>(open ? '/api/collections' : null);
  const at = freeAddress(name, cols?.collections ?? []);
  const create = async () => {
    if (!name.trim()) return toast(t('Bitte gib dem Inhaltstyp einen Namen.'), { kind: 'bad' });
    if (missingLabel(fields)) return toast(t('Jedes Feld braucht eine Beschriftung.'), { kind: 'bad' });
    setBusy(true);
    try {
      const body = newType({ name, singular, icon: preset?.icon ?? 'layers', fields, pages, blocks }, cols?.collections ?? []);
      const { collection: col } = await api.post<{ collection: CollectionDef }>('/api/collections', body);
      // Page and overview as drafts: nothing changes on the website until they are published.
      if (pages && design) {
        const section = (title: string, kind: string, els: unknown[]) =>
          api.post('/api/entries', {
            collection: 'sections',
            data: { title, kind, template_for: col.id, blocks: [{ id: shortId(8), type: 'layout', props: { width: 'content', els }, style: {} }] },
          });
        await section(t('Vorlage für {name}', { name: col.name }), 'template', templateStarter(col));
        await section(t('Übersicht von {name}', { name: col.name }), 'archive', archiveStarter(col));
      }
      void reloadSettings();
      toast(
        pages && design
          ? t('«{name}» ist angelegt. Seitenvorlage und Archiv-Vorlage liegen als Entwurf bereit.', { name: col.name })
          : t('«{name}» ist angelegt.', { name: col.name }),
      );
      close();
      navigate(`/inhalte/${col.id}`);
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={preset ? t('Neuer Inhaltstyp') : t('Was möchtest du sammeln?')} wide>
      {!preset ? (
        <div className="type-presets">
          {TYPE_PRESETS.map((p) => (
            <button key={p.id || 'own'} type="button" className="type-preset" onClick={() => pick(p)}>
              <Icon name={p.icon} />
              <strong>{p.id ? tl(p.name) : t('Eigener Typ')}</strong>
              <span className="xsmall muted">{tl(p.description)}</span>
              {p.id && <span className="xsmall faint">{p.fields.map((f) => tl(f.label)).join(' · ')}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="stack">
          <div className="grid-2">
            <Field label={t('Name (Mehrzahl)')} help={t('z. B. «Rezepte»')}>
              <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('Ein Eintrag heisst')} help={t('z. B. «Rezept»')}>
              <input className="input" value={singular} onChange={(e) => setSingular(e.target.value)} />
            </Field>
          </div>
          <Toggle
            checked={pages}
            onChange={setPages}
            label={t('Jeder Eintrag bekommt eine eigene Seite')}
            help={name.trim() ? t('Unter {route}, dazu eine Übersicht unter {list}.', { route: at.route.replace(':slug', '…'), list: at.list }) : undefined}
          />
          {pages && (
            <Toggle
              checked={design}
              onChange={setDesign}
              label={t('Seite und Übersicht gleich gestalten')}
              help={t('Legt eine Seitenvorlage und eine Archiv-Vorlage im freien Layout an – als Entwurf, mit den Feldern verbunden.')}
            />
          )}
          <Toggle checked={blocks} onChange={setBlocks} label={t('Mit Seiteninhalt (freie Blöcke)')} help={t('Jeder Eintrag bekommt zusätzlich den visuellen Editor.')} />
          <span className="section-title">{t('Felder')}</span>
          <StudioFields fields={fields} kept={new Set()} onChange={setFields} />
          <div className="dialog-actions">
            <button className="btn ghost" onClick={() => setPreset(null)}>
              {t('Zurück')}
            </button>
            <button className="btn primary" onClick={() => void create()} disabled={busy}>
              {t('Inhaltstyp anlegen')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** The fields of an existing type – for built-in ones only the site's own, next to Nova's. */
export function TypeFieldsDialog({ col, open, onClose, onSaved }: { col: CollectionDef & { count?: number }; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { reloadSettings } = useSession();
  const own = col.builtin ? (col.custom_fields ?? []) : col.fields;
  const [fields, setFields] = useState<FieldDef[]>(own);
  // Fields with entries keep their kind: a date does not turn into a picture.
  const kept = new Set((col.count ?? 0) > 0 ? own.map((f) => f.key) : []);
  const fixed = col.builtin ? col.fields.filter((f) => !own.some((x) => x.key === f.key)) : [];
  const save = async () => {
    if (missingLabel(fields)) return toast(t('Jedes Feld braucht eine Beschriftung.'), { kind: 'bad' });
    const gone = own.filter((f) => !fields.some((x) => x.key === f.key));
    if (
      gone.length &&
      (col.count ?? 0) > 0 &&
      !(await confirm({
        title: t('{n} Felder entfernen?', { n: gone.length }),
        message: t('Was in den Einträgen darin steht, erscheint danach nirgends mehr: {fields}.', { fields: gone.map((f) => f.label).join(', ') }),
        confirm: t('Entfernen'),
        danger: true,
      }))
    )
      return;
    try {
      const next = keyFields(
        fields,
        fixed.map((f) => f.key),
      );
      await api.put(`/api/collections/${col.id}`, col.builtin ? { custom_fields: next } : { fields: next });
      void reloadSettings();
      toast(t('Felder gespeichert. Das Formular jedes Eintrags zeigt sie sofort.'));
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, { kind: 'bad' });
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={t('Felder von «{name}»', { name: tl(col.name) })} wide>
      <div className="stack">
        {fixed.length > 0 && (
          <div className="stack tight">
            <span className="section-title">{t('Felder von Nova')}</span>
            <ul className="field-chips">
              {fixed.map((f) => (
                <li key={f.key}>
                  {tl(f.label)} <span className="muted">· {tl(FIELD_TYPE_LABELS[f.type])}</span>
                </li>
              ))}
            </ul>
            <span className="section-title">{t('Eigene Felder')}</span>
          </div>
        )}
        <StudioFields fields={fields} kept={kept} onChange={setFields} />
        {kept.size > 0 && <p className="xsmall faint">{t('Bei Feldern mit Einträgen bleibt die Art fest – leg für etwas anderes ein neues Feld an.')}</p>}
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" onClick={() => void save()}>
            {t('Speichern')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
