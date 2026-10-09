import { useSyncExternalStore } from 'react';

/**
 * What the admin is waiting for right now: API requests and code chunks of
 * views that load on demand. The top progress bar shows it.
 */
let active = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function startLoading(): () => void {
  active++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active--;
    emit();
  };
}

export function track<T>(p: Promise<T>): Promise<T> {
  const stop = startLoading();
  return p.finally(stop);
}

export function useLoadingCount(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => active,
  );
}
