import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { resolveTheme } from '../site/themes';
import type { SiteSettings } from '../shared/types';
import { storage } from './storage';

/**
 * Social preview images (1200×630): the page title in the theme's display font
 * on the theme's colours. Text is set by libvips/Pango (proper shaping and
 * kerning); the fonts come from @fontsource as WOFF and are unpacked to TTF
 * once, because fontconfig doesn't read WOFF.
 */
const require = createRequire(import.meta.url);

/** Pango font descriptions. The static fonts register as e.g. family «Fraunces Medium», hence the comma. */
const OG_FONTS: Record<string, { file: string; desc: string }> = {
  kante: { file: '@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff', desc: 'Instrument Sans SemiBold,' },
  bistro: { file: '@fontsource/fraunces/files/fraunces-latin-500-normal.woff', desc: 'Fraunces Medium,' },
  salon: { file: '@fontsource/bodoni-moda/files/bodoni-moda-latin-500-italic.woff', desc: 'Bodoni Moda Medium, Italic' },
  feuilleton: { file: '@fontsource/newsreader/files/newsreader-latin-500-normal.woff', desc: 'Newsreader Medium,' },
};
const LABEL = OG_FONTS.kante;

/** WOFF 1.0 → SFNT (TrueType/OpenType). Each table is just zlib-compressed. */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Keine WOFF-Datei');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables: { tag: string; checksum: number; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = woff.toString('ascii', o, o + 4);
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const checksum = woff.readUInt32BE(o + 16);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw) });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const pow = 2 ** Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(Math.log2(pow), 8);
  header.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = header.length;
  const chunks: Buffer[] = [header];
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    header.write(t.tag, r, 'ascii');
    header.writeUInt32BE(t.checksum, r + 4);
    header.writeUInt32BE(offset, r + 8);
    header.writeUInt32BE(t.data.length, r + 12);
    const padded = Buffer.alloc((t.data.length + 3) & ~3);
    t.data.copy(padded);
    chunks.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(chunks);
}

const FONT_DIR = join(tmpdir(), 'nova-og-fonts');
function ttf(file: string): string {
  const out = join(FONT_DIR, file.split('/').pop()!.replace(/\.woff$/, '.ttf'));
  if (!existsSync(out)) {
    mkdirSync(FONT_DIR, { recursive: true });
    writeFileSync(out, woffToSfnt(readFileSync(require.resolve(file))));
  }
  return out;
}

const escapeMarkup = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

async function textImage(text: string, font: { file: string; desc: string }, px: number, color: string, width: number, letterSpacing = 0) {
  const markup = `<span foreground="${color}"${letterSpacing ? ` letter_spacing="${Math.round(letterSpacing * 1024)}"` : ''}>${escapeMarkup(text)}</span>`;
  return sharp({
    text: { text: markup, font: `${font.desc} ${px}px`, fontfile: ttf(font.file), width, rgba: true, wrap: 'word', spacing: Math.round(px * 0.1) },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export async function renderOgImage(settings: SiteSettings, title: string, kicker: string): Promise<Buffer> {
  const { theme, palette } = resolveTheme(settings);
  const W = 1200;
  const H = 630;
  const pad = 80;
  const font = OG_FONTS[theme.id] ?? OG_FONTS.kante;
  let px = 76;
  let t = await textImage(title, font, px, palette.ink, W - pad * 2);
  // Shrink long titles until they fit into the free area.
  while (t.info.height > H - pad * 2 - 90 && px > 44) {
    px -= 8;
    t = await textImage(title, font, px, palette.ink, W - pad * 2);
  }
  const k = await textImage(kicker.toUpperCase(), LABEL, 22, palette.ink2, W - pad * 2, 2.5);
  const bar = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: palette.accent } }).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: palette.bg } })
    .composite([
      { input: k.data, left: pad, top: pad },
      { input: await bar(64, 4), left: pad, top: pad + k.info.height + 18 },
      { input: t.data, left: pad, top: Math.max(pad + 90, H - pad - 14 - t.info.height) },
      { input: await bar(W, 14), left: 0, top: H - 14 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function cachedOgImage(key: string, settings: SiteSettings, title: string, kicker: string): Promise<Buffer> {
  const { theme, palette } = resolveTheme(settings);
  const storageKey = `og/${key}-${theme.id}-${palette.id}.png`;
  const hit = await storage.getBuffer(storageKey);
  if (hit) return hit;
  const png = await renderOgImage(settings, title, kicker);
  await storage.put(storageKey, png, 'image/png');
  return png;
}
