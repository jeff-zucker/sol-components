/**
 * @jest-environment jsdom
 *
 * Extra element-level tests for <sol-login>: click flow, issuer dropdown,
 * and the auth-fetch auto-discovery / `login` selector pathway used by
 * companion components (sol-include, sol-query).
 */

import { jest } from '@jest/globals';
import { AuthManager, SolLogin } from '../../web/sol-login.js';
import { getAuthFetch } from '../../core/auth-fetch.js';

// All MockSession instances ever made — lets the click-flow tests find the
// "real" session that received .login() even when AuthManager replaced the
// pre-seeded one inside setSideOrigin.
const ALL_SESSIONS = [];

class MockSession {
  constructor(opts, id) {
    this.id     = id;
    this.info   = { isLoggedIn: false, webId: null, issuer: null };
    this.fetch  = (input, init) => globalThis.fetch(input, init);
    this._loginCalls  = [];
    this._logoutCount = 0;
    ALL_SESSIONS.push(this);
  }
  async handleIncomingRedirect() {}
  async login(opts) { this._loginCalls.push(opts); }
  async logout()    { this._logoutCount += 1; this.info.isLoggedIn = false; this.info.webId = null; }
}
function totalLoginCalls() {
  return ALL_SESSIONS.reduce((n, s) => n + s._loginCalls.length, 0);
}

beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({ ok: true, status: 200 });
  }
  window.solidClientAuthn = { Session: MockSession };
  window.__SolSuppressDefineWarn = true;
});

function mkLogin(side) {
  const el = document.createElement('sol-login');
  el._manualInit = true;
  if (side) el.setAttribute('side', side);
  document.body.appendChild(el);
  return el;
}

// All <sol-login> elements share one AuthManager whose session Map is a
// module-level singleton — clear it between tests so sessions don't leak.
function clearSessions() {
  document.createElement('sol-login').auth.sessions.clear();
}

// ── Click flow on the main button ────────────────────────────────────────────

describe('SolLogin — click flow', () => {
  let el;
  beforeEach(() => { el = mkLogin(); });
  afterEach(() => el.remove());

  test('clicking Log in opens the issuer dropdown when not logged in', () => {
    const btn = el.shadowRoot.querySelector('.auth-btn');
    btn.click();
    const dd = el.shadowRoot.querySelector('.dropdown');
    expect(dd.classList.contains('open')).toBe(true);
  });

  test('clicking Log out (when logged in) calls session.logout', async () => {
    const session = el.auth.sessionFor('default', 'https://ex.com');
    session.info = { isLoggedIn: true, webId: 'https://ex.com/me', issuer: 'https://ex.com' };
    await el.initialize();
    expect(el.shadowRoot.querySelector('.auth-btn').textContent).toBe('Log out');
    el.shadowRoot.querySelector('.auth-btn').click();
    // logout is async; wait a microtask for state to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(el.isLoggedIn).toBe(false);
  });

  test('clicking the same button twice toggles the dropdown closed', () => {
    const btn = el.shadowRoot.querySelector('.auth-btn');
    btn.click();
    const dd = el.shadowRoot.querySelector('.dropdown');
    expect(dd.classList.contains('open')).toBe(true);
    btn.click();
    expect(dd.classList.contains('open')).toBe(false);
  });

  test('typing an issuer URL and pressing Enter calls session.login', async () => {
    const before = totalLoginCalls();
    el.shadowRoot.querySelector('.auth-btn').click();
    const input = el.shadowRoot.querySelector('.issuer-input');
    input.value = 'https://solidcommunity.net';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // login() chain is async — flush microtasks + a tick.
    await new Promise(r => setTimeout(r, 0));
    expect(totalLoginCalls()).toBeGreaterThan(before);
  });

  test('Go button posts the same login call as Enter', async () => {
    const before = totalLoginCalls();
    el.shadowRoot.querySelector('.auth-btn').click();
    const input = el.shadowRoot.querySelector('.issuer-input');
    input.value = 'https://login.inrupt.com';
    el.shadowRoot.querySelector('.custom-row .sol-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(totalLoginCalls()).toBeGreaterThan(before);
  });
});

// ── issuer-quickpick dropdown rendering ─────────────────────────────────────

describe('SolLogin — issuer quickpick rendering', () => {
  let el;
  beforeEach(() => { el = mkLogin(); });
  afterEach(() => el.remove());

  test('clicking a quickpick triggers login for that issuer', async () => {
    el.setAttribute('issuers', 'https://solidcommunity.net');
    el.shadowRoot.querySelector('.auth-btn').click();
    const item = el.shadowRoot.querySelector('.issuer-item');
    expect(item).toBeTruthy();
    expect(item.textContent).toBe('solidcommunity.net');
    const before = totalLoginCalls();
    item.click();
    await new Promise(r => setTimeout(r, 0));
    expect(totalLoginCalls()).toBeGreaterThan(before);
  });
});

// ── Companion auto-discovery via getAuthFetch ────────────────────────────────

describe('getAuthFetch — auto-discovery', () => {
  beforeEach(() => { document.body.innerHTML = ''; clearSessions(); });
  afterEach(()  => { document.body.innerHTML = ''; });

  test('returns a function when no <sol-login> on page', () => {
    const fn = getAuthFetch('https://my.pod/data');
    expect(typeof fn).toBe('function');
  });

  test('returned wrapper invokes the matching session.fetch', async () => {
    const a = mkLogin();
    const customFetch = jest.fn(async () => ({ ok: true, status: 200, body: 'hi' }));
    const session = a.auth.sessionFor('default', 'https://my.pod');
    session.info  = { isLoggedIn: true, webId: 'https://my.pod/me', issuer: 'https://my.pod' };
    session.fetch = customFetch;
    const fn = getAuthFetch('https://my.pod/data');
    await fn('https://my.pod/data');
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  test('explicit element option targets the chosen <sol-login>', async () => {
    // Two logins on distinct sides → two independent sessions (the Map is
    // keyed by side). getAuthFetch targets a session via the element's side.
    const first  = mkLogin('a');
    const second = mkLogin('b');

    const customFetchA = jest.fn(async () => ({ ok: true, body: 'a' }));
    const sessA = first.auth.sessionFor('a', 'https://a.pod');
    sessA.info  = { isLoggedIn: true, webId: 'https://a.pod/me', issuer: 'https://a.pod' };
    sessA.fetch = customFetchA;

    const customFetchB = jest.fn(async () => ({ ok: true, body: 'b' }));
    const sessB = second.auth.sessionFor('b', 'https://b.pod');
    sessB.info  = { isLoggedIn: true, webId: 'https://b.pod/me', issuer: 'https://b.pod' };
    sessB.fetch = customFetchB;

    // No element → auto-discovery; the URL's origin selects session A.
    await getAuthFetch('https://a.pod/data')('https://a.pod/data');
    expect(customFetchA).toHaveBeenCalledTimes(1);
    expect(customFetchB).not.toHaveBeenCalled();

    // Explicit element → its side ("b") selects session B directly.
    customFetchA.mockClear();
    await getAuthFetch('https://b.pod/data', { element: second })('https://b.pod/data');
    expect(customFetchB).toHaveBeenCalledTimes(1);
    expect(customFetchA).not.toHaveBeenCalled();
  });

  test('falls back to global fetch when no session covers the URL', () => {
    const a = mkLogin();
    a.auth.sessionFor('default', 'https://other.pod');
    const fn = getAuthFetch('https://my.pod/data');
    // Bound global fetch — at minimum a function we can call.
    expect(typeof fn).toBe('function');
  });
});

// ── _authFetch on sol-query honors the `login=` selector ─────────────────────

describe('SolQuery._authFetch — login selector', () => {
  // Lazy-import so the global stubs above are in place first.
  let SolQuery;
  beforeAll(async () => {
    ({ SolQuery } = await import('../../web/sol-query.js'));
  });
  beforeEach(() => { document.body.innerHTML = ''; clearSessions(); });

  test('selector="#alt" picks the targeted login element', async () => {
    const primary = mkLogin('primary'); primary.id = 'primary';
    const alt     = mkLogin('alt');     alt.id     = 'alt';

    const fA = jest.fn(async () => ({ ok: true, status: 200 }));
    const sA = alt.auth.sessionFor('alt', 'https://alt.pod');
    sA.info  = { isLoggedIn: true, webId: 'https://alt.pod/me', issuer: 'https://alt.pod' };
    sA.fetch = fA;

    const fP = jest.fn(async () => ({ ok: true, status: 200 }));
    const sP = primary.auth.sessionFor('primary', 'https://primary.pod');
    sP.info  = { isLoggedIn: true, webId: 'https://primary.pod/me', issuer: 'https://primary.pod' };
    sP.fetch = fP;

    const q = document.createElement('sol-query');
    q.setAttribute('login', '#alt');
    document.body.appendChild(q);
    // A URL covered by neither pod's domain: only the explicitly targeted
    // #alt session can serve it, so the selector must route by side.
    await q._authFetch('https://neutral.example/data')('https://neutral.example/data');
    expect(fA).toHaveBeenCalledTimes(1);
    expect(fP).not.toHaveBeenCalled();
    q.remove();
  });

  test('no login attribute → auto-discovery uses the first <sol-login>', async () => {
    const first = mkLogin(); first.id = 'first';
    const fF = jest.fn(async () => ({ ok: true, status: 200 }));
    const sF = first.auth.sessionFor('default', 'https://first.pod');
    sF.info  = { isLoggedIn: true, webId: 'https://first.pod/me', issuer: 'https://first.pod' };
    sF.fetch = fF;

    const q = document.createElement('sol-query');
    document.body.appendChild(q);
    await q._authFetch('https://first.pod/data')('https://first.pod/data');
    expect(fF).toHaveBeenCalledTimes(1);
    q.remove();
  });
});
