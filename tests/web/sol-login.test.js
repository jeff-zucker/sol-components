/**
 * @jest-environment jsdom
 *
 * Tests for AuthManager and SolLogin from sol-login.js.
 * Pure logic tests — mock Session class, no real OIDC.
 */

import { jest } from '@jest/globals';
import { AuthManager, SolLogin } from '../../web/sol-login.js';
import { baseDomain } from '../../core/auth-core.js';

// Mock Session class injected via window global
class MockSession {
  constructor(opts, id) {
    this.id = id;
    this.info = { isLoggedIn: false, webId: null, issuer: null };
    this.fetch = (input, init) => globalThis.fetch(input, init);
    this._loginCalls = [];
  }
  async handleIncomingRedirect() {}
  async login(opts) { this._loginCalls.push(opts); }
  async logout() { this.info.isLoggedIn = false; this.info.webId = null; }
}

beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => new Response('', { status: 200 });
  }
  window.solidClientAuthn = { Session: MockSession };
  window.__SolSuppressDefineWarn = true;
});

function loggedInSession(tag, webId, issuer) {
  const mgr = new AuthManager();
  const session = mgr.sessionFor(tag, new URL(webId).origin);
  session.info = { isLoggedIn: true, webId, issuer };
  return mgr;
}

// ── originOf ──────────────────────────────────────────────────────────────

describe('originOf', () => {
  const mgr = new AuthManager();

  test('extracts origin from https URL', () => {
    expect(mgr.originOf('https://alice.example.com/pod/file.ttl'))
      .toBe('https://alice.example.com');
  });

  test('extracts origin from http URL with port', () => {
    expect(mgr.originOf('http://localhost:3000/path'))
      .toBe('http://localhost:3000');
  });

  test('returns empty string for invalid URL', () => {
    expect(mgr.originOf('not-a-url')).toBe('');
  });
});

// ── isNoAuth ──────────────────────────────────────────────────────────────

describe('isNoAuth', () => {
  test('returns false when noAuth not set', () => {
    const mgr = new AuthManager();
    expect(mgr.isNoAuth('https://example.com/file')).toBe(false);
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

  test('returns false for invalid URL', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://example.com';
    expect(mgr.isNoAuth('garbage')).toBe(false);
  });
});

// ── _baseDomain ───────────────────────────────────────────────────────────

describe('_baseDomain', () => {
  const mgr = new AuthManager();

  test('extracts last two parts', () => {
    expect(baseDomain('pod.solidcommunity.net')).toBe('solidcommunity.net');
  });

  test('returns host as-is for two parts', () => {
    expect(baseDomain('example.com')).toBe('example.com');
  });

  test('returns host as-is for single part', () => {
    expect(baseDomain('localhost')).toBe('localhost');
  });
});

// ── _sessionCoversOrigin ──────────────────────────────────────────────────

describe('_sessionCoversOrigin', () => {
  test('returns false when session not logged in', () => {
    const mgr = new AuthManager();
    const session = { info: { isLoggedIn: false, issuer: 'https://example.com' } };
    expect(mgr._sessionCoversOrigin(session, 'https://example.com')).toBe(false);
  });

  test('matches same host via issuer', () => {
    const mgr = new AuthManager();
    const session = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(mgr._sessionCoversOrigin(session, 'https://solidcommunity.net')).toBe(true);
  });

  test('matches subdomain of issuer', () => {
    const mgr = new AuthManager();
    const session = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(mgr._sessionCoversOrigin(session, 'https://alice.solidcommunity.net')).toBe(true);
  });

  test('matches via shared base domain with webId', () => {
    const mgr = new AuthManager();
    const session = {
      info: {
        isLoggedIn: true,
        issuer: 'https://login.inrupt.com',
        webId: 'https://alice.pod.inrupt.com/profile/card#me',
      },
    };
    expect(mgr._sessionCoversOrigin(session, 'https://bob.pod.inrupt.com')).toBe(true);
  });

  test('rejects unrelated origin', () => {
    const mgr = new AuthManager();
    const session = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(mgr._sessionCoversOrigin(session, 'https://other.example.com')).toBe(false);
  });
});

// ── sessionFor / getSessionFor ────────────────────────────────────────────

describe('sessionFor', () => {
  test('creates and caches a session', () => {
    const mgr = new AuthManager();
    const s1 = mgr.sessionFor('default', 'https://example.com');
    const s2 = mgr.sessionFor('default');
    expect(s1).toBe(s2);
  });

  test('different tags get different sessions', () => {
    const mgr = new AuthManager();
    const s1 = mgr.sessionFor('a', 'https://a.com');
    const s2 = mgr.sessionFor('b', 'https://b.com');
    expect(s1).not.toBe(s2);
  });
});

describe('getSessionFor', () => {
  test('returns null for noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.example.com';
    expect(mgr.getSessionFor('https://public.example.com/file', 'tag')).toBeNull();
  });

  test('returns own session if logged in', () => {
    const mgr = loggedInSession('default', 'https://alice.example.com/profile/card#me', 'https://example.com');
    const s = mgr.getSessionFor('https://alice.example.com/pod/', 'default');
    expect(s.info.isLoggedIn).toBe(true);
  });

  test('finds matching session from another tag', () => {
    const mgr = loggedInSession('other', 'https://alice.solidcommunity.net/profile/card#me', 'https://solidcommunity.net');
    mgr.sessionFor('default', 'https://solidcommunity.net');
    const s = mgr.getSessionFor('https://solidcommunity.net/file', 'default');
    expect(s.info.isLoggedIn).toBe(true);
  });
});

// ── isLoggedIn ────────────────────────────────────────────────────────────

describe('isLoggedIn', () => {
  test('returns true for noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    expect(mgr.isLoggedIn('https://public.com/file', 'tag')).toBe(true);
  });

  test('returns true for null URL', () => {
    const mgr = new AuthManager();
    expect(mgr.isLoggedIn(null, 'tag')).toBe(true);
  });

  test('returns false when not logged in', () => {
    const mgr = new AuthManager();
    mgr.sessionFor('tag', 'https://example.com');
    expect(mgr.isLoggedIn('https://example.com/file', 'tag')).toBe(false);
  });

  test('returns true when logged in', () => {
    const mgr = loggedInSession('tag', 'https://alice.example.com/card#me', 'https://example.com');
    expect(mgr.isLoggedIn('https://example.com/file', 'tag')).toBe(true);
  });
});

// ── getWebId ──────────────────────────────────────────────────────────────

describe('getWebId', () => {
  test('returns null for unknown tag', () => {
    const mgr = new AuthManager();
    expect(mgr.getWebId('unknown')).toBeNull();
  });

  test('returns webId when logged in', () => {
    const mgr = loggedInSession('me', 'https://alice.example.com/card#me', 'https://example.com');
    expect(mgr.getWebId('me')).toBe('https://alice.example.com/card#me');
  });
});

// ── getFirstLoggedIn ──────────────────────────────────────────────────────

describe('getFirstLoggedIn', () => {
  test('returns null when none logged in', () => {
    const mgr = new AuthManager();
    mgr.sessionFor('a', 'https://a.com');
    expect(mgr.getFirstLoggedIn()).toBeNull();
  });

  test('returns first logged-in session', () => {
    const mgr = new AuthManager();
    mgr.sessionFor('a', 'https://a.com');
    const mgr2 = loggedInSession('b', 'https://b.com/card#me', 'https://b.com');
    expect(mgr2.getFirstLoggedIn().info.webId).toBe('https://b.com/card#me');
  });
});

// ── fetchFor ──────────────────────────────────────────────────────────────

describe('fetchFor', () => {
  test('returns plain fetch for noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    expect(mgr.fetchFor('https://public.com/file')).toBe(fetch);
  });

  test('returns plain fetch when no session matches', () => {
    const mgr = new AuthManager();
    expect(mgr.fetchFor('https://unknown.com/file')).toBe(fetch);
  });

  test('returns session fetch when logged in', () => {
    const mgr = loggedInSession('tag', 'https://alice.example.com/card#me', 'https://example.com');
    const fn = mgr.fetchFor('https://example.com/data', 'tag');
    expect(fn).not.toBe(fetch);
  });

  test('without tag, finds matching session by origin', () => {
    const mgr = loggedInSession('x', 'https://alice.solidcommunity.net/card#me', 'https://solidcommunity.net');
    const fn = mgr.fetchFor('https://solidcommunity.net/resource');
    expect(fn).not.toBe(fetch);
  });

  test('without tag, returns plain fetch when no session matches', () => {
    const mgr = loggedInSession('x', 'https://alice.example.com/card#me', 'https://example.com');
    const fn = mgr.fetchFor('https://unrelated.org/file');
    expect(fn).toBe(fetch);
  });
});

// ── _sessionId ───────────────────────────────────────────────────────────

describe('_sessionId', () => {
  const mgr = new AuthManager();

  test('generates deterministic id from tag and origin', () => {
    const id = mgr._sessionId('default', 'https://example.com');
    expect(id).toBe('sol_default_https___example_com');
  });

  test('different tags produce different ids', () => {
    const a = mgr._sessionId('a', 'https://example.com');
    const b = mgr._sessionId('b', 'https://example.com');
    expect(a).not.toBe(b);
  });

  test('different origins produce different ids', () => {
    const a = mgr._sessionId('tag', 'https://a.com');
    const b = mgr._sessionId('tag', 'https://b.com');
    expect(a).not.toBe(b);
  });
});

// ── setSideOrigin ────────────────────────────────────────────────────────

describe('setSideOrigin', () => {
  test('creates a new session for the origin', () => {
    const mgr = new AuthManager();
    mgr.setSideOrigin('default', 'https://example.com/pod/');
    const s = mgr.sessions.get('default');
    expect(s).toBeTruthy();
    expect(s.id).toContain('example_com');
  });

  test('does not replace session when origin already matches', () => {
    const mgr = new AuthManager();
    mgr.setSideOrigin('tag', 'https://example.com/a');
    const s1 = mgr.sessions.get('tag');
    mgr.setSideOrigin('tag', 'https://example.com/b');
    const s2 = mgr.sessions.get('tag');
    expect(s1).toBe(s2);
  });

  test('skips noAuth URLs', () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    mgr.setSideOrigin('tag', 'https://public.com/file');
    expect(mgr.sessions.has('tag')).toBe(false);
  });

  test('keeps existing session if it covers the new origin', () => {
    const mgr = loggedInSession('tag', 'https://alice.solidcommunity.net/card#me', 'https://solidcommunity.net');
    const original = mgr.sessions.get('tag');
    mgr.setSideOrigin('tag', 'https://bob.solidcommunity.net/file');
    expect(mgr.sessions.get('tag')).toBe(original);
  });

  test('replaces session when existing does not cover new origin', () => {
    const mgr = loggedInSession('tag', 'https://alice.example.com/card#me', 'https://example.com');
    const original = mgr.sessions.get('tag');
    mgr.setSideOrigin('tag', 'https://completely-different.org/file');
    expect(mgr.sessions.get('tag')).not.toBe(original);
  });

  test('persists origins to localStorage', () => {
    const mgr = new AuthManager();
    mgr.setSideOrigin('tag', 'https://example.com/pod/');
    const stored = JSON.parse(localStorage.getItem('solLoginOrigins'));
    expect(stored.tag).toBe('https://example.com');
  });
});

// ── handleIncomingRedirect ───────────────────────────────────────────────

describe('handleIncomingRedirect', () => {
  test('calls handleIncomingRedirect on all sessions', async () => {
    const mgr = new AuthManager();
    mgr.sessionFor('a', 'https://a.com');
    mgr.sessionFor('b', 'https://b.com');
    const calls = [];
    for (const [, s] of mgr.sessions) {
      s.handleIncomingRedirect = jest.fn(async () => {});
    }
    await mgr.handleIncomingRedirect();
    for (const [, s] of mgr.sessions) {
      expect(s.handleIncomingRedirect).toHaveBeenCalledWith(window.location.href);
    }
  });

  test('restores pending tag from localStorage', async () => {
    localStorage.setItem('solLoginPendingTag', 'restore-me');
    const mgr = new AuthManager();
    await mgr.handleIncomingRedirect();
    expect(mgr.sessions.has('restore-me')).toBe(true);
    expect(localStorage.getItem('solLoginPendingTag')).toBeNull();
  });
});

// ── ensureAuthenticated ─────────────────────────────────────────────────

describe('ensureAuthenticated', () => {
  test('returns true immediately for noAuth URLs', async () => {
    const mgr = new AuthManager();
    mgr.noAuth = 'https://public.com';
    const result = await mgr.ensureAuthenticated('https://public.com/file');
    expect(result).toBe(true);
  });

  test('returns true when already logged in', async () => {
    const mgr = loggedInSession('default', 'https://alice.example.com/card#me', 'https://example.com');
    const result = await mgr.ensureAuthenticated('https://example.com/file');
    expect(result).toBe(true);
  });

  test('calls session.login when not logged in', async () => {
    const mgr = new AuthManager();
    const result = await mgr.ensureAuthenticated('https://example.com/file', 'default');
    expect(result).toBe(false);
    const session = mgr.sessions.get('default');
    expect(session._loginCalls.length).toBe(1);
    expect(session._loginCalls[0].oidcIssuer).toBe('https://example.com');
  });

  test('stores pending tag in localStorage before login', async () => {
    const mgr = new AuthManager();
    await mgr.ensureAuthenticated('https://example.com/file', 'my-tag');
    expect(localStorage.getItem('solLoginPendingTag')).toBe('my-tag');
  });
});

// ── _sessionCoversOrigin edge cases ──────────────────────────────────────

describe('_sessionCoversOrigin — edge cases', () => {
  test('handles session with no issuer but matching webId', () => {
    const mgr = new AuthManager();
    const session = {
      info: { isLoggedIn: true, issuer: null, webId: 'https://alice.example.com/card#me' },
    };
    expect(mgr._sessionCoversOrigin(session, 'https://alice.example.com')).toBe(true);
  });

  test('handles session with no webId but matching issuer', () => {
    const mgr = new AuthManager();
    const session = {
      info: { isLoggedIn: true, issuer: 'https://example.com', webId: null },
    };
    expect(mgr._sessionCoversOrigin(session, 'https://example.com')).toBe(true);
  });

  test('returns false for invalid origin URL', () => {
    const mgr = new AuthManager();
    const session = {
      info: { isLoggedIn: true, issuer: 'https://example.com', webId: null },
    };
    expect(mgr._sessionCoversOrigin(session, 'not-a-url')).toBe(false);
  });

  test('returns false when session has no info', () => {
    const mgr = new AuthManager();
    expect(mgr._sessionCoversOrigin({}, 'https://example.com')).toBe(false);
  });
});

// ── getSessionFor edge cases ─────────────────────────────────────────────

describe('getSessionFor — edge cases', () => {
  test('returns null for null URL', () => {
    const mgr = new AuthManager();
    expect(mgr.getSessionFor(null, 'tag')).toBeNull();
  });

  test('returns own session even when not logged in (as fallback)', () => {
    const mgr = new AuthManager();
    const session = mgr.sessionFor('tag', 'https://example.com');
    const result = mgr.getSessionFor('https://unrelated.com/file', 'tag');
    expect(result).toBe(session);
  });

  test('prefers logged-in own session over cross-origin match', () => {
    const mgr = new AuthManager();
    // Create a logged-in session under 'other'
    const otherSession = mgr.sessionFor('other', 'https://example.com');
    otherSession.info = { isLoggedIn: true, webId: 'https://example.com/card#me', issuer: 'https://example.com' };
    // Create own session for 'mine' that is also logged in
    const mySession = mgr.sessionFor('mine', 'https://example.com');
    mySession.info = { isLoggedIn: true, webId: 'https://example.com/me#me', issuer: 'https://example.com' };
    const result = mgr.getSessionFor('https://example.com/file', 'mine');
    expect(result).toBe(mySession);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SolLogin component tests
// ═══════════════════════════════════════════════════════════════════════════

describe('SolLogin component', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('sol-login');
    el._manualInit = true;
    document.body.appendChild(el);
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
    const fn = el.fetchFor('https://example.com/file');
    expect(fn).toBe(fetch);
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

  test('addIssuer ignores invalid URL', () => {
    el.issuers = [];
    el.addIssuer('not-a-url');
    expect(el.issuers).toHaveLength(0);
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
  });
  afterEach(() => el.remove());

  test('initialize creates default session', async () => {
    await el.initialize();
    expect(el.auth.sessions.has('default')).toBe(true);
  });

  test('initialize with custom tags creates those sessions', async () => {
    await el.initialize(['a', 'b']);
    expect(el.auth.sessions.has('a')).toBe(true);
    expect(el.auth.sessions.has('b')).toBe(true);
  });

  test('fires sol-login event when session is already logged in', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://ex.com/card#me', issuer: 'https://ex.com' };
    const events = [];
    el.addEventListener('sol-login', (e) => events.push(e.detail));
    await el.initialize();
    expect(events.length).toBe(1);
    expect(events[0].webId).toBe('https://ex.com/card#me');
  });

  test('logout fires sol-logout event', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://ex.com/card#me', issuer: 'https://ex.com' };
    let fired = false;
    el.addEventListener('sol-logout', () => { fired = true; });
    await el.logout();
    expect(fired).toBe(true);
  });

  test('logout calls session.logout on all sessions', async () => {
    const s1 = el.auth.sessionFor('a', 'https://a.com');
    s1.info = { isLoggedIn: true, webId: 'https://a.com/me', issuer: 'https://a.com' };
    const s2 = el.auth.sessionFor('b', 'https://b.com');
    s2.info = { isLoggedIn: true, webId: 'https://b.com/me', issuer: 'https://b.com' };
    await el.logout();
    expect(s1.info.isLoggedIn).toBe(false);
    expect(s2.info.isLoggedIn).toBe(false);
  });

  test('webId and isLoggedIn reflect session state after initialize', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://ex.com/card#me', issuer: 'https://ex.com' };
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
  });
  afterEach(() => el.remove());

  test('shows a green log-out button after login', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://alice.example.com/profile/card#me', issuer: 'https://example.com' };
    await el.initialize();
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn.textContent).toBe('Log out');
    expect(btn.classList.contains('logged-in')).toBe(true);
  });

  test('exposes the webId as the button title, not as page text', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://alice.example.com/profile/card#me', issuer: 'https://example.com' };
    await el.initialize();
    expect(el.shadowRoot.querySelector('.auth-btn').title)
      .toBe('https://alice.example.com/profile/card#me');
    expect(el.shadowRoot.querySelector('.auth-status').textContent).toBe('');
  });

  test('reverts to log-in button after logout', async () => {
    const session = el.auth.sessionFor('default', 'https://example.com');
    session.info = { isLoggedIn: true, webId: 'https://alice.example.com/profile/card#me', issuer: 'https://example.com' };
    await el.initialize();
    await el.logout();
    const btn = el.shadowRoot.querySelector('.auth-btn');
    expect(btn.textContent).toBe('Log in');
    expect(btn.classList.contains('sol-btn-primary')).toBe(true);
  });
});
