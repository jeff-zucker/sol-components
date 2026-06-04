import terser from '@rollup/plugin-terser';

const minify = !!process.env.MINIFY;

// All-ESM: the components ship as SOURCE modules (web/*.js) and resolve via the
// importmap, so there are NO UMD bundles to build — rollup builds only the
// loader. The loader is library-agnostic: it bakes in NOTHING about swc and
// learns everything (importmap + capabilities) from its sibling default
// manifest at runtime, `dist/sol-loader.manifest.json` (produced by
// tools/build-importmaps.mjs). So this config just bundles + minifies it.

export default [
  {
    input:   'web/sol-loader.js',
    plugins: minify ? [terser()] : [],
    output: {
      file:   minify ? 'dist/sol-loader.min.js' : 'dist/sol-loader.js',
      format: 'iife',
    },
  },
];
