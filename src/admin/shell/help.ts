import { t } from '../lib/i18n';

/** Short help articles. Shown in the command palette and behind the «?» buttons. */
export interface HelpTopic {
  id: string;
  title: string;
  keywords: string;
  body: string[];
  to?: string;
}

/** The articles in the interface language (built on call, so t() sees the loaded language). */
export const helpTopics = (): HelpTopic[] => [
  {
    id: 'edit',
    title: t('Wie ändere ich Text auf einer Seite?'),
    keywords: t('text schreiben ändern bearbeiten seite'),
    body: [
      t('Öffne die Seite unter «Seiten» und klick direkt in den Text. Du schreibst auf der echten Seite – so, wie Besucher sie sehen.'),
      t('Gespeichert wird automatisch. Der Punkt oben zeigt «gesichert», sobald alles beim Server angekommen ist.'),
    ],
    to: '/seiten',
  },
  {
    id: 'publish',
    title: t('Wie veröffentliche ich?'),
    keywords: t('veröffentlichen online live publish'),
    body: [
      t('Änderungen landen zuerst im Entwurf. Erst «Veröffentlichen» stellt sie online. So kannst du in Ruhe arbeiten.'),
      t('Mit dem Pfeil neben dem Knopf kannst du eine Veröffentlichung auch für später planen.'),
    ],
  },
  {
    id: 'undo',
    title: t('Ich habe etwas kaputt gemacht'),
    keywords: t('rückgängig fehler kaputt wiederherstellen version verlauf'),
    body: [
      t('Kein Problem. Im Editor macht «Rückgängig» jeden Schritt einzeln rückgängig – beliebig oft.'),
      t('Unter «Verlauf» findest du ältere Fassungen mit Datum und Uhrzeit. Ein Klick zeigt die Unterschiede, ein zweiter stellt sie wieder her.'),
    ],
  },
  {
    id: 'images',
    title: t('Bilder: welche Grösse, welches Format?'),
    keywords: t('bild foto grösse format jpg png hochladen handy'),
    body: [
      t('Lade Bilder einfach so hoch, wie sie aus der Kamera oder vom Handy kommen. Nova erzeugt automatisch kleine, schnelle Versionen in modernen Formaten.'),
      t('Wichtig ist der Alt-Text: ein Satz, was auf dem Bild zu sehen ist. Das hilft Menschen mit Screenreader – und bei Google.'),
    ],
    to: '/medien',
  },
  {
    id: 'seo',
    title: t('Wie werde ich bei Google gefunden?'),
    keywords: t('google seo gefunden suchmaschine ranking keyword'),
    body: [
      t('Überleg dir pro Seite ein Wort, unter dem man sie finden soll – zum Beispiel «Restaurant Uster». Trag es im Editor unter «SEO» ein.'),
      t('Der SEO-Coach sagt dir dann konkret, was noch fehlt, und springt mit einem Klick an die richtige Stelle. Sitemap, strukturierte Daten und Weiterleitungen erledigt Nova selbst.'),
    ],
  },
  {
    id: 'hours',
    title: t('Öffnungszeiten und Ferien eintragen'),
    keywords: t('öffnungszeiten ferien geschlossen zeiten'),
    body: [
      t('Die Zeiten trägst du einmal unter Einstellungen → Name, Logo & Kontakt ein. Sie erscheinen automatisch auf der Website, im Footer und bei Google.'),
      t('Für Ferien schreib einen kurzen Hinweis ins Feld «Hinweis zu den Zeiten».'),
    ],
    to: '/einstellungen/website#zeiten',
  },
  {
    id: 'modes',
    title: t('Studio und Werkbank – was ist der Unterschied?'),
    keywords: t('modus studio werkbank profi entwickler'),
    body: [
      t('Beide zeigen dieselben Inhalte. Das Studio ist für den Alltag: klicken, schreiben, veröffentlichen.'),
      t('Die Werkbank zeigt zusätzlich technische Werkzeuge: eigene Inhaltstypen, CSS, Code-Ansicht pro Block, API und Datenbank. Wechseln geht jederzeit oben rechts.'),
    ],
  },
  {
    id: 'domain',
    title: t('Eigene Domain verbinden'),
    keywords: t('domain dns adresse url'),
    body: [t('Unter Einstellungen → Domain zeigt Nova dir genau, welche DNS-Einträge du bei deinem Domain-Anbieter setzen musst.')],
    to: '/einstellungen/domain',
  },
  {
    id: 'privacy',
    title: t('Jemand will seine Daten gelöscht haben'),
    keywords: t('dsgvo löschen auskunft daten datenschutz anfrage'),
    body: [
      t('Unter Einstellungen → Daten & Datenschutz gibst du die E-Mail-Adresse ein. Nova zeigt alles, was zu dieser Person gespeichert ist – Formulare, Kontakte, Bestellungen, Kommentare.'),
      t('Du kannst alles als Datei exportieren oder mit einem Klick löschen. Bestellungen werden anonymisiert, weil sie zehn Jahre aufbewahrt werden müssen.'),
    ],
    to: '/einstellungen/daten',
  },
];
