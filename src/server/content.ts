import { sql, json, type Tx } from './db';
import { BUILTIN_COLLECTIONS } from '../shared/collections';
import { BLOCK_MAP } from '../shared/blocks';
import { validateFields, type FieldDef } from '../shared/fields';
import { sanitizePlain, sanitizeRichText, safeHref } from '../shared/richtext';
import { slugify } from '../shared/text';
import { entryPath, RESERVED_PREFIXES } from '../shared/paths';
import type { Block, CollectionDef, Entry, EntryData } from '../shared/types';
import { badRequest, HttpError, notFound } from './lib/http';
import { bumpGeneration, getSettings, updateSettings } from './settings';
import { emit, pingIndexNow } from './events';

/* ---------- Collections ---------- */

let collectionsCache: CollectionDef[] | null = null;

export async function syncBuiltinCollections(): Promise<void> {
  for (const c of BUILTIN_COLLECTIONS) {
    // Built-in fields are code-defined; routes stay editable in the Werkbank.
    await sql`
      insert into collections (id, name, singular, icon, fields, route, list_route, has_blocks, builtin, module, title_field, empty_hint, sort, per_page)
      values (${c.id}, ${c.name}, ${c.singular}, ${c.icon}, ${json(c.fields)}, ${c.route}, ${c.list_route}, ${c.has_blocks}, true,
              ${c.module}, ${c.title_field}, ${c.empty_hint ?? null}, ${c.sort ? json(c.sort) : null}, ${c.per_page ?? null})
      on conflict (id) do update set
        name = excluded.name, singular = excluded.singular, icon = excluded.icon, fields = excluded.fields,
        has_blocks = excluded.has_blocks, builtin = true, module = excluded.module, title_field = excluded.title_field,
        empty_hint = excluded.empty_hint, sort = excluded.sort, updated_at = now()`;
  }
  collectionsCache = null;
}

export async function listCollections(): Promise<CollectionDef[]> {
  if (!collectionsCache) {
    collectionsCache = (await sql`select * from collections order by builtin desc, created_at`) as unknown as CollectionDef[];
  }
  return collectionsCache;
}

export async function getCollection(id: string): Promise<CollectionDef> {
  const c = (await listCollections()).find((x) => x.id === id);
  if (!c) throw notFound('Diesen Inhaltstyp gibt es nicht.');
  return c;
}

/** Collections that are visible given the active modules. */
export async function activeCollections(): Promise<CollectionDef[]> {
  const s = await getSettings();
  return (await listCollections()).filter((c) => !c.module || s.modules.includes(c.module));
}

export function invalidateCollections() {
  collectionsCache = null;
}

const FIELD_KEY = /^[a-z][a-zA-Z0-9_]{0,40}$/;

function checkFieldDefs(fields: FieldDef[], depth = 0): void {
  const keys = new Set<string>();
  for (const f of fields) {
    if (!FIELD_KEY.test(f.key)) throw badRequest(`Der Feldschlüssel «${f.key}» ist ungültig. Erlaubt: Buchstaben, Zahlen, _ – beginnend mit einem Kleinbuchstaben.`);
    if (['blocks', 'seo', 'slug', 'status', 'id'].includes(f.key)) throw badRequest(`«${f.key}» ist ein reservierter Feldname.`);
    if (keys.has(f.key)) throw badRequest(`Der Feldschlüssel «${f.key}» kommt doppelt vor.`);
    keys.add(f.key);
    if (!f.label?.trim()) throw badRequest(`Feld «${f.key}» braucht eine Beschriftung für das Studio.`);
    if (f.type === 'group') {
      if (depth > 1) throw badRequest('Gruppen dürfen höchstens zwei Ebenen tief verschachtelt sein.');
      checkFieldDefs(f.fields ?? [], depth + 1);
    }
  }
}

export async function saveCollection(input: Partial<CollectionDef> & { id: string }, isNew: boolean): Promise<CollectionDef> {
  const id = slugify(input.id).replace(/-/g, '_');
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) throw badRequest('Der technische Name muss mit einem Buchstaben beginnen und darf nur a–z, 0–9 und _ enthalten.');
  const existing = (await listCollections()).find((c) => c.id === id);
  if (isNew && existing) throw badRequest('Einen Inhaltstyp mit diesem Namen gibt es schon.');
  if (!isNew && !existing) throw notFound();
  if (existing?.builtin && input.fields) throw badRequest('Die Felder eingebauter Typen sind fest. Leg einen eigenen Typ an, um Felder frei zu definieren.');
  const fields = input.fields ?? existing?.fields ?? [{ key: 'title', type: 'text', label: 'Titel', required: true }];
  checkFieldDefs(fields);
  if (!fields.some((f) => f.key === (input.title_field ?? existing?.title_field ?? 'title')))
    throw badRequest('Das Titelfeld muss eines der Felder sein.');
  const route = input.route === undefined ? existing?.route ?? null : input.route || null;
  const listRoute = input.list_route === undefined ? existing?.list_route ?? null : input.list_route || null;
  if (route && !/^\/[a-z0-9\-/]*:slug$/.test(route)) throw badRequest('Die Detail-Adresse muss mit «/» beginnen und auf «:slug» enden, z. B. /rezepte/:slug.');
  if (listRoute && !/^\/[a-z0-9\-/]+$/.test(listRoute)) throw badRequest('Die Übersichts-Adresse muss mit «/» beginnen, z. B. /rezepte.');
  const others = (await listCollections()).filter((c) => c.id !== id);
  for (const o of others) {
    if (route && o.route === route) throw badRequest(`Die Adresse ${route} benutzt schon «${o.name}».`);
    if (listRoute && o.list_route === listRoute) throw badRequest(`Die Adresse ${listRoute} benutzt schon «${o.name}».`);
  }
  const name = (input.name ?? existing?.name ?? '').trim();
  if (!name) throw badRequest('Bitte gib dem Inhaltstyp einen Namen.');
  await sql`
    insert into collections (id, name, singular, icon, fields, route, list_route, has_blocks, builtin, module, title_field, empty_hint, sort, per_page)
    values (${id}, ${name}, ${input.singular ?? existing?.singular ?? name}, ${input.icon ?? existing?.icon ?? 'page'}, ${json(fields)},
            ${route}, ${listRoute}, ${input.has_blocks ?? existing?.has_blocks ?? false}, false, null,
            ${input.title_field ?? existing?.title_field ?? 'title'}, ${input.empty_hint ?? existing?.empty_hint ?? null},
            ${json(input.sort ?? existing?.sort ?? { field: 'created_at', dir: 'desc' })}, ${input.per_page ?? existing?.per_page ?? 12})
    on conflict (id) do update set
      name = excluded.name, singular = excluded.singular, icon = excluded.icon, fields = excluded.fields, route = excluded.route,
      list_route = excluded.list_route, has_blocks = excluded.has_blocks, title_field = excluded.title_field,
      empty_hint = excluded.empty_hint, sort = excluded.sort, per_page = excluded.per_page, updated_at = now()`;
  invalidateCollections();
  bumpGeneration();
  return getCollection(id);
}

/* ---------- Sanitizing ---------- */

function sanitizeValue(f: FieldDef, v: unknown): unknown {
  if (v === undefined || v === null) return v;
  switch (f.type) {
    case 'richtext':
      return sanitizeRichText(v);
    case 'text':
    case 'email':
      return sanitizePlain(v);
    case 'textarea':
      return sanitizePlain(v, true);
    case 'url':
      return typeof v === 'string' ? (v === '' ? '' : safeHref(v) ?? '') : '';
    case 'link': {
      const l = v as { label?: unknown; href?: unknown };
      if (!l || typeof l !== 'object' || !l.href) return null;
      const href = safeHref(String(l.href));
      return href ? { label: sanitizePlain(l.label ?? ''), href } : null;
    }
    case 'number':
    case 'money':
      return typeof v === 'number' && Number.isFinite(v) ? (f.type === 'money' ? Math.round(v) : v) : v === '' ? null : Number(v);
    case 'boolean':
      return Boolean(v);
    case 'tags':
    case 'multiselect':
      return Array.isArray(v) ? v.map((x) => sanitizePlain(String(x))).filter(Boolean) : [];
    case 'images':
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    case 'group':
      return Array.isArray(v) ? v.map((item) => sanitizeObject(f.fields ?? [], item as Record<string, unknown>)) : [];
    default:
      return v;
  }
}

function sanitizeObject(fields: FieldDef[], obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) if (f.key in out) out[f.key] = sanitizeValue(f, out[f.key]);
  return out;
}

export function sanitizeBlocks(blocks: unknown, canCode: boolean, previous: Block[] = []): Block[] {
  if (!Array.isArray(blocks)) return [];
  const prevById = new Map(previous.map((b) => [b.id, b]));
  return blocks
    .filter((b): b is Block => b && typeof b === 'object' && typeof b.type === 'string' && BLOCK_MAP[b.type] !== undefined)
    .map((b) => {
      const def = BLOCK_MAP[b.type];
      const prev = prevById.get(b.id);
      const props = sanitizeObject(def.fields, (b.props ?? {}) as Record<string, unknown>);
      const style = { ...(b.style ?? {}) };
      if (!canCode) {
        // Code-level settings only change in the Werkbank, by people allowed to write code.
        style.css = prev?.style?.css;
        style.className = prev?.style?.className;
        if (b.type === 'html') {
          props.code = prev?.props.code ?? '';
          const prevVars = (prev?.props.vars as { key: string; label: string }[]) ?? [];
          props.vars = prevVars.map((pv) => ({
            ...pv,
            value: sanitizePlain(((props.vars as { key: string; value: string }[]) ?? []).find((v) => v.key === pv.key)?.value ?? ''),
          }));
        }
      }
      if (typeof style.className === 'string') style.className = style.className.replace(/[^\w\- ]/g, '').slice(0, 120);
      if (typeof style.anchor === 'string') style.anchor = slugify(style.anchor);
      return { id: String(b.id).slice(0, 24), type: b.type, props, style, lock: b.lock ?? 'none' };
    });
}

/**
 * Studio users can't touch locked blocks. We restore locked blocks (and their
 * position) from the previous version so a crafted request can't bypass it.
 */
function enforceLocks(next: Block[], previous: Block[], studioOnly: boolean): Block[] {
  if (!studioOnly) return next;
  const prevLocked = previous.filter((b) => b.lock && b.lock !== 'none');
  if (!prevLocked.length) return next.map((b) => ({ ...b, lock: 'none' as const }));
  const result = next.map((b) => {
    const prev = previous.find((p) => p.id === b.id);
    if (!prev || !prev.lock || prev.lock === 'none') return { ...b, lock: 'none' as const };
    if (prev.lock === 'all') return prev;
    // layout lock: keep style & structural props, allow text changes.
    const def = BLOCK_MAP[b.type];
    const props = { ...prev.props };
    for (const f of def.fields) if (['text', 'textarea', 'richtext'].includes(f.type)) props[f.key] = b.props[f.key];
    return { ...prev, props };
  });
  for (const locked of prevLocked) {
    if (!result.some((b) => b.id === locked.id)) {
      const idx = previous.indexOf(locked);
      result.splice(Math.min(idx, result.length), 0, locked);
    }
  }
  // Layout-locked blocks keep their original index.
  for (const locked of prevLocked) {
    const want = previous.indexOf(locked);
    const now = result.findIndex((b) => b.id === locked.id);
    if (now !== want && want < result.length) {
      const [b] = result.splice(now, 1);
      result.splice(want, 0, b);
    }
  }
  return result;
}

export interface SaveContext {
  userId: string;
  canCode: boolean;
  studioOnly: boolean;
}

export function sanitizeEntryData(c: CollectionDef, data: Record<string, unknown>, prev: EntryData | null, ctx: SaveContext): EntryData {
  const out = sanitizeObject(c.fields, data) as EntryData;
  out.title = sanitizePlain(out.title ?? (data[c.title_field] as string) ?? '');
  if (c.has_blocks) {
    const blocks = sanitizeBlocks(data.blocks, ctx.canCode, prev?.blocks ?? []);
    out.blocks = enforceLocks(blocks, prev?.blocks ?? [], ctx.studioOnly);
  } else delete out.blocks;
  const seo = (data.seo ?? {}) as Record<string, unknown>;
  out.seo = {
    title: sanitizePlain(seo.title ?? ''),
    description: sanitizePlain(seo.description ?? ''),
    keyword: sanitizePlain(seo.keyword ?? ''),
    image: typeof seo.image === 'string' ? seo.image : undefined,
    noindex: Boolean(seo.noindex),
  };
  // Drop keys the collection doesn't know (keeps exports clean).
  const allowed = new Set([...c.fields.map((f) => f.key), 'title', 'blocks', 'seo']);
  for (const k of Object.keys(out)) if (!allowed.has(k)) delete out[k];
  return out;
}

/* ---------- Entries ---------- */

export async function uniqueSlug(collection: string, wanted: string, excludeId?: string, tx: Tx | typeof sql = sql): Promise<string> {
  let base = slugify(wanted);
  if (collection === 'pages' && RESERVED_PREFIXES.includes(base.split('/')[0])) base = `seite-${base}`;
  if (collection !== 'pages') base = base.replace(/\//g, '-');
  if (!base && collection !== 'pages') base = 'eintrag';
  let slug = base;
  for (let i = 2; ; i++) {
    const [hit] = await tx`select 1 from entries where collection = ${collection} and slug = ${slug} and id <> ${excludeId ?? '00000000-0000-0000-0000-000000000000'}`;
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
}

export async function getEntry(id: string): Promise<Entry> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  const [e] = await sql`select * from entries where id = ${id}`;
  if (!e) throw notFound('Dieser Inhalt existiert nicht mehr.');
  return e as unknown as Entry;
}

export async function createEntry(collectionId: string, data: Record<string, unknown>, ctx: SaveContext, slug?: string): Promise<Entry> {
  const c = await getCollection(collectionId);
  const clean = sanitizeEntryData(c, { ...data, title: data.title ?? data[c.title_field] ?? '' }, null, { ...ctx, studioOnly: false });
  const finalSlug = await uniqueSlug(c.id, slug ?? clean.title ?? '');
  const [{ max }] = await sql`select coalesce(max(sort_index), 0) as max from entries where collection = ${c.id}`;
  const [e] = await sql`
    insert into entries (collection, slug, data, author_id, sort_index)
    values (${c.id}, ${finalSlug}, ${json(clean)}, ${ctx.userId}, ${Number(max) + 1})
    returning *`;
  await sql`insert into revisions (entry_id, data, kind, user_id) values (${e.id}, ${json(clean)}, 'autosave', ${ctx.userId})`;
  return e as unknown as Entry;
}

export async function updateEntry(
  id: string,
  input: { data: Record<string, unknown>; slug?: string; baseVersion?: number; stockTouched?: boolean },
  ctx: SaveContext,
): Promise<Entry> {
  return sql.begin(async (tx) => {
    const [cur] = await tx`select * from entries where id = ${id} for update`;
    if (!cur) throw notFound();
    if (input.baseVersion !== undefined && input.baseVersion !== cur.version) {
      throw new HttpError(409, 'Jemand anderes hat diesen Inhalt in der Zwischenzeit geändert. Lade neu, um die aktuelle Fassung zu sehen.', {
        version: cur.version,
      });
    }
    const c = await getCollection(cur.collection);
    const clean = sanitizeEntryData(c, input.data, cur.data as EntryData, ctx);
    if (c.id === 'products' && !input.stockTouched) keepStock(clean, cur.data as EntryData);
    let slug = cur.slug as string;
    if (input.slug !== undefined && input.slug !== cur.slug) {
      if (cur.collection === 'pages' && cur.slug === '') throw badRequest('Die Adresse der Startseite lässt sich nicht ändern.');
      slug = await uniqueSlug(c.id, input.slug || clean.title, id, tx);
    }
    const [e] = await tx`
      update entries set data = ${json(clean)}, slug = ${slug}, version = version + 1, updated_at = now()
      where id = ${id} returning *`;
    // One autosave revision every two minutes is plenty; undo covers the rest.
    const [last] = await tx`select created_at from revisions where entry_id = ${id} order by created_at desc limit 1`;
    if (!last || Date.now() - new Date(last.created_at).getTime() > 120_000) {
      await tx`insert into revisions (entry_id, data, kind, user_id) values (${id}, ${json(clean)}, 'autosave', ${ctx.userId})`;
    }
    return e as unknown as Entry;
  });
}

/**
 * Orders change stock in the database while someone may have the product open.
 * Unless the editor explicitly changed a stock field, the stored stock wins.
 */
function keepStock(next: EntryData, stored: EntryData): void {
  next.stock = stored.stock ?? next.stock ?? null;
  const prevVariants = (stored.variants as { name: string; stock?: number | null }[]) ?? [];
  const variants = (next.variants as { name: string; stock?: number | null }[]) ?? [];
  for (const v of variants) {
    const prev = prevVariants.find((p) => p.name === v.name);
    if (prev) v.stock = prev.stock ?? null;
  }
}

/** Rules that must hold before something goes live. Returns human messages. */
export function publishBlockers(c: CollectionDef, data: EntryData): string[] {
  const problems = validateFields(c.fields, data).map((e) => e.message);
  if (c.id === 'profiles') {
    if (!data.consentAdult) problems.push('Die Volljährigkeit ist noch nicht bestätigt.');
    if (!data.consentPublish) problems.push('Die Einwilligung zur Veröffentlichung fehlt.');
    if (!data.consentDate) problems.push('Das Datum der Einwilligung fehlt.');
  }
  return problems;
}

export async function publishEntry(id: string, userId: string, at?: Date | null): Promise<{ entry: Entry; firstPublish: boolean }> {
  const entry = await getEntry(id);
  const c = await getCollection(entry.collection);
  const problems = publishBlockers(c, entry.data);
  if (problems.length) throw badRequest(problems.join(' '), { problems });

  if (at && at.getTime() > Date.now() + 30_000) {
    const [e] = await sql`update entries set status = 'scheduled', publish_at = ${at}, updated_at = now() where id = ${id} returning *`;
    return { entry: e as unknown as Entry, firstPublish: false };
  }

  let firstOfEntry = false;
  const result = await sql.begin(async (tx) => {
    const [prev] = await tx`select published_slug, published_at from entries where id = ${id}`;
    const oldSlug = (prev.published_slug as string | null) ?? null;
    const isNew = !prev.published_at;
    const [e] = await tx`
      update entries set published_data = data, published_slug = slug, status = 'published', publish_at = null,
        published_at = coalesce(published_at, now()), updated_at = now()
      where id = ${id} returning *`;
    await tx`insert into revisions (entry_id, data, kind, user_id) values (${id}, ${json(e.data)}, 'publish', ${userId})`;
    // Automatic 301 when the address of a live entry changes.
    if (oldSlug !== null && oldSlug !== e.slug) {
      const from = entryPath(c, oldSlug);
      const to = entryPath(c, e.slug);
      if (from && to && from !== to) {
        await tx`delete from redirects where from_path = ${to}`;
        await tx`
          insert into redirects (from_path, to_path, code, auto) values (${from}, ${to}, 301, true)
          on conflict (from_path) do update set to_path = excluded.to_path`;
        await tx`update redirects set to_path = ${to} where to_path = ${from}`;
      }
    }
    return { entry: e as unknown as Entry, isNew };
  }).then((r) => {
    firstOfEntry = r.isNew;
    return r.entry;
  });

  bumpGeneration();
  const settings = await getSettings();
  const firstPublish = !settings.firstPublishedAt;
  if (firstPublish) await updateSettings({ firstPublishedAt: new Date().toISOString() });
  const path = entryPath(c, result.slug);
  emit('entry.published', { id, collection: c.id, slug: result.slug, path, title: result.data.title });
  if (path) pingIndexNow([path]);
  // New posts can go out as a newsletter (imported lazily: newsletter.ts depends on this module).
  if (firstOfEntry && c.id === 'posts')
    void import('./newsletter').then((m) => m.onPostPublished(id, String(result.data.title ?? ''))).catch((e) => console.error('[newsletter]', (e as Error).message));
  return { entry: result, firstPublish };
}

export async function unpublishEntry(id: string): Promise<Entry> {
  const [e] = await sql`
    update entries set status = 'draft', published_data = null, publish_at = null, updated_at = now()
    where id = ${id} returning *`;
  if (!e) throw notFound();
  bumpGeneration();
  emit('entry.unpublished', { id, collection: e.collection, slug: e.slug });
  return e as unknown as Entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const e = await getEntry(id);
  if (e.collection === 'pages' && e.slug === '') throw badRequest('Die Startseite kann nicht gelöscht werden.');
  await sql`delete from entries where id = ${id}`;
  bumpGeneration();
}

/** Called by the scheduler: publishes everything whose time has come. */
export async function publishDue(): Promise<number> {
  const due = await sql`select id, author_id from entries where status = 'scheduled' and publish_at <= now()`;
  for (const d of due) {
    try {
      await sql`update entries set publish_at = null where id = ${d.id}`;
      await publishEntry(d.id as string, (d.author_id as string) ?? '');
    } catch (e) {
      console.error(`[scheduler] Veröffentlichen von ${d.id} fehlgeschlagen:`, (e as Error).message);
      await sql`update entries set status = 'draft' where id = ${d.id}`;
    }
  }
  return due.length;
}
