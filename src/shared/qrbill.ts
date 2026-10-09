/**
 * Swiss QR bill (QR-Rechnung) per «Swiss Implementation Guidelines for the
 * QR-bill», version 2: payload, references and validation. Rendering lives in
 * server/qrbill.ts.
 */

export interface QrAddress {
  name: string;
  street: string; // street with house number, e.g. «Bahnhofstrasse 12»
  zip: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface QrBillData {
  iban: string;
  creditor: QrAddress;
  /** Cents; null = the payer fills in the amount (e.g. donations). */
  amount: number | null;
  currency: 'CHF' | 'EUR';
  debtor: QrAddress | null;
  /** Reference number (QRR for QR-IBAN, RF… creditor reference otherwise); '' = none. */
  reference: string;
  message: string;
}

export const compactIban = (v: string) => v.replace(/\s+/g, '').toUpperCase();
export const formatIban = (v: string) =>
  compactIban(v)
    .replace(/(.{4})/g, '$1 ')
    .trim();

/** ISO 13616 mod-97 check, only CH and LI accounts (the QR bill's rule). */
export function validQrIban(v: string): boolean {
  const iban = compactIban(v);
  if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** QR-IBANs have an institution ID between 30000 and 31999 and need a QR reference. */
export function isQrIban(v: string): boolean {
  const iid = Number(compactIban(v).slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

/** Modulo 10 recursive check digit (QR reference, formerly ESR). */
export function mod10(digits: string): number {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const d of digits) carry = table[(carry + Number(d)) % 10];
  return (10 - carry) % 10;
}

/** 27-digit QR reference from any number (e.g. order number digits). */
export function qrReference(n: string): string {
  const body = n.replace(/\D/g, '').slice(-26).padStart(26, '0');
  return body + mod10(body);
}

/** ISO 11649 creditor reference «RFxx…» for normal IBANs. */
export function scorReference(n: string): string {
  const body =
    n
      .replace(/[^0-9A-Z]/gi, '')
      .toUpperCase()
      .slice(0, 21) || '0';
  const numeric = (body + 'RF00').replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of numeric) rest = (rest * 10 + Number(d)) % 97;
  return `RF${String(98 - rest).padStart(2, '0')}${body}`;
}

/** The right kind of reference for the account. */
export function referenceFor(iban: string, n: string): { type: 'QRR' | 'SCOR' | 'NON'; value: string } {
  if (!n.replace(/\W/g, '')) return isQrIban(iban) ? { type: 'QRR', value: qrReference('0') } : { type: 'NON', value: '' };
  return isQrIban(iban) ? { type: 'QRR', value: qrReference(n) } : { type: 'SCOR', value: scorReference(n) };
}

export function formatReference(type: string, v: string): string {
  if (type === 'QRR') return v.replace(/^(\d{2})(\d{5})(\d{5})(\d{5})(\d{5})(\d{5})$/, '$1 $2 $3 $4 $5 $6');
  return v.replace(/(.{4})/g, '$1 ').trim();
}

const clean = (v: string, max: number) =>
  v
    .replace(/[\r\n]+/g, ' ')
    // Only the Latin character set the standard allows.
    .replace(/[^\x20-\x7E -ſ]/g, '')
    .trim()
    .slice(0, max);

function address(a: QrAddress | null): string[] {
  if (!a) return ['', '', '', '', '', '', ''];
  // Structured address («S»): street and house number may share the street line.
  return ['S', clean(a.name, 70), clean(a.street, 70), '', clean(a.zip, 16), clean(a.city, 35), a.country.toUpperCase().slice(0, 2)];
}

/** Text encoded in the QR code. */
export function qrPayload(d: QrBillData): string {
  const ref = d.reference ? (isQrIban(d.iban) ? 'QRR' : 'SCOR') : 'NON';
  return [
    'SPC',
    '0200',
    '1',
    compactIban(d.iban),
    ...address(d.creditor),
    '',
    '',
    '',
    '',
    '',
    '',
    '', // ultimate creditor: reserved, stays empty
    d.amount === null ? '' : (d.amount / 100).toFixed(2),
    d.currency,
    ...address(d.debtor),
    ref,
    d.reference,
    clean(d.message, 140),
    'EPD',
  ].join('\r\n');
}

/** Problems that make a QR bill impossible, in plain words. */
export function qrBillProblems(iban: string, creditor: QrAddress): string[] {
  const out: string[] = [];
  if (!iban) out.push('Es fehlt die IBAN.');
  else if (!validQrIban(iban)) out.push('Die IBAN ist keine gültige Schweizer oder Liechtensteiner IBAN.');
  if (!creditor.name || !creditor.zip || !creditor.city) out.push('Name, PLZ und Ort der Firma fehlen (Einstellungen → Website).');
  return out;
}
