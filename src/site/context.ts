import { sql } from '../server/db';
import type { MemberLevel } from '../shared/members';
import type { CollectionDef, MediaItem, SiteSettings } from '../shared/types';
import type { Theme } from './themes';
import type { Lang } from '../shared/i18n';

export interface Crumb {
  label: string;
  href: string;
}

export interface RenderContext {
  /** Level for item headings (cards, menu sections): 2 under the page title, 3 under a section heading. */
  hl?: number;
  settings: SiteSettings;
  theme: Theme;
  collections: CollectionDef[];
  path: string;
  /** Absolute base URL without trailing slash. */
  base: string;
  /** In-canvas editing: adds data attributes and disables lazy behaviour. */
  edit: boolean;
  /** Preview of drafts (edit or "Vorschau"). */
  preview: boolean;
  now: Date;
  query: URLSearchParams;
  jsonLd: Record<string, unknown>[];
  /** True once an H1 was rendered. */
  h1: boolean;
  /** Index of the block currently rendered (0 = first). */
  blockIndex: number;
  /** Running number of block headings (Kante shows «01», «02» …). */
  sectionNo: number;
  /** Nesting depth for reusable sections. */
  depth: number;
  /** Lazy media loader with per-request cache. */
  media: (id: unknown) => Promise<MediaItem | null>;
  preloadMedia: (ids: unknown[]) => Promise<void>;
  /** Image to preload for LCP. */
  lcpImage: string | null;
  needs: Set<'lightbox' | 'consent' | 'cart' | 'form' | 'filter' | 'turnstile' | 'compare' | 'age' | 'motion' | 'widgets'>;
  /** Signed age gate already passed. */
  ageOk: boolean;
  /** The age gate asks for the Swiss e-ID (and the page withholds its content until then). */
  ageEid: boolean;
  cartCount: number;
  csrf: string;
  /** Signed-in member of the website (Mitgliederbereich), if any. */
  member: { id: string; name: string; level: MemberLevel } | null;
  /** Language of this page; the main language unless the visitor is under /fr/ etc. */
  lang: Lang;
  /** Main language of the site. */
  mainLang: Lang;
  /** This page in every switched-on language (main-language path in ctx.path). */
  alternates: { lang: Lang; path: string; translated: boolean }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mediaLoader() {
  const cache = new Map<string, MediaItem | null>();
  const preload = async (ids: unknown[]) => {
    const want = [...new Set(ids.filter((x): x is string => typeof x === 'string' && UUID.test(x) && !cache.has(x)))];
    if (!want.length) return;
    const rows = await sql`select * from media where id = any(${want}::uuid[])`;
    for (const id of want) cache.set(id, null);
    for (const r of rows) cache.set(r.id as string, r as unknown as MediaItem);
  };
  const get = async (id: unknown) => {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (!cache.has(id)) await preload([id]);
    return cache.get(id) ?? null;
  };
  return { get, preload };
}
