import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import { sql, json } from './db';
import { env } from './env';
import { badRequest, notFound } from './lib/http';
import { checkHookCode } from './hooks';
import { checkFieldDefs, invalidateCollections, listCollections, saveCollection, uniqueSlug } from './content';
import { bumpGeneration, getSettings, updateSettings } from './settings';
import { BUILTIN_EXTENSIONS } from './extensions-catalogue';
import { BLOCK_MAP } from '../shared/blocks';
import { HOOK_EVENTS, type ServerHook } from '../shared/hooks';
import { compareVersions, type ExtensionManifest } from '../shared/extensions';
import type { FieldDef } from '../shared/fields';
import type { Block } from '../shared/types';

/**
 * Marktplatz: install, update and remove extensions. An extension only adds
 * what Nova already knows – content types, sandboxed hooks, forms, sections
 * and CSS – and Nova remembers what it created, so removing it takes back
 * exactly that. Content people wrote stays.
 *
 * Catalogues: the extensions shipped with Nova, plus optionally an own
 * catalogue (NOVA_EXTENSIONS_URL) whose list is signed with Ed25519; Nova
 * only shows it when the signature matches NOVA_EXTENSIONS_KEY.
 */

const KEY = /^[a-z][a-z0-9-]{1,40}$/;
const formField = z.object({
  id: z.string().max(40),
  type: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number', 'file', 'step']),
  label: z.string().min(1).max(200),
  name: z.string().regex(/^[a-z0-9_]{1,60}$/),
  required: z.boolean(),
  options: z.array(z.string().max(200)).max(50).optional(),
  placeholder: z.string().max(200).optional(),
  help: z.string().max(400).optional(),
});
const manifestSchema = z.object({
  id: z.string().regex(KEY, 'Die Kennung einer Erweiterung besteht aus a–z, 0–9 und Bindestrichen.'),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'Die Version muss wie 1.2.0 aussehen.'),
  summary: z.string().min(1).max(200),
  description: z.string().max(2000),
  author: z.string().min(1).max(80),
  homepage: z
    .string()
    .regex(/^https:\/\/[^\s"<>]+$/)
    .optional(),
  license: z.string().min(1).max(40),
  category: z.enum(['inhalte', 'formulare', 'redaktion', 'gestaltung']),
  provides: z.object({
    collections: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
          name: z.string().min(1).max(60),
          singular: z.string().min(1).max(60),
          icon: z.string().max(40),
          fields: z.array(z.record(z.string(), z.unknown())).min(1).max(60),
          route: z.string().nullable(),
          list_route: z.string().nullable(),
          has_blocks: z.boolean(),
          title_field: z.string(),
          empty_hint: z.string().max(300).optional(),
        }),
      )
      .max(5)
      .optional(),
    hooks: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          name: z.string().min(1).max(80),
          event: z.enum(HOOK_EVENTS.map((e) => e.value) as [string, ...string[]]),
          collection: z.string().max(41).optional(),
          code: z.string().min(1).max(20_000),
        }),
      )
      .max(10)
      .optional(),
    forms: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          name: z.string().min(1).max(80),
          fields: z.array(formField).min(1).max(40),
          submit: z.string().max(60),
          success: z.string().max(400),
        }),
      )
      .max(5)
      .optional(),
    sections: z
      .array(z.object({ key: z.string().regex(KEY), title: z.string().min(1).max(120), blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(30) }))
      .max(20)
      .optional(),
    css: z.string().max(30_000).optional(),
  }),
});

/** Checks a manifest completely before anything is written. */
export async function validateManifest(input: unknown): Promise<ExtensionManifest> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(`Erweiterung ungültig (${issue.path.join('.') || 'Manifest'}): ${issue.message}`);
  }
  const m = parsed.data as unknown as ExtensionManifest;
  for (const c of m.provides.collections ?? []) {
    try {
      checkFieldDefs(c.fields as FieldDef[]);
    } catch (e) {
      throw badRequest(`Erweiterung ungültig (Inhaltstyp ${c.id}): ${(e as Error).message}`);
    }
    if (!c.fields.some((x) => x.key === c.title_field)) throw badRequest(`Erweiterung ungültig (Inhaltstyp ${c.id}): Das Titelfeld fehlt.`);
  }
  for (const h of m.provides.hooks ?? []) {
    const problem = await checkHookCode(h.code);
    if (problem) throw badRequest(`Erweiterung ungültig (Hook «${h.name}»): ${problem}`);
  }
  for (const s of m.provides.sections ?? [])
    for (const bl of s.blocks as Block[]) if (!BLOCK_MAP[bl.type]) throw badRequest(`Erweiterung ungültig: Den Block «${bl.type}» gibt es nicht.`);
  if (m.provides.css && /<\/?style|@import|url\(\s*['"]?(?!data:)/i.test(m.provides.css)) throw badRequest('Erweiterung ungültig: CSS darf nichts von aussen laden.');
  return m;
}

/* ---------- catalogues ---------- */

export interface CatalogueEntry {
  manifest: ExtensionManifest;
  source: 'nova' | 'katalog';
}

/** Ed25519 signature over the JSON text of the extensions list, both base64. */
export function verifyCatalogue(extensionsJson: string, signature: string, publicKey: string): boolean {
  try {
    const key = createPublicKey(publicKey.includes('BEGIN') ? publicKey : { key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(extensionsJson), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

let remote: { at: number; entries: CatalogueEntry[]; error: string | null } | null = null;

async function remoteCatalogue(): Promise<{ entries: CatalogueEntry[]; error: string | null }> {
  const { url, key } = env.extensions;
  if (!url) return { entries: [], error: null };
  if (remote && Date.now() - remote.at < 3600_000) return remote;
  let entries: CatalogueEntry[] = [];
  let error: string | null = null;
  try {
    if (!key) throw new Error('NOVA_EXTENSIONS_KEY fehlt – ohne Schlüssel zeigt Nova den Katalog nicht.');
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Der Katalog antwortet mit ${res.status}.`);
    const body = (await res.json()) as { extensions?: string; signature?: string };
    if (typeof body.extensions !== 'string' || typeof body.signature !== 'string') throw new Error('Der Katalog hat nicht das erwartete Format.');
    if (!verifyCatalogue(body.extensions, body.signature, key)) throw new Error('Die Signatur des Katalogs stimmt nicht. Nova zeigt ihn nicht an.');
    const list = JSON.parse(body.extensions) as unknown[];
    for (const item of Array.isArray(list) ? list.slice(0, 200) : []) {
      try {
        entries.push({ manifest: await validateManifest(item), source: 'katalog' });
      } catch {
        /* one broken entry does not hide the rest */
      }
    }
  } catch (e) {
    entries = [];
    error = (e as Error).message;
  }
  remote = { at: Date.now(), entries, error };
  return remote;
}

export function resetCatalogueCache() {
  remote = null;
}

export async function catalogue(): Promise<{ entries: CatalogueEntry[]; error: string | null }> {
  const own = BUILTIN_EXTENSIONS.map((manifest) => ({ manifest, source: 'nova' as const }));
  const r = await remoteCatalogue();
  // Nova's own extensions keep their names: a catalogue cannot replace them.
  return { entries: [...own, ...r.entries.filter((e) => !own.some((o) => o.manifest.id === e.manifest.id))], error: r.error };
}

/* ---------- installed ---------- */

interface Created {
  collections: string[];
  forms: Record<string, string>;
  sections: Record<string, string>;
}

export interface InstalledExtension {
  id: string;
  version: string;
  source: string;
  manifest: ExtensionManifest;
  created: Created;
  installed_at: string;
}

export async function installedExtensions(): Promise<InstalledExtension[]> {
  return (await sql`select id, version, source, manifest, created, installed_at from extensions order by installed_at`) as unknown as InstalledExtension[];
}

const hookId = (ext: string, key: string) => `ext-${ext}-${key}`;

async function applyHooksAndCss(m: ExtensionManifest | null, extId: string) {
  const s = await getSettings();
  const own = (s.hooks ?? []).filter((h) => h.ext !== extId);
  const added: ServerHook[] = (m?.provides.hooks ?? []).map((h) => {
    const before = (s.hooks ?? []).find((x) => x.id === hookId(extId, h.key));
    return {
      id: hookId(extId, h.key),
      name: h.name,
      event: h.event,
      collection: h.event === 'form.beforeSubmit' ? '' : (h.collection ?? ''),
      code: h.code,
      // Switched off by hand stays off across updates.
      active: before ? before.active : true,
      ext: extId,
    };
  });
  const css = (s.extensionCss ?? []).filter((x) => x.id !== extId);
  if (m?.provides.css?.trim()) css.push({ id: extId, css: m.provides.css });
  await updateSettings({ hooks: [...own, ...added], extensionCss: css });
}

async function createSections(m: ExtensionManifest, existing: Record<string, string>, userId: string | null): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const sec of m.provides.sections ?? []) {
    if (existing[sec.key]) {
      out[sec.key] = existing[sec.key];
      continue;
    }
    const data = { title: sec.title, blocks: sec.blocks, seo: {} };
    const slug = await uniqueSlug('sections', `${m.id}-${sec.key}`);
    const [row] = await sql`
      insert into entries (collection, slug, status, data, published_data, published_slug, published_at, author_id)
      values ('sections', ${slug}, 'published', ${json(data)}, ${json(data)}, ${slug}, now(), ${userId})
      returning id`;
    out[sec.key] = row.id as string;
  }
  return out;
}

async function createForms(m: ExtensionManifest, existing: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const form of m.provides.forms ?? []) {
    const [still] = existing[form.key] ? await sql`select id from forms where id = ${existing[form.key]}` : [];
    if (still) {
      out[form.key] = still.id as string;
      continue;
    }
    const [row] = await sql`
      insert into forms (name, fields, settings)
      values (${form.name}, ${json(form.fields)}, ${json({ submitLabel: form.submit, successMessage: form.success, notifyEmail: '', createLead: true, turnstile: false })})
      returning id`;
    out[form.key] = row.id as string;
  }
  return out;
}

/** Content types the extension adds must not collide with anything that isn't its own. */
async function checkCollisions(m: ExtensionManifest, owned: string[]) {
  const all = await listCollections();
  for (const c of m.provides.collections ?? []) {
    const same = all.find((x) => x.id === c.id);
    if (same && !owned.includes(c.id)) throw badRequest(`Es gibt schon einen Inhaltstyp «${same.name}» (${c.id}). Die Erweiterung lässt sich so nicht installieren.`);
    for (const x of all.filter((x) => x.id !== c.id)) {
      if (c.route && x.route === c.route) throw badRequest(`Die Adresse ${c.route} benutzt schon «${x.name}».`);
      if (c.list_route && x.list_route === c.list_route) throw badRequest(`Die Adresse ${c.list_route} benutzt schon «${x.name}».`);
    }
  }
}

/** Fields of an updated content type: the new definition, plus every field people may already have filled. */
function mergeFields(next: FieldDef[], current: FieldDef[]): FieldDef[] {
  return [...next, ...current.filter((f) => !next.some((n) => n.key === f.key))];
}

export async function installExtension(id: string, userId: string | null): Promise<InstalledExtension> {
  const [already] = await sql`select 1 from extensions where id = ${id}`;
  if (already) throw badRequest('Diese Erweiterung ist schon installiert.');
  const entry = (await catalogue()).entries.find((e) => e.manifest.id === id);
  if (!entry) throw notFound('Diese Erweiterung gibt es im Katalog nicht.');
  const m = await validateManifest(entry.manifest);
  await checkCollisions(m, []);
  const created: Created = { collections: [], forms: {}, sections: {} };
  try {
    for (const c of m.provides.collections ?? []) {
      await saveCollection({ ...c, fields: c.fields as FieldDef[] }, true);
      created.collections.push(c.id);
    }
    created.forms = await createForms(m, {});
    created.sections = await createSections(m, {}, userId);
    await applyHooksAndCss(m, m.id);
    await sql`insert into extensions (id, version, source, manifest, created, installed_by) values (${m.id}, ${m.version}, ${entry.source}, ${json(m)}, ${json(created)}, ${userId})`;
  } catch (e) {
    // Half installed helps nobody: take back what was created.
    await takeBack(m.id, created, true);
    throw e;
  }
  bumpGeneration();
  return (await installedExtensions()).find((x) => x.id === m.id)!;
}

export async function updateExtension(id: string): Promise<InstalledExtension> {
  const [row] = (await sql`select id, version, created from extensions where id = ${id}`) as unknown as { id: string; version: string; created: Created }[];
  if (!row) throw notFound('Diese Erweiterung ist nicht installiert.');
  const entry = (await catalogue()).entries.find((e) => e.manifest.id === id);
  if (!entry) throw notFound('Diese Erweiterung gibt es im Katalog nicht mehr.');
  if (compareVersions(entry.manifest.version, row.version) <= 0) throw badRequest('Es gibt keine neuere Version.');
  const m = await validateManifest(entry.manifest);
  await checkCollisions(m, row.created.collections);
  const all = await listCollections();
  const collections = [...row.created.collections];
  for (const c of m.provides.collections ?? []) {
    const current = all.find((x) => x.id === c.id);
    await saveCollection({ ...c, fields: mergeFields(c.fields as FieldDef[], current?.fields ?? []) }, !current);
    if (!collections.includes(c.id)) collections.push(c.id);
  }
  const created: Created = { collections, forms: await createForms(m, row.created.forms), sections: await createSections(m, row.created.sections, null) };
  await applyHooksAndCss(m, m.id);
  await sql`update extensions set version = ${m.version}, source = ${entry.source}, manifest = ${json(m)}, created = ${json(created)}, updated_at = now() where id = ${id}`;
  bumpGeneration();
  return (await installedExtensions()).find((x) => x.id === id)!;
}

/** What removing keeps: content types with entries, forms with submissions, sections in use. */
export interface RemovalReport {
  removed: string[];
  kept: string[];
}

async function takeBack(extId: string, created: Created, everything: boolean): Promise<RemovalReport> {
  const report: RemovalReport = { removed: [], kept: [] };
  await applyHooksAndCss(null, extId);
  for (const cid of created.collections) {
    const [{ n }] = await sql`select count(*)::int as n from entries where collection = ${cid}`;
    const [col] = await sql`select name from collections where id = ${cid}`;
    if (!col) continue;
    if (n > 0 && !everything) report.kept.push(`Inhaltstyp «${col.name}» mit ${n} ${n === 1 ? 'Eintrag' : 'Einträgen'}`);
    else {
      await sql`delete from entries where collection = ${cid}`;
      await sql`delete from collections where id = ${cid}`;
      report.removed.push(`Inhaltstyp «${col.name}»`);
    }
  }
  for (const fid of Object.values(created.forms)) {
    const [form] = await sql`select name from forms where id = ${fid}`;
    if (!form) continue;
    const [{ n }] = await sql`select count(*)::int as n from submissions where form_id = ${fid}`;
    if (n > 0 && !everything) report.kept.push(`Formular «${form.name}» mit ${n} Eingängen`);
    else {
      await sql`delete from forms where id = ${fid}`;
      report.removed.push(`Formular «${form.name}»`);
    }
  }
  for (const sid of Object.values(created.sections)) {
    const [sec] = await sql`select data ->> 'title' as title from entries where id = ${sid}`;
    if (!sec) continue;
    const [{ n }] = await sql`
      select count(*)::int as n from entries
      where id <> ${sid} and (data::text like ${'%' + sid + '%'} or published_data::text like ${'%' + sid + '%'})`;
    if (n > 0 && !everything) report.kept.push(`Sektion «${sec.title}», auf ${n} ${n === 1 ? 'Seite' : 'Seiten'} eingesetzt`);
    else {
      await sql`delete from entries where id = ${sid}`;
      report.removed.push(`Sektion «${sec.title}»`);
    }
  }
  await sql`delete from extensions where id = ${extId}`;
  invalidateCollections();
  bumpGeneration();
  return report;
}

export async function removeExtension(id: string): Promise<RemovalReport> {
  const [row] = (await sql`select created from extensions where id = ${id}`) as unknown as { created: Created }[];
  if (!row) throw notFound('Diese Erweiterung ist nicht installiert.');
  return takeBack(id, row.created, false);
}
