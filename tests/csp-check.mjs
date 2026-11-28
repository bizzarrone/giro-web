// Serves a copy of public/ with the CSP from public/_headers applied as ENFORCING (not report-only) and loads every
// page in headless Chrome: lists blocked resources, checks the app boots, SRI-pinned libraries load, buttons work.
// Usage: node tests/csp-check.mjs <dir-with-site-copy> [out-dir]     (needs puppeteer-core + Google Chrome)
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const [dir, out] = process.argv.slice(2);
const csp = readFileSync(join(dir, '_headers'), 'utf8').match(/Content-Security-Policy-Report-Only: (.*)/)[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = join(dir, p);
  if (!f.startsWith(dir) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': csp });
  res.end(readFileSync(f));
}).listen(8767);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const open = async (path) => {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI || 'inline'} @${e.sourceFile || ''}:${e.lineNumber || ''}`)); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await page.goto('http://localhost:8767' + path, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  return page;
};
const res = { policy_script_src: csp.match(/script-src[^;]*/)[0] };
let page = await open('/');
res.index = await page.evaluate(() => ({ blocked: window.__csp, leaflet: !!(window.L && L.version), theme: document.documentElement.dataset.theme, appRendered: !!document.querySelector('#view-search').children.length }));
res.maplibreSRI = await page.evaluate(() => new Promise((ok) => { const s = document.createElement('script');
  s.integrity = 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj'; s.crossOrigin = 'anonymous';
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js'; s.onload = () => ok('loaded: ' + (typeof window.maplibregl)); s.onerror = () => ok('REJECTED'); document.head.appendChild(s); }));
res.tamperedSRI = await page.evaluate(() => new Promise((ok) => { const s = document.createElement('script');
  s.integrity = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; s.crossOrigin = 'anonymous';
  s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js?x=1'; s.onload = () => ok('LOADED (bad)'); s.onerror = () => ok('rejected by the browser (expected)'); document.head.appendChild(s); }));
// "Torna alla ricerca" button (was an inline onclick): open a calendar code that does not exist, click it
await page.evaluate(() => { location.hash = '#/c/ZZZZ99'; });
await page.waitForSelector('[data-home]', { timeout: 20000 });
if (out) await page.screenshot({ path: `${out}/csp-1-not-found.png` });
await page.click('[data-home]'); await new Promise((r) => setTimeout(r, 800));
res.backButton = await page.evaluate(() => ({ hashAfterClick: location.hash, searchViewActive: document.querySelector('#view-search').classList.contains('active') }));
if (out) await page.screenshot({ path: `${out}/csp-2-enforced-home.png` });
for (const p of ['/card.html', '/annuncio.html', '/download.html', '/stats.html']) {
  page = await open(p);
  res[p] = await page.evaluate(() => ({ blocked: window.__csp, bodyText: document.body.innerText.trim().slice(0, 60) }));
}
console.log(JSON.stringify(res, null, 2));
await browser.close(); server.close();
