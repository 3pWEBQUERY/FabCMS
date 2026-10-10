/** Products running low: from which stock on the shop is warned, and what is below it now. */

export interface StockProduct {
  id: string;
  title: string;
  stock?: number | null;
  /** Own limit of this product; empty = the shop's. */
  stockAlert?: number | null;
  variants?: { name: string; stock?: number | null }[];
}

export interface LowStock {
  id: string;
  title: string;
  variant: string | null;
  stock: number;
  limit: number;
}

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The product's own limit, else the shop's; never below 0. */
export const stockLimit = (p: Pick<StockProduct, 'stockAlert'>, fallback: number) => Math.max(0, Math.round(count(p.stockAlert) ?? fallback));

/** Every product or variant at or below its limit, the emptiest first. Unlimited stock (empty) never is. */
export function lowStock(products: StockProduct[], fallback: number): LowStock[] {
  const out: LowStock[] = [];
  for (const p of products) {
    const limit = stockLimit(p, fallback);
    const variants = p.variants ?? [];
    if (variants.length) {
      for (const v of variants) {
        const n = count(v.stock);
        if (n !== null && n <= limit) out.push({ id: p.id, title: p.title, variant: v.name, stock: n, limit });
      }
    } else {
      const n = count(p.stock);
      if (n !== null && n <= limit) out.push({ id: p.id, title: p.title, variant: null, stock: n, limit });
    }
  }
  return out.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title));
}

/** An order took the stock across the limit just now – the moment to warn, once. */
export const crossedLimit = (before: number, after: number, limit: number) => before > limit && after <= limit;
