import type { Mode, Role } from './types';

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
  'comments.moderate',
  'settings.manage',
  'users.manage',
  'design.manage',
  'dev',
  'data.sql',
  'privacy.manage',
  'audit.view',
];

export const ROLE_CAPS: Record<Role, Capability[]> = {
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
    'comments.moderate',
  ],
  author: ['content.edit.own', 'media.upload'],
  member: [],
};

export const ROLE_LABELS: Record<Role, { name: string; help: string }> = {
  owner: { name: 'Inhaber', help: 'Darf alles, auch Benutzer und Daten-Export.' },
  admin: { name: 'Admin', help: 'Darf alles ausser die direkte Datenbank-Abfrage.' },
  editor: { name: 'Redaktion', help: 'Bearbeitet und veröffentlicht alle Inhalte.' },
  author: { name: 'Autor', help: 'Schreibt eigene Beiträge und reicht sie zur Freigabe ein.' },
  member: { name: 'Mitglied', help: 'Kein Zugang zur Verwaltung.' },
};

export const DEFAULT_ROLE_MODES: Record<Role, Mode[]> = {
  owner: ['studio', 'werkbank'],
  admin: ['studio', 'werkbank'],
  editor: ['studio', 'werkbank'],
  author: ['studio'],
  member: [],
};

export function can(role: Role, cap: Capability): boolean {
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}

export const ROLE_ORDER: Role[] = ['owner', 'admin', 'editor', 'author', 'member'];
