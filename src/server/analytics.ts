import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';

/**
 * Cookieless statistics, comparable to Plausible: a visitor is identified by a
 * hash of IP + user agent + a salt that rotates every day and is never stored.
 * Yesterday's visitors can't be linked to today's, nothing is kept on the
 * device, so no consent banner is required (nDSG/DSGVO, ePrivacy).
 */
let salt = { day: '', value: '' };

function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  if (salt.day !== day) salt = { day, value: randomBytes(16).toString('hex') };
  return salt.value;
}

export function visitorId(ip: string, ua: string): string {
  return createHash('sha256').update(`${dailySalt()}|${ip}|${ua}`).digest('hex').slice(0, 16);
}

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;

export function isBot(ua: string) {
  return !ua || BOTS.test(ua);
}

function referrerHost(ref: string, ownHost: string): string {
  try {
    const u = new URL(ref);
    const h = u.hostname.replace(/^www\./, '');
    return h === ownHost.replace(/^www\./, '') ? '' : h;
  } catch {
    return '';
  }
}

export async function recordHit(input: { path: string; referrer: string; width: number; ip: string; ua: string; host: string }) {
  if (isBot(input.ua)) return;
  const path = input.path.slice(0, 300).split('?')[0];
  if (path.startsWith('/admin') || path.startsWith('/_nova')) return;
  const device = input.width && input.width < 640 ? 'mobile' : input.width && input.width < 1024 ? 'tablet' : 'desktop';
  await sql`
    insert into analytics_events (kind, path, referrer, visitor, device)
    values ('pageview', ${path}, ${referrerHost(input.referrer, input.host)}, ${visitorId(input.ip, input.ua)}, ${device})`;
}

export async function recordGoal(goal: string, ip: string, ua: string, path = '', valueCents: number | null = null) {
  await sql`
    insert into analytics_events (kind, path, visitor, goal, value_cents)
    values ('goal', ${path.slice(0, 300)}, ${isBot(ua) ? 'server' : visitorId(ip, ua)}, ${goal}, ${valueCents})`;
}

export interface Stats {
  range: { from: string; to: string; days: number };
  totals: { visitors: number; pageviews: number; bounce: number; visitorsPrev: number; pageviewsPrev: number };
  series: { day: string; visitors: number; pageviews: number }[];
  pages: { path: string; visitors: number; pageviews: number }[];
  sources: { source: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  goals: { goal: string; count: number; value: number }[];
}

export async function stats(days: number, timezone: string): Promise<Stats> {
  const d = Math.max(1, Math.min(365, Math.round(days)));
  const [range] = await sql`
    select (date_trunc('day', now() at time zone ${timezone}) - make_interval(days => ${d - 1})) as from_day,
           (date_trunc('day', now() at time zone ${timezone})) as to_day`;
  const from = sql`(${range.from_day}::timestamp at time zone ${timezone})`;
  const prevFrom = sql`((${range.from_day}::timestamp - make_interval(days => ${d})) at time zone ${timezone})`;

  const [tot] = await sql`
    with pv as (select visitor, path, ts from analytics_events where kind = 'pageview' and ts >= ${from}),
    per_visitor as (select visitor, count(*) as n from pv group by visitor, date_trunc('day', ts))
    select (select count(*) from per_visitor) as visitors,
           (select count(*) from pv) as pageviews,
           (select coalesce(round(100.0 * count(*) filter (where n = 1) / nullif(count(*), 0)), 0) from per_visitor) as bounce`;
  const [prev] = await sql`
    select count(distinct (visitor, date_trunc('day', ts))) as visitors, count(*) as pageviews
    from analytics_events where kind = 'pageview' and ts >= ${prevFrom} and ts < ${from}`;
  const series = await sql`
    with days as (select generate_series(${range.from_day}::timestamp, ${range.to_day}::timestamp, interval '1 day') as day)
    select to_char(days.day, 'YYYY-MM-DD') as day,
           count(distinct e.visitor) as visitors, count(e.id) as pageviews
    from days left join analytics_events e
      on e.kind = 'pageview' and (e.ts at time zone ${timezone})::date = days.day::date
    group by days.day order by days.day`;
  const pages = await sql`
    select path, count(distinct (visitor, date_trunc('day', ts))) as visitors, count(*) as pageviews
    from analytics_events where kind = 'pageview' and ts >= ${from}
    group by path order by visitors desc, pageviews desc limit 12`;
  const sources = await sql`
    select coalesce(nullif(referrer, ''), 'Direkt') as source, count(distinct (visitor, date_trunc('day', ts))) as visitors
    from analytics_events where kind = 'pageview' and ts >= ${from}
    group by 1 order by 2 desc limit 10`;
  const devices = await sql`
    select device, count(distinct (visitor, date_trunc('day', ts))) as visitors
    from analytics_events where kind = 'pageview' and ts >= ${from} group by device order by 2 desc`;
  const goals = await sql`
    select goal, count(*) as count, coalesce(sum(value_cents), 0) as value
    from analytics_events where kind = 'goal' and ts >= ${from} group by goal order by 2 desc`;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    range: { from: String(range.from_day), to: String(range.to_day), days: d },
    totals: { visitors: n(tot.visitors), pageviews: n(tot.pageviews), bounce: n(tot.bounce), visitorsPrev: n(prev.visitors), pageviewsPrev: n(prev.pageviews) },
    series: series.map((r) => ({ day: r.day as string, visitors: n(r.visitors), pageviews: n(r.pageviews) })),
    pages: pages.map((r) => ({ path: r.path as string, visitors: n(r.visitors), pageviews: n(r.pageviews) })),
    sources: sources.map((r) => ({ source: r.source as string, visitors: n(r.visitors) })),
    devices: devices.map((r) => ({ device: r.device as string, visitors: n(r.visitors) })),
    goals: goals.map((r) => ({ goal: r.goal as string, count: n(r.count), value: n(r.value) })),
  };
}
