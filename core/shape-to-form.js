// shape-to-form — turn a SHACL shape into an editable form.
//
// Pure functions; no DOM ownership beyond the rendering layer, which
// delegates to solid-ui's form widgets. The intended consumer pattern is:
//
//   const { targets, properties } = parseShape(shapeText, shapeUri);
//   const subjects = findSubjects(store, targets, dataDoc);
//   const cleanup  = renderRecordForm(container, store, subjects[0], properties, {
//     doc, onChange: (subj) => { /* persist however the host wants */ },
//   });
//
// Rendering goes through solid-ui's `window.UI.widgets.fieldFunction`
// for consistency with every other form on the page (sol-form's legacy
// form-driven path, the menu editor when it used menu-form.ttl, etc.).
// shape-to-form builds a synthetic ui:Form node in the data store per
// render, hands it to solid-ui, and collects a cleanup function that
// removes the synthesized triples on teardown.
//
// Mapping (SHACL → ui:* field type):
//   sh:nodeKind sh:IRI            → ui:NamedNodeURIField
//   sh:datatype xsd:integer       → ui:IntegerField
//   sh:datatype xsd:decimal       → ui:DecimalField
//   sh:datatype xsd:boolean       → ui:BooleanField
//   sh:datatype xsd:date          → ui:DateField
//   sh:datatype xsd:dateTime      → ui:DateTimeField
//   sh:datatype xsd:anyURI        → ui:NamedNodeURIField
//   sh:datatype xsd:string / fallback → ui:SingleLineTextField
//
//   sh:in (IRIs with rdfs:label)  → ui:Choice + ui:from pointing at a
//                                   synthesized rdfs:Class whose
//                                   instances are the listed URIs;
//                                   labels propagate via the rdfs:label
//                                   already declared in the shape.
//   sh:in (literals)              → ui:SingleLineTextField fallback —
//                                   solid-ui's Choice doesn't model
//                                   literal-instance enums. Authors who
//                                   need a dropdown should declare the
//                                   options as URIs with rdfs:label.
//
//   sh:maxCount > 1 / unbounded   → wrapped in ui:Multiple, with the
//                                   ui:* field above as ui:part.
//   sh:name                       → ui:label
//   sh:minCount 1                 → ui:required true
//
// Read-only mode (`opts.readOnly`) is wired via `store.updater.editable`
// — solid-ui's fields respect that flag and render as non-editable.

import { rdf } from './rdf.js';

const SH       = 'http://www.w3.org/ns/shacl#';
const RDF_NS   = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS  = 'http://www.w3.org/2000/01/rdf-schema#';
const UI       = 'http://www.w3.org/ns/ui#';
const XSD      = 'http://www.w3.org/2001/XMLSchema#';
const OWL      = 'http://www.w3.org/2002/07/owl#';

/**
 * Parse a SHACL document into a normalized descriptor list.
 * Pure / sync. Throws if the SHACL fails to parse.
 *
 * @param {string} shapeText  raw turtle of the SHACL document
 * @param {string} baseUri    base URI used to resolve relative refs in the doc
 * @returns {{ targets: Targets, properties: ShapeProp[] }}
 */
export async function parseShape(shapeText, baseUri, ctx = {}) {
  const abs = baseUri
    ? new URL(baseUri, typeof document !== 'undefined' ? document.baseURI : 'file:///').href
    : '';
  const shapeStore = rdf.graph();
  rdf.parse(shapeText, shapeStore, abs, 'text/turtle');
  await followOwlImports(shapeStore, abs);

  // Shape selection (in priority order):
  //   1. If ctx supplies subject + dataStore: prefer the shape whose
  //      sh:targetClass matches one of the subject's rdf:type values.
  //      This is the "outer shape applies to user data" case (e.g.,
  //      schema:ItemList → SearchEnginesShape).
  //   2. The file/topic wrapper pattern: file-shape uses sh:node to
  //      point at a topic-shape carrying the actual property
  //      constraints (e.g., DataKitchenSettingsFile → settings topic
  //      shape via foaf:primaryTopic). Prefer the sh:node-referenced
  //      shape — the file-shape's only property is the walker.
  //   3. Fallback: first NodeShape in the file.
  const allShapes = shapeStore.each(null,
    rdf.sym(RDF_NS + 'type'),
    rdf.sym(SH + 'NodeShape'));
  if (!allShapes.length) {
    return { targets: { nodes: [], classes: [], subjectsOf: [] }, properties: [] };
  }
  let nodeShape = null;
  if (ctx.subject && ctx.dataStore) {
    const subjectTypes = ctx.dataStore.each(ctx.subject, rdf.sym(RDF_NS + 'type'));
    if (subjectTypes.length) {
      nodeShape = allShapes.find(s => {
        const tcs = shapeStore.each(s, rdf.sym(SH + 'targetClass'));
        return tcs.some(tc => subjectTypes.some(t => t.value === tc.value));
      }) || null;
    }
  }
  nodeShape ||=
    allShapes.find(s => shapeStore.any(null, rdf.sym(SH + 'node'), s)) ||
    allShapes[0];

  const targets = {
    nodes:      shapeStore.each(nodeShape, rdf.sym(SH + 'targetNode')),
    classes:    shapeStore.each(nodeShape, rdf.sym(SH + 'targetClass')),
    subjectsOf: shapeStore.each(nodeShape, rdf.sym(SH + 'targetSubjectsOf')),
  };

  const properties = [];
  for (const prop of shapeStore.each(nodeShape, rdf.sym(SH + 'property'))) {
    const desc = readShapeProperty(shapeStore, prop);
    if (desc) properties.push(desc);
  }
  return { targets, properties };
}

// Follow owl:imports declarations in the shape store, fetching each
// referenced TTL and parsing it into BOTH the shape store (so
// shape-to-form's own lookups like sh:class → narrower options work)
// AND the shared singleton store (so solid-ui's Choice handler can
// enumerate instances of those classes at render time). Cycle-safe
// via a visited set; failed fetches are warned and skipped.
async function followOwlImports(store, baseUri) {
  const seen = new Set(baseUri ? [baseUri] : []);
  const objectsOfImports = () =>
    store.statementsMatching(null, rdf.sym(OWL + 'imports'), null).map(st => st.object);
  const queue = objectsOfImports()
    .map(o => new URL(o.value, baseUri || document.baseURI).href)
    .filter(u => !seen.has(u));
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.warn(`[shape-to-form] owl:imports HTTP ${resp.status}: ${url}`); continue; }
      const text = await resp.text();
      rdf.parse(text, store, url, 'text/turtle');
      try { rdf.parse(text, rdf.store, url, 'text/turtle'); }
      catch (_) { /* shared store may already have these triples; ignore */ }
      const more = objectsOfImports()
        .map(o => new URL(o.value, url).href)
        .filter(u => !seen.has(u));
      queue.push(...more);
    } catch (err) {
      console.warn(`[shape-to-form] owl:imports ${url}: ${err.message}`);
    }
  }
}

/**
 * Read a single sh:property descriptor from a shape store. Exported so
 * components that parse multi-NodeShape files (e.g. sol-tree-edit, which
 * routes one shape per ui:Component / ui:Link / ui:Menu via
 * sh:targetClass) can reuse the same walker without re-implementing it.
 *
 * Recurses into sh:node when present, populating `nestedProperties` so
 * renderers can synthesise a ui:Group / ui:Multiple for nested data
 * shapes (e.g. a list of schema:PropertyValue pairs).
 */
export function readShapeProperty(shapeStore, prop) {
  const pathNode = shapeStore.any(prop, rdf.sym(SH + 'path'));
  if (!pathNode) return null;

  // SHACL property paths. We handle the two common shapes:
  //   sh:path <pred>                      → forward predicate (path = NamedNode)
  //   sh:path [ sh:inversePath <pred> ]   → inverse predicate (path = blank node)
  // Sequence / alternative / zeroOrMore paths aren't supported yet.
  let path = pathNode;
  let reverse = false;
  if (pathNode.termType !== 'NamedNode') {
    const inv = shapeStore.any(pathNode, rdf.sym(SH + 'inversePath'));
    if (!inv) return null;          // complex path we don't understand
    path = inv;
    reverse = true;
  }

  const minCount = parseInt(shapeStore.anyValue(prop, rdf.sym(SH + 'minCount')) ?? '0', 10);
  const maxRaw   = shapeStore.anyValue(prop, rdf.sym(SH + 'maxCount'));
  const maxCount = maxRaw == null ? Infinity : parseInt(maxRaw, 10);
  const label    = shapeStore.anyValue(prop, rdf.sym(SH + 'name')) ?? null;
  const description = shapeStore.anyValue(prop, rdf.sym(SH + 'description')) ?? null;

  const dt = shapeStore.any(prop, rdf.sym(SH + 'datatype'));
  const datatype = dt ? dt.value : null;

  const inList = shapeStore.any(prop, rdf.sym(SH + 'in'));
  let enumOpts = null, enumLabels = null;
  if (inList) {
    const items = collectRdfList(shapeStore, inList);
    enumOpts = items.map(n => ({ value: n.value, termType: n.termType }));
    enumLabels = items.map(n => {
      if (n.termType !== 'NamedNode') return n.value;
      const lbl = shapeStore.anyValue(n, rdf.sym(RDFS_NS + 'label'));
      return lbl || n.value;
    });
  }

  const nk = shapeStore.any(prop, rdf.sym(SH + 'nodeKind'));
  const nodeKind = nk ? nk.value : null;

  // sh:class — values must be instances of this class. shape-to-form
  // emits ui:from on the synthesized ui:Choice, leaving the runtime
  // enumeration to solid-ui (it walks `kb.each(null, rdf:type, X)`).
  const classNode = shapeStore.any(prop, rdf.sym(SH + 'class')) || null;

  // sh:node — a nested NodeShape validating the values of this path.
  // Each matching value is a blank/named node carrying its own
  // sh:property entries; the renderer turns this into a ui:Group of
  // sub-fields (wrapped in a ui:Multiple when the outer property is
  // multi-valued).
  const nodeShape = shapeStore.any(prop, rdf.sym(SH + 'node'));
  // ui:sortedBy on a container property — names the inner predicate
  // whose integer value orders the rolodex cards. Renderer hides the
  // named inner field and replaces it with ↑/↓ buttons that swap
  // values with the previous / next subject.
  const sortedBy = shapeStore.any(prop, rdf.sym(UI + 'sortedBy')) || null;
  let nestedProperties = null;
  if (nodeShape) {
    nestedProperties = [];
    for (const subProp of shapeStore.each(nodeShape, rdf.sym(SH + 'property'))) {
      const subDesc = readShapeProperty(shapeStore, subProp);
      if (subDesc) nestedProperties.push(subDesc);
    }
  }

  const key = localPart(path.value);

  return {
    path, key, datatype, enumOpts, enumLabels, nodeKind, classNode,
    minCount, maxCount, label, description, nestedProperties, reverse,
    sortedBy,
  };
}

function localPart(uri) {
  const i = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return i === -1 ? uri : uri.slice(i + 1);
}

function collectRdfList(store, head) {
  if (!head) return [];
  if (head.termType === 'Collection' && Array.isArray(head.elements)) {
    return head.elements;
  }
  const FIRST = rdf.sym(RDF_NS + 'first');
  const REST  = rdf.sym(RDF_NS + 'rest');
  const NIL   = RDF_NS + 'nil';
  const out = [];
  let node = head;
  while (node && node.value !== NIL) {
    const first = store.any(node, FIRST);
    if (first) out.push(first);
    node = store.any(node, REST);
  }
  return out;
}

/**
 * Resolve a parsed shape's targets against a data graph → list of
 * subjects the shape covers.
 */
export function findSubjects(store, targets, baseDoc = null) {
  const seen = new Set();
  const out = [];
  const add = (n) => { if (n && !seen.has(n.value)) { seen.add(n.value); out.push(n); } };

  for (const node of targets.nodes) add(node);
  for (const cls of targets.classes) {
    for (const s of store.each(null, rdf.sym(RDF_NS + 'type'), cls, baseDoc)) add(s);
  }
  for (const pred of targets.subjectsOf) {
    for (const st of store.statementsMatching(null, pred, null, baseDoc)) add(st.subject);
  }
  return out;
}

/**
 * Render an editable record form for one subject. Builds a synthetic
 * ui:Form in the store, hands it to solid-ui's fieldFunction, and
 * returns a cleanup function that removes the synthesized triples and
 * detaches the rendered widget.
 *
 * @param {HTMLElement} container
 * @param {Object}      store        rdflib graph (typically rdf.store)
 * @param {Object}      subject      NamedNode being edited
 * @param {ShapeProp[]} properties   from parseShape().properties
 * @param {Object}      [opts]
 * @param {Object?}     [opts.doc]       named-graph for the data (NamedNode)
 * @param {Function}    [opts.onChange]  called with (subject) after every mutation
 * @param {boolean}     [opts.readOnly]  render via solid-ui's read-only path
 * @returns {Function}                   cleanup
 */
export function renderRecordForm(container, store, subject, properties, opts = {}) {
  const doc = opts.doc ?? null;
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  const readOnly = !!opts.readOnly;

  const inner = document.createElement('div');
  inner.className = 'sol-form-shape-fields';
  if (readOnly) inner.classList.add('sol-form-shape-readonly');
  container.appendChild(inner);

  const fieldFunction = window.UI?.widgets?.fieldFunction
                     ?? window.UI?.widgets?.forms?.fieldFunction;
  if (typeof fieldFunction !== 'function') {
    inner.innerHTML = '<div class="sol-form-error">solid-ui is not loaded — required for shape-driven forms.</div>';
    return () => { if (inner.parentNode === container) container.removeChild(inner); };
  }

  // Solid-ui's editable flag governs whether fields render as inputs
  // or as read-only text. Save and restore around the render so other
  // forms aren't affected.
  const origEditable = store.updater?.editable;
  if (readOnly && store.updater) store.updater.editable = () => false;

  // Each render synthesises ui:Form widget triples. We put them in a
  // SEPARATE named graph (formGraph) rather than `doc`, so that a
  // serialization of `doc` (e.g. sol-form's getTurtle) yields just the
  // user's data — never the form metadata. The cleanup still removes
  // them outright on form teardown.
  const formGraph = rdf.sym('about:sol-form-synth#g');
  const synthesized = [];
  const add = (s, p, o, g = formGraph) => {
    store.add(s, p, o, g);
    synthesized.push({ s, p, o, g });
  };

  // For each descriptor, build a ui:* field node and hand it (or its
  // ui:Multiple wrapper) to solid-ui. The widgets sit one-per-row in
  // the same container; mixing solid-ui-rendered widgets in one list
  // is supported because each fieldFunction call returns an
  // independent DOM subtree.
  for (const desc of properties) {
    const row = document.createElement('div');
    row.className = 'sol-form-shape-key';
    row.dataset.key = desc.key;
    inner.appendChild(row);

    const cb = (ok /*, msg */) => {
      if (ok) onChange(subject);
    };

    // Multi-valued primitive (no sh:node, no sh:in) → render rows
    // ourselves. Workaround for a solid-ui basicField limitation: when
    // wrapped in ui:Multiple, solid-ui passes the *value* as `subject`
    // to the inner field, and basicField then does
    // `kb.any(subject, property, …)` which looks for `<value> path ?`
    // — a triple that doesn't exist for primitive multi-values like
    // `<#All> dct:source <url>`. Result: inputs render empty.
    // Persistence still goes through `store.updater.update` (rdflib's
    // PATCH path) per [[feedback-no-reinvent-saves]].
    const isMulti = desc.maxCount === Infinity || desc.maxCount > 1;
    if (isMulti && !desc.nestedProperties && !desc.enumOpts) {
      renderPrimitiveMulti(row, store, subject, desc, doc, cb, readOnly);
      continue;
    }

    const fieldNode = buildFieldNode(store, desc, synthesized, formGraph);
    if (!fieldNode) {
      row.textContent = '(unrecognised shape for ' + (desc.label || desc.key) + ')';
      continue;
    }

    try {
      const renderFn = fieldFunction(document, fieldNode);
      if (typeof renderFn !== 'function') {
        row.textContent = '(no renderer for ' + (desc.label || desc.key) + ')';
        continue;
      }
      const widget = renderFn(document, row, {}, subject, fieldNode, doc, cb);
      if (widget && !row.contains(widget)) row.appendChild(widget);

      // solid-ui's single-select Choice does NOT autosave on change —
      // only its multiSelect path writes back. For sh:class-driven
      // single-cardinality dropdowns we attach our own change handler
      // that replaces the predicate's value with the picked URI and
      // PUTs the result through updater.update.
      if (!desc.nestedProperties) wireSingleSelectAutosave(row, store, subject, desc.path, doc, cb);
    } catch (err) {
      row.textContent = err.message;
      console.error('[shape-to-form]', err);
    }
  }

  return () => {
    // Remove every triple we added during this render so the store
    // doesn't accumulate dead ui:* metadata across renders.
    for (const st of synthesized) {
      if (!st) continue;
      for (const match of store.statementsMatching(st.s, st.p, st.o, st.g).slice()) {
        store.remove(match);
      }
    }
    if (readOnly && store.updater && origEditable !== undefined) {
      store.updater.editable = origEditable;
    }
    if (inner.parentNode === container) container.removeChild(inner);
  };
}

// Render a multi-valued primitive (no sh:node, no sh:in) as a label
// + one input row per existing value, with ✕ to remove a value and
// + to add. Each commit PATCHes via `store.updater.update`.
//
// Why this exists: solid-ui's basicField, when wrapped in ui:Multiple,
// is passed each value as `subject` and then queries
// `kb.any(subject, property, …)` — wrong for primitive multi-values
// (the value isn't itself the subject of `property`). See
// [[feedback-dont-invent-what-exists]] — this is the bug-workaround
// carve-out (surgical, library data path).
function renderPrimitiveMulti(row, store, subject, desc, doc, cb, readOnly) {
  const label = document.createElement('label');
  label.className = 'sol-form-shape-multi-label';
  label.textContent = desc.label || desc.key;
  row.appendChild(label);

  const valueBox = document.createElement('div');
  valueBox.className = 'sol-form-shape-multi-value';
  row.appendChild(valueBox);

  const list = document.createElement('div');
  list.className = 'sol-form-shape-multi-list';
  valueBox.appendChild(list);

  const isIRI = desc.nodeKind === SH + 'IRI'
             || desc.nodeKind === SH + 'IRIOrLiteral'
             || desc.nodeKind === SH + 'BlankNodeOrIRI'
             || desc.datatype === XSD + 'anyURI';
  const toTerm = (raw) => {
    const s = String(raw).trim();
    if (!s) return null;
    if (isIRI) {
      try { return rdf.sym(s); } catch (_) { return null; }
    }
    return desc.datatype
      ? rdf.literal(s, undefined, rdf.sym(desc.datatype))
      : rdf.literal(s);
  };

  const makeItem = (existingValue) => {
    const item = document.createElement('div');
    item.className = 'sol-form-shape-multi-item';
    const input = document.createElement('input');
    input.type = isIRI ? 'url' : 'text';
    input.value = existingValue ? existingValue.value : '';
    input.disabled = readOnly;
    item.appendChild(input);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sol-form-shape-multi-del';
    del.setAttribute('aria-label', 'Remove value');
    del.textContent = '✕';
    del.disabled = readOnly;
    item.appendChild(del);

    let bound = existingValue || null;
    del.addEventListener('click', () => {
      if (!bound) { list.removeChild(item); return; }
      const olds = [rdf.st(subject, desc.path, bound, doc)];
      store.updater.update(olds, [], (_uri, ok) => {
        if (!ok) return;
        list.removeChild(item);
        cb(true);
      });
    });

    input.addEventListener('change', () => {
      const term = toTerm(input.value);
      if (!term) return;
      if (bound && bound.equals(term)) return;
      const olds = bound ? [rdf.st(subject, desc.path, bound, doc)] : [];
      const news = [rdf.st(subject, desc.path, term, doc)];
      store.updater.update(olds, news, (_uri, ok) => {
        if (!ok) return;
        bound = term;
        cb(true);
      });
    });

    return item;
  };

  for (const v of store.each(subject, desc.path, null, doc)) {
    list.appendChild(makeItem(v));
  }

  if (!readOnly) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'sol-form-shape-multi-add';
    add.textContent = `+ Add ${(desc.label || desc.key).toLowerCase()}`;
    add.addEventListener('click', () => {
      const item = makeItem(null);
      list.appendChild(item);
      item.querySelector('input').focus();
    });
    valueBox.appendChild(add);
  }
}

// Find the picker's <select> inside `row` and attach a change handler
// that swaps the (subject, predicate, *) triples for a single new one
// pointing at the picked URI. Skipped for multi-select selects (those
// go through solid-ui's own update path).
function wireSingleSelectAutosave(row, store, subject, predicate, doc, cb) {
  // solid-ui's single-select Choice (a) doesn't autosave the chosen value
  // and (b) actively detaches the <select> from its parent on every change
  // (its onChange does `container.removeChild(container.lastChild)` and
  // never re-adds for single-select). We attach our own change handler
  // that re-appends the detached <select> AND PATCHes the new value via
  // store.updater.update — the same path solid-ui's basic fields use.
  row.addEventListener('change', (e) => {
    const sel = e.target;
    if (!sel || sel.tagName !== 'SELECT' || sel.multiple) return;
    const newUri = sel.value;
    if (!newUri || !/^https?:|^urn:|^did:/.test(newUri)) return;

    // solid-ui already removed sel from its parent (.choiceBox-selectBox).
    // Put it back so the user keeps seeing the dropdown.
    if (!sel.parentNode) {
      const rhs = row.querySelector('.choiceBox-selectBox');
      if (rhs) rhs.appendChild(sel);
    }

    if (!store.updater) { cb(false); return; }
    const olds = store.statementsMatching(subject, predicate, null, doc).slice();
    const news = [rdf.st(subject, predicate, rdf.sym(newUri), doc)];
    store.updater.update(olds, news, (_uri, ok) => { cb(!!ok); });
  });
}

// Build (and add to the store) the ui:* triples for one descriptor.
// Returns the form-side node solid-ui should render — that's either the
// field itself for single-valued, or a wrapping ui:Multiple for
// multi-valued. Returns null if the descriptor is malformed.
function buildFieldNode(store, desc, synthesized, doc) {
  if (desc.nestedProperties) {
    return buildNestedFieldNode(store, desc, synthesized, doc);
  }
  const fieldNode = rdf.blankNode();
  const fieldType = uiTypeForDescriptor(desc, store, synthesized, doc, fieldNode);
  if (!fieldType) return null;

  addTriple(store, synthesized, doc, fieldNode, rdf.sym(RDF_NS + 'type'), rdf.sym(fieldType));
  addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'property'), desc.path);
  if (desc.label) {
    addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'label'),
              rdf.literal(desc.label));
  }
  // ui:required true (solid-ui doesn't surface this visibly today but
  // SHACL min/max are recorded for completeness).
  if (desc.minCount >= 1 && desc.maxCount === 1) {
    addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'required'),
              rdf.literal('true', rdf.sym(XSD + 'boolean')));
  }
  // Description — solid-ui's basic fields don't render a tooltip from
  // this, but rdfs:comment is the conventional slot and any future
  // help-popover would use it.
  if (desc.description) {
    addTriple(store, synthesized, doc, fieldNode, rdf.sym(RDFS_NS + 'comment'),
              rdf.literal(desc.description));
  }

  // Multi-valued handling:
  //
  //   • IRI-enum (sh:in with NamedNode options) → keep ONE ui:Choice and
  //     mark it ui:multiselect true. Solid-ui's Choice handler reads that
  //     flag and renders a single multi-select widget showing every
  //     selected option simultaneously — instead of multiple parallel
  //     dropdowns that each show the same first-alphabetical option
  //     (the "Imperial / Imperial" bug we hit with Multiple-wrap).
  //
  //   • Other multi-valued: wrap in ui:Multiple. Solid-ui renders one
  //     row per value with +/− chrome and reorder controls for ordered
  //     lists.
  const isMulti = desc.maxCount > 1 || (desc.maxCount === Infinity && desc.minCount >= 0);
  if (isMulti) {
    const fieldType = store.anyValue(fieldNode, rdf.sym(RDF_NS + 'type'));
    if (fieldType === UI + 'Choice') {
      addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'multiselect'),
                rdf.literal('true', rdf.sym(XSD + 'boolean')));
      return fieldNode;
    }
    const multi = rdf.blankNode();
    addTriple(store, synthesized, doc, multi, rdf.sym(RDF_NS + 'type'), rdf.sym(UI + 'Multiple'));
    addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'property'), desc.path);
    addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'part'), fieldNode);
    if (desc.label) {
      addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'label'), rdf.literal(desc.label));
    }
    if (desc.reverse) {
      // SHACL sh:inversePath → solid-ui reads ui:reverse to flip its
      // own kb.each() direction (and to emit inverse triples on add).
      addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'reverse'),
                rdf.literal('true', rdf.sym(XSD + 'boolean')));
    }
    return multi;
  }
  return fieldNode;
}

// sh:node nested shape → ui:Group of sub-fields (wrapped in ui:Multiple
// when the outer property is multi-valued, matching menu-form.ttl's
// ui:attribute → :attrForm pattern). Each sub-property is built via the
// regular buildFieldNode so nesting can chain arbitrarily deep.
function buildNestedFieldNode(store, desc, synthesized, doc) {
  const groupNode = rdf.blankNode();
  addTriple(store, synthesized, doc, groupNode,
            rdf.sym(RDF_NS + 'type'), rdf.sym(UI + 'Group'));

  const subNodes = [];
  for (const sub of desc.nestedProperties) {
    const subNode = buildFieldNode(store, sub, synthesized, doc);
    if (subNode) subNodes.push(subNode);
  }
  const list = synthesizeRdfList(store, synthesized, doc, subNodes);
  addTriple(store, synthesized, doc, groupNode,
            rdf.sym(UI + 'parts'), list);

  const isMulti = desc.maxCount > 1 || desc.maxCount === Infinity;
  if (!isMulti) {
    if (desc.label) {
      addTriple(store, synthesized, doc, groupNode,
                rdf.sym(UI + 'label'), rdf.literal(desc.label));
    }
    return groupNode;
  }
  const multi = rdf.blankNode();
  addTriple(store, synthesized, doc, multi, rdf.sym(RDF_NS + 'type'), rdf.sym(UI + 'Multiple'));
  addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'property'), desc.path);
  addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'part'), groupNode);
  if (desc.label) {
    addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'label'), rdf.literal(desc.label));
  }
  if (desc.reverse) {
    addTriple(store, synthesized, doc, multi, rdf.sym(UI + 'reverse'),
              rdf.literal('true', rdf.sym(XSD + 'boolean')));
  }
  return multi;
}

// Build an rdflib Collection holding `nodes`. Returned as a single
// Collection term so solid-ui's Group handler — which reads
// `parts.elements` directly — finds the populated array. Cons-cell
// triples never enter the store; on teardown the Collection just gets
// garbage-collected with the synthesized parent triple.
function synthesizeRdfList(store, synthesized, doc, nodes) {
  if (nodes.length === 0) return rdf.sym(RDF_NS + 'nil');
  return new rdf.Collection(nodes);
}

function uiTypeForDescriptor(desc, store, synthesized, doc, fieldNode) {
  // sh:class — reuse the existing class as the ui:Choice source.
  // Solid-ui enumerates instances at render time, so the option list
  // stays live as new instances are added to the data store.
  if (desc.classNode) {
    addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'from'), desc.classNode);
    return UI + 'Choice';
  }
  // sh:in with IRI options → ui:Choice + synthesized class.
  if (desc.enumOpts && desc.enumOpts.length > 0 && desc.enumOpts[0].termType === 'NamedNode') {
    const choiceClass = synthesizeEnumClass(store, synthesized, doc, desc);
    addTriple(store, synthesized, doc, fieldNode, rdf.sym(UI + 'from'), choiceClass);
    return UI + 'Choice';
  }
  // sh:in with literal options: no faithful ui:* mapping. Fall back to
  // a text field — solid-ui renders it; users type the value. (Adding
  // a class-with-instances mapping would change the stored RDF kind to
  // a URI, which we don't want here.)
  if (desc.enumOpts && desc.enumOpts.length > 0) {
    return UI + 'SingleLineTextField';
  }
  // IRI-valued single field.
  if (isIriKind(desc)) return UI + 'NamedNodeURIField';

  switch (desc.datatype) {
    case XSD + 'integer': return UI + 'IntegerField';
    case XSD + 'decimal':
    case XSD + 'double':
    case XSD + 'float':   return UI + 'DecimalField';
    case XSD + 'boolean': return UI + 'BooleanField';
    case XSD + 'date':    return UI + 'DateField';
    case XSD + 'dateTime':return UI + 'DateTimeField';
    case XSD + 'anyURI':  return UI + 'NamedNodeURIField';
    case XSD + 'string':
    default:              return UI + 'SingleLineTextField';
  }
}

function isIriKind(desc) {
  return desc.nodeKind === SH + 'IRI' ||
         desc.nodeKind === SH + 'IRIOrLiteral' ||
         desc.nodeKind === SH + 'BlankNodeOrIRI';
}

// Build a unique rdfs:Class and declare each enum URI as an instance of
// it, propagating rdfs:label from the shape so solid-ui's Choice shows
// human-friendly text in the dropdown.
function synthesizeEnumClass(store, synthesized, doc, desc) {
  const cls = rdf.blankNode();
  addTriple(store, synthesized, doc, cls, rdf.sym(RDF_NS + 'type'), rdf.sym(RDFS_NS + 'Class'));
  for (let i = 0; i < desc.enumOpts.length; i++) {
    const opt = desc.enumOpts[i];
    const node = rdf.sym(opt.value);
    addTriple(store, synthesized, doc, node, rdf.sym(RDF_NS + 'type'), cls);
    const label = desc.enumLabels?.[i];
    if (label && label !== opt.value) {
      addTriple(store, synthesized, doc, node, rdf.sym(RDFS_NS + 'label'), rdf.literal(label));
    }
  }
  return cls;
}

function addTriple(store, synthesized, g, s, p, o) {
  store.add(s, p, o, g);
  synthesized.push({ s, p, o, g });
}

/**
 * @typedef {Object} Targets
 * @property {Array} nodes       sh:targetNode values
 * @property {Array} classes     sh:targetClass values
 * @property {Array} subjectsOf  sh:targetSubjectsOf values
 */

/**
 * @typedef {Object} ShapeProp
 * @property {Object}    path         NamedNode — sh:path (the real predicate)
 * @property {string}    key          local part of the path URI (display key)
 * @property {?string}   datatype     xsd: URI string, or null
 * @property {?Array}    enumOpts     [{value, termType}, ...] from sh:in, or null
 * @property {?string[]} enumLabels   per-option rdfs:label (NamedNode opts), or null
 * @property {?string}   nodeKind     sh:nodeKind URI string, or null
 * @property {number}    minCount     sh:minCount (default 0)
 * @property {number}    maxCount     sh:maxCount (default Infinity)
 * @property {?string}   label        sh:name
 * @property {?string}   description  sh:description
 */
