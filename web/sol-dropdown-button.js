/**
 * <sol-dropdown-button> — a trigger button that drops an RDF-defined menu.
 *
 * A thin presentation over <sol-menu>: same ui:Menu shape, same item kinds
 * (ui:Link, ui:Component, command), same submenu / keyboard / command dispatch
 * engine — but rendered as a button that opens its top-level items in a floating
 * popup, instead of <sol-menu>'s always-open nav bar. Nothing is pre-selected
 * (a dropdown has no content panel to fill).
 *
 *   <sol-dropdown-button source="./menu.ttl#More" label="⋮"></sol-dropdown-button>
 *
 * Or declare the menu inline (no source) with a <menu> of items — `data-handler`
 * names what each does (a bare action name dispatches sol-command; a
 * custom-element tag / <a href> mounts a component); owner-gated items add
 * `requires-write`:
 *
 *   <sol-dropdown-button label="⋮">
 *     <menu>
 *       <button data-handler="installPod" requires-write>Install on my Pod…</button>
 *       <a href="about.html">About</a>
 *     </menu>
 *   </sol-dropdown-button>
 *
 * Command items (a ui:Command whose schema:url fragment is the registry key) dispatch
 * `sol-command` for the host app to resolve — see core/rdf-render.js. Link /
 * component items render via the region= cascade (e.g. region="modal"); set a
 * region on the element if you want them surfaced somewhere.
 *
 * Access requirements: an item declaring `acl:mode acl:Write` in the RDF is
 * rendered with `part="requires-write"` (no policy here) — the host app decides
 * what that means (hide / disable / …), e.g.
 * `.cannot-write sol-dropdown-button::part(requires-write) { display: none }`.
 *
 * Attributes:
 *   source   — URL of the ui:Menu document (where the menu data lives).
 *              `from-rdf` is accepted as a fallback for <sol-menu> parity.
 *              OPT-IN: building from RDF is inert until `web/menu-from-rdf.js`
 *              is imported; with neither attribute the inline <menu> is used and
 *              no rdflib is needed.
 *   context-source — URL of a SECOND ui:Menu rendered below a separator
 *              (context items, e.g. the host app's active plugin). Update it
 *              (and call reload()) as the context changes; absent/empty ⇒ no
 *              separator, standard menu only. Same menu-from-rdf opt-in.
 *   label    — trigger text (default "⋮")
 *
 * Parts: `trigger` (the button), `requires-write` (items needing write access).
 */

import { define } from '../core/define.js';
import { adopt, sheetFrom } from '../core/adopt.js';
import { CSS as MENU_CSS } from './styles/sol-menu-css.js';
import { SolMenu } from './sol-menu.js';
import { placeAnchored } from '../core/anchor-place.js';

const DD_CSS = `
  :host {
    display: inline-block; position: relative;
    height: auto; overflow: visible;
    flex: 0 0 auto; min-width: 0; max-width: none;
  }
  .sol-dd-trigger { font: inherit; cursor: pointer; }
  .sol-dd-popup {
    position: absolute; top: calc(100% + 4px); right: 0; left: auto;
    z-index: 1000;
    /* Explicit content width — in an abs-positioned box the inherited
       .sol-menu-nav shrink-to-fit collapses to the trigger width. */
    width: max-content;
    min-width: var(--menu-popup-min-width, 200px);
    max-width: min(90vw, 360px);
    /* Silver lining by default (overridable via --menu-popup-border) — gives
       every dropdown popup a crisp light border on dark or light surfaces. */
    border: 1px solid var(--menu-popup-border, silver);
    border-radius: var(--radius-md, 8px);
    background: var(--menu-bg, var(--surface, #fff));
    box-shadow: var(--shadow-popup, 0 8px 24px rgba(0,0,0,0.28));
  }
  .sol-dd-popup[hidden] { display: none; }
  /* Context section (context-source=): plugin-contributed items render under
     the standard items, separated by a rule. */
  .sol-dd-separator {
    margin: 4px 10px;
    border-top: 1px solid var(--menu-border, var(--border, #e0e0e0));
  }
  /* A dropdown has no inline content panel; items use the region= cascade. The
     authored <menu> (and content panel) is a declaration, not UI — its items
     are harvested into the popup, so keep the slotted source hidden. */
  ::slotted(.sol-menu-content), ::slotted(menu) { display: none; }
`;

const DD_SHEET = sheetFrom(MENU_CSS + DD_CSS);

class SolDropdownButton extends SolMenu {
  static get observedAttributes() { return ['source', 'from-rdf', 'context-source']; }

  // Where the menu data lives. `source` is canonical (sol-* launcher parity);
  // `from-rdf` is accepted for <sol-menu> parity. With neither, the inline
  // <menu> children are harvested instead.
  _menuUri() { return this.getAttribute('source') || this.getAttribute('from-rdf'); }

  attributeChangedCallback(name, oldValue, newValue) {
    if ((name === 'source' || name === 'from-rdf') && oldValue !== newValue && this._rendered) {
      const uri = this._menuUri();
      if (uri) this._loadFromRdf(uri);
    }
    // context-source: a SECOND ui:Menu (e.g. the active plugin's items)
    // rendered below a separator. Changing it re-renders; removing it drops
    // the section. The host app updates this as its context changes.
    if (name === 'context-source' && oldValue !== newValue && this._rendered) {
      const uri = this._menuUri();
      if (uri) this._loadFromRdf(uri);   // resets _items, then re-appends context
      else this._renderNav();
    }
  }

  connectedCallback() {
    if (!this._rendered) {
      this._initShell();
      const uri = this._menuUri();
      if (uri) {
        this._loadFromRdf(uri);                // wrap items + _renderNav (no auto-select)
      } else {
        const declared = this._items.length === 0 ? this._harvestItems(this) : null;
        if (declared?.length) this._items = declared;
        this._renderNav();
      }
    }
    // Re-establish dismiss listeners on EVERY connect: a host (e.g. sol-tabs)
    // may re-home this button (detach + re-append), and the inherited
    // disconnectedCallback tears these down — so reconnect must restore them.
    this._wireDismiss();
  }

  // Re-read the menu: the RDF document, or — with no source — the inline
  // <menu>, so a host that rewrites its item text (e.g. a Theme item naming the
  // theme in effect) gets that text rendered.
  async reload() {
    const uri = this._menuUri();
    if (uri) { await this._loadFromRdf(uri); return; }
    const declared = this._harvestItems(this);
    if (declared?.length) this._items = declared;
    this._renderNav();
  }

  // Context items (context-source=) append below a separator after the
  // standard items — see _renderNav below and _appendContextItems.

  // Unlike light-DOM SolMenu, the dropdown keeps a shadow root: its trigger
  // is themed from outside via ::part(trigger), and its popup must not be
  // restyled by host-page menu CSS.
  _createRoot() { return this.attachShadow({ mode: 'open' }); }

  _initShell() {
    // A dropdown is always a vertical list — pin it before _loadFromRdf can
    // copy ui:orientation (which defaults to horizontal and would trigger the
    // sol-menu horizontal-nav rules that collapse the popup).
    this.setAttribute('orientation', 'vertical');
    const root = this.shadowRoot;
    const label = this.getAttribute('label') || '⋮';   // ⋮
    root.innerHTML = `
      <button class="sol-dd-trigger" part="trigger" type="button"
              aria-haspopup="menu" aria-expanded="false">${label}</button>
      <div class="sol-menu-nav sol-dd-popup" part="menu" role="menu" hidden></div>
      <slot></slot>`;
    adopt(root, { sheet: DD_SHEET, css: MENU_CSS + DD_CSS });

    // A (hidden) content panel so inherited select() for link/component items
    // has somewhere to mount; commands never touch it.
    if (!this.querySelector(':scope > .sol-menu-content')) {
      const content = document.createElement('div');
      content.className = 'sol-menu-content';
      content.hidden = true;
      this.appendChild(content);
    }
    this._rendered = true;

    const trigger = root.querySelector('.sol-dd-trigger');
    // An explicit name wins; otherwise a symbol-only label (☰, ⋮) gives a
    // screen reader nothing to read, so fall back to "Menu".
    const a11y = this.getAttribute('aria-label') || this.getAttribute('title')
      || (/[\p{L}\p{N}]/u.test(label) ? null : 'Menu');
    if (a11y) trigger.setAttribute('aria-label', a11y);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(); });
    // Dismiss listeners (document outside-click + Escape) are wired in
    // _wireDismiss, re-run on every connect so they survive re-homing.
  }

  // (Re)attach the dismiss listeners — outside-click on the document and Escape
  // on the shadow root. Idempotent: same handler refs (adding a listener twice
  // is a no-op); the handlers are recreated only when the inherited
  // disconnectedCallback has nulled them after a detach.
  _wireDismiss() {
    const root = this.shadowRoot;
    if (!this._onDocClick) {
      this._onDocClick = (e) => {
        if (!this.contains(e.target) && !root.contains(e.target)) this._close();
      };
    }
    document.addEventListener('click', this._onDocClick);
    if (!this._onKeyDown) {
      this._onKeyDown = (e) => {
        if (e.key === 'Escape') { this._close(); this._trigger?.focus(); return; }
        this._handleKeyDown(e);
      };
    }
    root.addEventListener('keydown', this._onKeyDown);
  }

  // Build the item buttons into the popup (reuses the shared nav-level renderer
  // — commands, links, components, submenus). No single-item hide; visibility
  // is the trigger's job. Context items (context-source=) re-append after
  // every rebuild.
  _renderNav() {
    const pop = this.shadowRoot.querySelector('.sol-dd-popup');
    if (!pop) return;
    pop.innerHTML = '';
    this._btns = {};
    if (this._ctxItems) {   // drop previous context items from the model —
      // by IDENTITY, since _loadFromRdf may have replaced _items already
      this._items = this._items.filter((i) => !this._ctxItems.includes(i));
      this._ctxItems = null;
    }
    // Render every item; items needing write declare it (part="requires-write")
    // for the host app to gate — the dropdown takes no policy itself.
    this._renderNavLevel(pop, this._items, 0);
    pop.querySelectorAll('button').forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));
    this._appendContextItems();
  }

  // Load the context-source ui:Menu and append its items below a separator.
  // Stale-load guarded (rapid context switches); context items join _items so
  // keyboard nav / select() / command dispatch treat them like any other.
  async _appendContextItems() {
    const uri = this.getAttribute('context-source');
    const token = (this._ctxToken = {});
    if (!uri) return;
    const load = this.constructor.fromRdfLoader;
    if (!load) return;                    // needs the menu-from-rdf add-on, like source=
    let result;
    try {
      result = await load(uri, document.baseURI);
    } catch (err) {
      console.warn('<sol-dropdown-button> context-source load failed:', err.message);
      return;
    }
    if (!result || token !== this._ctxToken) return;   // superseded or gone
    const items = this._wrapRdfItems(result.items);
    if (!items.length) return;
    const pop = this.shadowRoot.querySelector('.sol-dd-popup');
    if (!pop) return;
    const sep = document.createElement('div');
    sep.className = 'sol-dd-separator';
    sep.setAttribute('role', 'separator');
    pop.appendChild(sep);
    this._renderNavLevel(pop, items, 0);
    this._items = [...this._items, ...items];
    this._ctxItems = items;
    pop.querySelectorAll('button').forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));
  }

  // A dropdown has no content panel — never pre-fire.
  _autoSelectFirst() {}

  get _popup() { return this.shadowRoot.querySelector('.sol-dd-popup'); }
  get _trigger() { return this.shadowRoot.querySelector('.sol-dd-trigger'); }

  _open() {
    // Close any other open dropdown first. A trigger click stopPropagation()s
    // (so it won't reach the document), which means a sibling dropdown's
    // outside-click dismiss never fires — without this, opening one leaves the
    // others open (e.g. several tab-bar submenu dropdowns).
    for (const el of document.querySelectorAll('sol-dropdown-button')) {
      if (el !== this && el._popup && !el._popup.hidden && typeof el._close === 'function') el._close();
    }
    this._popup.hidden = false;
    this._trigger.setAttribute('aria-expanded', 'true');
    // Position the popup viewport-fixed against the trigger so it escapes any
    // ancestor that clips overflow (a tab bar, a scroll container) — an
    // absolutely-positioned popup would be cropped there. Stays right-aligned
    // to the trigger; tracks scroll/resize while open.
    this._place();
    this._onReflow = () => this._place();
    window.addEventListener('scroll', this._onReflow, true);
    window.addEventListener('resize', this._onReflow);
    // The popup's width settles AFTER the first placement (items render,
    // fonts load) — placing once against the first-paint width left the
    // far-right ☰ popup hanging past the viewport edge. Re-place next frame
    // and track the popup's own size while open (same wiring as sol-dropdown).
    requestAnimationFrame(this._onReflow);
    if (typeof ResizeObserver !== 'undefined') {
      this._popupRo = new ResizeObserver(this._onReflow);
      this._popupRo.observe(this._popup);
    }
    const first = this._popup.querySelector('button');
    if (first) { first.setAttribute('tabindex', '0'); first.focus(); }
  }

  _place() {
    // Shared placement (see core/anchor-place.js): left-align the popup under the
    // trigger, flipping right only if it would overflow. minWidth 200 so a menu
    // that isn't laid out yet still flips sensibly on first paint.
    placeAnchored(this._trigger, this._popup, this._popup, 200);
  }

  _close() {
    if (this._popup) this._popup.hidden = true;
    this._trigger?.setAttribute('aria-expanded', 'false');
    if (this._onReflow) {
      window.removeEventListener('scroll', this._onReflow, true);
      window.removeEventListener('resize', this._onReflow);
      this._onReflow = null;
    }
    if (this._popupRo) { this._popupRo.disconnect(); this._popupRo = null; }
    super._closeAllPopups();   // collapse any submenu fly-outs
  }

  _toggle() { (this._popup && this._popup.hidden) ? this._open() : this._close(); }

  // Item clicks call this (commands) — route it to closing the whole dropdown.
  _closeAllPopups() { this._close(); }

  // Link/component items mount via the region cascade, then the dropdown closes.
  select(name) {
    super.select(name);
    this._close();
  }
}

define('sol-dropdown-button', SolDropdownButton);
export { SolDropdownButton };
export default SolDropdownButton;
