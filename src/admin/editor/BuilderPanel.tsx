import type { ReactNode } from 'react';
import { t } from '../lib/i18n';
import { Segmented } from '../ui/kit';
import type { ElKind } from '../../shared/elements';
import { BlockPicker } from './BlockPicker';
import { ElementPicker } from './elements/ElementToolbar';

export type BuilderTab = 'elements' | 'blocks' | 'layers';

/**
 * «Baukasten»: the page builder's side bar left of the canvas. Elements and
 * blocks are always at hand – dragged onto the page to where they belong,
 * or clicked to go after the selection – and the page's layers next to them.
 * The same pickers as behind «+», only open all the time.
 */
export function BuilderPanel({
  tab,
  onTab,
  elements,
  blocks,
  layers,
}: {
  tab: BuilderTab;
  onTab: (tab: BuilderTab) => void;
  elements: {
    onPick: (kind: ElKind) => void;
    into: string | null;
    inTemplate: boolean;
    components: { id: string; title: string }[];
    onPickComponent: (c: { id: string; title: string }) => void;
  };
  blocks: {
    onPick: (type: string, props?: Record<string, unknown>) => void;
    sections: { id: string; title: string }[];
    saved: { id: string; title: string }[];
    onPickSaved: (id: string) => void;
  };
  layers: ReactNode;
}) {
  return (
    <aside className="builder" aria-label={t('Baukasten')}>
      <div className="builder-tabs">
        <Segmented
          value={tab}
          onChange={onTab}
          label={t('Baukasten')}
          options={[
            { value: 'elements', label: t('Elemente') },
            { value: 'blocks', label: t('Blöcke') },
            { value: 'layers', label: t('Ebenen') },
          ]}
        />
      </div>
      <div className="builder-body">
        {tab === 'elements' && <ElementPicker {...elements} drag />}
        {tab === 'blocks' && <BlockPicker {...blocks} drag />}
        {tab === 'layers' && <div className="builder-layers">{layers}</div>}
      </div>
      {tab !== 'layers' && (
        <p className="builder-tip xsmall faint">
          {tab === 'elements'
            ? t('Auf die Seite ziehen – in ein freies Layout oder zwischen zwei Blöcke. Ein Klick setzt es hinter die Auswahl.')
            : t('Zwischen zwei Blöcke ziehen. Ein Klick setzt ihn hinter den gewählten Block.')}
        </p>
      )}
    </aside>
  );
}
