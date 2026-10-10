import type { Hono } from 'hono';
import { sql } from './db';
import { requireCap, type AppEnv } from './auth';
import { getSettings } from './settings';
import { abGroups, abVerdict, runningPopups, type AbVerdict } from '../shared/popups';

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

export interface AbTest {
  variants: { id: string; title: string; shown: number; clicked: number; closed: number }[];
  /** First day on which every pop-up of the test ran – counted from there, so none gets a head start. */
  since: string | null;
  verdict: AbVerdict;
}

/** The A/B test a pop-up takes part in on the website right now, or null. */
export async function abTest(id: string): Promise<AbTest | null> {
  const rows = await sql`
    select id, published_data as data from entries
    where collection = 'sections' and status = 'published' and published_data ->> 'kind' = 'popup'`;
  const live = runningPopups(
    rows.map((r) => ({ id: r.id as string, data: r.data as Record<string, unknown> })),
    Date.now(),
    (await getSettings()).timezone,
  );
  const group = abGroups(live.map((p) => ({ id: p.id, ab: p.data.popup_ab }))).get(id);
  if (!group) return null;
  const counted = await sql`
    with s as (select * from popup_stats where popup_id = any(${group}::uuid[]) and day > current_date - 90),
    start as (select max(first) as d from (select min(day) as first from s group by popup_id) x)
    select popup_id::text as id, sum(shown)::int as shown, sum(clicked)::int as clicked, sum(closed)::int as closed, to_char((select d from start), 'YYYY-MM-DD') as since
    from s where day >= (select d from start) group by popup_id`;
  const title = new Map(live.map((p) => [p.id, String(p.data.title ?? '')]));
  const variants = group.map((v) => {
    const r = counted.find((x) => x.id === v);
    return { id: v, title: title.get(v) ?? '', shown: Number(r?.shown ?? 0), clicked: Number(r?.clicked ?? 0), closed: Number(r?.closed ?? 0) };
  });
  return { variants, since: (counted[0]?.since as string | undefined) ?? null, verdict: abVerdict(variants) };
}

export function popupsApi(app: Hono<AppEnv>) {
  app.get('/api/popups/:id/stats', async (c) => {
    requireCap(c, 'content.edit');
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ shown: 0, clicked: 0, closed: 0, days: [], ab: null });
    return c.json({ ...(await popupStats(id, 30)), ab: await abTest(id) });
  });
}
