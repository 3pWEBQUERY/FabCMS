import {
  GraphQLBoolean,
  GraphQLError,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  type ASTNode,
  type GraphQLFieldConfigMap,
  type GraphQLOutputType,
  type ValidationContext,
  type ValueNode,
} from 'graphql';
import { sql } from './db';
import { activeCollections, createEntry, publishEntry, updateEntry } from './content';
import { env } from './env';
import { getSettings } from './settings';
import { mediaLoader } from '../site/context';
import { localized, localizedOne } from './translations';
import { originalUrl, variantUrl } from '../site/picture';
import { VARIANT_WIDTHS, effectiveSize, isImage } from './media';
import { entryPath } from '../shared/paths';
import { entryAccess, withoutSecrets } from '../shared/members';
import type { FieldDef } from '../shared/fields';
import type { CollectionDef, MediaItem } from '../shared/types';

/**
 * GraphQL API, generated from the content types: every collection becomes a
 * type with its own fields, images become `Media` with ready-made URLs and
 * relations resolve to the linked entry. Same rules as the REST API:
 * published content is public, drafts and writes need a token.
 */

export interface GqlContext {
  token: { scopes: string[]; userId: string | null } | null;
  media: ReturnType<typeof mediaLoader>;
  entries: Map<string, Promise<Record<string, unknown> | null>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_DEPTH = 8;

const pascal = (s: string) => s.replace(/(^|_)([a-z0-9])/g, (_, __, ch: string) => ch.toUpperCase());
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
export function singular(id: string): string {
  if (id.endsWith('ies')) return `${id.slice(0, -3)}y`;
  if (/(ss|sh|ch|x)es$/.test(id)) return id.slice(0, -2);
  if (id.endsWith('s') && !id.endsWith('ss')) return id.slice(0, -1);
  return id;
}
/** Query and type names for a collection, e.g. posts → post / posts / Post. */
export function namesFor(id: string) {
  const one = camel(singular(id));
  const many = camel(id) === one ? `all${pascal(id)}` : camel(id);
  return { one, many, type: pascal(singular(id)) };
}

function literal(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((f) => [f.name.value, literal(f.value)]));
    case Kind.LIST:
      return ast.values.map(literal);
    default:
      return null;
  }
}
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Beliebiger JSON-Wert (Blöcke, Formulare, freie Felder).',
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: literal,
});

const MediaType = new GraphQLObjectType<MediaItem, GqlContext>({
  name: 'Media',
  description: 'Bild oder Datei aus der Mediathek.',
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    filename: { type: new GraphQLNonNull(GraphQLString) },
    mime: { type: new GraphQLNonNull(GraphQLString) },
    alt: { type: new GraphQLNonNull(GraphQLString) },
    caption: { type: new GraphQLNonNull(GraphQLString) },
    width: { type: GraphQLInt, resolve: (m) => (isImage(m) ? effectiveSize(m).width : null) },
    height: { type: GraphQLInt, resolve: (m) => (isImage(m) ? effectiveSize(m).height : null) },
    color: { type: GraphQLString, description: 'Hauptfarbe als Platzhalter.' },
    url: {
      type: new GraphQLNonNull(GraphQLString),
      description: 'Absolute Adresse. Mit `width` eine verkleinerte Variante (160–2560 px), `format` avif, webp oder jpg.',
      args: { width: { type: GraphQLInt }, format: { type: GraphQLString } },
      resolve: (m, a: { width?: number; format?: string }) => {
        if (!isImage(m) || !a.width) return env.publicUrl + originalUrl(m);
        const w = VARIANT_WIDTHS.find((x) => x >= a.width!) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
        const f = a.format === 'avif' || a.format === 'jpg' ? a.format : 'webp';
        return env.publicUrl + variantUrl(m, w, f);
      },
    },
  },
});

const LinkType = new GraphQLObjectType({ name: 'Link', fields: { label: { type: GraphQLString }, href: { type: GraphQLString } } });
const LocationType = new GraphQLObjectType({ name: 'Location', fields: { address: { type: GraphQLString }, lat: { type: GraphQLFloat }, lng: { type: GraphQLFloat } } });

const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v : String(v));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

/** Members-only entries: without a token only what the paywall shows. */
function visibleData(row: Record<string, any>, drafts: boolean, ctx: GqlContext): Record<string, unknown> {
  const data = (drafts ? row.data : row.published_data) ?? {};
  if (ctx.token || entryAccess(data) === 'public') return withoutSecrets(data);
  return withoutSecrets({ ...data, blocks: [], body: undefined, description: undefined });
}

async function loadEntry(ref: unknown, collection: string, ctx: GqlContext) {
  if (typeof ref !== 'string' || !ref) return null;
  const key = `${collection}:${ref}`;
  if (!ctx.entries.has(key)) {
    const by = UUID.test(ref) ? sql`id = ${ref}` : sql`slug = ${ref}`;
    ctx.entries.set(
      key,
      sql`select * from entries where collection = ${collection} and status = 'published' and ${by} limit 1`.then(async ([r]) => {
        if (!r) return null;
        r.published_data = (await localizedOne({ id: r.id as string, data: r.published_data }, collection))!.data;
        return r as Record<string, unknown>;
      }),
    );
  }
  return ctx.entries.get(key)!;
}

type Source = { row: Record<string, any>; data: Record<string, unknown>; col: CollectionDef };

export function buildSchema(cols: CollectionDef[]): GraphQLSchema {
  const types = new Map<string, GraphQLObjectType>();
  const byId = new Map(cols.map((c) => [c.id, c]));
  const used = new Set(['Media', 'Link', 'Location', 'JSON', 'Query', 'Mutation', 'Site', 'Collection', 'Field']);

  function fieldType(f: FieldDef, owner: string): { type: GraphQLOutputType; resolve: (v: unknown, ctx: GqlContext) => unknown } | null {
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'richtext':
      case 'date':
      case 'datetime':
      case 'select':
      case 'color':
      case 'icon':
      case 'url':
      case 'email':
        return { type: GraphQLString, resolve: str };
      case 'number':
      case 'money':
        return { type: GraphQLFloat, resolve: num };
      case 'boolean':
        return { type: GraphQLBoolean, resolve: (v) => (v === undefined || v === null ? null : Boolean(v)) };
      case 'multiselect':
      case 'tags':
        return { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))), resolve: (v) => list(v).map(String) };
      case 'image':
      case 'file':
        return { type: MediaType, resolve: (v, ctx) => ctx.media.get(v) };
      case 'images':
        return {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(MediaType))),
          resolve: async (v, ctx) => {
            const ids = list(v);
            await ctx.media.preload(ids);
            return (await Promise.all(ids.map((id) => ctx.media.get(id)))).filter(Boolean);
          },
        };
      case 'link':
        return { type: LinkType, resolve: (v) => (v && typeof v === 'object' ? v : null) };
      case 'location':
        return { type: LocationType, resolve: (v) => (v && typeof v === 'object' ? v : typeof v === 'string' && v ? { address: v } : null) };
      case 'relation': {
        const target = f.collection && byId.get(f.collection);
        if (!target) return { type: f.multiple ? new GraphQLList(GraphQLID) : GraphQLID, resolve: (v) => (f.multiple ? list(v) : str(v)) };
        const load = async (ref: unknown, ctx: GqlContext): Promise<Source | null> => {
          const row = await loadEntry(ref, target.id, ctx);
          return row ? { row, data: visibleData(row, false, ctx), col: target } : null;
        };
        if (f.multiple)
          return {
            type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(entryType(target)))),
            resolve: async (v, ctx) => (await Promise.all(list(v).map((r) => load(r, ctx)))).filter(Boolean),
          };
        return { type: entryType(target), resolve: (v, ctx) => load(v, ctx) };
      }
      case 'group': {
        const name = unique(`${owner}${pascal(f.key)}Item`);
        const item: GraphQLObjectType = new GraphQLObjectType<Record<string, unknown>, GqlContext>({
          name,
          description: f.itemLabel ?? f.label,
          fields: () => {
            const out: GraphQLFieldConfigMap<Record<string, unknown>, GqlContext> = {};
            for (const sub of f.fields ?? []) {
              const t = fieldType(sub, name);
              if (t) out[sub.key] = { type: t.type, description: sub.label, resolve: (o, _a, ctx) => t.resolve(o?.[sub.key], ctx) };
            }
            if (!Object.keys(out).length) out._empty = { type: GraphQLBoolean, resolve: () => null };
            return out;
          },
        });
        return { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(item))), resolve: (v) => list(v).filter((x) => x && typeof x === 'object') };
      }
      default:
        return { type: JSONScalar, resolve: (v) => v ?? null };
    }
  }

  function unique(name: string) {
    let n = name;
    for (let i = 2; used.has(n); i++) n = `${name}${i}`;
    used.add(n);
    return n;
  }

  function entryType(col: CollectionDef): GraphQLObjectType {
    const hit = types.get(col.id);
    if (hit) return hit;
    const name = unique(namesFor(col.id).type);
    const t = new GraphQLObjectType<Source, GqlContext>({
      name,
      description: col.singular,
      fields: () => {
        const out: GraphQLFieldConfigMap<Source, GqlContext> = {
          id: { type: new GraphQLNonNull(GraphQLID), resolve: (s) => s.row.id },
          slug: { type: new GraphQLNonNull(GraphQLString), resolve: (s) => s.row.slug },
          path: { type: GraphQLString, description: 'Adresse auf der Website, falls der Typ eigene Seiten hat.', resolve: (s) => entryPath(s.col as never, s.row.slug) },
          url: { type: GraphQLString, resolve: (s) => (s.col.route ? env.publicUrl + entryPath(s.col as never, s.row.slug) : null) },
          status: { type: new GraphQLNonNull(GraphQLString), resolve: (s) => s.row.status },
          publishedAt: { type: GraphQLString, resolve: (s) => iso(s.row.published_at) },
          updatedAt: { type: GraphQLString, resolve: (s) => iso(s.row.updated_at) },
        };
        for (const f of col.fields) {
          if (out[f.key]) continue;
          const ft = fieldType(f, name);
          if (ft) out[f.key] = { type: ft.type, description: f.label + (f.help ? ` – ${f.help}` : ''), resolve: (s, _a, ctx) => ft.resolve(s.data[f.key], ctx) };
        }
        if (col.has_blocks && !out.blocks) out.blocks = { type: JSONScalar, resolve: (s) => s.data.blocks ?? [] };
        return out;
      },
    });
    types.set(col.id, t);
    return t;
  }

  const query: GraphQLFieldConfigMap<unknown, GqlContext> = {
    site: {
      type: new GraphQLNonNull(
        new GraphQLObjectType({
          name: 'Site',
          fields: { name: { type: GraphQLString }, url: { type: GraphQLString }, locale: { type: GraphQLString }, tagline: { type: GraphQLString } },
        }),
      ),
      resolve: async () => {
        const s = await getSettings();
        return { name: s.name, url: env.publicUrl, locale: s.locale, tagline: s.tagline };
      },
    },
    collections: {
      type: new GraphQLNonNull(
        new GraphQLList(
          new GraphQLNonNull(
            new GraphQLObjectType({
              name: 'Collection',
              fields: {
                id: { type: new GraphQLNonNull(GraphQLID) },
                name: { type: GraphQLString },
                singular: { type: GraphQLString },
                route: { type: GraphQLString },
                fields: { type: JSONScalar },
              },
            }),
          ),
        ),
      ),
      resolve: () => cols,
    },
  };
  const mutation: GraphQLFieldConfigMap<unknown, GqlContext> = {};

  for (const col of cols) {
    if (col.id === 'sections') continue;
    const t = entryType(col);
    const n = namesFor(col.id);
    const list = new GraphQLObjectType({
      name: unique(`${t.name}List`),
      fields: { items: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(t))) }, total: { type: new GraphQLNonNull(GraphQLInt) } },
    });
    query[n.one] = {
      type: t,
      description: `${col.singular} nach Adresse (slug) oder ID.`,
      args: { slug: { type: GraphQLString }, id: { type: GraphQLID }, preview: { type: GraphQLBoolean, description: 'Entwurf statt veröffentlichter Fassung (nur mit Token).' } },
      resolve: async (_s, a: { slug?: string; id?: string; preview?: boolean }, ctx) => {
        if (a.slug === undefined && !a.id) throw new GraphQLError('slug oder id angeben.');
        const drafts = Boolean(a.preview && ctx.token?.scopes.includes('read'));
        if (a.id && !UUID.test(a.id)) return null;
        const by = a.id ? sql`id = ${a.id}` : sql`slug = ${a.slug ?? ''}`;
        const [row] = await sql`select * from entries where collection = ${col.id} and ${by} ${drafts ? sql`` : sql`and status = 'published'`} limit 1`;
        if (row && !drafts) row.published_data = (await localizedOne({ id: row.id as string, data: row.published_data }, col))!.data;
        return row ? { row, data: visibleData(row, drafts, ctx), col } : null;
      },
    };
    query[n.many] = {
      type: new GraphQLNonNull(list),
      description: `Alle ${col.name}.`,
      args: {
        limit: { type: GraphQLInt, defaultValue: 20 },
        offset: { type: GraphQLInt, defaultValue: 0 },
        sort: { type: GraphQLString, description: 'Feld, mit - davor absteigend. Standard: -published_at.' },
        filter: { type: JSONScalar, description: 'Gleichheit pro Feld, z. B. {"category": "news"}.' },
        drafts: { type: GraphQLBoolean, description: 'Auch Entwürfe (nur mit Token).' },
      },
      resolve: async (_s, a: { limit: number; offset: number; sort?: string; filter?: Record<string, unknown>; drafts?: boolean }, ctx) => {
        const drafts = Boolean(a.drafts && ctx.token?.scopes.includes('read'));
        const limit = Math.min(100, Math.max(1, a.limit));
        const offset = Math.max(0, a.offset);
        const field = (a.sort ?? '-published_at').replace(/^-/, '');
        const dir = !a.sort || a.sort.startsWith('-') ? sql`desc` : sql`asc`;
        const doc = drafts ? sql`data` : sql`published_data`;
        const order = ['published_at', 'updated_at', 'created_at'].includes(field)
          ? sql`${sql(field)} ${dir} nulls last`
          : /^[a-zA-Z_]\w{0,40}$/.test(field)
            ? sql`${doc} ->> ${field} ${dir} nulls last`
            : sql`published_at desc`;
        const filters = Object.entries(a.filter && typeof a.filter === 'object' ? a.filter : {})
          .filter(([k]) => /^[a-zA-Z_]\w{0,40}$/.test(k))
          .slice(0, 10)
          .map(([k, v]) => sql`and coalesce(${doc} ->> ${k}, '') = ${v === null ? '' : String(v)}`);
        const rows = await sql`
          select *, count(*) over() as total from entries
          where collection = ${col.id} ${drafts ? sql`` : sql`and status = 'published'`} ${filters.length ? filters.reduce((x, y) => sql`${x} ${y}`) : sql``}
          order by ${order} limit ${limit} offset ${offset}`;
        if (!drafts) {
          const loc = await localized(
            rows.map((r) => ({ id: r.id as string, data: r.published_data })),
            col,
          );
          rows.forEach((r, i) => (r.published_data = loc[i].data));
        }
        return { items: rows.map((row) => ({ row, data: visibleData(row, drafts, ctx), col })), total: Number(rows[0]?.total ?? 0) };
      },
    };
    const writeArgs = { data: { type: new GraphQLNonNull(JSONScalar) }, slug: { type: GraphQLString }, publish: { type: GraphQLBoolean } };
    mutation[`create${t.name}`] = {
      type: new GraphQLNonNull(t),
      args: writeArgs,
      resolve: async (_s, a: { data: Record<string, unknown>; slug?: string; publish?: boolean }, ctx) => {
        const w = writer(ctx);
        const e = await createEntry(col.id, a.data ?? {}, w, a.slug);
        const row = a.publish ? (await publishEntry(e.id, w.userId)).entry : e;
        return { row, data: (row as any).data, col };
      },
    };
    mutation[`update${t.name}`] = {
      type: new GraphQLNonNull(t),
      args: { id: { type: new GraphQLNonNull(GraphQLID) }, ...writeArgs },
      resolve: async (_s, a: { id: string; data: Record<string, unknown>; slug?: string; publish?: boolean }, ctx) => {
        const w = writer(ctx);
        const [cur] = UUID.test(a.id) ? await sql`select id from entries where id = ${a.id} and collection = ${col.id}` : [];
        if (!cur) throw new GraphQLError('Diesen Eintrag gibt es nicht.');
        const e = await updateEntry(cur.id as string, { data: a.data, slug: a.slug }, w);
        const row = a.publish ? (await publishEntry(e.id, w.userId)).entry : e;
        return { row, data: (row as any).data, col };
      },
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({ name: 'Query', fields: query }),
    mutation: Object.keys(mutation).length ? new GraphQLObjectType({ name: 'Mutation', fields: mutation }) : undefined,
  });
}

function writer(ctx: GqlContext) {
  if (!ctx.token?.scopes.includes('write')) throw new GraphQLError('Für Änderungen braucht es ein API-Token mit Schreibrecht.');
  return { userId: ctx.token.userId ?? '', canCode: false, studioOnly: false };
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

/** Rejects queries nested deeper than MAX_DEPTH – relations could otherwise loop. */
export function depthLimit(ctx: ValidationContext) {
  const check = (node: ASTNode, depth: number): void => {
    if (depth > MAX_DEPTH) {
      ctx.reportError(new GraphQLError(`Die Abfrage ist zu tief verschachtelt (höchstens ${MAX_DEPTH} Ebenen).`, { nodes: [node] }));
      return;
    }
    if ('selectionSet' in node && node.selectionSet)
      for (const s of node.selectionSet.selections) {
        if (s.kind === Kind.FIELD) check(s, depth + 1);
        else if (s.kind === Kind.INLINE_FRAGMENT) check(s, depth);
        else if (s.kind === Kind.FRAGMENT_SPREAD) {
          const f = ctx.getFragment(s.name.value);
          if (f) check(f, depth);
        }
      }
  };
  return {
    OperationDefinition(node: ASTNode) {
      check(node, 0);
    },
  };
}

let cache: { key: string; schema: GraphQLSchema } | null = null;
/** Schema for the active content types; rebuilt when a type or module changes. */
export async function currentSchema(): Promise<GraphQLSchema> {
  const cols = await activeCollections();
  const key = JSON.stringify(cols);
  if (cache?.key !== key) cache = { key, schema: buildSchema(cols) };
  return cache.schema;
}
