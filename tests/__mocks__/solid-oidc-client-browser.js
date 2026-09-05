// Mock of @uvdsl/solid-oidc-client-browser for jest (mapped via
// moduleNameMapper). Mirrors the worker-free SessionCore surface the vendored
// build exposes: login / handleRedirectFromLogin / restore / logout /
// authFetch, plus isActive / webId and the SessionEvents enum.
//
// Test hooks: the most recently constructed Session is exposed as
// __lastSession; drive it with sess.__setActive(webId) / sess.__reset(),
// and inject an authFetch with __setAuthFetch. __loginCalls records every
// login({idp, redirect}). __resetMock() clears the module-level state.

export const SessionEvents = {
  STATE_CHANGE: 'sessionStateChange',
  EXPIRATION_WARNING: 'sessionExpirationWarning',
  EXPIRATION: 'sessionExpiration',
};

export class SessionIDB {
  constructor() { /* no IndexedDB in jsdom — a harmless stand-in */ }
}

export let __lastSession = null;
export const __loginCalls = [];
let _authFetch = null;

export function __setAuthFetch(fn) { _authFetch = fn; }
export function __resetMock() {
  __lastSession = null;
  __loginCalls.length = 0;
  _authFetch = null;
}

export class Session {
  constructor(clientDetails, options) {
    this._active = false;
    this._webId = null;
    this._clientDetails = clientDetails;
    this._options = options || {};
    // authFetch is bound in the real library's constructor.
    this.authFetch = this.authFetch.bind(this);
    __lastSession = this;
  }

  get isActive() { return this._active; }
  get webId() { return this._webId; }

  async login(idp, redirect_uri) {
    __loginCalls.push({ idp, redirect_uri });
  }

  async handleRedirectFromLogin() { /* no active login by default */ }

  async restore() { /* nothing to restore by default */ }

  async logout() {
    const was = this._active;
    this._active = false;
    this._webId = null;
    if (was) this._options.onSessionStateChange?.();
  }

  async authFetch(input, init) {
    if (_authFetch) return _authFetch(input, init);
    if (typeof globalThis.fetch === 'function') return globalThis.fetch(input, init);
    return { ok: true, status: 200 };
  }

  // ── test helpers ──
  __setActive(webId) {
    this._active = true;
    this._webId = webId || 'https://alice.example/profile/card#me';
    this._options.onSessionStateChange?.();
  }
  __reset() {
    this._active = false;
    this._webId = null;
  }
  __expire() {
    this._active = false;
    this._webId = null;
    this._options.onSessionExpiration?.();
    this._options.onSessionStateChange?.();
  }
}
