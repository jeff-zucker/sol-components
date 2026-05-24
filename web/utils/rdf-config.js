/**
 * rdf-config.js — read a subject's direct properties from a Turtle
 * file as a flat `{ predicateUri: value | value[] }` JS object.
 *
 * Companion to `feed-fetch.js#parseSourceList`. Config files follow
 * the direct-predicate pattern documented in
 * claude/plans/PLAN-vocab-migration.md:
 *
 *   @prefix geo:    <http://www.w3.org/2003/01/geo/wgs84_pos#> .
 *   @prefix schema: <http://schema.org/> .
 *
 *   <#Settings>
 *     geo:lat 45.52 ;
 *     geo:long -122.68 ;
 *     schema:addressLocality "Portland, OR" .
 *
 * resolves to:
 *
 *   {
 *     'http://www.w3.org/2003/01/geo/wgs84_pos#lat':       45.52,
 *     'http://www.w3.org/2003/01/geo/wgs84_pos#long':     -122.68,
 *     'http://schema.org/addressLocality':                "Portland, OR",
 *   }
 *
 * Multi-valued predicates (`dct:source <a>, <b>, <c>`) come back as
 * arrays in document order; single-valued predicates stay scalar.
 *
 * Literal values are typed from their xsd datatype (`true` → boolean,
 * `9` → integer, `45.52` → decimal, anything else → string). NamedNode
 * objects come back as their URI string.
 *
 * Component code is responsible for the predicate URI → its own
 * internal name mapping. See `sol-weather.js` for the canonical
 * example. The reader stays component-agnostic.
 *
 * The previous PropertyValue indirection pattern (schema:additionalProperty
 * → PropertyValue node → schema:name + schema:value) was migrated out
 * in favour of direct predicates. See PLAN-vocab-migration.md for the
 * predicate choices and the rationale.
 *
 * All RDF goes through `core/rdf.js`, so a page that already has rdflib
 * live (via importmap or vendored ESM) shares it here.
 */

import { rdf } from '../../core/rdf.js';

/** Last URI segment — used only for picking the local name of an xsd
 *  datatype URI when typing literal values. */
function localName(uri) {
  const i = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return i === -1 ? uri : uri.slice(i + 1);
}

/** Convert one RDF object node to a JS primitive based on its datatype. */
function typedValue(node) {
  if (!node) return null;
  if (node.termType === 'NamedNode') return node.value;
  if (node.termType !== 'Literal')    return node.value;

  const local = localName(node.datatype?.value || '');
  switch (local) {
    case 'boolean':
      return node.value === 'true' || node.value === '1';
    case 'integer':
    case 'int':
    case 'long':
    case 'short':
    case 'byte':
    case 'nonNegativeInteger':
    case 'positiveInteger':
    case 'negativeInteger':
    case 'nonPositiveInteger':
      return parseInt(node.value, 10);
    case 'decimal':
    case 'double':
    case 'float':
      return parseFloat(node.value);
    default:
      return node.value;
  }
}

/**
 * Fetch a TTL file and return one subject's direct properties as a
 * flat JS object keyed by predicate URI.
 *
 * @param  {string} sourceUri  "file.ttl#Subject" — the fragment is required.
 * @return {Promise<Object>}   { predicateUri: value | value[], ... }
 * @throws on HTTP failure, on a missing rdflib, on a missing fragment.
 */
export async function loadConfig(sourceUri) {
  const abs = new URL(sourceUri || '', document.baseURI).href;
  const hashIdx = abs.indexOf('#');
  if (hashIdx === -1) {
    throw new Error(`source needs a subject fragment — got "${sourceUri}"`);
  }
  const fileUri = abs.slice(0, hashIdx);

  const resp = await fetch(fileUri);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${fileUri}`);
  const text = await resp.text();

  if (!rdf.isReady()) throw new Error('RDF config needs rdflib on the page');
  const store = rdf.graph();
  rdf.parse(text, store, fileUri, 'text/turtle');

  const subject = rdf.sym(abs);
  const out = {};

  // Walk every triple with the requested subject. Group by predicate;
  // arrays accumulate when a predicate has more than one object.
  const append = (predUri, value) => {
    if (Array.isArray(out[predUri])) out[predUri].push(value);
    else if (predUri in out)         out[predUri] = [out[predUri], value];
    else                             out[predUri] = value;
  };
  for (const st of store.statementsMatching(subject, null, null)) {
    // Skip rdf:type — it's a class declaration, not a setting value.
    if (st.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') continue;
    append(st.predicate.value, typedValue(st.object));
  }
  return out;
}

export default loadConfig;
