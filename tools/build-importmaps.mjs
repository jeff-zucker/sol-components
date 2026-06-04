#!/usr/bin/env node
/**
 * build-importmaps.mjs
 *
 * Reads tools/external-deps.json and writes two importmap JSON files into
 * dist/ — one mapping bare specifiers to esm.sh URLs (CDN runtime), one
 * mapping them to ./vendor/<name>.js paths (offline / npm-installed runtime).
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

// ── manifest: pure glue, fixed for every app (capabilities only; no groups) ──
const manifest = {
  name: PKG,
  capabilities: {
    auth:    { modules: ['sol-login'] },
    sparql:  { modules: ['sol-query'] },
    rdf:     { modules: ['solid-logic', 'solid-ui', 'sol-tree-edit', 'sol-form', 'sol-settings'] },
    // NOTE: solidos is PARKED — intentionally not wired here. mashlib's
    // published bundle inlines its own rdflib/solid-ui/solid-logic, so loading
    // it through the importmap would create a second rdflib instance and break
    // single-instance coherence. Re-enabling it needs a from-source mashlib
    // build (externalising those deps) before sol-solidos can be loader-driven.
  },
};
writeFileSync(resolve(outDir, 'swc.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`[build-importmaps] wrote dist/importmap-cdn.json   (${Object.keys(cdn.imports).length} entries)`);
console.log(`[build-importmaps] wrote dist/importmap-local.json (${Object.keys(local.imports).length} entries)`);
console.log(`[build-importmaps] wrote dist/swc.manifest.json    (${Object.keys(manifest.capabilities).length} capabilities)`);
