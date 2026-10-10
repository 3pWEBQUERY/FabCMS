import { sql } from './db';
import { env } from './env';
import { getSettings } from './settings';
import { notify } from './notify';
import { sendMail } from './mail';
import { crossedLimit, lowStock, stockLimit, type LowStock } from '../shared/stock';
import type { QuoteLine } from './shop';

/** What is low right now, from the published products. */
export async function lowStockList(): Promise<LowStock[]> {
  const s = await getSettings();
  if (!s.modules.includes('shop')) return [];
  const rows = await sql`
    select id, published_data ->> 'title' as title, published_data -> 'stock' as stock, published_data -> 'stockAlert' as "stockAlert", published_data -> 'variants' as variants
    from entries where collection = 'products' and status = 'published' and published_data is not null`;
  return lowStock(
    rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      stock: r.stock as number | null,
      stockAlert: r.stockAlert as number | null,
      variants: (r.variants as never) ?? [],
    })),
    s.shop.lowStock.threshold,
  );
}

/**
 * After an order: each line that took its product across the limit is told
 * once – in the bell, and by mail when that is on.
 */
export async function stockAfterOrder(lines: QuoteLine[]): Promise<void> {
  const s = await getSettings();
  const ids = [...new Set(lines.filter((l) => l.available !== null).map((l) => l.productId))];
  if (!ids.length) return;
  const own = new Map((await sql`select id, published_data -> 'stockAlert' as a from entries where id = any(${ids}::uuid[])`).map((r) => [r.id as string, r.a as number | null]));
  const low: { what: string; left: number; id: string }[] = [];
  for (const l of lines) {
    if (l.available === null) continue;
    const left = Math.max(0, l.available - l.qty);
    if (!crossedLimit(l.available, left, stockLimit({ stockAlert: own.get(l.productId) }, s.shop.lowStock.threshold))) continue;
    const what = `${l.title}${l.variantName ? ` (${l.variantName})` : ''}`;
    low.push({ what, left, id: l.productId });
    await notify({
      kind: 'stock',
      cap: 'orders.view',
      title: left === 0 ? `Ausverkauft: ${what}` : `Nur noch ${left} an Lager: ${what}`,
      body: 'Bestand im Produkt anpassen, sobald Nachschub da ist.',
      href: `/inhalte/products/${l.productId}`,
    });
  }
  const to = s.shop.notifyEmail || s.business.email;
  if (!low.length || !s.shop.lowStock.email || !to) return;
  const base = (s.baseUrl || env.publicUrl).replace(/\/$/, '');
  await sendMail({
    to,
    subject: low.length === 1 ? `Wenig an Lager: ${low[0].what}` : `Wenig an Lager: ${low.length} Produkte`,
    text: [
      'Nach der letzten Bestellung ist der Bestand unter die Warngrenze gefallen:',
      '',
      ...low.map((x) => `${x.what}: ${x.left === 0 ? 'ausverkauft' : `noch ${x.left}`}`),
      '',
      `Bestand anpassen: ${base}/admin/inhalte/products/${low[0].id}`,
      '',
      s.name,
    ].join('\n'),
  });
}
