/**
 * @jest-environment jsdom
 */

/**
 * Tests for <sol-button>'s region="inline" mode: a toggle that mounts the
 * handler inline into a page-declared host, non-keep-alive.
 */

window.__SolSuppressDefineWarn = true;

function mockFetch(body = '<p>content</p>', { contentType = 'text/html' } = {}) {
  global.fetch = () => Promise.resolve({
    ok: true, status: 200,
    headers: new Map([['content-type', contentType]]),
    text: () => Promise.resolve(body),
  });
}

beforeAll(async () => {
  // Define sol-include first so ensureHandler() finds it (no dynamic import).
  await import('../../web/sol-include.js');
  await import('../../web/sol-button.js');
});

beforeEach(() => { mockFetch(); });
afterEach(() => { document.body.innerHTML = ''; });

function trigger(el) { return el.shadowRoot.querySelector('.sol-button-trigger'); }

async function settle() { await new Promise(r => setTimeout(r, 20)); }

function mountButton(extra = '') {
  document.body.innerHTML = `
    <div id="host"></div>
    <sol-button id="b" data-handler="sol-include" inline for="#host"
                source="help.html" trusted ${extra}>?</sol-button>`;
  return document.getElementById('b');
}

describe('inline region', () => {
  test('first click mounts the handler inline into the for-host', async () => {
    const b = mountButton();
    await settle();
    expect(document.querySelector('#host .sol-inline-panel')).toBeNull(); // not until clicked

    trigger(b).click();
    await settle();
    const panel = document.querySelector('#host .sol-inline-panel');
    expect(panel).not.toBeNull();
    expect(panel.querySelector('sol-include')).not.toBeNull();
    expect(panel.querySelector('sol-include').getAttribute('source')).toBe('help.html');
  });

  test('reflects open state on the button + trigger', async () => {
    const b = mountButton();
    await settle();
    trigger(b).click();
    await settle();
    expect(b.hasAttribute('open')).toBe(true);
    expect(trigger(b).getAttribute('aria-expanded')).toBe('true');
    expect(b.inlineOpen).toBe(true);
  });

  test('second click removes it (toggle, non-keep-alive)', async () => {
    const b = mountButton();
    await settle();
    trigger(b).click(); await settle();
    const first = document.querySelector('#host .sol-inline-panel');

    trigger(b).click(); await settle();
    expect(document.querySelector('#host .sol-inline-panel')).toBeNull();
    expect(b.hasAttribute('open')).toBe(false);
    expect(trigger(b).getAttribute('aria-expanded')).toBe('false');

    // reopening builds a FRESH element (non-keep-alive)
    trigger(b).click(); await settle();
    const second = document.querySelector('#host .sol-inline-panel');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  test('close() dismisses the panel', async () => {
    const b = mountButton();
    await settle();
    trigger(b).click(); await settle();
    expect(b.inlineOpen).toBe(true);
    b.close();
    expect(b.inlineOpen).toBe(false);
    expect(document.querySelector('#host .sol-inline-panel')).toBeNull();
  });

  test('emits sol-button-activate with open true/false', async () => {
    const b = mountButton();
    await settle();
    const seen = [];
    b.addEventListener('sol-button-activate', (e) => seen.push(e.detail.open));
    trigger(b).click(); await settle();
    trigger(b).click(); await settle();
    expect(seen).toEqual([true, false]);
  });

  test('defaults to the button\'s parent when no for= and no cascade', async () => {
    document.body.innerHTML = `
      <div id="wrap">
        <sol-button id="b2" data-handler="sol-include" inline
                    source="help.html" trusted>?</sol-button>
      </div>`;
    const b = document.getElementById('b2');
    await settle();
    trigger(b).click(); await settle();
    expect(document.querySelector('#wrap > .sol-inline-panel')).not.toBeNull();
  });

  test('host resolves from <sol-default region="#host"> cascade (not on the button)', async () => {
    document.body.innerHTML = `
      <div id="host"></div>
      <sol-default region="#host"></sol-default>
      <sol-button id="b3" data-handler="sol-include" inline source="help.html" trusted>?</sol-button>`;
    const b = document.getElementById('b3');
    await settle();
    trigger(b).click(); await settle();
    expect(document.querySelector('#host > .sol-inline-panel')).not.toBeNull();
  });

  test('a parent [region] host also works', async () => {
    document.body.innerHTML = `
      <div id="host"></div>
      <div region="#host">
        <sol-button id="b4" data-handler="sol-include" inline source="help.html" trusted>?</sol-button>
      </div>`;
    const b = document.getElementById('b4');
    await settle();
    trigger(b).click(); await settle();
    expect(document.querySelector('#host > .sol-inline-panel')).not.toBeNull();
  });
});

describe('<sol-button data-handler="<action>">', () => {
  test('a bare-name handler dispatches sol-command (with parsed params) instead of mounting', async () => {
    document.body.innerHTML = `
      <div id="host"></div>
      <sol-button id="c" data-handler="cycleFontSize" params='{"step":1}'>A</sol-button>`;
    const b = document.getElementById('c');
    await settle();
    const seen = [];
    document.addEventListener('sol-command', (e) => seen.push(e.detail));
    trigger(b).click(); await settle();
    expect(seen).toHaveLength(1);
    expect(seen[0].command).toBe('cycleFontSize');
    expect(seen[0].params).toEqual({ step: 1 });
    // No launcher behaviour: nothing mounted anywhere.
    expect(document.querySelector('#host > .sol-inline-panel')).toBeNull();
    expect(document.querySelector('sol-include')).toBeNull();
  });

  test('params left as a bare string when not JSON', async () => {
    document.body.innerHTML = `<sol-button id="c2" data-handler="go" params="left">x</sol-button>`;
    const b = document.getElementById('c2');
    await settle();
    let detail;
    document.addEventListener('sol-command', (e) => { detail = e.detail; });
    trigger(b).click(); await settle();
    expect(detail.command).toBe('go');
    expect(detail.params).toBe('left');
  });
});
