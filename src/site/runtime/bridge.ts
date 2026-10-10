/**
 * Editor bridge – runs inside the canvas iframe (the real page rendered in
 * edit mode). It makes text editable in place, draws selection/hover, offers
 * insert points between blocks and lets blocks be dragged, while the parent
 * window (admin) owns the data and does all saving.
 */
import { normalizeLinkInput, sanitizeRichText } from '../../shared/richtext';
import { replay, setupMotion } from './motion';

type Msg = Record<string, any>;
const d = document;
const parentWin = window.parent;
const post = (m: Msg) => parentWin.postMessage({ nova: 1, ...m }, location.origin);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const spring = 'cubic-bezier(.34,1.56,.64,1)';

let studio = true;
let selected: string | null = null;
const main: HTMLElement = d.querySelector('main') as HTMLElement;

/* ---------- styles for outlines and editable fields (light DOM) ---------- */

const style = d.createElement('style');
style.textContent = `
[data-nova-block]{position:relative;transition:outline-color .12s}
[data-nova-block]:hover{outline:1px dashed rgba(43,89,195,.45);outline-offset:-1px}
[data-nova-block][data-nova-selected]{outline:2px solid #2b59c3;outline-offset:-2px}
[data-nova-block][data-nova-lock="all"]:hover{outline-color:rgba(138,134,126,.6)}
[data-nova-field]{cursor:text;border-radius:2px;outline:1px dashed transparent;outline-offset:3px;transition:outline-color .12s}
[data-nova-field]:hover{outline-color:color-mix(in srgb,currentColor 35%,transparent)}
[data-nova-field]:focus{outline:1.5px solid #2b59c3;outline-offset:3px}
[data-nova-field]:empty::before{content:attr(data-placeholder);opacity:.4;pointer-events:none;white-space:nowrap}
[data-nova-global]{cursor:pointer}
[data-nova-global]:hover{outline:1px dashed rgba(43,89,195,.45);outline-offset:-1px}
.nova-section-ref{position:relative}
.nova-section-ref::after{content:"Wiederverwendbare Sektion – Doppelklick zum Bearbeiten";position:absolute;top:8px;right:8px;font:600 11px/1 system-ui,sans-serif;background:#1b1a17;color:#fff;padding:5px 8px;border-radius:5px;opacity:0;transition:opacity .15s;pointer-events:none}
[data-nova-block]:hover .nova-section-ref::after{opacity:1}
.nova-cmt{all:initial;position:absolute;top:10px;right:10px;z-index:5;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px 0 7px;border-radius:13px 13px 13px 3px;background:#f2b84b;color:#1b1a17;font:650 12px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.22)}
.nova-cmt:hover{background:#f5c66a}
.nova-cmt svg{width:14px;height:14px}
.nova-peer{position:absolute;inset:0;z-index:4;pointer-events:none;outline:2px solid var(--peer);outline-offset:-2px}
.nova-peer span{position:absolute;top:-1px;left:-1px;padding:3px 7px 4px;background:var(--peer);color:#fff;font:600 11px/1 system-ui,sans-serif;border-radius:0 0 6px 0;white-space:nowrap}
.nova-dragging{z-index:50;box-shadow:0 24px 64px -16px rgba(0,0,0,.35);transition:none!important;cursor:grabbing}
.nova-shift{transition:transform .18s cubic-bezier(.2,.7,.2,1)}
a[href]{cursor:default}
[data-nova-el]{transition:outline-color .12s}
[data-nova-el-hover]{outline:1px dashed rgba(43,89,195,.7)!important;outline-offset:-1px}
[data-nova-el-selected]{outline:2px solid #2b59c3!important;outline-offset:-1px}
[data-nova-el-drag]{opacity:.35}
`;
d.head.append(style);

/* ---------- chrome in a shadow root, isolated from theme CSS ---------- */

const host = d.createElement('nova-chrome');
host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483000';
d.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box;font-family:'Schibsted Grotesk Variable',ui-sans-serif,system-ui,sans-serif}
.ins{position:absolute;left:0;height:0;display:none;align-items:center;justify-content:center;pointer-events:none}
.ins.on{display:flex}
.ins::before{content:"";position:absolute;left:24px;right:24px;top:-1px;height:2px;background:#2b59c3;border-radius:2px;opacity:.9}
.ins button{pointer-events:auto;position:relative;width:28px;height:28px;margin-top:-14px;border-radius:50%;border:0;background:#2b59c3;color:#fff;font-size:18px;line-height:28px;cursor:pointer;box-shadow:0 4px 12px rgba(43,89,195,.35);transform:translateY(14px)}
.ins button:hover{transform:translateY(14px) scale(1.08)}
.grip{position:absolute;display:none;width:28px;height:28px;border-radius:7px;background:#1b1a17;color:#fff;cursor:grab;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.25);touch-action:none}
.grip.on{display:flex}
.grip svg{width:16px;height:16px}
.egrip{position:absolute;display:none;width:22px;height:22px;border-radius:6px;background:#2b59c3;color:#fff;cursor:grab;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(43,89,195,.4);touch-action:none}
.egrip.on{display:flex}
.egrip svg{width:14px;height:14px}
.edrop{position:absolute;display:none;background:#2b59c3;border-radius:2px;pointer-events:none;box-shadow:0 0 0 2px rgba(255,255,255,.8)}
.edrop.on{display:block}
.edrop-box{position:absolute;display:none;border:2px dashed rgba(43,89,195,.7);border-radius:4px;pointer-events:none}
.edrop-box.on{display:block}
.rich{position:absolute;display:none;gap:1px;padding:3px;background:#1b1a17;border-radius:8px;box-shadow:0 12px 32px -8px rgba(0,0,0,.4)}
.rich.on{display:flex}
.rich button{min-width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:#fff;font:600 12px/1 inherit;cursor:pointer;padding:0 6px}
.rich button:hover{background:rgba(255,255,255,.14)}
.rich .lnk{display:none;align-items:center;gap:4px}
.rich.linking .fmt{display:none}
.rich.linking .lnk{display:flex}
.lnk input{width:240px;height:28px;border:0;border-radius:5px;padding:0 8px;background:rgba(255,255,255,.12);color:#fff;font:500 12px/1 inherit;outline:none}
.lnk input::placeholder{color:rgba(255,255,255,.55)}
.lnk input:focus{box-shadow:0 0 0 2px #6d8fe0}
.lnk .ok{background:#2b59c3}
.lnk .ok:hover{background:#3a68d4}
[data-tip]{position:relative}
[data-tip]:hover::after,[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);white-space:nowrap;padding:5px 8px;border-radius:6px;background:#1b1a17;color:#fff;font:500 11px/1.2 inherit;box-shadow:0 6px 18px rgba(0,0,0,.3);pointer-events:none;z-index:2}
</style>
<div class="ins" part="ins"><button type="button" aria-label="Block einfügen">+</button></div>
<div class="grip" data-tip="Ziehen zum Verschieben" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></svg></div>
<div class="egrip" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></svg></div>
<div class="edrop"></div><div class="edrop-box"></div>
<div class="rich" role="toolbar" aria-label="Formatierung">
<span class="fmt" style="display:contents"><button data-c="bold" data-tip="Fett" aria-label="Fett"><b>F</b></button><button data-c="italic" data-tip="Kursiv" aria-label="Kursiv"><i>K</i></button><button data-c="h2" data-tip="Zwischentitel" aria-label="Zwischentitel">H2</button><button data-c="h3" data-tip="Kleiner Zwischentitel" aria-label="Kleiner Zwischentitel">H3</button><button data-c="p" data-tip="Absatz" aria-label="Absatz">¶</button><button data-c="ul" data-tip="Aufzählung" aria-label="Aufzählung">•</button><button data-c="quote" data-tip="Zitat" aria-label="Zitat">“</button><button data-c="link" data-tip="Link setzen" aria-label="Link setzen">Link</button></span>
<span class="lnk"><input type="text" inputmode="url" placeholder="/kontakt oder https://…" aria-label="Link-Adresse"><button data-l="ok" class="ok">OK</button><button data-l="rm" data-tip="Link entfernen" aria-label="Link entfernen">✕</button></span>
</div>`;
const ins = shadow.querySelector('.ins') as HTMLElement;
const grip = shadow.querySelector('.grip') as HTMLElement;
const rich = shadow.querySelector('.rich') as HTMLElement;
const egrip = shadow.querySelector('.egrip') as HTMLElement;
const edrop = shadow.querySelector('.edrop') as HTMLElement;
const edropBox = shadow.querySelector('.edrop-box') as HTMLElement;

const blocks = () => [...main.querySelectorAll<HTMLElement>(':scope > [data-nova-block]')];
const blockEl = (id: string) => main.querySelector<HTMLElement>(`:scope > [data-nova-block="${CSS.escape(id)}"]`);
const rectOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};
const lockOf = (el: HTMLElement) => (studio ? el.dataset.novaLock ?? 'none' : 'none');

/* ---------- editable fields ---------- */

function setupFields(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-nova-field]').forEach((el) => {
    const block = el.closest<HTMLElement>('[data-nova-block]');
    if (!block || el.closest('.nova-section-ref')) return;
    if (lockOf(block) === 'all') return;
    const kind = el.dataset.novaKind;
    el.contentEditable = kind === 'rich' ? 'true' : 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only' && kind !== 'rich') el.contentEditable = 'true';
    el.spellcheck = true;
    el.dataset.placeholder = kind === 'rich' ? 'Text schreiben …' : 'Hier tippen …';
    el.setAttribute('role', 'textbox');
    if (kind !== 'plain') el.setAttribute('aria-multiline', 'true');
  });
}

let editTimer = 0;
d.addEventListener('input', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nova-field]');
  if (!el) return;
  const block = el.closest<HTMLElement>('[data-nova-block]');
  if (!block) return;
  clearTimeout(editTimer);
  editTimer = window.setTimeout(() => {
    const kind = el.dataset.novaKind;
    const value = kind === 'rich' ? sanitizeRichText(el.innerHTML) : kind === 'multi' ? el.innerText.replace(/\n{3,}/g, '\n\n').trim() : el.innerText.replace(/\s+/g, ' ').trim();
    post({ t: 'edit', id: block.dataset.novaBlock, path: el.dataset.novaField, value });
  }, 120);
});

// Single-line fields: Enter leaves the field instead of inserting a line break.
d.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const field = t.closest?.<HTMLElement>('[data-nova-field]');
  if (field && e.key === 'Enter' && field.dataset.novaKind === 'plain') {
    e.preventDefault();
    field.blur();
  }
  const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    post({ t: 'key', key: e.shiftKey ? 'redo' : 'undo' });
  } else if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    post({ t: 'key', key: 'palette' });
  } else if (mod && e.key === '.') {
    e.preventDefault();
    post({ t: 'key', key: 'mode' });
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    post({ t: 'key', key: 'save' });
  } else if (e.key === 'Escape') {
    if (field) field.blur();
    else if (selectedEl) {
      const parent = elEl(selectedEl)?.parentElement?.closest<HTMLElement>('[data-nova-el]');
      selectEl(parent?.dataset.novaEl ?? null, true);
    } else select(null, true);
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !field && selected && !(t instanceof HTMLInputElement)) {
    post({ t: 'key', key: 'delete' });
  }
});

// Paste plain text into fields – keeps Word/Docs formatting out.
d.addEventListener('paste', (e) => {
  const field = (e.target as HTMLElement).closest?.<HTMLElement>('[data-nova-field]');
  if (!field) return;
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') ?? '';
  d.execCommand('insertText', false, field.dataset.novaKind === 'plain' ? text.replace(/\s+/g, ' ') : text);
});

/* ---------- selection & hover ---------- */

/* ---------- elements of the free layout ---------- */

let selectedEl: string | null = null;
const elEl = (id: string) => main.querySelector<HTMLElement>(`[data-nova-el="${CSS.escape(id)}"]`);

function selectEl(id: string | null, notify: boolean) {
  if (selectedEl) elEl(selectedEl)?.removeAttribute('data-nova-el-selected');
  selectedEl = id;
  const el = id ? elEl(id) : null;
  el?.setAttribute('data-nova-el-selected', '');
  placeEgrip();
  if (!notify) return;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (el && block) {
    if (selected !== block.dataset.novaBlock) select(block.dataset.novaBlock!, false);
    post({ t: 'select-el', block: block.dataset.novaBlock, el: id, rect: rectOf(el), blockRect: rectOf(block) });
  } else post({ t: 'select-el', block: selected, el: null });
}

function placeEgrip() {
  const el = selectedEl ? elEl(selectedEl) : null;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  // Locked blocks keep their layout in the Studio.
  if (!el || !block || lockOf(block) !== 'none') return egrip.classList.remove('on');
  const r = el.getBoundingClientRect();
  // Beside the element when there is room, so it never covers the first letters.
  egrip.style.top = `${r.top + scrollY + 2}px`;
  egrip.style.left = `${r.left > 30 ? r.left - 26 : r.left + 4}px`;
  egrip.classList.add('on');
}

let hoverEl: HTMLElement | null = null;
d.addEventListener(
  'pointermove',
  (e) => {
    if (elDrag) return;
    const el = (e.target as HTMLElement).closest?.<HTMLElement>('[data-nova-el]') ?? null;
    if (el === hoverEl) return;
    hoverEl?.removeAttribute('data-nova-el-hover');
    hoverEl = el;
    if (el && el.dataset.novaEl !== selectedEl) el.setAttribute('data-nova-el-hover', '');
  },
  { passive: true },
);

/* Drag an element into another place – also into other containers of the same block. */
let elDrag: { el: HTMLElement; block: HTMLElement; target: { parent: string | null; index: number } | null } | null = null;

function dropTarget(x: number, y: number): { parent: string | null; index: number; line: DOMRect; container: HTMLElement } | null {
  if (!elDrag) return null;
  const { el, block } = elDrag;
  const under = d.elementsFromPoint(x, y).find((n) => block.contains(n) && !el.contains(n)) as HTMLElement | undefined;
  if (!under) return null;
  // The innermost container under the pointer, or the layout itself.
  const box = under.closest<HTMLElement>('[data-nova-kind-el="box"]');
  const container = box && block.contains(box) && !el.contains(box) ? box : block.querySelector<HTMLElement>('.lay');
  if (!container) return null;
  const kids = [...container.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-nova-el') && c !== el);
  const cs = getComputedStyle(container);
  const rowish = (cs.display.includes('flex') && cs.flexDirection.startsWith('row')) || cs.display.includes('grid');
  let index = kids.length;
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    const before = rowish ? (y < r.top ? true : y > r.bottom ? false : x < r.left + r.width / 2) : y < r.top + r.height / 2;
    if (before) {
      index = i;
      break;
    }
  }
  // Index among all children, the dragged one included (the editor removes it first).
  const all = [...container.children].filter((c) => c instanceof HTMLElement && c.hasAttribute('data-nova-el'));
  const ref = kids[index] ?? null;
  const realIndex = ref ? all.indexOf(ref) : all.length;
  const cr = container.getBoundingClientRect();
  let line: DOMRect;
  if (ref) {
    const r = ref.getBoundingClientRect();
    line = rowish && !cs.display.includes('grid') ? new DOMRect(r.left - 3, r.top, 3, r.height) : new DOMRect(r.left, r.top - 3, r.width, 3);
  } else if (kids.length) {
    const r = kids[kids.length - 1].getBoundingClientRect();
    line = rowish && !cs.display.includes('grid') ? new DOMRect(r.right + 1, r.top, 3, r.height) : new DOMRect(r.left, r.bottom + 1, r.width, 3);
  } else line = new DOMRect(cr.left + 8, cr.top + cr.height / 2, cr.width - 16, 3);
  return { parent: container.dataset.novaEl ?? null, index: realIndex, line, container };
}

egrip.addEventListener('pointerdown', (e) => {
  const el = selectedEl ? elEl(selectedEl) : null;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (!el || !block) return;
  e.preventDefault();
  egrip.setPointerCapture(e.pointerId);
  elDrag = { el, block, target: null };
  el.setAttribute('data-nova-el-drag', '');
});
egrip.addEventListener('pointermove', (e) => {
  if (!elDrag) return;
  const t = dropTarget(e.clientX, e.clientY);
  elDrag.target = t ? { parent: t.parent, index: t.index } : null;
  if (t) {
    Object.assign(edrop.style, { top: `${t.line.top + scrollY}px`, left: `${t.line.left}px`, width: `${t.line.width}px`, height: `${t.line.height}px` });
    const cr = t.container.getBoundingClientRect();
    Object.assign(edropBox.style, { top: `${cr.top + scrollY}px`, left: `${cr.left}px`, width: `${cr.width}px`, height: `${cr.height}px` });
  }
  edrop.classList.toggle('on', Boolean(t));
  edropBox.classList.toggle('on', Boolean(t));
  egrip.style.top = `${e.clientY + scrollY - 11}px`;
  egrip.style.left = `${e.clientX - 11}px`;
  if (e.clientY < 60) scrollBy(0, -10);
  else if (e.clientY > innerHeight - 60) scrollBy(0, 10);
});
function endElDrag() {
  if (!elDrag) return;
  const { el, block, target } = elDrag;
  el.removeAttribute('data-nova-el-drag');
  edrop.classList.remove('on');
  edropBox.classList.remove('on');
  elDrag = null;
  if (target) post({ t: 'el-move', block: block.dataset.novaBlock, el: el.dataset.novaEl, parent: target.parent, index: target.index });
  placeEgrip();
}
egrip.addEventListener('pointerup', endElDrag);
egrip.addEventListener('pointercancel', endElDrag);

function select(id: string | null, notify: boolean) {
  if (selected) blockEl(selected)?.removeAttribute('data-nova-selected');
  // An element stays selected only while its block is.
  if (selectedEl && elEl(selectedEl)?.closest<HTMLElement>('[data-nova-block]')?.dataset.novaBlock !== id) {
    elEl(selectedEl)?.removeAttribute('data-nova-el-selected');
    selectedEl = null;
    placeEgrip();
  }
  selected = id;
  const el = id ? blockEl(id) : null;
  if (el) el.setAttribute('data-nova-selected', '');
  if (notify) post(el ? { t: 'select', id, rect: rectOf(el), lock: el.dataset.novaLock ?? 'none', type: el.dataset.novaType } : { t: 'deselect' });
}

d.addEventListener(
  'click',
  (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a[href]') || t.closest('button') || t.closest('form')) {
      // Nothing navigates or submits in the editor.
      if (!t.closest('[data-nova-field]')) e.preventDefault();
    }
    const global = t.closest<HTMLElement>('[data-nova-global]');
    if (global) {
      e.preventDefault();
      select(null, true);
      return post({ t: 'global', which: global.dataset.novaGlobal });
    }
    const block = t.closest<HTMLElement>('[data-nova-block]');
    const el = t.closest<HTMLElement>('[data-nova-el]');
    if (el && block?.contains(el)) {
      select(block.dataset.novaBlock!, false);
      return selectEl(el.dataset.novaEl!, true);
    }
    if (selectedEl) selectEl(null, false);
    if (block) {
      if (t.closest('summary')) e.preventDefault();
      select(block.dataset.novaBlock!, true);
    } else select(null, true);
  },
  true,
);

d.addEventListener('dblclick', (e) => {
  const ref = (e.target as HTMLElement).closest<HTMLElement>('[data-nova-section]');
  if (ref) post({ t: 'section', id: ref.dataset.novaSection });
});

d.addEventListener('submit', (e) => e.preventDefault(), true);

/* ---------- insert points & grip ---------- */

let hoverBlock: HTMLElement | null = null;
let insertIndex = -1;

function positionChrome(clientX: number, clientY: number) {
  if (dragging) return;
  const list = blocks();
  // Insert line: nearest block boundary within 22px.
  let best: { y: number; index: number } | null = null;
  list.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    for (const [y, index] of [
      [r.top, i],
      [r.bottom, i + 1],
    ] as [number, number][]) {
      const dist = Math.abs(clientY - y);
      if (dist < 22 && (!best || dist < Math.abs(clientY - best.y))) best = { y, index };
    }
  });
  if (!list.length) {
    const r = main.getBoundingClientRect();
    best = { y: r.top + 40, index: 0 };
  }
  if (best) {
    const b = best as { y: number; index: number };
    insertIndex = b.index;
    ins.style.top = `${b.y + scrollY}px`;
    ins.style.width = `${d.documentElement.clientWidth}px`;
    ins.classList.add('on');
  } else ins.classList.remove('on');

  const block = (d.elementFromPoint(clientX, clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-nova-block]') ?? null;
  hoverBlock = block;
  if (block && lockOf(block) === 'none') {
    const r = block.getBoundingClientRect();
    grip.style.top = `${r.top + scrollY + 10}px`;
    grip.style.left = `${r.left + 10}px`;
    grip.classList.add('on');
  } else grip.classList.remove('on');
}

d.addEventListener('pointermove', (e) => positionChrome(e.clientX, e.clientY), { passive: true });
d.addEventListener('pointerleave', () => {
  if (!dragging) {
    ins.classList.remove('on');
    grip.classList.remove('on');
  }
});

ins.querySelector('button')!.addEventListener('click', (e) => {
  e.stopPropagation();
  const r = (ins.querySelector('button') as HTMLElement).getBoundingClientRect();
  post({ t: 'insert-at', index: insertIndex, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
});

/* ---------- drag to reorder: neighbours move out of the way ---------- */

let dragging: { el: HTMLElement; startY: number; from: number; to: number; height: number; list: HTMLElement[]; mids: number[] } | null = null;

grip.addEventListener('pointerdown', (e) => {
  if (!hoverBlock) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  const list = blocks();
  const from = list.indexOf(hoverBlock);
  const height = hoverBlock.getBoundingClientRect().height;
  dragging = { el: hoverBlock, startY: e.clientY, from, to: from, height, list, mids: list.map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; }) };
  hoverBlock.classList.add('nova-dragging');
  list.forEach((b) => b !== hoverBlock && b.classList.add('nova-shift'));
  select(hoverBlock.dataset.novaBlock!, true);
  ins.classList.remove('on');
});

grip.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dy = e.clientY - dragging.startY;
  const { el, list, mids, from, height } = dragging;
  el.style.transform = `translateY(${dy}px)`;
  const center = mids[from] + dy;
  let to = from;
  for (let i = 0; i < list.length; i++) {
    if (i < from && center < mids[i]) {
      to = i;
      break;
    }
    if (i > from && center > mids[i]) to = i;
  }
  dragging.to = to;
  list.forEach((b, i) => {
    if (b === el) return;
    let shift = 0;
    if (from < to && i > from && i <= to) shift = -height;
    if (from > to && i >= to && i < from) shift = height;
    b.style.transform = shift ? `translateY(${shift}px)` : '';
  });
  // Auto-scroll near the edges.
  if (e.clientY < 60) scrollBy(0, -12);
  else if (e.clientY > innerHeight - 60) scrollBy(0, 12);
});

function endDrag() {
  if (!dragging) return;
  const { el, list, from, to } = dragging;
  list.forEach((b) => {
    b.style.transform = '';
    b.classList.remove('nova-shift');
  });
  el.classList.remove('nova-dragging');
  el.style.transform = '';
  if (to !== from) {
    const target = list[to];
    if (to > from) target.after(el);
    else target.before(el);
    post({ t: 'moved', id: el.dataset.novaBlock, to });
  }
  dragging = null;
  sendRect();
}
grip.addEventListener('pointerup', endDrag);
grip.addEventListener('pointercancel', endDrag);

/* ---------- rich text toolbar ---------- */

d.addEventListener('selectionchange', () => {
  if (rich.classList.contains('linking')) return; // typing the address moves the selection away on purpose
  const sel = d.getSelection();
  const node = sel?.anchorNode ? (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as HTMLElement) : sel.anchorNode.parentElement) : null;
  const field = node?.closest<HTMLElement>('[data-nova-kind="rich"]');
  if (!field || !sel || sel.isCollapsed) return rich.classList.remove('on');
  const r = sel.getRangeAt(0).getBoundingClientRect();
  rich.style.top = `${Math.max(scrollY + 4, r.top + scrollY - 44)}px`;
  rich.style.left = `${Math.max(8, r.left + r.width / 2 - 150)}px`;
  rich.classList.add('on');
});

// Own link field instead of the browser's prompt(): the toolbar turns into an address input.
const linkInput = rich.querySelector('.lnk input') as HTMLInputElement;
let savedRange: Range | null = null;
const fieldOf = (r: Range | null) => {
  const n = r?.commonAncestorContainer;
  const el = n ? (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement) : null;
  return el?.closest<HTMLElement>('[data-nova-field]') ?? null;
};
const changed = (r: Range | null) => fieldOf(r)?.dispatchEvent(new Event('input', { bubbles: true }));
function restoreSelection() {
  const sel = d.getSelection();
  if (!sel || !savedRange) return;
  sel.removeAllRanges();
  sel.addRange(savedRange);
}
function openLink() {
  const sel = d.getSelection();
  if (!sel?.rangeCount) return;
  savedRange = sel.getRangeAt(0).cloneRange();
  const start = savedRange.startContainer;
  const a = (start.nodeType === 1 ? (start as HTMLElement) : start.parentElement)?.closest('a');
  linkInput.value = a?.getAttribute('href') ?? '';
  rich.classList.add('linking');
  linkInput.focus();
  linkInput.select();
}
function closeLink(apply: 'set' | 'remove' | null) {
  const range = savedRange;
  rich.classList.remove('linking');
  restoreSelection();
  if (apply === 'remove') d.execCommand('unlink');
  else if (apply === 'set') {
    const url = normalizeLinkInput(linkInput.value);
    if (url) d.execCommand('createLink', false, url);
    else d.execCommand('unlink');
  }
  if (apply) changed(range);
  savedRange = null;
}
// Clicking somewhere else in the page leaves the link field without changes.
linkInput.addEventListener('blur', () => {
  if (!rich.classList.contains('linking')) return;
  rich.classList.remove('linking', 'on');
  savedRange = null;
});
linkInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    closeLink('set');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeLink(null);
  }
});

rich.addEventListener('mousedown', (e) => {
  if (e.target !== linkInput) e.preventDefault();
});
rich.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.l) return closeLink(b.dataset.l === 'ok' ? 'set' : 'remove');
  const c = b.dataset.c;
  if (!c) return;
  const map: Record<string, [string, string?]> = {
    bold: ['bold'],
    italic: ['italic'],
    h2: ['formatBlock', 'h2'],
    h3: ['formatBlock', 'h3'],
    p: ['formatBlock', 'p'],
    ul: ['insertUnorderedList'],
    quote: ['formatBlock', 'blockquote'],
  };
  if (c === 'link') return openLink();
  d.execCommand(map[c][0], false, map[c][1]);
  d.getSelection()?.anchorNode?.parentElement?.closest('[data-nova-field]')?.dispatchEvent(new Event('input', { bubbles: true }));
});

/* ---------- geometry to the parent ---------- */

let raf = 0;
function sendRect() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const el = selected ? blockEl(selected) : null;
    if (el) post({ t: 'rect', id: selected, rect: rectOf(el) });
    const sub = selectedEl ? elEl(selectedEl) : null;
    if (sub) post({ t: 'el-rect', el: selectedEl, rect: rectOf(sub) });
    placeEgrip();
  });
}
addEventListener('scroll', sendRect, { passive: true });
addEventListener('resize', sendRect);
new ResizeObserver(sendRect).observe(d.body);

/* ---------- commands from the parent ---------- */

function animateIn(el: HTMLElement) {
  if (reduced) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
  const h = el.getBoundingClientRect().height;
  el.animate(
    [
      { opacity: 0, transform: 'translateY(12px) scale(.985)', clipPath: 'inset(0 0 100% 0)', marginBottom: `${-h}px` },
      { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)', marginBottom: '0px' },
    ],
    { duration: 260, easing: spring },
  );
}

function flash(el: HTMLElement) {
  el.animate([{ backgroundColor: 'rgba(43,89,195,.10)' }, { backgroundColor: 'transparent' }], { duration: reduced ? 100 : 500, easing: 'ease-out' });
}

function htmlToElement(html: string): HTMLElement {
  const t = d.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/* ---------- presence: blocks others are on ---------- */

let peers: { name: string; color: string; block: string | null }[] = [];
function paintPeers() {
  d.querySelectorAll('.nova-peer').forEach((x) => x.remove());
  const byBlock = new Map<string, { name: string; color: string }[]>();
  for (const p of peers) if (p.block) byBlock.set(p.block, [...(byBlock.get(p.block) ?? []), p]);
  for (const [id, list] of byBlock) {
    const el = blockEl(id);
    if (!el) continue;
    const box = d.createElement('div');
    box.className = 'nova-peer';
    box.style.setProperty('--peer', list[0].color);
    const tag = d.createElement('span');
    tag.textContent = list.map((p) => p.name.split(' ')[0]).join(', ');
    box.append(tag);
    el.append(box);
  }
}

/* ---------- comment bubbles: open threads per block ---------- */

let commentCounts: Record<string, number> = {};
let commentLabel = 'Kommentare';
function paintComments() {
  d.querySelectorAll('.nova-cmt').forEach((b) => b.remove());
  for (const [id, n] of Object.entries(commentCounts)) {
    const el = blockEl(id);
    if (!el || !n) continue;
    const b = d.createElement('button');
    b.className = 'nova-cmt';
    b.type = 'button';
    b.setAttribute('aria-label', `${commentLabel}: ${n}`);
    b.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4.5h12v8.5H9l-3.5 3v-3H4z"/></svg>${n}`;
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      post({ t: 'comments-open', id });
    });
    el.append(b);
  }
}

addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data?.nova) return;
  const m = e.data as Msg;
  switch (m.t) {
    case 'init':
      studio = m.studio;
      blocks().forEach((b) => b.querySelectorAll<HTMLElement>('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable')));
      setupFields(main);
      break;
    case 'select': {
      select(m.id, false);
      const el = m.id ? blockEl(m.id) : null;
      if (el && m.scroll) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      sendRect();
      break;
    }
    case 'replace': {
      const old = blockEl(m.id);
      const next = htmlToElement(m.html);
      if (!old || !next) break;
      if (old.classList.contains('nova-hover')) next.classList.add('nova-hover');
      old.replaceWith(next);
      if (selectedEl) elEl(selectedEl)?.setAttribute('data-nova-el-selected', '');
      setupFields(next);
      setupMotion(next.parentElement ?? main, true);
      if (selected === m.id) next.setAttribute('data-nova-selected', '');
      paintComments();
      paintPeers();
      sendRect();
      break;
    }
    case 'insert': {
      const next = htmlToElement(m.html);
      const list = blocks();
      if (m.index >= list.length) {
        const last = list[list.length - 1];
        if (last) last.after(next);
        else main.append(next);
      } else list[m.index].before(next);
      main.querySelector(':scope > .wrap > .nova-empty')?.parentElement?.remove();
      setupFields(next);
      setupMotion(main, true);
      select(m.id, true);
      next.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      animateIn(next);
      break;
    }
    case 'remove': {
      const el = blockEl(m.id);
      if (!el) break;
      if (selected === m.id) select(null, false);
      if (reduced) el.remove();
      else {
        const h = el.getBoundingClientRect().height;
        el.animate([{ opacity: 1, height: `${h}px` }, { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: 200, easing: 'ease-in' }).onfinish = () => el.remove();
      }
      break;
    }
    case 'move': {
      const el = blockEl(m.id);
      const list = blocks();
      if (!el) break;
      const others = new Map(list.map((b) => [b, b.getBoundingClientRect().top]));
      const without = list.filter((b) => b !== el);
      if (m.to >= without.length) without[without.length - 1].after(el);
      else without[m.to].before(el);
      if (!reduced) {
        // FLIP: everything glides to its new place.
        for (const [b, top] of others) {
          const delta = top - b.getBoundingClientRect().top;
          if (delta) b.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      }
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      sendRect();
      break;
    }
    case 'main': {
      const doc = new DOMParser().parseFromString(m.html, 'text/html');
      const nextMain = doc.querySelector('main');
      if (!nextMain) break;
      const y = scrollY;
      main.innerHTML = nextMain.innerHTML;
      // Header and footer may have changed too (navigation, name).
      const hdr = doc.querySelector('[data-nova-global="header"]');
      const ftr = doc.querySelector('[data-nova-global="footer"]');
      if (hdr) d.querySelector('[data-nova-global="header"]')?.replaceWith(hdr);
      if (ftr) d.querySelector('[data-nova-global="footer"]')?.replaceWith(ftr);
      setupFields(main);
      setupMotion(main, true);
      scrollTo(0, y);
      for (const id of (m.changed as string[]) ?? []) {
        const el = blockEl(id);
        if (el) {
          // «Rückgängig spult sichtbar zurück»: changed blocks rewind briefly.
          if (!reduced) el.animate([{ transform: 'translateX(-6px)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' });
          flash(el);
        }
      }
      if (selected && blockEl(selected)) blockEl(selected)!.setAttribute('data-nova-selected', '');
      if (selectedEl) elEl(selectedEl)?.setAttribute('data-nova-el-selected', '');
      else select(null, true);
      paintComments();
      paintPeers();
      sendRect();
      break;
    }
    case 'focus-field': {
      const el = blockEl(m.id);
      const field = el?.querySelector<HTMLElement>(m.field ? `[data-nova-field="${CSS.escape(m.field)}"]` : '[data-nova-field]');
      el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      if (field) {
        setTimeout(() => {
          field.focus();
          const r = d.createRange();
          r.selectNodeContents(field);
          r.collapse(false);
          d.getSelection()?.removeAllRanges();
          d.getSelection()?.addRange(r);
        }, reduced ? 0 : 300);
      }
      if (el) flash(el);
      break;
    }
    case 'patch-fields': {
      // Offline: no fresh HTML from the server, so put the texts of the local copy into the fields.
      for (const b of (m.blocks as { id: string; props: Record<string, unknown> }[]) ?? []) {
        const el = blockEl(b.id);
        if (!el) continue;
        el.querySelectorAll<HTMLElement>('[data-nova-field]').forEach((f) => {
          if (f === d.activeElement) return;
          let v: unknown = b.props;
          for (const part of (f.dataset.novaField ?? '').split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[part] : undefined;
          if (typeof v !== 'string') return;
          const kind = f.dataset.novaKind;
          if (kind === 'rich') {
            const html = sanitizeRichText(v);
            if (f.innerHTML !== html) f.innerHTML = html;
          } else if (kind === 'multi') {
            if (f.innerText === v) return;
            f.replaceChildren(...v.split('\n').flatMap((line, i) => (i ? [d.createElement('br'), d.createTextNode(line)] : [d.createTextNode(line)])));
          } else if (f.textContent !== v) f.textContent = v;
        });
      }
      break;
    }
    case 'presence': {
      peers = (m.peers as typeof peers) ?? [];
      paintPeers();
      break;
    }
    case 'comments': {
      commentCounts = (m.counts as Record<string, number>) ?? {};
      if (typeof m.label === 'string') commentLabel = m.label;
      paintComments();
      break;
    }
    case 'flash': {
      const el = blockEl(m.id);
      if (el) flash(el);
      break;
    }
    case 'design': {
      // Design changes show at once; the server's HTML for the block follows a moment later.
      const tag = d.querySelector<HTMLStyleElement>(`style[data-nova-design="${CSS.escape(m.id)}"]`);
      if (tag && tag.textContent !== m.css) tag.textContent = m.css;
      sendRect();
      break;
    }
    case 'select-el': {
      if (m.block && selected !== m.block) select(m.block, false);
      selectEl(m.el ?? null, false);
      const el = m.el ? elEl(m.el) : null;
      if (el && m.scroll) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      sendRect();
      break;
    }
    case 'motion-play-el': {
      const el = m.el ? elEl(m.el) : null;
      if (el) replay(el);
      break;
    }
    case 'motion-play': {
      const el = blockEl(m.id);
      if (el) replay(el);
      break;
    }
    case 'hover-state': {
      // While hover is being designed, the selected block shows its hover look without the mouse.
      d.querySelectorAll('.nova-hover').forEach((x) => x.classList.remove('nova-hover'));
      const el = m.id ? blockEl(m.id) : null;
      el?.classList.add('nova-hover');
      break;
    }
  }
});

setupMotion(main, true);
post({ t: 'ready', blocks: blocks().map((b) => b.dataset.novaBlock) });
