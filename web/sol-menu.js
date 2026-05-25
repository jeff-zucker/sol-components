/**
 * <sol-menu> — Sidebar navigation + content panel.
 *
 * Shadow-DOM element with the same declarative API as <sol-tabs>: fill
 * with <a href="…">Label</a> children, each anchor becomes a menu entry;
 * clicking loads its URL into the content panel.
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
 * back to <sol-menu>'s `handler` attribute, then to <sol-include>. The
 * href is forwarded as both `source` and `endpoint`, and other anchor
 * attributes pass through.
 *
 *   <sol-menu>
 *     <a href="intro.md">Intro</a>
 *     <a href="data.ttl" handler="sol-query" pattern="?s ?p ?o">Triples</a>
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
 *   handler="sol-*"           — default component for rendering each item
 *
 * Events (bubbling, composed):
 *   sol-menu-change — detail: { name }
 */

import { define } from '../core/define.js';
import { adopt } from '../core/adopt.js';
import { attachEditorSelfGear } from '../core/editor-self.js';
import { CSS as MENU_CSS, sheet as menuSheet } from './styles/sol-menu-css.js';
import { loadMenuFromUri } from '../core/menu-rdf.js';
import { renderComponentItem, renderLinkItem, ensureHandler } from '../core/rdf-render.js';

/**
 * Sidebar navigation + content panel.
 *
 * Shadow-DOM element. Same declarative API as sol-tabs: fill with anchor
 * children, each becomes a menu entry.
 *
 * @class SolMenu
 * @extends HTMLElement
 * @attr {string} orientation - "horizontal" to lay nav on top (default: sidebar)
 * @attr {string} handler - default sol-* component tag for anchors
 * @fires sol-menu-change - detail: { name }
 */
class SolMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._btns = {};
    this._active = null;
    this._cleanup = null;
    this._rendered = false;
  }

  static get observedAttributes() { return ['from-rdf']; }

  /** Editor declaration consumed by core/editor.js. Menus are edited
   *  with sol-tree-edit (head fields + per-item shapes + drill into
   *  nested ui:Menu submenus), so `<sol-form>` is not the right tool. */
  static get editor() {
    return {
      tag: 'sol-tree-edit',
      subjectAttr: 'root',
      attrs: {
        'head-shape':      new URL('../shapes/menu-head.shacl', import.meta.url).href,
        'item-shape':      new URL('../shapes/menu-items.shacl', import.meta.url).href,
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

      const firstLeaf = this._firstLeaf(this._items);
      if (firstLeaf) this.select(firstLeaf.name);
    }

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  _initShell() {
    const orient = this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
    const root = this.shadowRoot;
    root.innerHTML = `
      <div class="sol-menu-nav" role="menubar" aria-orientation="${orient}"></div>
      <div class="sol-menu-content" role="region"></div>`;
    adopt(root, { sheet: menuSheet, css: MENU_CSS });
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
        if (this._active !== name) {
          this._active = name;
          this._setActiveButton(name);
        }
      } else {
        this._active = null;
        this._setActiveButton(null);
      }
    };
    document.addEventListener('sol-tab-activate', this._onTabActivate);
  }

  _handleKeyDown(e) {
    const root = this.shadowRoot;
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
    // If target is inside an open popup, scope to that popup; otherwise top-level nav
    const popup = target.closest('.sol-menu-popup');
    const scope = popup || container;
    return Array.from(scope.querySelectorAll(':scope > button, :scope > .sol-menu-group > .sol-menu-group-btn'));
  }

  _setRovingFocus(btn) {
    const nav = this.shadowRoot.querySelector('.sol-menu-nav');
    if (!nav) return;
    nav.querySelectorAll('button').forEach(b => b.setAttribute('tabindex', '-1'));
    btn.setAttribute('tabindex', '0');
    btn.focus();
  }

  async _loadFromRdf(uri) {
    try {
      const result = await loadMenuFromUri(uri, document.baseURI);
      if (!result) return;
      if (!this.hasAttribute('orientation')) this.setAttribute('orientation', result.orientation);
      this._items = this._wrapRdfItems(result.items);
      this._renderNav();
      const firstLeaf = this._firstLeaf(this._items);
      if (firstLeaf) this.select(firstLeaf.name);
    } catch (err) {
      console.error('<sol-menu> from-rdf load failed:', err);
      this.dispatchEvent(new CustomEvent('sol-error', {
        bubbles: true, composed: true,
        detail: { source: 'sol-menu', kind: 'rdf-load', uri, message: err.message },
      }));
    }
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
      if (desc.type === 'submenu') {
        return { name: desc.name, children: this._wrapRdfItems(desc.children) };
      }
      if (desc.type === 'component') {
        return { name: desc.name, icon: desc.icon, render: renderComponentItem(desc, ctx) };
      }
      return { name: desc.name, icon: desc.icon, render: renderLinkItem(desc, ctx) };
    });
  }

  _harvestItems(root) {
    const parentHandler = (this.getAttribute('handler') || '').trim();
    const SKIP = new Set(['href', 'handler', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy']);
    const out = [];
    let i = 0;
    for (const node of Array.from(root.children)) {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        const label = (node.textContent || '').trim() || `Item ${++i}`;
        const url = node.getAttribute('href');
        const handlerTag = (node.getAttribute('handler') || parentHandler || 'sol-include').trim();
        out.push({
          name: label,
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

  get items() { return this._items; }
  set items(arr) {
    this._items = arr || [];
    if (this._rendered) this._renderNav();
  }

  get activeItem() { return this._active; }
  get body() { return this.shadowRoot.querySelector('.sol-menu-content'); }

  _renderNav() {
    const root = this.shadowRoot;
    const nav = root.querySelector('.sol-menu-nav');
    if (!nav) return;
    nav.innerHTML = '';
    this._btns = {};
    const orient = this.getAttribute('orientation') === 'horizontal' ? 'horizontal' : 'vertical';
    nav.setAttribute('aria-orientation', orient);
    const leafCount = this._flatLeaves(this._items).length;
    if (leafCount <= 1 && !this._items.some(i => i.children)) {
      nav.style.display = 'none';
      return;
    }
    nav.style.display = '';
    this._renderNavLevel(nav, this._items, 0);
    // Roving tabindex: only the first focusable button is in tab order
    const allBtns = nav.querySelectorAll('button');
    allBtns.forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));
  }

  _renderNavLevel(parent, items, depth) {
    items.forEach(item => {
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
        const popup = document.createElement('div');
        popup.className = 'sol-menu-popup';
        popup.setAttribute('role', 'menu');
        popup.setAttribute('aria-label', item.name);
        this._renderNavLevel(popup, item.children, depth + 1);
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
        if (item.icon) {
          btn.title = item.name;
          btn.setAttribute('aria-label', item.name);
          const span = document.createElement('span');
          span.className = 'sol-menu-icon';
          span.setAttribute('aria-hidden', 'true');
          btn.appendChild(span);
          if (item.icon.startsWith('data:image/svg+xml')) {
            try {
              const raw = decodeURIComponent(item.icon.replace('data:image/svg+xml,', ''));
              span.innerHTML = raw;
              const svg = span.querySelector('svg');
              if (svg) { svg.setAttribute('width', '1.2em'); svg.setAttribute('height', '1.2em'); }
            } catch { span.textContent = item.name; }
          } else {
            const img = document.createElement('img');
            img.src = item.icon;
            img.alt = '';
            span.appendChild(img);
          }
        } else {
          btn.textContent = item.name;
        }
        btn.onclick = () => { this.select(item.name); this._closeAllPopups(); };
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
    this.shadowRoot.querySelectorAll('.sol-menu-group.open').forEach(g => {
      g.classList.remove('open');
      const b = g.querySelector(':scope > .sol-menu-group-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  select(name) {
    const item = this._flatLeaves(this._items).find(t => t.name.toLowerCase() === name.toLowerCase());
    if (!item) return;
    this._active = item.name;

    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
    this._setActiveButton(item.name);

    const body = this.body;
    body.innerHTML = '';
    body.style.padding = ''; body.style.overflow = ''; body.style.height = '';
    body.setAttribute('aria-label', `Content: ${item.name}`);

    const cleanup = item.render(body);
    if (typeof cleanup === 'function') this._cleanup = cleanup;

    this.dispatchEvent(new CustomEvent('sol-menu-change', {
      bubbles: true, composed: true, detail: { name: item.name },
    }));
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
    if (this._onKeyDown) { this.shadowRoot.removeEventListener('keydown', this._onKeyDown); this._onKeyDown = null; }
    if (this._onTabActivate) { document.removeEventListener('sol-tab-activate', this._onTabActivate); this._onTabActivate = null; }
  }
}

define('sol-menu', SolMenu);
export { SolMenu };
export default SolMenu;
