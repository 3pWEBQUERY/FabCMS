import { sql, json } from './db';
import { badRequest, forbidden, notFound } from './lib/http';
import { CAP_INFO, OWNER_ONLY, capsOf, customRole, isBuiltinRole, setCustomRoles, type Capability, type CustomRole } from '../shared/roles';
import { slugify } from '../shared/text';
import type { Role } from '../shared/types';

/** Roles live in memory for `can()`; another instance may change them, so they are re-read now and then. */
const FRESH_MS = 15_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

export async function loadRoles(): Promise<void> {
  const rows = await sql`select id, name, help, caps, werkbank from roles order by name`;
  setCustomRoles(rows.map((r) => ({ id: r.id, name: r.name, help: r.help, caps: r.caps as Capability[], werkbank: r.werkbank })));
  loadedAt = Date.now();
}

export function ensureRoles(): Promise<void> {
  if (Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
  loading ??= loadRoles().finally(() => (loading = null));
  return loading;
}

const KNOWN = new Set(CAP_INFO.map((c) => c.cap));

/**
 * Nobody hands out more than they hold: the rights of a role someone creates,
 * changes or assigns must all be their own – and never the owner's alone.
 */
export function assertGrantable(me: Role, caps: Capability[]): void {
  const mine = new Set(capsOf(me));
  if (caps.some((c) => OWNER_ONLY.includes(c))) throw forbidden('Die direkte Datenbank-Abfrage bleibt der Inhaberin oder dem Inhaber vorbehalten.');
  if (caps.some((c) => !mine.has(c))) throw forbidden('Du kannst nur Rechte vergeben, die du selbst hast.');
}

function cleanCaps(caps: string[]): Capability[] {
  const out = [...new Set(caps)].filter((c): c is Capability => KNOWN.has(c as Capability));
  if (out.length !== new Set(caps).size) throw badRequest('Unbekanntes Recht.');
  return out;
}

export async function createRole(me: Role, input: { name: string; help?: string; caps: string[]; werkbank?: boolean }): Promise<CustomRole> {
  const caps = cleanCaps(input.caps);
  assertGrantable(me, caps);
  const base = slugify(input.name).slice(0, 36) || 'rolle';
  const id = /^[a-z]/.test(base) ? base : `r-${base}`;
  let unique = id;
  for (let i = 2; isBuiltinRole(unique) || customRole(unique) || (await sql`select 1 from roles where id = ${unique}`).length; i++) unique = `${id}-${i}`;
  const [r] = await sql`
    insert into roles (id, name, help, caps, werkbank)
    values (${unique}, ${input.name.trim()}, ${(input.help ?? '').trim()}, ${json(caps)}, ${Boolean(input.werkbank)})
    returning id, name, help, caps, werkbank`;
  await loadRoles();
  return r as unknown as CustomRole;
}

export async function updateRole(me: Role, id: string, input: { name?: string; help?: string; caps?: string[]; werkbank?: boolean }): Promise<CustomRole> {
  const cur = await sql`select caps from roles where id = ${id}`;
  if (!cur.length) throw notFound('Diese Rolle gibt es nicht.');
  // Changing a role reaches everyone who has it – so the old rights must be yours too.
  assertGrantable(me, cur[0].caps as Capability[]);
  const caps = input.caps ? cleanCaps(input.caps) : undefined;
  if (caps) assertGrantable(me, caps);
  const [r] = await sql`
    update roles set
      name = coalesce(${input.name?.trim() ?? null}, name),
      help = coalesce(${input.help?.trim() ?? null}, help),
      caps = coalesce(${caps ? json(caps) : null}, caps),
      werkbank = coalesce(${input.werkbank ?? null}, werkbank),
      updated_at = now()
    where id = ${id}
    returning id, name, help, caps, werkbank`;
  await loadRoles();
  return r as unknown as CustomRole;
}

/** Removes a role; the people who had it get another one first. */
export async function deleteRole(me: Role, id: string, moveTo: Role | undefined): Promise<number> {
  const [cur] = await sql`select caps from roles where id = ${id}`;
  if (!cur) throw notFound('Diese Rolle gibt es nicht.');
  assertGrantable(me, cur.caps as Capability[]);
  const [{ n }] = await sql`select count(*)::int as n from users where role = ${id}`;
  if (n > 0) {
    if (!moveTo || moveTo === id) throw badRequest('Diese Rolle hat noch Personen – wähle, welche Rolle sie stattdessen bekommen.');
    await assertAssignable(me, moveTo);
  }
  await sql.begin(async (tx) => {
    if (n > 0) await tx`update users set role = ${moveTo!} where role = ${id}`;
    await tx`delete from roles where id = ${id}`;
  });
  await loadRoles();
  return n;
}

/**
 * Whether `me` may give someone this role: it exists, and its rights are all
 * theirs (the owner may give any). Who may name owners and admins is checked
 * where users change.
 */
export async function assertAssignable(me: Role, role: Role): Promise<void> {
  await ensureRoles();
  if (!isBuiltinRole(role) && !customRole(role)) throw badRequest('Diese Rolle gibt es nicht.');
  if (me === 'owner' || role === 'owner' || role === 'admin') return;
  assertGrantable(
    me,
    capsOf(role).filter((c) => !OWNER_ONLY.includes(c)),
  );
}

/** Whether `me` may act on someone with this role (change, reset, remove): their rights must all be `me`'s too. */
export function assertOutranks(me: Role, target: Role): void {
  if (me === 'owner') return;
  if (target === 'owner') throw forbidden();
  assertGrantable(
    me,
    capsOf(target).filter((c) => !OWNER_ONLY.includes(c)),
  );
}
