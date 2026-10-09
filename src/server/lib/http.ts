import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { env } from '../env';

export function clientIp(c: Context): string {
  if (env.trustProxy) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    const real = c.req.header('x-real-ip');
    if (real) return real;
  }
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Nicht gefunden.') => new HttpError(404, what);
export const forbidden = (what = 'Dafür fehlt dir die Berechtigung.') => new HttpError(403, what);
export const badRequest = (what: string, details?: unknown) => new HttpError(400, what, details);

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(';'))].join('\r\n');
}
