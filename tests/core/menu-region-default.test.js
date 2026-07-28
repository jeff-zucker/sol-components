/**
 * Menu-level ui:region default (2026-07-20): a ui:region ON THE MENU is the
 * fallback placement for members that carry none of their own. An item's own
 * region (entry triple or `region` attribute pair) always wins; submenus
 * inherit the default until one sets its own. Inherited regions are flagged
 * (regionInherited) so serialization never materializes them onto items.
 *
 * The jest rdflib mock's turtle parser is too naive for these fixtures, so
 * they're parsed with n3 and fed into the mock store term-by-term.
 */
import { Parser } from 'n3';
import { graph, sym, literal, blankNode } from '../__mocks__/rdflib-esm.js';
import { parseMenuItems } from '../../core/menu-rdf.js';
import { updateMenuInStore } from '../../core/menu-serialize.js';

const BASE = 'http://region.test/menu.ttl';

function storeFrom(ttl) {
  const store = graph();
  for (const q of new Parser({ baseIRI: BASE }).parse(ttl)) {
    const term = (t) => t.termType === 'Literal' ? literal(t.value)
      : t.termType === 'BlankNode' ? blankNode(t.value) : sym(t.value);
    store.add(term(q.subject), term(q.predicate), term(q.object));
  }
  return store;
}

const PREFIXES = `
@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
`;

test('members without a region inherit the menu ui:region (flagged inherited)', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region ui:Modal ;
  schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe('modal');
  expect(a.regionInherited).toBe(true);
});

test("an item's own ui:region beats the menu default (not flagged)", () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region ui:Modal ;
  schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; ui:region ui:Tab ; schema:url "https://a.example/" .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe('tab');
  expect(a.regionInherited).toBe(false);
});

test('a region attribute pair beats the menu default', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region ui:Modal ;
  schema:itemListElement :C .
:C a ui:Plugin ; schema:additionalType ui:Component ; ui:label "C" ;
  schema:url <http://region.test/web/sol-thing.js> ;
  schema:additionalProperty [ schema:name "region" ; schema:value "dropdown" ] .
`);
  const [c] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(c.region).toBe('dropdown');
  expect(c.regionInherited).toBe(false);
});

test('submenus inherit the default until one sets its own', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region ui:Modal ;
  schema:itemListElement :Sub, :Own .
:Sub a ui:Menu ; ui:label "Sub" ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
:Own a ui:Menu ; ui:label "Own" ; ui:region ui:Dropdown ; schema:itemListElement :B .
:B a ui:Link ; ui:label "B" ; schema:url "https://b.example/" .
`);
  const items = parseMenuItems(store, sym(BASE + '#Menu'));
  const sub = items.find((i) => i.name === 'Sub');
  const own = items.find((i) => i.name === 'Own');
  expect(sub.children[0].region).toBe('modal');      // inherited through
  expect(sub.children[0].regionInherited).toBe(true);
  expect(own.children[0].region).toBe('dropdown');   // submenu override
  expect(own.children[0].regionInherited).toBe(true); // still a menu default
});

test('no menu default → region stays null', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe(null);
  expect(a.regionInherited).toBe(false);
});

// A ui:region naming a TARGET (a CSS selector for the element items display in)
// is kept verbatim — not fragment-lowercased like a ui:Region KIND — so
// display-target's resolveRegion can safeQuery it (the menu-side alternative to
// a target element claiming items via data-for).
test('a target-selector ui:region passes through verbatim; kinds still tokenize', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region "#dk-menu-pane" ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe('#dk-menu-pane');       // verbatim, keeps the '#'
  expect(a.regionInherited).toBe(true);

  const kinds = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region ui:Modal ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  expect(parseMenuItems(kinds, sym(BASE + '#Menu'))[0].region).toBe('modal');
});

// A ui:region naming a TARGET REGION NODE (the menu→region link as a resource,
// not a selector) resolves to `#<that region's declared id>` — the selector is
// DERIVED from the target node's own schema:additionalProperty "id", never
// stored. This is the shell:MenuPane binding the ☰ menu uses.
test('a target-region node ui:region resolves to the target node\'s #id', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region :Pane ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
:Pane a ui:Layout ; schema:additionalProperty [ schema:name "id" ; schema:value "dk-menu-pane" ] .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe('#dk-menu-pane');   // derived from :Pane's id, not its fragment
  expect(a.regionInherited).toBe(true);
});

// An unresolvable target (no declared id — its doc not loaded / no id property)
// yields no region rather than a bogus selector.
test('a target-region node with no id yields a null region', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; ui:region :Ghost ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  const [a] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(a.region).toBe(null);
});

// Round-trip: a menu-level TARGET region is serialized back as a NODE reference
// (regionRef), keeping the menu→region link a resource — never flattened to the
// derived selector string. A KIND region without a regionRef still writes ui:<Kind>.
const UI_NS = 'http://www.w3.org/ns/ui#';
test('a regionRef round-trips as a ui:region node reference, not a literal', () => {
  const DOC = 'http://region.test/menu.ttl';
  const TARGET = 'http://region.test/shell.ttl#MenuPane';
  const store = graph();
  updateMenuInStore(store, DOC, DOC + '#More', {
    label: '☰', regionRef: TARGET,
    items: [{ type: 'link', id: 'A', name: 'A', href: 'https://a.example/' }],
  });
  const region = store.any(sym(DOC + '#More'), sym(UI_NS + 'region'));
  expect(region).toBeTruthy();
  expect(region.termType).toBe('NamedNode');   // a node link…
  expect(region.value).toBe(TARGET);           // …to the exact target region
});

test('a KIND region still round-trips as ui:<Kind> when no regionRef is given', () => {
  const DOC = 'http://region.test/menu.ttl';
  const store = graph();
  updateMenuInStore(store, DOC, DOC + '#More', {
    label: '☰', region: 'modal',
    items: [{ type: 'link', id: 'A', name: 'A', href: 'https://a.example/' }],
  });
  const region = store.any(sym(DOC + '#More'), sym(UI_NS + 'region'));
  expect(region.value).toBe(UI_NS + 'Modal');
});

// ui:view — the menu's declared presentation view (a ui:View subclass, e.g.
// ui:Tablist) — round-trips like orientation: parsed to its local name,
// written back as ui:<View>, and never invented for a view-less menu.
test('a submenu ui:view parses to its local name', () => {
  const store = storeFrom(`${PREFIXES}
:Menu a ui:Menu ; ui:label "M" ; schema:itemListElement :Sub .
:Sub a ui:Menu ; ui:label "Sub" ; ui:view ui:Tree ; schema:itemListElement :A .
:A a ui:Link ; ui:label "A" ; schema:url "https://a.example/" .
`);
  const [sub] = parseMenuItems(store, sym(BASE + '#Menu'));
  expect(sub.view).toBe('Tree');
});

test('a menu view serializes as ui:<View>; a view-less menu stays view-less', () => {
  const DOC = 'http://region.test/menu.ttl';
  const store = graph();
  updateMenuInStore(store, DOC, DOC + '#Tabs', {
    label: 'Tabs', view: 'Tablist',
    items: [{ type: 'link', id: 'A', name: 'A', href: 'https://a.example/' }],
  });
  expect(store.any(sym(DOC + '#Tabs'), sym(UI_NS + 'view')).value).toBe(UI_NS + 'Tablist');

  const bare = graph();
  updateMenuInStore(bare, DOC, DOC + '#Plain', {
    label: 'Plain',
    items: [{ type: 'link', id: 'A', name: 'A', href: 'https://a.example/' }],
  });
  expect(bare.any(sym(DOC + '#Plain'), sym(UI_NS + 'view'))).toBeFalsy();
});
