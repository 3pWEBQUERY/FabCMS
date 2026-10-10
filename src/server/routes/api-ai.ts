import type { Hono } from 'hono';
import { z } from 'zod';
import { requireAnyCap, type AppEnv } from '../auth';
import { getCollection, getEntry } from '../content';
import { aiEnabled, altText, REWRITE_MODES, rewrite, translateSlots, type RewriteMode } from '../ai';
import { mainLang } from '../settings';
import { parseLang } from '../translations';
import { badRequest, forbidden, HttpError } from '../lib/http';
import { rateLimit } from '../lib/ratelimit';
import { can } from '../../shared/roles';
import { isLang, type Lang } from '../../shared/i18n';
import { entrySlots } from '../../shared/text-slots';

/** KI-Assistent: every answer is a suggestion; saving stays with the editor. */
export function aiApi(app: Hono<AppEnv>) {
  async function guard(userId: string) {
    if (!(await aiEnabled())) throw forbidden('Der KI-Assistent ist ausgeschaltet.');
    if (!rateLimit(`ai:${userId}`, 60, 60 * 60_000).ok) throw new HttpError(429, 'Für diese Stunde sind genug Vorschläge abgerufen. Versuch es später nochmal.');
  }

  app.post('/api/ai/rewrite', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z
      .object({
        text: z.string().trim().min(1, 'Erst braucht es einen Text.').max(20_000, 'Der Text ist zu lang für einen Vorschlag.'),
        kind: z.enum(['plain', 'multi', 'rich']).default('plain'),
        mode: z.enum(Object.keys(REWRITE_MODES) as [RewriteMode, ...RewriteMode[]]),
        lang: z.string().optional(),
        max: z.number().int().positive().max(20_000).optional(),
      })
      .parse(await c.req.json());
    await guard(user.id); // also loads the settings, so mainLang() is right
    const lang: Lang = isLang(body.lang) ? body.lang : mainLang();
    return c.json({ suggestion: await rewrite({ text: body.text, kind: body.kind, mode: body.mode, lang, max: body.max }) });
  });

  app.post('/api/ai/alt', async (c) => {
    const user = requireAnyCap(c, 'media.upload', 'content.edit');
    const body = z.object({ media: z.string().uuid('Dieses Bild gibt es nicht.') }).parse(await c.req.json());
    await guard(user.id); // also loads the settings, so mainLang() is right
    return c.json({ suggestion: await altText(body.media, mainLang()) });
  });

  /** Translation draft for one entry: the texts of the original with a suggestion each. */
  app.post('/api/ai/translate', async (c) => {
    const user = requireAnyCap(c, 'content.edit', 'content.edit.own');
    const body = z.object({ entry: z.string().uuid(), lang: z.string() }).parse(await c.req.json());
    const lang = await parseLang(body.lang);
    if (!lang) throw badRequest('In diese Sprache wird nicht übersetzt.');
    const entry = await getEntry(body.entry);
    if (!can(user.role, 'content.edit') && entry.author_id !== user.id) throw forbidden('Du kannst nur deine eigenen Beiträge bearbeiten.');
    await guard(user.id);
    const col = await getCollection(entry.collection);
    const slots = entrySlots(col, entry.data as Record<string, unknown>);
    if (!slots.length) return c.json({ items: [] });
    if (slots.reduce((n, s) => n + s.text.length, 0) > 120_000) throw badRequest('Dieser Eintrag ist zu lang für einen Übersetzungsentwurf am Stück.');
    const texts = await translateSlots(slots, mainLang(), lang);
    return c.json({ items: slots.map((s, i) => ({ path: s.path, kind: s.kind, source: s.text, text: texts[i] })).filter((x) => x.text) });
  });
}
