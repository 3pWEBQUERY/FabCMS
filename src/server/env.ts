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
  setupCode: e.NOVA_SETUP_CODE ?? '',
  trustProxy: bool(e.TRUST_PROXY, true),
};

export const s3Configured = () => Boolean(env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey);
