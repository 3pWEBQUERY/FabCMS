import { sql } from './db';
import { can, type Capability } from '../shared/roles';
import type { Role } from '../shared/types';

export type NotificationKind = 'form' | 'order' | 'paid' | 'comment' | 'review' | 'stock' | 'system';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read?: boolean;
}

/** Open admin tabs (server-sent events). Nova runs as one process, so a set in memory is enough. */
type Listener = { role: Role; send: (n: Notification) => void };
const listeners = new Set<Listener>();

export function subscribe(role: Role, send: (n: Notification) => void): () => void {
  const l = { role, send };
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Records a notification for everyone whose role has `cap` and pushes it to
 * their open admin tabs. Never throws: a failed notice must not break the
 * order or form submission that caused it.
 */
export async function notify(n: { kind: NotificationKind; cap: Capability; title: string; body?: string; href?: string }): Promise<void> {
  try {
    const [row] = await sql`
      insert into notifications (kind, cap, title, body, href)
      values (${n.kind}, ${n.cap}, ${n.title.slice(0, 200)}, ${(n.body ?? '').slice(0, 400)}, ${n.href ?? ''})
      returning id, kind, title, body, href, created_at`;
    const item = { ...(row as unknown as Notification), read: false };
    for (const l of listeners) if (can(l.role, n.cap)) l.send(item);
  } catch (e) {
    console.error('[notify]', (e as Error).message);
  }
}

/** The newest notifications this role may see, with the user's read state; plus how many are unread. */
export async function listFor(userId: string, role: Role, limit = 40): Promise<{ items: Notification[]; unread: number }> {
  const rows = await sql`
    select n.id, n.kind, n.cap, n.title, n.body, n.href, n.created_at, (r.user_id is not null) as read
    from notifications n left join notification_reads r on r.notification_id = n.id and r.user_id = ${userId}
    where n.created_at > now() - interval '90 days'
    order by n.created_at desc limit 500`;
  const mine = rows.filter((r) => can(role, r.cap as Capability)).map(({ cap: _c, ...r }) => r as unknown as Notification);
  return { items: mine.slice(0, limit), unread: mine.filter((n) => !n.read).length };
}

export async function markRead(userId: string, role: Role, ids?: string[]): Promise<void> {
  const target = ids ?? (await listFor(userId, role, 500)).items.filter((n) => !n.read).map((n) => n.id);
  if (!target.length) return;
  await sql`
    insert into notification_reads (notification_id, user_id)
    select unnest(${target}::uuid[]), ${userId} on conflict do nothing`;
}
