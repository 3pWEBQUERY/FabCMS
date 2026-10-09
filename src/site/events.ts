import { html, raw, type Html } from './html';
import type { RenderContext } from './context';
import { picture } from './picture';
import { renderBlocks } from './blocks';
import { localized } from '../server/translations';
import { sql } from '../server/db';
import { env } from '../server/env';
import { availability, describeWhen, salesOpen, type Availability, type TicketEntry } from '../server/tickets';
import { entryPath } from '../shared/paths';
import { formatMoney } from '../shared/text';
import { dateBadge, formatSession, sessionsOf, MAX_TICKETS_PER_ORDER } from '../shared/events';
import type { CollectionDef, EntryData } from '../shared/types';
import { L, t } from './i18n';

/** Events & Kurse on the website: detail page with tickets, cards for lists and the block. */

interface Item {
  id: string;
  slug: string;
  data: EntryData;
}

const isCourse = (c: Pick<CollectionDef, 'id'>) => c.id === 'courses';
/** «Anmelden» for a course means «sign up», not «sign in» (the shared key «Anmelden» is the login). */
const signUp = (ctx: RenderContext) => t(ctx, 'Anmelden|Kurs');
const money = (ctx: RenderContext, cents: number) => (cents ? formatMoney(cents, ctx.settings.shop.currency) : t(ctx, 'Gratis'));

function place(ctx: RenderContext, d: EntryData): { name: string; address: string } {
  const b = ctx.settings.business;
  return {
    name: (d.venue as string) || (d.address ? '' : ctx.settings.name),
    address: (d.address as string) || [b.street, [b.zip, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
}

/** Upcoming first; past ones only on request. Cancelled ones stay visible, marked. */
export async function upcoming(collection: 'events' | 'courses', timeZone: string, o: { limit?: number; past?: boolean; category?: string } = {}): Promise<Item[]> {
  const rows = await sql`
    select id, slug, published_data as data from entries
    where collection = ${collection} and status = 'published'
      and ${o.category ? sql`lower(published_data ->> 'category') = lower(${o.category})` : sql`true`}
    order by published_data ->> 'start' ${o.past ? sql`desc` : sql`asc`} nulls last
    limit 500`.then((r) => localized(r as unknown as { id: string; slug: string; data: EntryData }[], collection));
  const now = Date.now();
  // Ends count, not starts: an evening that is running is still «upcoming».
  const items = (rows as unknown as Item[]).filter((r) => {
    const s = sessionsOf(r.data, timeZone);
    const last = s[s.length - 1];
    const end = last ? (last.end ?? new Date(last.start.getTime() + 3 * 3_600_000)).getTime() : 0;
    return o.past ? end < now - 12 * 3_600_000 : end >= now - 12 * 3_600_000;
  });
  return items.slice(0, o.limit ?? 100);
}

function statusTag(ctx: RenderContext, d: EntryData, avail: Availability[] | null, course: boolean): Html {
  if (d.cancelled) return html`<span class="ev-tag bad">${t(ctx, 'Abgesagt')}</span>`;
  if (!avail || !avail.length) return html``;
  const left = avail.every((a) => a.left === null) ? null : avail.reduce((n, a) => n + (a.left ?? 999), 0);
  if (left === 0) return html`<span class="ev-tag">${t(ctx, course ? 'Ausgebucht' : 'Ausverkauft')}</span>`;
  if (left !== null && left <= 5) return html`<span class="ev-tag hot">${t(ctx, left === 1 ? 'Noch {n} Platz' : 'Noch {n} Plätze', { n: left })}</span>`;
  return html``;
}

export async function eventCards(ctx: RenderContext, c: CollectionDef, items: Item[]): Promise<Html> {
  if (!items.length) return html`<p class="muted">${t(ctx, isCourse(c) ? 'Gerade sind keine Kurse ausgeschrieben.' : 'Gerade sind keine Anlässe geplant.')} ${t(ctx, 'Schau bald wieder vorbei.')}</p>`;
  const tz = ctx.settings.timezone;
  await ctx.preloadMedia(items.map((i) => i.data.cover));
  const cards = await Promise.all(
    items.map(async (i) => {
      const sessions = sessionsOf(i.data, tz);
      const first = sessions[0];
      const b = first ? dateBadge(first.start, tz, L(ctx)) : null;
      const where = place(ctx, i.data);
      const avail = await availability({ ...i, collection: c.id as TicketEntry['collection'] });
      const from = avail.length ? Math.min(...avail.map((a) => a.price)) : null;
      const meta = [
        b ? `${b.weekday} ${b.time}${sessions.length > 1 ? ` · ${t(ctx, '{n} Termine', { n: sessions.length })}` : ''}` : '',
        where.name,
        from === null ? '' : from === 0 && avail.every((a) => a.price === 0) ? t(ctx, 'Gratis') : t(ctx, 'ab {price}', { price: money(ctx, from) }),
      ].filter(Boolean);
      return html`<li>
        <a class="ev-card${i.data.cancelled ? ' is-off' : ''}" href="${entryPath(c, i.slug)}"
          >${b ? html`<span class="ev-date" aria-hidden="true"><b>${b.day}</b><span>${b.month}</span></span>` : html`<span></span>`}<span class="ev-main"
            ><span class="ev-title">${i.data.title}</span
            ><span class="ev-meta">${first ? html`<time datetime="${first.start.toISOString()}" class="sr">${formatSession(first, tz, L(ctx))}</time>` : ''}${meta.join(' · ')}</span>${i
              .data.excerpt
              ? html`<span class="ev-excerpt">${i.data.excerpt as string}</span>`
              : ''}</span
          >${statusTag(ctx, i.data, avail, isCourse(c))}</a
        >
      </li>`;
    }),
  );
  return html`<ul class="ev-list">
    ${cards}
  </ul>`;
}

/** Detail page. */
export async function eventTemplate(ctx: RenderContext, c: CollectionDef, e: { id: string; slug: string; data: EntryData }, image: string | null): Promise<Html> {
  const d = e.data;
  const tz = ctx.settings.timezone;
  ctx.h1 = true;
  const course = isCourse(c);
  const sessions = sessionsOf(d, tz);
  const cover = await ctx.media(d.cover);
  const where = place(ctx, d);
  const entry: TicketEntry = { id: e.id, collection: c.id as TicketEntry['collection'], slug: e.slug, data: d };
  const avail = await availability(entry);
  ctx.jsonLd.push(eventLd(ctx, c, e, sessions, avail, image));
  const facts: Html[] = [];
  facts.push(
    html`<div>
      <dt>${t(ctx, sessions.length > 1 ? 'Termine' : 'Wann')}</dt>
      <dd>
        ${sessions.length > 1
          ? html`<ol class="ev-sessions">
              ${sessions.map((s) => html`<li><time datetime="${s.start.toISOString()}">${formatSession(s, tz, L(ctx))}</time></li>`)}
            </ol>`
          : sessions[0]
            ? html`<time datetime="${sessions[0].start.toISOString()}">${formatSession(sessions[0], tz, L(ctx))}</time>`
            : t(ctx, 'Datum folgt')}
      </dd>
    </div>`,
  );
  if (where.name || where.address)
    facts.push(
      html`<div>
        <dt>${t(ctx, 'Wo')}</dt>
        <dd>${where.name}${where.name && where.address ? html`<br />` : ''}${where.address}</dd>
      </div>`,
    );
  if (d.instructor)
    facts.push(
      html`<div>
        <dt>${t(ctx, 'Leitung')}</dt>
        <dd>${d.instructor as string}</dd>
      </div>`,
    );
  if (d.level)
    facts.push(
      html`<div>
        <dt>${t(ctx, 'Niveau')}</dt>
        <dd>${d.level as string}</dd>
      </div>`,
    );
  if (avail.length)
    facts.push(
      html`<div>
        <dt>${t(ctx, course ? 'Kosten' : 'Eintritt')}</dt>
        <dd>${avail.map((a) => html`<span class="ev-price">${a.name}: ${money(ctx, a.price)}</span>`)}</dd>
      </div>`,
    );
  const body = await renderBlocks(d.blocks ?? [], ctx);
  return html`<article class="ev"><header class="wrap art-head ev-head">${d.category ? html`<a class="label" href="${c.list_route}?kategorie=${encodeURIComponent(d.category as string)}">${d.category as string}</a>` : ''}<h1${
    ctx.edit ? raw(' data-nova-entry-field="title"') : ''
  }>${d.title}</h1>${d.excerpt ? html`<p class="lead">${d.excerpt as string}</p>` : ''}${
    d.cancelled ? html`<p class="form-err" role="status"><strong>${t(ctx, 'Abgesagt.')}</strong> ${t(ctx, course ? 'Dieser Kurs findet nicht statt.' : 'Dieser Anlass findet nicht statt.')}</p>` : ''
  }<dl class="ev-facts">${facts}</dl><div class="actions">${
    avail.length && salesOpen(entry, ctx.settings) ? html`<a class="btn" href="#tickets">${course ? signUp(ctx) : t(ctx, 'Tickets')}</a>` : ''
  }${sessions.length ? html`<a class="btn-2" href="/_nova/ics/${e.id}.ics">${t(ctx, 'In den Kalender')}</a>` : ''}</div>${
    cover ? html`<figure class="art-cover">${picture(cover, { sizes: '(min-width: 78rem) 78rem, 100vw', priority: true })}</figure>` : ''
  }</header><div class="art-body">${body}</div>${avail.length ? ticketBox(ctx, entry, avail, course) : ''}</article>`;
}

function ticketBox(ctx: RenderContext, entry: TicketEntry, avail: Availability[], course: boolean): Html {
  const q = ctx.query;
  const open = salesOpen(entry, ctx.settings);
  const soldOut = avail.every((a) => a.left === 0);
  const paid = avail.some((a) => a.price > 0);
  const payable = !paid || Boolean(env.stripe.secretKey);
  const err = q.get('t_err');
  let inner: Html;
  if (!open)
    inner = html`<p class="muted">
      ${t(ctx, entry.data.cancelled ? 'Abgesagt – keine Anmeldung möglich.' : course ? 'Die Anmeldung ist geschlossen.' : 'Dieser Anlass hat bereits begonnen oder stattgefunden.')}
    </p>`;
  else if (soldOut)
    inner =
      q.get('t_wait') === '1'
        ? html`<p class="form-ok" role="status">${t(ctx, 'Du stehst auf der Warteliste. Wird ein Platz frei, schreiben wir dir sofort.')}</p>`
        : entry.data.waitlist === false
          ? html`<p>${t(ctx, course ? 'Ausgebucht.' : 'Ausverkauft.')}</p>`
          : html`<p>${t(ctx, course ? 'Ausgebucht.' : 'Ausverkauft.')} ${t(ctx, 'Trag dich in die Warteliste ein – wird ein Platz frei, bekommst du sofort eine E-Mail.')}</p>
              ${err ? html`<p class="form-err" role="alert">${err}</p>` : ''}
              <form class="nform tk-form" method="post" action="/_nova/tickets/${entry.id}/warteliste">
                ${hidden(ctx)}
                <div class="tk-person">
                  <div class="fld"><label for="w-name">${t(ctx, 'Name')}</label><input id="w-name" name="name" required autocomplete="name" maxlength="120" /></div>
                  <div class="fld"><label for="w-email">${t(ctx, 'E-Mail')}</label><input id="w-email" type="email" name="email" required autocomplete="email" maxlength="200" /></div>
                </div>
                <div><button class="btn">${t(ctx, 'Auf die Warteliste')}</button></div>
              </form>`;
  else if (!payable)
    inner = html`<p>
      ${t(ctx, 'Die Online-Anmeldung ist gerade nicht möglich.')}
      ${ctx.settings.business.email ? html`${t(ctx, 'Schreib uns:')} <a href="mailto:${ctx.settings.business.email}">${ctx.settings.business.email}</a>` : ''}
    </p>`;
  else {
    const rows = avail.map((a, i) => {
      const max = a.left === null ? MAX_TICKETS_PER_ORDER : Math.min(MAX_TICKETS_PER_ORDER, a.left);
      const id = `tk-${i}`;
      const left =
        a.left === 0
          ? html`<span class="tk-left">${t(ctx, 'Ausverkauft')}</span>`
          : a.left !== null && a.left <= 10
            ? html`<span class="tk-left">${t(ctx, a.left === 1 ? 'Noch {n} Platz' : 'Noch {n} Plätze', { n: a.left })}</span>`
            : '';
      return html`<div class="tk-row${a.left === 0 ? ' is-off' : ''}">
        <label for="${id}" class="tk-name"><strong>${a.name}</strong>${a.note ? html`<span>${a.note}</span>` : ''}${left}</label
        ><span class="tk-price num">${money(ctx, a.price)}</span>${a.left === 0
          ? html`<span class="tk-qty"></span>`
          : html`<select id="${id}" name="q_${i}" class="tk-qty" aria-label="${t(ctx, 'Anzahl {name}', { name: a.name })}">
              ${Array.from({ length: max + 1 }, (_, n) => html`<option value="${n}" ${n === (avail.length === 1 ? 1 : 0) ? raw(' selected') : ''}>${n}</option>`)}
            </select>`}
      </div>`;
    });
    inner = html`${err ? html`<p class="form-err" role="alert">${err}</p>` : ''}
      <form class="nform tk-form" method="post" action="/_nova/tickets/${entry.id}">
        ${hidden(ctx)}
        <div class="tk-rows">${rows}</div>
        <div class="tk-person">
          <div class="fld"><label for="t-name">${t(ctx, 'Name')}</label><input id="t-name" name="name" required autocomplete="name" maxlength="120" /></div>
          <div class="fld"><label for="t-email">${t(ctx, 'E-Mail')}</label><input id="t-email" type="email" name="email" required autocomplete="email" maxlength="200" /></div>
        </div>
        <div class="tk-submit">
          <button class="btn">${t(ctx, paid ? 'Weiter zur Zahlung' : course ? 'Verbindlich anmelden' : 'Tickets bestellen')}</button>
          <p class="muted">
            ${paid ? `${t(ctx, 'Bezahlen mit TWINT, Karte, Apple Pay oder Google Pay.')} ` : ''}${t(ctx, course ? 'Die Bestätigung kommen per E-Mail.' : 'Die Tickets kommen per E-Mail.')}
            <a href="/datenschutz">${t(ctx, 'Datenschutz')}</a>
          </p>
        </div>
      </form>`;
  }
  return html`<section class="wrap tk" id="tickets" aria-labelledby="tickets-h">
    <h2 id="tickets-h">${t(ctx, course ? 'Anmeldung' : 'Tickets')}</h2>
    ${inner}
  </section>`;
}

const hidden = (ctx: RenderContext) =>
  html`<input type="hidden" name="_back" value="${ctx.path}" /><input type="hidden" name="_t" value="${Date.now().toString(36)}" />
    <div class="hp" aria-hidden="true">
      <label>${t(ctx, 'Bitte leer lassen')} <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
    </div>`;

function eventLd(ctx: RenderContext, c: CollectionDef, e: Item, sessions: ReturnType<typeof sessionsOf>, avail: Availability[], image: string | null): Record<string, unknown> {
  const url = ctx.base + entryPath(c, e.slug);
  const where = place(ctx, e.data);
  const location = { '@type': 'Place', name: where.name || ctx.settings.name, address: where.address || undefined };
  const offers = avail.map((a) => ({
    '@type': 'Offer',
    name: a.name,
    price: (a.price / 100).toFixed(2),
    priceCurrency: ctx.settings.shop.currency,
    availability: a.left === 0 ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    url: `${url}#tickets`,
  }));
  const status = e.data.cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled';
  const event = (s: (typeof sessions)[number]) => ({
    '@type': 'Event',
    name: e.data.title,
    startDate: s.start.toISOString(),
    endDate: s.end?.toISOString(),
    eventStatus: status,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location,
    image: image ?? undefined,
    description: (e.data.excerpt as string) || undefined,
    offers: offers.length ? offers : undefined,
    organizer: { '@type': 'Organization', name: ctx.settings.name, url: ctx.base },
    url,
  });
  if (isCourse(c))
    return {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: e.data.title,
      description: (e.data.excerpt as string) || e.data.title,
      provider: { '@type': 'Organization', name: ctx.settings.name, url: ctx.base },
      offers: offers.length ? offers.map((o) => ({ ...o, category: 'Paid' })) : undefined,
      hasCourseInstance: [
        {
          '@type': 'CourseInstance',
          courseMode: 'Onsite',
          location,
          instructor: e.data.instructor ? { '@type': 'Person', name: e.data.instructor } : undefined,
          courseSchedule: sessions.length
            ? { '@type': 'Schedule', startDate: sessions[0].start.toISOString(), endDate: sessions[sessions.length - 1].start.toISOString(), repeatCount: sessions.length }
            : undefined,
        },
      ],
      url,
    };
  return { '@context': 'https://schema.org', ...event(sessions[0] ?? { start: new Date(), end: null }) };
}

export { describeWhen };
