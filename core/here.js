// Resolve a sibling module URL that works in both ESM and IIFE/UMD contexts.
//
// Background: `import.meta.url` is the natural way to locate sibling modules,
// but esbuild's IIFE output (used by podz when it bundles sol-components
// source into a single script) flattens `import.meta.url` to `undefined`.
// rollup's UMD output is the same. Result: dynamic-import paths like
// `new URL('./sibling.js', import.meta.url)` silently break in those bundles.
//
// `siblingUrl(name, importMetaUrl)` accepts the caller's `import.meta.url`
// (which the bundler may eat) and falls back through:
//   1. import.meta.url             — when present (real ESM in the browser)
//   2. document.currentScript.src  — when the host script is a classic <script>
//   3. document.baseURI            — last-resort: the page's base URL
//
// Callers pass `import.meta.url` explicitly so the bundler can statically see
// the use-site and substitute when it can; the fallback covers the rest.

export function siblingUrl(name, importMetaUrl) {
  // import.meta.url, when present, is always best.
  if (importMetaUrl) {
    try { return new URL(name, importMetaUrl).href; } catch {}
  }
  // Inside a classic <script> tag we have document.currentScript.
  if (typeof document !== 'undefined') {
    const cur = document.currentScript;
    if (cur && cur.src) {
      try { return new URL(name, cur.src).href; } catch {}
    }
    // Final fallback: resolve against the page itself.
    try { return new URL(name, document.baseURI).href; } catch {}
  }
  return name;
}
