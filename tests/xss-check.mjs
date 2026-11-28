// Runs the REAL code lines (extracted from the files, before = git HEAD, after = working tree) in headless Chrome
// with a hostile value, and reports whether attacker JavaScript ran / a non-http link reached the opener.
// Usage: npm i puppeteer-core && node tests/xss-check.mjs [base-ref]   (needs Google Chrome installed)
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ref = process.argv[2] || 'HEAD';
const before = (f) => execSync(`git show ${ref}:public/${f}`, { encoding: 'utf8' });
const after = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const pick = (src, re, what) => { const m = src.match(re); if (!m) throw new Error('not found: ' + what); return m[0]; };
const ESC = pick(after('app.js'), /const esc = \(s\) =>[^\n]*\n[^\n]*\n[^\n]*/, 'esc');
const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

const cases = [
  { name: 'contacts.js openContactBig: altroLabel (calendars/{code}/contacts/{uid})',
    code: (src) => `${ESC}; const C = { esc }; ${pick(src, /const big = \(href[\s\S]*?<\/a>`;/, 'big')}
      document.body.innerHTML = big("https://example.com", ${JSON.stringify(PAYLOAD)}, "https://example.com");` , file: 'contacts.js', check: 'pwned' },
  { name: 'trailtrace.js trail snapping: OpenStreetMap way name into innerHTML',
    code: (src) => `var res = { names: [[${JSON.stringify(PAYLOAD)}]], lengthM: 120 };
      ${pick(src, /var nm = res\.names\.length[^\n]*/, 'nm')}
      document.body.innerHTML = '<span>' + nm + Math.round(res.lengthM) + ' m</span>';`, file: 'trailtrace.js', check: 'pwned' },
  { name: 'flight3d.js 3D view: trail-builder link (trailZones.builders[].url) passed to Android.openUrl',
    code: (src) => `window.Android = { openUrl: (u) => { window.__opened = u; } }; var EN = false;
      var b = { url: "javascript:window.__pwned=1", name: "x" }, box = document.body;
      ${pick(src, /( {12}var bu = [^\n]*\n)?( {12}if \((b\.url|\/\^https)[\s\S]*?box\.appendChild\(bt\);\n {12}\})/, 'builder link')}
      var btn = document.querySelector('button'); if (btn) btn.click();`, file: 'flight3d.js', check: 'opened' },
  { name: 'control: a legitimate https builder link still opens',
    code: (src) => cases[2].code(src).replace('javascript:window.__pwned=1', 'https://www.instagram.com/crew'), file: 'flight3d.js', check: 'opened', expectOpen: true },
];

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
let fail = 0;
for (const c of cases) {
  const row = { case: c.name };
  for (const [label, src] of [['before', before(c.file)], ['after', after(c.file)]]) {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.evaluate(c.code(src));
    await new Promise((r) => setTimeout(r, 300));
    const r = await page.evaluate(() => ({ pwned: !!window.__pwned, opened: window.__opened || null }));
    row[label] = c.check === 'pwned' ? (r.pwned ? 'ATTACKER JS RAN' : 'blocked') : (r.opened ? `opener got "${r.opened}"` : 'blocked (no link offered)');
    await page.close();
  }
  if (c.expectOpen ? !row.after.startsWith('opener got') : !row.after.startsWith('blocked')) fail++;
  console.log(JSON.stringify(row));
}
await browser.close();
process.exit(fail ? 1 : 0);
