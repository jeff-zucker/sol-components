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
 * Command items (a ui:Component whose ui:name is a bare registry key) dispatch
 * `sol-command` for the host app to resolve — see core/rdf-render.js. Link /
 * component items render via the region= cascade (e.g. region="modal"); set a
 * region on the element if you want them surfaced somewhere.
 *
 * Owner gating: an item carrying `ui:attribute [ schema:name "owner-only" ;
 * schema:value "true" ]` is hidden unless the boolean `owner` attribute is set —
 * so the host toggles a flag, not the data URL (which stays declared in HTML).
 *
 * Attributes:
 *   source   — URL of the ui:Menu document (where the menu data lives).
 *              `from-rdf` is accepted as a fallback for <sol-menu> parity.
 *   label    — trigger text (default "⋮")
 *   owner    — boolean; when present, owner-only items are shown
 *
 * The trigger is exposed as `::part(trigger)` for external styling.
 */

import { define } from '../core/define.js';
import { adopt, sheetFrom } from '../core/adopt.js';
import { CSS as MENU_CSS } from './styles/sol-menu-css.js';
import { SolMenu } from './sol-menu.js';

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
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-md, 8px);
    background: var(--surface, #fff);
    box-shadow: var(--shadow-popup, 0 8px 24px rgba(0,0,0,0.28));
  }
  .sol-dd-popup[hidden] { display: none; }
  /* A dropdown has no inline content panel; items use the region= cascade. */
  ::slotted(.sol-menu-content) { display: none; }
`;

const DD_SHEET = sheetFrom(MENU_CSS + DD_CSS);

class SolDropdownButton extends SolMenu {
  static get observedAttributes() { return ['source', 'from-rdf', 'owner']; }

  // Where the menu data lives. `source` is canonical (sol-* launcher parity);
  // `from-rdf` is accepted for <sol-menu> parity.
  _menuUri() { return this.getAttribute('source') || this.getAttribute('from-rdf'); }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._rendered) return;
    if (name === 'source' || name === 'from-rdf') {
      const uri = this._menuUri();
      if (uri) this._loadFromRdf(uri);
    } else if (name === 'owner') {
      this._renderNav();   // re-gate owner-only items
    }
  }

  // An item is owner-only when it carries an `owner-only="true"` param.
  _gated(item) { return item.params?.['owner-only'] === 'true'; }

  connectedCallback() {
    if (this._rendered) return;
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

  async reload() {
    const uri = this._menuUri();
    if (uri) await this._loadFromRdf(uri);
  }

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
    const a11y = this.getAttribute('aria-label') || this.getAttribute('title');
    if (a11y) trigger.setAttribute('aria-label', a11y);
    trigger.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(); });

    this._onDocClick = (e) => {
      if (!this.contains(e.target) && !root.contains(e.target)) this._close();
    };
    document.addEventListener('click', this._onDocClick);

    this._onKeyDown = (e) => {
      if (e.key === 'Escape') { this._close(); trigger.focus(); return; }
      this._handleKeyDown(e);
    };
    root.addEventListener('keydown', this._onKeyDown);
  }

  // Build the item buttons into the popup (reuses the shared nav-level renderer
  // — commands, links, components, submenus). No single-item hide; visibility
  // is the trigger's job.
  _renderNav() {
    const pop = this.shadowRoot.querySelector('.sol-dd-popup');
    if (!pop) return;
    pop.innerHTML = '';
    this._btns = {};
    const owner = this.hasAttribute('owner');
    const visible = this._items.filter(it => owner || !this._gated(it));
    this._renderNavLevel(pop, visible, 0);
    pop.querySelectorAll('button').forEach((b, i) => b.setAttribute('tabindex', i === 0 ? '0' : '-1'));
  }

  // A dropdown has no content panel — never pre-fire.
  _autoSelectFirst() {}

  get _popup() { return this.shadowRoot.querySelector('.sol-dd-popup'); }
  get _trigger() { return this.shadowRoot.querySelector('.sol-dd-trigger'); }

  _open() {
    this._popup.hidden = false;
    this._trigger.setAttribute('aria-expanded', 'true');
    const first = this._popup.querySelector('button');
    if (first) { first.setAttribute('tabindex', '0'); first.focus(); }
  }

  _close() {
    if (this._popup) this._popup.hidden = true;
    this._trigger?.setAttribute('aria-expanded', 'false');
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
