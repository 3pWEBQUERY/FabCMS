import type { Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import { appSecret } from './settings';
import { clientIp } from './lib/http';
import { rateLimit } from './lib/ratelimit';
import { sign, unsign } from './lib/crypto';
import type { AppEnv } from './auth';
import type { EntryData } from '../shared/types';

/** Pages opened with their password, in a signed cookie: entry id → a tag of that password. */
export const PW_COOKIE = 'nova_pw';

/** Changes with the password, so a new one shuts everyone out again. */
export const pwTag = (id: string, password: unknown) =>
  createHash('sha256')
    .update(`${id}:${String(password ?? '')}`)
    .digest('base64url')
    .slice(0, 16);

export async function readUnlocked(c: Context): Promise<Record<string, string>> {
  const raw = unsign(getCookie(c, PW_COOKIE), await appSecret());
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function pagePasswordRoutes(app: Hono<AppEnv>) {
  app.post('/_nova/unlock/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.parseBody();
    const back = typeof body.back === 'string' && body.back.startsWith('/') && !body.back.startsWith('//') ? body.back : '/';
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.redirect(back, 303);
    const [e] = await sql`select published_data from entries where id = ${id} and status = 'published'`;
    const d = e?.published_data as EntryData | undefined;
    const password = typeof d?.page_password === 'string' ? d.page_password : '';
    // Ten tries per page and address in a quarter of an hour.
    const tries = rateLimit(`unlock:${clientIp(c)}:${id}`, 10, 15 * 60_000);
    const given = String(body.password ?? '');
    if (!tries.ok || d?.access !== 'password' || !password || !same(given, password)) {
      const u = new URL(back, 'http://x');
      u.searchParams.set('passwort', tries.ok ? 'falsch' : 'pause');
      return c.redirect(`${u.pathname}${u.search}#zugang`, 303);
    }
    const open = await readUnlocked(c);
    // The newest twenty pages are enough; older ones fall out.
    const next = Object.fromEntries([...Object.entries(open).filter(([k]) => k !== id), [id, pwTag(id, password)]].slice(-20));
    setCookie(c, PW_COOKIE, sign(JSON.stringify(next), await appSecret()), { httpOnly: true, sameSite: 'Lax', secure: env.production, path: '/', maxAge: 60 * 60 * 24 * 30 });
    return c.redirect(back, 303);
  });
}
