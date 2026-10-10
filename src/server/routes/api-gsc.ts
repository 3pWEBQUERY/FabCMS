import type { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { audit, requireAnyCap, requireCap, type AppEnv } from '../auth';
import { env } from '../env';
import { appSecret } from '../settings';
import { sign, token, unsign } from '../lib/crypto';
import { authUrl, chooseSite, connect, disconnect, gscStatus, report, submitSitemap } from '../gsc';

const STATE_COOKIE = 'nova_gsc';

/** Google Search Console: connect, choose the property, sitemap, numbers for the statistics. */
export function gscApi(app: Hono<AppEnv>) {
  app.get('/api/gsc', async (c) => {
    requireCap(c, 'settings.manage');
    return c.json(await gscStatus());
  });

  /** Starts the Google sign-in; the state ties Google's answer to this browser. */
  app.post('/api/gsc/connect', async (c) => {
    requireCap(c, 'settings.manage');
    const state = token(24);
    const url = authUrl(state);
    setCookie(c, STATE_COOKIE, sign(state, await appSecret()), { httpOnly: true, sameSite: 'Lax', secure: env.production, path: '/api/gsc', maxAge: 600 });
    return c.json({ url });
  });

  /** Google sends the person back here. */
  app.get('/api/gsc/callback', async (c) => {
    const back = (q: string) => c.redirect(`/admin/einstellungen/seo?${q}`, 302);
    const user = c.get('user');
    const expected = unsign(getCookie(c, STATE_COOKIE), await appSecret());
    deleteCookie(c, STATE_COOKIE, { path: '/api/gsc' });
    if (!user || !expected || c.req.query('state') !== expected) return back('gsc=abgelehnt');
    requireCap(c, 'settings.manage');
    if (c.req.query('error')) return back('gsc=abgebrochen');
    try {
      const s = await connect(c.req.query('code') ?? '');
      await audit(c, 'gsc.connect', 'settings', 'gsc', { site: s.site });
      return back(`gsc=${s.site ? 'verbunden' : 'property'}`);
    } catch (e) {
      console.error('[gsc]', (e as Error).message);
      return back('gsc=fehler');
    }
  });

  app.post('/api/gsc/site', async (c) => {
    requireCap(c, 'settings.manage');
    const { site } = z.object({ site: z.string().min(1) }).parse(await c.req.json());
    await chooseSite(site);
    await audit(c, 'gsc.site', 'settings', 'gsc', { site });
    return c.json(await gscStatus());
  });

  app.post('/api/gsc/sitemap', async (c) => {
    requireCap(c, 'settings.manage');
    await submitSitemap();
    return c.json(await gscStatus());
  });

  app.delete('/api/gsc', async (c) => {
    requireCap(c, 'settings.manage');
    await disconnect();
    await audit(c, 'gsc.disconnect', 'settings', 'gsc', {});
    return c.json(await gscStatus());
  });

  app.get('/api/gsc/report', async (c) => {
    requireAnyCap(c, 'settings.manage', 'leads.view', 'orders.view');
    const days = Math.min(480, Math.max(7, Number(c.req.query('days')) || 28));
    return c.json({ report: await report(days) });
  });
}
