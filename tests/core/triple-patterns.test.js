/**
 * Tests for triple-pattern parsing, term resolution, and store matching.
 * Strict W3C-style grammar: named vars only (no bare `?`), quoted literals only.
 * Uses the mock rdflib in __mocks__/rdflib-esm.js.
 */

import rdflib from '../__mocks__/rdflib-esm.js';
import {
  triplePatternTermToNode,
  miniTermToNode,
  parsePatternParts,
  expandCurie,
  KNOWN_PREFIXES,
  matchStore as _matchStore,
  expandBnodes as _expandBnodes,
} from '../../core/rdf-utils.js';

// Tests below were written against the legacy flat shape `{vars, results}`.
// Producers now return the W3C SPARQL Query Results JSON envelope. Flatten
// (and accept either shape on input) so the existing assertions stand.
function flatten(d) {
  if (!d || typeof d !== 'object') return d;
  if (d.head?.vars && d.results?.bindings) {
    return { vars: d.head.vars, results: d.results.bindings };
  }
  return d;
}
const toW3c = d => d?.head ? d : { head: { vars: d.vars }, results: { bindings: d.results } };
const matchStore   = (...a) => flatten(_matchStore(...a));
const expandBnodes = (store, data) => flatten(_expandBnodes(store, toW3c(data)));
import {
  TriplePatternParser,
  TriplePatternValidator,
  MiniQueryParser,
  MiniQueryValidator,
} from '../../web/utils/sol-query-triple-patterns.js';

// ── expandCurie ───────────────────────────────────────────────────────────────

describe('expandCurie', () => {
  test('expands known prefix', () => {
    expect(expandCurie('foaf:name')).toBe('http://xmlns.com/foaf/0.1/name');
  });

  test('expands schema prefix', () => {
    expect(expandCurie('schema:Person')).toBe('http://schema.org/Person');
  });

  test('returns null for unknown prefix', () => {
    expect(expandCurie('unknown:term')).toBeNull();
  });

  test('returns null with no colon', () => {
    expect(expandCurie('nocolon')).toBeNull();
  });

  test('expands with extraPrefixes', () => {
    expect(expandCurie('ex:alice', { ex: 'http://example.org/' }))
      .toBe('http://example.org/alice');
  });

  test('extraPrefixes override built-ins', () => {
    expect(expandCurie('foaf:name', { foaf: 'http://override/' }))
      .toBe('http://override/name');
  });
});

// ── triplePatternTermToNode ──────────────────────────────────────────────────

describe('triplePatternTermToNode', () => {
  test('bare "?" throws', () => {
    expect(() => triplePatternTermToNode('?', rdflib)).toThrow(/named variable/);
  });

  test('named variable ?x returns null (wildcard)', () => {
    expect(triplePatternTermToNode('?x', rdflib)).toBeNull();
  });

  test('named variable ?subject returns null (wildcard)', () => {
    expect(triplePatternTermToNode('?subject', rdflib)).toBeNull();
  });

  test('variable with invalid name throws', () => {
    expect(() => triplePatternTermToNode('?1bad', rdflib)).toThrow(/Invalid variable/);
  });

  test('<uri> returns NamedNode', () => {
    const node = triplePatternTermToNode('<http://example.org/foo>', rdflib);
    expect(node.termType).toBe('NamedNode');
    expect(node.value).toBe('http://example.org/foo');
  });

  test('CURIE expands to NamedNode', () => {
    const node = triplePatternTermToNode('foaf:name', rdflib);
    expect(node.termType).toBe('NamedNode');
    expect(node.value).toBe('http://xmlns.com/foaf/0.1/name');
  });

  test('"literal" returns Literal', () => {
    const node = triplePatternTermToNode('"hello"', rdflib);
    expect(node.termType).toBe('Literal');
    expect(node.value).toBe('hello');
  });

  test('"literal"@lang returns Literal with language', () => {
    const node = triplePatternTermToNode('"hello"@en', rdflib);
    expect(node.termType).toBe('Literal');
    expect(node.language).toBe('en');
  });

  test('bare word throws (must be quoted)', () => {
    expect(() => triplePatternTermToNode('alice', rdflib)).toThrow();
  });

  test('#fragment resolves against baseUri', () => {
    const node = triplePatternTermToNode('#me', rdflib, {}, 'http://example.org/profile');
    expect(node.termType).toBe('NamedNode');
    expect(node.value).toBe('http://example.org/profile#me');
  });

  test('#fragment strips existing fragment from baseUri', () => {
    const node = triplePatternTermToNode('#me', rdflib, {}, 'http://example.org/profile#other');
    expect(node.value).toBe('http://example.org/profile#me');
  });

  test('<#fragment> inside angle brackets resolves', () => {
    const node = triplePatternTermToNode('<#me>', rdflib, {}, 'http://example.org/card');
    expect(node.value).toBe('http://example.org/card#me');
  });

  test('http:// URI is not treated as CURIE', () => {
    const node = triplePatternTermToNode('<http://example.org/test>', rdflib);
    expect(node.value).toBe('http://example.org/test');
  });
});

// ── parsePatternParts ─────────────────────────────────────────────────────────

describe('parsePatternParts', () => {
  test('all named variables → [null, null, null]', () => {
    const [s, p, o] = parsePatternParts('?s ?p ?o', rdflib);
    expect(s).toBeNull();
    expect(p).toBeNull();
    expect(o).toBeNull();
  });

  test('bare "?" in any position throws', () => {
    expect(() => parsePatternParts('? ? ?', rdflib)).toThrow();
  });

  test('subject CURIE, wildcard predicate, wildcard object', () => {
    const [s, p, o] = parsePatternParts('foaf:Person ?p ?o', rdflib);
    expect(s.value).toBe('http://xmlns.com/foaf/0.1/Person');
    expect(p).toBeNull();
    expect(o).toBeNull();
  });

  test('unquoted multi-word object throws (too many tokens)', () => {
    expect(() => parsePatternParts('?s foaf:name john w. smith', rdflib)).toThrow();
  });

  test('unquoted single-word object throws', () => {
    expect(() => parsePatternParts('?s foaf:name alice', rdflib)).toThrow();
  });

  test('quoted multi-word literal is a single object', () => {
    const [, , o] = parsePatternParts('?s foaf:name "john w. smith"', rdflib);
    expect(o.termType).toBe('Literal');
    expect(o.value).toBe('john w. smith');
  });

  test('quoted literal object', () => {
    const [, , o] = parsePatternParts('?s foaf:name "Alice"', rdflib);
    expect(o.termType).toBe('Literal');
    expect(o.value).toBe('Alice');
  });

  test('<uri> object', () => {
    const [, , o] = parsePatternParts('?s ?p <http://example.org/x>', rdflib);
    expect(o.value).toBe('http://example.org/x');
  });

  test('#fragment subject uses baseUri', () => {
    const [s] = parsePatternParts('#me ?p ?o', rdflib, {}, 'http://example.org/card');
    expect(s.value).toBe('http://example.org/card#me');
  });

  test('throws with < 3 parts', () => {
    expect(() => parsePatternParts('?s foaf:name', rdflib)).toThrow();
  });

  test('throws with > 3 parts (unquoted)', () => {
    expect(() => parsePatternParts('?s ?p ?o ?extra', rdflib)).toThrow();
  });
});

// ── matchStore ────────────────────────────────────────────────────────────────

describe('matchStore', () => {
  function makeStore() {
    const store = rdflib.graph();
    store.add(rdflib.sym('http://ex/Alice'), rdflib.sym('http://xmlns.com/foaf/0.1/name'), rdflib.literal('Alice'));
    store.add(rdflib.sym('http://ex/Alice'), rdflib.sym('http://xmlns.com/foaf/0.1/age'),  rdflib.literal('30'));
    store.add(rdflib.sym('http://ex/Bob'),   rdflib.sym('http://xmlns.com/foaf/0.1/name'), rdflib.literal('Bob'));
    return store;
  }

  test('wildcard subject returns all rows with s column', () => {
    const store = makeStore();
    const result = matchStore(store, null, rdflib.sym('http://xmlns.com/foaf/0.1/name'), null);
    expect(result.vars).toContain('s');
    expect(result.vars).toContain('o');
    expect(result.results).toHaveLength(2);
  });

  test('bound subject returns only its triples', () => {
    const store = makeStore();
    const result = matchStore(store, rdflib.sym('http://ex/Alice'), null, null);
    expect(result.results).toHaveLength(2);
    expect(result.vars).toContain('p');
    expect(result.vars).toContain('o');
  });

  test('bound predicate and object returns matching subject', () => {
    const store = makeStore();
    const result = matchStore(store, null, rdflib.sym('http://xmlns.com/foaf/0.1/name'), rdflib.literal('Bob'));
    expect(result.results).toHaveLength(1);
    expect(result.results[0].s.value).toBe('http://ex/Bob');
  });

  test('no matches returns empty results', () => {
    const store = makeStore();
    const result = matchStore(store, rdflib.sym('http://ex/Nobody'), null, null);
    expect(result.results).toHaveLength(0);
  });

  test('all bound → all three columns returned', () => {
    const store = makeStore();
    const result = matchStore(
      store,
      rdflib.sym('http://ex/Alice'),
      rdflib.sym('http://xmlns.com/foaf/0.1/name'),
      rdflib.literal('Alice')
    );
    expect(result.results).toHaveLength(1);
    expect(result.vars).toEqual(expect.arrayContaining(['s', 'p', 'o']));
  });
});

// ── expandBnodes column-drop ──────────────────────────────────────────────────

describe('expandBnodes', () => {
  test('drops column where every value is a blank node', () => {
    const store = rdflib.graph();
    const data = {
      vars: ['s', 'p'],
      results: [
        { s: { type: 'bnode', value: 'b0', _term: rdflib.blankNode('b0') }, p: { type: 'uri', value: 'http://ex/p' } },
        { s: { type: 'bnode', value: 'b1', _term: rdflib.blankNode('b1') }, p: { type: 'uri', value: 'http://ex/q' } },
      ],
    };
    const result = expandBnodes(store, data);
    expect(result.vars).not.toContain('s');
    expect(result.vars).toContain('p');
  });

  test('keeps column when only some values are blank nodes', () => {
    const store = rdflib.graph();
    const data = {
      vars: ['s'],
      results: [
        { s: { type: 'bnode', value: 'b0', _term: rdflib.blankNode('b0') } },
        { s: { type: 'uri',   value: 'http://ex/x' } },
      ],
    };
    const result = expandBnodes(store, data);
    expect(result.vars).toContain('s');
  });

  test('bnode object in non-s/p column becomes modal cell', () => {
    const store = rdflib.graph();
    const bn = rdflib.blankNode('b0');
    store.add(bn, rdflib.sym('http://ex/p'), rdflib.literal('val'));
    // The column needs a non-bnode value too — an all-bnode column is
    // dropped outright before the modal-cell conversion can run.
    const data = {
      vars: ['o'],
      results: [
        { o: { type: 'bnode',   value: 'b0', _term: bn } },
        { o: { type: 'literal', value: 'plain' } },
      ],
    };
    const result = expandBnodes(store, data);
    expect(result.results[0].o.type).toBe('bnode');
    expect(result.results[0].o._data).toBeDefined();
    // _data is itself a W3C envelope ({head:{vars}, results:{bindings}});
    // the outer flatten() shim does not recurse into it.
    expect(result.results[0].o._data.head.vars).toEqual(['p', 'o']);
    expect(result.results[1].o.type).toBe('literal');   // non-bnode cell untouched
  });
});

// ── triplePatternTermToNode: extra coverage ─────────────────────────────────

describe('triplePatternTermToNode — extra coverage', () => {
  test('empty string throws', () => {
    expect(() => triplePatternTermToNode('', rdflib)).toThrow(/empty/);
  });

  test('"literal"^^<datatype> returns typed Literal', () => {
    const node = triplePatternTermToNode('"42"^^<http://www.w3.org/2001/XMLSchema#integer>', rdflib);
    expect(node.termType).toBe('Literal');
    expect(node.value).toBe('42');
  });

  test('unterminated literal throws', () => {
    expect(() => triplePatternTermToNode('"oops', rdflib)).toThrow(/Malformed literal/);
  });

  test('malformed literal with trailing junk throws', () => {
    expect(() => triplePatternTermToNode('"x"junk', rdflib)).toThrow(/Malformed literal/);
  });

  test('malformed @lang (empty) throws', () => {
    expect(() => triplePatternTermToNode('"x"@', rdflib)).toThrow(/Malformed literal/);
  });

  test('#fragment without baseUri throws', () => {
    expect(() => triplePatternTermToNode('#me', rdflib)).toThrow(/requires a baseUri/);
  });

  test('CURIE with unknown prefix still resolves to sym(curie)', () => {
    const node = triplePatternTermToNode('unknown:term', rdflib);
    expect(node.termType).toBe('NamedNode');
    expect(node.value).toBe('unknown:term');
  });

  test('numbers throw (no bare literals)', () => {
    expect(() => triplePatternTermToNode('42', rdflib)).toThrow();
  });

  test('extraPrefixes feed CURIE expansion', () => {
    const node = triplePatternTermToNode('ex:alice', rdflib, { ex: 'http://example.org/' });
    expect(node.value).toBe('http://example.org/alice');
  });

  test('miniTermToNode alias still works', () => {
    expect(miniTermToNode).toBe(triplePatternTermToNode);
    const node = miniTermToNode('?x', rdflib);
    expect(node).toBeNull();
  });
});

// ── parsePatternParts: extra coverage ────────────────────────────────────────

describe('parsePatternParts — extra coverage', () => {
  test('empty input throws (0 parts)', () => {
    expect(() => parsePatternParts('', rdflib)).toThrow(/got 0/);
  });

  test('whitespace-only input throws', () => {
    expect(() => parsePatternParts('   \t ', rdflib)).toThrow(/got 0/);
  });

  test('single token throws', () => {
    expect(() => parsePatternParts('?s', rdflib)).toThrow(/got 1/);
  });

  test('extra whitespace between tokens is tolerated', () => {
    const [s, p, o] = parsePatternParts('  ?s   ?p    ?o  ', rdflib);
    expect(s).toBeNull();
    expect(p).toBeNull();
    expect(o).toBeNull();
  });

  test('literal with @lang survives tokenization', () => {
    const [, , o] = parsePatternParts('?s foaf:name "Alice"@en', rdflib);
    expect(o.termType).toBe('Literal');
    expect(o.value).toBe('Alice');
    expect(o.language).toBe('en');
  });

  test('typed literal with ^^<datatype> survives tokenization', () => {
    const [, , o] = parsePatternParts('?s ex:age "42"^^<http://www.w3.org/2001/XMLSchema#integer>',
      rdflib, { ex: 'http://example.org/' });
    expect(o.termType).toBe('Literal');
    expect(o.value).toBe('42');
  });

  test('<#frag> subject resolves against baseUri', () => {
    const [s] = parsePatternParts('<#me> ?p ?o', rdflib, {}, 'http://example.org/card');
    expect(s.termType).toBe('NamedNode');
    expect(s.value).toBe('http://example.org/card#me');
  });

  test('unterminated literal throws', () => {
    expect(() => parsePatternParts('?s ?p "no-closing-quote', rdflib)).toThrow(/Unterminated/);
  });

  test('variable with invalid name in any slot throws', () => {
    expect(() => parsePatternParts('?1bad ?p ?o', rdflib)).toThrow(/Invalid variable/);
  });
});

// ── TriplePatternParser (SPARQL serializer) ─────────────────────────────────

describe('TriplePatternParser', () => {
  const p = new TriplePatternParser('http://example.org');

  test('produces SELECT * WHERE { s p o }', () => {
    expect(p.parse('?s ?p ?o')).toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  test('preserves <uri> terms', () => {
    expect(p.parse('<http://ex/a> ?p ?o'))
      .toBe('SELECT * WHERE { <http://ex/a> ?p ?o }');
  });

  test('preserves CURIE terms verbatim', () => {
    expect(p.parse('?s foaf:name ?o'))
      .toBe('SELECT * WHERE { ?s foaf:name ?o }');
  });

  test('preserves quoted literal', () => {
    expect(p.parse('?s foaf:name "Alice"'))
      .toBe('SELECT * WHERE { ?s foaf:name "Alice" }');
  });

  test('preserves @lang literal', () => {
    expect(p.parse('?s foaf:name "Alice"@en'))
      .toBe('SELECT * WHERE { ?s foaf:name "Alice"@en }');
  });

  test('preserves typed literal', () => {
    expect(p.parse('?s ex:age "42"^^<http://www.w3.org/2001/XMLSchema#integer>'))
      .toBe('SELECT * WHERE { ?s ex:age "42"^^<http://www.w3.org/2001/XMLSchema#integer> }');
  });

  test('bare "?" throws', () => {
    expect(() => p.parse('? ? ?')).toThrow(/named variable/);
  });

  test('invalid variable name throws', () => {
    expect(() => p.parse('?1x ?p ?o')).toThrow(/Invalid variable/);
  });

  test('bare word throws', () => {
    expect(() => p.parse('alice ?p ?o')).toThrow(/Unrecognized term/);
  });

  test('wrong arity throws', () => {
    expect(() => p.parse('?s ?p')).toThrow(/exactly 3 parts/);
    expect(() => p.parse('?s ?p ?o ?extra')).toThrow(/exactly 3 parts/);
  });

  test('malformed @lang (empty) throws', () => {
    expect(() => p.parse('?s ?p "x"@')).toThrow(/Malformed literal/);
  });

  test('MiniQueryParser back-compat alias', () => {
    expect(MiniQueryParser).toBe(TriplePatternParser);
  });
});

// ── TriplePatternValidator ──────────────────────────────────────────────────

describe('TriplePatternValidator', () => {
  test('accepts valid three-part pattern', () => {
    expect(TriplePatternValidator.validate('?s ?p ?o')).toEqual({ valid: true });
  });

  test('accepts CURIE/literal combinations', () => {
    expect(TriplePatternValidator.validate('?s foaf:name "Alice"'))
      .toEqual({ valid: true });
  });

  test('rejects null', () => {
    const r = TriplePatternValidator.validate(null);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/non-empty string/);
  });

  test('rejects non-string (number)', () => {
    const r = TriplePatternValidator.validate(42);
    expect(r.valid).toBe(false);
  });

  test('rejects empty string', () => {
    const r = TriplePatternValidator.validate('');
    expect(r.valid).toBe(false);
  });

  test('rejects wrong arity (2 parts)', () => {
    const r = TriplePatternValidator.validate('?s ?p');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/exactly 3 parts|got 2/);
  });

  test('rejects wrong arity (4 parts)', () => {
    const r = TriplePatternValidator.validate('?s ?p ?o ?x');
    expect(r.valid).toBe(false);
  });

  test('rejects bare "?"', () => {
    const r = TriplePatternValidator.validate('? ? ?');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/named variable/);
  });

  test('rejects unquoted literal', () => {
    const r = TriplePatternValidator.validate('?s foaf:name Alice');
    expect(r.valid).toBe(false);
  });

  test('rejects invalid variable name', () => {
    const r = TriplePatternValidator.validate('?1x ?p ?o');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Invalid variable/);
  });

  test('rejects unterminated literal', () => {
    const r = TriplePatternValidator.validate('?s ?p "unterm');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Unterminated/);
  });

  test('accepts @lang literal', () => {
    expect(TriplePatternValidator.validate('?s ?p "hi"@en')).toEqual({ valid: true });
  });

  test('accepts typed literal', () => {
    expect(TriplePatternValidator.validate(
      '?s ?p "42"^^<http://www.w3.org/2001/XMLSchema#integer>'
    )).toEqual({ valid: true });
  });

  test('getHelpMessage returns non-empty string with examples', () => {
    const help = TriplePatternValidator.getHelpMessage();
    expect(typeof help).toBe('string');
    expect(help).toMatch(/subject predicate object/i);
    expect(help).toMatch(/\?name|Named variable/);
  });

  test('MiniQueryValidator back-compat alias', () => {
    expect(MiniQueryValidator).toBe(TriplePatternValidator);
  });
});

// ── KNOWN_PREFIXES ────────────────────────────────────────────────────────────

describe('KNOWN_PREFIXES', () => {
  const required = ['rdf','rdfs','owl','foaf','schema','skos','ldp','solid','vcard','dct'];
  required.forEach(prefix => {
    test(`includes ${prefix}`, () => {
      expect(KNOWN_PREFIXES[prefix]).toBeDefined();
      expect(KNOWN_PREFIXES[prefix]).toMatch(/^https?:\/\//);
    });
  });
});
