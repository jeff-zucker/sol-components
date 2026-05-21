/**
 * <sol-pod> — Solid pod file browser web component.
 * Attributes: source (pod storage URL — if omitted, discovers from current origin)
 *             gear-action (Function|string — custom callback when gear icon is clicked;
 *                          if omitted, opens the default pod-ops modal)
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

// ── SolPod component ──────────────────────────────────────────────────

/**
 * Solid pod file browser web component.
 *
 * Browse containers, view/edit files, manage permissions. Pairs with
 * sol-login for authenticated access. Delegates file operations to sol-pod-ops.
 *
 * @class SolPod
 * @extends HTMLElement
 * @attr {string} source - pod storage URL (discovers from origin if omitted)
 * @attr {string} login - CSS selector for a sol-login element
 * @attr {string} gear-action - custom callback when gear icon is clicked
 * @attr {string} handler - default sol-* component for file viewing
 * @property {Object} login - SolLogin element reference
 * @property {string} currentPath - current container URL
 * @property {Array} items - current directory listing
 * @fires sol-navigate - detail: { url }
 * @fires sol-drag-start - detail: { item, element }
 * @fires sol-drag-end
 * @fires sol-auth-needed - detail: { url }
 * @fires sol-status - detail: { message, type }
 */
class SolPod extends HTMLElement {
  static get observedAttributes() { return ['source', 'login', 'gear-action', 'handler', 'side']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._login = null;
    this._side = null;
    this._currentPath = '';
    this._rootUrl = '';
    this._items = [];
    this._storages = [];
    this._initialized = false;
    this._modal = null;
    this._toastTimer = null;
    this._draggedItem = null;
    this._gearAction = null;
    this._selected = new Set();
    this._lastSelectedIndex = -1;
    this._currentItems = [];
    this._allItems = [];
    this._filterText = '';
    this._focusIndex = -1;
    this._prefs = { hideDot: true, hideHash: true, hideTilde: true };
  }

  get login() { return this._login; }
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
  get storages() { return [...this._storages]; }

  setStorages(arr, currentUrl) {
    this._storages = Array.isArray(arr) ? [...arr] : [];
    this._populateSelect(this._storages);
    const target = currentUrl || this._rootUrl;
    if (target && this._storages.includes(target)) {
      const sel = this.shadowRoot.querySelector('.pod-select');
      if (sel) sel.value = target;
    }
  }

  get prefs() { return this._prefs; }
  set prefs(p) { this._prefs = { ...this._prefs, ...p }; }

  get source() { return this.getAttribute('source') || ''; }
  set source(v) { this.setAttribute('source', v); }

  get gearAction() { return this._gearAction; }
  set gearAction(v) {
    if (typeof v === 'function') { this._gearAction = v; return; }
    if (typeof v === 'string' && v) { this._gearAction = v; return; }
    this._gearAction = null;
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      const loginAttr = this.getAttribute('login');
      if (loginAttr) this.login = loginAttr;
      const sideAttr = this.getAttribute('side');
      if (sideAttr) this._side = sideAttr;
      const gearAttr = this.getAttribute('gear-action') || this.getAttribute('handler');
      if (gearAttr) this.gearAction = gearAttr;
    }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'source' && this._initialized) {
      this._setSource(newV);
    }
    if (name === 'login' && this._initialized) {
      this.login = newV;
    }
    if (name === 'gear-action' || name === 'handler') {
      this.gearAction = newV;
    }
    if (name === 'side') {
      this._side = newV || null;
    }
  }

  /** Initialize the component — discovers pods and loads initial view. */
  async initialize() {
    const source = this.source;
    if (source) {
      this._rootUrl = source.endsWith('/') ? source : source + '/';
      if (!this._storages.includes(this._rootUrl)) this._storages.push(this._rootUrl);
      this._populateSelect(this._storages);
      const sel = this.shadowRoot.querySelector('.pod-select');
      if (sel) sel.value = this._rootUrl;
      await this.loadContainer(this._rootUrl);
    } else if (this._storages.length > 0) {
      // Storages were provided externally (e.g. via setStorages) — use them.
      this._rootUrl = this._storages[0];
      this._populateSelect(this._storages);
      const sel = this.shadowRoot.querySelector('.pod-select');
      if (sel) sel.value = this._rootUrl;
      await this.loadContainer(this._rootUrl);
    } else {
      // Discover from current origin
      try {
        const webIds = await discoverOwnerWebIds();
        this._storages = await getStoragesFromWebIds(webIds);
      } catch (e) {
        console.warn('[sol-pod] Discovery failed:', e);
        // Fall back to current origin root
        this._storages = [window.location.origin + '/'];
      }
      this._populateSelect(this._storages);
      if (this._storages.length > 0) {
        this._rootUrl = this._storages[0];
        const sel = this.shadowRoot.querySelector('.pod-select');
        if (sel) sel.value = this._rootUrl;
        await this.loadContainer(this._rootUrl);
      }
    }
  }

  _fetchFor(url) {
    if (this._login?.fetchFor) return this._login.fetchFor(url, this._side);
    return fetch;
  }

  async _setSource(url) {
    if (!url) return;
    this._rootUrl = url.endsWith('/') ? url : url + '/';
    if (!this._storages.includes(this._rootUrl)) {
      this._storages.push(this._rootUrl);
      this._populateSelect(this._storages);
    }
    const sel = this.shadowRoot.querySelector('.pod-select');
    if (sel) sel.value = this._rootUrl;
    await this.loadContainer(this._rootUrl);
  }

  async loadContainer(url) {
    this._showLoading();
    try {
      const fetchFn = this._fetchFor(url);
      const items = await fetchContainer(url, fetchFn);
      this._currentPath = url;
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

  // ── DOM rendering ───────────────────────────────────────────────────

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = `
      <div class="pod-header">
        <div class="pod-header-row">
          <select class="pod-select" aria-label="Pod storage">
            <option value="">Loading pods...</option>
          </select>
        </div>
      </div>
      <div class="breadcrumb"></div>
      <div class="pod-filter-row">
        <input class="pod-filter" type="search"
               placeholder="Filter (press / to focus, Esc to clear)"
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
        opt.value = url; opt.textContent = url;
        sel.appendChild(opt);
      });
    }
    const addOpt = document.createElement('option');
    addOpt.value = '__add__'; addOpt.textContent = '\uFF0B Add a Pod...';
    sel.appendChild(addOpt);
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
    if (!this._storages.includes(normalized)) {
      this._storages.push(normalized);
      this._populateSelect(this._storages);
    }
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

  _activateItem(item) {
    if (typeof this._gearAction === 'function') {
      this._gearAction(item, this);
    } else if (typeof this._gearAction === 'string') {
      this._openNamedHandler(this._gearAction, item);
    } else {
      this._openItemModal(item);
    }
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
      if (typeof this._gearAction === 'function') {
        this._gearAction(item, this);
      } else if (typeof this._gearAction === 'string') {
        this._openNamedHandler(this._gearAction, item);
      } else {
        this._openItemModal(item);
      }
    };

    const gear = document.createElement('button');
    gear.className = 'item-gear'; gear.textContent = '\u2699';
    gear.title = 'Actions';
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

  // ── Item modal (delegates to <sol-pod-ops>) ─────────────────────────

  async _openItemModal(item) {
    await import('./sol-modal.js');
    await import('./sol-pod-ops.js');

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

  // ── Named gear handlers ─────────────────────────────────────────────

  async _openNamedHandler(name, item) {
    switch (name) {
      case 'solidos': return this._openSolidosModal(item);
      default: return this._openItemModal(item);
    }
  }

  async _openSolidosModal(item) {
    await import('./sol-modal.js');
    await import('./sol-solidos.js');

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
