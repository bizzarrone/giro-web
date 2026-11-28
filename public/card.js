import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const LABEL = { whatsapp:"WhatsApp", telegram:"Telegram", strava:"Strava", komoot:"Komoot", garmin:"Garmin",
  instagram:"Instagram", facebook:"Facebook", youtube:"YouTube", tiktok:"TikTok" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function linkUrl(key, raw) {
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
const safe = (u) => /^(https?:|tel:|mailto:)/i.test(u) ? u : "#";

const root = document.getElementById("root");
const q = new URLSearchParams(location.search);
const code = (q.get("c") || "").toUpperCase(), uid = q.get("u") || "";
const site = `<a class="site" href="/">Apri Giro →</a>`;

try {
  if (!code || !uid) throw new Error("bad");
  const db = getFirestore(initializeApp(firebaseConfig));
  const snap = await getDoc(doc(db, "calendars", code, "contacts", uid));
  if (!snap.exists() || snap.data().shared !== true) throw new Error("none");
  const c = snap.data();
  const name = `${c.nome || ""} ${c.cognome || ""}`.trim();
  document.title = `${name} · Giro`;
  const avatar = c.photoData
    ? `<img class="avatar" alt="" src="data:image/jpeg;base64,${esc(c.photoData)}">`
    : `<div class="avatar">${esc((c.nome || "?").slice(0, 1).toUpperCase())}</div>`;
  const links = [];
  if (c.phone) links.push(`<a href="${esc(safe("tel:" + c.phone.trim()))}">📞 ${esc(c.phone)}</a>`);
  if (c.email) links.push(`<a href="${esc(safe("mailto:" + c.email.trim()))}">✉️ ${esc(c.email)}</a>`);
  for (const [k, v] of Object.entries(c.links || {})) {
    if (String(v).trim()) links.push(`<a href="${esc(safe(linkUrl(k, v)))}" rel="noopener">${esc(LABEL[k] || k)}</a>`);
  }
  if (c.altroUrl) links.push(`<a href="${esc(safe(linkUrl("altro", c.altroUrl)))}" rel="noopener">${esc(c.altroLabel || "Altro")}</a>`);
  root.innerHTML = `<div class="card">${avatar}<h1>${esc(name)}</h1>
    <div class="nick">${c.soprannome ? "“" + esc(c.soprannome) + "”" : ""}</div>
    <div class="links">${links.join("")}</div></div>${site}`;
} catch (e) {
  root.innerHTML = `<div class="msg">Scheda non disponibile o non più condivisa.</div>${site}`;
}
