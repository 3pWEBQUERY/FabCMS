import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { picture, variantUrl, originalUrl } from './picture';
import { renderBlocks } from './blocks';
import { localized } from '../server/translations';
import { sql } from '../server/db';
import { entryPath } from '../shared/paths';
import { formatMoney } from '../shared/text';
import { PROPERTY_FEATURES, PROPERTY_KINDS, PROPERTY_OFFERS, PROPERTY_STATUS } from '../shared/collections';
import type { CollectionDef, EntryData } from '../shared/types';

/** Immobilien: search with filters (server-side, works without JavaScript), cards, detail page with inquiry. */

interface Item {
  id: string;
  slug: string;
  data: EntryData;
}

const label = (list: { value: string; label: string }[], v: unknown) => list.find((x) => x.value === v)?.label ?? '';
const rooms = (v: unknown) => (typeof v === 'number' && v > 0 ? `${String(v).replace('.5', '½').replace(/^0½/, '½')} Zi.` : '');
const num = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-CH') : '');

const chf = (ctx: RenderContext, cents: number) => formatMoney(cents, ctx.settings.shop.currency).replace(/\.00$/, '.–');

function priceText(ctx: RenderContext, d: EntryData): string {
  const p = typeof d.price === 'number' && d.price > 0 ? chf(ctx, d.price) : '';
  if (!p) return 'Preis auf Anfrage';
  return d.offer === 'rent' ? `${p} / Mt.` : p;
}

function place(d: EntryData): string {
  return [d.showStreet ? d.street : '', [d.zip, d.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export interface PropertyFilter {
  offer: string;
  kind: string;
  rooms: number;
  maxPrice: number;
  city: string;
}

export function readFilter(q: URLSearchParams): PropertyFilter {
  return {
    offer: PROPERTY_OFFERS.some((o) => o.value === q.get('angebot')) ? q.get('angebot')! : '',
    kind: PROPERTY_KINDS.some((o) => o.value === q.get('art')) ? q.get('art')! : '',
    rooms: Math.max(0, Number(q.get('zimmer')) || 0),
    maxPrice: Math.max(0, Math.round(Number(q.get('bis')) || 0)) * 100,
    city: (q.get('ort') ?? '').trim().slice(0, 60),
  };
}

/** Available first, then reserved; rented/sold ones only when asked for (references). */
export async function findProperties(f: Partial<PropertyFilter>, o: { limit?: number; includeDone?: boolean } = {}): Promise<Item[]> {
  const d = sql`published_data`;
  const rows = await sql`
    select id, slug, published_data as data from entries
    where collection = 'properties' and status = 'published'
      ${o.includeDone ? sql`` : sql`and coalesce(${d} ->> 'status', 'available') <> 'done'`}
      ${f.offer ? sql`and ${d} ->> 'offer' = ${f.offer}` : sql``}
      ${f.kind ? sql`and ${d} ->> 'kind' = ${f.kind}` : sql``}
      ${f.rooms ? sql`and coalesce((${d} ->> 'rooms')::numeric, 0) >= ${f.rooms}` : sql``}
      ${f.maxPrice ? sql`and (${d} ->> 'price') is not null and (${d} ->> 'price')::numeric <= ${f.maxPrice}` : sql``}
      ${f.city ? sql`and (lower(${d} ->> 'city') like ${'%' + f.city.toLowerCase().replace(/[%_]/g, '') + '%'} or ${d} ->> 'zip' like ${f.city.replace(/[%_]/g, '') + '%'})` : sql``}
    order by case coalesce(${d} ->> 'status', 'available') when 'available' then 0 when 'reserved' then 1 else 2 end, published_at desc
    limit ${o.limit ?? 200}`.then((r) => localized(r as unknown as { id: string; slug: string; data: EntryData }[], 'properties'));
  return rows as unknown as Item[];
}

export async function propertyCards(ctx: RenderContext, items: Item[]): Promise<Html> {
  const c = ctx.collections.find((x) => x.id === 'properties');
  if (!c) return html``;
  await ctx.preloadMedia(items.map((i) => (i.data.images as string[] | undefined)?.[0]));
  return html`<div class="re-grid">
    ${await Promise.all(
      items.map(async (i) => {
        const d = i.data;
        const img = await ctx.media((d.images as string[] | undefined)?.[0]);
        const facts = [rooms(d.rooms), d.area ? `${num(d.area)} m²` : '', label(PROPERTY_KINDS, d.kind)].filter(Boolean);
        const status = d.status && d.status !== 'available' ? html`<span class="re-status">${label(PROPERTY_STATUS, d.status)}</span>` : '';
        return html`<a class="card re-card${d.status === 'done' ? ' is-off' : ''}" href="${entryPath(c, i.slug)}"
          ><div class="ph">
            ${img ? picture(img, { sizes: '(min-width: 56rem) 30vw, 100vw', maxWidth: 1280, ratio: '4/3' }) : html`<span class="re-noimg" aria-hidden="true"></span>`}${status}<span
              class="re-offer"
              >${label(PROPERTY_OFFERS, d.offer)}</span
            >
          </div>
          <div class="re-body">
            <span class="re-place">${place(d)}</span>
            <h3>${d.title}</h3>
            <p class="re-facts">${facts.join(' · ')}</p>
            <p class="re-price num">${priceText(ctx, d)}</p>
          </div></a
        >`;
      }),
    )}
  </div>`;
}

/** The list page: filter form (GET, so results can be bookmarked and shared) and results. */
export async function propertyList(ctx: RenderContext, c: CollectionDef): Promise<{ main: Html; description: string }> {
  const f = readFilter(ctx.query);
  const items = await findProperties(f);
  const cities = (
    await sql`select distinct published_data ->> 'city' as city from entries where collection = 'properties' and status = 'published' and coalesce(published_data ->> 'city', '') <> '' order by 1`
  ).map((r) => r.city as string);
  const opt = (value: string, text: string, current: string) => html`<option value="${value}" ${value === current ? raw(' selected') : ''}>${text}</option>`;
  const filtered = f.offer || f.kind || f.rooms || f.maxPrice || f.city;
  const form = html`<form class="re-filter" method="get" action="${c.list_route}" role="search" aria-label="Objekte filtern">
    <div class="fld">
      <label for="re-offer">Angebot</label
      ><select id="re-offer" name="angebot">
        ${opt('', 'Miete & Kauf', f.offer)}${PROPERTY_OFFERS.map((o) => opt(o.value, o.label, f.offer))}
      </select>
    </div>
    <div class="fld">
      <label for="re-kind">Art</label
      ><select id="re-kind" name="art">
        ${opt('', 'Alle', f.kind)}${PROPERTY_KINDS.map((o) => opt(o.value, o.label, f.kind))}
      </select>
    </div>
    <div class="fld">
      <label for="re-rooms">Zimmer ab</label
      ><select id="re-rooms" name="zimmer">
        ${opt('', 'egal', f.rooms ? String(f.rooms) : '')}${['1', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map((r) => opt(r, r.replace('.5', '½'), f.rooms ? String(f.rooms) : ''))}
      </select>
    </div>
    <div class="fld">
      <label for="re-max">Preis bis</label
      ><input id="re-max" name="bis" inputmode="numeric" placeholder="CHF" value="${f.maxPrice ? String(f.maxPrice / 100) : ''}" maxlength="9" />
    </div>
    <div class="fld">
      <label for="re-city">Ort oder PLZ</label><input id="re-city" name="ort" value="${f.city}" maxlength="60" placeholder="${cities.slice(0, 2).join(', ')}" autocomplete="off" />
    </div>
    <div class="re-filter-go"><button class="btn">Suchen</button>${filtered ? html`<a class="btn-2" href="${c.list_route}">Zurücksetzen</a>` : ''}</div>
  </form>`;
  const count = html`<p class="re-count" role="status">${items.length ? `${items.length} ${items.length === 1 ? 'Objekt' : 'Objekte'}` : ''}</p>`;
  const results = items.length
    ? await propertyCards(ctx, items)
    : html`<p class="muted">
        ${filtered
          ? 'Mit diesen Filtern passt gerade nichts. Lockere die Suche – oder lass dich benachrichtigen, wenn etwas Passendes kommt: '
          : 'Gerade ist alles vergeben. '}${ctx.settings.business.email ? html`<a href="mailto:${ctx.settings.business.email}">Schreib uns</a>.` : ''}
      </p>`;
  return {
    main: html`<div class="wrap art-head"><h1>${c.name}</h1></div>
      <section class="b sp-m"><div class="wrap">${form}${count}${results}</div></section>`,
    description: `${items.length} Objekte von ${ctx.settings.name}${f.city ? ` in ${f.city}` : ''}.`,
  };
}

export async function propertyTemplate(ctx: RenderContext, c: CollectionDef, e: Item): Promise<Html> {
  const d = e.data;
  ctx.h1 = true;
  const ids = (d.images as string[] | undefined) ?? [];
  await ctx.preloadMedia(ids);
  const imgs = (await Promise.all(ids.map((id) => ctx.media(id)))).filter((m) => m !== null);
  if (imgs.length) ctx.needs.add('lightbox');
  const doc = await ctx.media(d.documents);
  const rows: [string, string][] = [
    ['Angebot', label(PROPERTY_OFFERS, d.offer)],
    ['Art', label(PROPERTY_KINDS, d.kind)],
    ['Zimmer', rooms(d.rooms).replace(' Zi.', '')],
    ['Fläche', d.area ? `${num(d.area)} m²` : ''],
    ['Grundstück', d.plot ? `${num(d.plot)} m²` : ''],
    ['Etage', (d.floor as string) || ''],
    ['Baujahr', d.yearBuilt ? String(d.yearBuilt) : ''],
    ['Bezug', (d.availableFrom as string) || ''],
    [d.offer === 'rent' ? 'Miete brutto' : 'Preis', priceText(ctx, d)],
    ['Nebenkosten', d.offer === 'rent' && typeof d.extraCosts === 'number' && d.extraCosts > 0 ? `${chf(ctx, d.extraCosts)} / Mt.` : ''],
    ['Adresse', place(d)],
  ];
  const features = ((d.features as string[] | undefined) ?? []).map((f) => label(PROPERTY_FEATURES, f)).filter(Boolean);
  ctx.jsonLd.push(
    propertyLd(
      ctx,
      c,
      e,
      imgs.map((m) => ctx.base + variantUrl(m, 1280, 'jpg')),
    ),
  );
  const q = ctx.query;
  const sent = q.get('anfrage') === '1';
  const err = q.get('a_err');
  const statusNote =
    d.status === 'reserved'
      ? 'Reserviert – du kannst dich trotzdem melden, falls es nicht klappt.'
      : d.status === 'done'
        ? d.offer === 'rent'
          ? 'Bereits vermietet.'
          : 'Bereits verkauft.'
        : '';
  const [hero, ...rest] = imgs;
  return html`<article class="re"><header class="wrap art-head"><span class="label">${place(d)}</span><h1${ctx.edit ? raw(' data-nova-entry-field="title"') : ''}>${d.title}</h1><p class="re-headline"><strong class="num">${priceText(
    ctx,
    d,
  )}</strong>${[rooms(d.rooms), d.area ? `${num(d.area)} m²` : ''].filter(Boolean).map((x) => html`<span>${x}</span>`)}</p>${statusNote ? html`<p class="form-err" role="status">${statusNote}</p>` : ''}</header>${
    hero
      ? html`<div class="wrap re-gallery" data-lightbox>
          <a class="re-hero" href="${variantUrl(hero, 1920, 'webp')}" data-caption="${hero.caption || hero.alt}"
            >${picture(hero, {
              sizes: '(min-width: 78rem) 52rem, 100vw',
              priority: true,
              ratio: '3/2',
            })}</a
          >${rest
            .slice(0, 4)
            .map(
              (m, i) =>
                html`<a href="${variantUrl(m, 1920, 'webp')}" data-caption="${m.caption || m.alt}" ${i === 3 && rest.length > 4 ? raw(` data-more="+${rest.length - 4}"`) : ''}
                  >${picture(m, { sizes: '(min-width: 78rem) 25rem, 50vw', ratio: '3/2', maxWidth: 960 })}</a
                >`,
            )}${rest.slice(4).map((m) => html`<a hidden href="${variantUrl(m, 1920, 'webp')}" data-caption="${m.caption || m.alt}"></a>`)}
        </div>`
      : ''
  }<div class="wrap re-layout"><div class="re-main">${d.excerpt ? html`<p class="lead">${d.excerpt as string}</p>` : ''}<dl class="re-facts-table">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        html`<div>
          <dt>${k}</dt>
          <dd>${v}</dd>
        </div>`,
    )}</dl>${
    features.length
      ? html`<h2 class="re-h">Ausstattung</h2>
          <ul class="re-features">
            ${features.map((f) => html`<li>${f}</li>`)}
          </ul>`
      : ''
  }${doc ? html`<p><a class="btn-2" href="${originalUrl(doc)}" download>Dokumentation herunterladen (PDF)</a></p>` : ''}</div><aside class="re-aside" id="anfrage" aria-labelledby="anfrage-h"><h2 id="anfrage-h">Interessiert?</h2>${
    sent
      ? html`<p class="form-ok" role="status">Danke! Wir melden uns so bald wie möglich.</p>`
      : html`${err ? html`<p class="form-err" role="alert">${err}</p>` : ''}
          <form class="nform" method="post" action="/_nova/immobilien/${e.id}/anfrage">
            <input type="hidden" name="_t" value="${Date.now().toString(36)}" />
            <div class="hp" aria-hidden="true">
              <label>Bitte leer lassen <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
            </div>
            <div class="fld"><label for="a-name">Name</label><input id="a-name" name="name" required autocomplete="name" maxlength="120" /></div>
            <div class="fld"><label for="a-email">E-Mail</label><input id="a-email" type="email" name="email" required autocomplete="email" maxlength="200" /></div>
            <div class="fld">
              <label for="a-phone">Telefon <span class="muted">(freiwillig)</span></label
              ><input id="a-phone" type="tel" name="phone" autocomplete="tel" maxlength="40" />
            </div>
            <div class="fld">
              <label for="a-msg">Nachricht</label><textarea id="a-msg" name="message" maxlength="2000" rows="4">Ich interessiere mich für «${d.title}».</textarea>
            </div>
            <div class="fld check"><input type="checkbox" id="a-visit" name="visit" value="1" /><label for="a-visit">Ich möchte das Objekt besichtigen</label></div>
            <div><button class="btn">Anfrage senden</button></div>
            <p class="muted" style="font-size:var(--step-n1);margin:0">Deine Angaben verwenden wir nur für diese Anfrage. <a href="/datenschutz">Datenschutz</a></p>
          </form>`
  }${ctx.settings.business.phone ? html`<p class="re-phone">Oder ruf an: <a href="tel:${ctx.settings.business.phone.replace(/[^+\d]/g, '')}">${ctx.settings.business.phone}</a></p>` : ''}</aside></div><div class="art-body">${await renderBlocks(
    d.blocks ?? [],
    ctx,
  )}</div><nav class="wrap pager" aria-label="Zurück"><a class="btn-2" href="${c.list_route}">Alle Objekte</a></nav></article>`;
}

function propertyLd(ctx: RenderContext, c: CollectionDef, e: Item, images: string[]): Record<string, unknown> {
  const d = e.data;
  const type = { apartment: 'Apartment', house: 'SingleFamilyResidence', room: 'Room', commercial: 'Place', parking: 'Place', land: 'Place' }[d.kind as string] ?? 'Place';
  const url = ctx.base + entryPath(c, e.slug);
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: d.title,
    description: (d.excerpt as string) || undefined,
    url,
    image: images.length ? images : undefined,
    datePosted: undefined,
    about: {
      '@type': type,
      numberOfRooms: typeof d.rooms === 'number' ? d.rooms : undefined,
      floorSize: d.area ? { '@type': 'QuantitativeValue', value: d.area, unitCode: 'MTK' } : undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress: d.showStreet ? d.street : undefined,
        postalCode: d.zip || undefined,
        addressLocality: d.city,
        addressCountry: ctx.settings.business.country || 'CH',
      },
    },
    offers:
      typeof d.price === 'number' && d.price > 0
        ? {
            '@type': 'Offer',
            price: (d.price / 100).toFixed(2),
            priceCurrency: ctx.settings.shop.currency,
            businessFunction: d.offer === 'rent' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
            availability: d.status === 'done' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          }
        : undefined,
  };
}
