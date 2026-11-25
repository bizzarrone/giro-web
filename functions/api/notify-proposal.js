// POST /api/notify-proposal  {code, id}
// Invia una notifica push (FCM) agli editor del calendario quando arriva una nuova proposta.
// Non c'è nessuna Cloud Function (piano Spark): la chiamano i client subito dopo aver creato la
// proposta. Per non essere abusabile, la funzione NON si fida del client: legge da Firestore
// (con un account di servizio dedicato, secret FCM_SA) la proposta indicata e la notifica una
// sola volta (campo pushSent, con precondizione sull'updateTime → niente doppi invii).
// Richiede il secret FCM_SA = JSON dell'account di servizio con ruoli FCM admin + Datastore user.

const PROJECT = "girocalendar";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64u(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const str = (f) => (f && f.stringValue) || "";
const arr = (f) => ((f && f.arrayValue && f.arrayValue.values) || []).map((v) => v.stringValue).filter(Boolean);

export async function onRequestPost({ request, env }) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  if (!env.FCM_SA) return json({ error: "not configured" }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const { code, id } = body || {};
  if (!/^[A-Z0-9]{6}$/.test(code || "") || !/^[A-Za-z0-9]{10,40}$/.test(id || "")) return json({ error: "bad args" }, 400);

  const sa = JSON.parse(env.FCM_SA);
  const tok = await accessToken(sa);
  const H = { Authorization: "Bearer " + tok, "Content-Type": "application/json" };
  const get = async (path) => { const r = await fetch(`${FS}/${path}`, { headers: H }); return r.ok ? r.json() : null; };

  const prop = await get(`calendars/${code}/proposals/${id}`);
  if (!prop) return json({ sent: 0, reason: "no proposal" });
  const f = prop.fields || {};
  if (f.pushSent && f.pushSent.booleanValue) return json({ sent: 0, reason: "already sent" });
  // niente notifiche per proposte vecchie (evita riuso della chiamata): entro 30 minuti (tolleranza per orologi sballati)
  const at = Number((f.proposedAtMillis && (f.proposedAtMillis.integerValue || f.proposedAtMillis.doubleValue)) || 0);
  if (!at || Math.abs(Date.now() - at) > 30 * 60 * 1000) return json({ sent: 0, reason: "too old" });

  // segna come inviata PRIMA di inviare, con precondizione → un solo chiamante vince
  const mark = await fetch(`${FS}/calendars/${code}/proposals/${id}?updateMask.fieldPaths=pushSent&currentDocument.updateTime=${encodeURIComponent(prop.updateTime)}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ fields: { pushSent: { booleanValue: true } } }),
  });
  if (!mark.ok) return json({ sent: 0, reason: "race" });

  const cal = await get(`calendars/${code}`);
  if (!cal) return json({ sent: 0, reason: "no calendar" });
  const cf = cal.fields || {};
  const calName = str(cf.name) || code;
  const editors = arr(cf.editors);
  const title = str(f.titolo), who = str(f.proponente);

  const targets = [];
  for (const uid of editors) {
    const u = await get(`users/${uid}`);
    arr(u && u.fields && u.fields.fcmTokens).forEach((t) => targets.push({ uid, t }));
  }
  let sent = 0; const errs = [];
  for (const { uid, t } of targets) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {
      method: "POST", headers: H,
      body: JSON.stringify({ message: { token: t, data: { type: "proposal", code, calName, title, who }, android: { priority: "HIGH" } } }),
    });
    if (r.ok) sent++;
    else errs.push(r.status + " " + (await r.text()).slice(0, 160));
    if (!r.ok && r.status === 404) {
      // token non più valido: lo toglie dall'elenco dell'utente
      await fetch(`${FS}:commit`, {
        method: "POST", headers: H,
        body: JSON.stringify({ writes: [{ transform: { document: `projects/${PROJECT}/databases/(default)/documents/users/${uid}`, fieldTransforms: [{ fieldPath: "fcmTokens", removeAllFromArray: { values: [{ stringValue: t }] } }] } }] }),
      }).catch(() => {});
    }
  }
  return json({ sent, targets: targets.length, editors: editors.length, errs });
}

export async function onRequestOptions() {
  return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
