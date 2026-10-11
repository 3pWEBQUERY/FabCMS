import { useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { Icon } from '../ui/icons';
import { Dialog, Field } from '../ui/kit';
import { cloneEl, type El } from '../../shared/elements';
import { shortId } from '../../shared/text';
import type { Block } from '../../shared/types';

/**
 * «Bereichsvorlagen»: a section saved once and inserted anywhere as its own
 * copy – unlike a reusable section or a component, nothing stays linked.
 * They are entries of «Sektionen» with the kind «saved».
 */

/** A copy of saved blocks with ids of their own (blocks and every element in them). */
export function freshCopy(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const copy: Block = { ...structuredClone(b), id: shortId(8), lock: 'none' };
    if (copy.type === 'layout') copy.props = { ...copy.props, els: ((copy.props.els as El[] | undefined) ?? []).map(cloneEl) };
    return copy;
  });
}

/** Stores a section as a template. */
export async function saveSectionTemplate(block: Block, name: string): Promise<void> {
  await api.post('/api/entries', { collection: 'sections', data: { title: name, kind: 'saved', blocks: [{ ...structuredClone(block), lock: 'none' }] } });
}

/** The blocks of a saved template, ready to insert. */
export async function loadSectionTemplate(id: string): Promise<Block[]> {
  const r = await api.get<{ entry: { data: { blocks?: Block[] } } }>(`/api/entries/${id}`);
  return freshCopy(r.entry.data.blocks ?? []);
}

/** «Als Vorlage speichern»: a name, and what it means. */
export function SaveTemplateDialog({ open, suggestion, onClose, onSave }: { open: boolean; suggestion: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const value = name || suggestion;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('Als Vorlage speichern')}
      description={t('Unter «Block einfügen» → «Meine Vorlagen» steht der Bereich dann auf jeder Seite bereit – jedes Mal als eigene Kopie, die du frei änderst.')}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          try {
            await onSave(value.trim());
            setName('');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('Name der Vorlage')} htmlFor="tpl-name" help={t('Nur intern sichtbar, z. B. «Hero mit Video» oder «Drei Vorteile».')}>
          <input id="tpl-name" className="input" autoFocus value={value} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" disabled={!value.trim() || busy}>
            <Icon name="folder" size="s" /> {t('Vorlage speichern')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
