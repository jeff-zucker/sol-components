// Drives window-open-test.html in a real (headless) browser and observes
// what happens when an article in <sol-feed> is clicked.
// Run from project root:  node claude/smoke-tests/drive-window-open.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.xml': 'application/xml', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const url = `http://localhost:${port}/claude/smoke-tests/window-open-test.html`;
console.log('serving', url);

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const context = await browser.newContext();

// Wrap window.open so we see every call and its return value.
await context.addInitScript(() => {
  window.__openCalls = [];
  const orig = window.open.bind(window);
  window.open = function (...args) {
    let ret, error = null;
    try { ret = orig(...args); } catch (e) { error = String(e); }
    window.__openCalls.push({
      args,
      returned: ret === null ? 'null' : ret === undefined ? 'undefined' : 'Window',
      error,
    });
    return ret;
  };
});

const page = await context.newPage();
const log = [];
page.on('console', m => log.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', e => log.push(`[pageerror] ${e.message}`));
const popups = [];
context.on('page', p => popups.push(p.url() || '(blank)'));

await page.goto(url, { waitUntil: 'load' });

let linkCount = 0;
try {
  await page.waitForSelector('.feed-link', { timeout: 10000 });
  linkCount = await page.locator('.feed-link').count();
} catch {
  log.push('[fatal] .feed-link never appeared');
}
console.log('article links rendered:', linkCount);

if (linkCount > 0) {
  await page.locator('.feed-link').first().click();
  await page.waitForTimeout(1000);
  if (linkCount > 1) {
    await page.locator('.feed-link').nth(1).click();
    await page.waitForTimeout(1000);
  }
}

const openCalls = await page.evaluate(() => window.__openCalls);
console.log('\n=== STANDALONE: window.open calls ===');
console.log(JSON.stringify(openCalls, null, 2));
console.log('popup pages created:', popups.length ? popups : '(none)');
console.log('console / page errors:', log.length ? log.join('\n') : '(none)');

// ── probe: same component, but loaded inside an iframe (index.html shell) ──
popups.length = 0;
const framePage = await context.newPage();
await framePage.goto(`http://localhost:${port}/claude/smoke-tests/iframe-host.html`,
                      { waitUntil: 'load' });
const frame = framePage.frameLocator('iframe');
let frameLinks = 0;
try {
  await frame.locator('.feed-link').first().waitFor({ timeout: 10000 });
  frameLinks = await frame.locator('.feed-link').count();
  await frame.locator('.feed-link').first().click();
  await framePage.waitForTimeout(800);
  if (frameLinks > 1) {
    await frame.locator('.feed-link').nth(1).click();
    await framePage.waitForTimeout(800);
  }
} catch (e) {
  console.log('iframe probe error:', String(e).split('\n')[0]);
}
const frameOpenCalls = await framePage.frames()[1]?.evaluate(() => window.__openCalls);
console.log('\n=== IN IFRAME: article links:', frameLinks, '===');
console.log('window.open calls:', JSON.stringify(frameOpenCalls, null, 2));
console.log('popup pages created:', popups.length ? popups : '(none)');

await page.screenshot({ path: 'claude/smoke-tests/window-open-result.png' });
await browser.close();
server.close();
console.log('\nscreenshot: claude/smoke-tests/window-open-result.png');
