/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://example.org/"}
 *
 * Tests for <sol-menu>:
 *   - RDF loading and menu construction
 *   - Fragment-based subject selection
 *   - region= / data-for routing, ui:orientation, ui:contents, ui:Component, ui:icon
 *   - Submenu (nested ui:Menu) handling
 *   - Fallback when no fragment provided
 *   - observedAttributes / attributeChangedCallback
 *   - ARIA roles, states, and properties
 *   - Keyboard navigation (arrow keys, Home, End, Escape)
 *   - Declarative HTML API (_harvestItems)
 *   - Imperative items setter API
 *   - Multiple schema:additionalProperty on a ui:Component
 *   - Link href defaults to sol-include (origin-inferred)
 *   - Edge cases (select non-existent, empty RDF, single item hides nav)
 *   - disconnectedCallback cleanup
 *   - Submenu toggle (open/close/aria-expanded)
 *   - sol-menu-change event composed and bubbles
 */

import { jest } from '@jest/globals';
import rdflib from '../__mocks__/rdflib-esm.js';
window.$rdf = rdflib;
window.__SolSuppressDefineWarn = true;

const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SCHEMA = 'http://schema.org/';
const BASE = 'http://example.org/menu.ttl';

// ── Mock loadRdfStore ───────────────────────────────────────────────────────

let mockStore;
jest.unstable_mockModule('../../core/rdf-utils.js', () => ({
  loadRdfStore: jest.fn(async () => mockStore),
}));

const { SolMenu } = await import('../../web/sol-menu.js');
// `from-rdf` is now an opt-in capability — install the loader the way the
// web/menu-from-rdf.js add-on does on a real page (rdf-utils is mocked above).
const { loadMenuFromUri } = await import('../../core/menu-rdf.js');
SolMenu.fromRdfLoader = loadMenuFromUri;

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#Main'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Main'), s(UI + 'label'), l('main'));

  // menu → positioned schema:ListItem wrapper → member
  const addMember = (menuFrag, itemFrag, pos) => {
    const wrap = s(`${BASE}#${menuFrag.slice(1)}-${itemFrag.slice(1)}`);
    store.add(s(BASE + menuFrag), s(SCHEMA + 'itemListElement'), wrap);
    store.add(wrap, s(RDF + 'type'), s(SCHEMA + 'ListItem'));
    store.add(wrap, s(SCHEMA + 'item'), s(BASE + itemFrag));
    store.add(wrap, s(SCHEMA + 'position'), l(String(pos)));
  };
  addMember('#Main', '#Home', 1);
  addMember('#Main', '#Sub', 2);
  addMember('#Main', '#About', 3);

  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(SCHEMA + 'url'), s('http://example.org/home.html'));
  store.add(s(BASE + '#Home'), s(UI + 'icon'), s('http://example.org/house.svg'));

  store.add(s(BASE + '#Sub'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Sub'), s(UI + 'label'), l('Settings'));
  addMember('#Sub', '#Light', 1);

  store.add(s(BASE + '#Light'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Light'), s(UI + 'label'), l('Light'));
  store.add(s(BASE + '#Light'), s(UI + 'contents'), l('light content'));

  store.add(s(BASE + '#About'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#About'), s(UI + 'label'), l('About'));
  store.add(s(BASE + '#About'), s(SCHEMA + 'url'), s('http://example.org/web/sol-query.js'));
  const param1 = s(BASE + '#_param1');
  store.add(s(BASE + '#About'), s(SCHEMA + 'additionalProperty'), param1);
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

function press(target, key) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// ── Tests ───────────────────────────────────────────────────────────────────

afterEach(() => {
  document.body.innerHTML = '';
});

// ── observedAttributes ──────────────────────────────────────────────────────

describe('SolMenu — observedAttributes', () => {
  test('observes from-rdf', () => {
    expect(SolMenu.observedAttributes).toContain('from-rdf');
  });
});

// ── from-rdf loading ────────────────────────────────────────────────────────

describe('SolMenu — from-rdf loading', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('renders nav buttons from RDF', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav).toBeTruthy();
    const topItems = nav.querySelectorAll(':scope > button[role="menuitem"]');
    const groupBtns = nav.querySelectorAll('.sol-menu-group-btn');
    expect(topItems.length).toBe(2);
    expect(groupBtns.length).toBe(1);
    expect(groupBtns[0].textContent).toBe('Settings');
  });

  test('renders the icon image before the visible label when ui:icon present', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const homeBtn = nav.querySelector(':scope > button[role="menuitem"]');
    // An image icon now renders BEFORE the label (icon + label), not in place
    // of it — so the accessible name comes from the visible text, and the
    // button carries a hover title rather than an aria-label.
    expect(homeBtn.querySelector('.sol-menu-icon')).toBeTruthy();
    expect(homeBtn.textContent).toBe('Home');
    expect(homeBtn.title).toBe('Home');
  });

  test('icon span is aria-hidden, img alt is empty (decorative)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const homeBtn = el.querySelector('.sol-menu-nav > button[role="menuitem"]');
    const iconSpan = homeBtn.querySelector('.sol-menu-icon');
    expect(iconSpan.getAttribute('aria-hidden')).toBe('true');
    const img = iconSpan.querySelector('img');
    expect(img.alt).toBe('');
  });

  test('icon falls back to <img> for non-SVG URLs', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const img = el.querySelector('.sol-menu-nav > button[role="menuitem"] .sol-menu-icon img');
    expect(img).toBeTruthy();
    expect(img.src).toBe('http://example.org/house.svg');
  });

  test('inline SVG data URI is decoded and inserted', async () => {
    const svgData = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    mockStore.statements = mockStore.statements.filter(
      (st) => !(st.subject.value === BASE + '#Home' && st.predicate.value === UI + 'icon')
    );
    mockStore.add(rdflib.sym(BASE + '#Home'), rdflib.sym(UI + 'icon'), rdflib.sym(svgData));

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const svg = el.querySelector('.sol-menu-nav > button[role="menuitem"] .sol-menu-icon svg');
    expect(svg).toBeTruthy();
  });

  test('renders submenu as collapsible group', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const group = el.querySelector('.sol-menu-group');
    expect(group).toBeTruthy();
    const popup = group.querySelector('.sol-menu-popup');
    const innerBtn = popup.querySelector('button[role="menuitem"]');
    expect(innerBtn).toBeTruthy();
    expect(innerBtn.textContent).toBe('Light');
  });

  test('ui:contents renders literal HTML into body', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('Light');
    const body = el.querySelector('.sol-menu-content');
    expect(body.innerHTML).toBe('light content');
  });

  test('ui:Component renders the named element with its attributes', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('About');
    const cmp = el.querySelector('.sol-menu-content sol-query');
    expect(cmp).toBeTruthy();
    expect(cmp.getAttribute('pattern')).toBe('?s ?p ?o');
  });

  test('defaults to horizontal orientation', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(el.getAttribute('orientation')).toBe('horizontal');
  });

  test('respects explicit orientation', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('orientation', 'vertical');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(el.getAttribute('orientation')).toBe('vertical');
  });

  test('auto-selects first leaf item', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(el.activeItem).toBe('Home');
  });

  test('fires sol-menu-change on select', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const events = [];
    el.addEventListener('sol-menu-change', (e) => events.push(e.detail));
    el.select('About');
    expect(events).toEqual([{ name: 'About' }]);
  });
});

// ── ARIA roles and states ───────────────────────────────────────────────────

describe('SolMenu — ARIA', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('nav has role=menubar with aria-orientation', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav.getAttribute('role')).toBe('menubar');
    expect(nav.getAttribute('aria-orientation')).toBe('horizontal');
  });

  test('content area is a labeled region', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const panel = el.querySelector('.sol-menu-content');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toMatch(/^Content: /);
  });

  test('top-level items (leaf and group) all have role=menuitem', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const leaves = el.querySelectorAll('.sol-menu-nav > button[role="menuitem"]');
    const groupBtns = el.querySelectorAll('.sol-menu-group-btn[role="menuitem"]');
    expect(leaves.length).toBeGreaterThan(0);
    expect(groupBtns.length).toBeGreaterThan(0);
  });

  test('active item has aria-current=page, others have it removed', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const activeBtn = el.querySelector('.sol-menu-nav button.active');
    expect(activeBtn.getAttribute('aria-current')).toBe('page');

    const inactive = el.querySelectorAll('.sol-menu-nav > button[role="menuitem"]:not(.active)');
    inactive.forEach(b => expect(b.hasAttribute('aria-current')).toBe(false));
  });

  test('content region aria-label reflects active item name', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const panel = el.querySelector('.sol-menu-content');
    expect(panel.getAttribute('aria-label')).toBe('Content: Home');
  });

  test('submenu popup has role=menu and aria-label', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const popup = el.querySelector('.sol-menu-popup');
    expect(popup.getAttribute('role')).toBe('menu');
    expect(popup.getAttribute('aria-label')).toBe('Settings');
  });

  test('items inside submenu popup have role=menuitem', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const menuitem = el.querySelector('.sol-menu-popup button[role="menuitem"]');
    expect(menuitem).toBeTruthy();
    expect(menuitem.textContent).toBe('Light');
  });

  test('group button has aria-haspopup=menu and aria-expanded', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.querySelector('.sol-menu-group-btn');
    expect(groupBtn.getAttribute('role')).toBe('menuitem');
    expect(groupBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
  });

  test('roving tabindex: only one button has tabindex=0', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const focused = nav.querySelectorAll('button[tabindex="0"]');
    expect(focused.length).toBe(1);
    const rest = nav.querySelectorAll('button[tabindex="-1"]');
    expect(rest.length).toBeGreaterThan(0);
  });

  test('aria-orientation reflects vertical setting', async () => {
    mockStore.add(
      rdflib.sym(BASE + '#Main'),
      rdflib.sym(UI + 'orientation'),
      rdflib.literal('vertical'),
    );
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav.getAttribute('aria-orientation')).toBe('vertical');
  });
});

// ── Keyboard navigation ─────────────────────────────────────────────────────

describe('SolMenu — keyboard navigation', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('ArrowRight moves focus to next button (horizontal)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowRight');
    expect(btns[1].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(btns[1]);
  });

  test('ArrowLeft moves focus to previous button (horizontal)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[1].focus();
    btns[1].setAttribute('tabindex', '0');
    press(btns[1], 'ArrowLeft');
    expect(btns[0].getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(btns[0]);
  });

  test('ArrowRight wraps from last to first', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    const last = btns[btns.length - 1];
    last.focus();
    last.setAttribute('tabindex', '0');
    press(last, 'ArrowRight');
    expect(document.activeElement).toBe(btns[0]);
  });

  test('Home moves focus to first button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[2].focus();
    btns[2].setAttribute('tabindex', '0');
    press(btns[2], 'Home');
    expect(document.activeElement).toBe(btns[0]);
  });

  test('End moves focus to last button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'End');
    expect(document.activeElement).toBe(btns[btns.length - 1]);
  });

  test('Escape closes open popup and returns focus to group button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const group = el.querySelector('.sol-menu-group');
    const groupBtn = group.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(group.classList.contains('open')).toBe(true);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true');

    const popupBtn = group.querySelector('.sol-menu-popup button');
    popupBtn.focus();
    press(popupBtn, 'Escape');
    expect(group.classList.contains('open')).toBe(false);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(groupBtn);
  });

  test('ArrowDown/ArrowUp navigate in vertical orientation', async () => {
    mockStore.add(
      rdflib.sym(BASE + '#Main'),
      rdflib.sym(UI + 'orientation'),
      rdflib.literal('vertical'),
    );
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowDown');
    expect(document.activeElement).toBe(btns[1]);

    press(btns[1], 'ArrowUp');
    expect(document.activeElement).toBe(btns[0]);
  });

  test('ArrowRight/Left ignored in vertical orientation', async () => {
    mockStore.add(
      rdflib.sym(BASE + '#Main'),
      rdflib.sym(UI + 'orientation'),
      rdflib.literal('vertical'),
    );
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowRight');
    expect(document.activeElement).toBe(btns[0]);
  });
});

// ── region (HTML) and data-for routing ───────────────────────────────────────

describe('SolMenu — region= on the element', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('renders content into the region pane', async () => {
    const target = document.createElement('div');
    target.id = 'target-div';
    document.body.appendChild(target);

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('region', '#target-div');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('Light');
    expect(target.innerHTML).toBe('light content');
  });

  test('a data-for host claims a specific item by id', async () => {
    const host = document.createElement('div');
    host.id = 'claim';
    host.setAttribute('data-for', 'Light');
    document.body.appendChild(host);

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('Light');
    expect(host.innerHTML).toBe('light content');
  });
});

// ── orientation ─────────────────────────────────────────────────────────────

describe('SolMenu — from-rdf with ui:orientation', () => {
  beforeEach(() => {
    mockStore = buildStore();
    mockStore.add(rdflib.sym(BASE + '#Main'), rdflib.sym(UI + 'orientation'), rdflib.sym(UI + 'Vertical'));
  });

  test('applies orientation from RDF (ui:Orientation instance)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(el.getAttribute('orientation')).toBe('vertical');
  });
});

// ── no fragment ─────────────────────────────────────────────────────────────

describe('SolMenu — from-rdf without fragment', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('falls back to first ui:Menu in store', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE);
    await flush();

    expect(el.activeItem).toBe('Home');
    const nav = el.querySelector('.sol-menu-nav');
    const topBtns = nav.querySelectorAll(':scope > button[role="menuitem"], :scope > .sol-menu-group > .sol-menu-group-btn');
    expect(topBtns.length).toBe(3);
  });
});

// ── attributeChangedCallback ────────────────────────────────────────────────

describe('SolMenu — attributeChangedCallback', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('reloads menu when from-rdf changes', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    expect(el.activeItem).toBe('Home');

    const store2 = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    const base2 = 'http://example.org/other.ttl';
    store2.add(s(base2 + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    store2.add(s(base2 + '#M'), s(UI + 'label'), l('other'));
    const lb = s(base2 + '#M-Only');
    store2.add(s(base2 + '#M'), s(SCHEMA + 'itemListElement'), lb);
    store2.add(lb, s(SCHEMA + 'item'), s(base2 + '#Only'));
    store2.add(lb, s(SCHEMA + 'position'), l('1'));
    store2.add(s(base2 + '#Only'), s(RDF + 'type'), s(UI + 'Link'));
    store2.add(s(base2 + '#Only'), s(UI + 'label'), l('Only Item'));
    store2.add(s(base2 + '#Only'), s(UI + 'contents'), l('only content'));
    mockStore = store2;

    el.setAttribute('from-rdf', base2 + '#M');
    await flush();
    expect(el.activeItem).toBe('Only Item');
  });
});

// ── Declarative HTML API ────────────────────────────────────────────────────

describe('SolMenu — declarative HTML (anchor children)', () => {
  test('harvests <a> children into menu items', () => {
    const el = document.createElement('sol-menu');
    el.innerHTML = `
      <a href="page1.html">Page 1</a>
      <a href="page2.html">Page 2</a>
    `;
    attached(el);

    const nav = el.querySelector('.sol-menu-nav');
    const items = nav.querySelectorAll(':scope > button[role="menuitem"]');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Page 1');
    expect(items[1].textContent).toBe('Page 2');
  });

  test('harvests <submenu> children into collapsible groups', () => {
    const el = document.createElement('sol-menu');
    el.innerHTML = `
      <a href="home.html">Home</a>
      <submenu>
        <label>Docs</label>
        <a href="quickstart.html">Quickstart</a>
        <a href="api.html">API</a>
      </submenu>
    `;
    attached(el);

    const group = el.querySelector('.sol-menu-group');
    expect(group).toBeTruthy();
    const groupBtn = group.querySelector('.sol-menu-group-btn');
    expect(groupBtn.textContent).toBe('Docs');
    const popupBtns = group.querySelectorAll('.sol-menu-popup button[role="menuitem"]');
    expect(popupBtns.length).toBe(2);
    expect(popupBtns[0].textContent).toBe('Quickstart');
    expect(popupBtns[1].textContent).toBe('API');
  });

  test('uses handler attribute as default component tag', () => {
    const el = document.createElement('sol-menu');
    el.setAttribute('data-handler', 'sol-query');
    el.innerHTML = '<a href="data.ttl">Data</a>';
    attached(el);

    el.select('Data');
    const body = el.querySelector('.sol-menu-content');
    const handler = body.querySelector('sol-query');
    expect(handler).toBeTruthy();
    expect(handler.getAttribute('source')).toBe('data.ttl');
  });

  test('per-anchor handler overrides element handler', () => {
    const el = document.createElement('sol-menu');
    el.setAttribute('data-handler', 'sol-include');
    el.innerHTML = '<a href="data.ttl" data-handler="sol-query">Data</a>';
    attached(el);

    el.select('Data');
    const body = el.querySelector('.sol-menu-content');
    expect(body.querySelector('sol-query')).toBeTruthy();
    expect(body.querySelector('sol-include')).toBeFalsy();
  });

  test('passes through non-reserved attributes to handler element', () => {
    const el = document.createElement('sol-menu');
    el.innerHTML = '<a href="data.ttl" pattern="?s ?p ?o" view="table">Data</a>';
    attached(el);

    el.select('Data');
    const body = el.querySelector('.sol-menu-content');
    const child = body.querySelector('.sol-menu-embed');
    expect(child.getAttribute('pattern')).toBe('?s ?p ?o');
    expect(child.getAttribute('view')).toBe('table');
  });

  test('auto-selects first leaf in declarative mode', () => {
    const el = document.createElement('sol-menu');
    el.innerHTML = '<a href="a.html">Alpha</a><a href="b.html">Beta</a>';
    attached(el);
    expect(el.activeItem).toBe('Alpha');
  });

  test('single item hides nav bar', () => {
    const el = document.createElement('sol-menu');
    el.innerHTML = '<a href="only.html">Only</a>';
    attached(el);

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav.style.display).toBe('none');
  });
});

// ── Imperative items API ────────────────────────────────────────────────────

describe('SolMenu — imperative items setter', () => {
  test('set items renders nav and allows select', () => {
    const el = attached(document.createElement('sol-menu'));
    const renderFn = jest.fn();
    el.items = [
      { name: 'Foo', render: renderFn },
      { name: 'Bar', render: jest.fn() },
    ];

    const nav = el.querySelector('.sol-menu-nav');
    const items = nav.querySelectorAll(':scope > button[role="menuitem"]');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Foo');
    expect(items[1].textContent).toBe('Bar');

    el.select('Foo');
    expect(renderFn).toHaveBeenCalled();
    expect(el.activeItem).toBe('Foo');
  });

  test('items getter returns current items', () => {
    const el = attached(document.createElement('sol-menu'));
    const items = [{ name: 'A', render: jest.fn() }];
    el.items = items;
    expect(el.items).toBe(items);
  });

  test('body getter returns content element', () => {
    const el = attached(document.createElement('sol-menu'));
    el.items = [{ name: 'X', render: jest.fn() }];
    const body = el.body;
    expect(body).toBeTruthy();
    expect(body.classList.contains('sol-menu-content')).toBe(true);
  });
});

// ── Multiple schema:additionalProperty on a ui:Component ──────────────────────────────────

describe('SolMenu — multiple schema:additionalProperty', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('all attributes set on the component element', async () => {
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    const param2 = s(BASE + '#_param2');
    mockStore.add(s(BASE + '#About'), s(SCHEMA + 'additionalProperty'), param2);
    mockStore.add(param2, s(SCHEMA + 'name'), l('view'));
    mockStore.add(param2, s(SCHEMA + 'value'), l('table'));

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('About');
    const handler = el.querySelector('.sol-menu-content sol-query');
    expect(handler.getAttribute('pattern')).toBe('?s ?p ?o');
    expect(handler.getAttribute('view')).toBe('table');
  });
});

// ── Handler fallback ────────────────────────────────────────────────────────

describe('SolMenu — handler fallback (no ui:handler)', () => {
  test('defaults to sol-include when no handler specified', async () => {
    const store = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    const base = 'http://example.org/simple.ttl';
    store.add(s(base + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    store.add(s(base + '#M'), s(UI + 'label'), l('simple'));
    const lb = s(base + '#M-Item');
    store.add(s(base + '#M'), s(SCHEMA + 'itemListElement'), lb);
    store.add(lb, s(SCHEMA + 'item'), s(base + '#Item'));
    store.add(lb, s(SCHEMA + 'position'), l('1'));
    store.add(s(base + '#Item'), s(UI + 'label'), l('Page'));
    store.add(s(base + '#Item'), s(SCHEMA + 'url'), s('http://example.org/page.html'));
    mockStore = store;

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', base + '#M');
    await flush();

    el.select('Page');
    const body = el.querySelector('.sol-menu-content');
    const child = body.querySelector('sol-include');
    expect(child).toBeTruthy();
    expect(child.getAttribute('source')).toBe('http://example.org/page.html');
  });

});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('SolMenu — edge cases', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('select with non-existent name does nothing', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const before = el.activeItem;
    el.select('NonExistent');
    expect(el.activeItem).toBe(before);
  });

  test('select is case-insensitive', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('about');
    expect(el.activeItem).toBe('About');
  });

  test('empty RDF store renders no nav', async () => {
    mockStore = rdflib.graph();
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav.innerHTML).toBe('');
  });

  test('RDF menu with no parts renders no nav', async () => {
    const store = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    store.add(s(BASE + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    store.add(s(BASE + '#M'), s(UI + 'label'), l('empty'));
    mockStore = store;

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#M');
    await flush();

    const nav = el.querySelector('.sol-menu-nav');
    expect(nav.querySelectorAll('button').length).toBe(0);
  });

  test('link with href but no contents creates handler element', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    el.select('Home');
    const body = el.querySelector('.sol-menu-content');
    const child = body.querySelector('sol-include');
    expect(child).toBeTruthy();
    expect(child.getAttribute('source')).toBe('http://example.org/home.html');
  });

  test('link with no href and no contents renders nothing', async () => {
    const store = rdflib.graph();
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    store.add(s(BASE + '#M'), s(RDF + 'type'), s(UI + 'Menu'));
    store.add(s(BASE + '#M'), s(UI + 'label'), l('m'));
    const lb = s(BASE + '#M-A');
    const lb2 = s(BASE + '#M-B');
    store.add(s(BASE + '#M'), s(SCHEMA + 'itemListElement'), lb);
    store.add(lb, s(SCHEMA + 'item'), s(BASE + '#A'));
    store.add(lb, s(SCHEMA + 'position'), l('1'));
    store.add(s(BASE + '#M'), s(SCHEMA + 'itemListElement'), lb2);
    store.add(lb2, s(SCHEMA + 'item'), s(BASE + '#B'));
    store.add(lb2, s(SCHEMA + 'position'), l('2'));
    store.add(s(BASE + '#A'), s(UI + 'label'), l('Empty'));
    store.add(s(BASE + '#B'), s(UI + 'label'), l('Also'));
    mockStore = store;

    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#M');
    await flush();

    el.select('Empty');
    const body = el.querySelector('.sol-menu-content');
    expect(body.children.length).toBe(0);
  });
});

// ── Submenu toggle behavior ─────────────────────────────────────────────────

describe('SolMenu — submenu toggle', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('clicking group button opens popup and sets aria-expanded', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const group = el.querySelector('.sol-menu-group');
    const groupBtn = group.querySelector('.sol-menu-group-btn');
    expect(group.classList.contains('open')).toBe(false);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');

    groupBtn.click();
    expect(group.classList.contains('open')).toBe(true);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true');
  });

  test('clicking group button again closes popup', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    groupBtn.click();
    const group = el.querySelector('.sol-menu-group');
    expect(group.classList.contains('open')).toBe(false);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking outside closes all popups', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(el.querySelector('.sol-menu-group.open')).toBeTruthy();

    document.body.click();
    expect(el.querySelector('.sol-menu-group.open')).toBeFalsy();
  });

  test('selecting item inside popup closes all popups', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.querySelector('.sol-menu-group-btn');
    groupBtn.click();

    const popupBtn = el.querySelector('.sol-menu-popup button');
    popupBtn.click();
    expect(el.querySelector('.sol-menu-group.open')).toBeFalsy();
    expect(el.activeItem).toBe('Light');
  });
});

// ── Event properties ────────────────────────────────────────────────────────

describe('SolMenu — event properties', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('sol-menu-change event bubbles and is composed', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    let captured;
    document.body.addEventListener('sol-menu-change', (e) => { captured = e; }, { once: true });
    el.select('About');
    expect(captured).toBeTruthy();
    expect(captured.bubbles).toBe(true);
    expect(captured.composed).toBe(true);
    expect(captured.detail.name).toBe('About');
  });
});

// ── disconnectedCallback ────────────────────────────────────────────────────

describe('SolMenu — disconnectedCallback', () => {
  test('removes document click listener on disconnect', async () => {
    mockStore = buildStore();
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(el.querySelector('.sol-menu-group.open')).toBeTruthy();

    el.remove();
    // After disconnect, clicking document should not throw
    expect(() => document.body.click()).not.toThrow();
  });

  test('calls cleanup function on disconnect', () => {
    const el = attached(document.createElement('sol-menu'));
    const cleanup = jest.fn();
    el.items = [{ name: 'A', render: () => cleanup }];
    el.select('A');
    expect(cleanup).not.toHaveBeenCalled();

    el.remove();
    expect(cleanup).toHaveBeenCalled();
  });
});

// ── ARIA updates on re-select ───────────────────────────────────────────────

describe('SolMenu — ARIA state updates on re-select', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('switching items updates aria-current and tabindex', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const items = el.querySelectorAll('.sol-menu-nav > button[role="menuitem"]');
    expect(items[0].getAttribute('aria-current')).toBe('page');
    expect(items[0].getAttribute('tabindex')).toBe('0');

    el.select('About');
    expect(items[0].hasAttribute('aria-current')).toBe(false);
    expect(items[0].getAttribute('tabindex')).toBe('-1');
    expect(items[1].getAttribute('aria-current')).toBe('page');
    expect(items[1].getAttribute('tabindex')).toBe('0');
  });

  test('content region aria-label updates to match new active item', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const panel = el.querySelector('.sol-menu-content');
    expect(panel.getAttribute('aria-label')).toBe('Content: Home');

    el.select('About');
    expect(panel.getAttribute('aria-label')).toBe('Content: About');
  });
});

// ── command items (ui:Command whose schema:url fragment is the key) ──────────

function buildCommandStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#Main'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Main'), s(UI + 'label'), l('main'));
  const b1 = s(BASE + '#Main-Home'), b2 = s(BASE + '#Main-Install');
  store.add(s(BASE + '#Main'), s(SCHEMA + 'itemListElement'), b1);
  store.add(b1, s(SCHEMA + 'item'), s(BASE + '#Home'));
  store.add(b1, s(SCHEMA + 'position'), l('1'));
  store.add(s(BASE + '#Main'), s(SCHEMA + 'itemListElement'), b2);
  store.add(b2, s(SCHEMA + 'item'), s(BASE + '#Install'));
  store.add(b2, s(SCHEMA + 'position'), l('2'));

  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(SCHEMA + 'url'), s('http://example.org/home.html'));

  // schema:url <…#installPod> — hyphen-free fragment → a command key.
  store.add(s(BASE + '#Install'), s(RDF + 'type'), s(UI + 'Command'));
  store.add(s(BASE + '#Install'), s(UI + 'label'), l('Install on my Pod'));
  store.add(s(BASE + '#Install'), s(SCHEMA + 'url'), s(BASE + '-commands.ttl#installPod'));
  const p = s(BASE + '#_p');
  store.add(s(BASE + '#Install'), s(SCHEMA + 'additionalProperty'), p);
  store.add(p, s(SCHEMA + 'name'), l('target'));
  store.add(p, s(SCHEMA + 'value'), l('pod'));
  return store;
}

const cmdBtn = (el) =>
  [...el.querySelectorAll('.sol-menu-nav > button[role="menuitem"]')]
    .find(b => b.textContent === 'Install on my Pod');

describe('SolMenu — command items', () => {
  beforeEach(() => { mockStore = buildCommandStore(); });

  test('a bare-name ui:Component renders as a nav entry but mounts no content', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    expect(cmdBtn(el)).toBeTruthy();                 // shows in the nav
    expect(el.activeItem).toBe('Home');              // command is NOT auto-selected
    // The bare name was NOT mistaken for an element tag and mounted.
    expect(el.querySelector('.sol-menu-content').querySelector('installpod')).toBeNull();
  });

  test('clicking a command dispatches sol-command with command + params, mounts nothing', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    cmdBtn(el).click();

    expect(detail).toBeTruthy();
    expect(detail.command).toBe('installPod');
    expect(detail.params).toEqual({ target: 'pod' });
    expect(el.activeItem).toBe('Home');              // unchanged — not a selection
    expect(el.querySelector('.sol-menu-content').querySelector('installpod')).toBeNull();
  });
});

// ── Keep-alive strip mode (the Menubar renderer) ────────────────────────────
// A <sol-menu keep-alive> is the strip dk's shell runs on: one persistent
// pane per TOP-LEVEL item (submenus included), switched by visibility;
// popup leaf picks mount into their parent submenu's pane.
describe('SolMenu — keep-alive strip mode', () => {
  beforeEach(() => { mockStore = buildStore(); });

  const strip = async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('keep-alive', '');
    el.setAttribute('orientation', 'horizontal');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    await flush();
    return el;
  };
  const panes = (el) => [...el.querySelectorAll(':scope > .sol-menu-content > .sol-menu-pane')];

  test('every top-level item gets a persistent pane up front; the first shows', async () => {
    const el = await strip();
    const ps = panes(el);
    expect(ps.map((p) => p.dataset.tabName)).toEqual(['Home', 'Settings', 'About']);
    expect(ps.map((p) => p.hidden)).toEqual([false, true, true]);
    expect(el.activeItem).toBe('Home');
  });

  test('switching parks panes without teardown (same nodes survive)', async () => {
    const el = await strip();
    const home = panes(el)[0];
    home.dataset.probe = 'kept';
    el.select('About');
    expect(panes(el)[2].hidden).toBe(false);
    el.select('Home');
    const again = panes(el)[0];
    expect(again).toBe(home);
    expect(again.dataset.probe).toBe('kept');
    expect(again.hidden).toBe(false);
  });

  test('a submenu is a group head on the bar; a popup pick mounts into ITS pane', async () => {
    const el = await strip();
    const head = el.querySelector('.sol-menu-nav .sol-menu-group-btn');
    expect(head).toBeTruthy();
    const events = [];
    el.addEventListener('sol-menu-change', (e) => events.push(e.detail.name));
    // open the popup, pick the Light leaf
    head.click();
    const leaf = [...el.querySelectorAll('.sol-menu-popup button')]
      .find((b) => b.textContent === 'Light');
    leaf.click();
    await flush();
    const sub = panes(el).find((p) => p.dataset.tabName === 'Settings');
    expect(sub.hidden).toBe(false);
    expect(sub.textContent).toContain('light content');
    // the group head reads as the active strip button
    expect(head.classList.contains('active')).toBe(true);
    expect(head.getAttribute('aria-current')).toBe('page');
    // the pick surfaced the submenu — one change event, named for the parent
    expect(events).toEqual(['Settings']);
  });

  test('select({silent}) suppresses sol-menu-change', async () => {
    const el = await strip();
    const events = [];
    el.addEventListener('sol-menu-change', (e) => events.push(e.detail.name));
    el.select('About', { silent: true });
    expect(el.activeItem).toBe('About');
    expect(events).toEqual([]);
  });

  test('applyItems merges in place: unchanged items keep their panes, removed ones drop', async () => {
    const el = await strip();
    const { parseMenuItems } = await import('../../core/menu-rdf.js');
    const items = parseMenuItems(mockStore, rdflib.sym(BASE + '#Main'));
    const home = panes(el)[0];
    el.applyItems(items);                       // same definitions → same panes
    expect(panes(el)[0]).toBe(home);
    el.applyItems(items.filter((d) => d.name !== 'About'));
    expect(panes(el).map((p) => p.dataset.tabName)).toEqual(['Home', 'Settings']);
  });
});

describe('SolMenu — phone navigator (coarse pointer, keep-alive only)', () => {
  beforeEach(() => {
    mockStore = buildStore();
    // jsdom has no matchMedia; stub a coarse/touch device for these tests only.
    window.matchMedia = (q) => ({
      matches: /coarse/.test(q),
      media: q,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
  });
  afterEach(() => { delete window.matchMedia; });

  test('a keep-alive strip grows the trigger + sheet; groups mirror submenus', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('keep-alive', '');
    el.setAttribute('orientation', 'horizontal');
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    await flush();
    expect(el.querySelector('.sol-menu-nav > .sol-menu-navtrigger')).toBeTruthy();
    const sheet = document.body.querySelector('sol-sheet.sol-menu-sheet');
    expect(sheet).toBeTruthy();
    expect([...sheet.querySelectorAll('.sol-menu-sheet-grouplabel')].map((g) => g.textContent))
      .toEqual(['Settings']);
    // picking a leaf row drives the group head's select → the submenu pane
    const row = [...sheet.querySelectorAll('.sol-menu-sheet-item .sol-menu-sheet-label')]
      .find((s) => s.textContent === 'Light');
    row.closest('.sol-menu-sheet-item').click();
    await flush();
    const sub = el.querySelector('.sol-menu-pane[data-tab-name="Settings"]');
    expect(sub.hidden).toBe(false);
    expect(sub.textContent).toContain('light content');
    // the trigger names the picked LEAF
    expect(el.querySelector('.sol-menu-navtrigger-label').textContent).toBe('Light');
  });

  test('a legacy menu (no keep-alive) builds no trigger and no sheet', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    await flush();
    expect(el.querySelector('.sol-menu-navtrigger')).toBeNull();
    expect(document.body.querySelector('sol-sheet.sol-menu-sheet')).toBeNull();
  });
});

// ── Tree view (ui:Tree): submenus as inline collapse/expand branches ───────
describe('SolMenu — ui:Tree view', () => {
  beforeEach(() => {
    mockStore = buildStore();
    mockStore.add(rdflib.sym(BASE + '#Main'), rdflib.sym(UI + 'view'), rdflib.sym(UI + 'Tree'));
  });

  test('a submenu renders as an inline branch, collapsed, toggling open in place', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();
    // no floating popup groups — the submenu is a branch with an inline subtree
    expect(el.querySelector('.sol-menu-nav .sol-menu-group')).toBeNull();
    const head = el.querySelector('.sol-menu-nav .sol-menu-branch > .sol-menu-group-btn');
    expect(head.textContent).toBe('Settings');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    const sub = el.querySelector('.sol-menu-branch > .sol-menu-subtree');
    expect(sub.hidden).toBe(true);
    head.click();
    expect(sub.hidden).toBe(false);
    expect(head.getAttribute('aria-expanded')).toBe('true');
    // a branch leaf selects like any menu leaf — content mounts in the body
    [...sub.querySelectorAll('button')].find((b) => b.textContent === 'Light').click();
    await flush();
    expect(el.querySelector('.sol-menu-content').textContent).toContain('light content');
    // toggling closed collapses in place (no popups involved)
    head.click();
    expect(sub.hidden).toBe(true);
  });
});
