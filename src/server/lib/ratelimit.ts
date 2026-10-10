/**
 * Sliding-window rate limiter kept in memory. Nova runs as a single service
 * on Railway, so this is enough; with several replicas each one limits on
 * its own, which still bounds abuse.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, hits] of buckets) if (hits.every((t) => now - t > 3_600_000)) buckets.delete(k);
}, 600_000).unref();

/** Forget all hits – for tests that sign in many people from one address. */
export function resetRateLimits(): void {
  buckets.clear();
}
