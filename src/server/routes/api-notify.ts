import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { requireUser, type AppEnv } from '../auth';
import { listFor, markRead, subscribe, type Notification } from '../notify';

export function notifyApi(app: Hono<AppEnv>) {
  app.get('/api/notifications', async (c) => {
    const u = requireUser(c);
    return c.json(await listFor(u.id, u.role));
  });

  app.post('/api/notifications/read', async (c) => {
    const u = requireUser(c);
    const body = z.object({ ids: z.array(z.string().uuid()).max(500).optional() }).parse(await c.req.json().catch(() => ({})));
    await markRead(u.id, u.role, body.ids);
    return c.json(await listFor(u.id, u.role));
  });

  /** Live channel for the bell: one event per new notification, a heartbeat keeps proxies from closing it. */
  app.get('/api/notifications/stream', (c) => {
    const u = requireUser(c);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      const queue: Notification[] = [];
      let wake: (() => void) | null = null;
      const off = subscribe(u.role, (n) => {
        queue.push(n);
        wake?.();
      });
      stream.onAbort(off);
      while (!stream.aborted) {
        while (queue.length) await stream.writeSSE({ event: 'notification', data: JSON.stringify(queue.shift()) });
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 25_000);
        });
        wake = null;
        if (!queue.length) await stream.writeSSE({ event: 'ping', data: '' });
      }
      off();
    });
  });
}
