import { env } from './env';
import type { SiteSettings } from '../shared/types';

/**
 * Age verification with the Swiss e-ID (swiyu). Nova talks to an own
 * instance of the federal «swiyu Generic Verifier» – it speaks OID4VP with the
 * wallet, checks signature, issuer and revocation status. Nova only creates the
 * request, shows the QR code and reads the answer.
 *
 * Data minimisation: for 16 and 18 the wallet only discloses «age_over_16» /
 * «age_over_18» (true or false), never name or birth date. Other limits need
 * the birth date; it is compared once and not stored.
 */

export class EidError extends Error {}

export const eidConfigured = () => Boolean(env.eid.verifierUrl && env.eid.issuers.length && env.eid.vct.length);

/** The gate really checks the e-ID only when the owner chose it and the verifier is set up. */
export const eidGate = (s: SiteSettings) => s.ageGate.enabled && s.ageGate.method === 'eid' && eidConfigured();

/** The e-ID carries «age_over_16» and «age_over_18»; any other limit needs the birth date. */
export const ageClaim = (minAge: number) => (minAge === 16 || minAge === 18 ? `age_over_${minAge}` : 'birth_date');

/** Request body for POST /management/api/verifications (DCQL, OID4VP 1.0). */
export function verificationRequest(minAge: number) {
  const claim = ageClaim(minAge);
  return {
    accepted_issuer_dids: env.eid.issuers,
    jwt_secured_authorization_request: true,
    // swiyu wallets only answer encrypted.
    response_mode: 'direct_post.jwt',
    dcql_query: {
      credentials: [
        {
          id: 'age',
          format: 'dc+sd-jwt',
          meta: { vct_values: env.eid.vct },
          claims: [claim === 'birth_date' ? { path: [claim] } : { path: [claim], values: [true] }],
          require_cryptographic_holder_binding: true,
        },
      ],
    },
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.eid.verifierUrl}/management/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(env.eid.token ? { Authorization: `Bearer ${env.eid.token}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EidError('Der E-ID-Verifier ist nicht erreichbar.');
  }
  if (!res.ok) throw new EidError(`Der E-ID-Verifier antwortet mit ${res.status}.`);
  return (await res.json()) as T;
}

export async function startAgeCheck(minAge: number): Promise<{ id: string; deeplink: string }> {
  const r = await call<{ id?: string; verification_deeplink?: string; verification_url?: string }>('/verifications', {
    method: 'POST',
    body: JSON.stringify(verificationRequest(minAge)),
  });
  const deeplink = r.verification_deeplink ?? '';
  if (!r.id || !/^[\w-]{8,64}$/.test(r.id) || !deeplink) throw new EidError('Der E-ID-Verifier hat keine Anfrage erstellt.');
  return { id: r.id, deeplink };
}

export type AgeResult = 'pending' | 'ok' | 'young' | 'failed';

/** Completed years between a birth date (YYYY-MM-DD) and today in Swiss time. */
export function yearsSince(birth: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  return y - Number(m[1]) - (mo * 100 + d < Number(m[2]) * 100 + Number(m[3]) ? 1 : 0);
}

/** Judges the disclosed claims. Only an explicit «true» (or a birth date old enough) counts. */
export function judgeAge(subjectData: unknown, minAge: number, now = new Date()): 'ok' | 'young' {
  const entry = (subjectData as Record<string, unknown> | undefined)?.age;
  const claims = (Array.isArray(entry) ? entry[0] : entry) as Record<string, unknown> | undefined;
  if (!claims || typeof claims !== 'object')
    throw new EidError('Der E-ID-Verifier gibt die bestätigten Angaben nicht heraus. Setz dort ADDITIONAL_AUDIT_INFORMATION_CREDENTIAL_SUBJECT_DATA_ENABLED=true.');
  const claim = ageClaim(minAge);
  if (claim !== 'birth_date') return claims[claim] === true ? 'ok' : 'young';
  const years = typeof claims.birth_date === 'string' ? yearsSince(claims.birth_date, now) : null;
  if (years === null) throw new EidError('Die E-ID enthält kein lesbares Geburtsdatum.');
  return years >= minAge ? 'ok' : 'young';
}

export async function ageCheckResult(id: string, minAge: number): Promise<AgeResult> {
  const r = await call<{ state?: string; wallet_response?: { credential_subject_data?: unknown } }>(`/verifications/${encodeURIComponent(id)}`);
  if (r.state === 'PENDING') return 'pending';
  if (r.state !== 'SUCCESS') return 'failed';
  return judgeAge(r.wallet_response?.credential_subject_data, minAge);
}

/**
 * Value of the age cookie: «1» after a self-declaration, «v18» after an
 * e-ID check for 18. With the e-ID gate only a check for at least the
 * current limit counts.
 */
export function ageAccepted(cookie: string | null | undefined, s: SiteSettings): boolean {
  if (!cookie) return false;
  const verified = /^v(\d{2})$/.exec(cookie);
  if (verified) return Number(verified[1]) >= s.ageGate.minAge;
  return cookie === '1' && !eidGate(s);
}
