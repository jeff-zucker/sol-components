/**
 * <sol-menu> — menu navigation + content panel: a sidebar or bar of choices
 * (the ui:Menubar renderer), with real dropdown submenus.
 *
 * LIGHT-DOM element (host-page CSS reaches every part of the strip) with the
 * same declarative API as <sol-tabs>: fill with <a href="…">Label</a>
 * children, each anchor becomes a menu entry; clicking loads its URL into
 * the content panel. With `keep-alive`, every TOP-LEVEL item renders once
 * into its own persistent `.sol-menu-pane` and switching parks panes by
 * visibility (audio keeps playing; scroll / login state survive); a popup
 * submenu pick mounts into its parent's pane. On coarse-pointer devices a
 * keep-alive strip collapses into the phone navigator (trigger + bottom
 * sheet, core/nav-sheet.js).
 *
 * Imperative usage:
 *   const m = document.createElement('sol-menu');
 *   m.items = [
 *     { name: 'Overview', render(body) { ... } },
 *     { name: 'Details',  render(body) { ... } },
 *   ];
 *   parent.appendChild(m);
 *   m.select('Overview');
 *
 * Declarative usage: like <sol-tabs>. Handler lookup per anchor, falling
 * back to <sol-menu>'s `data-handler` attribute, then to <sol-include>. The
 * href is forwarded as both `source` and `endpoint`, and other anchor
 * attributes pass through.
 *
 *   <sol-menu>
 *     <a href="intro.md">Intro</a>
 *     <a href="data.ttl" data-handler="sol-query" pattern="?s ?p ?o">Triples</a>
 *   </sol-menu>
 *
 * Submenus: nest <submenu> elements to create collapsible groups. The
 * <label> text is the group heading; anchors (or further <submenu>s) inside
 * become the group's items. Any depth is supported.
 *
 *   <sol-menu>
 *     <a href="home.md">Home</a>
 *     <submenu>
 *       <label>Docs</label>
 *       <a href="quickstart.md">Quickstart</a>
 *       <submenu>
 *         <label>API</label>
 *         <a href="api/query.md">Query</a>
 *         <a href="api/modal.md">Modal</a>
 *       </submenu>
 *     </submenu>
 *   </sol-menu>
 *
 * Attributes:
 *   orientation="horizontal"  — lay the nav bar on top instead of the side
 *   keep-alive                — persistent per-item panes (the strip mode)
 *   data-handler="sol-*"      — default component for rendering each item
 *   from-rdf="menu.ttl#Name"  — build the menu from a ui:Menu RDF document
 *                               instead of light-DOM children. OPT-IN: inert
 *                               until `web/menu-from-rdf.js` is imported (the
 *                               lone rdflib pull); the declarative path above
 *                               needs no rdflib.
 *
 * Events (bubbling, composed):
 *   sol-menu-change — detail: { name }
 */

import { define } from '../core/define.js';
import { adopt, ensureDocStyle } from '../core/adopt.js';
import { attachEditorSelfGear } from '../core/editor-self.js';
import { CSS as MENU_CSS, sheet as menuSheet } from './styles/sol-menu-css.js';
import { registerMenuConsumer } from '../core/menu-consumer.js';
import { loadMenuInto } from '../core/menu-load.js';
import { renderComponentItem, renderLinkItem, ensureHandler, isCommandName, paramsToObject, dispatchCommand } from '../core/rdf-render.js';
import { renderIcon } from '../core/utils.js';
import { tabSig, ensurePane, activateInitial, applyMenuItems } from '../core/menu-panes.js';
import { coarseMql, isCoarsePointer, renderNavSheet, removeSheet, syncNav } from '../core/nav-sheet.js';
import './sol-sheet.js';   // the shared bottom-sheet surface the phone nav slots into

/**
 * Menu navigation + content panel.
 *
 * Light-DOM element. Same declarative API as sol-tabs: fill with anchor
 * children, each becomes a menu entry.
 *
 * @class SolMenu
 * @extends HTMLElement
 * @attr {string} orientation - "horizontal" to lay nav on top (default: sidebar)
 * @attr {string} keep-alive - persistent per-item panes (the strip mode)
 * @attr {string} data-handler - default sol-* component tag for anchors
 * @fires sol-menu-change - detail: { name }
 *
 * Everything is light DOM — style the strip directly:
 * `sol-menu > .sol-menu-nav`, its buttons (with `data-tab-id` from the RDF
 * item), `.sol-menu-group-btn` submenu heads, `.sol-menu-popup` dropdowns,
 * `sol-menu > .sol-menu-content` and its `.sol-menu-pane`s. Default content
 * overflow is `hidden` (app chrome doesn't scroll; components inside scroll
 * on their own). Authors may supply their own `.sol-menu-content` child;
 * otherwise one is created.
 *
 * Horizontal-orientation nav now wraps (`flex-wrap: wrap`) instead of
 * showing a horizontal scrollbar — items overflow to a second row when
 * they don't fit the chrome width (e.g. large font).
 */
class SolMenu extends HTMLElement {
  constructor() {
    super();
    this._root = this._createRoot();
    this._items = [];
    this._btns = {};
    this._active = null;
    this._cleanup = null;
    this._footerEl = null;
    this._actionsEl = null;
    this._rendered = false;
    // The phone navigator's class prefix (core/nav-sheet.js).
    this._navPrefix = 'sol-menu';
  }

  // ── the shared strip contract (core/menu-panes.js, core/nav-sheet.js) ────
  // Those modules address the host as `_tabs` / `_renderBar` / `switchTab`;
  // sol-menu's own names stay `_items` / `_renderNav` / `select`.
  get _tabs() { return this._items; }
  set _tabs(v) { this._items = v || []; }
  _renderBar() { this._renderNav(); }
  switchTab(name, opts) { this.select(name, opts); }

  // Keep-alive: render every top-level item once into its own persistent pane
  // and switch by toggling visibility, so mounted components are never torn
  // down — audio keeps playing, scroll / login / in-flight state survive.
  get _keepAlive() { return this.hasAttribute('keep-alive'); }
  _ensurePane(item) { return ensurePane(this, item, 'sol-menu-pane'); }

  get footerEl() { return this._footerEl; }
  set footerEl(el) { this._footerEl = el; }
  get actionsEl() { return this._actionsEl; }
  set actionsEl(el) { this._actionsEl = el; }

  /**
   * Merge an updated set of items (parseMenuItems output) into the live menu
   * IN PLACE — unchanged items keep their keep-alive panes; see
   * core/menu-panes.js applyMenuItems.
   */
  applyItems(items) { applyMenuItems(this, items, 'sol-menu-pane'); }

  /**
   * Name a non-menu screen on the phone navigator trigger (e.g. the host
   * opened Settings from its own chrome, outside this menu). The override
   * sticks until the next select, which returns the trigger to the active
   * item's name. Pass a falsy value to clear it explicitly. No-op on
   * desktop (no navigator trigger).
   */
  setNavLabel(text) {
    this._navLabelOverride = text || null;
    syncNav(this);
  }

  // The render root. SolMenu itself is a LIGHT-DOM element — the host page's
  // CSS must reach every part of the strip (per-item accents, deep selectors).
  // A subclass that needs encapsulation (sol-dropdown-button — its trigger is
  // styled via ::part) overrides this to attach a shadow root instead.
  _createRoot() { return this; }

  static get observedAttributes() { return ['from-rdf']; }

  // `from-rdf` rendering is an opt-in capability: importing `web/menu-from-rdf.js`
  // installs the rdflib-backed loader here (inherited by SolMenu subclasses such
  // as sol-dropdown-button). Null → declarative-only, no rdflib (see
  // core/menu-consumer.js).
  static fromRdfLoader = null;

  /** Editor declaration consumed by core/editor.js. Menus are edited
   *  with sol-tree-edit (head fields + per-item shapes + drill into
   *  nested ui:Menu submenus), so `<sol-form>` is not the right tool. */
  static get editor() {
    return {
      tag: 'sol-tree-edit',
      subjectAttr: 'root',
      attrs: {
        'head-shape':      new URL('../shapes/ui.shacl', import.meta.url).href,
        'item-shape':      new URL('../shapes/ui.shacl', import.meta.url).href,
        'drill-when-type': 'http://www.w3.org/ns/ui#Menu',
        'head-label':      'Menu Heading',
        'items-label':     'menu items',
      },
    };
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'from-rdf' && oldValue !== newValue && this._rendered) {
      this._loadFromRdf(newValue);
    }
  }

  async connectedCallback() {
    if (this._rendered) return;

    const fromRdf = this.getAttribute('from-rdf');
    if (fromRdf) {
      this._initShell();
      this._loadFromRdf(fromRdf);
    } else {
      const declared = this._items.length === 0 ? this._harvestItems(this) : null;
      this._initShell();
      if (declared?.length) this._items = declared;
      this._renderNav();
      this._autoSelectFirst();
    }

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);

    // Re-render the nav when the pointer type flips (fine ↔ coarse) so the
    // phone navigator appears/disappears — chiefly for DevTools device
    // emulation; on a real device it fires once at most. Wired once.
    const mql = coarseMql(this);
    if (mql && !this._mqlWired) {
      this._mqlWired = true;
      this._onPointerFlip = () => this._renderNav();
      mql.addEventListener?.('change', this._onPointerFlip);
    }
  }

  // Select the first leaf so the content panel isn't empty on load. Overridable
  // — e.g. <sol-dropdown-button> has no panel and shouldn't pre-fire anything.
  // In keep-alive (strip) mode every top-level item gets its persistent pane
  // up front, then the first is shown.
  _autoSelectFirst() {
    if (this._keepAlive && this._items.length) { activateInitial(this, 'sol-menu-pane'); return; }
    const firstLeaf = this._firstLeaf(this._items);
    if (firstLeaf) this.select(firstLeaf.name);
  }

  _initShell() {
    const orient = this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
    const root = this._root;
    const nav = `<div class="sol-menu-nav" part="nav" role="menubar" aria-orientation="${orient}"></div>`;
    if (root === this) {
      // Light DOM: the nav and the content are direct children, so host-page
      // CSS reaches every part of the strip. An author-supplied content child
      // survives the shell build.
      const ownContent = this.querySelector(':scope > .sol-menu-content');
      if (ownContent) ownContent.remove();
      this.innerHTML = nav;
      if (ownContent) this.appendChild(ownContent);
      ensureDocStyle(this.getRootNode(), 'sol-menu-styles', MENU_CSS);
    } else {
      // A shadow-rooted subclass (sol-dropdown-button) projects its light
      // children through the slot and scopes the menu CSS to its own root.
      root.innerHTML = `${nav}
      <slot></slot>`;
      adopt(root, { sheet: menuSheet, css: MENU_CSS });
    }
    // Content area lives in LIGHT DOM so menu-click results are reachable by
    // page CSS / document queries. The author may supply their own
    // `.sol-menu-content` child; else create one.
    if (!this.querySelector(':scope > .sol-menu-content')) {
      const content = document.createElement('div');
      content.className = 'sol-menu-content';
      content.setAttribute('role', 'region');
      this.appendChild(content);
    }
    this._rendered = true;
    this._onDocClick = (e) => {
      if (!this.contains(e.target) && !root.contains(e.target)) this._closeAllPopups();
    };
    document.addEventListener('click', this._onDocClick);
    this._onKeyDown = (e) => this._handleKeyDown(e);
    root.addEventListener('keydown', this._onKeyDown);

    // Sync active-state visuals when something else (e.g. <sol-button>)
    // mounts a non-menu tab into our linkTarget. The mount layer
    // dispatches sol-tab-activate; if the name isn't one of our items,
    // we clear every active button so the chrome doesn't pretend the
    // user is still "on" a menu page.
    this._onTabActivate = (e) => {
      const name = e.detail?.name;
      const isOurs = name && this._flatLeaves(this._items).some(i => i.name === name);
      if (isOurs) {
        // In a keep-alive strip the active button is the item's TOP-LEVEL
        // owner (a popup leaf lights its group head), and a mount into a
        // PARKED (hidden) pane — e.g. the initial pane pre-build — must not
        // steal the selection.
        const top = this._keepAlive ? this._topFor(name) : null;
        if (top && top._pane?.hidden) return;
        const shown = top ? top.name : name;
        if (this._active !== shown) {
          this._active = shown;
          this._setActiveButton(shown);
        }
      } else {
        this._active = null;
        this._setActiveButton(null);
      }
    };
    document.addEventListener('sol-tab-activate', this._onTabActivate);
  }

  _handleKeyDown(e) {
    const root = this._root;
    const nav = root.querySelector('.sol-menu-nav');
    if (!nav) return;
    const horizontal = this.getAttribute('orientation') === 'horizontal';

    // Escape closes any open popup
    if (e.key === 'Escape') {
      const openGroup = root.querySelector('.sol-menu-group.open');
      if (openGroup) {
        this._closeAllPopups();
        const groupBtn = openGroup.querySelector(':scope > .sol-menu-group-btn');
        if (groupBtn) groupBtn.focus();
        e.preventDefault();
        return;
      }
    }

    // Arrow / Home / End navigation among focusable buttons in the nav
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    if (![nextKey, prevKey, 'Home', 'End'].includes(e.key)) return;
    if (!nav.contains(e.target) || e.target.tagName !== 'BUTTON') return;

    // Collect focusable buttons visible at the current level
    const focusable = this._focusableButtons(nav, e.target);
    if (!focusable.length) return;
    const idx = focusable.indexOf(e.target);
    let next;
    if (e.key === nextKey)  next = focusable[(idx + 1) % focusable.length];
    if (e.key === prevKey)  next = focusable[(idx - 1 + focusable.length) % focusable.length];
    if (e.key === 'Home')   next = focusable[0];
    if (e.key === 'End')    next = focusable[focusable.length - 1];
    if (next && next !== e.target) {
      this._setRovingFocus(next);
      e.preventDefault();
    }
  }

  _focusableButtons(container, target) {
    // A tree navigates every VISIBLE button (branch heads + leaves of open
    // subtrees) as one list; a popup menu scopes to the open popup, else the
    // top-level nav.
    if (this._view === 'Tree') {
      return Array.from(container.querySelectorAll('button')).filter((b) => !b.closest('[hidden]'));
    }
    const popup = target.closest('.sol-menu-popup');
    const scope = popup || container;
    return Array.from(scope.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
  }

  _setRovingFocus(btn) {
    const nav = this._root.querySelector('.sol-menu-nav');
    if (!nav) return;
    nav.querySelectorAll('button').forEach(b => b.setAttribute('tabindex', '-1'));
    btn.setAttribute('tabindex', '0');
    btn.focus();
  }

  async _loadFromRdf(uri) {
    await loadMenuInto(this, uri, {
      sourceName: 'sol-menu',
      apply: (result) => {
        // The menu's declared ui:view drives this component's presentation:
        // Toolbar adds the button bar's app-bar styling hook (same cascade as
        // orientation — a mount that already set a class keeps its own
        // presentation); Tree renders submenus as inline collapse/expand
        // branches instead of dropdown popups.
        this._view = result.view || null;
        if (result.view === 'Toolbar' && !this.classList.contains('app-bar')) this.classList.add('app-bar');
        this._items = this._wrapRdfItems(result.items);
        this._renderNav();
        this._autoSelectFirst();
      },
    });
  }

  // Wrap pure item descriptions from core/menu-rdf.js with the DOM-side
  // render closures the rest of the component expects. The leaf closures
  // are built by core/rdf-render.js, shared with <sol-tabs>.
  _wrapRdfItems(descriptions) {
    const ctx = {
      host: this, baseUrl: import.meta.url,
      sourceName: 'sol-menu', embedClass: 'sol-menu-embed',
    };
    return descriptions.map(desc => {
      const rw = desc.requiresWrite;   // surfaced as part="requires-write"; app decides policy
      const sig = tabSig(desc);        // change signature for applyItems' in-place merge
      if (desc.type === 'submenu') {
        // A strip submenu's pane is filled by its POPUP picks (never
        // pre-rendered), so its own render is a no-op. `isSubmenu` +
        // `children` also feed the phone sheet's accordion groups.
        return { name: desc.name, id: desc.id, icon: desc.icon, sig, requiresWrite: rw,
          isSubmenu: true, children: this._wrapRdfItems(desc.children), render: () => {} };
      }
      if (desc.type === 'component') {
        // A desc whose tag isn't a custom-element tag is a command:
        // clicking dispatches sol-command (no content mounted, not selectable).
        if (isCommandName(desc.tag)) {
          // desc.id rides along so dispatchCommand's data-for routing can
          // address the item's claimed region (dead without it).
          return { name: desc.name, id: desc.id, icon: desc.icon, sig, requiresWrite: rw, command: desc.tag, params: paramsToObject(desc.params) };
        }
        return { name: desc.name, id: desc.id, icon: desc.icon, sig, type: desc.type, requiresWrite: rw, render: renderComponentItem(desc, ctx) };
      }
      // href rides along so the phone sheet can open an external link leaf
      // without switching to an empty submenu pane.
      return { name: desc.name, id: desc.id, icon: desc.icon, sig, type: desc.type, href: desc.href, requiresWrite: rw, render: renderLinkItem(desc, ctx) };
    });
  }

  _harvestItems(root) {
    const parentHandler = (this.getAttribute('data-handler') || '').trim();
    const SKIP = new Set(['href', 'data-handler', 'params', 'requires-write', 'if-logged-in', 'icon',
                          'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy']);
    // A menu item is owner-gated by `requires-write` (≙ acl:mode acl:Write) or
    // the friendlier `if-logged-in` boolean — same meaning, surfaced as
    // part="requires-write" for the host to hide. (Whole-button gating is the
    // `if-logged-in` attribute on the launcher itself, handled by host CSS.)
    const isGated = (n) => n.hasAttribute('requires-write') || n.hasAttribute('if-logged-in');
    const out = [];
    let i = 0;
    // A <menu> child is the canonical items container (a dropdown almost always
    // has one); without it we fall back to harvesting loose children. <li>
    // wrappers (the strictly-valid form) are unwrapped to the item element.
    const container = root.querySelector(':scope > menu') || root;
    const nodes = Array.from(container.children)
      .flatMap(n => n.tagName === 'LI' ? Array.from(n.children) : [n]);
    for (const node of nodes) {
      const handler = node.getAttribute('data-handler');
      if (handler && isCommandName(handler)) {
        // An action item: `data-handler` is a bare name (not a custom element), so it
        // dispatches sol-command (no content mounted), gated by requires-write
        // (→ part="requires-write") just like the RDF form.
        const label = (node.textContent || '').trim() || `Item ${++i}`;
        const raw = node.getAttribute('params');
        let params;
        if (raw != null) { try { params = JSON.parse(raw); } catch { params = raw; } }
        out.push({
          name: label,
          command: handler,
          params,
          requiresWrite: isGated(node),
          icon: node.getAttribute('icon') || undefined,
        });
      } else if (node.tagName === 'A' && node.hasAttribute('href')) {
        const label = (node.textContent || '').trim() || `Item ${++i}`;
        const url = node.getAttribute('href');
        const handlerTag = (node.getAttribute('data-handler') || parentHandler || 'sol-include').trim();
        out.push({
          name: label,
          requiresWrite: isGated(node),
          render: (body) => {
            ensureHandler(handlerTag, this, import.meta.url, 'sol-menu');
            const el = document.createElement(handlerTag);
            el.setAttribute('source', url);
            el.setAttribute('endpoint', url);
            for (const attr of node.attributes) {
              if (SKIP.has(attr.name)) continue;
              el.setAttribute(attr.name, attr.value);
            }
            el.classList.add('sol-menu-embed');
            body.appendChild(el);
          },
        });
      } else if (node.tagName === 'SUBMENU') {
        const labelEl = node.querySelector(':scope > label');
        const label = (labelEl?.textContent || '').trim() || `Group ${++i}`;
        const inner = document.createElement('div');
        for (const c of Array.from(node.children)) {
          if (c.tagName === 'LABEL') continue;
          inner.appendChild(c);
        }
        const children = this._harvestItems(inner);
        out.push({ name: label, open: node.hasAttribute('open'), children });
      }
    }
    return out;
  }

  // The top-level item that owns `name` — the item itself, or the submenu
  // whose subtree holds it (the strip button that should read active).
  _topFor(name) {
    return this._items.find(t => t.name === name
      || (t.children && this._flatLeaves(t.children).some(c => c.name === name)));
  }

  _firstLeaf(items) {
    for (const it of items) {
      if (it.children) {
        const leaf = this._firstLeaf(it.children);
        if (leaf) return leaf;
      } else if (typeof it.render === 'function') {
        return it;
      }
    }
    return null;
  }

  _flatLeaves(items, acc = []) {
    for (const it of items) {
      if (it.children) this._flatLeaves(it.children, acc);
      else if (typeof it.render === 'function') acc.push(it);
    }
    return acc;
  }

  // Command items (no render closure — they dispatch sol-command on click).
  _flatCommands(items, acc = []) {
    for (const it of items) {
      if (it.children) this._flatCommands(it.children, acc);
      else if (it.command) acc.push(it);
    }
    return acc;
  }

  get items() { return this._items; }
  set items(arr) {
    this._items = arr || [];
    if (this._rendered) this._renderNav();
  }

  get activeItem() { return this._active; }
  get body() { return this.querySelector(':scope > .sol-menu-content'); }

  _renderNav() {
    const root = this._root;
    const nav = root.querySelector('.sol-menu-nav');
    if (!nav) return;
    nav.innerHTML = '';
    this._btns = {};
    const orient = this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
    nav.setAttribute('aria-orientation', orient);
    const leafCount = this._flatLeaves(this._items).length + this._flatCommands(this._items).length;
    if (leafCount <= 1 && !this._items.some(i => i.children)) {
      nav.style.display = 'none';
      return;
    }
    nav.style.display = '';
    this._renderNavLevel(nav, this._items, 0);
    // Roving tabindex: only the first focusable button is in tab order
    const allBtns = nav.querySelectorAll('button');
    allBtns.forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));

    // Touch/coarse-pointer devices: a keep-alive strip collapses into the
    // phone navigator (trigger + bottom sheet, core/nav-sheet.js). Legacy
    // menus (no keep-alive) keep their bar — their hosts own the phone story.
    if (this._keepAlive) {
      if (isCoarsePointer(this)) renderNavSheet(this, nav);
      else removeSheet(this);
    }
  }

  _renderNavLevel(parent, items, depth, topItem = null) {
    items.forEach(item => {
      const top = depth === 0 ? item : topItem;
      if (item.children && this._view === 'Tree') {
        // ui:Tree: a submenu is an inline collapse/expand branch — the
        // subtree opens in place (indented), never as a floating popup.
        const wrap = document.createElement('div');
        wrap.className = 'sol-menu-branch';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sol-menu-group-btn';
        btn.textContent = item.name;
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('aria-expanded', item.open ? 'true' : 'false');
        if (item.open) btn.classList.add('open');
        if (item.id) btn.dataset.tabId = item.id;
        if (item.requiresWrite) btn.setAttribute('part', 'item requires-write');
        const sub = document.createElement('div');
        sub.className = 'sol-menu-subtree';
        sub.setAttribute('role', 'group');
        sub.hidden = !item.open;
        this._renderNavLevel(sub, item.children, depth + 1, top);
        btn.onclick = () => {
          const opening = sub.hidden;
          sub.hidden = !opening;
          btn.setAttribute('aria-expanded', String(opening));
          btn.classList.toggle('open', opening);
        };
        wrap.appendChild(btn);
        wrap.appendChild(sub);
        parent.appendChild(wrap);
        return;
      }
      if (item.children) {
        const wrap = document.createElement('div');
        wrap.className = 'sol-menu-group';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sol-menu-group-btn';
        btn.textContent = item.name;
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        if (item.id) btn.dataset.tabId = item.id;
        if (item.requiresWrite) btn.setAttribute('part', 'item requires-write');
        const popup = document.createElement('div');
        popup.className = 'sol-menu-popup';
        popup.setAttribute('role', 'menu');
        popup.setAttribute('aria-label', item.name);
        this._renderNavLevel(popup, item.children, depth + 1, top);
        if (depth === 0 && this._keepAlive) {
          // The group head is a first-class strip button: select() toggles its
          // active state, and the phone sheet's leaf picks duck-type a
          // `.select(childName)` on it (the same contract a submenu launcher
          // element offers).
          this._btns[item.name] = btn;
          btn.select = (childName) => {
            const want = String(childName).toLowerCase();
            const child = this._flatLeaves(item.children).find(c => c.name.toLowerCase() === want);
            if (child) this._selectChild(item, child);
          };
        }
        btn.onclick = (e) => {
          e.stopPropagation();
          const wasOpen = wrap.classList.contains('open');
          this._closeSiblingPopups(wrap);
          wrap.classList.toggle('open', !wasOpen);
          btn.setAttribute('aria-expanded', String(!wasOpen));
          if (!wasOpen) {
            this._positionPopup(btn, popup, depth);
            const first = popup.querySelector('button');
            if (first) { first.setAttribute('tabindex', '0'); first.focus(); }
          }
        };
        wrap.appendChild(btn);
        wrap.appendChild(popup);
        parent.appendChild(wrap);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        // Surface the declared access requirement for the app to act on; the
        // menu itself takes no policy (no hide / disable here).
        if (item.requiresWrite) btn.setAttribute('part', 'item requires-write');
        // An icon renders before the label in a fixed icon slot so rows align:
        // an image (favicon URL / path / inline svg) paints as <img>/<svg>; an
        // emoji or other text "icon" paints as text in that same slot. Putting
        // emoji in the slot keeps icon-bearing rows aligned (an earlier version
        // dropped emoji to avoid the indent mismatch — the shared slot fixes it
        // instead). No icon → label only.
        if (item.icon) {
          btn.title = item.name;
          // Icon in a fixed slot before the label so rows align (image/svg/emoji).
          btn.appendChild(renderIcon(item.icon, 'sol-menu-icon'));
          btn.appendChild(document.createTextNode(item.name));
        } else {
          btn.textContent = item.name;
        }
        if (item.id) btn.dataset.tabId = item.id;
        if (item.command) {
          btn.onclick = () => { dispatchCommand(this, item.command, item.params, { id: item.id || null }); this._closeAllPopups(); };
        } else if (depth > 0 && top && this._keepAlive) {
          // A popup leaf in a keep-alive strip mounts into its top-level
          // submenu's pane rather than replacing the shared body.
          btn.onclick = () => { this._selectChild(top, item); this._closeAllPopups(); };
        } else {
          btn.onclick = () => { this.select(item.name); this._closeAllPopups(); };
        }
        parent.appendChild(btn);
        this._btns[item.name] = btn;
      }
    });
  }

  _positionPopup(btn, popup, depth) {
    const r = btn.getBoundingClientRect();
    const horizontal = this.getAttribute('orientation') === 'horizontal';
    const flyBelow = horizontal && depth === 0;
    popup.style.top  = (flyBelow ? r.bottom + 2 : r.top) + 'px';
    popup.style.left = (flyBelow ? r.left : r.right + 2) + 'px';
  }

  _closeSiblingPopups(keep) {
    const parent = keep.parentElement;
    if (!parent) return;
    parent.querySelectorAll(':scope > .sol-menu-group.open').forEach(g => {
      if (g !== keep) {
        g.classList.remove('open');
        const b = g.querySelector(':scope > .sol-menu-group-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
  }

  _closeAllPopups() {
    this._root.querySelectorAll('.sol-menu-group.open').forEach(g => {
      g.classList.remove('open');
      const b = g.querySelector(':scope > .sol-menu-group-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  select(name, { silent = false } = {}) {
    const lower = String(name).toLowerCase();
    // Keep-alive strips select among TOP-LEVEL items (a submenu parent owns a
    // pane of its own); otherwise selection means a leaf, wherever it nests.
    const top = this._keepAlive
      ? this._items.find(t => t.name.toLowerCase() === lower) : null;
    const item = top
      || this._flatLeaves(this._items).find(t => t.name.toLowerCase() === lower);
    if (!item) return;
    this._active = item.name;
    this._setActiveButton(item.name);

    if (top) {
      // No teardown: ensure this item's pane exists, then park the others.
      this._ensurePane(item);
      for (const t of this._items) if (t._pane) t._pane.hidden = (t !== item);
      this.body.setAttribute('aria-label', `Content: ${item.name}`);
    } else {
      if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
      const body = this.body;
      body.innerHTML = '';
      body.style.padding = ''; body.style.overflow = ''; body.style.height = '';
      body.setAttribute('aria-label', `Content: ${item.name}`);
      const cleanup = item.render(body);
      if (typeof cleanup === 'function') this._cleanup = cleanup;
    }

    // Keep the phone navigator in step (see core/nav-sheet.js). A select of a
    // top-level item clears any remembered submenu leaf; a leaf pick re-sets
    // _navKey in _selectChild right after this runs.
    if (this._navTrigger) {
      this._navLabelOverride = null;
      if (this._navItems?.some((i) => i.meta.kind === 'tab' && i.meta.name === item.name)) {
        this._navKey = `t:${item.name}`;
      } else if (!(this._navKey || '').startsWith(`c:${item.name}`)) {
        this._navKey = null;
      }
      syncNav(this);
    }

    // `silent` = a programmatic refresh (applyItems re-asserting the SAME
    // active item after a live update) — listeners must not mistake it for
    // the user picking one.
    if (!silent) {
      this.dispatchEvent(new CustomEvent('sol-menu-change', {
        bubbles: true, composed: true, detail: { name: item.name },
      }));
    }
  }

  // A popup leaf pick inside a keep-alive strip: surface the top-level
  // submenu's pane, then mount the picked leaf into it. The render closure's
  // region cascade falls back to the pane we pass, and component-mount's
  // [data-menu-item] wrappers + pruneSiblings make repeated picks switch
  // keep-alive within it.
  _selectChild(top, child) {
    this.select(top.name);
    const pane = top._pane;
    if (pane && typeof child.render === 'function') child.render(pane);
    this._navKey = `c:${top.name}${child.name}`;
    if (this._navTrigger) syncNav(this);
  }

  /**
   * Update the visual active state on the nav buttons. Passing a name
   * that isn't one of this menu's leaves clears every button — the
   * menu owns no active item (e.g. a sol-button mounted something
   * other than a menu target into the linkTarget).
   */
  _setActiveButton(name) {
    Object.values(this._btns).forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
      b.setAttribute('tabindex', '-1');
    });
    if (!name) return;
    const btn = this._btns[name];
    if (!btn) return;
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
    btn.setAttribute('tabindex', '0');
  }

  /**
   * Re-read `from-rdf` and rebuild the menu nav. Public hook used by
   * external editors (e.g. dk-settings) after the menu TTL changes.
   * A menu built from declared light-DOM anchors has no source to
   * re-read; reload is a no-op in that case.
   */
  async reload() {
    const uri = this.getAttribute('from-rdf');
    if (uri) await this._loadFromRdf(uri);
  }

  disconnectedCallback() {
    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
    if (this._onDocClick) { document.removeEventListener('click', this._onDocClick); this._onDocClick = null; }
    if (this._onKeyDown) { this._root.removeEventListener('keydown', this._onKeyDown); this._onKeyDown = null; }
    if (this._onTabActivate) { document.removeEventListener('sol-tab-activate', this._onTabActivate); this._onTabActivate = null; }
    removeSheet(this);   // the phone sheet lives on <body>, so detach it with the element
  }
}

define('sol-menu', SolMenu);
registerMenuConsumer(SolMenu);
export { SolMenu };
export default SolMenu;
