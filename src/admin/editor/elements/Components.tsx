import { useState } from 'react';
import { applyOverrides, componentEls, OVERRIDABLE, walkEls, type El, type Overrides } from '../../../shared/elements';
import type { FieldDef } from '../../../shared/fields';
import type { Block } from '../../../shared/types';
import { stripHtml } from '../../../shared/text';
import { useApi } from '../../lib/hooks';
import { t } from '../../lib/i18n';
import { FieldList } from '../../ui/FieldInput';
import { Icon } from '../../ui/icons';
import { Dialog, Field } from '../../ui/kit';
import { elLabel } from './ElementToolbar';

export interface ComponentRef {
  id: string;
  title: string;
}

/** «Als Komponente speichern»: a name, and what it means. */
export function ComponentDialog({ open, suggestion, onClose, onCreate }: { open: boolean; suggestion: string; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const value = name || suggestion;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('Als Komponente speichern')}
      description={t('Gestalte sie einmal und setz sie überall ein. Änderst du das Original, ändert sie sich auf allen Seiten – Texte, Bilder und Links passt du pro Stelle an.')}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          try {
            await onCreate(value.trim());
            setName('');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('Name der Komponente')} htmlFor="comp-name" help={t('Nur intern sichtbar, z. B. «Team-Karte» oder «Preis-Box».')}>
          <input id="comp-name" className="input" autoFocus value={value} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!value.trim() || busy}>
            <Icon name="component" size="s" /> {t('Komponente erstellen')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const propLabel = (prop: string) =>
  prop === 'label' ? t('Beschriftung') : prop === 'href' ? t('Link') : prop === 'image' ? t('Bild') : prop === 'alt' ? t('Bildbeschreibung') : t('Text');

/**
 * An instance's own texts, pictures and links. Empty means: as in the original.
 * Also: open the original, or detach this place from it.
 */
export function ComponentInspector({
  el,
  onChange,
  onOpen,
  onDetach,
  locked,
}: {
  el: El;
  onChange: (el: El) => void;
  onOpen: (id: string) => void;
  onDetach: (master: El[]) => void;
  locked: boolean;
}) {
  const ref = typeof el.props.ref === 'string' ? el.props.ref : null;
  const { data, error } = useApi<{ entry: { id: string; data: { title: string; blocks?: Block[] } } }>(ref ? `/api/entries/${ref}` : null);
  const overrides = (el.props.overrides as Overrides | undefined) ?? {};
  if (!ref || error) return <p className="small muted">{t('Diese Komponente gibt es nicht mehr. Entferne sie oder setz eine andere ein.')}</p>;
  if (!data) return <p className="small muted">{t('Lädt …')}</p>;
  const master = componentEls(data.entry.data.blocks);

  // One field per text, picture and link of the original; the original's value shows as a hint.
  const fields: FieldDef[] = [];
  const values: Record<string, unknown> = {};
  walkEls(master, (x) => {
    for (const prop of OVERRIDABLE[x.kind] ?? []) {
      const key = `${x.id}:${prop}`;
      const orig = x.props[prop];
      fields.push({
        key,
        type: prop === 'html' ? 'richtext' : prop === 'image' ? 'image' : prop === 'href' ? 'url' : 'text',
        // The main text of an element is named after the element, the rest after what it is.
        label: ['text', 'html', 'label'].includes(prop) ? elLabel(x) : `${elLabel(x)} · ${propLabel(prop)}`,
        placeholder: typeof orig === 'string' && prop !== 'image' && prop !== 'html' ? orig : undefined,
        help: prop === 'html' && typeof orig === 'string' && !overrides[x.id]?.html ? t('Im Original: «{text}»', { text: stripHtml(orig).slice(0, 80) }) : undefined,
      });
      values[key] = overrides[x.id]?.[prop] ?? (prop === 'image' ? orig : '');
    }
  });
  const count = Object.values(overrides).reduce((n, o) => n + Object.keys(o).length, 0);
  const set = (key: string, v: unknown) => {
    const [id, prop] = key.split(':');
    const next: Overrides = { ...overrides, [id]: { ...(overrides[id] ?? {}) } };
    const orig = findProp(master, id, prop);
    if (v === '' || v === null || v === undefined || v === orig || (prop === 'html' && !stripHtml(String(v)).trim())) delete next[id][prop];
    else next[id][prop] = v;
    if (!Object.keys(next[id]).length) delete next[id];
    onChange({ ...el, props: { ...el.props, overrides: next } });
  };

  return (
    <div className="stack">
      <div className="comp-card">
        <span className="comp-mark">
          <Icon name="component" />
        </span>
        <div>
          <strong>{data.entry.data.title}</strong>
          <span className="xsmall faint">{t('Komponente – Änderungen am Original erscheinen überall.')}</span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: '0.4rem' }}>
        <button type="button" className="btn s" onClick={() => onOpen(ref)}>
          <Icon name="pen" size="s" /> {t('Original bearbeiten')}
        </button>
        {!locked && (
          <button type="button" className="btn ghost s" onClick={() => onDetach(applyOverrides(master, overrides))}>
            <Icon name="unlink" size="s" /> {t('Von Komponente lösen')}
          </button>
        )}
      </div>
      <div className="items-head">
        <span className="section-title">{t('Anpassungen an dieser Stelle')}</span>
        {count > 0 && !locked && (
          <button type="button" className="btn ghost s" onClick={() => onChange({ ...el, props: { ...el.props, overrides: {} } })}>
            {t('Alle zurücksetzen')}
          </button>
        )}
      </div>
      {fields.length ? (
        <FieldList fields={fields} values={values} onChange={set} locked={locked ? () => t('Dieser Block ist geschützt.') : undefined} />
      ) : (
        <p className="small muted">{t('Diese Komponente hat keine Texte, Bilder oder Links, die sich pro Stelle anpassen lassen.')}</p>
      )}
      <p className="xsmall faint">{t('Leer heisst: wie im Original. Texte schreibst du auch direkt auf der Seite.')}</p>
    </div>
  );
}

function findProp(els: El[], id: string, prop: string): unknown {
  let v: unknown;
  walkEls(els, (x) => {
    if (x.id === id) v = x.props[prop];
  });
  return v;
}
