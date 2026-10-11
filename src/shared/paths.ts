import type { CollectionDef } from './types';
import { slugify } from './text';

/** Public URL path of an entry, or null if the collection has no detail pages. */
export function entryPath(c: Pick<CollectionDef, 'id' | 'route'>, slug: string): string | null {
  if (c.id === 'pages') return slug ? `/${slug}` : '/';
  if (!c.route) return null;
  return c.route.replace(':slug', slug);
}

/** Matches a request path against a route pattern like /journal/:slug. */
export function matchRoute(route: string, path: string): string | null {
  const [prefix, suffix = ''] = route.split(':slug');
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return null;
  const slug = path.slice(prefix.length, path.length - suffix.length);
  return slug && !slug.includes('/') ? slug : null;
}

/** Paths Nova uses itself; pages can't take them. */
export const RESERVED_PREFIXES = ['de', 'fr', 'it', 'en', 'admin', 'api', '_nova', 'media', 'warenkorb', 'kasse', 'bestellung', 'buchung', 'newsletter', 'konto', 'tickets', 'spende', 'bestellen', 'essen', 'sitemap.xml', 'robots.txt', 'feed.xml'];

/**
 * A link someone typed that may lead to a page that does not exist yet – «/team»
 * or «Unser Team» – as the page it would become. Nothing for addresses
 * elsewhere, e-mail, anchors, files or the home page.
 */
export function pageForLink(typed: string): { title: string; slug: string } | null {
  const s = typed.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//') || /^www\./i.test(s) || /^[#?]/.test(s) || s.includes('@')) return null;
  const path = s.startsWith('/') ? s.split(/[?#]/)[0] : null;
  if (path !== null && /\.[a-z0-9]{1,5}$/i.test(path)) return null;
  const slug = slugify(path ?? s);
  if (!slug) return null;
  const words = path === null ? s.replace(/\s+/g, ' ') : (slug.split('/').pop() ?? slug).replace(/-/g, ' ');
  return { title: (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 120), slug };
}

/**
 * Addresses on this website a content links to: link fields, buttons, menus
 * and links inside its texts – without parameters, anchors and a closing slash.
 */
export function linkedPaths(data: unknown): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const path = raw.split(/[?#]/)[0].replace(/(.)\/+$/, '$1');
    if (/^\/(?!\/)[^\s"'<>]*$/.test(path)) out.add(path);
  };
  const walk = (v: unknown, depth: number): void => {
    if (depth > 40) return;
    if (typeof v === 'string') {
      if (v.startsWith('/')) add(v);
      else if (v.includes('href=')) for (const m of v.matchAll(/href="(\/[^"]*)"/g)) add(m[1].replace(/&amp;/g, '&'));
    } else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(data, 0);
  return [...out];
}
