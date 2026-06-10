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
// `from-rdf`/`source` is now an opt-in capability — install the loader the way
// the web/menu-from-rdf.js add-on does on a real page (rdf-utils is mocked above).
const { loadMenuFromUri } = await import('../../core/menu-rdf.js');
SolDropdownButton.fromRdfLoader = loadMenuFromUri;

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
    el.setAttribute('source', BASE + '#More');
    await flush();

    expect(trigger(el)).toBeTruthy();
    expect(trigger(el).textContent).toBe('⋮');
    expect(popup(el).hidden).toBe(true);
    expect(el.activeItem).toBeNull();       // no content panel → no pre-select
  });

  test('clicking the trigger opens the popup with one button per item', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('source', BASE + '#More');
    await flush();

    trigger(el).click();
    expect(popup(el).hidden).toBe(false);
    expect(items(el).map(b => b.textContent)).toEqual(['Install', 'Home']);
    expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
  });

  test('from-rdf still works as a fallback for source', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('from-rdf', BASE + '#More');
    await flush();

    trigger(el).click();
    expect(items(el).map(b => b.textContent)).toEqual(['Install', 'Home']);
  });

  test('clicking a command dispatches sol-command and closes the popup', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('source', BASE + '#More');
    await flush();
    trigger(el).click();

    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    items(el).find(b => b.textContent === 'Install').click();

    expect(detail).toEqual(expect.objectContaining({ command: 'installPod', params: { target: 'pod' } }));
    expect(popup(el).hidden).toBe(true);    // dropdown closed after the command
  });
});

// ── access requirements (acl:Write) ─────────────────────────────────────────

const ACL = 'http://www.w3.org/ns/auth/acl#';

function buildGatedStore() {
  const store = rdflib.graph();
  const s = (v) => rdflib.sym(v);
  const l = (v) => rdflib.literal(v);
  store.add(s(BASE + '#G'), s(RDF + 'type'), s(UI + 'Menu'));
  store.add(s(BASE + '#G'), s(UI + 'label'), l('G'));
  const b1 = s(BASE + '#_g1'), b2 = s(BASE + '#_g2');
  store.add(s(BASE + '#G'), s(UI + 'parts'), b1);
  store.add(b1, s(RDF + 'first'), s(BASE + '#Public'));
  store.add(b1, s(RDF + 'rest'), b2);
  store.add(b2, s(RDF + 'first'), s(BASE + '#Secret'));
  store.add(b2, s(RDF + 'rest'), s(RDF + 'nil'));
  store.add(s(BASE + '#Public'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#Public'), s(UI + 'label'), l('Public'));
  store.add(s(BASE + '#Public'), s(UI + 'name'), l('publicCmd'));
  store.add(s(BASE + '#Secret'), s(RDF + 'type'), s(UI + 'Component'));
  store.add(s(BASE + '#Secret'), s(UI + 'label'), l('Secret'));
  store.add(s(BASE + '#Secret'), s(UI + 'name'), l('secretCmd'));
  store.add(s(BASE + '#Secret'), s(ACL + 'mode'), s(ACL + 'Write'));   // requires write
  return store;
}

describe('SolDropdownButton — access requirements', () => {
  beforeEach(() => { mockStore = buildGatedStore(); });

  test('renders all items; marks acl:Write items part="requires-write" (no policy)', async () => {
    const el = attached(document.createElement('sol-dropdown-button'));
    el.setAttribute('source', BASE + '#G');
    await flush();

    // The component does NOT hide — both items render.
    expect(items(el).map(b => b.textContent)).toEqual(['Public', 'Secret']);

    const part = (label) => items(el).find(b => b.textContent === label).getAttribute('part') || '';
    expect(part('Secret').split(/\s+/)).toContain('requires-write');   // exposed for the app
    expect(part('Public')).not.toMatch(/requires-write/);              // no requirement
  });
});

// ── declarative <menu> (no source / no RDF) ─────────────────────────────────

describe('SolDropdownButton — inline <menu>', () => {
  // Children must exist before the element connects (connectedCallback harvests
  // once, guarded by _rendered), so set innerHTML before appending.
  function mountMenu(inner) {
    const el = document.createElement('sol-dropdown-button');
    el.setAttribute('label', '⋮');
    el.innerHTML = inner;
    return attached(el);
  }

  test('harvests a <menu> of command items; dispatches + gates like the RDF form', async () => {
    const el = mountMenu(`
      <menu>
        <button data-handler="guestView">View as guest</button>
        <button data-handler="installPod" requires-write>Install on my Pod…</button>
      </menu>`);
    await flush();

    trigger(el).click();
    expect(items(el).map(b => b.textContent)).toEqual(['View as guest', 'Install on my Pod…']);

    // requires-write surfaces as a part for the app to gate.
    const part = (label) => items(el).find(b => b.textContent === label).getAttribute('part') || '';
    expect(part('Install on my Pod…').split(/\s+/)).toContain('requires-write');
    expect(part('View as guest')).not.toMatch(/requires-write/);

    // clicking a command dispatches sol-command and closes.
    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    items(el).find(b => b.textContent === 'View as guest').click();
    expect(detail).toEqual(expect.objectContaining({ command: 'guestView' }));
    expect(popup(el).hidden).toBe(true);
  });

  test('parses a JSON params attribute', async () => {
    const el = mountMenu(`<menu><button data-handler="go" params='{"to":"x"}'>Go</button></menu>`);
    await flush();
    trigger(el).click();
    let detail = null;
    el.addEventListener('sol-command', (e) => { detail = e.detail; });
    items(el)[0].click();
    expect(detail.params).toEqual({ to: 'x' });
  });
});
