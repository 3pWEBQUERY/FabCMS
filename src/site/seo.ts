import type { RenderContext, Crumb } from './context';
import type { CollectionDef, EntryData, MediaItem } from '../shared/types';
import { blocksText } from '../shared/blocks';
import { entryAccess } from '../shared/members';
import { excerpt, stripHtml } from '../shared/text';
import { schemaOpeningHours } from '../shared/hours';
import { variantUrl } from './picture';
import { entryPath } from '../shared/paths';
import { summarize, type Review } from '../shared/reviews';
import { t } from './i18n';

export interface PageMeta {
  title: string;
  /** Title without the site suffix (for og:title). */
  plainTitle: string;
  description: string;
  canonical: string;
  image: string | null;
  type: 'website' | 'article' | 'product';
  noindex: boolean;
  publishedAt?: string | null;
  modifiedAt?: string | null;
}

export function formatTitle(ctx: RenderContext, title: string, isHome: boolean): string {
  const s = ctx.settings;
  if (isHome) return s.tagline ? `${s.name} – ${s.tagline}` : s.name;
  return (s.seo.titleTemplate || '%s · %site').replace('%s', title).replace('%site', s.name);
}

/** Description: explicit SEO text → excerpt field → first words of the content → site default. */
export function describe(data: EntryData, ctx: RenderContext): string {
  const explicit = data.seo?.description?.trim();
  if (explicit) return explicit;
  for (const k of ['excerpt', 'summary', 'intro', 'description']) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return excerpt(stripHtml(v));
  }
  const text = entryAccess(data) === 'public' ? blocksText(data.blocks) : '';
  if (text) return excerpt(text);
  return ctx.settings.seo.defaultDescription || ctx.settings.tagline || '';
}

export async function pageImage(data: EntryData, ctx: RenderContext, entryId: string | null, version: number): Promise<string | null> {
  const candidates = [data.seo?.image, data.cover, (data.images as string[] | undefined)?.[0], ctx.settings.seo.defaultImage];
  for (const id of candidates) {
    const m = await ctx.media(id);
    if (m && m.mime.startsWith('image/')) return ctx.base + variantUrl(m, 1280, 'jpg');
  }
  // Generated social image: title on brand colours.
  return `${ctx.base}/_nova/og/${entryId ?? 'site'}.png?v=${version}`;
}

export function organizationLd(ctx: RenderContext, logo: MediaItem | null): Record<string, unknown> {
  const s = ctx.settings;
  const b = s.business;
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': b.type || 'Organization',
    '@id': `${ctx.base}/#org`,
    name: b.legalName || s.name,
    url: ctx.base + '/',
  };
  if (logo) {
    ld.logo = ctx.base + variantUrl(logo, 480, 'jpg');
    ld.image = ld.logo;
  }
  if (b.street || b.city)
    ld.address = { '@type': 'PostalAddress', streetAddress: b.street, postalCode: b.zip, addressLocality: b.city, addressCountry: b.country };
  if (b.phone) ld.telephone = b.phone;
  if (b.email) ld.email = b.email;
  if (b.lat && b.lng) ld.geo = { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng };
  if (b.type !== 'Organization' && b.type !== 'NGO' && s.hours.length) ld.openingHoursSpecification = schemaOpeningHours(s.hours);
  if (b.priceRange) ld.priceRange = b.priceRange;
  if (b.servesCuisine) ld.servesCuisine = b.servesCuisine;
  // Tells search engines that tables can be booked on this site.
  if (ctx.settings.modules.includes('booking') && ['Restaurant', 'CafeOrCoffeeShop', 'BarOrPub'].includes(b.type)) ld.acceptsReservations = true;
  if (s.modules.includes('menu')) ld.hasMenu = `${ctx.base}/karte`;
  if (s.social.length) ld.sameAs = s.social.map((x) => x.href);
  return ld;
}

export function websiteLd(ctx: RenderContext): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ctx.settings.name,
    url: ctx.base + '/',
    inLanguage: ctx.settings.locale,
    potentialAction: { '@type': 'SearchAction', target: `${ctx.base}/suche?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };
}

export function breadcrumbLd(ctx: RenderContext, crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: ctx.base + c.href })),
  };
}

export function articleLd(ctx: RenderContext, c: CollectionDef, e: { slug: string; data: EntryData; published_at: string | null; updated_at: string; author_name: string | null }, image: string | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: e.data.title,
    description: describe(e.data, ctx),
    mainEntityOfPage: ctx.base + (entryPath(c, e.slug) ?? '/'),
    datePublished: (e.data.date as string) || e.published_at,
    dateModified: e.updated_at,
    image: image ? [image] : undefined,
    author: { '@type': 'Person', name: e.author_name || ctx.settings.name },
    publisher: { '@id': `${ctx.base}/#org` },
  };
}

export function productLd(ctx: RenderContext, c: CollectionDef, e: { slug: string; data: EntryData }, images: string[], reviews: Review[] = []) {
  const d = e.data;
  const variants = (d.variants as { name: string; price?: number; stock?: number | null; sku?: string }[]) ?? [];
  const url = ctx.base + (entryPath(c, e.slug) ?? '/');
  const sum = summarize(reviews);
  const offer = (price: number, stock: number | null | undefined, sku?: string, name?: string) => ({
    '@type': 'Offer',
    price: (price / 100).toFixed(2),
    priceCurrency: ctx.settings.shop.currency,
    availability: stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    url,
    sku: sku || undefined,
    name,
    seller: { '@id': `${ctx.base}/#org` },
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.title,
    description: describe(d, ctx),
    image: images,
    sku: (d.sku as string) || undefined,
    category: (d.category as string) || undefined,
    offers: variants.length
      ? variants.map((v) => offer(v.price ?? (d.price as number), v.stock, v.sku, v.name))
      : offer(d.price as number, d.stock as number | null, d.sku as string),
    // The site's own customers' stars, as Google reads them; the newest few in full.
    aggregateRating: sum.count ? { '@type': 'AggregateRating', ratingValue: sum.average, reviewCount: sum.count, bestRating: 5, worstRating: 1 } : undefined,
    review: sum.count
      ? reviews.slice(0, 5).map((r) => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: r.name },
          datePublished: new Date(r.created_at).toISOString().slice(0, 10),
          reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
          reviewBody: r.body || undefined,
        }))
      : undefined,
  };
}

export function menuLd(ctx: RenderContext, dishes: { data: EntryData }[]) {
  const sections = new Map<string, unknown[]>();
  for (const d of dishes) {
    const cat = String(d.data.category || t(ctx, 'Weiteres'));
    const prices = (d.data.prices as { label?: string; price: number }[]) ?? [];
    const tags = (d.data.tags as string[]) ?? [];
    const item = {
      '@type': 'MenuItem',
      name: d.data.title,
      description: (d.data.description as string) || undefined,
      offers: prices.map((p) => ({ '@type': 'Offer', price: (p.price / 100).toFixed(2), priceCurrency: ctx.settings.shop.currency, name: p.label || undefined })),
      suitableForDiet: [
        ...(tags.includes('vegan') ? ['https://schema.org/VeganDiet'] : []),
        ...(tags.includes('vegetarian') ? ['https://schema.org/VegetarianDiet'] : []),
      ],
    };
    if (!sections.has(cat)) sections.set(cat, []);
    sections.get(cat)!.push(item);
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: t(ctx, 'Karte – {site}', { site: ctx.settings.name }),
    inLanguage: ctx.settings.locale,
    hasMenuSection: [...sections].map(([name, items]) => ({ '@type': 'MenuSection', name, hasMenuItem: items })),
  };
}

/** JSON inside <script>: escape "<" so content can never close the tag. */
export const ldScript = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
