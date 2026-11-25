/* Internazionalizzazione IT/EN del sito.
 * Il testo del sito è scritto in italiano; con la lingua inglese un traduttore automatico "da dizionario"
 * (testi esatti + modelli con {}) sostituisce al volo testi e attributi nel DOM (anche quelli creati dopo).
 * Lingua: preferenza salvata in localStorage "gc_lang" ("system" | "it" | "en"). */
(function () {
  var pref = "system";
  try { pref = localStorage.getItem("gc_lang") || "system"; } catch (e) {}
  var sys = String(navigator.language || "it").toLowerCase().indexOf("en") === 0 ? "en" : "it";
  var lang = pref === "system" ? sys : pref;
  window.GC_LANG = lang;
  window.GC_LANG_PREF = pref;
  window.GC_LOCALE = lang === "en" ? "en-GB" : "it-IT";
  window.gcSetLang = function (p) { try { localStorage.setItem("gc_lang", p); } catch (e) {} location.reload(); };
  document.documentElement.lang = lang;
  window.tr = function (s) { return s; };
  if (lang !== "en") return;

  var PAIRS = [
[
"Nella scheda Trail chiunque abbia fatto il login può aggiornare i trail: lo stato (aperto, chiuso…), il nome e la posizione sulla mappa. Aiuta tutti a tenere i sentieri al giorno!",
"In the Trail tab anyone who is logged in can update the trails: status (open, closed…), name and position on the map. It helps everyone keep the trails up to date!"
],
[
"Hai trovato un sentiero chiuso o di nuovo aperto? Apri il trail nella scheda Trail e aggiungi un commento con il nuovo stato: lo vedono subito tutti.",
"Found a trail that is closed or open again? Open the trail in the Trail tab and add a comment with the new status: everyone sees it right away."
],
[
"Il tracciato di un trail è sbagliato o spostato? Sulla mappa attiva la matita (serve il login), tieni premuto il tracciato e scegli «Modifica»: trascina i punti per correggerlo.",
"Is a trail's route wrong or shifted? On the map turn on the pencil (login needed), long-press the route and choose “Edit”: drag the points to fix it."
],
[
"Suggerimento",
"Tip"
],
[
"Suggerimenti",
"Tips"
],
[
"Tutti i suggerimenti",
"All tips"
],
[
"Home immediata",
"Instant start"
],
[
"Tutte le schede",
"All tabs"
],
[
"Scheda suggerita all'avvio",
"Suggested tab at start"
],
[
"Spento: il sito si apre su questa Home. Attivalo per aprire subito «{}».",
"Off: the site opens on this Home. Turn on to open “{}” right away."
],
[
"Attivo: il sito si apre subito su «{}», senza passare dalla Home (la trovi sempre come prima scheda).",
"On: the site opens straight on “{}”, skipping the Home (it is always the first tab)."
],
[
"Calendari",
"Calendars"
],
[
"Forse",
"Maybe"
],
[
"Non più forse",
"Not maybe anymore"
],
[
"Preferenze ›",
"Preferences ›"
],
[
"Preferenze",
"Preferences"
],
[
"Dal menu → Preferenze → «Barra schede» scegli se le schede scorrono su una riga o sono tutte visibili su due righe.",
"From the menu → Preferences → «Tab bar» choose whether the tabs scroll on one row or are all visible on two rows."
],
[
"Altre info",
"More info"
],
[
"Codice",
"Code"
],
[
"Amministratore",
"Administrator"
],
[
"Creato il",
"Created on"
],
[
"Statistiche",
"Statistics"
],
[
"Uscite totali",
"Total rides"
],
[
"Accessi",
"Opens"
],
[
"Visibilità",
"Visibility"
],
[
"Privato",
"Private"
],
[
"Commenti",
"Comments"
],
[
"Nessun commento.",
"No comments yet."
],
[
"Invia",
"Send"
],
[
"Accedi con Google per leggere e scrivere i commenti.",
"Sign in with Google to read and write comments."
],
[
"modificato",
"edited"
],
[
"🔒 Area strettamente personale: bici e lavori che inserisci qui li vedi solo tu.",
"🔒 Strictly personal area: the bikes and jobs you enter here are visible only to you."
],
[
"Basta!",
"Enough!"
],
[
"Un altro",
"Another"
],
[
"Suggerimenti disattivati: li riattivi dal menu → Suggerimenti",
"Tips turned off: re-enable them from the menu → Tips"
],
[
"Dal menu → «Barra schede» scegli se le schede scorrono su una riga o sono tutte visibili su due righe.",
"From the menu → “Tab bar” choose whether tabs scroll on one row or are all visible on two rows."
],
[
"Dal menu → «Dimensione testo» puoi ingrandire o rimpicciolire tutto il testo del sito.",
"From the menu → “Text size” you can enlarge or shrink all the text on the site."
],
[
"Sulla mappa gli occhi Z, L, T, N, P accendono e spengono zone, costruttori, trail, nomi e punti di interesse: lascia visibile solo quello che ti serve.",
"On the map the eyes Z, L, T, N, P turn zones, builders, trails, names and points of interest on and off: keep visible only what you need."
],
[
"Tocca un punto di interesse sulla mappa e poi «Naviga»: ti porta lì con Google Maps, Waze o Apple Maps (scegli quale dal menu → «App di navigazione»).",
"Tap a point of interest on the map, then “Navigate”: it takes you there with Google Maps, Waze or Apple Maps (choose which from the menu → “Navigation app”)."
],
[
"Il pulsante 3D sulla mappa mostra la zona che stai guardando in rilievo, con i trail colorati per difficoltà.",
"The 3D button on the map shows the area you are looking at in relief, with trails coloured by difficulty."
],
[
"Il pulsante GPX sulla mappa carica un tuo file GPX per vederlo sopra i trail, anche in 3D.",
"The GPX button on the map loads your own GPX file to see it over the trails, in 3D too."
],
[
"Il pulsante 📍 sulla mappa ti mostra dove sei rispetto ai sentieri (serve il permesso di posizione).",
"The 📍 button on the map shows where you are relative to the trails (location permission needed)."
],
[
"Dal menu → «Condividi codice» mandi il calendario agli amici: basta il codice per aprirlo.",
"From the menu → “Share code” you send the calendar to friends: the code is all they need to open it."
],
[
"Hai un'idea per un'uscita? Dal menu → «Proponi evento» la mandi a chi gestisce il calendario.",
"Got an idea for a ride? From the menu → “Propose event” send it to whoever manages the calendar."
],
[
"Dal menu → «Scala difficoltà» scegli i colori dei trail: scala classica o Trailforks.",
"From the menu → “Difficulty scale” choose the trail colours: classic or Trailforks scale."
],
[
"Dal menu → «Autoplay audio» decidi se l'audio dell'evento parte da solo aprendo la foto a tutto schermo.",
"From the menu → “Audio autoplay” decide whether the event audio starts by itself when you open the photo full screen."
],
[
"Dal menu → «Tema» e «Lingua» cambi tra chiaro e scuro, italiano e inglese.",
"From the menu → “Theme” and “Language” switch between light and dark, Italian and English."
],
[
"Dopo il primo accesso gli eventi si aprono subito dalla memoria del dispositivo e si aggiornano da soli: il menu → «Cache» mostra quanto spazio occupa.",
"After the first visit events open straight from the device memory and update by themselves: the menu → “Cache” shows how much space it uses."
],
[
"⟳ Aggiornamento in corso…",
"⟳ Updating…"
],
[
"Punti di interesse (POI)",
"Points of interest (POI)"
],
[
"Un POI è un punto con nome e descrizione: punto di ritrovo (bandierina su fondo blu), vetta, area picnic o altro. L'occhio P li mostra o li nasconde. Toccane uno: si apre il fumetto con descrizione, chi l'ha aggiunto e chi l'ha modificato, e il pulsante «Naviga» per raggiungerlo con Google Maps, Waze o Apple Maps. Per aggiungerne uno serve il login: in modifica tocca «POI» e poi la mappa dove metterlo, scrivi nome e descrizione e scegli il tipo; toccando un POI compaiono anche Modifica ed Elimina. Nella mappa 3D i POI si vedono da soli, appoggiati al terreno.",
"A POI is a point with a name and a description: meeting point (flag on a blue background), summit, picnic area or other. The P eye shows or hides them. Tap one: a bubble opens with the description, who added it and who last edited it, and the «Navigate» button to get there with Google Maps, Waze or Apple Maps. Adding one needs a login: in edit mode tap «POI», then the map where to put it, write a name and a description and choose the type; tapping a POI also shows Edit and Delete. In the 3D map POIs appear automatically, sitting on the terrain."
],
[
"Aggiunto da",
"Added by"
],
[
"modificato da",
"edited by"
],
[
"Raggiungi «{}» con",
"Get to “{}” with"
],
[
"Mostra i punti di interesse",
"Show points of interest"
],
[
"Nascondi i punti di interesse",
"Hide points of interest"
],
[
"Nuovo punto di interesse",
"New point of interest"
],
[
"Modifica punto di interesse",
"Edit point of interest"
],
[
"🚩 Punto di ritrovo",
"🚩 Meeting point"
],
[
"⛰️ Vetta",
"⛰️ Summit"
],
[
"🧺 Area picnic",
"🧺 Picnic area"
],
[
"⭐ Altro",
"⭐ Other"
],
[
"Punto salvato",
"Point saved"
],
[
"Punto eliminato",
"Point deleted"
],
[
"Accedi per aggiungere un punto di interesse",
"Sign in to add a point of interest"
],
[
"A quale zona appartiene?",
"Which zone does it belong to?"
],
[
"APRI CALENDARIO",
"OPEN CALENDAR"
],
[
"Accedi con Google",
"Sign in with Google"
],
[
"Accedi con Google per aggiungere un trail.",
"Sign in with Google to add a trail."
],
[
"Accedi con Google per commentare",
"Sign in with Google to comment"
],
[
"Accedi con Google per commentare.",
"Sign in with Google to comment."
],
[
"Accedi con Google per creare un calendario.",
"Sign in with Google to create a calendar."
],
[
"Accesso non riuscito:",
"Sign-in failed:"
],
[
"Aggiungere \"{}\" a Epici?",
"Add \"{}\" to Epics?"
],
[
"Aggiungi",
"Add"
],
[
"Aggiungi a Epici",
"Add to Epics"
],
[
"Aggiungi al calendario",
"Add to calendar"
],
[
"Aggiungi partecipante",
"Add participant"
],
[
"Aggiungi trail",
"Add trail"
],
[
"Aggiungine uno da un'uscita passata.",
"Add one from a past ride."
],
[
"Aggiunto a Epici",
"Added to Epics"
],
[
"Aggiorna stato (opzionale)",
"Update status (optional)"
],
[
"Aggiornamenti",
"Updates"
],
[
"Aiuto",
"Help"
],
[
"Aiutami con un piccolo contributo, a tua discrezione:",
"Help me out with a small, arbitrary contribution:"
],
[
"Altro link",
"Other link"
],
[
"Altro link (Instagram, Facebook, sito…)",
"Other link (Instagram, Facebook, website…)"
],
[
"Altro",
"Other"
],
[
"Annulla",
"Cancel"
],
[
"App Android:",
"Android app:"
],
[
"App di navigazione",
"Navigation app"
],
[
"Apri",
"Open"
],
[
"Apri il parcheggio con",
"Open the parking with"
],
[
"Apri mappa",
"Open map"
],
[
"Apri su Google Play",
"Open on Google Play"
],
[
"Apri un altro calendario",
"Open another calendar"
],
[
"Aperto",
"Open"
],
[
"Applica",
"Apply"
],
[
"Approva",
"Approve"
],
[
"Arancio Notte",
"Orange Night"
],
[
"Archiviare questa uscita?",
"Archive this ride?"
],
[
"Archivio",
"Archive"
],
[
"Arrivo",
"Finish"
],
[
"Attenzione",
"Caution"
],
[
"Attivo",
"On"
],
[
"Audio",
"Audio"
],
[
"Audio (riprodotto aprendo l'immagine a tutto schermo)",
"Audio (played when opening the image full screen)"
],
[
"Audio tagliato e pronto",
"Audio trimmed and ready"
],
[
"Autoplay audio",
"Autoplay audio"
],
[
"Autore",
"Author"
],
[
"Barra schede",
"Tab bar"
],
[
"Cache",
"Cache"
],
[
"Cache svuotata",
"Cache cleared"
],
[
"Calendari degli eventi per le uscite in bici di gruppo.",
"Event calendars for group bike rides."
],
[
"Calendario non trovato.",
"Calendar not found."
],
[
"Calendario pubblico",
"Public calendar"
],
[
"Calendario {} — codice {}",
"Calendar {} — code {}"
],
[
"Cambia solo etichetta e colore mostrati; il dato salvato resta invariato.",
"Only changes the label and colour shown; the saved data stays unchanged."
],
[
"Carica logo",
"Upload logo"
],
[
"Caricamento…",
"Loading…"
],
[
"Carico…",
"Loading…"
],
[
"Cerca il trail (o scrivi il nome)",
"Search the trail (or type the name)"
],
[
"Cerca nel log (utente, trail, azione…)",
"Search the log (user, trail, action…)"
],
[
"Cerca o scrivi una zona nuova",
"Search or type a new zone"
],
[
"Cerca per nome o zona",
"Search by name or zone"
],
[
"Cerca per nome…",
"Search by name…"
],
[
"Cerca zona o trail…",
"Search zone or trail…"
],
[
"Chi è in lista può modificare le uscite. Aggiungi incollando il codice utente (lo trova alla voce Account).",
"Anyone on the list can edit the rides. Add them by pasting their user code (they can find it under Account)."
],
[
"Chiara",
"Light"
],
[
"Chiedi ogni volta",
"Ask every time"
],
[
"Chiudi",
"Close"
],
[
"Chiuso",
"Closed"
],
[
"Ciclismo (CyclOSM)",
"Cycling (CyclOSM)"
],
[
"Clona in un mio calendario",
"Clone into one of my calendars"
],
[
"Codice utente",
"User code"
],
[
"Codice utente (opzionale)",
"User code (optional)"
],
[
"Collaboratori",
"Collaborators"
],
[
"Come usare la mappa",
"How to use the map"
],
[
"Compaiono sulla mappa quando la zona è attiva (occhio Z). Ogni costruttore ha un logo e un link social.",
"They appear on the map when the zone is active (Z eye). Each builder has a logo and a social link."
],
[
"Compare nell'elenco",
"Appears in the list"
],
[
"Compare nell'elenco. Puoi cambiarlo dopo.",
"Appears in the list. You can change it later."
],
[
"Comunicazioni",
"Notices"
],
[
"Con \"Singola riga\" le schede scorrono in orizzontale; disattivata, sono tutte visibili su due righe.",
"With \"Single row\" the tabs scroll horizontally; when off, they are all visible on two rows."
],
[
"Condividi",
"Share"
],
[
"Condividi codice",
"Share code"
],
[
"Conferma",
"Confirm"
],
[
"Confermi? Non potrai tornare indietro.",
"Are you sure? You can't go back."
],
[
"Continua",
"Continue"
],
[
"Coordinate non trovate nel link: apro il link originale",
"Coordinates not found in the link: opening the original link"
],
[
"Copia",
"Copy"
],
[
"Copia il testo",
"Copy the text"
],
[
"Copiato",
"Copied"
],
[
"Costruttori dei trail della zona",
"Trail builders of the zone"
],
[
"Costruttori salvati",
"Builders saved"
],
[
"Costruttori · {}",
"Builders · {}"
],
[
"Crea",
"Create"
],
[
"Crea e salva",
"Create and save"
],
[
"Descrizione",
"Description"
],
[
"Difficoltà",
"Difficulty"
],
[
"Difficoltà (opzionale)",
"Difficulty (optional)"
],
[
"Dimensione testo",
"Text size"
],
[
"Direzione invertita (tocca per ripristinare)",
"Direction reversed (tap to restore)"
],
[
"Dislivello +",
"Elevation gain"
],
[
"Dislivello -",
"Elevation loss"
],
[
"Distanza",
"Distance"
],
[
"Distanza {} km · durata {}",
"Distance {} km · duration {}"
],
[
"Durata selezionata: {} s (massimo 30 s)",
"Selected length: {} s (max 30 s)"
],
[
"Eliminare definitivamente?",
"Delete permanently?"
],
[
"Eliminazione…",
"Deleting…"
],
[
"Elimina",
"Delete"
],
[
"Elimina account",
"Delete account"
],
[
"Elimina commento",
"Delete comment"
],
[
"Elimina definitivamente",
"Delete permanently"
],
[
"Elimina il tuo GPX",
"Remove your GPX"
],
[
"Elimina zona",
"Delete zone"
],
[
"Eliminare definitivamente questa uscita?",
"Permanently delete this ride?"
],
[
"Eliminare definitivamente questo giro epico?",
"Permanently delete this epic ride?"
],
[
"Eliminare il commento?",
"Delete the comment?"
],
[
"Eliminare la zona «{}» (perimetro e costruttori)?",
"Delete the zone «{}» (perimeter and builders)?"
],
[
"Eliminare la zona «{}» e definitivamente i suoi {} trail (con commenti), il perimetro e i costruttori?",
"Delete the zone «{}» and permanently its {} trails (with comments), the perimeter and the builders?"
],
[
"Eliminare questo trail?",
"Delete this trail?"
],
[
"Eliminazione non riuscita",
"Deletion failed"
],
[
"Eliminazione non riuscita.",
"Deletion failed."
],
[
"Eliminazione non riuscita:",
"Deletion failed:"
],
[
"Errore",
"Error"
],
[
"Errore di caricamento.",
"Loading error."
],
[
"Errore di eliminazione",
"Deletion error"
],
[
"Errore di salvataggio",
"Save error"
],
[
"Errore durante l'eliminazione.",
"Error while deleting."
],
[
"Errore durante l'invio",
"Error while sending"
],
[
"Esempio di testo — {}%",
"Text example — {}%"
],
[
"Esportazione…",
"Exporting…"
],
[
"Esportazione non riuscita.",
"Export failed."
],
[
"Evento clonato",
"Event cloned"
],
[
"Fade-in",
"Fade-in"
],
[
"Fade-out",
"Fade-out"
],
[
"File audio non leggibile",
"Audio file not readable"
],
[
"File troppo grande ({} KB).",
"File too large ({} KB)."
],
[
"File troppo grande ({} KB, max 15 MB)",
"File too large ({} KB, max 15 MB)"
],
[
"File troppo grande ({} KB, max 2 MB)",
"File too large ({} KB, max 2 MB)"
],
[
"Fine",
"End"
],
[
"GPX non valido o senza tracciato",
"Invalid GPX or no track"
],
[
"GPX salvato",
"GPX saved"
],
[
"Gestisci collaboratori",
"Manage collaborators"
],
[
"Giorno",
"Day"
],
[
"Cielo",
"Sky"
],
[
"Prato",
"Meadow"
],
[
"Guida della mappa",
"Map guide"
],
[
"I miei calendari",
"My calendars"
],
[
"Ieri",
"Yesterday"
],
[
"Il browser non supporta la registrazione audio Opus richiesta per comprimere il file",
"The browser does not support the Opus audio recording needed to compress the file"
],
[
"Il commento non può essere vuoto.",
"The comment can't be empty."
],
[
"Il nome è obbligatorio.",
"The name is required."
],
[
"Il titolo è obbligatorio.",
"The title is required."
],
[
"Il tuo account Google verrà scollegato dall'app e i tuoi dati eliminati. Questa azione non si può annullare.",
"Your Google account will be unlinked from the app and your data deleted. This cannot be undone."
],
[
"Il tuo nome",
"Your name"
],
[
"Il tuo nome sarà visibile a chi consulta questo calendario.",
"Your name will be visible to anyone viewing this calendar."
],
[
"Immagine caricata",
"Image uploaded"
],
[
"Immagine di sfondo",
"Background image"
],
[
"Importa GPX",
"Import GPX"
],
[
"Importa GPX ({})",
"Import GPX ({})"
],
[
"Importa {}",
"Import {}"
],
[
"Importati {} tracciati",
"{} tracks imported"
],
[
"Impossibile generare un codice, riprova.",
"Couldn't generate a code, try again."
],
[
"Indietro",
"Back"
],
[
"Info calendario",
"Calendar info"
],
[
"Informativa sulla privacy",
"Privacy policy"
],
[
"Inizio",
"Start"
],
[
"Inverti direzione (inizio ↔ fine)",
"Reverse direction (start ↔ end)"
],
[
"Invia proposta",
"Send proposal"
],
[
"L'etichetta in basso del tuo GPX",
"The label under your GPX"
],
[
"La mia posizione",
"My position"
],
[
"La tua proposta verrà rivista dagli amministratori del calendario prima di essere pubblicata.",
"Your proposal will be reviewed by the calendar administrators before being published."
],
[
"Link copiato negli appunti",
"Link copied to the clipboard"
],
[
"Link non valido.",
"Invalid link."
],
[
"Link percorso (Komoot, Strava…)",
"Route link (Komoot, Strava…)"
],
[
"Link social (https://…)",
"Social link (https://…)"
],
[
"Località",
"Place"
],
[
"Mappa non disponibile.",
"Map not available."
],
[
"Meteo — {}",
"Weather — {}"
],
[
"Modalità admin",
"Admin mode"
],
[
"Modalità admin attiva",
"Admin mode on"
],
[
"Modalità admin disattivata",
"Admin mode off"
],
[
"Modalità modifica (tocca per sola lettura)",
"Edit mode (tap for read-only)"
],
[
"Modifica",
"Edit"
],
[
"Modifica commento",
"Edit comment"
],
[
"Modifica comunicazione",
"Edit notice"
],
[
"Modifica giro epico",
"Edit epic ride"
],
[
"Modifica la mia scheda",
"Edit my card"
],
[
"Modifica non riuscita.",
"Edit failed."
],
[
"Modifica uscita",
"Edit ride"
],
[
"Modificare i trail",
"Editing trails"
],
[
"Modificare le zone",
"Editing zones"
],
[
"Mostra i loghi dei costruttori",
"Show builders' logos"
],
[
"Mostra i nomi dei trail",
"Show trail names"
],
[
"Mostra i tracciati dei trail",
"Show trail tracks"
],
[
"Mostra il tuo GPX",
"Show your GPX"
],
[
"Mostra le zone",
"Show zones"
],
[
"Mostra solo gli ultimi 20",
"Show only the last 20"
],
[
"Mostra sulla mappa",
"Show on the map"
],
[
"Mostra tutti ({})",
"Show all ({})"
],
[
"Mostrare il tuo GPX",
"Showing your GPX"
],
[
"Nascondi i loghi dei costruttori",
"Hide builders' logos"
],
[
"Nascondi i nomi dei trail",
"Hide trail names"
],
[
"Nascondi i tracciati dei trail",
"Hide trail tracks"
],
[
"Nascondi il tuo GPX",
"Hide your GPX"
],
[
"Nascondi le zone",
"Hide zones"
],
[
"Nessun aggiornamento ancora.",
"No updates yet."
],
[
"Nessun calendario con il codice",
"No calendar with the code"
],
[
"Nessun calendario con questo codice.",
"No calendar with this code."
],
[
"Nessun calendario pubblico.",
"No public calendars."
],
[
"Nessun calendario.",
"No calendars."
],
[
"Nessun costruttore.",
"No builders."
],
[
"Nessun evento archiviato.",
"No archived events."
],
[
"Nessun giro epico ancora.",
"No epic rides yet."
],
[
"Nessun partecipante",
"No participants"
],
[
"Nessun risultato",
"No results"
],
[
"Nessun risultato.",
"No results."
],
[
"Nessun trail ancora censito.",
"No trails listed yet."
],
[
"Nessun trail sulla mappa. Usa \"Importa GPX\" per caricare i tracciati.",
"No trails on the map. Use \"Import GPX\" to load tracks."
],
[
"Nessuna",
"None"
],
[
"Nessuna modifica registrata.",
"No changes recorded."
],
[
"Nessuna proposta in attesa.",
"No proposals waiting."
],
[
"Nessuna uscita {}.",
"No {} rides."
],
[
"Nessuna zona: scrivi il nome per crearne una",
"No zones: type the name to create one"
],
[
"Nome",
"Name"
],
[
"Nome (es. Mufloni Valcuvia ODV)",
"Name (e.g. Mufloni Valcuvia ODV)"
],
[
"Nome del tracciato",
"Track name"
],
[
"Nome del trail",
"Trail name"
],
[
"Nome della nuova zona",
"Name of the new zone"
],
[
"Nome gruppo",
"Group name"
],
[
"Nome modificato",
"Name changed"
],
[
"Nome trail",
"Trail name"
],
[
"Non hai altri calendari dove sei editor.",
"You have no other calendars where you're an editor."
],
[
"Non hai effettuato l'accesso",
"You are not signed in"
],
[
"Non hai eseguito l'accesso.",
"You are not signed in."
],
[
"Non partecipo più",
"I'm no longer joining"
],
[
"Note",
"Notes"
],
[
"Notte Viola",
"Violet Night"
],
[
"Nuova comunicazione (supporta **grassetto**)",
"New notice (supports **bold**)"
],
[
"Nuova uscita",
"New ride"
],
[
"Nuovo calendario",
"New calendar"
],
[
"Nuovo giro epico",
"New epic ride"
],
[
"Occhi sulla mappa",
"Eyes on the map"
],
[
"Ogni modifica ai trail viene registrata con nome ed email dell'utente.",
"Every change to the trails is recorded with the user's name and email."
],
[
"Operazione non riuscita.",
"Operation failed."
],
[
"Oppure crea una zona nuova",
"Or create a new zone"
],
[
"Parcheggio",
"Parking"
],
[
"Parcheggio/ritrovo",
"Parking/meeting point"
],
[
"Partecipa",
"Join"
],
[
"Partenza",
"Start"
],
[
"Per sicurezza devi aver eseguito l'accesso di recente: accedi di nuovo e riprova subito.",
"For security you must have signed in recently: sign in again and retry right away."
],
[
"Percorsi MTB",
"MTB routes"
],
[
"Percorso",
"Route"
],
[
"Percorso {}",
"Route {}"
],
[
"Perimetro eliminato",
"Perimeter deleted"
],
[
"Permesso di posizione negato.",
"Location permission denied."
],
[
"Pianifica",
"Plan"
],
[
"Pianifica uscita",
"Plan ride"
],
[
"Posizione non disponibile su questo dispositivo.",
"Position not available on this device."
],
[
"Posizione non disponibile.",
"Position not available."
],
[
"Previsione non disponibile (data troppo lontana nel tempo).",
"Forecast not available (date too far ahead)."
],
[
"Previsione non disponibile per questa località.",
"Forecast not available for this place."
],
[
"Proline",
"Proline"
],
[
"Proponente",
"Proposer"
],
[
"Proponi evento",
"Propose an event"
],
[
"Proponi un'uscita",
"Propose a ride"
],
[
"Proposta approvata",
"Proposal approved"
],
[
"Proposta da {}",
"Proposed by {}"
],
[
"Proposta inviata, grazie!",
"Proposal sent, thank you!"
],
[
"Proposte",
"Proposals"
],
[
"Pubblica",
"Publish"
],
[
"Pubblico",
"Public"
],
[
"Recente",
"Recent"
],
[
"Registra il percorso (GPX)",
"Record the route (GPX)"
],
[
"Registrazione avviata: tieni lo schermo acceso.",
"Recording started: keep the screen on."
],
[
"Registrazione conclusa",
"Recording finished"
],
[
"Registrazione troppo corta: scartata.",
"Recording too short: discarded."
],
[
"Ricorda la scelta (modificabile dal menu)",
"Remember the choice (changeable from the menu)"
],
[
"Rifiuta",
"Reject"
],
[
"Rifiutare questa proposta?",
"Reject this proposal?"
],
[
"Rimuovere \"{}\" dalla mappa? Il trail resta nell'elenco.",
"Remove \"{}\" from the map? The trail stays in the list."
],
[
"Rimuovi",
"Remove"
],
[
"Rinomina area",
"Rename area"
],
[
"Rinomina non riuscita",
"Rename failed"
],
[
"Ripesca",
"Reuse"
],
[
"Riproduce automaticamente l'audio dell'evento aprendo la foto a tutto schermo.",
"Automatically plays the event audio when opening the photo full screen."
],
[
"Ritrovo",
"Meeting point"
],
[
"Ritrovo (link Google Maps o indirizzo)",
"Meeting point (Google Maps link or address)"
],
[
"Rivedi",
"Review"
],
[
"Salta questo file",
"Skip this file"
],
[
"Salva",
"Save"
],
[
"Salva file GPX…",
"Save GPX file…"
],
[
"Salva tracciato",
"Save track"
],
[
"Salvataggio non riuscito",
"Save failed"
],
[
"Salvataggio non riuscito:",
"Save failed:"
],
[
"Salvato",
"Saved"
],
[
"Scala difficoltà",
"Difficulty scale"
],
[
"Scarica",
"Download"
],
[
"Scarica anche il GPX",
"Also download the GPX"
],
[
"Scarica traccia GPX",
"Download GPX track"
],
[
"Scarta",
"Discard"
],
[
"Scegli il trail",
"Choose the trail"
],
[
"Scegli un logo.",
"Choose a logo."
],
[
"Schermo intero",
"Full screen"
],
[
"Scrivi il nome della zona.",
"Type the zone name."
],
[
"Scrivi un commento…",
"Write a comment…"
],
[
"Sfoglia tutti i calendari",
"Browse all calendars"
],
[
"Singola riga schede",
"Single-row tabs"
],
[
"Sola lettura (tocca per modificare)",
"Read-only (tap to edit)"
],
[
"Spazio usato dal sito su questo dispositivo:",
"Space used by the site on this device:"
],
[
"Svuota cache",
"Clear cache"
],
[
"Sviluppato da Luca",
"Developed by Luca"
],
[
"Taglia audio",
"Trim audio"
],
[
"Tema",
"Theme"
],
[
"Testo",
"Text"
],
[
"Testo copiato negli appunti",
"Text copied to the clipboard"
],
[
"Titolo",
"Title"
],
[
"Titolo *",
"Title *"
],
[
"Titolo e data sono obbligatori.",
"Title and date are required."
],
[
"Topografica",
"Topographic"
],
[
"Torna alla ricerca",
"Back to search"
],
[
"Traccia GPX",
"GPX track"
],
[
"Traccia GPX caricata",
"GPX track uploaded"
],
[
"Traccia GPX non valida",
"Invalid GPX track"
],
[
"Tracciato GPX",
"GPX track"
],
[
"Tracciato GPX sulla mappa",
"GPX track on the map"
],
[
"Tracciato rimosso dalla mappa",
"Track removed from the map"
],
[
"Tracciato salvato",
"Track saved"
],
[
"GPX",
"GPX"
],
[
"Tutte le mie app:",
"All my apps:"
],
[
"Tutti i calendari",
"All calendars"
],
[
"Usata aprendo il parcheggio di un evento.",
"Used when opening an event's parking."
],
[
"Uscita",
"Ride"
],
[
"Uscita in bici",
"Bike ride"
],
[
"Utente",
"User"
],
[
"Vedi meteo",
"See weather"
],
[
"Vedi sulla mappa",
"See on the map"
],
[
"Vedi traccia GPX",
"See GPX track"
],
[
"Vedi tuo GPX su mappa",
"See your GPX on the map"
],
[
"Versione web",
"Web version"
],
[
"Video",
"Video"
],
[
"Video (YouTube, social…)",
"Video (YouTube, social…)"
],
[
"Viene creata una copia in Epici (senza data/ora/partecipanti). L'uscita archiviata resta invariata.",
"A copy is created in Epics (without date/time/participants). The archived ride stays unchanged."
],
[
"Viene creata una copia in Epici (senza data/ora/partecipanti). L'uscita originale resta invariata.",
"A copy is created in Epics (without date/time/participants). The original ride stays unchanged."
],
[
"Zona",
"Zone"
],
[
"Zona creata",
"Zone created"
],
[
"Zona eliminata",
"Zone deleted"
],
[
"Zona «{}» salvata",
"Zone «{}» saved"
],
[
"aggiorna i costruttori della zona \"{}\" → {}",
"updates the builders of the zone \"{}\" → {}"
],
[
"aggiunge il trail {}",
"adds the trail {}"
],
[
"commenta il trail {}",
"comments on the trail {}"
],
[
"disegna la zona \"{}\" → {}",
"draws the zone \"{}\" → {}"
],
[
"elimina il perimetro della zona \"{}\"",
"deletes the perimeter of the zone \"{}\""
],
[
"elimina il trail {}",
"deletes the trail {}"
],
[
"elimina un commento sul trail {}",
"deletes a comment on the trail {}"
],
[
"imposta posizione trail {} → {}",
"sets position of trail {} → {}"
],
[
"imposta tracciato trail {} → {}",
"sets track of trail {} → {}"
],
[
"modifica difficoltà trail {} → {}",
"changes difficulty of trail {} → {}"
],
[
"modifica stato trail {} → {}",
"changes status of trail {} → {}"
],
[
"modifica un commento sul trail {}",
"edits a comment on the trail {}"
],
[
"rinomina area {}",
"renames area {}"
],
[
"rinomina il trail {} ({})",
"renames the trail {} ({})"
],
[
"senza trail",
"without trails"
],
[
"tracciato a mano",
"drawn by hand"
],
[
"agganciato ai sentieri OSM",
"snapped to OSM paths"
],
[
"ha il tracciato (GPX) sulla mappa",
"has its track (GPX) on the map"
],
[
"{} calendari · {} uscite totali",
"{} calendars · {} total rides"
],
[
"{} uscite · {} accessi",
"{} rides · {} opens"
],
[
"Dettagli",
"Details"
],
[
"Impossibile caricare i dettagli",
"Unable to load the details"
],
[
"{} collaboratori · {} uscite · {} accessi",
"{} collaborators · {} rides · {} opens"
],
[
"{} file GPX non leggibili",
"{} GPX files unreadable"
],
[
"{} trail eliminati",
"{} trails deleted"
],
[
"{}. Le tile della mappa le gestisce il browser.",
"{}. The map tiles are managed by the browser."
],
[
"⬇️ Salva con nome",
"⬇️ Save as"
],
[
"⭐ Epici",
"⭐ Epics"
],
[
"＋ Partecipa",
"＋ Join"
],
[
"🅿️ Ritrovo: {}",
"🅿️ Meeting point: {}"
],
[
"👤 Proposto da {}",
"👤 Proposed by {}"
],
[
"+ Aggiungi",
"+ Add"
],
[
"+ Crea nuova zona «{}»",
"+ Create new zone «{}»"
],
[
"+ La mia scheda",
"+ My card"
],
[
"+ Nuova zona…",
"+ New zone…"
],
[
"(vuoto con nuova zona = solo zona)",
"(empty with a new zone = zone only)"
],
[
"— nessun trail: tocca per cercare —",
"— no trail: tap to search —"
],
[
"non fare niente",
"do nothing"
],
[
"S0 · Facile",
"S0 · Easy"
],
[
"S1 · Poco impegnativa",
"S1 · Not demanding"
],
[
"S2 · Impegnativa",
"S2 · Demanding"
],
[
"S3 · Difficile",
"S3 · Difficult"
],
[
"S4 · Molto difficile",
"S4 · Very difficult"
],
[
"S5 · Estrema",
"S5 · Extreme"
],
[
"Altro: link",
"Other: link"
],
[
"Oggi",
"Today"
],
[
"Domani",
"Tomorrow"
],
[
"in programma",
"scheduled"
],
[
"Evidenzia",
"Highlight"
],
[
"calendari",
"calendars"
],
[
"prossime",
"upcoming"
],
[
"eventi",
"events"
],
[
"passati",
"past"
],
[
"i miei giri",
"my rides"
],
[
"impostazioni",
"settings"
],
[
"passate",
"past"
],
[
"mese",
"month"
],
[
"avvisi",
"notices"
],
[
"mappa",
"map"
],
[
"epici",
"epics"
],
[
"contatti",
"contacts"
],
[
"officina",
"workshop"
],
[
"emergenza",
"emergency"
],
[
"già svolte",
"past"
],
[
"prossime uscite",
"upcoming rides"
],
[
"account",
"account"
],
[
"info",
"info"
],
[
"log",
"log"
],
[
"su ~{} MB disponibili",
"~{} MB available"
],
[
"era «{}»",
"was «{}»"
],
[
"es. Spaccasassi MTB",
"e.g. Spaccasassi MTB"
],
[
"ES. K7M2P9",
"E.G. K7M2P9"
],
[
"Tel. {}",
"Tel. {}"
],
[
"Nessun altro calendario.",
"No other calendars."
],
[
"Nessun contatto ancora.",
"No contacts yet."
],
[
"Crea la tua scheda con il pulsante in basso: la vedranno solo i collaboratori di questo calendario.",
"Create your card with the button below: only the collaborators of this calendar will see it."
],
[
"Aggiungi foto",
"Add photo"
],
[
"Cambia foto",
"Change photo"
],
[
"Rimuovi foto",
"Remove photo"
],
[
"Foto profilo",
"Profile photo"
],
[
"Copia da un altro mio calendario",
"Copy from another of my calendars"
],
[
"Copia da…",
"Copy from…"
],
[
"Eliminare la tua scheda da questo calendario?",
"Delete your card from this calendar?"
],
[
"ID atleta o link",
"athlete ID or link"
],
[
"ID utente o link",
"user ID or link"
],
[
"La mia scheda",
"My card"
],
[
"NOME *",
"NAME *"
],
[
"COGNOME",
"SURNAME"
],
[
"SOPRANNOME",
"NICKNAME"
],
[
"TELEFONO",
"PHONE"
],
[
"EMAIL",
"EMAIL"
],
[
"ALTRO: NOME (es. Blog)",
"OTHER: NAME (e.g. Blog)"
],
[
"Nessuna scheda in quel calendario.",
"No card in that calendar."
],
[
"Non riesco a leggere quel calendario.",
"Can't read that calendar."
],
[
"Non riesco a leggere questa immagine.",
"Can't read this image."
],
[
"Servono il nome e almeno un contatto o social.",
"The name and at least one contact or social are required."
],
[
"Trascina e ingrandisci: la parte dentro il cerchio sarà la tua foto.",
"Drag and zoom: the part inside the circle will be your photo."
],
[
"Usa questa foto",
"Use this photo"
],
[
"Visibile solo ai collaboratori di questo calendario. Obbligatori: nome e almeno un contatto o social.",
"Visible only to the collaborators of this calendar. Required: name and at least one contact or social."
],
[
"nome profilo o link",
"profile name or link"
],
[
"numero con prefisso, es. 393331234567",
"number with country code, e.g. 393331234567"
],
[
"@canale o link",
"@channel or link"
],
[
"@utente",
"@user"
],
[
"Aggiunge le icone ai lavori in base alle parole nella descrizione (catena, corona, freni, ammortizzatore…).",
"Adds icons to jobs based on the words in the description (chain, chainring, brakes, shock…)."
],
[
"Colori icone — tocca un'icona, poi scegli il colore",
"Icon colours — tap an icon, then choose the colour"
],
[
"DATA",
"DATE"
],
[
"Data e lavoro sono obbligatori.",
"Date and job are required."
],
[
"Eliminare questo lavoro?",
"Delete this job?"
],
[
"Eliminare {} e tutto il suo log?",
"Delete {} and its whole log?"
],
[
"Icone officina",
"Workshop icons"
],
[
"Icone officina automatiche",
"Automatic workshop icons"
],
[
"Impostazioni officina",
"Workshop settings"
],
[
"Modifica lavoro",
"Edit job"
],
[
"Nessuna bici. Premi + Lavoro per aggiungere la prima.",
"No bike. Press + Job to add the first one."
],
[
"Testo formattato",
"Formatted text"
],
[
"Manutenzione bici {} ▾",
"Bike maintenance {} ▾"
],
[
"Nuova bici",
"New bike"
],
[
"Nuovo lavoro",
"New job"
],
[
"Rinomina bici",
"Rename bike"
],
[
"PDF (stampa)",
"PDF (print)"
],
[
"Esporta",
"Export"
],
[
"Icone",
"Icons"
],
[
"COSTO",
"COST"
],
[
"COSTO €",
"COST €"
],
[
"LAVORO",
"JOB"
],
[
"LUOGO",
"PLACE"
],
[
"TOTALE",
"TOTAL"
],
[
"Bici",
"Bike"
],
[
"Catena",
"Chain"
],
[
"Corona / pignoni",
"Chainring / cogs"
],
[
"Ammortizzatore / forcella",
"Shock / fork"
],
[
"Freni",
"Brakes"
],
[
"Ruote / copertoni",
"Wheels / tyres"
],
[
"Olio / spurgo",
"Oil / bleed"
],
[
"Cavi / guaine",
"Cables / housing"
],
[
"Cambio / deragliatore",
"Gears / derailleur"
],
[
"Sella",
"Saddle"
],
[
"Manubrio / sterzo",
"Handlebar / steering"
],
[
"Pedali / bici",
"Pedals / bike"
],
[
"Elettrico / luci",
"Electric / lights"
],
[
"Pulizia",
"Cleaning"
],
[
"Viti / minuteria",
"Bolts / hardware"
],
[
"Tagliando / lavoro",
"Service / job"
],
[
"Apri Giro →",
"Open Giro →"
],
[
"Scheda non disponibile o non più condivisa.",
"Card not available or no longer shared."
],
[
"Calendario di uscite in bicicletta di gruppo",
"Group bike ride calendar"
],
[
"Consenti i popup per esportare il PDF",
"Allow popups to export the PDF"
],
[
"Cerca",
"Search"
],
[
"Sfoglia",
"Browse"
],
[
"Nuovo",
"New"
],
[
"+ Calendario",
"+ Calendar"
],
[
"Uscita annullata",
"Ride cancelled"
],
[
"Mostra lo stato dei trail di una zona",
"Show trail status for a zone"
],
[
"Scegli la zona",
"Choose zone"
],
[
"Nessun trail in questa zona.",
"No trails in this zone."
],
[
"Admin e collaboratori",
"Admin and collaborators"
],
[
"Lingua / Language",
"Language"
],
["Lingua","Language"],
["Collaboratori ({}):","Collaborators ({}):"],
["Lista nera", "Blacklist"],
["Altre app SimplyLucaApps","More SimplyLucaApps apps"],
["Versione iOS e web","iOS and web version"],
["Versione Android", "Android version"],
["Copia link", "Copy link"],
["Condividi testo", "Share text"],
["🔗 Condividi link", "🔗 Share link"],
["Testo copiato negli appunti", "Text copied to the clipboard"],
["🔗 Copia link", "🔗 Copy link"],
["Link copiato negli appunti", "Link copied to the clipboard"],
["Condividi", "Share"],
["Annuncio non disponibile o non più presente.", "Listing not available or no longer present."],
["Prezzo", "Price"],
["Foto principale", "Primary photo"],
["Telefono", "Phone"],
["Email", "Email"],
["Verrà creato un link: chiunque lo riceva potrà vedere SOLO la tua scheda (nome, contatti, social e foto), senza accedere al calendario. Puoi disattivarlo in ogni momento da \"Modifica la mia scheda\".", "A link will be created: anyone who receives it will see ONLY your card (name, contacts, socials and photo), without access to the calendar. You can turn it off at any time from \"Edit my card\"."],
["Scheda condivisibile con link web", "Card shareable with a web link"],
["Condividi la mia scheda", "Share my card"],
["Link copiato negli appunti.", "Link copied to clipboard."],
["Copia il link:", "Copy the link:"],
["Altro contatto (Telegram, Instagram…)", "Other contact (Telegram, Instagram…)"],
["Titolo e almeno un contatto sono obbligatori.", "Title and at least one contact are required."],
["Il tuo nome *","Your name *"],
["Carico le foto…", "Loading photos…"],
["Contatto:", "Contact:"],
["Ripristina", "Reset"],
["Applica", "Apply"],
["Modifica foto", "Edit photo"],
["MERCATINO", "MARKET"],
["Mercatino", "Market"],
["+ Annuncio", "+ Listing"],
["Tutti", "All"],
["Bici", "Bikes"],
["Accessori", "Parts & accessories"],
["Abbigliamento", "Clothing"],
["Altro", "Other"],
["Nessun annuncio. Pubblica il primo con il tasto in basso.", "No listings yet. Post the first one with the button below."],
["Tutti i calendari", "All calendars"],
["Questo calendario", "This calendar"],
["VENDUTO", "SOLD"],
["Visibile in tutti i calendari", "Visible in all calendars"],
["Visibile solo in questo calendario", "Visible only in this calendar"],
["Interruttore: acceso = tutti i calendari", "Switch: on = all calendars"],
["Contatto", "Contact"],
["Chiama", "Call"],
["Modifica annuncio", "Edit listing"],
["Nuovo annuncio", "New listing"],
["Titolo *", "Title *"],
["Categoria", "Category"],
["Prezzo (es. 350 €)", "Price (e.g. €350)"],
["Descrizione", "Description"],
["Contatto * (telefono, WhatsApp, email)", "Contact * (phone, WhatsApp, email)"],
["Aggiungi foto", "Add photo"],
["Immagine non leggibile.", "Image not readable."],
["Titolo e contatto sono obbligatori.", "Title and contact are required."],
["Segna come venduto", "Mark as sold"],
["Rimetti in vendita", "Put back on sale"],
["Eliminare l'annuncio?", "Delete the listing?"],
["Accedi con Google per pubblicare un annuncio.", "Sign in with Google to post a listing."],
["(questo calendario)","(this calendar)"],
["Modifica negata","Edit denied"],
["Accedi con Google per proporre un'uscita.", "Sign in with Google to propose a ride."],
["Escludi modifica", "Edit blocked"],
["Accesso negato", "Access denied"],
["Per account. «Escludi modifica»: non può più modificare né inviare proposte. «Accesso negato»: non può più aprire il calendario. Non vale per chi usa il calendario senza accedere.", "Per account. «Edit blocked»: can no longer edit or send proposals. «Access denied»: can no longer open the calendar. It does not apply to anyone using the calendar without signing in."],
["Nessun account in lista nera.", "No accounts on the blacklist."],
["Email o codice utente", "Email or user code"],
["Un amministratore ha bloccato il tuo account su questo calendario.", "An administrator has blocked your account on this calendar."],
["Il tuo account non può inviare proposte o modificare questo calendario.", "Your account cannot send proposals or edit this calendar."],
["Nessun utente ha fatto accesso con questa email. Chiedigli di aprire l'app e accedere con Google almeno una volta.", "No user has signed in with this email. Ask them to open the app and sign in with Google at least once."],
["Inserisci un'email valida o il codice utente completo.", "Enter a valid email or the full user code."],
[
"Aggiungi uscita",
"Add ride"
],
[
"Aggiungi calendario esistente",
"Add an existing calendar"
],
[
"Crea nuovo calendario",
"Create new calendar"
],
[
"Crea un nuovo calendario",
"Create a new calendar"
],
[
"Nessuna comunicazione",
"No notices"
],
[
"Tabs visibili",
"Visible tabs"
],
[
"Z = zone, L = loghi dei costruttori, T = tracciati dei trail, N = nomi dei trail, P = punti di interesse, G = il tuo GPX, F = le foto del percorso. Occhio aperto = visibile, occhio barrato = nascosto. ⛶ apre e chiude lo schermo intero: per disegnare sulla mappa usa lo schermo intero.",
"Z = zones, L = builders' logos, T = trail tracks, N = trail names, P = points of interest, G = your GPX, F = the route photos. Open eye = visible, crossed-out eye = hidden. ⛶ opens and closes full screen: to draw on the map use full screen."
],
[
"Serve il login. Tocca la matita: da «sola lettura» passa a «modifica» (si rispegne a ogni avvio). In modifica puoi: «Importa GPX» per caricare i tracciati dai file; «Traccia» per disegnare il percorso (viene agganciato ai sentieri OpenStreetMap) e salvarlo su un trail esistente o nuovo; «Sentiero» per selezionare un sentiero fino all'incrocio («Estendi» per proseguire). Per correggere un tracciato già sulla mappa tienilo premuto (o clic destro) e scegli Modifica o Cancella: trascina i punti, tocca ◦ per aggiungerne uno, tieni premuto un punto per toglierlo, poi Salva.",
"You need to be signed in. Tap the pencil: it switches from «read-only» to «edit» (it turns off again at every start). In edit mode you can: «Import GPX» to load tracks from files; «Draw» to draw the route (it is snapped to OpenStreetMap paths) and save it on an existing or new trail; «Path» to select a path up to the junction («Extend» to continue). To fix a track already on the map, long-press it (or right-click) and choose Edit or Delete: drag the points, tap ◦ to add one, long-press a point to remove it, then Save."
],
[
"Una zona è un perimetro informativo. In modifica, «Zona»: tocca la mappa per mettere i vertici, poi scegli una zona esistente o creane una nuova. Per cambiare il perimetro, tocca il nome della zona (o tienilo premuto) e scegli Modifica, Cancella oppure Costruttori (i loghi dei costruttori dei trail).",
"A zone is an informational perimeter. In edit mode, «Zone»: tap the map to place the vertices, then choose an existing zone or create a new one. To change the perimeter, tap the zone name (or long-press it) and choose Edit, Delete or Builders (the trail builders' logos)."
],
[
"Tocca «GPX» e scegli un file GPX: viene disegnato in magenta sulla mappa, senza essere salvato né condiviso. L'occhio G lo nasconde o lo mostra, la ✕ lo elimina dalla mappa.",
"Tap «GPX» and choose a GPX file: it is drawn in magenta on the map, without being saved or shared. The G eye hides or shows it, the ✕ removes it from the map."
],
[
"Mostra: il nome del file, la lunghezza in km e quanti trail del database hai percorso (quelli coperti per almeno il 60% entro 30 m). Toccala per aprire l'elenco dei trail trovati, con la percentuale di copertura: verde = percorso quasi tutto, «(in parte)» = coperto solo in parte (almeno 25%). Tocca un trail dell'elenco per aprirne il dettaglio. La ✕ dell'elenco lo richiude.",
"It shows: the file name, the length in km and how many trails of the database you rode (those covered at least 60% within 30 m). Tap it to open the list of the trails found, with the coverage percentage: green = almost all ridden, «(partly)» = only partly covered (at least 25%). Tap a trail in the list to open its details. The ✕ of the list closes it."
],
[
"in parte",
"partly"
],
[
"(in parte)",
"(partly)"
],
["Cercare un luogo", "Searching for a place"],
["La lente sotto il selettore dei layer apre la ricerca: scrivi il nome di un paese, una valle o un rifugio e premi Invio. Tocca un risultato: la mappa si sposta lì e compare un segnaposto rosso per qualche secondo.", "The magnifier under the layer selector opens the search: type the name of a town, a valley or a hut and press Enter. Tap a result: the map moves there and a red marker appears for a few seconds."],
["Strumenti sul tuo GPX (⋮)", "Tools for your GPX (⋮)"],
["Il menu ⋮ accanto alla ✕ ha: Statistiche, Ritaglia, Inverti, Semplifica, Salva e Condividi come GPX, «Converti in…» per esportare in KML, GeoJSON, TCX o CSV e, con il login, «Salva come trail…»: sceglie un trail esistente o ne crea uno nuovo con quel tracciato. Anche «Importa GPX» (in modifica) permette di creare un nuovo trail con «+ Trail» per i file senza abbinamento.", "The ⋮ menu next to the ✕ has: Statistics, Crop, Reverse, Simplify, Save and Share as GPX, «Convert to…» to export as KML, GeoJSON, TCX or CSV and, when signed in, «Save as trail…»: it picks an existing trail or creates a new one with that track. «Import GPX» (in edit mode) also lets you create a new trail with «+ Trail» for files without a match."],
["Crea un nuovo trail con questo tracciato", "Create a new trail with this track"],
["Nuovo trail", "New trail"],
["+ Nuovo trail", "+ New trail"],
["Indica la zona.", "Enter the zone."],
["Tracciato troppo corto", "Track too short"],
["annullata", "undone"],
["Ripristina", "Restore"],
["Operazione annullata", "Operation undone"],
["Non riuscito", "Failed"],
["Questa voce non si può annullare", "This entry cannot be undone"],
["Il trail non esiste più", "The trail no longer exists"],
["Il trail esiste già", "The trail already exists"],
["Dopo questa operazione il trail è stato modificato di nuovo. Annullare comunque?", "This trail was changed again after this operation. Undo anyway?"],
["Cerca nel log (utente, trail, azione…) · -parola esclude", "Search the log (user, trail, action…) · -word excludes"],
["Annullare questa operazione?", "Undo this operation?"],
["Ripristinare questa operazione?", "Restore this operation?"],
["Mostra o nascondi le foto", "Show or hide photos"],
["Z = zone, L = loghi dei costruttori, T = tracciati dei trail, N = nomi dei trail, G = il tuo GPX, F = le foto del percorso. Occhio aperto = visibile, occhio barrato = nascosto. ⛶ apre e chiude lo schermo intero: per disegnare sulla mappa usa lo schermo intero.", "Z = zones, L = builders' logos, T = trail tracks, N = trail names, G = your GPX, F = the route photos. Open eye = visible, crossed-out eye = hidden. ⛶ opens and closes full screen: to draw on the map use full screen."],
["Riprodurre il percorso e le foto", "Playing the route and photos"],
["Se il GPX ha i tempi compare ▶ accanto a «GPX» (o «Riproduci» nel menu ⋮): un marker percorre il tracciato, grigio sotto e colorato dove è già passato. Il cursore in alto salta nel tempo, il secondo regola la velocità da 1× a 60× (20× di default). ◎ fa seguire il marker dalla mappa (di default la mappa resta libera). «Altimetria» mostra o nasconde il profilo delle quote: toccalo o trascinalo per saltare in un punto. Con 📷 o «Foto del percorso…» scegli le foto: quelle scattate durante il percorso compaiono in miniatura (più grandi con lo zoom), si ingrandiscono toccandole e l'occhio F le nasconde. Quelle senza GPS sono stimate dall'orario e hanno il bordo tratteggiato.", "If the GPX has times a ▶ appears next to «GPX» (or «Play» in the ⋮ menu): a marker runs along the track, grey underneath and coloured where it has already passed. The top slider jumps in time, the second sets the speed from 1× to 60× (20× by default). ◎ makes the map follow the marker (by default the map stays free). «Elevation» shows or hides the altitude profile: tap or drag it to jump to a point. With 📷 or «Route photos…» you choose the photos: those taken during the route appear as thumbnails (larger with zoom), tap them for full screen and the F eye hides them. Photos without GPS are estimated from the time and have a dashed border."],
["Spessore traccia GPX", "GPX track thickness"],
["Vale per la linea del GPX sulla mappa, la riproduzione e il 3D.", "Applies to the GPX line on the map, the playback and the 3D view."],
["Molto sottile", "Very thin"],
["Sottile", "Thin"],
["Normale", "Normal"],
["Spesso", "Thick"],
["Molto spesso", "Very thick"]
];

  var DICT = Object.create(null), PATS = [], PREFIX = [];
  PAIRS.forEach(function (p) {
    var k = p[0].toLowerCase();
    if (k.indexOf("{}") >= 0) {
      var parts = k.split("{}").map(function (x) { return x.replace(/[.*+?^$()|[\]\\]/g, "\\$&"); });
      PATS.push({ re: new RegExp("^" + parts.join("([\\s\\S]+?)") + "$", "i"), en: p[1], n: k.length });
    } else {
      DICT[k] = p[1];
      if (k.charAt(k.length - 1) === ":") PREFIX.push(k);
    }
  });
  PATS.sort(function (a, b) { return b.n - a.n; });
  PREFIX.sort(function (a, b) { return b.length - a.length; });
  var WD = { LUN: "MON", MAR: "TUE", MER: "WED", GIO: "THU", VEN: "FRI", SAB: "SAT", DOM: "SUN" };
  var WDRE = /\b(LUN|MAR|MER|GIO|VEN|SAB|DOM)\b/g;

  function caseLike(src, en) {
    if (src.length > 1 && src === src.toUpperCase() && src !== src.toLowerCase()) return en.toUpperCase();
    return en;
  }
  function lookup(t) {
    var k = t.toLowerCase();
    if (k in DICT) return caseLike(t, DICT[k]);
    for (var i = 0; i < PATS.length; i++) {
      var m = PATS[i].re.exec(t);
      if (m) { var j = 0; return caseLike(t, PATS[i].en.replace(/\{\}/g, function () { var g = m[++j]; var r = lookup(g); return r == null ? g : r; })); }
    }
    for (var q = 0; q < PREFIX.length; q++) {
      if (k.indexOf(PREFIX[q]) === 0) return caseLike(t, DICT[PREFIX[q]]) + t.slice(PREFIX[q].length);
    }
    var w = t.replace(WDRE, function (x) { return WD[x]; });
    return w !== t ? w : null;
  }
  function trStr(str) {
    if (typeof str !== "string") return str;
    var t = str.trim();
    if (!t) return str;
    var a = str.indexOf(t), r = lookup(t);
    return r == null ? str : str.slice(0, a) + r + str.slice(a + t.length);
  }
  window.tr = trStr;

  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function trAttrs(el) {
    if (el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var nv = trStr(v); if (nv !== v) el.setAttribute(ATTRS[i], nv); }
    }
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit") && el.value) {
      var nv2 = trStr(el.value); if (nv2 !== el.value) el.value = nv2;
    }
  }
  function trText(n) {
    var p = n.parentNode;
    if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA") return;
    var v = n.nodeValue, nv = trStr(v);
    if (nv !== v) n.nodeValue = nv;
  }
  function walk(root) {
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) trAttrs(root);
    var tw = document.createTreeWalker(root, 5 /* ELEMENT | TEXT */, null);
    var n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "childList") m.addedNodes.forEach(walk);
        else if (m.type === "characterData") trText(m.target);
        else if (m.type === "attributes") trAttrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);

  // alert/confirm/prompt
  ["alert", "confirm", "prompt"].forEach(function (f) {
    var o = window[f];
    window[f] = function (msg) { var a = Array.prototype.slice.call(arguments); a[0] = trStr(String(msg)); return o.apply(window, a); };
  });
})();
