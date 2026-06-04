// Shared utilities that do not depend on rdflib.

// ─── DOMPurify (lazy, cached) ─────────────────────────────────────────────────
let _purify = null;
async function _getDOMPurify() {
  if (_purify) return _purify;
  const win = typeof window !== 'undefined' ? window : {};
  // The global may be the purify instance directly (official purify.min.js UMD)
  // or a module namespace wrapping it (our esbuild vendor UMD → `{ default }`).
  const g = win.DOMPurify;
  const inst = g?.sanitize ? g : (g?.default?.sanitize ? g.default : null);
  if (inst) { _purify = inst; return _purify; }
  try {
    const mod = await import('dompurify');
    _purify = mod.default ?? mod;
    if (_purify?.sanitize) return _purify;
  } catch {}
  return null;
}

export async function sanitizeHtml(html, opts = {}) {
  const p = await _getDOMPurify();
  if (p) return p.sanitize(html, opts);
  // Minimal fallback: parse + re-serialize strips scripts/events via browser parser
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.innerHTML;
}

// W3C SPARQL Query Results JSON envelope.
function w3c(vars, bindings) { return { head: { vars }, results: { bindings } }; }

// ─── CSS selector query over an HTML document ────────────────────────────────
// `html` is already sanitized. Returns the W3C SPARQL Query Results JSON
// envelope ({ head: { vars }, results: { bindings } }) suitable for the renderer.
export function queryHtmlWithSelector(html, baseUrl, selector) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('base').forEach(b => b.remove()); // drop any existing <base>
  const base = doc.createElement('base');
  base.href = baseUrl;
  doc.head.appendChild(base);

  const els = Array.from(doc.querySelectorAll(selector));
  if (!els.length) return w3c(['text'], []);

  const hasHref = els.some(el => el.href || el.getAttribute('href'));
  const hasSrc  = els.some(el => el.src  || el.getAttribute('src'));
  const vars = ['tag', 'text'];
  if (hasHref) vars.push('href');
  if (hasSrc)  vars.push('src');

  const bindings = els.map(el => {
    const row = {
      tag:  { type: 'literal', value: el.tagName.toLowerCase() },
      text: { type: 'literal', value: el.textContent.trim() },
    };
    if (hasHref) {
      const v = el.href || el.getAttribute('href') || '';
      row.href = v ? { type: 'uri', value: el.href || v } : { type: 'literal', value: '' };
    }
    if (hasSrc) {
      const v = el.src || el.getAttribute('src') || '';
      row.src = v ? { type: 'uri', value: el.src || v } : { type: 'literal', value: '' };
    }
    return row;
  });

  return w3c(vars, bindings);
}

// ─── Plain results transformation ────────────────────────────────────────────
// Converts the W3C envelope to plain JS objects/scalars.
export function toPlainResults(data, wantedVars) {
  const vars     = data.head.vars;
  const bindings = data.results.bindings;
  const cols = wantedVars ? vars.filter(v => wantedVars.includes(v)) : vars;
  if (!bindings.length) return [];
  // 1 row × 1 column → return scalar value directly
  if (cols.length === 1 && bindings.length === 1) {
    const cell = bindings[0][cols[0]];
    return cell ? cell.value : null;
  }
  return bindings.map(row => {
    const obj = {};
    for (const col of cols) {
      const cell = row[col];
      obj[col] = cell ? cell.value : null;
    }
    return obj;
  });
}

// ─── SPARQL adapters (non-rdflib) ────────────────────────────────────────────

// Extract the projected variable names from a SPARQL SELECT clause, preserving
// author order. Returns null for `SELECT *` or non-SELECT queries — callers
// should fall back to whatever order the engine produced.
export function parseSelectVars(queryText) {
  const stripped = queryText.replace(/#[^\n]*/g, '');
  const m = stripped.match(/\bSELECT\s+(?:DISTINCT\s+|REDUCED\s+)?(.*?)\s+WHERE\b/is);
  if (!m) return null;
  const clause = m[1].trim();
  if (clause === '*') return null;
  const vars = clause.match(/\?(\w+)/g);
  return vars ? vars.map(v => v.slice(1)) : null;
}

export class ComunicaSparqlAdapter {
  constructor(engineFactory) {
    this.engineFactory = engineFactory;
  }

  static getComunicaEngine() {
    if (typeof newEngine === 'function') return newEngine;
    if (window.newEngine && typeof window.newEngine === 'function') return window.newEngine;
    // Direct named export (when consumers expose Comunica themselves).
    if (window.Comunica?.QueryEngine) return () => new window.Comunica.QueryEngine();
    if (window.Comunica?.newEngine) return window.Comunica.newEngine;
    // The vendored UMD wraps Comunica's CJS index, so QueryEngine lives one
    // level deeper at `window.Comunica.default.QueryEngine`.
    if (window.Comunica?.default?.QueryEngine) return () => new window.Comunica.default.QueryEngine();
    if (window.Comunica?.default?.newEngine) return window.Comunica.default.newEngine;
    // All-ESM fallback: no UMD sets a Comunica global anymore. The loader's
    // importmap resolves `@comunica/query-sparql` to the one shared engine, so
    // import it on demand and build a QueryEngine from its export. Async factory
    // — awaited by executeQuery, so the (large) engine only loads when a
    // federated query actually runs, not on page load.
    return async () => {
      let mod;
      try { mod = await import('@comunica/query-sparql'); }
      catch (e) { throw new Error(`Comunica engine could not be loaded: ${e.message}`); }
      const QueryEngine = mod.QueryEngine || mod.default?.QueryEngine || mod.default;
      if (typeof QueryEngine !== 'function') throw new Error('Comunica module has no QueryEngine export');
      return new QueryEngine();
    };
  }

  async executeQuery(query, endpoint, fetchFn) {
    const engine = await this.engineFactory();
    const sources = Array.isArray(endpoint) ? endpoint.slice() : [endpoint];
    const ctx = { sources, lenient: true };
    if (typeof fetchFn === 'function') ctx.fetch = fetchFn;
    const stream = await engine.queryBindings(query, ctx);
    const rawBindings = await stream.toArray();
    if (!rawBindings.length) return w3c([], []);

    // Prefer the explicit SELECT order from the query text; fall back to the
    // engine's binding order for SELECT * / non-SELECT.
    const selectVars = parseSelectVars(query);
    const vars = selectVars ?? Array.from(rawBindings[0].keys()).map(v => v.value);

    const bindings = rawBindings.map(binding => {
      const row = {};
      vars.forEach(v => {
        const term = binding.get(v);
        if (!term) { row[v] = { type: 'literal', value: '' }; return; }
        if (term.termType === 'NamedNode' || term.uri) {
          row[v] = { type: 'uri', value: term.value || term.uri || String(term) };
          return;
        }
        if (term.termType === 'BlankNode') {
          row[v] = { type: 'bnode', value: term.value };
          return;
        }
        const cell = { type: 'literal', value: term.value || term.uri || String(term) };
        if (term.language)        cell['xml:lang'] = term.language;
        if (term.datatype?.value) cell.datatype    = term.datatype.value;
        row[v] = cell;
      });
      return row;
    });
    return w3c(vars, bindings);
  }
}

export class NativeSparqlAdapter {
  async executeQuery(query, endpoint, fetchFn = fetch) {
    const params = new URLSearchParams({ query, format: 'json' });
    const resp = await fetchFn(`${endpoint}?${params}`, {
      headers: { Accept: 'application/sparql-results+json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // The wire format IS the W3C SPARQL Query Results JSON envelope. The
    // spec leaves missing-binding cells *absent* from a row, but downstream
    // consumers (toPlainResults, views) expect every projected variable to
    // be present — so synthesize empty-literal cells where the wire row
    // omits a column.
    const data  = await resp.json();
    const vars  = data?.head?.vars ?? [];
    const filled = (data?.results?.bindings ?? []).map(row => {
      const out = {};
      vars.forEach(v => { out[v] = row[v] ? row[v] : { type: 'literal', value: '' }; });
      return out;
    });
    return { head: { vars }, results: { bindings: filled } };
  }
}
