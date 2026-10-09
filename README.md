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
| `RESEND_API_KEY`, `MAIL_FROM` | E-Mails (Formular-Benachrichtigungen, Bestellbestätigungen, Einladungen). **Railway blockiert SMTP auf Free/Hobby-Plänen** – Resend läuft über HTTPS und funktioniert überall. |
| `SMTP_URL` | Alternativ SMTP, z. B. `smtps://user:pass@host:465` (Railway Pro). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Online-Zahlung: TWINT, Karte, Apple Pay, Google Pay (welche Methoden, stellst du im Stripe-Dashboard ein). Webhook-Ziel: `https://<domain>/_nova/stripe/webhook`, Ereignisse `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. |
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
- 28 Blöcke: Einstieg (3 Varianten), Text, Text mit Bild, Bild, Galerie (Raster/Mosaik/Streifen, Lightbox), Video (YouTube/Vimeo im Datenschutzmodus mit Zwei-Klick, eigene Videos), Aufzählung (nummeriert/Preisliste/Spalten), Aufruf, FAQ (mit FAQPage-JSON-LD), Stimmen, Zitat, Zahlen, Preise, Team, Logos, Knöpfe, Abstand, Formular, Kontaktangaben, Öffnungszeiten (mit «jetzt geöffnet»), Karte (OpenStreetMap, Zwei-Klick), Beiträge, Produkte, Speisekarte, Projekte, Profile, Wiederverwendbare Sektion, Eigener Code (Werkbank, im Studio nur die Platzhalter als Felder).
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
- 2FA mit TOTP, Sitzungsverwaltung, Login-Rate-Limits, Audit-Log.

**Module**
- Blog: Kategorien, Schlagwörter, Autor, Lesezeit, Serien, verwandte Beiträge, RSS, moderierte Kommentare.
- Shop: Varianten mit eigenem Preis/Lager, Lagerführung (mit Schutz gegen veraltete Editor-Stände), serverseitiger Warenkorb ohne JavaScript, Kasse auf einer Seite, Gutscheine, MwSt. CH (Normal/reduziert, korrekt aufgeteilt inkl. Rabatt und Versand), Versandregeln mit Gratis-Grenze und Abholung, digitale Produkte mit Download nach Zahlung, Stripe Checkout (TWINT, Karte, Apple/Google Pay) oder Rechnung, Bestellübersicht, druckbare Rechnung, Bestätigungs-Mails.
- Speisekarte: Kategorien, 14 Allergene, Fleisch-/Fischherkunft (CH-Pflicht), Preise pro Grösse, Tageskarte, «ausverkauft», Druckversion (als PDF sichern), QR-Code für Tische, Menu-JSON-LD.
- Portfolio: Projekte, Filter, Lightbox.
- Profile & Verfügbarkeit mit Einwilligungsnachweis: Profile gehen erst online, wenn Volljährigkeit und Einwilligung bestätigt sind; Widerruf löscht Profil und alle Bilder sofort, auch aus dem Verlauf.

**SEO, Performance, Statistik**
- Saubere URLs, automatische 301 bei Adressänderung, Weiterleitungs-Verwaltung inkl. 410.
- Title/Description automatisch, überschreibbar; Sitemap, robots.txt, Canonical, Open Graph, automatisch gerenderte Social-Vorschaubilder in der Theme-Schrift.
- JSON-LD: Organization/LocalBusiness/Restaurant u. a., WebSite mit Suche, BreadcrumbList, BlogPosting, Product/Offer, Menu, FAQPage; Erwachsenen-Kennzeichnung.
- IndexNow-Ping bei Veröffentlichung.
- SEO-Coach im Editor: Ampel, konkrete Handlungen mit «Zur Stelle», Snippet-Vorschau Desktop/Handy, Lesbarkeit (Amstad-Formel für Deutsch; Formeln für FR/IT/EN vorhanden).
- Website-Check: kaputte interne Links, doppelte Titel, verwaiste Seiten, fehlende Alt-Texte und Beschreibungen, fehlende H1.
- Cookielose Statistik: Besuche, Seiten, Quellen, Geräte, Ziele (Formular, Kauf), Umsatz – mit täglich wechselndem, nie gespeichertem Salt, ohne Banner.
- Website-Suche über Postgres-Volltext.

**Design & UX**
- Vier eigenständige Stile (Kante, Bistro, Salon, Feuilleton) mit je drei geprüften Farbpaletten (WCAG-AA-Kontrast), sechs Schriftpaaren, Modular Scale 1.25, Abstands- und Rundungsregler. Selbst gehostete Schriften (kein Google-Fonts-Abruf).
- Admin: eigenes Designsystem und eigenes Icon-Set (20-px-Raster, 1.5 px Strich), eigenständiger Dark Mode, ⌘K-Palette mit Alltagssprache («Öffnungszeiten ändern»), drei Ebenen (Seiten · Inhalte · Einstellungen), Handy-Admin mit Tab-Leiste, Bewegung mit Federn (Blöcke federn ein, Panels wachsen aus dem Auslöser, Konfetti nur beim allerersten Veröffentlichen), `prefers-reduced-motion` respektiert.
- Onboarding: Setup-Assistent mit 5 Fragen und Live-Vorschau mit eigenen Daten, Übernahme von Name/Adresse/Öffnungszeiten aus einer bestehenden Website, Checkliste «Startklar» mit Fortschrittsring, Sicherheitshinweis bis zur 3. Sitzung, einmalige Kontext-Hinweise, Hilfe-Artikel in ⌘K, Angebot zum Werkbank-Wechsel.
- Beispielinhalte für 12 Sparten: echte Schweizer Inhalte statt Platzhaltertext.

**Datenhoheit & Datenschutz**
- Export als ZIP: Inhalte (JSON + Markdown mit Frontmatter), Konfiguration als Code, Original-Medien, CSV für Kontakte/Bestellungen/Formulare.
- Auskunft und Löschung pro E-Mail-Adresse (Bestellungen werden wegen der Aufbewahrungspflicht anonymisiert).
- Generator für Impressum, Datenschutzerklärung und AGB aus den tatsächlich aktiven Funktionen – ausdrücklich als Vorlage zur rechtlichen Prüfung.
- Zwei-Klick-Einbettungen, Altersschranke ohne JavaScript, Content-Security-Policy, CSRF-Schutz, Output-Escaping, Rich-Text-Whitelist.
- Tägliche Sicherungen in den Bucket (30 Tage) mit Wiederherstellung per Klick.

**Werkbank**
- Inhaltstypen-Editor (Formular oder JSON), Code-Ansicht pro Block (Props, CSS-Klassen, gescoptes CSS, Schutzzone), Design-Tokens, globales CSS, REST-API `/api/v1` mit Tokens (lesen/schreiben) und Explorer, signierte Webhooks mit Test, Weiterleitungen, SQL-Konsole (nur lesend, 5 s, protokolliert), Protokoll.

## Was (noch) nicht umgesetzt ist

Ehrlich aufgelistet – vieles davon ist in der PRD ohnehin P1/P2:

- **Echtzeit-Kollaboration** (Yjs), **Offline-Bearbeitung**, Kommentare am Element.
- **KI-Assistent.**
- **Mehrsprachigkeit** der Website und der Admin-UI (Admin nur Deutsch; Lesbarkeitsformeln für FR/IT/EN sind vorbereitet).
- **Import** aus WordPress, Wix, Squarespace, Shopify.
- Module **Reservation & Termine, Bestellung & Lieferung, Events & Tickets, Kurse & Mitglieder, Immobilien, Spenden**; Mitgliederbereiche und Newsletter.
- **Passkeys** (2FA ist TOTP), **GraphQL** (nur REST), typisierte SDKs.
- **Serverseitige Hooks in einer Sandbox** (V8-Isolates), Marktplatz, Git-Sync, CLI, Preview-Deployments pro Branch.
- **Video-Transcoding** (Videos werden so ausgeliefert, wie sie hochgeladen werden), **Malware-Scan** von Uploads, **QR-Rechnung**, echte **Altersverifikation** über einen Anbieter.
- Google-Search-Console-Verbindung per OAuth, GA4/Matomo/Plausible mit Consent-Manager, Meilisearch.
- Die PRD nennt «ca. 40 Blöcke», «ca. 400 Icons» und «3 Vorlagen pro Sparte in 2 Stilen» – umgesetzt sind 28 Blöcke, rund 90 Icons und 4 Stile × 3 Paletten, die jede Sparte nutzen kann.
- Lighthouse-Werte sind nicht automatisiert in CI gemessen.

---

## Tests

```bash
npm test
```

35 Tests: Sanitizer (XSS-Fälle), TOTP gegen RFC-6238-Vektoren, signierte Cookies, Passwort-Hashing, HTML-Escaping, CSS-Scoping, CSV-Formel-Injection, Öffnungszeiten über Zeitzonen, SEO-Coach, und Integrationstests gegen Postgres: Setup-Code, CSRF, Holding-Page vor dem Launch, JSON-LD, Sitemap, Auto-301, Versionskonflikte, Schutzzonen gegen manipulierte Requests, Warenkorb mit MwSt./Gutschein/Versand und Lagerabbuchung, Spam-Abwehr und Lead-Erfassung, Headless-API, Datenschutz-Löschung, Rechte von Autoren.
