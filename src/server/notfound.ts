import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { sql } from './db';
import { audit, requireAnyCap, type AppEnv } from './auth';
import { activeCollections } from './content';
import { entryPath } from '../shared/paths';

/** Probes for other systems and files – noise, not missing pages. */
const JUNK =
  /\.(php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|log|git|ya?ml|xml|txt|ico|png|jpe?g|gif|webp|svg|css|js|map|json|zip|gz|tar)$|^\/(wp-|wordpress|xmlrpc|\.well-known|\.git|cgi-bin|vendor|phpmyadmin|admin\.php)/i;

/** Remembers an address that led nowhere (without its query), unless it's a probe. */
export function recordMissing(c: Context, path: string): void {
  if (c.req.method !== 'GET' || path.length > 300 || JUNK.test(path)) return;
  const ref = c.req.header('referer');
  let referrer: string | null = null;
  try {
    // Only where people came from: the page, without query or fragment.
    if (ref) {
      const u = new URL(ref);
      referrer = `${u.origin}${u.pathname}`.slice(0, 300);
    }
  } catch {
    /* not a URL */
  }
  void sql`
    insert into not_found (path, referrer) values (${path}, ${referrer})
    on conflict (path) do update set hits = not_found.hits + 1, last_at = now(), referrer = coalesce(excluded.referrer, not_found.referrer)`.catch(() => {});
}

/**
 * The page an old address most likely meant, by the last part of it: the
 * same address, one that starts with it («sommerfest» → «sommerfest-2026»)
 * or one it starts with («speisekarte-alt» → «speisekarte»).
 */
async function suggestions(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const last = (p: string) => {
    let w = p.replace(/\/+$/, '').split('/').pop() ?? '';
    try {
      w = decodeURIComponent(w);
    } catch {
      /* keep it as it came */
    }
    return w.toLowerCase().replace(/\.html?$/, '');
  };
  const rows = await sql`select collection, slug from entries where status = 'published' and slug <> '' order by length(slug) limit 5000`;
  const cols = new Map((await activeCollections()).map((c) => [c.id, c]));
  for (const p of paths) {
    const w = last(p);
    if (w.length < 3) continue;
    const slug = (r: Record<string, unknown>) => r.slug as string;
    const hit = rows.find((r) => slug(r) === w) ?? rows.find((r) => slug(r).startsWith(w)) ?? [...rows].reverse().find((r) => slug(r).length >= 4 && w.startsWith(`${slug(r)}-`));
    const col = hit && cols.get(hit.collection as string);
    const to = col && entryPath(col, hit!.slug as string);
    if (to && to !== p) out.set(p, to);
  }
  return out;
}

/**
 * The 404 log: what visitors looked for and didn't find, most asked first,
 * with a guess where it should lead. One click makes it a redirect.
 */
export function notFoundApi(app: Hono<AppEnv>) {
  app.get('/api/not-found', async (c) => {
    requireAnyCap(c, 'settings.manage', 'content.publish');
    const rows = await sql`
      select n.path, n.hits, n.first_at, n.last_at, n.referrer from not_found n
      where not n.ignored and not exists (select 1 from redirects r where r.from_path = lower(n.path))
      order by n.hits desc, n.last_at desc limit 200`;
    const guess = await suggestions(rows.map((r) => r.path as string));
    return c.json({ missing: rows.map((r) => ({ ...r, suggestion: guess.get(r.path as string) ?? null })) });
  });

  app.post('/api/not-found/ignore', async (c) => {
    requireAnyCap(c, 'settings.manage', 'content.publish');
    const { paths } = z.object({ paths: z.array(z.string().max(300)).min(1).max(200) }).parse(await c.req.json());
    await sql`update not_found set ignored = true where path = any(${paths})`;
    await audit(c, 'notfound.ignore', 'redirects', undefined, { count: paths.length });
    return c.json({ ok: true });
  });
}
