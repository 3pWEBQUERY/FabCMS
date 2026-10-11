import { useRef, useState } from 'react';
import { EL_DEFS, isContainer, type El } from '../../../shared/elements';
import { stripHtml } from '../../../shared/text';
import { t } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { elLabel } from './ElementToolbar';

type Drop = { id: string; where: 'before' | 'after' | 'inside' };
interface Row {
  el: El;
  depth: number;
  parent: El | null;
  index: number;
}

const preview = (el: El) =>
  el.kind === 'heading' ? String(el.props.text ?? '') : el.kind === 'text' ? stripHtml(String(el.props.html ?? '')) : el.kind === 'button' ? String(el.props.label ?? '') : '';

/**
 * The elements of a free layout as a tree: click to select, hover to find
 * it on the page, drag a row before, after or into a container.
 */
export function LayersTree({
  els,
  selected,
  onSelect,
  onHover,
  onMove,
  locked,
  peek,
  onPeek,
  onPin,
}: {
  els: El[];
  selected: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onMove: (id: string, parent: string | null, index: number) => void;
  locked: boolean;
  peek: Set<string>;
  onPeek: (id: string) => void;
  onPin: (id: string) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const list = useRef<HTMLUListElement>(null);

  const rows: Row[] = [];
  const visit = (items: El[], depth: number, parent: El | null) =>
    items.forEach((el, index) => {
      rows.push({ el, depth, parent, index });
      if (el.children?.length && !closed.has(el.id)) visit(el.children, depth + 1, el);
    });
  visit(els, 0, null);

  const target = (y: number): Drop | null => {
    const nodes = [...(list.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (y < r.top || y > r.bottom) continue;
      const row = rows.find((x) => x.el.id === n.dataset.row)!;
      if (row.el.id === drag) return null;
      const f = (y - r.top) / r.height;
      if (isContainer(row.el.kind) && row.el.kind !== 'list' && f > 0.28 && f < 0.72) return { id: row.el.id, where: 'inside' };
      return { id: row.el.id, where: f < 0.5 ? 'before' : 'after' };
    }
    return null;
  };

  const finish = () => {
    if (drag && drop) {
      const row = rows.find((x) => x.el.id === drop.id);
      if (row) {
        if (drop.where === 'inside') onMove(drag, row.el.id, row.el.children?.length ?? 0);
        else onMove(drag, row.parent?.id ?? null, drop.where === 'before' ? row.index : row.index + 1);
      }
    }
    setDrag(null);
    setDrop(null);
  };

  return (
    // Pointer events stay in the tree: the block list around it is draggable too.
    <ul ref={list} className="layers" role="tree" aria-label={t('Elemente')} onPointerLeave={() => onHover(null)} onPointerDown={(e) => e.stopPropagation()}>
      {rows.map(({ el, depth }) => {
        const kids = el.children?.length ?? 0;
        const text = preview(el);
        const mark = drop?.id === el.id ? `drop-${drop.where}` : '';
        return (
          <li
            key={el.id}
            data-row={el.id}
            role="treeitem"
            aria-selected={selected === el.id}
            aria-expanded={kids ? !closed.has(el.id) : undefined}
            className={`layer ${mark} ${drag === el.id ? 'dragging' : ''} ${peek.has(el.id) ? 'peeked' : ''}`}
            style={{ paddingLeft: `${0.35 + depth * 0.95}rem` }}
            onPointerEnter={() => onHover(el.id)}
          >
            {kids ? (
              <button
                type="button"
                className="layer-twist"
                aria-label={closed.has(el.id) ? t('Aufklappen') : t('Zuklappen')}
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(el.id)) n.delete(el.id);
                    else n.add(el.id);
                    return n;
                  })
                }
              >
                <Icon name={closed.has(el.id) ? 'chevronRight' : 'chevronDown'} size="s" />
              </button>
            ) : (
              <span className="layer-twist" />
            )}
            <button type="button" className="layer-main" onClick={() => onSelect(el.id)}>
              <Icon name={EL_DEFS[el.kind].icon} size="s" />
              <span className="layer-name">{elLabel(el)}</span>
              {text && <span className="layer-text">{text}</span>}
              {el.show?.length ? (
                <span className="layer-cond" title={t('Nur unter Bedingungen sichtbar')} aria-label={t('Nur unter Bedingungen sichtbar')}>
                  <Icon name="filter" size="s" />
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={`layer-flag ${peek.has(el.id) ? 'on' : ''}`}
              aria-pressed={peek.has(el.id)}
              aria-label={peek.has(el.id) ? t('Im Editor wieder zeigen') : t('Im Editor ausblenden')}
              title={peek.has(el.id) ? t('Im Editor wieder zeigen') : t('Im Editor ausblenden – die Website bleibt, wie sie ist')}
              onClick={() => onPeek(el.id)}
            >
              <Icon name={peek.has(el.id) ? 'eyeOff' : 'eye'} size="s" />
            </button>
            {!locked && (
              <button
                type="button"
                className={`layer-flag ${el.pinned ? 'on' : ''}`}
                aria-pressed={Boolean(el.pinned)}
                aria-label={el.pinned ? t('Entsperren') : t('Sperren')}
                title={el.pinned ? t('Entsperren') : t('Sperren – auf der Fläche nicht mehr wählbar, verschiebbar oder löschbar')}
                onClick={() => onPin(el.id)}
              >
                <Icon name={el.pinned ? 'lock' : 'unlock'} size="s" />
              </button>
            )}
            {!locked && !el.pinned && (
              <span
                className="layer-grip"
                aria-hidden="true"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag(el.id);
                }}
                onPointerMove={(e) => drag && setDrop(target(e.clientY))}
                onPointerUp={finish}
                onPointerCancel={() => {
                  setDrag(null);
                  setDrop(null);
                }}
              >
                <Icon name="grip" size="s" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
