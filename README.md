# Nova

Ein CMS, zwei Modi. **Studio** für Menschen, die einfach ihre Website pflegen wollen – direkt auf der Seite klicken und schreiben. **Werkbank** für alle, die mehr wollen: eigene Inhaltstypen, CSS, Code-Ansicht pro Block, REST-API, Webhooks, SQL. Beide Modi arbeiten auf denselben Daten; umschalten mit <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>.</kbd>.

Gebaut nach der PRD «Nova CMS» (Okt. 2026). Gehostet auf **Railway** mit **Railway Postgres** und **Railway Bucket**.

---

## Auf Railway in Betrieb nehmen

1. **Projekt anlegen** und dieses Repository als Service verbinden. Railway erkennt `railway.json` und baut mit dem `Dockerfile`.
2. **Postgres hinzufügen** (Create → Database → PostgreSQL).
3. **Bucket hinzufügen** (Create → Bucket, Region wählen).
4. Im Nova-Service unter **Variables** setzen (Variable References):

   | Variable | Wert |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `BUCKET` | `${{Bucket.BUCKET}}` |
   | `ENDPOINT` | `${{Bucket.ENDPOINT}}` |
   | `REGION` | `${{Bucket.REGION}}` |
   | `ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` |
   | `SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` |

   Alternativ den AWS-SDK-Preset von Railway nutzen («Automatically provisioning the variables») – Nova versteht auch `AWS_ACCESS_KEY_ID`, `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME` usw. Wenn der Credentials-Tab des Buckets «path-style» verlangt: `S3_FORCE_PATH_STYLE=true`.
5. **Networking → Generate Domain.** `PUBLIC_URL` ist nicht nötig, Nova liest `RAILWAY_PUBLIC_DOMAIN`.
6. **Deploy.** Migrationen laufen beim Start automatisch (mit Advisory-Lock, also sicher bei parallelen Deploys).
7. In den **Deploy-Logs** steht ein **Einrichtungscode**:

   ```
   ┌──────────────────────────────────────────────┐
   │  Einrichtungscode: 482-913                   │
   ```

   Öffne `https://<deine-domain>/admin`, gib den Code ein und leg dein Konto an. Der Code verhindert, dass jemand Fremdes eine frisch deployte Instanz übernimmt. Wer ihn fest setzen will: `NOVA_SETUP_CODE`.
8. Der Setup-Assistent stellt fünf Fragen (Sparte, Name, Stil mit Live-Vorschau, Domain, Modus) und legt eine fertige Website mit echten Beispielinhalten an. Besucher sehen eine «Hier entsteht etwas»-Seite, bis du im Dashboard auf **Website veröffentlichen** klickst.

### Optionale Variablen

| Variable | Wofür |
|---|---|
| `RESEND_API_KEY`, `MAIL_FROM` | E-Mails (Formular-Benachrichtigungen, Bestellbestätigungen, Reservationen, Newsletter, Mitgliederkonten, Einladungen). **Railway blockiert SMTP auf Free/Hobby-Plänen** – Resend läuft über HTTPS und funktioniert überall. |
| `SMTP_URL` | Alternativ SMTP, z. B. `smtps://user:pass@host:465` (Railway Pro). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Online-Zahlung: TWINT, Karte, Apple Pay, Google Pay (welche Methoden, stellst du im Stripe-Dashboard ein). Webhook-Ziel: `https://<domain>/_nova/stripe/webhook`, Ereignisse `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; für Tickets, Spenden und Essensbestellungen dieselben; für bezahlte Mitgliedschaften und Monatsspenden zusätzlich `customer.subscription.updated`, `customer.subscription.deleted` und `invoice.paid`. Für «Abo verwalten» muss im Stripe-Dashboard das Kundenportal einmal gespeichert sein. |
| `BREVO_API_KEY` + `BREVO_LIST_ID` oder `MAILCHIMP_API_KEY` + `MAILCHIMP_LIST_ID` | Optional: Die Newsletter-Liste wird dorthin gespiegelt (An- und Abmeldungen, Löschungen). Verschickt wird weiterhin von Nova. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Optionaler unsichtbarer Spamschutz (Cloudflare Turnstile) pro Formular zuschaltbar. |
| `APP_SECRET` | Schlüssel für signierte Cookies (Warenkorb, Altersschranke). Ohne Angabe erzeugt Nova einen und speichert ihn in der Datenbank. |
| `HOST` | Bind-Adresse, Standard `0.0.0.0`. Für Railways privates Netzwerk (IPv6) `::`. |

### Eigene Domain

In Railway: Service → Settings → Networking → Custom Domain. Den angezeigten CNAME beim Domain-Anbieter eintragen. In Nova unter **Einstellungen → Domain** die Adresse hinterlegen – dort steht dieselbe Anleitung für Laien.

### Was wo gespeichert wird

- **Postgres:** Inhalte (JSONB), Versionen, Einstellungen, Formulare, Kontakte, Bestellungen, Statistik.
- **Bucket:** Original-Uploads, alle Bildvarianten (AVIF/WebP/JPEG, on-the-fly erzeugt und gecacht), Social-Vorschaubilder, tägliche Sicherungen (`backups/`, 30 Tage).
- Railway-Buckets sind privat. Bildvarianten liefert Nova selbst aus (unveränderliche URLs, `Cache-Control: immutable`), grosse Dateien wie Videos und Downloads per kurzlebiger Presigned-URL direkt aus dem Bucket (Bucket-Egress ist bei Railway gratis, Range-Requests für Video funktionieren).

---

## Lokal entwickeln

```bash
npm install
cp .env.example .env            # DATABASE_URL auf ein lokales Postgres
npm run dev                     # Website :3000, Admin mit HMR :5173/admin/
npm test                        # Unit- und Integrationstests (brauchen Postgres, siehe TEST_DATABASE_URL)
npm run typecheck
npm run build && npm start      # Produktions-Build
```

Ohne Bucket-Variablen speichert Nova Dateien unter `.data/uploads` – praktisch lokal, auf Railway aber flüchtig.

---

## Architektur

Ein TypeScript-Monolith mit Headless-Kern – Admin, Website und externe Apps sprechen dieselben Daten an.

```
src/
  shared/    Feld- und Block-Schemas, Content-Typen, Rollen, SEO-Coach, Sanitizer – von Server und Admin geteilt
  server/    Hono-Server: Auth, API, Medien (sharp + S3), Shop, Statistik, Scheduler, Backups, Export
  site/      Website-Renderer: 28 Blöcke, 4 Themes, JSON-LD, Seiten-Templates, Client-Scripts
  admin/     React-Admin: Studio/Werkbank, On-Page-Editor, ⌘K, Setup-Assistent
migrations/  SQL-Migrationen
test/        Vitest: Unit + Integration gegen echtes Postgres
```

**Entscheide und Begründungen**

- **Renderer: eigenes serverseitiges Rendering statt Astro/Next.** Die PRD lässt den Entscheid offen. Für den Editor zählt, dass exakt derselbe Code die Live-Seite und die bearbeitbare Leinwand rendert – Blöcke sind reine Funktionen `props → HTML`. Öffentliche Seiten laden genau ein Script (`site.js`, 5 KB unkomprimiert) für Statistik, Zwei-Klick-Einbettungen, Lightbox und Warenkorb; alles funktioniert auch ohne JavaScript. CSS ist inline (≈ 9 KB gzip), Schriften selbst gehostet und vorgeladen.
- **Ein Datenmodell:** Seiten, Beiträge, Produkte, Gerichte, Projekte, Profile und eigene Typen sind alle `entries` mit JSONB-Daten, einer Arbeitskopie (`data`) und einer Live-Kopie (`published_data`).
- **On-Page-Editor:** Die Seite wird im iframe im Bearbeitungsmodus gerendert. Ein kleines Bridge-Script macht Textfelder direkt bearbeitbar, zeichnet Auswahl, «+»-Einfügepunkte und Drag-Griffe (Nachbarn weichen live aus) und meldet Änderungen ans Admin. Das Admin hält Daten und Verlauf, speichert automatisch (Statuspunkt statt Spinner) und lässt Blöcke nach Inspector-Änderungen neu rendern.
- **Schutzzonen** werden serverseitig erzwungen: Ein Studio-Request kann gesperrte Blöcke nicht verschieben, umgestalten oder löschen – auch nicht mit einem manipulierten Request.
- **Ein Prozess, ein Replica.** Scheduler (geplantes Veröffentlichen, Backups, Aufräumen), Rate-Limits und Seiten-Cache leben im Prozess. Für mehrere Replicas müssten diese nach Postgres/Redis wandern.

---

## Was umgesetzt ist

**Editor & Inhalte**
- Visueller On-Page-Editor: direkt auf der Seite tippen, Fliesstext mit Formatierungsleiste, Blöcke per Drag & Drop oder Pfeiltasten, «+» zwischen Abschnitten, Duplizieren, Entfernen mit «Rückgängig».
- 34 Blöcke: Einstieg (3 Varianten), Text, Text mit Bild, Bild, Galerie (Raster/Mosaik/Streifen, Lightbox), Video (YouTube/Vimeo im Datenschutzmodus mit Zwei-Klick, eigene Videos), Aufzählung (nummeriert/Preisliste/Spalten), Aufruf, FAQ (mit FAQPage-JSON-LD), Stimmen, Zitat, Zahlen, Preise, Team, Logos, Knöpfe, Abstand, Formular, Reservation, Events & Kurse, Immobilien, Spenden, Newsletter-Anmeldung, Mitgliedschaft, Kontaktangaben, Öffnungszeiten (mit «jetzt geöffnet»), Karte (OpenStreetMap, Zwei-Klick), Beiträge, Produkte, Speisekarte, Projekte, Profile, Wiederverwendbare Sektion, Eigener Code (Werkbank, im Studio nur die Platzhalter als Felder).
- Responsive Vorschau (Computer/Tablet/Handy), Abstände und Ausblenden pro Breakpoint.
- Unbegrenztes Rückgängig/Wiederholen (300 Schritte im Speicher), Versionsverlauf mit Vergleich und Wiederherstellen.
- Entwürfe, «Zur Freigabe» für Autoren, geplante Veröffentlichung, Änderungen verwerfen, offline nehmen.
- Globale Elemente: Header, Menü (mit Untermenüs), Footer, wiederverwendbare Sektionen.
- Content-Typen mit 22 Feldtypen inkl. Relationen, wiederholbaren Gruppen und Validierung; im Studio automatisch als Formular mit Live-Vorschau, in der Werkbank mit Schlüsseln und als JSON editierbar.
- Sammlungsseiten mit Kategorie-Filter, Schlagwörtern und Paginierung.
- Seitenvorlagen (Leer, Über uns, Leistungen, Kontakt, FAQ).

**Medien**
- Mediathek mit Ordnern, Schlagwörtern, Suche, Drag & Drop und Upload vom Handy.
- Typprüfung über den Dateiinhalt (nicht die Endung), keine SVG-Uploads (XSS).
- AVIF/WebP/JPEG in 9 Breiten, on-the-fly erzeugt und im Bucket gecacht, `srcset`/`sizes`, Lazy-Loading, Fokuspunkt.
- Nicht-destruktives Bearbeiten im Browser: Zuschneiden (mit Seitenverhältnis), Drehen, Helligkeit.
- Alt-Text-Pflichthinweis überall, Verwendungsnachweis vor dem Löschen, private Dateien (Downloads, Einwilligungen).

**Formulare, Kontakte, Benutzer**
- Formular-Builder: 9 Feldtypen, Bedingungen, Mehrschritt, Datei-Upload; Spam-Schutz ohne Rätsel (Honeypot, Zeitprüfung, Rate-Limit, optional Turnstile); Einträge, CSV-Export, E-Mail-Benachrichtigung; funktioniert ohne JavaScript.
- CRM-light: Kontakte aus Formularen, Pipeline (Kanban), Notizen, Auftragswert, CSV, Webhooks für Zapier/Make.
- Rollen Inhaber, Admin, Redaktion, Autor, Mitglied; pro Rolle festlegbar, ob die Werkbank erlaubt ist.
- Passkeys (WebAuthn): Anmelden mit Fingerabdruck, Gesicht oder Geräte-PIN, auch direkt als Vorschlag im E-Mail-Feld; Verwaltung unter «Konto». Ein Passkey mit Benutzerprüfung gilt als zwei Faktoren, sonst greift zusätzlich die 2FA.
- 2FA mit TOTP, Sitzungsverwaltung, Login-Rate-Limits, Audit-Log.

**Module**
- Blog: Kategorien, Schlagwörter, Autor, Lesezeit, Serien, verwandte Beiträge, RSS, moderierte Kommentare.
- Shop: Varianten mit eigenem Preis/Lager, Lagerführung (mit Schutz gegen veraltete Editor-Stände), serverseitiger Warenkorb ohne JavaScript, Kasse auf einer Seite, Gutscheine, MwSt. CH (Normal/reduziert, korrekt aufgeteilt inkl. Rabatt und Versand), Versandregeln mit Gratis-Grenze und Abholung, digitale Produkte mit Download nach Zahlung, Stripe Checkout (TWINT, Karte, Apple/Google Pay) oder Rechnung, Bestellübersicht, druckbare Rechnung mit Schweizer QR-Zahlteil (eigener Generator nach Swiss Implementation Guidelines: QR-IBAN mit QR-Referenz, normale IBAN mit RF-Referenz, Zahlteil 210 × 105 mm mit Empfangsschein), Bestätigungs-Mails.
- Speisekarte: Kategorien, 14 Allergene, Fleisch-/Fischherkunft (CH-Pflicht), Preise pro Grösse, Tageskarte, «ausverkauft», Druckversion (als PDF sichern), QR-Code für Tische, Menu-JSON-LD.
- Portfolio: Projekte, Filter, Lightbox.
- Reservation & Termine: Tische (nach Personen, kleinster passender Tisch) oder Termine (Leistung, Dauer, Pause, Person mit eigenen Arbeitszeiten); freie Zeiten aus Öffnungszeiten, Vorlauf, Horizont, Sperrzeiten und bestehenden Buchungen, ohne Doppelbelegung auch bei gleichzeitigen Anfragen; Buchen ohne JavaScript; Bestätigung, Erinnerung und Absage per E-Mail mit .ics; Gästeseite mit Absagen; Anzahlung über Stripe; Tagesplan im Admin, Telefonbuchungen; Kalender-Abo und Import belegter Zeiten aus fremden Kalendern.
- Bestellung & Lieferung: Take-away und Lieferung direkt aus der Speisekarte («Online bestellbar» pro Gericht, Grössen/Preise, ausverkauft); Warenkorb ohne JavaScript, auf dem Handy mit fixierter Leiste; Zeitfenster aus den Öffnungszeiten plus Zubereitungszeit; Liefergebiet nach PLZ, Liefergebühr, Mindestbestellwert; online (Stripe) oder vor Ort bezahlen; Bestellnummer pro Tag; Statusseite, die sich selbst aktualisiert, und E-Mails bei «bereit» bzw. «unterwegs»; Küche im Admin als Board (Neu → In Zubereitung → Bereit/Unterwegs → Abgeschlossen) mit Ton bei neuen Bestellungen, Bon für 80-mm-Drucker und «Küche voll – pausieren»; MwSt. getrennt nach reduziertem Satz (Speisen) und Normalsatz (Alkohol).
- Events & Tickets und Kurse: Anlässe mit Beginn/Ende, Ort und Ticketkategorien (Preis, Kontingent, Hinweis), Kurse mit mehreren Terminen, Niveau und Leitung; gratis oder bezahlt über Stripe, ohne Überbuchung (Sperre und Halten unbezahlter Plätze für 30 Minuten); Tickets mit eigenem Code und QR-Code auf einer privaten Ticketseite und per E-Mail mit Kalendereintrag; Einlass im Admin mit Kamera-Scanner oder per Handy-Kamera-App, jeder Code nur einmal; Warteliste, die bei freien Plätzen automatisch informiert; Abendkasse/Telefon-Eintrag, Stornieren, Teilnehmerliste als CSV; Event- und Course-JSON-LD, Kalenderdatei pro Anlass.
- Immobilien: Objekte zur Miete oder zum Kauf mit Fotos, Preis (inkl. Nebenkosten), Zimmern, Fläche, Etage, Baujahr, Bezug, Ausstattung und PDF-Dokumentation; Strasse nur auf Wunsch öffentlich; Suche mit Filtern (Angebot, Art, Zimmer, Preis, Ort/PLZ) als teilbare Adresse, ohne JavaScript; Status Verfügbar/Reserviert/Vermietet; Galerie mit Vergrösserung; Anfrageformular mit «Besichtigung gewünscht» direkt ins CRM (mit Notiz), Benachrichtigung und E-Mail; RealEstateListing-JSON-LD; neue Sparte «Immobilien & Verwaltung» mit Beispielobjekten.
- Spenden: Block mit Beträgen und eigenem Betrag, einmalig oder monatlich über Stripe (Monatsspenden als Abo, jede Abbuchung als eigene Zeile), Kampagnen mit Ziel und Fortschrittsbalken, Dankes-E-Mail, private Spendenseite mit «monatliche Spende beenden», Spendenbestätigung fürs Steueramt (pro Zahlung oder als Jahresbestätigung pro Person), Bankverbindung mit QR-Einzahlungsschein (Betrag frei wählbar) als Alternative oder wenn Stripe fehlt, Übersicht nach Jahr und Kampagne, CSV.
- Newsletter: Anmelde-Block mit Double Opt-in, Ausgaben aus Einleitung und Beiträgen (HTML-E-Mail mit Textversion), Test an mich, Versand mit Protokoll pro Empfänger (setzt nach einem Neustart fort, ohne Doppelte), Abmelden mit einem Klick inkl. List-Unsubscribe (RFC 8058), automatisch bei jedem neuen Beitrag oder als Wochenrückblick, Import mit Einwilligungsnachweis, CSV-Export, optionaler Abgleich mit Brevo/Mailchimp.
- Mitglieder: Konten für Besucher:innen (getrennt von den Admin-Benutzern), Registrierung mit Bestätigungslink oder nur auf Einladung, Passwort vergessen, «Mein Konto»; Seiten und Beiträge für alle, Mitglieder oder zahlende Mitglieder – alle anderen sehen Titel, Kurzfassung, den ersten Absatz und eine Einladung; geschützte Inhalte bleiben auch aus Suche, RSS, API und Meta-Beschreibung draussen; bezahlte Mitgliedschaft als Stripe-Abo (Kündigen, Karte und Quittungen im Stripe-Kundenportal), Zugang verschenken, sperren, CSV.
- Profile & Verfügbarkeit mit Einwilligungsnachweis: Profile gehen erst online, wenn Volljährigkeit und Einwilligung bestätigt sind; Widerruf löscht Profil und alle Bilder sofort, auch aus dem Verlauf.

**Mehrsprachigkeit**
- Website in Deutsch, Französisch, Italienisch und Englisch: Hauptsprache unter der normalen Adresse, weitere unter `/fr`, `/it`, `/en` mit eigenen Adressen pro Seite (`/fr/a-propos`), Sprachumschalter im Kopf, `<html lang>`, `og:locale`, hreflang samt x-default, Sitemap mit Sprachversionen, Suche mit der passenden Sprachanalyse, eigener RSS-Feed pro Sprache.
- Übersetzt werden nur Texte, Blöcke und SEO-Angaben; Preise, Lager, Bilder, Daten und Verknüpfungen gelten für alle Sprachen gemeinsam (ein Produkt bleibt ein Produkt, mit einem Lager). Leere Übersetzungsfelder zeigen das Original, nie eine Lücke.
- Im Editor ein Sprachumschalter mit Stand pro Sprache (online, Entwurf, noch nicht übersetzt), eigener Entwurf, eigenes Veröffentlichen, Verwerfen und Löschen; gemeinsame Felder sind beim Übersetzen gesperrt. Listen zeigen pro Eintrag, welche Sprachen online sind.
- Nicht übersetzte Seiten erscheinen in der Hauptsprache, bleiben aber für Google unsichtbar (noindex, Canonical aufs Original). Ändert sich die Adresse einer Übersetzung, leitet die alte per 301 weiter.
- Alle festen Texte der Website auf Französisch, Italienisch und Englisch (rund 740): Kopf und Fusszeile, Blöcke, Speisekarte mit Allergenen, Formulare und ihre Fehlermeldungen, Reservation, Bestellung & Lieferung, Shop mit Warenkorb und Kasse, Events und Tickets, Spenden mit Spendenbestätigung, Immobilien, Mitgliederkonto, Newsletter, 404 und Suche, dazu Öffnungszeiten, Wochentage und Datumsangaben, Kalender und Video-Player im Browser. Die QR-Rechnung trägt die offiziellen Bezeichnungen des Standards in jeder Sprache. Bestätigungs-Mails, Stripe-Kasse und Weiterleitungen folgen der Sprache, in der die Person unterwegs ist – auch bei Formularen, die von einer `/fr`-Seite abgeschickt werden.
- Einstellungen → Sprachen: Hauptsprache, weitere Sprachen, Name, Kurzbeschreibung, Menü, Fusszeile und Knopf pro Sprache. REST und GraphQL liefern mit `?lang=fr` die Übersetzungen.

**SEO, Performance, Statistik**
- Saubere URLs, automatische 301 bei Adressänderung, Weiterleitungs-Verwaltung inkl. 410.
- Title/Description automatisch, überschreibbar; Sitemap, robots.txt, Canonical, Open Graph, automatisch gerenderte Social-Vorschaubilder in der Theme-Schrift.
- JSON-LD: Organization/LocalBusiness/Restaurant u. a., WebSite mit Suche, BreadcrumbList, BlogPosting, Product/Offer, Menu, FAQPage; Erwachsenen-Kennzeichnung.
- IndexNow-Ping bei Veröffentlichung.
- SEO-Coach im Editor: Ampel, konkrete Handlungen mit «Zur Stelle», Snippet-Vorschau Desktop/Handy, Lesbarkeit (Amstad-Formel für Deutsch; Formeln für FR/IT/EN vorhanden).
- Website-Check: kaputte interne Links, doppelte Titel, verwaiste Seiten, fehlende Alt-Texte und Beschreibungen, fehlende H1.
- Cookielose Statistik: Besuche, Seiten, Quellen, Geräte, Ziele (Formular, Kauf, Reservation, Essensbestellung, Tickets, Spende, Immobilien-Anfrage, Newsletter-Anmeldung, Konto), Umsatz – mit täglich wechselndem, nie gespeichertem Salt, ohne Banner.
- Website-Suche über Postgres-Volltext.

**Design & UX**
- Vier eigenständige Stile (Kante, Bistro, Salon, Feuilleton) mit je drei geprüften Farbpaletten (WCAG-AA-Kontrast), sechs Schriftpaaren, Modular Scale 1.25, Abstands- und Rundungsregler. Selbst gehostete Schriften (kein Google-Fonts-Abruf).
- Admin: eigenes Designsystem und eigenes Icon-Set (20-px-Raster, 1.5 px Strich), eigenständiger Dark Mode, ⌘K-Palette mit Alltagssprache («Öffnungszeiten ändern»), drei Ebenen (Seiten · Inhalte · Einstellungen), Handy-Admin mit Tab-Leiste, Bewegung mit Federn (Blöcke federn ein, Panels wachsen aus dem Auslöser, Konfetti nur beim allerersten Veröffentlichen), `prefers-reduced-motion` respektiert.
- Onboarding: Setup-Assistent mit 5 Fragen und Live-Vorschau mit eigenen Daten, Übernahme von Name/Adresse/Öffnungszeiten aus einer bestehenden Website, Checkliste «Startklar» mit Fortschrittsring, Sicherheitshinweis bis zur 3. Sitzung, einmalige Kontext-Hinweise, Hilfe-Artikel in ⌘K, Angebot zum Werkbank-Wechsel.
- Beispielinhalte für 13 Sparten: echte Schweizer Inhalte statt Platzhaltertext.

**Datenhoheit & Datenschutz**
- Import unter Einstellungen → Import: WordPress (XML-Export oder direkt über die Website-Adresse per REST-API), Squarespace (XML-Export), Wix und andere Blogs (RSS/Atom-Feed, Feed-Adresse wird selbst gesucht), Shopify (Produkt-CSV mit Varianten, Preisen, Lager und Bildern), Markdown (.md oder ZIP mit Frontmatter und Bildern – Jekyll, Hugo, Astro, Obsidian). Erst Vorschau, dann Import; Entwürfe bleiben Entwürfe, Bilder landen in der Mediathek, alte Adressen leiten per 301 weiter, Blog/Shop werden bei Bedarf eingeschaltet. Fremde Adressen werden nur öffentlich abgerufen (keine internen IPs, Grössenlimit).
- Export als ZIP: Inhalte (JSON + Markdown mit Frontmatter), Konfiguration als Code, Original-Medien, CSV für Kontakte/Bestellungen/Formulare.
- Auskunft und Löschung pro E-Mail-Adresse, inklusive Newsletter, Mitgliederkonto und Reservationen (Bestellungen werden wegen der Aufbewahrungspflicht anonymisiert, Reservationen bleiben als belegte Zeit ohne Namen).
- Generator für Impressum, Datenschutzerklärung und AGB aus den tatsächlich aktiven Funktionen – ausdrücklich als Vorlage zur rechtlichen Prüfung.
- Zwei-Klick-Einbettungen, Altersschranke ohne JavaScript, Content-Security-Policy, CSRF-Schutz, Output-Escaping, Rich-Text-Whitelist.
- Tägliche Sicherungen in den Bucket (30 Tage) mit Wiederherstellung per Klick.

**Werkbank**
- Inhaltstypen-Editor (Formular oder JSON), Code-Ansicht pro Block (Props, CSS-Klassen, gescoptes CSS, Schutzzone), Design-Tokens, globales CSS, REST-API `/api/v1` mit Tokens (lesen/schreiben), GraphQL unter `/api/v1/graphql` (Schema aus den Inhaltstypen erzeugt: eigene Typen pro Inhaltstyp, Bilder als `Media` mit fertigen Varianten-URLs, Verknüpfungen aufgelöst, Filter/Sortierung/Seiten, Mutationen mit Schreib-Token, Tiefenlimit, SDL unter `/api/v1/graphql/schema.graphql`), typisiertes TypeScript-SDK unter `/api/v1/sdk.ts` (aus den Inhaltstypen erzeugt: ein Interface pro Typ, Auswahlfelder als Literal-Typen, `list`/`all`/`get`/`create`/`update`/`graphql`, ohne Abhängigkeiten, läuft in Browser, Node, Deno, Bun und Edge), Explorer für REST und GraphQL, signierte Webhooks mit Test, Weiterleitungen, SQL-Konsole (nur lesend, 5 s, protokolliert), Protokoll.
- CLI `nova` (eine Datei ohne Abhängigkeiten, Node 22+, unter `/api/v1/cli.mjs` oder im Repo als `npx nova` nach dem Build): `init`, `pull` (alle Inhalte inkl. Entwürfe als JSON-Dateien), `status`, `push` (nur Geändertes, neue Dateien werden angelegt, `--publish`, `--dry-run`), `types` (SDK), `graphql`. Geschützt gegen Überschreiben: was in der Zwischenzeit im Studio geändert wurde, lehnt `push` ab (409), und `pull` überschreibt keine lokalen Änderungen. Damit lässt sich ein Git-Repository als zweite Quelle führen (Git-Sync, Beispiel unten).

- Hooks: eigene JavaScript-Funktionen vor dem Speichern (Daten ändern oder ablehnen), vor dem Veröffentlichen (prüfen) und vor dem Absenden eines Formulars (Felder ändern, ablehnen mit Meldung an den Besucher, still als Spam verwerfen) – pro Inhaltstyp oder für alle. Sie laufen in QuickJS als WebAssembly, einer eigenen JavaScript-Engine ohne Netz, Dateien, Prozess und Timer, mit 50 ms und 16 MB pro Aufruf und frischem Zustand bei jedem Aufruf. Code wird beim Speichern geprüft; «Mit echten Daten testen» zeigt Eingabe, Ergebnis, `console.log` und Laufzeit, ohne etwas zu speichern.

**Git-Sync mit GitHub Actions** – `content/` im Repository, Token als Secret `NOVA_TOKEN`:

```yaml
# .github/workflows/nova.yml
on:
  push: { branches: [main], paths: ['content/**'] }   # Git → Website
  schedule: [{ cron: '17 * * * *' }]                    # Website → Git, stündlich
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    env: { NOVA_TOKEN: '${{ secrets.NOVA_TOKEN }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: curl -fsSO https://deine-website.ch/api/v1/cli.mjs
      - if: github.event_name == 'push'
        run: node cli.mjs push --publish
      - run: node cli.mjs pull
      - run: |
          git config user.name nova && git config user.email nova@users.noreply.github.com
          git add content && git commit -m "Inhalte von der Website" && git push || true
```

## Was (noch) nicht umgesetzt ist

Ehrlich aufgelistet – vieles davon ist in der PRD ohnehin P1/P2:

- **Echtzeit-Kollaboration** (Yjs), **Offline-Bearbeitung**, Kommentare am Element.
- **KI-Assistent.**
- **Admin-UI in mehreren Sprachen** (Admin nur Deutsch; Lesbarkeitsformeln für FR/IT/EN sind vorbereitet).
- **Marktplatz** für Erweiterungen und **Preview-Deployments pro Branch** (auf Railway lassen sich PR-Umgebungen einschalten; Nova startet dort mit eigener Datenbank, eingebaut ist nichts davon).
- **Video-Transcoding** (Videos werden so ausgeliefert, wie sie hochgeladen werden), **Malware-Scan** von Uploads, echte **Altersverifikation** über einen Anbieter.
- Google-Search-Console-Verbindung per OAuth, GA4/Matomo/Plausible mit Consent-Manager, Meilisearch.
- Die PRD nennt «ca. 40 Blöcke», «ca. 400 Icons» und «3 Vorlagen pro Sparte in 2 Stilen» – umgesetzt sind 34 Blöcke, rund 90 Icons und 4 Stile × 3 Paletten, die jede Sparte nutzen kann.
- Lighthouse-Werte sind nicht automatisiert in CI gemessen.

---

## Tests

```bash
npm test
```

79 Tests: Sanitizer (XSS-Fälle), TOTP gegen RFC-6238-Vektoren, signierte Cookies, Passwort-Hashing, HTML-Escaping, CSS-Scoping, CSV-Formel-Injection, Öffnungszeiten über Zeitzonen, SEO-Coach, und Integrationstests gegen Postgres: Setup-Code, CSRF, Holding-Page vor dem Launch, JSON-LD, Sitemap, Auto-301, Versionskonflikte, Schutzzonen gegen manipulierte Requests, Warenkorb mit MwSt./Gutschein/Versand und Lagerabbuchung, Spam-Abwehr und Lead-Erfassung, Headless-API, Datenschutz-Löschung, Rechte von Autoren, Reservationen ohne Doppelbuchung, Newsletter (Double Opt-in, automatischer Versand genau einmal, One-Click-Abmeldung), Mitgliederbereich (nichts sickert durch Suche/Feed/API, Bestätigung, Passwort zurücksetzen, Sperren, bezahlter Zugang), Tickets (Kontingent, QR-Einlass genau einmal, Storno füllt aus der Warteliste, Kurse mit mehreren Terminen), Spenden (Mindestbetrag, monatlich mit Folgezahlungen, doppelter Webhook ignoriert, Kampagnenstand, Bestätigung), Immobilien (Filter, Vergebenes ausgeblendet, Strasse geschützt, Anfrage ins CRM), Bestellung & Lieferung (Zeitfenster über Zeitzone und Ruhetage, MwSt.-Aufteilung, Liefergebiet, Mindestbestellwert, Küchen-Ablauf ohne Sprünge, Pause), QR-Rechnung (IBAN-Prüfung, Prüfziffern und Nutzdaten gegen die Beispiele des Standards, Zahlteil auf offenen Rechnungen), Passkeys (Optionen pro Domain, gefälschte Antworten und wiederverwendete Challenges abgelehnt), Import (WordPress-XML, Feeds, Shopify-CSV, Markdown mit Frontmatter, HTML-Bereinigung, Import mit Weiterleitungen), GraphQL (Abfragen per GET/POST, Variablen, Tiefenlimit, Mutationen nur mit Token und nur per POST, Mitgliederinhalte bleiben geschützt), TypeScript-SDK (wird im Test mit `tsc --strict` geprüft, falsche Felder und Werte schlagen fehl), CLI (echter Server, pull → bearbeiten → push, neue Dateien, Konflikt bei zwischenzeitlicher Änderung), Hooks (Ändern, Ablehnen, Spam, kein Weg aus der Sandbox, Endlosschleife und Speicherbombe gestoppt, kaputter Code wird nicht gespeichert), Mehrsprachigkeit (eigene Adressen, Weiterleitung auf die übersetzte Adresse, hreflang/Canonical/Sitemap, nicht Übersetztes mit noindex, Preise bleiben gemeinsam, REST/GraphQL mit `?lang`, ausgeschaltete Sprachen gibt es nicht, Systemtexte und Formular-Antworten in der Sprache der Seite, jeder verwendete Text hat alle drei Übersetzungen mit denselben Platzhaltern, Öffnungszeiten auf Französisch/Italienisch).
