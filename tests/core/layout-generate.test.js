/**
 * core/layout-generate.js — compile a ui:Layout tree into the standalone
 * app page (readable index.html + app.css). Covered here (with inline
 * xhv:role fixtures — the App Builder ships no static preset files):
 *   - a nav + main skeleton → visible from-rdf/module attributes, sol-load
 *     data-components derivation
 *   - componentsBase override reaches both links and the loader tag
 *   - a columns grid → app-grid-N class + generated grid CSS
 *   - a sidebar (complementary → aside) opening into an empty main pane
 *   - foreign (non sol-*) leaf → its own <script type="module"> and no
 *     data-components token
 *   - attribute escaping
 *   - menuSourcesIn / seedAppMenu helpers
 */

import { Parser } from 'n3';
import { rdf } from '../../core/rdf.js';
import {
  generateAppHtml,
  generateLayoutBody,
  generateAppCss,
  parseLayoutTree,
  menuSourcesIn,
  seedAppMenu,
} from '../../core/layout-generate.js';

const BASE = 'http://layout.test/layout.ttl';

// Jest maps rdflib to a minimal mock whose turtle tokenizer has no blank
// nodes, so parse real Turtle with n3 and feed the quads into the mock store
// (term matching is by .value; membership arrives as plain
// schema:itemListElement wrapper triples, the walk path menuMembers handles).
function parseInto(text, base) {
  const g = rdf.graph();
  const conv = (t) =>
    t.termType === 'Literal' ? rdf.literal(t.value)
      : rdf.sym(t.termType === 'BlankNode' ? `_:${t.value}` : t.value);
  for (const q of new Parser({ baseIRI: base }).parse(text)) {
    g.add(conv(q.subject), conv(q.predicate), conv(q.object));
  }
  return g;
}

const PRE = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#> .
`;
const loadTtl = (ttl, base = BASE) =>
  ({ store: parseInto(PRE + ttl, base), layoutNode: rdf.sym(`${base}#Layout`) });

// A nav bar (sol-login) over a main pane holding the app's tabset.
const NAV_MAIN = `
:Layout a ui:Layout ; ui:label "App" ; xhv:role "document" ; ui:orientation ui:Vertical ;
  schema:itemListElement :Layout-Bar, :Layout-Main .
:Bar a ui:Layout ; ui:label "Controls" ; xhv:role "navigation" ; ui:orientation ui:Horizontal ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-chrome-bar" ] ;
  schema:itemListElement :Bar-login .
:login a ui:Component ; ui:label "Sign in" ;
  schema:url </node_modules/sol-components/web/sol-login.js> .
:Main a ui:Layout ; ui:label "Content" ; xhv:role "main" ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-panels" ] ;
  schema:itemListElement :Main-tabs .
:tabs a ui:Component ; ui:label "App" ;
  rdfs:comment "The whole app body: a tabset built from the app's own menu doc" ;
  schema:url </node_modules/sol-components/web/sol-tabs.js> ;
  schema:additionalProperty [ schema:name "keep-alive" ; schema:value "" ] ,
               [ schema:name "from-rdf" ; schema:value "app-menu.ttl#Tabs" ] .
:Layout-Bar a schema:ListItem; schema:item :Bar; schema:position 1.
:Layout-Main a schema:ListItem; schema:item :Main; schema:position 2.
:Bar-login a schema:ListItem; schema:item :login; schema:position 1.
:Main-tabs a schema:ListItem; schema:item :tabs; schema:position 1.
`;

// A header over a two-column widget grid.
const GRID = `
:Layout a ui:Layout ; ui:label "App" ; xhv:role "document" ; ui:orientation ui:Vertical ;
  schema:itemListElement :Layout-Header, :Layout-Main .
:Header a ui:Layout ; ui:label "Header" ; xhv:role "banner" ; ui:orientation ui:Horizontal ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-header" ] ;
  schema:itemListElement :Header-clock .
:clock a ui:Component ; ui:label "Clock" ;
  schema:url </node_modules/sol-components/web/sol-time.js> .
:Main a ui:Layout ; ui:label "Widgets" ; xhv:role "main" ; ui:columns 2 ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-widgets" ] ;
  schema:itemListElement :Main-calendar, :Main-notes .
:calendar a ui:Component ; ui:label "Calendar" ;
  schema:url </node_modules/sol-components/web/sol-calendar.js> .
:notes a ui:Component ; ui:label "Notes" ;
  schema:url </node_modules/sol-components/web/sol-include.js> ;
  schema:additionalProperty [ schema:name "source" ; schema:value "content.html" ] ,
               [ schema:name "trusted" ; schema:value "" ] .
:Layout-Header a schema:ListItem; schema:item :Header; schema:position 1.
:Layout-Main a schema:ListItem; schema:item :Main; schema:position 2.
:Header-clock a schema:ListItem; schema:item :clock; schema:position 1.
:Main-calendar a schema:ListItem; schema:item :calendar; schema:position 1.
:Main-notes a schema:ListItem; schema:item :notes; schema:position 2.
`;

// A sidebar menu opening items into an empty main pane.
const SIDEBAR = `
:Layout a ui:Layout ; ui:label "App" ; xhv:role "document" ; ui:orientation ui:Horizontal ;
  schema:itemListElement :Layout-Side, :Layout-Main .
:Side a ui:Layout ; ui:label "Sidebar" ; xhv:role "complementary" ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-side" ] ;
  schema:itemListElement :Side-menu .
:menu a ui:Component ; ui:label "Menu" ;
  schema:url </node_modules/sol-components/web/sol-menu.js> ;
  schema:additionalProperty [ schema:name "from-rdf" ; schema:value "app-menu.ttl#Menu" ] ,
               [ schema:name "region" ; schema:value ".app-main" ] .
:Main a ui:Layout ; ui:label "Content" ; xhv:role "main" ;
  schema:additionalProperty [ schema:name "class" ; schema:value "app-main" ] .
:Layout-Side a schema:ListItem; schema:item :Side; schema:position 1.
:Layout-Main a schema:ListItem; schema:item :Main; schema:position 2.
:Side-menu a schema:ListItem; schema:item :menu; schema:position 1.
`;

test('a nav + main skeleton emits with visible sources', () => {
  const { store, layoutNode } = loadTtl(NAV_MAIN);
  const html = generateAppHtml({ store, layoutNode, app: { title: 'My App', icon: '🍳' } });

  expect(html).toContain('<nav class="app-chrome-bar app-row" aria-label="Controls">');
  expect(html).toMatch(/<sol-login[\s\S]*?><\/sol-login>/);
  expect(html).toContain('<main class="app-panels app-col" aria-label="Content">');
  expect(html).toMatch(/<sol-tabs[\s\S]*?keep-alive[\s\S]*?from-rdf="app-menu\.ttl#Tabs"[\s\S]*?><\/sol-tabs>/);
  // the leaf's rdfs:comment round-trips as an HTML comment
  expect(html).toContain('<!-- The whole app body: a tabset built from the app\'s own menu doc -->');
  expect(html).toContain('<title>My App</title>');
  // one loader tag; sol-tabs/sol-include are sol-basic, sol-login is extra
  expect(html).toMatch(/sol-load\.js"\n\s+data-components="sol-basic sol-login">/);
  expect(html).toContain('href="/node_modules/sol-components/web/styles/root.css"');
  expect(html).toContain('<link rel="stylesheet" href="app.css">');
  // emoji icon → svg data-URL favicon
  expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
  // body carries the root's structural class
  expect(html).toContain('<body class="app-col">');
});

test('componentsBase override reaches stylesheet and loader', () => {
  const { store, layoutNode } = loadTtl(NAV_MAIN);
  const cdn = 'https://cdn.jsdelivr.net/npm/sol-components@2';
  const html = generateAppHtml({ store, layoutNode, componentsBase: cdn });
  expect(html).toContain(`href="${cdn}/web/styles/root.css"`);
  expect(html).toContain(`src="${cdn}/web/sol-load.js"`);
});

test('a columns grid emits app-grid-2 markup and CSS', () => {
  const { store, layoutNode } = loadTtl(GRID);
  const html = generateAppHtml({ store, layoutNode });
  // :Main (role main) with ui:columns 2 → <main>, grid class
  expect(html).toContain('<main class="app-widgets app-grid-2" aria-label="Widgets">');
  expect(html).toContain('<header class="app-header app-row" aria-label="Header">');
  expect(html).toMatch(/data-components="sol-basic sol-time sol-calendar"/);

  const css = generateAppCss(store, layoutNode);
  expect(css).toContain('.app-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
  // scaffolding: page never scrolls, the pane does
  expect(css).toContain('body { margin: 0; min-height: 100dvh; overflow: hidden;');
  // the text size sits on the ROOT, so the page's rem-sized chrome scales with it
  expect(css).toContain('html { background: var(--bg); color: var(--text); font-size: var(--font-size); }');
  expect(css).toContain('main { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1rem 1.25rem; }');
});

test('sidebar: aside emits, empty main is a placeholder pane', () => {
  const { store, layoutNode } = loadTtl(SIDEBAR);
  const html = generateAppHtml({ store, layoutNode });
  expect(html).toContain('<aside class="app-side app-col" aria-label="Sidebar">');
  expect(html).toMatch(/<sol-menu[\s\S]*?from-rdf="app-menu\.ttl#Menu"[\s\S]*?region="\.app-main"/);
  expect(html).toMatch(/<main class="app-main app-col" aria-label="Content">\s*<\/main>/);
});

test('a foreign (non sol-*) leaf loads via its own visible module script', () => {
  const g = parseInto(`
@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
:Layout a ui:Layout ; schema:itemListElement :Layout-Main .
:Layout-Main a schema:ListItem ; schema:item :Main ; schema:position 1 .
:Main a ui:Layout ; schema:itemListElement :Main-player .
:Main-player a schema:ListItem ; schema:item :player ; schema:position 1 .
:player a ui:Component ; ui:label "Player" ;
  schema:url <https://example.org/dist/ia-player.esm.js> ;
  schema:additionalProperty [ schema:name "source" ; schema:value "lib.ttl" ] .
`, BASE);
  const html = generateAppHtml({ store: g, layoutNode: rdf.sym(`${BASE}#Layout`) });
  expect(html).toContain('<script type="module" src="https://example.org/dist/ia-player.esm.js"></script>');
  expect(html).toMatch(/<ia-player[\s\S]*?source="lib\.ttl"[\s\S]*?><\/ia-player>/);
  expect(html).toMatch(/data-components="sol-basic">/);
});

test('attribute values are escaped in emitted markup', () => {
  const g = parseInto(`
@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
:Layout a ui:Layout ; schema:itemListElement :Layout-Main .
:Layout-Main a schema:ListItem ; schema:item :Main ; schema:position 1 .
:Main a ui:Layout ;
  schema:additionalProperty [ schema:name "aria-label" ; schema:value "Tom & \\"Jerry\\" <3" ] .
`, BASE);
  const html = generateAppHtml({ store: g, layoutNode: rdf.sym(`${BASE}#Layout`) });
  expect(html).toContain('aria-label="Tom &amp; &quot;Jerry&quot; &lt;3"');
});

test('menuSourcesIn finds every from-rdf the layout consumes', () => {
  const navMain = loadTtl(NAV_MAIN);
  expect(menuSourcesIn(parseLayoutTree(navMain.store, navMain.layoutNode)))
    .toEqual(['app-menu.ttl#Tabs']);
  const sidebar = loadTtl(SIDEBAR);
  expect(menuSourcesIn(parseLayoutTree(sidebar.store, sidebar.layoutNode)))
    .toEqual(['app-menu.ttl#Menu']);
});

test('seedAppMenu emits a parseable newborn menu doc', () => {
  const ttl = seedAppMenu({ label: 'Menu', fragment: 'Menu', orientation: 'Vertical' });
  const g = parseInto(ttl, 'http://layout.test/app-menu.ttl');
  const menu = rdf.sym('http://layout.test/app-menu.ttl#Menu');
  const UI = 'http://www.w3.org/ns/ui#';
  expect(g.any(menu, rdf.sym(`${UI}label`)).value).toBe('Menu');
  expect(g.any(menu, rdf.sym(`${UI}orientation`)).value).toBe(`${UI}Vertical`);
  // a newborn menu has NO membership triples yet — members arrive as
  // positioned wrappers when the managers add them
  expect(g.any(menu, rdf.sym('http://schema.org/itemListElement'))).toBeFalsy();
  // no view given → none written; a view given → the ui:view triple
  expect(g.any(menu, rdf.sym(`${UI}view`))).toBeFalsy();
  const viewed = parseInto(seedAppMenu({ label: 'Tabs', fragment: 'Tabs', view: 'Tablist' }),
    'http://layout.test/app-menu.ttl');
  expect(viewed.any(rdf.sym('http://layout.test/app-menu.ttl#Tabs'), rdf.sym(`${UI}view`)).value)
    .toBe(`${UI}Tablist`);
});

// A bare ui:Menu layout member: its declared ui:view picks the mounted
// element; a view-less menu still falls back to the region-role inference;
// a view with no menu renderer warns and falls back the same way.
test('a menu member mounts by its ui:view, with role inference as fallback', () => {
  const VIEWED = `
:Layout a ui:Layout ; ui:label "App" ; xhv:role "document" ;
  schema:itemListElement :Layout-Nav, :Layout-Main .
:Nav a ui:Layout ; ui:label "Nav" ; xhv:role "navigation" ;
  schema:itemListElement :Nav-bar .
:BarMenu a ui:Menu ; ui:label "Bar" ; ui:view ui:Toolbar .
:Main a ui:Layout ; ui:label "Content" ; xhv:role "main" ;
  schema:itemListElement :Main-plain, :Main-deep, :Main-tree .
:PlainMenu a ui:Menu ; ui:label "Plain" .
:DeepMenu a ui:Menu ; ui:label "Deep" ; ui:view ui:Accordion .
:TreeMenu2 a ui:Menu ; ui:label "T" ; ui:view ui:Tree .
:Layout-Nav a schema:ListItem; schema:item :Nav; schema:position 1.
:Layout-Main a schema:ListItem; schema:item :Main; schema:position 2.
:Nav-bar a schema:ListItem; schema:item :BarMenu; schema:position 1.
:Main-plain a schema:ListItem; schema:item :PlainMenu; schema:position 1.
:Main-deep a schema:ListItem; schema:item :DeepMenu; schema:position 2.
:Main-tree a schema:ListItem; schema:item :TreeMenu2; schema:position 3.
`;
  const { store, layoutNode } = loadTtl(VIEWED);
  const warnings = [];
  const html = generateAppHtml({ store, layoutNode, warn: (m) => warnings.push(m) });
  // ui:Toolbar in a navigation region would have inferred sol-menu anyway —
  // the view adds the bar's class; a view-less menu in main keeps sol-tabs
  expect(html).toMatch(/<sol-menu class="app-bar" from-rdf="#BarMenu"><\/sol-menu>/);
  expect(html).toMatch(/<sol-tabs from-rdf="#PlainMenu"><\/sol-tabs>/);
  // ui:Tree mounts sol-menu (the doc's own ui:view drives its presentation)
  expect(html).toMatch(/<sol-menu from-rdf="#TreeMenu2"><\/sol-menu>/);
  // a view with no menu renderer (ui:Accordion): warned, then role fallback
  expect(html).toMatch(/<sol-tabs from-rdf="#DeepMenu"><\/sol-tabs>/);
  expect(warnings.some((m) => m.includes('ui:Accordion'))).toBe(true);
});

// generateLayoutBody — the body FRAGMENT (no <head>/<body>) a host splices into
// its own hand-authored page. Modelled on dk's shell: a nav, a content region
// holding a tabset leaf, and a TRAILING empty region (the ☰-menu landing pane).
describe('generateLayoutBody (fragment for a host page)', () => {
  const SHELL = `
@prefix : <#>.
@prefix schema: <http://schema.org/>.
@prefix ui: <http://www.w3.org/ns/ui#>.
:Shell a ui:Layout ; ui:orientation ui:Vertical ;
  schema:itemListElement
    [ a schema:ListItem ; schema:item :Bar  ; schema:position 1 ] ,
    [ a schema:ListItem ; schema:item :Main ; schema:position 2 ] ,
    [ a schema:ListItem ; schema:item :Pane ; schema:position 3 ] .
:Bar a ui:Layout ; schema:additionalType schema:SiteNavigationElement ;
  schema:additionalProperty [ schema:name "class" ; schema:value "bar" ] ;
  schema:itemListElement [ a schema:ListItem ; schema:item :Mini ; schema:position 1 ] .
:Mini a ui:Component ; schema:url </web/sol-include.js> ;
  schema:additionalProperty [ schema:name "source" ; schema:value "mini.html" ] , [ schema:name "trusted" ; schema:value "" ] .
:Main a ui:Layout ;
  schema:additionalProperty [ schema:name "id" ; schema:value "content" ] ;
  schema:itemListElement [ a schema:ListItem ; schema:item :Tabs ; schema:position 1 ] .
:Tabs a ui:Component ; schema:url </web/sol-tabs.js> ;
  schema:additionalProperty [ schema:name "from-rdf" ; schema:value "menu.ttl#Tabs" ] .
:Pane a ui:Layout ;
  schema:additionalProperty [ schema:name "id" ; schema:value "pane" ] , [ schema:name "hidden" ; schema:value "" ] .
`;
  const body = () => {
    const store = parseInto(SHELL, 'http://shell.test/shell.ttl');
    return generateLayoutBody({ store, layoutNode: rdf.sym('http://shell.test/shell.ttl#Shell') });
  };

  test('returns a fragment — no <body>/<html>/<head>/<!doctype>', () => {
    const out = body();
    expect(out).not.toMatch(/<body|<\/body>|<html|<head|<!doctype/i);
  });

  test('<main> lands on the content region, not the trailing empty pane', () => {
    const out = body();
    expect(out).toMatch(/<main class="app-col" id="content"/);
    // the trailing empty region emits a <div>, NOT a second <main>
    expect(out).toMatch(/<div class="app-col" id="pane" hidden>/);
    expect(out.match(/<main\b/g)).toHaveLength(1);
  });

  test('leaves emit their tag + attributes (sol-tabs from-rdf, sol-include source)', () => {
    const out = body();
    expect(out).toMatch(/<sol-tabs\b[\s\S]*?from-rdf="menu\.ttl#Tabs"[\s\S]*?><\/sol-tabs>/);
    expect(out).toMatch(/<sol-include\b[\s\S]*?source="mini\.html"[\s\S]*?trusted[\s\S]*?><\/sol-include>/);
    expect(out).toMatch(/<nav class="bar app-col"/);
  });
});

// ── ARIA role → element, and member-type dispatch (2026-07-23) ────────────────
describe('ARIA role regions + member-type dispatch', () => {
  const DOC = 'http://role.test/doc';
  const body = (ttl) => generateLayoutBody({
    store: parseInto(`@prefix : <#>.\n@prefix ui: <http://www.w3.org/ns/ui#>.\n@prefix schema: <http://schema.org/>.\n@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#>.\n${ttl}`, DOC),
    layoutNode: rdf.sym(`${DOC}#L`),
    baseUrl: DOC,
    warn: () => {},
  });

  test('the 5 roles map to native elements; role attr dropped as redundant', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement
  [ schema:item :H ; schema:position 1 ], [ schema:item :N ; schema:position 2 ] ,
  [ schema:item :M ; schema:position 3 ], [ schema:item :F ; schema:position 4 ] .
:H a ui:Layout ; xhv:role "banner" .
:N a ui:Layout ; xhv:role "navigation" .
:M a ui:Layout ; xhv:role "main" .
:F a ui:Layout ; xhv:role "contentinfo" .
`);
    expect(out).toMatch(/<header class="app-col">/);
    expect(out).toMatch(/<nav class="app-col">/);
    expect(out).toMatch(/<main class="app-col">/);
    expect(out).toMatch(/<footer class="app-col">/);
    expect(out).not.toMatch(/role="banner"|role="main"|role="navigation"|role="contentinfo"/);
  });

  test('role="region" emits <section> and keeps its aria-label', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :S ; schema:position 1 ] .
:S a ui:Layout ; xhv:role "region" ;
  schema:additionalProperty [ schema:name "aria-label" ; schema:value "Tools" ] .
`);
    expect(out).toMatch(/<section class="app-col" aria-label="Tools">/);
  });

  test('role="region" without a name warns', () => {
    const warnings = [];
    generateLayoutBody({
      store: parseInto(`@prefix : <#>.\n@prefix ui: <http://www.w3.org/ns/ui#>.\n@prefix schema: <http://schema.org/>.\n@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#>.
:L a ui:Layout ; schema:itemListElement [ schema:item :S ; schema:position 1 ] .
:S a ui:Layout ; xhv:role "region" .`, DOC),
      layoutNode: rdf.sym(`${DOC}#L`),
      warn: (m) => warnings.push(m),
    });
    expect(warnings.join(' ')).toMatch(/role="region".*aria-label/);
  });

  test('a role-tagged layout never auto-claims <main> (heuristic retired for it)', () => {
    // Every region is role-tagged → nothing is "unmarked" → no auto-<main>.
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :N ; schema:position 1 ] .
:N a ui:Layout ; xhv:role "navigation" .
`);
    expect(out).toMatch(/<nav\b/);
    expect(out).not.toMatch(/<main\b/);
  });

  test('a ui:Menu member emits a menu component via from-rdf (nav → sol-menu)', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :Nav ; schema:position 1 ] .
:Nav a ui:Layout ; xhv:role "navigation" ;
  schema:itemListElement :Menu .
:Menu a ui:Menu .
`);
    expect(out).toMatch(/<nav class="app-col">/);
    expect(out).toMatch(/<sol-menu from-rdf="#Menu"><\/sol-menu>/);
  });

  test('a ui:Menu outside a navigation region emits a tabset (sol-tabs)', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :Main ; schema:position 1 ] .
:Main a ui:Layout ; xhv:role "main" ;
  schema:itemListElement :Menu .
:Menu a ui:Menu .
`);
    expect(out).toMatch(/<sol-tabs from-rdf="#Menu"><\/sol-tabs>/);
  });

  test('a bare ui:Link member transcludes (relative) / frames (external)', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :A ; schema:position 1 ], [ schema:item :B ; schema:position 2 ] .
:A a ui:Link ; schema:url <local.html> .
:B a ui:Link ; schema:url <https://example.org/ext> .
`);
    expect(out).toMatch(/<sol-include source="local\.html"[\s\S]*?trusted="true"><\/sol-include>/);
    expect(out).toMatch(/<iframe src="https:\/\/example\.org\/ext"><\/iframe>/);
  });

  test('a ui:Plugin of kind ui:Link is treated as a link member', () => {
    const out = body(`
:L a ui:Layout ; schema:itemListElement [ schema:item :P ; schema:position 1 ] .
:P a ui:Plugin ; schema:additionalType ui:Link ; schema:url <p.html> .
`);
    expect(out).toMatch(/<sol-include source="p\.html"/);
  });

  test('a ui:Command member is skipped with a warning', () => {
    const warnings = [];
    const out = generateLayoutBody({
      store: parseInto(`@prefix : <#>.\n@prefix ui: <http://www.w3.org/ns/ui#>.\n@prefix schema: <http://schema.org/>.\n@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#>.
:L a ui:Layout ; schema:itemListElement [ schema:item :C ; schema:position 1 ] .
:C a ui:Command .`, DOC),
      layoutNode: rdf.sym(`${DOC}#L`), warn: (m) => warnings.push(m),
    });
    expect(out).not.toMatch(/:C|ui:Command/);
    expect(warnings.join(' ')).toMatch(/Command.*skipped/);
  });
});
