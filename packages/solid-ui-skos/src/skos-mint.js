// Inline minting of a new SKOS concept for a solid-ui ui:Choice.
//
// solid-ui's built-in select minting types the new node as `ui:from` and
// doesn't pass a prompt subform — both wrong for SKOS (a concept is not an
// instance of its scheme). So we drive solid-ui's `promptForNew` directly
// with theClass = skos:Concept and our own one-field prompt form, then write
// the structural SKOS triples (skos:inScheme / topConceptOf / broader /
// member) so the new concept is correctly placed AND shows up in the same
// dropdown on refresh.
//
// `skosMintStatements` is pure + unit-tested. `mintSkosConcept` is the DOM
// glue (uses solid-ui's promptForNew / fieldFunction) — not unit-tested here;
// smoke-test in a browser.

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const UI   = 'http://www.w3.org/ns/ui#';
const SYNTH_GRAPH = 'urn:solid-ui-skos:mint-form';

// Structural triples placing `concept` correctly relative to `from`, in `doc`.
// Returns rdflib quads. Pure.
export function skosMintStatements(kb, from, concept, doc) {
  const S = t => kb.sym(SKOS + t);
  const R = t => kb.sym(RDF + t);
  const isA = (n, c) => !!n && kb.holds(n, R('type'), kb.sym(SKOS + c));
  const q = (s, p, o) => kb.rdfFactory.quad(s, p, o, doc);

  const out = [q(concept, R('type'), S('Concept'))];

  if (isA(from, 'Collection') || isA(from, 'OrderedCollection')) {
    out.push(q(from, S('member'), concept));
    return out;
  }
  if (isA(from, 'ConceptScheme')) {
    // A new concept minted from a scheme has no parent → a top concept.
    out.push(q(concept, S('inScheme'), from));
    out.push(q(concept, S('topConceptOf'), from));
    return out;
  }
  // `from` is a Concept → the new concept becomes its child; inherit the scheme.
  out.push(q(concept, S('broader'), from));
  const scheme = kb.any(from, S('inScheme'), null, doc) || kb.any(from, S('topConceptOf'), null, doc);
  if (scheme) out.push(q(concept, S('inScheme'), scheme));
  return out;
}

// A throwaway one-field ui:Form (skos:prefLabel) for promptForNew to render.
// Returns the field node.
function prefLabelField(kb) {
  const g = kb.sym(SYNTH_GRAPH);
  const fld = kb.bnode();
  // idempotent-ish: these are blank-node triples, fresh each call
  kb.add(fld, kb.sym(RDF + 'type'), kb.sym(UI + 'SingleLineTextField'), g);
  kb.add(fld, kb.sym(UI + 'property'), kb.sym(SKOS + 'prefLabel'), g);
  kb.add(fld, kb.sym(UI + 'label'), kb.literal('Name'), g);
  return fld;
}

// Drive solid-ui's promptForNew to create + name a concept, then place it.
// `widgets` = window.UI.widgets; `onDone(conceptNode)` fires after the
// structural triples are written (e.g. to re-render the select).
export function mintSkosConcept({ dom, kb, widgets, subject, predicate, from, dataDoc, onDone }) {
  const skosConcept = kb.sym(SKOS + 'Concept');
  const subForm = prefLabelField(kb);

  const promptBox = widgets.promptForNew(
    dom, kb, subject, predicate, skosConcept, subForm, dataDoc,
    (ok, body) => {
      if (!ok) { console.warn('[solid-ui-skos] mint cancelled/failed:', body); return; }
      const concept = promptBox.AJAR_subject;
      const extra = skosMintStatements(kb, from, concept, dataDoc);
      kb.updater.update([], extra, (uri, ok2, body2) => {
        if (!ok2) { console.warn('[solid-ui-skos] could not place minted concept:', body2); return; }
        if (typeof onDone === 'function') onDone(concept);
      });
    },
  );
  return promptBox; // caller appends it next to the select
}
