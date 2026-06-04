/**
 * sol-loader.js — generic, manifest-driven ESM loader.
 *
 * One tag loads any component library:
 *
 *   <script src="dist/sol-loader.min.js"
 *           data-stage="local"
 *           data-bundles="sol-basic sol-time sol-pod"
 *           data-extend-with="auth sparql rdf"></script>
 *
 * It (1) injects an importmap so bare specifiers resolve, then (2) `import()`s
 * the modules named in `data-bundles`, plus the modules of each
 * `data-extend-with` capability (from the manifest), IN ORDER. Everything is
 * ESM: a component
 * imports its own deps (`rdflib`, `dompurify`, …) through the same importmap,
 * so each resolves to ONE module — coherence is automatic, no UMD/window.$rdf.
 *
 *   - data-bundles  — space-separated module specifiers (e.g. `sol-time`); each
 *                     is `import()`ed. (No groups — list each one.)
 *   - data-extend-with — capabilities from the manifest (`auth`⇒sol-login,
 *                     `sparql`⇒comunica+sol-query, `rdf`⇒solid-logic→solid-ui→
 *                     form stack, `solidos`⇒mashlib+sol-solidos). Each imports
 *                     its `modules` in order.
 *   - data-stage    — `local` (default; swc's vendored importmap) or `cdn`
 *                     (esm.sh). Ignored if the page already has an importmap
 *                     (then the app owns resolution — bring your own deployment).
 *   - data-base     — override the directory the importmap paths resolve against
 *                     (defaults to this script's own directory).
 *
 * The per-stage importmaps and the manifest are baked in at build from
 * tools/external-deps.json + the manifest (see rollup.config.js). A third party
 * uses the same engine by shipping their own importmap (inline on the page) and
 * their own manifest — the loader stays library-agnostic.
 *
 * API: window.SolidWebComponents.{ ready (Promise), load(bundles,{with}),
 * manifest, loaded }; fires `swc:ready` on document + window when done.
 */
(function () {
  'use strict';

  var self = document.currentScript;
  var ds = (self && self.dataset) || {};
  var base = ds.base || (self && self.src ? self.src.replace(/[^/]*$/, '') : './');

  // Baked at build (rollup): per-stage importmaps (paths use __BASE__) + the
  // capability manifest.
  var IMPORTMAPS = __SWC_IMPORTMAPS__;
  var MANIFEST   = __SWC_MANIFEST__;

  var api = window.SolidWebComponents = window.SolidWebComponents || {};
  api.manifest = MANIFEST;
  api.loaded = api.loaded || [];
  var resolveReady;
  api.ready = new Promise(function (r) { resolveReady = r; });

  function toList(v) {
    return (Array.isArray(v) ? v.slice() : String(v || '').trim().split(/\s+/)).filter(Boolean);
  }

  // Inject the stage importmap — UNLESS the page already provides one (then the
  // app owns resolution). Must run before any module resolves; the loader is a
  // parser-blocking <head> script, so injecting here precedes deferred modules.
  function ensureImportmap() {
    if (api._mapInjected) return;
    api._mapInjected = true;
    if (document.querySelector('script[type="importmap"]')) return; // page owns it
    var stage = (ds.stage || 'local').trim();
    var map = IMPORTMAPS && IMPORTMAPS[stage];
    if (!map) { console.warn('[sol-loader] unknown stage "' + stage + '" — no importmap injected'); return; }
    var imports = {};
    for (var k in map.imports) {
      if (Object.prototype.hasOwnProperty.call(map.imports, k)) {
        imports[k] = map.imports[k].replace(/__BASE__/g, base);
      }
    }
    var el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify({ imports: imports });
    (document.head || document.documentElement).appendChild(el);
    api.importmap = imports;
    if (document.readyState !== 'loading') {
      console.warn('[sol-loader] importmap injected after parsing began; load sol-loader as a classic <script> in <head>.');
    }
  }

  // Expand data-bundles + data-extend-with into an ordered, de-duped module list.
  function modulesFor(bundles, withCaps) {
    var mods = [];
    var add = function (m) { if (m && mods.indexOf(m) === -1) mods.push(m); };
    toList(bundles).forEach(add);
    toList(withCaps).forEach(function (cap) {
      var c = MANIFEST && MANIFEST.capabilities && MANIFEST.capabilities[cap];
      if (!c) { console.warn('[sol-loader] unknown capability "' + cap + '"'); return; }
      (c.modules || []).forEach(add);
    });
    return mods;
  }

  // Import the modules sequentially so capability order is honoured
  // (solid-logic before solid-ui before sol-form). A failed import is logged and
  // skipped — it never rejects the chain.
  function load(bundles, opts) {
    ensureImportmap();
    var mods = modulesFor(bundles, opts && opts.with);
    return mods.reduce(function (p, spec) {
      return p.then(function () {
        return import(spec).then(
          function () { api.loaded.push(spec); },
          function (e) { console.error('[sol-loader] failed to import', spec, e); }
        );
      });
    }, Promise.resolve());
  }
  api.load = load;
  api.ensureImportmap = ensureImportmap;

  function announce() {
    resolveReady(api);
    var detail = { loaded: api.loaded };
    document.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
    window.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
  }

  var auto = (ds.bundles || ds.load || '').trim();
  if (auto || ds.extendWith || ds.stage) {
    load(auto, { with: ds.extendWith }).then(announce);
  } else {
    ensureImportmap();
    resolveReady(api);
  }
})();
