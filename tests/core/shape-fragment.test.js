/**
 * core/shape-to-form.js — naming ONE shape in a multi-shape document.
 *
 * A shape URI carrying a fragment (…/ui.shacl#ToolbarMenuShape) selects that
 * shape outright. Without one the resolver infers, which can only work while
 * each class has a single shape — the fragment is what makes several shapes
 * per class (the menu variants) reachable at all.
 *
 * The fixture uses full IRIs and named property nodes: the rdflib test mock
 * tokenizes neither blank nodes nor lists.
 */

import { jest } from '@jest/globals';
import { parseShape } from '../../core/shape-to-form.js';
import { rdf } from '../../core/rdf.js';

const DOC = 'http://shapes.test/two.shacl';
const SH = 'http://www.w3.org/ns/shacl#';
const EX = 'http://example.test/';

// Two shapes targeting the SAME class — inference alone cannot separate them.
const SHAPES = `
<${DOC}#AlphaShape> a <${SH}NodeShape> ;
  <${SH}targetClass> <${EX}Thing> ;
  <${SH}property> <${DOC}#AlphaProp> .
<${DOC}#AlphaProp> <${SH}path> <${EX}alpha> ; <${SH}name> "alpha" .

<${DOC}#BetaShape> a <${SH}NodeShape> ;
  <${SH}targetClass> <${EX}Thing> ;
  <${SH}property> <${DOC}#BetaProp> .
<${DOC}#BetaProp> <${SH}path> <${EX}beta> ; <${SH}name> "beta" .
`;

const paths = (parsed) => parsed.properties.map((p) => p.path.value);

test('a fragment names the shape to use', async () => {
  expect(paths(await parseShape(SHAPES, `${DOC}#BetaShape`))).toEqual([`${EX}beta`]);
  expect(paths(await parseShape(SHAPES, `${DOC}#AlphaShape`))).toEqual([`${EX}alpha`]);
});

test('the fragment beats inference — same class, different shape', async () => {
  const store = rdf.graph();
  store.add(rdf.sym(`${EX}thing`),
    rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf.sym(`${EX}Thing`));
  const ctx = { subject: rdf.sym(`${EX}thing`), dataStore: store };
  // inference matches the FIRST shape targeting the subject's class…
  expect(paths(await parseShape(SHAPES, DOC, ctx))).toEqual([`${EX}alpha`]);
  // …the fragment overrides it
  expect(paths(await parseShape(SHAPES, `${DOC}#BetaShape`, ctx))).toEqual([`${EX}beta`]);
});

test('no fragment still infers, so every existing caller is unaffected', async () => {
  expect(paths(await parseShape(SHAPES, DOC))).toEqual([`${EX}alpha`]);
});

test('a fragment naming no shape falls back to inference, with a warning', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(paths(await parseShape(SHAPES, `${DOC}#NoSuchShape`))).toEqual([`${EX}alpha`]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('NoSuchShape'));
  warn.mockRestore();
});
