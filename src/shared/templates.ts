/**
 * Starter templates per Sparte. The setup assistant offers every template of
 * the first chosen Sparte; each comes with the two styles it was written for.
 * Sparten without an entry here get their single default seed.
 */
export interface TemplateDef {
  id: string;
  sector: string;
  name: string;
  description: string;
  themes: [string, string];
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'wirtshaus', sector: 'restaurant', name: 'Wirtshaus', description: 'Saisonale Karte, Team, Tisch reservieren.', themes: ['bistro', 'kante'] },
  { id: 'fine-dining', sector: 'restaurant', name: 'Fine Dining', description: 'Menü in Gängen, Tisch reservieren, Gutscheine.', themes: ['salon', 'feuilleton'] },
  { id: 'cafe', sector: 'restaurant', name: 'Café & Bäckerei', description: 'Vitrine, Öffnungszeiten, Vorbestellung.', themes: ['bistro', 'kante'] },
  { id: 'manufaktur', sector: 'shop', name: 'Manufaktur', description: 'Beliebte Produkte, Versand, häufige Fragen.', themes: ['kante', 'bistro'] },
  { id: 'boutique', sector: 'shop', name: 'Mode-Boutique', description: 'Kollektion, Grössentabelle, Pflegehinweise.', themes: ['salon', 'kante'] },
  { id: 'hofladen', sector: 'shop', name: 'Hofladen', description: 'Wochenangebot, Herkunft, Öffnungszeiten am Hof.', themes: ['bistro', 'feuilleton'] },
  { id: 'journal', sector: 'blog', name: 'Persönliches Journal', description: 'Notizen und Fundstücke, Newsletter.', themes: ['feuilleton', 'kante'] },
  { id: 'reise', sector: 'blog', name: 'Reiseblog', description: 'Reiseberichte, Zahlen zur Reise, Newsletter.', themes: ['feuilleton', 'bistro'] },
  { id: 'fach', sector: 'blog', name: 'Fachblog', description: 'Ratgeber zu einem Fachgebiet, Newsletter, Beratung.', themes: ['kante', 'feuilleton'] },
  { id: 'treuhand', sector: 'landing', name: 'Dienstleistung', description: 'Leistungen, Zahlen, Erstgespräch vereinbaren.', themes: ['kante', 'feuilleton'] },
  { id: 'coaching', sector: 'landing', name: 'Coaching', description: 'Ablauf in Schritten, Stimmen, Kennenlerngespräch.', themes: ['salon', 'feuilleton'] },
  { id: 'produkt', sector: 'landing', name: 'Produktlancierung', description: 'Ein Produkt, Vergleich, Fragen, Warteliste.', themes: ['kante', 'bistro'] },
  { id: 'studio', sector: 'portfolio', name: 'Designstudio', description: 'Ausgewählte Arbeiten, Kunden, Anfrage.', themes: ['kante', 'feuilleton'] },
  { id: 'fotografie', sector: 'portfolio', name: 'Fotografie', description: 'Ausgewählte Arbeiten, Angebot, Termin anfragen.', themes: ['salon', 'kante'] },
  { id: 'architektur', sector: 'portfolio', name: 'Architekturbüro', description: 'Projekte, Vorgehen, Büro, Kontakt.', themes: ['feuilleton', 'kante'] },
];

export const templatesFor = (sector: string) => TEMPLATES.filter((t) => t.sector === sector);
