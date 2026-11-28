import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const clean = (b) => String(b || "").replace(/\s/g, "");
const CATS = { bike: "Bici", parts: "Accessori", clothing: "Abbigliamento", other: "Altro" };
const wa = (raw) => { let s = String(raw || "").trim(); const plus = s.startsWith("+"); s = s.replace(/\D/g, ""); if (s.length < 6) return null; return plus ? s : s.startsWith("00") ? s.slice(2) : "39" + s; };
const root = document.getElementById("root");
const q = new URLSearchParams(location.search);
const code = (q.get("c") || "").toUpperCase(), id = q.get("id") || "";
const site = `<a class="site" href="/">Apri Giro →</a>`;

try {
  if (!id) throw new Error("bad");
  const db = getFirestore(initializeApp(firebaseConfig));
  const path = code ? ["calendars", code, "listings", id] : ["listings", id];
  const snap = await getDoc(doc(db, ...path));
  if (!snap.exists()) throw new Error("none");
  const l = snap.data();
  let photos = l.photos || [];
  if (l.photoCount > 0) {
    photos = (await getDocs(collection(db, ...path, "photos"))).docs.map((d) => d.data()).sort((a, b) => (a.idx || 0) - (b.idx || 0)).map((d) => d.data);
  }
  if (!photos.length && l.thumb) photos = [l.thumb];
  document.title = `${l.title} · Giro`;
  const legacy = !l.phone && !l.email && !l.other;
  const phone = legacy ? (/@/.test(l.contact || "") || !wa(l.contact) ? "" : l.contact) : (l.phone || "");
  const email = legacy ? ((l.contact || "").split(/\s+/).find((x) => x.includes("@")) || "") : (l.email || "");
  const other = legacy ? (!phone && !email ? (l.contact || "") : "") : (l.other || "");
  const n = wa(phone);
  const links = [];
  if (n) links.push(`<a href="tel:+${n}">📞 Chiama</a>`);
  if (n && (legacy || l.whatsapp)) links.push(`<a href="https://wa.me/${n}" rel="noopener">WhatsApp</a>`);
  if (email) links.push(`<a href="mailto:${esc(email)}">✉️ ${esc(email)}</a>`);
  root.innerHTML = `<div class="card">
    <h1>${esc(l.title)}</h1>
    ${l.ownerName ? `<div class="seller">👤 ${esc(l.ownerName)}</div>` : ""}
    ${l.price ? `<div class="price">${esc(l.price)}</div>` : ""}${l.sold ? `<div class="sold">VENDUTO</div>` : ""}
    <div class="pics">${photos.map((p) => `<img alt="" src="data:image/jpeg;base64,${clean(p)}">`).join("")}</div>
    ${l.description ? `<div class="desc">${esc(l.description)}</div>` : ""}
    <div><b>Contatto</b>${phone ? `<div>📞 ${esc(phone)}</div>` : ""}${email ? `<div>✉ ${esc(email)}</div>` : ""}${other ? `<div>${esc(other)}</div>` : ""}</div>
    <div class="links">${links.join("")}</div>
    <div class="meta">${esc(CATS[l.category] || "Altro")}</div></div>${site}`;
} catch (e) {
  root.innerHTML = `<div class="msg">Annuncio non disponibile o non più presente.</div>${site}`;
}
