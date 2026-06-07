// Singleton wrapper around rdflib. The rest of the codebase goes through this
// class so rdflib is imported in exactly one place. Rollup treats `rdflib` as
// external (mapped to the `$rdf` UMD global); jest's moduleNameMapper maps it
// to a mock; importmaps/bundlers resolve it normally.

// Bare specifier — resolved by the consumer's importmap (CDN or local
// vendored copy) or by a bundler. Per-component UMD builds list `rdflib`
// in `external` so it stays a runtime global.
import * as _rdflib from 'rdflib';
import { register as registerService } from './services.js';

// `import * as _rdflib` exposes rdflib's named exports directly.
const _lib = _rdflib;

class Rdf {
  constructor() {
    this._store = null;    // lazy shared singleton store
    this._fetcher = null;  // fetcher bound to _store
    this._adopted = false; // a host explicitly adopted an external store (wins)
    this._loaded = new Set(); // URLs already parsed into _store (cache key)
    this._changeSubs = new Set(); // { pattern, cb, dirty } — see onChange()
    this._wiredStore = null;      // the store we've attached data callbacks to
    this._flushPending = false;   // a microtask flush is queued
  }

  // Record that `url` has been parsed into the shared store.
  markLoaded(url) { this._loaded.add(url); }
  isLoaded(url)   { return this._loaded.has(url); }

  // Term constructors
  sym(uri)                         { return _lib.sym(uri); }
  // rdflib.literal accepts either (value, langOrDatatype) — second arg
  // is the language tag if a string, or the datatype if a NamedNode —
  // or (value, lang, datatype). Pass through whichever form the caller
  // used so typed literals like "45.52"^^xsd:decimal survive.
  literal(value, langOrDatatype, datatype) {
    if (datatype !== undefined) return _lib.literal(value, langOrDatatype, datatype);
    return _lib.literal(value, langOrDatatype);
  }
  blankNode(id)                    { return _lib.blankNode(id); }

  // Stores & parsing
  graph()                          { return _lib.graph(); }
  parse(text, store, base, type)   { return _lib.parse(text, store, base, type); }
  st(s, p, o, g)                   { return _lib.st(s, p, o, g); }

  // Shared singleton store — interop point with solid-logic / solid-ui / mashlib.
  // **When solid-logic's singleton is present on `window`, that's THE store**
  // — every sol-* component, solid-ui module, mashlib, etc. point at the same
  // rdflib graph, so cross-component reads/writes are coherent and solid-ui's
  // captured-at-import-time `kb` references work without any swap dance.
  // Falls back to a freshly created graph in environments without solid-logic
  // (unit tests, headless scripts without the singleton wired up).
  get store() {
    // A host that explicitly adopted a foreign store (useStore — e.g. another
    // component library's rdflib graph handed over at runtime) wins outright,
    // so swc components share THAT graph regardless of solid-logic's singleton.
    if (this._adopted && this._store) return this._store;
    // Otherwise always re-probe so consumers reach solid-logic's singleton even
    // if an early access happened before solid-logic finished loading. Once
    // solid-logic is up, every call returns ITS store; before then, a
    // local fresh graph is used and persists until the singleton appears.
    const sl = (typeof window !== 'undefined') &&
      (window[Symbol.for('solid-logic-singleton')] || window.SolidLogic);
    if (sl?.store) {
      this._store = sl.store;
      return sl.store;
    }
    if (!this._store) this._store = _lib.graph();
    return this._store;
  }
  useStore(externalStore) {
    if (!externalStore || typeof externalStore.match !== 'function') return false;
    this._store = externalStore;
    this._fetcher = externalStore.fetcher || null;
    this._adopted = true;
    this._loaded.clear();
    this._wireChange(externalStore);   // re-point change subscribers at the adopted store
    return true;
  }

  // Subscribe to changes in the shared store, filtered by a triple PATTERN —
  // `(s, p, o)` exactly as `store.each(s, p, o)`, where any term passed as
  // null/undefined is a wildcard. `cb` is invoked (coalesced to one call per
  // microtask) whenever a statement matching the pattern is added OR removed,
  // **regardless of which library wrote it** — the callbacks live on the shared
  // rdflib graph, so a write from PodOS (or anyone) notifies an swc subscriber.
  // Returns an unsubscribe function.
  //
  // Why a pattern and not a bare "something changed": the relevance check is
  // just a match against the changed statement, so it belongs here, once, not
  // in every component. Subscriptions survive a useStore() swap because they
  // live on this Rdf instance; the data callbacks get re-attached to whatever
  // store becomes current.
  onChange(subject, predicate, object, cb) {
    const sub = { pattern: { subject, predicate, object }, cb, dirty: false };
    this._changeSubs.add(sub);
    this._wireChange(this.store);
    return () => this._changeSubs.delete(sub);
  }

  // True when the changed statement `st` matches the (possibly wildcarded)
  // pattern — the same semantics rdflib's own indexed match uses.
  _matchesPattern(p, st) {
    return (!p.subject   || (st.subject   && st.subject.equals(p.subject)))   &&
           (!p.predicate || (st.predicate && st.predicate.equals(p.predicate))) &&
           (!p.object    || (st.object    && st.object.equals(p.object)));
  }

  // Attach add/removal data callbacks to `store` once, fanning every changed
  // statement out to the pattern-matching subscribers. Idempotent per store,
  // and called again on useStore() so a swap re-wires the new graph.
  _wireChange(store) {
    if (!store || this._wiredStore === store) return;
    this._wiredStore = store;
    const onStmt = (st) => {
      let any = false;
      for (const sub of this._changeSubs) {
        if (!sub.dirty && this._matchesPattern(sub.pattern, st)) { sub.dirty = true; any = true; }
      }
      if (any) this._scheduleFlush();
    };
    if (typeof store.addDataCallback === 'function') store.addDataCallback(onStmt);
    if (typeof store.addDataRemovalCallback === 'function') store.addDataRemovalCallback(onStmt);
  }

  // Coalesce a burst of matching changes (e.g. a document parse adds thousands
  // of statements) into a single callback per subscriber on the microtask queue.
  _scheduleFlush() {
    if (this._flushPending) return;
    this._flushPending = true;
    queueMicrotask(() => {
      this._flushPending = false;
      for (const sub of this._changeSubs) {
        if (!sub.dirty) continue;
        sub.dirty = false;
        try { sub.cb(); } catch (e) { console.error('[rdf] onChange subscriber failed', e); }
      }
    });
  }
  get storeFetcher() {
    if (this._fetcher) return this._fetcher;
    if (this.store.fetcher) { this._fetcher = this.store.fetcher; return this._fetcher; }
    this._fetcher = new _lib.Fetcher(this.store);
    this.store.fetcher = this._fetcher;
    return this._fetcher;
  }

  // Fetch a document into the shared store via the shared (auth-aware) Fetcher,
  // at most once per document. Returns the shared store. This is the convenience
  // a component reaches through window.SolidWebComponents.rdf.load(url).
  async load(url) {
    const doc = String(url).split('#')[0];
    if (!this.isLoaded(doc)) {
      await this.storeFetcher.load(doc);
      this.markLoaded(doc);
    }
    return this.store;
  }

  // SPARQL
  fetcher(store, opts)             { return new _lib.Fetcher(store, opts); }
  sparqlToQuery(query, isUpdate, store) { return _lib.SPARQLToQuery(query, isUpdate, store); }
  sparqlQuery(query, opts)         { return _lib.sparqlQuery(query, opts); }

  // Capability probes
  isReady()          { return !!_lib && typeof _lib.graph === 'function'; }
  hasSparqlEngine()  { return typeof _lib.SPARQLToQuery === 'function'; }
  hasRemoteSparql()  { return typeof _lib.sparqlQuery === 'function'; }

  // Serialization
  serialize(doc, store, base, contentType) {
    return _lib.serialize(doc, store, base, contentType);
  }

  // UpdateManager — for PATCH-based edits and putBack
  get UpdateManager() { return _lib.UpdateManager; }

  // Escape hatches for the few places that need rdflib-shaped access
  // (e.g. `new rdflib.Fetcher(...)`). Prefer the methods above.
  get SPARQLToQuery() { return _lib.SPARQLToQuery; }
  get Fetcher()       { return _lib.Fetcher; }
  get NamedNode()     { return _lib.NamedNode; }
  get BlankNode()     { return _lib.BlankNode; }
  get Literal()       { return _lib.Literal; }
  get Collection()    { return _lib.Collection; }
  get Statement()     { return _lib.Statement; }
}

// Cross-bundle singleton. Every bundle (each UMD component, the app's own
// code, solid-ui's world) compiles its own copy of this module; without a
// shared instance each would mint its OWN store + storeFetcher, so e.g.
// <sol-login>'s `_integrateWithRdflib()` patch would be invisible to an app
// reading `rdf.store` from a different bundle. Publishing ONE instance on
// `window` makes the store, fetcher and loaded-set page-wide, so any app can
// just load components from sol-loader and share one coherent store — no
// bundling-from-source workaround. (Paired with the rdflib→window.$rdf shim
// so all bundles also share one rdflib *library*, for term `instanceof`.)
//
// Browser only: in Node / jest each module keeps its own instance (no `window`),
// preserving test isolation.
const _RDF_SINGLETON = Symbol.for('sol-components:rdf-singleton');
export const rdf = (typeof window !== 'undefined')
  ? (window[_RDF_SINGLETON] || (window[_RDF_SINGLETON] = new Rdf()))
  : new Rdf();
export default rdf;

// Publish the shared store as the `rdf` host-service so any component can reach
// it via window.SolidWebComponents.rdf — no import of this module required.
registerService('rdf', rdf);

// Register the broker consumer that adopts a foreign rdflib store: the loader
// invokes it for a manifest `consumes: { rdf: { call: 'rdf.useStore' } }`. (The
// loader publishes registerConsumer; absent in Node/jest, so this is guarded.)
if (typeof window !== 'undefined' && window.SolidWebComponents
    && typeof window.SolidWebComponents.registerConsumer === 'function') {
  window.SolidWebComponents.registerConsumer('rdf.useStore', function (store) { rdf.useStore(store); });
}
