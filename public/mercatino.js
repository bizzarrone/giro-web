// Tab "Mercatino": annunci (bici/accessori) con foto, descrizione e contatto.
// Dati: calendars/{code}/listings/{id} (solo questo calendario) e listings/{id} (tutti i calendari); le foto a piena
// qualità (max 8) sono nei documenti .../listings/{id}/photos/{n}, nell'annuncio restano miniatura e conteggio.
// Stessi dati e regole dell'app Android.
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const CATS = [["bike", "Bici"], ["parts", "Accessori"], ["clothing", "Abbigliamento"], ["other", "Altro"]];
const MAX_PHOTOS = 8;
const mk = { code: null, unsubs: [], cal: [], glob: [], filter: "", C: null };

export function stopMarket() {
  mk.unsubs.forEach((u) => u()); mk.unsubs = []; mk.code = null; mk.cal = []; mk.glob = [];
}

export function marketTabHtml() {
  return `<div id="mkRoot"><div id="mkFilters" class="mk-filters"></div><div id="mkList"></div></div>`;
}

const catName = (id) => (CATS.find((c) => c[0] === id) || CATS[3])[1];
const clean = (b) => String(b || "").replace(/[^A-Za-z0-9+\/=_-]/g, "");
const cover = (l) => l.thumb || (l.photos && l.photos[0]) || "";
const all = () => {
  const m = new Map();
  [...mk.cal.map((l) => ({ ...l, scope: "calendar" })), ...mk.glob.map((l) => ({ ...l, scope: "all" }))].forEach((l) => m.set(l.id, l));
  return [...m.values()].sort((a, b) => (!!a.sold - !!b.sold) || ((b.createdAtMillis || 0) - (a.createdAtMillis || 0)));
};
const colOf = (scope, code) => scope === "all" ? collection(mk.C.db, "listings") : collection(mk.C.db, "calendars", code, "listings");
const photosCol = (l) => collection(mk.C.db, ...(l.scope === "all" ? ["listings", l.id, "photos"] : ["calendars", l.fromCode || mk.code, "listings", l.id, "photos"]));

async function loadPhotos(l) {
  if (!(l.photoCount > 0)) return l.photos || [];
  try { return (await getDocs(photosCol(l))).docs.map((d) => d.data()).sort((a, b) => (a.idx || 0) - (b.idx || 0)).map((d) => d.data); } catch { return []; }
}

function draw() {
  const { esc } = mk.C;
  const fEl = document.getElementById("mkFilters"), lEl = document.getElementById("mkList");
  if (!fEl || !lEl) return;
  fEl.innerHTML = [["", "Tutti"], ...CATS].map(([id, n]) => `<button class="chip-btn ${mk.filter === id ? "sel" : ""}" data-f="${id}">${esc(n)}</button>`).join("");
  fEl.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { mk.filter = b.dataset.f; draw(); });
  const items = all().filter((l) => !mk.filter || l.category === mk.filter);
  lEl.innerHTML = items.length ? items.map((l) => `
    <div class="mk-card" data-id="${esc(l.id)}">
      <div class="mk-thumb">${cover(l) ? `<img src="data:image/jpeg;base64,${clean(cover(l))}">` : "🚲"}${l.sold ? `<span class="mk-sold">VENDUTO</span>` : ""}</div>
      <div class="mk-info">
        <b style="font-size:1.1rem">${esc(l.title)}</b>
        ${l.price ? `<div class="mk-price">${esc(l.price)}</div>` : ""}
        ${l.ownerName ? `<div style="font-weight:700;font-size:.85rem">👤 ${esc(l.ownerName)}</div>` : ""}
        <div class="muted small">${esc(catName(l.category))} · ${l.scope === "all" ? "Tutti i calendari" : "Questo calendario"}</div>
      </div>
    </div>`).join("") : `<p class="muted" style="padding:20px">Nessun annuncio. Pubblica il primo con il tasto in basso.</p>`;
  lEl.querySelectorAll(".mk-card").forEach((c) => c.onclick = () => openDetail(items.find((l) => l.id === c.dataset.id)));
}

export function wireMarket(C) {
  mk.C = C;
  if (mk.code !== C.code) {
    stopMarket(); mk.code = C.code;
    mk.unsubs.push(onSnapshot(collection(C.db, "calendars", C.code, "listings"), (qs) => { mk.cal = qs.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); }, () => { mk.cal = []; draw(); }));
    mk.unsubs.push(onSnapshot(collection(C.db, "listings"), (qs) => { mk.glob = qs.docs.map((d) => ({ id: d.id, ...d.data() })); draw(); }, () => { mk.glob = []; draw(); }));
  }
  draw();
}

/** Contatti di un annuncio: telefono (+ WhatsApp), email, altro; per gli annunci vecchi si ricava dal testo libero. */
function contactsOf(l) {
  const legacy = !l.phone && !l.email && !l.other;
  const wa = (v) => !!waNumber(v);
  const phone = legacy ? ((l.contact || "").includes("@") || !wa(l.contact) ? "" : l.contact) : (l.phone || "");
  const email = legacy ? ((l.contact || "").split(/\s+/).find((x) => x.includes("@")) || "") : (l.email || "");
  const other = legacy ? (!phone && !email ? (l.contact || "") : "") : (l.other || "");
  return { legacy, phone, email, other, whatsapp: legacy ? !!phone : !!l.whatsapp };
}

function waNumber(raw) {
  let s = (raw || "").trim(); const plus = s.startsWith("+"); s = s.replace(/\D/g, "");
  if (s.length < 6) return null;
  return plus ? s : s.startsWith("00") ? s.slice(2) : "39" + s;
}

/** Foto a tutto schermo: frecce per scorrere, tocco per ingrandire/ridurre (scorri per spostarti). */
function openViewer(photos, start) {
  let i = start, zoom = false;
  const wrap = document.createElement("div");
  wrap.className = "map-modal-bg"; wrap.style.cssText = "background:#000;z-index:3000;overflow:auto";
  document.body.appendChild(wrap);
  const render = () => {
    wrap.innerHTML = `<img src="data:image/jpeg;base64,${clean(photos[i])}" style="${zoom ? "width:260%;max-width:none" : "width:100%;height:100%;object-fit:contain"};display:block;margin:auto">
      <button class="icon-btn map-close" id="vwX" style="position:fixed;top:12px;right:12px;z-index:3100">✕</button>
      ${photos.length > 1 ? `<button class="icon-btn" id="vwP" style="position:fixed;left:8px;top:50%;z-index:3100">‹</button><button class="icon-btn" id="vwN" style="position:fixed;right:8px;top:50%;z-index:3100">›</button>
      <span style="position:fixed;bottom:14px;left:0;right:0;text-align:center;color:#fff;z-index:3100">${i + 1} / ${photos.length}</span>` : ""}`;
    wrap.querySelector("#vwX").onclick = () => wrap.remove();
    wrap.querySelector("img").onclick = () => { zoom = !zoom; render(); };
    if (photos.length > 1) {
      wrap.querySelector("#vwP").onclick = () => { i = (i + photos.length - 1) % photos.length; zoom = false; render(); };
      wrap.querySelector("#vwN").onclick = () => { i = (i + 1) % photos.length; zoom = false; render(); };
    }
  };
  render();
}

function openDetail(l) {
  if (!l) return;
  const { modal, esc, user, canEdit } = mk.C;
  const mine = !!user && user.uid === l.ownerUid;
  const canManage = mine || (l.scope === "calendar" && canEdit());
  const ct = contactsOf(l), wa = waNumber(ct.phone), mail = ct.email;
  const w = modal(`
    <div class="row between" style="align-items:center;margin-bottom:4px"><b style="font-size:1.4rem;line-height:1.2">${esc(l.title)}</b><button class="icon-btn" data-close>✕</button></div>
    ${l.ownerName ? `<div style="font-weight:700;color:var(--accent);margin:2px 0">👤 ${esc(l.ownerName)}</div>` : ""}
    <div id="mkPics"></div>
    <div style="display:flex;gap:10px;align-items:center;margin:4px 0">${l.price ? `<span class="mk-price" style="font-size:1.1rem">${esc(l.price)}</span>` : ""}${l.sold ? `<span style="color:#e74c3c;font-weight:700">VENDUTO</span>` : ""}</div>
    ${l.description ? `<p class="small" style="white-space:pre-wrap;margin:4px 0">${esc(l.description)}</p>` : ""}
    <div style="user-select:text;margin:6px 0"><b>Contatto</b>
      ${ct.phone ? `<div>📞 ${esc(ct.phone)}</div>` : ""}${ct.email ? `<div>✉ ${esc(ct.email)}</div>` : ""}${ct.other ? `<div>${esc(ct.other)}</div>` : ""}</div>
    <div class="row gap" style="flex-wrap:wrap">
      ${wa ? `<a class="mk-btn" href="tel:+${wa}">Chiama</a>` : ""}${wa && ct.whatsapp ? `<a class="mk-btn" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      ${mail ? `<a class="mk-btn" href="mailto:${esc(mail)}">Email</a>` : ""}
    </div>
    <div class="row gap" style="margin-top:8px;flex-wrap:wrap">
      ${mine ? `<button class="mk-btn" id="mkEdit">Modifica</button><button class="mk-btn" id="mkSold">${l.sold ? "Rimetti in vendita" : "Segna come venduto"}</button>` : ""}
      ${canManage ? `<button class="mk-btn danger" id="mkDel">Elimina</button>` : ""}
      <button class="mk-btn" id="mkShare">Condividi testo</button><button class="mk-btn" id="mkLink">🔗 Condividi link</button>
    </div>
    <p class="muted" style="font-size:.7rem;margin:8px 0 0">${esc(catName(l.category))} · ${l.scope === "all" ? "Visibile in tutti i calendari" : "Visibile solo in questo calendario"}</p>`, { large: true });
  let photos = cover(l) ? [cover(l)] : [];
  const drawPics = () => {
    w.querySelector("#mkPics").innerHTML = photos.map((p, i) => `<img data-i="${i}" src="data:image/jpeg;base64,${clean(p)}" style="width:100%;max-height:260px;object-fit:contain;border-radius:8px;margin-bottom:4px;cursor:zoom-in">`).join("");
    w.querySelectorAll("#mkPics img").forEach((im) => im.onclick = () => openViewer(photos, +im.dataset.i));
  };
  drawPics();
  loadPhotos(l).then((p) => { if (p.length) { photos = p; if (document.body.contains(w)) drawPics(); } });
  const shareUrl = `${location.origin}/annuncio.html?${l.scope === "all" ? "" : "c=" + encodeURIComponent(l.fromCode || mk.code) + "&"}id=${encodeURIComponent(l.id)}`;
  w.querySelector("#mkLink").onclick = () => window.gcShareLinkOnly(l.title, shareUrl);   // solo il link alla pagina web
  w.querySelector("#mkShare").onclick = async () => {   // testo con titolo, prezzo, nome e link
    const url = shareUrl;
    const text = `🚲 ${l.title}${l.price ? " — " + l.price : ""}${l.ownerName ? "\n👤 " + l.ownerName : ""}`;
    if (navigator.share) { try { await navigator.share({ title: l.title, text: text + "\n" + url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text + "\n" + url); mk.C.toast("Testo copiato negli appunti"); } catch { mk.C.toast(url); }
  };
  w.querySelector("#mkEdit") && (w.querySelector("#mkEdit").onclick = () => { w.remove(); openEditor(l); });
  w.querySelector("#mkSold") && (w.querySelector("#mkSold").onclick = async () => {
    try { await updateDoc(doc(colOf(l.scope, l.fromCode || mk.code), l.id), { sold: !l.sold }); } catch (e) { mk.C.toast("Salvataggio non riuscito"); }
    w.remove();
  });
  w.querySelector("#mkDel") && (w.querySelector("#mkDel").onclick = async () => {
    if (!confirm("Eliminare l'annuncio?")) return;
    try {
      for (let i = 0; i < MAX_PHOTOS; i++) await deleteDoc(doc(photosCol(l), String(i))).catch(() => {});
      await deleteDoc(doc(colOf(l.scope, l.fromCode || mk.code), l.id));
    } catch (e) { mk.C.toast("Eliminazione non riuscita"); }
    w.remove();
  });
}

// ── immagini ─────────────────────────────────────────────────
const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
const scaledCanvas = (src, edge) => {
  const sc = Math.min(1, edge / Math.max(src.width, src.height));
  const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(src.width * sc)); cv.height = Math.max(1, Math.round(src.height * sc));
  cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height); return cv;
};
/** JPEG base64 a piena qualità: lato max 1600 px, qualità 0,9 che scende solo se serve per stare sotto ~600 KB. */
function encodeFull(src) {
  const cv = scaledCanvas(src, 1600); let q = 0.9, out = cv.toDataURL("image/jpeg", q);
  while (out.length > 800000 && q > 0.5) { q -= 0.05; out = cv.toDataURL("image/jpeg", q); }
  return out.split(",")[1];
}
const thumbOf = (src) => scaledCanvas(src, 256).toDataURL("image/jpeg", 0.7).split(",")[1];
async function fileToImage(file) { const u = URL.createObjectURL(file); try { return await loadImg(u); } finally { setTimeout(() => URL.revokeObjectURL(u), 5000); } }

/** Ruota e ritaglia (trascina gli angoli o il riquadro); chiama onApply(base64) con il risultato. */
function openPhotoEditor(b64, onApply) {
  const { modal } = mk.C;
  const w = modal(`<div style="display:flex;justify-content:center"><canvas id="peCv" style="touch-action:none;border-radius:6px"></canvas></div>
    <div class="row gap" style="justify-content:center;margin:6px 0"><button class="btn ghost" id="peL">↺</button><button class="btn ghost" id="peR">↻</button><button class="btn ghost" id="peReset">Ripristina</button></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="peOk">Applica</button></div>`, { large: true });
  const cv = w.querySelector("#peCv"), g = cv.getContext("2d");
  let src = null, r = { l: 0, t: 0, r: 1, b: 1 }, active = 0;
  const rotate = (deg) => {
    const c = document.createElement("canvas"), k = deg > 0; c.width = src.height; c.height = src.width;
    const x = c.getContext("2d"); x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(src, -src.width / 2, -src.height / 2);
    src = c; r = { l: 0, t: 0, r: 1, b: 1 }; paint();
  };
  const PAD = 24;  // margine attorno all'immagine: gli angoli sul bordo restano afferrabili
  let W = 0, H = 0;
  const paint = () => {
    const maxH = Math.round(window.innerHeight * 0.55), maxW = Math.min(window.innerWidth - 40, 560) - PAD * 2;
    const sc = Math.min(maxW / src.width, maxH / src.height); W = Math.round(src.width * sc); H = Math.round(src.height * sc);
    cv.width = W + PAD * 2; cv.height = H + PAD * 2; cv.style.width = cv.width + "px"; cv.style.height = cv.height + "px";
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(src, PAD, PAD, W, H);
    const x0 = PAD + r.l * W, y0 = PAD + r.t * H, x1 = PAD + r.r * W, y1 = PAD + r.b * H;
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(PAD, PAD, W, y0 - PAD); g.fillRect(PAD, y1, W, PAD + H - y1); g.fillRect(PAD, y0, x0 - PAD, y1 - y0); g.fillRect(x1, y0, PAD + W - x1, y1 - y0);
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const hs = [[x0, y0, 11], [x1, y0, 11], [x0, y1, 11], [x1, y1, 11], [x0, (y0 + y1) / 2, 8], [x1, (y0 + y1) / 2, 8], [(x0 + x1) / 2, y0, 8], [(x0 + x1) / 2, y1, 8]];
    hs.forEach(([x, y, rad]) => { g.fillStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.arc(x, y, rad + 2, 0, 7); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); });
  };
  const pos = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left - PAD, y: e.clientY - b.top - PAD }; };   // pixel del riquadro immagine
  let last = null;
  cv.onpointerdown = (e) => {
    const p = pos(e), hs = [[r.l, r.t], [r.r, r.t], [r.l, r.b], [r.r, r.b], [r.l, (r.t + r.b) / 2], [r.r, (r.t + r.b) / 2], [(r.l + r.r) / 2, r.t], [(r.l + r.r) / 2, r.b]];
    let best = -1, bd = 1e9; hs.forEach(([x, y], i) => { const d = Math.hypot(x * W - p.x, y * H - p.y) + (i >= 4 ? 8 : 0); if (d < bd) { bd = d; best = i; } });
    const inside = p.x > r.l * W && p.x < r.r * W && p.y > r.t * H && p.y < r.b * H;
    active = bd < 44 ? (best < 4 ? best + 1 : best + 2) : (inside ? 5 : 0); last = p; cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = (e) => {
    if (!active) return; const p = pos(e), dx = (p.x - last.x) / W, dy = (p.y - last.y) / H, m = 0.08; last = p;
    const cl = (v, a, b) => Math.min(b, Math.max(a, v));
    if (active === 1) { r.l = cl(r.l + dx, 0, r.r - m); r.t = cl(r.t + dy, 0, r.b - m); }
    else if (active === 2) { r.r = cl(r.r + dx, r.l + m, 1); r.t = cl(r.t + dy, 0, r.b - m); }
    else if (active === 3) { r.l = cl(r.l + dx, 0, r.r - m); r.b = cl(r.b + dy, r.t + m, 1); }
    else if (active === 4) { r.r = cl(r.r + dx, r.l + m, 1); r.b = cl(r.b + dy, r.t + m, 1); }
    else if (active === 6) r.l = cl(r.l + dx, 0, r.r - m);
    else if (active === 7) r.r = cl(r.r + dx, r.l + m, 1);
    else if (active === 8) r.t = cl(r.t + dy, 0, r.b - m);
    else if (active === 9) r.b = cl(r.b + dy, r.t + m, 1);
    else { const ww = r.r - r.l, hh = r.b - r.t; r.l = cl(r.l + dx, 0, 1 - ww); r.r = r.l + ww; r.t = cl(r.t + dy, 0, 1 - hh); r.b = r.t + hh; }
    paint();
  };
  cv.onpointerup = () => { active = 0; };
  loadImg("data:image/jpeg;base64," + clean(b64)).then((im) => { src = document.createElement("canvas"); src.width = im.width; src.height = im.height; src.getContext("2d").drawImage(im, 0, 0); paint(); });
  w.querySelector("#peL").onclick = () => rotate(-90);
  w.querySelector("#peR").onclick = () => rotate(90);
  w.querySelector("#peReset").onclick = () => { r = { l: 0, t: 0, r: 1, b: 1 }; paint(); };
  w.querySelector("#peOk").onclick = () => {
    const c = document.createElement("canvas"); c.width = Math.max(2, Math.round((r.r - r.l) * src.width)); c.height = Math.max(2, Math.round((r.b - r.t) * src.height));
    c.getContext("2d").drawImage(src, r.l * src.width, r.t * src.height, c.width, c.height, 0, 0, c.width, c.height);
    w.remove(); onApply(encodeFull(c));
  };
}

function openEditor(initial) {
  const { modal, esc, user } = mk.C;
  const l = initial || { id: "", scope: "calendar", fromCode: mk.code, title: "", description: "", price: "", category: "bike", contact: "", sold: false };
  const cc = contactsOf(l);
  let photos = [], changed = false, loading = !!(initial && (initial.photoCount > 0 || (initial.photos || []).length));
  const w = modal(`
    <b style="font-size:1.05rem">${initial ? "Modifica annuncio" : "Nuovo annuncio"}</b>
    <label style="margin-top:4px">Titolo * <input id="mkT" maxlength="120" value="${esc(l.title)}"></label>
    <label>Il tuo nome * <input id="mkN" maxlength="60" value="${esc(l.ownerName || user.displayName || "")}" style="font-weight:700"></label>
    <div class="row gap"><select id="mkC" style="padding:6px">${CATS.map(([id, n]) => `<option value="${id}" ${l.category === id ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <span style="flex:1;display:flex;align-items:center;gap:4px"><input id="mkP" inputmode="decimal" maxlength="10" placeholder="Prezzo" value="${esc((l.price || "").replace(/[^0-9.,]/g, ""))}" style="flex:1;padding:6px 8px"><b>€</b></span></div>
    <label>Descrizione <textarea id="mkD" maxlength="2000" rows="3">${esc(l.description)}</textarea></label>
    <div class="row gap" style="align-items:flex-end"><label style="flex:1;margin:0">Telefono <input id="mkPh1" type="tel" maxlength="40" value="${esc(cc.phone)}"></label>
      <label class="row gap center" style="margin:0 0 8px"><input id="mkWa" type="checkbox" ${cc.whatsapp ? "checked" : ""} style="width:auto"> WhatsApp</label></div>
    <label>Email <input id="mkEm" type="email" maxlength="100" value="${esc(cc.email)}"></label>
    <label>Altro contatto (Telegram, Instagram…) <input id="mkOt" maxlength="120" value="${esc(cc.other)}"></label>
    <div id="mkPh" class="row gap" style="flex-wrap:wrap;margin:6px 0"></div>
    <input id="mkF" type="file" accept="image/*" multiple hidden>
    <label class="row between center" style="margin:4px 0"><span id="mkSL" class="small"></span><input id="mkS" type="checkbox" ${l.scope === "all" ? "checked" : ""} style="width:auto"></label>
    <div id="mkE" class="err"></div>
    <div class="row end gap"><button class="btn ghost" data-close>Annulla</button><button class="btn" id="mkSave">Salva</button></div>`, { large: true });
  const drawPh = () => {
    w.querySelector("#mkPh").innerHTML = (loading ? `<span class="muted small">Carico le foto…</span>` : "") + photos.map((p, i) => `<span style="position:relative;display:inline-block"><img src="data:image/jpeg;base64,${clean(p)}" style="width:58px;height:58px;object-fit:cover;border-radius:8px">
      <button class="icon-btn" data-rm="${i}" style="position:absolute;top:0;right:0;padding:0 5px;font-size:.7rem">✕</button><button class="icon-btn" data-pr="${i}" title="Foto principale" style="position:absolute;top:0;left:0;padding:0 5px;font-size:.75rem;color:${i === 0 ? "#FFC107" : "#fff"}">${i === 0 ? "★" : "☆"}</button><button class="icon-btn" data-ed="${i}" title="Modifica foto" style="position:absolute;bottom:0;left:0;padding:0 5px;font-size:.7rem">✎</button></span>`).join("")
      + (photos.length < MAX_PHOTOS && !loading ? `<button class="btn ghost" id="mkAdd" style="padding:4px 10px;height:58px">＋ Foto (${photos.length}/${MAX_PHOTOS})</button>` : "");
    w.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { photos.splice(+b.dataset.rm, 1); changed = true; drawPh(); });
    w.querySelectorAll("[data-pr]").forEach((b) => b.onclick = () => { const i = +b.dataset.pr; if (i > 0) { photos.unshift(photos.splice(i, 1)[0]); changed = true; drawPh(); } });
    w.querySelectorAll("[data-ed]").forEach((b) => b.onclick = () => openPhotoEditor(photos[+b.dataset.ed], (nb) => { photos[+b.dataset.ed] = nb; changed = true; drawPh(); }));
    const add = w.querySelector("#mkAdd"); if (add) add.onclick = () => w.querySelector("#mkF").click();
  };
  drawPh();
  if (loading) loadPhotos(initial).then((p) => { photos = [...p]; loading = false; drawPh(); });
  const sw = w.querySelector("#mkS"), sl = w.querySelector("#mkSL");
  sw.onchange = () => { sl.textContent = sw.checked ? "Visibile in tutti i calendari" : "Visibile solo in questo calendario"; };
  sw.onchange();
  w.querySelector("#mkF").onchange = async (ev) => {
    const files = [...ev.target.files].slice(0, MAX_PHOTOS - photos.length); ev.target.value = "";
    for (const f of files) { try { photos.push(encodeFull(await fileToImage(f))); changed = true; drawPh(); } catch { w.querySelector("#mkE").textContent = "Immagine non leggibile."; } }
  };
  w.querySelector("#mkSave").onclick = async () => {
    const title = w.querySelector("#mkT").value.trim(), err = w.querySelector("#mkE");
    const phone = w.querySelector("#mkPh1").value.trim(), email = w.querySelector("#mkEm").value.trim(), other = w.querySelector("#mkOt").value.trim();
    const contact = [phone, email, other].filter(Boolean).join(" · ");
    if (!title || !contact) { err.textContent = "Titolo e almeno un contatto sono obbligatori."; return; }
    if (loading) return;
    const scope = sw.checked ? "all" : "calendar", moved = !!initial && initial.scope !== scope;
    const id = l.id || doc(colOf(scope, mk.code)).id;
    try {
      const finalPhotos = changed || moved ? photos : null;
      let thumb = initial ? (initial.thumb || "") : "", count = initial ? (initial.photoCount || 0) : 0;
      if (finalPhotos) { thumb = finalPhotos.length ? thumbOf(await loadImg("data:image/jpeg;base64," + clean(finalPhotos[0]))) : ""; count = finalPhotos.length; }
      const data = {
        scope, fromCode: l.fromCode || mk.code, title, description: w.querySelector("#mkD").value.trim(), price: (() => { const v = w.querySelector("#mkP").value.replace(/[^0-9.,]/g, "").trim(); return v ? v + " €" : ""; })(),
        category: w.querySelector("#mkC").value, thumb, photoCount: count, contact, phone, whatsapp: !!phone && w.querySelector("#mkWa").checked, email, other, ownerUid: l.ownerUid || user.uid, ownerName: w.querySelector("#mkN").value.trim() || user.displayName || "",
        createdAtMillis: l.createdAtMillis || Date.now(), sold: !!l.sold,
      };
      const target = { ...data, id };
      await setDoc(doc(colOf(scope, mk.code), id), data);
      if (finalPhotos) {
        for (let i = 0; i < finalPhotos.length; i++) await setDoc(doc(photosCol(target), String(i)), { idx: i, data: finalPhotos[i] });
        for (let i = finalPhotos.length; i < MAX_PHOTOS; i++) await deleteDoc(doc(photosCol(target), String(i))).catch(() => {});
      }
      if (moved) {
        const old = { ...initial, id };
        for (let i = 0; i < MAX_PHOTOS; i++) await deleteDoc(doc(photosCol(old), String(i))).catch(() => {});
        await deleteDoc(doc(colOf(initial.scope, mk.code), id));
      }
      w.remove();
    } catch (e) { err.textContent = "Salvataggio non riuscito."; }
  };
}

export function openNewListing() {
  const { user, toast, blocked } = mk.C;
  if (!user) { toast("Accedi con Google per pubblicare un annuncio."); return; }
  if (blocked()) { toast("Il tuo account non può inviare proposte o modificare questo calendario."); return; }
  openEditor(null);
}
