/** Gift card codes: twelve characters in three groups, without letters that look alike (0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function giftCardCode(random: (n: number) => Uint8Array): string {
  const bytes = random(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
}

/** What people type: any case, spaces or none, dashes or none. */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : input.trim().toUpperCase();
}

/** How much of a card goes into this order: never more than its balance or what is to pay. */
export const giftCardApplies = (balance: number, payable: number) => Math.max(0, Math.min(balance, payable));
