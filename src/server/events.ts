import { createHmac } from 'node:crypto';
import { getSettings } from './settings';
import { env } from './env';
import { sql } from './db';
import { notFound } from './lib/http';
import type { Webhook } from '../shared/types';

export type NovaEvent =
  | 'entry.created'
  | 'entry.updated'
  | 'entry.published'
  | 'entry.unpublished'
  | 'entry.deleted'
  | 'entry.restored'
  | 'form.submitted'
  | 'lead.created'
  | 'order.created'
  | 'order.paid'
  | 'comment.created';

export const EVENT_LABELS: Record<NovaEvent, string> = {
  'entry.created': 'Inhalt angelegt',
  'entry.updated': 'Inhalt geändert',
  'entry.published': 'Inhalt veröffentlicht',
  'entry.unpublished': 'Inhalt offline genommen',
  'entry.deleted': 'Inhalt gelöscht',
  'entry.restored': 'Inhalt wiederhergestellt',
  'form.submitted': 'Formular gesendet',
  'lead.created': 'Neuer Kontakt',
  'order.created': 'Bestellung eingegangen',
  'order.paid': 'Bestellung bezahlt',
  'comment.created': 'Neuer Kommentar',
};

/** Retries after a failure: half a minute, then two minutes. */
const RETRY_MS = [30_000, 120_000];
/** At most this many deliveries at once – a large import doesn't flood the receiver. */
const PARALLEL = 4;
const queue: (() => Promise<void>)[] = [];
let running = 0;
let idleWaiters: (() => void)[] = [];

function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}
function pump() {
  while (running < PARALLEL && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
      if (!running && !queue.length) {
        idleWaiters.forEach((f) => f());
        idleWaiters = [];
      }
    });
  }
}
/** Resolves once every queued delivery has had its attempt (tests, shutdown). */
export const deliveriesIdle = () => (!running && !queue.length ? Promise.resolve() : new Promise<void>((r) => idleWaiters.push(r)));

export interface DeliveryResult {
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
}

/** One attempt: signed POST, answer and time written to the log. Server errors and timeouts are tried again. */
async function attempt(id: string, hook: Webhook, event: string, body: string, retry: boolean): Promise<DeliveryResult> {
  const signature = createHmac('sha256', hook.secret).update(body).digest('hex');
  const started = Date.now();
  let result: DeliveryResult;
  try {
    const r = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Nova-Webhook/1',
        'X-Nova-Signature': `sha256=${signature}`,
        'X-Nova-Event': event,
        // The same id on every attempt: receivers can drop what they already have.
        'X-Nova-Delivery': id,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    result = { ok: r.ok, status: r.status, ms: Date.now() - started, error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const error = err.name === 'TimeoutError' ? 'Keine Antwort in 10 Sekunden.' : `Nicht erreichbar (${err.cause?.code ?? err.message.slice(0, 120)}).`;
    result = { ok: false, status: 0, ms: Date.now() - started, error };
  }
  const [row] = await sql`
    update webhook_deliveries set ok = ${result.ok}, status = ${result.status || null}, error = ${result.error ?? null}, ms = ${result.ms},
      attempts = attempts + 1, finished_at = now()
    where id = ${id} returning attempts`;
  const tries = Number(row?.attempts ?? 1);
  if (retry && !result.ok && (result.status === 0 || result.status >= 500) && tries <= RETRY_MS.length)
    setTimeout(() => enqueue(() => attempt(id, hook, event, body, true).then(() => {})), RETRY_MS[tries - 1]).unref();
  return result;
}

/** Logs a delivery and sends it – queued, or right now for «Test senden» and «Erneut senden». */
export async function deliver(hook: Webhook, event: string, data: Record<string, unknown>, now = false): Promise<DeliveryResult | null> {
  const body = JSON.stringify({ event, site: env.publicUrl, at: new Date().toISOString(), data });
  const [row] = await sql`insert into webhook_deliveries (hook_id, event, url, body) values (${hook.id}, ${event}, ${hook.url}, ${body}) returning id`;
  if (now) return attempt(row.id as string, hook, event, body, false);
  enqueue(() => attempt(row.id as string, hook, event, body, true).then(() => {}));
  return null;
}

/** Sends a logged delivery once more, with the same body and id. */
export async function redeliver(id: string): Promise<DeliveryResult> {
  const [d] = await sql`select id, hook_id, event, body from webhook_deliveries where id = ${id}`;
  if (!d) throw notFound('Diese Zustellung gibt es nicht mehr.');
  const hook = (await getSettings()).webhooks.find((w) => w.id === d.hook_id);
  if (!hook) throw notFound('Diesen Webhook gibt es nicht mehr.');
  return attempt(d.id as string, hook, d.event as string, d.body as string, false);
}

/** Fire-and-forget delivery to every webhook subscribed to the event (Zapier, Make, own code). Content events can be limited to some types. */
export function emit(event: NovaEvent, data: Record<string, unknown>): void {
  void (async () => {
    const settings = await getSettings();
    for (const h of settings.webhooks) {
      if (!h.active || !h.events.includes(event)) continue;
      if (event.startsWith('entry.') && h.collections?.length && !h.collections.includes(String(data.collection))) continue;
      await deliver(h, event, data);
    }
  })().catch((e) => console.warn('[webhook]', (e as Error).message));
}

/**
 * While someone writes, Nova saves every few seconds; «entry.updated» goes out
 * once an entry has rested this long, with how it looks then.
 */
const SETTLE_MS = 60_000;
const settling = new Map<string, { timer: NodeJS.Timeout; load: () => Promise<Record<string, unknown> | null> }>();

export function emitSettled(id: string, load: () => Promise<Record<string, unknown> | null>): void {
  clearTimeout(settling.get(id)?.timer);
  const fire = () => {
    settling.delete(id);
    void load()
      .then((data) => data && emit('entry.updated', data))
      .catch(() => {});
  };
  settling.set(id, { timer: setTimeout(fire, SETTLE_MS).unref(), load });
}
/** A deleted entry sends no late «updated». */
export function cancelSettled(id: string): void {
  clearTimeout(settling.get(id)?.timer);
  settling.delete(id);
}
/** Sends every waiting «updated» at once (tests, shutdown). */
export async function settleNow(): Promise<void> {
  const waiting = [...settling.entries()];
  settling.clear();
  for (const [, w] of waiting) {
    clearTimeout(w.timer);
    const data = await w.load().catch(() => null);
    if (data) emit('entry.updated', data);
  }
}

/** Tells Bing, Yandex, Seznam & co. via IndexNow that URLs changed. */
export function pingIndexNow(paths: string[]): void {
  void (async () => {
    const s = await getSettings();
    if (!s.seo.indexNow || s.seo.noindex || !env.production) return;
    const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
    const host = new URL(base).hostname;
    if (host === 'localhost' || host.endsWith('.up.railway.app')) return;
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: s.seo.indexNowKey, keyLocation: `${base}/${s.seo.indexNowKey}.txt`, urlList: paths.map((p) => base + p) }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  })();
}
