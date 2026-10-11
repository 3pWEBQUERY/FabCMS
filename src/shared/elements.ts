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
import { shortId, slugify, stripHtml } from './text';
import { loopQuery } from './query';
import { cleanConds, type Cond } from './conditions';

export const EL_KINDS = [
  'box',
  'heading',
  'text',
  'image',
  'gallery',
  'button',
  'icon',
  'video',
  'spacer',
  'divider',
  'form',
  'logo',
  'menu',
  'hours',
  'terms',
  'price',
  'addtocart',
  'stock',
  'rating',
  'counter',
  'countdown',
  'toc',
  'share',
  'progress',
  'map',
  'iconlist',
  'compare',
  'headline',
  'hotspots',
  'flipbox',
  'testimonial',
  'accordion',
  'tabs',
  'slider',
  'marquee',
  'list',
  'filter',
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
export const EL_GROUPS = ['basic', 'media', 'interactive', 'cms', 'site', 'shop'] as const;
export type ElGroup = (typeof EL_GROUPS)[number];
export const EL_GROUP_LABELS: Record<ElGroup, string> = { basic: 'Grundlagen', media: 'Medien', interactive: 'Interaktiv', cms: 'Aus dem CMS', site: 'Website', shop: 'Shop' };

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
  /** Buttons: what a click does to another element instead of following a link. */
  act?: { do: ElAct; target: string };
  /** Not shown until a button shows it. */
  hidden?: boolean;
  /** Locked in the layers: the canvas passes it over, so it can't be moved or deleted by accident. */
  pinned?: boolean;
  /** «Sprungmarke»: its id in the page instead of e-…, so links like /seite#team land here. */
  anchor?: string;
  /** Werkbank: CSS of its own («&» is the element) and extra class names. */
  css?: string;
  className?: string;
  /** «Nur zeigen, wenn …»: all of them must hold (shared/conditions.ts). */
  show?: Cond[];
}

export const EL_ACTS = ['toggle', 'show', 'hide'] as const;
export type ElAct = (typeof EL_ACTS)[number];

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
export const BINDABLE: Partial<Record<ElKind, string[]>> = {
  heading: ['text'],
  text: ['html'],
  image: ['image', 'href'],
  button: ['label', 'href'],
  box: ['href'],
  countdown: ['to'],
  gallery: ['images'],
};
const BIND = /^(?:title|url|date|author|readtime|field:[a-z][\w]{0,40}|site:(?:name|tagline|page|phone|phone-link|email|email-link|address|hours|year|copyright|home|logo))$/;

/**
 * Dynamic data from the website itself, for any element anywhere – in a
 * header or footer as on a page. Grouped by what a property takes.
 */
export const SITE_BINDS: Record<'text' | 'href' | 'image' | 'date' | 'images', [string, string][]> = {
  text: [
    ['site:page', 'Titel dieser Seite oder Übersicht'],
    ['site:name', 'Name der Website'],
    ['site:tagline', 'Untertitel der Website'],
    ['site:phone', 'Telefon'],
    ['site:email', 'E-Mail'],
    ['site:address', 'Adresse'],
    ['site:hours', 'Geöffnet oder geschlossen – jetzt'],
    ['site:year', 'Aktuelles Jahr'],
    ['site:copyright', '© Jahr und Name'],
  ],
  href: [
    ['site:home', 'Startseite'],
    ['site:phone-link', 'Anrufen'],
    ['site:email-link', 'E-Mail schreiben'],
  ],
  image: [['site:logo', 'Logo']],
  date: [],
  images: [],
};

/** A piece of the website's own data an element shows. */
export type SiteKey = 'name' | 'tagline' | 'logo' | 'phone' | 'email' | 'address' | 'legal' | 'hours' | 'nav' | 'footer' | 'social';

const FROM_BIND: Record<string, SiteKey> = {
  'site:name': 'name',
  'site:tagline': 'tagline',
  'site:logo': 'logo',
  'site:phone': 'phone',
  'site:phone-link': 'phone',
  'site:email': 'email',
  'site:email-link': 'email',
  'site:address': 'address',
  'site:copyright': 'legal',
  'site:hours': 'hours',
};

/** What of the website's data an element shows: through its bindings, or because it is a logo, opening hours or a menu. */
export function siteDataOf(el: El): SiteKey[] {
  const keys = new Set<SiteKey>();
  for (const v of Object.values(el.bind ?? {})) if (Object.hasOwn(FROM_BIND, v)) keys.add(FROM_BIND[v]);
  if (el.kind === 'logo') {
    keys.add('logo');
    keys.add('name');
  }
  if (el.kind === 'hours') keys.add('hours');
  if (el.kind === 'menu') {
    const source = el.props.source ?? 'main';
    if (source === 'main') keys.add('nav');
    if (source === 'footer') keys.add('footer');
    if (source === 'social') keys.add('social');
  }
  return [...keys];
}

/** What a property takes: a picture, a link, a moment (countdowns), or text. */
export const bindKind = (prop: string): 'text' | 'href' | 'image' | 'date' | 'images' =>
  prop === 'image' ? 'image' : prop === 'href' ? 'href' : prop === 'to' ? 'date' : prop === 'images' ? 'images' : 'text';

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

export const SHARE_WAYS = ['copy', 'mail', 'whatsapp', 'linkedin', 'facebook', 'x'] as const;
export const SHARE_LABELS: Record<(typeof SHARE_WAYS)[number], string> = {
  copy: 'Link kopieren',
  mail: 'E-Mail',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
};

/** Shop elements: a product chosen by hand, else the one of the loop or product page around them. */
const PRODUCT_FIELD: FieldDef = {
  key: 'product',
  type: 'relation',
  collection: 'products',
  label: 'Produkt',
  help: 'Leer = das Produkt der Inhaltsschleife oder der Produktseite.',
};

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
  form: {
    kind: 'form',
    group: 'interactive',
    label: 'Formular',
    description: 'Eines der Formulare aus «Inhalte → Formulare» – mit Spam-Schutz und Eingang im Postfach.',
    icon: 'form',
    fields: [{ key: 'form', type: 'form', label: 'Welches Formular?' }],
    defaults: { form: '' },
  },
  logo: {
    kind: 'logo',
    group: 'site',
    label: 'Logo',
    description: 'Das Logo der Website – oder ihr Name, solange es keines gibt – mit Link zur Startseite.',
    icon: 'home',
    fields: [
      {
        key: 'show',
        type: 'select',
        label: 'Zeigen',
        options: [
          { value: 'auto', label: 'Logo, sonst den Namen' },
          { value: 'name', label: 'Immer den Namen' },
        ],
        default: 'auto',
      },
    ],
    defaults: { show: 'auto' },
  },
  menu: {
    kind: 'menu',
    group: 'site',
    label: 'Menü',
    description:
      'Ein Menü der Website: das Hauptmenü mit Handy-Menü, die Spalten der Fusszeile, die rechtlichen Seiten oder die Social-Links. Gepflegt unter Einstellungen → Navigation.',
    icon: 'nav',
    fields: [
      {
        key: 'source',
        type: 'select',
        label: 'Welches',
        options: [
          { value: 'main', label: 'Hauptmenü' },
          { value: 'footer', label: 'Spalten der Fusszeile' },
          { value: 'legal', label: 'Impressum, Datenschutz, AGB' },
          { value: 'social', label: 'Social Media' },
        ],
        default: 'main',
      },
      { key: 'burger', type: 'boolean', label: 'Auf schmalen Bildschirmen als Menü-Knopf', showIf: { field: 'source', equals: ['main'] } },
      { key: 'extras', type: 'boolean', label: 'Warenkorb, Konto und Sprachen dazu', help: 'Je nachdem, was die Website hat.', showIf: { field: 'source', equals: ['main'] } },
    ],
    defaults: { source: 'main', burger: true, extras: true },
  },
  hours: {
    kind: 'hours',
    group: 'site',
    label: 'Öffnungszeiten',
    description: 'Die Öffnungszeiten aus den Einstellungen, kurz zusammengefasst.',
    icon: 'clock',
    fields: [{ key: 'status', type: 'boolean', label: 'Darüber: jetzt geöffnet oder geschlossen' }],
    defaults: { status: true },
  },
  terms: {
    kind: 'terms',
    group: 'cms',
    label: 'Kategorien-Filter',
    description: 'Die Kategorien eines Inhaltstyps als Links zu seiner Übersicht – in einer Archiv-Vorlage ist die gewählte markiert.',
    icon: 'tag',
    fields: [{ key: 'collection', type: 'select', label: 'Inhaltstyp', options: [], help: 'In einer Archiv-Vorlage: leer = der Inhaltstyp der Übersicht.' }],
    defaults: { collection: '' },
  },
  price: {
    kind: 'price',
    group: 'shop',
    label: 'Preis',
    description: 'Der Preis eines Produkts – mit Statt-Preis und Rabatt, bei Varianten «ab».',
    icon: 'price',
    fields: [
      PRODUCT_FIELD,
      { key: 'compare', type: 'boolean', label: 'Statt-Preis durchgestrichen dazu', width: 'half' },
      { key: 'sale', type: 'boolean', label: 'Rabatt in Prozent zeigen', width: 'half' },
    ],
    defaults: { product: '', compare: true, sale: true },
  },
  addtocart: {
    kind: 'addtocart',
    group: 'shop',
    label: 'In den Warenkorb',
    description: 'Ein Knopf, der das Produkt in den Warenkorb legt – mit Variantenwahl, wo es Varianten gibt. Ausverkauft steht dort «Ausverkauft».',
    icon: 'cart',
    fields: [PRODUCT_FIELD, { key: 'label', type: 'text', label: 'Beschriftung', placeholder: 'In den Warenkorb' }, { key: 'qty', type: 'boolean', label: 'Menge wählen lassen' }],
    defaults: { product: '', label: 'In den Warenkorb', qty: false },
  },
  stock: {
    kind: 'stock',
    group: 'shop',
    label: 'Lagerstatus',
    description: '«An Lager», «Nur noch 3 Stück» oder «Ausverkauft» – immer nach dem aktuellen Bestand.',
    icon: 'box',
    fields: [PRODUCT_FIELD, { key: 'plenty', type: 'boolean', label: 'Auch «An Lager» zeigen', help: 'Sonst nur, wenn es knapp oder weg ist.' }],
    defaults: { product: '', plenty: true },
  },
  rating: {
    kind: 'rating',
    group: 'shop',
    label: 'Sterne',
    description: 'Die Sterne aus den freigegebenen Kundenbewertungen, mit Anzahl.',
    icon: 'star',
    fields: [PRODUCT_FIELD, { key: 'count', type: 'boolean', label: 'Anzahl Bewertungen dazu' }],
    defaults: { product: '', count: true },
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
  gallery: {
    kind: 'gallery',
    group: 'media',
    label: 'Galerie',
    description: 'Mehrere Bilder als Raster, Mosaik oder Streifen – ein Klick öffnet sie gross. Auch die Bilder eines Eintrags, z. B. die Fotos eines Produkts.',
    icon: 'gallery',
    fields: [
      { key: 'images', type: 'images', label: 'Bilder' },
      {
        key: 'layout',
        type: 'select',
        label: 'Anordnung',
        options: [
          { value: 'grid', label: 'Raster, gleich gross' },
          { value: 'mosaic', label: 'Mosaik, wie sie sind' },
          { value: 'strip', label: 'Streifen zum Wischen' },
        ],
        default: 'grid',
      },
      {
        key: 'size',
        type: 'select',
        label: 'Bildgrösse',
        options: [
          { value: 's', label: 'Klein' },
          { value: 'm', label: 'Mittel' },
          { value: 'l', label: 'Gross' },
        ],
        default: 'm',
        showIf: { field: 'layout', equals: ['grid', 'mosaic'] },
      },
      { key: 'lightbox', type: 'boolean', label: 'Beim Klick gross zeigen' },
    ],
    defaults: { images: [], layout: 'grid', size: 'm', lightbox: true },
  },
  filter: {
    kind: 'filter',
    group: 'cms',
    label: 'Filter für Schleife',
    description: 'Suche, Kategorien, Schlagwörter und Reihenfolge, mit denen Besucher eine Inhaltsschleife derselben Fläche eingrenzen.',
    icon: 'filter',
    fields: [
      // The loops of the layout are filled in by the editor.
      { key: 'target', type: 'select', label: 'Welche Schleife', options: [] },
      { key: 'search', type: 'boolean', label: 'Suchfeld' },
      { key: 'placeholder', type: 'text', label: 'Text im Suchfeld', placeholder: 'Suchen …', showIf: { field: 'search', equals: [true] } },
      {
        key: 'category',
        type: 'select',
        label: 'Kategorien',
        options: [
          { value: 'chips', label: 'Als Knöpfe' },
          { value: 'select', label: 'Als Auswahl' },
          { value: 'none', label: 'Nicht zeigen' },
        ],
        default: 'chips',
      },
      { key: 'tag', type: 'boolean', label: 'Schlagwörter als Auswahl' },
      { key: 'sort', type: 'boolean', label: 'Reihenfolge wählbar' },
    ],
    defaults: { target: '', search: true, placeholder: '', category: 'chips', tag: false, sort: false },
  },
  countdown: {
    kind: 'countdown',
    group: 'interactive',
    label: 'Countdown',
    description: 'Zählt Tage, Stunden, Minuten und Sekunden bis zu einem Zeitpunkt – fest gewählt oder aus dem Eintrag, z. B. dem Beginn eines Events.',
    icon: 'clock',
    fields: [
      { key: 'to', type: 'datetime', label: 'Bis', help: 'In der Zeitzone der Website.' },
      {
        key: 'units',
        type: 'select',
        label: 'Zeigen',
        options: [
          { value: 'dhms', label: 'Tage, Stunden, Minuten, Sekunden' },
          { value: 'dhm', label: 'Tage, Stunden, Minuten' },
          { value: 'd', label: 'Nur Tage' },
        ],
        default: 'dhms',
      },
      { key: 'done', type: 'text', label: 'Danach', placeholder: 'z. B. Es hat begonnen!', help: 'Leer = der Countdown verschwindet.' },
    ],
    defaults: { to: '', units: 'dhms', done: '' },
  },
  toc: {
    kind: 'toc',
    group: 'site',
    label: 'Inhaltsverzeichnis',
    description: 'Listet die Zwischentitel der Seite als Sprungmarken – stellt sich selbst zusammen, auch für jeden Beitrag einer Vorlage.',
    icon: 'list',
    fields: [
      { key: 'title', type: 'text', label: 'Überschrift', placeholder: 'Inhalt' },
      {
        key: 'levels',
        type: 'select',
        label: 'Welche Titel',
        options: [
          { value: '2', label: 'Nur Zwischentitel (H2)' },
          { value: '23', label: 'Mit Untertiteln (H2 und H3)' },
        ],
        default: '2',
      },
      { key: 'numbered', type: 'boolean', label: 'Nummeriert' },
    ],
    defaults: { title: 'Inhalt', levels: '2', numbered: false },
  },
  share: {
    kind: 'share',
    group: 'site',
    label: 'Teilen',
    description: 'Links zum Teilen der Seite – oder in einer Schleife des Eintrags. Ohne Skripte von Facebook & Co., ohne Tracking.',
    icon: 'external',
    fields: [
      { key: 'label', type: 'text', label: 'Beschriftung', placeholder: 'Teilen' },
      {
        key: 'networks',
        type: 'multiselect',
        label: 'Wege',
        options: SHARE_WAYS.map((value) => ({ value, label: SHARE_LABELS[value] })),
      },
    ],
    defaults: { label: 'Teilen', networks: ['copy', 'mail', 'whatsapp', 'linkedin'] },
  },
  map: {
    kind: 'map',
    group: 'site',
    label: 'Karte',
    description: 'Eine Karte von OpenStreetMap mit Stecknadel – der Standort der Website oder ein eigener Ort. Lädt erst nach einem Klick, ohne Cookies.',
    icon: 'map',
    fields: [
      {
        key: 'zoom',
        type: 'select',
        label: 'Ausschnitt',
        options: [
          { value: '13', label: 'Stadt' },
          { value: '15', label: 'Quartier' },
          { value: '16', label: 'Strasse' },
          { value: '17', label: 'Gebäude' },
        ],
        default: '16',
      },
      { key: 'height', type: 'number', label: 'Höhe in Pixeln', min: 200, max: 800, default: 380 },
      { key: 'route', type: 'boolean', label: 'Darunter «Route planen»' },
    ],
    defaults: { place: '', lat: null, lng: null, zoom: '16', height: 380, route: true },
  },
  iconlist: {
    kind: 'iconlist',
    group: 'basic',
    label: 'Icon-Liste',
    description: 'Eine Aufzählung mit einem Symbol vor jedem Eintrag – für Vorteile, Leistungen oder Kontaktdaten, auf Wunsch verlinkt.',
    icon: 'list',
    fields: [
      {
        key: 'items',
        type: 'group',
        label: 'Einträge',
        fields: [
          { key: 'icon', type: 'icon', label: 'Symbol' },
          { key: 'text', type: 'text', label: 'Text' },
          { key: 'href', type: 'url', label: 'Link' },
        ],
      },
      {
        key: 'layout',
        type: 'select',
        label: 'Anordnung',
        options: [
          { value: 'column', label: 'Untereinander' },
          { value: 'row', label: 'Nebeneinander' },
        ],
        default: 'column',
      },
      { key: 'size', type: 'number', label: 'Symbolgrösse in Pixeln', min: 12, max: 64, default: 20 },
    ],
    defaults: {
      items: [
        { icon: 'check', text: 'Frisch und saisonal', href: '' },
        { icon: 'check', text: 'Aus der Region', href: '' },
        { icon: 'check', text: 'Mit Liebe gekocht', href: '' },
      ],
      layout: 'column',
      size: 20,
    },
  },
  headline: {
    kind: 'headline',
    group: 'basic',
    label: 'Animierte Überschrift',
    description: 'Ein Titel, in dem Wörter wechseln («Wir backen Brot – Zöpfe – Torten») oder ein Wort von Hand unterstrichen oder umkreist wird.',
    icon: 'type',
    fields: [
      { key: 'before', type: 'text', label: 'Text davor', inline: true, maxLength: 200 },
      { key: 'words', type: 'textarea', label: 'Hervorgehobene Wörter', help: 'Ein Wort oder Ausdruck pro Zeile, höchstens acht.', maxLength: 400 },
      { key: 'after', type: 'text', label: 'Text danach', inline: true, maxLength: 200 },
      {
        key: 'mode',
        type: 'select',
        label: 'Wirkung',
        options: [
          { value: 'rotate', label: 'Wörter wechseln' },
          { value: 'highlight', label: 'Wort hervorheben' },
        ],
        default: 'rotate',
      },
      {
        key: 'effect',
        type: 'select',
        label: 'Wechsel',
        options: [
          { value: 'slide', label: 'Hochrollen' },
          { value: 'fade', label: 'Überblenden' },
          { value: 'wipe', label: 'Aufdecken' },
        ],
        default: 'slide',
        showIf: { field: 'mode', equals: ['rotate'] },
      },
      { key: 'seconds', type: 'number', label: 'Sekunden pro Wort', min: 1, max: 8, default: 2.5, showIf: { field: 'mode', equals: ['rotate'] } },
      {
        key: 'shape',
        type: 'select',
        label: 'Form',
        options: [
          { value: 'underline', label: 'Unterstrichen' },
          { value: 'circle', label: 'Umkreist' },
          { value: 'marker', label: 'Leuchtstift' },
          { value: 'strike', label: 'Durchgestrichen' },
        ],
        default: 'underline',
        showIf: { field: 'mode', equals: ['highlight'] },
      },
      { key: 'accent', type: 'boolean', label: 'Wörter in der Akzentfarbe' },
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
    defaults: {
      before: 'Wir backen',
      words: 'Brot\nZöpfe\nTorten',
      after: 'jeden Morgen frisch.',
      mode: 'rotate',
      effect: 'slide',
      seconds: 2.5,
      shape: 'underline',
      accent: true,
      level: '2',
    },
  },
  testimonial: {
    kind: 'testimonial',
    group: 'basic',
    label: 'Kundenstimme',
    description: 'Ein Zitat von Gästen oder Kundinnen – mit Sternen, Foto, Name und Zusatz.',
    icon: 'quote',
    fields: [
      { key: 'quote', type: 'textarea', label: 'Zitat', inline: true, maxLength: 600 },
      { key: 'name', type: 'text', label: 'Name', inline: true, maxLength: 80 },
      { key: 'role', type: 'text', label: 'Zusatz', inline: true, placeholder: 'z. B. Stammgast seit 2019', maxLength: 80 },
      { key: 'photo', type: 'image', label: 'Foto' },
      { key: 'stars', type: 'number', label: 'Sterne', help: '0 zeigt keine.', min: 0, max: 5, default: 5 },
      {
        key: 'look',
        type: 'select',
        label: 'Aussehen',
        options: [
          { value: 'card', label: 'Karte' },
          { value: 'plain', label: 'Schlicht' },
          { value: 'center', label: 'Zentriert, gross' },
        ],
        default: 'card',
      },
    ],
    defaults: { quote: 'Hier stimmt einfach alles – vom ersten Kaffee bis zum Dessert.', name: 'Vorname N.', role: '', photo: null, stars: 5, look: 'card' },
  },
  flipbox: {
    kind: 'flipbox',
    group: 'interactive',
    label: 'Flip-Box',
    description: 'Eine Karte mit Vorder- und Rückseite: beim Darüberfahren oder Antippen dreht sie sich und zeigt mehr – mit Knopf.',
    icon: 'rotate',
    fields: [
      { key: 'image', type: 'image', label: 'Bild vorne', help: 'Füllt die Vorderseite, abgedunkelt für den Text.' },
      { key: 'icon', type: 'icon', label: 'Symbol vorne' },
      { key: 'title', type: 'text', label: 'Titel vorne', inline: true, maxLength: 120 },
      { key: 'text', type: 'textarea', label: 'Text vorne', inline: true, maxLength: 300 },
      { key: 'backTitle', type: 'text', label: 'Titel hinten', inline: true, maxLength: 120 },
      { key: 'backText', type: 'textarea', label: 'Text hinten', inline: true, maxLength: 500 },
      { key: 'label', type: 'text', label: 'Knopf hinten', maxLength: 60 },
      { key: 'href', type: 'url', label: 'Link des Knopfs' },
      {
        key: 'effect',
        type: 'select',
        label: 'Wechsel',
        options: [
          { value: 'flip', label: 'Drehen (seitlich)' },
          { value: 'flipup', label: 'Drehen (nach oben)' },
          { value: 'fade', label: 'Überblenden' },
        ],
        default: 'flip',
      },
      { key: 'height', type: 'number', label: 'Höhe in Pixeln', min: 160, max: 700, default: 300 },
    ],
    defaults: {
      image: null,
      icon: 'star',
      title: 'Frisch vom Markt',
      text: 'Was heute auf den Teller kommt',
      backTitle: 'Jeden Morgen eingekauft',
      backText: 'Gemüse und Kräuter aus der Region, Fisch vom See – die Karte wechselt mit der Saison.',
      label: 'Zur Karte',
      href: '',
      effect: 'flip',
      height: 300,
    },
  },
  hotspots: {
    kind: 'hotspots',
    group: 'media',
    label: 'Hinweispunkte',
    description: 'Ein Bild mit Punkten darauf, die beim Antippen eine kurze Erklärung zeigen – für Zimmer, Produkte, Pläne oder ein Team-Foto.',
    icon: 'pin',
    fields: [
      { key: 'image', type: 'image', label: 'Bild' },
      { key: 'alt', type: 'text', label: 'Was das Bild zeigt', help: 'Für Screenreader und Suchmaschinen.' },
      {
        key: 'points',
        type: 'group',
        label: 'Punkte',
        itemLabel: 'Punkt',
        help: 'Tipp oben ins Bild, um einen Punkt zu setzen; ziehen verschiebt ihn.',
        fields: [
          { key: 'title', type: 'text', label: 'Titel' },
          { key: 'text', type: 'textarea', label: 'Text' },
          { key: 'href', type: 'url', label: 'Link' },
        ],
      },
      {
        key: 'marker',
        type: 'select',
        label: 'Punkte zeigen',
        options: [
          { value: 'plus', label: 'Plus' },
          { value: 'number', label: 'Nummern' },
          { value: 'dot', label: 'Punkt' },
        ],
        default: 'plus',
      },
      { key: 'pulse', type: 'boolean', label: 'Punkte pulsieren sanft' },
    ],
    defaults: { image: null, alt: '', points: [], marker: 'plus', pulse: true },
  },
  compare: {
    kind: 'compare',
    group: 'media',
    label: 'Vorher/Nachher',
    description: 'Zwei Bilder übereinander mit einem Schieber dazwischen – für Renovationen, Frisuren, Gärten.',
    icon: 'compare',
    fields: [
      { key: 'before', type: 'image', label: 'Bild vorher' },
      { key: 'after', type: 'image', label: 'Bild nachher', help: 'Am besten im gleichen Ausschnitt fotografiert.' },
      { key: 'alt', type: 'text', label: 'Was die Bilder zeigen', help: 'Für Screenreader, z. B. «Badezimmer vor und nach dem Umbau».' },
      { key: 'beforeLabel', type: 'text', label: 'Beschriftung vorher' },
      { key: 'afterLabel', type: 'text', label: 'Beschriftung nachher' },
      { key: 'start', type: 'number', label: 'Schieber am Anfang in Prozent', min: 0, max: 100, default: 50 },
      {
        key: 'ratio',
        type: 'select',
        label: 'Format',
        options: [
          { value: '3/2', label: 'Quer 3:2' },
          { value: '16/9', label: 'Breit 16:9' },
          { value: '4/3', label: 'Quer 4:3' },
          { value: '1/1', label: 'Quadrat' },
          { value: '3/4', label: 'Hoch 3:4' },
        ],
        default: '3/2',
      },
    ],
    defaults: { before: null, after: null, alt: '', beforeLabel: 'Vorher', afterLabel: 'Nachher', start: 50, ratio: '3/2' },
  },
  progress: {
    kind: 'progress',
    group: 'site',
    label: 'Lesefortschritt',
    description: 'Ein dünner Balken am Bildschirmrand, der beim Lesen wächst – ideal in der Vorlage für Beiträge.',
    icon: 'scroll',
    fields: [
      {
        key: 'place',
        type: 'select',
        label: 'Wo',
        options: [
          { value: 'top', label: 'Oben' },
          { value: 'bottom', label: 'Unten' },
        ],
        default: 'top',
        width: 'half',
      },
      { key: 'size', type: 'number', label: 'Dicke in Pixeln', min: 2, max: 12, width: 'half' },
    ],
    defaults: { place: 'top', size: 4 },
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
    label: 'Inhaltsschleife',
    description: 'Holt Einträge aus dem CMS nach deinen Regeln – Filter, Reihenfolge, Blättern – und zeigt jeden im Design des ersten.',
    icon: 'database',
    fields: [
      {
        key: 'archive',
        type: 'boolean',
        label: 'Dieses Archiv zeigen',
        help: 'In einer Archiv-Vorlage: Inhaltstyp, Kategorie, Schlagwort und Seite kommen aus der Adresse der Übersicht.',
      },
      // The choices of content types and fields are filled in by the editor.
      { key: 'collection', type: 'select', label: 'Inhaltstyp', options: [] },
      { key: 'limit', type: 'number', label: 'Wie viele', min: 1, max: 48, width: 'half' },
      {
        key: 'offset',
        type: 'number',
        label: 'Überspringen',
        min: 0,
        max: 200,
        width: 'half',
        help: 'Die ersten so viele auslassen – z. B. wenn eine zweite Schleife sie schon zeigt.',
      },
      {
        key: 'sort',
        type: 'select',
        label: 'Reihenfolge',
        options: [
          { value: 'newest', label: 'Neueste zuerst' },
          { value: 'oldest', label: 'Älteste zuerst' },
          { value: 'title', label: 'Nach Titel' },
          { value: 'order', label: 'Eigene Reihenfolge' },
          { value: 'field-asc', label: 'Nach einem Feld, aufsteigend' },
          { value: 'field-desc', label: 'Nach einem Feld, absteigend' },
          { value: 'random', label: 'Zufällig' },
        ],
        default: 'newest',
      },
      { key: 'sortField', type: 'select', label: 'Feld', options: [], showIf: { field: 'sort', equals: ['field-asc', 'field-desc'] } },
      { key: 'category', type: 'text', label: 'Nur aus Kategorie', help: 'Leer = alle.', width: 'half' },
      { key: 'tag', type: 'text', label: 'Nur mit Schlagwort', help: 'Leer = alle.', width: 'half' },
      {
        key: 'time',
        type: 'select',
        label: 'Zeitraum',
        options: [
          { value: 'all', label: 'Alle' },
          { value: 'upcoming', label: 'Nur kommende' },
          { value: 'past', label: 'Nur vergangene' },
        ],
        default: 'all',
        help: 'Für Inhalte mit Datum, z. B. Events und Kurse.',
      },
      {
        key: 'related',
        type: 'select',
        label: 'Wie der Eintrag dieser Seite',
        options: [
          { value: 'none', label: 'Egal' },
          { value: 'category', label: 'Gleiche Kategorie' },
          { value: 'tags', label: 'Mindestens ein gleiches Schlagwort' },
        ],
        default: 'none',
        help: 'Auf Eintragsseiten und in Seitenvorlagen – für «Mehr zum Thema».',
      },
      { key: 'excludeCurrent', type: 'boolean', label: 'Den Eintrag dieser Seite auslassen' },
      {
        key: 'shop',
        type: 'select',
        label: 'Welche Produkte',
        options: [
          { value: 'all', label: 'Alle' },
          { value: 'sale', label: 'Im Angebot (mit Statt-Preis)' },
          { value: 'bestseller', label: 'Bestseller der letzten 90 Tage' },
          { value: 'related', label: 'Passt zum Produkt dieser Seite' },
          { value: 'instock', label: 'Nur was an Lager ist' },
        ],
        default: 'all',
        showIf: { field: 'collection', equals: ['products'] },
      },
      { key: 'paginate', type: 'boolean', label: 'Blättern', help: 'Links «Zurück» und «Weiter» unter der Liste, wenn es mehr gibt.' },
      { key: 'empty', type: 'text', label: 'Wenn nichts passt', placeholder: 'z. B. Zurzeit keine Termine.', help: 'Leer = die Schleife verschwindet dann ganz.' },
    ],
    defaults: {
      archive: false,
      collection: 'posts',
      limit: 3,
      offset: 0,
      sort: 'newest',
      sortField: '',
      category: '',
      tag: '',
      rules: [],
      related: 'none',
      excludeCurrent: false,
      time: 'all',
      paginate: false,
      shop: 'all',
      empty: '',
    },
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
  // New ids; a button aiming at an element of the same copy aims at its copy.
  const ids = new Map<string, string>();
  const copy = (x: El): El => {
    const id = shortId(8);
    ids.set(x.id, id);
    // A «Sprungmarke» stays with the original: two of the same can't be jumped to.
    const { anchor, ...rest } = structuredClone(x);
    void anchor;
    return { ...rest, id, children: x.children?.map(copy) };
  };
  const out = copy(el);
  const retarget = (x: El): El => ({
    ...x,
    ...(x.act && ids.has(x.act.target) ? { act: { ...x.act, target: ids.get(x.act.target)! } } : {}),
    children: x.children?.map(retarget),
  });
  return retarget(out);
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
const productRef = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : '');
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const MAX_HOTSPOTS = 12;
/** A spot on a picture, in percent of its width or height (one decimal); anything else – the middle. */
const pct = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v * 10) / 10)) : 50);

/** The changing or highlighted words of an «Animierte Überschrift»: one per line, at most eight. */
export const headlineWords = (v: unknown): string[] =>
  sanitizePlain(typeof v === 'string' ? v : '', true)
    .split('\n')
    .map((w) => w.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);

/** All of an «Animierte Überschrift» as one sentence – what search engines, screen readers and checks read. */
export function headlineText(p: Record<string, unknown>): string {
  const words = headlineWords(p.words);
  return [p.before, p.mode === 'highlight' ? words.join(' ') : words.join(', '), p.after]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function cleanProps(kind: ElKind, p: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'box':
      return { tag: one(p.tag, BOX_TAGS, 'div'), href: href(p.href) };
    case 'heading':
      return { text: plain(p.text, 300), level: one(String(p.level ?? '2'), ['1', '2', '3', '4'] as const, '2') };
    case 'text':
      return { html: sanitizeRichText(p.html) };
    case 'image':
      return { image: typeof p.image === 'string' && MEDIA.test(p.image) ? p.image : null, alt: plain(p.alt, 300), href: href(p.href), ...focusOf(p.focus) };
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
    case 'logo':
      return { show: one(p.show, ['auto', 'name'] as const, 'auto') };
    case 'menu':
      return { source: one(p.source, ['main', 'footer', 'legal', 'social'] as const, 'main'), burger: p.burger !== false, extras: p.extras !== false };
    case 'hours':
      return { status: p.status !== false };
    case 'terms':
      return { collection: typeof p.collection === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(p.collection) ? p.collection : '' };
    case 'gallery':
      return {
        images: Array.isArray(p.images) ? p.images.filter((x): x is string => typeof x === 'string' && MEDIA.test(x)).slice(0, 60) : [],
        layout: one(p.layout, ['grid', 'mosaic', 'strip'] as const, 'grid'),
        size: one(p.size, ['s', 'm', 'l'] as const, 'm'),
        lightbox: p.lightbox !== false,
      };
    case 'filter':
      return {
        target: typeof p.target === 'string' && ID.test(p.target) ? p.target : '',
        search: p.search !== false,
        placeholder: plain(p.placeholder, 60),
        category: one(p.category, ['chips', 'select', 'none'] as const, 'chips'),
        tag: p.tag === true,
        sort: p.sort === true,
      };
    case 'countdown':
      return {
        to: typeof p.to === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.to.slice(0, 16)) ? p.to.slice(0, 16) : '',
        units: one(p.units, ['dhms', 'dhm', 'd'] as const, 'dhms'),
        done: plain(p.done, 120),
      };
    case 'toc':
      return { title: plain(p.title, 60), levels: one(String(p.levels ?? '2'), ['2', '23'] as const, '2'), numbered: p.numbered === true };
    case 'share': {
      const ways = Array.isArray(p.networks) ? SHARE_WAYS.filter((w) => (p.networks as unknown[]).includes(w)) : [];
      return { label: plain(p.label, 40), networks: ways.length ? ways : ['copy', 'mail'] };
    }
    case 'progress':
      return { place: one(p.place, ['top', 'bottom'] as const, 'top'), size: typeof p.size === 'number' ? Math.min(12, Math.max(2, Math.round(p.size))) : 4 };
    case 'map': {
      // A place of its own needs both coordinates (found in the editor); otherwise the website's location.
      const lat = typeof p.lat === 'number' && Math.abs(p.lat) <= 90 ? Math.round(p.lat * 1e6) / 1e6 : null;
      const lng = typeof p.lng === 'number' && Math.abs(p.lng) <= 180 ? Math.round(p.lng * 1e6) / 1e6 : null;
      const own = lat !== null && lng !== null;
      return {
        place: own ? plain(p.place, 200) : '',
        lat: own ? lat : null,
        lng: own ? lng : null,
        zoom: one(String(p.zoom ?? '16'), ['13', '15', '16', '17'] as const, '16'),
        height: typeof p.height === 'number' ? Math.min(800, Math.max(200, Math.round(p.height))) : 380,
        route: p.route !== false,
      };
    }
    case 'testimonial':
      return {
        quote: sanitizePlain(typeof p.quote === 'string' ? p.quote : '', true).slice(0, 600),
        name: plain(p.name, 80),
        role: plain(p.role, 80),
        photo: typeof p.photo === 'string' && MEDIA.test(p.photo) ? p.photo : null,
        stars: typeof p.stars === 'number' && Number.isFinite(p.stars) ? Math.min(5, Math.max(0, Math.round(p.stars))) : 5,
        look: one(p.look, ['card', 'plain', 'center'] as const, 'card'),
      };
    case 'flipbox':
      return {
        image: typeof p.image === 'string' && MEDIA.test(p.image) ? p.image : null,
        icon: typeof p.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(p.icon) ? p.icon : '',
        title: plain(p.title, 120),
        text: sanitizePlain(typeof p.text === 'string' ? p.text : '', true).slice(0, 300),
        backTitle: plain(p.backTitle, 120),
        backText: sanitizePlain(typeof p.backText === 'string' ? p.backText : '', true).slice(0, 500),
        label: plain(p.label, 60),
        href: href(p.href),
        effect: one(p.effect, ['flip', 'flipup', 'fade'] as const, 'flip'),
        height: typeof p.height === 'number' && Number.isFinite(p.height) ? Math.min(700, Math.max(160, Math.round(p.height))) : 300,
      };
    case 'hotspots':
      return {
        image: typeof p.image === 'string' && MEDIA.test(p.image) ? p.image : null,
        alt: plain(p.alt, 200),
        points: (Array.isArray(p.points) ? p.points : [])
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
          .slice(0, MAX_HOTSPOTS)
          .map((x) => ({
            x: pct(x.x),
            y: pct(x.y),
            title: plain(x.title, 80),
            text: sanitizePlain(typeof x.text === 'string' ? x.text : '', true).slice(0, 400),
            href: href(x.href),
          })),
        marker: one(p.marker, ['plus', 'number', 'dot'] as const, 'plus'),
        pulse: p.pulse !== false,
      };
    case 'headline':
      return {
        before: plain(p.before, 200),
        words: headlineWords(p.words).join('\n'),
        after: plain(p.after, 200),
        mode: p.mode === 'highlight' ? 'highlight' : 'rotate',
        effect: one(p.effect, ['slide', 'fade', 'wipe'] as const, 'slide'),
        seconds: typeof p.seconds === 'number' && Number.isFinite(p.seconds) ? Math.min(8, Math.max(1, Math.round(p.seconds * 2) / 2)) : 2.5,
        shape: one(p.shape, ['underline', 'circle', 'marker', 'strike'] as const, 'underline'),
        accent: p.accent !== false,
        level: one(String(p.level ?? '2'), ['1', '2', '3', '4'] as const, '2'),
      };
    case 'compare':
      return {
        before: typeof p.before === 'string' && MEDIA.test(p.before) ? p.before : null,
        after: typeof p.after === 'string' && MEDIA.test(p.after) ? p.after : null,
        alt: plain(p.alt, 200),
        beforeLabel: plain(p.beforeLabel, 40),
        afterLabel: plain(p.afterLabel, 40),
        start: typeof p.start === 'number' ? Math.min(100, Math.max(0, Math.round(p.start))) : 50,
        ratio: one(p.ratio, ['3/2', '16/9', '4/3', '1/1', '3/4'] as const, '3/2'),
      };
    case 'iconlist':
      return {
        items: (Array.isArray(p.items) ? p.items : [])
          .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
          .slice(0, 30)
          .map((x) => ({ icon: typeof x.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(x.icon) ? x.icon : 'check', text: plain(x.text, 200), href: href(x.href) })),
        layout: p.layout === 'row' ? 'row' : 'column',
        size: typeof p.size === 'number' ? Math.min(64, Math.max(12, Math.round(p.size))) : 20,
      };
    case 'price':
      return { product: productRef(p.product), compare: p.compare !== false, sale: p.sale !== false };
    case 'addtocart':
      return { product: productRef(p.product), label: plain(p.label, 60) || 'In den Warenkorb', qty: p.qty === true };
    case 'stock':
      return { product: productRef(p.product), plenty: p.plenty !== false };
    case 'rating':
      return { product: productRef(p.product), count: p.count !== false };
    case 'form':
      return { form: typeof p.form === 'string' && /^[\w-]{1,64}$/.test(p.form) ? p.form : '' };
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
      return { ...loopQuery(p) };
  }
}

/**
 * A «Sprungmarke» as typed («Unser Team» → unser-team): letters, digits and
 * dashes, starting with a letter – never one of the page's own ids (e-…, b-…).
 */
export function cleanAnchor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const a = slugify(v)
    .replace(/\//g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return a && !/^[eb]-/.test(a) ? a : undefined;
}

export const MAX_EL_CSS = 5000;

/**
 * Werkbank CSS of one element: every rule is put inside it – «&» stands for the
 * element itself, other selectors are looked for inside it, also within @media.
 */
export function scopeElCss(css: string, sel: string): string {
  return css
    .replace(/<\/?style/gi, '')
    .replace(/</g, '')
    .replace(/(^|[{}])\s*([^{}@]+)\{/g, (_, before: string, selectors: string) => {
      const scoped = selectors
        .split(',')
        .map((x) => (x.includes('&') ? x.trim().replace(/&/g, sel) : `${sel} ${x.trim()}`))
        .join(',');
      return `${before}${scoped}{`;
    });
}

/** Werkbank settings (own CSS, class names) only change in the Werkbank: elsewhere each element keeps what it had. */
export function keepCodeOf(els: El[], previous: El[]): El[] {
  const before = new Map<string, Pick<El, 'css' | 'className'>>();
  walkEls(previous, (el) => before.set(el.id, { css: el.css, className: el.className }));
  const keep = (list: El[]): El[] =>
    list.map((el) => {
      const { css, className, ...rest } = el;
      void css;
      void className;
      const old = before.get(el.id);
      return { ...rest, ...(old?.css ? { css: old.css } : {}), ...(old?.className ? { className: old.className } : {}), ...(el.children ? { children: keep(el.children) } : {}) };
    });
  return keep(els);
}

/** The id an element carries in the page: its «Sprungmarke», or e-… */
export const elDomId = (el: Pick<El, 'id' | 'anchor'>) => cleanAnchor(el.anchor) || `e-${el.id}`;

/** The element tree as stored: known kinds, clean props, bounded size and depth. */
export function sanitizeEls(input: unknown, depth = 0, budget = { n: MAX_ELS }, seen = new Set<string>(), anchors = new Set<string>()): El[] {
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
    if (
      kind === 'button' &&
      isObj(raw.act) &&
      (EL_ACTS as readonly string[]).includes(String(raw.act.do)) &&
      typeof raw.act.target === 'string' &&
      ID.test(raw.act.target) &&
      raw.act.target !== id
    )
      el.act = { do: raw.act.do as ElAct, target: raw.act.target };
    if (raw.hidden === true) el.hidden = true;
    if (raw.pinned === true) el.pinned = true;
    if (typeof raw.css === 'string' && raw.css.trim()) el.css = raw.css.replace(/</g, '').slice(0, MAX_EL_CSS);
    if (typeof raw.className === 'string') {
      const c = raw.className
        .replace(/[^\w\- ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      if (c) el.className = c;
    }
    // Each «Sprungmarke» once in a layout: the first keeps it.
    const anchor = cleanAnchor(raw.anchor);
    if (anchor && !anchors.has(anchor)) {
      anchors.add(anchor);
      el.anchor = anchor;
    }
    const show = cleanConds(raw.show);
    if (show.length) el.show = show;
    if (isObj(raw.bind)) {
      const bind = Object.fromEntries(Object.entries(raw.bind).filter(([k, v]) => BINDABLE[kind]?.includes(k) && typeof v === 'string' && BIND.test(v)));
      if (Object.keys(bind).length) el.bind = bind as Record<string, string>;
    }
    if (isContainer(kind)) el.children = sanitizeEls(raw.children, depth + 1, budget, seen, anchors);
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
    // A focus for this place only: over the picture's own from the media library (set on the img itself).
    const focus = el.kind === 'image' ? focusOf(el.props.focus).focus : undefined;
    if (focus) out.push(`${sel} img{object-position:${focus.x}% ${focus.y}%!important}`);
    if (el.css) out.push(scopeElCss(el.css, sel));
  });
  return out.join('');
}

/** Settings of a kind that the CSS reads as variables (no inline styles on the page). */
/** The point of a picture that stays in view when it is cropped, for one place – in percent; unset, the media library's applies. */
export function focusOf(v: unknown): { focus?: { x: number; y: number } } {
  if (!v || typeof v !== 'object') return {};
  const { x, y } = v as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!ok(x) || !ok(y)) return {};
  return { focus: { x: Math.round(x), y: Math.round(y) } };
}

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
  const visit = (list: El[]) => {
    for (const el of list) {
      // Shown only under conditions (members, a campaign …): never in the description or the search for everyone.
      if (el.show?.length) continue;
      // Texts bound to entries are placeholders – what visitors read comes from the entries.
      if (el.kind === 'heading' && !el.bind?.text) out.push(String(el.props.text ?? ''));
      if (el.kind === 'text' && !el.bind?.html) out.push(stripHtml(String(el.props.html ?? '')));
      if (el.kind === 'button' && !el.bind?.label) out.push(String(el.props.label ?? ''));
      if (el.kind === 'headline') out.push(headlineText(el.props));
      if (el.kind === 'testimonial') out.push(String(el.props.quote ?? ''), String(el.props.name ?? ''));
      if (el.kind === 'flipbox') for (const k of ['title', 'text', 'backTitle', 'backText', 'label']) out.push(String(el.props[k] ?? ''));
      if (el.kind === 'hotspots')
        for (const pt of (el.props.points as { title?: string; text?: string }[] | undefined) ?? []) out.push(String(pt?.title ?? ''), String(pt?.text ?? ''));
      if (el.kind === 'iconlist') for (const it of (el.props.items as { text?: string }[] | undefined) ?? []) out.push(String(it?.text ?? ''));
      if (el.children) visit(el.children);
    }
  };
  visit(els);
  return out.filter(Boolean).join(' ');
}

export function elementsHeadings(els: El[]): { level: number; text: string; field: string }[] {
  const out: { level: number; text: string; field: string }[] = [];
  const visit = (list: El[], base: string) =>
    list.forEach((el, i) => {
      const path = `${base}.${i}`;
      if (el.kind === 'heading' && !el.bind?.text) out.push({ level: Number(el.props.level) || 2, text: String(el.props.text ?? ''), field: `${path}.props.text` });
      if (el.kind === 'headline') out.push({ level: Number(el.props.level) || 2, text: headlineText(el.props), field: `${path}.props.before` });
      if (el.children) visit(el.children, `${path}.children`);
    });
  visit(els, 'els');
  return out;
}

export function elementsMedia(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (el.kind === 'image' && typeof el.props.image === 'string') out.push(el.props.image);
    if (el.kind === 'gallery' && Array.isArray(el.props.images)) out.push(...el.props.images.filter((x): x is string => typeof x === 'string'));
    if (el.kind === 'video' && typeof el.props.poster === 'string') out.push(el.props.poster);
    if ((el.kind === 'hotspots' || el.kind === 'flipbox') && typeof el.props.image === 'string') out.push(el.props.image);
    if (el.kind === 'testimonial' && typeof el.props.photo === 'string') out.push(el.props.photo);
    if (el.kind === 'compare') for (const k of ['before', 'after']) if (typeof el.props[k] === 'string') out.push(el.props[k] as string);
  });
  return out;
}

export function elementsLinks(els: El[]): string[] {
  const out: string[] = [];
  walkEls(els, (el) => {
    if (typeof el.props.href === 'string') out.push(el.props.href);
    if (el.kind === 'hotspots') for (const pt of (el.props.points as { href?: string }[] | undefined) ?? []) if (pt?.href) out.push(pt.href);
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
  /** Only offered when this module is on. */
  module?: string;
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

/** A header of one's own: logo on the left, main menu on the right. */
export const headerStarter = (): El[] => [
  box(
    [createEl('logo'), createEl('menu', { source: 'main' })],
    { desktop: { ...row('$s-6'), justify: 'between', minHeight: '4.25rem', pt: '$s-3', pb: '$s-3' } },
    {},
    { name: 'Kopfzeile' },
  ),
];

/** A footer of one's own: name, address and opening hours, the footer columns, then copyright and legal links. */
export const footerStarter = (): El[] => {
  const small: StyleProps = { fontSize: '$step-n1', color: '$ink-2' };
  return [
    box(
      [
        box(
          [
            createEl('heading', { text: 'Name der Website', level: '3' }, { bind: { text: 'site:name' } }),
            createEl('text', { html: '<p>Adresse</p>' }, { bind: { html: 'site:address' }, design: { desktop: small } }),
            createEl('hours'),
          ],
          { desktop: { gap: '$s-3', grow: 1 } },
        ),
        createEl('menu', { source: 'footer' }, { design: { desktop: { grow: 2 } } }),
      ],
      { desktop: { ...row('$s-7'), align: 'start' }, mobile: stackOnPhone },
      {},
      { name: 'Oben' },
    ),
    createEl('divider'),
    box(
      [createEl('text', { html: '<p>© Jahr Name</p>' }, { bind: { html: 'site:copyright' } }), createEl('menu', { source: 'legal' })],
      { desktop: { ...row('$s-5'), justify: 'between', wrap: true, ...small }, mobile: stackOnPhone },
      {},
      { name: 'Unten' },
    ),
  ];
};

/** An overview of a content type: its title with the chosen filter, the category links, then its entries in pages. */
export function archiveStarter(c: CollectionDef): El[] {
  const pic = c.fields.find((f) => f.type === 'image') ?? c.fields.find((f) => f.type === 'images');
  const lead = c.fields.find((f) => ['excerpt', 'intro', 'summary', 'teaser'].includes(f.key) && ['text', 'textarea', 'richtext'].includes(f.type));
  const card = box(
    [
      ...(pic ? [createEl('image', {}, { bind: { image: `field:${pic.key}` }, design: { desktop: { aspect: '3/2', radius: '$s-3' } } })] : []),
      createEl('heading', { text: 'Titel des Eintrags', level: '2' }, { bind: { text: 'title' }, design: { desktop: { fontSize: '$step-2' } } }),
      ...(lead ? [createEl('text', { html: '<p>Kurzfassung des Eintrags.</p>' }, { bind: { html: `field:${lead.key}` } })] : []),
    ],
    { desktop: { gap: '$s-3' } },
    {},
    { name: 'Eintrag', ...(c.route ? { bind: { href: 'url' } } : {}) },
  );
  const categories = c.fields.some((f) => f.key === 'category');
  return [
    createEl('heading', { text: 'Titel der Übersicht', level: '1' }, { bind: { text: 'site:page' } }),
    ...(categories ? [createEl('terms')] : []),
    createEl(
      'list',
      { archive: true, collection: c.id, limit: 9, paginate: true },
      { children: [card], design: { desktop: { display: 'grid', columns: 3, gap: '$s-6' }, tablet: { columns: 2 }, mobile: { columns: 1 } } },
    ),
  ];
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
    id: 'shop',
    label: 'Produkte im Angebot',
    description: 'Vier Produkte mit Statt-Preis – mit Bild, Sternen, Preis und «In den Warenkorb». Kommen von selbst nach.',
    module: 'shop',
    els: () => [
      createEl('heading', { text: 'Jetzt im Angebot', level: '2' }),
      createEl(
        'list',
        { collection: 'products', limit: 4, shop: 'sale', empty: 'Zurzeit ist nichts im Angebot.' },
        {
          design: { desktop: { display: 'grid', columns: 4, gap: '$s-6' }, tablet: { columns: 2 }, mobile: { columns: 1 } },
          children: [
            box(
              [
                createEl('image', {}, { bind: { image: 'field:images', href: 'url' }, design: { desktop: { aspect: '4/5', radius: '$s-3' } } }),
                createEl('heading', { text: 'Produkt', level: '3' }, { bind: { text: 'title' }, design: { desktop: { fontSize: '$step-1' } } }),
                createEl('rating'),
                createEl('price'),
                createEl('addtocart'),
              ],
              { desktop: { gap: '$s-3' } },
              {},
              { name: 'Produkt' },
            ),
          ],
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
