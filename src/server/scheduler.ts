import { publishDue } from './content';
import { dailyBackup } from './backup';
import { sql } from './db';
import { bumpGeneration } from './settings';

/**
 * In-process jobs. Nova runs as one service, so a timer is all we need.
 * Each job is guarded so a slow run never overlaps the next one.
 */
function every(ms: number, name: string, job: () => Promise<unknown>) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (e) {
      console.error(`[scheduler] ${name}:`, (e as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, ms).unref();
  setTimeout(tick, 5_000).unref();
}

export function startScheduler() {
  every(30_000, 'scheduled publishing', publishDue);
  every(60 * 60_000, 'backup', dailyBackup);
  every(60 * 60_000, 'cleanup', async () => {
    await sql`delete from sessions where expires_at < now()`;
    // Raw statistics are kept for 25 months, enough for year-over-year comparisons.
    await sql`delete from analytics_events where ts < now() - interval '25 months'`;
    await sql`delete from audit_log where created_at < now() - interval '2 years'`;
  });
  // Opening hours ("jetzt geöffnet") change with the clock.
  every(5 * 60_000, 'clock', async () => bumpGeneration());
}
