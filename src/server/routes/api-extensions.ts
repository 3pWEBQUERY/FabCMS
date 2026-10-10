import type { Hono } from 'hono';
import { audit, requireCap, type AppEnv } from '../auth';
import { env } from '../env';
import { catalogue, installedExtensions, installExtension, removeExtension, resetCatalogueCache, updateExtension } from '../extensions';
import { compareVersions, extensionEffects } from '../../shared/extensions';

/** Marktplatz (Werkbank): browse, install, update and remove extensions. */
export function extensionsApi(app: Hono<AppEnv>) {
  app.get('/api/extensions', async (c) => {
    requireCap(c, 'dev');
    const [{ entries, error }, installed] = await Promise.all([catalogue(), installedExtensions()]);
    return c.json({
      catalogue: entries.map(({ manifest, source }) => {
        const mine = installed.find((x) => x.id === manifest.id);
        return {
          ...manifest,
          source,
          effects: extensionEffects(manifest),
          installed: mine?.version ?? null,
          update: mine && compareVersions(manifest.version, mine.version) > 0 ? manifest.version : null,
        };
      }),
      // Installed but no longer in any catalogue: still listed, so it can be removed.
      orphans: installed
        .filter((x) => !entries.some((e) => e.manifest.id === x.id))
        .map((x) => ({ ...x.manifest, source: x.source, effects: extensionEffects(x.manifest), installed: x.version, update: null })),
      own: Boolean(env.extensions.url),
      error,
    });
  });

  app.post('/api/extensions/refresh', async (c) => {
    requireCap(c, 'dev');
    resetCatalogueCache();
    return c.json({ ok: true });
  });

  app.post('/api/extensions/:id/install', async (c) => {
    const user = requireCap(c, 'dev');
    const ext = await installExtension(c.req.param('id'), user.id);
    await audit(c, 'extension.install', 'extension', ext.id, { version: ext.version, source: ext.source });
    return c.json({ extension: ext });
  });

  app.post('/api/extensions/:id/update', async (c) => {
    requireCap(c, 'dev');
    const ext = await updateExtension(c.req.param('id'));
    await audit(c, 'extension.update', 'extension', ext.id, { version: ext.version });
    return c.json({ extension: ext });
  });

  app.delete('/api/extensions/:id', async (c) => {
    requireCap(c, 'dev');
    const report = await removeExtension(c.req.param('id'));
    await audit(c, 'extension.remove', 'extension', c.req.param('id'), { ...report });
    return c.json(report);
  });
}
