// menu-serialize — the write half of core/menu-rdf.js: turn an edited tree of
// plain item descriptions back into a complete Turtle document.
//
// Contract (mirrors parseMenuItems exactly):
//   { type: 'submenu',   id, name, view, children: [...] }
//   { type: 'component', id, name, icon, region, requiresWrite, tag, params }
//   { type: 'link',      id, name, icon, region, requiresWrite, href, contents }
// `region` is the lowercase ui:Region token (e.g. "modal"), written as
// ui:region ui:Modal — the one display property stored in the RDF.
//
// Membership is positioned schema:ListItem wrappers (2026-07-19, replacing
// ui:parts rdf:Collections): the menu carries one schema:itemListElement
// triple per member, each pointing at a wrapper with schema:item +
// schema:position. Statement-level PATCHes (swap two positions, insert/delete
// one wrapper) are now possible; this module still rewrites the WHOLE
// document on editor saves, with one preservation rule: every subject in the
// original store that is NOT part of the rebuilt menu tree is re-emitted
// untouched. That keeps "pantry" items — subjects defined in the doc but not
// referenced from any menu's membership — across edits, and means removing an
// item from a menu parks it in the pantry rather than destroying it (callers
// wanting a hard delete remove the subject's statements themselves before
// serializing).

import { rdf } from './rdf.js';
import { gatedByParams } from './menu-rdf.js';

const UI     = 'http://www.w3.org/ns/ui#';
const RDF    = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS   = 'http://www.w3.org/2000/01/rdf-schema#';
const SCHEMA = 'http://schema.org/';
const ACL    = 'http://www.w3.org/ns/auth/acl#';
const DCT    = 'http://purl.org/dc/terms/';
const XSD    = 'http://www.w3.org/2001/XMLSchema#';

const ui   = (l) => rdf.sym(UI + l);
const rdfs = (l) => rdf.sym(RDFS + l);
const acl  = (l) => rdf.sym(ACL + l);
const sch  = (l) => rdf.sym(SCHEMA + l);
const a   = rdf.sym(RDF + 'type');

const REGION_KINDS = new Set(['inline', 'element', 'modal', 'floating', 'window', 'tab', 'dropdown']);
// A menu/item region → its RDF object: a ui:Region KIND writes as ui:<Kind>; a
// TARGET selector (e.g. "#dk-menu-pane", "main") writes as a string literal —
// the round-trip inverse of menu-rdf's regionToken.
const regionObject = (region) => {
  const r = String(region);
  return REGION_KINDS.has(r.toLowerCase())
    ? ui(r[0].toUpperCase() + r.slice(1).toLowerCase())
    : rdf.literal(r);
};

/** Fragment → full IRI node in `docUrl`. */
function fragNode(docUrl, fragment) {
  return rdf.sym(docUrl.split('#')[0] + '#' + fragment);
}

/** The fragment of a node's IRI, or null. */
function fragOf(node) {
  const v = (node && node.value) || '';
  const i = v.indexOf('#');
  return i >= 0 ? v.slice(i + 1) : null;
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
  const blanks = store.each(node, sch('additionalProperty'), null);
  for (const blank of blanks) store.removeMatches(blank, null, null);
  store.removeMatches(node, null, null);
}

/** Remove a node's own triples incl. its placement wrappers: any
 *  schema:itemListElement member that carries schema:item is a wrapper this
 *  node owns (direct members are references, not ours to clear). No-op loop
 *  for non-menu nodes, so this is safe to call on every tree node. */
function removeMenuNode(store, menuNode) {
  for (const entry of store.each(menuNode, sch('itemListElement'), null)) {
    if (store.any(entry, sch('item'))) store.removeMatches(entry, null, null);
  }
  removeSubject(store, menuNode);
}

/** Collect the item nodes a tree references (recursively), so their old
 *  statements can be cleared before re-emit. ui:Plugin ENTRIES (item.entry —
 *  plugin-manifest-unification stage 2) are excluded: the menu doc only holds
 *  a REFERENCE to them; their bodies live in the catalog doc and must never
 *  be cleared or re-emitted by a menu save. */
function treeNodes(store, docUrl, items, out = []) {
  for (const item of items || []) {
    if (item.entry) continue;
    if (item.id) out.push(fragNode(docUrl, item.id));
    if (item.type === 'submenu') treeNodes(store, docUrl, item.children, out);
  }
  return out;
}

// schema:additionalProperty blank-node pairs. Shared by the component branch
// (attributes on the mounted element) and the link branch (search params on the
// outbound URL) so the two spellings can never drift apart.
function emitParams(store, doc, node, params) {
  for (const [k, v] of params || []) {
    if (!k) continue;
    const b = rdf.blankNode();
    store.add(b, sch('name'), rdf.literal(String(k)), doc);
    store.add(b, sch('value'), rdf.literal(String(v ?? '')), doc);
    store.add(node, sch('additionalProperty'), b, doc);
  }
}

function emitItem(store, docUrl, doc, item, taken) {
  // A ui:Plugin entry re-emits as its REFERENCE — the bare entry IRI in the
  // parts list. No body statements: the entry is not this doc's to write.
  if (item.entry) return rdf.sym(String(item.entry));

  if (!item.id) item.id = mintFragment(item.name, taken);
  const node = fragNode(docUrl, item.id);

  if (item.type === 'submenu') {
    emitMenu(store, docUrl, doc, node, {
      label: item.name, items: item.children, requiresWrite: item.requiresWrite,
      comment: item.comment, view: item.view,
    }, taken);
    return node;
  }

  if (item.name != null) store.add(node, ui('label'), rdf.literal(String(item.name)), doc);
  if (item.comment) store.add(node, rdfs('comment'), rdf.literal(String(item.comment)), doc);
  if (item.publisher) store.add(node, rdf.sym(DCT + 'publisher'), rdf.literal(String(item.publisher)), doc);
  // dct:source = the chip's MANIFEST IRI (its stable identity), emitted as a
  // RESOURCE so a mounted item links back to its catalog plugin. This is what
  // lets the pantry know a chip is in use without guessing from tag+params.
  if (item.manifest) store.add(node, rdf.sym(DCT + 'source'), rdf.sym(String(item.manifest)), doc);
  if (item.icon) store.add(node, ui('icon'), rdf.literal(String(item.icon)), doc);
  // Placement: a COMPONENT stores region as a `region` schema:additionalProperty (the
  // attribute channel — see the params loop below); the ui:region triple is
  // written only for links, which have no attribute channel. Parsing strips
  // `region` from params into the structural field, so re-adding it here is
  // the write half of that round trip.
  // An inherited region (filled in from the menu's ui:region default at
  // parse) is never written back onto the item — the default stays on the
  // menu; only an item's OWN placement is materialized.
  if (item.region && !item.regionInherited && item.type !== 'component') {
    store.add(node, ui('region'), regionObject(item.region), doc);
  }
  // The attribute spelling (an empty-valued `if-logged-in` / `requires-write`
  // param) round-trips through the params below — emitting acl:mode as well
  // would double-declare the gate and resurrect the triple on every save.
  // Only a legacy acl-only item still gets the triple.
  if (item.requiresWrite && !gatedByParams(item.params)) store.add(node, acl('mode'), acl('Write'), doc);

  if (item.type === 'component') {
    // ONE payload predicate everywhere (2026-07-19): schema:url. An inline
    // command (module-less, `command` carries its registry fragment IRI)
    // types as ui:Command; a mountable component types as ui:Component with
    // its module as the url (the tag derives from the filename — the
    // retired ui:name spelling is never written). A component with neither
    // module nor command url gets NO payload triple (visible to SHACL
    // validation rather than silently mis-spelled).
    if (!item.module && item.command) {
      store.add(node, a, ui('Command'), doc);
      store.add(node, sch('url'), rdf.sym(String(item.command)), doc);
    } else {
      store.add(node, a, ui('Component'), doc);
      if (item.module) store.add(node, sch('url'), rdf.sym(String(item.module)), doc);
      else console.warn(`[menu-serialize] component "${item.name || item.tag}" has no module url — payload omitted`);
    }
    // region re-joins the attribute list on write (deduped — in-memory params
    // are region-free after parse, but be safe against hand-built items).
    // Inherited menu-default regions are skipped (see writeItem's region
    // block above).
    const params = (item.params || []).filter(([k]) => k !== 'region');
    if (item.region && !item.regionInherited) params.push(['region', String(item.region).toLowerCase()]);
    emitParams(store, doc, node, params);
  } else {
    store.add(node, a, ui('Link'), doc);
    if (item.href != null) store.add(node, sch('url'), rdf.literal(String(item.href)), doc);
    if (item.contents != null) store.add(node, ui('contents'), rdf.literal(String(item.contents)), doc);
    // A link's placement is the ui:region triple written above, NOT an
    // attribute — so region never re-joins the param list here.
    emitParams(store, doc, node, (item.params || []).filter(([k]) => k !== 'region'));
  }
  return node;
}

function emitMenu(store, docUrl, doc, menuNode, { label, orientation, view, region, regionRef, items, requiresWrite, comment }, taken) {
  store.add(menuNode, a, ui('Menu'), doc);
  if (label != null) store.add(menuNode, ui('label'), rdf.literal(String(label)), doc);
  if (comment) store.add(menuNode, rdfs('comment'), rdf.literal(String(comment)), doc);
  if (orientation) {
    const local = orientation[0].toUpperCase() + orientation.slice(1).toLowerCase();
    store.add(menuNode, ui('orientation'), ui(local), doc);
  }
  // The menu's view (ui:view, a ui:View subclass) round-trips like
  // orientation: written only when the tree carries one, never invented.
  if (view) store.add(menuNode, ui('view'), ui(String(view)), doc);
  // Menu-level default placement (ui:region on the MENU) round-trips like
  // orientation; members that inherit it carry no region of their own. A TARGET
  // region is a NODE reference (regionRef, e.g. shell:MenuPane) — the menu→region
  // link is written as a resource, not a selector string; a KIND keyword still
  // goes through regionObject as ui:<Kind>.
  if (regionRef) {
    store.add(menuNode, ui('region'), rdf.sym(regionRef), doc);
  } else if (region) {
    store.add(menuNode, ui('region'), regionObject(region), doc);
  }
  if (requiresWrite) store.add(menuNode, acl('mode'), acl('Write'), doc);
  const nodes = (items || []).map((item) => emitItem(store, docUrl, doc, item, taken));
  // Membership: one positioned schema:ListItem wrapper per member. Wrapper
  // fragments are DETERMINISTIC (`<menuFrag>-<memberFrag>`) so an unchanged
  // menu serializes identically across saves; the old wrappers were cleared
  // by removeMenuNode before this re-emit, so reusing the names is safe.
  if (!nodes.length) return;
  const menuFrag = fragOf(menuNode) || 'menu';
  const local = new Set();
  nodes.forEach((node, i) => {
    const base = `${menuFrag}-${fragOf(node) || `item-${i + 1}`}`;
    let frag = base, n = 2;
    while (local.has(frag) || store.any(fragNode(docUrl, frag), null, null)) frag = `${base}-${n++}`;
    local.add(frag);
    const wrap = fragNode(docUrl, frag);
    store.add(menuNode, sch('itemListElement'), wrap, doc);
    store.add(wrap, a, sch('ListItem'), doc);
    store.add(wrap, sch('item'), node, doc);
    store.add(wrap, sch('position'), rdf.literal(String(i + 1), rdf.sym(XSD + 'integer')), doc);
  });
}

/**
 * Replace one ui:Menu (by IRI-with-fragment) inside the store with the edited
 * tree. Items present in the new tree are fully re-emitted; subjects no
 * longer referenced stay as pantry. Mutates the store.
 *
 * @param store rdflib store holding the parsed original document
 * @param docUrl the document URL (graph name)
 * @param menuIri full IRI of the menu root (e.g. `${docUrl}#Tabs`)
 * @param menu   { label, orientation, view, region, items }
 */
export function updateMenuInStore(store, docUrl, menuIri, menu) {
  const doc = rdf.sym(docUrl.split('#')[0]);
  const menuNode = rdf.sym(menuIri);
  const taken = usedFragments(store, docUrl);
  // emitItem re-emits only the predicates it knows; a rebuilt entry would lose
  // any dct:source provenance (added so the catalog can find a plugin's
  // manifest). Snapshot it before the clear and re-attach after the re-emit.
  const provenance = new Map();
  for (const node of treeNodes(store, docUrl, menu.items)) {
    const src = store.any(node, rdf.sym(DCT + 'source'));
    if (src) provenance.set(node.value, src);
  }
  // Clear what's being rebuilt: the menu node (and its old wrappers), every
  // item the NEW tree references, and any old SUBMENU nodes (plus THEIR
  // wrappers) the new tree carries.
  for (const node of treeNodes(store, docUrl, menu.items)) {
    removeMenuNode(store, node);
  }
  removeMenuNode(store, menuNode);
  emitMenu(store, docUrl, doc, menuNode, menu, taken);
  for (const [nodeVal, src] of provenance) {
    store.add(rdf.sym(nodeVal), rdf.sym(DCT + 'source'), src, doc);
  }
}

/** Serialize the document graph to Turtle (rdflib's serialize is async). */
export async function serializeMenuDocument(store, docUrl) {
  const doc = rdf.sym(docUrl.split('#')[0]);
  return rdf.serialize(doc, store, doc.value, 'text/turtle');
}

/**
 * Convenience: apply edits for one or more menus and return the Turtle for
 * the whole document (pantry subjects included).
 * `menus` = [{ iri, label, orientation, region, items }]
 */
export async function rewriteMenuDocument(store, docUrl, menus) {
  for (const m of menus) updateMenuInStore(store, docUrl, m.iri, m);
  return serializeMenuDocument(store, docUrl);
}
