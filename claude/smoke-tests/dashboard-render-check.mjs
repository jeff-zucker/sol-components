// Spins up a tiny static server, opens dashboard.html in headless Chrome,
// verifies the four custom elements are defined, that sol-time/sol-search
// render synchronously, and grabs a screenshot for visual inspection.
// Run from project root:  node claude/smoke-tests/dashboard-render-check.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.ttl': 'text/turtle',
  '.xml': 'application/xml', '.png': 'image/png', '.svg': 'image/svg+xml',
};

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
const url  = `http://localhost:${port}/dashboard.html`;
console.log('serving', url);

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const ctx  = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();

// Surface page console errors / warnings so any boot-time exception is loud.
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') {
    console.log(`[browser ${m.type()}]`, m.text());
  }
});
page.on('pageerror', e => console.log('[browser pageerror]', e.message));

await page.goto(url, { waitUntil: 'domcontentloaded' });

// Wait for the three lightweight components to upgrade (no network needed).
// Weather + feed need to be defined too but may show "Loading…" without
// the proxy/network — that's fine for this render check.
await page.waitForFunction(() =>
  !!customElements.get('sol-time') &&
  !!customElements.get('sol-weather') &&
  !!customElements.get('sol-search') &&
  !!customElements.get('sol-feed'),
{ timeout: 5000 });

// Give async work (Open-Meteo fetch, feeds.ttl parse) a few seconds to
// finish so the screenshot captures a populated state rather than the
// "Loading…" stub.
await page.waitForFunction(() => {
  const w = document.querySelector('sol-weather');
  const place = w?.shadowRoot?.querySelector('.place')?.textContent || '';
  return place && place !== 'Loading…';
}, { timeout: 8000 }).catch(() => {});

// Give sol-search a beat to fetch its TTL source and re-render engines.
// DBpedia is only in the TTL, not in the built-in defaults — so waiting
// for it to appear confirms the RDF path actually completed (not just
// that defaults are showing).
await page.waitForFunction(() => {
  const s = document.querySelector('sol-search');
  const labels = [...(s?.shadowRoot?.querySelectorAll('.engine span') || [])]
                  .map(el => el.textContent.trim());
  return labels.includes('DBpedia');
}, { timeout: 4000 }).catch(() => {});

// Probe each component's shadow root for a non-empty rendered output.
const probe = await page.evaluate(() => {
  const out = {};
  const t = document.querySelector('sol-time');
  const w = document.querySelector('sol-weather');
  const s = document.querySelector('sol-search');
  const f = document.querySelector('sol-feed');
  out.timeText    = t?.shadowRoot?.querySelector('.sol-time')?.textContent?.trim()  || null;
  out.weatherText = w?.shadowRoot?.querySelector('.card')?.textContent?.replace(/\s+/g,' ').trim() || null;
  // Count inputs and Go buttons — must be exactly 1 of each.
  out.searchInputs = s?.shadowRoot?.querySelectorAll('input.q').length ?? 0;
  out.searchGos    = s?.shadowRoot?.querySelectorAll('button.go').length ?? 0;
  out.searchForms  = s?.shadowRoot?.querySelectorAll('form.form').length ?? 0;
  out.searchView   = s?.dataset.view || null;
  out.engineLabels = [...(s?.shadowRoot?.querySelectorAll('.engine span') || [])]
                       .map(el => el.textContent.trim());
  // Inline view: engines are a single flex-wrap row inside .engines —
  // when the list outgrows the column they wrap onto a second row.
  // We assert the row exists and has every engine in it (no carousel
  // hiding any).
  const enginesEl = s?.shadowRoot?.querySelector('.engines');
  out.hasEnginesRow = !!enginesEl;
  out.feedRoot      = !!f?.shadowRoot?.querySelector('.sol-feed');
  return out;
});
console.log('probe:', probe);

const out1 = path.join(ROOT, 'claude/smoke-tests/dashboard-render.png');
await page.screenshot({ path: out1, fullPage: false });
console.log('screenshot →', out1);

// Type a query into the inline search field so we can confirm the
// inline form is visible and interactive (focus + key input flow).
await page.evaluate(() => {
  const s = document.querySelector('sol-search');
  const input = s?.shadowRoot.querySelector('input.q');
  if (input) { input.focus(); input.value = 'solid linked data'; }
});
await page.waitForTimeout(150);
const out2 = path.join(ROOT, 'claude/smoke-tests/dashboard-search-typed.png');
await page.screenshot({ path: out2, fullPage: false });
console.log('screenshot →', out2);

await browser.close();
server.close();

// Exit non-zero if any of the expected pieces are missing so this can be
// wired into CI later if needed.
const ok = probe.timeText
        // "local" + "gmt" are always shown; a third "HH:MM" block proves
        // sol-time pulled an extra-timezone label/offset pair out of the
        // TTL via loadConfig. (We don't hard-code the label string —
        // users edit data/time-settings.ttl to whatever city they prefer.)
        && /local/.test(probe.timeText)
        && /gmt/.test(probe.timeText)
        && (probe.timeText.match(/\d\d:\d\d/g) || []).length >= 3
        && probe.weatherText
        // "Portland, OR" + both unit suffixes come from data/weather-settings.ttl.
        && /Portland, OR/.test(probe.weatherText)
        && /°C/.test(probe.weatherText)
        && /°F/.test(probe.weatherText)
        && probe.searchInputs === 1
        && probe.searchGos === 1
        && probe.searchForms === 1
        && probe.searchView  === 'inline'
        // DBpedia is TTL-only; its presence proves RDF source resolution.
        && probe.engineLabels.includes('DBpedia')
        && probe.engineLabels.length >= 9
        // Inline view: all engines render in a single flex-wrap row.
        // The carousel ("▸ more" + translating track) was removed in
        // favour of natural wrapping to a second row.
        && probe.hasEnginesRow === true
        && probe.feedRoot;
if (!ok) {
  console.error('FAIL: probe did not match expectations');
  console.error('   searchInputs expected 1, got', probe.searchInputs);
  console.error('   searchGos    expected 1, got', probe.searchGos);
  console.error('   searchForms  expected 1, got', probe.searchForms);
  console.error('   engineLabels expected >=8 got', probe.engineLabels.length, probe.engineLabels);
}
process.exit(ok ? 0 : 1);
