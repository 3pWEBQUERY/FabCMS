/**
 * Tiny HTML templating: every interpolated value is escaped unless it is
 * already a SafeHtml (i.e. produced by `html` or `raw`).
 */
export class SafeHtml {
  constructor(public readonly value: string) {}
  toString() {
    return this.value;
  }
}

export type Html = SafeHtml;
type Part = SafeHtml | string | number | boolean | null | undefined | Part[];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function flat(v: Part): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(flat).join('');
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += flat(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Trusted markup (already sanitized rich text, generated SVG). */
export const raw = (s: string | null | undefined) => new SafeHtml(s ?? '');

export const join = (parts: Part[], sep = '') => new SafeHtml(parts.map(flat).filter(Boolean).join(sep));

/** Builds a class attribute value from conditional parts. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Attribute for an inline-editable field; only emitted in edit mode. */
export function field(edit: boolean, path: string, kind: 'plain' | 'multi' | 'rich' = 'plain'): SafeHtml {
  if (!edit) return new SafeHtml('');
  return new SafeHtml(` data-nova-field="${esc(path)}" data-nova-kind="${kind}"`);
}

/** Multi-line plain text: escaped, line breaks become <br>. */
export const lines = (s: unknown) => raw(esc(s).replace(/\n/g, '<br>'));

/**
 * Heading of an item in a list (card, menu section, plan …): one level below
 * where it sits – h2 right under the page title, h3 under a section heading –
 * so screen readers get an outline without jumps. The class «hi» keeps the
 * look the same at either level (themes style `.card .hi`, not `.card h3`).
 * attrs is trusted markup; a class in it is merged.
 */
export const hx = (ctx: { hl?: number }, inner: Part, attrs: Part = ''): SafeHtml => {
  const n = ctx.hl ?? 3;
  let a = flat(attrs);
  a = /\sclass="/.test(a) ? a.replace(/\sclass="/, ' class="hi ') : `${a} class="hi"`;
  return new SafeHtml(`<h${n}${a}>${flat(inner)}</h${n}>`);
};
