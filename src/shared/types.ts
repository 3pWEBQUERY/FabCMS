import type { FieldDef, LinkValue } from './fields';

export type Mode = 'studio' | 'werkbank';
export type Role = 'owner' | 'admin' | 'editor' | 'author' | 'member';
export type EntryStatus = 'draft' | 'review' | 'scheduled' | 'published';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface BlockStyle {
  tone?: 'default' | 'muted' | 'accent' | 'inverse';
  spacing?: 'none' | 's' | 'm' | 'l';
  /** Per-breakpoint override of the spacing. */
  spacingMobile?: 'none' | 's' | 'm' | 'l';
  hideOn?: Breakpoint[];
  anchor?: string;
  /** Werkbank: extra class names and scoped CSS. */
  className?: string;
  css?: string;
}

/**
 * Schutzzonen: `layout` – text can change but the block can't be moved,
 * removed or restyled. `all` – nothing changes in the Studio.
 */
export type BlockLock = 'none' | 'layout' | 'all';

export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: BlockStyle;
  lock?: BlockLock;
}

export interface SeoMeta {
  title?: string;
  description?: string;
  keyword?: string;
  image?: string;
  noindex?: boolean;
}

export interface EntryData {
  title: string;
  blocks?: Block[];
  seo?: SeoMeta;
  [key: string]: unknown;
}

export interface Entry {
  id: string;
  collection: string;
  slug: string;
  status: EntryStatus;
  data: EntryData;
  published_data: EntryData | null;
  published_slug: string | null;
  publish_at: string | null;
  published_at: string | null;
  author_id: string | null;
  version: number;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionDef {
  id: string;
  /** Plural Studio label: «Beiträge». */
  name: string;
  /** Singular: «Beitrag». */
  singular: string;
  icon: string;
  fields: FieldDef[];
  /** Detail route with :slug, e.g. /blog/:slug. Null → no own page. */
  route: string | null;
  /** Overview route, e.g. /blog. */
  list_route: string | null;
  /** Has a block canvas (pages, posts, projects). */
  has_blocks: boolean;
  builtin: boolean;
  module: string | null;
  /** Field shown as title in lists. */
  title_field: string;
  /** Empty state teaching text. */
  empty_hint?: string;
  sort?: { field: string; dir: 'asc' | 'desc' };
  per_page?: number;
}

export interface OpeningHoursDay {
  day: number; // 1 = Monday … 7 = Sunday
  closed: boolean;
  slots: { from: string; to: string }[];
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  children?: NavItem[];
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

export interface SiteSettings {
  name: string;
  tagline: string;
  /** Sparten chosen in the setup assistant. */
  sectors: string[];
  modules: string[];
  locale: string;
  timezone: string;
  baseUrl: string;
  logo: string | null;
  favicon: string | null;
  business: {
    type: string; // schema.org type, e.g. Restaurant
    legalName: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    uid: string;
    priceRange: string;
    servesCuisine: string;
    /** Geocoded from the address (OpenStreetMap Nominatim) when it changes. */
    lat?: number;
    lng?: number;
  };
  hours: OpeningHoursDay[];
  hoursNote: string;
  social: { label: string; href: string }[];
  theme: {
    id: string;
    palette: string;
    fontPair: string;
    /** 0.8 … 1.3 – multiplier for vertical rhythm. */
    spacing: number;
    radius: number;
    /** Werkbank: raw token overrides, e.g. { '--accent': '#c33' }. */
    tokens: Record<string, string>;
    css: string;
  };
  header: { cta: LinkValue | null; sticky: boolean };
  footer: { text: string; columns: { title: string; links: LinkValue[] }[] };
  nav: NavItem[];
  seo: {
    titleTemplate: string;
    defaultDescription: string;
    defaultImage: string | null;
    noindex: boolean;
    indexNow: boolean;
    indexNowKey: string;
    adult: boolean;
  };
  analytics: { enabled: boolean; goals: { id: string; label: string; event: string }[] };
  consent: { youtube: boolean; vimeo: boolean; maps: boolean };
  ageGate: { enabled: boolean; minAge: number; text: string };
  shop: {
    currency: string;
    vatIncluded: boolean;
    vatRates: { standard: number; reduced: number; none: number };
    shipping: { flat: number; freeFrom: number | null; pickup: boolean; countries: string[] };
    invoiceEnabled: boolean;
    /** Payment details shown for invoice orders (IBAN, recipient). */
    invoiceNote: string;
    terms: string;
    orderPrefix: string;
    notifyEmail: string;
  };
  booking: {
    /** «table» asks for the number of people; «appointment» for a service and optionally a person. */
    mode: 'table' | 'appointment';
    slotStep: number;
    leadMinutes: number;
    horizonDays: number;
    maxParty: number;
    /** Off: bookings arrive as «Offen» and are confirmed by hand. */
    autoConfirm: boolean;
    reminderHours: number;
    /** Guests can cancel themselves until this many hours before. */
    cancelHours: number;
    notifyEmail: string;
    /** Secret part of the calendar subscription URL. */
    feedToken: string;
  };
  donations: {
    /** Organisation that issues receipts (defaults to the business name). */
    recipient: string;
    /** For donations by bank transfer, shown when Stripe is not set up or as an alternative. */
    iban: string;
    /** Recognised as charitable: receipts mention tax deductibility. */
    taxDeductible: boolean;
    /** Sentence on the receipt, e.g. the tax exemption ruling. */
    receiptNote: string;
  };
  members: {
    /** «open»: anyone can create an account; «invite»: only the team adds people. */
    registration: 'open' | 'invite';
    /** Paid membership via Stripe; price 0 = no paid tier. */
    planName: string;
    price: number;
    interval: 'month' | 'year';
    /** What members get, shown on the paywall and the membership block. */
    perks: string;
  };
  newsletter: {
    /** «each»: every new post goes out on its own; «weekly»: one digest per week. */
    auto: 'off' | 'each' | 'weekly';
    /** Weekday of the digest, 1 = Monday. */
    weekday: number;
  };
  blog: { comments: boolean; perPage: number };
  menu: { showAllergens: boolean; dailyTitle: string };
  roleModes: Record<Role, Mode[]>;
  webhooks: Webhook[];
  security: { allowCustomScripts: boolean };
  firstPublishedAt: string | null;
  setupDone: boolean;
  legal: { generatedAt: string | null };
}

export interface MediaItem {
  id: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  focus: { x: number; y: number };
  edits: MediaEdits;
  folder: string;
  tags: string[];
  version: number;
  created_at: string;
  /** Main colour while loading; '' = none (transparent image). */
  color?: string | null;
  /** Tiny WebP preview, base64. */
  lqip?: string | null;
}

export interface MediaEdits {
  crop?: { x: number; y: number; w: number; h: number } | null;
  rotate?: 0 | 90 | 180 | 270;
  brightness?: number; // 0.5 … 1.5
}

export interface FormFieldDef {
  id: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number' | 'file' | 'step';
  label: string;
  name: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  help?: string;
  showIf?: { field: string; equals: string } | null;
}

export interface FormDef {
  id: string;
  name: string;
  fields: FormFieldDef[];
  settings: {
    submitLabel: string;
    successMessage: string;
    notifyEmail: string;
    createLead: boolean;
    turnstile: boolean;
  };
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  mode: Mode;
  totp_enabled: boolean;
  sessions_count: number;
  seen_hints: string[];
  created_at: string;
  last_login_at: string | null;
}
