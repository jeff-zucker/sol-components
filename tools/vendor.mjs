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
import { build as esbuild } from 'esbuild';
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

// esbuild equivalent of the rollup stub: route `node:*` imports to a no-op
// shim so browser bundles don't choke on Node-only paths Comunica pulls in
// transitively. The shim covers the surface that actually gets *invoked* in
// the browser path — notably node:diagnostics_channel's `channel` AND
// `tracingChannel` (lru-cache 11+ uses both; missing tracingChannel breaks
// the entire downstream Comunica import chain at load time).
const NODE_STUB = `
const noopChannel = {
  name: '',
  publish() {},
  subscribe() {},
  unsubscribe() {},
  bindStore() {},
  unbindStore() {},
  runStores(_, fn, ...args) { return fn(...args); },
  hasSubscribers: false,
};
const noopTracing = {
  start:      noopChannel,
  end:        noopChannel,
  asyncStart: noopChannel,
  asyncEnd:   noopChannel,
  error:      noopChannel,
  tracePromise:  (fn, _ctx, ...args) => fn(...args),
  traceCallback: (fn, _pos, _ctx, ...args) => fn(...args),
  traceSync:     (fn, _ctx, ...args) => fn(...args),
  hasSubscribers: false,
};
export const channel        = () => noopChannel;
export const tracingChannel = () => noopTracing;
export const subscribe      = () => {};
export const unsubscribe    = () => {};
export const hasSubscribers = () => false;
export default { channel, tracingChannel, subscribe, unsubscribe, hasSubscribers };
`;
const esbuildStubNodeBuiltins = () => ({
  name: 'stub-node-builtins',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: 'node-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
      contents: NODE_STUB,
      loader: 'js',
    }));
  },
});

// Stub Node built-ins pulled in transitively (Comunica's HTTP stack, etc.).
// Same shim used by the all-in-one bundle in rollup.config.js.
const stubNodeBuiltins = () => ({
  name: 'stub-node-builtins',
  resolveId(id) {
    if (id.startsWith('node:')) return { id: '\0stub:node-builtin', external: false };
    return null;
  },
  load(id) {
    if (id === '\0stub:node-builtin') {
      return 'export default {}; export const channel = () => ({ publish: () => {}, hasSubscribers: false });';
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

function isUpToDate(name, depConfig) {
  if (force) return false;
  const out    = resolvePath(outDir, flatName(name) + '.js');
  const umdOut = depConfig.umd ? resolvePath(outDir, flatName(name) + '.umd.js') : null;
  if (!existsSync(out)) return false;
  if (umdOut && !existsSync(umdOut)) return false;
  const pkg = pkgJsonPath(name);
  if (!existsSync(pkg)) return false;
  const pkgMs = statSync(pkg).mtimeMs;
  if (statSync(out).mtimeMs < pkgMs) return false;
  if (umdOut && statSync(umdOut).mtimeMs < pkgMs) return false;
  return true;
}

async function vendorOne(name, depList, depConfig) {
  const out    = resolvePath(outDir, flatName(name) + '.js');
  const umdOut = depConfig.umd ? resolvePath(outDir, flatName(name) + '.umd.js') : null;
  if (isUpToDate(name, depConfig)) {
    console.log(`[vendor] skip ${name} (up to date)`);
    return;
  }
  console.log(`[vendor] build ${name} → ${out}${umdOut ? ` (+ UMD → ${umdOut})` : ''}`);

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

  if (umdOut) {
    // UMD output is for `<script>`-tag drop-in: must be self-contained, so
    // peers that the ESM build externalized (because they're also vendored)
    // are inlined here. The script-tag consumer loads exactly one file.
    //
    // We use esbuild for this pass rather than rollup. rollup's
    // @rollup/plugin-commonjs struggles with deeply-nested `__exportStar`
    // chains in trees like Comunica — silently dropping individual named
    // exports — and the resulting UMD throws at runtime ("X is not a
    // constructor"). esbuild handles big CJS trees correctly.
    await esbuild({
      entryPoints: [name],
      outfile:     umdOut,
      bundle:      true,
      format:      'iife',
      globalName:  depConfig.umd,
      platform:    'browser',
      banner:      { js: PROCESS_SHIM },
      logLevel:    'warning',
      plugins:     [esbuildStubNodeBuiltins()],
    });
  }
}

const depList = Object.keys(deps);
let failures = 0;
for (const name of depList) {
  try { await vendorOne(name, depList, deps[name]); }
  catch (err) {
    failures++;
    console.error(`[vendor] FAIL ${name}: ${err.message}`);
  }
}
if (failures) {
  console.error(`[vendor] ${failures} dep(s) failed`);
  process.exit(1);
}

// ── rdflib → window.$rdf shim ────────────────────────────────────────────────
// ESM consumers (sol-loader's injected importmap, app bundles, solid-ui) bind
// `rdflib` to this shim instead of a second ESM copy, so every bundle shares
// the ONE rdflib the loader publishes at window.$rdf (the vendored UMD). That
// keeps the rdflib library single — required for term `instanceof` / store
// identity across bundles (see core/rdf.js's cross-bundle singleton). Named
// exports are enumerated from the real rdflib so the shim stays complete.
try {
  const rdflib = await import('rdflib');
  const names = Object.keys(rdflib)
    .filter((k) => k !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k))
    .sort();
  const shim =
    '// GENERATED by tools/vendor.mjs — re-exports window.$rdf as ESM so every\n' +
    '// bundle shares ONE rdflib library. window.$rdf is the vendored rdflib UMD,\n' +
    '// which sol-loader loads (parser-blocking) before any module resolves.\n' +
    "const $rdf = (typeof window !== 'undefined' && window.$rdf) ? window.$rdf : {};\n" +
    'export default $rdf;\n' +
    names.map((k) => `export const ${k} = $rdf[${JSON.stringify(k)}];`).join('\n') + '\n';
  writeFileSync(resolvePath(outDir, 'rdflib-global.js'), shim);
  console.log(`[vendor] wrote rdflib-global.js shim (${names.length} exports)`);
} catch (err) {
  console.error('[vendor] FAILED to generate rdflib-global.js shim:', err.message);
  process.exit(1);
}

console.log(`[vendor] done — ${depList.length} dep(s) in ${outDir}`);
