import type { BuiltinRole, Mode, Role } from './types';

export type Capability =
  | 'content.edit' // create & edit any page or entry
  | 'content.edit.own' // create & edit own entries
  | 'content.publish'
  | 'content.delete'
  | 'media.upload'
  | 'media.manage'
  | 'forms.manage'
  | 'leads.view'
  | 'orders.view'
  | 'orders.manage'
  | 'bookings.manage'
  | 'newsletter.manage'
  | 'members.manage'
  | 'events.manage'
  | 'donations.manage'
  | 'comments.moderate'
  | 'settings.manage'
  | 'users.manage'
  | 'design.manage'
  | 'dev' // content types, code, webhooks, API tokens
  | 'data.sql'
  | 'privacy.manage'
  | 'audit.view';

const ALL: Capability[] = [
  'content.edit',
  'content.edit.own',
  'content.publish',
  'content.delete',
  'media.upload',
  'media.manage',
  'forms.manage',
  'leads.view',
  'orders.view',
  'orders.manage',
  'bookings.manage',
  'newsletter.manage',
  'members.manage',
  'events.manage',
  'donations.manage',
  'comments.moderate',
  'settings.manage',
  'users.manage',
  'design.manage',
  'dev',
  'data.sql',
  'privacy.manage',
  'audit.view',
];

export const ROLE_CAPS: Record<BuiltinRole, Capability[]> = {
  owner: ALL,
  admin: ALL.filter((c) => c !== 'data.sql'),
  editor: [
    'content.edit',
    'content.edit.own',
    'content.publish',
    'content.delete',
    'media.upload',
    'media.manage',
    'forms.manage',
    'leads.view',
    'orders.view',
    'orders.manage',
    'bookings.manage',
    'newsletter.manage',
    'members.manage',
    'events.manage',
    'donations.manage',
    'comments.moderate',
  ],
  author: ['content.edit.own', 'media.upload'],
  member: [],
};

export const ROLE_LABELS: Record<BuiltinRole, { name: string; help: string }> = {
  owner: { name: 'Inhaber', help: 'Darf alles, auch Benutzer und Daten-Export.' },
  admin: { name: 'Admin', help: 'Darf alles ausser die direkte Datenbank-Abfrage.' },
  editor: { name: 'Redaktion', help: 'Bearbeitet und veröffentlicht alle Inhalte.' },
  author: { name: 'Autor', help: 'Schreibt eigene Beiträge und reicht sie zur Freigabe ein.' },
  member: { name: 'Mitglied', help: 'Kein Zugang zur Verwaltung. (Mitglieder der Website verwaltest du unter «Mitglieder».)' },
};

export const DEFAULT_ROLE_MODES: Record<BuiltinRole, Mode[]> = {
  owner: ['studio', 'werkbank'],
  admin: ['studio', 'werkbank'],
  editor: ['studio', 'werkbank'],
  author: ['studio'],
  member: [],
};

export const ROLE_ORDER: BuiltinRole[] = ['owner', 'admin', 'editor', 'author', 'member'];
export const isBuiltinRole = (r: string): r is BuiltinRole => (ROLE_ORDER as string[]).includes(r);

/**
 * Roles defined in the Werkbank: a name and a hand-picked set of rights.
 * The server keeps them here (loaded from the database), so `can()` stays
 * one synchronous check wherever it is asked.
 */
export interface CustomRole {
  id: string;
  name: string;
  help: string;
  caps: Capability[];
  werkbank: boolean;
}
let custom = new Map<string, CustomRole>();
export function setCustomRoles(list: CustomRole[]): void {
  custom = new Map(list.map((r) => [r.id, r]));
}
export const customRole = (id: string): CustomRole | undefined => custom.get(id);

/** Rights only the owner holds – never part of a role made in the Werkbank. */
export const OWNER_ONLY: Capability[] = ['data.sql'];

export function capsOf(role: Role): Capability[] {
  return isBuiltinRole(role) ? ROLE_CAPS[role] : (custom.get(role)?.caps ?? []);
}

export function can(role: Role, cap: Capability): boolean {
  return capsOf(role).includes(cap);
}

/** Modes a role may use: built-ins as set in the settings, own roles by their switch. */
export function modesOf(role: Role, roleModes: Record<BuiltinRole, Mode[]>): Mode[] {
  if (isBuiltinRole(role)) return roleModes[role] ?? DEFAULT_ROLE_MODES[role] ?? ['studio'];
  return custom.get(role)?.werkbank ? ['studio', 'werkbank'] : ['studio'];
}

/** Every right with a plain label, grouped like the admin – the rows of the rights matrix. */
export const CAP_INFO: { cap: Capability; label: string; group: string }[] = [
  { cap: 'content.edit', label: 'Alle Inhalte bearbeiten', group: 'Inhalte' },
  { cap: 'content.edit.own', label: 'Eigene Beiträge schreiben', group: 'Inhalte' },
  { cap: 'content.publish', label: 'Veröffentlichen und freigeben', group: 'Inhalte' },
  { cap: 'content.delete', label: 'Inhalte löschen', group: 'Inhalte' },
  { cap: 'comments.moderate', label: 'Kommentare freigeben', group: 'Inhalte' },
  { cap: 'media.upload', label: 'Dateien hochladen', group: 'Inhalte' },
  { cap: 'media.manage', label: 'Mediathek aufräumen und löschen', group: 'Inhalte' },
  { cap: 'forms.manage', label: 'Formulare bauen', group: 'Kontakte & Geschäft' },
  { cap: 'leads.view', label: 'Kontakte und Anfragen sehen', group: 'Kontakte & Geschäft' },
  { cap: 'orders.view', label: 'Bestellungen sehen', group: 'Kontakte & Geschäft' },
  { cap: 'orders.manage', label: 'Bestellungen bearbeiten', group: 'Kontakte & Geschäft' },
  { cap: 'bookings.manage', label: 'Reservationen und Termine', group: 'Kontakte & Geschäft' },
  { cap: 'events.manage', label: 'Tickets und Kurse', group: 'Kontakte & Geschäft' },
  { cap: 'donations.manage', label: 'Spenden', group: 'Kontakte & Geschäft' },
  { cap: 'newsletter.manage', label: 'Newsletter', group: 'Kontakte & Geschäft' },
  { cap: 'members.manage', label: 'Mitglieder der Website', group: 'Kontakte & Geschäft' },
  { cap: 'design.manage', label: 'Design und Navigation', group: 'Website & System' },
  { cap: 'settings.manage', label: 'Einstellungen', group: 'Website & System' },
  { cap: 'privacy.manage', label: 'Datenschutz-Anfragen', group: 'Website & System' },
  { cap: 'users.manage', label: 'Team und Rollen', group: 'Website & System' },
  { cap: 'dev', label: 'Inhaltstypen, Code, API und Webhooks', group: 'Website & System' },
  { cap: 'audit.view', label: 'Protokoll einsehen', group: 'Website & System' },
  { cap: 'data.sql', label: 'Datenbank direkt abfragen', group: 'Website & System' },
];
