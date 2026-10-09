/**
 * Admin interface in German, French, Italian or English. German is the
 * source: t() returns the German text unless another language is
 * loaded. The translations are one lazy chunk, fetched only when needed.
 */
export type AdminLang = 'de' | 'fr' | 'it' | 'en';
type Dict = Record<string, { fr: string; it: string; en: string }>;

let lang: AdminLang = 'de';
let dict: Dict = {};
/** Keys with {placeholders}, as patterns – for server messages that carry names or numbers. */
let patterns: { re: RegExp; names: string[]; key: string }[] = [];

export const adminLang = () => lang;
export const adminLocale = () => ({ de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-GB' })[lang];

/** Language for a person: their choice, else the browser's, else German. */
export function pickAdminLang(choice: string | null | undefined): AdminLang {
  if (choice === 'de' || choice === 'fr' || choice === 'it' || choice === 'en') return choice;
  for (const l of navigator.languages ?? [navigator.language]) {
    const two = l.slice(0, 2);
    if (two === 'de' || two === 'fr' || two === 'it' || two === 'en') return two;
  }
  return 'de';
}

export async function loadAdminLang(next: AdminLang): Promise<void> {
  lang = next;
  document.documentElement.lang = adminLocale();
  if (next === 'de') {
    dict = {};
    patterns = [];
    return;
  }
  const mod = await import('../i18n/all');
  dict = mod.ADMIN_DICT;
  // Patterns only from server messages and definitions – generic interface keys like «{name} entfernen» would match too much.
  patterns = Object.keys(mod.MESSAGE_DICT)
    .filter((k) => k.includes('{'))
    .map((key) => {
      const names: string[] = [];
      const src = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w+)\\?\}/g, (_, n: string) => (names.push(n), '(.+?)'));
      return { re: new RegExp(`^${src}$`), names, key };
    })
    // A key that is mostly placeholder («{x}: {y}») would match anything.
    .filter((p) => p.key.replace(/\{\w+\}/g, '').trim().length > 3);
}

function fill(text: string, params?: Record<string, string | number>) {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m)) : text;
}

/** Interface text, German as the key; {placeholders} are filled from params. */
export function t(de: string, params?: Record<string, string | number>): string {
  // 'Versand|Newsletter': same German word, other meaning – the part after | only tells the translations apart.
  const bar = de.indexOf('|');
  const source = bar < 0 ? de : de.slice(0, bar);
  if (lang === 'de') return fill(source, params);
  return fill(dict[de]?.[lang] ?? source, params);
}

/** A finished German message (e.g. from the server): exact match, else a pattern with placeholders. */
export function tm(message: string): string {
  if (lang === 'de' || !message) return message;
  const l = lang;
  const hit = dict[message]?.[l];
  if (hit) return hit;
  for (const p of patterns) {
    const m = p.re.exec(message);
    // Values inside the message (a field label, a block name) are translated too when they are known texts.
    if (m) return fill(dict[p.key][l], Object.fromEntries(p.names.map((n, i) => [n, dict[m[i + 1]]?.[l] ?? m[i + 1]])));
  }
  return message;
}

/** Labels that come from built-in definitions (blocks, fields, roles): translated if known, else as written. */
export const tl = (label: string | undefined | null) => (label ? t(label) : '');
