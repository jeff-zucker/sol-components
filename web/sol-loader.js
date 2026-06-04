/**
 * sol-loader.js — swc's loader. The body below is VENDORED VERBATIM from the
 * `component-interop` package (the generic capability broker); keep it in sync
 * with component-interop.js. swc-specific identity (the SolidWebComponents
 * alias, the rdf/auth/defaults/fetch getters, and the swc:* event aliases) is
 * added by the "swc compatibility tail" at the BOTTOM of this file. The two
 * broker consumers (rdf.useStore / adoptFetch) are registered by swc's modules
 * (core/rdf.js, core/services.js), so the generic broker stays whitelist-free.
 *
 * --- vendored component-interop.js follows ---
 *
 * component-interop.js — a manifest-driven capability broker for web components.
 *
 * It knows nothing about any particular component library: everything it does is
 * driven by one or more MANIFESTS. Independently-authored web-component libraries
 * never import each other — they declare what they PROVIDE and CONSUME in a
 * manifest, and this broker pairs providers to consumers and loads their modules.
 *
 *   <script src="component-interop.js"
 *           data-stage="local"
 *           data-bundles="my-widgets"
 *           data-manifest="other-lib.manifest.json"
 *           data-extend-with="auth"></script>
 *
 * On load it (1) reads its DEFAULT manifest — a sibling named after itself,
 * `<basename>.manifest.json` — plus any `data-manifest` URLs; (2) injects an
 * importmap built from the manifests' `imports` (stage chosen by `data-stage`);
 * (3) `import()`s the `data-bundles` modules + each `data-extend-with`
 * capability's modules, IN ORDER; (4) brokers the libraries' `interop` blocks;
 * then fires `interop:ready`.
 *
 * A manifest:
 *   { "name": "…",                                            // library identity (required for interop)
 *     "imports": { spec: url, … },                           // stage-agnostic, and/or
 *     "stages": { "local": {"imports":{…}}, "cdn": {"imports":{…}} },
 *     "capabilities": { cap: { "modules": [...], "attributes": [...] } },
 *     "interop": {
 *       "provides": { cap: { service|event: "…", path: "…", priority?: n } }, // offer + channel (+ rank)
 *       "consumes": { cap: { call: "<registered-consumer>", from?: "<lib>" } }, // adopt (+ preferred provider)
 *       "resource": { "emits":   { event: "…", path: "…" },       // shared current-focus channel
 *                     "accepts": { selector: "…", attr: "…", transform: "stripHash" } } } }
 * Relative import URLs resolve against THAT manifest's URL. The earlier manifest
 * wins a conflicting specifier (so a shared dep stays single). The broker pairs a
 * `consumes` cap with ANOTHER library's `provides` cap (the adopt rule) and wires
 * the `resource` channel — so a page mixing libraries needs no bridge script.
 *
 * A `consumes.call` names a handler the consuming library registered via
 * `ComponentInterop.registerConsumer(name, fn)` — the broker invokes the
 * registered function, never an arbitrary string. So the broker stays ignorant
 * of any library's actual API.
 *
 * data-* attributes: data-bundles, data-extend-with, data-stage (`local`|`cdn`),
 * data-manifest (SAME-ORIGIN URLs merged after the default), data-manifest-default="off",
 * data-importmap-extra (inline importmap JSON), data-base (resolve data-manifest paths),
 * data-prefer (JSON map capability→preferred provider library, for multi-library pages).
 *
 * API on window.ComponentInterop: ready (Promise), load(bundles,{with}), manifest,
 * loaded, version, registerCapability(name,{modules,attributes}),
 * registerConsumer(name,fn); the host-services registry .services
 * (register/get/has/names/whenReady) so libraries share resources without
 * importing each other; .has(name) / .capabilities; .on(name,fn) / .emit(name,detail).
 * Fires `interop:ready`, `interop:capability` (per capability), `interop:wired`
 * (per provide→consume binding). Zero dependencies.
 */
(function () {
  'use strict';

  var self = document.currentScript;
  var ds = (self && self.dataset) || {};
  var loaderSrc = (self && self.src) || '';
  // data-manifest URLs resolve against the PAGE by default (the loader is usually
  // in node_modules / a CDN, the page's manifests sit with the page). `data-base`
  // overrides. The DEFAULT sibling manifest still resolves against the loader.
  var base = ds.base || (typeof document !== 'undefined' && document.baseURI) || loaderSrc.replace(/[^/]*$/, '') || './';

  // Page-level provider preference for multi-library pages: data-prefer is a JSON
  // map of capability → preferred provider library name (highest-priority tiebreak).
  var PREFER = {};
  try { PREFER = JSON.parse(ds.prefer || '{}') || {}; }
  catch (e) { console.warn('[component-interop] data-prefer is not valid JSON — ignored'); }

  var MANIFEST = { capabilities: {} };   // grows as manifests merge in; nothing baked

  var api = window.ComponentInterop = window.ComponentInterop || {};
  api.manifest = MANIFEST;
  api.loaded = api.loaded || [];
  api._caps = api._caps || {};        // capability names whose modules finished loading
  api.version = api.version || '1';   // surface version (feature detection)
  var resolveReady;
  api.ready = new Promise(function (r) { resolveReady = r; });

  // ── host-services surface ──────────────────────────────────────────────────
  // A tiny registry libraries register their shared services into. Created here,
  // import-free, so the surface exists from the first parser-blocking moment — a
  // component can `await ComponentInterop.services.whenReady('rdf')` before
  // anything loads. Duck-typed, so an import-side accessor can adopt it.
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

  function define(name, getter) {
    if (!(name in api)) { try { Object.defineProperty(api, name, { get: getter, configurable: true }); } catch (e) {} }
  }
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

  // Consumer handlers a library registers so the broker can adopt a foreign
  // value without knowing the library's API. A `consumes.call` names one of these.
  api.consumers = api.consumers || {};
  api.registerConsumer = api.registerConsumer || function (name, fn) {
    if (name && typeof fn === 'function') api.consumers[name] = fn;
    return api;
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

  function extraImports() {
    var raw = (ds.importmapExtra || '').trim();
    if (!raw) return {};
    try { var o = JSON.parse(raw); return (o && o.imports) ? o.imports : (o || {}); }
    catch (e) { console.warn('[component-interop] data-importmap-extra is not valid JSON — ignored', e); return {}; }
  }

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

  function mergeManifest(m, url) {
    if (!m) return;
    var caps = m.capabilities || {};
    for (var name in caps) if (own(caps, name)) mergeCapability(name, caps[name]);
    // Collect interop declarations per LIBRARY (keyed by name) — the broker needs
    // library identity to pair a provider with a consumer in another lib.
    if (m.interop && m.name) interopSources.push({ name: m.name, interop: m.interop });
    var stage = (ds.stage || 'local').trim();
    var imp = {};
    assign(imp, m.imports);
    if (m.stages && m.stages[stage]) assign(imp, m.stages[stage].imports);
    for (var s in imp) {
      if (own(imp, s) && !own(imports, s)) imports[s] = resolveUrl(imp[s], url);
    }
  }

  // The default sibling (the loader's own — trusted even cross-origin) then any
  // data-manifest (SAME-ORIGIN only — it names modules the loader will import()).
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
      catch (x) { console.warn('[component-interop] bad manifest URL: ' + e.url); return null; }
      if (!e.trusted && abs.indexOf(location.origin + '/') !== 0 && abs !== location.origin) {
        var o; try { o = new URL(abs); } catch (x) { o = null; }
        if (!o || o.origin !== location.origin) {
          console.error('[component-interop] data-manifest must be same-origin — ignored: ' + e.url);
          return null;
        }
      }
      return fetch(abs)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
        .then(function (m) { return { m: m, url: abs }; })
        .catch(function (err) { console.error('[component-interop] manifest ' + e.url + ': ' + err.message); return null; });
    })).then(function (results) {
      results.forEach(function (r) { if (r && r.m) mergeManifest(r.m, r.url); });   // in order → first wins
    });
  }

  // ── the broker: glueless provide/consume matchmaking ───────────────────────
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
  // Invoke a library-registered consumer handler — never an arbitrary string.
  function invokeConsumer(call, value) {
    if (value == null) return;
    var fn = api.consumers[call];
    if (fn) { try { fn(value); } catch (e) { console.error('[component-interop] consumer "' + call + '" failed', e); } }
    else console.warn('[component-interop] no consumer registered for "' + call + '" (the library must call ComponentInterop.registerConsumer)');
  }
  function onProvide(p, onValue) {
    if (p.event) {
      api.on(p.event, function (e) { var v = getByPath(e, p.path); if (v != null) onValue(v); });
    } else if (p.service) {
      api.services.whenReady(p.service).then(function (impl) { onValue(getByPath(impl, p.path)); });
    }
  }

  // Choose ONE provider when several libraries provide the same capability:
  //   1. page preference  (data-prefer[cap] === a library's name)
  //   2. consumer's `from` (consumes[cap].from === a library's name)
  //   3. highest provider `priority` (default 0)
  //   4. earliest in manifest order  (candidates are already in that order)
  function pickProvider(candidates, cap, consumer) {
    if (!candidates.length) return null;
    var want = PREFER[cap];
    if (want) { for (var i = 0; i < candidates.length; i++) if (candidates[i].name === want) return candidates[i]; }
    var from = consumer && consumer.from;
    if (from) { for (var j = 0; j < candidates.length; j++) if (candidates[j].name === from) return candidates[j]; }
    var best = candidates[0], bestP = (best.prov.priority || 0);
    for (var k = 1; k < candidates.length; k++) {
      var p = (candidates[k].prov.priority || 0);
      if (p > bestP) { best = candidates[k]; bestP = p; }
    }
    return best;
  }

  function installInterop() {
    if (api._interopWired) return;
    api._interopWired = true;
    var libs = interopSources.filter(function (s) { return s && s.interop; });
    if (!libs.length) return;

    // capabilities: pair each consumer with a provider from a DIFFERENT library.
    libs.forEach(function (cLib) {
      var consumes = cLib.interop.consumes || {};
      Object.keys(consumes).forEach(function (cap) {
        var consumer = consumes[cap];
        var candidates = [];
        for (var i = 0; i < libs.length; i++) {
          var prov = libs[i].interop.provides && libs[i].interop.provides[cap];
          if (prov && libs[i].name !== cLib.name) candidates.push({ name: libs[i].name, prov: prov });
        }
        var chosen = pickProvider(candidates, cap, consumer);
        if (!chosen) return;
        onProvide(chosen.prov, function (value) {
          invokeConsumer(consumer.call, value);
          api.emit('interop:wired', { capability: cap, from: chosen.name, to: cLib.name });
        });
      });
    });

    // resource channel: one shared "current resource". Any `emits` sets it; the
    // broker applies it to every OTHER library's `accepts`.
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
      function (e) { console.error('[component-interop] failed to import', spec, e); }
    );
  }
  function importSeq(mods) {
    return mods.reduce(function (p, spec) { return p.then(function () { return importModule(spec); }); }, Promise.resolve());
  }
  function markCapability(name) {
    if (api._caps[name]) return;
    api._caps[name] = true;
    api.emit('interop:capability', { name: name });
  }

  function load(bundles, opts) {
    ensureImportmap();
    var caps = toList(opts && opts.with);
    return importSeq(toList(bundles)).then(function () {
      return caps.reduce(function (p, cap) {
        return p.then(function () {
          var c = MANIFEST.capabilities && MANIFEST.capabilities[cap];
          if (!c) { console.warn('[component-interop] unknown capability "' + cap + '"'); return; }
          return importSeq(c.modules || []).then(function () { markCapability(cap); });
        });
      }, Promise.resolve());
    });
  }
  api.load = load;

  function announce() {
    resolveReady(api);
    var detail = { loaded: api.loaded };
    document.dispatchEvent(new CustomEvent('interop:ready', { detail: detail }));
    window.dispatchEvent(new CustomEvent('interop:ready', { detail: detail }));
  }

  // Dev aid: warn when a capability's declared attribute is on the page but the
  // capability wasn't loaded. Runs after the DOM is parsed.
  function warnUnusedCapabilityAttrs() {
    if (typeof document === 'undefined') return;
    var caps = MANIFEST.capabilities || {};
    Object.keys(caps).forEach(function (name) {
      if (api._caps[name]) return;
      (caps[name].attributes || []).forEach(function (attr) {
        try {
          if (document.querySelector('[' + attr + ']')) {
            console.warn('[component-interop] "' + attr + '" is used on the page but the "' + name +
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

  // Auto-load: fetch manifest(s), inject importmap, broker, then load.
  var auto = (ds.bundles || ds.load || '').trim();
  loadManifests().then(function () {
    ensureImportmap();
    installInterop();   // before load(): so listeners catch provider events that
                        // fire while a library's modules import
    return load(auto, { with: ds.extendWith });
  }).then(function () {
    announce();
    whenDomReady(warnUnusedCapabilityAttrs);
  });
})();

// ── swc compatibility tail ──────────────────────────────────────────────────
// swc consumes the generic loader above but keeps its historical surface:
// `window.SolidWebComponents` (an alias), the rdf/auth/defaults/fetch getters,
// and the `swc:*` events (re-emitted from `interop:*`). The two adoption
// consumers (`rdf.useStore` / `adoptFetch`) are registered by swc's modules
// (core/rdf.js, core/services.js) so the broker itself stays whitelist-free.
(function () {
  'use strict';
  var ci = (typeof window !== 'undefined') && window.ComponentInterop;
  if (!ci) return;
  if (!window.SolidWebComponents) window.SolidWebComponents = ci;
  function def(name, getter) {
    if (!(name in ci)) { try { Object.defineProperty(ci, name, { get: getter, configurable: true }); } catch (e) {} }
  }
  def('rdf',      function () { return ci.services.get('rdf'); });
  def('auth',     function () { return ci.services.get('auth'); });
  def('defaults', function () { return ci.services.get('defaults'); });
  def('fetch',    function () {
    var a = ci.services.get('auth');
    if (a && typeof a.fetch === 'function') return a.fetch;
    return (typeof fetch !== 'undefined') ? fetch.bind(window) : undefined;
  });
  if (ci.on && ci.emit) {
    ci.on('interop:ready',      function (e) { ci.emit('swc:ready', e.detail); });
    ci.on('interop:capability', function (e) { ci.emit('swc:capability', e.detail); });
    ci.on('interop:wired',      function (e) { ci.emit('swc:interop', e.detail); });
  }
})();
