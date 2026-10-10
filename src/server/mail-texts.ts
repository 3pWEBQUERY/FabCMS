import { T } from '../site/i18n';
import { LANGS } from '../shared/i18n';
import { sanitizePlain } from '../shared/richtext';
import { MAIL_KINDS, type MailKind, type MailText } from '../shared/mails';
import type { SiteSettings } from '../shared/types';
import type { Mail } from './mail';

/** The mail settings as they may be stored: known kinds and languages, plain text, sensible lengths. */
export function cleanMailSettings(input: Partial<SiteSettings['mail']> | undefined): SiteSettings['mail'] {
  const m = input ?? {};
  const texts: SiteSettings['mail']['texts'] = {};
  for (const k of MAIL_KINDS) {
    const byLang = (m.texts ?? {})[k.id];
    if (!byLang || typeof byLang !== 'object') continue;
    for (const { id: lang } of LANGS) {
      const t = (byLang as Record<string, MailText>)[lang];
      if (!t || typeof t !== 'object') continue;
      const clean: MailText = {
        subject: sanitizePlain(t.subject ?? '').slice(0, 200),
        intro: sanitizePlain(t.intro ?? '', true).slice(0, 2000),
        outro: sanitizePlain(t.outro ?? '', true).slice(0, 2000),
      };
      if (clean.subject || clean.intro || clean.outro) (texts[k.id] ??= {})[lang] = clean;
    }
  }
  return {
    logo: m.logo !== false,
    color: typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color.toLowerCase() : '',
    signature: sanitizePlain(m.signature ?? '', true).slice(0, 300),
    footer: sanitizePlain(m.footer ?? '', true).slice(0, 500),
    texts,
  };
}

const SAMPLE_VARS = { name: 'Anna', number: 'B-1042', total: '12.50', when: 'Samstag, 14. März, 19:00', what: 'für 4 Personen', title: 'Konzert im Park', amount: '50.–' };

/** A mail of this kind with made-up details – for the preview and the test mail. Runs in the wanted language. */
export function sampleMail(kind: MailKind, s: SiteSettings): Mail {
  const v = SAMPLE_VARS;
  const subject =
    {
      order: `${s.name}: ${T('Bestellung {number}', { number: v.number })}`,
      food: T('Bestellung Nr. {n} bei {name}', { n: 17, name: s.name }),
      booking: T('Bestätigt: {when}', { when: v.when }),
      tickets: T('Dein Ticket: {title}', { title: v.title }),
      donation: T('Danke für deine Spende an {name}', { name: s.name }),
      newsletter: T('Bitte bestätige: Newsletter von {name}', { name: s.name }),
      member: T('Bitte bestätige dein Konto bei {name}', { name: s.name }),
      cart: T('{site}: Dein Warenkorb wartet', { site: s.name }),
    }[kind.id] ?? s.name;
  return {
    to: '',
    subject,
    text: [T('Hallo {name},', { name: v.name }), '', ...kind.sample, '', s.name].join('\n'),
    kind: kind.id,
    vars: v,
  };
}
