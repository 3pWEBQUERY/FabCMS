import type { Block, CollectionDef, FormFieldDef } from './types';
import type { HookEvent } from './hooks';

/**
 * Extensions (Marktplatz): declarative packages built from what Nova already
 * has – content types, sandboxed hooks, forms, reusable sections and CSS.
 * They cannot run server code, so installing one cannot open the server.
 */

export type ExtensionCategory = 'inhalte' | 'formulare' | 'redaktion' | 'gestaltung';

export interface ExtensionManifest {
  /** a–z, 0–9 and hyphens; stays the same across versions. */
  id: string;
  name: string;
  /** x.y.z */
  version: string;
  summary: string;
  description: string;
  author: string;
  homepage?: string;
  license: string;
  category: ExtensionCategory;
  provides: {
    collections?: Pick<CollectionDef, 'id' | 'name' | 'singular' | 'icon' | 'fields' | 'route' | 'list_route' | 'has_blocks' | 'title_field' | 'empty_hint'>[];
    hooks?: { key: string; name: string; event: HookEvent; collection?: string; code: string }[];
    forms?: { key: string; name: string; fields: FormFieldDef[]; submit: string; success: string }[];
    sections?: { key: string; title: string; blocks: Block[] }[];
    css?: string;
  };
}

export const EXTENSION_CATEGORIES: { id: ExtensionCategory; label: string }[] = [
  { id: 'inhalte', label: 'Inhalte' },
  { id: 'formulare', label: 'Formulare' },
  { id: 'redaktion', label: 'Redaktion' },
  { id: 'gestaltung', label: 'Gestaltung' },
];

/** Compares x.y.z versions: negative when a is older. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** What installing changes, in the words the admin shows before «Installieren». */
export function extensionEffects(m: ExtensionManifest): { kind: 'collection' | 'hook' | 'form' | 'section' | 'css'; label: string; path?: string }[] {
  const p = m.provides;
  return [
    ...(p.collections ?? []).map((c) => ({ kind: 'collection' as const, label: c.name, ...(c.list_route ? { path: c.list_route } : {}) })),
    ...(p.hooks ?? []).map((h) => ({ kind: 'hook' as const, label: h.name })),
    ...(p.forms ?? []).map((f) => ({ kind: 'form' as const, label: f.name })),
    ...(p.sections ?? []).map((s) => ({ kind: 'section' as const, label: s.title })),
    ...(p.css?.trim() ? [{ kind: 'css' as const, label: 'CSS' }] : []),
  ];
}
