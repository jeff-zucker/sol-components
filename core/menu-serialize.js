// menu-serialize — the write half of core/menu-rdf.js: turn an edited tree of
// plain item descriptions back into a complete Turtle document.
//
// Contract (mirrors parseMenuItems exactly):
//   { type: 'submenu',   id, name, children: [...] }
//   { type: 'component', id, name, icon, region, requiresWrite, tag, params }
//   { type: 'link',      id, name, icon, region, requiresWrite, href, contents }
// `region` is the lowercase ui:Region token (e.g. "modal"), written as
// ui:region ui:Modal — the one display property stored in the RDF.
//
// The WHOLE document is rewritten on save (rdf:Lists are miserable to PATCH
// in place), with one preservation rule: every subject in the original store
// that is NOT part of the rebuilt menu tree is re-emitted untouched. That
// keeps "pantry" items — subjects defined in the doc but not referenced from
// any ui:parts list — across edits, and means removing an item from a menu
// parks it in the pantry rather than destroying it (callers wanting a hard
// delete remove the subject's statements themselves before serializing).

import { rdf } from './rdf.js';

const UI     = 'http://www.w3.org/ns/ui#';
const RDF    = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS   = 'http://www.w3.org/2000/01/rdf-schema#';
const SCHEMA = 'http://schema.org/';
const ACL    = 'http://www.w3.org/ns/auth/acl#';

const ui   = (l) => rdf.sym(UI + l);
const rdfs = (l) => rdf.sym(RDFS + l);
const acl  = (l) => rdf.sym(ACL + l);
const sch  = (l) => rdf.sym(SCHEMA + l);
const a   = rdf.sym(RDF + 'type');

/** Fragment → full IRI node in `docUrl`. */
function fragNode(docUrl, fragment) {
  return rdf.sym(docUrl.split('#')[0] + '#' + fragment);
}

/** Slugify a label into a fragment id; `taken` is a Set of used fragments. */
export function mintFragment(label, taken) {
  const base = String(label || 'item')
    .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
  let frag = base, n = 2;
  while (taken.has(frag)) frag = `${base}-${n++}`;
  taken.add(frag);
  return frag;
}

/** Every fragment already used as a subject in the doc. */
function usedFragments(store, docUrl) {
  const doc = docUrl.split('#')[0];
  const taken = new Set();
  for (const st of store.statementsMatching(null, null, null)) {
    for (const t of [st.subject, st.object]) {
      const v = t && t.value;
      if (typeof v === 'string' && v.startsWith(doc + '#')) taken.add(v.slice(doc.length + 1));
    }
  }
  return taken;
}

/** Remove every statement whose subject is `node`, plus its attribute blanks.
 *  (removeMatches, not remove(st)-in-a-loop — rdflib's remove() skips entries
 *  when several statements share a subject.) */
function removeSubject(store, node) {
  const blanks = store.each(node, ui('attribute'), null);
  for (const blank of blanks) store.removeMatches(blank, null, null);
  store.removeMatches(node, null, null);
}

/** Remove a menu node's own triples incl. its parts list cells (both
 *  Collection-valued and rdf:first/rest-chained forms). */
function removeMenuNode(store, menuNode) {
  const partsNode = store.any(menuNode, ui('parts'));
  if (partsNode && !partsNode.elements) {
    // first/rest chain — collect the cells, then drop them
    const nil = RDF + 'nil';
    const cells = [];
    let cur = partsNode;
    while (cur && cur.value !== nil) {
      cells.push(cur);
      cur = store.any(cur, rdf.sym(RDF + 'rest'));
    }
    for (const cell of cells) store.removeMatches(cell, null, null);
  }
  removeSubject(store, menuNode);
}

/** Collect the item nodes a tree references (recursively), so their old
 *  statements can be cleared before re-emit. */
function treeNodes(store, docUrl, items, out = []) {
  for (const item of items || []) {
    if (item.id) out.push(fragNode(docUrl, item.id));
    if (item.type === 'submenu') treeNodes(store, docUrl, item.children, out);
  }
  return out;
}

function emitItem(store, docUrl, doc, item, taken) {
  if (!item.id) item.id = mintFragment(item.name, taken);
  const node = fragNode(docUrl, item.id);

  if (item.type === 'submenu') {
    emitMenu(store, docUrl, doc, node, {
      label: item.name, items: item.children, requiresWrite: item.requiresWrite, comment: item.comment,
    }, taken);
    return node;
  }

  if (item.name != null) store.add(node, ui('label'), rdf.literal(String(item.name)), doc);
  if (item.comment) store.add(node, rdfs('comment'), rdf.literal(String(item.comment)), doc);
  if (item.icon) store.add(node, ui('icon'), rdf.literal(String(item.icon)), doc);
  if (item.region) {
    const local = item.region[0].toUpperCase() + item.region.slice(1).toLowerCase();
    store.add(node, ui('region'), ui(local), doc);
  }
  if (item.requiresWrite) store.add(node, acl('mode'), acl('Write'), doc);

  if (item.type === 'component') {
    store.add(node, a, ui('Component'), doc);
    if (item.tag) store.add(node, ui('name'), rdf.literal(String(item.tag)), doc);
    for (const [k, v] of item.params || []) {
      if (!k) continue;
      const b = rdf.blankNode();
      store.add(b, sch('name'), rdf.literal(String(k)), doc);
      store.add(b, sch('value'), rdf.literal(String(v ?? '')), doc);
      store.add(node, ui('attribute'), b, doc);
    }
  } else {
    store.add(node, a, ui('Link'), doc);
    if (item.href != null) store.add(node, ui('href'), rdf.literal(String(item.href)), doc);
    if (item.contents != null) store.add(node, ui('contents'), rdf.literal(String(item.contents)), doc);
  }
  return node;
}

function emitMenu(store, docUrl, doc, menuNode, { label, orientation, items, requiresWrite, comment }, taken) {
  store.add(menuNode, a, ui('Menu'), doc);
  if (label != null) store.add(menuNode, ui('label'), rdf.literal(String(label)), doc);
  if (comment) store.add(menuNode, rdfs('comment'), rdf.literal(String(comment)), doc);
  if (orientation) {
    const local = orientation[0].toUpperCase() + orientation.slice(1).toLowerCase();
    store.add(menuNode, ui('orientation'), ui(local), doc);
  }
  if (requiresWrite) store.add(menuNode, acl('mode'), acl('Write'), doc);
  const nodes = (items || []).map((item) => emitItem(store, docUrl, doc, item, taken));
  store.add(menuNode, ui('parts'), new rdf.Collection(nodes), doc);
}

/**
 * Replace one ui:Menu (by IRI-with-fragment) inside the store with the edited
 * tree. Items present in the new tree are fully re-emitted; subjects no
 * longer referenced stay as pantry. Mutates the store.
 *
 * @param store rdflib store holding the parsed original document
 * @param docUrl the document URL (graph name)
 * @param menuIri full IRI of the menu root (e.g. `${docUrl}#Tabs`)
 * @param menu   { label, orientation, items }
 */
export function updateMenuInStore(store, docUrl, menuIri, menu) {
  const doc = rdf.sym(docUrl.split('#')[0]);
  const menuNode = rdf.sym(menuIri);
  const taken = usedFragments(store, docUrl);
  // Clear what's being rebuilt: the menu node (and its old list), every item
  // the NEW tree references, and any old SUBMENU nodes the new tree carries.
  for (const node of treeNodes(store, docUrl, menu.items)) {
    if (store.any(node, ui('parts'))) removeMenuNode(store, node);
    else removeSubject(store, node);
  }
  removeMenuNode(store, menuNode);
  emitMenu(store, docUrl, doc, menuNode, menu, taken);
}

/** Serialize the document graph to Turtle (rdflib's serialize is async). */
export async function serializeMenuDocument(store, docUrl) {
  const doc = rdf.sym(docUrl.split('#')[0]);
  return rdf.serialize(doc, store, doc.value, 'text/turtle');
}

/**
 * Convenience: apply edits for one or more menus and return the Turtle for
 * the whole document (pantry subjects included).
 * `menus` = [{ iri, label, orientation, items }]
 */
export async function rewriteMenuDocument(store, docUrl, menus) {
  for (const m of menus) updateMenuInStore(store, docUrl, m.iri, m);
  return serializeMenuDocument(store, docUrl);
}
