// Shared registry of components that can consume a ui:Menu RDF document via
// `from-rdf` (sol-tabs, sol-menu, and SolMenu subclasses like sol-dropdown-button).
//
// Kept deliberately rdflib-free: a base component registers itself here at module
// load and otherwise stays declarative-only. The opt-in `web/menu-from-rdf.js`
// add-on calls installFromRdfLoader() with the rdflib-backed loader; we then set
// it on each consumer's static `fromRdfLoader`. Without that add-on imported,
// `from-rdf` is inert and rdflib never enters the module graph.
//
// The registry lives on a Symbol.for() global (mirroring the solid-logic store
// singleton) so a single page shares ONE registry even when the components and
// the add-on arrive as separately-built UMD bundles, each with its own inlined
// copy of this module. Wiring is order-independent: register-after-install and
// install-after-register both end up wired.

const KEY = Symbol.for('sol-components.menu-consumers');
const reg = (globalThis[KEY] ||= { consumers: new Set(), loader: null, pending: new Set() });

export function registerMenuConsumer(klass) {
  reg.consumers.add(klass);
  if (reg.loader) klass.fromRdfLoader = reg.loader;   // add-on already active
}

// Called by a component from `_loadFromRdf` when no loader is installed yet:
// the element parks itself and renders nothing for now. If/when the add-on
// arrives it is driven via reload() — so activation is order-independent (the
// add-on may load before OR after the component, sync, deferred or as ESM).
// Returns true when parked (caller should return), false if a loader is ready.
export function deferUntilLoader(el) {
  if (reg.loader) return false;
  reg.pending.add(el);
  return true;
}

export function installFromRdfLoader(loader) {
  reg.loader = loader;
  for (const klass of reg.consumers) klass.fromRdfLoader = loader;
  const waiting = [...reg.pending];
  reg.pending.clear();
  for (const el of waiting) { try { el.reload?.(); } catch { /* el gone / not ready */ } }
}
