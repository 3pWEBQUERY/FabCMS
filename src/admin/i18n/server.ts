/** Admin texts (server), keyed by the German original. */
export const server: Record<string, { fr: string; it: string; en: string }> = {
  /* ---------- general (app.ts, lib/http.ts, auth) ---------- */
  'Nicht gefunden.': { fr: 'Introuvable.', it: 'Non trovato.', en: 'Not found.' },
  'Dafür fehlt dir die Berechtigung.': { fr: 'Vous n’avez pas l’autorisation nécessaire.', it: 'Non hai l’autorizzazione per farlo.', en: 'You don’t have permission to do that.' },
  'Bitte melde dich an.': { fr: 'Veuillez vous connecter.', it: 'Accedi, per favore.', en: 'Please sign in.' },
  'Die Anfrage enthält kein gültiges JSON.': {
    fr: 'La requête ne contient pas de JSON valide.',
    it: 'La richiesta non contiene un JSON valido.',
    en: 'The request does not contain valid JSON.',
  },
  'Da ist auf dem Server etwas schiefgelaufen. Versuch es nochmals – deine Daten sind gesichert.': {
    fr: 'Une erreur s’est produite sur le serveur. Veuillez réessayer – vos données sont en sécurité.',
    it: 'Qualcosa è andato storto sul server. Riprova – i tuoi dati sono al sicuro.',
    en: 'Something went wrong on the server. Please try again – your data is safe.',
  },
  'Anfrage abgelehnt (fehlender Schutz-Header).': {
    fr: 'Requête refusée (en-tête de protection manquant).',
    it: 'Richiesta rifiutata (header di protezione mancante).',
    en: 'Request rejected (missing protection header).',
  },
  'Anfrage von fremder Herkunft abgelehnt.': {
    fr: 'Requête d’une autre origine refusée.',
    it: 'Richiesta da un’origine esterna rifiutata.',
    en: 'Request from a foreign origin rejected.',
  },

  /* ---------- input validation (zod formatter in app.ts) – specific messages before the generic patterns ---------- */
  'Ungültige Eingabe bei «{path}»: Das Passwort braucht mindestens 10 Zeichen.': {
    fr: 'Saisie invalide pour «{path}»: le mot de passe doit comporter au moins 10 caractères.',
    it: 'Dato non valido in «{path}»: la password deve avere almeno 10 caratteri.',
    en: 'Invalid input for “{path}”: the password needs at least 10 characters.',
  },
  'Ungültige Eingabe bei «{path}»: Bitte gib deinen Namen an.': {
    fr: 'Saisie invalide pour «{path}»: veuillez indiquer votre nom.',
    it: 'Dato non valido in «{path}»: indica il tuo nome.',
    en: 'Invalid input for “{path}”: please enter your name.',
  },
  'Ungültige Eingabe bei «{path}»: Bitte gib eine gültige E-Mail-Adresse an.': {
    fr: 'Saisie invalide pour «{path}»: veuillez indiquer une adresse e-mail valide.',
    it: 'Dato non valido in «{path}»: indica un indirizzo e-mail valido.',
    en: 'Invalid input for “{path}”: please enter a valid email address.',
  },
  'Ungültige Eingabe bei «{path}»: Gib dem Angebot einen Namen.': {
    fr: 'Saisie invalide pour «{path}»: donnez un nom à la prestation.',
    it: 'Dato non valido in «{path}»: dai un nome all’offerta.',
    en: 'Invalid input for “{path}”: give the service a name.',
  },
  'Ungültige Eingabe bei «{path}»: Mindestens 5 Minuten.': {
    fr: 'Saisie invalide pour «{path}»: au moins 5 minutes.',
    it: 'Dato non valido in «{path}»: almeno 5 minuti.',
    en: 'Invalid input for “{path}”: at least 5 minutes.',
  },
  'Ungültige Eingabe bei «{path}»: Gib einen Namen an, z. B. «Tisch 4» oder «Lea».': {
    fr: 'Saisie invalide pour «{path}»: indiquez un nom, p. ex. «Table 4» ou «Léa».',
    it: 'Dato non valido in «{path}»: indica un nome, ad es. «Tavolo 4» o «Lea».',
    en: 'Invalid input for “{path}”: enter a name, e.g. “Table 4” or “Lea”.',
  },
  'Ungültige Eingabe bei «{path}»: Der Kalender-Link muss mit https:// oder webcal:// beginnen.': {
    fr: 'Saisie invalide pour «{path}»: le lien du calendrier doit commencer par https:// ou webcal://.',
    it: 'Dato non valido in «{path}»: il link del calendario deve iniziare con https:// o webcal://.',
    en: 'Invalid input for “{path}”: the calendar link must start with https:// or webcal://.',
  },
  'Ungültige Eingabe bei «{path}»: Wähle, was gebucht wird.': {
    fr: 'Saisie invalide pour «{path}»: choisissez ce qui est réservé.',
    it: 'Dato non valido in «{path}»: scegli cosa viene prenotato.',
    en: 'Invalid input for “{path}”: choose what is being booked.',
  },
  'Ungültige Eingabe bei «{path}»: Gib eine Uhrzeit an.': {
    fr: 'Saisie invalide pour «{path}»: indiquez une heure.',
    it: 'Dato non valido in «{path}»: indica un orario.',
    en: 'Invalid input for “{path}”: enter a time.',
  },
  'Ungültige Eingabe bei «{path}»: Gib einen Namen an.': {
    fr: 'Saisie invalide pour «{path}»: indiquez un nom.',
    it: 'Dato non valido in «{path}»: indica un nome.',
    en: 'Invalid input for “{path}”: enter a name.',
  },
  'Ungültige Eingabe bei «{path}»: Wähl mindestens eine Sparte.': {
    fr: 'Saisie invalide pour «{path}»: choisissez au moins un secteur.',
    it: 'Dato non valido in «{path}»: scegli almeno un settore.',
    en: 'Invalid input for “{path}”: choose at least one sector.',
  },
  'Ungültige Eingabe bei «{path}»: Wie heisst dein Projekt?': {
    fr: 'Saisie invalide pour «{path}»: comment s’appelle votre projet?',
    it: 'Dato non valido in «{path}»: come si chiama il tuo progetto?',
    en: 'Invalid input for “{path}”: what is your project called?',
  },
  'Ungültige Eingabe bei «{path}»: Die alte Adresse muss mit / beginnen.': {
    fr: 'Saisie invalide pour «{path}»: l’ancienne adresse doit commencer par /.',
    it: 'Dato non valido in «{path}»: il vecchio indirizzo deve iniziare con /.',
    en: 'Invalid input for “{path}”: the old address must start with /.',
  },
  'Ungültige Eingabe bei «{path}»: Gib der Mitgliedschaft einen Namen.': {
    fr: 'Saisie invalide pour «{path}»: donnez un nom à l’adhésion.',
    it: 'Dato non valido in «{path}»: dai un nome all’abbonamento.',
    en: 'Invalid input for “{path}”: give the membership a name.',
  },
  'Ungültige Eingabe bei «{path}»: Jedes Feld braucht eine Beschriftung.': {
    fr: 'Saisie invalide pour «{path}»: chaque champ a besoin d’un libellé.',
    it: 'Dato non valido in «{path}»: ogni campo ha bisogno di un’etichetta.',
    en: 'Invalid input for “{path}”: every field needs a label.',
  },
  'Ungültige Eingabe bei «{path}»: Gib dem Formular einen Namen.': {
    fr: 'Saisie invalide pour «{path}»: donnez un nom au formulaire.',
    it: 'Dato non valido in «{path}»: dai un nome al modulo.',
    en: 'Invalid input for “{path}”: give the form a name.',
  },
  'Ungültige Eingabe bei «{path}»: Der Code braucht mindestens 3 Zeichen.': {
    fr: 'Saisie invalide pour «{path}»: le code doit comporter au moins 3 caractères.',
    it: 'Dato non valido in «{path}»: il codice deve avere almeno 3 caratteri.',
    en: 'Invalid input for “{path}”: the code needs at least 3 characters.',
  },
  'Ungültige Eingabe bei «{path}»: Nur Buchstaben, Zahlen, - und _.': {
    fr: 'Saisie invalide pour «{path}»: uniquement des lettres, des chiffres, - et _.',
    it: 'Dato non valido in «{path}»: solo lettere, numeri, - e _.',
    en: 'Invalid input for “{path}”: only letters, numbers, - and _.',
  },
  'Ungültige Eingabe bei «{path}»: Gib der Ausgabe einen Betreff.': {
    fr: 'Saisie invalide pour «{path}»: donnez un objet à l’édition.',
    it: 'Dato non valido in «{path}»: dai un oggetto all’edizione.',
    en: 'Invalid input for “{path}”: give the issue a subject.',
  },
  'Ungültige Eingabe bei «{path}»: Bestätige, dass alle Personen eingewilligt haben.': {
    fr: 'Saisie invalide pour «{path}»: confirmez que toutes les personnes ont donné leur consentement.',
    it: 'Dato non valido in «{path}»: conferma che tutte le persone hanno dato il consenso.',
    en: 'Invalid input for “{path}”: confirm that everyone has given their consent.',
  },
  'Ungültige Eingabe bei «{path}»: Postleitzahlen bitte als Zahlen, z. B. 8400.': {
    fr: 'Saisie invalide pour «{path}»: indiquez les NPA en chiffres, p. ex. 8400.',
    it: 'Dato non valido in «{path}»: indica i NPA come numeri, ad es. 8400.',
    en: 'Invalid input for “{path}”: enter postcodes as numbers, e.g. 8400.',
  },
  'Ungültige Eingabe bei «{path}»: Die IBAN sieht nicht richtig aus.': {
    fr: 'Saisie invalide pour «{path}»: l’IBAN ne semble pas correct.',
    it: 'Dato non valido in «{path}»: l’IBAN non sembra corretto.',
    en: 'Invalid input for “{path}”: the IBAN doesn’t look right.',
  },
  'Ungültige Eingabe bei «{path}»: Invalid email address': {
    fr: 'Saisie invalide pour «{path}»: adresse e-mail invalide.',
    it: 'Dato non valido in «{path}»: indirizzo e-mail non valido.',
    en: 'Invalid input for “{path}”: invalid email address.',
  },
  'Ungültige Eingabe bei «{path}»: Invalid URL': {
    fr: 'Saisie invalide pour «{path}»: adresse web invalide.',
    it: 'Dato non valido in «{path}»: indirizzo web non valido.',
    en: 'Invalid input for “{path}”: invalid URL.',
  },
  'Ungültige Eingabe bei «{path}»: Invalid UUID': {
    fr: 'Saisie invalide pour «{path}»: identifiant invalide.',
    it: 'Dato non valido in «{path}»: identificativo non valido.',
    en: 'Invalid input for “{path}”: invalid ID.',
  },
  'Ungültige Eingabe bei «{path}»: Too small: expected string to have >=1 characters': {
    fr: 'Saisie invalide pour «{path}»: ce champ est obligatoire.',
    it: 'Dato non valido in «{path}»: questo campo è obbligatorio.',
    en: 'Invalid input for “{path}”: this field is required.',
  },
  'Ungültige Eingabe bei «{path}»: Too small: expected array to have >=1 items': {
    fr: 'Saisie invalide pour «{path}»: au moins un élément requis.',
    it: 'Dato non valido in «{path}»: serve almeno un elemento.',
    en: 'Invalid input for “{path}”: at least one item required.',
  },
  'Ungültige Eingabe bei «{path}»: Invalid input': {
    fr: 'Saisie invalide pour «{path}».',
    it: 'Dato non valido in «{path}».',
    en: 'Invalid input for “{path}”.',
  },
  'Ungültige Eingabe bei «{path}»: Too small: expected string to have >={n} characters': {
    fr: 'Saisie invalide pour «{path}»: au moins {n} caractères requis.',
    it: 'Dato non valido in «{path}»: servono almeno {n} caratteri.',
    en: 'Invalid input for “{path}”: at least {n} characters required.',
  },
  'Ungültige Eingabe bei «{path}»: Too big: expected string to have <={n} characters': {
    fr: 'Saisie invalide pour «{path}»: {n} caractères au maximum.',
    it: 'Dato non valido in «{path}»: al massimo {n} caratteri.',
    en: 'Invalid input for “{path}”: {n} characters at most.',
  },
  'Ungültige Eingabe bei «{path}»: Too small: expected array to have >={n} items': {
    fr: 'Saisie invalide pour «{path}»: au moins {n} éléments requis.',
    it: 'Dato non valido in «{path}»: servono almeno {n} elementi.',
    en: 'Invalid input for “{path}”: at least {n} items required.',
  },
  'Ungültige Eingabe bei «{path}»: Too big: expected array to have <={n} items': {
    fr: 'Saisie invalide pour «{path}»: {n} éléments au maximum.',
    it: 'Dato non valido in «{path}»: al massimo {n} elementi.',
    en: 'Invalid input for “{path}”: {n} items at most.',
  },
  'Ungültige Eingabe bei «{path}»: Too small: expected number to be >={n}': {
    fr: 'Saisie invalide pour «{path}»: la valeur doit être d’au moins {n}.',
    it: 'Dato non valido in «{path}»: il valore deve essere almeno {n}.',
    en: 'Invalid input for “{path}”: the value must be at least {n}.',
  },
  'Ungültige Eingabe bei «{path}»: Too big: expected number to be <={n}': {
    fr: 'Saisie invalide pour «{path}»: la valeur doit être de {n} au maximum.',
    it: 'Dato non valido in «{path}»: il valore può essere al massimo {n}.',
    en: 'Invalid input for “{path}”: the value must be {n} at most.',
  },
  'Ungültige Eingabe bei «{path}»: Invalid input: expected {type}, received undefined': {
    fr: 'Saisie invalide pour «{path}»: valeur manquante ({type} attendu).',
    it: 'Dato non valido in «{path}»: valore mancante (atteso {type}).',
    en: 'Invalid input for “{path}”: value missing ({type} expected).',
  },
  'Ungültige Eingabe bei «{path}»: Invalid option: expected one of {options}': {
    fr: 'Saisie invalide pour «{path}»: option invalide, attendu: {options}.',
    it: 'Dato non valido in «{path}»: opzione non valida, previsto: {options}.',
    en: 'Invalid input for “{path}”: invalid option, expected one of {options}.',
  },
  'Ungültige Eingabe bei «{path}»: {problem}': {
    fr: 'Saisie invalide pour «{path}»: {problem}',
    it: 'Dato non valido in «{path}»: {problem}',
    en: 'Invalid input for “{path}”: {problem}',
  },
  'Ungültige Eingabe: {problem}': { fr: 'Saisie invalide: {problem}', it: 'Dato non valido: {problem}', en: 'Invalid input: {problem}' },

  /* ---------- import errors wrap other messages, so they come before the field patterns ---------- */
  '«{title}» bleibt Entwurf: {message}': { fr: '«{title}» reste un brouillon: {message}', it: '«{title}» resta una bozza: {message}', en: '“{title}” stays a draft: {message}' },

  /* ---------- field validation (shared/fields.ts) and publish blockers ---------- */
  '«{label}» fehlt noch.': { fr: '«{label}» manque encore.', it: 'Manca ancora «{label}».', en: '“{label}” is still missing.' },
  '«{label}» muss eine Zahl sein.': { fr: '«{label}» doit être un nombre.', it: '«{label}» deve essere un numero.', en: '“{label}” must be a number.' },
  '«{label}» muss mindestens {min} sein.': { fr: '«{label}» doit être d’au moins {min}.', it: '«{label}» deve essere almeno {min}.', en: '“{label}” must be at least {min}.' },
  '«{label}» darf höchstens {max} sein.': { fr: '«{label}» ne doit pas dépasser {max}.', it: '«{label}» può essere al massimo {max}.', en: '“{label}” must be {max} at most.' },
  '«{label}» ist keine gültige E-Mail-Adresse.': {
    fr: '«{label}» n’est pas une adresse e-mail valide.',
    it: '«{label}» non è un indirizzo e-mail valido.',
    en: '“{label}” is not a valid email address.',
  },
  '«{label}» muss mit https://, / oder # beginnen.': {
    fr: '«{label}» doit commencer par https://, / ou #.',
    it: '«{label}» deve iniziare con https://, / o #.',
    en: '“{label}” must start with https://, / or #.',
  },
  '«{label}» muss Text sein.': { fr: '«{label}» doit être du texte.', it: '«{label}» deve essere testo.', en: '“{label}” must be text.' },
  '«{label}» ist {n} Zeichen zu lang.': {
    fr: '«{label}» est trop long de {n} caractères.',
    it: '«{label}» è troppo lungo di {n} caratteri.',
    en: '“{label}” is {n} characters too long.',
  },
  '«{label}»: ungültige Auswahl.': { fr: '«{label}»: choix invalide.', it: '«{label}»: scelta non valida.', en: '“{label}”: invalid choice.' },
  '«{label}» hat ein ungültiges Format.': { fr: '«{label}» a un format invalide.', it: '«{label}» ha un formato non valido.', en: '“{label}” has an invalid format.' },
  '«{label}» braucht mindestens {min} Einträge.': {
    fr: '«{label}» nécessite au moins {min} éléments.',
    it: '«{label}» richiede almeno {min} elementi.',
    en: '“{label}” needs at least {min} entries.',
  },
  '«{label}» erlaubt höchstens {max} Einträge.': {
    fr: '«{label}» permet au maximum {max} éléments.',
    it: '«{label}» consente al massimo {max} elementi.',
    en: '“{label}” allows {max} entries at most.',
  },
  'Die Volljährigkeit ist noch nicht bestätigt.': {
    fr: 'La majorité n’est pas encore confirmée.',
    it: 'La maggiore età non è ancora confermata.',
    en: 'Legal age has not been confirmed yet.',
  },
  'Die Einwilligung zur Veröffentlichung fehlt.': {
    fr: 'Le consentement à la publication manque.',
    it: 'Manca il consenso alla pubblicazione.',
    en: 'Consent to publication is missing.',
  },
  'Das Datum der Einwilligung fehlt.': { fr: 'La date du consentement manque.', it: 'Manca la data del consenso.', en: 'The date of consent is missing.' },

  /* ---------- content and content types ---------- */
  'Diesen Inhaltstyp gibt es nicht.': { fr: 'Ce type de contenu n’existe pas.', it: 'Questo tipo di contenuto non esiste.', en: 'This content type doesn’t exist.' },
  'Der Feldschlüssel «{key}» ist ungültig. Erlaubt: Buchstaben, Zahlen, _ – beginnend mit einem Kleinbuchstaben.': {
    fr: 'La clé de champ «{key}» est invalide. Autorisés: lettres, chiffres, _ – en commençant par une lettre minuscule.',
    it: 'La chiave del campo «{key}» non è valida. Consentiti: lettere, numeri, _ – iniziando con una lettera minuscola.',
    en: 'The field key “{key}” is invalid. Allowed: letters, numbers, _ – starting with a lowercase letter.',
  },
  '«{key}» ist ein reservierter Feldname.': { fr: '«{key}» est un nom de champ réservé.', it: '«{key}» è un nome di campo riservato.', en: '“{key}” is a reserved field name.' },
  'Der Feldschlüssel «{key}» kommt doppelt vor.': {
    fr: 'La clé de champ «{key}» apparaît deux fois.',
    it: 'La chiave del campo «{key}» compare due volte.',
    en: 'The field key “{key}” appears twice.',
  },
  'Feld «{key}» braucht eine Beschriftung für das Studio.': {
    fr: 'Le champ «{key}» a besoin d’un libellé pour le Studio.',
    it: 'Il campo «{key}» ha bisogno di un’etichetta per lo Studio.',
    en: 'Field “{key}” needs a label for Studio.',
  },
  'Gruppen dürfen höchstens zwei Ebenen tief verschachtelt sein.': {
    fr: 'Les groupes peuvent être imbriqués sur deux niveaux au maximum.',
    it: 'I gruppi possono essere annidati al massimo su due livelli.',
    en: 'Groups can be nested at most two levels deep.',
  },
  'Der technische Name muss mit einem Buchstaben beginnen und darf nur a–z, 0–9 und _ enthalten.': {
    fr: 'Le nom technique doit commencer par une lettre et ne peut contenir que a–z, 0–9 et _.',
    it: 'Il nome tecnico deve iniziare con una lettera e può contenere solo a–z, 0–9 e _.',
    en: 'The technical name must start with a letter and may only contain a–z, 0–9 and _.',
  },
  'Dieser technische Name ist für die API reserviert.': {
    fr: 'Ce nom technique est réservé à l’API.',
    it: 'Questo nome tecnico è riservato all’API.',
    en: 'This technical name is reserved for the API.',
  },
  'Einen Inhaltstyp mit diesem Namen gibt es schon.': {
    fr: 'Un type de contenu portant ce nom existe déjà.',
    it: 'Esiste già un tipo di contenuto con questo nome.',
    en: 'A content type with this name already exists.',
  },
  'Die Felder eingebauter Typen sind fest. Leg einen eigenen Typ an, um Felder frei zu definieren.': {
    fr: 'Les champs des types intégrés sont fixes. Créez votre propre type pour définir librement les champs.',
    it: 'I campi dei tipi integrati sono fissi. Crea un tuo tipo per definire liberamente i campi.',
    en: 'The fields of built-in types are fixed. Create your own type to define fields freely.',
  },
  'Das Titelfeld muss eines der Felder sein.': {
    fr: 'Le champ de titre doit faire partie des champs.',
    it: 'Il campo del titolo deve essere uno dei campi.',
    en: 'The title field must be one of the fields.',
  },
  'Die Detail-Adresse muss mit «/» beginnen und auf «:slug» enden, z. B. /rezepte/:slug.': {
    fr: 'L’adresse de détail doit commencer par «/» et se terminer par «:slug», p. ex. /recettes/:slug.',
    it: 'L’indirizzo di dettaglio deve iniziare con «/» e terminare con «:slug», ad es. /ricette/:slug.',
    en: 'The detail address must start with “/” and end with “:slug”, e.g. /recipes/:slug.',
  },
  'Die Übersichts-Adresse muss mit «/» beginnen, z. B. /rezepte.': {
    fr: 'L’adresse de la vue d’ensemble doit commencer par «/», p. ex. /recettes.',
    it: 'L’indirizzo della panoramica deve iniziare con «/», ad es. /ricette.',
    en: 'The overview address must start with “/”, e.g. /recipes.',
  },
  'Die Adresse {route} benutzt schon «{name}».': {
    fr: 'L’adresse {route} est déjà utilisée par «{name}».',
    it: 'L’indirizzo {route} è già usato da «{name}».',
    en: 'The address {route} is already used by “{name}”.',
  },
  'Bitte gib dem Inhaltstyp einen Namen.': {
    fr: 'Veuillez donner un nom au type de contenu.',
    it: 'Dai un nome al tipo di contenuto.',
    en: 'Please give the content type a name.',
  },
  'Dieser Inhalt existiert nicht mehr.': { fr: 'Ce contenu n’existe plus.', it: 'Questo contenuto non esiste più.', en: 'This content no longer exists.' },
  'Jemand anderes hat diesen Inhalt in der Zwischenzeit geändert. Lade neu, um die aktuelle Fassung zu sehen.': {
    fr: 'Quelqu’un d’autre a modifié ce contenu entre-temps. Rechargez pour voir la version actuelle.',
    it: 'Qualcun altro ha modificato questo contenuto nel frattempo. Ricarica per vedere la versione attuale.',
    en: 'Someone else has changed this content in the meantime. Reload to see the current version.',
  },
  'Die Adresse der Startseite lässt sich nicht ändern.': {
    fr: 'L’adresse de la page d’accueil ne peut pas être modifiée.',
    it: 'L’indirizzo della pagina iniziale non può essere modificato.',
    en: 'The home page address can’t be changed.',
  },
  'Die Startseite kann nicht gelöscht werden.': {
    fr: 'La page d’accueil ne peut pas être supprimée.',
    it: 'La pagina iniziale non può essere eliminata.',
    en: 'The home page can’t be deleted.',
  },
  'Du kannst nur deine eigenen Beiträge bearbeiten.': {
    fr: 'Vous ne pouvez modifier que vos propres articles.',
    it: 'Puoi modificare solo i tuoi articoli.',
    en: 'You can only edit your own posts.',
  },
  'Eingebaute Inhaltstypen lassen sich nicht löschen – deaktiviere stattdessen das Modul.': {
    fr: 'Les types de contenu intégrés ne peuvent pas être supprimés – désactivez plutôt le module.',
    it: 'I tipi di contenuto integrati non possono essere eliminati – disattiva invece il modulo.',
    en: 'Built-in content types can’t be deleted – deactivate the module instead.',
  },
  'Dieser Typ hat noch {n} Einträge. Lösche sie zuerst oder bestätige das endgültige Löschen.': {
    fr: 'Ce type contient encore {n} entrées. Supprimez-les d’abord ou confirmez la suppression définitive.',
    it: 'Questo tipo ha ancora {n} voci. Eliminale prima o conferma l’eliminazione definitiva.',
    en: 'This type still has {n} entries. Delete them first or confirm permanent deletion.',
  },
  'Autoren können nur Beiträge anlegen.': {
    fr: 'Les auteurs ne peuvent créer que des articles.',
    it: 'Gli autori possono creare solo articoli.',
    en: 'Authors can only create posts.',
  },
  'Übersetzungen veröffentlichen darf, wer veröffentlichen darf.': {
    fr: 'Seules les personnes autorisées à publier peuvent publier des traductions.',
    it: 'Può pubblicare le traduzioni solo chi può pubblicare.',
    en: 'Only people who can publish can publish translations.',
  },
  'Es gibt keine veröffentlichte Fassung, zu der man zurückkehren könnte.': {
    fr: 'Il n’y a pas de version publiée à laquelle revenir.',
    it: 'Non c’è una versione pubblicata a cui tornare.',
    en: 'There is no published version to go back to.',
  },
  'Du kannst nur eigene, unveröffentlichte Entwürfe löschen.': {
    fr: 'Vous ne pouvez supprimer que vos propres brouillons non publiés.',
    it: 'Puoi eliminare solo le tue bozze non pubblicate.',
    en: 'You can only delete your own unpublished drafts.',
  },
  'Das Original lässt sich hier nicht löschen.': {
    fr: 'L’original ne peut pas être supprimé ici.',
    it: 'L’originale non può essere eliminato qui.',
    en: 'The original can’t be deleted here.',
  },
  'Nur für Profile.': { fr: 'Uniquement pour les profils.', it: 'Solo per i profili.', en: 'Only for profiles.' },
  'Diese Version gibt es nicht mehr.': { fr: 'Cette version n’existe plus.', it: 'Questa versione non esiste più.', en: 'This version no longer exists.' },
  'Block nicht gefunden.': { fr: 'Bloc introuvable.', it: 'Blocco non trovato.', en: 'Block not found.' },
  'Unbekannter Block: {type}': { fr: 'Bloc inconnu: {type}', it: 'Blocco sconosciuto: {type}', en: 'Unknown block: {type}' },
  '(ohne Titel)': { fr: '(sans titre)', it: '(senza titolo)', en: '(untitled)' },

  /* ---------- translations ---------- */
  'Jemand anderes hat diese Übersetzung in der Zwischenzeit geändert. Lade neu, um die aktuelle Fassung zu sehen.': {
    fr: 'Quelqu’un d’autre a modifié cette traduction entre-temps. Rechargez pour voir la version actuelle.',
    it: 'Qualcun altro ha modificato questa traduzione nel frattempo. Ricarica per vedere la versione attuale.',
    en: 'Someone else has changed this translation in the meantime. Reload to see the current version.',
  },
  'Veröffentliche zuerst das Original – die Übersetzung erscheint zusammen mit ihm.': {
    fr: 'Publiez d’abord l’original – la traduction paraîtra avec lui.',
    it: 'Pubblica prima l’originale – la traduzione apparirà insieme a esso.',
    en: 'Publish the original first – the translation appears together with it.',
  },
  'Es gibt noch keine Übersetzung zum Veröffentlichen.': {
    fr: 'Il n’y a pas encore de traduction à publier.',
    it: 'Non c’è ancora nessuna traduzione da pubblicare.',
    en: 'There is no translation to publish yet.',
  },
  'Diese Sprache ist auf der Website nicht eingeschaltet (Einstellungen → Sprachen).': {
    fr: 'Cette langue n’est pas activée sur le site (Réglages → Langues).',
    it: 'Questa lingua non è attivata sul sito (Impostazioni → Lingue).',
    en: 'This language isn’t enabled on the website (Settings → Languages).',
  },

  /* ---------- sign-in, accounts, team ---------- */
  'Nova ist bereits eingerichtet.': { fr: 'Nova est déjà configuré.', it: 'Nova è già configurato.', en: 'Nova is already set up.' },
  'Zu viele Versuche. Warte ein paar Minuten.': {
    fr: 'Trop de tentatives. Attendez quelques minutes.',
    it: 'Troppi tentativi. Aspetta qualche minuto.',
    en: 'Too many attempts. Wait a few minutes.',
  },
  'Der Einrichtungscode stimmt nicht. Du findest ihn in den Logs deines Railway-Dienstes.': {
    fr: 'Le code de configuration est incorrect. Vous le trouverez dans les logs de votre service Railway.',
    it: 'Il codice di configurazione non è corretto. Lo trovi nei log del tuo servizio Railway.',
    en: 'The setup code is wrong. You’ll find it in the logs of your Railway service.',
  },
  'Zu viele Anmeldeversuche. Versuch es in {n} Minuten nochmals.': {
    fr: 'Trop de tentatives de connexion. Réessayez dans {n} minutes.',
    it: 'Troppi tentativi di accesso. Riprova tra {n} minuti.',
    en: 'Too many sign-in attempts. Try again in {n} minutes.',
  },
  'E-Mail oder Passwort stimmen nicht.': { fr: 'L’e-mail ou le mot de passe est incorrect.', it: 'E-mail o password non corretti.', en: 'Email or password is incorrect.' },
  'Dieses Konto hat keinen Zugang zur Verwaltung.': {
    fr: 'Ce compte n’a pas accès à l’administration.',
    it: 'Questo account non ha accesso all’amministrazione.',
    en: 'This account has no access to the admin.',
  },
  'Zu viele Versuche. Bitte warte eine Viertelstunde.': {
    fr: 'Trop de tentatives. Veuillez attendre un quart d’heure.',
    it: 'Troppi tentativi. Aspetta un quarto d’ora.',
    en: 'Too many attempts. Please wait a quarter of an hour.',
  },
  'Dieses Konto gibt es nicht mehr.': { fr: 'Ce compte n’existe plus.', it: 'Questo account non esiste più.', en: 'This account no longer exists.' },
  'Die Anmeldung ist abgelaufen. Bitte melde dich nochmals an.': {
    fr: 'La connexion a expiré. Veuillez vous reconnecter.',
    it: 'L’accesso è scaduto. Accedi di nuovo.',
    en: 'The sign-in has expired. Please sign in again.',
  },
  'Zu viele Versuche. Bitte melde dich nochmals an.': {
    fr: 'Trop de tentatives. Veuillez vous reconnecter.',
    it: 'Troppi tentativi. Accedi di nuovo.',
    en: 'Too many attempts. Please sign in again.',
  },
  'Der Code stimmt nicht. Prüf die Uhrzeit auf deinem Handy.': {
    fr: 'Le code est incorrect. Vérifiez l’heure de votre téléphone.',
    it: 'Il codice non è corretto. Controlla l’ora sul tuo telefono.',
    en: 'The code is wrong. Check the time on your phone.',
  },
  'Deine Rolle hat keinen Zugang zur Werkbank.': {
    fr: 'Votre rôle n’a pas accès à la Werkbank.',
    it: 'Il tuo ruolo non ha accesso alla Werkbank.',
    en: 'Your role has no access to Werkbank.',
  },
  'Das aktuelle Passwort stimmt nicht.': { fr: 'Le mot de passe actuel est incorrect.', it: 'La password attuale non è corretta.', en: 'The current password is wrong.' },
  'Der Code stimmt nicht. Gib die sechs Ziffern ein, die deine App gerade zeigt.': {
    fr: 'Le code est incorrect. Saisissez les six chiffres que votre app affiche en ce moment.',
    it: 'Il codice non è corretto. Inserisci le sei cifre che la tua app mostra in questo momento.',
    en: 'The code is wrong. Enter the six digits your app is showing right now.',
  },
  'Das Passwort stimmt nicht.': { fr: 'Le mot de passe est incorrect.', it: 'La password non è corretta.', en: 'The password is wrong.' },
  'Nur die Inhaberin oder der Inhaber kann Admins hinzufügen.': {
    fr: 'Seul·e le ou la propriétaire peut ajouter des admins.',
    it: 'Solo la o il titolare può aggiungere admin.',
    en: 'Only the owner can add admins.',
  },
  'Diese E-Mail-Adresse hat schon ein Konto.': {
    fr: 'Cette adresse e-mail a déjà un compte.',
    it: 'Questo indirizzo e-mail ha già un account.',
    en: 'This email address already has an account.',
  },
  'Nur die Inhaberin oder der Inhaber kann diese Rolle ändern.': {
    fr: 'Seul·e le ou la propriétaire peut modifier ce rôle.',
    it: 'Solo la o il titolare può cambiare questo ruolo.',
    en: 'Only the owner can change this role.',
  },
  'Es muss mindestens eine Inhaberin oder einen Inhaber geben.': {
    fr: 'Il doit y avoir au moins un·e propriétaire.',
    it: 'Deve esserci almeno una o un titolare.',
    en: 'There must be at least one owner.',
  },
  'Du kannst dein eigenes Konto nicht löschen.': {
    fr: 'Vous ne pouvez pas supprimer votre propre compte.',
    it: 'Non puoi eliminare il tuo account.',
    en: 'You can’t delete your own account.',
  },
  'Das hat zu lange gedauert. Bitte nochmals versuchen.': {
    fr: 'Cela a pris trop de temps. Veuillez réessayer.',
    it: 'Ci è voluto troppo tempo. Riprova.',
    en: 'That took too long. Please try again.',
  },
  'Der Passkey konnte nicht geprüft werden: {message}': {
    fr: 'La clé d’accès n’a pas pu être vérifiée: {message}',
    it: 'Non è stato possibile verificare la passkey: {message}',
    en: 'The passkey could not be verified: {message}',
  },
  'Der Passkey konnte nicht geprüft werden.': {
    fr: 'La clé d’accès n’a pas pu être vérifiée.',
    it: 'Non è stato possibile verificare la passkey.',
    en: 'The passkey could not be verified.',
  },
  'Diesen Passkey kennt Nova nicht (mehr). Melde dich mit dem Passwort an.': {
    fr: 'Nova ne connaît pas (ou plus) cette clé d’accès. Connectez-vous avec votre mot de passe.',
    it: 'Nova non conosce (più) questa passkey. Accedi con la password.',
    en: 'Nova doesn’t know this passkey (any more). Sign in with your password.',
  },
  'Die Anmeldung mit dem Passkey hat nicht geklappt: {message}': {
    fr: 'La connexion avec la clé d’accès n’a pas fonctionné: {message}',
    it: 'L’accesso con la passkey non è riuscito: {message}',
    en: 'Signing in with the passkey didn’t work: {message}',
  },
  'Die Anmeldung mit dem Passkey hat nicht geklappt.': {
    fr: 'La connexion avec la clé d’accès n’a pas fonctionné.',
    it: 'L’accesso con la passkey non è riuscito.',
    en: 'Signing in with the passkey didn’t work.',
  },

  /* ---------- members ---------- */
  'Das Passwort braucht mindestens 10 Zeichen. Ein Satz ist leichter zu merken als Sonderzeichen.': {
    fr: 'Le mot de passe doit comporter au moins 10 caractères. Une phrase se retient plus facilement que des caractères spéciaux.',
    it: 'La password deve avere almeno 10 caratteri. Una frase si ricorda più facilmente dei caratteri speciali.',
    en: 'The password needs at least 10 characters. A sentence is easier to remember than special characters.',
  },
  'Das Passwort ist zu lang.': { fr: 'Le mot de passe est trop long.', it: 'La password è troppo lunga.', en: 'The password is too long.' },
  'Neue Konten gibt es nur auf Einladung.': {
    fr: 'Les nouveaux comptes sont uniquement sur invitation.',
    it: 'I nuovi account sono solo su invito.',
    en: 'New accounts are by invitation only.',
  },
  'Bitte gib eine gültige E-Mail-Adresse ein.': {
    fr: 'Veuillez saisir une adresse e-mail valide.',
    it: 'Inserisci un indirizzo e-mail valido.',
    en: 'Please enter a valid email address.',
  },
  'Wie heisst du?': { fr: 'Comment vous appelez-vous?', it: 'Come ti chiami?', en: 'What’s your name?' },
  'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link haben wir dir bei der Registrierung geschickt.': {
    fr: 'Veuillez d’abord confirmer votre adresse e-mail. Nous vous avons envoyé le lien lors de l’inscription.',
    it: 'Conferma prima il tuo indirizzo e-mail. Ti abbiamo inviato il link al momento della registrazione.',
    en: 'Please confirm your email address first. We sent you the link when you registered.',
  },
  'Dieses Konto ist gesperrt. Melde dich bei uns, wenn das ein Irrtum ist.': {
    fr: 'Ce compte est bloqué. Contactez-nous s’il s’agit d’une erreur.',
    it: 'Questo account è bloccato. Contattaci se si tratta di un errore.',
    en: 'This account is blocked. Get in touch with us if this is a mistake.',
  },
  'Der Link ist abgelaufen. Fordere einfach einen neuen an.': {
    fr: 'Le lien a expiré. Demandez-en simplement un nouveau.',
    it: 'Il link è scaduto. Richiedine semplicemente uno nuovo.',
    en: 'The link has expired. Simply request a new one.',
  },
  'Das bisherige Passwort stimmt nicht.': { fr: 'L’ancien mot de passe est incorrect.', it: 'La password precedente non è corretta.', en: 'The previous password is wrong.' },
  'Zu dieser Adresse gibt es schon ein Konto.': {
    fr: 'Un compte existe déjà pour cette adresse.',
    it: 'Esiste già un account per questo indirizzo.',
    en: 'There is already an account for this address.',
  },
  'Die bezahlte Mitgliedschaft ist gerade nicht verfügbar.': {
    fr: 'L’adhésion payante n’est pas disponible pour le moment.',
    it: 'L’abbonamento a pagamento non è disponibile al momento.',
    en: 'Paid membership isn’t available right now.',
  },
  'Zu diesem Konto gibt es kein Abo.': { fr: 'Ce compte n’a pas d’abonnement.', it: 'Questo account non ha un abbonamento.', en: 'This account has no subscription.' },

  /* ---------- media, backups, import ---------- */
  'Diese Sicherung gibt es nicht mehr.': { fr: 'Cette sauvegarde n’existe plus.', it: 'Questo backup non esiste più.', en: 'This backup no longer exists.' },
  'Die Sicherungsdatei fehlt im Speicher.': {
    fr: 'Le fichier de sauvegarde manque dans le stockage.',
    it: 'Il file di backup manca nello spazio di archiviazione.',
    en: 'The backup file is missing from storage.',
  },
  'Das ist keine Nova-Sicherung.': { fr: 'Ce n’est pas une sauvegarde Nova.', it: 'Questo non è un backup di Nova.', en: 'This is not a Nova backup.' },
  'Die Datei ist leer.': { fr: 'Le fichier est vide.', it: 'Il file è vuoto.', en: 'The file is empty.' },
  'Die Datei ist grösser als 100 MB.': { fr: 'Le fichier dépasse 100 Mo.', it: 'Il file supera i 100 MB.', en: 'The file is larger than 100 MB.' },
  'Das Bild hat zu viele Pixel (über 80 Megapixel).': {
    fr: 'L’image a trop de pixels (plus de 80 mégapixels).',
    it: 'L’immagine ha troppi pixel (oltre 80 megapixel).',
    en: 'The image has too many pixels (over 80 megapixels).',
  },
  'Dieser Dateityp wird nicht unterstützt. Erlaubt sind Bilder (JPG, PNG, WebP, AVIF, GIF), PDF, Videos (MP4, WebM), Audio und Office-Dokumente.': {
    fr: 'Ce type de fichier n’est pas pris en charge. Sont autorisés: images (JPG, PNG, WebP, AVIF, GIF), PDF, vidéos (MP4, WebM), audio et documents Office.',
    it: 'Questo tipo di file non è supportato. Sono consentiti: immagini (JPG, PNG, WebP, AVIF, GIF), PDF, video (MP4, WebM), audio e documenti Office.',
    en: 'This file type isn’t supported. Allowed are images (JPG, PNG, WebP, AVIF, GIF), PDF, videos (MP4, WebM), audio and Office documents.',
  },
  'Keine Datei empfangen.': { fr: 'Aucun fichier reçu.', it: 'Nessun file ricevuto.', en: 'No file received.' },
  'Der Zuschnitt liegt ausserhalb des Bildes.': {
    fr: 'Le recadrage se trouve en dehors de l’image.',
    it: 'Il ritaglio è al di fuori dell’immagine.',
    en: 'The crop lies outside the image.',
  },
  'Bitte eine Datei wählen.': { fr: 'Veuillez choisir un fichier.', it: 'Scegli un file.', en: 'Please choose a file.' },
  'Die Datei ist grösser als 60 MB.': { fr: 'Le fichier dépasse 60 Mo.', it: 'Il file supera i 60 MB.', en: 'The file is larger than 60 MB.' },
  'In der Datei sind keine Beiträge, Seiten oder Produkte.': {
    fr: 'Le fichier ne contient ni articles, ni pages, ni produits.',
    it: 'Il file non contiene articoli, pagine o prodotti.',
    en: 'The file contains no posts, pages or products.',
  },
  'Dort sind keine öffentlichen Beiträge oder Seiten zu finden.': {
    fr: 'Aucun article ni aucune page publics n’y ont été trouvés.',
    it: 'Lì non ci sono articoli o pagine pubblici.',
    en: 'No public posts or pages can be found there.',
  },
  'Das ist keine WordPress-Exportdatei (WXR). In WordPress: Werkzeuge → Daten exportieren → Alle Inhalte.': {
    fr: 'Ce n’est pas un fichier d’export WordPress (WXR). Dans WordPress: Outils → Exporter → Tout le contenu.',
    it: 'Questo non è un file di esportazione di WordPress (WXR). In WordPress: Strumenti → Esporta → Tutti i contenuti.',
    en: 'This is not a WordPress export file (WXR). In WordPress: Tools → Export → All content.',
  },
  'Das ist weder ein RSS- noch ein Atom-Feed.': {
    fr: 'Ce n’est ni un flux RSS ni un flux Atom.',
    it: 'Questo non è né un feed RSS né un feed Atom.',
    en: 'This is neither an RSS nor an Atom feed.',
  },
  'Das ist kein Shopify-Produktexport. In Shopify: Produkte → Exportieren → «Alle Produkte», CSV für Excel oder Numbers.': {
    fr: 'Ce n’est pas un export de produits Shopify. Dans Shopify: Produits → Exporter → «Tous les produits», CSV pour Excel ou Numbers.',
    it: 'Questa non è un’esportazione di prodotti Shopify. In Shopify: Prodotti → Esporta → «Tutti i prodotti», CSV per Excel o Numbers.',
    en: 'This is not a Shopify product export. In Shopify: Products → Export → “All products”, CSV for Excel or Numbers.',
  },
  'In der ZIP-Datei sind keine Markdown-Dateien (.md).': {
    fr: 'Le fichier ZIP ne contient aucun fichier Markdown (.md).',
    it: 'Il file ZIP non contiene file Markdown (.md).',
    en: 'The ZIP file contains no Markdown files (.md).',
  },
  'Dieses Dateiformat kennt Nova nicht. Möglich sind: WordPress/Squarespace-XML, RSS/Atom, Shopify-CSV, Markdown (.md oder .zip).': {
    fr: 'Nova ne connaît pas ce format de fichier. Formats possibles: XML WordPress/Squarespace, RSS/Atom, CSV Shopify, Markdown (.md ou .zip).',
    it: 'Nova non conosce questo formato di file. Sono possibili: XML WordPress/Squarespace, RSS/Atom, CSV Shopify, Markdown (.md o .zip).',
    en: 'Nova doesn’t know this file format. Possible are: WordPress/Squarespace XML, RSS/Atom, Shopify CSV, Markdown (.md or .zip).',
  },
  'Nur http(s)-Adressen.': { fr: 'Uniquement des adresses http(s).', it: 'Solo indirizzi http(s).', en: 'Only http(s) addresses.' },
  '{host} ist keine öffentliche Adresse.': { fr: '{host} n’est pas une adresse publique.', it: '{host} non è un indirizzo pubblico.', en: '{host} is not a public address.' },
  '{host} antwortet mit {status}.': { fr: '{host} répond avec {status}.', it: '{host} risponde con {status}.', en: '{host} responds with {status}.' },
  'Die Datei ist zu gross.': { fr: 'Le fichier est trop volumineux.', it: 'Il file è troppo grande.', en: 'The file is too large.' },
  'Zu viele Weiterleitungen.': { fr: 'Trop de redirections.', it: 'Troppi reindirizzamenti.', en: 'Too many redirects.' },
  'Unter dieser Adresse antwortet keine WordPress-Schnittstelle. Nimm stattdessen die Exportdatei (Werkzeuge → Daten exportieren).': {
    fr: 'Aucune interface WordPress ne répond à cette adresse. Utilisez plutôt le fichier d’export (Outils → Exporter).',
    it: 'A questo indirizzo non risponde nessuna interfaccia WordPress. Usa invece il file di esportazione (Strumenti → Esporta).',
    en: 'No WordPress interface responds at this address. Use the export file instead (Tools → Export).',
  },
  'Unter dieser Adresse ist kein Feed zu finden. Bei Wix heisst er meist «…/blog-feed.xml».': {
    fr: 'Aucun flux trouvé à cette adresse. Chez Wix, il s’appelle généralement «…/blog-feed.xml».',
    it: 'A questo indirizzo non c’è nessun feed. Su Wix di solito si chiama «…/blog-feed.xml».',
    en: 'No feed can be found at this address. On Wix it’s usually called “…/blog-feed.xml”.',
  },
  'Die Vorschau ist abgelaufen. Bitte die Datei nochmals hochladen.': {
    fr: 'L’aperçu a expiré. Veuillez téléverser à nouveau le fichier.',
    it: 'L’anteprima è scaduta. Carica di nuovo il file.',
    en: 'The preview has expired. Please upload the file again.',
  },
  'Bild «{src}» fehlt in der ZIP-Datei.': {
    fr: 'L’image «{src}» manque dans le fichier ZIP.',
    it: 'L’immagine «{src}» manca nel file ZIP.',
    en: 'Image “{src}” is missing from the ZIP file.',
  },
  '{n} Einträge anderer Typen (z. B. Produkte aus Plugins) werden nicht übernommen.': {
    fr: '{n} entrées d’autres types (p. ex. produits issus de plugins) ne sont pas reprises.',
    it: '{n} voci di altri tipi (ad es. prodotti da plugin) non vengono importate.',
    en: '{n} entries of other types (e.g. products from plugins) are not imported.',
  },
  'Ein Feed enthält meist nur die neusten Beiträge (oft 20). Für ältere Beiträge den Feed mehrmals mit «?page=2» o. ä. importieren, falls die Plattform das anbietet.': {
    fr: 'Un flux ne contient généralement que les articles les plus récents (souvent 20). Pour les articles plus anciens, importez le flux plusieurs fois avec «?page=2» ou similaire, si la plateforme le propose.',
    it: 'Un feed contiene di solito solo gli articoli più recenti (spesso 20). Per gli articoli più vecchi importa il feed più volte con «?page=2» o simili, se la piattaforma lo consente.',
    en: 'A feed usually contains only the latest posts (often 20). For older posts, import the feed several times with “?page=2” or similar, if the platform offers it.',
  },
  'Das ist ein WordPress-Feed. Mit der WordPress-Exportdatei oder der Website-Adresse kommt alles mit, nicht nur die neusten Beiträge.': {
    fr: 'C’est un flux WordPress. Avec le fichier d’export WordPress ou l’adresse du site, tout est repris, pas seulement les articles les plus récents.',
    it: 'Questo è un feed WordPress. Con il file di esportazione WordPress o l’indirizzo del sito viene importato tutto, non solo gli articoli più recenti.',
    en: 'This is a WordPress feed. With the WordPress export file or the website address, everything comes along, not just the latest posts.',
  },
  'Shopify-Produkte': { fr: 'Produits Shopify', it: 'Prodotti Shopify', en: 'Shopify products' },

  /* ---------- hooks ---------- */
  'Hook «{name}»: Der Code braucht eine Funktion «hook(event)».': {
    fr: 'Hook «{name}»: le code a besoin d’une fonction «hook(event)».',
    it: 'Hook «{name}»: il codice ha bisogno di una funzione «hook(event)».',
    en: 'Hook “{name}”: the code needs a function “hook(event)”.',
  },
  'Hook «{name}»: Der Code ist länger als {n}k Zeichen.': {
    fr: 'Hook «{name}»: le code dépasse {n}k caractères.',
    it: 'Hook «{name}»: il codice supera i {n}k caratteri.',
    en: 'Hook “{name}”: the code is longer than {n}k characters.',
  },
  'Hook «{name}»: {problem}': { fr: 'Hook «{name}»: {problem}', it: 'Hook «{name}»: {problem}', en: 'Hook “{name}”: {problem}' },
  'Der Code braucht eine Funktion «hook(event)».': {
    fr: 'Le code a besoin d’une fonction «hook(event)».',
    it: 'Il codice ha bisogno di una funzione «hook(event)».',
    en: 'The code needs a function “hook(event)”.',
  },
  'Der Code ist länger als {n}k Zeichen.': { fr: 'Le code dépasse {n}k caractères.', it: 'Il codice supera i {n}k caratteri.', en: 'The code is longer than {n}k characters.' },
  'hook darf nicht async sein – es gibt nichts zu warten.': {
    fr: 'hook ne doit pas être async – il n’y a rien à attendre.',
    it: 'hook non può essere async – non c’è niente da attendere.',
    en: 'hook must not be async – there is nothing to wait for.',
  },
  'hook muss das event (ein Objekt) zurückgeben oder nichts.': {
    fr: 'hook doit renvoyer l’event (un objet) ou rien.',
    it: 'hook deve restituire l’event (un oggetto) o niente.',
    en: 'hook must return the event (an object) or nothing.',
  },
  'Abgebrochen nach {ms} ms.': { fr: 'Interrompu après {ms} ms.', it: 'Interrotto dopo {ms} ms.', en: 'Aborted after {ms} ms.' },
  'Der Hook ist abgestürzt.': { fr: 'Le hook a planté.', it: 'Il hook si è bloccato.', en: 'The hook crashed.' },
  'Die Daten sind zu gross für einen Hook.': {
    fr: 'Les données sont trop volumineuses pour un hook.',
    it: 'I dati sono troppo grandi per un hook.',
    en: 'The data is too large for a hook.',
  },
  'Höchstens 50 Hooks.': { fr: '50 hooks au maximum.', it: 'Al massimo 50 hook.', en: '50 hooks at most.' },
  'Unbekanntes Ereignis für einen Hook.': { fr: 'Événement inconnu pour un hook.', it: 'Evento sconosciuto per un hook.', en: 'Unknown event for a hook.' },

  /* ---------- settings, onboarding, system ---------- */
  'Diese Einstellung ist der Werkbank vorbehalten.': {
    fr: 'Ce réglage est réservé à la Werkbank.',
    it: 'Questa impostazione è riservata alla Werkbank.',
    en: 'This setting is reserved for Werkbank.',
  },
  'Eigenes CSS und Design-Tokens gibt es in der Werkbank.': {
    fr: 'Le CSS personnalisé et les design tokens se trouvent dans la Werkbank.',
    it: 'CSS personalizzato e design token si trovano nella Werkbank.',
    en: 'Custom CSS and design tokens are in Werkbank.',
  },
  'Die Adresse muss wie «https://www.beispiel.ch» aussehen.': {
    fr: 'L’adresse doit ressembler à «https://www.exemple.ch».',
    it: 'L’indirizzo deve essere come «https://www.esempio.ch».',
    en: 'The address must look like “https://www.example.ch”.',
  },
  'Für die QR-Rechnung braucht es eine gültige IBAN aus der Schweiz oder Liechtenstein.': {
    fr: 'La QR-facture nécessite un IBAN valide de Suisse ou du Liechtenstein.',
    it: 'Per la QR-fattura serve un IBAN valido della Svizzera o del Liechtenstein.',
    en: 'The QR bill needs a valid IBAN from Switzerland or Liechtenstein.',
  },
  'Webhooks müssen eine https-Adresse haben.': {
    fr: 'Les webhooks doivent avoir une adresse https.',
    it: 'I webhook devono avere un indirizzo https.',
    en: 'Webhooks must have an https address.',
  },
  'Diese Sprache gibt es nicht.': { fr: 'Cette langue n’existe pas.', it: 'Questa lingua non esiste.', en: 'This language doesn’t exist.' },
  'Speichere den Webhook zuerst.': { fr: 'Enregistrez d’abord le webhook.', it: 'Salva prima il webhook.', en: 'Save the webhook first.' },
  'Das sieht nicht nach einer Web-Adresse aus.': {
    fr: 'Cela ne ressemble pas à une adresse web.',
    it: 'Questo non sembra un indirizzo web.',
    en: 'That doesn’t look like a web address.',
  },
  'Diese Adresse kann Nova nicht abrufen.': {
    fr: 'Nova ne peut pas consulter cette adresse.',
    it: 'Nova non può accedere a questo indirizzo.',
    en: 'Nova can’t fetch this address.',
  },
  'Bitte warte kurz.': { fr: 'Veuillez patienter un instant.', it: 'Aspetta un momento.', en: 'Please wait a moment.' },
  'Die Website hat nicht geantwortet. Du kannst die Angaben auch selbst eintragen.': {
    fr: 'Le site n’a pas répondu. Vous pouvez aussi saisir les informations vous-même.',
    it: 'Il sito non ha risposto. Puoi anche inserire i dati tu stesso.',
    en: 'The website didn’t respond. You can also enter the details yourself.',
  },
  'Die Einrichtung ist schon abgeschlossen.': { fr: 'La configuration est déjà terminée.', it: 'La configurazione è già conclusa.', en: 'Setup is already complete.' },
  'Unbekannter Stil.': { fr: 'Style inconnu.', it: 'Stile sconosciuto.', en: 'Unknown style.' },
  'Die Domain muss wie «https://www.beispiel.ch» aussehen.': {
    fr: 'Le domaine doit ressembler à «https://www.exemple.ch».',
    it: 'Il dominio deve essere come «https://www.esempio.ch».',
    en: 'The domain must look like “https://www.example.ch”.',
  },
  'Eine Weiterleitung auf sich selbst geht nicht.': {
    fr: 'Une redirection vers elle-même n’est pas possible.',
    it: 'Un reindirizzamento verso sé stesso non è possibile.',
    en: 'A redirect to itself isn’t possible.',
  },
  'Bitte gib eine E-Mail-Adresse ein.': { fr: 'Veuillez saisir une adresse e-mail.', it: 'Inserisci un indirizzo e-mail.', en: 'Please enter an email address.' },
  'Zu dieser Adresse gehört ein Benutzerkonto. Lösche es unter «Team».': {
    fr: 'Un compte utilisateur est lié à cette adresse. Supprimez-le sous «Team».',
    it: 'A questo indirizzo è collegato un account utente. Eliminalo in «Team».',
    en: 'A user account belongs to this address. Delete it under “Team”.',
  },
  'Ungültige Adresse.': { fr: 'Adresse invalide.', it: 'Indirizzo non valido.', en: 'Invalid address.' },
  'Logo hochladen': { fr: 'Téléverser le logo', it: 'Carica il logo', en: 'Upload logo' },
  'Adresse und Kontakt eintragen': { fr: 'Saisir l’adresse et le contact', it: 'Inserisci indirizzo e contatto', en: 'Enter address and contact details' },
  'Startseite mit eigenen Worten füllen': {
    fr: 'Remplir la page d’accueil avec vos propres mots',
    it: 'Riempi la pagina iniziale con parole tue',
    en: 'Fill the home page in your own words',
  },
  'Impressum und Datenschutz prüfen': {
    fr: 'Vérifier les mentions légales et la protection des données',
    it: 'Controlla note legali e protezione dei dati',
    en: 'Check legal notice and privacy policy',
  },
  'Eigene Domain verbinden': { fr: 'Connecter votre propre domaine', it: 'Collega il tuo dominio', en: 'Connect your own domain' },
  'Website veröffentlichen': { fr: 'Publier le site', it: 'Pubblica il sito', en: 'Publish website' },

  /* ---------- site check ---------- */
  'Link auf «{href}» führt ins Leere.': {
    fr: 'Le lien vers «{href}» ne mène nulle part.',
    it: 'Il link a «{href}» non porta da nessuna parte.',
    en: 'Link to “{href}” leads nowhere.',
  },
  '{n} Bild(er) ohne Alt-Text.': { fr: '{n} image(s) sans texte alternatif.', it: '{n} immagine/i senza testo alternativo.', en: '{n} image(s) without alt text.' },
  'Keine eigene Beschreibung für Suchmaschinen.': {
    fr: 'Pas de description propre pour les moteurs de recherche.',
    it: 'Nessuna descrizione propria per i motori di ricerca.',
    en: 'No custom description for search engines.',
  },
  'Für Suchmaschinen gesperrt.': { fr: 'Bloqué pour les moteurs de recherche.', it: 'Bloccato per i motori di ricerca.', en: 'Blocked for search engines.' },
  'Keine Hauptüberschrift (H1).': { fr: 'Pas de titre principal (H1).', it: 'Nessun titolo principale (H1).', en: 'No main heading (H1).' },
  'Gleicher Seitentitel wie {n} andere: «{title}».': {
    fr: 'Même titre de page que {n} autre(s): «{title}».',
    it: 'Stesso titolo di pagina di altre {n}: «{title}».',
    en: 'Same page title as {n} other(s): “{title}”.',
  },
  'Keine andere Seite verlinkt hierher – Besucher finden sie kaum.': {
    fr: 'Aucune autre page ne renvoie ici – les visiteurs la trouvent difficilement.',
    it: 'Nessun’altra pagina rimanda qui – i visitatori la trovano a fatica.',
    en: 'No other page links here – visitors will hardly find it.',
  },

  /* ---------- business: forms, orders, coupons, bookings, newsletter, donations ---------- */
  'Dieses Formular hat {n} Einträge. Exportiere sie zuerst oder bestätige das Löschen.': {
    fr: 'Ce formulaire contient {n} entrées. Exportez-les d’abord ou confirmez la suppression.',
    it: 'Questo modulo ha {n} voci. Esportale prima o conferma l’eliminazione.',
    en: 'This form has {n} entries. Export them first or confirm deletion.',
  },
  'Dieser Statuswechsel ist nicht möglich.': {
    fr: 'Ce changement de statut n’est pas possible.',
    it: 'Questo cambio di stato non è possibile.',
    en: 'This status change isn’t possible.',
  },
  'Mehr als 100 % Rabatt geht nicht.': {
    fr: 'Plus de 100 % de rabais n’est pas possible.',
    it: 'Non è possibile uno sconto superiore al 100 %.',
    en: 'More than 100 % discount isn’t possible.',
  },
  'Diesen Code gibt es schon.': { fr: 'Ce code existe déjà.', it: 'Questo codice esiste già.', en: 'This code already exists.' },
  'Von «{from}» geht es nicht zu «{to}».': {
    fr: 'Impossible de passer de «{from}» à «{to}».',
    it: 'Non si può passare da «{from}» a «{to}».',
    en: 'You can’t go from “{from}” to “{to}”.',
  },
  'Diese Bestellung ist schon storniert.': { fr: 'Cette commande est déjà annulée.', it: 'Questo ordine è già stato annullato.', en: 'This order has already been cancelled.' },
  'Dort ist zu dieser Zeit schon etwas eingetragen.': {
    fr: 'Il y a déjà quelque chose d’inscrit à cette heure-là.',
    it: 'A quell’ora c’è già qualcosa in agenda.',
    en: 'Something is already booked there at this time.',
  },
  'Zu dieser Zeit ist dort schon etwas eingetragen.': {
    fr: 'À cette heure-là, il y a déjà quelque chose d’inscrit.',
    it: 'A quest’ora c’è già qualcosa in agenda.',
    en: 'At this time, something is already booked there.',
  },
  'Das Ende liegt vor dem Anfang.': { fr: 'La fin est avant le début.', it: 'La fine è prima dell’inizio.', en: 'The end is before the start.' },
  'Ungültiges Datum.': { fr: 'Date invalide.', it: 'Data non valida.', en: 'Invalid date.' },
  'Bitte gib deinen Namen an.': { fr: 'Veuillez indiquer votre nom.', it: 'Indica il tuo nome.', en: 'Please enter your name.' },
  'Bitte gib eine gültige E-Mail-Adresse an.': {
    fr: 'Veuillez indiquer une adresse e-mail valide.',
    it: 'Indica un indirizzo e-mail valido.',
    en: 'Please enter a valid email address.',
  },
  'Bitte gib eine gültige E-Mail-Adresse an, damit wir dir die Bestätigung schicken können.': {
    fr: 'Veuillez indiquer une adresse e-mail valide pour que nous puissions vous envoyer la confirmation.',
    it: 'Indica un indirizzo e-mail valido, così possiamo inviarti la conferma.',
    en: 'Please enter a valid email address so we can send you the confirmation.',
  },
  'Dieses Angebot kann gerade nicht gebucht werden.': {
    fr: 'Cette prestation ne peut pas être réservée pour le moment.',
    it: 'Questa offerta non può essere prenotata al momento.',
    en: 'This service can’t be booked right now.',
  },
  'Diese Zeit ist leider gerade vergeben worden. Bitte wähle eine andere.': {
    fr: 'Ce créneau vient malheureusement d’être pris. Veuillez en choisir un autre.',
    it: 'Purtroppo questo orario è appena stato occupato. Scegline un altro.',
    en: 'Sorry, this time has just been taken. Please choose another one.',
  },
  'Bitte gib eine gültige E-Mail-Adresse an – dorthin schicken wir die Tickets.': {
    fr: 'Veuillez indiquer une adresse e-mail valide – nous y enverrons les billets.',
    it: 'Indica un indirizzo e-mail valido – lì invieremo i biglietti.',
    en: 'Please enter a valid email address – that’s where we’ll send the tickets.',
  },
  'Dieser Anlass ist abgesagt.': { fr: 'Cet événement est annulé.', it: 'Questo evento è annullato.', en: 'This event has been cancelled.' },
  'Die Anmeldung ist geschlossen.': { fr: 'Les inscriptions sont closes.', it: 'Le iscrizioni sono chiuse.', en: 'Registration is closed.' },
  'Wähle mindestens ein Ticket.': { fr: 'Choisissez au moins un billet.', it: 'Scegli almeno un biglietto.', en: 'Choose at least one ticket.' },
  'Pro Bestellung gehen höchstens {max} Tickets.': {
    fr: '{max} billets au maximum par commande.',
    it: 'Al massimo {max} biglietti per ordine.',
    en: 'At most {max} tickets per order.',
  },
  '«{name}» ist ausverkauft.': { fr: '«{name}» est épuisé.', it: '«{name}» è esaurito.', en: '“{name}” is sold out.' },
  'Für «{name}» sind nur noch {n} Plätze frei.': {
    fr: 'Il ne reste que {n} places pour «{name}».',
    it: 'Per «{name}» restano solo {n} posti liberi.',
    en: 'Only {n} places left for “{name}”.',
  },
  'In der Liste steht keine E-Mail-Adresse. Eine Adresse pro Zeile, optional mit Name: «anna@beispiel.ch; Anna».': {
    fr: 'La liste ne contient aucune adresse e-mail. Une adresse par ligne, éventuellement avec un nom: «anna@exemple.ch; Anna».',
    it: 'Nella lista non c’è nessun indirizzo e-mail. Un indirizzo per riga, eventualmente con nome: «anna@esempio.ch; Anna».',
    en: 'The list contains no email address. One address per line, optionally with a name: “anna@example.ch; Anna”.',
  },
  'Verschickte Ausgaben lassen sich nicht mehr ändern.': {
    fr: 'Les éditions envoyées ne peuvent plus être modifiées.',
    it: 'Le edizioni inviate non possono più essere modificate.',
    en: 'Sent issues can no longer be changed.',
  },
  'Verschickte Ausgaben bleiben als Nachweis gespeichert.': {
    fr: 'Les éditions envoyées restent enregistrées comme justificatif.',
    it: 'Le edizioni inviate restano salvate come prova.',
    en: 'Sent issues stay stored as a record.',
  },
  'Die Test-E-Mail konnte nicht verschickt werden. Details stehen im Protokoll des Servers.': {
    fr: 'L’e-mail de test n’a pas pu être envoyé. Les détails figurent dans le journal du serveur.',
    it: 'Non è stato possibile inviare l’e-mail di prova. I dettagli sono nel log del server.',
    en: 'The test email could not be sent. Details are in the server log.',
  },
  'Es ist noch kein E-Mail-Versand eingerichtet (RESEND_API_KEY oder SMTP_URL).': {
    fr: 'Aucun envoi d’e-mails n’est encore configuré (RESEND_API_KEY ou SMTP_URL).',
    it: 'Non è ancora configurato nessun invio di e-mail (RESEND_API_KEY o SMTP_URL).',
    en: 'No email sending has been set up yet (RESEND_API_KEY or SMTP_URL).',
  },
  'Noch niemand hat den Newsletter abonniert.': {
    fr: 'Personne n’est encore abonné à la newsletter.',
    it: 'Nessuno si è ancora iscritto alla newsletter.',
    en: 'Nobody has subscribed to the newsletter yet.',
  },
  'Diese Ausgabe ist schon verschickt oder wird gerade verschickt.': {
    fr: 'Cette édition est déjà envoyée ou en cours d’envoi.',
    it: 'Questa edizione è già stata inviata o è in fase di invio.',
    en: 'This issue has already been sent or is being sent.',
  },
  'Für diese Adresse gibt es in diesem Jahr keine Spenden.': {
    fr: 'Aucun don pour cette adresse cette année.',
    it: 'Per questo indirizzo non ci sono donazioni quest’anno.',
    en: 'There are no donations for this address this year.',
  },

  /* ---------- headless API and GraphQL ---------- */
  'Ungültiges API-Token.': { fr: 'Jeton API invalide.', it: 'Token API non valido.', en: 'Invalid API token.' },
  'Zu viele Anfragen.': { fr: 'Trop de requêtes.', it: 'Troppe richieste.', en: 'Too many requests.' },
  'Für Änderungen braucht es ein API-Token mit Schreibrecht.': {
    fr: 'Les modifications nécessitent un jeton API avec droit d’écriture.',
    it: 'Per le modifiche serve un token API con diritto di scrittura.',
    en: 'Changes require an API token with write access.',
  },
  'Diesen Eintrag gibt es nicht.': { fr: 'Cette entrée n’existe pas.', it: 'Questa voce non esiste.', en: 'This entry doesn’t exist.' },
  'Die Abfrage ist zu tief verschachtelt (höchstens {max} Ebenen).': {
    fr: 'La requête est trop profondément imbriquée ({max} niveaux au maximum).',
    it: 'La query è annidata troppo in profondità (al massimo {max} livelli).',
    en: 'The query is nested too deeply ({max} levels at most).',
  },
  'Es fehlt eine Abfrage (query).': { fr: 'Il manque une requête (query).', it: 'Manca una query.', en: 'A query is missing.' },
  'Die Abfrage ist zu lang.': { fr: 'La requête est trop longue.', it: 'La query è troppo lunga.', en: 'The query is too long.' },
  'Änderungen nur per POST.': { fr: 'Modifications uniquement via POST.', it: 'Modifiche solo tramite POST.', en: 'Changes only via POST.' },
  'Interner Fehler.': { fr: 'Erreur interne.', it: 'Errore interno.', en: 'Internal error.' },
  'variables ist kein gültiges JSON.': { fr: 'variables n’est pas un JSON valide.', it: 'variables non è un JSON valido.', en: 'variables is not valid JSON.' },

  /* ---------- notifications (titles and bodies) – specific patterns before general ones ---------- */
  'Neue Bestellung {number}': { fr: 'Nouvelle commande {number}', it: 'Nuovo ordine {number}', en: 'New order {number}' },
  '{name} · {amount} · auf Rechnung': { fr: '{name} · {amount} · sur facture', it: '{name} · {amount} · su fattura', en: '{name} · {amount} · by invoice' },
  '{name} · {amount} · online, Zahlung offen': {
    fr: '{name} · {amount} · en ligne, paiement en attente',
    it: '{name} · {amount} · online, pagamento in sospeso',
    en: '{name} · {amount} · online, payment pending',
  },
  'Ausverkauft: {product}': { fr: 'Épuisé: {product}', it: 'Esaurito: {product}', en: 'Sold out: {product}' },
  'Nur noch {n} an Lager: {product}': { fr: 'Plus que {n} en stock: {product}', it: 'Solo {n} in magazzino: {product}', en: 'Only {n} left in stock: {product}' },
  'Bestand im Produkt anpassen, sobald Nachschub da ist.': {
    fr: 'Ajustez le stock dans le produit dès que le réassort est arrivé.',
    it: 'Aggiorna la giacenza nel prodotto appena arriva il rifornimento.',
    en: 'Update the stock in the product as soon as new supplies arrive.',
  },
  'Bestellung {number} bezahlt': { fr: 'Commande {number} payée', it: 'Ordine {number} pagato', en: 'Order {number} paid' },
  '{name} · {amount} – bereit zum Versand.': {
    fr: '{name} · {amount} – prête pour l’expédition.',
    it: '{name} · {amount} – pronto per la spedizione.',
    en: '{name} · {amount} – ready to ship.',
  },
  'Bestellung {number}: Lieferung {time}': { fr: 'Commande {number}: livraison {time}', it: 'Ordine {number}: consegna {time}', en: 'Order {number}: delivery {time}' },
  'Bestellung {number}: Abholung {time}': { fr: 'Commande {number}: à emporter {time}', it: 'Ordine {number}: ritiro {time}', en: 'Order {number}: pickup {time}' },
  '{name} · {amount} (vor Ort)': { fr: '{name} · {amount} (sur place)', it: '{name} · {amount} (sul posto)', en: '{name} · {amount} (on site)' },
  'Bestellung {number}': { fr: 'Commande {number}', it: 'Ordine {number}', en: 'Order {number}' },
  'Neues Mitglied: {name}': { fr: 'Nouveau membre: {name}', it: 'Nuovo membro: {name}', en: 'New member: {name}' },
  'Neue Mitgliedschaft: {name}': { fr: 'Nouvelle adhésion: {name}', it: 'Nuovo abbonamento: {name}', en: 'New membership: {name}' },
  'Backup fehlgeschlagen': { fr: 'Échec de la sauvegarde', it: 'Backup non riuscito', en: 'Backup failed' },
  '1 Ticket: {event}': { fr: '1 billet: {event}', it: '1 biglietto: {event}', en: '1 ticket: {event}' },
  '{n} Tickets: {event}': { fr: '{n} billets: {event}', it: '{n} biglietti: {event}', en: '{n} tickets: {event}' },
  'Späte Zahlung: {name}': { fr: 'Paiement tardif: {name}', it: 'Pagamento tardivo: {name}', en: 'Late payment: {name}' },
  '{event} – bitte prüfen, ob noch Platz ist.': {
    fr: '{event} – veuillez vérifier s’il reste de la place.',
    it: '{event} – controlla se c’è ancora posto.',
    en: '{event} – please check whether there is still room.',
  },
  'Spende: {amount} monatlich': { fr: 'Don: {amount} par mois', it: 'Donazione: {amount} al mese', en: 'Donation: {amount} monthly' },
  'Spende: {amount}': { fr: 'Don: {amount}', it: 'Donazione: {amount}', en: 'Donation: {amount}' },
  Anonym: { fr: 'Anonyme', it: 'Anonimo', en: 'Anonymous' },
  'Anonym · {campaign}': { fr: 'Anonyme · {campaign}', it: 'Anonimo · {campaign}', en: 'Anonymous · {campaign}' },
  'Monatliche Spende beendet: {name}': { fr: 'Don mensuel terminé: {name}', it: 'Donazione mensile terminata: {name}', en: 'Monthly donation ended: {name}' },
  'Neu im Newsletter: {name}': { fr: 'Nouvel abonné à la newsletter: {name}', it: 'Nuovo iscritto alla newsletter: {name}', en: 'New newsletter subscriber: {name}' },
  'An {n} Abonnent:innen': { fr: 'À {n} abonné·e·s', it: 'A {n} iscritti', en: 'To {n} subscribers' },
  '{n} Abonnent:innen': { fr: '{n} abonné·e·s', it: '{n} iscritti', en: '{n} subscribers' },
  'Newsletter verschickt: {subject}': { fr: 'Newsletter envoyée: {subject}', it: 'Newsletter inviata: {subject}', en: 'Newsletter sent: {subject}' },
  'Newsletter bereit: {subject}': { fr: 'Newsletter prête: {subject}', it: 'Newsletter pronta: {subject}', en: 'Newsletter ready: {subject}' },
  'Er wartet als Entwurf, bis ein E-Mail-Dienst eingerichtet ist.': {
    fr: 'Elle attend en brouillon jusqu’à ce qu’un service d’e-mail soit configuré.',
    it: 'Resta in bozza finché non viene configurato un servizio e-mail.',
    en: 'It waits as a draft until an email service is set up.',
  },
  'Neue Anfrage: {name}': { fr: 'Nouvelle demande: {name}', it: 'Nuova richiesta: {name}', en: 'New request: {name}' },
  'Neue Reservation: {name}': { fr: 'Nouvelle réservation: {name}', it: 'Nuova prenotazione: {name}', en: 'New reservation: {name}' },
  '{when} · {n} Pers. – bitte bestätigen': {
    fr: '{when} · {n} pers. – veuillez confirmer',
    it: '{when} · {n} pers. – conferma, per favore',
    en: '{when} · {n} guests – please confirm',
  },
  '{when} · {service} – bitte bestätigen': {
    fr: '{when} · {service} – veuillez confirmer',
    it: '{when} · {service} – conferma, per favore',
    en: '{when} · {service} – please confirm',
  },
  '{when} · {n} Pers.': { fr: '{when} · {n} pers.', it: '{when} · {n} pers.', en: '{when} · {n} guests' },
  'Abgesagt: {name}': { fr: 'Annulé: {name}', it: 'Annullata: {name}', en: 'Cancelled: {name}' },
  'Anzahlung erhalten: {amount}': { fr: 'Acompte reçu: {amount}', it: 'Acconto ricevuto: {amount}', en: 'Deposit received: {amount}' },
  'Die Reservation ist gesichert.': { fr: 'La réservation est garantie.', it: 'La prenotazione è garantita.', en: 'The reservation is secured.' },
  'Freigabe erbeten: Ohne Titel': { fr: 'Validation demandée: sans titre', it: 'Approvazione richiesta: senza titolo', en: 'Approval requested: untitled' },
  'Freigabe erbeten: {title}': { fr: 'Validation demandée: {title}', it: 'Approvazione richiesta: {title}', en: 'Approval requested: {title}' },
  '{name} möchte das veröffentlichen.': { fr: '{name} souhaite publier ceci.', it: '{name} vorrebbe pubblicarlo.', en: '{name} would like to publish this.' },
  'Gesendet von {page}': { fr: 'Envoyé depuis {page}', it: 'Inviato da {page}', en: 'Sent from {page}' },
  'Neuer Kommentar von {name}': { fr: 'Nouveau commentaire de {name}', it: 'Nuovo commento di {name}', en: 'New comment from {name}' },
  '«{text}» – wartet auf Freigabe.': { fr: '«{text}» – en attente de validation.', it: '«{text}» – in attesa di approvazione.', en: '“{text}” – awaiting approval.' },
  'Anfrage: {title}': { fr: 'Demande: {title}', it: 'Richiesta: {title}', en: 'Enquiry: {title}' },
  '{name} möchte besichtigen': { fr: '{name} souhaite visiter', it: '{name} vorrebbe visitare', en: '{name} would like a viewing' },
  'Der Kommentar ist leer.': { fr: 'Le commentaire est vide.', it: 'Il commento è vuoto.', en: 'The comment is empty.' },
  'Diesen Kommentar gibt es nicht mehr.': { fr: 'Ce commentaire n’existe plus.', it: 'Questo commento non esiste più.', en: 'This comment no longer exists.' },
  'Antworten gehen an den ersten Kommentar eines Gesprächs.': {
    fr: 'Les réponses s’adressent au premier commentaire d’une discussion.',
    it: 'Le risposte vanno al primo commento di una discussione.',
    en: 'Replies go to the first comment of a thread.',
  },
  'Nur wer den Kommentar geschrieben hat, kann ihn ändern.': {
    fr: 'Seule la personne qui a écrit le commentaire peut le modifier.',
    it: 'Solo chi ha scritto il commento può modificarlo.',
    en: 'Only the person who wrote the comment can change it.',
  },
  'Erledigt wird das ganze Gespräch, nicht eine Antwort.': {
    fr: 'C’est toute la discussion qui est réglée, pas une réponse.',
    it: 'Si risolve l’intera discussione, non una risposta.',
    en: 'The whole thread is resolved, not a single reply.',
  },
  'Nur wer den Kommentar geschrieben hat, kann ihn löschen.': {
    fr: 'Seule la personne qui a écrit le commentaire peut le supprimer.',
    it: 'Solo chi ha scritto il commento può eliminarlo.',
    en: 'Only the person who wrote the comment can delete it.',
  },
  'Du kannst nur Kommentare zu deinen eigenen Beiträgen sehen.': {
    fr: 'Vous ne pouvez voir que les commentaires sur vos propres articles.',
    it: 'Puoi vedere solo i commenti sui tuoi articoli.',
    en: 'You can only see comments on your own posts.',
  },
  '{user} hat dich erwähnt: {title}': { fr: '{user} vous a mentionné : {title}', it: '{user} ti ha menzionato: {title}', en: '{user} mentioned you: {title}' },
  '{user} hat geantwortet: {title}': { fr: '{user} a répondu : {title}', it: '{user} ha risposto: {title}', en: '{user} replied: {title}' },
  'Neuer Kommentar von {user}: {title}': { fr: 'Nouveau commentaire de {user} : {title}', it: 'Nuovo commento di {user}: {title}', en: 'New comment from {user}: {title}' },
  'Der KI-Dienst ist gerade nicht erreichbar. Versuch es später nochmal.': {
    fr: 'Le service d’IA n’est pas joignable pour le moment. Réessayez plus tard.',
    it: 'Il servizio di IA al momento non è raggiungibile. Riprova più tardi.',
    en: 'The AI service can’t be reached right now. Try again later.',
  },
  'Der Schlüssel für den KI-Assistenten wird nicht akzeptiert. Prüf ANTHROPIC_API_KEY in den Variablen des Dienstes.': {
    fr: 'La clé de l’assistant IA n’est pas acceptée. Vérifiez ANTHROPIC_API_KEY dans les variables du service.',
    it: 'La chiave dell’assistente IA non viene accettata. Controlla ANTHROPIC_API_KEY nelle variabili del servizio.',
    en: 'The key for the AI assistant isn’t accepted. Check ANTHROPIC_API_KEY in the service’s variables.',
  },
  'Der KI-Dienst ist gerade ausgelastet. Versuch es in einer Minute nochmal.': {
    fr: 'Le service d’IA est surchargé. Réessayez dans une minute.',
    it: 'Il servizio di IA è sovraccarico. Riprova tra un minuto.',
    en: 'The AI service is busy. Try again in a minute.',
  },
  'Der KI-Dienst hat keinen Vorschlag geliefert. Versuch es später nochmal.': {
    fr: 'Le service d’IA n’a fourni aucune proposition. Réessayez plus tard.',
    it: 'Il servizio di IA non ha fornito alcuna proposta. Riprova più tardi.',
    en: 'The AI service didn’t return a suggestion. Try again later.',
  },
  'Dazu macht der KI-Assistent keinen Vorschlag.': {
    fr: 'L’assistant IA ne fait pas de proposition pour cela.',
    it: 'Per questo l’assistente IA non fa proposte.',
    en: 'The AI assistant won’t make a suggestion for this.',
  },
  'Dieses Bild gibt es nicht mehr.': { fr: 'Cette image n’existe plus.', it: 'Questa immagine non esiste più.', en: 'This image no longer exists.' },
  'Dieses Bild gibt es nicht.': { fr: 'Cette image n’existe pas.', it: 'Questa immagine non esiste.', en: 'This image doesn’t exist.' },
  'Für diese Datei gibt es keinen Vorschlag.': { fr: 'Pas de proposition pour ce fichier.', it: 'Nessuna proposta per questo file.', en: 'There’s no suggestion for this file.' },
  'Das Bild lässt sich nicht lesen.': { fr: 'L’image ne peut pas être lue.', it: 'L’immagine non si può leggere.', en: 'The image can’t be read.' },
  'Der KI-Assistent ist ausgeschaltet.': { fr: 'L’assistant IA est désactivé.', it: 'L’assistente IA è disattivato.', en: 'The AI assistant is switched off.' },
  'Für diese Stunde sind genug Vorschläge abgerufen. Versuch es später nochmal.': {
    fr: 'Assez de propositions pour cette heure. Réessayez plus tard.',
    it: 'Per quest’ora sono state richieste abbastanza proposte. Riprova più tardi.',
    en: 'That’s enough suggestions for this hour. Try again later.',
  },
  'Erst braucht es einen Text.': { fr: 'Il faut d’abord un texte.', it: 'Prima serve un testo.', en: 'There needs to be some text first.' },
  'Der Text ist zu lang für einen Vorschlag.': {
    fr: 'Le texte est trop long pour une proposition.',
    it: 'Il testo è troppo lungo per una proposta.',
    en: 'The text is too long for a suggestion.',
  },
  'In diese Sprache wird nicht übersetzt.': {
    fr: 'Le site n’est pas traduit dans cette langue.',
    it: 'Il sito non è tradotto in questa lingua.',
    en: 'The site isn’t translated into this language.',
  },
  'Dieser Eintrag ist zu lang für einen Übersetzungsentwurf am Stück.': {
    fr: 'Cette entrée est trop longue pour un projet de traduction d’un seul tenant.',
    it: 'Questa voce è troppo lunga per una bozza di traduzione in un colpo solo.',
    en: 'This entry is too long for a translation draft in one go.',
  },
  'Das geht nur mit Videos aus der Mediathek.': {
    fr: 'Cela ne fonctionne qu’avec les vidéos de la médiathèque.',
    it: 'Funziona solo con i video della mediateca.',
    en: 'This only works with videos from the media library.',
  },
  'In der Datei wurde Schadsoftware gefunden ({name}). Sie wurde nicht gespeichert.': {
    fr: 'Un logiciel malveillant a été trouvé dans le fichier ({name}). Il n’a pas été enregistré.',
    it: 'Nel file è stato trovato software dannoso ({name}). Non è stato salvato.',
    en: 'Malware was found in the file ({name}). It was not stored.',
  },
  'Upload abgelehnt: Schadsoftware in «{name}»': {
    fr: 'Téléversement refusé : logiciel malveillant dans « {name} »',
    it: 'Caricamento rifiutato: software dannoso in «{name}»',
    en: 'Upload refused: malware in “{name}”',
  },
  'Programmdateien werden nicht angenommen.': {
    fr: 'Les fichiers programmes ne sont pas acceptés.',
    it: 'I file di programma non sono accettati.',
    en: 'Program files are not accepted.',
  },
  'Dokumente mit Makros oder ActiveX werden nicht angenommen. Speichere die Datei ohne Makros (als .docx/.xlsx) und lade sie nochmals hoch.': {
    fr: 'Les documents avec macros ou ActiveX ne sont pas acceptés. Enregistrez le fichier sans macros (en .docx/.xlsx) et téléversez-le à nouveau.',
    it: 'I documenti con macro o ActiveX non sono accettati. Salva il file senza macro (come .docx/.xlsx) e caricalo di nuovo.',
    en: 'Documents with macros or ActiveX are not accepted. Save the file without macros (as .docx/.xlsx) and upload it again.',
  },
  'Im Archiv steckt eine Programmdatei («{name}»). Solche Archive werden nicht angenommen.': {
    fr: 'L’archive contient un fichier programme (« {name} »). De telles archives ne sont pas acceptées.',
    it: 'Nell’archivio c’è un file di programma («{name}»). Archivi di questo tipo non sono accettati.',
    en: 'The archive contains a program file (“{name}”). Archives like that are not accepted.',
  },
  'Diese PDF enthält JavaScript. Speichere sie neu als PDF (z. B. über «Drucken → Als PDF sichern») und lade sie nochmals hoch.': {
    fr: 'Ce PDF contient du JavaScript. Enregistrez-le à nouveau en PDF (p. ex. via « Imprimer → Enregistrer en PDF ») et téléversez-le à nouveau.',
    it: 'Questo PDF contiene JavaScript. Salvalo di nuovo come PDF (p. es. con «Stampa → Salva come PDF») e caricalo di nuovo.',
    en: 'This PDF contains JavaScript. Save it again as a PDF (e.g. via “Print → Save as PDF”) and upload it again.',
  },
  'Diese PDF startet Programme oder enthält angehängte Dateien. Speichere sie neu als PDF (z. B. über «Drucken → Als PDF sichern») und lade sie nochmals hoch.': {
    fr: 'Ce PDF lance des programmes ou contient des fichiers joints. Enregistrez-le à nouveau en PDF (p. ex. via « Imprimer → Enregistrer en PDF ») et téléversez-le à nouveau.',
    it: 'Questo PDF avvia programmi o contiene file allegati. Salvalo di nuovo come PDF (p. es. con «Stampa → Salva come PDF») e caricalo di nuovo.',
    en: 'This PDF starts programs or contains attached files. Save it again as a PDF (e.g. via “Print → Save as PDF”) and upload it again.',
  },
  'Die Virenprüfung ist gerade nicht erreichbar. Versuch es in einer Minute nochmal.': {
    fr: 'La vérification antivirus n’est pas joignable pour le moment. Réessayez dans une minute.',
    it: 'Il controllo antivirus al momento non è raggiungibile. Riprova tra un minuto.',
    en: 'The virus check can’t be reached right now. Try again in a minute.',
  },
  'Die Virenprüfung hat die Datei nicht prüfen können. Versuch es nochmal oder frag die Person, die Nova betreibt.': {
    fr: 'La vérification antivirus n’a pas pu contrôler le fichier. Réessayez ou demandez à la personne qui gère Nova.',
    it: 'Il controllo antivirus non è riuscito a verificare il file. Riprova o chiedi alla persona che gestisce Nova.',
    en: 'The virus check couldn’t check the file. Try again or ask the person who runs Nova.',
  },
};
