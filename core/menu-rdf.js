// Pure RDF→menu-item parsing helpers used by <sol-menu>'s `from-rdf`
// attribute. No DOM dependencies — `parseMenuItems` and friends return
// plain JS descriptions that the host element wraps with render closures.

import { rdf } from './rdf.js';
import { loadRdfStore } from './rdf-utils.js';

const UI     = 'http://www.w3.org/ns/ui#';
const RDF    = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SCHEMA = 'http://schema.org/';

// Read a single ui:<localName> property of `subject` from `store`.
export function rdfVal(store, subject, localName) {
  const node = store.any(subject, rdf.sym(UI + localName));
  return node ? node.value : null;
}

// Walk an rdf:List, returning its elements as an array.
export function rdfListElements(store, listNode) {
  if (listNode.elements) return listNode.elements;
  const items = [];
  let cur = listNode;
  const nil   = rdf.sym(RDF + 'nil');
  const first = rdf.sym(RDF + 'first');
  const rest  = rdf.sym(RDF + 'rest');
  while (cur && cur.value !== nil.value) {
    const el = store.any(cur, first);
    if (el) items.push(el);
    cur = store.any(cur, rest);
  }
  return items;
}

// Read a ui:Component (or handler) node into { tag, params } where
// params is [[name, value], ...] from ui:attribute / ui:parameter blanks.
export function rdfComponent(store, node) {
  if (!node) return { tag: null, params: [] };
  const tag = rdfVal(store, node, 'name') || rdfVal(store, node, 'label');
  const attrNodes  = store.each(node, rdf.sym(UI + 'attribute'),  null);
  const paramNodes = store.each(node, rdf.sym(UI + 'parameter'),  null);
  const params = [...attrNodes, ...paramNodes].map(p => [
    (store.any(p, rdf.sym(SCHEMA + 'name'))  || {}).value || '',
    (store.any(p, rdf.sym(SCHEMA + 'value')) || {}).value || '',
  ]).filter(([k]) => k);
  return { tag, params };
}

// The fragment of a subject IRI (e.g. ".../menu.ttl#Settings" → "Settings"),
// used as the item's stable id so an HTML region can claim it via data-for.
function fragmentOf(node) {
  const v = (node && node.value) || '';
  const i = v.indexOf('#');
  return i >= 0 ? v.slice(i + 1) : null;
}

// Normalize a ui:orientation value to the "horizontal"/"vertical" token used
// by the HTML attribute layer. Accepts a ui:Orientation instance IRI
// (ui:Horizontal → "horizontal") or a legacy literal ("horizontal").
function orientationToken(v) {
  if (!v) return null;
  const local = v.includes('#') ? v.slice(v.indexOf('#') + 1) : v;
  return local.toLowerCase();
}

/**
 * Parse a ui:Menu's parts into a tree of plain item descriptions.
 *
 * Each description has one of these shapes (no functions, no DOM):
 *
 *   { type: 'submenu',   id, name, children: [...] }
 *   { type: 'component', id, name, icon, tag, params }
 *   { type: 'link',      id, name, icon, href, contents }
 *
 * No display info lives in the RDF — `where/how/lifetime` are resolved from
 * the HTML at render time (region= cascade, data-for, surface keywords). `id`
 * is the item's IRI fragment, the join key an HTML region uses to claim it.
 */
export function parseMenuItems(store, menuNode) {
  const partsNode = store.any(menuNode, rdf.sym(UI + 'parts'));
  if (!partsNode) return [];
  const parts = rdfListElements(store, partsNode);
  const menuType      = rdf.sym(UI + 'Menu');
  const componentType = rdf.sym(UI + 'Component');
  const typeNode      = rdf.sym(RDF + 'type');
  const items = [];

  for (const part of parts) {
    const partType = store.any(part, typeNode);
    const id       = fragmentOf(part);
    const label    = rdfVal(store, part, 'label') || part.value;
    const icon     = rdfVal(store, part, 'icon');

    if (partType && partType.value === menuType.value) {
      items.push({ type: 'submenu', id, name: label, children: parseMenuItems(store, part) });
      continue;
    }

    if (partType && partType.value === componentType.value) {
      const { tag, params } = rdfComponent(store, part);
      items.push({ type: 'component', id, name: label, icon, tag, params });
      continue;
    }

    const href     = rdfVal(store, part, 'href');
    const contents = rdfVal(store, part, 'contents');
    items.push({ type: 'link', id, name: label, icon, href, contents });
  }
  return items;
}

/**
 * Resolve `uri` (optionally relative to `baseUri`), fetch the RDF doc,
 * locate the menu root (by fragment or by ui:Menu type), and parse it.
 *
 * @returns {Promise<null | { items, orientation }>}
 *   `null` if no ui:Menu is found in the document.
 */
export async function loadMenuFromUri(uri, baseUri = null) {
  let docUrl, fragment;
  try {
    const parsed = new URL(uri, baseUri || undefined);
    fragment = parsed.hash.slice(1);
    parsed.hash = '';
    docUrl = parsed.href;
  } catch {
    docUrl = uri;
    fragment = '';
  }

  const store = await loadRdfStore(docUrl);
  let root;
  if (fragment) {
    root = rdf.sym(docUrl + '#' + fragment);
  } else {
    const menuType = rdf.sym(UI + 'Menu');
    const typeNode = rdf.sym(RDF + 'type');
    root = store.each(null, typeNode, menuType)[0];
  }
  if (!root) return null;

  const orientation = orientationToken(rdfVal(store, root, 'orientation')) || 'horizontal';
  const items       = parseMenuItems(store, root);
  return { items, orientation };
}
