import type { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db';
import { audit, requireAnyCap, type AppEnv } from '../auth';
import { getCollection, getEntry } from '../content';
import { badRequest, clientIp, HttpError, notFound } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { token } from '../lib/crypto';
import { entryPath } from '../../shared/paths';
import { html } from '../../site/html';
import { t } from '../../site/i18n';
import { createContext, renderPage, renderSystemPage } from '../../site/render';
import { getSettings } from '../settings';
import { activeCollections } from '../content';
import { parseLang, translationView } from '../translations';
import { assertCanEdit, canvasContext, withLang } from './api-content';

/** Longest a shared preview stays valid. */
const MAX_DAYS = 90;

function linkRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    url: `/_nova/vorschau/${r.token as string}`,
    lang: r.lang,
    note: r.note,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_used_at: r.last_used_at,
    uses: r.uses,
    created_by_name: r.created_by_name ?? null,
  };
}

/**
 * A draft shown to someone without an account – a client, the boss – through
 * a secret link that runs out and can be withdrawn. It always shows the
 * latest saved draft, never indexed, never cached.
 */
export function shareApi(app: Hono<AppEnv>) {
  app.get('/api/entries/:id/preview-links', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    const rows = await sql`
      select p.*, u.name as created_by_name from preview_links p left join users u on u.id = p.created_by
      where p.entry_id = ${e.id} and p.expires_at > now() order by p.created_at desc`;
    return c.json({ links: rows.map(linkRow) });
  });

  app.post('/api/entries/:id/preview-links', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z.object({ days: z.number().int().min(1).max(MAX_DAYS), note: z.string().max(120).optional(), lang: z.string().max(5).optional() }).parse(await c.req.json());
    const e = await getEntry(c.req.param('id'));
    assertCanEdit(user, e);
    if (!entryPath(await getCollection(e.collection), e.slug)) throw badRequest('Dieser Inhalt hat keine eigene Seite, die man zeigen könnte.');
    const lang = await parseLang(body.lang);
    const [r] = await sql`
      insert into preview_links (token, entry_id, lang, note, created_by, expires_at)
      values (${token(18)}, ${e.id}, ${lang}, ${(body.note ?? '').trim()}, ${user.id}, now() + make_interval(days => ${body.days}))
      returning *`;
    await audit(c, 'preview.share', e.collection, e.id, { days: body.days, lang });
    return c.json({ link: linkRow({ ...r, created_by_name: user.name }) });
  });

  app.delete('/api/preview-links/:id', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const [l] = await sql`select entry_id from preview_links where id = ${c.req.param('id')}`;
    if (!l) throw notFound('Diesen Vorschau-Link gibt es nicht mehr.');
    assertCanEdit(user, await getEntry(l.entry_id as string));
    await sql`delete from preview_links where id = ${c.req.param('id')}`;
    await audit(c, 'preview.revoke', 'entries', l.entry_id as string);
    return c.json({ ok: true });
  });

  app.get('/_nova/vorschau/:token', async (c) => {
    // Guessing links is pointless (144 bits), but nobody gets to try at speed.
    if (!rateLimit(`preview:${clientIp(c)}`, 120, 60_000).ok) throw new HttpError(429, 'Zu viele Anfragen. Warte einen Moment.');
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    c.header('Referrer-Policy', 'no-referrer');
    const [l] = await sql`
      update preview_links set uses = uses + 1, last_used_at = now()
      where token = ${c.req.param('token')} and expires_at > now() returning *`;
    if (!l) {
      const settings = await getSettings();
      const ctx = createContext({ settings, collections: await activeCollections(), path: '/', base: '', query: new URLSearchParams(), edit: false, preview: true, ageOk: true });
      const body = await renderSystemPage(ctx, {
        title: t(ctx, 'Vorschau nicht mehr verfügbar'),
        noindex: true,
        body: html`<div class="wrap nf">
          <h1>${t(ctx, 'Diese Vorschau ist nicht mehr verfügbar.')}</h1>
          <p class="lead">${t(ctx, 'Der Link ist abgelaufen oder wurde zurückgezogen. Frag die Person, die ihn dir geschickt hat, nach einem neuen.')}</p>
        </div>`,
      });
      return c.html(body, 410);
    }
    const e = await getEntry(l.entry_id as string);
    const lang = await parseLang((l.lang as string | null) ?? undefined);
    const v = lang ? await translationView(e, lang) : e;
    const page = await withLang(lang, async () => {
      const { ctx, collection, renderEntry } = await canvasContext(c, v, v.data, false, lang);
      const body = await renderPage(ctx, collection, renderEntry);
      const until = new Date(l.expires_at as string).toLocaleDateString(ctx.lang === 'en' ? 'en-GB' : `${ctx.lang}-CH`, { day: 'numeric', month: 'long', year: 'numeric' });
      // A plain band on top says what this is – no script, no styles of the theme.
      const band = html`<div
        role="note"
        style="position:sticky;top:0;z-index:2147483000;display:flex;justify-content:center;gap:.5em;flex-wrap:wrap;padding:.55em 1em;background:#1b1a17;color:#fff;font:600 13px/1.4 system-ui,sans-serif;text-align:center"
      >
        <span>${t(ctx, 'Vorschau – noch nicht veröffentlicht.')}</span><span style="opacity:.7;font-weight:500">${t(ctx, 'Link gültig bis {date}.', { date: until })}</span>
      </div>`;
      return body.replace(/<body([^>]*)>/, (m) => `${m}${band.value}`);
    });
    return c.html(page);
  });
}
