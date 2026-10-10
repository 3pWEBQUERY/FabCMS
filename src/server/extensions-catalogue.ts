import type { ExtensionManifest } from '../shared/extensions';
import { b, f } from './seed-kit';

/**
 * Extensions that ship with Nova – reviewed with the code, so they need no
 * signature. A site can add its own catalogue (NOVA_EXTENSIONS_URL), which
 * must be signed (see server/extensions.ts).
 */

const AUTHOR = 'Nova';
const LICENSE = 'MIT';

export const BUILTIN_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'rezepte',
    name: 'Rezepte',
    version: '1.0.0',
    summary: 'Ein Inhaltstyp für Rezepte mit Zutaten, Schritten, Zeit und Portionen.',
    description:
      'Für Restaurants, Hofläden und Foodblogs: Jedes Rezept bekommt eine eigene Seite unter /rezepte, mit Zutatenliste und nummerierten Arbeitsschritten. Rezepte lassen sich wie Beiträge verschlagworten.',
    author: AUTHOR,
    license: LICENSE,
    category: 'inhalte',
    provides: {
      collections: [
        {
          id: 'rezepte',
          name: 'Rezepte',
          singular: 'Rezept',
          icon: 'pot',
          route: '/rezepte/:slug',
          list_route: '/rezepte',
          has_blocks: false,
          title_field: 'title',
          empty_hint: 'Schreib dein erstes Rezept: Zutaten, Schritte, fertig.',
          fields: [
            { key: 'title', type: 'text', label: 'Titel', required: true, maxLength: 120 },
            { key: 'excerpt', type: 'textarea', label: 'Kurzbeschreibung', maxLength: 300 },
            { key: 'cover', type: 'image', label: 'Bild' },
            { key: 'time', type: 'text', label: 'Zeit', placeholder: 'z. B. 45 Min.', width: 'half' },
            { key: 'servings', type: 'number', label: 'Portionen', min: 1, max: 50, width: 'half' },
            {
              key: 'ingredients',
              type: 'group',
              label: 'Zutaten',
              itemLabel: 'Zutat',
              fields: [
                { key: 'amount', type: 'text', label: 'Menge', placeholder: '200 g', width: 'half' },
                { key: 'item', type: 'text', label: 'Zutat', required: true, width: 'half' },
              ],
            },
            { key: 'steps', type: 'group', label: 'Zubereitung', itemLabel: 'Schritt', fields: [{ key: 'text', type: 'textarea', label: 'Schritt', required: true }] },
            { key: 'tags', type: 'tags', label: 'Schlagwörter' },
          ],
        },
      ],
    },
  },
  {
    id: 'stellen',
    name: 'Stellenangebote',
    version: '1.0.0',
    summary: 'Offene Stellen mit Pensum, Aufgaben und Profil – und ein Bewerbungsformular mit Lebenslauf.',
    description:
      'Jede Stelle bekommt eine Seite unter /stellen. Veröffentlicht wird nur, was Pensum und Kontaktadresse hat. Bewerbungen kommen über ein eigenes Formular mit Dateiupload ins Postfach – die Unterlagen bleiben privat.',
    author: AUTHOR,
    license: LICENSE,
    category: 'inhalte',
    provides: {
      collections: [
        {
          id: 'stellen',
          name: 'Stellen',
          singular: 'Stelle',
          icon: 'briefcase',
          route: '/stellen/:slug',
          list_route: '/stellen',
          has_blocks: true,
          title_field: 'title',
          empty_hint: 'Schreib die erste offene Stelle aus.',
          fields: [
            { key: 'title', type: 'text', label: 'Stellenbezeichnung', required: true, maxLength: 120 },
            { key: 'excerpt', type: 'textarea', label: 'Kurzbeschreibung', maxLength: 300 },
            { key: 'pensum', type: 'text', label: 'Pensum', placeholder: '80–100 %', width: 'half' },
            { key: 'start', type: 'text', label: 'Eintritt', placeholder: 'nach Vereinbarung', width: 'half' },
            { key: 'place', type: 'text', label: 'Arbeitsort', width: 'half' },
            { key: 'contact', type: 'email', label: 'Kontakt für Fragen', width: 'half' },
            { key: 'tasks', type: 'richtext', label: 'Aufgaben' },
            { key: 'profile', type: 'richtext', label: 'Ihr Profil' },
            { key: 'offer', type: 'richtext', label: 'Wir bieten' },
          ],
        },
      ],
      hooks: [
        {
          key: 'pflichtangaben',
          name: 'Stellen: Pensum und Kontakt verlangen',
          event: 'entry.beforePublish',
          collection: 'stellen',
          code: `function hook(event) {
  if (!event.data.pensum) throw new Error('Bitte das Pensum angeben, bevor die Stelle online geht.');
  if (!event.data.contact) throw new Error('Bitte eine Kontaktadresse für Fragen angeben.');
}`,
        },
      ],
      forms: [
        {
          key: 'bewerbung',
          name: 'Bewerbung',
          submit: 'Bewerbung senden',
          success: 'Danke für deine Bewerbung! Wir melden uns innert einer Woche.',
          fields: [
            f('text', 'Stelle', true),
            f('text', 'Name', true),
            f('email', 'E-Mail', true),
            f('tel', 'Telefon'),
            f('file', 'Lebenslauf (PDF)', true),
            f('file', 'Motivationsschreiben (PDF)'),
            f('textarea', 'Nachricht'),
          ],
        },
      ],
    },
  },
  {
    id: 'link-spam',
    name: 'Link-Spam abfangen',
    version: '1.0.0',
    summary: 'Formularnachrichten mit mehr als zwei Links landen still im Spam.',
    description:
      'Die meisten Spam-Nachrichten wollen Links unterbringen. Echte Anfragen enthalten fast nie mehr als zwei. Abgefangene Nachrichten werden nicht zugestellt; der Absender sieht trotzdem die normale Bestätigung.',
    author: AUTHOR,
    license: LICENSE,
    category: 'formulare',
    provides: {
      hooks: [
        {
          key: 'links',
          name: 'Formulare: mehr als zwei Links sind Spam',
          event: 'form.beforeSubmit',
          code: `function hook(event) {
  var text = Object.keys(event.fields).map(function (k) { return String(event.fields[k] || ''); }).join(' ');
  var links = text.match(/https?:\\/\\/|www\\.|\\[url/gi) || [];
  if (links.length > 2) event.spam = true;
  return event;
}`,
        },
      ],
    },
  },
  {
    id: 'schweizer-schreibweise',
    name: 'Schweizer Schreibweise',
    version: '1.0.0',
    summary: 'Ersetzt beim Speichern jedes «ß» durch «ss» – in Titeln, Texten und allen Blöcken.',
    description:
      'In der Schweiz gibt es kein Eszett. Kopierte Texte aus Deutschland bringen es trotzdem mit. Diese Erweiterung korrigiert es bei jedem Speichern, auch über die API.',
    author: AUTHOR,
    license: LICENSE,
    category: 'redaktion',
    provides: {
      hooks: [
        {
          key: 'eszett',
          name: 'Schweizer Schreibweise: ß wird ss',
          event: 'entry.beforeSave',
          code: `function fix(v) {
  if (typeof v === 'string') return v.replace(/ß/g, 'ss').replace(/ẞ/g, 'SS');
  if (Array.isArray(v)) return v.map(fix);
  if (v && typeof v === 'object') { var o = {}; for (var k in v) o[k] = fix(v[k]); return o; }
  return v;
}
function hook(event) {
  event.data = fix(event.data);
  return event;
}`,
        },
      ],
    },
  },
  {
    id: 'beitrag-vollstaendig',
    name: 'Vollständige Beiträge',
    version: '1.0.0',
    summary: 'Beiträge gehen nur mit Titelbild und Kurzfassung online.',
    description:
      'Ohne Bild und Kurzfassung sehen Beiträge in Übersichten, Newsletter und Social Media leer aus. Die Erweiterung erinnert beim Veröffentlichen daran – Entwürfe speichern geht weiterhin.',
    author: AUTHOR,
    license: LICENSE,
    category: 'redaktion',
    provides: {
      hooks: [
        {
          key: 'pflicht',
          name: 'Beiträge: Titelbild und Kurzfassung verlangen',
          event: 'entry.beforePublish',
          collection: 'posts',
          code: `function hook(event) {
  if (!event.data.cover) throw new Error('Bitte zuerst ein Titelbild wählen.');
  if (!event.data.excerpt || String(event.data.excerpt).trim().length < 40) throw new Error('Bitte eine Kurzfassung mit mindestens 40 Zeichen schreiben.');
}`,
        },
      ],
    },
  },
  {
    id: 'gastro-sektionen',
    name: 'Sektionen für die Gastronomie',
    version: '1.0.0',
    summary: 'Betriebsferien, Mittagsmenü und Reservationshinweis als fertige Sektionen.',
    description:
      'Drei wiederverwendbare Abschnitte, die du auf beliebigen Seiten einsetzt und an einer Stelle änderst: ein Ferienhinweis, der mit einem Enddatum nach den Ferien von selbst verschwindet, das Mittagsmenü und eine Einladung zur Reservation.',
    author: AUTHOR,
    license: LICENSE,
    category: 'gestaltung',
    provides: {
      sections: [
        {
          key: 'ferien',
          title: 'Betriebsferien',
          blocks: [b('notice', { text: 'Betriebsferien: Wir sind vom 20. Juli bis 10. August geschlossen. Ab dem 11. August sind wir gerne wieder für Sie da.', tone: 'accent' })],
        },
        {
          key: 'mittag',
          title: 'Mittagsmenü',
          blocks: [
            b('list', {
              heading: 'Mittagsmenü',
              intro: 'Montag bis Freitag, 11.30–14 Uhr. Mit Salat oder Suppe.',
              style: 'rows',
              items: [
                { title: 'Menü 1', text: 'Fleisch oder Fisch der Woche', meta: '24.50' },
                { title: 'Menü 2', text: 'Vegetarisch', meta: '22.50' },
              ],
            }),
          ],
        },
        {
          key: 'reservation',
          title: 'Reservation empfohlen',
          blocks: [
            b(
              'cta',
              {
                heading: 'Am Wochenende wird es voll.',
                text: 'Reservieren Sie Ihren Tisch – online oder per Telefon.',
                primary: { label: 'Tisch reservieren', href: '/reservation' },
              },
              { tone: 'accent' },
            ),
          ],
        },
      ],
    },
  },
];
