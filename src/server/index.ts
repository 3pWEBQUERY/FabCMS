import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from './app';
import { migrate } from './migrate';
import { env, s3Configured } from './env';
import { syncBuiltinCollections } from './content';
import { getSetupCode, hasUsers } from './auth';
import { bumpGeneration, getSettings } from './settings';
import { startScheduler } from './scheduler';
import { runtimeScript } from '../site/assets';
import { backfillPlaceholders } from './media';
import { resumeVideos } from './video';
import { startSearchSync } from './search';
import { sql } from './db';
import type { Server } from 'node:http';
import { attachCollab, flushRooms } from './collab';

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
  const server = serve({ fetch: app.fetch, port: env.port, hostname: process.env.HOST ?? '0.0.0.0' }, () => {
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
  // Real-time editing over WebSocket (/api/collab/:entry).
  attachCollab(server as Server);
  startScheduler();
  // Loading previews for images uploaded before they existed; runs once, in the background.
  startSearchSync();
  void resumeVideos()
    .then((n) => n && console.info(`[nova] Videos für das Web aufbereiten: ${n}`))
    .catch((e) => console.error('[nova] Videos:', e));
  void backfillPlaceholders()
    .then((n) => {
      if (!n) return;
      console.info(`[nova] Vorschaubilder berechnet: ${n}`);
      bumpGeneration(); // cached pages pick them up
    })
    .catch((e) => console.error('[nova] Vorschaubilder:', e));

  const shutdown = async () => {
    await flushRooms().catch(() => {});
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
