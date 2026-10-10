import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomInt } from 'node:crypto';
import { sql, json } from './db';
import { env } from './env';
import { sha256, token } from './lib/crypto';
import { clientIp, forbidden, HttpError } from './lib/http';
import { can, modesOf, type Capability } from '../shared/roles';
import { ensureRoles } from './roles';
import type { Mode, Role, User } from '../shared/types';
import { getSettings } from './settings';

export const SESSION_COOKIE = 'nova_session';
const SESSION_DAYS = 30;

export interface AuthUser extends User {
  session_id: string;
  allowed_modes: Mode[];
}

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    pending2fa: { sessionId: string; userId: string } | null;
  };
};

export async function createSession(c: Context, userId: string, pending2fa: boolean): Promise<void> {
  const raw = token(32);
  const expires = new Date(Date.now() + (pending2fa ? 10 * 60_000 : SESSION_DAYS * 86_400_000));
  await sql`
    insert into sessions (id, user_id, pending_2fa, user_agent, ip, expires_at)
    values (${sha256(raw)}, ${userId}, ${pending2fa}, ${(c.req.header('user-agent') ?? '').slice(0, 300)}, ${clientIp(c)}, ${expires})`;
  setCookie(c, SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.production,
    path: '/',
    expires,
  });
}

export async function destroySession(c: Context): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) await sql`delete from sessions where id = ${sha256(raw)}`;
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Loads the user for the request, if any. Never throws for anonymous requests. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('pending2fa', null);
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const id = sha256(raw);
    const [row] = await sql`
      select s.id as session_id, s.pending_2fa, s.last_seen_at, u.*
      from sessions s join users u on u.id = s.user_id
      where s.id = ${id} and s.expires_at > now()`;
    if (row?.pending_2fa) {
      c.set('pending2fa', { sessionId: row.session_id, userId: row.id });
    } else if (row && row.role !== 'member') {
      const settings = await getSettings();
      await ensureRoles();
      const allowed = modesOf(row.role as Role, settings.roleModes);
      const { password_hash: _p, totp_secret: _t, pending_2fa: _pd, last_seen_at, ...user } = row;
      c.set('user', { ...(user as unknown as User), session_id: row.session_id, allowed_modes: allowed });
      // Touch at most every 10 minutes and extend the sliding expiry.
      if (Date.now() - new Date(last_seen_at).getTime() > 600_000) {
        await sql`update sessions set last_seen_at = now(), expires_at = now() + interval '30 days' where id = ${id}`;
      }
    }
  }
  await next();
};

export function requireUser(c: Context<AppEnv>): AuthUser {
  const u = c.get('user');
  if (!u) throw new HttpError(401, 'Bitte melde dich an.');
  return u;
}

export function requireCap(c: Context<AppEnv>, cap: Capability): AuthUser {
  const u = requireUser(c);
  if (!can(u.role, cap)) throw forbidden();
  return u;
}

/** Either of the capabilities is enough. */
export function requireAnyCap(c: Context<AppEnv>, ...caps: Capability[]): AuthUser {
  const u = requireUser(c);
  if (!caps.some((cap) => can(u.role, cap))) throw forbidden();
  return u;
}

export async function audit(
  c: Context<AppEnv>,
  action: string,
  entity = '',
  entityId = '',
  meta: Record<string, unknown> = {},
): Promise<void> {
  const u = c.get('user');
  await sql`
    insert into audit_log (user_id, action, entity, entity_id, meta, ip)
    values (${u?.id ?? null}, ${action}, ${entity}, ${entityId}, ${json(meta)}, ${clientIp(c)})`;
}

/**
 * First-run protection: as long as no user exists, creating the owner account
 * requires a code that only appears in the deploy logs (or NOVA_SETUP_CODE).
 * This stops strangers from claiming a freshly deployed instance.
 * The code is stored in the database so it survives redeploys and restarts.
 */
export async function getSetupCode(): Promise<string> {
  if (env.setupCode) return env.setupCode;
  const fresh = `${randomInt(100, 999)}-${randomInt(100, 999)}`;
  await sql`insert into settings (key, value) values ('setup_code', ${json(fresh)}) on conflict do nothing`;
  const [row] = await sql`select value from settings where key = 'setup_code'`;
  return row.value as string;
}

export async function hasUsers(): Promise<boolean> {
  const [r] = await sql`select exists(select 1 from users) as e`;
  return r.e as boolean;
}
