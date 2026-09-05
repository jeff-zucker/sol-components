/**
 * @jest-environment jsdom
 *
 * Extra element-level tests for <sol-login>: click flow, issuer dropdown,
 * and the auth-fetch auto-discovery / `login` selector pathway used by
 * companion components (sol-include, sol-query).
 */

import { __resetMock, __loginCalls } from '@uvdsl/solid-oidc-client-browser';
import { jest } from '@jest/globals';
import { SolLogin } from '../../web/sol-login.js';
import { getAuthFetch } from '../../core/auth-fetch.js';

beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({ ok: true, status: 200 });
  }
  window.__SolSuppressDefineWarn = true;
});

beforeEach(() => __resetMock());

function mkLogin() {
  const el = document.createElement('sol-login');
  el._manualInit = true;
  document.body.appendChild(el);
  return el;
}

// All <sol-login> elements share one AuthManager whose session Map is a
// module-level singleton — clear it between tests so sessions don't leak.
function clearSessions() {
  const el = document.createElement('sol-login');
  el.auth.sessions.clear();
  el.auth._oidc = null;
}

/** Seat a logged-in session-shaped object into the shared manager. */
function seat(auth, tag, webId, issuer, fetchFn) {
  const session = {
    info: { isLoggedIn: true, webId, issuer },
    fetch: fetchFn || ((i, init) => globalThis.fetch(i, init)),
    logout: async () => { session.info.isLoggedIn = false; session.info.webId = null; },
  };
  auth.sessions.set(tag, session);
  return session;
}

// ── Click flow on the main button ────────────────────────────────────────────

describe('SolLogin — click flow', () => {
  let el;
  beforeEach(() => { clearSessions(); el = mkLogin(); });
  afterEach(() => el.remove());

  test('clicking Log in opens the issuer dropdown when not logged in', () => {
    el.shadowRoot.querySelector('.auth-btn').click();
    expect(el.shadowRoot.querySelector('.dropdown').classList.contains('open')).toBe(true);
  });

  test('clicking Log out (when logged in) logs the session out', async () => {
    seat(el.auth, 'default', 'https://ex.com/me', 'https://ex.com');
    await el.initialize();
    expect(el.shadowRoot.querySelector('.auth-btn').textContent).toBe('Log out');
    el.shadowRoot.querySelector('.auth-btn').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(el.isLoggedIn).toBe(false);
  });

  test('clicking the same button twice toggles the dropdown closed', () => {
    const btn = el.shadowRoot.querySelector('.auth-btn');
    btn.click();
    expect(el.shadowRoot.querySelector('.dropdown').classList.contains('open')).toBe(true);
    btn.click();
    expect(el.shadowRoot.querySelector('.dropdown').classList.contains('open')).toBe(false);
  });

  test('typing an issuer URL and pressing Enter starts a login', async () => {
    el.shadowRoot.querySelector('.auth-btn').click();
    const input = el.shadowRoot.querySelector('.issuer-input');
    input.value = 'https://solidcommunity.net';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise(r => setTimeout(r, 0));
    expect(__loginCalls.length).toBeGreaterThan(0);
    expect(__loginCalls[0].idp).toBe('https://solidcommunity.net');
  });

  test('Go button starts the same login as Enter', async () => {
    el.shadowRoot.querySelector('.auth-btn').click();
    el.shadowRoot.querySelector('.issuer-input').value = 'https://login.inrupt.com';
    el.shadowRoot.querySelector('.custom-row .sol-btn').click();
    await new Promise(r => setTimeout(r, 0));
    expect(__loginCalls.length).toBeGreaterThan(0);
  });
});

// ── click basis vs the synthetic local owner ───────────────────────────────
// dk registers a synthetic local-owner session under 'local' (logged in,
// covers only the local pod, no OIDC methods). The login button reflects only
// the 'default' (remote) session — the owner must not read as "logged in" and
// turn a Log in tap into a silent logout.

describe('SolLogin — button ignores the local owner', () => {
  afterEach(() => { clearSessions(); document.body.innerHTML = ''; });

  test('a Log in button still opens the dropdown with an owner present', () => {
    clearSessions();
    const el = mkLogin();
    seat(el.auth, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    el.shadowRoot.querySelector('.auth-btn').click();
    expect(el.shadowRoot.querySelector('.dropdown').classList.contains('open')).toBe(true);
  });

  test('an interactive login leaves the owner untouched', async () => {
    clearSessions();
    const el = mkLogin();
    const owner = seat(el.auth, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    await el.login('https://idp.example/');
    expect(__loginCalls.length).toBe(1);
    expect(el.auth.sessions.get('local')).toBe(owner);   // owner untouched
  });
});

// ── issuer-quickpick dropdown rendering ─────────────────────────────────────

describe('SolLogin — issuer quickpick rendering', () => {
  let el;
  beforeEach(() => { clearSessions(); el = mkLogin(); });
  afterEach(() => el.remove());

  test('clicking a quickpick starts a login for that issuer', async () => {
    el.setAttribute('issuers', 'https://solidcommunity.net');
    el.shadowRoot.querySelector('.auth-btn').click();
    const item = el.shadowRoot.querySelector('.issuer-item');
    expect(item.textContent).toBe('solidcommunity.net');
    item.click();
    await new Promise(r => setTimeout(r, 0));
    expect(__loginCalls.length).toBeGreaterThan(0);
    expect(__loginCalls[0].idp).toBe('https://solidcommunity.net');
  });
});

// ── Companion auto-discovery via getAuthFetch ────────────────────────────────

describe('getAuthFetch — auto-discovery', () => {
  beforeEach(() => { document.body.innerHTML = ''; clearSessions(); });
  afterEach(()  => { document.body.innerHTML = ''; });

  test('returns a function when no <sol-login> on page', () => {
    expect(typeof getAuthFetch('https://my.pod/data')).toBe('function');
  });

  test('returned wrapper invokes the covering session.fetch', async () => {
    const a = mkLogin();
    const customFetch = jest.fn(async () => ({ ok: true, status: 200 }));
    seat(a.auth, 'default', 'https://my.pod/me', 'https://my.pod', customFetch);
    await getAuthFetch('https://my.pod/data')('https://my.pod/data');
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  test('routes to the session covering the URL (local vs remote)', async () => {
    const a = mkLogin();
    const localFetch = jest.fn(async () => ({ ok: true }));
    const remoteFetch = jest.fn(async () => ({ ok: true }));
    seat(a.auth, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/', localFetch);
    seat(a.auth, 'default', 'https://alice.solidcommunity.net/card#me', 'https://solidcommunity.net', remoteFetch);

    await getAuthFetch('http://localhost/dk-pod/x')('http://localhost/dk-pod/x');
    expect(localFetch).toHaveBeenCalledTimes(1);
    expect(remoteFetch).not.toHaveBeenCalled();

    await getAuthFetch('https://alice.solidcommunity.net/x')('https://alice.solidcommunity.net/x');
    expect(remoteFetch).toHaveBeenCalledTimes(1);
  });
});

// ── _authFetch on sol-query honors the `login=` selector ─────────────────────

describe('SolQuery._authFetch — login selector', () => {
  let SolQuery;
  beforeAll(async () => {
    ({ SolQuery } = await import('../../web/sol-query.js'));
  });
  beforeEach(() => { document.body.innerHTML = ''; clearSessions(); });

  test('login="#alt" routes through the covering session', async () => {
    const alt = mkLogin(); alt.id = 'alt';
    const fA = jest.fn(async () => ({ ok: true, status: 200 }));
    seat(alt.auth, 'default', 'https://alt.pod/me', 'https://alt.pod', fA);

    const q = document.createElement('sol-query');
    q.setAttribute('login', '#alt');
    document.body.appendChild(q);
    await q._authFetch('https://alt.pod/data')('https://alt.pod/data');
    expect(fA).toHaveBeenCalledTimes(1);
    q.remove();
  });

  test('no login attribute → auto-discovery uses the first <sol-login>', async () => {
    const first = mkLogin(); first.id = 'first';
    const fF = jest.fn(async () => ({ ok: true, status: 200 }));
    seat(first.auth, 'default', 'https://first.pod/me', 'https://first.pod', fF);

    const q = document.createElement('sol-query');
    document.body.appendChild(q);
    await q._authFetch('https://first.pod/data')('https://first.pod/data');
    expect(fF).toHaveBeenCalledTimes(1);
    q.remove();
  });
});

// ── initialize(): single-flight + resilient paint ────────────────────────────

describe('SolLogin — initialize()', () => {
  afterEach(() => { clearSessions(); document.body.innerHTML = ''; });

  test('is single-flight: concurrent callers share one redirect pass', async () => {
    clearSessions();
    const el = mkLogin();
    let calls = 0;
    let release;
    el.auth.handleIncomingRedirect = () => { calls++; return new Promise(r => { release = r; }); };
    const a = el.initialize();
    const b = el.initialize();
    expect(a).toBe(b);
    release();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  test('paints the button even when redirect processing throws', async () => {
    clearSessions();
    const el = mkLogin();
    seat(el.auth, 'default', 'https://ex.com/me', 'https://ex.com');
    el.auth.handleIncomingRedirect = async () => { throw new Error('code already consumed'); };
    await el.initialize();
    expect(el.shadowRoot.querySelector('.auth-btn').textContent).toBe('Log out');
  });

  test('announces the default session on login', async () => {
    clearSessions();
    const el = mkLogin();
    seat(el.auth, 'default', 'https://me.idp.example/card#me', 'https://idp.example');
    const seen = [];
    el.addEventListener('sol-login', (e) => seen.push(e.detail));
    await el.initialize();
    expect(seen.length).toBe(1);
    expect(seen[0].webId).toBe('https://me.idp.example/card#me');
  });
});
