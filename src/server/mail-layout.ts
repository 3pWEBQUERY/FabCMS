import { env } from './env';
import { sql } from './db';
import { resolveTheme } from '../site/themes';
import { variantUrl } from '../site/picture';
import type { SiteSettings } from '../shared/types';

export const esc = (v: unknown) => String(v ?? '').replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[ch]!);
const base = (s: SiteSettings) => (s.baseUrl || env.publicUrl).replace(/\/$/, '');

export function colors(s: SiteSettings) {
  const { palette } = resolveTheme(s);
  // A colour chosen for mails wins; otherwise the theme's. Mail clients show light
  // backgrounds, so dark palettes keep their accent for lines only.
  const own = /^#[0-9a-f]{6}$/i.test(s.mail?.color ?? '') ? s.mail.color : null;
  if (own) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(own.slice(i, i + 2), 16));
    return { accent: own, accentInk: 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#1c1b19' : '#ffffff' };
  }
  return { accent: palette.dark ? '#1c1b19' : palette.accent, accentInk: palette.dark ? '#ffffff' : palette.accentInk };
}

export function button(s: SiteSettings, href: string, label: string) {
  const c = colors(s);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:6px;background:${c.accent}"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-weight:600;color:${c.accentInk};text-decoration:none;border-radius:6px">${esc(label)}</a></td></tr></table>`;
}

/** The logo as a plain image URL every mail client shows, or null. */
export async function mailLogo(s: SiteSettings): Promise<string | null> {
  if (!s.logo || s.mail?.logo === false) return null;
  const [m] = await sql`select id, version, width from media where id = ${s.logo}`;
  return m?.width ? base(s) + variantUrl(m as { id: string; version: number }, 480, 'jpg') : null;
}

/** Table layout and inline styles: what Outlook, Gmail and Apple Mail all understand. */
export function shell(s: SiteSettings, body: string, footer: string, preheader = '', lang = 'de', logo: string | null = null): string {
  const address = [s.business.legalName || s.name, s.business.street, [s.business.zip, s.business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const own = s.mail?.footer?.trim();
  const head = logo ? `<img src="${esc(logo)}" alt="${esc(s.name)}" height="40" style="display:block;height:40px;width:auto;max-width:240px;border:0">` : esc(s.name);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(s.name)}</title></head>
<body style="margin:0;padding:0;background:#f3f2ee;-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2ee"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:10px;border-top:4px solid ${colors(s).accent};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1c1b19">
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:700;letter-spacing:-.01em">${head}</td></tr>
<tr><td style="padding:16px 32px 32px">${body}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6b66">
<tr><td style="padding:20px 32px">${footer}${own ? `<p style="margin:8px 0 0">${esc(own).replace(/\n/g, '<br>')}</p>` : ''}${address ? `<p style="margin:8px 0 0">${esc(address)}</p>` : ''}</td></tr>
</table>
</td></tr></table></body></html>`;
}

/**
 * A plain-text mail as HTML in the site's look: paragraphs at blank lines,
 * links clickable, a line that is only a link becomes a button.
 */
export function textToHtml(s: SiteSettings, text: string): string {
  const link = (t: string) => esc(t).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)»]/g, (u) => `<a href="${u}" style="color:inherit">${u}</a>`);
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // «Bestellung ansehen: https://…» on its own: a button with the words before the link.
      const m = /^([^\n]{2,60}?):?\s+(https?:\/\/\S+)$/.exec(p);
      if (m && !p.includes('\n')) return `<div style="margin:0 0 16px">${button(s, m[2], m[1].replace(/:$/, ''))}</div>`;
      if (/^https?:\/\/\S+$/.test(p)) return `<p style="margin:0 0 16px;word-break:break-all">${link(p)}</p>`;
      return `<p style="margin:0 0 16px">${link(p).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}
