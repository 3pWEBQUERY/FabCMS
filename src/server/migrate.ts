import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from './db';

/**
 * Applies every *.sql file in /migrations exactly once, in order, each in its
 * own transaction. An advisory lock makes parallel deploys safe.
 */
export async function migrate(dir: string): Promise<string[]> {
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(482193)`;
    await tx`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx`select name from _migrations`).map((r) => r.name as string));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(join(dir, file), 'utf8');
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
      applied.push(file);
    }
  });
  return applied;
}
