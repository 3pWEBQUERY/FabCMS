/**
 * Nova CLI – Inhalte als Dateien, für Git und Skripte. Ohne Abhängigkeiten,
 * Node 22+. Holen: `node nova.mjs pull`, ändern, `node nova.mjs push`.
 *
 * Konfiguration: nova.json ({ "url": "https://…", "dir": "content" }), das
 * Token kommt aus NOVA_TOKEN oder --token (nie in nova.json, damit es nicht
 * im Repository landet).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

interface Config {
  url: string;
  dir: string;
}
interface RemoteEntry {
  id: string;
  slug: string;
  status: string;
  version?: number;
  data: Record<string, unknown>;
}
interface FileEntry {
  id?: string;
  slug?: string;
  status?: string;
  version?: number;
  data: Record<string, unknown>;
}
type State = Record<string, { id: string; version?: number; hash: string }>;

const HELP = `Nova CLI

  nova init <url>                 nova.json für diese Website anlegen
  nova pull [--force]             Inhalte (inkl. Entwürfe) als JSON-Dateien holen
  nova status                     Was hat sich lokal geändert?
  nova push [--publish] [--dry-run] [--force]
                                  Geänderte und neue Dateien hochladen
  nova types [--out nova.ts]      Typisiertes TypeScript-SDK erzeugen
  nova graphql '<query>' [--vars '{"a":1}']
                                  GraphQL-Abfrage ausführen, Ergebnis als JSON

Optionen
  --url <url>      Website (sonst NOVA_URL oder nova.json)
  --token <token>  API-Token (sonst NOVA_TOKEN). Lesen reicht für pull, push braucht Schreibrecht.
  --dir <ordner>   Ordner für Inhalte (Standard: content)

Dateien: <ordner>/<inhaltstyp>/<adresse>.json mit { id, slug, status, version, data }.
Neue Einträge: Datei ohne id anlegen – push erstellt sie und trägt die id ein.
Gelöscht wird nie: eine lokal entfernte Datei bleibt auf der Website bestehen.`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string' },
    token: { type: 'string' },
    dir: { type: 'string' },
    out: { type: 'string' },
    vars: { type: 'string' },
    publish: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const out = (s: string) => process.stdout.write(`${s}\n`);
const fail = (s: string): never => {
  process.stderr.write(`✗ ${s}\n`);
  process.exit(1);
};

function config(): Config {
  const file = existsSync('nova.json') ? (JSON.parse(readFileSync('nova.json', 'utf8')) as Partial<Config>) : {};
  const url = (opts.url ?? process.env.NOVA_URL ?? file.url ?? '').replace(/\/+$/, '');
  if (!url) fail('Keine Website angegeben. Zuerst `nova init https://deine-website.ch` oder --url.');
  return { url, dir: opts.dir ?? file.dir ?? 'content' };
}
const token = () => opts.token ?? process.env.NOVA_TOKEN ?? '';

async function api<T>(cfg: Config, method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'nova-cli' };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(cfg.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return fail(`${cfg.url} ist nicht erreichbar (${(e as Error).message}).`);
  }
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}
const errorOf = (j: unknown) => (j as { error?: string })?.error ?? 'Unbekannter Fehler';

const hashOf = (e: FileEntry) =>
  createHash('sha256')
    .update(JSON.stringify({ slug: e.slug ?? '', data: e.data }))
    .digest('hex')
    .slice(0, 16);
const fileFor = (dir: string, col: string, slug: string) => join(dir, col, `${slug === '' ? '_home' : slug}.json`);
const statePath = (dir: string) => join(dir, '.nova-state.json');
const readState = (dir: string): State => (existsSync(statePath(dir)) ? JSON.parse(readFileSync(statePath(dir), 'utf8')) : {});
const writeState = (dir: string, s: State) => writeFileSync(statePath(dir), `${JSON.stringify(s, null, 2)}\n`);
const rel = (dir: string, file: string) => relative(dir, file).split(sep).join('/');
function writeEntry(file: string, e: FileEntry) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ id: e.id, slug: e.slug, status: e.status, version: e.version, data: e.data }, null, 2)}\n`);
}

/** All entry files below dir/<collection>/. */
function localFiles(dir: string): { file: string; collection: string }[] {
  if (!existsSync(dir)) return [];
  const outFiles: { file: string; collection: string }[] = [];
  const walk = (d: string, collection: string) => {
    for (const x of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, x.name);
      if (x.isDirectory()) walk(p, collection);
      else if (x.name.endsWith('.json')) outFiles.push({ file: p, collection });
    }
  };
  for (const x of readdirSync(dir, { withFileTypes: true })) if (x.isDirectory() && !x.name.startsWith('.')) walk(join(dir, x.name), x.name);
  return outFiles;
}
function readEntry(file: string): FileEntry {
  try {
    const e = JSON.parse(readFileSync(file, 'utf8')) as FileEntry;
    if (!e || typeof e !== 'object' || !e.data || typeof e.data !== 'object') throw new Error('«data» fehlt');
    return e;
  } catch (err) {
    return fail(`${file}: ${(err as Error).message}`);
  }
}

async function collections(cfg: Config): Promise<{ id: string; name: string }[]> {
  const r = await api<{ data: { id: string; name: string }[] }>(cfg, 'GET', '/api/v1/collections');
  if (r.status !== 200) fail(`Inhaltstypen nicht lesbar: ${errorOf(r.json)}`);
  return r.json.data.filter((c) => c.id !== 'sections');
}

async function pull(cfg: Config) {
  const state = readState(cfg.dir);
  const cols = await collections(cfg);
  mkdirSync(cfg.dir, { recursive: true });
  writeFileSync(join(cfg.dir, '_collections.json'), `${JSON.stringify((await api<{ data: unknown }>(cfg, 'GET', '/api/v1/collections')).json.data, null, 2)}\n`);
  const seen = new Set<string>();
  let written = 0;
  let kept = 0;
  for (const col of cols) {
    for (let offset = 0; ; offset += 100) {
      const r = await api<{ data: RemoteEntry[]; meta: { total: number } }>(
        cfg,
        'GET',
        `/api/v1/${col.id}?limit=100&offset=${offset}&sort=created_at${token() ? '&status=all' : ''}`,
      );
      if (r.status !== 200) fail(`${col.id}: ${errorOf(r.json)}`);
      for (const e of r.json.data) {
        const file = fileFor(cfg.dir, col.id, e.slug);
        const key = rel(cfg.dir, file);
        seen.add(key);
        const prev = state[key];
        if (prev && existsSync(file) && hashOf(readEntry(file)) !== prev.hash && !opts.force) {
          out(`! ${key}: lokal geändert – nicht überschrieben (zuerst push, oder --force)`);
          kept++;
          continue;
        }
        const entry: FileEntry = { id: e.id, slug: e.slug, status: e.status, version: e.version, data: e.data };
        writeEntry(file, entry);
        state[key] = { id: e.id, version: e.version, hash: hashOf(entry) };
        written++;
      }
      if (offset + r.json.data.length >= r.json.meta.total || !r.json.data.length) break;
    }
  }
  // Gone on the website: remove the file, unless it was changed locally.
  for (const [key, s] of Object.entries(state)) {
    if (seen.has(key)) continue;
    const file = join(cfg.dir, key);
    if (existsSync(file) && hashOf(readEntry(file)) !== s.hash && !opts.force) continue;
    rmSync(file, { force: true });
    delete state[key];
    out(`- ${key}`);
  }
  writeState(cfg.dir, state);
  out(
    `✓ ${written} Einträge aus ${cols.length} Inhaltstypen in ${cfg.dir}/${kept ? `, ${kept} lokal geänderte behalten` : ''}${token() ? '' : ' (ohne Token nur Veröffentlichtes)'}`,
  );
}

function changes(cfg: Config) {
  const state = readState(cfg.dir);
  return localFiles(cfg.dir)
    .map(({ file, collection }) => {
      const key = rel(cfg.dir, file);
      const e = readEntry(file);
      const kind = !e.id ? 'neu' : !state[key] || state[key].hash !== hashOf(e) ? 'geändert' : null;
      return { file, key, collection, entry: e, kind };
    })
    .filter((x) => x.kind);
}

async function push(cfg: Config) {
  if (!token()) fail('Für push braucht es ein API-Token mit Schreibrecht (NOVA_TOKEN oder --token).');
  const state = readState(cfg.dir);
  const todo = changes(cfg);
  if (!todo.length) return out('✓ Nichts zu tun – alles wie auf der Website.');
  let ok = 0;
  let failed = 0;
  for (const t of todo) {
    if (opts['dry-run']) {
      out(`${t.kind === 'neu' ? '+' : '~'} ${t.key} (${t.kind})`);
      continue;
    }
    // New file without slug: the file name is the address.
    const slug =
      t.entry.slug ??
      (t.entry.id
        ? undefined
        : rel(join(cfg.dir, t.collection), t.file)
            .replace(/\.json$/, '')
            .replace(/^_home$/, ''));
    const body = { data: t.entry.data, slug, publish: opts.publish, version: opts.force ? undefined : t.entry.version };
    const r = t.entry.id
      ? await api<{ data: RemoteEntry }>(cfg, 'PUT', `/api/v1/${t.collection}/${encodeURIComponent(t.entry.id)}`, body)
      : await api<{ data: RemoteEntry }>(cfg, 'POST', `/api/v1/${t.collection}`, body);
    if (r.status >= 300) {
      failed++;
      out(`✗ ${t.key}: ${r.status === 409 ? 'Auf der Website inzwischen geändert – zuerst pull (oder --force überschreibt).' : errorOf(r.json)}`);
      continue;
    }
    const e = r.json.data;
    const entry: FileEntry = { id: e.id, slug: e.slug, status: e.status, version: e.version, data: e.data };
    const file = fileFor(cfg.dir, t.collection, e.slug);
    if (file !== t.file) rmSync(t.file, { force: true });
    writeEntry(file, entry);
    delete state[t.key];
    state[rel(cfg.dir, file)] = { id: e.id, version: e.version, hash: hashOf(entry) };
    ok++;
    out(`${t.kind === 'neu' ? '+' : '~'} ${rel(cfg.dir, file)}${opts.publish ? ' (veröffentlicht)' : ''}`);
  }
  if (!opts['dry-run']) writeState(cfg.dir, state);
  if (opts['dry-run']) out(`${todo.length} Änderungen würden hochgeladen.`);
  else out(`${failed ? '✗' : '✓'} ${ok} hochgeladen${failed ? `, ${failed} fehlgeschlagen` : ''}${ok && !opts.publish ? ' (als Entwurf – mit --publish gleich online)' : ''}`);
  if (failed) process.exitCode = 1;
}

async function main() {
  const [cmd, arg] = positionals;
  if (!cmd || opts.help || cmd === 'help') return out(HELP);
  if (cmd === 'init') {
    if (!arg || !/^https?:\/\//.test(arg)) fail('Aufruf: nova init https://deine-website.ch');
    const cfg = { url: arg.replace(/\/+$/, ''), dir: opts.dir ?? 'content' };
    const r = await api<{ name?: string }>(cfg, 'GET', '/api/v1');
    if (r.status !== 200 || r.json.name !== 'Nova Content API') fail(`${cfg.url} ist keine Nova-Website.`);
    writeFileSync('nova.json', `${JSON.stringify(cfg, null, 2)}\n`);
    return out(`✓ nova.json angelegt. Token setzen: export NOVA_TOKEN=… (Werkbank → API & Webhooks), dann \`nova pull\`.`);
  }
  const cfg = config();
  switch (cmd) {
    case 'pull':
      return pull(cfg);
    case 'push':
      return push(cfg);
    case 'status': {
      const c = changes(cfg);
      if (!c.length) return out('✓ Keine lokalen Änderungen.');
      for (const x of c) out(`${x.kind === 'neu' ? '+' : '~'} ${x.key} (${x.kind})`);
      return;
    }
    case 'types': {
      const res = await fetch(`${cfg.url}/api/v1/sdk.ts`);
      if (!res.ok) fail(`SDK nicht verfügbar (${res.status}).`);
      const file = opts.out ?? 'nova.ts';
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await res.text());
      return out(`✓ ${file} geschrieben.`);
    }
    case 'graphql': {
      if (!arg) fail("Aufruf: nova graphql '{ site { name } }'");
      let variables: unknown;
      try {
        variables = opts.vars ? JSON.parse(opts.vars) : undefined;
      } catch {
        fail('--vars ist kein gültiges JSON.');
      }
      const r = await api<{ errors?: { message: string }[] }>(cfg, 'POST', '/api/v1/graphql', { query: arg, variables });
      out(JSON.stringify(r.json, null, 2));
      if (r.json.errors?.length) process.exitCode = 1;
      return;
    }
    default:
      fail(`Unbekannter Befehl «${cmd}». \`nova help\` zeigt alle.`);
  }
}

await main();
