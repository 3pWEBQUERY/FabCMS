import { core } from './dict/core';
import { blocks } from './dict/blocks';
import { events } from './dict/events';
import { services } from './dict/services';
import { shop } from './dict/shop';
import { account } from './dict/account';

/** Website texts in French, Italian and English, keyed by the German original. One file per area in dict/. */
export const DICT: Record<string, { fr: string; it: string; en: string }> = { ...core, ...blocks, ...events, ...services, ...shop, ...account };
