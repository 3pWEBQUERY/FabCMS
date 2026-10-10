/**
 * Starter templates per Sparte, three each. The setup assistant offers every
 * template of the first chosen Sparte; each comes with the two styles it was
 * written for.
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
  { id: 'schreinerei', sector: 'trade', name: 'Schreinerei', description: 'Leistungen mit Preisen, Referenzen, Offerte.', themes: ['kante', 'bistro'] },
  { id: 'maler', sector: 'trade', name: 'Malergeschäft', description: 'Arbeiten, Ablauf eines Auftrags, Offerte mit Fotos.', themes: ['bistro', 'kante'] },
  { id: 'gartenbau', sector: 'trade', name: 'Gartenbau', description: 'Leistungen, Zahlen, Gärten, Beratung vor Ort.', themes: ['feuilleton', 'bistro'] },
  { id: 'coiffeur', sector: 'studio', name: 'Coiffeur', description: 'Preise, Team, Termine online.', themes: ['salon', 'bistro'] },
  { id: 'kosmetik', sector: 'studio', name: 'Kosmetikstudio', description: 'Behandlungen, Hautanalyse, Termine online.', themes: ['salon', 'kante'] },
  { id: 'barber', sector: 'studio', name: 'Barbershop', description: 'Preisliste, Öffnungszeiten, Termin ohne Wartezeit.', themes: ['kante', 'bistro'] },
  { id: 'physio', sector: 'practice', name: 'Physiotherapie', description: 'Angebot, Kurse, Termine online.', themes: ['feuilleton', 'kante'] },
  { id: 'psychotherapie', sector: 'practice', name: 'Psychotherapie', description: 'Arbeitsweise, Kosten, Erstgespräch.', themes: ['feuilleton', 'bistro'] },
  { id: 'zahnarzt', sector: 'practice', name: 'Zahnarztpraxis', description: 'Behandlungen, Notfall, Team, Termine.', themes: ['kante', 'feuilleton'] },
  { id: 'seehotel', sector: 'hotel', name: 'Hotel', description: 'Zimmer, Frühstück, Anfrage.', themes: ['salon', 'bistro'] },
  { id: 'ferienwohnung', sector: 'hotel', name: 'Ferienwohnung', description: 'Ausstattung, Saisonpreise, Anfrage.', themes: ['bistro', 'feuilleton'] },
  { id: 'bnb', sector: 'hotel', name: 'Bed & Breakfast', description: 'Zimmer, Frühstück, Gästestimmen.', themes: ['feuilleton', 'salon'] },
  { id: 'sportverein', sector: 'club', name: 'Sportverein', description: 'Anlässe, Neuigkeiten, Mitglied werden.', themes: ['kante', 'bistro'] },
  { id: 'musikverein', sector: 'club', name: 'Musikverein', description: 'Konzerte mit Tickets, Vorstand, Mitspielen.', themes: ['feuilleton', 'kante'] },
  { id: 'fussball', sector: 'club', name: 'Fussballclub', description: 'Trainingszeiten, Spiele, Sponsoren.', themes: ['kante', 'bistro'] },
  { id: 'hilfsverein', sector: 'nonprofit', name: 'Gemeinnütziger Verein', description: 'Wirkung in Zahlen, Spendenaktion, Newsletter.', themes: ['feuilleton', 'kante'] },
  { id: 'tierheim', sector: 'nonprofit', name: 'Tierheim', description: 'Mithelfen, Patenschaft, Spendenaktion.', themes: ['bistro', 'feuilleton'] },
  { id: 'stiftung', sector: 'nonprofit', name: 'Förderstiftung', description: 'Förderbereiche, Ablauf, Gesuch einreichen.', themes: ['kante', 'feuilleton'] },
  { id: 'verwaltung', sector: 'realestate', name: 'Immobilienverwaltung', description: 'Angebote, Leistungen, Kontakt.', themes: ['kante', 'feuilleton'] },
  { id: 'makler', sector: 'realestate', name: 'Immobilienmakler', description: 'Objekte zum Kauf, Verkaufsablauf, Bewertung.', themes: ['salon', 'kante'] },
  { id: 'genossenschaft', sector: 'realestate', name: 'Wohnbaugenossenschaft', description: 'Freie Wohnungen, Vermietungsregeln, Anteilscheine.', themes: ['feuilleton', 'kante'] },
  { id: 'erotik-studio', sector: 'adult', name: 'Studio', description: 'Wer heute da ist, Hausregeln, Öffnungszeiten.', themes: ['salon', 'kante'] },
  { id: 'massage', sector: 'adult', name: 'Massagestudio', description: 'Angebot mit Preisen, Profile, Regeln.', themes: ['salon', 'feuilleton'] },
  { id: 'begleitagentur', sector: 'adult', name: 'Begleitagentur', description: 'Profile, Ablauf einer Buchung, Anfrage.', themes: ['kante', 'salon'] },
];

export const templatesFor = (sector: string) => TEMPLATES.filter((t) => t.sector === sector);
