import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireAnyCap, requireCap, type AppEnv } from '../auth';
import { createEntry, getCollection, getEntry, publishEntry, updateEntry } from '../content';
import { badRequest, forbidden, toCsv } from '../lib/http';
import { parseCsv, sniffDelimiter } from '../importer/parse';
import { can } from '../../shared/roles';
import { cellText, matchColumns, parseCell, tableFields } from '../../shared/datatable';
import { validateFields, type FieldDef } from '../../shared/fields';
import type { EntryData } from '../../shared/types';
import { assertCanEdit, listRow, saveCtx } from './api-content';

/** At most this many lines per import – more belongs into several files or the API. */
const MAX_ROWS = 2000;

/** Exported cells that start like a formula carry a leading apostrophe (see csvEscape); it goes again on the way back. */
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

/** Parse one cell and check it like the editor would – except «required», which only matters when publishing. */
function readCell(f: FieldDef, text: string): { value: unknown } | { error: string } {
  const r = parseCell(f, text);
  if (!r.ok) return { error: r.error };
  const problem = validateFields([{ ...f, required: false }], { [f.key]: r.value })[0];
  return problem ? { error: problem.message } : { value: r.value };
}

/**
 * The Werkbank's data view: one field of one entry edited in its table cell,
 * and every entry of a type as CSV – out to a spreadsheet and back in.
 */
export function dataApi(app: Hono<AppEnv>) {
  app.post('/api/entries/:id/field', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z.object({ field: z.string().max(60), text: z.string().max(20_000) }).parse(await c.req.json());
    const cur = await getEntry(c.req.param('id'));
    assertCanEdit(user, cur);
    const col = await getCollection(cur.collection);
    let patch: Record<string, unknown>;
    if (body.field === 'title' || body.field === col.title_field) {
      const title = body.text.trim();
      if (!title) throw badRequest('Der Titel darf nicht leer sein.');
      patch = { title, [col.title_field]: title };
    } else {
      const f = tableFields(col.fields, col.title_field).find((x) => x.key === body.field);
      if (!f) throw badRequest('Dieses Feld lässt sich in der Tabelle nicht bearbeiten.');
      const r = parseCell(f, body.text);
      if (!r.ok) throw badRequest(r.error);
      const problem = validateFields([f], { [f.key]: r.value })[0];
      if (problem) throw badRequest(problem.message);
      patch = { [f.key]: r.value };
    }
    await updateEntry(cur.id, { data: { ...cur.data, ...patch }, stockTouched: 'stock' in patch }, saveCtx(user));
    const [row] = await sql`
      select e.*, u.name as author_name, (e.published_data is distinct from e.data) as changed
      from entries e left join users u on u.id = e.author_id where e.id = ${cur.id}`;
    return c.json({ row: listRow(row) });
  });

  app.get('/api/data/:collection/export', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const col = await getCollection(c.req.param('collection'));
    const fields = tableFields(col.fields, col.title_field);
    const own = can(user.role, 'content.edit') ? sql`` : sql`and author_id = ${user.id}`;
    const rows = await sql`select id, slug, status, data from entries where collection = ${col.id} ${own} order by sort_index, created_at`;
    const keys = ['id', 'slug', 'status', 'title', ...fields.map((f) => f.key)];
    const out = rows.map((r) => {
      const d = r.data as EntryData;
      return Object.fromEntries([['id', r.id], ['slug', r.slug], ['status', r.status], ['title', d.title ?? ''], ...fields.map((f) => [f.key, cellText(f, d[f.key])])]);
    });
    await audit(c, 'entries.export', col.id, undefined, { count: rows.length });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${col.id}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(toCsv(out, keys));
  });

  app.post('/api/data/:collection/import', async (c) => {
    const user = requireCap(c, 'content.edit');
    const body = z.object({ csv: z.string().max(10_000_000), dryRun: z.boolean().default(true), publish: z.boolean().default(false) }).parse(await c.req.json());
    if (body.publish && !can(user.role, 'content.publish')) throw forbidden('Veröffentlichen darf, wer veröffentlichen darf.');
    const col = await getCollection(c.req.param('collection'));
    const [head, ...lines] = parseCsv(body.csv, sniffDelimiter(body.csv));
    if (!head || !lines.length) throw badRequest('Die Datei hat keine Zeilen unter der Kopfzeile.');
    if (lines.length > MAX_ROWS) throw badRequest(`Höchstens ${MAX_ROWS} Zeilen pro Datei – teile sie auf.`);
    const { map, ignored } = matchColumns(head, tableFields(col.fields, col.title_field));
    if (!map.some((m) => m && m !== 'id' && m !== 'slug'))
      throw badRequest('Keine Spalte passt zu einem Feld dieses Inhaltstyps. Die Kopfzeile braucht die Feldnamen, z. B. aus einem Export.');

    const existing = await sql`select id, slug, author_id, data from entries where collection = ${col.id}`;
    const byId = new Map(existing.map((e) => [e.id as string, e]));
    const bySlug = new Map(existing.map((e) => [e.slug as string, e]));
    const seen = new Set<string>();
    const errors: { line: number; message: string }[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const ctx = saveCtx(user);

    for (const [i, cells] of lines.entries()) {
      const line = i + 2;
      const at = (k: string) => {
        const idx = map.indexOf(k as never);
        return idx < 0 ? '' : unguard(cells[idx] ?? '').trim();
      };
      const target = byId.get(at('id')) ?? (at('slug') ? bySlug.get(at('slug')) : undefined);
      if (target && seen.has(target.id as string)) {
        errors.push({ line, message: 'Dieser Eintrag kommt in der Datei schon weiter oben vor.' });
        continue;
      }
      const patch: Record<string, unknown> = {};
      const problems: string[] = [];
      map.forEach((m, idx) => {
        if (!m || typeof m === 'string') return;
        const r = readCell(m, unguard(cells[idx] ?? ''));
        if ('error' in r) problems.push(r.error);
        else patch[m.key] = r.value;
      });
      const title = map.includes('title') ? at('title') : undefined;
      if (title !== undefined) patch.title = title;
      if (!target && !title) problems.push('Neue Einträge brauchen einen Titel.');
      if (problems.length) {
        errors.push({ line, message: problems.join(' ') });
        continue;
      }
      try {
        if (target) {
          seen.add(target.id as string);
          const data = target.data as EntryData;
          if (title === '') delete patch.title;
          const same = Object.entries(patch).every(([k, v]) => {
            const f = col.fields.find((x) => x.key === k);
            return f ? cellText(f, data[k]) === cellText(f, v) : (data[k] ?? '') === v;
          });
          if (same) {
            unchanged++;
            continue;
          }
          if (!can(user.role, 'content.edit') && target.author_id !== user.id) throw forbidden('Du kannst nur deine eigenen Beiträge bearbeiten.');
          updated++;
          if (body.dryRun) continue;
          await updateEntry(target.id as string, { data: { ...data, ...patch }, stockTouched: 'stock' in patch }, ctx);
          if (body.publish) await publishEntry(target.id as string, user.id, null);
        } else {
          created++;
          if (body.dryRun) continue;
          const e = await createEntry(col.id, patch, ctx, at('slug') || undefined);
          if (body.publish) await publishEntry(e.id, user.id, null);
        }
      } catch (e) {
        errors.push({ line, message: (e as Error).message });
      }
    }
    if (!body.dryRun) await audit(c, 'entries.import', col.id, undefined, { created, updated, errors: errors.length });
    const columns = map.map((m, i) => (m ? head[i].trim() : null)).filter((x): x is string => x !== null);
    return c.json({ created, updated, unchanged, errors: errors.slice(0, 200), errorCount: errors.length, columns, ignored });
  });
}
