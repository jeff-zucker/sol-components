/**
 * Tests for sol-login-node.js — the Node.js auth API.
 * Uses mock @inrupt/solid-client-authn-node and openid-client via jest moduleNameMapper.
 */

import { SolidAuth } from '../../node/sol-login.js';
import { baseDomain } from '../../core/auth-core.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// helper: simulate the browser redirect in openUrl callback
function simulateBrowser(url) {
  const parsed = new URL(url);
  const redirectUri = parsed.searchParams.get('redirect_uri');
  return globalThis.fetch(`${redirectUri}?code=abc&state=xyz`);
}

// ── constructor ───────────────────────────────────────────────────────────

describe('SolidAuth constructor', () => {
  test('creates with empty sessions', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.sessions.size).toBe(0);
  });

  test('accepts noAuth option', () => {
    const auth = new SolidAuth({ noAuth: 'https://public.example.com', tokenStore: null });
    expect(auth.isNoAuth('https://public.example.com/file')).toBe(true);
  });
});

// ── originOf ──────────────────────────────────────────────────────────────

describe('originOf', () => {
  const auth = new SolidAuth({ tokenStore: null });

  test('extracts origin', () => {
    expect(auth.originOf('https://pod.example.com/path/file')).toBe('https://pod.example.com');
  });

  test('includes port', () => {
    expect(auth.originOf('http://localhost:3000/data')).toBe('http://localhost:3000');
  });

  test('returns empty for invalid URL', () => {
    expect(auth.originOf('not-a-url')).toBe('');
  });
});

// ── isNoAuth ──────────────────────────────────────────────────────────────

describe('isNoAuth', () => {
  test('false when not set', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.isNoAuth('https://example.com/file')).toBe(false);
  });

  test('matches single origin string', () => {
    const auth = new SolidAuth({ tokenStore: null });
    auth.noAuth = 'https://public.com';
    expect(auth.isNoAuth('https://public.com/data')).toBe(true);
    expect(auth.isNoAuth('https://private.com/data')).toBe(false);
  });

  test('matches origin in array', () => {
    const auth = new SolidAuth({ tokenStore: null });
    auth.noAuth = ['https://a.com', 'https://b.com'];
    expect(auth.isNoAuth('https://a.com/x')).toBe(true);
    expect(auth.isNoAuth('https://c.com/x')).toBe(false);
  });

  test('returns false for invalid URL', () => {
    const auth = new SolidAuth({ tokenStore: null });
    auth.noAuth = 'https://example.com';
    expect(auth.isNoAuth('not-a-url')).toBe(false);
  });
});

// ── _baseDomain ───────────────────────────────────────────────────────────

describe('_baseDomain', () => {
  const auth = new SolidAuth({ tokenStore: null });

  test('extracts last two parts', () => {
    expect(baseDomain('pod.solidcommunity.net')).toBe('solidcommunity.net');
  });

  test('returns as-is for two parts', () => {
    expect(baseDomain('example.com')).toBe('example.com');
  });

  test('returns as-is for single part', () => {
    expect(baseDomain('localhost')).toBe('localhost');
  });
});

// ── _sessionCoversOrigin ──────────────────────────────────────────────────

describe('_sessionCoversOrigin', () => {
  const auth = new SolidAuth({ tokenStore: null });

  test('false when not logged in', () => {
    const s = { info: { isLoggedIn: false, issuer: 'https://ex.com' } };
    expect(auth._sessionCoversOrigin(s, 'https://ex.com')).toBe(false);
  });

  test('matches same host via issuer', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(auth._sessionCoversOrigin(s, 'https://solidcommunity.net')).toBe(true);
  });

  test('matches subdomain of issuer', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(auth._sessionCoversOrigin(s, 'https://alice.solidcommunity.net')).toBe(true);
  });

  test('matches via shared base domain', () => {
    const s = {
      info: { isLoggedIn: true, issuer: 'https://login.inrupt.com', webId: 'https://alice.pod.inrupt.com/card#me' },
    };
    expect(auth._sessionCoversOrigin(s, 'https://bob.pod.inrupt.com')).toBe(true);
  });

  test('rejects unrelated origin', () => {
    const s = { info: { isLoggedIn: true, issuer: 'https://solidcommunity.net', webId: null } };
    expect(auth._sessionCoversOrigin(s, 'https://other.example.com')).toBe(false);
  });
});

// ── login (credentials) ──────────────────────────────────────────────────

describe('login with credentials', () => {
  test('requires oidcIssuer', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await expect(auth.login({ clientId: 'x', clientSecret: 'y' }))
      .rejects.toThrow('oidcIssuer is required');
  });

  test('logs in and stores session under tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    const result = await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      clientId: 'my-app',
      clientSecret: 'secret',
    });
    expect(result.isLoggedIn).toBe(true);
    expect(result.webId).toBe('https://solidcommunity.net/profile/card#me');
    expect(typeof result.fetch).toBe('function');
    expect(auth.sessions.has('default')).toBe(true);
  });

  test('custom tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({
      tag: 'work',
      oidcIssuer: 'https://work.example.com/',
      clientId: 'app',
      clientSecret: 'sec',
    });
    expect(auth.sessions.has('work')).toBe(true);
    expect(auth.getWebId('work')).toBe('https://work.example.com/profile/card#me');
  });

  test('multiple logins to different tags', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'a', oidcIssuer: 'https://a.com/', clientId: 'x', clientSecret: 'x' });
    await auth.login({ tag: 'b', oidcIssuer: 'https://b.com/', clientId: 'x', clientSecret: 'x' });
    expect(auth.sessions.size).toBe(2);
    expect(auth.getWebId('a')).toBe('https://a.com/profile/card#me');
    expect(auth.getWebId('b')).toBe('https://b.com/profile/card#me');
  });
});

// ── login (interactive, default) ─────────────────────────────────────────

describe('login interactive (default)', () => {
  test('requires oidcIssuer', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await expect(auth.login({}))
      .rejects.toThrow('oidcIssuer is required');
  });

  test('spins up server, calls openUrl, completes on callback', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    let capturedUrl = null;

    const result = await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => {
        capturedUrl = url;
        await simulateBrowser(url);
      },
    });

    expect(capturedUrl).toContain('solidcommunity.net');
    expect(result.isLoggedIn).toBe(true);
    expect(result.webId).toBe('https://solidcommunity.net/profile/card#me');
    expect(typeof result.fetch).toBe('function');
    expect(auth.sessions.has('default')).toBe(true);
  });

  test('custom tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });

    await auth.login({
      tag: 'pod2',
      oidcIssuer: 'https://login.inrupt.com/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    expect(auth.getWebId('pod2')).toBe('https://login.inrupt.com/profile/card#me');
  });

  test('uses specified port', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    let callbackPort = null;

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      port: 0,
      openUrl: async (url) => {
        const parsed = new URL(url);
        const redirectUri = new URL(parsed.searchParams.get('redirect_uri'));
        callbackPort = redirectUri.port;
        await globalThis.fetch(`${redirectUri.href}?code=abc&state=xyz`);
      },
    });

    expect(callbackPort).toBeTruthy();
    expect(auth.isLoggedIn('https://solidcommunity.net/pod/', 'default')).toBe(true);
  });

  test('server shuts down after login completes', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    let redirectUri = null;

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => {
        const parsed = new URL(url);
        redirectUri = parsed.searchParams.get('redirect_uri');
        await globalThis.fetch(`${redirectUri}?code=abc&state=xyz`);
      },
    });

    await expect(globalThis.fetch(redirectUri)).rejects.toThrow();
  });
});

// ── token persistence ────────────────────────────────────────────────────

describe('token persistence', () => {
  let tmpDir, tokenPath;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sol-auth-test-'));
    tokenPath = join(tmpDir, 'tokens.json');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('saves tokens after interactive login', async () => {
    const auth = new SolidAuth({ tokenStore: tokenPath });

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    const stored = JSON.parse(await readFile(tokenPath, 'utf8'));
    expect(stored['https://solidcommunity.net/']).toBeDefined();
    expect(stored['https://solidcommunity.net/'].refresh_token).toBe('mock-refresh-token');
    expect(stored['https://solidcommunity.net/'].client_id).toBe('mock-client-id');
  });

  test('restores session from saved tokens without browser', async () => {
    const auth1 = new SolidAuth({ tokenStore: tokenPath });

    await auth1.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    const auth2 = new SolidAuth({ tokenStore: tokenPath });
    let browserOpened = false;

    const result = await auth2.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async () => { browserOpened = true; },
    });

    expect(browserOpened).toBe(false);
    expect(result.isLoggedIn).toBe(true);
    expect(result.webId).toBe('https://solidcommunity.net/profile/card#me');
    expect(typeof result.fetch).toBe('function');
  });

  test('clears tokens on logout', async () => {
    const auth = new SolidAuth({ tokenStore: tokenPath });

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    await auth.logout('default');
    const stored = JSON.parse(await readFile(tokenPath, 'utf8'));
    expect(stored['https://solidcommunity.net/']).toBeUndefined();
  });

  test('falls back to browser when refresh fails', async () => {
    const auth = new SolidAuth({ tokenStore: tokenPath });

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    // corrupt the stored tokens
    const stored = JSON.parse(await readFile(tokenPath, 'utf8'));
    stored['https://solidcommunity.net/'].refresh_token = null;
    const fs = await import('node:fs/promises');
    await fs.writeFile(tokenPath, JSON.stringify(stored));

    const auth2 = new SolidAuth({ tokenStore: tokenPath });
    let browserOpened = false;

    await auth2.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => {
        browserOpened = true;
        await simulateBrowser(url);
      },
    });

    expect(browserOpened).toBe(true);
  });

  test('tokenStore: null disables persistence', async () => {
    const auth = new SolidAuth({ tokenStore: null });

    await auth.login({
      oidcIssuer: 'https://solidcommunity.net/',
      openUrl: async (url) => { await simulateBrowser(url); },
    });

    // no file should exist at default path
    const fs = await import('node:fs/promises');
    await expect(fs.readFile(tokenPath, 'utf8')).rejects.toThrow();
  });
});

// ── fetch (unified local + remote) ───────────────────────────────────────

describe('fetch', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sol-fetch-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('reads local file with relative-like path', async () => {
    const { writeFile } = await import('node:fs/promises');
    const filePath = join(tmpDir, 'test.txt');
    await writeFile(filePath, 'hello');

    const auth = new SolidAuth({ tokenStore: null });
    const resp = await auth._localFetch(filePath);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toBe('hello');
  });

  test('returns 404 for missing local file', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    const resp = await auth._localFetch(join(tmpDir, 'nope.txt'));
    expect(resp.status).toBe(404);
  });

  test('PUT creates a local file', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    const filePath = join(tmpDir, 'sub', 'new.txt');
    const resp = await auth._localFetch(filePath, { method: 'PUT', body: 'content' });
    expect(resp.status).toBe(201);

    const { readFile: rf } = await import('node:fs/promises');
    expect(await rf(filePath, 'utf8')).toBe('content');
  });

  test('DELETE removes a local file', async () => {
    const { writeFile } = await import('node:fs/promises');
    const filePath = join(tmpDir, 'del.txt');
    await writeFile(filePath, 'bye');

    const auth = new SolidAuth({ tokenStore: null });
    const resp = await auth._localFetch(filePath, { method: 'DELETE' });
    expect(resp.status).toBe(204);
  });

  test('routes local paths through _localFetch', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    const resp = await auth.fetch('./package.json');
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toContain('sol-components');
  });

  test('routes remote URLs through fetchFor', async () => {
    // Stub globalThis.fetch so this stays a unit test — a real request to
    // example.com leaves an undici keep-alive socket open, which prevents
    // the jest worker from exiting gracefully.
    const realFetch = globalThis.fetch;
    let calledWith = null;
    globalThis.fetch = async (u, init) => { calledWith = u; return { status: 200 }; };
    try {
      const auth = new SolidAuth({ tokenStore: null });
      const resp = await auth.fetch('https://example.com');
      expect(calledWith).toBe('https://example.com');   // went via fetchFor, not _localFetch
      expect(resp.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

// ── addSession ────────────────────────────────────────────────────────────

describe('addSession', () => {
  test('adds an external session', () => {
    const auth = new SolidAuth({ tokenStore: null });
    const s = {
      info: { isLoggedIn: true, webId: 'https://ex.com/card#me', issuer: 'https://ex.com' },
      fetch: () => {},
    };
    auth.addSession('ext', s);
    expect(auth.getWebId('ext')).toBe('https://ex.com/card#me');
  });
});

// ── getSessionFor ─────────────────────────────────────────────────────────

describe('getSessionFor', () => {
  test('returns null for noAuth URLs', () => {
    const auth = new SolidAuth({ noAuth: 'https://public.com', tokenStore: null });
    expect(auth.getSessionFor('https://public.com/file', 'tag')).toBeNull();
  });

  test('returns null for null URL', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.getSessionFor(null, 'tag')).toBeNull();
  });

  test('returns own tagged session if logged in', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'me', oidcIssuer: 'https://ex.com/', clientId: 'x', clientSecret: 'x' });
    const s = auth.getSessionFor('https://ex.com/data', 'me');
    expect(s.info.isLoggedIn).toBe(true);
  });

  test('finds matching session from another tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'other', oidcIssuer: 'https://solidcommunity.net/', clientId: 'x', clientSecret: 'x' });
    const s = auth.getSessionFor('https://solidcommunity.net/file', 'default');
    expect(s.info.isLoggedIn).toBe(true);
  });

  test('returns null when no session matches', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.getSessionFor('https://unknown.com/file', 'tag')).toBeNull();
  });
});

// ── fetchFor ──────────────────────────────────────────────────────────────

describe('fetchFor', () => {
  test('returns globalThis.fetch for noAuth URLs', () => {
    const auth = new SolidAuth({ noAuth: 'https://public.com', tokenStore: null });
    expect(auth.fetchFor('https://public.com/file')).toBe(globalThis.fetch);
  });

  test('returns globalThis.fetch when no session matches', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.fetchFor('https://unknown.com/file')).toBe(globalThis.fetch);
  });

  test('returns session fetch when logged in', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ oidcIssuer: 'https://ex.com/', clientId: 'x', clientSecret: 'x' });
    const fn = auth.fetchFor('https://ex.com/data', 'default');
    expect(fn).not.toBe(globalThis.fetch);
  });

  test('finds session by origin without tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ oidcIssuer: 'https://solidcommunity.net/', clientId: 'x', clientSecret: 'x' });
    const fn = auth.fetchFor('https://solidcommunity.net/pod/file');
    expect(fn).not.toBe(globalThis.fetch);
  });
});

// ── session.fetch ────────────────────────────────────────────────────────

describe('session.fetch', () => {
  test('returned fetch performs the request', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    const result = await auth.login({
      oidcIssuer: 'https://ex.com/',
      clientId: 'x',
      clientSecret: 'x',
    });
    const fn = result.fetch;
    expect(typeof fn).toBe('function');
  });
});

// ── isLoggedIn ────────────────────────────────────────────────────────────

describe('isLoggedIn', () => {
  test('true for noAuth URLs', () => {
    const auth = new SolidAuth({ noAuth: 'https://public.com', tokenStore: null });
    expect(auth.isLoggedIn('https://public.com/file')).toBe(true);
  });

  test('true for null URL', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.isLoggedIn(null)).toBe(true);
  });

  test('false when not logged in', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.isLoggedIn('https://ex.com/file', 'tag')).toBe(false);
  });

  test('true when logged in', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ oidcIssuer: 'https://ex.com/', clientId: 'x', clientSecret: 'x' });
    expect(auth.isLoggedIn('https://ex.com/file', 'default')).toBe(true);
  });
});

// ── getWebId ──────────────────────────────────────────────────────────────

describe('getWebId', () => {
  test('null for unknown tag', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.getWebId('unknown')).toBeNull();
  });

  test('returns webId when logged in', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ oidcIssuer: 'https://ex.com/', clientId: 'x', clientSecret: 'x' });
    expect(auth.getWebId()).toBe('https://ex.com/profile/card#me');
  });

  test('defaults to "default" tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ oidcIssuer: 'https://ex.com/', clientId: 'x', clientSecret: 'x' });
    expect(auth.getWebId()).toBe(auth.getWebId('default'));
  });
});

// ── getFirstLoggedIn ──────────────────────────────────────────────────────

describe('getFirstLoggedIn', () => {
  test('null when none logged in', () => {
    const auth = new SolidAuth({ tokenStore: null });
    expect(auth.getFirstLoggedIn()).toBeNull();
  });

  test('returns first logged-in session', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'x', oidcIssuer: 'https://x.com/', clientId: 'x', clientSecret: 'x' });
    expect(auth.getFirstLoggedIn().info.isLoggedIn).toBe(true);
  });
});

// ── logout ────────────────────────────────────────────────────────────────

describe('logout', () => {
  test('logs out specific tag', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'a', oidcIssuer: 'https://a.com/', clientId: 'x', clientSecret: 'x' });
    await auth.login({ tag: 'b', oidcIssuer: 'https://b.com/', clientId: 'x', clientSecret: 'x' });
    await auth.logout('a');
    expect(auth.sessions.has('a')).toBe(false);
    expect(auth.sessions.has('b')).toBe(true);
  });

  test('logs out all when no tag given', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await auth.login({ tag: 'a', oidcIssuer: 'https://a.com/', clientId: 'x', clientSecret: 'x' });
    await auth.login({ tag: 'b', oidcIssuer: 'https://b.com/', clientId: 'x', clientSecret: 'x' });
    await auth.logout();
    expect(auth.sessions.size).toBe(0);
  });

  test('logout of unknown tag is safe', async () => {
    const auth = new SolidAuth({ tokenStore: null });
    await expect(auth.logout('nonexistent')).resolves.not.toThrow();
  });
});
