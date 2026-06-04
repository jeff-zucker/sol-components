// core/from-query.js — the `data-from-query` capability attribute (part of the
// `sparql` capability). Makes ANY element query-driven by reusing <sol-query>:
// it reads the full sol-query attribute set off the host element, builds a
// <sol-query> configured from them, and REPLACES the host's content with it. So
// HTML views (table/list/…) render in place; a URL view (`view="…/view.js"`)
// receives the W3C SPARQL 1.1 Query Results JSON object via render(container,
// data, el). No new query knobs — the element carries sol-query's own attributes.
import { activate } from './activate.js';

// sol-query's query-configuration attributes, copied verbatim onto the nested
// <sol-query>. `var-*` (SPARQL variable bindings) are copied too.
const QUERY_ATTRS = ['endpoint', 'sparql', 'query', 'pattern', 'view'];

activate('[data-from-query]', (el) => {
  if (el.localName === 'sol-query') return;   // already a query element

  const q = document.createElement('sol-query');
  for (const name of QUERY_ATTRS) {
    const v = el.getAttribute(name);
    if (v != null) q.setAttribute(name, v);
  }
  for (const att of Array.from(el.attributes)) {
    if (att.name.indexOf('var-') === 0) q.setAttribute(att.name, att.value);
  }
  // `data-from-query`'s own value is a shorthand for the query when no explicit
  // sparql/query/pattern attribute is present.
  const dq = el.getAttribute('data-from-query');
  if (dq && !q.hasAttribute('sparql') && !q.hasAttribute('query') && !q.hasAttribute('pattern')) {
    q.setAttribute('sparql', dq);
  }

  el.replaceChildren(q);   // decision: a render target's content is REPLACED
});
