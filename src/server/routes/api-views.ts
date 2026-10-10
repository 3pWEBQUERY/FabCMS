import type { Hono } from 'hono';
import { z } from 'zod';
import { sql, json } from '../db';
import { audit, requireAnyCap, type AppEnv } from '../auth';
import { getCollection } from '../content';
import { forbidden, notFound } from '../lib/http';
import { can } from '../../shared/roles';
import { filterFields, filterToParams, paramsToFilter } from '../../shared/listfilter';

/**
 * What a content list can be filtered by, with how often each value occurs –
 * and the views people saved: for themselves or for the whole team.
 */
export function viewsApi(app: Hono<AppEnv>) {
  app.get('/api/entries/facets', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const col = await getCollection(c.req.query('collection') ?? '');
    const own = can(user.role, 'content.edit') ? sql`` : sql`and e.author_id = ${user.id}`;
    const authors = await sql`
      select e.author_id as id, coalesce(u.name, '') as name, count(*)::int as n
      from entries e left join users u on u.id = e.author_id
      where e.collection = ${col.id} and e.author_id is not null ${own} group by 1, 2 order by n desc limit 50`;
    const fields = [];
    for (const f of filterFields(col.fields)) {
      const values =
        f.type === 'tags' || f.type === 'multiselect'
          ? await sql`
              select v as value, count(*)::int as n from entries e, jsonb_array_elements_text(case when jsonb_typeof(e.data -> ${f.key}) = 'array' then e.data -> ${f.key} else '[]'::jsonb end) v
              where e.collection = ${col.id} ${own} group by v order by n desc, v limit 60`
          : f.type === 'boolean'
            ? await sql`
              select (e.data ->> ${f.key} = 'true')::text as value, count(*)::int as n from entries e
              where e.collection = ${col.id} ${own} group by 1`
            : await sql`
              select e.data ->> ${f.key} as value, count(*)::int as n from entries e
              where e.collection = ${col.id} and coalesce(e.data ->> ${f.key}, '') <> '' ${own} group by 1 order by n desc, 1 limit 60`;
      if (values.length) fields.push({ key: f.key, label: f.label, type: f.type, options: f.options ?? null, values });
    }
    return c.json({ authors, fields });
  });

  app.get('/api/views', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const rows = await sql`
      select v.id, v.name, v.query, v.shared, v.user_id = ${user.id} as mine, u.name as owner_name from saved_views v left join users u on u.id = v.user_id
      where v.collection = ${c.req.query('collection') ?? ''} and (v.user_id = ${user.id} or v.shared) order by v.shared, lower(v.name)`;
    return c.json({ views: rows });
  });

  app.post('/api/views', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z
      .object({
        collection: z.string().max(40),
        name: z.string().trim().min(1, 'Die Ansicht braucht einen Namen.').max(60),
        query: z.record(z.string(), z.string().max(200)),
        shared: z.boolean().default(false),
      })
      .parse(await c.req.json());
    await getCollection(body.collection);
    if (body.shared && !can(user.role, 'content.publish')) throw forbidden('Ansichten für alle legt an, wer veröffentlichen darf.');
    // Stored the way the list reads it – unknown keys don't come along.
    const query = filterToParams(paramsToFilter(body.query));
    const [v] = await sql`
      insert into saved_views (collection, name, query, user_id, shared) values (${body.collection}, ${body.name}, ${json(query)}, ${user.id}, ${body.shared})
      returning id, name, query, shared, true as mine`;
    await audit(c, 'view.create', body.collection, v.id as string, { name: body.name, shared: body.shared });
    return c.json({ view: v });
  });

  app.delete('/api/views/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const [v] = await sql`select user_id, shared from saved_views where id = ${c.req.param('id')}`;
    if (!v) throw notFound('Diese Ansicht gibt es nicht mehr.');
    if (v.user_id !== user.id && !(v.shared && can(user.role, 'content.publish'))) throw forbidden();
    await sql`delete from saved_views where id = ${c.req.param('id')}`;
    return c.json({ ok: true });
  });
}
