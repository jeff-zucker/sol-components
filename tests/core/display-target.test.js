/**
 * @jest-environment jsdom
 */

/**
 * Tests for core/display-target.js — region resolver + mounter/conjurer.
 */

// Suppress sol-define duplicate registration warnings
window.__SolSuppressDefineWarn = true;

import { isExternal, contentForHref, resolveRegion, displayItem } from '../../core/display-target.js';
import '../../web/sol-modal.js';   // define <sol-modal> so conjure/data-for run synchronously
import '../../web/sol-window.js';  // define <sol-window>

afterEach(() => { document.body.innerHTML = ''; });

describe('isExternal', () => {
  test('same-origin → false', () => {
    expect(isExternal('pages/x.html')).toBe(false);
    expect(isExternal('/page.html')).toBe(false);
  });
  test('cross-origin → true', () => {
    expect(isExternal('https://example.org/x')).toBe(true);
  });
});

describe('contentForHref', () => {
  test('same-origin → trusted sol-include, keep-alive', () => {
    const s = contentForHref('pages/x.html');
    expect(s.tag).toBe('sol-include');
    expect(s.replace).toBe(false);
    expect(s.attrs).toEqual(expect.arrayContaining([['source', 'pages/x.html'], ['trusted', 'true']]));
  });
  test('external → iframe, replace', () => {
    const s = contentForHref('https://example.org/x');
    expect(s.tag).toBe('iframe');
    expect(s.replace).toBe(true);
    expect(s.attrs).toEqual([['src', 'https://example.org/x']]);
  });
});

describe('resolveRegion', () => {
  test('a data-for claim wins', () => {
    const host = document.createElement('div');
    host.id = 'hp'; host.setAttribute('data-for', 'Settings');
    document.body.appendChild(host);
    const r = resolveRegion(null, 'Settings');
    expect(r).toEqual({ kind: 'element', element: host });
  });

  test('region= cascades from the launcher to a pane selector', () => {
    const wrap = document.createElement('div'); wrap.setAttribute('region', '#main');
    const btn = document.createElement('sol-button'); wrap.appendChild(btn);
    document.body.appendChild(wrap);
    const main = document.createElement('main'); main.id = 'main'; document.body.appendChild(main);
    expect(resolveRegion(btn, null).element).toBe(main);
  });

  test('keyword region', () => {
    const btn = document.createElement('sol-button'); btn.setAttribute('region', 'modal');
    document.body.appendChild(btn);
    expect(resolveRegion(btn, null).kind).toBe('modal');
  });

  test('falls back to <sol-default region=>', () => {
    const def = document.createElement('sol-default'); def.setAttribute('region', '#main');
    document.body.appendChild(def);
    const main = document.createElement('main'); main.id = 'main'; document.body.appendChild(main);
    const btn = document.createElement('sol-button'); document.body.appendChild(btn);
    expect(resolveRegion(btn, null).element).toBe(main);
  });

  test('uses fallbackEl when nothing else resolves', () => {
    const fb = document.createElement('div');
    expect(resolveRegion(null, null, fb)).toEqual({ kind: 'element', element: fb });
  });
});

describe('displayItem — pane (selector)', () => {
  test('mounts into the cascaded pane as a keep-alive wrapper', () => {
    const main = document.createElement('main'); main.id = 'main'; document.body.appendChild(main);
    const def = document.createElement('sol-default'); def.setAttribute('region', '#main'); document.body.appendChild(def);
    const btn = document.createElement('sol-button'); document.body.appendChild(btn);

    displayItem({ launcher: btn, name: 'Foo', tag: 'div', attrs: [['data-x', '1']] });
    expect(main.querySelector(':scope > [data-menu-item="Foo"] div[data-x="1"]')).not.toBeNull();
  });

  test('contents literal sets innerHTML on the pane', () => {
    const main = document.createElement('main'); main.id = 'main'; document.body.appendChild(main);
    const btn = document.createElement('sol-button'); btn.setAttribute('region', '#main'); document.body.appendChild(btn);
    displayItem({ launcher: btn, name: 'L', contents: '<b>hi</b>' });
    expect(main.innerHTML).toBe('<b>hi</b>');
  });
});

describe('displayItem — conjured surfaces (no author element)', () => {
  test('region="modal" conjures a <sol-modal> and mounts content', () => {
    const btn = document.createElement('sol-button'); btn.setAttribute('region', 'modal'); document.body.appendChild(btn);
    displayItem({ launcher: btn, name: 'Settings', tag: 'p', attrs: [['data-z', '9']] });
    const modal = document.querySelector('sol-modal');
    expect(modal).not.toBeNull();
    expect(modal.shadowRoot.querySelector('p[data-z="9"]')).not.toBeNull();
  });

  test('region="floating" conjures a <sol-window> and mounts content', () => {
    const btn = document.createElement('sol-button'); btn.setAttribute('region', 'floating'); document.body.appendChild(btn);
    displayItem({ launcher: btn, name: 'Notes', tag: 'p', attrs: [['data-n', '1']] });
    const w = document.body.querySelector('sol-window');
    expect(w).not.toBeNull();
    expect(w.body.querySelector('p[data-n="1"]')).not.toBeNull();
  });

  test('region="tab" opens window.open(href)', () => {
    const calls = []; const orig = window.open; window.open = (...a) => { calls.push(a); return {}; };
    const btn = document.createElement('sol-button'); btn.setAttribute('region', 'tab'); document.body.appendChild(btn);
    try { displayItem({ launcher: btn, href: 'https://example.org/' }); } finally { window.open = orig; }
    expect(calls[0][0]).toBe('https://example.org/');
    expect(calls[0][1]).toBe('_blank');
  });
});

describe('displayItem — data-for routes a Turtle item to a host', () => {
  test('mounts into the claiming <sol-modal> host', () => {
    const modal = document.createElement('sol-modal');
    modal.id = 'hp'; modal.setAttribute('data-for', 'Settings');
    document.body.appendChild(modal);
    const menu = document.createElement('sol-menu'); document.body.appendChild(menu);

    displayItem({ launcher: menu, id: 'Settings', name: 'Settings', tag: 'p', attrs: [['data-s', '1']] });
    expect(modal.shadowRoot.querySelector('p[data-s="1"]')).not.toBeNull();
  });
});
