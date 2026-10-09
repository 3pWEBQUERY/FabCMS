import { api } from './api';
import { navigate } from './router';
import type { Entry } from '../../shared/types';

export const NEW_TITLES: Record<string, string> = {
  pages: 'Neue Seite',
  posts: 'Neuer Beitrag',
  products: 'Neues Produkt',
  dishes: 'Neues Gericht',
  projects: 'Neues Projekt',
  profiles: 'Neues Profil',
  sections: 'Neue Sektion',
};

export function entryUrl(collection: string, id: string) {
  return collection === 'pages' ? `/seiten/${id}` : `/inhalte/${collection}/${id}`;
}

/** Creates an entry with sensible defaults and opens it. */
export async function createAndOpen(collection: string, data: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = { title: NEW_TITLES[collection] ?? 'Neuer Eintrag', ...data };
  if (collection === 'dishes' && !base.prices) base.prices = [{ label: '', price: 0 }];
  if (collection === 'posts' && !base.date) base.date = new Date().toISOString().slice(0, 10);
  if (collection === 'products' && base.price === undefined) base.price = 0;
  const { entry } = await api.post<{ entry: Entry }>('/api/entries', { collection, data: base });
  navigate(entryUrl(collection, entry.id));
  return entry;
}
