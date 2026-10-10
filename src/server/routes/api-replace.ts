import type { Hono } from 'hono';
import { z } from 'zod';
import { sql, json } from '../db';
import { audit, requireCap, type AppEnv } from '../auth';
import { getEntry, listCollections, publishEntry, updateEntry } from '../content';
import { getSettings, updateSettings, bumpGeneration } from '../settings';
import { badRequest } from '../lib/http';
import { can } from '../../shared/roles';
import { replaceDeep, replaceInSettings, type Hit, type ReplaceOptions } from '../../shared/replace';
import type { CollectionDef, EntryData } from '../../shared/types';
import { saveCtx } from './api-content';

const options = z.object({
  find: z.string().min(1, 'Gib ein, was gesucht werden soll.').max(500),
  replace: z.string().max(2000).default(''),
  caseSensitive: z.boolean().default(false),
  wholeWord: z.boolean().default(false),
  /** Content types to look in; empty = all. */
  collections: z.array(z.string().max(40)).max(60).default([]),
});
/** At most this many entries per run – narrower searches for more. */
const LIMIT = 500;

/** Where in the site settings a hit sits, in words. */
const SETTINGS_WHERE: [string, string][] = [
  ['name', 'Name der Website'],
  ['tagline', 'Slogan'],
  ['business', 'Kontakt'],
  ['hoursNote', 'Öffnungszeiten'],
  ['social', 'Social Media'],
  ['header', 'Kopfzeile'],
  ['footer', 'Fusszeile'],
  ['nav', 'Menü'],
  ['seo', 'Suchmaschinen'],
  ['ageGate', 'Altersprüfung'],
  ['shop', 'Shop'],
  ['ordering', 'Bestellung & Lieferung'],
  ['donations', 'Spenden'],
  ['members', 'Mitglieder'],
];
const settingsWhere = (path: string) => SETTINGS_WHERE.find(([k]) => path === k || path.startsWith(`${k}.`))?.[1] ?? path;

/** Where in an entry a hit sits, in words. */
function where(c: CollectionDef, path: string): string {
  const key = path.split('.')[0];
  if (key === 'title') return 'Titel';
  if (key === 'blocks') return 'Inhalt';
  if (key === 'seo') return 'Suchmaschinen';
  return c.fields.find((f) => f.key === key)?.label ?? key;
}

/** Entries (draft data) and translations of the chosen types, with their hits. */
async function scan(o: ReplaceOptions & { collections: string[] }) {
  const cols = (await listCollections()).filter((c) => !o.collections.length || o.collections.includes(c.id));
  const byId = new Map(cols.map((c) => [c.id, c]));
  const ids = cols.map((c) => c.id);
  // A rough filter in the database first: the longest run of letters and digits of the search (stored
  // rich text has &amp; and JSON escapes where the search has & and quotes). The precise check follows.
  const word = (o.find.match(/[\p{L}\p{N}]+/gu) ?? []).sort((a, b) => b.length - a.length)[0] ?? '';
  const rough = word.length >= 2 ? `%${word}%` : '%';
  const rows = await sql`
    select id, collection, slug, status, data from entries
    where collection = any(${ids}) and data::text ilike ${rough}
    order by updated_at desc limit ${LIMIT}`;
  const trs = await sql`
    select t.entry_id, t.lang, t.data, e.collection, e.data ->> 'title' as base_title from entry_translations t join entries e on e.id = t.entry_id
    where e.collection = any(${ids}) and t.data::text ilike ${rough} limit ${LIMIT}`;
  const found: { id: string; lang: string | null; collection: string; title: string; status: string; hits: Hit[]; next: unknown }[] = [];
  for (const r of rows) {
    const { value, hits } = replaceDeep(r.data as EntryData, o);
    if (hits.length) found.push({ id: r.id, lang: null, collection: r.collection, title: (r.data as EntryData).title ?? '', status: r.status, hits, next: value });
  }
  for (const r of trs) {
    const { value, hits } = replaceDeep(r.data as Record<string, unknown>, o);
    if (hits.length)
      found.push({ id: r.entry_id, lang: r.lang, collection: r.collection, title: (r.data as EntryData).title || r.base_title || '', status: 'translation', hits, next: value });
  }
  return { found, byId, truncated: rows.length >= LIMIT || trs.length >= LIMIT };
}

/**
 * Search and replace across the site: first a preview with every hit in
 * context, then only the chosen entries change – as drafts, with the state
 * before kept as a version. Site settings (name, contact, menu, footer)
 * change at once.
 */
export function replaceApi(app: Hono<AppEnv>) {
  app.post('/api/replace/preview', async (c) => {
    const user = requireCap(c, 'content.edit');
    const o = options.parse(await c.req.json());
    const { found, byId, truncated } = await scan(o);
    const settings = can(user.role, 'settings.manage') && !o.collections.length ? replaceInSettings(await getSettings(), o).hits : [];
    return c.json({
      entries: found.map((f) => ({
        id: f.id,
        lang: f.lang,
        collection: f.collection,
        title: f.title,
        status: f.status,
        count: f.hits.length,
        hits: f.hits.slice(0, 5).map((h) => ({ where: where(byId.get(f.collection)!, h.path), before: h.before, match: h.match, after: h.after })),
      })),
      settings: { count: settings.length, hits: settings.slice(0, 5).map((h) => ({ where: settingsWhere(h.path), before: h.before, match: h.match, after: h.after })) },
      total: found.reduce((n, f) => n + f.hits.length, 0) + settings.length,
      truncated,
    });
  });

  app.post('/api/replace/apply', async (c) => {
    const user = requireCap(c, 'content.edit');
    const body = options
      .extend({
        targets: z.array(z.object({ id: z.string().uuid(), lang: z.string().max(5).nullable() })).max(LIMIT),
        settings: z.boolean().default(false),
        publish: z.boolean().default(false),
      })
      .parse(await c.req.json());
    if (body.settings && !can(user.role, 'settings.manage')) throw badRequest('Die Einstellungen ändert, wer Einstellungen verwalten darf.');
    if (body.publish && !can(user.role, 'content.publish')) throw badRequest('Veröffentlichen darf, wer veröffentlichen darf.');
    // Searched again now: what changed since the preview counts, nothing stale is written back.
    const { found } = await scan(body);
    const wanted = new Set(body.targets.map((t) => `${t.id}:${t.lang ?? ''}`));
    const ctx = saveCtx(user);
    let replaced = 0;
    const done: string[] = [];
    const failed: { id: string; title: string; error: string }[] = [];
    for (const f of found.filter((x) => wanted.has(`${x.id}:${x.lang ?? ''}`))) {
      try {
        if (f.lang) {
          await sql`update entry_translations set data = ${json(f.next)}, version = version + 1, updated_at = now(), updated_by = ${user.id} where entry_id = ${f.id} and lang = ${f.lang}`;
        } else {
          const cur = await getEntry(f.id);
          // The state before stays one click away in the history.
          await sql`insert into revisions (entry_id, data, kind, user_id) values (${f.id}, ${json(cur.data)}, 'replace', ${user.id})`;
          await updateEntry(f.id, { data: f.next as Record<string, unknown> }, ctx);
          if (body.publish && cur.status === 'published') await publishEntry(f.id, user.id, null);
        }
        replaced += f.hits.length;
        done.push(f.id);
      } catch (e) {
        failed.push({ id: f.id, title: f.title, error: (e as Error).message });
      }
    }
    if (body.settings) {
      const r = replaceInSettings(await getSettings(), body);
      if (r.hits.length) {
        await updateSettings(r.value as unknown as Record<string, unknown>);
        replaced += r.hits.length;
      }
    }
    bumpGeneration();
    await audit(c, 'content.replace', 'entries', undefined, { find: body.find, replace: body.replace, entries: done.length, replaced });
    return c.json({ replaced, entries: done.length, failed });
  });
}
