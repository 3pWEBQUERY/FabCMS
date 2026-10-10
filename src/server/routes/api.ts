import type { Hono, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../auth';
import { HttpError } from '../lib/http';
import { authApi } from './api-auth';
import { contentApi } from './api-content';
import { mediaApi } from './api-media';
import { businessApi } from './api-business';
import { systemApi } from './api-system';
import { notifyApi } from './api-notify';
import { bookingApi } from './api-booking';
import { newsletterApi } from './api-newsletter';
import { membersApi } from './api-members';
import { ticketsApi } from './api-tickets';
import { donationsApi } from './api-donations';
import { orderingApi } from './api-ordering';
import { importApi } from './api-import';
import { commentsApi } from './api-comments';
import { aiApi } from './api-ai';
import { gscApi } from './api-gsc';
import { extensionsApi } from './api-extensions';

/**
 * CSRF protection for the admin API: state-changing requests must carry the
 * custom header X-Nova (browsers can't add it cross-site without a CORS
 * preflight, which we never grant) and, if present, a same-origin Origin.
 */
const csrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('x-nova') !== '1') throw new HttpError(403, 'Anfrage abgelehnt (fehlender Schutz-Header).');
    const origin = c.req.header('origin');
    if (origin) {
      const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
      if (new URL(origin).host !== host) throw new HttpError(403, 'Anfrage von fremder Herkunft abgelehnt.');
    }
  }
  c.header('Cache-Control', 'no-store');
  await next();
};

export function apiRoutes(app: Hono<AppEnv>) {
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/v1/')) return next();
    return csrf(c, next);
  });
  authApi(app);
  contentApi(app);
  mediaApi(app);
  businessApi(app);
  systemApi(app);
  notifyApi(app);
  bookingApi(app);
  newsletterApi(app);
  membersApi(app);
  ticketsApi(app);
  donationsApi(app);
  orderingApi(app);
  importApi(app);
  commentsApi(app);
  aiApi(app);
  gscApi(app);
  extensionsApi(app);
}
