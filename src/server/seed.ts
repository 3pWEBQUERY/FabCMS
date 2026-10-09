import { sql, json } from './db';
import { createBlock } from '../shared/blocks';
import { SECTOR_MAP } from '../shared/collections';
import { slugify, shortId } from '../shared/text';
import type { Block, FormFieldDef, NavItem } from '../shared/types';
import { bumpGeneration, getSettings, updateSettings } from './settings';

/**
 * Starter content for the setup assistant. Realistic Swiss examples the
 * owner replaces with their own – never lorem ipsum.
 */

const b = (type: string, props: Record<string, unknown> = {}, style: Block['style'] = {}): Block => ({ ...createBlock(type, props), style });
const f = (type: FormFieldDef['type'], label: string, required = false, extra: Partial<FormFieldDef> = {}): FormFieldDef => ({
  id: shortId(8),
  type,
  label,
  name: slugify(label).replace(/-/g, '_'),
  required,
  ...extra,
});

interface Seed {
  home: Block[];
  pages: { slug: string; title: string; blocks: Block[] }[];
  nav: NavItem[];
  forms: { key: string; name: string; fields: FormFieldDef[]; success: string; submit: string }[];
  entries: { collection: string; data: Record<string, unknown> }[];
  tagline: string;
  footer: string;
  /** Reservation & Termine: what can be booked, with what or whom. */
  booking?: {
    mode: 'table' | 'appointment';
    services: { name: string; description?: string; duration: number; buffer?: number; price?: number }[];
    resources: { name: string; kind: 'table' | 'staff' | 'room'; capacity: number }[];
  };
}

const contactForm = {
  key: 'kontakt',
  name: 'Kontakt',
  submit: 'Nachricht senden',
  success: 'Danke für deine Nachricht! Wir antworten in der Regel innert eines Arbeitstages.',
  fields: [f('text', 'Name', true), f('email', 'E-Mail', true), f('tel', 'Telefon'), f('textarea', 'Nachricht', true)],
};

const contactPage = (formKey = 'kontakt', heading = 'Schreib uns') => ({
  slug: 'kontakt',
  title: 'Kontakt',
  blocks: [b('contact', { heading: 'So erreichst du uns', showHours: true }), b('form', { heading, intro: 'Wir melden uns so schnell wie möglich.', form: `@form:${formKey}` }), b('map')],
});

const chf = (francs: number) => Math.round(francs * 100);

function restaurant(name: string): Seed {
  const dish = (title: string, category: string, prices: [string, number][], extra: Record<string, unknown> = {}) => ({
    collection: 'dishes',
    data: { title, category, prices: prices.map(([label, p]) => ({ label, price: chf(p) })), allergens: [], tags: [], daily: false, soldOut: false, ...extra },
  });
  return {
    tagline: 'Saisonale Küche, ehrlich gekocht',
    footer: 'Mittags ein schneller Teller, abends Zeit für mehr.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Seit 1987 an der Kirchgasse',
        title: 'Saisonale Küche, ehrlich gekocht.',
        text: 'Mittags ein schneller Teller, abends Zeit für mehr. Wir kochen mit dem, was die Bauern rund um den See gerade bringen.',
        primary: { label: 'Tisch anfragen', href: '/reservation' },
        secondary: { label: 'Zur Karte', href: '/karte' },
      }),
      b('hours', { heading: 'Heute geöffnet?' }),
      b('menu', { heading: 'Aus der Karte', categories: ['Vorspeisen', 'Hauptgänge'], daily: true, allergens: true }),
      b('split', {
        eyebrow: 'Unsere Küche',
        heading: 'Was auf den Teller kommt, kennen wir beim Namen.',
        body: '<p>Das Gemüse kommt vom Hof Rütihalde, der Fisch aus dem See, das Fleisch von zwei Metzgereien aus dem Dorf. Was es nicht gibt, gibt es eben nicht – dafür schmeckt, was es gibt.</p>',
        side: 'right',
        link: { label: 'Ganze Karte ansehen', href: '/karte' },
      }),
      b('testimonials', {
        heading: '',
        items: [
          { quote: 'Die Älplermagronen sind die besten diesseits vom Klausen. Und der Service merkt sich, dass ich kein Apfelmus will.', name: 'Ruedi K.', role: 'Stammgast seit 2014' },
          { quote: 'Wir haben hier unsere Hochzeit gefeiert – ohne Stress, mit viel Herz und einem Dessertbuffet, über das man heute noch spricht.', name: 'Lea & Simon', role: 'Hochzeit im Juni' },
        ],
      }),
      b('cta', { heading: 'Ein Tisch für heute Abend?', text: 'Ruf an oder schick uns eine Anfrage – wir bestätigen innert Stunden.', primary: { label: 'Tisch anfragen', href: '/reservation' } }, { tone: 'muted' }),
      b('contact', { heading: 'Anfahrt', showHours: false }),
    ],
    pages: [
      { slug: 'reservation', title: 'Reservation', blocks: [b('booking', { heading: 'Tisch reservieren', intro: 'Wähle Tag und Uhrzeit – die Bestätigung kommt sofort per E-Mail. Für Gruppen ab 9 Personen ruf uns bitte an.' }), b('hours', { heading: 'Öffnungszeiten' })] },
      { slug: 'ueber-uns', title: 'Über uns', blocks: [b('text', { heading: 'Ein Wirtshaus, wie es sein soll', body: '<p>Wir sind ein kleines Team aus Küche und Service. Seit drei Generationen steht hier jemand aus der Familie am Herd – heute mit etwas mehr Gemüse und etwas weniger Butter als früher.</p>' }), b('people', { heading: 'Team', items: [{ name: 'Anna Meier', role: 'Küche', text: 'Kocht hier seit 2009.', image: null }, { name: 'Marco Bühler', role: 'Service & Wein', text: 'Kennt jeden Winzer am See persönlich.', image: null }] })] },
      contactPage(),
    ],
    nav: [
      { id: shortId(), label: 'Karte', href: '/karte' },
      { id: shortId(), label: 'Reservation', href: '/reservation' },
      { id: shortId(), label: 'Über uns', href: '/ueber-uns' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    booking: {
      mode: 'table',
      services: [{ name: 'Tisch', duration: 120 }],
      resources: [
        { name: 'Tisch 1', kind: 'table', capacity: 2 },
        { name: 'Tisch 2', kind: 'table', capacity: 2 },
        { name: 'Tisch 3', kind: 'table', capacity: 4 },
        { name: 'Tisch 4', kind: 'table', capacity: 4 },
        { name: 'Tisch 5', kind: 'table', capacity: 4 },
        { name: 'Stammtisch', kind: 'table', capacity: 8 },
      ],
    },
    entries: [
      dish('Mittagsmenü: Gemüsesuppe, Hackbraten mit Kartoffelstock', 'Tageskarte', [['', 24.5]], { daily: true, allergens: ['milk', 'celery', 'eggs', 'gluten'], origin: 'Rind/Schwein: Schweiz', category: 'Hauptgänge' }),
      dish('Nüsslisalat mit Ei und Speckwürfeli', 'Vorspeisen', [['', 14.5]], { allergens: ['eggs', 'mustard'], origin: 'Schwein: Schweiz', description: 'Hausdressing mit Senf und Apfelessig' }),
      dish('Kürbissuppe mit Kernöl', 'Vorspeisen', [['', 11]], { allergens: ['milk', 'celery'], tags: ['vegetarian'] }),
      dish('Rindstatar von Hand geschnitten', 'Vorspeisen', [['klein', 19], ['gross', 32]], { allergens: ['eggs', 'mustard', 'fish'], origin: 'Rind: Schweiz', description: 'Mit Toast und Butter', tags: ['house'] }),
      dish('Zürcher Geschnetzeltes mit Rösti', 'Hauptgänge', [['', 38.5]], { allergens: ['milk', 'sulphites'], origin: 'Kalb: Schweiz', tags: ['house'] }),
      dish('Eglifilets mit Mandelbutter und Salzkartoffeln', 'Hauptgänge', [['', 36]], { allergens: ['fish', 'milk', 'nuts'], origin: 'Egli: Estland, Wildfang' }),
      dish('Älplermagronen mit Apfelmus', 'Hauptgänge', [['', 26]], { allergens: ['gluten', 'milk', 'eggs'], tags: ['vegetarian'] }),
      dish('Wildpfeffer mit Spätzli und Rotkraut', 'Hauptgänge', [['', 42]], { allergens: ['gluten', 'eggs', 'milk', 'celery', 'sulphites'], origin: 'Hirsch: Österreich', description: 'Nur von September bis Dezember' }),
      dish('Vermicelles mit Meringue und Rahm', 'Desserts', [['', 12.5]], { allergens: ['milk', 'eggs'], tags: ['vegetarian'] }),
      dish('Caramelköpfli', 'Desserts', [['', 9.5]], { allergens: ['milk', 'eggs'], tags: ['vegetarian'] }),
      dish('Räuschling vom Zürichsee', 'Getränke', [['1 dl', 7.5], ['5 dl', 34]], { allergens: ['sulphites'] }),
      dish('Apfelschorle vom Hof', 'Getränke', [['3 dl', 5], ['5 dl', 7.5]], { tags: ['vegan'] }),
    ],
  };
}

function shop(): Seed {
  const product = (title: string, price: number, extra: Record<string, unknown> = {}) => ({
    collection: 'products',
    data: { title, price: chf(price), images: [], vat: 'standard', digital: false, variants: [], ...extra },
  });
  return {
    tagline: 'Dinge für jeden Tag, gut gemacht',
    footer: 'Versand innert 2 Arbeitstagen. Ab CHF 100.– portofrei.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Neu im Laden',
        title: 'Dinge für jeden Tag, die man gerne in der Hand hat.',
        text: 'Keramik aus der eigenen Werkstatt, Kaffee aus einer Rösterei um die Ecke, Leinen aus dem Emmental.',
        primary: { label: 'Zum Laden', href: '/laden' },
      }),
      b('products', { heading: 'Gerade beliebt', count: 6 }),
      b('list', {
        heading: 'Gut zu wissen',
        style: 'columns',
        items: [
          { title: 'Versand in 2 Tagen', text: 'Was bis 14 Uhr bestellt ist, geht am selben Tag zur Post.', meta: '' },
          { title: 'Ab CHF 100.– portofrei', text: 'Darunter kostet der Versand pauschal CHF 9.–.', meta: '' },
          { title: '30 Tage Rückgabe', text: 'Unbenutzt zurück, Geld zurück. Ohne Wenn und Aber.', meta: '' },
        ],
      }),
      b('split', {
        eyebrow: 'Werkstatt',
        heading: 'Jeder Becher geht zweimal durch unsere Hände.',
        body: '<p>Gedreht, getrocknet, glasiert, gebrannt – und dazwischen viel Warten. Darum sieht kein Becher aus wie der andere.</p>',
        side: 'left',
      }),
      b('faq', {
        heading: 'Fragen zur Bestellung',
        items: [
          { q: 'Wie kann ich bezahlen?', a: '<p>Mit TWINT, Kreditkarte, Apple Pay, Google Pay oder auf Rechnung.</p>' },
          { q: 'Liefert ihr auch nach Deutschland?', a: '<p>Im Moment liefern wir in die Schweiz und nach Liechtenstein.</p>' },
          { q: 'Kann ich im Laden abholen?', a: '<p>Ja – wähl an der Kasse «Abholen». Wir melden uns, sobald alles bereit ist.</p>' },
        ],
      }),
    ],
    pages: [contactPage()],
    nav: [
      { id: shortId(), label: 'Laden', href: '/laden' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [
      product('Becher Steinzeug, handgedreht', 38, {
        category: 'Keramik',
        description: '<p>3 dl, spülmaschinenfest. Jeder Becher ist ein Einzelstück – Farbe und Form variieren leicht.</p>',
        variants: [
          { name: 'Salbei', price: null, stock: 12, sku: 'BEC-SAL' },
          { name: 'Sand', price: null, stock: 8, sku: 'BEC-SAN' },
          { name: 'Anthrazit', price: null, stock: 0, sku: 'BEC-ANT' },
        ],
      }),
      product('Kaffee Hausmischung, 250 g', 14.9, { category: 'Kaffee', vat: 'reduced', stock: 40, description: '<p>Brasilien und Äthiopien, mittel geröstet. Schokoladig, wenig Säure. Ganze Bohnen.</p>' }),
      product('Geschirrtuch aus Halbleinen', 24, { category: 'Textil', stock: 25, description: '<p>50 × 70 cm, gewoben im Emmental. Wird mit jedem Waschen weicher.</p>' }),
      product('Geschenkgutschein CHF 50.–', 50, { category: 'Gutscheine', digital: true, vat: 'none', description: '<p>Kommt als PDF per E-Mail und ist zwei Jahre gültig.</p>' }),
    ],
  };
}

function blog(): Seed {
  return {
    tagline: 'Notizen, Gedanken, Fundstücke',
    footer: 'Neue Beiträge auch per RSS.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Journal', title: 'Notizen über Dinge, die mich gerade beschäftigen.', text: 'Ein- bis zweimal im Monat, ohne Algorithmus dazwischen.', primary: { label: 'Neueste Beiträge', href: '/journal' } }),
      b('posts', { heading: 'Neu im Journal', count: 5, layout: 'list' }),
      b('split', { eyebrow: 'Über mich', heading: 'Hallo, schön bist du da.', body: '<p>Erzähl hier in zwei, drei Sätzen, wer du bist und worüber du schreibst. Die Leute wollen wissen, mit wem sie es zu tun haben.</p>', side: 'right' }),
    ],
    pages: [{ slug: 'ueber-mich', title: 'Über mich', blocks: [b('text', { heading: 'Über mich', body: '<p>Schreib hier deine Geschichte. Woher kommst du, was treibt dich an, worüber schreibst du – und worüber nicht?</p>' })] }, contactPage()],
    nav: [
      { id: shortId(), label: 'Journal', href: '/journal' },
      { id: shortId(), label: 'Über mich', href: '/ueber-mich' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [
      {
        collection: 'posts',
        data: {
          title: 'So schreibst du deinen ersten Beitrag',
          excerpt: 'Ein kurzer Leitfaden – und gleichzeitig ein Beispiel dafür, wie ein Beitrag in Nova aussieht.',
          category: 'Anleitung',
          tags: ['Nova', 'Schreiben'],
          date: new Date().toISOString().slice(0, 10),
          allowComments: true,
          blocks: [
            b('text', {
              heading: '',
              body: '<p>Klick auf einen Absatz und schreib einfach los. Was du schreibst, siehst du genau so, wie es später online steht. Gespeichert wird automatisch – oben rechts zeigt ein Punkt, ob alles gesichert ist.</p><h2>Ein guter Titel verspricht etwas</h2><p>Leser entscheiden in einer Sekunde, ob sie klicken. Ein Titel wie «Drei Fehler beim Sauerteig, die ich zwei Jahre lang gemacht habe» funktioniert besser als «Sauerteig».</p><h2>Kurze Absätze, klare Sätze</h2><p>Am Bildschirm liest man anders als auf Papier. Drei bis vier Sätze pro Absatz sind genug. Der SEO-Coach rechts zeigt dir, wenn Sätze zu lang werden.</p>',
            }),
            b('quote', { quote: 'Schreib so, wie du es einer Freundin erzählen würdest.', name: '', role: '' }),
            b('text', { heading: 'Und dann: veröffentlichen', body: '<p>Wenn du zufrieden bist, klick auf «Veröffentlichen». Du kannst einen Beitrag auch für später planen – er erscheint dann von selbst.</p>' }),
          ],
        },
      },
    ],
  };
}

function landing(): Seed {
  return {
    tagline: 'Beratung, die man versteht',
    footer: 'Antwort innert 24 Stunden – versprochen.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Buchhaltung für KMU',
        title: 'Ihre Zahlen. Ordentlich, pünktlich, verständlich erklärt.',
        text: 'Wir übernehmen Buchhaltung, Lohn und Mehrwertsteuer für Betriebe bis 50 Mitarbeitende – und erklären Ihnen einmal im Quartal, was die Zahlen bedeuten.',
        primary: { label: 'Erstgespräch vereinbaren', href: '#anfrage' },
        secondary: { label: 'Preise ansehen', href: '#preise' },
      }),
      b('stats', { heading: '', items: [{ value: '140', label: 'Betriebe betreut' }, { value: '18', label: 'Jahre Erfahrung' }, { value: '24 h', label: 'Antwortzeit' }] }),
      b('list', {
        heading: 'So arbeiten wir',
        intro: 'Drei Schritte, dann läuft es.',
        style: 'numbered',
        items: [
          { title: 'Erstgespräch', text: 'Eine Stunde, kostenlos. Wir schauen gemeinsam, wo es klemmt.', meta: '' },
          { title: 'Offerte mit Fixpreis', text: 'Sie wissen vorher, was es kostet. Keine Überraschungen auf der Rechnung.', meta: '' },
          { title: 'Übernahme', text: 'Wir übernehmen die Unterlagen und richten alles ein. Sie müssen nichts umstellen.', meta: '' },
        ],
      }),
      b('pricing', {
        heading: 'Preise',
        intro: 'Alle Preise exkl. MwSt., monatlich kündbar.',
        plans: [
          { name: 'Einzelfirma', price: 'CHF 180', period: 'pro Monat', description: 'Für Selbständige ohne Angestellte.', features: 'Buchhaltung\nMWST-Abrechnung\nJahresabschluss', link: { label: 'Anfragen', href: '#anfrage' }, highlight: false },
          { name: 'KMU', price: 'CHF 490', period: 'pro Monat', description: 'Bis 10 Mitarbeitende.', features: 'Alles aus «Einzelfirma»\nLohnbuchhaltung\nQuartalsgespräch', link: { label: 'Anfragen', href: '#anfrage' }, highlight: true },
        ],
      }, { anchor: 'preise' }),
      b('faq', {
        heading: 'Häufige Fragen',
        items: [
          { q: 'Muss ich meine Software wechseln?', a: '<p>Nein. Wir arbeiten mit Bexio, Abacus, Banana und Excel.</p>' },
          { q: 'Wie schnell können Sie übernehmen?', a: '<p>In der Regel innert zwei Wochen nach Unterzeichnung.</p>' },
        ],
      }),
      b('form', { heading: 'Erstgespräch vereinbaren', intro: 'Wir melden uns innert 24 Stunden.', form: '@form:kontakt' }, { anchor: 'anfrage', tone: 'muted' }),
    ],
    pages: [],
    nav: [
      { id: shortId(), label: 'Preise', href: '/#preise' },
      { id: shortId(), label: 'Kontakt', href: '/#anfrage' },
    ],
    forms: [{ ...contactForm, name: 'Erstgespräch', fields: [f('text', 'Name', true), f('text', 'Firma'), f('email', 'E-Mail', true), f('tel', 'Telefon'), f('textarea', 'Worum geht es?', true)] }],
    entries: [],
  };
}

function trade(): Seed {
  return {
    tagline: 'Massarbeit aus Holz',
    footer: 'Werkstatt besuchen nach Vereinbarung.',
    home: [
      b('hero', {
        variant: 'statement',
        eyebrow: 'Schreinerei im Dorf',
        title: 'Küchen, Schränke und Treppen – auf den Millimeter gemacht.',
        text: 'Wir planen, bauen und montieren selbst. Sie haben eine Ansprechperson vom ersten Gespräch bis zur letzten Schraube.',
        primary: { label: 'Offerte anfragen', href: '/offerte' },
        secondary: { label: 'Referenzen ansehen', href: '/arbeiten' },
      }),
      b('list', {
        heading: 'Leistungen',
        style: 'rows',
        items: [
          { title: 'Küchen nach Mass', text: 'Planung, Bau, Montage – inklusive Geräte und Abdeckungen.', meta: 'ab CHF 18 000' },
          { title: 'Einbauschränke', text: 'Für Dachschrägen, Nischen und alles, was nicht rechtwinklig ist.', meta: 'ab CHF 3 400' },
          { title: 'Reparaturen', text: 'Türen, Fenster, Möbel – auch kleine Aufträge.', meta: 'CHF 95 / Std.' },
        ],
      }),
      b('projects', { heading: 'Zuletzt fertig geworden', count: 4, filter: false }),
      b('testimonials', { items: [{ quote: 'Pünktlich, sauber, und am Schluss war die Küche genau so, wie wir sie uns vorgestellt hatten.', name: 'Familie Huber', role: 'Küche in Altbau, 2025' }] }),
      b('cta', { heading: 'Was dürfen wir für Sie bauen?', primary: { label: 'Offerte anfragen', href: '/offerte' } }, { tone: 'inverse' }),
    ],
    pages: [
      {
        slug: 'offerte',
        title: 'Offerte',
        blocks: [b('form', { heading: 'Offerte anfragen', intro: 'Je genauer Ihre Angaben, desto genauer unsere Offerte. Fotos helfen sehr.', form: '@form:offerte' })],
      },
      contactPage(),
    ],
    nav: [
      { id: shortId(), label: 'Referenzen', href: '/arbeiten' },
      { id: shortId(), label: 'Offerte', href: '/offerte' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [
      contactForm,
      {
        key: 'offerte',
        name: 'Offerte',
        submit: 'Anfrage senden',
        success: 'Danke! Wir schauen uns Ihre Angaben an und melden uns innert zwei Arbeitstagen.',
        fields: [
          f('select', 'Worum geht es?', true, { options: ['Küche', 'Schrank', 'Treppe', 'Reparatur', 'Anderes'] }),
          f('textarea', 'Beschreibung', true, { placeholder: 'Masse, Material, Wünsche …' }),
          f('file', 'Fotos oder Plan'),
          f('step', 'Kontaktangaben'),
          f('text', 'Name', true),
          f('email', 'E-Mail', true),
          f('tel', 'Telefon'),
          f('text', 'Ort des Projekts'),
        ],
      },
    ],
    entries: [
      { collection: 'projects', data: { title: 'Küche in Eiche geölt', client: 'Privat, Uster', year: 2025, category: 'Küchen', summary: 'Altbauküche mit schiefen Wänden – und trotzdem überall 3 mm Fuge.', images: [] } },
      { collection: 'projects', data: { title: 'Garderobe unter der Treppe', client: 'Privat, Wetzikon', year: 2025, category: 'Schränke', summary: 'Sechs Auszüge, ein Sitzplatz, null verschenkter Raum.', images: [] } },
    ],
  };
}

function studio(): Seed {
  return {
    tagline: 'Haare mit Haltung',
    footer: 'Termine auch kurzfristig – einfach anrufen.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Coiffeur', title: 'Ein Schnitt, der auch in drei Wochen noch sitzt.', text: 'Wir nehmen uns Zeit fürs Gespräch, bevor die Schere kommt.', primary: { label: 'Termin anfragen', href: '/termin' }, secondary: { label: 'Preise', href: '#preise' } }),
      b('list', {
        heading: 'Preise',
        intro: 'Inklusive Waschen und Föhnen.',
        style: 'rows',
        items: [
          { title: 'Damen Schnitt', text: '', meta: '45 Min · 78.–' },
          { title: 'Herren Schnitt', text: '', meta: '30 Min · 48.–' },
          { title: 'Farbe, ganzer Kopf', text: 'Mit Pflege und Schnitt', meta: '120 Min · ab 160.–' },
          { title: 'Strähnen', text: 'Mit Pflege und Schnitt', meta: '150 Min · ab 190.–' },
          { title: 'Kinder bis 12', text: '', meta: '20 Min · 28.–' },
        ],
      }, { anchor: 'preise' }),
      b('people', { heading: 'Team', items: [{ name: 'Sina', role: 'Inhaberin, Farbe', text: 'Seit 15 Jahren am Stuhl.', image: null }, { name: 'Luca', role: 'Herren & Kurzhaar', text: 'Fade, Klassisch, Bart.', image: null }] }),
      b('hours', { heading: 'Öffnungszeiten' }),
      b('cta', { heading: 'Lust auf etwas Neues?', primary: { label: 'Termin anfragen', href: '/termin' } }, { tone: 'accent' }),
    ],
    pages: [{ slug: 'termin', title: 'Termin', blocks: [b('booking', { heading: 'Termin buchen', intro: 'Wähle, was wir machen dürfen, und eine freie Zeit. Die Bestätigung kommt per E-Mail.' }), b('contact', { heading: 'Lieber anrufen?', showHours: true })] }, contactPage()],
    nav: [
      { id: shortId(), label: 'Preise', href: '/#preise' },
      { id: shortId(), label: 'Termin', href: '/termin' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Damen Schnitt', description: 'Waschen, schneiden, föhnen.', duration: 60, buffer: 10, price: 89 },
        { name: 'Herren Schnitt', description: 'Mit Waschen.', duration: 30, buffer: 5, price: 49 },
        { name: 'Farbe', description: 'Ansatz oder ganz, inkl. Schnitt.', duration: 120, buffer: 15, price: 165 },
        { name: 'Beratung', description: 'Kostenlos, 15 Minuten.', duration: 15, price: 0 },
      ],
      resources: [
        { name: 'Sina', kind: 'staff', capacity: 1 },
        { name: 'Luca', kind: 'staff', capacity: 1 },
      ],
    },
    entries: [],
  };
}

function practice(): Seed {
  return {
    tagline: 'Physiotherapie im Quartier',
    footer: 'Termine nach ärztlicher Verordnung oder als Selbstzahler.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Physiotherapie', title: 'Wieder schmerzfrei bewegen – Schritt für Schritt.', text: 'Wir behandeln nach ärztlicher Verordnung und begleiten Sie mit einem Übungsplan, der in Ihren Alltag passt.', primary: { label: 'Termin buchen', href: '/termin' } }),
      b('list', {
        heading: 'Angebot',
        style: 'columns',
        items: [
          { title: 'Manuelle Therapie', text: 'Bei Rücken-, Nacken- und Gelenkbeschwerden.', meta: '' },
          { title: 'Sportphysiotherapie', text: 'Nach Verletzungen und Operationen, bis zum Wiedereinstieg.', meta: '' },
          { title: 'Medizinische Trainingstherapie', text: 'Gezieltes Training an Geräten, begleitet.', meta: '' },
        ],
      }),
      b('faq', {
        heading: 'Gut zu wissen',
        items: [
          { q: 'Brauche ich eine Verordnung?', a: '<p>Für die Abrechnung über die Krankenkasse ja. Ohne Verordnung behandeln wir Sie als Selbstzahler.</p>' },
          { q: 'Wie lange dauert eine Sitzung?', a: '<p>In der Regel 30 Minuten, die erste Sitzung 45 Minuten.</p>' },
          { q: 'Was muss ich mitbringen?', a: '<p>Die Verordnung, bequeme Kleidung und ein Handtuch.</p>' },
        ],
      }),
      b('hours'),
      b('contact', { heading: 'Praxis', showHours: false }),
    ],
    pages: [
      { slug: 'termin', title: 'Termin', blocks: [b('booking', { heading: 'Termin buchen', intro: 'Bitte bringen Sie zur ersten Behandlung die ärztliche Verordnung mit.' }), b('contact', { heading: 'Lieber anrufen?', showHours: true })] },
      contactPage('kontakt', 'Termin anfragen'),
    ],
    nav: [
      { id: shortId(), label: 'Termin', href: '/termin' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [],
    booking: {
      mode: 'appointment',
      services: [
        { name: 'Erste Behandlung', description: 'Befund und erste Therapie, mit Verordnung.', duration: 45, buffer: 15 },
        { name: 'Folgebehandlung', description: 'Laufende Therapie.', duration: 30, buffer: 10 },
      ],
      resources: [
        { name: 'Sandra Keller', kind: 'staff', capacity: 1 },
        { name: 'Jonas Frei', kind: 'staff', capacity: 1 },
      ],
    },
  };
}

function portfolio(): Seed {
  return {
    tagline: 'Gestaltung für Marken mit Haltung',
    footer: 'Zürich · Arbeiten für Kunden in der ganzen Schweiz.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Studio für Gestaltung', title: 'Wir gestalten Marken, die man wiedererkennt, ohne das Logo zu sehen.', primary: { label: 'Arbeiten ansehen', href: '/arbeiten' }, secondary: { label: 'Anfragen', href: '/kontakt' } }),
      b('projects', { heading: 'Ausgewählte Arbeiten', count: 6, filter: true }),
      b('logos', { heading: 'Wir haben gearbeitet für' }),
      b('quote', { quote: 'Sie haben verstanden, was wir sind, bevor wir es selbst sagen konnten.', name: 'Mirjam S.', role: 'Geschäftsführerin, Bäckerei Moser' }),
      b('cta', { heading: 'Neues Projekt?', text: 'Erzähl uns davon. Wir antworten persönlich.', primary: { label: 'Kontakt', href: '/kontakt' } }),
    ],
    pages: [contactPage()],
    nav: [
      { id: shortId(), label: 'Arbeiten', href: '/arbeiten' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [
      { collection: 'projects', data: { title: 'Bäckerei Moser – neues Erscheinungsbild', client: 'Bäckerei Moser', year: 2025, category: 'Marke', summary: 'Ein Erscheinungsbild, das nach frischem Brot riecht.', images: [] } },
      { collection: 'projects', data: { title: 'Velowerkstatt Kette – Website', client: 'Kette GmbH', year: 2024, category: 'Web', summary: 'Reparaturtermine online, ohne Telefonschlaufe.', images: [] } },
    ],
  };
}

function hotel(): Seed {
  return {
    tagline: 'Zwölf Zimmer über dem See',
    footer: 'Check-in ab 15 Uhr, Check-out bis 11 Uhr.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Hotel & Restaurant', title: 'Zwölf Zimmer, ein See und keine Eile.', text: 'Frühstück bis elf, Sauna bis zehn, und abends ein Glas Wein auf der Terrasse.', primary: { label: 'Zimmer anfragen', href: '/anfrage' } }),
      b('list', {
        heading: 'Zimmer',
        style: 'rows',
        items: [
          { title: 'Doppelzimmer Seeseite', text: '18 m², Balkon, Blick auf den See', meta: 'ab CHF 220' },
          { title: 'Doppelzimmer Hofseite', text: '16 m², ruhig, mit Sitzecke', meta: 'ab CHF 180' },
          { title: 'Suite', text: '32 m², Wohnraum, freistehende Badewanne', meta: 'ab CHF 340' },
        ],
      }),
      b('split', { eyebrow: 'Frühstück', heading: 'Brot vom Dorfbeck, Konfi aus dem Garten.', body: '<p>Bis elf Uhr, auch am Sonntag. Wer länger schläft, bekommt ein Frühstück auf das Zimmer.</p>', side: 'right' }),
      b('faq', { heading: 'Gut zu wissen', items: [{ q: 'Sind Hunde willkommen?', a: '<p>Ja, gegen CHF 20 pro Nacht.</p>' }, { q: 'Gibt es Parkplätze?', a: '<p>Acht Plätze direkt beim Haus, kostenlos.</p>' }] }),
      b('contact', { heading: 'Anreise', showHours: false }),
    ],
    pages: [{ slug: 'anfrage', title: 'Anfrage', blocks: [b('form', { heading: 'Zimmer anfragen', intro: 'Wir antworten innert 24 Stunden mit Verfügbarkeit und Preis.', form: '@form:zimmer' })] }, contactPage()],
    nav: [
      { id: shortId(), label: 'Anfrage', href: '/anfrage' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [
      contactForm,
      {
        key: 'zimmer',
        name: 'Zimmeranfrage',
        submit: 'Anfrage senden',
        success: 'Danke! Wir melden uns innert 24 Stunden mit einem Angebot.',
        fields: [
          f('date', 'Anreise', true),
          f('date', 'Abreise', true),
          f('select', 'Zimmer', false, { options: ['Egal', 'Doppelzimmer Seeseite', 'Doppelzimmer Hofseite', 'Suite'] }),
          f('select', 'Personen', true, { options: ['1', '2', '3', '4'] }),
          f('text', 'Name', true),
          f('email', 'E-Mail', true),
          f('textarea', 'Wünsche'),
        ],
      },
    ],
    entries: [],
  };
}

function club(): Seed {
  return {
    tagline: 'Gemeinsam laufen seit 1972',
    footer: 'Training jeden Dienstag und Donnerstag, 18:30 beim Schulhaus.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Laufverein', title: 'Gemeinsam laufen. Bei jedem Wetter, in jedem Tempo.', text: 'Dienstag und Donnerstag um 18:30 beim Schulhaus. Probetraining jederzeit – einfach vorbeikommen.', primary: { label: 'Mitglied werden', href: '/mitmachen' } }),
      b('posts', { heading: 'Aus dem Verein', count: 3, layout: 'list' }),
      b('stats', { items: [{ value: '1972', label: 'gegründet' }, { value: '86', label: 'Mitglieder' }, { value: '2×', label: 'Training pro Woche' }] }),
      b('cta', { heading: 'Mitlaufen?', text: 'Jahresbeitrag CHF 60, Jugendliche gratis.', primary: { label: 'Mitglied werden', href: '/mitmachen' } }, { tone: 'muted' }),
    ],
    pages: [{ slug: 'mitmachen', title: 'Mitmachen', blocks: [b('form', { heading: 'Mitglied werden', form: '@form:beitritt' })] }, contactPage()],
    nav: [
      { id: shortId(), label: 'Neuigkeiten', href: '/journal' },
      { id: shortId(), label: 'Mitmachen', href: '/mitmachen' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm, { key: 'beitritt', name: 'Beitritt', submit: 'Anmelden', success: 'Willkommen! Wir melden uns mit allen Infos.', fields: [f('text', 'Name', true), f('email', 'E-Mail', true), f('date', 'Geburtsdatum', true), f('checkbox', 'Ich möchte den Newsletter erhalten')] }],
    entries: [{ collection: 'posts', data: { title: 'Rückblick: Greifenseelauf', excerpt: '23 von uns am Start, 23 im Ziel.', category: 'Vereinsleben', date: new Date().toISOString().slice(0, 10), blocks: [b('text', { heading: '', body: '<p>Schreib hier über euer letztes Rennen, den Vereinsausflug oder die Generalversammlung.</p>' })] } }],
  };
}

function nonprofit(): Seed {
  return {
    tagline: 'Wir bringen Velos zurück auf die Strasse',
    footer: 'Gemeinnütziger Verein, steuerbefreit.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Verein', title: 'Ausrangierte Velos reparieren – und an Menschen weitergeben, die eines brauchen.', primary: { label: 'Unterstützen', href: '/kontakt' } }),
      b('stats', { heading: 'Seit 2019', items: [{ value: '1 240', label: 'Velos repariert' }, { value: '38', label: 'Freiwillige' }, { value: '12', label: 'Partnerorganisationen' }] }),
      b('split', { eyebrow: 'Wie es funktioniert', heading: 'Jeden Samstag in der Werkstatt.', body: '<p>Freiwillige reparieren gespendete Velos. Sozialdienste vermitteln sie weiter. Wer mag, schraubt mit und lernt dabei.</p>', side: 'right' }),
      b('posts', { heading: 'Neuigkeiten', count: 3 }),
      b('cta', { heading: 'Ein Velo im Keller?', text: 'Wir holen es ab – in der ganzen Stadt.', primary: { label: 'Velo spenden', href: '/kontakt' } }, { tone: 'accent' }),
    ],
    pages: [contactPage()],
    nav: [
      { id: shortId(), label: 'Neuigkeiten', href: '/journal' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [],
  };
}

function adult(): Seed {
  return {
    tagline: 'Diskret. Volljährig. Respektvoll.',
    footer: 'Zutritt ab 18 Jahren. Wir achten auf Einvernehmlichkeit und Diskretion.',
    home: [
      b('hero', { variant: 'statement', eyebrow: 'Studio', title: 'Diskret, gepflegt und mit klaren Regeln.', text: 'Bei uns arbeiten ausschliesslich volljährige Personen, selbstbestimmt und mit gültiger Bewilligung.', primary: { label: 'Wer heute da ist', href: '/profile' } }),
      b('profiles', { heading: 'Heute für dich da', onlyAvailable: true }),
      b('list', {
        heading: 'Hausregeln',
        style: 'numbered',
        items: [
          { title: 'Respekt', text: 'Ein Nein ist ein Nein. Wer sich nicht daran hält, muss gehen.', meta: '' },
          { title: 'Hygiene', text: 'Dusche vor jedem Besuch, frische Wäsche in jedem Zimmer.', meta: '' },
          { title: 'Diskretion', text: 'Separater Eingang, neutrale Rechnung, keine Daten an Dritte.', meta: '' },
        ],
      }),
      b('hours', { heading: 'Öffnungszeiten' }),
      b('contact', { heading: 'Anfahrt', showHours: false }),
    ],
    pages: [contactPage()],
    nav: [
      { id: shortId(), label: 'Profile', href: '/profile' },
      { id: shortId(), label: 'Kontakt', href: '/kontakt' },
    ],
    forms: [contactForm],
    entries: [],
  };
}

const SEEDS: Record<string, (name: string) => Seed> = {
  restaurant,
  shop,
  blog,
  landing,
  trade,
  studio,
  practice,
  portfolio,
  hotel,
  club,
  nonprofit,
  adult,
};

/** Replaces form placeholders («@form:key») with real IDs. */
function linkForms(blocks: Block[], forms: Map<string, string>): Block[] {
  return blocks.map((bl) => {
    const form = bl.props.form;
    if (typeof form === 'string' && form.startsWith('@form:')) return { ...bl, props: { ...bl.props, form: forms.get(form.slice(6)) ?? null } };
    return bl;
  });
}

export async function seedSite(sectors: string[], siteName: string, userId: string): Promise<{ tagline: string; footer: string; nav: NavItem[] }> {
  const seeds = sectors.filter((s) => SEEDS[s]).map((s) => SEEDS[s](siteName));
  if (!seeds.length) seeds.push(landing());
  const primary = seeds[0];
  const formIds = new Map<string, string>();
  const nav: NavItem[] = [];
  const now = new Date().toISOString();

  await sql.begin(async (tx) => {
    for (const s of seeds) {
      for (const form of s.forms) {
        if (formIds.has(form.key)) continue;
        const [existing] = await tx`select id from forms where name = ${form.name}`;
        if (existing) {
          formIds.set(form.key, existing.id as string);
          continue;
        }
        const [row] = await tx`
          insert into forms (name, fields, settings) values (${form.name}, ${json(form.fields)},
            ${json({ submitLabel: form.submit, successMessage: form.success, notifyEmail: '', createLead: true, turnstile: false })})
          returning id`;
        formIds.set(form.key, row.id as string);
      }
    }
    const upsertPage = async (slug: string, title: string, blocks: Block[]) => {
      const data = { title, blocks: linkForms(blocks, formIds), seo: {} };
      await tx`
        insert into entries (collection, slug, status, data, published_data, published_slug, published_at, author_id)
        values ('pages', ${slug}, 'published', ${json(data)}, ${json(data)}, ${slug}, ${now}, ${userId})
        on conflict (collection, slug) do update set data = excluded.data, published_data = excluded.published_data, status = 'published', updated_at = now()`;
    };
    await upsertPage('', siteName, primary.home);
    const seenPages = new Set<string>();
    for (const s of seeds)
      for (const p of s.pages) {
        if (seenPages.has(p.slug)) continue;
        seenPages.add(p.slug);
        await upsertPage(p.slug, p.title, p.blocks);
      }
    let order = 0;
    for (const s of seeds)
      for (const e of s.entries) {
        const data = { seo: {}, ...e.data, blocks: e.data.blocks ? linkForms(e.data.blocks as Block[], formIds) : undefined };
        if (!data.blocks) delete data.blocks;
        const slug = slugify(String(e.data.title));
        await tx`
          insert into entries (collection, slug, status, data, published_data, published_slug, published_at, author_id, sort_index)
          values (${e.collection}, ${slug}, 'published', ${json(data)}, ${json(data)}, ${slug}, ${now}, ${userId}, ${++order})
          on conflict (collection, slug) do nothing`;
      }
    for (const s of seeds) for (const n of s.nav) if (!nav.some((x) => x.href === n.href)) nav.push(n);
    // Reservation & Termine: only on a fresh setup, never on top of the business's own.
    const booking = seeds.find((s) => s.booking)?.booking;
    const [{ n: existing }] = await tx`select count(*)::int as n from booking_services`;
    if (booking && !existing) {
      let i = 0;
      for (const r of booking.resources)
        await tx`insert into booking_resources (name, kind, capacity, sort_index) values (${r.name}, ${r.kind}, ${r.capacity}, ${i++})`;
      i = 0;
      for (const sv of booking.services)
        await tx`
          insert into booking_services (name, description, duration_min, buffer_min, price, sort_index)
          values (${sv.name}, ${sv.description ?? ''}, ${sv.duration}, ${sv.buffer ?? 0}, ${sv.price === undefined ? null : chf(sv.price)}, ${i++})`;
    }
  });
  const bookingMode = seeds.find((s) => s.booking)?.booking?.mode;
  if (bookingMode) {
    const current = await getSettings();
    await updateSettings({ booking: { ...current.booking, mode: bookingMode, autoConfirm: bookingMode === 'table' } });
  }
  bumpGeneration();
  return { tagline: primary.tagline, footer: primary.footer, nav };
}

export function modulesFor(sectors: string[]): string[] {
  return [...new Set(sectors.flatMap((s) => SECTOR_MAP[s]?.modules ?? []))];
}
