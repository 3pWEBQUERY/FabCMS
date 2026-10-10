/**
 * Nova's icons for website content (Raster, Aufzählung …): same grid as the
 * admin set – 20 × 20, 1.5 px stroke, round caps and joins, 2 px safe area –
 * drawn for this size. Each icon is SVG markup without the <svg> element, so
 * the website renders it inline and the admin shows the same drawing.
 *
 * Labels are German search words for the picker (several, comma-separated).
 */

export interface IconDef {
  label: string;
  group: IconGroup;
  svg: string;
}
export type IconGroup = 'essen' | 'handwerk' | 'pflege' | 'gesundheit' | 'laden' | 'unterwegs' | 'alltag' | 'natur';

export const ICON_GROUPS: { id: IconGroup; label: string }[] = [
  { id: 'essen', label: 'Essen & Trinken' },
  { id: 'handwerk', label: 'Handwerk & Haus' },
  { id: 'pflege', label: 'Schönheit & Pflege' },
  { id: 'gesundheit', label: 'Gesundheit' },
  { id: 'laden', label: 'Laden & Versand' },
  { id: 'unterwegs', label: 'Unterwegs & Zugang' },
  { id: 'alltag', label: 'Alltag' },
  { id: 'natur', label: 'Natur & Jahreszeiten' },
];

const p = (d: string) => `<path d="${d}"/>`;
const c = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const r = (x: number, y: number, w: number, h: number, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''}/>`;

export const SITE_ICONS: Record<string, IconDef> = {
  /* ---------- Essen & Trinken ---------- */
  'fork-knife': {
    label: 'Besteck, Essen, Restaurant, Mittag',
    group: 'essen',
    svg: p('M6 2.75v4.5a2 2 0 0 0 4 0v-4.5M8 2.75v14.5') + p('M14.25 17.25V2.75c-1.6.6-2.5 2.4-2.5 4.75v3.75h2.5'),
  },
  cup: {
    label: 'Kaffee, Tasse, Café, Pause',
    group: 'essen',
    svg: p('M3.75 7.25h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z') + p('M13.75 8.5h1a2 2 0 0 1 0 4h-1.3') + p('M6.5 2.75c-.6.8-.6 1.7 0 2.5M9.75 2.75c-.6.8-.6 1.7 0 2.5'),
  },
  wine: { label: 'Wein, Glas, Bar, Apéro', group: 'essen', svg: p('M6 2.75h8c.3 3.6-1.1 6.75-4 6.75S5.7 6.35 6 2.75z') + p('M10 9.5v7.75M7 17.25h6M6.2 5.5h7.6') },
  beer: {
    label: 'Bier, Krug, Bar',
    group: 'essen',
    svg:
      p('M4.75 6.25h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z') +
      p('M12.75 8.25h1.25a2 2 0 0 1 2 2v1.5a2 2 0 0 1-2 2h-1.25') +
      p('M4.75 6.25a2 2 0 0 1 1.5-3.25 2.5 2.5 0 0 1 4.25.25 2 2 0 0 1 2.25 3M7.5 9.5v4.5M10 9.5v4.5'),
  },
  cocktail: { label: 'Cocktail, Drink, Bar', group: 'essen', svg: p('M3.75 3.75h12.5L10 10.25z') + p('M10 10.25v7M7 17.25h6M5.6 5.75h8.8') + p('M14.25 3.75l1.5-1.25') },
  'chef-hat': {
    label: 'Koch, Küche, Kochmütze',
    group: 'essen',
    svg: p('M6 16.25h8M6.25 13.25h7.5v3H6.25z') + p('M6.25 13.25V10.6A3.25 3.25 0 0 1 6 4.25a4 4 0 0 1 8 0 3.25 3.25 0 0 1-.25 6.35v2.65'),
  },
  pot: {
    label: 'Topf, Kochen, Suppe, Eintopf',
    group: 'essen',
    svg: p('M3.75 8.25h12.5v5.5a3 3 0 0 1-3 3h-6.5a3 3 0 0 1-3-3z') + p('M2.25 8.25h15.5M8 5.75h4M8 3.25c-.5.6-.5 1.3 0 1.9M12 3.25c-.5.6-.5 1.3 0 1.9'),
  },
  pizza: {
    label: 'Pizza, Stück, Italienisch',
    group: 'essen',
    svg: p('M3.25 4.75c4.4-2 9.1-2 13.5 0L10 17.25z') + p('M4.5 7.25c3.6-1.4 7.4-1.4 11 0') + c(8.5, 9.75, 0.9) + c(11.5, 12, 0.9),
  },
  burger: {
    label: 'Burger, Imbiss, Take-away',
    group: 'essen',
    svg: p('M3.75 8.75a6.25 4.75 0 0 1 12.5 0z') + p('M3 11.25h14M3.75 13.75h12.5v.5a2.5 2.5 0 0 1-2.5 2.5h-7.5a2.5 2.5 0 0 1-2.5-2.5z'),
  },
  bread: {
    label: 'Brot, Bäckerei, Zopf',
    group: 'essen',
    svg:
      p('M3.25 12.5c0-4.2 3-7.75 6.75-7.75s6.75 3.55 6.75 7.75a2.75 2.75 0 0 1-2.75 2.75H6a2.75 2.75 0 0 1-2.75-2.75z') + p('M7.25 8.25l1.5 2M10 7.75l1.5 2M12.75 8.25l1.25 1.75'),
  },
  cake: {
    label: 'Kuchen, Torte, Geburtstag, Dessert',
    group: 'essen',
    svg:
      p('M3.75 10.25h12.5v6.5H3.75z') +
      p('M3.75 13c1.4 1 2.75 1 4.15 0 1.4 1 2.75 1 4.2 0 1.4 1 2.75 1 4.15 0M10 10.25V7.5') +
      p('M10 3.25c.9 1 .9 2.2 0 2.75-.9-.55-.9-1.75 0-2.75z'),
  },
  'ice-cream': { label: 'Glace, Eis, Sommer, Dessert', group: 'essen', svg: p('M6.25 8.75 10 17.25l3.75-8.5') + p('M5.75 8.75a4.25 4.25 0 1 1 8.5 0z') },
  fish: { label: 'Fisch, See, Meeresfrüchte', group: 'essen', svg: p('M2.75 10c2.6-4.1 8.3-5 12.25-.6l2.25-2.15v5.5l-2.25-2.15C11.05 15 5.35 14.1 2.75 10z') + c(6.5, 9.25, 0.6) },
  meat: {
    label: 'Fleisch, Metzgerei, Grill, Steak',
    group: 'essen',
    svg:
      p('M12.5 3.25c2.6.2 4.4 2.3 4.25 4.75-.2 3.1-3.3 4.4-5.55 6.4-1.6 1.4-2.3 3.2-4.7 2.75C3.9 16.7 2.6 14.2 3.6 11.9c1.1-2.6 4.1-3 5.2-5.6.8-1.9 1.6-3.2 3.7-3.05z') +
      c(12.25, 7.75, 1.5),
  },
  egg: { label: 'Ei, Frühstück, Brunch', group: 'essen', svg: p('M10 2.75c3 0 5.25 4.4 5.25 8.25a5.25 5.25 0 0 1-10.5 0C4.75 7.15 7 2.75 10 2.75z') },
  cheese: {
    label: 'Käse, Molkerei, Fondue, Raclette',
    group: 'essen',
    svg: p('M2.75 9.25 13 4l4.25 5.25v6.5H2.75z') + p('M2.75 9.25h14.5') + c(7, 12.5, 1.1) + c(12.5, 13.25, 0.8),
  },
  grill: {
    label: 'Grill, BBQ, Feuer',
    group: 'essen',
    svg:
      p('M3.25 8.25h13.5a6.75 5 0 0 1-13.5 0z') +
      p('M6.5 13 5 17.25M13.5 13l1.5 4.25M10 13.25v4') +
      p('M7.5 3c-.5.9-.5 1.9 0 2.75M10 2.75c-.5.9-.5 1.9 0 2.75M12.5 3c-.5.9-.5 1.9 0 2.75'),
  },
  vegan: { label: 'Vegan, Vegetarisch, Pflanzlich, Blatt', group: 'essen', svg: p('M4.75 15.25C3.5 9 7.25 4.25 15.25 3.75c.5 8-4.25 11.75-10.5 11.5z') + p('M4.75 15.25 11 9') },
  wheat: {
    label: 'Getreide, Gluten, Weizen, Ähre',
    group: 'essen',
    svg:
      p('M10 17.25V5') +
      p(
        'M10 6.75c-1.75 0-2.75-1.25-2.75-3 1.75 0 2.75 1.25 2.75 3zM10 6.75c1.75 0 2.75-1.25 2.75-3-1.75 0-2.75 1.25-2.75 3zM10 10.25c-1.75 0-2.75-1.25-2.75-3 1.75 0 2.75 1.25 2.75 3zM10 10.25c1.75 0 2.75-1.25 2.75-3-1.75 0-2.75 1.25-2.75 3zM10 13.75c-1.75 0-2.75-1.25-2.75-3 1.75 0 2.75 1.25 2.75 3zM10 13.75c1.75 0 2.75-1.25 2.75-3-1.75 0-2.75 1.25-2.75 3z',
      ),
  },
  'no-gluten': {
    label: 'Glutenfrei, ohne Gluten, Allergie',
    group: 'essen',
    svg: c(10, 10, 7.25) + p('M4.9 4.9l10.2 10.2') + p('M10 15V7.5M10 9.25c-1.3 0-2-1-2-2.25M10 12c1.3 0 2-1 2-2.25'),
  },
  chili: {
    label: 'Scharf, Chili, Peperoncini',
    group: 'essen',
    svg: p('M14 6.25c1.5 1.5 1.5 4-.25 6.5-2.3 3.2-6.7 4.9-10.5 4.25 3.2-1.2 5.1-3.5 6.1-6.5.9-2.6 2.6-5.3 4.65-4.25z') + p('M14 6.25c0-1.6.8-2.8 2.25-3.5'),
  },
  'take-away': {
    label: 'Take-away, Mitnehmen, Tüte, Bestellung',
    group: 'essen',
    svg: p('M4.75 7.25h10.5l-.9 9.25a1 1 0 0 1-1 .75H6.65a1 1 0 0 1-1-.75z') + p('M7.25 7.25V5.5a2.75 2.75 0 0 1 5.5 0v1.75'),
  },
  delivery: {
    label: 'Lieferung, Velokurier, Bringdienst',
    group: 'essen',
    svg: c(5.25, 14, 2.5) + c(14.75, 14, 2.5) + p('M5.25 14 8 8.25h4.5l2.25 5.75M8 8.25 6.75 5.5H5M12.5 8.25l1-2.75h2'),
  },
  menu: { label: 'Speisekarte, Karte, Menü', group: 'essen', svg: r(4.25, 2.75, 11.5, 14.5, 1.25) + p('M7.25 6.5h5.5M7.25 9.5h5.5M7.25 12.5h3.5') },

  /* ---------- Handwerk & Haus ---------- */
  hammer: {
    label: 'Hammer, Handwerk, Reparatur',
    group: 'handwerk',
    svg: p('M11.75 8.25 4.5 15.5a1.4 1.4 0 0 1-2-2l7.25-7.25') + p('M8.5 5 11 2.5l2.75.5 3.75 3.75-2.25 2.25-1.25-1.25-1.5 1.5-3-3z'),
  },
  wrench: {
    label: 'Schlüssel, Werkzeug, Service, Unterhalt',
    group: 'handwerk',
    svg: p('M15.9 4.9a4 4 0 0 1-5.3 5.05l-6 6a1.5 1.5 0 0 1-2.1-2.1l6-6a4 4 0 0 1 5.05-5.3l-2.3 2.3.4 1.95 1.95.4z'),
  },
  screwdriver: {
    label: 'Schraubenzieher, Montage',
    group: 'handwerk',
    svg: p('M12.5 3.75 16.25 7.5l-3 3-3.75-3.75z') + p('M10.75 9.25 4.25 15.75 3 17l-.25-.25 1.25-1.25 6.5-6.5'),
  },
  saw: {
    label: 'Säge, Holz, Schreinerei',
    group: 'handwerk',
    svg: r(2.75, 7.25, 5, 7, 1.5) + r(4.25, 9.25, 2, 3, 0.5) + p('M7.75 8.25 17.25 5.5v4.25L7.75 13') + p('M10.25 12.25l.5 1.25M12.75 11.5l.5 1.25M15.25 10.75l.5 1.25'),
  },
  ruler: { label: 'Massstab, Vermessung, Planung', group: 'handwerk', svg: r(2.75, 7, 14.5, 6, 1) + p('M5.75 7v2.5M8.5 7v1.5M11.25 7v2.5M14 7v1.5') },
  brush: {
    label: 'Pinsel, Malerei, Farbe, Anstrich',
    group: 'handwerk',
    svg: p('M13.25 2.75l4 4-6.5 6.5-4-4z') + p('M6.75 9.25c-2.4.2-3.75 1.75-3.75 4 0 1.9-.6 3-1.25 4 4.3.4 7.6-1.5 7.75-5.25'),
  },
  roller: { label: 'Farbroller, Maler, Renovation', group: 'handwerk', svg: r(3.25, 2.75, 11.5, 4, 1) + p('M14.75 4.75h2v4.5h-6.75v2.5') + r(9, 11.75, 2, 5.5, 0.5) },
  house: { label: 'Haus, Wohnen, Bau', group: 'handwerk', svg: p('M3.25 9 10 3.25 16.75 9') + p('M5 7.75v9h10v-9') + p('M8.25 16.75v-4.5h3.5v4.5') },
  key: { label: 'Schlüssel, Schlüsseldienst, Übergabe, Vermietung', group: 'handwerk', svg: c(6.5, 13.5, 3.5) + p('M9 11 16.25 3.75M13.5 6.5l2 2M11.75 8.25l1.5 1.5') },
  bolt: { label: 'Strom, Elektriker, Energie', group: 'handwerk', svg: p('M11 2.75 4.75 11h5l-1 6.25L15.25 9h-5z') },
  drop: { label: 'Wasser, Sanitär, Tropfen', group: 'handwerk', svg: p('M10 2.75c3 3.6 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5.4 5-9z') },
  flame: {
    label: 'Heizung, Feuer, Wärme',
    group: 'handwerk',
    svg: p('M10 17.25a5 5 0 0 1-5-5c0-3.1 2.4-4.7 3-8.5 2.3 1.4 3.6 3.6 3.75 6 .9-.4 1.5-1.3 1.75-2.5 1 1.3 1.5 2.9 1.5 5a5 5 0 0 1-5 5z'),
  },
  window: { label: 'Fenster, Glas, Fensterbau', group: 'handwerk', svg: r(3.75, 2.75, 12.5, 14.5, 1) + p('M10 2.75v14.5M3.75 10h12.5') },
  door: { label: 'Tür, Eingang, Türen', group: 'handwerk', svg: p('M4.75 17.25V2.75h10.5v14.5M2.75 17.25h14.5') + c(12.25, 10.25, 0.6) },
  paint: {
    label: 'Farbe, Kübel, Malerei',
    group: 'handwerk',
    svg: p('M4.25 6.75h10l-1 9.5a1 1 0 0 1-1 1H6.25a1 1 0 0 1-1-1z') + p('M4.25 6.75c0-1.6 2.2-3 5-3s5 1.4 5 3M14.25 9.25h1.25a1.25 1.25 0 0 1 1.25 1.25v3.25'),
  },
  tiles: { label: 'Platten, Fliesen, Boden', group: 'handwerk', svg: r(2.75, 2.75, 14.5, 14.5, 1) + p('M2.75 7.6h14.5M2.75 12.4h14.5M7.6 2.75v4.85M12.4 7.6v4.8M7.6 12.4v4.85') },
  crane: {
    label: 'Kran, Baustelle, Bauunternehmen',
    group: 'handwerk',
    svg: p('M6.25 17.25V3.25L3 6.5M6.25 3.25H17M6.25 6.5 9.5 3.25M14.5 3.25v4.5M13.25 7.75h2.5v2h-2.5zM3.75 17.25h5'),
  },
  leaf: {
    label: 'Garten, Gartenbau, Grün',
    group: 'handwerk',
    svg: p('M15.75 4.25c.5 6.5-2.5 11-8.5 11.5-1.5 0-2.75-.5-3.5-1.25C3.5 8.5 8 4 15.75 4.25z') + p('M3.75 14.5c3-3.75 5.75-5.75 8.5-7'),
  },
  broom: {
    label: 'Reinigung, Putzen, Hauswartung',
    group: 'handwerk',
    svg: p('M14.75 2.75 10.25 9.5') + p('M7.25 8.75l5 3.25-1.75 5.25c-2.7-.4-5.5-2.2-7.25-4.25z') + p('M6.25 12.75 8 11.5M8.5 15.5l1.25-2'),
  },

  /* ---------- Schönheit & Pflege ---------- */
  scissors: { label: 'Schere, Coiffeur, Haarschnitt', group: 'pflege', svg: c(5.5, 5.5, 2.25) + c(5.5, 14.5, 2.25) + p('M7.5 6.5 16.75 15.25M7.5 13.5 16.75 4.75') },
  comb: { label: 'Kamm, Frisur, Styling', group: 'pflege', svg: p('M2.75 8.25h14.5v3H2.75z') + p('M4.75 11.25v4M7.25 11.25v4M9.75 11.25v4M12.25 11.25v4M14.75 11.25v4') },
  'hair-dryer': {
    label: 'Föhn, Haare, Styling',
    group: 'pflege',
    svg: p('M12.25 3.75a4.25 4.25 0 0 1 0 8.5H6.75L3 10.25V5.75l3.75-2z') + c(12.25, 8, 1.5) + p('M8.75 12.25 7.75 17h3l1-4.75'),
  },
  mirror: { label: 'Spiegel, Kosmetik, Salon', group: 'pflege', svg: `<ellipse cx="10" cy="8" rx="4.75" ry="5.25"/>` + p('M10 13.25v4M7.25 17.25h5.5') },
  lotion: {
    label: 'Creme, Pflege, Kosmetik, Flasche',
    group: 'pflege',
    svg: p('M7.25 7.25h5.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-2.5a1.5 1.5 0 0 1-1.5-1.5z') + p('M8.5 7.25v-2h3v2M10 5.25V2.75h3'),
  },
  nail: {
    label: 'Nägel, Manicure, Nagelstudio, Nagellack',
    group: 'pflege',
    svg: r(5.75, 9.25, 8.5, 8, 2) + r(7.75, 6.5, 4.5, 2.75, 0.5) + p('M8.75 6.5V2.75h2.5V6.5M8.25 13.25h3.5'),
  },
  massage: {
    label: 'Massage, Wellness, Steine, Entspannung',
    group: 'pflege',
    svg:
      '<ellipse cx="10" cy="14.75" rx="6.75" ry="2.25"/><ellipse cx="10" cy="10.25" rx="4.75" ry="1.9"/><ellipse cx="10" cy="6.25" rx="3.25" ry="1.5"/>' +
      p('M13.5 3.25c1 .25 1.75 1 2 2'),
  },
  spa: {
    label: 'Spa, Wellness, Lotus, Ruhe',
    group: 'pflege',
    svg: p('M10 15.75c-3.5 0-6.75-2.5-7.25-6 2.5-.25 5 .5 7.25 3 2.25-2.5 4.75-3.25 7.25-3-.5 3.5-3.75 6-7.25 6z') + p('M10 12.75c-1.6-2-2-4.5-.1-8.5 2 4 1.7 6.5.1 8.5z'),
  },
  lips: {
    label: 'Make-up, Lippen, Kosmetik',
    group: 'pflege',
    svg: p('M2.75 9.75c1.5-2.5 3.5-4 5-4 .9 0 1.5.5 2.25 1 .75-.5 1.35-1 2.25-1 1.5 0 3.5 1.5 5 4-2 3.25-4.5 4.5-7.25 4.5s-5.25-1.25-7.25-4.5z') + p('M2.75 9.75h14.5'),
  },
  barber: { label: 'Barbier, Rasur, Bart', group: 'pflege', svg: r(7, 2.75, 6, 14.5, 3) + p('M7 7.5l6-2.5M7 11l6-2.5M7 14.5l6-2.5') },

  /* ---------- Gesundheit ---------- */
  heart: {
    label: 'Herz, Gesundheit, Liebe, Danke',
    group: 'gesundheit',
    svg: p('M10 16.25s-6.75-4-6.75-8.5a3.5 3.5 0 0 1 6.75-1.3 3.5 3.5 0 0 1 6.75 1.3c0 4.5-6.75 8.5-6.75 8.5z'),
  },
  pulse: { label: 'Puls, Herzschlag, Kardiologie', group: 'gesundheit', svg: p('M2.75 10.25h3.5l1.75-4 3 8 2-5.25 1 1.25h3.25') },
  stethoscope: {
    label: 'Arzt, Praxis, Untersuchung',
    group: 'gesundheit',
    svg: p('M4.75 2.75v4.5a3.25 3.25 0 0 0 6.5 0v-4.5') + p('M8 10.5v1.75a4 4 0 0 0 8 0v-1') + c(16, 9.25, 1.5),
  },
  tooth: {
    label: 'Zahn, Zahnarzt, Dentalhygiene',
    group: 'gesundheit',
    svg: p(
      'M6.5 3.25c1.25 0 2.25.75 3.5.75s2.25-.75 3.5-.75c2 0 3.25 1.75 3 4-.25 2.25-1.25 3.5-1.75 5.75-.5 2.5-1 4.25-2 4.25s-1.25-1.5-1.5-3.25c-.15-1-.6-1.5-1.25-1.5s-1.1.5-1.25 1.5c-.25 1.75-.5 3.25-1.5 3.25s-1.5-1.75-2-4.25C5.75 10.75 4.75 9.5 4.5 7.25c-.25-2.25 1-4 2-4z',
    ),
  },
  pill: { label: 'Medikament, Apotheke, Tablette', group: 'gesundheit', svg: p('M8.25 15.75a3.5 3.5 0 0 1-4.95-4.95l7.5-7.5a3.5 3.5 0 0 1 4.95 4.95z') + p('M6.75 7.25l5 5') },
  cross: { label: 'Kreuz, Erste Hilfe, Notfall, Medizin', group: 'gesundheit', svg: p('M7.75 2.75h4.5v5h5v4.5h-5v5h-4.5v-5h-5v-4.5h5z') },
  eye: {
    label: 'Auge, Optiker, Sehtest',
    group: 'gesundheit',
    svg: p('M2.25 10C4 6.5 6.75 4.75 10 4.75s6 1.75 7.75 5.25c-1.75 3.5-4.5 5.25-7.75 5.25S4 13.5 2.25 10z') + c(10, 10, 2.5),
  },
  glasses: {
    label: 'Brille, Optik, Lesen',
    group: 'gesundheit',
    svg: c(5.75, 12, 3) + c(14.25, 12, 3) + p('M8.75 12a1.25 1.25 0 0 1 2.5 0M2.75 12V8.5l1.5-3.25M17.25 12V8.5l-1.5-3.25'),
  },
  physio: { label: 'Physiotherapie, Bewegung, Training', group: 'gesundheit', svg: c(10, 4, 1.75) + p('M10 6.5v5.25M10 8.25l-4-1.5M10 8.25l4-1.5M10 11.75l-3 5.5M10 11.75l3 5.5') },
  brain: {
    label: 'Psychologie, Therapie, Kopf, Beratung',
    group: 'gesundheit',
    svg:
      p('M10 4.25a2.75 2.75 0 0 0-5.25 1 2.75 2.75 0 0 0-1.5 4.75 2.75 2.75 0 0 0 2 4.5 2.75 2.75 0 0 0 4.75 1.25z') +
      p('M10 4.25a2.75 2.75 0 0 1 5.25 1 2.75 2.75 0 0 1 1.5 4.75 2.75 2.75 0 0 1-2 4.5 2.75 2.75 0 0 1-4.75 1.25z'),
  },
  baby: {
    label: 'Kind, Baby, Familie, Hebamme',
    group: 'gesundheit',
    svg: c(10, 10.5, 6.25) + p('M7.75 9.5v.25M12.25 9.5v.25M8 13c1.25 1 2.75 1 4 0') + p('M10 4.25c-.9-.5-1.1-1.25-.5-1.5'),
  },
  yoga: {
    label: 'Yoga, Meditation, Kurs',
    group: 'gesundheit',
    svg: c(10, 4, 1.75) + p('M10 6.5v5M10 8.25l-2.75 2-1.5 3M10 8.25l2.75 2 1.5 3') + p('M3.75 14c2 1.5 4 2.25 6.25 2.25s4.25-.75 6.25-2.25'),
  },

  /* ---------- Laden & Versand ---------- */
  bag: { label: 'Tasche, Einkaufen, Shop', group: 'laden', svg: p('M4.25 7.25h11.5l-.75 10h-10z') + p('M7.25 7.25v-1a2.75 2.75 0 0 1 5.5 0v1') },
  basket: {
    label: 'Korb, Einkauf, Markt, Hofladen',
    group: 'laden',
    svg: p('M2.75 8.25h14.5l-1.75 8.25a1 1 0 0 1-1 .75H5.5a1 1 0 0 1-1-.75z') + p('M5.75 8.25 8.25 3.5M14.25 8.25 11.75 3.5M7.75 11.25v3M12.25 11.25v3M10 11.25v3'),
  },
  tag: { label: 'Preis, Etikett, Angebot, Rabatt', group: 'laden', svg: p('M2.75 10.25V3.75a1 1 0 0 1 1-1h6.5l7 7-7.5 7.5z') + c(6.5, 6.5, 1.25) },
  gift: {
    label: 'Geschenk, Gutschein, Überraschung',
    group: 'laden',
    svg:
      r(3.25, 7.25, 13.5, 3.5, 0.75) +
      p(
        'M4.5 10.75v6.5h11v-6.5M10 7.25v10M10 7.25C8.5 7.25 6 6.75 6 4.75c0-1.25 1.25-1.75 2.25-1.25C9.25 4 10 5.75 10 7.25zM10 7.25c1.5 0 4-.5 4-2.5 0-1.25-1.25-1.75-2.25-1.25-1 .5-1.75 2.25-1.75 3.75z',
      ),
  },
  truck: { label: 'Lieferwagen, Versand, Lieferung', group: 'laden', svg: p('M2.75 5.25h9.5v9h-9.5zM12.25 8.25h3l2 2.75v3.25h-5z') + c(5.75, 14.75, 1.75) + c(14.25, 14.75, 1.75) },
  box: {
    label: 'Paket, Versand, Karton',
    group: 'laden',
    svg: p('M3.25 6.25 10 2.75l6.75 3.5v7.5L10 17.25l-6.75-3.5z') + p('M3.25 6.25 10 9.75l6.75-3.5M10 9.75v7.5M6.6 4.5l6.75 3.5'),
  },
  card: { label: 'Karte, Bezahlen, Kreditkarte, TWINT', group: 'laden', svg: r(2.75, 4.75, 14.5, 10.5, 1.5) + p('M2.75 8.25h14.5M5.5 12h3') },
  cash: { label: 'Bargeld, Bezahlen, Franken', group: 'laden', svg: r(2.25, 5.25, 15.5, 9.5, 1) + c(10, 10, 2.25) + p('M5 8v4M15 8v4') },
  receipt: {
    label: 'Quittung, Rechnung, Beleg',
    group: 'laden',
    svg: p('M4.75 2.75h10.5v14.5l-1.75-1.25-1.75 1.25L10 16l-1.75 1.25L6.5 16l-1.75 1.25z') + p('M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3'),
  },
  percent: { label: 'Prozent, Rabatt, Aktion, Sale', group: 'laden', svg: p('M15.25 4.75 4.75 15.25') + c(5.75, 5.75, 2) + c(14.25, 14.25, 2) },
  shirt: { label: 'Kleidung, Mode, Boutique', group: 'laden', svg: p('M7.25 2.75 3 5l1.5 3.75 1.75-.75v9.25h7.5V8l1.75.75L17 5l-4.25-2.25a2.75 2.75 0 0 1-5.5 0z') },
  diamond: {
    label: 'Schmuck, Diamant, Goldschmied',
    group: 'laden',
    svg: p('M5.25 3.75h9.5l2.5 3.75L10 16.75 2.75 7.5z') + p('M2.75 7.5h14.5M7.5 3.75 6.5 7.5l3.5 9.25 3.5-9.25-1-3.75'),
  },
  book: {
    label: 'Buch, Lesen, Buchhandlung',
    group: 'laden',
    svg: p('M10 5.25C8.5 3.75 6 3.25 2.75 3.75v11.5c3.25-.5 5.75 0 7.25 1.5 1.5-1.5 4-2 7.25-1.5V3.75c-3.25-.5-5.75 0-7.25 1.5z') + p('M10 5.25v11.5'),
  },
  flower: {
    label: 'Blumen, Floristin, Strauss, Tulpe',
    group: 'laden',
    svg:
      p('M6.25 3.5 8 5.25 10 2.75l2 2.5 1.75-1.75v3.75a3.75 3.75 0 0 1-7.5 0z') +
      p('M10 11v6.25M10 15c-1.5-1.75-3-2.25-4.25-2 .5 1.75 2.25 2.25 4.25 2zM10 13.75c1.25-1.5 2.5-1.75 3.75-1.5-.5 1.5-2 1.75-3.75 1.5z'),
  },

  /* ---------- Unterwegs & Zugang ---------- */
  pin: { label: 'Ort, Adresse, Standort, Karte', group: 'unterwegs', svg: p('M10 17.25s-5.25-5.15-5.25-9.25a5.25 5.25 0 0 1 10.5 0c0 4.1-5.25 9.25-5.25 9.25z') + c(10, 8, 1.75) },
  car: {
    label: 'Auto, Garage, Anfahrt',
    group: 'unterwegs',
    svg:
      p('M3.25 13.25V10l1.5-4a1.5 1.5 0 0 1 1.4-1h7.7a1.5 1.5 0 0 1 1.4 1l1.5 4v3.25z') + p('M3.25 10h13.5M4.75 13.25v2M15.25 13.25v2') + c(6.25, 11.5, 0.5) + c(13.75, 11.5, 0.5),
  },
  parking: { label: 'Parkplatz, Parkieren, P', group: 'unterwegs', svg: r(2.75, 2.75, 14.5, 14.5, 2) + p('M7.75 14.25V5.75h3a2.5 2.5 0 0 1 0 5h-3') },
  train: {
    label: 'Zug, Bahn, ÖV, Bahnhof',
    group: 'unterwegs',
    svg: r(4.75, 2.75, 10.5, 11.5, 2) + p('M4.75 8.75h10.5M7.25 17.25l1-3M12.75 17.25l-1-3') + c(7.75, 11.5, 0.6) + c(12.25, 11.5, 0.6),
  },
  bus: {
    label: 'Bus, Postauto, Haltestelle',
    group: 'unterwegs',
    svg: r(3.75, 2.75, 12.5, 12, 1.5) + p('M3.75 9.25h12.5M6.5 14.75v2M13.5 14.75v2M3.75 5.75h12.5') + c(6.75, 12, 0.5) + c(13.25, 12, 0.5),
  },
  bike: { label: 'Velo, Fahrrad, E-Bike', group: 'unterwegs', svg: c(5, 13, 3) + c(15, 13, 3) + p('M5 13l3-6.25h5L15 13M8 6.75 10 13h-5M11.5 4.75h2.25') },
  walk: { label: 'Zu Fuss, Spaziergang, Wandern', group: 'unterwegs', svg: c(11, 3.75, 1.5) + p('M9.25 17.25l1.5-4.75-2-2 .75-4L12 8l2 2M8.75 6.5 6 8.5v2.5M10.75 12.5l2 4.75') },
  wheelchair: { label: 'Rollstuhlgängig, Barrierefrei, Zugang', group: 'unterwegs', svg: c(9, 3.75, 1.5) + p('M9 6.25v5.25h4.5l2 4.25') + p('M12.75 14.5a4.25 4.25 0 1 1-6-5') },
  plane: {
    label: 'Flugzeug, Reise, Ferien',
    group: 'unterwegs',
    svg: p('M8.5 11.5 3 14l-.25-1.75L7 9 6.5 3.25 8 2.75l3 5.75 4.75-2.25a1.25 1.25 0 0 1 1 2.25L12 10.75l1.5 6.25-1.5.5z'),
  },
  bed: {
    label: 'Bett, Hotel, Übernachtung, Zimmer',
    group: 'unterwegs',
    svg: p('M2.75 15.75V4.75M2.75 12.25h14.5v3.5M17.25 12.25v-2a2.5 2.5 0 0 0-2.5-2.5H9v4.5') + c(5.75, 9.25, 1.5),
  },
  luggage: { label: 'Koffer, Gepäck, Reisen', group: 'unterwegs', svg: r(4.25, 6.25, 11.5, 10, 1.5) + p('M7.75 6.25V3.75h4.5v2.5M7.75 6.25v10M12.25 6.25v10') },
  mountain: { label: 'Berge, Alpen, Wandern, Ausflug', group: 'unterwegs', svg: p('M2.25 16.25 7.5 7l2.5 4 2.25-3 5.5 8.25z') + p('M6.1 9.4 7.5 10.5l1.25-1.25') },
  wifi: {
    label: 'WLAN, Internet, Wifi',
    group: 'unterwegs',
    svg: p('M2.75 7.75a10.25 10.25 0 0 1 14.5 0M5.25 10.5a6.75 6.75 0 0 1 9.5 0M7.75 13.25a3.25 3.25 0 0 1 4.5 0') + c(10, 15.75, 0.5),
  },
  dog: {
    label: 'Hund, Haustier, Hunde willkommen',
    group: 'unterwegs',
    svg:
      p('M6 6.25C4.25 5.75 3 7 3.25 9.5c.25 1.5 1.25 2.25 2.5 2M14 6.25c1.75-.5 3 .75 2.75 3.25-.25 1.5-1.25 2.25-2.5 2') +
      p('M5.75 8.25c0-2.5 1.9-4.25 4.25-4.25s4.25 1.75 4.25 4.25v4c0 2.6-1.9 4.75-4.25 4.75s-4.25-2.15-4.25-4.75z') +
      p('M9 13.25h2L10 14.5z') +
      c(8, 10, 0.5) +
      c(12, 10, 0.5),
  },
  'child-seat': {
    label: 'Kinder, Familienfreundlich, Spielplatz',
    group: 'unterwegs',
    svg: c(7.25, 4.5, 1.75) + c(13.75, 7.25, 1.25) + p('M7.25 7v4.75L5 16.75M7.25 11.75l2.25 5M4.5 9l2.75-1 3 1.5M13.75 9.25v3.25l-1.5 4.25M13.75 12.5l1.5 4.25'),
  },

  /* ---------- Alltag ---------- */
  phone: {
    label: 'Telefon, Anruf, Kontakt',
    group: 'alltag',
    svg: p('M4.75 2.75h2.5l1.25 3.75-1.75 1.25a9 9 0 0 0 5.5 5.5l1.25-1.75 3.75 1.25v2.5a1.5 1.5 0 0 1-1.5 1.5A13.5 13.5 0 0 1 3.25 4.25a1.5 1.5 0 0 1 1.5-1.5z'),
  },
  mail: { label: 'E-Mail, Post, Brief, Kontakt', group: 'alltag', svg: r(2.75, 4.25, 14.5, 11.5, 1.5) + p('M3.25 5 10 10.75 16.75 5') },
  chat: {
    label: 'Nachricht, Chat, Beratung, WhatsApp',
    group: 'alltag',
    svg: p('M10 3.25c3.95 0 7.25 2.7 7.25 6s-3.3 6-7.25 6a8.6 8.6 0 0 1-2.4-.35L3.5 16.5l1.1-3.25A5.6 5.6 0 0 1 2.75 9.25c0-3.3 3.3-6 7.25-6z'),
  },
  clock: { label: 'Uhr, Zeit, Öffnungszeiten, Dauer', group: 'alltag', svg: c(10, 10, 7.25) + p('M10 6v4l2.75 1.75') },
  calendar: {
    label: 'Kalender, Termin, Datum, Reservation',
    group: 'alltag',
    svg: r(2.75, 4.25, 14.5, 13, 1.5) + p('M2.75 8.25h14.5M6.5 2.75v3M13.5 2.75v3M6.5 11.5h1M9.5 11.5h1M12.5 11.5h1M6.5 14.25h1M9.5 14.25h1'),
  },
  people: {
    label: 'Team, Leute, Gruppe, Verein',
    group: 'alltag',
    svg: c(7.25, 6.75, 2.75) + p('M2.25 16.25c.5-3 2.5-4.75 5-4.75s4.5 1.75 5 4.75') + p('M12.5 4.25a2.75 2.75 0 0 1 0 5.25M14.25 11.75c1.75.5 3 2 3.5 4.5'),
  },
  person: { label: 'Person, Kunde, Profil', group: 'alltag', svg: c(10, 6.25, 3.25) + p('M3.75 17.25c.75-3.75 3.25-5.75 6.25-5.75s5.5 2 6.25 5.75') },
  handshake: {
    label: 'Partnerschaft, Vertrauen, Zusammenarbeit, Handschlag',
    group: 'alltag',
    svg:
      p('M2.25 8.75 5 6l3 1.25L10.5 6l2.25.25L17.75 9') +
      p('M17.75 9l-4.5 4.75-1.75 1.75a1.25 1.25 0 0 1-1.75 0L5.25 11l-3-2.25') +
      p('M10.5 6 7.5 9.25a1.25 1.25 0 0 0 1.75 1.75l1.75-1.5 3 3'),
  },
  star: { label: 'Stern, Bewertung, Qualität, Empfehlung', group: 'alltag', svg: p('M10 2.75l2.2 4.6 5.05.6-3.75 3.5.95 5-4.45-2.45-4.45 2.45.95-5-3.75-3.5 5.05-.6z') },
  check: { label: 'Häkchen, Erledigt, Garantie, Ja', group: 'alltag', svg: c(10, 10, 7.25) + p('M6.75 10.25 9 12.5l4.5-5') },
  shield: {
    label: 'Sicherheit, Versicherung, Schutz, Garantie',
    group: 'alltag',
    svg: p('M10 2.75 16.25 5v4.5c0 3.75-2.5 6.5-6.25 7.75C6.25 16 3.75 13.25 3.75 9.5V5z') + p('M7.25 10 9.25 12l3.5-4'),
  },
  award: { label: 'Auszeichnung, Preis, Diplom, Zertifikat', group: 'alltag', svg: c(10, 7.75, 4.75) + p('M7 11.5 5.75 17.25 10 15.25l4.25 2-1.25-5.75') },
  idea: {
    label: 'Idee, Beratung, Konzept, Glühbirne',
    group: 'alltag',
    svg: p('M7.75 14.25h4.5M8.25 17.25h3.5') + p('M7.5 14.25c0-1.75-2.75-3.25-2.75-6.25a5.25 5.25 0 0 1 10.5 0c0 3-2.75 4.5-2.75 6.25'),
  },
  camera: {
    label: 'Kamera, Foto, Fotografie',
    group: 'alltag',
    svg: p('M2.75 6.75a1.5 1.5 0 0 1 1.5-1.5h2l1.5-2h4.5l1.5 2h2a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z') + c(10, 10.5, 3),
  },
  music: { label: 'Musik, Konzert, Note', group: 'alltag', svg: p('M7.25 14.5V4.25l9-1.5v10') + c(5.25, 14.5, 2) + c(14.25, 12.75, 2) + p('M7.25 7.75l9-1.5') },
  ticket: {
    label: 'Ticket, Eintritt, Veranstaltung',
    group: 'alltag',
    svg: p('M2.75 5.25h14.5v3a1.75 1.75 0 0 0 0 3.5v3H2.75v-3a1.75 1.75 0 0 0 0-3.5z') + p('M11.75 5.25v1.5M11.75 9.25v1.5M11.75 13.25v1.5'),
  },
  graduation: {
    label: 'Kurs, Schule, Ausbildung, Weiterbildung',
    group: 'alltag',
    svg: p('M1.75 7.75 10 3.75l8.25 4L10 11.75z') + p('M5.25 9.5v4c1.5 1.5 3 2 4.75 2s3.25-.5 4.75-2v-4M18.25 7.75v4.5'),
  },
  laptop: { label: 'Computer, Online, Digital, Webdesign', group: 'alltag', svg: r(4.25, 4.25, 11.5, 8, 1) + p('M2.25 15.75h15.5l-1.5-3.5H3.75z') },
  globe: {
    label: 'Welt, Sprachen, International',
    group: 'alltag',
    svg: c(10, 10, 7.25) + p('M2.75 10h14.5M10 2.75c2 2 3 4.5 3 7.25s-1 5.25-3 7.25c-2-2-3-4.5-3-7.25s1-5.25 3-7.25z'),
  },
  sparkle: {
    label: 'Neu, Besonders, Glanz',
    group: 'alltag',
    svg:
      p('M10 2.75c.6 3.6 2.15 5.15 5.75 5.75-3.6.6-5.15 2.15-5.75 5.75-.6-3.6-2.15-5.15-5.75-5.75 3.6-.6 5.15-2.15 5.75-5.75z') +
      p('M15.5 13.75c.25 1.25.75 1.75 2 2-1.25.25-1.75.75-2 2-.25-1.25-.75-1.75-2-2 1.25-.25 1.75-.75 2-2z'),
  },
  euro: { label: 'Euro, Preis, Geld', group: 'alltag', svg: c(10, 10, 7.25) + p('M12.75 7a3.5 3.5 0 1 0 0 6M6.25 9h4.5M6.25 11h4.5') },
  franc: { label: 'Franken, CHF, Preis, Geld, Kosten', group: 'alltag', svg: c(10, 10, 7.25) + p('M6.75 13.5v-7h3.5M6.75 10h2.75M12 13.5v-3.75c0-.85.75-1.5 1.75-1.5') },
  document: { label: 'Dokument, Formular, Vertrag, Offerte', group: 'alltag', svg: p('M5.25 2.75h6.5l3.5 3.5v11H5.25z') + p('M11.75 2.75v3.5h3.5M7.75 10h4.5M7.75 13h4.5') },
  lock: { label: 'Schloss, Privat, Sicherheit, Mitglieder', group: 'alltag', svg: r(4.25, 8.75, 11.5, 8.5, 1.5) + p('M6.75 8.75v-2a3.25 3.25 0 0 1 6.5 0v2M10 12v2') },
  info: { label: 'Information, Hinweis, Info', group: 'alltag', svg: c(10, 10, 7.25) + p('M10 9v4.75') + c(10, 6.5, 0.5) },
  quote: { label: 'Zitat, Stimme, Bewertung', group: 'alltag', svg: p('M4 14.25c1.75-.5 3-1.75 3-4V6.5H3.75v3.75H7M11.75 14.25c1.75-.5 3-1.75 3-4V6.5H11.5v3.75h3.25') },
  thumb: {
    label: 'Daumen, Gut, Empfehlung, Zufrieden',
    group: 'alltag',
    svg: p('M6.25 9.25 9 3.5c1.25 0 2 .75 2 2v2.75h4a1.5 1.5 0 0 1 1.5 1.75l-1 5.5a1.5 1.5 0 0 1-1.5 1.25H6.25z') + r(2.75, 9.25, 3.5, 7.5, 0.75),
  },

  /* ---------- Natur & Jahreszeiten ---------- */
  sun: {
    label: 'Sonne, Sommer, Terrasse',
    group: 'natur',
    svg: c(10, 10, 3.25) + p('M10 2.25v1.75M10 16v1.75M2.25 10h1.75M16 10h1.75M4.5 4.5l1.25 1.25M14.25 14.25l1.25 1.25M4.5 15.5l1.25-1.25M14.25 5.75l1.25-1.25'),
  },
  snow: { label: 'Schnee, Winter, Ski', group: 'natur', svg: p('M10 2.75v14.5M3.75 6.4l12.5 7.2M3.75 13.6l12.5-7.2M8.25 3.75 10 5.25l1.75-1.5M8.25 16.25 10 14.75l1.75 1.5') },
  rain: {
    label: 'Regen, Wetter, Schlechtwetter',
    group: 'natur',
    svg: p('M6 12.25h8a3.5 3.5 0 0 0 .25-7 4.5 4.5 0 0 0-8.5 1A3 3 0 0 0 6 12.25z') + p('M7 14.75 6.25 17M10.25 14.75 9.5 17M13.5 14.75l-.75 2.25'),
  },
  tree: {
    label: 'Baum, Natur, Wald, Garten',
    group: 'natur',
    svg:
      p('M10 17.25v-4.5M10 12.75c-3.75 0-6-2-6-4.75 0-2.25 1.5-4 3.25-4.25C7.75 2.75 8.75 2.25 10 2.25s2.25.5 2.75 1.5c1.75.25 3.25 2 3.25 4.25 0 2.75-2.25 4.75-6 4.75z') +
      p('M7.25 17.25h5.5'),
  },
  sprout: {
    label: 'Bio, Nachhaltig, Wachstum, Regional',
    group: 'natur',
    svg: p('M10 17.25V10.5') + p('M10 10.5c0-3.25-2-5-5.25-5 0 3.25 2 5 5.25 5zM10 9c0-3 1.75-4.75 5.25-4.75 0 3-1.75 4.75-5.25 4.75z'),
  },
  water: {
    label: 'Wellen, See, Fluss, Schwimmen',
    group: 'natur',
    svg: p('M2.75 7.75c1.2-1 2.4-1 3.6 0s2.45 1 3.65 0 2.4-1 3.6 0 2.45 1 3.65 0M2.75 12.25c1.2-1 2.4-1 3.6 0s2.45 1 3.65 0 2.4-1 3.6 0 2.45 1 3.65 0'),
  },
  apple: {
    label: 'Apfel, Obst, Früchte, Gesund',
    group: 'natur',
    svg:
      p('M10 6.75c-1-.75-2-1-3-1-2.25 0-3.75 2-3.75 4.5 0 3.5 2.5 7 4.5 7 .75 0 1.5-.5 2.25-.5s1.5.5 2.25.5c2 0 4.5-3.5 4.5-7 0-2.5-1.5-4.5-3.75-4.5-1 0-2 .25-3 1z') +
      p('M10 6.75c0-2 .75-3.25 2.25-4'),
  },
  grapes: {
    label: 'Trauben, Weinbau, Winzer',
    group: 'natur',
    svg: c(8, 8.25, 1.75) + c(12, 8.25, 1.75) + c(10, 11.5, 1.75) + c(6.25, 11.5, 1.6) + c(13.75, 11.5, 1.6) + c(10, 14.75, 1.75) + p('M10 6.5V3.25l2-.5'),
  },
  paw: {
    label: 'Tiere, Tierarzt, Pfote, Haustiere',
    group: 'natur',
    svg:
      p('M10 10.25c2.25 0 4.25 2.5 4.25 4.5 0 1.25-1 2-2.25 2-.75 0-1.25-.5-2-.5s-1.25.5-2 .5c-1.25 0-2.25-.75-2.25-2 0-2 2-4.5 4.25-4.5z') +
      c(7.75, 5.25, 1.4) +
      c(12.25, 5.25, 1.4) +
      c(4.5, 8.75, 1.3) +
      c(15.5, 8.75, 1.3),
  },
  moon: { label: 'Mond, Abend, Nacht, Spät', group: 'natur', svg: p('M15.75 12.25A6.75 6.75 0 0 1 7.75 3a6.75 6.75 0 1 0 8 9.25z') },
};

export const isSiteIcon = (v: unknown): v is string => typeof v === 'string' && Object.hasOwn(SITE_ICONS, v);

/** The icon as inline SVG for the website (decorative: the text next to it carries the meaning). */
export function siteIconSvg(name: unknown, cls = 'ico'): string {
  if (!isSiteIcon(name)) return '';
  return `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SITE_ICONS[name].svg}</svg>`;
}
