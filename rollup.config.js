import resolve  from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json     from '@rollup/plugin-json';
import terser   from '@rollup/plugin-terser';
import { readFileSync } from 'node:fs';

const minify = !!process.env.MINIFY;

// Build sol-loader's per-stage importmaps from the single source of truth
// (tools/external-deps.json). `__BASE__` is resolved to the loader's own dir at
// runtime. `local` points at the vendored ESM (dist/vendor/<flat>.js); `cdn`
// uses each dep's esm.sh url. Plus the swc-source mappings the form stack needs.
function buildSwcStages() {
  const { deps } = JSON.parse(readFileSync('tools/external-deps.json', 'utf8'));
  const flat = (n) => n.replace(/\//g, '-');               // matches tools/vendor.mjs
  const local = {}, cdn = {};
  for (const [name, d] of Object.entries(deps)) {
    local[name] = `__BASE__vendor/${flat(name)}.js`;
    cdn[name]   = d.cdn;
  }
  // rdflib resolves to the window.$rdf shim in BOTH stages (not a second ESM
  // copy), so all bundles share the one rdflib the loader's UMD peer publishes —
  // term `instanceof` / store identity stay coherent. See tools/vendor.mjs.
  local.rdflib = '__BASE__vendor/rdflib-global.js';
  cdn.rdflib   = '__BASE__vendor/rdflib-global.js';
  // swc source resolution (relative to the dist/ base the loader ships from)
  const src = [['solid-web-components/core/', '../core/'],
               ['solid-web-components/data/', '../data/'],
               ['solid-web-components/',      '../web/']];
  for (const [key, sub] of src) {
    local[key] = `__BASE__${sub}`;
    cdn[key]   = `https://esm.sh/solid-web-components/${sub.replace('../', '')}`;
  }
  return { local, cdn };
}

// Replace the `__SWC_STAGES__` token in web/sol-loader.js with the generated
// stages object so the loader ships them inline.
const injectSwcStages = () => ({
  name: 'inject-swc-stages',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('web/sol-loader.js')) return null;
    return { code: code.replace(/__SWC_STAGES__/g, JSON.stringify(buildSwcStages())), map: null };
  },
});

// External dependencies — never bundled; supplied by the host page (via an
// importmap, vendored ESM, or UMD globals).
const external = ['rdflib', 'dompurify', 'marked'];

// Runtime-optional dynamic imports that live outside this repo
// (e.g. `../src/podz-editor.js`, which only resolves when sol-live-edit is
// consumed from within podz). Mark them external so rollup emits the bare
// `import()` call; the host wraps it in try/catch, so runtime failure is fine.
const stubMissingDynamic = () => ({
  name: 'externalize-missing-dynamic',
  resolveId(id) {
    if (id.includes('podz-editor')) return { id, external: true };
    if (id.includes('data/live-edit/')) return { id, external: true };
    // Stub Node built-ins pulled in transitively (e.g. `node:diagnostics_channel`
    // from Comunica's HTTP stack). They're never executed in the browser.
    if (id.startsWith('node:')) return { id: '\0stub:node-builtin', external: false };
    return null;
  },
  load(id) {
    if (id === '\0stub:node-builtin') return 'export default {}; export const channel = () => ({ publish: () => {}, hasSubscribers: false });';
    return null;
  },
});

const plugins = [stubMissingDynamic(), resolve()];
if (minify) plugins.push(terser());

// Plugins for the all-in-one bundle (bundles CJS deps like rdflib internals,
// Comunica's many sub-packages, and inrupt auth).
const bundlePlugins = [
  stubMissingDynamic(),
  resolve({ browser: true, preferBuiltins: false }),
  commonjs({ transformMixedEsModules: true, ignoreDynamicRequires: true }),
  json(),
];
if (minify) bundlePlugins.push(terser());

// Replace `rdflib` with an empty stub — used ONLY for the no-RDF sol-basic
// bundle. core/rdf.js does `import * as _rdflib from 'rdflib'` but never
// touches it until a method runs, and every method is gated behind
// `rdf.isReady()` (which an empty stub makes false). So sol-default's optional
// RDF-config path (`<sol-default source="…ttl">`) degrades off and the bundle
// needs no `$rdf` global — it drops in standalone. Must precede resolve() so
// 'rdflib' never reaches node_modules. (Source consumers import the real
// rdflib; the RDF menu editor lives in sol-rdf, not here.)
const stubRdflib = () => ({
  name: 'stub-rdflib',
  resolveId(id) { return id === 'rdflib' ? '\0stub:rdflib' : null; },
  load(id) { return id === '\0stub:rdflib' ? 'export default {};' : null; },
});
const basicPlugins = [stubRdflib(), ...bundlePlugins];

export default [
  // ── sol-query (component + RDF engine + UI + triple-pattern parser) ────────
  {
    input:    'web/sol-query.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-query.umd.min.js' : 'dist/sol-query.umd.js',
      format:  'umd',
      name:    'SolQuery',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
      // The component dynamically imports built-in view modules; for a UMD
      // drop-in we want one self-contained file rather than runtime fetches.
      inlineDynamicImports: true,
    },
  },
  // ── rdf-utils (engine only — for script-API consumers) ─────────────────────
  {
    input:    'core/rdf-utils.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/rdf-utils.umd.min.js' : 'dist/rdf-utils.umd.js',
      format:  'umd',
      name:    'SolQueryRdf',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify' },
    },
  },
  // ── sol-include ─────────────────────────────────────────────────────────────
  {
    input:    'web/sol-include.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-include.umd.min.js' : 'dist/sol-include.umd.js',
      format:  'umd',
      name:    'SolInclude',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-login (auth client is bring-your-own at window.solidClientAuthn) ───
  {
    input:    'web/sol-login.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-login.umd.min.js' : 'dist/sol-login.umd.js',
      format:  'umd',
      name:    'SolLogin',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-live-edit (core + renderers/help/data bundled via static
  //    dynamic imports + inlineDynamicImports) ───────────────────────────────
  {
    input:    'web/sol-live-edit.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-live-edit.umd.min.js' : 'dist/sol-live-edit.umd.js',
      format:  'umd',
      name:    'SolLiveEdit',
      exports: 'named',
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-tabs (light-DOM, zero deps) ────────────────────────────────────────
  {
    input:    'web/sol-tabs.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-tabs.umd.min.js' : 'dist/sol-tabs.umd.js',
      format:  'umd',
      name:    'SolTabs',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-menu (light-DOM, zero deps) ────────────────────────────────────────
  {
    input:    'web/sol-menu.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-menu.umd.min.js' : 'dist/sol-menu.umd.js',
      format:  'umd',
      name:    'SolMenu',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-dropdown-button (trigger button + SolMenu popup; light-DOM, zero deps) ─
  {
    input:    'web/sol-dropdown-button.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-dropdown-button.umd.min.js' : 'dist/sol-dropdown-button.umd.js',
      format:  'umd',
      name:    'SolDropdownButton',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── menu-from-rdf (opt-in add-on: switches on `from-rdf` for the menu
  //    family; the lone rdflib pull — keeps sol-tabs/sol-menu themselves
  //    zero-dep). Load alongside the components on a page that wants RDF menus. ─
  {
    input:    'web/menu-from-rdf.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/menu-from-rdf.umd.min.js' : 'dist/menu-from-rdf.umd.js',
      format:  'umd',
      name:    'MenuFromRdf',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
      // menu-rdf → rdf-utils lazily import()s heavier RDF helpers; inline so the
      // UMD stays one self-contained file.
      inlineDynamicImports: true,
    },
  },
  // ── sol-feed (RSS/Atom viewer; rdflib stays external, only needed for ──────
  //    RDF source lists) ────────────────────────────────────────────────────
  {
    input:    'web/sol-feed.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-feed.umd.min.js' : 'dist/sol-feed.umd.js',
      format:  'umd',
      name:    'SolFeed',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
      // feed-fetch.js lazily import()s the rdflib wrapper for RDF source
      // lists; inline it so the UMD build stays one self-contained file.
      inlineDynamicImports: true,
    },
  },
  // ── sol-calendar (iCalendar viewer; ical.js is bundled in — pure ESM, no deps) ─
  {
    input:    'web/sol-calendar.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-calendar.umd.min.js' : 'dist/sol-calendar.umd.js',
      format:  'umd',
      name:    'SolCalendar',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
      // calendar-fetch.js may indirectly pull rdflib via rdf-config.js when
      // source= is a TTL config; inline so the UMD stays one file.
      inlineDynamicImports: true,
    },
  },
  // ── sol-form (generic RDF form renderer, uses solid-ui) ─────────────────────
  {
    input:    'web/sol-form.js',
    external: [...external, 'n3', 'rdf-validate-shacl'],
    plugins,
    output: {
      file:    minify ? 'dist/sol-form.umd.min.js' : 'dist/sol-form.umd.js',
      format:  'umd',
      name:    'SolForm',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked', n3: 'N3', 'rdf-validate-shacl': 'SHACLValidator' },
    },
  },
  // ── sol-pod (standalone pod browser; sol-pod-ops is an optional add-on) ────
  {
    input:    'web/sol-pod.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-pod.umd.min.js' : 'dist/sol-pod.umd.js',
      format:  'umd',
      name:    'SolPod',
      exports: 'named',
      // Bundles sol-modal (its own modal shell); sol-pod-ops / sol-solidos
      // are reached via customElements.get, so they stay out of this file.
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-pod-extras (sol-pod's companions combined: file-operations panel +
  //    WAC/ACL editor). pod-ops/wac aren't useful standalone, so they ship as
  //    one drop-in loaded alongside sol-pod. UMD: rdflib/dompurify/marked stay
  //    external globals — shared with sol-pod.umd, so no duplication. ─────────
  {
    input:    'web/sol-pod-extras.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-pod-extras.umd.min.js' : 'dist/sol-pod-extras.umd.js',
      format:  'umd',
      name:    'SolPodExtras',
      exports: 'named',
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-solidos (mashlib/SolidOS wrapper — mashlib loaded externally) ──────
  {
    input:    'web/sol-solidos.js',
    external: [...external, 'mashlib'],
    plugins,
    output: {
      file:    minify ? 'dist/sol-solidos.umd.min.js' : 'dist/sol-solidos.umd.js',
      format:  'umd',
      name:    'SolSolidos',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked', mashlib: 'Mashlib' },
    },
  },
  // ── per-component UMDs for the previously bundle-only components ───────────
  //    button/accordion/rolodex/default/modal/window/tree-edit/breadcrumb are
  //    no-export side-effect modules — the UMD just registers the tag.
  ...[
    'sol-button', 'sol-accordion', 'sol-rolodex', 'sol-default',
    'sol-modal', 'sol-window', 'sol-tree-edit', 'sol-breadcrumb',
    'sol-time', 'sol-weather', 'sol-search', 'sol-gallery',
  ].map((tag) => ({
    input:    `web/${tag}.js`,
    external,
    plugins,
    output: {
      file:    minify ? `dist/${tag}.umd.min.js` : `dist/${tag}.umd.js`,
      // PascalCase global name: sol-tree-edit → SolTreeEdit
      name:    tag.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(''),
      format:  'umd',
      exports: 'named',
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  })),
  // ── sol-settings (settings panel — wraps sol-form, so same SHACL externals) ─
  {
    input:    'web/sol-settings.js',
    external: [...external, 'n3', 'rdf-validate-shacl'],
    plugins,
    output: {
      file:    minify ? 'dist/sol-settings.umd.min.js' : 'dist/sol-settings.umd.js',
      format:  'umd',
      name:    'SolSettings',
      exports: 'named',
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked', n3: 'N3', 'rdf-validate-shacl': 'SHACLValidator' },
    },
  },
  // ── sol-full (side-effect aggregator: registers every covered component) ───
  {
    input:    'web/sol-full.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-full.umd.min.js' : 'dist/sol-full.umd.js',
      format:  'umd',
      name:    'SolFull',
      exports: 'named',
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
      // Inline sol-query's view imports so this remains one self-contained file.
      inlineDynamicImports: true,
    },
  },
  // ── sol-basic (no-RDF, html-first tier: button/dropdown-button/include/
  //    menu/tabs/accordion/rolodex + the helpers they instantiate by tag:
  //    default/modal/window). dompurify/marked stay external globals (shared,
  //    so two app bundles don't duplicate them); rdflib is stubbed out, so
  //    there is no $rdf peer. `from-rdf` is the opt-in menu-from-rdf UMD; the
  //    RDF menu editor (tree-edit/breadcrumb) is in sol-rdf. ─────────────────
  {
    input:   'web/sol-basic.js',
    external: (id) => id === 'dompurify' || id === 'marked' || id.startsWith('https://esm.sh/'),
    plugins: basicPlugins,   // rdflib stubbed out → no $rdf peer (dompurify/marked are BYO globals)
    output: {
      file:      minify
        ? 'dist/sol-basic.bundle.min.js'
        : 'dist/sol-basic.bundle.js',
      format:    'iife',
      name:      'SolBasic',
      exports:   'named',
      inlineDynamicImports: true,
      globals:   { dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // No sol-rdf IIFE bundle: the RDF/Solid-data components ship as per-component
  // UMDs (sol-login / sol-query / sol-solidos), and the solid-ui editing stack
  // (sol-form/settings/tree-edit) is ESM-only — loaded via sol-loader's `rdf`
  // capability (module bootstrap + importmap), not as a UMD bundle.

  // The widgets (time/weather/search/calendar/feed/gallery) and the pod family
  // (pod/pod-ops/wac/live-edit) ship ONLY as per-component UMDs above — each is
  // a self-contained drop-in, so there is no overall sol-widgets / sol-pods
  // group bundle. Only the two app tiers (sol-basic, sol-rdf) get an IIFE.

  // ── sol-loader (one-tag loader: injects vendor peers + bundles in order from
  //    data-bundles/data-with, and a stage-selected importmap from data-stage).
  //    The stages are baked in from external-deps.json at build time. ──────────
  {
    input:   'web/sol-loader.js',
    plugins: [injectSwcStages(), ...plugins],
    output: {
      file:   minify ? 'dist/sol-loader.min.js' : 'dist/sol-loader.js',
      format: 'iife',
    },
  },
];
