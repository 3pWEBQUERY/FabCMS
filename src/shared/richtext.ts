/**
 * Whitelist sanitizer for rich text. Runs on the server before anything is
 * stored, and in the editor bridge before content is sent. Only a small set
 * of tags survives; every attribute except a vetted href is dropped.
 */

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'code', 'sup', 'sub']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'textarea', 'select']);
const RENAME: Record<string, string> = { b: 'strong', i: 'em', div: 'p' };
const VOID = new Set(['br']);

export function safeHref(href: string): string | null {
  const h = href.trim().replace(/[\u0000-\u001f\s]+/g, '');
  if (/^(https?:|mailto:|tel:)/i.test(h)) return href.trim();
  if (/^[/#?]/.test(h) && !h.startsWith('//')) return href.trim();
  return null;
}

const escapeText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&(?!(#\d+|#x[\da-f]+|[a-z]+);)/gi, '&amp;');
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function sanitizeRichText(input: unknown): string {
  if (typeof input !== 'string' || !input) return '';
  const out: string[] = [];
  const open: string[] = [];
  let dropUntil: string | null = null;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s/>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const text = input.slice(last, m.index);
    if (!dropUntil && text) out.push(escapeText(text));
    last = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const raw = m[1].toLowerCase();
    const closing = m[0].startsWith('</');
    if (dropUntil) {
      if (closing && raw === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(raw)) {
      if (!closing && !m[0].endsWith('/>')) dropUntil = raw;
      continue;
    }
    const tag = RENAME[raw] ?? raw;
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      const idx = open.lastIndexOf(tag);
      if (idx === -1) continue;
      while (open.length > idx) out.push(`</${open.pop()}>`);
      continue;
    }
    if (VOID.has(tag)) {
      out.push('<br>');
      continue;
    }
    let attrs = '';
    if (tag === 'a') {
      const hrefMatch = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2] ?? '');
      const href = hrefMatch ? safeHref(decodeEntities(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '')) : null;
      if (!href) continue;
      attrs = ` href="${escapeAttr(href)}"`;
      if (/^https?:/i.test(href)) attrs += ' rel="noopener"';
    }
    out.push(`<${tag}${attrs}>`);
    open.push(tag);
  }
  if (!dropUntil) out.push(escapeText(input.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out
    .join('')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

/** Plain text from the canvas: collapsed whitespace. Escaping happens at render time. */
export function sanitizePlain(input: unknown, multiline = false): string {
  if (typeof input !== 'string') return '';
  const s = input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return multiline ? s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : s.replace(/\s+/g, ' ').trim();
}
