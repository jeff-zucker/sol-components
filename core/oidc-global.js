// core/oidc-global.js — the ONE place the Solid-OIDC auth library enters the
// component library.
//
// `@uvdsl/solid-oidc-client-browser` resolves through the page's import map
// (sol-load or component-interop) to the vendored ESM build, so every consumer
// shares a single instance. The vendored build is the worker-free SessionCore:
// it refreshes tokens on demand inside authFetch and restores from the refresh
// token in IndexedDB, with no SharedWorker (which lets it run in the Android
// System WebView and under the app-shell CSP). One session per origin.
//
// OidcSession wraps the library's session in the { info, fetch, login,
// handleIncomingRedirect, restore, logout } shape the rest of the components
// (and app-supplied synthetic sessions — dk's local owner, a remembered-IdP
// proxy) already speak, so auth-core's per-origin routing needs no change.
//
// Tests map this specifier to tests/__mocks__/solid-oidc-client-browser.js.
import { Session, SessionEvents, SessionIDB } from '@uvdsl/solid-oidc-client-browser';

export { SessionEvents };

// The issuer the user last signed in with. The library has no issuer getter,
// so we record it ourselves: sessionCoversOrigin() matches on it, and it lets
// the login button repaint the right state after a reload.
const ISSUER_KEY = 'solLoginIssuer';

function currentRedirectUri() {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin + window.location.pathname;
  }
  return '/';
}

export class OidcSession {
  constructor(clientName = 'Solid App') {
    this._clientName = clientName;
    this._redirectUri = currentRedirectUri();
    this._issuer = null;
    try { this._issuer = localStorage.getItem(ISSUER_KEY) || null; } catch (_) {}
    this._onChange = null;

    let database;
    // No IndexedDB (private mode, some test envs) → run without persistence:
    // login and authFetch still work; only cross-reload restore is lost.
    try { database = new SessionIDB(); } catch (_) { database = undefined; }

    this._session = new Session(
      { redirect_uris: [this._redirectUri], client_name: this._clientName },
      {
        database,
        onSessionStateChange: () => { try { this._onChange?.(); } catch (_) {} },
        onSessionExpiration:   () => { this._issuer = null; try { localStorage.removeItem(ISSUER_KEY); } catch (_) {} },
      },
    );
    // authFetch is pre-bound by the library; expose it under the `fetch` name
    // the session shape uses.
    this.fetch = (input, init) => this._session.authFetch(input, init);
  }

  /** Register a repaint callback fired on any session state change
   *  (login / logout / token refresh / expiry). */
  onChange(cb) { this._onChange = cb; }

  get info() {
    return {
      isLoggedIn: !!this._session.isActive,
      webId: this._session.webId || null,
      issuer: this._issuer,
      sessionId: 'sol-oidc',
    };
  }

  /** Start an interactive login (full-page redirect to the issuer). */
  async login(issuer) {
    let origin = issuer;
    try { origin = new URL(issuer).origin; } catch (_) {}
    this._issuer = origin;
    try { localStorage.setItem(ISSUER_KEY, origin); } catch (_) {}
    await this._session.login(origin, this._redirectUri);
  }

  /** Complete an OIDC redirect if one is in progress, else silently restore a
   *  previous session from the refresh token (no-op when there is nothing to
   *  restore). */
  async handleIncomingRedirect() {
    await this._session.handleRedirectFromLogin();
    if (!this._session.isActive) {
      try { await this._session.restore(); } catch (_) { /* nothing to restore */ }
    }
  }

  async restore() {
    try { await this._session.restore(); } catch (_) {}
  }

  async logout() {
    try { await this._session.logout(); }
    finally {
      this._issuer = null;
      try { localStorage.removeItem(ISSUER_KEY); } catch (_) {}
    }
  }
}
