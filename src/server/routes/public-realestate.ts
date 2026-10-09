import type { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { sql, json } from '../db';
import { getSettings } from '../settings';
import { env } from '../env';
import { clientIp } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { shortId } from '../../shared/text';
import { entryPath } from '../../shared/paths';
import { recordGoal } from '../analytics';
import { emit } from '../events';
import { notify } from '../notify';
import { sendMail } from '../mail';
import { activeCollections } from '../content';
import { looksLikeSpam } from './public';

/** Inquiry for a property: becomes a contact in the CRM (with the request as a note) and a mail to the office. */
export function realestatePublicRoutes(app: Hono<AppEnv>) {
  app.post('/_nova/immobilien/:id{[0-9a-f-]{36}}/anfrage', async (c) => {
    const s = await getSettings();
    const [e] =
      await sql`select id, published_slug as slug, published_data as data from entries where id = ${c.req.param('id')} and collection = 'properties' and status = 'published'`;
    if (!e) return c.notFound();
    const col = (await activeCollections()).find((x) => x.id === 'properties');
    const path = (col && entryPath(col, e.slug as string)) || '/';
    const body = (await c.req.parseBody()) as Record<string, string>;
    const back = (params: string) => c.redirect(`${path}?${params}#anfrage`, 303);
    if (looksLikeSpam(body)) return back('anfrage=1');
    if (!rateLimit(`property:${clientIp(c)}`, 5, 10 * 60_000).ok) return back(`a_err=${encodeURIComponent('Zu viele Anfragen. Bitte warte ein paar Minuten.')}`);
    const name = String(body.name ?? '')
      .trim()
      .slice(0, 120);
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const phone = String(body.phone ?? '')
      .trim()
      .slice(0, 40);
    const message = String(body.message ?? '')
      .trim()
      .slice(0, 2000);
    const visit = body.visit === '1';
    if (!name) return back(`a_err=${encodeURIComponent('Bitte gib deinen Namen an.')}`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return back(`a_err=${encodeURIComponent('Bitte gib eine gültige E-Mail-Adresse an.')}`);
    const title = String(e.data.title ?? '');
    const note = { id: shortId(8), text: `Anfrage zu «${title}»${visit ? ' – möchte besichtigen' : ''}:\n${message}`, at: new Date().toISOString(), by: 'Website' };
    const source = `Immobilie: ${title}`.slice(0, 120);
    const [existing] = await sql`select id from contacts where lower(email) = ${email}`;
    let contactId: string;
    if (existing) {
      contactId = existing.id as string;
      await sql`
        update contacts set notes = notes || ${json([note])}, updated_at = now(), status = case when status in ('won', 'lost') then 'new' else status end,
          phone = case when phone = '' then ${phone} else phone end, name = case when name = '' then ${name} else name end
        where id = ${contactId}`;
    } else {
      const [ct] = await sql`insert into contacts (email, name, phone, source, notes) values (${email}, ${name}, ${phone}, ${source}, ${json([note])}) returning id`;
      contactId = ct.id as string;
      emit('lead.created', { id: contactId, email, name, source });
    }
    await recordGoal('property', clientIp(c), c.req.header('user-agent') ?? '', path);
    void notify({ kind: 'form', cap: 'leads.view', title: `Anfrage: ${title}`, body: `${name}${visit ? ' möchte besichtigen' : ''}`, href: `/kontakte/${contactId}` });
    const to = s.business.email;
    if (to)
      await sendMail({
        to,
        replyTo: email,
        subject: `Anfrage${visit ? ' mit Besichtigung' : ''}: ${title}`,
        text: [
          `${name} <${email}>${phone ? `, ${phone}` : ''}`,
          visit ? 'Möchte das Objekt besichtigen.' : '',
          '',
          message,
          '',
          `${(s.baseUrl || env.publicUrl).replace(/\/$/, '')}${path}`,
        ]
          .filter((l, i) => l !== '' || i > 1)
          .join('\n'),
      });
    return back('anfrage=1');
  });
}
