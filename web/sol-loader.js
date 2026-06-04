/**
 * sol-loader.js — generic, manifest-driven ESM loader.
 *
 * It knows nothing about any particular component library: everything it does is
 * driven by one or more MANIFESTS. swc is just the default library, described by
 * the manifest the loader auto-loads next to itself.
 *
 *   <script src="dist/sol-loader.min.js"
 *           data-stage="local"
 *           data-bundles="sol-basic sol-feed"
 *           data-extend-with="auth rdf"></script>
 *
 * On load it (1) reads its DEFAULT manifest — a sibling file named after itself,
 * `<loader-basename>.manifest.json` (so a library ships its manifest next to the
 * loader and the loader stays library-agnostic) — plus any `data-manifest` URLs;
 * (2) injects an importmap built from the manifests' `imports` (the stage chosen
 * by `data-stage`); (3) `import()`s the `data-bundles` modules + each
 * `data-extend-with` capability's modules (from the manifests' `capabilities`),
 * IN ORDER; then fires `swc:ready`.
 *
 * A manifest:
 *   { "name": "…",
 *     "imports": { spec: url, … },                          // stage-agnostic, and/or
 *     "stages": { "local": {"imports":{…}}, "cdn": {"imports":{…}} },
 *     "capabilities": { cap: { "modules": [...] } },
 *     "interop": {                                          // glueless cross-library wiring
 *       "provides": { cap: { service|event: "…", path: "…" } },  // what this lib offers
 *       "consumes": { cap: { call: "rdf.useStore" | "adoptFetch" } }, // and adopts
 *       "resource": { "emits":   { event: "…", path: "…" },        // shared current-focus
 *                     "accepts": { selector: "…", attr: "…", transform: "stripHash" } },
 *       "editable": { "<selector>": {                              // make any component sol-form-editable
 *         "shape": "…shacl",            // (a) accessible: SHACL for auto-gen; omit ⇒ not editable
 *         "subject": { "attr": "uri" }, //     where the subject URI lives on the element
 *         "forms": "auto" | "self",     // (b) sol-form generates vs the component edits itself
 *         "present": "inPlace" | "collected", // (c) gear on the element vs gathered by sol-settings
 *         "open": { "event"|"method": "…" } } } } }            // (forms:self) how to open its own editor
 * (For components you author yourself, the manifest editable block is optional —
 * just add `shape="…" subject="…" edit="inPlace|collected"` attributes to the tag.)
 * Relative import URLs resolve against THAT manifest's URL. The earlier manifest
 * wins a conflicting specifier — the default manifest is merged first, so its
 * shared deps (rdflib, …) stay the single ones. The loader pairs a `consumes`
 * cap with another library's `provides` cap (the adopt rule) and wires the
 * `resource` channel — so a page mixing two libraries needs no bridge script.
 *
 * data-* attributes:
 *   - data-bundles      — module specifiers to import()
 *   - data-extend-with  — capability names from the merged manifests
 *   - data-stage        — `local` (default) | `cdn` — picks stages.<stage>.imports
 *   - data-manifest     — extra SAME-ORIGIN manifest URLs (merged after the default)
 *   - data-manifest-default="off" — skip the sibling default manifest
 *   - data-importmap-extra — inline JSON of the consumer's own importmap entries
 *   - data-base         — directory to resolve data-manifest paths against
 *
 * API on window.SolidWebComponents: { ready (Promise), load(bundles,{with}),
 * manifest, loaded, version }; fires `swc:ready` on document + window. Host-
 * services surface (so any author's component shares resources without importing
 * swc): .services (register/get/has/whenReady), getters .rdf / .auth / .fetch /
 * .defaults, .has(name) / .capabilities, .on(name,fn) / .emit(name,detail), and
 * .EVENTS (published by core/services.js). Open manifest:
 * .registerCapability(name,{modules}); `swc:capability` fires per capability.
 */
(function () {
  'use strict';

  var self = document.currentScript;
  var ds = (self && self.dataset) || {};
  var loaderSrc = (self && self.src) || '';
  var base = ds.base || loaderSrc.replace(/[^/]*$/, '') || './';

  var MANIFEST = { capabilities: {} };   // grows as manifests merge in; nothing baked

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

  // ── helpers ──────────────────────────────────────────────────────────────
  function toList(v) {
    return (Array.isArray(v) ? v.slice() : String(v || '').trim().split(/\s+/)).filter(Boolean);
  }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function assign(t, s) { if (s) for (var k in s) if (own(s, k)) t[k] = s[k]; return t; }
  function resolveUrl(v, baseUrl) { try { return new URL(v, baseUrl).href; } catch (e) { return v; } }

  // ── importmap ──────────────────────────────────────────────────────────────
  var imports = {};   // accumulated importmap entries (resolved absolute), first-wins

  // The consumer's OWN importmap entries: data-importmap-extra is inline JSON
  // ({specifier:url} or {imports:{…}}). They can ADD specifiers but manifest
  // entries win on conflict (so a shared dep stays single).
  function extraImports() {
    var raw = (ds.importmapExtra || '').trim();
    if (!raw) return {};
    try { var o = JSON.parse(raw); return (o && o.imports) ? o.imports : (o || {}); }
    catch (e) { console.warn('[sol-loader] data-importmap-extra is not valid JSON — ignored', e); return {}; }
  }

  // Inject the importmap from the accumulated manifest imports + data-importmap-extra,
  // UNLESS the page already provides one. Runs after the manifest fetch, before the
  // loader's own import()s.
  function ensureImportmap() {
    if (api._mapInjected) return;
    api._mapInjected = true;
    if (document.querySelector('script[type="importmap"]')) return; // page owns it
    var out = {};
    assign(out, extraImports());   // consumer extras first…
    assign(out, imports);          // …manifest imports win on conflict (coherence)
    if (!Object.keys(out).length) return;
    var el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify({ imports: out });
    (document.head || document.documentElement).appendChild(el);
    api.importmap = out;
  }
  api.ensureImportmap = ensureImportmap;

  // ── manifests ────────────────────────────────────────────────────────────
  // Merge a capability into MANIFEST (append modules, de-duped). Shared by
  // manifests + registerCapability so third parties can add/extend capabilities.
  function mergeCapability(name, def) {
    if (!MANIFEST.capabilities) MANIFEST.capabilities = {};
    var existing = MANIFEST.capabilities[name];
    var mods = (existing && existing.modules) ? existing.modules.slice() : [];
    ((def && def.modules) || []).forEach(function (m) { if (mods.indexOf(m) === -1) mods.push(m); });
    var attrs = (existing && existing.attributes) ? existing.attributes.slice() : [];
    ((def && def.attributes) || []).forEach(function (a) { if (attrs.indexOf(a) === -1) attrs.push(a); });
    MANIFEST.capabilities[name] = { modules: mods, attributes: attrs };
  }
  api.registerCapability = function (name, def) { mergeCapability(name, def); return api; };

  // Fold a fetched manifest (from `url`) into MANIFEST.capabilities + `imports`.
  // imports = flat `imports` overlaid by the data-stage `stages.<stage>.imports`;
  // relative URLs resolve against the manifest URL; first manifest wins a specifier.
  function mergeManifest(m, url) {
    if (!m) return;
    var caps = m.capabilities || {};
    for (var name in caps) if (own(caps, name)) mergeCapability(name, caps[name]);
    // Collect interop declarations per LIBRARY (keyed by name) — the matchmaker
    // needs library identity to pair a provider with a consumer in another lib.
    if (m.interop && m.name) interopSources.push({ name: m.name, interop: m.interop });
    var stage = (ds.stage || 'local').trim();
    var imp = {};
    assign(imp, m.imports);
    if (m.stages && m.stages[stage]) assign(imp, m.stages[stage].imports);
    for (var s in imp) {
      if (own(imp, s) && !own(imports, s)) imports[s] = resolveUrl(imp[s], url);
    }
  }

  // The manifest URLs to fetch, in MERGE ORDER (first wins): the default sibling
  // (the loader's own — trusted even cross-origin) then any data-manifest
  // (SAME-ORIGIN only — it names modules the loader will import()).
  function manifestEntries() {
    var entries = [];
    if (ds.manifestDefault !== 'off' && loaderSrc) {
      entries.push({ url: loaderSrc.replace(/(\.min)?\.js(\?.*)?$/, '.manifest.json'), trusted: true });
    }
    toList(ds.manifest).forEach(function (u) { entries.push({ url: u, trusted: false }); });
    return entries;
  }

  function loadManifests() {
    var entries = manifestEntries();
    if (!entries.length) return Promise.resolve();
    return Promise.all(entries.map(function (e) {
      var abs;
      try { abs = new URL(e.url, base).href; }
      catch (x) { console.warn('[sol-loader] bad manifest URL: ' + e.url); return null; }
      if (!e.trusted && abs.indexOf(location.origin + '/') !== 0 && abs !== location.origin) {
        // robust same-origin check
        var o; try { o = new URL(abs); } catch (x) { o = null; }
        if (!o || o.origin !== location.origin) {
          console.error('[sol-loader] data-manifest must be same-origin — ignored: ' + e.url);
          return null;
        }
      }
      return fetch(abs)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
        .then(function (m) { return { m: m, url: abs }; })
        .catch(function (err) { console.error('[sol-loader] manifest ' + e.url + ': ' + err.message); return null; });
    })).then(function (results) {
      results.forEach(function (r) { if (r && r.m) mergeManifest(r.m, r.url); });   // in order → first wins
    });
  }

  // ── interop: glueless provide/consume matchmaking ──────────────────────────
  // A manifest may carry an `interop` block declaring what its library PROVIDES
  // and CONSUMES on the host surface, plus a shared `resource` (current-focus)
  // contract. The loader pairs a consumer of capability K with a provider of K
  // from ANOTHER library and wires them — so a page mixing two component
  // libraries needs no bridge script. Generic by design: no library or
  // capability name is baked in; only a small whitelist of safe surface calls
  // and value transforms is. A provider declares its delivery channel —
  // `{ service, path }` (a host-services registration) or `{ event, path }` (a
  // DOM CustomEvent) — and a consumer declares `{ call }` (a surface method).
  var interopSources = [];   // [{ name, interop }] collected from manifests
  api.interop = interopSources;

  function getByPath(obj, path) {
    if (!path) return obj;
    return String(path).split('.').reduce(function (o, k) { return (o == null) ? undefined : o[k]; }, obj);
  }
  function applyTransform(v, t) {
    if (t === 'stripHash') return String(v).split('#')[0];
    return v;
  }
  // Whitelisted consumer surface calls — NEVER eval an arbitrary manifest string.
  function invokeConsumer(call, value) {
    if (value == null) return;
    if (call === 'rdf.useStore') { if (api.rdf && typeof api.rdf.useStore === 'function') api.rdf.useStore(value); return; }
    if (call === 'adoptFetch')   { if (typeof api.adoptFetch === 'function') api.adoptFetch(value); return; }
    console.warn('[sol-loader] interop: refusing unknown consumer call "' + call + '"');
  }
  // Deliver a provider's value (via its declared channel) to onValue, now and
  // on every future emission (events) or once (service registration).
  function onProvide(p, onValue) {
    if (p.event) {
      api.on(p.event, function (e) { var v = getByPath(e, p.path); if (v != null) onValue(v); });
    } else if (p.service) {
      api.services.whenReady(p.service).then(function (impl) { onValue(getByPath(impl, p.path)); });
    }
  }

  function installInterop() {
    if (api._interopWired) return;
    api._interopWired = true;
    var libs = interopSources.filter(function (s) { return s && s.interop; });
    if (!libs.length) return;

    // capabilities: pair each consumer with a provider from a DIFFERENT library
    // (the "adopt the other library's provider" rule).
    libs.forEach(function (cLib) {
      var consumes = cLib.interop.consumes || {};
      Object.keys(consumes).forEach(function (cap) {
        var consumer = consumes[cap];
        var provider = null, fromName = null;
        for (var i = 0; i < libs.length; i++) {
          var prov = libs[i].interop.provides && libs[i].interop.provides[cap];
          if (prov && libs[i].name !== cLib.name) { provider = prov; fromName = libs[i].name; break; }
        }
        if (!provider) return;
        onProvide(provider, function (value) {
          invokeConsumer(consumer.call, value);
          api.emit('swc:interop', { capability: cap, from: fromName, to: cLib.name });
        });
      });
    });

    // resource channel: one shared "current resource" across libraries. Any
    // library's `emits` sets it; the loader applies it to every OTHER library's
    // `accepts` (set attr on selector, with optional transform).
    var specs = libs.map(function (l) {
      return l.interop.resource ? { name: l.name, res: l.interop.resource } : null;
    }).filter(Boolean);
    var current = null;
    function applyExcept(fromName, uri) {
      specs.forEach(function (s) {
        if (s.name === fromName || !s.res.accepts) return;
        var a = s.res.accepts;
        var el = document.querySelector(a.selector);
        if (el) el.setAttribute(a.attr, applyTransform(uri, a.transform));
      });
    }
    specs.forEach(function (s) {
      var em = s.res.emits;
      if (!em) return;
      api.on(em.event, function (e) {
        var uri = getByPath(e, em.path);
        if (uri && String(uri) !== current) { current = String(uri); applyExcept(s.name, current); }
      });
    });
  }
  api.installInterop = installInterop;

  // ── loading ────────────────────────────────────────────────────────────────
  function importModule(spec) {
    return import(spec).then(
      function () { if (api.loaded.indexOf(spec) === -1) api.loaded.push(spec); },
      function (e) { console.error('[sol-loader] failed to import', spec, e); }
    );
  }
  function importSeq(mods) {
    return mods.reduce(function (p, spec) { return p.then(function () { return importModule(spec); }); }, Promise.resolve());
  }
  function markCapability(name) {
    if (api._caps[name]) return;
    api._caps[name] = true;
    api.emit('swc:capability', { name: name });
  }

  // Import data-bundles first, then each capability's modules IN ORDER; fire
  // swc:capability when each finishes. A failed import is logged and skipped.
  // (ensureImportmap must already have run — the auto-load awaits the manifests.)
  function load(bundles, opts) {
    ensureImportmap();
    var caps = toList(opts && opts.with);
    return importSeq(toList(bundles)).then(function () {
      return caps.reduce(function (p, cap) {
        return p.then(function () {
          var c = MANIFEST.capabilities && MANIFEST.capabilities[cap];
          if (!c) { console.warn('[sol-loader] unknown capability "' + cap + '"'); return; }
          return importSeq(c.modules || []).then(function () { markCapability(cap); });
        });
      }, Promise.resolve());
    });
  }
  api.load = load;

  function announce() {
    resolveReady(api);
    var detail = { loaded: api.loaded };
    document.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
    window.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
  }

  // Dev aid: warn when a capability's declared attribute is on the page but the
  // capability wasn't loaded — so `data-from-query` without data-extend-with
  // "sparql" doesn't fail silently. Runs after the DOM is parsed.
  function warnUnusedCapabilityAttrs() {
    if (typeof document === 'undefined') return;
    var caps = MANIFEST.capabilities || {};
    Object.keys(caps).forEach(function (name) {
      if (api._caps[name]) return;   // capability loaded — fine
      (caps[name].attributes || []).forEach(function (attr) {
        try {
          if (document.querySelector('[' + attr + ']')) {
            console.warn('[sol-loader] "' + attr + '" is used on the page but the "' + name +
              '" capability is not loaded — add data-extend-with="' + name + '".');
          }
        } catch (e) {}
      });
    });
  }
  function whenDomReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  // Auto-load: fetch the manifest(s), inject the importmap, then load. Always
  // async now (the import resolution lives in a fetched manifest, not baked in).
  var auto = (ds.bundles || ds.load || '').trim();
  loadManifests().then(function () {
    ensureImportmap();
    installInterop();   // before load(): so listeners catch provider events that
                        // fire while a library's modules import (e.g. pod-os:loaded)
    return load(auto, { with: ds.extendWith });
  }).then(function () {
    announce();
    whenDomReady(warnUnusedCapabilityAttrs);
  });
})();
