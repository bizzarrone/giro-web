// Segue i link corti di Google Maps (maps.app.goo.gl, goo.gl, g.co) e restituisce l'URL finale, da cui il
// sito ricava le coordinate per aprire Waze/Apple Maps. Solo host Google ammessi (niente fetch arbitrari).
const ALLOWED = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/, /^(www\.)?google\.[a-z.]+$/, /^maps\.google\.[a-z.]+$/, /^consent\.google\.[a-z.]+$/];
const ok = (h) => ALLOWED.some((r) => r.test(h));
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=86400" } });

export async function onRequestGet({ request }) {
  const u = new URL(request.url).searchParams.get("u") || "";
  let cur;
  try { cur = new URL(u); } catch { return json({ error: "url" }, 400); }
  if (cur.protocol !== "https:" || !ok(cur.hostname)) return json({ error: "host" }, 400);
  let url = cur.toString();
  for (let i = 0; i < 6; i++) {
    let r;
    try { r = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13) GiroCalendar" } }); }
    catch { break; }
    const loc = r.headers.get("location");
    if (!loc) break;
    let next;
    try { next = new URL(loc, url); } catch { break; }
    url = next.toString();
    if (!ok(next.hostname)) break; // arrivati a un host non Google: ci si ferma, l'URL è comunque restituito
  }
  return json({ url });
}
