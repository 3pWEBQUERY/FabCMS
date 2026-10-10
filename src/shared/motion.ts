/**
 * Animations of a block or element: how it comes in, what scrolling does
 * with it and how its items react to the mouse. Rendered as data attributes
 * plus a few CSS variables; site/runtime/motion.ts plays them. Without
 * JavaScript, or with «reduce motion» switched on, everything simply shows.
 */

export const ENTER_EFFECTS = ['fade', 'up', 'down', 'left', 'right', 'zoom', 'zoom-out', 'blur', 'flip', 'tilt', 'reveal'] as const;
export const SCROLL_EFFECTS = ['parallax', 'fade', 'zoom', 'slide'] as const;
export const ITEM_HOVERS = ['lift', 'grow', 'glow', 'tilt'] as const;
export const LOOPS = ['float', 'pulse', 'spin', 'wiggle'] as const;
export const EASINGS = {
  smooth: 'cubic-bezier(.2,.7,.2,1)',
  spring: 'cubic-bezier(.34,1.56,.64,1)',
  snappy: 'cubic-bezier(.7,0,.2,1)',
  slow: 'cubic-bezier(.45,0,.2,1)',
  linear: 'linear',
} as const;

export type EnterEffect = (typeof ENTER_EFFECTS)[number];
export type ScrollEffect = (typeof SCROLL_EFFECTS)[number];
export type ItemHover = (typeof ITEM_HOVERS)[number];
export type Loop = (typeof LOOPS)[number];
export type Easing = keyof typeof EASINGS;

export interface Motion {
  enter?: EnterEffect;
  /** ms */
  duration?: number;
  delay?: number;
  /** px the content travels while it comes in */
  distance?: number;
  easing?: Easing;
  /** Items (cards, list rows, pictures) one after another, ms apart. */
  stagger?: number;
  /** Play again every time it scrolls into view. */
  repeat?: boolean;
  scroll?: ScrollEffect;
  /** 1–100 */
  scrollStrength?: number;
  itemHover?: ItemHover;
  /** Elements: a gentle movement that keeps going. */
  loop?: Loop;
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : null);
const one = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);

/** Data attributes for the runtime (validated – only known effects, plain numbers). */
export function motionAttrs(m: Motion | undefined): string {
  if (!m || typeof m !== 'object') return '';
  const out: string[] = [];
  const enter = one(m.enter, ENTER_EFFECTS);
  if (enter) {
    out.push(`data-anim="${enter}"`);
    const st = num(m.stagger, 0, 1000);
    if (st) out.push(`data-anim-items="${st}"`);
    if (m.repeat === true) out.push('data-anim-repeat');
  }
  const scroll = one(m.scroll, SCROLL_EFFECTS);
  if (scroll) out.push(`data-scroll="${scroll}" data-scroll-k="${num(m.scrollStrength, 1, 100) ?? 30}"`);
  const hover = one(m.itemHover, ITEM_HOVERS);
  if (hover) out.push(`data-hover="${hover}"`);
  const loop = one(m.loop, LOOPS);
  if (loop) out.push(`data-loop="${loop}"`);
  return out.join(' ');
}

/** CSS variables with the timing, for the element's own rule. */
export function motionVars(m: Motion | undefined): string {
  if (!m || !one(m.enter, ENTER_EFFECTS)) return '';
  const vars = [
    `--anim-dur:${num(m.duration, 100, 4000) ?? 700}ms`,
    `--anim-delay:${num(m.delay, 0, 5000) ?? 0}ms`,
    `--anim-dist:${num(m.distance, 0, 400) ?? 32}px`,
    `--anim-ease:${EASINGS[one(m.easing, Object.keys(EASINGS) as Easing[]) ?? 'smooth']}`,
  ];
  return vars.join(';');
}

export const hasMotion = (m: Motion | undefined) => Boolean(m && (m.enter || m.scroll || m.itemHover || m.loop));

/**
 * The CSS the runtime relies on; part of the page whenever something moves.
 *
 *   (no class)  – before the runtime runs, animated content waits hidden; a
 *                 4-second fallback and <noscript> make sure it never stays so
 *   anim-ready  – the runtime took over; anim-in: in view, content glides in
 *   anim-items  – items come one after another (anim-item, own --item-delay)
 *   anim-replay – the editor plays an entrance on demand; otherwise the canvas shows everything
 *
 * Scroll effects use the separate translate/scale properties, so they never
 * fight the entrance; «reduce motion» turns all of it off.
 */
export const MOTION_CSS = `
[data-anim]{--anim-t:none;--anim-f:none;--anim-c:none}
[data-anim=up]{--anim-t:translate3d(0,var(--anim-dist,32px),0)}
[data-anim=down]{--anim-t:translate3d(0,calc(-1*var(--anim-dist,32px)),0)}
[data-anim=left]{--anim-t:translate3d(calc(-1*var(--anim-dist,32px)),0,0)}
[data-anim=right]{--anim-t:translate3d(var(--anim-dist,32px),0,0)}
[data-anim=zoom]{--anim-t:scale(.92)}
[data-anim=zoom-out]{--anim-t:scale(1.08)}
[data-anim=blur]{--anim-t:translate3d(0,calc(var(--anim-dist,32px)/3),0);--anim-f:blur(14px)}
[data-anim=flip]{--anim-t:perspective(900px) rotateX(24deg) translate3d(0,var(--anim-dist,32px),0)}
[data-anim=tilt]{--anim-t:rotate(-3deg) translate3d(0,var(--anim-dist,32px),0)}
[data-anim=reveal]{--anim-c:inset(0 0 100% 0)}
[data-anim=left],[data-anim=right],[data-scroll=slide]{overflow-x:clip}
[data-anim]>:not(style),[data-anim] .anim-item{transition:opacity var(--anim-dur,.7s) var(--anim-ease,ease) var(--d,var(--anim-delay,0s)),transform var(--anim-dur,.7s) var(--anim-ease,ease) var(--d,var(--anim-delay,0s)),filter var(--anim-dur,.7s) var(--anim-ease,ease) var(--d,var(--anim-delay,0s)),clip-path var(--anim-dur,.7s) var(--anim-ease,ease) var(--d,var(--anim-delay,0s))}
[data-anim] .anim-item{--d:var(--item-delay,0s)}
.anim-reset>:not(style),.anim-reset .anim-item{transition:none!important}
@media (prefers-reduced-motion:no-preference){
body:not([data-nova-edit]) [data-anim]:not(.anim-ready)>:not(style),body:not([data-nova-edit]) .anim-ready:not(.anim-in):not(.anim-items)>:not(style),body:not([data-nova-edit]) .anim-items:not(.anim-in) .anim-item,[data-nova-edit] .anim-replay:not(.anim-in):not(.anim-items)>:not(style),[data-nova-edit] .anim-replay.anim-items:not(.anim-in) .anim-item{opacity:0;transform:var(--anim-t);filter:var(--anim-f);clip-path:var(--anim-c)}
body:not([data-nova-edit]) [data-anim]:not(.anim-ready)>:not(style){animation:nova-show 0s 4s forwards}
[data-scroll]>:not(style){translate:var(--sx,0) var(--sy,0);scale:var(--ss,1)}
[data-scroll=fade]>:not(style){opacity:var(--so,1)}
[data-loop=float]{animation:nova-float 5s ease-in-out infinite}
[data-loop=pulse]{animation:nova-pulse 2.4s ease-in-out infinite}
[data-loop=spin]{animation:nova-spin 14s linear infinite}
[data-loop=wiggle]{animation:nova-wiggle 3.2s ease-in-out infinite}
}
[data-hover] .hover-item:not(.anim-item){transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s cubic-bezier(.2,.7,.2,1)}
@media (hover:hover) and (prefers-reduced-motion:no-preference){
[data-hover=lift] .hover-item:hover{transform:translateY(-6px);box-shadow:0 18px 40px -16px color-mix(in srgb,var(--ink) 35%,transparent)}
[data-hover=grow] .hover-item:hover{transform:scale(1.035)}
[data-hover=glow] .hover-item:hover{box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent),0 12px 44px -10px color-mix(in srgb,var(--accent) 55%,transparent)}
[data-hover=tilt] .hover-item{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition-duration:.18s}
}
@keyframes nova-show{to{opacity:1;transform:none;filter:none;clip-path:none}}
@keyframes nova-float{50%{translate:0 -10px}}
@keyframes nova-pulse{50%{scale:1.05}}
@keyframes nova-spin{to{rotate:360deg}}
@keyframes nova-wiggle{25%{rotate:-3deg}75%{rotate:3deg}}
`;
