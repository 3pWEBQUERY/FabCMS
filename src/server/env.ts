/**
 * All configuration comes from environment variables. On Railway the
 * Postgres and Bucket services provide them via variable references.
 */
const e = process.env;

function bool(v: string | undefined, fallback = false) {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const env = {
  production: e.NODE_ENV === 'production',
  port: Number(e.PORT ?? 3000),
  databaseUrl: e.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nova',
  /** Public URL. On Railway RAILWAY_PUBLIC_DOMAIN is set automatically. */
  publicUrl:
    e.PUBLIC_URL ?? (e.RAILWAY_PUBLIC_DOMAIN ? `https://${e.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${e.PORT ?? 3000}`),
  /** Secret for signed cookies (cart, age gate). Falls back to a DB-stored random secret. */
  appSecret: e.APP_SECRET ?? '',
  s3: {
    // Railway Bucket variable names, with AWS_* fallbacks for the auto-injected preset.
    bucket: e.BUCKET ?? e.AWS_S3_BUCKET_NAME ?? e.S3_BUCKET ?? '',
    endpoint: e.ENDPOINT ?? e.AWS_ENDPOINT_URL ?? e.AWS_ENDPOINT_URL_S3 ?? e.S3_ENDPOINT ?? '',
    region: e.REGION ?? e.AWS_DEFAULT_REGION ?? e.AWS_REGION ?? 'auto',
    accessKeyId: e.ACCESS_KEY_ID ?? e.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: e.SECRET_ACCESS_KEY ?? e.AWS_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: bool(e.S3_FORCE_PATH_STYLE, false),
  },
  localStorageDir: e.LOCAL_STORAGE_DIR ?? '.data/uploads',
  mail: {
    from: e.MAIL_FROM ?? '',
    resendKey: e.RESEND_API_KEY ?? '',
    smtpUrl: e.SMTP_URL ?? '',
  },
  stripe: {
    secretKey: e.STRIPE_SECRET_KEY ?? '',
    webhookSecret: e.STRIPE_WEBHOOK_SECRET ?? '',
  },
  /** Optional: mirror the newsletter list to Brevo or Mailchimp. Sending stays with Nova. */
  newsletter: {
    brevoKey: e.BREVO_API_KEY ?? '',
    brevoList: e.BREVO_LIST_ID ?? '',
    mailchimpKey: e.MAILCHIMP_API_KEY ?? '',
    mailchimpList: e.MAILCHIMP_LIST_ID ?? '',
  },
  turnstile: {
    siteKey: e.TURNSTILE_SITE_KEY ?? '',
    secret: e.TURNSTILE_SECRET ?? '',
  },
  /** Optional KI-Assistent (Anthropic). Without a key the assistant does not appear anywhere. */
  ai: {
    key: e.ANTHROPIC_API_KEY ?? '',
    model: e.NOVA_AI_MODEL ?? 'claude-sonnet-5-5',
    baseUrl: (e.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
  },
  /** Video transcoding: ffmpeg/ffprobe from PATH unless set; NOVA_VIDEO=off leaves videos as uploaded. */
  video: {
    enabled: bool(e.NOVA_VIDEO, true),
    ffmpeg: e.FFMPEG_PATH ?? 'ffmpeg',
    ffprobe: e.FFPROBE_PATH ?? 'ffprobe',
  },
  /** Optional ClamAV (clamd over TCP) for every upload, e.g. «clamav.railway.internal». */
  clamav: {
    host: e.CLAMAV_HOST ?? '',
    port: Number(e.CLAMAV_PORT ?? 3310),
  },
  /** Optional Meilisearch for the site search (typo tolerance, ranking). Without it Postgres full-text search is used. */
  meili: {
    host: (e.MEILI_HOST ?? '').replace(/\/$/, ''),
    key: e.MEILI_KEY ?? e.MEILI_MASTER_KEY ?? '',
    index: e.MEILI_INDEX ?? 'nova',
  },
  /**
   * Optional age verification with the Swiss e-ID: the URL of an own swiyu Generic
   * Verifier (management API, reachable from Nova only), the issuers whose
   * credentials count and the credential type. Without URL and issuer the
   * age gate stays a self-declaration.
   */
  eid: {
    verifierUrl: (e.SWIYU_VERIFIER_URL ?? '').replace(/\/$/, ''),
    token: e.SWIYU_VERIFIER_TOKEN ?? '',
    issuers: (e.SWIYU_ISSUER_DIDS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    vct: (e.SWIYU_VCT ?? 'betaid-sdjwt')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  },
  /** Optional own extension catalogue (Marktplatz): its address and the Ed25519 public key it is signed with. */
  extensions: {
    url: e.NOVA_EXTENSIONS_URL ?? '',
    key: e.NOVA_EXTENSIONS_KEY ?? '',
  },
  /** Optional Google OAuth client for the Search Console connection. */
  google: {
    clientId: e.GOOGLE_CLIENT_ID ?? '',
    clientSecret: e.GOOGLE_CLIENT_SECRET ?? '',
  },
  /**
   * Preview environment (a Railway PR environment, or NOVA_PREVIEW=1): kept out of
   * search engines, marked in the admin, and with NOVA_PREVIEW_DEMO=<Sparte>[:<Stil>]
   * filled with a demo site on an empty database.
   */
  preview: {
    on: bool(e.NOVA_PREVIEW, /(^|-)pr-\d+$/i.test(e.RAILWAY_ENVIRONMENT_NAME ?? '')),
    name: e.RAILWAY_ENVIRONMENT_NAME ?? '',
    demo: e.NOVA_PREVIEW_DEMO ?? '',
  },
  setupCode: e.NOVA_SETUP_CODE ?? '',
  trustProxy: bool(e.TRUST_PROXY, true),
};

export const s3Configured = () => Boolean(env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
