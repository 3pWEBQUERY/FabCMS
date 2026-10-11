import { motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { BLOCK_MAP } from '../../../shared/blocks';
import type { AlignHow } from '../../../shared/canvas';
import { useSession } from '../../lib/session';
import { EL_DEFS, EL_GROUP_LABELS, EL_GROUPS, EL_KINDS, ITEM_CONTAINERS, type El, type ElKind, type Found } from '../../../shared/elements';
import { t, tl } from '../../lib/i18n';
import { Icon } from '../../ui/icons';
import { Menu, Tip } from '../../ui/kit';
import { dragSource, NEW_EL } from '../dragNew';
import { useElFavorites } from './recentEls';

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
  onAddItem,
  onDuplicate,
  onWrap,
  onComponent,
  onRemove,
  canvas,
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
  /** Entry containers (questions, tabs, slides): one more entry. */
  onAddItem: () => void;
  onDuplicate: () => void;
  onWrap: () => void;
  /** Saves the element as a component – or, for an instance, opens its original. */
  onComponent: () => void;
  onRemove: () => void;
  /** On a free canvas: how many are chosen, and lining them up. */
  canvas?: { count: number; onAlign: (how: AlignHow) => void };
}) {
  const siblings = found.parent ? (found.parent.children?.length ?? 1) : null;
  const items = ITEM_CONTAINERS.includes(found.el.kind);
  const insertLabel = items
    ? addItemLabel(found.el.kind)
    : found.el.kind === 'box' || found.el.kind === 'list' || found.el.kind === 'canvas'
      ? t('Element hineinlegen')
      : t('Element danach einfügen');
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
      {canvas && canvas.count > 1 && <span className="el-count">{t('{n} gewählt', { n: canvas.count })}</span>}
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
          {canvas && (
            <Menu
              align="start"
              trigger={
                <button className="btn icon-only" aria-label={canvas.count > 1 ? t('Ausrichten') : t('Auf der Fläche ausrichten')}>
                  <Icon name="justCenter" size="s" />
                </button>
              }
              items={[
                ...ALIGN.map((a) => ({ label: tl(a.label), icon: a.icon, onSelect: () => canvas.onAlign(a.how) })),
                'sep' as const,
                ...SPACE.map((a) => ({ label: tl(a.label), icon: a.icon, onSelect: () => canvas.onAlign(a.how), hidden: canvas.count < 3 })),
              ]}
            />
          )}
          <Tip label={insertLabel}>
            <button className="btn icon-only" onClick={(e) => (items ? onAddItem() : onInsert((e.currentTarget as HTMLElement).getBoundingClientRect()))} aria-label={insertLabel}>
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
          <Tip label={found.el.kind === 'component' ? t('Original bearbeiten') : t('Als Komponente speichern')}>
            <button className="btn icon-only comp-btn" onClick={onComponent} aria-label={found.el.kind === 'component' ? t('Original bearbeiten') : t('Als Komponente speichern')}>
              <Icon name="component" size="s" />
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

/** One element lines up with the canvas, several with each other. */
const ALIGN: { how: AlignHow; label: string; icon: string }[] = [
  { how: 'left', label: 'Links ausrichten', icon: 'justStart' },
  { how: 'center', label: 'Horizontal zentrieren', icon: 'justCenter' },
  { how: 'right', label: 'Rechts ausrichten', icon: 'justEnd' },
  { how: 'top', label: 'Oben ausrichten', icon: 'alignTop' },
  { how: 'middle', label: 'Vertikal zentrieren', icon: 'alignMiddle' },
  { how: 'bottom', label: 'Unten ausrichten', icon: 'alignBottom' },
];
const SPACE: { how: AlignHow; label: string; icon: string }[] = [
  { how: 'hspace', label: 'Horizontal gleich verteilen', icon: 'dirRow' },
  { how: 'vspace', label: 'Vertikal gleich verteilen', icon: 'dirColumn' },
];

/** The kinds of elements, to insert one – and the site's own components. */
export function ElementPicker({
  onPick,
  into,
  inTemplate,
  components,
  onPickComponent,
  drag,
}: {
  onPick: (kind: ElKind) => void;
  into: string | null;
  /** Page templates also offer «Inhalt des Eintrags». */
  inTemplate: boolean;
  components: { id: string; title: string }[];
  onPickComponent: (c: { id: string; title: string }) => void;
  /** In the builder's side bar: always open, so no focus grab – and every element can be dragged onto the page. */
  drag?: boolean;
}) {
  const [q, setQ] = useState('');
  const { settings } = useSession();
  // Shop elements only where there is a shop.
  const shop = Boolean(settings?.modules.includes('shop'));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (...texts: string[]) => words.every((w) => texts.some((x) => x.toLowerCase().includes(w)));
  const kinds = EL_KINDS.filter(
    (k) =>
      k !== 'component' && (k !== 'entrybody' || inTemplate) && (shop || EL_DEFS[k].group !== 'shop') && hit(tl(EL_DEFS[k].label), tl(EL_DEFS[k].description), EL_DEFS[k].label),
  );
  const comps = components.filter((c) => hit(c.title));
  const first = () => (kinds[0] ? onPick(kinds[0]) : comps[0] ? onPickComponent(comps[0]) : undefined);
  const { favs, recent, toggle } = useElFavorites();
  // Without a search: the starred ones, then the last used (those not starred).
  const pinned = words.length
    ? []
    : [
        { id: 'favs', title: t('Favoriten'), kinds: favs.filter((k) => kinds.includes(k)) },
        { id: 'recent', title: t('Zuletzt verwendet'), kinds: recent.filter((k) => kinds.includes(k) && !favs.includes(k)) },
      ].filter((x) => x.kinds.length);
  const tile = (k: ElKind) => {
    const pick = (
      <button key={k} type="button" {...dragSource(drag, NEW_EL, { kind: k })} onClick={() => onPick(k)} title={tl(EL_DEFS[k].description)}>
        <Icon name={EL_DEFS[k].icon} />
        <span>{tl(EL_DEFS[k].label)}</span>
      </button>
    );
    // The side bar can star them; the quick picker only shows them.
    if (!drag) return pick;
    const on = favs.includes(k);
    return (
      <div key={k} className="el-tile">
        {pick}
        <button
          type="button"
          className="el-star"
          aria-pressed={on}
          onClick={() => toggle(k)}
          title={on ? t('Aus den Favoriten nehmen') : t('Zu den Favoriten')}
          aria-label={t('«{name}» als Favorit', { name: tl(EL_DEFS[k].label) })}
        >
          <Icon name="star" size="s" />
        </button>
      </div>
    );
  };
  return (
    <div className="el-picker">
      <span className="dp-menu-head">{into ? t('In «{name}» einfügen', { name: into }) : t('Element einfügen')}</span>
      <input
        className="input el-picker-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            first();
          }
        }}
        placeholder={t('Suchen – Enter fügt das erste ein')}
        aria-label={t('Elemente suchen')}
        autoFocus={!drag}
      />
      {!kinds.length && !comps.length && <p className="xsmall faint el-picker-note">{t('Nichts gefunden.')}</p>}
      {pinned.map((x) => (
        <section key={x.id} className="el-picker-group">
          <h3 className="el-picker-title">{x.title}</h3>
          <div className="el-picker-grid">{x.kinds.map(tile)}</div>
        </section>
      ))}
      {EL_GROUPS.filter((g) => kinds.some((k) => EL_DEFS[k].group === g)).map((g) => (
        <section key={g} className="el-picker-group">
          <h3 className="el-picker-title">{tl(EL_GROUP_LABELS[g])}</h3>
          <div className="el-picker-grid">{kinds.filter((k) => EL_DEFS[k].group === g).map(tile)}</div>
        </section>
      ))}
      {(!words.length || comps.length > 0) && (
        <section className="el-picker-group">
          <h3 className="el-picker-title">{t('Komponenten')}</h3>
          {comps.length ? (
            <div className="el-picker-comps">
              {comps.map((c) => (
                <button key={c.id} type="button" {...dragSource(drag, NEW_EL, { component: c.id, title: c.title })} onClick={() => onPickComponent(c)}>
                  <Icon name="component" size="s" />
                  <span>{c.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="xsmall faint el-picker-note">{t('Noch keine. Wähl ein Element und speichere es mit dem Rauten-Symbol als Komponente.')}</p>
          )}
        </section>
      )}
    </div>
  );
}

export const addItemLabel = (kind: ElKind) =>
  kind === 'accordion' ? t('Frage hinzufügen') : kind === 'tabs' ? t('Reiter hinzufügen') : kind === 'slider' ? t('Folie hinzufügen') : t('Eintrag hinzufügen');
