import { html, raw, esc, cx, field, lines, join, hx, type Html } from './html';
import type { RenderContext } from './context';
import { picture, originalUrl, variantUrl } from './picture';
import { BLOCK_MAP } from '../shared/blocks';
import type { Block, EntryData, FormDef } from '../shared/types';
import type { LinkValue } from '../shared/fields';
import { publishedEntries, categoriesOf, getForm, sectionBlocks } from './data';
import { ALLERGENS, DISH_TAGS } from '../shared/collections';
import { entryPath } from '../shared/paths';
import { compactHours, DAYS, formatSlots, openStatus, zonedNow } from '../shared/hours';
import { listServices, openDays, slotsFor } from '../server/booking';
import { localDay, zonedToUtc, type BookingService } from '../shared/booking';
import { MONTHS, longDay } from '../shared/dates';
import { formatPrice, readingTime, stripHtml } from '../shared/text';
import { blocksText } from '../shared/blocks';
import { entryAccess } from '../shared/members';
import { membershipBox } from './members';
import { eventCards, upcoming } from './events';
import { donateBlock } from './donations';
import { findProperties, propertyCards } from './realestate';
import { env } from '../server/env';
import { t, L } from './i18n';

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

export async function productCards(ctx: RenderContext, items: Awaited<ReturnType<typeof publishedEntries>>['items']): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'products')!;
  await ctx.preloadMedia(items.map((i) => (i.data.images as string[])?.[0]));
  const cards = await Promise.all(
    items.map(async (i) => {
      const img = await ctx.media((i.data.images as string[])?.[0]);
      const variants = (i.data.variants as { price?: number; stock?: number }[]) ?? [];
      const stock = variants.length ? variants.reduce((s, v) => s + (v.stock ?? 999), 0) : (i.data.stock as number | null | undefined);
      const soldOut = stock === 0;
      const prices = variants.map((v) => v.price ?? (i.data.price as number));
      const from = prices.length && new Set(prices).size > 1 ? Math.min(...prices) : null;
      return html`<a class="card" href="${entryPath(c, i.slug)}">${img ? html`<div class="ph">${picture(img, { sizes: '(min-width: 56rem) 25vw, 50vw', maxWidth: 960, ratio: '4/5' })}</div>` : noPhoto(i.data.title)}<div>${hx(ctx, i.data.title)}<div class="price-row">${
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
        html`<li><div>${hx(ctx, it.title, field(ctx.edit, `items.${i}.title`))}${
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

  html(b, ctx) {
    const p = b.props as P;
    const vars = new Map(((p.vars as P[]) ?? []).map((v) => [v.key, v.value ?? '']));
    const out = String(p.code ?? '').replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => esc(vars.get(k) ?? ''));
    const safe = ctx.settings.security.allowCustomScripts ? out : out.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=/gi, ' data-x=');
    return html`<div class="wrap html-block">${raw(safe)}</div>`;
  },
};

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

/** Renders a block list, wrapping each block in its section element. */
export async function renderBlocks(blocks: Block[], ctx: RenderContext & { depth?: number }): Promise<Html> {
  const c = ctx as RenderContext;
  c.depth ??= 0;
  const out: Html[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const def = BLOCK_MAP[b.type];
    const fn = R[b.type];
    if (!def || !fn) continue;
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
    out.push(wrapBlock(b, inner, c));
  }
  return join(out);
}

export function wrapBlock(b: Block, inner: Html, ctx: RenderContext): Html {
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
  );
  const id = s.anchor || `b-${b.id}`;
  const css = s.css ? html`<style>${raw(scopeCss(s.css, id))}</style>` : '';
  const editAttrs = ctx.edit ? raw(` data-nova-block="${esc(b.id)}" data-nova-type="${esc(b.type)}" data-nova-lock="${esc(b.lock ?? 'none')}"`) : '';
  return html`<section class="${cls}" id="${id}" data-tone="${tone}"${editAttrs}>${css}${inner}</section>`;
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
