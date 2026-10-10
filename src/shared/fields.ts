import { isSiteIcon } from './icon-set';
/**
 * Field definitions are the single source of truth for every form in Nova.
 * A content type (collection) or a block declares its fields once; the
 * Studio renders them with plain-language labels, the Werkbank shows the
 * technical key next to it, and the server validates against the same list.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'money'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'image'
  | 'images'
  | 'file'
  | 'relation'
  | 'location'
  | 'color'
  | 'icon'
  | 'url'
  | 'email'
  | 'json'
  | 'group'
  | 'blocks'
  | 'link'
  | 'form';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  type: FieldType;
  /** Label in Studio – everyday language. */
  label: string;
  /** Optional technical label for the Werkbank. Defaults to the key. */
  proLabel?: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  /** For `group`: the fields of each repeated item. */
  fields?: FieldDef[];
  /** For `group`: label of a single item, e.g. "Frage". */
  itemLabel?: string;
  /** For `relation`. */
  collection?: string;
  multiple?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  default?: unknown;
  /** Only shown in the Werkbank. */
  pro?: boolean;
  /** Field is editable directly on the canvas (contenteditable). */
  inline?: boolean;
  /** Conditional visibility: show when another field has one of these values. */
  showIf?: { field: string; equals: unknown[] };
  /** Files are stored privately and never served publicly (downloads, consent documents). */
  private?: boolean;
  /** Layout hint for the inspector. */
  width?: 'full' | 'half';
}

export interface LinkValue {
  label: string;
  href: string;
}

export interface LocationValue {
  address: string;
  lat?: number;
  lng?: number;
}

export interface FieldError {
  path: string;
  message: string;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Validates data against field definitions. Returns human messages that can be
 * shown as-is in the Studio ("Bitte gib einen Titel ein.").
 */
export function validateFields(fields: FieldDef[], data: Record<string, unknown>, prefix = ''): FieldError[] {
  const errors: FieldError[] = [];
  for (const f of fields) {
    const v = data?.[f.key];
    const path = prefix + f.key;
    if (f.showIf) {
      const other = data?.[f.showIf.field];
      if (!f.showIf.equals.includes(other)) continue;
    }
    if (f.required && isEmpty(v)) {
      errors.push({ path, message: `«${f.label}» fehlt noch.` });
      continue;
    }
    if (isEmpty(v)) continue;
    switch (f.type) {
      case 'number':
      case 'money':
        if (typeof v !== 'number' || Number.isNaN(v)) {
          errors.push({ path, message: `«${f.label}» muss eine Zahl sein.` });
        } else {
          if (f.min !== undefined && v < f.min) errors.push({ path, message: `«${f.label}» muss mindestens ${f.min} sein.` });
          if (f.max !== undefined && v > f.max) errors.push({ path, message: `«${f.label}» darf höchstens ${f.max} sein.` });
        }
        break;
      case 'email':
        if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push({ path, message: `«${f.label}» ist keine gültige E-Mail-Adresse.` });
        break;
      case 'url':
        if (typeof v !== 'string' || !/^(https?:\/\/|\/|#|mailto:|tel:)/.test(v)) errors.push({ path, message: `«${f.label}» muss mit https://, / oder # beginnen.` });
        break;
      case 'text':
      case 'textarea':
        if (typeof v !== 'string') errors.push({ path, message: `«${f.label}» muss Text sein.` });
        else if (f.maxLength && v.length > f.maxLength) errors.push({ path, message: `«${f.label}» ist ${v.length - f.maxLength} Zeichen zu lang.` });
        break;
      case 'icon':
        if (!isSiteIcon(v)) errors.push({ path, message: `«${f.label}»: dieses Symbol gibt es nicht.` });
        break;
      case 'select':
        if (f.options && !f.options.some((o) => o.value === v)) errors.push({ path, message: `«${f.label}»: ungültige Auswahl.` });
        break;
      case 'group':
        if (!Array.isArray(v)) {
          errors.push({ path, message: `«${f.label}» hat ein ungültiges Format.` });
        } else {
          if (f.min !== undefined && v.length < f.min) errors.push({ path, message: `«${f.label}» braucht mindestens ${f.min} Einträge.` });
          if (f.max !== undefined && v.length > f.max) errors.push({ path, message: `«${f.label}» erlaubt höchstens ${f.max} Einträge.` });
          v.forEach((item, i) => errors.push(...validateFields(f.fields ?? [], item as Record<string, unknown>, `${path}.${i}.`)));
        }
        break;
      default:
        break;
    }
  }
  return errors;
}

/** Builds an object with every field's default value. */
export function defaultsFor(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = structuredClone(f.default);
    else if (f.type === 'group' || f.type === 'images' || f.type === 'tags' || f.type === 'multiselect' || f.type === 'blocks') out[f.key] = [];
    else if (f.type === 'boolean') out[f.key] = false;
  }
  return out;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Kurzer Text',
  textarea: 'Mehrzeiliger Text',
  richtext: 'Formatierter Text',
  number: 'Zahl',
  money: 'Preis',
  date: 'Datum',
  datetime: 'Datum & Uhrzeit',
  boolean: 'Ja/Nein',
  select: 'Auswahl',
  multiselect: 'Mehrfachauswahl',
  tags: 'Schlagwörter',
  image: 'Bild',
  images: 'Bilder',
  file: 'Datei',
  relation: 'Verknüpfung',
  location: 'Ort',
  color: 'Farbe',
  icon: 'Symbol',
  url: 'Link',
  email: 'E-Mail',
  json: 'JSON',
  group: 'Wiederholbare Gruppe',
  blocks: 'Seiteninhalt (Blöcke)',
  link: 'Schaltfläche',
  form: 'Formular',
};
