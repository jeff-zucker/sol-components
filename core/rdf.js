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
    this._loaded = new Set(); // URLs already parsed into _store (cache key)
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
    // Always re-probe so consumers reach solid-logic's singleton even if
    // an early access happened before solid-logic finished loading. Once
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
    this._loaded.clear();
    return true;
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
const _RDF_SINGLETON = Symbol.for('solid-web-components:rdf-singleton');
export const rdf = (typeof window !== 'undefined')
  ? (window[_RDF_SINGLETON] || (window[_RDF_SINGLETON] = new Rdf()))
  : new Rdf();
export default rdf;

// Publish the shared store as the `rdf` host-service so any component can reach
// it via window.SolidWebComponents.rdf — no import of this module required.
registerService('rdf', rdf);
