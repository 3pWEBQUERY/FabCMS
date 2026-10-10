import type { FieldDef, FieldType } from './fields';

/**
 * The data view of the Werkbank and the CSV round trip share one idea of a
 * cell: every flat field turns into a line of text and back. Nested fields
 * (groups, blocks, media, relations) stay in the editor.
 */

const FLAT: FieldType[] = ['text', 'textarea', 'number', 'money', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'tags', 'url', 'email', 'color'];
/** Types the data view edits in place, right in the cell. */
const INLINE: FieldType[] = ['text', 'textarea', 'number', 'money', 'date', 'boolean', 'select', 'multiselect', 'tags', 'url', 'email', 'color'];

/** Fields that fit into a table column (the title has its own). */
export function tableFields(fields: FieldDef[], titleField = 'title'): FieldDef[] {
  return fields.filter((f) => FLAT.includes(f.type) && f.key !== titleField && f.key !== 'title');
}

export const inlineEditable = (f: FieldDef) => INLINE.includes(f.type);

const YES = ['1', 'ja', 'yes', 'true', 'x', 'oui', 'si', 'sì', 'wahr'];
const NO = ['0', 'nein', 'no', 'false', 'non', 'falsch', ''];

/** Stored value → text of a cell. Money in francs with a dot, lists with commas. */
export function cellText(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return '';
  switch (f.type) {
    case 'money':
      return typeof v === 'number' ? (v / 100).toFixed(2) : '';
    case 'boolean':
      return v ? 'ja' : 'nein';
    case 'tags':
    case 'multiselect':
      return Array.isArray(v) ? v.join(', ') : '';
    default:
      return typeof v === 'object' ? '' : String(v);
  }
}

export type CellResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Text of a cell → value to store, or why it doesn't fit. */
export function parseCell(f: FieldDef, raw: string): CellResult {
  const s = raw.trim();
  const fail = (error: string): CellResult => ({ ok: false, error: `«${f.label}»: ${error}` });
  switch (f.type) {
    case 'number':
    case 'money': {
      if (!s) return { ok: true, value: null };
      // 1'250.50, 1 250,50 and 1250.5 all mean the same.
      const clean = s.replace(/['’\s]/g, '').replace(/^(CHF|Fr\.?)/i, '');
      const n = Number(/,\d{1,2}$/.test(clean) && !clean.includes('.') ? clean.replace(',', '.') : clean.replace(/,/g, ''));
      if (!Number.isFinite(n)) return fail(`«${s}» ist keine Zahl.`);
      return { ok: true, value: f.type === 'money' ? Math.round(n * 100) : n };
    }
    case 'boolean': {
      const l = s.toLowerCase();
      if (YES.includes(l)) return { ok: true, value: true };
      if (NO.includes(l)) return { ok: true, value: false };
      return fail(`«${s}» ist weder ja noch nein.`);
    }
    case 'date': {
      if (!s) return { ok: true, value: null };
      const ch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
      const iso = ch ? `${ch[3]}-${ch[2].padStart(2, '0')}-${ch[1].padStart(2, '0')}` : s;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(iso))) return fail(`«${s}» ist kein Datum (TT.MM.JJJJ oder JJJJ-MM-TT).`);
      return { ok: true, value: iso };
    }
    case 'datetime': {
      if (!s) return { ok: true, value: null };
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return fail(`«${s}» ist kein Zeitpunkt.`);
      return { ok: true, value: d.toISOString() };
    }
    case 'select': {
      if (!s) return { ok: true, value: null };
      const o = f.options?.find((x) => x.value === s) ?? f.options?.find((x) => x.label.toLowerCase() === s.toLowerCase() || x.value.toLowerCase() === s.toLowerCase());
      if (f.options && !o) return fail(`«${s}» gibt es nicht zur Auswahl (${f.options.map((x) => x.value).join(', ')}).`);
      return { ok: true, value: o?.value ?? s };
    }
    case 'tags':
    case 'multiselect': {
      const list = [
        ...new Set(
          s
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean),
        ),
      ];
      if (f.type === 'multiselect' && f.options) {
        const bad = list.filter((x) => !f.options!.some((o) => o.value === x));
        if (bad.length) return fail(`«${bad.join(', ')}» gibt es nicht zur Auswahl.`);
      }
      return { ok: true, value: list };
    }
    case 'email':
      if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return fail(`«${s}» ist keine E-Mail-Adresse.`);
      return { ok: true, value: s };
    case 'url':
      if (s && !/^(https?:\/\/|\/|#|mailto:|tel:)/.test(s)) return fail(`«${s}» muss mit https://, / oder # beginnen.`);
      return { ok: true, value: s };
    case 'color':
      if (s && !/^#[0-9a-f]{3,8}$/i.test(s)) return fail(`«${s}» ist keine Farbe wie #1a2b3c.`);
      return { ok: true, value: s };
    case 'textarea':
      return { ok: true, value: raw.replace(/\r\n/g, '\n').trim() };
    default:
      return { ok: true, value: s };
  }
}

/** Column headers of a file → fields, by key or label, any case. Unknown columns are listed, not guessed. */
export function matchColumns(header: string[], fields: FieldDef[]): { map: (FieldDef | 'id' | 'slug' | 'title' | null)[]; ignored: string[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const ignored: string[] = [];
  const used = new Set<string>();
  const map = header.map((h) => {
    const n = norm(h);
    if (n === 'id' || n === 'slug' || n === 'title' || n === 'titel') {
      const k = n === 'titel' ? 'title' : (n as 'id' | 'slug' | 'title');
      if (used.has(k)) return null;
      used.add(k);
      return k;
    }
    const f = fields.find((x) => norm(x.key) === n) ?? fields.find((x) => norm(x.label) === n);
    if (!f || used.has(f.key)) {
      if (n && n !== 'status') ignored.push(h.trim());
      return null;
    }
    used.add(f.key);
    return f;
  });
  return { map, ignored };
}
