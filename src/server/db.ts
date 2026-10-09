import postgres from 'postgres';
import { env } from './env';

export const sql = postgres(env.databaseUrl, {
  max: Number(process.env.DATABASE_POOL ?? 10),
  idle_timeout: 30,
  onnotice: () => {},
  // Railway's public proxy needs TLS, the private network does not.
  ssl: /sslmode=require|proxy\.rlwy\.net/.test(env.databaseUrl) ? 'require' : undefined,
  transform: { undefined: null },
});

export type Sql = typeof sql;
export type Tx = postgres.TransactionSql;

/** postgres.js wants plain JSON values; this keeps TypeScript out of the way. */
export const json = (v: unknown) => sql.json(v as postgres.JSONValue);
