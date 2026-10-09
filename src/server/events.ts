import { createHmac } from 'node:crypto';
import { getSettings } from './settings';
import { env } from './env';

export type NovaEvent =
  | 'entry.published'
  | 'entry.unpublished'
  | 'form.submitted'
  | 'lead.created'
  | 'order.created'
  | 'order.paid'
  | 'comment.created';

export const EVENT_LABELS: Record<NovaEvent, string> = {
  'entry.published': 'Inhalt veröffentlicht',
  'entry.unpublished': 'Inhalt offline genommen',
  'form.submitted': 'Formular gesendet',
  'lead.created': 'Neuer Kontakt',
  'order.created': 'Bestellung eingegangen',
  'order.paid': 'Bestellung bezahlt',
  'comment.created': 'Neuer Kommentar',
};

async function deliver(url: string, secret: string, body: string, attempt = 1): Promise<void> {
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nova-Signature': `sha256=${signature}`, 'User-Agent': 'Nova-Webhook/1' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok && r.status >= 500) throw new Error(String(r.status));
  } catch (e) {
    if (attempt < 3) setTimeout(() => void deliver(url, secret, body, attempt + 1), attempt * 30_000).unref();
    else console.warn(`[webhook] ${url} nach 3 Versuchen nicht erreichbar: ${(e as Error).message}`);
  }
}

/** Fire-and-forget delivery to every webhook subscribed to the event (Zapier, Make, own code). */
export function emit(event: NovaEvent, data: Record<string, unknown>): void {
  void (async () => {
    const settings = await getSettings();
    const body = JSON.stringify({ event, site: env.publicUrl, at: new Date().toISOString(), data });
    for (const h of settings.webhooks.filter((w) => w.active && w.events.includes(event))) void deliver(h.url, h.secret, body);
  })();
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
