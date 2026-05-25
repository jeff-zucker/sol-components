/**
 * <sol-login> — Solid OIDC login web component.
 * Attributes: issuers (comma-separated list of known issuer origins)
 * Properties: fetchFor(url) — authenticated fetch, webId, isLoggedIn, session
 * Events: sol-login({webId, issuer}), sol-logout
 *
 * Usage:
 *   <sol-login></sol-login>
 *   <sol-login issuers="https://solidcommunity.net,https://login.inrupt.com"></sol-login>
 *
 * Expects @inrupt/solid-client-authn-browser loaded as UMD at window.solidClientAuthn
 */

import { CSS, sheet as LOGIN_SHEET } from './styles/sol-login-css.js';
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { rdf } from '../core/rdf.js';
import {
  originOf,
  baseDomain,
  sessionCoversOrigin,
  isNoAuth as _isNoAuth,
  getSessionFor as _getSessionFor,
  makeFetchFor,
  isLoggedInFor,
  getWebId as _getWebId,
  getFirstLoggedIn as _getFirstLoggedIn,
} from '../core/auth-core.js';
import { PopupProxySession } from '../core/popup-proxy.js';
import { solFetch } from '../core/auth-fetch.js';

document.addEventListener('DOMContentLoaded', async () => {
  const login = document.querySelector('sol-login');
  if (login && !login._manualInit) await login.initialize();
});


function getSessionClass() {
  const locations = [
    window.solidClientAuthn?.Session,
    window.solidClientAuthentication?.Session,
    window.SolidClientAuthn?.Session,
    window['@inrupt/solid-client-authn-browser']?.Session
  ];
  
  for (const SessionClass of locations) {
    if (SessionClass) return SessionClass;
  }
  
  throw new Error('sol-login: solid-client-authn-browser must be loaded as UMD bundle. Expected at window.solidClientAuthn.Session or window.solidClientAuthentication.Session');
}

class AuthManager {
  /** The page-wide singleton. Every `<sol-login>` instance binds to
   *  this same AuthManager so sessions established by any embedded app
   *  (podz left/right, future apps) are visible to shell-level code
   *  without DOM probing. */
  static get shared() { return sharedAuth; }

  constructor() {
    this.sessions = new Map();
    this._noAuth = null;
    try {
      this._sideOrigins = JSON.parse(localStorage.getItem('solLoginOrigins') || '{}');
    } catch (e) { this._sideOrigins = {}; }
  }

  set noAuth(v) {
    this._noAuth = v;
  }

  _noAuthConfig() {
    return this._noAuth ?? window.SolidAppContext?.noAuth;
  }

  isNoAuth(url) {
    return _isNoAuth(url, this._noAuthConfig());
  }

  originOf(url) { return originOf(url); }

  _sessionId(tag, origin) {
    return `sol_${tag}_${origin.replace(/[^a-z0-9]/gi, '_')}`;
  }

  _makeSession(sessionId) {
    const SessionClass = getSessionClass();
    return new SessionClass({}, sessionId);
  }

  sessionFor(tag, origin) {
    if (this.sessions.has(tag)) return this.sessions.get(tag);
    const org = origin || this._sideOrigins[tag];
    const sessionId = org ? this._sessionId(tag, org) : `sol_${tag}_unset`;
    const session = this._makeSession(sessionId);
    this.sessions.set(tag, session);
    return session;
  }

  setSideOrigin(tag, url) {
    if (this.isNoAuth(url)) return;
    const origin = this.originOf(url);
    if (this._sideOrigins[tag] === origin) return;
    const existing = this.sessions.get(tag);
    if (existing && this._sessionCoversOrigin(existing, origin)) {
      this._sideOrigins[tag] = origin;
      this._persistOrigins();
      return;
    }
    this._sideOrigins[tag] = origin;
    this._persistOrigins();
    const sessionId = this._sessionId(tag, origin);
    this.sessions.set(tag, this._makeSession(sessionId));
  }

  _persistOrigins() {
    try { localStorage.setItem('solLoginOrigins', JSON.stringify(this._sideOrigins)); } catch (e) {}
  }

  _sessionCoversOrigin(session, origin) {
    return sessionCoversOrigin(session, origin);
  }

  getSessionFor(url, tag) {
    return _getSessionFor(this.sessions, url, tag, this._noAuthConfig());
  }

  fetchFor(url, tag) {
    return makeFetchFor(this.sessions, url, tag, this._noAuthConfig(), fetch);
  }

  isLoggedIn(url, tag) {
    return isLoggedInFor(this.sessions, url, tag, this._noAuthConfig());
  }

  getWebId(tag) {
    return _getWebId(this.sessions, tag);
  }

  getFirstLoggedIn() {
    return _getFirstLoggedIn(this.sessions);
  }

  async handleIncomingRedirect() {
    const pendingTag = localStorage.getItem('solLoginPendingTag');
    localStorage.removeItem('solLoginPendingTag');

    // Ensure the session that initiated login exists so it can process the redirect.
    if (pendingTag) {
      this.sessionFor(pendingTag);
    }

    for (const [, session] of this.sessions) {
      await session.handleIncomingRedirect(window.location.href);
    }
  }

  async ensureAuthenticated(url, tag = 'default') {
    if (this.isNoAuth(url)) return true;
    const origin = this.originOf(url);
    this.setSideOrigin(tag, url);
    const session = this.sessionFor(tag, origin);
    if (session.info.isLoggedIn) return true;

    for (const [, s] of this.sessions) {
      if (sessionCoversOrigin(s, origin)) return true;
    }

    try { localStorage.setItem('solLoginPendingTag', tag); } catch (e) {}
    const redirectUrl = window.location.origin + window.location.pathname;
    await session.login({ oidcIssuer: origin, redirectUrl, clientName: 'Solid App' });
    return false;
  }
}

// All <sol-login> instances on a page share one AuthManager so that
// podz's per-side login elements register into a single session Map.
// Single-login pages are unaffected (one consumer of the singleton).
const sharedAuth = new AuthManager();

/**
 * Solid OIDC login web component.
 *
 * Shows a log-in/log-out button with issuer dropdown. Manages OIDC sessions
 * via @inrupt/solid-client-authn-browser and provides authenticated fetch.
 *
 * Two modes (the `mode` attribute):
 *   - "redirect" (default) — classic full-page OIDC redirect. One session
 *     per page. Unchanged behavior for existing consumers.
 *   - "popup" — login happens in a popup window that holds the real
 *     Session; the parent talks to it via a PopupProxySession. Lets
 *     multiple <sol-login side="..."> elements hold independent sessions
 *     in one tab. See core/popup-proxy.js and popup-auth-callback.html.
 *
 * @class SolLogin
 * @extends HTMLElement
 * @attr {string} issuers - comma-separated list of known OIDC issuer origins
 * @attr {string} mode - "redirect" (default) | "popup"
 * @attr {string} side - session tag for this element (popup mode); default "default"
 * @attr {string} popup-callback - URL of the popup callback page (popup mode)
 * @property {Function} fetchFor - fetchFor(url) returns authenticated fetch
 * @property {string} webId - logged-in user's WebID
 * @property {boolean} isLoggedIn - whether a session is active
 * @fires sol-login - detail: { webId, issuer, side }
 * @fires sol-logout - detail: { side }
 */
class SolLogin extends HTMLElement {
  static get observedAttributes() { return ['issuers', 'mode', 'side', 'popup-callback']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._auth = sharedAuth;
    this._issuers = [];
    this._initialized = false;
    this._mode = 'redirect';
    this._side = 'default';
    this._popupCallback = './popup-auth-callback.html';
    this._popupWindow = null;
    this._popupMsgHandler = null;
  }

  get auth() { return this._auth; }

  /** The session for this element's side (popup mode), if any. */
  _sideSession() {
    return this._auth.sessions.get(this._side) || null;
  }

  get webId() {
    const s = this._mode === 'popup'
      ? this._sideSession()
      : this._auth.getFirstLoggedIn();
    return s?.info?.webId || null;
  }

  get isLoggedIn() {
    if (this._mode === 'popup') {
      return !!this._sideSession()?.info?.isLoggedIn;
    }
    return !!this._auth.getFirstLoggedIn();
  }

  fetchFor(url, tag) {
    return this._auth.fetchFor(url, tag);
  }

  set issuers(arr) {
    this._issuers = arr || [];
    if (this.isConnected) this._renderIssuers();
  }

  get issuers() { return this._issuers; }

  addIssuer(origin) {
    try {
      const o = new URL(origin).origin;
      if (!this._issuers.includes(o)) {
        this._issuers.push(o);
        if (this.isConnected) this._renderIssuers();
      }
    } catch (e) {}
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._mode = (this.getAttribute('mode') || 'redirect').toLowerCase();
      this._side = this.getAttribute('side') || 'default';
      const cb = this.getAttribute('popup-callback');
      if (cb) this._popupCallback = cb;
      this._render();
      const attr = this.getAttribute('issuers');
      if (attr) this._issuers = attr.split(',').map(s => s.trim()).filter(Boolean);
    }
    this._attachAuthNeededListener();
  }

  disconnectedCallback() {
    if (this._popupMsgHandler) {
      window.removeEventListener('message', this._popupMsgHandler);
      this._popupMsgHandler = null;
    }
    this._detachAuthNeededListener();
  }

  /* ── sol-auth-needed listener ──────────────────────────────────────
   * Components save through solFetch (core/auth-fetch.js); when a
   * request returns 401, solFetch dispatches `sol-auth-needed` and
   * waits for someone to resolve its detail promise. We listen on
   * `document`, pick the default issuer (own `issuer` attribute, then
   * `<sol-default default-issuer>`, then the first entry in our list),
   * run the existing login flow, and resolve the promise on success or
   * give-up.
   *
   * Concurrent prompts are coalesced — multiple solFetch callers that
   * hit 401 in the same window will share one login attempt rather
   * than stacking popups.
   */

  _attachAuthNeededListener() {
    if (this._authNeededHandler) return;
    this._authNeededHandler = (e) => this._handleAuthNeeded(e);
    document.addEventListener('sol-auth-needed', this._authNeededHandler);
  }

  _detachAuthNeededListener() {
    if (this._authNeededHandler) {
      document.removeEventListener('sol-auth-needed', this._authNeededHandler);
      this._authNeededHandler = null;
    }
  }

  _resolveDefaultIssuer() {
    return this.getAttribute('issuer')
      || (document.querySelector('sol-default')?.getAttribute('default-issuer'))
      || this._issuers[0]
      || null;
  }

  async _handleAuthNeeded(e) {
    const { resolve, reject } = e.detail || {};
    if (typeof resolve !== 'function') return;

    if (this._pendingAuthPromise) {
      try { resolve(await this._pendingAuthPromise); }
      catch (err) { reject?.(err); }
      return;
    }

    const issuer = this._resolveDefaultIssuer();
    if (!issuer) { resolve(false); return; }

    // Surface the element for the duration of the auth flow so the
    // user can pick a different issuer (the picker dropdown lives in
    // sol-login's own UI). `active` is the CSS hook in
    // styles/sol-login-css.js — :host([active]) flips display back on.
    this.setAttribute('active', '');

    // Open the dropdown so the issuer list is visible while auto-login
    // is running. The user can click a different issuer to switch
    // (which closes the in-flight popup and opens a fresh one — see
    // _popupLogin's reissue handling).
    requestAnimationFrame(() => {
      this._showSwitchHint(issuer);
      this._toggleDropdown();
    });

    this._pendingAuthPromise = new Promise((res) => {
      const cleanup = () => {
        this.removeEventListener('sol-login', onLogin);
        this.removeEventListener('sol-popup-blocked', onFail);
        this.removeAttribute('active');
        this._closeDropdown();
        this._hideSwitchHint();
        this._pendingAuthPromise = null;
      };
      const onLogin = () => { cleanup(); res(true);  };
      const onFail  = () => { cleanup(); res(false); };
      this.addEventListener('sol-login', onLogin);
      this.addEventListener('sol-popup-blocked', onFail);
      Promise.resolve(this.login(issuer)).catch(() => onFail());
    });

    try { resolve(await this._pendingAuthPromise); }
    catch (err) { reject?.(err); }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'issuers' && this._initialized) {
      this._issuers = (newV || '').split(',').map(s => s.trim()).filter(Boolean);
      this._renderIssuers();
    } else if (name === 'mode' && this._initialized) {
      this._mode = (newV || 'redirect').toLowerCase();
    } else if (name === 'side' && this._initialized) {
      this._side = newV || 'default';
      this._updateUI();
    } else if (name === 'popup-callback' && newV) {
      this._popupCallback = newV;
    }
  }

  async login(issuerUrl, tag = 'default') {
    if (this._mode === 'popup') {
      return this._popupLogin(issuerUrl);
    }
    await this._auth.ensureAuthenticated(issuerUrl, tag);
  }

  /**
   * Popup-mode login. Opens the callback page in a popup that runs the
   * OIDC redirect on its own; when it posts back `logged-in`, we wrap the
   * popup in a PopupProxySession and register it under this element's side.
   */
  _popupLogin(issuerUrl) {
    let issuer = issuerUrl;
    try { issuer = new URL(issuerUrl).href; } catch (e) {
      this._setStatusMessage('Invalid issuer URL', true);
      return;
    }

    // Reuse vs. reissue: if a popup is already open for this side and
    // the issuer matches, just refocus. If the caller is switching to
    // a different issuer (e.g. user clicked another option in the
    // dropdown while auto-login was in flight), close the old popup
    // and open a fresh one with the new issuer URL.
    if (this._popupWindow && !this._popupWindow.closed) {
      if (this._popupIssuer === issuer) {
        this._popupWindow.focus();
        return;
      }
      try { this._popupWindow.close(); } catch (e) {}
      this._popupWindow = null;
    }

    const url = this._popupCallback +
      (this._popupCallback.includes('?') ? '&' : '?') +
      'side=' + encodeURIComponent(this._side) +
      '&issuer=' + encodeURIComponent(issuer);
    const features = 'popup=yes,width=480,height=620';
    const w = window.open(url, 'sol-login-' + this._side, features);
    if (!w) {
      this._setStatusMessage('Popup blocked — allow popups and retry', true);
      this.dispatchEvent(new CustomEvent('sol-popup-blocked', {
        bubbles: true, composed: true, detail: { side: this._side },
      }));
      return;
    }
    this._popupWindow = w;
    this._popupIssuer = issuer;
    this._setStatusMessage('Signing in…');
    // Auto-login also wants the hint updated as the user re-picks.
    if (this.hasAttribute('active')) this._showSwitchHint(issuer);

    if (!this._popupMsgHandler) {
      this._popupMsgHandler = (e) => this._onPopupMessage(e);
      window.addEventListener('message', this._popupMsgHandler);
    }
  }

  _onPopupMessage(e) {
    const d = e.data;
    if (!d || d.source !== 'sol-popup-auth') return;
    if (d.side && d.side !== this._side) return;

    if (d.type === 'logged-in') {
      const proxy = new PopupProxySession(this._popupWindow, {
        webId: d.webId, sessionId: d.sessionId, issuer: d.issuer,
        clientId: null, side: this._side,
      }, window.location.origin);
      proxy.addEventListener('logout', () => {
        if (this._auth.sessions.get(this._side) === proxy) {
          this._auth.sessions.delete(this._side);
        }
        this._popupWindow = null;
        this._updateUI();
        this.dispatchEvent(new CustomEvent('sol-logout', {
          bubbles: true, composed: true, detail: { side: this._side },
        }));
      });
      this._auth.sessions.set(this._side, proxy);
      this._updateUI();
      this.dispatchEvent(new CustomEvent('sol-login', {
        bubbles: true, composed: true,
        detail: { webId: d.webId, issuer: d.issuer, side: this._side },
      }));
      this._integrateWithRdflib();
    } else if (d.type === 'login-failed') {
      this._popupWindow = null;
      this._setStatusMessage('Sign-in failed', true);
    }
  }

async initialize(tags = ['default']) {
  if (this._mode === 'popup') {
    // PR 1: no cross-reload persistence — nothing to restore on boot.
    this._updateUI();
    this._integrateWithRdflib();
    return;
  }
  for (const tag of tags) {
    this._auth.sessionFor(tag);
  }
  await this._auth.handleIncomingRedirect();
  this._updateUI();
  this._integrateWithRdflib();

  const firstSession = this._auth.getFirstLoggedIn();
  if (firstSession) {
    this.dispatchEvent(new CustomEvent('sol-login', {
      bubbles: true, composed: true,
      detail: {
        webId: firstSession.info.webId,
        issuer: firstSession.info.issuer
      }
    }));
  }
}

async logout() {
  if (this._mode === 'popup') {
    // Log out only this element's side.
    const session = this._sideSession();
    if (session) {
      try { await session.logout(); } catch (e) {}
      this._auth.sessions.delete(this._side);
    }
    this._popupWindow = null;
    this._updateUI();
    this._integrateWithRdflib();
    this.dispatchEvent(new CustomEvent('sol-logout', {
      bubbles: true, composed: true, detail: { side: this._side },
    }));
    return;
  }
  for (const [, session] of this._auth.sessions) {
    if (session.info?.isLoggedIn) {
      await session.logout();
    }
  }
  this._updateUI();
  this._integrateWithRdflib();
  this.dispatchEvent(new CustomEvent('sol-logout', { bubbles: true, composed: true }));
}

_integrateWithRdflib() {
  const win = typeof window !== 'undefined' ? window : {};

  // Route rdflib's Fetcher (and anything else we patch) through solFetch
  // so a 401 from UpdateManager-driven saves (sol-form), sol-query SPARQL
  // calls, sol-include document loads, etc. triggers `sol-auth-needed`
  // and gets the chrome's login UX + auto-retry. solFetch internally
  // calls am.fetchFor under the hood, so an already-authenticated
  // request still goes through the right session.
  const authFetchWrapper = (uri, options = {}) => solFetch(uri, options);

  const patchFetcherCtor = (FetcherCtor) => {
    if (!FetcherCtor?.prototype) return;
    const proto = FetcherCtor.prototype;
    if (!proto._originalFetch) {
      proto._originalFetch = proto.fetch || proto._fetch || fetch;
    }
    if (proto.fetch)  proto.fetch  = authFetchWrapper;
    if (proto._fetch) proto._fetch = authFetchWrapper;
  };

  const patchFetcherInstance = (fetcher) => {
    if (!fetcher) return;
    if (!fetcher._originalFetch) {
      fetcher._originalFetch = fetcher.fetch || fetcher._fetch || fetch;
    }
    if (fetcher.fetch)  fetcher.fetch  = authFetchWrapper;
    if (fetcher._fetch) fetcher._fetch = authFetchWrapper;
  };

  // 1. Patch Fetcher constructors (host-page global + our singleton) so any
  //    future `new Fetcher(...)` call gets auth.
  patchFetcherCtor(win.$rdf?.Fetcher);
  if (rdf.isReady()) patchFetcherCtor(rdf.Fetcher);

  // 2. Adopt an external shared store if one is already on the page. This
  //    makes our components and solid-logic / solid-ui / mashlib share one
  //    rdflib graph (same cache, same subscriptions), so data loaded by
  //    either side is visible to the other.
  //    Probes solid-logic (`window.SolidLogic.store`), solid-ui / mashlib
  //    (`window.UI.store`), and the older `window.panes.store` surface.
  const externalStore =
       win.SolidLogic?.store
    || win.UI?.store
    || win.panes?.store
    || null;
  if (externalStore && rdf.isReady()) rdf.useStore(externalStore);

  // 2b. If nothing was on the page, publish our singleton upward so
  //     mashlib/solid-ui/solid-logic loaded *after* us share our graph.
  if (!externalStore && rdf.isReady() && !win.SolidLogic) {
    win.SolidLogic = { store: rdf.store, fetcher: rdf.storeFetcher };
  }

  // 3. Patch any already-instantiated Fetcher instances hanging off the
  //    shared store(s), so existing rdflib code paths also get auth.
  patchFetcherInstance(win.SolidLogic?.store?.fetcher);
  patchFetcherInstance(win.UI?.store?.fetcher);
  patchFetcherInstance(win.panes?.store?.fetcher);
  if (rdf.isReady()) patchFetcherInstance(rdf._fetcher);
}

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = `
      <span class="auth-status"></span>
      <button class="sol-btn sol-btn-sm sol-btn-primary auth-btn">Log in</button>
      <div class="dropdown">
        <div class="issuer-list"></div>
        <div class="custom-row">
          <input class="sol-input issuer-input" type="text" placeholder="https://your-issuer.org">
          <button class="sol-btn sol-btn-sm sol-btn-primary">Log in</button>
        </div>
      </div>`;
    s.adoptedStyleSheets = [];
    adopt(s, { sheet: LOGIN_SHEET, css: CSS });

    const mainBtn = s.querySelector('.auth-btn');
    mainBtn.addEventListener('click', () => this._handleClick());

    const goBtn = s.querySelector('.custom-row .sol-btn');
    goBtn.addEventListener('click', () => this._loginCustom());

    const input = s.querySelector('.issuer-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._loginCustom();
    });
  }

  _handleClick() {
    if (this.isLoggedIn) {
      this.logout();
    } else {
      this._toggleDropdown();
    }
  }

  _toggleDropdown() {
    const dd = this.shadowRoot.querySelector('.dropdown');
    if (dd.classList.contains('open')) {
      this._closeDropdown();
      return;
    }
    this._renderIssuers();

    const btn = this.shadowRoot.querySelector('.auth-btn');
    const rect = btn.getBoundingClientRect();
    dd.style.top = (rect.bottom + 4) + 'px';
    dd.classList.add('open');
    requestAnimationFrame(() => {
      const dw = dd.offsetWidth;
      const clampedLeft = Math.max(4, Math.min(rect.right - dw, window.innerWidth - dw - 4));
      dd.style.left = clampedLeft + 'px';
    });

    const input = this.shadowRoot.querySelector('.issuer-input');
    input.value = this._issuers[0] || '';
    input.focus();

    const close = (e) => {
      if (!dd.contains(e.composedPath()[0]) && e.composedPath()[0] !== btn) {
        this._closeDropdown();
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }

  _closeDropdown() {
    const dd = this.shadowRoot.querySelector('.dropdown');
    if (dd) dd.classList.remove('open');
  }

  /** Insert (or update) a tiny hint at the top of the dropdown that
   *  names the default issuer auto-login is using and prompts the user
   *  to pick another to switch. Idempotent — calling twice updates
   *  the hint text instead of stacking it. */
  _showSwitchHint(defaultIssuer) {
    const dd = this.shadowRoot.querySelector('.dropdown');
    if (!dd) return;
    let hint = dd.querySelector('.switch-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'switch-hint';
      dd.insertBefore(hint, dd.firstChild);
    }
    const short = defaultIssuer.replace(/^https?:\/\//, '').replace(/\/$/, '');
    hint.textContent = `Signing in as ${short} — pick another to switch`;
  }

  _hideSwitchHint() {
    const hint = this.shadowRoot.querySelector('.switch-hint');
    if (hint) hint.remove();
  }

  _renderIssuers() {
    const list = this.shadowRoot.querySelector('.issuer-list');
    if (!list) return;
    list.innerHTML = '';
    this._issuers.forEach(issuer => {
      const btn = document.createElement('button');
      btn.className = 'issuer-item';
      btn.textContent = issuer.replace(/^https?:\/\//, '');
      btn.title = issuer;
      btn.onclick = () => {
        this._closeDropdown();
        const url = issuer.endsWith('/') ? issuer : issuer + '/';
        this.login(url);
      };
      list.appendChild(btn);
    });
  }

  async _loginCustom() {
    const input = this.shadowRoot.querySelector('.issuer-input');
    const val = input.value.trim();
    if (!val) return;
    const issuer = val.endsWith('/') ? val : val + '/';
    this._closeDropdown();
    await this.login(issuer);
  }

/** Show a transient message in the status span (overwritten by _updateUI). */
_setStatusMessage(msg, isErr) {
  const status = this.shadowRoot && this.shadowRoot.querySelector('.auth-status');
  if (!status) return;
  status.textContent = msg;
  status.className = 'auth-status' + (isErr ? ' auth-error' : '');
}

_updateUI() {
  const status = this.shadowRoot.querySelector('.auth-status');
  const btn = this.shadowRoot.querySelector('.auth-btn');
  if (!status || !btn) return;

  const session = this._mode === 'popup'
    ? this._sideSession()
    : this._auth.getFirstLoggedIn();
  // The WebID is surfaced only as the button's hover title, never as
  // visible page text.
  status.textContent = '';
  if (session && session.info && session.info.isLoggedIn) {
    status.className = 'auth-status logged-in';
    btn.textContent = 'Log out';
    btn.className = 'sol-btn sol-btn-sm auth-btn logged-in';
    btn.title = session.info.webId || '';
  } else {
    status.className = 'auth-status';
    btn.textContent = 'Log in';
    btn.className = 'sol-btn sol-btn-sm sol-btn-primary auth-btn';
    btn.title = '';
  }
}
}

define('sol-login', SolLogin);
export { SolLogin, AuthManager };
export default SolLogin;
