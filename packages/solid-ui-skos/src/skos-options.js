// gatherSkosOptions — SKOS option-gathering for a solid-ui ui:Choice.
//
// Pure + framework-free: depends only on an rdflib store `kb`. The same logic
// backs both the `solid-ui-skos` add-on (./index.js) and the proposed solid-ui
// PR (../pr/README.md).
//
// Contract — parity with the rdf:type Choice, which is transitive over
// rdfs:subClassOf. skos:broader/narrower is the SKOS analog, so both SKOS
// cases are transitive (everything below X; never X itself):
//   ui:from a skos:ConceptScheme  → ALL concepts in the scheme (every
//       in-scheme/top concept, plus the transitive narrower closure).
//   ui:from a skos:Concept        → ALL narrower concepts (transitive).
//   ui:from a skos:Collection / OrderedCollection → its members
//       (skos:member, recursing nested collections; skos:memberList /
//       OrderedCollection preserve order → ordered:true).
//
// Returns { options: NamedNode[], ordered: boolean }. `ordered` is true only
// for ordered collections; the caller should NOT sort those.

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

export function gatherSkosOptions(kb, from, doc = null) {
  if (!from) return { options: [], ordered: false };

  const S = t => kb.sym(SKOS + t);
  const R = t => kb.sym(RDF + t);
  const isA = (n, cls) => !!n && kb.holds(n, R('type'), kb.sym(SKOS + cls));

  const map = new Map();
  const add = n => {
    if (n && n.termType === 'NamedNode' && !map.has(n.value)) map.set(n.value, n);
  };

  // ── Collection / OrderedCollection → members ──
  if (isA(from, 'Collection') || isA(from, 'OrderedCollection')) {
    const ordered = collectMembers(kb, from, doc, add, S, R, isA);
    return { options: [...map.values()], ordered };
  }

  // ── Scheme → all its concepts; Concept → all narrower. Both transitive. ──
  const seeds = [];
  if (isA(from, 'ConceptScheme')) {
    kb.each(null, S('inScheme'), from, doc).forEach(n => seeds.push(n));
    kb.each(null, S('topConceptOf'), from, doc).forEach(n => seeds.push(n));
    kb.each(from, S('hasTopConcept'), null, doc).forEach(n => seeds.push(n));
  } else {                                                        // a Concept (exclude itself)
    kb.each(from, S('narrower'), null, doc).forEach(n => seeds.push(n));
    kb.each(null, S('broader'), from, doc).forEach(n => seeds.push(n));
  }

  const queue = [];
  for (const s of seeds) if (s.termType === 'NamedNode' && !map.has(s.value)) { add(s); queue.push(s); }
  while (queue.length) {                                          // transitive narrower/broader closure
    const c = queue.shift();
    const kids = [
      ...kb.each(c, S('narrower'), null, doc),
      ...kb.each(null, S('broader'), c, doc),
    ];
    for (const k of kids) {
      if (k.termType === 'NamedNode' && !map.has(k.value)) { add(k); queue.push(k); }
    }
  }
  return { options: [...map.values()], ordered: false };
}

// Collect a (possibly nested / ordered) skos:Collection's leaf members.
// Returns true if any ordering was meaningful (memberList / OrderedCollection).
function collectMembers(kb, coll, doc, add, S, R, isA) {
  let ordered = isA(coll, 'OrderedCollection');

  const listHead = kb.any(coll, S('memberList'), null, doc);     // ordered: skos:memberList → rdf:list
  if (listHead) {
    ordered = true;
    for (const el of rdfListElements(kb, listHead, doc, R)) {
      if (isA(el, 'Collection') || isA(el, 'OrderedCollection')) collectMembers(kb, el, doc, add, S, R, isA);
      else add(el);
    }
  }

  for (const m of kb.each(coll, S('member'), null, doc)) {        // unordered: skos:member
    if (isA(m, 'Collection') || isA(m, 'OrderedCollection')) collectMembers(kb, m, doc, add, S, R, isA);
    else add(m);
  }
  return ordered;
}

// Walk an rdf:list. rdflib may hand back a Collection term (with
// `.elements`) or a first/rest chain; handle both, with a cycle guard.
function rdfListElements(kb, head, doc, R) {
  if (head && head.termType === 'Collection' && Array.isArray(head.elements)) return head.elements;
  const NIL = RDF + 'nil';
  const out = [];
  const seen = new Set();
  let node = head;
  while (node && node.value !== NIL && !seen.has(node.value)) {
    seen.add(node.value);
    const first = kb.any(node, R('first'), null, doc);
    if (first) out.push(first);
    node = kb.any(node, R('rest'), null, doc);
  }
  return out;
}
