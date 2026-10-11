/**
 * Editor bridge – runs inside the canvas iframe (the real page rendered in
 * edit mode). It makes text editable in place, draws selection/hover, offers
 * insert points between blocks and lets blocks be dragged, while the parent
 * window (admin) owns the data and does all saving.
 */
import { normalizeLinkInput, sanitizeRichText } from '../../shared/richtext';
import { pageForLink } from '../../shared/paths';
import { replay, setupMotion } from './motion';
import { activeTab, reveal, setupWidgets, showTab } from './widgets';
import { shortcutAction } from '../../shared/shortcuts';
import { alignRects, snapLines, snapTo, type AlignHow, type Rect } from '../../shared/canvas';
import { composite, contrastRatio, fixColor, needFor, toHex, type ContrastIssue, type Rgba } from '../../shared/contrast';
import type { AuditIssue } from '../../shared/audit';

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
[data-nova-cond]{outline:1px dashed rgba(124,92,255,.7);outline-offset:2px}
[data-nova-cond=off]{opacity:.42}
[data-nova-global]{cursor:pointer}
[data-nova-global]:hover{outline:1px dashed rgba(43,89,195,.45);outline-offset:-1px}
.nova-still,.nova-still *{transition:none!important}
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
[data-nova-peek]{display:none!important}
[data-nova-pinned]{cursor:default}
[data-nova-hidden]{outline:2px dashed rgba(232,64,138,.55)!important;outline-offset:2px}
[data-nova-hidden]:not(img):not(hr)::before{content:"Versteckt, bis ein Knopf es zeigt";display:block;margin-bottom:.35rem;font:600 11px/1.3 system-ui,sans-serif;color:#c22f73}
[data-nova-el-hover]{outline:1px dashed rgba(43,89,195,.7)!important;outline-offset:-1px}
[data-nova-el-selected]{outline:2px solid #2b59c3!important;outline-offset:-1px}
[data-nova-el-multi]{outline:2px dashed #2b59c3!important;outline-offset:-1px}
[data-nova-el-drag]{opacity:.35}
[data-nova-sizing]{outline:1px dashed rgba(43,89,195,.8)!important;outline-offset:0}
[data-nova-ghost]{pointer-events:none}
.el-marquee:hover .mq-track,.el-marquee:has([data-nova-el-selected]) .mq-track,.el-marquee[data-nova-el-selected] .mq-track{animation-play-state:paused}
[data-nova-component]{position:relative}
.nova-blocks{display:contents}
.nova-tpl{position:relative;cursor:default}
.nova-tpl::before{content:"Seitenvorlage «" attr(data-nova-template) "» – Doppelklick zum Bearbeiten";position:absolute;top:8px;right:8px;z-index:6;padding:5px 8px;border-radius:5px;background:#7c4de0;color:#fff;font:600 11px/1 system-ui,sans-serif;opacity:0;transition:opacity .15s;pointer-events:none}
.nova-tpl::after{content:"";position:absolute;inset:0;pointer-events:none;outline:1px dashed transparent;outline-offset:-1px;transition:outline-color .15s}
.nova-tpl:hover:not(:has([data-nova-block]:hover))::after{outline-color:rgba(124,77,224,.7)}
.nova-tpl:hover:not(:has([data-nova-block]:hover))::before{opacity:1}
[data-nova-component][data-nova-el-hover]{outline-color:rgba(124,77,224,.75)!important}
[data-nova-component][data-nova-el-selected]{outline-color:#7c4de0!important}
[data-nova-component]::after{content:"◆ " attr(data-nova-component);position:absolute;top:-1px;left:-1px;z-index:3;padding:3px 7px 4px;border-radius:0 0 6px 0;background:#7c4de0;color:#fff;font:600 11px/1 system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .12s;pointer-events:none}
[data-nova-component]:is([data-nova-el-hover],[data-nova-el-selected])::after{opacity:1}
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
.eresize{position:absolute;display:none;width:12px;height:12px;border:2px solid #2b59c3;border-radius:3px;background:#fff;cursor:nwse-resize;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.eresize.on{display:block}
.guide{position:absolute;display:none;background:#e8408a;pointer-events:none}
.guide.on{display:block}
.gv{width:1px}.gh{height:1px}
/* measuring with Alt: distances from the selection to what is under the pointer */
.measure{position:absolute;top:0;left:0;display:none;pointer-events:none}
.measure.on{display:block}
.m-box{position:absolute;outline:1px solid #e8408a;outline-offset:-1px}
.m-line{position:absolute;background:#e8408a}
.m-line.h{height:1px}.m-line.v{width:1px}
.m-line.h::before,.m-line.h::after{content:"";position:absolute;top:-3px;width:1px;height:7px;background:#e8408a}.m-line.h::before{left:0}.m-line.h::after{right:0}
.m-line.v::before,.m-line.v::after{content:"";position:absolute;left:-3px;height:1px;width:7px;background:#e8408a}.m-line.v::before{top:0}.m-line.v::after{bottom:0}
.m-label{position:absolute;padding:2px 5px;border-radius:4px;background:#e8408a;color:#fff;font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-50%)}
/* layout grid: the site's content width and columns, over the page */
.grid{position:fixed;inset:0;display:none;pointer-events:none}
.grid.on{display:block}
.grid-in{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);width:min(100% - 2*var(--gutter,1.5rem),var(--max,72rem));display:grid;grid-template-columns:repeat(12,1fr);column-gap:1.25rem;box-shadow:-1px 0 0 rgba(232,64,138,.55),1px 0 0 rgba(232,64,138,.55)}
.grid-in span{background:rgba(232,64,138,.07)}
@media (max-width:64rem){.grid-in{grid-template-columns:repeat(8,1fr)}.grid-in span:nth-child(n+9){display:none}}
@media (max-width:40rem){.grid-in{grid-template-columns:repeat(4,1fr);column-gap:1rem}.grid-in span:nth-child(n+5){display:none}}
/* grids: drag the line between two columns */
.cz{position:absolute;display:none;width:14px;height:44px;margin-left:-7px;border:2px solid #fff;border-radius:7px;background:#7c4de0;box-shadow:0 2px 10px rgba(0,0,0,.3);cursor:col-resize;touch-action:none;z-index:2}
.cz.on{display:block}
.cz:hover,.cz.drag{background:#5f34c2}
/* sections: drag the bottom edge for the height, the content column's edges for its width */
.sz{position:absolute;display:none;align-items:center;justify-content:center;background:#2b59c3;border:2px solid #fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.3);touch-action:none;z-index:2}
.sz.on{display:flex}
.sz:hover,.sz.drag{background:#1f47a3}
.sz-h{width:48px;height:16px;cursor:ns-resize}
.sz-l,.sz-r{width:16px;height:48px;cursor:ew-resize}
.sz i{display:block;background:rgba(255,255,255,.9);border-radius:1px}
.sz-h i{width:18px;height:2px;box-shadow:0 4px 0 rgba(255,255,255,.9)}
.sz-h i{margin-top:-4px}
.sz-l i,.sz-r i{width:2px;height:18px;box-shadow:4px 0 0 rgba(255,255,255,.9);margin-left:-4px}
.pz{position:absolute;display:none;touch-action:none}
.pz.on{display:block}
.pz-t,.pz-b{cursor:ns-resize}.pz-l,.pz-r{cursor:ew-resize}
.pz:hover,.pz.drag{background:repeating-linear-gradient(45deg,rgba(43,89,195,.2) 0 4px,rgba(43,89,195,.06) 4px 8px)}
.pz::after{content:"";position:absolute;background:#2b59c3;border-radius:2px;opacity:.4;transition:opacity .12s}
.pz-t::after,.pz-b::after{left:50%;width:24px;height:3px;margin-left:-12px}
.pz-t::after{bottom:0}.pz-b::after{top:0}
.pz-l::after,.pz-r::after{top:50%;width:3px;height:24px;margin-top:-12px}
.pz-l::after{right:0}.pz-r::after{left:0}
.pz:hover::after,.pz.drag::after{opacity:1}
.epos{position:absolute;display:none;padding:3px 6px;border-radius:4px;background:#1b1a17;color:#fff;font:600 11px/1 system-ui,sans-serif;pointer-events:none;white-space:nowrap}
.epos.on{display:block}
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
.lnk-list{position:absolute;top:calc(100% + 6px);left:0;display:none;flex-direction:column;gap:1px;width:340px;padding:4px;background:#1b1a17;border-radius:8px;box-shadow:0 12px 32px -8px rgba(0,0,0,.4)}
.rich.linking .lnk-list.on{display:flex}
.rich .lnk-list button{display:flex;align-items:baseline;gap:8px;width:100%;height:auto;min-height:30px;padding:7px 8px;text-align:left;font:500 12px/1.3 inherit}
.lnk-list button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lnk-list .path{flex:none;font-family:ui-monospace,monospace;opacity:.65}
.rich .lnk-list button[aria-selected=true]{background:rgba(255,255,255,.14)}
.lnk-list .new{color:#a9bfff;font-weight:600}
.lnk-list button+.new{margin-top:3px;border-top:1px solid rgba(255,255,255,.12)}
.lnk-list[aria-busy=true]{opacity:.6;pointer-events:none}
.lnk .ok{background:#2b59c3}
.lnk .ok:hover{background:#3a68d4}
.entry{position:absolute;display:none;align-items:center;gap:5px;max-width:240px;height:26px;padding:0 10px 0 8px;border:0;border-radius:13px;background:#1b1a17;color:#fff;font:600 12px/1 inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);transform:translateX(-100%)}
.entry.on{display:inline-flex}
.entry:hover{background:#2b59c3}
.entry svg{flex:none;width:13px;height:13px}
.entry span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-tip]{position:relative}
[data-tip]:hover::after,[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);white-space:nowrap;padding:5px 8px;border-radius:6px;background:#1b1a17;color:#fff;font:500 11px/1.2 inherit;box-shadow:0 6px 18px rgba(0,0,0,.3);pointer-events:none;z-index:2}
</style>
<div class="ins" part="ins"><button type="button" aria-label="Block einfügen">+</button></div>
<div class="grip" data-tip="Ziehen zum Verschieben" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></svg></div>
<div class="egrip" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7.5" cy="5" r="1.3"/><circle cx="12.5" cy="5" r="1.3"/><circle cx="7.5" cy="10" r="1.3"/><circle cx="12.5" cy="10" r="1.3"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/></svg></div>
<div class="measure" aria-hidden="true"></div>
<div class="grid" aria-hidden="true"><div class="grid-in">${'<span></span>'.repeat(12)}</div></div>
<div class="cz" title="Spaltenbreite ziehen" aria-hidden="true"></div><div class="cz" title="Spaltenbreite ziehen" aria-hidden="true"></div><div class="cz" title="Spaltenbreite ziehen" aria-hidden="true"></div><div class="cz" title="Spaltenbreite ziehen" aria-hidden="true"></div><div class="cz" title="Spaltenbreite ziehen" aria-hidden="true"></div>
<div class="sz sz-h" data-sz="h" title="Höhe ziehen – Doppelklick: automatisch" aria-hidden="true"><i></i></div><div class="sz sz-l" data-sz="l" title="Breite ziehen – Doppelklick: wie das Theme" aria-hidden="true"><i></i></div><div class="sz sz-r" data-sz="r" title="Breite ziehen – Doppelklick: wie das Theme" aria-hidden="true"><i></i></div>
<div class="pz pz-t" data-side="t" aria-hidden="true"></div><div class="pz pz-r" data-side="r" aria-hidden="true"></div><div class="pz pz-b" data-side="b" aria-hidden="true"></div><div class="pz pz-l" data-side="l" aria-hidden="true"></div>
<div class="edrop"></div><div class="edrop-box"></div><div class="eresize" aria-hidden="true"></div><div class="guide gv"></div><div class="guide gh"></div><div class="epos"></div>
<button type="button" class="entry"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 3.5l3 3L7 16H4v-3z"/></svg><span></span></button>
<div class="rich" role="toolbar" aria-label="Formatierung">
<span class="fmt" style="display:contents"><button data-c="bold" data-tip="Fett" aria-label="Fett"><b>F</b></button><button data-c="italic" data-tip="Kursiv" aria-label="Kursiv"><i>K</i></button><button data-c="h2" data-tip="Zwischentitel" aria-label="Zwischentitel">H2</button><button data-c="h3" data-tip="Kleiner Zwischentitel" aria-label="Kleiner Zwischentitel">H3</button><button data-c="p" data-tip="Absatz" aria-label="Absatz">¶</button><button data-c="ul" data-tip="Aufzählung" aria-label="Aufzählung">•</button><button data-c="quote" data-tip="Zitat" aria-label="Zitat">“</button><button data-c="link" data-tip="Link setzen" aria-label="Link setzen">Link</button></span>
<span class="lnk"><input type="text" inputmode="url" placeholder="/kontakt oder https://…" aria-label="Link-Adresse"><button data-l="ok" class="ok">OK</button><button data-l="rm" data-tip="Link entfernen" aria-label="Link entfernen">✕</button></span>
<div class="lnk-list" role="listbox" aria-label="Seiten der Website"></div>
</div>`;
const ins = shadow.querySelector('.ins') as HTMLElement;
const grip = shadow.querySelector('.grip') as HTMLElement;
const rich = shadow.querySelector('.rich') as HTMLElement;
const egrip = shadow.querySelector('.egrip') as HTMLElement;
const edrop = shadow.querySelector('.edrop') as HTMLElement;
const edropBox = shadow.querySelector('.edrop-box') as HTMLElement;
const eresize = shadow.querySelector('.eresize') as HTMLElement;
const guideV = shadow.querySelector('.gv') as HTMLElement;
const guideH = shadow.querySelector('.gh') as HTMLElement;
const epos = shadow.querySelector('.epos') as HTMLElement;
const entryBtn = shadow.querySelector('.entry') as HTMLButtonElement;

// The page's own blocks: directly in <main> on pages, inside the article (posts, products …) or a template on entries.
const blocksHost = () => main.querySelector<HTMLElement>('[data-nova-blocks]') ?? main;
const blocks = () => [...main.querySelectorAll<HTMLElement>('[data-nova-block]')].filter((b) => !b.parentElement?.closest('[data-nova-block]'));
const blockEl = (id: string) => blocks().find((b) => b.dataset.novaBlock === id) ?? null;
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

/**
 * The text of a field as written – not innerText, which follows the theme's
 * CSS: an uppercase button would be saved in capitals. Line breaks from <br>
 * and new lines (div, p) stay.
 */
function fieldText(el: HTMLElement): string {
  let out = '';
  const walk = (n: Node) => {
    for (const c of n.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.nodeValue ?? '';
      else if (c.nodeName === 'BR') out += '\n';
      else {
        if (/^(DIV|P|LI)$/.test(c.nodeName) && out && !out.endsWith('\n')) out += '\n';
        walk(c);
      }
    }
  };
  walk(el);
  return out;
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
    const value = kind === 'rich' ? sanitizeRichText(el.innerHTML) : kind === 'multi' ? fieldText(el).replace(/\n{3,}/g, '\n\n').trim() : fieldText(el).replace(/\s+/g, ' ').trim();
    post({ t: 'edit', id: block.dataset.novaBlock, path: el.dataset.novaField, value });
  }, 120);
});

// Single-line fields: Enter leaves the field instead of inserting a line break.
d.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  // Typing in the editor's own controls (the link address) is no shortcut for the page.
  if (t === host) return;
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
  } else if (!field && !(t instanceof HTMLInputElement) && e.key.startsWith('Arrow') && nudge(e)) {
    e.preventDefault();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !field && selected && !(t instanceof HTMLInputElement)) {
    post({ t: 'key', key: 'delete' });
  } else if (!field && !(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) {
    // Copy and paste of text stay the browser's; with nothing marked they mean the block or element.
    const action = shortcutAction(e, navigator.platform.includes('Mac'));
    const marked = !(d.getSelection()?.isCollapsed ?? true);
    if (action && !(marked && action === 'copy')) {
      e.preventDefault();
      post({ t: 'key', key: action });
    }
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

/** A component's original shows the variant being designed (class `v-<id>` on its layout). */
const variantOf = new Map<string, string | null>();
function applyVariants() {
  for (const [id, v] of variantOf) {
    const lay = blockEl(id)?.querySelector<HTMLElement>('.lay');
    if (!lay) continue;
    [...lay.classList].filter((c) => c.startsWith('v-')).forEach((c) => lay.classList.remove(c));
    if (v) lay.classList.add(`v-${v}`);
  }
}

/** Open questions, the shown tab and where a slider stands survive the block being drawn anew. */
type WidgetState = { open: Map<string, boolean>; tabs: Map<string, number>; scroll: Map<string, number> };
function widgetState(block: HTMLElement): WidgetState {
  const st: WidgetState = { open: new Map(), tabs: new Map(), scroll: new Map() };
  block.querySelectorAll<HTMLDetailsElement>('details[data-nova-el]').forEach((x) => st.open.set(x.dataset.novaEl!, x.open));
  block.querySelectorAll<HTMLElement>('[data-tabs][data-nova-el]').forEach((x) => st.tabs.set(x.dataset.novaEl!, activeTab(x)));
  block.querySelectorAll<HTMLElement>('[data-slider][data-nova-el]').forEach((x) => st.scroll.set(x.dataset.novaEl!, x.querySelector('.sl-track')?.scrollLeft ?? 0));
  return st;
}
function restoreWidgets(block: HTMLElement, st: WidgetState) {
  block.querySelectorAll<HTMLDetailsElement>('details[data-nova-el]').forEach((x) => {
    const open = st.open.get(x.dataset.novaEl!);
    if (open !== undefined) x.open = open;
  });
  block.querySelectorAll<HTMLElement>('[data-tabs][data-nova-el]').forEach((x) => {
    const i = st.tabs.get(x.dataset.novaEl!);
    if (i) showTab(x, i);
  });
  block.querySelectorAll<HTMLElement>('[data-slider][data-nova-el]').forEach((x) => {
    const left = st.scroll.get(x.dataset.novaEl!);
    const track = x.querySelector<HTMLElement>('.sl-track');
    if (left && track) track.scrollTo({ left, behavior: 'auto' });
  });
}

let selectedEl: string | null = null;
const elEl = (id: string) => main.querySelector<HTMLElement>(`[data-nova-el="${CSS.escape(id)}"]`);
// Pinned elements (locked in the layers) are passed over on the canvas: picked in the layers, never moved by accident.
const PICKABLE = '[data-nova-el]:not([data-nova-pinned])';
const pinned = (el: Element | null | undefined) => Boolean(el?.hasAttribute('data-nova-pinned'));

/** More elements of the same canvas, added with Shift-click: moved, nudged and aligned together. */
const multi = new Set<string>();
function clearMulti() {
  multi.forEach((id) => elEl(id)?.removeAttribute('data-nova-el-multi'));
  multi.clear();
}
/** The selected element and the ones added to it. */
function group(): HTMLElement[] {
  const first = selectedEl ? elEl(selectedEl) : null;
  if (!first) return [];
  return [first, ...[...multi].map(elEl).filter((x): x is HTMLElement => Boolean(x))];
}
function toggleMulti(el: HTMLElement) {
  const id = el.dataset.novaEl!;
  if (multi.delete(id)) el.removeAttribute('data-nova-el-multi');
  else {
    multi.add(id);
    el.setAttribute('data-nova-el-multi', '');
  }
  post({ t: 'multi', block: selected, els: group().map((x) => x.dataset.novaEl) });
}

function selectEl(id: string | null, notify: boolean) {
  if (id !== selectedEl) clearMulti();
  if (selectedEl) elEl(selectedEl)?.removeAttribute('data-nova-el-selected');
  selectedEl = id;
  const el = id ? elEl(id) : null;
  el?.setAttribute('data-nova-el-selected', '');
  if (el) reveal(el);
  placeEgrip();
  if (!notify) return;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (el && block) {
    if (selected !== block.dataset.novaBlock) select(block.dataset.novaBlock!, false);
    post({ t: 'select-el', block: block.dataset.novaBlock, el: id, rect: rectOf(el), blockRect: rectOf(block) });
  } else post({ t: 'select-el', block: selected, el: null });
}

/* ---------- elements hidden in the editor only (the eye in the layers) ---------- */

let peek = new Set<string>();
function applyPeek() {
  main.querySelectorAll('[data-nova-peek]').forEach((x) => x.removeAttribute('data-nova-peek'));
  for (const id of peek) elEl(id)?.setAttribute('data-nova-peek', '');
  sendRect();
}
// Blocks rendered again come without the mark: it goes back on.
new MutationObserver(() => peek.size && [...peek].some((id) => elEl(id) && !elEl(id)!.hasAttribute('data-nova-peek')) && applyPeek()).observe(main, { childList: true, subtree: true });

/* ---------- measuring: hold Alt and point at something to see how far it is from the selection ---------- */

const measure = shadow.querySelector('.measure') as HTMLElement;
let pointedAt: Element | null = null;
function clearMeasure() {
  measure.replaceChildren();
  measure.classList.remove('on');
}
function showMeasure() {
  const src = selectedEl ? elEl(selectedEl) : selected ? blockEl(selected) : null;
  const other = pointedAt?.closest<HTMLElement>('[data-nova-el],[data-nova-block]') ?? null;
  if (!src || !other || other === src || elDrag || free || padDrag) return clearMeasure();
  const a = src.getBoundingClientRect();
  const b = other.getBoundingClientRect();
  const parts: HTMLElement[] = [];
  const add = (cls: string, x: number, y: number, w: number, h: number, text?: string) => {
    const n = d.createElement('div');
    n.className = cls;
    Object.assign(n.style, { left: `${x}px`, top: `${y + scrollY}px`, ...(w ? { width: `${w}px` } : {}), ...(h ? { height: `${h}px` } : {}) });
    if (text) n.textContent = text;
    parts.push(n);
  };
  // A distance as a line with its value in the middle; nothing for no distance.
  const hLine = (x1: number, x2: number, y: number) => {
    const len = Math.round(x2 - x1);
    if (len <= 0) return;
    add('m-line h', x1, y, x2 - x1, 0);
    add('m-label', (x1 + x2) / 2, y, 0, 0, String(len));
  };
  const vLine = (y1: number, y2: number, x: number) => {
    const len = Math.round(y2 - y1);
    if (len <= 0) return;
    add('m-line v', x, y1, 0, y2 - y1);
    add('m-label', x, (y1 + y2) / 2, 0, 0, String(len));
  };
  add('m-box', b.left, b.top, b.width, b.height);
  const inside = (i: DOMRect, o: DOMRect) => o.left <= i.left && o.right >= i.right && o.top <= i.top && o.bottom >= i.bottom;
  if (inside(a, b) || inside(b, a)) {
    // One holds the other: from each edge of the inner one to the outer one.
    const [i, o] = inside(a, b) ? [a, b] : [b, a];
    const cx = i.left + i.width / 2;
    const cy = i.top + i.height / 2;
    vLine(o.top, i.top, cx);
    vLine(i.bottom, o.bottom, cx);
    hLine(o.left, i.left, cy);
    hLine(i.right, o.right, cy);
  } else {
    // Side by side: the gaps between them, on the middle of what they share (or of the selection).
    const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = yOverlap > 0 ? Math.max(a.top, b.top) + yOverlap / 2 : a.top + a.height / 2;
    const x = xOverlap > 0 ? Math.max(a.left, b.left) + xOverlap / 2 : a.left + a.width / 2;
    if (a.right <= b.left) hLine(a.right, b.left, y);
    else if (b.right <= a.left) hLine(b.right, a.left, y);
    if (a.bottom <= b.top) vLine(a.bottom, b.top, x);
    else if (b.bottom <= a.top) vLine(b.bottom, a.top, x);
    if (xOverlap > 0 && yOverlap > 0) {
      // Overlapping: how far their top and left edges are apart.
      vLine(Math.min(a.top, b.top), Math.max(a.top, b.top), Math.min(a.left, b.left) + 4);
      hLine(Math.min(a.left, b.left), Math.max(a.left, b.left), Math.min(a.top, b.top) + 4);
    }
  }
  measure.replaceChildren(...parts);
  measure.classList.add('on');
}
d.addEventListener(
  'pointermove',
  (e) => {
    pointedAt = e.target instanceof Element ? e.target : null;
    if (e.altKey && !e.buttons) showMeasure();
    else if (measure.classList.contains('on')) clearMeasure();
  },
  { passive: true },
);
addEventListener('keydown', (e) => {
  if (e.key === 'Alt' && !e.repeat) showMeasure();
});
addEventListener('keyup', (e) => {
  if (e.key === 'Alt') clearMeasure();
});
addEventListener('blur', clearMeasure);
addEventListener('scroll', () => measure.classList.contains('on') && showMeasure(), { passive: true });

/* ---------- image files dropped from the computer ---------- */

type DropMode = 'replace' | 'into' | 'after' | 'block';
const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer && [...e.dataTransfer.types].includes('Files'));
/** Where dropped pictures go: onto a picture replaces it, into a container or free canvas, else after the element or block. */
function dropPlace(e: DragEvent): { block: HTMLElement; el: HTMLElement | null; mode: DropMode; box: DOMRect } | null {
  const t = e.target instanceof Element ? e.target : null;
  const block = t?.closest<HTMLElement>('[data-nova-block]');
  if (!block || lockOf(block) !== 'none') return null;
  const el = t!.closest<HTMLElement>(PICKABLE);
  if (!el || !block.contains(el)) return { block, el: null, mode: block.dataset.novaType === 'layout' ? 'into' : 'block', box: block.getBoundingClientRect() };
  const kind = el.dataset.novaKindEl;
  const mode: DropMode = kind === 'image' ? 'replace' : kind === 'box' || kind === 'canvas' ? 'into' : 'after';
  return { block, el, mode, box: el.getBoundingClientRect() };
}
d.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  // A file dropped anywhere else would open in the canvas instead of the page.
  e.preventDefault();
  const place = dropPlace(e);
  e.dataTransfer!.dropEffect = place ? 'copy' : 'none';
  if (!place) return edropBox.classList.remove('on');
  Object.assign(edropBox.style, { top: `${place.box.top + scrollY}px`, left: `${place.box.left}px`, width: `${place.box.width}px`, height: `${place.box.height}px` });
  edropBox.classList.add('on');
});
d.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) edropBox.classList.remove('on');
});
d.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  edropBox.classList.remove('on');
  const place = dropPlace(e);
  const files = [...(e.dataTransfer?.files ?? [])].slice(0, 12);
  if (!place || !files.length) return;
  // On a free canvas the picture lands where it was let go, in percent like everything there.
  const canvas = place.mode === 'into' && place.el?.dataset.novaKindEl === 'canvas' ? place.box : null;
  post({
    t: 'drop-files',
    files,
    block: place.block.dataset.novaBlock,
    el: place.el?.dataset.novaEl ?? null,
    mode: place.mode,
    at: canvas ? { left: ((e.clientX - canvas.left) / canvas.width) * 100, top: ((e.clientY - canvas.top) / canvas.height) * 100 } : null,
  });
});

/* ---------- padding: drag the inner edges of what is selected ---------- */

const pads = [...shadow.querySelectorAll<HTMLElement>('.pz')];
type Side = 't' | 'r' | 'b' | 'l';
const SIDES: Side[] = ['t', 'r', 'b', 'l'];
const PAD_KEY = { t: 'pt', r: 'pr', b: 'pb', l: 'pl' } as const;
const PAD_CSS = { t: 'padding-top', r: 'padding-right', b: 'padding-bottom', l: 'padding-left' } as const;
const OPPOSITE = { t: 'b', b: 't', l: 'r', r: 'l' } as const;
let padDrag: { el: HTMLElement; side: Side; x: number; y: number; start: Record<Side, number>; now: Record<Side, number>; moved: boolean } | null = null;

const paddingOf = (el: HTMLElement): Record<Side, number> => {
  const cs = getComputedStyle(el);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
};

/** The selected element, else the selected block – unless its layout is locked or it is too small to grab. */
function padTarget(): HTMLElement | null {
  const el = selectedEl ? elEl(selectedEl) : selected ? blockEl(selected) : null;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (!el || !block || lockOf(block) !== 'none' || pinned(el) || elDrag || free) return null;
  const r = el.getBoundingClientRect();
  return r.width >= 48 && r.height >= 32 ? el : null;
}

/** The four padding areas over the target, at least a few pixels to grab even when there is none. */
function placePads() {
  placeSizers();
  placeColHandles();
  const el = padDrag?.el ?? padTarget();
  if (!el) return pads.forEach((p) => p.classList.remove('on'));
  const r = el.getBoundingClientRect();
  const v = paddingOf(el);
  const grab = (n: number, max: number) => Math.min(Math.max(n, 8), max / 2);
  for (const p of pads) {
    const side = p.dataset.side as Side;
    const th = grab(v[side], side === 't' || side === 'b' ? r.height : r.width);
    const box =
      side === 't' ? [r.left, r.top, r.width, th]
      : side === 'b' ? [r.left, r.bottom - th, r.width, th]
      : side === 'l' ? [r.left, r.top + grab(v.t, r.height), th, r.height - grab(v.t, r.height) - grab(v.b, r.height)]
      : [r.right - th, r.top + grab(v.t, r.height), th, r.height - grab(v.t, r.height) - grab(v.b, r.height)];
    Object.assign(p.style, { left: `${box[0]}px`, top: `${box[1] + scrollY}px`, width: `${box[2]}px`, height: `${Math.max(0, box[3])}px` });
    p.classList.add('on');
  }
}

for (const p of pads) {
  p.addEventListener('pointerdown', (e) => {
    const el = padTarget();
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    p.setPointerCapture(e.pointerId);
    const start = paddingOf(el);
    padDrag = { el, side: p.dataset.side as Side, x: e.clientX, y: e.clientY, start, now: { ...start }, moved: false };
    p.classList.add('drag');
  });
  p.addEventListener('pointermove', (e) => {
    if (!padDrag) return;
    const { el, side, start } = padDrag;
    // Pulling the inner edge towards the middle makes more room.
    const delta = side === 't' ? e.clientY - padDrag.y : side === 'b' ? padDrag.y - e.clientY : side === 'l' ? e.clientX - padDrag.x : padDrag.x - e.clientX;
    if (!padDrag.moved && Math.abs(delta) < 2) return;
    padDrag.moved = true;
    const raw = Math.max(0, start[side] + delta);
    // Steps of 4 px; with Ctrl/⌘ to the pixel. Shift: all four sides, Alt: the opposite one too – as in the design panel.
    const value = e.metaKey || e.ctrlKey ? Math.round(raw) : Math.round(raw / 4) * 4;
    const sides: Side[] = e.shiftKey ? SIDES : e.altKey ? [side, OPPOSITE[side]] : [side];
    padDrag.now = { ...start };
    for (const x of sides) padDrag.now[x] = value;
    el.setAttribute('data-nova-pad', '');
    for (const x of SIDES) el.style.setProperty(PAD_CSS[x], `${padDrag.now[x]}px`);
    epos.textContent = sides.length === 4 ? `${value} px ringsum` : `${value} px`;
    epos.style.top = `${e.clientY + scrollY + 14}px`;
    epos.style.left = `${e.clientX + 14}px`;
    epos.classList.add('on');
    placePads();
    sendRect();
  });
  const end = () => {
    if (!padDrag) return;
    const { el, start, now, moved } = padDrag;
    padDrag = null;
    p.classList.remove('drag');
    epos.classList.remove('on');
    if (moved) {
      const values: Record<string, string> = {};
      for (const x of SIDES) if (now[x] !== start[x]) values[PAD_KEY[x]] = `${now[x]}px`;
      const block = el.closest<HTMLElement>('[data-nova-block]');
      if (Object.keys(values).length) post({ t: 'pad', block: block?.dataset.novaBlock, el: el === block ? null : el.dataset.novaEl ?? null, values });
      afterDrag = true;
      setTimeout(() => (afterDrag = false), 0);
    }
    placePads();
  };
  p.addEventListener('pointerup', end);
  p.addEventListener('pointercancel', end);
}

/* ---------- grid columns: drag the line between two of them ---------- */

const colHandles = [...shadow.querySelectorAll<HTMLElement>('.cz')];
let colDrag: { el: HTMLElement; i: number; x: number; start: number[]; now: number[]; gap: number; moved: boolean } | null = null;

const tracksOf = (el: HTMLElement) => {
  const cs = getComputedStyle(el);
  return { tracks: cs.gridTemplateColumns.split(' ').map(parseFloat), gap: parseFloat(cs.columnGap) || 0 };
};

/** The selected container when it is a grid of two to six columns – and may be changed. */
function colTarget(): HTMLElement | null {
  if (!selectedEl || free || elDrag || padDrag || sizeDrag) return null;
  const el = elEl(selectedEl);
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (!el || !block || lockOf(block) !== 'none' || pinned(el) || !el.hasAttribute('data-nova-box') || getComputedStyle(el).display !== 'grid') return null;
  const { tracks } = tracksOf(el);
  return tracks.length >= 2 && tracks.length <= 6 && tracks.every((n) => n > 0) ? el : null;
}

function placeColHandles() {
  const el = colDrag?.el ?? colTarget();
  if (!el) return colHandles.forEach((h) => h.classList.remove('on'));
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const { tracks, gap } = colDrag ? { tracks: colDrag.now, gap: colDrag.gap } : tracksOf(el);
  let x = r.left + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0);
  colHandles.forEach((h, i) => {
    if (i >= tracks.length - 1) return h.classList.remove('on');
    x += tracks[i] + (i > 0 ? gap : 0);
    Object.assign(h.style, { left: `${x + gap / 2}px`, top: `${r.top + scrollY + Math.min(r.height / 2, 120) - 22}px` });
    h.classList.add('on');
  });
}

/** Widths as ratios: whole numbers when they are close to simple shares (1 : 2, 1 : 3 …), else two decimals. */
function colRatio(px: number[]): string {
  const total = px.reduce((a, b) => a + b, 0);
  const shares = px.map((w) => w / total);
  for (const d of [2, 3, 4, 5, 6, 8, 10, 12]) {
    const parts = shares.map((x) => x * d);
    if (parts.every((p) => Math.round(p) >= 1 && Math.abs(p - Math.round(p)) < 0.06 * (d / 2))) {
      const ints = parts.map(Math.round);
      if (ints.reduce((a, b) => a + b, 0) === d) return ints.join(' ');
    }
  }
  const unit = total / px.length;
  return px.map((w) => String(Math.round((w / unit) * 100) / 100)).join(' ');
}

colHandles.forEach((h, i) => {
  h.addEventListener('pointerdown', (e) => {
    const el = colTarget();
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    h.setPointerCapture(e.pointerId);
    const { tracks, gap } = tracksOf(el);
    colDrag = { el, i, x: e.clientX, start: tracks, now: [...tracks], gap, moved: false };
    h.classList.add('drag');
  });
  h.addEventListener('pointermove', (e) => {
    if (!colDrag) return;
    const { el, start } = colDrag;
    const dx = e.clientX - colDrag.x;
    if (!colDrag.moved && Math.abs(dx) < 2) return;
    colDrag.moved = true;
    // Only the two columns beside the line change; neither gets narrower than 48 px.
    const pair = start[i] + start[i + 1];
    const left = Math.min(Math.max(48, start[i] + dx), pair - 48);
    colDrag.now = start.map((w, k) => (k === i ? left : k === i + 1 ? pair - left : w));
    el.style.gridTemplateColumns = colDrag.now.map((w) => `minmax(0,${w}fr)`).join(' ');
    el.setAttribute('data-nova-cols', '');
    const total = colDrag.now.reduce((a, b) => a + b, 0);
    epos.textContent = colDrag.now.map((w) => `${Math.round((w / total) * 100)} %`).join(' · ');
    epos.style.top = `${e.clientY + scrollY + 14}px`;
    epos.style.left = `${e.clientX + 14}px`;
    epos.classList.add('on');
    placeColHandles();
    sendRect();
  });
  const end = () => {
    if (!colDrag) return;
    const { el, now, moved } = colDrag;
    colDrag = null;
    h.classList.remove('drag');
    epos.classList.remove('on');
    if (moved) {
      const block = el.closest<HTMLElement>('[data-nova-block]');
      post({ t: 'el-cols', block: block?.dataset.novaBlock, el: el.dataset.novaEl, value: colRatio(now) });
      afterDrag = true;
      setTimeout(() => (afterDrag = false), 0);
    }
    placeColHandles();
  };
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
});

/* ---------- section size: height and content width, dragged on the canvas ---------- */

const sizers = [...shadow.querySelectorAll<HTMLElement>('.sz')];
type SizeKind = 'h' | 'l' | 'r';
let sizeDrag: { block: HTMLElement; col: HTMLElement | null; kind: SizeKind; x: number; y: number; start: number; value: string | null; moved: boolean } | null = null;

/** The selected section (not one of its elements) and its content column, if it has one of its own. */
function sizeTarget(): { block: HTMLElement; col: HTMLElement | null } | null {
  if (selectedEl || !selected || free || elDrag || padDrag) return null;
  const block = blockEl(selected);
  if (!block || lockOf(block) !== 'none') return null;
  const col = [...block.querySelectorAll<HTMLElement>('.wrap')].find((w) => w.closest('[data-nova-block]') === block) ?? null;
  return { block, col };
}

function placeSizers() {
  const t = sizeDrag ?? sizeTarget();
  if (!t) return sizers.forEach((x) => x.classList.remove('on'));
  const r = t.block.getBoundingClientRect();
  const c = t.col?.getBoundingClientRect();
  // The column's edges only when it is narrower than the section – otherwise there is nothing to grab apart from the section's own.
  const narrow = c && c.width < r.width - 8;
  for (const x of sizers) {
    const kind = x.dataset.sz as SizeKind;
    if (kind === 'h') {
      Object.assign(x.style, { left: `${r.left + r.width / 2 - 24}px`, top: `${r.bottom + scrollY - 8}px` });
      x.classList.add('on');
    } else if (c && narrow) {
      const mid = Math.min(Math.max(c.top + c.height / 2, r.top + 40), r.bottom - 40);
      Object.assign(x.style, { left: `${(kind === 'l' ? c.left : c.right) - 8}px`, top: `${mid + scrollY - 24}px` });
      x.classList.add('on');
    } else x.classList.remove('on');
  }
}

/** Heights a section snaps to: half, three quarters and the whole screen. */
const SCREEN_STEPS: [number, string, string][] = [
  [0.5, '50svh', 'Halber Bildschirm'],
  [0.75, '75svh', 'Dreiviertel Bildschirm'],
  [1, '100svh', 'Ganzer Bildschirm'],
];

for (const x of sizers) {
  x.addEventListener('pointerdown', (e) => {
    const t = sizeTarget();
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    x.setPointerCapture(e.pointerId);
    const kind = x.dataset.sz as SizeKind;
    const start = kind === 'h' ? t.block.getBoundingClientRect().height : (t.col?.getBoundingClientRect().width ?? 0);
    sizeDrag = { ...t, kind, x: e.clientX, y: e.clientY, start, value: null, moved: false };
    x.classList.add('drag');
    t.col?.setAttribute('data-nova-sizing', '');
  });
  x.addEventListener('pointermove', (e) => {
    if (!sizeDrag) return;
    const { block, col, kind, start } = sizeDrag;
    const delta = kind === 'h' ? e.clientY - sizeDrag.y : (kind === 'r' ? e.clientX - sizeDrag.x : sizeDrag.x - e.clientX) * 2;
    if (!sizeDrag.moved && Math.abs(delta) < 2) return;
    sizeDrag.moved = true;
    // Steps of 10 px, snapping to the screen heights or the full width; Shift: to the pixel, no snapping.
    const fine = e.shiftKey;
    const step = (n: number) => (fine ? Math.round(n) : Math.round(n / 10) * 10);
    let label: string;
    if (kind === 'h') {
      const raw = Math.max(0, start + delta);
      const snap = fine ? undefined : SCREEN_STEPS.find(([f]) => Math.abs(raw - f * innerHeight) < 14);
      sizeDrag.value = snap ? snap[1] : `${step(raw)}px`;
      label = snap ? snap[2] : `${step(raw)} px hoch`;
      block.style.minHeight = snap ? `${snap[0] * innerHeight}px` : sizeDrag.value;
    } else {
      const full = block.getBoundingClientRect().width;
      const raw = Math.min(Math.max(240, start + delta), full);
      const whole = !fine && raw > full - 24;
      sizeDrag.value = whole ? '100%' : `${step(raw)}px`;
      label = whole ? 'Volle Breite' : `${step(raw)} px breit`;
      block.style.setProperty('--max', whole ? '100%' : sizeDrag.value);
    }
    block.setAttribute('data-nova-size', '');
    epos.textContent = label;
    epos.style.top = `${e.clientY + scrollY + 14}px`;
    epos.style.left = `${e.clientX + 14}px`;
    epos.classList.add('on');
    col?.setAttribute('data-nova-sizing', '');
    placeSizers();
    sendRect();
  });
  const end = () => {
    if (!sizeDrag) return;
    const { block, col, kind, value, moved } = sizeDrag;
    sizeDrag = null;
    x.classList.remove('drag');
    epos.classList.remove('on');
    col?.removeAttribute('data-nova-sizing');
    if (moved && value) {
      post({ t: 'block-size', block: block.dataset.novaBlock, key: kind === 'h' ? 'minHeight' : 'contentWidth', value });
      afterDrag = true;
      setTimeout(() => (afterDrag = false), 0);
    }
    placeSizers();
  };
  x.addEventListener('pointerup', end);
  x.addEventListener('pointercancel', end);
  // Double-click: back to the natural height, or the theme's width.
  x.addEventListener('dblclick', (e) => {
    const t = sizeTarget();
    if (!t) return;
    e.stopPropagation();
    post({ t: 'block-size', block: t.block.dataset.novaBlock, key: x.dataset.sz === 'h' ? 'minHeight' : 'contentWidth', value: null });
  });
}

function placeEgrip() {
  placePads();
  const el = selectedEl ? elEl(selectedEl) : null;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  // Locked blocks keep their layout in the Studio.
  eresize.classList.toggle('on', Boolean(el && block && lockOf(block) === 'none' && onCanvas(el) && !pinned(el)));
  if (!el || !block || lockOf(block) !== 'none' || pinned(el)) return egrip.classList.remove('on');
  const r = el.getBoundingClientRect();
  eresize.style.top = `${r.bottom + scrollY - 6}px`;
  eresize.style.left = `${r.right - 6}px`;
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
    const el = (e.target as HTMLElement).closest?.<HTMLElement>(PICKABLE) ?? null;
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
  return elDrag ? slotIn(elDrag.block, x, y, elDrag.el) : null;
}

/** The place in a free layout under the pointer: container, index and the line to show – `el` is the one being moved, if any. */
function slotIn(block: HTMLElement, x: number, y: number, el: HTMLElement | null): { parent: string | null; index: number; line: DOMRect; container: HTMLElement } | null {
  const under = d.elementsFromPoint(x, y).find((n) => block.contains(n) && !el?.contains(n)) as HTMLElement | undefined;
  if (!under) return null;
  // The innermost container under the pointer, or the layout itself.
  let box = under.closest<HTMLElement>('[data-nova-box]');
  while (box && (!block.contains(box) || el?.contains(box))) box = box.parentElement?.closest<HTMLElement>('[data-nova-box]') ?? null;
  const container = box ?? block.querySelector<HTMLElement>('.lay');
  if (!container) return null;
  // Hidden tabs and closed answers take no place – they are skipped, not counted out.
  const kids = [...container.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-nova-el') && c !== el && c.getClientRects().length > 0);
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
  // An accordion's answer starts after its question (the first element sits in the summary).
  const realIndex = (ref ? all.indexOf(ref) : all.length) + (Number(container.dataset.novaOffset) || 0);
  const cr = container.getBoundingClientRect();
  let line: DOMRect;
  if (ref) {
    const r = ref.getBoundingClientRect();
    line = rowish && !cs.display.includes('grid') ? new DOMRect(r.left - 3, r.top, 3, r.height) : new DOMRect(r.left, r.top - 3, r.width, 3);
  } else if (kids.length) {
    const r = kids[kids.length - 1].getBoundingClientRect();
    line = rowish && !cs.display.includes('grid') ? new DOMRect(r.right + 1, r.top, 3, r.height) : new DOMRect(r.left, r.bottom + 1, r.width, 3);
  } else line = new DOMRect(cr.left + 8, cr.top + cr.height / 2, cr.width - 16, 3);
  return { parent: container.dataset.novaBox ?? null, index: realIndex, line, container };
}

egrip.addEventListener('pointerdown', (e) => {
  const el = selectedEl ? elEl(selectedEl) : null;
  const block = el?.closest<HTMLElement>('[data-nova-block]');
  if (!el || !block) return;
  // On a free canvas the grip moves the element to any place, not through the tree.
  if (onCanvas(el)) return startFree(e, el, 'move');
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

/* ---------- new elements and sections, dragged in from the editor's side bar ---------- */

const NEW_EL = 'application/x-nova-el';
const NEW_BLOCK = 'application/x-nova-block';
/** What is being dragged in (the data itself can only be read on drop). */
const newKind = (e: DragEvent): 'el' | 'block' | null => {
  const types = [...(e.dataTransfer?.types ?? [])];
  return types.includes(NEW_EL) ? 'el' : types.includes(NEW_BLOCK) ? 'block' : null;
};

/** Where a new section goes: the boundary between two blocks nearest to the pointer. */
function blockSlot(y: number): { index: number; line: DOMRect } {
  const list = blocks();
  const host = blocksHost().getBoundingClientRect();
  if (!list.length) return { index: 0, line: new DOMRect(host.left, host.top + 24, host.width, 4) };
  let best = { index: list.length, y: list[list.length - 1].getBoundingClientRect().bottom };
  let dist = Infinity;
  list.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    for (const [edge, index] of [
      [r.top, i],
      [r.bottom, i + 1],
    ] as [number, number][]) {
      if (Math.abs(y - edge) < dist) {
        dist = Math.abs(y - edge);
        best = { index, y: edge };
      }
    }
  });
  return { index: best.index, line: new DOMRect(host.left, best.y - 2, host.width, 4) };
}

/** An element goes into the free layout under the pointer; elsewhere – and sections always – between two blocks. */
function newDropAt(e: DragEvent, kind: 'el' | 'block') {
  if (kind === 'el') {
    const t = e.target instanceof Element ? e.target : null;
    const block = t?.closest<HTMLElement>('[data-nova-block]');
    if (block && block.dataset.novaType === 'layout' && lockOf(block) === 'none') {
      const slot = slotIn(block, e.clientX, e.clientY, null);
      if (slot) return { at: { block: block.dataset.novaBlock, parent: slot.parent, index: slot.index }, line: slot.line, box: slot.container.getBoundingClientRect() };
    }
  }
  const slot = blockSlot(e.clientY);
  return { at: { index: slot.index }, line: slot.line, box: null };
}

const hideDrop = () => {
  edrop.classList.remove('on');
  edropBox.classList.remove('on');
};
d.addEventListener('dragover', (e) => {
  const kind = newKind(e);
  if (!kind) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
  const place = newDropAt(e, kind);
  Object.assign(edrop.style, { top: `${place.line.top + scrollY}px`, left: `${place.line.left}px`, width: `${place.line.width}px`, height: `${place.line.height}px` });
  edrop.classList.add('on');
  if (place.box) Object.assign(edropBox.style, { top: `${place.box.top + scrollY}px`, left: `${place.box.left}px`, width: `${place.box.width}px`, height: `${place.box.height}px` });
  edropBox.classList.toggle('on', Boolean(place.box));
  // Near the edges the page scrolls along.
  if (e.clientY < 60) scrollBy(0, -12);
  else if (e.clientY > innerHeight - 60) scrollBy(0, 12);
});
d.addEventListener('dragleave', (e) => {
  if (newKind(e) && !e.relatedTarget) hideDrop();
});
d.addEventListener('drop', (e) => {
  const kind = newKind(e);
  if (!kind) return;
  e.preventDefault();
  hideDrop();
  const place = newDropAt(e, kind);
  post({ t: 'drop-new', kind, data: e.dataTransfer!.getData(kind === 'el' ? NEW_EL : NEW_BLOCK), at: place.at });
});

/* ---------- free canvas: move, resize and nudge elements – in percent of the canvas ---------- */

function onCanvas(el: HTMLElement | null): boolean {
  return Boolean(el?.parentElement?.matches('[data-nova-kind-el="canvas"]'));
}
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
/** Elements with a height of their own; text keeps growing with its words. */
const twoD = (el: HTMLElement) => /^(shape|image|box|video|spacer|icon)$/.test(el.dataset.novaKindEl ?? '');
interface Box extends Rect {
  el: HTMLElement;
}
/** Place and size of an element in percent of its canvas. */
function boxOf(el: HTMLElement, cr: DOMRect): Box {
  const r = el.getBoundingClientRect();
  return { el, l: ((r.left - cr.left) / cr.width) * 100, t: ((r.top - cr.top) / cr.height) * 100, w: (r.width / cr.width) * 100, h: (r.height / cr.height) * 100 };
}
let free: { el: HTMLElement; canvas: DOMRect; x: number; y: number; items: Box[]; others: Box[]; mode: 'move' | 'size'; moved: boolean } | null = null;
/** A drag ends in a click – on the handle or on one element of several; it must not change the selection. */
let afterDrag = false;

function startFree(e: PointerEvent, el: HTMLElement, mode: 'move' | 'size') {
  e.preventDefault();
  const cr = el.parentElement!.getBoundingClientRect();
  const members = mode === 'move' && group().includes(el) ? group() : [el];
  free = {
    el,
    canvas: cr,
    x: e.clientX,
    y: e.clientY,
    items: members.map((x) => boxOf(x, cr)),
    // Everything else on the canvas offers its edges and middles to snap to.
    others: [...el.parentElement!.children].filter((x): x is HTMLElement => x instanceof HTMLElement && x.hasAttribute('data-nova-el') && !members.includes(x)).map((x) => boxOf(x, cr)),
    mode,
    moved: false,
  };
  addEventListener('pointermove', moveFree);
  addEventListener('pointerup', endFree, { once: true });
  addEventListener('pointercancel', endFree, { once: true });
}

function moveFree(e: PointerEvent) {
  if (!free) return;
  const { el, canvas: cr, items } = free;
  const dx = ((e.clientX - free.x) / cr.width) * 100;
  const dy = ((e.clientY - free.y) / cr.height) * 100;
  if (!free.moved && Math.abs(e.clientX - free.x) + Math.abs(e.clientY - free.y) < 3) return;
  free.moved = true;
  guideV.classList.remove('on');
  guideH.classList.remove('on');
  if (free.mode === 'size') {
    const it = items[0];
    const w = Math.max(2, it.w + dx);
    el.setAttribute('data-nova-free', '');
    el.style.width = pct(w);
    if (twoD(el)) {
      // Shift keeps the proportions.
      const h = e.shiftKey ? w * (it.h / it.w) : Math.max(2, it.h + dy);
      el.style.height = pct(h);
      epos.textContent = `${pct(w)} × ${pct(h)}`;
    } else epos.textContent = `${pct(w)} breit`;
  } else {
    // The selection as one box: it snaps with its edges and middle; Alt moves freely.
    const L = Math.min(...items.map((b) => b.l)) + dx;
    const T = Math.min(...items.map((b) => b.t)) + dy;
    const W = Math.max(...items.map((b) => b.l + b.w)) - Math.min(...items.map((b) => b.l));
    const H = Math.max(...items.map((b) => b.t + b.h)) - Math.min(...items.map((b) => b.t));
    let sx = 0;
    let sy = 0;
    if (!e.altKey) {
      // Within six pixels of a line.
      const hx = snapTo([L, L + W / 2, L + W], snapLines(free.others, 'x'), (6 / cr.width) * 100);
      const hy = snapTo([T, T + H / 2, T + H], snapLines(free.others, 'y'), (6 / cr.height) * 100);
      if (hx) {
        sx = hx.by;
        Object.assign(guideV.style, { left: `${cr.left + (hx.at / 100) * cr.width}px`, top: `${cr.top + scrollY}px`, height: `${cr.height}px` });
        guideV.classList.add('on');
      }
      if (hy) {
        sy = hy.by;
        Object.assign(guideH.style, { top: `${cr.top + (hy.at / 100) * cr.height + scrollY}px`, left: `${cr.left}px`, width: `${cr.width}px` });
        guideH.classList.add('on');
      }
    }
    for (const b of items) {
      b.el.setAttribute('data-nova-free', '');
      b.el.style.left = pct(b.l + dx + sx);
      b.el.style.top = pct(b.t + dy + sy);
    }
    epos.textContent = `${pct(L + sx)} · ${pct(T + sy)}`;
  }
  const r = el.getBoundingClientRect();
  Object.assign(epos.style, { top: `${r.bottom + scrollY + 8}px`, left: `${r.left}px` });
  epos.classList.add('on');
  placeEgrip();
}

function endFree() {
  removeEventListener('pointermove', moveFree);
  guideV.classList.remove('on');
  guideH.classList.remove('on');
  epos.classList.remove('on');
  if (!free) return;
  const { el, moved, mode, items } = free;
  free = null;
  if (!moved) return;
  afterDrag = true;
  setTimeout(() => (afterDrag = false), 0);
  const block = el.closest<HTMLElement>('[data-nova-block]');
  if (mode === 'size') return post({ t: 'el-pos', block: block?.dataset.novaBlock, el: el.dataset.novaEl, width: el.style.width, height: el.style.height || undefined });
  postPlaces(block, items.map((b) => b.el));
}

/** Where elements sit now, in one change (one step to undo). */
function postPlaces(block: HTMLElement | null | undefined, els: HTMLElement[]) {
  post({ t: 'el-pos-many', block: block?.dataset.novaBlock, items: els.map((x) => ({ el: x.dataset.novaEl, left: x.style.left, top: x.style.top })) });
}

/** Lines up the selection (see alignRects) and keeps the new places. */
function align(how: AlignHow) {
  const members = group().filter(onCanvas);
  if (!members.length) return;
  const cr = members[0].parentElement!.getBoundingClientRect();
  const boxes = alignRects(members.map((x) => boxOf(x, cr)), how);
  for (const b of boxes) {
    b.el.setAttribute('data-nova-free', '');
    b.el.style.left = pct(b.l);
    b.el.style.top = pct(b.t);
  }
  placeEgrip();
  postPlaces(members[0].closest<HTMLElement>('[data-nova-block]'), members);
}

eresize.addEventListener('pointerdown', (e) => {
  const el = selectedEl ? elEl(selectedEl) : null;
  if (el && onCanvas(el)) startFree(e, el, 'size');
});

// The selected element itself can be dragged too – but its text stays for writing.
d.addEventListener(
  'pointerdown',
  (e) => {
    const t = e.target as HTMLElement;
    // Any element of the selection drags all of it along.
    const el = group().find((x) => x.contains(t));
    if (!el || e.button !== 0 || e.shiftKey || !onCanvas(el) || pinned(el) || t.closest('[data-nova-field]')) return;
    const block = el.closest<HTMLElement>('[data-nova-block]');
    if (block && lockOf(block) === 'none') startFree(e, el, 'move');
  },
  true,
);

/** Arrow keys move the selection on a canvas by half a percent, with Shift by five. */
function nudge(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey'>): boolean {
  const els = group();
  if (!els.length || !onCanvas(els[0]) || els.some(pinned) || e.altKey || e.metaKey || e.ctrlKey) return false;
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!dir) return false;
  const cr = els[0].parentElement!.getBoundingClientRect();
  const step = e.shiftKey ? 5 : 0.5;
  for (const el of els) {
    const b = boxOf(el, cr);
    el.style.left = pct(b.l + dir[0] * step);
    el.style.top = pct(b.t + dir[1] * step);
    el.setAttribute('data-nova-free', '');
  }
  placeEgrip();
  postPlaces(els[0].closest<HTMLElement>('[data-nova-block]'), els);
  return true;
}

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
  placePads();
  if (notify) post(el ? { t: 'select', id, rect: rectOf(el), lock: el.dataset.novaLock ?? 'none', type: el.dataset.novaType } : { t: 'deselect' });
}

d.addEventListener(
  'click',
  (e) => {
    const t = e.target as HTMLElement;
    // The editor's own controls (formatting bar, insert button …) live in the chrome: their clicks select nothing.
    if (t === host) return;
    // Nothing navigates or submits in the editor – also not a click on a text being written inside a link (a button's label).
    if (t.closest('a[href]')) e.preventDefault();
    else if ((t.closest('button') || t.closest('form')) && !t.closest('[data-nova-field]')) e.preventDefault();
    const global = t.closest<HTMLElement>('[data-nova-global]');
    if (global) {
      e.preventDefault();
      select(null, true);
      return post({ t: 'global', which: global.dataset.novaGlobal });
    }
    const block = t.closest<HTMLElement>('[data-nova-block]');
    const el = t.closest<HTMLElement>(PICKABLE);
    const first = selectedEl ? elEl(selectedEl) : null;
    // The click that ends a drag or a resize changes nothing.
    if (afterDrag) {
      afterDrag = false;
      return e.preventDefault();
    }
    if (el && first && e.shiftKey && el !== first && onCanvas(el) && el.parentElement === first.parentElement) {
      e.preventDefault();
      return toggleMulti(el);
    }
    if (el && block?.contains(el)) {
      // Writing a question doesn't fold its answer away; the sign beside it still does.
      if (t.closest('summary') && t.closest('[data-nova-field]')) e.preventDefault();
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

// Right click: select what is under the pointer and let the editor show its menu.
d.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-nova-field]:focus')) return;
  const block = t.closest<HTMLElement>('[data-nova-block]');
  if (!block) return;
  e.preventDefault();
  const el = t.closest<HTMLElement>(PICKABLE);
  if (el && block.contains(el)) {
    select(block.dataset.novaBlock!, false);
    selectEl(el.dataset.novaEl!, true);
  } else {
    if (selectedEl) selectEl(null, false);
    select(block.dataset.novaBlock!, true);
  }
  post({ t: 'context', x: e.clientX, y: e.clientY });
});

d.addEventListener('dblclick', (e) => {
  // Double-click opens a section or a component's original – but selects words in its texts.
  if ((e.target as HTMLElement).closest('[data-nova-field]')) return;
  const ref = (e.target as HTMLElement).closest<HTMLElement>('[data-nova-section]');
  // Inside a page template: the entry's own blocks are edited here, not in the template.
  const own = (e.target as HTMLElement).closest('[data-nova-block]');
  if (ref && own && ref.contains(own)) return;
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
    const r = blocksHost().getBoundingClientRect();
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

/* ---------- entries of a loop: open the one under the pointer ---------- */

// Every card of a loop knows its entry; the copies after the first let the pointer through, so look by position.
function positionEntry(e: PointerEvent) {
  if (e.composedPath().includes(entryBtn)) return;
  const loop = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-nova-kind-el="list"]');
  const card = loop
    ? [...loop.querySelectorAll<HTMLElement>('[data-nova-entry]')].find((c) => {
        const r = c.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      })
    : undefined;
  if (!card || dragging) return entryBtn.classList.remove('on');
  const r = card.getBoundingClientRect();
  const title = card.dataset.novaEntryTitle || 'Eintrag';
  entryBtn.dataset.id = card.dataset.novaEntry;
  entryBtn.dataset.coll = card.dataset.novaColl;
  (entryBtn.querySelector('span') as HTMLElement).textContent = `«${title}» bearbeiten`;
  entryBtn.setAttribute('aria-label', `Eintrag «${title}» bearbeiten`);
  entryBtn.style.top = `${r.top + scrollY + 8}px`;
  entryBtn.style.left = `${r.right - 8}px`;
  entryBtn.classList.add('on');
}
d.addEventListener('pointermove', positionEntry, { passive: true });
d.addEventListener('pointerleave', () => entryBtn.classList.remove('on'));
entryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  entryBtn.classList.remove('on');
  post({ t: 'open-entry', id: entryBtn.dataset.id, collection: entryBtn.dataset.coll });
});

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

// The editor's element toolbar sits right where this bar appears: tell it when the bar comes and goes.
let richShown = false;
new MutationObserver(() => {
  const on = rich.classList.contains('on');
  if (on !== richShown) post({ t: 'rich', on: (richShown = on) });
}).observe(rich, { attributes: true, attributeFilter: ['class'] });

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
  showPages();
  void loadPages().then(showPages);
}
function closeLink(apply: 'set' | 'remove' | null) {
  const range = savedRange;
  rich.classList.remove('linking');
  linkList.classList.remove('on');
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
/* The site's pages under the address field – and, for an address no page has yet, a new page right away. */
const linkList = rich.querySelector('.lnk-list') as HTMLElement;
let sitePages: { path: string; title: string }[] | null = null;
let linkActive = -1;
async function loadPages() {
  if (sitePages) return;
  try {
    const r = await fetch('/api/entries?collection=pages&limit=300', { headers: { 'X-Nova': '1' } });
    const { entries } = (await r.json()) as { entries: { slug: string; title: string }[] };
    sitePages = entries.map((p) => ({ path: p.slug ? `/${p.slug}` : '/', title: p.title }));
  } catch {
    sitePages = [];
  }
}
function option(cls: string, parts: [string, string?]) {
  const b = d.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('role', 'option');
  for (const [i, text] of parts.entries()) {
    if (!text) continue;
    const sp = d.createElement('span');
    if (i === 0 && cls === 'page') sp.className = 'path';
    sp.textContent = text;
    b.append(sp);
  }
  return b;
}
function showPages() {
  if (!rich.classList.contains('linking')) return;
  const typed = linkInput.value.trim();
  const q = typed.toLowerCase();
  const pages = sitePages ?? [];
  const shown = pages.filter((p) => p.path !== typed && (!q || p.path.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))).slice(0, 6);
  const want = pageForLink(typed);
  const taken = !want || pages.some((p) => p.path === `/${want.slug}` || p.title.toLowerCase() === want.title.toLowerCase());
  const items = shown.map((p) => {
    const b = option('page', [p.path, p.title]);
    b.addEventListener('click', () => {
      linkInput.value = p.path;
      closeLink('set');
    });
    return b;
  });
  if (!taken && sitePages) {
    const b = option('new', [`+ Neue Seite «${want.title}» anlegen`]);
    b.addEventListener('click', () => void createPage(want));
    items.push(b);
  }
  linkActive = -1;
  linkList.replaceChildren(...items);
  linkList.classList.toggle('on', items.length > 0);
}
async function createPage(want: { title: string; slug: string }) {
  linkList.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'X-Nova': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: 'pages', slug: want.slug, data: { title: want.title } }),
    });
    const j = (await r.json().catch(() => ({}))) as { entry?: { id: string; slug: string }; error?: string };
    if (!r.ok || !j.entry) throw new Error(j.error || 'Die Seite liess sich nicht anlegen.');
    sitePages = null;
    linkInput.value = `/${j.entry.slug}`;
    closeLink('set');
    post({ t: 'page-created', id: j.entry.id, title: want.title });
  } catch (e) {
    post({ t: 'page-failed', message: (e as Error).message });
  } finally {
    linkList.removeAttribute('aria-busy');
  }
}

// Clicking somewhere else in the page leaves the link field without changes.
linkInput.addEventListener('blur', () => {
  if (!rich.classList.contains('linking')) return;
  rich.classList.remove('linking', 'on');
  linkList.classList.remove('on');
  savedRange = null;
});
linkInput.addEventListener('input', showPages);
linkInput.addEventListener('keydown', (e) => {
  const options = [...linkList.querySelectorAll<HTMLButtonElement>('button')];
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
    e.preventDefault();
    const n = options.length;
    linkActive = e.key === 'ArrowDown' ? (linkActive + 1) % n : (linkActive - 1 + n) % n;
    options.forEach((o, i) => o.setAttribute('aria-selected', String(i === linkActive)));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (options[linkActive]) options[linkActive].click();
    else closeLink('set');
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

/* ---------- contrast: text that is hard to read on what is behind it ---------- */

// Any CSS colour (oklch, color-mix, named …) to sRGB, the way the browser paints it.
const swatch = d.createElement('canvas').getContext('2d', { willReadFrequently: true });
const rgbCache = new Map<string, Rgba | null>();
function rgba(css: string): Rgba | null {
  if (rgbCache.has(css)) return rgbCache.get(css)!;
  let out: Rgba | null = null;
  const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(css);
  if (m) out = { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  else if (swatch) {
    swatch.clearRect(0, 0, 1, 1);
    swatch.fillStyle = '#000';
    swatch.fillStyle = css;
    swatch.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
    out = a ? { r: (r * 255) / a, g: (g * 255) / a, b: (b * 255) / a, a: a / 255 } : { r: 0, g: 0, b: 0, a: 0 };
  }
  rgbCache.set(css, out);
  return out;
}

const overlaps = (a: DOMRect, b: DOMRect) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 && w * h > 0.2 * b.width * b.height;
};

const STATE_CLASSES = ['nova-hover', 'nova-focus', 'nova-active'];

// Blocks and elements with a designed hover look. In the editor their CSS also
// carries a `.nova-hover` rule, which shows that look without the mouse.
function hoverTargets(): HTMLElement[] {
  const out = new Set<HTMLElement>();
  const visit = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        for (const sel of r.selectorText.split(',')) {
          const base = sel.trim();
          if (!base.endsWith('.nova-hover')) continue;
          try {
            main.querySelectorAll<HTMLElement>(base.slice(0, -'.nova-hover'.length)).forEach((x) => out.add(x));
          } catch {
            /* a selector this browser can't take apart */
          }
        }
      } else if (r instanceof CSSGroupingRule) visit(r.cssRules);
    }
  };
  for (const sheet of d.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* stylesheets from another origin can't be read */
    }
  }
  return [...out];
}

function measureContrast(): ContrastIssue[] {
  const root = d.documentElement;
  // Measured without transitions, or colours would be caught halfway.
  root.classList.add('nova-still');
  // The hover look being designed right now is put aside: the normal look is measured as normal.
  const held = STATE_CLASSES.flatMap((c) => [...d.querySelectorAll<HTMLElement>(`.${c}`)].map((x) => [x, c] as const));
  held.forEach(([x, c]) => x.classList.remove(c));
  try {
    const tops = blocks();
    const globals = [...d.querySelectorAll<HTMLElement>('[data-nova-global]')];
    // Pictures, videos and background images: text on them can't be measured from colours.
    const painted = [main, ...globals].flatMap((r) => [...r.querySelectorAll<HTMLElement>('*')]).filter((x) => /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE)$/.test(x.tagName) || getComputedStyle(x).backgroundImage !== 'none');
    const page = rgba(getComputedStyle(d.body).backgroundColor);
    const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
    const found = new Map<string, { strictest: number; issue: ContrastIssue }>();
    const scan = (scope: HTMLElement, hover: boolean) => {
      const global = scope.closest<HTMLElement>('[data-nova-global]')?.dataset.novaGlobal as ContrastIssue['global'];
      const seen = new Set<Element>();
      const walker = d.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || seen.has(el) || !n.textContent?.trim()) continue;
        seen.add(el);
        if (el.closest('script,style,noscript,[hidden],[aria-hidden="true"],.nova-peer,.nova-cmt,nova-chrome')) continue;
        const block = global ? null : tops.find((b) => b.contains(el));
        if (!global && !block) continue;
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (box.width < 2 || box.height < 2 || cs.visibility !== 'visible' || cs.backgroundClip === 'text') continue;
        const fg = rgba(cs.color);
        if (!fg || fg.a < 0.05) continue;
        // Layers behind the text, from the text outwards, until one is solid.
        const layers: Rgba[] = [];
        let solid: Element = root;
        let unknown = false;
        let faded = false;
        for (let a: Element | null = el; a && a !== root; a = a.parentElement) {
          const as = getComputedStyle(a);
          if (Number(as.opacity) < 0.1) faded = true;
          if (as.backgroundImage !== 'none') {
            unknown = true;
            break;
          }
          const c = rgba(as.backgroundColor);
          if (c && c.a > 0) layers.push(c);
          if (c && c.a >= 0.999) {
            solid = a;
            break;
          }
        }
        if (faded || unknown) continue;
        if (painted.some((p) => p !== el && !el.contains(p) && solid.contains(p) && overlaps(p.getBoundingClientRect(), box))) continue;
        let bg = page && page.a >= 0.999 && solid === root ? page : white;
        for (const l of layers.reverse()) bg = composite(l, bg);
        const ratio = contrastRatio(composite(fg, bg), bg);
        const need = needFor(parseFloat(cs.fontSize), Number(cs.fontWeight) || 400);
        if (ratio >= need) continue;
        const els: string[] = [];
        if (block) for (let a: HTMLElement | null = el.closest<HTMLElement>('[data-nova-el]'); a && block.contains(a); a = a.parentElement?.closest<HTMLElement>('[data-nova-el]') ?? null) els.push(a.dataset.novaEl!);
        // Header and footer take their colours from the site design, never from something on this page.
        let own = false;
        if (block) {
          const owner = (els[0] ? elEl(els[0]) : null) ?? block;
          const oc = rgba(getComputedStyle(owner).color);
          own = Boolean(oc && Math.abs(oc.r - fg.r) + Math.abs(oc.g - fg.g) + Math.abs(oc.b - fg.b) < 4);
        }
        // Same colours in the same place: one entry, shown with its worst text, fixed for the strictest limit.
        // A hover look with the colours of the normal one adds nothing new.
        const key = [global ?? block!.dataset.novaBlock, els[0] ?? '', toHex(fg), fg.a.toFixed(2), toHex(bg)].join('|');
        const prev = found.get(key);
        if (hover && prev && !prev.issue.hover) continue;
        const strictest = Math.max(need, prev?.strictest ?? 0);
        const issue: ContrastIssue = {
          block: block?.dataset.novaBlock ?? '',
          els,
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          ratio,
          need,
          fg: toHex(composite(fg, bg)),
          bg: toHex(bg),
          fix: fixColor(fg, bg, strictest),
          own,
          ...(global ? { global } : {}),
          ...(hover ? { hover } : {}),
        };
        found.set(key, { strictest, issue: prev && prev.issue.ratio / prev.issue.need <= ratio / need ? { ...prev.issue, fix: issue.fix } : issue });
      }
    };
    scan(main, false);
    globals.forEach((g) => scan(g, false));
    for (const h of hoverTargets()) {
      h.classList.add('nova-hover');
      scan(h, true);
      h.classList.remove('nova-hover');
      void getComputedStyle(h).color;
    }
    return [...found.values()].map((x) => x.issue).slice(0, 60);
  } finally {
    held.forEach(([x, c]) => x.classList.add(c));
    // Styles settle before transitions come back, so nothing fades in or out.
    void getComputedStyle(root).color;
    root.classList.remove('nova-still');
  }
}

/* ---------- «Prüfung»: what keeps people from using the page (shared/audit.ts) ---------- */

function auditPage(): AuditIssue[] {
  const out: AuditIssue[] = [];
  const at = (x: Element, kind: AuditIssue['kind'], text: string) => {
    const el = x.closest<HTMLElement>('[data-nova-el]')?.dataset.novaEl;
    const block = x.closest<HTMLElement>('[data-nova-block]')?.dataset.novaBlock;
    out.push({ kind, ...(block ? { block } : {}), ...(el ? { el } : {}), text: text.replace(/\s+/g, ' ').trim().slice(0, 80) });
  };
  // What a screen reader would call it.
  const nameOf = (x: Element): string =>
    (x.getAttribute('aria-label') ||
      x.getAttribute('title') ||
      (x.textContent ?? '').trim() ||
      [...x.querySelectorAll('img[alt]')].map((i) => i.getAttribute('alt')).join(' ')
    ).trim();
  // Only what visitors see: not the editor's own markings, not what is shut away for good.
  const seen = (x: Element) => !x.closest('[aria-hidden="true"], template, noscript, .bgm, .el-empty, .el-ph');
  const all = <T extends Element>(sel: string) => [...main.querySelectorAll<T>(sel)].filter(seen);

  for (const img of all<HTMLImageElement>('img')) {
    if (img.closest('a, button') && nameOf(img.closest('a, button')!)) continue;
    if (!img.hasAttribute('alt') || (img.getAttribute('alt') === '' && img.closest('[data-nova-kind-el="image"], .el-gallery, figure'))) at(img, 'img-alt', img.currentSrc.split('/').pop()?.split('?')[0] ?? '');
  }
  for (const a of all<HTMLAnchorElement>('a')) {
    if (!nameOf(a)) at(a, 'link-empty', a.getAttribute('href') ?? '');
    else if (!a.hasAttribute('data-totop') && !a.hasAttribute('data-ia') && (a.getAttribute('href') ?? '#') === '#') at(a, 'link-dead', nameOf(a));
  }
  for (const b of all<HTMLElement>('button, [role="button"]')) if (!nameOf(b)) at(b, 'button-empty', '');
  // The outline: one H1, no steps left out, nothing empty.
  const heads = all<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
  const h1 = heads.filter((h) => h.tagName === 'H1');
  if (!h1.length) out.push({ kind: 'h1-none', text: '' });
  if (h1.length > 1) h1.slice(1).forEach((h) => at(h, 'h1-many', nameOf(h)));
  let last = 0;
  for (const h of heads) {
    const level = Number(h.tagName[1]);
    if (!nameOf(h)) at(h, 'heading-empty', h.tagName);
    else if (last && level > last + 1) at(h, 'heading-skip', `H${last} → H${level}: ${nameOf(h)}`);
    last = level;
  }
  for (const f of all<HTMLInputElement>('input, select, textarea')) {
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(f.type) || f.closest('.cmp')) continue;
    const labelled = f.labels?.length || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title');
    if (!labelled) at(f, 'field-label', f.getAttribute('name') ?? f.getAttribute('placeholder') ?? f.type);
  }
  for (const f of all<HTMLIFrameElement>('iframe')) if (!f.title) at(f, 'iframe-title', f.src);
  // Two of the same id: links and buttons can only reach the first.
  const ids = new Map<string, Element>();
  for (const x of d.querySelectorAll<HTMLElement>('[id]')) {
    if (!x.id || x.closest('nova-chrome')) continue;
    if (ids.has(x.id) && main.contains(x)) at(x, 'id-double', `#${x.id}`);
    else ids.set(x.id, x);
  }
  // Small print and small targets (WCAG: at least 24 × 24 pixels).
  const small = new Set<Element>();
  for (const x of all<HTMLElement>('p, li, span, a, td, figcaption, label')) {
    if (!x.childNodes.length || ![...x.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
    const size = parseFloat(getComputedStyle(x).fontSize);
    if (size && size < 12 && !small.has(x.parentElement!)) {
      small.add(x);
      at(x, 'text-small', `${Math.round(size)}px: ${nameOf(x)}`);
    }
  }
  for (const x of all<HTMLElement>('a, button, [role="button"]')) {
    // Links within a sentence may be small; icon-only targets may not.
    if ((x.textContent ?? '').trim() || !x.querySelector('svg, img')) continue;
    const r = x.getBoundingClientRect();
    if (r.width && r.height && (r.width < 24 || r.height < 24)) at(x, 'target-small', `${Math.round(r.width)} × ${Math.round(r.height)}: ${nameOf(x)}`);
  }
  return out.slice(0, 100);
}

// Measured again shortly after anything on the page changes.
let contrastTimer = 0;
function sendContrast() {
  clearTimeout(contrastTimer);
  contrastTimer = window.setTimeout(() => {
    post({ t: 'contrast', items: measureContrast() });
    post({ t: 'audit', items: auditPage() });
  }, 400);
}
addEventListener('resize', sendContrast);
d.fonts?.ready.then(sendContrast);
// New blocks, re-rendered blocks, typed text and design changes (their style tags) all show up here.
new MutationObserver(sendContrast).observe(main, { childList: true, subtree: true, characterData: true });

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
      for (const c of STATE_CLASSES) if (old.classList.contains(c)) next.classList.add(c);
      const state = widgetState(old);
      old.replaceWith(next);
      setupFields(next);
      setupMotion(next.parentElement ?? main, true);
      setupWidgets(next, true);
      restoreWidgets(next, state);
      applyVariants();
      if (selectedEl) {
        const sel = elEl(selectedEl);
        sel?.setAttribute('data-nova-el-selected', '');
        if (sel) reveal(sel);
      }
      multi.forEach((id) => elEl(id)?.setAttribute('data-nova-el-multi', ''));
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
        else blocksHost().append(next);
      } else list[m.index].before(next);
      main.querySelector('.wrap > .nova-empty:not([data-nova-keep])')?.parentElement?.remove();
      setupFields(next);
      setupMotion(main, true);
      setupWidgets(next, true);
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
      if (hdr || ftr) sendContrast();
      setupFields(main);
      setupMotion(main, true);
      setupWidgets(main, true);
      applyVariants();
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
      multi.forEach((id) => elEl(id)?.setAttribute('data-nova-el-multi', ''));
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
            if (fieldText(f) === v) return;
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
      // Padding dragged on the canvas now comes from the design too.
      const host = blockEl(m.id);
      // And column widths of grids inside.
      host?.querySelectorAll<HTMLElement>('[data-nova-cols]').forEach((x) => {
        x.style.removeProperty('grid-template-columns');
        x.removeAttribute('data-nova-cols');
      });
      // So do height and width.
      if (host?.hasAttribute('data-nova-size')) {
        host.style.removeProperty('min-height');
        host.style.removeProperty('--max');
        host.removeAttribute('data-nova-size');
      }
      if (host) for (const x of [host, ...host.querySelectorAll<HTMLElement>('[data-nova-pad]')]) {
        if (!x.hasAttribute('data-nova-pad')) continue;
        for (const side of SIDES) x.style.removeProperty(PAD_CSS[side]);
        x.removeAttribute('data-nova-pad');
      }
      // Positions set by dragging now come from the design.
      blockEl(m.id)
        ?.querySelectorAll<HTMLElement>('[data-nova-free]')
        .forEach((x) => {
          x.style.removeProperty('left');
          x.style.removeProperty('top');
          x.style.removeProperty('width');
          x.style.removeProperty('height');
          x.removeAttribute('data-nova-free');
        });
      placeEgrip();
      sendRect();
      break;
    }
    case 'align':
      align(m.how as AlignHow);
      break;
    case 'nudge':
      // Arrow keys pressed in the admin around the canvas.
      nudge({ key: String(m.key), shiftKey: Boolean(m.shift), altKey: false, metaKey: false, ctrlKey: false });
      break;
    case 'select-el': {
      if (m.block && selected !== m.block) select(m.block, false);
      selectEl(m.el ?? null, false);
      const el = m.el ? elEl(m.el) : null;
      if (el && m.scroll) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      sendRect();
      break;
    }
    case 'hover-el': {
      // The layers panel points at an element on the page.
      hoverEl?.removeAttribute('data-nova-el-hover');
      hoverEl = m.el ? elEl(m.el) : null;
      if (hoverEl && m.el !== selectedEl) hoverEl.setAttribute('data-nova-el-hover', '');
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
    case 'variant': {
      variantOf.set(m.id, m.variant ?? null);
      applyVariants();
      sendRect();
      sendContrast();
      break;
    }
    case 'show-global': {
      d.querySelector(`[data-nova-global="${m.which === 'footer' ? 'footer' : 'header'}"]`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      break;
    }
    case 'peek':
      peek = new Set((m.ids as string[]) ?? []);
      applyPeek();
      break;
    case 'grid':
      shadow.querySelector('.grid')?.classList.toggle('on', Boolean(m.on));
      break;
    case 'hover-state': {
      // While a state is being designed, the selected block or element shows that look without the mouse or keyboard.
      for (const c of STATE_CLASSES) d.querySelectorAll(`.${c}`).forEach((x) => x.classList.remove(c));
      const el = m.el ? elEl(m.el) : m.id ? blockEl(m.id) : null;
      const c = `nova-${m.state === 'focus' || m.state === 'active' ? m.state : 'hover'}`;
      el?.classList.add(c);
      break;
    }
  }
});

setupMotion(main, true);
setupWidgets(main, true);
// Until here a click on a link would have left the editor: the canvas held links and buttons back (themes.ts).
d.body.setAttribute('data-nova-ready', '');
post({ t: 'ready', blocks: blocks().map((b) => b.dataset.novaBlock) });
sendContrast();
