import type { Hono } from 'hono';
import { authenticationOptions, registerPasskey, registrationOptions, verifyPasskeyLogin } from '../passkeys';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { sql } from '../db';
import {
  audit,
  createSession,
  destroySession,
  getSetupCode,
  hasUsers,
  requireCap,
  requireUser,
  type AppEnv,
} from '../auth';
import { hashPassword, token, totpSecret, totpUri, verifyPassword, verifyTotp } from '../lib/crypto';
import { badRequest, clientIp, forbidden, HttpError, notFound } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { getSettings } from '../settings';
import { sendMail } from '../mail';
import { env } from '../env';
import { ROLE_CAPS, type Capability } from '../../shared/roles';
import type { Role, User } from '../../shared/types';

const PUBLIC_USER = sql`id, email, name, role, mode, totp_enabled, sessions_count, seen_hints, created_at, last_login_at`;

const password = z.string().min(10, 'Das Passwort braucht mindestens 10 Zeichen.').max(200);

async function publicUser(id: string): Promise<User> {
  const [u] = await sql`select ${PUBLIC_USER} from users where id = ${id}`;
  return u as unknown as User;
}

export function authApi(app: Hono<AppEnv>) {
  app.get('/api/session', async (c) => {
    const user = c.get('user');
    const pending = c.get('pending2fa');
    const settings = await getSettings();
    if (!user)
      return c.json({
        user: null,
        twoFactorPending: Boolean(pending),
        setupRequired: !(await hasUsers()),
        site: { name: settings.name },
      });
    const { session_id: _sid, ...publicFields } = user;
    return c.json({
      user: publicFields,
      caps: ROLE_CAPS[user.role] as Capability[],
      setupRequired: false,
      site: { name: settings.name, setupDone: settings.setupDone },
    });
  });

  app.post('/api/setup', async (c) => {
    if (await hasUsers()) throw forbidden('Nova ist bereits eingerichtet.');
    const ip = clientIp(c);
    if (!rateLimit(`setup:${ip}`, 10, 15 * 60_000).ok) throw new HttpError(429, 'Zu viele Versuche. Warte ein paar Minuten.');
    const body = z
      .object({ code: z.string(), name: z.string().trim().min(1, 'Bitte gib deinen Namen an.').max(80), email: z.string().trim().email('Bitte gib eine gültige E-Mail-Adresse an.'), password })
      .parse(await c.req.json());
    if (body.code.replace(/\s/g, '') !== (await getSetupCode())) throw badRequest('Der Einrichtungscode stimmt nicht. Du findest ihn in den Logs deines Railway-Dienstes.');
    const [u] = await sql`
      insert into users (email, name, password_hash, role, mode, sessions_count, last_login_at)
      values (${body.email.toLowerCase()}, ${body.name}, ${await hashPassword(body.password)}, 'owner', 'studio', 1, now())
      returning id`;
    await createSession(c, u.id as string, false);
    c.set('user', null);
    await sql`insert into audit_log (user_id, action, ip) values (${u.id}, 'setup.owner', ${ip})`;
    await sql`delete from settings where key = 'setup_code'`;
    return c.json({ ok: true });
  });

  app.post('/api/login', async (c) => {
    const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string().max(200) }).parse(await c.req.json());
    const ip = clientIp(c);
    const limit = rateLimit(`login:${ip}`, 10, 15 * 60_000);
    const perUser = rateLimit(`login:${body.email}`, 6, 15 * 60_000);
    if (!limit.ok || !perUser.ok)
      throw new HttpError(429, `Zu viele Anmeldeversuche. Versuch es in ${Math.ceil(Math.max(limit.retryAfter, perUser.retryAfter) / 60)} Minuten nochmals.`);
    const [u] = await sql`select id, password_hash, totp_enabled, role from users where lower(email) = ${body.email}`;
    // Compare against a dummy hash for unknown users so timing doesn't reveal accounts.
    const ok = await verifyPassword(body.password, u?.password_hash ?? 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!u || !ok) throw new HttpError(401, 'E-Mail oder Passwort stimmen nicht.');
    if (u.role === 'member') throw forbidden('Dieses Konto hat keinen Zugang zur Verwaltung.');
    await createSession(c, u.id as string, u.totp_enabled as boolean);
    if (u.totp_enabled) return c.json({ twoFactor: true });
    await sql`update users set sessions_count = sessions_count + 1, last_login_at = now() where id = ${u.id}`;
    await sql`insert into audit_log (user_id, action, ip) values (${u.id}, 'login', ${ip})`;
    return c.json({ ok: true });
  });

  /* passkeys */
  app.post('/api/login/passkey/options', async (c) => {
    if (!rateLimit(`passkey:${clientIp(c)}`, 20, 15 * 60_000).ok) throw new HttpError(429, 'Zu viele Versuche. Bitte warte eine Viertelstunde.');
    return c.json(await authenticationOptions(c));
  });

  app.post('/api/login/passkey', async (c) => {
    const body = z.object({ key: z.string().max(64), response: z.any() }).parse(await c.req.json());
    if (!rateLimit(`passkey:${clientIp(c)}`, 20, 15 * 60_000).ok) throw new HttpError(429, 'Zu viele Versuche. Bitte warte eine Viertelstunde.');
    const { userId, userVerified } = await verifyPasskeyLogin(c, body.key, body.response as AuthenticationResponseJSON);
    const [u] = await sql`select id, role, totp_enabled from users where id = ${userId}`;
    if (!u) throw new HttpError(401, 'Dieses Konto gibt es nicht mehr.');
    if (u.role === 'member') throw forbidden('Dieses Konto hat keinen Zugang zur Verwaltung.');
    // A passkey with fingerprint/face/PIN is two factors in one. Without that check, 2FA still applies.
    const needs2fa = Boolean(u.totp_enabled) && !userVerified;
    await createSession(c, u.id as string, needs2fa);
    if (needs2fa) return c.json({ twoFactor: true });
    await sql`update users set sessions_count = sessions_count + 1, last_login_at = now() where id = ${u.id}`;
    await sql`insert into audit_log (user_id, action, ip) values (${u.id}, 'login.passkey', ${clientIp(c)})`;
    return c.json({ ok: true });
  });

  app.get('/api/me/passkeys', async (c) => {
    const u = requireUser(c);
    const rows = await sql`select id, name, backed_up, created_at, last_used_at from passkeys where user_id = ${u.id} order by created_at`;
    return c.json({ passkeys: rows });
  });

  app.post('/api/me/passkeys/options', async (c) => {
    const u = requireUser(c);
    return c.json(await registrationOptions(c, u));
  });

  app.post('/api/me/passkeys', async (c) => {
    const u = requireUser(c);
    const body = z.object({ response: z.any(), name: z.string().max(60).default('') }).parse(await c.req.json());
    await registerPasskey(c, u, body.response as RegistrationResponseJSON, body.name);
    await audit(c, 'passkey.add');
    return c.json({ ok: true });
  });

  app.delete('/api/me/passkeys/:id', async (c) => {
    const u = requireUser(c);
    await sql`delete from passkeys where id = ${c.req.param('id')} and user_id = ${u.id}`;
    await audit(c, 'passkey.remove');
    return c.json({ ok: true });
  });

  app.post('/api/login/2fa', async (c) => {
    const pending = c.get('pending2fa');
    if (!pending) throw new HttpError(401, 'Die Anmeldung ist abgelaufen. Bitte melde dich nochmals an.');
    if (!rateLimit(`2fa:${pending.sessionId}`, 5, 10 * 60_000).ok) throw new HttpError(429, 'Zu viele Versuche. Bitte melde dich nochmals an.');
    const { code } = z.object({ code: z.string() }).parse(await c.req.json());
    const [u] = await sql`select totp_secret from users where id = ${pending.userId}`;
    if (!u?.totp_secret || !verifyTotp(u.totp_secret as string, code)) throw badRequest('Der Code stimmt nicht. Prüf die Uhrzeit auf deinem Handy.');
    await sql`delete from sessions where id = ${pending.sessionId}`;
    await createSession(c, pending.userId, false);
    await sql`update users set sessions_count = sessions_count + 1, last_login_at = now() where id = ${pending.userId}`;
    await sql`insert into audit_log (user_id, action, ip) values (${pending.userId}, 'login.2fa', ${clientIp(c)})`;
    return c.json({ ok: true });
  });

  app.post('/api/logout', async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  });

  /* ---------- own account ---------- */

  app.patch('/api/me', async (c) => {
    const user = requireUser(c);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        mode: z.enum(['studio', 'werkbank']).optional(),
        seenHint: z.string().max(60).optional(),
        currentPassword: z.string().optional(),
        newPassword: password.optional(),
      })
      .parse(await c.req.json());
    if (body.mode && !user.allowed_modes.includes(body.mode)) throw forbidden('Deine Rolle hat keinen Zugang zur Werkbank.');
    if (body.name) await sql`update users set name = ${body.name} where id = ${user.id}`;
    if (body.mode) await sql`update users set mode = ${body.mode} where id = ${user.id}`;
    if (body.seenHint) await sql`update users set seen_hints = array_append(seen_hints, ${body.seenHint}) where id = ${user.id} and not (${body.seenHint} = any(seen_hints))`;
    if (body.newPassword) {
      const [u] = await sql`select password_hash from users where id = ${user.id}`;
      if (!(await verifyPassword(body.currentPassword ?? '', u.password_hash as string))) throw badRequest('Das aktuelle Passwort stimmt nicht.');
      await sql`update users set password_hash = ${await hashPassword(body.newPassword)} where id = ${user.id}`;
      await sql`delete from sessions where user_id = ${user.id} and id <> ${user.session_id}`;
      await audit(c, 'user.password');
    }
    return c.json({ user: { ...(await publicUser(user.id)), allowed_modes: user.allowed_modes } });
  });

  app.get('/api/me/sessions', async (c) => {
    const user = requireUser(c);
    const rows = await sql`select id, user_agent, ip, created_at, last_seen_at from sessions where user_id = ${user.id} and not pending_2fa order by last_seen_at desc`;
    return c.json({ sessions: rows.map((r) => ({ ...r, id: r.id.slice(0, 12), current: r.id === user.session_id })) });
  });

  app.delete('/api/me/sessions/:id', async (c) => {
    const user = requireUser(c);
    await sql`delete from sessions where user_id = ${user.id} and left(id, 12) = ${c.req.param('id')} and id <> ${user.session_id}`;
    return c.json({ ok: true });
  });

  app.post('/api/me/totp/start', async (c) => {
    const user = requireUser(c);
    const secret = totpSecret();
    await sql`update users set totp_secret = ${secret}, totp_enabled = false where id = ${user.id}`;
    const s = await getSettings();
    const uri = totpUri(secret, user.email, `Nova · ${s.name}`);
    const svg = await QRCode.toString(uri, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    return c.json({ secret, uri, svg });
  });

  app.post('/api/me/totp/enable', async (c) => {
    const user = requireUser(c);
    const { code } = z.object({ code: z.string() }).parse(await c.req.json());
    const [u] = await sql`select totp_secret from users where id = ${user.id}`;
    if (!u?.totp_secret || !verifyTotp(u.totp_secret as string, code)) throw badRequest('Der Code stimmt nicht. Gib die sechs Ziffern ein, die deine App gerade zeigt.');
    await sql`update users set totp_enabled = true where id = ${user.id}`;
    await audit(c, 'user.2fa.enable');
    return c.json({ ok: true });
  });

  app.post('/api/me/totp/disable', async (c) => {
    const user = requireUser(c);
    const { password: pw } = z.object({ password: z.string() }).parse(await c.req.json());
    const [u] = await sql`select password_hash from users where id = ${user.id}`;
    if (!(await verifyPassword(pw, u.password_hash as string))) throw badRequest('Das Passwort stimmt nicht.');
    await sql`update users set totp_enabled = false, totp_secret = null where id = ${user.id}`;
    await audit(c, 'user.2fa.disable');
    return c.json({ ok: true });
  });

  /* ---------- team ---------- */

  app.get('/api/users', async (c) => {
    requireCap(c, 'users.manage');
    const rows = await sql`select ${PUBLIC_USER} from users order by created_at`;
    return c.json({ users: rows });
  });

  app.post('/api/users', async (c) => {
    const me = requireCap(c, 'users.manage');
    const body = z
      .object({ email: z.string().trim().email('Bitte gib eine gültige E-Mail-Adresse an.'), name: z.string().trim().min(1).max(80), role: z.enum(['admin', 'editor', 'author', 'member']) })
      .parse(await c.req.json());
    if (body.role === 'admin' && me.role !== 'owner') throw forbidden('Nur die Inhaberin oder der Inhaber kann Admins hinzufügen.');
    const [exists] = await sql`select 1 from users where lower(email) = lower(${body.email})`;
    if (exists) throw badRequest('Diese E-Mail-Adresse hat schon ein Konto.');
    const temp = token(9);
    const [u] = await sql`
      insert into users (email, name, password_hash, role, mode)
      values (${body.email.toLowerCase()}, ${body.name}, ${await hashPassword(temp)}, ${body.role}, 'studio')
      returning id`;
    const s = await getSettings();
    const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
    const mailed = await sendMail({
      to: body.email,
      subject: `Dein Zugang zu ${s.name}`,
      text: `Hallo ${body.name}\n\n${me.name} hat dir Zugang zur Website ${s.name} gegeben.\n\nAnmelden: ${base}/admin\nE-Mail: ${body.email}\nVorläufiges Passwort: ${temp}\n\nBitte ändere das Passwort nach der ersten Anmeldung.`,
    });
    await audit(c, 'user.create', 'user', u.id as string, { role: body.role });
    return c.json({ user: await publicUser(u.id as string), temporaryPassword: temp, mailed });
  });

  app.patch('/api/users/:id', async (c) => {
    const me = requireCap(c, 'users.manage');
    const id = c.req.param('id');
    const body = z.object({ role: z.enum(['owner', 'admin', 'editor', 'author', 'member']).optional(), name: z.string().trim().min(1).max(80).optional() }).parse(await c.req.json());
    const [target] = await sql`select role from users where id = ${id}`;
    if (!target) throw notFound();
    if (body.role) {
      if ((target.role === 'owner' || body.role === 'owner') && me.role !== 'owner') throw forbidden('Nur die Inhaberin oder der Inhaber kann diese Rolle ändern.');
      if (target.role === 'owner' && body.role !== 'owner') {
        const [{ n }] = await sql`select count(*)::int as n from users where role = 'owner'`;
        if (n <= 1) throw badRequest('Es muss mindestens eine Inhaberin oder einen Inhaber geben.');
      }
      await sql`update users set role = ${body.role as Role} where id = ${id}`;
      if (body.role === 'member') await sql`delete from sessions where user_id = ${id}`;
    }
    if (body.name) await sql`update users set name = ${body.name} where id = ${id}`;
    await audit(c, 'user.update', 'user', id, body);
    return c.json({ user: await publicUser(id) });
  });

  app.post('/api/users/:id/reset', async (c) => {
    requireCap(c, 'users.manage');
    const id = c.req.param('id');
    const [target] = await sql`select role from users where id = ${id}`;
    if (!target) throw notFound();
    if (target.role === 'owner' && requireUser(c).role !== 'owner') throw forbidden();
    const temp = token(9);
    await sql`update users set password_hash = ${await hashPassword(temp)}, totp_enabled = false, totp_secret = null where id = ${id}`;
    await sql`delete from sessions where user_id = ${id}`;
    await audit(c, 'user.reset', 'user', id);
    return c.json({ temporaryPassword: temp });
  });

  app.delete('/api/users/:id', async (c) => {
    const me = requireCap(c, 'users.manage');
    const id = c.req.param('id');
    if (id === me.id) throw badRequest('Du kannst dein eigenes Konto nicht löschen.');
    const [target] = await sql`select role from users where id = ${id}`;
    if (!target) throw notFound();
    if (target.role === 'owner' && me.role !== 'owner') throw forbidden();
    await sql`delete from users where id = ${id}`;
    await audit(c, 'user.delete', 'user', id);
    return c.json({ ok: true });
  });

}
