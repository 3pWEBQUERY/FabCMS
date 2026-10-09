import type { FieldDef, LinkValue } from './fields';
import type { Block } from './types';
import { shortId, stripHtml } from './text';

export type BlockCategory = 'text' | 'media' | 'structure' | 'sell' | 'contact' | 'collections' | 'code';

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'media', label: 'Bilder & Video' },
  { id: 'structure', label: 'Aufbau' },
  { id: 'collections', label: 'Inhalte' },
  { id: 'sell', label: 'Verkaufen' },
  { id: 'contact', label: 'Kontakt' },
  { id: 'code', label: 'Code' },
];

export interface HeadingRef {
  level: number;
  text: string;
  field: string;
}

export interface BlockDef {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: BlockCategory;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  /** Only insertable in the Werkbank. */
  pro?: boolean;
  /** Module that has to be active for the block to appear in the picker. */
  module?: string;
  /** Plain text of the block, used for SEO, search and excerpts. */
  text?: (props: Record<string, any>) => string;
  /** Headings the block renders. `first` = block is the first on the page. */
  headings?: (props: Record<string, any>, first: boolean) => HeadingRef[];
  /** Images used by the block, used by the alt-text check. */
  images?: (props: Record<string, any>) => string[];
  /** Internal and external links. */
  links?: (props: Record<string, any>) => string[];
}

/** Joins text fragments into sentences without doubling punctuation («gekocht..»). */
export const sentences = (...parts: unknown[]) =>
  parts
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .map((p) => (/[.!?:…»"]$/.test(p) ? p : `${p}.`))
    .join(' ');

const link = (key: string, label: string, help?: string): FieldDef => ({ key, type: 'link', label, help });
const linkHref = (l: unknown) => ((l as LinkValue | undefined)?.href ? [(l as LinkValue).href] : []);
const richLinks = (html: unknown) => [...String(html ?? '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

export const BLOCKS: BlockDef[] = [
  {
    type: 'hero',
    label: 'Einstieg',
    description: 'Grosser Titel ganz oben – das Erste, was Besucher sehen.',
    icon: 'hero',
    category: 'structure',
    fields: [
      {
        key: 'variant',
        type: 'select',
        label: 'Aufbau',
        options: [
          { value: 'statement', label: 'Nur Text, gross' },
          { value: 'split', label: 'Text neben Bild' },
          { value: 'cover', label: 'Bild über die ganze Breite' },
        ],
        default: 'statement',
      },
      { key: 'eyebrow', type: 'text', label: 'Kleine Zeile über dem Titel', inline: true, maxLength: 60 },
      { key: 'title', type: 'text', label: 'Titel', inline: true, required: true, maxLength: 120 },
      { key: 'text', type: 'textarea', label: 'Einleitung', inline: true, maxLength: 320 },
      link('primary', 'Hauptknopf'),
      link('secondary', 'Zweiter Knopf'),
      { key: 'image', type: 'image', label: 'Bild', showIf: { field: 'variant', equals: ['split', 'cover'] } },
    ],
    defaults: {
      variant: 'statement',
      eyebrow: '',
      title: 'Ein klarer Satz, worum es hier geht.',
      text: 'Zwei, drei Zeilen, die erklären, warum man bleiben sollte.',
      primary: { label: 'Kontakt aufnehmen', href: '/kontakt' },
      secondary: null,
      image: null,
    },
    text: (p) => sentences(p.eyebrow, p.title, p.text),
    headings: (p, first) => (p.title ? [{ level: first ? 1 : 2, text: p.title, field: 'title' }] : []),
    images: (p) => (p.image ? [p.image] : []),
    links: (p) => [...linkHref(p.primary), ...linkHref(p.secondary)],
  },
  {
    type: 'text',
    label: 'Text',
    description: 'Überschrift und Absätze, mit Fett, Kursiv, Links und Listen.',
    icon: 'text',
    category: 'text',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true, maxLength: 120 },
      { key: 'body', type: 'richtext', label: 'Text', inline: true },
      {
        key: 'width',
        type: 'select',
        label: 'Breite',
        options: [
          { value: 'narrow', label: 'Lesebreite' },
          { value: 'wide', label: 'Breit' },
        ],
        default: 'narrow',
      },
      {
        key: 'align',
        type: 'select',
        label: 'Ausrichtung',
        options: [
          { value: 'left', label: 'Links' },
          { value: 'center', label: 'Zentriert' },
        ],
        default: 'left',
      },
    ],
    defaults: { heading: 'Überschrift', body: '<p>Hier steht dein Text. Klick hinein und schreib los.</p>', width: 'narrow', align: 'left' },
    text: (p) => sentences(p.heading, stripHtml(String(p.body ?? ''))),
    headings: (p) => {
      const out: HeadingRef[] = [];
      if (p.heading) out.push({ level: 2, text: p.heading, field: 'heading' });
      for (const m of String(p.body ?? '').matchAll(/<h([2-4])[^>]*>(.*?)<\/h\1>/gi))
        out.push({ level: Number(m[1]), text: stripHtml(m[2]), field: 'body' });
      return out;
    },
    links: (p) => richLinks(p.body),
  },
  {
    type: 'split',
    label: 'Text mit Bild',
    description: 'Ein Bild neben einem Textabschnitt – gut für «Über uns».',
    icon: 'split',
    category: 'structure',
    fields: [
      { key: 'eyebrow', type: 'text', label: 'Kleine Zeile', inline: true },
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'body', type: 'richtext', label: 'Text', inline: true },
      { key: 'image', type: 'image', label: 'Bild' },
      {
        key: 'side',
        type: 'select',
        label: 'Bild auf welcher Seite?',
        options: [
          { value: 'right', label: 'Rechts' },
          { value: 'left', label: 'Links' },
        ],
        default: 'right',
      },
      link('link', 'Knopf'),
    ],
    defaults: {
      eyebrow: '',
      heading: 'Wer wir sind',
      body: '<p>Erzähl in wenigen Sätzen, was dich ausmacht.</p>',
      image: null,
      side: 'right',
      link: null,
    },
    text: (p) => sentences(p.eyebrow, p.heading, stripHtml(String(p.body ?? ''))),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
    images: (p) => (p.image ? [p.image] : []),
    links: (p) => [...richLinks(p.body), ...linkHref(p.link)],
  },
  {
    type: 'image',
    label: 'Bild',
    description: 'Ein einzelnes Bild mit optionaler Bildunterschrift.',
    icon: 'image',
    category: 'media',
    fields: [
      { key: 'image', type: 'image', label: 'Bild', required: true },
      { key: 'caption', type: 'text', label: 'Bildunterschrift', inline: true },
      {
        key: 'size',
        type: 'select',
        label: 'Grösse',
        options: [
          { value: 'content', label: 'Textbreite' },
          { value: 'wide', label: 'Breit' },
          { value: 'full', label: 'Ganze Breite' },
        ],
        default: 'wide',
      },
      {
        key: 'ratio',
        type: 'select',
        label: 'Seitenverhältnis',
        options: [
          { value: 'auto', label: 'Original' },
          { value: '16/9', label: 'Querformat 16:9' },
          { value: '4/3', label: 'Querformat 4:3' },
          { value: '1/1', label: 'Quadrat' },
          { value: '3/4', label: 'Hochformat' },
        ],
        default: 'auto',
      },
    ],
    defaults: { image: null, caption: '', size: 'wide', ratio: 'auto' },
    text: (p) => p.caption ?? '',
    images: (p) => (p.image ? [p.image] : []),
  },
  {
    type: 'gallery',
    label: 'Galerie',
    description: 'Mehrere Bilder, beim Klick vergrössert.',
    icon: 'gallery',
    category: 'media',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'images', type: 'images', label: 'Bilder' },
      {
        key: 'layout',
        type: 'select',
        label: 'Anordnung',
        options: [
          { value: 'grid', label: 'Raster' },
          { value: 'mosaic', label: 'Mosaik' },
          { value: 'strip', label: 'Streifen zum Wischen' },
        ],
        default: 'grid',
      },
    ],
    defaults: { heading: '', images: [], layout: 'grid' },
    text: (p) => p.heading ?? '',
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
    images: (p) => p.images ?? [],
  },
  {
    type: 'video',
    label: 'Video',
    description: 'YouTube oder Vimeo – lädt erst nach Klick, datenschutzfreundlich.',
    icon: 'video',
    category: 'media',
    fields: [
      { key: 'url', type: 'url', label: 'Link zum Video', help: 'YouTube- oder Vimeo-Link einfügen.' },
      { key: 'file', type: 'file', label: 'Oder eigene Videodatei' },
      { key: 'poster', type: 'image', label: 'Vorschaubild' },
      { key: 'caption', type: 'text', label: 'Beschreibung', inline: true },
    ],
    defaults: { url: '', file: null, poster: null, caption: '' },
    text: (p) => p.caption ?? '',
    images: (p) => (p.poster ? [p.poster] : []),
  },
  {
    type: 'list',
    label: 'Aufzählung',
    description: 'Leistungen, Schritte oder Vorteile – nummeriert oder mit Preisen.',
    icon: 'list',
    category: 'structure',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      {
        key: 'items',
        type: 'group',
        label: 'Punkte',
        itemLabel: 'Punkt',
        fields: [
          { key: 'title', type: 'text', label: 'Titel', required: true },
          { key: 'text', type: 'textarea', label: 'Beschreibung' },
          { key: 'meta', type: 'text', label: 'Rechts daneben', help: 'Zum Beispiel ein Preis oder eine Dauer: «45 Min · 68.–»' },
        ],
      },
      {
        key: 'style',
        type: 'select',
        label: 'Darstellung',
        options: [
          { value: 'numbered', label: 'Nummeriert' },
          { value: 'rows', label: 'Zeilen mit Preis/Dauer' },
          { value: 'columns', label: 'Spalten' },
        ],
        default: 'numbered',
      },
    ],
    defaults: {
      heading: 'So läuft es ab',
      intro: '',
      items: [
        { title: 'Anfrage', text: 'Du schreibst uns, was du brauchst.', meta: '' },
        { title: 'Gespräch', text: 'Wir klären Umfang, Termin und Preis.', meta: '' },
        { title: 'Umsetzung', text: 'Wir legen los und halten dich auf dem Laufenden.', meta: '' },
      ],
      style: 'numbered',
    },
    text: (p) => sentences(p.heading, p.intro, ...(p.items ?? []).flatMap((i: any) => [i.title, i.text])),
    headings: (p) => [
      ...(p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
      ...(p.items ?? []).map((i: any) => ({ level: 3, text: i.title, field: 'items' })),
    ],
  },
  {
    type: 'cta',
    label: 'Aufruf',
    description: 'Ein deutlicher Satz mit Knopf – zum Reservieren, Kaufen, Anfragen.',
    icon: 'cta',
    category: 'structure',
    fields: [
      { key: 'heading', type: 'text', label: 'Satz', inline: true, required: true },
      { key: 'text', type: 'textarea', label: 'Zusatz', inline: true },
      link('primary', 'Knopf'),
      link('secondary', 'Zweiter Knopf'),
    ],
    defaults: {
      heading: 'Lust vorbeizukommen?',
      text: '',
      primary: { label: 'Jetzt anfragen', href: '/kontakt' },
      secondary: null,
    },
    text: (p) => sentences(p.heading, p.text),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
    links: (p) => [...linkHref(p.primary), ...linkHref(p.secondary)],
  },
  {
    type: 'faq',
    label: 'Fragen & Antworten',
    description: 'Aufklappbare Fragen. Google zeigt sie oft direkt im Suchergebnis.',
    icon: 'faq',
    category: 'text',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      {
        key: 'items',
        type: 'group',
        label: 'Fragen',
        itemLabel: 'Frage',
        fields: [
          { key: 'q', type: 'text', label: 'Frage', required: true },
          { key: 'a', type: 'richtext', label: 'Antwort', required: true },
        ],
      },
    ],
    defaults: {
      heading: 'Häufige Fragen',
      items: [
        { q: 'Muss ich reservieren?', a: '<p>Unter der Woche meistens nicht, am Wochenende empfehlen wir es.</p>' },
        { q: 'Gibt es Parkplätze?', a: '<p>Ja, drei Plätze direkt vor dem Haus.</p>' },
      ],
    },
    text: (p) => sentences(p.heading, ...(p.items ?? []).flatMap((i: any) => [i.q, stripHtml(i.a ?? '')])),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
    links: (p) => (p.items ?? []).flatMap((i: any) => richLinks(i.a)),
  },
  {
    type: 'testimonials',
    label: 'Stimmen',
    description: 'Was Kundinnen und Gäste sagen – echte Zitate mit Namen.',
    icon: 'quote',
    category: 'text',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      {
        key: 'items',
        type: 'group',
        label: 'Zitate',
        itemLabel: 'Zitat',
        fields: [
          { key: 'quote', type: 'textarea', label: 'Zitat', required: true },
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'role', type: 'text', label: 'Zusatz', help: 'z. B. «Stammgast seit 2019»' },
        ],
      },
    ],
    defaults: { heading: '', items: [{ quote: 'Hier steht ein echtes Zitat einer echten Person.', name: 'Vorname N.', role: '' }] },
    text: (p) => sentences(...(p.items ?? []).map((i: any) => `${i.quote} – ${i.name}`)),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'quote',
    label: 'Zitat',
    description: 'Ein einzelnes, grosses Zitat.',
    icon: 'quote',
    category: 'text',
    fields: [
      { key: 'quote', type: 'textarea', label: 'Zitat', inline: true, required: true },
      { key: 'name', type: 'text', label: 'Von', inline: true },
      { key: 'role', type: 'text', label: 'Zusatz', inline: true },
    ],
    defaults: { quote: 'Gute Arbeit braucht Zeit. Und Leute, die sie sich nehmen.', name: '', role: '' },
    text: (p) => [p.quote, p.name].filter(Boolean).join(' – '),
  },
  {
    type: 'stats',
    label: 'Zahlen',
    description: 'Ein paar Zahlen, die für dich sprechen.',
    icon: 'stats',
    category: 'text',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      {
        key: 'items',
        type: 'group',
        label: 'Zahlen',
        itemLabel: 'Zahl',
        max: 6,
        fields: [
          { key: 'value', type: 'text', label: 'Zahl', required: true, help: 'z. B. «1987» oder «40+»' },
          { key: 'label', type: 'text', label: 'Bedeutung', required: true },
        ],
      },
    ],
    defaults: {
      heading: '',
      items: [
        { value: '1987', label: 'gegründet' },
        { value: '12', label: 'Leute im Team' },
        { value: '3', label: 'Generationen' },
      ],
    },
    text: (p) => sentences(...(p.items ?? []).map((i: any) => `${i.value} ${i.label}`)),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'pricing',
    label: 'Preise',
    description: 'Angebote oder Pakete nebeneinander.',
    icon: 'price',
    category: 'sell',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      {
        key: 'plans',
        type: 'group',
        label: 'Angebote',
        itemLabel: 'Angebot',
        max: 4,
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'price', type: 'text', label: 'Preis', help: 'z. B. «CHF 480» oder «ab 90.–»' },
          { key: 'period', type: 'text', label: 'Zeitraum', help: 'z. B. «pro Monat»' },
          { key: 'description', type: 'textarea', label: 'Beschreibung' },
          { key: 'features', type: 'textarea', label: 'Enthalten', help: 'Eine Zeile pro Punkt.' },
          { key: 'link', type: 'link', label: 'Knopf' },
          { key: 'highlight', type: 'boolean', label: 'Hervorheben' },
        ],
      },
    ],
    defaults: {
      heading: 'Preise',
      intro: '',
      plans: [
        { name: 'Basis', price: 'CHF 90', period: 'pro Stunde', description: '', features: 'Beratung vor Ort\nOfferte innert 48 h', link: { label: 'Anfragen', href: '/kontakt' }, highlight: false },
        { name: 'Pauschal', price: 'ab CHF 1 200', period: 'pro Projekt', description: '', features: 'Fixpreis\nMaterial inklusive\nGarantie 2 Jahre', link: { label: 'Anfragen', href: '/kontakt' }, highlight: true },
      ],
    },
    text: (p) => sentences(p.heading, p.intro, ...(p.plans ?? []).map((x: any) => `${x.name} ${x.price ?? ''} ${x.features ?? ''}`)),
    headings: (p) => [
      ...(p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
      ...(p.plans ?? []).map((x: any) => ({ level: 3, text: x.name, field: 'plans' })),
    ],
    links: (p) => (p.plans ?? []).flatMap((x: any) => linkHref(x.link)),
  },
  {
    type: 'people',
    label: 'Team',
    description: 'Menschen mit Foto, Funktion und ein paar Worten.',
    icon: 'people',
    category: 'text',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      {
        key: 'items',
        type: 'group',
        label: 'Personen',
        itemLabel: 'Person',
        fields: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'role', type: 'text', label: 'Funktion' },
          { key: 'text', type: 'textarea', label: 'Ein paar Worte' },
          { key: 'image', type: 'image', label: 'Foto' },
        ],
      },
    ],
    defaults: { heading: 'Team', items: [] },
    text: (p) => (p.items ?? []).map((i: any) => `${i.name}, ${i.role ?? ''}. ${i.text ?? ''}`).join(' '),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
    images: (p) => (p.items ?? []).map((i: any) => i.image).filter(Boolean),
  },
  {
    type: 'logos',
    label: 'Logos',
    description: 'Kunden, Partner oder Auszeichnungen.',
    icon: 'logos',
    category: 'media',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'images', type: 'images', label: 'Logos' },
    ],
    defaults: { heading: 'Wir arbeiten mit', images: [] },
    text: (p) => p.heading ?? '',
    images: (p) => p.images ?? [],
  },
  {
    type: 'buttons',
    label: 'Knöpfe',
    description: 'Ein oder mehrere Knöpfe in einer Reihe.',
    icon: 'button',
    category: 'structure',
    fields: [
      {
        key: 'items',
        type: 'group',
        label: 'Knöpfe',
        itemLabel: 'Knopf',
        max: 4,
        fields: [
          { key: 'label', type: 'text', label: 'Beschriftung', required: true },
          { key: 'href', type: 'url', label: 'Ziel', required: true },
        ],
      },
      {
        key: 'align',
        type: 'select',
        label: 'Ausrichtung',
        options: [
          { value: 'left', label: 'Links' },
          { value: 'center', label: 'Mitte' },
        ],
        default: 'left',
      },
    ],
    defaults: { items: [{ label: 'Mehr erfahren', href: '/' }], align: 'left' },
    links: (p) => (p.items ?? []).map((i: any) => i.href),
  },
  {
    type: 'divider',
    label: 'Abstand',
    description: 'Luft oder eine feine Linie zwischen zwei Abschnitten.',
    icon: 'divider',
    category: 'structure',
    fields: [
      {
        key: 'variant',
        type: 'select',
        label: 'Art',
        options: [
          { value: 'line', label: 'Linie' },
          { value: 'space', label: 'Nur Abstand' },
          { value: 'ornament', label: 'Zierzeichen' },
        ],
        default: 'line',
      },
    ],
    defaults: { variant: 'line' },
  },
  {
    type: 'form',
    label: 'Formular',
    description: 'Kontakt-, Anfrage- oder Anmeldeformular.',
    icon: 'form',
    category: 'contact',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      { key: 'form', type: 'form', label: 'Welches Formular?', required: true },
    ],
    defaults: { heading: 'Schreib uns', intro: '', form: null },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'booking',
    label: 'Reservation',
    description: 'Online reservieren oder einen Termin buchen – mit den freien Zeiten aus deinem Kalender.',
    icon: 'calendar',
    category: 'contact',
    module: 'booking',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      { key: 'service', type: 'text', label: 'Nur dieses Angebot (ID, leer = alle)', pro: true },
    ],
    defaults: { heading: 'Tisch reservieren', intro: 'Wähle Tag und Zeit – die Bestätigung kommt sofort per E-Mail.', service: '' },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'newsletter',
    label: 'Newsletter-Anmeldung',
    description: 'E-Mail-Feld zum Abonnieren – mit Bestätigung per E-Mail.',
    icon: 'mail',
    category: 'contact',
    module: 'newsletter',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      { key: 'button', type: 'text', label: 'Beschriftung des Knopfs' },
      { key: 'askName', type: 'boolean', label: 'Auch nach dem Vornamen fragen', help: 'Dann beginnt jede Ausgabe mit «Hallo …».' },
    ],
    defaults: { heading: 'Nichts verpassen', intro: 'Neue Beiträge direkt ins Postfach. Kein Spam, abmelden mit einem Klick.', button: 'Anmelden', askName: false },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'events',
    label: 'Events & Kurse',
    description: 'Die nächsten Anlässe oder Kurse mit Datum, Ort und freien Plätzen.',
    icon: 'ticket',
    category: 'collections',
    module: 'events',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      {
        key: 'source',
        type: 'select',
        label: 'Was zeigen?',
        options: [
          { value: 'events', label: 'Events' },
          { value: 'courses', label: 'Kurse' },
        ],
        default: 'events',
      },
      { key: 'count', type: 'number', label: 'Wie viele?', min: 1, max: 24, default: 4 },
      { key: 'category', type: 'text', label: 'Nur diese Kategorie', pro: true },
    ],
    defaults: { heading: 'Demnächst', intro: '', source: 'events', count: 4, category: '' },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'donate',
    label: 'Spenden',
    description: 'Spendenformular mit Beträgen, einmalig oder monatlich – mit Fortschritt zum Ziel.',
    icon: 'star',
    category: 'sell',
    module: 'donations',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      { key: 'campaign', type: 'text', label: 'Wofür? (Kampagne)', help: 'z. B. «Neue Werkstatt». Leer = allgemeine Spende. Spenden werden pro Kampagne zusammengezählt.' },
      { key: 'goal', type: 'money', label: 'Ziel', help: 'Leer = ohne Fortschrittsbalken.', min: 0 },
      { key: 'amounts', type: 'text', label: 'Beträge zur Auswahl', help: 'Mit Komma getrennt, z. B. «20, 50, 100, 250».' },
      { key: 'monthly', type: 'boolean', label: 'Monatliche Spende anbieten', default: true },
      { key: 'showTotal', type: 'boolean', label: 'Gesammelten Betrag zeigen (auch ohne Ziel)' },
    ],
    defaults: { heading: 'Jetzt unterstützen', intro: 'Jeder Franken hilft – und kommt an.', campaign: '', goal: null, amounts: '20, 50, 100, 250', monthly: true, showTotal: false },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'properties',
    label: 'Immobilien',
    description: 'Die neusten Objekte als Karten – mit Preis, Zimmern und Fläche.',
    icon: 'home',
    category: 'collections',
    module: 'realestate',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
      {
        key: 'offer',
        type: 'select',
        label: 'Welche?',
        options: [
          { value: '', label: 'Miete und Kauf' },
          { value: 'rent', label: 'Nur Miete' },
          { value: 'buy', label: 'Nur Kauf' },
        ],
        default: '',
      },
      { key: 'count', type: 'number', label: 'Wie viele?', min: 1, max: 12, default: 3 },
    ],
    defaults: { heading: 'Aktuelle Angebote', intro: '', offer: '', count: 3 },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'membership',
    label: 'Mitgliedschaft',
    description: 'Was die Mitgliedschaft kostet und bringt – mit dem passenden nächsten Schritt.',
    icon: 'key',
    category: 'contact',
    module: 'members',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'intro', type: 'textarea', label: 'Einleitung', inline: true },
    ],
    defaults: { heading: 'Mitglied werden', intro: 'Preis und Vorteile kommen aus Einstellungen → Mitglieder.' },
    text: (p) => sentences(p.heading, p.intro),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'contact',
    label: 'Kontaktangaben',
    description: 'Adresse, Telefon und E-Mail – kommt aus den Einstellungen.',
    icon: 'pin',
    category: 'contact',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'text', type: 'textarea', label: 'Zusatz', inline: true },
      { key: 'showHours', type: 'boolean', label: 'Öffnungszeiten daneben zeigen', default: true },
    ],
    defaults: { heading: 'So findest du uns', text: '', showHours: true },
    text: (p) => sentences(p.heading, p.text),
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'hours',
    label: 'Öffnungszeiten',
    description: 'Zeigt die Zeiten aus den Einstellungen – heute hervorgehoben.',
    icon: 'clock',
    category: 'contact',
    fields: [{ key: 'heading', type: 'text', label: 'Überschrift', inline: true }],
    defaults: { heading: 'Öffnungszeiten' },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'map',
    label: 'Karte',
    description: 'Karte mit deinem Standort. Lädt erst nach Zustimmung.',
    icon: 'map',
    category: 'contact',
    fields: [
      { key: 'address', type: 'text', label: 'Adresse', help: 'Leer lassen, um die Adresse aus den Einstellungen zu verwenden.' },
      { key: 'zoom', type: 'number', label: 'Zoom', min: 10, max: 19, default: 16 },
    ],
    defaults: { address: '', zoom: 16 },
  },
  {
    type: 'posts',
    label: 'Beiträge',
    description: 'Die neuesten Beiträge aus deinem Blog.',
    icon: 'posts',
    category: 'collections',
    module: 'blog',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'count', type: 'number', label: 'Wie viele?', min: 1, max: 24, default: 3 },
      { key: 'category', type: 'text', label: 'Nur Kategorie', help: 'Leer = alle' },
      {
        key: 'layout',
        type: 'select',
        label: 'Darstellung',
        options: [
          { value: 'list', label: 'Liste' },
          { value: 'grid', label: 'Raster mit Bildern' },
          { value: 'feature', label: 'Einer gross, Rest klein' },
        ],
        default: 'list',
      },
    ],
    defaults: { heading: 'Neu im Journal', count: 3, category: '', layout: 'list' },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'products',
    label: 'Produkte',
    description: 'Produkte aus deinem Shop.',
    icon: 'bag',
    category: 'sell',
    module: 'shop',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'count', type: 'number', label: 'Wie viele?', min: 1, max: 24, default: 6 },
      { key: 'category', type: 'text', label: 'Nur Kategorie', help: 'Leer = alle' },
    ],
    defaults: { heading: 'Aus dem Laden', count: 6, category: '' },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'menu',
    label: 'Speisekarte',
    description: 'Gerichte nach Kategorie, mit Preisen und Allergenen.',
    icon: 'menu',
    category: 'collections',
    module: 'menu',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'categories', type: 'tags', label: 'Nur diese Kategorien', help: 'Leer = alle Kategorien' },
      { key: 'daily', type: 'boolean', label: 'Tageskarte oben zeigen', default: true },
      { key: 'allergens', type: 'boolean', label: 'Allergene anzeigen', default: true },
    ],
    defaults: { heading: 'Karte', categories: [], daily: true, allergens: true },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'projects',
    label: 'Projekte',
    description: 'Arbeiten aus deinem Portfolio, filterbar.',
    icon: 'grid',
    category: 'collections',
    module: 'portfolio',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'count', type: 'number', label: 'Wie viele?', min: 1, max: 48, default: 6 },
      { key: 'filter', type: 'boolean', label: 'Filter nach Kategorie zeigen', default: true },
    ],
    defaults: { heading: 'Ausgewählte Arbeiten', count: 6, filter: true },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'profiles',
    label: 'Profile',
    description: 'Personenprofile mit Verfügbarkeit.',
    icon: 'people',
    category: 'collections',
    module: 'profiles',
    fields: [
      { key: 'heading', type: 'text', label: 'Überschrift', inline: true },
      { key: 'onlyAvailable', type: 'boolean', label: 'Nur heute verfügbare zeigen', default: false },
    ],
    defaults: { heading: 'Heute für dich da', onlyAvailable: false },
    headings: (p) => (p.heading ? [{ level: 2, text: p.heading, field: 'heading' }] : []),
  },
  {
    type: 'section',
    label: 'Wiederverwendbare Sektion',
    description: 'Ein Abschnitt, der auf mehreren Seiten gleich ist. Einmal ändern, überall aktuell.',
    icon: 'link',
    category: 'structure',
    fields: [{ key: 'section', type: 'relation', collection: 'sections', label: 'Welche Sektion?', required: true }],
    defaults: { section: null },
  },
  {
    type: 'html',
    label: 'Eigener Code',
    description: 'HTML mit Platzhaltern. Im Studio erscheinen nur die Platzhalter als Felder.',
    icon: 'code',
    category: 'code',
    pro: true,
    fields: [
      {
        key: 'code',
        type: 'json',
        label: 'HTML',
        pro: true,
        help: 'Platzhalter wie {{titel}} werden durch die Felder unten ersetzt und automatisch maskiert.',
      },
      {
        key: 'vars',
        type: 'group',
        label: 'Felder',
        itemLabel: 'Feld',
        fields: [
          { key: 'key', type: 'text', label: 'Platzhalter', pro: true, required: true },
          { key: 'label', type: 'text', label: 'Beschriftung im Studio', pro: true, required: true },
          { key: 'value', type: 'text', label: 'Inhalt' },
        ],
      },
    ],
    defaults: {
      code: '<div class="badge-row">\n  <strong>{{titel}}</strong>\n  <span>{{text}}</span>\n</div>',
      vars: [
        { key: 'titel', label: 'Titel', value: 'Neu' },
        { key: 'text', label: 'Text', value: 'Jeden Donnerstag Live-Musik' },
      ],
    },
    text: (p) => (p.vars ?? []).map((v: any) => v.value).join(' '),
  },
];

export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));

export function createBlock(type: string, props?: Record<string, unknown>): Block {
  const def = BLOCK_MAP[type];
  if (!def) throw new Error(`Unbekannter Block: ${type}`);
  return { id: shortId(8), type, props: { ...structuredClone(def.defaults), ...(props ?? {}) }, style: {}, lock: 'none' };
}

export function blocksText(blocks: Block[] | undefined): string {
  return (blocks ?? [])
    .map((b) => BLOCK_MAP[b.type]?.text?.(b.props) ?? '')
    .filter(Boolean)
    .join(' ');
}

export function blocksHeadings(blocks: Block[] | undefined): (HeadingRef & { blockId: string })[] {
  return (blocks ?? []).flatMap((b, i) =>
    (BLOCK_MAP[b.type]?.headings?.(b.props, i === 0) ?? []).map((h) => ({ ...h, blockId: b.id })),
  );
}

export function blocksImages(blocks: Block[] | undefined): { blockId: string; media: string }[] {
  return (blocks ?? []).flatMap((b) => (BLOCK_MAP[b.type]?.images?.(b.props) ?? []).map((m) => ({ blockId: b.id, media: m })));
}

export function blocksLinks(blocks: Block[] | undefined): { blockId: string; href: string }[] {
  return (blocks ?? []).flatMap((b) => (BLOCK_MAP[b.type]?.links?.(b.props) ?? []).map((href) => ({ blockId: b.id, href })));
}

