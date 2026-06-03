import terser   from '@rollup/plugin-terser';
import { readFileSync } from 'node:fs';

const minify = !!process.env.MINIFY;

// All-ESM: the components ship as SOURCE modules (web/*.js) and resolve via the
// importmap, so there are NO UMD bundles to build — rollup builds only the
// loader. Coherence is automatic (the importmap dedupes `rdflib` to one module).

// Bake the generated importmaps (dist/importmap-{local,cdn}.json) and the
// manifest (dist/swc.manifest.json) into the loader. The importmap paths are
// dist/-relative (./vendor, ../web); convert their leading ./ and ../ to the
// `__BASE__` placeholder the loader resolves to its own dir at runtime. CDN
// (https) entries pass through. Source of truth: tools/build-importmaps.mjs.
function loaderDefaults() {
  const toBase = (v) =>
    v.startsWith('./')  ? '__BASE__' + v.slice(2) :
    v.startsWith('../') ? '__BASE__' + v :
    v;                                            // https://… etc — leave
  const bake = (file) => {
    const { imports } = JSON.parse(readFileSync(`dist/${file}`, 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(imports)) out[k] = toBase(v);
    return { imports: out };
  };
  return {
    importmaps: { local: bake('importmap-local.json'), cdn: bake('importmap-cdn.json') },
    manifest: JSON.parse(readFileSync('dist/swc.manifest.json', 'utf8')),
  };
}

// Replace the `__SWC_IMPORTMAPS__` / `__SWC_MANIFEST__` tokens in
// web/sol-loader.js with the baked defaults.
const injectSwcDefaults = () => ({
  name: 'inject-swc-loader-defaults',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('web/sol-loader.js')) return null;
    const { importmaps, manifest } = loaderDefaults();
    return {
      code: code
        .replace(/__SWC_IMPORTMAPS__/g, JSON.stringify(importmaps))
        .replace(/__SWC_MANIFEST__/g, JSON.stringify(manifest)),
      map: null,
    };
  },
});

export default [
  {
    input:   'web/sol-loader.js',
    plugins: minify ? [injectSwcDefaults(), terser()] : [injectSwcDefaults()],
    output: {
      file:   minify ? 'dist/sol-loader.min.js' : 'dist/sol-loader.js',
      format: 'iife',
    },
  },
];
