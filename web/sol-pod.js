/**
 * <sol-pod> — Solid pod file browser web component.
 * Attributes: source (one pod storage URL, or a comma/space-separated list;
 *             if omitted, discovers from current origin)
 *             pod-click-action (Function|string — callback when an item is activated
 *                          (gear icon, Enter, or double-click); if omitted, opens
 *                          the default pod-ops modal)
 * Properties: login (SolLogin element ref), currentPath, items
 * Events: sol-navigate({url}), sol-drag-start({item}), sol-drag-end(), sol-status({message,type})
 *
 * Usage:
 *   <sol-login id="auth"></sol-login>
 *   <sol-pod source="https://pod.example/" login="#auth"></sol-pod>
 */

import { CSS, sheet as POD_SHEET } from './styles/sol-pod-css.js';
import { sheet as POD_MODAL_SHEET, CSS as POD_MODAL_CSS } from './styles/sol-pod-modal-css.js';
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import {
  fileIcon,
  fetchContainer,
  discoverOwnerWebIds, getStoragesFromWebIds,
} from '../core/pod-ops.js';
import { getRegistry } from '../core/pod-registry.js';
import './sol-modal.js';   // modal shell is part of sol-pod's own UX
import './sol-login.js';   // built-in login button in the pod header

// ── SolPod component ──────────────────────────────────────────────────

/**
 * Solid pod file browser web component.
 *
 * Browse containers, view/edit files, manage permissions. Pairs with
 * sol-login for authenticated access. Delegates file operations to sol-pod-ops.
 *
 * @class SolPod
 * @extends HTMLElement
 * @attr {string} source - pod storage URL, or comma/space-separated list of URLs (discovers from origin if omitted)
 * @attr {string} login - CSS selector for a sol-login element
 * @attr {string} login-mode - forwarded to the built-in sol-login as its `mode` ("redirect" | "popup")
 * @attr {string} login-callback - forwarded to the built-in sol-login as its `popup-callback`
 * @attr {string} issuers - comma-separated OIDC issuer origins, forwarded to the built-in sol-login
 * @attr {string} side - auth session tag; also forwarded to the built-in sol-login as its `side`
 * @attr {string} pod-click-action - callback when an item is activated (gear / Enter / double-click)
 * @attr {string} data-handler - default sol-* component for file viewing
 * @attr {string} gear-icon - icon for BOTH the per-item action button and
 *                 the breadcrumb (current-container) gear. Treated as a URL
 *                 when it contains '/' or ends in svg/png/jpg/gif/webp;
 *                 otherwise used as text (emoji). Defaults to '⚙'.
 * @attr {string} pods-group - shared pod-list scope; absent = the default shared
 *                 group, 'none' = a standalone unshared registry
 *
 * Lifecycle: auto-initializes from `connectedCallback` (microtask-deferred so
 * JS callers that set `podClickAction` between `appendChild` and the next
 * microtask still land setup before init runs). `initialize()` is
 * single-flight — calling it explicitly returns the in-flight or resolved
 * promise instead of triggering a duplicate discovery.
 *
 * Last-visited recall: the current container URL is persisted to
 * localStorage keyed by (pods-group, side). On the next mount, if the
 * remembered path sits under one of the known storages, sol-pod restores it
 * (and switches the pod selector to that storage if it differs from
 * `storages[0]`). Wrapped against storage-unavailable contexts.
 *
 * Item shape (returned by `fetchContainer`, passed to `podClickAction`):
 *   { url, name, displayName, isContainer, contentType,
 *     size,        // bytes, from posix:size (null if not emitted)
 *     mtime,       // POSIX epoch seconds, from posix:mtime
 *     modified,    // ISO datetime string, from dct:modified
 *     types }      // array of rdf:type IRIs
 *
 * @property {Object} login - SolLogin element reference (external if given, else the built-in one)
 * @property {string} currentPath - current container URL (also the remembered start path)
 * @property {Array} items - current directory listing (see item shape above)
 * @property {Array} storages - known pod URLs for this pod's group
 * @fires sol-navigate - detail: { url }
 * @fires sol-drag-start - detail: { item, element }
 * @fires sol-drag-end
 * @fires sol-auth-needed - detail: { url }
 * @fires sol-status - detail: { message, type }
 * @fires sol-prefs-change - detail: { prefs } — a hide-pattern filter was toggled
 * @fires sol-pod-pods-changed - detail: { group, pods } — the group's pod list
 *                 grew (discovery / add). May fire once per pod in the group;
 *                 a host listener should treat it idempotently.
 */
class SolPod extends HTMLElement {
  static get observedAttributes() { return ['source', 'login', 'pod-click-action', 'data-handler', 'side']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._login = null;
    this._loginEl = null;
    this._side = null;
    this._currentPath = '';
    this._rootUrl = '';
    this._items = [];
    this._storages = [];          // cache mirror of the group registry
    this._group = null;
    this._registry = null;
    this._onRegistryChange = null;
    this._pendingSeed = null;
    this._initialized = false;
    this._modal = null;
    this._toastTimer = null;
    this._draggedItem = null;
    this._podClickAction = null;
    this._selected = new Set();
    this._lastSelectedIndex = -1;
    this._currentItems = [];
    this._allItems = [];
    this._filterText = '';
    this._focusIndex = -1;
    this._prefs = { hideDot: true, hideHash: true, hideTilde: true };
  }

  get login() { return this._login || this._loginEl; }
  set login(el) {
    if (typeof el === 'string') el = document.querySelector(el);
    this._login = el;
  }

  /**
   * Auth session tag for this pod ('left' / 'right' in podz, etc).
   * Passed to the linked sol-login's fetchFor() so multi-session setups
   * pick the right session. When unset, fetchFor falls back to
   * origin-coverage matching — back-compatible for single-session pages.
   */
  get side() { return this._side; }
  set side(v) { this._side = v || null; }

  get currentPath() { return this._currentPath; }
  get items() { return this._items; }
  get rootUrl() { return this._rootUrl; }

  /** Known pod URLs for this pod's group (shared across the group). */
  get storages() { return this._registry ? this._registry.list() : [...this._storages]; }

  /**
   * Add pod URLs to this pod's group registry and optionally select one.
   * Additive — it contributes to the shared list rather than replacing it.
   */
  setStorages(arr, currentUrl) {
    this._registry?.addAll(Array.isArray(arr) ? arr : []);
    const target = currentUrl || this._rootUrl;
    if (target && this.storages.includes(target)) {
      const sel = this.shadowRoot.querySelector('.pod-select');
      if (sel) sel.value = target;
    }
  }

  /**
   * Preload known pod URLs (e.g. restored from host persistence) into
   * this pod's group registry. Silent — does not emit sol-pod-pods-changed.
   */
  seedPods(urls) {
    if (this._registry) this._registry.addAll(urls, { silent: true });
    else this._pendingSeed = (this._pendingSeed || []).concat(urls || []);
  }

  get prefs() { return this._prefs; }
  set prefs(p) { this._prefs = { ...this._prefs, ...p }; }

  get source() { return this.getAttribute('source') || ''; }
  set source(v) { this.setAttribute('source', v); }

  // The `source` attribute may be one URL or a comma/space-separated list;
  // each becomes a pod-selector entry. Every URL is normalised to end '/'
  // and the list is de-duplicated (after normalisation, so 'x' and 'x/'
  // collapse to one).
  _sources() {
    const seen = new Set();
    const out = [];
    for (const raw of (this.getAttribute('source') || '').split(/[,\s]+/)) {
      const s = raw.trim();
      if (!s) continue;
      const u = s.endsWith('/') ? s : s + '/';
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out;
  }

  get podClickAction() { return this._podClickAction; }
  set podClickAction(v) {
    if (typeof v === 'function') { this._podClickAction = v; return; }
    if (typeof v === 'string' && v) { this._podClickAction = v; return; }
    this._podClickAction = null;
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._render();

      // Join this pod's group registry — the shared set of known pods
      // that drives the selector. `pods-group` scopes it; absent = the
      // default shared group; 'none' = a standalone, unshared registry.
      this._group = this.getAttribute('pods-group') || '__default__';
      this._registry = getRegistry(this._group);
      this._onRegistryChange = (pods, silent) => this._applyRegistry(pods, silent);
      this._registry.subscribe(this._onRegistryChange);
      if (this._pendingSeed) {
        this._registry.addAll(this._pendingSeed, { silent: true });
        this._pendingSeed = null;
      }

      const loginAttr = this.getAttribute('login');
      if (loginAttr) this.login = loginAttr;
      const sideAttr = this.getAttribute('side');
      if (sideAttr) this._side = sideAttr;
      const clickAttr = this.getAttribute('pod-click-action') || this.getAttribute('data-handler');
      if (clickAttr) this.podClickAction = clickAttr;

      // The header carries a built-in <sol-login>. An external login=
      // selector, when given, takes its place and the built-in is dropped.
      const embeddedLogin = this.shadowRoot.querySelector('sol-login');
      if (this._login) {
        embeddedLogin.remove();
      } else {
        this._loginEl = embeddedLogin;
        // Forward this pod's login config to the built-in <sol-login> so a
        // host can opt into popup mode / a side tag / a callback page /
        // a starting issuer list.
        const lm = this.getAttribute('login-mode');
        if (lm) embeddedLogin.setAttribute('mode', lm);
        if (sideAttr) embeddedLogin.setAttribute('side', sideAttr);
        const lc = this.getAttribute('login-callback');
        if (lc) embeddedLogin.setAttribute('popup-callback', lc);
        const iss = this.getAttribute('issuers');
        if (iss) embeddedLogin.setAttribute('issuers', iss);
        const reload = () => { if (this._currentPath) this.loadContainer(this._currentPath); };
        // A login can reveal pods the logged-out session could not see —
        // re-discover, then reload the current container.
        this._loginEl.addEventListener('sol-login', () => {
          this.discover().catch(() => {});
          reload();
        });
        this._loginEl.addEventListener('sol-logout', reload);
        this._loginEl.initialize().catch(() => {});
      }

      // Kick off discovery + first-container load on mount so the
      // pod always resolves out of its "Loading pods..." placeholder.
      // Deferred to a microtask so JS callers that set
      // `podClickAction` / other properties between `appendChild` and
      // the next turn of the microtask queue still land their setup
      // before init runs. `initialize()` is single-flight so an
      // explicit `await pod.initialize()` from such a caller just
      // awaits the same in-flight promise rather than triggering a
      // duplicate discovery.
      queueMicrotask(() => this.initialize().catch((err) =>
        console.warn('[sol-pod] init failed:', err)));
    }
  }

  disconnectedCallback() {
    if (this._onDocClick) {
      document.removeEventListener('click', this._onDocClick);
      this._onDocClick = null;
    }
    if (this._registry && this._onRegistryChange) {
      this._registry.unsubscribe(this._onRegistryChange);
    }
  }

  /**
   * Group-registry subscriber: a pod was added by this or a sibling
   * <sol-pod>. Refresh the selector; on a non-silent change, let the
   * host persist the new list via the sol-pod-pods-changed event.
   */
  _applyRegistry(pods, silent) {
    this._storages = pods;
    this._populateSelect(pods);
    const sel = this.shadowRoot.querySelector('.pod-select');
    if (sel && this._rootUrl && pods.includes(this._rootUrl)) sel.value = this._rootUrl;
    if (!silent) {
      this.dispatchEvent(new CustomEvent('sol-pod-pods-changed', {
        bubbles: true, composed: true, detail: { group: this._group, pods },
      }));
    }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'source' && this._initialized) {
      this._setSource();
    }
    if (name === 'login' && this._initialized) {
      this.login = newV;
    }
    if (name === 'pod-click-action' || name === 'data-handler') {
      this.podClickAction = newV;
    }
    if (name === 'side') {
      this._side = newV || null;
    }
  }

  /** Initialize the component — discovers pods and loads initial view.
   *  Single-flight: subsequent calls return the same in-flight (or
   *  resolved) promise, so the connectedCallback auto-init and an
   *  explicit `await pod.initialize()` from a caller share one pass. */
  initialize() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  async _doInitialize() {
    if (this._sources().length) {
      // An explicit `source` lists exactly the pods to use — skip
      // discovery. An absent or empty `source` falls through to it.
      await this._setSource();
      return;
    }
    // No explicit source: use whatever the group registry already holds
    // (seeded by the host, or discovered by a sibling pod); otherwise
    // discover for this session/origin. Seeded pods are authoritative —
    // a non-empty registry stands as the dropdown's contents and no
    // discovery is attempted. Discovery only fills an empty registry.
    if (this.storages.length === 0) {
      await this.discover();
    }
    const pods = this.storages;
    // Always render the selector — an empty list must show "No pods
    // found" rather than leave the initial "Loading pods..." placeholder.
    this._populateSelect(pods);
    if (pods.length > 0) {
      const start = this._pickStartPath(pods[0]);
      this._rootUrl = this._rootForPath(start, pods) || pods[0];
      const sel = this.shadowRoot.querySelector('.pod-select');
      if (sel) sel.value = this._rootUrl;
      await this.loadContainer(start);
    }
  }

  /**
   * Discover pod storages for the current session/origin (WebID-based,
   * falling back to the current origin) and add them to this pod's
   * group registry. Returns the group's full pod list.
   */
  async discover() {
    let found;
    try {
      const webIds = await discoverOwnerWebIds();
      found = await getStoragesFromWebIds(webIds);
    } catch (e) {
      console.warn('[sol-pod] Discovery failed:', e);
      found = [window.location.origin + '/'];
    }
    this._registry?.addAll(found);
    return this.storages;
  }

  _fetchFor(url) {
    const login = this._login || this._loginEl;
    if (login?.fetchFor) return login.fetchFor(url, this._side);
    return fetch;
  }

  async _setSource() {
    const sources = this._sources();
    if (!sources.length) return;
    this._registry?.addAll(sources);
    const start = this._pickStartPath(sources[0]);
    // Align the selected pod root with whichever storage the
    // remembered path is under, so the dropdown matches the
    // breadcrumb on a "return to last visited" boot.
    this._rootUrl = this._rootForPath(start, sources) || sources[0];
    this._populateSelect(this.storages);
    const sel = this.shadowRoot.querySelector('.pod-select');
    if (sel) sel.value = this._rootUrl;
    await this.loadContainer(start);
  }

  async loadContainer(url) {
    this._showLoading();
    try {
      const fetchFn = this._fetchFor(url);
      const items = await fetchContainer(url, fetchFn);
      this._rawItems = items;            // unfiltered — kept so prefs can re-apply
      this._currentPath = url;
      this._rememberPath(url);
      this._items = this._filterItems(items);
      this._allItems = this._items;
      // New container = fresh context; clear any in-flight filter.
      this._filterText = '';
      const filterInput = this.shadowRoot.querySelector('.pod-filter');
      if (filterInput) filterInput.value = '';
      this._renderTree(this._allItems, { preserveFocus: false });
      this._updateBreadcrumb(url);
      this._emitStatus('', '');

      this.dispatchEvent(new CustomEvent('sol-navigate', {
        bubbles: true, composed: true, detail: { url }
      }));
    } catch (e) {
      if (e.message?.includes('401') || e.message?.includes('403') || e.needsAuth) {
        this._showMessage('Authentication required \u2014 please log in.', true);
        this._currentPath = url;
        this._updateBreadcrumb(url);
        this.dispatchEvent(new CustomEvent('sol-auth-needed', {
          bubbles: true, composed: true, detail: { url }
        }));
      } else {
        this._showMessage(`Failed to load: ${e.message}`, true);
      }
    }
  }

  /* ── last-visited path memory ──────────────────────────────────────
   * Persist the current container URL in localStorage keyed by
   * (pods-group, side) so the next page load can restore the user
   * where they were. Multiple sol-pods sharing the same group/side
   * share the memory — same context, same recall. Wrapped against
   * environments where localStorage is unavailable (private mode,
   * partitioned iframes). */
  _pathStorageKey() {
    return 'sol-pod:lastPath:' + (this._group || '__default__') + ':' + (this._side || 'default');
  }

  _rememberPath(url) {
    try { localStorage.setItem(this._pathStorageKey(), url); } catch (_) {}
  }

  _recallPath() {
    try { return localStorage.getItem(this._pathStorageKey()) || null; } catch (_) { return null; }
  }

  /** Pick the remembered path if it sits under one of the available
   *  pod storages — otherwise the caller's fallback (root) wins. */
  _pickStartPath(fallback) {
    const remembered = this._recallPath();
    if (!remembered) return fallback;
    if (this._rootForPath(remembered, this.storages)) return remembered;
    return fallback;
  }

  /** Return whichever root URL in `pods` contains `path`, or null. */
  _rootForPath(path, pods) {
    if (!path || !pods?.length) return null;
    return pods.find(root => path === root || path.startsWith(root)) || null;
  }

  _filterItems(items) {
    return items.filter(item => {
      // Match the user's mental model: filter on the decoded name so
      // e.g. %23foo (decodes to #foo) hides when 'hide hash' is on.
      const n = item.displayName || item.name;
      if (this._prefs.hideDot && n.startsWith('.')) return false;
      if (this._prefs.hideHash && n.startsWith('#')) return false;
      if (this._prefs.hideTilde && n.endsWith('~')) return false;
      return true;
    });
  }

  // Re-apply the pattern prefs to the cached listing — no refetch.
  _reapplyPrefs() {
    this._items = this._allItems = this._filterItems(this._rawItems || []);
    this._renderTree(this._allItems, { preserveFocus: false });
  }

  // ── DOM rendering ───────────────────────────────────────────────────

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = `
      <div class="pod-header">
        <div class="pod-header-row">
          <select class="pod-select" aria-label="Pod storage">
            <option value="">Loading pods...</option>
          </select>
          <sol-login class="pod-login" visible></sol-login>
          <button class="pod-settings-btn" type="button" title="Settings"
                  aria-label="Display settings" aria-expanded="false">⚙</button>
        </div>
        <div class="pod-settings" role="group" aria-label="Display settings">
          <label><input type="checkbox" data-pref="hideDot"> Hide dot-files</label>
          <label><input type="checkbox" data-pref="hideHash"> Hide #-files</label>
          <label><input type="checkbox" data-pref="hideTilde"> Hide ~ backups</label>
        </div>
      </div>
      <div class="breadcrumb"></div>
      <div class="pod-filter-row">
        <input class="pod-filter" type="search"
               placeholder="Filter (type to search, esc to clear)"
               aria-label="Filter items in this container" />
      </div>
      <div class="tree-wrapper" tabindex="0">
        <div class="empty">Loading...</div>
      </div>`;
    s.adoptedStyleSheets = [];
    adopt(s, { sheet: POD_SHEET, css: CSS });

    const sel = s.querySelector('.pod-select');
    sel.addEventListener('change', () => {
      if (sel.value === '__add__') {
        this._promptAddPod();
      } else if (sel.value) {
        this._rootUrl = sel.value;
        this.loadContainer(sel.value);
      }
    });

    const filter = s.querySelector('.pod-filter');
    filter.addEventListener('input', () => {
      this._filterText = filter.value;
      this._renderTree(this._allItems, { preserveFocus: false });
    });
    filter.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        filter.value = '';
        this._filterText = '';
        this._renderTree(this._allItems, { preserveFocus: false });
        this.shadowRoot.querySelector('.tree-wrapper')?.focus();
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
        // Move focus into the list.
        const ul = this.shadowRoot.querySelector('.file-tree');
        const first = ul?.querySelector('li');
        if (first) {
          this._focusIndex = 0;
          first.focus();
          e.preventDefault();
        }
      }
    });

    // Display-settings panel — toggle the pattern prefs (hide dot / # / ~).
    const settingsBtn = s.querySelector('.pod-settings-btn');
    const settings = s.querySelector('.pod-settings');
    settingsBtn.addEventListener('click', () => {
      const open = settings.classList.toggle('open');
      settingsBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        settings.querySelectorAll('input[data-pref]').forEach(cb => {
          cb.checked = !!this._prefs[cb.dataset.pref];
        });
      }
    });
    settings.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb?.dataset?.pref) return;
      this._prefs[cb.dataset.pref] = cb.checked;
      this._reapplyPrefs();
      // Let a host persist the change — the panel itself keeps no storage.
      this.dispatchEvent(new CustomEvent('sol-prefs-change', {
        bubbles: true, composed: true, detail: { prefs: { ...this._prefs } }
      }));
    });
    // Close the panel on any click outside it. composedPath() crosses the
    // shadow boundary, so this also catches clicks elsewhere in the pod.
    this._onDocClick = (e) => {
      if (!settings.classList.contains('open')) return;
      const path = e.composedPath();
      if (path.includes(settings) || path.includes(settingsBtn)) return;
      settings.classList.remove('open');
      settingsBtn.setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('click', this._onDocClick);

    // Keyboard nav at the wrapper level so it works whether the wrapper
    // or an individual li has focus.
    const wrapper = s.querySelector('.tree-wrapper');
    wrapper.addEventListener('keydown', (e) => this._onWrapperKey(e));
  }

  _populateSelect(storages) {
    const sel = this.shadowRoot.querySelector('.pod-select');
    if (!sel) return;
    sel.innerHTML = '';
    if (storages.length === 0) {
      sel.innerHTML = '<option value="">No pods found</option>';
    } else {
      storages.forEach(url => {
        const opt = document.createElement('option');
        opt.value = url;
        // Strip the scheme for display; the value still carries the
        // full URL so selection / fetch keep working.
        opt.textContent = url.replace(/^https?:\/\//, '');
        sel.appendChild(opt);
      });
    }
    const addOpt = document.createElement('option');
    addOpt.value = '__add__'; addOpt.textContent = '\uFF0B Add a Pod...';
    sel.appendChild(addOpt);

    // Offer the pod storages (which double as OIDC issuers) as login
    // choices, so clicking the login button drops down the pod list.
    // Merge rather than replace \u2014 any host-configured issuers survive.
    if (this._loginEl) storages.forEach(u => this._loginEl.addIssuer(u));
  }

  async _promptAddPod() {
    const sel = this.shadowRoot.querySelector('.pod-select');
    const prev = this._currentPath || sel.options[0]?.value;
    if (prev && prev !== '__add__') sel.value = prev;

    // Use sol-modal prompt if available, else native prompt
    let url;
    if (customElements.get('sol-modal')) {
      const { SolModal } = await import('./sol-modal.js');
      url = await SolModal.prompt('Enter pod URL:', 'https://example.solidcommunity.net/');
    } else {
      url = prompt('Enter pod URL:', 'https://example.solidcommunity.net/');
    }

    if (!url || !url.startsWith('http')) {
      if (prev && prev !== '__add__') sel.value = prev;
      return;
    }
    const normalized = url.endsWith('/') ? url : url + '/';
    // Adding to the registry repopulates the selector(s) for the group.
    this._registry?.add(normalized);
    sel.value = normalized;
    this._rootUrl = normalized;
    this.dispatchEvent(new CustomEvent('sol-pod-add', {
      bubbles: true, composed: true, detail: { url: normalized }
    }));
    await this.loadContainer(normalized);
  }

  _showLoading() {
    const tw = this.shadowRoot.querySelector('.tree-wrapper');
    if (tw) tw.innerHTML = '<div class="loading">Loading...</div>';
  }

  _showMessage(msg, isError) {
    const tw = this.shadowRoot.querySelector('.tree-wrapper');
    if (tw) tw.innerHTML = `<div class="empty${isError ? ' error' : ''}">${msg}</div>`;
  }

  _updateBreadcrumb(url) {
    const el = this.shadowRoot.querySelector('.breadcrumb');
    if (!el || !this._rootUrl) return;
    el.innerHTML = '';
    const home = document.createElement('button');
    home.textContent = '\u{1F3E0}'; home.className = 'sol-btn sol-btn-sm sol-btn-ghost';
    home.onclick = () => this.loadContainer(this._rootUrl);
    el.appendChild(home);
    if (url !== this._rootUrl) {
      const parts = url.replace(this._rootUrl, '').split('/').filter(Boolean);
      let cur = this._rootUrl;
      parts.forEach(part => {
        cur += part + '/'; const pathUrl = cur;
        el.appendChild(document.createTextNode(' / '));
        const btn = document.createElement('button');
        btn.textContent = part; btn.className = 'sol-btn sol-btn-sm sol-btn-ghost';
        btn.onclick = () => this.loadContainer(pathUrl);
        el.appendChild(btn);
      });
    }

    // Gear at the right edge — activates the current container (host
    // podClickAction first, else the sol-pod-ops modal). Same icon
    // treatment as per-item gears so a `gear-icon` attribute applies
    // consistently across the whole view.
    const gear = document.createElement('button');
    gear.className = 'sol-btn sol-btn-sm sol-btn-ghost crumb-gear';
    gear.title = 'Edit this folder';
    gear.setAttribute('aria-label', 'Edit this folder');
    this._paintGearIcon(gear);
    gear.onclick = () => this._openCurrentContainerModal();
    el.appendChild(gear);
  }

  /** Paint a gear button using the `gear-icon` attribute (URL → img,
   *  short string → text, absent → default ⚙). Shared by per-item
   *  and breadcrumb gears. */
  _paintGearIcon(btn) {
    btn.textContent = '';
    const iconAttr = this.getAttribute('gear-icon');
    if (iconAttr && /\/|\.(svg|png|jpe?g|gif|webp)$/i.test(iconAttr)) {
      const img = document.createElement('img');
      img.src = iconAttr;
      img.alt = '';
      btn.appendChild(img);
    } else {
      btn.textContent = iconAttr || '⚙';
    }
  }

  _openCurrentContainerModal() {
    const u = this._currentPath || this._rootUrl;
    if (!u) return;
    const trimmed = u.replace(/\/$/, '');
    const name = trimmed.split('/').pop() || u;
    let displayName;
    try { displayName = decodeURIComponent(name); } catch { displayName = name; }
    // Route through _activateItem so a host-supplied podClickAction
    // (e.g. dk-solidos navigating the iframe to this container) gets
    // first refusal — same precedence as per-item activation. Falls
    // through to the pod-ops modal when no handler is wired.
    this._activateItem({
      url: u,
      name,
      displayName,
      isContainer: true,
      contentType: 'text/turtle',
    });
  }

  _renderTree(allItems, { preserveFocus = true } = {}) {
    this._allItems = allItems;
    const visible = this._applyFilter(allItems);
    this._currentItems = visible;

    // Drop selections that are no longer visible.
    const visibleUrls = new Set(visible.map(it => it.url));
    for (const u of [...this._selected]) if (!visibleUrls.has(u)) this._selected.delete(u);

    const tw = this.shadowRoot.querySelector('.tree-wrapper');
    const prevFocusUrl = preserveFocus
      ? tw.querySelector('li:focus')?.dataset?.url || null
      : null;
    tw.innerHTML = '';

    if (visible.length === 0) {
      const msg = this._filterText
        ? `No matches for "${this._filterText}"`
        : (allItems.length === 0 ? 'Empty container' : 'No matches');
      tw.innerHTML = `<div class="empty">${msg}</div>`;
      this._focusIndex = -1;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'file-tree';
    visible.forEach((item, idx) => ul.appendChild(this._createTreeItem(item, idx)));
    tw.appendChild(ul);

    // Restore focus if requested (linear scan — URLs contain characters that
    // are awkward to escape in a CSS attribute selector).
    if (prevFocusUrl) {
      const li = Array.from(ul.children).find(el => el.dataset.url === prevFocusUrl);
      if (li) {
        li.focus();
        this._focusIndex = Number(li.dataset.index);
      }
    }

    // Drop zone
    tw.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; tw.parentElement?.classList.add('drag-over'); };
    tw.ondragleave = (e) => { if (e.target === tw) tw.parentElement?.classList.remove('drag-over'); };
    tw.ondrop = (e) => { e.preventDefault(); tw.parentElement?.classList.remove('drag-over'); };
  }

  _applyFilter(items) {
    const q = (this._filterText || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => {
      const n = (it.displayName || it.name || '').toLowerCase();
      return n.includes(q);
    });
  }

  _onWrapperKey(e) {
    // Don't intercept while the filter input is the target.
    if (e.target?.classList?.contains('pod-filter')) return;

    const ul = this.shadowRoot.querySelector('.file-tree');
    const items = ul ? Array.from(ul.children) : [];
    const focusEl = this.shadowRoot.activeElement;
    let idx = focusEl?.tagName === 'LI'
      ? items.indexOf(focusEl)
      : (this._focusIndex >= 0 ? this._focusIndex : -1);

    const focusAt = (i) => {
      if (i < 0 || i >= items.length) return;
      this._focusIndex = i;
      items[i].focus();
    };

    switch (e.key) {
      case 'ArrowDown':
        focusAt(idx < 0 ? 0 : Math.min(items.length - 1, idx + 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        focusAt(idx <= 0 ? 0 : idx - 1);
        e.preventDefault();
        break;
      case 'Home':
        focusAt(0);
        e.preventDefault();
        break;
      case 'End':
        focusAt(items.length - 1);
        e.preventDefault();
        break;
      case 'Enter': {
        if (idx < 0) return;
        const item = this._currentItems[idx];
        if (!item) return;
        if (item.isContainer) this.loadContainer(item.url);
        else this._activateItem(item);
        e.preventDefault();
        break;
      }
      case 'Backspace': {
        const parent = this._parentOf(this._currentPath);
        if (parent) { this.loadContainer(parent); e.preventDefault(); }
        break;
      }
      case '/': {
        const f = this.shadowRoot.querySelector('.pod-filter');
        if (f) { f.focus(); f.select(); e.preventDefault(); }
        break;
      }
      case 'Escape':
        if (this._filterText) {
          this._filterText = '';
          const f = this.shadowRoot.querySelector('.pod-filter');
          if (f) f.value = '';
          this._renderTree(this._allItems, { preserveFocus: false });
          e.preventDefault();
        }
        break;
    }
  }

  _parentOf(url) {
    if (!url || !this._rootUrl) return null;
    if (url === this._rootUrl) return null;
    const u = url.endsWith('/') ? url.slice(0, -1) : url;
    const i = u.lastIndexOf('/');
    if (i < 0) return null;
    const p = u.slice(0, i + 1);
    return p.startsWith(this._rootUrl) ? p : this._rootUrl;
  }

  async _activateItem(item) {
    if (typeof this._podClickAction === 'function') {
      this._podClickAction(await this._withContentType(item), this);
    } else if (typeof this._podClickAction === 'string') {
      this._openNamedHandler(this._podClickAction, item);
    } else {
      this._openItemModal(item);
    }
  }

  // HEAD the clicked resource so a function podClickAction receives the
  // server's real Content-Type rather than the extension-inferred guess.
  // One request, only for the clicked item; on failure the guess stands.
  async _withContentType(item) {
    try {
      const resp = await this._fetchFor(item.url)(item.url, { method: 'HEAD' });
      const ct = (resp.headers.get('Content-Type') || '').split(';')[0].trim();
      if (ct) return { ...item, contentType: ct };
    } catch (e) { /* keep the inferred contentType */ }
    return item;
  }

  _createTreeItem(item, idx) {
    const li = document.createElement('li');
    li.className = item.isContainer ? 'folder' : 'file';
    li.tabIndex = 0;
    li.dataset.url = item.url;
    li.dataset.index = String(idx);

    const label = document.createElement('span');
    label.className = 'item-label';
    label.textContent = `${item.isContainer ? '\u{1F4C1}' : fileIcon(item.name)} ${item.displayName || item.name}`;
    li.appendChild(label);

    const openItemAction = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._activateItem(item);
    };

    const gear = document.createElement('button');
    gear.className = 'item-gear';
    gear.title = 'Actions';
    this._paintGearIcon(gear);
    gear.onclick = openItemAction;
    li.appendChild(gear);

    const handleSelectClick = (e) => {
      if (e.shiftKey && this._lastSelectedIndex >= 0) {
        const a = Math.min(this._lastSelectedIndex, idx);
        const b = Math.max(this._lastSelectedIndex, idx);
        this._selected.clear();
        for (let i = a; i <= b; i++) this._selected.add(this._currentItems[i].url);
      } else if (e.ctrlKey || e.metaKey) {
        if (this._selected.has(item.url)) this._selected.delete(item.url);
        else this._selected.add(item.url);
        this._lastSelectedIndex = idx;
      } else {
        this._selected.clear();
        this._selected.add(item.url);
        this._lastSelectedIndex = idx;
      }
      this._refreshSelectionUI();
    };

    // Drag
    li.draggable = true;
    li.ondragstart = (e) => {
      let items;
      if (this._selected.has(item.url) && this._selected.size > 1) {
        items = this._currentItems.filter(it => this._selected.has(it.url));
      } else {
        this._selected.clear();
        this._selected.add(item.url);
        this._lastSelectedIndex = idx;
        this._refreshSelectionUI();
        items = [item];
      }
      this._draggedItem = items[0];
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', items.map(it => it.url).join('\n'));
      li.classList.add('dragging');
      this.dispatchEvent(new CustomEvent('sol-drag-start', {
        bubbles: true, composed: true, detail: { items, item: items[0], element: this }
      }));
    };
    li.ondragend = () => {
      li.classList.remove('dragging');
      this.dispatchEvent(new CustomEvent('sol-drag-end', { bubbles: true, composed: true }));
    };

    if (item.isContainer) {
      li.onclick = (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) { handleSelectClick(e); return; }
        if (!li.classList.contains('dragging')) this.loadContainer(item.url);
      };
    } else {
      li.onclick = handleSelectClick;
      li.ondblclick = openItemAction;
    }
    // Keyboard activation (Enter / Backspace / arrows / `/`) is handled at
    // the .tree-wrapper level — see _onWrapperKey.

    return li;
  }

  _refreshSelectionUI() {
    const ul = this.shadowRoot.querySelector('.file-tree');
    if (!ul) return;
    for (const li of ul.children) {
      li.classList.toggle('selected', this._selected.has(li.dataset.url));
    }
  }

  // ── Item modal — delegates to <sol-pod-ops> when it is loaded ───────

  _openItemModal(item) {
    // sol-pod-ops is an optional add-on. Without it — and with no
    // podClickAction wired up — show a short how-to instead.
    if (!customElements.get('sol-pod-ops')) { this._openHelpModal(item); return; }

    const modal = document.createElement('sol-modal');
    modal.modalTitle = item.isContainer ? `Folder: ${item.displayName || item.name}` : (item.displayName || item.name);
    modal.styles = [POD_MODAL_SHEET || POD_MODAL_CSS];

    modal.handler = (body) => {
      body.style.padding = '0';
      body.style.overflow = 'hidden';
      const ops = document.createElement('sol-pod-ops');
      ops.item = item;
      ops.fetchFn = this._fetchFor(item.url);
      ops.setAttribute('source', item.url);
      ops.style.height = '100%';
      ops.addEventListener('sol-status', (e) => this._emitStatus(e.detail.message, e.detail.type));
      ops.addEventListener('sol-navigate', async () => {
        modal.close();
        await this.loadContainer(this._currentPath);
      });
      body.appendChild(ops);
    };
    modal.open();
    this._modal = modal;
  }

  // Shown when an item is activated but nothing is set up to handle it —
  // no podClickAction, and <sol-pod-ops> has not been loaded.
  _openHelpModal(item) {
    const modal = document.createElement('sol-modal');
    modal.modalTitle = item.displayName || item.name;
    modal.setAttribute('size', 'large');
    modal.handler = (body) => {
      body.style.padding = '16px 20px';
      body.innerHTML =
        '<p>Nothing is wired up to handle this item.</p>' +
        '<p>Set a <code>podClickAction</code> on the &lt;sol-pod&gt; element ' +
        'to receive item clicks and render the info into your page:</p>' +
        '<pre>document.querySelector(\'sol-pod\').podClickAction =\n' +
        '  (item) =&gt; { /* item: url, name, displayName, isContainer, contentType */ };</pre>' +
        '<p>Or load the <code>sol-pod-ops</code> script for the built-in ' +
        'file-operations panel.</p>';
    };
    modal.open();
    this._modal = modal;
  }

  // ── Named gear handlers ─────────────────────────────────────────────

  async _openNamedHandler(name, item) {
    switch (name) {
      case 'solidos': return this._openSolidosModal(item);
      default: return this._openItemModal(item);
    }
  }

  _openSolidosModal(item) {
    // sol-solidos is optional too — fall back to the item modal without it.
    if (!customElements.get('sol-solidos')) { this._openItemModal(item); return; }

    const modal = document.createElement('sol-modal');
    modal.modalTitle = item.displayName || item.name;
    modal.size = 'large';

    modal.handler = (body) => {
      body.style.padding = '0';
      body.style.overflow = 'hidden';
      const solidos = document.createElement('sol-solidos');
      solidos.setAttribute('source', item.url);
      solidos.style.height = '100%';
      body.appendChild(solidos);
    };
    modal.open();
    this._modal = modal;
  }

  // ── Status emission ─────────────────────────────────────────────────

  _emitStatus(message, type) {
    this.dispatchEvent(new CustomEvent('sol-status', {
      bubbles: true, composed: true,
      detail: { message, type }
    }));
  }
}

define('sol-pod', SolPod);
export { SolPod };
export default SolPod;
