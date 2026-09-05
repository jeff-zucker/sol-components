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
 * Uses @uvdsl/solid-oidc-client-browser via core/oidc-global. One Solid
 * account at a time: interactive login is a full-page OIDC redirect.
 */

import { CSS, sheet as LOGIN_SHEET } from './styles/sol-login-css.js';
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { rdf } from '../core/rdf.js';
import {
  originOf,
  sessionCoversOrigin,
  isNoAuth as _isNoAuth,
  getSessionFor as _getSessionFor,
  makeFetchFor,
  isLoggedInFor,
  getWebId as _getWebId,
  getFirstLoggedIn as _getFirstLoggedIn,
  kitchenLoggedIn,
} from '../core/auth-core.js';
import { solFetch } from '../core/auth-fetch.js';
import { register as registerService, root as swcRoot } from '../core/services.js';
import { OidcSession } from '../core/oidc-global.js';

class AuthManager {
  /** The page-wide singleton. Every `<sol-login>` instance binds to this same
   *  AuthManager so a session established by any embedded app is visible to
   *  shell-level code without DOM probing.
   *
   *  The `sessions` Map holds at most one interactive Solid-OIDC session (the
   *  user's remote account, on tag 'default') alongside any session-SHAPED
   *  objects an app seats — dk's synthetic local-owner (on 'local') and a
   *  remembered-IdP proxy. Routing between them is by request origin
   *  (sessionCoversOrigin), so a pod browser can be "logged in" to the local
   *  pod and one remote pod at once. */
  static get shared() { return sharedAuth; }

  constructor() {
    this.sessions = new Map();
    this._noAuth = null;
    this._oidc = null;
    // Elements register their repaint here so a background token expiry (which
    // flips the session inactive) can flip every login button back to "Log in".
    this._repainters = new Set();
  }

  set noAuth(v) { this._noAuth = v; }

  _noAuthConfig() {
    return this._noAuth ?? window.SolidAppContext?.noAuth;
  }

  isNoAuth(url) {
    return _isNoAuth(url, this._noAuthConfig());
  }

  originOf(url) { return originOf(url); }

  /** The page's single OIDC session, created on first use and seated on
   *  'default' (unless an app already seated its own session there — a
   *  remembered-IdP proxy). */
  oidcSession() {
    if (!this._oidc) {
      this._oidc = new OidcSession('Solid App');
      this._oidc.onChange(() => this._repaintAll());
      if (!this.sessions.has('default')) this.sessions.set('default', this._oidc);
    }
    return this._oidc;
  }

  /** The session the login button reflects — whatever holds the 'default'
   *  tag (the OIDC session or a remembered-IdP proxy). NOT the synthetic
   *  local-owner (on 'local'): there is no "log out of the local pod". */
  defaultSession() {
    return this.sessions.get('default') || null;
  }

  registerRepaint(fn) { this._repainters.add(fn); }
  unregisterRepaint(fn) { this._repainters.delete(fn); }
  _repaintAll() { for (const fn of this._repainters) { try { fn(); } catch (_) {} } }

  // Routing is by request ORIGIN, not by a session tag: passing no tag makes
  // these helpers pick the session that COVERS the origin (sessionCoversOrigin)
  // and nothing else. So a request to the local pod uses the synthetic owner
  // and a request to the remote pod uses the OIDC session — both live at once —
  // and a request to an origin no session covers falls back to plain fetch
  // rather than attaching a token cross-origin.
  getSessionFor(url) {
    return _getSessionFor(this.sessions, url, undefined, this._noAuthConfig());
  }

  fetchFor(url) {
    return makeFetchFor(this.sessions, url, undefined, this._noAuthConfig(), fetch);
  }

  isLoggedIn(url) {
    return isLoggedInFor(this.sessions, url, undefined, this._noAuthConfig());
  }

  getWebId() {
    return _getWebId(this.sessions, 'default');
  }

  getFirstLoggedIn() {
    return _getFirstLoggedIn(this.sessions);
  }

  async handleIncomingRedirect() {
    // Complete an in-flight redirect / silently restore the OIDC session.
    // Session-SHAPED objects an app seated (synthetic owner, proxy) have no
    // handleIncomingRedirect — skip them.
    const oidc = this.oidcSession();
    try {
      await oidc.handleIncomingRedirect();
    } catch (e) {
      console.warn('[sol-login] session restore failed:', e?.message || e);
    }
    for (const [tag, session] of this.sessions) {
      if (tag === 'default') continue;
      if (typeof session.handleIncomingRedirect === 'function') {
        try { await session.handleIncomingRedirect(); } catch (_) {}
      }
    }
  }

  async ensureAuthenticated(url) {
    if (this.isNoAuth(url)) return true;
    const origin = this.originOf(url);
    // Already covered by a seated session — the synthetic owner covers the
    // local pod, the OIDC/proxy session covers its own account's origins.
    for (const [, s] of this.sessions) {
      if (sessionCoversOrigin(s, origin)) return true;
    }
    // Start an interactive login. This is a full-page redirect to the issuer;
    // the return trip is completed by handleIncomingRedirect() on load.
    await this.oidcSession().login(origin);
    return false;
  }
}

// All <sol-login> instances on a page share one AuthManager.
const sharedAuth = new AuthManager();

// Publish auth to the ecosystem: expose AuthManager on the global (consumers in
// core/auth-fetch.js + web/sol-include.js READ window.SolidWebComponents
// .AuthManager) and register the `auth` host-service so any component reaches
// the signed-in fetch via window.SolidWebComponents.{auth,fetch}.
try {
  swcRoot().AuthManager = AuthManager;
  registerService('auth', {
    manager: sharedAuth,
    fetch: solFetch,
    fetchFor: (url) => sharedAuth.fetchFor(url),
  });
} catch (_) { /* no window / pre-registration race — harmless */ }

/**
 * Solid OIDC login web component.
 *
 * Shows a log-in/log-out button with an issuer dropdown. One Solid account at
 * a time; interactive login is a full-page OIDC redirect handled by
 * @uvdsl/solid-oidc-client-browser.
 *
 * @class SolLogin
 * @extends HTMLElement
 * @attr {string} issuers - comma-separated list of known OIDC issuer origins
 * @attr {string} external-auth - set automatically when another same-origin
 *                 window/tab/iframe reports a login over BroadcastChannel
 *                 ('sol-auth'). Pure visual signal — CSS in sol-login-css.js
 *                 paints the button green and surfaces the chip so the user
 *                 can choose to also log in here. Cleared when this element
 *                 holds its own session.
 *
 * Cross-window auth signaling: every sol-login opens a
 * BroadcastChannel('sol-auth') in connectedCallback. Own login/logout events
 * are rebroadcast on the channel; a foreign login message sets the
 * `external-auth` attribute (cleared on logout) unless this element already
 * has its own logged-in session. Used by dk-solidos's iframe and any other
 * same-origin sol-login.
 *
 * @property {Function} fetchFor - fetchFor(url) returns authenticated fetch
 * @property {string} webId - logged-in user's WebID
 * @property {boolean} isLoggedIn - whether a session is active
 * @fires sol-login - detail: { webId, issuer }
 * @fires sol-logout
 */
class SolLogin extends HTMLElement {
  static get observedAttributes() { return ['issuers']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._auth = sharedAuth;
    this._issuers = [];
    this._initialized = false;
    this._initPromise = null;
    this._repaint = () => this._updateUI();
  }

  get auth() { return this._auth; }

  get webId() {
    return this._auth.defaultSession()?.info?.webId || null;
  }

  get isLoggedIn() {
    if (kitchenLoggedIn()) return true;
    return !!this._auth.defaultSession()?.info?.isLoggedIn;
  }

  fetchFor(url) {
    return this._auth.fetchFor(url);
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
      this._render();
      const attr = this.getAttribute('issuers');
      if (attr) this._issuers = attr.split(',').map(s => s.trim()).filter(Boolean);
      // Self-listeners broadcast our own login/logout to the same-origin
      // BroadcastChannel so other windows / iframes light up their login
      // button green ('external-auth' attribute).
      this.addEventListener('sol-login',  (e) => this._broadcastLogin(e));
      this.addEventListener('sol-logout', ()  => this._broadcastLogout());
    }
    this._attachAuthNeededListener();
    this._setupAuthChannel();
    this._auth.registerRepaint(this._repaint);
    // Kick the auth boot from the element itself: the module-load
    // bootSolLogin() below only catches a sol-login already in the DOM when
    // sol-login.js is imported — one mounted later (dk's chrome builds after
    // the loader ran) was never initialized, so redirect-callback processing
    // and the boot session restore silently never happened. initialize() is
    // single-flight, so hosts that call it themselves are unaffected; set
    // _manualInit to opt out entirely.
    if (!this._manualInit) Promise.resolve().then(() => this.initialize()).catch(() => {});
  }

  disconnectedCallback() {
    this._detachAuthNeededListener();
    this._auth.unregisterRepaint(this._repaint);
    if (this._authChannel) {
      this._authChannel.close();
      this._authChannel = null;
    }
  }

  /* ── cross-window auth signaling ───────────────────────────────────
   * BroadcastChannel('sol-auth') carries login/logout across every
   * same-origin tab, window, and iframe (including mashlib in the
   * dk-solidos iframe). On receipt of a foreign login, if THIS sol-login
   * has no own logged-in session, we set the `external-auth` attribute —
   * CSS in sol-login-css.js paints the button green to invite the user to
   * log in here too. */
  _setupAuthChannel() {
    if (this._authChannel) return;
    if (typeof BroadcastChannel === 'undefined') return;
    try { this._authChannel = new BroadcastChannel('sol-auth'); }
    catch (_) { return; }
    this._authChannel.addEventListener('message', (e) => this._onAuthMessage(e));
    try { this._authChannel.postMessage({ type: 'hello' }); } catch (_) {}
  }

  _broadcastLogin(e) {
    if (!this._authChannel) return;
    try {
      this._authChannel.postMessage({ type: 'login', webId: e?.detail?.webId });
    } catch (_) {}
    this.removeAttribute('external-auth');
  }

  _broadcastLogout() {
    if (!this._authChannel) return;
    try { this._authChannel.postMessage({ type: 'logout' }); } catch (_) {}
  }

  _onAuthMessage(e) {
    const d = e?.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'hello') {
      const s = this._auth.getFirstLoggedIn();
      if (s && this._authChannel) {
        try { this._authChannel.postMessage({ type: 'login', webId: s.info?.webId }); } catch (_) {}
      }
      return;
    }
    if (d.type === 'login') {
      if (this._auth.getFirstLoggedIn()) return;
      this.setAttribute('external-auth', d.webId || '');
    } else if (d.type === 'logout') {
      this.removeAttribute('external-auth');
    }
  }

  /* ── sol-auth-needed listener ──────────────────────────────────────
   * Components save through solFetch (core/auth-fetch.js); when a request
   * returns 401, solFetch dispatches `sol-auth-needed` and waits for someone
   * to resolve its detail promise. We listen on `document`, pick the default
   * issuer (own `issuer` attribute, then `<sol-default default-issuer>`, then
   * the first entry in our list), run the login flow, and resolve on success
   * or give-up. Concurrent prompts are coalesced. */

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

    // Surface the element for the duration of the auth flow so the user can
    // pick a different issuer. `active` is the CSS hook in sol-login-css.js.
    this.setAttribute('active', '');
    requestAnimationFrame(() => {
      this._showSwitchHint(issuer);
      this._toggleDropdown();
    });

    this._pendingAuthPromise = new Promise((res) => {
      const cleanup = () => {
        this.removeEventListener('sol-login', onLogin);
        this.removeAttribute('active');
        this._closeDropdown();
        this._hideSwitchHint();
        this._pendingAuthPromise = null;
      };
      const onLogin = () => { cleanup(); res(true); };
      this.addEventListener('sol-login', onLogin);
      // login() is a full-page redirect: the promise below rarely settles in
      // this page (we navigate away and the return trip resolves it via the
      // sol-login event after initialize()). onLogin covers the no-navigation
      // cases (already covered, or a synchronous failure).
      Promise.resolve(this.login(issuer)).catch(() => { cleanup(); res(false); });
    });

    try { resolve(await this._pendingAuthPromise); }
    catch (err) { reject?.(err); }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'issuers' && this._initialized) {
      this._issuers = (newV || '').split(',').map(s => s.trim()).filter(Boolean);
      this._renderIssuers();
    }
  }

  /** Start an interactive login for `issuerUrl` (full-page redirect). The
   *  second parameter is accepted and ignored for backward compatibility with
   *  callers that passed a session tag. */
  async login(issuerUrl) {
    await this._auth.ensureAuthenticated(issuerUrl);
  }

  initialize() {
    // Single-flight: an embedding component's mount and the host's own boot
    // path may both call initialize(). Concurrent callers share one run so the
    // OIDC redirect code is exchanged exactly once.
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  async _doInitialize() {
    // The button must ALWAYS end up painted from the real session state, even
    // when redirect processing throws (e.g. an already-consumed code).
    try {
      await this._auth.handleIncomingRedirect();
    } catch (e) {
      console.warn('[sol-login] incoming-redirect processing failed:', e?.message || e);
    }
    this._updateUI();
    this._integrateWithRdflib();

    const session = this._auth.defaultSession();
    if (session?.info?.isLoggedIn) {
      this.dispatchEvent(new CustomEvent('sol-login', {
        bubbles: true, composed: true,
        detail: { webId: session.info.webId, issuer: session.info.issuer },
      }));
    }
  }

  async logout() {
    const session = this._auth.defaultSession();
    if (session?.info?.isLoggedIn && typeof session.logout === 'function') {
      try { await session.logout(); } catch (e) {}
    }
    this._updateUI();
    this._integrateWithRdflib();
    this.dispatchEvent(new CustomEvent('sol-logout', { bubbles: true, composed: true }));
  }

  _integrateWithRdflib() {
    const win = typeof window !== 'undefined' ? window : {};

    // Route rdflib's Fetcher (and anything else we patch) through solFetch so a
    // 401 from UpdateManager-driven saves (sol-form), sol-query SPARQL calls,
    // sol-include document loads, etc. triggers `sol-auth-needed` and gets the
    // chrome's login UX + auto-retry. solFetch calls am.fetchFor under the
    // hood, so an already-authenticated request still uses the right session.
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

    // 1. Patch Fetcher constructors (host-page global + our singleton).
    patchFetcherCtor(win.$rdf?.Fetcher);
    if (rdf.isReady()) patchFetcherCtor(rdf.Fetcher);

    // 2. Adopt an external shared store if one is already on the page, so our
    //    components and solid-logic / solid-ui / mashlib share one rdflib graph.
    const externalStore =
         win.SolidLogic?.store
      || win.UI?.store
      || win.panes?.store
      || null;
    if (externalStore && rdf.isReady()) rdf.useStore(externalStore);

    // 2b. If nothing was on the page, publish our singleton upward so mashlib/
    //     solid-ui/solid-logic loaded AFTER us share our graph.
    if (!externalStore && rdf.isReady() && !win.SolidLogic) {
      win.SolidLogic = { store: rdf.store, fetcher: rdf.storeFetcher };
    }

    // 3. Patch any already-instantiated Fetcher instances on the shared store.
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
    // Decide login-vs-logout from the 'default'-tag session — NOT the global
    // isLoggedIn getter, which returns true whenever the host reports a
    // kitchen/owner session (the local owner sits on 'local' and must never
    // turn this button into a logout).
    const session = this._auth.defaultSession();
    if (session?.info?.isLoggedIn) {
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

  /** Insert (or update) a tiny hint at the top of the dropdown that names the
   *  default issuer auto-login is using and prompts the user to pick another
   *  to switch. Idempotent. */
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

    const session = this._auth.defaultSession();
    // The WebID is surfaced only as the button's hover title, never as visible
    // page text.
    status.textContent = '';
    if (session?.info?.isLoggedIn) {
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

// Complete an OIDC redirect on load. The element is defined just above, so it
// is already upgraded when this runs. When sol-login.js is imported lazily
// (e.g. by component-interop, after manifests load) DOMContentLoaded has
// already fired — so run immediately in that case. (Set `_manualInit` on the
// element to opt out and call initialize() yourself.)
function bootSolLogin() {
  const login = document.querySelector('sol-login');
  if (login && !login._manualInit) return login.initialize();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSolLogin);
  else bootSolLogin();
}

export { SolLogin, AuthManager };
export default SolLogin;
