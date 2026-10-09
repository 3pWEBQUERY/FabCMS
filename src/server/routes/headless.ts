import type { Context, Hono } from 'hono';
import { sql } from '../db';
import type { AppEnv } from '../auth';
import { activeCollections, createEntry, getCollection, publishEntry, updateEntry } from '../content';
import { sha256 } from '../lib/crypto';
import { HttpError, notFound } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { clientIp } from '../lib/http';
import { entryPath } from '../../shared/paths';
import { entryAccess } from '../../shared/members';
import type { EntryData } from '../../shared/types';

/**
 * Headless REST API. Published content is public (read without token, CORS
 * open); drafts and writes need a bearer token from the Werkbank.
 */
async function tokenScopes(c: Context<AppEnv>): Promise<{ id: string; scopes: string[]; userId: string | null } | null> {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const [t] = await sql`select id, scopes, created_by from api_tokens where token_hash = ${sha256(auth.slice(7).trim())}`;
  if (!t) throw new HttpError(401, 'Ungültiges API-Token.');
  void sql`update api_tokens set last_used_at = now() where id = ${t.id}`.catch(() => {});
  return { id: t.id as string, scopes: t.scopes as string[], userId: t.created_by as string | null };
}

function shape(c: { id: string; route: string | null }, e: Record<string, any>, includeDraft: boolean, token = includeDraft) {
  const data = includeDraft ? e.data : e.published_data;
  // Members-only content: without an API token only what the paywall shows (title, excerpt, cover).
  const open = token || entryAccess(data) === 'public';
  return {
    id: e.id,
    slug: e.slug,
    path: entryPath(c as never, e.slug),
    status: e.status,
    published_at: e.published_at,
    updated_at: e.updated_at,
    data: open ? data : { ...data, blocks: [], body: undefined, description: undefined },
  };
}

export function headlessRoutes(app: Hono<AppEnv>) {
  app.use('/api/v1/*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    if (!rateLimit(`v1:${clientIp(c)}`, 300, 60_000).ok) throw new HttpError(429, 'Zu viele Anfragen.');
    await next();
  });

  app.get('/api/v1', async (c) =>
    c.json({
      name: 'Nova Content API',
      version: 1,
      endpoints: {
        collections: '/api/v1/collections',
        entries: '/api/v1/{collection}?limit=20&offset=0&sort=-published_at&filter[category]=…',
        entry: '/api/v1/{collection}/{slug}',
      },
    }),
  );

  app.get('/api/v1/collections', async (c) => {
    const cols = await activeCollections();
    return c.json({ data: cols.map((x) => ({ id: x.id, name: x.name, singular: x.singular, fields: x.fields, route: x.route, list_route: x.list_route })) });
  });

  app.get('/api/v1/:collection', async (c) => {
    const token = await tokenScopes(c);
    const col = (await activeCollections()).find((x) => x.id === c.req.param('collection'));
    if (!col || col.id === 'sections') throw notFound('Diesen Inhaltstyp gibt es nicht.');
    const q = c.req.query();
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const offset = Math.max(0, Number(q.offset) || 0);
    const drafts = q.status === 'all' && token?.scopes.includes('read');
    const field = (q.sort ?? '-published_at').replace(/^-/, '');
    const dir = q.sort?.startsWith('-') || !q.sort ? sql`desc` : sql`asc`;
    const order = ['published_at', 'updated_at', 'created_at'].includes(field)
      ? sql`${sql(field)} ${dir} nulls last`
      : /^[a-zA-Z_]\w{0,40}$/.test(field)
        ? sql`published_data ->> ${field} ${dir} nulls last`
        : sql`published_at desc`;
    const filters = Object.entries(q)
      .filter(([k]) => /^filter\[[a-zA-Z_]\w{0,40}\]$/.test(k))
      .map(([k, v]) => sql`and coalesce(${drafts ? sql`data` : sql`published_data`} ->> ${k.slice(7, -1)}, '') = ${v}`);
    const where = drafts ? sql`collection = ${col.id}` : sql`collection = ${col.id} and status = 'published'`;
    const rows = await sql`
      select *, count(*) over() as total from entries where ${where} ${filters.length ? filters.reduce((a, b) => sql`${a} ${b}`) : sql``}
      order by ${order} limit ${limit} offset ${offset}`;
    return c.json({ data: rows.map((r) => shape(col, r, Boolean(drafts), Boolean(token))), meta: { total: Number(rows[0]?.total ?? 0), limit, offset } });
  });

  app.get('/api/v1/:collection/:slug{.+}', async (c) => {
    const token = await tokenScopes(c);
    const col = await getCollection(c.req.param('collection'));
    const slug = c.req.param('slug') === '_home' ? '' : c.req.param('slug');
    const [e] = await sql`select * from entries where collection = ${col.id} and slug = ${slug} and status = 'published'`;
    if (!e) throw notFound();
    return c.json({ data: shape(col, e, false, Boolean(token)) });
  });

  /* writes */

  async function writer(c: Context<AppEnv>) {
    const t = await tokenScopes(c);
    if (!t?.scopes.includes('write')) throw new HttpError(401, 'Für Änderungen braucht es ein API-Token mit Schreibrecht.');
    return { userId: t.userId ?? '', canCode: false, studioOnly: false };
  }

  app.post('/api/v1/:collection', async (c) => {
    const ctx = await writer(c);
    const body = (await c.req.json()) as { data: Record<string, unknown>; slug?: string; publish?: boolean };
    const e = await createEntry(c.req.param('collection'), body.data ?? {}, ctx, body.slug);
    const result = body.publish ? (await publishEntry(e.id, ctx.userId)).entry : e;
    return c.json({ data: shape(await getCollection(result.collection), result, true) }, 201);
  });

  app.put('/api/v1/:collection/:id', async (c) => {
    const ctx = await writer(c);
    const body = (await c.req.json()) as { data: EntryData; slug?: string; publish?: boolean };
    const [cur] = await sql`select id from entries where id = ${c.req.param('id')} and collection = ${c.req.param('collection')}`;
    if (!cur) throw notFound();
    const e = await updateEntry(cur.id as string, { data: body.data as unknown as Record<string, unknown>, slug: body.slug }, ctx);
    const result = body.publish ? (await publishEntry(e.id, ctx.userId)).entry : e;
    return c.json({ data: shape(await getCollection(result.collection), result, true) });
  });
}
