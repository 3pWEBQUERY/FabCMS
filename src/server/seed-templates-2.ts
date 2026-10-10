import { shortId } from '../shared/text';
import { b, f, contactForm, contactPage, type Seed } from './seed-kit';

/**
 * The second and third template of the other Sparten (Handwerk, Studio,
 * Praxis, Hotel, Verein, Non-Profit, Immobilien, Erotik). Same rules as
 * seed-templates.ts: realistic Swiss examples, written to be replaced.
 */

const nav = (...items: [string, string][]) => items.map(([label, href]) => ({ id: shortId(), label, href }));
const day = (offset: number, time: string) => `${new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)}T${time}`;
const today = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const post = (title: string, excerpt: string, category: string, body: string, offset: number) => ({
  collection: 'posts',
  data: { title, excerpt, category, tags: [], date: today(offset), allowComments: false, blocks: [b('text', { heading: '', body })] },
});
const project = (title: string, client: string, category: string, summary: string, year = 2025) => ({
  collection: 'projects',
  data: { title, client, year, category, summary, images: [] },
});
const offerForm = (topics: string[]) => ({
  key: 'offerte',
  name: 'Offerte',
  submit: 'Anfrage senden',
  success: 'Danke! Wir schauen uns Ihre Angaben an und melden uns innert zwei Arbeitstagen.',
  fields: [
    f('select', 'Worum geht es?', true, { options: topics }),
    f('textarea', 'Beschreibung', true, { placeholder: 'Räume, Flächen, Termine, Wünsche …' }),
    f('file', 'Fotos'),
    f('step', 'Kontaktangaben'),
    f('text', 'Name', true),
    f('email', 'E-Mail', true),
    f('tel', 'Telefon'),
    f('text', 'Ort des Auftrags'),
  ],
});

/* ---------- Handwerk ---------- */

export function painter(): Seed {
  return {
    tagline: 'Farbe, Putz und saubere Kanten',
    footer: 'Malerei und Gipserei · Offerten kostenlos und innert einer Woche.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Maler & Gipser',
        title: 'Wir streichen so, dass Sie danach nichts abdecken müssen.',
        text: 'Wohnungen, Treppenhäuser, Fassaden. Wir räumen auf, bevor wir gehen – und kommen zur Abnahme mit Ihnen zusammen.',
        primary: { label: 'Offerte anfragen', href: '/offerte' },
        secondary: { label: 'Referenzen', href: '/arbeiten' },
      }),
      b('columns', {
        heading: 'Was wir machen',
        count: '3',
        items: [
          { title: 'Innenräume', text: 'Wände, Decken, Türen und Heizkörper – auch bewohnt, Raum für Raum.', icon: 'roller' },
          { title: 'Fassaden', text: 'Reinigen, ausbessern, streichen. Mit Gerüst aus einer Hand.', icon: 'house' },
          { title: 'Gipserarbeiten', text: 'Risse, Weissputz, Trockenbau und Akustikdecken.', icon: 'brush' },
        ],
      }),
      b('timeline', {
        heading: 'So läuft ein Auftrag',
        items: [
          { when: 'Tag 1', title: 'Besichtigung', text: 'Wir schauen uns die Räume an und besprechen Farben und Termine.' },
          { when: 'Innert einer Woche', title: 'Offerte', text: 'Mit festem Preis pro Raum. Was nicht drinsteht, kostet nichts.' },
          { when: 'Nach Abmachung', title: 'Ausführung', text: 'Möbel schieben, abdecken, streichen. Abends ist alles begehbar.' },
          { when: 'Zum Schluss', title: 'Abnahme', text: 'Wir gehen mit Ihnen durch und bessern sofort nach, was nicht passt.' },
        ],
      }),
      b('projects', { heading: 'Zuletzt fertig', count: 3, filter: false }),
      b('testimonials', {
        items: [{ quote: 'Drei Zimmer in zwei Tagen, und am Abend stand jedes Möbel wieder an seinem Platz.', name: 'Ruth Meier', role: 'Wohnung in Uster' }],
      }),
      b(
        'cta',
        {
          heading: 'Neue Farbe gefällig?',
          text: 'Schicken Sie uns zwei, drei Fotos – das reicht für eine erste Schätzung.',
          primary: { label: 'Offerte anfragen', href: '/offerte' },
        },
        { tone: 'accent' },
      ),
    ],
    pages: [
      { slug: 'offerte', title: 'Offerte', blocks: [b('form', { heading: 'Offerte anfragen', intro: 'Fotos der Räume helfen uns sehr.', form: '@form:offerte' })] },
      contactPage(),
    ],
    nav: nav(['Referenzen', '/arbeiten'], ['Offerte', '/offerte'], ['Kontakt', '/kontakt']),
    forms: [contactForm, offerForm(['Innenräume', 'Fassade', 'Gipserarbeiten', 'Anderes'])],
    entries: [
      project('Treppenhaus Mehrfamilienhaus', 'Verwaltung Lindenhof', 'Innenräume', 'Vier Stockwerke in fünf Tagen, ohne dass jemand ausziehen musste.'),
      project('Fassade Bauernhaus', 'Familie Kägi', 'Fassaden', 'Kalkfarbe auf altem Putz – atmungsaktiv, wie es das Haus braucht.'),
      project('Akustikdecke Schulzimmer', 'Gemeinde Fehraltorf', 'Gipserarbeiten', 'Weniger Hall, mehr Ruhe – in den Sommerferien eingebaut.', 2024),
    ],
  };
}

export function gardener(): Seed {
  return {
    tagline: 'Gärten, die mit den Jahren schöner werden',
    footer: 'Gartenbau und Gartenpflege · Beratung vor Ort, auch für kleine Gärten.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Gartenbau',
        title: 'Wir bauen Gärten, die mit wenig Pflege viel Freude machen.',
        text: 'Einheimische Pflanzen, Natursteine aus der Region und ein Plan, der auch in zehn Jahren noch aufgeht.',
        primary: { label: 'Beratung anfragen', href: '/offerte' },
        secondary: { label: 'Gärten ansehen', href: '/arbeiten' },
      }),
      b('list', {
        heading: 'Leistungen',
        style: 'rows',
        items: [
          { title: 'Gartenplanung', text: 'Bestandesaufnahme, Plan und Pflanzenliste.', meta: 'ab CHF 900' },
          { title: 'Neuanlage und Umbau', text: 'Wege, Mauern, Teiche, Bepflanzung.', meta: 'nach Offerte' },
          { title: 'Gartenpflege im Abo', text: 'Schnitt, Jäten, Rasen – vier bis acht Einsätze im Jahr.', meta: 'ab CHF 85 / Std.' },
        ],
      }),
      b('stats', {
        heading: '',
        items: [
          { value: '1996', label: 'gegründet' },
          { value: '14', label: 'Mitarbeitende, davon 3 Lernende' },
          { value: '80 %', label: 'einheimische Pflanzen' },
        ],
      }),
      b('projects', { heading: 'Gärten', count: 4, filter: true }),
      b('faq', {
        heading: 'Gut zu wissen',
        items: [
          { q: 'Wann ist die beste Zeit zum Pflanzen?', a: '<p>Für die meisten Gehölze der Herbst. Geplant wird am besten schon im Sommer.</p>' },
          { q: 'Machen Sie auch kleine Aufträge?', a: '<p>Ja – auch einen Baumschnitt oder eine Hecke. Für die Pflege gibt es das Abo.</p>' },
        ],
      }),
      b('cta', { heading: 'Ein Garten mit Plan?', primary: { label: 'Beratung anfragen', href: '/offerte' } }, { tone: 'muted' }),
    ],
    pages: [
      {
        slug: 'offerte',
        title: 'Beratung',
        blocks: [b('form', { heading: 'Beratung anfragen', intro: 'Wir kommen vorbei, schauen uns den Garten an und melden uns mit Ideen.', form: '@form:offerte' })],
      },
      contactPage(),
    ],
    nav: nav(['Gärten', '/arbeiten'], ['Beratung', '/offerte'], ['Kontakt', '/kontakt']),
    forms: [contactForm, offerForm(['Gartenplanung', 'Neuanlage oder Umbau', 'Gartenpflege', 'Baum- oder Heckenschnitt'])],
    entries: [
      project('Naturgarten am Hang', 'Privat, Meilen', 'Neuanlage', 'Trockenmauern aus Bollensteinen, Wildstauden und ein Weg, der dem Hang folgt.'),
      project('Innenhof Altstadt', 'Stockwerkeigentümer Grabengasse', 'Umbau', 'Aus Kies und Thuja wurde ein schattiger Hof mit Farnen und einer Bank.'),
      project('Schulgarten', 'Primarschule Aesch', 'Neuanlage', 'Hochbeete zum Ernten und eine Blumenwiese für die Pause.', 2024),
    ],
  };
}

/* ---------- Coiffeur, Kosmetik, Studio ---------- */

export function beauty(): Seed {
  return {
    tagline: 'Hautpflege mit Zeit und Ruhe',
    footer: 'Kosmetikstudio · Termine online oder per Telefon.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Kosmetik',
        title: 'Eine Stunde nur für Ihre Haut.',
        text: 'Wir beginnen jede Behandlung mit einer Hautanalyse – und empfehlen nur, was Sie wirklich brauchen.',
        primary: { label: 'Termin buchen', href: '/termin' },
        secondary: { label: 'Behandlungen', href: '#behandlungen' },
      }),
      b(
        'list',
        {
          heading: 'Behandlungen',
          style: 'rows',
          items: [
            { title: 'Gesichtsbehandlung klassisch', text: 'Reinigung, Peeling, Massage, Maske', meta: '75 Min · 145.–' },
            { title: 'Gesichtsbehandlung kurz', text: 'Für zwischendurch', meta: '45 Min · 95.–' },
            { title: 'Wimpern und Brauen färben', text: '', meta: '30 Min · 45.–' },
            { title: 'Maniküre', text: 'Mit Lack nach Wahl', meta: '45 Min · 65.–' },
          ],
        },
        { anchor: 'behandlungen' },
      ),
      b('columns', {
        heading: 'Bei uns',
        count: '3',
        items: [
          { title: 'Hautanalyse', text: 'Vor der ersten Behandlung, ohne Aufpreis.', icon: 'lotion' },
          { title: 'Ruhige Räume', text: 'Zwei Kabinen, kein Durchgang, keine Musik aus dem Radio.', icon: 'spa' },
          { title: 'Schweizer Pflege', text: 'Produkte einer kleinen Manufaktur aus dem Emmental.', icon: 'swiss-cross' },
        ],
      }),
      b('people', { heading: 'Ihre Kosmetikerinnen', items: [{ name: 'Nadia', role: 'Inhaberin, eidg. dipl. Kosmetikerin', text: 'Seit 2011 im Beruf.', image: null }] }),
      b('hours', { heading: 'Öffnungszeiten' }),
    ],
    pages: [
      {
        slug: 'termin',
        title: 'Termin',
        blocks: [
          b('booking', { heading: 'Termin buchen', intro: 'Bitte kommen Sie ungeschminkt zur Gesichtsbehandlung.' }),
          b('contact', { heading: 'Lieber anrufen?', showHours: true }),
        ],
      },
      contactPage(),
    ],
    nav: nav(['Behandlungen', '/#behandlungen'], ['Termin', '/termin'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Gesichtsbehandlung klassisch', description: 'Reinigung, Peeling, Massage, Maske.', duration: 75, buffer: 15, price: 145 },
        { name: 'Gesichtsbehandlung kurz', description: 'Für zwischendurch.', duration: 45, buffer: 15, price: 95 },
        { name: 'Wimpern und Brauen färben', duration: 30, buffer: 10, price: 45 },
        { name: 'Maniküre', duration: 45, buffer: 10, price: 65 },
      ],
      resources: [{ name: 'Nadia', kind: 'staff', capacity: 1 }],
    },
    entries: [],
  };
}

export function barber(): Seed {
  return {
    tagline: 'Schnitt und Bart, ohne Wartezeit',
    footer: 'Barbershop · Online buchen und pünktlich drankommen.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Barbershop',
        title: 'Buchen, kommen, sitzen. Keine Wartenummer.',
        text: 'Klassischer Herrenschnitt, Fade und Bartpflege mit heissem Tuch. Am Samstag ab 8 Uhr.',
        primary: { label: 'Termin buchen', href: '/termin' },
      }),
      b('table', {
        heading: 'Preise',
        h1: 'Leistung',
        h2: 'Dauer',
        h3: 'Preis',
        h4: '',
        right: true,
        note: 'Bezahlen mit Karte, TWINT oder bar.',
        rows: [
          { a: 'Haarschnitt', b: '30 Min', c: '45.–' },
          { a: 'Fade', b: '40 Min', c: '52.–' },
          { a: 'Bart trimmen', b: '20 Min', c: '30.–' },
          { a: 'Rasur mit heissem Tuch', b: '30 Min', c: '42.–' },
          { a: 'Schnitt und Bart', b: '50 Min', c: '70.–' },
        ],
      }),
      b('quote', { quote: 'Endlich ein Laden, in dem der Termin um 12 Uhr auch um 12 Uhr beginnt.', name: 'Marco', role: 'Stammkunde' }),
      b('hours', { heading: 'Offen' }),
      b('cta', { heading: 'Heute noch frei?', primary: { label: 'Freie Zeiten ansehen', href: '/termin' } }, { tone: 'inverse' }),
    ],
    pages: [{ slug: 'termin', title: 'Termin', blocks: [b('booking', { heading: 'Termin buchen', intro: 'Wähle Leistung und Zeit. Bestätigung per E-Mail.' })] }, contactPage()],
    nav: nav(['Termin', '/termin'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Haarschnitt', duration: 30, buffer: 5, price: 45 },
        { name: 'Fade', duration: 40, buffer: 5, price: 52 },
        { name: 'Bart trimmen', duration: 20, buffer: 5, price: 30 },
        { name: 'Rasur mit heissem Tuch', duration: 30, buffer: 5, price: 42 },
        { name: 'Schnitt und Bart', duration: 50, buffer: 10, price: 70 },
      ],
      resources: [
        { name: 'Deniz', kind: 'staff', capacity: 1 },
        { name: 'Joel', kind: 'staff', capacity: 1 },
      ],
    },
    entries: [],
  };
}

/* ---------- Praxis & Therapie ---------- */

export function psychotherapy(): Seed {
  return {
    tagline: 'Psychotherapie für Erwachsene',
    footer: 'Praxis für Psychotherapie · Termine nach Vereinbarung, auch am frühen Abend.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Psychotherapie',
        title: 'Manchmal hilft es, mit jemandem zu reden, der nicht dazugehört.',
        text: 'Ich begleite Erwachsene in schwierigen Lebenslagen – bei Erschöpfung, Ängsten, Trauer oder wenn sich vieles festgefahren anfühlt.',
        primary: { label: 'Erstgespräch vereinbaren', href: '/termin' },
      }),
      b('text', {
        heading: 'Wie ich arbeite',
        body: '<p>Im ersten Gespräch klären wir, was Sie herführt und ob die Zusammenarbeit passt. Danach treffen wir uns in der Regel alle ein bis zwei Wochen für 50 Minuten.</p><p>Ich arbeite verhaltenstherapeutisch und systemisch – je nachdem, was Ihnen hilft.</p>',
      }),
      b('faq', {
        heading: 'Kosten',
        items: [
          {
            q: 'Bezahlt die Krankenkasse?',
            a: '<p>Mit einer ärztlichen Anordnung übernimmt die Grundversicherung die Kosten (abzüglich Franchise und Selbstbehalt). Ohne Anordnung rechne ich direkt mit Ihnen ab.</p>',
          },
          { q: 'Was kostet eine Sitzung ohne Anordnung?', a: '<p>CHF 160 für 50 Minuten.</p>' },
          { q: 'Was, wenn ich einen Termin nicht wahrnehmen kann?', a: '<p>Bis 24 Stunden vorher absagen ist kostenlos.</p>' },
        ],
      }),
      b('quote', { quote: 'Alles, was Sie hier erzählen, bleibt hier.', name: 'Dr. phil. Andrea Lüthi', role: 'Eidg. anerkannte Psychotherapeutin' }),
      b('contact', { heading: 'Praxis', showHours: false }),
    ],
    pages: [
      {
        slug: 'termin',
        title: 'Erstgespräch',
        blocks: [
          b('booking', { heading: 'Erstgespräch vereinbaren', intro: 'Das Erstgespräch dauert 50 Minuten. Sie müssen nichts vorbereiten.' }),
          b('contact', { heading: 'Lieber schreiben?', showHours: false }),
        ],
      },
      contactPage('kontakt', 'Nachricht schreiben'),
    ],
    nav: nav(['Erstgespräch', '/termin'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Erstgespräch', description: 'Kennenlernen und Abklärung, 50 Minuten.', duration: 50, buffer: 10 },
        { name: 'Sitzung', description: 'Für laufende Therapien.', duration: 50, buffer: 10 },
      ],
      resources: [{ name: 'Andrea Lüthi', kind: 'staff', capacity: 1 }],
    },
    entries: [],
  };
}

export function dentist(): Seed {
  return {
    tagline: 'Zahnmedizin für die ganze Familie',
    footer: 'Zahnarztpraxis · Notfälle während der Öffnungszeiten am gleichen Tag.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Zahnarztpraxis',
        title: 'Gesunde Zähne, ruhig erklärt.',
        text: 'Wir zeigen Ihnen vor jeder Behandlung, was wir sehen, was es kostet und welche Möglichkeiten es gibt.',
        primary: { label: 'Termin buchen', href: '/termin' },
        secondary: { label: 'Notfall', href: '#notfall' },
      }),
      b(
        'notice',
        { text: 'Zahnschmerzen? Rufen Sie an – Notfälle behandeln wir während der Öffnungszeiten am gleichen Tag.', tone: 'accent', link: { label: 'Anrufen', href: '/kontakt' } },
        { anchor: 'notfall' },
      ),
      b('columns', {
        heading: 'Behandlungen',
        count: '3',
        items: [
          { title: 'Kontrolle und Prophylaxe', text: 'Jährliche Kontrolle, Dentalhygiene, Beratung.', icon: 'tooth' },
          { title: 'Kinderzahnmedizin', text: 'Erste Besuche spielerisch, mit Zeit für Fragen der Eltern.', icon: 'teddy' },
          { title: 'Ästhetik', text: 'Bleaching, Veneers und unsichtbare Zahnspangen.', icon: 'sparkle' },
        ],
      }),
      b('people', {
        heading: 'Team',
        items: [
          { name: 'Dr. med. dent. Lukas Graf', role: 'Zahnarzt', text: '', image: null },
          { name: 'Petra Brun', role: 'Dentalhygienikerin HF', text: '', image: null },
        ],
      }),
      b('faq', {
        heading: 'Gut zu wissen',
        items: [
          {
            q: 'Bezahlt die Krankenkasse?',
            a: '<p>Zahnbehandlungen zahlen Sie in der Schweiz in der Regel selbst oder über eine Zusatzversicherung. Vorher erhalten Sie einen Kostenvoranschlag.</p>',
          },
          { q: 'Kann ich in Raten zahlen?', a: '<p>Bei grösseren Behandlungen ja – sprechen Sie uns an.</p>' },
        ],
      }),
      b('hours'),
    ],
    pages: [
      {
        slug: 'termin',
        title: 'Termin',
        blocks: [b('booking', { heading: 'Termin buchen', intro: 'Für Schmerzen bitte anrufen statt buchen.' }), b('contact', { heading: 'Praxis', showHours: true })],
      },
      contactPage(),
    ],
    nav: nav(['Termin', '/termin'], ['Notfall', '/#notfall'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Kontrolle', description: 'Untersuchung und Beratung.', duration: 30, buffer: 10 },
        { name: 'Dentalhygiene', description: 'Reinigung und Politur.', duration: 60, buffer: 10, price: 180 },
        { name: 'Kinderkontrolle', description: 'Bis 16 Jahre.', duration: 20, buffer: 10 },
      ],
      resources: [
        { name: 'Dr. Lukas Graf', kind: 'staff', capacity: 1 },
        { name: 'Petra Brun', kind: 'staff', capacity: 1 },
      ],
    },
    entries: [],
  };
}

/* ---------- Hotel & Ferienwohnung ---------- */

const stayForm = (rooms: string[]) => ({
  key: 'anfrage',
  name: 'Buchungsanfrage',
  submit: 'Anfrage senden',
  success: 'Danke! Wir melden uns innert 24 Stunden mit Verfügbarkeit und Preis.',
  fields: [
    f('date', 'Anreise', true),
    f('date', 'Abreise', true),
    ...(rooms.length ? [f('select', 'Zimmer', false, { options: rooms })] : []),
    f('select', 'Personen', true, { options: ['1', '2', '3', '4', '5', '6'] }),
    f('text', 'Name', true),
    f('email', 'E-Mail', true),
    f('textarea', 'Wünsche'),
  ],
});

export function holidayFlat(): Seed {
  return {
    tagline: 'Ferienwohnung mit Blick auf die Berge',
    footer: 'Ferienwohnung · Mindestaufenthalt drei Nächte, im Winter eine Woche.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Ferienwohnung',
        title: 'Drei Zimmer, ein Balkon und das ganze Tal vor dem Fenster.',
        text: 'Für bis zu sechs Personen, fünf Minuten zur Talstation. Im Sommer starten die Wanderwege direkt vor dem Haus.',
        primary: { label: 'Verfügbarkeit anfragen', href: '/anfrage' },
      }),
      b('columns', {
        heading: 'Ausstattung',
        count: '4',
        items: [
          { title: 'Drei Schlafzimmer', text: 'Zwei Doppelbetten, zwei Einzelbetten, Bettwäsche inklusive.', icon: 'bed' },
          { title: 'WLAN', text: 'Glasfaser – auch für Arbeit aus den Ferien.', icon: 'wifi' },
          { title: 'Parkplatz', text: 'Ein gedeckter Platz direkt beim Eingang.', icon: 'parking' },
          { title: 'Skiraum', text: 'Mit Schuhwärmer, im Keller.', icon: 'ski' },
        ],
      }),
      b('table', {
        heading: 'Preise pro Nacht',
        h1: 'Saison',
        h2: 'Zeitraum',
        h3: 'Preis',
        h4: '',
        right: true,
        note: 'Endreinigung CHF 120, Kurtaxe CHF 3.50 pro Person und Nacht.',
        rows: [
          { a: 'Nebensaison', b: 'April bis Juni, Oktober, November', c: '160.–' },
          { a: 'Sommer', b: 'Juli bis September', c: '190.–' },
          { a: 'Winter', b: 'Dezember bis März', c: '240.–' },
        ],
      }),
      b('faq', {
        heading: 'Gut zu wissen',
        items: [
          { q: 'Sind Haustiere erlaubt?', a: '<p>Ein gut erzogener Hund ist willkommen, gegen CHF 15 pro Nacht.</p>' },
          { q: 'Wie kommen wir zum Schlüssel?', a: '<p>Über eine Schlüsselbox – den Code erhalten Sie am Tag vor der Anreise.</p>' },
        ],
      }),
      b('contact', { heading: 'Lage', showHours: false }),
    ],
    pages: [
      { slug: 'anfrage', title: 'Anfrage', blocks: [b('form', { heading: 'Verfügbarkeit anfragen', intro: 'Wir antworten innert 24 Stunden.', form: '@form:anfrage' })] },
      contactPage(),
    ],
    nav: nav(['Anfrage', '/anfrage'], ['Kontakt', '/kontakt']),
    forms: [contactForm, stayForm([])],
    entries: [],
  };
}

export function bedAndBreakfast(): Seed {
  return {
    tagline: 'Drei Zimmer und ein langes Frühstück',
    footer: 'Bed & Breakfast · Check-in ab 16 Uhr, nach Absprache auch später.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Bed & Breakfast',
        title: 'Übernachten wie bei Freunden, die gut kochen.',
        text: 'Drei Zimmer in einem alten Bauernhaus am Dorfrand. Am Morgen gibt es Zopf, Eier von den eigenen Hühnern und so viel Zeit, wie Sie wollen.',
        primary: { label: 'Zimmer anfragen', href: '/anfrage' },
      }),
      b('list', {
        heading: 'Zimmer',
        style: 'rows',
        items: [
          { title: 'Heustock', text: 'Unter dem Dach, Holzbalken, Doppelbett', meta: 'CHF 150 mit Frühstück' },
          { title: 'Gartenzimmer', text: 'Eigener Ausgang in den Garten', meta: 'CHF 140 mit Frühstück' },
          { title: 'Stübli', text: 'Einzelzimmer mit Kachelofen', meta: 'CHF 95 mit Frühstück' },
        ],
      }),
      b('split', {
        eyebrow: 'Frühstück',
        heading: 'Bis zehn Uhr – oder bis die Zeitung gelesen ist.',
        body: '<p>Zopf vom Dorfbeck, Konfitüre aus dem Garten, Käse von der Alp nebenan. Auf Wunsch vegan oder glutenfrei.</p>',
        side: 'right',
      }),
      b('testimonials', {
        items: [
          { quote: 'Das beste Frühstück der ganzen Reise – und die Gastgeberin wusste für jeden Tag einen Ausflug.', name: 'Anna und Tom', role: 'Gäste aus Hamburg' },
          { quote: 'Ruhig, sauber, herzlich. Wir kommen wieder.', name: 'Familie Rossi', role: 'Gäste aus Lugano' },
        ],
      }),
      b('contact', { heading: 'Anreise', showHours: false }),
    ],
    pages: [{ slug: 'anfrage', title: 'Anfrage', blocks: [b('form', { heading: 'Zimmer anfragen', form: '@form:anfrage' })] }, contactPage()],
    nav: nav(['Anfrage', '/anfrage'], ['Kontakt', '/kontakt']),
    forms: [contactForm, stayForm(['Egal', 'Heustock', 'Gartenzimmer', 'Stübli'])],
    entries: [],
  };
}

/* ---------- Verein ---------- */

const joinForm = (extra: ReturnType<typeof f>[] = []) => ({
  key: 'beitritt',
  name: 'Beitritt',
  submit: 'Anmelden',
  success: 'Willkommen! Wir melden uns mit allen Infos.',
  fields: [f('text', 'Name', true), f('email', 'E-Mail', true), f('tel', 'Telefon'), ...extra, f('checkbox', 'Ich möchte den Newsletter erhalten')],
});

export function bandClub(): Seed {
  return {
    tagline: 'Blasmusik seit 1891',
    members: { registration: 'invite' },
    footer: 'Probe jeden Mittwoch, 20 Uhr, in der Mehrzweckhalle.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Musikverein',
        title: 'Vierzig Musikantinnen und Musikanten, ein Dorf und viel Blech.',
        text: 'Wir spielen an Dorffesten, Ständli und zweimal im Jahr im grossen Konzert. Neue Mitglieder – auch Wiedereinsteiger – sind herzlich willkommen.',
        primary: { label: 'Konzerte', href: '/events' },
        secondary: { label: 'Mitspielen', href: '/mitmachen' },
      }),
      b('events', { heading: 'Nächste Auftritte', source: 'events', count: 3 }),
      b('people', {
        heading: 'Vorstand',
        items: [
          { name: 'Beat Furrer', role: 'Präsident', text: '', image: null },
          { name: 'Claudia Moser', role: 'Dirigentin', text: '', image: null },
          { name: 'Reto Ammann', role: 'Kassier', text: '', image: null },
        ],
      }),
      b('posts', { heading: 'Aus dem Verein', count: 3, layout: 'list' }),
      b(
        'cta',
        { heading: 'Lust mitzuspielen?', text: 'Komm an eine Probe – Instrumente zum Ausleihen haben wir.', primary: { label: 'Mitspielen', href: '/mitmachen' } },
        { tone: 'accent' },
      ),
    ],
    pages: [
      {
        slug: 'mitmachen',
        title: 'Mitspielen',
        blocks: [b('form', { heading: 'Mitspielen', intro: 'Sag uns, welches Instrument du spielst – oder lernen möchtest.', form: '@form:beitritt' })],
      },
      {
        slug: 'intern',
        title: 'Intern',
        access: 'members',
        blocks: [b('text', { heading: 'Für Mitglieder', body: '<p>Probeplan, Noten zum Üben und Präsenzliste. Nur für angemeldete Mitglieder sichtbar.</p>' })],
      },
      contactPage(),
    ],
    nav: nav(['Konzerte', '/events'], ['Neuigkeiten', '/journal'], ['Mitspielen', '/mitmachen'], ['Kontakt', '/kontakt']),
    forms: [contactForm, joinForm([f('text', 'Instrument')])],
    entries: [
      {
        collection: 'events',
        data: {
          title: 'Jahreskonzert',
          excerpt: 'Von Marsch bis Filmmusik, mit Tombola und Kuchenbuffet.',
          start: day(30, '19:30'),
          end: day(30, '22:00'),
          venue: 'Mehrzweckhalle',
          category: 'Konzert',
          tickets: [
            { name: 'Erwachsene', price: 2500, capacity: 300, note: 'Freie Platzwahl' },
            { name: 'Kinder bis 16', price: null, capacity: 80, note: 'gratis' },
          ],
          waitlist: true,
          blocks: [b('text', { heading: 'Programm', body: '<p>Beschreibe hier die Stücke und Solistinnen. Türöffnung und Festwirtschaft ab 18 Uhr.</p>' })],
        },
      },
      {
        collection: 'events',
        data: {
          title: 'Ständli am Dorfmarkt',
          excerpt: 'Eine halbe Stunde Musik zwischen den Marktständen.',
          start: day(12, '10:30'),
          venue: 'Dorfplatz',
          category: 'Ständli',
          blocks: [],
        },
      },
      post('Neue Uniformen sind da', 'Nach zwei Jahren Sammeln: Danke an alle Gönnerinnen und Gönner.', 'Vereinsleben', '<p>Erzähl hier, was im Verein los war.</p>', 6),
    ],
  };
}

export function footballClub(): Seed {
  return {
    tagline: 'Fussball für alle Altersklassen',
    members: { registration: 'invite' },
    footer: 'Sportplatz Allmend · Junioren ab 5 Jahren.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Fussballclub',
        title: 'Vom Kinderfussball bis zu den Senioren: Bei uns spielt jede und jeder.',
        text: 'Neun Mannschaften, zwei Plätze und ein Clubhaus mit der besten Bratwurst im Bezirk.',
        primary: { label: 'Probetraining', href: '/mitmachen' },
        secondary: { label: 'Spiele', href: '/events' },
      }),
      b('table', {
        heading: 'Trainingszeiten',
        h1: 'Mannschaft',
        h2: 'Tage',
        h3: 'Zeit',
        h4: '',
        right: false,
        note: 'In den Schulferien nach Absprache mit den Trainern.',
        rows: [
          { a: 'G-Junioren (5–6 J.)', b: 'Mittwoch', c: '13:30–15:00' },
          { a: 'E-Junioren (9–10 J.)', b: 'Dienstag, Donnerstag', c: '17:30–19:00' },
          { a: 'Frauen', b: 'Montag, Mittwoch', c: '19:30–21:00' },
          { a: '1. Mannschaft', b: 'Dienstag, Freitag', c: '19:30–21:15' },
        ],
      }),
      b('events', { heading: 'Nächste Spiele', source: 'events', count: 3 }),
      b('posts', { heading: 'Neuigkeiten', count: 3 }),
      b('logos', { heading: 'Unsere Sponsoren' }),
      b('cta', { heading: 'Mitspielen?', text: 'Probetraining jederzeit, Schuhe mitbringen.', primary: { label: 'Anmelden', href: '/mitmachen' } }, { tone: 'inverse' }),
    ],
    pages: [
      { slug: 'mitmachen', title: 'Probetraining', blocks: [b('form', { heading: 'Probetraining', intro: 'Wir melden uns mit Ort und Zeit.', form: '@form:beitritt' })] },
      contactPage(),
    ],
    nav: nav(['Spiele', '/events'], ['Neuigkeiten', '/journal'], ['Probetraining', '/mitmachen'], ['Kontakt', '/kontakt']),
    forms: [contactForm, joinForm([f('date', 'Geburtsdatum', true), f('select', 'Mannschaft', false, { options: ['Junioren', 'Frauen', 'Herren', 'Senioren', 'Weiss nicht'] })])],
    entries: [
      {
        collection: 'events',
        data: {
          title: 'Heimspiel gegen FC Seefeld',
          excerpt: '3. Liga, Meisterschaft.',
          start: day(5, '16:00'),
          venue: 'Sportplatz Allmend',
          category: 'Meisterschaft',
          blocks: [],
        },
      },
      {
        collection: 'events',
        data: {
          title: 'Juniorenturnier',
          excerpt: '24 Teams, ein Tag Fussball, Festwirtschaft im Clubhaus.',
          start: day(26, '09:00'),
          end: day(26, '17:00'),
          venue: 'Sportplatz Allmend',
          category: 'Turnier',
          tickets: [{ name: 'Teamanmeldung', price: 8000, capacity: 24, note: 'pro Mannschaft' }],
          waitlist: true,
          blocks: [],
        },
      },
      post('Aufstieg der Frauen!', 'Mit einem 3:1 im letzten Spiel in die 3. Liga.', 'Frauen', '<p>Erzähl hier vom Spiel, von der Saison oder vom nächsten Clubanlass.</p>', 3),
    ],
  };
}

/* ---------- Non-Profit ---------- */

export function animalShelter(): Seed {
  return {
    tagline: 'Ein Zuhause für Tiere in Not',
    footer: 'Tierheim · Besuchszeiten Mittwoch bis Samstag, 14–17 Uhr. Gemeinnützig und steuerbefreit.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Tierheim',
        title: 'Jedes Tier hier wartet auf jemanden. Vielleicht auf Sie.',
        text: 'Wir nehmen Katzen, Hunde und Kleintiere auf, pflegen sie gesund und suchen für jedes ein passendes Zuhause.',
        primary: { label: 'Spenden', href: '#spenden' },
        secondary: { label: 'Kontakt', href: '/kontakt' },
      }),
      b('stats', {
        heading: 'Letztes Jahr',
        items: [
          { value: '412', label: 'Tiere aufgenommen' },
          { value: '376', label: 'vermittelt' },
          { value: '58', label: 'Freiwillige' },
        ],
      }),
      b('columns', {
        heading: 'So können Sie helfen',
        count: '3',
        items: [
          { title: 'Ein Tier aufnehmen', text: 'Lernen Sie unsere Tiere bei einem Besuch kennen. Wir beraten Sie ehrlich.', icon: 'cat' },
          { title: 'Gassi gehen', text: 'Freiwillige spazieren mit unseren Hunden – nach einer Einführung.', icon: 'dog' },
          { title: 'Patenschaft', text: 'Ab CHF 20 im Monat für Futter und Tierarzt eines bestimmten Tiers.', icon: 'paw' },
        ],
      }),
      b(
        'donate',
        {
          heading: 'Neue Katzenstation',
          intro: 'Mit 50 000 Franken bauen wir eine Station mit Auslauf für scheue Katzen.',
          campaign: 'Katzenstation',
          goal: 5000000,
          amounts: '30, 50, 100, 250',
          monthly: true,
        },
        { anchor: 'spenden' },
      ),
      b('posts', { heading: 'Aus dem Tierheim', count: 3 }),
      b('newsletter', { heading: 'Neuigkeiten per E-Mail', intro: 'Einmal im Monat: wer neu da ist, wer ein Zuhause gefunden hat.', button: 'Anmelden', askName: false }),
    ],
    pages: [contactPage()],
    nav: nav(['Neuigkeiten', '/journal'], ['Spenden', '/#spenden'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      post('Luna hat ein Zuhause', 'Nach acht Monaten bei uns wohnt Luna jetzt bei einer Familie mit Garten.', 'Vermittelt', '<p>Erzähl hier die Geschichte eines Tiers.</p>', 4),
    ],
  };
}

export function foundation(): Seed {
  return {
    tagline: 'Wir fördern Kultur in der Region',
    footer: 'Gemeinnützige Stiftung · Gesuche laufend, Entscheide viermal im Jahr.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Förderstiftung',
        title: 'Für Projekte, die ohne Unterstützung nicht entstehen würden.',
        text: 'Wir unterstützen Musik, Theater, Literatur und bildende Kunst in der Region – mit Beiträgen zwischen 2 000 und 30 000 Franken.',
        primary: { label: 'Gesuch einreichen', href: '/gesuch' },
      }),
      b('list', {
        heading: 'Was wir fördern',
        style: 'columns',
        items: [
          { title: 'Produktionen', text: 'Konzerte, Theaterstücke, Ausstellungen mit Bezug zur Region.', meta: '' },
          { title: 'Nachwuchs', text: 'Weiterbildungen und erste Projekte junger Kunstschaffender.', meta: '' },
          { title: 'Vermittlung', text: 'Projekte, die Kultur zu Menschen bringen, die selten hingehen.', meta: '' },
        ],
      }),
      b('timeline', {
        heading: 'Vom Gesuch zum Entscheid',
        items: [
          { when: 'Laufend', title: 'Gesuch einreichen', text: 'Mit Projektbeschrieb, Budget und Finanzierungsplan.' },
          { when: 'Innert zwei Wochen', title: 'Eingangsbestätigung', text: 'Wir prüfen, ob alles vollständig ist, und fragen bei Bedarf nach.' },
          { when: 'März, Juni, September, Dezember', title: 'Entscheid', text: 'Der Stiftungsrat entscheidet an seinen Sitzungen.' },
          { when: 'Nach dem Projekt', title: 'Bericht', text: 'Eine Seite und ein paar Bilder genügen.' },
        ],
      }),
      b('faq', {
        heading: 'Häufige Fragen',
        items: [
          { q: 'Wer kann ein Gesuch stellen?', a: '<p>Einzelpersonen, Vereine und Organisationen mit einem Projekt in der Region.</p>' },
          { q: 'Was fördern wir nicht?', a: '<p>Bauprojekte, laufende Betriebskosten und kommerzielle Vorhaben.</p>' },
        ],
      }),
      b('posts', { heading: 'Geförderte Projekte', count: 3 }),
    ],
    pages: [
      { slug: 'gesuch', title: 'Gesuch', blocks: [b('form', { heading: 'Gesuch einreichen', intro: 'Bitte alles als ein PDF anhängen.', form: '@form:gesuch' })] },
      contactPage(),
    ],
    nav: nav(['Gesuch', '/gesuch'], ['Projekte', '/journal'], ['Kontakt', '/kontakt']),
    forms: [
      contactForm,
      {
        key: 'gesuch',
        name: 'Gesuch',
        submit: 'Gesuch senden',
        success: 'Danke! Sie erhalten innert zwei Wochen eine Eingangsbestätigung.',
        fields: [
          f('text', 'Projekttitel', true),
          f('select', 'Sparte', true, { options: ['Musik', 'Theater', 'Literatur', 'Bildende Kunst', 'Vermittlung', 'Anderes'] }),
          f('text', 'Beantragter Betrag (CHF)', true),
          f('file', 'Unterlagen (PDF)', true),
          f('step', 'Kontakt'),
          f('text', 'Name oder Organisation', true),
          f('email', 'E-Mail', true),
          f('tel', 'Telefon'),
        ],
      },
    ],
    entries: [post('Ein Sommer voller Lesungen', 'Zwölf Lesungen in Gartenbeizen – unterstützt mit CHF 8 000.', 'Literatur', '<p>Stell hier ein gefördertes Projekt vor.</p>', 10)],
  };
}

/* ---------- Immobilien ---------- */

export function broker(): Seed {
  return {
    tagline: 'Ihr Haus in guten Händen verkaufen',
    footer: 'Immobilienmakler · Kostenlose Erstbewertung in der ganzen Region.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Immobilienverkauf',
        title: 'Den richtigen Preis finden – und die richtigen Käufer.',
        text: 'Wir bewerten ehrlich, vermarkten sorgfältig und begleiten Sie bis zur Schlüsselübergabe. Honorar nur bei Erfolg.',
        primary: { label: 'Bewertung anfragen', href: '/bewertung' },
        secondary: { label: 'Objekte', href: '/immobilien' },
      }),
      b('properties', { heading: 'Zum Verkauf', count: 3 }),
      b('timeline', {
        heading: 'Ihr Verkauf in fünf Schritten',
        items: [
          { when: '1', title: 'Bewertung', text: 'Besichtigung und Marktwert – schriftlich und begründet.' },
          { when: '2', title: 'Dokumentation', text: 'Fotos, Grundrisse und eine Verkaufsdokumentation, die ehrlich ist.' },
          { when: '3', title: 'Vermarktung', text: 'Auf den grossen Portalen und bei vorgemerkten Interessenten.' },
          { when: '4', title: 'Besichtigungen', text: 'Wir führen durch und prüfen die Finanzierung der Interessenten.' },
          { when: '5', title: 'Beurkundung', text: 'Vertragsentwurf, Notar, Übergabe – wir sind bis zum Schluss dabei.' },
        ],
      }),
      b('testimonials', {
        items: [{ quote: 'Nach sechs Wochen verkauft, zum Preis, den sie uns am Anfang genannt hatten.', name: 'Familie Hug', role: 'Einfamilienhaus in Seuzach' }],
      }),
      b('cta', { heading: 'Was ist Ihre Liegenschaft wert?', primary: { label: 'Kostenlose Bewertung', href: '/bewertung' } }, { tone: 'inverse' }),
    ],
    pages: [
      {
        slug: 'bewertung',
        title: 'Bewertung',
        blocks: [b('form', { heading: 'Kostenlose Bewertung', intro: 'Wir melden uns für einen Besichtigungstermin.', form: '@form:bewertung' })],
      },
      contactPage('kontakt', 'Kontakt'),
    ],
    nav: nav(['Objekte', '/immobilien'], ['Bewertung', '/bewertung'], ['Kontakt', '/kontakt']),
    forms: [
      contactForm,
      {
        key: 'bewertung',
        name: 'Bewertung',
        submit: 'Bewertung anfragen',
        success: 'Danke! Wir melden uns innert zwei Arbeitstagen für einen Termin.',
        fields: [
          f('select', 'Art der Liegenschaft', true, { options: ['Wohnung', 'Einfamilienhaus', 'Mehrfamilienhaus', 'Bauland'] }),
          f('text', 'Adresse', true),
          f('text', 'Zimmer'),
          f('text', 'Wohnfläche in m²'),
          f('step', 'Kontakt'),
          f('text', 'Name', true),
          f('email', 'E-Mail', true),
          f('tel', 'Telefon', true),
        ],
      },
    ],
    entries: [
      {
        collection: 'properties',
        data: {
          title: 'Attikawohnung mit Seesicht',
          excerpt: '4½ Zimmer, 40 m² Terrasse, zwei Einstellplätze.',
          offer: 'buy',
          kind: 'apartment',
          status: 'available',
          availableFrom: 'nach Vereinbarung',
          price: 168000000,
          rooms: 4.5,
          area: 138,
          floor: 'Attika',
          yearBuilt: 2019,
          zip: '8820',
          city: 'Wädenswil',
          features: ['lift', 'view', 'parking', 'balcony'],
          blocks: [b('text', { heading: 'Die Wohnung', body: '<p>Beschreiben Sie hier Grundriss, Ausbau und Umgebung.</p>' })],
        },
      },
      {
        collection: 'properties',
        data: {
          title: 'Reihenhaus mit Werkstatt',
          excerpt: '5½ Zimmer, ruhige Quartierstrasse, Garten nach Süden.',
          offer: 'buy',
          kind: 'house',
          status: 'reserved',
          price: 112000000,
          rooms: 5.5,
          area: 142,
          plot: 310,
          yearBuilt: 1987,
          zip: '8610',
          city: 'Uster',
          features: ['garden', 'parking'],
          blocks: [],
        },
      },
    ],
  };
}

export function cooperative(): Seed {
  return {
    tagline: 'Günstig wohnen, gemeinsam besitzen',
    footer: 'Wohnbaugenossenschaft · 214 Wohnungen in drei Siedlungen.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Wohnbaugenossenschaft',
        title: 'Wohnungen zur Kostenmiete, für Menschen, die bleiben wollen.',
        text: 'Wir bauen und vermieten Wohnungen ohne Gewinnabsicht. Wer bei uns wohnt, ist Mitglied und redet mit.',
        primary: { label: 'Freie Wohnungen', href: '/immobilien' },
      }),
      b('properties', { heading: 'Gerade frei', count: 3 }),
      b('list', {
        heading: 'Vermietungsregeln',
        style: 'numbered',
        items: [
          { title: 'Belegung', text: 'Zimmerzahl höchstens eins mehr als Personen im Haushalt.' },
          { title: 'Einkommen', text: 'Subventionierte Wohnungen nur bis zu einer Einkommensgrenze.' },
          { title: 'Mitgliedschaft', text: 'Wer einzieht, wird Mitglied und zeichnet Anteilscheine.' },
        ],
      }),
      b('faq', {
        heading: 'Häufige Fragen',
        items: [
          { q: 'Wie viel kosten die Anteilscheine?', a: '<p>Je nach Wohnung zwischen CHF 5 000 und CHF 15 000. Sie erhalten das Geld beim Auszug zurück.</p>' },
          { q: 'Gibt es eine Warteliste?', a: '<p>Nein. Freie Wohnungen schreiben wir hier und auf den Portalen aus. Abonnieren Sie den Newsletter, um keine zu verpassen.</p>' },
        ],
      }),
      b('newsletter', { heading: 'Neue Wohnungen per E-Mail', intro: 'Sobald eine Wohnung frei wird.', button: 'Abonnieren', askName: false }),
    ],
    pages: [contactPage('kontakt', 'Kontakt')],
    nav: nav(['Wohnungen', '/immobilien'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      {
        collection: 'properties',
        data: {
          title: '3½-Zimmer-Familienwohnung',
          excerpt: 'Siedlung Sonnenrain, Spielplatz im Hof, Kindergarten nebenan.',
          offer: 'rent',
          kind: 'apartment',
          status: 'available',
          availableFrom: 'ab 1. Februar',
          price: 168000,
          extraCosts: 19000,
          rooms: 3.5,
          area: 82,
          floor: '1. OG',
          yearBuilt: 2008,
          zip: '8004',
          city: 'Zürich',
          features: ['balcony', 'lift', 'washer'],
          blocks: [b('text', { heading: 'Die Wohnung', body: '<p>Anteilscheinkapital CHF 9 000. Beschreiben Sie hier Siedlung und Wohnung.</p>' })],
        },
      },
      {
        collection: 'properties',
        data: {
          title: '1½-Zimmer-Wohnung für ältere Menschen',
          excerpt: 'Hindernisfrei, mit Gemeinschaftsraum und Concierge.',
          offer: 'rent',
          kind: 'apartment',
          status: 'available',
          availableFrom: 'sofort',
          price: 98000,
          extraCosts: 14000,
          rooms: 1.5,
          area: 44,
          floor: 'EG',
          yearBuilt: 2015,
          zip: '8004',
          city: 'Zürich',
          features: ['lift'],
          blocks: [],
        },
      },
    ],
  };
}

/* ---------- Erotikbetrieb ---------- */

export function massageStudio(): Seed {
  return {
    tagline: 'Berührung mit Achtsamkeit',
    footer: 'Massagestudio für Erwachsene · Nur mit Termin. Zutritt ab 18 Jahren.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Massagestudio',
        title: 'Zeit für Berührung – mit klaren Grenzen.',
        text: 'Sinnliche Massagen in ruhigen, gepflegten Räumen. Unsere Masseurinnen arbeiten selbstständig, volljährig und mit Bewilligung.',
        primary: { label: 'Profile', href: '/profile' },
        secondary: { label: 'Angebot', href: '#angebot' },
      }),
      b(
        'list',
        {
          heading: 'Angebot',
          style: 'rows',
          items: [
            { title: 'Massage', text: 'Ganzkörper, mit warmem Öl', meta: '60 Min · 220.–' },
            { title: 'Massage lang', text: 'Mit Zeit zum Ankommen und Nachruhen', meta: '90 Min · 300.–' },
            { title: 'Paarmassage', text: 'Zu zweit, mit zwei Masseurinnen', meta: '60 Min · 420.–' },
          ],
        },
        { anchor: 'angebot' },
      ),
      b('profiles', { heading: 'Unsere Masseurinnen', onlyAvailable: false }),
      b('list', {
        heading: 'Regeln',
        style: 'numbered',
        items: [
          { title: 'Einvernehmen', text: 'Was geschieht, wird vorher besprochen. Ein Nein gilt sofort.' },
          { title: 'Hygiene', text: 'Dusche vor der Massage, frische Tücher für jeden Gast.' },
          { title: 'Diskretion', text: 'Keine Daten an Dritte, neutrale Quittung.' },
        ],
      }),
      b('hours', { heading: 'Öffnungszeiten' }),
    ],
    pages: [contactPage('kontakt', 'Termin anfragen')],
    nav: nav(['Angebot', '/#angebot'], ['Profile', '/profile'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [],
  };
}

export function escortAgency(): Seed {
  return {
    tagline: 'Begleitung mit Stil und Diskretion',
    footer: 'Begleitagentur · Alle Begleitpersonen sind volljährig und arbeiten selbstbestimmt.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Begleitagentur',
        title: 'Gesellschaft für einen Abend – vermittelt mit Sorgfalt.',
        text: 'Für Geschäftsessen, Konzerte oder einfach ein gutes Gespräch. Wir kennen jede Person, die wir vermitteln, persönlich.',
        primary: { label: 'Profile ansehen', href: '/profile' },
        secondary: { label: 'Anfrage', href: '/anfrage' },
      }),
      b('profiles', { heading: 'Begleitpersonen', onlyAvailable: false }),
      b('timeline', {
        heading: 'So läuft eine Buchung',
        items: [
          { when: '1', title: 'Anfrage', text: 'Sie schreiben uns Datum, Anlass und Wünsche.' },
          { when: '2', title: 'Rückruf', text: 'Wir klären Details und schlagen passende Begleitpersonen vor.' },
          { when: '3', title: 'Bestätigung', text: 'Erst wenn beide Seiten zusagen, ist das Treffen bestätigt.' },
        ],
      }),
      b('faq', {
        heading: 'Gut zu wissen',
        items: [
          { q: 'Wie diskret ist die Agentur?', a: '<p>Wir speichern nur, was für die Buchung nötig ist, und löschen es danach.</p>' },
          { q: 'Wer entscheidet über ein Treffen?', a: '<p>Die Begleitperson. Sie kann jede Anfrage ohne Begründung ablehnen.</p>' },
        ],
      }),
    ],
    pages: [
      { slug: 'anfrage', title: 'Anfrage', blocks: [b('form', { heading: 'Anfrage', intro: 'Wir melden uns diskret per Telefon oder E-Mail.', form: '@form:anfrage' })] },
      contactPage(),
    ],
    nav: nav(['Profile', '/profile'], ['Anfrage', '/anfrage'], ['Kontakt', '/kontakt']),
    forms: [
      contactForm,
      {
        key: 'anfrage',
        name: 'Buchungsanfrage',
        submit: 'Anfrage senden',
        success: 'Danke! Wir melden uns diskret innert 24 Stunden.',
        fields: [
          f('date', 'Datum', true),
          f('text', 'Anlass und Ort', true),
          f('textarea', 'Wünsche'),
          f('text', 'Name', true),
          f('email', 'E-Mail', true),
          f('tel', 'Telefon'),
          f('checkbox', 'Ich bin mindestens 18 Jahre alt.', true),
        ],
      },
    ],
    entries: [],
  };
}
