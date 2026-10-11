import { BLOCK_MAP } from '../../shared/blocks';
import { cleanAnchor, elementsText, type El } from '../../shared/elements';
import type { Block } from '../../shared/types';

/** One hit of «Ebenen durchsuchen»: a block, or an element in one, with where it sits. */
export interface LayerHit {
  block: string;
  el?: string;
  /** The way there: block, then the containers around it. */
  path: string[];
  label: string;
  text: string;
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * Blocks and elements whose name, kind, text, «Sprungmarke» or the containers
 * around them contain every word typed – in page order, at most `max`. The labels come from the caller
 * (translated in the editor).
 */
export function searchLayers(blocks: Block[], query: string, names: { block: (b: Block) => string; el: (el: El) => string }, max = 50): LayerHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (...parts: (string | undefined)[]) => {
    const hay = fold(parts.filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  };
  const out: LayerHit[] = [];
  blocks.forEach((b, i) => {
    const label = `${i + 1}. ${names.block(b)}`;
    // A free layout's words are its elements' – found on them, not on the block.
    const text = b.type === 'layout' ? '' : (BLOCK_MAP[b.type]?.text?.(b.props) ?? '');
    if (hit(label, text, b.type, b.style?.anchor)) out.push({ block: b.id, path: [], label, text });
    if (b.type !== 'layout') return;
    const visit = (els: El[], path: string[]) => {
      for (const el of els) {
        // Its own words only: what its children say is found on them.
        const own = elementsText([{ ...el, children: undefined }]).trim();
        const name = names.el(el);
        // The way there counts too: «kontaktbox knopf» finds the button in the Kontaktbox.
        if (hit(name, own, el.kind, el.name, cleanAnchor(el.anchor), ...path)) out.push({ block: b.id, el: el.id, path, label: name, text: own });
        if (el.children) visit(el.children, [...path, name]);
      }
    };
    visit((b.props.els as El[] | undefined) ?? [], [label]);
  });
  return out.slice(0, max);
}
