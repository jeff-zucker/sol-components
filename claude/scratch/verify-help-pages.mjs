// Verify the new basic-component help pages render and interact with NO rdflib
// loaded (the point: sol-tabs/sol-menu/sol-dropdown-button are zero-dep). Serves
// the repo read-only and drives each page headlessly.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/home/jeff/Dropbox/Web/solid/open_media_player/');
const puppeteer = require('puppeteer-core');

const ROOT = '/home/jeff/solid/solid-web-components';
const PORT = 8097;
const TYPES = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.map':'application/json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fsPath = normalize(join(ROOT, p));
    if (!fsPath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let s = await stat(fsPath).catch(() => null);
    if (s?.isDirectory()) { fsPath = join(fsPath, 'index.html'); s = await stat(fsPath).catch(() => null); }
    if (!s) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(fsPath)] || 'application/octet-stream' });
    res.end(await readFile(fsPath));
  } catch (e) { res.writeHead(500).end(String(e)); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failures++; };

async function withPage(path, fn) {
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://localhost:${PORT}/${path}`, { waitUntil: 'networkidle0', timeout: 20000 });
  const noRdflib = await page.evaluate(() => typeof window.$rdf === 'undefined');
  ok(noRdflib, `${path}: rdflib NOT loaded (window.$rdf undefined)`);
  await fn(page);
  ok(errs.length === 0, `${path}: no console/page errors${errs.length ? ' → ' + JSON.stringify(errs.slice(0,3)) : ''}`);
  await page.close();
}

// sol-tabs
await withPage('help/sol-tabs-help.html', async (page) => {
  const n = await page.evaluate(() => document.querySelector('sol-tabs .sol-tabs-bar')?.querySelectorAll('button').length || 0);
  ok(n === 3, `sol-tabs: 3 tab buttons (got ${n})`);
  // switch to Details, check content loaded
  await page.evaluate(() => document.querySelector('sol-tabs').switchTab('Details'));
  await new Promise(r => setTimeout(r, 400));
  const txt = await page.evaluate(() => document.querySelector('sol-tabs').body?.textContent || '');
  ok(/Details/.test(txt), `sol-tabs: tab content loaded via sol-include (saw "Details")`);
});

// sol-menu
await withPage('help/sol-menu-help.html', async (page) => {
  const n = await page.evaluate(() => document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button').length || 0);
  ok(n >= 2, `sol-menu: nav buttons rendered (got ${n})`);
  const txt = await page.evaluate(() => document.querySelector('sol-menu')?.querySelector('.sol-menu-content')?.textContent || '');
  ok(txt.trim().length > 0, `sol-menu: first entry auto-selected (panel non-empty)`);
});

// sol-dropdown-button
await withPage('help/sol-dropdown-button-help.html', async (page) => {
  await page.evaluate(() => document.querySelector('sol-dropdown-button').shadowRoot.querySelector('.sol-dd-trigger').click());
  await new Promise(r => setTimeout(r, 200));
  const items = await page.evaluate(() => document.querySelector('sol-dropdown-button').shadowRoot.querySelectorAll('.sol-dd-popup button').length);
  ok(items === 3, `sol-dropdown: popup shows 3 items (got ${items})`);
  await page.evaluate(() => Array.from(document.querySelector('sol-dropdown-button').shadowRoot.querySelectorAll('.sol-dd-popup button')).find(b => /Duplicate/.test(b.textContent)).click());
  await new Promise(r => setTimeout(r, 150));
  const status = await page.evaluate(() => document.getElementById('dd-status').textContent);
  ok(status === 'duplicate', `sol-dropdown: command fired (status="${status}")`);
});

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAIL` : '\nALL PASS');
process.exit(failures ? 1 : 0);
