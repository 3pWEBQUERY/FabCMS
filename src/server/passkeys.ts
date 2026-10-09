import type { Context } from 'hono';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { sql } from './db';
import { getSettings } from './settings';
import { token } from './lib/crypto';
import { badRequest, HttpError } from './lib/http';

/**
 * Passkeys for the admin (WebAuthn, via SimpleWebAuthn). The relying party is
 * the host the admin is opened on, so passkeys work on the Railway domain and
 * on an own domain alike – each is its own passkey, as browsers require.
 */

const challenges = new Map<string, { challenge: string; expires: number }>();
const TTL = 5 * 60_000;

function remember(key: string, challenge: string) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
  challenges.set(key, { challenge, expires: now + TTL });
}

function take(key: string): string {
  const c = challenges.get(key);
  challenges.delete(key);
  if (!c || c.expires < Date.now()) throw badRequest('Das hat zu lange gedauert. Bitte nochmals versuchen.');
  return c.challenge;
}

/** Origin and RP ID of this request, as the browser sees them. */
function party(c: Context): { rpID: string; origin: string } {
  const host = (c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost').split(',')[0].trim();
  const proto = (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')).split(',')[0].trim();
  return { rpID: host.replace(/:\d+$/, ''), origin: `${proto}://${host}` };
}

export async function registrationOptions(c: Context, user: { id: string; email: string; name: string; session_id: string }) {
  const s = await getSettings();
  const { rpID } = party(c);
  const existing = await sql`select id, transports from passkeys where user_id = ${user.id}`;
  const options = await generateRegistrationOptions({
    rpName: s.name || 'Nova',
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id as string, transports: p.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  remember(`reg:${user.session_id}`, options.challenge);
  return options;
}

export async function registerPasskey(c: Context, user: { id: string; session_id: string }, response: RegistrationResponseJSON, name: string) {
  const { rpID, origin } = party(c);
  const expectedChallenge = take(`reg:${user.session_id}`);
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch (e) {
    throw badRequest(`Der Passkey konnte nicht geprüft werden: ${(e as Error).message}`);
  }
  if (!v.verified || !v.registrationInfo) throw badRequest('Der Passkey konnte nicht geprüft werden.');
  const { credential, credentialBackedUp } = v.registrationInfo;
  await sql`
    insert into passkeys (id, user_id, public_key, counter, transports, name, backed_up)
    values (${credential.id}, ${user.id}, ${Buffer.from(credential.publicKey)}, ${credential.counter}, ${credential.transports ?? []}, ${name.trim().slice(0, 60) || 'Passkey'}, ${credentialBackedUp})
    on conflict (id) do nothing`;
}

/** Sign-in options: no user named yet – the browser offers the passkeys it has for this site. */
export async function authenticationOptions(c: Context): Promise<{ key: string; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  const { rpID } = party(c);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: [] });
  const key = token(16);
  remember(`auth:${key}`, options.challenge);
  return { key, options };
}

export async function verifyPasskeyLogin(c: Context, key: string, response: AuthenticationResponseJSON): Promise<{ userId: string; userVerified: boolean }> {
  const { rpID, origin } = party(c);
  const expectedChallenge = take(`auth:${key}`);
  const [pk] = await sql`select * from passkeys where id = ${response.id}`;
  if (!pk) throw new HttpError(401, 'Diesen Passkey kennt Nova nicht (mehr). Melde dich mit dem Passwort an.');
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: pk.id as string,
        publicKey: new Uint8Array(pk.public_key as Buffer),
        counter: Number(pk.counter),
        transports: pk.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: false,
    });
  } catch (e) {
    throw new HttpError(401, `Die Anmeldung mit dem Passkey hat nicht geklappt: ${(e as Error).message}`);
  }
  if (!v.verified) throw new HttpError(401, 'Die Anmeldung mit dem Passkey hat nicht geklappt.');
  await sql`update passkeys set counter = ${v.authenticationInfo.newCounter}, last_used_at = now() where id = ${pk.id}`;
  return { userId: pk.user_id as string, userVerified: v.authenticationInfo.userVerified };
}
