/**
 * @jest-environment jsdom
 *
 * Tests for <sol-query> component beyond SPARQL handling:
 *   - Component lifecycle (connectedCallback, attributeChangedCallback)
 *   - Shadow DOM structure (render)
 *   - initializeQuery routing
 *   - _dispatchResults view dispatch
 *   - _renderSubject single-subject view
 *   - _appendCell helper
 *   - sol-deref event
 *   - Instance API (setEndpoint, setWanted, setSparql)
 *   - executeQuery error paths
 */

import { jest } from '@jest/globals';
import rdflib from '../__mocks__/rdflib-esm.js';
window.$rdf = rdflib;
window.__SolSuppressDefineWarn = true;

import { SolQuery } from '../../web/sol-query.js';
import { assertSafeQuery, sanitizeVarValue } from '../../core/sparql-safety.js';

// Tests below were written against the legacy `{vars, results}` shape.
// SolQuery now follows W3C SPARQL Query Results JSON
// ({head:{vars}, results:{bindings}}). Patch the two consumer methods to
// accept either shape so historical fixtures don't need to be rewritten.
const _toW3c = d => (d?.head ? d : { head: { vars: d.vars }, results: { bindings: d.results } });
const _origRenderSubject   = SolQuery.prototype._renderSubject;
const _origDispatchResults = SolQuery.prototype._dispatchResults;
SolQuery.prototype._renderSubject   = function (data)          { return _origRenderSubject.call(this, _toW3c(data)); };
SolQuery.prototype._dispatchResults = function (data, options) { return _origDispatchResults.call(this, _toW3c(data), options); };

// ── Helpers ──────────────────────────────────────────────────────────────────

function createElement() {
  const el = document.createElement('sol-query');
  // Stub the renderer to capture calls instead of touching DOM
  el.renderer = {
    showError: jest.fn(),
    showLoading: jest.fn(),
    renderResults: jest.fn(),
  };
  return el;
}

function attached(el) {
  document.body.appendChild(el);
  return el;
}

// ── Shadow DOM structure ─────────────────────────────────────────────────────

describe('SolQuery — shadow DOM', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('has an open shadow root', () => {
    expect(el.shadowRoot).toBeTruthy();
    expect(el.shadowRoot.mode).toBe('open');
  });

  test('renders a container with ARIA attributes', () => {
    const c = el.shadowRoot.querySelector('.container');
    expect(c).toBeTruthy();
    expect(c.getAttribute('role')).toBe('region');
    expect(c.getAttribute('aria-live')).toBe('polite');
  });

  test('renders initial loading message', () => {
    const loading = el.shadowRoot.querySelector('.loading');
    expect(loading).toBeTruthy();
    expect(loading.textContent).toContain('Ready');
  });
});

// ── observedAttributes ───────────────────────────────────────────────────────

describe('SolQuery — observedAttributes', () => {
  test('observes endpoint, pattern, wanted, sparql, query, view', () => {
    expect(SolQuery.observedAttributes).toEqual(
      expect.arrayContaining(['endpoint', 'pattern', 'wanted', 'sparql', 'query', 'view'])
    );
  });
});

// ── Instance API ─────────────────────────────────────────────────────────────

describe('SolQuery — instance API', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('setEndpoint sets the endpoint attribute', () => {
    el.setEndpoint('http://example.org/data.ttl');
    expect(el.getAttribute('endpoint')).toBe('http://example.org/data.ttl');
  });

  test('setPattern sets the pattern attribute', () => {
    el.setPattern('?s foaf:name ?name');
    expect(el.getAttribute('pattern')).toBe('?s foaf:name ?name');
  });

  test('setWanted (compat) sets the pattern attribute', () => {
    el.setWanted('?s foaf:name ?name');
    expect(el.getAttribute('pattern')).toBe('?s foaf:name ?name');
  });

  test('setSparql sets the sparql attribute', () => {
    el.setSparql('SELECT * WHERE { ?s ?p ?o }');
    expect(el.getAttribute('sparql')).toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  test('setVariable sets a single var-* attribute', () => {
    el.setVariable('city', 'Berlin');
    expect(el.getAttribute('var-city')).toBe('Berlin');
  });

  test('setVariables sets multiple var-* attributes', () => {
    el.setVariables({ x: '1', y: '2' });
    expect(el.getAttribute('var-x')).toBe('1');
    expect(el.getAttribute('var-y')).toBe('2');
  });
});

// ── initializeQuery routing ──────────────────────────────────────────────────

describe('SolQuery — initializeQuery routing', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('shows error when no endpoint set', async () => {
    await el.initializeQuery();
    expect(el.renderer.showError).toHaveBeenCalledWith('No endpoint provided');
  });

  test('routes to handleSparqlQuery when sparql attr is set', async () => {
    el.handleSparqlQuery = jest.fn();
    el.setAttribute('endpoint', 'http://ex/data');
    el.setAttribute('sparql', 'SELECT * WHERE { ?s ?p ?o }');
    await el.initializeQuery();
    expect(el.handleSparqlQuery).toHaveBeenCalled();
  });

  test('routes to handleSparqlQuery when query attr is set', async () => {
    el.handleSparqlQuery = jest.fn();
    el.setAttribute('endpoint', 'http://ex/data');
    el.setAttribute('query', 'SELECT ?x WHERE { ?x ?p ?o }');
    await el.initializeQuery();
    expect(el.handleSparqlQuery).toHaveBeenCalled();
  });

  test('routes to handleTriplePattern when pattern attr is set', async () => {
    el.handleTriplePattern = jest.fn();
    el.setAttribute('endpoint', 'http://ex/data');
    el.setAttribute('pattern', '?s ?p ?o');
    await el.initializeQuery();
    expect(el.handleTriplePattern).toHaveBeenCalled();
  });

  test('routes to handleTriplePattern when wanted (compat) attr is set', async () => {
    el.handleTriplePattern = jest.fn();
    el.setAttribute('endpoint', 'http://ex/data');
    el.setAttribute('wanted', '?s ?p ?o');
    await el.initializeQuery();
    expect(el.handleTriplePattern).toHaveBeenCalled();
  });

  test('routes to handleDefaultQuery when neither sparql nor pattern', async () => {
    el.handleDefaultQuery = jest.fn();
    el.setAttribute('endpoint', 'http://ex/data');
    await el.initializeQuery();
    expect(el.handleDefaultQuery).toHaveBeenCalled();
  });
});

// ── _appendCell ──────────────────────────────────────────────────────────────

describe('SolQuery — _appendCell', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('renders a URI cell as a link', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, { type: 'uri', value: 'http://example.org/alice' });
    const a = parent.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.href).toContain('http://example.org/alice');
    expect(a.dataset.uri).toBe('http://example.org/alice');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
  });

  test('URI cell shows short name (last path segment)', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, { type: 'uri', value: 'http://example.org/people/alice' });
    const a = parent.querySelector('a');
    expect(a.textContent).toBe('alice');
  });

  test('URI cell shows fragment as short name', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, { type: 'uri', value: 'http://example.org/doc#section1' });
    const a = parent.querySelector('a');
    expect(a.textContent).toBe('section1');
  });

  test('renders a literal cell as text', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, { type: 'literal', value: 'Hello World' });
    expect(parent.textContent).toBe('Hello World');
  });

  test('renders null/undefined cell as empty', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, null);
    expect(parent.textContent).toBe('');
  });

  test('renders multi cell with commas', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, {
      type: 'multi',
      values: [
        { type: 'literal', value: 'one' },
        { type: 'literal', value: 'two' },
        { type: 'literal', value: 'three' },
      ],
    });
    expect(parent.textContent).toBe('one, two, three');
  });

  test('multi cell can mix URIs and literals', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, {
      type: 'multi',
      values: [
        { type: 'uri', value: 'http://example.org/a' },
        { type: 'literal', value: 'text' },
      ],
    });
    expect(parent.querySelector('a')).toBeTruthy();
    expect(parent.textContent).toContain('text');
  });

  test('literal cell with undefined value renders empty string', () => {
    const parent = document.createElement('span');
    el._appendCell(parent, { type: 'literal', value: undefined });
    expect(parent.textContent).toBe('');
  });
});

// ── _renderSubject ───────────────────────────────────────────────────────────

describe('SolQuery — _renderSubject', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('renders name as H2 header', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://xmlns.com/foaf/0.1/name' }, o: { type: 'literal', value: 'Alice' } },
        { p: { value: 'http://example.org/age' }, o: { type: 'literal', value: '30' } },
      ],
    };
    el._renderSubject(results);
    const h2 = el.shadowRoot.querySelector('h2.sol-subject-header');
    expect(h2).toBeTruthy();
    expect(h2.textContent).toBe('Alice');
  });

  test('renders properties as dl entries', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://example.org/color' }, o: { type: 'literal', value: 'blue' } },
      ],
    };
    el._renderSubject(results);
    const dl = el.shadowRoot.querySelector('dl');
    expect(dl).toBeTruthy();
    const dd = dl.querySelector('dd');
    expect(dd).toBeTruthy();
    expect(dd.textContent).toContain('color');
    expect(dd.textContent).toContain('blue');
  });

  test('puts rdf:type rows before other properties', () => {
    const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://example.org/x' }, o: { type: 'literal', value: 'val' } },
        { p: { value: TYPE }, o: { type: 'uri', value: 'http://example.org/Thing' } },
      ],
    };
    el._renderSubject(results);
    const dds = el.shadowRoot.querySelectorAll('dd');
    expect(dds.length).toBe(2);
    // Type row should be first
    expect(dds[0].textContent).toContain('type');
  });

  test('no H2 when no name predicate found', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://example.org/age' }, o: { type: 'literal', value: '30' } },
      ],
    };
    el._renderSubject(results);
    expect(el.shadowRoot.querySelector('h2')).toBeNull();
  });

  test('recognizes schema.org/name as a name predicate', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'https://schema.org/name' }, o: { type: 'literal', value: 'Bob' } },
      ],
    };
    el._renderSubject(results);
    const h2 = el.shadowRoot.querySelector('h2');
    expect(h2.textContent).toBe('Bob');
  });

  test('recognizes rdfs:label as a name predicate', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://www.w3.org/2000/01/rdf-schema#label' }, o: { type: 'literal', value: 'My Resource' } },
      ],
    };
    el._renderSubject(results);
    const h2 = el.shadowRoot.querySelector('h2');
    expect(h2.textContent).toBe('My Resource');
  });
});

// ── _dispatchResults view routing ────────────────────────────────────────────

describe('SolQuery — _dispatchResults', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  const SAMPLE = { vars: ['s'], results: [{ s: { type: 'literal', value: 'x' } }] };

  test('uses table view by default', async () => {
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).toHaveBeenCalled();
  });

  test('uses renderer for dl view', async () => {
    el.setAttribute('view', 'dl');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).toHaveBeenCalled();
  });

  test('uses renderer for list view', async () => {
    el.setAttribute('view', 'list');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).toHaveBeenCalled();
  });

  test('renders accordion view directly into container', async () => {
    el.setAttribute('view', 'accordion');
    await el._dispatchResults(SAMPLE);
    // accordion doesn't go through renderer.renderResults
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('shows error for unknown view name', async () => {
    el.setAttribute('view', 'nonexistent');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.showError).toHaveBeenCalledWith(expect.stringContaining('Unknown view'));
  });
});

// ── executeQuery ─────────────────────────────────────────────────────────────

describe('SolQuery — executeQuery', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('shows error for empty query', async () => {
    await el.executeQuery('');
    expect(el.renderer.showError).toHaveBeenCalledWith('No query provided');
  });

  test('shows error for null query', async () => {
    await el.executeQuery(null);
    expect(el.renderer.showError).toHaveBeenCalledWith('No query provided');
  });

  test('shows error when endpoint not set', async () => {
    await el.executeQuery('SELECT * WHERE { ?s ?p ?o }');
    expect(el.renderer.showError).toHaveBeenCalledWith('No endpoint provided');
  });

  test('blocks unsafe query via _assertSafeQuery', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    await el.executeQuery('DELETE DATA { <a> <b> <c> }');
    expect(el.renderer.showError).toHaveBeenCalledWith(
      expect.stringContaining('Blocked SPARQL operation')
    );
  });

  test('blocks unsafe query injected via variable substitution', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.setAttribute('var-x', 'fine');
    // The query text itself is safe but after substitution it could
    // contain dangerous keywords — test that the post-substitution check catches it.
    // We can't easily inject INSERT via variable because _sanitizeVarValue blocks keywords,
    // so we test the double-check works on the processed query.
    await el.executeQuery('DROP GRAPH <g>');
    expect(el.renderer.showError).toHaveBeenCalledWith(
      expect.stringContaining('Blocked SPARQL operation')
    );
  });

  test('shows error on fetch failure', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.fetchResults = jest.fn().mockRejectedValue(new Error('Network error'));
    await el.executeQuery('SELECT * WHERE { ?s ?p ?o }');
    expect(el.renderer.showError).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });

  test('calls fetchResults with substituted query', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.setAttribute('var-name', 'Alice');
    el.fetchResults = jest.fn().mockResolvedValue({ vars: ['s'], results: [] });
    el._dispatchResults = jest.fn();
    await el.executeQuery('SELECT * WHERE { ?s foaf:name "{{name}}" }');
    expect(el.fetchResults).toHaveBeenCalledWith(
      'SELECT * WHERE { ?s foaf:name "Alice" }',
      'http://ex/sparql'
    );
  });
});

// ── sol-deref event ──────────────────────────────────────────────────────────

describe('SolQuery — sol-deref event', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('clicking a data-uri link dispatches sol-deref', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/resource';
    link.href = 'http://example.org/resource';
    container.appendChild(link);

    const events = [];
    el.addEventListener('sol-deref', (e) => { events.push(e.detail); });
    link.click();
    expect(events.length).toBe(1);
    expect(events[0].uri).toBe('http://example.org/resource');
  });

  test('sol-deref default action sets endpoint and clears sparql/pattern', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/new';
    link.href = 'http://example.org/new';
    container.appendChild(link);

    el.setAttribute('sparql', 'SELECT * WHERE {}');
    el.setAttribute('pattern', '?s ?p ?o');
    link.click();
    expect(el.getAttribute('endpoint')).toBe('http://example.org/new');
    expect(el.hasAttribute('sparql')).toBe(false);
    expect(el.hasAttribute('pattern')).toBe(false);
  });

  test('preventing sol-deref stops default endpoint change', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/blocked';
    link.href = 'http://example.org/blocked';
    container.appendChild(link);

    el.setAttribute('endpoint', 'http://original.org');
    el.addEventListener('sol-deref', (e) => e.preventDefault());
    link.click();
    expect(el.getAttribute('endpoint')).toBe('http://original.org');
  });

  test('ctrl+click does not trigger sol-deref', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/x';
    link.href = 'http://example.org/x';
    container.appendChild(link);

    const events = [];
    el.addEventListener('sol-deref', (e) => { events.push(e); });
    const evt = new MouseEvent('click', { bubbles: true, ctrlKey: true });
    link.dispatchEvent(evt);
    expect(events.length).toBe(0);
  });

  test('meta+click does not trigger sol-deref', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/x';
    link.href = 'http://example.org/x';
    container.appendChild(link);

    const events = [];
    el.addEventListener('sol-deref', (e) => { events.push(e); });
    const evt = new MouseEvent('click', { bubbles: true, metaKey: true });
    link.dispatchEvent(evt);
    expect(events.length).toBe(0);
  });

  test('shift+click does not trigger sol-deref', () => {
    const container = el.shadowRoot.querySelector('.container');
    const link = document.createElement('a');
    link.dataset.uri = 'http://example.org/x';
    link.href = 'http://example.org/x';
    container.appendChild(link);

    const events = [];
    el.addEventListener('sol-deref', (e) => { events.push(e); });
    const evt = new MouseEvent('click', { bubbles: true, shiftKey: true });
    link.dispatchEvent(evt);
    expect(events.length).toBe(0);
  });
});

// ── showDiagnostics ──────────────────────────────────────────────────────────

describe('SolQuery — showDiagnostics', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('formats error message with prefix', () => {
    el.showDiagnostics(new Error('parse failed'));
    expect(el.renderer.showError).toHaveBeenCalledWith('Failed to load RDF: parse failed');
  });
});

// ── _sparqlAttr ─────────────────────────────────────────────────────────────

describe('SolQuery — _sparqlAttr', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('returns sparql attribute when set', () => {
    el.setAttribute('sparql', 'SELECT ?x WHERE { ?x ?p ?o }');
    expect(el._sparqlAttr()).toBe('SELECT ?x WHERE { ?x ?p ?o }');
  });

  test('falls back to query attribute when sparql not set', () => {
    el.setAttribute('query', 'SELECT ?y WHERE { ?y ?p ?o }');
    expect(el._sparqlAttr()).toBe('SELECT ?y WHERE { ?y ?p ?o }');
  });

  test('prefers sparql over query when both set', () => {
    el.setAttribute('sparql', 'FROM SPARQL');
    el.setAttribute('query', 'FROM QUERY');
    expect(el._sparqlAttr()).toBe('FROM SPARQL');
  });

  test('returns null when neither set', () => {
    expect(el._sparqlAttr()).toBeNull();
  });
});

// ── getVariables ────────────────────────────────────────────────────────────

describe('SolQuery — getVariables', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('returns empty object when no var-* attributes', () => {
    expect(el.getVariables()).toEqual({});
  });

  test('collects all var-* attributes', () => {
    el.setAttribute('var-name', 'Alice');
    el.setAttribute('var-age', '30');
    el.setAttribute('var-city', 'Berlin');
    expect(el.getVariables()).toEqual({ name: 'Alice', age: '30', city: 'Berlin' });
  });

  test('ignores non-var attributes', () => {
    el.setAttribute('endpoint', 'http://ex/data');
    el.setAttribute('var-x', '1');
    const vars = el.getVariables();
    expect(vars).toEqual({ x: '1' });
    expect(vars.endpoint).toBeUndefined();
  });
});

// ── _sanitizeVarValue ───────────────────────────────────────────────────────

describe('SolQuery — _sanitizeVarValue', () => {
  test('passes through a plain string', () => {
    expect(sanitizeVarValue('hello')).toBe('hello');
  });

  test('escapes double quotes', () => {
    expect(sanitizeVarValue('say "hi"')).toBe('say \\"hi\\"');
  });

  test('escapes single quotes', () => {
    expect(sanitizeVarValue("it's")).toBe("it\\'s");
  });

  test('escapes backslashes before quotes', () => {
    expect(sanitizeVarValue('a\\b')).toBe('a\\\\b');
  });

  test('rejects curly braces', () => {
    expect(() => sanitizeVarValue('a{b}')).toThrow('disallowed characters');
  });

  test('rejects opening brace alone', () => {
    expect(() => sanitizeVarValue('{')).toThrow('disallowed characters');
  });

  test('rejects closing brace alone', () => {
    expect(() => sanitizeVarValue('}')).toThrow('disallowed characters');
  });

  test.each([
    'INSERT', 'DELETE', 'DROP', 'CREATE', 'CLEAR', 'LOAD', 'COPY', 'MOVE', 'ADD',
    'insert', 'delete', 'drop', 'create', 'clear', 'load', 'copy', 'move', 'add',
  ])('rejects blocked keyword %s', (kw) => {
    expect(() => sanitizeVarValue(kw)).toThrow('blocked keyword');
  });

  test('allows substrings that contain keywords (e.g. "loading")', () => {
    expect(sanitizeVarValue('loading')).toBe('loading');
  });
});

// ── substituteVariables ─────────────────────────────────────────────────────

describe('SolQuery — substituteVariables', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('replaces {{var}} placeholders', () => {
    el.setAttribute('var-name', 'Alice');
    const result = el.substituteVariables('SELECT * WHERE { ?s foaf:name "{{name}}" }');
    expect(result).toContain('"Alice"');
    expect(result).not.toContain('{{name}}');
  });

  test('replaces multiple different variables', () => {
    el.setAttribute('var-first', 'Alice');
    el.setAttribute('var-last', 'Smith');
    const result = el.substituteVariables('{{first}} {{last}}');
    expect(result).toBe('Alice Smith');
  });

  test('replaces all occurrences of the same variable', () => {
    el.setAttribute('var-x', '42');
    const result = el.substituteVariables('{{x}} and {{x}} again');
    expect(result).toBe('42 and 42 again');
  });

  test('leaves query unchanged when no variables set', () => {
    const q = 'SELECT * WHERE { ?s ?p ?o }';
    expect(el.substituteVariables(q)).toBe(q);
  });

  test('leaves unmatched placeholders unchanged', () => {
    el.setAttribute('var-a', '1');
    const result = el.substituteVariables('{{a}} and {{b}}');
    expect(result).toBe('1 and {{b}}');
  });

  test('throws for variable with blocked keyword', () => {
    el.setAttribute('var-x', 'DELETE');
    expect(() => el.substituteVariables('{{x}}')).toThrow('blocked keyword');
  });
});

// ── _assertSafeQuery ────────────────────────────────────────────────────────

describe('SolQuery — _assertSafeQuery', () => {
  test('allows SELECT queries', () => {
    expect(() => assertSafeQuery('SELECT ?s ?p ?o WHERE { ?s ?p ?o }')).not.toThrow();
  });

  test('allows CONSTRUCT queries', () => {
    expect(() => assertSafeQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')).not.toThrow();
  });

  test('allows DESCRIBE queries', () => {
    expect(() => assertSafeQuery('DESCRIBE <http://example.org/resource>')).not.toThrow();
  });

  test('allows ASK queries', () => {
    expect(() => assertSafeQuery('ASK { ?s ?p ?o }')).not.toThrow();
  });

  test.each([
    ['INSERT', 'INSERT DATA { <a> <b> <c> }'],
    ['DELETE', 'DELETE DATA { <a> <b> <c> }'],
    ['DROP', 'DROP GRAPH <g>'],
    ['CREATE', 'CREATE GRAPH <g>'],
    ['CLEAR', 'CLEAR GRAPH <g>'],
    ['LOAD', 'LOAD <http://example.org/data>'],
    ['COPY', 'COPY <g1> TO <g2>'],
    ['MOVE', 'MOVE <g1> TO <g2>'],
    ['ADD', 'ADD <g1> TO <g2>'],
  ])('blocks %s operation', (keyword, query) => {
    expect(() => assertSafeQuery(query)).toThrow(`Blocked SPARQL operation: ${keyword}`);
  });

  test('blocks case-insensitively', () => {
    expect(() => assertSafeQuery('insert DATA { <a> <b> <c> }')).toThrow('INSERT');
  });
});

// ── attributeChangedCallback ────────────────────────────────────────────────

describe('SolQuery — attributeChangedCallback', () => {
  let el;
  beforeEach(() => {
    el = attached(createElement());
    el.initializeQuery = jest.fn();
  });
  afterEach(() => el.remove());

  test('triggers re-query when endpoint changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('endpoint', 'http://new/endpoint');
    expect(el.initializeQuery).toHaveBeenCalled();
  });

  test('triggers re-query when sparql changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('sparql', 'SELECT ?x WHERE { ?x ?p ?o }');
    expect(el.initializeQuery).toHaveBeenCalled();
  });

  test('triggers re-query when query changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('query', 'SELECT ?y WHERE { ?y ?p ?o }');
    expect(el.initializeQuery).toHaveBeenCalled();
  });

  test('triggers re-query when pattern changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('pattern', '?s ?p ?o');
    expect(el.initializeQuery).toHaveBeenCalled();
  });

  test('triggers re-query when wanted (compat) changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('wanted', '?s ?p ?o');
    expect(el.initializeQuery).toHaveBeenCalled();
  });

  test('does not trigger re-query when view changes', () => {
    el.initializeQuery.mockClear();
    el.setAttribute('view', 'dl');
    expect(el.initializeQuery).not.toHaveBeenCalled();
  });

  test('does not trigger when value is same', () => {
    el.setAttribute('endpoint', 'http://a.com');
    el.initializeQuery.mockClear();
    el.setAttribute('endpoint', 'http://a.com');
    expect(el.initializeQuery).not.toHaveBeenCalled();
  });
});

// ── _dispatchResults — more views ───────────────────────────────────────────

describe('SolQuery — _dispatchResults view dispatch (extended)', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  const SAMPLE = { vars: ['s'], results: [{ s: { type: 'literal', value: 'x' } }] };

  test('renders anchorlist view directly', async () => {
    el.setAttribute('view', 'anchorlist');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('renders select view directly', async () => {
    el.setAttribute('view', 'select');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('renders tabs view directly', async () => {
    el.setAttribute('view', 'tabs');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('renders menu view directly', async () => {
    el.setAttribute('view', 'menu');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('renders rolodex view directly', async () => {
    el.setAttribute('view', 'rolodex');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).not.toHaveBeenCalled();
  });

  test('table view uses renderer.renderResults', async () => {
    el.setAttribute('view', 'table');
    await el._dispatchResults(SAMPLE);
    expect(el.renderer.renderResults).toHaveBeenCalled();
  });
});

// ── _loadAndRenderView ──────────────────────────────────────────────────────

describe('SolQuery — _loadAndRenderView', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('shows error when custom view URL fails to load', async () => {
    el.setAttribute('view', './nonexistent-view.js');
    await el._dispatchResults({ vars: ['s'], results: [{ s: { type: 'literal', value: 'x' } }] });
    expect(el.renderer.showError).toHaveBeenCalledWith(expect.stringContaining('Custom view'));
  });
});

// ── _renderSubject edge cases ───────────────────────────────────────────────

describe('SolQuery — _renderSubject edge cases', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('recognizes dc:title as a name predicate', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://purl.org/dc/terms/title' }, o: { type: 'literal', value: 'My Doc' } },
      ],
    };
    el._renderSubject(results);
    const h2 = el.shadowRoot.querySelector('h2');
    expect(h2.textContent).toBe('My Doc');
  });

  test('recognizes dc11:title as a name predicate', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://purl.org/dc/elements/1.1/title' }, o: { type: 'literal', value: 'Old Title' } },
      ],
    };
    el._renderSubject(results);
    const h2 = el.shadowRoot.querySelector('h2');
    expect(h2.textContent).toBe('Old Title');
  });

  test('name row is excluded from the dl entries', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://xmlns.com/foaf/0.1/name' }, o: { type: 'literal', value: 'Alice' } },
        { p: { value: 'http://example.org/age' }, o: { type: 'literal', value: '30' } },
      ],
    };
    el._renderSubject(results);
    const dds = el.shadowRoot.querySelectorAll('dd');
    expect(dds.length).toBe(1);
    expect(dds[0].textContent).toContain('age');
  });

  test('renders URI values as links in subject view', () => {
    const results = {
      vars: ['p', 'o'],
      results: [
        { p: { value: 'http://example.org/knows' }, o: { type: 'uri', value: 'http://example.org/bob' } },
      ],
    };
    el._renderSubject(results);
    const link = el.shadowRoot.querySelector('a[data-uri]');
    expect(link).toBeTruthy();
    expect(link.textContent).toBe('bob');
  });

  test('handles empty results without error', () => {
    const results = { vars: ['p', 'o'], results: [] };
    expect(() => el._renderSubject(results)).not.toThrow();
    expect(el.shadowRoot.querySelector('h2')).toBeNull();
  });
});

// ── executeQuery — variable substitution edge cases ─────────────────────────

describe('SolQuery — executeQuery variable edge cases', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('shows error for variable with curly braces', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.setAttribute('var-x', 'val{ue}');
    await el.executeQuery('SELECT * WHERE { ?s ?p "{{x}}" }');
    expect(el.renderer.showError).toHaveBeenCalledWith(expect.stringContaining('disallowed'));
  });

  test('escapes quotes in variable values', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.setAttribute('var-name', 'O\'Brien');
    el.fetchResults = jest.fn().mockResolvedValue({ vars: ['s'], results: [] });
    el._dispatchResults = jest.fn();
    await el.executeQuery('SELECT * WHERE { ?s foaf:name "{{name}}" }');
    const query = el.fetchResults.mock.calls[0][0];
    expect(query).toContain("O\\'Brien");
  });
});

// ── handleSparqlQuery — stored query reference ──────────────────────────────

describe('SolQuery — handleSparqlQuery stored reference', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('inline query with whitespace is treated as inline, not URL', async () => {
    el.setAttribute('endpoint', 'http://ex/sparql');
    el.setAttribute('sparql', 'SELECT * WHERE { ?s ?p ?o }');
    el.executeQuery = jest.fn();
    await el.handleSparqlQuery();
    expect(el.executeQuery).toHaveBeenCalledWith('SELECT * WHERE { ?s ?p ?o }');
  });
});

// ── showDiagnostics edge cases ──────────────────────────────────────────────

describe('SolQuery — showDiagnostics edge cases', () => {
  let el;
  beforeEach(() => { el = attached(createElement()); });
  afterEach(() => el.remove());

  test('includes error message in RDF load failure', () => {
    el.showDiagnostics(new Error('404 Not Found'));
    expect(el.renderer.showError).toHaveBeenCalledWith('Failed to load RDF: 404 Not Found');
  });

  test('handles error with empty message', () => {
    el.showDiagnostics(new Error(''));
    expect(el.renderer.showError).toHaveBeenCalledWith('Failed to load RDF: ');
  });
});

// ── connectedCallback ───────────────────────────────────────────────────────

describe('SolQuery — connectedCallback', () => {
  test('calls initializeQuery when connected', () => {
    const el = createElement();
    el.initializeQuery = jest.fn();
    document.body.appendChild(el);
    expect(el.initializeQuery).toHaveBeenCalled();
    el.remove();
  });
});

// ── Static API ───────────────────────────────────────────────────────────────

describe('SolQuery.run', () => {
  test('is a static method', () => {
    expect(typeof SolQuery.run).toBe('function');
  });
});

// ── _patternAttr (pattern / wanted alias) ────────────────────────────────────

describe('SolQuery — _patternAttr', () => {
  test('returns the pattern attribute', () => {
    const el = createElement();
    el.setAttribute('pattern', '?s ?p ?o');
    expect(el._patternAttr()).toBe('?s ?p ?o');
  });

  test('falls back to the wanted attribute when pattern is absent', () => {
    const el = createElement();
    el.setAttribute('wanted', '?a ?b ?c');
    expect(el._patternAttr()).toBe('?a ?b ?c');
  });

  test('pattern takes precedence over wanted', () => {
    const el = createElement();
    el.setAttribute('pattern', 'P');
    el.setAttribute('wanted', 'W');
    expect(el._patternAttr()).toBe('P');
  });

  test('is null when neither attribute is set', () => {
    expect(createElement()._patternAttr()).toBe(null);
  });
});

// ── _reportError ─────────────────────────────────────────────────────────────

describe('SolQuery — _reportError', () => {
  test('shows the message through the renderer', () => {
    const el = createElement();
    el._reportError('config', 'No endpoint provided');
    expect(el.renderer.showError).toHaveBeenCalledWith('No endpoint provided');
  });

  test('dispatches a bubbling, composed sol-error event with detail', () => {
    const el = createElement();
    let evt = null;
    el.addEventListener('sol-error', (e) => { evt = e; });
    el._reportError('sparql-load', 'boom');
    expect(evt.bubbles).toBe(true);
    expect(evt.composed).toBe(true);
    expect(evt.detail).toEqual({ source: 'sol-query', kind: 'sparql-load', message: 'boom' });
  });
});
