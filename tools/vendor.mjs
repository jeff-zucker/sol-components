#!/usr/bin/env node
/**
 * vendor.mjs
 *
 * For each external dep listed in tools/external-deps.json, run Rollup once
 * to produce dist/vendor/<flat-name>.js — a single self-contained ESM file
 * with all transitive deps inlined and any CJS converted to ESM.
 *
 * The output is what dist/importmap-local.json points at, so the offline
 * importmap can resolve every bare specifier without traversing
 * node_modules at runtime.
 *
 * Idempotent: skips rebuild if the output is newer than the dep's
 * package.json (cheap proxy for "version unchanged"). Pass --force to
 * always rebuild.
 */

import { rollup } from 'rollup';
import resolve   from '@rollup/plugin-node-resolve';
import commonjs  from '@rollup/plugin-commonjs';
import json      from '@rollup/plugin-json';
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const here     = dirname(fileURLToPath(import.meta.url));
const root     = resolvePath(here, '..');
const outDir   = resolvePath(root, 'dist/vendor');
const depsFile = resolvePath(here, 'external-deps.json');
const force    = process.argv.includes('--force');

const { deps } = JSON.parse(readFileSync(depsFile, 'utf8'));

mkdirSync(outDir, { recursive: true });

// Stub Node built-ins pulled in transitively (Comunica's HTTP stack, etc.)
// so the browser ESM bundles don't choke on Node-only import paths.
const stubNodeBuiltins = () => ({
  name: 'stub-node-builtins',
  resolveId(id) {
    if (id.startsWith('node:')) return { id: '\0stub:node-builtin', external: false };
    return null;
  },
  load(id) {
    if (id === '\0stub:node-builtin') {
      // diagnostics_channel: `channel()` and `tracingChannel()` (lru-cache, a
      // Comunica transitive dep, calls tracingChannel and would otherwise throw
      // "tracingChannel is not a function" in the browser). All no-ops; trace*
      // just invoke the wrapped fn so instrumentation is transparent.
      return [
        'export default {};',
        'export const channel = () => ({ publish: () => {}, subscribe: () => {}, unsubscribe: () => {}, hasSubscribers: false });',
        'export const tracingChannel = () => ({',
        '  hasSubscribers: false, subscribe: () => {}, unsubscribe: () => {},',
        '  traceSync: (fn, ctx, ...a) => fn.apply(ctx, a),',
        '  tracePromise: (fn, ctx, ...a) => fn.apply(ctx, a),',
        '  traceCallback: (fn, pos, ctx, ...a) => fn.apply(ctx, a),',
        '  start: {}, end: {}, asyncStart: {}, asyncEnd: {}, error: {},',
        '});',
      ].join('\n');
    }
    return null;
  },
});

// Browser-side polyfill for Node's `process` global. Several deps
// (Comunica, parts of the rdflib stack) read `process.env.NODE_ENV` or call
// `process.nextTick(...)`. Prepended as the bundle banner so it runs before
// the rest of the module's top-level code.
const PROCESS_SHIM = [
  'if (typeof globalThis.process === "undefined") {',
  '  globalThis.process = {',
  '    env: {}, browser: true, version: "", versions: { node: "" },',
  '    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),',
  '    cwd: () => "/", platform: "browser",',
  '  };',
  '}',
].join('\n');

function flatName(name) { return name.replace(/\//g, '-'); }

function pkgJsonPath(name) {
  return resolvePath(root, 'node_modules', name, 'package.json');
}

function isUpToDate(name) {
  if (force) return false;
  const out = resolvePath(outDir, flatName(name) + '.js');
  if (!existsSync(out)) return false;
  const pkg = pkgJsonPath(name);
  if (!existsSync(pkg)) return false;
  if (statSync(out).mtimeMs < statSync(pkg).mtimeMs) return false;
  return true;
}

async function vendorOne(name, depList) {
  const out = resolvePath(outDir, flatName(name) + '.js');
  if (isUpToDate(name)) {
    console.log(`[vendor] skip ${name} (up to date)`);
    return;
  }
  console.log(`[vendor] build ${name} → ${out}`);

  // ESM output: treat *other* externals as runtime imports — we don't want
  // to inline rdflib into solid-ui's vendored file, for example. The browser
  // resolves them through the same importmap.
  const others = depList.filter(d => d !== name);

  const esmOnwarn = (warning, warn) => {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  };

  const bundle = await rollup({
    input: name,
    external: (id) => others.some(d => id === d || id.startsWith(d + '/')),
    plugins: [
      stubNodeBuiltins(),
      resolve({ browser: true, preferBuiltins: false }),
      commonjs({ transformMixedEsModules: true, ignoreDynamicRequires: true }),
      json(),
    ],
    onwarn: esmOnwarn,
  });

  await bundle.write({
    file: out,
    format: 'esm',
    inlineDynamicImports: true,
    banner: PROCESS_SHIM,
  });

  await bundle.close();
}

const depList = Object.keys(deps);
let failures = 0;
for (const name of depList) {
  try { await vendorOne(name, depList); }
  catch (err) {
    failures++;
    console.error(`[vendor] FAIL ${name}: ${err.message}`);
  }
}
if (failures) {
  console.error(`[vendor] ${failures} dep(s) failed`);
  process.exit(1);
}

// (All-ESM: no rdflib→window.$rdf shim. The importmap maps bare `rdflib` to the
// one vendored ESM, so every module shares one rdflib instance directly.)

console.log(`[vendor] done — ${depList.length} dep(s) in ${outDir}`);
