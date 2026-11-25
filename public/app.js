import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getDocFromCache, doc, getDoc, collection, collectionGroup, query, where, getDocs,
  onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, runTransaction,
  arrayUnion, arrayRemove, Timestamp, getCountFromServer, increment, writeBatch, orderBy, limit, deleteField,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

import { contactsTabHtml, wireContacts, openMyContact, myContact, stopContacts } from "./contacts.js";
import { marketTabHtml, wireMarket, stopMarket, openNewListing } from "./mercatino.js";
import { workshopTabHtml, wireWorkshop, openNewJob, openWorkshopPrefs, stopWorkshop } from "./workshop.js";

/** Base64 delle immagini salvate dall'app Android: a volte senza padding ("="), che nei data URL dei CSS fa fallire l'immagine. */
const b64 = (x) => { x = String(x || "").replace(/[^A-Za-z0-9+\/=_-]/g, ""); if (x.length % 4 === 1) x = x.slice(0, -1); return x + "=".repeat((4 - x.length % 4) % 4); };
const maskEmail = (e) => { e = String(e || "").trim(); const at = e.indexOf("@"); return at <= 0 ? "" : e.slice(0, at >= 3 ? 2 : 1) + "***" + e.slice(at); };
// Dati privati del calendario (email owner completa + etichette dei collaboratori): solo per utenti loggati.
const privCache = {};
function applyOwnerFull(code) {
  if (!state.user) return;
  const apply = (p) => { if (state.calendar?.code === code) { if (p.email) state.calendar.ownerEmail = p.email; state.calendar.editorLabels = { ...(state.calendar.editorLabels || {}), ...(p.labels || {}) }; } };
  if (privCache[code]) { apply(privCache[code]); return; }
  loadPrivate(code).then((p) => { privCache[code] = p; apply(p); });
}
async function loadPrivate(code) {
  const out = { email: "", labels: {} };
  try { const s = await getDoc(doc(db, "calendars", code, "private", "owner")); if (s.exists()) out.email = s.data().email || ""; } catch {}
  try { const s = await getDoc(doc(db, "calendars", code, "private", "labels")); if (s.exists()) out.labels = s.data().labels || {}; } catch {}
  return out;
}
const safeUrl = (u) => { const s = String(u ?? "").trim(); return /^https?:\/\//i.test(s) ? s : ""; };
const safeImg = (u) => { const s = String(u ?? "").trim(); return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$)/i.test(s) ? s : ""; };
const APP_VERSION = "v2.75";

const fb = initializeApp(firebaseConfig);
// Cache persistente (IndexedDB, condivisa tra schede del browser): al secondo accesso calendario ed eventi
// arrivano subito dai dati locali e poi si aggiornano da soli dal server. Se non disponibile
// (es. navigazione privata) si torna alla cache in memoria.
let db;
try {
  db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch { db = getFirestore(fb); }
const auth = getAuth(fb);

// ─────────────────────────────────────────────────────────────
// Stato & util
// ─────────────────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sigla fissa a 3 lettere (non da Intl/locale del browser): deve restare sempre
// "LUN".."DOM", stesso criterio dell'app Android (vedi EventTime.weekdayLabel).
const WEEKDAY_LABELS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
function weekdayLabel(data) {
  const parts = (data || "").split("/");
  if (parts.length !== 3) return "";
  const [day, month, year] = parts.map(Number);
  if (!day || !month || !year) return "";
  const d = new Date(year, month - 1, day);
  return WEEKDAY_LABELS[d.getDay()];
}

const state = {
  user: null,
  code: null,
  calendar: null,
  events: [],
  archived: [],
  epics: [],
  proposals: [],
  announcements: [],
  unsub: [],
  adminMode: true,  // sempre attivo per chi è editor/owner (il lucchetto è stato tolto)
  tab: "prossime", // calendari | prossime | passate | mese | info | trail
  trails: [], // cache per la tab "trail" del calendario aperto
  trailsExpandedZones: new Set(),
};
// Occhi della mappa (Z, L, T, N, G): si ricordano tra una visita e l'altra.
(function () {
  try {
    const e = JSON.parse(localStorage.getItem("gc_map_eyes") || "{}");
    if (e.z) state.mapZonesOff = true; if (e.b) state.mapBldOff = true; if (e.t) state.mapLinesOff = true; if (e.n) state.mapNames = true; if (e.g) state.myGpxHidden = true; if (e.p) state.mapPoisOff = true;
  } catch {}
})();
function saveMapEyes() {
  try { localStorage.setItem("gc_map_eyes", JSON.stringify({ z: !!state.mapZonesOff, b: !!state.mapBldOff, t: !!state.mapLinesOff, n: !!state.mapNames, g: !!state.myGpxHidden, p: !!state.mapPoisOff })); } catch {}
}


let pendingCode = "";

let trailEditMode = false;
const LS = {
  recents: () => { try { return JSON.parse(localStorage.getItem("gc_recents") || "[]"); } catch { return []; } },
  addRecent(code, name, ownerEmail = "") {
    const list = LS.recents().filter((r) => r.code !== code);
    list.unshift({ code, name, ts: Date.now(), ownerEmail });
    localStorage.setItem("gc_recents", JSON.stringify(list.slice(0, 20)));
  },
  theme: () => localStorage.getItem("gc_theme") || "dark",
  setTheme: (t) => localStorage.setItem("gc_theme", t),
  lastCode: () => localStorage.getItem("gc_last") || "",
  setLastCode: (s) => localStorage.setItem("gc_last", s || ""),
  textScale: () => parseFloat(localStorage.getItem("gc_text_scale") || "1"),
  setTextScale: (v) => localStorage.setItem("gc_text_scale", String(v)),
  myName: () => localStorage.getItem("gc_my_name") || "",
  setMyName: (v) => localStorage.setItem("gc_my_name", v || ""),
  /** Riproduce automaticamente l'audio dell'evento aprendo la foto a tutto schermo, come
   * nell'app Android. Default ON: assente in localStorage = true, esplicitamente disattivato
   * dall'utente = "0". */
  /** Barra schede a riga singola scorrevole (default) o su due righe (tutte le schede visibili). */
  /** Modalità trail: false = sola lettura (occhio), true = modifica (matita). Per chi ha il login. */
  // Solo per la sessione: a ogni apertura del sito si riparte in sola lettura (occhio).
  trailEdit: () => trailEditMode && !(typeof state !== "undefined" && state.myBlock),
  setTrailEdit: (v) => { trailEditMode = !!v; },
  singleTabBar: () => localStorage.getItem("gc_single_tabbar") !== "0",
  setSingleTabBar: (v) => localStorage.setItem("gc_single_tabbar", v ? "1" : "0"),
  /** Scheda su cui si apre un calendario (default Home). Migra la vecchia «Home immediata» + scheda suggerita. */
  startTab: () => localStorage.getItem("gc_start_tab")
    || (localStorage.getItem("gc_home_immediate") === "1" ? (localStorage.getItem("gc_suggested_tab") || "prossime") : "home"),
  setStartTab: (v) => localStorage.setItem("gc_start_tab", v),
  /** Schede nascoste dalla barra (si riattivano dalla Home in modifica). */
  hiddenTabs: () => { try { return JSON.parse(localStorage.getItem("gc_hidden_tabs") || "[]"); } catch { return []; } },
  setHiddenTabs: (v) => localStorage.setItem("gc_hidden_tabs", JSON.stringify(v)),
  audioAutoplay: () => localStorage.getItem("gc_audio_autoplay") !== "0",
  setAudioAutoplay: (v) => localStorage.setItem("gc_audio_autoplay", v ? "1" : "0"),
};

// ─────────────────────────────────────────────────────────────
// Temi
// ─────────────────────────────────────────────────────────────
const THEMES = {
  dark:  { name: "Arancio Notte", icon: "🌙", dark: true },
  notte: { name: "Notte Viola", icon: "🌌", dark: true },
  light: { name: "Giorno", icon: "☀️", dark: false },
  cielo: { name: "Cielo", icon: "🌤️", dark: false },
  prato: { name: "Prato", icon: "🌿", dark: false },
  oceano: { name: "Oceano", icon: "🌊", dark: true },
  bordeaux: { name: "Bordeaux", icon: "🍷", dark: true },
  miniera: { name: "Miniera", icon: "⛏️", dark: true },
  carbon: { name: "Carbonio", icon: "⛰️", dark: true },
  menta: { name: "Menta", icon: "🍃", dark: false },
  corallo: { name: "Corallo", icon: "🪸", dark: false },
  sterrato: { name: "Sterrato", icon: "🏜️", dark: false },
};
// Indietro dalle schede → Home (si esce solo dalla Home)
window.addEventListener("popstate", () => {
  if (state.code && state.tab !== "home" && location.hash.startsWith("#/c/")) { state.tab = "home"; renderCalendar(); }
});
const OPPOSITE = { dark: "light", light: "dark", notte: "light", cielo: "oceano", oceano: "cielo", prato: "dark", bordeaux: "corallo", corallo: "bordeaux", miniera: "menta", menta: "miniera", carbon: "sterrato", sterrato: "carbon" };
function applyTheme(id) {
  const t = THEMES[id] ? id : "dark";
  document.documentElement.dataset.theme = t;
  LS.setTheme(t);
  // Entrambe le view (#view-search e #view-calendar) restano sempre nel DOM (solo una è
  // "active"), e ciascuna ha un proprio bottone #themeToggle nel proprio markup: un id
  // duplicato nel documento. querySelector prenderebbe sempre il primo (quello nella view
  // nascosta), lasciando l'icona della view visibile ferma sul vecchio simbolo — per questo
  // si aggiornano ENTRAMBI i bottoni invece di uno solo.
  $$("#themeToggle").forEach((btn) => { btn.textContent = THEMES[t].dark ? "☀️" : "🌙"; });
}
function applyTextScale(v) {
  const clamped = Math.min(1.5, Math.max(0.5, Number(v) || 1));
  document.documentElement.style.setProperty("--text-scale", clamped);
  LS.setTextScale(clamped);
}

// ─────────────────────────────────────────────────────────────
// Difficoltà: due scale a scelta (preferenza locale), stesso id "s0".."s5" salvato in
// entrambi i casi — allineato a Difficulty.kt dell'app Android.
// ─────────────────────────────────────────────────────────────
const DIFFICULTY = {
  s0: "S0 · Facile", s1: "S1 · Poco impegnativa", s2: "S2 · Impegnativa",
  s3: "S3 · Difficile", s4: "S4 · Molto difficile", s5: "S5 · Estrema",
};
// Etichette corte per i badge, per scala: "sts" (default) o "trailforks".
const DIFF_LABEL = {
  sts: { s0: "S0", s1: "S1", s2: "S2", s3: "S3", s4: "S4", s5: "S5" },
  trailforks: { s0: "White", s1: "Green", s2: "Blue", s3: "Red", s4: "Black", s5: "Proline" },
};
function diffScale() { return localStorage.getItem("gc_difficulty_scale") === "trailforks" ? "trailforks" : "sts"; }
function setDiffScale(v) { localStorage.setItem("gc_difficulty_scale", v === "trailforks" ? "trailforks" : "sts"); }
function diffBadge(id) {
  if (!id || !DIFFICULTY[id]) return "";
  const scale = diffScale();
  const label = (DIFF_LABEL[scale] || DIFF_LABEL.sts)[id];
  const cls = scale === "trailforks" ? `diff-tf-${id}` : `diff-s${id.slice(1)}`;
  return `<span class="diff-badge ${cls}">${esc(label)}</span>`;
}

// ─────────────────────────────────────────────────────────────
// Link piattaforma (allineato a LinkIcon.kt dell'app Android)
// ─────────────────────────────────────────────────────────────
function platformName(url) {
  const h = (url || "").trim().toLowerCase();
  if (!h) return null;
  if (h.includes("komoot")) return "Komoot";
  if (h.includes("strava")) return "Strava";
  if (h.includes("garmin")) return "Garmin";
  if (h.includes("wikiloc")) return "Wikiloc";
  if (h.includes("alltrails")) return "AllTrails";
  if (h.includes("outdooractive")) return "Outdooractive";
  if (h.includes("instagram.com")) return "Instagram";
  if (h.includes("facebook.com") || h.includes("fb.com")) return "Facebook";
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "YouTube";
  if (h.includes("tiktok.com")) return "TikTok";
  if (h.includes("twitter.com") || h.includes("x.com")) return "X";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Firestore helpers
// ─────────────────────────────────────────────────────────────
function clearSubs() { state.unsub.forEach((u) => u()); state.unsub = []; }

async function lookupCode(code) {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const snap = await getDoc(doc(db, "calendars", c));
  return snap.exists() ? { code: c, ...snap.data() } : null;
}

async function myCalendars() {
  if (!state.user) return [];
  const uid = state.user.uid;
  const [owned, editing] = await Promise.all([
    getDocs(query(collection(db, "calendars"), where("ownerUid", "==", uid))),
    getDocs(query(collection(db, "calendars"), where("editors", "array-contains", uid))),
  ]);
  const map = new Map();
  [...owned.docs, ...editing.docs].forEach((d) => map.set(d.id, { code: d.id, ...d.data() }));
  return [...map.values()].sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

async function createCalendar(name, description, listed = true, logoColor = "", logoData = "") {
  const uid = state.user?.uid;
  if (!uid) throw new Error("Accedi con Google per creare un calendario.");
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    const ref = doc(db, "calendars", code);
    try {
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (cur.exists()) throw new Error("collision");
        tx.set(ref, {
          code, name: name.trim(), description: description.trim(),
          ownerUid: uid, ownerEmail: maskEmail(state.user?.email || ""), listed: !!listed,
          editors: [uid], createdAtMillis: Date.now(),
          logoColor: logoColor || "", logoData: logoData || "",
        });
      });
      // Indice per le Security Rules di trails/ ("admin" = owner di almeno un calendario).
      setDoc(doc(db, "admins", uid), { since: Date.now(), code }, { merge: true }).catch(() => {});
      if (state.user?.email) setDoc(doc(db, "calendars", code, "private", "owner"), { email: state.user.email }).catch(() => {});
      return code;
    } catch (e) { if (e.message !== "collision") throw e; }
  }
  throw new Error("Impossibile generare un codice, riprova.");
}

async function ownedCalendarsForDeletion() {
  const uid = state.user?.uid;
  if (!uid) return [];
  const qs = await getDocs(query(collection(db, "calendars"), where("ownerUid", "==", uid)));
  return qs.docs.map((d) => ({ code: d.id, ...d.data() }));
}

async function deleteAccountWithData(nominations = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Non hai eseguito l'accesso.");
  const uid = user.uid;

  const owned = await getDocs(query(collection(db, "calendars"), where("ownerUid", "==", uid)));
  for (const d of owned.docs) {
    const code = d.id;
    const editors = d.data().editors || [];
    const heir = editors.find((e) => e !== uid) || (nominations[code] || "").trim() || null;
    if (heir) {
      const ref = doc(db, "calendars", code);
      if (!editors.includes(heir)) await updateDoc(ref, { editors: arrayUnion(heir) });
      await updateDoc(ref, { ownerUid: heir });
    } else {
      await deleteCalendarDeep(code);
    }
  }

  const editing = await getDocs(query(collection(db, "calendars"), where("editors", "array-contains", uid)));
  for (const d of editing.docs) {
    if (d.data().ownerUid === uid) continue;
    await updateDoc(doc(db, "calendars", d.id), { editors: arrayRemove(uid) });
  }

  await deleteUser(user);
}

async function deleteCalendarDeep(code) {
  const ref = doc(db, "calendars", code);
  for (const sub of ["events", "archived", "proposals", "announcements"]) {
    const qs = await getDocs(collection(ref, sub));
    for (const d of qs.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(ref);
}

/** Calendari pubblici ordinati per popolarità (openCount decrescente), come CalendarRepository.allCalendars(). */
async function allCalendars() {
  const qs = await getDocs(collection(db, "calendars"));
  return qs.docs.map((d) => ({ code: d.id, ...d.data() }))
    .filter((c) => c.listed !== false)
    .sort((a, b) => (b.openCount || 0) - (a.openCount || 0));
}

/** Statistiche leggere per un calendario (tab/lista): collaboratori, uscite, accessi. */
async function calendarStats(code) {
  try {
    const calSnap = await getDoc(doc(db, "calendars", code));
    const editorCount = (calSnap.data()?.editors || []).length;
    const openCount = calSnap.data()?.openCount || 0;
    const eventCount = (await getCountFromServer(collection(db, "calendars", code, "events"))).data().count;
    return { editorCount, eventCount, openCount };
  } catch (e) {
    console.warn("calendarStats failed", e);
    return { editorCount: 0, eventCount: 0, openCount: 0 };
  }
}

/** Incrementa il contatore aperture (statistica approssimativa), come CalendarRepository.incrementOpenCount.
 * Rispetta la regola Firestore che permette SOLO un incremento di esattamente +1 su questo campo. */
function incrementOpenCount(code) {
  updateDoc(doc(db, "calendars", code), { openCount: increment(1) }).catch(() => {});
}

/** Statistiche aggregate leggere per il footer della home: numero di calendari e di uscite
 * totali. Nessun tracking di visite/utenti (richiederebbe scritture ad ogni apertura e nuove
 * regole di sicurezza): solo un conteggio di ciò che già esiste in Firestore, usando
 * getCountFromServer così non scarica i documenti degli eventi. */
async function loadStats() {
  const calsSnap = await getDocs(collection(db, "calendars"));
  const codes = calsSnap.docs.map((d) => d.id);
  const counts = await Promise.all(
    codes.map((code) => getCountFromServer(collection(db, "calendars", code, "events")).then((s) => s.data().count).catch(() => 0))
  );
  return { calendars: codes.length, events: counts.reduce((a, b) => a + b, 0) };
}

// ─────────────────────────────────────────────────────────────
// Data/ora evento (allineato a EventTime.kt)
// ─────────────────────────────────────────────────────────────
function parseStart(e) {
  const p = (e.data || "").split("/");
  if (p.length !== 3) return null;
  const [d, mo, y] = p.map(Number);
  const [h, mi] = (e.ora || "12:00").split(":").map(Number);
  const dt = new Date(y, mo - 1, d, isNaN(h) ? 12 : h, mi || 0);
  return isNaN(dt) ? null : dt.getTime();
}
// Un evento resta tra le "prossime uscite" per tutto il suo giorno: passa a "già svolte" solo
// dal giorno dopo (mezzanotte), non appena scocca l'orario di partenza (allineato a
// EventTime.isPast in app Android).
function isPast(e, now = Date.now()) {
  const s = parseStart(e);
  if (s == null) return false;
  const end = new Date(s);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < now;
}

// ─────────────────────────────────────────────────────────────
// GPX: parsing (allineato a GpxTrack.kt) + decompressione (allineato a GpxProcessor.kt)
// ─────────────────────────────────────────────────────────────
function decompressGpx(base64) {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // DecompressionStream (gzip) — supportato su Safari 16.4+/iOS 16.4+ e tutti i browser recenti
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")))
      .text();
  } catch (e) {
    console.warn("decompressGpx failed", e);
    return Promise.resolve(null);
  }
}

function parseGpx(xmlText) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    let pts = [...doc.querySelectorAll("trkpt")];
    if (!pts.length) pts = [...doc.querySelectorAll("rtept")];
    if (!pts.length) return null;
    const points = pts.map((p) => {
      const lat = parseFloat(p.getAttribute("lat"));
      const lon = parseFloat(p.getAttribute("lon"));
      const eleEl = p.querySelector("ele");
      const ele = eleEl ? parseFloat(eleEl.textContent) : null;
      return { lat, lon, ele: isNaN(ele) ? null : ele };
    }).filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
    if (!points.length) return null;

    let distanceM = 0, ascent = 0, descent = 0, minEle = null, maxEle = null;
    const R = 6371000;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.ele != null) {
        minEle = minEle == null ? p.ele : Math.min(minEle, p.ele);
        maxEle = maxEle == null ? p.ele : Math.max(maxEle, p.ele);
      }
      if (i > 0) {
        const a = points[i - 1], b = p;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLon = (b.lon - a.lon) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 +
          Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        distanceM += 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        if (a.ele != null && b.ele != null) {
          const diff = b.ele - a.ele;
          if (diff > 0) ascent += diff; else descent += -diff;
        }
      }
    }
    return { points, distanceKm: distanceM / 1000, minEle, maxEle, ascent, descent };
  } catch (e) {
    console.warn("parseGpx failed", e);
    return null;
  }
}

/** Legge un File scelto dall'utente e lo comprime (gzip + base64), come GpxProcessor.kt. */
async function compressGpxFile(file) {
  const MAX_BYTES = 2 * 1024 * 1024;
  if (file.size > MAX_BYTES) return { tooLarge: true, sizeKb: Math.round(file.size / 1024) };
  const buf = await file.arrayBuffer();
  const compressedStream = new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressedBuf = await new Response(compressedStream).arrayBuffer();
  const bytes = new Uint8Array(compressedBuf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { gpxData: btoa(bin), fileName: file.name };
}

// ─────────────────────────────────────────────────────────────
// Audio evento (taglio + fade-in/out), allineato ad AudioEditor.kt/AudioTrimDialog.kt
// dell'app Android. Decodifica con Web Audio API (funziona per qualunque formato che il
// browser sa decodificare: mp3, m4a, ogg...), taglio ed eventuale fade applicati sui
// campioni PCM con OfflineAudioContext, poi ricodifica in WebM/Opus via MediaRecorder:
// un WAV non compresso di 30s pesa già 2-5 MB (troppo per un documento Firestore), mentre
// Opus allo stesso bitrate delle note vocali di WhatsApp resta sotto qualche centinaio di
// KB con qualità ampiamente sufficiente per voce/musica di sottofondo.
// ─────────────────────────────────────────────────────────────
const AUDIO_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const AUDIO_MAX_CLIP_MS = 30_000;
const AUDIO_MAX_OUTPUT_BYTES = 900 * 1024;
const AUDIO_MIME = "audio/webm;codecs=opus";

/** Decodifica il file scelto e ne ricava l'AudioBuffer completo, per popolare l'editor di taglio. */
async function loadAudioSource(file) {
  if (file.size > AUDIO_MAX_SOURCE_BYTES) return { tooLarge: true, sizeKb: Math.round(file.size / 1024) };
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(AUDIO_MIME)) return { unsupported: true };
  const buf = await file.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const audioBuffer = await ctx.decodeAudioData(buf);
    return { audioBuffer, fileName: file.name };
  } catch (e) {
    console.warn("decodeAudioData failed", e);
    return { readError: true };
  } finally {
    ctx.close();
  }
}

/** Estrae [startMs, endMs] da un AudioBuffer applicando fade-in/out lineari opzionali (via
 * GainNode automatizzato) e lo rende con OfflineAudioContext. Ritorna il nuovo AudioBuffer
 * tagliato, pronto per l'anteprima o per la codifica finale. */
async function renderTrimmedClip(audioBuffer, startMs, endMs, fadeInMs, fadeOutMs) {
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const startSec = startMs / 1000, endSec = endMs / 1000;
  const durationSec = Math.max(0, endSec - startSec);
  const frameCount = Math.max(1, Math.round(durationSec * sampleRate));

  const offlineCtx = new OfflineAudioContext(channels, frameCount, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  const gain = offlineCtx.createGain();
  source.connect(gain);
  gain.connect(offlineCtx.destination);

  gain.gain.setValueAtTime(1, 0);
  if (fadeInMs > 0) {
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(1, Math.min(fadeInMs, durationSec * 1000) / 1000);
  }
  if (fadeOutMs > 0) {
    const fadeOutStartSec = Math.max(0, durationSec - fadeOutMs / 1000);
    gain.gain.setValueAtTime(1, fadeOutStartSec);
    gain.gain.linearRampToValueAtTime(0, durationSec);
  }

  source.start(0, startSec, durationSec);
  return offlineCtx.startRendering();
}

/** Ricodifica un AudioBuffer già tagliato in WebM/Opus riproducendolo in tempo reale su un
 * MediaStreamDestination catturato da MediaRecorder — l'unico modo per ottenere un encoder
 * Opus lato browser senza librerie esterne. Durata dell'operazione = durata del clip. */
function encodeToOpus(clipBuffer) {
  return new Promise((resolve, reject) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createBufferSource();
    source.buffer = clipBuffer;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);

    const recorder = new MediaRecorder(dest.stream, { mimeType: AUDIO_MIME, audioBitsPerSecond: 48000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => { ctx.close(); resolve(new Blob(chunks, { type: AUDIO_MIME })); };
    recorder.onerror = (e) => { ctx.close(); reject(e.error || new Error("Recorder error")); };

    recorder.start();
    source.start();
    source.onended = () => setTimeout(() => recorder.stop(), 100);
  });
}

/** Pipeline completa: taglio+fade poi codifica Opus. Ritorna { base64, mimeType, sizeKb } o { tooLarge, sizeKb }. */
async function encodeAudioClip(audioBuffer, startMs, endMs, fadeInMs, fadeOutMs) {
  const clipBuffer = await renderTrimmedClip(audioBuffer, startMs, endMs, fadeInMs, fadeOutMs);
  const blob = await encodeToOpus(clipBuffer);
  if (blob.size > AUDIO_MAX_OUTPUT_BYTES) return { tooLarge: true, sizeKb: Math.round(blob.size / 1024) };
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { base64: btoa(bin), mimeType: AUDIO_MIME, sizeKb: Math.round(bytes.length / 1024) };
}

/** Editor di taglio audio: RangeSlider (max 30s), fade-in/out opzionali, anteprima
 * riproducibile del segmento selezionato. Analogo ad AudioTrimDialog.kt dell'app Android.
 * onApply(base64, mimeType) chiamato alla conferma. */
function openAudioTrimDialog(audioBuffer, onApply) {
  const totalMs = Math.round(audioBuffer.duration * 1000);
  let startMs = 0, endMs = Math.min(totalMs, AUDIO_MAX_CLIP_MS);
  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  const w = modal(`
    <h3>Taglia audio</h3>
    <p class="muted small" id="atDuration">Durata selezionata: ${((endMs - startMs) / 1000).toFixed(1)} s (massimo 30 s)</p>
    <label>Inizio <input type="range" id="atStart" min="0" max="${totalMs}" value="${startMs}"></label>
    <label>Fine <input type="range" id="atEnd" min="0" max="${totalMs}" value="${endMs}"></label>
    <div class="row between"><span id="atStartLbl">${fmt(startMs)}</span><span id="atEndLbl">${fmt(endMs)}</span></div>
    <label class="row center gap"><input type="checkbox" id="atFadeIn"> Fade-in</label>
    <label class="row center gap"><input type="checkbox" id="atFadeOut"> Fade-out</label>
    <div class="row" style="margin:10px 0;justify-content:center">
      <button type="button" class="icon-btn" id="atPlay">▶️</button>
    </div>
    <div id="atErr" class="err"></div>
    <div class="row end gap">
      <button class="btn ghost" data-close>Annulla</button>
      <button class="btn" id="atApply">Applica</button>
    </div>
  `);
  let stopPreview = () => {};
  w.querySelector("[data-close]").onclick = () => { stopPreview(); w.remove(); };
  w.addEventListener("click", (ev) => { if (ev.target === w) stopPreview(); });

  const startInput = w.querySelector("#atStart"), endInput = w.querySelector("#atEnd");
  const updateLabels = () => {
    w.querySelector("#atStartLbl").textContent = fmt(startMs);
    w.querySelector("#atEndLbl").textContent = fmt(endMs);
    w.querySelector("#atDuration").textContent = `Durata selezionata: ${((endMs - startMs) / 1000).toFixed(1)} s (massimo 30 s)`;
  };
  startInput.oninput = () => {
    startMs = Math.min(Number(startInput.value), endMs);
    if (endMs - startMs > AUDIO_MAX_CLIP_MS) { endMs = startMs + AUDIO_MAX_CLIP_MS; endInput.value = endMs; }
    startInput.value = startMs;
    updateLabels();
  };
  endInput.oninput = () => {
    endMs = Math.max(Number(endInput.value), startMs);
    if (endMs - startMs > AUDIO_MAX_CLIP_MS) { startMs = endMs - AUDIO_MAX_CLIP_MS; startInput.value = startMs; }
    endInput.value = endMs;
    updateLabels();
  };

  let previewCtx = null, previewSource = null;
  stopPreview = () => {
    if (previewSource) { try { previewSource.stop(); } catch {} previewSource = null; }
    if (previewCtx) { previewCtx.close(); previewCtx = null; }
    w.querySelector("#atPlay").textContent = "▶️";
  };
  w.querySelector("#atPlay").onclick = () => {
    if (previewSource) { stopPreview(); return; }
    previewCtx = new (window.AudioContext || window.webkitAudioContext)();
    previewSource = previewCtx.createBufferSource();
    previewSource.buffer = audioBuffer;
    previewSource.connect(previewCtx.destination);
    previewSource.start(0, startMs / 1000, (endMs - startMs) / 1000);
    previewSource.onended = () => { previewSource = null; w.querySelector("#atPlay").textContent = "▶️"; };
    w.querySelector("#atPlay").textContent = "⏹️";
  };

  const applyBtn = w.querySelector("#atApply");
  applyBtn.onclick = async () => {
    stopPreview();
    applyBtn.disabled = true;
    applyBtn.textContent = "Esportazione…";
    w.querySelector("#atErr").textContent = "";
    try {
      const fadeInMs = w.querySelector("#atFadeIn").checked ? Math.min(2000, (endMs - startMs) / 3) : 0;
      const fadeOutMs = w.querySelector("#atFadeOut").checked ? Math.min(2000, (endMs - startMs) / 3) : 0;
      const result = await encodeAudioClip(audioBuffer, startMs, endMs, fadeInMs, fadeOutMs);
      if (result.tooLarge) {
        w.querySelector("#atErr").textContent = `File troppo grande (${result.sizeKb} KB).`;
        applyBtn.disabled = false; applyBtn.textContent = "Applica";
        return;
      }
      onApply(result.base64, result.mimeType);
      w.remove();
    } catch (e) {
      console.warn("encodeAudioClip failed", e);
      w.querySelector("#atErr").textContent = "Esportazione non riuscita.";
      applyBtn.disabled = false; applyBtn.textContent = "Applica";
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Meteo (Open-Meteo, allineato a WeatherRepository.kt)
// ─────────────────────────────────────────────────────────────
function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55].includes(code)) return "🌦️";
  if ([61, 63, 65].includes(code)) return "🌧️";
  if ([71, 73, 75, 77].includes(code)) return "🌨️";
  if ([80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}
async function geocode(place) {
  if (!place?.trim()) return null;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place.trim())}&count=1&language=it&format=json`);
    const j = await r.json();
    const first = j.results?.[0];
    return first ? { lat: first.latitude, lon: first.longitude } : null;
  } catch { return null; }
}
async function forecastFor(lat, lon, dataDdMmYyyy, oraHhMm) {
  const p = (dataDdMmYyyy || "").trim().split("/");
  if (p.length !== 3) return [];
  const iso = `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation_probability,windspeed_10m,weathercode` +
      `&timezone=Europe%2FRome&start_date=${iso}&end_date=${iso}`);
    const j = await r.json();
    const times = j.hourly?.time || [];
    const targetHour = Math.min(23, Math.max(0, parseInt((oraHhMm || "12").split(":")[0], 10) || 12));
    const wanted = [targetHour - 2, targetHour - 1, targetHour, targetHour + 1, targetHour + 2].filter((h) => h >= 0 && h <= 23);
    const out = [];
    for (const h of wanted) {
      const idx = times.findIndex((t) => parseInt(t.slice(11, 13), 10) === h);
      if (idx < 0) continue;
      out.push({
        hour: h,
        temperatureC: j.hourly.temperature_2m[idx],
        precipitationProbability: j.hourly.precipitation_probability[idx],
        windSpeedKmh: j.hourly.windspeed_10m[idx],
        weatherCode: j.hourly.weathercode[idx],
      });
    }
    return out;
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────
function show(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
}
function go(hash) { location.hash = hash; }
window.addEventListener("hashchange", route);

async function route() {
  const h = location.hash.slice(1);
  const m = h.match(/^\/c\/([A-Z0-9]{4,8})(?:\/([^/]+))?$/i);
  if (m) {
    await openCalendar(m[1].toUpperCase(), m[2] || null);
  } else {
    clearSubs();
    show("search");
    renderSearch();
  }
}

// ─────────────────────────────────────────────────────────────
// SEARCH view
// ─────────────────────────────────────────────────────────────
async function renderSearch() {
  const root = $("#view-search");
  const signedIn = !!state.user;
  const label = state.user?.email || state.user?.displayName || "";

  root.innerHTML = `
    <div class="wrap">
      <header class="hdr">
        <h1><span class="accent">Giro</span></h1>
        <button id="themeToggle" class="icon-btn" title="Tema">🌙</button>
      </header>

      <section class="card pad">
        <div class="row between center">
          <div>
            <div class="lbl">ACCOUNT</div>
            <div class="muted">${signedIn ? esc(label) : "Non hai effettuato l'accesso"}</div>
          </div>
          ${signedIn
            ? `<button id="btnSignOut" class="btn ghost">Scollega</button>`
            : `<button id="btnSignIn" class="btn">Accedi con Google</button>`}
        </div>
        ${signedIn ? `
          <div class="uid-row">
            <span class="lbl">Il tuo codice utente</span>
            <code id="uid">${esc(state.user.uid)}</code>
            <button id="copyUid" class="icon-btn" title="Copia">⧉</button>
          </div>
          <button id="btnCreate" class="btn block" style="margin-top:14px">+ Crea un nuovo calendario</button>
          <p style="margin-top:2px"><a id="btnDeleteAccount" href="#" class="small" style="color:#e74c3c">Elimina account</a></p>` : `
          <p class="muted small">Serve solo per creare calendari o farti aggiungere come collaboratore. Per consultare un calendario condiviso non serve.</p>`}
      </section>

      <section class="card pad">
        <div class="lbl">APRI CALENDARIO</div>
        <div class="row gap">
          <input id="codeInput" class="code-field" maxlength="8" placeholder="ES. K7M2P9"
                 autocapitalize="characters" autocomplete="off" spellcheck="false"
                 value="${esc(pendingCode)}">
          <button id="btnBrowse" class="icon-btn" title="Sfoglia tutti i calendari">🔎</button>
          <button id="btnOpen" class="btn icon-only" title="Apri">→</button>
        </div>
        <div id="codeErr" class="err"></div>
      </section>

      ${signedIn ? `
        <section class="card pad">
          <div class="lbl">I MIEI CALENDARI</div>
          <div id="myCalList" class="cal-list"><p class="muted small">Caricamento…</p></div>
        </section>
        <section class="card pad">
          <div class="lbl">CALENDARI PUBBLICI</div>
          <div id="publicCalList" class="cal-list"><p class="muted small">Caricamento…</p></div>
        </section>
      ` : ""}

      <footer class="ver">Giro Web · ${APP_VERSION}</footer>
      <footer class="ver" id="statsFooter"></footer>
    </div>
  `;

  applyTheme(LS.theme());
  // $$ (non $): due view coesistono nel DOM con lo stesso id #themeToggle, querySelector
  // prenderebbe sempre lo stesso elemento indipendentemente da quale view è visibile ora.
  $$("#themeToggle").forEach((btn) => {
    btn.onclick = () => applyTheme(OPPOSITE[LS.theme()] || (THEMES[LS.theme()].dark ? "light" : "dark"));
  });

  $("#btnSignIn") && ($("#btnSignIn").onclick = doSignIn);
  $("#btnSignOut") && ($("#btnSignOut").onclick = () => signOut(auth));
  $("#copyUid") && ($("#copyUid").onclick = () => navigator.clipboard.writeText(state.user.uid));
  $("#btnDeleteAccount") && ($("#btnDeleteAccount").onclick = (e) => { e.preventDefault(); openDeleteAccountDialog(); });
  $("#btnCreate") && ($("#btnCreate").onclick = openCreateDialog);

  const codeInput = $("#codeInput");
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    pendingCode = codeInput.value;
  });
  const openCode = async () => {
    const s = codeInput.value.trim();
    if (!s) return;
    $("#codeErr").textContent = "";
    const c = await lookupCode(s);
    if (!c) { $("#codeErr").textContent = "Nessun calendario con questo codice."; return; }
    LS.addRecent(c.code, c.name || "");
    pendingCode = "";
    go("/c/" + c.code);
  };
  $("#btnOpen").onclick = openCode;
  codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") openCode(); });
  $("#btnBrowse").onclick = openBrowseDialog;

  loadStats().then((s) => {
    const el = $("#statsFooter");
    if (el) el.textContent = `${s.calendars} calendari · ${s.events} uscite totali`;
  }).catch(() => {});

  if (signedIn) {
    myCalendars().then((list) => renderCalListWithStats("#myCalList", list, { editable: true })).catch(() => {
      const el = $("#myCalList"); if (el) el.innerHTML = `<p class="muted small">Errore di caricamento.</p>`;
    });
    allCalendars().then((list) => renderCalListWithStats("#publicCalList", list, { editable: false })).catch(() => {
      const el = $("#publicCalList"); if (el) el.innerHTML = `<p class="muted small">Errore di caricamento.</p>`;
    });
  }
}

/** Riga calendario con statistiche (collaboratori/uscite/accessi) caricate in modo asincrono
 * per riga, e icona matita se [opts.editable] e l'utente è owner — stesso pattern di
 * RecentCalendarsTab nell'app Android. */
const GROUP_LABELS = { mine: "Tuo", recent: "Recente", public: "Pubblico" };

function renderCalListWithStats(selector, list, opts = {}) {
  const el = $(selector);
  if (!el) return;
  if (!list.length) { el.innerHTML = `<p class="muted small">Nessun calendario.</p>`; return; }
  el.innerHTML = list.map((t) => `
    <div class="cal-item-row" data-code="${esc(t.code)}">
      <button class="cal-item cal-item-open" data-code="${esc(t.code)}">
        <span class="dot" style="background:${dotColor(t.code, t.logoColor)}">${t.logoData ? `<img src="data:image/*;base64,${esc(t.logoData)}">` : ""}</span>
        <span class="cal-name">
          <span class="cal-row-title">${esc(t.name || t.code)}</span>
          <span class="muted small cal-stats" id="stats-${esc(t.code)}"><code>${esc(t.code)}</code></span>
          ${opts.showGroup ? `<span class="chip">${GROUP_LABELS[t.group] || ""}</span>` : ""}
        </span>
      </button>
      <button class="icon-btn cal-info" data-code="${esc(t.code)}" title="Dettagli" aria-label="Dettagli">ⓘ</button>
      ${opts.editable && t.ownerUid === state.user?.uid
        ? `<button class="icon-btn cal-edit" data-code="${esc(t.code)}" title="Modifica">✏️</button>` : ""}
    </div>`).join("");
  el.querySelectorAll(".cal-item-open").forEach((b) => b.onclick = () => {
    // calendario già aperto: torna alla scheda Prossime invece di ricaricarlo
    if (opts.showGroup && b.dataset.code === state.code) { state.tab = "prossime"; renderCalendar(); return; }
    go("/c/" + b.dataset.code);
  });
  const cur = el.querySelector(`.cal-item-open[data-code="${CSS.escape(state.code || "")}"] .dot`);
  if (cur && opts.showGroup) cur.style.boxShadow = "0 0 0 2px var(--bg, #fff), 0 0 0 4px #FFC107";
  el.querySelectorAll(".cal-info").forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); openCalendarDetailsByCode(b.dataset.code); });
  el.querySelectorAll(".cal-edit").forEach((b) => b.onclick = (ev) => {
    ev.stopPropagation();
    openEditCalendarFromListDialog(b.dataset.code, () => {
      myCalendars().then((l) => renderCalListWithStats("#myCalList", l, { editable: true })).catch(() => {});
    });
  });
  list.forEach((t) => {
    calendarStats(t.code).then((s) => {
      const statsEl = document.getElementById(`stats-${t.code}`);
      if (statsEl) statsEl.innerHTML = `<code>${esc(t.code)}</code> · <span>${s.eventCount} uscite · ${s.openCount} accessi</span>`;
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Logo calendario: tavolozza colori fissa + upload immagine (allineato a
// CreateCalendarScreen.kt/CalendarInfoDialog.kt/LogoImageProcessor.kt).
// ─────────────────────────────────────────────────────────────
const LOGO_PALETTE = ["#27AE60", "#2980B9", "#E74C3C", "#F2994A", "#9B59B6",
  "#16A085", "#D35400", "#2C3E50", "#C0392B", "#8E44AD"];

/** Ritaglio quadrato centrato + resize a 200x200 + compressione PNG verso ~40KB, come
 * LogoImageProcessor.kt. Ritorna il base64 puro (nessun prefisso data:) o null. */
function compressLogoToBase64(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const dim = 200;
      const canvas = document.createElement("canvas");
      canvas.width = dim; canvas.height = dim;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
      const tryQuality = (q) => new Promise((res) => canvas.toBlob(res, "image/png", q));
      (async () => {
        let blob = await tryQuality(0.9);
        for (let q = 0.9; q > 0.3 && blob && blob.size > 40 * 1024; q -= 0.15) {
          blob = await tryQuality(q);
        }
        if (!blob) { resolve(null); return; }
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        resolve(btoa(bin));
      })();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Riga di selezione colore + pulsante upload logo, riusata in creazione/modifica calendario.
 * [getColor]/[setColor] e [getLogoData]/[setLogoData] leggono/scrivono lo stato del chiamante;
 * [onChange] ridisegna l'anteprima del pallino. */
function logoPickerHtml(idPrefix) {
  return `
    <div class="row gap" style="margin-bottom:8px">
      <span class="dot lg" id="${idPrefix}Preview"></span>
      <button type="button" class="btn ghost" id="${idPrefix}Upload">Carica logo</button>
      <input type="file" id="${idPrefix}File" accept="image/*" class="hide">
    </div>
    <div class="row gap" id="${idPrefix}Palette" style="flex-wrap:wrap;margin-bottom:12px"></div>
  `;
}
function wireLogoPicker(w, idPrefix, initial, onChange) {
  let color = initial.logoColor || "";
  let logoData = initial.logoData || "";
  const preview = w.querySelector(`#${idPrefix}Preview`);
  const palette = w.querySelector(`#${idPrefix}Palette`);
  const renderPreview = () => {
    preview.style.background = dotColor("x", color);
    preview.innerHTML = logoData ? `<img src="data:image/*;base64,${esc(logoData)}">` : "";
  };
  palette.innerHTML = LOGO_PALETTE.map((hex) => `<span class="swatch ${color === hex ? "sel" : ""}" data-hex="${hex}" style="background:${hex}"></span>`).join("");
  palette.querySelectorAll(".swatch").forEach((s) => s.onclick = () => {
    color = color === s.dataset.hex ? "" : s.dataset.hex;
    palette.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("sel", x.dataset.hex === color));
    renderPreview();
    onChange({ logoColor: color, logoData });
  });
  w.querySelector(`#${idPrefix}Upload`).onclick = () => w.querySelector(`#${idPrefix}File`).click();
  w.querySelector(`#${idPrefix}File`).onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const data = await compressLogoToBase64(file);
    if (data) { logoData = data; renderPreview(); onChange({ logoColor: color, logoData }); }
  };
  renderPreview();
}

function dotColor(code, hex) {
  if (hex && /^#?[0-9a-f]{6}$/i.test(hex.trim())) return hex.trim().startsWith("#") ? hex.trim() : "#" + hex.trim();
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  return `hsl(${h % 360} 62% 55%)`;
}

async function doSignIn() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    alert("Accesso non riuscito: " + (e.message || e));
  }
}

// ─────────────────────────────────────────────────────────────
// CALENDAR view
// ─────────────────────────────────────────────────────────────
async function openCalendar(code, openEventId) {
  clearSubs();
  state.code = code;
  state.tab = LS.hiddenTabs().includes(LS.startTab()) ? "home" : LS.startTab();
  state.epics = [];
  state.trails = [];
  state.trailsLoaded = false;
  state.trailQuery = "";
  state.trailsExpandedZones = new Set();
  LS.setLastCode(code);
  show("calendar");
  const root = $("#view-calendar");
  root.innerHTML = `<div class="wrap"><p class="muted" style="padding:40px;text-align:center">Carico…</p></div>`;

  const ref = doc(db, "calendars", code);
  // Splash logo per un lampo (100ms), stesso trattamento dell'app Android: sfondo pieno con
  // solo il logo al centro finché il documento non è arrivato, poi sparisce.
  const splash = document.createElement("div");
  splash.className = "cal-splash";
  splash.innerHTML = `<span class="dot" style="width:120px;height:120px;font-size:3rem;background:${dotColor(code, "")}"></span>`;
  document.body.appendChild(splash);
  const splashStart = Date.now();

  // Prima la copia locale (immediata); solo se manca si attende il server. Poi gli snapshot
  // realtime sotto portano gli aggiornamenti senza far aspettare.
  let first = null, fromCache = false;
  state.myBlock = "";
  const bannedScreen = () => {
    splash.remove();
    root.innerHTML = `<div class="wrap"><div class="card pad"><h3>Accesso negato</h3>
      <p>Un amministratore ha bloccato il tuo account su questo calendario.</p>
      <button class="btn" onclick="location.hash=''">Torna alla ricerca</button></div></div>`;
  };
  if (state.user) {
    const ids = [state.user.uid, (state.user.email || "").trim().toLowerCase()].filter(Boolean);
    const lv = await Promise.all(ids.map((id) => getDoc(doc(db, "calendars", code, "blocks", id)).then((d) => (d.exists() && d.data().level) || "").catch(() => "")));
    state.myBlock = lv.includes("ban") ? "ban" : (lv.some(Boolean) ? "edit" : "");
    if (state.myBlock === "ban") { bannedScreen(); return; }
  }
  try { first = await getDocFromCache(ref); fromCache = first.exists(); } catch { first = null; }
  if (!fromCache) {
    try { first = await getDoc(ref); } catch (e) { if (e && e.code === "permission-denied") { bannedScreen(); return; } throw e; }
    const elapsed = Date.now() - splashStart;
    if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
  }
  splash.remove();
  if (!first.exists()) {
    root.innerHTML = `<div class="wrap"><div class="card pad">
      <p>Nessun calendario con il codice <code>${esc(code)}</code>.</p>
      <button class="btn" onclick="location.hash=''">Torna alla ricerca</button></div></div>`;
    return;
  }
  incrementOpenCount(code);

  // Link diretto a una scheda evento (#/c/CODICE/eventId): apre il dettaglio non appena gli
  // eventi sono arrivati dal primo snapshot, una volta sola (non ad ogni aggiornamento
  // realtime, altrimenti riaprirebbe il dialog sopra sé stesso o sopra le modifiche in corso).
  let pendingEventId = openEventId;
  state.unsub.push(onSnapshot(ref, (s) => {
    if (!s.exists()) {
      // Calendario eliminato mentre la copia locale era ancora in cache: avviso solo se il server lo conferma.
      if (!s.metadata.fromCache && fromCache) location.hash = "";
      return;
    }
    state.calendar = { code, ...s.data() };
    if (state.user && state.calendar.ownerUid === state.user.uid && state.user.email &&
        state.calendar.ownerEmail !== maskEmail(state.user.email)) {
      // migrazione: email completa nel doc privato, versione mascherata in quello pubblico
      setDoc(doc(db, "calendars", code, "private", "owner"), { email: state.user.email })
        .then(() => updateDoc(ref, { ownerEmail: maskEmail(state.user.email) })).catch(() => {});
    }
    applyOwnerFull(code);
    renderCalendar();
  }));
  // Primo snapshot dalla cache locale: gli eventi si vedono subito e compare «Aggiornamento in corso…» finché il server non conferma.
  let syncTimer = null, loadedOnce = false;
  setSyncing(true);
  state.unsub.push(() => { clearTimeout(syncTimer); setSyncing(false); });
  state.unsub.push(onSnapshot(collection(db, "calendars", code, "events"), { includeMetadataChanges: true }, (qs) => {
    clearTimeout(syncTimer);
    if (!qs.metadata.fromCache) setSyncing(false);
    else if (navigator.onLine) syncTimer = setTimeout(() => setSyncing(false), 60000);  // server irraggiungibile: non restare in attesa per sempre
    else setSyncing(false);
    if (loadedOnce && !qs.docChanges().length) return;  // solo metadati (cache → server): niente nuovo disegno
    loadedOnce = true;
    state.ownEvents = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    mergeLinked();
    renderCalendar();
    if (pendingEventId) {
      const ev = state.events.find((e) => e.id === pendingEventId);
      pendingEventId = null;
      if (ev) openEventDetail(ev);
    }
  }));
  // Eventi collegati da altri calendari (links/{id}): si leggono dall'evento d'origine, in sola lettura.
  state.ownEvents = state.ownEvents || []; state.linked = {}; state.linkUnsub = [];
  state.unsub.push(() => { (state.linkUnsub || []).forEach((u) => u()); state.linkUnsub = []; });
  state.unsub.push(onSnapshot(collection(db, "calendars", code, "links"), (qs) => {
    (state.linkUnsub || []).forEach((u) => u()); state.linkUnsub = []; state.linked = {};
    qs.docs.forEach((ld) => {
      const l = ld.data(); if (!l.srcCode || !l.srcEventId) return;
      const id = `L:${l.srcCode}:${l.srcEventId}`;
      getDoc(doc(db, "calendars", l.srcCode)).then((c) => {
        const name = c.exists() ? (c.data().name || l.srcCode) : l.srcCode;
        const fromLogoColor = c.exists() ? (c.data().logoColor || "") : "", fromLogoData = c.exists() ? (c.data().logoData || "") : "";
        state.linkUnsub.push(onSnapshot(doc(db, "calendars", l.srcCode, "events", l.srcEventId), (d) => {
          if (d.exists()) state.linked[id] = { id, srcId: d.id, ...d.data(), fromCode: l.srcCode, fromName: name, fromLogoColor, fromLogoData, linkId: ld.id };
          else delete state.linked[id];
          mergeLinked(); renderCalendar();
          if (fromLogoData && !(l.srcCode in _domCache)) dominantColor(l.srcCode, fromLogoData).then((col) => { if (col) renderCalendar(); });
        }, () => {}));
      }).catch(() => {});
    });
    mergeLinked(); renderCalendar();
  }, () => {}));
  state.unsub.push(onSnapshot(collection(db, "calendars", code, "announcements"), (qs) => {
    state.announcements = qs.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((a.sortOrder != null) - (b.sortOrder != null)) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || ((b.createdAtMillis || 0) - (a.createdAtMillis || 0)))
      .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
    renderCalendar();
  }));
  state.unsub.push(onSnapshot(collection(db, "calendars", code, "epics"), (qs) => {
    state.epics = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCalendar();
  }));

  LS.addRecent(code, first.data().name || "", first.data().ownerEmail || "");
  setTimeout(() => showTip(false), 1500);
}

/** Suggerimenti a popup: uno a caso, una volta per sessione all'apertura di un calendario; «Basta!» li spegne
 * (si riaccendono dal menu → Suggerimenti). Solo funzioni che il sito ha davvero. */
const TIPS = [
  "Nella scheda Trail chiunque abbia fatto il login può aggiornare i trail: lo stato (aperto, chiuso…), il nome e la posizione sulla mappa. Aiuta tutti a tenere i sentieri al giorno!",
  "Hai trovato un sentiero chiuso o di nuovo aperto? Apri il trail nella scheda Trail e aggiungi un commento con il nuovo stato: lo vedono subito tutti.",
  "Il tracciato di un trail è sbagliato o spostato? Sulla mappa attiva la matita (serve il login), tieni premuto il tracciato e scegli «Modifica»: trascina i punti per correggerlo.",
  "Dal menu → Preferenze → «Barra schede» scegli se le schede scorrono su una riga o sono tutte visibili su due righe.",
  "Dal menu → «Dimensione testo» puoi ingrandire o rimpicciolire tutto il testo del sito.",
  "Sulla mappa gli occhi Z, L, T, N, P accendono e spengono zone, costruttori, trail, nomi e punti di interesse: lascia visibile solo quello che ti serve.",
  "Tocca un punto di interesse sulla mappa e poi «Naviga»: ti porta lì con Google Maps, Waze o Apple Maps (scegli quale dal menu → «App di navigazione»).",
  "Il pulsante 3D sulla mappa mostra la zona che stai guardando in rilievo, con i trail colorati per difficoltà.",
  "Il pulsante GPX sulla mappa carica un tuo file GPX per vederlo sopra i trail, anche in 3D.",
  "Il pulsante 📍 sulla mappa ti mostra dove sei rispetto ai sentieri (serve il permesso di posizione).",
  "Dal menu → «Condividi codice» mandi il calendario agli amici: basta il codice per aprirlo.",
  "Hai un'idea per un'uscita? Dal menu → «Proponi evento» la mandi a chi gestisce il calendario.",
  "Dal menu → «Scala difficoltà» scegli i colori dei trail: scala classica o Trailforks.",
  "Dal menu → «Autoplay audio» decidi se l'audio dell'evento parte da solo aprendo la foto a tutto schermo.",
  "Dal menu → «Tema» e «Lingua» cambi tra chiaro e scuro, italiano e inglese.",
  "Dopo il primo accesso gli eventi si aprono subito dalla memoria del dispositivo e si aggiornano da soli: il menu → «Cache» mostra quanto spazio occupa.",
];
/** Suggerimenti da tips.json (modificabile senza rilasciare nulla), con copia in localStorage e controllo in
 * background al più ogni 6 ore; senza rete o prima del primo scaricamento valgono quelli scritti sopra. */
const TIPS_URL = "tips.json", TIPS_EVERY_MS = 6 * 3600 * 1000;
function tipItems() {
  try {
    const c = JSON.parse(localStorage.getItem("gc_tips_json") || "null");
    const l = (c?.tips || []).filter((t) => t && t.it && t.p !== "android");
    if (l.length) return l;
  } catch {}
  return TIPS.map((it) => ({ it }));
}
const tipText = (t) => (window.GC_LANG === "en" && t.en) ? t.en : tr(t.it);
async function refreshTips() {
  try {
    const last = Number(localStorage.getItem("gc_tips_at") || 0);
    if (Date.now() - last < TIPS_EVERY_MS) return;
    const r = await fetch(`${TIPS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (!Array.isArray(j.tips) || !j.tips.length) return;
    localStorage.setItem("gc_tips_json", JSON.stringify(j));
    localStorage.setItem("gc_tips_at", String(Date.now()));
  } catch {}
}
setTimeout(refreshTips, 4000);
const tipId = (t) => { let h = 0; for (const ch of t.it) h = (h * 31 + ch.charCodeAt(0)) | 0; return String(h); };
/** Rotazione per utente: ricorda i suggerimenti già mostrati (per uid, o «anon») e ne pesca uno non ancora visto;
 * finiti tutti si ricomincia, senza riproporre subito l'ultimo. Gli id sono hash del testo: reggono le modifiche al file. */
function nextTipIndex(items) {
  const key = "gc_tips_seen2_" + (auth.currentUser?.uid || "anon");
  const ids = items.map(tipId);
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || "[]").filter((x) => ids.includes(x)); } catch {}
  let pool = ids.map((_, n) => n).filter((n) => !seen.includes(ids[n]));
  if (!pool.length) { const last = seen[seen.length - 1]; seen = []; pool = ids.map((_, n) => n).filter((n) => ids[n] !== last); if (!pool.length) pool = [0]; }
  const n = pool[Math.floor(Math.random() * pool.length)];
  seen.push(ids[n]);
  try { localStorage.setItem(key, JSON.stringify(seen)); } catch {}
  return n;
}
const tipsOff = () => { try { return localStorage.getItem("gc_tips_off") === "1"; } catch { return false; } };
function showTip(force) {
  if (!force && (tipsOff() || sessionStorage.getItem("gc_tip_shown"))) return;
  try { sessionStorage.setItem("gc_tip_shown", "1"); } catch {}
  try { localStorage.removeItem("gc_tips_off"); } catch {}
  if (force && document.querySelector(".tip-modal")) return;
  const items = tipItems();
  let i = nextTipIndex(items);
  const w = modal(`
    <h3><span id="tipLamp">💡</span> <span id="tipHead">Suggerimento</span></h3>
    <p class="tip-text" style="font-size:1.05em;line-height:1.45;margin:6px 0 14px"></p>
    <div class="row between center gap">
      <button class="btn ghost" id="tipOff">Basta!</button>
      <span class="row gap"><button class="btn ghost" id="tipNext">Un altro</button><button class="btn" data-close>Chiudi</button></span>
    </div>`);
  w.classList.add("tip-modal");
  const head = w.querySelector("#tipHead"), txt = w.querySelector(".tip-text"), set = () => { txt.textContent = tipText(items[i]);
    head.textContent = `${tr("Suggerimento")} ${i + 1}/${items.length}`; };
  set();
  // Segreto: 3 tocchi rapidi sulla lampadina mostrano l'elenco di tutti i suggerimenti.
  let taps = 0, tapT = 0;
  w.querySelector("#tipLamp").onclick = () => {
    const now = Date.now();
    taps = now - tapT < 700 ? taps + 1 : 1; tapT = now;
    if (taps < 3) return;
    taps = 0;
    const all = modal(`<h3>💡 ${esc(tr("Tutti i suggerimenti"))}</h3>
      <ol class="small" style="padding-left:22px;line-height:1.45">${items.map((t) => `<li style="margin:8px 0">${esc(tipText(t))}</li>`).join("")}</ol>
      <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
    all.querySelector(".modal").classList.add("modal-xl");
    all.querySelector("[data-close]").onclick = () => all.remove();
  };
  w.querySelector("#tipNext").onclick = () => { i = nextTipIndex(items); set(); };
  w.querySelector("#tipOff").onclick = () => { try { localStorage.setItem("gc_tips_off", "1"); } catch {} w.remove(); toast("Suggerimenti disattivati: li riattivi dal menu → Suggerimenti"); };
}

/** Avviso discreto «Aggiornamento in corso…» mentre gli eventi dalla cache locale attendono la conferma del server. */
function setSyncing(on) {
  let el = document.getElementById("syncPill");
  if (!on) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement("div"); el.id = "syncPill"; el.textContent = "⟳ Aggiornamento in corso…";
  el.style.cssText = "position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:900;background:rgba(0,0,0,.78);color:#fff;font:600 12px sans-serif;padding:7px 14px;border-radius:16px;pointer-events:none";
  document.body.appendChild(el);
}

function mergeLinked() {
  const lk = Object.values(state.linked || {});
  state.events = lk.length ? [...(state.ownEvents || []), ...lk].sort((a, b) => (parseStart(a) || 0) - (parseStart(b) || 0)) : (state.ownEvents || []);
}
/** Documento Firestore dell'evento d'origine (per un evento collegato è nell'altro calendario). */
const srcEventRef = (e) => e.fromCode ? doc(db, "calendars", e.fromCode, "events", e.srcId) : doc(db, "calendars", state.code, "events", e.id);

function canEdit() { return !!state.user && !state.myBlock && (state.calendar?.editors || []).includes(state.user.uid); }
function isOwner() { return !!state.user && state.calendar?.ownerUid === state.user.uid; }
function editEnabled() { return canEdit() && state.adminMode; }

// Colore dominante di un logo (pixel vivaci: via bianchi, grigi e neri); null se non c'è un'immagine leggibile.
const _domCache = {};
function dominantColor(code, b64) {
  if (!b64) return Promise.resolve(null);
  if (code in _domCache) return Promise.resolve(_domCache[code]);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue;
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const v = mx / 255, sat = mx ? (mx - mn) / mx : 0;
          if (sat < 0.35 || v < 0.3) continue;
          const wt = sat * v; r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
        }
        _domCache[code] = w > 0 ? `rgb(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)})` : null;
      } catch { _domCache[code] = null; }
      res(_domCache[code]);
    };
    img.onerror = () => res(null);
    img.src = `data:image/*;base64,${b64}`;
  });
}

function eventCardHtml(e, opts = {}) {
  const hasBg = !!e.cardBgData;
  const stripe = e.fromCode ? `box-shadow:inset 7px 0 0 ${_domCache[e.fromCode] || dotColor(e.fromCode, e.fromLogoColor)};` : "";
  const bgCss = hasBg ? `background-image:url('data:image/jpeg;base64,${b64(e.cardBgData)}');` : "";
  const style = (bgCss || stripe) ? `style="${bgCss}${stripe}"` : "";
  const fromRow = e.fromCode ? `<div class="ec-from"><span class="ec-from-logo" style="background:${dotColor(e.fromCode, e.fromLogoColor)}">${e.fromLogoData ? `<img src="data:image/*;base64,${esc(e.fromLogoData)}" alt="">` : ""}</span><b>da ${esc(e.fromName || e.fromCode)}</b></div>` : "";
  const meta = [];
  if (e.localita) meta.push(`📍 ${esc(e.localita)}`);
  if (e.proponente) meta.push(`👤 ${esc(e.proponente)}`);
  if (!opts.isEpic && ((e.partecipanti || []).length || (e.forse || []).length)) meta.push(`🚴 ${(e.partecipanti || []).length}${(e.forse || []).length ? ` (+${e.forse.length}?)` : ""}`);
  return `
  <div class="event-card ${hasBg ? "has-bg" : ""} ${e.annullata ? "cancelled" : ""}" ${style} data-id="${esc(e.id)}">
    <div class="ec-top">
      <span class="ec-title">${esc(e.titolo || "Uscita")}</span>
      ${e.fromCode ? "" : diffBadge(e.difficolta)}
    </div>
    ${fromRow}
    ${!opts.isEpic ? `<div class="ec-date"><b>${esc(e.data)}${weekdayLabel(e.data) ? " " + weekdayLabel(e.data) : ""}${e.ora ? " · " + esc(e.ora) : ""}${e.durataGiorni > 1 ? " · " + e.durataGiorni + " giorni" : ""}</b></div>` : ""}
    ${meta.length ? `<div class="ec-meta">${meta.join("")}</div>` : ""}
  </div>`;
}

function renderCalendar() {
  if (!state.calendar) return;
  const t = state.calendar;
  const now = Date.now();

  const upcoming = state.events.filter((e) => !isPast(e, now))
    .sort((a, b) => (parseStart(a) ?? 0) - (parseStart(b) ?? 0));
  const past = state.events.filter((e) => isPast(e, now))
    .sort((a, b) => (parseStart(b) ?? 0) - (parseStart(a) ?? 0));

  // Tab dinamiche: "calendari" se ci sono recenti (oltre a quello aperto ora) o se l'utente
  // è loggato (potrebbe avere propri calendari anche senza recenti salvati su questo
  // dispositivo) — la lista unisce tuoi/recenti/pubblici, vedi wireCalendarTabBody.
  // "info" solo se ci sono comunicazioni pubblicate.
  const recents = LS.recents().filter((r) => r.code !== t.code);
  const hasCalendarsTab = recents.length > 0 || !!state.user;
  const hasInfoTab = state.announcements.length > 0;
  if (state.tab === "passate") state.tab = "prossime";
  if (state.tab === "mieigiri" && !state.user) state.tab = "prossime";
  if (state.tab === "calendari" && !hasCalendarsTab) state.tab = "prossime";
  if (state.tab === "info" && !hasInfoTab) state.tab = "prossime";
  if (state.tab === "officina" && !state.user) state.tab = "prossime";
  const hasContactsTab = !!state.user;
  if (state.tab === "contatti" && !hasContactsTab) state.tab = "prossime";

  $("#view-calendar").innerHTML = `
    <div class="cal-header">
      <div class="cal-bar">
        <button class="icon-btn" onclick="location.hash=''" title="Indietro">←</button>
        <button id="calQuickInfoBtn" class="cal-title-btn" title="Info calendario" style="display:flex;align-items:center;gap:8px;background:none;border:0;cursor:pointer;padding:0">
          <span class="dot sm" style="background:${dotColor(t.code, t.logoColor)}">${
            t.logoData ? `<img src="data:image/*;base64,${esc(t.logoData)}" alt="">` : ""}</span>
          <h1 class="cal-title" style="margin:0">${esc((t.name || t.code).toUpperCase())}</h1>
        </button>
        <button id="audioAutoplayToggle" class="icon-btn" title="Autoplay audio">${LS.audioAutoplay() ? "🔊" : "🔇"}</button>
        <button id="themeToggle" class="icon-btn" title="Tema">🌙</button>
        <button id="menuBtn" class="icon-btn menu-trigger" title="Menu"><span class="mob">⋮</span><span class="desk">☰</span></button>
      </div>
    </div>

    <div class="wrap cal-list-wrap">
      <div class="tabs ${LS.singleTabBar() ? "" : "tabs-2row"}" style="--per:${Math.ceil((5 + (hasCalendarsTab ? 1 : 0) + (hasInfoTab ? 1 : 0) + (hasContactsTab ? 1 : 0) + (state.user ? 2 : 0) + 3) / 2)}">
        <button data-tab="home" class="${state.tab === "home" ? "sel" : ""}">HOME</button>
        ${hasCalendarsTab ? `<button data-tab="calendari" class="${state.tab === "calendari" ? "sel" : ""}">CALENDARI</button>` : ""}
        <button data-tab="prossime" class="${state.tab === "prossime" ? "sel" : ""}">EVENTI</button>
        <button data-tab="mese" class="${state.tab === "mese" ? "sel" : ""}">MESE</button>
        ${hasInfoTab ? `<button data-tab="info" class="${state.tab === "info" ? "sel" : ""}">INFO</button>` : ""}
        <button data-tab="trail" class="${state.tab === "trail" ? "sel" : ""}">TRAIL</button>
        <button data-tab="mappa" class="${state.tab === "mappa" ? "sel" : ""}">MAPPA</button>
        <button data-tab="epici" class="${state.tab === "epici" ? "sel" : ""}">EPICI</button>
        ${hasContactsTab ? `<button data-tab="contatti" class="${state.tab === "contatti" ? "sel" : ""}">CONTATTI</button>` : ""}
        <button data-tab="mercatino" class="${state.tab === "mercatino" ? "sel" : ""}">MERCATINO</button>
        ${state.user ? `<button data-tab="officina" class="${state.tab === "officina" ? "sel" : ""}">OFFICINA</button>` : ""}
        ${state.user ? `<button data-tab="mieigiri" class="${state.tab === "mieigiri" ? "sel" : ""}">I MIEI GIRI</button>` : ""}
        <button data-tab="impostazioni" class="${state.tab === "impostazioni" ? "sel" : ""}">IMPOSTAZIONI</button>
      </div>

      ${renderCalendarTabBody(t, upcoming, past, recents)}

      <div style="height:80px"></div>
    </div>

    ${state.tab !== "home" && state.tab !== "calendari" && state.tab !== "trail" && state.tab !== "mappa" && state.tab !== "epici" && state.tab !== "officina" && state.tab !== "contatti" && state.tab !== "mercatino" && state.tab !== "info" && editEnabled() ? `<button id="fab" class="fab">+ Uscita</button>` : ""}
    ${state.tab === "info" && editEnabled() ? `<button id="fab" class="fab">+ Avviso</button>` : ""}
    ${state.tab === "epici" && editEnabled() ? `<button id="fab" class="fab">+ Epico</button>` : ""}
    ${state.tab === "calendari" ? `<button id="fab" class="fab">+ Calendario</button>` : ""}
    ${state.tab === "officina" ? `<button id="fab" class="fab">+ Lavoro</button>` : ""}
    ${state.tab === "mercatino" ? `<button id="fab" class="fab">+ Annuncio</button>` : ""}
    ${state.tab === "contatti" ? `<button id="fab" class="fab">${myContact() ? "Modifica la mia scheda" : "+ La mia scheda"}</button>` : ""}
  `;

  applyTheme(LS.theme());
  $$("#themeToggle").forEach((btn) => {
    btn.onclick = () => applyTheme(OPPOSITE[LS.theme()] || (THEMES[LS.theme()].dark ? "light" : "dark"));
  });
  $("#audioAutoplayToggle").onclick = () => {
    LS.setAudioAutoplay(!LS.audioAutoplay());
    renderCalendar();
  };
  $("#menuBtn").onclick = (e) => openMenu(e.currentTarget);
  $("#calQuickInfoBtn") && ($("#calQuickInfoBtn").onclick = () => openCalendarQuickInfoDialog(t));
  $("#fab") && ($("#fab").onclick = () => {
    if (state.tab === "calendari") { location.hash = ""; }
    else if (state.tab === "officina") openNewJob();
    else if (state.tab === "mercatino") openNewListing();
    else if (state.tab === "contatti") openMyContact();
    else if (state.tab === "info") openAnnouncementDialog(true);
    else if (state.tab === "epici") openEventDialog(null, { isEpic: true });
    else openEventDialog(null);
  });
  $$(".tabs button").forEach((b) => b.onclick = () => {
    state.tab = b.dataset.tab;
    if (state.tab !== "home") { try { history.pushState({ gcTab: 1 }, ""); } catch {} }   // il tasto indietro torna alla Home
    renderCalendar();
  });
  $(".tabs button.sel")?.scrollIntoView({ inline: "center", block: "nearest" });

  // barra PASSATI (dentro EVENTI) e schede Impostazioni / I miei giri
  $("[data-pasttoggle]")?.addEventListener("click", () => { const y = window.scrollY; state.pastOpen = !state.pastOpen; renderCalendar(); window.scrollTo(0, y); });
  document.querySelectorAll("#prefsPage [data-act]").forEach((b) => b.onclick = () => menuAction(b.dataset.act));
  if (state.tab === "mieigiri" && $("#myRidesHost")) openMySpaceDialog($("#myRidesHost"));

  wireCalendarTabBody(t);
}

/** Swipe orizzontale col dito per passare alla scheda accanto (come nell'app). Ignora mappe, campi di testo,
 * la barra schede, le finestre aperte e i gesti più verticali che orizzontali. Installato una volta sola. */
(function installTabSwipe() {
  let x0 = 0, y0 = 0, ok = false;
  document.addEventListener("touchstart", (ev) => {
    const t = ev.touches[0];
    x0 = t.clientX; y0 = t.clientY;
    ok = ev.touches.length === 1 && !!document.querySelector(".tabs") && !document.querySelector(".modal-bg")
      && !ev.target.closest(".map-wrap, .leaflet-container, input, textarea, select, .tabs, table, pre, canvas");
  }, { passive: true });
  document.addEventListener("touchend", (ev) => {
    if (!ok) return;
    ok = false;
    const t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const tabs = [...document.querySelectorAll(".tabs button")].filter((b) => !b.hidden);
    const i = tabs.findIndex((b) => b.classList.contains("sel")), n = i + (dx < 0 ? 1 : -1);
    if (i >= 0 && tabs[n]) tabs[n].click();
  }, { passive: true });
})();

/** Corpo della tab attiva: Prossime/Passate (lista eventi), Calendari (recenti), Info
 * (comunicazioni) o Trail. Estratto da renderCalendar per tenerla leggibile. */
function renderCalendarTabBody(t, upcoming, past, recents) {
  if (state.tab === "home") return `<div id="homeBox"></div>`;
  if (state.tab === "contatti") return contactsTabHtml();
  if (state.tab === "officina") return workshopTabHtml();
  if (state.tab === "mercatino") return marketTabHtml();
  if (state.tab === "mese") return monthTabHtml();
  if (state.tab === "calendari") {
    return `<div id="tabCalList" class="cal-list"></div>`;
  }
  if (state.tab === "info") {
    return state.announcements.map((a) => `
      <div class="announce">
        ${a.title ? `<div style="font-weight:700;margin-bottom:4px">${esc(a.title)}</div>` : ""}
        <div>${richText(a.text)}</div>
        <div class="ann-date">${new Date(a.createdAtMillis || 0).toLocaleDateString(window.GC_LOCALE)}${isOwner() ? ` <span style="float:right"><button class="icon-btn" data-aedit="${a.id}" title="Modifica">✏️</button><button class="icon-btn" data-adel="${a.id}" title="Elimina">🗑</button></span>` : ""}</div>
      </div>`).join("");
  }
  if (state.tab === "trail") {
    return `
      <div class="row gap center" style="margin-bottom:10px">
        <input id="trQ" placeholder="Cerca zona o trail…" style="flex:1;width:auto" value="${esc(state.trailQuery || "")}">
        ${trailModeBtnHtml()}
      </div>
      <div id="trList">${trailListHtml()}</div>
      <div id="trLog" class="trail-log"></div>`;
  }
  if (state.tab === "mappa") {
    return `<div id="mapWrap" class="map-wrap">
      <div id="trMap"></div>
      <div class="map-bottom"><button type="button" id="mapOpenGpx" class="map-open">🧭 APRI GPX</button><span class="map-chips"><button type="button" id="chipExplore" class="on">🗺️ Esplora</button><button type="button" id="chipNav">🧭 Naviga</button></span></div>
      <button id="mapFull" class="map-btn map-full-btn" title="Schermo intero">⛶</button>
      <span class="map-mine-wrap"><button id="mapMine" class="map-btn" hidden>GPX</button><button id="mapMineEye" class="map-btn map-eye ${state.myGpxHidden ? "" : "on"}" title="${state.myGpxHidden ? "Mostra il tuo GPX" : "Nascondi il tuo GPX"}" ${state.myGpx ? "" : "hidden"}>${eyeSvg(!!state.myGpxHidden)}<b>G</b></button><button id="mapMineX" class="map-btn" title="Elimina il tuo GPX" aria-label="Elimina il tuo GPX" ${state.myGpx ? "" : "hidden"}>✕</button><button id="mapMineMenu" class="map-btn" title="Strumenti GPX" aria-label="Strumenti GPX" ${state.myGpx ? "" : "hidden"}>⋮</button></span>
      <span class="map-mode-wrap">
        <button id="mapZones" class="icon-btn map-eye ${state.mapZonesOff ? "" : "on"}" title="${state.mapZonesOff ? "Mostra le zone" : "Nascondi le zone"}">${eyeSvg(!!state.mapZonesOff)}<b>Z</b></button>
        <button id="mapBld" class="icon-btn map-eye ${state.mapBldOff ? "" : "on"}" title="${state.mapBldOff ? "Mostra i loghi dei costruttori" : "Nascondi i loghi dei costruttori"}">${eyeSvg(!!state.mapBldOff)}<b>L</b></button>
        <button id="mapLines" class="icon-btn map-eye ${state.mapLinesOff ? "" : "on"}" title="${state.mapLinesOff ? "Mostra i tracciati dei trail" : "Nascondi i tracciati dei trail"}">${eyeSvg(!!state.mapLinesOff)}<b>T</b></button>
        <button id="mapNames" class="icon-btn trail-mode map-eye ${state.mapNames ? "on" : ""}" title="${state.mapNames ? "Nascondi i nomi dei trail" : "Mostra i nomi dei trail"}">${eyeSvg(!state.mapNames)}<b>N</b></button>
        <button id="mapHaz" class="icon-btn map-eye ${hazOff() ? "" : "on"}" title="Pericoli segnalati dagli utenti">${eyeSvg(hazOff())}<b>⚠</b></button>
        <button id="mapPois" class="icon-btn map-eye ${state.mapPoisOff ? "" : "on"}" title="${state.mapPoisOff ? "Mostra i punti di interesse" : "Nascondi i punti di interesse"}">${eyeSvg(!!state.mapPoisOff)}<b>P</b></button>
        ${trailModeBtnHtml()}
        <button id="mapHelp" class="icon-btn map-help" title="Guida della mappa" aria-label="Guida della mappa"><b>?</b></button>
        <button id="map3DArea" class="icon-btn map-eye" title="Vista 3D della zona" aria-label="Vista 3D della zona"><b>3D</b></button>
      </span>
      ${RECORDING_ENABLED ? `<button id="mapRec" class="map-btn map-rec-btn" title="Registra il percorso (GPX)">● REC</button>` : ""}
      <button id="mapLoc" class="map-btn map-loc-btn" title="La mia posizione" aria-label="La mia posizione"><svg ${ICON_STYLE}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg></button>
      <div id="mapHint" class="map-hint" hidden></div>
    </div>
    <div id="mapLog" class="trail-log"></div>`;
  }
  if (state.tab === "epici") {
    return state.epics.length ? state.epics.map((e) => eventCardHtml(e, { isEpic: true })).join("")
      : `<p class="empty">Nessun giro epico ancora.<br>Aggiungine uno da un'uscita passata.</p>`;
  }
  if (state.tab === "impostazioni") {
    return `<div id="prefsPage"><h3 style="margin:6px 0 10px">Preferenze</h3><div class="menu-list">
      <button data-act="textscale">Dimensione testo</button>
      <button data-act="diffscale">Scala difficoltà</button>
      <button data-act="navapp">App di navigazione</button>
      <button data-act="tabbar">Barra schede</button>
      <button data-act="audioautoplay">Autoplay audio</button>
      <button data-act="gpxw">Spessore traccia GPX</button>
      <button data-act="lang">Lingua</button>
      <button data-act="theme">🎨 Tema</button>
      <button data-act="cachesize">Cache</button>
    </div></div>`;
  }
  if (state.tab === "mieigiri") return `<div id="myRidesHost"></div>`;
  // EVENTI: prossime uscite e, in fondo, la barra PASSATI che si apre al tocco
  const up = upcoming.length ? upcoming.map((e) => eventCardHtml(e)).join("") : `<p class="empty">Nessuna uscita in programma.</p>`;
  const pastBar = past.length
    ? `<button type="button" data-pasttoggle style="display:flex;width:100%;align-items:center;justify-content:space-between;margin:18px 0 8px;padding:10px 14px;border:0;border-radius:10px;background:var(--text);color:var(--bg);font:inherit;font-weight:700;letter-spacing:.04em;cursor:pointer"><span style="flex:1;text-align:left">✓ PASSATI</span><span style="font-size:1.3rem">${state.pastOpen ? "▴" : "▾"}</span><span style="flex:1;text-align:right;font-weight:400;font-size:.85rem;opacity:.85">${past.length === 1 ? "1 uscita" : past.length + " uscite"}</span></button>`
      + (state.pastOpen ? past.map((e) => eventCardHtml(e)).join("") : "")
    : "";
  return up + pastBar;
}

/** Scheda MESE (allineata a MonthTab in CalendarScreen.kt): griglia lun-dom del mese con i
 * titoli delle uscite; sfondo del giorno = immagine della prima uscita (per orario) che ne ha una. */
function monthTabHtml() {
  const off = state.monthOffset || 0;
  const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + off);
  const year = first.getFullYear(), month = first.getMonth();
  const title = first.toLocaleDateString(window.GC_LOCALE, { month: "long", year: "numeric" });
  const byDay = {};
  state.events.filter((e) => !e.annullata).forEach((e) => {
    const st = parseStart(e);
    if (st == null) return;
    const d = new Date(st);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    (byDay[d.getDate()] = byDay[d.getDate()] || []).push({ st, e });
  });
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const now = new Date();
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : -1;
  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<div class="month-cell empty-cell"></div>`;
  for (let d = 1; d <= days; d++) {
    const evs = (byDay[d] || []).sort((a, b) => a.st - b.st).map((x) => x.e);
    const bg = (evs.find((e) => e.cardBgData) || {}).cardBgData;
    cells += `<div class="month-cell ${bg ? "has-bg" : ""} ${d === todayDay ? "today" : ""}" ${bg ? `style="background-image:url('data:image/jpeg;base64,${b64(bg)}')"` : ""}>
      <div class="month-day">${d}</div>
      ${evs.slice(0, 3).map((e) => `<div class="month-ev" data-id="${esc(e.id)}">${esc(e.titolo)}</div>`).join("")}
    </div>`;
  }
  return `<div class="row between center" style="margin-bottom:8px">
      <button class="btn ghost" data-mnav="-1">‹</button>
      <b style="text-transform:capitalize">${esc(title)}</b>
      <button class="btn ghost" data-mnav="1">›</button>
    </div>
    <div class="month-grid">${["LUN","MAR","MER","GIO","VEN","SAB","DOM"].map((w) => `<div class="month-wd">${w}</div>`).join("")}${cells}</div>`;
}

/** Collega gli handler del corpo tab corrente (chiamata dopo ogni renderCalendar). */
/** Icone stilizzate monocromatiche (Material Icons, Apache 2.0), nel colore del testo. */
const ic = (p) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" style="vertical-align:-0.125em">${p}</svg>`;
const HOME_ICONS = {
  home: ic(`<path d="m12 5.69 5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>`),
  calendari: ic(`<path d="M3 19h17v2H3c-1.1 0-2-.9-2-2V6h2v13zM23 6v9c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2l.01-11c0-1.1.89-2 1.99-2h5l2 2h7c1.1 0 2 .9 2 2zM7 15h14V6h-7.83l-2-2H7v11z"/>`),
  prossime: ic(`<path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10 2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>`),
  passate: ic(`<path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"/>`),
  mese: ic(`<path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/>`),
  info: ic(`<path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm5.03 1.71L11 9.53v4.94l-1.97-1.18-.48-.29H4v-2h4.55l.48-.29zM15.5 12c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z"/>`),
  trail: ic(`<path d="M19 15.18V7c0-2.21-1.79-4-4-4s-4 1.79-4 4v10c0 1.1-.9 2-2 2s-2-.9-2-2V8.82C8.16 8.4 9 7.3 9 6c0-1.66-1.34-3-3-3S3 4.34 3 6c0 1.3.84 2.4 2 2.82V17c0 2.21 1.79 4 4 4s4-1.79 4-4V7c0-1.1.9-2 2-2s2 .9 2 2v8.18A2.996 2.996 0 0 0 18 21c1.66 0 3-1.34 3-3 0-1.3-.84-2.4-2-2.82zM6 7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 12c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>`),
  mappa: ic(`<path d="m20.5 3-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM10 5.47l4 1.4v11.66l-4-1.4V5.47zm-5 .99 3-1.01v11.7l-3 1.16V6.46zm14 11.08-3 1.01V6.86l3-1.16v11.84z"/>`),
  epici: ic(`<path d="m14 6-4.22 5.63 1.25 1.67L14 9.33 19 16h-8.46l-4.01-5.37L1 18h22L14 6zM5 16l1.52-2.03L8.04 16H5z"/>`),
  contatti: ic(`<path d="M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zM4.34 17c.84-.58 2.87-1.25 4.66-1.25s3.82.67 4.66 1.25H4.34zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm0-5c.83 0 1.5.67 1.5 1.5S9.83 10 9 10s-1.5-.67-1.5-1.5S8.17 7 9 7zm7.04 6.81c1.16.84 1.96 1.96 1.96 3.44V19h4v-1.75c0-2.02-3.5-3.17-5.96-3.44zM15 12c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z"/>`),
  officina: ic(`<path d="m22.61 18.99-9.08-9.08c.93-2.34.45-5.1-1.44-7C9.79.61 6.21.4 3.66 2.26L7.5 6.11 6.08 7.52 2.25 3.69C.39 6.23.6 9.82 2.9 12.11c1.86 1.86 4.57 2.35 6.89 1.48l9.11 9.11c.39.39 1.02.39 1.41 0l2.3-2.3c.4-.38.4-1.01 0-1.41zm-3 1.6-9.46-9.46c-.61.45-1.29.72-2 .82-1.36.2-2.79-.21-3.83-1.25C3.37 9.76 2.93 8.5 3 7.26l3.09 3.09 4.24-4.24-3.09-3.09c1.24-.07 2.49.37 3.44 1.31a4.469 4.469 0 0 1 1.24 3.96 4.35 4.35 0 0 1-.88 1.96l9.45 9.45-.88.89z"/>`),
  mieigiri: ic(`<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>`),
  impostazioni: ic(`<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>`),
  mercatino: ic(`<path d="M15.55 13c.75 0 1.41-.41 1.75-1.03l3.58-6.49A.996.996 0 0 0 20.01 4H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7l1.1-2h7.45zM6.16 6h12.15l-2.76 5H8.53L6.16 6zM7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>`)
};
/** Home: un tasto per ogni scheda; un tap apre la scheda. «Modifica»: occhio = mostra/nascondi la scheda dalla barra,
 * stella = scheda su cui si apre il calendario (default la Home). Come nell'app. */
/** Trail (colore = difficoltà) e zone per il 3D: servono agli occhi Z/T/N/P anche quando si apre il 3D dal proprio GPX. */
function area3DExtra() {
  const tf = diffScale() === "trailforks";
  const cols = tf ? { s0: "#9E9E9E", s1: "#2E8B3D", s2: "#2980B9", s3: "#D32F2F", s4: "#111111", s5: "#E8720C" }
                  : { s0: "#9E9E9E", s1: "#27AE60", s2: "#2980B9", s3: "#E74C3C", s4: "#111111", s5: "#111111" };
  const trails = (state.trails || []).filter((t) => t.path).map((t) => ({ name: t.name, color: cols[t.difficulty] || "#9E9E9E", closed: t.status === "closed", path: polyDec(t.path) }));
  const zones = (state.zoneList || []).map((z) => ({ name: z.zone, pts: z.pts, builders: z.builders || [] }));
  return { trails, zones };
}

function wireHome() {
  const bar = [...document.querySelectorAll(".tabs button")];
  const hid = LS.hiddenTabs();
  bar.forEach((b) => { b.hidden = b.dataset.tab !== "home" && b.dataset.tab !== state.tab && hid.includes(b.dataset.tab); });
  const box = $("#homeBox");
  if (!box) return;
  const tabs = bar.map((b) => ({ id: b.dataset.tab, label: b.textContent.trim() })).filter((x) => x.id !== "home");
  if (!tabs.length) return;
  const edit = !!state.homeEdit, start = LS.startTab();
  const label = (id) => { const x = tabs.find((y) => y.id === id); return x ? x.label.charAt(0) + x.label.slice(1).toLowerCase() : ""; };
  const starSvg = (on) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  const tile = (x) => {
    const off = hid.includes(x.id);
    return `<div class="home-cell${off ? " off" : ""}">
      <button class="home-tile" data-go="${x.id}" ${edit ? "disabled" : ""}><span class="home-ic">${HOME_ICONS[x.id] || "•"}</span><span>${esc(label(x.id))}</span></button>
      ${edit ? `<button class="home-eye" data-eye="${x.id}" title="Mostra o nascondi">${eyeSvg(off)}</button>` : ""}
      ${edit && !off ? `<button class="home-star" data-star="${x.id}" title="Apri all'avvio">${starSvg(start === x.id)}</button>` : ""}
    </div>`;
  };
  const list = edit ? tabs : tabs.filter((x) => !hid.includes(x.id));
  box.innerHTML = `
    <div class="home-top"><span class="muted small">${edit ? "Occhio: mostra o nascondi · Stella: scheda all'avvio" : ""}</span>
      <button class="btn ghost home-editbtn" id="homeEdit" title="Modifica schede">${edit ? "Fine" : "✎"}</button></div>
    <div class="home-grid" style="--rows:${Math.ceil(list.length / (window.innerWidth >= 700 ? 3 : 2))}">${list.map(tile).join("")}</div>
    ${edit ? `<button class="btn ghost block" id="homeStartHome" style="margin-top:10px" ${start === "home" ? "disabled" : ""}>${start === "home" ? "★ " : "☆ "}Apri all'avvio sulla Home</button>` : ""}`;
  box.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => { state.tab = b.dataset.go; renderCalendar(); });
  box.querySelectorAll("[data-eye]").forEach((b) => b.onclick = () => {
    const id = b.dataset.eye, cur = LS.hiddenTabs();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    LS.setHiddenTabs(next);
    if (next.includes(id) && LS.startTab() === id) LS.setStartTab("home");
    wireHome();
  });
  box.querySelectorAll("[data-star]").forEach((b) => b.onclick = () => { LS.setStartTab(LS.startTab() === b.dataset.star ? "home" : b.dataset.star); wireHome(); });
  $("#homeStartHome") && ($("#homeStartHome").onclick = () => { LS.setStartTab("home"); wireHome(); });
  $("#homeEdit").onclick = () => { state.homeEdit = !state.homeEdit; wireHome(); };
}

function wireCalendarTabBody(t) {
  wireHome();
  $$("[data-aedit]").forEach((b) => b.onclick = () => openAnnouncementEdit(state.announcements.find((x) => x.id === b.dataset.aedit)));
  $$("[data-adel]").forEach((b) => b.onclick = async () => {
    if (!confirm("Eliminare questo avviso?")) return;
    await deleteDoc(doc(db, "calendars", state.code, "announcements", b.dataset.adel));
  });
  if (state.tab === "mese") {
    $$("[data-mnav]").forEach((b) => b.onclick = () => { state.monthOffset = (state.monthOffset || 0) + (+b.dataset.mnav); renderCalendar(); });
    $$(".month-ev").forEach((x) => x.onclick = () => {
      const e = state.events.find((y) => y.id === x.dataset.id);
      if (e) openEventDetail(e);
    });
    return;
  }
  if (state.tab === "contatti") { wireContacts({ db, user: state.user, code: t.code, modal, toast, esc, canEdit: editEnabled(), logoData: t.logoData || "", logoColor: dotColor(t.code, t.logoColor), sources: () => myCalendars() }); return; }
  if (state.tab === "officina") { wireWorkshop({ db, user: state.user, modal, toast, esc }); return; }
  if (state.tab === "mercatino") { wireMarket({ db, user: state.user, code: t.code, modal, toast, esc, canEdit, blocked: () => state.myBlock }); return; }
  if (state.tab === "calendari") {
    const recents = LS.recents();
    Promise.all([
      myCalendars(),
      Promise.all(recents.map((r) =>
        getDoc(doc(db, "calendars", r.code)).then((s) => s.exists() ? { code: r.code, ...s.data() } : { code: r.code, name: r.name })
      )),
      allCalendars(),
    ]).then(([mine, recentCals, publics]) => {
      // Un calendario può comparire in più fonti (es. un tuo calendario è anche recente):
      // dedup per code, un solo elemento per calendario, con l'etichetta della prima fonte
      // in cui compare (priorità: tuoi > recenti > pubblici).
      const seen = new Map();
      const add = (list, group) => list
        .forEach((c) => { if (!seen.has(c.code)) seen.set(c.code, { ...c, group }); });
      // il calendario corrente compare anche lui (come nell'app): sempre per primo, cerchiato
      if (!recentCals.some((c) => c.code === t.code)) recentCals.unshift(t);
      add(mine, "mine");
      add(recentCals, "recent");
      add(publics, "public");
      renderCalListWithStats("#tabCalList", [...seen.values()], { editable: true, showGroup: true });
    });
    return;
  }
  if (state.tab === "trail") {
    if (!state.trailsLoaded) {
      fetchTrails().then((l) => {
        state.trails = l; state.trailsLoaded = true;
        if (state.tab === "trail") { $("#trList").innerHTML = trailListHtml(); wireTrailListHandlers(); }
      }).catch(() => {
        if (state.tab === "trail") $("#trList").innerHTML = `<p class="muted small">Errore di caricamento.</p>`;
      });
    }
    wireTrailListHandlers();
    $("#trQ") && $("#trQ").addEventListener("input", (e) => {
      state.trailQuery = e.target.value;
      $("#trList").innerHTML = trailListHtml();
      wireTrailListHandlers();
    });
    wireTrailMode(() => renderCalendar());
    renderTrailLog();
    return;
  }
  if (state.tab === "mappa") {
    const go = () => buildTrailMap();
    if (!state.trailsLoaded) {
      fetchTrails().then((l) => { state.trails = l; state.trailsLoaded = true; if (state.tab === "mappa") go(); })
        .catch(() => { if ($("#mapHint")) { $("#mapHint").hidden = false; $("#mapHint").textContent = "Errore di caricamento."; } });
    } else go();
    renderTrailLog();
    return;
  }
  $$(".event-card").forEach((c) => {
    c.onclick = () => {
      const list = state.tab === "epici" ? state.epics : state.events;
      const e = list.find((x) => x.id === c.dataset.id);
      if (!e) return;
      openEventDetail(e, { isEpic: state.tab === "epici" });
    };
  });
}

/** Grassetto **...** e URL auto-linkati, allineato a RichText.kt. */
function richText(text) {
  let out = esc(text || "");
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="accent">$1</a>');
  return out.replace(/\n/g, "<br>");
}

// ─────────────────────────────────────────────────────────────
// Dettaglio evento
// ─────────────────────────────────────────────────────────────
/** Commenti sulla scheda di un'uscita (prossima o passata): leggono e scrivono solo gli utenti
 * loggati. Collezione calendars/{code}/events/{id}/comments. L'autore modifica/elimina i propri,
 * i collaboratori del calendario possono eliminare qualsiasi commento. */
function wireEventComments(w, e) {
  const box = w.querySelector("#evComments");
  if (!box) return;
  if (!state.user) {
    box.innerHTML = `<b>Commenti</b><p class="muted small" style="margin-top:6px">Accedi con Google per leggere e scrivere i commenti.</p>`;
    return;
  }
  const col = collection(srcEventRef(e), "comments");
  box.innerHTML = `
    <b>Commenti <span id="evCmCount"></span></b>
    <div id="evCmList" style="margin:8px 0"><div class="spin"></div></div>
    <div class="row gap" style="align-items:flex-end">
      <textarea id="evCmText" maxlength="1000" rows="2" placeholder="Scrivi un commento…" style="flex:1"></textarea>
      <button class="btn" id="evCmSend">Invia</button>
    </div>`;
  const list = box.querySelector("#evCmList");
  const me = state.user;
  const unsub = onSnapshot(query(col, orderBy("createdAtMillis", "asc")), (qs) => {
    box.querySelector("#evCmCount").textContent = qs.size ? `(${qs.size})` : "";
    if (!qs.size) { list.innerHTML = `<p class="muted small">Nessun commento.</p>`; return; }
    list.innerHTML = qs.docs.map((d) => {
      const c = d.data();
      const mine = c.authorUid === me.uid;
      const when = new Date(c.createdAtMillis || 0).toLocaleString(window.GC_LOCALE, { dateStyle: "short", timeStyle: "short" });
      return `<div class="ev-cm" data-id="${esc(d.id)}" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <div class="row between center small"><span><b>${esc(c.authorName || "Utente")}</b> <span class="muted">${esc(when)}${c.editedAtMillis ? " · modificato" : ""}</span></span>
          <span>${mine ? `<button class="icon-btn" data-edit title="Modifica">✏️</button>` : ""}${mine || (canEdit() && !e.fromCode) ? `<button class="icon-btn" data-del title="Elimina">🗑️</button>` : ""}</span></div>
        <div class="ev-cm-text" style="white-space:pre-wrap;margin-top:2px">${esc(c.text || "")}</div></div>`;
    }).join("");
    list.querySelectorAll(".ev-cm").forEach((row) => {
      const id = row.dataset.id;
      const del = row.querySelector("[data-del]");
      if (del) del.onclick = async () => {
        if (!confirm("Eliminare il commento?")) return;
        try { await deleteDoc(doc(col, id)); } catch (err) { toast("Impossibile eliminare: " + err.message); }
      };
      const ed = row.querySelector("[data-edit]");
      if (ed) ed.onclick = async () => {
        const cur = qs.docs.find((d) => d.id === id)?.data().text || "";
        const t = prompt("Modifica commento", cur);
        if (t == null || !t.trim() || t.trim() === cur) return;
        try { await updateDoc(doc(col, id), { text: t.trim().slice(0, 1000), editedAtMillis: Date.now() }); }
        catch (err) { toast("Impossibile modificare: " + err.message); }
      };
    });
  }, (err) => { list.innerHTML = `<p class="muted small">Commenti non disponibili (${esc(err.code || err.message)}).</p>`; });
  const send = box.querySelector("#evCmSend"), ta = box.querySelector("#evCmText");
  send.onclick = async () => {
    const text = ta.value.trim();
    if (!text) return;
    send.disabled = true;
    try {
      await addDoc(col, { authorUid: me.uid, authorName: me.displayName || (me.email || "").split("@")[0] || "Utente", text: text.slice(0, 1000), createdAtMillis: Date.now() });
      ta.value = "";
    } catch (err) { toast("Impossibile inviare: " + err.message); }
    send.disabled = false;
  };
  // chiude il listener quando la scheda sparisce dal DOM
  const mo = new MutationObserver(() => { if (!w.isConnected) { unsub(); mo.disconnect(); } });
  mo.observe(document.body, { childList: true });
}

async function openEventDetail(e, opts = {}) {
  const isEpic = !!opts.isEpic;
  const col = isEpic ? "epics" : "events";
  // L'audio non è più nel documento evento (limite 1 MiB Firestore condiviso con foto/GPX,
  // stesso motivo del refactoring lato app Android): va letto a parte dal sub-documento
  // separato solo se hasAudio è true, per non fare una lettura extra su ogni evento senza audio.
  let audioData = e.audioData || "", audioMimeType = e.audioMimeType || "";
  if (e.hasAudio && !audioData) {
    try {
      const snap = await getDoc(e.fromCode ? doc(db, "calendars", e.fromCode, "events", e.srcId, "audio", "clip") : doc(db, "calendars", state.code, col, e.id, "audio", "clip"));
      if (snap.exists()) { audioData = snap.data().audioData || ""; audioMimeType = snap.data().audioMimeType || ""; }
    } catch (err) { console.warn("audio fetch failed", err); }
  }
  const gpxTrack = { current: null };
  const rows = [];
  if (e.localita) rows.push({ ic: "📍", l: "Località", v: e.localita, weather: !isEpic });
  if (e.proponente) rows.push({
    ic: "👤", l: isEpic ? "Autore" : "Proponente", v: e.proponente,
    href: !isEpic && e.waProponente ? `https://wa.me/${e.waProponente.replace(/[^\d+]/g, "")}` : null, action: "WhatsApp",
  });
  if (e.ritrovo) rows.push({
    ic: "🅿️", l: /^https?:\/\//.test(e.ritrovo) ? "Parcheggio" : "Ritrovo", v: e.ritrovo,
    // Link al parcheggio: si apre con l'app di navigazione scelta (Google Maps, Waze, Apple Maps), non solo Maps.
    navUrl: /^https?:\/\//.test(e.ritrovo) ? e.ritrovo : null,
    hideValueIfLink: true,
  });
  if (e.linkPercorso) {
    const pn = platformName(e.linkPercorso);
    rows.push({ ic: "🔗", l: pn ? `Percorso ${pn}` : "Percorso", v: e.linkPercorso, href: safeUrl(e.linkPercorso), hideValueIfLink: !!safeUrl(e.linkPercorso), action: "Apri" });
  }
  if (e.gpxData) rows.push({ ic: "🗺️", l: "Mappa", v: "Vedi traccia GPX", gpxAction: true });
  if (e.gpxData) rows.push({ ic: "⬇️", l: "Traccia GPX", v: "Scarica traccia GPX", gpxDownload: true });
  if (e.link2) {
    const pn = platformName(e.link2);
    rows.push({ ic: "🔗", l: pn || "Altro link", v: e.link2, href: safeUrl(e.link2), hideValueIfLink: !!safeUrl(e.link2), action: "Apri" });
  }
  if (e.video) {
    const pn = platformName(e.video);
    rows.push({ ic: "🎥", l: pn ? `Video ${pn}` : "Video", v: e.video, href: safeUrl(e.video), hideValueIfLink: !!safeUrl(e.video), action: "Apri" });
  }

  const start = parseStart(e);
  const photo = e.photoData || e.cardBgData;
  // "Io" = nome del profilo Google (priorità, come nell'app Android) oppure il nome salvato nel browser.
  const mine = myNames();
  const myName = mine.find((n) => (e.partecipanti || []).includes(n)) || mine[0] || "";
  const already = mine.some((n) => (e.partecipanti || []).includes(n));
  const maybeName = mine.find((n) => (e.forse || []).includes(n));
  const isMaybe = !already && !!maybeName;

  const w = modal(`
    <button class="icon-btn" id="detClose" style="position:absolute;top:10px;right:10px;z-index:1" title="Chiudi">✕</button>
    ${!isEpic && state.user && !e.fromCode && !canEdit() && state.calendar?.listed !== false ? `<button class="icon-btn" id="detLinkMine" style="position:absolute;top:10px;right:52px;z-index:1" title="Collega questo evento in un mio calendario">🔗</button>` : ""}
    ${photo ? `<div style="position:relative">
      <img src="data:image/jpeg;base64,${b64(photo)}" class="det-photo" id="detPhoto">
      ${audioData ? `<button class="icon-btn" id="detAudio" style="position:absolute;bottom:22px;right:8px" title="Audio">▶️</button>` : ""}
    </div>` : ""}
    ${audioData && !photo ? `<button class="icon-btn" id="detAudio" title="Audio">▶️</button>` : ""}
    <h3>${esc(e.titolo || "Uscita")} ${diffBadge(e.difficolta)}</h3>
    ${e.fromCode ? `<div class="det-row" style="background:var(--surf2,rgba(120,120,120,.15));border-radius:10px;padding:8px 10px"><span style="display:inline-flex;align-items:center;gap:8px"><span class="ec-from-logo" style="width:26px;height:26px;background:${dotColor(e.fromCode, e.fromLogoColor)}">${e.fromLogoData ? `<img src="data:image/*;base64,${esc(e.fromLogoData)}" alt="">` : ""}</span><b>Evento del calendario ${esc(e.fromName || e.fromCode)}</b></span>${editEnabled() ? `<button class="btn ghost" id="btnUnlink" style="margin-left:auto">Rimuovi</button>` : ""}</div>` : ""}
    ${!isEpic && e.annullata ? `<div class="det-cancelled">🚫 USCITA ANNULLATA</div>` : ""}
    ${!isEpic ? `
    <div class="det-row">
      <span class="det-ic">🗓️</span>
      <div style="flex:1"><div class="lbl">Data e ora</div><div>${esc(e.data)}${weekdayLabel(e.data) ? " " + weekdayLabel(e.data) : ""}${e.ora ? "  ·  " + esc(e.ora) : ""}${e.durataGiorni > 1 ? "  ·  " + e.durataGiorni + " giorni" : ""}</div></div>
      ${start != null ? `<button class="icon-btn" id="addCal" title="Aggiungi al calendario">＋</button>` : ""}
    </div>` : ""}
    ${rows.map((r, i) => `
      <div class="det-row">
        <span class="det-ic">${r.ic}</span>
        <div style="flex:1">
          <div class="lbl">${esc(r.l)}</div>
          ${!r.hideValueIfLink ? `<div>${esc(r.v)}</div>` : ""}
          ${r.href ? `<a href="${esc(r.href)}" target="_blank" rel="noopener" class="det-link">${esc(r.action || "Apri")}</a>` : ""}
          ${r.navUrl ? `<a href="#" class="det-link navLink" data-url="${esc(r.navUrl)}">Apri</a>` : ""}
          ${r.weather ? `<a href="#" class="det-link" id="wLink">Vedi meteo</a>` : ""}
          ${r.gpxAction ? `<a href="#" class="det-link" id="gpxLink">Apri mappa</a>` : ""}
          ${r.gpxDownload ? `<a href="#" class="det-link" id="gpxDownloadLink">Scarica</a>` : ""}
        </div>
      </div>`).join("")}
    ${e.trailZone ? `<div class="det-row"><span class="det-ic">🚵</span><div style="flex:1" id="evTrails"><div class="lbl">${esc(tr("Trail"))} – ${esc(e.trailZone)}</div><div class="muted small">…</div></div></div>` : ""}
    ${e.note ? `<div class="det-row"><span class="det-ic">📝</span><div style="flex:1">${isEpic ? `<div class="lbl">Descrizione</div>` : ""}${richText(e.note)}</div></div>` : ""}
    ${!isEpic ? `
    <hr style="border:0;border-top:1px solid var(--border);margin:14px 0">
    <div class="ev-who">
      ${(e.partecipanti || []).length ? `<div class="ev-who-h">${esc(tr("Partecipanti")).toUpperCase()} (${e.partecipanti.length})</div>
        <div class="ev-chips">${e.partecipanti.map((n) => `<div class="ev-name">${e.partecipanti.length > 1 ? "•&nbsp; " : ""}${esc(n)}</div>`).join("")}</div>` : ""}
      ${(e.forse || []).length ? `<div class="ev-who-h" style="opacity:.8">${esc(tr("Forse")).toUpperCase()} (${e.forse.length})</div>
        <div class="ev-chips">${e.forse.map((n) => `<div class="ev-name maybe">${e.forse.length > 1 ? "•&nbsp; " : ""}${esc(n)}</div>`).join("")}</div>` : ""}
      ${!(e.partecipanti || []).length && !(e.forse || []).length ? `<p class="muted small" style="margin:0 0 6px">Nessuno ancora: sii il primo!</p>` : ""}
      <div class="ev-who-btns">
        ${already
          ? `<button class="btn" id="btnLeave">${esc(tr("Non partecipo più")).toUpperCase()}</button><button class="btn" id="btnMaybe">${esc(tr("Forse")).toUpperCase()}</button>`
          : `<button class="btn" id="btnJoin">＋ ${esc(tr("Partecipa")).toUpperCase()}</button>${isMaybe ? `<button class="btn" id="btnLeave">${esc(tr("Non più forse")).toUpperCase()}</button>` : `<button class="btn" id="btnMaybe">${esc(tr("Forse")).toUpperCase()}</button>`}`}
      </div>
    </div>
    <hr style="border:0;border-top:1px solid var(--border);margin:14px 0">
    <div id="evComments"></div>` : ""}
    <div class="row end gap" style="margin-top:16px">
      ${!isEpic ? `<button class="btn ghost" id="btnShare">Condividi testo</button><button class="btn ghost" id="btnShareLink">🔗 Condividi link</button>` : ""}
      ${!isEpic && state.user ? `<button class="btn ghost" id="btnClone" title="Clona in un mio calendario">Clona</button>` : ""}
      ${!isEpic && editEnabled() && !e.fromCode ? `<button class="btn ghost" id="btnAddEpic" title="Aggiungi a Epici">⭐ Epici</button>` : ""}
      ${isEpic && editEnabled() ? `<button class="btn ghost" id="btnPlanEpic">Pianifica</button>` : ""}
      ${editEnabled() && !e.fromCode ? `<button class="btn" id="btnEditEvent">Modifica</button>` : ""}
      <button class="btn ghost" data-close>Chiudi</button>
    </div>
  `);
  if (!isEpic) wireEventComments(w, e);
  if (e.trailZone) renderEventTrails(w.querySelector("#evTrails"), e.trailZone);
  w.querySelector(".modal").classList.add("modal-xl"); // su desktop il dettaglio scheda è più largo (vedi style.css)
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#detClose").onclick = () => w.remove();
  // 🔗 in alto: collega questo evento (di un calendario pubblico non mio) dentro uno dei miei calendari, in sola lettura
  w.querySelector("#detLinkMine") && (w.querySelector("#detLinkMine").onclick = () => openLinkToMineDialog(e, state.code));
  w.querySelectorAll(".navLink").forEach((a) => a.onclick = (ev) => { ev.preventDefault(); openNavigation(a.dataset.url); });
  w.querySelector("#detPhoto") && (w.querySelector("#detPhoto").onclick = () => {
    stopDetAudio();
    openPhotoViewer(photo, audioData, audioMimeType, { skipAutoplay: true });
  });
  // Autoplay qui (apertura scheda), non nel viewer a tutto schermo aperto dalla foto: se
  // l'utente apre poi anche la foto, il viewer non riparte da capo una seconda riproduzione
  // sovrapposta a questa — stessa scelta fatta nell'app Android.
  let detAudioEl = null;
  const detAudioBtn = w.querySelector("#detAudio");
  if (audioData && detAudioBtn) {
    detAudioEl = new Audio(`data:${audioMimeType || "audio/mp4"};base64,${audioData}`);
    detAudioEl.onended = () => { detAudioBtn.textContent = "▶️"; };
    detAudioBtn.onclick = (ev) => {
      ev.stopPropagation();
      if (detAudioEl.paused) { detAudioEl.play().catch(() => {}); detAudioBtn.textContent = "⏹️"; }
      else { detAudioEl.pause(); detAudioEl.currentTime = 0; detAudioBtn.textContent = "▶️"; }
    };
    if (LS.audioAutoplay()) {
      detAudioEl.play().then(() => { detAudioBtn.textContent = "⏹️"; }).catch(() => {});
    }
  }
  const stopDetAudio = () => { if (detAudioEl) { detAudioEl.pause(); detAudioEl.src = ""; } };
  w.querySelector("[data-close]").addEventListener("click", stopDetAudio);
  w.querySelector("#detClose").addEventListener("click", stopDetAudio);
  w.querySelector("#addCal") && (w.querySelector("#addCal").onclick = () => downloadIcs(e, start));
  w.querySelector("#btnShare") && (w.querySelector("#btnShare").onclick = () => {
    shareOrCopy({ title: e.titolo || tr("Uscita in bici"), text: shareText(e), url: eventShareUrl(e) }, "Testo copiato negli appunti");
  });
  w.querySelector("#btnShareLink") && (w.querySelector("#btnShareLink").onclick = () => {
    shareLinkOnly(e.titolo || tr("Uscita in bici"), eventShareUrl(e));
  });
  w.querySelector("#btnUnlink") && (w.querySelector("#btnUnlink").onclick = async () => {
    try { await deleteDoc(doc(db, "calendars", state.code, "links", e.linkId)); w.remove(); toast("Collegamento rimosso"); } catch (err) { toast("Operazione non riuscita."); }
  });
  w.querySelector("#btnEditEvent") && (w.querySelector("#btnEditEvent").onclick = () => {
    w.remove();
    openEventDialog(e, { isEpic });
  });
  w.querySelector("#wLink") && (w.querySelector("#wLink").onclick = (ev) => { ev.preventDefault(); openWeatherDialog(e); });
  w.querySelector("#gpxLink") && (w.querySelector("#gpxLink").onclick = async (ev) => {
    ev.preventDefault();
    const xml = await decompressGpx(e.gpxData);
    if (!xml) { toast("Traccia GPX non valida"); return; }
    const track = parseGpx(xml);
    if (!track) { toast("Traccia GPX non valida"); return; }
    openGpxMap(track, e.titolo);
  });
  w.querySelector("#gpxDownloadLink") && (w.querySelector("#gpxDownloadLink").onclick = (ev) => {
    ev.preventDefault();
    openGpxDownloadMenu(e);
  });
  w.querySelector("#btnJoin") && (w.querySelector("#btnJoin").onclick = () => openParticipateDialog(e, w, opts, "yes"));
  w.querySelector("#btnMaybe") && (w.querySelector("#btnMaybe").onclick = () => {
    // Con un nome già noto la risposta è immediata, altrimenti si chiede (stesso dialog di «Partecipa»).
    const nm = (mine[0] || "").trim();
    if (nm) setParticipation(e, nm, "maybe", w, opts); else openParticipateDialog(e, w, opts, "maybe");
  });
  w.querySelector("#btnLeave") && (w.querySelector("#btnLeave").onclick = () => setParticipation(e, isMaybe ? maybeName : myName, "no", w, opts));
  // "Clona in un mio calendario": disponibile per chiunque sia loggato, anche su un
  // calendario dove non è editor — la scrittura avviene solo sul calendario di destinazione
  // scelto, dove deve essere editor/owner (verificato lato client e dalle Firestore rules).
  w.querySelector("#btnClone") && (w.querySelector("#btnClone").onclick = () => {
    openCloneEventDialog(e, state.code);
  });
  // "Aggiungi a Epici": CLONA l'evento (normale) nella collection epics/ dello stesso
  // calendario — l'originale resta intatto, mai spostato.
  w.querySelector("#btnAddEpic") && (w.querySelector("#btnAddEpic").onclick = () => {
    openAddToEpicsConfirm(e);
  });
  // "Pianifica": da una scheda Epici, apre l'editor di un evento NUOVO precompilato con
  // questi dati e data/ora vuote — l'epico originale resta intatto.
  w.querySelector("#btnPlanEpic") && (w.querySelector("#btnPlanEpic").onclick = async () => {
    let planAudioData = audioData, planAudioMimeType = audioMimeType;
    w.remove();
    openEventDialog({ ...e, id: "", data: "", ora: "", partecipanti: [], audioData: planAudioData, audioMimeType: planAudioMimeType }, { isNewFrom: true });
  });
}

function openPhotoViewer(base64, audioData, audioMimeType, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "map-modal-bg";
  // Pulsante in basso a destra sulla foto — stessa posizione scelta nell'app Android.
  wrap.innerHTML = `<img src="data:image/jpeg;base64,${b64(base64)}" style="width:100%;height:100%;object-fit:contain">
    <button class="icon-btn map-close" style="position:absolute;top:12px;right:12px" id="pvClose">✕</button>
    ${audioData ? `<button class="icon-btn" id="pvAudio" style="position:absolute;bottom:20px;right:20px;font-size:34px;width:72px;height:72px">▶️</button>` : ""}`;
  let audioEl = null;
  const audioBtn = wrap.querySelector("#pvAudio");
  if (audioData) {
    audioEl = new Audio(`data:${audioMimeType || "audio/mp4"};base64,${audioData}`);
    audioEl.onended = () => { audioBtn.textContent = "▶️"; };
    audioBtn.onclick = () => {
      if (audioEl.paused) { audioEl.play().catch(() => {}); audioBtn.textContent = "⏹️"; }
      else { audioEl.pause(); audioEl.currentTime = 0; audioBtn.textContent = "▶️"; }
    };
    // skipAutoplay: l'audio è già partito aprendo la scheda (vedi openEventDetail), evita
    // di far ripartire una seconda riproduzione sovrapposta aprendo poi anche la foto.
    if (LS.audioAutoplay() && !opts.skipAutoplay) {
      audioEl.play().then(() => { audioBtn.textContent = "⏹️"; }).catch(() => {});
    }
  }
  const close = () => { if (audioEl) { audioEl.pause(); audioEl.src = ""; } wrap.remove(); };
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("#pvClose").onclick = close;
  document.body.appendChild(wrap);
}

/** Link diretto alla scheda evento sul sito web: apre il calendario e mostra subito questo
 * dettaglio, anche per chi non ha l'app installata (es. iOS). */
function eventShareUrl(e) {
  return `${location.origin}${location.pathname}#/c/${e.fromCode || state.code}/${e.fromCode ? e.srcId : e.id}`;
}

// ── App di navigazione per il parcheggio (Google Maps / Waze / Apple Maps) ──
const NAV_PREF_KEY = "gc_nav_app"; // ask | maps | waze | apple
function navParseCoords(url) {
  const cands = [url];
  const m = /[?&]continue=([^&]+)/.exec(url); if (m) { try { cands.push(decodeURIComponent(m[1])); } catch {} }
  for (const c of cands) for (const re of [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query|destination|daddr|center)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/]) {
    const x = re.exec(c); if (x) return [parseFloat(x[1]), parseFloat(x[2])];
  }
  return null;
}
async function navResolve(url) {
  let c = navParseCoords(url);
  if (c) return c;
  if (/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.)?google\.[a-z.]+\/maps)/i.test(url)) {
    try { const r = await fetch("/api/resolve?u=" + encodeURIComponent(url)); const j = await r.json(); c = navParseCoords(j.url || ""); } catch {}
  }
  return c;
}
function navTarget(app, url, c) {
  if (!c) return url;
  if (app === "waze") return `https://waze.com/ul?ll=${c[0]},${c[1]}&navigate=yes`;
  if (app === "apple") return `https://maps.apple.com/?daddr=${c[0]},${c[1]}`;
  return url;
}
async function launchNav(app, url) {
  // finestra aperta subito (consentito dal tocco), indirizzata dopo la risoluzione del link
  const win = app === "maps" ? null : window.open("about:blank", "_blank");
  if (app === "maps") { window.open(url, "_blank", "noopener"); return; }
  const c = await navResolve(url);
  if (!c) toast("Coordinate non trovate nel link: apro il link originale");
  const target = navTarget(app, url, c);
  if (win) win.location.href = target; else location.href = target;
}
function openNavigation(url, title) {
  const pref = localStorage.getItem(NAV_PREF_KEY) || "ask";
  if (pref !== "ask") { launchNav(pref, url); return; }
  const apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  const m = modal(`<h3>${esc(title || "Apri il parcheggio con")}</h3>
    <div class="row gap" style="flex-direction:column;align-items:stretch">
      <button class="btn" data-nav="maps">Google Maps</button>
      <button class="btn" data-nav="waze">Waze</button>
      ${apple ? `<button class="btn" data-nav="apple">Apple Maps</button>` : ""}
    </div>
    <label class="row gap center small" style="margin:12px 0 4px"><input type="checkbox" id="navRem" style="width:auto;margin:0"> Ricorda la scelta (modificabile dal menu)</label>
    <div class="row end"><button class="btn ghost" data-close>Annulla</button></div>`);
  m.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => {
    if (m.querySelector("#navRem").checked) localStorage.setItem(NAV_PREF_KEY, b.dataset.nav);
    m.remove(); launchNav(b.dataset.nav, url);
  });
}
function openNavPrefDialog() {
  const cur = localStorage.getItem(NAV_PREF_KEY) || "ask";
  const opts = [["ask", "Chiedi ogni volta"], ["maps", "Google Maps"], ["waze", "Waze"], ["apple", "Apple Maps"]];
  const m = modal(`<h3>App di navigazione</h3><p class="muted small">Usata aprendo il parcheggio di un evento.</p>
    <div class="theme-grid">${opts.map(([id, l]) => `<button class="theme-opt ${id === cur ? "sel" : ""}" data-v="${id}">${l}</button>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  m.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => { localStorage.setItem(NAV_PREF_KEY, b.dataset.v); m.remove(); toast("Salvato"); });
}

/** Condivisione robusta: menu di sistema (Web Share) se c'è; altrimenti, o se fallisce, copia negli appunti
 * (Clipboard API, poi execCommand per i browser/webview che la negano); come ultima risorsa mostra il testo
 * da copiare a mano. Prima i fallimenti erano silenziosi e il tasto sembrava "non fare niente". */
/** Condivisione "solo link": il menu di condivisione del sistema con il solo indirizzo della pagina (altrimenti lo copia). */
async function shareLinkOnly(title, url) {
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("Link copiato negli appunti"); }
  catch { prompt("Link", url); }
}
window.gcShareLinkOnly = shareLinkOnly;

async function shareOrCopy(data, okMsg) {
  const text = data.text;
  if (navigator.share) {
    try {
      // Il testo contiene già il link (shareText); non si ripete l'url a parte per non averlo doppio.
      await navigator.share({ title: data.title, text });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // l'utente ha chiuso il menu: nessun messaggio
      // altri errori: si prosegue con la copia
    }
  }
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); ta.remove();
    if (ok) { toast(okMsg); return; }
  } catch {}
  const m = modal(`<h3>Copia il testo</h3><textarea id="shTxt" rows="8" readonly style="width:100%">${esc(text)}</textarea>
    <div class="row end" style="margin-top:10px"><button class="btn" data-close>Chiudi</button></div>`);
  const ta2 = m.querySelector("#shTxt"); ta2.focus(); ta2.select();
}

function shareText(e) {
  const lines = [e.titolo || tr("Uscita in bici"), ""];
  if (e.data) lines.push(`${e.data}${e.ora ? "  ·  " + e.ora : ""}${e.durataGiorni > 1 ? "  ·  " + e.durataGiorni + " giorni" : ""}`);
  if (e.localita) lines.push(`📍 ${e.localita}`);
  if (e.ritrovo) lines.push(tr(`🅿️ Ritrovo: ${e.ritrovo}`));
  if (e.proponente) lines.push(tr(`👤 Proposto da ${e.proponente}`));
  if (e.linkPercorso) lines.push(`🔗 ${e.linkPercorso}`);
  if (e.link2) lines.push(`🔗 ${e.link2}`);
  if (e.note) lines.push("", e.note);
  lines.push("", eventShareUrl(e));
  return lines.join("\n");
}

function downloadIcs(e, startMillis) {
  const dt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc2 = (s) => (s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const desc = [e.proponente && tr(`Proposta da ${e.proponente}`), e.note].filter(Boolean).join(" · ");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GiroCalendar//IT",
    "BEGIN:VEVENT",
    `UID:${e.id}@girocalendar`,
    `DTSTAMP:${dt(Date.now())}`,
    `DTSTART:${dt(startMillis)}`,
    `DTEND:${dt(startMillis + 3 * 3600e3)}`,
    `SUMMARY:${esc2(e.titolo || tr("Uscita in bici"))}`,
    e.localita ? `LOCATION:${esc2(e.localita)}` : "",
    desc ? `DESCRIPTION:${esc2(desc)}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "uscita.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Decomprime la traccia GPX dell'evento e salva/condivide il file, allineato a
 * EventExport.kt (shareGpx/saveGpxTo) lato app Android: "Scarica" fa un download diretto nel
 * browser, "Condividi" usa la Web Share API (file) se il browser la supporta. */
async function openGpxDownloadMenu(e) {
  const xml = await decompressGpx(e.gpxData);
  if (!xml) { toast("Traccia GPX non valida"); return; }
  const fileName = e.gpxFileName || "traccia.gpx";
  const canShareFile = !!(navigator.canShare && navigator.share &&
    navigator.canShare({ files: [new File([xml], fileName, { type: "application/gpx+xml" })] }));
  const w = modal(`
    <h3>Scarica traccia GPX</h3>
    <div class="menu-list">
      <button id="gpxSave">⬇️ Salva con nome</button>
      ${canShareFile ? `<button id="gpxShare">📤 Condividi</button>` : ""}
    </div>
  `);
  w.querySelector("#gpxSave").onclick = () => {
    const blob = new Blob([xml], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    w.remove();
  };
  w.querySelector("#gpxShare") && (w.querySelector("#gpxShare").onclick = async () => {
    try {
      const file = new File([xml], fileName, { type: "application/gpx+xml" });
      await navigator.share({ files: [file], title: fileName });
    } catch (err) { /* utente ha annullato, o errore silenzioso come per btnShare */ }
    w.remove();
  });
}

/** Nomi con cui riconoscere l'utente: profilo Google (se loggato) e nome salvato nel browser. */
function myNames() {
  const out = [];
  const g = state.user?.displayName?.trim();
  if (g) out.push(g);
  const l = LS.myName().trim();
  if (l && !out.includes(l)) out.push(l);
  return out;
}

/** Risposta di partecipazione in un'unica scrittura: "yes", "maybe" o "no". Il nome sta in al più una lista. */
async function setParticipation(e, name, status, detailEl, detailOpts = {}) {
  await updateDoc(srcEventRef(e), {
    partecipanti: status === "yes" ? arrayUnion(name) : arrayRemove(name),
    forse: status === "maybe" ? arrayUnion(name) : arrayRemove(name),
  });
  const rm = (l) => (l || []).filter((n) => n !== name);
  const upd = {
    ...e,
    partecipanti: status === "yes" ? [...new Set([...rm(e.partecipanti), name])] : rm(e.partecipanti),
    forse: status === "maybe" ? [...new Set([...rm(e.forse), name])] : rm(e.forse),
  };
  if (detailEl) { detailEl.remove(); openEventDetail(upd, detailOpts); }
}

function openParticipateDialog(e, detailEl, detailOpts = {}, status = "yes") {
  const w = modal(`
    <h3>${status === "maybe" ? "Forse" : "Partecipa"}</h3>
    <p class="muted small">Il tuo nome sarà visibile a chi consulta questo calendario.</p>
    <label>Il tuo nome <input id="pName" value="${esc(myNames()[0] || "")}"></label>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="pGo">Conferma</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#pGo").onclick = async () => {
    const name = w.querySelector("#pName").value.trim();
    if (!name) return;
    LS.setMyName(name);
    w.remove();
    await setParticipation(e, name, status, detailEl, detailOpts);
  };
}

// ─────────────────────────────────────────────────────────────
// Meteo dialog
// ─────────────────────────────────────────────────────────────
async function openWeatherDialog(e) {
  const w = modal(`<h3>Meteo — ${esc(e.localita)}</h3><div id="wBody"><div class="spin"></div> Caricamento…</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  const coords = await geocode(e.localita);
  const body = w.querySelector("#wBody");
  if (!coords) { body.innerHTML = `<p class="muted">Previsione non disponibile per questa località.</p>`; return; }
  const forecast = await forecastFor(coords.lat, coords.lon, e.data, e.ora);
  if (!forecast.length) { body.innerHTML = `<p class="muted">Previsione non disponibile (data troppo lontana nel tempo).</p>`; return; }
  const targetHour = parseInt((e.ora || "12").split(":")[0], 10);
  body.innerHTML = `
    <p class="muted small">${esc(e.data)}${weekdayLabel(e.data) ? " " + weekdayLabel(e.data) : ""}${e.ora ? " · " + esc(e.ora) : ""}</p>
    ${forecast.map((f) => `
      <div class="weather-row ${f.hour === targetHour ? "target" : ""}">
        <span class="weather-hour">${String(f.hour).padStart(2, "0")}:00</span>
        <span>${weatherEmoji(f.weatherCode)} ${Math.round(f.temperatureC)}°C  💧${f.precipitationProbability}%  💨${Math.round(f.windSpeedKmh)}km/h</span>
      </div>`).join("")}
  `;
}

// ─────────────────────────────────────────────────────────────
// Mappa GPX (Leaflet + OpenStreetMap, allineato a GpxMapDialog.kt)
// ─────────────────────────────────────────────────────────────
let leafletLoaded = null;
function loadLeaflet() {
  if (leafletLoaded) return leafletLoaded;
  leafletLoaded = new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = resolve;
    document.head.appendChild(script);
  });
  return leafletLoaded;
}

/** Mappa del percorso di un'uscita: stessi sfondi/layer e stessi occhi Z/L/T/N della scheda MAPPA
 * (le scelte sono condivise con quella scheda). Gli sfondi sono sincroni, trail e zone arrivano dopo. */
function attachRouteLayers(map, wrap) {
  const L = window.L;
  const bases = {
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }),
    "Topografica": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors, SRTM, OpenTopoMap (CC-BY-SA)", maxZoom: 17, subdomains: "abc" }),
    "Chiara": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19, className: "tt-light" }),
    "Ciclismo (CyclOSM)": L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors, CyclOSM", maxZoom: 20, subdomains: "abc" }),
    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics", maxZoom: 19 }),
  };
  const ovName = "Percorsi MTB";
  const overlays = { [ovName]: L.tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", { attribution: "&copy; waymarkedtrails.org", maxZoom: 18, opacity: 0.85 }) };
  // Ogni apertura riparte da zero (OpenStreetMap, nessun overlay, occhi Z/L/T/N spenti), senza toccare le scelte della scheda MAPPA.
  bases["OpenStreetMap"].addTo(map);
  const layersCtl = L.control.layers(bases, overlays, { position: "topright", collapsed: true }).addTo(map);
  if (typeof TrailTrace !== "undefined" && TrailTrace.decorateLayers) TrailTrace.decorateLayers(layersCtl);

  const linesGrp = L.layerGroup(), labelsGrp = L.layerGroup();
  const off = { Z: true, L: true, T: true, N: true };
  const eye = (id, letter, off, tShow, tHide) => {
    const b = wrap.querySelector(id); if (!b) return null;
    const paint = () => { b.classList.toggle("on", !off()); b.innerHTML = eyeSvg(off()) + `<b>${letter}</b>`; b.title = off() ? tShow : tHide; };
    paint(); return { b, paint };
  };
  const tB = eye("#rmT", "T", () => off.T, "Mostra i tracciati dei trail", "Nascondi i tracciati dei trail");
  if (tB) tB.b.onclick = () => { off.T = !off.T; if (off.T) map.removeLayer(linesGrp); else linesGrp.addTo(map); tB.paint(); };
  const nB = eye("#rmN", "N", () => off.N, "Mostra i nomi dei trail", "Nascondi i nomi dei trail");
  if (nB) nB.b.onclick = () => { off.N = !off.N; if (off.N) map.removeLayer(labelsGrp); else labelsGrp.addTo(map); nB.paint(); };
  const zB = eye("#rmZ", "Z", () => off.Z, "Mostra le zone", "Nascondi le zone");
  const lB = eye("#rmL", "L", () => off.L, "Mostra i loghi dei costruttori", "Nascondi i loghi dei costruttori");
  // P: punti di interesse (rifugi, fontane, parcheggi…), spenti a ogni apertura come gli altri occhi.
  off.P = true;
  const pB = eye("#rmP", "P", () => off.P, "Mostra i punti di interesse", "Nascondi i punti di interesse");
  if (pB && typeof TrailTrace !== "undefined" && TrailTrace.attachPois) {
    const poisApi = TrailTrace.attachPois(map, { onNavigate: () => {}, onEdit: () => {}, onDelete: () => {} });
    poisApi.setVisible(false);
    pB.b.onclick = () => { off.P = !off.P; poisApi.setVisible(!off.P); pB.paint(); };
    getDocs(collection(db, "pois")).then((qs) => poisApi.set(qs.docs.map((d) => { const x = d.data(); return { id: d.id, name: x.name || "", desc: x.desc || "", type: x.type || "altro", lat: x.lat, lon: x.lon, createdByUid: "", by: "" }; }))).catch(() => {});
  } else if (pB) pB.b.hidden = true;

  (async () => {
    try { if (!state.trails || !state.trails.length) state.trails = await fetchTrails(); } catch {}
    const tf = diffScale() === "trailforks";
    const cols = tf ? { s0: "#9E9E9E", s1: "#2E8B3D", s2: "#2980B9", s3: "#D32F2F", s4: "#111111", s5: "#E8720C" }
                    : { s0: "#9E9E9E", s1: "#27AE60", s2: "#2980B9", s3: "#E74C3C", s4: "#111111", s5: "#111111" };
    (state.trails || []).filter((t) => t.lat != null && t.lon != null).forEach((t) => {
      if (t.path) {
        const p = polyDec(t.path);
        L.polyline(p, { color: "#fff", weight: 8, opacity: 0.85, interactive: false }).addTo(linesGrp);
        L.polyline(p, { color: cols[t.difficulty] || "#9E9E9E", weight: 5, dashArray: t.status === "closed" ? "3 9" : null, interactive: false }).addTo(linesGrp);
      }
      const lbl = document.createElement("div"); lbl.className = "tl-label"; lbl.style.borderColor = DIFF_COLOR[t.difficulty] || "#9E9E9E";
      const dot = document.createElement("i"); dot.style.background = (TRAIL_STATUS[t.status] || TRAIL_STATUS.open).color;
      const tx = document.createElement("span"); tx.textContent = t.name; lbl.append(dot, tx);
      L.marker([t.lat, t.lon], { icon: L.divIcon({ html: lbl, className: "", iconSize: null }), interactive: false }).addTo(labelsGrp);
    });
    if (typeof TrailTrace !== "undefined" && TrailTrace.attachZones) {
      const zonesApi = TrailTrace.attachZones(map, layersCtl, { onZoneTap: () => {} });
      zonesApi.setVisible(false); zonesApi.setBuildersVisible(false);
      if (zB) zB.b.onclick = () => { off.Z = !off.Z; zonesApi.setVisible(!off.Z); zB.paint(); };
      if (lB) lB.b.onclick = () => { off.L = !off.L; zonesApi.setBuildersVisible(!off.L); lB.paint(); };
      try {
        const qs = await getDocs(collection(db, "trailZones")); const zl = [];
        qs.docs.forEach((d) => {
          const zn = d.data().zone || "", ts = (state.trails || []).filter((t) => (t.zone || "").trim() === zn && t.lat != null && t.lon != null);
          zl.push({ id: d.id, zone: zn, pts: polyDec(d.data().polygon || ""), builders: d.data().builders || [],
            center: ts.length ? [ts.reduce((a, t) => a + t.lat, 0) / ts.length, ts.reduce((a, t) => a + t.lon, 0) / ts.length] : null });
        });
        zonesApi.set(zl);
      } catch {}
    }
  })();
}

async function openGpxMap(track, titolo) {
  await loadLeaflet();
  const wrap = document.createElement("div");
  wrap.className = "map-modal-bg";
  wrap.innerHTML = `
    <div id="gpxMap"></div>
    <div class="map-topbar">
      <span class="map-title-chip">${esc(titolo || "Percorso")}</span>
      <button class="icon-btn map-close" id="gmClose">✕</button>
    </div>
    <div class="map-eyes">
      <button id="rmZ" class="icon-btn map-eye"></button><button id="rmL" class="icon-btn map-eye"></button><button id="rmT" class="icon-btn map-eye"></button><button id="rmN" class="icon-btn map-eye"></button><button id="rmP" class="icon-btn map-eye"></button><button id="rmG" class="icon-btn map-eye"></button><button id="rmS" class="icon-btn map-eye"></button>
    </div>
    <div class="map-stats">
      <div><b>📏 ${track.distanceKm.toFixed(1)} km</b><span>Distanza</span></div>
      ${track.minEle != null ? `<div><b>⛰️ ${Math.round(track.minEle)}–${Math.round(track.maxEle)} m</b><span>Quota</span></div>` : ""}
      <div><b>🔺 +${Math.round(track.ascent)} m</b><span>Dislivello +</span></div>
      <div><b>🔻 -${Math.round(track.descent)} m</b><span>Dislivello -</span></div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector("#gmClose").onclick = () => wrap.remove();

  const L = window.L;
  const map = L.map("gpxMap", { zoomControl: false });
  attachRouteLayers(map, wrap);
  const pts = track.points.map((p) => [p.lat, p.lon]);
  const line = L.polyline(pts, { color: "#E8720C", weight: 4 }).addTo(map);
  const startEndGrp = L.layerGroup().addTo(map);
  map.fitBounds(line.getBounds(), { padding: [24, 24] });
  setTimeout(() => map.invalidateSize(), 100);

  const greenIcon = L.divIcon({ html: "🟢", className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
  const redIcon = L.divIcon({ html: "🔴", className: "", iconSize: [24, 24], iconAnchor: [12, 12] });
  L.marker(pts[0], { icon: greenIcon }).addTo(startEndGrp).bindPopup("Partenza");
  L.marker(pts[pts.length - 1], { icon: redIcon }).addTo(startEndGrp).bindPopup("Arrivo");

  const mid = pts[Math.floor(pts.length / 2)];
  const midNext = pts[Math.floor(pts.length / 2) + 1];
  if (mid && midNext && mid !== midNext) {
    const toRad = Math.PI / 180, toDeg = 180 / Math.PI;
    const lat1 = mid[0] * toRad, lat2 = midNext[0] * toRad, dLon = (midNext[1] - mid[1]) * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * toDeg + 360) % 360;
    const arrowIcon = L.divIcon({
      html: `<div style="font-size:22px;transform:rotate(${bearing}deg)">⬆️</div>`,
      className: "", iconSize: [24, 24], iconAnchor: [12, 12],
    });
    L.marker(mid, { icon: arrowIcon }).addTo(startEndGrp);
  }
  // G: la traccia dell'evento; S: partenza, arrivo e freccia di direzione. Accesi di default (a differenza di Z/L/T/N/P).
  const offG = { G: false, S: false };
  const mkEye = (id, letter, key, tShow, tHide, onToggle) => {
    const b = wrap.querySelector(id); if (!b) return;
    const paint = () => { b.classList.toggle("on", !offG[key]); b.innerHTML = eyeSvg(offG[key]) + `<b>${letter}</b>`; b.title = offG[key] ? tShow : tHide; };
    b.onclick = () => { offG[key] = !offG[key]; onToggle(!offG[key]); paint(); };
    paint();
  };
  mkEye("#rmG", "G", "G", "Mostra la traccia", "Nascondi la traccia", (v) => { if (v) line.addTo(map); else map.removeLayer(line); });
  mkEye("#rmS", "S", "S", "Mostra partenza, arrivo e direzione", "Nascondi partenza, arrivo e direzione", (v) => { if (v) startEndGrp.addTo(map); else map.removeLayer(startEndGrp); });
}

// ─────────────────────────────────────────────────────────────
// Dialoghi generici
// ─────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function modal(html, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `<div class="modal ${opts.large ? "modal-lg" : ""} ${opts.xl ? "modal-xl" : ""}">${html}</div>`;
  // sticky: i form lunghi non si chiudono con un clic fuori (perderebbero quanto scritto)
  if (!opts.sticky) wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
  // Ogni [data-close] chiude il modal (gli handler specifici, se presenti, girano comunque).
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
  return wrap;
}

/** «Collega un evento di un altro calendario»: ricerca per parte del nome (calendari pubblici e i miei) o per codice, poi si sceglie l'uscita. */
async function openLinkEventDialog() {
  const w = modal(`<h3>Collega un evento</h3>
    <p class="muted small">Cerca il calendario per parte del nome (o per codice, per i privati) e scegli l'evento: comparirà nel tuo, in sola lettura. I tuoi utenti potranno partecipare e commentare.</p>
    <div class="row gap"><input id="lkQ" placeholder="Nome o codice calendario" style="flex:1"><button class="btn" id="lkGo">Cerca</button></div>
    <div id="lkRes" style="margin-top:10px;max-height:50vh;overflow:auto"></div>
    <div class="row end" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button></div>`);
  const res = w.querySelector("#lkRes");
  let pool = null;
  const showEvents = async (c) => {
    res.innerHTML = `<b>${esc(c.name || c.code)}</b><div class="spin"></div>`;
    try {
      const qs = await getDocs(collection(db, "calendars", c.code, "events"));
      const now = Date.now();
      const evs = qs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => { const t = parseStart(e); return !t || t >= now - 86400000; })
        .sort((a, b) => (parseStart(a) || 0) - (parseStart(b) || 0));
      const linked = new Set(Object.keys(state.linked || {}));
      res.innerHTML = `<b>${esc(c.name || c.code)}</b>` + (evs.length ? evs.map((e) => {
        const done = linked.has(`L:${c.code}:${e.id}`);
        return `<div class="lk-ev" data-id="${esc(e.id)}" style="padding:8px 0;border-bottom:1px solid var(--border);${done ? "opacity:.6" : "cursor:pointer"}"><b>${esc(e.titolo || "Uscita")}</b><div class="muted small">${esc([e.data, e.ora].filter(Boolean).join(" · "))}${done ? " · ✔ già collegato" : ""}</div></div>`;
      }).join("") : `<p class="muted small">Nessuna uscita in programma in quel calendario.</p>`);
      res.querySelectorAll(".lk-ev").forEach((el) => el.onclick = async () => {
        if (linked.has(`L:${c.code}:${el.dataset.id}`)) return;
        try {
          await addDoc(collection(db, "calendars", state.code, "links"), { srcCode: c.code, srcEventId: el.dataset.id, byUid: state.user.uid, atMillis: Date.now() });
          w.remove(); toast("Evento collegato");
        } catch (err) { toast("Collegamento non riuscito: " + (err.message || err)); }
      });
    } catch { res.innerHTML = `<p class="muted small">Calendario non trovato o senza eventi leggibili.</p>`; }
  };
  const go = async () => {
    const q = w.querySelector("#lkQ").value.trim(); if (!q) return;
    res.innerHTML = `<div class="spin"></div>`;
    try {
      if (!pool) {
        const all = (await getDocs(collection(db, "calendars"))).docs.map((d) => ({ code: d.id, ...d.data() }));
        const mine = new Set(((await myCalendars().catch(() => [])) || []).map((c) => c.code));
        pool = all.filter((c) => c.listed || mine.has(c.code));
      }
      const low = q.toLowerCase();
      let found = pool.filter((c) => (c.name || "").toLowerCase().includes(low) || c.code.toLowerCase() === low);
      if (!found.some((c) => c.code.toLowerCase() === low)) {
        const ex = await getDoc(doc(db, "calendars", q.toUpperCase()));
        if (ex.exists()) found = [{ code: ex.id, ...ex.data() }, ...found];
      }
      found = found.filter((c) => c.code !== state.code);
      if (!found.length) { res.innerHTML = `<p class="muted small">Calendario non trovato.</p>`; return; }
      if (found.length === 1) { showEvents(found[0]); return; }
      res.innerHTML = found.slice(0, 40).map((c) => `<div class="lk-cal" data-c="${esc(c.code)}" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer"><b>${esc(c.name || c.code)}</b><div class="muted small">${esc(c.code)}</div></div>`).join("");
      res.querySelectorAll(".lk-cal").forEach((el) => el.onclick = () => showEvents(found.find((c) => c.code === el.dataset.c)));
    } catch (err) { res.innerHTML = `<p class="muted small">Errore di ricerca.</p>`; }
  };
  w.querySelector("#lkGo").onclick = go;
  w.querySelector("#lkQ").addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
  setTimeout(() => w.querySelector("#lkQ").focus(), 50);
}

// Spazio personale online (users/{uid}/rides/{id}, privato): ultimi 10 giri registrati con l'app Android + fino a 3
// file GPX caricati a mano (anche con drag & drop). Ogni file max 2 MB, resta online 30 giorni.
const MYSPACE = { DAYS: 30, MAX_REC: 10, MAX_UP: 10, MAX_FILE: 2 * 1024 * 1024, MAX_B64: 800000 };

/** Legge lo spazio personale: toglie scaduti ed eccedenti (i più vecchi) e restituisce i rimasti, più recenti prima. */
async function mySpaceList(uid) {
  const col = collection(db, "users", uid, "rides");
  const snap = await getDocs(col);
  const now = Date.now();
  const all = snap.docs.map((s) => {
    const d = s.data(), at = d.atMillis || 0;
    return { id: s.id, ref: s.ref, d, at, exp: d.expiresAt?.toMillis?.() ?? (at + MYSPACE.DAYS * 86400000), kind: d.kind || "rec" };
  });
  const keep = [];
  for (const kind of ["rec", "upload"]) {
    const max = kind === "rec" ? MYSPACE.MAX_REC : MYSPACE.MAX_UP;
    const mine = all.filter((x) => x.kind === kind).sort((a, b) => b.at - a.at);
    for (let i = 0; i < mine.length; i++) {
      if (mine[i].exp < now || i >= max) { try { await deleteDoc(mine[i].ref); } catch (e) {} } else keep.push(mine[i]);
    }
  }
  return keep.sort((a, b) => b.at - a.at);
}

/** Carica un GPX nello spazio personale. Restituisce un messaggio per l'utente. */
async function mySpaceUpload(uid, file, current) {
  if (file.size > MYSPACE.MAX_FILE) return "File troppo grande (massimo 2 MB).";
  if (current.filter((x) => x.kind === "upload").length >= MYSPACE.MAX_UP) return `Hai già ${MYSPACE.MAX_UP} file caricati: eliminane uno prima.`;
  const buf = await file.arrayBuffer();
  const head = new TextDecoder().decode(buf.slice(0, 4000));
  if (!/<gpx/i.test(head)) return "Il file non sembra un GPX valido.";
  const z = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let bin = ""; for (let i = 0; i < z.length; i++) bin += String.fromCharCode(z[i]);
  const b64 = btoa(bin);
  if (b64.length > MYSPACE.MAX_B64) return "File troppo grande (massimo 2 MB).";
  const now = Date.now();
  await setDoc(doc(db, "users", uid, "rides", "up_" + now), {
    kind: "upload", name: file.name.replace(/\.gpx$/i, ""), gpxZ: b64, atMillis: now,
    expiresAt: Timestamp.fromMillis(now + MYSPACE.DAYS * 86400000),
  });
  return `File caricato: resta online ${MYSPACE.DAYS} giorni.`;
}

async function openMySpaceDialog(host) {
  const user = auth.currentUser;
  if (!user) { toast("Accedi con Google."); return; }
  const html = `
    <h3>Il mio spazio</h3>
    <p class="muted small">Giri registrati e file GPX tuoi, privati: restano online ${MYSPACE.DAYS} giorni, poi si cancellano da soli. Si vedono anche nell'app.</p>
    <div id="msBody"><div class="spin"></div></div>
    <div id="msDrop" style="margin-top:12px;border:2px dashed var(--border);border-radius:10px;padding:16px;text-align:center;cursor:pointer">
      <b>Carica un GPX</b><div class="muted small">trascina qui il file o tocca per sceglierlo · max 2 MB · fino a ${MYSPACE.MAX_UP} file</div>
      <input type="file" id="msFile" accept=".gpx,application/gpx+xml,text/xml,application/xml" hidden>
    </div>
    <div id="msMsg" class="muted small" style="margin-top:8px"></div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `;
  const w = host ? (host.innerHTML = html, host) : modal(html);
  if (host) host.querySelectorAll("[data-close]").forEach((b) => b.closest(".row")?.remove());   // nella scheda non serve «Chiudi»

  const body = w.querySelector("#msBody"), msg = w.querySelector("#msMsg"), drop = w.querySelector("#msDrop"), inp = w.querySelector("#msFile");
  let items = [];
  const fmt = (ms) => new Date(ms).toLocaleDateString("it-IT");
  const render = () => {
    const sec = (title, list, max) => `<h4 style="margin:14px 0 4px">${title} (${list.length}/${max})</h4>` + (list.length ? list.map((x) => {
      const km = x.d.distM ? ` · ${(x.d.distM / 1000).toFixed(1)} km` : "";
      return `<div style="padding:4px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px"><div style="flex:1;min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.d.name || "GPX")}</b>
        <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(new Date(x.at).toLocaleString("it-IT"))}${km} · scade il ${fmt(x.exp)}</div></div>
        <button class="btn ghost" data-open="${esc(x.id)}" title="Apri sulla mappa" aria-label="Apri sulla mappa" style="font-size:1.05rem;padding:4px 9px">🗺️</button> <button class="btn ghost" data-dl="${esc(x.id)}" title="Scarica" aria-label="Scarica" style="font-size:1.05rem;padding:4px 9px">⬇️</button> <button class="btn ghost" data-del="${esc(x.id)}" title="Elimina" aria-label="Elimina" style="font-size:1.05rem;padding:4px 9px">🗑</button></div>`;
    }).join("") : `<p class="muted small">Nessun elemento</p>`);
    body.innerHTML = sec("Ultimi giri registrati", items.filter((x) => x.kind === "rec"), MYSPACE.MAX_REC) +
      sec("File caricati", items.filter((x) => x.kind === "upload"), MYSPACE.MAX_UP);
    body.querySelectorAll("[data-open]").forEach((b) => b.onclick = async () => {
      const x = items.find((i) => i.id === b.dataset.open);
      const xml = x && await decompressGpx(x.d.gpxZ);
      if (!xml) { toast("File non leggibile."); return; }
      openGpxOnMap(x.d.name || "GPX", xml);
    });
    body.querySelectorAll("[data-dl]").forEach((b) => b.onclick = async () => {
      const x = items.find((i) => i.id === b.dataset.dl);
      const xml = x && await decompressGpx(x.d.gpxZ);
      if (!xml) { toast("File non leggibile."); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
      a.download = (x.d.name || "giro").replace(/[\\/:*?"<>|]/g, "_") + ".gpx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    body.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const x = items.find((i) => i.id === b.dataset.del);
      try { await deleteDoc(x.ref); msg.textContent = "Eliminato."; } catch (e) { msg.textContent = "Eliminazione non riuscita."; }
      reload();
    });
  };
  const reload = async () => {
    try { items = await mySpaceList(user.uid); render(); } catch (e) { body.innerHTML = `<p class="muted small">Impossibile leggere il tuo spazio.</p>`; }
  };
  const upload = async (files) => {
    for (const f of files) {
      try { msg.textContent = await mySpaceUpload(user.uid, f, items); } catch (e) { msg.textContent = "Caricamento non riuscito."; }
      await reload();
    }
  };
  drop.onclick = () => inp.click();
  inp.onchange = () => { upload([...inp.files]); inp.value = ""; };
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.background = "rgba(128,128,128,.12)"; });
  drop.addEventListener("dragleave", () => { drop.style.background = ""; });
  drop.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); drop.style.background = ""; upload([...e.dataTransfer.files]); });
  // un file lasciato per sbaglio fuori dalla zona non deve far aprire il GPX nel browser
  w.addEventListener("dragover", (e) => e.preventDefault());
  w.addEventListener("drop", (e) => { e.preventDefault(); upload([...e.dataTransfer.files]); });
  reload();
}

function openMenu(anchorEl) {
  const owner = isOwner() && state.adminMode;
  const ce = editEnabled();
  const isDesktop = window.matchMedia("(min-width:860px)").matches && anchorEl;
  const w = modal(`
    <h3>Menu</h3>
    <div class="menu-list">
      <button data-act="open-other">Calendari</button>
      <button data-act="propose">Proponi evento</button>
      <button data-act="share">Condividi codice</button>
      ${ce ? `<button data-act="newevent">Aggiungi uscita</button>` : ""}
      ${state.user ? `<button data-act="lastride">Il mio spazio (giri e GPX)</button>` : ""}
      ${ce ? `<button data-act="linkevent">Collega evento di un altro calendario</button>` : ""}
      ${ce ? `<button data-act="proposals">Proposte</button>` : ""}
      ${ce ? `<button data-act="archive">Archivio</button>` : ""}
      ${ce ? `<button data-act="blacklist">Lista nera</button>` : ""}
      <button data-act="prefs">Preferenze ›</button>
      ${owner ? `<button data-act="calinfo">Info calendario</button>` : ""}
      ${owner ? `<button data-act="editors">Collaboratori</button>` : ""}
      ${owner ? `<button data-act="announcement">Comunicazioni</button>` : ""}
      <button data-act="info">Info</button>
      <button data-act="help">Aiuto</button>
      <button data-act="tips">Suggerimenti</button>
      <button data-act="donate">Donate</button>
    </div>
    <p class="muted small" style="margin:10px 0 0;text-align:center">Giro Web ${APP_VERSION}</p>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  if (isDesktop) {
    w.classList.add("dropdown");
    const r = anchorEl.getBoundingClientRect();
    const m = w.querySelector(".modal");
    m.style.top = `${Math.round(r.bottom + 6)}px`;
    m.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 296))}px`;
  }
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => { w.remove(); menuAction(b.dataset.act); });
}

/** Menu → Preferenze: sottomenu con le impostazioni del sito (come nell'app). */
function openPrefsMenu() {
  const w = modal(`
    <h3>Preferenze</h3>
    <div class="menu-list">
      <button data-act="textscale">Dimensione testo</button>
      <button data-act="diffscale">Scala difficoltà</button>
      <button data-act="navapp">App di navigazione</button>
      <button data-act="tabbar">Barra schede</button>
      <button data-act="audioautoplay">Autoplay audio</button>
      <button data-act="gpxw">Spessore traccia GPX</button>
      <button data-act="lang">Lingua</button>
      <button data-act="theme">Tema</button>
      <button data-act="cachesize">Cache</button>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => { w.remove(); menuAction(b.dataset.act); });
}

function menuAction(a) {
  {
    if (a === "prefs") openPrefsMenu();
    if (a === "open-other") go("");
    if (a === "propose") { if (!state.user) toast("Accedi con Google per proporre un'uscita."); else if (state.myBlock) toast("Il tuo account non può inviare proposte o modificare questo calendario."); else openProposeDialog(); }
    if (a === "share") {
      const text = `${tr(`Calendario ${state.calendar.name} — codice ${state.code}`)}\n${location.origin}/#/c/${state.code}`;
      shareOrCopy({ text }, "Link copiato negli appunti");
    }
    if (a === "newevent") openEventDialog(null);
    if (a === "linkevent") openLinkEventDialog();
    if (a === "lastride") openMySpaceDialog();
    if (a === "proposals") openProposalsDialog();
    if (a === "archive") openArchiveDialog();
    if (a === "blacklist") openBlacklistDialog();
    if (a === "theme") openThemeDialog();
    if (a === "gpxw") openGpxWidthDialog();
    if (a === "lang") openLangDialog();
    if (a === "textscale") openTextScaleDialog();
    if (a === "diffscale") openDiffScaleDialog();
    if (a === "audioautoplay") openAudioAutoplayDialog();
    if (a === "tabbar") openTabBarDialog();
    if (a === "navapp") openNavPrefDialog();
    if (a === "cachesize") openCacheDialog();
    if (a === "calinfo") openCalendarInfoDialog();
    if (a === "editors") openEditorsDialog();
    if (a === "announcement") openAnnouncementDialog();
    if (a === "info") openInfoDialog();
    if (a === "help") openHelpDialog();
    if (a === "tips") showTip(true);
    if (a === "donate") openDonateDialog();
  }
}

const HELP_EN = `Each group has a **calendar**, public or private. If private it can be shared with a code.
To edit the rides you must be an **editor** of the calendar — the owner adds collaborators from "Collaborators" in the menu.

**The tabs:**
• **Calendars** — your recent calendars, to switch quickly between them.
• **Upcoming** — the scheduled rides, in date order.
• **Past** — the rides already done.
• **Month** — the month as a grid, with the ride titles.
• **Notices** — group announcements.
• **Trails** — rideability status of the trails of the area (shared among all groups), with zones and builders. Every change is recorded in the LOG at the bottom; admins can undo it with the Undo button. Every change is recorded in the LOG at the bottom; admins can undo it with the Undo button (and restore it). Inside every open zone there is "+ Trail".
• **Map** — trails and zones on a map; with the pencil (login required) you import GPX, draw tracks with your finger and create zones; "GPX" shows one of your files on the map (KML, GeoJSON, TCX, CSV too); the magnifier searches for a place. The ? button explains everything.
• **Epics** — the best rides, to repeat every year.
• **Emergency** — only in the Android app: it alerts your chosen contacts by SMS in case of a fall.

**📱 Install the app on iPhone**
• Open **Safari** on your iPhone and go to the website.
• Tap the **Share** icon (the square with an arrow pointing up, at the bottom center).
• Scroll down and select **Add to Home Screen**.
• Tap **Add** in the top right corner.
The icon will appear directly on your Home Screen.`;

function openDonateDialog() {
  const m = modal(`<h3>Donate</h3><p>${tr("Aiutami con un piccolo contributo, a tua discrezione:")}</p>
    <p><a href="https://ko-fi.com/simplylucaapps" target="_blank" rel="noopener">https://ko-fi.com/simplylucaapps</a></p>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  return m;
}

function openHelpDialog() {
  const text = window.GC_LANG === "en" ? HELP_EN : `Ogni gruppo ha un **calendario**, pubblico o privato. Se privato è condivisibile tramite un codice.
Per modificare le uscite serve essere **editor** del calendario — l'owner aggiunge collaboratori da "Collaboratori" nel menu.

**Le tab** (su telefono scorri col dito a sinistra e a destra per cambiare tab):
• **Calendari** — i tuoi calendari recenti, per passare velocemente dall'uno all'altro.
• **Eventi** — le uscite in programma, in ordine di data; in fondo la barra **PASSATI** con quelle già svolte (tocca per aprirla).
• **I miei giri** — i tuoi giri registrati e i tuoi GPX (serve il login).
• **Impostazioni** — le preferenze (tema, lingua, testo…).
• **Mese** — il mese in griglia, con i titoli delle uscite.
• **Avvisi** — comunicazioni del gruppo.
• **Trail** — stato di percorribilità dei sentieri della zona (condiviso tra tutti i gruppi), con zone e costruttori. Ogni modifica è registrata nel LOG in fondo; gli admin possono annullarla con il pulsante Annulla (e ripristinarla). Dentro ogni zona aperta c'è "+ Trail".
• **Mappa** — trail e zone su mappa; con la matita (serve il login) importi GPX, disegni tracciati col dito e crei zone; "GPX" mostra un tuo file sulla mappa (anche KML, GeoJSON, TCX, CSV); la lente cerca un luogo. Il tasto ? spiega tutto.
• **Epici** — i giri più belli, da ripetere ogni anno.
• **SOS (Emergenza)** — è presente solo nell'app Android: avvisa via SMS i contatti scelti in caso di caduta.

**📱 Installare l'app su iPhone**
• Apri **Safari** sul tuo iPhone e vai sul sito web.
• Tocca l'icona **Condividi** (il quadrato con la freccia in su, in basso al centro).
• Scorri in basso e seleziona **Aggiungi alla schermata Home**.
• Tocca **Aggiungi** in alto a destra.
L'icona apparirà direttamente nella tua schermata Home.`;
  // Righe consecutive SENZA riga vuota tra loro nel testo sorgente restano vicine (margine
  // minimo, solo "a capo" semplice) — come nel testo originale, dove titolo e sottotitolo
  // di un paragrafo stanno appiccicati. Un punto elenco ("•") è sempre trattato come voce a
  // sé con margine pieno, anche senza riga vuota prima: altrimenti l'elenco sarebbe compresso.
  const rawLines = text.split("\n");
  const linesHtml = rawLines.map((line, i) => {
    if (!line.trim()) return "";
    const isBullet = line.trimStart().startsWith("•");
    const prevBlank = i === 0 || !rawLines[i - 1].trim();
    const marginTop = isBullet || prevBlank ? 14 : 2;
    return `<p style="margin:${marginTop}px 0 0${isBullet ? ";padding-left:14px" : ""}">${richText(line)}</p>`;
  }).join("");
  const w = modal(`
    <h3>Aiuto</h3>
    <div>${linesHtml}</div>
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector(".modal").classList.add("modal-xl"); // su desktop la finestra è più ampia (vedi style.css)
  w.querySelector("[data-close]").onclick = () => w.remove();
}

/** Blocco «Admin e collaboratori»: prima l'admin in rosso con «(Admin)», sotto i collaboratori. */
function collabListHtml(t) {
  const labels = state.user ? (t.editorLabels || {}) : {};
  const admin = t.ownerEmail || labels[t.ownerUid] || "";
  // senza login i collaboratori non si vedono; da loggati solo quelli con un nome/email noto (mai l'uid grezzo)
  const items = state.user ? (t.editors || []).filter((u) => u !== t.ownerUid).map((u) => labels[u]).filter(Boolean) : [];
  if (!admin && !items.length) return "";
  return `<div style="margin:10px 0 2px;text-align:left"><b class="small">Admin e collaboratori</b>
    <ul style="margin:4px 0 0;padding-left:0;list-style:none;font-size:.95rem;line-height:1.5;word-break:break-all">
    ${admin ? `<li style="color:#d32f2f;font-weight:600">${esc(admin)} (Admin)</li>` : ""}
    ${items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
}

/** Dialog rapido aperto col tap su logo/nome nell'header del calendario: logo grande, nome,
 * descrizione e owner (se presente) — stesso contenuto dello "showQuickInfo" dell'app Android. */
function openCalendarQuickInfoDialog(t) {
  const w = modal(`
    <div style="text-align:center">
      <span class="dot" id="qiLogo" title="Altre info" style="cursor:pointer;width:140px;height:140px;font-size:3.4rem;background:${dotColor(t.code, t.logoColor)}">${
        t.logoData ? `<img src="data:image/*;base64,${esc(t.logoData)}">` : ""}</span>
      <h3 style="margin:12px 0 4px">${esc(t.name || t.code)}</h3>
      ${t.description ? `<p class="small">${esc(t.description)}</p>` : `<p class="muted small">Nessuna descrizione.</p>`}
      ${t.ownerEmail ? `<p class="muted small" style="margin-top:8px">✉ ${esc(t.ownerEmail)}</p>` : ""}
    </div>
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-more>Altre info</button><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("[data-more]").onclick = () => { w.remove(); openCalendarMoreInfoDialog(t); };
  w.querySelector("#qiLogo").onclick = () => { w.remove(); openCalendarMoreInfoDialog(t); }; // secondo tocco sul logo
}

/** «Altre info» dal popup del logo: codice, admin, collaboratori, data di creazione e statistiche
 * (stesso contenuto del dialog "i" dell'app, CalendarInfoDialog). */
/** «ⓘ» nella lista Calendari: dettagli di un calendario qualunque (admin, collaboratori, creazione, statistiche). */
async function openCalendarDetailsByCode(code) {
  let t = null, s = null;
  try { t = (await getDoc(doc(db, "calendars", code))).data(); } catch {}
  if (t && state.user) { const p = await loadPrivate(code); if (p.email) t.ownerEmail = p.email; t.editorLabels = { ...(t.editorLabels || {}), ...p.labels }; }
  try { s = await calendarStats(code); } catch {}
  if (!t) { toast("Impossibile caricare i dettagli"); return; }
  const row = (k, v) => `<div class="row" style="justify-content:space-between;gap:12px;padding:3px 0"><span class="muted small">${k}</span><b class="small" style="text-align:right">${v}</b></div>`;
  const labels = t.editorLabels || {};
  const w = modal(`
    <h3 style="margin:0 0 10px">${esc(t.name || code)}</h3>
    ${row("Codice", esc(code))}
    ${t.ownerEmail ? row("Amministratore", esc(t.ownerEmail)) : ""}
    ${collabListHtml(t) || (state.user ? row("Collaboratori", "0") : "")}
    ${t.createdAtMillis ? row("Creato il", new Date(t.createdAtMillis).toLocaleDateString(window.GC_LOCALE)) : ""}
    <p class="muted small" style="margin:12px 0 2px"><b>Statistiche</b></p>
    ${row("Uscite totali", s ? s.eventCount : "…")}
    ${row("Accessi", t.openCount || 0)}
    ${row("Visibilità", t.listed === false ? "Privato" : "Pubblico")}
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
}

function openCalendarMoreInfoDialog(t) {
  const row = (k, v) => `<div class="row" style="justify-content:space-between;gap:12px;padding:3px 0"><span class="muted small">${k}</span><b class="small" style="text-align:right">${v}</b></div>`;
  const collabs = (t.editors || []).length;
  const w = modal(`
    <h3 style="margin:0 0 10px">${esc(t.name || t.code)}</h3>
    ${row("Codice", esc(t.code))}
    ${collabListHtml(t) || row("Collaboratori", `${collabs}`)}
    ${t.createdAtMillis ? row("Creato il", new Date(t.createdAtMillis).toLocaleDateString(window.GC_LOCALE)) : ""}
    <p class="muted small" style="margin:12px 0 2px"><b>Statistiche</b></p>
    ${row("Uscite totali", state.events.length)}
    ${row("Accessi", t.openCount || 0)}
    ${row("Visibilità", t.listed === false ? "Privato" : "Pubblico")}
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
}

function openInfoDialog() {
  const w = modal(`
    <div style="text-align:center">
      <img src="icon-192.png" alt="" style="width:88px;height:88px;border-radius:20px">
      <h3 style="margin:12px 0 4px">Giro Web ${APP_VERSION}</h3>
      <p class="small">Calendari degli eventi per le uscite in bici di gruppo.</p>
      <p class="muted small" style="margin-top:6px">Sviluppato da Luca</p>
      <div style="margin-top:10px;padding:12px;border-radius:12px;background:#2e7d32;color:#fff">
        <p class="small" style="margin:0;opacity:.9">Versione iOS e web</p>
        <p style="margin:2px 0 0"><a href="https://girocalendar.pages.dev/" target="_blank" rel="noopener" style="color:#fff;font-weight:700;font-size:1.05em">girocalendar.pages.dev</a></p>
      </div>
      <div class="row gap" style="margin-top:6px"><button class="mk-btn" style="flex:1" data-copy="https://girocalendar.pages.dev/">Copia link</button><button class="mk-btn" style="flex:1" data-share="https://girocalendar.pages.dev/" data-title="Giro">Condividi</button></div>
      <div style="margin-top:12px;padding:12px;border-radius:12px;background:#2e7d32;color:#fff">
        <p class="small" style="margin:0;opacity:.9">Versione Android</p>
        <p style="margin:2px 0 0"><a href="https://play.google.com/store/apps/details?id=simplylucaapps.girocalendar" target="_blank" rel="noopener" style="color:#fff;font-weight:700;font-size:1.05em">Apri su Google Play</a></p>
      </div>
      <div class="row gap" style="margin-top:6px"><button class="mk-btn" style="flex:1" data-copy="https://play.google.com/store/apps/details?id=simplylucaapps.girocalendar">Copia link</button><button class="mk-btn" style="flex:1" data-share="https://play.google.com/store/apps/details?id=simplylucaapps.girocalendar" data-title="Giro">Condividi</button></div>
      <p style="margin-top:14px"><a href="https://simplylucaapps.pages.dev/" target="_blank" rel="noopener" class="accent" style="font-weight:700">Altre app SimplyLucaApps</a></p>
      <p style="margin-top:10px"><a href="https://simplylucaapps.pages.dev/privacy-girocalendar.html" class="muted small">Informativa sulla privacy</a></p>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copiato negli appunti"); } catch { prompt("Link", b.dataset.copy); }
  });
  w.querySelectorAll("[data-share]").forEach((b) => b.onclick = () => shareLinkOnly(b.dataset.title, b.dataset.share));
}

function openThemeDialog() {
  const cur = LS.theme();
  const w = modal(`
    <h3>Tema</h3>
    <div class="theme-grid">
      ${Object.entries(THEMES).map(([id, t]) => `
        <button class="theme-opt ${id === cur ? "sel" : ""}" data-id="${id}"><span>${t.icon}</span>${esc(t.name)}</button>`).join("")}
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll(".theme-opt").forEach((b) => b.onclick = () => { applyTheme(b.dataset.id); w.remove(); route(); });
}

/** Menu → Cache: spazio usato dal sito nel browser e pulizia della cache dell'app (non tocca i dati dell'account). */
async function openCacheDialog() {
  let used = "n/d", quota = "";
  try { const e = await navigator.storage.estimate(); used = (e.usage / 1048576).toFixed(1) + " MB"; quota = ` su ~${Math.round(e.quota / 1048576)} MB disponibili`; } catch {}
  const m = modal(`<h3>Cache</h3>
    <p class="muted small">Spazio usato dal sito su questo dispositivo: <b>${used}</b>${quota}. Le tile della mappa le gestisce il browser.</p>
    <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Chiudi</button><button class="btn" id="cacheClear">Svuota cache</button></div>`);
  m.querySelector("[data-close]").onclick = () => m.remove();
  m.querySelector("#cacheClear").onclick = async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    toast("Cache svuotata"); m.remove();
  };
}

function openTextScaleDialog() {
  const cur = LS.textScale();
  const w = modal(`
    <h3>Dimensione testo</h3>
    <div class="row gap" style="margin-bottom:6px">
      <span class="small muted">A</span>
      <input type="range" id="tsRange" min="0.5" max="1.5" step="0.01" value="${cur}" style="flex:1">
      <span class="small muted" style="font-size:1.3rem">A</span>
    </div>
    <p class="small muted" style="text-align:center" id="tsPreview">Esempio di testo — ${Math.round(cur * 100)}%</p>
    <div class="row end" style="margin-top:14px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  const range = w.querySelector("#tsRange");
  const preview = w.querySelector("#tsPreview");
  range.oninput = () => { applyTextScale(range.value); preview.textContent = `Esempio di testo — ${Math.round(range.value * 100)}%`; };
  w.querySelector("[data-close]").onclick = () => w.remove();
}

function gpxWidth() { try { const v = parseInt(localStorage.getItem("gc_gpx_w"), 10); return v > 0 ? v : 3; } catch { return 3; } }
function openGpxWidthDialog() {
  const cur = gpxWidth();
  const opts = [[2, "Molto sottile"], [3, "Sottile"], [4, "Normale"], [6, "Spesso"], [8, "Molto spesso"]];
  const w = modal(`
    <h3>Spessore traccia GPX</h3>
    <p class="muted small">Vale per la linea del GPX sulla mappa, la riproduzione e il 3D.</p>
    <div class="menu-list">${opts.map(([v, l]) => `<button data-w="${v}" class="${v === cur ? "sel" : ""}">${v === cur ? "✓ " : ""}${l}</button>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => {
    try { localStorage.setItem("gc_gpx_w", b.dataset.w); } catch {}
    w.remove(); if (state.tab === "mappa" && state.map) buildTrailMap(true);
  });
}

function openLangDialog() {
  const cur = window.GC_LANG_PREF || "system";
  const opts = [["system", "Sistema / System"], ["it", "Italiano"], ["en", "English"]];
  const w = modal(`
    <h3>Lingua / Language</h3>
    <div class="menu-list">${opts.map(([id, l]) => `<button data-lang="${id}" class="${id === cur ? "sel" : ""}">${id === cur ? "✓ " : ""}${l}</button>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => window.gcSetLang(b.dataset.lang));
}

function openDiffScaleDialog() {
  const cur = diffScale();
  const w = modal(`
    <h3>Scala difficoltà</h3>
    <p class="muted small">Cambia solo etichetta e colore mostrati; il dato salvato resta invariato.</p>
    <div class="theme-grid">
      <button class="theme-opt ${cur === "sts" ? "sel" : ""}" data-v="sts"><span>🚵</span>STS (S0-S5)</button>
      <button class="theme-opt ${cur === "trailforks" ? "sel" : ""}" data-v="trailforks"><span>⛰️</span>Trailforks</button>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll(".theme-opt").forEach((b) => b.onclick = () => { setDiffScale(b.dataset.v); w.remove(); renderCalendar(); });
}

function openTabBarDialog() {
  const w = modal(`
    <h3>Barra schede</h3>
    <p class="muted small">Con "Singola riga" le schede scorrono in orizzontale; disattivata, sono tutte visibili su due righe.</p>
    <div class="row gap center" style="margin:10px 0">
      <label class="row gap center"><input type="checkbox" id="tbCheck" ${LS.singleTabBar() ? "checked" : ""}> Singola riga schede</label>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("#tbCheck").onchange = (e) => { LS.setSingleTabBar(e.target.checked); renderCalendar(); };
}

function openAudioAutoplayDialog() {
  const cur = LS.audioAutoplay();
  const w = modal(`
    <h3>Autoplay audio</h3>
    <p class="muted small">Riproduce automaticamente l'audio dell'evento aprendo la foto a tutto schermo.</p>
    <div class="row gap center" style="margin:10px 0">
      <label class="row gap center"><input type="checkbox" id="aaCheck" ${cur ? "checked" : ""}> Attivo</label>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#aaCheck").onchange = (e) => LS.setAudioAutoplay(e.target.checked);
}

async function openDeleteAccountDialog() {
  const w = modal(`
    <h3>Elimina account</h3>
    <div id="daBody"><div class="spin"></div></div>
    <div id="daErr" class="err"></div>
    <div class="row end gap">
      <button class="btn ghost" data-close>Annulla</button>
      <button class="btn" id="daGo" style="background:#e74c3c;color:#fff">Continua</button>
    </div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();

  let owned = [];
  try { owned = await ownedCalendarsForDeletion(); } catch (e) { console.warn(e); }
  const solo = owned.filter((t) => (t.editors || []).length <= 1);
  const withHeir = owned.filter((t) => (t.editors || []).length > 1);

  const body = w.querySelector("#daBody");
  body.innerHTML = `
    <p>Il tuo account Google verrà scollegato dall'app e i tuoi dati eliminati. Questa azione non si può annullare.</p>
    ${withHeir.length ? `
      <p class="lbl" style="margin-top:14px">QUESTI CALENDARI PASSERANNO A UN COLLABORATORE</p>
      ${withHeir.map((t) => `<p class="small">• ${esc(t.name || t.code)} (${esc(t.code)})</p>`).join("")}` : ""}
    ${solo.length ? `
      <p class="lbl" style="margin-top:14px;color:#e74c3c">SEI L'UNICO AMMINISTRATORE</p>
      <p class="small muted">Nomina qualcuno incollando il suo codice utente, oppure lascia vuoto: il calendario verrà eliminato con l'account.</p>
      ${solo.map((t) => `<label>${esc(t.name || t.code)}<input data-nominate="${esc(t.code)}" placeholder="Codice utente (opzionale)"></label>`).join("")}` : ""}
    ${!owned.length ? `<p class="muted small">Non amministri calendari: nulla verrà eliminato oltre al tuo account.</p>` : ""}
  `;

  let confirmStep = false;
  const goBtn = w.querySelector("#daGo");
  goBtn.onclick = async () => {
    if (!confirmStep) {
      confirmStep = true;
      goBtn.textContent = "Elimina definitivamente";
      const warn = document.createElement("p");
      warn.innerHTML = "<b>Confermi? Non potrai tornare indietro.</b>";
      warn.style.color = "#e74c3c"; warn.style.marginTop = "14px";
      body.appendChild(warn);
      return;
    }
    const nominations = {};
    w.querySelectorAll("[data-nominate]").forEach((inp) => { if (inp.value.trim()) nominations[inp.dataset.nominate] = inp.value.trim(); });
    goBtn.disabled = true; goBtn.textContent = "Eliminazione…";
    try {
      await deleteAccountWithData(nominations);
      w.remove(); go("");
    } catch (e) {
      const msg = e?.code === "auth/requires-recent-login"
        ? "Per sicurezza devi aver eseguito l'accesso di recente: accedi di nuovo e riprova subito."
        : (e.message || "Errore durante l'eliminazione.");
      w.querySelector("#daErr").textContent = msg;
      goBtn.disabled = false; goBtn.textContent = confirmStep ? "Elimina definitivamente" : "Continua";
    }
  };
}

async function openBrowseDialog() {
  const w = modal(`
    <h3>Tutti i calendari</h3>
    <input id="brQ" placeholder="Cerca per nome…" style="width:100%">
    <div id="brList" style="margin-top:10px;max-height:60vh;overflow:auto"><div class="spin"></div></div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  let all = [];
  try { all = await allCalendars(); } catch (e) { console.warn(e); }
  const listEl = w.querySelector("#brList");
  const render = () => {
    const n = w.querySelector("#brQ").value.trim().toLowerCase();
    const rows = all.filter((t) => !n || (t.name || "").toLowerCase().includes(n) || t.code.toLowerCase().includes(n));
    if (!rows.length) { listEl.innerHTML = `<p class="muted small">${all.length ? "Nessun risultato." : "Nessun calendario pubblico."}</p>`; return; }
    listEl.innerHTML = rows.map((t) => `
      <button class="cal-item" data-code="${esc(t.code)}" style="margin-bottom:6px">
        <span class="dot" style="background:${dotColor(t.code, t.logoColor)}">${t.logoData ? `<img src="data:image/*;base64,${esc(t.logoData)}">` : ""}</span>
        <span class="cal-name">
          <span>${esc(t.name || t.code)}</span>
          <code>${esc(t.code)}</code>
          ${t.description ? `<span class="muted small">${esc(t.description)}</span>` : ""}
          ${t.ownerEmail ? `<span class="muted small">✉ ${esc(t.ownerEmail)}</span>` : ""}
        </span>
        <span class="arrow">→</span>
      </button>`).join("");
    listEl.querySelectorAll(".cal-item").forEach((b) => b.onclick = () => { w.remove(); go("/c/" + b.dataset.code); });
  };
  w.querySelector("#brQ").addEventListener("input", render);
  render();
}

function openCreateDialog() {
  if (!state.user) { doSignIn(); return; }
  const w = modal(`
    <h3>Nuovo calendario</h3>
    ${logoPickerHtml("cLogo")}
    <label>Nome gruppo <input id="cName" maxlength="60" placeholder="es. Spaccasassi MTB"></label>
    <label>Descrizione <input id="cDesc" maxlength="120"></label>
    <label class="row between center" style="margin-top:6px">
      <span>Calendario pubblico<br><span class="muted small">Compare nell'elenco. Puoi cambiarlo dopo.</span></span>
      <input id="cPub" type="checkbox" checked style="width:auto">
    </label>
    <div id="cErr" class="err"></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="cGo">Crea</button></div>
  `);
  let logo = { logoColor: "", logoData: "" };
  wireLogoPicker(w, "cLogo", logo, (v) => { logo = v; });
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#cGo").onclick = async () => {
    const name = w.querySelector("#cName").value.trim();
    if (!name) { w.querySelector("#cErr").textContent = "Il nome è obbligatorio."; return; }
    try {
      const code = await createCalendar(name, w.querySelector("#cDesc").value, w.querySelector("#cPub").checked, logo.logoColor, logo.logoData);
      LS.addRecent(code, name);
      w.remove(); go("/c/" + code);
    } catch (e) { w.querySelector("#cErr").textContent = e.message || "Errore"; }
  };
}

// ─────────────────────────────────────────────────────────────
// Editor evento (nuova / modifica / da proposta)
// ─────────────────────────────────────────────────────────────
function eventFormHtml(e, opts = {}) {
  const isEpic = !!opts.isEpic;
  return `
    <label>Titolo * <input id="fTitolo" value="${esc(e.titolo)}"></label>
    ${!isEpic ? `
    <div class="grid2">
      <label>Data * <input id="fData" type="date" value="${itToIso(e.data)}"></label>
      <label>Ora <input id="fOra" type="time" value="${esc(e.ora)}"></label>
    </div>
    ${opts.isProposal ? "" : `<label>Durata giorni <input id="fDurata" type="number" min="1" max="999" step="1" value="${e.durataGiorni > 1 ? e.durataGiorni : 1}"></label>`}` : ""}
    <label>Località <input id="fLocalita" value="${esc(e.localita)}"></label>
    <label>${isEpic ? "Parcheggio/ritrovo" : "Ritrovo (link Google Maps o indirizzo)"} <input id="fRitrovo" value="${esc(e.ritrovo)}"></label>
    ${isEpic ? `
    <label>Autore <input id="fProponente" value="${esc(e.proponente)}"></label>` : `
    <div class="grid2">
      <label>Proponente <input id="fProponente" value="${esc(e.proponente)}"></label>
      <label>WhatsApp proponente <input id="fWa" value="${esc(e.waProponente)}"></label>
    </div>`}
    ${(opts && opts.isEpic) || !e.id ? "" : `<label class="cancel-chk"><input type="checkbox" id="fAnnullata" ${e.annullata ? "checked" : ""}> Uscita annullata</label>`}
    <label class="cancel-chk"><input type="checkbox" id="fTrailOn" ${e.trailZone ? "checked" : ""}> Mostra lo stato dei trail di una zona</label>
    <select id="fTrailZone" style="${e.trailZone ? "" : "display:none"}" data-cur="${esc(e.trailZone || "")}"><option value="${esc(e.trailZone || "")}">${esc(e.trailZone || "Scegli la zona")}</option></select>
    <label>Difficoltà
      <div class="diff-grid" id="fDiffGrid">
        <button type="button" class="diff-opt ${!e.difficolta ? "sel" : ""}" data-v="">Nessuna</button>
        ${Object.entries(DIFFICULTY).map(([id, label]) => `<button type="button" class="diff-opt ${e.difficolta === id ? "sel" : ""}" data-v="${id}">${label}</button>`).join("")}
      </div>
    </label>
    <label>Link percorso (Komoot, Strava…) <input id="fLinkPercorso" value="${esc(e.linkPercorso)}"></label>
    <label>Traccia GPX
      <div id="fGpxArea">${e.gpxData ? `<div class="row between center"><span>📄 ${esc(e.gpxFileName || "traccia.gpx")}</span><button type="button" class="icon-btn" id="fGpxClear">✕</button></div>` : `<input type="file" id="fGpxFile" accept=".gpx">`}</div>
    </label>
    <label>Altro link (Instagram, Facebook, sito…) <input id="fLink2" value="${esc(e.link2)}"></label>
    <label>Video (YouTube, social…) <input id="fVideo" value="${esc(e.video)}"></label>
    <label>${isEpic ? "Descrizione" : "Note"} <textarea id="fNote">${esc(e.note)}</textarea></label>
    <label>Immagine di sfondo
      <div id="fImgArea">${e.cardBgData ? `<div class="row between center"><img src="data:image/jpeg;base64,${b64(e.cardBgData)}" style="width:60px;height:40px;object-fit:cover;border-radius:6px"><button type="button" class="icon-btn" id="fImgClear">✕</button></div>` : `<input type="file" id="fImgFile" accept="image/*">`}</div>
    </label>
    <label>Audio (riprodotto aprendo l'immagine a tutto schermo)
      <div id="fAudioArea">${e.audioData ? `<div class="row between center"><span>🔊 Audio caricato</span><button type="button" class="icon-btn" id="fAudioClear">✕</button></div>` : `<input type="file" id="fAudioFile" accept="audio/*">`}</div>
    </label>
  `;
}

function readEventForm(w) {
  const diffSel = w.querySelector(".diff-opt.sel");
  const fData = w.querySelector("#fData");
  const fWa = w.querySelector("#fWa");
  return {
    titolo: w.querySelector("#fTitolo").value.trim(),
    data: fData ? isoToIt(fData.value) : "",
    ora: w.querySelector("#fOra") ? w.querySelector("#fOra").value : "",
    ...(w.querySelector("#fDurata") ? { durataGiorni: Math.max(1, parseInt(w.querySelector("#fDurata").value, 10) || 1) } : {}),
    localita: w.querySelector("#fLocalita").value.trim(),
    ritrovo: w.querySelector("#fRitrovo").value.trim(),
    proponente: w.querySelector("#fProponente").value.trim(),
    waProponente: fWa ? fWa.value.trim() : "",
    difficolta: diffSel ? diffSel.dataset.v : "",
    trailZone: (w.querySelector("#fTrailOn") && w.querySelector("#fTrailOn").checked) ? (w.querySelector("#fTrailZone").value || "") : "",
    ...(w.querySelector("#fAnnullata") ? { annullata: w.querySelector("#fAnnullata").checked } : {}),
    linkPercorso: w.querySelector("#fLinkPercorso").value.trim(),
    link2: w.querySelector("#fLink2").value.trim(),
    video: w.querySelector("#fVideo").value.trim(),
    note: w.querySelector("#fNote").value.trim(),
  };
}

function wireEventForm(w, e) {
  const trOn = w.querySelector("#fTrailOn"), trSel = w.querySelector("#fTrailZone");
  if (trOn && trSel) {
    let loaded = false;
    const loadZones = async () => {
      if (loaded) return; loaded = true;
      try {
        const cur = trSel.dataset.cur || "";
        const qs = await getDocs(collection(db, "trails"));
        const zs = [...new Set(qs.docs.map((d) => (d.data().zone || "").trim()).filter(Boolean))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        trSel.innerHTML = `<option value="">${esc(tr("Scegli la zona"))}</option>` + zs.map((z) => `<option value="${esc(z)}" ${z === cur ? "selected" : ""}>${esc(z)}</option>`).join("");
      } catch { loaded = false; }
    };
    trOn.onchange = () => { trSel.style.display = trOn.checked ? "" : "none"; if (trOn.checked) loadZones(); };
    if (trOn.checked) loadZones();
  }
  w.querySelectorAll("#fDiffGrid .diff-opt").forEach((b) => b.onclick = () => {
    w.querySelectorAll("#fDiffGrid .diff-opt").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  });
  let gpxData = e.gpxData || "", gpxFileName = e.gpxFileName || "";
  let cardBgData = e.cardBgData || "", photoData = e.photoData || "";
  const gpxFile = w.querySelector("#fGpxFile");
  if (gpxFile) gpxFile.onchange = async () => {
    const f = gpxFile.files[0]; if (!f) return;
    const res = await compressGpxFile(f);
    if (res.tooLarge) { toast(`File troppo grande (${res.sizeKb} KB, max 2 MB)`); return; }
    gpxData = res.gpxData; gpxFileName = res.fileName;
    toast("Traccia GPX caricata");
  };
  w.querySelector("#fGpxClear") && (w.querySelector("#fGpxClear").onclick = () => {
    gpxData = ""; gpxFileName = "";
    w.querySelector("#fGpxArea").innerHTML = `<input type="file" id="fGpxFile" accept=".gpx">`;
    wireEventForm(w, { ...e, gpxData: "" });
  });
  const imgFile = w.querySelector("#fImgFile");
  if (imgFile) imgFile.onchange = async () => {
    const f = imgFile.files[0]; if (!f) return;
    const both = await downscaleForCard(f);
    cardBgData = both.cardBgData; photoData = both.photoData;
    toast("Immagine caricata");
  };
  w.querySelector("#fImgClear") && (w.querySelector("#fImgClear").onclick = () => {
    cardBgData = ""; photoData = "";
    w.querySelector("#fImgArea").innerHTML = `<input type="file" id="fImgFile" accept="image/*">`;
    wireEventForm(w, { ...e, cardBgData: "" });
  });
  let audioData = e.audioData || "", audioMimeType = e.audioMimeType || "";
  const audioFile = w.querySelector("#fAudioFile");
  if (audioFile) audioFile.onchange = async () => {
    const f = audioFile.files[0]; if (!f) return;
    const source = await loadAudioSource(f);
    if (source.tooLarge) { toast(`File troppo grande (${source.sizeKb} KB, max 15 MB)`); audioFile.value = ""; return; }
    if (source.unsupported) { toast("Il browser non supporta la registrazione audio Opus richiesta per comprimere il file"); audioFile.value = ""; return; }
    if (source.readError) { toast("File audio non leggibile"); audioFile.value = ""; return; }
    openAudioTrimDialog(source.audioBuffer, (base64, mimeType) => {
      audioData = base64; audioMimeType = mimeType;
      w.querySelector("#fAudioArea").innerHTML = `<div class="row between center"><span>🔊 Audio caricato</span><button type="button" class="icon-btn" id="fAudioClear">✕</button></div>`;
      w.querySelector("#fAudioClear").onclick = () => {
        audioData = ""; audioMimeType = "";
        w.querySelector("#fAudioArea").innerHTML = `<input type="file" id="fAudioFile" accept="audio/*">`;
        wireEventForm(w, { ...e, audioData: "" });
      };
      toast("Audio tagliato e pronto");
    });
  };
  w.querySelector("#fAudioClear") && (w.querySelector("#fAudioClear").onclick = () => {
    audioData = ""; audioMimeType = "";
    w.querySelector("#fAudioArea").innerHTML = `<input type="file" id="fAudioFile" accept="audio/*">`;
    wireEventForm(w, { ...e, audioData: "" });
  });
  return { get gpxData() { return gpxData; }, get gpxFileName() { return gpxFileName; },
    get cardBgData() { return cardBgData; }, get photoData() { return photoData; },
    get audioData() { return audioData; }, get audioMimeType() { return audioMimeType; } };
}

/** Bozza automatica di un form in un modal: salva ogni modifica in localStorage e la ripristina alla riapertura
 * (se la pagina si ricarica o il dialogo si chiude per sbaglio non si perde il testo). Esclude file/foto/audio. */
function attachDraft(w, key) {
  const k = "gc_draft_" + key;
  const fields = () => [...w.querySelectorAll("input[id], textarea[id], select[id]")].filter((x) => x.type !== "file");
  const save = () => {
    try {
      const d = { v: {}, diff: w.querySelector(".diff-opt.sel")?.dataset.v ?? null };
      fields().forEach((x) => { d.v[x.id] = x.type === "checkbox" ? x.checked : x.value; });
      const has = Object.entries(d.v).some(([id, v]) => v && v !== true && id !== "fData" && id !== "fProponente");
      if (has) localStorage.setItem(k, JSON.stringify(d)); else localStorage.removeItem(k);
    } catch {}
  };
  w.addEventListener("input", save);
  w.addEventListener("change", save);
  w.addEventListener("click", (ev) => { if (ev.target.closest(".diff-opt")) save(); });
  return {
    clear() { try { localStorage.removeItem(k); } catch {} },
    restore() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(k) || "null"); } catch {}
      if (!d) return;
      fields().forEach((x) => { if (x.id in d.v) { if (x.type === "checkbox") x.checked = !!d.v[x.id]; else x.value = d.v[x.id]; } });
      if (d.diff !== null) w.querySelectorAll(".diff-opt").forEach((b) => b.classList.toggle("sel", b.dataset.v === d.diff));
      toast("Bozza ripristinata");
    },
  };
}

function openEventDialog(e, opts = {}) {
  // isNewFrom: "Pianifica" da una scheda Epici passa un oggetto con dati precompilati ma
  // deve comunque creare un evento NUOVO (id vuoto), mai aggiornare l'epico di partenza.
  const isNew = !e || !!opts.isNewFrom;
  const isEpic = !!opts.isEpic;
  e = e || { titolo: "", data: "", ora: "", localita: "", ritrovo: "", proponente: LS.myName(), waProponente: "",
    difficolta: "", linkPercorso: "", link2: "", video: "", note: "", cardBgData: "", photoData: "", gpxData: "", gpxFileName: "",
    audioData: "", audioMimeType: "", partecipanti: [], forse: [] };
  const title = isEpic ? (isNew ? "Nuovo giro epico" : "Modifica giro epico")
    : (isNew ? (opts.isNewFrom ? "Pianifica uscita" : "Nuova uscita") : "Modifica uscita");
  const w = modal(`
    <h3>${title}</h3>
    ${eventFormHtml(e, { isEpic })}
    ${!isNew && !isEpic ? `<div style="margin:10px 0"><b class="small">Partecipanti</b>
      <div id="evPartList" class="row gap" style="flex-wrap:wrap;margin:6px 0"></div>
      <div class="row gap"><input id="evPartNew" placeholder="Aggiungi partecipante" style="flex:1"><button type="button" class="btn ghost" id="evPartAdd">＋</button></div>
    </div>` : ""}
    <div id="evErr" class="err"></div>
    <div class="row between">
      <div class="row gap">
        ${!isNew && !opts.fromProposal && !isEpic ? `<button type="button" class="btn danger" id="evArchive">Archivia</button>` : ""}
        ${!isNew && !opts.fromProposal && !isEpic ? `<button type="button" class="btn danger" id="evCancelEv" style="min-height:46px;padding:10px 18px;font-size:1.02rem;${e.annullata ? "background:#2e7d32" : "background:#b71c1c"}">${e.annullata ? "↩️ Riattiva uscita" : "🚫 Annulla uscita"}</button>` : ""}
        ${!isNew && !opts.fromProposal ? `<button type="button" class="btn danger" id="evDelete" style="min-height:46px;padding:10px 18px;font-size:1.02rem">Elimina</button>` : ""}
      </div>
      <div class="row end gap">
        <button class="btn ghost" data-close>Annulla</button>
        <button class="btn" id="evSave">Salva</button>
      </div>
    </div>
  `, { large: true, xl: true, sticky: true });
  const draft = isNew && !opts.isNewFrom && !opts.fromProposal ? attachDraft(w, `${isEpic ? "epic" : "event"}_${state.code}`) : null;
  w.querySelector("[data-close]").onclick = () => { if (draft) draft.clear(); w.remove(); };
  const media = wireEventForm(w, e);
  if (draft) draft.restore();
  // «Annulla uscita» / «Riattiva uscita»: pulsantone vicino a Elimina. Imposta la casella (che resta nascosta) e salva
  // con il normale «Salva», così anche le altre modifiche già fatte nel form non si perdono.
  const cancelBtn = w.querySelector("#evCancelEv"), cancelChk = w.querySelector("#fAnnullata");
  if (cancelBtn && cancelChk) {
    const lbl = cancelChk.closest("label"); if (lbl) lbl.style.display = "none";
    cancelBtn.onclick = () => {
      const will = !cancelChk.checked;
      if (!confirm(will ? "Annullare questa uscita? Resterà in calendario segnata come ANNULLATA." : "Riattivare questa uscita?")) return;
      cancelChk.checked = will;
      w.querySelector("#evSave").click();
    };
  }
  // Partecipanti: modifica immediata (un nome alla volta con arrayRemove/arrayUnion),
  // indipendente da "Salva", che non scrive questo campo.
  if (w.querySelector("#evPartList")) {
    const parts = [...(e.partecipanti || [])];
    const evRef = doc(db, "calendars", state.code, "events", e.id);
    const renderParts = () => {
      const box = w.querySelector("#evPartList");
      box.innerHTML = parts.length ? parts.map((n, i) =>
        `<span class="chip" style="font-size:.85rem;padding:4px 10px">${esc(n)} <a href="#" data-rm="${i}" style="margin-left:6px;text-decoration:none" title="Rimuovi">✕</a></span>`).join("")
        : `<span class="muted small">Nessun partecipante</span>`;
      box.querySelectorAll("[data-rm]").forEach((x) => x.onclick = async (ev) => {
        ev.preventDefault();
        const idx = +x.dataset.rm;
        try { await updateDoc(evRef, { partecipanti: arrayRemove(parts[idx]) }); parts.splice(idx, 1); renderParts(); }
        catch (err) { w.querySelector("#evErr").textContent = err.message || "Errore"; }
      });
    };
    const addPart = async () => {
      const inp = w.querySelector("#evPartNew");
      const name = inp.value.trim();
      if (!name || parts.includes(name)) { inp.value = ""; return; }
      try { await updateDoc(evRef, { partecipanti: arrayUnion(name) }); parts.push(name); inp.value = ""; renderParts(); }
      catch (err) { w.querySelector("#evErr").textContent = err.message || "Errore"; }
    };
    w.querySelector("#evPartAdd").onclick = addPart;
    w.querySelector("#evPartNew").onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addPart(); } };
    renderParts();
  }
  w.querySelector("#evSave").onclick = async () => {
    const data = readEventForm(w);
    if (!data.titolo || (!isEpic && !data.data)) {
      w.querySelector("#evErr").textContent = isEpic ? "Il titolo è obbligatorio." : "Titolo e data sono obbligatori.";
      return;
    }
    Object.assign(data, { cardBgData: media.cardBgData, photoData: media.photoData, gpxData: media.gpxData, gpxFileName: media.gpxFileName,
      audioData: media.audioData, audioMimeType: media.audioMimeType });
    try {
      const col = collection(db, "calendars", state.code, isEpic ? "epics" : "events");
      if (isNew) {
        data.partecipanti = [];
        await addDoc(col, data);
        if (draft) draft.clear();
        if (opts.fromProposal) await deleteDoc(doc(db, "calendars", state.code, "proposals", opts.fromProposal));
      } else {
        await updateDoc(doc(col, e.id), data);
      }
      w.remove();
    } catch (err) { w.querySelector("#evErr").textContent = err.message || "Errore di salvataggio"; }
  };
  w.querySelector("#evDelete") && (w.querySelector("#evDelete").onclick = async () => {
    if (!confirm(isEpic ? "Eliminare definitivamente questo giro epico?" : "Eliminare definitivamente questa uscita?")) return;
    try {
      await deleteDoc(doc(db, "calendars", state.code, isEpic ? "epics" : "events", e.id));
      w.remove();
    } catch (err) { w.querySelector("#evErr").textContent = err.message || "Errore di eliminazione"; }
  });
  w.querySelector("#evArchive") && (w.querySelector("#evArchive").onclick = async () => {
    if (!confirm("Archiviare questa uscita?")) return;
    const full = { ...e, ...readEventForm(w), cardBgData: media.cardBgData, photoData: media.photoData, gpxData: media.gpxData, gpxFileName: media.gpxFileName,
      audioData: media.audioData, audioMimeType: media.audioMimeType };
    delete full.id;
    await addDoc(collection(db, "calendars", state.code, "archived"), { ...full, archivedAtMillis: Date.now() });
    await deleteDoc(doc(db, "calendars", state.code, "events", e.id));
    w.remove();
  });
}

/** Conferma "Aggiungi a Epici": clona l'evento (normale) nella collection epics/ dello stesso
 * calendario, incluso l'audio se presente. L'originale resta intatto, mai spostato. */
function openAddToEpicsConfirm(e) {
  const w = modal(`
    <h3>Aggiungere "${esc(e.titolo || "Uscita")}" a Epici?</h3>
    <p class="muted small">Viene creata una copia in Epici (senza data/ora/partecipanti). L'uscita originale resta invariata.</p>
    <div class="row end gap" style="margin-top:16px">
      <button class="btn ghost" data-close>Annulla</button>
      <button class="btn" id="confirmAddEpic">Conferma</button>
    </div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#confirmAddEpic").onclick = async () => {
    try {
      const { id, hasAudio, partecipanti, forse, archivedAtMillis, ...rest } = e;
      const newRef = await addDoc(collection(db, "calendars", state.code, "epics"), { ...rest, data: "", ora: "", partecipanti: [], forse: [] });
      // L'audio (se presente) vive in un sub-documento separato: va copiato a parte, come
      // fa cloneEventToEpics() nell'app Android.
      if (e.hasAudio) {
        try {
          const snap = await getDoc(doc(db, "calendars", state.code, "events", e.id, "audio", "clip"));
          if (snap.exists()) {
            await setDoc(doc(db, "calendars", state.code, "epics", newRef.id, "audio", "clip"), snap.data());
            await updateDoc(newRef, { hasAudio: true });
          }
        } catch (err) { console.warn("epic audio copy failed", err); }
      }
      w.remove();
      toast("Aggiunto a Epici");
    } catch (err) { toast(err.message || "Errore"); }
  };
}

/** "Clona in un mio calendario": propone i calendari dove l'utente è owner/editor (esclusa
 * la vista aperta ora) e clona l'evento (letto pubblicamente, anche senza esserne editor)
 * nel calendario scelto, incluso l'audio se presente. */
/** Apre un GPX (già in testo) sulla mappa: se la scheda Mappa è aperta lo carica subito, altrimenti ci passa e lo carica lì. */
function openGpxOnMap(name, xml) {
  document.querySelectorAll(".modal-bg").forEach((m) => m.remove());
  if (state.tab === "mappa" && window.__gcLoadGpx) window.__gcLoadGpx(name, xml);
  else { state.pendingGpx = { name, xml }; state.tab = "mappa"; renderCalendar(); }
}

/** «APRI GPX»: sul dispositivo, da un evento del calendario o dal mio spazio. */
function openGpxChoice() {
  const w = modal(`
    <h3>APRI GPX</h3>
    <div class="menu-list">
      <button type="button" data-g="dev">📱 Dal dispositivo</button>
      <button type="button" data-g="cal">📅 Dal calendario</button>
      ${state.user ? `<button type="button" data-g="mine">☁ Il mio spazio</button>` : ""}
    </div>
    <div class="row end gap" style="margin-top:12px"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector('[data-g="dev"]').onclick = () => { w.remove(); const b = $("#mapMine"); if (b) b.click(); };
  w.querySelector('[data-g="cal"]').onclick = () => { w.remove(); openCalendarGpxPicker(); };
  const mb = w.querySelector('[data-g="mine"]'); if (mb) mb.onclick = () => { w.remove(); openMySpaceDialog(); };
}

/** Elenco degli eventi del calendario che hanno una traccia GPX: se ne sceglie uno per aprirlo sulla mappa. */
function openCalendarGpxPicker() {
  const list = (state.events || []).filter((e) => e.gpxData);
  const w = modal(`
    <h3>GPX dal calendario</h3>
    ${list.length ? `<div class="menu-list" style="max-height:60vh;overflow:auto">${list.map((e, i) => `<button type="button" data-i="${i}"><b>${esc(e.titolo || "Uscita")}</b><span class="muted small"> ${esc(e.data || "")}</span></button>`).join("")}</div>`
      : `<p class="muted small">Nessuna uscita di questo calendario ha una traccia GPX.</p>`}
    <div class="row end gap" style="margin-top:12px"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelectorAll("[data-i]").forEach((b) => b.onclick = async () => {
    const e = list[+b.dataset.i];
    try { const xml = await decompressGpx(e.gpxData); if (!xml) throw 0; w.remove(); openGpxOnMap(e.titolo || "GPX", xml); }
    catch { toast("GPX non leggibile."); }
  });
}

/** «Collega in un mio calendario»: dal calendario di un altro (pubblico) si sceglie uno dei miei calendari dove far comparire l'evento, in sola lettura. */
async function openLinkToMineDialog(e, sourceCode) {
  const w = modal(`
    <h3>Collega in un mio calendario</h3>
    <p class="muted small">L'evento «${esc(e.titolo || "Uscita")}» comparirà nel calendario che scegli, in sola lettura; resta nell'originale e si aggiorna da solo.</p>
    <div id="lkMineList"><p class="muted small">Carico…</p></div>
    <div class="row end gap" style="margin-top:12px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  const listEl = w.querySelector("#lkMineList");
  let cals = [];
  try { cals = (await myCalendars()).filter((c) => c.code !== sourceCode); } catch { /* resta vuoto */ }
  if (!cals.length) { listEl.innerHTML = `<p class="muted small">Non hai altri calendari dove sei editor.</p>`; return; }
  listEl.innerHTML = `<div class="menu-list">${cals.map((c) => `
    <button type="button" class="lk-target" data-code="${esc(c.code)}">${esc(c.name || c.code)} <code class="muted small">${esc(c.code)}</code></button>`).join("")}</div>`;
  listEl.querySelectorAll(".lk-target").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const col = collection(db, "calendars", b.dataset.code, "links");
      const dup = await getDocs(query(col, where("srcCode", "==", sourceCode), where("srcEventId", "==", e.id)));
      if (!dup.empty) { toast("Già collegato a quel calendario"); b.disabled = false; return; }
      await addDoc(col, { srcCode: sourceCode, srcEventId: e.id, byUid: state.user.uid, atMillis: Date.now() });
      w.remove(); toast("Evento collegato");
    } catch (err) { toast("Collegamento non riuscito: " + (err.message || err)); b.disabled = false; }
  });
}

async function openCloneEventDialog(e, sourceCode) {
  const w = modal(`
    <h3>Clona in un mio calendario</h3>
    <div id="cloneList"><p class="muted small">Carico…</p></div>
    <div class="row end gap" style="margin-top:12px">
      <button class="btn ghost" data-close>Chiudi</button>
    </div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  const cals = (await myCalendars()).sort((a, b) => (b.code === sourceCode) - (a.code === sourceCode));  // il calendario aperto in cima: si può clonare anche qui e poi riprogrammare
  const listEl = w.querySelector("#cloneList");
  if (!cals.length) {
    listEl.innerHTML = `<p class="muted small">Non hai altri calendari dove sei editor.</p>`;
    return;
  }
  listEl.innerHTML = `<div class="menu-list">${cals.map((c) => `
    <button type="button" class="clone-target" data-code="${esc(c.code)}">
      ${esc(c.name || c.code)} <code class="muted small">${esc(c.code)}</code>${c.code === sourceCode ? ` <span class="muted small">(questo calendario)</span>` : ""}
    </button>`).join("")}</div>`;
  listEl.querySelectorAll(".clone-target").forEach((b) => b.onclick = async () => {
    const targetCode = b.dataset.code;
    b.disabled = true;
    try {
      const { id, hasAudio, partecipanti, forse, archivedAtMillis, ...rest } = e;
      const newRef = await addDoc(collection(db, "calendars", targetCode, "events"), { ...rest, annullata: false, partecipanti: [], forse: [] });
      if (e.hasAudio) {
        try {
          const snap = await getDoc(doc(db, "calendars", sourceCode, "events", e.id, "audio", "clip"));
          if (snap.exists()) {
            await setDoc(doc(db, "calendars", targetCode, "events", newRef.id, "audio", "clip"), snap.data());
            await updateDoc(newRef, { hasAudio: true });
          }
        } catch (err) { console.warn("clone audio copy failed", err); }
      }
      w.remove();
      toast("Evento clonato");
    } catch (err) { toast(err.message || "Errore"); b.disabled = false; }
  });
}

function downscaleForCard(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 800;
      // versione intera (photoData): scala senza ritaglio
      const scaleFull = Math.min(1, maxW / img.width);
      const cvFull = document.createElement("canvas");
      cvFull.width = img.width * scaleFull; cvFull.height = img.height * scaleFull;
      cvFull.getContext("2d").drawImage(img, 0, 0, cvFull.width, cvFull.height);
      const photoData = toJpegBase64(cvFull);

      // versione crop 16:9 (cardBgData)
      const ratio = 16 / 9;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (sw / sh > ratio) { sw = sh * ratio; sx = (img.width - sw) / 2; }
      else { sh = sw / ratio; sy = (img.height - sh) * 0.35; }
      const cvCrop = document.createElement("canvas");
      cvCrop.width = maxW; cvCrop.height = maxW / ratio;
      cvCrop.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cvCrop.width, cvCrop.height);
      const cardBgData = toJpegBase64(cvCrop);

      resolve({ cardBgData, photoData });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function toJpegBase64(canvas) {
  let q = 0.85, out;
  do { out = canvas.toDataURL("image/jpeg", q); q -= 0.15; } while (out.length > 240000 && q > 0.2);
  return out.split(",")[1];
}

function itToIso(it) { const p = (it || "").split("/"); if (p.length !== 3) return ""; return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`; }
function isoToIt(iso) { const p = (iso || "").split("-"); if (p.length !== 3) return ""; return `${p[2]}/${p[1]}/${p[0]}`; }

// ─────────────────────────────────────────────────────────────
// Proponi evento (pubblico, senza login)
// ─────────────────────────────────────────────────────────────
function openProposeDialog() {
  // Stesso form di "Nuova uscita" (eventFormHtml/readEventForm/wireEventForm), con GPX, immagine e audio.
  const e = { titolo: "", data: "", ora: "", localita: "", ritrovo: "", proponente: LS.myName(), waProponente: "",
    difficolta: "", linkPercorso: "", link2: "", video: "", note: "",
    cardBgData: "", photoData: "", gpxData: "", gpxFileName: "", audioData: "", audioMimeType: "" };
  const w = modal(`
    <h3>Proponi un'uscita</h3>
    <p class="muted small">La tua proposta verrà rivista dagli amministratori del calendario prima di essere pubblicata.</p>
    ${eventFormHtml(e, { isProposal: true })}
    <div id="evErr" class="err"></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="evSave">Invia proposta</button></div>
  `, { large: true });
  w.querySelector("[data-close]").onclick = () => w.remove();
  const media = wireEventForm(w, e);
  w.querySelector("#evSave").onclick = async () => {
    const data = readEventForm(w);
    if (!data.titolo || !data.data) { w.querySelector("#evErr").textContent = "Titolo e data sono obbligatori."; return; }
    if (data.proponente) LS.setMyName(data.proponente);
    Object.assign(data, { cardBgData: media.cardBgData, photoData: media.photoData, gpxData: media.gpxData, gpxFileName: media.gpxFileName,
      audioData: media.audioData, audioMimeType: media.audioMimeType });
    try {
      if (!state.user) throw new Error("Accedi con Google per proporre un'uscita.");
      // una sola proposta in attesa per utente: id = uid (imposto dalle regole)
      const propRef = doc(db, "calendars", state.code, "proposals", state.user.uid);
      await setDoc(propRef, { ...data, proposedAtMillis: Date.now() });
      // notifica push agli editor del calendario (fire-and-forget: la funzione rilegge la proposta da Firestore)
      fetch("/api/notify-proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: state.code, id: propRef.id }) }).catch(() => {});
      w.remove();
      toast("Proposta inviata, grazie!");
    } catch (err) { w.querySelector("#evErr").textContent = err.code === "permission-denied" ? "Hai già una proposta in attesa di revisione (o non puoi proporre in questo calendario)." : (err.message || "Errore durante l'invio"); }
  };
}

async function openProposalsDialog() {
  const w = modal(`<h3>Proposte</h3><div id="prList"><div class="spin"></div></div><div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  const qs = await getDocs(collection(db, "calendars", state.code, "proposals"));
  const proposals = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.proposedAtMillis || 0) - (a.proposedAtMillis || 0));
  const listEl = w.querySelector("#prList");
  if (!proposals.length) { listEl.innerHTML = `<p class="muted small">Nessuna proposta in attesa.</p>`; return; }
  listEl.innerHTML = proposals.map((p) => `
    <div class="card pad" style="margin-bottom:10px">
      <b>${esc(p.titolo)}</b> ${diffBadge(p.difficolta)}
      <div class="muted small">${esc(p.data)}${p.ora ? " · " + esc(p.ora) : ""} ${p.localita ? "· " + esc(p.localita) : ""}</div>
      ${p.proponente ? `<div class="muted small">Proposto da ${esc(p.proponente)}</div>` : ""}
      <div class="row end gap" style="margin-top:10px">
        <button class="btn ghost" data-reject="${p.id}">Rifiuta</button>
        <button class="btn ghost" data-review="${p.id}">Rivedi</button>
        <button class="btn" data-approve="${p.id}">Approva</button>
      </div>
    </div>`).join("");
  listEl.querySelectorAll("[data-reject]").forEach((b) => b.onclick = async () => {
    if (!confirm("Rifiutare questa proposta?")) return;
    await deleteDoc(doc(db, "calendars", state.code, "proposals", b.dataset.reject));
    b.closest(".card").remove();
  });
  listEl.querySelectorAll("[data-review]").forEach((b) => b.onclick = () => {
    const p = proposals.find((x) => x.id === b.dataset.review);
    w.remove();
    openEventDialog({ ...p, id: undefined }, { fromProposal: p.id, isNewFrom: true });
  });
  listEl.querySelectorAll("[data-approve]").forEach((b) => b.onclick = async () => {
    const p = proposals.find((x) => x.id === b.dataset.approve);
    const { id, proposedAtMillis, ...data } = p;
    await addDoc(collection(db, "calendars", state.code, "events"), { ...data, partecipanti: [], forse: [] });
    await deleteDoc(doc(db, "calendars", state.code, "proposals", p.id));
    b.closest(".card").remove();
    toast("Proposta approvata");
  });
}

// ─────────────────────────────────────────────────────────────
// Archivio
// ─────────────────────────────────────────────────────────────
async function openArchiveDialog() {
  const w = modal(`<h3>Archivio</h3><div id="arList"><div class="spin"></div></div><div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`, { large: true });
  w.querySelector("[data-close]").onclick = () => w.remove();
  const qs = await getDocs(collection(db, "calendars", state.code, "archived"));
  const archived = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.archivedAtMillis || 0) - (a.archivedAtMillis || 0));
  const listEl = w.querySelector("#arList");
  if (!archived.length) { listEl.innerHTML = `<p class="muted small">Nessun evento archiviato.</p>`; return; }
  listEl.innerHTML = archived.map((e) => `
    <div class="card pad" style="margin-bottom:10px">
      <b>${esc(e.titolo)}</b> ${diffBadge(e.difficolta)}
      <div class="muted small">${esc(e.data)}${weekdayLabel(e.data) ? " " + weekdayLabel(e.data) : ""}${e.ora ? " · " + esc(e.ora) : ""} ${e.localita ? "· " + esc(e.localita) : ""}</div>
      <div class="row end gap" style="margin-top:10px">
        <button class="btn danger" data-del="${e.id}">Elimina</button>
        <button class="btn ghost" data-epic="${e.id}" title="Aggiungi a Epici">⭐ Epici</button>
        <button class="btn" data-repesca="${e.id}">Ripesca</button>
      </div>
    </div>`).join("");
  listEl.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("Eliminare definitivamente?")) return;
    await deleteDoc(doc(db, "calendars", state.code, "archived", b.dataset.del));
    b.closest(".card").remove();
  });
  listEl.querySelectorAll("[data-repesca]").forEach((b) => b.onclick = () => {
    const e = archived.find((x) => x.id === b.dataset.repesca);
    w.remove();
    openEventDialog({ ...e, id: undefined, data: "", partecipanti: [], forse: [] }, { isNewFrom: true });
  });
  listEl.querySelectorAll("[data-epic]").forEach((b) => b.onclick = () => {
    const e = archived.find((x) => x.id === b.dataset.epic);
    // L'evento archiviato ha l'audio (se presente) sotto archived/{id}/audio/clip, non
    // events/{id}/audio/clip: passiamo un evento "virtuale" col path giusto per il fetch
    // dell'audio dentro openAddToEpicsConfirm (che assume events/ per default).
    openAddToEpicsConfirmFromArchived(e);
  });
}

/** Come [openAddToEpicsConfirm] ma per un evento ARCHIVIATO: l'audio (se presente) va letto
 * da archived/{id}/audio/clip invece di events/{id}/audio/clip. */
function openAddToEpicsConfirmFromArchived(e) {
  const w = modal(`
    <h3>Aggiungere "${esc(e.titolo || "Uscita")}" a Epici?</h3>
    <p class="muted small">Viene creata una copia in Epici (senza data/ora/partecipanti). L'uscita archiviata resta invariata.</p>
    <div class="row end gap" style="margin-top:16px">
      <button class="btn ghost" data-close>Annulla</button>
      <button class="btn" id="confirmAddEpic">Conferma</button>
    </div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#confirmAddEpic").onclick = async () => {
    try {
      const { id, hasAudio, partecipanti, forse, archivedAtMillis, ...rest } = e;
      const newRef = await addDoc(collection(db, "calendars", state.code, "epics"), { ...rest, data: "", ora: "", partecipanti: [], forse: [] });
      if (e.hasAudio) {
        try {
          const snap = await getDoc(doc(db, "calendars", state.code, "archived", e.id, "audio", "clip"));
          if (snap.exists()) {
            await setDoc(doc(db, "calendars", state.code, "epics", newRef.id, "audio", "clip"), snap.data());
            await updateDoc(newRef, { hasAudio: true });
          }
        } catch (err) { console.warn("epic audio copy failed", err); }
      }
      w.remove();
      toast("Aggiunto a Epici");
    } catch (err) { toast(err.message || "Errore"); }
  };
}

// ─────────────────────────────────────────────────────────────
// Info calendario / Collaboratori / Comunicazioni
// ─────────────────────────────────────────────────────────────
function openCalendarInfoDialog() {
  openEditCalendarFromListDialog(state.code, () => {});
}

function openEditorsDialog() {
  openEditorsDialogForCode(state.code, state.calendar, () => {});
}

/** Dialog "Info calendario" per un codice arbitrario (non necessariamente state.code): usata
 * sia dal menu del calendario aperto sia dalla lista "I miei calendari" nella home. Include
 * nome/descrizione/visibilità/colore-logo, e un pulsante per aprire i Collaboratori.
 * [onSaved] è chiamato dopo ogni salvataggio, per far ricaricare la lista al chiamante. */
async function openEditCalendarFromListDialog(code, onSaved) {
  const snap = await getDoc(doc(db, "calendars", code));
  if (!snap.exists()) { toast("Calendario non trovato."); return; }
  const t = { code, ...snap.data() };
  const w = modal(`
    <h3>Info calendario</h3>
    ${logoPickerHtml("eLogo")}
    <label>Nome <input id="tN" value="${esc(t.name)}"></label>
    <label>Descrizione <input id="tD" value="${esc(t.description)}"></label>
    <label class="row between center" style="margin-top:6px">
      <span>Calendario pubblico<br><span class="muted small">Compare nell'elenco</span></span>
      <input id="tPub" type="checkbox" ${t.listed !== false ? "checked" : ""} style="width:auto">
    </label>
    ${t.openCount ? `<p class="muted small">Aperto ${t.openCount} volte (statistica approssimativa)</p>` : ""}
    <button type="button" class="btn ghost block" id="tEditors" style="margin-top:6px">Gestisci collaboratori</button>
    <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="tGo">Salva</button></div>
  `);
  let logo = { logoColor: t.logoColor || "", logoData: t.logoData || "" };
  wireLogoPicker(w, "eLogo", logo, (v) => { logo = v; });
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#tEditors").onclick = () => openEditorsDialogForCode(code, t, onSaved);
  w.querySelector("#tGo").onclick = async () => {
    await updateDoc(doc(db, "calendars", code), {
      name: w.querySelector("#tN").value.trim(),
      description: w.querySelector("#tD").value.trim(),
      listed: w.querySelector("#tPub").checked,
      logoColor: logo.logoColor,
      logoData: logo.logoData,
    });
    w.remove();
    onSaved();
  };
}

/** Dialog Collaboratori per un codice arbitrario, con uid troncato con ellissi (invece di
 * andare a capo scomposto su schermi stretti) — stesso fix applicato in EditorsDialog.kt. */
function openEditorsDialogForCode(code, calendar, onSaved) {
  const t = calendar;
  const shortUid = (uid) => uid.length > 10 ? uid.slice(0, 6) + "…" + uid.slice(-4) : uid;
  const w = modal(`
    <h3 style="margin:0 0 4px">Collaboratori</h3>
    <p class="muted small" style="margin:0 0 4px">Chi è in lista può modificare le uscite. Aggiungi incollando il codice utente (lo trova alla voce Account).</p>
    <div class="ed-list">${(t.editors || []).map((uid) => `
      <div class="ed-row">
        <code title="${esc(uid)}">${esc(shortUid(uid))}</code>
        <button class="icon-btn" data-copy="${esc(uid)}" title="Copia">⧉</button>
        ${uid === t.ownerUid ? "<span class='chip'>tu</span>" : `<button class="icon-btn" data-rm="${esc(uid)}" title="Rimuovi">🗑</button>`}
      </div>`).join("")}</div>
    <div class="row gap" style="margin-top:6px"><input id="edUid" placeholder="Codice utente" style="flex:1;padding:6px 8px"><button class="btn" id="edAdd" style="padding:6px 12px">+</button></div>
    <div class="row end" style="margin-top:6px"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast("Copiato")));
  w.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => {
    await updateDoc(doc(db, "calendars", code), { editors: arrayRemove(b.dataset.rm) });
    onSaved(); w.remove();
  });
  w.querySelector("#edAdd").onclick = async () => {
    const uid = w.querySelector("#edUid").value.trim();
    if (uid.length < 20) return;
    await updateDoc(doc(db, "calendars", code), { editors: arrayUnion(uid) });
    onSaved(); w.remove();
  };
}

/** Lista nera per account (owner e collaboratori): "edit" = niente modifiche né proposte, "ban" = niente accesso. */
async function openBlacklistDialog() {
  const code = state.code;
  const col = collection(db, "calendars", code, "blocks");
  const load = async () => (await getDocs(col)).docs.map((d) => ({ uid: d.id, ...d.data() }));
  const w = modal(`<h3 style="margin:0 0 4px">Lista nera</h3>
    <p class="muted small" style="margin:0 0 4px">Per account. «Escludi modifica»: non può più modificare né inviare proposte. «Accesso negato»: non può più aprire il calendario. Non vale per chi usa il calendario senza accedere.</p>
    <div id="blList" class="ed-list"></div>
    <div class="row gap" style="margin-top:6px"><select id="blLevel" style="padding:6px"><option value="edit">Escludi modifica</option><option value="ban">Accesso negato</option></select>
      <input id="blIn" placeholder="Email o codice utente" style="flex:1;padding:6px 8px"><button class="btn" id="blAdd" style="padding:6px 12px">+</button></div>
    <div id="blErr" class="muted small" style="color:#e74c3c"></div>
    <div class="row end" style="margin-top:6px"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  const draw = async () => {
    const list = await load();
    w.querySelector("#blList").innerHTML = list.length ? list.map((b) => `<div class="ed-row"><span style="flex:1;font-size:.8rem;overflow:hidden;text-overflow:ellipsis">${esc(b.label || b.uid.slice(0, 6) + "…")} · <span style="color:#e74c3c">${b.level === "ban" ? "Accesso negato" : "Escludi modifica"}</span></span><button class="icon-btn" data-rm="${esc(b.uid)}" title="Rimuovi">🗑</button></div>`).join("") : `<p class="muted small">Nessun account in lista nera.</p>`;
    w.querySelectorAll("[data-rm]").forEach((x) => x.onclick = async () => { await deleteDoc(doc(db, "calendars", code, "blocks", x.dataset.rm)); draw(); });
  };
  draw();
  w.querySelector("#blAdd").onclick = async () => {
    const raw = w.querySelector("#blIn").value.trim(); const err = w.querySelector("#blErr"); err.textContent = "";
    let uid = raw, label = "";
    if (raw.includes("@")) { uid = raw.toLowerCase(); label = uid; }  // l'id del blocco è l'email: non serve che l'account sia indicizzato
    else if (raw.length < 20) { err.textContent = "Inserisci un'email valida o il codice utente completo."; return; }
    try {
      await setDoc(doc(db, "calendars", code, "blocks", uid), { level: w.querySelector("#blLevel").value, label: label || uid.slice(0, 6) + "…" + uid.slice(-4), byUid: state.user.uid, atMillis: Date.now() });
      w.querySelector("#blIn").value = ""; draw();
    } catch (e) { err.textContent = "Operazione non riuscita."; }
  };
}

/** Pulsante "?" della mappa: come leggere le icone, modificare trail e zone, e cosa mostra "GPX". */
/** Nuovo / modifica punto di interesse (collezione `pois`): nome, descrizione, tipo. */
function openPoiDialog(p, at, onDone) {
  if (!state.user) { toast("Accedi per aggiungere un punto di interesse"); return; }
  const types = [["ritrovo", "🚩 Punto di ritrovo"], ["vetta", "⛰️ Vetta"], ["picnic", "🧺 Area picnic"], ["altro", "⭐ Altro"]];
  const cur = p || { name: "", desc: "", type: "ritrovo" };
  const w = modal(`
    <h3>${p ? "Modifica punto di interesse" : "Nuovo punto di interesse"}</h3>
    <label>Nome * <input id="poiName" maxlength="100" value="${esc(cur.name)}"></label>
    <label>Descrizione <textarea id="poiDesc" rows="4" maxlength="2000">${esc(cur.desc)}</textarea></label>
    <label>Tipo <select id="poiType">${types.map(([v, l]) => `<option value="${v}" ${cur.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <div id="poiErr" class="err"></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="poiSave">Salva</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#poiSave").onclick = async () => {
    const name = w.querySelector("#poiName").value.trim();
    if (!name) { w.querySelector("#poiErr").textContent = "Il nome è obbligatorio."; return; }
    const who = state.user.displayName || (state.user.email || "").split("@")[0];
    const data = { name, desc: w.querySelector("#poiDesc").value.trim(), type: w.querySelector("#poiType").value };
    try {
      if (p) { await setDoc(doc(db, "pois", p.id), { ...data, updatedByName: who, updatedAtMillis: Date.now() }, { merge: true }); logTrail("poi_edit", name, data.type); }
      else await addDoc(collection(db, "pois"), { ...data, lat: at.lat, lon: at.lon, createdByUid: state.user.uid, createdByName: who, createdAtMillis: Date.now() }).then(() => logTrail("poi_create", name, data.type));
      w.remove(); toast("Punto salvato"); if (onDone) onDone();
    } catch (e) { w.querySelector("#poiErr").textContent = e.message || "Errore"; }
  };
}

function openMapHelp() {
  const sec = [
    ["Occhi sulla mappa", "Z = zone, L = loghi dei costruttori, T = tracciati dei trail, N = nomi dei trail, P = punti di interesse, G = il tuo GPX. Occhio aperto = visibile, occhio barrato = nascosto. ⛶ apre e chiude lo schermo intero: per disegnare sulla mappa usa lo schermo intero."],
    ["Cercare un luogo", "La lente sotto il selettore dei layer apre la ricerca: scrivi il nome di un paese, una valle o un rifugio e premi Invio. Tocca un risultato: la mappa si sposta lì e compare un segnaposto rosso per qualche secondo."],
    ["Modificare i trail", "Serve il login. Tocca la matita: da «sola lettura» passa a «modifica» (si rispegne a ogni avvio). In modifica puoi: «Importa GPX» per caricare i tracciati dai file; «Traccia» per disegnare il percorso (viene agganciato ai sentieri OpenStreetMap) e salvarlo su un trail esistente o nuovo; «Sentiero» per selezionare un sentiero fino all'incrocio («Estendi» per proseguire). Per correggere un tracciato già sulla mappa tienilo premuto (o clic destro) e scegli Modifica o Cancella: trascina i punti, tocca ◦ per aggiungerne uno, tieni premuto un punto per toglierlo, poi Salva."],
    ["Modificare le zone", "Una zona è un perimetro informativo. In modifica, «Zona»: tocca la mappa per mettere i vertici, poi scegli una zona esistente o creane una nuova. Per cambiare il perimetro, tocca il nome della zona (o tienilo premuto) e scegli Modifica, Cancella oppure Costruttori (i loghi dei costruttori dei trail)."],
    ["Punti di interesse (POI)", "Un POI è un punto con nome e descrizione: punto di ritrovo (bandierina su fondo blu), vetta, area picnic o altro. L'occhio P li mostra o li nasconde. Toccane uno: si apre il fumetto con descrizione, chi l'ha aggiunto e chi l'ha modificato, e il pulsante «Naviga» per raggiungerlo con Google Maps, Waze o Apple Maps. Per aggiungerne uno serve il login: in modifica tocca «POI» e poi la mappa dove metterlo, scrivi nome e descrizione e scegli il tipo; toccando un POI compaiono anche Modifica ed Elimina. Nella mappa 3D i POI si vedono da soli, appoggiati al terreno."],
    ["Mostrare il tuo GPX", "Tocca «GPX» e scegli un file GPX: viene disegnato in magenta sulla mappa, senza essere salvato né condiviso. L'occhio G lo nasconde o lo mostra, la ✕ lo elimina dalla mappa."],
    ["Strumenti sul tuo GPX (⋮)", "Il menu ⋮ accanto alla ✕ ha: Statistiche, Ritaglia, Inverti, Semplifica, Salva e Condividi come GPX, «Converti in…» per esportare in KML, GeoJSON, TCX o CSV e, con il login, «Salva come trail…»: sceglie un trail esistente o ne crea uno nuovo con quel tracciato. Anche «Importa GPX» (in modifica) permette di creare un nuovo trail con «+ Trail» per i file senza abbinamento."],
    ["Riprodurre il percorso", "Se il GPX ha i tempi, nel menu ⋮ accanto alla ✕ compare «Riproduci»: un marker percorre il tracciato, grigio sotto e colorato dove è già passato. Il cursore in alto salta nel tempo, il secondo regola la velocità da 1× a 60× (20× di default). ◎ fa seguire il marker dalla mappa (di default la mappa resta libera). «Altimetria» mostra o nasconde il profilo delle quote: toccalo o trascinalo per saltare in un punto."],
    ["L'etichetta in basso del tuo GPX", "Mostra: il nome del file, la lunghezza in km e quanti trail del database hai percorso (quelli coperti per almeno il 60% entro 30 m). Toccala per aprire l'elenco dei trail trovati, con la percentuale di copertura: verde = percorso quasi tutto, «(in parte)» = coperto solo in parte (almeno 25%). Tocca un trail dell'elenco per aprirne il dettaglio. La ✕ dell'elenco lo richiude."],
  ];
  const w = modal(`<h3>Come usare la mappa</h3>
    <div style="max-height:65vh;overflow:auto">${sec.map(([t, b]) => `<p style="margin:10px 0 2px"><b>${esc(t)}</b></p><p class="small" style="margin:0">${esc(b)}</p>`).join("")}</div>
    <div class="row end" style="margin-top:12px"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
}

function openAnnouncementEdit(a) {
  if (!a) return;
  const e = modal(`
    <h3>Modifica comunicazione</h3>
    <label>Titolo <input id="anTitle2" value="${esc(a.title || "")}"></label>
    <label>Testo <textarea id="anText2" rows="8">${esc(a.text || "")}</textarea></label>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="anSave">Salva</button></div>`);
  e.querySelector("[data-close]").onclick = () => e.remove();
  e.querySelector("#anSave").onclick = async () => {
    const text = e.querySelector("#anText2").value.trim();
    if (!text) return;
    await updateDoc(doc(db, "calendars", state.code, "announcements", a.id), { title: e.querySelector("#anTitle2").value.trim(), text });
    e.remove();
  };
}

async function openAnnouncementDialog(onlyNew = false) {
  const w = modal(`
    <h3>${onlyNew ? "Nuovo avviso" : "Comunicazioni"}</h3>
    <label>Titolo <input id="anTitle"></label>
    <label>Nuova comunicazione (supporta **grassetto**) <textarea id="anText"></textarea></label>
    <button class="btn block" id="anAdd">Pubblica</button>
    <div id="anList" style="margin-top:14px">${onlyNew ? "" : state.announcements.map((a) => `
      <div class="row between" style="margin-bottom:8px">
        <div>${a.title ? `<b>${esc(a.title)}</b>` : ""}${richText(a.text)}<div class="ann-date">${new Date(a.createdAtMillis || 0).toLocaleDateString(window.GC_LOCALE)}</div></div>
        <span><button class="icon-btn" data-mv="-1" data-id="${a.id}">▲</button><button class="icon-btn" data-mv="1" data-id="${a.id}">▼</button><button class="icon-btn" data-edit="${a.id}">✏️</button><button class="icon-btn" data-del="${a.id}">🗑</button></span>
      </div>`).join("")}</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#anAdd").onclick = async () => {
    const text = w.querySelector("#anText").value.trim();
    if (!text) return;
    await addDoc(collection(db, "calendars", state.code, "announcements"), { title: w.querySelector("#anTitle").value.trim(), text, createdAtMillis: Date.now() });
    w.remove();
  };
  w.querySelectorAll("[data-mv]").forEach((b) => b.onclick = async () => {
    const ids = state.announcements.map((x) => x.id);
    const i = ids.indexOf(b.dataset.id), j = i + Number(b.dataset.mv);
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    await Promise.all(ids.map((id, k) => updateDoc(doc(db, "calendars", state.code, "announcements", id), { sortOrder: k })));
    w.remove(); openAnnouncementDialog();
  });
  w.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
    const a = state.announcements.find((x) => x.id === b.dataset.edit);
    if (!a) return;
    w.remove();
    openAnnouncementEdit(a);
  });
  w.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    await deleteDoc(doc(db, "calendars", state.code, "announcements", b.dataset.del));
    b.closest(".row").remove();
  });
}

// ─────────────────────────────────────────────────────────────
// TRAIL: sentieri e stato di percorribilità, condivisi da tutta l'app (non legati al
// calendario aperto). Allineato a TrailModels.kt/TrailRepository.kt dell'app Android.
// ─────────────────────────────────────────────────────────────
const TRAIL_STATUS = {
  open: { label: "Aperto", color: "#27AE60" },
  caution: { label: "Attenzione", color: "#F2994A" },
  closed: { label: "Chiuso", color: "#E74C3C" },
};

/** Scheda evento: stato attuale dei trail della zona (letto al momento dell'apertura). */
async function renderEventTrails(box, zone) {
  if (!box) return;
  try {
    const qs = await getDocs(query(collection(db, "trails"), where("zone", "==", zone)));
    const list = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
    const head = `<div class="lbl">${esc(tr("Trail"))} – ${esc(zone)}</div>`;
    if (!list.length) { box.innerHTML = head + `<div class="muted small">${esc(tr("Nessun trail in questa zona."))}</div>`; return; }
    const st = (t) => TRAIL_STATUS[t.status] || TRAIL_STATUS.open;
    const counts = Object.entries(TRAIL_STATUS).map(([id, s]) => {
      const n = list.filter((t) => (t.status || "open") === id).length;
      return n ? `<span class="dot sm" style="background:${s.color}"></span> ${n}` : "";
    }).filter(Boolean).join(" &nbsp; ");
    box.innerHTML = `${head}<a href="#" class="det-link" id="evTrToggle">${counts} ▼</a><div id="evTrList" style="display:none;margin-top:4px">${list.map((t) => `
      <div class="row center gap" style="margin:3px 0"><span class="dot sm" style="background:${st(t).color}"></span>
      <span style="flex:1">${esc(t.name || "")}</span>${t.difficulty ? diffBadge(t.difficulty) : ""}
      <span class="small" style="color:${st(t).color};font-weight:700">${esc(st(t).label)}</span></div>`).join("")}</div>`;
    box.querySelector("#evTrToggle").onclick = (ev) => { ev.preventDefault(); const l = box.querySelector("#evTrList"); l.style.display = l.style.display === "none" ? "" : "none"; };
  } catch { box.innerHTML = `<div class="lbl">${esc(tr("Trail"))} – ${esc(zone)}</div><div class="muted small">—</div>`; }
}

async function fetchTrails() {
  // Zone create "senza trail" (trailZones): servono per mostrarle vuote nell'elenco e nel menu zona.
  try { state.zoneNames = (await getDocs(collection(db, "trailZones"))).docs.map((d) => (d.data().zone || "").trim()).filter(Boolean); } catch {}
  const qs = await getDocs(collection(db, "trails"));
  return qs.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.zone || "").toLowerCase().localeCompare((b.zone || "").toLowerCase())
      || (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
}

function observeTrailComments(trailId, cb) {
  return onSnapshot(collection(db, "trails", trailId, "comments"), (qs) => {
    const list = qs.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
    cb(list);
  });
}

/** true se l'utente è owner di almeno un calendario (privilegi "admin" sui trail), leggendo
 * l'indice admins/{uid} scritto da createCalendar. */
async function isTrailAdmin() {
  if (!state.user) return false;
  try {
    const snap = await getDoc(doc(db, "admins", state.user.uid));
    return snap.exists();
  } catch { return false; }
}

async function createTrail(name, zone, difficulty) {
  const uid = state.user?.uid;
  if (!uid) throw new Error("Accedi con Google per aggiungere un trail.");
  const ref = doc(collection(db, "trails"));
  await setDoc(ref, {
    name: name.trim(), zone: zone.trim(), status: "open",
    difficulty: difficulty || "",
    createdByUid: uid, createdAtMillis: Date.now(),
    lastUpdateAtMillis: 0, lastUpdateByName: "",
  });
  logTrail("create", name.trim(), zone.trim(), { trailId: ref.id, undo: { kind: "delete" } });
  return ref.id;
}

async function deleteTrailDeep(trailId, trailName = "") {
  const snap = await snapshotTrailDoc(trailId);
  const commentsQs = await getDocs(collection(db, "trails", trailId, "comments"));
  for (const c of commentsQs.docs) await deleteDoc(c.ref);
  await deleteDoc(doc(db, "trails", trailId));
  logTrail("delete", trailName, "", { trailId, undo: snap });
}

async function addTrailComment(trailId, text, newStatus, trailName = "") {
  const user = auth.currentUser;
  if (!user) throw new Error("Accedi con Google per commentare.");
  const authorName = user.displayName || (user.email || "").split("@")[0] || "Utente";
  await addDoc(collection(db, "trails", trailId, "comments"), {
    authorUid: user.uid, authorName, text: text.trim(),
    newStatus: newStatus || "", createdAtMillis: Date.now(),
  });
  if (newStatus) {
    await updateDoc(doc(db, "trails", trailId), {
      status: newStatus, lastUpdateAtMillis: Date.now(), lastUpdateByName: authorName,
    });
  }
  logTrail("comment", trailName, newStatus ? (TRAIL_STATUS[newStatus] || {}).label || newStatus : "");
}

/** Pulsante occhio/matita: alterna sola lettura e modifica (solo con login). */
const ICON_STYLE = 'width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
/** Matita (modalità modifica) o matita barrata (sola lettura). */
function pencilSvg(off) {
  return `<svg ${ICON_STYLE}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>${off ? '<path d="M3 3l18 18" stroke-width="2.6"/>' : ""}</svg>`;
}
/** Occhio (nomi visibili) o occhio barrato (nomi nascosti). */
function eyeSvg(off) {
  return `<svg ${ICON_STYLE}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>${off ? '<path d="M3 3l18 18" stroke-width="2.6"/>' : ""}</svg>`;
}
/** Simbolo "ha il tracciato (GPX) sulla mappa" nell'elenco dei trail. */
function routeSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8 19h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6"/></svg>`;
}
function trailModeBtnHtml() {
  if (!state.user) return "";
  const on = LS.trailEdit();
  return `<button class="icon-btn trail-mode ${on ? "on" : ""}" title="${on ? "Modalità modifica (tocca per sola lettura)" : "Sola lettura (tocca per modificare)"}">${pencilSvg(!on)}</button>`;
}
function wireTrailMode(after) {
  document.querySelectorAll(".trail-mode:not(#mapNames)").forEach((b) => b.onclick = () => { if (state.myBlock) { toast("Modifica negata"); return; } LS.setTrailEdit(!LS.trailEdit()); after(); });
}

function relativeDate(ms) {
  if (!ms) return "";
  const d = new Date(ms), today = new Date();
  const diffDays = Math.floor((today - d) / 86400000);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (diffDays === 1) return "Ieri";
  return d.toLocaleDateString(window.GC_LOCALE);
}

/** Markup della lista trail ad albero (zone espandibili), per la tab "TRAIL" del calendario.
 * Usa state.trails/state.trailsExpandedZones/state.trailQuery, popolati da wireCalendarTabBody. */
function trailListHtml() {
  const allTrails = state.trails || [];
  const q = (state.trailQuery || "").trim().toLowerCase();
  const filtered = !q ? allTrails : allTrails.filter((t) =>
    (t.name || "").toLowerCase().includes(q) || (t.zone || "").toLowerCase().includes(q));
  if (q) filtered.forEach((t) => state.trailsExpandedZones.add(t.zone || "—"));
  const emptyZones = (state.zoneNames || []).filter((z) => !allTrails.some((t) => (t.zone || "").trim() === z) && (!q || z.toLowerCase().includes(q)));
  if (!filtered.length && !emptyZones.length) {
    return `<p class="muted small">${allTrails.length ? "Nessun risultato." : "Nessun trail ancora censito."}</p>`;
  }
  const byZone = new Map();
  emptyZones.forEach((z) => byZone.set(z, []));
  filtered.forEach((t) => {
    const z = t.zone || "—";
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(t);
  });
  const zones = [...byZone.keys()].sort((a, b) => a.localeCompare(b));
  return zones.map((z) => {
    const trails = byZone.get(z);
    const open = state.trailsExpandedZones.has(z);
    return `
      <div class="trail-zone">
        <button class="trail-zone-hdr" data-zone="${esc(z)}">
          <span>${open ? "▾" : "▸"}</span><b>${esc(z)}</b><span class="muted small">${trails.length}</span>
        </button>${state.user && LS.trailEdit() && z !== "—" ? `<button class="icon-btn trail-zone-bld" data-zone="${esc(z)}" title="Costruttori dei trail della zona">🏷</button>` : ""}${state.trailAdmin && LS.trailEdit() && z !== "—" ? `<button class="icon-btn trail-zone-rename" data-zone="${esc(z)}" title="Rinomina area">✎</button>` : ""}
        ${open ? trails.map((t) => `
          <div class="trail-row" data-id="${esc(t.id)}">
            <span class="dot sm" style="background:${(TRAIL_STATUS[t.status] || TRAIL_STATUS.open).color}"></span>
            <span class="trail-name">
              <span>${esc(t.name)} ${diffBadge(t.difficulty)}${t.path ? ` <span title="Tracciato GPX sulla mappa" style="color:var(--accent)">${routeSvg()}</span>` : ""}</span>
              ${t.lastUpdateAtMillis ? `<span class="muted small">${esc(t.lastUpdateByName)} · ${relativeDate(t.lastUpdateAtMillis)}</span>` : ""}
            </span>
            <span class="small" style="color:${(TRAIL_STATUS[t.status] || TRAIL_STATUS.open).color};font-weight:700">${(TRAIL_STATUS[t.status] || TRAIL_STATUS.open).label}</span>
          </div>`).join("") + (state.user && LS.trailEdit() && z !== "—" ? `<div class="row end" style="margin:6px 0 2px"><button class="btn ghost trail-zone-add" data-zone="${esc(z)}">+ Trail</button></div>` : "") : ""}
      </div>`;
  }).join("") + `
    ${LS.trailEdit() && state.user ? `<div class="row end" style="margin-top:14px">
      <button class="btn" id="trAdd">+ Trail</button>
    </div>` : ""}`;
}

function wireTrailListHandlers() {
  // Admin (owner di almeno un calendario): abilita rinomina area. Verifica una volta sola,
  // poi ridisegna la lista per mostrare le matite.
  if (state.trailAdmin === undefined && state.user) {
    state.trailAdmin = false;
    isTrailAdmin().then((a) => {
      if (a) { state.trailAdmin = true; if (state.tab === "trail" && $("#trList")) { $("#trList").innerHTML = trailListHtml(); wireTrailListHandlers(); } }
    });
  }
  $$(".trail-zone-bld").forEach((b) => b.onclick = async () => {
    const zone = b.dataset.zone, id = normTxt(zone).replace(/\s+/g, "-") || "zona";
    let cur = [];
    try { const sn = await getDoc(doc(db, "trailZones", id)); if (sn.exists()) cur = sn.data().builders || []; } catch {}
    openZoneBuilders(zone, cur, () => {});
  });
  $$(".trail-zone-rename").forEach((b) => b.onclick = () => {
    const old = b.dataset.zone;
    const m = modal(`<h3>Rinomina area</h3>
      <input id="zrName" value="${esc(old)}" style="width:100%">
      <div id="zrErr" class="err"></div>
      <div class="row between" style="margin-top:10px"><button class="btn" id="zrDel" style="background:#c62828">Elimina zona</button><span class="row gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="zrGo">Salva</button></span></div>`);
    m.querySelector("#zrDel").onclick = async () => {
      const n = (state.trails || []).filter((t) => (t.zone || "").trim() === old).length;
      if (!confirm(n ? `Eliminare la zona «${old}» e definitivamente i suoi ${n} trail (con commenti), il perimetro e i costruttori?` : `Eliminare la zona «${old}» (perimetro e costruttori)?`)) return;
      try {
        const qs = await getDocs(query(collection(db, "trails"), where("zone", "==", old)));
        for (const d of qs.docs) {
          const cs = await getDocs(collection(db, "trails", d.id, "comments"));
          for (const c of cs.docs) await deleteDoc(c.ref);
          await deleteDoc(d.ref);
        }
        try { await deleteDoc(doc(db, "trailZones", normTxt(old).replace(/\s+/g, "-") || "zona")); } catch {}
        logTrail("zone_delete_all", old, `${qs.size} trail eliminati`);
        state.trails = await fetchTrails(); m.remove();
        $("#trList").innerHTML = trailListHtml(); wireTrailListHandlers(); toast("Zona eliminata");
      } catch (e) { m.querySelector("#zrErr").textContent = e.message || "Eliminazione non riuscita"; }
    };
    m.querySelector("[data-close]").onclick = () => m.remove();
    m.querySelector("#zrGo").onclick = async () => {
      const nn = m.querySelector("#zrName").value.trim();
      if (!nn || nn === old) { m.remove(); return; }
      try {
        await renameZoneTo(old, nn);
        if (state.trailsExpandedZones.delete(old)) state.trailsExpandedZones.add(nn);
        state.trails = await fetchTrails();
        m.remove();
        $("#trList").innerHTML = trailListHtml();
        wireTrailListHandlers();
      } catch (e) { m.querySelector("#zrErr").textContent = e.message || "Rinomina non riuscita"; }
    };
  });
  $$(".trail-zone-hdr").forEach((b) => b.onclick = () => {
    const z = b.dataset.zone;
    if (state.trailsExpandedZones.has(z)) state.trailsExpandedZones.delete(z);
    else state.trailsExpandedZones.add(z);
    $("#trList").innerHTML = trailListHtml();
    wireTrailListHandlers();
  });
  $$(".trail-row").forEach((r) => r.onclick = () => {
    const t = (state.trails || []).find((x) => x.id === r.dataset.id);
    if (t) openTrailDetailDialog(t, () => fetchTrails().then((l) => {
      state.trails = l;
      $("#trList").innerHTML = trailListHtml();
      wireTrailListHandlers();
    }));
  });
  const afterAdd = () => fetchTrails().then((l) => {
    state.trails = l;
    $("#trList").innerHTML = trailListHtml();
    wireTrailListHandlers();
  });
  $("#trAdd") && ($("#trAdd").onclick = () => openAddTrailDialog(afterAdd));
  $$(".trail-zone-add").forEach((b) => b.onclick = () => openAddTrailDialog(afterAdd, b.dataset.zone));
}

function openAddTrailDialog(onDone, zone0) {
  if (!state.user) { doSignIn(); return; }
  const w = modal(`
    <h3>Aggiungi trail</h3>
    <label>Zona
      <select id="atZoneSel">
        ${[...new Set([...(state.trails || []).map((t) => (t.zone || "").trim()), ...(state.zoneNames || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((z) => `<option value="${esc(z)}" ${z === zone0 ? "selected" : ""}>${esc(z)}</option>`).join("")}
        <option value="__new__">+ Nuova zona…</option>
      </select>
      <input id="atZone" placeholder="Nome della nuova zona" hidden>
    </label>
    <label>Nome trail <input id="atName" placeholder="(vuoto con nuova zona = solo zona)"></label>
    <label>Difficoltà (opzionale)
      <div class="diff-grid" id="atDiffGrid">
        <button type="button" class="diff-opt sel" data-v="">Nessuna</button>
        ${Object.entries(DIFFICULTY).map(([id, label]) => `<button type="button" class="diff-opt" data-v="${id}">${label}</button>`).join("")}
      </div>
    </label>
    <div id="atErr" class="err"></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="atGo">Aggiungi</button></div>
  `);
  w.querySelector("[data-close]").onclick = () => w.remove();
  const zSel = w.querySelector("#atZoneSel"), zNew = w.querySelector("#atZone");
  const syncZone = () => { zNew.hidden = zSel.value !== "__new__"; if (!zNew.hidden) zNew.focus(); };
  zSel.onchange = syncZone; syncZone();
  w.querySelectorAll("#atDiffGrid .diff-opt").forEach((b) => b.onclick = () => {
    w.querySelectorAll("#atDiffGrid .diff-opt").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  });
  w.querySelector("#atGo").onclick = async () => {
    const name = w.querySelector("#atName").value.trim();
    const zone = zSel.value === "__new__" ? zNew.value.trim() : zSel.value;
    if (!name && zSel.value === "__new__" && zone) {
      // Solo zona, senza trail
      try {
        const zid = normTxt(zone).replace(/\s+/g, "-") || "zona", zref = doc(db, "trailZones", zid), zex = await getDoc(zref);
        if (!zex.exists()) await setDoc(zref, { zone, polygon: "", builders: [], createdByUid: state.user.uid, updatedAtMillis: Date.now() });
        logTrail("zone_builders", zone, "zona creata");
        w.remove(); toast("Zona creata"); onDone();
      } catch (e) { w.querySelector("#atErr").textContent = e.message || "Errore"; }
      return;
    }
    if (!name) { w.querySelector("#atErr").textContent = "Il nome è obbligatorio."; return; }
    const diffSel = w.querySelector("#atDiffGrid .diff-opt.sel");
    try {
      await createTrail(name, zone, diffSel ? diffSel.dataset.v : "");
      w.remove(); onDone();
    } catch (e) { w.querySelector("#atErr").textContent = e.message || "Errore"; }
  };
}

function openTrailDetailDialog(trail, onChange) {
  const w = modal(`
    <div class="row gap center" style="margin-bottom:6px">
      <span class="dot sm" style="background:${(TRAIL_STATUS[trail.status] || TRAIL_STATUS.open).color}"></span>
      <div style="flex:1">
        <h3 style="margin-bottom:0">${esc(trail.name)} ${diffBadge(trail.difficulty)}</h3>
        <span class="muted small">${esc(trail.zone)}</span>
      </div>
      <button class="icon-btn" id="tdClose" title="Chiudi">✕</button>
    </div>
    ${trail.path ? `<button class="btn block" id="tdOnMap" style="margin-bottom:10px">🗺 Vedi sulla mappa</button>` : ""}
    <b class="small">Aggiornamenti</b>
    <div id="tdComments" style="margin:8px 0;max-height:220px;overflow:auto"><div class="spin"></div></div>
    <hr style="border:0;border-top:1px solid var(--border);margin:12px 0">
    <div id="tdForm"></div>
  `);
  const commentsEl = w.querySelector("#tdComments");
  const unsub = observeTrailComments(trail.id, (list) => {
    commentsEl.innerHTML = list.length ? list.map((c) => `
      <div style="margin-bottom:10px">
        <div class="row between"><b class="small">${esc(c.authorName)}</b><span class="muted small">${relativeDate(c.createdAtMillis)}${c.editedAtMillis ? " · modificato" : ""}${
          state.user && c.authorUid === state.user.uid
            ? ` <button class="icon-btn tdCmEdit" data-id="${esc(c.id)}" title="Modifica commento">✎</button><button class="icon-btn tdCmDel" data-id="${esc(c.id)}" title="Elimina commento">🗑</button>` : ""}</span></div>
        ${c.newStatus ? `<div class="small" style="color:${(TRAIL_STATUS[c.newStatus] || {}).color || ""}">● Stato aggiornato a: ${esc((TRAIL_STATUS[c.newStatus] || {}).label || c.newStatus)}</div>` : ""}
        ${c.text ? `<div class="small">${esc(c.text)}</div>` : ""}
      </div>`).join("") : `<p class="muted small">Nessun aggiornamento ancora.</p>`;
    commentsEl.querySelectorAll(".tdCmEdit").forEach((b) => b.onclick = () => {
      const c = list.find((x) => x.id === b.dataset.id); if (!c) return;
      const m = modal(`<h3>Modifica commento</h3>
        <textarea id="tdCmText" rows="4" style="width:100%">${esc(c.text || "")}</textarea>
        <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="tdCmGo">Salva</button></div>`);
      m.querySelector("#tdCmGo").onclick = async () => {
        const text = m.querySelector("#tdCmText").value.trim();
        if (!text && !c.newStatus) { toast("Il commento non può essere vuoto."); return; }
        try {
          await updateDoc(doc(db, "trails", trail.id, "comments", c.id), { text, editedAtMillis: Date.now() });
          logTrail("comment_edit", trail.name);
          m.remove();
        } catch (e) { toast("Modifica non riuscita."); }
      };
    });
    commentsEl.querySelectorAll(".tdCmDel").forEach((b) => b.onclick = async () => {
      if (!confirm("Eliminare il commento?")) return;
      try { await deleteDoc(doc(db, "trails", trail.id, "comments", b.dataset.id)); logTrail("comment_delete", trail.name); }
      catch (e) { toast("Eliminazione non riuscita."); }
    });
  });
  const closeAndUnsub = () => { unsub(); w.remove(); };
  const onMapBtn = w.querySelector("#tdOnMap");
  if (onMapBtn) onMapBtn.onclick = () => { state.mapFocus = trail.id; closeAndUnsub(); state.tab = "mappa"; renderCalendar(); };
  w.querySelector("#tdClose").onclick = closeAndUnsub;
  w.addEventListener("click", (e) => { if (e.target === w) closeAndUnsub(); });

  const formEl = w.querySelector("#tdForm");
  const canDelete = state.user && trail.createdByUid === state.user.uid;
  const renderForm = async () => {
    if (!state.user) {
      formEl.innerHTML = `<button class="btn block" id="tdSignIn">Accedi con Google per commentare</button>`;
      formEl.querySelector("#tdSignIn").onclick = doSignIn;
      return;
    }
    const editMode = LS.trailEdit();
    const admin = canDelete || await isTrailAdmin();
    const canEditTrail = editMode; // matita: ogni utente con login, in modalità modifica
    const canDel = editMode && admin;
    formEl.innerHTML = `
      <b class="small">Aggiorna stato (opzionale)</b>
      <div class="row gap" id="tdStatusRow" style="margin:8px 0;flex-wrap:wrap">
        ${Object.entries(TRAIL_STATUS).map(([id, s]) => `
          <button type="button" class="diff-opt" data-v="${id}" style="border-color:${s.color}">
            <span class="dot sm" style="background:${s.color};display:inline-block;margin-right:6px"></span>${s.label}
          </button>`).join("")}
      </div>
      ${canEditTrail && admin ? `<b class="small">Nome del trail</b>
      <div class="row gap" style="margin:6px 0 10px"><input id="tdName" value="${esc(trail.name)}" style="flex:1;width:auto"><button type="button" class="btn" id="tdRename">Salva nome</button></div>` : ""}
      ${canEditTrail ? `<b class="small">Difficoltà</b>
      <div class="row gap" id="tdDiffRow" style="margin:8px 0;flex-wrap:wrap">
        ${["s0","s1","s2","s3","s4","s5"].map((d) => `<button type="button" class="diff-opt ${trail.difficulty === d ? "sel" : ""}" data-v="${d}">${diffBadge(d)}</button>`).join("")}
      </div>` : ""}
      <textarea id="tdText" placeholder="Scrivi un commento…" style="width:100%"></textarea>
      ${canEditTrail && trail.lat != null ? `<button class="btn ghost block" id="tdUnmap" style="color:#e74c3c;margin-top:8px">Rimuovi dalla mappa (scollega GPX)</button>` : ""}
      <div class="row between" style="margin-top:8px">
        ${canDel ? `<button class="btn ghost" id="tdDelete" style="color:#e74c3c">Elimina trail</button>` : "<span></span>"}
        <button class="btn" id="tdPublish">Pubblica</button>
      </div>
    `;
    const rnBtn = formEl.querySelector("#tdRename");
    if (rnBtn) rnBtn.onclick = async () => {
      const nn = formEl.querySelector("#tdName").value.trim();
      if (!nn || nn === trail.name) return;
      try {
        const old = trail.name;
        await setTrailFieldsLogged(trail.id, { name: nn }, "rename", nn, `era «${old}»`);
        trail.name = nn;
        w.querySelector("h3").innerHTML = `${esc(nn)} ${diffBadge(trail.difficulty)}`;
        toast("Nome modificato");
        onChange && onChange();
      } catch (e) { toast("Modifica non riuscita."); }
    };
    formEl.querySelectorAll("#tdDiffRow .diff-opt").forEach((b) => b.onclick = async () => {
      const was = b.classList.contains("sel");
      const nv = was ? "" : b.dataset.v;
      try {
        await setTrailFieldsLogged(trail.id, { difficulty: nv }, "difficulty", trail.name, nv ? nv.toUpperCase() : "—");
        trail.difficulty = nv;
        formEl.querySelectorAll("#tdDiffRow .diff-opt").forEach((x) => x.classList.toggle("sel", x.dataset.v === nv));
        w.querySelector("h3").innerHTML = `${esc(trail.name)} ${diffBadge(nv)}`;
        onChange && onChange();
      } catch (e) { toast("Modifica non riuscita."); }
    });
    let selectedStatus = null;
    formEl.querySelectorAll("#tdStatusRow .diff-opt").forEach((b) => b.onclick = () => {
      const was = b.classList.contains("sel");
      formEl.querySelectorAll("#tdStatusRow .diff-opt").forEach((x) => x.classList.remove("sel"));
      if (!was) { b.classList.add("sel"); selectedStatus = b.dataset.v; } else selectedStatus = null;
    });
    formEl.querySelector("#tdPublish").onclick = async () => {
      const text = formEl.querySelector("#tdText").value.trim();
      if (!text && !selectedStatus) return;
      try {
        await addTrailComment(trail.id, text, selectedStatus, trail.name);
        formEl.querySelector("#tdText").value = "";
        formEl.querySelectorAll("#tdStatusRow .diff-opt").forEach((x) => x.classList.remove("sel"));
        selectedStatus = null;
        onChange();
      } catch (e) { toast(e.message || "Errore"); }
    };
    formEl.querySelector("#tdUnmap") && (formEl.querySelector("#tdUnmap").onclick = async () => {
      if (!confirm(`Rimuovere "${trail.name}" dalla mappa? Il trail resta nell'elenco.`)) return;
      try {
        await setTrailFieldsLogged(trail.id, { path: null, lat: null, lon: null }, "path", trail.name, "rimosso");
        trail.lat = trail.lon = null; delete trail.path;
        unsub(); w.remove(); onChange && onChange();
      } catch (e) { toast("Operazione non riuscita."); }
    });
    formEl.querySelector("#tdDelete") && (formEl.querySelector("#tdDelete").onclick = async () => {
      if (!confirm("Eliminare questo trail?")) return;
      await deleteTrailDeep(trail.id, trail.name);
      unsub(); w.remove(); onChange();
    });
  };
  renderForm();
}


// ─────────────────────────────────────────────────────────────
// TRAIL: LOG delle modifiche, mappa (Leaflet) e import GPX. Allineato all'app Android.
// ─────────────────────────────────────────────────────────────
/** Rinomina un'area: tutti i suoi trail + documento zona (perimetro/costruttori); registra la voce annullabile. */
async function renameZoneTo(old, nn, undoOf) {
  const qs = await getDocs(query(collection(db, "trails"), where("zone", "==", old)));
  for (let i = 0; i < qs.docs.length; i += 400) {
    const batch = writeBatch(db);
    qs.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { zone: nn }));
    await batch.commit();
  }
  // Sposta il documento zona (perimetro/costruttori), anche per le zone senza trail.
  const zid = (n) => normTxt(n).replace(/\s+/g, "-") || "zona";
  if (zid(old) !== zid(nn)) {
    const zs = await getDoc(doc(db, "trailZones", zid(old)));
    if (zs.exists() && !(await getDoc(doc(db, "trailZones", zid(nn)))).exists()) {
      await setDoc(doc(db, "trailZones", zid(nn)), { ...zs.data(), zone: nn, createdByUid: state.user.uid, updatedAtMillis: Date.now() });
      await deleteDoc(zs.ref);
    }
  }
  await logTrail("rename_zone", "", `${old} → ${nn}`, { undo: { kind: "zone", from: old, to: nn }, undoOf });
}

async function logTrail(action, trailName, detail = "", extra = {}) {
  try {
    const u = auth.currentUser; if (!u) return;
    const rec = {
      action, trailName, detail, userUid: u.uid, userName: u.displayName || "",
      userEmail: u.email || "", createdAtMillis: Date.now(),
    };
    if (extra.trailId) rec.trailId = extra.trailId;
    if (extra.undo) rec.undo = extra.undo;
    if (extra.undoOf) rec.undoOf = extra.undoOf;
    await addDoc(collection(db, "trailLog"), rec);
  } catch (e) { console.warn("log failed", e); }
}

// ── Annulla (solo admin): le voci di log portano `undo` con lo stato precedente ──
const nn0 = (v) => (v === undefined ? null : v);
/** Aggiorna campi di un trail (valore null = elimina il campo) e registra la voce con i dati per annullarla. */
async function setTrailFieldsLogged(trailId, fields, action, trailName, detail) {
  const ref = doc(db, "trails", trailId);
  const cur = (await getDoc(ref)).data() || {};
  const before = {}; Object.keys(fields).forEach((k) => { before[k] = nn0(cur[k]); });
  const upd = {}; Object.entries(fields).forEach(([k, v]) => { upd[k] = v === null ? deleteField() : v; });
  await updateDoc(ref, upd);
  logTrail(action, trailName, detail, { trailId, undo: { kind: "fields", before, after: fields } });
}
async function snapshotTrailDoc(trailId) {
  const ref = doc(db, "trails", trailId);
  const data = (await getDoc(ref)).data() || {};
  const cs = await getDocs(collection(db, "trails", trailId, "comments"));
  return { kind: "restore", data, comments: cs.docs.map((c) => ({ id: c.id, data: c.data() })) };
}
const sameVal = (a, b) => (typeof a === "number" && typeof b === "number") ? a === b : (a ?? "") === (b ?? "");
/** Annulla una voce di log. Ritorna "ok" | "conflict" (serve force) ; lancia Error negli altri casi. */
async function undoTrailLog(e, force) {
  const u = e.undo; if (!u) throw new Error("Questa voce non si può annullare");
  const tid = e.trailId;
  if (u.kind === "fields") {
    const ref = doc(db, "trails", tid), sn = await getDoc(ref);
    if (!sn.exists()) throw new Error("Il trail non esiste più");
    const cur = sn.data();
    if (!force && Object.entries(u.after || {}).some(([k, v]) => !sameVal(cur[k], v))) return "conflict";
    const prev = {}; Object.keys(u.before).forEach((k) => { prev[k] = nn0(cur[k]); });
    const upd = {}; Object.entries(u.before).forEach(([k, v]) => { upd[k] = v === null ? deleteField() : v; });
    await updateDoc(ref, upd);
    await logTrail("undo", cur.name || e.trailName, e.action, { trailId: tid, undo: { kind: "fields", before: prev, after: u.before }, undoOf: e.id });
  } else if (u.kind === "delete") {
    const sn = await getDoc(doc(db, "trails", tid));
    if (!sn.exists()) throw new Error("Il trail non esiste più");
    const snap = await snapshotTrailDoc(tid);
    for (const c of (await getDocs(collection(db, "trails", tid, "comments"))).docs) await deleteDoc(c.ref);
    await deleteDoc(doc(db, "trails", tid));
    await logTrail("undo", sn.data().name || e.trailName, e.action, { trailId: tid, undo: snap, undoOf: e.id });
  } else if (u.kind === "restore") {
    if ((await getDoc(doc(db, "trails", tid))).exists()) throw new Error("Il trail esiste già");
    await setDoc(doc(db, "trails", tid), u.data || {});
    for (const c of (u.comments || [])) await setDoc(doc(db, "trails", tid, "comments", c.id), c.data || {});
    await logTrail("undo", (u.data || {}).name || e.trailName, e.action, { trailId: tid, undo: { kind: "delete" }, undoOf: e.id });
  } else if (u.kind === "zone") {
    await renameZoneTo(u.to, u.from, e.id);
  } else throw new Error("Questa voce non si può annullare");
  return "ok";
}

const TL_ACT = { rename: "rinomina trail", rename_zone: "rinomina zona", difficulty: "difficoltà", status: "stato", position: "posizione", path: "tracciato", delete: "eliminazione", create: "creazione" };
function describeTrailLog(e) {
  const who = [e.userName, e.userEmail ? `(${e.userEmail})` : ""].filter(Boolean).join(" ") || "Utente";
  const n = `"${e.trailName}"`;
  const what = ({
    create: `aggiunge il trail ${n}${e.detail ? " in " + e.detail : ""}`,
    status: `modifica stato trail ${n} → ${e.detail}`,
    difficulty: `modifica difficoltà trail ${n} → ${e.detail}`,
    rename_zone: `rinomina area ${e.detail}`,
    rename: `rinomina il trail ${n} (${e.detail})`,
    delete: `elimina il trail ${n}`,
    comment: `commenta il trail ${n}${e.detail ? ` (stato → ${e.detail})` : ""}`,
    comment_edit: `modifica un commento sul trail ${n}`,
    comment_delete: `elimina un commento sul trail ${n}`,
    zone: `disegna la zona "${e.trailName}" → ${e.detail}`,
    zone_delete: `elimina il perimetro della zona "${e.trailName}"`,
    poi_create: `aggiunge il punto di interesse ${n} (${e.detail})`,
    poi_edit: `modifica il punto di interesse ${n}`,
    poi_delete: `elimina il punto di interesse ${n}`,
    zone_builders: `aggiorna i costruttori della zona "${e.trailName}" → ${e.detail}`,
    position: `imposta posizione trail ${n} → ${e.detail}`,
    path: `imposta tracciato trail ${n} → ${e.detail}`,
    undo: `annulla un'operazione (${TL_ACT[e.detail] || e.detail}) su ${n}`,
  })[e.action] || e.action;
  return `${who} ${what}`;
}

/** Registro modifiche in fondo alla tab TRAIL: sempre contratto; il contenuto lo vedono solo gli admin,
 * l'avviso che ogni modifica è tracciata è visibile a tutti. */
async function renderTrailLog() {
  const box = $("#trLog") || $("#mapLog"); if (!box) return;   // scheda Trail oppure sotto la mappa
  const admin = state.user ? await isTrailAdmin() : false;
  if (!box.isConnected) return;
  const open = !!state.trailLogOpen && admin;
  let html = `<hr style="border:0;border-top:1px solid var(--border);margin:14px 0 6px">
    <div class="row between center ${admin ? "tl-hdr" : ""}" id="tlHdr" style="cursor:${admin ? "pointer" : "default"}">
      <b>LOG</b>${admin ? `<span>${open ? "▾" : "▸"}</span>` : ""}
    </div>
    <p class="muted small">Ogni modifica ai trail viene registrata con nome ed email dell'utente.</p>`;
  if (open) {
    if (!state.trailLog) {
      html += `<div class="spin"></div>`;
      box.innerHTML = html;
      try {
        const qs = await getDocs(query(collection(db, "trailLog"), orderBy("createdAtMillis", "desc"), limit(500)));
        state.trailLog = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (e) { state.trailLog = []; }
    }
    const q = (state.trailLogQ || "").trim().toLowerCase();
    const undone = new Set(state.trailLog.map((e) => e.undoOf).filter(Boolean));
    const all = state.trailLog.map((e) => ({ e, txt: describeTrailLog(e) }));
    // "-parola" nasconde le voci che la contengono; le altre parole devono comparire tutte.
    const tokens = q.split(/\s+/).filter(Boolean);
    const neg = tokens.filter((t) => t.startsWith("-") && t.length > 1).map((t) => t.slice(1));
    const pos = tokens.filter((t) => !t.startsWith("-"));
    const matches = tokens.length ? all.filter((x) => { const d = x.txt.toLowerCase(); return pos.every((p) => d.includes(p)) && !neg.some((n) => d.includes(n)); }) : all;
    const shown = (q || state.trailLogAll) ? matches : matches.slice(0, 20);
    html = html.replace('<div class="spin"></div>', "");
    html += `<input id="tlQ" placeholder="Cerca nel log (utente, trail, azione…) · -parola esclude" value="${esc(state.trailLogQ || "")}" style="width:100%;margin:6px 0">
      ${shown.length ? shown.map((x) => `<div class="row between center" style="margin:6px 0;gap:8px"><div><div class="muted small">${new Date(x.e.createdAtMillis || 0).toLocaleString(window.GC_LOCALE, { dateStyle: "short", timeStyle: "short" })}</div><div class="small">${esc(x.txt)}</div></div>${x.e.undo ? (undone.has(x.e.id) ? `<span class="muted small">annullata</span>` : `<button class="btn ghost tl-undo" data-id="${esc(x.e.id)}">${x.e.action === "undo" ? "Ripristina" : "Annulla"}</button>`) : ""}</div>`).join("")
        : `<p class="muted small">${state.trailLog.length ? "Nessun risultato." : "Nessuna modifica registrata."}</p>`}
      ${!q && matches.length > 20 ? `<button class="btn ghost" id="tlAll">${state.trailLogAll ? "Mostra solo gli ultimi 20" : `Mostra tutti (${matches.length})`}</button>` : ""}`;
  }
  box.innerHTML = html;
  if (admin) $("#tlHdr").onclick = () => { state.trailLogOpen = !state.trailLogOpen; if (state.trailLogOpen) state.trailLog = null; renderTrailLog(); };
  const qi = $("#tlQ");
  if (qi) qi.oninput = (ev) => { state.trailLogQ = ev.target.value; const pos = ev.target.selectionStart; renderTrailLog().then(() => { const n = $("#tlQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); };
  box.querySelectorAll(".tl-undo").forEach((b) => b.onclick = async () => {
    const e = state.trailLog.find((x) => x.id === b.dataset.id); if (!e) return;
    if (!confirm(`${e.action === "undo" ? "Ripristinare" : "Annullare"} questa operazione?\n\n${describeTrailLog(e)}`)) return;
    try {
      let r = await undoTrailLog(e, false);
      if (r === "conflict") { if (!confirm("Dopo questa operazione il trail è stato modificato di nuovo. Annullare comunque?")) return; r = await undoTrailLog(e, true); }
      toast("Operazione annullata");
      state.trailLog = null; state.trails = await fetchTrails();
      if ($("#trList")) { $("#trList").innerHTML = trailListHtml(); wireTrailListHandlers(); }
      else if (state.tab === "mappa") buildTrailMap(true);
      renderTrailLog();
    } catch (err) { toast(err.message || "Non riuscito"); }
  });
  const ab = $("#tlAll"); if (ab) ab.onclick = () => { state.trailLogAll = !state.trailLogAll; renderTrailLog(); };
}

// ── polilinea compatta (stesso formato dell'app: encoded polyline, precisione 1e-5) ──
function polyPut(v) {
  let n = v < 0 ? ~(v << 1) : (v << 1), s = "";
  while (n >= 0x20) { s += String.fromCharCode(((n & 0x1f) | 0x20) + 63); n >>= 5; }
  return s + String.fromCharCode(n + 63);
}
function polyEnc(pts) {
  let out = "", pla = 0, plo = 0;
  for (const [la, lo] of pts) {
    const a = Math.round(la * 1e5), b = Math.round(lo * 1e5);
    out += polyPut(a - pla) + polyPut(b - plo); pla = a; plo = b;
  }
  return out;
}
function polyDec(str) {
  const out = []; let i = 0, la = 0, lo = 0;
  const next = () => { let sh = 0, r = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i <= str.length); return (r & 1) ? ~(r >> 1) : (r >> 1); };
  while (i < str.length) { la += next(); lo += next(); out.push([la / 1e5, lo / 1e5]); }
  return out;
}
function polySimplify(pts, tolM = 3, maxPts = 1500) {
  if (pts.length <= 2) return pts;
  const kx = 111320 * Math.cos(pts[0][0] * Math.PI / 180), ky = 110540;
  const X = pts.map((p) => p[1] * kx), Y = pts.map((p) => p[0] * ky);
  const dp = (tol) => {
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const dx = X[b] - X[a], dy = Y[b] - Y[a], len = Math.hypot(dx, dy);
      let md = 0, idx = -1;
      for (let k = a + 1; k < b; k++) {
        const d = len === 0 ? Math.hypot(X[k] - X[a], Y[k] - Y[a]) : Math.abs(dy * (X[k] - X[a]) - dx * (Y[k] - Y[a])) / len;
        if (d > md) { md = d; idx = k; }
      }
      if (idx >= 0 && md > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  let tol = tolM, res = dp(tol);
  while (res.length > maxPts) { tol *= 1.5; res = dp(tol); }
  return res;
}
function parseGpxPoints(xml) {
  const d = new DOMParser().parseFromString(xml, "application/xml");
  let pts = [...d.getElementsByTagName("trkpt")];
  if (!pts.length) pts = [...d.getElementsByTagName("rtept")];
  return pts.map((p) => [parseFloat(p.getAttribute("lat")), parseFloat(p.getAttribute("lon"))]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
}
function normTxt(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function similarity(a, b) {
  if (!a || !b) return 0; if (a === b) return 1; if (a.includes(b) || b.includes(a)) return 0.85;
  const d = Array.from({ length: a.length + 1 }, (_, i) => { const r = new Array(b.length + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

const DIFF_COLOR = { s0: "#E0E0E0", s1: "#27AE60", s2: "#2980B9", s3: "#E74C3C", s4: "#111111", s5: "#111111" };

/** Tab MAPPA: Leaflet con sfondi OSM / Topografica / CyclOSM e overlay percorsi MTB; i trail con
 * tracciato sono linee colorate per stato con etichetta, quelli con solo un punto un'etichetta. */
/** keepView = ricostruzione dopo un salvataggio/aggiornamento: si mantengono centro e zoom di prima. */
// ─────────────────────────────────────────────────────────────
// Pericoli segnalati (app Android): punti sulla mappa, conferma «c'è ancora» / «pericolo rimosso» con voti.
// Stessa regola dell'app: rimosso se lo dice l'autore o 2 utenti diversi dopo l'ultima conferma; scade dopo 60 giorni
// (7 per l'acqua) dall'ultima conferma; la rimozione riporta il trail ad «Aperto».
// ─────────────────────────────────────────────────────────────
const HAZ_TYPES = {
  TREE: ["🌳", "Albero caduto"], VEGETATION: ["🌿", "Vegetazione"], DUG: ["🕳️", "Buca / scavo"], FLOODED: ["💧", "Allagato"],
  ROCKS: ["🪨", "Sassi / frana"], DANGER: ["⚠️", "Pericolo"], INFO: ["ℹ️", "Informazione"], OTHER: ["❓", "Altro"],
};
function hazOff() { try { return localStorage.getItem("gc_map_haz") === "0"; } catch { return false; } }
function hazState(r, votes, now = Date.now()) {
  const lastConfirm = Math.max(0, ...votes.filter((v) => v.v === "confirm").map((v) => v.at || 0));
  const removed = votes.filter((v) => v.v === "removed" && (v.at || 0) > lastConfirm);
  const gone = removed.some((v) => v.uid === r.byUid) || new Set(removed.map((v) => v.uid)).size >= 2;
  const fresh = Math.max(r.atMillis || 0, lastConfirm);
  const ttl = (r.type === "FLOODED" ? 7 : 60) * 86400000;
  return { active: !gone && now - fresh <= ttl, confirms: votes.filter((v) => v.v === "confirm").length, removed: removed.length, fresh };
}
async function setupHazards(map) {
  const code = state.code; if (!code || !map) return;
  const grp = L.layerGroup();
  const btn = $("#mapHaz");
  if (!hazOff()) grp.addTo(map);
  if (btn) btn.onclick = () => {
    const off = !hazOff();
    try { localStorage.setItem("gc_map_haz", off ? "0" : "1"); } catch {}
    if (off) map.removeLayer(grp); else grp.addTo(map);
    btn.classList.toggle("on", !off); btn.innerHTML = eyeSvg(off) + "<b>⚠</b>";
  };
  let reps = [];
  const load = async () => {
    try {
      const since = Date.now() - 60 * 86400000;
      const qs = await getDocs(collection(db, "calendars", code, "reports"));
      const list = [];
      for (const d of qs.docs) {
        const r = { id: d.id, ...d.data() };
        if (!(r.atMillis >= since) || typeof r.lat !== "number" || typeof r.lon !== "number") continue;
        try { r.votes = (await getDocs(collection(d.ref, "votes"))).docs.map((v) => ({ uid: v.id, ...v.data() })); } catch { r.votes = []; }
        r.st = hazState(r, r.votes);
        list.push(r);
      }
      reps = list;
    } catch { reps = []; }
    if (state.map !== map) return;
    grp.clearLayers();
    reps.filter((r) => r.st.active).forEach((r) => {
      const t = HAZ_TYPES[r.type] || HAZ_TYPES.OTHER;
      const ic = L.divIcon({ className: "", html: `<div style="font-size:22px;line-height:26px;text-align:center;width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid #E74C3C;box-shadow:0 1px 4px rgba(0,0,0,.5)">${t[0]}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([r.lat, r.lon], { icon: ic, zIndexOffset: 800 }).addTo(grp).on("click", () => openHazard(r));
    });
  };
  const openHazard = (r) => {
    const t = HAZ_TYPES[r.type] || HAZ_TYPES.OTHER;
    const tr = (state.trails || []).find((x) => x.id === r.trailId);
    const when = new Date(r.atMillis).toLocaleDateString("it-IT");
    const mine = state.user && r.votes.find((v) => v.uid === state.user.uid);
    const body = `<div style="font-size:15px">
      <div style="font-size:1.1rem"><b>${t[0]} ${esc(t[1])}</b></div>
      <div class="muted small">${esc(r.byName || "")} · ${esc(when)}${tr ? " · " + esc(tr.name) : ""}</div>
      ${r.note ? `<p>${esc(r.note)}</p>` : ""}
      <p class="small">Confermata da ${r.st.confirms} · «rimosso» da ${r.st.removed} (ne servono 2, o l'autore)${mine ? ` · il tuo voto: ${mine.v === "confirm" ? "c'è ancora" : "rimosso"}` : ""}</p>
      <p class="small"><a href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=18/${r.lat}/${r.lon}" target="_blank" rel="noopener">Apri su OpenStreetMap</a></p>
      ${state.user ? `<div class="row gap"><button class="btn" id="hzOk">C'è ancora</button><button class="btn ghost" id="hzNo">Pericolo rimosso</button></div>` : `<p class="muted small">Accedi con Google per confermare o segnalare la rimozione.</p>`}
    </div>`;
    const w = modal(body, { title: "Pericolo" });
    const vote = async (v) => {
      try {
        const u = state.user;
        await setDoc(doc(db, "calendars", code, "reports", r.id, "votes", u.uid), { v, at: Date.now(), name: (u.displayName || (u.email || "").split("@")[0] || "Utente").slice(0, 60) });
        r.votes = r.votes.filter((x) => x.uid !== u.uid).concat([{ uid: u.uid, v, at: Date.now() }]);
        const st = hazState(r, r.votes);
        if (v === "removed" && !st.active && r.trailId && tr && tr.status !== "open") {
          try { await addTrailComment(r.trailId, `Pericolo rimosso (${t[1]})`, "open", tr.name); } catch {}
        }
        toast(v === "confirm" ? "Grazie, confermato" : st.active ? "Segnalato: serve un altro utente per rimuoverlo" : "Pericolo rimosso");
        try { w && w.remove && w.remove(); } catch {}
        load();
      } catch (e) { toast("Voto non riuscito: " + (e.message || e)); }
    };
    const ok = document.getElementById("hzOk"), no = document.getElementById("hzNo");
    if (ok) ok.onclick = () => vote("confirm");
    if (no) no.onclick = () => vote("removed");
  };
  load();
}

function buildTrailMap(keepView) {
  if (window.GcNav) GcNav.stop();
  const el = $("#trMap"); if (!el || typeof L === "undefined") { const h = $("#mapHint"); if (h) { h.hidden = false; h.textContent = "Mappa non disponibile."; } return; }
  let prevView = null;
  if (keepView && state.map) { try { prevView = { c: state.map.getCenter(), z: state.map.getZoom() }; } catch {} }
  if (state.map) { try { state.map.remove(); } catch {} state.map = null; }
  // Zoom +/− in basso a destra (a sinistra era coperto dai pulsanti della mappa).
  const map = L.map(el, { zoomControl: false });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  state.map = map;
  const bases = {
    "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }),
    "Topografica": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors, SRTM, OpenTopoMap (CC-BY-SA)", maxZoom: 17, subdomains: "abc" }),
    // Sfondo chiaro senza chiavi API: tile OpenStreetMap schiarite e in grigio dal filtro .tt-light (in trailtrace.js).
    "Chiara": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19, className: "tt-light" }),
    "Ciclismo (CyclOSM)": L.tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors, CyclOSM", maxZoom: 20, subdomains: "abc" }),
    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics", maxZoom: 19 }),
  };
  const ovName = "Percorsi MTB";
  const labelsGrp = L.layerGroup();
  // Tracciati (GPX) dei trail: occhio T. I nomi sono l'occhio N (labelsGrp).
  const linesGrp = L.layerGroup();
  if (!state.mapLinesOff) linesGrp.addTo(map);
  const linesBtn = $("#mapLines");
  if (linesBtn) linesBtn.onclick = () => {
    state.mapLinesOff = !state.mapLinesOff; saveMapEyes();
    if (state.mapLinesOff) map.removeLayer(linesGrp); else linesGrp.addTo(map);
    linesBtn.classList.toggle("on", !state.mapLinesOff);
    linesBtn.innerHTML = eyeSvg(!!state.mapLinesOff) + "<b>T</b>";
    linesBtn.title = state.mapLinesOff ? "Mostra i tracciati dei trail" : "Nascondi i tracciati dei trail";
  };
  const overlays = { [ovName]: L.tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", { attribution: "&copy; waymarkedtrails.org", maxZoom: 18, opacity: 0.85 }) };
  let saved = null, savedOv = false;
  try { saved = localStorage.getItem("gc_map_base"); savedOv = localStorage.getItem("gc_map_mtbov") === "1"; } catch {}
  (bases[saved] || bases["OpenStreetMap"]).addTo(map);
  if (savedOv) overlays[ovName].addTo(map);
  // Nomi dei trail spenti di default (rallentano la mappa): li accende l'occhio, per la sessione.
  if (state.mapNames) labelsGrp.addTo(map);
  const namesBtn = $("#mapNames");
  if (namesBtn) namesBtn.onclick = () => {
    state.mapNames = !state.mapNames; saveMapEyes();
    if (state.mapNames) labelsGrp.addTo(map); else map.removeLayer(labelsGrp);
    namesBtn.classList.toggle("on", state.mapNames);
    namesBtn.innerHTML = eyeSvg(!state.mapNames) + "<b>N</b>";
    namesBtn.title = state.mapNames ? "Nascondi i nomi dei trail" : "Mostra i nomi dei trail";
  };
  const layersCtl = L.control.layers(bases, overlays, { position: "topright", collapsed: true }).addTo(map);
  map.on("baselayerchange", (e) => { try { localStorage.setItem("gc_map_base", e.name); } catch {} });
  map.on("overlayadd", (e) => { if (e.name === ovName) { try { localStorage.setItem("gc_map_mtbov", "1"); } catch {} } });
  map.on("overlayremove", (e) => { if (e.name === ovName) { try { localStorage.setItem("gc_map_mtbov", "0"); } catch {} } });

  if (typeof TrailTrace !== "undefined" && TrailTrace.decorateLayers) TrailTrace.decorateLayers(layersCtl);
  if (typeof TrailTrace !== "undefined" && TrailTrace.attachSearch) TrailTrace.attachSearch(map);
  if (typeof GpxTools !== "undefined" && GpxTools.closePlayer) GpxTools.closePlayer();
  state.playApi = (typeof TrailTrace !== "undefined" && TrailTrace.attachPlayback) ? TrailTrace.attachPlayback(map, () => {}) : null;
  // Modifica/cancella il tracciato di un trail: tenendo premuto (o clic destro) sul tracciato, solo in modalità modifica.
  const refreshT = () => fetchTrails().then((l) => { state.trails = l; if (state.tab === "mappa") buildTrailMap(true); });
  if (typeof TrailTrace !== "undefined") TrailTrace.editZ = 96;
  const editApi = (typeof TrailTrace !== "undefined" && TrailTrace.attachEdit) ? TrailTrace.attachEdit(map, {
    onBuilders: (id) => { const z = zoneList.find((x) => x.id === id); if (z) openZoneBuilders(z.zone, z.builders || [], () => refreshZones()); },
    onSave: async (id, pts, kind) => {
      if (kind === "zone") {
        try {
          const z = zoneList.find((x) => x.id === id); if (!z) return;
          const ref = doc(db, "trailZones", id), ex = await getDoc(ref);
          await setDoc(ref, { zone: z.zone, polygon: polyEnc(pts), createdByUid: ex.exists() ? ex.data().createdByUid : state.user.uid, updatedAtMillis: Date.now() }, { merge: true });
          logTrail("zone", z.zone, `${pts.length} vertici`); toast(`Zona «${z.zone}» salvata`); refreshZones();
        } catch (e) { toast(e.message || "Salvataggio non riuscito"); }
        return;
      }
      try { const t = (state.trails || []).find((x) => x.id === id); await saveTrailPath(id, t ? t.name : "", pts); toast("Tracciato salvato"); refreshT(); }
      catch (e) { toast(e.message || "Salvataggio non riuscito"); }
    },
    onDelete: async (id, kind) => {
      if (kind === "zone") {
        const z = zoneList.find((x) => x.id === id); if (!z) return;
        const del = (z.builders && z.builders.length)
          ? setDoc(doc(db, "trailZones", id), { polygon: "", updatedAtMillis: Date.now() }, { merge: true })  // restano i costruttori
          : deleteDoc(doc(db, "trailZones", id));
        del.then(() => { logTrail("zone_delete", z.zone); toast("Perimetro eliminato"); refreshZones(); }).catch(() => toast("Eliminazione non riuscita."));
        return;
      }
      try {
        const t = (state.trails || []).find((x) => x.id === id);
        await setTrailFieldsLogged(id, { path: null, lat: null, lon: null }, "path", t ? t.name : "", "rimosso"); toast("Tracciato rimosso dalla mappa"); refreshT();
      } catch (e) { toast("Operazione non riuscita."); }
    },
  }) : null;
  const longPress = (t) => { if (editApi && t.path) editApi.openMenu({ id: t.id, name: t.name, path: polyDec(t.path) }); };
  const focus = [];
  const refresh = () => fetchTrails().then((l) => { state.trails = l; if (state.tab === "mappa") buildTrailMap(true); });
  (state.trails || []).filter((t) => t.lat != null && t.lon != null).forEach((t) => {
    const st = (TRAIL_STATUS[t.status] || TRAIL_STATUS.open).color;
    // Il segmento ha il colore della difficoltà (scala scelta nelle preferenze); S0/bianco in grigio scuro per vedersi.
    const lineCol = (() => {
      const tf = diffScale() === "trailforks", id = t.difficulty;
      const map2 = tf ? { s0: "#9E9E9E", s1: "#2E8B3D", s2: "#2980B9", s3: "#D32F2F", s4: "#111111", s5: "#E8720C" }
                      : { s0: "#9E9E9E", s1: "#27AE60", s2: "#2980B9", s3: "#E74C3C", s4: "#111111", s5: "#111111" };
      return map2[id] || "#9E9E9E";
    })();
    const open = () => { if (typeof TrailTrace !== "undefined" && TrailTrace.busy) return; openTrailDetailDialog(t, refresh); };
    // In sola lettura il tocco mostra nome e km (anche con i nomi spenti); in modifica apre la scheda.
    const tap = (ll) => (typeof TrailTrace !== "undefined" && TrailTrace.tapTrail) ? TrailTrace.tapTrail(map, { id: t.id, name: t.name, path: t.path ? polyDec(t.path) : null }, ll, open) : open();
    if (t.path) {
      const pts = polyDec(t.path);
      L.polyline(pts, { color: "#fff", weight: 8, opacity: 0.85 }).addTo(linesGrp);
      L.polyline(pts, { color: lineCol, weight: 5, dashArray: t.status === "closed" ? "3 9" : null }).on("click", (e) => tap(e.latlng)).on("contextmenu", () => longPress(t)).addTo(linesGrp);
      focus.push(...pts);
    } else focus.push([t.lat, t.lon]);
    const lbl = document.createElement("div"); lbl.className = "tl-label"; lbl.style.borderColor = DIFF_COLOR[t.difficulty] || "#9E9E9E";
    const dot = document.createElement("i"); dot.style.background = st;
    const tx = document.createElement("span"); tx.textContent = t.name;
    lbl.append(dot, tx);
    L.marker([t.lat, t.lon], { icon: L.divIcon({ html: lbl, className: "", iconSize: null }) }).on("click", () => tap([t.lat, t.lon])).on("contextmenu", () => { if (t.path) longPress(t); }).addTo(labelsGrp);
  });
  // "Vedi sulla mappa" dal dettaglio di un trail: centra e evidenzia quel trail (una volta sola).
  const fid = state.mapFocus; state.mapFocus = null;
  const ft = fid && (state.trails || []).find((t) => t.id === fid && t.path);
  if (ft) {
    const fp = polyDec(ft.path);
    L.polyline(fp, { color: "#1E6BFF", weight: 12, opacity: 0.45 }).addTo(map);
    focus.length = 0; focus.push(...fp);
  }
  if (focus.length > 1) map.fitBounds(L.latLngBounds(focus), { padding: [40, 40], maxZoom: ft ? 17 : 15 });
  else if (focus.length === 1) map.setView(focus[0], 14);
  else { map.setView([45.64, 8.35], 10); const h = $("#mapHint"); if (h) { h.hidden = false; h.textContent = 'Nessun trail sulla mappa. Usa "Importa GPX" per caricare i tracciati.'; } }
  if (prevView && !fid) map.setView(prevView.c, prevView.z, { animate: false });
  else if (!fid) {
    // Prima apertura: si riparte dall'ultima vista salvata (se c'è).
    try {
      const v = JSON.parse(localStorage.getItem("gc_map_view") || "null");
      if (Array.isArray(v) && v.length === 3 && Math.abs(v[0]) <= 85 && Math.abs(v[1]) <= 180 && v[2] >= 3 && v[2] <= 20) map.setView([v[0], v[1]], v[2], { animate: false });
    } catch {}
  }
  // Salva centro e zoom a ogni spostamento (solo dopo il posizionamento iniziale, per non memorizzare la vista provvisoria).
  map.on("moveend", () => { try { const c = map.getCenter(); localStorage.setItem("gc_map_view", JSON.stringify([+c.lat.toFixed(6), +c.lng.toFixed(6), map.getZoom()])); } catch {} });

  // "Vedi tuo GPX su mappa": mostra un GPX personale (non salvato) e dice quali trail del database ha percorso.
  let mineApi = null;
  if (typeof TrailTrace !== "undefined" && TrailTrace.attachMyGpx) {
    const trailPaths = (state.trails || []).filter((t) => t.path).map((t) => ({ id: t.id, name: t.name, path: polyDec(t.path) }));
    const mine = TrailTrace.attachMyGpx(map, layersCtl, trailPaths,
      (id) => { const t = (state.trails || []).find((x) => x.id === id); if (t) openTrailDetailDialog(t, refresh); },
      () => { state.myGpx = null; });
    mineApi = mine;
    if (state.myGpx) { mine.show(state.myGpx.pts, state.myGpx.name); if (state.myGpxHidden) mine.setVisible(false); }
    // Occhio G: mostra/nasconde il tuo GPX senza eliminarlo.
    $("#mapMineEye").onclick = () => {
      state.myGpxHidden = !state.myGpxHidden; saveMapEyes(); mine.setVisible(!state.myGpxHidden);
      const b = $("#mapMineEye"); b.classList.toggle("on", !state.myGpxHidden); b.innerHTML = eyeSvg(!!state.myGpxHidden) + "<b>G</b>";
      b.title = state.myGpxHidden ? "Mostra il tuo GPX" : "Nascondi il tuo GPX";
    };
    // La X accanto a "GPX" elimina il GPX personale (compare solo quando c'è).
    $("#mapMineX").onclick = () => { if (window.GpxTools) GpxTools.closePlayer(); mine.clear(); state.myGpx = null; state.myGpxHidden = false; $("#mapMineX").hidden = true; $("#mapMineEye").hidden = true; $("#mapMineMenu").hidden = true; };
    // Menu ⋮: statistiche, ritaglia, inverti, semplifica, salva, condividi (gpxtools.js).
    const setFull = (full, noFit) => {
      state.myGpx.full = full; state.myGpx.pts = polySimplify(full.map((q) => [q.lat, q.lon]));
      mine.show(state.myGpx.pts, state.myGpx.name, noFit);
      if (state.myGpxHidden) mine.setVisible(false);
    };
    const gpxCtx = () => ({
      get: () => state.myGpx && state.myGpx.full ? state.myGpx : null,
      set: (full) => { if (window.GpxTools) GpxTools.closePlayer(); setFull(full, false); }, preview: (part) => setFull(part, true),
      modal, toast, wrap: $("#mapWrap"),
      // "Salva come trail…": stesso dialogo del tracciamento a dito (sceglie un trail esistente o ne crea uno nuovo).
      playApi: state.playApi,
      saveTrail: state.user ? (g) => {
        const pts = polySimplify(g.full.map((q) => [q.lat, q.lon]));
        if (pts.length < 2) { toast("Tracciato troppo corto"); return; }
        openTraceSave({ points: pts, lengthM: TrailTrace.lengthM(pts), snapped: false, warn: "da GPX importato", names: g.name ? [[g.name]] : [], fromGpx: true }, refresh);
      } : null,
    });
    $("#mapMineMenu").onclick = () => GpxTools.openMenu(gpxCtx());
    $("#mapMine").onclick = () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".gpx,.kml,.geojson,.json,.tcx,.csv,application/gpx+xml,text/xml,application/xml,application/json,text/csv";
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try {
          const full = GpxTools.parse(await f.text());
          if (full.length < 2) { toast("GPX non valido o senza tracciato"); return; }
          state.myGpx = { pts: polySimplify(full.map((q) => [q.lat, q.lon])), name: f.name.replace(/\.[^.]+$/, ""), full };
          mine.show(state.myGpx.pts, state.myGpx.name);
          state.myGpxHidden = false; $("#mapMineMenu").hidden = false; $("#mapMineEye").hidden = false; $("#mapMineEye").classList.add("on"); $("#mapMineEye").innerHTML = eyeSvg(false) + "<b>G</b>"; $("#mapMineX").hidden = false;
        } catch { toast("GPX non valido o senza tracciato"); }
      };
      inp.click();
    };
    // ── Naviga: APRI GPX (dispositivo / calendario / il mio spazio) e navigazione GPS con voce ──
    const loadMine = (full, name) => {
      state.myGpx = { pts: polySimplify(full.map((q) => [q.lat, q.lon])), name, full };
      mine.show(state.myGpx.pts, state.myGpx.name);
      state.myGpxHidden = false; $("#mapMineMenu").hidden = false; $("#mapMineEye").hidden = false; $("#mapMineEye").classList.add("on"); $("#mapMineEye").innerHTML = eyeSvg(false) + "<b>G</b>"; $("#mapMineX").hidden = false;
    };
    const setChip = (nav) => { const a = $("#chipExplore"), b = $("#chipNav"); if (a) a.classList.toggle("on", !nav); if (b) b.classList.toggle("on", nav); };
    const startNav = () => {
      if (!state.myGpx) { state.wantNav = true; openGpxChoice(); return; }
      GcNav.start({ map, pts: state.myGpx.full.map((q) => ({ lat: q.lat, lon: q.lon })), name: state.myGpx.name, toast, onStop: () => setChip(false) });
      setChip(true);
    };
    window.__gcLoadGpx = (name, xml) => {
      try {
        const full = GpxTools.parse(xml);
        if (full.length < 2) { toast("GPX non valido o senza tracciato"); return; }
        loadMine(full, name);
        map.fitBounds(L.latLngBounds(state.myGpx.pts), { padding: [40, 40] });
        if (state.wantNav) { state.wantNav = false; startNav(); }
      } catch { toast("GPX non valido o senza tracciato"); }
    };
    if (state.pendingGpx) { const p = state.pendingGpx; state.pendingGpx = null; window.__gcLoadGpx(p.name, p.xml); }
    $("#chipNav").onclick = startNav;
    $("#chipExplore").onclick = () => { state.wantNav = false; GcNav.stop(); setChip(false); };
    $("#mapOpenGpx").onclick = () => openGpxChoice();
  }
  // Zone (poligoni informativi associati a una zona esistente): visibili a tutti, modificabili in modalità modifica.
  let zonesApi = null;
  const zoneList = [];
  state.zoneList = zoneList;
  const refreshZones = async () => {
    try {
      const qs = await getDocs(collection(db, "trailZones"));
      zoneList.length = 0;
      qs.docs.forEach((d) => {
        const zn = d.data().zone || "", ts = (state.trails || []).filter((t) => (t.zone || "").trim() === zn && t.lat != null && t.lon != null);
        zoneList.push({ id: d.id, zone: zn, pts: polyDec(d.data().polygon || ""), builders: d.data().builders || [],
          center: ts.length ? [ts.reduce((a, t) => a + t.lat, 0) / ts.length, ts.reduce((a, t) => a + t.lon, 0) / ts.length] : null });
      });
      if (zonesApi) zonesApi.set(zoneList);
    } catch (e) { console.warn("zone", e); }
  };
  if (typeof TrailTrace !== "undefined" && TrailTrace.attachZones) {
    zonesApi = TrailTrace.attachZones(map, layersCtl, { onZoneTap: (id) => {
      const z = zoneList.find((x) => x.id === id);
      if (z && editApi) editApi.openMenu({ kind: "zone", id: z.id, name: z.zone, path: z.pts });
    } });
    if (state.mapZonesOff) zonesApi.setVisible(false);
    const zb = $("#mapZones");
    if (zb) zb.onclick = () => {
      state.mapZonesOff = !state.mapZonesOff; saveMapEyes();
      zonesApi.setVisible(!state.mapZonesOff);
      zb.classList.toggle("on", !state.mapZonesOff);
      zb.innerHTML = eyeSvg(!!state.mapZonesOff) + "<b>Z</b>";
      zb.title = state.mapZonesOff ? "Mostra le zone" : "Nascondi le zone";
    };
    if (state.mapBldOff) zonesApi.setBuildersVisible(false);
    const bb = $("#mapBld");
    if (bb) bb.onclick = () => {
      state.mapBldOff = !state.mapBldOff; saveMapEyes();
      zonesApi.setBuildersVisible(!state.mapBldOff);
      bb.classList.toggle("on", !state.mapBldOff);
      bb.innerHTML = eyeSvg(!!state.mapBldOff) + "<b>L</b>";
      bb.title = state.mapBldOff ? "Mostra i loghi dei costruttori" : "Nascondi i loghi dei costruttori";
    };
    refreshZones();
  }
  // Punti di interesse (POI): ritrovo, vetta, area picnic, altro. Lettura pubblica, modifica con login in modalità modifica.
  let poisApi = null;
  const poiList = [];
  window.GC_POIS = poiList;  // letta dal 3D (flight3d.js)
  const refreshPois = async () => {
    try {
      const qs = await getDocs(collection(db, "pois"));
      poiList.length = 0;
      qs.docs.forEach((d) => { const x = d.data(); poiList.push({ id: d.id, name: x.name || "", desc: x.desc || "", type: x.type || "altro", lat: x.lat, lon: x.lon, createdByUid: x.createdByUid || "", by: x.createdByName || "", upd: x.updatedByName || "" }); });
      if (poisApi) poisApi.set(poiList);
    } catch (e) { console.warn("pois", e); }
  };
  if (typeof TrailTrace !== "undefined" && TrailTrace.attachPois) {
    poisApi = TrailTrace.attachPois(map, {
      onNavigate: (id) => { const p = poiList.find((x) => x.id === id); if (p) openNavigation(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`, `Raggiungi «${p.name}» con`); },
      onEdit: (id) => { const p = poiList.find((x) => x.id === id); if (p) openPoiDialog(p, null, refreshPois); },
      onDelete: async (id) => {
        const p = poiList.find((x) => x.id === id); if (!p) return;
        if (!confirm(`Eliminare «${p.name}»?`)) return;
        try { await deleteDoc(doc(db, "pois", id)); logTrail("poi_delete", p.name); toast("Punto eliminato"); refreshPois(); } catch (e) { toast("Errore: " + (e.message || e)); }
      },
    });
    if (state.mapPoisOff) poisApi.setVisible(false);
    const pb = $("#mapPois");
    if (pb) pb.onclick = () => {
      state.mapPoisOff = !state.mapPoisOff; saveMapEyes();
      poisApi.setVisible(!state.mapPoisOff);
      pb.classList.toggle("on", !state.mapPoisOff);
      pb.innerHTML = eyeSvg(!!state.mapPoisOff) + "<b>P</b>";
      pb.title = state.mapPoisOff ? "Mostra i punti di interesse" : "Nascondi i punti di interesse";
    };
    refreshPois();
  }
  setupHazards(map);
  const wrap = $("#mapWrap"), fb2 = $("#mapFull");
  if ($("#mapHelp")) $("#mapHelp").onclick = openMapHelp;
  // Tasto 3D: la zona che stai guardando in 3D, con i trail (colore = difficoltà) e le zone.
  if ($("#map3DArea")) $("#map3DArea").onclick = () => {
    if (!window.Flight3D || !state.map) return;
    const c = state.map.getCenter(), { trails, zones } = area3DExtra();
    // Con un GPX caricato il 3D mostra anche il tuo GPX con la barra di riproduzione (▶), sopra trail e zone.
    if (state.myGpx && state.myGpx.full && state.myGpx.full.length > 1) Flight3D.open({ name: state.myGpx.name, full: state.myGpx.full, extra: { trails, zones } });
    else Flight3D.openArea({ center: [c.lat, c.lng], zoom: state.map.getZoom(), trails, zones });
  };
  // Tracciamento a dito (solo a schermo intero, con login, in modalità modifica): aggancia la traccia ai sentieri OSM.
  document.querySelectorAll("#tbar").forEach((n) => n.remove());
  const traceUi = (state.user && typeof TrailTrace !== "undefined") ? TrailTrace.attachUi(map, (r) => openTraceSave(r, refresh), 95, (pts) => openZonePick(pts, refreshZones), (lat, lon) => openPoiDialog(null, { lat, lon }, refreshPois), () => {
    // «Importa GPX»: uno o più file (GPX, KML, GeoJSON, TCX, CSV) da cui creare trail.
    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".gpx,.kml,.geojson,.json,.tcx,.csv,application/gpx+xml,text/xml,application/xml,application/json,text/csv";
    inp.onchange = () => openGpxImport([...inp.files], refresh); inp.click();
  }) : null;
  const syncEditUi = () => {
    const edit = LS.trailEdit(), fs = wrap.classList.contains("map-fs");
    if (traceUi) { if (edit && fs) traceUi.show(); else traceUi.hide(); }
    if (typeof TrailTrace !== "undefined") TrailTrace.editOn = edit;
    if (zonesApi) zonesApi.setEdit(edit);
    if (poisApi) poisApi.setEdit(edit);
    if (editApi) editApi.setEnabled(edit && !!state.user);
  };
  syncEditUi();
  fb2.onclick = () => {
    const on = wrap.classList.toggle("map-fs");
    fb2.textContent = on ? "✕" : "⛶"; document.body.classList.toggle("no-scroll", on);
    syncEditUi();
    setTimeout(() => map.invalidateSize(), 50);
  };
  // Matita sulla mappa: cambia modalità senza ricostruire la mappa (niente salti di zoom/posizione).
  const penBtn = document.querySelector(".map-mode-wrap .trail-mode:not(#mapNames)");
  if (penBtn) penBtn.onclick = () => {
    LS.setTrailEdit(!LS.trailEdit());
    const on = LS.trailEdit();
    penBtn.classList.toggle("on", on); penBtn.innerHTML = pencilSvg(!on);
    penBtn.title = on ? "Modalità modifica (tocca per sola lettura)" : "Sola lettura (tocca per modificare)";
    // La barra Traccia/Sentiero/Zona/POI vive solo a schermo intero: attivando la modifica ci si entra da soli.
    if (on && state.user && !wrap.classList.contains("map-fs")) fb2.onclick(); else syncEditUi();
  };
  // La mia posizione (permesso di posizione del browser): pallino blu + cerchio di precisione.
  if (state.locWatch != null) { navigator.geolocation.clearWatch(state.locWatch); state.locWatch = null; }
  const locBtn = $("#mapLoc");
  let locDot = null, locCirc = null, firstFix = true;
  const stopLoc = () => {
    if (state.locWatch != null) { navigator.geolocation.clearWatch(state.locWatch); state.locWatch = null; }
    if (locDot) { map.removeLayer(locDot); map.removeLayer(locCirc); locDot = locCirc = null; }
    locBtn.classList.remove("on");
  };
  locBtn.onclick = () => {
    if (state.locWatch != null) { stopLoc(); return; }
    if (!navigator.geolocation) { toast("Posizione non disponibile su questo dispositivo."); return; }
    locBtn.classList.add("on"); firstFix = true;
    state.locWatch = navigator.geolocation.watchPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude], acc = pos.coords.accuracy || 30;
      if (!locDot) {
        locCirc = L.circle(ll, { radius: acc, color: "#1E6BFF", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
        locDot = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#1E6BFF", fillOpacity: 1, interactive: false }).addTo(map);
      } else { locDot.setLatLng(ll); locCirc.setLatLng(ll); locCirc.setRadius(acc); }
      if (firstFix) { firstFix = false; map.setView(ll, Math.max(map.getZoom(), 15)); }
    }, (err) => { toast(err.code === 1 ? "Permesso di posizione negato." : "Posizione non disponibile."); stopLoc(); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
  const recBtn = $("#mapRec");
  const recPaint = () => {
    if (!recBtn) return;
    const r = state.rec;
    recBtn.classList.toggle("on", !!r);
    recBtn.textContent = r ? `■ ${fmtDur(Date.now() - r.start)} · ${(r.dist / 1000).toFixed(2)} km` : "● REC";
    // Percorso fatto finora: linea rossa semitrasparente sulla mappa.
    if (r) {
      if (!state.recLine || state.recLine._map !== map) state.recLine = L.polyline([], { color: "#e53935", weight: 7, opacity: 0.5, lineCap: "round", interactive: false }).addTo(map);
      state.recLine.setLatLngs(r.pts.map((p) => [p[0], p[1]]));
    } else if (state.recLine) { if (state.recLine._map) state.recLine.remove(); state.recLine = null; }
  };
  if (recBtn) {
    recPaint();
    if (state.recTimer) clearInterval(state.recTimer);
    state.recTimer = setInterval(() => { if (!$("#mapRec")) { clearInterval(state.recTimer); return; } recPaint(); }, 1000);
    recBtn.onclick = () => {
      if (state.rec) { stopRecording(mineApi, recPaint); return; }
      if (!navigator.geolocation) { toast("Posizione non disponibile su questo dispositivo."); return; }
      startRecording(recPaint);
      if (state.locWatch == null) locBtn.click();  // mostra anche la posizione in tempo reale
    };
  }
}

/** Registrazione GPX nascosta per ora: mettere true per riabilitarla. */
const RECORDING_ENABLED = false;
const fmtDur = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const distM = (a, b) => { const R = 6371000, p = Math.PI / 180, dl = (b[1] - a[1]) * p, x = Math.sin((b[0] - a[0]) * p / 2) ** 2 + Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(dl / 2) ** 2; return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };

/** Registrazione del percorso: funziona finché la pagina resta aperta (schermo acceso; si chiede di non spegnerlo). */
async function startRecording(paint) {
  state.rec = { start: Date.now(), pts: [], dist: 0, gain: 0, lastEle: null, wake: null, watch: null };
  const r = state.rec;
  try { if (navigator.wakeLock) r.wake = await navigator.wakeLock.request("screen"); } catch {}
  r.watch = navigator.geolocation.watchPosition((pos) => {
    const c = pos.coords; if (c.accuracy && c.accuracy > 40) return;
    const p = [c.latitude, c.longitude, c.altitude == null ? null : c.altitude, pos.timestamp], last = r.pts[r.pts.length - 1];
    if (last) { const d = distM(last, p); if (d < 3) return; r.dist += d; }
    if (p[2] != null) { if (r.lastEle == null || r.lastEle - p[2] >= 3) r.lastEle = p[2]; else if (p[2] - r.lastEle >= 3) { r.gain += p[2] - r.lastEle; r.lastEle = p[2]; } }
    r.pts.push(p);
  }, (err) => { toast(err.code === 1 ? "Permesso di posizione negato." : "Posizione non disponibile."); if (!r.pts.length) { stopRecording(null, paint, true); } },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  document.addEventListener("visibilitychange", r.vis = async () => {
    if (document.visibilityState === "visible" && state.rec === r && navigator.wakeLock) { try { r.wake = await navigator.wakeLock.request("screen"); } catch {} }
  });
  toast("Registrazione avviata: tieni lo schermo acceso.");
  paint();
}

function gpxFromPoints(pts, name) {
  const x = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GiroCalendar" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${x(name)}</name><time>${iso(pts[0][3])}</time></metadata>\n<trk><name>${x(name)}</name><trkseg>\n` +
    pts.map((p) => `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">${p[2] == null ? "" : `<ele>${p[2].toFixed(1)}</ele>`}<time>${iso(p[3])}</time></trkpt>`).join("\n") + "\n</trkseg></trk>\n</gpx>\n";
}

function stopRecording(mineApi, paint, silent) {
  const r = state.rec; if (!r) return;
  if (r.watch != null) navigator.geolocation.clearWatch(r.watch);
  if (r.wake) { try { r.wake.release(); } catch {} }
  document.removeEventListener("visibilitychange", r.vis);
  state.rec = null; paint();
  if (silent || r.pts.length < 2) { if (!silent) toast("Registrazione troppo corta: scartata."); return; }
  const d = new Date(r.start), pad = (n) => String(n).padStart(2, "0");
  const def = `Uscita ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  const m = modal(`<h3>Registrazione conclusa</h3>
    <p class="muted small">Distanza ${(r.dist / 1000).toFixed(2)} km · durata ${fmtDur(r.pts[r.pts.length - 1][3] - r.start)}${r.gain > 0 ? ` · salita ${Math.round(r.gain)} m` : ""} · ${r.pts.length} punti</p>
    <label>Nome del tracciato <input id="rcName" value="${esc(def)}"></label>
    <div class="row gap" style="margin-top:10px;flex-wrap:wrap"><button class="btn" id="rcSave">Salva file GPX…</button><button class="btn ghost" id="rcMap">Mostra sulla mappa</button></div>
    <div id="rcErr" class="err"></div>
    <div class="row end" style="margin-top:10px"><button class="btn ghost" id="rcClose">Scarta</button></div>`);
  const nm = () => m.querySelector("#rcName").value.trim() || def;
  m.querySelector("#rcSave").onclick = async () => {
    const name = nm(), fname = name.replace(/[\\/:*?"<>|]/g, "_") + ".gpx", data = gpxFromPoints(r.pts, name);
    try {
      if (window.showSaveFilePicker) {  // il browser chiede dove salvare
        const h = await showSaveFilePicker({ suggestedName: fname, types: [{ description: "Tracciato GPX", accept: { "application/gpx+xml": [".gpx"] } }] });
        const w = await h.createWritable(); await w.write(data); await w.close();
      } else {  // download classico (la cartella dipende dalle impostazioni del browser)
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/gpx+xml" })); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      toast("GPX salvato"); m.querySelector("#rcClose").textContent = "Chiudi";
    } catch (e) { if (e && e.name !== "AbortError") m.querySelector("#rcErr").textContent = "Salvataggio non riuscito"; }
  };
  m.querySelector("#rcMap").onclick = () => {
    const pts = r.pts.map((p) => [p[0], p[1]]);
    state.myGpx = { pts: polySimplify(pts), name: nm(), full: pts.map((q) => ({ lat: q[0], lon: q[1], ele: null, t: null })) };
    if (mineApi) { mineApi.show(state.myGpx.pts, state.myGpx.name); state.myGpxHidden = false; const mb = $("#mapMineMenu"); if (mb) mb.hidden = false; const e = $("#mapMineEye"), x = $("#mapMineX"); if (e) { e.hidden = false; e.classList.add("on"); e.innerHTML = eyeSvg(false) + "<b>G</b>"; } if (x) x.hidden = false; }
    m.remove();
  };
  m.querySelector("#rcClose").onclick = () => m.remove();
}

/** Riepilogo import GPX: abbina i file ai trail dal nome; ogni abbinamento è modificabile con ricerca. */
async function openGpxImport(files, onDone) {
  if (!files.length) return;
  const trails = state.trails || [];
  const cand = trails.map((t) => [t, normTxt(t.name)]);
  const items = [];
  for (const f of files) {
    try {
      const pts = polySimplify(parseGpxPoints(await f.text()));
      if (pts.length < 2) continue;
      const base = f.name.replace(/\.[^.]+$/, ""), n = normTxt(base);
      let best = null, bs = 0;
      cand.forEach(([t, tn]) => { const sc = similarity(n, tn); if (sc > bs) { bs = sc; best = t; } });
      items.push({ name: base, pts, trailId: bs >= 0.6 ? best.id : null });
    } catch {}
  }
  if (items.length < files.length) toast(`${files.length - items.length} file GPX non leggibili`);
  if (!items.length) return;
  const w = modal(`<h3>Importa GPX (${items.length})</h3><div id="giRows" style="max-height:50vh;overflow:auto"></div>
    <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="giGo"></button></div>`, { large: true });
  const draw = () => {
    w.querySelector("#giRows").innerHTML = items.map((it, i) => {
      const t = trails.find((x) => x.id === it.trailId);
      const label = it.newTrail ? `+ Nuovo trail: ${it.newTrail.name} (${it.newTrail.zone || "—"})` : t ? `${t.name} (${t.zone})` : "— nessun trail: tocca per cercare —";
      return `<div style="margin-bottom:10px"><b class="small">${esc(it.name)}</b>
        <div class="row gap"><button class="btn ghost block giPick" data-i="${i}" style="text-align:left;flex:1">${esc(label)}</button>
        <button class="btn ghost giNew" data-i="${i}" title="Crea un nuovo trail con questo tracciato">+ Trail</button></div></div>`;
    }).join("");
    const n = items.filter((x) => x.trailId || x.newTrail).length;
    const go = w.querySelector("#giGo"); go.textContent = `Importa ${n}`; go.disabled = n === 0;
    w.querySelectorAll(".giPick").forEach((b) => b.onclick = () => pickTrailFor(items[+b.dataset.i], trails, draw));
    w.querySelectorAll(".giNew").forEach((b) => b.onclick = () => newTrailForm(items[+b.dataset.i], trails, draw));
  };
  draw();
  w.querySelector("#giGo").onclick = async () => {
    let ok = 0;
    for (const it of items.filter((x) => x.trailId || x.newTrail)) {
      const mid = it.pts[Math.floor(it.pts.length / 2)];
      try {
        if (it.newTrail) {
          it.trailId = await createTrail(it.newTrail.name, it.newTrail.zone, it.newTrail.diff);
          trails.push({ id: it.trailId, name: it.newTrail.name, zone: it.newTrail.zone });
        }
        const t = trails.find((x) => x.id === it.trailId);
        await setTrailFieldsLogged(it.trailId, { path: polyEnc(it.pts), lat: mid[0], lon: mid[1] }, "path", t ? t.name : "", `${it.pts.length} punti`); ok++;
      } catch (e) { console.warn(e); }
    }
    w.remove(); toast(`Importati ${ok} tracciati`); onDone && onDone();
  };
}

/** Scelta del trail con ricerca: parte dal nome del file, ordina per somiglianza, filtra mentre scrivi. */
function pickTrailFor(item, trails, onPicked) {
  const m = modal(`<h3>Scegli il trail</h3>
    <input id="tpQ" value="${esc(item.name)}" placeholder="Cerca per nome o zona" style="width:100%">
    <div id="tpList" style="max-height:45vh;overflow:auto;margin-top:8px"></div>
    <div class="row between" style="margin-top:10px"><button class="btn ghost" id="tpNew">+ Nuovo trail</button><button class="btn ghost" id="tpSkip">Salta questo file</button><button class="btn ghost" data-close>Annulla</button></div>`);
  const list = m.querySelector("#tpList");
  const render = () => {
    const q = normTxt(m.querySelector("#tpQ").value), words = q.split(" ").filter(Boolean);
    const res = trails.map((t) => [t, normTxt(t.name + " " + t.zone), normTxt(t.name)])
      .filter(([, n]) => !q || words.every((x) => n.includes(x)) || similarity(q, n) >= 0.5)
      .sort((a, b) => Math.max(similarity(q, b[2]), similarity(q, b[1])) - Math.max(similarity(q, a[2]), similarity(q, a[1])))
      .slice(0, 40);
    list.innerHTML = res.length ? res.map(([t]) => `<div class="tpRow" data-id="${esc(t.id)}" style="padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer"><div>${esc(t.name)}</div><div class="muted small">${esc(t.zone)}</div></div>`).join("") : `<p class="muted small">Nessun risultato</p>`;
    list.querySelectorAll(".tpRow").forEach((r) => r.onclick = () => { item.trailId = r.dataset.id; item.newTrail = null; m.remove(); onPicked(); });
  };
  m.querySelector("#tpQ").oninput = render; render();
  m.querySelector("#tpSkip").onclick = () => { item.trailId = null; item.newTrail = null; m.remove(); onPicked(); };
  m.querySelector("#tpNew").onclick = () => { m.remove(); newTrailForm(item, trails, onPicked, m.querySelector("#tpQ").value.trim()); };
}

/** Form "nuovo trail" per un file GPX dell'import: nome, zona (esistente o nuova), difficoltà. Il trail viene creato solo all'Importa. */
function newTrailForm(item, trails, onDone, name0) {
  const zones = [...new Set(trails.map((t) => (t.zone || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const cur = item.newTrail || {};
  let diff = cur.diff || "";
  const m = modal(`<h3>Nuovo trail</h3>
    <label>Nome del trail <input id="ntName" value="${esc(cur.name || name0 || item.name)}"></label>
    <label>Zona <select id="ntZoneSel">${zones.map((z) => `<option value="${esc(z)}" ${z === cur.zone ? "selected" : ""}>${esc(z)}</option>`).join("")}<option value="__new__">+ Nuova zona…</option></select>
      <input id="ntZone" placeholder="Nome della nuova zona" hidden></label>
    <div class="diff-grid" id="ntDiff"><button type="button" class="diff-opt ${diff ? "" : "sel"}" data-v="">Nessuna</button>
      ${Object.entries(DIFFICULTY).map(([id, label]) => `<button type="button" class="diff-opt ${diff === id ? "sel" : ""}" data-v="${id}">${label}</button>`).join("")}</div>
    <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="ntOk">Conferma</button></div>`);
  const zs = m.querySelector("#ntZoneSel"), zn = m.querySelector("#ntZone");
  const sync = () => { zn.hidden = zs.value !== "__new__"; if (!zn.hidden) zn.focus(); }; zs.onchange = sync; sync();
  m.querySelectorAll("#ntDiff .diff-opt").forEach((b) => b.onclick = () => { m.querySelectorAll("#ntDiff .diff-opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); diff = b.dataset.v; });
  m.querySelector("#ntOk").onclick = () => {
    const name = m.querySelector("#ntName").value.trim(); if (!name) { toast("Il nome è obbligatorio."); return; }
    const zone = zs.value === "__new__" ? zn.value.trim() : zs.value;
    if (!zone) { toast("Indica la zona."); return; }
    item.newTrail = { name, zone, diff }; item.trailId = null; m.remove(); onDone();
  };
}

// ── tracciamento a dito: salvataggio del risultato (vedi trailtrace.js) ──
function distToPoly(p, poly) {
  const kx = 111320 * Math.cos(p[0] * Math.PI / 180), ky = 110540;
  let best = Infinity;
  if (poly.length === 1) return Math.hypot((poly[0][1] - p[1]) * kx, (poly[0][0] - p[0]) * ky);
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = (poly[i][1] - p[1]) * kx, ay = (poly[i][0] - p[0]) * ky, bx = (poly[i + 1][1] - p[1]) * kx, by = (poly[i + 1][0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
function trailOverlap(route, t) {
  if (!t.path) return 0;
  const poly = polyDec(t.path), sample = polySimplify(route, 1, 150);
  return sample.length ? sample.filter((p) => distToPoly(p, poly) <= 30).length / sample.length : 0;
}
async function saveTrailPath(trailId, trailName, pts) {
  const mid = pts[Math.floor(pts.length / 2)];
  await setTrailFieldsLogged(trailId, { path: polyEnc(pts), lat: mid[0], lon: mid[1] }, "path", trailName, `${pts.length} punti`);
}
function downloadGpx(name, pts) {
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="GiroCalendar" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>\n` +
    pts.map((p) => `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"/>`).join("\n") + `\n</trkseg></trk></gpx>\n`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
  a.download = (name.replace(/[^A-Za-z0-9 _.-]/g, "_") || "tracciato") + ".gpx"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Costruttori dei trail di una zona: uno o più loghi (ridotti a 96 px) ciascuno con un link social. */
function openZoneBuilders(zone, existing, onDone) {
  if (!state.user) { doSignIn(); return; }
  const items = existing.map((b) => ({ name: b.name || "", logo: b.logo || "", url: b.url || "" }));
  const m = modal(`<h3>Costruttori · ${esc(zone)}</h3>
    <p class="muted small">Compaiono sulla mappa quando la zona è attiva (occhio Z). Ogni costruttore ha un logo e un link social.</p>
    <div id="zbList"></div>
    <hr style="border:0;border-top:1px solid var(--border);margin:10px 0">
    <b class="small">Aggiungi</b>
    <div class="row gap center" style="margin:6px 0"><img id="zbPrev" style="width:44px;height:44px;border-radius:50%;object-fit:cover;background:var(--surf2);display:none"><input id="zbFile" type="file" accept="image/*" style="flex:1"></div>
    <input id="zbName" placeholder="Nome (es. Mufloni Valcuvia ODV)" style="width:100%;margin-bottom:6px">
    <input id="zbUrl" placeholder="Link social (https://…)" style="width:100%">
    <div class="row between" style="margin-top:8px"><button class="btn ghost" id="zbAdd">+ Aggiungi</button></div>
    <div id="zbErr" class="err"></div>
    <div class="row end gap" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="zbSave">Salva</button></div>`, { large: true });
  let logo = "";
  const list = m.querySelector("#zbList");
  const draw = () => {
    list.innerHTML = items.length ? items.map((b, i) => `<div class="row gap center" style="margin:6px 0">
      <img src="${esc(safeImg(b.logo))}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;background:var(--surf2)">
      <div style="flex:1;min-width:0"><b class="small">${esc(b.name || "—")}</b><div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.url)}</div></div>
      <button class="icon-btn zbEd" data-i="${i}" title="Modifica">✏️</button><button class="icon-btn zbDel" data-i="${i}" title="Rimuovi">🗑</button></div>`).join("") : `<p class="muted small">Nessun costruttore.</p>`;
    list.querySelectorAll(".zbEd").forEach((d) => d.onclick = () => {
      const b = items.splice(+d.dataset.i, 1)[0]; logo = b.logo;
      m.querySelector("#zbName").value = b.name; m.querySelector("#zbUrl").value = b.url;
      const pv = m.querySelector("#zbPrev"); pv.src = logo; pv.style.display = "block"; draw();
    });
    list.querySelectorAll(".zbDel").forEach((d) => d.onclick = () => { items.splice(+d.dataset.i, 1); draw(); });
  };
  draw();
  m.querySelector("#zbFile").onchange = (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 96; const g = c.getContext("2d");
      const sz = Math.min(img.width, img.height), sx = (img.width - sz) / 2, sy = (img.height - sz) / 2;
      g.drawImage(img, sx, sy, sz, sz, 0, 0, 96, 96);
      logo = c.toDataURL("image/webp", 0.85); if (!logo.startsWith("data:image/webp")) logo = c.toDataURL("image/png");
      const pv = m.querySelector("#zbPrev"); pv.src = logo; pv.style.display = "block"; URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  m.querySelector("#zbAdd").onclick = () => {
    const err = m.querySelector("#zbErr"); err.textContent = "";
    const name = m.querySelector("#zbName").value.trim(); let u = m.querySelector("#zbUrl").value.trim();
    if (!logo) { err.textContent = "Scegli un logo."; return; }
    if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    if (u) { try { new URL(u); } catch { err.textContent = "Link non valido."; return; } }
    items.push({ name, logo, url: u }); logo = ""; m.querySelector("#zbName").value = ""; m.querySelector("#zbUrl").value = ""; m.querySelector("#zbFile").value = "";
    m.querySelector("#zbPrev").style.display = "none"; draw();
  };
  m.querySelector("#zbSave").onclick = async () => {
    if (logo || m.querySelector("#zbName").value.trim() || m.querySelector("#zbUrl").value.trim()) {
      m.querySelector("#zbAdd").onclick(); if (m.querySelector("#zbErr").textContent) return;
    }
    try {
      const id = normTxt(zone).replace(/\s+/g, "-") || "zona", ref = doc(db, "trailZones", id), ex = await getDoc(ref);
      const data = { zone, builders: items, updatedAtMillis: Date.now() };
      if (!ex.exists()) { data.polygon = ""; data.createdByUid = state.user.uid; }
      await setDoc(ref, data, { merge: true });
      logTrail("zone_builders", zone, `${items.length} costruttori`);
      m.remove(); toast("Costruttori salvati"); onDone && onDone();
    } catch (e) { m.querySelector("#zbErr").textContent = e.message || "Salvataggio non riuscito"; }
  };
}

/** Dopo aver disegnato un poligono: lo si associa a una zona esistente (il campo "zona" dei trail). */
function openZonePick(pts, onDone) {
  const zones = [...new Set((state.trails || []).map((t) => (t.zone || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const m = modal(`<h3>A quale zona appartiene?</h3>
    <input id="zpQ" placeholder="Cerca o scrivi una zona nuova" style="width:100%">
    <div id="zpList" style="max-height:35vh;overflow:auto;margin-top:8px"></div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)"><b class="small">Oppure crea una zona nuova</b>
      <div class="row gap" style="margin-top:6px"><input id="zpNew" placeholder="Nome della nuova zona" style="flex:1;width:auto"><button class="btn" id="zpCreate">Crea e salva</button></div></div>
    <div class="row end" style="margin-top:10px"><button class="btn ghost" data-close>Annulla</button></div>`);
  const list = m.querySelector("#zpList"), input = m.querySelector("#zpQ");
  const render = () => {
    const q = normTxt(input.value);
    list.innerHTML = zones.filter((z) => !q || normTxt(z).includes(q)).map((z) =>
      `<div class="zpRow" data-z="${esc(z)}" style="padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer"><b>${esc(z)}</b></div>`).join("") +
      (input.value.trim() && !zones.some((z) => z.toLowerCase() === input.value.trim().toLowerCase()) ? `<div class="zpRow" data-z="${esc(input.value.trim())}" style="padding:10px 4px;cursor:pointer;color:var(--accent)"><b>+ Crea nuova zona «${esc(input.value.trim())}»</b></div>` : "") ||
      `<p class="muted small">Nessuna zona: scrivi il nome per crearne una</p>`;
    list.querySelectorAll(".zpRow").forEach((r) => r.onclick = () => pick(r.dataset.z));
  };
  const pick = async (zone) => {
      zone = (zone || "").trim(); if (!zone) { toast("Scrivi il nome della zona."); return; }
      try {
        const id = normTxt(zone).replace(/\s+/g, "-") || "zona";
        const ref = doc(db, "trailZones", id), ex = await getDoc(ref);
        await setDoc(ref, { zone, polygon: polyEnc(pts), createdByUid: ex.exists() ? ex.data().createdByUid : state.user.uid, updatedAtMillis: Date.now() }, { merge: true });
        logTrail("zone", zone, `${pts.length} vertici`);
        m.remove(); toast(`Zona «${zone}» salvata`); onDone && onDone();
      } catch (e) { toast(e.message || "Salvataggio non riuscito"); }
  };
  m.querySelector("#zpCreate").onclick = () => pick(m.querySelector("#zpNew").value);
  input.oninput = render; render();
}

/** Dopo il tracciamento: sceglie il trail (suggerimenti per sovrapposizione e nome OSM, ricerca) o ne crea uno. */
function openTraceSave(res, onDone) {
  let reversed = false;
  const trails = state.trails || [];
  const names = (res.names || []).map((n) => n[0]);
  const overlaps = new Map(trails.map((t) => [t.id, trailOverlap(res.points, t)]));
  const osmNorm = names.map(normTxt);
  const route = () => (reversed ? [...res.points].reverse() : res.points);
  const m = modal(`<h3>Salva tracciato</h3>
    <p class="muted small">${Math.round(res.lengthM)} m · ${res.points.length} punti · ${res.snapped ? "agganciato ai sentieri OSM" : esc(res.warn || "tracciato a mano")}</p>
    <div class="row gap center" style="flex-wrap:wrap;margin-bottom:6px">
      <button class="btn ghost" id="tsRev">Inverti direzione (inizio ↔ fine)</button>
      <label class="row gap center small" style="margin:0"><input type="checkbox" id="tsGpx" ${res.fromGpx ? "" : "checked"} style="width:auto;margin:0"> Scarica anche il GPX</label>
    </div>
    <div id="tsBody"></div>`, { large: true });
  const body = m.querySelector("#tsBody");
  const finish = async (trailId, name, doCreate) => {
    try {
      const pts = route();
      if (doCreate) trailId = await createTrail(name.name, name.zone, name.diff);
      await saveTrailPath(trailId, doCreate ? name.name : name, pts);
      if (m.querySelector("#tsGpx").checked) downloadGpx(doCreate ? name.name : name, pts);
      m.remove(); toast("Tracciato salvato"); onDone && onDone();
    } catch (e) { toast(e.message || "Salvataggio non riuscito"); }
  };
  m.querySelector("#tsRev").onclick = (e) => { reversed = !reversed; e.target.textContent = reversed ? "Direzione invertita (tocca per ripristinare)" : "Inverti direzione (inizio ↔ fine)"; };
  const drawPick = (q0) => {
    body.innerHTML = `<input id="tsQ" placeholder="Cerca il trail (o scrivi il nome)" value="${esc(q0)}" style="width:100%">
      <div id="tsList" style="max-height:42vh;overflow:auto;margin-top:8px"></div>`;
    const input = body.querySelector("#tsQ"), list = body.querySelector("#tsList");
    const render = () => {
      const q = normTxt(input.value), words = q.split(" ").filter(Boolean);
      const rows = trails.map((t) => {
        const nm = normTxt(t.name), sim = Math.max(similarity(q, nm), ...osmNorm.map((o) => similarity(o, nm)), 0), ov = overlaps.get(t.id) || 0;
        return { t, ov, sim, txt: normTxt(t.name + " " + t.zone) };
      }).filter((r) => r.ov >= 0.3 || !q || r.sim >= 0.5 || words.every((w) => r.txt.includes(w)))
        .sort((a, b) => (b.ov * 2 + b.sim) - (a.ov * 2 + a.sim)).slice(0, 30);
      list.innerHTML = rows.map((r) => `<div class="tsRow" data-id="${esc(r.t.id)}" style="padding:8px 4px;border-bottom:1px solid var(--border);cursor:pointer"><b>${esc(r.t.name)}</b>
        <div class="muted small">${esc(r.t.zone)}${r.ov >= 0.3 ? ` · si sovrappone al ${Math.round(r.ov * 100)}%` : ""}</div></div>`).join("") +
        `<div id="tsNew" style="padding:12px 4px;cursor:pointer;color:var(--accent);font-weight:700">+ Crea nuovo trail${input.value.trim() ? ` «${esc(input.value.trim())}»` : ""}</div>`;
      list.querySelectorAll(".tsRow").forEach((el) => el.onclick = () => { const t = trails.find((x) => x.id === el.dataset.id); finish(t.id, t.name, false); });
      list.querySelector("#tsNew").onclick = () => drawNew(input.value.trim() || names[0] || "");
    };
    input.oninput = render; render();
  };
  const drawNew = (name0) => {
    const zones = [...new Set(trails.map((t) => (t.zone || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    let diff = res.mtb != null && /^[0-5]$/.test(res.mtb) ? "s" + res.mtb : "";
    body.innerHTML = `<label>Nome del trail <input id="tnName" value="${esc(name0)}"></label>
      <label>Zona <select id="tnZoneSel">${zones.map((z) => `<option value="${esc(z)}">${esc(z)}</option>`).join("")}<option value="__new__">+ Nuova zona…</option></select>
        <input id="tnZone" placeholder="Nome della nuova zona" hidden></label>
      <div class="diff-grid" id="tnDiff"><button type="button" class="diff-opt ${diff ? "" : "sel"}" data-v="">Nessuna</button>
        ${Object.entries(DIFFICULTY).map(([id, label]) => `<button type="button" class="diff-opt ${diff === id ? "sel" : ""}" data-v="${id}">${label}</button>`).join("")}</div>
      <div class="row between" style="margin-top:10px"><button class="btn ghost" id="tnBack">Indietro</button><button class="btn" id="tnGo">Crea e salva</button></div>`;
    const zs = body.querySelector("#tnZoneSel"), zn = body.querySelector("#tnZone");
    const sync = () => { zn.hidden = zs.value !== "__new__"; if (!zn.hidden) zn.focus(); }; zs.onchange = sync; sync();
    body.querySelectorAll("#tnDiff .diff-opt").forEach((b) => b.onclick = () => { body.querySelectorAll("#tnDiff .diff-opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); diff = b.dataset.v; });
    body.querySelector("#tnBack").onclick = () => drawPick(name0);
    body.querySelector("#tnGo").onclick = () => {
      const name = body.querySelector("#tnName").value.trim(); if (!name) { toast("Il nome è obbligatorio."); return; }
      finish(null, { name, zone: zs.value === "__new__" ? zn.value.trim() : zs.value, diff }, true);
    };
  };
  drawPick(names[0] || "");
}

// ─────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────
applyTheme(LS.theme());
applyTextScale(LS.textScale());
if (!location.hash && LS.lastCode()) {
  history.replaceState(null, "", "#/c/" + LS.lastCode());
}

let authRouted = false;
onAuthStateChanged(auth, (user) => {
  if (!user) { stopWorkshop(); stopContacts(); stopMarket(); }
  const sameUser = authRouted && (state.user?.uid || null) === (user?.uid || null);
  state.user = user;
  // indice email→uid: serve a owner/collaboratori per invitare o bloccare un account scrivendo la sua email
  if (user && user.email) setDoc(doc(db, "emailIndex", user.email.trim().toLowerCase()), { uid: user.uid }).catch(() => {});
  if (sameUser) return;  // stesso account (es. rinnovo sessione): non ricostruire la pagina, si perderebbe il lavoro in corso
  authRouted = true;
  route();
});
