/**
 * @jest-environment jsdom
 *
 * Tests for <sol-solidos> — the thin host that renders mashlib's SolidOS data
 * browser into its own light DOM and (optionally) prepends a location bar.
 *
 * What's deterministic and tested here:
 *   - registration + observedAttributes
 *   - the "mashlib not loaded" fallback when getMashlib() returns null
 *   - the DOM scaffold _init() builds for mashlib (ids it expects), and that
 *     it passes the `source` URI (or window.location.href) to initMainPage
 *   - _hasBar() attribute logic (off by default; has-location-bar="false" off)
 *   - the location bar markup + the `locations` setter/getter and its <option>
 *     rendering (bare host → trailing slash + host-only label)
 *   - the GotoSubject wrapper keeping the bar's input / back-stack in sync
 *   - attributeChangedCallback('source') routing through GotoSubject
 *
 * Not tested (genuinely untestable / out of scope): the actual SolidOS render
 * that mashlib performs inside the scaffold (we stub mashlib), the global
 * window.fetch auth patch (it's a one-shot global side-effect guarded by a
 * window flag and best left to live e2e), and _fitChrome()'s ResizeObserver/RAF
 * layout measuring (jsdom reports zero box metrics, so nothing real to assert).
 */

import SolSolidos from '../../web/sol-solidos.js';

window.__SolSuppressDefineWarn = true;

// ── a synthetic mashlib that records the calls sol-solidos makes ─────────────
//
// _init() reads: m.SolidLogic?.solidLogicSingleton?.store, m.panes.getOutliner,
// m.initMainPage(store, uri), and (via _goTo) m.$rdf.sym(uri). We hand it a
// stub that records initMainPage args and a fake outliner whose GotoSubject
// pushes to a calls array.
function installMashlib() {
  const gotoCalls = [];
  const initMainPageCalls = [];
  const outliner = {
    GotoSubject(subject) { gotoCalls.push(subject && subject.uri); },
  };
  const store = { __isStore: true };
  // Mashlib global is only { versionInfo, initMainPage }; panes carries the rest.
  window.Mashlib = { initMainPage: (s, uri) => initMainPageCalls.push([s, uri]) };
  window.panes = { getOutliner: () => outliner };
  window.SolidLogic = { solidLogicSingleton: { store } };
  window.$rdf = { sym: (uri) => ({ uri }) };
  return { gotoCalls, initMainPageCalls, outliner, store };
}

function uninstallMashlib() {
  delete window.Mashlib;
  delete window.panes;
  delete window.SolidLogic;
  delete window.$rdf;
}

// jsdom doesn't supply window.fetch; _init() one-shot-patches it (binds it) to
// route mashlib's reads through the page's authenticated fetch, so give it a
// real function to wrap. Saved/restored so the global side-effect doesn't leak.
let _nativeFetch;
beforeEach(() => {
  _nativeFetch = window.fetch;
  window.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
});

afterEach(() => {
  document.body.innerHTML = '';
  uninstallMashlib();
  delete window.__solSolidosFetchPatched;
  window.fetch = _nativeFetch;
});

// ── registration ─────────────────────────────────────────────────────────────

describe('SolSolidos — registration', () => {
  test('the module registers <sol-solidos>', () => {
    expect(customElements.get('sol-solidos')).toBe(SolSolidos);
  });

  test('observes source and has-location-bar', () => {
    expect(SolSolidos.observedAttributes).toEqual(['source', 'has-location-bar']);
  });
});

// ── mashlib-missing fallback ──────────────────────────────────────────────────

describe('SolSolidos — without mashlib', () => {
  test('renders the "mashlib not loaded" message and stays not-ready', () => {
    uninstallMashlib();                       // make sure no stub is present
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);            // connectedCallback → _init
    expect(el.textContent).toMatch(/mashlib not loaded/);
    expect(el._ready).toBe(false);            // didn't complete init
    expect(el.querySelector('#OutlineView')).toBeNull(); // no scaffold built
  });
});

// ── scaffold + initMainPage ───────────────────────────────────────────────────

describe('SolSolidos — _init scaffold with mashlib present', () => {
  test('builds the DOM ids mashlib 2.x fills, and is ready', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);
    expect(el._ready).toBe(true);
    for (const id of ['mainSolidUiHeader', 'MainContent', 'NavMenu',
                      'OutlineView', 'GlobalDashboard', 'PageFooter']) {
      expect(el.querySelector('#' + id)).not.toBeNull();
    }
  });

  test('passes the source attribute (and the stored store) to initMainPage', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('source', 'https://pod.example/foo/');
    document.body.appendChild(el);
    expect(m.initMainPageCalls).toHaveLength(1);
    const [store, uri] = m.initMainPageCalls[0];
    expect(store).toBe(m.store);
    expect(uri).toBe('https://pod.example/foo/');
  });

  test('falls back to window.location.href when no source attribute', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);
    expect(m.initMainPageCalls[0][1]).toBe(window.location.href);
  });

  test('the injected host style forces [hidden] to win inside the embed', () => {
    // mash.css ships "article, aside, section { display: block }", which as an
    // author rule defeats the UA's [hidden] { display: none } — the empty
    // #NavMenu scaffold then paints as a fixed rail covering the app on
    // narrow screens (data-kitchen #73). The host style must out-rank it.
    installMashlib();
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);
    const style = document.getElementById('sol-solidos-style');
    expect(style).not.toBeNull();
    expect(style.textContent).toMatch(/sol-solidos \[hidden\]\s*\{\s*display:\s*none\s*!important/);
    expect(el.querySelector('#NavMenu').hasAttribute('hidden')).toBe(true);
  });

  test('connectedCallback is idempotent — re-appending does not re-init', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);
    el.remove();
    document.body.appendChild(el);            // connected again
    expect(m.initMainPageCalls).toHaveLength(1);  // _ready guard held
  });
});

// ── _hasBar() / location bar presence ─────────────────────────────────────────

describe('SolSolidos — has-location-bar', () => {
  test('no bar by default', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    document.body.appendChild(el);
    expect(el.querySelector('.sol-location-bar')).toBeNull();
  });

  test('has-location-bar (bare) renders the bar above mashlib\'s header', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', '');
    document.body.appendChild(el);
    const bar = el.querySelector('.sol-location-bar');
    expect(bar).not.toBeNull();
    // bar is prepended before the SolidOS header
    expect(bar.nextElementSibling.id).toBe('mainSolidUiHeader');
    // input seeds to the home (source) URI
    expect(bar.querySelector('[data-loc]').value).toBe(window.location.href);
  });

  test('has-location-bar="false" suppresses the bar', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', 'false');
    document.body.appendChild(el);
    expect(el.querySelector('.sol-location-bar')).toBeNull();
  });
});

// ── locations setter/getter + <option> rendering ──────────────────────────────

describe('SolSolidos — locations dropdown', () => {
  test('setter filters falsy entries and the getter returns a copy', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    el.locations = ['https://a.example/', null, 'https://b.example/', ''];
    expect(el.locations).toEqual(['https://a.example/', 'https://b.example/']);
    el.locations.push('mutate-me');           // getter copy
    expect(el.locations).toEqual(['https://a.example/', 'https://b.example/']);
  });

  test('non-array input resets to empty', () => {
    const el = document.createElement('sol-solidos');
    el.locations = 'not-an-array';
    expect(el.locations).toEqual([]);
  });

  test('renders one <option> per location with a host-only label and trailing slash', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', '');
    document.body.appendChild(el);            // bar present → select exists
    el.locations = ['https://alice.pod.example', 'https://bob.pod.example/x/'];
    const sel = el.querySelector('.sol-location-bar [data-locations]');
    expect(sel.hidden).toBe(false);
    const opts = [...sel.querySelectorAll('option')];
    // first is the placeholder, then one per location
    expect(opts[0].value).toBe('');
    expect(opts[1].value).toBe('https://alice.pod.example/');   // trailing slash added
    expect(opts[1].textContent).toBe('alice.pod.example');      // host-only label
    expect(opts[2].value).toBe('https://bob.pod.example/x/');   // already slashed
    expect(opts[2].textContent).toBe('bob.pod.example');
  });

  test('an empty location list hides the select', () => {
    installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', '');
    document.body.appendChild(el);
    el.locations = [];
    expect(el.querySelector('.sol-location-bar [data-locations]').hidden).toBe(true);
  });
});

// ── GotoSubject wrapper keeps the bar in sync ─────────────────────────────────

describe('SolSolidos — bar sync via the GotoSubject wrapper', () => {
  test('a navigation reflects into the input + enables Back after two hops', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', '');
    el.setAttribute('source', 'https://pod.example/');
    document.body.appendChild(el);

    const input = el.querySelector('[data-loc]');
    const back = el.querySelector('[data-act="back"]');
    expect(back.disabled).toBe(true);         // only home on the stack

    // drive the wrapped outliner the way a link-click would
    m.outliner.GotoSubject(window.$rdf.sym('https://pod.example/notes/'));
    expect(input.value).toBe('https://pod.example/notes/');
    expect(back.disabled).toBe(false);        // home + notes → can go back
  });

  test('the Go button normalizes a bare host and routes through GotoSubject', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('has-location-bar', '');
    document.body.appendChild(el);

    const input = el.querySelector('[data-loc]');
    input.value = 'alice.pod.example';        // bare host → https://
    el.querySelector('[data-act="go"]').click();
    expect(m.gotoCalls).toContain('https://alice.pod.example');
  });
});

// ── attributeChangedCallback ──────────────────────────────────────────────────

describe('SolSolidos — attributeChangedCallback', () => {
  test('changing source after init navigates via GotoSubject', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');
    el.setAttribute('source', 'https://pod.example/');
    document.body.appendChild(el);
    expect(el._ready).toBe(true);

    el.setAttribute('source', 'https://pod.example/inbox/');
    expect(m.gotoCalls).toContain('https://pod.example/inbox/');
  });

  test('changing source before init does nothing (no outliner yet)', () => {
    const m = installMashlib();
    const el = document.createElement('sol-solidos');     // not connected → not ready
    el.setAttribute('source', 'https://pod.example/');
    el.setAttribute('source', 'https://pod.example/two/');
    expect(m.gotoCalls).toEqual([]);
  });
});
