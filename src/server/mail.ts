import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { getSettings } from './settings';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML version; `text` stays the plain-text alternative. */
  html?: string;
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe for newsletters. */
  headers?: Record<string, string>;
  /** Small text attachments, e.g. a calendar entry (.ics). */
  attachments?: { filename: string; content: string; contentType: string }[];
}

/**
 * Railway blocks outgoing SMTP on Free/Hobby plans, so an HTTP provider
 * (Resend) is tried first. SMTP works on Pro plans or other hosts.
 */
let transport: Transporter | null = null;

/** Under test, mails are collected here instead of being sent. */
const testing = process.env.NODE_ENV === 'test';
export const outbox: Mail[] = [];

export function mailConfigured() {
  return testing || Boolean(env.mail.resendKey || env.mail.smtpUrl);
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const settings = await getSettings();
  const from = env.mail.from || `${settings.name} <noreply@${new URL(env.publicUrl).hostname}>`;
  if (testing) {
    outbox.push(mail);
    return true;
  }
  try {
    if (env.mail.resendKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.mail.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          headers: mail.headers,
          reply_to: mail.replyTo,
          attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64'), content_type: a.contentType })),
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      return true;
    }
    if (env.mail.smtpUrl) {
      transport ??= nodemailer.createTransport(env.mail.smtpUrl);
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers, replyTo: mail.replyTo, attachments: mail.attachments });
      return true;
    }
    console.info(`[mail] Kein Versand konfiguriert. Hätte an ${mail.to} gesendet: «${mail.subject}»`);
    return false;
  } catch (e) {
    console.error('[mail] Versand fehlgeschlagen:', (e as Error).message);
    return false;
  }
}
