import { publishDue, purgeTrash, unpublishDue } from './content';
import { dailyBackup } from './backup';
import { sql } from './db';
import { bumpGeneration } from './settings';
import { notify } from './notify';
import { importCalendars, releaseUnpaid, sendReminders } from './booking';
import { newsletterJobs } from './newsletter';
import { releaseUnpaidTickets } from './tickets';
import { dropAbandonedDonations } from './donations';
import { releaseUnpaidFood } from './ordering';

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
  every(30_000, 'expiry', unpublishDue);
  every(5 * 60_000, 'booking reminders', async () => {
    await sendReminders();
    await releaseUnpaid();
    await releaseUnpaidTickets();
    await dropAbandonedDonations();
    await releaseUnpaidFood();
  });
  every(15 * 60_000, 'booking calendars', importCalendars);
  every(10 * 60_000, 'newsletter', () => newsletterJobs());
  every(60 * 60_000, 'backup', async () => {
    try {
      await dailyBackup();
    } catch (e) {
      // Tell the people who can fix it, at most once a day.
      const [recent] = await sql`select 1 from notifications where kind = 'system' and title like 'Backup%' and created_at > now() - interval '1 day'`;
      if (!recent) await notify({ kind: 'system', cap: 'settings.manage', title: 'Backup fehlgeschlagen', body: (e as Error).message, href: '/einstellungen/daten' });
      throw e;
    }
  });
  every(60 * 60_000, 'cleanup', async () => {
    await sql`delete from sessions where expires_at < now()`;
    await sql`delete from member_sessions where expires_at < now()`;
    await sql`delete from member_tokens where expires_at < now()`;
    // Accounts never confirmed are dropped after 30 days.
    await sql`delete from members where email_verified_at is null and created_at < now() - interval '30 days' and stripe_customer is null`;
    // Raw statistics are kept for 25 months, enough for year-over-year comparisons.
    await sql`delete from analytics_events where ts < now() - interval '25 months'`;
    await sql`delete from audit_log where created_at < now() - interval '2 years'`;
    await sql`delete from notifications where created_at < now() - interval '90 days'`;
    await purgeTrash();
  });
  // Opening hours ("jetzt geöffnet") change with the clock.
  every(5 * 60_000, 'clock', async () => bumpGeneration());
}
