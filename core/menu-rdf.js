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

/**
 * Parse a ui:Menu's parts into a tree of plain item descriptions.
 *
 * Each description has one of these shapes (no functions, no DOM):
 *
 *   { type: 'submenu',   name, children: [...] }
 *   { type: 'component', name, icon, tag, params, linkTarget }
 *   { type: 'link',      name, icon, href, contents, handlerTag, handlerParams, linkTarget }
 *
 * The host element is responsible for wrapping leaves with their render
 * closures (it owns the DOM and any handler-loading logic).
 */
export function parseMenuItems(store, menuNode, rootLinkTarget = null) {
  const partsNode = store.any(menuNode, rdf.sym(UI + 'parts'));
  if (!partsNode) return [];
  const parts = rdfListElements(store, partsNode);
  const menuType      = rdf.sym(UI + 'Menu');
  const componentType = rdf.sym(UI + 'Component');
  const typeNode      = rdf.sym(RDF + 'type');
  const items = [];

  for (const part of parts) {
    const partType = store.any(part, typeNode);
    const label    = rdfVal(store, part, 'label') || part.value;
    const icon     = rdfVal(store, part, 'icon');

    if (partType && partType.value === menuType.value) {
      items.push({
        type: 'submenu',
        name: label,
        children: parseMenuItems(store, part, rootLinkTarget),
      });
      continue;
    }

    if (partType && partType.value === componentType.value) {
      const { tag, params } = rdfComponent(store, part);
      const keepAliveLit = rdfVal(store, part, 'keepAlive');
      items.push({
        type: 'component',
        name: label,
        icon,
        tag,
        params,
        linkTarget: rootLinkTarget,
        keepAlive: keepAliveLit === 'true' || keepAliveLit === '1',
      });
      continue;
    }

    const href        = rdfVal(store, part, 'href');
    const handlerNode = store.any(part, rdf.sym(UI + 'handler'));
    const { tag: handlerTag, params: handlerParams } = rdfComponent(store, handlerNode);
    const contents    = rdfVal(store, part, 'contents');
    items.push({
      type: 'link',
      name: label,
      icon,
      href,
      contents,
      handlerTag,
      handlerParams,
      linkTarget: rootLinkTarget,
    });
  }
  return items;
}

/**
 * Resolve `uri` (optionally relative to `baseUri`), fetch the RDF doc,
 * locate the menu root (by fragment or by ui:Menu type), and parse it.
 *
 * @returns {Promise<null | { items, orientation, linkTarget }>}
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

  const linkTarget  = rdfVal(store, root, 'linkTarget');
  const orientation = rdfVal(store, root, 'orientation') || 'horizontal';
  const items       = parseMenuItems(store, root, linkTarget);
  return { items, orientation, linkTarget };
}
