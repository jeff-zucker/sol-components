/**
 * sources/contract.js — the shared image vocab + RDF read/write helpers.
 *
 * A *fetcher* (e.g. commons.js) acquires data and writes it as RDF; a *display*
 * (e.g. <sol-gallery>) reads that RDF and renders it. Neither knows the other's
 * origin — RDF is the only interchange, shaped as **one envelope + a typed
 * payload per media kind** (see PLAN-source-adapters in the omp repo).
 *
 * This module owns the image vocab (schema.org + dcat) and the read/write
 * helpers both sides share, so the bytes on the wire have exactly one
 * definition. Fetchers WRITE records with the `add*` helpers; displays READ
 * them with the `read*` helpers.
 *
 *   CollectionRecord — a browsable grouping (`dcat:Dataset` / `schema:ImageGallery`)
 *   ImageItem        — one picture (`schema:ImageObject`)
 *
 * @typedef {object} ImageFields
 * @property {string}  iri          stable IRI for the image (its detail page)
 * @property {string}  thumb        masonry thumbnail URL  (schema:thumbnailUrl)
 * @property {string}  full         full-res URL           (schema:contentUrl)
 * @property {number} [width]       thumb width            (schema:width)
 * @property {number} [height]      thumb height           (schema:height)
 * @property {string} [caption]     title / caption        (schema:caption)
 * @property {string} [license]     license short name     (schema:license)
 * @property {string} [author]      attribution            (schema:author)
 * @property {string} [detailUrl]   "View on…" page        (schema:mainEntityOfPage)
 * @property {number} [position]    display order          (schema:position)
 */

import { rdf } from '../core/rdf.js';

export const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  schema: 'http://schema.org/',
  dcat:   'http://www.w3.org/ns/dcat#',
  dct:    'http://purl.org/dc/terms/',
  skos:   'http://www.w3.org/2004/02/skos/core#',
};

const sym = (u) => rdf.sym(u);
const lit = (v) => rdf.literal(String(v));
const a   = sym(NS.rdf + 'type');

/** First object value for (s, predicateUri) as a string, or ''. */
function valueOf(store, s, predUri) {
  const o = store.any(s, sym(predUri));
  return o ? o.value : '';
}
function numOf(store, s, predUri) {
  const v = valueOf(store, s, predUri);
  return v === '' ? undefined : Number(v);
}

/* ── ImageItem (schema:ImageObject) ─────────────────────────────────────── */

/**
 * Write one image into `store` as a schema:ImageObject.
 * @param {object} store  an rdflib store
 * @param {ImageFields} f
 * @returns {object} the subject NamedNode
 */
export function addImageItem(store, f) {
  const s = sym(f.iri);
  store.add(s, a, sym(NS.schema + 'ImageObject'));
  if (f.thumb)     store.add(s, sym(NS.schema + 'thumbnailUrl'), sym(f.thumb));
  if (f.full)      store.add(s, sym(NS.schema + 'contentUrl'),   sym(f.full));
  if (f.width)     store.add(s, sym(NS.schema + 'width'),        lit(f.width));
  if (f.height)    store.add(s, sym(NS.schema + 'height'),       lit(f.height));
  if (f.caption)   store.add(s, sym(NS.schema + 'caption'),      lit(f.caption));
  if (f.license)   store.add(s, sym(NS.schema + 'license'),      lit(f.license));
  if (f.author)    store.add(s, sym(NS.schema + 'author'),       lit(f.author));
  if (f.detailUrl) store.add(s, sym(NS.schema + 'mainEntityOfPage'), sym(f.detailUrl));
  if (f.position != null) store.add(s, sym(NS.schema + 'position'), lit(f.position));
  return s;
}

/**
 * Read every schema:ImageObject out of `store`, sorted by schema:position
 * (insertion order). The shape is what a display renders.
 * @returns {Array<{iri,thumb,full,width,height,caption,license,author,detailUrl,position}>}
 */
export function readImageItems(store) {
  const subjects = store.each(undefined, a, sym(NS.schema + 'ImageObject'));
  const items = subjects.map((s) => ({
    iri:       s.value,
    thumb:     valueOf(store, s, NS.schema + 'thumbnailUrl'),
    full:      valueOf(store, s, NS.schema + 'contentUrl'),
    width:     numOf(store, s, NS.schema + 'width'),
    height:    numOf(store, s, NS.schema + 'height'),
    caption:   valueOf(store, s, NS.schema + 'caption'),
    license:   valueOf(store, s, NS.schema + 'license'),
    author:    valueOf(store, s, NS.schema + 'author'),
    detailUrl: valueOf(store, s, NS.schema + 'mainEntityOfPage'),
    position:  numOf(store, s, NS.schema + 'position') ?? 0,
  }));
  items.sort((x, y) => x.position - y.position);
  return items;
}

/* ── CollectionRecord (dcat:Dataset / schema:ImageGallery) ───────────────── */

/**
 * Write one collection into `store`.
 * @param {object} store
 * @param {{iri:string,title?:string,landingPage?:string,theme?:string}} f
 *        `landingPage` is the load() ref (for images, a Commons category URL);
 *        `theme` is a LOCAL topic IRI (only the file path sets it — search
 *        results have no topic until curated).
 */
export function addCollection(store, f) {
  const s = sym(f.iri);
  store.add(s, a, sym(NS.dcat + 'Dataset'));
  store.add(s, a, sym(NS.schema + 'ImageGallery'));
  if (f.title)       store.add(s, sym(NS.dct + 'title'),         lit(f.title));
  if (f.landingPage) store.add(s, sym(NS.dcat + 'landingPage'),  sym(f.landingPage));
  if (f.theme)       store.add(s, sym(NS.dcat + 'theme'),        sym(f.theme));
  return s;
}

/** Read every dcat:Dataset out of `store`. */
export function readCollections(store) {
  const subjects = store.each(undefined, a, sym(NS.dcat + 'Dataset'));
  return subjects.map((s) => ({
    iri:         s.value,
    title:       valueOf(store, s, NS.dct + 'title'),
    landingPage: valueOf(store, s, NS.dcat + 'landingPage'),
    theme:       valueOf(store, s, NS.dcat + 'theme'),
  }));
}
