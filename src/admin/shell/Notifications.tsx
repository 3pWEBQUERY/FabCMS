import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { Icon } from '../ui/icons';
import { Popover } from '../ui/kit';
import { useToast } from '../ui/toast';
import { relativeTime } from '../../shared/text';

interface Notice {
  id: string;
  kind: 'form' | 'order' | 'paid' | 'comment' | 'review' | 'stock' | 'system';
  title: string;
  body: string;
  href: string;
  created_at: string;
  read: boolean;
}

const KIND_ICON: Record<Notice['kind'], string> = {
  form: 'inbox',
  order: 'receipt',
  paid: 'check',
  comment: 'chat',
  review: 'eye',
  stock: 'bag',
  system: 'alert',
};

interface Ctx {
  items: Notice[];
  unread: number;
  open: (n: Notice) => void;
  readAll: () => void;
}
const NotificationsCtx = createContext<Ctx>({ items: [], unread: 0, open: () => {}, readAll: () => {} });

/** Small dot on the tab icon while something is unread, drawn onto the admin favicon. */
const BASE_ICON = '/admin/favicon.svg';
let iconSvg: string | null = null;
async function setTabIcon(dot: boolean) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  if (!dot) {
    link.href = BASE_ICON;
    return;
  }
  iconSvg ??= await fetch(BASE_ICON)
    .then((r) => r.text())
    .catch(() => '');
  if (!iconSvg) return;
  const withDot = iconSvg.replace('</svg>', '<circle cx="25" cy="7" r="6.5" fill="#e5484d" stroke="#fff" stroke-width="2"/></svg>');
  link.href = `data:image/svg+xml,${encodeURIComponent(withDot)}`;
}

/**
 * Keeps the notification list for the whole admin: loads it, listens to the
 * live channel, toasts new ones and marks the tab (title count, favicon dot).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async () => {
    const r = await api.get<{ items: Notice[]; unread: number }>('/api/notifications').catch(() => null);
    if (r) {
      setItems(r.items);
      setUnread(r.unread);
    }
  }, []);

  const markRead = useCallback(async (ids?: string[]) => {
    setItems((list) => list.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    const r = await api.post<{ unread: number }>('/api/notifications/read', ids ? { ids } : {}).catch(() => null);
    if (r) setUnread(r.unread);
  }, []);

  const open = useCallback(
    (n: Notice) => {
      if (!n.read) void markRead([n.id]);
      if (n.href) navigate(n.href);
    },
    [markRead],
  );

  useEffect(() => {
    void load();
    const es = new EventSource('/api/notifications/stream');
    // After a reconnect, fetch what may have arrived in between.
    let connectedOnce = false;
    es.addEventListener('open', () => {
      if (connectedOnce) void load();
      connectedOnce = true;
    });
    es.addEventListener('notification', (e) => {
      const n = { ...(JSON.parse((e as MessageEvent).data) as Notice), read: false };
      setItems((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list].slice(0, 40)));
      setUnread((u) => u + 1);
      toastRef.current(n.title, { kind: 'notice', icon: KIND_ICON[n.kind], ms: 6500, action: n.href ? { label: 'Ansehen', run: () => open(n) } : undefined });
    });
    return () => es.close();
  }, [load, open]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s/, '');
    document.title = unread ? `(${unread}) ${base}` : base;
    void setTabIcon(unread > 0);
  }, [unread]);

  const value = useMemo(() => ({ items, unread, open, readAll: () => void markRead() }), [items, unread, open, markRead]);
  return <NotificationsCtx.Provider value={value}>{children}</NotificationsCtx.Provider>;
}

export const useNotifications = () => useContext(NotificationsCtx);

export function NotificationBell() {
  const { items, unread, open, readAll } = useNotifications();
  const [show, setShow] = useState(false);
  return (
    <Popover
      open={show}
      onOpenChange={setShow}
      align="end"
      className="notes"
      trigger={
        <button className="btn ghost icon-only bell" aria-label={unread ? `Benachrichtigungen, ${unread} neu` : 'Benachrichtigungen'}>
          <Icon name="bell" />
          {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
        </button>
      }
    >
      <div className="notes-head">
        <strong>Benachrichtigungen</strong>
        {unread > 0 && (
          <button className="linkish small" onClick={readAll}>
            Alle als gelesen markieren
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="notes-empty">Alles ruhig. Neue Anfragen, Bestellungen, Kommentare und Freigaben erscheinen hier, sobald sie eintreffen.</p>
      ) : (
        <ul className="notes-list">
          {items.map((n) => (
            <li key={n.id}>
              <button
                className={`note ${n.read ? '' : 'unread'}`}
                onClick={() => {
                  setShow(false);
                  open(n);
                }}
              >
                <span className={`note-icon k-${n.kind}`}>
                  <Icon name={KIND_ICON[n.kind]} size="s" />
                </span>
                <span className="note-text">
                  <span className="note-title">{n.title}</span>
                  {n.body && <span className="note-body">{n.body}</span>}
                  <span className="note-time">{relativeTime(n.created_at)}</span>
                </span>
                {!n.read && <span className="note-dot" aria-label="neu" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
