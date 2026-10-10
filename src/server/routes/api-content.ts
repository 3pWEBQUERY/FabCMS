import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { notify } from '../notify';
import { sql, json } from '../db';
import { audit, requireAnyCap, requireCap, requireUser, type AppEnv, type AuthUser } from '../auth';
import {
  activeCollections,
  createEntry,
  deleteEntry,
  restoreEntry,
  getCollection,
  getEntry,
  listCollections,
  publishBlockers,
  publishEntry,
  sanitizeBlocks,
  saveCollection,
  unpublishEntry,
  updateEntry,
  invalidateCollections,
  type SaveContext,
} from '../content';
import { deleteMedia } from '../media';
import { externalChange } from '../collab';
import { badRequest, forbidden, notFound } from '../lib/http';
import { can } from '../../shared/roles';
import type { Entry, EntryData } from '../../shared/types';
import { getSettings, bumpGeneration } from '../settings';
import { createContext, renderPage, templateContext } from '../../site/render';
import { HEADED_BLOCKS, renderBlocks } from '../../site/blocks';
import { env } from '../env';
import { entryPath } from '../../shared/paths';
import type { Lang } from '../../shared/i18n';
import {
  deleteTranslation,
  discardTranslation,
  parseLang,
  publishTranslation,
  requestLang,
  saveTranslation,
  translationStatus,
  translationView,
  unpublishTranslation,
} from '../translations';

const withLang = <T>(lang: Lang | null, fn: () => Promise<T>) => (lang ? requestLang.run(lang, fn) : fn());

/** Public address of an entry in another language. */
async function langPath(col: { route: string | null; id: string }, slug: string, lang: Lang): Promise<string | null> {
  const p = entryPath(col as never, slug);
  if (!p) return null;
  return p === '/' ? `/${lang}` : `/${lang}${p}`;
}

function saveCtx(user: AuthUser): SaveContext {
  return {
    userId: user.id,
    canCode: can(user.role, 'dev') && user.mode === 'werkbank',
    studioOnly: user.mode !== 'werkbank' || !can(user.role, 'dev'),
  };
}

function assertCanEdit(user: AuthUser, e: Pick<Entry, 'author_id'>) {
  if (can(user.role, 'content.edit')) return;
  if (can(user.role, 'content.edit.own') && e.author_id === user.id) return;
  throw forbidden('Du kannst nur deine eigenen Beiträge bearbeiten.');
}

async function base() {
  const s = await getSettings();
  return (s.baseUrl || env.publicUrl).replace(/\/$/, '');
}

function listRow(r: Record<string, any>) {
  const { blocks: _b, seo: _s, ...rest } = (r.data ?? {}) as EntryData;
  return {
    id: r.id,
    collection: r.collection,
    slug: r.slug,
    status: r.status,
    title: (r.data as EntryData)?.title ?? '',
    fields: rest,
    publish_at: r.publish_at,
    unpublish_at: r.unpublish_at ?? null,
    published_at: r.published_at,
    updated_at: r.updated_at,
    sort_index: r.sort_index,
    author_id: r.author_id,
    author_name: r.author_name,
    changed: r.status === 'published' && r.changed,
  };
}

async function canvasContext(c: Context<AppEnv>, entry: Entry, data: EntryData, edit: boolean, lang: Lang | null = null) {
  const settings = await getSettings();
  const collection = await getCollection(entry.collection);
  const ctx = createContext({
    lang: lang ?? undefined,
    settings,
    collections: await activeCollections(),
    path: entryPath(collection, entry.slug) ?? '/',
    base: await base(),
    query: new URL(c.req.url).searchParams,
    edit,
    preview: true,
    ageOk: true,
  });
  // A page template shows a real entry of its type while it is designed.
  if (collection.id === 'sections') await templateContext(ctx, data);
  return {
    ctx,
    collection,
    renderEntry: { id: entry.id, slug: entry.slug, data, published_at: entry.published_at, updated_at: entry.updated_at, version: entry.version, author_name: null },
  };
}

export function contentApi(app: Hono<AppEnv>) {
  /* ---------- collections ---------- */

  app.get('/api/collections', async (c) => {
    requireUser(c);
    const active = new Set((await activeCollections()).map((x) => x.id));
    const counts = await sql`select collection, count(*)::int as n, count(*) filter (where status = 'review')::int as review from entries group by collection`;
    return c.json({
      collections: (await listCollections()).map((x) => ({
        ...x,
        active: active.has(x.id),
        count: counts.find((r) => r.collection === x.id)?.n ?? 0,
        review: counts.find((r) => r.collection === x.id)?.review ?? 0,
      })),
    });
  });

  app.post('/api/collections', async (c) => {
    requireCap(c, 'dev');
    const body = await c.req.json();
    const col = await saveCollection(body, true);
    await audit(c, 'collection.create', 'collection', col.id);
    return c.json({ collection: col });
  });

  app.put('/api/collections/:id', async (c) => {
    requireCap(c, 'dev');
    const body = await c.req.json();
    const col = await saveCollection({ ...body, id: c.req.param('id') }, false);
    await audit(c, 'collection.update', 'collection', col.id);
    return c.json({ collection: col });
  });

  app.delete('/api/collections/:id', async (c) => {
    requireCap(c, 'dev');
    const col = await getCollection(c.req.param('id'));
    if (col.builtin) throw badRequest('Eingebaute Inhaltstypen lassen sich nicht löschen – deaktiviere stattdessen das Modul.');
    const [{ n }] = await sql`select count(*)::int as n from entries where collection = ${col.id}`;
    if (n > 0 && c.req.query('force') !== '1') throw badRequest(`Dieser Typ hat noch ${n} Einträge. Lösche sie zuerst oder bestätige das endgültige Löschen.`, { count: n });
    await sql`delete from collections where id = ${col.id}`;
    invalidateCollections();
    bumpGeneration();
    await audit(c, 'collection.delete', 'collection', col.id, { entries: n });
    return c.json({ ok: true });
  });

  /* ---------- entries ---------- */

  app.get('/api/entries', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const q = c.req.query();
    const collection = q.collection ?? 'pages';
    await getCollection(collection);
    const limit = Math.min(500, Number(q.limit) || 200);
    const offset = Number(q.offset) || 0;
    const own = !can(user.role, 'content.edit') ? sql`and e.author_id = ${user.id}` : sql``;
    const status = q.status ? sql`and e.status = ${q.status}` : sql``;
    const search = q.q ? sql`and (e.data ->> 'title' ilike ${'%' + q.q.replace(/[%_]/g, '') + '%'} or e.slug ilike ${'%' + q.q.replace(/[%_]/g, '') + '%'})` : sql``;
    const rows = await sql`
      select e.id, e.collection, e.slug, e.status, e.data, e.publish_at, e.unpublish_at, e.published_at, e.updated_at, e.sort_index, e.author_id,
             u.name as author_name, (e.published_data is distinct from e.data) as changed, count(*) over() as total
      from entries e left join users u on u.id = e.author_id
      where e.collection = ${collection} ${own} ${status} ${search}
      order by ${collection === 'pages' ? sql`e.slug = '' desc, e.slug asc` : sql`e.sort_index asc, e.updated_at desc`}
      limit ${limit} offset ${offset}`;
    const trs = await translationStatus(rows.map((r) => r.id as string));
    return c.json({ entries: rows.map((r) => ({ ...listRow(r), translations: trs.get(r.id as string) ?? [] })), total: Number(rows[0]?.total ?? 0) });
  });

  app.get('/api/entries/review', async (c) => {
    requireCap(c, 'content.publish');
    const rows = await sql`
      select e.id, e.collection, e.slug, e.status, e.data, e.publish_at, e.unpublish_at, e.published_at, e.updated_at, e.sort_index, e.author_id,
             u.name as author_name, false as changed
      from entries e left join users u on u.id = e.author_id where e.status = 'review' order by e.updated_at desc`;
    return c.json({ entries: rows.map(listRow) });
  });

  app.get('/api/entries/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const col = await getCollection(e.collection);
    const lang = await parseLang(c.req.query('lang'));
    const translations = (await translationStatus([e.id])).get(e.id) ?? [];
    if (lang) {
      const v = await translationView(e, lang);
      return c.json({
        entry: v,
        collection: col,
        path: await langPath(col, v.slug, lang),
        blockers: publishBlockers(col, v.data),
        translations,
        original: { status: e.status, slug: e.slug },
      });
    }
    return c.json({ entry: e, collection: col, path: entryPath(col, e.slug), blockers: publishBlockers(col, e.data), translations });
  });

  app.post('/api/entries', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z.object({ collection: z.string(), data: z.record(z.string(), z.unknown()).default({}), slug: z.string().optional() }).parse(await c.req.json());
    if (!can(user.role, 'content.edit') && !['posts'].includes(body.collection)) throw forbidden('Autoren können nur Beiträge anlegen.');
    const e = await createEntry(body.collection, body.data, saveCtx(user), body.slug);
    await audit(c, 'entry.create', body.collection, e.id, { title: e.data.title });
    return c.json({ entry: e });
  });

  app.put('/api/entries/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const id = c.req.param('id');
    const cur = await getEntry(id);
    assertCanEdit(user, cur);
    const body = z
      .object({ data: z.record(z.string(), z.unknown()), slug: z.string().optional(), baseVersion: z.number().int().optional(), stockTouched: z.boolean().optional() })
      .parse(await c.req.json());
    const lang = await parseLang(c.req.query('lang'));
    if (lang) {
      const v = await saveTranslation(cur, lang, body, saveCtx(user));
      const col = await getCollection(cur.collection);
      return c.json({ entry: v, path: await langPath(col, v.slug, lang), blockers: publishBlockers(col, v.data) });
    }
    const e = await updateEntry(id, body, saveCtx(user));
    const col = await getCollection(e.collection);
    return c.json({ entry: e, path: entryPath(col, e.slug), blockers: publishBlockers(col, e.data) });
  });

  app.post('/api/entries/:id/publish', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const id = c.req.param('id');
    const cur = await getEntry(id);
    assertCanEdit(user, cur);
    const body = z.object({ at: z.string().datetime({ offset: true }).nullable().optional() }).parse(await c.req.json().catch(() => ({})));
    const lang = await parseLang(c.req.query('lang'));
    if (lang) {
      if (!can(user.role, 'content.publish')) throw forbidden('Übersetzungen veröffentlichen darf, wer veröffentlichen darf.');
      const v = await publishTranslation(cur, lang);
      await audit(c, 'translation.publish', cur.collection, id, { lang });
      const col = await getCollection(cur.collection);
      const path = await langPath(col, v.slug, lang);
      return c.json({ entry: v, firstPublish: false, url: path ? (await base()) + path : null });
    }
    if (!can(user.role, 'content.publish')) {
      const [e] = await sql`update entries set status = 'review', updated_at = now() where id = ${id} returning *`;
      await audit(c, 'entry.review', cur.collection, id);
      const where = cur.collection === 'pages' ? `/seiten/${id}` : `/inhalte/${cur.collection}/${id}`;
      void notify({
        kind: 'review',
        cap: 'content.publish',
        title: `Freigabe erbeten: ${(cur.data.title as string) || 'Ohne Titel'}`,
        body: `${user.name} möchte das veröffentlichen.`,
        href: where,
      });
      return c.json({ entry: e, review: true });
    }
    const { entry, firstPublish } = await publishEntry(id, user.id, body.at ? new Date(body.at) : null);
    await audit(c, entry.status === 'scheduled' ? 'entry.schedule' : 'entry.publish', entry.collection, id, { title: entry.data.title, at: body.at });
    const col = await getCollection(entry.collection);
    const path = entryPath(col, entry.slug);
    return c.json({ entry, firstPublish, url: path ? (await base()) + path : null });
  });

  app.post('/api/entries/:id/unpublish', async (c) => {
    requireCap(c, 'content.publish');
    const lang = await parseLang(c.req.query('lang'));
    if (lang) return c.json({ entry: await unpublishTranslation(await getEntry(c.req.param('id')), lang) });
    const e = await unpublishEntry(c.req.param('id'));
    await audit(c, 'entry.unpublish', e.collection, e.id);
    return c.json({ entry: e });
  });

  /** Expiry: the entry goes offline by itself at this time (null: stays). */
  app.post('/api/entries/:id/expiry', async (c) => {
    requireCap(c, 'content.publish');
    const { at } = z.object({ at: z.string().datetime({ offset: true }).nullable() }).parse(await c.req.json());
    if (at && new Date(at).getTime() <= Date.now()) throw badRequest('Das Ablaufdatum muss in der Zukunft liegen.');
    const [e] = await sql`update entries set unpublish_at = ${at} where id = ${c.req.param('id')} returning *`;
    if (!e) throw notFound();
    await audit(c, 'entry.expiry', e.collection as string, e.id as string, { at });
    return c.json({ entry: e });
  });

  app.post('/api/entries/:id/discard', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const cur = await getEntry(c.req.param('id'));
    assertCanEdit(user, cur);
    const lang = await parseLang(c.req.query('lang'));
    if (lang) return c.json({ entry: await discardTranslation(cur, lang) });
    if (!cur.published_data) throw badRequest('Es gibt keine veröffentlichte Fassung, zu der man zurückkehren könnte.');
    const [e] =
      await sql`update entries set data = published_data, slug = coalesce(published_slug, slug), version = version + 1, updated_at = now() where id = ${cur.id} returning *`;
    void externalChange(cur.id);
    await audit(c, 'entry.discard', cur.collection, cur.id);
    return c.json({ entry: e });
  });

  app.post('/api/entries/:id/duplicate', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const cur = await getEntry(c.req.param('id'));
    assertCanEdit(user, cur);
    const data = structuredClone(cur.data);
    data.title = `${data.title} (Kopie)`;
    const e = await createEntry(cur.collection, data, saveCtx(user));
    await audit(c, 'entry.duplicate', cur.collection, e.id, { from: cur.id });
    return c.json({ entry: e });
  });

  app.delete('/api/entries/:id', async (c) => {
    const user = requireAnyCap(c, 'content.delete', 'content.edit.own');
    const cur = await getEntry(c.req.param('id'));
    if (!can(user.role, 'content.delete')) {
      if (cur.author_id !== user.id || cur.status === 'published') throw forbidden('Du kannst nur eigene, unveröffentlichte Entwürfe löschen.');
    }
    await deleteEntry(cur.id, user.id);
    await audit(c, 'entry.delete', cur.collection, cur.id, { title: cur.data.title });
    return c.json({ ok: true, trash: true });
  });

  /* ---------- editorial calendar: what went online, what is planned, what expires ---------- */

  app.get('/api/calendar', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const q = z.object({ from: z.string().date(), to: z.string().date() }).parse(c.req.query());
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000);
    if (to.getTime() - from.getTime() > 100 * 86_400_000) throw badRequest('Höchstens 100 Tage auf einmal.');
    const own = can(user.role, 'content.edit') ? sql`` : sql`and author_id = ${user.id}`;
    const rows = await sql`
      select id, collection, slug, status, data ->> 'title' as title, 'published' as kind, published_at as at from entries
        where status = 'published' and published_at >= ${from} and published_at < ${to} and collection <> 'sections' ${own}
      union all
      select id, collection, slug, status, data ->> 'title', 'scheduled', publish_at from entries
        where status = 'scheduled' and publish_at >= ${from} and publish_at < ${to} ${own}
      union all
      select id, collection, slug, status, data ->> 'title', 'expires', unpublish_at from entries
        where unpublish_at >= ${from} and unpublish_at < ${to} ${own}
      order by at`;
    return c.json({ items: rows });
  });

  /* ---------- bulk: many entries at once, each checked like a single one ---------- */

  app.post('/api/entries/bulk', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(['publish', 'unpublish', 'trash', 'duplicate', 'set']),
        field: z.string().regex(/^[a-z][\w]{0,40}$/).optional(),
        value: z.unknown().optional(),
      })
      .parse(await c.req.json());
    if ((body.action === 'publish' || body.action === 'unpublish') && !can(user.role, 'content.publish'))
      throw forbidden('Veröffentlichen und offline nehmen darf, wer veröffentlichen darf.');
    const done: string[] = [];
    const failed: { id: string; title: string; error: string }[] = [];
    for (const id of [...new Set(body.ids)]) {
      let title = '';
      try {
        const cur = await getEntry(id);
        title = String(cur.data.title ?? '');
        if (body.action === 'trash') {
          if (!can(user.role, 'content.delete') && (cur.author_id !== user.id || cur.status === 'published')) throw forbidden('Du kannst nur eigene, unveröffentlichte Entwürfe löschen.');
          await deleteEntry(id, user.id);
        } else {
          assertCanEdit(user, cur);
          if (body.action === 'publish') await publishEntry(id, user.id, null);
          else if (body.action === 'unpublish') {
            if (cur.status === 'published') await unpublishEntry(id);
          } else if (body.action === 'duplicate') await createEntry(cur.collection, { ...structuredClone(cur.data), title: `${title} (Kopie)` }, saveCtx(user));
          else {
            // One field for all: only fields of the type, never title or address.
            const col = await getCollection(cur.collection);
            if (!body.field || body.field === 'title' || body.field === col.title_field || !col.fields.some((f) => f.key === body.field))
              throw badRequest('Dieses Feld lässt sich nicht für mehrere Einträge setzen.');
            await updateEntry(id, { data: { ...cur.data, [body.field]: body.value ?? null } }, saveCtx(user));
          }
        }
        done.push(id);
      } catch (e) {
        failed.push({ id, title, error: (e as Error).message });
      }
    }
    await audit(c, `entry.bulk.${body.action}`, 'entries', undefined, { done: done.length, failed: failed.length, field: body.field });
    return c.json({ done, failed });
  });

  /* ---------- trash: deleted entries stay 30 days ---------- */

  app.get('/api/trash', async (c) => {
    const user = requireAnyCap(c, 'content.delete', 'content.edit.own');
    const own = can(user.role, 'content.delete') ? sql`` : sql`and t.entry ->> 'author_id' = ${user.id}`;
    const col = c.req.query('collection');
    const rows = await sql`
      select t.id, t.collection, t.title, t.deleted_at, u.name as deleted_by_name, t.entry ->> 'status' as status, t.entry ->> 'slug' as slug
      from trash t left join users u on u.id = t.deleted_by
      where true ${own} ${col ? sql`and t.collection = ${col}` : sql``}
      order by t.deleted_at desc limit 500`;
    return c.json({ entries: rows });
  });

  app.post('/api/trash/:id/restore', async (c) => {
    const user = requireAnyCap(c, 'content.delete', 'content.edit.own');
    const [t] = await sql`select collection, entry ->> 'author_id' as author from trash where id = ${c.req.param('id')}`;
    if (!t) throw notFound('Dieser Eintrag liegt nicht mehr im Papierkorb.');
    if (!can(user.role, 'content.delete') && t.author !== user.id) throw forbidden('Du kannst nur eigene Einträge zurückholen.');
    const e = await restoreEntry(c.req.param('id'));
    await audit(c, 'entry.restore', e.collection, e.id, { title: e.data.title });
    return c.json({ entry: e });
  });

  app.delete('/api/trash/:id', async (c) => {
    requireCap(c, 'content.delete');
    const [t] = await sql`delete from trash where id = ${c.req.param('id')} returning collection, title`;
    if (!t) throw notFound('Dieser Eintrag liegt nicht mehr im Papierkorb.');
    await audit(c, 'entry.purge', t.collection as string, c.req.param('id'), { title: t.title });
    return c.json({ ok: true });
  });

  app.delete('/api/trash', async (c) => {
    requireCap(c, 'content.delete');
    const r = await sql`delete from trash`;
    await audit(c, 'trash.empty', 'trash', undefined, { count: r.count });
    return c.json({ ok: true, count: r.count });
  });

  app.delete('/api/entries/:id/translations/:lang', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const cur = await getEntry(c.req.param('id'));
    assertCanEdit(user, cur);
    const lang = await parseLang(c.req.param('lang'));
    if (!lang) throw badRequest('Das Original lässt sich hier nicht löschen.');
    await deleteTranslation(cur, lang);
    await audit(c, 'translation.delete', cur.collection, cur.id, { lang });
    return c.json({ ok: true });
  });

  app.post('/api/entries/reorder', async (c) => {
    requireCap(c, 'content.edit');
    const { ids } = z.object({ ids: z.array(z.string().uuid()).max(2000) }).parse(await c.req.json());
    await sql.begin(async (tx) => {
      for (let i = 0; i < ids.length; i++) await tx`update entries set sort_index = ${i + 1} where id = ${ids[i]}`;
    });
    bumpGeneration();
    return c.json({ ok: true });
  });

  /** Consent withdrawn: remove the profile and every image of it immediately. */
  app.post('/api/entries/:id/withdraw', async (c) => {
    requireCap(c, 'content.delete');
    const cur = await getEntry(c.req.param('id'));
    if (cur.collection !== 'profiles') throw badRequest('Nur für Profile.');
    const media = new Set<string>();
    for (const d of [cur.data, cur.published_data]) {
      for (const m of (d?.images as string[]) ?? []) media.add(m);
      if (d?.consentDocument) media.add(d.consentDocument as string);
    }
    const revs = await sql`select data from revisions where entry_id = ${cur.id}`;
    for (const r of revs) for (const m of ((r.data as EntryData).images as string[]) ?? []) media.add(m);
    for (const m of media) await deleteMedia(m).catch(() => {});
    await deleteEntry(cur.id, null, { permanent: true });
    await audit(c, 'profile.withdraw', 'profiles', cur.id, { media: media.size });
    return c.json({ ok: true, removedMedia: media.size });
  });

  /* ---------- revisions ---------- */

  app.get('/api/entries/:id/revisions', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const rows = await sql`
      select r.id, r.kind, r.created_at, u.name as user_name, length(r.data::text) as size
      from revisions r left join users u on u.id = r.user_id where r.entry_id = ${e.id} order by r.created_at desc limit 200`;
    return c.json({ revisions: rows });
  });

  app.get('/api/revisions/:rid', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const [r] = await sql`select r.*, e.author_id from revisions r join entries e on e.id = r.entry_id where r.id = ${Number(c.req.param('rid')) || 0}`;
    if (!r) throw notFound();
    assertCanEdit(user, { author_id: r.author_id as string });
    return c.json({ revision: r });
  });

  app.post('/api/entries/:id/restore', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const { revisionId } = z.object({ revisionId: z.number().int() }).parse(await c.req.json());
    const [r] = await sql`select data from revisions where id = ${revisionId} and entry_id = ${e.id}`;
    if (!r) throw notFound('Diese Version gibt es nicht mehr.');
    // Restoring is itself a change, so the current state stays recoverable.
    await sql`insert into revisions (entry_id, data, kind, user_id) values (${e.id}, ${json(e.data)}, 'autosave', ${user.id})`;
    const next = await updateEntry(e.id, { data: r.data as Record<string, unknown> }, { ...saveCtx(user), studioOnly: false, canCode: true });
    await sql`insert into revisions (entry_id, data, kind, user_id) values (${e.id}, ${json(next.data)}, 'restore', ${user.id})`;
    await audit(c, 'entry.restore', e.collection, e.id, { revisionId });
    return c.json({ entry: next });
  });

  /* ---------- canvas & preview ---------- */

  app.get('/_nova/canvas/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const lang = await parseLang(c.req.query('lang'));
    const v = lang ? await translationView(e, lang) : e;
    const body = await withLang(lang, async () => {
      const { ctx, collection, renderEntry } = await canvasContext(c, v, v.data, true, lang);
      return renderPage(ctx, collection, renderEntry);
    });
    c.header('Cache-Control', 'no-store');
    return c.html(body);
  });

  app.get('/_nova/preview/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const lang = await parseLang(c.req.query('lang'));
    const v = lang ? await translationView(e, lang) : e;
    c.header('Cache-Control', 'no-store');
    return c.html(
      await withLang(lang, async () => {
        const { ctx, collection, renderEntry } = await canvasContext(c, v, v.data, false, lang);
        return renderPage(ctx, collection, renderEntry);
      }),
    );
  });

  /** Re-renders one block (inspector change) or the whole page (undo, reorder) from unsaved data. */
  app.post('/api/render', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z.object({ entryId: z.string(), data: z.record(z.string(), z.unknown()), blockId: z.string().optional(), lang: z.string().optional() }).parse(await c.req.json());
    const e = await getEntry(body.entryId);
    assertCanEdit(user, e);
    const lang = await parseLang(body.lang);
    return withLang(lang, () => renderFor(c, e, body, lang));
  });

  async function renderFor(c: Context<AppEnv>, e: Entry, body: { data: Record<string, unknown>; blockId?: string }, lang: Lang | null) {
    const data = body.data as EntryData;
    const blocks = sanitizeBlocks(data.blocks, true, e.data.blocks ?? []);
    const { ctx, collection, renderEntry } = await canvasContext(c, e, { ...data, blocks }, true, lang);
    if (body.blockId) {
      const index = blocks.findIndex((b) => b.id === body.blockId);
      if (index < 0) throw notFound('Block nicht gefunden.');
      ctx.blockIndex = index;
      ctx.h1 = collection.id !== 'pages' || index > 0;
      ctx.sectionNo = blocks.slice(0, index).filter((b) => HEADED_BLOCKS.has(b.type) && (b.props as { heading?: string }).heading).length;
      const html = await renderBlocks([blocks[index]], { ...ctx, depth: 0, blockIndex: index } as typeof ctx);
      return c.json({ html: html.value, needs: [...ctx.needs] });
    }
    return c.json({ html: await renderPage(ctx, collection, renderEntry) });
  }

  /** Theme preview with the site's own content (setup assistant, design settings). */
  app.get('/_nova/theme-preview', async (c) => {
    requireUser(c);
    const settings = structuredClone(await getSettings());
    const q = c.req.query();
    if (q.theme) settings.theme.id = q.theme;
    if (q.palette) settings.theme.palette = q.palette;
    if (q.fonts) settings.theme.fontPair = q.fonts;
    if (q.spacing) settings.theme.spacing = Number(q.spacing) || 1;
    if (q.radius) settings.theme.radius = Number(q.radius) || 0;
    if (q.name) settings.name = q.name.slice(0, 80);
    const [home] = await sql`select * from entries where collection = 'pages' and slug = ''`;
    if (!home) return c.html('<p style="font:16px system-ui;padding:2rem">Noch keine Startseite.</p>');
    const ctx = createContext({ settings, collections: await activeCollections(), path: '/', base: await base(), preview: true, ageOk: true });
    c.header('Cache-Control', 'no-store');
    return c.html(await renderPage(ctx, await getCollection('pages'), { ...(home as unknown as Entry), author_name: null }));
  });
}
