/*! vendored rdf-validate-shacl@0.7.0 */
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {}, browser: true, version: "", versions: { node: "" },
    nextTick: (cb, ...a) => Promise.resolve().then(() => cb(...a)),
    cwd: () => "/", platform: "browser",
  };
}
function blankNode$1 (blankNode) {
  return '_:' + blankNode.value // TODO: escape special chars
}

function dataset (dataset, toNT) {
  return [...dataset].map(quad => toNT(quad)).join('\n') + '\n'
}

function defaultGraph () {
  return ''
}

function namedNode$1 (namedNode) {
  return '<' + namedNode.value + '>'
}

const echarRegEx = /["\\\\\n\r]/;
const echarRegExAll = /["\\\\\n\r]/g;

const echarReplacement = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r'
};

function echarReplacer (char) {
  return echarReplacement[char]
}

function escapeValue (value) {
  if (echarRegEx.test(value)) {
    return value.replace(echarRegExAll, echarReplacer)
  }

  return value
}

function literal$1 (literal) {
  const escapedValue = escapeValue(literal.value);

  if (literal.datatype.value === 'http://www.w3.org/2001/XMLSchema#string') {
    return '"' + escapedValue + '"'
  }

  if (literal.datatype.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') {
    return '"' + escapedValue + '"@' + literal.language
  }

  return '"' + escapedValue + '"^^' + namedNode$1(literal.datatype)
}

function quad (quad, toNT) {
  const subjectString = toNT(quad.subject);
  const predicateString = toNT(quad.predicate);
  const objectString = toNT(quad.object);
  const graphString = toNT(quad.graph);

  return `${subjectString} ${predicateString} ${objectString} ${graphString ? graphString + ' ' : ''}.`
}

function variable (variable) {
  return '?' + variable.value
}

function toNT (term) {
  if (!term) {
    return null
  }

  if (term.termType === 'BlankNode') {
    return blankNode$1(term)
  }

  if (term.termType === 'DefaultGraph') {
    return defaultGraph()
  }

  if (term.termType === 'Literal') {
    return literal$1(term)
  }

  if (term.termType === 'NamedNode') {
    return namedNode$1(term)
  }

  // legacy quad support without .termType
  if (term.termType === 'Quad' || (term.subject && term.predicate && term.object && term.graph)) {
    return quad(term, toNT)
  }

  if (term.termType === 'Variable') {
    return variable(term)
  }

  if (term[Symbol.iterator]) {
    return dataset(term, toNT)
  }

  throw new Error(`unknown termType ${term.termType}`)
}

function quietToNT (term) {
  try {
    return toNT(term)
  } catch (err) {
    return null
  }
}

class TermSet {
  constructor (terms) {
    this.index = new Map();

    if (terms) {
      for (const term of terms) {
        this.add(term);
      }
    }
  }

  get size () {
    return this.index.size
  }

  add (term) {
    const key = toNT(term);

    if (!this.index.has(key)) {
      this.index.set(key, term);
    }

    return this
  }

  clear () {
    this.index.clear();
  }

  delete (term) {
    if (!term) {
      return false
    }

    return this.index.delete(quietToNT(term))
  }

  entries () {
    return this.values().entries()
  }

  forEach (callbackfn, thisArg) {
    return this.values().forEach(callbackfn, thisArg)
  }

  has (term) {
    if (!term) {
      return false
    }

    return this.index.has(quietToNT(term))
  }

  values () {
    return new Set(this.index.values())
  }

  keys () {
    return this.values()
  }

  [Symbol.iterator] () {
    return this.index.values()
  }
}

class Environment {
  constructor (factories, { bind = false } = {}) {
    this._factories = factories.slice();

    for (const factory of this._factories) {
      if (typeof factory.prototype.init === 'function') {
        factory.prototype.init.call(this);
      }

      for (const method of factory.exports || []) {
        if (bind) {
          this[method] = factory.prototype[method].bind(this);
        } else {
          this[method] = factory.prototype[method];
        }
      }
    }
  }

  clone () {
    const env = new Environment(this._factories);

    for (const factory of env._factories) {
      if (typeof factory.prototype.clone === 'function') {
        factory.prototype.clone.call(env, this);
      }
    }

    return env
  }
}

let BlankNode$1 = class BlankNode {
  constructor (id) {
    this.value = id;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
};

BlankNode$1.prototype.termType = 'BlankNode';

let DefaultGraph$1 = class DefaultGraph {
  equals (other) {
    return !!other && other.termType === this.termType
  }
};

DefaultGraph$1.prototype.termType = 'DefaultGraph';
DefaultGraph$1.prototype.value = '';

function fromTerm (factory, original) {
  if (!original) {
    return null
  }

  if (original.termType === 'BlankNode') {
    return factory.blankNode(original.value)
  }

  if (original.termType === 'DefaultGraph') {
    return factory.defaultGraph()
  }

  if (original.termType === 'Literal') {
    return factory.literal(original.value, original.language
      ? { language: original.language, direction: original.direction }
      : factory.namedNode(original.datatype.value))
  }

  if (original.termType === 'NamedNode') {
    return factory.namedNode(original.value)
  }

  if (original.termType === 'Quad') {
    const subject = factory.fromTerm(original.subject);
    const predicate = factory.fromTerm(original.predicate);
    const object = factory.fromTerm(original.object);
    const graph = factory.fromTerm(original.graph);

    return factory.quad(subject, predicate, object, graph)
  }

  if (original.termType === 'Variable') {
    return factory.variable(original.value)
  }

  throw new Error(`unknown termType ${original.termType}`)
}

let Literal$1 = class Literal {
  constructor (value, language, datatype, direction = '') {
    this.value = value;
    this.language = language;
    this.datatype = datatype;
    this.direction = direction;
  }

  equals (other) {
    return !!other &&
      other.termType === this.termType &&
      other.value === this.value &&
      other.language === this.language &&
      other.datatype.equals(this.datatype) &&
      (other.direction || '') === this.direction
  }
};

Literal$1.prototype.termType = 'Literal';

let NamedNode$1 = class NamedNode {
  constructor (iri) {
    this.value = iri;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
};

NamedNode$1.prototype.termType = 'NamedNode';

let Quad$1 = class Quad {
  constructor (subject, predicate, object, graph) {
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.graph = graph;
  }

  equals (other) {
    // `|| !other.termType` is for backwards-compatibility with old factories without RDF* support.
    return !!other &&
      (other.termType === 'Quad' || !other.termType) &&
      other.subject.equals(this.subject) &&
      other.predicate.equals(this.predicate) &&
      other.object.equals(this.object) &&
      other.graph.equals(this.graph)
  }
};

Quad$1.prototype.termType = 'Quad';
Quad$1.prototype.value = '';

let Variable$1 = class Variable {
  constructor (name) {
    this.value = name;
  }

  equals (other) {
    return !!other && other.termType === this.termType && other.value === this.value
  }
};

Variable$1.prototype.termType = 'Variable';

const dirLangStringDatatype = new NamedNode$1('http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString');
const langStringDatatype = new NamedNode$1('http://www.w3.org/1999/02/22-rdf-syntax-ns#langString');
const stringDatatype = new NamedNode$1('http://www.w3.org/2001/XMLSchema#string');

let DataFactory$1 = class DataFactory {
  constructor () {
    this.init();
  }

  init () {
    this._data = {
      blankNodeCounter: 0,
      defaultGraph: new DefaultGraph$1()
    };
  }

  namedNode (value) {
    return new NamedNode$1(value)
  }

  blankNode (value) {
    value = value || ('b' + (++this._data.blankNodeCounter));

    return new BlankNode$1(value)
  }

  literal (value, languageOrDatatype) {
    if (typeof languageOrDatatype === 'string') {
      return new Literal$1(value, languageOrDatatype, langStringDatatype)
    } else if (typeof languageOrDatatype?.language === 'string') {
      return new Literal$1(
        value,
        languageOrDatatype.language,
        languageOrDatatype.direction ? dirLangStringDatatype : langStringDatatype,
        languageOrDatatype.direction)
    } else {
      return new Literal$1(value, '', languageOrDatatype || stringDatatype)
    }
  }

  variable (value) {
    return new Variable$1(value)
  }

  defaultGraph () {
    return this._data.defaultGraph
  }

  quad (subject, predicate, object, graph = this.defaultGraph()) {
    return new Quad$1(subject, predicate, object, graph)
  }

  fromTerm (original) {
    return fromTerm(this, original)
  }

  fromQuad (original) {
    return fromTerm(this, original)
  }
};

DataFactory$1.exports = [
  'blankNode',
  'defaultGraph',
  'fromQuad',
  'fromTerm',
  'literal',
  'namedNode',
  'quad',
  'variable'
];

function isString (s) {
  return typeof s === 'string' || s instanceof String
}

const xsdString = 'http://www.w3.org/2001/XMLSchema#string';

function termToId (term) {
  if (typeof term === 'string') {
    return term
  }

  if (!term) {
    return ''
  }

  if (typeof term.id !== 'undefined' && term.termType !== 'Quad') {
    return term.id
  }

  let subject, predicate, object, graph;

  // Term instantiated with another library
  switch (term.termType) {
    case 'NamedNode':
      return term.value

    case 'BlankNode':
      return `_:${term.value}`

    case 'Variable':
      return `?${term.value}`

    case 'DefaultGraph':
      return ''

    case 'Literal':
      if (term.language) {
        return `"${term.value}"@${term.language}${term.direction ? `--${term.direction}` : ''}`
      }

      return `"${term.value}"${term.datatype && term.datatype.value !== xsdString ? `^^${term.datatype.value}` : ''}`

    case 'Quad':
      // To identify RDF* quad components, we escape quotes by doubling them.
      // This avoids the overhead of backslash parsing of Turtle-like syntaxes.
      subject = escapeQuotes(termToId(term.subject));
      predicate = escapeQuotes(termToId(term.predicate));
      object = escapeQuotes(termToId(term.object));
      graph = term.graph.termType === 'DefaultGraph' ? '' : ` ${termToId(term.graph)}`;

      return `<<${subject} ${predicate} ${object}${graph}>>`

    default:
      throw new Error(`Unexpected termType: ${term.termType}`)
  }
}

const escapedLiteral = /^"(.*".*)(?="[^"]*$)/;

function escapeQuotes (id) {
  return id.replace(escapedLiteral, (_, quoted) => `"${quoted.replace(/"/g, '""')}`)
}

class DatasetCore {
  constructor (quads) {
    // The number of quads is initially zero
    this._size = 0;
    // `_graphs` contains subject, predicate, and object indexes per graph
    this._graphs = Object.create(null);
    // `_ids` maps entities such as `http://xmlns.com/foaf/0.1/name` to numbers,
    // saving memory by using only numbers as keys in `_graphs`
    this._id = 0;
    this._ids = Object.create(null);
    this._ids['><'] = 0; // dummy entry, so the first actual key is non-zero
    this._entities = Object.create(null); // inverse of `_ids`

    this._quads = new Map();

    // Add quads if passed
    if (quads) {
      for (const quad of quads) {
        this.add(quad);
      }
    }
  }

  get size () {
    // Return the quad count if if was cached
    let size = this._size;

    if (size !== null) {
      return size
    }

    // Calculate the number of quads by counting to the deepest level
    size = 0;
    const graphs = this._graphs;
    let subjects, subject;

    for (const graphKey in graphs) {
      for (const subjectKey in (subjects = graphs[graphKey].subjects)) {
        for (const predicateKey in (subject = subjects[subjectKey])) {
          size += Object.keys(subject[predicateKey]).length;
        }
      }
    }

    this._size = size;

    return this._size
  }

  add (quad) {
    // Convert terms to internal string representation
    let subject = termToId(quad.subject);
    let predicate = termToId(quad.predicate);
    let object = termToId(quad.object);
    const graph = termToId(quad.graph);

    // Find the graph that will contain the triple
    let graphItem = this._graphs[graph];
    // Create the graph if it doesn't exist yet
    if (!graphItem) {
      graphItem = this._graphs[graph] = { subjects: {}, predicates: {}, objects: {} };
      // Freezing a graph helps subsequent `add` performance,
      // and properties will never be modified anyway
      Object.freeze(graphItem);
    }

    // Since entities can often be long IRIs, we avoid storing them in every index.
    // Instead, we have a separate index that maps entities to numbers,
    // which are then used as keys in the other indexes.
    const ids = this._ids;
    const entities = this._entities;
    subject = ids[subject] || (ids[entities[++this._id] = subject] = this._id);
    predicate = ids[predicate] || (ids[entities[++this._id] = predicate] = this._id);
    object = ids[object] || (ids[entities[++this._id] = object] = this._id);

    this._addToIndex(graphItem.subjects, subject, predicate, object);
    this._addToIndex(graphItem.predicates, predicate, object, subject);
    this._addToIndex(graphItem.objects, object, subject, predicate);

    this._setQuad(subject, predicate, object, graph, quad);

    // The cached quad count is now invalid
    this._size = null;

    return this
  }

  delete (quad) {
    // Convert terms to internal string representation
    let subject = termToId(quad.subject);
    let predicate = termToId(quad.predicate);
    let object = termToId(quad.object);
    const graph = termToId(quad.graph);

    // Find internal identifiers for all components
    // and verify the quad exists.
    const ids = this._ids;
    const graphs = this._graphs;
    let graphItem, subjects, predicates;

    if (!(subject = ids[subject]) || !(predicate = ids[predicate]) ||
      !(object = ids[object]) || !(graphItem = graphs[graph]) ||
      !(subjects = graphItem.subjects[subject]) ||
      !(predicates = subjects[predicate]) ||
      !(object in predicates)
    ) {
      return this
    }

    // Remove it from all indexes
    this._removeFromIndex(graphItem.subjects, subject, predicate, object);
    this._removeFromIndex(graphItem.predicates, predicate, object, subject);
    this._removeFromIndex(graphItem.objects, object, subject, predicate);

    if (this._size !== null) {
      this._size--;
    }

    this._deleteQuad(subject, predicate, object, graph);

    // Remove the graph if it is empty
    for (subject in graphItem.subjects) { // eslint-disable-line no-unreachable-loop
      return this
    }

    delete graphs[graph];

    return this
  }

  has (quad) {
    // Convert terms to internal string representation
    const subject = termToId(quad.subject);
    const predicate = termToId(quad.predicate);
    const object = termToId(quad.object);
    const graph = termToId(quad.graph);

    const graphItem = this._graphs[graph];

    if (!graphItem) {
      return false
    }

    const ids = this._ids;
    let subjectId, predicateId, objectId;

    // Translate IRIs to internal index keys.
    if (
      (isString(subject) && !(subjectId = ids[subject])) ||
      (isString(predicate) && !(predicateId = ids[predicate])) ||
      (isString(object) && !(objectId = ids[object]))
    ) {
      return false
    }

    return this._countInIndex(graphItem.objects, objectId, subjectId, predicateId) === 1
  }

  match (subject, predicate, object, graph) {
    return this._createDataset(this._match(subject, predicate, object, graph))
  }

  [Symbol.iterator] () {
    return this._match()[Symbol.iterator]()
  }

  // ## Private methods

  // ### `_addToIndex` adds a quad to a three-layered index.
  // Returns if the index has changed, if the entry did not already exist.
  _addToIndex (index0, key0, key1, key2) {
    // Create layers as necessary
    const index1 = index0[key0] || (index0[key0] = {});
    const index2 = index1[key1] || (index1[key1] = {});
    // Setting the key to _any_ value signals the presence of the quad
    const existed = key2 in index2;

    if (!existed) {
      index2[key2] = null;
    }

    return !existed
  }

  // ### `_removeFromIndex` removes a quad from a three-layered index
  _removeFromIndex (index0, key0, key1, key2) {
    // Remove the quad from the index
    const index1 = index0[key0];
    const index2 = index1[key1];
    delete index2[key2];

    // Remove intermediary index layers if they are empty
    for (const key in index2) { // eslint-disable-line no-unreachable-loop
      return
    }

    delete index1[key1];

    for (const key in index1) { // eslint-disable-line no-unreachable-loop
      return
    }

    delete index0[key0];
  }

  // ### `_findInIndex` finds a set of quads in a three-layered index.
  // The index base is `index0` and the keys at each level are `key0`, `key1`, and `key2`.
  // Any of these keys can be undefined, which is interpreted as a wildcard.
  // `name0`, `name1`, and `name2` are the names of the keys at each level,
  // used when reconstructing the resulting quad
  // (for instance: _subject_, _predicate_, and _object_).
  // Finally, `graph` will be the graph of the created quads.
  // If `callback` is given, each result is passed through it
  // and iteration halts when it returns truthy for any quad.
  // If instead `array` is given, each result is added to the array.
  _findInIndex (index0, key0, key1, key2, name0, name1, name2, graph, callback, array) {
    let tmp, index1, index2;

    // If a key is specified, use only that part of index 0.
    if (key0) {
      (tmp = index0, index0 = {})[key0] = tmp[key0];
    }

    for (const value0 in index0) {
      index1 = index0[value0];

      if (index1) {
        // If a key is specified, use only that part of index 1.
        if (key1) {
          (tmp = index1, index1 = {})[key1] = tmp[key1];
        }

        for (const value1 in index1) {
          index2 = index1[value1];

          if (index2) {
            // If a key is specified, use only that part of index 2, if it exists.
            const values = key2 ? (key2 in index2 ? [key2] : []) : Object.keys(index2);
            // Create quads for all items found in index 2.
            for (let l = 0; l < values.length; l++) {
              const parts = {
                [name0]: value0,
                [name1]: value1,
                [name2]: values[l]
              };

              const quad = this._getQuad(parts.subject, parts.predicate, parts.object, graph);

              if (array) {
                array.push(quad);
              } else if (callback(quad)) {
                return true
              }
            }
          }
        }
      }
    }

    return array
  }

  // ### `_countInIndex` counts matching quads in a three-layered index.
  // The index base is `index0` and the keys at each level are `key0`, `key1`, and `key2`.
  // Any of these keys can be undefined, which is interpreted as a wildcard.
  _countInIndex (index0, key0, key1, key2) {
    let count = 0;
    let tmp, index1, index2;

    // If a key is specified, count only that part of index 0
    if (key0) {
      (tmp = index0, index0 = {})[key0] = tmp[key0];
    }

    for (const value0 in index0) {
      index1 = index0[value0];

      if (index1) {
        // If a key is specified, count only that part of index 1
        if (key1) {
          (tmp = index1, index1 = {})[key1] = tmp[key1];
        }

        for (const value1 in index1) {
          index2 = index1[value1];

          if (index2) {
            if (key2) {
              // If a key is specified, count the quad if it exists
              (key2 in index2) && count++;
            } else {
              // Otherwise, count all quads
              count += Object.keys(index2).length;
            }
          }
        }
      }
    }

    return count
  }

  // ### `_getGraphs` returns an array with the given graph,
  // or all graphs if the argument is null or undefined.
  _getGraphs (graph) {
    if (!isString(graph)) {
      return this._graphs
    }

    return {
      [graph]: this._graphs[graph]
    }
  }

  _match (subject, predicate, object, graph) {
    // Convert terms to internal string representation
    subject = subject && termToId(subject);
    predicate = predicate && termToId(predicate);
    object = object && termToId(object);
    graph = graph && termToId(graph);

    const quads = [];
    const graphs = this._getGraphs(graph);
    const ids = this._ids;
    let content, subjectId, predicateId, objectId;

    // Translate IRIs to internal index keys.
    if (
      (isString(subject) && !(subjectId = ids[subject])) ||
      (isString(predicate) && !(predicateId = ids[predicate])) ||
      (isString(object) && !(objectId = ids[object]))
    ) {
      return quads
    }

    for (const graphId in graphs) {
      content = graphs[graphId];

      // Only if the specified graph contains triples, there can be results
      if (content) {
        // Choose the optimal index, based on what fields are present
        if (subjectId) {
          if (objectId) {
            // If subject and object are given, the object index will be the fastest
            this._findInIndex(content.objects, objectId, subjectId, predicateId, 'object', 'subject', 'predicate', graphId, null, quads);
          } else {
            // If only subject and possibly predicate are given, the subject index will be the fastest
            this._findInIndex(content.subjects, subjectId, predicateId, null, 'subject', 'predicate', 'object', graphId, null, quads);
          }
        } else if (predicateId) {
          // if only predicate and possibly object are given, the predicate index will be the fastest
          this._findInIndex(content.predicates, predicateId, objectId, null, 'predicate', 'object', 'subject', graphId, null, quads);
        } else if (objectId) {
          // If only object is given, the object index will be the fastest
          this._findInIndex(content.objects, objectId, null, null, 'object', 'subject', 'predicate', graphId, null, quads);
        } else {
          // If nothing is given, iterate subjects and predicates first
          this._findInIndex(content.subjects, null, null, null, 'subject', 'predicate', 'object', graphId, null, quads);
        }
      }
    }

    return quads
  }

  _getQuad (subjectId, predicateId, objectId, graphId) {
    return this._quads.get(this._toId(subjectId, predicateId, objectId, graphId))
  }

  _setQuad (subjectId, predicateId, objectId, graphId, quad) {
    this._quads.set(this._toId(subjectId, predicateId, objectId, graphId), quad);
  }

  _deleteQuad (subjectId, predicateId, objectId, graphId) {
    this._quads.delete(this._toId(subjectId, predicateId, objectId, graphId));
  }

  _createDataset (quads) {
    return new this.constructor(quads)
  }

  _toId (subjectId, predicateId, objectId, graphId) {
    return `${subjectId}:${predicateId}:${objectId}:${graphId}`
  }
}

let Factory$2 = class Factory {
  dataset (quads) {
    return new DatasetCore(quads)
  }
};

Factory$2.exports = ['dataset'];

class TermMap {
  constructor (entries) {
    this.index = new Map();

    if (entries) {
      for (const [term, value] of entries) {
        this.set(term, value);
      }
    }
  }

  get size () {
    return this.index.size
  }

  clear () {
    this.index.clear();
  }

  delete (term) {
    return this.index.delete(toNT(term))
  }

  * entries () {
    for (const [, { term, value }] of this.index) {
      yield [term, value];
    }
  }

  forEach (callback, thisArg) {
    for (const entry of this.entries()) {
      callback.call(thisArg, entry[1], entry[0], this);
    }
  }

  get (term) {
    const item = this.index.get(toNT(term));

    return item && item.value
  }

  has (term) {
    return this.index.has(toNT(term))
  }

  * keys () {
    for (const [, { term }] of this.index) {
      yield term;
    }
  }

  set (term, value) {
    const key = toNT(term);

    this.index.set(key, { term, value });

    return this
  }

  * values () {
    for (const [, { value }] of this.index) {
      yield value;
    }
  }

  [Symbol.iterator] () {
    return this.entries()[Symbol.iterator]()
  }
}

let Factory$1 = class Factory {
  termMap (entries) {
    return new TermMap(entries)
  }
};

Factory$1.exports = ['termMap'];

const factory$2 = new DataFactory$1();

const handler$1 = {
  apply: (target, thisArg, args) => target(args[0]),
  get: (target, property) => target(property)
};

function namespace (baseIRI, { factory = factory$2 } = {}) {
  const builder = (term = '') => factory.namedNode(`${baseIRI}${term.raw || term}`);

  return typeof Proxy === 'undefined' ? builder : new Proxy(builder, handler$1)
}

class Factory {
  namespace (baseIRI) {
    return namespace(baseIRI, { factory: this })
  }
}

Factory.exports = ['namespace'];

var ns$2 = (factory) => {
  const xsd = factory.namespace('http://www.w3.org/2001/XMLSchema#');
  const rdf = factory.namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

  return {
    first: rdf.first,
    nil: rdf.nil,
    rest: rdf.rest,
    langString: rdf.langString,
    xsd,
  }
};

function toArray(value, defaultValue) {
  if (typeof value === 'undefined' || value === null) {
    return defaultValue
  }

  if (Array.isArray(value)) {
    return value
  }

  if (typeof value !== 'string' && value[Symbol.iterator]) {
    return [...value]
  }

  return [value]
}

var environment = new Environment([
  Factory,
  DataFactory$1,
]);

const { xsd } = ns$2(environment);

function booleanToLiteral(value, factory = environment) {
  if (typeof value !== 'boolean') {
    return null
  }

  return factory.literal(value.toString(), xsd('boolean'))
}

function numberToLiteral(value, factory = environment) {
  if (typeof value !== 'number') {
    return null
  }

  if (Number.isInteger(value)) {
    return factory.literal(value.toString(10), xsd('integer'))
  }

  return factory.literal(value.toString(10), xsd('double'))
}

function stringToLiteral(value, factory = environment) {
  if (typeof value !== 'string') {
    return null
  }

  return factory.literal(value)
}

function toLiteral(value, factory = environment) {
  return booleanToLiteral(value, factory) ||
    numberToLiteral(value, factory) ||
    stringToLiteral(value, factory)
}

function blankNode(value, factory) {
  if (value && typeof value !== 'string') {
    throw new Error('Blank node identifier must be a string')
  }

  return factory.blankNode(value)
}

function literal(value, languageOrDatatype, factory) {
  if (typeof value === 'string') {
    // check if it's given, if given try RDF/JS Term value otherwise convert it to a string
    languageOrDatatype = languageOrDatatype && (languageOrDatatype.value || languageOrDatatype.toString());

    if (languageOrDatatype && languageOrDatatype.indexOf(':') !== -1) {
      languageOrDatatype = factory.namedNode(languageOrDatatype);
    }

    return factory.literal(value.toString(), languageOrDatatype)
  }

  const term = toLiteral(value, factory);

  if (!term) {
    throw new Error('The value cannot be converted to a literal node')
  }

  return term
}

function namedNode(value, factory) {
  if (typeof value !== 'string') {
    throw new Error('Named node must be an IRI string')
  }

  return factory.namedNode(value)
}

function term(value, type = 'Literal', languageOrDatatype, factory) {
  // it's already a RDF/JS Term
  if (value && typeof value === 'object' && value.termType) {
    return value
  }

  // check if it's a URL object
  if (value && value.constructor.name === 'URL') {
    return namedNode(value.toString(), factory)
  }

  // check if it's a blank node...
  if (type === 'BlankNode') {
    return blankNode(value, factory)
  }

  // ...cause that's the only type that doesn't require a value
  if (value === null || typeof value === 'undefined') {
    return undefined
  }

  if (type === 'Literal') {
    return literal(value, languageOrDatatype, factory)
  }

  if (type === 'NamedNode') {
    return namedNode(value, factory)
  }

  throw new Error('unknown type')
}

function toTermArray(items, type, languageOrDatatype, factory) {
  if ((typeof items === 'undefined' || items === null) && !type) {
    return items
  }

  return (toArray(items) || [undefined]).reduce((all, item) => {
    if (typeof item === 'object' && item.terms) {
      return all.concat(item.terms)
    }

    all.push(term(item, type, languageOrDatatype, factory));

    return all
  }, [])
}

const ns$1 = ns$2(environment);

function mapLiteralsByLanguage(map, current) {
  const notLiteral = current.termType !== 'Literal';
  const notStringLiteral = ns$1.langString.equals(current.datatype) || ns$1.xsd.string.equals(current.datatype);

  if (notLiteral || !notStringLiteral) return map

  const language = current.language.toLowerCase();

  if (map.has(language)) {
    map.get(language).push(current);
  } else {
    map.set(language, [current]);
  }

  return map
}

function createLanguageMapper(objects) {
  const literalsByLanguage = objects.reduce(mapLiteralsByLanguage, new Map());
  const langMapEntries = [...literalsByLanguage.entries()];

  return language => {
    const languageLowerCase = language.toLowerCase();

    if (languageLowerCase === '*') {
      return langMapEntries[0] && langMapEntries[0][1]
    }

    const exactMatch = literalsByLanguage.get(languageLowerCase);
    if (exactMatch) {
      return exactMatch
    }

    const secondaryMatches = langMapEntries.find(([entryLanguage]) => entryLanguage.startsWith(languageLowerCase));

    return secondaryMatches && secondaryMatches[1]
  }
}

/**
 *
 * @param {Term[]} terms
 * @param {object} [options]
 * @param {string | string[]} [options.language]
 * @returns {Term[]}
 */
function filterTaggedLiterals(terms, { language }) {
  const languages = (typeof language === 'string' ? [language] : language);
  const getLiteralsForLanguage = createLanguageMapper(terms);

  return languages.map(getLiteralsForLanguage).find(Boolean) || []
}

class Context {
  constructor({ dataset, graph, value, factory, namespace }) {
    this.dataset = dataset;
    this.graph = graph;
    this.factory = factory;
    this.namespace = namespace;
    this.term = term(value, undefined, undefined, factory);
  }

  clone({ dataset = this.dataset, graph = this.graph, value, factory = this.factory, namespace = this.namespace }) {
    return new Context({ dataset, graph, value, factory, namespace })
  }

  has(predicate, object) {
    return this.matchProperty(toArray(this.term), predicate, object, toArray(this.graph), 'subject').map(subject => {
      return this.clone({ value: subject })
    })
  }

  in(predicate) {
    return this.matchProperty(null, predicate, toArray(this.term), toArray(this.graph), 'subject').map(subject => {
      return this.clone({ value: subject })
    })
  }

  out(predicate, { language } = {}) {
    let objects = this.matchProperty(toArray(this.term), predicate, null, toArray(this.graph), 'object');

    if (typeof language !== 'undefined') {
      objects = filterTaggedLiterals(objects, { language });
    }

    return objects.map(object => {
      return this.clone({ value: object })
    })
  }

  addIn(predicates, subjects) {
    const context = [];

    if (this.term) {
      subjects.forEach(subject => {
        predicates.forEach(predicate => {
          this.dataset.add(this.factory.quad(subject, predicate, this.term, this.graph));
        });

        context.push(this.clone({ value: subject }));
      });
    }

    return context
  }

  addOut(predicates, objects) {
    const context = [];

    if (this.term) {
      objects.forEach(object => {
        predicates.forEach(predicate => {
          this.dataset.add(this.factory.quad(this.term, predicate, object, this.graph));
        });

        context.push(this.clone({ value: object }));
      });
    }

    return context
  }

  addList(predicates, items) {
    if (!this.term) {
      return
    }

    predicates.forEach(predicate => {
      const nodes = items.map(() => this.factory.blankNode());

      this.dataset.add(this.factory.quad(this.term, predicate, nodes[0] || this.namespace.nil, this.graph));

      for (let index = 0; index < nodes.length; index++) {
        this.dataset.add(this.factory.quad(nodes[index], this.namespace.first, items[index], this.graph));
        this.dataset.add(this.factory.quad(nodes[index], this.namespace.rest, nodes[index + 1] || this.namespace.nil, this.graph));
      }
    });
  }

  deleteIn(predicate, subject) {
    this.deleteMatch(subject, predicate, toArray(this.term), toArray(this.graph));
  }

  deleteOut(predicate, objects) {
    this.deleteMatch(toArray(this.term), predicate, objects, toArray(this.graph));
  }

  deleteList(predicates) {
    predicates.forEach(predicate => {
      for (const quad of this.dataset.match(this.term, predicate)) {
        this.deleteItems(quad);
      }
    });
  }

  deleteItems(start) {
    let quads = [start];

    while (!quads[quads.length - 1].object.equals(this.namespace.nil)) {
      const node = quads[quads.length - 1].object;

      quads = quads.concat([...this.dataset.match(node)]);
    }

    quads.forEach(quad => {
      this.dataset.delete(quad);
    });
  }

  match(subject, predicate, object, graph) {
    // if no parts are given, there is nothing to filter
    if (!subject && !predicate && !object && !graph) {
      return [...this.dataset]
    }

    subject = subject || [null];
    predicate = predicate || [null];
    object = object || [null];
    graph = graph || [null];

    const matches = [];

    // use all gspo permutations and combine matches in an array
    for (const g of graph) {
      for (const s of subject) {
        for (const p of predicate) {
          for (const o of object) {
            for (const quad of this.dataset.match(s, p, o, g)) {
              matches.push(quad);
            }
          }
        }
      }
    }

    return matches
  }

  matchProperty(subject, predicate, object, graph, property) {
    return this.match(subject, predicate, object, graph).map(quad => quad[property])
  }

  deleteMatch(subject, predicate, object, graph) {
    this.match(subject, predicate, object, graph).forEach(quad => {
      this.dataset.delete(quad);
    });
  }
}

/**
 * A graph pointer object, which points at 0..N nodes within a dataset
 */
class Clownface {
  constructor({ dataset, graph, term, value, factory, _context }) {
    this.factory = factory;
    this.namespace = ns$2(factory);

    if (_context) {
      this._context = _context;

      return
    }

    const terms = (term && toArray(term)) || (value && toArray(value)) || [null];

    /**
     * The underlying context which references actual node being pointed
     *
     * @type {Context[]}
     * @private
     */
    this._context = terms.map(term => {
      return new Context({ dataset, graph, value: term, factory: this.factory, namespace: this.namespace })
    });
  }

  /**
   * Gets the current RDF/JS term or undefined if pointer has no context
   *
   * @returns {undefined|Term}
   */
  get term() {
    const terms = this.terms;

    if (terms.length !== 1) {
      return undefined
    }

    return terms[0]
  }

  /**
   * Gets the current terms or an empty array if the pointer has no context
   *
   * @returns {Term[]}
   */
  get terms() {
    return this._context.map(node => node.term).filter(Boolean)
  }

  /**
   * Gets the string representation of term
   *
   * @returns {undefined|string}
   */
  get value() {
    const term = this.term;

    return term && term.value
  }

  /**
   * Gets the string representation of terms
   *
   * @returns {string[]}
   */
  get values() {
    return this.terms.map(term => term.value)
  }

  /**
   * Gets the current context's dataset, or undefined if there are multiple
   *
   * @returns {undefined|DatasetCore}
   */
  get dataset() {
    const datasets = this.datasets;

    if (datasets.length !== 1) {
      return undefined
    }

    return datasets[0]
  }

  /**
   * Gets the current context's datasets
   *
   * @returns {DatasetCore[]}
   */
  get datasets() {
    return this._context.map(node => node.dataset).filter(Boolean)
  }

  /**
   * Removes current pointers from the context and return an "any pointer".
   * The returned object can be used to find any nodes in the dataset
   *
   * @returns {Clownface}
   */
  any() {
    return Clownface.fromContext(this._context.map(current => current.clone({ })), this)
  }

  /**
   * Returns true if the current term is a rdf:List
   *
   * @returns {boolean}
   */
  isList() {
    if (!this.term) {
      return false
    }

    // empty list
    if (this.term.equals(this.namespace.nil)) {
      return true
    }

    // list element
    if (this.out(this.namespace.first).term) {
      return true
    }

    return false
  }

  /**
   * Creates an iterator which iterates and rdf:List of the current term
   *
   * @returns {Iterable | null}
   */
  list() {
    if (this.terms.length > 1) {
      throw new Error('iterator over multiple terms is not supported')
    }

    if (this.term) {
      if (this.term.termType !== 'NamedNode' && this.term.termType !== 'BlankNode') {
        return null
      }

      if (!this.term.equals(this.namespace.nil) && !this.out(this.namespace.first).term) {
        return null
      }
    }

    let item = this;

    return {
      [Symbol.iterator]: () => {
        return {
          next: () => {
            if (!item.term || item.term.equals(this.namespace.nil)) {
              return { done: true }
            }

            const value = item.out(this.namespace.first);
            if (value.terms.length > 1) {
              throw new Error(`Invalid list: multiple values for rdf:first on ${item.value}`)
            }

            const rest = item.out(this.namespace.rest);
            if (rest.terms.length > 1) {
              throw new Error(`Invalid list: multiple values for rdf:rest on ${item.value}`)
            }

            item = rest;

            return { done: false, value }
          },
        }
      },
    }
  }

  /**
   * Returns an array of graph pointers where each one has a single _context
   *
   * @returns {Clownface[]}
   */
  toArray() {
    return this._context
      .map(context => Clownface.fromContext(context, this))
      .filter(context => context.terms.some(Boolean))
  }

  /**
   * Returns graph pointers which meet the condition specified in a callback function
   * @param {FilterCallback} callback
   * @returns {Clownface}
   */
  filter(callback) {
    const pointers = this._context.map(context => Clownface.fromContext(context, this));

    return Clownface.fromContext(this._context.filter((context, index) => callback(Clownface.fromContext(context, this), index, pointers)), this)
  }

  /**
   * Performs the specified action on every graph pointer
   * @param {ForEachCallback} callback
   * @returns {Clownface}
   */
  forEach(callback) {
    this.toArray().forEach(callback);
    return this
  }

  /**
   * Calls a defined callback function on each graph pointer, and returns an array that contains the results.
   * @template T
   * @param {MapCallback<T>} callback
   * @returns {T[]}
   */
  map(callback) {
    return this.toArray().map(callback)
  }

  toString() {
    return this.values.join()
  }

  /**
   * Creates graph pointer to one or more node(s)
   *
   * Depending on the value creates pointers to:
   *
   * - blank node context for null `values`
   * - literal for string `values` and no `options` paramter
   * - matching RDF/JS term
   * - term created according to `options.type` parameter
   *
   * @param {null|string|string[]|Term|Term[]|Clownface|Clownface[]} values
   * @param {Object} [options]
   * @param {"NamedNode"|"BlankNode"|"Literal"} [options.type] explicit type for nodes
   * @param {string} [options.language] language tag of literals
   * @param {string} [options.datatype] datatype of literals
   * @returns {Clownface}
   */
  node(values, { type, datatype, language } = {}) {
    values = this._toTermArray(values, type, datatype || language) || [null];

    const context = values.reduce((context, value) => {
      return context.concat(this._context.reduce((all, current) => {
        return all.concat([current.clone({ value })])
      }, []))
    }, []);

    return Clownface.fromContext(context, { factory: this.factory })
  }

  /**
   * Creates graph pointer to one or more blank nodes
   * @param {null|string|string[]|BlankNode|BlankNode[]|Clownface|Clownface[]} [values] blank node identifiers (generates it when falsy) or existing RDF/JS blank node(s)
   * @returns {Clownface}
   */
  blankNode(values) {
    return this.node(values, { type: 'BlankNode' })
  }

  /**
   * Creates graph pointer to one or more literal nodes
   * @param {string|string[]|boolean|boolean[]|number|number[]|Literal|Literal[]|Clownface|Clownface[]} values literal values as JS objects or RDF/JS Literal(s)
   * @param {string|Term} [languageOrDatatype] a language tag string or datatype term
   * @returns {Clownface}
   */
  literal(values, languageOrDatatype) {
    return this.node(values, { type: 'Literal', datatype: languageOrDatatype })
  }

  /**
   * Creates graph pointer to one or more named nodes
   * @param {string|string[]|NamedNode|NamedNode[]|Clownface|Clownface[]} values URI(s) or RDF/JS NamedNode(s)
   * @returns {Clownface}
   */
  namedNode(values) {
    return this.node(values, { type: 'NamedNode' })
  }

  /**
   * Creates a graph pointer to nodes which are linked to the current pointer by `predicates`
   * @param {Term|Term[]|Clownface|Clownface[]} [predicates] one or more RDF/JS term identifying a property
   * @returns {Clownface}
   */
  in(predicates) {
    predicates = this._toTermArray(predicates);

    const context = this._context.reduce((all, current) => all.concat(current.in(predicates)), []);

    return Clownface.fromContext(context, this)
  }

  /**
   * Creates a graph pointer to the result nodes after following a predicate, or after
   * following any predicates in an array, starting from the subject(s) (current graph pointer) to the objects.
   * @param {Term|Term[]|Clownface|Clownface[]} [predicates] any predicates to follow
   * @param {object} [options]
   * @param {string | string[] | undefined} [options.language]
   * @returns {Clownface}
   */
  out(predicates, options = {}) {
    predicates = this._toTermArray(predicates);

    const context = this._context.reduce((all, current) => all.concat(current.out(predicates, options)), []);

    return Clownface.fromContext(context, this)
  }

  /**
   * Creates a graph pointer to nodes which are subjects of predicates, optionally also with specific objects
   *
   * If the current context is empty, will check all potential subjects
   *
   * @param {Term|Term[]|Clownface|Clownface[]} predicates RDF property identifiers
   * @param {*} [objects] object values to match
   * @returns {Clownface}
   */
  has(predicates, objects) {
    predicates = this._toTermArray(predicates);
    objects = this._toTermArray(objects);

    const context = this._context.reduce((all, current) => all.concat(current.has(predicates, objects)), []);

    return Clownface.fromContext(context, this)
  }

  /**
   * Creates a new quad(s) in the dataset where the current context is the object
   *
   * @param {Term|Term[]|Clownface|Clownface[]} predicates
   * @param {NamedNode|NamedNode[]|Clownface|Clownface[]} subjects one or more nodes to use as subjects
   * @param {GraphPointerCallback} [callback] called for each object, with subject pointer as parameter
   * @returns {Clownface} current graph pointer
   */
  addIn(predicates, subjects, callback) {
    if (!predicates) {
      throw new Error('predicate parameter is required')
    }

    if (typeof subjects === 'function') {
      callback = subjects;
      subjects = null;
    }

    predicates = this._toTermArray(predicates);
    subjects = this._toTermArray(subjects) || [this.factory.blankNode()];

    const context = this._context.map(context => context.addIn(predicates, subjects));

    if (callback) {
      Clownface.fromContext(context, this).forEach(callback);
    }

    return this
  }

  /**
   * Creates a new quad(s) in the dataset where the current context is the subject
   *
   * @param {Term|Term[]|Clownface|Clownface[]} predicates
   * @param {*} objects one or more values to use for objects
   * @param {GraphPointerCallback} [callback] called for each subject, with object pointer as parameter
   * @returns {Clownface} current graph pointer
   */
  addOut(predicates, objects, callback) {
    if (!predicates) {
      throw new Error('predicate parameter is required')
    }

    if (typeof objects === 'function') {
      callback = objects;
      objects = null;
    }

    predicates = this._toTermArray(predicates);
    objects = this._toTermArray(objects) || [this.factory.blankNode()];

    const context = this._context.map(context => context.addOut(predicates, objects));

    if (callback) {
      Clownface.fromContext(context, this).forEach(callback);
    }

    return this
  }

  /**
   * Creates a new RDF list or lists containing the given items
   *
   * @param {Term|Term[]|Clownface|Clownface[]} predicates
   * @param {*} items one or more values to use for subjects
   * @returns {Clownface} current graph pointer
   */
  addList(predicates, items) {
    if (!predicates || !items) {
      throw new Error('predicate and items parameter is required')
    }

    predicates = this._toTermArray(predicates);
    items = this._toTermArray(items);

    this._context.forEach(context => context.addList(predicates, items));

    return this
  }

  /**
   * Deletes all quads where the current graph pointer contexts are the objects
   *
   * @param {Term|Term[]|Clownface|Clownface[]} [predicates]
   * @param {Term|Term[]|Clownface|Clownface[]} [subjects]
   * @returns {Clownface} current graph pointer
   */
  deleteIn(predicates, subjects) {
    predicates = this._toTermArray(predicates);
    subjects = this._toTermArray(subjects);

    this._context.forEach(context => context.deleteIn(predicates, subjects));

    return this
  }

  /**
   * Deletes all quads where the current graph pointer contexts are the subjects
   *
   * @param {Term|Term[]|Clownface|Clownface[]} [predicates]
   * @param {Term|Term[]|Clownface|Clownface[]} [objects]
   * @returns {Clownface} current graph pointer
   */
  deleteOut(predicates, objects) {
    predicates = this._toTermArray(predicates);
    objects = this._toTermArray(objects);

    this._context.forEach(context => context.deleteOut(predicates, objects));

    return this
  }

  /**
   * Deletes entire RDF lists where the current graph pointer is the subject
   *
   * @param {Term|Term[]|Clownface|Clownface[]} predicates
   * @returns {Clownface} current graph pointer
   */
  deleteList(predicates) {
    if (!predicates) {
      throw new Error('predicate parameter is required')
    }

    predicates = this._toTermArray(predicates);

    this._context.forEach(context => context.deleteList(predicates));

    return this
  }

  _toTermArray(predicates, type, languageOrDatatype) {
    return toTermArray(predicates, type, languageOrDatatype, this.factory)
  }

  static fromContext(context, { factory }) {
    return new Clownface({ _context: toArray(context), factory })
  }
}

/**
 * @callback GraphPointerCallback
 * @param {Clownface} pointer graph pointer to the new or existing node
 */

/**
 * @callback FilterCallback
 * @param {Clownface} pointer
 * @param {number} index
 * @param {Clownface[]} pointers
 * @return {boolean}
 */

/**
 * @callback ForEachCallback
 * @param {Clownface} pointer
 */

/**
 * @callback MapCallback
 * @template T
 * @param {Clownface} pointer
 * @return {T}
 */

/**
 * Factory to create graph pointer objects
 *
 * @param {Object} init
 * @param {DatasetCore} init.dataset an RDF/JS dataset
 * @param {string|Term} [init.graph] graph URI
 * @param {Term|Term[]} [init.term] one or more RDF/JS term(s) which will be the pointer's context
 * @param {string} [init.value] one or more raw values which will create literal node as the pointer's context
 * @param {DataFactory} [init.factory=@rdfjs/environment] an RDF/JS factory which will be used to create nodes
 * @param {Context} [init._context] an existing clownface context. takes precedence before other params
 * @returns {Clownface}
 */
function factory$1({ dataset, graph, term, value, factory = environment, _context }) {
  return new Clownface({ dataset, graph, term, value, factory, _context })
}

class ClownfaceFactory {
  clownface({ ...args } = {}) {
    if (!args.dataset && typeof this.dataset === 'function') {
      args.dataset = this.dataset();
    }

    return factory$1({ ...args, factory: this })
  }
}

ClownfaceFactory.exports = ['clownface'];

/* eslint-disable @typescript-eslint/consistent-type-imports */
var factory = new Environment([
    DataFactory$1,
    Factory$2,
    Factory,
    ClownfaceFactory,
    Factory$1,
]);

function prepareNamespaces(factory) {
    return {
        sh: namespace('http://www.w3.org/ns/shacl#', { factory }),
        xsd: namespace('http://www.w3.org/2001/XMLSchema#', { factory }),
        rdf: namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', { factory }),
        rdfs: namespace('http://www.w3.org/2000/01/rdf-schema#', { factory }),
        owl: namespace('http://www.w3.org/2002/07/owl#', { factory }),
    };
}
var ns = prepareNamespaces();

/* This file was automatically generated. Do not edit by hand. */
var shaclVocabularyFactory = ({ factory }) => {
    const f = factory;
    const ns1 = 'http://www.w3.org/ns/shacl#';
    const ns2 = 'http://purl.org/dc/terms/';
    const ns3 = 'http://www.w3.org/2001/XMLSchema#';
    const ns4 = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const ns5 = 'http://www.w3.org/2002/07/owl#';
    const ns6 = 'http://www.w3.org/2000/01/rdf-schema#';
    const ns7 = 'http://www.w3.org/ns/shacl-shacl#';
    const ns8 = 'http://datashapes.org/dash#';
    const blankNodes = [];
    for (let i = 0; i < 76; i++) {
        blankNodes.push(f.blankNode());
    }
    return [
        f.quad(f.namedNode(ns1), f.namedNode(`${ns2}creator`), f.literal('W3C Data Shapes Working Group'), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns2}license`), f.literal('https://www.w3.org/copyright/software-license/', f.namedNode(`${ns3}anyURI`)), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns2}publisher`), f.literal('World Wide Web Consortium'), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns4}type`), f.namedNode(`${ns5}Ontology`), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns6}comment`), f.literal('This vocabulary defines terms used in SHACL, the W3C Shapes Constraint Language.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns6}label`), f.literal('W3C Shapes Constraint Language (SHACL) Vocabulary', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns5}versionIRI`), f.namedNode(`${ns1}1.2`), f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns1}declare`), blankNodes[0], f.namedNode(ns1)),
        f.quad(f.namedNode(ns1), f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(ns7), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AbstractResult`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AbstractResult`), f.namedNode(`${ns6}comment`), f.literal('The base class of validation results, typically not instantiated directly.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AbstractResult`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AbstractResult`), f.namedNode(`${ns6}label`), f.literal('Abstract result', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AbstractResult`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent-and`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent-and`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent-and`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}and`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to test whether a value node conforms to all members of a provided list of shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('And constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}AndConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}AndConstraintComponent-and`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNode`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNode`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all blank nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNode`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNode`), f.namedNode(`${ns6}label`), f.literal('Blank node', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all blank nodes or IRIs.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(`${ns6}label`), f.literal('Blank node or IRI', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrLiteral`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrLiteral`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all blank nodes or literals.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrLiteral`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}BlankNodeOrLiteral`), f.namedNode(`${ns6}label`), f.literal('Blank node or literal', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent-class`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent-class`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent-class`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent-class`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that each value node is an instance of a given type.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Class constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClassConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ClassConstraintComponent-class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-closed`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-closed`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-closed`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}closed`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-ignoredProperties`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-ignoredProperties`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-ignoredProperties`), f.namedNode(`${ns1}optional`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent-ignoredProperties`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}ignoredProperties`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to indicate that focus nodes must only have values for those properties that have been explicitly enumerated via sh:property/sh:path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Closed constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ClosedConstraintComponent-closed`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ClosedConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ClosedConstraintComponent-ignoredProperties`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('The class of constraint components.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns6}comment`), f.literal('A count expression is a blank node with exactly one value for the property sh:count which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns6}label`), f.literal('Count Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns1}property`), blankNodes[1], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}CountExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}count`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DataGraph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DataGraph`), f.namedNode(`${ns6}comment`), f.literal('The class of graphs that typically act in the role of a SHACL data graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DataGraph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DataGraph`), f.namedNode(`${ns6}label`), f.literal('Data graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DataGraph`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Graph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}datatype`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the datatype of all value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Datatype constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DatatypeConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}DatatypeConstraintComponent-datatype`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Debug`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Debug`), f.namedNode(`${ns6}comment`), f.literal('The severity for a debug validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Debug`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Debug`), f.namedNode(`${ns6}label`), f.literal('Debug', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent-disjoint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent-disjoint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent-disjoint`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent-disjoint`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}disjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that the set of value nodes is disjoint with the the set of nodes that can be reached from the focus node via a given property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Disjoint constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DisjointConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}DisjointConstraintComponent-disjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns6}comment`), f.literal('A distinct expression is a blank node with exactly one value for the property sh:distinct which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns6}label`), f.literal('Distinct Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns1}property`), blankNodes[2], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}DistinctExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}distinct`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent-equals`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent-equals`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent-equals`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent-equals`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}equals`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that the set of value nodes is equal to the set of nodes that can be reached from the focus node using a given property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Equals constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}EqualsConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}EqualsConstraintComponent-equals`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns6}comment`), f.literal('An exists expression is a blank node with exactly one value for sh:exists (which is a well-formed shape).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns6}label`), f.literal('Exists Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns1}property`), blankNodes[3], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExistsExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}exists`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent-expression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent-expression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent-expression`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}expression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that a given node expression produces true for all value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Expression constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ExpressionConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ExpressionConstraintComponent-expression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns6}comment`), f.literal('A filter shape expression is a blank node with exactly one value for sh:filterShape (which is a well-formed shape) and at most one value for sh:nodes (which is a well-formed node expression).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns6}label`), f.literal('Filter Shape Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns1}property`), blankNodes[4], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns1}property`), blankNodes[5], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}filterShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FocusNodeOrConstantTermExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FocusNodeOrConstantTermExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Function`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Function`), f.namedNode(`${ns6}comment`), f.literal('The class of SHACL functions.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Function`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Function`), f.namedNode(`${ns6}label`), f.literal('Function', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Function`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FunctionExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FunctionExpression`), f.namedNode(`${ns6}comment`), f.literal('A function expression is a blank node that does not fulfill any of the syntax rules of the other node expression types and which is the subject of exactly one triple T where the object is a well-formed SHACL list, and each member of that list is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FunctionExpression`), f.namedNode(`${ns6}label`), f.literal('Function Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}FunctionExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Graph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Graph`), f.namedNode(`${ns6}comment`), f.literal('The class of graphs.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Graph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Graph`), f.namedNode(`${ns6}label`), f.literal('Graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Graph`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns5}Ontology`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns6}comment`), f.literal('A group concat expression is a blank node with exactly one value for the property sh:groupConcat which is a well-formed node expression. A group concat expression can have a single value for the property sh:separator which is literal with datatype xsd:string.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns6}label`), f.literal('Group Concat Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns1}property`), blankNodes[6], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns1}property`), blankNodes[7], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}groupConcat`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent-hasValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent-hasValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent-hasValue`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}hasValue`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that one of the value nodes is a given RDF node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Has-value constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}HasValueConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}HasValueConstraintComponent-hasValue`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRI`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRI`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all IRIs.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRI`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRI`), f.namedNode(`${ns6}label`), f.literal('IRI', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all IRIs or literals.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(`${ns6}label`), f.literal('IRI or literal', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns6}comment`), f.literal('An if expression is a blank node with exactly one value for sh:if (which is a well-formed node expression), at most one value for sh:then (which is a well-formed node expression) and at most one value for sh:else (which is a well-formed node expression).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns6}label`), f.literal('If Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}property`), blankNodes[8], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}property`), blankNodes[9], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}property`), blankNodes[10], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}else`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}if`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IfExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}then`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent-in`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent-in`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent-in`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent-in`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}in`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to exclusively enumerate the permitted value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('In constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}InConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}InConstraintComponent-in`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Info`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Info`), f.namedNode(`${ns6}comment`), f.literal('The severity for an informational validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Info`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Info`), f.namedNode(`${ns6}label`), f.literal('Info', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns6}comment`), f.literal('An intersection expression is a blank node with exactly one value for the property sh:intersection which is a well-formed SHACL list with at least two members (which are well-formed node expressions).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns6}label`), f.literal('Intersection Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns1}property`), blankNodes[11], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}intersection`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent-languageIn`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent-languageIn`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent-languageIn`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent-languageIn`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}languageIn`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to enumerate language tags that all value nodes must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Language-in constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LanguageInConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}LanguageInConstraintComponent-languageIn`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent-lessThan`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent-lessThan`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent-lessThan`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent-lessThan`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}lessThan`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that each value node is smaller than all the nodes that can be reached from the focus node via a given property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Less-than constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}LessThanConstraintComponent-lessThan`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent-lessThanOrEquals`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent-lessThanOrEquals`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent-lessThanOrEquals`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent-lessThanOrEquals`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}lessThanOrEquals`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that every value node is smaller than all the nodes that can be reached from the focus node via a given property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Less-than-or-equals constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}LessThanOrEqualsConstraintComponent-lessThanOrEquals`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns6}comment`), f.literal('A limit expression is a blank node with exactly one value for the property sh:limit which is a literal with datatype xsd:integer and with exactly one value for the property sh:nodes which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns6}label`), f.literal('Limit Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns1}property`), blankNodes[12], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns1}property`), blankNodes[13], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}LimitExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}limit`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpression`), f.namedNode(`${ns6}comment`), f.literal('The base class of node expressions (instances) that take a list of parameters.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpression`), f.namedNode(`${ns6}label`), f.literal('List parameter expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpressionFunction`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpressionFunction`), f.namedNode(`${ns6}comment`), f.literal('The base class of node expression functions that take a list of parameters.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpressionFunction`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpressionFunction`), f.namedNode(`${ns6}label`), f.literal('List parameter expression function', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ListParameterExpressionFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Literal`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Literal`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all literals.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Literal`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Literal`), f.namedNode(`${ns6}label`), f.literal('Literal', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}maxCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the maximum number of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Max-count constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MaxCountConstraintComponent-maxCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}Literal`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}maxExclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the range of value nodes with a maximum exclusive value.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Max-exclusive constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExclusiveConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MaxExclusiveConstraintComponent-maxExclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns6}comment`), f.literal('A max expression is a blank node with exactly one value for the property sh:max which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns6}label`), f.literal('Max Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns1}property`), blankNodes[14], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}max`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}Literal`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}maxInclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the range of value nodes with a maximum inclusive value.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Max-inclusive constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxInclusiveConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MaxInclusiveConstraintComponent-maxInclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}maxLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the maximum string length of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Max-length constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxLengthConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MaxLengthConstraintComponent-maxLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent-maxListLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent-maxListLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent-maxListLength`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent-maxListLength`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}maxListLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum length of a SHACL list. A violation is reported if the value is not a valid SHACL list.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Maximum list length constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MaxListLengthConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MaxListLengthConstraintComponent-maxListLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent-memberShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent-memberShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent-memberShape`), f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent-memberShape`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}memberShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('Can be used to specify constraints on the members of a given SHACL list. A violation is reported for each member of the list that does not comply with the constraints specified by the given shape. A violation is reported if the value is not a valid SHACL list.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Member shape constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MemberShapeConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MemberShapeConstraintComponent-memberShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the minimum number of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Min-count constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MinCountConstraintComponent-minCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}Literal`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minExclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the range of value nodes with a minimum exclusive value.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Min-exclusive constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExclusiveConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MinExclusiveConstraintComponent-minExclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns6}comment`), f.literal('A min expression is a blank node with exactly one value for the property sh:min which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns6}label`), f.literal('Min Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns1}property`), blankNodes[15], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}min`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}Literal`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minInclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the range of value nodes with a minimum inclusive value.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Min-inclusive constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinInclusiveConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MinInclusiveConstraintComponent-minInclusive`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the minimum string length of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Min-length constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinLengthConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MinLengthConstraintComponent-minLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent-minListLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent-minListLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent-minListLength`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent-minListLength`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minListLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum length of a SHACL list. A violation is reported if the value is not a valid SHACL list.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Minimum list length constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinListLengthConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}MinListLengthConstraintComponent-minListLength`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns6}comment`), f.literal('A minus expression is a blank node with exactly one value for the property sh:minus which is a well-formed node expression and exactly one value for the property sh:nodes which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns6}label`), f.literal('Minus Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns1}property`), blankNodes[16], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns1}property`), blankNodes[17], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}MinusExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}minus`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(`${ns6}comment`), f.literal('The base class of node expressions (instances) that take named parameters.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(`${ns6}label`), f.literal('Named parameter expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns6}comment`), f.literal('The base class of node expression functions that take named parameters.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns6}label`), f.literal('Named parameter expression function', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent-nodeByExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent-nodeByExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent-nodeByExpression`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodeByExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that all value nodes conform to the node shape(s) produced by the given node expression.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Node by expression constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeByExpressionConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}NodeByExpressionConstraintComponent-nodeByExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent-node`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent-node`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent-node`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}node`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that all value nodes conform to the given node shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Node constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}NodeConstraintComponent-node`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns6}comment`), f.literal('The base class of node expression (instances).', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns6}label`), f.literal('Node expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns1}expression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns1}values`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpression`), f.namedNode(`${ns1}xone`), blankNodes[18], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(`${ns6}comment`), f.literal('The base (meta) class of node expression functions.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(`${ns6}label`), f.literal('Node expression function', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKind`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKind`), f.namedNode(`${ns6}comment`), f.literal('The class of all node kinds, including sh:BlankNode, sh:IRI, sh:Literal or the combinations of these: sh:BlankNodeOrIRI, sh:BlankNodeOrLiteral, sh:IRIOrLiteral.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKind`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKind`), f.namedNode(`${ns6}label`), f.literal('Node kind', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKind`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(`${ns1}in`), blankNodes[19], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the RDF node kind of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Node-kind constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeKindConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}NodeKindConstraintComponent-nodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeShape`), f.namedNode(`${ns6}comment`), f.literal('A node shape is a shape that specifies constraints that need to be met with respect to focus nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeShape`), f.namedNode(`${ns6}label`), f.literal('Node shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NodeShape`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent-not`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent-not`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent-not`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}not`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that value nodes do not conform to a given shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Not constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}NotConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}NotConstraintComponent-not`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns6}comment`), f.literal('An offset expression is a blank node with exactly one value for the property sh:offset which is a literal with datatype xsd:integer and with exactly one value for the property sh:nodes which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns6}label`), f.literal('Offset Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns1}property`), blankNodes[20], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns1}property`), blankNodes[21], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OffsetExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}offset`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent-or`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent-or`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent-or`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}or`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the value nodes so that they conform to at least one out of several provided shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Or constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}OrConstraintComponent-or`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns6}comment`), f.literal('An orderBy expression is a blank node with exactly one value for the property sh:orderBy which is a well-formed node expression and with exactly one value for the property sh:nodes which is a well-formed node expression. An orderBy expression can have one value for the property sh:desc which is either true or false.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns6}label`), f.literal('OrderBy Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns1}property`), blankNodes[22], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns1}property`), blankNodes[23], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns1}property`), blankNodes[24], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}OrderByExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}orderBy`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameter`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameter`), f.namedNode(`${ns6}comment`), f.literal('The class of parameter declarations, consisting of a path predicate and (possibly) information about allowed value type, cardinality and other characteristics.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameter`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameter`), f.namedNode(`${ns6}label`), f.literal('Parameter', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameter`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameterizable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameterizable`), f.namedNode(`${ns6}comment`), f.literal('Superclass of components that can take parameters, especially functions and constraint components.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameterizable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameterizable`), f.namedNode(`${ns6}label`), f.literal('Parameterizable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Parameterizable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns6}comment`), f.literal('A path expression is a blank node with exactly one value of the property sh:path (which are well-formed property paths) and at most one value for sh:nodes (which is a well-formed node expression).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns6}label`), f.literal('Path Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns1}property`), blankNodes[25], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PathExpression`), f.namedNode(`${ns1}property`), blankNodes[26], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(`${ns1}optional`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}flags`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-pattern`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-pattern`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-pattern`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent-pattern`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}pattern`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that every value node matches a given regular expression.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Pattern constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}PatternConstraintComponent-flags`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PatternConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}PatternConstraintComponent-pattern`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(`${ns6}comment`), f.literal('The class of prefix declarations, consisting of pairs of a prefix with a namespace.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(`${ns6}label`), f.literal('Prefix declaration', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent-property`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent-property`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent-property`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that all value nodes conform to the given property shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Property constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}PropertyConstraintComponent-property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyGroup`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyGroup`), f.namedNode(`${ns6}comment`), f.literal('Instances of this class represent groups of property shapes that belong together.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyGroup`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyGroup`), f.namedNode(`${ns6}label`), f.literal('Property group', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyGroup`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyShape`), f.namedNode(`${ns6}comment`), f.literal('A property shape is a shape that specifies constraints on the values of a focus node for a given property or path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyShape`), f.namedNode(`${ns6}label`), f.literal('Property shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}PropertyShape`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedMaxCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedMaxCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedMaxCount`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedMaxCount`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}optional`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that a specified maximum number of value nodes conforms to a given shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Qualified-max-count constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedMaxCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMaxCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedMinCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedMinCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedMinCount`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedMinCount`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShape`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}optional`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that a specified minimum number of value nodes conforms to a given shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Qualified-min-count constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedMinCount`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}QualifiedMinCountConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}QualifiedMinCountConstraintComponent-qualifiedValueShapesDisjoint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(`${ns1}optional`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}reificationRequired`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reifierShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reifierShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent-reifierShape`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}reifierShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that the reifier conforms to a given shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('ReifierShape constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ReifierShapeConstraintComponent-reificationRequired`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ReifierShapeConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}ReifierShapeConstraintComponent-reifierShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(`${ns6}comment`), f.literal('A class of result annotations, which define the rules to derive the values of a given annotation property as extra values for a validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(`${ns6}label`), f.literal('Result annotation', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent-rootClass`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent-rootClass`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent-rootClass`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent-rootClass`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}rootClass`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that each value node is the given class or a (transitive) subclass of that class.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Root class constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}RootClassConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}RootClassConstraintComponent-rootClass`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Rule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Rule`), f.namedNode(`${ns6}comment`), f.literal('The class of SHACL rules. Never instantiated directly.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Rule`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Rule`), f.namedNode(`${ns6}label`), f.literal('Rule', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Rule`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of SPARQL executables that are based on an ASK query.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL ASK executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns6}comment`), f.literal('A SPARQL ASK expression is a blank node with exactly one value for the property sh:ask which is string literal. The blank node may have values for the property sh:prefixes and these values are IRIs or blank nodes. Using the values of sh:prefixes as defined by 5.2.1 Prefix Declarations for SPARQL Queries, the value of sh:ask must be valid SPARQL 1.1 ASK query. The blank node may also have exactly one value for the property sh:nodes which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns6}label`), f.literal('SPARQL ASK Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns1}property`), blankNodes[27], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns1}property`), blankNodes[28], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns1}property`), blankNodes[29], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}ask`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns6}comment`), f.literal('The class of validators based on SPARQL ASK queries. The queries are evaluated for each value node and are supposed to return true if the given node conforms.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns6}label`), f.literal('SPARQL ASK validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLAskValidator`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Validator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(`${ns6}comment`), f.literal('The class of constraints based on SPARQL SELECT queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(`${ns6}label`), f.literal('SPARQL constraint', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent-sparql`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent-sparql`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent-sparql`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}sparql`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to define constraints based on SPARQL queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('SPARQL constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SPARQLConstraintComponent-sparql`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of SPARQL executables that are based on a CONSTRUCT query.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL CONSTRUCT executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of SPARQL executables based on a SPARQL DESCRIBE.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL DESCRIBE executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of resources that encapsulate a SPARQL query.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns1}description`), f.literal('The prefixes that shall be applied before parsing the SPARQL query that gets derived from the sh:sparqlExpr expression. The object should define those prefixes using sh:declare.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns1}name`), f.literal('prefixes', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}prefixes`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns1}description`), f.literal('The SPARQL expression that is executed during evaluation of this node expression.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns1}keyParameter`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns1}name`), f.literal('SPARQL expr', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}sparqlExpr`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns6}comment`), f.literal('The class of node expressions based on SPARQL expressions (sh:sparqlExpr).', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns6}label`), f.literal('SPARQL expr expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SPARQLExprExpression-prefixes`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SPARQLExprExpression-sparqlExpr`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}comment`), f.literal('A function backed by a SPARQL query - either ASK or SELECT.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}label`), f.literal('SPARQL function', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Function`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLFunction`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns6}comment`), f.literal('The class of SHACL rules based on SPARQL CONSTRUCT queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns6}label`), f.literal('SPARQL CONSTRUCT rule', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Rule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns1}property`), blankNodes[30], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLRule`), f.namedNode(`${ns1}property`), blankNodes[31], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of SPARQL executables based on a SELECT query.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL SELECT executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns6}comment`), f.literal('A SPARQL SELECT expression is a blank node with exactly one value for the property sh:select which is string literal. The blank node may have values for the property sh:prefixes and these values are IRIs or blank nodes. Using the values of sh:prefixes as defined by 5.2.1 Prefix Declarations for SPARQL Queries, the value of sh:select must be valid SPARQL 1.1 SELECT query with exactly one result variable. The blank node may also have exactly one value for the property sh:nodes which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns6}label`), f.literal('SPARQL SELECT Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns1}property`), blankNodes[32], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns1}property`), blankNodes[33], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns1}property`), blankNodes[34], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}select`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns6}comment`), f.literal('The class of validators based on SPARQL SELECT queries. The queries are evaluated for each focus node and are supposed to produce bindings for all focus nodes that do not conform.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns6}label`), f.literal('SPARQL SELECT validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Validator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}comment`), f.literal('The class of targets that are based on SPARQL queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}label`), f.literal('SPARQL target', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTarget`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Target`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}comment`), f.literal('The (meta) class for parameterizable targets that are based on SPARQL queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}label`), f.literal('SPARQL target type', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLTargetType`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}TargetType`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(`${ns6}comment`), f.literal('The class of SPARQL executables based on a SPARQL UPDATE.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(`${ns6}label`), f.literal('SPARQL UPDATE executable', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns1}description`), f.literal('The prefixes that shall be applied before parsing the associated SPARQL query. The object should define those prefixes using sh:declare.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns1}name`), f.literal('prefixes', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}prefixes`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns1}description`), f.literal('The SELECT query that is executed during evaluation of this node expression. The output nodes are the bindings of the first result variable.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns1}keyParameter`), f.literal('true', f.namedNode(`${ns3}boolean`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns1}name`), f.literal('select', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}select`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NamedParameterExpressionFunction`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns6}comment`), f.literal('The class of node expressions based on SPARQL SELECT queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns6}label`), f.literal('Select expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NamedParameterExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SelectExpression-prefixes`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SelectExpression`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SelectExpression-select`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Severity`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Severity`), f.namedNode(`${ns6}comment`), f.literal('The class of validation result severity levels, including violation and warning levels.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Severity`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Severity`), f.namedNode(`${ns6}label`), f.literal('Severity', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Severity`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Shape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Shape`), f.namedNode(`${ns6}comment`), f.literal('A shape is a collection of constraints that may be targeted for certain nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Shape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Shape`), f.namedNode(`${ns6}label`), f.literal('Shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Shape`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns6}comment`), f.literal('A shape class is a class that is also a node shape. sh:ShapeClass can be used as rdf:type instead of the combination of rdfs:Class and sh:NodeShape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns6}label`), f.literal('Shape class', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapeClass`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapesGraph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapesGraph`), f.namedNode(`${ns6}comment`), f.literal('The class of graphs that typically act in the role of a SHACL shapes graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapesGraph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapesGraph`), f.namedNode(`${ns6}label`), f.literal('Shapes graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ShapesGraph`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Graph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}singleLine`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to specify that none of the value nodes may contain line breaks.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Single line constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SingleLineConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SingleLineConstraintComponent-singleLine`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent-someValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent-someValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent-someValue`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}someValue`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that at least one of the value nodes conform to the given shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Some value constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SomeValueConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SomeValueConstraintComponent-someValue`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent-subsetOf`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent-subsetOf`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent-subsetOf`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent-subsetOf`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}subsetOf`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to verify that the set of value nodes is a subset of the set of nodes that can be reached from the focus node using a given property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Subset-of constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SubsetOfConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}SubsetOfConstraintComponent-subsetOf`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns6}comment`), f.literal('A sum expression is a blank node with exactly one value for the property sh:sum which is a well-formed node expression.'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns6}label`), f.literal('Sum Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns1}property`), blankNodes[35], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}SumExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}sum`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Target`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Target`), f.namedNode(`${ns6}comment`), f.literal('The base class of targets such as those based on SPARQL queries.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Target`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Target`), f.namedNode(`${ns6}label`), f.literal('Target', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Target`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns6}comment`), f.literal('The (meta) class for parameterizable targets.	Instances of this are instantiated as values of the sh:target property.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns6}label`), f.literal('Target type', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TargetType`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Trace`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Trace`), f.namedNode(`${ns6}comment`), f.literal('The severity for a trace validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Trace`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Trace`), f.namedNode(`${ns6}label`), f.literal('Trace', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns6}comment`), f.literal('A rule based on triple (subject, predicate, object) pattern.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns6}label`), f.literal('Triple rule', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}Rule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns1}property`), blankNodes[36], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns1}property`), blankNodes[37], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleRule`), f.namedNode(`${ns1}property`), blankNodes[38], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleTerm`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleTerm`), f.namedNode(`${ns6}comment`), f.literal('The node kind of all triple terms.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleTerm`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}TripleTerm`), f.namedNode(`${ns6}label`), f.literal('Triple term', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns6}comment`), f.literal('A union expression is a blank node with exactly one value for the property sh:union which is a well-formed SHACL list with at least two members (which are well-formed node expressions).'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns6}label`), f.literal('Union Expression'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns1}property`), blankNodes[39], f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UnionExpression`), f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns1}union`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}uniqueLang`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to specify that no pair of value nodes may use the same language tag.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Unique-languages constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueLangConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}UniqueLangConstraintComponent-uniqueLang`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent-uniqueMembers`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent-uniqueMembers`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent-uniqueMembers`), f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent-uniqueMembers`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}uniqueMembers`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('Specifies that all members of a SHACL list must be unique. A violation is reported if the value is not a valid SHACL list.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Unique list members constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueMembersConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}UniqueMembersConstraintComponent-uniqueMembers`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent-uniqueValuesFor`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent-uniqueValuesFor`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent-uniqueValuesFor`), f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent-uniqueValuesFor`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}uniqueValuesFor`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to ensure that no two nodes targeted by the same shape have the same combination of values for a given set of properties.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Unique-values-for constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}UniqueValuesForConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}UniqueValuesForConstraintComponent-uniqueValuesFor`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationReport`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationReport`), f.namedNode(`${ns6}comment`), f.literal('The class of SHACL validation reports.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationReport`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationReport`), f.namedNode(`${ns6}label`), f.literal('Validation report', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationReport`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationResult`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationResult`), f.namedNode(`${ns6}comment`), f.literal('The class of validation results.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationResult`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationResult`), f.namedNode(`${ns6}label`), f.literal('Validation result', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ValidationResult`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Validator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Validator`), f.namedNode(`${ns6}comment`), f.literal('The class of validators, which provide instructions on how to process a constraint definition. This class serves as base class for the SPARQL-based validators and other possible implementations.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Validator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Validator`), f.namedNode(`${ns6}label`), f.literal('Validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Validator`), f.namedNode(`${ns6}subClassOf`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Violation`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Violation`), f.namedNode(`${ns6}comment`), f.literal('The severity for a violation validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Violation`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Violation`), f.namedNode(`${ns6}label`), f.literal('Violation', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Warning`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Warning`), f.namedNode(`${ns6}comment`), f.literal('The severity for a warning validation result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Warning`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}Warning`), f.namedNode(`${ns6}label`), f.literal('Warning', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent-xone`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent-xone`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent-xone`), f.namedNode(`${ns1}path`), f.namedNode(`${ns1}xone`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('A constraint component that can be used to restrict the value nodes so that they conform to exactly one out of several provided shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('Exactly one constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}XoneConstraintComponent`), f.namedNode(`${ns1}parameter`), f.namedNode(`${ns1}XoneConstraintComponent-xone`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}agentInstruction`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}agentInstruction`), f.namedNode(`${ns6}comment`), f.literal('Can be used to store instructions that shall be sent as input for external agents that understand natural language.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}agentInstruction`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}agentInstruction`), f.namedNode(`${ns6}label`), f.literal('agent instruction', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}alternativePath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}alternativePath`), f.namedNode(`${ns6}comment`), f.literal('The (single) value of this property must be a list of path elements, representing the elements of alternative paths.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}alternativePath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}alternativePath`), f.namedNode(`${ns6}label`), f.literal('alternative path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}alternativePath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}and`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}and`), f.namedNode(`${ns6}comment`), f.literal('RDF list of shapes to validate the value nodes against.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}and`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}and`), f.namedNode(`${ns6}label`), f.literal('and', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}and`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns6}comment`), f.literal('The annotation property that shall be set.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns6}label`), f.literal('annotation property', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationProperty`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationValue`), f.namedNode(`${ns6}comment`), f.literal('The (default) values of the annotation property.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationValue`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationValue`), f.namedNode(`${ns6}label`), f.literal('annotation value', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns6}comment`), f.literal('The name of the SPARQL variable from the SELECT clause that shall be used for the values.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns6}label`), f.literal('annotation variable name', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}annotationVarName`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL ASK query to execute.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLAskExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns6}label`), f.literal('ask', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ask`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}bodyExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}bodyExpression`), f.namedNode(`${ns6}comment`), f.literal('A node expression that is the implementation/body of a custom node expression function.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}bodyExpression`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}NodeExpressionFunction`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}bodyExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}bodyExpression`), f.namedNode(`${ns6}label`), f.literal('body expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}class`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}class`), f.namedNode(`${ns6}comment`), f.literal('The type that all value nodes must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}class`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}class`), f.namedNode(`${ns6}label`), f.literal('class', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}closed`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}closed`), f.namedNode(`${ns6}comment`), f.literal('If set to true then the shape is closed.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}closed`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}closed`), f.namedNode(`${ns6}label`), f.literal('closed', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}closed`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns6}comment`), f.literal('A hint on how code generators should represent the associated shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns6}label`), f.literal('code identifier', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}codeIdentifier`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns6}comment`), f.literal('The shapes that the focus nodes need to conform to before a rule is executed on them.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Rule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns6}label`), f.literal('condition', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}condition`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns6}comment`), f.literal('Severity levels that are evaluated in the conformance check.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns6}label`), f.literal('conformance disallows', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}comment`), f.literal('True if the validation did not produce any validation results with a severity level of the set of disallowed levels, and false otherwise.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}label`), f.literal('conforms', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conforms`), f.namedNode(`${ns6}seeAlso`), f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}comment`), f.literal('The subject conforms to the object if validation did not produce any validation results with a severity level of the set of disallowed levels.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}DataGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}label`), f.literal('conforms to', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ShapesGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}seeAlso`), f.literal('https://www.dublincore.org/specifications/dublin-core/dcmi-terms/terms/conformsTo/'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}conformsTo`), f.namedNode(`${ns6}seeAlso`), f.namedNode(`${ns1}conformanceDisallows`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL CONSTRUCT query to execute.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLConstructExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns6}label`), f.literal('construct', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}construct`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}count`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}datatype`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}datatype`), f.namedNode(`${ns6}comment`), f.literal('Specifies an RDF datatype that all value nodes must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}datatype`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}datatype`), f.namedNode(`${ns6}label`), f.literal('datatype', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}deactivated`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}deactivated`), f.namedNode(`${ns6}comment`), f.literal('If set to true then all nodes conform to this.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}deactivated`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}deactivated`), f.namedNode(`${ns6}label`), f.literal('deactivated', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}declare`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}declare`), f.namedNode(`${ns6}comment`), f.literal('Links a resource with its namespace prefix declarations.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}declare`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}declare`), f.namedNode(`${ns6}label`), f.literal('declare', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}declare`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}defaultValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}defaultValue`), f.namedNode(`${ns6}comment`), f.literal('A default value for a property, for example for user interface tools to pre-populate input fields.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}defaultValue`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}defaultValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}defaultValue`), f.namedNode(`${ns6}label`), f.literal('default value', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}desc`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL DESCRIBE to execute.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLDescribeExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns6}label`), f.literal('describe', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}describe`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}description`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}description`), f.namedNode(`${ns6}comment`), f.literal('Human-readable descriptions for the property in the context of the surrounding shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}description`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}description`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}description`), f.namedNode(`${ns6}label`), f.literal('description', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns6}comment`), f.literal('Links a result with other results that provide more details, for example to describe violations against nested shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns6}label`), f.literal('detail', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}detail`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}disjoint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}disjoint`), f.namedNode(`${ns6}comment`), f.literal('Specifies a property path where the set of values must be disjoint with the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}disjoint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}disjoint`), f.namedNode(`${ns6}label`), f.literal('disjoint', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}distinct`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}else`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns6}comment`), f.literal('An entailment regime that indicates what kind of inferencing is required by a shapes graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ShapesGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns6}label`), f.literal('entailment', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}entailment`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}equals`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}equals`), f.namedNode(`${ns6}comment`), f.literal('Specifies a property path that must have the same values as the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}equals`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}equals`), f.namedNode(`${ns6}label`), f.literal('equals', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}exists`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}expression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}expression`), f.namedNode(`${ns6}comment`), f.literal('The node expression that must return true for the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}expression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}expression`), f.namedNode(`${ns6}label`), f.literal('expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}filterShape`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:filterShape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}flags`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}flags`), f.namedNode(`${ns6}comment`), f.literal('An optional flag to be used with regular expression pattern matching.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}flags`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}flags`), f.namedNode(`${ns6}label`), f.literal('flags', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}flags`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}focusNode`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}focusNode`), f.namedNode(`${ns6}comment`), f.literal('The focus node that was validated when the result was produced.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}focusNode`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}focusNode`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}focusNode`), f.namedNode(`${ns6}label`), f.literal('focus node', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}formalized`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}formalized`), f.namedNode(`${ns6}comment`), f.literal('Can be used as reification of sh:intent triples to indicate whether the intended interpretation has already been formalized using SHACL in the same shapes graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}formalized`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}formalized`), f.namedNode(`${ns6}label`), f.literal('formalized', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}formalized`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns6}comment`), f.literal('Can be used to link to a property group to indicate that a property shape belongs to a group of related property shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns6}label`), f.literal('group', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}group`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}PropertyGroup`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}groupConcat`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}hasValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}hasValue`), f.namedNode(`${ns6}comment`), f.literal('Specifies a value that must be among the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}hasValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}hasValue`), f.namedNode(`${ns6}label`), f.literal('has value', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}if`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ignoredProperties`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ignoredProperties`), f.namedNode(`${ns6}comment`), f.literal('An optional RDF list of properties that are also permitted in addition to those explicitly enumerated via sh:property/sh:path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ignoredProperties`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ignoredProperties`), f.namedNode(`${ns6}label`), f.literal('ignored properties', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}ignoredProperties`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}in`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}in`), f.namedNode(`${ns6}comment`), f.literal('Specifies a list of allowed values so that each value node must be among the members of the given list.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}in`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}in`), f.namedNode(`${ns6}label`), f.literal('in', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}in`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}intent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}intent`), f.namedNode(`${ns6}comment`), f.literal('Provides human-readable descriptions of one or more intended rules, assumptions, or constraints associated with its subject (e.g., a shape). Can be used as input for external agents that understand natural language.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}intent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}intent`), f.namedNode(`${ns6}label`), f.literal('intent', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}intersection`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:intersection.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}inversePath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}inversePath`), f.namedNode(`${ns6}comment`), f.literal('The (single) value of this property represents an inverse path (object to subject).', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}inversePath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}inversePath`), f.namedNode(`${ns6}label`), f.literal('inverse path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}inversePath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns6}comment`), f.literal('Set to true for the parameter of a named parameter expression function that uniquely identifies it.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns6}label`), f.literal('key parameter', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}keyParameter`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}labelTemplate`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}labelTemplate`), f.namedNode(`${ns6}comment`), f.literal('Outlines how human-readable labels of instances of the associated Parameterizable shall be produced. The values can contain {?paramName} as placeholders for the actual values of the given parameter.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}labelTemplate`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}labelTemplate`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}labelTemplate`), f.namedNode(`${ns6}label`), f.literal('label template', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}languageIn`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}languageIn`), f.namedNode(`${ns6}comment`), f.literal('Specifies a list of language tags that all value nodes must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}languageIn`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}languageIn`), f.namedNode(`${ns6}label`), f.literal('language in', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}languageIn`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThan`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThan`), f.namedNode(`${ns6}comment`), f.literal('Specifies a property path that must have smaller values than the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThan`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThan`), f.namedNode(`${ns6}label`), f.literal('less than', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThanOrEquals`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThanOrEquals`), f.namedNode(`${ns6}comment`), f.literal('Specifies a property path that must have smaller or equal values than the value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThanOrEquals`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}lessThanOrEquals`), f.namedNode(`${ns6}label`), f.literal('less than or equals', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}limit`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}max`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxCount`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum number of values in the set of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxCount`), f.namedNode(`${ns6}label`), f.literal('max count', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxCount`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxExclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxExclusive`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum exclusive value of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxExclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxExclusive`), f.namedNode(`${ns6}label`), f.literal('max exclusive', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxInclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxInclusive`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum inclusive value of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxInclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxInclusive`), f.namedNode(`${ns6}label`), f.literal('max inclusive', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxLength`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum string length of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxLength`), f.namedNode(`${ns6}label`), f.literal('max length', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxLength`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxListLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxListLength`), f.namedNode(`${ns6}comment`), f.literal('Specifies the maximum length that a given SHACL list must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxListLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxListLength`), f.namedNode(`${ns6}label`), f.literal('Maximum list length', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}maxListLength`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}memberShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}memberShape`), f.namedNode(`${ns6}comment`), f.literal('Specifies the shape that all members of SHACL lists must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}memberShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}memberShape`), f.namedNode(`${ns6}label`), f.literal('member shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}memberShape`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}message`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}message`), f.namedNode(`${ns6}comment`), f.literal('A human-readable message (possibly with placeholders for variables) explaining the cause of the result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}message`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}message`), f.namedNode(`${ns6}label`), f.literal('message', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}min`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minCount`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum number of values in the set of value nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minCount`), f.namedNode(`${ns6}label`), f.literal('min count', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minCount`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minExclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minExclusive`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum exclusive value of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minExclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minExclusive`), f.namedNode(`${ns6}label`), f.literal('min exclusive', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minInclusive`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minInclusive`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum inclusive value of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minInclusive`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minInclusive`), f.namedNode(`${ns6}label`), f.literal('min inclusive', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minLength`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum string length of each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minLength`), f.namedNode(`${ns6}label`), f.literal('min length', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minLength`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minListLength`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minListLength`), f.namedNode(`${ns6}comment`), f.literal('Specifies the minimum length that a given SHACL list must have.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minListLength`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minListLength`), f.namedNode(`${ns6}label`), f.literal('Minimum list length', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minListLength`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minus`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}minus`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:remove.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}name`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}name`), f.namedNode(`${ns6}comment`), f.literal('Human-readable labels for the property in the context of the surrounding shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}name`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}name`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}name`), f.namedNode(`${ns6}label`), f.literal('name', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns6}comment`), f.literal('The namespace associated with a prefix in a prefix declaration.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns6}label`), f.literal('namespace', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}namespace`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}anyURI`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}node`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}node`), f.namedNode(`${ns6}comment`), f.literal('Specifies the node shape that all value nodes must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}node`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}node`), f.namedNode(`${ns6}label`), f.literal('node', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}node`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeByExpression`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeByExpression`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to node expressions, indicating the node shape(s) that all value nodes must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeByExpression`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeByExpression`), f.namedNode(`${ns6}label`), f.literal('node by expression', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns6}comment`), f.literal('Specifies the node kind (e.g. IRI or literal) each value node.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns6}label`), f.literal('node kind', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}NodeKind`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns6}comment`), f.literal('The validator(s) used to evaluate a constraint in the context of a node shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns6}label`), f.literal('node validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodeValidator`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Validator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}nodes`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:nodes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}not`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}not`), f.namedNode(`${ns6}comment`), f.literal('Specifies a shape that the value nodes must not conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}not`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}not`), f.namedNode(`${ns6}label`), f.literal('not', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}not`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}object`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}object`), f.namedNode(`${ns6}comment`), f.literal('An expression producing the nodes that shall be inferred as objects.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}object`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}TripleRule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}object`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}object`), f.namedNode(`${ns6}label`), f.literal('object', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}offset`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}oneOrMorePath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}oneOrMorePath`), f.namedNode(`${ns6}comment`), f.literal('The (single) value of this property represents a path that is matched one or more times.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}oneOrMorePath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}oneOrMorePath`), f.namedNode(`${ns6}label`), f.literal('one or more path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}oneOrMorePath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns6}comment`), f.literal('Indicates whether a parameter is optional.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns6}label`), f.literal('optional', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}optional`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}or`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}or`), f.namedNode(`${ns6}comment`), f.literal('Specifies a list of shapes so that the value nodes must conform to at least one of the shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}or`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}or`), f.namedNode(`${ns6}label`), f.literal('or', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}or`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}order`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}order`), f.namedNode(`${ns6}comment`), f.literal('Specifies the relative order of this compared to its siblings. For example use 0 for the first, 1 for the second.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}order`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}order`), f.namedNode(`${ns6}label`), f.literal('order', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}orderBy`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns6}comment`), f.literal('The parameters of a function or constraint component.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Parameterizable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns6}label`), f.literal('parameter', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}parameter`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Parameter`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}path`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}path`), f.namedNode(`${ns6}comment`), f.literal('Specifies the property path of a property shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}path`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}path`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}path`), f.namedNode(`${ns6}label`), f.literal('path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}pattern`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}pattern`), f.namedNode(`${ns6}comment`), f.literal('Specifies a regular expression pattern that the string representations of the value nodes must match.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}pattern`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}pattern`), f.namedNode(`${ns6}label`), f.literal('pattern', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}pattern`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}predicate`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}predicate`), f.namedNode(`${ns6}comment`), f.literal('An expression producing the properties that shall be inferred as predicates.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}predicate`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}TripleRule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}predicate`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}predicate`), f.namedNode(`${ns6}label`), f.literal('predicate', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns6}comment`), f.literal('The prefix of a prefix declaration.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}PrefixDeclaration`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns6}label`), f.literal('prefix', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefix`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefixes`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefixes`), f.namedNode(`${ns6}comment`), f.literal('The prefixes that shall be applied before parsing the associated SPARQL query. The objects should define those prefixes using sh:declare.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefixes`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefixes`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}prefixes`), f.namedNode(`${ns6}label`), f.literal('prefixes', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to its property shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns6}label`), f.literal('property', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}property`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}PropertyShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns6}comment`), f.literal('The validator(s) used to evaluate a constraint in the context of a property shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns6}label`), f.literal('property validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}propertyValidator`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Validator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(`${ns6}comment`), f.literal('The maximum number of value nodes that can conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(`${ns6}label`), f.literal('qualified max count', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMaxCount`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(`${ns6}comment`), f.literal('The minimum number of value nodes that must conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(`${ns6}label`), f.literal('qualified min count', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedMinCount`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(`${ns6}comment`), f.literal('The shape that a specified number of values must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(`${ns6}label`), f.literal('qualified value shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShape`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}comment`), f.literal('Can be used to mark the qualified value shape to be disjoint with its sibling shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}label`), f.literal('qualified value shapes disjoint', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}qualifiedValueShapesDisjoint`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reificationRequired`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reificationRequired`), f.namedNode(`${ns6}comment`), f.literal('Can be used to mark the reification statements required.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reificationRequired`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reificationRequired`), f.namedNode(`${ns6}label`), f.literal('reification required', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reificationRequired`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reifierShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reifierShape`), f.namedNode(`${ns6}comment`), f.literal('The shape that the reified triples must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reifierShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reifierShape`), f.namedNode(`${ns6}label`), f.literal('reifier shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}reifierShape`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}NodeShape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns6}comment`), f.literal('The validation results contained in a validation report.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns6}label`), f.literal('result', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}result`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ValidationResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns6}comment`), f.literal('Links a SPARQL validator with zero or more sh:ResultAnnotation instances, defining how to derive additional result properties based on the variables of the SELECT query.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLSelectValidator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns6}label`), f.literal('result annotation', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultAnnotation`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ResultAnnotation`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultMessage`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultMessage`), f.namedNode(`${ns6}comment`), f.literal('Human-readable messages explaining the cause of the result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultMessage`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultMessage`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultMessage`), f.namedNode(`${ns6}label`), f.literal('result message', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns6}comment`), f.literal('The path of a validation result, based on the path of the validated property shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns6}label`), f.literal('result path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultPath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns6}comment`), f.literal('The severity of the result, e.g. warning.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns6}label`), f.literal('result severity', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}resultSeverity`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns6}comment`), f.literal('The expected type of values returned by the associated function.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Function`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns6}label`), f.literal('return type', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}returnType`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rootClass`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rootClass`), f.namedNode(`${ns6}comment`), f.literal('Specifies a class so that each value node must be that class or a (transitive) subclass of that class.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rootClass`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rootClass`), f.namedNode(`${ns6}label`), f.literal('root class', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns6}comment`), f.literal('The rules linked to a shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns6}label`), f.literal('rule', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}rule`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Rule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL SELECT query to execute.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLSelectExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns6}label`), f.literal('select', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}select`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}separator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}severity`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}severity`), f.namedNode(`${ns6}comment`), f.literal('Defines the severity that validation results produced by a shape or constraint must have. Defaults to sh:Violation.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}severity`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}severity`), f.namedNode(`${ns6}label`), f.literal('severity', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}severity`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Severity`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shape`), f.namedNode(`${ns6}comment`), f.literal('Links from a node in the data graph to a shape that it is expected to conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shape`), f.namedNode(`${ns6}label`), f.literal('shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shape`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns6}comment`), f.literal('Shapes graphs that should be used when validating this data graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}DataGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns6}label`), f.literal('shapes graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraph`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ShapesGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns6}comment`), f.literal('If true then the validation engine was certain that the shapes graph has passed all SHACL syntax requirements during the validation process.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns6}label`), f.literal('shapes graph well-formed', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}shapesGraphWellFormed`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}singleLine`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}singleLine`), f.namedNode(`${ns6}comment`), f.literal('Specifies whether none of the value nodes may contain a line break.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}singleLine`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}singleLine`), f.namedNode(`${ns6}label`), f.literal('single line', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}singleLine`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}someValue`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}someValue`), f.namedNode(`${ns6}comment`), f.literal('Specifies the shape that at least one value node must conform to.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}someValue`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}someValue`), f.namedNode(`${ns6}label`), f.literal('some value', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}someValue`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraint`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraint`), f.namedNode(`${ns6}comment`), f.literal('The constraint that was validated when the result was produced.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraint`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraint`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraint`), f.namedNode(`${ns6}label`), f.literal('source constraint', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns6}comment`), f.literal('The constraint component that is the source of the result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns6}label`), f.literal('source constraint component', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceConstraintComponent`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns6}comment`), f.literal('The shape that is was validated when the result was produced.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns6}label`), f.literal('source shape', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sourceShape`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns6}comment`), f.literal('Links a shape with SPARQL constraints.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns6}label`), f.literal('constraint (in SPARQL)', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparql`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}SPARQLConstraint`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL expression that is executed during evaluation of a node expression.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLExprExpression`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns6}label`), f.literal('SPARQL expr', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sparqlExpr`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subject`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subject`), f.namedNode(`${ns6}comment`), f.literal('An expression producing the resources that shall be inferred as subjects.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subject`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}TripleRule`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subject`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subject`), f.namedNode(`${ns6}label`), f.literal('subject', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subsetOf`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subsetOf`), f.namedNode(`${ns6}comment`), f.literal('Specifies a property path where the set of value nodes must be a subset of the values of that property path.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subsetOf`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}subsetOf`), f.namedNode(`${ns6}label`), f.literal('subset of', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns6}comment`), f.literal('Suggested shapes graphs for this ontology. The values of this property may be used in the absence of specific sh:shapesGraph statements.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}DataGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns6}label`), f.literal('suggested shapes graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}suggestedShapesGraph`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ShapesGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}sum`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to a target specified by an extension language, for example instances of sh:SPARQLTarget.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns6}label`), f.literal('target', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}target`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Target`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to a class, indicating that all instances of the class must conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns6}label`), f.literal('target class', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetClass`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Class`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetNode`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetNode`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to node expressions, indicating that the output nodes must conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetNode`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetNode`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetNode`), f.namedNode(`${ns6}label`), f.literal('target node', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to a property, indicating that all all objects of triples that have the given property as their predicate must conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns6}label`), f.literal('target objects of', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetObjectsOf`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns6}comment`), f.literal('Links a shape to a property, indicating that all subjects of triples that have the given property as their predicate must conform to the shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns6}label`), f.literal('target subjects of', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetSubjectsOf`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns6}comment`), f.literal('Links a (subject) shape to an (object) shape, indicating that all nodes from the data graph that conform to the given (object) shape must conform to the (subject) shape.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns6}label`), f.literal('target where', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}targetWhere`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}then`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}this`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:var.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}union`), f.namedNode(`${ns6}comment`), f.literal('Deprecated with SHACL 1.2: replaced by shnex:concat.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueLang`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueLang`), f.namedNode(`${ns6}comment`), f.literal('Specifies whether all node values must have a unique (or no) language tag.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueLang`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueLang`), f.namedNode(`${ns6}label`), f.literal('unique languages', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueLang`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueMembers`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueMembers`), f.namedNode(`${ns6}comment`), f.literal('Specifies that all members of a SHACL list must be unique.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueMembers`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueMembers`), f.namedNode(`${ns6}label`), f.literal('Unique list members', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueMembers`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueValuesFor`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueValuesFor`), f.namedNode(`${ns6}comment`), f.literal('Specifies one or more properties (as a URI or rdf:List of URIs) for which no two nodes targeted by the same shape may have the same combination of values.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueValuesFor`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}uniqueValuesFor`), f.namedNode(`${ns6}label`), f.literal('unique values for', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}unit`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}unit`), f.namedNode(`${ns6}comment`), f.literal('The code of a unit that the (literal) value nodes should be interpreted with. Recommended values are plain strings from the UCUM and ISO 4217 standards for units of measure and currencies respectively, or unit URIs from QUDT or a similar ontology.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}unit`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}Shape`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}unit`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}unit`), f.namedNode(`${ns6}label`), f.literal('unit', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns6}comment`), f.literal('The SPARQL UPDATE to execute.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}SPARQLUpdateExecutable`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns6}label`), f.literal('update', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}update`), f.namedNode(`${ns6}range`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns6}comment`), f.literal('The subject Validation Report was generated using the object Shapes Graph.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns6}label`), f.literal('used shapes graph', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}usedShapesGraph`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ShapesGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns6}comment`), f.literal('A Validation Report that exists for the subject.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}DataGraph`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns6}label`), f.literal('validation report', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validationReport`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}ValidationReport`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns6}comment`), f.literal('The validator(s) used to evaluate constraints of either node or property shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}ConstraintComponent`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns6}label`), f.literal('validator', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}validator`), f.namedNode(`${ns6}range`), f.namedNode(`${ns1}Validator`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}value`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}value`), f.namedNode(`${ns6}comment`), f.literal('An RDF node that has caused the result.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}value`), f.namedNode(`${ns6}domain`), f.namedNode(`${ns1}AbstractResult`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}value`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}value`), f.namedNode(`${ns6}label`), f.literal('value', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}values`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}xone`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}xone`), f.namedNode(`${ns6}comment`), f.literal('Specifies a list of shapes so that the value nodes must conform to exactly one of the shapes.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}xone`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}xone`), f.namedNode(`${ns6}label`), f.literal('exactly one', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}xone`), f.namedNode(`${ns6}range`), f.namedNode(`${ns4}List`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns6}comment`), f.literal('The (single) value of this property represents a path that is matched zero or more times.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns6}label`), f.literal('zero or more path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrOnePath`), f.namedNode(`${ns4}type`), f.namedNode(`${ns4}Property`), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrOnePath`), f.namedNode(`${ns6}comment`), f.literal('The (single) value of this property represents a path that is matched zero or one times.', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrOnePath`), f.namedNode(`${ns6}isDefinedBy`), f.namedNode(ns1), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrOnePath`), f.namedNode(`${ns6}label`), f.literal('zero or one path', 'en'), f.namedNode(ns1)),
        f.quad(f.namedNode(`${ns1}zeroOrOnePath`), f.namedNode(`${ns6}range`), f.namedNode(`${ns6}Resource`), f.namedNode(ns1)),
        f.quad(blankNodes[4], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[4], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[4], f.namedNode(`${ns1}node`), f.namedNode(`${ns7}ShapeShape`), f.namedNode(ns1)),
        f.quad(blankNodes[4], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}filterShape`), f.namedNode(ns1)),
        f.quad(blankNodes[40], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}IfExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[40], f.namedNode(`${ns4}rest`), blankNodes[41], f.namedNode(ns1)),
        f.quad(blankNodes[16], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[16], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[16], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[16], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[32], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(blankNodes[32], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[32], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[32], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}select`), f.namedNode(ns1)),
        f.quad(blankNodes[6], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(blankNodes[6], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[6], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}separator`), f.namedNode(ns1)),
        f.quad(blankNodes[42], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}BlankNodeOrLiteral`), f.namedNode(ns1)),
        f.quad(blankNodes[42], f.namedNode(`${ns4}rest`), blankNodes[43], f.namedNode(ns1)),
        f.quad(blankNodes[19], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(blankNodes[19], f.namedNode(`${ns4}rest`), blankNodes[44], f.namedNode(ns1)),
        f.quad(blankNodes[45], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}MinExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[45], f.namedNode(`${ns4}rest`), blankNodes[46], f.namedNode(ns1)),
        f.quad(blankNodes[47], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}SPARQLAskExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[47], f.namedNode(`${ns4}rest`), blankNodes[48], f.namedNode(ns1)),
        f.quad(blankNodes[25], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[25], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[25], f.namedNode(`${ns1}node`), f.namedNode(`${ns7}PathShape`), f.namedNode(ns1)),
        f.quad(blankNodes[25], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}path`), f.namedNode(ns1)),
        f.quad(blankNodes[49], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}MinusExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[49], f.namedNode(`${ns4}rest`), blankNodes[50], f.namedNode(ns1)),
        f.quad(blankNodes[46], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}MaxExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[46], f.namedNode(`${ns4}rest`), blankNodes[51], f.namedNode(ns1)),
        f.quad(blankNodes[52], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}LimitExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[52], f.namedNode(`${ns4}rest`), blankNodes[53], f.namedNode(ns1)),
        f.quad(blankNodes[8], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[8], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[8], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}then`), f.namedNode(ns1)),
        f.quad(blankNodes[0], f.namedNode(`${ns1}namespace`), f.literal('http://www.w3.org/ns/shacl#', f.namedNode(`${ns3}anyURI`)), f.namedNode(ns1)),
        f.quad(blankNodes[0], f.namedNode(`${ns1}prefix`), f.literal('sh'), f.namedNode(ns1)),
        f.quad(blankNodes[44], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}IRI`), f.namedNode(ns1)),
        f.quad(blankNodes[44], f.namedNode(`${ns4}rest`), blankNodes[54], f.namedNode(ns1)),
        f.quad(blankNodes[55], f.namedNode(`${ns1}zeroOrMorePath`), f.namedNode(`${ns4}rest`), f.namedNode(ns1)),
        f.quad(blankNodes[5], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[5], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[5], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[56], f.namedNode(`${ns4}first`), blankNodes[57], f.namedNode(ns1)),
        f.quad(blankNodes[56], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1)),
        f.quad(blankNodes[58], f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNode`), f.namedNode(ns1)),
        f.quad(blankNodes[58], f.namedNode(`${ns1}not`), blankNodes[59], f.namedNode(ns1)),
        f.quad(blankNodes[18], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}FocusNodeOrConstantTermExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[18], f.namedNode(`${ns4}rest`), blankNodes[60], f.namedNode(ns1)),
        f.quad(blankNodes[15], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[15], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[15], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[15], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}min`), f.namedNode(ns1)),
        f.quad(blankNodes[30], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[30], f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(blankNodes[30], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}prefixes`), f.namedNode(ns1)),
        f.quad(blankNodes[61], f.namedNode(`${ns4}first`), blankNodes[55], f.namedNode(ns1)),
        f.quad(blankNodes[61], f.namedNode(`${ns4}rest`), blankNodes[62], f.namedNode(ns1)),
        f.quad(blankNodes[1], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[1], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[1], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[1], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}count`), f.namedNode(ns1)),
        f.quad(blankNodes[12], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[12], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[12], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[12], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[33], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[33], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[33], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[63], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[63], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[63], f.namedNode(`${ns1}node`), f.namedNode(`${ns8}ListShape`), f.namedNode(ns1)),
        f.quad(blankNodes[63], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}intersection`), f.namedNode(ns1)),
        f.quad(blankNodes[63], f.namedNode(`${ns1}property`), blankNodes[64], f.namedNode(ns1)),
        f.quad(blankNodes[13], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(blankNodes[13], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[13], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[13], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}limit`), f.namedNode(ns1)),
        f.quad(blankNodes[59], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}ExistsExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[59], f.namedNode(`${ns4}rest`), blankNodes[40], f.namedNode(ns1)),
        f.quad(blankNodes[36], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[36], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[36], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[36], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}object`), f.namedNode(ns1)),
        f.quad(blankNodes[2], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[2], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[2], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[2], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}distinct`), f.namedNode(ns1)),
        f.quad(blankNodes[65], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}IntersectionExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[65], f.namedNode(`${ns4}rest`), blankNodes[66], f.namedNode(ns1)),
        f.quad(blankNodes[57], f.namedNode(`${ns1}xone`), blankNodes[59], f.namedNode(ns1)),
        f.quad(blankNodes[34], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[34], f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(blankNodes[34], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}prefixes`), f.namedNode(ns1)),
        f.quad(blankNodes[67], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}GroupConcatExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[67], f.namedNode(`${ns4}rest`), blankNodes[68], f.namedNode(ns1)),
        f.quad(blankNodes[20], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[20], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[20], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[20], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[69], f.namedNode(`${ns1}property`), blankNodes[63], f.namedNode(ns1)),
        f.quad(blankNodes[27], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(blankNodes[27], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[27], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[27], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}ask`), f.namedNode(ns1)),
        f.quad(blankNodes[28], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[28], f.namedNode(`${ns1}nodeKind`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(blankNodes[28], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}prefixes`), f.namedNode(ns1)),
        f.quad(blankNodes[64], f.namedNode(`${ns1}minCount`), f.literal('2', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[64], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[64], f.namedNode(`${ns1}path`), blankNodes[61], f.namedNode(ns1)),
        f.quad(blankNodes[22], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}boolean`), f.namedNode(ns1)),
        f.quad(blankNodes[22], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[22], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}desc`), f.namedNode(ns1)),
        f.quad(blankNodes[29], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[29], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[29], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[41], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}FilterShapeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[41], f.namedNode(`${ns4}rest`), blankNodes[70], f.namedNode(ns1)),
        f.quad(blankNodes[62], f.namedNode(`${ns4}first`), f.namedNode(`${ns4}first`), f.namedNode(ns1)),
        f.quad(blankNodes[62], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1)),
        f.quad(blankNodes[48], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}SPARQLSelectExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[48], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1)),
        f.quad(blankNodes[26], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[26], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[26], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[71], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}CountExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[71], f.namedNode(`${ns4}rest`), blankNodes[45], f.namedNode(ns1)),
        f.quad(blankNodes[7], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[7], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[7], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[7], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}groupConcat`), f.namedNode(ns1)),
        f.quad(blankNodes[54], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}Literal`), f.namedNode(ns1)),
        f.quad(blankNodes[54], f.namedNode(`${ns4}rest`), blankNodes[72], f.namedNode(ns1)),
        f.quad(blankNodes[23], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[23], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[23], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[23], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}nodes`), f.namedNode(ns1)),
        f.quad(blankNodes[21], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}integer`), f.namedNode(ns1)),
        f.quad(blankNodes[21], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[21], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[21], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}offset`), f.namedNode(ns1)),
        f.quad(blankNodes[50], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}DistinctExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[50], f.namedNode(`${ns4}rest`), blankNodes[71], f.namedNode(ns1)),
        f.quad(blankNodes[14], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[14], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[14], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[14], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}max`), f.namedNode(ns1)),
        f.quad(blankNodes[51], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}SumExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[51], f.namedNode(`${ns4}rest`), blankNodes[67], f.namedNode(ns1)),
        f.quad(blankNodes[68], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}OrderByExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[68], f.namedNode(`${ns4}rest`), blankNodes[52], f.namedNode(ns1)),
        f.quad(blankNodes[60], f.namedNode(`${ns4}first`), blankNodes[58], f.namedNode(ns1)),
        f.quad(blankNodes[60], f.namedNode(`${ns4}rest`), blankNodes[56], f.namedNode(ns1)),
        f.quad(blankNodes[24], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[24], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[24], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[24], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}orderBy`), f.namedNode(ns1)),
        f.quad(blankNodes[35], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[35], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[35], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[35], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}sum`), f.namedNode(ns1)),
        f.quad(blankNodes[3], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[3], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[3], f.namedNode(`${ns1}node`), f.namedNode(`${ns7}ShapeShape`), f.namedNode(ns1)),
        f.quad(blankNodes[3], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}exists`), f.namedNode(ns1)),
        f.quad(blankNodes[37], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[37], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[37], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[37], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}subject`), f.namedNode(ns1)),
        f.quad(blankNodes[11], f.namedNode(`${ns1}and`), blankNodes[73], f.namedNode(ns1)),
        f.quad(blankNodes[11], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[11], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[11], f.namedNode(`${ns1}node`), f.namedNode(`${ns8}ListShape`), f.namedNode(ns1)),
        f.quad(blankNodes[11], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}intersection`), f.namedNode(ns1)),
        f.quad(blankNodes[9], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[9], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[9], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[9], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}if`), f.namedNode(ns1)),
        f.quad(blankNodes[53], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}OffsetExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[53], f.namedNode(`${ns4}rest`), blankNodes[47], f.namedNode(ns1)),
        f.quad(blankNodes[72], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}BlankNodeOrIRI`), f.namedNode(ns1)),
        f.quad(blankNodes[72], f.namedNode(`${ns4}rest`), blankNodes[42], f.namedNode(ns1)),
        f.quad(blankNodes[70], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}PathExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[70], f.namedNode(`${ns4}rest`), blankNodes[65], f.namedNode(ns1)),
        f.quad(blankNodes[38], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[38], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[38], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[38], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}predicate`), f.namedNode(ns1)),
        f.quad(blankNodes[39], f.namedNode(`${ns1}and`), blankNodes[74], f.namedNode(ns1)),
        f.quad(blankNodes[39], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[39], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[39], f.namedNode(`${ns1}node`), f.namedNode(`${ns8}ListShape`), f.namedNode(ns1)),
        f.quad(blankNodes[39], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}union`), f.namedNode(ns1)),
        f.quad(blankNodes[66], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}UnionExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[66], f.namedNode(`${ns4}rest`), blankNodes[49], f.namedNode(ns1)),
        f.quad(blankNodes[10], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[10], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[10], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}else`), f.namedNode(ns1)),
        f.quad(blankNodes[17], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[17], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[17], f.namedNode(`${ns1}node`), f.namedNode(`${ns1}NodeExpression`), f.namedNode(ns1)),
        f.quad(blankNodes[17], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}minus`), f.namedNode(ns1)),
        f.quad(blankNodes[74], f.namedNode(`${ns4}first`), blankNodes[75], f.namedNode(ns1)),
        f.quad(blankNodes[74], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1)),
        f.quad(blankNodes[73], f.namedNode(`${ns4}first`), blankNodes[75], f.namedNode(ns1)),
        f.quad(blankNodes[73], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1)),
        f.quad(blankNodes[31], f.namedNode(`${ns1}datatype`), f.namedNode(`${ns3}string`), f.namedNode(ns1)),
        f.quad(blankNodes[31], f.namedNode(`${ns1}maxCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[31], f.namedNode(`${ns1}minCount`), f.literal('1', f.namedNode(`${ns3}integer`)), f.namedNode(ns1)),
        f.quad(blankNodes[31], f.namedNode(`${ns1}path`), f.namedNode(`${ns1}construct`), f.namedNode(ns1)),
        f.quad(blankNodes[43], f.namedNode(`${ns4}first`), f.namedNode(`${ns1}IRIOrLiteral`), f.namedNode(ns1)),
        f.quad(blankNodes[43], f.namedNode(`${ns4}rest`), f.namedNode(`${ns4}nil`), f.namedNode(ns1))
    ];
};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var addAll_1;
var hasRequiredAddAll;

function requireAddAll () {
	if (hasRequiredAddAll) return addAll_1;
	hasRequiredAddAll = 1;
	function addAll (dataset, quads) {
	  for (const quad of quads) {
	    dataset.add(quad);
	  }

	  return dataset
	}

	addAll_1 = addAll;
	return addAll_1;
}

var addAllExports = requireAddAll();
var addAll = /*@__PURE__*/getDefaultExportFromCjs(addAllExports);

class NodeSet extends TermSet {
    addAll(nodes) {
        for (const node of nodes) {
            this.add(node);
        }
    }
}

/**
 * Extracts all the nodes of a property path from a graph and returns a
 * property path object.
 *
 * @param pathNode - Pointer to the start node of the path
 * @param ns - Namespaces
 * @param allowNamedNodeInList - Allow named node in lists. By default, only blank nodes are allowed
 * @return Property path object
 */
function extractPropertyPath(pathNode, ns, allowNamedNodeInList) {
    if (pathNode.term.termType === 'NamedNode' && !allowNamedNodeInList) {
        return pathNode.term;
    }
    if (pathNode.term.termType === 'BlankNode' || pathNode.term.termType === 'NamedNode') {
        const first = pathNode.out(ns.rdf.first).term;
        if (first) {
            const paths = [...pathNode.list()];
            return paths.map(path => extractPropertyPath(path, ns, allowNamedNodeInList));
        }
        const alternativePath = pathNode.out(ns.sh.alternativePath);
        if (alternativePath.term) {
            const paths = [...alternativePath.list()];
            return { or: paths.map(path => extractPropertyPath(path, ns, allowNamedNodeInList)) };
        }
        const zeroOrMorePath = pathNode.out(ns.sh.zeroOrMorePath);
        if (zeroOrMorePath.term) {
            return { zeroOrMore: extractPropertyPath(zeroOrMorePath, ns, allowNamedNodeInList) };
        }
        const oneOrMorePath = pathNode.out(ns.sh.oneOrMorePath);
        if (oneOrMorePath.term) {
            return { oneOrMore: extractPropertyPath(oneOrMorePath, ns, allowNamedNodeInList) };
        }
        const zeroOrOnePath = pathNode.out(ns.sh.zeroOrOnePath);
        if (zeroOrOnePath.term) {
            return { zeroOrOne: extractPropertyPath(zeroOrOnePath, ns, allowNamedNodeInList) };
        }
        const inversePath = pathNode.out(ns.sh.inversePath);
        if (inversePath.term) {
            return { inverse: extractPropertyPath(inversePath, ns, allowNamedNodeInList) };
        }
        return pathNode.term;
    }
    throw new Error(`Unsupported SHACL path: ${pathNode.term.value}`);
}
/**
 * Follows a property path in a graph, starting from a given node, and returns
 * all the nodes it points to.
 *
 * @param graph
 * @param subject - Start node
 * @param path - Property path object
 * @return - Nodes that are reachable through the property path
 */
function getPathObjects(graph, subject, path) {
    return [...getPathObjectsSet(graph, subject, path)];
}
function getPathObjectsSet(graph, subject, path) {
    if ('termType' in path && path.termType === 'NamedNode') {
        return getNamedNodePathObjects(graph, subject, path);
    }
    else if (Array.isArray(path)) {
        return getSequencePathObjects(graph, subject, path);
    }
    else if ('or' in path) {
        return getOrPathObjects(graph, subject, path);
    }
    else if ('inverse' in path) {
        return getInversePathObjects(graph, subject, path);
    }
    else if ('zeroOrOne' in path) {
        return getZeroOrOnePathObjects(graph, subject, path);
    }
    else if ('zeroOrMore' in path) {
        return getZeroOrMorePathObjects(graph, subject, path);
    }
    else if ('oneOrMore' in path) {
        return getOneOrMorePathObjects(graph, subject, path);
    }
    else {
        throw new Error(`Unsupported path object: ${path}`);
    }
}
function getNamedNodePathObjects(graph, subject, path) {
    return new NodeSet(graph.node(subject).out(path).terms);
}
function getSequencePathObjects(graph, subject, path) {
    // TODO: This one is really unreadable
    let subjects = new NodeSet([subject]);
    for (const pathItem of path) {
        subjects = new NodeSet(flatMap(subjects, subjectItem => getPathObjects(graph, subjectItem, pathItem)));
    }
    return subjects;
}
function getOrPathObjects(graph, subject, path) {
    return new NodeSet(flatMap(path.or, pathItem => getPathObjects(graph, subject, pathItem)));
}
function getInversePathObjects(graph, subject, path) {
    if (!('termType' in path.inverse) || path.inverse.termType !== 'NamedNode') {
        throw new Error('Unsupported: Inverse paths only work for named nodes');
    }
    return new NodeSet(graph.node(subject).in(path.inverse).terms);
}
function getZeroOrOnePathObjects(graph, subject, path) {
    const pathObjects = getPathObjectsSet(graph, subject, path.zeroOrOne);
    pathObjects.add(subject);
    return pathObjects;
}
function getZeroOrMorePathObjects(graph, subject, path) {
    const pathObjects = walkPath(graph, subject, path.zeroOrMore);
    pathObjects.add(subject);
    return pathObjects;
}
function getOneOrMorePathObjects(graph, subject, path) {
    return walkPath(graph, subject, path.oneOrMore);
}
function walkPath(graph, subject, path, visited = new NodeSet()) {
    visited.add(subject);
    const pathValues = getPathObjectsSet(graph, subject, path);
    const deeperValues = flatMap(pathValues, pathValue => {
        if (!visited.has(pathValue)) {
            return [...walkPath(graph, pathValue, path, visited)];
        }
        else {
            return [];
        }
    });
    pathValues.addAll(deeperValues);
    return pathValues;
}
function flatMap(arr, func) {
    return [...arr].reduce((acc, x) => acc.concat(func(x)), []);
}

/**
 * Extracts all the quads forming the structure under a blank node. Stops at
 * non-blank nodes.
 */
function* extractStructure(dataset, startNode, visited = new TermSet()) {
    if (startNode.termType !== 'BlankNode' || visited.has(startNode)) {
        return;
    }
    visited.add(startNode);
    for (const quad of dataset.match(startNode, null, null)) {
        yield quad;
        yield* extractStructure(dataset, quad.object, visited);
    }
}
/**
 * Extracts all the quads forming the structure under a blank shape node. Stops at
 * non-blank nodes. Replaces sh:in with a comment if the list is too long.
 */
function* extractSourceShapeStructure(shape, dataset, startNode, visited = new TermSet()) {
    if (startNode.termType !== 'BlankNode' || visited.has(startNode)) {
        return;
    }
    const { factory } = shape.context;
    const { sh, rdfs } = shape.context.ns;
    const inListSize = (term) => {
        const inConstraint = shape.constraints.find(x => term.equals(x.paramValue));
        return inConstraint?.nodeSet.size || -1;
    };
    visited.add(startNode);
    for (const quad of dataset.match(startNode, null, null)) {
        if (quad.predicate.equals(sh.in) && inListSize(quad.object) > 3) {
            const msg = `sh:in has ${inListSize(quad.object)} elements and has been removed from the report for brevity. Please refer the original shape`;
            yield factory.quad(quad.subject, rdfs.comment, factory.literal(msg));
        }
        else {
            yield quad;
            yield* extractSourceShapeStructure(shape, dataset, quad.object, visited);
        }
    }
}
/**
 * Get instances of a class.
 */
function getInstancesOf(cls, ns) {
    const classes = getSubClassesOf(cls, ns);
    classes.add(cls.term);
    return [...classes].reduce((acc, classTerm) => {
        const classInstances = cls
            .node(classTerm)
            .in(ns.rdf.type)
            .terms;
        acc.addAll(classInstances);
        return acc;
    }, new NodeSet());
}
/**
 * Get subclasses of a class.
 */
function getSubClassesOf(cls, ns) {
    const subclasses = cls.in(ns.rdfs.subClassOf);
    const transubclasses = subclasses.toArray().reduce((acc, subclass) => {
        const scs = getSubClassesOf(subclass, ns);
        acc.addAll(scs);
        return acc;
    }, new NodeSet());
    return new NodeSet([...subclasses.terms, ...transubclasses]);
}
/**
 * Check if a node is an instance of a class.
 */
function isInstanceOf(instance, cls, ns) {
    const classes = getSubClassesOf(cls, ns);
    classes.add(cls.term);
    const types = instance.out(ns.rdf.type).terms;
    return types.some((type) => classes.has(type));
}
/**
 * Extract all the terms of an RDF-list and return then as an array.
 */
function rdfListToArray(listNode) {
    return [...listNode.list?.() || []].map(({ term }) => term);
}

/* eslint-disable no-use-before-define, camelcase */
// Design:
//
// First, derive a ShapesGraph object from the definitions in $shapes.
// This manages a map of parameters to ConstraintComponents.
// Each ConstraintComponent manages its list of parameters and a link to the validators.
//
// The ShapesGraph also manages a list of Shapes, each which has a list of Constraints.
// A Constraint is a specific combination of parameters for a constraint component,
// and has functions to access the target nodes.
//
// Each ShapesGraph can be reused between validation calls, and thus often only needs
// to be created once per application.
//
// The validation process is started by creating a ValidationEngine that relies on
// a given ShapesGraph and operates on the current $data().
// It basically walks through all Shapes that have target nodes and runs the validators
// for each Constraint of the shape, producing results along the way.
class ShapesGraph {
    _components;
    _parametersMap;
    _shapes;
    _shapeNodesWithConstraints;
    _shapesWithTarget;
    constructor(context, { additionalVocabularies = [] }) {
        this.context = context;
        // Collect all defined constraint components
        const { sh } = context.ns;
        const vocabularyDataset = context.factory.dataset();
        for (const additionalVocabulary of [shaclVocabularyFactory, ...additionalVocabularies]) {
            addAll(vocabularyDataset, additionalVocabulary(context));
        }
        const shaclVocabulary = context.factory.clownface({
            dataset: vocabularyDataset,
        });
        const componentNodes = getInstancesOf(shaclVocabulary.node(sh.ConstraintComponent), context.ns);
        this._components = [...componentNodes].map((node) => new ConstraintComponent(node, context, shaclVocabulary));
        // Build map from parameters to constraint components
        this._parametersMap = new Map();
        for (const component of this._components) {
            for (const parameter of component.parameters) {
                this._parametersMap.set(parameter.value, component);
            }
        }
        // Cache of shapes populated on demand
        this._shapes = new Map();
    }
    getComponentWithParameter(parameter) {
        return this._parametersMap.get(parameter.value);
    }
    getShape(shapeNode) {
        if (!this._shapes.has(shapeNode.value)) {
            const shape = new Shape(this.context, shapeNode);
            this._shapes.set(shapeNode.value, shape);
        }
        return this._shapes.get(shapeNode.value);
    }
    get shapeNodesWithConstraints() {
        if (!this._shapeNodesWithConstraints) {
            const set = new NodeSet();
            for (const component of this._components) {
                const params = component.requiredParameters;
                for (const param of params) {
                    const shapesWithParam = [...this.context.$shapes.dataset
                            .match(null, param, null)]
                        .map(({ subject }) => subject);
                    set.addAll(shapesWithParam);
                }
            }
            this._shapeNodesWithConstraints = [...set];
        }
        return this._shapeNodesWithConstraints;
    }
    get shapesWithTarget() {
        const { $shapes, ns } = this.context;
        const { rdfs, sh } = ns;
        if (!this._shapesWithTarget) {
            this._shapesWithTarget = this.shapeNodesWithConstraints
                .filter((shapeNode) => (isInstanceOf($shapes.node(shapeNode), $shapes.node(rdfs.Class), ns) ||
                $shapes.node(shapeNode).out([
                    sh.targetClass,
                    sh.targetNode,
                    sh.targetSubjectsOf,
                    sh.targetObjectsOf,
                    sh.target,
                ]).terms.length > 0))
                .map((shapeNode) => this.getShape(shapeNode));
        }
        return this._shapesWithTarget;
    }
}
class Constraint {
    shape;
    component;
    paramValue;
    _parameterValues;
    inNodeSet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(shape, component, shapesGraph, _parameterValuesOrSingleParam) {
        this.shape = shape;
        this.component = component;
        this.shapeNodePointer = shapesGraph.node(shape.shapeNode);
        if ('termType' in _parameterValuesOrSingleParam) {
            this.paramValue = _parameterValuesOrSingleParam;
        }
        else {
            this._parameterValues = _parameterValuesOrSingleParam;
        }
    }
    get validate() {
        if (this.component.validator && this.validationFunction) {
            return (focusNode, valueNode) => {
                return this.validationFunction(focusNode, valueNode, this);
            };
        }
    }
    static *fromShape(shape, component, shapesGraph) {
        const allParams = component.parameters.map((param) => {
            return [param, shape.shapeNodePointer.out(param).terms];
        });
        // create a cartesian product of all parameter values
        const combinations = allParams.reduce((acc, [param, values]) => {
            if (values.length === 0) {
                return acc;
            }
            if (acc.length === 0) {
                return values.map((value) => [[param, value]]);
            }
            return acc.flatMap((comb) => values.map((value) => comb.concat([[param, value]])));
        }, []);
        for (const combination of combinations) {
            if (component.parameters.length === 1) {
                yield new Constraint(shape, component, shapesGraph, combination[0][1]);
                continue;
            }
            const params = shape.context.factory.termMap(combination);
            if (component.isComplete(params)) {
                yield new Constraint(shape, component, shapesGraph, params);
            }
        }
    }
    getParameterValue(param) {
        return this.paramValue || this._parameterValues.get(param);
    }
    get pathObject() {
        return this.shape.pathObject;
    }
    get validationFunction() {
        return this.shape.isPropertyShape
            ? this.component.propertyValidationFunction
            : this.component.nodeValidationFunction;
    }
    get isValidationFunctionGeneric() {
        return this.shape.isPropertyShape
            ? this.component.propertyValidationFunctionGeneric
            : this.component.nodeValidationFunctionGeneric;
    }
    get componentMessages() {
        return this.component.getMessages(this.shape);
    }
    get nodeSet() {
        const { sh } = this.shape.context.ns;
        if (!this.inNodeSet) {
            this.inNodeSet = new NodeSet(rdfListToArray(this.shapeNodePointer.out(sh.in)));
        }
        return this.inNodeSet;
    }
}
class ConstraintComponent {
    node;
    context;
    constructor(node, context, shaclVocabulary) {
        this.node = node;
        this.context = context;
        const { factory, ns } = context;
        const { sh, xsd } = ns;
        this.nodePointer = shaclVocabulary.node(node);
        this.parameters = [];
        this.parameterNodes = [];
        this.requiredParameters = [];
        this.optionals = {};
        const trueTerm = factory.literal('true', xsd.boolean);
        this.nodePointer
            .out(sh.parameter)
            .forEach((parameterCf) => {
            const parameter = parameterCf.term;
            parameterCf.out(sh.path).forEach(({ term: path }) => {
                this.parameters.push(path);
                this.parameterNodes.push(parameter);
                if (shaclVocabulary.dataset.match(parameter, sh.optional, trueTerm).size > 0) {
                    this.optionals[path.value] = true;
                }
                else {
                    this.requiredParameters.push(path);
                }
            });
        });
        this.validator = context.validators.get(node);
        if (!this.validator) {
            return;
        }
        if ('nodeValidate' in this.validator) {
            this.nodeValidationFunction = this.validator.nodeValidate.bind(undefined, this.context);
            this.nodeValidationMessage = this.validator.nodeValidationMessage;
        }
        else if ('validate' in this.validator) {
            this.nodeValidationFunction = this.validator.validate.bind(undefined, this.context);
            this.nodeValidationMessage = this.validator.validationMessage;
            this.nodeValidationFunctionGeneric = true;
        }
        if ('propertyValidate' in this.validator) {
            this.propertyValidationFunction = this.validator.propertyValidate.bind(undefined, this.context);
            this.propertyValidationMessage = this.validator.propertyValidationMessage;
        }
        else if ('validate' in this.validator) {
            this.propertyValidationFunction = this.validator.validate.bind(undefined, this.context);
            this.propertyValidationMessage = this.validator.validationMessage;
            this.propertyValidationFunctionGeneric = true;
        }
    }
    getMessages(shape) {
        const message = shape.isPropertyShape ? this.propertyValidationMessage : this.nodeValidationMessage;
        return message ? [message] : [];
    }
    isComplete(parameterValues) {
        return this.requiredParameters.every((param) => parameterValues.has(param));
    }
}
class Shape {
    constructor(context, shapeNode) {
        const { $shapes, ns, shapesGraph, allowNamedNodeInList: allowNamedNodeSequencePaths } = context;
        const { sh } = ns;
        this.context = context;
        this.shapeNode = shapeNode;
        this.shapeNodePointer = $shapes.node(shapeNode);
        this.severity = this.shapeNodePointer.out(sh.severity).term || sh.Violation;
        this.deactivated = this.shapeNodePointer.out(sh.deactivated).value === 'true';
        this.pathObject = null;
        const path = this.shapeNodePointer.out(sh.path);
        if (path.term) {
            this.path = path;
            this.pathObject = extractPropertyPath(this.path, ns, allowNamedNodeSequencePaths);
        }
        this.constraints = [];
        const handled = new NodeSet();
        const shapeProperties = [...$shapes.dataset.match(shapeNode, null, null)];
        shapeProperties.forEach((sol) => {
            const component = shapesGraph.getComponentWithParameter(sol.predicate);
            if (component && !handled.has(component.node)) {
                this.constraints.push(...Constraint.fromShape(this, component, $shapes));
                handled.add(component.node);
            }
        });
    }
    get isPropertyShape() {
        return this.pathObject != null;
    }
    overridePath(path) {
        const shape = new Shape(this.context, this.shapeNode);
        shape.pathObject = path;
        return shape;
    }
    getTargetNodes(dataGraph) {
        const { $shapes, ns } = this.context;
        const { rdfs, sh } = ns;
        const results = new NodeSet();
        if (isInstanceOf($shapes.node(this.shapeNode), $shapes.node(rdfs.Class), ns)) {
            results.addAll(getInstancesOf(dataGraph.node(this.shapeNode), ns));
        }
        const targetClasses = [...$shapes.dataset.match(this.shapeNode, sh.targetClass, null)];
        targetClasses.forEach(({ object: targetClass }) => {
            results.addAll(getInstancesOf(dataGraph.node(targetClass), ns));
        });
        results.addAll(this.shapeNodePointer.out(sh.targetNode).terms);
        this.shapeNodePointer
            .out(sh.targetSubjectsOf)
            .terms
            .forEach((predicate) => {
            const subjects = [...dataGraph.dataset.match(null, predicate, null)].map(({ subject }) => subject);
            results.addAll(subjects);
        });
        this.shapeNodePointer
            .out(sh.targetObjectsOf)
            .terms
            .forEach((predicate) => {
            const objects = [...dataGraph.dataset.match(null, predicate, null)].map(({ object }) => object);
            results.addAll(objects);
        });
        return [...results];
    }
    getValueNodes(focusNode, dataGraph) {
        if (this.pathObject) {
            return getPathObjects(dataGraph, focusNode, this.pathObject);
        }
        else {
            return [focusNode];
        }
    }
}

var browser = {exports: {}};

/**
 * Helpers.
 */

var ms;
var hasRequiredMs;

function requireMs () {
	if (hasRequiredMs) return ms;
	hasRequiredMs = 1;
	var s = 1000;
	var m = s * 60;
	var h = m * 60;
	var d = h * 24;
	var w = d * 7;
	var y = d * 365.25;

	/**
	 * Parse or format the given `val`.
	 *
	 * Options:
	 *
	 *  - `long` verbose formatting [false]
	 *
	 * @param {String|Number} val
	 * @param {Object} [options]
	 * @throws {Error} throw an error if val is not a non-empty string or a number
	 * @return {String|Number}
	 * @api public
	 */

	ms = function (val, options) {
	  options = options || {};
	  var type = typeof val;
	  if (type === 'string' && val.length > 0) {
	    return parse(val);
	  } else if (type === 'number' && isFinite(val)) {
	    return options.long ? fmtLong(val) : fmtShort(val);
	  }
	  throw new Error(
	    'val is not a non-empty string or a valid number. val=' +
	      JSON.stringify(val)
	  );
	};

	/**
	 * Parse the given `str` and return milliseconds.
	 *
	 * @param {String} str
	 * @return {Number}
	 * @api private
	 */

	function parse(str) {
	  str = String(str);
	  if (str.length > 100) {
	    return;
	  }
	  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
	    str
	  );
	  if (!match) {
	    return;
	  }
	  var n = parseFloat(match[1]);
	  var type = (match[2] || 'ms').toLowerCase();
	  switch (type) {
	    case 'years':
	    case 'year':
	    case 'yrs':
	    case 'yr':
	    case 'y':
	      return n * y;
	    case 'weeks':
	    case 'week':
	    case 'w':
	      return n * w;
	    case 'days':
	    case 'day':
	    case 'd':
	      return n * d;
	    case 'hours':
	    case 'hour':
	    case 'hrs':
	    case 'hr':
	    case 'h':
	      return n * h;
	    case 'minutes':
	    case 'minute':
	    case 'mins':
	    case 'min':
	    case 'm':
	      return n * m;
	    case 'seconds':
	    case 'second':
	    case 'secs':
	    case 'sec':
	    case 's':
	      return n * s;
	    case 'milliseconds':
	    case 'millisecond':
	    case 'msecs':
	    case 'msec':
	    case 'ms':
	      return n;
	    default:
	      return undefined;
	  }
	}

	/**
	 * Short format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtShort(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return Math.round(ms / d) + 'd';
	  }
	  if (msAbs >= h) {
	    return Math.round(ms / h) + 'h';
	  }
	  if (msAbs >= m) {
	    return Math.round(ms / m) + 'm';
	  }
	  if (msAbs >= s) {
	    return Math.round(ms / s) + 's';
	  }
	  return ms + 'ms';
	}

	/**
	 * Long format for `ms`.
	 *
	 * @param {Number} ms
	 * @return {String}
	 * @api private
	 */

	function fmtLong(ms) {
	  var msAbs = Math.abs(ms);
	  if (msAbs >= d) {
	    return plural(ms, msAbs, d, 'day');
	  }
	  if (msAbs >= h) {
	    return plural(ms, msAbs, h, 'hour');
	  }
	  if (msAbs >= m) {
	    return plural(ms, msAbs, m, 'minute');
	  }
	  if (msAbs >= s) {
	    return plural(ms, msAbs, s, 'second');
	  }
	  return ms + ' ms';
	}

	/**
	 * Pluralization helper.
	 */

	function plural(ms, msAbs, n, name) {
	  var isPlural = msAbs >= n * 1.5;
	  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
	}
	return ms;
}

var common;
var hasRequiredCommon;

function requireCommon () {
	if (hasRequiredCommon) return common;
	hasRequiredCommon = 1;
	/**
	 * This is the common logic for both the Node.js and web browser
	 * implementations of `debug()`.
	 */

	function setup(env) {
		createDebug.debug = createDebug;
		createDebug.default = createDebug;
		createDebug.coerce = coerce;
		createDebug.disable = disable;
		createDebug.enable = enable;
		createDebug.enabled = enabled;
		createDebug.humanize = requireMs();
		createDebug.destroy = destroy;

		Object.keys(env).forEach(key => {
			createDebug[key] = env[key];
		});

		/**
		* The currently active debug mode names, and names to skip.
		*/

		createDebug.names = [];
		createDebug.skips = [];

		/**
		* Map of special "%n" handling functions, for the debug "format" argument.
		*
		* Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
		*/
		createDebug.formatters = {};

		/**
		* Selects a color for a debug namespace
		* @param {String} namespace The namespace string for the debug instance to be colored
		* @return {Number|String} An ANSI color code for the given namespace
		* @api private
		*/
		function selectColor(namespace) {
			let hash = 0;

			for (let i = 0; i < namespace.length; i++) {
				hash = ((hash << 5) - hash) + namespace.charCodeAt(i);
				hash |= 0; // Convert to 32bit integer
			}

			return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
		}
		createDebug.selectColor = selectColor;

		/**
		* Create a debugger with the given `namespace`.
		*
		* @param {String} namespace
		* @return {Function}
		* @api public
		*/
		function createDebug(namespace) {
			let prevTime;
			let enableOverride = null;
			let namespacesCache;
			let enabledCache;

			function debug(...args) {
				// Disabled?
				if (!debug.enabled) {
					return;
				}

				const self = debug;

				// Set `diff` timestamp
				const curr = Number(new Date());
				const ms = curr - (prevTime || curr);
				self.diff = ms;
				self.prev = prevTime;
				self.curr = curr;
				prevTime = curr;

				args[0] = createDebug.coerce(args[0]);

				if (typeof args[0] !== 'string') {
					// Anything else let's inspect with %O
					args.unshift('%O');
				}

				// Apply any `formatters` transformations
				let index = 0;
				args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
					// If we encounter an escaped % then don't increase the array index
					if (match === '%%') {
						return '%';
					}
					index++;
					const formatter = createDebug.formatters[format];
					if (typeof formatter === 'function') {
						const val = args[index];
						match = formatter.call(self, val);

						// Now we need to remove `args[index]` since it's inlined in the `format`
						args.splice(index, 1);
						index--;
					}
					return match;
				});

				// Apply env-specific formatting (colors, etc.)
				createDebug.formatArgs.call(self, args);

				const logFn = self.log || createDebug.log;
				logFn.apply(self, args);
			}

			debug.namespace = namespace;
			debug.useColors = createDebug.useColors();
			debug.color = createDebug.selectColor(namespace);
			debug.extend = extend;
			debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

			Object.defineProperty(debug, 'enabled', {
				enumerable: true,
				configurable: false,
				get: () => {
					if (enableOverride !== null) {
						return enableOverride;
					}
					if (namespacesCache !== createDebug.namespaces) {
						namespacesCache = createDebug.namespaces;
						enabledCache = createDebug.enabled(namespace);
					}

					return enabledCache;
				},
				set: v => {
					enableOverride = v;
				}
			});

			// Env-specific initialization logic for debug instances
			if (typeof createDebug.init === 'function') {
				createDebug.init(debug);
			}

			return debug;
		}

		function extend(namespace, delimiter) {
			const newDebug = createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
			newDebug.log = this.log;
			return newDebug;
		}

		/**
		* Enables a debug mode by namespaces. This can include modes
		* separated by a colon and wildcards.
		*
		* @param {String} namespaces
		* @api public
		*/
		function enable(namespaces) {
			createDebug.save(namespaces);
			createDebug.namespaces = namespaces;

			createDebug.names = [];
			createDebug.skips = [];

			const split = (typeof namespaces === 'string' ? namespaces : '')
				.trim()
				.replace(/\s+/g, ',')
				.split(',')
				.filter(Boolean);

			for (const ns of split) {
				if (ns[0] === '-') {
					createDebug.skips.push(ns.slice(1));
				} else {
					createDebug.names.push(ns);
				}
			}
		}

		/**
		 * Checks if the given string matches a namespace template, honoring
		 * asterisks as wildcards.
		 *
		 * @param {String} search
		 * @param {String} template
		 * @return {Boolean}
		 */
		function matchesTemplate(search, template) {
			let searchIndex = 0;
			let templateIndex = 0;
			let starIndex = -1;
			let matchIndex = 0;

			while (searchIndex < search.length) {
				if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === '*')) {
					// Match character or proceed with wildcard
					if (template[templateIndex] === '*') {
						starIndex = templateIndex;
						matchIndex = searchIndex;
						templateIndex++; // Skip the '*'
					} else {
						searchIndex++;
						templateIndex++;
					}
				} else if (starIndex !== -1) { // eslint-disable-line no-negated-condition
					// Backtrack to the last '*' and try to match more characters
					templateIndex = starIndex + 1;
					matchIndex++;
					searchIndex = matchIndex;
				} else {
					return false; // No match
				}
			}

			// Handle trailing '*' in template
			while (templateIndex < template.length && template[templateIndex] === '*') {
				templateIndex++;
			}

			return templateIndex === template.length;
		}

		/**
		* Disable debug output.
		*
		* @return {String} namespaces
		* @api public
		*/
		function disable() {
			const namespaces = [
				...createDebug.names,
				...createDebug.skips.map(namespace => '-' + namespace)
			].join(',');
			createDebug.enable('');
			return namespaces;
		}

		/**
		* Returns true if the given mode name is enabled, false otherwise.
		*
		* @param {String} name
		* @return {Boolean}
		* @api public
		*/
		function enabled(name) {
			for (const skip of createDebug.skips) {
				if (matchesTemplate(name, skip)) {
					return false;
				}
			}

			for (const ns of createDebug.names) {
				if (matchesTemplate(name, ns)) {
					return true;
				}
			}

			return false;
		}

		/**
		* Coerce `val`.
		*
		* @param {Mixed} val
		* @return {Mixed}
		* @api private
		*/
		function coerce(val) {
			if (val instanceof Error) {
				return val.stack || val.message;
			}
			return val;
		}

		/**
		* XXX DO NOT USE. This is a temporary stub function.
		* XXX It WILL be removed in the next major release.
		*/
		function destroy() {
			console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
		}

		createDebug.enable(createDebug.load());

		return createDebug;
	}

	common = setup;
	return common;
}

/* eslint-env browser */

var hasRequiredBrowser;

function requireBrowser () {
	if (hasRequiredBrowser) return browser.exports;
	hasRequiredBrowser = 1;
	(function (module, exports) {
		/**
		 * This is the web browser implementation of `debug()`.
		 */

		exports.formatArgs = formatArgs;
		exports.save = save;
		exports.load = load;
		exports.useColors = useColors;
		exports.storage = localstorage();
		exports.destroy = (() => {
			let warned = false;

			return () => {
				if (!warned) {
					warned = true;
					console.warn('Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.');
				}
			};
		})();

		/**
		 * Colors.
		 */

		exports.colors = [
			'#0000CC',
			'#0000FF',
			'#0033CC',
			'#0033FF',
			'#0066CC',
			'#0066FF',
			'#0099CC',
			'#0099FF',
			'#00CC00',
			'#00CC33',
			'#00CC66',
			'#00CC99',
			'#00CCCC',
			'#00CCFF',
			'#3300CC',
			'#3300FF',
			'#3333CC',
			'#3333FF',
			'#3366CC',
			'#3366FF',
			'#3399CC',
			'#3399FF',
			'#33CC00',
			'#33CC33',
			'#33CC66',
			'#33CC99',
			'#33CCCC',
			'#33CCFF',
			'#6600CC',
			'#6600FF',
			'#6633CC',
			'#6633FF',
			'#66CC00',
			'#66CC33',
			'#9900CC',
			'#9900FF',
			'#9933CC',
			'#9933FF',
			'#99CC00',
			'#99CC33',
			'#CC0000',
			'#CC0033',
			'#CC0066',
			'#CC0099',
			'#CC00CC',
			'#CC00FF',
			'#CC3300',
			'#CC3333',
			'#CC3366',
			'#CC3399',
			'#CC33CC',
			'#CC33FF',
			'#CC6600',
			'#CC6633',
			'#CC9900',
			'#CC9933',
			'#CCCC00',
			'#CCCC33',
			'#FF0000',
			'#FF0033',
			'#FF0066',
			'#FF0099',
			'#FF00CC',
			'#FF00FF',
			'#FF3300',
			'#FF3333',
			'#FF3366',
			'#FF3399',
			'#FF33CC',
			'#FF33FF',
			'#FF6600',
			'#FF6633',
			'#FF9900',
			'#FF9933',
			'#FFCC00',
			'#FFCC33'
		];

		/**
		 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
		 * and the Firebug extension (any Firefox version) are known
		 * to support "%c" CSS customizations.
		 *
		 * TODO: add a `localStorage` variable to explicitly enable/disable colors
		 */

		// eslint-disable-next-line complexity
		function useColors() {
			// NB: In an Electron preload script, document will be defined but not fully
			// initialized. Since we know we're in Chrome, we'll just detect this case
			// explicitly
			if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
				return true;
			}

			// Internet Explorer and Edge do not support colors.
			if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
				return false;
			}

			let m;

			// Is webkit? http://stackoverflow.com/a/16459606/376773
			// document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
			// eslint-disable-next-line no-return-assign
			return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
				// Is firebug? http://stackoverflow.com/a/398120/376773
				(typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
				// Is firefox >= v31?
				// https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
				(typeof navigator !== 'undefined' && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31) ||
				// Double check webkit in userAgent just in case we are in a worker
				(typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
		}

		/**
		 * Colorize log arguments if enabled.
		 *
		 * @api public
		 */

		function formatArgs(args) {
			args[0] = (this.useColors ? '%c' : '') +
				this.namespace +
				(this.useColors ? ' %c' : ' ') +
				args[0] +
				(this.useColors ? '%c ' : ' ') +
				'+' + module.exports.humanize(this.diff);

			if (!this.useColors) {
				return;
			}

			const c = 'color: ' + this.color;
			args.splice(1, 0, c, 'color: inherit');

			// The final "%c" is somewhat tricky, because there could be other
			// arguments passed either before or after the %c, so we need to
			// figure out the correct index to insert the CSS into
			let index = 0;
			let lastC = 0;
			args[0].replace(/%[a-zA-Z%]/g, match => {
				if (match === '%%') {
					return;
				}
				index++;
				if (match === '%c') {
					// We only are interested in the *last* %c
					// (the user may have provided their own)
					lastC = index;
				}
			});

			args.splice(lastC, 0, c);
		}

		/**
		 * Invokes `console.debug()` when available.
		 * No-op when `console.debug` is not a "function".
		 * If `console.debug` is not available, falls back
		 * to `console.log`.
		 *
		 * @api public
		 */
		exports.log = console.debug || console.log || (() => {});

		/**
		 * Save `namespaces`.
		 *
		 * @param {String} namespaces
		 * @api private
		 */
		function save(namespaces) {
			try {
				if (namespaces) {
					exports.storage.setItem('debug', namespaces);
				} else {
					exports.storage.removeItem('debug');
				}
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		/**
		 * Load `namespaces`.
		 *
		 * @return {String} returns the previously persisted debug modes
		 * @api private
		 */
		function load() {
			let r;
			try {
				r = exports.storage.getItem('debug') || exports.storage.getItem('DEBUG') ;
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}

			// If debug isn't set in LS, and we're in Electron, try to load $DEBUG
			if (!r && typeof process !== 'undefined' && 'env' in process) {
				r = process.env.DEBUG;
			}

			return r;
		}

		/**
		 * Localstorage attempts to return the localstorage.
		 *
		 * This is necessary because safari throws
		 * when a user disables cookies/localstorage
		 * and you attempt to access it.
		 *
		 * @return {LocalStorage}
		 * @api private
		 */

		function localstorage() {
			try {
				// TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
				// The Browser also has localStorage in the global context.
				return localStorage;
			} catch (error) {
				// Swallow
				// XXX (@Qix-) should we be logging these?
			}
		}

		module.exports = requireCommon()(exports);

		const {formatters} = module.exports;

		/**
		 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
		 */

		formatters.j = function (v) {
			try {
				return JSON.stringify(v);
			} catch (error) {
				return '[UnexpectedJSONParseError]: ' + error.message;
			}
		}; 
	} (browser, browser.exports));
	return browser.exports;
}

var browserExports = requireBrowser();
var debug = /*@__PURE__*/getDefaultExportFromCjs(browserExports);

/**
 * Result of a SHACL validation.
 */
class ValidationReport {
    constructor(pointer, options = {}) {
        this.factory = options.factory || factory;
        this.ns = options.ns || prepareNamespaces(this.factory);
        const { sh, xsd } = this.ns;
        this.pointer = pointer;
        this.term = pointer.term;
        this.dataset = pointer.dataset;
        const resultsPointer = pointer.out(sh.result);
        const conforms = resultsPointer.terms.length === 0;
        pointer.addOut(sh.conforms, this.factory.literal(conforms.toString(), xsd.boolean));
        /**
         * `true` if the data conforms to the defined shapes, `false` otherwise.
         */
        this.conforms = conforms;
        /**
         * List of `ValidationResult` with details about nodes that don't conform to
         * the given shapes.
         */
        this.results = resultsPointer.toArray().map(resultPointer => new ValidationResult(resultPointer, this.ns));
    }
}
class ValidationResult {
    pointer;
    ns;
    constructor(pointer, ns) {
        this.pointer = pointer;
        this.ns = ns;
        this.term = pointer.term;
        this.dataset = pointer.dataset;
    }
    get message() {
        return this.pointer.out(this.ns.sh.resultMessage).terms || [];
    }
    get path() {
        return this.pointer.out(this.ns.sh.resultPath).term || null;
    }
    get focusNode() {
        return this.pointer.out(this.ns.sh.focusNode).term || null;
    }
    get severity() {
        return this.pointer.out(this.ns.sh.resultSeverity).term || null;
    }
    get sourceConstraintComponent() {
        return this.pointer.out(this.ns.sh.sourceConstraintComponent).term || null;
    }
    get sourceShape() {
        return this.pointer.out(this.ns.sh.sourceShape).term || null;
    }
    get value() {
        return this.pointer.out(this.ns.sh.value).term || null;
    }
    get detail() {
        return this.pointer.out(this.ns.sh.detail).map(detailResult => new ValidationResult(detailResult, this.ns));
    }
}

/* eslint-disable camelcase */
const error = debug('validation-engine::error');
const defaultMaxNodeChecks = 50;
class ValidationEngine {
    constructor(context, options) {
        this.context = context;
        this.factory = context.factory;
        this.maxErrors = options.maxErrors;
        this.maxNodeChecks = options.maxNodeChecks === undefined ? defaultMaxNodeChecks : options.maxNodeChecks;
        this.initReport();
        this.recordErrorsLevel = options.recordErrorsLevel || 0;
        this.violationsCount = 0;
        this.validationError = null;
        this.nestedResults = options.nestedResults || {};
        this.nodeCheckCounters = {};
        this.reportPointer = this.factory.clownface().blankNode();
    }
    clone({ recordErrorsLevel } = {}) {
        return new ValidationEngine(this.context, {
            maxErrors: this.maxErrors,
            maxNodeChecks: this.maxNodeChecks,
            recordErrorsLevel,
        });
    }
    initReport() {
        const { rdf, sh } = this.context.ns;
        this.nodeCheckCounters = {};
        this.reportPointer = this.factory.clownface({
            term: this.factory.blankNode('report'),
        }).addOut(rdf.type, sh.ValidationReport);
    }
    /**
     * Validates the data graph against the shapes graph
     */
    validateAll(dataGraph) {
        if (this.maxErrorsReached())
            return true;
        this.validationError = null;
        try {
            this.initReport();
            let foundError = false;
            const shapes = this.context.shapesGraph.shapesWithTarget;
            for (const shape of shapes) {
                const focusNodes = shape.getTargetNodes(dataGraph);
                for (const focusNode of focusNodes) {
                    if (this.validateNodeAgainstShape(focusNode, shape, dataGraph)) {
                        foundError = true;
                    }
                }
            }
            return foundError;
        }
        catch (e) {
            this.validationError = e;
            return true; // Really? Why do we even return a boolean here?
        }
    }
    /**
     * Returns true if any violation has been found
     */
    validateNodeAgainstShape(focusNode, shape, dataGraph) {
        if (this.maxErrorsReached())
            return true;
        if (shape.deactivated)
            return false;
        if (this.maxNodeChecks > 0) {
            // check how many times we have already tested this focusNode against this shape
            const id = JSON.stringify([focusNode, shape.shapeNode]);
            const nodeCheckCounter = this.nodeCheckCounters[id] === undefined ? 0 : this.nodeCheckCounters[id];
            if (nodeCheckCounter > this.maxNodeChecks) {
                // max node checks reached, so bail out
                return false;
            }
            // increment check counter for given focusNode/shape pair
            this.nodeCheckCounters[id] = nodeCheckCounter + 1;
        }
        const valueNodes = shape.getValueNodes(focusNode, dataGraph);
        let errorFound = false;
        for (const constraint of shape.constraints) {
            if (this.validateNodeAgainstConstraint(focusNode, valueNodes, constraint, dataGraph)) {
                errorFound = true;
            }
        }
        return errorFound;
    }
    validateNodeAgainstConstraint(focusNode, valueNodes, constraint, dataGraph) {
        const { sh } = this.context.ns;
        if (this.maxErrorsReached())
            return true;
        // If constraint is `sh:property`, follow `sh:property` and validate each value against the property shape
        if (sh.PropertyConstraintComponent.equals(constraint.component.node)) {
            let errorFound = false;
            for (const valueNode of valueNodes) {
                if (this.validateNodeAgainstShape(valueNode, this.context.shapesGraph.getShape(constraint.paramValue), dataGraph)) {
                    errorFound = true;
                }
            }
            return errorFound;
        }
        if (!constraint.validate) {
            throw new Error('Cannot find validator for constraint component ' + constraint.component.node.value);
        }
        if (constraint.isValidationFunctionGeneric) {
            // Generic sh:validator is called for each value node separately
            let errorFound = false;
            for (const valueNode of valueNodes) {
                if (this.maxErrorsReached()) {
                    break;
                }
                const valueNodeError = this.validateValueNodeAgainstConstraint(focusNode, valueNode, constraint);
                if (valueNodeError) {
                    this.violationsCount++;
                }
                errorFound = errorFound || valueNodeError;
            }
            return errorFound;
        }
        else {
            return this.validateValueNodeAgainstConstraint(focusNode, null, constraint);
        }
    }
    validateValueNodeAgainstConstraint(focusNode, valueNode, constraint) {
        const { sh } = this.context.ns;
        this.recordErrorsLevel++;
        const validationOutput = constraint.validate(focusNode, valueNode);
        const validationResults = Array.isArray(validationOutput) ? validationOutput : [validationOutput];
        const results = validationResults
            .map(validationResult => this.createResultFromObject(validationResult, constraint, focusNode, valueNode))
            .filter(Boolean);
        if (this.recordErrorsLevel === 1) {
            for (const result of results) {
                copyResult(result, this.reportPointer, sh.result);
            }
        }
        else {
            // Gather nested results. They will be linked later when their parent result is created.
            this.nestedResults[this.recordErrorsLevel] = (this.nestedResults[this.recordErrorsLevel] || []).concat(results);
        }
        this.recordErrorsLevel--;
        return results.length > 0;
    }
    maxErrorsReached() {
        if (this.maxErrors) {
            return this.violationsCount >= this.maxErrors;
        }
        else {
            return false;
        }
    }
    getReport() {
        if (this.validationError) {
            error('Validation Failure: ' + this.validationError);
            throw (this.validationError);
        }
        else {
            return new ValidationReport(this.reportPointer, { factory: this.factory, ns: this.context.ns });
        }
    }
    /**
     * Creates all the validation result nodes and messages for the result of applying the validation logic
     * of a constraints against a node.
     * Result passed as the first argument can be false, a resultMessage or a validation result object.
     * If none of these values is passed no error result or error message will be created.
     */
    createResultFromObject(validationResult, constraint, focusNode, valueNode) {
        const { sh } = this.context.ns;
        const validationResultObj = this.normalizeValidationResult(validationResult, valueNode);
        // Validation was successful. No result.
        if (!validationResultObj) {
            return null;
        }
        const result = this.createResult(constraint, focusNode);
        if (validationResultObj.path) {
            result.addOut(sh.resultPath, validationResultObj.path);
            this.copyNestedStructure(validationResultObj.path, result);
        }
        else if (constraint.shape.isPropertyShape && constraint.shape.path?.term) {
            result.addOut(sh.resultPath, constraint.shape.path);
            this.copyNestedStructure(constraint.shape.path.term, result);
        }
        if (validationResultObj.value) {
            result.addOut(sh.value, validationResultObj.value);
            this.copyNestedStructure(validationResultObj.value, result);
        }
        else if (valueNode) {
            result.addOut(sh.value, valueNode);
            this.copyNestedStructure(valueNode, result);
        }
        const messages = this.createResultMessages(validationResultObj, constraint);
        for (const message of messages) {
            result.addOut(sh.resultMessage, message);
        }
        return result;
    }
    /**
     * Validators can return a boolean, a string (message) or a validation result object.
     * This function normalizes all of them as a validation result object.
     * @returns null if validation was successful.
     */
    normalizeValidationResult(validationResult, valueNode) {
        if (validationResult === false) {
            return { value: valueNode };
        }
        else if (typeof validationResult === 'string') {
            return { message: validationResult, value: valueNode };
        }
        else if (typeof validationResult === 'object') {
            return validationResult;
        }
        else {
            return null;
        }
    }
    /**
     * Creates a new BlankNode holding the SHACL validation result, adding the default
     * properties for the constraint, focused node and value node
     */
    createResult(constraint, focusNode) {
        const { rdf, sh } = this.context.ns;
        const severity = constraint.shape.severity;
        const sourceConstraintComponent = constraint.component.node;
        const sourceShape = constraint.shape.shapeNode;
        const result = this.factory.clownface().blankNode();
        result
            .addOut(rdf.type, sh.ValidationResult)
            .addOut(sh.resultSeverity, severity)
            .addOut(sh.sourceConstraintComponent, sourceConstraintComponent)
            .addOut(sh.sourceShape, sourceShape)
            .addOut(sh.focusNode, focusNode);
        this.copySourceShapeStructure(constraint.shape, result);
        this.copyNestedStructure(focusNode, result);
        const children = this.nestedResults[this.recordErrorsLevel + 1];
        if (children) {
            if (sourceConstraintComponent.equals(sh.NodeConstraintComponent)) {
                for (const child of children) {
                    copyResult(child, result, sh.detail);
                }
            }
            this.nestedResults[this.recordErrorsLevel + 1] = [];
        }
        return result;
    }
    copyNestedStructure(subject, result) {
        const structureQuads = extractStructure(this.context.$shapes.dataset, subject);
        for (const quad of structureQuads) {
            result.dataset.add(quad);
        }
    }
    copySourceShapeStructure(shape, result) {
        const structureQuads = extractSourceShapeStructure(shape, this.context.$shapes.dataset, shape.shapeNode);
        for (const quad of structureQuads) {
            result.dataset.add(quad);
        }
    }
    /**
     * Creates a result message from the validation result and the message pattern in the constraint
     */
    createResultMessages(validationResult, constraint) {
        const { $shapes, ns } = this.context;
        const { sh } = ns;
        let messages = [];
        // 1. Try to get message from the validation result
        if (validationResult.message) {
            messages = [this.factory.literal(validationResult.message)];
        }
        // 2. Try to get message from the shape itself
        if (messages.length === 0) {
            messages = $shapes
                .node(constraint.shape.shapeNode)
                .out(sh.message)
                .terms;
        }
        // 3. Try to get message from the constraint component validator
        if (messages.length === 0) {
            messages = constraint.componentMessages.map((m) => this.factory.literal(m));
        }
        // 4. Try to get message from the constraint component node
        if (messages.length === 0) {
            messages = $shapes
                .node(constraint.component.node)
                .out(sh.message)
                .terms;
        }
        return messages.map((message) => withSubstitutions(message, constraint, this.factory));
    }
}
// TODO: This is not the 100% correct local name algorithm
function localName(uri) {
    let index = uri.lastIndexOf('#');
    if (index < 0) {
        index = uri.lastIndexOf('/');
    }
    if (index < 0) {
        throw new Error(`Cannot get local name of ${uri}`);
    }
    return uri.substring(index + 1);
}
function* take(n, iterable) {
    let i = 0;
    for (const item of iterable) {
        if (i++ === n)
            break;
        yield item;
    }
}
function nodeLabel(constraint, param) {
    const node = constraint.getParameterValue(param);
    if (!node) {
        return 'NULL';
    }
    if (node.termType === 'NamedNode') {
        // TODO: shrink URI if possible
        return '<' + node.value + '>';
    }
    if (node.termType === 'BlankNode') {
        if (constraint.nodeSet) {
            const limit = 3;
            if (constraint.nodeSet.size > limit) {
                const prefix = Array.from(take(limit, constraint.nodeSet)).map(x => x.value);
                return prefix.join(', ') + ` ... (and ${constraint.nodeSet.size - limit} more)`;
            }
            else {
                return Array.from(constraint.nodeSet).map(x => x.value).join(', ');
            }
        }
        return 'Blank node ' + node.value;
    }
    return node.value;
}
function withSubstitutions(messageTerm, constraint, factory) {
    const message = constraint.component.parameters.reduce((message, param) => {
        const paramName = localName(param.value);
        const paramValue = nodeLabel(constraint, param);
        return message
            .replace(`{$${paramName}}`, paramValue)
            .replace(`{?${paramName}}`, paramValue);
    }, messageTerm.value);
    return factory.literal(message, messageTerm.language || messageTerm.datatype);
}
/**
 * Copy a standalone result pointer/dataset into another pointer/dataset
 * and link it with the given predicate
 */
function copyResult(resultPointer, targetPointer, predicate) {
    for (const quad of resultPointer.dataset) {
        targetPointer.dataset.add(quad);
    }
    targetPointer.addOut(predicate, resultPointer);
}

namespace("http://www.w3.org/ns/auth/acl#");

namespace("https://www.w3.org/ns/activitystreams#");

namespace("https://barnard59.zazuko.com/vocab#");

namespace("http://purl.org/ontology/bibo/");

namespace("http://creativecommons.org/ns#");

namespace("http://www.w3.org/ns/auth/cert#");

namespace("http://www.w3.org/2011/content#");

namespace("https://code.described.at/");

namespace("http://qudt.org/vocab/constant/");

namespace("http://www.cidoc-crm.org/cidoc-crm/");

const builder$2 = namespace("http://www.w3.org/ns/csvw#");
const strict$2 = builder$2;

namespace("http://commontag.org/ns#");

namespace("https://cube.link/");

namespace("http://qudt.org/vocab/currency/");

namespace("http://datashapes.org/sparql#");

namespace("http://datashapes.org/dash#");

namespace("http://dbpedia.org/ontology/");

namespace("http://purl.org/dc/elements/1.1/");

namespace("http://purl.org/dc/dcam/");

namespace("http://www.w3.org/ns/dcat#");

namespace("http://purl.org/dc/dcmitype/");

namespace("http://purl.org/dc/terms/");

namespace("http://www.ics.forth.gr/isl/CRMdig/");

namespace("http://qudt.org/vocab/discipline/");

namespace("http://usefulinc.com/ns/doap#");

namespace("https://ekgf.github.io/dprod/");

namespace("https://w3id.org/dpv#");

namespace("http://www.w3.org/ns/dqv#");

namespace("http://www.linkedmodel.org/schema/dtype#");

namespace("http://www.w3.org/ns/duv#");

namespace("http://www.w3.org/ns/earl#");

namespace("http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#");

namespace("http://www.w3.org/2003/12/exif/ns#");

namespace("http://xmlns.com/foaf/0.1/");

namespace("http://purl.org/vocab/frbr/core#");

namespace("http://www.opengis.net/ont/geosparql#");

namespace("http://www.opengis.net/def/function/geosparql/");

namespace("http://www.opengis.net/def/rule/geosparql/");

namespace("https://w3id.org/semanticarts/ns/ontology/gist/");

namespace("http://www.opengis.net/ont/gml#");

namespace("http://www.geonames.org/ontology#");

namespace("http://purl.org/goodrelations/v1#");

namespace("http://www.w3.org/2003/g/data-view#");

namespace("https://gs1.org/voc/");

namespace("http://vocab.gtfs.org/terms#");

namespace("http://www.w3.org/2011/http#");

namespace("http://www.w3.org/ns/hydra/core#");

namespace("http://www.w3.org/2002/12/cal/icaltzd#");

namespace("https://linked.art/ns/terms/");

namespace("http://www.w3.org/ns/ldp#");

namespace("http://www.w3.org/2000/10/swap/list#");

namespace("http://www.w3.org/ns/locn#");

namespace("http://www.w3.org/2000/10/swap/log#");

namespace("http://lexvo.org/ontology#");

namespace("http://w3id.org/nfdi4ing/metadata4ing#");

namespace("http://www.w3.org/ns/ma-ont#");

namespace("http://www.loc.gov/mads/rdf/v1#");

namespace("http://www.w3.org/2000/10/swap/math#");

namespace("https://cube.link/meta/");

namespace("http://www.w3.org/ns/oa#");

namespace("http://ogp.me/ns#");

namespace("http://www.w3.org/ns/solid/oidc#");

namespace("http://www.w3.org/ns/org#");

namespace("http://www.w3.org/2002/07/owl#");

namespace("http://www.w3.org/ns/pim/space#");

namespace("https://pipeline.described.at/");

namespace("http://qudt.org/vocab/prefix/");

namespace("http://www.w3.org/ns/prov#");

namespace("http://purl.org/linked-data/cube#");

namespace("http://qudt.org/vocab/dimensionvector/");

namespace("http://qudt.org/vocab/quantitykind/");

namespace("http://qudt.org/schema/qudt/");

namespace("http://rdaregistry.info/Elements/u/");

const builder$1 = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const strict$1 = builder$1;

namespace("http://www.w3.org/ns/rdfa#");

namespace("http://www.w3.org/2000/01/rdf-schema#");

namespace("https://cube.link/relation/");

namespace("http://purl.org/stuff/rev#");

namespace("https://www.ica.org/standards/RiC/ontology#");

namespace("http://www.w3.org/ns/r2rml#");

namespace("http://purl.org/rss/1.0/");

namespace("http://schema.org/");

namespace("http://www.w3.org/ns/sparql-service-description#");

namespace("http://purl.org/linked-data/sdmx#");

namespace("http://semanticweb.cs.vu.nl/2009/11/sem/");

namespace("http://www.w3.org/2000/10/swap/set#");

namespace("http://www.opengis.net/ont/sf#");

namespace("http://www.w3.org/ns/shacl#");

namespace("http://www.w3.org/ns/shex#");

namespace("http://www.w3.org/ns/shacl-shacl#");

namespace("http://rdfs.org/sioc/ns#");

namespace("http://www.w3.org/2004/02/skos/core#");

namespace("http://www.w3.org/2008/05/skos-xl#");

namespace("http://www.w3.org/ns/solid/terms#");

namespace("http://www.w3.org/ns/sosa/");

namespace("http://qudt.org/vocab/sou/");

namespace("http://www.w3.org/ns/ssn/");

namespace("http://www.w3.org/ns/posix/stat#");

namespace("http://www.w3.org/2000/10/swap/string#");

namespace("http://www.w3.org/2006/03/test-description#");

namespace("http://www.w3.org/2006/time#");

namespace("http://qudt.org/vocab/unit/");

namespace("http://www.linkedmodel.org/schema/vaem#");

namespace("http://purl.org/vocab/vann/");

namespace("http://www.w3.org/2006/vcard/ns#");

namespace("http://rdfs.org/ns/void#");

namespace("http://www.w3.org/2003/06/sw-vocab-status/ns#");

namespace("http://purl.org/vso/ns#");

namespace("http://www.w3.org/2007/05/powder-s#");

namespace("http://www.w3.org/2003/01/geo/wgs84_pos#");

namespace("http://www.w3.org/1999/xhtml/vocab#");

namespace("http://rdf-vocabulary.ddialliance.org/xkos#");

const builder = namespace("http://www.w3.org/2001/XMLSchema#");
const strict = builder;

namespace("http://www.w3.org/2007/rif#");

namespace("http://rdf.data-vocabulary.org/#");

namespace("http://www.w3.org/2007/05/powder#");

namespace("http://www.w3.org/XML/1998/namespace/");

/**
 * Validators registry
 */
class Registry {
    validators;
    constructor() {
        this.validators = new TermMap();
    }
    /**
     * Register a new validator for a specific datatype.
     */
    register(datatype, validatorFunc) {
        this.validators.set(datatype, validatorFunc);
    }
    /**
     * Find validator for a given datatype.
     */
    find(datatype) {
        if (!datatype) {
            return null;
        }
        return this.validators.get(datatype);
    }
}
const validators = new Registry();
validators.register(strict.anySimpleType, () => true);
validators.register(strict.anyAtomicType, () => true);
validators.register(strict.string, () => true);
validators.register(strict.normalizedString, value => isNormalized(value));
validators.register(strict.token, value => (isNormalized(value)
    && !value.startsWith(' ')
    && !value.endsWith(' ')
    && !value.includes('  ')));
function isNormalized(value) {
    const forbiddenChars = ['\n', '\r', '\t'];
    return !forbiddenChars.some(forbiddenChar => value.includes(forbiddenChar));
}
const languagePattern = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;
validators.register(strict.language, value => languagePattern.test(value));
const anyURIPattern = /^[^\ufffe\uffff]*$/;
validators.register(strict.anyURI, value => anyURIPattern.test(value));
const signSeg = '(\\+|-)?';
const integerPattern = new RegExp(`^${signSeg}\\d+$`);
validators.register(strict.integer, value => integerPattern.test(value));
validators.register(strict.nonNegativeInteger, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('0')));
validators.register(strict.positiveInteger, value => (integerPattern.test(value)
    && BigInt(value) > BigInt('0')));
validators.register(strict.nonPositiveInteger, value => (integerPattern.test(value)
    && BigInt(value) <= BigInt('0')));
validators.register(strict.negativeInteger, value => (integerPattern.test(value)
    && BigInt(value) < BigInt('0')));
validators.register(strict.int, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('-2147483648')
    && BigInt(value) <= BigInt('2147483647')));
validators.register(strict.unsignedInt, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('0')
    && BigInt(value) <= BigInt('4294967295')));
validators.register(strict.long, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('-9223372036854775808')
    && BigInt(value) <= BigInt('9223372036854775807')));
validators.register(strict.unsignedLong, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('0')
    && BigInt(value) <= BigInt('18446744073709551615')));
validators.register(strict.short, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('-32768')
    && BigInt(value) <= BigInt('32767')));
validators.register(strict.unsignedShort, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('0')
    && BigInt(value) <= BigInt('65535')));
validators.register(strict.byte, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('-128')
    && BigInt(value) <= BigInt('127')));
validators.register(strict.unsignedByte, value => (integerPattern.test(value)
    && BigInt(value) >= BigInt('0')
    && BigInt(value) <= BigInt('255')));
validators.register(strict.boolean, value => (value === '1'
    || value === 'true'
    || value === '0'
    || value === 'false'));
const decimalSeg = `${signSeg}(\\d+\\.?\\d*|\\.\\d+)`;
const decimalPattern = new RegExp(`^${decimalSeg}$`);
validators.register(strict.decimal, value => decimalPattern.test(value));
validators.register(strict.float, validateFloat);
validators.register(strict.double, validateFloat);
const floatPattern = new RegExp(`^${decimalSeg}((E|e)(\\+|-)?\\d+)?$`);
function validateFloat(value) {
    return (value === 'INF'
        || value === '-INF'
        || value === 'NaN'
        || floatPattern.test(value));
}
const dateSignSeg = '-?';
const durationYearSeg = '\\d+Y';
const durationMonthSeg = '\\d+M';
const durationDaySeg = '\\d+D';
const durationHourSeg = '\\d+H';
const durationMinuteSeg = '\\d+M';
const durationSecondSeg = '\\d+(\\.\\d+)?S';
const durationYearMonthSeg = `(${durationYearSeg}(${durationMonthSeg})?|${durationMonthSeg})`;
const durationTimeSeg = `T((${durationHourSeg}(${durationMinuteSeg})?(${durationSecondSeg})?)|(${durationMinuteSeg}(${durationSecondSeg})?)|${durationSecondSeg})`;
const durationDayTimeSeg = `(${durationDaySeg}(${durationTimeSeg})?|${durationTimeSeg})`;
const durationSeg = `${dateSignSeg}P((${durationYearMonthSeg}(${durationDayTimeSeg})?)|${durationDayTimeSeg})`;
const durationPattern = new RegExp(`^${durationSeg}$`);
validators.register(strict.duration, value => durationPattern.test(value));
const dayTimeDurationPattern = new RegExp(`^${dateSignSeg}P${durationDayTimeSeg}$`);
validators.register(strict.dayTimeDuration, value => dayTimeDurationPattern.test(value));
const yearMonthDurationPattern = new RegExp(`^${dateSignSeg}P${durationYearMonthSeg}$`);
validators.register(strict.yearMonthDuration, value => yearMonthDurationPattern.test(value));
const yearSeg = `${dateSignSeg}(([1-9]\\d{3,})|(0\\d{3}))`;
const timezoneSeg = '(((\\+|-)\\d{2}:\\d{2})|Z)';
const monthSeg = '\\d{2}';
const daySeg = '\\d{2}';
const dateSeg = `${yearSeg}-${monthSeg}-${daySeg}`;
const timeSeg = '\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?';
const dateTimePattern = new RegExp(`^${dateSeg}T${timeSeg}${timezoneSeg}?$`);
validators.register(strict.dateTime, value => dateTimePattern.test(value));
const dateTimeStampPattern = new RegExp(`^${dateSeg}T${timeSeg}${timezoneSeg}$`);
validators.register(strict.dateTimeStamp, value => dateTimeStampPattern.test(value));
const datePattern = new RegExp(`^${dateSeg}${timezoneSeg}?$`);
validators.register(strict.date, value => datePattern.test(value));
const dayPattern = new RegExp(`^---${daySeg}${timezoneSeg}?$`);
validators.register(strict.gDay, value => dayPattern.test(value));
const monthPattern = new RegExp(`^--${monthSeg}${timezoneSeg}?$`);
validators.register(strict.gMonth, value => monthPattern.test(value));
const monthDayPattern = new RegExp(`^--${monthSeg}-${daySeg}${timezoneSeg}?$`);
validators.register(strict.gMonthDay, value => monthDayPattern.test(value));
const yearPattern = new RegExp(`^${yearSeg}${timezoneSeg}?$`);
validators.register(strict.gYear, value => yearPattern.test(value));
const yearMonthPattern = new RegExp(`^${yearSeg}-${monthSeg}${timezoneSeg}?$`);
validators.register(strict.gYearMonth, value => yearMonthPattern.test(value));
const timePattern = new RegExp(`^${timeSeg}${timezoneSeg}?$`);
validators.register(strict.time, value => timePattern.test(value));
const hexBinaryPattern = /^([0-9a-fA-F]{2})*$/;
validators.register(strict.hexBinary, value => hexBinaryPattern.test(value));
const b64CharSeg = '[A-Za-z0-9+/]';
const b16CharSeg = '[AEIMQUYcgkosw048]';
const b04CharSeg = '[AQgw]';
const b64Seg = `(${b64CharSeg} ?)`;
const b16Seg = `(${b16CharSeg} ?)`;
const b04Seg = `(${b04CharSeg} ?)`;
const b64Padded16Seg = `(${b64Seg}{2}${b16Seg}=)`;
const b64Padded8Seg = `(${b64Seg}${b04Seg}= ?=)`;
const b64QuadSeg = `(${b64Seg}{4})`;
const b64FinalQuadSeg = `(${b64Seg}{3}${b64CharSeg})`;
const b64FinalSeg = `(${b64FinalQuadSeg}|${b64Padded16Seg}|${b64Padded8Seg})`;
const b64Pattern = new RegExp(`^(${b64QuadSeg}*${b64FinalSeg})?$`);
validators.register(strict.base64Binary, value => b64Pattern.test(value));
validators.register(strict$2.JSON, (value) => {
    try {
        JSON.parse(value);
        return true;
    }
    catch {
        return false;
    }
});
// TODO
validators.register(strict.NOTATION, () => true);
validators.register(strict.QName, () => true);
validators.register(strict.Name, () => true);
validators.register(strict.NCName, () => true);
validators.register(strict.ENTITY, () => true);
validators.register(strict.ID, () => true);
validators.register(strict.IDREF, () => true);
validators.register(strict.NMTOKEN, () => true);
validators.register(strict.ENTITIES, () => true);
validators.register(strict.IDREFS, () => true);
validators.register(strict.NMTOKENS, () => true);
validators.register(strict$1.XMLLiteral, () => true);
validators.register(strict$1.HTML, () => true);

/**
 * Validate that a term's value is valid in regards to its declared datatype.
 */
function validateTerm(term) {
    if (term.termType !== 'Literal') {
        throw new Error('Cannot validate non-literal terms');
    }
    const validator = validators.find(term.datatype);
    if (validator) {
        return validator(term.value);
    }
    return true;
}

var rdfLiteral = {};

var rdfDataFactory = {};

var BlankNode = {};

var hasRequiredBlankNode;

function requireBlankNode () {
	if (hasRequiredBlankNode) return BlankNode;
	hasRequiredBlankNode = 1;
	Object.defineProperty(BlankNode, "__esModule", { value: true });
	BlankNode.BlankNode = void 0;
	/**
	 * A term that represents an RDF blank node with a label.
	 */
	let BlankNode$1 = class BlankNode {
	    constructor(value) {
	        this.termType = 'BlankNode';
	        this.value = value;
	    }
	    equals(other) {
	        return !!other && other.termType === 'BlankNode' && other.value === this.value;
	    }
	};
	BlankNode.BlankNode = BlankNode$1;
	
	return BlankNode;
}

var DataFactory = {};

var DefaultGraph = {};

var hasRequiredDefaultGraph;

function requireDefaultGraph () {
	if (hasRequiredDefaultGraph) return DefaultGraph;
	hasRequiredDefaultGraph = 1;
	Object.defineProperty(DefaultGraph, "__esModule", { value: true });
	DefaultGraph.DefaultGraph = void 0;
	/**
	 * A singleton term instance that represents the default graph.
	 * It's only allowed to assign a DefaultGraph to the .graph property of a Quad.
	 */
	let DefaultGraph$1 = class DefaultGraph {
	    constructor() {
	        this.termType = 'DefaultGraph';
	        this.value = '';
	        // Private constructor
	    }
	    equals(other) {
	        return !!other && other.termType === 'DefaultGraph';
	    }
	};
	DefaultGraph.DefaultGraph = DefaultGraph$1;
	// eslint-disable-next-line ts/naming-convention
	DefaultGraph$1.INSTANCE = new DefaultGraph$1();
	
	return DefaultGraph;
}

var Literal = {};

var NamedNode = {};

var hasRequiredNamedNode;

function requireNamedNode () {
	if (hasRequiredNamedNode) return NamedNode;
	hasRequiredNamedNode = 1;
	Object.defineProperty(NamedNode, "__esModule", { value: true });
	NamedNode.NamedNode = void 0;
	/**
	 * A term that contains an IRI.
	 */
	let NamedNode$1 = class NamedNode {
	    constructor(value) {
	        this.termType = 'NamedNode';
	        this.value = value;
	    }
	    equals(other) {
	        return !!other && other.termType === 'NamedNode' && other.value === this.value;
	    }
	};
	NamedNode.NamedNode = NamedNode$1;
	
	return NamedNode;
}

var hasRequiredLiteral;

function requireLiteral () {
	if (hasRequiredLiteral) return Literal;
	hasRequiredLiteral = 1;
	Object.defineProperty(Literal, "__esModule", { value: true });
	Literal.Literal = void 0;
	const NamedNode_1 = requireNamedNode();
	/**
	 * A term that represents an RDF literal,
	 * containing a string with an optional language tag and optional direction
	 * or datatype.
	 */
	let Literal$1 = class Literal {
	    constructor(value, languageOrDatatype) {
	        var _a;
	        this.termType = 'Literal';
	        this.value = value;
	        if (typeof languageOrDatatype === 'string') {
	            this.language = languageOrDatatype.toLowerCase();
	            this.datatype = Literal.RDF_LANGUAGE_STRING;
	            this.direction = '';
	        }
	        else if (languageOrDatatype) {
	            if ('termType' in languageOrDatatype) {
	                this.language = '';
	                this.datatype = languageOrDatatype;
	                this.direction = '';
	            }
	            else {
	                this.language = languageOrDatatype.language.toLowerCase();
	                this.datatype = languageOrDatatype.direction ?
	                    Literal.RDF_DIRECTIONAL_LANGUAGE_STRING :
	                    Literal.RDF_LANGUAGE_STRING;
	                this.direction = (_a = languageOrDatatype.direction) !== null && _a !== void 0 ? _a : '';
	            }
	        }
	        else {
	            this.language = '';
	            this.datatype = Literal.XSD_STRING;
	            this.direction = '';
	        }
	    }
	    equals(other) {
	        return !!other && other.termType === 'Literal' && other.value === this.value &&
	            other.language === this.language &&
	            ((other.direction === this.direction) || (!other.direction && this.direction === '')) &&
	            this.datatype.equals(other.datatype);
	    }
	};
	Literal.Literal = Literal$1;
	// eslint-disable-next-line ts/naming-convention
	Literal$1.RDF_LANGUAGE_STRING = new NamedNode_1.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#langString');
	// eslint-disable-next-line ts/naming-convention
	Literal$1.RDF_DIRECTIONAL_LANGUAGE_STRING = new NamedNode_1.NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString');
	// eslint-disable-next-line ts/naming-convention
	Literal$1.XSD_STRING = new NamedNode_1.NamedNode('http://www.w3.org/2001/XMLSchema#string');
	
	return Literal;
}

var Quad = {};

var hasRequiredQuad;

function requireQuad () {
	if (hasRequiredQuad) return Quad;
	hasRequiredQuad = 1;
	Object.defineProperty(Quad, "__esModule", { value: true });
	Quad.Quad = void 0;
	/**
	 * An instance of DefaultGraph represents the default graph.
	 * It's only allowed to assign a DefaultGraph to the .graph property of a Quad.
	 */
	let Quad$1 = class Quad {
	    constructor(subject, predicate, object, graph) {
	        this.termType = 'Quad';
	        this.value = '';
	        this.subject = subject;
	        this.predicate = predicate;
	        this.object = object;
	        this.graph = graph;
	    }
	    equals(other) {
	        // `|| !other.termType` is for backwards-compatibility with old factories without RDF* support.
	        return !!other && (other.termType === 'Quad' || !other.termType) &&
	            this.subject.equals(other.subject) &&
	            this.predicate.equals(other.predicate) &&
	            this.object.equals(other.object) &&
	            this.graph.equals(other.graph);
	    }
	};
	Quad.Quad = Quad$1;
	
	return Quad;
}

var Variable = {};

var hasRequiredVariable;

function requireVariable () {
	if (hasRequiredVariable) return Variable;
	hasRequiredVariable = 1;
	Object.defineProperty(Variable, "__esModule", { value: true });
	Variable.Variable = void 0;
	/**
	 * A term that represents a variable.
	 */
	let Variable$1 = class Variable {
	    constructor(value) {
	        this.termType = 'Variable';
	        this.value = value;
	    }
	    equals(other) {
	        return !!other && other.termType === 'Variable' && other.value === this.value;
	    }
	};
	Variable.Variable = Variable$1;
	
	return Variable;
}

var hasRequiredDataFactory;

function requireDataFactory () {
	if (hasRequiredDataFactory) return DataFactory;
	hasRequiredDataFactory = 1;
	Object.defineProperty(DataFactory, "__esModule", { value: true });
	DataFactory.DataFactory = void 0;
	const BlankNode_1 = requireBlankNode();
	const DefaultGraph_1 = requireDefaultGraph();
	const Literal_1 = requireLiteral();
	const NamedNode_1 = requireNamedNode();
	const Quad_1 = requireQuad();
	const Variable_1 = requireVariable();
	let dataFactoryCounter = 0;
	/**
	 * A factory for instantiating RDF terms and quads.
	 */
	let DataFactory$1 = class DataFactory {
	    constructor(options) {
	        var _a;
	        this.blankNodeCounter = 0;
	        options = options !== null && options !== void 0 ? options : {};
	        this.blankNodePrefix = (_a = options.blankNodePrefix) !== null && _a !== void 0 ? _a : `df_${dataFactoryCounter++}_`;
	    }
	    /**
	     * @param value The IRI for the named node.
	     * @return A new instance of NamedNode.
	     * @see NamedNode
	     */
	    namedNode(value) {
	        return new NamedNode_1.NamedNode(value);
	    }
	    /**
	     * @param value The optional blank node identifier.
	     * @return A new instance of BlankNode.
	     *         If the `value` parameter is undefined a new identifier
	     *         for the blank node is generated for each call.
	     * @see BlankNode
	     */
	    blankNode(value) {
	        return new BlankNode_1.BlankNode(value !== null && value !== void 0 ? value : `${this.blankNodePrefix}${this.blankNodeCounter++}`);
	    }
	    /**
	     * @param value              The literal value.
	     * @param languageOrDatatype The optional language, datatype, or directional language.
	     *                           If `languageOrDatatype` is a NamedNode,
	     *                           then it is used for the value of `NamedNode.datatype`.
	     *                           If `languageOrDatatype` is a NamedNode, it is used for the value
	     *                           of `NamedNode.language`.
	     *                           Otherwise, it is used as a directional language,
	     *                           from which the language is set to `languageOrDatatype.language`
	     *                           and the direction to `languageOrDatatype.direction`.
	     * @return A new instance of Literal.
	     * @see Literal
	     */
	    literal(value, languageOrDatatype) {
	        return new Literal_1.Literal(value, languageOrDatatype);
	    }
	    /**
	     * This method is optional.
	     * @param value The variable name
	     * @return A new instance of Variable.
	     * @see Variable
	     */
	    variable(value) {
	        return new Variable_1.Variable(value);
	    }
	    /**
	     * @return An instance of DefaultGraph.
	     */
	    defaultGraph() {
	        return DefaultGraph_1.DefaultGraph.INSTANCE;
	    }
	    /**
	     * @param subject   The quad subject term.
	     * @param predicate The quad predicate term.
	     * @param object    The quad object term.
	     * @param graph     The quad graph term.
	     * @return A new instance of Quad.
	     * @see Quad
	     */
	    quad(subject, predicate, object, graph) {
	        return new Quad_1.Quad(subject, predicate, object, graph !== null && graph !== void 0 ? graph : this.defaultGraph());
	    }
	    /**
	     * Create a deep copy of the given term using this data factory.
	     * @param original An RDF term.
	     * @return A deep copy of the given term.
	     */
	    fromTerm(original) {
	        // TODO: remove nasty any casts when this TS bug has been fixed:
	        //  https://github.com/microsoft/TypeScript/issues/26933
	        switch (original.termType) {
	            case 'NamedNode':
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.namedNode(original.value);
	            case 'BlankNode':
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.blankNode(original.value);
	            case 'Literal':
	                if (original.language) {
	                    // eslint-disable-next-line ts/no-unsafe-return
	                    return this.literal(original.value, original.language);
	                }
	                if (!original.datatype.equals(Literal_1.Literal.XSD_STRING)) {
	                    // eslint-disable-next-line ts/no-unsafe-return
	                    return this.literal(original.value, this.fromTerm(original.datatype));
	                }
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.literal(original.value);
	            case 'Variable':
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.variable(original.value);
	            case 'DefaultGraph':
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.defaultGraph();
	            case 'Quad':
	                // eslint-disable-next-line ts/no-unsafe-return
	                return this.quad(this.fromTerm(original.subject), this.fromTerm(original.predicate), this.fromTerm(original.object), this.fromTerm(original.graph));
	        }
	    }
	    /**
	     * Create a deep copy of the given quad using this data factory.
	     * @param original An RDF quad.
	     * @return A deep copy of the given quad.
	     */
	    fromQuad(original) {
	        return this.fromTerm(original);
	    }
	    /**
	     * Reset the internal blank node counter.
	     */
	    resetBlankNodeCounter() {
	        this.blankNodeCounter = 0;
	    }
	};
	DataFactory.DataFactory = DataFactory$1;
	
	return DataFactory;
}

var hasRequiredRdfDataFactory;

function requireRdfDataFactory () {
	if (hasRequiredRdfDataFactory) return rdfDataFactory;
	hasRequiredRdfDataFactory = 1;
	(function (exports) {
		var __createBinding = (rdfDataFactory && rdfDataFactory.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    var desc = Object.getOwnPropertyDescriptor(m, k);
		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
		      desc = { enumerable: true, get: function() { return m[k]; } };
		    }
		    Object.defineProperty(o, k2, desc);
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __exportStar = (rdfDataFactory && rdfDataFactory.__exportStar) || function(m, exports) {
		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		__exportStar(requireBlankNode(), exports);
		__exportStar(requireDataFactory(), exports);
		__exportStar(requireDefaultGraph(), exports);
		__exportStar(requireLiteral(), exports);
		__exportStar(requireNamedNode(), exports);
		__exportStar(requireQuad(), exports);
		__exportStar(requireVariable(), exports);
		
	} (rdfDataFactory));
	return rdfDataFactory;
}

var handler = {};

var TypeHandlerBoolean = {};

var Translator = {};

var hasRequiredTranslator;

function requireTranslator () {
	if (hasRequiredTranslator) return Translator;
	hasRequiredTranslator = 1;
	Object.defineProperty(Translator, "__esModule", { value: true });
	Translator.Translator = void 0;
	/**
	 * Translates between an RDF literal and a JavaScript primitive.
	 */
	let Translator$1 = class Translator {
	    constructor() {
	        this.supportedRdfDatatypes = [];
	        this.fromRdfHandlers = {};
	        this.toRdfHandlers = {};
	    }
	    static incorrectRdfDataType(literal) {
	        throw new Error(`Invalid RDF ${literal.datatype.value} value: '${literal.value}'`);
	    }
	    registerHandler(handler, rdfDatatypes, javaScriptDataTypes) {
	        for (const rdfDatatype of rdfDatatypes) {
	            this.supportedRdfDatatypes.push(rdfDatatype);
	            this.fromRdfHandlers[rdfDatatype.value] = handler;
	        }
	        for (const javaScriptDataType of javaScriptDataTypes) {
	            let existingToRdfHandlers = this.toRdfHandlers[javaScriptDataType];
	            if (!existingToRdfHandlers) {
	                this.toRdfHandlers[javaScriptDataType] = existingToRdfHandlers = [];
	            }
	            existingToRdfHandlers.push(handler);
	        }
	    }
	    fromRdf(literal, validate) {
	        const handler = this.fromRdfHandlers[literal.datatype.value];
	        if (handler) {
	            return handler.fromRdf(literal, validate);
	        }
	        else {
	            return literal.value;
	        }
	    }
	    toRdf(value, options) {
	        const handlers = this.toRdfHandlers[typeof value];
	        if (handlers) {
	            for (const handler of handlers) {
	                const ret = handler.toRdf(value, options);
	                if (ret) {
	                    return ret;
	                }
	            }
	        }
	        throw new Error(`Invalid JavaScript value: '${value}'`);
	    }
	    /**
	     * @return {NamedNode[]} An array of all supported RDF datatypes.
	     */
	    getSupportedRdfDatatypes() {
	        return this.supportedRdfDatatypes;
	    }
	    /**
	     * @return {string[]} An array of all supported JavaScript types.
	     */
	    getSupportedJavaScriptPrimitives() {
	        return Object.keys(this.toRdfHandlers);
	    }
	};
	Translator.Translator = Translator$1;
	
	return Translator;
}

var hasRequiredTypeHandlerBoolean;

function requireTypeHandlerBoolean () {
	if (hasRequiredTypeHandlerBoolean) return TypeHandlerBoolean;
	hasRequiredTypeHandlerBoolean = 1;
	Object.defineProperty(TypeHandlerBoolean, "__esModule", { value: true });
	TypeHandlerBoolean.TypeHandlerBoolean = void 0;
	const Translator_1 = requireTranslator();
	/**
	 * Translates booleans.
	 */
	let TypeHandlerBoolean$1 = class TypeHandlerBoolean {
	    fromRdf(literal, validate) {
	        switch (literal.value) {
	            case 'true':
	                return true;
	            case 'false':
	                return false;
	            case '1':
	                return true;
	            case '0':
	                return false;
	        }
	        if (validate) {
	            Translator_1.Translator.incorrectRdfDataType(literal);
	        }
	        return false;
	    }
	    toRdf(value, { datatype, dataFactory }) {
	        return dataFactory.literal(value ? 'true' : 'false', datatype || dataFactory.namedNode(TypeHandlerBoolean.TYPE));
	    }
	};
	TypeHandlerBoolean.TypeHandlerBoolean = TypeHandlerBoolean$1;
	TypeHandlerBoolean$1.TYPE = 'http://www.w3.org/2001/XMLSchema#boolean';
	
	return TypeHandlerBoolean;
}

var TypeHandlerDate = {};

var hasRequiredTypeHandlerDate;

function requireTypeHandlerDate () {
	if (hasRequiredTypeHandlerDate) return TypeHandlerDate;
	hasRequiredTypeHandlerDate = 1;
	Object.defineProperty(TypeHandlerDate, "__esModule", { value: true });
	TypeHandlerDate.TypeHandlerDate = void 0;
	const Translator_1 = requireTranslator();
	/**
	 * Translates dates.
	 */
	let TypeHandlerDate$1 = class TypeHandlerDate {
	    fromRdf(literal, validate) {
	        if (validate && !literal.value.match(TypeHandlerDate
	            .VALIDATORS[literal.datatype.value.substr(33, literal.datatype.value.length)])) {
	            Translator_1.Translator.incorrectRdfDataType(literal);
	        }
	        switch (literal.datatype.value) {
	            case 'http://www.w3.org/2001/XMLSchema#gDay':
	                return new Date(0, 0, parseInt(literal.value, 10));
	            case 'http://www.w3.org/2001/XMLSchema#gMonthDay':
	                const partsMonthDay = literal.value.split('-');
	                return new Date(0, parseInt(partsMonthDay[0], 10) - 1, parseInt(partsMonthDay[1], 10));
	            case 'http://www.w3.org/2001/XMLSchema#gYear':
	                return new Date(literal.value + '-01-01');
	            case 'http://www.w3.org/2001/XMLSchema#gYearMonth':
	                return new Date(literal.value + '-01');
	            default:
	                return new Date(literal.value);
	        }
	    }
	    toRdf(value, { datatype, dataFactory }) {
	        datatype = datatype || dataFactory.namedNode(TypeHandlerDate.TYPES[0]);
	        // Assume date values
	        if (!(value instanceof Date)) {
	            return null; // TODO: throw error in next breaking change
	        }
	        const date = value;
	        let valueString;
	        switch (datatype.value) {
	            case 'http://www.w3.org/2001/XMLSchema#gDay':
	                valueString = String(date.getUTCDate());
	                break;
	            case 'http://www.w3.org/2001/XMLSchema#gMonthDay':
	                valueString = (date.getUTCMonth() + 1) + '-' + date.getUTCDate();
	                break;
	            case 'http://www.w3.org/2001/XMLSchema#gYear':
	                valueString = String(date.getUTCFullYear());
	                break;
	            case 'http://www.w3.org/2001/XMLSchema#gYearMonth':
	                valueString = date.getUTCFullYear() + '-' + (date.getUTCMonth() + 1);
	                break;
	            case 'http://www.w3.org/2001/XMLSchema#date':
	                valueString = date.toISOString().replace(/T.*$/, '');
	                break;
	            default:
	                valueString = date.toISOString();
	        }
	        return dataFactory.literal(valueString, datatype);
	    }
	};
	TypeHandlerDate.TypeHandlerDate = TypeHandlerDate$1;
	TypeHandlerDate$1.TYPES = [
	    'http://www.w3.org/2001/XMLSchema#dateTime',
	    'http://www.w3.org/2001/XMLSchema#date',
	    'http://www.w3.org/2001/XMLSchema#gDay',
	    'http://www.w3.org/2001/XMLSchema#gMonthDay',
	    'http://www.w3.org/2001/XMLSchema#gYear',
	    'http://www.w3.org/2001/XMLSchema#gYearMonth',
	];
	TypeHandlerDate$1.VALIDATORS = {
	    date: /^[0-9]+-[0-9][0-9]-[0-9][0-9]Z?$/,
	    dateTime: /^[0-9]+-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9][0-9][0-9])?((Z?)|([\+-][0-9][0-9]:[0-9][0-9]))$/,
	    gDay: /^[0-9]+$/,
	    gMonthDay: /^[0-9]+-[0-9][0-9]$/,
	    gYear: /^[0-9]+$/,
	    gYearMonth: /^[0-9]+-[0-9][0-9]$/,
	};
	
	return TypeHandlerDate;
}

var TypeHandlerNumberDouble = {};

var hasRequiredTypeHandlerNumberDouble;

function requireTypeHandlerNumberDouble () {
	if (hasRequiredTypeHandlerNumberDouble) return TypeHandlerNumberDouble;
	hasRequiredTypeHandlerNumberDouble = 1;
	Object.defineProperty(TypeHandlerNumberDouble, "__esModule", { value: true });
	TypeHandlerNumberDouble.TypeHandlerNumberDouble = void 0;
	const Translator_1 = requireTranslator();
	/**
	 * Translates double numbers.
	 */
	let TypeHandlerNumberDouble$1 = class TypeHandlerNumberDouble {
	    fromRdf(literal, validate) {
	        const parsed = parseFloat(literal.value);
	        if (validate) {
	            if (isNaN(parsed)) {
	                Translator_1.Translator.incorrectRdfDataType(literal);
	            }
	            // TODO: validate more
	        }
	        return parsed;
	    }
	    toRdf(value, { datatype, dataFactory }) {
	        datatype = datatype || dataFactory.namedNode(TypeHandlerNumberDouble.TYPES[0]);
	        if (isNaN(value)) {
	            return dataFactory.literal('NaN', datatype);
	        }
	        if (!isFinite(value)) {
	            return dataFactory.literal(value > 0 ? 'INF' : '-INF', datatype);
	        }
	        if (value % 1 === 0) {
	            return null; // TODO: throw error in next breaking change
	        }
	        return dataFactory.literal(value.toExponential(15).replace(/(\d)0*e\+?/, '$1E'), datatype);
	    }
	};
	TypeHandlerNumberDouble.TypeHandlerNumberDouble = TypeHandlerNumberDouble$1;
	TypeHandlerNumberDouble$1.TYPES = [
	    'http://www.w3.org/2001/XMLSchema#double',
	    'http://www.w3.org/2001/XMLSchema#decimal',
	    'http://www.w3.org/2001/XMLSchema#float',
	];
	
	return TypeHandlerNumberDouble;
}

var TypeHandlerNumberInteger = {};

var hasRequiredTypeHandlerNumberInteger;

function requireTypeHandlerNumberInteger () {
	if (hasRequiredTypeHandlerNumberInteger) return TypeHandlerNumberInteger;
	hasRequiredTypeHandlerNumberInteger = 1;
	Object.defineProperty(TypeHandlerNumberInteger, "__esModule", { value: true });
	TypeHandlerNumberInteger.TypeHandlerNumberInteger = void 0;
	const Translator_1 = requireTranslator();
	/**
	 * Translates integer numbers.
	 */
	let TypeHandlerNumberInteger$1 = class TypeHandlerNumberInteger {
	    fromRdf(literal, validate) {
	        const parsed = parseInt(literal.value, 10);
	        if (validate) {
	            if (isNaN(parsed) || literal.value.indexOf('.') >= 0) {
	                Translator_1.Translator.incorrectRdfDataType(literal);
	            }
	            // TODO: validate more
	        }
	        return parsed;
	    }
	    toRdf(value, { datatype, dataFactory }) {
	        return dataFactory.literal(String(value), datatype
	            || (value <= TypeHandlerNumberInteger.MAX_INT && value >= TypeHandlerNumberInteger.MIN_INT
	                ? dataFactory.namedNode(TypeHandlerNumberInteger.TYPES[0])
	                : dataFactory.namedNode(TypeHandlerNumberInteger.TYPES[1])));
	    }
	};
	TypeHandlerNumberInteger.TypeHandlerNumberInteger = TypeHandlerNumberInteger$1;
	TypeHandlerNumberInteger$1.TYPES = [
	    'http://www.w3.org/2001/XMLSchema#integer',
	    'http://www.w3.org/2001/XMLSchema#long',
	    'http://www.w3.org/2001/XMLSchema#int',
	    'http://www.w3.org/2001/XMLSchema#byte',
	    'http://www.w3.org/2001/XMLSchema#short',
	    'http://www.w3.org/2001/XMLSchema#negativeInteger',
	    'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
	    'http://www.w3.org/2001/XMLSchema#nonPositiveInteger',
	    'http://www.w3.org/2001/XMLSchema#positiveInteger',
	    'http://www.w3.org/2001/XMLSchema#unsignedByte',
	    'http://www.w3.org/2001/XMLSchema#unsignedInt',
	    'http://www.w3.org/2001/XMLSchema#unsignedLong',
	    'http://www.w3.org/2001/XMLSchema#unsignedShort',
	];
	TypeHandlerNumberInteger$1.MAX_INT = 2147483647;
	TypeHandlerNumberInteger$1.MIN_INT = -2147483648;
	
	return TypeHandlerNumberInteger;
}

var TypeHandlerString = {};

var hasRequiredTypeHandlerString;

function requireTypeHandlerString () {
	if (hasRequiredTypeHandlerString) return TypeHandlerString;
	hasRequiredTypeHandlerString = 1;
	Object.defineProperty(TypeHandlerString, "__esModule", { value: true });
	TypeHandlerString.TypeHandlerString = void 0;
	/**
	 * Translates strings.
	 */
	let TypeHandlerString$1 = class TypeHandlerString {
	    fromRdf(literal) {
	        return literal.value;
	    }
	    toRdf(value, { datatype, dataFactory }) {
	        return dataFactory.literal(value, datatype);
	    }
	};
	TypeHandlerString.TypeHandlerString = TypeHandlerString$1;
	TypeHandlerString$1.TYPES = [
	    'http://www.w3.org/2001/XMLSchema#string',
	    'http://www.w3.org/2001/XMLSchema#normalizedString',
	    'http://www.w3.org/2001/XMLSchema#anyURI',
	    'http://www.w3.org/2001/XMLSchema#base64Binary',
	    'http://www.w3.org/2001/XMLSchema#language',
	    'http://www.w3.org/2001/XMLSchema#Name',
	    'http://www.w3.org/2001/XMLSchema#NCName',
	    'http://www.w3.org/2001/XMLSchema#NMTOKEN',
	    'http://www.w3.org/2001/XMLSchema#token',
	    'http://www.w3.org/2001/XMLSchema#hexBinary',
	    'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
	    'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString',
	    'http://www.w3.org/2001/XMLSchema#time',
	    'http://www.w3.org/2001/XMLSchema#duration',
	];
	
	return TypeHandlerString;
}

var hasRequiredHandler;

function requireHandler () {
	if (hasRequiredHandler) return handler;
	hasRequiredHandler = 1;
	(function (exports) {
		var __createBinding = (handler && handler.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    var desc = Object.getOwnPropertyDescriptor(m, k);
		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
		      desc = { enumerable: true, get: function() { return m[k]; } };
		    }
		    Object.defineProperty(o, k2, desc);
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __exportStar = (handler && handler.__exportStar) || function(m, exports) {
		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		__exportStar(requireTypeHandlerBoolean(), exports);
		__exportStar(requireTypeHandlerDate(), exports);
		__exportStar(requireTypeHandlerNumberDouble(), exports);
		__exportStar(requireTypeHandlerNumberInteger(), exports);
		__exportStar(requireTypeHandlerString(), exports);
		
	} (handler));
	return handler;
}

var ITypeHandler = {};

var hasRequiredITypeHandler;

function requireITypeHandler () {
	if (hasRequiredITypeHandler) return ITypeHandler;
	hasRequiredITypeHandler = 1;
	Object.defineProperty(ITypeHandler, "__esModule", { value: true });
	
	return ITypeHandler;
}

var hasRequiredRdfLiteral;

function requireRdfLiteral () {
	if (hasRequiredRdfLiteral) return rdfLiteral;
	hasRequiredRdfLiteral = 1;
	(function (exports) {
		var __createBinding = (rdfLiteral && rdfLiteral.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    var desc = Object.getOwnPropertyDescriptor(m, k);
		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
		      desc = { enumerable: true, get: function() { return m[k]; } };
		    }
		    Object.defineProperty(o, k2, desc);
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __exportStar = (rdfLiteral && rdfLiteral.__exportStar) || function(m, exports) {
		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.fromRdf = fromRdf;
		exports.toRdf = toRdf;
		exports.getTermRaw = getTermRaw;
		exports.getSupportedRdfDatatypes = getSupportedRdfDatatypes;
		exports.getSupportedJavaScriptPrimitives = getSupportedJavaScriptPrimitives;
		const rdf_data_factory_1 = requireRdfDataFactory();
		const handler_1 = requireHandler();
		const Translator_1 = requireTranslator();
		__exportStar(requireHandler(), exports);
		__exportStar(requireITypeHandler(), exports);
		__exportStar(requireTranslator(), exports);
		const DF = new rdf_data_factory_1.DataFactory();
		// Construct translator with built-in handlers
		const translator = new Translator_1.Translator();
		translator.registerHandler(new handler_1.TypeHandlerString(), handler_1.TypeHandlerString.TYPES.map(t => DF.namedNode(t)), ['string']);
		translator.registerHandler(new handler_1.TypeHandlerBoolean(), [handler_1.TypeHandlerBoolean.TYPE].map(t => DF.namedNode(t)), ['boolean']);
		translator.registerHandler(new handler_1.TypeHandlerNumberDouble(), handler_1.TypeHandlerNumberDouble.TYPES.map(t => DF.namedNode(t)), ['number']);
		translator.registerHandler(new handler_1.TypeHandlerNumberInteger(), handler_1.TypeHandlerNumberInteger.TYPES.map(t => DF.namedNode(t)), ['number']);
		translator.registerHandler(new handler_1.TypeHandlerDate(), handler_1.TypeHandlerDate.TYPES.map(t => DF.namedNode(t)), ['object']);
		/**
		 * Convert the given RDF literal to an JavaScript primitive.
		 * @param {Literal} literal An RDF literal value.
		 * @param {boolean} validate If the literal value should be validated against the datatype.
		 * @return {any} A JavaScript primitive value.
		 */
		function fromRdf(literal, validate) {
		    return translator.fromRdf(literal, validate);
		}
		/**
		 * Convert the given JavaScript primitive to an RDF literal.
		 * @param value A JavaScript primitive value.
		 * @param options Options for RDF conversion. May also be a data factory.
		 * @return {Literal} An RDF literal value.
		 */
		function toRdf(value, options) {
		    // Backwards-compatibility to accept data factory as option arg.
		    if (options && 'namedNode' in options) {
		        options = { dataFactory: options };
		    }
		    // Set default data factory
		    options = options || {};
		    if (options && !options.dataFactory) {
		        options.dataFactory = DF;
		    }
		    return translator.toRdf(value, options);
		}
		/**
		 * Get the raw value of the given term.
		 * If it is a literal, {@link fromRdf} will be called.
		 * Otherwise {@link .value} will be returned.
		 * @param {Term} term Any RDF term.
		 * @param {boolean} validate If the literal value should be validated against the datatype.
		 * @return {any} A JavaScript primitive value.
		 */
		function getTermRaw(term, validate) {
		    if (term.termType === 'Literal') {
		        return fromRdf(term, validate);
		    }
		    return term.value;
		}
		/**
		 * @return {NamedNode[]} An array of all supported RDF datatypes.
		 */
		function getSupportedRdfDatatypes() {
		    return translator.getSupportedRdfDatatypes();
		}
		/**
		 * @return {string[]} An array of all supported JavaScript types.
		 */
		function getSupportedJavaScriptPrimitives() {
		    return translator.getSupportedJavaScriptPrimitives();
		}
		
	} (rdfLiteral));
	return rdfLiteral;
}

var rdfLiteralExports = requireRdfLiteral();

const validateAnd = {
    component: ns.sh.AndConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const andNode = constraint.getParameterValue(sh.and);
        const shapes = rdfListToArray(context.$shapes.node(andNode));
        return shapes.every((shape) => {
            if (constraint.shape.isPropertyShape) {
                return context.nodeConformsToShape(focusNode, shape, constraint.pathObject);
            }
            return context.nodeConformsToShape(valueNode, shape);
        });
    },
};
const validateClass = {
    component: ns.sh.ClassConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const classNode = constraint.getParameterValue(ns.sh.class);
        return isInstanceOf(context.$data.node(valueNode), context.$data.node(classNode), context.ns);
    },
};
const validateClosed = {
    component: ns.sh.ClosedConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh, xsd } = context.ns;
        const closedNode = constraint.getParameterValue(sh.closed);
        const ignoredPropertiesNode = constraint.getParameterValue(sh.ignoredProperties);
        const currentShape = constraint.shape.shapeNode;
        const trueTerm = context.factory.literal('true', xsd.boolean);
        if (!trueTerm.equals(closedNode)) {
            return;
        }
        const allowed = new NodeSet(context.$shapes
            .node(currentShape)
            .out(sh.property)
            .out(sh.path)
            .terms
            .filter((term) => term.termType === 'NamedNode'));
        if (ignoredPropertiesNode) {
            allowed.addAll(rdfListToArray(context.$shapes.node(ignoredPropertiesNode)));
        }
        const results = [];
        const valueQuads = [...context.$data.dataset.match(valueNode, null, null)];
        valueQuads
            .filter(({ predicate }) => !allowed.has(predicate))
            .forEach(({ predicate, object }) => {
            results.push({ path: predicate, value: object });
        });
        return results;
    },
    validationMessage: 'Predicate is not allowed (closed shape)',
};
const validateDatatype = {
    component: ns.sh.DatatypeConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const datatypeNode = constraint.getParameterValue(sh.datatype);
        if (valueNode.termType === 'Literal') {
            return valueNode.datatype.equals(datatypeNode) && validateTerm(valueNode);
        }
        else {
            return false;
        }
    },
    validationMessage: 'Value does not have datatype {$datatype}',
};
const validateDisjoint = {
    component: ns.sh.DisjointConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const disjointNode = constraint.getParameterValue(sh.disjoint);
        return context.$data.dataset.match(focusNode, disjointNode, valueNode).size === 0;
    },
    validationMessage: 'Value node must not also be one of the values of {$disjoint}',
};
const validateEquals = {
    component: ns.sh.EqualsConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const path = constraint.shape.pathObject;
        const equalsNode = constraint.getParameterValue(sh.equals);
        const results = [];
        getPathObjects(context.$data, focusNode, path).forEach(value => {
            if (context.$data.dataset.match(focusNode, equalsNode, value).size === 0) {
                results.push({ value });
            }
        });
        const equalsQuads = [...context.$data.dataset.match(focusNode, equalsNode, null)];
        equalsQuads.forEach(({ object }) => {
            const value = object;
            if (!getPathObjects(context.$data, focusNode, path).some(pathValue => pathValue.equals(value))) {
                results.push({ value });
            }
        });
        return results;
    },
    propertyValidationMessage: 'Must have same values as {$equals}',
    nodeValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const equalsNode = constraint.getParameterValue(sh.equals);
        const results = [];
        let solutions = 0;
        getPathObjects(context.$data, focusNode, equalsNode).forEach(value => {
            solutions++;
            if (!value.equals(focusNode)) {
                results.push({ value });
            }
        });
        if (results.length === 0 && solutions === 0) {
            results.push({ value: focusNode });
        }
        return results;
    },
    nodeValidationMessage: 'Must have same values as {$equals}',
};
const validateHasValue = {
    component: ns.sh.HasValueConstraintComponent,
    nodeValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const hasValueNode = constraint.getParameterValue(sh.hasValue);
        return focusNode.equals(hasValueNode);
    },
    nodeValidationMessage: 'Value must be {$hasValue}',
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const path = constraint.shape.pathObject;
        const hasValueNode = constraint.getParameterValue(sh.hasValue);
        return getPathObjects(context.$data, focusNode, path)
            .some(value => value.equals(hasValueNode));
    },
    propertyValidationMessage: 'Missing expected value {$hasValue}',
};
const validateIn = {
    component: ns.sh.InConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        return constraint.nodeSet.has(valueNode);
    },
    validationMessage: 'Value is not one of the allowed values: {$in}',
};
const validateLanguageIn = {
    component: ns.sh.LanguageInConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        if (valueNode.termType !== 'Literal') {
            return false;
        }
        const valueLanguage = valueNode.language.toLowerCase();
        if (!valueLanguage) {
            return false;
        }
        const languageInNode = constraint.getParameterValue(sh.languageIn);
        const allowedLanguages = rdfListToArray(context.$shapes.node(languageInNode));
        return allowedLanguages.some(allowedLanguage => {
            const range = allowedLanguage.value.toLowerCase();
            return range === '*' || valueLanguage === range || valueLanguage.startsWith(`${range}-`);
        });
    },
    validationMessage: 'Language does not match any of {$languageIn}',
};
const validateLessThan = {
    component: ns.sh.LessThanConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const valuePath = constraint.shape.pathObject;
        const values = getPathObjects(context.$data, focusNode, valuePath);
        const lessThanNode = constraint.getParameterValue(sh.lessThan);
        const referenceValues = context.$data.node(focusNode).out(lessThanNode).terms;
        const invalidValues = [];
        for (const value of values) {
            for (const referenceValue of referenceValues) {
                const c = compareTerms(value, referenceValue, context.ns);
                if (c === null || c >= 0) {
                    invalidValues.push({ value });
                }
            }
        }
        return invalidValues;
    },
    propertyValidationMessage: 'Value is not less than value of {$lessThan}',
};
const validateLessThanOrEquals = {
    component: ns.sh.LessThanOrEqualsConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const valuePath = constraint.shape.pathObject;
        const values = getPathObjects(context.$data, focusNode, valuePath);
        const lessThanOrEqualsNode = constraint.getParameterValue(sh.lessThanOrEquals);
        const referenceValues = context.$data.node(focusNode).out(lessThanOrEqualsNode).terms;
        const invalidValues = [];
        for (const value of values) {
            for (const referenceValue of referenceValues) {
                const c = compareTerms(value, referenceValue, context.ns);
                if (c === null || c > 0) {
                    invalidValues.push({ value });
                }
            }
        }
        return invalidValues;
    },
    propertyValidationMessage: 'Value is not less than or equal to value of {$lessThanOrEquals}',
};
const validateMaxCount = {
    component: ns.sh.MaxCountConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const path = constraint.shape.pathObject;
        const count = getPathObjects(context.$data, focusNode, path).length;
        const maxCountNode = constraint.getParameterValue(sh.maxCount);
        return maxCountNode && count <= Number(maxCountNode.value);
    },
    propertyValidationMessage: 'More than {$maxCount} values',
};
const validateMaxExclusive = {
    component: ns.sh.MaxExclusiveConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const maxExclusiveNode = constraint.getParameterValue(sh.maxExclusive);
        const comp = compareTerms(valueNode, maxExclusiveNode, context.ns);
        return (comp !== null && comp < 0);
    },
    validationMessage: 'Value is not less than {$maxExclusive}',
};
const validateMaxInclusive = {
    component: ns.sh.MaxInclusiveConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const maxInclusiveNode = constraint.getParameterValue(sh.maxInclusive);
        const comp = compareTerms(valueNode, maxInclusiveNode, context.ns);
        return (comp !== null && comp <= 0);
    },
    validationMessage: 'Value is not less than or equal to {$maxInclusive}',
};
const validateMaxLength = {
    component: ns.sh.MaxLengthConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        if (valueNode.termType === 'BlankNode') {
            return false;
        }
        const { sh } = context.ns;
        const maxLengthNode = constraint.getParameterValue(sh.maxLength);
        return Array.from(valueNode.value).length <= Number(maxLengthNode.value);
    },
    validationMessage: 'Value has more than {$maxLength} characters',
};
const validateMinCount = {
    component: ns.sh.MinCountConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const path = constraint.pathObject;
        const count = getPathObjects(context.$data, focusNode, path).length;
        const minCountNode = constraint.getParameterValue(sh.minCount);
        return count >= Number(minCountNode.value);
    },
    propertyValidationMessage: 'Less than {$minCount} values',
};
const validateMinExclusive = {
    component: ns.sh.MinExclusiveConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const minExclusiveNode = constraint.getParameterValue(sh.minExclusive);
        const comp = compareTerms(valueNode, minExclusiveNode, context.ns);
        return (comp !== null && comp > 0);
    },
    validationMessage: 'Value is not greater than {$minExclusive}',
};
const validateMinInclusive = {
    component: ns.sh.MinInclusiveConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const minInclusiveNode = constraint.getParameterValue(sh.minInclusive);
        const comp = compareTerms(valueNode, minInclusiveNode, context.ns);
        return (comp !== null && comp >= 0);
    },
    validationMessage: 'Value is not greater than or equal to {$minInclusive}',
};
const validateMinLength = {
    component: ns.sh.MinLengthConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        if (valueNode.termType === 'BlankNode') {
            return false;
        }
        const { sh } = context.ns;
        const minLengthNode = constraint.getParameterValue(sh.minLength);
        return Array.from(valueNode.value).length >= Number(minLengthNode.value);
    },
    validationMessage: 'Value has less than {$minLength} characters',
};
const validateNodeKind = {
    component: ns.sh.NodeKindConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const nodeKindNode = constraint.getParameterValue(sh.nodeKind);
        if (valueNode.termType === 'BlankNode') {
            return sh.BlankNode.equals(nodeKindNode) ||
                sh.BlankNodeOrIRI.equals(nodeKindNode) ||
                sh.BlankNodeOrLiteral.equals(nodeKindNode);
        }
        else if (valueNode.termType === 'NamedNode') {
            return sh.IRI.equals(nodeKindNode) ||
                sh.BlankNodeOrIRI.equals(nodeKindNode) ||
                sh.IRIOrLiteral.equals(nodeKindNode);
        }
        else if (valueNode.termType === 'Literal') {
            return sh.Literal.equals(nodeKindNode) ||
                sh.BlankNodeOrLiteral.equals(nodeKindNode) ||
                sh.IRIOrLiteral.equals(nodeKindNode);
        }
    },
    validationMessage: 'Value does not have node kind {$nodeKind}',
};
const validateNode = {
    component: ns.sh.NodeConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const nodeNode = constraint.getParameterValue(sh.node);
        return context.validateNodeAgainstShape(valueNode, nodeNode);
    },
    validationMessage: 'Value does not have shape {$node}',
};
const validateNot = {
    component: ns.sh.NotConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const notNode = constraint.getParameterValue(sh.not);
        return !context.nodeConformsToShape(valueNode, notNode);
    },
    validationMessage: 'Value does have shape {$not}',
};
const validateOr = {
    component: ns.sh.OrConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const orNode = constraint.getParameterValue(sh.or);
        const shapes = rdfListToArray(context.$shapes.node(orNode));
        return shapes.some(shape => context.nodeConformsToShape(valueNode, shape));
    },
};
const validatePattern = {
    component: ns.sh.PatternConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        if (valueNode.termType === 'BlankNode') {
            return false;
        }
        const { sh } = context.ns;
        const flagsNode = constraint.getParameterValue(sh.flags);
        const patternNode = constraint.getParameterValue(sh.pattern);
        let flags = flagsNode?.value || '';
        const pattern = flags.includes('x') ? removePatternWhitespace(patternNode.value) : patternNode.value;
        flags = flags.replace(/x/g, '');
        let re;
        if (!flags.includes('u')) {
            try {
                re = new RegExp(pattern, `${flags}u`);
            }
            catch (error) {
                if (error instanceof SyntaxError) {
                    re = new RegExp(pattern, flags);
                }
                else {
                    throw error;
                }
            }
        }
        else {
            re = new RegExp(pattern, flags);
        }
        return re.test(valueNode.value);
    },
    validationMessage: 'Value does not match pattern "{$pattern}"',
};
const validateQualifiedMaxCount = {
    component: ns.sh.QualifiedMaxCountConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const count = validateQualifiedHelper(context, focusNode, constraint);
        const qualifiedMaxCountNode = constraint.getParameterValue(sh.qualifiedMaxCount);
        return qualifiedMaxCountNode.termType === 'Literal' && count <= Number(qualifiedMaxCountNode.value);
    },
    propertyValidationMessage: 'More than {$qualifiedMaxCount} values have shape {$qualifiedValueShape}',
};
const validateQualifiedMinCount = {
    component: ns.sh.QualifiedMinCountConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const count = validateQualifiedHelper(context, focusNode, constraint);
        const qualifiedMinCountNode = constraint.getParameterValue(sh.qualifiedMinCount);
        return qualifiedMinCountNode.termType === 'Literal' && count >= Number(qualifiedMinCountNode.value);
    },
    propertyValidationMessage: 'Less than {$qualifiedMinCount} values have shape {$qualifiedValueShape}',
};
function validateQualifiedHelper(context, focusNode, constraint) {
    const { sh, xsd } = context.ns;
    const currentShapeNode = constraint.shape.shapeNode;
    const qualifiedValueShapesDisjointNode = constraint.getParameterValue(sh.qualifiedValueShapesDisjoint);
    const qualifiedValueShapeNode = constraint.getParameterValue(sh.qualifiedValueShape);
    const trueTerm = context.factory.literal('true', xsd.boolean);
    const siblingShapes = new NodeSet();
    if (trueTerm.equals(qualifiedValueShapesDisjointNode)) {
        const qualifiedSiblingShapes = context.$shapes
            .node(currentShapeNode)
            // Move up to parent
            .in(sh.property)
            // Move down to all siblings
            .out(sh.property)
            // Select sh:qualifiedValueShape of all siblings
            .out(sh.qualifiedValueShape)
            .filter(({ term }) => !term.equals(qualifiedValueShapeNode))
            .terms;
        siblingShapes.addAll(qualifiedSiblingShapes);
    }
    const path = constraint.shape.pathObject;
    return getPathObjects(context.$data, focusNode, path)
        .filter(value => context.nodeConformsToShape(value, qualifiedValueShapeNode) &&
        !validateQualifiedConformsToASibling(context, value, [...siblingShapes]))
        .length;
}
function validateQualifiedConformsToASibling(context, value, siblingShapes) {
    for (let i = 0; i < siblingShapes.length; i++) {
        if (context.nodeConformsToShape(value, siblingShapes[i])) {
            return true;
        }
    }
    return false;
}
const validateUniqueLang = {
    component: ns.sh.UniqueLangConstraintComponent,
    propertyValidate(context, focusNode, valueNode, constraint) {
        const { sh, xsd } = context.ns;
        const uniqueLangNode = constraint.getParameterValue(sh.uniqueLang);
        const trueTerm = context.factory.literal('true', xsd.boolean);
        if (!trueTerm.equals(uniqueLangNode)) {
            return;
        }
        const path = constraint.shape.pathObject;
        const map = {};
        getPathObjects(context.$data, focusNode, path).forEach(value => {
            if (value.termType === 'Literal' && value.language && value.language !== '') {
                const old = map[value.language];
                if (!old) {
                    map[value.language] = 1;
                }
                else {
                    map[value.language] = old + 1;
                }
            }
        });
        const results = [];
        for (const lang in map) {
            if (Object.prototype.hasOwnProperty.call(map, lang)) {
                const count = map[lang];
                if (count > 1) {
                    results.push('Language "' + lang + '" has been used by ' + count + ' values');
                }
            }
        }
        return results;
    },
    propertyValidationMessage: 'Language "{?lang}" used more than once',
};
const validateXone = {
    component: ns.sh.XoneConstraintComponent,
    validate(context, focusNode, valueNode, constraint) {
        const { sh } = context.ns;
        const xoneNode = constraint.getParameterValue(sh.xone);
        const shapes = rdfListToArray(context.$shapes.node(xoneNode));
        const conformsPositions = [];
        for (let i = 0; i < shapes.length; i++) {
            const shape = shapes[i];
            if (context.nodeConformsToShape(valueNode, shape)) {
                conformsPositions.push(i + 1);
            }
        }
        if (conformsPositions.length === 0) {
            return ['no shapes matched'];
        }
        if (conformsPositions.length > 1) {
            return ['multiple matches, at positions ' + conformsPositions.join(', ')];
        }
        return [];
    },
};
// Private helper functions
function removePatternWhitespace(pattern) {
    let result = '';
    let inCharacterClass = false;
    let escaped = false;
    for (const character of pattern) {
        // XPath's x flag removes only XML whitespace, before interpreting escapes.
        if (!inCharacterClass && /[ \t\r\n]/.test(character)) {
            continue;
        }
        result += character;
        if (escaped) {
            escaped = false;
        }
        else if (character === '\\') {
            escaped = true;
        }
        else if (character === '[') {
            inCharacterClass = true;
        }
        else if (character === ']') {
            inCharacterClass = false;
        }
    }
    return result;
}
/**
 * Compare 2 terms.
 *
 * Returns:
 * - a negative number if term1 occurs before term2
 * - a positive number if the term1 occurs after term2
 * - 0 if they are equivalent
 * - null if they are not comparable
 */
function compareTerms(term1, term2, ns) {
    if (!term1 || !term2 || term1.termType !== 'Literal' || term2.termType !== 'Literal') {
        return null;
    }
    if (!validateTerm(term1) || !validateTerm(term2)) {
        return null;
    }
    // Check that if one of the compared nodes is a datetime with a timezone,
    // the other one is too. A datetime with a specified timezone is not comparable
    // with a datetime without a timezone.
    if (hasTimezone(term1, ns) !== hasTimezone(term2, ns)) {
        return null;
    }
    const value1 = rdfLiteralExports.fromRdf(term1);
    const value2 = rdfLiteralExports.fromRdf(term2);
    if (typeof value1 !== typeof value2) {
        return null;
    }
    if (typeof value1 === 'string') {
        // fromRdf also returns strings for datatypes it cannot convert. Only
        // xsd:string literals have SPARQL's code point string ordering.
        if (!ns.xsd.string.equals(term1.datatype) || !ns.xsd.string.equals(term2.datatype)) {
            return null;
        }
        const characters1 = Array.from(value1);
        const characters2 = Array.from(value2);
        for (let i = 0; i < Math.min(characters1.length, characters2.length); i++) {
            const difference = characters1[i].codePointAt(0) - characters2[i].codePointAt(0);
            if (difference !== 0) {
                return difference;
            }
        }
        return characters1.length - characters2.length;
    }
    // Calendar datatypes converted to Date objects are not interchangeable.
    if (typeof value1 === 'object' && !term1.datatype.equals(term2.datatype)) {
        return null;
    }
    const difference = value1 - value2;
    return Number.isNaN(difference) ? null : difference;
}
function hasTimezone(node, ns) {
    const pattern = /^.*(((\+|-)\d{2}:\d{2})|Z)$/;
    return ns.xsd.dateTime.equals(node.datatype) && pattern.test(node.value);
}

var defaultValidators = /*#__PURE__*/Object.freeze({
  __proto__: null,
  validateAnd: validateAnd,
  validateClass: validateClass,
  validateClosed: validateClosed,
  validateDatatype: validateDatatype,
  validateDisjoint: validateDisjoint,
  validateEquals: validateEquals,
  validateHasValue: validateHasValue,
  validateIn: validateIn,
  validateLanguageIn: validateLanguageIn,
  validateLessThan: validateLessThan,
  validateLessThanOrEquals: validateLessThanOrEquals,
  validateMaxCount: validateMaxCount,
  validateMaxExclusive: validateMaxExclusive,
  validateMaxInclusive: validateMaxInclusive,
  validateMaxLength: validateMaxLength,
  validateMinCount: validateMinCount,
  validateMinExclusive: validateMinExclusive,
  validateMinInclusive: validateMinInclusive,
  validateMinLength: validateMinLength,
  validateNode: validateNode,
  validateNodeKind: validateNodeKind,
  validateNot: validateNot,
  validateOr: validateOr,
  validatePattern: validatePattern,
  validateQualifiedMaxCount: validateQualifiedMaxCount,
  validateQualifiedMinCount: validateQualifiedMinCount,
  validateUniqueLang: validateUniqueLang,
  validateXone: validateXone
});

/**
 * Validates RDF data based on a set of RDF shapes.
 */
class SHACLValidator {
    importsLoaded = false;
    /**
     * @param shapes - Dataset containing the SHACL shapes for validation
     * @param {object} [options] - Validator options
     */
    constructor(shapes, { constraintValidators = [], ...options } = {}) {
        options = options || {};
        this.factory = options.factory || factory;
        this.ns = prepareNamespaces(this.factory);
        this.allowNamedNodeInList = options.allowNamedNodeInList === undefined ? false : options.allowNamedNodeInList;
        const dataset = this.factory.dataset([...shapes]);
        this.$shapes = this.factory.clownface({ dataset });
        this.$data = this.factory.clownface();
        this.validators = this.factory.termMap([
            ...Object.values(defaultValidators).map(toMapInit),
            ...constraintValidators.flatMap(obj => Object.values(obj)).map(toMapInit),
        ]);
        this.shapesGraph = new ShapesGraph(this, {
            additionalVocabularies: options.constraintVocabularies,
        });
        this.validationEngine = new ValidationEngine(this, options);
        if (options.importGraph) {
            this.importGraph = options.importGraph;
        }
        this.depth = 0;
    }
    /**
     * Validates the provided data graph against the provided shapes graph
     */
    async validate(dataGraph) {
        await this.loadOwlImports();
        this.setDataGraph(dataGraph);
        this.validationEngine.validateAll(this.$data);
        return this.validationEngine.getReport();
    }
    /**
     * Validates the provided focus node against the provided shape
     */
    async validateNode(dataGraph, focusNode, shapeNode) {
        await this.loadOwlImports();
        this.setDataGraph(dataGraph);
        this.nodeConformsToShape(focusNode, shapeNode, this.validationEngine);
        return this.validationEngine.getReport();
    }
    setDataGraph(dataGraph) {
        if ('dataset' in dataGraph) {
            this.$data = dataGraph;
        }
        else {
            this.$data = this.factory.clownface({ dataset: dataGraph });
        }
    }
    /**
     * Exposed to be available from validation functions as `SHACL.nodeConformsToShape`
     */
    nodeConformsToShape(focusNode, shapeNode, propertyPathOrEngine) {
        let engine;
        let shape = this.shapesGraph?.getShape(shapeNode);
        if (propertyPathOrEngine && 'termType' in propertyPathOrEngine) {
            engine = this.validationEngine.clone({
                recordErrorsLevel: this.validationEngine.recordErrorsLevel,
            });
            shape = shape.overridePath(propertyPathOrEngine);
        }
        else if (propertyPathOrEngine && 'clone' in propertyPathOrEngine) {
            engine = propertyPathOrEngine;
        }
        else {
            engine = this.validationEngine.clone();
        }
        try {
            this.depth++;
            const foundViolations = engine.validateNodeAgainstShape(focusNode, shape, this.$data);
            return !foundViolations;
        }
        finally {
            this.depth--;
        }
    }
    validateNodeAgainstShape(focusNode, shapeNode) {
        return this.nodeConformsToShape(focusNode, shapeNode, this.validationEngine);
    }
    async loadOwlImports() {
        if (this.importsLoaded) {
            return;
        }
        this.importsLoaded = true;
        const { owl } = this.ns;
        const loaded = new TermSet();
        const doLoad = async (url) => {
            if (!this.importGraph) {
                throw new Error('importGraph parameter is required to load owl:imports');
            }
            const imported = await this.importGraph(url);
            for (const quad of imported) {
                this.$shapes.dataset.add(quad);
            }
            return imported;
        };
        const loadFromDataset = (dataset) => {
            const toImport = new TermSet();
            for (const { object } of dataset.match(null, owl.imports)) {
                if (object.termType === 'NamedNode' && !loaded.has(object) && !toImport.has(object)) {
                    loaded.add(object);
                    toImport.add(object);
                }
            }
            return Promise.all([...toImport].map(async (url) => {
                await loadFromDataset(await doLoad(url));
            }));
        };
        await loadFromDataset(this.$shapes.dataset);
    }
}
function toMapInit(validator) {
    return [validator.component, validator];
}

export { SHACLValidator as default };
