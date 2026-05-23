// Spin up the same test server and grab the precise error message from
// the dynamic import('../core/rdf.js') chain so we can see why the
// importmap isn't resolving 'rdflib'.
import { chromium } from 'playwright';
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.ttl': 'text/turtle',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  console.log('GET', rel, fs.existsSync(file) ? 'OK' : '404');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

page.on('console', m => console.log(`[${m.type()}]`, m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/dashboard.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const probe = await page.evaluate(async () => {
  try {
    const m = await import('/core/rdf.js');
    return { ok: true, isReady: m.rdf?.isReady?.() ?? null };
  } catch (e) {
    return { ok: false, error: String(e), stack: e.stack?.slice(0, 400) };
  }
});
console.log('direct rdf import result:', probe);

await browser.close();
server.close();
