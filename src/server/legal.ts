import { eidGate } from './age-verify';
import { statsConfig, type StatsConfig } from '../shared/stats-services';
import type { SiteSettings } from '../shared/types';
import { createBlock } from '../shared/blocks';
import { env } from './env';
import { mailConfigured } from './mail';

/**
 * Generates Impressum, Datenschutzerklärung and AGB from what the site
 * actually does (active modules, payment, analytics, embeds). These are
 * templates – the owner is told to have them checked.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const p = (s: string) => `<p>${s}</p>`;
const h = (s: string) => `<h2>${s}</h2>`;

const NOTE =
  '<p><em>Diese Vorlage wurde von Nova anhand der aktiven Funktionen erstellt. Sie ersetzt keine Rechtsberatung – bitte lass sie prüfen, bevor du sie veröffentlichst.</em></p>';

function address(s: SiteSettings) {
  const b = s.business;
  return [esc(b.legalName || s.name), esc(b.street), `${esc(b.zip)} ${esc(b.city)}`, b.country === 'CH' ? 'Schweiz' : esc(b.country)].filter((x) => x.trim()).join('<br>');
}

export function impressum(s: SiteSettings): string {
  const b = s.business;
  return [
    h('Kontakt'),
    p(address(s)),
    p([b.phone && `Telefon: ${esc(b.phone)}`, b.email && `E-Mail: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`].filter(Boolean).join('<br>')),
    b.uid ? p(`Unternehmens-Identifikationsnummer (UID): ${esc(b.uid)}`) : '',
    h('Verantwortlich für den Inhalt'),
    p(esc(b.legalName || s.name)),
    h('Haftungsausschluss'),
    p('Wir prüfen die Inhalte dieser Website sorgfältig. Für Richtigkeit, Vollständigkeit und Aktualität übernehmen wir dennoch keine Gewähr. Für Inhalte verlinkter Websites sind ausschliesslich deren Betreiber verantwortlich.'),
    NOTE,
  ].join('');
}

export function datenschutz(s: SiteSettings): string {
  const b = s.business;
  const m = new Set(s.modules);
  const stats = statsConfig(s);
  const parts: string[] = [
    p(`Diese Datenschutzerklärung beschreibt, welche Personendaten wir beim Besuch von ${esc(s.name)} bearbeiten. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG) und, soweit anwendbar, nach der EU-Datenschutz-Grundverordnung (DSGVO).`),
    h('Verantwortliche Stelle'),
    p(`${address(s)}${b.email ? `<br>E-Mail: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}`),
    h('Hosting'),
    p(
      'Diese Website wird bei Railway Corporation (USA) betrieben; Daten und Dateien liegen in Rechenzentren des Anbieters. Beim Aufruf werden technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browser) kurzzeitig in Server-Protokollen verarbeitet. Die Übermittlung in die USA erfolgt gestützt auf Standardvertragsklauseln bzw. das Swiss-U.S. Data Privacy Framework.',
    ),
    ...(s.analytics.enabled
      ? [
          h('Statistik ohne Cookies'),
          p(
            'Wir zählen Seitenaufrufe mit einer eigenen, cookielosen Statistik. Dabei wird aus IP-Adresse und Browserkennung zusammen mit einem täglich wechselnden Zufallswert eine Kennung berechnet; die IP-Adresse selbst wird nicht gespeichert. Ein Wiedererkennen über mehrere Tage ist nicht möglich. Es werden keine Daten an Dritte weitergegeben.',
          ),
        ]
      : stats
        ? []
        : [h('Statistik'), p('Wir führen keine Besucherstatistik.')]),
    ...statsSections(stats),
    ...(eidGate(s)
      ? [
          h('Altersprüfung mit der E-ID'),
          p(
            `Bevor du Inhalte dieser Website siehst, prüfen wir dein Alter mit der E-ID des Bundes in der App swiyu. Du entscheidest in der App, ob du die Angabe freigibst. ${
              s.ageGate.minAge === 16 || s.ageGate.minAge === 18
                ? `Wir erhalten dabei nur die Bestätigung, ob du mindestens ${s.ageGate.minAge} Jahre alt bist – nicht deinen Namen und nicht dein Geburtsdatum.`
                : 'Wir erhalten dabei dein Geburtsdatum, vergleichen es einmal mit dem Mindestalter und speichern es nicht.'
            } Die Prüfung läuft über unseren eigenen Prüfdienst (swiyu Generic Verifier), der die Echtheit der E-ID beim Vertrauensregister des Bundes nachprüft. Danach hält ein Cookie die bestandene Prüfung 30 Tage lang fest.`,
          ),
        ]
      : []),
    h('Cookies'),
    p(
      `Wir setzen technisch notwendige Cookies: für die Anmeldung im Verwaltungsbereich${m.has('shop') ? ', für den Warenkorb' : ''}${s.ageGate.enabled ? ', für die Bestätigung der Altersprüfung' : ''}. ${
        stats?.consent.length
          ? `Cookies für Statistik (${stats.consent.join(' und ')}) setzen wir nur mit deiner Einwilligung. Deine Entscheidung speichert dein Browser lokal; ändern kannst du sie jederzeit über «Statistik-Einstellungen» in der Fusszeile.`
          : 'Für Statistik oder Werbung verwenden wir keine Cookies.'
      }`,
    ),
    h('Kontaktformulare'),
    p(
      `Wenn du uns über ein Formular schreibst, speichern wir deine Angaben, um die Anfrage zu bearbeiten${m.has('leads') ? ', und führen dich als Kontakt in unserer Kundenverwaltung' : ''}. ${
        mailConfigured() ? 'Zur Benachrichtigung nutzen wir einen E-Mail-Versanddienst. ' : ''
      }Wir löschen die Daten, wenn sie für den Zweck nicht mehr nötig sind und keine Aufbewahrungspflicht besteht.`,
    ),
  ];
  if (env.turnstile.secret)
    parts.push(h('Spamschutz'), p('Zum Schutz vor automatisierten Anfragen setzen wir Cloudflare Turnstile ein. Dabei werden technische Merkmale deines Browsers an Cloudflare (USA) übermittelt.'));
  if (m.has('shop'))
    parts.push(
      h('Bestellungen'),
      p(
        'Für die Abwicklung von Bestellungen bearbeiten wir Name, Adresse, E-Mail, Telefonnummer und Bestelldaten. Buchhaltungsrelevante Daten bewahren wir während der gesetzlichen Frist von zehn Jahren auf.',
      ),
      env.stripe.secretKey
        ? p(
            'Online-Zahlungen wickelt Stripe Payments Europe Ltd. (Irland) ab. Zahlungsdaten wie Kartennummern erhalten wir nicht. Es gilt die Datenschutzerklärung von Stripe: <a href="https://stripe.com/ch/privacy">stripe.com/ch/privacy</a>.',
          )
        : '',
      s.shop.cartReminders?.enabled
        ? p(
            'Setzt du an der Kasse das Häkchen für eine Erinnerung, speichern wir deine E-Mail-Adresse, deinen Namen und den Warenkorb, um dich einmal per E-Mail daran zu erinnern, falls du die Bestellung nicht abschliesst. Über den Link in dieser E-Mail löschst du die Angaben sofort; sonst löschen wir sie nach 14 Tagen.',
          )
        : '',
      p(
        'Trägst du dich bei einem ausverkauften Produkt ein, speichern wir deine E-Mail-Adresse, bis es wieder erhältlich ist, schicken dir eine einzige Nachricht und löschen sie danach – spätestens nach einem Jahr.',
      ),
      s.shop.reviews ? p('Bei Bewertungen speichern wir Name, Sterne, Text und E-Mail-Adresse. Veröffentlicht werden nur Name, Sterne und Text.') : '',
    );
  if (m.has('blog') && s.blog.comments)
    parts.push(h('Kommentare'), p('Bei Kommentaren speichern wir Name, Kommentartext und – falls angegeben – die E-Mail-Adresse. Die E-Mail-Adresse wird nicht veröffentlicht.'));
  if (s.consent.youtube || s.consent.vimeo || s.consent.maps)
    parts.push(
      h('Eingebettete Inhalte'),
      p(
        `Videos${s.consent.maps ? ' und Karten' : ''} laden erst, wenn du auf «Inhalt laden» klickst. Erst dann werden Daten an den jeweiligen Anbieter übertragen (${[
          s.consent.youtube && 'YouTube/Google',
          s.consent.vimeo && 'Vimeo',
          s.consent.maps && 'OpenStreetMap Foundation',
        ]
          .filter(Boolean)
          .join(', ')}). Wenn du «immer laden» wählst, merkt sich dein Browser diese Entscheidung lokal.`,
      ),
    );
  parts.push(
    h('Deine Rechte'),
    p(
      'Du kannst jederzeit Auskunft über deine bei uns gespeicherten Daten verlangen, sie berichtigen oder löschen lassen und der Bearbeitung widersprechen. Schreib uns dafür an die oben genannte Adresse. Du hast ausserdem das Recht, dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) bzw. bei der zuständigen Aufsichtsbehörde zu beschweren.',
    ),
    p(`Stand: ${new Date().toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })}`),
    NOTE,
  );
  return parts.join('');
}

export function agb(s: SiteSettings): string {
  const sh = s.shop;
  return [
    h('Geltungsbereich'),
    p(`Diese Allgemeinen Geschäftsbedingungen gelten für alle Bestellungen im Online-Shop von ${esc(s.business.legalName || s.name)}.`),
    h('Preise'),
    p(`Alle Preise verstehen sich in ${esc(sh.currency)} inklusive der gesetzlichen Mehrwertsteuer. Versandkosten werden vor dem Abschluss der Bestellung angezeigt.`),
    h('Vertragsschluss'),
    p('Mit dem Klick auf «Zahlungspflichtig bestellen» gibst du ein verbindliches Angebot ab. Der Vertrag kommt mit unserer Bestellbestätigung per E-Mail zustande.'),
    h('Zahlung'),
    p(
      [env.stripe.secretKey && 'Online-Zahlung (TWINT, Kreditkarte, Apple Pay, Google Pay) über Stripe', sh.invoiceEnabled && 'Rechnung, zahlbar innert 30 Tagen'].filter(Boolean).join('; ') + '.',
    ),
    h('Lieferung'),
    p(
      `Wir liefern nach ${sh.shipping.countries.map((c) => new Intl.DisplayNames(['de-CH'], { type: 'region' }).of(c) ?? c).join(', ')}. Der Versand kostet pauschal ${(sh.shipping.flat / 100).toFixed(2)} ${esc(sh.currency)}${
        sh.shipping.freeFrom !== null ? `, ab einem Bestellwert von ${(sh.shipping.freeFrom / 100).toFixed(2)} ${esc(sh.currency)} ist er kostenlos` : ''
      }.${sh.shipping.pickup ? ' Abholung ist kostenlos möglich.' : ''}`,
    ),
    h('Rückgabe'),
    p('Unbenutzte Ware kannst du innert 30 Tagen nach Erhalt in der Originalverpackung zurücksenden. Die Kosten der Rücksendung trägst du. Digitale Produkte sind vom Umtausch ausgeschlossen, sobald der Download begonnen hat.'),
    h('Gewährleistung'),
    p('Es gelten die gesetzlichen Bestimmungen. Mängel meldest du uns bitte innert 14 Tagen nach Erhalt.'),
    h('Anwendbares Recht'),
    p(`Es gilt Schweizer Recht. Gerichtsstand ist ${esc(s.business.city || 'der Sitz der Anbieterin')}. Zwingende Verbraucherschutzbestimmungen deines Wohnsitzstaates bleiben vorbehalten.`),
    NOTE,
  ].join('');
}

export function legalPages(s: SiteSettings) {
  const pages = [
    { slug: 'impressum', title: 'Impressum', body: impressum(s) },
    { slug: 'datenschutz', title: 'Datenschutzerklärung', body: datenschutz(s) },
  ];
  if (s.modules.includes('shop')) pages.push({ slug: 'agb', title: 'Allgemeine Geschäftsbedingungen', body: agb(s) });
  return pages.map((x) => ({ ...x, blocks: [createBlock('text', { heading: x.title, body: x.body, width: 'narrow' })] }));
}

/** What the privacy policy has to say about statistics services from outside. */
function statsSections(stats: StatsConfig | null): string[] {
  if (!stats) return [];
  const out: string[] = [];
  if (stats.plausible) {
    const own = !stats.plausible.src.startsWith('https://plausible.io/');
    out.push(
      h('Statistik mit Plausible'),
      p(
        `Wir zählen Besuche zusätzlich mit Plausible Analytics${
          own ? ` auf einem eigenen Server (${esc(new URL(stats.plausible.src).host)})` : ' (Plausible Insights OÜ, Estland; Daten in der EU)'
        }. Plausible setzt keine Cookies und speichert keine IP-Adressen; aus IP-Adresse und Browserkennung wird eine täglich wechselnde Kennung berechnet. Erfasst werden aufgerufene Seite, Herkunftsseite, Browser, Betriebssystem, Gerätetyp und Land. Eine Wiedererkennung über mehrere Tage ist nicht möglich.`,
      ),
    );
  }
  if (stats.matomo) {
    const host = esc(new URL(stats.matomo.url).host);
    out.push(
      h('Statistik mit Matomo'),
      p(
        stats.matomo.cookies
          ? `Mit deiner Einwilligung werten wir Besuche mit Matomo aus, betrieben auf ${host}. Matomo setzt dann Cookies (_pk_id, _pk_ses), um dich bei späteren Besuchen wiederzuerkennen (bis zu 13 Monate). Übertragen werden IP-Adresse, aufgerufene Seiten, Herkunftsseite, Browser, Betriebssystem und Bildschirmgrösse. Ohne Einwilligung wird Matomo nicht geladen. Die Einwilligung kannst du jederzeit über «Statistik-Einstellungen» in der Fusszeile widerrufen.`
          : `Wir werten Besuche mit Matomo aus, betrieben auf ${host}, ohne Cookies. Übertragen werden IP-Adresse, aufgerufene Seiten, Herkunftsseite, Browser, Betriebssystem und Bildschirmgrösse; eine Wiedererkennung über Cookies findet nicht statt.`,
      ),
    );
  }
  if (stats.ga4)
    out.push(
      h('Google Analytics'),
      p(
        'Mit deiner Einwilligung nutzen wir Google Analytics 4 von Google Ireland Limited (Irland) bzw. Google LLC (USA), um zu verstehen, wie die Website genutzt wird. Google Analytics setzt Cookies (_ga, _ga_*), die bis zu zwei Jahre gespeichert bleiben, und überträgt Nutzungsdaten wie aufgerufene Seiten, Gerät, Browser und den ungefähren Standort an Google; dabei können Daten in die USA gelangen (Swiss-U.S. bzw. EU-U.S. Data Privacy Framework). IP-Adressen speichert Google Analytics 4 nach Angaben von Google nicht. Ohne Einwilligung wird Google Analytics nicht geladen und es werden keine Daten an Google übertragen. Die Einwilligung kannst du jederzeit über «Statistik-Einstellungen» in der Fusszeile widerrufen; die Cookies werden dann gelöscht.',
      ),
    );
  return out;
}
