import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app';
import { migrate } from './migrate';
import { env, s3Configured } from './env';
import { syncBuiltinCollections } from './content';
import { getSetupCode, hasUsers } from './auth';
import { getSettings } from './settings';
import { startScheduler } from './scheduler';
import { runtimeScript } from '../site/assets';
import { sql } from './db';

async function main() {
  const applied = await migrate(join(process.cwd(), 'migrations'));
  if (applied.length) console.info(`[nova] Migrationen angewendet: ${applied.join(', ')}`);
  if (process.argv.includes('--migrate-only')) {
    await sql.end();
    return;
  }
  await syncBuiltinCollections();
  await getSettings();
  await Promise.all([runtimeScript('site'), runtimeScript('bridge'), runtimeScript('fields')]);

  const app = createApp();
  serve({ fetch: app.fetch, port: env.port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
    console.info(`[nova] läuft auf Port ${env.port} – ${env.publicUrl}`);
    console.info(`[nova] Speicher: ${s3Configured() ? `Bucket «${env.s3.bucket}»` : `lokal (${env.localStorageDir}) – für Railway BUCKET/ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY setzen`}`);
  });
  if (!(await hasUsers())) {
    const code = await getSetupCode();
    console.info('');
    console.info('  ┌──────────────────────────────────────────────┐');
    console.info(`  │  Einrichtungscode: ${code.padEnd(26)}│`);
    console.info(`  │  Öffne ${(env.publicUrl + '/admin').padEnd(38).slice(0, 38)}│`);
    console.info('  └──────────────────────────────────────────────┘');
    console.info('');
  }
  startScheduler();

  const shutdown = async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('[nova] Start fehlgeschlagen:', e);
  process.exit(1);
});
