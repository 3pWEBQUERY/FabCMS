const UMLAUTS: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
  ß: 'ss',
  é: 'e',
  è: 'e',
  ê: 'e',
  à: 'a',
  â: 'a',
  ç: 'c',
  ô: 'o',
  î: 'i',
  ï: 'i',
  ù: 'u',
  û: 'u',
  œ: 'oe',
  æ: 'ae',
};

export function slugify(input: string): string {
  return input
    .replace(/[äöüÄÖÜßéèêàâçôîïùûœæ]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' und ')
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/(^[-/]+|[-/]+$)/g, '')
    .replace(/-+/g, '-')
    .slice(0, 96);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/blockquote)\s*\/?>/gi, '$& ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(text: string, max = 158): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).replace(/[,.;:–-]+$/, '') + ' …';
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Minutes, rounded up, at 200 words per minute (typical for German prose). */
export function readingTime(text: string): number {
  return Math.max(1, Math.ceil(wordCount(text) / 200));
}

export type Lang = 'de' | 'fr' | 'it' | 'en';

function syllables(word: string, lang: Lang): number {
  const w = word.toLowerCase().replace(/[^a-zäöüéèêàâîôûçœ]/g, '');
  if (!w) return 0;
  const vowels = lang === 'de' ? /[aeiouyäöü]+/g : /[aeiouyéèêàâîôûœ]+/g;
  let count = (w.match(vowels) ?? []).length;
  if (lang === 'en' && w.endsWith('e') && count > 1) count--;
  if (lang === 'fr' && /[^aeiouy]es?$/.test(w) && count > 1) count--;
  return Math.max(1, count);
}

export interface Readability {
  score: number;
  sentences: number;
  words: number;
  avgSentenceLength: number;
  longSentences: number;
  label: string;
}

/**
 * Flesch reading ease with the language-specific adaptations:
 * Amstad (de), Kandel & Moles (fr), Flesch–Vacca (it), Flesch (en).
 */
export function readability(text: string, lang: Lang = 'de'): Readability {
  const sentences = text.split(/[.!?…]+(?:\s|$)/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 1);
  const words = text.split(/\s+/).filter((w) => /[a-zA-Zäöüéèà]/.test(w));
  const wc = words.length || 1;
  const sc = sentences.length || 1;
  const syl = words.reduce((s, w) => s + syllables(w, lang), 0);
  const asl = wc / sc;
  const asw = syl / wc;
  let score: number;
  switch (lang) {
    case 'de':
      score = 180 - asl - 58.5 * asw;
      break;
    case 'fr':
      score = 207 - 1.015 * asl - 73.6 * asw;
      break;
    case 'it':
      score = 217 - 1.3 * asl - 0.6 * (asw * 100);
      break;
    default:
      score = 206.835 - 1.015 * asl - 84.6 * asw;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 22).length;
  const label =
    score >= 70 ? 'leicht lesbar' : score >= 50 ? 'mittelschwer' : score >= 30 ? 'anspruchsvoll' : 'schwer lesbar';
  return { score, sentences: sentences.length, words: words.length, avgSentenceLength: Math.round(asl), longSentences, label };
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export function shortId(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function formatMoney(cents: number, currency = 'CHF', locale = 'de-CH'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** Swiss price notation without currency: 24.50 / 18.– */
export function formatPrice(cents: number): string {
  const francs = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `${francs}.–` : `${francs}.${String(rest).padStart(2, '0')}`;
}

export function relativeTime(iso: string | Date, now = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return 'gerade eben';
  if (s < 90) return 'vor einer Minute';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Minuten`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'vor einer Stunde' : `vor ${h} Stunden`;
  const days = Math.round(h / 24);
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return d.toLocaleDateString('de-CH', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
