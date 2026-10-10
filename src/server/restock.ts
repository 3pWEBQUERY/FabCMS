import { sql } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { getCollection } from './content';
import { sendMail } from './mail';
import { inStoredLang, storedLang } from './translations';
import { entryPath } from '../shared/paths';
import { T } from '../site/i18n';
import type { EntryData } from '../shared/types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Variant = { name: string; stock?: number | null };

/** Is the product – or this variant of it – sold out right now? */
export function soldOut(d: EntryData, variant: number | null): boolean {
  const variants = (d.variants as Variant[] | undefined) ?? [];
  if (variant !== null) return variants[variant]?.stock === 0;
  return variants.length ? variants.every((v) => v.stock === 0) : d.stock === 0;
}

/** Someone wants to know when it is back. Only for what is sold out; the same address once per product and variant. */
export async function addRestockAlert(productId: string, email: string, variant: number | null): Promise<boolean> {
  const mail = email.trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(mail)) return false;
  const [p] = await sql`select published_data from entries where id = ${productId} and collection = 'products' and status = 'published'`;
  if (!p || !soldOut(p.published_data as EntryData, variant)) return false;
  await sql`insert into restock_alerts (product_id, variant, email, lang) values (${productId}, ${variant}, ${mail}, ${storedLang()}) on conflict do nothing`;
  return true;
}

/** Sends the mails for everything that is back in stock and forgets those addresses. */
export async function sendRestockMails(): Promise<number> {
  const s = await getSettings();
  if (!s.modules.includes('shop')) return 0;
  const waiting = await sql`
    select a.id, a.variant, a.email, a.lang, e.id as product_id, e.slug, e.published_data as data
    from restock_alerts a join entries e on e.id = a.product_id and e.status = 'published'
    order by a.created_at limit 500`;
  const back = waiting.filter((w) => !soldOut(w.data as EntryData, w.variant as number | null));
  if (!back.length) return 0;
  // Gone from the list first, so a slow mail server can't send twice.
  await sql`delete from restock_alerts where id = any(${back.map((w) => w.id as string)}::uuid[])`;
  const col = await getCollection('products');
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  for (const w of back) {
    const d = w.data as EntryData;
    const variant = w.variant !== null ? ((d.variants as Variant[] | undefined) ?? [])[w.variant as number]?.name : null;
    const what = variant ? `${d.title} (${variant})` : d.title;
    const url = `${base}${entryPath(col, w.slug as string) ?? '/'}`;
    await inStoredLang(w.lang as string, () =>
      sendMail({
        to: w.email as string,
        subject: T('Wieder da: {what}', { what }),
        text: [
          T('Hallo'),
          '',
          T('Du wolltest wissen, wann es wieder da ist: {what} ist ab sofort wieder erhältlich.', { what }),
          '',
          T('Zum Produkt: {url}', { url }),
          '',
          T('Wir haben dir diese eine Nachricht geschickt, weil du darum gebeten hast. Deine Adresse haben wir danach gelöscht.'),
          '',
          s.name,
        ].join('\n'),
        replyTo: s.business.email || undefined,
        kind: 'restock',
        vars: { product: what },
      }),
    ).catch((e) => console.error('[wieder da]', e));
  }
  return back.length;
}

/** How many wait for each product. */
export async function restockWaiting(): Promise<Map<string, number>> {
  const rows = await sql`select product_id, count(*)::int as n from restock_alerts group by product_id`;
  return new Map(rows.map((r) => [r.product_id as string, r.n as number]));
}

/** Nobody waits for ever: a year without the product coming back is enough. */
export async function cleanRestockAlerts(): Promise<void> {
  await sql`delete from restock_alerts where created_at < now() - interval '1 year'`;
}
