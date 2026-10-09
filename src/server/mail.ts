import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { getSettings } from './settings';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Railway blocks outgoing SMTP on Free/Hobby plans, so an HTTP provider
 * (Resend) is tried first. SMTP works on Pro plans or other hosts.
 */
let transport: Transporter | null = null;

export function mailConfigured() {
  return Boolean(env.mail.resendKey || env.mail.smtpUrl);
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const settings = await getSettings();
  const from = env.mail.from || `${settings.name} <noreply@${new URL(env.publicUrl).hostname}>`;
  try {
    if (env.mail.resendKey) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.mail.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, reply_to: mail.replyTo }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      return true;
    }
    if (env.mail.smtpUrl) {
      transport ??= nodemailer.createTransport(env.mail.smtpUrl);
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, replyTo: mail.replyTo });
      return true;
    }
    console.info(`[mail] Kein Versand konfiguriert. Hätte an ${mail.to} gesendet: «${mail.subject}»`);
    return false;
  } catch (e) {
    console.error('[mail] Versand fehlgeschlagen:', (e as Error).message);
    return false;
  }
}
