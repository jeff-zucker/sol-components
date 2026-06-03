import resolve  from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json     from '@rollup/plugin-json';
import terser   from '@rollup/plugin-terser';

const minify = !!process.env.MINIFY;

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
  // ── sol-pod-ops (optional file-operations panel — load alongside sol-pod) ──
  {
    input:    'web/sol-pod-ops.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-pod-ops.umd.min.js' : 'dist/sol-pod-ops.umd.js',
      format:  'umd',
      name:    'SolPodOps',
      exports: 'named',
      inlineDynamicImports: true,
      globals: { rdflib: '$rdf', dompurify: 'DOMPurify', marked: 'marked' },
    },
  },
  // ── sol-wac (WAC/ACL editor, light-DOM) ────────────────────────────────────
  {
    input:    'web/sol-wac.js',
    external,
    plugins,
    output: {
      file:    minify ? 'dist/sol-wac.umd.min.js' : 'dist/sol-wac.umd.js',
      format:  'umd',
      name:    'SolWac',
      exports: 'named',
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
  // ── sol-basic (curated subset: include/button/menu/login/form/settings +
  //    the helpers those six instantiate by tag: accordion/modal/window/
  //    tree-edit). dompurify/marked/n3/rdf-validate-shacl are bundled IN;
  //    rdflib stays the lone BYO peer ($rdf global). solid-ui/solid-logic/
  //    auth are runtime globals the components probe — never imported, so
  //    there is nothing to externalize for them. ─────────────────────────────
  {
    input:   'web/sol-basic.js',
    external: (id) => id === 'rdflib' || id.startsWith('https://esm.sh/'),
    plugins: bundlePlugins,
    output: {
      file:      minify
        ? 'dist/sol-basic.bundle.min.js'
        : 'dist/sol-basic.bundle.js',
      format:    'iife',
      name:      'SolBasic',
      exports:   'named',
      inlineDynamicImports: true,
      globals:   { rdflib: '$rdf' },
    },
  },
  // ── all-in-one bundle: every component, rdflib externalized as $rdf ─────────
  // rdflib is treated as a runtime peer (BYO), shipped as
  // `dist/vendor/rdflib.umd.js` which self-publishes `window.$rdf`. Page
  // authors load that UMD via `<script>` tag *before* this bundle. Keeps
  // a single rdflib instance on the page for sol-pod / sol-query / mashlib
  // / solid-ui / solid-logic to share.
  {
    input:   'web/solid-web-components.bundle.js',
    external: (id) => id === 'rdflib' || id.startsWith('https://esm.sh/'),
    plugins: bundlePlugins,
    output: {
      file:      minify
        ? 'dist/solid-web-components.bundle.min.js'
        : 'dist/solid-web-components.bundle.js',
      format:    'iife',
      name:      'SolidWebComponents',
      exports:   'named',
      inlineDynamicImports: true,
      globals:   { rdflib: '$rdf' },
    },
  },
  // ── podz-extras sibling bundle: components used by podz (and similar
  //    multi-pod hosts) that aren't in the lean public bundle above.
  //    Load *after* the core bundle so the core's already-defined custom
  //    elements aren't redefined. rdflib is BYO here too.
  {
    input:   'web/podz-extras.bundle.js',
    external: (id) => id === 'rdflib' || id.startsWith('https://esm.sh/'),
    plugins: bundlePlugins,
    output: {
      file:      minify
        ? 'dist/podz-extras.bundle.min.js'
        : 'dist/podz-extras.bundle.js',
      format:    'iife',
      name:      'PodzExtras',
      exports:   'named',
      inlineDynamicImports: true,
      globals:   { rdflib: '$rdf' },
    },
  },
];
