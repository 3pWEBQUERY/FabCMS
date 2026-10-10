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
8. Der Setup-Assistent stellt fünf Fragen (Sparte, Name, Vorlage und Stil mit Live-Vorschau, Domain, Modus) und legt eine fertige Website mit echten Beispielinhalten an. Besucher sehen eine «Hier entsteht etwas»-Seite, bis du im Dashboard auf **Website veröffentlichen** klickst.

### Optionale Variablen

| Variable | Wofür |
|---|---|
| `RESEND_API_KEY`, `MAIL_FROM` | E-Mails (Formular-Benachrichtigungen, Bestellbestätigungen, Reservationen, Newsletter, Mitgliederkonten, Einladungen). **Railway blockiert SMTP auf Free/Hobby-Plänen** – Resend läuft über HTTPS und funktioniert überall. |
| `SMTP_URL` | Alternativ SMTP, z. B. `smtps://user:pass@host:465` (Railway Pro). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Online-Zahlung: TWINT, Karte, Apple Pay, Google Pay (welche Methoden, stellst du im Stripe-Dashboard ein). Webhook-Ziel: `https://<domain>/_nova/stripe/webhook`, Ereignisse `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; für Tickets, Spenden und Essensbestellungen dieselben; für bezahlte Mitgliedschaften und Monatsspenden zusätzlich `customer.subscription.updated`, `customer.subscription.deleted` und `invoice.paid`. Für «Abo verwalten» muss im Stripe-Dashboard das Kundenportal einmal gespeichert sein. |
| `BREVO_API_KEY` + `BREVO_LIST_ID` oder `MAILCHIMP_API_KEY` + `MAILCHIMP_LIST_ID` | Optional: Die Newsletter-Liste wird dorthin gespiegelt (An- und Abmeldungen, Löschungen). Verschickt wird weiterhin von Nova. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Optionaler unsichtbarer Spamschutz (Cloudflare Turnstile) pro Formular zuschaltbar. |
| `ANTHROPIC_API_KEY`, `NOVA_AI_MODEL` | Optionaler KI-Assistent (Vorschläge für Formulierungen, Bildbeschreibungen, Übersetzungsentwürfe). Zusätzlich unter Einstellungen → Module einschalten. Modell standardmässig `claude-sonnet-5-5`. |
| `NOVA_VIDEO`, `FFMPEG_PATH`, `FFPROBE_PATH` | Videos fürs Web aufbereiten (im Docker-Image enthalten). `NOVA_VIDEO=off` schaltet es aus. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Virenprüfung jedes Uploads mit ClamAV (clamd über TCP, Port 3310). Auf Railway z. B. einen Dienst aus dem Docker-Image `clamav/clamav:stable` anlegen (braucht rund 1,5 GB RAM für die Signaturen) und `CLAMAV_HOST=${{clamav.RAILWAY_PRIVATE_DOMAIN}}` setzen; das private Netz von Railway läuft über IPv6, clamd muss dafür mit `TCPAddr ::` lauschen. Ohne diese Variable prüft Nova nur den Aufbau der Dateien. |
| `MEILI_HOST`, `MEILI_KEY`, `MEILI_INDEX` | Optionale Website-Suche mit Meilisearch (z. B. ein Railway-Dienst aus dem Template «Meilisearch», `MEILI_HOST=http://${{Meilisearch.RAILWAY_PRIVATE_DOMAIN}}:7700`, `MEILI_KEY` = Master-Key; im privaten Netz von Railway (IPv6) muss Meilisearch mit `MEILI_HTTP_ADDR=[::]:7700` lauschen). Ohne: Volltextsuche in Postgres. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optionale Verbindung zur Google Search Console. In der Google Cloud Console einen OAuth-Client vom Typ «Webanwendung» anlegen, Weiterleitungs-URI `https://<deine-domain>/api/gsc/callback`, die Search Console API aktivieren. |
| `NOVA_PREVIEW_DEMO`, `NOVA_PREVIEW` | Preview-Deployments: in einer PR-Umgebung von Railway (oder mit `NOVA_PREVIEW=1`) richtet Nova auf leerer Datenbank selbst eine Demo-Website ein, z. B. `NOVA_PREVIEW_DEMO=restaurant` oder `restaurant:salon`. |
| `SWIYU_VERIFIER_URL`, `SWIYU_ISSUER_DIDS`, `SWIYU_VCT`, `SWIYU_VERIFIER_TOKEN` | Optionale Altersprüfung mit der E-ID des Bundes über einen eigenen swiyu-Verifier (siehe «Altersprüfung mit der E-ID» unten). `SWIYU_ISSUER_DIDS`: die Aussteller, deren Ausweise zählen (kommagetrennt); `SWIYU_VCT`: Ausweistyp, Standard `betaid-sdjwt` (Beta-ID); `SWIYU_VERIFIER_TOKEN` nur, wenn die Management-API per OAuth geschützt ist. |
| `APP_SECRET` | Schlüssel für signierte Cookies (Warenkorb, Altersschranke). Ohne Angabe erzeugt Nova einen und speichert ihn in der Datenbank. |
| `HOST` | Bind-Adresse, Standard `0.0.0.0`. Für Railways privates Netzwerk (IPv6) `::`. |

### Altersprüfung mit der E-ID

Für Websites, die eine echte Altersverifikation brauchen, prüft Nova das Alter mit der staatlichen E-ID in der App swiyu. Die Prüfung selbst (OID4VP, Signatur, Aussteller, Widerruf) übernimmt der **swiyu Generic Verifier** des Bundes – Open Source, als eigener Dienst betrieben:

1. Auf Railway einen Dienst aus dem Image `ghcr.io/swiyu-admin-ch/swiyu-verifier` mit eigener Postgres-Datenbank anlegen und nach der [Anleitung des Bundes](https://github.com/swiyu-admin-ch/swiyu-verifier) einrichten (Verifier-DID und Schlüssel, `EXTERNAL_URL` = öffentliche Adresse des Dienstes – die Wallet muss sie erreichen). Zusätzlich `ADDITIONAL_AUDIT_INFORMATION_CREDENTIAL_SUBJECT_DATA_ENABLED=true` setzen: Nova liest den bestätigten Wert und nicht nur «Prüfung erfolgreich».
2. Die Management-API (`/management/api`) nur im privaten Netz erreichbar lassen und in Nova `SWIYU_VERIFIER_URL=http://${{verifier.RAILWAY_PRIVATE_DOMAIN}}:8080` setzen, dazu `SWIYU_ISSUER_DIDS` (für die Beta-ID die DID des Beta-Ausstellers aus der swiyu-Dokumentation, später die des E-ID-Ausstellers) und bei Bedarf `SWIYU_VCT`.
3. In Nova unter **Einstellungen → Rechtliches → Altersschranke** «E-ID des Bundes (swiyu)» wählen.

Besucher scannen dann einen QR-Code (oder öffnen swiyu direkt auf dem Handy) und geben eine einzige Angabe frei: bei 16 und 18 Jahren nur `age_over_16` bzw. `age_over_18`, bei anderen Grenzen das Geburtsdatum, das Nova einmal vergleicht und nicht speichert. Bis dahin liefert die Website keine Inhalte aus – Seiten enthalten nur die Schranke; Feed, Content-API (ohne Token) und hochgeladene Bilder, Dateien und Videos bleiben zu (ausser Logo und Favicon), danach werden Medien nur privat zwischengespeichert, nie in einem geteilten Cache.

### Eigene Domain

In Railway: Service → Settings → Networking → Custom Domain. Den angezeigten CNAME beim Domain-Anbieter eintragen. In Nova unter **Einstellungen → Domain** die Adresse hinterlegen – dort steht dieselbe Anleitung für Laien.

### Was wo gespeichert wird

- **Postgres:** Inhalte (JSONB), Versionen, Einstellungen, Formulare, Kontakte, Bestellungen, Statistik.
- **Bucket:** Original-Uploads, alle Bildvarianten (AVIF/WebP/JPEG, on-the-fly erzeugt und gecacht), Web-Fassungen der Videos, Social-Vorschaubilder, tägliche Sicherungen (`backups/`, 30 Tage).
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
  site/      Website-Renderer: 40 Blöcke, 4 Themes, JSON-LD, Seiten-Templates, Client-Scripts
  admin/     React-Admin: Studio/Werkbank, On-Page-Editor, ⌘K, Setup-Assistent
migrations/  SQL-Migrationen
test/        Vitest: Unit + Integration gegen echtes Postgres
```

**Entscheide und Begründungen**

- **Renderer: eigenes serverseitiges Rendering statt Astro/Next.** Die PRD lässt den Entscheid offen. Für den Editor zählt, dass exakt derselbe Code die Live-Seite und die bearbeitbare Leinwand rendert – Blöcke sind reine Funktionen `props → HTML`. Öffentliche Seiten laden genau ein Script (`site.js`, 5 KB unkomprimiert) für Statistik, Zwei-Klick-Einbettungen, Lightbox und Warenkorb; alles funktioniert auch ohne JavaScript. CSS ist inline und pro Seite gekürzt: Von den Regeln aller Blöcke und Module (≈ 80 KB) bleibt nur, was die Seite oder eines ihrer Skripte brauchen kann – eine Regel fällt nur weg, wenn jeder ihrer Selektoren eine Klasse verlangt, die weder im HTML noch in den Skripten vorkommt; eigenes Werkbank-CSS, Editor und Vorschau bleiben unberührt (typisch 35 statt 80 KB, HTML gzip rund 11 statt 20 KB; auf 38 Seiten in zwei Bildschirmbreiten pixelgleich mit dem vollen CSS geprüft). Schriften selbst gehostet und vorgeladen; Bistros Fraunces ist fest auf SOFT 100 instanziiert (37 statt 62 KB, `scripts/instance-fonts.py`).
- **Ein Datenmodell:** Seiten, Beiträge, Produkte, Gerichte, Projekte, Profile und eigene Typen sind alle `entries` mit JSONB-Daten, einer Arbeitskopie (`data`) und einer Live-Kopie (`published_data`).
- **On-Page-Editor:** Die Seite wird im iframe im Bearbeitungsmodus gerendert. Ein kleines Bridge-Script macht Textfelder direkt bearbeitbar, zeichnet Auswahl, «+»-Einfügepunkte und Drag-Griffe (Nachbarn weichen live aus) und meldet Änderungen ans Admin. Das Admin hält Daten und Verlauf, speichert automatisch (Statuspunkt statt Spinner) und lässt Blöcke nach Inspector-Änderungen neu rendern.
- **Schutzzonen** werden serverseitig erzwungen: Ein Studio-Request kann gesperrte Blöcke nicht verschieben, umgestalten oder löschen – auch nicht mit einem manipulierten Request.
- **Ein Prozess, ein Replica.** Scheduler (geplantes Veröffentlichen, Backups, Aufräumen), Rate-Limits und Seiten-Cache leben im Prozess. Für mehrere Replicas müssten diese nach Postgres/Redis wandern.

---

## Was umgesetzt ist

**Editor & Inhalte**
- Visueller On-Page-Editor: direkt auf der Seite tippen, Fliesstext mit Formatierungsleiste, Blöcke per Drag & Drop oder Pfeiltasten, «+» zwischen Abschnitten, Duplizieren, Entfernen mit «Rückgängig».
- Eigenes Icon-Set für Website-Inhalte: 300 Symbole im selben 20-px-Raster wie das Admin (1,5 px Strich) – zusammen mit den 100 Admin-Icons rund 400 –, gruppiert nach Essen & Trinken (bis Fondue, Gipfeli und Cervelat), Handwerk & Haus, Schönheit & Pflege, Gesundheit, Laden & Versand, Unterwegs & Zugang (rollstuhlgängig, Hunde willkommen, Parkplatz, Lift, Bergbahn …), Sport & Freizeit (bis Jasskarten), Kultur & Bildung, Büro & Finanzen, Alltag (bis Schweizerkreuz) sowie Natur & Jahreszeiten. Im Raster und in der Aufzählung wählbar (statt Bild bzw. statt Nummer), mit Suche auf Deutsch («Velo», «Kaffee»); auf der Website als Inline-SVG in der Akzentfarbe, rein dekorativ. Die Auswahl im Admin zeigt genau die Zeichnung, die auf der Website erscheint.
- 40 Blöcke: Einstieg (3 Varianten), Text, Text mit Bild, Bild, Galerie (Raster/Mosaik/Streifen, Lightbox), Video (YouTube/Vimeo im Datenschutzmodus mit Zwei-Klick, eigene Videos), Aufzählung (nummeriert/Preisliste/Spalten), Aufruf, FAQ (mit FAQPage-JSON-LD), Stimmen, Zitat, Zahlen, Preise, Team, Logos, Knöpfe, Abstand, Formular, Reservation, Events & Kurse, Immobilien, Spenden, Newsletter-Anmeldung, Mitgliedschaft, Kontaktangaben, Öffnungszeiten (mit «jetzt geöffnet»), Karte (OpenStreetMap, Zwei-Klick), Beiträge, Produkte, Speisekarte, Projekte, Profile, Raster (2–4 Spalten mit Bild, Titel, Text, Link), Ablauf & Chronik, Tabelle (auf dem Handy jede Zeile eine Karte), Vorher/Nachher (Schieber per Maus, Finger oder Pfeiltasten), Hinweis (z. B. Betriebsferien, auf Wunsch nur von–bis sichtbar), Downloads (mit Typ und Grösse), Wiederverwendbare Sektion, Eigener Code (Werkbank, im Studio nur die Platzhalter als Felder).
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
- Jeder Upload wird vor dem Speichern geprüft – aus der Mediathek, aus dem Import und aus Formularen der Website: keine Programme, keine Office-Makros oder ActiveX, keine ZIP-Archive mit Programmen oder Skripten, keine PDFs mit JavaScript, Startbefehlen oder angehängten Dateien (auch in komprimierten Streams und mit maskierten Namen). Mit `CLAMAV_HOST` prüft zusätzlich ClamAV jede Datei mit seinen Signaturen; Funde werden abgelehnt und als Benachrichtigung gemeldet, und ist ClamAV eingerichtet, aber nicht erreichbar, wird nichts ungeprüft gespeichert. Die Mediathek zeigt bei jeder Datei, wie sie geprüft wurde.
- Videos werden nach dem Hochladen im Hintergrund fürs Web aufbereitet (ffmpeg, eines nach dem anderen): H.264/AAC-MP4 mit dem Index am Anfang (Wiedergabe startet sofort) in 1080p und 720p – nie grösser als das Original –, dazu ein Vorschaubild aus dem Video. Die Website spielt auf breiten Bildschirmen 1080p, sonst 720p, mit Byte-Ranges zum Spulen; das Original bleibt für Downloads und als letzte Rückfallebene. Ist das Original schon ein H.264-MP4 und kleiner, läuft es direkt. Die Mediathek zeigt den Stand (in Arbeit, fertig mit Grössen, Fehler mit «Nochmals versuchen»); ältere Videos und durch einen Neustart unterbrochene werden beim Start nachgeholt. Ohne ffmpeg oder mit `NOVA_VIDEO=off` laufen Videos wie hochgeladen.
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
- Alle festen Texte der Website auf Französisch, Italienisch und Englisch (rund 740): Kopf und Fusszeile, Blöcke, Speisekarte mit Allergenen, Formulare und ihre Fehlermeldungen, Reservation, Bestellung & Lieferung, Shop mit Warenkorb und Kasse, Events und Tickets, Spenden mit Spendenbestätigung, Immobilien, Mitgliederkonto, Newsletter, 404 und Suche, dazu Öffnungszeiten, Wochentage und Datumsangaben, Kalender und Video-Player im Browser. Die QR-Rechnung trägt die offiziellen Bezeichnungen des Standards in jeder Sprache. Bestätigungs-Mails, Stripe-Kasse und Weiterleitungen folgen der Sprache, in der die Person unterwegs ist – auch bei Formularen, die von einer `/fr`-Seite abgeschickt werden. Reservationen, Bestellungen, Tickets und Spenden merken sich die Sprache, so dass auch spätere Mails (Erinnerung, Bestätigung nach Zahlung, «bereit» aus der Küche) in ihr ankommen.
- Admin-Oberfläche auf Deutsch, Französisch, Italienisch und Englisch (rund 2700 Texte): pro Person unter «Mein Konto» wählbar, sonst wie im Browser. Dazu Meldungen vom Server (auch mit Namen und Zahlen darin), Benachrichtigungen, SEO-Coach, Block- und Feldnamen, Rollen und Module, Datumsangaben; die Befehlspalette versteht Suchwörter in der eigenen Sprache. Die Übersetzungen werden nur geladen, wenn jemand nicht Deutsch arbeitet.
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
- Gemeinsam bearbeiten in Echtzeit (Yjs): Wer dieselbe Seite oder denselben Eintrag offen hat, sieht Änderungen der anderen sofort; verschiedene Blöcke und verschiedene Felder eines Blocks kommen sich nie in die Quere. Avatare zeigen, wer da ist, ein farbiger Rahmen mit Namen, welchen Block jemand gerade bearbeitet. Gespeichert wird zentral vom Server (über denselben Weg mit Bereinigung, Hooks und Verlauf), Versionskonflikte zwischen Bearbeitenden gibt es nicht mehr. Änderungen von aussen (API, CLI, Verwerfen, Wiederherstellen) erscheinen live in offenen Editoren; lehnt ein Hook ab, sehen es alle. Ohne WebSocket (Proxy, Netz weg) speichert der Editor wie bisher direkt und verbindet sich danach neu. Ein Block, in dem man gerade tippt, wird erst nach einer kurzen Pause neu gezeichnet.
- Offline weiterarbeiten: Ein Service Worker hält die Admin-App, die Vorschau, Bilder und zuletzt geladene Daten bereit, die Admin-App startet also auch ohne Netz. Jede Seite, die einmal live verbunden war, liegt als gemeinsames Dokument im Browser (IndexedDB); fällt das Netz weg, tippt man einfach weiter («Offline · lokal gesichert», auch über ein Neuladen hinweg), und sobald die Verbindung zurück ist, laufen die eigenen Änderungen und die der anderen ohne Konflikt zusammen und werden zentral gespeichert. Veröffentlichen geht erst wieder mit Verbindung. Ohne Netz zeigt die Vorschau den zuletzt geladenen Stand mit den eigenen Texten; neue Blöcke und Bilder erscheinen dort erst wieder online. Abmelden löscht alles, was der Browser offline behalten hat.
- KI-Assistent (optional, in Einstellungen → Module einschaltbar, braucht `ANTHROPIC_API_KEY`): «Umformulieren» unter jedem Textfeld (klarer, kürzer, persönlicher, sachlicher, Rechtschreibung), Bildbeschreibungen aus dem Bild selbst in der Mediathek und ein Übersetzungsentwurf für eine ganze Seite in der Übersetzungsansicht – dort ist vorausgewählt, was noch im Original dasteht, schon Übersetztes bleibt. Alles ist nur ein Vorschlag: Übernommen wird erst per Klick, gespeichert und veröffentlicht wie jede andere Änderung. Die Texte folgen den Hausregeln (Schweizer Rechtschreibung, keine Werbefloskeln, nichts dazuerfinden), Rich Text kommt bereinigt zurück, Fehler des Dienstes werden zu verständlichen Meldungen, pro Person höchstens 60 Vorschläge pro Stunde. Modell über `NOVA_AI_MODEL` wählbar.
- Google Search Console per OAuth (Einstellungen → Suchmaschinen, braucht `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`): verbinden mit dem Google-Konto, die passende Property (Domain oder Adresse) wird selbst gewählt, die Sitemap eingereicht; in der Statistik erscheinen Klicks, Impressionen, Klickrate, Position, Suchbegriffe und Seiten aus der Google-Suche. Der Zugang liegt verschlüsselt in einer eigenen Zeile (nie in den Einstellungen oder im Export), Googles Antwort wird an den Browser gebunden, Trennen gibt den Zugang bei Google zurück.
- Suche auf der Website: Volltextsuche in Postgres in der Sprache der Seite; mit `MEILI_HOST` übernimmt Meilisearch das Finden (Tippfehler, halb getippte Wörter, bessere Reihenfolge). Der Index hält sich selbst aktuell – kurz nach jeder Änderung werden nur geänderte Einträge übertragen, Entferntes gelöscht, einmal pro Stunde alles abgeglichen –, Mitgliederinhalte stehen nur mit dem Titel drin, Sprachen ohne Übersetzung mit dem Original. Was angezeigt wird, kommt immer aus der Datenbank, und antwortet Meilisearch nicht, sucht die Website in Postgres weiter. Unter Einstellungen → Suchmaschinen stehen Zustand und «Index neu aufbauen».
- Weitere Statistik-Dienste neben der eigenen (Einstellungen → Suchmaschinen): Plausible (auch selbst betrieben) und Matomo ohne Cookies laufen sofort; Google Analytics 4 und Matomo mit Cookies erst nach Einwilligung. Der Hinweis dafür erscheint nur, wenn ein solcher Dienst eingerichtet ist, «Nein, danke» und «Einverstanden» sind gleich gross, «Statistik-Einstellungen» in der Fusszeile holt ihn zurück, ein Widerruf löscht die Cookies der Dienste, und Global Privacy Control im Browser gilt als Nein. Vor der Einwilligung wird nichts von Google geladen. Die Content-Security-Policy erlaubt genau die eingerichteten Dienste, Formular-Ziele gehen als Ereignis mit, die Datenschutzerklärung beschreibt jeden Dienst.
- Kommentare im Team: direkt an einem Block oder an der ganzen Seite, Antworten, «Erledigt» (eine neue Antwort öffnet wieder), @Name mit persönlicher Benachrichtigung nur für die erwähnte Person, Antworten gehen an alle im Gespräch, neue Gespräche an die Autorin des Eintrags. Offene Gespräche zeigen sich als Blase am Block im Editor; ein Klick auf die Benachrichtigung öffnet genau dieses Gespräch. Autor:innen sehen Kommentare nur bei eigenen Beiträgen; fremde löschen darf, wer veröffentlichen darf.
- Onboarding: Setup-Assistent mit 5 Fragen und Live-Vorschau mit eigenen Daten, drei Vorlagen pro P0-Sparte (Restaurant: Wirtshaus, Fine Dining, Café & Bäckerei · Shop: Manufaktur, Mode-Boutique, Hofladen · Blog: Journal, Reiseblog, Fachblog · Angebot: Dienstleistung, Coaching, Produktlancierung · Portfolio: Designstudio, Fotografie, Architekturbüro), jede mit eigenen Seiten, Formularen und Beispielinhalten und den zwei Stilen, für die sie geschrieben ist – eine andere Vorlage wählen ersetzt den Startinhalt, statt ihn zu stapeln, Übernahme von Name/Adresse/Öffnungszeiten aus einer bestehenden Website, Checkliste «Startklar» mit Fortschrittsring, Sicherheitshinweis bis zur 3. Sitzung, einmalige Kontext-Hinweise, Hilfe-Artikel in ⌘K, Angebot zum Werkbank-Wechsel.
- Beispielinhalte für 13 Sparten: echte Schweizer Inhalte statt Platzhaltertext.

**Datenhoheit & Datenschutz**
- Import unter Einstellungen → Import: WordPress (XML-Export oder direkt über die Website-Adresse per REST-API), Squarespace (XML-Export), Wix und andere Blogs (RSS/Atom-Feed, Feed-Adresse wird selbst gesucht), Shopify (Produkt-CSV mit Varianten, Preisen, Lager und Bildern), Markdown (.md oder ZIP mit Frontmatter und Bildern – Jekyll, Hugo, Astro, Obsidian). Erst Vorschau, dann Import; Entwürfe bleiben Entwürfe, Bilder landen in der Mediathek, alte Adressen leiten per 301 weiter, Blog/Shop werden bei Bedarf eingeschaltet. Fremde Adressen werden nur öffentlich abgerufen (keine internen IPs, Grössenlimit).
- Export als ZIP: Inhalte (JSON + Markdown mit Frontmatter), Konfiguration als Code, Original-Medien, CSV für Kontakte/Bestellungen/Formulare.
- Auskunft und Löschung pro E-Mail-Adresse, inklusive Newsletter, Mitgliederkonto und Reservationen (Bestellungen werden wegen der Aufbewahrungspflicht anonymisiert, Reservationen bleiben als belegte Zeit ohne Namen).
- Generator für Impressum, Datenschutzerklärung und AGB aus den tatsächlich aktiven Funktionen – ausdrücklich als Vorlage zur rechtlichen Prüfung.
- Zwei-Klick-Einbettungen, Altersschranke ohne JavaScript (Selbstauskunft) oder mit echter Altersprüfung über die E-ID des Bundes (swiyu, siehe oben): Nova fragt über einen eigenen swiyu-Verifier nur «mindestens 16/18» ab, zeigt QR-Code bzw. «In swiyu öffnen», wartet auf die Antwort der Wallet und gibt die Website erst danach frei – vorher ohne Inhalt, auch nicht in Feed, API oder über die direkte Adresse eines Bildes; ein Klick oder ein altes Selbstauskunft-Cookie zählt dann nicht mehr, ein höheres Mindestalter fragt neu; Datenschutzerklärung mit eigenem Abschnitt, Content-Security-Policy, CSRF-Schutz, Output-Escaping, Rich-Text-Whitelist.
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

## Preview-Deployments pro Branch

Railway kann für jeden Pull Request eine eigene Umgebung starten – mit eigener Datenbank und eigenem Bucket:

1. Im Railway-Projekt unter **Settings → Environments** die **PR Environments** einschalten.
2. In der Haupt-Umgebung die Variable `NOVA_PREVIEW_DEMO` setzen, z. B. `restaurant` oder `shop:kante` (Sparte, optional Stil). Die PR-Umgebungen übernehmen sie; in der Haupt-Umgebung selbst wirkt sie nicht.
3. Pull Request öffnen: Railway baut ihn, Nova erkennt die PR-Umgebung am Namen, richtet auf der leeren Datenbank eine Demo-Website ein und schreibt die Anmeldung einmal ins Deploy-Log.

In jeder Vorschau-Umgebung sperrt Nova Suchmaschinen aus (`X-Robots-Tag`, `robots.txt`, `noindex`) und zeigt im Admin oben einen Hinweis. Schliesst man den Pull Request, räumt Railway die Umgebung samt Daten weg.

## Continuous Integration

`.github/workflows/ci.yml` läuft bei jedem Push und Pull Request:

- **Typen, Tests, Build** gegen ein echtes Postgres (mit ffmpeg für den Video-Test).
- **Lighthouse** (mobil, je 3 Durchläufe) für alle vier Stile mit ihrer typischen Sparte: `scripts/demo-site.mjs` richtet eine frische Website so ein, wie es eine Person im Setup-Assistenten tun würde, und misst Startseite, Seiten, Listen und je eine Detailseite. Fehler, wenn Performance, Barrierefreiheit, Best Practices oder SEO unter 95 fallen oder CLS über 0,05 steigt; LCP über 1,8 s und TBT über 150 ms als Warnung. Die Berichte liegen als Artefakt beim Lauf.

Lokal gemessen (Lighthouse 12, mobil): Kante, Salon und Feuilleton 100/100/100/100 mit LCP 1,1–1,7 s, Bistro 100/100/100/100 mit LCP 1,4–1,7 s (vorher 1,7–2,1 s), CLS überall 0.

## Was (noch) nicht umgesetzt ist

Ehrlich aufgelistet – vieles davon ist in der PRD ohnehin P1/P2:

- **Marktplatz** für Erweiterungen.
- Drei Vorlagen gibt es für die P0-Sparten; die übrigen Sparten (Handwerk, Studio, Praxis, Hotel, Verein, Non-Profit, Immobilien, Erotik) haben je eine.

---

## Tests

```bash
npm test
```

112 Tests: Sanitizer (XSS-Fälle), TOTP gegen RFC-6238-Vektoren, signierte Cookies, Passwort-Hashing, HTML-Escaping, CSS-Scoping, CSV-Formel-Injection, Öffnungszeiten über Zeitzonen, SEO-Coach, und Integrationstests gegen Postgres: Setup-Code, CSRF, Holding-Page vor dem Launch, JSON-LD, Sitemap, Auto-301, Versionskonflikte, Schutzzonen gegen manipulierte Requests, Warenkorb mit MwSt./Gutschein/Versand und Lagerabbuchung, Spam-Abwehr und Lead-Erfassung, Headless-API, Datenschutz-Löschung, Rechte von Autoren, Reservationen ohne Doppelbuchung, Newsletter (Double Opt-in, automatischer Versand genau einmal, One-Click-Abmeldung), Mitgliederbereich (nichts sickert durch Suche/Feed/API, Bestätigung, Passwort zurücksetzen, Sperren, bezahlter Zugang), Tickets (Kontingent, QR-Einlass genau einmal, Storno füllt aus der Warteliste, Kurse mit mehreren Terminen), Spenden (Mindestbetrag, monatlich mit Folgezahlungen, doppelter Webhook ignoriert, Kampagnenstand, Bestätigung), Immobilien (Filter, Vergebenes ausgeblendet, Strasse geschützt, Anfrage ins CRM), Bestellung & Lieferung (Zeitfenster über Zeitzone und Ruhetage, MwSt.-Aufteilung, Liefergebiet, Mindestbestellwert, Küchen-Ablauf ohne Sprünge, Pause), QR-Rechnung (IBAN-Prüfung, Prüfziffern und Nutzdaten gegen die Beispiele des Standards, Zahlteil auf offenen Rechnungen), Passkeys (Optionen pro Domain, gefälschte Antworten und wiederverwendete Challenges abgelehnt), Import (WordPress-XML, Feeds, Shopify-CSV, Markdown mit Frontmatter, HTML-Bereinigung, Import mit Weiterleitungen), GraphQL (Abfragen per GET/POST, Variablen, Tiefenlimit, Mutationen nur mit Token und nur per POST, Mitgliederinhalte bleiben geschützt), TypeScript-SDK (wird im Test mit `tsc --strict` geprüft, falsche Felder und Werte schlagen fehl), CLI (echter Server, pull → bearbeiten → push, neue Dateien, Konflikt bei zwischenzeitlicher Änderung), Hooks (Ändern, Ablehnen, Spam, kein Weg aus der Sandbox, Endlosschleife und Speicherbombe gestoppt, kaputter Code wird nicht gespeichert), Mehrsprachigkeit (eigene Adressen, Weiterleitung auf die übersetzte Adresse, hreflang/Canonical/Sitemap, nicht Übersetztes mit noindex, Preise bleiben gemeinsam, REST/GraphQL mit `?lang`, ausgeschaltete Sprachen gibt es nicht, Systemtexte und Formular-Antworten in der Sprache der Seite, jeder verwendete Text hat alle drei Übersetzungen mit denselben Platzhaltern, Öffnungszeiten auf Französisch/Italienisch, Admin-Texte vollständig in drei Sprachen mit denselben Platzhaltern, spätere Mails in der gespeicherten Sprache), Kommentare (Gespräche, Erwähnungen nur für die erwähnte Person, Wiederöffnen, Rechte), Echtzeit (gleichzeitige Änderungen verschiedener Blöcke, Felder und Reihenfolge laufen zusammen; zwei echte WebSocket-Clients, zentrales Speichern, Änderung von aussen, Verbindung ohne Anmeldung oder von fremder Seite abgelehnt, Hook-Fehler an alle), KI-Assistent (nur eingeschaltet und mit Schlüssel, Antworten bereinigt, Bild geht mit, Übersetzungsentwurf mit Blöcken nach id, nichts wird gespeichert, Autoren nur für eigene Einträge, Fehler des Dienstes verständlich), Texte für den Übersetzungsentwurf (nur Texte, zurückschreiben auch nach verschobenen Blöcken), Videos (echtes ffmpeg: Web-Fassung, Index vor den Daten, Byte-Ranges, Vorschaubild, Website mit Quellen und Rückfallebene, kein grösseres Duplikat eines H.264-Originals, ausgeschaltet, nochmals, Löschen entfernt alles), Videogrössen (1080p/720p nach der kurzen Seite, nie hochskaliert, gerade Masse), Upload-Prüfung (PDF mit JavaScript auch komprimiert und maskiert, Startbefehle, angehängte Dateien, Makros, Programme in Archiven, E-Books mit Skripten erlaubt; ClamAV über das echte INSTREAM-Protokoll in Stücken, Fund abgelehnt und gemeldet, ClamAV weg heisst nichts gespeichert), Statistik-Dienste (Eingaben geprüft, Plausible ohne Hinweis, Google Analytics und Matomo mit Cookies nur mit Hinweis und nichts von Google im HTML, Content-Security-Policy, Datenschutzerklärung), Meilisearch (Index nach jeder Änderung, Tippfehler, Mitgliederinhalte nur mit Titel, offline genommen fällt raus, Rückfall auf Postgres, Neuaufbau), Search Console (Anmeldung bei Google, passende Property, Sitemap, Zahlen, Zugang verschlüsselt, gefälschte Antwort abgelehnt, entzogener Zugang verständlich, Trennen gibt ihn zurück), Überschriften ohne Sprünge (Karten direkt unter dem Seitentitel h2, unter einer Abschnittsüberschrift h3), Blöcke (Name, Beschreibung, jedes Feld, jede Hilfe und Auswahl in drei Sprachen), Hinweis nur im Zeitfenster, Tabelle mit beschrifteten Zellen, Gekürztes CSS (eine Regel fällt nur, wenn jeder Selektor eine fehlende Klasse verlangt; Media-Queries, Attribut-Selektoren, :is()/:not(), Keyframes und Klammern in Zeichenketten bleiben heil; Klassen aus Seite und Skripten; eine Seite trägt das CSS ihrer Blöcke, nicht das von Shop oder Reservation), Icons (nur einfache Formen, Suchwörter, Gruppe, jede Gruppe gut gefüllt, mindestens 300; unbekannte werden abgelehnt), Altersprüfung mit der E-ID (Anfrage nur nach «age_over_18 = true» vom erlaubten Aussteller, QR-Code, nur ein offengelegtes «true» zählt, abgelehnt/zu jung/abgelaufen, Verifier ohne herausgegebene Angaben ist ein Fehler statt ein Durchwinken, höhere Grenze fragt das Geburtsdatum, Geburtstag nach Schweizer Zeit, Klick, Feed/API und Bilder gesperrt, danach nur privat zwischengespeichert, Datenschutzerklärung), Vorlagen (drei pro P0-Sparte in zwei vorhandenen Stilen, nur Vorlagen der ersten Sparte, Wechsel ersetzt Seiten und Formulare statt sie zu stapeln, unbekannte abgelehnt, Namen und Beschreibungen in drei Sprachen).
