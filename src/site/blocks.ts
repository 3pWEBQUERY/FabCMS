import { html, raw, esc, cx, field, lines, join, hx, type Html } from './html';
import type { BoundEntry, RenderContext } from './context';
import { picture, originalUrl, variantUrl } from './picture';
import { BLOCK_MAP } from '../shared/blocks';
import { blockDomId, designImages } from '../shared/design';
import { blockLookCss, savedStyleImages, savedStylesCss, styleOf, stylesUsed } from '../shared/styles';
import { motionAttrs } from '../shared/motion';
import { slidesCss } from '../shared/bg-media';
import { FILTER_SORTS, filterParams, localNow, loopQuery, pageParam, relatedTo, timeField, type FilterSort, type LoopSort } from '../shared/query';
import { condsHold, type CondEnv } from '../shared/conditions';
import { bindKind, applyOverrides, BOX_TAGS, walkEls, componentEls, componentVariants, variantImages, variantsCss, type Variant, elementImages, elementsCss, elementsText, itemLabel, listTemplate, MARQUEE_SPEEDS, OVERRIDABLE, SHAPES, SPACER_SIZES, type El, type Overrides } from '../shared/elements';
import { sanitizeRichText } from '../shared/richtext';
import { siteIconSvg } from '../shared/icon-set';
import type { Block, EntryData, FormDef, NavItem } from '../shared/types';
import type { FieldDef, LinkValue } from '../shared/fields';
import { bestsellers, publishedEntries, categoriesOf, tagsOf, getForm, legalPages, productById, ratingSummaries, relatedProducts, sectionBlocks } from './data';
import { ALLERGENS, DISH_TAGS } from '../shared/collections';
import { entryPath } from '../shared/paths';
import { compactHours, DAYS, formatSlots, openStatus, zonedNow } from '../shared/hours';
import { listServices, openDays, slotsFor } from '../server/booking';
import { localDay, zonedToUtc, type BookingService } from '../shared/booking';
import { MONTHS, longDay } from '../shared/dates';
import { formatPrice, readingTime, slugify, stripHtml } from '../shared/text';
import { blocksText } from '../shared/blocks';
import { entryAccess, mayRead } from '../shared/members';
import { accountLink, membershipBox } from './members';
import { eventCards, upcoming } from './events';
import { donateBlock } from './donations';
import { findProperties, propertyCards } from './realestate';
import { env } from '../server/env';
import { t, L } from './i18n';
import { langInfo } from '../shared/i18n';

type Renderer = (b: Block, ctx: RenderContext) => Promise<Html> | Html;

/** Blocks whose heading counts toward the section numbers («01», «02» …). */
export const HEADED_BLOCKS = new Set(['gallery', 'list', 'faq', 'testimonials', 'stats', 'pricing', 'people', 'form', 'contact', 'hours', 'posts', 'products', 'menu', 'projects', 'profiles']);
type P = Record<string, any>;

const btn = (l: LinkValue | null | undefined, primary = true, edit = false, path = '') =>
  l?.href && l.label
    ? html`<a class="${primary ? 'btn' : 'btn-2'}" href="${l.href}"${edit && path ? raw(` data-nova-link="${esc(path)}"`) : ''}>${l.label}</a>`
    : html``;

function heading(ctx: RenderContext, p: P, key = 'heading', intro?: string): Html {
  const text = p[key];
  if (!text && !ctx.edit) return html``;
  ctx.sectionNo++;
  ctx.hl = 3; // items in this block sit under this heading
  const num = ctx.theme.numbered ? html`<span class="num">${String(ctx.sectionNo).padStart(2, '0')}</span>` : '';
  return html`<header class="bh">${num}<h2${field(ctx.edit, key)}>${text ?? ''}</h2>${
    intro !== undefined && (p[intro] || ctx.edit) ? html`<p${field(ctx.edit, intro, 'multi')}>${lines(p[intro])}</p>` : ''
  }</header>`;
}

function headingTag(ctx: RenderContext): 'h1' | 'h2' {
  if (!ctx.h1 && ctx.blockIndex === 0) {
    ctx.h1 = true;
    return 'h1';
  }
  return 'h2';
}

/** For a German word that means something else elsewhere on the site: translate via a more specific key. */

/** Day names are lowercase in French and Italian; as table headings they start with a capital. */
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const empty = (ctx: RenderContext, msg: string) => (ctx.edit ? html`<div class="wrap"><div class="nova-empty">${msg}</div></div>` : html``);

/* ---------- Embeds ---------- */

export function videoEmbed(url: string): { provider: 'youtube' | 'vimeo'; src: string } | null {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0` };
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vm) return { provider: 'vimeo', src: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&dnt=1` };
  return null;
}

const PROVIDER_NAMES = { youtube: 'YouTube (Google)', vimeo: 'Vimeo', maps: 'OpenStreetMap' } as const;

function consentBox(ctx: RenderContext, kind: keyof typeof PROVIDER_NAMES, src: string, title: string, poster: Html = html``, extraClass = ''): Html {
  const provider = PROVIDER_NAMES[kind];
  return html`<div class="consent ${extraClass}" data-consent="${kind}" data-src="${src}" data-title="${title}">${poster}<div class="consent-box"><strong>${title}</strong><p style="margin:0">${t(ctx, 'Beim Laden werden Daten an {provider} übertragen.', { provider })}</p><button type="button" class="btn" data-consent-load>${t(ctx, 'Inhalt laden')}</button><label><input type="checkbox" data-consent-remember> ${t(ctx, 'Inhalte von {provider} immer laden', { provider })}</label><noscript><a href="${src.replace('?autoplay=1', '')}" rel="noopener">${t(ctx, 'Direkt bei {provider} öffnen', { provider })}</a></noscript></div></div>`;
}

/* ---------- Forms ---------- */

export function renderForm(form: FormDef, ctx: RenderContext, blockId: string): Html {
  const sent = ctx.query.get('gesendet') === form.id;
  if (sent)
    return html`<div class="form-ok" role="status" id="form-${form.id}" data-goal="form"><p style="margin:0">${form.settings.successMessage || t(ctx, 'Danke! Wir melden uns bald.')}</p></div>`;
  ctx.needs.add('form');
  const error = ctx.query.get('formfehler') === form.id ? ctx.query.get('meldung') : null;
  const groups: (typeof form.fields)[] = [[]];
  for (const f of form.fields) {
    if (f.type === 'step') groups.push([]);
    else groups[groups.length - 1].push(f);
  }
  const stepLabels = [form.name, ...form.fields.filter((f) => f.type === 'step').map((f) => f.label)];
  const multi = groups.length > 1;
  const hasFile = form.fields.some((f) => f.type === 'file');
  const fid = (name: string) => `f-${blockId}-${name}`;

  const fieldHtml = (f: (typeof form.fields)[number]) => {
    const req = f.required ? html` <span class="req" aria-hidden="true">*</span>` : '';
    const cond = f.showIf?.field ? raw(` data-show-if="${esc(JSON.stringify(f.showIf))}"`) : '';
    const hint = f.help ? html`<span class="hint" id="${fid(f.name)}-h">${f.help}</span>` : '';
    const describedBy = f.help ? raw(` aria-describedby="${fid(f.name)}-h"`) : '';
    const common = raw(`name="${esc(f.name)}" id="${fid(f.name)}"${f.required ? ' required' : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}`);
    if (f.type === 'checkbox')
      return html`<div class="fld check"${cond}><input type="checkbox" value="ja" ${common}${describedBy}><label for="${fid(f.name)}">${f.label}${req}</label>${hint}</div>`;
    let control: Html;
    switch (f.type) {
      case 'textarea':
        control = html`<textarea ${common}${describedBy}></textarea>`;
        break;
      case 'select':
        control = html`<select ${common}${describedBy}><option value="">${t(ctx, 'Bitte wählen')}</option>${(f.options ?? []).map((o) => html`<option>${o}</option>`)}</select>`;
        break;
      case 'file':
        control = html`<input type="file" ${common}${describedBy} accept="image/*,.pdf,.docx,.xlsx,.txt">`;
        break;
      default: {
        const type = f.type === 'tel' ? 'tel' : f.type;
        const auto = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : /name/i.test(f.name) ? 'name' : 'on';
        control = html`<input type="${type}" autocomplete="${auto}" ${common}${describedBy}>`;
      }
    }
    return html`<div class="fld"${cond}><label for="${fid(f.name)}">${f.label}${req}</label>${control}${hint}</div>`;
  };

  const turnstile = form.settings.turnstile && env.turnstile.siteKey;
  if (turnstile) ctx.needs.add('turnstile');
  return html`<form class="nform" id="form-${form.id}" method="post" action="/_nova/forms/${form.id}"${hasFile ? raw(' enctype="multipart/form-data"') : ''}${
    multi ? raw(` data-steps="${groups.length}"`) : ''
  } data-nova-form>
    ${error ? html`<p class="form-err" role="alert">${error}</p>` : ''}
    <input type="hidden" name="_page" value="${ctx.path}"><input type="hidden" name="_t" value="${Date.now().toString(36)}">
    <div class="hp" aria-hidden="true"><label>${t(ctx, 'Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    ${groups.map(
      (g, i) =>
        html`<fieldset${i === 0 ? raw(' class="on"') : ''} data-step="${i}">${multi ? html`<legend>${i + 1}/${groups.length} · ${stepLabels[i]}</legend>` : ''}${g.map(fieldHtml)}${
          multi
            ? html`<div class="steps-nav">${i > 0 ? html`<button type="button" class="btn-2" data-step-back>${t(ctx, 'Zurück')}</button>` : ''}${
                i < groups.length - 1 ? html`<button type="button" class="btn" data-step-next>${t(ctx, 'Weiter')}</button>` : html`<button class="btn" type="submit">${form.settings.submitLabel || t(ctx, 'Senden')}</button>`
              }</div>`
            : ''
        }</fieldset>`,
    )}
    ${turnstile ? html`<div class="cf-turnstile" data-sitekey="${env.turnstile.siteKey}"></div>` : ''}
    ${multi ? '' : html`<div><button class="btn" type="submit">${form.settings.submitLabel || t(ctx, 'Senden')}</button></div>`}
    <p class="muted" style="font-size:var(--step-n1);margin:0">${raw(t(ctx, 'Mit dem Absenden werden deine Angaben zur Bearbeitung der Anfrage gespeichert. Mehr in der <a href="/datenschutz">Datenschutzerklärung</a>.'))}</p>
  </form>`;
}

/* ---------- Teaser renderers (shared with list pages) ---------- */

/** Without a photo a card shows the first letter in the display face – deliberate, not a broken image. */
const noPhoto = (title: string) => html`<div class="ph ph-empty" aria-hidden="true">${(title.trim()[0] ?? '·').toUpperCase()}</div>`;

/** Small «Mitglieder» tag on teasers of members-only posts. */
function lockTag(ctx: RenderContext, d: EntryData): Html {
  const a = entryAccess(d);
  return a === 'public' ? html`` : html` <span class="lock-tag">${a === 'paid' ? t(ctx, 'Mitgliedschaft') : t(ctx, 'Mitglieder')}</span>`;
}

export async function postTeasers(ctx: RenderContext, items: Awaited<ReturnType<typeof publishedEntries>>['items'], layout: string): Promise<Html> {
  const posts = ctx.collections.find((c) => c.id === 'posts')!;
  await ctx.preloadMedia(items.map((i) => i.data.cover));
  const date = (i: (typeof items)[number]) => {
    const d = (i.data.date as string) || i.published_at;
    return d ? html`<time datetime="${new Date(d).toISOString().slice(0, 10)}">${new Date(d).toLocaleDateString(L(ctx), { day: 'numeric', month: 'long', year: 'numeric' })}</time>` : html`<span></span>`;
  };
  if (layout === 'list')
    return html`<ul class="posts-list">${items.map(
      (i) =>
        html`<li>${date(i)}<a href="${entryPath(posts, i.slug)}">${hx(ctx, html`${i.data.title}${lockTag(ctx, i.data)}`)}${
          i.data.excerpt ? html`<p>${i.data.excerpt as string}</p>` : ''
        }</a></li>`,
    )}</ul>`;
  const cards = await Promise.all(
    items.map(async (i, idx) => {
      const img = await ctx.media(i.data.cover);
      return html`<a class="card" href="${entryPath(posts, i.slug)}">${
        img ? html`<div class="ph">${picture(img, { sizes: layout === 'feature' && idx === 0 ? '(min-width: 56rem) 60vw, 100vw' : '(min-width: 56rem) 30vw, 100vw', maxWidth: 1600, ratio: '3/2' })}</div>` : ''
      }<div><span class="label">${(i.data.category as string) || ''}</span>${hx(ctx, html`${i.data.title}${lockTag(ctx, i.data)}`)}${
        i.data.excerpt ? html`<p>${i.data.excerpt as string}</p>` : ''
      }<p class="muted" style="margin-top:.5rem">${date(i)} · ${t(ctx, '{min} Min. Lesezeit', { min: readingTime(blocksText(i.data.blocks)) })}</p></div></a>`;
    }),
  );
  return html`<div class="cards ${layout === 'feature' ? 'feature' : ''}">${cards}</div>`;
}

/** Five stars filled to the average (4.5 → four and a half), for the eye only – the label goes on the parent. */
export const starsMeter = (n: number) =>
  html`<span class="stars-m" aria-hidden="true">★★★★★<span style="width:${Math.round(Math.max(0, Math.min(5, n)) * 20)}%">★★★★★</span></span>`;

export async function productCards(ctx: RenderContext, items: Awaited<ReturnType<typeof publishedEntries>>['items']): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'products')!;
  await ctx.preloadMedia(items.map((i) => (i.data.images as string[])?.[0]));
  // Customers' stars, when reviews are on and there are some.
  const ratings = ctx.settings.shop.reviews ? await ratingSummaries(items.map((i) => i.id)) : new Map<string, { average: number; count: number }>();
  const cards = await Promise.all(
    items.map(async (i) => {
      const img = await ctx.media((i.data.images as string[])?.[0]);
      const variants = (i.data.variants as { price?: number; stock?: number }[]) ?? [];
      const stock = variants.length ? variants.reduce((s, v) => s + (v.stock ?? 999), 0) : (i.data.stock as number | null | undefined);
      const soldOut = stock === 0;
      const prices = variants.map((v) => v.price ?? (i.data.price as number));
      const from = prices.length && new Set(prices).size > 1 ? Math.min(...prices) : null;
      const r = ratings.get(i.id);
      const rated = r
        ? html`<p class="card-stars" role="img" aria-label="${r.count === 1 ? t(ctx, '{n} von 5 Sternen, 1 Bewertung', { n: r.average.toLocaleString(L(ctx)) }) : t(ctx, '{n} von 5 Sternen, {count} Bewertungen', { n: r.average.toLocaleString(L(ctx)), count: r.count })}">${starsMeter(r.average)} <span aria-hidden="true">${r.count}</span></p>`
        : '';
      return html`<a class="card" href="${entryPath(c, i.slug)}">${img ? html`<div class="ph">${picture(img, { sizes: '(min-width: 56rem) 25vw, 50vw', maxWidth: 960, ratio: '4/5' })}</div>` : noPhoto(i.data.title)}<div>${hx(ctx, i.data.title)}${rated}<div class="price-row">${
        from !== null ? html`<span>${t(ctx, 'ab {price}', { price: formatPrice(from) })}</span>` : html`<span>${formatPrice(i.data.price as number)}</span>`
      }${i.data.comparePrice ? html`<s>${formatPrice(i.data.comparePrice as number)}</s>` : ''}${soldOut ? html` <span class="badge">${t(ctx, 'Ausverkauft')}</span>` : ''}</div></div></a>`;
    }),
  );
  return html`<div class="cards products">${cards}</div>`;
}

export async function projectCards(ctx: RenderContext, items: Awaited<ReturnType<typeof publishedEntries>>['items']): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'projects')!;
  await ctx.preloadMedia(items.map((i) => i.data.cover));
  return html`<div class="proj">${await Promise.all(
    items.map(async (i) => {
      const img = await ctx.media(i.data.cover);
      return html`<a class="card" href="${entryPath(c, i.slug)}">${img ? html`<div class="ph">${picture(img, { sizes: '(min-width: 56rem) 45vw, 100vw', maxWidth: 1600, ratio: '4/3' })}</div>` : noPhoto(i.data.title)}<div class="meta"><span>${
        (i.data.client as string) || (i.data.category as string) || ''
      }</span><span>${(i.data.year as number) || ''}</span></div>${hx(ctx, i.data.title)}${i.data.summary ? html`<p>${i.data.summary as string}</p>` : ''}</a>`;
    }),
  )}</div>`;
}

export async function profileCards(ctx: RenderContext, items: Awaited<ReturnType<typeof publishedEntries>>['items']): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'profiles')!;
  const { day } = zonedNow(ctx.settings.timezone, ctx.now);
  await ctx.preloadMedia(items.map((i) => (i.data.images as string[])?.[0]));
  return html`<div class="prof">${await Promise.all(
    items.map(async (i) => {
      const img = await ctx.media((i.data.images as string[])?.[0]);
      const today = ((i.data.availability as string[]) ?? []).includes(String(day));
      return html`<a class="card" href="${entryPath(c, i.slug)}">${img ? html`<div class="ph">${picture(img, { sizes: '(min-width: 56rem) 22vw, 50vw', maxWidth: 960, ratio: '3/4' })}</div>` : noPhoto(i.data.title)}${hx(ctx, i.data.title)}${
        i.data.availableNow ? html`<span class="avail">${t(ctx, 'Gerade verfügbar')}</span>` : today ? html`<span class="avail">${t(ctx, 'Heute da')}</span>` : ''
      }${(i.data.languages as string[])?.length ? html`<p>${(i.data.languages as string[]).join(' · ')}</p>` : ''}</a>`;
    }),
  )}</div>`;
}

export function dishPrices(prices: { label?: string; price: number }[]): Html {
  return join(
    (prices ?? []).map((p) => (p.label ? html`<small>${p.label}</small> ${formatPrice(p.price)}` : html`${formatPrice(p.price)}`)),
    ' · ',
  );
}

/** Own fields on dishes: short values join the line under the dish («Herkunft: Thurgau»). */
function ownMarks(fields: FieldDef[], d: P): Html[] {
  return fields.flatMap((f) => {
    const v = d[f.key];
    if (f.private || v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) return [];
    const opt = (x: unknown) => f.options?.find((o) => o.value === x)?.label ?? String(x);
    switch (f.type) {
      case 'boolean':
        return [html`${f.label}`];
      case 'money':
        return [html`${f.label}: ${formatPrice(v as number)}`];
      case 'tags':
      case 'multiselect':
        return [html`${f.label}: ${(v as unknown[]).map(opt).join(', ')}`];
      case 'text':
      case 'number':
      case 'select':
      case 'textarea':
        return [html`${f.label}: ${opt(v)}`];
      default:
        return [];
    }
  });
}

export async function renderMenu(ctx: RenderContext, p: P): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'dishes');
  if (!c) return html``;
  const { items } = await publishedEntries(c, { limit: 500, sortField: 'sort', sortDir: 'asc' });
  const wanted = ((p.categories as string[]) ?? []).map((x) => x.toLowerCase());
  const visible = items.filter((i) => !wanted.length || wanted.includes(String(i.data.category ?? '').toLowerCase()));
  if (!visible.length) return empty(ctx, 'Noch keine Gerichte. Leg sie unter «Inhalte → Gerichte» an.');
  const showAllergens = p.allergens !== false && ctx.settings.menu.showAllergens;
  const usedAllergens = new Set<string>();
  const allergenLabel = (a: string, kind: 'label' | 'short') => {
    const x = ALLERGENS.find((y) => y.value === a);
    return x ? t(ctx, x[kind]) : a;
  };
  const origins: string[] = [];

  const dish = (i: (typeof items)[number]) => {
    const d = i.data as P;
    const allergens = (d.allergens as string[]) ?? [];
    allergens.forEach((a) => usedAllergens.add(a));
    if (d.origin) origins.push(`${d.title}: ${d.origin}`);
    const tags = ((d.tags as string[]) ?? []).map((tag) => {
      const label = DISH_TAGS.find((x) => x.value === tag)?.label;
      return label ? t(ctx, label) : tag;
    });
    const marks = [
      ...tags.map((tag) => html`<b>${tag}</b>`),
      ...ownMarks(c.custom_fields ?? [], d),
      ...(showAllergens && allergens.length ? [html`${t(ctx, 'Allergene: {list}', { list: allergens.map((a) => allergenLabel(a, 'short')).join(', ') })}`] : []),
    ];
    return html`<li class="${cx('dish', d.soldOut && 'out')}"><div class="dish-head"><span class="dish-name">${d.title}</span><span class="dish-lead" aria-hidden="true"></span><span class="dish-price">${dishPrices(d.prices)}</span></div>${
      d.description ? html`<p>${d.description}</p>` : ''
    }${marks.length ? html`<div class="marks">${join(marks, ' · ')}</div>` : ''}${d.soldOut ? html`<span class="sr">${t(ctx, 'Heute ausverkauft')}</span>` : ''}</li>`;
  };

  const daily = p.daily !== false ? visible.filter((i) => i.data.daily) : [];
  const groups = new Map<string, typeof items>();
  for (const i of visible) {
    if (daily.includes(i)) continue;
    const cat = String(i.data.category || t(ctx, 'Weiteres'));
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(i);
  }
  const today = new Date().toLocaleDateString(L(ctx), { weekday: 'long', day: 'numeric', month: 'long', timeZone: ctx.settings.timezone });
  return html`${
    daily.length
      ? html`<section class="daily" aria-labelledby="daily-h"><span class="label">${today}</span>${hx(ctx, ctx.settings.menu.dailyTitle || t(ctx, 'Heute'), raw(' id="daily-h"'))}<ul class="mn-items">${daily.map(dish)}</ul></section>`
      : ''
  }${[...groups].map(
    ([cat, list]) =>
      html`<section class="mn-cat">${hx(ctx, cat)}<ul class="${cx('mn-items', list.length > 5 && 'two')}">${list.map(dish)}</ul></section>`,
  )}<div class="mn-legend">${
    showAllergens && usedAllergens.size
      ? html`<p style="margin:0">${t(ctx, 'Allergene: {list}. Bei Fragen zu Allergien und Unverträglichkeiten beraten wir dich gerne.', { list: [...usedAllergens].map((a) => allergenLabel(a, 'label')).join(', ') })}</p>`
      : ''
  }${origins.length ? html`<p style="margin:0">${t(ctx, 'Herkunft: {list}.', { list: [...new Set(origins)].join(' · ') })}</p>` : ''}<p style="margin:0">${t(ctx, 'Alle Preise in CHF inkl. MwSt.')}</p></div>`;
}

/* ---------- Block renderers ---------- */

const R: Record<string, Renderer> = {
  async hero(b, ctx) {
    const p = b.props as P;
    const tag = headingTag(ctx);
    const variant = p.variant ?? 'statement';
    const img = variant === 'statement' ? null : await ctx.media(p.image);
    if (img && ctx.blockIndex === 0) ctx.lcpImage = variantUrl(img, 1280, 'avif');
    const eyebrow = p.eyebrow || ctx.edit ? html`<p class="label eyebrow"${field(ctx.edit, 'eyebrow')}>${p.eyebrow}</p>` : '';
    const title = raw(`<${tag} class="h"${field(ctx.edit, 'title')}>${esc(p.title)}</${tag}>`);
    const lead = p.text || ctx.edit ? html`<p class="lead"${field(ctx.edit, 'text', 'multi')}>${lines(p.text)}</p>` : '';
    const actions =
      p.primary?.href || p.secondary?.href ? html`<div class="actions">${btn(p.primary, true, ctx.edit, 'primary')}${btn(p.secondary, false, ctx.edit, 'secondary')}</div>` : '';
    if (variant === 'cover' && img)
      return html`<div class="hero hero-cover-inner"><div class="cover-media">${picture(img, { sizes: '100vw', priority: ctx.blockIndex === 0 })}</div><div class="wrap"><div class="cover-panel">${eyebrow}${title}${lead}${actions}</div></div></div>`;
    if (variant === 'split')
      return html`<div class="wrap hero hero-split"><div>${eyebrow}${title}${lead}${actions}</div>${
        img ? picture(img, { sizes: '(min-width: 56rem) 45vw, 100vw', priority: ctx.blockIndex === 0, maxWidth: 1600 }) : empty(ctx, 'Bild auswählen')
      }</div>`;
    return html`<div class="wrap hero">${eyebrow}${title}${lead}${actions}</div>`;
  },

  text(b, ctx) {
    const p = b.props as P;
    return html`<div class="${cx('wrap text-block', p.align === 'center' && 'center')}">${
      p.heading || ctx.edit ? html`<h2 class="text-head"${field(ctx.edit, 'heading')}>${p.heading}</h2>` : ''
    }<div class="${cx('prose', p.width === 'wide' && 'wide', p.align === 'center' && 'center')}"${field(ctx.edit, 'body', 'rich')}>${raw(p.body)}</div></div>`;
  },

  async split(b, ctx) {
    const p = b.props as P;
    const img = await ctx.media(p.image);
    return html`<div class="${cx('wrap split', p.side === 'left' && 'img-left', !img && !ctx.edit && 'no-media')}"><div>${
      p.eyebrow || ctx.edit ? html`<p class="label"${field(ctx.edit, 'eyebrow')}>${p.eyebrow}</p>` : ''
    }<h2${field(ctx.edit, 'heading')}>${p.heading}</h2><div class="prose"${field(ctx.edit, 'body', 'rich')}>${raw(p.body)}</div>${
      p.link?.href ? html`<div class="actions">${btn(p.link, false, ctx.edit, 'link')}</div>` : ''
    }</div>${img || ctx.edit ? html`<div class="split-media">${img ? picture(img, { sizes: '(min-width: 52rem) 45vw, 100vw', maxWidth: 1600 }) : empty(ctx, 'Bild auswählen')}</div>` : ''}</div>`;
  },

  async image(b, ctx) {
    const p = b.props as P;
    const img = await ctx.media(p.image);
    if (!img) return empty(ctx, 'Klick hier und wähle ein Bild aus der Mediathek.');
    if (ctx.blockIndex === 0) ctx.lcpImage = variantUrl(img, 1280, 'avif');
    const ratio = p.ratio && p.ratio !== 'auto' ? p.ratio : undefined;
    const size = p.size ?? 'wide';
    const sizes = size === 'content' ? '(min-width: 40rem) 38rem, 100vw' : size === 'full' ? '100vw' : '(min-width: 78rem) 78rem, 100vw';
    const fig = html`<figure class="fig fig-${size}">${picture(img, { sizes, ratio, priority: ctx.blockIndex === 0 })}${
      p.caption || ctx.edit ? html`<figcaption${field(ctx.edit, 'caption')}>${p.caption}</figcaption>` : ''
    }</figure>`;
    return size === 'full' ? fig : html`<div class="wrap">${fig}</div>`;
  },

  async gallery(b, ctx) {
    const p = b.props as P;
    const ids = (p.images as string[]) ?? [];
    await ctx.preloadMedia(ids);
    const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
    if (!imgs.length) return html`${heading(ctx, p)}${empty(ctx, 'Wähle Bilder für die Galerie aus.')}`;
    ctx.needs.add('lightbox');
    const layout = p.layout ?? 'grid';
    const sizes = layout === 'strip' ? '(min-width: 40rem) 26rem, 78vw' : '(min-width: 56rem) 25vw, 50vw';
    return html`<div class="wrap">${heading(ctx, p)}<div class="gal gal-${layout}" data-lightbox>${imgs.map(
      (m) =>
        html`<a href="${variantUrl(m, 1920, 'webp')}" data-caption="${m.caption || m.alt}">${picture(m, { sizes, maxWidth: layout === 'mosaic' ? 960 : 1280 })}</a>`,
    )}</div></div>`;
  },

  async video(b, ctx) {
    const p = b.props as P;
    const poster = await ctx.media(p.poster);
    const caption = p.caption || ctx.edit ? html`<figcaption${field(ctx.edit, 'caption')}>${p.caption}</figcaption>` : '';
    if (p.file) {
      const file = await ctx.media(p.file);
      if (file?.mime.startsWith('video/')) {
        // Web versions when they are ready (largest first, for wide screens), the original as the last resort.
        const v = file.video?.status === 'ready' ? file.video : null;
        const versions = [...(v?.renditions ?? [])].sort((a, b) => b.p - a.p);
        const sources = versions.map((r, i) =>
          i < versions.length - 1
            ? html`<source src="/media/${file.id}/video/${r.p}.mp4" type="video/mp4" media="(min-width: ${r.p >= 1080 ? 1200 : 720}px)">`
            : html`<source src="/media/${file.id}/video/${r.p}.mp4" type="video/mp4">`,
        );
        const posterUrl = poster ? variantUrl(poster, 1280, 'webp') : v?.poster ? `/media/${file.id}/video/${v.poster.split('/').pop()}` : '';
        const size = v?.width && v.height ? raw(` width="${v.width}" height="${v.height}"${v.duration ? ` data-duration="${v.duration}"` : ''}`) : '';
        return html`<div class="wrap"><figure><video class="vid" controls preload="none" playsinline${size}${posterUrl ? raw(` poster="${posterUrl}"`) : ''}>${sources}<source src="${originalUrl(file)}" type="${file.mime}"></video>${caption}</figure></div>`;
      }
    }
    const embed = p.url ? videoEmbed(p.url) : null;
    if (!embed) return empty(ctx, 'Füge einen YouTube- oder Vimeo-Link ein oder lade ein Video hoch.');
    if (!ctx.settings.consent[embed.provider]) return html``;
    ctx.needs.add('consent');
    return html`<div class="wrap"><figure>${consentBox(ctx, embed.provider, embed.src, p.caption || t(ctx, 'Video'), poster ? picture(poster, { sizes: '(min-width: 78rem) 78rem, 100vw' }) : html``)}${caption}</figure></div>`;
  },

  list(b, ctx) {
    const p = b.props as P;
    const style = p.style ?? 'numbered';
    const items = (p.items as P[]) ?? [];
    return html`<div class="wrap">${heading(ctx, p, 'heading', 'intro')}<ol class="lst lst-${style}">${items.map(
      (it, i) =>
        html`<li${it.icon ? raw(' class="has-ico"') : ''}>${it.icon ? html`<span class="lst-ico">${raw(siteIconSvg(it.icon))}</span>` : ''}<div>${hx(ctx, it.title, field(ctx.edit, `items.${i}.title`))}${
          style === 'rows' ? '' : it.text || ctx.edit ? html`<p${field(ctx.edit, `items.${i}.text`, 'multi')}>${lines(it.text)}</p>` : ''
        }${style === 'columns' && it.meta ? html`<span class="meta">${it.meta}</span>` : ''}</div>${
          style === 'rows'
            ? html`<span class="meta"${field(ctx.edit, `items.${i}.meta`)}>${it.meta}</span>${it.text ? html`<p${field(ctx.edit, `items.${i}.text`, 'multi')}>${lines(it.text)}</p>` : ''}`
            : ''
        }</li>`,
    )}</ol></div>`;
  },

  cta(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap cta"><div><h2${field(ctx.edit, 'heading')}>${p.heading}</h2>${
      p.text || ctx.edit ? html`<p style="margin-top:1rem"${field(ctx.edit, 'text', 'multi')}>${lines(p.text)}</p>` : ''
    }</div><div class="actions">${btn(p.primary, true, ctx.edit, 'primary')}${btn(p.secondary, false, ctx.edit, 'secondary')}</div></div>`;
  },

  faq(b, ctx) {
    const p = b.props as P;
    const items = (p.items as P[]) ?? [];
    if (items.length && !ctx.edit)
      ctx.jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: stripHtml(i.a ?? '') } })),
      });
    return html`<div class="wrap">${heading(ctx, p)}<div class="faq">${items.map(
      (i, idx) =>
        html`<details${ctx.edit && idx === 0 ? raw(' open') : ''}><summary><span${field(ctx.edit, `items.${idx}.q`)}>${i.q}</span></summary><div class="ans prose"${field(ctx.edit, `items.${idx}.a`, 'rich')}>${raw(i.a)}</div></details>`,
    )}</div></div>`;
  },

  testimonials(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap">${heading(ctx, p)}<div class="tst">${((p.items as P[]) ?? []).map(
      (i, idx) =>
        html`<blockquote><p${field(ctx.edit, `items.${idx}.quote`, 'multi')}>${i.quote}</p><footer><strong${field(ctx.edit, `items.${idx}.name`)}>${i.name}</strong>${
          i.role ? html`<span class="muted">${i.role}</span>` : ''
        }</footer></blockquote>`,
    )}</div></div>`;
  },

  quote(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap qt"><blockquote><p${field(ctx.edit, 'quote', 'multi')}>${p.quote}</p>${
      p.name || ctx.edit
        ? html`<footer><strong${field(ctx.edit, 'name')}>${p.name}</strong><span class="muted"${field(ctx.edit, 'role')}>${p.role}</span></footer>`
        : ''
    }</blockquote></div>`;
  },

  async columns(b, ctx) {
    const p = b.props as P;
    const items = (p.items as P[]) ?? [];
    const count = ['2', '3', '4'].includes(p.count) ? p.count : '3';
    const sizes = count === '2' ? '(min-width: 56rem) 38rem, 100vw' : count === '3' ? '(min-width: 56rem) 25rem, 100vw' : '(min-width: 56rem) 19rem, 50vw';
    const head = heading(ctx, p, 'heading', 'intro'); // first: it decides the level of the column titles
    const cols = await Promise.all(
      items.map(async (it, i) => {
        const img = await ctx.media(it.image);
        const icon = !img && it.icon ? html`<span class="col-ico">${raw(siteIconSvg(it.icon))}</span>` : '';
        return html`<div class="col">${img ? html`<div class="ph">${picture(img, { sizes, maxWidth: 960, ratio: '3/2' })}</div>` : icon}${hx(ctx, it.title, field(ctx.edit, `items.${i}.title`))}${
          it.text || ctx.edit ? html`<p${field(ctx.edit, `items.${i}.text`, 'multi')}>${lines(it.text)}</p>` : ''
        }${it.link?.href ? btn(it.link, false, ctx.edit, `items.${i}.link`) : ''}</div>`;
      }),
    );
    return html`<div class="wrap">${head}<div class="cols cols-${count}">${cols}</div></div>`;
  },

  timeline(b, ctx) {
    const p = b.props as P;
    const items = (p.items as P[]) ?? [];
    return html`<div class="wrap">${heading(ctx, p)}<ol class="tl">${items.map(
      (it, i) =>
        html`<li><span class="tl-when"${field(ctx.edit, `items.${i}.when`)}>${it.when}</span><div>${hx(ctx, it.title, field(ctx.edit, `items.${i}.title`))}${
          it.text || ctx.edit ? html`<p${field(ctx.edit, `items.${i}.text`, 'multi')}>${lines(it.text)}</p>` : ''
        }</div></li>`,
    )}</ol></div>`;
  },

  table(b, ctx) {
    const p = b.props as P;
    // Empty headings drop their column – unless a row still has something in it.
    const rows = (p.rows as P[]) ?? [];
    const keys = (['a', 'b', 'c', 'd'] as const).filter((k, i) => i === 0 || p[`h${i + 1}`] || rows.some((r) => r[k]));
    const head = keys.map((_, i) => String(p[`h${['a', 'b', 'c', 'd'].indexOf(keys[i]) + 1}`] ?? ''));
    const last = keys.length - 1;
    const cell = (i: number) => cx(i === last && p.right !== false && keys.length > 1 && 'num');
    return html`<div class="wrap">${heading(ctx, p)}<div class="tbl-wrap"><table class="tbl">${
      head.some(Boolean) ? html`<thead><tr>${head.map((h, i) => html`<th scope="col" class="${cell(i)}">${h}</th>`)}</tr></thead>` : ''
    }<tbody>${rows.map(
      (r) =>
        html`<tr>${keys.map((k, i) =>
          i === 0 ? html`<th scope="row">${r[k]}</th>` : html`<td class="${cell(i)}" data-label="${head[i]}">${r[k]}</td>`,
        )}</tr>`,
    )}</tbody></table></div>${p.note || ctx.edit ? html`<p class="tbl-note"${field(ctx.edit, 'note')}>${p.note}</p>` : ''}</div>`;
  },

  async compare(b, ctx) {
    const p = b.props as P;
    const [before, after] = await Promise.all([ctx.media(p.before), ctx.media(p.after)]);
    if (!before || !after) return empty(ctx, 'Wähl ein Bild für vorher und eins für nachher.');
    ctx.needs.add('compare');
    const opts = { sizes: '(min-width: 78rem) 78rem, 100vw', maxWidth: 1920 };
    const a = p.beforeLabel || t(ctx, 'Vorher');
    const z = p.afterLabel || t(ctx, 'Nachher');
    return html`<div class="wrap">${heading(ctx, p)}<figure class="cmp-fig"><div class="cmp" style="--pos:50%">${picture(after, opts)}<div class="cmp-before" aria-hidden="true">${picture(before, opts)}</div><span class="cmp-label cmp-a">${a}</span><span class="cmp-label cmp-z">${z}</span><input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="${t(
      ctx,
      '{a} und {z} vergleichen',
      { a, z },
    )}"></div>${p.caption || ctx.edit ? html`<figcaption${field(ctx.edit, 'caption')}>${p.caption}</figcaption>` : ''}</figure></div>`;
  },

  notice(b, ctx) {
    const p = b.props as P;
    // Today in the site's time zone, as YYYY-MM-DD; «until» counts the whole day.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ctx.now ?? new Date());
    const shown = (!p.from || today >= p.from) && (!p.until || today <= p.until);
    if (!shown && !ctx.edit) return html``;
    const when = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(L(ctx), { day: 'numeric', month: 'long', year: 'numeric' });
    const hint =
      ctx.edit && (p.from || p.until)
        ? html`<span class="ntc-when">${
            shown ? t(ctx, 'Sichtbar') : t(ctx, 'Gerade nicht sichtbar')
          } · ${p.from && p.until ? t(ctx, '{from} bis {until}', { from: when(p.from), until: when(p.until) }) : p.from ? t(ctx, 'ab {from}', { from: when(p.from) }) : t(ctx, 'bis {until}', { until: when(p.until) })}</span>`
        : '';
    return html`<div class="wrap"><div class="ntc ntc-${p.tone === 'quiet' ? 'quiet' : 'accent'}" role="note"><p${field(ctx.edit, 'text', 'multi')}>${lines(p.text)}</p>${
      p.link?.href ? btn(p.link, false, ctx.edit, 'link') : ''
    }${hint}</div></div>`;
  },

  async downloads(b, ctx) {
    const p = b.props as P;
    const files = (await Promise.all(((p.files as P[]) ?? []).map(async (f) => ({ f, m: await ctx.media(f.file) })))).filter((x) => x.m && !(x.m as { private?: boolean }).private);
    if (!files.length) return ctx.edit ? html`<div class="wrap">${heading(ctx, p)}${empty(ctx, 'Füg Dateien aus der Mediathek hinzu.')}</div>` : html``;
    const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toLocaleString(L(ctx), { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    const kind = (name: string) => (name.split('.').pop() ?? '').toUpperCase();
    return html`<div class="wrap">${heading(ctx, p)}<ul class="dl">${files.map(
      ({ f, m }) =>
        html`<li><a href="${originalUrl(m!)}" download><span class="dl-title">${f.title || m!.filename}</span><span class="dl-meta">${kind(m!.filename)} · ${size(m!.size)}</span>${
          f.text ? html`<span class="dl-text">${f.text}</span>` : ''
        }</a></li>`,
    )}</ul></div>`;
  },

  stats(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap">${heading(ctx, p)}<div class="stats">${((p.items as P[]) ?? []).map(
      (i, idx) => html`<div><strong${field(ctx.edit, `items.${idx}.value`)}>${i.value}</strong><span${field(ctx.edit, `items.${idx}.label`)}>${i.label}</span></div>`,
    )}</div></div>`;
  },

  pricing(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap">${heading(ctx, p, 'heading', 'intro')}<div class="plans">${((p.plans as P[]) ?? []).map(
      (pl, i) =>
        html`<div class="${cx('plan', pl.highlight && 'hl')}">${hx(ctx, html`<span${field(ctx.edit, `plans.${i}.name`)}>${pl.name}</span>${pl.highlight ? html`<span class="tag">${t(ctx, 'Empfohlen')}</span>` : ''}`)}<div><span class="price"${field(ctx.edit, `plans.${i}.price`)}>${pl.price}</span> <span class="per">${pl.period}</span></div>${
          pl.description ? html`<p class="muted" style="margin:0">${pl.description}</p>` : ''
        }<ul>${String(pl.features ?? '')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => html`<li>${l}</li>`)}</ul>${btn(pl.link, Boolean(pl.highlight))}</div>`,
    )}</div></div>`;
  },

  async people(b, ctx) {
    const p = b.props as P;
    const items = (p.items as P[]) ?? [];
    await ctx.preloadMedia(items.map((i) => i.image));
    return html`<div class="wrap">${heading(ctx, p)}${items.length ? '' : empty(ctx, 'Füge Personen hinzu.')}<div class="ppl">${await Promise.all(
      items.map(
        async (i, idx) =>
          html`<div>${picture(await ctx.media(i.image), { sizes: '(min-width: 56rem) 22vw, 50vw', maxWidth: 960, ratio: '3/4' })}${hx(ctx, i.name, field(ctx.edit, `items.${idx}.name`))}<p class="role"${field(ctx.edit, `items.${idx}.role`)}>${i.role}</p>${
            i.text ? html`<p${field(ctx.edit, `items.${idx}.text`, 'multi')}>${i.text}</p>` : ''
          }</div>`,
      ),
    )}</div></div>`;
  },

  async logos(b, ctx) {
    const p = b.props as P;
    const ids = (p.images as string[]) ?? [];
    await ctx.preloadMedia(ids);
    const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
    return html`<div class="wrap">${p.heading || ctx.edit ? html`<p class="label" style="margin-bottom:1.5rem"${field(ctx.edit, 'heading')}>${p.heading}</p>` : ''}${
      imgs.length ? html`<div class="logos">${imgs.map((m) => picture(m, { sizes: '10rem', maxWidth: 480 }))}</div>` : empty(ctx, 'Lade Logos hoch.')
    }</div>`;
  },

  buttons(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap"><div class="actions" style="${p.align === 'center' ? 'justify-content:center;' : ''}margin:0">${((p.items as P[]) ?? []).map((l, i) =>
      btn(l as LinkValue, i === 0),
    )}</div></div>`;
  },

  divider(b, ctx) {
    const v = (b.props as P).variant ?? 'line';
    if (v === 'space') return html`<div class="dv-space"></div>`;
    if (v === 'ornament') return html`<div class="wrap dv-orn" aria-hidden="true">${ctx.theme.ornament}</div>`;
    return html`<div class="wrap dv-line"><hr></div>`;
  },

  async form(b, ctx) {
    const p = b.props as P;
    const form = await getForm(p.form);
    if (!form) return html`<div class="wrap">${heading(ctx, p, 'heading', 'intro')}${empty(ctx, 'Wähle ein Formular aus oder leg unter «Inhalte → Formulare» eines an.')}</div>`;
    return html`<div class="wrap form-grid">${heading(ctx, p, 'heading', 'intro')}${renderForm(form, ctx, b.id)}</div>`;
  },

  async booking(b, ctx) {
    const p = b.props as P;
    const s = ctx.settings;
    const head = heading(ctx, p, 'heading', 'intro');
    if (!s.modules.includes('booking')) return html`<div class="wrap">${head}${empty(ctx, 'Aktiviere «Reservation & Termine» unter Einstellungen → Module.')}</div>`;
    const services = (await listServices(true)).filter((x) => !p.service || x.id === p.service);
    if (!services.length) return html`<div class="wrap">${head}${empty(ctx, 'Lege unter Einstellungen → Reservation zuerst fest, was gebucht werden kann.')}</div>`;
    return html`<div class="wrap bk" id="buchen">${head}${await bookingSteps(ctx, services, String(p.service ?? ''))}</div>`;
  },

  newsletter(b, ctx) {
    const p = b.props as P;
    const head = heading(ctx, p, 'heading', 'intro');
    if (!ctx.settings.modules.includes('newsletter')) return html`<div class="wrap">${head}${empty(ctx, 'Aktiviere «Newsletter» unter Einstellungen → Module.')}</div>`;
    const done = ctx.query.get('nl') === b.id;
    const error = ctx.query.get('nl_err') === b.id ? ctx.query.get('meldung') : null;
    const id = (n: string) => `nl-${b.id}-${n}`;
    return html`<div class="wrap nl" id="${id('box')}">${head}${
      done
        ? html`<p class="form-ok" role="status">${t(ctx, 'Fast geschafft: Wir haben dir eine E-Mail geschickt. Ein Klick auf den Link darin, und du bist dabei.')}</p>`
        : html`<form class="nl-form${p.askName ? ' with-name' : ''}" method="post" action="/_nova/newsletter">
      ${error ? html`<p class="form-err" role="alert">${error}</p>` : ''}
      <input type="hidden" name="_page" value="${ctx.path}"><input type="hidden" name="_block" value="${b.id}"><input type="hidden" name="_t" value="${Date.now().toString(36)}">
      <div class="hp" aria-hidden="true"><label>${t(ctx, 'Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      ${p.askName ? html`<div class="fld"><label for="${id('name')}">${t(ctx, 'Vorname')}</label><input id="${id('name')}" name="name" autocomplete="given-name" maxlength="80"></div>` : ''}
      <div class="fld"><label for="${id('email')}">${t(ctx, 'E-Mail')}</label><input id="${id('email')}" type="email" name="email" required autocomplete="email" maxlength="200" placeholder="${t(ctx, 'du@beispiel.ch')}"></div>
      <button class="btn" type="submit">${p.button || t(ctx, 'Anmelden|Newsletter')}</button>
    </form>
    <p class="nl-note">${t(ctx, 'Du bekommst zuerst eine E-Mail zum Bestätigen. Abmelden geht jederzeit.')} <a href="/datenschutz">${t(ctx, 'Datenschutz')}</a></p>`
    }</div>`;
  },

  async events(b, ctx) {
    const p = b.props as P;
    const source = p.source === 'courses' ? 'courses' : 'events';
    const head = heading(ctx, p, 'heading', 'intro');
    const col = ctx.collections.find((c) => c.id === source);
    if (!col) return html`<div class="wrap">${head}${empty(ctx, `Aktiviere «${source === 'courses' ? 'Kurse' : 'Events & Tickets'}» unter Einstellungen → Module.`)}</div>`;
    const items = await upcoming(source, ctx.settings.timezone, { limit: Math.min(24, Number(p.count) || 4), category: (p.category as string) || undefined });
    return html`<div class="wrap">${head}${await eventCards(ctx, col, items)}${
      col.list_route ? html`<p class="ev-more"><a class="btn-2" href="${col.list_route}">${t(ctx, 'Alle {name}', { name: col.name })}</a></p>` : ''
    }</div>`;
  },

  async properties(b, ctx) {
    const p = b.props as P;
    const head = heading(ctx, p, 'heading', 'intro');
    const col = ctx.collections.find((c) => c.id === 'properties');
    if (!col) return html`<div class="wrap">${head}${empty(ctx, 'Aktiviere «Immobilien» unter Einstellungen → Module.')}</div>`;
    const items = await findProperties({ offer: p.offer === 'rent' || p.offer === 'buy' ? p.offer : '' }, { limit: Math.min(12, Number(p.count) || 3) });
    if (!items.length) return html`<div class="wrap">${head}${empty(ctx, 'Noch keine Objekte. Leg sie unter «Inhalte → Immobilien» an.')}</div>`;
    return html`<div class="wrap">${head}${await propertyCards(ctx, items)}<p class="ev-more"><a class="btn-2" href="${col.list_route}">${t(ctx, 'Alle Objekte')}</a></p></div>`;
  },

  async donate(b, ctx) {
    const p = b.props as P;
    const head = heading(ctx, p, 'heading', 'intro');
    if (!ctx.settings.modules.includes('donations')) return html`<div class="wrap">${head}${empty(ctx, 'Aktiviere «Spenden» unter Einstellungen → Module.')}</div>`;
    return donateBlock(ctx, b.id, p, head);
  },

  membership(b, ctx) {
    const p = b.props as P;
    const head = heading(ctx, p, 'heading', 'intro');
    if (!ctx.settings.modules.includes('members')) return html`<div class="wrap">${head}${empty(ctx, 'Aktiviere «Mitglieder» unter Einstellungen → Module.')}</div>`;
    return membershipBox(ctx, p, head);
  },

  contact(b, ctx) {
    const p = b.props as P;
    const s = ctx.settings;
    const biz = s.business;
    const mapsQuery = encodeURIComponent([biz.street, biz.zip, biz.city].filter(Boolean).join(', '));
    const status = openStatus(s.hours, s.timezone, ctx.now, ctx.lang);
    return html`<div class="wrap">${heading(ctx, p, 'heading', 'text')}<div class="contact"><div><address>${biz.legalName || s.name}<br>${
      biz.street ? html`${biz.street}<br>` : ''
    }${biz.zip} ${biz.city}${biz.phone ? html`<br><a href="tel:${biz.phone.replace(/[^+\d]/g, '')}">${biz.phone}</a>` : ''}${
      biz.email ? html`<br><a href="mailto:${biz.email}">${biz.email}</a>` : ''
    }</address>${
      mapsQuery ? html`<p style="margin-top:1rem"><a class="btn-2" href="https://www.openstreetmap.org/search?query=${raw(mapsQuery)}" rel="noopener">${t(ctx, 'Route planen')}</a></p>` : ''
    }</div>${
      p.showHours !== false && s.hours.length
        ? html`<div>${status ? html`<p class="${cx('open-now', !status.open && 'closed')}">${status.label}</p>` : ''}${hoursTable(ctx)}</div>`
        : ''
    }</div></div>`;
  },

  hours(b, ctx) {
    const p = b.props as P;
    const s = ctx.settings;
    const status = openStatus(s.hours, s.timezone, ctx.now, ctx.lang);
    return html`<div class="wrap">${heading(ctx, p)}${status ? html`<p class="${cx('open-now', !status.open && 'closed')}">${status.label}</p>` : ''}${hoursTable(ctx)}${
      s.hoursNote ? html`<p class="muted" style="margin-top:1rem">${s.hoursNote}</p>` : ''
    }</div>`;
  },

  map(b, ctx) {
    const p = b.props as P;
    const biz = ctx.settings.business as P;
    const address = p.address || [biz.street, biz.zip, biz.city].filter(Boolean).join(', ');
    if (!address) return empty(ctx, 'Trag zuerst deine Adresse unter «Einstellungen → Website» ein.');
    if (!ctx.settings.consent.maps) return html``;
    const lat = biz.lat as number | undefined;
    const lng = biz.lng as number | undefined;
    if (!lat || !lng || p.address)
      return html`<div class="wrap"><p><a class="btn-2" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}" rel="noopener">${t(ctx, '{address} auf der Karte öffnen', { address })}</a></p></div>`;
    ctx.needs.add('consent');
    const d = 0.004 * Math.pow(2, 16 - (Number(p.zoom) || 16));
    const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d * 1.6},${lat - d},${lng + d * 1.6},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
    return html`<div class="wrap">${consentBox(ctx, 'maps', src, t(ctx, 'Karte: {address}', { address }), html``, 'map')}</div>`;
  },

  async posts(b, ctx) {
    const p = b.props as P;
    const c = ctx.collections.find((x) => x.id === 'posts');
    if (!c) return empty(ctx, 'Das Blog-Modul ist nicht aktiv.');
    const { items } = await publishedEntries(c, { limit: Number(p.count) || 3, category: p.category || undefined });
    const more = c.list_route ? html`<p style="margin-top:2rem"><a class="btn-2" href="${c.list_route}">${t(ctx, 'Alle Beiträge')}</a></p>` : '';
    return html`<div class="wrap">${heading(ctx, p)}${items.length ? await postTeasers(ctx, items, p.layout ?? 'list') : empty(ctx, 'Noch keine veröffentlichten Beiträge.')}${items.length ? more : ''}</div>`;
  },

  async products(b, ctx) {
    const p = b.props as P;
    const c = ctx.collections.find((x) => x.id === 'products');
    if (!c) return empty(ctx, 'Das Shop-Modul ist nicht aktiv.');
    const { items } = await publishedEntries(c, { limit: Number(p.count) || 6, category: p.category || undefined });
    return html`<div class="wrap">${heading(ctx, p)}${items.length ? await productCards(ctx, items) : empty(ctx, 'Noch keine veröffentlichten Produkte.')}</div>`;
  },

  async menu(b, ctx) {
    const p = b.props as P;
    return html`<div class="wrap">${heading(ctx, p)}${await renderMenu(ctx, p)}</div>`;
  },

  async projects(b, ctx) {
    const p = b.props as P;
    const c = ctx.collections.find((x) => x.id === 'projects');
    if (!c) return empty(ctx, 'Das Portfolio-Modul ist nicht aktiv.');
    const active = ctx.query.get('kategorie') ?? '';
    const { items } = await publishedEntries(c, { limit: Number(p.count) || 6, category: active || undefined });
    const cats = p.filter !== false ? await categoriesOf('projects') : [];
    const filter =
      cats.length > 1
        ? html`<nav class="filters" aria-label="${t(ctx, 'Nach Kategorie filtern')}"><a href="?#b-${b.id}" aria-current="${!active}">${t(ctx, 'Alle')}</a>${cats.map(
            (cat) => html`<a href="?kategorie=${encodeURIComponent(cat)}#b-${b.id}" aria-current="${active.toLowerCase() === cat.toLowerCase()}">${cat}</a>`,
          )}</nav>`
        : '';
    return html`<div class="wrap">${heading(ctx, p)}${filter}${items.length ? await projectCards(ctx, items) : empty(ctx, 'Noch keine veröffentlichten Projekte.')}</div>`;
  },

  async profiles(b, ctx) {
    const p = b.props as P;
    const c = ctx.collections.find((x) => x.id === 'profiles');
    if (!c) return empty(ctx, 'Das Profil-Modul ist nicht aktiv.');
    let { items } = await publishedEntries(c, { limit: 100 });
    if (p.onlyAvailable) {
      const { day } = zonedNow(ctx.settings.timezone, ctx.now);
      items = items.filter((i) => i.data.availableNow || ((i.data.availability as string[]) ?? []).includes(String(day)));
    }
    return html`<div class="wrap">${heading(ctx, p)}${items.length ? await profileCards(ctx, items) : empty(ctx, 'Noch keine veröffentlichten Profile.')}</div>`;
  },

  async section(b, ctx) {
    const s = await sectionBlocks((b.props as P).section, ctx.preview);
    if (!s) return empty(ctx, 'Wähle eine wiederverwendbare Sektion aus.');
    if (ctx.depth > 2) return html``;
    // Rendered without edit attributes: the section is edited in its own editor.
    const inner = await renderBlocks(s.blocks, { ...ctx, edit: false, depth: ctx.depth + 1 });
    return ctx.edit ? html`<div class="nova-section-ref" data-nova-section="${(b.props as P).section}">${inner}</div>` : inner;
  },

  async layout(b, ctx) {
    const p = b.props as P;
    const els = (p.els as El[]) ?? [];
    // On a template page its elements are bound to the page's entry.
    const inner = await renderEls(els, ctx, { path: 'els', edit: ctx.edit, entry: ctx.entry, root: els });
    const empty = ctx.edit && !els.length ? html`<div class="el-empty">${'Leeres Layout – füg über «+» das erste Element hinzu.'}</div>` : '';
    return html`<div class="${p.width === 'full' ? 'lay lay-full' : 'wrap lay'}">${inner}${empty}</div>`;
  },

  html(b, ctx) {
    const p = b.props as P;
    const vars = new Map(((p.vars as P[]) ?? []).map((v) => [v.key, v.value ?? '']));
    const out = String(p.code ?? '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => esc(vars.get(k) ?? ''));
    const safe = ctx.settings.security.allowCustomScripts ? out : out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=/gi, ' data-x=');
    return html`<div class="wrap html-block">${raw(safe)}</div>`;
  },
};

/* ---------- free layout: one element after the other, containers recursively ---------- */

/**
 * How an element is drawn: where it sits in the props (for editing in place),
 * whether this copy can be edited, and the entry when it repeats in a CMS list.
 */
interface ElRender {
  path: string;
  edit: boolean;
  entry?: BoundEntry;
  /** One copy of a CMS list's template (all but the first in the editor are ghosts). */
  list?: boolean;
  /** A repeat only for the eye (the second run of a marquee): no id, no handles. */
  copy?: boolean;
  /** Extra attributes for this one element (a tab's panel). */
  extra?: string;
  /** Inside a component instance in the editor: where its own texts go (they are written in place). */
  over?: string;
  /** Components inside components – stops loops. */
  depth?: number;
  /** Inside a link (a linked container): no forms or buttons in there. */
  inLink?: boolean;
  /** All elements of the layout (a filter finds the loop it narrows down). */
  root?: El[];
  /** Customers' stars of the products in a loop, fetched once for all of them. */
  ratings?: Map<string, { average: number; count: number }>;
}

/** Elements one after the other; `start` is the index of the first in its container. */
async function renderEls(els: El[], ctx: RenderContext, rc: ElRender, start = 0): Promise<Html> {
  const out: Html[] = [];
  for (let i = 0; i < els.length; i++) out.push(await renderEl(els[i], ctx, { ...rc, extra: undefined, path: `${rc.path}.${i + start}` }));
  return join(out);
}

/**
 * The attributes every element carries: id (first copy), editor handles, animation.
 * `box`: its children sit directly inside (where the editor drops elements).
 */
function elAttrs(el: El, ctx: RenderContext, rc: ElRender, box = el.kind === 'box'): Html {
  const motion = motionAttrs(el.motion);
  if (motion) ctx.needs.add('motion');
  const handles = rc.edit && !rc.copy;
  // The first copy carries the id and the editor's handles; copies in a CMS list only the class.
  // Hidden until a button shows it – in the editor it stays in view, marked, so it can be designed.
  const hidden = el.hidden ? (rc.edit ? ' data-nova-hidden' : ' hidden') : '';
  return raw(
    `${!rc.copy && (rc.edit || !rc.list) ? ` id="e-${el.id}"` : ''}${handles ? ` data-nova-el="${el.id}" data-nova-kind-el="${el.kind}"${el.pinned ? ' data-nova-pinned' : ''}` : ''}${handles && box ? ` data-nova-box="${el.id}"` : ''}${
      motion ? ` ${motion}${el.motion?.enter ? ' data-self' : ''}` : ''
    }${hidden}${rc.extra ?? ''}`,
  );
}

const chevron = (dir: 'left' | 'right') =>
  raw(`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${dir === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

/** A value from the entry an element is bound to – only what the visitor may see. */
/** Data of the website itself, for a property of this kind – nothing for one it does not fit. */
function siteValue(key: string, prop: string, ctx: RenderContext): string | null {
  const s = ctx.settings;
  const b = s.business;
  const kind = bindKind(prop);
  const year = new Intl.DateTimeFormat('en', { timeZone: s.timezone, year: 'numeric' }).format(ctx.now);
  if (kind === 'image') return key === 'logo' ? (s.logo ?? '') : null;
  if (kind === 'href') {
    if (key === 'home') return '/';
    if (key === 'phone-link') return b.phone ? `tel:${b.phone.replace(/[^+\d]/g, '')}` : '';
    if (key === 'email-link') return b.email ? `mailto:${b.email}` : '';
    return null;
  }
  switch (key) {
    case 'page': {
      // An overview's name with its filter, else the title of the entry the page shows.
      const a = ctx.archive;
      if (a) return a.tag ? `${a.c.name}: #${a.tag}` : a.category ? `${a.c.name}: ${a.category}` : a.c.name;
      return typeof ctx.current?.data.title === 'string' ? ctx.current.data.title : s.name;
    }
    case 'name':
      return s.name;
    case 'tagline':
      return s.tagline;
    case 'phone':
      return b.phone ?? '';
    case 'email':
      return b.email ?? '';
    case 'address':
      return [b.street, [b.zip, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    case 'hours':
      return openStatus(s.hours, s.timezone, ctx.now, ctx.lang)?.label ?? '';
    case 'year':
      return year;
    case 'copyright':
      return `© ${year} ${b.legalName || s.name}`;
  }
  return null;
}

function bound(el: El, prop: string, rc: ElRender, ctx: RenderContext): { set: boolean; value: unknown; field?: FieldDef } {
  const src = el.bind?.[prop];
  if (!src) return { set: false, value: undefined };
  if (src.startsWith('site:')) {
    const v = siteValue(src.slice(5), prop, ctx);
    return v === null ? { set: false, value: undefined } : { set: true, value: v };
  }
  // In a loop its entry; in a page template or on an entry's own page, the entry the page shows.
  const entry = rc.entry ?? currentEntry(ctx);
  if (!entry) return { set: false, value: undefined };
  const { e, c, open } = entry;
  if (src === 'title') return { set: true, value: e.data.title };
  if (src === 'author') return { set: true, value: e.author_name ?? '' };
  if (src === 'readtime') return { set: true, value: open ? t(ctx, '{min} Min. Lesezeit', { min: readingTime(`${blocksText(e.data.blocks ?? [])} ${stripHtml(String(e.data.body ?? ''))}`) }) : '' };
  if (src === 'url') return { set: true, value: entryPath(c, e.slug) ?? '' };
  if (src === 'date') return { set: true, value: new Date(String(e.data.date || e.published_at)).toLocaleDateString(L(ctx), { day: 'numeric', month: 'long', year: 'numeric' }) };
  const key = src.slice(6);
  // Members-only entries show what their paywall shows: title, short text, picture.
  if (!open && !['excerpt', 'cover', 'image', 'intro'].includes(key)) return { set: true, value: '' };
  const field = c.fields.find((f) => f.key === key);
  const v = e.data[key];
  if (field?.type === 'money' && typeof v === 'number') return { set: true, value: formatPrice(v), field };
  if ((field?.type === 'date' || field?.type === 'datetime') && v) return { set: true, value: new Date(String(v)).toLocaleDateString(L(ctx)), field };
  if (field?.type === 'images' && Array.isArray(v)) return { set: true, value: v[0], field };
  if (Array.isArray(v)) return { set: true, value: v.join(', '), field };
  return { set: true, value: v ?? '', field };
}

/** What conditions are checked against: the visitor, the clock, the address – and the entry of the loop or page. */
function condEnv(ctx: RenderContext, rc: ElRender): CondEnv {
  const tz = ctx.settings.timezone;
  const entry = rc.entry ?? currentEntry(ctx);
  return {
    member: ctx.member?.level ?? null,
    now: localNow(ctx.now, tz),
    day: zonedNow(tz, ctx.now).day,
    open: openStatus(ctx.settings.hours, tz, ctx.now, ctx.lang)?.open ?? null,
    lang: ctx.lang,
    cart: ctx.cartCount,
    query: ctx.query,
    // Members-only entries: only what their paywall shows counts.
    field: entry ? (key) => (entry.open || ['title', 'excerpt', 'cover', 'image', 'intro'].includes(key) ? entry.e.data[key] : undefined) : undefined,
  };
}

/** The entry an entry page shows, for bindings outside a loop. */
function currentEntry(ctx: RenderContext): ElRender['entry'] {
  if (ctx.entry) return ctx.entry;
  const cur = ctx.current;
  const c = cur && ctx.collections.find((x) => x.id === cur.collection);
  if (!cur || !c || c.id === 'pages' || c.id === 'sections') return undefined;
  return { e: { id: cur.id, slug: cur.slug, data: cur.data, published_at: cur.published_at, author_name: cur.author_name }, c, open: entryAccess(cur.data) === 'public' || mayRead(entryAccess(cur.data), ctx.member?.level ?? null) };
}

async function renderEl(el: El, ctx: RenderContext, rc: ElRender): Promise<Html> {
  if (!/^[\w-]{1,24}$/.test(el.id)) return html``;
  // «Nur zeigen, wenn …»: on the page what does not hold is left out; the editor shows it, marked.
  const holds = el.show?.length ? condsHold(el.show, condEnv(ctx, rc)) : true;
  if (!holds && !rc.edit) return html``;
  const p = (el.props ?? {}) as P;
  const path = rc.path;
  const attrs = el.show?.length && rc.edit && !rc.copy ? raw(`${elAttrs(el, ctx, rc).value} data-nova-cond="${holds ? 'on' : 'off'}"`) : elAttrs(el, ctx, rc);
  const handles = rc.edit && !rc.copy;
  const cls = (extra = '') => `el el-${el.kind} e-${el.id}${styleOf(el.use) ? ` st-${el.use}` : ''}${extra ? ` ${extra}` : ''}`;
  const val = (prop: string) => bound(el, prop, rc, ctx);
  const editField = (prop: string, kind: 'plain' | 'rich' = 'plain') => {
    if (val(prop).set) return '';
    if (rc.over) return OVERRIDABLE[el.kind]?.includes(prop) ? field(true, `${rc.over}.${el.id}.${prop}`, kind) : '';
    return field(rc.edit, `${path}.props.${prop}`, kind);
  };
  const hrefOf = () => {
    const b = val('href');
    return b.set ? String(b.value || '') : typeof p.href === 'string' ? p.href : '';
  };
  switch (el.kind) {
    case 'box': {
      const tag = (BOX_TAGS as readonly string[]).includes(String(p.tag)) ? String(p.tag) : 'div';
      const kids = el.children ?? [];
      const href = hrefOf();
      const inner = kids.length ? await renderEls(kids, ctx, { ...rc, path: `${path}.children`, inLink: rc.inLink || Boolean(href) }) : rc.edit ? html`<div class="el-empty">Leerer Container</div>` : html``;
      return href
        ? html`<a class="${cls()}" href="${href}"${attrs}>${inner}</a>`
        : html`${raw(`<${tag} class="${cls()}"`)}${attrs}>${inner}${raw(`</${tag}>`)}`;
    }
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(p.level) || 2));
      if (level === 1) ctx.h1 = true;
      const b = val('text');
      return html`${raw(`<h${level} class="${cls()}"`)}${attrs}${editField('text')}>${b.set ? String(b.value ?? '') : (p.text ?? '')}${raw(`</h${level}>`)}`;
    }
    case 'text': {
      const b = val('html');
      const body = b.set ? (b.field?.type === 'richtext' ? raw(sanitizeRichText(b.value)) : b.value ? html`<p>${lines(b.value)}</p>` : html``) : raw(sanitizeRichText(p.html ?? ''));
      return html`<div class="${cls('prose')}"${attrs}${editField('html', 'rich')}>${body}</div>`;
    }
    case 'image': {
      const b = val('image');
      const m = await ctx.media(b.set ? b.value : p.image);
      if (!m) return rc.edit ? html`<figure class="${cls('el-ph')}"${attrs}><span>${b.set ? 'Bild aus dem Eintrag – hier noch leer' : 'Bild wählen'}</span></figure>` : html``;
      const pic = picture(m, { sizes: '(min-width: 64rem) 50vw, 100vw', alt: p.alt || undefined });
      const href = hrefOf();
      return href ? html`<a class="${cls()}" href="${href}"${attrs}>${pic}</a>` : html`<figure class="${cls()}"${attrs}>${pic}</figure>`;
    }
    case 'button': {
      const b = val('label');
      const label = b.set ? String(b.value ?? '') : (p.label ?? '');
      const variant = p.variant === 'secondary' ? 'btn-2' : p.variant === 'link' ? 'el-link' : 'btn';
      if (!label && !rc.edit) return html``;
      // Shows or hides another element: a real button, wired up by the site's script (copies in a list have no ids to aim at).
      if (el.act && !rc.list && !rc.copy) {
        ctx.needs.add('reveal');
        return html`<button type="button" class="${cls(variant)}" data-act="${el.act.do}" aria-controls="e-${el.act.target}"${attrs}><span${editField('label')}>${label}</span></button>`;
      }
      return html`<a class="${cls(variant)}" href="${hrefOf() || '#'}"${attrs}><span${editField('label')}>${label}</span></a>`;
    }
    case 'icon':
      return html`<span class="${cls()}"${attrs} aria-hidden="true">${raw(siteIconSvg(String(p.icon ?? 'star')))}</span>`;
    case 'video': {
      const embed = typeof p.url === 'string' && p.url ? videoEmbed(p.url) : null;
      if (!embed) return rc.edit ? html`<figure class="${cls('el-ph')}"${attrs}><span>Video-Link einfügen</span></figure>` : html``;
      if (!ctx.settings.consent[embed.provider]) return html``;
      ctx.needs.add('consent');
      const poster = await ctx.media(p.poster);
      return html`<figure class="${cls()}"${attrs}>${consentBox(ctx, embed.provider, embed.src, t(ctx, 'Video'), poster ? picture(poster, { sizes: '(min-width: 64rem) 50vw, 100vw' }) : html``)}</figure>`;
    }
    case 'spacer':
      return html`<div class="${cls(`el-spacer-${(SPACER_SIZES as readonly string[]).includes(String(p.size)) ? p.size : 'm'}`)}"${attrs} aria-hidden="true"></div>`;
    case 'divider':
      return html`<hr class="${cls()}"${attrs}>`;
    case 'form': {
      // A form once per place: copies in a CMS list would share their field ids.
      const form = !rc.list && typeof p.form === 'string' && p.form ? await getForm(p.form) : null;
      if (!form)
        return rc.edit ? html`<div class="${cls('el-ph')}"${attrs}><span>${rc.list ? 'Formulare gehen nicht in eine CMS-Liste.' : 'Formular wählen'}</span></div>` : html``;
      return html`<div class="${cls()}"${attrs}>${renderForm(form, ctx, el.id)}</div>`;
    }
    case 'counter': {
      const value = Number(p.value) || 0;
      const dec = Math.min(2, (String(p.value ?? '').split('.')[1] ?? '').length);
      ctx.needs.add('widgets');
      return html`<span class="${cls()}"${attrs} data-count="${value}" data-dec="${dec}" data-dur="${Math.round((Number(p.duration) || 1.6) * 1000)}">${
        p.prefix ? html`<span class="cnt-fix"${editField('prefix')}>${p.prefix}</span>` : ''
      }<span class="cnt-num">${value.toLocaleString(L(ctx), { minimumFractionDigits: dec, maximumFractionDigits: dec })}</span>${
        p.suffix ? html`<span class="cnt-fix"${editField('suffix')}>${p.suffix}</span>` : ''
      }</span>`;
    }
    case 'accordion':
      return renderAccordion(el, ctx, rc, attrs, cls());
    case 'tabs': {
      const kids = el.children ?? [];
      ctx.needs.add('widgets');
      // In the editor the labels are written in place (they are the entries' names).
      const tabs = kids.map((c, i) =>
        handles
          ? html`<span class="tab" role="tab" tabindex="0" aria-selected="${String(i === 0)}"${field(true, `${path}.children.${i}.name`)}>${itemLabel(c, i)}</span>`
          : html`<button type="button" class="tab" role="tab" aria-selected="${String(i === 0)}">${itemLabel(c, i)}</button>`,
      );
      const panels: Html[] = [];
      for (let i = 0; i < kids.length; i++) panels.push(await renderEl(kids[i], ctx, { ...rc, path: `${path}.children.${i}`, extra: ' role="tabpanel" data-tab-panel' }));
      return html`<div class="${cls(`tabs-${p.style === 'pill' ? 'pill' : 'line'}`)}"${attrs}${handles ? raw(` data-nova-box="${el.id}"`) : ''} data-tabs><div class="tabs-list" role="tablist">${tabs}</div>${panels}</div>`;
    }
    case 'slider': {
      ctx.needs.add('widgets');
      const track = await renderEls(el.children ?? [], ctx, { ...rc, path: `${path}.children` });
      const auto = Number(p.autoplay) || 0;
      const ctrl =
        p.arrows !== false || p.dots !== false
          ? html`<div class="sl-ctrl">${p.arrows !== false ? html`<button type="button" class="sl-btn sl-prev" aria-label="${t(ctx, 'Zurück')}">${chevron('left')}</button>` : ''}${
              p.dots !== false ? html`<div class="sl-dots" data-label="${t(ctx, 'Folie {n}', { n: '{n}' })}"></div>` : ''
            }${p.arrows !== false ? html`<button type="button" class="sl-btn sl-next" aria-label="${t(ctx, 'Weiter')}">${chevron('right')}</button>` : ''}</div>`
          : '';
      return html`<div class="${cls()}"${attrs} data-slider${auto && !rc.edit ? raw(` data-autoplay="${auto}"`) : ''}><div class="sl-track"${
        handles ? raw(` data-nova-box="${el.id}"`) : ''
      }>${track}</div>${ctrl}</div>`;
    }
    case 'marquee': {
      const kids = el.children ?? [];
      const speed = (MARQUEE_SPEEDS as readonly string[]).includes(String(p.speed)) ? String(p.speed) : 'medium';
      const group = await renderEls(kids, ctx, { ...rc, path: `${path}.children` });
      // The second run makes the loop seamless – for the eye only.
      const copy = await renderEls(kids, ctx, { ...rc, path: `${path}.children`, edit: false, copy: true, over: undefined });
      return html`<div class="${cls(`mq-${speed}${p.direction === 'right' ? ' mq-right' : ''}${p.pause !== false ? ' mq-pause' : ''}`)}"${attrs}><div class="mq-track"><div class="mq-group"${
        handles ? raw(` data-nova-box="${el.id}"`) : ''
      }>${group}</div><div class="mq-group" aria-hidden="true" inert>${copy}</div></div></div>`;
    }
    case 'list':
      return renderList(el, ctx, rc, attrs, cls());
    case 'component':
      return renderComponent(el, ctx, rc, attrs, cls());
    case 'canvas': {
      const kids = el.children ?? [];
      const inner = kids.length
        ? await renderEls(kids, ctx, { ...rc, path: `${path}.children` })
        : handles
          ? html`<div class="el-empty">Freie Fläche – füg über «+» Elemente hinzu und zieh sie an ihren Platz.</div>`
          : html``;
      return html`<div class="${cls()}"${attrs}${handles ? raw(` data-nova-box="${el.id}"`) : ''}>${inner}</div>`;
    }
    case 'shape': {
      const key = (Object.keys(SHAPES) as (keyof typeof SHAPES)[]).includes(p.shape) ? (p.shape as keyof typeof SHAPES) : 'blob';
      const shape: { d: string; line?: boolean } = SHAPES[key];
      return html`<div class="${cls(`sh-${key}${shape.line ? ' sh-line' : ''}`)}"${attrs} aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${shape.d}" vector-effect="non-scaling-stroke"/></svg></div>`;
    }
    case 'logo': {
      const logo = p.show === 'name' ? null : await ctx.media(ctx.settings.logo);
      return html`<a class="${cls('brand')}" href="/"${attrs}>${
        logo ? html`<img src="${variantUrl(logo, 480, 'webp')}" alt="${ctx.settings.name}" width="${logo.width ?? 160}" height="${logo.height ?? 48}">` : ctx.settings.name
      }</a>`;
    }
    case 'menu':
      return renderSiteMenu(el, ctx, attrs, cls());
    case 'hours': {
      const s = ctx.settings;
      if (!s.hours.length) return rc.edit ? html`<div class="${cls('el-empty')}"${attrs}>Noch keine Öffnungszeiten. Trag sie unter Einstellungen → Website ein.</div>` : html``;
      const status = p.status !== false ? openStatus(s.hours, s.timezone, ctx.now, ctx.lang) : null;
      return html`<div class="${cls()}"${attrs}>${status ? html`<p class="${cx('open-now', !status.open && 'closed')}">${status.label}</p>` : ''}<ul>${hoursSummary(ctx)}</ul></div>`;
    }
    case 'terms':
      return renderTerms(el, ctx, attrs, cls());
    case 'price':
    case 'addtocart':
    case 'stock':
    case 'rating':
      return renderShopEl(el, ctx, rc, attrs, cls());
    case 'gallery':
      return renderGallery(el, ctx, rc, attrs, cls());
    case 'filter':
      return renderFilter(el, ctx, rc, attrs, cls());
    case 'countdown':
      return renderCountdown(el, ctx, rc, attrs, cls());
    case 'toc': {
      const title = typeof p.title === 'string' && p.title && p.title !== 'Inhalt' ? p.title : t(ctx, 'Inhalt');
      // Filled in once the whole page is drawn (fillToc): only then are all its headings known.
      return html`<nav class="${cls()}"${attrs} aria-label="${title}" data-toc="${p.levels === '23' ? '23' : '2'}"${p.numbered ? raw(' data-toc-numbered') : ''}><p class="toc-h">${title}</p>${raw('<!--nova-toc-->')}</nav>`;
    }
    case 'share':
      return renderShare(el, ctx, rc, attrs, cls());
    case 'progress': {
      const size = Math.min(12, Math.max(2, Number(p.size) || 4));
      ctx.needs.add('widgets');
      return html`<div class="${cls(`el-progress-${p.place === 'bottom' ? 'bottom' : 'top'}`)}"${attrs} style="--pg:${size}px" aria-hidden="true" data-progress><span></span></div>`;
    }
    case 'entrybody': {
      if (!ctx.entryView || rc.list || rc.copy)
        return handles ? html`<div class="${cls('el-empty')}"${attrs}>Hier erscheint der Inhalt des Eintrags – in Seitenvorlagen.</div>` : html``;
      return html`<div class="${cls()}"${attrs}>${await ctx.entryView(p.show === 'default' ? 'default' : 'blocks')}</div>`;
    }
    default:
      // A kind this version doesn't know (stored by a newer one): nothing.
      return html``;
  }
}

/**
 * A component instance: the original's elements with this place's own texts,
 * pictures and links. In the editor the instance is one piece – double-click
 * opens the original, its texts are written in place as this place's own.
 */
async function renderComponent(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  const handles = rc.edit && !rc.copy;
  const depth = (rc.depth ?? 0) + 1;
  const src = depth <= 3 && typeof p.ref === 'string' ? await sectionBlocks(p.ref, ctx.preview) : null;
  const master = src ? componentEls(src.blocks) : [];
  const variants = src ? componentVariants(src.blocks) : [];
  const variant = variants.find((v) => v.id === p.variant);
  if (!master.length) return handles ? html`<div class="${cls} el-empty"${attrs}>Diese Komponente gibt es nicht mehr oder sie ist leer.</div>` : html``;
  // Its design once per page – the class reaches every place (in the editor each block brings its own).
  let css = '';
  if (ctx.edit || !ctx.components.has(p.ref)) {
    ctx.components.add(p.ref);
    const images = new Map<string, string>();
    const used = new Set<string>();
    walkEls(master, (x) => void (styleOf(x.use) && used.add(x.use!)));
    for (const id of new Set([...elementImages(master), ...variantImages(variants), ...savedStyleImages(used, ctx.settings.styles ?? [])])) {
      const m = await ctx.media(id);
      if (m) images.set(id, variantUrl(m, 1920, 'webp'));
    }
    const opts = { image: (id: string) => images.get(id) ?? null };
    css = (savedStylesCss(used, ctx.settings.styles ?? [], opts) + elementsCss(master, opts) + variantsCss(variants, opts)).replace(/</g, '');
  }
  const inner = await renderEls(applyOverrides(master, p.overrides as Overrides), ctx, {
    path: 'els',
    edit: false,
    copy: true,
    entry: rc.entry,
    list: rc.list,
    over: handles ? `${rc.path}.props.overrides` : undefined,
    depth,
  });
  return html`<div class="${cls}${variant ? ` v-${variant.id}` : ''}"${attrs}${
    handles ? raw(` data-nova-section="${p.ref}" data-nova-component="${esc(variant ? `${src!.title} · ${variant.name}` : src!.title)}"`) : ''
  }>${
    css ? html`<style data-nova-comp>${raw(css)}</style>` : ''
  }${inner}</div>`;
}

/**
 * Accordion: each container entry becomes a <details> – its first element is
 * the question, the rest the answer. Works without JavaScript.
 */
async function renderAccordion(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  const kids = el.children ?? [];
  const handles = rc.edit && !rc.copy;
  const items: Html[] = [];
  const faq: { q: string; a: string }[] = [];
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    const cp = `${rc.path}.children.${i}`;
    if (c.kind !== 'box' || !c.children?.length) {
      items.push(await renderEl(c, ctx, { ...rc, extra: undefined, path: cp }));
      continue;
    }
    const open = handles ? i === 0 : p.first === true && i === 0;
    const summary = await renderEl(c.children[0], ctx, { ...rc, extra: undefined, path: `${cp}.children.0` });
    const body = await renderEls(c.children.slice(1), ctx, { ...rc, path: `${cp}.children` }, 1);
    const own = elAttrs(c, ctx, { ...rc, extra: undefined }, false);
    items.push(
      html`<details class="el el-box e-${c.id} acc-item"${own}${open ? raw(' open') : ''}${p.single !== false ? raw(` name="acc-${el.id}"`) : ''}><summary>${summary}<span class="acc-icon" aria-hidden="true"></span></summary><div class="acc-body"${
        handles ? raw(` data-nova-box="${c.id}" data-nova-offset="1"`) : ''
      }>${body}</div></details>`,
    );
    faq.push({ q: elementsText([c.children[0]]), a: elementsText(c.children.slice(1)) });
  }
  if (p.faq !== false && !rc.edit && !rc.list && !rc.copy && faq.some((f) => f.q && f.a))
    ctx.jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.filter((f) => f.q && f.a).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  return html`<div class="${cls}"${attrs}${handles ? raw(` data-nova-box="${el.id}"`) : ''}>${items}</div>`;
}

/* ---------- the website's own parts: menus, logo, hours ---------- */

function isActive(ctx: RenderContext, href: string) {
  if (href === '/') return ctx.path === '/';
  return ctx.path === href || ctx.path.startsWith(href + '/');
}

export function navList(ctx: RenderContext, items: NavItem[]): Html {
  return html`<ul>${items.map(
    (i) =>
      html`<li><a href="${i.href}"${isActive(ctx, i.href) ? raw(' aria-current="page"') : ''}>${i.label}</a>${
        i.children?.length ? html`<div class="sub">${i.children.map((c) => html`<a href="${c.href}">${c.label}</a>`)}</div>` : ''
      }</li>`,
  )}</ul>`;
}

/** Language links: absolute, so the link rewriting for /fr/ leaves them alone. */
export function langSwitch(ctx: RenderContext): Html {
  if (ctx.alternates.length < 2) return html``;
  return html`<ul class="lang-switch" aria-label="${t(ctx, 'Sprache')}">${ctx.alternates.map(
    (a) =>
      html`<li><a href="${ctx.base}${a.path}" hreflang="${a.lang}" lang="${a.lang}"${a.lang === ctx.lang ? raw(' aria-current="true"') : ''} title="${langInfo(a.lang).native}">${a.lang.toUpperCase()}</a></li>`,
  )}</ul>`;
}

/** The «Menü» element: main menu (with the menu button on phones), footer columns, legal pages or social links. */
async function renderSiteMenu(el: El, ctx: RenderContext, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  const s = ctx.settings;
  if (p.source === 'footer') {
    if (!s.footer.columns.length) return ctx.edit ? html`<div class="${cls} el-empty"${attrs}>Noch keine Spalten. Leg sie unter Einstellungen → Navigation an.</div>` : html``;
    return html`<div class="${cls} ftr"${attrs}>${s.footer.columns.map((col) => html`<div><h2>${col.title}</h2><ul>${col.links.map((l) => html`<li><a href="${l.href}">${l.label}</a></li>`)}</ul></div>`)}</div>`;
  }
  if (p.source === 'legal' || p.source === 'social') {
    const links = p.source === 'legal' ? (await legalPages()).map((l) => ({ href: `/${l.slug}`, label: l.title })) : s.social;
    if (!links.length)
      return ctx.edit ? html`<div class="${cls} el-empty"${attrs}>${p.source === 'legal' ? 'Noch kein Impressum, keine Datenschutzerklärung veröffentlicht.' : 'Noch keine Social-Links. Trag sie unter Einstellungen → Navigation ein.'}</div>` : html``;
    return html`<nav class="${cls}"${attrs} aria-label="${p.source === 'legal' ? t(ctx, 'Rechtliches') : t(ctx, 'Folgen')}"><ul class="menu-row">${links.map(
      (l) => html`<li><a href="${l.href}"${p.source === 'social' ? raw(' rel="noopener me"') : ''}>${l.label}</a></li>`,
    )}</ul></nav>`;
  }
  const extras =
    p.extras !== false
      ? html`${accountLink(ctx)}${
          s.modules.includes('shop')
            ? html`<a class="cart-link" href="/warenkorb" aria-label="${t(ctx, 'Warenkorb, {n} Artikel', { n: ctx.cartCount })}">${t(ctx, 'Warenkorb')} <span class="cart-count" data-cart-count>${ctx.cartCount}</span></a>`
            : ''
        }${langSwitch(ctx)}`
      : html``;
  const list = s.nav.length ? navList(ctx, s.nav) : ctx.edit ? html`<span class="el-empty">Das Hauptmenü ist leer.</span>` : html``;
  if (p.burger === false) return html`<nav class="${cls} nav"${attrs} aria-label="${t(ctx, 'Hauptnavigation')}">${list}${extras}</nav>`;
  return html`<div class="${cls}"${attrs}><nav class="nav desktop" aria-label="${t(ctx, 'Hauptnavigation')}">${list}${extras}</nav><details class="menu-toggle"><summary aria-label="${t(ctx, 'Menü')}"><span class="bars" aria-hidden="true"></span>${t(ctx, 'Menü')}</summary><nav class="menu-panel" aria-label="${t(ctx, 'Hauptnavigation mobil')}">${list}${extras}</nav></details></div>`;
}

/** The «Kategorien-Filter»: «Alle» and every category of a content type, as links to its overview. */
async function renderTerms(el: El, ctx: RenderContext, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  const c = ctx.collections.find((x) => x.id === (p.collection || ctx.archive?.c.id));
  if (!c?.list_route) return ctx.edit ? html`<div class="${cls} el-empty"${attrs}>Wähle einen Inhaltstyp mit Übersichtsseite.</div>` : html``;
  const cats = await categoriesOf(c.id);
  if (!cats.length) return ctx.edit ? html`<div class="${cls} el-empty"${attrs}>«${c.name}» hat noch keine Kategorien.</div>` : html``;
  // On its own overview the chosen one is marked.
  const here = ctx.archive?.c.id === c.id ? ctx.archive : ctx.path === c.list_route ? { category: ctx.query.get('kategorie') ?? '', tag: ctx.query.get('schlagwort') ?? '' } : null;
  const active = here?.category.toLowerCase() ?? null;
  return html`<nav class="${cls} filters"${attrs} aria-label="${t(ctx, 'Nach Kategorie filtern')}"><a href="${c.list_route}" aria-current="${String(active === '' && !here?.tag)}">${t(ctx, 'Alle')}</a>${cats.map(
    (cat) => html`<a href="${c.list_route}?kategorie=${encodeURIComponent(cat)}" aria-current="${String(active === cat.toLowerCase())}">${cat}</a>`,
  )}</nav>`;
}

/** Galerie: chosen pictures, or those of the entry (a product's photos); one click shows them large. */
async function renderGallery(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  let ids: unknown[] = Array.isArray(p.images) ? p.images : [];
  const src = el.bind?.images;
  if (src?.startsWith('field:')) {
    const entry = rc.entry ?? currentEntry(ctx);
    const v = entry ? entry.e.data[src.slice(6)] : undefined;
    ids = Array.isArray(v) ? v : v ? [v] : [];
  }
  const list = ids.filter((x): x is string => typeof x === 'string').slice(0, 60);
  await ctx.preloadMedia(list);
  const imgs = (await Promise.all(list.map((id) => ctx.media(id)))).filter((m) => m !== null);
  if (!imgs.length) return rc.edit ? html`<div class="${cls} el-ph"${attrs}><span>${src ? 'Bilder aus dem Eintrag – hier noch keine' : 'Bilder wählen'}</span></div>` : html``;
  const layout = p.layout === 'mosaic' || p.layout === 'strip' ? p.layout : 'grid';
  const min = { s: '9rem', m: '15rem', l: '22rem' }[String(p.size)] ?? '15rem';
  const sizes = layout === 'strip' ? '(min-width: 40rem) 26rem, 78vw' : '(min-width: 56rem) 25vw, 50vw';
  const big = p.lightbox !== false;
  if (big) ctx.needs.add('lightbox');
  return html`<div class="${cls} gal gal-${layout}"${attrs} style="--gal-min:${min}"${big ? raw(' data-lightbox') : ''}>${imgs.map((m) =>
    big
      ? html`<a href="${variantUrl(m, 1920, 'webp')}" data-caption="${m.caption || m.alt}">${picture(m, { sizes, maxWidth: layout === 'mosaic' ? 960 : 1280 })}</a>`
      : html`<figure>${picture(m, { sizes, maxWidth: layout === 'mosaic' ? 960 : 1280 })}</figure>`,
  )}</div>`;
}

/**
 * «Filter für Schleife»: a plain GET form – it works without any script; with
 * one, it sends itself as soon as something changes. Its fields write the
 * loop's own address parameters, other parameters of the page stay.
 */
async function renderFilter(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  let loop: El | undefined;
  walkEls(rc.root ?? [], (x) => void (x.id === p.target && x.kind === 'list' && (loop = x)));
  if (!loop || rc.list) return rc.edit ? html`<div class="${cls} el-empty"${attrs}>Wähle die Inhaltsschleife, die dieser Filter eingrenzt.</div>` : html``;
  const lq = loopQuery(loop.props as P);
  const arch = lq.archive ? ctx.archive : undefined;
  const c = arch?.c ?? ctx.collections.find((x) => x.id === lq.collection);
  if (!c) return html``;
  const fp = filterParams(loop.id, Boolean(arch));
  const now = (k: string) => ctx.query.get(k) ?? '';
  const cats = p.category !== 'none' && c.fields.some((f) => f.key === 'category') ? await categoriesOf(c.id) : [];
  const tags = p.tag && c.fields.some((f) => f.key === 'tags') ? await tagsOf(c.id) : [];
  const sorts = (Object.keys(FILTER_SORTS) as FilterSort[]).filter((k) => !FILTER_SORTS[k].label.startsWith('Preis') || c.fields.some((f) => f.key === 'price'));
  // Everything else on the page stays as it is; the loop starts again at its first page.
  const ours = new Set([fp.q, fp.cat, fp.tag, fp.sort, fp.page]);
  const keep = [...ctx.query.entries()].filter(([k]) => !ours.has(k));
  const active = [fp.q, fp.cat, fp.tag, fp.sort].some((k) => now(k));
  const uid = el.id;
  const reset = [...keep].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  ctx.needs.add('widgets');
  return html`<form class="${cls}"${attrs} method="get" action="${ctx.path}#e-${loop.id}" role="search" data-filter>${keep.map(
    ([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`,
  )}${
    p.search !== false
      ? html`<div class="fld filter-q"><label class="sr" for="fq-${uid}">${t(ctx, 'Suchen')}</label><input id="fq-${uid}" type="search" name="${fp.q}" value="${now(fp.q)}" placeholder="${p.placeholder || t(ctx, 'Suchen …')}" maxlength="80"></div>`
      : ''
  }${
    cats.length > 1 && p.category === 'select'
      ? html`<div class="fld"><label class="sr" for="fc-${uid}">${t(ctx, 'Kategorie')}</label><select id="fc-${uid}" name="${fp.cat}"><option value="">${t(ctx, 'Alle Kategorien')}</option>${cats.map(
          (x) => html`<option${now(fp.cat).toLowerCase() === x.toLowerCase() ? raw(' selected') : ''}>${x}</option>`,
        )}</select></div>`
      : cats.length > 1
        ? html`<fieldset class="filter-chips"><legend class="sr">${t(ctx, 'Kategorie')}</legend><label><input type="radio" name="${fp.cat}" value=""${now(fp.cat) ? '' : raw(' checked')}><span>${t(ctx, 'Alle')}</span></label>${cats.map(
            (x) => html`<label><input type="radio" name="${fp.cat}" value="${x}"${now(fp.cat).toLowerCase() === x.toLowerCase() ? raw(' checked') : ''}><span>${x}</span></label>`,
          )}</fieldset>`
        : ''
  }${
    tags.length
      ? html`<div class="fld"><label class="sr" for="ft-${uid}">${t(ctx, 'Schlagwort')}</label><select id="ft-${uid}" name="${fp.tag}"><option value="">${t(ctx, 'Alle Schlagwörter')}</option>${tags.map(
          (x) => html`<option${now(fp.tag).toLowerCase() === x.toLowerCase() ? raw(' selected') : ''}>${x}</option>`,
        )}</select></div>`
      : ''
  }${
    p.sort
      ? html`<div class="fld"><label class="sr" for="fs-${uid}">${t(ctx, 'Reihenfolge')}</label><select id="fs-${uid}" name="${fp.sort}"><option value="">${t(ctx, 'Wie vorgesehen')}</option>${sorts.map(
          (k) => html`<option value="${k}"${now(fp.sort) === k ? raw(' selected') : ''}>${t(ctx, FILTER_SORTS[k].label)}</option>`,
        )}</select></div>`
      : ''
  }<button class="btn filter-go">${t(ctx, 'Filtern')}</button>${
    active ? html`<a class="filter-reset" href="${ctx.path}${reset ? `?${reset}` : ''}#e-${loop.id}">${t(ctx, 'Zurücksetzen')}</a>` : ''
  }</form>`;
}

/* ---------- countdown, sharing, table of contents ---------- */

/** The moment a countdown runs to, in milliseconds: from the entry (date field) or as set – wall time in the site's zone. */
function countdownTarget(el: El, ctx: RenderContext, rc: ElRender): number | null {
  const tz = ctx.settings.timezone;
  const wall = (v: unknown): number | null => {
    if (typeof v !== 'string' || !v) return null;
    const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v.slice(0, 16));
    if (m) return zonedToUtc(m[1], m[2] ? Number(m[2]) * 60 + Number(m[3]) : 0, tz).getTime();
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  };
  const src = el.bind?.to;
  if (src) {
    const entry = rc.entry ?? currentEntry(ctx);
    if (!entry) return null;
    if (src === 'date') return wall(entry.e.data.date) ?? wall(entry.e.published_at);
    if (src.startsWith('field:')) return wall(entry.e.data[src.slice(6)]);
    return null;
  }
  return wall(el.props.to);
}

function renderCountdown(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Html {
  const p = el.props as P;
  const target = countdownTarget(el, ctx, rc);
  if (target === null) return rc.edit ? html`<div class="${cls} el-empty"${attrs}>Wähle, bis wann der Countdown zählt.</div>` : html``;
  const left = Math.max(0, Math.floor((target - ctx.now.getTime()) / 1000));
  const done = typeof p.done === 'string' ? p.done : '';
  if (!left) return done ? html`<p class="${cls} cd-done"${attrs}>${done}</p>` : rc.edit ? html`<div class="${cls} el-empty"${attrs}>Der Zeitpunkt ist vorbei – auf der Website verschwindet der Countdown.</div>` : html``;
  ctx.needs.add('widgets');
  const units = p.units === 'd' ? ['d'] : p.units === 'dhm' ? ['d', 'h', 'm'] : ['d', 'h', 'm', 's'];
  const value = { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 } as Record<string, number>;
  const label = { d: t(ctx, 'Tage'), h: t(ctx, 'Stunden'), m: t(ctx, 'Minuten'), s: t(ctx, 'Sekunden') } as Record<string, string>;
  return html`<div class="${cls}"${attrs} role="timer" data-countdown="${target}" data-done="${done}">${units.map(
    (u) => html`<span class="cd-part"><span class="cd-n" data-cd="${u}">${u === 'd' ? String(value[u]) : String(value[u]).padStart(2, '0')}</span><span class="cd-l">${label[u]}</span></span>`,
  )}</div>`;
}

/** Share links: the entry of the loop, else this page. Plain links – no scripts of the networks. */
function renderShare(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Html {
  const p = el.props as P;
  const entry = rc.entry;
  const path = entry ? (entryPath(entry.c, entry.e.slug) ?? ctx.path) : ctx.path;
  const url = ctx.base + path;
  const title = String(entry?.e.data.title ?? ctx.current?.data.title ?? ctx.settings.name);
  const e = encodeURIComponent;
  const ways = (Array.isArray(p.networks) ? p.networks : ['copy', 'mail']).filter((w): w is string => typeof w === 'string');
  const links: Record<string, string> = {
    mail: `mailto:?subject=${e(title)}&body=${e(url)}`,
    whatsapp: `https://wa.me/?text=${e(`${title} ${url}`)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
    x: `https://x.com/intent/post?url=${e(url)}&text=${e(title)}`,
  };
  const names: Record<string, string> = { mail: t(ctx, 'E-Mail'), whatsapp: 'WhatsApp', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X' };
  const label = typeof p.label === 'string' && p.label && p.label !== 'Teilen' ? p.label : t(ctx, 'Teilen');
  if (ways.includes('copy')) ctx.needs.add('widgets');
  return html`<div class="${cls}"${attrs}><span class="share-h">${label}</span><ul>${ways.map((w) =>
    w === 'copy'
      ? html`<li><button type="button" class="share-copy" data-share="${url}" data-done="${t(ctx, 'Link kopiert')}">${t(ctx, 'Link kopieren')}</button></li>`
      : links[w]
        ? html`<li><a href="${links[w]}"${w === 'mail' ? '' : raw(' target="_blank" rel="noopener"')}>${names[w]}</a></li>`
        : '',
  )}</ul></div>`;
}

/**
 * Inhaltsverzeichnis: once the page is drawn, every list gets the headings of
 * the page's content (H2, or H2 and H3); headings without an id get one from
 * their text. Without enough headings the list stays out of sight.
 */
export function fillToc(page: string, edit: boolean): string {
  if (!page.includes('<!--nova-toc-->')) return page;
  const used = new Set<string>([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const heads: { level: number; id: string; text: string }[] = [];
  const withIds = page.replace(/<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/g, (all, level: string, rest: string, inner: string) => {
    const text = stripHtml(inner).replace(/\s+/g, ' ').trim();
    if (!text) return all;
    let id = /\sid="([^"]+)"/.exec(rest)?.[1] ?? '';
    if (!id) {
      const base = slugify(text).replace(/\//g, '-').slice(0, 60) || 'abschnitt';
      let next = base;
      for (let n = 2; used.has(next); n++) next = `${base}-${n}`;
      used.add(next);
      id = next;
      rest = ` id="${id}"${rest}`;
    }
    heads.push({ level: Number(level), id, text });
    return `<h${level}${rest}>${inner}</h${level}>`;
  });
  return withIds.replace(/(<nav [^>]*data-toc="(2|23)"[^>]*)>([\s\S]*?)<!--nova-toc-->/g, (_, open: string, levels: string, head: string) => {
    const list = heads.filter((h) => h.level === 2 || levels === '23');
    if (list.length < 2) return edit ? `${open}>${head}<p class="el-empty">Hier erscheinen die Zwischentitel der Seite, sobald es mindestens zwei gibt.</p>` : `${open} hidden>${head}`;
    const tag = open.includes('data-toc-numbered') ? 'ol' : 'ul';
    return `${open}>${head}<${tag}>${list.map((h) => `<li class="toc-${h.level}"><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('')}</${tag}>`;
  });
}

/* ---------- shop elements ---------- */

type ShopProduct = { id: string; slug: string; data: EntryData };

/** The product a shop element shows: chosen by hand, else the loop's entry, else the product of the page. */
async function productFor(el: El, ctx: RenderContext, rc: ElRender): Promise<ShopProduct | null> {
  const ref = typeof el.props.product === 'string' ? el.props.product : '';
  if (ref) return productById(ref);
  const bound = rc.entry ?? currentEntry(ctx);
  return bound?.c.id === 'products' ? bound.e : null;
}

const variantsOf = (d: EntryData) => (Array.isArray(d.variants) ? (d.variants as { name?: string; price?: number | null; stock?: number | null }[]) : []);

/** Units left: a number, or null for «no limit» (also when a single variant has none). */
function stockOf(d: EntryData): number | null {
  const variants = variantsOf(d);
  if (!variants.length) return typeof d.stock === 'number' ? d.stock : null;
  if (variants.some((v) => typeof v.stock !== 'number')) return null;
  return variants.reduce((sum, v) => sum + (v.stock as number), 0);
}

async function renderShopEl(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const p = el.props as P;
  const product = await productFor(el, ctx, rc);
  if (!product)
    return rc.edit ? html`<div class="${cls} el-empty"${attrs}>Wähle ein Produkt – oder setz das Element in eine Inhaltsschleife mit Produkten oder in die Produktvorlage.</div>` : html``;
  const d = product.data;
  const variants = variantsOf(d);
  const left = stockOf(d);
  const soldOut = variants.length ? variants.every((v) => v.stock === 0) : d.stock === 0;
  switch (el.kind) {
    case 'price': {
      const base = typeof d.price === 'number' ? d.price : 0;
      const prices = variants.map((v) => (typeof v.price === 'number' ? v.price : base));
      const from = prices.length && new Set(prices).size > 1 ? Math.min(...prices) : null;
      const compare = typeof d.comparePrice === 'number' && d.comparePrice > base ? d.comparePrice : null;
      const off = compare && p.sale !== false ? Math.round((1 - base / compare) * 100) : 0;
      return html`<p class="${cls} price-row"${attrs}><span data-price-of="${product.id}">${from !== null ? t(ctx, 'ab {price}', { price: formatPrice(from) }) : formatPrice(base)}</span>${
        compare && p.compare !== false ? html`<s>${formatPrice(compare)}</s>` : ''
      }${off > 0 ? html`<span class="badge sale">−${off} %</span>` : ''}</p>`;
    }
    case 'stock': {
      if (soldOut) return html`<p class="${cls} stock out"${attrs}>${t(ctx, 'Ausverkauft')}</p>`;
      if (left !== null && left <= 5) return html`<p class="${cls} stock low"${attrs}>${t(ctx, 'Nur noch {n} Stück an Lager', { n: left })}</p>`;
      return p.plenty !== false ? html`<p class="${cls} stock in"${attrs}>${t(ctx, 'An Lager')}</p>` : rc.edit ? html`<p class="${cls} el-empty"${attrs}>Genug an Lager – erscheint erst, wenn es knapp wird.</p>` : html``;
    }
    case 'rating': {
      if (!ctx.settings.shop.reviews) return rc.edit ? html`<p class="${cls} el-empty"${attrs}>Schalte die Kundenbewertungen unter Einstellungen → Shop ein.</p>` : html``;
      const r = rc.ratings ? rc.ratings.get(product.id) : (await ratingSummaries([product.id])).get(product.id);
      if (!r) return rc.edit ? html`<p class="${cls} el-empty"${attrs}>Noch keine Bewertungen</p>` : html``;
      const label = r.count === 1 ? t(ctx, '{n} von 5 Sternen, 1 Bewertung', { n: r.average.toLocaleString(L(ctx)) }) : t(ctx, '{n} von 5 Sternen, {count} Bewertungen', { n: r.average.toLocaleString(L(ctx)), count: r.count });
      return html`<p class="${cls} card-stars" role="img" aria-label="${label}"${attrs}>${starsMeter(r.average)}${p.count !== false ? html` <span aria-hidden="true">${r.count}</span>` : ''}</p>`;
    }
    case 'addtocart': {
      // The default text in the visitor's language; an own one as written.
      const label = typeof p.label === 'string' && p.label && p.label !== 'In den Warenkorb' ? p.label : t(ctx, 'In den Warenkorb');
      if (soldOut) return html`<p class="${cls}"${attrs}><span class="badge">${t(ctx, 'Ausverkauft')}</span></p>`;
      // A form inside a link would be invalid: there it leads to the product instead.
      if (rc.inLink) return html`<span class="${cls} btn"${attrs}>${label}</span>`;
      if (!ctx.settings.modules.includes('shop')) return rc.edit ? html`<p class="${cls} el-empty"${attrs}>Schalte den Shop unter Einstellungen → Module ein.</p>` : html``;
      ctx.needs.add('cart');
      // Several on a page (a loop): ids from the element and the product.
      const uid = `${el.id}-${product.id.slice(0, 8)}`;
      const max = !variants.length && left !== null ? Math.min(99, left) : 99;
      return html`<form method="post" action="/warenkorb/add" class="${cls} nform" data-add-to-cart${attrs}><input type="hidden" name="product" value="${product.id}">${
        variants.length
          ? html`<div class="fld"><label for="v-${uid}">${t(ctx, 'Variante')}</label><select id="v-${uid}" name="variant" required>${variants.map((v, i) =>
              v.stock === 0
                ? html`<option value="${i}" disabled>${t(ctx, '{name} – ausverkauft', { name: v.name ?? '' })}</option>`
                : html`<option value="${i}" data-price="${formatPrice(typeof v.price === 'number' ? v.price : (d.price as number))}">${v.name ?? ''}</option>`,
            )}</select></div>`
          : ''
      }<div class="qty">${
        p.qty === true ? html`<div class="fld"><label for="q-${uid}">${t(ctx, 'Menge')}</label><input id="q-${uid}" name="qty" type="number" min="1" max="${max}" value="1" inputmode="numeric"></div>` : ''
      }<button class="btn"${rc.list ? raw(` aria-label="${esc(`${label}: ${d.title}`)}"`) : ''}>${label}</button></div></form>`;
    }
  }
  return html``;
}

/** A CMS list: the template once per published entry; in the editor only the first copy is editable. */
async function renderList(el: El, ctx: RenderContext, rc: ElRender, attrs: Html, cls: string): Promise<Html> {
  const set = loopQuery(el.props as P);
  // «Dieses Archiv»: the overview's content type and filter, its pages counted in its own address.
  const arch = set.archive ? ctx.archive : undefined;
  // What visitors chose in a filter for this loop (address parameters): search, category, tag, order.
  const fp = filterParams(el.id, Boolean(arch));
  const word = (k: string) => (ctx.query.get(k) ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const search = word(fp.q);
  const chosenCat = arch ? '' : word(fp.cat);
  const chosenTag = arch ? '' : word(fp.tag);
  const order = FILTER_SORTS[ctx.query.get(fp.sort) as FilterSort] as { sort: LoopSort; field?: string } | undefined;
  const q = order ? { ...set, sort: order.sort, sortField: order.field ?? '' } : set;
  const filtering = Boolean(search || chosenCat || chosenTag || arch?.category || arch?.tag);
  const c = arch?.c ?? ctx.collections.find((x) => x.id === q.collection);
  const template = listTemplate(el);
  if (!c || !template || rc.list) return rc.edit ? html`<div class="${cls} el-empty"${attrs}>Wähle einen Inhaltstyp.</div>` : html``;
  const sort = { newest: ['published_at', 'desc'], oldest: ['published_at', 'asc'], title: ['title', 'asc'], order: ['sort', 'asc'] }[q.sort as string];
  const byField = q.sort === 'field-asc' || q.sort === 'field-desc';
  // «Like this entry» needs one: on other pages such a loop shows nothing (and says so in the editor).
  const current = ctx.current?.collection === c.id ? ctx.current : null;
  const like = relatedTo(q, ctx.current?.data);
  if (q.related !== 'none' && !like)
    return rc.edit ? html`<div class="${cls} el-empty"${attrs}>«Wie der Eintrag dieser Seite» zeigt erst auf einer Eintragsseite oder in einer Seitenvorlage etwas.</div>` : html``;
  const tf = q.time === 'all' ? null : timeField(c);
  const now = localNow(ctx.now, ctx.settings.timezone);
  const param = arch ? 'seite' : pageParam(el.id);
  const page = q.paginate ? Math.min(200, Math.max(1, Number(ctx.query.get(param)) || 1)) : 1;
  // Coming events soonest first, past ones latest first; otherwise as chosen.
  const [sortField, sortDir] =
    byField && q.sortField
      ? [q.sortField, q.sort === 'field-asc' ? 'asc' : 'desc']
      : tf && (q.sort === 'newest' || q.sort === 'oldest')
        ? [tf, q.time === 'upcoming' ? 'asc' : 'desc']
        : (sort ?? ['published_at', 'desc']);
  // Products: on sale and in stock filter the query; best sellers and «goes with» bring their own order.
  const shop = c.id === 'products' ? q.shop : 'all';
  if (shop === 'related' && ctx.current?.collection !== 'products')
    return rc.edit ? html`<div class="${cls} el-empty"${attrs}>«Passt zum Produkt dieser Seite» zeigt erst auf einer Produktseite oder in der Produktvorlage etwas.</div>` : html``;
  const special =
    shop === 'bestseller'
      ? await bestsellers(c, q.limit)
      : shop === 'related'
        ? await relatedProducts(c, ctx.current!.id, ctx.current!.data, q.limit)
        : null;
  const { items, total } = special ? { items: special, total: special.length } : await publishedEntries(c, {
    onSale: shop === 'sale',
    inStock: shop === 'instock',
    limit: q.limit,
    offset: q.offset + (page - 1) * q.limit,
    sortField,
    sortDir: sortDir as 'asc' | 'desc',
    numeric: ['number', 'money'].includes(c.fields.find((f) => f.key === sortField)?.type ?? ''),
    random: q.sort === 'random',
    search: search || undefined,
    category: arch?.category || chosenCat || q.category || like?.category || undefined,
    tag: arch?.tag || chosenTag || q.tag || undefined,
    rules: q.rules.filter((r) => r.is),
    anyTag: like?.tags,
    exclude: q.excludeCurrent && current ? [current.id] : undefined,
    time: tf ? (q.time === 'upcoming' ? { field: tf, from: now.slice(0, 10) } : { field: tf, until: now.slice(0, 10) }) : undefined,
  });
  if (!items.length) {
    // Narrowed down by a visitor: say so, and keep the place the filter jumps to.
    if (filtering && !q.empty) return html`<div class="${cls} loop-empty"${attrs}><p>${t(ctx, 'Keine Treffer. Versuch es mit weniger Filtern.')}</p></div>`;
    if (q.empty) return html`<div class="${cls} loop-empty"${attrs}><p>${q.empty}</p></div>`;
    return rc.edit ? html`<div class="${cls} el-empty"${attrs}>Nichts passt zu diesen Regeln in «${c.name}».</div>` : html``;
  }
  const out: Html[] = [];
  // Stars of every product in the loop with one query.
  let ratings: Map<string, { average: number; count: number }> | undefined;
  if (c.id === 'products' && ctx.settings.shop.reviews) {
    let wants = false;
    walkEls([template], (x) => void (x.kind === 'rating' && !x.props.product && (wants = true)));
    if (wants) ratings = await ratingSummaries(items.map((e) => e.id));
  }
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    const open = entryAccess(e.data) === 'public' || mayRead(entryAccess(e.data), ctx.member?.level ?? null);
    // In the editor each card says which entry it shows: the canvas opens it from there.
    const tag = ctx.edit ? ` data-nova-entry="${esc(e.id)}" data-nova-coll="${esc(c.id)}" data-nova-entry-title="${esc(String(e.data.title ?? '').slice(0, 80))}"` : undefined;
    const item = await renderEl(template, ctx, { path: `${rc.path}.children.0`, edit: rc.edit && i === 0, entry: { e, c, open }, list: true, ratings, extra: tag });
    out.push(rc.edit && i > 0 ? html`<div class="el-ghost" data-nova-ghost>${item}</div>` : item);
  }
  // Pages of their own per loop: other loops and filters on the page keep their place.
  const pages = q.paginate ? Math.ceil(Math.max(0, total - q.offset) / q.limit) : 1;
  const link = (n: number) => {
    const next = new URLSearchParams(ctx.query);
    if (n > 1) next.set(param, String(n));
    else next.delete(param);
    const qs = next.toString();
    return `${ctx.path}${qs ? `?${qs}` : ''}`;
  };
  const pager =
    pages > 1
      ? html`<nav class="pager loop-pages" aria-label="${t(ctx, 'Seiten')}">${page > 1 ? html`<a class="btn-2" href="${link(page - 1)}" rel="prev">${t(ctx, 'Zurück')}</a>` : html`<span></span>`}<span class="muted">${t(ctx, 'Seite {n} von {total}', { n: page, total: pages })}</span>${
          page < pages ? html`<a class="btn-2" href="${link(page + 1)}" rel="next">${t(ctx, 'Weiter')}</a>` : html`<span></span>`
        }</nav>`
      : html``;
  return pages > 1 ? html`<div class="${cls}"${attrs}>${out}</div>${pager}` : html`<div class="${cls}"${attrs}>${out}</div>`;
}

export function hoursTable(ctx: RenderContext): Html {
  const { day } = zonedNow(ctx.settings.timezone, ctx.now);
  const hours = [...ctx.settings.hours].sort((a, b) => a.day - b.day);
  return html`<table class="hours"><caption class="sr">${t(ctx, 'Öffnungszeiten')}</caption><tbody>${hours.map(
    (h) => html`<tr class="${h.day === day ? 'today' : ''}"><th scope="row">${cap(DAYS[ctx.lang].long[h.day])}</th><td>${formatSlots(h, ctx.lang)}</td></tr>`,
  )}</tbody></table>`;
}

export function hoursSummary(ctx: RenderContext): Html {
  return join(
    compactHours(ctx.settings.hours, ctx.lang).map((g) => html`<li>${g.days} ${g.time}</li>`),
    '',
  );
}

/** In the editor: where an entry's own blocks sit inside its article (the bridge inserts and moves them there). */
export const ownBlocks = (ctx: RenderContext, inner: Html): Html => (ctx.edit ? html`<div class="nova-blocks" data-nova-blocks>${inner}</div>` : inner);

/** Renders a block list, wrapping each block in its section element. */
export async function renderBlocks(blocks: Block[], ctx: RenderContext & { depth?: number }): Promise<Html> {
  const c = ctx as RenderContext;
  c.depth ??= 0;
  const out: Html[] = [];
  // Background images in the design: looked up once, before the blocks render.
  const images = new Map<string, string>();
  const styles = c.settings.styles ?? [];
  for (const id of new Set(
    blocks.flatMap((b) => [
      ...designImages(b.style?.design),
      ...savedStyleImages(stylesUsed(b), styles),
      ...(b.type === 'layout' ? [...elementImages(((b.props as P).els as El[]) ?? []), ...variantImages((b.props as P).variants as Variant[] | undefined)] : []),
    ]),
  )) {
    const m = await c.media(id);
    if (m) images.set(id, variantUrl(m, 1920, 'webp'));
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const def = BLOCK_MAP[b.type];
    const fn = R[b.type];
    if (!def || !fn) continue;
    // «Nur zeigen, wenn …» for the whole block: left out on the page, marked in the editor.
    const show = b.style?.show;
    const holds = show?.length ? condsHold(show, condEnv(c, { path: '', edit: c.edit, entry: c.entry })) : true;
    if (!holds && !c.edit) continue;
    c.blockIndex = c.depth === 0 ? i : c.blockIndex;
    // Items sit right under the page title unless the block brings its own heading (heading() raises this).
    c.hl = 2;
    let inner: Html;
    try {
      inner = await fn(b, c);
    } catch (e) {
      console.error(`[render] Block ${b.type} (${b.id}) fehlgeschlagen:`, e);
      inner = empty(c, 'Dieser Block konnte nicht angezeigt werden.');
    }
    const wrapped = wrapBlock(b, inner, c, images, await bgMediaHtml(b, c));
    out.push(show?.length && c.edit ? raw(wrapped.value.replace('<section ', `<section data-nova-cond="${holds ? 'on' : 'off'}" `)) : wrapped);
  }
  return join(out);
}

/**
 * A video or slideshow behind the section's content, under its overlay colour.
 * Phones get the poster unless the video should play there too; less motion –
 * the poster or the first picture, standing still (themes.ts).
 */
async function bgMediaHtml(b: Block, ctx: RenderContext): Promise<Html> {
  const m = b.style?.media;
  if (!m) return html``;
  const tint = html`<span class="bgm-tint"></span>`;
  if (m.kind === 'video') {
    const file = await ctx.media(m.video);
    if (!file?.mime.startsWith('video/')) return html``;
    const v = file.video?.status === 'ready' ? file.video : null;
    // The smallest web version that is still sharp on a wide screen; the original only as the last resort.
    const versions = [...(v?.renditions ?? [])].sort((a, b) => a.p - b.p);
    const pick = versions.find((r) => r.p >= 720) ?? versions[versions.length - 1];
    const poster = await ctx.media(m.poster);
    const posterUrl = poster ? variantUrl(poster, 1920, 'webp') : v?.poster ? `/media/${file.id}/video/${v.poster.split('/').pop()}` : '';
    const media = m.phones ? '' : ' media="(min-width: 720px)"';
    const sources = [
      ...(pick ? [`<source src="/media/${esc(file.id)}/video/${pick.p}.mp4" type="video/mp4"${media}>`] : []),
      `<source src="${esc(originalUrl(file))}" type="${esc(file.mime)}"${media}>`,
    ].join('');
    const still = posterUrl ? html`<img class="bgm-poster" src="${posterUrl}" alt="" loading="lazy" decoding="async">` : html``;
    return html`<div class="bgm" aria-hidden="true">${still}<video class="${m.phones ? '' : 'bgm-wide'}" autoplay muted loop playsinline disablepictureinpicture preload="metadata"${
      posterUrl ? raw(` poster="${esc(posterUrl)}"`) : ''
    }>${raw(sources)}</video>${tint}</div>`;
  }
  const pics = (await Promise.all(m.images.map((id) => ctx.media(id)))).filter((x): x is NonNullable<typeof x> => Boolean(x?.mime.startsWith('image/')));
  if (!pics.length) return html``;
  const key = blockDomId(b).replace(/[^\w-]/g, '');
  const css = slidesCss(`#${blockDomId(b)}`, key, pics.length, m.seconds, m.effect);
  return html`<div class="bgm bgm-slides" aria-hidden="true">${css ? html`<style>${raw(css.replace(/</g, ''))}</style>` : ''}${pics.map((pic, i) =>
    picture(pic, { className: 'bgm-slide', alt: '', maxWidth: 1920, priority: i === 0 && ctx.blockIndex === 0 }),
  )}${tint}</div>`;
}

export function wrapBlock(b: Block, inner: Html, ctx: RenderContext, images: Map<string, string> = new Map(), bgm: Html = html``): Html {
  const s = b.style ?? {};
  const tone = s.tone ?? 'default';
  const isCover = b.type === 'hero' && (b.props as P).variant === 'cover';
  const cls = cx(
    'b',
    `b-${b.type}`,
    `tone-${tone}`,
    `sp-${s.spacing ?? 'm'}`,
    s.spacingMobile && `spm-${s.spacingMobile}`,
    ...(s.hideOn ?? []).map((h) => `hide-${h}`),
    isCover && 'hero-cover',
    b.type === 'hero' && `hero-${(b.props as P).variant ?? 'statement'}`,
    s.className,
    styleOf(s.use) && `st-${s.use}`,
    bgm.value && 'has-bgm',
  );
  const id = blockDomId(b);
  const css = s.css ? html`<style>${raw(scopeCss(s.css, id))}</style>` : '';
  // The editor swaps this style element while someone drags a value, before the server answers.
  const opts = { image: (m: string) => images.get(m) ?? null, forceHover: ctx.edit ? 'nova-hover' : undefined };
  const look = blockLookCss(`#${id}`, b, ctx.settings.styles ?? [], opts);
  const motion = motionAttrs(s.motion);
  if (motion) ctx.needs.add('motion');
  const design = look || ctx.edit ? html`<style data-nova-design="${b.id}">${raw(look.replace(/</g, ''))}</style>` : '';
  const editAttrs = ctx.edit ? raw(` data-nova-block="${esc(b.id)}" data-nova-type="${esc(b.type)}" data-nova-lock="${esc(b.lock ?? 'none')}"`) : '';
  return html`<section class="${cls}" id="${id}" data-tone="${tone}"${editAttrs}${raw(motion ? ` ${motion}` : '')}>${css}${design}${bgm}${inner}</section>`;
}

/** Werkbank CSS per block: `&` refers to the block; plain rules are prefixed with it. */
export function scopeCss(css: string, id: string): string {
  const clean = css.replace(/<\/?style/gi, '').replace(/</g, '');
  const sel = `#${id}`;
  return clean.replace(/(^|})\s*([^{}@]+)\{/g, (_, close, selectors: string) => {
    const scoped = selectors
      .split(',')
      .map((s) => (s.includes('&') ? s.replace(/&/g, sel) : `${sel} ${s.trim()}`))
      .join(',');
    return `${close}${scoped}{`;
  });
}

export { R as renderers };

/* ---------- booking steps (server-rendered, works without JavaScript) ---------- */

async function bookingSteps(ctx: RenderContext, services: BookingService[], fixed: string): Promise<Html> {
  const s = ctx.settings;
  const monthShort = (m: number) =>
    ctx.lang === 'de' ? MONTHS[m - 1].slice(0, 3) : new Intl.DateTimeFormat(L(ctx), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 1))).replace('.', '');
  const q = ctx.query;
  const table = s.booking.mode === 'table';
  const keep = ['b_s', 'b_p', 'b_d', 'b_t', 'b_from'];
  const link = (change: Record<string, string | number | null>) => {
    const u = new URLSearchParams();
    for (const k of keep) if (q.get(k)) u.set(k, q.get(k)!);
    for (const [k, v] of Object.entries(change)) v === null ? u.delete(k) : u.set(k, String(v));
    return `${ctx.path}?${u}#buchen`;
  };
  const service = services.length === 1 ? services[0] : services.find((x) => x.id === q.get('b_s'));
  const party = table ? Math.min(s.booking.maxParty, Math.max(0, Number(q.get('b_p')) || 0)) : 1;
  const out: Html[] = [];
  const error = q.get('b_err');
  if (error) out.push(html`<p class="form-err" role="alert">${error}</p>`);

  // 1 – what
  if (services.length > 1 && !fixed) {
    out.push(html`<section class="bk-step" aria-labelledby="bk-what">${hx(ctx, table ? t(ctx, 'Bereich|Lokal') : t(ctx, 'Was möchtest du buchen?'), raw(' id="bk-what" class="bk-label"'))}<ul class="bk-services">${services.map(
      (x) =>
        html`<li><a class="bk-service" href="${link({ b_s: x.id, b_d: null, b_t: null })}"${x.id === service?.id ? raw(' aria-current="true"') : ''}><strong>${x.name}</strong><span>${[t(ctx, '{n} Min.', { n: x.duration_min }), x.price ? formatPrice(x.price) : ''].filter(Boolean).join(' · ')}</span>${
          x.description ? html`<small>${x.description}</small>` : ''
        }</a></li>`,
    )}</ul></section>`);
  }
  if (!service) return join(out);

  // 2 – how many
  if (table) {
    const max = Math.min(s.booking.maxParty, 10);
    out.push(html`<section class="bk-step" aria-labelledby="bk-who">${hx(ctx, t(ctx, 'Wie viele Personen?'), raw(' id="bk-who" class="bk-label"'))}<div class="bk-chips">${Array.from({ length: max }, (_, i) => i + 1).map(
      (n) => html`<a class="bk-chip" href="${link({ b_p: n, b_t: null })}"${n === party ? raw(' aria-current="true"') : ''}>${n}</a>`,
    )}</div>${s.business.phone ? html`<p class="bk-hint">${t(ctx, 'Mehr als {max}? Ruf uns an:', { max })} <a href="tel:${s.business.phone.replace(/\s/g, '')}">${s.business.phone}</a></p>` : ''}</section>`);
    if (!party) return join(out);
  }

  // 3 – which day (two weeks at a time)
  const today = localDay(ctx.now, s.timezone).day;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.get('b_from') ?? '') && q.get('b_from')! > today ? q.get('b_from')! : today;
  const days = await openDays(service.id, party, from, 14, ctx.now);
  const chosen = days.find((d) => d.day === q.get('b_d')) ? q.get('b_d')! : null;
  const shift = (n: number) => localDay(new Date(zonedToUtc(from, 12 * 60, s.timezone).getTime() + n * 86_400_000), s.timezone).day;
  const lastDay = shift(s.booking.horizonDays);
  out.push(html`<section class="bk-step" aria-labelledby="bk-when">${hx(ctx, t(ctx, 'An welchem Tag?'), raw(' id="bk-when" class="bk-label"'))}<div class="bk-days">${days.map((d) => {
    const [, m, dd] = d.day.split('-').map(Number);
    const wd = cap(DAYS[ctx.lang].short[localDay(zonedToUtc(d.day, 12 * 60, s.timezone), s.timezone).weekday]);
    const inner = html`<span class="bk-wd">${d.day === today ? t(ctx, 'Heute') : wd}</span><span class="bk-dn">${ctx.lang === 'de' ? `${dd}.` : dd}</span><span class="bk-mo">${monthShort(m)}</span>`;
    return d.free
      ? html`<a class="bk-day" href="${link({ b_d: d.day, b_t: null })}"${d.day === chosen ? raw(' aria-current="true"') : ''} aria-label="${longDay(d.day, L(ctx))}">${inner}</a>`
      : html`<span class="bk-day off" aria-label="${t(ctx, '{day}: nichts frei', { day: longDay(d.day, L(ctx)) })}">${inner}</span>`;
  })}</div><div class="bk-pager">${from > today ? html`<a class="btn-2 bk-prev" href="${link({ b_from: shift(-14) <= today ? null : shift(-14), b_d: null, b_t: null })}">${t(ctx, 'Frühere Tage')}</a>` : html`<span></span>`}${
    shift(14) <= lastDay ? html`<a class="btn-2" href="${link({ b_from: shift(14), b_d: null, b_t: null })}">${t(ctx, 'Spätere Tage')}</a>` : ''
  }</div></section>`);
  if (!chosen) return join(out);

  // 4 – what time
  const slots = await slotsFor(service.id, chosen, party, ctx.now);
  const time = slots.find((x) => x.time === q.get('b_t'))?.time ?? null;
  out.push(html`<section class="bk-step" aria-labelledby="bk-time">${hx(ctx, t(ctx, 'Um wie viel Uhr?'), raw(' id="bk-time" class="bk-label"'))}${
    slots.length
      ? html`<div class="bk-chips">${slots.map((x) => html`<a class="bk-chip num" href="${link({ b_t: x.time })}"${x.time === time ? raw(' aria-current="true"') : ''}>${x.time}</a>`)}</div>`
      : html`<p class="bk-hint">${t(ctx, 'An diesem Tag ist leider nichts mehr frei.')}</p>`
  }</section>`);
  if (!time) return join(out);

  // 5 – who
  const summary = [longDay(chosen, L(ctx)), t(ctx, '{time} Uhr', { time }), table ? t(ctx, party === 1 ? '{n} Person' : '{n} Personen', { n: party }) : service.name].join(' · ');
  out.push(html`<section class="bk-step" aria-labelledby="bk-you">${hx(ctx, t(ctx, 'Deine Angaben'), raw(' id="bk-you" class="bk-label"'))}<p class="bk-summary">${summary}</p>
    <form class="nform" method="post" action="/_nova/booking" data-booking>
      <input type="hidden" name="service" value="${service.id}"><input type="hidden" name="day" value="${chosen}"><input type="hidden" name="time" value="${time}"><input type="hidden" name="party" value="${party}"><input type="hidden" name="_back" value="${link({})}"><input type="hidden" name="_t" value="${Date.now().toString(36)}">
      <div class="hp" aria-hidden="true"><label>${t(ctx, 'Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="two-col"><div class="fld"><label for="bk-name">${t(ctx, 'Name')} <span class="req" aria-hidden="true">*</span></label><input id="bk-name" name="name" required autocomplete="name"></div>
      <div class="fld"><label for="bk-mail">${t(ctx, 'E-Mail')} <span class="req" aria-hidden="true">*</span></label><input id="bk-mail" name="email" type="email" required autocomplete="email"></div></div>
      <div class="fld"><label for="bk-tel">${t(ctx, 'Telefon')} <span class="muted">${t(ctx, '(für Rückfragen)')}</span></label><input id="bk-tel" name="phone" type="tel" autocomplete="tel"></div>
      <div class="fld"><label for="bk-note">${t(ctx, 'Bemerkung')} <span class="muted">${t(ctx, '(optional)')}</span></label><textarea id="bk-note" name="note" maxlength="1000" placeholder="${table ? t(ctx, 'Allergien, Kinderstuhl, Anlass …') : t(ctx, 'Was wir vorher wissen sollten')}"></textarea></div>
      <div><button class="btn">${service.deposit && env.stripe.secretKey ? t(ctx, 'Weiter zur Anzahlung ({price})', { price: formatPrice(service.deposit) }) : s.booking.autoConfirm ? t(ctx, 'Verbindlich reservieren') : t(ctx, 'Anfrage senden')}</button></div>
      <p class="muted" style="font-size:var(--step-n1);margin:0">${s.booking.cancelHours ? `${t(ctx, 'Absagen geht bis {hours} Stunden vorher über den Link in der Bestätigung.', { hours: s.booking.cancelHours })} ` : ''}${raw(t(ctx, 'Mehr zum Datenschutz in der <a href="/datenschutz">Datenschutzerklärung</a>.'))}</p>
    </form></section>`);
  return join(out);
}
