import { shell } from './shell';
import { editor } from './editor';
import { labels } from './labels';
import { settings } from './settings';
import { modules } from './modules';
import { views } from './views';
import { server } from './server';

/** All admin translations, keyed by the German original; one file per area. Loaded lazily, only for FR/IT/EN. */
export const ADMIN_DICT: Record<string, { fr: string; it: string; en: string }> = { ...server, ...labels, ...shell, ...editor, ...settings, ...modules, ...views };

/** Only these may be matched as patterns by tm(): messages from the server and texts from built-in definitions. */
export const MESSAGE_DICT: Record<string, { fr: string; it: string; en: string }> = { ...server, ...labels };
