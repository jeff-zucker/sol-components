/**
 * Layout validation contract (shapes/ui.shacl). Component leaves in a layout are
 * ordinary ui:Component nodes; the layout and menu/plugin shapes now live in one
 * file (ui.shacl), so a single shapes graph covers both.
 *
 * Covered here:
 *   - every layout the App Builder composes (core/layout-compose.js) conforms
 *   - ui:columns outside 1..6 fails
 *   - a ui:Link in layout parts fails (parts are Layout|Component only)
 *   - an app node without ui:layout fails :AppShape
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { composeLayoutTurtle } from '../../core/layout-compose.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const PREFIXES = `
@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
@prefix xhv:    <http://www.w3.org/1999/xhtml/vocab#> .
`;

function parse(text, base = 'http://layout-shacl.test/doc') {
  return new Store(new Parser({ baseIRI: base }).parse(text));
}

// ui.shacl holds the layout + menu/plugin shapes in one graph.
const shapes = new Store();
{
  const f = 'ui.shacl';
  const quads = new Parser({ baseIRI: `http://layout-shacl.test/${f}` })
    .parse(readFileSync(join(root, 'shapes', f), 'utf8'));
  for (const q of quads) shapes.add(q);
}

async function validate(dataText) {
  return await new SHACLValidator(shapes).validate(parse(PREFIXES + dataText));
}

// Every layout the App Builder composes (core/layout-compose.js) must conform:
// each region carries a landmark xhv:role, so a composed doc is a full
// end-to-end check of the vocabulary the configurator emits.
const COMBOS = [
  { sidebars: 'none', menuLocation: 'header', hamburger: true },
  { sidebars: 'left', menuLocation: 'left-sidebar', hamburger: false },
  { sidebars: 'both', footer: true, menuLocation: 'right-sidebar', hamburger: true },
  { sidebars: 'right', menuLocation: 'under-header', footer: true, hamburger: true },
];
for (const cfg of COMBOS) {
  test(`composed layout conforms (${JSON.stringify(cfg)})`, async () => {
    const report = await new SHACLValidator(shapes)
      .validate(parse(composeLayoutTurtle(cfg)));
    const messages = report.results.map((r) => r.message.map((m) => m.value).join('; '));
    expect(messages).toEqual([]);
    expect(report.conforms).toBe(true);
  });
}

test('ui:columns outside 1..6 fails', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:columns 9 .
`);
  expect(report.conforms).toBe(false);
});

test('a ui:Link in layout members CONFORMS — links are now first-class members', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#Layout-L> .
<#Layout-L> a schema:ListItem ; schema:item <#L> ; schema:position 1 .
<#L> a ui:Link ; ui:label "Docs" ; schema:url <https://example.org/> .
`);
  expect(report.conforms).toBe(true);
});

test('a ui:Menu layout member conforms', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#M> .
<#M> a ui:Menu ; ui:label "Nav" .
`);
  expect(report.conforms).toBe(true);
});

test('a wrapper WITHOUT `a schema:ListItem` still conforms (type now optional)', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#W> .
<#W> schema:item <#Sub> ; schema:position 1 .
<#Sub> a ui:Layout ; ui:label "Sub" ; xhv:role "main" .
`);
  const messages = report.results.map((r) => r.message.map((m) => m.value).join('; '));
  expect(messages).toEqual([]);
  expect(report.conforms).toBe(true);
});

test('an app node without ui:layout fails :AppShape', async () => {
  const report = await validate(`
<#app> a schema:WebApplication ; schema:name "My App" .
`);
  expect(report.conforms).toBe(false);
});

test('a full app node conforms', async () => {
  const report = await validate(`
<#app> a schema:WebApplication ;
  schema:name "My App" ;
  ui:icon "🍳" ;
  schema:inLanguage "en" ;
  ui:layout <layout.ttl#Layout> .
`);
  const messages = report.results.map((r) => r.message.map((m) => m.value).join('; '));
  expect(messages).toEqual([]);
  expect(report.conforms).toBe(true);
});

test('an unordered (direct) ui:Component member conforms — no wrapper needed', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#Only> .
<#Only> a ui:Component ; schema:url <https://example.org/sol-tabs.js> .
`);
  const messages = report.results.map((r) => r.message.map((m) => m.value).join('; '));
  expect(messages).toEqual([]);
  expect(report.conforms).toBe(true);
});

test('an unordered (direct) nested ui:Layout member conforms', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#Sub> .
<#Sub> a ui:Layout ; ui:label "Sub" ; xhv:role "main" .
`);
  expect(report.conforms).toBe(true);
});

test('ordered and unordered members mix in one region', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ;
  schema:itemListElement <#Sub> , <#W> .
<#Sub> a ui:Layout ; ui:label "Sub" ; xhv:role "main" .
<#W> a schema:ListItem ; schema:item <#Leaf> ; schema:position 1 .
<#Leaf> a ui:Component ; schema:url <https://example.org/sol-tabs.js> .
`);
  expect(report.conforms).toBe(true);
});

test('a direct ui:Link member conforms — unordered links are allowed', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#L> .
<#L> a ui:Link ; ui:label "Docs" ; schema:url <https://example.org/> .
`);
  expect(report.conforms).toBe(true);
});

test('a member of a non-layout type still fails (e.g. bare ui:Command)', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" ; schema:itemListElement <#Bad> .
<#Bad> a ui:Command ; schema:url <commands.ttl#restart> .
`);
  expect(report.conforms).toBe(false);
});

test('a schema:SoftwareApplication app node conforms (AppShape broadened)', async () => {
  const report = await validate(`
<#app> a schema:SoftwareApplication ;
  schema:name "Data Kitchen" ;
  ui:layout <layout.ttl#Layout> .
`);
  const messages = report.results.map((r) => r.message.map((m) => m.value).join('; '));
  expect(messages).toEqual([]);
  expect(report.conforms).toBe(true);
});

test('a valid xhv:role landmark token conforms', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; ui:label "Main" ; xhv:role "main" .
`);
  expect(report.conforms).toBe(true);
});

test('an out-of-set xhv:role token fails', async () => {
  const report = await validate(`
<#Layout> a ui:Layout ; xhv:role "widget" .
`);
  expect(report.conforms).toBe(false);
});
