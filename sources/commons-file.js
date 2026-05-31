/**
 * sources/commons-file.js — image provider backed by a curated local file.
 *
 * The collection list comes from a hand-maintained SKOS/DCAT document
 * (omp's libraries/wikimedia_images/images.ttl): a `skos:ConceptScheme` of
 * topics over `dcat:Dataset` collections, each pointing at a Commons category
 * via `dcat:landingPage`. Topics are LOCAL (owned by the host) — this provider
 * surfaces them through `catalog()` so the host can build its topic /
 * collection selectors; `search()` flattens them into CollectionRecord RDF for
 * interface parity with live-search providers.
 *
 * `load()` is not file-specific at all — once a collection resolves to a
 * Commons category it delegates to the shared `loadCategory`, identical to the
 * (future) wikidata-images provider.
 */

import { parseBookmarkTree } from '../web/utils/feed-fetch.js';
import { rdf } from '../core/rdf.js';
import { addCollection } from './contract.js';
import { loadCategory } from './commons.js';
import { registerProvider } from './registry.js';

/**
 * Walk a parseBookmarkTree node depth-first, collecting every collection with
 * the IRI of the topic it sits under (its `dcat:theme`).
 * @returns {Array<{iri:string,title:string,landingPage:string,theme:string}>}
 */
function flattenCollections(node, out = []) {
  for (const coll of node.collections || []) {
    out.push({
      iri:         coll.uri || coll.url,
      title:       coll.label || '',
      landingPage: coll.url,
      theme:       node.uri,
    });
  }
  for (const child of node.topics || []) flattenCollections(child, out);
  return out;
}

/**
 * The local topic/collection tree, for the host's selector columns.
 * Returns parseBookmarkTree's shape: `{uri,label,topics[],collections[]}`.
 * @param {string} source  "<file>#<RootTopic>"
 * @param {object} [opts]   { proxy }
 */
export function catalog(source, opts = {}) {
  return parseBookmarkTree(source, opts);
}

/**
 * search() — yield CollectionRecord RDF for the file's collections. Honours an
 * optional case-insensitive substring `query` over titles. (Topics are local,
 * so they are NOT emitted here — they ride `dcat:theme` for hosts that want it,
 * but the authoritative topic tree comes from catalog().)
 * @param {string} [query]
 * @param {object} [opts]  { source, proxy }
 * @yields {object} an rdflib store of CollectionRecords
 */
export async function* search(query, { source, proxy } = {}) {
  if (!source) throw new Error('commons-file.search: a `source` option is required');
  const tree = await parseBookmarkTree(source, { proxy });
  const colls = flattenCollections(tree);
  const q = (query || '').trim().toLowerCase();
  const store = rdf.graph();
  for (const c of colls) {
    if (q && !c.title.toLowerCase().includes(q)) continue;
    addCollection(store, c);
  }
  yield store;
}

/** @type {import('./contract.js').Provider} */
export const commonsFileProvider = {
  id: 'commons-file',
  label: 'Images',
  kinds: ['image'],
  display: 'sol-gallery',
  capabilities: { search: true, load: true },
  search,
  load: loadCategory,
  // Extra, file-specific affordance the host uses for its local topic columns.
  catalog,
};

registerProvider(commonsFileProvider);
