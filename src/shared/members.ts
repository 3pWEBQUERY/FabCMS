import type { EntryData } from './types';

/** Who may see a page or post. Stored per entry in `data.access`. */
export type Access = 'public' | 'members' | 'paid';
export type MemberLevel = 'member' | 'paid';

export const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: 'public', label: 'Alle' },
  { value: 'members', label: 'Nur angemeldete Mitglieder' },
  { value: 'paid', label: 'Nur zahlende Mitglieder' },
];

export function entryAccess(d: EntryData | null | undefined): Access {
  const a = d?.access;
  return a === 'members' || a === 'paid' ? a : 'public';
}

export function mayRead(access: Access, level: MemberLevel | null): boolean {
  if (access === 'public') return true;
  if (access === 'members') return level !== null;
  return level === 'paid';
}

/** Paid means: a running subscription, or access granted until a date. */
export function memberLevel(m: { paid_until: string | Date | null; subscription_status: string }, now = new Date()): MemberLevel {
  if (['active', 'trialing', 'past_due'].includes(m.subscription_status)) return 'paid';
  if (m.paid_until && new Date(m.paid_until).getTime() > now.getTime()) return 'paid';
  return 'member';
}
