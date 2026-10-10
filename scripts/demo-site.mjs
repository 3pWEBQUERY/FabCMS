#!/usr/bin/env node
/**
 * Sets up a fresh Nova with a demo site – the way a person would through the
 * setup assistant – and prints the addresses worth measuring, one per line.
 * Used by the Lighthouse job in CI; handy for screenshots too.
 *
 *   node scripts/demo-site.mjs --url http://localhost:3000 --code 123-456 --sector restaurant --theme bistro
 */
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    code: { type: 'string', default: process.env.NOVA_SETUP_CODE ?? '' },
    sector: { type: 'string', default: 'restaurant' },
    theme: { type: 'string' },
    max: { type: 'string', default: '6' },
  },
});
const base = o.url.replace(/\/$/, '');
let cookie = '';

async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'X-Nova': '1', 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...new Map([...cookie.split('; ').filter(Boolean), ...set.map((c) => c.split(';')[0])].map((c) => [c.split('=')[0], c])).values()].join('; ');
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${data?.error ?? ''}`);
  return data;
}

await call('POST', '/api/setup', { code: o.code, name: 'Demo', email: 'demo@example.ch', password: 'Demo-Passwort-123' });
const { themes } = await call('POST', '/api/onboarding/seed', { sectors: [o.sector], name: 'Demo' });
await call('POST', '/api/onboarding/finish', { theme: o.theme ?? themes[0], mode: 'studio' });
await call('POST', '/api/site/launch');

// Home, the pages and lists, and one detail page per collection – from the sitemap.
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, base));
const seen = new Set();
const pick = [`${base}/`];
for (const u of urls) {
  const path = new URL(u).pathname;
  const kind = path === '/' ? '' : path.split('/').filter(Boolean).length > 1 ? `detail:${path.split('/')[1]}` : `page:${path}`;
  if (!kind || seen.has(kind) || pick.includes(u)) continue;
  seen.add(kind);
  pick.push(u);
}
console.log(pick.slice(0, Number(o.max)).join('\n'));
