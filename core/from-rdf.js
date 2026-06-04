// core/from-rdf.js — the `data-from-rdf` capability attribute (part of the `rdf`
// capability). It LOADS RDF from a Turtle document (it does not render) and hands
// the element the loaded data as a **W3C SPARQL 1.1 Query Results JSON** object —
// the SAME format `data-from-query` returns — expressed as the document's triples
// bound to `?s ?p ?o`. The calling component then does something with it.
//
// Delivery (symmetric with data-from-query's custom views): the object is set on
// the element as `el.swcData`, and, if the element carries `view="…/view.js"`,
// that module's `render(container, data, el)` is called with it. No built-in
// rendering — `data-from-rdf` never paints HTML itself.
import { activate } from './activate.js';
import { rdf } from './rdf.js';

function termToBinding(t) {
  if (!t) return undefined;
  if (t.termType === 'BlankNode') return { type: 'bnode', value: t.value };
  if (t.termType === 'Literal') {
    const b = { type: 'literal', value: t.value };
    if (t.language) b['xml:lang'] = t.language;
    else if (t.datatype && t.datatype.value &&
             t.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') b.datatype = t.datatype.value;
    return b;
  }
  return { type: 'uri', value: t.value };   // NamedNode
}

// The W3C SPARQL Results JSON envelope for a set of triples (vars s, p, o).
function toW3C(statements) {
  const bindings = statements.map((st) => ({
    s: termToBinding(st.subject), p: termToBinding(st.predicate), o: termToBinding(st.object),
  }));
  return { head: { vars: ['s', 'p', 'o'] }, results: { bindings } };
}

activate('[data-from-rdf]', async (el) => {
  const ref = el.getAttribute('data-from-rdf');
  if (!ref) return;
  const doc = new URL(ref, document.baseURI).href.split('#')[0];
  try {
    await rdf.load(doc);
    const data = toW3C(rdf.store.statementsMatching(null, null, null, rdf.sym(doc)));
    el.swcData = data;                                  // host component can read it
    const view = el.getAttribute('view');
    if (view) {
      const mod = await import(new URL(view, document.baseURI).href);
      const fn = mod.render ?? mod.default;
      if (typeof fn === 'function') fn(el, data, el);    // (container, data, el)
    }
  } catch (e) {
    console.error('[data-from-rdf] failed to load', doc, e);
  }
});
