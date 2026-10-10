import { connect } from 'node:net';
import { inflateSync } from 'node:zlib';
import { env } from './env';
import { badRequest, HttpError } from './lib/http';

/**
 * Checks every upload before it is stored – website forms take files from
 * strangers, and the media library hands files on to visitors.
 *
 * 1. Always: the structure. No programs, no Office macros, no archives with
 *    programs inside, no PDFs that run JavaScript, launch something or carry
 *    attached files. This needs no service and catches the usual ways a
 *    document becomes an attack – it is not a virus scanner.
 * 2. With CLAMAV_HOST: ClamAV (clamd over TCP, e.g. its own Railway service)
 *    looks at every file with its signatures. If it is configured but not
 *    reachable, uploads wait rather than slip through.
 */

export interface ScanResult {
  engine: 'basic' | 'clamav';
  /** ClamAV version and signature database, e.g. «ClamAV 1.4.1/27431». */
  version?: string;
  at: string;
}

export class MalwareFound extends HttpError {
  constructor(readonly signature: string) {
    super(422, `In der Datei wurde Schadsoftware gefunden (${signature}). Sie wurde nicht gespeichert.`);
  }
}

/* ---------- structure ---------- */

/** Programs: never inside an upload. */
const PROGRAM_EXT = /\.(exe|dll|scr|com|pif|cpl|msi|msp|lnk|jar|apk|app|dmg|iso|img|elf|reg|scf|inf)$/i;
/** Scripts and macro documents: start with a double click on Windows. Fine inside an e-book or Office file, not in a plain ZIP. */
const SCRIPT_EXT = /\.(bat|cmd|ps1|psm1|vbs|vbe|jse?|wsf|wsh|hta|sh|docm|xlsm|pptm|dotm|xltm)$/i;
const MACRO_PART = /(^|\/)(vbaProject\.bin|vbaData\.xml|activeX\d*\.(xml|bin))$/i;

function programHeader(buf: Buffer): boolean {
  const h = buf.subarray(0, 4);
  return (
    (h[0] === 0x4d && h[1] === 0x5a) || // MZ: Windows program
    h.toString('latin1') === '\x7fELF' || // Linux program
    [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(h.length === 4 ? h.readUInt32BE(0) : 0) // Mach-O, Java class
  );
}

/** Names of the files inside a ZIP (central directory; local headers if that is damaged). */
export function zipEntries(buf: Buffer): string[] {
  const names: string[] = [];
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd >= 0 && eocd + 22 <= buf.length) {
    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count && at + 46 <= buf.length && buf.readUInt32LE(at) === 0x02014b50; i++) {
      const nameLen = buf.readUInt16LE(at + 28);
      names.push(buf.subarray(at + 46, at + 46 + nameLen).toString('utf8'));
      at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    }
    if (names.length === count && count !== 0xffff) return names;
  }
  // Fallback (ZIP64, damaged directory): walk the local file headers.
  names.length = 0;
  const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  for (let at = buf.indexOf(sig); at >= 0 && at + 30 <= buf.length; at = buf.indexOf(sig, at + 4)) {
    const nameLen = buf.readUInt16LE(at + 26);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8');
    if (nameLen && /^[\x20-\x7e -￿]+$/.test(name)) names.push(name);
  }
  return names;
}

/** PDF text with compressed streams unpacked and #xx escapes in names resolved («/J#61vaScript»). */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const parts = [raw];
  let budget = 50 * 1024 * 1024;
  const re = /stream\r?\n/g;
  for (let m = re.exec(raw); m && budget > 0; m = re.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const out = inflateSync(buf.subarray(start, end), { maxOutputLength: Math.min(budget, 20 * 1024 * 1024) });
      budget -= out.length;
      parts.push(out.toString('latin1'));
    } catch {
      /* not deflated, or damaged – the raw text is still checked */
    }
    re.lastIndex = end;
  }
  return parts.join('\n').replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Throws with a message that says what to do, or returns quietly. */
export function checkStructure(buf: Buffer, ext: string): void {
  if (programHeader(buf)) throw badRequest('Programmdateien werden nicht angenommen.');
  if (['.zip', '.docx', '.xlsx', '.epub'].includes(ext)) {
    const names = zipEntries(buf);
    if (names.some((n) => MACRO_PART.test(n)))
      throw badRequest('Dokumente mit Makros oder ActiveX werden nicht angenommen. Speichere die Datei ohne Makros (als .docx/.xlsx) und lade sie nochmals hoch.');
    const program = names.find((n) => PROGRAM_EXT.test(n) || (ext === '.zip' && SCRIPT_EXT.test(n)));
    if (program) throw badRequest(`Im Archiv steckt eine Programmdatei («${program.split('/').pop()}»). Solche Archive werden nicht angenommen.`);
  }
  if (ext === '.pdf') {
    const text = pdfText(buf);
    if (/\/(JavaScript|JS)\b/.test(text))
      throw badRequest('Diese PDF enthält JavaScript. Speichere sie neu als PDF (z. B. über «Drucken → Als PDF sichern») und lade sie nochmals hoch.');
    if (/\/(Launch|EmbeddedFiles?|RichMedia)\b/.test(text))
      throw badRequest(
        'Diese PDF startet Programme oder enthält angehängte Dateien. Speichere sie neu als PDF (z. B. über «Drucken → Als PDF sichern») und lade sie nochmals hoch.',
      );
  }
}

/* ---------- ClamAV (clamd) ---------- */

export const clamConfigured = () => Boolean(env.clamav.host);

function clamd(send: (sock: import('node:net').Socket) => void, timeout = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host: env.clamav.host, port: env.clamav.port });
    let reply = '';
    const fail = () => {
      sock.destroy();
      reject(new HttpError(503, 'Die Virenprüfung ist gerade nicht erreichbar. Versuch es in einer Minute nochmal.'));
    };
    sock.setTimeout(timeout, fail);
    sock.on('error', fail);
    sock.on('connect', () => send(sock));
    sock.on('data', (d) => (reply += d.toString('utf8')));
    sock.on('end', () => resolve(reply.replace(/\0/g, '').trim()));
  });
}

let version: { text: string; at: number } | null = null;
async function clamVersion(): Promise<string> {
  if (version && Date.now() - version.at < 60 * 60_000) return version.text;
  const text = (await clamd((s) => s.end('zVERSION\0'), 10_000)).split('/').slice(0, 2).join('/');
  version = { text, at: Date.now() };
  return text;
}

/** «OK», or the name of what was found. */
async function clamScan(buf: Buffer): Promise<{ found: string | null }> {
  const reply = await clamd((s) => {
    s.write('zINSTREAM\0');
    const chunk = 64 * 1024;
    for (let at = 0; at < buf.length; at += chunk) {
      const part = buf.subarray(at, at + chunk);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(part.length);
      s.write(len);
      s.write(part);
    }
    s.end(Buffer.alloc(4));
  });
  const found = /^stream: (.+) FOUND$/.exec(reply);
  if (found) return { found: found[1] };
  if (/^stream: OK$/.test(reply)) return { found: null };
  // «INSTREAM size limit exceeded», «ERROR» and the like: not checked means not stored.
  console.error(`[scan] clamd: ${reply}`);
  throw new HttpError(503, 'Die Virenprüfung hat die Datei nicht prüfen können. Versuch es nochmal oder frag die Person, die Nova betreibt.');
}

export async function scanUpload(buf: Buffer, ext: string): Promise<ScanResult> {
  checkStructure(buf, ext);
  if (!clamConfigured()) return { engine: 'basic', at: new Date().toISOString() };
  const { found } = await clamScan(buf);
  if (found) throw new MalwareFound(found);
  return { engine: 'clamav', version: await clamVersion().catch(() => undefined), at: new Date().toISOString() };
}
