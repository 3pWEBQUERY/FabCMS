import { gunzipSync, gzipSync } from 'node:zlib';
import { sql, json } from './db';
import { storage } from './storage';
import { bumpGeneration, invalidateSettings } from './settings';
import { invalidateCollections } from './content';
import { badRequest, notFound } from './lib/http';

/**
 * Daily snapshots of all content tables as gzipped JSON in the bucket,
 * kept for 30 days. Media files already live in the bucket and are not
 * duplicated. Railway Postgres has its own volume backups on top.
 */

const TABLES = ['users', 'settings', 'collections', 'entries', 'revisions', 'redirects', 'media', 'forms', 'contacts', 'submissions', 'coupons', 'orders', 'comments', 'api_tokens'] as const;
const RETENTION_DAYS = 30;

export async function createBackup(kind: 'auto' | 'manual' = 'manual'): Promise<{ id: string; size: number }> {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) dump[t] = [...(await sql`select * from ${sql(t)}`)];
  const [{ seq }] = await sql`select last_value as seq from order_number_seq`;
  const body = gzipSync(Buffer.from(JSON.stringify({ format: 'nova-backup', version: 1, createdAt: new Date().toISOString(), orderSeq: Number(seq), tables: dump })));
  const key = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
  await storage.put(key, body, 'application/gzip');
  const [row] = await sql`insert into backups (storage_key, size, kind) values (${key}, ${body.length}, ${kind}) returning id`;
  return { id: row.id as string, size: body.length };
}

export async function pruneBackups(): Promise<void> {
  const old = await sql`select id, storage_key from backups where created_at < now() - make_interval(days => ${RETENTION_DAYS})`;
  for (const b of old) {
    await storage.delete(b.storage_key as string).catch(() => {});
    await sql`delete from backups where id = ${b.id}`;
  }
}

export async function dailyBackup(): Promise<void> {
  const [last] = await sql`select created_at from backups where kind = 'auto' order by created_at desc limit 1`;
  if (last && Date.now() - new Date(last.created_at).getTime() < 22 * 3_600_000) return;
  await createBackup('auto');
  await pruneBackups();
}

/** Restores a snapshot. Users are merged (nobody gets locked out), everything else is replaced. */
export async function restoreBackup(id: string): Promise<void> {
  const [b] = await sql`select storage_key from backups where id = ${id}`;
  if (!b) throw notFound('Diese Sicherung gibt es nicht mehr.');
  const buf = await storage.getBuffer(b.storage_key as string);
  if (!buf) throw notFound('Die Sicherungsdatei fehlt im Speicher.');
  const data = JSON.parse(gunzipSync(buf).toString('utf8')) as { format: string; orderSeq: number; tables: Record<string, Record<string, unknown>[]> };
  if (data.format !== 'nova-backup') throw badRequest('Das ist keine Nova-Sicherung.');
  // Safety net: snapshot the current state first.
  await createBackup('manual');

  await sql.begin(async (tx) => {
    for (const t of ['comments', 'submissions', 'revisions', 'entries', 'collections', 'media', 'forms', 'contacts', 'coupons', 'orders', 'redirects', 'api_tokens'])
      await tx`delete from ${tx(t)}`;
    await tx`delete from settings where key <> 'secret'`;

    const users = data.tables.users ?? [];
    if (users.length) await tx`insert into users select * from jsonb_populate_recordset(null::users, ${json(users)}) on conflict do nothing`;
    const present = new Set((await tx`select id from users`).map((r) => r.id as string));
    const fixUser = (rows: Record<string, unknown>[], col: string) => rows.map((r) => (r[col] && !present.has(r[col] as string) ? { ...r, [col]: null } : r));

    const insert = async (table: string, rows: Record<string, unknown>[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await tx`insert into ${tx(table)} select * from jsonb_populate_recordset(null::${tx(table)}, ${json(chunk)})`;
      }
    };
    await insert('settings', (data.tables.settings ?? []).filter((r) => r.key !== 'secret'));
    await insert('collections', data.tables.collections ?? []);
    await insert('media', fixUser(data.tables.media ?? [], 'uploaded_by'));
    await insert('entries', fixUser(data.tables.entries ?? [], 'author_id'));
    await insert('revisions', fixUser(data.tables.revisions ?? [], 'user_id'));
    await insert('forms', data.tables.forms ?? []);
    await insert('contacts', data.tables.contacts ?? []);
    await insert('submissions', data.tables.submissions ?? []);
    await insert('coupons', data.tables.coupons ?? []);
    await insert('orders', data.tables.orders ?? []);
    await insert('comments', data.tables.comments ?? []);
    await insert('redirects', data.tables.redirects ?? []);
    await insert('api_tokens', fixUser(data.tables.api_tokens ?? [], 'created_by'));
    await tx`select setval('order_number_seq', greatest(${data.orderSeq}, (select coalesce(max(nullif(regexp_replace(number, '\\D', '', 'g'), '')::bigint), 1000) from orders)))`;
    await tx`select setval('revisions_id_seq', greatest(1, (select coalesce(max(id), 1) from revisions)))`;
  });
  invalidateSettings();
  invalidateCollections();
  bumpGeneration();
}
