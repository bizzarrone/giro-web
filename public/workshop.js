// Tab "Officina": bici e log lavori privati (users/{uid}/bikes e users/{uid}/jobs), stessi dati
// e stesso comportamento dell'app Android (GiroCalendar / BikeGarage).
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, query, where,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const MAX_BIKES = 10;

// ── Icone (path Material, viewBox 24) ──────────────────────
const ICON_PATHS = {"chain":["M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"],"chainring":["M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"],"shock":["M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z"],"brake":["M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"],"wheel":["M18 7a1.003 1.003 0 0 0 1.71.71c.4-.4 1.04-2.46 1.04-2.46s-2.06.64-2.46 1.04c-.18.18-.29.43-.29.71z","M19 2c-2.76 0-5 2.24-5 5 0 2.05 1.23 3.81 3 4.58V13h1v5c0 .55-.45 1-1 1s-1-.45-1-1v-2a3.009 3.009 0 0 0-4-2.83V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3c0-.55.45-1 1-1s1 .45 1 1v2c0 1.65 1.35 3 3 3s3-1.35 3-3v-5h1v-1.42c1.77-.77 3-2.53 3-4.58 0-2.76-2.24-5-5-5zM6 19.5l-2-2v-2.83l2 2v2.83zm0-5-2-2V9.67l2 2v2.83zm0-5-2-2V4.67l2 2V9.5zm4 8-2 2v-2.83l2-2v2.83zm0-5-2 2v-2.83l2-2v2.83zm0-5-2 2V6.67l2-2V7.5zm9 2.5c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"],"oil":["M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zM7.83 14c.37 0 .67.26.74.62.41 2.22 2.28 2.98 3.64 2.87.43-.02.79.32.79.75 0 .4-.32.73-.72.75-2.13.13-4.62-1.09-5.19-4.12a.75.75 0 0 1 .74-.87z"],"cable":["M20 5V4c0-.55-.45-1-1-1h-2c-.55 0-1 .45-1 1v1h-1v4c0 .55.45 1 1 1h1v7c0 1.1-.9 2-2 2s-2-.9-2-2V7c0-2.21-1.79-4-4-4S5 4.79 5 7v7H4c-.55 0-1 .45-1 1v4h1v1c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-1h1v-4c0-.55-.45-1-1-1H7V7c0-1.1.9-2 2-2s2 .9 2 2v10c0 2.21 1.79 4 4 4s4-1.79 4-4v-7h1c.55 0 1-.45 1-1V5h-1z"],"derailleur":["M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"],"saddle":["M4 18v3h3v-3h10v3h3v-6H4v3zm15-8h3v3h-3v-3zM2 10h3v3H2v-3zm15 3H7V5c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v8z"],"handlebar":["M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"],"pedal":["m18.18 10-1.7-4.68A2.008 2.008 0 0 0 14.6 4H12v2h2.6l1.46 4h-4.81l-.36-1H12V7H7v2h1.75l1.82 5H9.9c-.44-2.23-2.31-3.88-4.65-3.99C2.45 9.87 0 12.2 0 15c0 2.8 2.2 5 5 5 2.46 0 4.45-1.69 4.9-4h4.2c.44 2.23 2.31 3.88 4.65 3.99 2.8.13 5.25-2.19 5.25-5 0-2.8-2.2-5-5-5h-.82zM7.82 16c-.4 1.17-1.49 2-2.82 2-1.68 0-3-1.32-3-3s1.32-3 3-3c1.33 0 2.42.83 2.82 2H5v2h2.82zm6.28-2h-1.4l-.73-2H15c-.44.58-.76 1.25-.9 2zm4.9 4c-1.68 0-3-1.32-3-3 0-.93.41-1.73 1.05-2.28l.96 2.64 1.88-.68-.97-2.67c.03 0 .06-.01.09-.01 1.68 0 3 1.32 3 3s-1.33 3-3.01 3z"],"electric":["M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"],"clean":["M16 11h-1V3c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v8H8c-2.76 0-5 2.24-5 5v7h18v-7c0-2.76-2.24-5-5-5zm3 10h-2v-3c0-.55-.45-1-1-1s-1 .45-1 1v3h-2v-3c0-.55-.45-1-1-1s-1 .45-1 1v3H9v-3c0-.55-.45-1-1-1s-1 .45-1 1v3H5v-5c0-1.65 1.35-3 3-3h8c1.65 0 3 1.35 3 3v5z"],"bolt":["m18 3-3 3V3H9C6.24 3 4 5.24 4 8h5v3h6V8l3 3h2V3h-2zM9 13v7c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-7H9z"],"service":["m22.7 19-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"]};
const ICONS = [
  { id: "chain", label: "Catena", kw: ["catena"] },
  { id: "chainring", label: "Corona / pignoni", kw: ["corona", "pignon", "cassetta", "cassette", "guarnitura", "pedivella", "ingranagg"] },
  { id: "shock", label: "Ammortizzatore / forcella", kw: ["ammo", "forcella", "sospension", "mono ", "reggisella telescopica"] },
  { id: "brake", label: "Freni", kw: ["fren", "pastigli", "disco", "dischi", "pinza", "pinze", "rotor"] },
  { id: "wheel", label: "Ruote / copertoni", kw: ["ruota", "ruote", "copertone", "pneumatic", "camera d'aria", "tubeless", "cerchio", "raggi", "mozzo"] },
  { id: "oil", label: "Olio / spurgo", kw: ["olio", "spurgo", "lubrific", "sigillante", "grasso"] },
  { id: "cable", label: "Cavi / guaine", kw: ["cavo", "cavi", "guaina", "guaine", "filo"] },
  { id: "derailleur", label: "Cambio / deragliatore", kw: ["deragliatore", "registr", "indicizz", "cambio cavo", "cambio guaina"] },
  { id: "saddle", label: "Sella", kw: ["sella", "reggisella"] },
  { id: "handlebar", label: "Manubrio / sterzo", kw: ["manubrio", "sterzo", "attacco", "manopol", "nastro"] },
  { id: "pedal", label: "Pedali / bici", kw: ["pedal", "telaio", "bici"] },
  { id: "electric", label: "Elettrico / luci", kw: ["batteria", "luce", "luci", "motore", "display"] },
  { id: "clean", label: "Pulizia", kw: ["pulizia", "lavaggio", "lavata", "sgrass"] },
  { id: "bolt", label: "Viti / minuteria", kw: ["vite", "viti", "bullone", "bulloni", "serraggio"] },
  { id: "service", label: "Tagliando / lavoro", kw: ["tagliando", "revisione", "controllo", "manutenzione"] },
];
const ICON_BY_ID = Object.fromEntries(ICONS.map((i) => [i.id, i]));
const DEFAULT_COLORS = { chain: "#E53935", chainring: "#E53935" };
const PALETTE = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#00897B", "#1E88E5", "#8E24AA", "#D81B60", "#6D4C41", "#757575"];
const EMOJI = { chain: "⛓️", chainring: "⚙️", shock: "↕️", brake: "💿", wheel: "🛞", oil: "💧", cable: "🔌", derailleur: "🎚️", saddle: "💺", handlebar: "🕹️", pedal: "🚲", electric: "⚡", clean: "🧹", bolt: "🔩", service: "🔧" };

const JOB_COLORS = [
  ["", ""], ["yellow", "#FFFF00"], ["orange", "#FFC000"], ["peach", "#FFB570"], ["gray", "#DDDDDD"],
  ["rose", "#FADADD"], ["salmon", "#FFD9CC"], ["cream", "#FFF3C4"], ["lime", "#EAF5C8"], ["mint", "#CFF1DC"],
  ["aqua", "#CDEFF0"], ["sky", "#D3E6FA"], ["lavender", "#E2DAF5"], ["lilac", "#F1D9F0"],
];
const jobColorHex = (id) => (JOB_COLORS.find((c) => c[0] === id) || ["", ""])[1];

// ── Preferenze locali ───────────────────────────────────────
const P = {
  auto: () => localStorage.getItem("gc_ws_auto_icons") !== "0",
  setAuto: (v) => localStorage.setItem("gc_ws_auto_icons", v ? "1" : "0"),
  colors: () => { try { return JSON.parse(localStorage.getItem("gc_ws_icon_colors") || "{}"); } catch { return {}; } },
  setColor: (id, hex) => {
    const c = P.colors(); if (hex) c[id] = hex; else delete c[id];
    localStorage.setItem("gc_ws_icon_colors", JSON.stringify(c));
  },
  bike: () => localStorage.getItem("gc_ws_bike") || "",
  setBike: (id) => localStorage.setItem("gc_ws_bike", id || ""),
};
const iconColor = (id) => P.colors()[id] || DEFAULT_COLORS[id] || "";

function detectIcons(text) {
  const t = (text || "").toLowerCase();
  return ICONS.filter((i) => i.kw.some((k) => t.includes(k))).map((i) => i.id);
}
/** Icone da mostrare: quelle salvate, o (se mai impostate) il rilevamento automatico. */
function resolveIcons(job) {
  if (Array.isArray(job.icons)) return job.icons.filter((i) => ICON_BY_ID[i]);
  return P.auto() ? detectIcons(job.work) : [];
}
function svgIcon(id, size = 14, color = "currentColor") {
  const paths = ICON_PATHS[id]; if (!paths) return "";
  return `<svg class="ws-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-label="${ICON_BY_ID[id].label}">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
}

// ── Formattazione ───────────────────────────────────────────
const fmtCost = (c) => {
  if (c == null || c === "") return "";
  const n = Number(c);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
};
const fmtDate = (iso) => { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0].slice(2)}` : (iso || ""); };
const fmtDateLong = (iso) => { const p = (iso || "").split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : (iso || ""); };
const today = () => new Date().toISOString().slice(0, 10);

// ── Stato ───────────────────────────────────────────────────
const ws = { bikes: [], jobs: [], unsub: [], uid: null, loaded: false };

export function workshopTabHtml() {
  return `<div id="wsRoot"><div class="spin"></div></div>`;
}

export function stopWorkshop() { ws.unsub.forEach((u) => u()); ws.unsub = []; ws.uid = null; ws.loaded = false; }

/** ctx: { db, user, modal, toast, esc, rerender } */
let C = null;
export function wireWorkshop(ctx) {
  C = ctx;
  if (!ctx.user) return;
  if (ws.uid !== ctx.user.uid) {
    stopWorkshop(); ws.uid = ctx.user.uid;
    const base = doc(ctx.db, "users", ws.uid);
    ws.unsub.push(onSnapshot(collection(base, "bikes"), (s) => {
      ws.bikes = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      ws.loaded = true; draw();
    }, () => { ws.loaded = true; draw(); }));
    ws.unsub.push(onSnapshot(collection(base, "jobs"), (s) => {
      ws.jobs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      draw();
    }, () => {}));
  }
  draw();
}

const curBike = () => ws.bikes.find((b) => b.id === P.bike()) || ws.bikes[0] || null;
const bikeJobs = (b) => ws.jobs.filter((j) => b && j.bikeId === b.id)
  .sort((a, b2) => (a.date || "").localeCompare(b2.date || "") || ((a.km || 0) - (b2.km || 0)));

function draw() {
  const root = document.getElementById("wsRoot"); if (!root || !C) return;
  if (!ws.loaded) { root.innerHTML = `<div class="spin"></div>`; return; }
  const b = curBike();
  if (!b) { root.innerHTML = `<p class="empty"><b class="accent">🔒 Area strettamente personale: bici e lavori che inserisci qui li vedi solo tu.</b></p><p class="empty">Nessuna bici. Premi + Lavoro per aggiungere la prima.</p>`; return; }
  const jobs = bikeJobs(b);
  const total = jobs.reduce((s, j) => s + (Number(j.cost) || 0), 0);
  root.innerHTML = `
    <div class="ws-head">
      <button id="wsBikeBtn" class="ws-bike">Manutenzione bici ${C.esc(b.name)} ▾</button>
      <button id="wsSettings" class="icon-btn" title="Impostazioni officina">⚙</button>
      <button id="wsExport" class="icon-btn" title="Esporta">⤴</button>
    </div>
    <div class="ws-scroll"><table class="ws-table">
      <thead><tr><th>DATA</th><th>COSTO €</th><th>LUOGO</th><th>LAVORO</th><th>KM</th></tr></thead>
      <tbody>${jobs.map((j) => {
        const bg = jobColorHex(j.color);
        const ics = resolveIcons(j).map((i) => svgIcon(i, 13, iconColor(i) || (bg ? "#000" : "currentColor"))).join("");
        return `<tr data-id="${j.id}"><td class="c">${C.esc(fmtDate(j.date))}</td><td class="c">${fmtCost(j.cost)}</td><td class="c">${C.esc(j.place)}</td>
          <td class="w" ${bg ? `style="background:${bg};color:#000"` : ""}>${ics}${C.esc(j.work)}</td><td class="r">${C.esc(j.km ?? "")}</td></tr>`;
      }).join("")}</tbody>
      <tfoot><tr><td></td><td class="c b">${fmtCost(Math.round(total * 100) / 100)} €</td><td class="c b">TOTALE</td><td></td><td></td></tr></tfoot>
    </table></div>`;
  root.querySelector("#wsBikeBtn").onclick = openBikeMenu;
  root.querySelector("#wsSettings").onclick = () => openWorkshopPrefs(C.modal);
  root.querySelector("#wsExport").onclick = openExportMenu;
  root.querySelectorAll("tbody tr").forEach((tr) => tr.onclick = () => {
    const j = ws.jobs.find((x) => x.id === tr.dataset.id); if (j) openDetail(j);
  });
}

// ── Bici ────────────────────────────────────────────────────
function openBikeMenu() {
  const b = curBike();
  const w = C.modal(`
    <h3>Bici</h3>
    <div class="menu-list">
      ${ws.bikes.map((x) => `<button data-bike="${x.id}" ${x.id === b?.id ? 'style="font-weight:700"' : ""}>${C.esc(x.name)}</button>`).join("")}
      <button data-act="new" ${ws.bikes.length >= MAX_BIKES ? "disabled" : ""}>+ Nuova bici (${ws.bikes.length}/${MAX_BIKES})</button>
      ${b ? `<button data-act="rename">Rinomina bici</button><button data-act="delete">Elimina bici</button>` : ""}
    </div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-bike]").forEach((x) => x.onclick = () => { P.setBike(x.dataset.bike); w.remove(); draw(); });
  w.querySelectorAll("[data-act]").forEach((x) => x.onclick = () => {
    w.remove();
    if (x.dataset.act === "new") openBikeDialog(null);
    if (x.dataset.act === "rename") openBikeDialog(b);
    if (x.dataset.act === "delete") confirmDeleteBike(b);
  });
}
function openBikeDialog(bike) {
  const w = C.modal(`
    <h3>${bike ? "Rinomina bici" : "Nuova bici"}</h3>
    <label>Bici <input id="wbName" value="${C.esc(bike?.name || "")}"></label>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="wbGo">Salva</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#wbGo").onclick = async () => {
    const name = w.querySelector("#wbName").value.trim(); if (!name) return;
    const ref = bike ? doc(C.db, "users", ws.uid, "bikes", bike.id) : doc(collection(C.db, "users", ws.uid, "bikes"));
    await setDoc(ref, { name, createdAt: bike?.createdAt || Date.now() });
    if (!bike) P.setBike(ref.id);
    w.remove(); draw();
  };
}
function confirmDeleteBike(bike) {
  const w = C.modal(`
    <h3>Eliminare ${C.esc(bike.name)} e tutto il suo log?</h3>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn danger" id="wdGo">Elimina</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#wdGo").onclick = async () => {
    const snap = await getDocs(query(collection(C.db, "users", ws.uid, "jobs"), where("bikeId", "==", bike.id)));
    for (const d of snap.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(C.db, "users", ws.uid, "bikes", bike.id));
    P.setBike(""); w.remove(); draw();
  };
}

// ── Dettaglio lavoro (tap) + penna → modifica ──────────────
function openDetail(j) {
  const b = curBike(); const bg = jobColorHex(j.color);
  const ics = resolveIcons(j);
  const w = C.modal(`
    <div class="row between center"><h3 style="margin:0">${fmtDateLong(j.date)}</h3><button class="icon-btn" id="wdEdit" title="Modifica lavoro">✎</button></div>
    ${b ? `<div class="ws-f"><span>Bici</span>${C.esc(b.name)}</div>` : ""}
    <div class="ws-f ws-work" ${bg ? `style="background:${bg};color:#000"` : ""}><span>LAVORO</span>
      ${ics.length ? `<div class="ws-ics">${ics.map((i) => svgIcon(i, 22, iconColor(i) || (bg ? "#000" : "currentColor"))).join("")}</div>` : ""}
      ${C.esc(j.work)}</div>
    <div class="ws-f"><span>COSTO €</span>${fmtCost(j.cost) || "—"}</div>
    <div class="ws-f"><span>LUOGO</span>${C.esc(j.place) || "—"}</div>
    <div class="ws-f"><span>KM</span>${j.km ?? "—"}</div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelector("#wdEdit").onclick = () => { w.remove(); openJobDialog(j); };
}

export function openNewJob() {
  if (!C) return;
  if (!ws.bikes.length) { openBikeDialog(null); return; }
  openJobDialog(null);
}

function openJobDialog(job) {
  const b = curBike();
  const init = job || { date: today(), bikeId: b.id, color: "", work: "" };
  let icons = Array.isArray(init.icons) ? [...init.icons] : (P.auto() ? detectIcons(init.work) : []);
  const dismissed = new Set();
  let color = init.color || "";
  const w = C.modal(`
    <h3>${job ? "Modifica lavoro" : "Nuovo lavoro"}</h3>
    <label>DATA <input type="date" id="wjDate" value="${C.esc(init.date)}"></label>
    <div class="row gap"><label style="flex:1">COSTO <input id="wjCost" inputmode="decimal" value="${C.esc(fmtCost(init.cost))}"></label>
      <label style="flex:1">KM <input id="wjKm" inputmode="numeric" value="${init.km ?? ""}"></label></div>
    <label>LUOGO <input id="wjPlace" value="${C.esc(init.place || "")}"></label>
    <label>LAVORO <input id="wjWork" value="${C.esc(init.work || "")}"></label>
    <div class="small muted" style="margin-top:8px">Icone</div>
    <div class="ws-grid" id="wjIcons"></div>
    <div class="small muted" style="margin-top:8px">Evidenzia</div>
    <div class="ws-grid" id="wjColors"></div>
    <div id="wjErr" class="err"></div>
    <div class="row between gap">
      <div>${job ? `<button class="btn ghost" id="wjDel">Elimina</button>` : ""}</div>
      <div class="row gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="wjGo">Salva</button></div>
    </div>`, { large: true });
  const paintIcons = () => {
    w.querySelector("#wjIcons").innerHTML = ICONS.map((i) =>
      `<button type="button" class="ws-chip ${icons.includes(i.id) ? "sel" : ""}" data-i="${i.id}" title="${i.label}">${svgIcon(i.id, 22, iconColor(i.id) || "currentColor")}</button>`).join("");
    w.querySelectorAll("#wjIcons .ws-chip").forEach((el) => el.onclick = () => {
      const id = el.dataset.i;
      if (icons.includes(id)) { icons = icons.filter((x) => x !== id); dismissed.add(id); }
      else { icons.push(id); dismissed.delete(id); }
      paintIcons();
    });
  };
  const paintColors = () => {
    w.querySelector("#wjColors").innerHTML = JOB_COLORS.map(([id, hex]) =>
      `<button type="button" class="ws-dot ${color === id ? "sel" : ""}" data-c="${id}" style="background:${hex || "transparent"}"></button>`).join("");
    w.querySelectorAll("#wjColors .ws-dot").forEach((el) => el.onclick = () => { color = el.dataset.c; paintColors(); });
  };
  paintIcons(); paintColors();
  w.querySelector("#wjWork").oninput = (e) => {
    if (!P.auto()) return;
    detectIcons(e.target.value).forEach((id) => { if (!icons.includes(id) && !dismissed.has(id)) icons.push(id); });
    paintIcons();
  };
  w.querySelector("[data-close]").onclick = () => w.remove();
  if (job) w.querySelector("#wjDel").onclick = () => {
    const c = C.modal(`<h3>Eliminare questo lavoro?</h3><div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn danger" id="wcGo">Elimina</button></div>`);
    c.querySelector("[data-close]").onclick = () => c.remove();
    c.querySelector("#wcGo").onclick = async () => { await deleteDoc(doc(C.db, "users", ws.uid, "jobs", job.id)); c.remove(); w.remove(); };
  };
  w.querySelector("#wjGo").onclick = async () => {
    const work = w.querySelector("#wjWork").value.trim(); const date = w.querySelector("#wjDate").value;
    if (!work || !date) { w.querySelector("#wjErr").textContent = "Data e lavoro sono obbligatori."; return; }
    const cost = parseFloat(w.querySelector("#wjCost").value.replace(",", "."));
    const km = parseInt(w.querySelector("#wjKm").value, 10);
    const ref = job ? doc(C.db, "users", ws.uid, "jobs", job.id) : doc(collection(C.db, "users", ws.uid, "jobs"));
    await setDoc(ref, {
      bikeId: init.bikeId, date, cost: Number.isFinite(cost) ? cost : null, place: w.querySelector("#wjPlace").value.trim(),
      work, km: Number.isFinite(km) ? km : null, color, icons,
    });
    w.remove();
  };
}

// ── Preferenze icone officina ───────────────────────────────
export function openWorkshopPrefs(modalFn) {
  const modal = modalFn;
  const w = modal(`
    <h3>Icone officina</h3>
    <label class="row gap center"><input type="checkbox" id="wpAuto" ${P.auto() ? "checked" : ""}> Icone officina automatiche</label>
    <p class="small muted">Aggiunge le icone ai lavori in base alle parole nella descrizione (catena, corona, freni, ammortizzatore…).</p>
    <div class="small muted" style="margin-top:8px">Colori icone — tocca un'icona, poi scegli il colore</div>
    <div class="ws-grid" id="wpIcons"></div>
    <div class="ws-grid" id="wpPal"></div>
    <div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  let sel = null;
  const paint = () => {
    w.querySelector("#wpIcons").innerHTML = ICONS.map((i) =>
      `<button type="button" class="ws-chip ${sel === i.id ? "sel" : ""}" data-i="${i.id}" title="${i.label}">${svgIcon(i.id, 22, iconColor(i.id) || "currentColor")}</button>`).join("");
    w.querySelector("#wpPal").innerHTML = sel ? [""].concat(PALETTE).map((h) =>
      `<button type="button" class="ws-dot ${(iconColor(sel) || "") === (h || DEFAULT_COLORS[sel] || "") ? "sel" : ""}" data-h="${h}" style="background:${h || "transparent"}">${h ? "" : "∅"}</button>`).join("") : "";
    w.querySelectorAll("#wpIcons .ws-chip").forEach((el) => el.onclick = () => { sel = sel === el.dataset.i ? null : el.dataset.i; paint(); });
    w.querySelectorAll("#wpPal .ws-dot").forEach((el) => el.onclick = () => { P.setColor(sel, el.dataset.h); paint(); draw(); });
  };
  paint();
  w.querySelector("#wpAuto").onchange = (e) => { P.setAuto(e.target.checked); draw(); };
  w.querySelector("[data-close]").onclick = () => w.remove();
}

// ── Export ──────────────────────────────────────────────────
function openExportMenu() {
  const b = curBike(); if (!b) return;
  const w = C.modal(`<h3>Esporta</h3><div class="menu-list">
    <button data-f="csv">CSV</button><button data-f="pdf">PDF (stampa)</button><button data-f="jpeg">JPEG</button><button data-f="txt">Testo formattato</button>
  </div><div class="row end"><button class="btn ghost" data-close>Chiudi</button></div>`);
  w.querySelector("[data-close]").onclick = () => w.remove();
  w.querySelectorAll("[data-f]").forEach((el) => el.onclick = () => { w.remove(); doExport(el.dataset.f, b, bikeJobs(b)); });
}
function download(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const emojis = (j) => resolveIcons(j).map((i) => EMOJI[i]).join("");
function doExport(fmt, bike, jobs) {
  const safe = (bike.name || "bici").replace(/[^A-Za-z0-9_-]/g, "_");
  const total = jobs.reduce((s, j) => s + (Number(j.cost) || 0), 0);
  const H = ["DATA", "COSTO", "LUOGO", "LAVORO", "KM"];
  if (fmt === "csv") {
    const withIcons = jobs.some((j) => resolveIcons(j).length);
    const q = (s) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const rows = [withIcons ? [...H, "ICONE"] : H].concat(jobs.map((j) =>
      [j.date, fmtCost(j.cost), j.place || "", j.work || "", j.km ?? ""].concat(withIcons ? [emojis(j)] : [])));
    download(`officina_${safe}.csv`, new Blob(["﻿" + rows.map((r) => r.map((c) => q(String(c))).join(";")).join("\r\n") + "\r\n"], { type: "text/csv" }));
  } else if (fmt === "txt") {
    const rows = jobs.map((j) => [fmtDate(j.date), fmtCost(j.cost), j.place || "", (emojis(j) ? emojis(j) + " " : "") + (j.work || ""), String(j.km ?? "")]);
    const wd = H.map((h, c) => Math.max(h.length, ...rows.map((r) => [...r[c]].length)));
    const line = (r) => r.map((v, c) => (c === 1 || c === 4) ? v.padStart(wd[c]) : v.padEnd(wd[c])).join("  ").trimEnd();
    const sep = "-".repeat(wd.reduce((a, b2) => a + b2, 0) + 2 * (wd.length - 1));
    const txt = `Manutenzione bici ${bike.name}   (aggiornamento: ${new Date().toLocaleDateString("it-IT")})\n\n${line(H)}\n${sep}\n${rows.map(line).join("\n")}\n${sep}\nTOTALE: ${fmtCost(Math.round(total * 100) / 100)} €\n`;
    download(`officina_${safe}.txt`, new Blob([txt], { type: "text/plain" }));
  } else if (fmt === "jpeg") {
    drawCanvas(bike, jobs, total).toBlob((bl) => download(`officina_${safe}.jpg`, bl), "image/jpeg", 0.92);
  } else if (fmt === "pdf") {
    const win = window.open("", "_blank");
    if (!win) { C.toast("Consenti i popup per esportare il PDF"); return; }
    const esc = C.esc;
    win.document.write(`<!doctype html><meta charset="utf-8"><title>Manutenzione bici ${esc(bike.name)}</title>
<style>body{font:11px monospace;margin:18px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th{background:#999;color:#fff}td,th{border:.6px solid #000;padding:2px 4px}.c{text-align:center}.r{text-align:right}svg{vertical-align:-2px;margin-right:3px}@page{size:A4 landscape;margin:10mm}</style>
<h1>Manutenzione bici ${esc(bike.name)} <small style="float:right;font-size:11px;font-weight:400">aggiornamento: ${new Date().toLocaleDateString("it-IT")}</small></h1>
<table><thead><tr><th>DATA</th><th>COSTO €</th><th>LUOGO</th><th>LAVORO</th><th>KM</th></tr></thead><tbody>
${jobs.map((j) => { const bg = jobColorHex(j.color); return `<tr><td class="c">${fmtDate(j.date)}</td><td class="r">${fmtCost(j.cost)}</td><td class="c">${esc(j.place)}</td><td ${bg ? `style="background:${bg}"` : ""}>${resolveIcons(j).map((i) => svgIcon(i, 11, iconColor(i) || "#000")).join("")}${esc(j.work)}</td><td class="r">${j.km ?? ""}</td></tr>`; }).join("")}
</tbody></table><p><b>${fmtCost(Math.round(total * 100) / 100)} €</b> &nbsp; TOTALE</p>
`);
    win.document.close();
    setTimeout(() => win.print(), 300);   // prima era uno <script> inline nella finestra, che una CSP senza 'unsafe-inline' blocca
  }
}
function drawCanvas(bike, jobs, total) {
  const S = 2, W = 842 * S, M = 28 * S, fs = 9 * S, rowH = fs * 1.7, isz = fs * 1.15;
  const cols = [0.13, 0.09, 0.14, 0.54, 0.10].map((f) => f * (W - 2 * M));
  const H = M * 2 + fs * 3.2 + rowH * (jobs.length + 2);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = Math.ceil(H);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, cv.height);
  g.textBaseline = "middle"; let y = M;
  g.fillStyle = "#000"; g.font = `bold ${fs * 1.7}px monospace`; g.textAlign = "left"; g.fillText(`Manutenzione bici ${bike.name}`, M, y + fs);
  g.font = `${fs}px monospace`; g.textAlign = "right"; g.fillText(`aggiornamento: ${new Date().toLocaleDateString("it-IT")}`, W - M, y + fs);
  y += fs * 3.2;
  const cell = (x, w, text, o = {}) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(x, y, w, rowH); }
    g.strokeStyle = "#000"; g.lineWidth = 0.6 * S; g.strokeRect(x, y, w, rowH);
    g.fillStyle = o.fg || "#000"; g.font = `${o.bold ? "bold " : ""}${fs}px monospace`; g.textAlign = o.align || "left";
    const tx = o.align === "center" ? x + w / 2 : o.align === "right" ? x + w - 4 * S : x + 4 * S + (o.indent || 0);
    g.fillText(text, tx, y + rowH / 2);
  };
  const row = (vals, o = {}) => {
    let x = M;
    vals.forEach((v, c) => { cell(x, cols[c], v, { ...o, align: o.aligns ? o.aligns[c] : "left", bg: c === 3 && o.workBg ? o.workBg : o.bg, indent: c === 3 ? (o.indent || 0) : 0 }); x += cols[c]; });
  };
  row(["DATA", "COSTO €", "LUOGO", "LAVORO", "KM"], { bg: "#999", fg: "#fff", bold: true, aligns: ["center", "right", "center", "left", "right"] }); y += rowH;
  for (const j of jobs) {
    const ics = resolveIcons(j);
    row([fmtDate(j.date), fmtCost(j.cost), j.place || "", j.work || "", String(j.km ?? "")],
      { aligns: ["center", "right", "center", "left", "right"], workBg: jobColorHex(j.color) || null, indent: ics.length * (isz + 2 * S) });
    const ix0 = M + cols[0] + cols[1] + cols[2] + 4 * S;
    ics.forEach((id, k) => {
      g.save(); g.translate(ix0 + k * (isz + 2 * S), y + (rowH - isz) / 2); g.scale(isz / 24, isz / 24);
      g.fillStyle = iconColor(id) || "#000"; (ICON_PATHS[id] || []).forEach((d) => g.fill(new Path2D(d))); g.restore();
    });
    y += rowH;
  }
  g.fillStyle = "#000"; g.font = `bold ${fs}px monospace`; g.textAlign = "center";
  g.fillText(`${fmtCost(Math.round(total * 100) / 100)} €`, M + cols[0] + cols[1] / 2, y + rowH / 2);
  g.fillText("TOTALE", M + cols[0] + cols[1] + cols[2] / 2, y + rowH / 2);
  return cv;
}
