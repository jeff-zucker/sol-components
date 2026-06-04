/**
 * <sol-query> — Query and display RDF / Linked Data from plain HTML.
 *
 * Supports triple patterns, inline SPARQL, stored SPARQL queries, and
 * CSS-selector extraction from RDFa documents. Results render via
 * pluggable views (table, dl, list, accordion, anchorlist, auto-complete,
 * menu, rolodex, select, tabs).
 *
 * @element sol-query
 * @attr {string} endpoint - URL of an RDF document or SPARQL endpoint. May be
 *   a comma- or whitespace-separated list of URLs; when more than one is
 *   given, the query is federated across all sources via Comunica.
 * @attr {string} pattern - triple pattern (e.g. "?s ?p ?o") or CSS selector
 * @attr {string} sparql - inline SPARQL string or URL of a stored SPARQL query
 * @attr {string} query - alias for sparql
 * @attr {string} view - result view: table (default), dl, list, accordion,
 *   anchorlist, auto-complete, menu, rolodex, select, tabs
 * @attr {string} var-* - bind SPARQL variables (e.g. var-name="Alice")
 *
 * @fires sol-deref — detail: { uri }; cancelable, default navigates endpoint
 * @fires sol-select — detail: { value, row, index }; from select/auto-complete/rolodex views
 *
 * @example
 * <sol-query endpoint="https://example.org/data.ttl"></sol-query>
 * <sol-query endpoint="data.ttl" pattern="?s foaf:name ?name"></sol-query>
 * <sol-query endpoint="https://dbpedia.org/sparql"
 *            sparql="SELECT ?s ?label WHERE { ?s a dbo:City; rdfs:label ?label } LIMIT 10"
 *            view="table"></sol-query>
 */
import {
  fetchQueryFromRdf,
  loadRdfStore,
  matchStore,
  parsePatternParts,
  pivotSubjectsToRows,
  promoteDisplayColumns,
  patternVarNames,
  storeToResults,
  expandBnodes,
  runQuery,
  execSparql,
  queryHtmlWithSelector,
  knownPrefixesAsSparql,
} from '../core/rdf-utils.js';
import { ComunicaSparqlAdapter } from '../core/utils.js';
import { assertSafeQuery, sanitizeVarValue, substituteVariables } from '../core/sparql-safety.js';
import { getAuthFetch } from '../core/auth-fetch.js';
import { rdf } from '../core/rdf.js';
import { SparqlResultsRenderer } from './utils/sol-query-ui.js';
import { loadBuiltinView } from './utils/sol-query-views.js';
import { TriplePatternValidator, TriplePatternParser } from './utils/sol-query-triple-patterns.js';
import { define } from '../core/define.js';
import { adopt } from '../core/adopt.js';
import { CSS as QUERY_CSS, sheet as querySheet } from './styles/sol-query-css.js';

// Built-in views are loaded on demand from a module shared with the
// data-from-query activator (so the attribute and the element stay decoupled).

/**
 * Query and display RDF / Linked Data from plain HTML.
 *
 * Supports triple patterns, inline/stored SPARQL, and CSS-selector
 * extraction from RDFa documents. Results render via pluggable views.
 *
 * @class SolQuery
 * @extends HTMLElement
 * @attr {string} endpoint - URL of an RDF document or SPARQL endpoint. May be
 *   a comma- or whitespace-separated list of URLs; when more than one is
 *   given, the query is federated across all sources via Comunica.
 * @attr {string} pattern - triple pattern or CSS selector (alias: wanted)
 * @attr {string} sparql - inline SPARQL string or URL of a stored query
 * @attr {string} query - alias for sparql
 * @attr {string} view - result view: table|dl|list|accordion|anchorlist|auto-complete|menu|rolodex|select|tabs
 * @fires sol-deref - detail: { uri }; cancelable, default navigates endpoint
 * @fires sol-select - detail: { value, row, index }; from select/auto-complete/rolodex views
 */
class SolQuery extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.render();
  }

  static get observedAttributes() {
    return ['endpoint', 'pattern', 'wanted', 'sparql', 'query', 'view'];
  }

  connectedCallback() {
    if (this.isConnected) this.initializeQuery();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.isConnected) {
      if (['endpoint', 'pattern', 'wanted', 'sparql', 'query'].includes(name) || name.startsWith('var-')) {
        this.initializeQuery();
      }
    }
  }

  // `query` is accepted as an alias for `sparql` so authors can write either.
  _sparqlAttr() {
    return this.getAttribute('sparql') ?? this.getAttribute('query');
  }

  // `wanted` is accepted as an alias for `pattern`.
  _patternAttr() {
    return this.getAttribute('pattern') ?? this.getAttribute('wanted');
  }

  render() {
    this.shadowRoot.innerHTML = `
      <div class="container" role="region" aria-live="polite" aria-label="Query results">
        <div class="loading" role="status">Ready to execute query...</div>
      </div>
    `;
    adopt(this.shadowRoot, { sheet: querySheet, css: QUERY_CSS });
    const container = this.shadowRoot.querySelector('.container');
    this.renderer = new SparqlResultsRenderer(container);

    // ── Dereference: click a URI cell to load it as a new query (13) ──────────
    // Ctrl/Cmd/Shift+click still opens the link in a new tab normally.
    container.addEventListener('click', e => {
      const a = e.target.closest('a[data-uri]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      const uri = a.dataset.uri;
      const ev = new CustomEvent('sol-deref', {
        bubbles: true, composed: true, cancelable: true, detail: { uri },
      });
      if (this.dispatchEvent(ev)) {
        this.removeAttribute('sparql');
        this.removeAttribute('pattern');
        this.removeAttribute('wanted');
        this.setAttribute('endpoint', uri);
      }
    });
  }

  async initializeQuery() {
    const endpoints = this._endpoints();
    if (!endpoints.length) { this._reportError('config', 'No endpoint provided'); return; }

    // The single-endpoint default-query path uses a #fragment to filter the
    // store to one subject — an rdflib trick that doesn't carry over to
    // Comunica federation. Reject rather than silently fetch the doc and
    // return all of its triples.
    if (endpoints.length > 1 && endpoints.some(e => e.includes('#'))) {
      this._reportError('config', 'Subject fragments are not supported in federated queries');
      return;
    }

    if (this.hasAttribute('sparql') || this.hasAttribute('query')) {
      await this.handleSparqlQuery();
    } else if (this.hasAttribute('pattern') || this.hasAttribute('wanted')) {
      await this.handleTriplePattern();
    } else {
      await this.handleDefaultQuery();
    }
  }

  // The `endpoint` attribute may carry one URL or a list separated by
  // commas/whitespace. Multi-endpoint queries are federated by Comunica.
  _endpoints() {
    const raw = this.getAttribute('endpoint') || '';
    return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  }

  // Render the error in the shadow DOM and dispatch a bubbling sol-error
  // event so page-level orchestration can react.
  _reportError(kind, message) {
    this.renderer.showError(message);
    this.dispatchEvent(new CustomEvent('sol-error', {
      bubbles: true, composed: true,
      detail: { source: 'sol-query', kind, message },
    }));
  }

  // ─── SPARQL query (inline text or URL pointing to RDF file) ────────────────
  async handleSparqlQuery() {
    const sparqlAttr = this._sparqlAttr();
    // A stored-query reference is a bare URL: no whitespace, starts with http(s):// or a path.
    // Everything else — including all valid SPARQL text — is treated as inline.
    const isStoredRef = !/\s/.test(sparqlAttr) && /^https?:\/\/|^\/|^\.\.?\//.test(sparqlAttr.trim());
    if (!isStoredRef) {
      this.executeQuery(sparqlAttr);
    } else {
      this.renderer.showLoading('Loading query from RDF file...');
      try {
        const query = await fetchQueryFromRdf(sparqlAttr);
        if (query) {
          try { assertSafeQuery(query); } catch (err) { this._reportError('sparql-unsafe', err.message); return; }
          this.executeQuery(query);
        } else this._reportError('sparql-empty', 'No query found in RDF file');
      } catch (err) {
        this._reportError('sparql-load', `Failed to load query: ${err.message}`);
      }
    }
  }

  // ─── Triple pattern / CSS selector ───────────────────────────────────────────
  async handleTriplePattern() {
    const pattern   = this._patternAttr();
    const endpoints = this._endpoints();

    // Multi-endpoint federation goes through Comunica. CSS-selector / HTML-RDFa
    // and the rdflib bnode-expansion / ?s-pivot features only apply to a single
    // local store, so they stay on the legacy path below.
    if (endpoints.length > 1) {
      return this._handleTriplePatternFederated(pattern, endpoints);
    }
    const endpoint = endpoints[0];

    this.renderer.showLoading('Loading…');
    try {
      const store = await loadRdfStore(endpoint, this._authFetch(endpoint));

      if (store._isHtml) {
        const validation = TriplePatternValidator.validate(pattern);
        if (!validation.valid) {
          const results = queryHtmlWithSelector(store._rawHtml, endpoint, pattern);
          if (!results.results.bindings.length) { this.renderer.showError('No elements matched selector'); return; }
          return this._dispatchResults(results);
        }
      } else {
        const validation = TriplePatternValidator.validate(pattern);
        if (!validation.valid) { this._reportError('pattern-invalid', validation.error); return; }
      }

      const rdflib = rdf;
      const [s, p, o] = parsePatternParts(pattern, rdflib, {}, endpoint);
      const names = patternVarNames(pattern);

      // When only the subject is a variable (e.g. `?person schema:gender "female"`),
      // widen each matched subject into a row with one column per predicate so
      // authors get a useful property table instead of a single-column list.
      let results;
      if (!s && p && o) {
        const stmts = store.match(null, p, o, null) || [];
        const seen = new Set();
        const subjects = [];
        for (const st of stmts) {
          if (!seen.has(st.subject.value)) {
            seen.add(st.subject.value);
            subjects.push(st.subject);
          }
        }
        results = pivotSubjectsToRows(store, subjects, names.s || 's');
      } else {
        results = expandBnodes(store, matchStore(store, s, p, o, names));
      }
      results = promoteDisplayColumns(results, names.s || 's');
      if (!results.results.bindings.length) { this.renderer.showError('No matching triples found'); return; }
      this._dispatchResults(results);
    } catch (err) {
      this._reportError('query-failed', err.message);
    }
  }

  // Federate a triple pattern across multiple sources via Comunica. The
  // pattern is wrapped in a SPARQL SELECT and run with `sources: endpoints`,
  // so any mix of SPARQL endpoints and RDF documents is queried as one graph.
  async _handleTriplePatternFederated(pattern, endpoints) {
    const validation = TriplePatternValidator.validate(pattern);
    if (!validation.valid) { this._reportError('pattern-invalid', validation.error); return; }

    if (!ComunicaSparqlAdapter.getComunicaEngine()) {
      this._reportError('config', 'Multiple endpoints require Comunica');
      return;
    }

    let where;
    try { where = new TriplePatternParser(endpoints[0]).parse(pattern); }
    catch (err) { this._reportError('pattern-invalid', err.message); return; }
    const sparql = `${knownPrefixesAsSparql()}\n${where}`;

    this.renderer.showLoading('Loading…');
    try {
      let results = await execSparql(sparql, endpoints, this._authFetch(endpoints[0]));
      const names = patternVarNames(pattern);
      results = promoteDisplayColumns(results, names.s || 's');
      if (!results.results.bindings.length) { this.renderer.showError('No matching triples found'); return; }
      this._dispatchResults(results);
    } catch (err) {
      this._reportError('query-failed', err.message);
    }
  }

  // ─── Default: load store; if endpoint has a #fragment filter to that subject ──
  async handleDefaultQuery() {
    const endpoints = this._endpoints();
    if (endpoints.length > 1) {
      // Federated default: stream all triples from every source via Comunica.
      // The single-source #fragment filter and bnode-expansion don't apply.
      if (!ComunicaSparqlAdapter.getComunicaEngine()) {
        this._reportError('config', 'Multiple endpoints require Comunica');
        return;
      }
      this.renderer.showLoading('Loading RDF data…');
      try {
        const sparql = 'SELECT ?s ?p ?o WHERE { ?s ?p ?o }';
        let results = await execSparql(sparql, endpoints, this._authFetch(endpoints[0]));
        if (!results.results.bindings.length) { this.renderer.showError('No RDF data found at endpoints'); return; }
        this._dispatchResults(promoteDisplayColumns(results, 's'));
      } catch (err) {
        this.showDiagnostics(err);
      }
      return;
    }
    const endpoint = endpoints[0];
    this.renderer.showLoading('Loading RDF data…');
    try {
      const docUrl = endpoint.includes('#') ? endpoint.split('#')[0] : endpoint;
      const store   = await loadRdfStore(docUrl, this._authFetch(docUrl));
      let results;
      const isSubjectQuery = endpoint.includes('#');
      if (isSubjectQuery) {
        const rdflib = rdf;
        results = matchStore(store, rdflib.sym(endpoint), null, null);
      } else {
        // Pivot by subject: one row per subject, columns per predicate —
        // reads as a property table rather than a flat list of triples.
        const stmts = typeof store.match === 'function' ? store.match(null, null, null) : [];
        const seen = new Set();
        const subjects = [];
        for (const st of stmts) {
          if (!seen.has(st.subject.value)) {
            seen.add(st.subject.value);
            subjects.push(st.subject);
          }
        }
        results = pivotSubjectsToRows(store, subjects, 's');
      }
      results = expandBnodes(store, results);
      if (!results.results.bindings.length) {
        this.renderer.showError(store._isHtml ? 'No RDFa found in HTML page' : 'No RDF data found at endpoint');
        return;
      }
      if (isSubjectQuery) {
        this._renderSubject(results);
      } else {
        this._dispatchResults(promoteDisplayColumns(results, 's'));
      }
    } catch (err) {
      this.showDiagnostics(err);
    }
  }

  // Single-subject view: H2 banner with name/label/title, then one row per
  // predicate ("field value") — rdf:type first, other properties after.
  // Rendered inline so every row is styled the same — no table header,
  // no promoted <dt>, no special treatment for the type row.
  _renderSubject(results) {
    const NAME_PREDS = [
      'http://xmlns.com/foaf/0.1/name',
      'https://schema.org/name',
      'http://schema.org/name',
      'http://purl.org/dc/terms/title',
      'http://purl.org/dc/elements/1.1/title',
      'http://www.w3.org/2000/01/rdf-schema#label',
    ];
    const TYPE_PRED = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const shortName = uri => (uri || '').replace(/.*[/#]([^/#]+)\/?$/, '$1') || uri;

    const bindings = results.results.bindings;
    const nameRow  = bindings.find(r => NAME_PREDS.includes(r.p?.value));
    const rest     = nameRow ? bindings.filter(r => r !== nameRow) : bindings;
    const typeRows = rest.filter(r => r.p?.value === TYPE_PRED);
    const others   = rest.filter(r => r.p?.value !== TYPE_PRED);
    const ordered  = [...typeRows, ...others];

    const container = this.shadowRoot.querySelector('.container');
    container.innerHTML = '';

    if (nameRow?.o?.value) {
      const h2 = document.createElement('h2');
      h2.className = 'sol-subject-header';
      h2.textContent = nameRow.o.value;
      container.appendChild(h2);
    }

    const dl = document.createElement('dl');
    for (const row of ordered) {
      const dd = document.createElement('dd');
      const label = document.createElement('span');
      label.className = 'dl-field';
      label.textContent = `${shortName(row.p?.value)} `;
      dd.appendChild(label);

      const value = document.createElement('span');
      value.className = 'dl-value';
      this._appendCell(value, row.o);
      dd.appendChild(value);
      dl.appendChild(dd);
    }
    container.appendChild(dl);
  }

  _appendCell(parent, cell) {
    if (!cell) return;
    if (cell.type === 'uri') {
      const shortName = uri => (uri || '').replace(/.*[/#]([^/#]+)\/?$/, '$1') || uri;
      const a = document.createElement('a');
      a.href = cell.value;
      a.title = cell.value;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.dataset.uri = cell.value;
      a.textContent = shortName(cell.value);
      parent.appendChild(a);
    } else if (cell.type === 'multi') {
      cell.values.forEach((v, i) => {
        if (i > 0) parent.appendChild(document.createTextNode(', '));
        this._appendCell(parent, v);
      });
    } else {
      parent.appendChild(document.createTextNode(cell.value ?? ''));
    }
  }

  // ─── Dispatch results through built-in renderer or custom view module ──────
  async _dispatchResults(results, options = {}) {
    const view = this.getAttribute('view') || 'table';

    // Custom view by URL: dynamic import, call render(container, data)
    if (/^https?:\/\/|^\.\/|^\.\.\/|^\//.test(view)) {
      await this._loadAndRenderView(view, results, /* byUrl */ true);
      return;
    }

    // Built-in views are imported on demand. The all-in-one Rollup bundle
    // inlines these dynamic imports at build time; ESM/importmap consumers
    // pay only for the views they actually use.
    let fn;
    try {
      fn = await loadBuiltinView(view);
    } catch (err) {
      this._reportError('view-load', `Failed to load view "${view}": ${err.message}`);
      return;
    }
    if (!fn) {
      this._reportError('view-unknown', `Unknown view: ${view}`);
      return;
    }

    // Table, dl, list get preprocessing (pivot s/p/o, group predicates, scalar display)
    if (view === 'table' || view === 'dl' || view === 'list') {
      this.renderer.renderResults(results, fn, options);
      return;
    }

    const container = this.shadowRoot.querySelector('.container');
    container.innerHTML = '';
    try { await fn(container, results, this); }
    catch (err) { this._reportError('view-render', `View "${view}" error: ${err.message}`); }
  }

  async _loadAndRenderView(url, results, byUrl, viewName = null) {
    const container = this.shadowRoot.querySelector('.container');
    container.innerHTML = '<div class="loading">Loading view…</div>';
    try {
      const mod = await import(/* @vite-ignore */ url);
      const fn  = mod.render ?? mod.default;
      if (typeof fn !== 'function')
        throw new Error(`Module must export render(container, data)`);
      container.innerHTML = '';
      fn(container, results, this);
    } catch (err) {
      const label = byUrl ? 'Custom view' : `View "${viewName}"`;
      this._reportError('view-render', `${label} error: ${err.message}`);
    }
  }

  // ─── SPARQL execution (with adapter fallback chain) ────────────────────────
  getVariables() {
    const vars = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith('var-')) vars[attr.name.slice(4)] = attr.value;
    }
    return vars;
  }

  substituteVariables(query) {
    return substituteVariables(query, this.getVariables());
  }

  async executeQuery(query) {
    if (!query) { this._reportError('config', 'No query provided'); return; }
    let processed;
    try {
      processed = this.substituteVariables(query);
      assertSafeQuery(processed);
    } catch (err) {
      this._reportError('sparql-unsafe', err.message);
      return;
    }
    const endpoints = this._endpoints();
    if (!endpoints.length) { this._reportError('config', 'No endpoint provided'); return; }
    const target = endpoints.length > 1 ? endpoints : endpoints[0];
    this.renderer.showLoading();
    try {
      const results = await this.fetchResults(processed, target);
      await this._dispatchResults(results);
    } catch (err) {
      this._reportError('query-failed', err.message);
    }
  }

  fetchResults(query, endpoint) {
    const fetchUrl = Array.isArray(endpoint) ? endpoint[0] : endpoint;
    return execSparql(query, endpoint, this._authFetch(fetchUrl));
  }

  // Resolve an authenticated fetch for `url`. The `login` attribute, when
  // set, is a CSS selector for a specific <sol-login> element (matches the
  // sol-pod / sol-pod-ops / sol-wac convention). Otherwise getAuthFetch
  // walks the document and uses the first <sol-login> on the page; falls
  // back to the global fetch when none is logged in.
  _authFetch(url) {
    const sel = this.getAttribute('login');
    const el  = sel ? document.querySelector(sel) : null;
    return getAuthFetch(url, { element: el || undefined });
  }

  // ─── Instance API ──────────────────────────────────────────────────────────
  setEndpoint(endpoint)  { this.setAttribute('endpoint', endpoint); }
  setPattern(triplePattern) { this.setAttribute('pattern', triplePattern); }
  setWanted(triplePattern) { this.setPattern(triplePattern); }
  setSparql(sparql)      { this.setAttribute('sparql', sparql); }
  setVariable(n, v)      { this.setAttribute(`var-${n}`, v); }
  setVariables(obj)      { for (const [k, v] of Object.entries(obj)) this.setVariable(k, v); }

  // ─── Static API ────────────────────────────────────────────────────────────
  // Returns a plain JS array of objects, or a scalar for 1×1 results.
  // Example:
  //   const rows = await SolQuery.run({ endpoint, pattern: '?s foaf:name ?name' });
  //   const name = await SolQuery.run({ endpoint, sparql: 'SELECT ?n WHERE{...}', vars: ['n'] });
  static run(opts) { return runQuery(opts); }

  // ─── Diagnostics ───────────────────────────────────────────────────────────
  showDiagnostics(err) {
    this._reportError('rdf-load', `Failed to load RDF: ${err.message}`);
  }
}

define('sol-query', SolQuery);
export { SolQuery };
