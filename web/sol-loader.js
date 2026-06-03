/**
 * sol-loader.js — one-tag loader for solid-web-components.
 *
 * Replaces a hand-written stack of <script> tags (vendor peers + bundles +
 * importmap) with a single tag. Declarative:
 *
 *   <script src="dist/sol-loader.min.js"
 *           data-stage="local"
 *           data-bundles="basic pods time weather"
 *           data-with="auth sparql rdf"></script>
 *
 * or programmatic:
 *
 *   <script src="dist/sol-loader.min.js"></script>
 *   <script>
 *     await SolidWebComponents.load(['rdf', 'time'], { with: ['auth'] });
 *   </script>
 *
 * data-bundles / the load() list accepts:
 *   - bundle token — `basic` — the no-RDF app-tier IIFE bundle (all of that
 *     tier's components in one file);
 *   - group token — `pods` (pod/pod-extras/live-edit) — the pod family, which
 *     travels together, expands to its per-component UMDs;
 *   - individual components — `time`, `pod`, `query`, … (widgets are picked
 *     individually; there's no `widgets` catch-all — apps rarely want all six).
 * data-with adds optional capabilities — a peer/lib plus the components that
 * need it:
 *   - `auth` → inrupt client + sol-login;
 *   - `sparql` / `comunica` → Comunica + sol-query;
 *   - `rdf` (alias `forms`) → the ESM-only RDF/Solid editing stack: solid-ui +
 *     solid-logic + sol-form/sol-settings/sol-tree-edit, loaded self-sufficiently
 *     via an injected module bootstrap resolved by the importmap (NOT UMD). It
 *     needs an importmap, so it injects the "local" stage if data-stage is
 *     absent. No app code needed.
 *
 * The loader figures out which vendor peers each needs, loads them ONCE in
 * dependency order (rdflib → dompurify → marked → auth → sparql), skipping any
 * global already on the page, then loads the bundles. Injected scripts use
 * `async = false`, so execution order is preserved. When everything is loaded
 * it resolves `SolidWebComponents.ready` and fires `swc:ready` on document+window.
 *
 * data-stage ("local" | "cdn") injects an importmap (generated at build time
 * from external-deps.json) so the `forms` bootstrap — and any ESM app bundle on
 * the page — can resolve bare swc imports (solid-ui/solid-logic + swc source).
 * "local" → dist/vendor/*; "cdn" → esm.sh. Because the loader is a
 * parser-blocking <head> script, the map is injected before any deferred module
 * resolves. Override the base dir with data-base.
 */
(function () {
  'use strict';

  var self = document.currentScript;
  var ds = (self && self.dataset) || {};
  var base = ds.base || (self && self.src ? self.src.replace(/[^/]*$/, '') : './');

  // Per-stage importmaps, generated at BUILD time from tools/external-deps.json
  // (the `__SWC_STAGES__` token is replaced by rollup). Each value is a
  // { specifier → url } map where urls use the `__BASE__` placeholder for this
  // file's directory. Used by data-stage to inject an importmap so ESM-only
  // peers (solid-ui/solid-logic) and bare swc-source imports resolve — see
  // injectImportmap().
  var STAGES = __SWC_STAGES__;

  var REQUIRED = ['rdflib', 'dompurify', 'marked'];

  // name → { file, peers } — file is relative to `base` (the dist/ dir).
  // (There's no `rdf` bundle token: the RDF/Solid editing stack — solid-ui +
  // solid-logic + sol-form/settings/tree-edit — is ESM-only, so it loads via
  // the `rdf` *capability* in data-with, not a UMD bundle. See FORMS_BOOTSTRAP.)
  var REGISTRY = {
    // app-tier IIFE bundle (no-RDF tier)
    basic:             { file: 'sol-basic.bundle.min.js',        peers: ['dompurify', 'marked'] },
    // widgets (each its own UMD)
    time:              { file: 'sol-time.umd.min.js',            peers: REQUIRED },
    weather:           { file: 'sol-weather.umd.min.js',         peers: REQUIRED },
    search:            { file: 'sol-search.umd.min.js',          peers: REQUIRED },
    calendar:          { file: 'sol-calendar.umd.min.js',        peers: REQUIRED },
    feed:              { file: 'sol-feed.umd.min.js',            peers: REQUIRED },
    gallery:           { file: 'sol-gallery.umd.min.js',         peers: REQUIRED },
    // pod family
    pod:               { file: 'sol-pod.umd.min.js',             peers: REQUIRED },
    'pod-extras':      { file: 'sol-pod-extras.umd.min.js',      peers: REQUIRED },
    'live-edit':       { file: 'sol-live-edit.umd.min.js',       peers: REQUIRED },
    // individually-loadable basic components + addons + standalone rdf comps
    button:            { file: 'sol-button.umd.min.js',          peers: ['dompurify', 'marked'] },
    'dropdown-button': { file: 'sol-dropdown-button.umd.min.js', peers: ['dompurify', 'marked'] },
    include:           { file: 'sol-include.umd.min.js',         peers: ['dompurify', 'marked'] },
    menu:              { file: 'sol-menu.umd.min.js',            peers: ['dompurify', 'marked'] },
    tabs:              { file: 'sol-tabs.umd.min.js',            peers: ['dompurify', 'marked'] },
    default:           { file: 'sol-default.umd.min.js',         peers: REQUIRED }, // shared-defaults singleton (optional RDF config)
    'menu-from-rdf':   { file: 'menu-from-rdf.umd.min.js',       peers: ['rdflib'] },
    login:             { file: 'sol-login.umd.min.js',           peers: REQUIRED },
    query:             { file: 'sol-query.umd.min.js',           peers: REQUIRED },
    solidos:           { file: 'sol-solidos.umd.min.js',         peers: REQUIRED }, // + mashlib (BYO, see docs)
  };

  // Group tokens that expand to several registry names. Only cohesive families
  // belong here — the pod family travels together. Widgets are independent
  // gadgets (time/weather/search/calendar/feed/gallery); an app picks the few
  // it wants, so they're listed individually rather than as a group.
  var GROUPS = {
    pods: ['pod', 'pod-extras', 'live-edit'],
  };

  // An optional peer (data-with) that implies a component: requesting the peer
  // also loads the component that needs it — auth → sol-login, sparql/comunica
  // → sol-query. So `data-with="auth sparql"` pulls in login + query too.
  var IMPLIES = { auth: 'login', sparql: 'query', comunica: 'query' };

  // The `rdf` capability (data-with) loads the RDF/Solid editing stack —
  // solid-ui + solid-logic + sol-form/sol-settings/sol-tree-edit. It's ESM-only
  // (solid-ui sets window.UI as a module and binds rdflib at import), so it must
  // load as ES modules sharing ONE rdflib with solid-ui (via the injected
  // importmap), NOT as UMD bundles. So `data-with="rdf"` (alias `forms`)
  // triggers an injected module bootstrap importing solid-logic → solid-ui → the
  // components — self-sufficient, no app code. Needs an importmap (data-stage;
  // if a page asks for rdf without one, the loader injects the "local" stage).
  // It's a data-with capability, not a data-bundles bundle, because it pulls in
  // a whole library stack, not just a component or two.
  // Sequential dynamic imports in an async IIFE: preserves order (solid-logic →
  // solid-ui → form components), and try/catch guarantees the ready event fires
  // even if (say) solid-ui fails — so awaiting SolidWebComponents.ready can't
  // hang. Bare specifiers resolve via the injected importmap.
  var FORMS_BOOTSTRAP = [
    "(async function () {",
    "  try {",
    "    var sl = await import('solid-logic'); window.solidLogic = sl;",  // singleton store FIRST
    "    await import('solid-ui');",                                       // sets window.UI, same rdflib
    "    await import('solid-web-components/sol-tree-edit.js');",
    "    await import('solid-web-components/sol-form.js');",
    "    await import('solid-web-components/sol-settings.js');",
    "  } catch (e) { console.error('[sol-loader] forms bootstrap failed:', e); }",
    "  window.__swcFormsLoaded = true;",
    "  window.dispatchEvent(new Event('swc:forms-loaded'));",
    "})();"
  ].join('\n');

  // Peer/optional name → vendor file + the window global it self-publishes
  // (used to skip a peer that the page already loaded).
  var VENDOR = {
    rdflib:    { file: 'vendor/rdflib.umd.js',                                global: '$rdf' },
    dompurify: { file: 'vendor/dompurify.umd.js',                            global: 'DOMPurify' },
    marked:    { file: 'vendor/marked.umd.js',                               global: 'marked' },
    auth:      { file: 'vendor/@inrupt-solid-client-authn-browser.umd.js',   global: 'solidClientAuthn' },
    sparql:    { file: 'vendor/@comunica-query-sparql.umd.js',               global: 'Comunica' },
  };
  // `comunica` is an alias for `sparql`.
  VENDOR.comunica = VENDOR.sparql;

  // Canonical load order for peers (deps before the libs that read them).
  var PEER_ORDER = ['rdflib', 'dompurify', 'marked', 'auth', 'sparql', 'comunica'];

  function toList(v) {
    if (Array.isArray(v)) return v.slice();
    return String(v || '').trim().split(/\s+/).filter(Boolean);
  }

  function appendScript(url) {
    return new Promise(function (resolve) {
      var el = document.createElement('script');
      el.src = url;
      el.async = false; // preserve execution order among injected scripts
      el.onload = function () { resolve({ url: url, ok: true }); };
      el.onerror = function () {
        console.error('[sol-loader] failed to load', url);
        resolve({ url: url, ok: false });
      };
      (document.head || document.documentElement).appendChild(el);
    });
  }

  function resolveNames(names) {
    var out = [];
    toList(names).forEach(function (n) {
      if (GROUPS[n]) { out.push.apply(out, GROUPS[n]); return; }
      out.push(n);
    });
    return out;
  }

  function load(names, opts) {
    var wanted = resolveNames(names);
    var withList = toList(opts && opts.with);
    // `rdf` (alias `forms`) is a CAPABILITY, not a UMD peer — it loads the
    // solid-ui/solid-logic ESM stack + form components via a module bootstrap.
    // Pull it out of the peer list before peers are resolved.
    var wantsForms = false;
    withList = withList.filter(function (w) {
      if (w === 'rdf' || w === 'forms') { wantsForms = true; return false; }
      return true;
    });
    // an optional peer can imply a component (auth → login, sparql → query)
    withList.forEach(function (w) {
      if (IMPLIES[w] && wanted.indexOf(IMPLIES[w]) === -1) wanted.push(IMPLIES[w]);
    });

    var peers = [];
    var files = [];
    wanted.forEach(function (n) {
      var entry = REGISTRY[n];
      if (!entry) { console.warn('[sol-loader] unknown bundle/component:', n); return; }
      entry.peers.forEach(function (p) { if (peers.indexOf(p) === -1) peers.push(p); });
      if (files.indexOf(entry.file) === -1) files.push(entry.file);
    });
    // the optional peers themselves (auth/sparql UMD globals)
    withList.forEach(function (p) { if (peers.indexOf(p) === -1) peers.push(p); });

    // When an importmap is in play it routes bare `rdflib` to the window.$rdf
    // shim, so window.$rdf must exist — ensure the rdflib UMD peer loads even if
    // no rdflib-using UMD component was requested (e.g. rdf/forms-only pages).
    if ((wantsForms || ds.stage || api.importmap) && peers.indexOf('rdflib') === -1) {
      peers.push('rdflib');
    }

    // order peers canonically, drop any whose global is already present
    var peerFiles = PEER_ORDER
      .filter(function (p) { return peers.indexOf(p) !== -1 && VENDOR[p]; })
      .filter(function (p) { return !window[VENDOR[p].global]; })
      .map(function (p) { return VENDOR[p].file; });

    // peers first, then bundles; dedupe, prefix base
    var seen = {};
    var urls = peerFiles.concat(files).filter(function (f) {
      if (!f || seen[f]) return false;
      seen[f] = true;
      return true;
    }).map(function (f) { return base + f; });

    var jobs = [Promise.all(urls.map(appendScript)).then(function (results) {
      api.loaded = (api.loaded || []).concat(
        results.filter(function (r) { return r.ok; }).map(function (r) { return r.url; })
      );
      return results;
    })];

    // Forms: ensure the importmap is present, then inject the module bootstrap
    // and (for ready) wait for it to finish registering.
    if (wantsForms) {
      if (!api.importmap) injectImportmap((ds.stage || 'local').trim());
      injectFormsBootstrap();
      jobs.push(whenFormsLoaded());
    }
    return Promise.all(jobs);
  }

  // Public API on window.SolidWebComponents (+ a `ready` promise).
  var api = window.SolidWebComponents = window.SolidWebComponents || {};
  api.base = base;
  api.registry = REGISTRY;
  api.load = load;
  var resolveReady;
  api.ready = new Promise(function (r) { resolveReady = r; });

  function announce() {
    resolveReady(api);
    var detail = { loaded: api.loaded || [] };
    document.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
    window.dispatchEvent(new CustomEvent('swc:ready', { detail: detail }));
  }

  // Inject an importmap for the chosen stage (local | cdn). Resolves bare swc
  // imports an ESM app bundle on the page makes — including the ESM-only form
  // stack (solid-ui/solid-logic) that can't be script-tag-loaded. The loader is
  // a classic <head> script, so this runs DURING PARSE, before any deferred
  // `type=module` resolves — which is what makes the injected map take effect.
  function injectImportmap(stage) {
    var map = STAGES && STAGES[stage];
    if (!map) { console.warn('[sol-loader] unknown stage "' + stage + '" — no importmap injected'); return; }
    var imports = {};
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) imports[k] = map[k].replace(/__BASE__/g, base);
    }
    var el = document.createElement('script');
    el.type = 'importmap';
    el.textContent = JSON.stringify({ imports: imports });
    (document.head || document.documentElement).appendChild(el);
    api.importmap = imports;
    if (document.readyState !== 'loading') {
      console.warn('[sol-loader] importmap injected after parsing began; modules may not pick it up. Load sol-loader as a classic <script> in <head>.');
    }
  }
  api.injectImportmap = injectImportmap;

  // Inject the ESM form-stack bootstrap (once). Runs as a module, resolved by
  // the injected importmap, so it shares one rdflib with solid-ui.
  function injectFormsBootstrap() {
    if (api._formsInjected) return;
    api._formsInjected = true;
    var el = document.createElement('script');
    el.type = 'module';
    el.textContent = FORMS_BOOTSTRAP;
    (document.head || document.documentElement).appendChild(el);
  }
  function whenFormsLoaded() {
    return new Promise(function (resolve) {
      if (window.__swcFormsLoaded) { resolve(); return; }
      window.addEventListener('swc:forms-loaded', function () { resolve(); }, { once: true });
    });
  }

  // data-stage injects the importmap (must happen before any module loads).
  if (ds.stage) injectImportmap(ds.stage.trim());

  // Auto-run from data-attrs (data-bundles or data-load); otherwise just expose
  // load() and resolve ready so awaiting code doesn't hang.
  var auto = (ds.bundles || ds.load || '').trim();
  if (auto) {
    load(auto, { with: ds.with }).then(announce);
  } else {
    resolveReady(api);
  }
})();
