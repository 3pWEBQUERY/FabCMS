import type { CollectionDef } from './types';

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
export const RESERVED_PREFIXES = ['admin', 'api', '_nova', 'media', 'warenkorb', 'kasse', 'bestellung', 'buchung', 'sitemap.xml', 'robots.txt', 'feed.xml'];
