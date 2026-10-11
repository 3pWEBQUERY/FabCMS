import { api } from './api';
import { t } from './i18n';
import { choose } from '../ui/kit';
import type { useToast } from '../ui/toast';

export type LinkedDraft = { id: string; title: string };

/** Drafts linked from one entry (by id) or from several entries and/or settings about to be saved. */
export function findLinkedDrafts(from: { entry: string } | { ids?: string[]; data?: unknown }): Promise<LinkedDraft[]> {
  const r = 'entry' in from ? api.get<{ entries: LinkedDraft[] }>(`/api/entries/${from.entry}/draft-links`) : api.post<{ entries: LinkedDraft[] }>('/api/draft-links', from);
  return r.then((x) => x.entries).catch(() => []);
}

export const draftNames = (list: LinkedDraft[]) => list.map((x) => `«${x.title || t('Ohne Titel')}»`).join(', ');

/**
 * Links to drafts would lead nowhere on the website: asks whether they go live
 * too. The drafts to publish along – [] for none or «only this», null for «not now».
 */
export async function askLinkedDrafts(found: LinkedDraft[], only: string): Promise<LinkedDraft[] | null> {
  if (!found.length) return [];
  const answer = await choose({
    title: t('Verlinkte Entwürfe'),
    message: t('Verlinkt sind {names} – noch nicht veröffentlicht. Ohne sie führen diese Links auf der Website ins Leere.', { names: draftNames(found) }),
    options: [
      { label: t('Abbrechen'), value: 'cancel', kind: 'ghost' },
      { label: only, value: 'one' },
      { label: t('Alle zusammen veröffentlichen'), value: 'all', kind: 'primary' },
    ],
  });
  return answer === 'all' ? found : answer === 'one' ? [] : null;
}

/** Publishes the drafts one by one (at a later moment, if given); a failure is said and does not stop the others. */
export async function publishDrafts(list: LinkedDraft[], toast: ReturnType<typeof useToast>, at?: string | null) {
  for (const x of list) {
    try {
      await api.post(`/api/entries/${x.id}/publish`, { at: at ?? null });
    } catch (err) {
      toast(t('«{name}» liess sich nicht veröffentlichen: {error}', { name: x.title, error: (err as Error).message }), { kind: 'bad' });
    }
  }
}
