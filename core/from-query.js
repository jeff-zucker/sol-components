// core/from-query.js — the `data-from-query` capability attribute (part of the
// `sparql` capability). Makes ANY element query-driven WITHOUT pulling in the
// <sol-query> component: it runs the query through the shared engine
// (core/rdf-utils.js) and renders the result INTO the host element based on the
// host's TAG — there is no `view` here. The split with <sol-query> is deliberate:
//   • want swc to choose the view → use the <sol-query> element (view-driven)
//   • want to choose yourself      → use this attribute (container-driven)
//
//   <ul data-from-query endpoint="data.ttl" sparql="SELECT ?name …"></ul>          <!-- → <li> per row -->
//   <select data-from-query endpoint="…" sparql="SELECT ?label ?uri …"></select>   <!-- → <option> per row -->
//   <div data-from-query endpoint="…" sparql="…"></div>                            <!-- no DOM: read el.swcData -->
//
// Output by host tag: <ul>/<ol> → one <li> per row; <select> → one <option> per
// row (+ a `sol-select` event on change); anything else → nothing is rendered and
// the W3C SPARQL 1.1 Query Results JSON is left on `el.swcData` for you to use.
//
// Config attributes (endpoint, pattern, sparql, query, var-<name>) may be written
// bare OR `data-`-prefixed (data-endpoint, …, data-var-<name>) to keep the markup
// spec-valid HTML; bare wins if both are given. `data-from-query` is the trigger.
import { activate } from './activate.js';
import { rdf } from './rdf.js';
import { getAuthFetch } from './auth-fetch.js';
import { substituteVariables, assertSafeQuery } from './sparql-safety.js';
import { execSparql, loadRdfStore, parsePatternParts, matchStore, fetchQueryFromRdf } from './rdf-utils.js';

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

// ── render: the host's tag decides the shape (no `view`) ─────────────────────
function cellText(cell) {
  if (!cell) return '';
  if (cell.type === 'uri') return cell.value.replace(/.*[/#]([^/#]+)\/?$/, '$1') || cell.value;
  return cell.value ?? '';
}
function cellValue(cell) { return cell ? (cell.value ?? '') : ''; }

// Display text for a row across however many SELECT variables there are.
function rowText(vars, row) {
  return vars.map((v) => cellText(row[v])).filter(Boolean).join(' — ');
}

function fillList(el, vars, rows) {
  el.replaceChildren(...rows.map((row) => {
    const li = document.createElement('li');
    li.textContent = rowText(vars, row);
    return li;
  }));
}

function fillSelect(el, vars, rows) {
  const opts = rows.map((row, i) => {
    const opt = document.createElement('option');
    // 1 col → text & value are the cell; 2 cols → text col0, value col1;
    // 3+ cols → text "col0 — col1", value is the last column.
    if (vars.length === 1)      { opt.textContent = cellText(row[vars[0]]); opt.value = cellValue(row[vars[0]]); }
    else if (vars.length === 2) { opt.textContent = cellText(row[vars[0]]); opt.value = cellValue(row[vars[1]]); }
    else { opt.textContent = `${cellText(row[vars[0]])} — ${cellText(row[vars[1]])}`; opt.value = cellValue(row[vars[vars.length - 1]]); }
    opt.dataset.rowIndex = String(i);
    return opt;
  });
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
  placeholder.textContent = `— ${rows.length} result${rows.length === 1 ? '' : 's'} —`;
  el.replaceChildren(placeholder, ...opts);
  el._swcRows = rows;
  if (!el._swcSelectWired) {                            // emit sol-select like the select view
    el._swcSelectWired = true;
    el.addEventListener('change', () => {
      const chosen = el.options[el.selectedIndex];
      const i = chosen ? parseInt(chosen.dataset.rowIndex, 10) : -1;
      el.dispatchEvent(new CustomEvent('sol-select', {
        bubbles: true, composed: true,
        detail: { value: el.value, row: el._swcRows ? el._swcRows[i] : undefined, index: i },
      }));
    });
  }
}

// While the query runs, show a loading indicator IN the host, shaped to its tag
// (a <li> in a list, an <option> in a select, else a <div>). aria-live announces it.
function setLoading(el) {
  const tag = el.localName;
  let node;
  if (tag === 'ul' || tag === 'ol') node = document.createElement('li');
  else if (tag === 'select') { node = document.createElement('option'); node.disabled = true; node.selected = true; }
  else { node = document.createElement('div'); node.setAttribute('role', 'status'); }
  node.className = 'swc-loading';
  node.setAttribute('aria-live', 'polite');
  node.textContent = 'Loading…';
  el.replaceChildren(node);
}

// The host's tag picks the shape. Unknown tags render nothing into the DOM — the
// W3C JSON is left on `el.swcData` for the page to consume.
function renderInto(el, data) {
  el.swcData = data;
  const vars = data.head.vars;
  const rows = data.results.bindings;
  const tag = el.localName;
  if (tag === 'ul' || tag === 'ol') return fillList(el, vars, rows);
  if (tag === 'select')            return fillSelect(el, vars, rows);
  el.replaceChildren();   // clear the loading indicator; the JSON is on el.swcData
}

activate('[data-from-query]', (el) => {
  if (el.localName === 'sol-query') return;            // the element handles itself
  setLoading(el);
  buildData(el)
    .then((data) => renderInto(el, data))
    .catch((e) => { el.innerHTML = `<div class="error">${(e && e.message) || e}</div>`; console.error('[data-from-query]', e); });
});
