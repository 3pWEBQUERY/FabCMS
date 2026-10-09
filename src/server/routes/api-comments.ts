import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { requireAnyCap, type AppEnv, type AuthUser } from '../auth';
import { getEntry } from '../content';
import { notify } from '../notify';
import { badRequest, forbidden, notFound } from '../lib/http';
import { can } from '../../shared/roles';
import type { Entry } from '../../shared/types';

/**
 * Team comments on pages and entries, optionally pinned to a block. Threads
 * (one level of replies), «erledigt», @mentions with a personal notification.
 */

function assertCanSee(user: AuthUser, e: Pick<Entry, 'author_id'>) {
  if (can(user.role, 'content.edit') || can(user.role, 'content.publish')) return;
  if (can(user.role, 'content.edit.own') && e.author_id === user.id) return;
  throw forbidden('Du kannst nur Kommentare zu deinen eigenen Beiträgen sehen.');
}

/** Everyone who works on content and can be mentioned. */
async function people(): Promise<{ id: string; name: string }[]> {
  const rows = await sql`select id, name, role from users where role <> 'member' order by name`;
  return rows
    .filter((r) => can(r.role as never, 'content.edit') || can(r.role as never, 'content.edit.own') || can(r.role as never, 'content.publish'))
    .map((r) => ({ id: r.id as string, name: r.name as string }));
}

/** «@Anna» or «@Anna Meier» → user ids; the longest matching name wins. */
export function findMentions(body: string, team: { id: string; name: string }[]): string[] {
  const out = new Set<string>();
  const lower = body.toLowerCase();
  for (const m of lower.matchAll(/(^|[\s(])@([\p{L}][\p{L}\p{M}'’-]*(?:\s[\p{L}][\p{L}\p{M}'’-]*)?)/gu)) {
    const said = m[2];
    const full = team.find((p) => said === p.name.toLowerCase() || said.startsWith(`${p.name.toLowerCase()}`));
    const first = team.filter((p) => said.split(/\s/)[0] === p.name.toLowerCase().split(/\s/)[0]);
    if (full) out.add(full.id);
    else if (first.length === 1) out.add(first[0].id);
  }
  return [...out];
}

const editorHref = (e: Pick<Entry, 'id' | 'collection'>, commentId: string) =>
  `${e.collection === 'pages' ? `/seiten/${e.id}` : `/inhalte/${e.collection}/${e.id}`}?kommentar=${commentId}`;
const excerptOf = (s: string) => (s.length > 140 ? `${s.slice(0, 139)}…` : s);

export function commentsApi(app: Hono<AppEnv>) {
  app.get('/api/entries/:id/comments', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own', 'content.publish');
    const e = await getEntry(c.req.param('id'));
    assertCanSee(user, e);
    const rows = await sql`
      select k.id, k.block_id, k.parent_id, k.body, k.author_id, a.name as author_name, k.mentions, k.resolved_at, r.name as resolved_by_name, k.created_at, k.updated_at
      from entry_comments k left join users a on a.id = k.author_id left join users r on r.id = k.resolved_by
      where k.entry_id = ${e.id} order by k.created_at`;
    return c.json({ comments: rows, people: await people() });
  });

  app.post('/api/entries/:id/comments', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own', 'content.publish');
    const e = await getEntry(c.req.param('id'));
    assertCanSee(user, e);
    const body = z
      .object({
        body: z.string().trim().min(1, 'Der Kommentar ist leer.').max(4000),
        blockId: z.string().max(40).nullable().optional(),
        parentId: z.string().uuid().nullable().optional(),
      })
      .parse(await c.req.json());
    type Root = { id: string; author_id: string | null; block_id: string | null };
    let root: Root | null = null;
    if (body.parentId) {
      const [p] = await sql`select id, author_id, block_id, parent_id from entry_comments where id = ${body.parentId} and entry_id = ${e.id}`;
      if (!p) throw notFound('Diesen Kommentar gibt es nicht mehr.');
      if (p.parent_id) throw badRequest('Antworten gehen an den ersten Kommentar eines Gesprächs.');
      root = p as unknown as Root;
    }
    const team = await people();
    const mentions = findMentions(body.body, team).filter((id) => id !== user.id);
    const [row] = await sql`
      insert into entry_comments (entry_id, block_id, parent_id, body, author_id, mentions)
      values (${e.id}, ${root ? root.block_id : (body.blockId ?? null)}, ${root?.id ?? null}, ${body.body}, ${user.id}, ${mentions}::uuid[])
      returning *`;
    // A reply reopens a resolved thread: there is something new to look at.
    if (root) await sql`update entry_comments set resolved_at = null, resolved_by = null where id = ${root.id}`;

    const title = String(e.data.title || 'Ohne Titel');
    const href = editorHref(e, (root?.id ?? row.id) as string);
    const told = new Set<string>([user.id]);
    for (const id of mentions) {
      told.add(id);
      void notify({ kind: 'mention', cap: 'content.edit.own', userId: id, title: `${user.name} hat dich erwähnt: ${title}`, body: excerptOf(body.body), href });
    }
    // Replies go to everyone in the thread; a new thread to the author of the entry.
    const others = root
      ? ((await sql`select distinct author_id from entry_comments where (id = ${root.id} or parent_id = ${root.id}) and author_id is not null`).map(
          (r) => r.author_id as string,
        ) as string[])
      : e.author_id
        ? [e.author_id]
        : [];
    for (const id of others) {
      if (told.has(id)) continue;
      told.add(id);
      void notify({
        kind: 'comment',
        cap: 'content.edit.own',
        userId: id,
        title: root ? `${user.name} hat geantwortet: ${title}` : `Neuer Kommentar von ${user.name}: ${title}`,
        body: excerptOf(body.body),
        href,
      });
    }
    return c.json({ comment: { ...row, author_name: user.name, resolved_by_name: null } });
  });

  app.patch('/api/entry-comments/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own', 'content.publish');
    const [k] = await sql`select * from entry_comments where id = ${c.req.param('id')}`;
    if (!k) throw notFound('Diesen Kommentar gibt es nicht mehr.');
    assertCanSee(user, await getEntry(k.entry_id as string));
    const body = z.object({ body: z.string().trim().min(1, 'Der Kommentar ist leer.').max(4000).optional(), resolved: z.boolean().optional() }).parse(await c.req.json());
    if (body.body !== undefined) {
      if (k.author_id !== user.id) throw forbidden('Nur wer den Kommentar geschrieben hat, kann ihn ändern.');
      await sql`update entry_comments set body = ${body.body}, updated_at = now() where id = ${k.id}`;
    }
    if (body.resolved !== undefined) {
      if (k.parent_id) throw badRequest('Erledigt wird das ganze Gespräch, nicht eine Antwort.');
      await sql`update entry_comments set resolved_at = ${body.resolved ? new Date() : null}, resolved_by = ${body.resolved ? user.id : null} where id = ${k.id}`;
    }
    return c.json({ ok: true });
  });

  app.delete('/api/entry-comments/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own', 'content.publish');
    const [k] = await sql`select id, author_id from entry_comments where id = ${c.req.param('id')}`;
    if (!k) throw notFound('Diesen Kommentar gibt es nicht mehr.');
    if (k.author_id !== user.id && !can(user.role, 'content.publish')) throw forbidden('Nur wer den Kommentar geschrieben hat, kann ihn löschen.');
    await sql`delete from entry_comments where id = ${k.id}`;
    return c.json({ ok: true });
  });
}
