# GiroCalendar Web

SPA statica per **GiroCalendar** — la versione web (per chi ha iPhone o non vuole
installare l'app Android). Stesso backend Firebase dell'app: i calendari creati sull'app
si vedono sul web e viceversa. Gemello di [VolleyCalendar Web](../volleycalendar-web),
stesso stack e stesso pattern, adattato al dominio "uscite in bici".

## Stack

- HTML/CSS/JS puro, nessun framework, nessun build step.
- **Firebase JS SDK** (Firestore + Auth) importato via ES modules dal CDN `gstatic.com`.
- **Leaflet + OpenStreetMap** caricati da CDN solo quando si apre una mappa GPX (lazy).
- **Open-Meteo** per il meteo (CORS aperto, nessun proxy necessario, verificato).
- Deploy su **Cloudflare Pages** (`pages_build_output_dir = public`).
- La sicurezza è nelle **Firestore Security Rules** (stesso repo del progetto Android,
  `firestore/firestore.rules`): lettura pubblica sotto `calendars/`, scrittura eventi solo
  se `request.auth.uid` è in `calendars/{c}.editors`.

## Struttura

```
public/
  index.html          shell + <div> delle due view
  style.css           temi + layout, palette arancio/nero allineata all'app Android
  app.js              tutta la logica: router hash, Firestore, Auth, GPX, meteo, dialoghi
  firebase-config.js  config pubblica dell'app web Firebase (NON è un segreto) — PLACEHOLDER
  manifest.json       PWA (add to home screen su iOS)
  icon-192/512.png
wrangler.toml
```

## Rotte (hash router)

- `#` / vuoto → schermata iniziale: **Account · Codice · Nuovo**
- `#/c/XXXXXX` → calendario del codice `XXXXXX` (lettura pubblica)

## Feature coperte (parità con l'app Android)

- Consultazione calendario (Prossime/Passate), dettaglio uscita, Partecipa
- Creazione/modifica calendario e uscite (se editor + modalità admin attiva)
- Proponi evento (pubblico, senza login) → Proposte (owner/editor: rifiuta/rivedi/approva)
- Archivio (archivia/ripesca/elimina)
- Comunicazioni (owner-only, con **grassetto**)
- Traccia GPX: upload (compressa gzip+base64 lato client, stesso schema di
  `GpxProcessor.kt`), popup mappa Leaflet/OSM con partenza/arrivo/freccia direzione/
  statistiche (stesso schema di `GpxMapDialog.kt` + `GpxTrack.kt`)
- Meteo Open-Meteo con finestra ±2h attorno all'orario dell'uscita
- Collaboratori, Info calendario, Elimina account (con trasferimento/eliminazione calendari)
- Temi, dimensione testo, condivisione testo/link, export `.ics`

Non ancora portato dall'app: editor immagine più fine (crop manuale), alcune rifiniture
minori di UI. Le funzioni principali sono tutte presenti.

## Firebase — DA FARE prima del primo deploy

**`firebase-config.js` contiene solo un placeholder.** Serve:

1. Firebase Console → progetto **girocalendar** → ⚙️ Impostazioni progetto → Generali →
   "Le tue app" → **`</>` Aggiungi app web**.
2. Registra l'app (nome libero, es. "GiroCalendar Web"), **non serve Firebase Hosting**.
3. Copia l'oggetto `firebaseConfig` mostrato e incollalo in `public/firebase-config.js`
   al posto dei valori `"TODO"`.
4. **Autorizza il dominio** in Firebase Console → Authentication → Settings →
   Authorized domains: aggiungi `girocalendar.pages.dev` (necessario per
   `signInWithPopup`, altrimenti il login Google fallisce silenziosamente).

## Deploy

```
cd girocalendar-web
npx wrangler pages deploy public --project-name girocalendar
```

Oppure collega il repo Forgejo a Cloudflare Pages per il deploy automatico.

## Compatibilità GPX su iOS

La decompressione/compressione GPX usa `DecompressionStream`/`CompressionStream`
(standard `CompressionStream API`), supportate da Safari 16.4+ (iOS 16.4+, marzo 2023) e
da tutti i browser desktop/Android recenti. Su Safari più vecchi il caricamento/
visualizzazione della traccia GPX fallisce silenziosamente (le altre funzioni restano
utilizzabili) — non risulta un problema pratico dato che iOS 16.4+ copre la stragrande
maggioranza dei dispositivi in uso.

## Da fare

- [ ] Completare `firebase-config.js` con la config reale (vedi sopra)
- [ ] Autorizzare il dominio Pages in Firebase Auth
- [ ] Primo deploy + test login e GPX su iPhone
- [ ] `sw.js` per funzionamento offline (opzionale)

## Configurazione e deploy

1. Copia `public/firebase-config.example.js` in `public/firebase-config.js` e inserisci i valori del tuo
   progetto Firebase (ignorato da git). Cambia anche `API_KEY` e `ADMIN_EMAIL` in `functions/api/stats.js`.
2. Le Functions (`functions/api/`) richiedono il secret Cloudflare `FCM_SA` (JSON di un account di servizio
   Google): `npx wrangler pages secret put FCM_SA --project-name <progetto>`. Non va mai committato.
3. Deploy: `npx wrangler pages deploy public --project-name <progetto>`.
4. `public/.well-known/assetlinks.json`: crea il tuo partendo dall'esempio (package e SHA-256 della tua firma).

Licenza: vedi il repo Android (GPL-3.0).
