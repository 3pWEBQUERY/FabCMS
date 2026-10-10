import type { Hono, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../auth';
import { HttpError } from '../lib/http';
import { authApi } from './api-auth';
import { contentApi } from './api-content';
import { viewsApi } from './api-views';
import { dataApi } from './api-data';
import { rolesApi } from './api-roles';
import { shareApi } from './api-share';
import { replaceApi } from './api-replace';
import { notFoundApi } from '../notfound';
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

/** What someone who still has to set up a second factor may reach. */
const SETUP_2FA_PATHS = /^\/api\/(session|logout|me\/totp\/(start|enable)|me\/passkeys(\/options)?)$/;

export function apiRoutes(app: Hono<AppEnv>) {
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/v1/')) return next();
    return csrf(c, next);
  });
  // A role that asks for a second factor: until one is set up, only that (and signing out) works.
  app.use('/api/*', async (c, next) => {
    if (c.get('user')?.must_setup_2fa && !SETUP_2FA_PATHS.test(c.req.path)) throw new HttpError(403, 'Richte zuerst die Zwei-Faktor-Anmeldung ein.', { code: 'setup-2fa' });
    return next();
  });
  authApi(app);
  viewsApi(app);
  contentApi(app);
  dataApi(app);
  rolesApi(app);
  shareApi(app);
  replaceApi(app);
  notFoundApi(app);
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
