/**
 * @jest-environment jsdom
 *
 * Tests for <sol-login> popup mode — the multi-session pathway where each
 * login runs in its own popup window and the parent talks to it through a
 * PopupProxySession (see core/popup-proxy.js):
 *   - mode / side / popup-callback attributes
 *   - _popupLogin: window.open call, invalid issuer, blocked popup, reuse
 *   - _onPopupMessage: source/side filtering, logged-in, login-failed
 *   - popup-mode isLoggedIn / webId / logout
 *   - disconnectedCallback unhooks the message listener
 */

import { SolLogin } from '../../web/sol-login.js';

class MockSession {
  constructor(_opts, id) {
    this.id = id;
    this.info = { isLoggedIn: false, webId: null, issuer: null };
    this.fetch = (i, init) => globalThis.fetch(i, init);
  }
  async handleIncomingRedirect() {}
  async login() {}
  async logout() { this.info.isLoggedIn = false; }
}

beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({ ok: true, status: 200 });
  }
  window.solidClientAuthn = { Session: MockSession };
  window.__SolSuppressDefineWarn = true;
});

const realOpen = window.open;
let lastPopup;
function fakePopup() {
  return {
    closed: false,
    focus: () => {},
    close() { this.closed = true; },
    postMessage() {},
  };
}
// The shared AuthManager — reachable through any element's `.auth`.
const authOf = () => document.createElement('sol-login').auth;

beforeEach(() => {
  lastPopup = null;
  window.open = () => (lastPopup = fakePopup());
});
afterEach(() => {
  // PopupProxySessions hold a close-watch interval — destroy them.
  const auth = authOf();
  for (const [, s] of auth.sessions) { if (typeof s.destroy === 'function') s.destroy(); }
  auth.sessions.clear();
  document.body.innerHTML = '';
  window.open = realOpen;
});

function mkPopupLogin(side = 'main') {
  const el = document.createElement('sol-login');
  el._manualInit = true;
  el.setAttribute('mode', 'popup');
  el.setAttribute('side', side);
  document.body.appendChild(el);
  return el;
}

function sendToLogin(data) {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'sol-popup-auth', ...data },
  }));
}

// ── attributes ──────────────────────────────────────────────────────────────

describe('SolLogin popup — attributes', () => {
  test('mode="popup" puts the element in popup mode', () => {
    expect(mkPopupLogin()._mode).toBe('popup');
  });

  test('the side attribute becomes the session tag', () => {
    expect(mkPopupLogin('left')._side).toBe('left');
  });

  test('popup-callback overrides the callback page URL', () => {
    const el = document.createElement('sol-login');
    el._manualInit = true;
    el.setAttribute('mode', 'popup');
    el.setAttribute('popup-callback', '/my-callback.html');
    document.body.appendChild(el);
    expect(el._popupCallback).toBe('/my-callback.html');
  });
});

// ── _popupLogin ─────────────────────────────────────────────────────────────

describe('SolLogin popup — _popupLogin', () => {
  test('opens a popup window with side and issuer in the URL', () => {
    const el = mkPopupLogin('left');
    let openedUrl = null;
    window.open = (url) => { openedUrl = url; return (lastPopup = fakePopup()); };
    el.login('https://idp.example');
    expect(openedUrl).toMatch(/side=left/);
    expect(openedUrl).toMatch(/issuer=https%3A%2F%2Fidp.example/);
  });

  test('an invalid issuer URL never opens a popup', () => {
    const el = mkPopupLogin();
    let opened = false;
    window.open = () => { opened = true; return fakePopup(); };
    el.login('not a url');
    expect(opened).toBe(false);
  });

  test('a blocked popup fires sol-popup-blocked', () => {
    const el = mkPopupLogin('left');
    window.open = () => null;
    let detail = null;
    el.addEventListener('sol-popup-blocked', (e) => { detail = e.detail; });
    el.login('https://idp.example');
    expect(detail).toEqual({ side: 'left' });
  });

  test('a second login reuses the still-open popup', () => {
    const el = mkPopupLogin();
    let opens = 0, focused = 0;
    window.open = () => {
      opens++;
      return { closed: false, focus: () => { focused++; }, close() {}, postMessage() {} };
    };
    el.login('https://idp.example');
    el.login('https://idp.example');
    expect(opens).toBe(1);
    expect(focused).toBe(1);
  });
});

// ── _onPopupMessage ─────────────────────────────────────────────────────────

describe('SolLogin popup — incoming messages', () => {
  test('ignores messages that are not from the popup callback', () => {
    const el = mkPopupLogin();
    el.login('https://idp.example');
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'someone-else', type: 'logged-in', webId: 'w' },
    }));
    expect(el.auth.sessions.size).toBe(0);
  });

  test('ignores logged-in messages addressed to a different side', () => {
    const el = mkPopupLogin('left');
    el.login('https://idp.example');
    sendToLogin({ type: 'logged-in', side: 'right', webId: 'w', issuer: 'https://idp.example/' });
    expect(el.auth.sessions.has('left')).toBe(false);
  });

  test('a logged-in message registers a session and fires sol-login', () => {
    const el = mkPopupLogin('main');
    let detail = null;
    el.addEventListener('sol-login', (e) => { detail = e.detail; });
    el.login('https://idp.example');
    sendToLogin({
      type: 'logged-in', side: 'main',
      webId: 'https://pod.example/me', sessionId: 's1', issuer: 'https://idp.example/',
    });
    expect(el.auth.sessions.has('main')).toBe(true);
    expect(detail).toEqual({
      webId: 'https://pod.example/me', issuer: 'https://idp.example/', side: 'main',
    });
  });

  test('after logging in, popup-mode isLoggedIn and webId reflect the session', () => {
    const el = mkPopupLogin('main');
    el.login('https://idp.example');
    sendToLogin({
      type: 'logged-in', side: 'main',
      webId: 'https://pod.example/me', sessionId: 's1', issuer: 'https://idp.example/',
    });
    expect(el.isLoggedIn).toBe(true);
    expect(el.webId).toBe('https://pod.example/me');
  });

  test('a login-failed message clears the tracked popup window', () => {
    const el = mkPopupLogin('main');
    el.login('https://idp.example');
    expect(el._popupWindow).toBeTruthy();
    sendToLogin({ type: 'login-failed', side: 'main', error: 'denied' });
    expect(el._popupWindow).toBe(null);
  });
});

// ── logout / initialize / teardown ──────────────────────────────────────────

describe('SolLogin popup — logout and lifecycle', () => {
  test('logout removes this side’s session and fires sol-logout', async () => {
    const el = mkPopupLogin('main');
    el.login('https://idp.example');
    sendToLogin({
      type: 'logged-in', side: 'main',
      webId: 'https://pod.example/me', sessionId: 's1', issuer: 'https://idp.example/',
    });
    expect(el.auth.sessions.has('main')).toBe(true);

    // Close the popup first so the proxy skips its 5s logout round-trip.
    lastPopup.closed = true;
    let detail = null;
    el.addEventListener('sol-logout', (e) => { detail = e.detail; });
    await el.logout();

    expect(el.auth.sessions.has('main')).toBe(false);
    expect(detail).toEqual({ side: 'main' });
  });

  test('initialize in popup mode resolves without contacting an IdP', async () => {
    const el = mkPopupLogin();
    await expect(el.initialize()).resolves.toBeUndefined();
  });

  test('disconnecting unhooks the popup message listener', () => {
    const el = mkPopupLogin('main');
    el.login('https://idp.example');
    el.remove();   // disconnectedCallback removes the listener
    sendToLogin({
      type: 'logged-in', side: 'main',
      webId: 'https://pod.example/me', sessionId: 's1', issuer: 'https://idp.example/',
    });
    expect(authOf().sessions.has('main')).toBe(false);
  });
});
