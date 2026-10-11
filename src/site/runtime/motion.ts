/**
 * Plays what shared/motion.ts describes: entrances when a block scrolls into
 * view (whole content or item by item), scroll effects and hover effects on
 * items. Used by the site runtime and, for previews, by the editor bridge.
 *
 * Classes (CSS in shared/motion.ts):
 *   anim-ready – the runtime took over (until then the CSS hides the content)
 *   anim-in    – in view: content glides to its place
 *   anim-items / anim-item – items one after another, each with --item-delay
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Items of a block: the largest group of siblings of one kind – cards, list rows, pictures. */
export function itemsOf(block: HTMLElement): HTMLElement[] {
  let best: HTMLElement[] = [];
  for (const el of block.querySelectorAll<HTMLElement>('*')) {
    if (el.children.length < 2 || el.children.length <= best.length) continue;
    const kids = [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT');
    if (kids.length >= 2 && kids.length > best.length && kids.every((k) => k.tagName === kids[0].tagName)) best = kids;
  }
  return best;
}

/** The block's own heading comes first when items enter one by one. */
function headOf(block: HTMLElement, items: HTMLElement[]): HTMLElement | null {
  const h = block.querySelector<HTMLElement>('.bh, header, h2');
  return h && !items.some((i) => h.contains(i) || i.contains(h)) ? h : null;
}

/** Marks items and the content state; idempotent, also after the editor swaps a block. */
export function prepare(el: HTMLElement): number {
  const stagger = Number(el.dataset.animItems) || 0;
  let total = 0;
  if (stagger) {
    // A layout container staggers its own children; a block finds its cards itself.
    const items = el.hasAttribute('data-self') ? [...el.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName !== 'STYLE') : itemsOf(el);
    const head = el.hasAttribute('data-self') ? null : headOf(el, items);
    const list = head ? [head, ...items] : items;
    if (list.length) {
      el.classList.add('anim-items');
      list.forEach((it, i) => {
        it.classList.add('anim-item');
        it.style.setProperty('--item-delay', `calc(var(--anim-delay, 0ms) + ${Math.min(i, 14) * stagger}ms)`);
      });
      total = Math.min(list.length - 1, 14) * stagger;
    }
  }
  el.classList.add('anim-ready');
  const cs = getComputedStyle(el);
  return total + (parseFloat(cs.getPropertyValue('--anim-dur')) || 700) + (parseFloat(cs.getPropertyValue('--anim-delay')) || 0);
}

/** After the entrance, items get their own transitions back (hover effects of the theme). */
function settle(el: HTMLElement, ms: number) {
  if ('animRepeat' in el.dataset) return;
  setTimeout(() => el.querySelectorAll('.anim-item').forEach((i) => i.classList.remove('anim-item')), ms + 120);
}

let io: IntersectionObserver | null = null;
const durations = new WeakMap<HTMLElement, number>();

function observer() {
  return (io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          el.classList.add('anim-in');
          if (!('animRepeat' in el.dataset)) {
            io!.unobserve(el);
            settle(el, durations.get(el) ?? 800);
          }
        } else if ('animRepeat' in el.dataset) el.classList.remove('anim-in');
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.06 },
  ));
}

/* ---------- scroll effects ---------- */

const scrollers = new Set<HTMLElement>();
const scrubbers = new Set<HTMLElement>();
const withBg = new WeakSet<HTMLElement>();
let ticking = false;

function frame() {
  ticking = false;
  const vh = innerHeight;
  for (const el of scrollers) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    // -1: centre of the block at the top edge … 0: centre of the screen … 1: at the bottom edge
    const p = Math.max(-1.5, Math.min(1.5, (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2)));
    const k = (Number(el.dataset.scrollK) || 30) / 100;
    switch (el.dataset.scroll) {
      case 'parallax':
        if (withBg.has(el)) el.style.backgroundPositionY = `calc(50% + ${(p * k * 160).toFixed(1)}px)`;
        else el.style.setProperty('--sy', `${(p * k * 90).toFixed(1)}px`);
        break;
      case 'fade':
        el.style.setProperty('--so', Math.max(0, Math.min(1, 1 + Math.min(0, p) * k * 2.2)).toFixed(3));
        break;
      case 'zoom':
        el.style.setProperty('--ss', (1 - Math.max(0, p) * k * 0.3).toFixed(4));
        break;
      case 'slide':
        el.style.setProperty('--sx', `${(p * k * 140).toFixed(1)}px`);
        break;
      case 'rotate':
        el.style.setProperty('--sr', `${(p * k * 40).toFixed(2)}deg`);
        break;
      case 'blur':
        // Sharp in the middle of the screen, soft towards the edges.
        el.style.setProperty('--sb', `${(Math.min(1, Math.abs(p)) * k * 24).toFixed(1)}px`);
        break;
      case 'color':
        el.style.setProperty('--sg', Math.min(1, Math.abs(p) * (0.6 + k)).toFixed(3));
        break;
      case 'unveil':
        // Opens from a narrow window to the whole picture while it comes up the screen.
        el.style.setProperty('--sc', `${(Math.max(0, Math.min(1, p)) * k * 60).toFixed(1)}%`);
        break;
    }
  }
  for (const el of scrubbers) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) continue;
    // From entering at the bottom to its end passing 40 % of the screen: every word lit.
    const total = Number(el.dataset.words) || 1;
    const p = Math.max(0, Math.min(1, (vh * 0.9 - r.top) / (vh * 0.5 + r.height)));
    el.style.setProperty('--tp', (p * (total + 1)).toFixed(2));
  }
}
const onScroll = () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
};

const followers = new Set<HTMLElement>();
let following = false;

/* ---------- hover effects on items ---------- */

function tilt(item: HTMLElement) {
  item.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = item.getBoundingClientRect();
    item.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width - 0.5) * 9).toFixed(2)}deg`);
    item.style.setProperty('--rx', `${(-((e.clientY - r.top) / r.height - 0.5) * 9).toFixed(2)}deg`);
  });
  item.addEventListener('pointerleave', () => {
    item.style.removeProperty('--rx');
    item.style.removeProperty('--ry');
  });
}

/** Pulls the element a little towards the pointer, and lets go when it leaves. */
function magnet(el: HTMLElement) {
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${Math.max(-14, Math.min(14, (e.clientX - r.left - r.width / 2) * 0.22)).toFixed(1)}px`);
    el.style.setProperty('--my', `${Math.max(-10, Math.min(10, (e.clientY - r.top - r.height / 2) * 0.3)).toFixed(1)}px`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.removeProperty('--mx');
    el.style.removeProperty('--my');
  });
}

/* ---------- texts word by word ---------- */

/** Wraps every word of the text in a span with its number; links and emphasis stay as they are. Returns the count. */
function splitWords(el: HTMLElement): number {
  let i = 0;
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = (child.textContent ?? '').split(/(\s+)/);
        if (!parts.some((x) => x.trim())) continue;
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (!part.trim()) frag.append(part);
          else {
            const w = document.createElement('span');
            w.className = 'tw';
            w.style.setProperty('--i', String(i++));
            w.textContent = part;
            frag.append(w);
          }
        }
        child.replaceWith(frag);
      } else if (child instanceof HTMLElement && !['STYLE', 'SCRIPT', 'SVG', 'IMG', 'BR'].includes(child.tagName)) walk(child);
    }
  };
  walk(el);
  return i;
}

let textIo: IntersectionObserver | null = null;

function setupText(el: HTMLElement) {
  if (el.classList.contains('text-ready')) return;
  const words = splitWords(el);
  if (!words) return;
  el.dataset.words = String(words);
  el.classList.add('text-ready');
  if (el.dataset.text === 'scrub') scrubbers.add(el);
  else
    (textIo ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('text-in');
            textIo!.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )).observe(el);
}

/**
 * Starts everything under `root`. In the editor (`edit`) entrances wait for
 * replay() instead of scrolling, so nothing hides while someone types.
 */
export function setupMotion(root: ParentNode = document, edit = false): void {
  if (reduced()) {
    root.querySelectorAll<HTMLElement>('[data-anim]').forEach((el) => el.classList.add('anim-ready', 'anim-in'));
    return;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-anim]')) {
    // Taking over from the CSS-only waiting state happens without a transition.
    el.classList.add('anim-reset');
    durations.set(el, prepare(el));
    void el.offsetWidth;
    el.classList.remove('anim-reset');
    if (edit) el.classList.add('anim-in');
    else observer().observe(el);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-hover]')) {
    for (const item of itemsOf(el)) {
      if (item.classList.contains('hover-item')) continue;
      item.classList.add('hover-item');
      if (el.dataset.hover === 'tilt') tilt(item);
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-hover-self=tilt],[data-hover-self=magnet]')) {
    if (el.dataset.hoverBound) continue;
    el.dataset.hoverBound = '1';
    if (el.dataset.hoverSelf === 'tilt') tilt(el);
    else magnet(el);
  }
  // Following the mouse across the window – not in the editor, where things are being clicked and dragged.
  if (!edit) {
    for (const el of root.querySelectorAll<HTMLElement>('[data-mouse]')) {
      el.style.setProperty('--mk', String(Number(el.dataset.mouseK) || 30));
      followers.add(el);
    }
    if (followers.size && !following) {
      following = true;
      let frame = 0;
      addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          // -1 … 1 from the middle of the window.
          const px = ((e.clientX / innerWidth - 0.5) * 2).toFixed(3);
          const py = ((e.clientY / innerHeight - 0.5) * 2).toFixed(3);
          for (const el of followers) {
            if (!el.isConnected) followers.delete(el);
            else {
              el.style.setProperty('--px', px);
              el.style.setProperty('--py', py);
            }
          }
        });
      });
    }
  }
  // Texts are split only on the page: in the editor they are being written.
  if (!edit) for (const el of root.querySelectorAll<HTMLElement>('[data-text]')) setupText(el);
  const before = scrollers.size + scrubbers.size;
  for (const el of root.querySelectorAll<HTMLElement>('[data-scroll]')) {
    if (getComputedStyle(el).backgroundImage.includes('url(')) withBg.add(el);
    scrollers.add(el);
  }
  for (const el of scrollers) if (!el.isConnected) scrollers.delete(el);
  if (!before && scrollers.size + scrubbers.size) {
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
  }
  if (scrollers.size + scrubbers.size) frame();
}

/** Editor: plays the entrance of one block again. */
export function replay(el: HTMLElement): void {
  if (reduced() || !el.dataset.anim) return;
  const ms = prepare(el);
  // Jump to the start without a transition, then glide in as on the page.
  el.classList.add('anim-replay', 'anim-reset');
  el.classList.remove('anim-in');
  void el.offsetWidth;
  el.classList.remove('anim-reset');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('anim-in')));
  clearTimeout(Number(el.dataset.replayTimer));
  el.dataset.replayTimer = String(setTimeout(() => el.classList.remove('anim-replay'), ms + 200));
}
