import { createBlock } from '../shared/blocks';
import { slugify, shortId } from '../shared/text';
import type { Block, FormFieldDef, NavItem } from '../shared/types';

/** Building blocks for starter content (seed.ts, seed-templates.ts). */

export const b = (type: string, props: Record<string, unknown> = {}, style: Block['style'] = {}): Block => ({ ...createBlock(type, props), style });
export const f = (type: FormFieldDef['type'], label: string, required = false, extra: Partial<FormFieldDef> = {}): FormFieldDef => ({
  id: shortId(8),
  type,
  label,
  name: slugify(label).replace(/-/g, '_'),
  required,
  ...extra,
});

export interface Seed {
  home: Block[];
  pages: { slug: string; title: string; blocks: Block[]; access?: 'members' | 'paid' }[];
  nav: NavItem[];
  forms: { key: string; name: string; fields: FormFieldDef[]; success: string; submit: string }[];
  entries: { collection: string; data: Record<string, unknown> }[];
  tagline: string;
  footer: string;
  /** Mitglieder: e.g. a club invites its members instead of open sign-up. */
  members?: { registration: 'open' | 'invite' };
  /** Reservation & Termine: what can be booked, with what or whom. */
  booking?: {
    mode: 'table' | 'appointment';
    services: { name: string; description?: string; duration: number; buffer?: number; price?: number }[];
    resources: { name: string; kind: 'table' | 'staff' | 'room'; capacity: number }[];
  };
}

export const contactForm = {
  key: 'kontakt',
  name: 'Kontakt',
  submit: 'Nachricht senden',
  success: 'Danke für deine Nachricht! Wir antworten in der Regel innert eines Arbeitstages.',
  fields: [f('text', 'Name', true), f('email', 'E-Mail', true), f('tel', 'Telefon'), f('textarea', 'Nachricht', true)],
};

export const contactPage = (formKey = 'kontakt', heading = 'Schreib uns') => ({
  slug: 'kontakt',
  title: 'Kontakt',
  blocks: [
    b('contact', { heading: 'So erreichst du uns', showHours: true }),
    b('form', { heading, intro: 'Wir melden uns so schnell wie möglich.', form: `@form:${formKey}` }),
    b('map'),
  ],
});

export const chf = (francs: number) => Math.round(francs * 100);
