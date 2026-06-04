#!/usr/bin/env node
/**
 * build-importmaps.mjs
 *
 * Reads tools/external-deps.json + web/ and writes, into dist/:
 *   - importmap-cdn.json / importmap-local.json — bare specifiers → esm.sh URLs
 *     / ./vendor + ../web paths (for anyone consuming an importmap directly).
 *   - sol-loader.manifest.json — swc described as a loader manifest (per-stage
 *     imports + capabilities). sol-loader auto-loads this as its sibling default,
 *     so the loader bakes in nothing about swc.
 *
 * The vendored files are produced by tools/vendor.mjs.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here    = dirname(fileURLToPath(import.meta.url));
const root    = resolve(here, '..');
const outDir  = resolve(root, 'dist');
const webDir  = resolve(root, 'web');
const depsFile = resolve(here, 'external-deps.json');

const { deps } = JSON.parse(readFileSync(depsFile, 'utf8'));

const cdn   = { imports: {} };
const local = { imports: {} };

// ── third-party deps (rdflib, dompurify, solid-ui, …) ────────────────────────
// All-ESM: bare `rdflib` resolves to ONE module, so every bundle shares one
// rdflib instance via the importmap itself — no window.$rdf UMD, no shim.
for (const [name, info] of Object.entries(deps)) {
  cdn.imports[name]   = info.cdn;
  const flat = name.replace(/\//g, '-');   // @scope/pkg → @scope-pkg
  local.imports[name] = `./vendor/${flat}.js`;
}

// ── swc components — one BARE specifier per web/ module ──────────────────────
// So a `data-bundles="sol-time sol-feed"` tag (or any app importing 'sol-time')
// resolves to the source ESM. Components import their own deps (rdflib via
// core/rdf, etc.) through the entries above. local → repo source; cdn → esm.sh.
const PKG = 'solid-web-components';
const components = readdirSync(webDir)
  .filter((f) => /^[a-z][a-z0-9-]*\.js$/.test(f))   // top-level modules only
  .map((f) => f.replace(/\.js$/, ''));
for (const c of components) {
  local.imports[c] = `../web/${c}.js`;               // dist/ → ../web (repo source)
  cdn.imports[c]   = `https://esm.sh/${PKG}/web/${c}.js`;
}
// swc-source prefixes for app bundles that import internals (core/, sources/).
for (const sub of ['core/', 'sources/', 'data/']) {
  local.imports[`${PKG}/${sub}`] = `../${sub}`;
  cdn.imports[`${PKG}/${sub}`]   = `https://esm.sh/${PKG}/${sub}`;
}
local.imports[`${PKG}/`] = '../web/';
cdn.imports[`${PKG}/`]   = `https://esm.sh/${PKG}/web/`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'importmap-cdn.json'),   JSON.stringify(cdn,   null, 2) + '\n');
writeFileSync(resolve(outDir, 'importmap-local.json'), JSON.stringify(local, null, 2) + '\n');

// ── the manifest: swc described as a manifest the (library-agnostic) loader
// reads, EXACTLY like a third party's. It carries the import resolution per
// stage AND the capabilities — so sol-loader bakes in nothing about swc; it
// learns everything from this file (its sibling default manifest). The relative
// paths below resolve against this manifest's own URL at load time (no __BASE__).
const manifest = {
  name: PKG,
  stages: {
    local: { imports: local.imports },   // offline / npm-installed (./vendor, ../web)
    cdn:   { imports: cdn.imports },      // esm.sh
  },
  capabilities: {
    // Each capability lists its `modules` (loaded in order) AND its `attributes`
    // — the cross-cutting data-* vocabulary it activates on any element. The
    // loader uses `attributes` to warn when one is used without the capability.
    // inrupt-global is a tiny shim that publishes window.solidClientAuthn from
    // the ESM inrupt build, so sol-login finds the Session class on every stage
    // without a separate UMD <script>. It MUST precede sol-login.
    auth:    { modules: ['solid-web-components/core/inrupt-global.js', 'sol-login'], attributes: [] },
    sparql:  { modules: ['@comunica/query-sparql', 'sol-query', 'solid-web-components/core/from-query.js'],
               attributes: ['data-from-query'] },
    rdf:     { modules: ['solid-logic', 'solid-ui', 'sol-tree-edit', 'sol-form', 'sol-settings',
                         'solid-web-components/core/edit-placements.js', 'solid-web-components/core/from-rdf.js'],
               attributes: ['data-edit-shape', 'data-edit-mode', 'data-subject', 'data-from-rdf'] },
    // NOTE: solidos is PARKED — intentionally not wired here. mashlib's
    // published bundle inlines its own rdflib/solid-ui/solid-logic, so loading
    // it through the importmap would create a second rdflib instance and break
    // single-instance coherence. Re-enabling it needs a from-source mashlib
    // build (externalising those deps) before sol-solidos can be loader-driven.
  },
  // ── interop: what swc PROVIDES and CONSUMES on the host surface, declared so
  // the loader can wire swc to a foreign library (e.g. PodOS) with no page glue.
  // Symmetric with a foreign library's manifest: each `provides` names its
  // delivery channel (here the host-services registry); each `consumes` names a
  // whitelisted surface method swc exposes for adopting a foreign value.
  interop: {
    provides: {
      rdf:  { service: 'rdf',  path: 'store' },   // value: services.get('rdf').store
      auth: { service: 'auth', path: 'fetch' },   // value: services.get('auth').fetch
    },
    consumes: {
      rdf:  { call: 'rdf.useStore' },             // adopt a foreign rdflib store
      auth: { call: 'adoptFetch' },               // adopt a foreign authenticated fetch
    },
    resource: {
      emits:   { event: 'sol-navigate', path: 'detail.url' },
      accepts: { selector: 'sol-query', attr: 'endpoint', transform: 'stripHash' },
    },
  },
};
// Named for the loader, not the library: the loader auto-loads its sibling
// `<loader-basename>.manifest.json`, so this file is swc's content under a
// loader-generic name. (importmap-{local,cdn}.json are still emitted above for
// anyone consuming an importmap directly.)
writeFileSync(resolve(outDir, 'sol-loader.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`[build-importmaps] wrote dist/importmap-cdn.json   (${Object.keys(cdn.imports).length} entries)`);
console.log(`[build-importmaps] wrote dist/importmap-local.json (${Object.keys(local.imports).length} entries)`);
console.log(`[build-importmaps] wrote dist/sol-loader.manifest.json (${Object.keys(manifest.capabilities).length} capabilities, ${Object.keys(local.imports).length} imports/stage)`);
