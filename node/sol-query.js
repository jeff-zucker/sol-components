// Node.js version of sol-query — same options as the web component,
// returns plain JS data instead of rendering HTML.
//
// Usage:
//   import { solQuery } from 'sol-components/node';
//   const data = await solQuery({ endpoint, sparql: 'SELECT ...' });
//   const data = await solQuery({ endpoint, pattern: '?s foaf:name ?o' });
//   const data = await solQuery({ endpoint, sparql: 'SELECT ...', vars: { name: 'Alice' } });

import * as rdflib from 'rdflib';
import { toPlainResults, NativeSparqlAdapter } from '../core/utils.js';
import {
  ACCEPT_TYPES,
  detectFormat,
  parsePatternParts,
  patternVarNames,
  matchStore,
  isRdfDoc,
  bindingsToResults,
  selectVars,
} from '../core/rdf-core.js';
import {
  assertSafeQuery,
  sanitizeVarValue,
  substituteVariables,
} from '../core/sparql-safety.js';

export { assertSafeQuery, sanitizeVarValue, substituteVariables };

// ─── Load & parse RDF from a URL ────────────────────────────────────────────
async function loadRdfStore(endpoint, fetchFn = globalThis.fetch) {
  const store = rdflib.graph();
  let lastError = null;

  for (const accept of ACCEPT_TYPES) {
    try {
      const resp = await fetchFn(endpoint, { headers: { Accept: accept } });
      if (!resp.ok) { lastError = new Error(`HTTP ${resp.status}`); if (resp.status === 405) break; continue; }
      const text = await resp.text();
      const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
      if (ct.includes('html') || /<html/i.test(text)) { lastError = new Error('Server returned HTML'); continue; }
      try {
        rdflib.parse(text, store, endpoint, detectFormat(ct, accept));
        return store;
      } catch (parseErr) { lastError = parseErr; }
    } catch (err) { lastError = err; }
  }

  // Last resort: no Accept header
  try {
    const resp = await fetchFn(endpoint);
    if (resp.ok) {
      const text = await resp.text();
      const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
      if (!ct.includes('html') && !/<html/i.test(text)) {
        rdflib.parse(text, store, endpoint, detectFormat(ct, ''));
        return store;
      }
    }
  } catch (err) { lastError = err; }

  throw lastError || new Error('Failed to load or parse RDF');
}

// ─── SPARQL execution (Node) ────────────────────────────────────────────────
async function _localSparql(queryText, endpoint, fetchFn) {
  const store  = await loadRdfStore(endpoint, fetchFn);
  const parsed = rdflib.SPARQLToQuery(queryText, false, store);
  if (!parsed) throw new Error('Could not parse SPARQL query');

  return new Promise((resolve, reject) => {
    const bindings = [];
    try {
      store.query(
        parsed,
        b => bindings.push(b),
        new rdflib.Fetcher(store),
        () => resolve(bindingsToResults(bindings, queryText)),
      );
    } catch (err) { reject(err); }
  });
}

async function execSparql(query, endpoint, fetchFn = globalThis.fetch) {
  if (isRdfDoc(endpoint)) {
    return _localSparql(query, endpoint, fetchFn);
  }
  return new NativeSparqlAdapter().executeQuery(query, endpoint, fetchFn);
}

// ─── Main entry point ───────────────────────────────────────────────────────
export async function solQuery(opts = {}) {
  const { endpoint, sparql, query, pattern, wanted, vars, columns, fetch: fetchFn } = opts;
  const pat = pattern || wanted;
  const queryText = sparql ?? query;
  if (!endpoint) throw new Error('endpoint is required');
  if (!queryText && !pat) throw new Error('sparql or pattern is required');

  const _fetch = fetchFn || globalThis.fetch;
  let data;

  if (queryText) {
    const processed = substituteVariables(queryText, vars);
    assertSafeQuery(processed);
    data = await execSparql(processed, endpoint, _fetch);
  } else {
    const store = await loadRdfStore(endpoint, _fetch);
    const names = patternVarNames(pat);
    const [s, p, o] = parsePatternParts(pat, rdflib, {}, endpoint);
    data = matchStore(store, s, p, o, names);
  }

  return toPlainResults(data, columns);
}

export default solQuery;
