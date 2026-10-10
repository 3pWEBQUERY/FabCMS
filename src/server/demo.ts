import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import { hasUsers } from './auth';
import { hashPassword } from './lib/crypto';
import { applyStarter } from './seed';
import { getSettings, updateSettings } from './settings';
import { SECTOR_MAP } from '../shared/collections';
import { THEMES } from '../site/themes';

/**
 * Preview deployments: a Railway PR environment starts with an empty
 * database. With NOVA_PREVIEW_DEMO=restaurant (or restaurant:salon) Nova
 * sets up a demo site there by itself – the way the setup assistant would –
 * so the preview shows the change on real content right away. The login is
 * printed to the log once.
 */
export async function setupPreviewDemo(): Promise<void> {
  if (!env.preview.on || !env.preview.demo || (await hasUsers())) return;
  const [sector, theme] = env.preview.demo.split(':');
  if (!SECTOR_MAP[sector]) {
    console.warn(`[preview] Unbekannte Sparte in NOVA_PREVIEW_DEMO: «${sector}».`);
    return;
  }
  const email = 'vorschau@nova.local';
  const password = randomBytes(12).toString('base64url');
  const [u] = await sql`
    insert into users (email, name, password_hash, role, mode)
    values (${email}, 'Vorschau', ${await hashPassword(password)}, 'owner', 'studio')
    returning id`;
  const { first } = await applyStarter([sector], SECTOR_MAP[sector].name, u.id as string);
  const s = await getSettings();
  const chosen = THEMES.some((t) => t.id === theme) ? theme : (first?.themes[0] ?? 'kante');
  await updateSettings({ theme: { ...s.theme, id: chosen }, setupDone: true, firstPublishedAt: new Date().toISOString(), seo: { ...s.seo, noindex: true } });
  await sql`delete from settings where key = 'setup_code'`;
  console.info('');
  console.info(`[preview] Demo-Website «${SECTOR_MAP[sector].name}» im Stil «${chosen}» eingerichtet.`);
  console.info(`[preview] Anmelden unter /admin mit ${email} / ${password}`);
  console.info('');
}
