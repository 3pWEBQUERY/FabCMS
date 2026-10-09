import { api } from './api';
import { navigate } from './router';
import { t } from './i18n';
import type { Entry } from '../../shared/types';

/** Starting title of a new entry, in the interface language (the person renames it right away). */
export const NEW_TITLES: Record<string, () => string> = {
  pages: () => t('Neue Seite'),
  posts: () => t('Neuer Beitrag'),
  products: () => t('Neues Produkt'),
  dishes: () => t('Neues Gericht'),
  projects: () => t('Neues Projekt'),
  profiles: () => t('Neues Profil'),
  sections: () => t('Neue Sektion'),
};

export function entryUrl(collection: string, id: string) {
  return collection === 'pages' ? `/seiten/${id}` : `/inhalte/${collection}/${id}`;
}

/** Creates an entry with sensible defaults and opens it. */
export async function createAndOpen(collection: string, data: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = { title: NEW_TITLES[collection]?.() ?? t('Neuer Eintrag'), ...data };
  if (collection === 'dishes' && !base.prices) base.prices = [{ label: '', price: 0 }];
  if (collection === 'posts' && !base.date) base.date = new Date().toISOString().slice(0, 10);
  if (collection === 'products' && base.price === undefined) base.price = 0;
  const { entry } = await api.post<{ entry: Entry }>('/api/entries', { collection, data: base });
  navigate(entryUrl(collection, entry.id));
  return entry;
}
