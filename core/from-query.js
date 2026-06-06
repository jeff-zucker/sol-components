// core/from-query.js — the `data-from-query` capability attribute (part of the
// `sparql` capability). Makes ANY element query-driven WITHOUT pulling in the
// <sol-query> component: it runs the query through the shared engine
// (core/rdf-utils.js) and renders into the host element with the shared view
// loader. The <sol-query> element and this activator are independent peers on
// the same engine — load whichever you need.
//
//   <ul data-from-query endpoint="data.ttl" pattern="?s foaf:name ?name" view="list"></ul>
//   <div data-from-query="SELECT …" endpoint="https://pod/doc" view="./my-view.js"></div>
//
// Config attributes (endpoint, pattern, sparql, query, view, var-<name>) may be
// written bare OR `data-`-prefixed (data-endpoint, …, data-var-<name>) to keep the
// markup spec-valid HTML; bare wins if both are given. `data-from-query` is the trigger.
//
// HTML views (table/list/dl/…) render in place; a URL view (`view="…/view.js"`)
// gets the W3C SPARQL 1.1 Query Results JSON via render(container, data, el). The
// data is also set on `el.swcData`.
import { activate } from './activate.js';
import { rdf } from './rdf.js';
import { getAuthFetch } from './auth-fetch.js';
import { substituteVariables, assertSafeQuery } from './sparql-safety.js';
import { execSparql, loadRdfStore, parsePatternParts, matchStore, fetchQueryFromRdf } from './rdf-utils.js';
import { SparqlResultsRenderer, defaultStylesSheet } from '../web/utils/sol-query-ui.js';
import { loadBuiltinView, PREPROCESS_VIEWS } from '../web/utils/sol-query-views.js';

// Config attributes may be written bare (`endpoint`) or `data-`-prefixed
// (`data-endpoint`) — the latter keeps the host markup spec-valid HTML. Bare
// wins when both are present. (`data-from-query` itself stays the trigger.)
function attr(el, name) {
  const v = el.getAttribute(name);
  return v != null ? v : el.getAttribute('data-' + name);
}
function readVars(el) {
  const vars = {};
  // `var-foo` or `data-var-foo`; data-* is read first so a bare `var-foo` wins.
  for (const a of Array.from(el.attributes)) if (a.name.indexOf('data-var-') === 0) vars[a.name.slice(9)] = a.value;
  for (const a of Array.from(el.attributes)) if (a.name.indexOf('var-') === 0) vars[a.name.slice(4)] = a.value;
  return vars;
}
function endpointsOf(el) {
  const raw = attr(el, 'endpoint');
  return raw ? raw.trim().split(/[\s,]+/).filter(Boolean) : [];
}
function isStoredRef(s) { return !/\s/.test(s) && /^https?:\/\/|^\/|^\.\.?\//.test(s.trim()); }

// Build the W3C SPARQL Results JSON for the element's query config (same engine
// the <sol-query> element uses: SPARQL via execSparql, triple-pattern via rdflib).
async function buildData(el) {
  const eps = endpointsOf(el);
  if (!eps.length) throw new Error('data-from-query needs an `endpoint`');
  const pattern = attr(el, 'pattern');
  const sparql = attr(el, 'sparql') || attr(el, 'query') ||
    (pattern ? '' : (el.getAttribute('data-from-query') || ''));

  if (sparql) {
    let q = isStoredRef(sparql) ? await fetchQueryFromRdf(sparql) : sparql;
    q = substituteVariables(q, readVars(el));
    assertSafeQuery(q);
    const target = eps.length > 1 ? eps : eps[0];
    const fetchUrl = Array.isArray(target) ? target[0] : target;
    return execSparql(q, target, getAuthFetch(fetchUrl));
  }
  if (pattern) {
    const store = await loadRdfStore(eps[0]);
    const [s, p, o] = parsePatternParts(pattern, rdf, {}, eps[0]);
    return matchStore(store, s, p, o);
  }
  throw new Error('data-from-query needs `sparql`, `query`, `pattern`, or a query value');
}

let _styled = false;
function ensureStyles() {
  if (_styled || typeof document === 'undefined' || !document.adoptedStyleSheets) return;
  try { document.adoptedStyleSheets = [...document.adoptedStyleSheets, defaultStylesSheet]; _styled = true; } catch (e) {}
}

async function renderInto(el, data) {
  el.swcData = data;                                  // W3C JSON, same as the component would expose
  const view = attr(el, 'view') || 'table';
  if (/^https?:\/\/|^\.\.?\//.test(view)) {            // custom view module
    const mod = await import(new URL(view, document.baseURI).href);
    const fn = mod.render ?? mod.default;
    el.innerHTML = '';
    if (typeof fn === 'function') await fn(el, data, el);
    return;
  }
  const fn = await loadBuiltinView(view);
  if (!fn) { el.innerHTML = `<div class="error">Unknown view: ${view}</div>`; return; }
  if (PREPROCESS_VIEWS.has(view)) {
    ensureStyles();
    new SparqlResultsRenderer(el).renderResults(data, fn, {});
  } else {
    el.innerHTML = '';
    await fn(el, data, el);
  }
}

activate('[data-from-query]', (el) => {
  if (el.localName === 'sol-query') return;            // the element handles itself
  buildData(el)
    .then((data) => renderInto(el, data))
    .catch((e) => { el.innerHTML = `<div class="error">${(e && e.message) || e}</div>`; console.error('[data-from-query]', e); });
});
