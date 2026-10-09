/** Short help articles. Shown in the command palette and behind the «?» buttons. */
export interface HelpTopic {
  id: string;
  title: string;
  keywords: string;
  body: string[];
  to?: string;
}

export const HELP: HelpTopic[] = [
  {
    id: 'edit',
    title: 'Wie ändere ich Text auf einer Seite?',
    keywords: 'text schreiben ändern bearbeiten seite',
    body: [
      'Öffne die Seite unter «Seiten» und klick direkt in den Text. Du schreibst auf der echten Seite – so, wie Besucher sie sehen.',
      'Gespeichert wird automatisch. Der Punkt oben zeigt «gesichert», sobald alles beim Server angekommen ist.',
    ],
    to: '/seiten',
  },
  {
    id: 'publish',
    title: 'Wie veröffentliche ich?',
    keywords: 'veröffentlichen online live publish',
    body: [
      'Änderungen landen zuerst im Entwurf. Erst «Veröffentlichen» stellt sie online. So kannst du in Ruhe arbeiten.',
      'Mit dem Pfeil neben dem Knopf kannst du eine Veröffentlichung auch für später planen.',
    ],
  },
  {
    id: 'undo',
    title: 'Ich habe etwas kaputt gemacht',
    keywords: 'rückgängig fehler kaputt wiederherstellen version verlauf',
    body: [
      'Kein Problem. Im Editor macht «Rückgängig» jeden Schritt einzeln rückgängig – beliebig oft.',
      'Unter «Verlauf» findest du ältere Fassungen mit Datum und Uhrzeit. Ein Klick zeigt die Unterschiede, ein zweiter stellt sie wieder her.',
    ],
  },
  {
    id: 'images',
    title: 'Bilder: welche Grösse, welches Format?',
    keywords: 'bild foto grösse format jpg png hochladen handy',
    body: [
      'Lade Bilder einfach so hoch, wie sie aus der Kamera oder vom Handy kommen. Nova erzeugt automatisch kleine, schnelle Versionen in modernen Formaten.',
      'Wichtig ist der Alt-Text: ein Satz, was auf dem Bild zu sehen ist. Das hilft Menschen mit Screenreader – und bei Google.',
    ],
    to: '/medien',
  },
  {
    id: 'seo',
    title: 'Wie werde ich bei Google gefunden?',
    keywords: 'google seo gefunden suchmaschine ranking keyword',
    body: [
      'Überleg dir pro Seite ein Wort, unter dem man sie finden soll – zum Beispiel «Restaurant Uster». Trag es im Editor unter «SEO» ein.',
      'Der SEO-Coach sagt dir dann konkret, was noch fehlt, und springt mit einem Klick an die richtige Stelle. Sitemap, strukturierte Daten und Weiterleitungen erledigt Nova selbst.',
    ],
  },
  {
    id: 'hours',
    title: 'Öffnungszeiten und Ferien eintragen',
    keywords: 'öffnungszeiten ferien geschlossen zeiten',
    body: [
      'Die Zeiten trägst du einmal unter Einstellungen → Name, Logo & Kontakt ein. Sie erscheinen automatisch auf der Website, im Footer und bei Google.',
      'Für Ferien schreib einen kurzen Hinweis ins Feld «Hinweis zu den Zeiten».',
    ],
    to: '/einstellungen/website#zeiten',
  },
  {
    id: 'modes',
    title: 'Studio und Werkbank – was ist der Unterschied?',
    keywords: 'modus studio werkbank profi entwickler',
    body: [
      'Beide zeigen dieselben Inhalte. Das Studio ist für den Alltag: klicken, schreiben, veröffentlichen.',
      'Die Werkbank zeigt zusätzlich technische Werkzeuge: eigene Inhaltstypen, CSS, Code-Ansicht pro Block, API und Datenbank. Wechseln geht jederzeit oben rechts.',
    ],
  },
  {
    id: 'domain',
    title: 'Eigene Domain verbinden',
    keywords: 'domain dns adresse url',
    body: ['Unter Einstellungen → Domain zeigt Nova dir genau, welche DNS-Einträge du bei deinem Domain-Anbieter setzen musst.'],
    to: '/einstellungen/domain',
  },
  {
    id: 'privacy',
    title: 'Jemand will seine Daten gelöscht haben',
    keywords: 'dsgvo löschen auskunft daten datenschutz anfrage',
    body: [
      'Unter Einstellungen → Daten & Datenschutz gibst du die E-Mail-Adresse ein. Nova zeigt alles, was zu dieser Person gespeichert ist – Formulare, Kontakte, Bestellungen, Kommentare.',
      'Du kannst alles als Datei exportieren oder mit einem Klick löschen. Bestellungen werden anonymisiert, weil sie zehn Jahre aufbewahrt werden müssen.',
    ],
    to: '/einstellungen/daten',
  },
];
