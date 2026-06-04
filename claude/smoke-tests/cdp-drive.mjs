#!/usr/bin/env node
// Dependency-free Chrome DevTools Protocol driver (Node 24 global WebSocket).
// Launches headless Chrome ON the target URL, attaches to the PAGE target,
// captures console, waits, then reports window state + rendered text.
// Usage: node cdp-drive.mjs <url> [waitMs]
import { spawn } from 'node:child_process';

const url = process.argv[2];
const waitMs = Number(process.argv[3] || 18000);
const probeExpr = process.argv[4] || null;   // optional ad-hoc expression to evaluate
if (!url) { console.error('usage: cdp-drive.mjs <url> [waitMs]'); process.exit(2); }

const PORT = 9334;
const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-prof2', url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/list`);
      if (r.ok) {
        const list = await r.json();
        const pg = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (pg) return pg;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('no page target');
}

let idc = 0;
function rpc(ws, method, params) {
  const id = ++idc;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  const pg = await pageTarget();
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      logs.push(`[${m.params.type}] ${txt}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(`[EXC] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    }
  });

  await rpc(ws, 'Runtime.enable');
  await rpc(ws, 'Page.enable');

  // Inject a capture of pod-os:loaded BEFORE page scripts run (test-only, via
  // CDP — the page itself stays script-free), then reload so it's in place.
  await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__cap = { fired: false };
    document.addEventListener('pod-os:loaded', (e) => {
      try {
        const d = e.detail || {};
        window.__cap.fired = true;
        window.__cap.detailKeys = Object.keys(d);
        window.__cap.hasOs = !!d.os;
        window.__cap.hasStore = !!(d.os && d.os.store);
        window.__cap.storeCtor = (d.os && d.os.store && d.os.store.constructor) ? d.os.store.constructor.name : 'none';
        window.__cap.storeHasMatch = !!(d.os && d.os.store && typeof d.os.store.match === 'function');
        window.__cap.storeHasStatements = !!(d.os && d.os.store && Array.isArray(d.os.store.statements));
        window.__cap.hasAuthFetch = typeof d.authenticatedFetch === 'function';
        // introspect to locate the real rdflib graph (the one with .match)
        const probe = (obj) => { const out = {}; try { for (const k of Object.keys(obj)) { const v = obj[k]; out[k] = (v && typeof v.match === 'function') ? 'GRAPH' : (v && typeof v === 'object' ? 'obj' : typeof v); } } catch(e){} return out; };
        window.__cap.osKeys = d.os ? probe(d.os) : null;
        window.__cap.storeKeys = (d.os && d.os.store) ? probe(d.os.store) : null;
        // after the loader's interop pass runs, confirm swc adopted the SAME graph
        setTimeout(() => { try {
          const internal = d.os && d.os.store && d.os.store.internalStore;
          const swcStore = window.SolidWebComponents && window.SolidWebComponents.rdf && window.SolidWebComponents.rdf.store;
          window.__cap.swcStoreIsInternal = !!(internal && swcStore === internal);
          window.__cap.swcStoreStatements = (swcStore && swcStore.statements) ? swcStore.statements.length : 0;
        } catch(e2){ window.__cap.cmpErr = String(e2); } }, 4000);
      } catch (err) { window.__cap.err = String(err); }
    }, { once: true });
    document.addEventListener('swc:interop', (e) => {
      (window.__cap.interop = window.__cap.interop || []).push(e.detail);
    });
  ` });
  await rpc(ws, 'Page.reload');
  await sleep(waitMs);

  const ev = async (expr) => (await rpc(ws, 'Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  if (probeExpr) {
    const val = await ev(probeExpr);
    console.log('=== PROBE ===');
    console.log(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    console.log('=== CONSOLE (filtered) ===');
    console.log(logs.filter(l => /interop|adopt|shared|pod-os|sol-|EXC|error|capab|loader/i.test(l)).join('\n') || '(none)');
    ws.close(); chrome.kill('SIGKILL'); process.exit(0);
  }

  const out = {};
  out.swcReady       = await ev('!!(window.SolidWebComponents && window.SolidWebComponents.ready)');
  out.interopWired   = await ev('!!window.SolidWebComponents?._interopWired');
  out.interopLibs    = await ev('(window.SolidWebComponents?.interop||[]).map(s=>s.name).join(",")');
  out.adoptFetchFn   = await ev('typeof window.SolidWebComponents?.adoptFetch');
  out.rdfAdopted     = await ev('!!window.SolidWebComponents?.rdf?._adopted');
  out.adoptedFetchSet= await ev('typeof window.SolidWebComponents?.adoptedFetch === "function"');
  out.posDefined     = await ev('!!customElements.get("pos-resource")');
  out.solQueryDef    = await ev('!!customElements.get("sol-query")');
  out.podLoadedCap   = await ev('JSON.stringify(window.__cap||null)');
  // pierce shadow DOM for rendered text
  out.posLabel       = await ev('(document.querySelector("pos-label")?.shadowRoot?.textContent || document.querySelector("pos-label")?.textContent || "").replace(/\\s+/g," ").trim().slice(0,100)');
  out.posResText     = await ev('(()=>{const r=document.querySelector("pos-resource");const t=[r?.shadowRoot?.textContent,r?.textContent].filter(Boolean).join(" ");return t.replace(/\\s+/g," ").trim().slice(0,200)})()');
  out.solQueryRows   = await ev('document.querySelector("sol-query")?.shadowRoot?.querySelectorAll("table tr").length || 0');
  out.solQueryText   = await ev('(document.querySelector("sol-query")?.shadowRoot?.textContent || "").replace(/\\s+/g," ").trim().slice(0,200)');

  console.log('=== RUNTIME STATE ===');
  console.log(JSON.stringify(out, null, 2));
  console.log('=== CONSOLE (filtered) ===');
  console.log(logs.filter(l => /interop|adopt|shared|pod-os|sol-|EXC|error|capab/i.test(l)).join('\n') || '(none)');

  ws.close(); chrome.kill('SIGKILL');
  process.exit(0);
})().catch(e => { console.error('DRIVER ERROR:', e.message); try { chrome.kill('SIGKILL'); } catch {} process.exit(1); });
