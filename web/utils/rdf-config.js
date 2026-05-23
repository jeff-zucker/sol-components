/**
 * rdf-config.js — read a schema.org PropertyValue config block from a
 * Turtle file as a flat {name: value} JS object.
 *
 * Companion to `feed-fetch.js#parseSourceList`. Config files follow
 * the pattern:
 *
 *   @prefix schema: <https://schema.org/> .
 *   <#Settings>
 *     schema:additionalProperty <#latitude>, <#longitude>, <#place> .
 *
 *   <#latitude>  a schema:PropertyValue ; schema:name "latitude"@en
 *                                       ; schema:value 45.52 .
 *   <#longitude> a schema:PropertyValue ; schema:name "longitude"@en
 *                                       ; schema:value -122.68 .
 *   <#place>     a schema:PropertyValue ; schema:name "place"@en
 *                                       ; schema:value "Portland, OR" .
 *
 * and resolve to:
 *
 *   { latitude: 45.52, longitude: -122.68, place: "Portland, OR" }
 *
 * The PropertyValue pattern keeps the file free of invented predicates —
 * only standard schema.org terms (PropertyValue, name, value,
 * additionalProperty) appear in predicate position. Setting names are
 * literal strings, so renaming a setting doesn't break the file's URI
 * contract.
 *
 * Literal values are typed from their xsd datatype (`true` → boolean,
 * `9` → integer, `45.52` → decimal, anything else → string).
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

/** Schema.org URI builder. Always http:// — the project standardises on
 *  the HTTP form so data, shapes, and code all match by exact string
 *  (IRIs are case-and-scheme-sensitive in RDF). */
const SCHEMA = 'http://schema.org/';
const schema = (local) => SCHEMA + local;

/**
 * Fetch a TTL file and return one subject's PropertyValue children as
 * a flat JS object.
 *
 * @param  {string} sourceUri  "file.ttl#Subject" — the fragment is required.
 * @return {Promise<Object>}   { name: value, ... }
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

  const subject       = rdf.sym(abs);
  const addProperty   = rdf.sym(schema('additionalProperty'));
  const schemaName    = rdf.sym(schema('name'));
  const schemaValue   = rdf.sym(schema('value'));

  const out = {};
  // Walk <#Settings> schema:additionalProperty ?pv, then read each
  // PropertyValue's name + value pair. The PropertyValue rdf:type
  // isn't enforced — the pattern is implicit from the predicates used.
  //
  // Same name allowed more than once. Two TTL shapes are equivalent
  // and both yield an array on `out`:
  //   1. Repeated PropertyValues:
  //        [ schema:name "source" ; schema:value <a> ],
  //        [ schema:name "source" ; schema:value <b> ]
  //   2. One PropertyValue with multiple schema:value statements:
  //        [ schema:name "source" ; schema:value <a>, <b> ]
  // A single value stays a scalar (preserving the prior contract).
  const append = (name, value) => {
    if (Array.isArray(out[name]))   out[name].push(value);
    else if (name in out)           out[name] = [out[name], value];
    else                            out[name] = value;
  };
  for (const st of store.statementsMatching(subject, addProperty, null)) {
    const pv = st.object;
    const nameNode  = store.any(pv, schemaName, null);
    if (!nameNode) continue;
    const values = store.each(pv, schemaValue, null);
    for (const v of values) append(nameNode.value, typedValue(v));
  }
  return out;
}

export default loadConfig;
