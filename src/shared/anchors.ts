import { BLOCK_MAP } from './blocks';
import { blockDomId } from './design';
import { cleanAnchor, EL_DEFS, headlineText, walkEls, type El } from './elements';
import type { Block } from './types';

/** A place on a page that links can jump to: its «Sprungmarke», what it is, and whose it is (block or element id). */
export interface PageAnchor {
  anchor: string;
  label: string;
  owner: string;
}

const elLabel = (el: El): string =>
  el.name || (el.kind === 'heading' ? String(el.props.text ?? '') : el.kind === 'headline' ? headlineText(el.props) : '') || EL_DEFS[el.kind].label;

/** Every «Sprungmarke» of a page – of its blocks and of the elements in its free layouts – in page order. */
export function pageAnchors(blocks: Block[]): PageAnchor[] {
  const out: PageAnchor[] = [];
  for (const b of blocks) {
    const id = blockDomId(b);
    if (id !== `b-${b.id}`) out.push({ anchor: id, label: String(b.props.heading ?? '') || BLOCK_MAP[b.type]?.label || b.type, owner: b.id });
    if (b.type === 'layout' && Array.isArray(b.props.els))
      walkEls(b.props.els as El[], (el) => {
        const anchor = cleanAnchor(el.anchor);
        if (anchor) out.push({ anchor, label: elLabel(el).slice(0, 80), owner: el.id });
      });
  }
  return out;
}
