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
//   <h1 data-from-query pattern="<…/card#me> foaf:name ?name"></h1>                 <!-- → textContent = the value -->
//
// A `pattern` (triple pattern, CURIEs allowed) matches the rdflib store rather
// than running SPARQL. WITH an `endpoint` it loads that doc into the shared store
// first; WITHOUT one it matches the SHARED store as-is — reading whatever another
// library (PodOS, solid-logic, mashlib…) put there, fetching nothing — and it
// re-runs LIVE whenever a matching triple is added/removed:
//   <ul data-from-query pattern="<…/card#me> foaf:name ?name"></ul>                <!-- live shared-store read -->
//
// Output by host tag: <ul>/<ol> → one <li> per row; <select> → one <option> per
// row (+ a `sol-select` event on change); <img> → its `src` is set to the first
// result's value (a URI); a CUSTOM element (hyphenated tag) → renders itself from
// the data; any other element (<h1>, <span>, <p>, <div>…) → the result text becomes
// its `textContent`. Either way the full W3C SPARQL 1.1 Query Results JSON is left on
// `el.swcData` (and on the event below) for you to use.
//
// When the results land, the host fires a `sol-data-ready` event (bubbles/composed,
// detail.data = the W3C JSON), so a custom element or page can react on the event
// instead of reading el.swcData:
//   el.addEventListener('sol-data-ready', (e) => render(e.detail.data.results.bindings));
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
  const pattern = attr(el, 'pattern');
  const sparql = attr(el, 'sparql') || attr(el, 'query') ||
    (pattern ? '' : (el.getAttribute('data-from-query') || ''));

  if (sparql) {
    if (!eps.length) throw new Error('data-from-query needs an `endpoint` for a SPARQL query');
    let q = isStoredRef(sparql) ? await fetchQueryFromRdf(sparql) : sparql;
    q = substituteVariables(q, readVars(el));
    assertSafeQuery(q);
    const target = eps.length > 1 ? eps : eps[0];
    const fetchUrl = Array.isArray(target) ? target[0] : target;
    return execSparql(q, target, getAuthFetch(fetchUrl));
  }
  if (pattern) {
    // No `endpoint` → match the SHARED store directly (the rdflib graph PodOS /
    // solid-logic / solid-ui all populate), so this reads what another library
    // loaded WITHOUT fetching anything itself. With an `endpoint`, load that
    // document into the shared store first, then match.
    const base = eps[0] || document.baseURI;
    const store = eps.length ? await loadRdfStore(eps[0], fetch, { shared: true }) : rdf.store;
    const [s, p, o] = parsePatternParts(pattern, rdf, {}, base);
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

// Set the host <img>'s `src` to the first result's value (a URI). An <img> is a
// void element, so it gets a `src`, not children.
function fillImg(el, vars, rows) {
  const cell = rows[0] && rows[0][vars[0]];
  if (cell && cell.value) el.setAttribute('src', cell.value);
  else el.removeAttribute('src');
}

// A text container (<h1>, <span>, <p>, <div>, …): the result becomes its textContent —
// one row → its value, several → joined. The full JSON is still on el.swcData.
// textContent (not innerHTML) so result values are never interpreted as markup —
// a literal from an endpoint or the shared store can't inject HTML.
function fillText(el, vars, rows) {
  el.textContent = rows.map((row) => rowText(vars, row)).join(', ');
}

// While the query runs, show a loading indicator IN the host, shaped to its tag
// (a <li> in a list, an <option> in a select, else a <div>). aria-live announces it.
function setLoading(el) {
  const tag = el.localName;
  if (tag === 'img') { el.removeAttribute('src'); return; }   // void element — blank it
  let node;
  if (tag === 'ul' || tag === 'ol') node = document.createElement('li');
  else if (tag === 'select') { node = document.createElement('option'); node.disabled = true; node.selected = true; }
  else { node = document.createElement('span'); node.setAttribute('role', 'status'); }   // inline: valid inside <h1>/<span>/<p>
  node.className = 'swc-loading';
  node.setAttribute('aria-live', 'polite');
  node.textContent = 'Loading…';
  el.replaceChildren(node);
}

// The host's tag picks the shape. A custom element renders itself (we just clear the
// loading indicator); any other plain element shows the result as its textContent. The
// full W3C JSON is always left on `el.swcData`, and when the results land we fire a
// `sol-data-ready` event (detail.data = the W3C JSON) so a custom element / page can
// react without polling el.swcData.
function renderInto(el, data) {
  el.swcData = data;
  const vars = data.head.vars;
  const rows = data.results.bindings;
  const tag = el.localName;
  if (tag === 'ul' || tag === 'ol')   fillList(el, vars, rows);
  else if (tag === 'select')          fillSelect(el, vars, rows);
  else if (tag === 'img')             fillImg(el, vars, rows);
  else if (tag.includes('-'))         el.replaceChildren();    // custom element: it renders itself from swcData / the event
  else                                fillText(el, vars, rows); // <h1>/<span>/<p>/<div>…: result → textContent
  el.dispatchEvent(new CustomEvent('sol-data-ready', {
    bubbles: true, composed: true, detail: { data: data },
  }));
}

function runQueryInto(el) {
  return buildData(el)
    .then((data) => renderInto(el, data))
    .catch((e) => { el.innerHTML = `<div class="error">${(e && e.message) || e}</div>`; console.error('[data-from-query]', e); });
}

activate('[data-from-query]', (el) => {
  if (el.localName === 'sol-query') return;            // the element handles itself
  setLoading(el);
  runQueryInto(el);

  // Live mode: a triple-`pattern` query re-runs whenever a matching statement is
  // added to / removed from the shared store — by THIS library or any other one
  // sharing the rdflib graph (e.g. PodOS writing into the store swc adopted).
  // SPARQL/endpoint queries stay one-shot. (activate has no disconnect hook, so
  // the subscription lives for the page — fine for capability-attribute elements
  // that persist; they re-render against a detached node harmlessly if removed.)
  const pattern = attr(el, 'pattern');
  if (pattern) {
    try {
      const base = endpointsOf(el)[0] || document.baseURI;
      const [s, p, o] = parsePatternParts(pattern, rdf, {}, base);
      rdf.onChange(s, p, o, () => runQueryInto(el));
    } catch (e) { console.error('[data-from-query] live subscription failed', e); }
  }
});
