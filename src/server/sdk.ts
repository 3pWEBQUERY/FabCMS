import type { FieldDef } from '../shared/fields';
import type { CollectionDef } from '../shared/types';

/**
 * Generates a self-contained TypeScript client for the REST API: one
 * interface per content type (from the same field definitions the Studio
 * uses), select fields as literal unions, and a small fetch-based client
 * without dependencies. Works in browsers, Node 18+, Deno, Bun and edge
 * runtimes.
 */

const ident = (s: string) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : JSON.stringify(s));
const pascal = (s: string) => s.replace(/(^|_)([a-z0-9])/g, (_, __, ch: string) => ch.toUpperCase());
const lit = (v: string) => JSON.stringify(v);
const comment = (lines: (string | undefined)[], indent: string) => {
  const text = lines.filter(Boolean).map((l) => l!.replace(/\*\//g, '* /'));
  return text.length ? `${indent}/** ${text.join(` – `)} */\n` : '';
};

export function typeName(id: string): string {
  if (id.endsWith('ies')) return pascal(`${id.slice(0, -3)}y`);
  if (/(ss|sh|ch|x)es$/.test(id)) return pascal(id.slice(0, -2));
  if (id.endsWith('s') && !id.endsWith('ss')) return pascal(id.slice(0, -1));
  return pascal(id);
}

function tsType(f: FieldDef, indent: string): string {
  const options = () => (f.options?.length ? f.options.map((o) => lit(o.value)).join(' | ') : 'string');
  switch (f.type) {
    case 'number':
    case 'money':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'select':
      return options();
    case 'multiselect':
      return f.options?.length ? `Array<${options()}>` : 'string[]';
    case 'tags':
      return 'string[]';
    case 'image':
    case 'file':
      return 'MediaId';
    case 'images':
      return 'MediaId[]';
    case 'relation':
      return f.multiple ? 'EntryRef[]' : 'EntryRef';
    case 'link':
      return 'LinkValue';
    case 'location':
      return 'LocationValue';
    case 'blocks':
      return 'Block[]';
    case 'group':
      return `Array<${objectType(f.fields ?? [], `${indent}  `)}>`;
    case 'json':
    case 'form':
      return 'unknown';
    default:
      return 'string';
  }
}

function objectType(fields: FieldDef[], indent: string): string {
  if (!fields.length) return 'Record<string, never>';
  const body = fields.map((f) => `${comment([f.label, f.help], indent)}${indent}${ident(f.key)}${f.required ? '' : '?'}: ${tsType(f, indent)};`).join('\n');
  return `{\n${body}\n${indent.slice(2)}}`;
}

export function generateSdk(cols: CollectionDef[], site: { name: string; url: string }): string {
  const list = cols.filter((c) => c.id !== 'sections');
  const names = new Map<string, string>();
  const used = new Set([
    'Entry',
    'Block',
    'MediaId',
    'EntryRef',
    'LinkValue',
    'LocationValue',
    'Collections',
    'NovaClient',
    'NovaError',
    'ListOptions',
    'ListResult',
    'WriteOptions',
  ]);
  for (const c of list) {
    let n = typeName(c.id);
    for (let i = 2; used.has(n); i++) n = `${typeName(c.id)}${i}`;
    used.add(n);
    names.set(c.id, n);
  }
  const interfaces = list
    .map((c) => {
      const fields = c.has_blocks && !c.fields.some((f) => f.key === 'blocks') ? [...c.fields, { key: 'blocks', type: 'blocks', label: 'Blöcke' } as FieldDef] : c.fields;
      return `${comment([`${c.singular} (Inhaltstyp «${c.id}»)`, c.route ? `Seite: ${c.route}` : undefined], '')}export interface ${names.get(c.id)} ${objectType(fields, '  ')}`;
    })
    .join('\n\n');
  const map = list.map((c) => `  ${ident(c.id)}: ${names.get(c.id)};`).join('\n');
  const shortcuts = list.map((c) => `    ${ident(c.id)}: collection(${lit(c.id)}),`).join('\n');

  return `/* eslint-disable */
/**
 * Nova SDK für «${site.name.replace(/\*\//g, '')}» – erzeugt aus den Inhaltstypen.
 * Neu erzeugen, wenn sich Inhaltstypen ändern: \`npx nova types\` oder ${site.url}/api/v1/sdk.ts
 *
 *   import { createClient } from './nova';
 *   const nova = createClient({ token: process.env.NOVA_TOKEN });
 *   const { data } = await nova.posts.list({ limit: 5, sort: '-published_at' });
 *   data[0].data.title; // string
 */

export const NOVA_URL = ${lit(site.url)};

/** ID eines Bildes oder einer Datei aus der Mediathek. */
export type MediaId = string;
/** ID (oder Adresse) eines verknüpften Eintrags. */
export type EntryRef = string;
export interface LinkValue {
  label: string;
  href: string;
}
export interface LocationValue {
  address: string;
  lat?: number;
  lng?: number;
}
export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  [key: string]: unknown;
}

${interfaces}

export interface Collections {
${map}
}

export interface Entry<T> {
  id: string;
  slug: string;
  /** Adresse auf der Website, falls der Typ eigene Seiten hat. */
  path: string | null;
  status: 'draft' | 'review' | 'scheduled' | 'published';
  published_at: string | null;
  updated_at: string;
  data: T;
}

export interface ListOptions<T> {
  limit?: number;
  offset?: number;
  /** Feldname, mit - davor absteigend. Standard: -published_at. */
  sort?: \`\${'' | '-'}\${'published_at' | 'updated_at' | 'created_at' | (keyof T & string)}\`;
  /** Gleichheit pro Feld. */
  filter?: { [K in keyof T]?: string | number | boolean };
  /** Auch Entwürfe (braucht ein Token). */
  drafts?: boolean;
}

export interface ListResult<T> {
  data: Entry<T>[];
  meta: { total: number; limit: number; offset: number };
}

export interface WriteOptions {
  slug?: string;
  /** Gleich veröffentlichen. */
  publish?: boolean;
}

export class NovaError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NovaError';
    this.status = status;
  }
}

export interface ClientOptions {
  /** Standard: ${site.url} */
  url?: string;
  /** API-Token aus Werkbank → API & Webhooks. Ohne Token nur Veröffentlichtes. */
  token?: string;
  fetch?: typeof fetch;
}

export function createClient(options: ClientOptions = {}) {
  const base = (options.url ?? NOVA_URL).replace(/\\/+$/, '');
  const doFetch = options.fetch ?? fetch;

  async function request<R>(method: string, path: string, body?: unknown): Promise<R> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.token) headers.Authorization = \`Bearer \${options.token}\`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await doFetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new NovaError(json?.error ?? json?.errors?.[0]?.message ?? res.statusText, res.status);
    return json as R;
  }

  function collection<K extends keyof Collections & string>(id: K) {
    type T = Collections[K];
    return {
      async list(o: ListOptions<T> = {}): Promise<ListResult<T>> {
        const q = new URLSearchParams();
        if (o.limit !== undefined) q.set('limit', String(o.limit));
        if (o.offset !== undefined) q.set('offset', String(o.offset));
        if (o.sort) q.set('sort', o.sort);
        if (o.drafts) q.set('status', 'all');
        for (const [k, v] of Object.entries(o.filter ?? {})) if (v !== undefined) q.set(\`filter[\${k}]\`, String(v));
        const qs = q.toString();
        return request('GET', \`/api/v1/\${id}\${qs ? \`?\${qs}\` : ''}\`);
      },
      /** Alle Einträge, Seite für Seite geholt. */
      async *all(o: Omit<ListOptions<T>, 'limit' | 'offset'> = {}): AsyncGenerator<Entry<T>> {
        for (let offset = 0; ; offset += 100) {
          const page = await this.list({ ...o, limit: 100, offset });
          yield* page.data;
          if (offset + page.data.length >= page.meta.total || !page.data.length) return;
        }
      },
      /** Ein veröffentlichter Eintrag nach Adresse; null, wenn es ihn nicht gibt. */
      async get(slug: string): Promise<Entry<T> | null> {
        try {
          return (await request<{ data: Entry<T> }>('GET', \`/api/v1/\${id}/\${slug === '' ? '_home' : slug.split('/').map(encodeURIComponent).join('/')}\`)).data;
        } catch (e) {
          if (e instanceof NovaError && e.status === 404) return null;
          throw e;
        }
      },
      async create(data: T, o: WriteOptions = {}): Promise<Entry<T>> {
        return (await request<{ data: Entry<T> }>('POST', \`/api/v1/\${id}\`, { data, ...o })).data;
      },
      async update(entryId: string, data: T, o: WriteOptions = {}): Promise<Entry<T>> {
        return (await request<{ data: Entry<T> }>('PUT', \`/api/v1/\${id}/\${encodeURIComponent(entryId)}\`, { data, ...o })).data;
      },
    };
  }

  return {
    collection,
${shortcuts}
    /** GraphQL-Abfrage; Schema unter \${base}/api/v1/graphql/schema.graphql */
    async graphql<R = Record<string, unknown>>(query: string, variables?: Record<string, unknown>): Promise<R> {
      const r = await request<{ data: R; errors?: { message: string }[] }>('POST', '/api/v1/graphql', { query, variables });
      if (r.errors?.length) throw new NovaError(r.errors[0].message, 200);
      return r.data;
    },
  };
}

export type NovaClient = ReturnType<typeof createClient>;
`;
}
