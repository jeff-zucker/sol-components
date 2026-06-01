/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://example.org/"}
 *
 * Tests for <sol-dropdown-button> — a <sol-menu> subclass that renders a
 * trigger button whose click drops the RDF menu items in a popup:
 *   - trigger renders; popup starts hidden; nothing auto-selected
 *   - clicking the trigger opens the popup with one button per item
 *   - clicking a command item dispatches sol-command and closes the popup
 */

import { jest } from '@jest/globals';
import rdflib from '../__mocks__/rdflib-esm.js';
window.$rdf = rdflib;
window.__SolSuppressDefineWarn = true;

const UI = 'http://www.w3.org/ns/ui#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SCHEMA = 'http://schema.org/';
const BASE = 'http://example.org/menu.ttl';

let mockStore;
jest.unstable_mockModule('../../core/rdf-utils.js', () => ({
  loadRdfStore: jest.fn(async () => mockStore),
}));

const { SolDropdownButton } = await import('../../web/sol-dropdown-button.js');

function buildStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);

  store.add(s(BASE + '#More'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#More'), s(UI + 'label'), l('More'));
  const b1 = s(BASE + '#_m1'), b2 = s(BASE + '#_m2');
  store.add(s(BASE + '#More'), s(UI + 'parts'), b1);
  store.add(b1, s(RDF + 'first'), s(BASE + '#Install'));
  store.add(b1, s(RDF + 'rest'), b2);
  store.add(b2, s(RDF + 'first'), s(BASE + '#Home'));
  store.add(b2, s(RDF + 'rest'), s(RDF + 'nil'));

  // command (bare ui:name) + params
  store.add(s(BASE + '#Install'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#Install'), s(UI + 'label'), l('Install'));
  store.add(s(BASE + '#Install'), s(UI + 'name'), l('installPod'));
  const p = s(BASE + '#_p');
  store.add(s(BASE + '#Install'), s(UI + 'attribute'), p);
  store.add(p, s(SCHEMA + 'name'), l('target'));
  store.add(p, s(SCHEMA + 'value'), l('pod'));

  // a plain link
  store.add(s(BASE + '#Home'), s(RDF + 'type'), s(UI + 'Link'));
  store.add(s(BASE + '#Home'), s(UI + 'label'), l('Home'));
  store.add(s(BASE + '#Home'), s(UI + 'href'), s('http://example.org/home.html'));
  return store;
}

function attached(el) { document.body.appendChild(el); return el; }
function flush() { return new Promise((r) => setTimeout(r, 0)); }

const trigger = (el) => el.shadowRoot.querySelector('.sol-dd-trigger');
const popup = (el) => el.shadowRoot.querySelector('.sol-dd-popup');
const items = (el) => [...popup(el).querySelectorAll(':scope > button[role="menuitem"]')];

afterEach(() => { document.body.innerHTML = ''; });

describe('SolDropdownButton', () => {
  beforeEach(() => { mockStore = buildStore(); });

  test('it is a SolMenu subclass', () => {
    const el = document.createElement('sol-dropdown-button');
    expect(el instanceof SolDropdownButton).toBe(true);
  });

  test('renders a trigger, popup starts hidden, nothing auto-selected', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('label', '⋮');
    el.setAttribute('from-rdf', BASE + '#More');
    await flush();

    expect(trigger(el)).toBeTruthy();
    expect(trigger(el).textContent).toBe('⋮');
    expect(popup(el).hidden).toBe(true);
    expect(el.activeItem).toBeNull();       // no content panel → no pre-select
  });

  test('clicking the trigger opens the popup with one button per item', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('from-rdf', BASE + '#More');
    await flush();

    trigger(el).click();
    expect(popup(el).hidden).toBe(false);
    expect(items(el).map(b => b.textContent)).toEqual(['Install', 'Home']);
    expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
  });

  test('clicking a command dispatches sol-command and closes the popup', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('from-rdf', BASE + '#More');
    await flush();
    trigger(el).click();

    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    items(el).find(b => b.textContent === 'Install').click();

    expect(detail).toEqual(expect.objectContaining({ command: 'installPod', params: { target: 'pod' } }));
    expect(popup(el).hidden).toBe(true);    // dropdown closed after the command
  });
});
