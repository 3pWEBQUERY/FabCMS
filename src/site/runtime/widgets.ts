/**
 * Interactive elements of the free layout (shared/elements.ts): tabs, slider
 * and counter. Accordion and marquee need no script. Everything works without
 * it: tabs show all panels one below the other, sliders scroll by finger or
 * trackpad, counters show their final number.
 *
 * Used by the site runtime and by the editor bridge (`edit`: no autoplay, no
 * counting – the editor shows the final state).
 */

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ready = new WeakSet<HTMLElement>();

/* ---------- tabs ---------- */

let uid = 0;
const tabsOf = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>(':scope > .tabs-list > .tab')];
const panelsOf = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>(':scope > [data-tab-panel]')];

/** Shows one tab; `focus` for keyboard use. */
export function showTab(box: HTMLElement, index: number, focus = false, animate = false) {
  const tabs = tabsOf(box);
  const panels = panelsOf(box);
  const i = Math.max(0, Math.min(index, panels.length - 1));
  tabs.forEach((t, n) => {
    t.setAttribute('aria-selected', String(n === i));
    t.tabIndex = n === i ? 0 : -1;
  });
  panels.forEach((p, n) => {
    const was = p.hidden;
    p.hidden = n !== i;
    if (animate && was && n === i && !reduced()) {
      p.classList.remove('tab-enter');
      void p.offsetWidth;
      p.classList.add('tab-enter');
    }
  });
  if (focus) tabs[i]?.focus();
}

export const activeTab = (box: HTMLElement) =>
  Math.max(
    0,
    tabsOf(box).findIndex((t) => t.getAttribute('aria-selected') === 'true'),
  );

function setupTabs(box: HTMLElement, edit: boolean) {
  const tabs = tabsOf(box);
  const panels = panelsOf(box);
  if (!tabs.length) return;
  const base = `nt${++uid}`;
  tabs.forEach((t, i) => {
    const p = panels[i];
    if (!p) return;
    t.id ||= `${base}-t${i}`;
    p.id ||= `${base}-p${i}`;
    t.setAttribute('aria-controls', p.id);
    p.setAttribute('aria-labelledby', t.id);
    p.tabIndex = -1;
    t.addEventListener('click', () => showTab(box, i, false, true));
    t.addEventListener('keydown', (e) => {
      // In the editor the label is being written: arrows move the caret.
      if (edit && t.isContentEditable) return;
      const last = tabs.length - 1;
      const to = e.key === 'ArrowRight' ? (i === last ? 0 : i + 1) : e.key === 'ArrowLeft' ? (i === 0 ? last : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
      if (to < 0) return;
      e.preventDefault();
      showTab(box, to, true, true);
    });
  });
  box.classList.add('tabs-on');
  showTab(box, 0);
}

/* ---------- slider ---------- */

function setupSlider(box: HTMLElement, edit: boolean) {
  const track = box.querySelector<HTMLElement>(':scope > .sl-track');
  if (!track) return;
  const slides = () => [...track.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
  const prev = box.querySelector<HTMLButtonElement>(':scope > .sl-ctrl > .sl-prev');
  const next = box.querySelector<HTMLButtonElement>(':scope > .sl-ctrl > .sl-next');
  const dotsBox = box.querySelector<HTMLElement>(':scope > .sl-ctrl > .sl-dots');
  const label = dotsBox?.dataset.label ?? '{n}';
  // How many fit side by side, and so how many places the slider can stop at.
  const perView = () => {
    const s = slides();
    if (!s.length || !s[0].offsetWidth) return 1;
    return Math.max(1, Math.round((track.clientWidth + 1) / (s[0].offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0))));
  };
  const stops = () => Math.max(1, slides().length - perView() + 1);
  const offset = (i: number) => {
    const s = slides();
    return s[i] ? s[i].offsetLeft - s[0].offsetLeft : 0;
  };
  const current = () => {
    const s = slides();
    let best = 0;
    for (let i = 0; i < s.length; i++) if (Math.abs(offset(i) - track.scrollLeft) < Math.abs(offset(best) - track.scrollLeft)) best = i;
    // At the far end the last places are all «the last stop».
    return track.scrollLeft + track.clientWidth >= track.scrollWidth - 2 ? stops() - 1 : Math.min(best, stops() - 1);
  };
  const go = (i: number) => track.scrollTo({ left: offset(Math.max(0, Math.min(i, stops() - 1))), behavior: reduced() ? 'auto' : 'smooth' });

  let dots: HTMLButtonElement[] = [];
  const paint = () => {
    const n = stops();
    if (dotsBox && dots.length !== n) {
      dotsBox.replaceChildren(
        ...Array.from({ length: n }, (_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'sl-dot';
          b.setAttribute('aria-label', label.replace('{n}', String(i + 1)));
          b.addEventListener('click', () => go(i));
          return b;
        }),
      );
      dots = [...dotsBox.querySelectorAll<HTMLButtonElement>('.sl-dot')];
    }
    const at = current();
    dots.forEach((d, i) => d.setAttribute('aria-current', String(i === at)));
    const loop = Boolean(box.dataset.autoplay);
    if (prev) prev.disabled = !loop && at <= 0;
    if (next) next.disabled = !loop && at >= n - 1;
    box.classList.toggle('sl-on', n > 1);
  };
  prev?.addEventListener('click', () => {
    const at = current();
    go(at <= 0 && box.dataset.autoplay ? stops() - 1 : at - 1);
  });
  next?.addEventListener('click', () => advance());
  const advance = () => {
    const at = current();
    go(at >= stops() - 1 ? 0 : at + 1);
  };
  let raf = 0;
  track.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  new ResizeObserver(paint).observe(track);
  paint();

  // Autoplay: only when visible, never while someone points at it or works in it.
  const secs = Number(box.dataset.autoplay) || 0;
  if (!secs || edit || reduced()) return;
  let held = false;
  let seen = false;
  const hold = (v: boolean) => () => (held = v);
  box.addEventListener('pointerenter', hold(true));
  box.addEventListener('pointerleave', hold(false));
  box.addEventListener('focusin', hold(true));
  box.addEventListener('focusout', hold(false));
  new IntersectionObserver((e) => (seen = e.some((x) => x.isIntersecting)), { threshold: 0.4 }).observe(box);
  setInterval(() => {
    if (!held && seen && !document.hidden) advance();
  }, secs * 1000);
}

/* ---------- counter ---------- */

function format(n: number, dec: number) {
  return n.toLocaleString(document.documentElement.lang || 'de-CH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function count(el: HTMLElement) {
  const num = el.querySelector<HTMLElement>('.cnt-num');
  const to = Number(el.dataset.count) || 0;
  const dec = Number(el.dataset.dec) || 0;
  const dur = Number(el.dataset.dur) || 1600;
  if (!num || reduced()) return;
  // The width of the final number stays reserved: nothing jumps while it counts.
  num.style.minWidth = `${num.getBoundingClientRect().width}px`;
  num.style.display = 'inline-block';
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    num.textContent = format(to * eased, dec);
    if (t < 1) requestAnimationFrame(step);
  };
  num.textContent = format(0, dec);
  requestAnimationFrame(step);
}

let counters: IntersectionObserver | null = null;

/* ---------- all of it ---------- */

export function setupWidgets(root: ParentNode, edit = false) {
  root.querySelectorAll<HTMLElement>('[data-tabs]').forEach((box) => {
    if (ready.has(box)) return;
    ready.add(box);
    setupTabs(box, edit);
  });
  root.querySelectorAll<HTMLElement>('[data-slider]').forEach((box) => {
    if (ready.has(box)) return;
    ready.add(box);
    setupSlider(box, edit);
  });
  if (edit) return;
  counters ??= new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        counters!.unobserve(e.target);
        count(e.target as HTMLElement);
      }),
    { threshold: 0.6 },
  );
  root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    if (ready.has(el)) return;
    ready.add(el);
    counters!.observe(el);
  });
}

/** Brings an element into view inside its tabs, accordion or slider (editor selection). */
export function reveal(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n instanceof HTMLDetailsElement && !n.open) n.open = true;
    if (n.hasAttribute('data-tab-panel') && n.hidden) {
      const box = n.parentElement!;
      showTab(box, panelsOf(box).indexOf(n));
    }
    const track = n.parentElement;
    if (track?.classList.contains('sl-track')) {
      const first = track.firstElementChild as HTMLElement | null;
      const left = n.offsetLeft - (first?.offsetLeft ?? 0);
      if (left < track.scrollLeft || left + n.offsetWidth > track.scrollLeft + track.clientWidth + 2) track.scrollTo({ left, behavior: 'auto' });
    }
  }
}
