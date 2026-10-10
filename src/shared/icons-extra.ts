import type { IconDef } from './icon-set';

/**
 * Second part of the website icons – same grid and rules as icon-set.ts
 * (20 × 20, 1.5 px stroke, round caps and joins, 2 px safe area).
 */

const p = (d: string) => `<path d="${d}"/>`;
const c = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const r = (x: number, y: number, w: number, h: number, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''}/>`;
const e = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
/** A dot: a tiny circle the stroke fills. */
const dot = (cx: number, cy: number) => c(cx, cy, 0.5);

export const EXTRA_ICONS: Record<string, IconDef> = {
  /* ---------- Sport & Freizeit ---------- */
  football: {
    label: 'Fussball, Ball, Match, Verein',
    group: 'sport',
    svg: c(10, 10, 7.25) + p('M10 7.4l2.47 1.8-.94 2.9H8.47l-.94-2.9z') + p('M10 7.4V2.75M12.47 9.2l4.4-1.45M11.53 12.1l2.7 3.8M8.47 12.1l-2.7 3.8M7.53 9.2l-4.4-1.45'),
  },
  tennis: { label: 'Tennis, Ball, Platz', group: 'sport', svg: c(10, 10, 7.25) + p('M4.9 4.9a7.25 7.25 0 0 1 0 10.2M15.1 4.9a7.25 7.25 0 0 0 0 10.2') },
  ski: {
    label: 'Ski, Skifahren, Wintersport, Piste',
    group: 'sport',
    svg: p('M5 17.25 14.1 4.4a1.6 1.6 0 0 1 2.5-.15') + p('M15 17.25 5.9 4.4a1.6 1.6 0 0 0-2.5-.15') + p('M6.75 13.25l1.5 1M13.25 13.25l-1.5 1'),
  },
  swim: {
    label: 'Schwimmen, Pool, Hallenbad, Badi',
    group: 'sport',
    svg:
      p('M7.25 13V4.75a1.75 1.75 0 0 0-3.5 0M13.25 13V4.75a1.75 1.75 0 0 0-3.5 0M7.25 7.5h6M7.25 10.5h6') +
      p('M2.75 15.75c1.2 0 1.2-1 2.4-1s1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1'),
  },
  run: {
    label: 'Laufen, Joggen, Turnschuh, Lauftreff',
    group: 'sport',
    svg:
      p('M2.75 13.75V6.25l3.5-1 2 3 4.5 1.75 3.55 1.2a1.5 1.5 0 0 1 .95 1.4v1.15z') +
      p('M2.75 13.75v1.5a1 1 0 0 0 1 1h12.5a1 1 0 0 0 1-1v-1.5') +
      p('M8.75 8.75l1-1.25M10.75 9.5l1-1.25'),
  },
  dumbbell: { label: 'Fitness, Hantel, Training, Kraft', group: 'sport', svg: r(4, 6, 2.5, 8, 1) + r(13.5, 6, 2.5, 8, 1) + p('M6.5 10h7M2.75 8.5v3M17.25 8.5v3') },
  trophy: {
    label: 'Pokal, Sieg, Turnier, Meister',
    group: 'sport',
    svg:
      p('M6.25 3.25h7.5v5a3.75 3.75 0 0 1-7.5 0z') + p('M6.25 5H3.75v1a3 3 0 0 0 2.75 3M13.75 5h2.5v1a3 3 0 0 1-2.75 3') + p('M10 12v2.75M6.75 17.25h6.5M8 17.25l.5-2.5h3l.5 2.5'),
  },
  medal: {
    label: 'Medaille, Rang, Wettkampf, Podest',
    group: 'sport',
    svg: p('M6.75 9.75 4.75 2.75h3.5L10 7.5l1.75-4.75h3.5l-2 7') + c(10, 13.25, 4) + p('M9.25 12.25 10 11.5v3.5'),
  },
  whistle: {
    label: 'Pfeife, Trainer, Schiedsrichter, Training',
    group: 'sport',
    svg: p('M7.25 6.75h9.5v3.5h-5.53') + c(7.25, 10.75, 4) + c(7.25, 10.75, 1) + p('M4.25 4.25l1.25 1.25'),
  },
  stopwatch: { label: 'Stoppuhr, Zeit, Rennen, Tempo', group: 'sport', svg: c(10, 11.25, 6) + p('M10 11.25V8M8.25 2.75h3.5M10 2.75v2.5M15 5.75l1.25-1.25') },
  golf: { label: 'Golf, Fahne, Loch, Platz', group: 'sport', svg: p('M8 15.75V2.75l6.5 2.75L8 8.25') + e(10, 15.75, 6.25, 1.5) },
  tent: {
    label: 'Zelt, Camping, Lager, Pfadi',
    group: 'sport',
    svg: p('M2.75 16.75h14.5M4.25 16.75 10 4.75l5.75 12M10 4.75l1.25-2M10 4.75l-1.25-2M10 11.75l-2.25 5M10 11.75l2.25 5'),
  },
  fishing: { label: 'Angeln, Fischen, Fischer, See', group: 'sport', svg: p('M3.25 16.75 15 3.25c.6 3.5.75 7 .75 9.5v1.5a1.5 1.5 0 0 1-3 0v-.5') + c(6.25, 14.25, 1.25) },
  sailboat: { label: 'Segeln, Boot, Segelschule, See', group: 'sport', svg: p('M10 2.75v11.5M10 3.75l5.5 9h-5.5M10 5.75l-4.75 7H10') + p('M3.25 14.25h13.5l-1.75 3H5z') },
  basketball: {
    label: 'Basketball, Korb, Ball, Halle',
    group: 'sport',
    svg: c(10, 10, 7.25) + p('M2.75 10h14.5M10 2.75v14.5') + p('M5.1 4.65a7.25 7.25 0 0 1 0 10.7M14.9 4.65a7.25 7.25 0 0 0 0 10.7'),
  },
  dice: { label: 'Würfel, Spiel, Spielabend, Brettspiel', group: 'sport', svg: r(3.25, 3.25, 13.5, 13.5, 3) + dot(7, 7) + dot(13, 7) + dot(10, 10) + dot(7, 13) + dot(13, 13) },
  puzzle: { label: 'Puzzle, Spiel, Rätsel, Teil', group: 'sport', svg: p('M4.5 6.25h3a1.75 1.75 0 1 1 3.5 0h3v3a1.75 1.75 0 1 1 0 3.5v3H4.5z') },
  pawn: {
    label: 'Schach, Spiel, Strategie, Figur',
    group: 'sport',
    svg: c(10, 5.25, 2.25) + p('M8.5 7.25c0 2.5-.75 4.5-1.75 6.5h6.5c-1-2-1.75-4-1.75-6.5') + p('M5.25 17.25h9.5v-1.75a1.5 1.5 0 0 0-1.5-1.5h-6.5a1.5 1.5 0 0 0-1.5 1.5z'),
  },
  target: { label: 'Ziel, Zielscheibe, Fokus, Schiessen', group: 'sport', svg: c(10, 10, 7.25) + c(10, 10, 4) + dot(10, 10) },
  cards: {
    label: 'Karten, Jass, Spielkarten, Kartenspiel',
    group: 'sport',
    svg:
      r(3.75, 3.75, 9, 12.5, 1.5) +
      p('M12.75 6.25l1.9.5a1.5 1.5 0 0 1 1.05 1.85l-2 7.4a1.5 1.5 0 0 1-1.85 1.05l-.6-.15') +
      p('M8.25 12.5 6.15 10.45a1.3 1.3 0 0 1 2.1-1.55 1.3 1.3 0 0 1 2.1 1.55z'),
  },
  /* ---------- Kultur & Bildung ---------- */
  masks: {
    label: 'Theater, Bühne, Maske, Schauspiel',
    group: 'kultur',
    svg: p('M4.25 4.5h11.5v5.5a5.75 5.75 0 0 1-11.5 0z') + p('M6.75 8.25c.5-.5 1.5-.5 2 0M11.25 8.25c.5-.5 1.5-.5 2 0') + p('M7.5 12c1.25 1.5 3.75 1.5 5 0'),
  },
  palette: {
    label: 'Malen, Kunst, Atelier, Farben',
    group: 'kultur',
    svg:
      p('M10 2.75a7.25 7.25 0 0 0 0 14.5c1.1 0 1.75-.75 1.75-1.6 0-.5-.25-.85-.45-1.15-.2-.3-.45-.65-.45-1.15 0-.9.75-1.6 1.65-1.6h1.75a3 3 0 0 0 3-3c0-3.3-3.25-6-7.25-6z') +
      c(6.25, 9.5, 1) +
      c(7.75, 6, 1) +
      c(11.75, 5.75, 1),
  },
  guitar: {
    label: 'Gitarre, Musik, Musikschule, Konzert',
    group: 'kultur',
    svg: p('M7.71 10.78A2.75 2.75 0 1 1 12.29 10.78 3.75 3.75 0 1 1 7.71 10.78z') + p('M10 4.75v7M8.5 15.75h3') + r(8.75, 2.75, 2.5, 2, 0.5) + c(10, 13.5, 0.5),
  },
  piano: {
    label: 'Klavier, Piano, Musikunterricht, Tasten',
    group: 'kultur',
    svg: r(2.75, 4.25, 14.5, 11.5, 1.5) + p('M6.6 4.25v5.5h2V4.25M11.4 4.25v5.5h2V4.25M7.6 9.75v6M12.4 9.75v6'),
  },
  microphone: { label: 'Mikrofon, Podcast, Singen, Bühne', group: 'kultur', svg: r(7.25, 2.75, 5.5, 9, 2.75) + p('M4.75 9.5a5.25 5.25 0 0 0 10.5 0M10 14.75v2.5M7.25 17.25h5.5') },
  headphones: {
    label: 'Kopfhörer, Audio, Hören, Hörbuch',
    group: 'kultur',
    svg: p('M3.75 13v-2.75a6.25 6.25 0 0 1 12.5 0V13') + r(3.25, 11.25, 3.5, 5.5, 1.25) + r(13.25, 11.25, 3.5, 5.5, 1.25),
  },
  film: {
    label: 'Film, Kino, Video, Vorstellung',
    group: 'kultur',
    svg: r(3.25, 2.75, 13.5, 14.5, 1.5) + p('M6.25 2.75v14.5M13.75 2.75v14.5M3.25 6.25h3M3.25 10h3M3.25 13.75h3M13.75 6.25h3M13.75 10h3M13.75 13.75h3'),
  },
  clapper: {
    label: 'Filmklappe, Dreh, Video, Produktion',
    group: 'kultur',
    svg: r(3.25, 8.25, 13.5, 8.5, 1.5) + p('M3.25 8.25 2.75 5.5l12.8-2.25.5 2.75') + p('M6.25 4.9l1.6 2.3M10.1 4.2l1.6 2.3'),
  },
  museum: {
    label: 'Museum, Ausstellung, Kultur, Gebäude',
    group: 'kultur',
    svg: p('M2.75 7.25 10 3l7.25 4.25zM4.75 7.25v7.5M8.25 7.25v7.5M11.75 7.25v7.5M15.25 7.25v7.5M2.75 17.25h14.5M3.75 14.75h12.5'),
  },
  church: {
    label: 'Kirche, Kapelle, Hochzeit, Gemeinde',
    group: 'kultur',
    svg: p('M10 2.75v3.5M8.5 4.25h3') + p('M5.75 17.25V10L10 6.25 14.25 10v7.25M2.75 17.25h14.5') + p('M8.5 17.25v-2.75a1.5 1.5 0 0 1 3 0v2.75'),
  },
  'book-open': {
    label: 'Lesen, Buch, Bibliothek, Geschichte',
    group: 'kultur',
    svg: p('M10 5.25c-1.75-1.25-4-1.75-7.25-1.5v11.5c3.25-.25 5.5.25 7.25 1.5 1.75-1.25 4-1.75 7.25-1.5V3.75c-3.25-.25-5.5.25-7.25 1.5zM10 5.25v11.5'),
  },
  pencil: { label: 'Stift, Schreiben, Notizen, Zeichnen', group: 'kultur', svg: p('M13.25 3.5l3.25 3.25-9.5 9.5-4 .75.75-4z') + p('M11.5 5.25l3.25 3.25') },
  'pen-nib': {
    label: 'Füller, Kalligrafie, Texte, Gestaltung',
    group: 'kultur',
    svg: p('M10 17.25 15 11.5l-2.25-5.25h-5.5L5 11.5z') + p('M10 17.25v-5.75') + c(10, 10.25, 1.25) + p('M7.25 6.25V2.75h5.5v3.5'),
  },
  backpack: {
    label: 'Schule, Rucksack, Kinder, Lager',
    group: 'kultur',
    svg:
      p('M5.25 8.5a4.75 4.75 0 0 1 9.5 0v7.25a1.5 1.5 0 0 1-1.5 1.5h-6.5a1.5 1.5 0 0 1-1.5-1.5z') +
      p('M8 3.9v-.65a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v.65') +
      p('M7.25 17.25v-4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v4M7.25 14.5h5.5'),
  },
  newspaper: {
    label: 'Zeitung, News, Medien, Presse',
    group: 'kultur',
    svg: p('M14.25 7.25h3v8.5a1.5 1.5 0 0 1-3 0V4.25a.5.5 0 0 0-.5-.5H3.25a.5.5 0 0 0-.5.5v11.5a1.5 1.5 0 0 0 1.5 1.5h11.5') + p('M5.5 7h6M5.5 10h6M5.5 13h3.5'),
  },
  flag: { label: 'Fahne, Flagge, Verein, Ziel', group: 'kultur', svg: p('M4.25 17.25V2.75M4.25 3.75h11.25l-2.5 3.75 2.5 3.75H4.25') },
  frame: { label: 'Bild, Galerie, Ausstellung, Kunstwerk', group: 'kultur', svg: r(2.75, 3.75, 14.5, 12.5, 1.5) + p('M2.75 13.75l4-4 3 3 2.5-2.5 5 5') + c(13, 7.25, 1.25) },
  drum: {
    label: 'Trommel, Musik, Band, Fasnacht',
    group: 'kultur',
    svg: e(10, 8, 6.25, 2.25) + p('M3.75 8v6.5c0 1.25 2.8 2.25 6.25 2.25s6.25-1 6.25-2.25V8') + p('M5.5 2.75 12 7.25M14.5 2.75 8 7.25'),
  },
  translate: {
    label: 'Sprachen, Übersetzung, Sprachschule, Kurs',
    group: 'kultur',
    svg: p('M2.75 4.75h8M6.75 3.25v1.5M9 4.75c-.5 3-2.5 5.5-5.75 7M5.25 7.5c1 1.75 2.5 3 4.25 3.75') + p('M10.25 17.25l3.25-7.5 3.25 7.5M11.4 14.6h4.2'),
  },
  speaker: {
    label: 'Lautsprecher, Ton, Durchsage, Audio',
    group: 'kultur',
    svg: p('M3.25 7.75h2.75L10 4.25v11.5L6 12.25H3.25z') + p('M12.75 7.5a3.5 3.5 0 0 1 0 5M14.75 5.25a6.5 6.5 0 0 1 0 9.5'),
  },
  /* ---------- Büro & Finanzen ---------- */
  briefcase: {
    label: 'Büro, Business, Arbeit, Stelle',
    group: 'buero',
    svg: r(2.75, 6.25, 14.5, 10.5, 1.5) + p('M7.25 6.25v-2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v2M2.75 10.75h14.5M8.75 10.75v1.5h2.5v-1.5'),
  },
  folder: {
    label: 'Ordner, Dokumente, Ablage, Unterlagen',
    group: 'buero',
    svg: p('M2.75 5.25a1.5 1.5 0 0 1 1.5-1.5h3.5l2 2h6a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z'),
  },
  printer: {
    label: 'Drucker, Drucksachen, Kopien, Druckerei',
    group: 'buero',
    svg:
      p('M5.75 7.25V2.75h8.5v4.5') +
      p('M5.75 14.25h-1.5a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5h11.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-1.5') +
      r(5.75, 11.25, 8.5, 6) +
      dot(14.25, 9.75),
  },
  calculator: {
    label: 'Rechner, Buchhaltung, Kalkulation, Treuhand',
    group: 'buero',
    svg: r(4.25, 2.75, 11.5, 14.5, 1.5) + r(6.75, 5.25, 6.5, 2.75, 0.5) + dot(7.5, 11) + dot(10, 11) + dot(12.5, 11) + dot(7.5, 14) + dot(10, 14) + dot(12.5, 14),
  },
  'chart-bar': { label: 'Statistik, Balken, Auswertung, Zahlen', group: 'buero', svg: p('M2.75 17.25h14.5M5.25 17.25v-6M8.75 17.25V5.75M12.25 17.25v-8.5M15.75 17.25v-14') },
  'chart-line': { label: 'Wachstum, Entwicklung, Rendite, Trend', group: 'buero', svg: p('M2.75 2.75v14.5h14.5') + p('M5.75 13l3.5-4 2.5 2.25 5-5.5') + p('M13.25 5.75h3.5v3.5') },
  'chart-pie': { label: 'Diagramm, Anteil, Budget, Verteilung', group: 'buero', svg: p('M9.25 4v6.75H16A6.75 6.75 0 1 1 9.25 4z') + p('M11 2.75A6.25 6.25 0 0 1 17.25 9H11z') },
  presentation: {
    label: 'Präsentation, Workshop, Vortrag, Schulung',
    group: 'buero',
    svg: p('M2.75 3.25h14.5M3.75 3.25v8.5a1 1 0 0 0 1 1h10.5a1 1 0 0 0 1-1v-8.5M10 12.75v1.5M7.25 17.25 10 14.25l2.75 3') + p('M6.75 9.75 9 7.5l2 1.5 2.5-2.75'),
  },
  clipboard: { label: 'Checkliste, Formular, Auftrag, Notizen', group: 'buero', svg: r(4.25, 4.25, 11.5, 13, 1.5) + r(7.25, 2.75, 5.5, 3, 1) + p('M7.25 9.75h5.5M7.25 13h3.5') },
  paperclip: {
    label: 'Anhang, Büroklammer, Datei, Beilage',
    group: 'buero',
    svg: p('M15.25 9.25l-5.6 5.6a3.75 3.75 0 0 1-5.3-5.3l6.2-6.2a2.5 2.5 0 0 1 3.55 3.55l-6.2 6.2a1.25 1.25 0 0 1-1.77-1.77l5.6-5.6'),
  },
  stamp: {
    label: 'Stempel, Bestätigung, Amt, Beglaubigung',
    group: 'buero',
    svg: c(10, 4.75, 2) + p('M8.75 6.5l-.5 3.75M11.25 6.5l.5 3.75') + p('M3.75 13.25a3 3 0 0 1 3-3h6.5a3 3 0 0 1 3 3v1H3.75z') + p('M4.75 17.25h10.5'),
  },
  signature: {
    label: 'Unterschrift, Vertrag, Signatur, Abschluss',
    group: 'buero',
    svg: p('M2.75 15.75h14.5') + p('M3.75 12.25c1.5-3 3.5-7.5 5-7.5 1.75 0-1.5 7.25.25 7.25 1.25 0 1.75-2.5 3-2.5 1 0 .5 2 1.5 2 .75 0 1.5-.75 2.75-1'),
  },
  code: { label: 'Code, Programmieren, Entwicklung, Web', group: 'buero', svg: p('M7 6 3 10l4 4M13 6l4 4-4 4M11.25 4.25l-2.5 11.5') },
  server: {
    label: 'Server, Hosting, IT, Daten',
    group: 'buero',
    svg: r(3.25, 3.25, 13.5, 5.5, 1.5) + r(3.25, 11.25, 13.5, 5.5, 1.5) + dot(6.25, 6) + dot(6.25, 14) + p('M9.5 6h4.25M9.5 14h4.25'),
  },
  smartphone: { label: 'Handy, Smartphone, App, Mobile', group: 'buero', svg: r(5.25, 2.75, 9.5, 14.5, 2) + p('M8.75 14.75h2.5') },
  monitor: { label: 'Bildschirm, Computer, IT, Desktop', group: 'buero', svg: r(2.75, 3.25, 14.5, 10, 1.5) + p('M10 13.25v4M6.75 17.25h6.5') },
  qr: {
    label: 'QR-Code, Scannen, Bezahlen, TWINT',
    group: 'buero',
    svg: r(3.25, 3.25, 5, 5, 1) + r(11.75, 3.25, 5, 5, 1) + r(3.25, 11.75, 5, 5, 1) + p('M11.75 11.75v2.5h2.5M16.75 11.75v.5M14.25 16.75h2.5v-2.5M11.75 16.75h.5'),
  },
  link: {
    label: 'Link, Verknüpfung, Partner, Web',
    group: 'buero',
    svg: p('M8.5 11.5a3.25 3.25 0 0 0 4.6 0l2.6-2.6a3.25 3.25 0 0 0-4.6-4.6l-.9.9M11.5 8.5a3.25 3.25 0 0 0-4.6 0l-2.6 2.6a3.25 3.25 0 0 0 4.6 4.6l.9-.9'),
  },
  sliders: {
    label: 'Einstellungen, Regler, Anpassen, Optionen',
    group: 'buero',
    svg: p('M3.25 5.75h7M14.25 5.75h2.5M3.25 14.25h2.5M9.75 14.25h7') + c(12.25, 5.75, 2) + c(7.75, 14.25, 2),
  },
  'piggy-bank': {
    label: 'Sparen, Sparschwein, Kasse, Kinder',
    group: 'buero',
    svg:
      p(
        'M14.75 7.5c-1-1.6-3-2.75-5.75-2.75-3.5 0-6 2-6 5 0 1.75.75 3 2 3.75v2.75h2.25v-1.75c.6.15 1.2.25 1.75.25s1.15-.1 1.75-.25v1.75h2.25v-2.75c.75-.5 1.25-1 1.6-1.5h1.4v-3.75h-1.4z',
      ) +
      p('M7.75 6.75h2.5') +
      dot(12.75, 9),
  },
  wallet: {
    label: 'Portemonnaie, Bezahlen, Geld, Brieftasche',
    group: 'buero',
    svg:
      p('M14.75 6.25v-1.5a1 1 0 0 0-1-1h-9a2 2 0 0 0 0 4') +
      p('M2.75 5.75v9a1.5 1.5 0 0 0 1.5 1.5h11.5a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5H4.75') +
      p('M17.25 10.25h-3a1.25 1.25 0 0 0 0 2.5h3'),
  },
  coins: {
    label: 'Münzen, Geld, Preis, Finanzen',
    group: 'buero',
    svg: e(10, 5, 5.5, 2) + p('M4.5 5v3.5c0 1.1 2.45 2 5.5 2s5.5-.9 5.5-2V5M4.5 8.5V12c0 1.1 2.45 2 5.5 2s5.5-.9 5.5-2V8.5M4.5 12v3c0 1.1 2.45 2 5.5 2s5.5-.9 5.5-2v-3'),
  },
  justice: {
    label: 'Recht, Anwalt, Waage, Gerechtigkeit',
    group: 'buero',
    svg: p('M10 3.25v13.5M6.25 17.25h7.5M4.25 5.25h11.5') + p('M4.25 5.25 2.25 10.5a2 2 0 0 0 4 0zM15.75 5.25l-2 5.25a2 2 0 0 0 4 0z'),
  },
  certificate: {
    label: 'Zertifikat, Diplom, Zeugnis, Auszeichnung',
    group: 'buero',
    svg:
      p('M10.75 13.75h-6.5a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5h11.5a1.5 1.5 0 0 1 1.5 1.5v4.5') +
      p('M5.75 7.25h8.5M5.75 10h4') +
      c(14, 12.5, 2) +
      p('M13 14.25v3l1-.75 1 .75v-3'),
  },
  safe: {
    label: 'Tresor, Sicherheit, Aufbewahrung, Schliessfach',
    group: 'buero',
    svg: r(3.25, 3.25, 13.5, 12.5, 1.5) + c(10, 9.5, 2.75) + p('M10 6.75v1M10 11.25v1M7.25 9.5h1M11.75 9.5h1M5.5 15.75v1.5M14.5 15.75v1.5'),
  },
  'id-card': {
    label: 'Ausweis, Mitgliederkarte, Personalien, Badge',
    group: 'buero',
    svg: r(2.75, 4.25, 14.5, 11.5, 1.5) + c(7, 9, 1.75) + p('M4.5 13.25c.4-1.25 1.3-2 2.5-2s2.1.75 2.5 2M11.25 8.25h3.5M11.25 11h3.5'),
  },
  bell: { label: 'Glocke, Hinweis, Benachrichtigung, Klingel', group: 'buero', svg: p('M5 13.25V9a5 5 0 0 1 10 0v4.25l1.5 1.75h-13z') + p('M8.25 17.25h3.5') },
  search: { label: 'Suche, Lupe, Finden, Entdecken', group: 'buero', svg: c(8.75, 8.75, 5.25) + p('M12.5 12.5l4.75 4.75') },
  download: {
    label: 'Herunterladen, Download, Datei, PDF',
    group: 'buero',
    svg: p('M10 2.75v9.5M6.25 8.75 10 12.5l3.75-3.75M3.25 13.75v2a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5v-2'),
  },
  share: { label: 'Teilen, Netzwerk, Weiterleiten, Verbinden', group: 'buero', svg: c(14.5, 4.75, 2) + c(5.5, 10, 2) + c(14.5, 15.25, 2) + p('M7.25 9l5.5-3.25M7.25 11l5.5 3.25') },
  /* ---------- Natur, Wetter, Tiere ---------- */
  cloud: { label: 'Wolke, Bewölkt, Wetter, Cloud', group: 'natur', svg: p('M5.75 15.25a3.5 3.5 0 0 1-.5-6.95 5 5 0 0 1 9.6 1.2 3 3 0 0 1-.35 5.75z') },
  'cloud-sun': {
    label: 'Sonne und Wolken, Wetter, Terrasse offen',
    group: 'natur',
    svg:
      p('M7.25 2.75v1M3.4 4.4l.7.7M2.75 8.25h1M11.1 4.4l-.7.7') +
      p('M4.75 10.25a3 3 0 0 1 5.25-3.5') +
      p('M8.75 16.75a2.75 2.75 0 0 1-.3-5.5 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.3 4.5z'),
  },
  wind: { label: 'Wind, Sturm, Wetter, Föhn', group: 'natur', svg: p('M2.75 7.25h9a2.25 2.25 0 1 0-2.25-2.25M2.75 10.5h12.5a2.25 2.25 0 1 1-2.25 2.25M2.75 13.75h6') },
  thunder: {
    label: 'Gewitter, Blitz, Unwetter, Wetter',
    group: 'natur',
    svg: p('M6 13.25a3.25 3.25 0 0 1-.35-6.45 4.75 4.75 0 0 1 9.1 1.1 2.75 2.75 0 0 1-.5 5.35') + p('M10.5 10.75 8.5 14h3l-2 3.25'),
  },
  umbrella: { label: 'Schirm, Regen, Schlechtwetter, Schutz', group: 'natur', svg: p('M2.75 10a7.25 7.25 0 0 1 14.5 0z') + p('M10 10v5.25a1.75 1.75 0 0 1-3.5 0M10 2.75v.5') },
  cactus: {
    label: 'Kaktus, Pflanze, Zimmerpflanze, Wüste',
    group: 'natur',
    svg: p('M8.25 17.25V5a1.75 1.75 0 0 1 3.5 0v12.25M5.75 17.25h8.5') + p('M8.25 11.25H6.5a1.75 1.75 0 0 1-1.75-1.75V8M11.75 9.75h1.75a1.75 1.75 0 0 0 1.75-1.75V6.5'),
  },
  mushroom: {
    label: 'Pilz, Herbst, Wald, Pilze',
    group: 'natur',
    svg: p('M3.25 9.5a6.75 6.75 0 0 1 13.5 0z') + p('M7.75 9.5l-.5 6.25a1.5 1.5 0 0 0 1.5 1.5h2.5a1.5 1.5 0 0 0 1.5-1.5l-.5-6.25') + dot(7, 6.75) + dot(11.5, 5.75),
  },
  bee: {
    label: 'Biene, Honig, Imker, Bestäubung',
    group: 'natur',
    svg:
      e(10, 12, 3.25, 4.5) +
      p('M6.9 10.75h6.2M6.9 13.5h6.2') +
      p('M8.25 7.75C6.5 5.25 3.5 5.5 3.75 7.25c.2 1.4 2.4 1.9 3.85 1.55M11.75 7.75c1.75-2.5 4.75-2.25 4.5-.5-.2 1.4-2.4 1.9-3.85 1.55'),
  },
  bird: {
    label: 'Vogel, Vogelgezwitscher, Natur, Frühling',
    group: 'natur',
    svg: p('M17.25 6.75 13.5 7.5a3 3 0 0 0-5.75-.5L6 11.25H2.75c1 2.75 3.5 4.5 6.5 4.5 3.5 0 5.25-2.75 5.25-6V8.5z') + dot(11, 6.75),
  },
  butterfly: {
    label: 'Schmetterling, Garten, Frühling, Leichtigkeit',
    group: 'natur',
    svg:
      p('M10 6.75v8.5') +
      p('M10 9C8.75 5.5 5.75 3.25 3.75 4.25s-.25 5.5 2.75 6c-2 .5-2.5 3.25-1 4.25s3.5-.5 4.5-3.5') +
      p('M10 9c1.25-3.5 4.25-5.75 6.25-4.75s.25 5.5-2.75 6c2 .5 2.5 3.25 1 4.25s-3.5-.5-4.5-3.5'),
  },
  cat: {
    label: 'Katze, Haustier, Tierarzt, Katzenpension',
    group: 'natur',
    svg: p('M4.25 4.25 7.25 7a7 7 0 0 1 5.5 0l3-2.75v7a5.75 5.25 0 0 1-11.5 0z') + dot(8, 10.5) + dot(12, 10.5) + p('M9.25 13h1.5l-.75.75z'),
  },
  cow: {
    label: 'Kuh, Bauernhof, Milch, Alp',
    group: 'natur',
    svg:
      p('M6.25 5.25c-1-.25-1.5-1.25-1.5-2.5M13.75 5.25c1-.25 1.5-1.25 1.5-2.5') +
      p('M6 7.25H3.25a2 2 0 0 0 2.75 1.75M14 7.25h2.75A2 2 0 0 1 14 9') +
      p('M6.25 11.5V6.75a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.5 1.5v4.75') +
      r(5.25, 11.5, 9.5, 5.75, 2.75) +
      dot(8.25, 14.25) +
      dot(11.75, 14.25) +
      dot(8.25, 8.5) +
      dot(11.75, 8.5),
  },
  campfire: {
    label: 'Feuerstelle, Grillplatz, Lagerfeuer, Bräteln',
    group: 'natur',
    svg: p('M10 3.25c2 2.25 3.5 4 3.5 6a3.5 3.5 0 0 1-7 0c0-1 .5-2 1.25-2.75.25 1 .75 1.5 1.5 1.75C9 6.75 9.25 5 10 3.25z') + p('M3.75 17.25l12.5-3.5M16.25 17.25 3.75 13.75'),
  },
  rainbow: { label: 'Regenbogen, Vielfalt, Pride, Kinder', group: 'natur', svg: p('M2.75 14a7.25 7.25 0 0 1 14.5 0M5.25 14a4.75 4.75 0 0 1 9.5 0M7.75 14a2.25 2.25 0 0 1 4.5 0') },
  recycle: {
    label: 'Recycling, Kreislauf, Wiederverwenden, Nachhaltig',
    group: 'natur',
    svg: p('M15.75 8.5A6 6 0 0 0 4.6 7.25M4.25 11.5a6 6 0 0 0 11.15 1.25') + p('M4.25 3.75v3.5h3.5M15.75 16.25v-3.5h-3.5'),
  },
  solar: {
    label: 'Solar, Photovoltaik, Energie, Strom',
    group: 'natur',
    svg: p('M4.25 4.25h11.5l1.5 8H2.75z') + p('M3.5 8.25h13M8 4.25l-.75 8M12 4.25l.75 8M10 12.25v5M7.25 17.25h5.5'),
  },
  pine: {
    label: 'Tanne, Weihnachten, Wald, Advent',
    group: 'natur',
    svg: p('M10 2.75 5.5 8.25h2.25l-3.5 4.5h3L3.75 16h12.5l-3.5-3.25h3l-3.5-4.5h2.25z') + p('M10 16v1.25'),
  },
  /* ---------- Essen & Trinken ---------- */
  croissant: {
    label: 'Gipfeli, Croissant, Bäckerei, Zmorge',
    group: 'essen',
    svg: p('M2.75 12.5c.75-4.5 3.75-7.25 7.25-7.25s6.5 2.75 7.25 7.25c-1.5.75-3 .5-4-.5L10 13.25 6.75 12c-1 1-2.5 1.25-4 .5z') + p('M7 6.25 8.25 12.5M13 6.25 11.75 12.5'),
  },
  'coffee-bean': { label: 'Kaffeebohne, Rösterei, Kaffee, Espresso', group: 'essen', svg: e(10, 10, 4.75, 7) + p('M10 3c-1.5 2-1.5 4.75 0 7s1.5 5 0 7') },
  tea: {
    label: 'Tee, Teestube, Kräutertee, Teebeutel',
    group: 'essen',
    svg: p('M3.75 8.25h9.5v4a4 4 0 0 1-4 4h-1.5a4 4 0 0 1-4-4z') + p('M13.25 9.5h1a2 2 0 0 1 0 4h-1.3') + p('M8.5 8.25v-3.5') + r(7.5, 2.75, 2, 2, 0.4),
  },
  bottle: {
    label: 'Flasche, Weinhandlung, Getränke, Most',
    group: 'essen',
    svg: p('M8.75 2.75h2.5v3.5c1.5.75 2.25 2 2.25 3.5v6a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-6c0-1.5.75-2.75 2.25-3.5z') + p('M6.5 11h7'),
  },
  carrot: {
    label: 'Rüebli, Gemüse, Bio, Markt',
    group: 'essen',
    svg: p('M12.75 7.25c-1.5-1.5-4-1.25-5 .75l-4.5 8.75L12 12.25c2-1 2.25-3.5.75-5z') + p('M12.75 7.25l3-3M13.5 6.5h3.25M12 6l.25-3.25') + p('M7.5 10.5l1.25 1M5.75 13.5 7 14.25'),
  },
  salad: {
    label: 'Salat, Bowl, Gesund, Vegetarisch',
    group: 'essen',
    svg: p('M2.75 10.25h14.5a7.25 7 0 0 1-14.5 0z') + c(7.25, 8.25, 2) + p('M10.5 10.25c0-2.5 1.75-4.25 4.25-4.5 0 2.5-1.75 4.25-4.25 4.5z'),
  },
  noodles: { label: 'Nudeln, Ramen, Asiatisch, Wok', group: 'essen', svg: p('M3.25 10.25h13.5a6.75 6.75 0 0 1-13.5 0z') + p('M8.75 10.25 15.5 3M11.75 10.25 17 5.25') },
  fondue: {
    label: 'Fondue, Käse, Caquelon, Winter',
    group: 'essen',
    svg: p('M4.25 9.25h11.5l-1 5.5a2 2 0 0 1-2 1.75h-5.5a2 2 0 0 1-2-1.75z') + p('M15.75 10.25h1.5M7.5 16.5v.75M12.5 16.5v.75M9.5 9.25 12 4.25') + r(11.75, 2.75, 2, 2, 0.4),
  },
  chocolate: { label: 'Schokolade, Confiserie, Süsses, Pralinen', group: 'essen', svg: r(4.75, 2.75, 10.5, 14.5, 1.5) + p('M4.75 7.5h10.5M4.75 12.25h10.5M10 2.75v14.5') },
  cupcake: {
    label: 'Cupcake, Gebäck, Konditorei, Geburtstag',
    group: 'essen',
    svg:
      p('M5.25 10.25l1.25 7h7l1.25-7') +
      p('M4.75 10.25a2 2 0 0 1-.5-3.75 3 3 0 0 1 3-3.25 3.5 3.5 0 0 1 5.5 0 3 3 0 0 1 3 3.25 2 2 0 0 1-.5 3.75z') +
      p('M8.75 10.25l.5 7M11.25 10.25l-.5 7'),
  },
  honey: { label: 'Honig, Konfitüre, Glas, Hofladen', group: 'essen', svg: r(4.75, 6.75, 10.5, 10.5, 2) + r(5.75, 3.25, 8.5, 3.5, 1) + p('M4.75 10.5h10.5M4.75 13.75h10.5') },
  milk: {
    label: 'Milch, Molkerei, Hofladen, Frühstück',
    group: 'essen',
    svg: p('M6.25 6.25 7.75 2.75h4.5l1.5 3.5v10.5a.5.5 0 0 1-.5.5h-6.5a.5.5 0 0 1-.5-.5z') + p('M6.25 6.25h7.5M8.75 10h2.5'),
  },
  oven: {
    label: 'Backofen, Holzofen, Küche, Backen',
    group: 'essen',
    svg: r(2.75, 3.25, 14.5, 13.5, 1.5) + r(5.25, 8.25, 9.5, 6, 1) + dot(6, 5.75) + dot(8.5, 5.75) + p('M11.5 5.75H14'),
  },
  sausage: {
    label: 'Wurst, Cervelat, Bratwurst, Metzgerei',
    group: 'essen',
    svg: p('M4.75 14.25a2.25 2.25 0 0 1-.5-4.4c2.5-.6 4.5-2.25 5.75-4.35a2.25 2.25 0 0 1 3.9 2.25c-1.75 3-4.75 5.4-8.5 6.4z') + p('M3.75 14.6l-.75 1.65M14.1 4.4l1.65-.9'),
  },

  /* ---------- Schönheit & Pflege ---------- */
  razor: { label: 'Rasur, Rasierer, Barbier, Bart', group: 'pflege', svg: r(4.75, 2.75, 10.5, 3.5, 1) + p('M10 6.25v2.5') + r(8.75, 8.75, 2.5, 8.5, 1.25) },
  perfume: { label: 'Parfum, Duft, Kosmetik, Parfümerie', group: 'pflege', svg: r(4.75, 7.75, 10.5, 9.5, 2) + p('M8 7.75v-2h4v2M10 5.75v-2h2.5') + p('M7.75 12.5h4.5') },
  'makeup-brush': {
    label: 'Make-up, Pinsel, Visagistin, Kosmetik',
    group: 'pflege',
    svg: p('M8 9.25c-1-2.5-.75-5 2-6.5 2.75 1.5 3 4 2 6.5z') + r(7.75, 9.25, 4.5, 2.5, 0.5) + p('M9 11.75l.25 5.5h1.5l.25-5.5'),
  },
  towel: {
    label: 'Handtuch, Wellness, Sauna, Bad',
    group: 'pflege',
    svg: p('M2.75 4.25h14.5') + p('M5.25 4.25v11.5a1.5 1.5 0 0 0 1.5 1.5h6.5a1.5 1.5 0 0 0 1.5-1.5V4.25') + p('M5.25 12.75h9.5'),
  },
  candle: {
    label: 'Kerze, Entspannung, Ambiente, Gedenken',
    group: 'pflege',
    svg: r(7.25, 8.75, 5.5, 8.5, 1) + p('M10 8.75v-1.5') + p('M10 2.75c1 1.25 1.5 2 1.5 2.75a1.5 1.5 0 0 1-3 0c0-.75.5-1.5 1.5-2.75z'),
  },
  stones: { label: 'Hot Stone, Massage, Steine, Balance', group: 'pflege', svg: e(10, 15.25, 6.25, 2) + e(10, 10.75, 4.5, 1.75) + e(10, 6.75, 3, 1.5) },
  /* ---------- Handwerk & Haus ---------- */
  drill: {
    label: 'Bohrmaschine, Bohren, Montage, Werkzeug',
    group: 'handwerk',
    svg: r(2.75, 4.75, 10, 5, 1.5) + p('M12.75 6.25h2M12.75 8.25h2M14.75 7.25h2.5') + p('M5.25 9.75l-1 6.25a1 1 0 0 0 1 1.25h2.5a1 1 0 0 0 1-.85l.75-6.65'),
  },
  ladder: { label: 'Leiter, Maler, Dach, Montage', group: 'handwerk', svg: p('M6.25 2.75 4.75 17.25M13.75 2.75l1.5 14.5M5.9 6.25h8.2M5.5 10h9M5.1 13.75h9.8') },
  toolbox: {
    label: 'Werkzeugkiste, Service, Reparatur, Hauswart',
    group: 'handwerk',
    svg: r(2.75, 7.25, 14.5, 9.5, 1.5) + p('M7.25 7.25v-2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v2M2.75 11.25h14.5M7 11.25v1.5M13 11.25v1.5'),
  },
  faucet: {
    label: 'Sanitär, Wasserhahn, Installateur, Bad',
    group: 'handwerk',
    svg:
      p('M2.75 6.25h2.5v4.5h-2.5') + p('M5.25 7.25h6a3 3 0 0 1 3 3v1.5') + p('M8.25 7.25v-2.5M6.25 4.75h4') + p('M14.25 14.5c.65.85 1 1.45 1 2a1 1 0 0 1-2 0c0-.55.35-1.15 1-2z'),
  },
  plug: {
    label: 'Stecker, Elektriker, Strom, Elektro',
    group: 'handwerk',
    svg: p('M7.25 2.75v3.5M12.75 2.75v3.5') + p('M5.25 6.25h9.5v3a4.75 4.75 0 0 1-9.5 0z') + p('M10 14v3.25'),
  },
  radiator: {
    label: 'Heizung, Wärme, Heizungsbau, Energie',
    group: 'handwerk',
    svg:
      r(3.75, 4.25, 3, 11.5, 1.5) +
      r(8.5, 4.25, 3, 11.5, 1.5) +
      r(13.25, 4.25, 3, 11.5, 1.5) +
      p('M6.75 6.25h1.75M6.75 13.75h1.75M11.5 6.25h1.75M11.5 13.75h1.75M5.25 15.75v1.5M14.75 15.75v1.5'),
  },
  shovel: {
    label: 'Schaufel, Garten, Gartenbau, Umgebung',
    group: 'handwerk',
    svg: p('M14.75 2.75l2.5 2.5M16 4l-6.5 6.5') + p('M9.5 10.5 7.75 8.75 3.5 13a2.5 2.5 0 0 0 0 3.5 2.5 2.5 0 0 0 3.5 0l4.25-4.25z'),
  },
  bricks: {
    label: 'Mauer, Maurer, Bau, Backstein',
    group: 'handwerk',
    svg: r(2.75, 4.25, 14.5, 11.5, 1) + p('M2.75 8.08h14.5M2.75 11.92h14.5M7.5 4.25v3.83M12.5 4.25v3.83M5 8.08v3.84M10 8.08v3.84M15 8.08v3.84M7.5 11.92v3.83M12.5 11.92v3.83'),
  },
  'measuring-tape': { label: 'Massband, Ausmessen, Schreiner, Masse', group: 'handwerk', svg: c(9, 10, 6.25) + c(9, 10, 1.75) + p('M15.25 10v5.25h2') },
  helmet: {
    label: 'Helm, Baustelle, Sicherheit, Bau',
    group: 'handwerk',
    svg: p('M3.25 13.75a6.75 6.75 0 0 1 13.5 0') + p('M2.75 13.75h14.5v1.5a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1z') + p('M8 7.6V12M12 7.6V12'),
  },
  axe: { label: 'Axt, Holz, Brennholz, Forst', group: 'handwerk', svg: p('M3.25 16.75l9-9') + p('M10.25 5.75l3-3 3 3c.5 1.75-.25 3.5-2 4.5z') },
  fence: {
    label: 'Zaun, Gartenbau, Garten, Umzäunung',
    group: 'handwerk',
    svg: p('M3.5 17.25V5.5l1.25-2L6 5.5v11.75M8.75 17.25V5.5l1.25-2 1.25 2v11.75M14 17.25V5.5l1.25-2 1.25 2v11.75M6 8.5h2.75M11.25 8.5H14M6 13.5h2.75M11.25 13.5H14'),
  },

  /* ---------- Gesundheit ---------- */
  bandage: {
    label: 'Pflaster, Erste Hilfe, Wunde, Apotheke',
    group: 'gesundheit',
    svg: p('M4.4 11.85 11.85 4.4a2.6 2.6 0 0 1 3.7 3.7L8.1 15.6a2.6 2.6 0 0 1-3.7-3.7z') + p('M8 10l2-2 2 2-2 2z'),
  },
  syringe: {
    label: 'Spritze, Impfung, Injektion, Arzt',
    group: 'gesundheit',
    svg: p('M14.75 2.75l2.5 2.5M16 4l-2.25 2.25M12.25 4.75l3 3M13.75 6.25l-7.5 7.5-3 .5.5-3 7.5-7.5M4.25 15.75l-1.5 1.5M8.5 8.5l1.25 1.25M6.75 10.25 8 11.5'),
  },
  thermometer: { label: 'Fieber, Thermometer, Temperatur, Krank', group: 'gesundheit', svg: p('M8.25 11.25V4.5a1.75 1.75 0 0 1 3.5 0v6.75a3.5 3.5 0 1 1-3.5 0z') + p('M10 8v6') },
  hospital: {
    label: 'Spital, Klinik, Notfall, Gesundheitszentrum',
    group: 'gesundheit',
    svg: r(3.25, 5.25, 13.5, 12, 1.5) + p('M7.25 5.25v-2.5h5.5v2.5') + p('M10 8.25v4M8 10.25h4') + p('M8.5 17.25v-2.5h3v2.5'),
  },
  ambulance: {
    label: 'Ambulanz, Rettung, Notfall, Krankenwagen',
    group: 'gesundheit',
    svg: p('M4.25 14.75h-1.5v-9.5h9v9.5M11.75 8.25h3l2.5 3v3.5h-1.75M7.75 14.75H12') + c(6, 15, 1.75) + c(13.75, 15, 1.75) + p('M7.25 7.25v4M5.25 9.25h4'),
  },
  ear: {
    label: 'Ohr, Hören, Hörgerät, Akustik',
    group: 'gesundheit',
    svg: p('M6 7.25a4.25 4.25 0 0 1 8.5 0c0 2.75-2.75 3.5-2.75 6.25a2.75 2.75 0 0 1-5.25 1.25') + p('M8.5 7.5a1.75 1.75 0 0 1 3.5 0c0 1-1 1.5-1.5 2.25'),
  },
  care: {
    label: 'Pflege, Betreuung, Fürsorge, Spitex',
    group: 'gesundheit',
    svg:
      p('M10 6.75C9 5 6.5 5 6.5 7c0 1.5 1.75 2.5 3.5 4 1.75-1.5 3.5-2.5 3.5-4 0-2-2.5-2-3.5-.25z') +
      p('M2.75 12.25l2.5-.75c.75-.25 1.5 0 2 .5l1 1h3.25a1 1 0 0 1 0 2H8M2.75 16.25h8.5l5.25-3a1.1 1.1 0 0 0-1-2l-3 1.25'),
  },
  'body-scale': {
    label: 'Waage, Gewicht, Ernährungsberatung, Abnehmen',
    group: 'gesundheit',
    svg: r(3.25, 3.75, 13.5, 13.5, 2) + p('M6.75 8.5a4 4 0 0 1 6.5 0L11.5 10a1.75 1.75 0 0 0-3 0z') + p('M10 9.25l.75-1.25'),
  },

  /* ---------- Laden & Versand ---------- */
  store: {
    label: 'Laden, Geschäft, Filiale, Lokal',
    group: 'laden',
    svg: p('M3.75 9.25v8h12.5v-8') + p('M2.75 3.25h14.5l-1 4a2 2 0 0 1-3.75.5 2.25 2.25 0 0 1-4 0 2 2 0 0 1-3.75-.5z') + p('M8.25 17.25v-4.5h3.5v4.5'),
  },
  cart: { label: 'Warenkorb, Einkaufen, Kaufen, Online-Shop', group: 'laden', svg: p('M2.75 3.25h2l1.75 9.5h9l1.5-6.75H5.25') + c(7.5, 15.75, 1.25) + c(14, 15.75, 1.25) },
  barcode: {
    label: 'Strichcode, Artikel, Lager, Inventar',
    group: 'laden',
    svg: p('M3.25 4.75v10.5M5.5 4.75v10.5M7 4.75v10.5M9.75 4.75v10.5M12 4.75v10.5M13.5 4.75v10.5M16.75 4.75v10.5'),
  },
  hanger: {
    label: 'Kleiderbügel, Mode, Garderobe, Kleider',
    group: 'laden',
    svg: p('M10 7.25V6.5a1.75 1.75 0 1 0-1.75-1.75') + p('M10 7.25 2.75 12.75a1 1 0 0 0 .6 1.75h13.3a1 1 0 0 0 .6-1.75z'),
  },
  heel: {
    label: 'Schuhe, Mode, Absatz, Schuhgeschäft',
    group: 'laden',
    svg: p('M3.25 16.75v-6.5c2.75-.75 5 .25 6.75 2.5 1 1.25 2.25 1.75 4 1.75h1.5a1.5 1.5 0 0 1 1.5 1.5v.75H6.25') + p('M3.25 10.25 4.5 4.5h1.75l-.5 6'),
  },
  watch: {
    label: 'Uhr, Uhrmacher, Schmuck, Armbanduhr',
    group: 'laden',
    svg: r(5.75, 5.75, 8.5, 8.5, 2) + p('M7.25 5.75l.5-3h4.5l.5 3M7.25 14.25l.5 3h4.5l.5-3M10 8.25v2l1.25.75'),
  },
  ring: { label: 'Ring, Schmuck, Verlobung, Hochzeit', group: 'laden', svg: c(10, 12, 5.25) + p('M7.75 6.75 6.5 4.75 8 2.75h4l1.5 2-1.25 2') },
  sofa: {
    label: 'Sofa, Möbel, Wohnen, Einrichtung',
    group: 'laden',
    svg:
      p('M4.25 9.25v-3a1.5 1.5 0 0 1 1.5-1.5h8.5a1.5 1.5 0 0 1 1.5 1.5v3') +
      p('M2.75 10.75a1.5 1.5 0 0 1 3 0v1.5h8.5v-1.5a1.5 1.5 0 0 1 3 0v4a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1z') +
      p('M4.75 15.75v1.5M15.25 15.75v1.5'),
  },
  lamp: { label: 'Lampe, Licht, Leuchte, Einrichtung', group: 'laden', svg: p('M6.75 2.75h6.5l2 6.5H4.75z') + p('M10 9.25v8M6.75 17.25h6.5') },
  'plant-pot': {
    label: 'Zimmerpflanze, Topf, Gärtnerei, Pflanzen',
    group: 'laden',
    svg: p('M5.25 10.75h9.5l-1.25 6.5h-7z') + p('M10 10.75V7M10 7c0-2.25-1.5-3.75-4-4 0 2.25 1.5 3.75 4 4zM10 8.5c0-2.25 1.5-3.75 4-4 0 2.25-1.5 3.75-4 4z'),
  },
  return: { label: 'Rückgabe, Umtausch, Retoure, Zurück', group: 'laden', svg: p('M7.25 4.25 3.75 7.75l3.5 3.5') + p('M3.75 7.75h8.75a4.75 4.75 0 0 1 0 9.5H8.5') },
  /* ---------- Unterwegs & Zugang ---------- */
  signpost: {
    label: 'Wegweiser, Wandern, Route, Richtung',
    group: 'unterwegs',
    svg: p('M10 2.75v14.5M7.25 17.25h5.5') + p('M10 4.25h5.25l1.5 1.5-1.5 1.5H10') + p('M10 9.25H4.75l-1.5 1.5 1.5 1.5H10'),
  },
  compass: { label: 'Kompass, Orientierung, Entdecken, Ausflug', group: 'unterwegs', svg: c(10, 10, 7.25) + p('M12.75 7.25 11 11l-3.75 1.75L9 9z') },
  map: { label: 'Karte, Stadtplan, Lage, Route', group: 'unterwegs', svg: p('M2.75 5.25l4.75-2 5 2 4.75-2v11.5l-4.75 2-5-2-4.75 2z') + p('M7.5 3.25v11.5M12.5 5.25v11.5') },
  anchor: {
    label: 'Anker, Hafen, Schiff, See',
    group: 'unterwegs',
    svg: c(10, 4.25, 1.5) + p('M10 5.75V17M7 8.25h6') + p('M4 11a6 6 0 0 0 12 0') + p('M2.75 12.25 4 11l1.25 1.25M14.75 12.25 16 11l1.25 1.25'),
  },
  ship: { label: 'Schiff, Schifffahrt, Fähre, Kursschiff', group: 'unterwegs', svg: p('M2.75 12.25h14.5l-2 4.5H4.75z') + p('M5.25 12.25v-3h9.5v3M8 9.25v-3h4v3M10 6.25v-2.5') },
  'cable-car': {
    label: 'Bergbahn, Gondel, Seilbahn, Ausflug',
    group: 'unterwegs',
    svg: p('M2.75 3.75l14.5 3') + p('M10 5.25v3') + r(4.75, 8.25, 10.5, 8.5, 2) + p('M4.75 11.75h10.5M10 8.25v3.5'),
  },
  tram: {
    label: 'Tram, ÖV, Haltestelle, Stadt',
    group: 'unterwegs',
    svg: r(4.25, 4.75, 11.5, 10.5, 2) + p('M7 2.75h6M10 2.75v2M4.25 10.25h11.5M7 17.25l1-2M13 17.25l-1-2') + dot(7.25, 12.75) + dot(12.75, 12.75),
  },
  fuel: {
    label: 'Tankstelle, Benzin, Garage, Auto',
    group: 'unterwegs',
    svg: p('M3.75 17.25v-13a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v13M2.75 17.25h10M3.75 8.75h7.5') + p('M11.75 7.25h1.5a1.5 1.5 0 0 1 1.5 1.5v5a1 1 0 0 0 2 0V6.5l-2-2'),
  },
  'ev-charging': {
    label: 'E-Ladestation, Elektroauto, Laden, Strom',
    group: 'unterwegs',
    svg:
      p('M3.75 17.25v-13a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v13M2.75 17.25h10') +
      p('M8.25 5.25 6.5 8.5h3L7.75 11.75') +
      p('M11.75 7.25h1.5a1.5 1.5 0 0 1 1.5 1.5v5a1 1 0 0 0 2 0V6.5l-2-2'),
  },
  passport: { label: 'Pass, Reise, Ausweis, Visum', group: 'unterwegs', svg: r(4.25, 2.75, 11.5, 14.5, 1.5) + c(10, 8.75, 2.75) + p('M7.25 8.75h5.5M7.75 14.25h4.5') },
  elevator: {
    label: 'Lift, Aufzug, Barrierefrei, Stockwerk',
    group: 'unterwegs',
    svg: r(3.25, 2.75, 13.5, 14.5, 1.5) + p('M10 2.75v14.5') + p('M5.25 9.25 6.75 7.5l1.5 1.75M11.75 10.75l1.5 1.75 1.5-1.75'),
  },
  stairs: { label: 'Treppe, Stufen, Stockwerk, Zugang', group: 'unterwegs', svg: p('M2.75 16.75h3.5v-3.5h3.5v-3.5h3.5v-3.5h4') },
  toilet: {
    label: 'WC, Toilette, Sanitär, Barrierefrei',
    group: 'unterwegs',
    svg: p('M4.25 2.75h4v6.75') + p('M4.25 2.75v6.75H16v1a5 5 0 0 1-5 5H9l.5 1.75H5.75l.5-2.75a5 5 0 0 1-2-4.25'),
  },
  shower: {
    label: 'Dusche, Bad, Zimmer, Camping',
    group: 'unterwegs',
    svg: p('M4.25 17.25v-12a2.5 2.5 0 0 1 5 0v.5') + p('M6 9.25h7a3.5 3.5 0 0 0-7 0z') + dot(7, 12) + dot(9.5, 12) + dot(12, 12) + dot(8.25, 14.75) + dot(10.75, 14.75),
  },
  bath: {
    label: 'Badewanne, Bad, Wellness, Hotel',
    group: 'unterwegs',
    svg: p('M2.75 10.25h14.5v2a4 4 0 0 1-4 4h-6.5a4 4 0 0 1-4-4z') + p('M5.25 10.25v-5a2 2 0 0 1 3.75-1') + p('M5.25 16.25l-.75 1M14.75 16.25l.75 1'),
  },
  'service-bell': { label: 'Rezeption, Glocke, Service, Hotel', group: 'unterwegs', svg: p('M3.25 14.25a6.75 6.75 0 0 1 13.5 0z') + p('M2.75 16.75h14.5M10 7.5V5.75M8.5 5.75h3') },
  beach: {
    label: 'Strand, Sonnenschirm, Ferien, Sommer',
    group: 'unterwegs',
    svg:
      p('M3 10.25a7 7 0 0 1 14 0c-1.15-.75-2.35-.75-3.5 0-1.15-.75-2.35-.75-3.5 0-1.15-.75-2.35-.75-3.5 0-1.15-.75-2.35-.75-3.5 0z') +
      p('M10 10.25v6.5M3.75 17.25c2-1 10.5-1 12.5 0'),
  },
  building: {
    label: 'Gebäude, Hotel, Büro, Wohnblock',
    group: 'unterwegs',
    svg: r(4.25, 2.75, 11.5, 14.5, 1) + p('M7.5 6h1M11.5 6h1M7.5 9h1M11.5 9h1M7.5 12h1M11.5 12h1') + p('M8.75 17.25v-2.5h2.5v2.5'),
  },

  /* ---------- Alltag ---------- */
  family: {
    label: 'Familie, Kinder, Eltern, Gemeinsam',
    group: 'alltag',
    svg:
      c(6.25, 5, 2) +
      c(13.75, 5, 2) +
      c(10, 11.75, 1.5) +
      p('M2.75 15.75v-3a3.75 3.75 0 0 1 6-3M17.25 15.75v-3a3.75 3.75 0 0 0-6-3') +
      p('M7.25 17.25V16a2.75 2.75 0 0 1 5.5 0v1.25'),
  },
  stroller: {
    label: 'Kinderwagen, Familie, Baby, Kinderfreundlich',
    group: 'alltag',
    svg: p('M3.25 3.75h1.5L6 11.25h10.5a5.25 5.25 0 0 0-5.25-5.25H10v5.25') + c(7, 15.25, 1.75) + c(14, 15.25, 1.75),
  },
  teddy: {
    label: 'Spielzeug, Teddy, Kinder, Kita',
    group: 'alltag',
    svg: c(10, 10.75, 5.5) + p('M5.6 7.4a2 2 0 1 1 2.6-2.65M14.4 7.4a2 2 0 1 0-2.6-2.65') + e(10, 13.25, 2.25, 1.75) + dot(8, 9.75) + dot(12, 9.75) + dot(10, 12.75),
  },
  balloon: {
    label: 'Ballon, Party, Fest, Geburtstag',
    group: 'alltag',
    svg: p('M10 12.75c-2.75 0-4.75-2.5-4.75-5.25a4.75 4.75 0 0 1 9.5 0c0 2.75-2 5.25-4.75 5.25z') + p('M9.25 14.25h1.5L10 12.75zM10 14.25c0 1.5-1.5 1.5-1.5 3'),
  },
  party: {
    label: 'Party, Fest, Feier, Jubiläum',
    group: 'alltag',
    svg: p('M3.25 16.75 6.5 7.5l6 6z') + p('M11 2.75v1.5M15.25 5.5l1-1M14.25 9h2.5') + p('M10.25 7.75c1.25-1.25 1.25-2.5.75-3.5M12.25 9.75c1.25-1.25 2.5-1.25 3.5-.75'),
  },
  megaphone: {
    label: 'Ankündigung, Megafon, Aktion, News',
    group: 'alltag',
    svg: p('M3.25 8.25h3l8.5-4.5v12.5l-8.5-4.5h-3z') + p('M6.25 12.25l1 4.25h2l-.75-3.5') + p('M16.75 8.5v3'),
  },
  lightning: { label: 'Schnell, Blitz, Express, Energie', group: 'alltag', svg: p('M11 2.75 4.75 11h5L9 17.25 15.25 9h-5z') },
  hourglass: {
    label: 'Sanduhr, Wartezeit, Dauer, Geduld',
    group: 'alltag',
    svg: p('M5.25 2.75h9.5M5.25 17.25h9.5M6.25 2.75c0 3.5 3.75 5 3.75 7.25s-3.75 3.75-3.75 7.25M13.75 2.75c0 3.5-3.75 5-3.75 7.25s3.75 3.75 3.75 7.25'),
  },
  trash: {
    label: 'Entsorgung, Abfall, Räumung, Kehricht',
    group: 'alltag',
    svg: p('M3.75 5.25h12.5M8 5.25v-1.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.25 5.25l.75 11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l.75-11M8.5 8.5V14M11.5 8.5V14'),
  },
  smile: { label: 'Zufrieden, Lächeln, Freundlich, Kundenservice', group: 'alltag', svg: c(10, 10, 7.25) + dot(7.5, 8.25) + dot(12.5, 8.25) + p('M7 11.75c1.5 2 4.5 2 6 0') },
  question: { label: 'Frage, Hilfe, FAQ, Support', group: 'alltag', svg: c(10, 10, 7.25) + p('M7.75 7.75a2.25 2.25 0 1 1 3.25 2c-.6.3-1 .9-1 1.5v.5') + dot(10, 14.25) },
  'swiss-cross': {
    label: 'Schweiz, Swiss made, Schweizer Qualität, Lokal',
    group: 'alltag',
    svg: r(3.25, 3.25, 13.5, 13.5, 2) + p('M8.5 6.25h3v2.25h2.25v3H11.5v2.25h-3V11.5H6.25v-3H8.5z'),
  },
  cookie: { label: 'Guetzli, Cookie, Gebäck, Süsses', group: 'essen', svg: c(10, 10, 7.25) + dot(7.5, 7.5) + dot(12.25, 7.75) + dot(10, 10.5) + dot(7.75, 13) + dot(12.75, 12.75) },
};
