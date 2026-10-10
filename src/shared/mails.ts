/**
 * The mails Nova sends to customers and guests, and what can be changed in
 * them: the subject, a text before and a text after what Nova fills in
 * itself (order lines, tickets, links). The filled-in part stays as it is,
 * so nothing a customer needs can get lost.
 */

export interface MailText {
  subject?: string;
  /** After the greeting, before the details. */
  intro?: string;
  /** After the details, before the signature. */
  outro?: string;
}

export interface MailKind {
  id: string;
  label: string;
  /** When it goes out. */
  when: string;
  /** Placeholders the subject and texts may use. */
  vars: string[];
  /** Module that must be on for the mail to matter (none = always). */
  module?: string;
  /** What the details look like, for the preview. */
  sample: string[];
}

export const MAIL_KINDS: MailKind[] = [
  {
    id: 'order',
    label: 'Bestellbestätigung (Shop)',
    when: 'Nach einer Bestellung im Shop und nach der Zahlung.',
    vars: ['name', 'number', 'total'],
    module: 'shop',
    sample: ['1 × Bergkäse 250 g  12.50', 'Total  12.50 (inkl. MwSt.)'],
  },
  {
    id: 'food',
    label: 'Essensbestellung',
    when: 'Bestellung eingegangen, bereit, unterwegs oder storniert.',
    vars: ['name', 'number'],
    module: 'ordering',
    sample: ['2 × Pizza Margherita  36.–'],
  },
  {
    id: 'booking',
    label: 'Reservation',
    when: 'Bestätigung, Anfrage, Absage und Erinnerung.',
    vars: ['name', 'when', 'what'],
    module: 'booking',
    sample: ['Samstag, 14. März, 19:00, 4 Personen.'],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    when: 'Nach dem Kauf, bei Storno und wenn ein Platz frei wird.',
    vars: ['name', 'title'],
    module: 'events',
    sample: ['Konzert im Park', 'Ticket A7K2-9QX4'],
  },
  {
    id: 'cart',
    label: 'Erinnerung an den Warenkorb',
    when: 'Einige Stunden nach einer nicht abgeschlossenen Bestellung – nur wenn die Person darum gebeten hat.',
    vars: ['name'],
    module: 'shop',
    sample: ['1 × Bergkäse 250 g  12.50', 'Bestellung abschliessen: https://…'],
  },
  {
    id: 'restock',
    label: 'Wieder erhältlich',
    when: 'Wenn ein ausverkauftes Produkt wieder an Lager ist – an alle, die darum gebeten haben.',
    vars: ['product'],
    module: 'shop',
    sample: ['Bergkäse 250 g ist ab sofort wieder erhältlich.', 'Zum Produkt: https://…'],
  },
  { id: 'donation', label: 'Spendenbestätigung', when: 'Nach jeder Spende.', vars: ['name', 'amount'], module: 'donations', sample: ['Betrag: 50.–'] },
  {
    id: 'newsletter',
    label: 'Newsletter-Anmeldung',
    when: 'Wenn jemand den Newsletter bestellt (Bestätigungslink).',
    vars: ['name'],
    module: 'newsletter',
    sample: ['Ein Klick bestätigt die Anmeldung.'],
  },
  { id: 'member', label: 'Mitgliederkonto', when: 'Konto bestätigen, Passwort zurücksetzen, Zugang.', vars: ['name'], module: 'members', sample: ['Bestätigen: https://…'] },
];

export const mailKind = (id: string) => MAIL_KINDS.find((k) => k.id === id);

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));

/**
 * A mail with the customer's texts: own subject, a paragraph after the
 * greeting, one before the signature, and the signature itself.
 */
export function applyMailText(
  mail: { subject: string; text: string },
  custom: MailText | undefined,
  vars: Record<string, string | number>,
  sign: { site: string; signature: string },
): { subject: string; text: string } {
  const lines = mail.text.split('\n');
  // Nova's mails end with the name of the site on a line of its own.
  const signed = lines.length > 1 && lines[lines.length - 1].trim() === sign.site;
  const body = signed ? lines.slice(0, -1) : lines;
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  if (custom?.intro?.trim()) {
    // After the greeting («Hallo Anna,») and its blank line.
    const at = body.findIndex((l) => l.trim() === '');
    const intro = fill(custom.intro.trim(), vars);
    if (at > 0 && at <= 2) body.splice(at + 1, 0, intro, '');
    else body.unshift(intro, '');
  }
  if (custom?.outro?.trim()) body.push('', fill(custom.outro.trim(), vars));
  const signature = sign.signature.trim() || sign.site;
  return {
    subject: custom?.subject?.trim() ? fill(custom.subject.trim(), { ...vars, site: sign.site }) : mail.subject,
    text: [...body, '', signature].join('\n'),
  };
}
