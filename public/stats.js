import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
const root = document.getElementById("root");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT"));
const date = (ms) => (ms ? new Date(ms).toLocaleDateString("it-IT") : "—");

function loginView(msg) {
  root.innerHTML = `<div class="msg"><h1>Statistiche</h1><p>${esc(msg || "Area riservata all'amministratore.")}</p><button id="in">Accedi con Google</button></div>`;
  document.getElementById("in").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => {});
}

async function load(user) {
  root.innerHTML = `<div class="msg">Carico le statistiche…</div>`;
  const r = await fetch("/api/stats", { headers: { Authorization: "Bearer " + (await user.getIdToken()) } });
  if (r.status === 403 || r.status === 401) { await signOut(auth); loginView("Questo account non è autorizzato."); return; }
  if (!r.ok) { root.innerHTML = `<div class="msg">Errore (${r.status}). <button id="rt">Riprova</button></div>`; document.getElementById("rt").onclick = () => load(user); return; }
  render(await r.json(), user);
}

const mb = (b) => (b / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " MB";
function trafficHtml(d) {
  const t = d.traffic || [];
  if (!t.length) return `<h2>Visite e banda del sito</h2><p class="mut">Nessun dato ancora: il contatore è partito adesso e si riempie a ogni visita.</p>`;
  const sum = (rows, k) => rows.reduce((a, x) => a + (x[k] || 0), 0);
  const last = (n) => t.filter((x) => x.day >= new Date(Date.now() - n * 86400000).toISOString().slice(0, 10));
  const kp = (label, v) => `<div class="kpi"><b>${v}</b><span>${esc(label)}</span></div>`;
  const row = (n, label) => { const r = last(n); return kp(`Caricamenti ${label}`, fmt(sum(r, "loads"))) + kp(`Sessioni ${label}`, fmt(sum(r, "sessions"))) + kp(`Banda ${label} (stima)`, mb(sum(r, "bytes"))); };
  const c30 = {}; last(30).forEach((x) => Object.entries(x.countries).forEach(([k, v]) => { c30[k] = (c30[k] || 0) + v; }));
  const top = Object.entries(c30).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const mobile = sum(last(30), "mobile"), desk = sum(last(30), "desktop");
  return `<h2>Visite e banda del sito</h2>
    <div class="grid">${row(7, "7 giorni")}${row(30, "30 giorni")}${kp("Da smartphone (30 g)", fmt(mobile + desk) === "0" ? "—" : Math.round((mobile / (mobile + desk)) * 100) + "%")}</div>
    <p class="mut">Banda = byte scaricati dal browser per caricare il sito (risorse proprie, senza cache): è una stima per difetto, non la fatturazione di Cloudflare.</p>
    <table style="margin-top:8px"><tr><th>Giorno</th><th class="n">Caricamenti</th><th class="n">Sessioni</th><th class="n">Banda</th><th class="n">Mobile</th><th>Paesi</th></tr>
      ${t.slice(0, 30).map((x) => `<tr><td>${esc(x.day)}</td><td class="n">${fmt(x.loads)}</td><td class="n">${fmt(x.sessions)}</td><td class="n">${mb(x.bytes)}</td><td class="n">${x.mobile + x.desktop ? Math.round((x.mobile / (x.mobile + x.desktop)) * 100) + "%" : "—"}</td><td>${esc(Object.entries(x.countries).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + " " + v).join(" · "))}</td></tr>`).join("")}</table>
    <div class="mut" style="margin-top:8px">Paesi (30 giorni): ${esc(top.map(([k, v]) => k + " " + v).join(" · ") || "—")}</div>`;
}

function spaceHtml(d) {
  const sp = d.space;
  if (!sp) return "";
  const kp = (label, v) => `<div class="kpi"><b>${fmt(v)}</b><span>${esc(label)}</span></div>`;
  return `<h2>Spazio personale (I miei giri)</h2>
    <div class="grid">${kp("Utenti che lo usano", sp.users)}${kp("GPX caricati", sp.uploads)}${kp("Giri registrati", sp.recordings)}</div>
    <p class="mut">Conta i file ancora validi: ogni file scade dopo 30 giorni${sp.expired ? ` (${fmt(sp.expired)} scaduti in attesa di pulizia, non contati)` : ""}.</p>`;
}

function render(d, user) {
  const c = d.counts, kp = (label, v) => `<div class="kpi"><b>${fmt(v)}</b><span>${esc(label)}</span></div>`;
  const opens = d.calendars.reduce((a, x) => a + x.opens, 0);
  const months = Object.entries(d.eventsByMonth).sort(), maxM = Math.max(1, ...months.map((m) => m[1]));
  root.innerHTML = `
    <h1>Statistiche</h1>
    <div class="mut">${esc(d.admin)} · aggiornate ${new Date(d.generatedAt).toLocaleString("it-IT")} · <a href="#" id="rf" style="color:var(--acc)">aggiorna</a> · <a href="#" id="out" style="color:var(--acc)">esci</a></div>
    <h2>Utilizzo</h2>
    <div class="grid">${kp("Calendari", c.calendars)}${kp("Aperture calendari (totale)", opens)}${kp("Utenti con login", c.users)}${kp("Utenti con notifiche push", d.usersWithPush)}${kp("Email in indice", c.emailIndex)}</div>
    ${spaceHtml(d)}
    ${trafficHtml(d)}
    <h2>Contenuti del database</h2>
    <div class="grid">${kp("Uscite", c["events*"])}${kp("Epici", c["epics*"])}${kp("Archiviate", c["archived*"])}${kp("Proposte in attesa", c["proposals*"])}${kp("Avvisi", c["announcements*"])}${kp("Schede contatti", c["contacts*"])}${kp("Account in lista nera", c["blocks*"])}
      ${kp("Trail", c.trails)}${kp("Zone", c.trailZones)}${kp("Commenti trail", c["comments*"])}${kp("Log modifiche trail", c.trailLog)}${kp("Annunci Mercatino", c["listings*"])}${kp("Foto Mercatino", c["photos*"])}</div>
    <h2>Calendari</h2>
    <table><tr><th>Nome</th><th>Codice</th><th class="n">Aperture</th><th>Collaboratori</th><th>Pubblico</th><th>Creato</th><th>Owner</th></tr>
      ${d.calendars.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.code)}</td><td class="n">${fmt(x.opens)}</td><td>${x.collabs && x.collabs.length ? esc(x.collabs.join(", ")) : "—"}</td><td>${x.listed ? "sì" : "no"}</td><td>${date(x.created)}</td><td>${esc(x.owner)}</td></tr>`).join("")}</table>
    <h2>Uscite per mese</h2>
    <table>${months.map(([m, n]) => `<tr><td style="width:90px">${esc(m)}</td><td><div class="bar" style="width:${Math.round((n / maxM) * 100)}%"></div></td><td class="n" style="width:50px">${n}</td></tr>`).join("") || "<tr><td>Nessuna uscita</td></tr>"}</table>
    <p class="mut" style="margin-top:18px">Le aperture sono il contatore approssimativo dei calendari (ogni apertura +1, anche senza login). Per la dimensione del database: Firebase → Utilizzo.</p>`;
  document.getElementById("rf").onclick = (e) => { e.preventDefault(); load(user); };
  document.getElementById("out").onclick = (e) => { e.preventDefault(); signOut(auth); };
}

onAuthStateChanged(auth, (u) => { if (u) load(u); else loginView(); });
