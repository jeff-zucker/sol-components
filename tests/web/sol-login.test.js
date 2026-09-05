/**
 * @jest-environment jsdom
 *
 * Tests for AuthManager and SolLogin from sol-login.js.
 * Single Solid-OIDC session; the mock @uvdsl client stands in for real OIDC.
 */

import { __resetMock, __loginCalls, __lastSession } from '@uvdsl/solid-oidc-client-browser';
import { AuthManager, SolLogin } from '../../web/sol-login.js';
import { baseDomain, sessionCoversOrigin } from '../../core/auth-core.js';

beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => new Response('', { status: 200 });
  }
  window.__SolSuppressDefineWarn = true;
});

beforeEach(() => __resetMock());

/** Seat a plain logged-in session-shaped object (like dk's owner / a remote
 *  OIDC session) directly into a manager's Map. */
function seat(mgr, tag, webId, issuer) {
  const session = {
    info: { isLoggedIn: true, webId, issuer },
    fetch: (input, init) => globalThis.fetch(input, init),
    logout: async () => { session.info.isLoggedIn = false; session.info.webId = null; },
  };
  mgr.sessions.set(tag, session);
  return session;
}

// ── originOf ──────────────────────────────────────────────────────────────

describe('originOf', () => {
  const mgr = new AuthManager();

  test('extracts origin from https URL', () => {
    expect(mgr.originOf('https://alice.example.com/pod/file.ttl')).toBe('https://alice.example.com');
  });

  test('extracts origin from http URL with port', () => {
    expect(mgr.originOf('http://localhost:3000/path')).toBe('http://localhost:3000');
  });

  test('returns empty string for invalid URL', () => {
    expect(mgr.originOf('not-a-url')).toBe('');
  });
});

// ── isNoAuth ──────────────────────────────────────────────────────────────

describe('isNoAuth', () => {
  test('returns false when noAuth not set', () => {
    expect(new AuthManager().isNoAuth('https://example.com/file')).toBe(false);
  });

  test('matches single origin string', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://example.com';
    expect(mgr.isNoAuth('https://example.com/path')).toBe(true);
    expect(mgr.isNoAuth('https://other.com/path')).toBe(false);
  });

  test('matches origin in array', () => {
    const mgr = new AuthManager();
    mgr.noAuth = ['https://a.com', 'https://b.com'];
    expect(mgr.isNoAuth('https://a.com/x')).toBe(true);
    expect(mgr.isNoAuth('https://b.com/y')).toBe(true);
    expect(mgr.isNoAuth('https://c.com/z')).toBe(false);
  });
});

// ── baseDomain / sessionCoversOrigin (auth-core, exercised through routing) ──

describe('baseDomain', () => {
  test('extracts last two parts', () => {
    expect(baseDomain('pod.solidcommunity.net')).toBe('solidcommunity.net');
  });
  test('returns host as-is for two parts', () => {
    expect(baseDomain('example.com')).toBe('example.com');
  });
});

describe('sessionCoversOrigin', () => {
  test('false when not logged in', () => {
    expect(sessionCoversOrigin({ info: { isLoggedIn: false, issuer: 'https://x.com' } }, 'https://x.com')).toBe(false);
  });
  test('matches subdomain of issuer', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(sessionCoversOrigin(s, 'https://alice.solidcommunity.net')).toBe(true);
  });
  test('matches via shared base domain with webId', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://login.inrupt.com', webId: 'https://alice.pod.inrupt.com/profile/card#me' } };
    expect(sessionCoversOrigin(s, 'https://bob.pod.inrupt.com')).toBe(true);
  });
  test('rejects unrelated origin', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(sessionCoversOrigin(s, 'https://other.example.com')).toBe(false);
  });
});

// ── the single OIDC session ───────────────────────────────────────────────

describe('oidcSession', () => {
  test('creates one session and seats it on default', () => {
    const mgr = new AuthManager();
    const s1 = mgr.oidcSession();
    const s2 = mgr.oidcSession();
    expect(s1).toBe(s2);
    expect(mgr.sessions.get('default')).toBe(s1);
  });

  test('does not clobber a session an app already seated on default', () => {
    const mgr = new AuthManager();
    const proxy = seat(mgr, 'default', 'https://alice.example/card#me', 'https://example');
    const oidc = mgr.oidcSession();
    expect(mgr.sessions.get('default')).toBe(proxy);   // proxy kept
    expect(oidc).not.toBe(proxy);
  });

  test('defaultSession reflects whatever holds the default tag', () => {
    const mgr = new AuthManager();
    expect(mgr.defaultSession()).toBeNull();
    const s = seat(mgr, 'default', 'https://a.example/card#me', 'https://a.example');
    expect(mgr.defaultSession()).toBe(s);
  });
});

// ── getSessionFor / fetchFor — per-origin routing (local + one remote) ──────

describe('per-origin routing', () => {
  test('routes a request to the session that covers its origin', () => {
    const mgr = new AuthManager();
    // dk's synthetic local owner on 'local', a remote OIDC session on 'default'
    seat(mgr, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    seat(mgr, 'default', 'https://alice.solidcommunity.net/profile/card#me', 'https://solidcommunity.net');

    const local = mgr.getSessionFor('http://localhost/dk-pod/file.ttl');
    expect(local.info.webId).toContain('localhost');

    const remote = mgr.getSessionFor('https://alice.solidcommunity.net/file.ttl');
    expect(remote.info.webId).toContain('solidcommunity.net');
  });

  test('fetchFor returns plain fetch for noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    expect(mgr.fetchFor('https://public.com/file')).toBe(fetch);
  });

  test('fetchFor returns plain fetch when no session matches', () => {
    expect(new AuthManager().fetchFor('https://unknown.com/file')).toBe(fetch);
  });

  test('fetchFor returns a session fetch when a covering session exists', () => {
    const mgr = new AuthManager();
    seat(mgr, 'default', 'https://alice.solidcommunity.net/card#me', 'https://solidcommunity.net');
    expect(mgr.fetchFor('https://alice.solidcommunity.net/resource')).not.toBe(fetch);
  });
});

// ── isLoggedIn / getWebId / getFirstLoggedIn ────────────────────────────────

describe('isLoggedIn / getWebId', () => {
  test('isLoggedIn true for noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    expect(mgr.isLoggedIn('https://public.com/file')).toBe(true);
  });

  test('isLoggedIn true when a covering session exists', () => {
    const mgr = new AuthManager();
    seat(mgr, 'default', 'https://alice.example.com/card#me', 'https://example.com');
    expect(mgr.isLoggedIn('https://example.com/file')).toBe(true);
  });

  test('getWebId returns the default session webId', () => {
    const mgr = new AuthManager();
    seat(mgr, 'default', 'https://alice.example.com/card#me', 'https://example.com');
    expect(mgr.getWebId()).toBe('https://alice.example.com/card#me');
  });

  test('getFirstLoggedIn returns null when none logged in', () => {
    expect(new AuthManager().getFirstLoggedIn()).toBeNull();
  });
});

// ── handleIncomingRedirect ─────────────────────────────────────────────────

describe('handleIncomingRedirect', () => {
  test('drives the OIDC session and skips session-shaped objects (dk owner)', async () => {
    const mgr = new AuthManager();
    // dk-owner-session shape on 'local': info + fetch + logout, no OIDC methods.
    seat(mgr, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    await expect(mgr.handleIncomingRedirect()).resolves.toBeUndefined();
    // The OIDC session was created and seated on 'default'.
    expect(mgr.sessions.has('default')).toBe(true);
  });
});

// ── ensureAuthenticated ────────────────────────────────────────────────────

describe('ensureAuthenticated', () => {
  test('returns true immediately for noAuth URLs', async () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    expect(await mgr.ensureAuthenticated('https://public.com/file')).toBe(true);
  });

  test('returns true when a covering session already exists', async () => {
    const mgr = new AuthManager();
    seat(mgr, 'default', 'https://alice.example.com/card#me', 'https://example.com');
    expect(await mgr.ensureAuthenticated('https://example.com/file')).toBe(true);
  });

  test('starts an interactive login when nothing covers the origin', async () => {
    const mgr = new AuthManager();
    const result = await mgr.ensureAuthenticated('https://example.com/file');
    expect(result).toBe(false);
    expect(__loginCalls.length).toBe(1);
    expect(__loginCalls[0].idp).toBe('https://example.com');
  });

  // dk's synthetic local-owner: logged in, covers ONLY the local pod. It must
  // not swallow a remote login as "already authenticated".
  test('a logged-in session that does not cover the origin does not block login', async () => {
    const mgr = new AuthManager();
    seat(mgr, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    const result = await mgr.ensureAuthenticated('https://idp.example/');
    expect(result).toBe(false);
    expect(__loginCalls.length).toBe(1);
    expect(__loginCalls[0].idp).toBe('https://idp.example');
  });

  test('a logged-in session that covers the origin short-circuits', async () => {
    const mgr = new AuthManager();
    seat(mgr, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    expect(await mgr.ensureAuthenticated('http://localhost/')).toBe(true);
    expect(__loginCalls.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SolLogin component tests
// ═══════════════════════════════════════════════════════════════════════════

/** Reset the shared AuthManager between element tests (the element binds to the
 *  module singleton, which otherwise persists across tests). */
function resetShared(el) {
  el.auth.sessions.clear();
  el.auth._oidc = null;
}

describe('SolLogin component', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('sol-login');
    el._manualInit = true;
    document.body.appendChild(el);
    resetShared(el);
  });
  afterEach(() => el.remove());

  test('has a shadow root', () => {
    expect(el.shadowRoot).toBeTruthy();
  });

  test('renders login button', () => {
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Log in');
  });

  test('webId is null when not logged in', () => {
    expect(el.webId).toBeNull();
  });

  test('isLoggedIn is false when not logged in', () => {
    expect(el.isLoggedIn).toBe(false);
  });

  test('fetchFor delegates to auth manager', () => {
    expect(el.fetchFor('https://example.com/file')).toBe(fetch);
  });

  test('auth property exposes the AuthManager', () => {
    expect(el.auth).toBeInstanceOf(AuthManager);
  });
});

describe('SolLogin — issuers', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('sol-login');
    el._manualInit = true;
    document.body.appendChild(el);
    resetShared(el);
  });
  afterEach(() => el.remove());

  test('parses issuers from attribute', () => {
    el.setAttribute('issuers', 'https://a.com, https://b.com');
    expect(el.issuers).toEqual(['https://a.com', 'https://b.com']);
  });

  test('setting issuers property updates list', () => {
    el.issuers = ['https://x.com'];
    expect(el.issuers).toEqual(['https://x.com']);
  });

  test('addIssuer appends a new origin', () => {
    el.issuers = ['https://a.com'];
    el.addIssuer('https://b.com');
    expect(el.issuers).toContain('https://b.com');
  });

  test('addIssuer does not duplicate existing origin', () => {
    el.issuers = ['https://a.com'];
    el.addIssuer('https://a.com/');
    expect(el.issuers).toHaveLength(1);
  });

  test('renders issuer buttons in dropdown', () => {
    el.issuers = ['https://solidcommunity.net', 'https://login.inrupt.com'];
    el._renderIssuers();
    const items = el.shadowRoot.querySelectorAll('.issuer-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('solidcommunity.net');
    expect(items[1].textContent).toBe('login.inrupt.com');
  });
});

describe('SolLogin — initialize and events', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('sol-login');
    el._manualInit = true;
    document.body.appendChild(el);
    resetShared(el);
  });
  afterEach(() => el.remove());

  test('initialize seats the OIDC session on default', async () => {
    await el.initialize();
    expect(el.auth.sessions.has('default')).toBe(true);
  });

  test('fires sol-login event when the default session is logged in', async () => {
    seat(el.auth, 'default', 'https://ex.com/card#me', 'https://ex.com');
    const events = [];
    el.addEventListener('sol-login', (e) => events.push(e.detail));
    await el.initialize();
    expect(events.length).toBe(1);
    expect(events[0].webId).toBe('https://ex.com/card#me');
  });

  test('logout fires sol-logout and clears the session', async () => {
    const s = seat(el.auth, 'default', 'https://ex.com/card#me', 'https://ex.com');
    let fired = false;
    el.addEventListener('sol-logout', () => { fired = true; });
    await el.logout();
    expect(fired).toBe(true);
    expect(s.info.isLoggedIn).toBe(false);
  });

  test('webId and isLoggedIn reflect session state after initialize', async () => {
    seat(el.auth, 'default', 'https://ex.com/card#me', 'https://ex.com');
    await el.initialize();
    expect(el.webId).toBe('https://ex.com/card#me');
    expect(el.isLoggedIn).toBe(true);
  });
});

describe('SolLogin — UI updates', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('sol-login');
    el._manualInit = true;
    document.body.appendChild(el);
    resetShared(el);
  });
  afterEach(() => el.remove());

  test('shows a green log-out button after login', async () => {
    seat(el.auth, 'default', 'https://alice.example.com/profile/card#me', 'https://example.com');
    await el.initialize();
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn.textContent).toBe('Log out');
    expect(btn.classList.contains('logged-in')).toBe(true);
  });

  test('exposes the webId as the button title, not as page text', async () => {
    seat(el.auth, 'default', 'https://alice.example.com/profile/card#me', 'https://example.com');
    await el.initialize();
    expect(el.shadowRoot.querySelector('.auth-btn').title).toBe('https://alice.example.com/profile/card#me');
    expect(el.shadowRoot.querySelector('.auth-status').textContent).toBe('');
  });

  test('reverts to log-in button after logout', async () => {
    seat(el.auth, 'default', 'https://alice.example.com/profile/card#me', 'https://example.com');
    await el.initialize();
    await el.logout();
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn.textContent).toBe('Log in');
    expect(btn.classList.contains('sol-btn-primary')).toBe(true);
  });

  // The synthetic local owner sits on 'local' and must NOT turn the button
  // into a logout — the button reflects only the 'default' (remote) session.
  test('a local-owner session does not paint the button as logged in', async () => {
    seat(el.auth, 'local', 'http://localhost/dk-pod/profile/card#me', 'http://localhost/');
    await el.initialize();
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn.textContent).toBe('Log in');
  });
});
