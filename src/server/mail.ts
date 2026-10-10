import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { getSettings } from './settings';
import { mailLogo, shell, textToHtml } from './mail-layout';
import { pageLang } from './translations';
import { applyMailText } from '../shared/mails';
import type { SiteSettings } from '../shared/types';

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
  /** A mail to customers (see MAIL_KINDS): gets the site's own texts and the mail layout. */
  kind?: string;
  /** Placeholders for the own texts, e.g. { name: 'Anna', number: 'B-1042' }. */
  vars?: Record<string, string | number>;
}

/**
 * A customer mail as it goes out: own subject and texts in the language it
 * is written in, then the same text as HTML in the site's look.
 */
export async function composeMail(mail: Mail, draft?: SiteSettings['mail']): Promise<Mail> {
  if (!mail.kind) return mail;
  const saved = await getSettings();
  // The preview shows texts not saved yet.
  const s = draft ? { ...saved, mail: draft } : saved;
  const lang = pageLang();
  const custom = s.mail?.texts?.[mail.kind]?.[lang];
  const { subject, text } = applyMailText(mail, custom, { site: s.name, ...mail.vars }, { site: s.name, signature: s.mail?.signature ?? '' });
  const html = mail.html ?? shell(s, textToHtml(s, text), '', '', lang, await mailLogo(s));
  return { ...mail, subject, text, html };
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

export async function sendMail(input: Mail): Promise<boolean> {
  const mail = await composeMail(input);
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
      await transport.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: mail.headers,
        replyTo: mail.replyTo,
        attachments: mail.attachments,
      });
      return true;
    }
    console.info(`[mail] Kein Versand konfiguriert. Hätte an ${mail.to} gesendet: «${mail.subject}»`);
    return false;
  } catch (e) {
    console.error('[mail] Versand fehlgeschlagen:', (e as Error).message);
    return false;
  }
}
