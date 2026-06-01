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
 *   - Multiple ui:attribute on a ui:Component
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#Main'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Main'), s(UI + 'label'), l('main'));

  const b1 = s(BASE + '#_list1');
  const b2 = s(BASE + '#_list2');
  const b3 = s(BASE + '#_list3');
  store.add(s(BASE + '#Main'), s(UI + 'parts'), b1);
  store.add(b1, s(RDF + 'first'), s(BASE + '#Home'));
  store.add(b1, s(RDF + 'rest'), b2);
  store.add(b2, s(RDF + 'first'), s(BASE + '#Sub'));
  store.add(b2, s(RDF + 'rest'), b3);
  store.add(b3, s(RDF + 'first'), s(BASE + '#About'));
  store.add(b3, s(RDF + 'rest'), s(RDF + 'nil'));

  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(UI + 'href'), s('http://example.org/home.html'));
  store.add(s(BASE + '#Home'), s(UI + 'icon'), s('http://example.org/house.svg'));

  store.add(s(BASE + '#Sub'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Sub'), s(UI + 'label'), l('Settings'));
  const sb1 = s(BASE + '#_sublist1');
  store.add(s(BASE + '#Sub'), s(UI + 'parts'), sb1);
  store.add(sb1, s(RDF + 'first'), s(BASE + '#Light'));
  store.add(sb1, s(RDF + 'rest'), s(RDF + 'nil'));

  store.add(s(BASE + '#Light'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Light'), s(UI + 'label'), l('Light'));
  store.add(s(BASE + '#Light'), s(UI + 'contents'), l('light content'));

  store.add(s(BASE + '#About'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#About'), s(UI + 'label'), l('About'));
  store.add(s(BASE + '#About'), s(UI + 'name'), l('sol-query'));
  const param1 = s(BASE + '#_param1');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    expect(nav).toBeTruthy();
    const topItems = nav.querySelectorAll(':scope > button[role="menuitem"]');
    const groupBtns = nav.querySelectorAll('.sol-menu-group-btn');
    expect(topItems.length).toBe(2);
    expect(groupBtns.length).toBe(1);
    expect(groupBtns[0].textContent).toBe('Settings');
  });

  test('uses icon image instead of text when ui:icon present', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const homeBtn = nav.querySelector(':scope > button[role="menuitem"]');
    expect(homeBtn.querySelector('.sol-menu-icon')).toBeTruthy();
    expect(homeBtn.title).toBe('Home');
    expect(homeBtn.getAttribute('aria-label')).toBe('Home');
  });

  test('icon span is aria-hidden, img alt is empty (decorative)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const homeBtn = el.shadowRoot.querySelector('.sol-menu-nav > button[role="menuitem"]');
    const iconSpan = homeBtn.querySelector('.sol-menu-icon');
    expect(iconSpan.getAttribute('aria-hidden')).toBe('true');
    const img = iconSpan.querySelector('img');
    expect(img.alt).toBe('');
  });

  test('icon falls back to <img> for non-SVG URLs', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const img = el.shadowRoot.querySelector('.sol-menu-nav > button[role="menuitem"] .sol-menu-icon img');
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

    const svg = el.shadowRoot.querySelector('.sol-menu-nav > button[role="menuitem"] .sol-menu-icon svg');
    expect(svg).toBeTruthy();
  });

  test('renders submenu as collapsible group', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const group = el.shadowRoot.querySelector('.sol-menu-group');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const leaves = el.shadowRoot.querySelectorAll('.sol-menu-nav > button[role="menuitem"]');
    const groupBtns = el.shadowRoot.querySelectorAll('.sol-menu-group-btn[role="menuitem"]');
    expect(leaves.length).toBeGreaterThan(0);
    expect(groupBtns.length).toBeGreaterThan(0);
  });

  test('active item has aria-current=page, others have it removed', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const activeBtn = el.shadowRoot.querySelector('.sol-menu-nav button.active');
    expect(activeBtn.getAttribute('aria-current')).toBe('page');

    const inactive = el.shadowRoot.querySelectorAll('.sol-menu-nav > button[role="menuitem"]:not(.active)');
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

    const popup = el.shadowRoot.querySelector('.sol-menu-popup');
    expect(popup.getAttribute('role')).toBe('menu');
    expect(popup.getAttribute('aria-label')).toBe('Settings');
  });

  test('items inside submenu popup have role=menuitem', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const menuitem = el.shadowRoot.querySelector('.sol-menu-popup button[role="menuitem"]');
    expect(menuitem).toBeTruthy();
    expect(menuitem.textContent).toBe('Light');
  });

  test('group button has aria-haspopup=menu and aria-expanded', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.shadowRoot.querySelector('.sol-menu-group-btn');
    expect(groupBtn.getAttribute('role')).toBe('menuitem');
    expect(groupBtn.getAttribute('aria-haspopup')).toBe('menu');
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
  });

  test('roving tabindex: only one button has tabindex=0', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowRight');
    expect(btns[1].getAttribute('tabindex')).toBe('0');
    expect(el.shadowRoot.activeElement).toBe(btns[1]);
  });

  test('ArrowLeft moves focus to previous button (horizontal)', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[1].focus();
    btns[1].setAttribute('tabindex', '0');
    press(btns[1], 'ArrowLeft');
    expect(btns[0].getAttribute('tabindex')).toBe('0');
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
  });

  test('ArrowRight wraps from last to first', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    const last = btns[btns.length - 1];
    last.focus();
    last.setAttribute('tabindex', '0');
    press(last, 'ArrowRight');
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
  });

  test('Home moves focus to first button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[2].focus();
    btns[2].setAttribute('tabindex', '0');
    press(btns[2], 'Home');
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
  });

  test('End moves focus to last button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'End');
    expect(el.shadowRoot.activeElement).toBe(btns[btns.length - 1]);
  });

  test('Escape closes open popup and returns focus to group button', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const group = el.shadowRoot.querySelector('.sol-menu-group');
    const groupBtn = group.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(group.classList.contains('open')).toBe(true);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('true');

    const popupBtn = group.querySelector('.sol-menu-popup button');
    popupBtn.focus();
    press(popupBtn, 'Escape');
    expect(group.classList.contains('open')).toBe(false);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
    expect(el.shadowRoot.activeElement).toBe(groupBtn);
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowDown');
    expect(el.shadowRoot.activeElement).toBe(btns[1]);

    press(btns[1], 'ArrowUp');
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
    const btns = Array.from(nav.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
    btns[0].focus();
    press(btns[0], 'ArrowRight');
    expect(el.shadowRoot.activeElement).toBe(btns[0]);
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
    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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
    const lb = s(base2 + '#_l1');
    store2.add(s(base2 + '#M'), s(UI + 'parts'), lb);
    store2.add(lb, s(RDF + 'first'), s(base2 + '#Only'));
    store2.add(lb, s(RDF + 'rest'), s(RDF + 'nil'));
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const group = el.shadowRoot.querySelector('.sol-menu-group');
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
    el.setAttribute('handler', 'sol-query');
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
    el.setAttribute('handler', 'sol-include');
    el.innerHTML = '<a href="data.ttl" handler="sol-query">Data</a>';
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

// ── Multiple ui:attribute on a ui:Component ──────────────────────────────────

describe('SolMenu — multiple ui:attribute', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('all attributes set on the component element', async () => {
    const s = (v) => rdflib.sym(v);
    const l = (v) => rdflib.literal(v);
    const param2 = s(BASE + '#_param2');
    mockStore.add(s(BASE + '#About'), s(UI + 'attribute'), param2);
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
    const lb = s(base + '#_l1');
    store.add(s(base + '#M'), s(UI + 'parts'), lb);
    store.add(lb, s(RDF + 'first'), s(base + '#Item'));
    store.add(lb, s(RDF + 'rest'), s(RDF + 'nil'));
    store.add(s(base + '#Item'), s(UI + 'label'), l('Page'));
    store.add(s(base + '#Item'), s(UI + 'href'), s('http://example.org/page.html'));
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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

    const nav = el.shadowRoot.querySelector('.sol-menu-nav');
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
    const lb = s(BASE + '#_l1');
    const lb2 = s(BASE + '#_l2');
    store.add(s(BASE + '#M'), s(UI + 'parts'), lb);
    store.add(lb, s(RDF + 'first'), s(BASE + '#A'));
    store.add(lb, s(RDF + 'rest'), lb2);
    store.add(lb2, s(RDF + 'first'), s(BASE + '#B'));
    store.add(lb2, s(RDF + 'rest'), s(RDF + 'nil'));
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

    const group = el.shadowRoot.querySelector('.sol-menu-group');
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

    const groupBtn = el.shadowRoot.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    groupBtn.click();
    const group = el.shadowRoot.querySelector('.sol-menu-group');
    expect(group.classList.contains('open')).toBe(false);
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking outside closes all popups', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.shadowRoot.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(el.shadowRoot.querySelector('.sol-menu-group.open')).toBeTruthy();

    document.body.click();
    expect(el.shadowRoot.querySelector('.sol-menu-group.open')).toBeFalsy();
  });

  test('selecting item inside popup closes all popups', async () => {
    const el = attached(document.createElement('sol-menu'));
    el.setAttribute('from-rdf', BASE + '#Main');
    await flush();

    const groupBtn = el.shadowRoot.querySelector('.sol-menu-group-btn');
    groupBtn.click();

    const popupBtn = el.shadowRoot.querySelector('.sol-menu-popup button');
    popupBtn.click();
    expect(el.shadowRoot.querySelector('.sol-menu-group.open')).toBeFalsy();
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

    const groupBtn = el.shadowRoot.querySelector('.sol-menu-group-btn');
    groupBtn.click();
    expect(el.shadowRoot.querySelector('.sol-menu-group.open')).toBeTruthy();

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

    const items = el.shadowRoot.querySelectorAll('.sol-menu-nav > button[role="menuitem"]');
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

// ── command items (ui:Component whose ui:name is a registry key) ─────────────

function buildCommandStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#Main'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#Main'), s(UI + 'label'), l('main'));
  const b1 = s(BASE + '#_c1'), b2 = s(BASE + '#_c2');
  store.add(s(BASE + '#Main'), s(UI + 'parts'), b1);
  store.add(b1, s(RDF + 'first'), s(BASE + '#Home'));
  store.add(b1, s(RDF + 'rest'), b2);
  store.add(b2, s(RDF + 'first'), s(BASE + '#Install'));
  store.add(b2, s(RDF + 'rest'), s(RDF + 'nil'));

  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(UI + 'href'), s('http://example.org/home.html'));

  // ui:name "installPod" — no hyphen → a command, not an element tag.
  store.add(s(BASE + '#Install'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#Install'), s(UI + 'label'), l('Install on my Pod'));
  store.add(s(BASE + '#Install'), s(UI + 'name'), l('installPod'));
  const p = s(BASE + '#_p');
  store.add(s(BASE + '#Install'), s(UI + 'attribute'), p);
  store.add(p, s(SCHEMA + 'name'), l('target'));
  store.add(p, s(SCHEMA + 'value'), l('pod'));
  return store;
}

const cmdBtn = (el) =>
  [...el.shadowRoot.querySelectorAll('.sol-menu-nav > button[role="menuitem"]')]
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
