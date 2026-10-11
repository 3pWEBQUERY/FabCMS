/**
 * Own content types, made in the Studio: ready-made starting points with
 * fields that fit them, and the rules that turn what someone types – a name,
 * field labels – into what the server stores (ids, keys, addresses).
 *
 * The keys follow Nova's own types where they mean the same: `excerpt` for the
 * short text, `cover` for the picture, `category` for grouping. That way page
 * templates, archive templates, the category filter and «like this entry» work
 * for an own type without further setup.
 */

import type { FieldDef, FieldType } from './fields';
import type { CollectionDef } from './types';
import { slugify } from './text';

export interface TypePreset {
  id: string;
  name: string;
  singular: string;
  icon: string;
  description: string;
  /** Each entry has a page of its own (and the type an overview). */
  pages: boolean;
  /** Entries get the visual editor for their content too. */
  blocks: boolean;
  fields: FieldDef[];
}

const title = (label = 'Titel'): FieldDef => ({ key: 'title', type: 'text', label, required: true });
const excerpt = (label = 'Kurzbeschreibung'): FieldDef => ({ key: 'excerpt', type: 'textarea', label, help: 'Erscheint in Übersichten und Vorschauen.' });
const cover = (label = 'Bild'): FieldDef => ({ key: 'cover', type: 'image', label });
const category = (help: string): FieldDef => ({ key: 'category', type: 'text', label: 'Kategorie', help, width: 'half' });

export const TYPE_PRESETS: TypePreset[] = [
  {
    id: 'leistungen',
    name: 'Leistungen',
    singular: 'Leistung',
    icon: 'star',
    description: 'Was du anbietest – je mit Bild, Beschreibung und Preis.',
    pages: true,
    blocks: true,
    fields: [title(), excerpt(), cover(), { key: 'price', type: 'money', label: 'Preis ab', width: 'half' }, category('z. B. Beratung, Umsetzung')],
  },
  {
    id: 'team',
    name: 'Team',
    singular: 'Person',
    icon: 'people',
    description: 'Die Menschen hinter dem Betrieb, mit Foto und Aufgabe.',
    pages: false,
    blocks: false,
    fields: [
      title('Name'),
      { key: 'role', type: 'text', label: 'Funktion', width: 'half' },
      cover('Foto'),
      excerpt('Ein paar Sätze zur Person'),
      { key: 'email', type: 'email', label: 'E-Mail', width: 'half' },
    ],
  },
  {
    id: 'rezepte',
    name: 'Rezepte',
    singular: 'Rezept',
    icon: 'dish',
    description: 'Mit Zeit, Schwierigkeit, Zutaten und Zubereitung.',
    pages: true,
    blocks: false,
    fields: [
      title(),
      excerpt(),
      cover(),
      { key: 'minutes', type: 'number', label: 'Zubereitungszeit in Minuten', min: 0, width: 'half' },
      {
        key: 'level',
        type: 'select',
        label: 'Schwierigkeit',
        width: 'half',
        options: [
          { value: 'einfach', label: 'Einfach' },
          { value: 'mittel', label: 'Mittel' },
          { value: 'anspruchsvoll', label: 'Anspruchsvoll' },
        ],
      },
      category('z. B. Vorspeise, Hauptgang, Dessert'),
      { key: 'ingredients', type: 'textarea', label: 'Zutaten', help: 'Eine pro Zeile.' },
      { key: 'steps', type: 'richtext', label: 'Zubereitung' },
    ],
  },
  {
    id: 'stellen',
    name: 'Stellen',
    singular: 'Stelle',
    icon: 'user',
    description: 'Offene Stellen mit Pensum, Ort und Antritt.',
    pages: true,
    blocks: false,
    fields: [
      title('Bezeichnung'),
      excerpt(),
      {
        key: 'workload',
        type: 'select',
        label: 'Pensum',
        width: 'half',
        options: [
          { value: '100', label: '100 %' },
          { value: '80-100', label: '80–100 %' },
          { value: 'teilzeit', label: 'Teilzeit' },
          { value: 'lehrstelle', label: 'Lehrstelle' },
        ],
      },
      { key: 'place', type: 'text', label: 'Arbeitsort', width: 'half' },
      { key: 'start', type: 'date', label: 'Antritt', width: 'half' },
      { key: 'apply', type: 'email', label: 'Bewerbung an', width: 'half' },
      { key: 'body', type: 'richtext', label: 'Aufgaben und Profil' },
    ],
  },
  {
    id: 'kundenstimmen',
    name: 'Kundenstimmen',
    singular: 'Kundenstimme',
    icon: 'quote',
    description: 'Was Kundinnen und Kunden sagen – für Listen auf jeder Seite.',
    pages: false,
    blocks: false,
    fields: [
      title('Name'),
      { key: 'quote', type: 'textarea', label: 'Zitat', required: true },
      { key: 'company', type: 'text', label: 'Firma oder Ort', width: 'half' },
      { key: 'stars', type: 'number', label: 'Sterne', min: 1, max: 5, width: 'half' },
      cover('Foto'),
    ],
  },
  {
    id: 'fragen',
    name: 'Häufige Fragen',
    singular: 'Frage',
    icon: 'faq',
    description: 'Fragen und Antworten, nach Themen geordnet.',
    pages: false,
    blocks: false,
    fields: [title('Frage'), { key: 'answer', type: 'textarea', label: 'Antwort', required: true }, category('z. B. Bestellung, Lieferung')],
  },
  {
    id: 'partner',
    name: 'Partner',
    singular: 'Partner',
    icon: 'logos',
    description: 'Partner, Lieferanten oder Sponsoren mit Logo und Link.',
    pages: false,
    blocks: false,
    fields: [title('Name'), cover('Logo'), { key: 'website', type: 'url', label: 'Website' }, excerpt()],
  },
  {
    id: '',
    name: '',
    singular: '',
    icon: 'layers',
    description: 'Nur mit Titel – die Felder legst du selbst fest.',
    pages: true,
    blocks: true,
    fields: [title()],
  },
];

/** Field types the Studio offers, in the order a non-programmer looks for them. */
export const STUDIO_FIELD_TYPES: FieldType[] = ['text', 'textarea', 'richtext', 'number', 'money', 'date', 'boolean', 'select', 'tags', 'image', 'images', 'url', 'email'];

const RESERVED = new Set(['blocks', 'seo', 'slug', 'status', 'id']);

/** A field key from its label: «Preis pro Person» → preis_pro_person; unique among `taken`. */
export function fieldKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base =
    slugify(label)
      .replace(/[-/]+/g, '_')
      .replace(/^[^a-z]+/, '')
      .slice(0, 36) || 'feld';
  if (RESERVED.has(base)) base = `${base}_feld`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/** Gives every field without a key one from its label; kept keys stay (the entries' data hangs on them). `others`: keys in use next to them. */
export function keyFields(fields: FieldDef[], others: Iterable<string> = []): FieldDef[] {
  const taken = new Set([...others, ...fields.map((f) => f.key).filter(Boolean)]);
  return fields.map((f) => {
    if (f.key) return f;
    const key = fieldKey(f.label, taken);
    taken.add(key);
    return { ...f, key };
  });
}

/** The technical name and addresses of a type from its name: «Unsere Weine» → unsere_weine, /unsere-weine, /unsere-weine/:slug. */
export function typeAddress(name: string): { id: string; list: string; route: string } {
  const slug = slugify(name).replace(/\//g, '-').replace(/-+/g, '-') || 'eintraege';
  const id =
    slug
      .replace(/-/g, '_')
      .replace(/^[^a-z]+/, '')
      .slice(0, 40) || 'typ';
  return { id: id.length < 2 ? `${id}_typ` : id, list: `/${slug}`, route: `/${slug}/:slug` };
}

/** Like typeAddress, but free: «Rezepte» next to an existing one becomes rezepte_2 under /rezepte-2. */
export function freeAddress(name: string, existing: Pick<CollectionDef, 'id' | 'route' | 'list_route'>[]): { id: string; list: string; route: string } {
  const at = typeAddress(name);
  const taken = (a: { id: string; list: string; route: string }) => existing.some((c) => c.id === a.id || c.list_route === a.list || c.route === a.route);
  if (!taken(at)) return at;
  for (let n = 2; ; n++) {
    const next = { id: `${at.id.slice(0, 36)}_${n}`, list: `${at.list}-${n}`, route: `${at.list}-${n}/:slug` };
    if (!taken(next)) return next;
  }
}

/** What the server is sent for a new type made in the Studio. */
export function newType(
  input: { name: string; singular: string; icon: string; fields: FieldDef[]; pages: boolean; blocks: boolean },
  existing: Pick<CollectionDef, 'id' | 'route' | 'list_route'>[] = [],
): Partial<CollectionDef> & { id: string } {
  const at = freeAddress(input.name, existing);
  const fields = keyFields(input.fields);
  return {
    id: at.id,
    name: input.name.trim(),
    singular: input.singular.trim() || input.name.trim(),
    icon: input.icon,
    fields,
    route: input.pages ? at.route : null,
    list_route: input.pages ? at.list : null,
    has_blocks: input.blocks,
    title_field: fields.some((f) => f.key === 'title') ? 'title' : (fields.find((f) => f.type === 'text')?.key ?? 'title'),
  };
}
