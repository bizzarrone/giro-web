// GET /api/stats — statistiche d'uso del sito e del database, SOLO per l'account amministratore.
// Il client invia l'ID token di Firebase Auth (Authorization: Bearer ...); qui si verifica con Identity Toolkit che
// l'email sia quella dell'amministratore (e verificata) e solo allora si leggono i dati con l'account di servizio
// (secret FCM_SA, ruolo datastore.user): così nemmeno i dati privati (utenti, token) passano da regole lato client.
const PROJECT = "girocalendar";
const API_KEY = "YOUR_FIREBASE_WEB_API_KEY";   // chiave web del tuo progetto Firebase
const ADMIN_EMAIL = "admin@example.com";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("token");
  return j.access_token;
}

export async function onRequestGet({ request, env }) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!idToken) return json({ error: "login" }, 401);
  const who = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  }).then((r) => r.json()).catch(() => ({}));
  const u = who.users && who.users[0];
  if (!u || !u.emailVerified || String(u.email).toLowerCase() !== ADMIN_EMAIL) return json({ error: "forbidden" }, 403);
  if (!env.FCM_SA) return json({ error: "not configured" }, 503);

  const tok = await accessToken(JSON.parse(env.FCM_SA));
  const H = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
  const post = (path, body) => fetch(`${FS}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) }).then((r) => r.json());
  const count = async (id, all) => {
    try {
      const r = await post(":runAggregationQuery", { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: id, allDescendants: !!all }] }, aggregations: [{ alias: "n", count: {} }] } });
      return Number(r[0].result.aggregateFields.n.integerValue);
    } catch { return null; }
  };
  const ids = [["calendars", false], ["users", false], ["emailIndex", false], ["trails", false], ["trailZones", false], ["trailLog", false], ["listings", true],
    ["events", true], ["epics", true], ["archived", true], ["proposals", true], ["announcements", true], ["contacts", true], ["blocks", true], ["comments", true], ["photos", true]];
  const counts = Object.fromEntries(await Promise.all(ids.map(async ([id, all]) => [id + (all ? "*" : ""), await count(id, all)])));

  const str = (f) => (f && f.stringValue) || "";
  const int = (f) => Number((f && (f.integerValue || f.doubleValue)) || 0);
  const list = async (coll, mask) => (await fetch(`${FS}/${coll}?pageSize=300${mask.map((m) => "&mask.fieldPaths=" + m).join("")}`, { headers: H }).then((r) => r.json())).documents || [];
  // email degli account (indice email → uid) per mostrare i collaboratori per nome
  const emailOf = {};
  (await list("emailIndex", ["uid"])).forEach((d) => { const uid = str((d.fields || {}).uid); if (uid) emailOf[uid] = decodeURIComponent(d.name.split("/").pop()); });
  const cals = (await list("calendars", ["name", "openCount", "editors", "editorLabels", "listed", "createdAtMillis", "ownerEmail", "ownerUid"])).map((d) => ({
    code: d.name.split("/").pop(), name: str(d.fields.name),
    collabs: (((d.fields.editors || {}).arrayValue || {}).values || []).map((v) => v.stringValue).filter((uid) => uid !== str(d.fields.ownerUid)).map((uid) => {
      const lab = ((d.fields.editorLabels || {}).mapValue || {}).fields || {};
      return emailOf[uid] || str(lab[uid]) || uid.slice(0, 6) + "…";
    }), opens: int(d.fields.openCount), editors: ((d.fields.editors || {}).arrayValue || {}).values ? d.fields.editors.arrayValue.values.length : 0,
    listed: !!(d.fields.listed || {}).booleanValue, created: int(d.fields.createdAtMillis), owner: str(d.fields.ownerEmail),
  }));
  const users = await list("users", ["fcmTokens"]);
  const withPush = users.filter((d) => d.fields && d.fields.fcmTokens && d.fields.fcmTokens.arrayValue && (d.fields.fcmTokens.arrayValue.values || []).length).length;
  // uscite per mese (campo data dd/MM/yyyy di tutti gli eventi)
  const evq = await post(":runQuery", { structuredQuery: { from: [{ collectionId: "events", allDescendants: true }], select: { fields: [{ fieldPath: "data" }] }, limit: 1000 } }).catch(() => []);
  const byMonth = {};
  (Array.isArray(evq) ? evq : []).forEach((x) => { const d = x.document && str(x.document.fields.data); const m = d && d.split("/"); if (m && m.length === 3) { const k = `${m[2]}-${m[1]}`; byMonth[k] = (byMonth[k] || 0) + 1; } });
  // spazio personale (users/{uid}/rides/{id}): giri registrati e GPX caricati ancora validi, e quanti utenti lo usano
  const rq = await post(":runQuery", { structuredQuery: { from: [{ collectionId: "rides", allDescendants: true }], select: { fields: [{ fieldPath: "kind" }, { fieldPath: "expiresAt" }] }, limit: 5000 } }).catch(() => []);
  const space = { users: 0, recordings: 0, uploads: 0, expired: 0 };
  const owners = new Set(), nowMs = Date.now();
  (Array.isArray(rq) ? rq : []).forEach((x) => {
    const doc = x.document; if (!doc) return;
    const f = doc.fields || {}, ts = f.expiresAt && f.expiresAt.timestampValue;
    if (ts && Date.parse(ts) < nowMs) { space.expired++; return; }   // scaduto, in attesa della pulizia: non conta
    if (str(f.kind) === "upload") space.uploads++; else space.recordings++;
    const m = doc.name.match(/\/users\/([^/]+)\/rides\//); if (m) owners.add(m[1]);
  });
  space.users = owners.size;
  // traffico: contatore giornaliero (stats_daily) scritto da /api/hit
  const trDocs = await list("stats_daily", []);
  const traffic = trDocs.map((d) => {
    const f = d.fields || {}, countries = {};
    Object.keys(f).forEach((k) => { if (k.startsWith("c_")) countries[k.slice(2)] = int(f[k]); });
    return { day: d.name.split("/").pop(), loads: int(f.loads), sessions: int(f.sessions), bytes: int(f.bytes), bytesN: int(f.bytesN), mobile: int(f.dev_mobile), desktop: int(f.dev_desktop), countries };
  }).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 60);
  return json({ generatedAt: Date.now(), admin: u.email, counts, calendars: cals.sort((a, b) => b.opens - a.opens), usersTotal: users.length, usersWithPush: withPush, eventsByMonth: byMonth, space, traffic });
}
