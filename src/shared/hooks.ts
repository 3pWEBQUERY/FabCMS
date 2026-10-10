/** Server-side hooks: small JavaScript functions that run in a sandbox on events. */

export type HookEvent = 'entry.beforeSave' | 'entry.beforePublish' | 'form.beforeSubmit';

export interface ServerHook {
  id: string;
  name: string;
  event: HookEvent;
  /** Only for entry events; '' = every content type. */
  collection: string;
  code: string;
  active: boolean;
  /** Installed by this extension (Marktplatz); it comes and goes with it. */
  ext?: string;
}

export const HOOK_EVENTS: { value: HookEvent; label: string; help: string; template: string }[] = [
  {
    value: 'entry.beforeSave',
    label: 'Vor dem Speichern',
    help: 'Bei jedem Speichern (auch automatisch und über die API). event.data ändern oder mit throw ablehnen.',
    template: `// event: { collection, slug, isNew, data }
function hook(event) {
  if (typeof event.data.title === 'string') event.data.title = event.data.title.trim();
  return event;
}`,
  },
  {
    value: 'entry.beforePublish',
    label: 'Vor dem Veröffentlichen',
    help: 'Prüft, bevor etwas online geht. Mit throw new Error("…") wird die Veröffentlichung abgelehnt.',
    template: `// event: { collection, slug, data }
function hook(event) {
  if (!event.data.excerpt) throw new Error('Bitte zuerst eine Kurzfassung schreiben.');
}`,
  },
  {
    value: 'form.beforeSubmit',
    label: 'Vor dem Absenden eines Formulars',
    help: 'event.fields ändern, mit throw ablehnen (die Meldung sieht der Besucher) oder event.spam = true still verwerfen.',
    template: `// event: { form: { id, name }, fields, page, spam }
function hook(event) {
  if (/viagra|casino/i.test(event.fields.nachricht ?? '')) event.spam = true;
  return event;
}`,
  },
];
