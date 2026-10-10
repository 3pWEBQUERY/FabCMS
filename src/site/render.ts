import { statsConfig, type StatsConfig } from '../shared/stats-services';
import { html, raw, cx, esc, type Html, hx } from './html';
import type { RenderContext, Crumb } from './context';
import { mediaLoader } from './context';
import { themeCss, resolveTheme } from './themes';
import { renderBlocks, postTeasers, productCards, projectCards, profileCards, renderMenu, hoursSummary } from './blocks';
import { picture, variantUrl, originalUrl } from './picture';
import { publishedEntries, categoriesOf, approvedComments, type PublicEntry } from './data';
import {
  articleLd,
  breadcrumbLd,
  describe,
  formatTitle,
  ldScript,
  menuLd,
  organizationLd,
  pageImage,
  productLd,
  websiteLd,
  type PageMeta,
} from './seo';
import { entryPath } from '../shared/paths';
import { formatPrice, readingTime } from '../shared/text';
import { blocksText } from '../shared/blocks';
import { DAYS } from '../shared/hours';
import type { CollectionDef, EntryData, NavItem, SiteSettings } from '../shared/types';
import type { FieldDef } from '../shared/fields';
import { siteIconSvg } from '../shared/icon-set';
import { sql } from '../server/db';
import { runtimeScript, runtimeVersion } from './assets';
import { htmlClasses, pruneCss, scriptWords } from './css-prune';
import { MOTION_CSS } from '../shared/motion';
import { accountLink, gate } from './members';
import { eventCards, eventTemplate, upcoming } from './events';
import { propertyList, propertyTemplate } from './realestate';
import { entryAccess, mayRead, type Access } from '../shared/members';
import { defaultLang, langInfo, localizeSettings, type Lang } from '../shared/i18n';
import { localized } from '../server/translations';
import { t, L } from './i18n';

export function createContext(input: {
  settings: SiteSettings;
  collections: CollectionDef[];
  path: string;
  base: string;
  query?: URLSearchParams;
  edit?: boolean;
  preview?: boolean;
  ageOk?: boolean;
  ageEid?: boolean;
  cartCount?: number;
  member?: RenderContext['member'];
  lang?: Lang;
  alternates?: RenderContext['alternates'];
}): RenderContext {
  const loader = mediaLoader();
  const mainLang = defaultLang(input.settings);
  const lang = input.lang ?? mainLang;
  const settings = localizeSettings(input.settings, lang);
  return {
    settings,
    theme: resolveTheme(settings).theme,
    collections: input.collections,
    path: input.path,
    base: input.base.replace(/\/$/, ''),
    edit: input.edit ?? false,
    preview: input.preview ?? input.edit ?? false,
    now: new Date(),
    query: input.query ?? new URLSearchParams(),
    jsonLd: [],
    h1: false,
    blockIndex: 0,
    sectionNo: 0,
    depth: 0,
    media: loader.get,
    preloadMedia: loader.preload,
    lcpImage: null,
    needs: new Set(),
    ageOk: input.ageOk ?? false,
    ageEid: input.ageEid ?? false,
    cartCount: input.cartCount ?? 0,
    csrf: '',
    member: input.member ?? null,
    lang,
    mainLang,
    alternates: input.alternates ?? [],
  };
}

/** Language links: absolute, so the link rewriting for /fr/ leaves them alone. */
function langSwitch(ctx: RenderContext): Html {
  if (ctx.alternates.length < 2) return html``;
  return html`<ul class="lang-switch" aria-label="${t(ctx, 'Sprache')}">${ctx.alternates.map(
    (a) =>
      html`<li><a href="${ctx.base}${a.path}" hreflang="${a.lang}" lang="${a.lang}"${a.lang === ctx.lang ? raw(' aria-current="true"') : ''} title="${langInfo(a.lang).native}">${a.lang.toUpperCase()}</a></li>`,
  )}</ul>`;
}

/* ---------- Header & footer ---------- */

function isActive(ctx: RenderContext, href: string) {
  if (href === '/') return ctx.path === '/';
  return ctx.path === href || ctx.path.startsWith(href + '/');
}

function navList(ctx: RenderContext, items: NavItem[]): Html {
  return html`<ul>${items.map(
    (i) =>
      html`<li><a href="${i.href}"${isActive(ctx, i.href) ? raw(' aria-current="page"') : ''}>${i.label}</a>${
        i.children?.length ? html`<div class="sub">${i.children.map((c) => html`<a href="${c.href}">${c.label}</a>`)}</div>` : ''
      }</li>`,
  )}</ul>`;
}

async function header(ctx: RenderContext): Promise<Html> {
  const s = ctx.settings;
  const logo = await ctx.media(s.logo);
  const brand = html`<a class="brand" href="/">${
    logo ? html`<img src="${variantUrl(logo, 480, 'webp')}" alt="${s.name}" width="${logo.width ?? 160}" height="${logo.height ?? 48}">` : s.name
  }</a>`;
  const cart = s.modules.includes('shop')
    ? html`<a class="cart-link" href="/warenkorb" aria-label="${t(ctx, 'Warenkorb, {n} Artikel', { n: ctx.cartCount })}">${t(ctx, 'Warenkorb')} <span class="cart-count" data-cart-count>${ctx.cartCount}</span></a>`
    : '';
  const cta = s.header.cta?.href ? html`<a class="btn" href="${s.header.cta.href}">${s.header.cta.label}</a>` : '';
  const account = accountLink(ctx);
  const editAttr = ctx.edit ? raw(' data-nova-global="header"') : '';
  return html`<header class="${cx('site-header', s.header.sticky && 'sticky')}"${editAttr}><div class="wrap hdr">${brand}<nav class="nav desktop" aria-label="${t(ctx, 'Hauptnavigation')}">${navList(ctx, s.nav)}${account}${cart}${cta}${langSwitch(ctx)}</nav><details class="menu-toggle"><summary aria-label="${t(ctx, 'Menü')}"><span class="bars" aria-hidden="true"></span>${t(ctx, 'Menü')}</summary><nav class="menu-panel" aria-label="${t(ctx, 'Hauptnavigation mobil')}">${navList(
    ctx,
    s.nav,
  )}${account}${cart ? html`<p>${cart}</p>` : ''}${cta}${langSwitch(ctx)}</nav></details></div></header>`;
}

async function footer(ctx: RenderContext): Promise<Html> {
  const s = ctx.settings;
  const b = s.business;
  const legal = await localized(
    (await sql`select id, slug, published_data as data from entries where collection = 'pages' and status = 'published' and slug in ('impressum', 'datenschutz', 'agb') order by slug desc`) as unknown as { id: string; slug: string; data: EntryData }[],
    'pages',
  );
  const editAttr = ctx.edit ? raw(' data-nova-global="footer"') : '';
  return html`<footer class="site-footer"${editAttr}><div class="wrap"><div class="ftr"><div><p class="ftr-name">${s.name}</p>${
    s.footer.text ? html`<p>${s.footer.text}</p>` : ''
  }<address style="font-style:normal">${b.street ? html`${b.street}<br>` : ''}${b.zip || b.city ? html`${b.zip} ${b.city}<br>` : ''}${
    b.phone ? html`<a href="tel:${b.phone.replace(/[^+\d]/g, '')}">${b.phone}</a><br>` : ''
  }${b.email ? html`<a href="mailto:${b.email}">${b.email}</a>` : ''}</address></div>${
    s.hours.length && (b.street || b.city) ? html`<div><h2>${t(ctx, 'Öffnungszeiten')}</h2><ul>${hoursSummary(ctx)}</ul>${s.hoursNote ? html`<p>${s.hoursNote}</p>` : ''}</div>` : ''
  }${s.footer.columns.map((col) => html`<div><h2>${col.title}</h2><ul>${col.links.map((l) => html`<li><a href="${l.href}">${l.label}</a></li>`)}</ul></div>`)}${
    s.social.length ? html`<div><h2>${t(ctx, 'Folgen')}</h2><ul>${s.social.map((l) => html`<li><a href="${l.href}" rel="noopener me">${l.label}</a></li>`)}</ul></div>` : ''
  }</div><div class="ftr-bottom"><span>© ${new Date().getFullYear()} ${b.legalName || s.name}</span><ul>${legal.map(
    (l) => html`<li><a href="/${l.slug}">${l.data.title}</a></li>`,
  )}${
    !ctx.edit && !ctx.preview && statsConfig(s)?.consent.length ? html`<li><button type="button" class="btn-2 ftr-consent" data-consent-open>${t(ctx, 'Statistik-Einstellungen')}</button></li>` : ''
  }</ul></div></div></footer>`;
}

function breadcrumbs(ctx: RenderContext, crumbs: Crumb[]): Html {
  if (crumbs.length < 2) return html``;
  ctx.jsonLd.push(breadcrumbLd(ctx, crumbs));
  return html`<nav class="wrap crumbs" aria-label="${t(ctx, 'Brotkrümel')}"><ol>${crumbs.map((c, i) =>
    i === crumbs.length - 1 ? html`<li aria-current="page">${c.label}</li>` : html`<li><a href="${c.href}">${c.label}</a></li>`,
  )}</ol></nav>`;
}

function ageGate(ctx: RenderContext): Html {
  const g = ctx.settings.ageGate;
  if (!g.enabled || ctx.ageOk || ctx.edit) return html``;
  if (ctx.ageEid) return ageGateEid(ctx);
  return html`<div class="age" role="dialog" aria-modal="true" aria-labelledby="age-h"><form class="age-box" method="post" action="/_nova/age"><p class="label">${ctx.settings.name}</p><h1 id="age-h">${t(ctx, 'Bist du {age} oder älter?', { age: g.minAge })}</h1><p class="muted">${g.text}</p><input type="hidden" name="back" value="${ctx.path}"><div class="actions"><button class="btn" name="ok" value="1">${t(ctx, 'Ja, ich bin {age}+', { age: g.minAge })}</button><a class="btn-2" href="https://www.google.ch" rel="noopener">${t(ctx, 'Nein, verlassen')}</a></div></form></div>`;
}

/** The gate with the Swiss e-ID: QR code for the phone, or «open in swiyu» on the phone itself. */
function ageGateEid(ctx: RenderContext): Html {
  const g = ctx.settings.ageGate;
  ctx.needs.add('age');
  const why =
    g.minAge === 16 || g.minAge === 18
      ? t(ctx, 'Bestätige dein Alter mit deiner E-ID in der App swiyu. Wir erfahren nur, ob du alt genug bist – nicht deinen Namen und nicht dein Geburtsdatum.')
      : t(ctx, 'Bestätige dein Alter mit deiner E-ID in der App swiyu. Wir prüfen dabei nur dein Geburtsdatum und speichern es nicht.');
  return html`<div class="age" role="dialog" aria-modal="true" aria-labelledby="age-h" data-age-eid><div class="age-box"><p class="label">${ctx.settings.name}</p><h1 id="age-h">${t(ctx, 'Bist du {age} oder älter?', { age: g.minAge })}</h1><p class="muted">${g.text}</p><p>${why}</p><div class="age-qr" data-age-qr hidden></div><div class="actions"><button class="btn" type="button" data-age-start>${t(ctx, 'Mit E-ID bestätigen')}</button><a class="btn" data-age-open hidden>${t(ctx, 'In swiyu öffnen')}</a><a class="btn-2" href="https://www.google.ch" rel="noopener">${t(ctx, 'Nein, verlassen')}</a></div><p class="muted age-status" role="status" aria-live="polite" data-age-status data-pending="${t(ctx, 'Scanne den Code mit der App swiyu – oder öffne sie auf diesem Gerät.')}" data-ok="${t(ctx, 'Bestätigt. Einen Moment …')}" data-young="${t(ctx, 'Laut deiner E-ID bist du noch nicht {age}. Diese Website ist für dich gesperrt.', { age: g.minAge })}" data-failed="${t(ctx, 'Die Prüfung wurde abgebrochen. Du kannst es nochmals versuchen.')}" data-expired="${t(ctx, 'Die Zeit ist abgelaufen. Bitte starte die Prüfung nochmals.')}" data-error="${t(ctx, 'Die Prüfung ist gerade nicht möglich. Bitte versuch es später nochmals.')}"></p><p class="muted age-note">${t(ctx, 'Noch keine E-ID? Du beantragst sie in der App swiyu.')}</p><noscript><p>${t(ctx, 'Für die Prüfung mit der E-ID braucht es JavaScript.')}</p></noscript></div></div>`;
}

/* ---------- Document ---------- */

export async function documentHtml(ctx: RenderContext, meta: PageMeta, main: Html, crumbs: Crumb[] = []): Promise<string> {
  const s = ctx.settings;
  const { css, parts, preload } = themeCss(s);
  const { palette } = resolveTheme(s);
  const [hdr, ftr, logo] = await Promise.all([header(ctx), footer(ctx), ctx.media(s.logo)]);
  const crumbHtml = breadcrumbs(ctx, crumbs);
  if (ctx.path === '/') ctx.jsonLd.unshift(organizationLd(ctx, logo), websiteLd(ctx));
  const favicon = await ctx.media(s.favicon ?? s.logo);
  // Own selects, calendars, steppers and file pickers only where such fields exist.
  const fields = /<select[\s>]|type="(?:date|number|file)"/.test(main.value);
  // site.js also carries the text-field helpers (growing textareas, search clear button, messages) and the video player.
  // Statistics services from outside (Plausible, Matomo, Google Analytics) – never in the editor or a preview.
  const stats = ctx.edit || ctx.preview ? null : statsConfig(s);
  const gate = ageGate(ctx);
  // Behind the e-ID gate the page carries no content at all – not even hidden under the overlay.
  const withheld = ctx.ageEid && Boolean(gate.value);
  const runtime = s.analytics.enabled || Boolean(stats) || ctx.needs.size > 0 || s.modules.includes('shop') || fields || /<textarea|type="search"|<video/.test(main.value);
  const blog = ctx.collections.find((c) => c.id === 'posts');
  // Other languages: canonical is the translated address; an untranslated page points to the original and stays out of the index.
  const here = ctx.alternates.find((a) => a.lang === ctx.lang);
  if (ctx.lang !== ctx.mainLang && here && meta.canonical?.startsWith(ctx.base)) {
    if (here.translated) meta.canonical = ctx.base + here.path + meta.canonical.slice(ctx.base.length + ctx.path.length);
    else meta.noindex = true;
  }
  const translated = ctx.alternates.filter((a) => a.translated);
  const hreflang =
    translated.length > 1 && !meta.noindex
      ? html`${translated.map((a) => html`<link rel="alternate" hreflang="${a.lang}" href="${ctx.base}${a.path}">`)}<link rel="alternate" hreflang="x-default" href="${ctx.base}${ctx.path}">`
      : '';
  const head = html`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${meta.title}</title>${
    meta.description ? html`<meta name="description" content="${meta.description}">` : ''
  }<link rel="canonical" href="${meta.canonical}">${hreflang}${meta.noindex || s.seo.noindex ? html`<meta name="robots" content="noindex, nofollow">` : ''}${
    s.seo.adult ? html`<meta name="rating" content="adult">` : ''
  }<meta property="og:type" content="${meta.type === 'article' ? 'article' : 'website'}"><meta property="og:title" content="${meta.plainTitle}"><meta property="og:site_name" content="${s.name}"><meta property="og:url" content="${meta.canonical}"><meta property="og:locale" content="${s.locale.replace('-', '_')}">${
    meta.description ? html`<meta property="og:description" content="${meta.description}">` : ''
  }${meta.image ? html`<meta property="og:image" content="${meta.image}"><meta name="twitter:card" content="summary_large_image">` : ''}${
    meta.publishedAt ? html`<meta property="article:published_time" content="${new Date(meta.publishedAt).toISOString()}">` : ''
  }<meta name="theme-color" content="${palette.bg}">${
    favicon ? html`<link rel="icon" href="${variantUrl(favicon, 160, 'webp')}" type="image/webp">` : html`<link rel="icon" href="/_nova/favicon.svg" type="image/svg+xml">`
  }${blog ? html`<link rel="alternate" type="application/rss+xml" title="${s.name}" href="/feed.xml">` : ''}${preload.map((href) => html`<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`)}<style>${raw(STYLE_MARK)}</style>${
    ctx.needs.has('motion') ? raw('<noscript><style>[data-anim]>*{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important;animation:none!important}</style></noscript>') : ''
  }${
    ctx.needs.has('turnstile') ? html`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''
  }${ctx.jsonLd.map((ld) => html`<script type="application/ld+json">${raw(ldScript(ld))}</script>`)}${
    stats ? html`<script type="application/json" id="nova-stats">${raw(JSON.stringify(stats).replace(/</g, '\\u003c'))}</script>` : ''
  }${
    runtime ? html`<script src="/_nova/site.js?v=${runtimeVersion('site')}" defer></script>` : ''
  }${fields ? html`<script src="/_nova/fields.js?v=${runtimeVersion('fields')}" defer></script>` : ''}${ctx.edit ? html`<script src="/_nova/bridge.js?v=${runtimeVersion('bridge')}" defer></script>` : ''}`;
  const bodyAttrs = raw(
    [
      gate.value ? ' class="age-locked"' : '',
      s.analytics.enabled && !ctx.preview ? ' data-a="1"' : '',
      ctx.edit ? ' data-nova-edit="1"' : '',
    ].join(''),
  );
  const doc = `<!doctype html><html lang="${esc(s.locale)}"><head>${head}</head><body${bodyAttrs}>${gate}<a class="skip" href="#inhalt">${esc(t(ctx, 'Zum Inhalt springen'))}</a>${hdr}<main id="inhalt">${withheld ? '' : crumbHtml}${withheld ? '' : main}</main>${ftr}${consentBar(ctx, stats)}</body></html>`;
  // Only the rules this page can use – not in the editor or previews, and not when own scripts may add classes.
  const lean = ctx.edit || ctx.preview || s.security.allowCustomScripts ? css : parts.fixed + pruneCss(parts.nova, htmlClasses(doc, new Set(await scriptClasses()))) + parts.own;
  // Animations bring their own rules (classes set by the runtime, never pruned); the editor may add some at any time.
  const motion = ctx.needs.has('motion') || ctx.edit ? minifyCss(MOTION_CSS) : '';
  return doc.replace(STYLE_MARK, () => lean + motion);
}

const STYLE_MARK = '/*nova-css*/';
const minifyCss = (css: string) => css.replace(/\n+/g, '');
let scriptWordsOnce: Promise<Set<string>> | null = null;
/** Classes the site's scripts may add later: every word in their code. */
const scriptClasses = () =>
  (scriptWordsOnce ??= Promise.all([runtimeScript('site'), runtimeScript('fields')]).then(([a, b]) => scriptWords(b.code, scriptWords(a.code))));

/** Asks once whether statistics services that set cookies may run. Both answers weigh the same; the footer brings it back. */
function consentBar(ctx: RenderContext, stats: StatsConfig | null): Html {
  if (!stats?.consent.length) return html``;
  const services = stats.consent.join(` ${t(ctx, 'und')} `);
  return html`<section class="cbar" id="nova-consent" aria-labelledby="cbar-h" hidden><p class="cbar-h" id="cbar-h">${t(ctx, 'Darf diese Website Besuche auswerten?')}</p><p>${t(
    ctx,
    'Mit deiner Einwilligung nutzen wir {services}, um zu sehen, welche Seiten gelesen werden. Dabei werden Cookies gesetzt und Daten an den Anbieter übertragen. Du kannst das jederzeit in der Fusszeile ändern.',
    { services },
  )} <a href="/datenschutz">${t(ctx, 'Mehr dazu')}</a></p><div class="cbar-actions"><button type="button" class="btn" data-consent-no>${t(ctx, 'Nein, danke')}</button><button type="button" class="btn" data-consent-yes>${t(ctx, 'Einverstanden')}</button></div></section>`;
}

/* ---------- Pages & entries ---------- */

export interface RenderEntry {
  id: string;
  slug: string;
  data: EntryData;
  published_at: string | null;
  updated_at: string;
  version: number;
  author_name?: string | null;
}

async function pageCrumbs(ctx: RenderContext, slug: string, title: string): Promise<Crumb[]> {
  const parts = slug.split('/').filter(Boolean);
  if (!parts.length) return [];
  const crumbs: Crumb[] = [{ label: t(ctx, 'Startseite'), href: '/' }];
  const parents = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
  if (parents.length) {
    const rows = await localized(
      (await sql`select id, slug, coalesce(published_data, data) as data from entries where collection = 'pages' and slug = any(${parents})`) as unknown as { id: string; slug: string; data: EntryData }[],
      'pages',
    );
    for (const p of parents) {
      const r = rows.find((x) => x.slug === p);
      if (r) crumbs.push({ label: r.data.title, href: `/${p}` });
    }
  }
  crumbs.push({ label: title, href: `/${slug}` });
  return crumbs;
}

/** Content types with their own detail template; all others render through genericTemplate. */
const TEMPLATED = new Set(['pages', 'posts', 'products', 'projects', 'properties', 'events', 'courses', 'profiles']);

export async function renderPage(ctx: RenderContext, c: CollectionDef, e: RenderEntry): Promise<string> {
  const isHome = c.id === 'pages' && e.slug === '';
  const path = entryPath(c, e.slug) ?? ctx.path;
  const image = await pageImage(e.data, ctx, e.id, e.version);
  const meta: PageMeta = {
    title: e.data.seo?.title?.trim() ? e.data.seo.title : formatTitle(ctx, e.data.title, isHome),
    plainTitle: e.data.seo?.title?.trim() || e.data.title,
    description: describe(e.data, ctx),
    canonical: ctx.base + path,
    image,
    type: c.id === 'posts' ? 'article' : c.id === 'products' ? 'product' : 'website',
    noindex: Boolean(e.data.seo?.noindex),
    publishedAt: c.id === 'posts' ? ((e.data.date as string) || e.published_at) : null,
  };
  // Members-only content: everyone else gets title, excerpt and an invitation.
  const access = entryAccess(e.data);
  const locked = !ctx.edit && !ctx.preview && !mayRead(access, ctx.member?.level ?? null);
  let main: Html;
  let crumbs: Crumb[] = [];
  const listCrumb = c.list_route ? [{ label: t(ctx, 'Startseite'), href: '/' }, { label: c.name, href: c.list_route }] : [{ label: t(ctx, 'Startseite'), href: '/' }];
  // Own fields on a built-in type: shown below Nova's template (own types show all fields in genericTemplate).
  const own = c.builtin && !locked && TEMPLATED.has(c.id) ? await fieldParts(ctx, c.custom_fields ?? [], e.data) : [];
  const ownFields = own.length ? html`<section class="b sp-m own-fields"><div class="wrap" style="display:grid;gap:1.25rem;max-width:var(--measure);margin-inline:auto">${own}</div></section>` : html``;
  switch (c.id) {
    case 'pages':
      crumbs = await pageCrumbs(ctx, e.slug, e.data.title);
      main = locked
        ? html`<div class="wrap gate-head"><h1>${e.data.title}</h1></div>${gate(ctx, access)}`
        : await renderBlocks(e.data.blocks ?? [], ctx);
      if (!e.data.blocks?.length && ctx.edit) main = html`<div class="wrap" style="padding-block:4rem"><div class="nova-empty">Diese Seite ist noch leer. Füg oben den ersten Block hinzu.</div></div>`;
      break;
    case 'posts':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await postTemplate(ctx, c, e, image, locked ? access : null, ownFields);
      break;
    case 'products':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await productTemplate(ctx, c, e);
      break;
    case 'projects':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await projectTemplate(ctx, c, e);
      break;
    case 'properties':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await propertyTemplate(ctx, c, e);
      break;
    case 'events':
    case 'courses':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await eventTemplate(ctx, c, e, image);
      break;
    case 'profiles':
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = await profileTemplate(ctx, e);
      break;
    default:
      crumbs = [...listCrumb, { label: e.data.title, href: path }];
      main = locked ? html`<div class="wrap gate-head"><h1>${e.data.title}</h1></div>${gate(ctx, access)}` : await genericTemplate(ctx, c, e);
  }
  if (c.id !== 'posts') main = html`${main}${ownFields}`;
  return documentHtml(ctx, meta, main, crumbs);
}

async function postTemplate(ctx: RenderContext, c: CollectionDef, e: RenderEntry, image: string | null, locked: Access | null, ownFields: Html): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  const cover = await ctx.media(d.cover);
  const date = (d.date as string) || e.published_at;
  const ld = articleLd(ctx, c, { ...e, author_name: e.author_name ?? null }, image);
  ctx.jsonLd.push(entryAccess(d) === 'public' ? ld : { ...ld, isAccessibleForFree: false });
  // Locked: the first text block as a teaser, faded out, then the invitation.
  const first = (d.blocks ?? []).find((b) => b.type === 'text');
  const body = locked
    ? html`${first ? html`<div class="gate-teaser" aria-hidden="false">${await renderBlocks([first], ctx)}</div>` : ''}${gate(ctx, locked)}`
    : await renderBlocks(d.blocks ?? [], ctx);
  const tags = (d.tags as string[]) ?? [];
  let series = html``;
  if (d.series) {
    const { items } = await publishedEntries(c, { limit: 50, sortField: 'date', sortDir: 'asc' });
    const inSeries = items.filter((i) => i.data.series === d.series);
    if (inSeries.length > 1)
      series = html`<aside class="wrap"><div class="series measure"><span class="label">${t(ctx, 'Serie: {name}', { name: d.series as string })}</span><ol>${inSeries.map((i) =>
        i.id === e.id ? html`<li><strong>${i.data.title}</strong></li>` : html`<li><a href="${entryPath(c, i.slug)}">${i.data.title}</a></li>`,
      )}</ol></div></aside>`;
  }
  const { items: related } = await publishedEntries(c, { limit: 4, category: (d.category as string) || undefined });
  const others = related.filter((r) => r.id !== e.id).slice(0, 3);
  const commentsHtml = !locked && ctx.settings.blog.comments && d.allowComments !== false ? await commentsSection(ctx, e.id) : html``;
  return html`<article><header class="wrap art-head">${d.category ? html`<a class="label" href="${c.list_route}?kategorie=${encodeURIComponent(d.category as string)}">${d.category as string}</a>` : ''}<h1${
    ctx.edit ? raw(' data-nova-entry-field="title"') : ''
  }>${d.title}</h1>${d.excerpt ? html`<p class="lead">${d.excerpt as string}</p>` : ''}<div class="art-meta">${
    date ? html`<time datetime="${new Date(date).toISOString().slice(0, 10)}">${new Date(date).toLocaleDateString(L(ctx), { day: 'numeric', month: 'long', year: 'numeric' })}</time>` : ''
  }${e.author_name ? html`<span>${e.author_name}</span>` : ''}<span>${t(ctx, '{n} Min. Lesezeit', { n: readingTime(blocksText(d.blocks)) })}</span></div>${
    cover ? html`<figure class="art-cover">${picture(cover, { sizes: '(min-width: 78rem) 78rem, 100vw', priority: true })}${cover.caption ? html`<figcaption>${cover.caption}</figcaption>` : ''}</figure>` : ''
  }</header><div class="art-body">${body}</div>${ownFields}${
    tags.length ? html`<footer class="wrap"><div class="art-foot measure">${tags.map((t) => html`<a class="tag-chip" href="${c.list_route}?schlagwort=${encodeURIComponent(t)}">${t}</a>`)}</div></footer>` : ''
  }</article>${series}${commentsHtml}${
    others.length ? html`<section class="b sp-m"><div class="wrap"><header class="bh"><h2>${t(ctx, 'Weiterlesen')}</h2></header>${((ctx.hl = 3), await postTeasers(ctx, others, 'grid'))}</div></section>` : ''
  }`;
}

async function commentsSection(ctx: RenderContext, entryId: string): Promise<Html> {
  const list = await approvedComments(entryId);
  const sent = ctx.query.get('kommentar') === 'danke';
  return html`<section class="b sp-m" id="kommentare"><div class="wrap comments"><h2 style="font-size:var(--step-3);margin-bottom:1rem">${
    list.length ? (list.length === 1 ? t(ctx, '1 Kommentar') : t(ctx, '{n} Kommentare', { n: list.length })) : t(ctx, 'Kommentare')
  }</h2>${list.map(
    (k) =>
      html`<article class="comment"><header><strong>${k.name}</strong><time datetime="${new Date(k.created_at).toISOString()}">${new Date(k.created_at).toLocaleDateString(L(ctx))}</time></header><p style="margin:0;white-space:pre-line">${k.body}</p></article>`,
  )}${
    sent
      ? html`<p class="form-ok" role="status">${t(ctx, 'Danke! Dein Kommentar erscheint, sobald er freigegeben ist.')}</p>`
      : html`<form class="nform" method="post" action="/_nova/comments/${entryId}" style="margin-top:2rem"><h3 style="font-size:var(--step-2)">${t(ctx, 'Kommentar schreiben')}</h3><input type="hidden" name="_t" value="${Date.now().toString(36)}"><div class="hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div><div class="fld"><label for="c-name">${t(ctx, 'Name')}</label><input id="c-name" name="name" required maxlength="80" autocomplete="name"></div><div class="fld"><label for="c-mail">${t(ctx, 'E-Mail')} <span class="muted">${t(ctx, '(wird nicht veröffentlicht)')}</span></label><input id="c-mail" name="email" type="email" maxlength="200" autocomplete="email"></div><div class="fld"><label for="c-body">${t(ctx, 'Kommentar')}</label><textarea id="c-body" name="body" required maxlength="4000"></textarea></div><div><button class="btn">${t(ctx, 'Absenden')}</button></div><p class="muted" style="font-size:var(--step-n1);margin:0">${t(ctx, 'Kommentare werden vor der Veröffentlichung geprüft.')}</p></form>`
  }</div></section>`;
}

async function productTemplate(ctx: RenderContext, c: CollectionDef, e: RenderEntry): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  ctx.needs.add('cart');
  const ids = (d.images as string[]) ?? [];
  await ctx.preloadMedia(ids);
  const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
  ctx.jsonLd.push(productLd(ctx, c, e, imgs.map((m) => ctx.base + variantUrl(m, 1280, 'jpg'))));
  const variants = (d.variants as { name: string; price?: number | null; stock?: number | null }[]) ?? [];
  const baseStock = d.stock as number | null | undefined;
  const soldOut = variants.length ? variants.every((v) => v.stock === 0) : baseStock === 0;
  const lowStock = !variants.length && typeof baseStock === 'number' && baseStock > 0 && baseStock <= 5;
  const s = ctx.settings;
  const added = ctx.query.get('hinzugefuegt') === '1';
  const shipNote = d.digital
    ? t(ctx, 'Digitales Produkt – Download nach der Zahlung.')
    : s.shop.shipping.freeFrom !== null
      ? t(ctx, 'inkl. MwSt., Versand {flat}, ab {free} gratis', { flat: formatPrice(s.shop.shipping.flat), free: formatPrice(s.shop.shipping.freeFrom) })
      : t(ctx, 'inkl. MwSt., zzgl. Versand {flat}', { flat: formatPrice(s.shop.shipping.flat) });
  if (imgs.length > 1) ctx.needs.add('lightbox');
  return html`<div class="wrap pdp"><div class="pdp-gal" data-lightbox>${
    imgs[0] ? html`<a href="${variantUrl(imgs[0], 1920, 'webp')}">${picture(imgs[0], { sizes: '(min-width: 56rem) 55vw, 100vw', priority: true, ratio: '4/5' })}</a>` : ''
  }${imgs.length > 1 ? html`<div class="thumbs">${imgs.slice(1).map((m) => html`<a href="${variantUrl(m, 1920, 'webp')}">${picture(m, { sizes: '14vw', maxWidth: 480, ratio: '1/1' })}</a>`)}</div>` : ''}</div><div class="pdp-info">${
    d.category ? html`<a class="label" href="${c.list_route}?kategorie=${encodeURIComponent(d.category as string)}">${d.category as string}</a>` : ''
  }<h1>${d.title}</h1><div class="price-row pdp-price"><span data-price>${formatPrice(d.price as number)}</span>${
    d.comparePrice ? html`<s>${formatPrice(d.comparePrice as number)}</s>` : ''
  }</div><p class="pdp-note">${s.shop.currency} · ${shipNote}</p>${
    added ? html`<p class="form-ok" role="status">${t(ctx, 'Im Warenkorb.')} <a href="/warenkorb">${t(ctx, 'Zum Warenkorb')}</a></p>` : ''
  }${
    soldOut
      ? html`<p class="badge">${t(ctx, 'Ausverkauft')}</p>`
      : html`<form method="post" action="/warenkorb/add" class="nform" data-add-to-cart><input type="hidden" name="product" value="${e.id}">${
          variants.length
            ? html`<div class="fld"><label for="variant">${t(ctx, 'Variante')}</label><select id="variant" name="variant" required>${variants.map((v, i) =>
                v.stock === 0
                  ? html`<option value="${i}" disabled>${t(ctx, '{name} – ausverkauft', { name: v.name })}</option>`
                  : html`<option value="${i}" data-price="${formatPrice(v.price ?? (d.price as number))}">${v.name}${v.price && v.price !== d.price ? ` – ${formatPrice(v.price)}` : ''}</option>`,
              )}</select></div>`
            : ''
        }<div class="qty"><div class="fld"><label for="qty">${t(ctx, 'Menge')}</label><input id="qty" name="qty" type="number" min="1" max="${typeof baseStock === 'number' && !variants.length ? Math.min(99, baseStock) : 99}" value="1" inputmode="numeric"></div><button class="btn">${t(ctx, 'In den Warenkorb')}</button></div>${
          lowStock ? html`<p class="stock low">${t(ctx, 'Nur noch {n} Stück an Lager', { n: baseStock as number })}</p>` : ''
        }</form>`
  }${d.description ? html`<div class="prose">${raw(d.description as string)}</div>` : ''}</div></div>`;
}

async function projectTemplate(ctx: RenderContext, c: CollectionDef, e: RenderEntry): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  const cover = await ctx.media(d.cover);
  const ids = (d.images as string[]) ?? [];
  await ctx.preloadMedia(ids);
  const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
  if (imgs.length) ctx.needs.add('lightbox');
  const { items } = await publishedEntries(c, { limit: 100 });
  const idx = items.findIndex((i) => i.id === e.id);
  const next = items.length > 1 ? items[(idx + 1) % items.length] : null;
  const facts = [
    d.client ? html`<div><span class="label">${t(ctx, 'Kunde')}</span><br>${d.client as string}</div>` : '',
    d.year ? html`<div><span class="label">${t(ctx, 'Jahr')}</span><br>${d.year as number}</div>` : '',
    d.category ? html`<div><span class="label">${t(ctx, 'Bereich')}</span><br>${d.category as string}</div>` : '',
  ].filter(Boolean);
  return html`<article><header class="wrap art-head"><h1>${d.title}</h1>${d.summary ? html`<p class="lead">${d.summary as string}</p>` : ''}${
    facts.length ? html`<div class="stats" style="margin-top:1rem">${facts}</div>` : ''
  }</header>${cover ? html`<div class="wrap art-cover">${picture(cover, { sizes: '(min-width: 78rem) 78rem, 100vw', priority: true })}</div>` : ''}${await renderBlocks(d.blocks ?? [], ctx)}${
    imgs.length
      ? html`<section class="b sp-m"><div class="wrap"><div class="gal gal-mosaic" data-lightbox>${imgs.map(
          (m) => html`<a href="${variantUrl(m, 1920, 'webp')}" data-caption="${m.caption || m.alt}">${picture(m, { sizes: '(min-width: 56rem) 33vw, 100vw', maxWidth: 1280 })}</a>`,
        )}</div></div></section>`
      : ''
  }${next ? html`<nav class="wrap pager" aria-label="${t(ctx, 'Nächstes Projekt')}"><a class="btn-2" href="${c.list_route}">${t(ctx, 'Alle Projekte')}</a><a class="btn-2" href="${entryPath(c, next.slug)}">${next.data.title}</a></nav>` : ''}</article>`;
}

async function profileTemplate(ctx: RenderContext, e: RenderEntry): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  const ids = (d.images as string[]) ?? [];
  await ctx.preloadMedia(ids);
  const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
  if (imgs.length) ctx.needs.add('lightbox');
  const days = ((d.availability as string[]) ?? []).map(Number).sort();
  return html`<div class="wrap pdp"><div class="pdp-gal" data-lightbox>${imgs.map(
    (m, i) => html`<a href="${variantUrl(m, 1920, 'webp')}">${picture(m, { sizes: '(min-width: 56rem) 55vw, 100vw', priority: i === 0, ratio: '3/4' })}</a>`,
  )}</div><div class="pdp-info"><h1>${d.title}</h1>${d.availableNow ? html`<span class="avail">${t(ctx, 'Gerade verfügbar')}</span>` : ''}${
    d.intro ? html`<p class="lead">${d.intro as string}</p>` : ''
  }${(d.languages as string[])?.length ? html`<p><span class="label">${t(ctx, 'Sprachen')}</span><br>${(d.languages as string[]).join(', ')}</p>` : ''}${
    (d.services as string[])?.length ? html`<p><span class="label">${t(ctx, 'Leistungen')}</span><br>${(d.services as string[]).join(', ')}</p>` : ''
  }${days.length ? html`<p><span class="label">${t(ctx, 'Anwesend')}</span><br>${days.map((x) => DAYS[ctx.lang].long[x]).join(', ')}</p>` : ''}</div></div>`;
}

/** Field values as page content – for own content types and for fields added to built-in ones. */
async function fieldParts(ctx: RenderContext, fields: FieldDef[], d: Record<string, unknown>, skip: (f: FieldDef) => boolean = () => false): Promise<Html[]> {
  const parts: Html[] = [];
  for (const f of fields) {
    if (skip(f) || f.pro || f.private) continue;
    const v = d[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    switch (f.type) {
      case 'image':
        parts.push(html`<figure class="fig">${picture(await ctx.media(v), { sizes: '(min-width: 40rem) 38rem, 100vw' })}</figure>`);
        break;
      case 'images': {
        await ctx.preloadMedia(v as string[]);
        const imgs = (await Promise.all((v as string[]).map((id) => ctx.media(id)))).filter((m) => m !== null);
        ctx.needs.add('lightbox');
        parts.push(html`<div class="gal gal-grid" data-lightbox>${imgs.map((m) => html`<a href="${variantUrl(m, 1920, 'webp')}">${picture(m, { sizes: '25vw', maxWidth: 960 })}</a>`)}</div>`);
        break;
      }
      case 'file': {
        const m = await ctx.media(v);
        if (m) parts.push(html`<p><a class="btn-2" href="${originalUrl(m)}">${f.label}: ${m.filename}</a></p>`);
        break;
      }
      case 'richtext':
        parts.push(html`<div class="prose">${raw(v as string)}</div>`);
        break;
      case 'money':
        parts.push(html`<p><span class="label">${f.label}</span><br>${formatPrice(v as number)}</p>`);
        break;
      case 'boolean':
        parts.push(html`<p><span class="label">${f.label}</span><br>${v ? t(ctx, 'Ja') : t(ctx, 'Nein')}</p>`);
        break;
      case 'date':
        parts.push(html`<p><span class="label">${f.label}</span><br>${new Date(v as string).toLocaleDateString(L(ctx))}</p>`);
        break;
      case 'datetime':
        parts.push(html`<p><span class="label">${f.label}</span><br>${new Date(v as string).toLocaleString(L(ctx), { dateStyle: 'long', timeStyle: 'short' })}</p>`);
        break;
      case 'url':
        parts.push(html`<p><a class="btn-2" href="${v as string}" rel="noopener">${f.label}</a></p>`);
        break;
      case 'tags':
      case 'multiselect':
        parts.push(html`<p><span class="label">${f.label}</span><br>${(v as string[]).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ')}</p>`);
        break;
      case 'select':
        parts.push(html`<p><span class="label">${f.label}</span><br>${f.options?.find((o) => o.value === v)?.label ?? String(v)}</p>`);
        break;
      case 'location':
        parts.push(html`<p><span class="label">${f.label}</span><br>${(v as { address: string }).address}</p>`);
        break;
      case 'group': {
        // Short fields read as one line («200 g Mehl»), longer ones as numbered steps.
        const sub = f.fields ?? [];
        const short = sub.every((x) => ['text', 'number', 'money', 'date', 'select'].includes(x.type));
        const items = (v as Record<string, unknown>[]).map((item) => {
          const line = sub
            .filter((x) => ['text', 'number', 'select'].includes(x.type) && item[x.key] !== undefined && item[x.key] !== '')
            .map((x) => String(item[x.key]))
            .join(' ');
          const long = sub.filter((x) => (x.type === 'textarea' || x.type === 'richtext') && item[x.key]);
          return short || !long.length
            ? html`<li>${line}</li>`
            : html`<li>${line ? html`<strong>${line}</strong>` : ''}${long.map((x) => (x.type === 'richtext' ? raw(String(item[x.key])) : html`<p>${String(item[x.key])}</p>`))}</li>`;
        });
        parts.push(html`<section><h2>${f.label}</h2><div class="prose">${short ? html`<ul>${items}</ul>` : html`<ol>${items}</ol>`}</div></section>`);
        break;
      }
      case 'link': {
        const l = v as { label?: string; href?: string };
        if (l.href) parts.push(html`<p><a class="btn-2" href="${l.href}">${l.label || f.label}</a></p>`);
        break;
      }
      case 'email':
        parts.push(html`<p><span class="label">${f.label}</span><br><a href="mailto:${String(v)}">${String(v)}</a></p>`);
        break;
      case 'icon':
        parts.push(html`<p><span class="label">${f.label}</span><br>${raw(siteIconSvg(v))}</p>`);
        break;
      case 'color':
        if (/^#[0-9a-f]{3,8}$/i.test(String(v)))
          parts.push(html`<p><span class="label">${f.label}</span><br><span style="display:inline-block;width:1.5em;height:1.5em;border-radius:50%;vertical-align:middle;background:${String(v)};box-shadow:0 0 0 1px var(--line)"></span> ${String(v)}</p>`);
        break;
      case 'textarea':
        parts.push(html`<p><span class="label">${f.label}</span><br>${raw(esc(String(v)).replace(/\n/g, '<br>'))}</p>`);
        break;
      case 'json':
      case 'relation':
      case 'form':
      case 'blocks':
        break;
      default:
        parts.push(html`<p><span class="label">${f.label}</span><br>${String(v)}</p>`);
    }
  }
  return parts;
}

async function genericTemplate(ctx: RenderContext, c: CollectionDef, e: RenderEntry): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  const parts = await fieldParts(ctx, c.fields, d, (f) => f.key === c.title_field || f.key === 'title');
  return html`<article><header class="wrap art-head"><h1>${d.title}</h1></header><div class="wrap" style="padding-top:2rem;display:grid;gap:1.25rem;max-width:var(--measure);margin-inline:auto">${parts}</div>${
    c.has_blocks ? await renderBlocks(d.blocks ?? [], ctx) : ''
  }</article>`;
}

/* ---------- Collection overview pages ---------- */

export async function renderList(ctx: RenderContext, c: CollectionDef): Promise<string> {
  const page = Math.max(1, Number(ctx.query.get('seite')) || 1);
  const perPage = c.id === 'posts' ? ctx.settings.blog.perPage || 10 : c.per_page || 24;
  const category = ctx.query.get('kategorie') ?? '';
  const tag = ctx.query.get('schlagwort') ?? '';
  let main: Html;
  let description = '';
  ctx.h1 = true;
  if (c.id === 'dishes') {
    main = html`<div class="wrap art-head"><h1>${c.list_route === '/karte' ? t(ctx, 'Karte') : c.name}</h1><p class="no-print"><a class="btn-2" href="/karte/druck">${t(ctx, 'Druckversion')}</a></p></div><section class="b sp-m"><div class="wrap">${((ctx.hl = 2), await renderMenu(ctx, { daily: true, allergens: true }))}</div></section>`;
    const { items } = await publishedEntries(c, { limit: 500, sortField: 'sort', sortDir: 'asc' });
    ctx.jsonLd.push(menuLd(ctx, items));
    description = t(ctx, 'Karte von {site}: {dishes}.', {
      site: ctx.settings.name,
      dishes: items
        .slice(0, 6)
        .map((i) => i.data.title)
        .join(', '),
    });
  } else if (c.id === 'properties') {
    ({ main, description } = await propertyList(ctx, c));
  } else if (c.id === 'events' || c.id === 'courses') {
    const past = ctx.query.get('vergangen') === '1';
    const items = await upcoming(c.id, ctx.settings.timezone, { past, category: category || undefined, limit: 200 });
    const cats = await categoriesOf(c.id);
    const filter =
      cats.length > 1
        ? html`<nav class="filters" aria-label="${t(ctx, 'Nach Kategorie filtern')}"><a href="${c.list_route}" aria-current="${!category}">${t(ctx, 'Alle')}</a>${cats.map(
            (cat) => html`<a href="${c.list_route}?kategorie=${encodeURIComponent(cat)}" aria-current="${category.toLowerCase() === cat.toLowerCase()}">${cat}</a>`,
          )}</nav>`
        : '';
    main = html`<div class="wrap art-head"><h1>${past ? t(ctx, 'Vergangene {name}', { name: c.name }) : c.name}</h1></div><section class="b sp-m"><div class="wrap">${filter}${((ctx.hl = 2), await eventCards(ctx, c, items))}<p class="ev-more"><a class="btn-2" href="${c.list_route}${past ? '' : '?vergangen=1'}">${past ? t(ctx, 'Kommende {name}', { name: c.name }) : t(ctx, 'Vergangene {name}', { name: c.name })}</a></p></div></section>`;
    description = items[0]
      ? t(ctx, '{name} bei {site}: {items}.', { name: c.name, site: ctx.settings.name, items: items.slice(0, 3).map((i) => i.data.title).join(', ') })
      : t(ctx, '{name} bei {site}.', { name: c.name, site: ctx.settings.name });
  } else {
    let { items, total } = await publishedEntries(c, { limit: tag ? 500 : perPage, offset: tag ? 0 : (page - 1) * perPage, category: category || undefined });
    if (tag) {
      items = items.filter((i) => ((i.data.tags as string[]) ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()));
      total = items.length;
      items = items.slice((page - 1) * perPage, page * perPage);
    }
    const cats = ['posts', 'products', 'projects'].includes(c.id) ? await categoriesOf(c.id) : [];
    const filter =
      cats.length > 1
        ? html`<nav class="filters" aria-label="${t(ctx, 'Nach Kategorie filtern')}"><a href="${c.list_route}" aria-current="${!category && !tag}">${t(ctx, 'Alle')}</a>${cats.map(
            (cat) => html`<a href="${c.list_route}?kategorie=${encodeURIComponent(cat)}" aria-current="${category.toLowerCase() === cat.toLowerCase()}">${cat}</a>`,
          )}</nav>`
        : '';
    const pages = Math.ceil(total / perPage);
    const q = (n: number) => {
      const p = new URLSearchParams();
      if (category) p.set('kategorie', category);
      if (tag) p.set('schlagwort', tag);
      if (n > 1) p.set('seite', String(n));
      const s = p.toString();
      return `${c.list_route}${s ? `?${s}` : ''}`;
    };
    const pager =
      pages > 1
        ? html`<nav class="pager" aria-label="${t(ctx, 'Seiten')}">${page > 1 ? html`<a class="btn-2" href="${q(page - 1)}" rel="prev">${t(ctx, 'Neuere')}</a>` : html`<span></span>`}<span class="muted">${t(ctx, 'Seite {n} von {total}', { n: page, total: pages })}</span>${
            page < pages ? html`<a class="btn-2" href="${q(page + 1)}" rel="next">${t(ctx, 'Ältere')}</a>` : html`<span></span>`
          }</nav>`
        : '';
    let list: Html;
    ctx.hl = 2; // the cards sit right under the page title
    if (!items.length) list = html`<p class="muted">${t(ctx, 'Hier erscheint bald etwas.')}</p>`;
    else if (c.id === 'posts') list = await postTeasers(ctx, items, page === 1 && !category && !tag ? 'feature' : 'grid');
    else if (c.id === 'products') list = await productCards(ctx, items);
    else if (c.id === 'projects') list = await projectCards(ctx, items);
    else if (c.id === 'profiles') list = await profileCards(ctx, items);
    else list = await genericCards(ctx, c, items);
    const heading = tag ? `${c.name}: #${tag}` : category ? `${c.name}: ${category}` : c.name;
    main = html`<div class="wrap art-head"><h1>${heading}</h1></div><section class="b sp-m"><div class="wrap">${filter}${list}${pager}</div></section>`;
    description = category
      ? t(ctx, '{name} von {site} – {category}.', { name: c.name, site: ctx.settings.name, category })
      : t(ctx, '{name} von {site}.', { name: c.name, site: ctx.settings.name });
  }
  const path = c.list_route ?? '/';
  const canonicalQuery = new URLSearchParams();
  if (category) canonicalQuery.set('kategorie', category);
  if (page > 1) canonicalQuery.set('seite', String(page));
  const meta: PageMeta = {
    title: formatTitle(ctx, c.id === 'dishes' ? t(ctx, 'Karte') : c.name, false),
    plainTitle: c.name,
    description,
    canonical: ctx.base + path + (canonicalQuery.size ? `?${canonicalQuery}` : ''),
    image: `${ctx.base}/_nova/og/site.png`,
    type: 'website',
    noindex: Boolean(tag),
  };
  return documentHtml(ctx, meta, main, [
    { label: t(ctx, 'Startseite'), href: '/' },
    { label: c.id === 'dishes' ? t(ctx, 'Karte') : c.name, href: path },
  ]);
}

async function genericCards(ctx: RenderContext, c: CollectionDef, items: PublicEntry[]): Promise<Html> {
  const imgField = c.fields.find((f) => f.type === 'image');
  const textField = c.fields.find((f) => f.type === 'textarea');
  return html`<div class="cards">${await Promise.all(
    items.map(async (i) => {
      const img = imgField ? await ctx.media(i.data[imgField.key]) : null;
      const href = entryPath(c, i.slug);
      const inner = html`${img ? html`<div class="ph">${picture(img, { sizes: '(min-width: 56rem) 30vw, 100vw', maxWidth: 960, ratio: '3/2' })}</div>` : ''}${hx(ctx, i.data.title)}${
        textField && i.data[textField.key] ? html`<p>${String(i.data[textField.key])}</p>` : ''
      }`;
      return href ? html`<a class="card" href="${href}">${inner}</a>` : html`<div class="card">${inner}</div>`;
    }),
  )}</div>`;
}

/** Simple themed page for system views (cart, checkout, search, 404). */
export async function renderSystemPage(ctx: RenderContext, opts: { title: string; body: Html; noindex?: boolean; description?: string }): Promise<string> {
  ctx.h1 = true;
  const meta: PageMeta = {
    title: formatTitle(ctx, opts.title, false),
    plainTitle: opts.title,
    description: opts.description ?? '',
    canonical: ctx.base + ctx.path,
    image: null,
    type: 'website',
    noindex: opts.noindex ?? true,
  };
  return documentHtml(ctx, meta, opts.body);
}

