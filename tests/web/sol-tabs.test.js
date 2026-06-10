/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://example.org/"}
 *
 * Tests for <sol-tabs>:
 *   - from-rdf loading of the shared ui:Menu RDF shape
 *   - ui:Link (href / contents), ui:Component, ui:orientation
 *   - Nested ui:Menu → a tab whose body is a <sol-tabs variant="sub"> strip
 *   - Fragment-based subject selection + fallback when no fragment
 *   - observedAttributes / attributeChangedCallback
 *   - Declarative anchor API and imperative tabs setter still work
 */

import { jest } from '@jest/globals';
import rdflib from '../__mocks__/rdflib-esm.js';
window.$rdf = rdflib;
window.__SolSuppressDefineWarn = true;

const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SCHEMA = 'http://schema.org/';
const BASE = 'http://example.org/tabs.ttl';

// ── Mock loadRdfStore ───────────────────────────────────────────────────────

let mockStore;
jest.unstable_mockModule('../../core/rdf-utils.js', () => ({
  loadRdfStore: jest.fn(async () => mockStore),
}));

const { SolTabs } = await import('../../web/sol-tabs.js');
// `from-rdf` is now an opt-in capability — install the loader the way the
// web/menu-from-rdf.js add-on does on a real page (rdf-utils is mocked above).
const { loadMenuFromUri } = await import('../../core/menu-rdf.js');
SolTabs.fromRdfLoader = loadMenuFromUri;

// ── Helpers ─────────────────────────────────────────────────────────────────

// #Main → ( #Home #Settings #Table #About )
//   #Home     ui:Link      href + icon
//   #Settings ui:Menu      nested: ( #Light #Dark ) both ui:contents links
//   #Table    ui:Component ui:name "sol-query" + ui:attribute endpoint
//   #About    ui:Component ui:name "sol-query" + ui:attribute pattern
function buildStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#Main'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Main'), s(UI + 'label'), l('main'));

  const b1 = s(BASE + '#_l1');
  const b2 = s(BASE + '#_l2');
  const b3 = s(BASE + '#_l3');
  const b4 = s(BASE + '#_l4');
  store.add(s(BASE + '#Main'), s(UI + 'parts'), b1);
  store.add(b1, s(RDF + 'first'), s(BASE + '#Home'));
  store.add(b1, s(RDF + 'rest'), b2);
  store.add(b2, s(RDF + 'first'), s(BASE + '#Settings'));
  store.add(b2, s(RDF + 'rest'), b3);
  store.add(b3, s(RDF + 'first'), s(BASE + '#Table'));
  store.add(b3, s(RDF + 'rest'), b4);
  store.add(b4, s(RDF + 'first'), s(BASE + '#About'));
  store.add(b4, s(RDF + 'rest'), s(RDF + 'nil'));

  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(UI + 'href'), s('http://example.org/home.html'));
  store.add(s(BASE + '#Home'), s(UI + 'icon'), s('http://example.org/house.svg'));

  store.add(s(BASE + '#Settings'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Settings'), s(UI + 'label'), l('Settings'));
  const sb1 = s(BASE + '#_s1');
  const sb2 = s(BASE + '#_s2');
  store.add(s(BASE + '#Settings'), s(UI + 'parts'), sb1);
  store.add(sb1, s(RDF + 'first'), s(BASE + '#Light'));
  store.add(sb1, s(RDF + 'rest'), sb2);
  store.add(sb2, s(RDF + 'first'), s(BASE + '#Dark'));
  store.add(sb2, s(RDF + 'rest'), s(RDF + 'nil'));

  store.add(s(BASE + '#Light'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Light'), s(UI + 'label'), l('Light'));
  store.add(s(BASE + '#Light'), s(UI + 'contents'), l('light content'));

  store.add(s(BASE + '#Dark'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Dark'), s(UI + 'label'), l('Dark'));
  store.add(s(BASE + '#Dark'), s(UI + 'contents'), l('dark content'));

  store.add(s(BASE + '#Table'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#Table'), s(UI + 'label'), l('Data Table'));
  store.add(s(BASE + '#Table'), s(UI + 'name'), l('sol-query'));
  const attr1 = s(BASE + '#_a1');
  store.add(s(BASE + '#Table'), s(UI + 'attribute'), attr1);
  store.add(attr1, s(SCHEMA + 'name'), l('endpoint'));
  store.add(attr1, s(SCHEMA + 'value'), s('http://example.org/data.ttl'));

  store.add(s(BASE + '#About'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#About'), s(UI + 'label'), l('About'));
  store.add(s(BASE + '#About'), s(UI + 'name'), l('sol-query'));
  const param1 = s(BASE + '#_p1');
  store.add(s(BASE + '#About'), s(UI + 'attribute'), param1);
  store.add(param1, s(SCHEMA + 'name'), l('pattern'));
  store.add(param1, s(SCHEMA + 'value'), l('?s ?p ?o'));

  return store;
}

function attached(el) {
  document.body.appendChild(el);
  return el;
}

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

function tabBar(el)  { return el.querySelector(':scope > .sol-tabs-bar'); }
function tabBtns(el) { return Array.from(tabBar(el).querySelectorAll('button')); }
function content(el) { return el.querySelector(':scope > .sol-tabs-content'); }

afterEach(() => {
  document.body.innerHTML = '';
});

// ── observedAttributes ──────────────────────────────────────────────────────

describe('SolTabs — observedAttributes', () => {
  test('observes from-rdf', () => {
    expect(SolTabs.observedAttributes).toContain('from-rdf');
  });
});

// ── from-rdf loading ────────────────────────────────────────────────────────

describe('SolTabs — from-rdf loading', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('renders one tab button per ui:parts entry', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const labels = tabBtns(el).map(b => b.textContent);
    expect(labels).toEqual(['Home', 'Settings', 'Data Table', 'About']);
  });

  test('first tab is active after load', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    expect(el.activeTab).toBe('Home');
    expect(tabBtns(el)[0].classList.contains('active')).toBe(true);
  });

  test('ui:contents link renders its literal HTML into the body', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('Settings');           // nested menu tab
    const sub = content(el).querySelector('sol-tabs[variant="sub"]');
    expect(sub).toBeTruthy();
    expect(content(sub).textContent).toContain('light content');
  });

  test('ui:href link wraps the URL in sol-include by default', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('Home');
    const embed = content(el).querySelector('.sol-tab-embed');
    expect(embed).toBeTruthy();
    expect(embed.tagName.toLowerCase()).toBe('sol-include');
    expect(embed.getAttribute('source')).toBe('http://example.org/home.html');
    expect(embed.getAttribute('endpoint')).toBe('http://example.org/home.html');
  });

  test('ui:Component part renders the named component with its attributes', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('Data Table');
    const embed = content(el).querySelector('.sol-tab-embed');
    expect(embed.tagName.toLowerCase()).toBe('sol-query');
    expect(embed.getAttribute('endpoint')).toBe('http://example.org/data.ttl');
  });

  test('ui:Component renders the named element with its attributes', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('About');
    const embed = content(el).querySelector('.sol-tab-embed');
    expect(embed.tagName.toLowerCase()).toBe('sol-query');
    expect(embed.getAttribute('pattern')).toBe('?s ?p ?o');
  });
});

// ── nested ui:Menu → sub-tab strip ──────────────────────────────────────────

describe('SolTabs — nested ui:Menu', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('nested menu becomes a single tab, not flattened', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const labels = tabBtns(el).map(b => b.textContent);
    expect(labels).toContain('Settings');
    expect(labels).not.toContain('Light');
    expect(labels).not.toContain('Dark');
  });

  test('selecting the nested tab shows a <sol-tabs variant="sub"> strip', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('Settings');
    const sub = content(el).querySelector('sol-tabs[variant="sub"]');
    expect(sub).toBeTruthy();
    const subLabels = tabBtns(sub).map(b => b.textContent);
    expect(subLabels).toEqual(['Light', 'Dark']);
  });

  test('sub-tab strip switches its own children independently', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.switchTab('Settings');
    const sub = content(el).querySelector('sol-tabs[variant="sub"]');
    sub.switchTab('Dark');
    expect(content(sub).textContent).toContain('dark content');
  });
});

// ── ui:orientation ──────────────────────────────────────────────────────────

describe('SolTabs — from-rdf with ui:orientation', () => {
  test('applies ui:orientation from the menu root', async () => {
    mockStore = buildStore();
    mockStore.add(rdflib.sym(BASE + '#Main'),
      rdflib.sym(UI + 'orientation'), rdflib.literal('vertical'));

    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    expect(el.getAttribute('orientation')).toBe('vertical');
  });

  test('an explicit orientation attribute is not overridden', async () => {
    mockStore = buildStore();
    mockStore.add(rdflib.sym(BASE + '#Main'),
      rdflib.sym(UI + 'orientation'), rdflib.literal('vertical'));

    const el = document.createElement('sol-tabs');
    el.setAttribute('orientation', 'horizontal');
    el.setAttribute('from-rdf', BASE + '#Main');
    attached(el);
    await flush();

    expect(el.getAttribute('orientation')).toBe('horizontal');
  });
});

// ── fragment fallback ───────────────────────────────────────────────────────

describe('SolTabs — from-rdf without fragment', () => {
  test('finds the ui:Menu by type when no fragment is given', async () => {
    mockStore = buildStore();
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE);
    await flush();

    expect(tabBtns(el).map(b => b.textContent)).toContain('Home');
  });
});

// ── attributeChangedCallback ────────────────────────────────────────────────

describe('SolTabs — attributeChangedCallback', () => {
  test('reloads tabs when from-rdf changes', async () => {
    mockStore = buildStore();
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(tabBtns(el).length).toBe(4);

    // Swap in a smaller menu document.
    const store2 = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    const B2 = 'http://example.org/other.ttl';
    store2.add(s(B2 + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    const lb = s(B2 + '#_lb1');
    store2.add(s(B2 + '#M'), s(UI + 'parts'), lb);
    store2.add(lb, s(RDF + 'first'), s(B2 + '#One'));
    store2.add(lb, s(RDF + 'rest'), s(RDF + 'nil'));
    store2.add(s(B2 + '#One'), s(RDF + 'type'), s(UI + 'Link'));
    store2.add(s(B2 + '#One'), s(UI + 'label'), l('Only'));
    store2.add(s(B2 + '#One'), s(UI + 'contents'), l('only content'));
    mockStore = store2;

    el.setAttribute('from-rdf', B2 + '#M');
    await flush();
    expect(el.activeTab).toBe('Only');
  });
});

// ── sol-tab-change event ────────────────────────────────────────────────────

describe('SolTabs — sol-tab-change event', () => {
  test('switching an RDF-built tab fires sol-tab-change', async () => {
    mockStore = buildStore();
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    let detail = null;
    el.addEventListener('sol-tab-change', (e) => { detail = e.detail; });
    el.switchTab('About');
    expect(detail).toEqual({ name: 'About' });
  });
});

// ── declarative / imperative APIs still work ────────────────────────────────

describe('SolTabs — declarative and imperative APIs', () => {
  test('declarative anchors still build tabs', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="a.md">Alpha</a><a href="b.md">Beta</a>';
    attached(el);
    expect(tabBtns(el).map(b => b.textContent)).toEqual(['Alpha', 'Beta']);
  });

  test('imperative tabs setter still works', () => {
    const el = attached(document.createElement('sol-tabs'));
    el.tabs = [
      { name: 'X', render: (b) => { b.textContent = 'x-body'; } },
      { name: 'Y', render: (b) => { b.textContent = 'y-body'; } },
    ];
    el.switchTab('Y');
    expect(content(el).textContent).toBe('y-body');
  });

  test('data-* anchor attrs: data-handler picks the tag, data-* forward with prefix stripped', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="lib.ttl" id="panel-music" data-handler="ia-player"'
      + ' data-src="lib.ttl" data-storage-ns="music" data-favourites-only data-defer>Music</a>';
    attached(el);
    el.switchTab('Music');
    const embed = content(el).querySelector('.sol-tab-embed');
    expect(embed).toBeTruthy();
    expect(embed.tagName.toLowerCase()).toBe('ia-player');     // data-handler → tag
    expect(embed.id).toBe('panel-music');                      // plain id passes through
    expect(embed.getAttribute('src')).toBe('lib.ttl');         // data-src → src
    expect(embed.getAttribute('storage-ns')).toBe('music');    // data-storage-ns → storage-ns
    expect(embed.hasAttribute('favourites-only')).toBe(true);  // boolean data-* → boolean
    expect(embed.hasAttribute('defer')).toBe(true);
    expect(embed.getAttribute('source')).toBe('lib.ttl');      // href still → source/endpoint
    expect(embed.hasAttribute('data-src')).toBe(false);        // no stale data-* left on the element
  });

  test('non-reserved anchor attrs (no data- prefix) forward verbatim', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="x.md" data-handler="sol-include" foo="bar">X</a>';
    attached(el);
    el.switchTab('X');
    const embed = content(el).querySelector('.sol-tab-embed');
    expect(embed.tagName.toLowerCase()).toBe('sol-include');
    expect(embed.getAttribute('foo')).toBe('bar');
  });

  test('declarative bare data-handler is a command: dispatches sol-command into the pane', () => {
    const el = document.createElement('sol-tabs');
    // href is required for the anchor to be a tab; it rides along as params.href.
    el.innerHTML = '<a href="shell.html" id="panel-ws" data-handler="podz" data-foo="bar">Workspaces</a>';
    attached(el);
    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    el.switchTab('Workspaces');
    // No component element was created for a command handler.
    expect(content(el).querySelector('.sol-tab-embed')).toBeNull();
    expect(detail).toBeTruthy();
    expect(detail.command).toBe('podz');
    expect(detail.params.href).toBe('shell.html');   // href forwarded as a param
    expect(detail.params.foo).toBe('bar');            // data-* forwarded, prefix stripped
    // place() mounts the script's output into the pane (its region).
    const out = document.createElement('section');
    const host = detail.place(out);
    expect(host.contains(out)).toBe(true);
  });
});

describe('SolTabs — slot="actions" launchers', () => {
  const LAUNCH = ':scope > .sol-tabs-bar > .sol-tabs-launch > sol-button';

  test('relocates slot="actions" children to the bar launch group, not as tabs', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>'
      + '<sol-button slot="actions" inline data-handler="sol-include" source="help.html">?</sol-button>';
    attached(el);
    expect(tabBtns(el).map(b => b.textContent)).toEqual(['Alpha', 'Beta']);   // launcher is NOT a tab
    const launch = el.querySelector(LAUNCH);
    expect(launch).toBeTruthy();                                              // homed in the bar launch group
    expect(launch.textContent).toBe('?');
  });

  test('infers a non-anchor child as an action — no slot="actions" marker needed', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>'
      + '<sol-button inline data-handler="sol-include" source="help.html">?</sol-button>';   // no slot=
    attached(el);
    expect(tabBtns(el).map(b => b.textContent)).toEqual(['Alpha', 'Beta']);   // still only the anchors are tabs
    const launch = el.querySelector(LAUNCH);
    expect(launch).toBeTruthy();                                              // non-anchor → action, in the launch group
    expect(launch.textContent).toBe('?');
  });

  test('slot="actions" still forces an <a> to be an action (escape hatch)', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>'
      + '<a href="x.html" slot="actions">X</a>';
    attached(el);
    expect(tabBtns(el).map(b => b.textContent)).toEqual(['Alpha', 'Beta']);   // the marked <a> is NOT a tab
    expect(el.querySelector(':scope > .sol-tabs-bar > .sol-tabs-launch > a')?.textContent).toBe('X');
  });

  test('survives a tab switch (persistent, unlike the per-tab actions row)', () => {
    const el = document.createElement('sol-tabs');
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>'
      + '<sol-button slot="actions" inline data-handler="sol-include" source="help.html">?</sol-button>';
    attached(el);
    el.switchTab('Beta');
    expect(el.querySelector(LAUNCH)).toBeTruthy();   // still there after switching tabs
  });

  test('auto-wires an inline sol-button to the content area via for=', () => {
    const el = document.createElement('sol-tabs');
    el.id = 'mytabs';
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>'
      + '<sol-button slot="actions" inline data-handler="sol-include" source="help.html">?</sol-button>';
    attached(el);
    expect(el.querySelector(LAUNCH).getAttribute('for')).toBe('#mytabs > .sol-tabs-content');
  });

  test('mints an id when missing; keeps an explicit for=', () => {
    const a = document.createElement('sol-tabs');   // no id
    a.innerHTML = '<a href="a.html">A</a><a href="b.html">B</a>'
      + '<sol-button slot="actions" inline data-handler="sol-include" source="h">?</sol-button>';
    attached(a);
    expect(a.id).toMatch(/^sol-tabs-\d+$/);
    expect(a.querySelector(LAUNCH).getAttribute('for')).toBe(`#${a.id} > .sol-tabs-content`);

    const b = document.createElement('sol-tabs');
    b.innerHTML = '<a href="a.html">A</a><a href="b.html">B</a>'
      + '<sol-button slot="actions" inline for="#elsewhere" data-handler="sol-include" source="h">?</sol-button>';
    attached(b);
    expect(b.querySelector(LAUNCH).getAttribute('for')).toBe('#elsewhere');
  });
});

// ── keep-alive ──────────────────────────────────────────────────────────────

describe('SolTabs — keep-alive', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('renders a persistent pane for every tab up front', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('keep-alive', '');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const panes = content(el).querySelectorAll(':scope > .sol-tabs-pane');
    expect(panes.length).toBe(4);                       // all tabs rendered
    const visible = [...panes].filter(p => !p.hidden);
    expect(visible.length).toBe(1);                     // only the active one shown
    expect(visible[0].dataset.tabName).toBe('Home');
  });

  test('switching toggles pane visibility without tearing content down', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('keep-alive', '');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const home = content(el).querySelector('.sol-tabs-pane[data-tab-name="Home"]');
    const homeEmbed = home.querySelector('.sol-tab-embed');
    expect(homeEmbed).toBeTruthy();

    el.switchTab('About');
    expect(home.hidden).toBe(true);                                // parked, not removed
    expect(home.querySelector('.sol-tab-embed')).toBe(homeEmbed);  // same instance
    const about = content(el).querySelector('.sol-tabs-pane[data-tab-name="About"]');
    expect(about.hidden).toBe(false);
  });

  test('tab buttons carry the RDF item id as data-tab-id', async () => {
    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('keep-alive', '');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    expect(tabBtns(el).map(b => b.dataset.tabId)).toEqual(['Home', 'Settings', 'Table', 'About']);
  });
});

// ── command items render as tabs that dispatch sol-command into their pane ────

describe('SolTabs — command items', () => {
  test('a bare-name ui:Component renders as a tab that dispatches sol-command', async () => {
    const store = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    store.add(s(BASE + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    store.add(s(BASE + '#M'), s(UI + 'label'), l('m'));
    const b1 = s(BASE + '#_x1'), b2 = s(BASE + '#_x2');
    store.add(s(BASE + '#M'), s(UI + 'parts'), b1);
    store.add(b1, s(RDF + 'first'), s(BASE + '#Table'));
    store.add(b1, s(RDF + 'rest'), b2);
    store.add(b2, s(RDF + 'first'), s(BASE + '#Run'));
    store.add(b2, s(RDF + 'rest'), s(RDF + 'nil'));
    store.add(s(BASE + '#Table'), s(RDF + 'type'), s(UI + 'Component'));
    store.add(s(BASE + '#Table'), s(UI + 'label'), l('Table'));
    store.add(s(BASE + '#Table'), s(UI + 'name'), l('sol-query'));
    store.add(s(BASE + '#Run'), s(RDF + 'type'), s(UI + 'Component'));
    store.add(s(BASE + '#Run'), s(UI + 'label'), l('Run'));
    store.add(s(BASE + '#Run'), s(UI + 'name'), l('installPod'));   // bare → command
    mockStore = store;

    const el = attached(document.createElement('sol-tabs'));
    el.setAttribute('from-rdf', BASE + '#M');
    await flush();

    // The command part is now a tab too (no longer filtered out).
    expect(el.tabs.map(t => t.name)).toEqual(['Table', 'Run']);

    // Activating it dispatches sol-command; detail.place mounts output into the
    // tab's pane (its resolved region).
    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    el.switchTab('Run');
    expect(detail).toBeTruthy();
    expect(detail.command).toBe('installPod');
    const out = document.createElement('p');
    const host = detail.place(out);
    expect(host).toBeTruthy();
    expect(host.contains(out)).toBe(true);
  });
});
