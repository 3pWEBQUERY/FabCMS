import { shortId } from '../shared/text';
import { b, f, chf, contactForm, contactPage, type Seed } from './seed-kit';

/**
 * More starter templates for the P0 Sparten (PRD: three per Sparte, each in
 * two Stilrichtungen). The first template of each Sparte lives in seed.ts;
 * these are the alternatives the setup assistant offers next to it.
 * Realistic Swiss examples, written to be replaced – never lorem ipsum.
 */

const nav = (...items: [string, string][]) => items.map(([label, href]) => ({ id: shortId(), label, href }));
const today = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

/* ---------- Restaurant ---------- */

const dish = (title: string, category: string, prices: [string, number][], extra: Record<string, unknown> = {}) => ({
  collection: 'dishes',
  data: { title, category, prices: prices.map(([label, p]) => ({ label, price: chf(p) })), allergens: [], tags: [], daily: false, soldOut: false, ...extra },
});

export function fineDining(): Seed {
  return {
    tagline: 'Sieben Gänge, ein Abend',
    footer: 'Mittwoch bis Samstag ab 18.30 Uhr. Wir bitten um Reservation.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Restaurant · 14 Plätze',
        title: 'Ein Menü, das sich mit den Jahreszeiten ändert. Jede Woche ein wenig.',
        text: 'Wir kochen ein einziges Menü in fünf oder sieben Gängen – aus dem, was Fischer, Jäger und Gärtnerinnen aus der Region uns bringen.',
        primary: { label: 'Tisch reservieren', href: '/reservation' },
        secondary: { label: 'Das Menü', href: '/karte' },
      }),
      b('quote', { quote: 'Man isst hier nicht viel. Man isst genau.', name: 'GaultMillau', role: '15 Punkte, 2025' }),
      b('split', {
        eyebrow: 'Die Küche',
        heading: 'Weniger auf dem Teller, mehr Zeit dafür.',
        body: '<p>Unsere Küche ist offen, die Gaststube klein. Zwischen den Gängen kommt die Köchin oft selbst an den Tisch und erzählt, woher das Gemüse kommt und warum es heute so und nicht anders auf dem Teller liegt.</p>',
        side: 'right',
      }),
      b('menu', { heading: 'Das Menü dieser Woche', categories: ['Menü'], allergens: true }),
      b('list', {
        heading: 'Gut zu wissen',
        style: 'rows',
        items: [
          { title: 'Weinbegleitung', text: 'Fünf Gläser, vorwiegend aus der Schweiz.', meta: 'CHF 85.–', icon: 'wine' },
          { title: 'Alkoholfreie Begleitung', text: 'Säfte, Kombuchas und Tees aus der eigenen Küche.', meta: 'CHF 55.–', icon: 'cup' },
          { title: 'Allergien und Unverträglichkeiten', text: 'Bitte bei der Reservation angeben – wir richten uns danach.', meta: '', icon: 'info' },
        ],
      }),
      b(
        'cta',
        { heading: 'Ein Abend bei uns', text: 'Mittwoch bis Samstag, ein Service ab 18.30 Uhr.', primary: { label: 'Tisch reservieren', href: '/reservation' } },
        { tone: 'inverse' },
      ),
    ],
    pages: [
      {
        slug: 'reservation',
        title: 'Reservation',
        blocks: [
          b('booking', { heading: 'Tisch reservieren', intro: 'Wir servieren einen Service pro Abend ab 18.30 Uhr. Absagen bis 48 Stunden vorher sind kostenlos.' }),
          b('hours', { heading: 'Öffnungszeiten' }),
        ],
      },
      {
        slug: 'gutscheine',
        title: 'Gutscheine',
        blocks: [
          b('text', {
            heading: 'Einen Abend verschenken',
            body: '<p>Unsere Gutscheine gelten zwei Jahre und lassen sich für das Menü, die Weinbegleitung oder einen Betrag nach Wahl ausstellen. Schreib uns, wir schicken ihn per Post oder als PDF.</p>',
          }),
          b('form', { heading: 'Gutschein bestellen', intro: 'Bezahlung per Rechnung oder TWINT.', form: '@form:gutschein' }),
        ],
      },
      contactPage(),
    ],
    nav: nav(['Menü', '/karte'], ['Reservation', '/reservation'], ['Gutscheine', '/gutscheine'], ['Kontakt', '/kontakt']),
    forms: [
      contactForm,
      {
        key: 'gutschein',
        name: 'Gutschein',
        submit: 'Gutschein bestellen',
        success: 'Danke! Wir melden uns mit der Rechnung und schicken den Gutschein, sobald sie bezahlt ist.',
        fields: [
          f('text', 'Name', true),
          f('email', 'E-Mail', true),
          f('select', 'Gutschein für', true, { options: ['Menü für zwei', 'Menü mit Weinbegleitung für zwei', 'Betrag nach Wahl'] }),
          f('text', 'Betrag oder Widmung'),
          f('select', 'Zustellung', true, { options: ['Per Post', 'Als PDF per E-Mail'] }),
        ],
      },
    ],
    booking: {
      mode: 'table',
      services: [{ name: 'Menü', duration: 210 }],
      resources: [
        { name: 'Tisch am Fenster', kind: 'table', capacity: 2 },
        { name: 'Tisch an der Küche', kind: 'table', capacity: 2 },
        { name: 'Ecktisch', kind: 'table', capacity: 4 },
        { name: 'Grosser Tisch', kind: 'table', capacity: 6 },
      ],
    },
    entries: [
      dish('Saibling vom Walensee, Gurke, Dill', 'Menü', [['', 0]], { allergens: ['fish', 'milk'], origin: 'Saibling: Schweiz', description: 'Erster Gang' }),
      dish('Randen aus dem Ofen, Ziegenfrischkäse, Haselnuss', 'Menü', [['', 0]], { allergens: ['milk', 'nuts'], tags: ['vegetarian'], description: 'Zweiter Gang' }),
      dish('Kalbsbacke, Sellerie, Jus mit Most', 'Menü', [['', 0]], { allergens: ['celery', 'milk', 'sulphites'], origin: 'Kalb: Schweiz', description: 'Hauptgang' }),
      dish('Quitte, Brioche, Rahmglace', 'Menü', [['', 0]], { allergens: ['gluten', 'eggs', 'milk'], tags: ['vegetarian'], description: 'Dessert' }),
      dish(
        'Menü in fünf Gängen',
        'Preise',
        [
          ['5 Gänge', 145],
          ['7 Gänge', 185],
        ],
        { description: 'Auch vegetarisch – bitte bei der Reservation angeben.' },
      ),
    ],
  };
}

export function cafe(name: string): Seed {
  return {
    tagline: 'Kaffee, Gipfeli und Zeit',
    footer: 'Täglich frisch gebacken, ab 7 Uhr.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Café & Bäckerei',
        title: `Guten Morgen im ${name}.`,
        text: 'Ab 7 Uhr gibt es Kaffee aus der Siebträgermaschine, Gipfeli aus dem eigenen Ofen und einen Platz am Fenster.',
        primary: { label: 'Was es heute gibt', href: '/karte' },
        secondary: { label: 'Vorbestellen', href: '/bestellen' },
      }),
      b('hours', { heading: 'Heute offen?' }),
      b('columns', {
        heading: 'Bei uns',
        count: '3',
        items: [
          { title: 'Kaffee', text: 'Bohnen von einer Rösterei aus Winterthur, jede Woche frisch.', icon: 'cup' },
          { title: 'Backwaren', text: 'Gipfeli, Zopf und Brot – um 6 Uhr aus dem Ofen.', icon: 'bread' },
          { title: 'Mittag', text: 'Eine Suppe und zwei Sandwiches, von 11.30 bis 14 Uhr.', icon: 'pot' },
        ],
      }),
      b('menu', { heading: 'Aus der Vitrine', categories: ['Backwaren', 'Kaffee'], daily: true, allergens: true }),
      b('notice', { text: 'Zopf für den Sonntag? Bis Samstag 12 Uhr vorbestellen, wir legen ihn zur Seite.', tone: 'quiet', link: { label: 'Vorbestellen', href: '/bestellen' } }),
      b('contact', { heading: 'So findest du uns', showHours: false }),
    ],
    pages: [contactPage()],
    nav: nav(['Karte', '/karte'], ['Vorbestellen', '/bestellen'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      dish('Buttergipfeli', 'Backwaren', [['', 1.9]], { allergens: ['gluten', 'milk', 'eggs'], tags: ['vegetarian', 'house'] }),
      dish('Zopf, 500 g', 'Backwaren', [['', 7.5]], { allergens: ['gluten', 'milk', 'eggs'], tags: ['vegetarian'], description: 'Freitag und Samstag' }),
      dish('Ruchbrot, 500 g', 'Backwaren', [['', 5.8]], { allergens: ['gluten'], tags: ['vegan'] }),
      dish('Rüeblitorte, Stück', 'Backwaren', [['', 5.5]], { allergens: ['gluten', 'eggs', 'nuts', 'milk'], tags: ['vegetarian'] }),
      dish(
        'Cappuccino',
        'Kaffee',
        [
          ['normal', 4.9],
          ['gross', 5.9],
        ],
        { allergens: ['milk'], description: 'Auch mit Hafermilch' },
      ),
      dish('Espresso', 'Kaffee', [['', 3.8]], { tags: ['vegan'] }),
      dish('Tagessuppe mit Brot', 'Mittag', [['', 9.5]], { daily: true, allergens: ['celery', 'gluten'], tags: ['vegan'] }),
      dish('Sandwich mit Bergkäse und Birne', 'Mittag', [['', 8.9]], { allergens: ['gluten', 'milk', 'mustard'], tags: ['vegetarian'] }),
    ],
  };
}

/* ---------- Shop ---------- */

const product = (title: string, price: number, extra: Record<string, unknown> = {}) => ({
  collection: 'products',
  data: { title, price: chf(price), images: [], vat: 'standard', digital: false, variants: [], ...extra },
});

export function boutique(): Seed {
  return {
    tagline: 'Kleidung, die bleibt',
    footer: 'Versand in der Schweiz gratis ab CHF 150.–. Rückgabe innert 30 Tagen.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Herbst / Winter',
        title: 'Weniger Teile. Dafür solche, die man jahrelang trägt.',
        text: 'Wolle aus Europa, genäht in kleinen Ateliers in Portugal und im Tessin. Jedes Teil mit Pflegehinweis und Reparaturversprechen.',
        primary: { label: 'Neue Kollektion', href: '/laden' },
      }),
      b('products', { heading: 'Neu eingetroffen', count: 6 }),
      b('columns', {
        heading: '',
        count: '3',
        items: [
          { title: 'Gratis Versand ab CHF 150.–', text: 'Darunter CHF 8.– pauschal, Lieferung in zwei Tagen.', icon: 'truck' },
          { title: 'Reparaturen inklusive', text: 'Naht offen, Knopf weg? Schick das Teil zurück, wir flicken es.', icon: 'wrench' },
          { title: '30 Tage Rückgabe', text: 'Passt es nicht, nehmen wir es zurück. Etikette dran lassen.', icon: 'box' },
        ],
      }),
      b('table', {
        heading: 'Grössen',
        h1: 'Grösse',
        h2: 'Brustumfang',
        h3: 'Taillenumfang',
        h4: '',
        right: false,
        note: 'Zwischen zwei Grössen? Unsere Schnitte fallen eher gross aus – nimm die kleinere.',
        rows: [
          { a: 'S', b: '84–88 cm', c: '68–72 cm' },
          { a: 'M', b: '89–94 cm', c: '73–78 cm' },
          { a: 'L', b: '95–100 cm', c: '79–84 cm' },
        ],
      }),
      b('newsletter', { heading: 'Neue Teile zuerst sehen', intro: 'Viermal im Jahr, zur neuen Kollektion. Kein Rabattgeschrei.', button: 'Eintragen', askName: false }),
    ],
    pages: [
      {
        slug: 'pflege',
        title: 'Pflege & Reparatur',
        blocks: [
          b('text', {
            heading: 'Wolle mag es kühl',
            body: '<p>Wolle muss selten gewaschen werden: Auslüften reicht meistens. Wenn doch, dann im Wollprogramm bei 30 Grad, flach trocknen, nie in den Tumbler.</p><p>Geht trotzdem etwas kaputt, schick uns das Teil mit einer kurzen Notiz. Reparaturen sind für die ersten zwei Jahre kostenlos.</p>',
          }),
        ],
      },
      contactPage(),
    ],
    nav: nav(['Laden', '/laden'], ['Pflege & Reparatur', '/pflege'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      product('Pullover aus Merinowolle', 189, {
        category: 'Strick',
        description: '<p>Feiner Strick aus Merinowolle, gestrickt im Tessin. Gerader Schnitt, Rundhals.</p>',
        variants: [
          { name: 'S · Ecru', price: null, stock: 4, sku: 'PUL-S-ECR' },
          { name: 'M · Ecru', price: null, stock: 6, sku: 'PUL-M-ECR' },
          { name: 'M · Tannengrün', price: null, stock: 3, sku: 'PUL-M-TAN' },
          { name: 'L · Tannengrün', price: null, stock: 0, sku: 'PUL-L-TAN' },
        ],
      }),
      product('Wollmantel, gerade geschnitten', 420, {
        category: 'Mäntel',
        description: '<p>Gewalkte Wolle, ungefüttert, mit zwei tiefen Taschen. Genäht in Porto.</p>',
        variants: [
          { name: 'S', price: null, stock: 2, sku: 'MAN-S' },
          { name: 'M', price: null, stock: 3, sku: 'MAN-M' },
          { name: 'L', price: null, stock: 1, sku: 'MAN-L' },
        ],
      }),
      product('Leinenhemd', 129, { category: 'Hemden', stock: 12, description: '<p>Vorgewaschenes Leinen, wird mit jeder Wäsche weicher.</p>' }),
      product('Wollschal', 79, { category: 'Accessoires', stock: 20, description: '<p>200 × 35 cm, Lammwolle aus dem Toggenburg.</p>' }),
    ],
  };
}

export function farmShop(): Seed {
  return {
    tagline: 'Vom Hof direkt zu dir',
    footer: 'Hofladen offen Freitag und Samstag. Bestellungen zum Abholen jederzeit.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Hofladen',
        title: 'Was diese Woche auf dem Hof gewachsen ist.',
        text: 'Gemüse, Eier, Most und Fleisch von unseren eigenen Tieren. Online bestellen und am Freitag oder Samstag abholen.',
        primary: { label: 'Zum Hofladen', href: '/laden' },
        secondary: { label: 'So funktioniert es', href: '#so' },
      }),
      b('notice', { text: 'Diese Woche frisch: die ersten Kürbisse und Süssmost vom Hochstamm.', tone: 'accent' }),
      b('products', { heading: 'Diese Woche im Laden', count: 6 }),
      b(
        'list',
        {
          heading: 'So funktioniert es',
          style: 'numbered',
          items: [
            { title: 'Bis Donnerstag bestellen', text: 'Was du bis Donnerstagabend bestellst, rüsten wir für dich.', icon: 'calendar' },
            { title: 'Freitag oder Samstag abholen', text: 'Im Hofladen zwischen 9 und 17 Uhr. Kühltasche mitbringen.', icon: 'basket' },
            { title: 'Bezahlen, wie es passt', text: 'Bar, TWINT oder online beim Bestellen.', icon: 'card' },
          ],
        },
        { anchor: 'so' },
      ),
      b('split', {
        eyebrow: 'Unser Hof',
        heading: 'Zwölf Kühe, ein paar Schweine und viel Gemüse.',
        body: '<p>Wir bewirtschaften den Hof in der dritten Generation, seit 2018 nach Bio-Suisse-Richtlinien. Die Tiere sind im Sommer auf der Weide, das Gemüse wächst ohne Folientunnel.</p>',
        side: 'left',
      }),
      b('contact', { heading: 'Hofladen', showHours: true }),
    ],
    pages: [contactPage()],
    nav: nav(['Hofladen', '/laden'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      product('Gemüsekiste klein', 28, { category: 'Gemüse', vat: 'reduced', stock: 20, description: '<p>Für 1–2 Personen und eine Woche. Was gerade reif ist.</p>' }),
      product('Gemüsekiste gross', 45, { category: 'Gemüse', vat: 'reduced', stock: 15, description: '<p>Für 3–4 Personen und eine Woche.</p>' }),
      product('Eier vom Hof, 6 Stück', 5.4, { category: 'Eier & Milch', vat: 'reduced', stock: 40, description: '<p>Von unseren Hühnern mit Auslauf auf der Wiese.</p>' }),
      product('Süssmost, 1 Liter', 4.2, { category: 'Getränke', vat: 'reduced', stock: 60, description: '<p>Aus Äpfeln unserer Hochstamm-Bäume, ungefiltert.</p>' }),
      product('Mischpaket Rind, 5 kg', 165, {
        category: 'Fleisch',
        vat: 'reduced',
        stock: 6,
        description: '<p>Vom eigenen Rind, gereift und vakuumiert: Steaks, Braten, Ragout und Hackfleisch. Nur auf Vorbestellung.</p>',
      }),
    ],
  };
}

/* ---------- Blog ---------- */

const post = (title: string, excerpt: string, category: string, tags: string[], body: string, offset: number) => ({
  collection: 'posts',
  data: { title, excerpt, category, tags, date: today(offset), allowComments: true, blocks: [b('text', { heading: '', body })] },
});

export function travelBlog(): Seed {
  return {
    tagline: 'Unterwegs, langsam',
    footer: 'Geschrieben zwischen zwei Zügen.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Reisejournal',
        title: 'Mit dem Zug durch Europa – und was zwischen den Bahnhöfen passiert.',
        text: 'Routen, Unterkünfte und Umwege. Ohne Flugzeug, mit viel Zeit.',
        primary: { label: 'Neueste Reise', href: '/journal' },
      }),
      b('posts', { heading: 'Zuletzt unterwegs', count: 6, layout: 'grid' }),
      b('stats', {
        heading: '',
        items: [
          { value: '23', label: 'Länder mit dem Zug' },
          { value: '41', label: 'Nachtzüge' },
          { value: '0', label: 'Flüge seit 2019' },
        ],
      }),
      b('newsletter', { heading: 'Neue Reisen per E-Mail', intro: 'Etwa einmal im Monat, mit Route und Kosten.', button: 'Abonnieren', askName: true }),
    ],
    pages: [
      {
        slug: 'ueber-mich',
        title: 'Über mich',
        blocks: [
          b('text', {
            heading: 'Hallo, ich bin Nora',
            body: '<p>Ich arbeite als Lehrerin in Bern und reise in den Ferien mit dem Zug. Hier schreibe ich auf, wie die Reisen geplant waren, was sie gekostet haben und was ganz anders gekommen ist.</p>',
          }),
        ],
      },
      contactPage(),
    ],
    nav: nav(['Reisen', '/journal'], ['Über mich', '/ueber-mich'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      post(
        'Im Nachtzug von Zürich nach Rom',
        'Abends am HB einsteigen, morgens Cappuccino in Termini. Was der Nightjet kostet und welches Abteil sich lohnt.',
        'Italien',
        ['Nachtzug', 'Italien'],
        '<p>Der Nightjet fährt kurz nach 20 Uhr in Zürich ab und kommt um halb zehn in Rom an. Wir hatten ein Dreierabteil im Liegewagen gebucht – für zwei Personen, mit etwas Glück blieb das dritte Bett leer.</p><h2>Was es kostet</h2><p>Zwei Plätze im Liegewagen kosteten zusammen CHF 238.–, Frühstück inklusive. Wer früh bucht, zahlt deutlich weniger.</p>',
        3,
      ),
      post(
        'Drei Tage Lofoten ohne Auto',
        'Bus, Fähre, zu Fuss: wie man die Inseln ohne Mietauto entdeckt, und warum das besser ist.',
        'Norwegen',
        ['Wandern', 'Norwegen'],
        '<p>Von Bodø fährt die Schnellfähre in gut drei Stunden nach Svolvær. Dort beginnt eine Buslinie, die die ganze Inselkette bis Å abfährt – mit Halten an fast jedem Ausgangspunkt für Wanderungen.</p>',
        24,
      ),
    ],
  };
}

export function expertBlog(): Seed {
  return {
    tagline: 'Recht verständlich',
    footer: 'Allgemeine Informationen, keine Rechtsberatung im Einzelfall.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Fachblog Mietrecht',
        title: 'Mietrecht für Mieter und Vermieterinnen – in Sätzen, die man versteht.',
        text: 'Jeden zweiten Dienstag ein Beitrag zu einer Frage, die uns in der Beratung oft gestellt wird.',
        primary: { label: 'Alle Beiträge', href: '/journal' },
      }),
      b('posts', { heading: 'Neueste Beiträge', count: 5, layout: 'list' }),
      b('list', {
        heading: 'Häufige Themen',
        style: 'columns',
        items: [
          { title: 'Mietzinserhöhung', text: 'Wann sie zulässig ist und wie man sie anficht.', icon: 'percent' },
          { title: 'Kündigung', text: 'Fristen, Termine und was eine gültige Kündigung braucht.', icon: 'document' },
          { title: 'Mängel', text: 'Wer bezahlt den neuen Kühlschrank? Und wie viel Mietzinsreduktion ist drin?', icon: 'wrench' },
        ],
      }),
      b('newsletter', { heading: 'Neue Beiträge per E-Mail', intro: 'Alle zwei Wochen, ein Beitrag, keine Werbung.', button: 'Abonnieren', askName: false }),
      b(
        'cta',
        { heading: 'Konkrete Frage?', text: 'Für Beratungen im Einzelfall erreichst du uns über das Kontaktformular.', primary: { label: 'Kontakt', href: '/kontakt' } },
        { tone: 'muted' },
      ),
    ],
    pages: [
      {
        slug: 'ueber-uns',
        title: 'Über uns',
        blocks: [
          b('text', {
            heading: 'Wer hier schreibt',
            body: '<p>Wir sind zwei Juristinnen mit eigener Kanzlei in Luzern und beraten seit über zehn Jahren im Mietrecht. Der Blog beantwortet Fragen allgemein – für den eigenen Fall lohnt sich ein Gespräch.</p>',
          }),
        ],
      },
      contactPage('kontakt', 'Frage stellen'),
    ],
    nav: nav(['Beiträge', '/journal'], ['Über uns', '/ueber-uns'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      post(
        'Der Referenzzinssatz ist gesunken – darf ich jetzt weniger Miete zahlen?',
        'Ja, oft. Wie du die Senkung verlangst, welche Frist gilt und warum der Vermieter manchmal trotzdem nein sagen darf.',
        'Mietzins',
        ['Referenzzinssatz', 'Mietzinssenkung'],
        '<p>Sinkt der hypothekarische Referenzzinssatz, kannst du eine Senkung des Mietzinses verlangen – schriftlich, auf den nächsten Kündigungstermin. Der Vermieter hat 30 Tage Zeit zu antworten.</p><h2>Wann er ablehnen darf</h2><p>Hat er gestiegene Unterhaltskosten oder die Teuerung bisher nicht weitergegeben, darf er diese verrechnen. Er muss das aber begründen.</p>',
        5,
      ),
      post(
        'Kündigung per E-Mail – gültig oder nicht?',
        'Kurz: nein. Warum es bei der Wohnung einen Brief mit Unterschrift braucht.',
        'Kündigung',
        ['Kündigung', 'Form'],
        '<p>Mieterinnen und Mieter müssen schriftlich kündigen, mit eigenhändiger Unterschrift. Eine E-Mail genügt nicht, auch keine eingescannte Unterschrift. Bei Familienwohnungen müssen beide Ehepartner unterschreiben.</p>',
        19,
      ),
    ],
  };
}

/* ---------- Angebot mit Anfragen ---------- */

export function coaching(): Seed {
  return {
    tagline: 'Klarheit für den nächsten Schritt',
    footer: 'Coaching in Basel und online.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Laufbahncoaching',
        title: 'Du willst beruflich etwas ändern, weisst aber noch nicht was?',
        text: 'In vier bis sechs Gesprächen finden wir heraus, was dich antreibt, was du kannst – und wie der nächste Schritt aussieht.',
        primary: { label: 'Kennenlerngespräch', href: '#anfrage' },
        secondary: { label: 'Angebote', href: '#angebote' },
      }),
      b('timeline', {
        heading: 'So arbeiten wir zusammen',
        items: [
          { when: 'Schritt 1', title: 'Kennenlernen', text: '30 Minuten am Telefon, kostenlos. Passt es, vereinbaren wir das erste Gespräch.' },
          { when: 'Schritt 2', title: 'Standort bestimmen', text: 'Was hast du bisher gemacht, was davon gern? Mit Übungen für zwischendurch.' },
          { when: 'Schritt 3', title: 'Möglichkeiten prüfen', text: 'Wir sammeln Optionen und prüfen sie an der Wirklichkeit – mit Gesprächen, nicht nur im Kopf.' },
          { when: 'Schritt 4', title: 'Entscheiden', text: 'Am Ende steht ein Plan für die nächsten drei Monate.' },
        ],
      }),
      b(
        'pricing',
        {
          heading: 'Angebote',
          intro: 'Gespräche à 90 Minuten, in der Praxis oder per Video.',
          plans: [
            {
              name: 'Einzelgespräch',
              price: 'CHF 220',
              period: 'pro Gespräch',
              description: 'Für eine konkrete Frage.',
              features: '90 Minuten\nNotizen per E-Mail',
              link: { label: 'Anfragen', href: '#anfrage' },
              highlight: false,
            },
            {
              name: 'Laufbahncoaching',
              price: 'CHF 1180',
              period: 'für 6 Gespräche',
              description: 'Für die grosse Frage.',
              features: '6 × 90 Minuten\nÜbungen zwischen den Gesprächen\nAbschlussbericht',
              link: { label: 'Anfragen', href: '#anfrage' },
              highlight: true,
            },
          ],
        },
        { anchor: 'angebote' },
      ),
      b('testimonials', {
        heading: '',
        items: [
          { quote: 'Nach zwölf Jahren in der Bank wusste ich nur, was ich nicht mehr wollte. Heute bin ich Berufsschullehrer.', name: 'Daniel R.', role: 'Coaching 2024' },
          { quote: 'Keine Fragebögen von der Stange, sondern gute Fragen.', name: 'Seline M.', role: 'Coaching 2025' },
        ],
      }),
      b('form', { heading: 'Kennenlerngespräch vereinbaren', intro: 'Ich melde mich innert zwei Arbeitstagen.', form: '@form:kontakt' }, { anchor: 'anfrage', tone: 'muted' }),
    ],
    pages: [],
    nav: nav(['Angebote', '/#angebote'], ['Kontakt', '/#anfrage']),
    forms: [
      {
        ...contactForm,
        name: 'Kennenlernen',
        fields: [f('text', 'Name', true), f('email', 'E-Mail', true), f('tel', 'Telefon'), f('textarea', 'Was beschäftigt dich gerade?', true)],
      },
    ],
    entries: [],
  };
}

export function productLaunch(): Seed {
  return {
    tagline: 'Der Rucksack für den Arbeitsweg',
    footer: 'Entworfen in Zürich, genäht in Litauen. Auslieferung ab März.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Ab März erhältlich',
        title: 'Ein Rucksack, der aufs Velo und ins Büro passt.',
        text: '22 Liter, wasserdicht, mit Fach für den Laptop und einem Rücken, der nicht nass wird. Trag dich ein – die ersten 300 bekommen 20 % Rabatt.',
        primary: { label: 'Auf die Liste', href: '#liste' },
        secondary: { label: 'Details', href: '#details' },
      }),
      b(
        'columns',
        {
          heading: 'Was er kann',
          count: '3',
          items: [
            { title: 'Wasserdicht', text: 'Verschweisste Nähte und ein Rollverschluss – auch bei Platzregen trocken.', icon: 'drop' },
            { title: 'Sitzt auf dem Velo', text: 'Belüfteter Rücken und Brustgurt, damit nichts rutscht.', icon: 'bike' },
            { title: 'Hält lange', text: 'Fünf Jahre Garantie, Ersatzteile zum Selbsttauschen.', icon: 'shield' },
          ],
        },
        { anchor: 'details' },
      ),
      b('table', {
        heading: 'Technische Daten',
        h1: '',
        h2: '',
        h3: '',
        h4: '',
        right: true,
        note: '',
        rows: [
          { a: 'Volumen', b: '22 Liter' },
          { a: 'Gewicht', b: '980 g' },
          { a: 'Laptopfach', b: 'bis 16 Zoll' },
          { a: 'Material', b: 'Recyceltes Polyester, PFC-frei beschichtet' },
        ],
      }),
      b('faq', {
        heading: 'Fragen',
        items: [
          { q: 'Wann kann ich ihn kaufen?', a: '<p>Ab März. Wer auf der Liste steht, kann eine Woche früher bestellen.</p>' },
          { q: 'Was kostet er?', a: '<p>CHF 189.–, für die ersten 300 auf der Liste CHF 151.–.</p>' },
        ],
      }),
      b('form', { heading: 'Auf die Liste', intro: 'Eine E-Mail zum Verkaufsstart, sonst nichts.', form: '@form:liste' }, { anchor: 'liste', tone: 'muted' }),
    ],
    pages: [],
    nav: nav(['Details', '/#details'], ['Auf die Liste', '/#liste']),
    forms: [
      {
        key: 'liste',
        name: 'Warteliste',
        submit: 'Eintragen',
        success: 'Du stehst auf der Liste. Wir melden uns eine Woche vor dem Verkaufsstart.',
        fields: [f('email', 'E-Mail', true), f('select', 'Farbe, die mich interessiert', false, { options: ['Schwarz', 'Olive', 'Sand'] })],
      },
    ],
    entries: [],
  };
}

/* ---------- Portfolio ---------- */

const project = (title: string, client: string, year: number, category: string, summary: string) => ({
  collection: 'projects',
  data: { title, client, year, category, summary, images: [] },
});

export function photography(): Seed {
  return {
    tagline: 'Fotografie für Menschen und Räume',
    footer: 'Aufträge in der Deutschschweiz. Studio in Winterthur.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Fotografin',
        title: 'Bilder, auf denen Menschen aussehen wie sie selbst – nur an einem guten Tag.',
        primary: { label: 'Arbeiten', href: '/arbeiten' },
        secondary: { label: 'Anfragen', href: '/kontakt' },
      }),
      b('projects', { heading: 'Ausgewählte Arbeiten', count: 6, filter: true }),
      b('list', {
        heading: 'Angebot',
        style: 'rows',
        items: [
          { title: 'Porträts für Team und Website', text: 'Im Studio oder bei euch, inkl. Bildbearbeitung.', meta: 'ab CHF 650.–', icon: 'camera' },
          { title: 'Reportage', text: 'Ein Tag in eurem Betrieb, ungestellt.', meta: 'ab CHF 1400.–', icon: 'people' },
          { title: 'Architektur und Räume', text: 'Für Hotels, Restaurants und Ladenlokale.', meta: 'ab CHF 900.–', icon: 'house' },
        ],
      }),
      b('quote', { quote: 'Zum ersten Mal ein Teamfoto, auf dem alle gern sind.', name: 'Pia W.', role: 'Praxis Stadtgarten' }),
      b('cta', { heading: 'Termin anfragen', text: 'Erzähl kurz, was du brauchst. Ich antworte mit Vorschlag und Preis.', primary: { label: 'Kontakt', href: '/kontakt' } }),
    ],
    pages: [contactPage()],
    nav: nav(['Arbeiten', '/arbeiten'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      project('Teamporträts für die Praxis Stadtgarten', 'Praxis Stadtgarten', 2025, 'Porträt', 'Zwölf Porträts in einem Vormittag, im Licht der eigenen Räume.'),
      project('Ein Tag in der Velowerkstatt', 'Kette GmbH', 2025, 'Reportage', 'Vom ersten Kaffee bis zum letzten Platten.'),
      project('Hotel Rigiblick – Zimmer und Restaurant', 'Hotel Rigiblick', 2024, 'Räume', 'Neue Bilder für Website und Buchungsplattformen.'),
    ],
  };
}

export function architecture(): Seed {
  return {
    tagline: 'Architektur im Bestand',
    footer: 'Architekturbüro in St. Gallen. Mitglied SIA.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Architekturbüro',
        title: 'Wir bauen um, weiter und dazu. Am liebsten dort, wo schon etwas steht.',
        text: 'Umbauten, Sanierungen und Ersatzneubauten für Private, Genossenschaften und Gemeinden.',
        primary: { label: 'Projekte', href: '/arbeiten' },
      }),
      b('projects', { heading: 'Projekte', count: 6, filter: true }),
      b('timeline', {
        heading: 'Vom ersten Gespräch bis zum Einzug',
        items: [
          { when: 'Phase 1', title: 'Bestand verstehen', text: 'Wir schauen genau hin: Substanz, Geschichte, was bleiben kann.' },
          { when: 'Phase 2', title: 'Entwurf', text: 'Varianten, Kosten und Termine – so lange, bis es stimmt.' },
          { when: 'Phase 3', title: 'Bewilligung und Ausführung', text: 'Wir begleiten die Baustelle bis zur Abnahme.' },
        ],
      }),
      b('stats', {
        heading: '',
        items: [
          { value: '1998', label: 'gegründet' },
          { value: '9', label: 'Leute im Büro' },
          { value: '64', label: 'Umbauten' },
        ],
      }),
      b('cta', { heading: 'Ein Haus, das mehr kann?', text: 'Ein erstes Gespräch vor Ort ist kostenlos.', primary: { label: 'Kontakt', href: '/kontakt' } }, { tone: 'muted' }),
    ],
    pages: [
      {
        slug: 'buero',
        title: 'Büro',
        blocks: [
          b('text', {
            heading: 'Wir',
            body: '<p>Neun Architektinnen und Architekten, eine Zeichnerin in Ausbildung und ein Hund. Wir arbeiten in einem umgebauten Webereigebäude am Stadtrand – unser liebstes Referenzprojekt.</p>',
          }),
        ],
      },
      contactPage(),
    ],
    nav: nav(['Projekte', '/arbeiten'], ['Büro', '/buero'], ['Kontakt', '/kontakt']),
    forms: [contactForm],
    entries: [
      project('Umbau Bauernhaus Hinterberg', 'Privat', 2025, 'Umbau', 'Aus dem Ökonomieteil werden zwei Wohnungen, die Stube bleibt.'),
      project('Genossenschaft Lindenhof – Sanierung', 'WG Lindenhof', 2024, 'Sanierung', '48 Wohnungen, saniert im bewohnten Zustand.'),
      project('Kindergarten Rietli', 'Gemeinde Gaiserwald', 2023, 'Neubau', 'Holzbau mit Garten auf dem Dach.'),
    ],
  };
}
