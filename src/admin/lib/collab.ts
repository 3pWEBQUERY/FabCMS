import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import type { Entry } from '../../shared/types';

/**
 * Connection to the real-time room of one entry (see server/collab.ts):
 * Yjs sync and awareness over a WebSocket. With `keep` set (the document
 * has been in sync with the server in this browser), it stays usable when
 * the connection drops and reconnects on its own; the copy in IndexedDB
 * survives a reload, so edits made offline are merged later.
 */

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_STATUS = 2;
const MSG_FLUSH = 3;

export interface Peer {
  clientId: number;
  id: string;
  name: string;
  color: string;
  block: string | null;
}
export type CollabStatus = { t: 'saved'; entry: Partial<Entry>; path: string | null; blockers: string[] } | { t: 'error'; message: string } | { t: 'reset' };
export type LinkState = 'connecting' | 'live' | 'offline';

const COLORS = ['#c2410c', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f', '#a16207', '#0e7490'];
export const colorFor = (id: string) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];

export class CollabSession {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  state: LinkState = 'connecting';
  private ws: WebSocket | null = null;
  private closed = false;
  private synced = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private local: IndexeddbPersistence | null = null;
  /** Keep the document and reconnect when the link drops (instead of giving up). */
  keep = false;
  /** Has been live at least once. */
  everLive = false;
  private waiters: ((ok: boolean) => void)[] = [];

  constructor(
    private url: string,
    me: { id: string; name: string },
    private on: { state: (s: LinkState) => void; status: (s: CollabStatus) => void; peers: (p: Peer[]) => void },
  ) {
    this.awareness.setLocalState({ user: { id: me.id, name: me.name, color: colorFor(me.id) }, block: null });
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, update);
      this.send(encoding.toUint8Array(e));
    });
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin !== 'local') {
        this.emitPeers();
        return;
      }
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_AWARENESS);
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
      this.send(encoding.toUint8Array(e));
    });
  }

  /** Opens the connection (after the local copy is loaded, if any). */
  start() {
    this.connect();
  }

  private setState(s: LinkState) {
    if (this.state === s) return;
    this.state = s;
    this.on.state(s);
  }

  private send(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data as Uint8Array<ArrayBuffer>);
  }

  private connect() {
    if (this.closed) return;
    this.synced = false;
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    // No answer in time counts as offline; the editor saves the old way meanwhile.
    const giveUp = setTimeout(() => {
      if (this.state !== 'connecting') return;
      this.setState('offline');
      ws.close();
    }, 4000);
    ws.onopen = () => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeSyncStep1(e, this.doc);
      ws.send(encoding.toUint8Array(e) as Uint8Array<ArrayBuffer>);
      const a = encoding.createEncoder();
      encoding.writeVarUint(a, MSG_AWARENESS);
      encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      ws.send(encoding.toUint8Array(a) as Uint8Array<ArrayBuffer>);
    };
    ws.onmessage = (ev) => this.receive(new Uint8Array(ev.data as ArrayBuffer));
    ws.onclose = () => {
      clearTimeout(giveUp);
      if (this.ws !== ws) return;
      this.ws = null;
      // Others' cursors are stale without a connection.
      awarenessProtocol.removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter((k) => k !== this.doc.clientID),
        'local-cleanup',
      );
      this.emitPeers();
      for (const w of this.waiters.splice(0)) w(false);
      if (this.closed) return;
      this.setState('offline');
      // With a usable document: try again, a little later each time. Otherwise the editor decides.
      if (this.keep) this.timer = setTimeout(() => this.connect(), Math.min(20_000, 1000 * 2 ** this.retry++) + Math.random() * 400);
    };
  }

  private receive(data: Uint8Array) {
    const d = decoding.createDecoder(data);
    const type = decoding.readVarUint(d);
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      const kind = syncProtocol.readSyncMessage(d, reply, this.doc, this);
      if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply));
      if (kind === syncProtocol.messageYjsSyncStep2 && !this.synced) {
        this.synced = true;
        this.retry = 0;
        this.everLive = true;
        this.setState('live');
      }
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(d), 'remote');
    } else if (type === MSG_STATUS) {
      const s = JSON.parse(decoding.readVarString(d)) as CollabStatus;
      if (s.t === 'saved' || s.t === 'error') for (const w of this.waiters.splice(0)) w(s.t === 'saved');
      this.on.status(s);
    }
  }

  private emitPeers() {
    const peers: Peer[] = [];
    for (const [clientId, st] of this.awareness.getStates()) {
      if (clientId === this.doc.clientID || !st?.user) continue;
      peers.push({ clientId, id: st.user.id, name: st.user.name, color: st.user.color, block: st.block ?? null });
    }
    this.on.peers(peers);
  }

  /** Keeps the document in IndexedDB (resolves when the stored copy is loaded). */
  persist(name: string): Promise<void> {
    if (this.local) return Promise.resolve();
    this.local = new IndexeddbPersistence(name, this.doc);
    return this.local.whenSynced.then(() => undefined);
  }

  /** Try now (back online). */
  reconnect() {
    if (this.closed || this.ws) return;
    if (this.timer) clearTimeout(this.timer);
    this.retry = 0;
    this.connect();
  }

  /** Which block I'm on – the others see it outlined in my colour. */
  setBlock(block: string | null) {
    const cur = this.awareness.getLocalState();
    if (cur?.block === block) return;
    this.awareness.setLocalStateField('block', block);
  }

  /** Asks the server to save now; resolves when it did (or failed / no connection). */
  flush(extra: { stockTouched?: boolean } = {}): Promise<boolean> {
    if (this.state !== 'live') return Promise.resolve(false);
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_FLUSH);
    encoding.writeVarString(e, JSON.stringify(extra));
    this.send(encoding.toUint8Array(e));
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      setTimeout(() => resolve(false), 8000);
    });
  }

  destroy() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    void this.local?.destroy();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
