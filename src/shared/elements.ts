/**
 * Free layout: the «layout» block holds a tree of elements – containers with
 * headings, texts, pictures, buttons, symbols, videos, spaces and lines –
 * each with its own design (shared/design.ts) and animation (shared/motion.ts).
 *
 * The tree lives in the block's props (`els`). It is cleaned on every save
 * (sanitizeEls) and every value is escaped again when it is rendered.
 */
import type { FieldDef } from './fields';
import { designCss, designImages, type CompileOptions, type Design, type StyleProps } from './design';
import { motionVars, type Motion } from './motion';
import { safeHref, sanitizePlain, sanitizeRichText } from './richtext';
import { shortId, stripHtml } from './text';

export const EL_KINDS = ['box', 'heading', 'text', 'image', 'button', 'icon', 'video', 'spacer', 'divider'] as const;
export type ElKind = (typeof EL_KINDS)[number];

export interface El {
  id: string;
  kind: ElKind;
  props: Record<string, unknown>;
  design?: Design;
  motion?: Motion;
  /** Containers only. */
  children?: El[];
  /** Own name in the layers panel. */
  name?: string;
}

export interface ElDef {
  kind: ElKind;
  label: string;
  description: string;
  icon: string;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

export const BOX_TAGS = ['div', 'section', 'article', 'header', 'footer', 'figure', 'aside', 'nav'] as const;
export const BUTTON_VARIANTS = ['primary', 'secondary', 'link'] as const;
export const SPACER_SIZES = ['s', 'm', 'l', 'xl'] as const;

export const EL_DEFS: Record<ElKind, ElDef> = {
  box: {
    kind: 'box',
    label: 'Container',
    description: 'Hält andere Elemente – untereinander, nebeneinander oder im Raster.',
    icon: 'box',
    fields: [
      { key: 'href', type: 'url', label: 'Ganzer Container als Link', help: 'Leer lassen, wenn er nirgendwohin führen soll.' },
      {
        key: 'tag',
        type: 'select',
        label: 'Bedeutung für Suchmaschinen',
        options: [
          { value: 'div', label: 'Allgemein' },
          { value: 'section', label: 'Abschnitt' },
          { value: 'article', label: 'Eigenständiger Beitrag' },
          { value: 'header', label: 'Kopf' },
          { value: 'footer', label: 'Fuss' },
          { value: 'figure', label: 'Abbildung' },
          { value: 'aside', label: 'Randnotiz' },
        ],
        default: 'div',
      },
    ],
    defaults: { tag: 'div' },
  },
  heading: {
    kind: 'heading',
    label: 'Überschrift',
    description: 'Ein Titel – von der Seitenüberschrift bis zum Zwischentitel.',
    icon: 'type',
    fields: [
      { key: 'text', type: 'text', label: 'Text', inline: true, maxLength: 300 },
      {
        key: 'level',
        type: 'select',
        label: 'Ebene',
        help: 'Für die Gliederung der Seite. Die Grösse stellst du unter «Design» ein.',
        options: [
          { value: '1', label: 'H1 – Seitentitel' },
          { value: '2', label: 'H2 – Abschnitt' },
          { value: '3', label: 'H3 – Unterabschnitt' },
          { value: '4', label: 'H4 – Kleiner Titel' },
        ],
        default: '2',
      },
    ],
    defaults: { text: 'Überschrift', level: '2' },
  },
  text: {
    kind: 'text',
    label: 'Text',
    description: 'Absätze mit Fett, Kursiv, Links und Listen.',
    icon: 'text',
    fields: [{ key: 'html', type: 'richtext', label: 'Text', inline: true }],
    defaults: { html: '<p>Hier steht dein Text. Klick hinein und schreib los.</p>' },
  },
  image: {
    kind: 'image',
    label: 'Bild',
    description: 'Ein Bild in jeder Grösse, auf Wunsch mit Link.',
    icon: 'image',
    fields: [
      { key: 'image', type: 'image', label: 'Bild' },
      { key: 'alt', type: 'text', label: 'Beschreibung für Blinde und Google', help: 'Leer = die Beschreibung aus der Mediathek.' },
      { key: 'href', type: 'url', label: 'Link' },
    ],
    defaults: { image: null, alt: '' },
  },
  button: {
    kind: 'button',
    label: 'Knopf',
    description: 'Ein Knopf oder Link, der irgendwohin führt.',
    icon: 'button',
    fields: [
      { key: 'label', type: 'text', label: 'Beschriftung', inline: true, maxLength: 80 },
      { key: 'href', type: 'url', label: 'Ziel' },
      {
        key: 'variant',
        type: 'select',
        label: 'Art',
        options: [
          { value: 'primary', label: 'Hauptknopf' },
          { value: 'secondary', label: 'Zweiter Knopf' },
          { value: 'link', label: 'Textlink mit Pfeil' },
        ],
        default: 'primary',
      },
    ],
    defaults: { label: 'Mehr erfahren', href: '/kontakt', variant: 'primary' },
  },
  icon: {
    kind: 'icon',
    label: 'Symbol',
    description: 'Ein Symbol aus der Sammlung, in Akzentfarbe.',
    icon: 'star',
    fields: [
      { key: 'icon', type: 'icon', label: 'Symbol' },
      { key: 'size', type: 'number', label: 'Grösse in Pixel', min: 12, max: 240 },
    ],
    defaults: { icon: 'star', size: 40 },
  },
  video: {
    kind: 'video',
    label: 'Video',
    description: 'YouTube oder Vimeo – lädt erst nach Klick.',
    icon: 'video',
    fields: [
      { key: 'url', type: 'url', label: 'Link zum Video', help: 'YouTube- oder Vimeo-Link einfügen.' },
      { key: 'poster', type: 'image', label: 'Vorschaubild' },
    ],
    defaults: { url: '' },
  },
  spacer: {
    kind: 'spacer',
    label: 'Abstand',
    description: 'Leerer Raum zwischen zwei Elementen.',
    icon: 'spacing',
    fields: [
      {
        key: 'size',
        type: 'select',
        label: 'Höhe',
        options: [
          { value: 's', label: 'Klein' },
          { value: 'm', label: 'Mittel' },
          { value: 'l', label: 'Gross' },
          { value: 'xl', label: 'Sehr gross' },
        ],
        default: 'm',
      },
    ],
    defaults: { size: 'm' },
  },
  divider: {
    kind: 'divider',
    label: 'Linie',
    description: 'Eine feine Trennlinie.',
    icon: 'divider',
    fields: [],
    defaults: {},
  },
};

export function createEl(kind: ElKind, props: Record<string, unknown> = {}, extra: Partial<El> = {}): El {
  return { id: shortId(8), kind, props: { ...structuredClone(EL_DEFS[kind].defaults), ...props }, ...(kind === 'box' ? { children: [] } : {}), ...extra };
}

/* ---------- tree helpers ---------- */

export interface Found {
  el: El;
  parent: El | null;
  index: number;
  /** Path in the block props, e.g. `els.0.children.2`. */
  path: string;
  ancestors: El[];
}

export function findEl(els: El[], id: string, base = 'els', parent: El | null = null, ancestors: El[] = []): Found | null {
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const path = `${base}.${i}`;
    if (el.id === id) return { el, parent, index: i, path, ancestors };
    if (el.children?.length) {
      const hit = findEl(el.children, id, `${path}.children`, el, [...ancestors, el]);
      if (hit) return hit;
    }
  }
  return null;
}

export function walkEls(els: El[], fn: (el: El, depth: number) => void, depth = 0): void {
  for (const el of els) {
    fn(el, depth);
    if (el.children) walkEls(el.children, fn, depth + 1);
  }
}

/** A changed copy of the tree; `fn` returns the new element, or null to remove it. */
export function mapEls(els: El[], fn: (el: El) => El | null): El[] {
  const out: El[] = [];
  for (const el of els) {
    const next = fn(el);
    if (!next) continue;
    out.push(next.children ? { ...next, children: mapEls(next.children, fn) } : next);
  }
  return out;
}

export const updateEl = (els: El[], id: string, fn: (el: El) => El): El[] => mapEls(els, (el) => (el.id === id ? fn(el) : el));
export const removeEl = (els: El[], id: string): El[] => mapEls(els, (el) => (el.id === id ? null : el));

/** Inserts into a container (`parentId`) or at the top level (null). */
export function insertEl(els: El[], parentId: string | null, index: number, el: El): El[] {
  if (parentId === null) {
    const next = [...els];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, el);
    return next;
  }
  return updateEl(els, parentId, (p) => {
    const kids = [...(p.children ?? [])];
    kids.splice(Math.max(0, Math.min(index, kids.length)), 0, el);
    return { ...p, children: kids };
  });
}

/** Moves an element into another place; refuses to put a container into itself. */
export function moveEl(els: El[], id: string, parentId: string | null, index: number): El[] {
  const found = findEl(els, id);
  if (!found) return els;
  if (parentId === id || (parentId && findEl(found.el.children ?? [], parentId))) return els;
  const sameParent = (found.parent?.id ?? null) === parentId;
  const without = removeEl(els, id);
  return insertEl(without, parentId, sameParent && found.index < index ? index - 1 : index, found.el);
}

/** A deep copy with fresh ids (duplicate). */
export function cloneEl(el: El): El {
  return { ...structuredClone(el), id: shortId(8), children: el.children?.map(cloneEl) };
}

export const countEls = (els: El[]) => {
  let n = 0;
  walkEls(els, () => n++);
  return n;
};

/* ---------- cleaning on save ---------- */

const MAX_ELS = 300;
const MAX_DEPTH = 8;
const ID = /^[\w-]{1,24}$/;
const MEDIA = /^[\w-]{1,64}$/;
const plain = (v: unknown, max: number) => sanitizePlain(typeof v === 'string' ? v : '').slice(0, max);
const href = (v: unknown) => (typeof v === 'string' && v.trim() ? (safeHref(v.slice(0, 500)) ?? undefined) : undefined);
const one = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback);
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function cleanProps(kind: ElKind, p: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'box':
      return { tag: one(p.tag, BOX_TAGS, 'div'), href: href(p.href) };
    case 'heading':
      return { text: plain(p.text, 300), level: one(String(p.level ?? '2'), ['1', '2', '3', '4'] as const, '2') };
    case 'text':
      return { html: sanitizeRichText(p.html) };
    case 'image':
      return { image: typeof p.image === 'string' && MEDIA.test(p.image) ? p.image : null, alt: plain(p.alt, 300), href: href(p.href) };
    case 'button':
      return { label: plain(p.label, 80), href: href(p.href), variant: one(p.variant, BUTTON_VARIANTS, 'primary') };
    case 'icon':
      return {
        icon: typeof p.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(p.icon) ? p.icon : 'star',
        size: typeof p.size === 'number' ? Math.min(240, Math.max(12, Math.round(p.size))) : 40,
      };
    case 'video':
      return { url: typeof p.url === 'string' ? p.url.trim().slice(0, 500) : '', poster: typeof p.poster === 'string' && MEDIA.test(p.poster) ? p.poster : null };
    case 'spacer':
      return { size: one(p.size, SPACER_SIZES, 'm') };
    case 'divider':
      return {};
  }
}

/** The element tree as stored: known kinds, clean props, bounded size and depth. */
export function sanitizeEls(input: unknown, depth = 0, budget = { n: MAX_ELS }, seen = new Set<string>()): El[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  const out: El[] = [];
  for (const raw of input) {
    if (budget.n <= 0) break;
    if (!isObj(raw) || !(EL_KINDS as readonly string[]).includes(String(raw.kind))) continue;
    budget.n--;
    const kind = raw.kind as ElKind;
    let id = typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : shortId(8);
    if (seen.has(id)) id = shortId(8);
    seen.add(id);
    const el: El = { id, kind, props: cleanProps(kind, isObj(raw.props) ? raw.props : {}) };
    if (isObj(raw.design)) el.design = raw.design as Design;
    if (isObj(raw.motion)) el.motion = raw.motion as Motion;
    if (typeof raw.name === 'string' && raw.name.trim()) el.name = plain(raw.name, 60);
    if (kind === 'box') el.children = sanitizeEls(raw.children, depth + 1, budget, seen);
    out.push(el);
  }
  return out;
}

/* ---------- CSS of a whole tree ---------- */

/** Each element's design and animation timing, scoped to its id. */
export function elementsCss(els: El[], opts: CompileOptions & { forceHover?: string } = {}): string {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (!ID.test(el.id)) return;
    const sel = `#e-${el.id}`;
    const vars = motionVars(el.motion);
    const icon = el.kind === 'icon' && typeof el.props.size === 'number' ? `--isz:${Math.min(240, Math.max(12, el.props.size))}px` : '';
    out.push(designCss(sel, el.design, opts));
    if (vars || icon) out.push(`${sel}{${[vars, icon].filter(Boolean).join(';')}}`);
  });
  return out.join('');
}

export function elementImages(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (el) => out.push(...designImages(el.design)));
  return out;
}

/* ---------- text, headings, pictures and links (SEO, search, checks) ---------- */

export function elementsText(els: El[]): string {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (el.kind === 'heading') out.push(String(el.props.text ?? ''));
    if (el.kind === 'text') out.push(stripHtml(String(el.props.html ?? '')));
    if (el.kind === 'button') out.push(String(el.props.label ?? ''));
  });
  return out.filter(Boolean).join(' ');
}

export function elementsHeadings(els: El[]): { level: number; text: string; field: string }[] {
  const out: { level: number; text: string; field: string }[] = [];
  const visit = (list: El[], base: string) =>
    list.forEach((el, i) => {
      const path = `${base}.${i}`;
      if (el.kind === 'heading') out.push({ level: Number(el.props.level) || 2, text: String(el.props.text ?? ''), field: `${path}.props.text` });
      if (el.children) visit(el.children, `${path}.children`);
    });
  visit(els, 'els');
  return out;
}

export function elementsMedia(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (el.kind === 'image' && typeof el.props.image === 'string') out.push(el.props.image);
    if (el.kind === 'video' && typeof el.props.poster === 'string') out.push(el.props.poster);
  });
  return out;
}

export function elementsLinks(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (typeof el.props.href === 'string') out.push(el.props.href);
    if (el.kind === 'text') out.push(...[...String(el.props.html ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  });
  return out;
}

/* ---------- ready-made layouts ---------- */

const box = (children: El[], design?: Design, props: Record<string, unknown> = {}, extra: Partial<El> = {}) => createEl('box', props, { children, design, ...extra });
const row = (gap = '$s-6'): StyleProps => ({ display: 'flex', direction: 'row', gap, align: 'center' });
const stackOnPhone: StyleProps = { direction: 'column', align: 'stretch' };

export interface LayoutPreset {
  id: string;
  label: string;
  description: string;
  els: () => El[];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'split',
    label: 'Text und Bild',
    description: 'Titel, Text und Knopf neben einem grossen Bild.',
    els: () => [
      box(
        [
          box([createEl('heading', { text: 'Was uns ausmacht', level: '2' }), createEl('text'), createEl('button')], { desktop: { grow: 1, gap: '$s-5' } }),
          createEl('image', {}, { design: { desktop: { grow: 1, aspect: '4/3', radius: '$s-4' } } }),
        ],
        { desktop: { ...row('$s-7') }, mobile: stackOnPhone },
      ),
    ],
  },
  {
    id: 'cards',
    label: 'Drei Karten',
    description: 'Drei gleich breite Karten mit Symbol, Titel und Text.',
    els: () => [
      createEl('heading', { text: 'Unsere Stärken', level: '2' }, { design: { desktop: { textAlign: 'center' } } }),
      box(
        ['Persönlich', 'Schnell', 'Fair'].map((title) =>
          box(
            [
              createEl('icon', { icon: 'star', size: 36 }),
              createEl('heading', { text: title, level: '3' }),
              createEl('text', { html: '<p>Ein, zwei Sätze dazu, was das für deine Kundschaft bedeutet.</p>' }),
            ],
            {
              desktop: { bg: '$surface', pt: '$s-6', pr: '$s-6', pb: '$s-6', pl: '$s-6', radius: '18px', gap: '$s-3' },
            },
          ),
        ),
        { desktop: { display: 'grid', columns: 3, gap: '$s-5' }, tablet: { columns: 2 }, mobile: { columns: 1 } },
      ),
    ],
  },
  {
    id: 'cta',
    label: 'Aufruf',
    description: 'Grosser Satz in der Mitte mit zwei Knöpfen.',
    els: () => [
      box(
        [
          createEl('heading', { text: 'Bereit für den nächsten Schritt?', level: '2' }, { design: { desktop: { fontSize: '$step-6' } } }),
          createEl('text', { html: '<p>Schreib uns – wir melden uns noch am selben Tag.</p>' }),
          box([createEl('button', { label: 'Kontakt aufnehmen' }), createEl('button', { label: 'Angebot ansehen', href: '/angebot', variant: 'secondary' })], {
            desktop: { ...row('$s-4'), justify: 'center', wrap: true },
          }),
        ],
        { desktop: { align: 'center', textAlign: 'center', gap: '$s-5', maxWidth: '44rem', ml: 'auto', mr: 'auto' } },
      ),
    ],
  },
  {
    id: 'stats',
    label: 'Zahlen',
    description: 'Vier grosse Zahlen mit kurzer Erklärung.',
    els: () => [
      box(
        [
          ['25', 'Jahre Erfahrung'],
          ['1200', 'zufriedene Kunden'],
          ['4.9', 'Sterne bei Google'],
          ['24 h', 'Antwortzeit'],
        ].map(([n, l]) =>
          box([createEl('heading', { text: n, level: '3' }, { design: { desktop: { fontSize: '$step-7', color: '$accent' } } }), createEl('text', { html: `<p>${l}</p>` })], {
            desktop: { gap: '$s-1' },
          }),
        ),
        { desktop: { display: 'grid', columns: 4, gap: '$s-6', textAlign: 'center' }, tablet: { columns: 2 }, mobile: { columns: 2, gap: '$s-5' } },
      ),
    ],
  },
  {
    id: 'cover',
    label: 'Titel über Bild',
    description: 'Ein grosser Titel auf einem Bild, dunkel überlagert.',
    els: () => [
      box(
        [
          createEl('heading', { text: 'Ein Satz, der bleibt.', level: '2' }, { design: { desktop: { fontSize: '$step-7', color: '#ffffff' } } }),
          createEl('text', { html: '<p>Ein kurzer Text darunter, der Lust auf mehr macht.</p>' }, { design: { desktop: { color: '#ffffff', maxWidth: '36rem' } } }),
          createEl('button', { label: 'Jetzt entdecken' }),
        ],
        {
          desktop: { minHeight: '70svh', justify: 'end', gap: '$s-5', pt: '$s-7', pr: '$s-7', pb: '$s-7', pl: '$s-7', radius: '24px', bg: '$inv-bg', overlay: 'rgba(0,0,0,0.35)' },
          mobile: { minHeight: '60svh', pt: '$s-6', pr: '$s-5', pb: '$s-6', pl: '$s-5' },
        },
      ),
    ],
  },
  {
    id: 'empty',
    label: 'Leer',
    description: 'Ein leerer Container – du baust alles selbst.',
    els: () => [box([createEl('heading', { text: 'Überschrift', level: '2' }), createEl('text')])],
  },
];
