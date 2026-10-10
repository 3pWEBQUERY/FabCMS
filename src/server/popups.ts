import type { Hono } from 'hono';
import { sql } from './db';
import { requireCap, type AppEnv } from './auth';
import { getSettings } from './settings';

export type PopupEvent = 'show' | 'click' | 'close';
const COLUMN = { show: 'shown', click: 'clicked', close: 'closed' } as const;

/** Counts one event for a published pop-up, on the site's calendar day. Unknown ids count nothing. */
export async function recordPopup(id: string, event: PopupEvent, now = new Date()): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(event in COLUMN)) return;
  const [p] = await sql`select 1 from entries where id = ${id} and collection = 'sections' and status = 'published' and published_data ->> 'kind' = 'popup'`;
  if (!p) return;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: (await getSettings()).timezone }).format(now);
  const col = COLUMN[event];
  await sql`
    insert into popup_stats (popup_id, day, ${sql(col)}) values (${id}, ${day}, 1)
    on conflict (popup_id, day) do update set ${sql(col)} = popup_stats.${sql(col)} + 1`;
}

export interface PopupStats {
  shown: number;
  clicked: number;
  closed: number;
  days: { day: string; shown: number; clicked: number }[];
}

/** The last days of a pop-up, totals and per day. */
export async function popupStats(id: string, days = 30): Promise<PopupStats> {
  const rows = await sql`
    select to_char(day, 'YYYY-MM-DD') as day, shown, clicked, closed from popup_stats
    where popup_id = ${id} and day > current_date - ${days}::int order by day`;
  const sum = (k: 'shown' | 'clicked' | 'closed') => rows.reduce((n, r) => n + Number(r[k]), 0);
  return {
    shown: sum('shown'),
    clicked: sum('clicked'),
    closed: sum('closed'),
    days: rows.map((r) => ({ day: r.day as string, shown: Number(r.shown), clicked: Number(r.clicked) })),
  };
}

export function popupsApi(app: Hono<AppEnv>) {
  app.get('/api/popups/:id/stats', async (c) => {
    requireCap(c, 'content.edit');
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ shown: 0, clicked: 0, closed: 0, days: [] });
    return c.json(await popupStats(id, 30));
  });
}
