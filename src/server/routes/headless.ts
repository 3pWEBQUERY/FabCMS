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
import { graphql, printSchema, specifiedRules, validate, parse, GraphQLError } from 'graphql';
import { currentSchema, depthLimit } from '../graphql';
import { generateSdk } from '../sdk';
import { cliScript } from '../../site/assets';
import { getSettings } from '../settings';
import { env } from '../env';
import { mediaLoader } from '../../site/context';
import { localized, localizedOne, parseLang, requestLang } from '../translations';

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
    version: e.version,
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
    // ?lang=fr: published translations laid over the content (drafts stay in the main language).
    const lang = c.req.method === 'GET' || c.req.path === '/api/v1/graphql' ? await parseLang(c.req.query('lang')) : null;
    if (lang) await requestLang.run(lang, next);
    else await next();
  });

  app.get('/api/v1', async (c) =>
    c.json({
      name: 'Nova Content API',
      version: 1,
      endpoints: {
        collections: '/api/v1/collections',
        entries: '/api/v1/{collection}?limit=20&offset=0&sort=-published_at&filter[category]=…',
        entry: '/api/v1/{collection}/{slug}',
        graphql: '/api/v1/graphql',
        graphql_schema: '/api/v1/graphql/schema.graphql',
        typescript_sdk: '/api/v1/sdk.ts',
        cli: '/api/v1/cli.mjs',
      },
    }),
  );

  app.get('/api/v1/sdk.ts', async (c) => {
    const sdk = generateSdk(await activeCollections(), { name: (await getSettings()).name, url: env.publicUrl });
    return c.body(sdk, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'inline; filename="nova.ts"' });
  });

  app.get('/api/v1/cli.mjs', async (c) =>
    c.body(await cliScript(), 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Disposition': 'inline; filename="nova.mjs"' }),
  );

  /* GraphQL: same tokens and rules as REST. */

  app.get('/api/v1/graphql/schema.graphql', async (c) => c.text(printSchema(await currentSchema())));

  const runGraphql = async (c: Context<AppEnv>, body: { query?: unknown; variables?: unknown; operationName?: unknown }) => {
    if (typeof body.query !== 'string' || !body.query.trim()) return c.json({ errors: [{ message: 'Es fehlt eine Abfrage (query).' }] }, 400);
    if (body.query.length > 20_000) return c.json({ errors: [{ message: 'Die Abfrage ist zu lang.' }] }, 400);
    const schema = await currentSchema();
    let doc;
    try {
      doc = parse(body.query);
    } catch (e) {
      return c.json({ errors: [{ message: (e as GraphQLError).message }] }, 400);
    }
    const invalid = validate(schema, doc, [...specifiedRules, depthLimit]);
    if (invalid.length) return c.json({ errors: invalid.map((e) => ({ message: e.message, locations: e.locations })) }, 400);
    const isMutation = doc.definitions.some((d) => d.kind === 'OperationDefinition' && d.operation === 'mutation');
    if (isMutation && c.req.method !== 'POST') return c.json({ errors: [{ message: 'Änderungen nur per POST.' }] }, 405);
    const token = await tokenScopes(c);
    const result = await graphql({
      schema,
      source: body.query,
      variableValues: body.variables && typeof body.variables === 'object' ? (body.variables as Record<string, unknown>) : undefined,
      operationName: typeof body.operationName === 'string' ? body.operationName : undefined,
      contextValue: { token, media: mediaLoader(), entries: new Map() },
    });
    return c.json({
      ...result,
      errors: result.errors?.map((e) => ({
        message: e.originalError && !(e.originalError instanceof GraphQLError) && !(e.originalError instanceof HttpError) ? 'Interner Fehler.' : e.message,
        path: e.path,
      })),
    });
  };
  app.post('/api/v1/graphql', async (c) => runGraphql(c, await c.req.json().catch(() => ({}))));
  app.get('/api/v1/graphql', async (c) => {
    const q = c.req.query();
    let variables: unknown;
    try {
      variables = q.variables ? JSON.parse(q.variables) : undefined;
    } catch {
      return c.json({ errors: [{ message: 'variables ist kein gültiges JSON.' }] }, 400);
    }
    return runGraphql(c, { query: q.query, variables, operationName: q.operationName });
  });

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
    const items = drafts ? rows : await localized(rows.map((r) => ({ ...r, data: r.published_data })) as never[], col);
    return c.json({
      data: items.map((r: Record<string, any>) => shape(col, drafts ? r : { ...r, published_data: r.data }, Boolean(drafts), Boolean(token))),
      meta: { total: Number(rows[0]?.total ?? 0), limit, offset },
    });
  });

  app.get('/api/v1/:collection/:slug{.+}', async (c) => {
    const token = await tokenScopes(c);
    const col = await getCollection(c.req.param('collection'));
    const slug = c.req.param('slug') === '_home' ? '' : c.req.param('slug');
    const [e] = await sql`select * from entries where collection = ${col.id} and slug = ${slug} and status = 'published'`;
    if (!e) throw notFound();
    const l = await localizedOne({ id: e.id as string, data: e.published_data }, col);
    return c.json({ data: shape(col, { ...e, published_data: l!.data }, false, Boolean(token)) });
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
    const body = (await c.req.json()) as { data: EntryData; slug?: string; publish?: boolean; version?: number };
    const [cur] = await sql`select id from entries where id = ${c.req.param('id')} and collection = ${c.req.param('collection')}`;
    if (!cur) throw notFound();
    const e = await updateEntry(
      cur.id as string,
      { data: body.data as unknown as Record<string, unknown>, slug: body.slug, baseVersion: typeof body.version === 'number' ? body.version : undefined },
      ctx,
    );
    const result = body.publish ? (await publishEntry(e.id, ctx.userId)).entry : e;
    return c.json({ data: shape(await getCollection(result.collection), result, true) });
  });
}
