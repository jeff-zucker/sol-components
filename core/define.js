// Idempotent wrapper around customElements.define. Prevents a throw when the
// same tag is registered twice — e.g. when a page loads both the all-in-one
// bundle and a per-component UMD build, or when a module is re-evaluated by
// a hot-reloader.
export function define(name, klass) {
  if (typeof customElements === 'undefined') return;
  const existing = customElements.get(name);
  if (existing) {
    if (existing !== klass && !window.__SolSuppressDefineWarn) {
      console.warn(`[sol-components] <${name}> already registered; keeping the existing definition.`);
    }
    return;
  }
  customElements.define(name, klass);
}
