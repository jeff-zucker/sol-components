/**
 * Node.js authentication manager for Solid Pods.
 *
 * Provides the same session management as the `<sol-login>` web component
 * but for scripts and servers — no DOM, localStorage, or window dependencies.
 *
 * @module sol-login-node
 * @example
 * import { SolidAuth } from 'sol-components/login-node';
 * const auth = new SolidAuth();
 *
 * // Username/password (NSS & CSS — no browser needed):
 * const session = await auth.login({
 *   oidcIssuer: 'https://solidcommunity.net',
 *   username: 'alice',
 *   password: 'secret',
 * });
 *
 * // Interactive browser login (default when no credentials given):
 * const session = await auth.login({ oidcIssuer: 'https://solidcommunity.net' });
 *
 * // Client credentials (scripts, bots, CI):
 * const session = await auth.login({
 *   oidcIssuer: 'https://solidcommunity.net',
 *   clientId:   'my-app-id',
 *   clientSecret: 'my-secret',
 * });
 *
 * // session.fetch handles local files and remote URLs:
 * const resp = await session.fetch('https://alice.solidcommunity.net/pod/file.ttl');
 * const local = await session.fetch('./data.ttl');
 */

import {
  originOf,
  sessionCoversOrigin,
  isNoAuth as _isNoAuth,
  getSessionFor as _getSessionFor,
  makeFetchFor,
  isLoggedInFor,
  getWebId as _getWebId,
  getFirstLoggedIn as _getFirstLoggedIn,
} from '../core/auth-core.js';

let _SessionClass = null;

async function getSessionClass() {
  if (_SessionClass) return _SessionClass;
  const mod = await import('@inrupt/solid-client-authn-node');
  _SessionClass = mod.Session;
  if (!_SessionClass) throw new Error('sol-login-node: @inrupt/solid-client-authn-node must be installed');
  return _SessionClass;
}

function _defaultTokenPath() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.solid-auth-tokens.json`;
}

async function _readTokenStore(path) {
  try {
    const fs = await import('node:fs/promises');
    const data = await fs.readFile(path, 'utf8');
    return JSON.parse(data);
  } catch { return {}; }
}

async function _writeTokenStore(path, store) {
  const fs = await import('node:fs/promises');
  await fs.writeFile(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

async function _openBrowser(url) {
  const { platform } = await import('node:os');
  const { exec } = await import('node:child_process');
  const cmd = platform() === 'darwin' ? 'open'
    : platform() === 'win32' ? 'start'
    : 'xdg-open';
  exec(`${cmd} ${JSON.stringify(url)}`);
}

async function _startCallbackServer(port = 0) {
  const http = await import('node:http');
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, 'localhost', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

/**
 * Manages Solid authentication sessions for Node.js environments.
 *
 * Supports three login strategies: client credentials (for scripts/bots/CI),
 * username/password (NSS & CSS servers), and interactive browser-based OIDC.
 * Sessions are stored in a Map keyed by tag and can be looked up by URL origin.
 *
 * @example
 * const auth = new SolidAuth({ noAuth: 'http://localhost:3000' });
 * await auth.login({ oidcIssuer: 'https://solidcommunity.net', clientId: 'id', clientSecret: 'secret' });
 * const resp = await auth.fetch('https://alice.solidcommunity.net/pod/file.ttl');
 */
export class SolidAuth {
  /**
   * @param {Object} [opts]
   * @param {string|string[]} [opts.noAuth] - Origin(s) that never need authentication.
   * @param {string|null} [opts.tokenStore] - Path to the JSON token file for session persistence.
   *   Defaults to `~/.solid-auth-tokens.json`. Pass `null` to disable persistence.
   */
  constructor(opts = {}) {
    /** @type {Map<string, Object>} */
    this.sessions = new Map();
    this._noAuth = opts.noAuth || null;
    this._tokenStore = opts.tokenStore !== undefined ? opts.tokenStore : _defaultTokenPath();
  }

  /** @param {string|string[]} v - Origin(s) that bypass authentication. */
  set noAuth(v) { this._noAuth = v; }

  /**
   * Check whether a URL's origin is in the noAuth list.
   * @param {string} url
   * @returns {boolean}
   */
  isNoAuth(url) { return _isNoAuth(url, this._noAuth); }

  /**
   * Extract the origin (scheme + host + port) from a URL string.
   * @param {string} url
   * @returns {string} The origin, or empty string if not matched.
   */
  originOf(url) { return originOf(url); }

  _sessionCoversOrigin(session, origin) {
    return sessionCoversOrigin(session, origin);
  }

  _makeSessionResult(session) {
    const self = this;
    return {
      webId: session.info.webId,
      isLoggedIn: session.info.isLoggedIn,
      fetch: (url, init) => self.fetch(url, init),
    };
  }

  /**
   * Fetch a resource, using an authenticated session when available.
   * Local paths (starting with `/` or `./`) are handled via the filesystem.
   * @param {string} url - Remote URL or local file path.
   * @param {RequestInit} [init={}]
   * @returns {Promise<Response>}
   */
  async fetch(url, init = {}) {
    if (typeof url === 'string' && (url.startsWith('/') || url.startsWith('./'))) {
      return this._localFetch(url, init);
    }
    return this.fetchFor(url)(url, init);
  }

  async _localFetch(url, init = {}) {
    const { resolve } = await import('node:path');
    const { readFile, writeFile, unlink, mkdir, stat } = await import('node:fs/promises');
    const filePath = resolve(url);
    const method = (init.method || 'GET').toUpperCase();

    try {
      if (method === 'GET' || method === 'HEAD') {
        const content = await readFile(filePath, 'utf8');
        return new Response(method === 'HEAD' ? null : content, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (method === 'PUT' || method === 'POST') {
        const { dirname } = await import('node:path');
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, init.body || '', 'utf8');
        return new Response(null, { status: method === 'PUT' ? 201 : 200 });
      }
      if (method === 'DELETE') {
        await unlink(filePath);
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 405, statusText: 'Method Not Allowed' });
    } catch (e) {
      if (e.code === 'ENOENT') return new Response(null, { status: 404, statusText: 'Not Found' });
      return new Response(e.message, { status: 500 });
    }
  }

  /**
   * Authenticate with a Solid identity provider.
   *
   * Strategy selection:
   * - If `clientId` + `clientSecret` are provided, uses client-credentials flow.
   * - Otherwise tries to restore a saved session, then username/password, then interactive browser login.
   *
   * @param {Object} [opts]
   * @param {string} opts.oidcIssuer - The Solid OIDC issuer URL.
   * @param {string} [opts.tag='default'] - Session tag for multi-session management.
   * @param {string} [opts.clientId] - Client credentials ID.
   * @param {string} [opts.clientSecret] - Client credentials secret.
   * @param {string} [opts.username] - Username for password-based login (NSS or CSS).
   * @param {string} [opts.password] - Password for password-based login.
   * @param {string} [opts.clientName='Solid App'] - Application name for dynamic registration.
   * @param {number} [opts.port] - Local port for the interactive callback server.
   * @param {function} [opts.openUrl] - Custom function to open the browser (receives auth URL).
   * @returns {Promise<{webId: string, isLoggedIn: boolean, fetch: function}>}
   */
  async login(opts = {}) {
    if (opts.clientId && opts.clientSecret) {
      return this._loginCredentials(opts);
    }
    const restored = await this._tryRefresh(opts.oidcIssuer, opts.tag || 'default');
    if (restored) return restored;
    if (opts.username && opts.password) {
      const result = await this._loginPassword(opts);
      if (result) return result;
    }
    return this._loginInteractive(opts);
  }

  async _detectServerType(origin) {
    try {
      const resp = await globalThis.fetch(origin, { method: 'HEAD' });
      const powered = (resp.headers.get('x-powered-by') || '').toLowerCase();
      if (powered.includes('community solid server'))  console.log('Server uses CSS');
      if (powered.includes('community solid server')) return 'css';
      if (powered.includes('solid')) console.log('Server uses NSS');
      if (powered.includes('solid')) return 'nss';
    } catch {}
    try {
      const resp = await globalThis.fetch(`${origin}/.account/`, { method: 'GET' });
      if (resp.ok || resp.status === 401) return 'css';
    } catch {}
    return 'unknown';
  }

  async _loginPassword({ tag = 'default', oidcIssuer, username, password } = {}) {
    if (!oidcIssuer) throw new Error('oidcIssuer is required');
    const origin = oidcIssuer.replace(/\/$/, '');
    const serverType = await this._detectServerType(origin);

    if (serverType === 'nss') {
      const result = await this._loginPasswordNSS({ tag, oidcIssuer, origin, username, password });
      if (result) return result;
    } else {
      const result = await this._loginPasswordCSS({ tag, oidcIssuer, origin, username, password });
      if (result) return result;
    }

    console.warn('sol-login-node: password login failed, falling back to browser');
    return null;
  }

  async _loginPasswordNSS({ tag, oidcIssuer, origin, username, password }) {
    try {
      const resp = await globalThis.fetch(`${origin}/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        redirect: 'manual',
      });
      if (resp.status === 400) {
        console.warn('sol-login-node: NSS login returned 400 (bad credentials)');
        return null;
      }
      const cookies = typeof resp.headers.getSetCookie === 'function'
        ? resp.headers.getSetCookie()
        : (resp.headers.get('set-cookie') || '').split(/,\s*(?=[^;]+=)/);
      const cookie = cookies.filter(Boolean).join('; ');
      if (!cookie) {
        console.warn(`sol-login-node: NSS login returned ${resp.status}, no cookie`);
        return null;
      }
      const webId = `${origin}/profile/card#me`;
      const session = {
        info: { isLoggedIn: true, webId, issuer: oidcIssuer },
        fetch: (input, init = {}) => {
          const headers = new Headers(init.headers);
          headers.set('Cookie', cookie);
          return globalThis.fetch(input, { ...init, headers });
        },
        async logout() { this.info.isLoggedIn = false; this.info.webId = null; },
      };
      this.sessions.set(tag, session);
      return this._makeSessionResult(session);
    } catch (e) {
      console.warn(`sol-login-node: NSS login failed: ${e.message}`);
      return null;
    }
  }

  async _loginPasswordCSS({ tag, oidcIssuer, origin, username, password }) {
    // CSS v7+: login, discover client-credentials endpoint, create credentials
    try {
      const loginResp = await globalThis.fetch(`${origin}/.account/login/password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password }),
      });
      if (loginResp.ok) {
        const { authorization } = await loginResp.json();
        const authHeader = { 'Authorization': `CSS-Account-Token ${authorization}` };
        const indexResp = await globalThis.fetch(`${origin}/.account/`, { headers: authHeader });
        const { controls } = await indexResp.json();
        const credUrl = controls?.account?.clientCredentials;
        const webIdUrl = controls?.account?.webId;
        let webId = `${origin}/profile/card#me`;
        if (webIdUrl) {
          try {
            const wResp = await globalThis.fetch(webIdUrl, { headers: authHeader });
            const wData = await wResp.json();
            if (wData.webIdLinks && Object.keys(wData.webIdLinks).length > 0) {
              webId = Object.keys(wData.webIdLinks)[0];
            }
          } catch {}
        }
        if (credUrl) {
          const credResp = await globalThis.fetch(credUrl, {
            method: 'POST',
            headers: { ...authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'sol-login-node', webId }),
          });
          if (credResp.ok) {
            const { id, secret } = await credResp.json();
            return this._loginCredentials({ tag, oidcIssuer, clientId: id, clientSecret: secret });
          }
          console.warn(`sol-login-node: CSS v7 credentials returned ${credResp.status}`);
        } else {
          console.warn('sol-login-node: CSS v7 no clientCredentials endpoint found');
        }
      } else {
        console.warn(`sol-login-node: CSS v7 login returned ${loginResp.status}`);
      }
    } catch (e) {
      console.warn(`sol-login-node: CSS v7 login failed: ${e.message}`);
    }

    // Older CSS: POST /idp/credentials/
    try {
      const credResp = await globalThis.fetch(`${origin}/idp/credentials/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password, name: 'sol-login-node' }),
      });
      if (credResp.ok) {
        const { id, secret } = await credResp.json();
        return this._loginCredentials({ tag, oidcIssuer, clientId: id, clientSecret: secret });
      }
      console.warn(`sol-login-node: CSS legacy credentials returned ${credResp.status}`);
    } catch (e) {
      console.warn(`sol-login-node: CSS legacy login failed: ${e.message}`);
    }

    return null;
  }

  async _loginCredentials({ tag = 'default', oidcIssuer, clientId, clientSecret, clientName = 'Solid App' } = {}) {
    if (!oidcIssuer) throw new Error('oidcIssuer is required');
    if (!clientId || !clientSecret) throw new Error('clientId and clientSecret are required');

    const SessionClass = await getSessionClass();
    const session = new SessionClass();

    await session.login({
      oidcIssuer,
      clientId,
      clientSecret,
      clientName,
    });

    if (!session.info.isLoggedIn) {
      throw new Error(`Login failed for issuer ${oidcIssuer}`);
    }

    this.sessions.set(tag, session);
    return this._makeSessionResult(session);
  }

  _makeSession(tag, oidcIssuer, webId, accessToken) {
    const self = this;
    const session = {
      info: { isLoggedIn: true, webId, issuer: oidcIssuer },
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);
        return globalThis.fetch(input, { ...init, headers });
      },
      async logout() {
        this.info.isLoggedIn = false;
        this.info.webId = null;
        await self._clearSavedTokens(oidcIssuer);
      },
    };
    this.sessions.set(tag, session);
    return session;
  }

  async _saveTokens(oidcIssuer, tokenData) {
    if (!this._tokenStore) return;
    const store = await _readTokenStore(this._tokenStore);
    store[oidcIssuer] = tokenData;
    await _writeTokenStore(this._tokenStore, store);
  }

  async _clearSavedTokens(oidcIssuer) {
    if (!this._tokenStore) return;
    const store = await _readTokenStore(this._tokenStore);
    delete store[oidcIssuer];
    await _writeTokenStore(this._tokenStore, store);
  }

  async _tryRefresh(oidcIssuer, tag) {
    if (!this._tokenStore) return null;
    const store = await _readTokenStore(this._tokenStore);
    const saved = store[oidcIssuer];
    if (!saved?.refresh_token || !saved?.client_id) return null;

    try {
      const { Issuer } = await import('openid-client');
      const issuer = await Issuer.discover(oidcIssuer);
      const client = new issuer.Client({
        client_id: saved.client_id,
        client_secret: saved.client_secret,
        token_endpoint_auth_method: saved.client_secret ? 'client_secret_basic' : 'none',
      });
      const tokenSet = await client.refresh(saved.refresh_token);
      const claims = tokenSet.claims();
      const webId = claims.webid || claims.sub || saved.webId;

      await this._saveTokens(oidcIssuer, {
        ...saved,
        access_token: tokenSet.access_token,
        refresh_token: tokenSet.refresh_token || saved.refresh_token,
        webId,
      });

      const session = this._makeSession(tag, oidcIssuer, webId, tokenSet.access_token);
      return this._makeSessionResult(session);
    } catch {
      return null;
    }
  }

  async _loginInteractive({ tag = 'default', oidcIssuer, clientName = 'Solid App', port, openUrl } = {}) {
    if (!oidcIssuer) throw new Error('oidcIssuer is required');

    const { Issuer, generators } = await import('openid-client');
    const { server, port: actualPort } = await _startCallbackServer(port || 0);
    const redirectUrl = `http://localhost:${actualPort}/callback`;

    const issuer = await Issuer.discover(oidcIssuer);
    const registered = await issuer.Client.register({
      redirect_uris: [redirectUrl],
      client_name: clientName,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid webid offline_access',
      token_endpoint_auth_method: 'none',
    });

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    const authUrl = registered.authorizationUrl({
      redirect_uri: redirectUrl,
      scope: 'openid webid offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      response_type: 'code',
    });

    const loginComplete = new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); server.close(); };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Interactive login timed out (5 minutes)'));
      }, 5 * 60 * 1000);

      const onInterrupt = () => { cleanup(); reject(new Error('Login cancelled')); };
      process.once('SIGINT', onInterrupt);

      server.on('request', async (req, res) => {
        if (!req.url.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }
        try {
          const callbackUrl = new URL(`http://localhost:${actualPort}${req.url}`);
          const error = callbackUrl.searchParams.get('error');
          if (error) {
            const desc = callbackUrl.searchParams.get('error_description') || error;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<html><body><h2>Login cancelled</h2><p>${desc}</p></body></html>`);
            process.removeListener('SIGINT', onInterrupt);
            cleanup();
            reject(new Error(`Login denied: ${desc}`));
            return;
          }

          const params = registered.callbackParams(callbackUrl.href);
          const tokenSet = await registered.callback(redirectUrl, params, {
            code_verifier: codeVerifier,
            state,
          });
          const claims = tokenSet.claims();
          const webId = claims.webid || claims.sub;

          if (!tokenSet.refresh_token) {
            console.warn('sol-login-node: no refresh_token received — session will not persist across restarts');
          }

          await this._saveTokens(oidcIssuer, {
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            client_id: registered.metadata.client_id,
            client_secret: registered.metadata.client_secret,
            webId,
          });

          const session = this._makeSession(tag, oidcIssuer, webId, tokenSet.access_token);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Login successful!</h2><p>You can close this tab.</p></body></html>');
          process.removeListener('SIGINT', onInterrupt);
          cleanup();
          resolve(this._makeSessionResult(session));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h2>Login failed</h2><p>${e.message}</p></body></html>`);
          process.removeListener('SIGINT', onInterrupt);
          cleanup();
          reject(e);
        }
      });
    });

    const opener = openUrl || _openBrowser;
    await opener(authUrl);

    return loginComplete;
  }

  /**
   * Manually register an external session (e.g. one obtained outside SolidAuth).
   * @param {string} tag - Session tag.
   * @param {Object} session - A session object with `info` and `fetch`.
   */
  addSession(tag, session) {
    this.sessions.set(tag, session);
  }

  /**
   * Find the best session for a URL. Checks the tagged session first,
   * then falls back to any session whose issuer/webId covers the URL's origin.
   * @param {string} url
   * @param {string} [tag]
   * @returns {Object|null} The matching session, or null.
   */
  getSessionFor(url, tag) {
    return _getSessionFor(this.sessions, url, tag, this._noAuth);
  }

  /**
   * Get an authenticated fetch function for a URL. Returns `globalThis.fetch`
   * if the URL is in the noAuth list or no matching session is found.
   * @param {string} url
   * @param {string} [tag] - Preferred session tag.
   * @returns {function} A fetch function (possibly authenticated).
   */
  fetchFor(url, tag) {
    return makeFetchFor(this.sessions, url, tag, this._noAuth, globalThis.fetch);
  }

  /**
   * Check whether there is an active session that covers the given URL.
   * Returns true for noAuth URLs even without a session.
   * @param {string} url
   * @param {string} [tag]
   * @returns {boolean}
   */
  isLoggedIn(url, tag) {
    return isLoggedInFor(this.sessions, url, tag, this._noAuth);
  }

  /**
   * Get the WebID for a tagged session.
   * @param {string} [tag='default']
   * @returns {string|null}
   */
  getWebId(tag = 'default') {
    return _getWebId(this.sessions, tag);
  }

  /**
   * Get the first session that is currently logged in.
   * @returns {Object|null} The session, or null if none are active.
   */
  getFirstLoggedIn() {
    return _getFirstLoggedIn(this.sessions);
  }

  /**
   * Log out one or all sessions. If `tag` is given, only that session is
   * removed; otherwise all sessions are logged out and cleared.
   * @param {string} [tag] - Session tag to log out. Omit to log out all.
   */
  async logout(tag) {
    if (tag) {
      const s = this.sessions.get(tag);
      if (s) {
        if (s.info?.isLoggedIn) await s.logout();
        this.sessions.delete(tag);
      }
      return;
    }
    for (const [, s] of this.sessions) {
      if (s.info?.isLoggedIn) await s.logout();
    }
    this.sessions.clear();
  }
}

export default SolidAuth;
