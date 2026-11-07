/**
 * @jest-environment jsdom
 *
 * Tests for <sol-search> — the multi-engine search form (web/sol-search.js).
 *
 * The deterministic seams covered here are registration, the two layouts
 * (view="button" popup vs view="inline"), engine-list rendering from the
 * built-in defaults and from the `engines` JSON attribute, default-engine
 * selection, the placeholder attribute, and — the heart of the component —
 * the submit path that expands the selected engine into a result URL and
 * hands it to the shared reader window. `window.open` is stubbed so the
 * built URL can be asserted without opening a real tab.
 *
 * RDF `source` lists go through feed-fetch.js#parseEngineList →
 * enginesFromRdf, which calls `store.statementsMatching`. The test rdflib
 * mock's store exposes only `match`/`any`/`each` (no `statementsMatching`),
 * so it cannot parse a schema:ItemList here — the source-loading branch is
 * therefore exercised only for its failure behaviour (defaults stay put,
 * a console.warn is emitted). The position-sorting/template logic of
 * enginesFromRdf is left to the integration layer; see the note at the foot
 * of this file.
 */

window.__SolSuppressDefineWarn = true;

// ── window.open stub (the shared reader window) ──────────────────────────────

/** Handles handed out by stubWindowOpen — closed in afterEach so the module's
 *  shared `readerWindow` doesn't bleed across tests (a still-open handle would
 *  make the next submit re-use it instead of calling window.open afresh). */
const _openedHandles = [];

/** Replace window.open with a recorder. Each call pushes { url, name, features }
 *  and returns a fake window handle (focusable, not closed) so openInReader()
 *  treats the open as successful and re-uses the handle on the next submit. */
function stubWindowOpen() {
  const opens = [];
  const handle = { closed: false, focus() {}, location: { href: '' } };
  _openedHandles.push(handle);
  window.open = (url, name, features) => {
    opens.push({ url, name, features });
    handle.location.href = url;
    return handle;
  };
  opens.handle = handle;
  return opens;
}

let _origOpen;
beforeAll(async () => {
  _origOpen = window.open;
  // window.screen is read by readerFeatures(); jsdom provides it, but be safe.
  if (!window.screen) window.screen = { availWidth: 1280, availHeight: 800 };
  await import('../../web/sol-search.js');
});

afterAll(() => { window.open = _origOpen; });

afterEach(() => {
  document.body.innerHTML = '';
  // Close every reader handle so the module's shared readerWindow is stale and
  // the next test's first submit calls window.open again.
  for (const h of _openedHandles) h.closed = true;
  _openedHandles.length = 0;
});

async function settle() { await new Promise(r => setTimeout(r, 0)); }

/** Mount a <sol-search> with the given attribute string and return the element
 *  once its connectedCallback has settled. */
async function mount(attrs = '') {
  document.body.innerHTML = `<sol-search ${attrs}></sol-search>`;
  const el = document.querySelector('sol-search');
  await settle();
  return el;
}

/** All engine radios currently rendered in the shadow root. */
function radios(el) {
  return [...el.shadowRoot.querySelectorAll('input[type="radio"]')];
}

/** The checked engine radio, or null. */
function checked(el) {
  return el.shadowRoot.querySelector('input[type="radio"]:checked');
}

/** Type a query and submit the form. */
function submitWith(el, query) {
  el.$q.value = query;
  el.$form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

// ── registration ─────────────────────────────────────────────────────────────

describe('registration', () => {
  test('defines the <sol-search> custom element', () => {
    expect(customElements.get('sol-search')).toBeTruthy();
  });

  test('exposes the engines SHACL shape URL', () => {
    expect(customElements.get('sol-search').shape).toMatch(/search-engines\.shacl$/);
  });
});

// ── layout / view ────────────────────────────────────────────────────────────

describe('view layouts', () => {
  test('defaults to view="button": a trigger + a closed panel', async () => {
    const el = await mount();
    expect(el.dataset.view).toBe('button');
    expect(el.shadowRoot.querySelector('button.icon')).not.toBeNull();
    const panel = el.shadowRoot.querySelector('.panel');
    expect(panel).not.toBeNull();
    expect(panel.hasAttribute('open')).toBe(false);
    expect(el.shadowRoot.querySelector('form.form')).not.toBeNull();
  });

  test('view="inline" renders the form directly with no trigger/panel', async () => {
    const el = await mount('view="inline"');
    expect(el.dataset.view).toBe('inline');
    expect(el.shadowRoot.querySelector('button.icon')).toBeNull();
    expect(el.shadowRoot.querySelector('.panel')).toBeNull();
    expect(el.shadowRoot.querySelector('form.form')).not.toBeNull();
  });

  test('button view toggles the panel open/closed', async () => {
    const el = await mount();
    const btn = el.shadowRoot.querySelector('button.icon');
    const panel = el.shadowRoot.querySelector('.panel');

    btn.click();
    expect(el._open).toBe(true);
    expect(panel.hasAttribute('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    el.close();
    expect(el._open).toBe(false);
    expect(panel.hasAttribute('open')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  test('toggle()/close() are no-ops in inline view', async () => {
    const el = await mount('view="inline"');
    expect(() => { el.toggle(); el.close(); }).not.toThrow();
    expect(el._open).toBe(false);
  });
});

// ── floating panel placement ─────────────────────────────────────────────────

describe('floating panel placement', () => {
  /** Mount a button-view search and stub real-looking rects onto its trigger
   *  and panel (jsdom's own rects are all zeros): a 44px trigger in a bottom
   *  bar of a 1024×768 viewport, a 300×200 panel. */
  async function mountWithRects() {
    const el = await mount();
    el.$btn.getBoundingClientRect = () =>
      ({ left: 1000, right: 1044, top: 700, bottom: 744, width: 44, height: 44 });
    el.$panel.getBoundingClientRect = () =>
      ({ left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200 });
    return el;
  }

  const origMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = origMatchMedia; });

  test('fine pointer: drops below the trigger, clamped into the viewport', async () => {
    window.matchMedia = () => ({ matches: false });
    const el = await mountWithRects();
    el.openAtButton();
    // top = btn.bottom + 4 = 748, clamped to 768 − 200 − 10; left = 1044 − 300,
    // clamped to 1024 − 300 − 10.
    expect(el.$panel.style.top).toBe('558px');
    expect(el.$panel.style.left).toBe('714px');
  });

  test('coarse pointer: opens at the top of the viewport, clear of the keyboard', async () => {
    window.matchMedia = (q) => ({ matches: /coarse/.test(q) });
    const el = await mountWithRects();
    el.openAtButton();
    expect(el.$panel.style.top).toBe('10px');
    expect(el.$panel.style.left).toBe('714px');
  });
});

// ── engine list rendering ────────────────────────────────────────────────────

describe('engine list rendering', () => {
  test('renders the built-in default engines as radios', async () => {
    const el = await mount();
    const vals = radios(el).map(r => r.value);
    // The eight built-ins, by id.
    expect(vals).toEqual(['ddg', 'g', 'wp', 'prefix', 'lov', 'ety', 'yt', 'wayback']);
    // Labels come through in the adjacent <span>.
    const labels = [...el.shadowRoot.querySelectorAll('.engine span')].map(s => s.textContent);
    expect(labels).toContain('DuckDuckGo');
    expect(labels).toContain('Wikipedia');
  });

  test('the `engines` JSON attribute overrides the defaults', async () => {
    const json = JSON.stringify([
      { id: 'x', label: 'Xeno', url: 'https://xeno.example/?q=' },
      { id: 'y', label: 'Yotta', url: 'https://yotta.example/?s=' },
    ]);
    const el = await mount(`engines='${json}'`);
    expect(radios(el).map(r => r.value)).toEqual(['x', 'y']);
  });

  test('malformed `engines` JSON falls back to the defaults', async () => {
    const el = await mount(`engines='not json'`);
    expect(radios(el).map(r => r.value)).toEqual(
      ['ddg', 'g', 'wp', 'prefix', 'lov', 'ety', 'yt', 'wayback']);
  });

  test('the placeholder attribute is applied to the input', async () => {
    const el = await mount('placeholder="Find things"');
    expect(el.$q.getAttribute('placeholder')).toBe('Find things');
  });

  test('the input gets the default placeholder when none is set', async () => {
    const el = await mount();
    expect(el.$q.getAttribute('placeholder')).toBe('Search…');
  });
});

// ── default engine selection ─────────────────────────────────────────────────

describe('default engine', () => {
  test('DuckDuckGo is pre-selected by default (label-matched)', async () => {
    const el = await mount();
    expect(checked(el).value).toBe('ddg');
  });

  test('default-engine selects an engine by id', async () => {
    const el = await mount('default-engine="wp"');
    expect(checked(el).value).toBe('wp');
  });

  test('an unknown default-engine falls back to the first radio', async () => {
    const el = await mount('default-engine="nope"');
    expect(checked(el).value).toBe('ddg');     // first built-in
  });
});

// ── submit → result URL (template expansion / prefix append) ─────────────────

describe('search submit builds the result URL', () => {
  test('appends the encoded query to a url-prefix engine (built-in)', async () => {
    const opens = stubWindowOpen();
    const el = await mount('default-engine="g"');
    submitWith(el, 'hello world');
    expect(opens).toHaveLength(1);
    expect(opens[0].url).toBe('https://www.google.com/search?q=hello%20world');
    // It opened in the named shared reader window.
    expect(opens[0].name).toBe('sol-search-reader');
  });

  test('expands a {query} hydra-style template for a templated engine', async () => {
    const opens = stubWindowOpen();
    const json = JSON.stringify([
      { id: 'tpl', label: 'Templated', template: 'https://t.example/find?q={query}&n={query}' },
    ]);
    const el = await mount(`engines='${json}'`);
    submitWith(el, 'a & b');
    expect(opens).toHaveLength(1);
    // Both {query} occurrences are replaced with the encoded query.
    expect(opens[0].url).toBe('https://t.example/find?q=a%20%26%20b&n=a%20%26%20b');
  });

  test('uses the radio the user picked, not the default', async () => {
    const opens = stubWindowOpen();
    const el = await mount();                 // default ddg
    const wp = radios(el).find(r => r.value === 'wp');
    wp.checked = true;
    submitWith(el, 'rdf');
    expect(opens[0].url).toBe('https://en.wikipedia.org/w/index.php?search=rdf');
  });

  test('an empty / whitespace query does not open a window', async () => {
    const opens = stubWindowOpen();
    const el = await mount();
    submitWith(el, '   ');
    expect(opens).toHaveLength(0);
  });

  test('re-uses the shared reader window across submissions (one open)', async () => {
    const opens = stubWindowOpen();
    const el = await mount('view="inline" default-engine="ddg"');
    submitWith(el, 'first');
    submitWith(el, 'second');
    // window.open is called once; the second submit navigates the same handle.
    expect(opens).toHaveLength(1);
    expect(opens.handle.location.href)
      .toBe('https://duckduckgo.com/?q=second');
  });

  test('submitting in button view closes the panel', async () => {
    const opens = stubWindowOpen();
    const el = await mount();
    el.toggle();                              // open
    expect(el._open).toBe(true);
    submitWith(el, 'close me');
    expect(opens).toHaveLength(1);
    expect(el._open).toBe(false);
  });
});

// ── source attribute (rdflib-mock limited) ───────────────────────────────────

describe('source attribute (RDF engine list)', () => {
  // The rdflib mock store gained statementsMatching (2026-07-20, for the
  // plugin-creator suite), so enginesFromRdf can now walk the schema:ItemList
  // and the source REPLACES the default engines.
  test('a parsable source replaces the default engines', async () => {
    const ITEMLIST_TTL = `
      @prefix schema: <http://schema.org/> .
      @prefix hydra:  <http://www.w3.org/ns/hydra/core#> .
      @prefix dct:    <http://purl.org/dc/terms/> .
      <#SearchEngines> a schema:ItemList ;
        schema:itemListElement <#ddg> , <#g> .
      <#ddg> a hydra:IriTemplate ; dct:title "DuckDuckGo" ; schema:position "1" ;
        hydra:template "https://duckduckgo.com/?q={query}" .
      <#g>   a hydra:IriTemplate ; dct:title "Google" ; schema:position "2" ;
        hydra:template "https://www.google.com/search?q={query}" .`;
    global.fetch = () => Promise.resolve({
      ok: true, status: 200, text: () => Promise.resolve(ITEMLIST_TTL),
    });
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      const el = await mount('source="engines.ttl#SearchEngines"');
      expect(radios(el).map(r => r.value)).toEqual(['ddg', 'g']);
      expect(warns.some(w => /sol-search] source/.test(w))).toBe(false);
    } finally {
      console.warn = origWarn;
      delete global.fetch;
    }
  });
});

/*
 * Deliberately NOT tested, and why:
 *
 *  - enginesFromRdf's actual parse + position-sort + label fallback chain
 *    (dct:title → schema:name → rdfs:label → fragment). The test rdflib mock
 *    exposes no `store.statementsMatching`, so the ItemList walk can't run in
 *    this environment; forcing it would mean asserting against a bespoke
 *    parser, not the real one. That logic belongs to an integration test with
 *    a genuine rdflib (matching how feed-fetch.test.js scopes out the RDF
 *    source readers).
 *
 *  - Floating-panel geometry against REAL layout. jsdom reports zero-sized
 *    rects, so the placement tests above stub the trigger/panel rects and
 *    assert the component's own math (branch choice + clamping); how those
 *    rects arise from real layout is browser territory.
 *
 *  - The popup-blocked fall-through (window.open returns null → second
 *    window.open with _blank). The stub always returns a live handle so the
 *    primary reader path is exercised; the fallback is a one-line branch.
 */

