/**
 * Offline support: the service worker keeps the admin and recently opened
 * content; the shared documents of open entries are kept in IndexedDB
 * (see useEntryDoc). Logging out removes both from this browser.
 */
export function registerOffline() {
  if (!('serviceWorker' in navigator) || location.port === '5173') return;
  void navigator.serviceWorker.register('/admin/sw.js', { scope: '/' }).catch(() => {
    /* without it the admin still works, just not offline */
  });
}

/** Names of the IndexedDB databases holding entry documents. */
export const docStoreName = (entryId: string, lang: string | null) => `nova-doc:${entryId}:${lang ?? ''}`;

export async function clearOffline() {
  try {
    navigator.serviceWorker?.controller?.postMessage('nova:clear');
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .filter((d) => d.name?.startsWith('nova-doc:'))
        .map(
          (d) =>
            new Promise((r) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => r(null);
            }),
        ),
    );
    localStorage.removeItem('nova-synced-docs');
  } catch {
    /* nothing kept, nothing to clear */
  }
}

/** Entries whose document has been in sync with the server in this browser (offline edits are safe to merge). */
export function markSynced(name: string) {
  try {
    const list = new Set(JSON.parse(localStorage.getItem('nova-synced-docs') ?? '[]') as string[]);
    list.add(name);
    localStorage.setItem('nova-synced-docs', JSON.stringify([...list].slice(-200)));
  } catch {
    /* storage unavailable */
  }
}
export function wasSynced(name: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem('nova-synced-docs') ?? '[]') as string[]).includes(name);
  } catch {
    return false;
  }
}
