/** Shared website texts: header, footer, navigation, pagination, general words. */
export const core: Record<string, { fr: string; it: string; en: string }> = {
  Sprache: { fr: 'Langue', it: 'Lingua', en: 'Language' },

  // Header & navigation
  'Zum Inhalt springen': { fr: 'Aller au contenu', it: 'Vai al contenuto', en: 'Skip to content' },
  Warenkorb: { fr: 'Panier', it: 'Carrello', en: 'Cart' },
  'Warenkorb, {n} Artikel': { fr: 'Panier, {n} article(s)', it: 'Carrello, {n} articoli', en: 'Cart, {n} items' },
  Hauptnavigation: { fr: 'Navigation principale', it: 'Navigazione principale', en: 'Main navigation' },
  'Hauptnavigation mobil': { fr: 'Navigation principale mobile', it: 'Navigazione principale mobile', en: 'Main navigation (mobile)' },
  Menü: { fr: 'Menu', it: 'Menu', en: 'Menu' },
  Brotkrümel: { fr: 'Fil d’Ariane', it: 'Percorso di navigazione', en: 'Breadcrumb' },
  Startseite: { fr: 'Accueil', it: 'Home', en: 'Home' },

  // Footer
  Öffnungszeiten: { fr: 'Heures d’ouverture', it: 'Orari di apertura', en: 'Opening hours' },
  Folgen: { fr: 'Suivez-nous', it: 'Seguici', en: 'Follow us' },

  // Age gate
  'Bist du {age} oder älter?': { fr: 'Avez-vous {age} ans ou plus?', it: 'Hai {age} anni o più?', en: 'Are you {age} or older?' },
  'Ja, ich bin {age}+': { fr: 'Oui, j’ai {age} ans ou plus', it: 'Sì, ho {age}+ anni', en: 'Yes, I’m {age}+' },
  'Nein, verlassen': { fr: 'Non, quitter le site', it: 'No, esci', en: 'No, leave' },
  'Bestätige dein Alter mit deiner E-ID in der App swiyu. Wir erfahren nur, ob du alt genug bist – nicht deinen Namen und nicht dein Geburtsdatum.': {
    fr: 'Confirmez votre âge avec votre e-ID dans l’app swiyu. Nous apprenons seulement si vous avez l’âge requis – ni votre nom, ni votre date de naissance.',
    it: 'Conferma la tua età con la tua e-ID nell’app swiyu. Sappiamo solo se hai l’età richiesta – né il tuo nome né la tua data di nascita.',
    en: 'Confirm your age with your e-ID in the swiyu app. We only learn whether you are old enough – not your name and not your date of birth.',
  },
  'Bestätige dein Alter mit deiner E-ID in der App swiyu. Wir prüfen dabei nur dein Geburtsdatum und speichern es nicht.': {
    fr: 'Confirmez votre âge avec votre e-ID dans l’app swiyu. Nous vérifions uniquement votre date de naissance et ne l’enregistrons pas.',
    it: 'Conferma la tua età con la tua e-ID nell’app swiyu. Controlliamo solo la tua data di nascita e non la salviamo.',
    en: 'Confirm your age with your e-ID in the swiyu app. We only check your date of birth and do not store it.',
  },
  'Mit E-ID bestätigen': { fr: 'Confirmer avec l’e-ID', it: 'Conferma con l’e-ID', en: 'Confirm with e-ID' },
  'In swiyu öffnen': { fr: 'Ouvrir dans swiyu', it: 'Apri in swiyu', en: 'Open in swiyu' },
  'Scanne den Code mit der App swiyu – oder öffne sie auf diesem Gerät.': {
    fr: 'Scannez le code avec l’app swiyu – ou ouvrez-la sur cet appareil.',
    it: 'Scansiona il codice con l’app swiyu – oppure aprila su questo dispositivo.',
    en: 'Scan the code with the swiyu app – or open it on this device.',
  },
  'Bestätigt. Einen Moment …': { fr: 'Confirmé. Un instant …', it: 'Confermato. Un attimo …', en: 'Confirmed. One moment …' },
  'Laut deiner E-ID bist du noch nicht {age}. Diese Website ist für dich gesperrt.': {
    fr: 'Selon votre e-ID, vous n’avez pas encore {age} ans. Ce site ne vous est pas accessible.',
    it: 'Secondo la tua e-ID non hai ancora {age} anni. Questo sito non è accessibile per te.',
    en: 'According to your e-ID you are not yet {age}. This website is closed to you.',
  },
  'Die Prüfung wurde abgebrochen. Du kannst es nochmals versuchen.': {
    fr: 'La vérification a été interrompue. Vous pouvez réessayer.',
    it: 'La verifica è stata interrotta. Puoi riprovare.',
    en: 'The check was cancelled. You can try again.',
  },
  'Die Zeit ist abgelaufen. Bitte starte die Prüfung nochmals.': {
    fr: 'Le délai est écoulé. Veuillez relancer la vérification.',
    it: 'Il tempo è scaduto. Avvia di nuovo la verifica.',
    en: 'Time is up. Please start the check again.',
  },
  'Die Prüfung ist gerade nicht möglich. Bitte versuch es später nochmals.': {
    fr: 'La vérification n’est pas possible pour le moment. Veuillez réessayer plus tard.',
    it: 'La verifica al momento non è possibile. Riprova più tardi.',
    en: 'The check isn’t possible right now. Please try again later.',
  },
  'Noch keine E-ID? Du beantragst sie in der App swiyu.': {
    fr: 'Pas encore d’e-ID ? Vous la demandez dans l’app swiyu.',
    it: 'Non hai ancora un’e-ID? La richiedi nell’app swiyu.',
    en: 'No e-ID yet? You apply for it in the swiyu app.',
  },
  'Für die Prüfung mit der E-ID braucht es JavaScript.': {
    fr: 'La vérification avec l’e-ID nécessite JavaScript.',
    it: 'Per la verifica con l’e-ID serve JavaScript.',
    en: 'The e-ID check needs JavaScript.',
  },

  // Lists & pagination
  Alle: { fr: 'Tous', it: 'Tutti', en: 'All' },
  'Nach Kategorie filtern': { fr: 'Filtrer par catégorie', it: 'Filtra per categoria', en: 'Filter by category' },
  Weiteres: { fr: 'Autres', it: 'Altro', en: 'More' },
  Seiten: { fr: 'Pages', it: 'Pagine', en: 'Pages' },
  Neuere: { fr: 'Plus récents', it: 'Più recenti', en: 'Newer' },
  Ältere: { fr: 'Plus anciens', it: 'Meno recenti', en: 'Older' },
  'Seite {n} von {total}': { fr: 'Page {n} sur {total}', it: 'Pagina {n} di {total}', en: 'Page {n} of {total}' },
  'Hier erscheint bald etwas.': { fr: 'Du contenu arrive bientôt.', it: 'Presto qui ci sarà qualcosa.', en: 'Something will appear here soon.' },
  'Kommende {name}': { fr: '{name} à venir', it: '{name} in programma', en: 'Upcoming {name}' },
  'Vergangene {name}': { fr: '{name} passés', it: '{name} passati', en: 'Past {name}' },
  '{name} bei {site}.': { fr: '{name} chez {site}.', it: '{name} da {site}.', en: '{name} at {site}.' },
  '{name} bei {site}: {items}.': { fr: '{name} chez {site}: {items}.', it: '{name} da {site}: {items}.', en: '{name} at {site}: {items}.' },
  '{name} von {site}.': { fr: '{name} de {site}.', it: '{name} di {site}.', en: '{name} by {site}.' },
  '{name} von {site} – {category}.': { fr: '{name} de {site} – {category}.', it: '{name} di {site} – {category}.', en: '{name} by {site} – {category}.' },
  Karte: { fr: 'Carte', it: 'Menù', en: 'Menu' },
  'Karte – {site}': { fr: 'Carte – {site}', it: 'Menù – {site}', en: 'Menu – {site}' },
  'Karte von {site}: {dishes}.': { fr: 'Carte de {site}: {dishes}.', it: 'Menù di {site}: {dishes}.', en: 'Menu of {site}: {dishes}.' },
  Druckversion: { fr: 'Version imprimable', it: 'Versione stampabile', en: 'Print version' },

  // Posts
  'Serie: {name}': { fr: 'Série: {name}', it: 'Serie: {name}', en: 'Series: {name}' },
  '{n} Min. Lesezeit': { fr: '{n} min de lecture', it: '{n} min di lettura', en: '{n} min read' },
  Weiterlesen: { fr: 'À lire aussi', it: 'Continua a leggere', en: 'Read more' },

  // Comments
  Kommentar: { fr: 'Commentaire', it: 'Commento', en: 'Comment' },
  Kommentare: { fr: 'Commentaires', it: 'Commenti', en: 'Comments' },
  '1 Kommentar': { fr: '1 commentaire', it: '1 commento', en: '1 comment' },
  '{n} Kommentare': { fr: '{n} commentaires', it: '{n} commenti', en: '{n} comments' },
  'Danke! Dein Kommentar erscheint, sobald er freigegeben ist.': {
    fr: 'Merci! Votre commentaire apparaîtra dès qu’il aura été approuvé.',
    it: 'Grazie! Il tuo commento apparirà non appena sarà approvato.',
    en: 'Thank you! Your comment will appear once it has been approved.',
  },
  'Kommentar schreiben': { fr: 'Écrire un commentaire', it: 'Scrivi un commento', en: 'Write a comment' },
  Name: { fr: 'Nom', it: 'Nome', en: 'Name' },
  'E-Mail': { fr: 'E-mail', it: 'E-mail', en: 'Email' },
  '(wird nicht veröffentlicht)': { fr: '(ne sera pas publié)', it: '(non verrà pubblicato)', en: '(will not be published)' },
  Absenden: { fr: 'Envoyer', it: 'Invia', en: 'Send' },
  'Kommentare werden vor der Veröffentlichung geprüft.': {
    fr: 'Les commentaires sont vérifiés avant publication.',
    it: 'I commenti vengono controllati prima della pubblicazione.',
    en: 'Comments are reviewed before they are published.',
  },

  // Product page
  'Digitales Produkt – Download nach der Zahlung.': {
    fr: 'Produit numérique – téléchargement après le paiement.',
    it: 'Prodotto digitale – download dopo il pagamento.',
    en: 'Digital product – download after payment.',
  },
  'inkl. MwSt., Versand {flat}, ab {free} gratis': {
    fr: 'TVA incl., livraison {flat}, offerte dès {free}',
    it: 'IVA incl., spedizione {flat}, gratuita da {free}',
    en: 'incl. VAT, shipping {flat}, free from {free}',
  },
  'inkl. MwSt., zzgl. Versand {flat}': { fr: 'TVA incl., plus livraison {flat}', it: 'IVA incl., più spedizione {flat}', en: 'incl. VAT, plus shipping {flat}' },
  'Im Warenkorb.': { fr: 'Ajouté au panier.', it: 'Aggiunto al carrello.', en: 'Added to cart.' },
  'Zum Warenkorb': { fr: 'Voir le panier', it: 'Vai al carrello', en: 'View cart' },
  Ausverkauft: { fr: 'Épuisé', it: 'Esaurito', en: 'Sold out' },
  Variante: { fr: 'Variante', it: 'Variante', en: 'Variant' },
  '{name} – ausverkauft': { fr: '{name} – épuisé', it: '{name} – esaurito', en: '{name} – sold out' },
  Menge: { fr: 'Quantité', it: 'Quantità', en: 'Quantity' },
  'In den Warenkorb': { fr: 'Ajouter au panier', it: 'Aggiungi al carrello', en: 'Add to cart' },
  'Nur noch {n} Stück an Lager': { fr: 'Plus que {n} en stock', it: 'Solo {n} pezzi disponibili', en: 'Only {n} left in stock' },

  // Project & profile pages
  Kunde: { fr: 'Client', it: 'Cliente', en: 'Client' },
  Jahr: { fr: 'Année', it: 'Anno', en: 'Year' },
  Bereich: { fr: 'Domaine', it: 'Settore', en: 'Field' },
  'Nächstes Projekt': { fr: 'Projet suivant', it: 'Progetto successivo', en: 'Next project' },
  'Alle Projekte': { fr: 'Tous les projets', it: 'Tutti i progetti', en: 'All projects' },
  'Gerade verfügbar': { fr: 'Disponible maintenant', it: 'Disponibile ora', en: 'Available now' },
  Sprachen: { fr: 'Langues', it: 'Lingue', en: 'Languages' },
  Leistungen: { fr: 'Prestations', it: 'Servizi', en: 'Services' },
  Anwesend: { fr: 'Jours de présence', it: 'Giorni di presenza', en: 'Available on' },
  Ja: { fr: 'Oui', it: 'Sì', en: 'Yes' },
  Nein: { fr: 'Non', it: 'No', en: 'No' },

  // Members: account link and paywall
  'Mein Konto': { fr: 'Mon compte', it: 'Il mio account', en: 'My account' },
  Anmelden: { fr: 'Se connecter', it: 'Accedi', en: 'Sign in' },
  'Mitglied werden': { fr: 'Devenir membre', it: 'Diventa membro', en: 'Become a member' },
  'Konto erstellen': { fr: 'Créer un compte', it: 'Crea un account', en: 'Create an account' },
  'Schon dabei? Anmelden': { fr: 'Déjà membre? Se connecter', it: 'Sei già iscritto? Accedi', en: 'Already a member? Sign in' },
  '{price} pro Jahr': { fr: '{price} par an', it: '{price} all’anno', en: '{price} per year' },
  '{price} pro Monat': { fr: '{price} par mois', it: '{price} al mese', en: '{price} per month' },
  'pro Jahr': { fr: 'par an', it: 'all’anno', en: 'per year' },
  'pro Monat': { fr: 'par mois', it: 'al mese', en: 'per month' },
  '{plan} abschliessen': { fr: 'Souscrire {plan}', it: 'Abbonati a {plan}', en: 'Get {plan}' },
  '{plan} abschliessen – {price}': { fr: 'Souscrire {plan} – {price}', it: 'Abbonati a {plan} – {price}', en: 'Get {plan} – {price}' },
  'Weiterlesen mit der {plan}': { fr: 'Poursuivez la lecture avec {plan}', it: 'Continua a leggere con {plan}', en: 'Keep reading with {plan}' },
  'Weiterlesen mit deinem Konto': { fr: 'Poursuivez la lecture avec votre compte', it: 'Continua a leggere con il tuo account', en: 'Keep reading with your account' },
  'Dieser Inhalt ist Teil der {plan}': { fr: 'Ce contenu fait partie de {plan}', it: 'Questo contenuto fa parte di {plan}', en: 'This content is part of {plan}' },
  '{price}, jederzeit kündbar.': { fr: '{price}, résiliable à tout moment.', it: '{price}, disdicibile in qualsiasi momento.', en: '{price}, cancel any time.' },
  '{price}, jederzeit kündbar. Bezahlt wird sicher über Stripe.': {
    fr: '{price}, résiliable à tout moment. Paiement sécurisé via Stripe.',
    it: '{price}, disdicibile in qualsiasi momento. Pagamento sicuro tramite Stripe.',
    en: '{price}, cancel any time. Secure payment via Stripe.',
  },
  'Jederzeit kündbar. Bezahlt wird sicher über Stripe.': {
    fr: 'Résiliable à tout moment. Paiement sécurisé via Stripe.',
    it: 'Disdicibile in qualsiasi momento. Pagamento sicuro tramite Stripe.',
    en: 'Cancel any time. Secure payment via Stripe.',
  },
  'Melde dich an, wenn du schon dabei bist.': { fr: 'Connectez-vous si vous êtes déjà membre.', it: 'Accedi se sei già iscritto.', en: 'Sign in if you’re already a member.' },
  'Das Konto ist kostenlos und in einer Minute erstellt.': {
    fr: 'Le compte est gratuit et créé en une minute.',
    it: 'L’account è gratuito e si crea in un minuto.',
    en: 'The account is free and takes a minute to set up.',
  },
  'Melde dich mit deinem Konto an. Neue Konten gibt es auf Einladung.': {
    fr: 'Connectez-vous avec votre compte. Les nouveaux comptes sont attribués sur invitation.',
    it: 'Accedi con il tuo account. I nuovi account sono disponibili solo su invito.',
    en: 'Sign in with your account. New accounts are by invitation only.',
  },
  'Den Zugang vergibt {site} persönlich – schreib uns einfach.': {
    fr: '{site} accorde l’accès personnellement – écrivez-nous simplement.',
    it: 'L’accesso viene concesso personalmente da {site} – scrivici.',
    en: '{site} grants access personally – just write to us.',
  },
  'Für zahlende Mitglieder': { fr: 'Pour les membres payants', it: 'Per i membri paganti', en: 'For paying members' },
  'Für Mitglieder': { fr: 'Pour les membres', it: 'Per i membri', en: 'For members' },
  'Du bist dabei. Danke!': { fr: 'Vous êtes membre. Merci!', it: 'Sei dei nostri. Grazie!', en: 'You’re in. Thank you!' },
  Kostenlos: { fr: 'Gratuit', it: 'Gratuito', en: 'Free' },

  // Consent for statistics services
  'Statistik-Einstellungen': { fr: 'Paramètres de statistiques', it: 'Impostazioni statistiche', en: 'Analytics settings' },
  und: { fr: 'et', it: 'e', en: 'and' },
  'Darf diese Website Besuche auswerten?': {
    fr: 'Ce site peut-il analyser les visites ?',
    it: 'Questo sito può analizzare le visite?',
    en: 'May this website analyse visits?',
  },
  'Mit deiner Einwilligung nutzen wir {services}, um zu sehen, welche Seiten gelesen werden. Dabei werden Cookies gesetzt und Daten an den Anbieter übertragen. Du kannst das jederzeit in der Fusszeile ändern.':
    {
      fr: 'Avec votre accord, nous utilisons {services} pour voir quelles pages sont lues. Des cookies sont alors déposés et des données transmises au fournisseur. Vous pouvez changer d’avis à tout moment dans le pied de page.',
      it: 'Con il tuo consenso usiamo {services} per vedere quali pagine vengono lette. Vengono impostati cookie e trasmessi dati al fornitore. Puoi cambiare idea in qualsiasi momento nel piè di pagina.',
      en: 'With your consent we use {services} to see which pages get read. This sets cookies and sends data to the provider. You can change this at any time in the footer.',
    },
  'Mehr dazu': { fr: 'En savoir plus', it: 'Maggiori informazioni', en: 'More about this' },
  'Nein, danke': { fr: 'Non, merci', it: 'No, grazie', en: 'No, thanks' },
  Einverstanden: { fr: 'D’accord', it: 'Va bene', en: 'Agree' },
};
