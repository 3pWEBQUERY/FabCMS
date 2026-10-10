import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { BLOCK_MAP } from '../../../shared/blocks';
import { EL_DEFS, EL_KINDS, type El, type ElKind, type Found } from '../../../shared/elements';
import { t, tl } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Tip } from '../../ui/kit';

export const elLabel = (el: El) => el.name || tl(EL_DEFS[el.kind].label);

/**
 * Toolbar of the selected element: where it sits (click a step to select it),
 * then edit, move, insert, duplicate, wrap and remove.
 */
export function ElementToolbar({
  found,
  top,
  left,
  locked,
  onSelect,
  onSelectBlock,
  onEdit,
  onMove,
  onInsert,
  onDuplicate,
  onWrap,
  onRemove,
}: {
  found: Found;
  top: number;
  left: number;
  locked: boolean;
  onSelect: (id: string) => void;
  onSelectBlock: () => void;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsert: (anchor: DOMRect) => void;
  onDuplicate: () => void;
  onWrap: () => void;
  onRemove: () => void;
}) {
  const siblings = found.parent ? (found.parent.children?.length ?? 1) : null;
  // Stays inside the canvas: shifts left when the element sits far right.
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(left);
  useLayoutEffect(() => {
    const room = ref.current?.parentElement?.clientWidth ?? Infinity;
    const width = ref.current?.offsetWidth ?? 0;
    setX(Math.max(8, Math.min(left, room - width - 8)));
  }, [left, found.el.id, found.ancestors.length]);
  return (
    <motion.div
      ref={ref}
      className="block-toolbar el-toolbar"
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, top, left: x }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ type: 'spring', stiffness: 700, damping: 45 }}
      style={{ top, left: x }}
      role="toolbar"
      aria-label={t('{name} bearbeiten', { name: elLabel(found.el) })}
    >
      <nav className="el-crumbs" aria-label={t('Wo das Element sitzt')}>
        <button type="button" onClick={onSelectBlock} className="crumb-block">
          {tl(BLOCK_MAP.layout.label)}
        </button>
        {found.ancestors.map((a) => (
          <button key={a.id} type="button" onClick={() => onSelect(a.id)}>
            {elLabel(a)}
          </button>
        ))}
        <span className="here" aria-current="true">
          <Icon name={EL_DEFS[found.el.kind].icon} size="s" />
          {elLabel(found.el)}
        </span>
      </nav>
      <span className="sep" />
      <button className="btn" onClick={onEdit}>
        <Icon name="settings" size="s" /> {t('Bearbeiten')}
      </button>
      {!locked && (
        <>
          <Tip label={t('Nach vorne')}>
            <button className="btn icon-only" disabled={found.index <= 0} onClick={() => onMove(-1)} aria-label={t('Nach vorne')}>
              <Icon name="arrowUp" size="s" />
            </button>
          </Tip>
          <Tip label={t('Nach hinten')}>
            <button className="btn icon-only" disabled={siblings !== null ? found.index >= siblings - 1 : false} onClick={() => onMove(1)} aria-label={t('Nach hinten')}>
              <Icon name="arrowDown" size="s" />
            </button>
          </Tip>
          <Tip label={found.el.kind === 'box' ? t('Element hineinlegen') : t('Element danach einfügen')}>
            <button
              className="btn icon-only"
              onClick={(e) => onInsert((e.currentTarget as HTMLElement).getBoundingClientRect())}
              aria-label={found.el.kind === 'box' ? t('Element hineinlegen') : t('Element danach einfügen')}
            >
              <Icon name="plus" size="s" />
            </button>
          </Tip>
          <Tip label={t('Duplizieren')}>
            <button className="btn icon-only" onClick={onDuplicate} aria-label={t('Duplizieren')}>
              <Icon name="copy" size="s" />
            </button>
          </Tip>
          <Tip label={t('In Container packen')}>
            <button className="btn icon-only" onClick={onWrap} aria-label={t('In Container packen')}>
              <Icon name="box" size="s" />
            </button>
          </Tip>
          <Tip label={t('Entfernen')}>
            <button className="btn icon-only" onClick={onRemove} aria-label={t('Entfernen')}>
              <Icon name="trash" size="s" />
            </button>
          </Tip>
        </>
      )}
    </motion.div>
  );
}

/** The kinds of elements, to insert one. */
export function ElementPicker({ onPick, into }: { onPick: (kind: ElKind) => void; into: string | null }) {
  return (
    <div className="el-picker">
      <span className="dp-menu-head">{into ? t('In «{name}» einfügen', { name: into }) : t('Element einfügen')}</span>
      <div className="el-picker-grid">
        {EL_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => onPick(k)} title={tl(EL_DEFS[k].description)}>
            <Icon name={EL_DEFS[k].icon} />
            <span>{tl(EL_DEFS[k].label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
