import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { sql } from './db';
import { sha256 } from './lib/crypto';
import { getEntry, getCollection, publishBlockers, updateEntry, type SaveContext } from './content';
import { getSettings } from './settings';
import { parseLang, requestLang, saveTranslation, translationView } from './translations';
import { applyData, toData } from '../shared/collab-doc';
import { entryPath } from '../shared/paths';
import { can } from '../shared/roles';
import type { Lang } from '../shared/i18n';
import type { Entry, EntryData, Role } from '../shared/types';

/**
 * Real-time editing: one Yjs document per entry and language lives here while
 * someone has it open. Editors connect over a WebSocket (y-protocols sync and
 * awareness); the server is the only one that writes to the database, a
 * moment after the last change, through the same updateEntry() as everything
 * else (sanitising, hooks, revisions). The Yjs state is stored too, so
 * offline copies in the browser share its history and merge cleanly.
 */

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_STATUS = 2; // server → editor: JSON (saved, error, reset)
const MSG_FLUSH = 3; // editor → server: save now (JSON options)
const SAVE_DELAY = 800;
const KEEP_EMPTY = 30_000;

interface Person {
  id: string;
  name: string;
  role: Role;
  canCode: boolean;
  studioOnly: boolean;
}
interface Conn {
  person: Person;
  /** Awareness client ids this connection controls (removed when it leaves). */
  clients: Set<number>;
}
interface Room {
  key: string;
  entryId: string;
  lang: Lang | null;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Conn>;
  /** Who changed something since the last save – the strictest rights apply. */
  editors: Map<string, Person>;
  timer: ReturnType<typeof setTimeout> | null;
  saving: Promise<void> | null;
  again: boolean;
  /** Someone changed stock or variants on purpose (else the stock in the database wins, like with REST). */
  stockTouched: boolean;
  idle: ReturnType<typeof setTimeout> | null;
  ready: Promise<void>;
}

const rooms = new Map<string, Room>();
const roomKey = (entryId: string, lang: Lang | null) => `${entryId}:${lang ?? ''}`;

const send = (ws: WebSocket, data: Uint8Array) => {
  if (ws.readyState === ws.OPEN) ws.send(data, (err) => err && ws.close());
};
function status(room: Room, payload: Record<string, unknown>, only?: WebSocket) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_STATUS);
  encoding.writeVarString(e, JSON.stringify(payload));
  const msg = encoding.toUint8Array(e);
  for (const ws of only ? [only] : room.conns.keys()) send(ws, msg);
}

async function entryData(entryId: string, lang: Lang | null): Promise<{ entry: Entry; data: EntryData }> {
  const e = await getEntry(entryId);
  if (!lang) return { entry: e, data: e.data };
  const v = await translationView(e, lang);
  return { entry: v, data: v.data };
}

async function openRoom(entryId: string, lang: Lang | null): Promise<Room> {
  const key = roomKey(entryId, lang);
  const hit = rooms.get(key);
  if (hit) {
    if (hit.idle) clearTimeout(hit.idle);
    hit.idle = null;
    await hit.ready;
    return hit;
  }
  const doc = new Y.Doc({ gc: true });
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const room: Room = {
    key,
    entryId,
    lang,
    doc,
    awareness,
    conns: new Map(),
    editors: new Map(),
    timer: null,
    saving: null,
    again: false,
    stockTouched: false,
    idle: null,
    ready: Promise.resolve(),
  };
  rooms.set(key, room);
  room.ready = (async () => {
    const [stored] = await sql`select state from entry_ydocs where entry_id = ${entryId} and lang = ${lang ?? ''}`;
    if (stored) Y.applyUpdate(doc, new Uint8Array(stored.state as Buffer), 'server');
    // Changed elsewhere since (API, CLI, restore)? Bring the shared history up to date.
    const { data } = await entryData(entryId, lang);
    applyData(doc, data, 'server');
  })();
  await room.ready;

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    syncProtocol.writeUpdate(e, update);
    const msg = encoding.toUint8Array(e);
    for (const ws of room.conns.keys()) if (ws !== origin) send(ws, msg);
    if (origin !== 'server') {
      const conn = room.conns.get(origin as WebSocket);
      if (conn) room.editors.set(conn.person.id, conn.person);
      schedule(room);
    }
  });
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    const changed = [...added, ...updated, ...removed];
    const conn = room.conns.get(origin as WebSocket);
    if (conn) {
      for (const id of added) conn.clients.add(id);
      for (const id of removed) conn.clients.delete(id);
    }
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
    const msg = encoding.toUint8Array(e);
    for (const ws of room.conns.keys()) send(ws, msg);
  });
  return room;
}

function schedule(room: Room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => void persist(room), SAVE_DELAY);
}

/** Puts back what the server changed while saving (sanitised HTML, hooks) – only where nobody typed since. */
function reconcile(doc: Y.Doc, sent: EntryData, saved: EntryData) {
  if (JSON.stringify(sent) === JSON.stringify(saved)) return;
  const now = toData(doc) as Record<string, unknown>;
  const s = sent as Record<string, unknown>;
  const v = saved as Record<string, unknown>;
  const next: Record<string, unknown> = { ...now };
  for (const k of new Set([...Object.keys(s), ...Object.keys(v)])) {
    if (k === 'blocks') continue;
    if (JSON.stringify(now[k]) === JSON.stringify(s[k]) && JSON.stringify(s[k]) !== JSON.stringify(v[k])) next[k] = v[k];
  }
  const savedBlocks = new Map((saved.blocks ?? []).map((b) => [b.id, b]));
  const sentBlocks = new Map((sent.blocks ?? []).map((b) => [b.id, b]));
  next.blocks = (now.blocks as EntryData['blocks'])?.map((b) => {
    const was = sentBlocks.get(b.id);
    const is = savedBlocks.get(b.id);
    return was && is && JSON.stringify(b) === JSON.stringify(was) ? is : b;
  });
  if (!('blocks' in now) && !('blocks' in v)) delete next.blocks;
  applyData(doc, next as EntryData, 'server');
}

async function persist(room: Room): Promise<void> {
  room.timer = null;
  if (room.saving) {
    room.again = true;
    return room.saving;
  }
  const people = [...room.editors.values()];
  room.editors.clear();
  if (!people.length) return;
  const ctx: SaveContext & { collab: true } = {
    userId: people[people.length - 1].id,
    canCode: people.every((p) => p.canCode),
    studioOnly: people.some((p) => p.studioOnly),
    collab: true,
  };
  const sent = toData(room.doc);
  room.saving = (async () => {
    try {
      const entry = room.lang
        ? await requestLang.run(room.lang, async () => saveTranslation(await getEntry(room.entryId), room.lang!, { data: sent as Record<string, unknown> }, ctx))
        : await updateEntry(room.entryId, { data: sent as Record<string, unknown>, stockTouched: room.stockTouched }, ctx);
      room.stockTouched = false;
      reconcile(room.doc, sent, entry.data);
      await sql`
        insert into entry_ydocs (entry_id, lang, state) values (${room.entryId}, ${room.lang ?? ''}, ${Buffer.from(Y.encodeStateAsUpdate(room.doc))})
        on conflict (entry_id, lang) do update set state = excluded.state, updated_at = now()`;
      const col = await getCollection(entry.collection);
      const p = entryPath(col, entry.slug);
      status(room, {
        t: 'saved',
        entry: { ...entry, data: undefined },
        path: p && room.lang ? (p === '/' ? `/${room.lang}` : `/${room.lang}${p}`) : p,
        blockers: publishBlockers(col, entry.data),
      });
    } catch (e) {
      // Hooks or validation said no: everyone in the room sees why; the next change tries again.
      for (const p of people) room.editors.set(p.id, p);
      status(room, { t: 'error', message: (e as Error).message });
    }
  })();
  await room.saving;
  room.saving = null;
  if (room.again) {
    room.again = false;
    await persist(room);
  }
}

/** Something changed the entry outside the room (API, CLI, restore, discard): bring the open editors along. */
export async function externalChange(entryId: string, lang: Lang | null = null): Promise<void> {
  const room = rooms.get(roomKey(entryId, lang));
  if (!room) return;
  const { data } = await entryData(entryId, lang);
  applyData(room.doc, data, 'server');
  status(room, { t: 'reset' });
}

/** Saves rooms with pending changes (used before shutdown and by tests). */
export async function flushRooms(): Promise<void> {
  await Promise.all([...rooms.values()].map((r) => (r.timer || r.editors.size ? persist(r) : r.saving)));
}

function leave(room: Room, ws: WebSocket) {
  const conn = room.conns.get(ws);
  room.conns.delete(ws);
  if (conn) awarenessProtocol.removeAwarenessStates(room.awareness, [...conn.clients], null);
  if (room.conns.size) return;
  room.idle = setTimeout(async () => {
    if (room.conns.size) return;
    await persist(room);
    if (room.conns.size) return;
    rooms.delete(room.key);
    room.awareness.destroy();
    room.doc.destroy();
  }, KEEP_EMPTY);
}

function onMessage(room: Room, ws: WebSocket, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const type = decoding.readVarUint(decoder);
  if (type === MSG_SYNC) {
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, MSG_SYNC);
    syncProtocol.readSyncMessage(decoder, reply, room.doc, ws);
    if (encoding.length(reply) > 1) send(ws, encoding.toUint8Array(reply));
  } else if (type === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), ws);
  } else if (type === MSG_FLUSH) {
    const opts = JSON.parse(decoding.readVarString(decoder) || '{}') as { stockTouched?: boolean };
    const conn = room.conns.get(ws);
    if (conn) room.editors.set(conn.person.id, conn.person);
    if (opts.stockTouched) room.stockTouched = true;
    if (room.timer) clearTimeout(room.timer);
    void persist(room);
  }
}

/* ---------- connection: session cookie, rights, origin ---------- */

async function personFor(req: IncomingMessage): Promise<Person | null> {
  const raw = /(?:^|;\s*)nova_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (!raw) return null;
  const [row] = await sql`
    select u.id, u.name, u.role, u.mode, s.pending_2fa from sessions s join users u on u.id = s.user_id
    where s.id = ${sha256(decodeURIComponent(raw))} and s.expires_at > now()`;
  if (!row || row.pending_2fa || row.role === 'member') return null;
  const role = row.role as Role;
  const settings = await getSettings();
  const werkbank = row.mode === 'werkbank' && (settings.roleModes[role] ?? []).includes('werkbank');
  return { id: row.id as string, name: row.name as string, role, canCode: can(role, 'dev') && werkbank, studioOnly: !werkbank || !can(role, 'dev') };
}

async function mayEdit(p: Person, entryId: string): Promise<boolean> {
  if (can(p.role, 'content.edit')) return true;
  if (!can(p.role, 'content.edit.own')) return false;
  const [e] = await sql`select author_id from entries where id = ${entryId}`;
  return Boolean(e && e.author_id === p.id);
}

const PATH = /^\/api\/collab\/([0-9a-f-]{36})$/;

export function attachCollab(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const m = PATH.exec(url.pathname);
    if (!m) return; // not ours (another upgrade handler may take it)
    void (async () => {
      const reject = (code: number) => {
        socket.write(`HTTP/1.1 ${code} ${code === 401 ? 'Unauthorized' : code === 404 ? 'Not Found' : 'Forbidden'}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
      };
      try {
        // Same origin only: a page elsewhere must not edit with the visitor's cookie.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== (req.headers['x-forwarded-host'] ?? req.headers.host)) return reject(403);
        const person = await personFor(req);
        if (!person) return reject(401);
        const [exists] = await sql`select 1 from entries where id = ${m[1]}`;
        if (!exists) return reject(404);
        if (!(await mayEdit(person, m[1]))) return reject(403);
        const lang = await parseLang(url.searchParams.get('lang')).catch(() => undefined);
        if (lang === undefined) return reject(404);
        wss.handleUpgrade(req, socket, head, (ws) => void join(ws, person, m[1], lang));
      } catch {
        reject(403);
      }
    })();
  });
}

async function join(ws: WebSocket, person: Person, entryId: string, lang: Lang | null) {
  // Listen at once: the editor talks right after connecting, while the room may still be loading.
  const early: Uint8Array[] = [];
  let room: Room | null = null;
  ws.binaryType = 'arraybuffer';
  ws.on('message', (data: ArrayBuffer | Buffer) => {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (!room) return void early.push(bytes);
    try {
      onMessage(room, ws, bytes);
    } catch (e) {
      console.error('[collab]', (e as Error).message);
    }
  });
  let gone = false;
  ws.once('close', () => (gone = true));
  room = await openRoom(entryId, lang);
  room.conns.set(ws, { person, clients: new Set() });
  // Gone while the room was loading: leave properly, so an empty room is closed after a while.
  if (gone) return leave(room, ws);
  for (const bytes of early.splice(0)) {
    try {
      onMessage(room, ws, bytes);
    } catch (e) {
      console.error('[collab]', (e as Error).message);
    }
  }
  const r = room;
  ws.on('close', () => leave(r, ws));
  // Start: our state vector (the editor answers with what we're missing) and who's here.
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_SYNC);
  syncProtocol.writeSyncStep1(e, room.doc);
  send(ws, encoding.toUint8Array(e));
  const states = [...room.awareness.getStates().keys()];
  if (states.length) {
    const a = encoding.createEncoder();
    encoding.writeVarUint(a, MSG_AWARENESS);
    encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(room.awareness, states));
    send(ws, encoding.toUint8Array(a));
  }
}
