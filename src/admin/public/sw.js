/*
 * Nova admin offline support. Registered with scope "/" (the canvas lives
 * under /_nova/), but it only answers requests the admin needs; everything
 * else – the public website above all – goes to the network untouched.
 *
 * - Admin app (hashed assets): cache first.
 * - Admin pages, canvas, reads of the admin API: network first, the last
 *   good answer when offline.
 * - Images and fonts the canvas shows: cache first.
 * Writes are never cached; edits made offline live in the shared document
 * (IndexedDB) and are merged when the connection is back.
 */
const VERSION = 'nova-admin-v1';
const APP = `${VERSION}-app`;
const DATA = `${VERSION}-data`;

const READS = [
  /^\/api\/(session|settings|collections|me|users|notifications|media|forms)(\/|$|\?)/,
  /^\/api\/entries(\/|\?|$)/,
  /^\/_nova\/canvas\//,
  /^\/_nova\/preview\//,
  /^\/_nova\/(site|bridge|fields)\.js/,
];
const ASSETS = [/^\/admin\/assets\//, /^\/_nova\/fonts\//, /^\/media\//, /^\/admin\/(favicon\.svg|manifest\.webmanifest)$/];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// Logging out removes everything this browser kept.
self.addEventListener('message', (e) => {
  if (e.data === 'nova:clear') e.waitUntil(Promise.all([caches.delete(APP), caches.delete(DATA)]));
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') await cache.put(fallbackUrl ?? req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(fallbackUrl ?? req);
    if (hit) return hit;
    return new Response(JSON.stringify({ error: 'Keine Verbindung zum Server. Deine Änderungen bleiben hier, bis die Verbindung zurück ist.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(APP);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  // The admin app: one index.html for every route.
  if (req.mode === 'navigate' && (p === '/admin' || p.startsWith('/admin/'))) return e.respondWith(networkFirst(req, APP, '/admin/'));
  if (p === '/api/notifications/stream' || p.startsWith('/api/collab/')) return;
  if (ASSETS.some((r) => r.test(p))) return e.respondWith(cacheFirst(req));
  if (READS.some((r) => r.test(p + url.search))) return e.respondWith(networkFirst(req, DATA));
});
