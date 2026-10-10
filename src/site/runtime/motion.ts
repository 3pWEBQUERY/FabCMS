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
    }
  }
}
const onScroll = () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
};

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
  const before = scrollers.size;
  for (const el of root.querySelectorAll<HTMLElement>('[data-scroll]')) {
    if (getComputedStyle(el).backgroundImage.includes('url(')) withBg.add(el);
    scrollers.add(el);
  }
  for (const el of scrollers) if (!el.isConnected) scrollers.delete(el);
  if (!before && scrollers.size) {
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
  }
  if (scrollers.size) frame();
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
