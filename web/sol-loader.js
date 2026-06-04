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
 *   - data-importmap-extra — inline JSON ({specifier:url}) a third party folds
 *                     into the single injected importmap (their own components/
 *                     deps); swc's baked entries win on conflict so shared deps
 *                     stay single. Works in every browser (one parse-time map).
 *   - data-manifest — space-separated SAME-ORIGIN manifest URLs. A manifest's
 *                     `capabilities` are merged before data-extend-with expands,
 *                     and its `imports` ({specifier:url}) are folded into the
 *                     importmap — so a consumer references an author's manifest +
 *                     names the components, and supplies no URLs/import map.
 *
 * The per-stage importmaps and the manifest are baked in at build from
 * tools/external-deps.json + the manifest (see rollup.config.js). A third party
 * uses the same engine by shipping their own importmap (inline on the page) and
 * their own manifest — the loader stays library-agnostic.
 *
 * API: window.SolidWebComponents.{ ready (Promise), load(bundles,{with}),
 * manifest, loaded, version }; fires `swc:ready` on document + window when done.
 *
 * Host-services surface (so any author's component shares resources without
 * importing swc): .services (register/get/has/whenReady), the convenience getters
 * .rdf / .auth / .fetch / .defaults, .has(name) / .capabilities, .on(name,fn) /
 * .emit(name,detail), and .EVENTS (the event-name table, published by
 * core/services.js). Capability modules register their impls via core/services.js.
 *
 * Open manifest: .registerCapability(name,{modules}) adds/extends a capability at
 * runtime; .buildImportmap(extra) returns swc's stage map merged with `extra`
 * (swc wins) for an author who inlines one combined importmap. `swc:capability`
 * fires (detail {name}) as each capability's modules finish loading.
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
  var manifestImports = {};   // {specifier:url} collected from data-manifest `imports` blocks

  var api = window.SolidWebComponents = window.SolidWebComponents || {};
  api.manifest = MANIFEST;
  api.loaded = api.loaded || [];
  api._caps = api._caps || {};        // capability names whose modules finished loading
  api.version = api.version || '1';   // host-services surface version (feature detection)
  var resolveReady;
  api.ready = new Promise(function (r) { resolveReady = r; });

  // ── host-services surface ──────────────────────────────────────────────────
  // A tiny registry that capability modules register their shared services into
  // (core/services.js is the import-side accessor). Created here, import-free, so
  // the surface exists from the first parser-blocking moment — a component can
  // `await SolidWebComponents.services.whenReady('rdf')` before anything loads.
  // The registry is duck-typed by these methods, so core/services.js can adopt it.
  function makeRegistry() {
    var map = {}, waiters = {};
    return {
      register: function (name, impl) {
        map[name] = impl;
        var ws = waiters[name];
        if (ws) { delete waiters[name]; ws.forEach(function (fn) { fn(impl); }); }
      },
      get:   function (name) { return map[name]; },
      has:   function (name) { return Object.prototype.hasOwnProperty.call(map, name); },
      names: function () { return Object.keys(map); },
      whenReady: function (name) {
        if (Object.prototype.hasOwnProperty.call(map, name)) return Promise.resolve(map[name]);
        return new Promise(function (res) { (waiters[name] = waiters[name] || []).push(res); });
      }
    };
  }
  api.services = api.services || makeRegistry();

  // Convenience getters — proxy the registry, lazy, never throw when absent.
  function define(name, getter) {
    if (!(name in api)) { try { Object.defineProperty(api, name, { get: getter, configurable: true }); } catch (e) {} }
  }
  define('rdf',      function () { return api.services.get('rdf'); });
  define('auth',     function () { return api.services.get('auth'); });
  define('defaults', function () { return api.services.get('defaults'); });
  define('fetch',    function () {
    var a = api.services.get('auth');
    if (a && typeof a.fetch === 'function') return a.fetch;
    return (typeof fetch !== 'undefined') ? fetch.bind(window) : undefined;
  });
  define('capabilities', function () { return Object.keys(api._caps); });
  api.has = api.has || function (name) { return !!api._caps[name] || api.services.has(name); };
  api.on  = api.on  || function (name, fn) {
    document.addEventListener(name, fn);
    return function () { document.removeEventListener(name, fn); };
  };
  api.emit = api.emit || function (name, detail) {
    var e = new CustomEvent(name, { bubbles: true, composed: true, detail: detail });
    document.dispatchEvent(e);
    return e;
  };

  function toList(v) {
    return (Array.isArray(v) ? v.slice() : String(v || '').trim().split(/\s+/)).filter(Boolean);
  }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // A third party's OWN importmap entries to fold in: data-importmap-extra is
  // inline JSON ({specifier:url} or {imports:{…}}). Parse-time + sync, so it
  // works in every browser (no second importmap needed).
  function extraImports() {
    var raw = (ds.importmapExtra || '').trim();
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      return (obj && obj.imports) ? obj.imports : (obj || {});
    } catch (e) {
      console.warn('[sol-loader] data-importmap-extra is not valid JSON — ignored', e);
      return {};
    }
  }

  // All author-supplied importmap entries: a data-manifest's `imports` block plus
  // any data-importmap-extra (the latter wins, so the page can override a
  // manifest). swc's baked entries still win over both (see mergedImports).
  function authorImports() {
    var out = {}, e = extraImports(), k;
    for (k in manifestImports) if (own(manifestImports, k)) out[k] = manifestImports[k];
    for (k in e) if (own(e, k)) out[k] = e[k];
    return out;
  }

  // Merge swc's baked stage map with `extra`. swc's entries are applied LAST, so
  // they win on conflict — a third party can ADD specifiers (their components)
  // but never redirect a shared dep (rdflib, solid-ui, …), keeping it single.
  function mergedImports(extra) {
    var stage = (ds.stage || 'local').trim();
    var map = IMPORTMAPS && IMPORTMAPS[stage];
    var out = {}, k;
    if (extra) for (k in extra) if (own(extra, k)) out[k] = extra[k];
    if (map) for (k in map.imports) if (own(map.imports, k)) out[k] = map.imports[k].replace(/__BASE__/g, base);
    return out;
  }
  // Portable helper: returns swc's stage map merged with `extra`, for an author
  // who'd rather inline ONE combined <script type="importmap"> on the page.
  api.buildImportmap = function (extra) { return { imports: mergedImports(extra || {}) }; };

  // Inject the stage importmap (swc's baked entries + any data-importmap-extra +
  // any data-manifest `imports`), UNLESS the page already provides one (then the
  // app owns resolution — use api.buildImportmap to construct a combined map).
  // With data-manifest this runs after the manifest fetch (so its imports are
  // included); otherwise it runs parser-blocking before deferred modules.
  function ensureImportmap() {
    if (api._mapInjected) return;
    api._mapInjected = true;
    if (document.querySelector('script[type="importmap"]')) return; // page owns it
    var stage = (ds.stage || 'local').trim();
    if (!(IMPORTMAPS && IMPORTMAPS[stage])) { console.warn('[sol-loader] unknown stage "' + stage + '" — no importmap injected'); return; }
    var imports = mergedImports(authorImports());
    var el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify({ imports: imports });
    (document.head || document.documentElement).appendChild(el);
    api.importmap = imports;
    // A data-manifest deliberately defers injection past the fetch, so that's not
    // a misconfiguration; warn only when nothing explains a late injection.
    if (document.readyState !== 'loading' && !ds.manifest) {
      console.warn('[sol-loader] importmap injected after parsing began; load sol-loader as a classic <script> in <head>.');
    }
  }

  // Merge a capability into the manifest (append modules, de-duped, order-kept).
  // Used by data-manifest + registerCapability so a third party can add a new
  // capability or contribute modules to an existing one.
  function mergeCapability(name, def) {
    if (!MANIFEST.capabilities) MANIFEST.capabilities = {};
    var existing = MANIFEST.capabilities[name];
    var mods = (existing && existing.modules) ? existing.modules.slice() : [];
    ((def && def.modules) || []).forEach(function (m) { if (mods.indexOf(m) === -1) mods.push(m); });
    MANIFEST.capabilities[name] = { modules: mods };
  }
  api.registerCapability = function (name, def) { mergeCapability(name, def); return api; };

  // Fetch + merge any data-manifest JSON before expanding data-extend-with: its
  // `capabilities` extend the manifest, and its `imports` ({specifier:url}) get
  // folded into the importmap — so a consumer references the author's manifest and
  // names the components, and needs no URLs/import map of their own. SAME-ORIGIN
  // ONLY: a manifest names modules the loader will import(), so a cross-origin one
  // is a code-execution surface and is rejected. (The import URLs *inside* it may
  // point anywhere — the manifest file itself is the same-origin part.)
  function loadManifests() {
    var urls = toList(ds.manifest);
    if (!urls.length) return Promise.resolve();
    return Promise.all(urls.map(function (u) {
      var abs;
      try { abs = new URL(u, document.baseURI); }
      catch (e) { console.warn('[sol-loader] bad data-manifest URL: ' + u); return null; }
      if (abs.origin !== location.origin) {
        console.error('[sol-loader] data-manifest must be same-origin — ignored: ' + u);
        return null;
      }
      return fetch(abs.href)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
        .then(function (m) {
          var caps = (m && m.capabilities) || {};
          for (var name in caps) if (own(caps, name)) mergeCapability(name, caps[name]);
          var imp = (m && m.imports) || {};
          // First manifest to name a specifier wins; swc's baked map still wins overall.
          for (var s in imp) if (own(imp, s) && !own(manifestImports, s)) manifestImports[s] = imp[s];
        })
        .catch(function (e) { console.error('[sol-loader] data-manifest ' + u + ': ' + e.message); });
    }));
  }

  function importModule(spec) {
    return import(spec).then(
      function () { if (api.loaded.indexOf(spec) === -1) api.loaded.push(spec); },
      function (e) { console.error('[sol-loader] failed to import', spec, e); }
    );
  }
  function importSeq(mods) {
    return mods.reduce(function (p, spec) {
      return p.then(function () { return importModule(spec); });
    }, Promise.resolve());
  }
  function markCapability(name) {
    if (api._caps[name]) return;
    api._caps[name] = true;
    api.emit('swc:capability', { name: name });
  }

  // Import data-bundles first, then each data-extend-with capability's modules IN
  // ORDER (solid-logic before solid-ui …); fire swc:capability when each finishes
  // so late plug-ins can react. A failed import is logged and skipped — it never
  // rejects the chain.
  function load(bundles, opts) {
    ensureImportmap();
    var caps = toList(opts && opts.with);
    return importSeq(toList(bundles)).then(function () {
      return caps.reduce(function (p, cap) {
        return p.then(function () {
          var c = MANIFEST && MANIFEST.capabilities && MANIFEST.capabilities[cap];
          if (!c) { console.warn('[sol-loader] unknown capability "' + cap + '"'); return; }
          return importSeq(c.modules || []).then(function () { markCapability(cap); });
        });
      }, Promise.resolve());
    });
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
  if (ds.manifest) {
    // Defer the importmap until the manifest is fetched, so its `imports` are in
    // the single injected map (the loader's own import()s run after, in load()).
    loadManifests().then(function () { ensureImportmap(); return load(auto, { with: ds.extendWith }); }).then(announce);
  } else if (auto || ds.extendWith || ds.stage) {
    ensureImportmap();   // common path: inject up front, parser-blocking
    load(auto, { with: ds.extendWith }).then(announce);
  } else {
    ensureImportmap();
    resolveReady(api);
  }
})();
