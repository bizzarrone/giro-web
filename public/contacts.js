// Tab "Contatti": scheda contatti per collaboratore, calendars/{code}/contacts/{uid}.
// Stessi dati e regole dell'app Android: leggono solo gli editor del calendario, ognuno
// scrive/modifica/elimina SOLO la propria scheda (id documento = uid).
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const LINKS = [
  ["whatsapp", "WhatsApp", "numero con prefisso, es. 393331234567"],
  ["telegram", "Telegram", "@utente"],
  ["strava", "Strava", "ID atleta o link"],
  ["komoot", "Komoot", "ID utente o link"],
  ["garmin", "Garmin", "nome profilo o link"],
  ["instagram", "Instagram", "@utente"],
  ["facebook", "Facebook", "nome profilo o link"],
  ["youtube", "YouTube", "@canale o link"],
  ["tiktok", "TikTok", "@utente"],
];
const LABEL = Object.fromEntries(LINKS.map((l) => [l[0], l[1]]));
const ICON = { whatsapp: "💬", telegram: "✈️", strava: "🏃", komoot: "🧭", garmin: "⌚", instagram: "📷", facebook: "👍", youtube: "▶️", tiktok: "🎵" };

const ct = { code: null, uid: null, unsub: null, unsubG: null, cards: [], loaded: false, group: null };
let C = null;

export function stopContacts() {
  if (ct.unsub) ct.unsub();
  if (ct.unsubG) ct.unsubG();
  ct.unsubG = null; ct.group = null;
  ct.unsub = null; ct.code = null; ct.uid = null; ct.cards = []; ct.loaded = false;
}

/** Trasforma nome utente / ID / numero nel link da aprire; un link completo resta com'è. */
function linkUrl(key, raw) { return safeHttp(linkUrlRaw(key, raw)); }
const safeHttp = (u) => { const s = String(u ?? "").trim(); return /^https?:\/\//i.test(s) ? s : ""; };
function linkUrlRaw(key, raw) {
  const v = String(raw || "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  switch (key) {
    case "whatsapp": return "https://wa.me/" + v.replace(/\D/g, "");
    case "telegram": return "https://t.me/" + h;
    case "strava": return "https://www.strava.com/athletes/" + h;
    case "komoot": return "https://www.komoot.com/user/" + h;
    case "garmin": return "https://connect.garmin.com/modern/profile/" + h;
    case "instagram": return "https://www.instagram.com/" + h;
    case "facebook": return "https://www.facebook.com/" + h;
    case "youtube": return "https://www.youtube.com/@" + h;
    case "tiktok": return "https://www.tiktok.com/@" + h;
    default: return v.includes(".") ? "https://" + v : v;
  }
}

const isValid = (c) => !!c.nome?.trim() && !!(
  c.email?.trim() || c.phone?.trim() || c.altroUrl?.trim() ||
  Object.values(c.links || {}).some((v) => String(v).trim()));

export function contactsTabHtml() { return `<div id="ctRoot"><div class="spin"></div></div>`; }

/** ctx: { db, user, code, modal, toast, esc, sources: () => Promise<[{code,name}]> } */
export function wireContacts(ctx) {
  C = ctx;
  if (!ctx.user) return;
  if (ct.code !== ctx.code || ct.uid !== ctx.user.uid) {
    stopContacts(); ct.code = ctx.code; ct.uid = ctx.user.uid;
    ct.unsub = onSnapshot(collection(ctx.db, "calendars", ctx.code, "contacts"), (s) => {
      ct.cards = s.docs.map((d) => ({ uid: d.id, ...d.data() })); ct.loaded = true; draw();
    }, () => { ct.loaded = true; draw(); });
    // scheda «GRUPPO»: calendars/{code}/meta/group (lettura pubblica, scrivono gli editor)
    ct.unsubG = onSnapshot(doc(ctx.db, "calendars", ctx.code, "meta", "group"), (d) => {
      ct.group = d.exists() ? d.data() : null; draw();
    }, () => { ct.group = null; draw(); });
  }
  draw();
}

export const myContact = () => ct.cards.find((c) => c.uid === ct.uid) || null;

function avatar(c, size, zoomable) {
  const inner = c.photoData
    ? `<img src="data:image/jpeg;base64,${C.esc(c.photoData)}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : `<span>${C.esc((c.nome || "?").trim().charAt(0).toUpperCase() || "?")}</span>`;
  return `<span class="ct-av${zoomable && c.photoData ? " zoom" : ""}" data-uid="${C.esc(c.uid || "")}" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.2)}px">${inner}</span>`;
}

function cardHtml(c, mine) {
  const chips = [];
  if (c.phone) chips.push(`<a class="btn ghost ct-chip" href="tel:${C.esc(c.phone.trim())}" title="Telefono">📞</a>`);
  if (c.email) chips.push(`<a class="btn ghost ct-chip" href="mailto:${C.esc(c.email.trim())}" title="Email">✉️</a>`);
  for (const [k] of LINKS) {
    const v = c.links?.[k];
    if (v) chips.push(`<a class="btn ghost ct-chip" target="_blank" rel="noopener" href="${C.esc(linkUrl(k, v))}" title="${C.esc(LABEL[k])}">${ICON[k] || "🔗"}</a>`);
  }
  if (c.altroUrl) chips.push(`<a class="btn ghost ct-chip" target="_blank" rel="noopener" href="${C.esc(linkUrl("altro", c.altroUrl))}" title="${C.esc(c.altroLabel || "Altro")}">🔗</a>`);
  return `<div class="card pad ct-card" data-open-uid="${C.esc(c.uid || "")}" style="cursor:pointer">
    <div class="row gap" style="align-items:center">
      ${avatar(c, 52, false)}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">${C.esc(`${c.nome || ""} ${c.cognome || ""}`.trim())}</div>
        ${c.soprannome ? `<div class="muted small">“${C.esc(c.soprannome)}”</div>` : ""}
      </div>
      ${mine ? `<button class="btn ghost ct-chip" id="ctShare" title="Condividi la mia scheda">🔗</button><button class="btn ghost ct-chip" id="ctEdit">Tu · Modifica</button>` : ""}
    </div>
    <div class="ct-chips">${chips.join("")}</div>
  </div>`;
}

const groupEmpty = (g) => !g || !(g.title?.trim() || g.desc?.trim() || g.altroUrl?.trim() || Object.values(g.links || {}).some((v) => String(v).trim()));

function groupHtml() {
  const g = ct.group;
  if (groupEmpty(g)) {
    return C.canEdit ? `<button type="button" class="btn ghost block" id="ctGroupEdit" style="margin-bottom:8px">＋ GRUPPO: aggiungi i link del gruppo</button>` : "";
  }
  const chips = [];
  for (const [k] of LINKS) {
    const v = g.links?.[k];
    if (v) chips.push(`<a class="btn ghost ct-chip" target="_blank" rel="noopener" href="${C.esc(linkUrl(k, v))}" title="${C.esc(LABEL[k])}">${ICON[k] || "🔗"}</a>`);
  }
  if (g.altroUrl) chips.push(`<a class="btn ghost ct-chip" target="_blank" rel="noopener" href="${C.esc(linkUrl("altro", g.altroUrl))}" title="${C.esc(g.altroLabel || "Link")}">🔗</a>`);
  // l'immagine del gruppo è il logo del calendario (o il pallino colorato, come nell'intestazione)
  const logo = `<span class="dot" style="background:${C.esc(C.logoColor || "var(--accent)")};width:48px;height:48px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden">${
    C.logoData ? `<img src="data:image/*;base64,${C.esc(C.logoData)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ""}</span>`;
  return `<div class="card pad ct-card" style="margin-bottom:8px;background:var(--surf2)">
    <div class="row gap" style="align-items:center">
      ${logo}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--accent)">${C.esc(g.title || "GRUPPO")}</div>
        ${g.desc ? `<div class="small">${C.esc(g.desc)}</div>` : ""}
      </div>
      ${C.canEdit ? `<button class="btn ghost ct-chip" id="ctGroupEdit" title="Modifica il gruppo">✏️</button>` : ""}
    </div>
    <div class="ct-chips">${chips.join("")}</div>
  </div>`;
}

/** Form «GRUPPO» (solo editor): nome, descrizione e i link del gruppo. */
function openGroupEditor() {
  if (!C || !C.canEdit) return;
  const g = ct.group || {};
  const f = (id, label, val, extra = "") => `<label>${label}<input id="${id}" value="${C.esc(val || "")}" ${extra}></label>`;
  const w = C.modal(`
    <h3>GRUPPO</h3>
    <p class="muted small" style="margin-bottom:8px">I link del gruppo legato a questo calendario: li vedono tutti, li modificano gli editor.</p>
    ${f("grTitle", "NOME DEL GRUPPO", g.title)}
    <label>DESCRIZIONE (FACOLTATIVA)<textarea id="grDesc" rows="2">${C.esc(g.desc || "")}</textarea></label>
    ${LINKS.map(([k, l, hint]) => f("grL_" + k, l.toUpperCase(), (g.links || {})[k], `placeholder="${C.esc(hint)}"`)).join("")}
    ${f("grAltroL", "ALTRO: NOME", g.altroLabel)}${f("grAltroU", "ALTRO: LINK", g.altroUrl, 'type="url"')}
    <div id="grErr" class="err"></div>
    <div class="row between gap">
      <div>${ct.group ? `<button class="btn ghost" id="grDel">Elimina</button>` : ""}</div>
      <div class="row gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="grGo">Salva</button></div>
    </div>`, { large: true });
  const val = (id) => (w.querySelector("#" + id)?.value || "").trim();
  w.querySelector("#grGo").onclick = async () => {
    const links = {};
    LINKS.forEach(([k]) => { const v = val("grL_" + k); if (v) links[k] = v; });
    const data = { title: val("grTitle"), desc: val("grDesc"), links, altroLabel: val("grAltroL"), altroUrl: val("grAltroU"), updatedAt: Date.now() };
    if (!data.title && !data.desc && !data.altroUrl && !Object.keys(links).length) { w.querySelector("#grErr").textContent = "Inserisci almeno un link o un nome."; return; }
    try { await setDoc(doc(C.db, "calendars", C.code, "meta", "group"), data); w.remove(); C.toast("Gruppo salvato"); }
    catch (e) { w.querySelector("#grErr").textContent = "Salvataggio non riuscito: " + (e.message || e); }
  };
  const del = w.querySelector("#grDel");
  if (del) del.onclick = async () => {
    if (!confirm("Eliminare la scheda GRUPPO?")) return;
    try { await deleteDoc(doc(C.db, "calendars", C.code, "meta", "group")); w.remove(); C.toast("Gruppo eliminato"); }
    catch (e) { w.querySelector("#grErr").textContent = "Eliminazione non riuscita."; }
  };
}

/** Contatto in grande: foto, nome e un pulsante ampio per ogni modo di contattarlo. */
function openContactBig(c) {
  const big = (href, label, value, extra = "") =>
    `<a class="btn block ct-big" data-copy="${C.esc(value)}" data-label="${C.esc(label)}" ${extra} href="${C.esc(href)}" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 16px;margin-top:8px;text-align:left"><b>${label}</b><span class="small" style="opacity:.85;word-break:break-all">${C.esc(value)}</span></a>`;
  const rows = [];
  if (c.phone) rows.push(big("tel:" + c.phone.trim(), "Telefono", c.phone));
  if (c.email) rows.push(big("mailto:" + c.email.trim(), "Email", c.email));
  for (const [k] of LINKS) {
    const v = c.links?.[k];
    if (v) rows.push(big(linkUrl(k, v), LABEL[k], v, 'target="_blank" rel="noopener"'));
  }
  if (c.altroUrl) rows.push(big(linkUrl("altro", c.altroUrl), c.altroLabel || "Altro", c.altroUrl, 'target="_blank" rel="noopener"'));
  const w = C.modal(`
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center">
      ${avatar(c, 160, false)}
      <div style="font-weight:800;font-size:1.4rem">${C.esc(`${c.nome || ""} ${c.cognome || ""}`.trim())}</div>
      ${c.soprannome ? `<div class="muted">“${C.esc(c.soprannome)}”</div>` : ""}
    </div>
    <div style="margin-top:8px">${rows.join("")}</div>
    <div class="row end gap" style="margin-top:14px">${c.uid === ct.uid ? `<button class="btn ghost" id="ctBigEdit">Modifica la mia scheda</button>` : ""}<button class="btn ghost" data-close>Chiudi</button></div>`);
  // tocco lungo = copia negli appunti (senza aprire il link); il tocco breve apre come prima
  const copy = async (el) => {
    const txt = (el.dataset.copy || "").trim();
    try { await navigator.clipboard.writeText(txt); } catch { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove(); }
    C.toast(`${el.dataset.label || "Contatto"} copiato`);
  };
  w.querySelectorAll(".ct-big").forEach((el) => {
    let timer = null, fired = false;
    const start = () => { fired = false; timer = setTimeout(() => { fired = true; copy(el); }, 600); };
    const cancel = () => { clearTimeout(timer); };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("mousedown", start);
    ["touchend", "touchmove", "touchcancel", "mouseup", "mouseleave"].forEach((e) => el.addEventListener(e, cancel));
    el.addEventListener("click", (ev) => { if (fired) { ev.preventDefault(); ev.stopPropagation(); fired = false; } });
    el.addEventListener("contextmenu", (ev) => { ev.preventDefault(); copy(el); });
  });
  const hint = document.createElement("p"); hint.className = "muted small"; hint.style.textAlign = "center"; hint.textContent = "Tieni premuto su un contatto per copiarlo";
  w.querySelector(".modal > div:nth-of-type(2)")?.before(hint);
  const ed = w.querySelector("#ctBigEdit");
  if (ed) ed.onclick = () => { w.remove(); openMyContact(); };
}

function draw() {
  const root = document.getElementById("ctRoot"); if (!root || !C) return;
  if (!ct.loaded) { root.innerHTML = `<div class="spin"></div>`; return; }
  const mine = myContact();
  const others = ct.cards.filter((c) => c.uid !== ct.uid)
    .sort((a, b) => `${a.nome} ${a.cognome}`.toLowerCase().localeCompare(`${b.nome} ${b.cognome}`.toLowerCase()));
  root.innerHTML = groupHtml() + (!mine && !others.length
    ? `<p class="empty">Nessun contatto ancora.<br>Crea la tua scheda con il pulsante in basso: la vedranno solo i collaboratori di questo calendario.</p>` : "")
    + (mine ? cardHtml(mine, true) : "") + others.map((c) => cardHtml(c, false)).join("");
  const fab = document.getElementById("fab"); if (fab) fab.textContent = mine ? "Modifica la mia scheda" : "+ La mia scheda";
  root.querySelector("#ctGroupEdit")?.addEventListener("click", openGroupEditor);
  root.querySelectorAll(".ct-card[data-open-uid]").forEach((card) => card.addEventListener("click", (ev) => {
    if (ev.target.closest("#ctEdit, #ctShare")) return;   // chip e foto non sono cliccabili: il tocco apre sempre il popup
    const c = ct.cards.find((x) => x.uid === card.dataset.openUid);
    if (c) openContactBig(c);
  }));
  root.querySelector("#ctEdit")?.addEventListener("click", openMyContact);
  root.querySelector("#ctShare")?.addEventListener("click", shareMyCard);
  root.querySelectorAll(".ct-av.zoom").forEach((el) => el.onclick = () => {
    const c = ct.cards.find((x) => x.uid === el.dataset.uid);
    if (!c?.photoData) return;
    const w = C.modal(`<div style="display:flex;justify-content:center"><img src="data:image/jpeg;base64,${C.esc(c.photoData)}" alt=""
      style="width:min(300px,80vw);height:min(300px,80vw);border-radius:50%;object-fit:cover"></div>`);
    w.onclick = () => w.remove();
  });
}

export function openMyContact() {
  if (!C) return;
  const cur = myContact();
  let card = cur ? { ...cur, links: { ...(cur.links || {}) } } : { links: {} };
  const w = C.modal(`
    <h3>${cur ? "Modifica la mia scheda" : "La mia scheda"}</h3>
    <p class="muted small" style="margin-bottom:8px">Visibile solo ai collaboratori di questo calendario. Obbligatori: nome e almeno un contatto o social.</p>
    <div class="row gap" style="align-items:center;margin-bottom:6px">
      <span id="ctAvPrev"></span>
      <button type="button" class="btn ghost" id="ctPhotoBtn" style="flex:1"></button>
      <button type="button" class="btn ghost icon-only" id="ctPhotoDel" title="Rimuovi foto">🗑</button>
      <input type="file" id="ctFile" accept="image/*" hidden>
    </div>
    <button type="button" class="btn ghost block" id="ctClone" style="margin-bottom:8px">Copia da un altro mio calendario</button>
    <div id="ctForm"></div>
    <label class="row gap" style="align-items:center;margin:8px 0"><input type="checkbox" id="ctShared" style="width:auto"> Scheda condivisibile con link web</label>
    <div id="ctErr" class="err"></div>
    <div class="row between gap">
      <div>${cur ? `<button class="btn ghost" id="ctDel">Elimina</button>` : ""}</div>
      <div class="row gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="ctGo">Salva</button></div>
    </div>`, { large: true });
  const f = (id, label, val, extra = "") =>
    `<label>${label}<input id="${id}" value="${C.esc(val || "")}" ${extra}></label>`;
  const paint = () => {
    w.querySelector("#ctAvPrev").innerHTML = avatar({ nome: card.nome, photoData: card.photoData }, 56, false);
    w.querySelector("#ctPhotoBtn").textContent = card.photoData ? "Cambia foto" : "Aggiungi foto";
    w.querySelector("#ctPhotoDel").style.display = card.photoData ? "" : "none";
    w.querySelector("#ctForm").innerHTML =
      f("ctNome", "NOME *", card.nome) + f("ctCognome", "COGNOME", card.cognome) + f("ctSopr", "SOPRANNOME", card.soprannome) +
      f("ctEmail", "EMAIL", card.email, 'type="email"') + f("ctPhone", "TELEFONO", card.phone, 'type="tel"') +
      LINKS.map(([k, l, hint]) => f("ctL_" + k, l.toUpperCase(), card.links[k], `placeholder="${C.esc(hint)}"`)).join("") +
      f("ctAltroL", "ALTRO: NOME (es. Blog)", card.altroLabel) + f("ctAltroU", "ALTRO: LINK", card.altroUrl, 'type="url"');
  };
  const read = () => {
    const g = (id) => (w.querySelector("#" + id)?.value || "").trim();
    card.nome = g("ctNome"); card.cognome = g("ctCognome"); card.soprannome = g("ctSopr");
    card.email = g("ctEmail"); card.phone = g("ctPhone");
    card.altroLabel = g("ctAltroL"); card.altroUrl = g("ctAltroU");
    for (const [k] of LINKS) card.links[k] = g("ctL_" + k);
  };
  paint();
  w.querySelector("#ctShared").checked = !!card.shared;
  w.querySelector("#ctShared").onchange = (e) => { card.shared = e.target.checked; };
  w.querySelector("#ctPhotoBtn").onclick = () => w.querySelector("#ctFile").click();
  w.querySelector("#ctPhotoDel").onclick = () => { read(); card.photoData = ""; paint(); };
  w.querySelector("#ctFile").onchange = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    read();
    openCrop(file, (data) => { card.photoData = data; paint(); });
  };
  w.querySelector("#ctClone").onclick = async () => {
    read();
    let list = [];
    try { list = (await C.sources()).filter((s) => s.code !== C.code); } catch { /* ignore */ }
    if (!list.length) { C.toast("Nessun altro calendario."); return; }
    const p = C.modal(`<h3>Copia da…</h3><div class="menu-list">${list.map((s) =>
      `<button data-c="${C.esc(s.code)}">${C.esc(s.name || s.code)}</button>`).join("")}</div>`);
    p.querySelectorAll("button[data-c]").forEach((b) => b.onclick = async () => {
      p.remove();
      try {
        const snap = await getDoc(doc(C.db, "calendars", b.dataset.c, "contacts", C.user.uid));
        if (!snap.exists()) { C.toast("Nessuna scheda in quel calendario."); return; }
        const d = snap.data();
        card = { ...d, links: { ...(d.links || {}) } }; paint();
      } catch { C.toast("Non riesco a leggere quel calendario."); }
    });
  };
  w.querySelector("#ctGo").onclick = async () => {
    read();
    const err = w.querySelector("#ctErr");
    if (!isValid(card)) { err.textContent = "Servono il nome e almeno un contatto o social."; return; }
    const links = {};
    for (const [k, v] of Object.entries(card.links)) if (v) links[k] = v;
    try {
      await setDoc(doc(C.db, "calendars", C.code, "contacts", C.user.uid), {
        uid: C.user.uid, nome: card.nome, cognome: card.cognome || "", soprannome: card.soprannome || "",
        email: card.email || "", phone: card.phone || "", links,
        altroLabel: card.altroLabel || "", altroUrl: card.altroUrl || "",
        photoData: card.photoData || "", shared: !!card.shared, updatedAt: Date.now(),
      });
      w.remove();
    } catch (e) { err.textContent = "Salvataggio non riuscito: " + (e.message || e); }
  };
  const del = w.querySelector("#ctDel");
  if (del) del.onclick = async () => {
    if (!confirm("Eliminare la tua scheda da questo calendario?")) return;
    try { await deleteDoc(doc(C.db, "calendars", C.code, "contacts", C.user.uid)); w.remove(); }
    catch (e) { w.querySelector("#ctErr").textContent = "Eliminazione non riuscita: " + (e.message || e); }
  };
}

/** Crea il link pubblico della sola scheda (card.html, nessun accesso al calendario) e lo condivide / copia. */
async function shareMyCard() {
  const cur = myContact(); if (!C || !cur) return;
  if (!confirm("Verrà creato un link: chiunque lo riceva potrà vedere SOLO la tua scheda (nome, contatti, social e foto), senza accedere al calendario. Puoi disattivarlo in ogni momento da \"Modifica la mia scheda\".")) return;
  try {
    if (!cur.shared) await setDoc(doc(C.db, "calendars", C.code, "contacts", C.user.uid), { ...cur, shared: true, updatedAt: Date.now() });
  } catch (e) { C.toast("Salvataggio non riuscito: " + (e.message || e)); return; }
  const url = `${location.origin}/card.html?c=${encodeURIComponent(C.code)}&u=${encodeURIComponent(C.user.uid)}`;
  try { if (navigator.share) { await navigator.share({ title: "La mia scheda", url }); return; } } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); C.toast("Link copiato negli appunti."); }
  catch { prompt("Copia il link:", url); }
}

/** Zoom e ritaglio circolare: trascina per spostare, rotella / cursore / pizzico per ingrandire.
 * Restituisce un JPEG quadrato 192×192 in base64 puro. */
function openCrop(file, onDone) {
  const OUT = 192, S = 280;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const base = S / Math.min(img.width, img.height);
    let z = 1, ox = 0, oy = 0;
    const w = C.modal(`
      <h3>Foto profilo</h3>
      <p class="muted small">Trascina e ingrandisci: la parte dentro il cerchio sarà la tua foto.</p>
      <div style="display:flex;justify-content:center"><canvas id="cpCv" width="${S}" height="${S}" style="touch-action:none;border-radius:8px;max-width:100%"></canvas></div>
      <input type="range" id="cpZ" min="1" max="6" step="0.01" value="1" style="margin:10px 0">
      <div class="row between gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="cpGo">Usa questa foto</button></div>`);
    const cv = w.querySelector("#cpCv"), cx = cv.getContext("2d");
    const clamp = () => {
      const mx = Math.max(0, img.width * base * z - S) / 2, my = Math.max(0, img.height * base * z - S) / 2;
      ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy));
    };
    const draw = () => {
      clamp();
      cx.fillStyle = "#000"; cx.fillRect(0, 0, S, S);
      cx.save(); cx.translate(S / 2 + ox, S / 2 + oy); cx.scale(base * z, base * z);
      cx.drawImage(img, -img.width / 2, -img.height / 2); cx.restore();
      cx.save(); cx.fillStyle = "rgba(0,0,0,.6)"; cx.beginPath(); cx.rect(0, 0, S, S);
      cx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2, true); cx.fill("evenodd"); cx.restore();
      cx.strokeStyle = "#fff"; cx.lineWidth = 2; cx.beginPath(); cx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); cx.stroke();
    };
    const zr = w.querySelector("#cpZ");
    zr.oninput = () => { z = parseFloat(zr.value); draw(); };
    const pts = new Map(); let lastD = 0;
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); lastD = 0; };
    cv.onpointerup = cv.onpointercancel = (e) => { pts.delete(e.pointerId); lastD = 0; };
    cv.onpointermove = (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const prev = [...p]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      const scale = S / cv.getBoundingClientRect().width;
      if (pts.size === 1) { ox += (e.clientX - prev[0]) * scale; oy += (e.clientY - prev[1]) * scale; }
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastD) { z = Math.min(6, Math.max(1, z * d / lastD)); zr.value = z; }
        lastD = d;
      }
      draw();
    };
    cv.onwheel = (e) => { e.preventDefault(); z = Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); zr.value = z; draw(); };
    w.querySelector("#cpGo").onclick = () => {
      const out = document.createElement("canvas"); out.width = out.height = OUT;
      const o = out.getContext("2d"), k = OUT / S;
      o.fillStyle = "#fff"; o.fillRect(0, 0, OUT, OUT);
      o.translate(OUT / 2 + ox * k, OUT / 2 + oy * k); o.scale(base * z * k, base * z * k);
      o.drawImage(img, -img.width / 2, -img.height / 2);
      onDone(out.toDataURL("image/jpeg", 0.85).split(",")[1]);
      w.remove(); URL.revokeObjectURL(url);
    };
    draw();
  };
  img.onerror = () => { C.toast("Non riesco a leggere questa immagine."); URL.revokeObjectURL(url); };
  img.src = url;
}
