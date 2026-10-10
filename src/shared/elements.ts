/**
 * Free layout: the «layout» block holds a tree of elements – containers with
 * headings, texts, pictures, buttons, symbols, videos, spaces and lines –
 * each with its own design (shared/design.ts) and animation (shared/motion.ts).
 *
 * The tree lives in the block's props (`els`). It is cleaned on every save
 * (sanitizeEls) and every value is escaped again when it is rendered.
 */
import type { FieldDef } from './fields';
import type { CollectionDef } from './types';
import { cssColor, designCss, designImages, type CompileOptions, type Design, type StyleProps } from './design';
import { motionVars, type Motion } from './motion';
import { safeHref, sanitizePlain, sanitizeRichText } from './richtext';
import { shortId, stripHtml } from './text';

export const EL_KINDS = [
  'box',
  'heading',
  'text',
  'image',
  'button',
  'icon',
  'video',
  'spacer',
  'divider',
  'counter',
  'accordion',
  'tabs',
  'slider',
  'marquee',
  'list',
  'component',
  'entrybody',
  'canvas',
  'shape',
] as const;
export type ElKind = (typeof EL_KINDS)[number];

/** Kinds that hold other elements. */
export const CONTAINERS: readonly ElKind[] = ['box', 'list', 'accordion', 'tabs', 'slider', 'marquee', 'canvas'];
/** Containers made of entries (questions, tabs, slides …): «+» adds one more like the last. */
export const ITEM_CONTAINERS: readonly ElKind[] = ['accordion', 'tabs', 'slider', 'marquee'];
export const isContainer = (kind: ElKind) => CONTAINERS.includes(kind);
/** Where the picker shows a kind. */
export const EL_GROUPS = ['basic', 'media', 'interactive', 'cms'] as const;
export type ElGroup = (typeof EL_GROUPS)[number];
export const EL_GROUP_LABELS: Record<ElGroup, string> = { basic: 'Grundlagen', media: 'Medien', interactive: 'Interaktiv', cms: 'Aus dem CMS' };

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
  /** Inside a CMS list: props filled from the entry (prop → 'title' | 'url' | 'date' | 'field:key'). */
  bind?: Record<string, string>;
  /** A saved style (shared/styles.ts) under the element's own design. */
  use?: string;
}

/**
 * A component is an element tree kept in its own «sections» entry (kind
 * «component»). Instances point to it and may change these props per place.
 */
export const OVERRIDABLE: Partial<Record<ElKind, string[]>> = { heading: ['text'], text: ['html'], image: ['image', 'alt', 'href'], button: ['label', 'href'] };
export type Overrides = Record<string, Record<string, unknown>>;

/**
 * A variant of a component (e.g. «Dunkel», «Klein»): only how its elements look
 * differs – per element the design that departs from the standard.
 */
export interface Variant {
  id: string;
  name: string;
  designs: Record<string, Design>;
}

/** What each kind can take from an entry. */
export const BINDABLE: Partial<Record<ElKind, string[]>> = { heading: ['text'], text: ['html'], image: ['image', 'href'], button: ['label', 'href'], box: ['href'] };
export const LIST_SORTS = ['newest', 'oldest', 'title', 'order'] as const;
const BIND = /^(?:title|url|date|field:[a-z][\w]{0,40})$/;

export interface ElDef {
  kind: ElKind;
  label: string;
  description: string;
  icon: string;
  group: ElGroup;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

export const BOX_TAGS = ['div', 'section', 'article', 'header', 'footer', 'figure', 'aside', 'nav'] as const;
export const BUTTON_VARIANTS = ['primary', 'secondary', 'link'] as const;
export const SPACER_SIZES = ['s', 'm', 'l', 'xl'] as const;
export const TAB_STYLES = ['line', 'pill'] as const;

/** Vector shapes, drawn on a 100×100 grid; line shapes only have a stroke. */
export const SHAPES = {
  rect: { label: 'Rechteck', d: 'M0 0H100V100H0Z' },
  circle: { label: 'Kreis', d: 'M50 0A50 50 0 1 1 49.99 0Z' },
  triangle: { label: 'Dreieck', d: 'M50 2 98 98H2Z' },
  star: { label: 'Stern', d: 'M50 2 61.8 35.6 97.6 35.6 68.5 56.9 79.4 90.4 50 69.8 20.6 90.4 31.5 56.9 2.4 35.6 38.2 35.6Z' },
  blob: { label: 'Klecks', d: 'M53 3C73 4 93 18 96 40C99 62 86 84 64 94C42 104 14 94 5 72C-4 50 6 22 24 11C33 5 43 2 53 3Z' },
  arch: { label: 'Bogen', d: 'M0 100V50A50 50 0 0 1 100 50V100Z' },
  ring: { label: 'Ring', d: 'M50 4A46 46 0 1 1 49.99 4Z', line: true },
  line: { label: 'Linie', d: 'M0 50H100', line: true },
  arrow: { label: 'Pfeil', d: 'M2 50H96M78 32 96 50 78 68', line: true },
  wave: { label: 'Welle', d: 'M0 50C12.5 20 25 20 37.5 50S62.5 80 75 50 87.5 20 100 50', line: true },
} as const satisfies Record<string, { label: string; d: string; line?: boolean }>;
export type ShapeKind = keyof typeof SHAPES;
export const SHAPE_KINDS = Object.keys(SHAPES) as ShapeKind[];
export const MARQUEE_SPEEDS = ['slow', 'medium', 'fast'] as const;

export const EL_DEFS: Record<ElKind, ElDef> = {
  box: {
    kind: 'box',
    group: 'basic',
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
    group: 'basic',
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
    group: 'basic',
    label: 'Text',
    description: 'Absätze mit Fett, Kursiv, Links und Listen.',
    icon: 'text',
    fields: [{ key: 'html', type: 'richtext', label: 'Text', inline: true }],
    defaults: { html: '<p>Hier steht dein Text. Klick hinein und schreib los.</p>' },
  },
  image: {
    kind: 'image',
    group: 'media',
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
    group: 'basic',
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
    group: 'media',
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
    group: 'media',
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
    group: 'basic',
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
    group: 'basic',
    label: 'Linie',
    description: 'Eine feine Trennlinie.',
    icon: 'divider',
    fields: [],
    defaults: {},
  },
  counter: {
    kind: 'counter',
    group: 'interactive',
    label: 'Zähler',
    description: 'Eine grosse Zahl, die hochzählt, sobald man sie sieht.',
    icon: 'counter',
    fields: [
      { key: 'value', type: 'number', label: 'Zahl', min: -1e9, max: 1e9 },
      { key: 'prefix', type: 'text', label: 'Davor', maxLength: 12 },
      { key: 'suffix', type: 'text', label: 'Danach', help: 'Zum Beispiel «+», «%» oder « Jahre».', maxLength: 12 },
      { key: 'duration', type: 'number', label: 'Dauer in Sekunden', min: 0.3, max: 6 },
    ],
    defaults: { value: 1200, prefix: '', suffix: '+', duration: 1.6 },
  },
  accordion: {
    kind: 'accordion',
    group: 'interactive',
    label: 'Akkordeon',
    description: 'Fragen und Antworten zum Aufklappen. Jeder Eintrag ist ein Container: das erste Element ist die Frage, der Rest die Antwort.',
    icon: 'accordion',
    fields: [
      { key: 'single', type: 'boolean', label: 'Nur ein Eintrag offen' },
      { key: 'first', type: 'boolean', label: 'Ersten Eintrag offen zeigen' },
      { key: 'faq', type: 'boolean', label: 'Für Google als FAQ auszeichnen', help: 'Fragen und Antworten können direkt in den Suchergebnissen erscheinen.' },
    ],
    defaults: { single: true, first: false, faq: true },
  },
  tabs: {
    kind: 'tabs',
    group: 'interactive',
    label: 'Reiter',
    description: 'Inhalte zum Umschalten. Jeder Reiter ist ein Container, sein Name steht auf dem Knopf.',
    icon: 'tabs',
    fields: [
      {
        key: 'style',
        type: 'select',
        label: 'Art',
        options: [
          { value: 'line', label: 'Unterstrichen' },
          { value: 'pill', label: 'Knöpfe' },
        ],
        default: 'line',
      },
    ],
    defaults: { style: 'line' },
  },
  slider: {
    kind: 'slider',
    group: 'interactive',
    label: 'Slider',
    description: 'Bilder oder Karten zum Blättern – auf dem Handy mit dem Finger.',
    icon: 'slider',
    fields: [
      { key: 'perView', type: 'number', label: 'Wie viele nebeneinander', help: 'Auf dem Tablet höchstens zwei, auf dem Handy eine.', min: 1, max: 4 },
      { key: 'autoplay', type: 'number', label: 'Automatisch weiter nach Sekunden', help: '0 = nur von Hand. Hält an, solange jemand mit der Maus darauf zeigt.', min: 0, max: 20 },
      { key: 'arrows', type: 'boolean', label: 'Pfeile zeigen' },
      { key: 'dots', type: 'boolean', label: 'Punkte zeigen' },
    ],
    defaults: { perView: 1, autoplay: 0, arrows: true, dots: true },
  },
  marquee: {
    kind: 'marquee',
    group: 'interactive',
    label: 'Laufband',
    description: 'Texte oder Logos, die endlos durchlaufen.',
    icon: 'marquee',
    fields: [
      {
        key: 'speed',
        type: 'select',
        label: 'Tempo',
        options: [
          { value: 'slow', label: 'Gemächlich' },
          { value: 'medium', label: 'Mittel' },
          { value: 'fast', label: 'Schnell' },
        ],
        default: 'medium',
      },
      {
        key: 'direction',
        type: 'select',
        label: 'Richtung',
        options: [
          { value: 'left', label: 'Nach links' },
          { value: 'right', label: 'Nach rechts' },
        ],
        default: 'left',
      },
      { key: 'pause', type: 'boolean', label: 'Anhalten, wenn jemand darauf zeigt' },
    ],
    defaults: { speed: 'medium', direction: 'left', pause: true },
  },
  canvas: {
    kind: 'canvas',
    group: 'basic',
    label: 'Freie Fläche',
    description: 'Elemente frei platzieren wie in Figma – ziehen, überlappen, drehen. Positionen in Prozent, pro Bildschirmgrösse.',
    icon: 'canvas',
    fields: [],
    defaults: {},
  },
  shape: {
    kind: 'shape',
    group: 'media',
    label: 'Form',
    description: 'Rechteck, Kreis, Stern, Klecks, Welle … in jeder Farbe, als Fläche oder Linie.',
    icon: 'shape',
    fields: [],
    defaults: { shape: 'blob', fill: '$accent', stroke: '', strokeWidth: 0 },
  },
  entrybody: {
    kind: 'entrybody',
    group: 'cms',
    label: 'Inhalt des Eintrags',
    description: 'Nur in Seitenvorlagen: der eigene Inhalt jedes Eintrags – seine Blöcke oder Novas ganze Ansicht mit Kaufen, Tickets und Kommentaren.',
    icon: 'page',
    fields: [
      {
        key: 'show',
        type: 'select',
        label: 'Was erscheint',
        options: [
          { value: 'blocks', label: 'Die Blöcke des Eintrags' },
          { value: 'default', label: 'Novas ganze Ansicht (Kaufen, Tickets, Kommentare …)' },
        ],
        default: 'blocks',
        help: 'Hat die Vorlage eine eigene Hauptüberschrift, wird der Titel in Novas Ansicht zur Zwischenüberschrift.',
      },
    ],
    defaults: { show: 'blocks' },
  },
  component: {
    kind: 'component',
    group: 'cms',
    label: 'Komponente',
    description: 'Ein Baustein, den du einmal gestaltest und überall einsetzt. Änderst du das Original, ändert er sich überall.',
    icon: 'component',
    fields: [],
    defaults: { ref: null, overrides: {} },
  },
  list: {
    kind: 'list',
    group: 'cms',
    label: 'Inhalte aus dem CMS',
    description: 'Beiträge, Produkte, Events oder eigene Inhaltstypen – als Liste oder Raster, gestaltet wie du willst.',
    icon: 'database',
    fields: [
      // The choice of content types is filled in by the editor.
      { key: 'collection', type: 'select', label: 'Inhaltstyp', options: [] },
      { key: 'limit', type: 'number', label: 'Wie viele', min: 1, max: 48 },
      {
        key: 'sort',
        type: 'select',
        label: 'Reihenfolge',
        options: [
          { value: 'newest', label: 'Neueste zuerst' },
          { value: 'oldest', label: 'Älteste zuerst' },
          { value: 'title', label: 'Nach Titel' },
          { value: 'order', label: 'Eigene Reihenfolge' },
        ],
        default: 'newest',
      },
      { key: 'category', type: 'text', label: 'Nur aus Kategorie', help: 'Leer = alle.' },
    ],
    defaults: { collection: 'posts', limit: 3, sort: 'newest', category: '' },
  },
};

export function createEl(kind: ElKind, props: Record<string, unknown> = {}, extra: Partial<El> = {}): El {
  if (kind === 'list' && !extra.children) return createList(props, extra);
  const el: El = { id: shortId(8), kind, props: { ...structuredClone(EL_DEFS[kind].defaults), ...props }, ...(isContainer(kind) ? { children: [] } : {}), ...extra };
  if (kind === 'canvas' && !extra.design) el.design = { desktop: { aspect: '16/9' }, mobile: { aspect: '4/5' } };
  if (kind === 'shape' && !extra.design) el.design = { desktop: { aspect: '1/1', width: '160px' } };
  // Entry containers start with something to see.
  if ((ITEM_CONTAINERS as readonly string[]).includes(kind) && !extra.children) el.children = STARTERS[kind as keyof typeof STARTERS]();
  return el;
}

const textEl = (html: string, extra: Partial<El> = {}) => createEl('text', { html }, extra);
const STARTERS = {
  accordion: () =>
    [
      ['Wie lange dauert es?', 'Meist zwei bis drei Wochen – je nach Umfang.'],
      ['Was kostet es?', 'Du bekommst vorher ein festes Angebot, ohne Überraschungen.'],
      ['Kann ich etwas ändern?', 'Ja, bis kurz vor dem Start jederzeit.'],
    ].map(([q, a]) => accordionItem(q, a)),
  tabs: () =>
    ['Übersicht', 'Details', 'Preise'].map((name) =>
      createEl('box', {}, { name, children: [createEl('heading', { text: name, level: '3' }), textEl('<p>Was in diesem Reiter steht.</p>')] }),
    ),
  slider: () =>
    [1, 2, 3].map((n) =>
      createEl(
        'box',
        {},
        {
          name: `Folie ${n}`,
          children: [createEl('image', {}, { design: { desktop: { aspect: '16/9', radius: '$s-3' } } }), createEl('heading', { text: `Folie ${n}`, level: '3' })],
        },
      ),
    ),
  marquee: () =>
    ['Regional', 'Saisonal', 'Handgemacht', 'Seit 1998'].map((w) => textEl(`<p>${w}</p>`, { design: { desktop: { fontSize: '$step-4', weight: 600, font: 'display' } } })),
};

/** One question of an accordion: the first element is the question, the rest the answer. */
export const accordionItem = (q: string, a: string) => createEl('box', {}, { name: 'Frage', children: [createEl('heading', { text: q, level: '3' }), textEl(`<p>${a}</p>`)] });

/** One more entry for an entry container: a copy of the last one, or a fresh one. */
export function newItem(container: El): El {
  const last = container.children?.[container.children.length - 1];
  if (last) {
    const copy = cloneEl(last);
    if (container.kind === 'tabs' || container.kind === 'slider') copy.name = `${container.kind === 'tabs' ? 'Reiter' : 'Folie'} ${(container.children?.length ?? 0) + 1}`;
    return copy;
  }
  const fresh = STARTERS[container.kind as keyof typeof STARTERS]?.()[0];
  return fresh ?? createEl('box');
}

/** The text on a tab's button: its name, else its first heading. */
export function itemLabel(el: El, index: number): string {
  if (el.name) return el.name;
  const h = el.kind === 'heading' ? el : el.children?.find((c) => c.kind === 'heading');
  return (h && String(h.props.text ?? '').trim()) || `Reiter ${index + 1}`;
}

/** A CMS list with a card as its template: picture, title, short text and a link to the entry. */
function createList(props: Record<string, unknown>, extra: Partial<El>): El {
  const card = createEl(
    'box',
    {},
    {
      name: 'Eintrag',
      bind: { href: 'url' },
      design: { desktop: { gap: '$s-3' } },
      children: [
        createEl('image', {}, { bind: { image: 'field:cover' }, design: { desktop: { aspect: '3/2', radius: '$s-3' } } }),
        createEl('heading', { text: 'Titel des Eintrags', level: '3' }, { bind: { text: 'title' } }),
        createEl('text', { html: '<p>Kurzfassung des Eintrags.</p>' }, { bind: { html: 'field:excerpt' } }),
      ],
    },
  );
  return {
    id: shortId(8),
    kind: 'list',
    props: { ...structuredClone(EL_DEFS.list.defaults), ...props },
    design: { desktop: { display: 'grid', columns: 3, gap: '$s-6' }, tablet: { columns: 2 }, mobile: { columns: 1 } },
    children: [card],
    ...extra,
  };
}

/**
 * Where a new element lands on a free canvas: a little offset from the last
 * one, in percent of the canvas so it scales with it.
 */
export function canvasPlacement(el: El, siblings: number): El {
  const at = 8 + (siblings % 6) * 6;
  const width = el.kind === 'shape' ? '18%' : el.kind === 'heading' || el.kind === 'text' ? '40%' : '30%';
  return { ...el, design: { ...el.design, desktop: { ...el.design?.desktop, left: `${at}%`, top: `${at}%`, width } } };
}

/** The template every entry of a list is drawn with. */
export const listTemplate = (list: El): El | null => list.children?.[0] ?? null;

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-place changes of an instance: only texts, pictures and links, cleaned like the props themselves. */
function cleanOverrides(v: unknown): Overrides {
  if (!isObj(v)) return {};
  const out: Overrides = {};
  for (const [id, raw] of Object.entries(v).slice(0, 100)) {
    if (!ID.test(id) || !isObj(raw)) continue;
    const o: Record<string, unknown> = {};
    if (typeof raw.text === 'string') o.text = plain(raw.text, 300);
    if (typeof raw.html === 'string') o.html = sanitizeRichText(raw.html);
    if (typeof raw.label === 'string') o.label = plain(raw.label, 80);
    if (typeof raw.alt === 'string') o.alt = plain(raw.alt, 300);
    if (typeof raw.href === 'string') o.href = href(raw.href) ?? '';
    if (typeof raw.image === 'string' && MEDIA.test(raw.image)) o.image = raw.image;
    if (Object.keys(o).length) out[id] = o;
  }
  return out;
}

/** The component's tree with the instance's own texts, pictures and links. */
export function applyOverrides(els: El[], overrides: Overrides | undefined): El[] {
  if (!overrides || !Object.keys(overrides).length) return els;
  return mapEls(els, (el) => {
    const o = overrides[el.id];
    if (!o) return el;
    const allowed = OVERRIDABLE[el.kind] ?? [];
    const props = { ...el.props };
    for (const [k, v] of Object.entries(o)) if (allowed.includes(k)) props[k] = v;
    return { ...el, props };
  });
}

/** The element tree a component keeps: its first free layout. */
export function componentEls(blocks: { type: string; props: Record<string, unknown> }[] | undefined): El[] {
  const lay = blocks?.find((b) => b.type === 'layout');
  return (lay?.props.els as El[] | undefined) ?? [];
}

/** Its variants. */
export function componentVariants(blocks: { type: string; props: Record<string, unknown> }[] | undefined): Variant[] {
  const lay = blocks?.find((b) => b.type === 'layout');
  return (lay?.props.variants as Variant[] | undefined) ?? [];
}

/** Variants as stored: a dozen at most, named, designs only for elements the component has. */
export function sanitizeVariants(input: unknown, els: El[]): Variant[] {
  if (!Array.isArray(input)) return [];
  const known = new Set<string>();
  walkEls(els, (el) => known.add(el.id));
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const raw of input.slice(0, 12)) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !ID.test(raw.id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const designs: Record<string, Design> = {};
    if (isObj(raw.designs)) for (const [id, d] of Object.entries(raw.designs)) if (known.has(id) && isObj(d)) designs[id] = d as Design;
    out.push({ id: raw.id, name: plain(raw.name, 40) || 'Variante', designs });
  }
  return out;
}

/** A variant's look, for the places that chose it (class `v-<id>` on the place). */
export function variantsCss(variants: Variant[] | undefined, opts: CompileOptions & { forceHover?: string } = {}): string {
  const out: string[] = [];
  for (const v of variants ?? []) {
    if (!ID.test(v.id)) continue;
    for (const [id, d] of Object.entries(v.designs ?? {})) if (ID.test(id)) out.push(designCss(`.v-${v.id} :is(#e-${id},.e-${id})`, d, opts));
  }
  return out.join('');
}

export const variantImages = (variants: Variant[] | undefined): string[] => (variants ?? []).flatMap((v) => Object.values(v.designs ?? {}).flatMap((d) => designImages(d)));

/** Types whose page brings more than text: buying, booking, tickets – a template keeps Nova's view of them. */
const TRANSACTIONAL = new Set(['products', 'events', 'courses', 'properties', 'profiles']);

/**
 * The first draft of a page template: title, short text and picture bound to
 * the entry's fields, then its own content.
 */
export function templateStarter(c: CollectionDef): El[] {
  if (TRANSACTIONAL.has(c.id)) return [createEl('entrybody', { show: 'default' })];
  const lead = c.fields.find((f) => ['excerpt', 'intro', 'summary', 'teaser'].includes(f.key) && ['text', 'textarea', 'richtext'].includes(f.type));
  const pic = c.fields.find((f) => f.type === 'image') ?? c.fields.find((f) => f.type === 'images');
  const date = c.fields.some((f) => f.key === 'date');
  return [
    createEl(
      'box',
      { tag: 'header' },
      {
        name: 'Kopf',
        design: { desktop: { gap: '$s-4', maxWidth: '48rem', ml: 'auto', mr: 'auto', textAlign: 'center', align: 'center' } },
        children: [
          ...(date ? [createEl('text', { html: '<p>Datum</p>' }, { bind: { html: 'date' }, design: { desktop: { color: '$ink-2', fontSize: '$step-n1' } } })] : []),
          createEl('heading', { text: 'Titel des Eintrags', level: '1' }, { bind: { text: 'title' } }),
          ...(lead ? [createEl('text', { html: '<p>Kurzfassung</p>' }, { bind: { html: `field:${lead.key}` }, design: { desktop: { fontSize: '$step-2' } } })] : []),
        ],
      },
    ),
    ...(pic ? [createEl('image', {}, { bind: { image: `field:${pic.key}` }, design: { desktop: { aspect: '16/9', radius: '$s-4' } } })] : []),
    createEl('entrybody', { show: 'blocks' }),
  ];
}

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
    case 'counter': {
      const n = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0;
      return {
        value: Math.min(1e9, Math.max(-1e9, Math.round(n * 100) / 100)),
        prefix: plain(p.prefix, 12),
        suffix: plain(p.suffix, 12),
        duration: typeof p.duration === 'number' ? Math.min(6, Math.max(0.3, p.duration)) : 1.6,
      };
    }
    case 'accordion':
      return { single: p.single !== false, first: p.first === true, faq: p.faq !== false };
    case 'tabs':
      return { style: one(p.style, TAB_STYLES, 'line') };
    case 'slider':
      return {
        perView: typeof p.perView === 'number' ? Math.min(4, Math.max(1, Math.round(p.perView))) : 1,
        autoplay: typeof p.autoplay === 'number' ? Math.min(20, Math.max(0, Math.round(p.autoplay))) : 0,
        arrows: p.arrows !== false,
        dots: p.dots !== false,
      };
    case 'marquee':
      return { speed: one(p.speed, MARQUEE_SPEEDS, 'medium'), direction: p.direction === 'right' ? 'right' : 'left', pause: p.pause !== false };
    case 'entrybody':
      return { show: p.show === 'default' ? 'default' : 'blocks' };
    case 'canvas':
      return {};
    case 'shape':
      return {
        shape: one(p.shape, SHAPE_KINDS, 'blob'),
        fill: typeof p.fill === 'string' && cssColor(p.fill) ? p.fill : '',
        stroke: typeof p.stroke === 'string' && cssColor(p.stroke) ? p.stroke : '',
        strokeWidth: typeof p.strokeWidth === 'number' ? Math.min(40, Math.max(0, Math.round(p.strokeWidth * 2) / 2)) : 0,
      };
    case 'component':
      return {
        ref: typeof p.ref === 'string' && UUID.test(p.ref) ? p.ref : null,
        overrides: cleanOverrides(p.overrides),
        variant: typeof p.variant === 'string' && ID.test(p.variant) ? p.variant : null,
      };
    case 'list':
      return {
        collection: typeof p.collection === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(p.collection) ? p.collection : 'posts',
        limit: typeof p.limit === 'number' ? Math.min(48, Math.max(1, Math.round(p.limit))) : 3,
        sort: one(p.sort, LIST_SORTS, 'newest'),
        category: plain(p.category, 80),
      };
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
    if (typeof raw.use === 'string' && /^[a-z0-9]{6,12}$/.test(raw.use)) el.use = raw.use;
    if (isObj(raw.bind)) {
      const bind = Object.fromEntries(Object.entries(raw.bind).filter(([k, v]) => BINDABLE[kind]?.includes(k) && typeof v === 'string' && BIND.test(v)));
      if (Object.keys(bind).length) el.bind = bind as Record<string, string>;
    }
    if (isContainer(kind)) el.children = sanitizeEls(raw.children, depth + 1, budget, seen);
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
    // Elements inside a CMS list repeat: the class reaches every copy, :is() keeps the weight of an id.
    const sel = `:is(#e-${el.id},.e-${el.id})`;
    const vars = motionVars(el.motion);
    const own = ownVars(el);
    out.push(designCss(sel, el.design, opts));
    if (vars || own) out.push(`${sel}{${[vars, own].filter(Boolean).join(';')}}`);
  });
  return out.join('');
}

/** Settings of a kind that the CSS reads as variables (no inline styles on the page). */
function ownVars(el: El): string {
  const n = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  if (el.kind === 'icon' && typeof el.props.size === 'number') return `--isz:${n(el.props.size, 12, 240, 40)}px`;
  if (el.kind === 'slider') return `--per-d:${Math.round(n(el.props.perView, 1, 4, 1))}`;
  if (el.kind === 'shape') {
    const fill = cssColor(el.props.fill);
    const stroke = cssColor(el.props.stroke);
    const sw = n(el.props.strokeWidth, 0, 40, 0);
    return [fill && `--fill:${fill}`, stroke && `--stroke:${stroke}`, sw > 0 && `--sw:${sw}px`].filter(Boolean).join(';');
  }
  return '';
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
    // Texts bound to entries are placeholders – what visitors read comes from the entries.
    if (el.kind === 'heading' && !el.bind?.text) out.push(String(el.props.text ?? ''));
    if (el.kind === 'text' && !el.bind?.html) out.push(stripHtml(String(el.props.html ?? '')));
    if (el.kind === 'button' && !el.bind?.label) out.push(String(el.props.label ?? ''));
  });
  return out.filter(Boolean).join(' ');
}

export function elementsHeadings(els: El[]): { level: number; text: string; field: string }[] {
  const out: { level: number; text: string; field: string }[] = [];
  const visit = (list: El[], base: string) =>
    list.forEach((el, i) => {
      const path = `${base}.${i}`;
      if (el.kind === 'heading' && !el.bind?.text) out.push({ level: Number(el.props.level) || 2, text: String(el.props.text ?? ''), field: `${path}.props.text` });
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

/** What a new pop-up starts with: a heading, a sentence and a button, centred. */
export const popupStarter = (): El[] => [
  box(
    [
      createEl('heading', { text: 'Schön, dass du da bist', level: '2' }),
      createEl('text', { html: '<p>Ein, zwei Sätze zu deinem Angebot – kurz, denn ein Pop-up unterbricht.</p>' }),
      createEl('button', { label: 'Mehr erfahren' }),
    ],
    { desktop: { gap: '$s-4', align: 'center', textAlign: 'center' } },
  ),
];

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
    description: 'Vier grosse Zahlen, die hochzählen, mit kurzer Erklärung.',
    els: () => [
      box(
        [
          ['25', '', 'Jahre Erfahrung'],
          ['1200', '+', 'zufriedene Kunden'],
          ['4.9', '', 'Sterne bei Google'],
          ['24', ' h', 'Antwortzeit'],
        ].map(([n, suffix, l]) =>
          box([createEl('counter', { value: Number(n), suffix }, { design: { desktop: { color: '$accent' } } }), createEl('text', { html: `<p>${l}</p>` })], {
            desktop: { gap: '$s-2', align: 'center' },
          }),
        ),
        { desktop: { display: 'grid', columns: 4, gap: '$s-6', textAlign: 'center' }, tablet: { columns: 2 }, mobile: { columns: 2, gap: '$s-5' } },
      ),
    ],
  },
  {
    id: 'faq',
    label: 'Häufige Fragen',
    description: 'Fragen zum Aufklappen – erscheinen als FAQ auch bei Google.',
    els: () => [box([createEl('heading', { text: 'Häufige Fragen', level: '2' }), createEl('accordion')], { desktop: { gap: '$s-5', maxWidth: '48rem', ml: 'auto', mr: 'auto' } })],
  },
  {
    id: 'slides',
    label: 'Bilder-Slider',
    description: 'Grosse Bilder zum Durchblättern, mit Pfeilen und Punkten.',
    els: () => [createEl('slider')],
  },
  {
    id: 'tabbed',
    label: 'Reiter',
    description: 'Drei Inhalte nebeneinander zum Umschalten.',
    els: () => [createEl('tabs')],
  },
  {
    id: 'ticker',
    label: 'Laufband',
    description: 'Ein Band mit Stichworten oder Logos, das endlos durchläuft.',
    els: () => [createEl('marquee')],
  },
  {
    id: 'collage',
    label: 'Collage',
    description: 'Bild, Formen und Titel frei übereinander – auf einer freien Fläche.',
    els: () => [
      createEl(
        'canvas',
        {},
        {
          design: { desktop: { aspect: '16/9' }, mobile: { aspect: '3/4' } },
          children: [
            createEl(
              'shape',
              { shape: 'blob', fill: '$accent/30' },
              { design: { desktop: { left: '46%', top: '4%', width: '44%', aspect: '1/1' }, mobile: { left: '20%', top: '2%', width: '80%' } } },
            ),
            createEl(
              'image',
              {},
              { design: { desktop: { left: '52%', top: '14%', width: '36%', aspect: '4/5', radius: '$s-4', rotate: 3 }, mobile: { left: '30%', top: '8%', width: '62%' } } },
            ),
            createEl(
              'heading',
              { text: 'Frisch. Lokal. Mit Liebe.', level: '2' },
              { design: { desktop: { left: '4%', top: '22%', width: '46%', fontSize: '$step-7' }, mobile: { left: '4%', top: '60%', width: '92%', fontSize: '$step-5' } } },
            ),
            createEl(
              'shape',
              { shape: 'wave', fill: '$accent', strokeWidth: 4 },
              { design: { desktop: { left: '4%', top: '64%', width: '18%', aspect: '4/1' }, mobile: { left: '4%', top: '84%', width: '36%' } } },
            ),
            createEl('button', { label: 'Mehr erfahren' }, { design: { desktop: { left: '4%', top: '76%' }, mobile: { left: '4%', top: '91%' } } }),
          ],
        },
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
    id: 'latest',
    label: 'Neueste Beiträge',
    description: 'Die drei neuesten Beiträge als Karten – kommen von selbst nach.',
    els: () => [createEl('heading', { text: 'Aus dem Journal', level: '2' }), createEl('list')],
  },
  {
    id: 'empty',
    label: 'Leer',
    description: 'Ein leerer Container – du baust alles selbst.',
    els: () => [box([createEl('heading', { text: 'Überschrift', level: '2' }), createEl('text')])],
  },
];
