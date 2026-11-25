// POST /api/hit {s: 0|1 nuova sessione, b: byte trasferiti dalla pagina, p: "app"|"annuncio"|"scheda"}
// Contatore anonimo delle visite: incrementa il documento stats_daily/{AAAA-MM-GG} (fuso Europe/Rome) con l'account di servizio.
// Nessun dato personale: solo conteggi per giorno, tipo di dispositivo e paese (da Cloudflare).
const PROJECT = "girocalendar";
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
let cached = null;   // token riusato tra le richieste dello stesso isolato
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.t;
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("token");
  cached = { t: j.access_token, exp: now + 3300 };
  return j.access_token;
}

export async function onRequestPost({ request, env }) {
  const ok = () => new Response(null, { status: 204 });
  if (!env.FCM_SA) return ok();
  const ua = request.headers.get("User-Agent") || "";
  if (/bot|spider|crawl|preview|headless/i.test(ua)) return ok();
  let body = {};
  try { body = await request.json(); } catch { return ok(); }
  const s = body.s ? 1 : 0, bytes = Math.max(0, Math.min(Number(body.b) || 0, 50e6)) | 0;
  const page = ["app", "annuncio", "scheda"].includes(body.p) ? body.p : "app";
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());   // AAAA-MM-GG
  const country = String((request.cf && request.cf.country) || "XX").replace(/[^A-Z]/g, "").slice(0, 2) || "XX";
  const dev = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";
  const inc = (field, n) => ({ fieldPath: field, increment: { integerValue: String(n) } });
  const fields = [inc("loads", 1), inc(`dev_${dev}`, 1), inc(`c_${country}`, 1), inc(`p_${page}`, 1)];
  if (s) fields.push(inc("sessions", 1));
  if (bytes) fields.push(inc("bytes", bytes), inc("bytesN", 1));
  try {
    const tok = await accessToken(JSON.parse(env.FCM_SA));
    await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
      method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [{ transform: { document: `${DB}/stats_daily/${day}`, fieldTransforms: fields } }] }),
    });
  } catch {}
  return ok();
}
