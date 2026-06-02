/**
 * <sol-tabs> — Tabbed content container.
 *
 * Light-DOM element so the hosting context's styles (e.g. the modal's
 * shadow-scoped `.modal-*` classes) reach the tab content.
 *
 * Imperative usage:
 *   const t = document.createElement('sol-tabs');
 *   t.tabs = [
 *     { name: 'View', render(body, footer, actions) { ... } },
 *     { name: 'Edit', render(body, footer, actions) { ... } },
 *   ];
 *   t.footerEl  = someFooterEl;
 *   t.actionsEl = someActionsEl;
 *   parent.appendChild(t);
 *   t.switchTab('View');
 *
 * Declarative usage: fill the element with <a href="...">Label</a> anchors.
 * Each anchor becomes a tab — label = text, content URL = href. Contents
 * render lazily on first switch. Set `handler="sol-*"` on the anchor (or
 * on <sol-tabs> as a default) to wrap the URL in that component; otherwise
 * <sol-include> is used. The href is forwarded as both `source` and
 * `endpoint`, and all other anchor attributes pass through — so e.g.
 * `wanted="? ? ?"` on an anchor with `handler="sol-query"` just works.
 *
 * `handler` and the forwarded attributes may be written `data-*` to keep a
 * standard <a> HTML-valid; the `data-` prefix is stripped when forwarding
 * (`data-handler` picks the tag, `data-src` → `src`, `data-view` → `view`, …).
 *
 *   <sol-tabs>
 *     <a href="notes.md">Notes</a>
 *     <a href="data.ttl" handler="sol-query" wanted="? ? ?">Table</a>
 *     <a href="lib.ttl" data-handler="ia-player" data-src="lib.ttl">Music</a>
 *   </sol-tabs>
 *
 *   <sol-tabs handler="sol-live-edit">
 *     <a href="readme.md">Readme</a>
 *   </sol-tabs>
 *
 * Action launchers: tabs are the `<a href>` children; ANY OTHER element child
 * (a button, a custom control) is treated as a toolbar action — re-homed into
 * the tab bar's actions row (next to the tabs) and otherwise left as-is, so
 * toolbar controls live in the same markup with no marker. `slot="actions"` is
 * an explicit escape hatch (force an <a> to be an action, or be explicit). An
 * inline <sol-button> action is auto-wired to this tabs' content area (no `for=`):
 *
 *   <sol-tabs>
 *     <a href="a.html">A</a>
 *     <sol-button inline handler="sol-include" source="help.html">?</sol-button>
 *   </sol-tabs>
 *
 * RDF usage: point `from-rdf` at a ui:Menu document — the same RDF shape
 * <sol-menu> consumes. Each ui:Link / ui:Component part becomes a tab; a
 * nested ui:Menu becomes a tab whose content is a slimmer
 * <sol-tabs variant="sub"> strip of that group's children.
 *
 *   <sol-tabs from-rdf="./demo-tabs.ttl#MainTabs"></sol-tabs>
 *
 * The tab bar is hidden when only one tab is supplied. Set attribute
 * `variant="sub"` for the slimmer nested subtab styling.
 *
 * Events (bubbling, composed):
 *   sol-tab-change — detail: { name }
 *   sol-error      — detail: { source, kind, ... } on RDF / handler load failure
 */

import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';
import { CSS as TABS_CSS } from './styles/sol-tabs-css.js';
import { attachEditorSelfGear } from '../core/editor-self.js';
import { loadMenuFromUri } from '../core/menu-rdf.js';
import { renderComponentItem, renderLinkItem, ensureHandler, isCommandName } from '../core/rdf-render.js';

// For auto-wiring an inline action launcher to this tabs' content area we need
// a stable selector; mint an id for any <sol-tabs> that lacks one.
let _solTabsUid = 0;

/**
 * Tabbed content container.
 *
 * Light-DOM element. Fill with anchor children (declarative) or set
 * the `.tabs` property (imperative). Tab bar is hidden for a single tab.
 *
 * @class SolTabs
 * @extends HTMLElement
 * @attr {string} orientation - "horizontal" (default) or "vertical"
 * @attr {string} handler - default sol-* component tag for all tabs
 * @attr {string} variant - "sub" for slimmer nested subtab styling
 * @attr {string} from-rdf - URL of a ui:Menu RDF document to build tabs from
 * @fires sol-tab-change - detail: { name }
 * @fires sol-error - detail: { source, kind } on RDF / handler load failure
 */
class SolTabs extends HTMLElement {
  constructor() {
    super();
    this._tabs = [];
    this._btns = {};
    this._active = null;
    this._cleanup = null;
    this._footerEl = null;
    this._actionsEl = null;
    this._launchers = null;
    this._rendered = false;
  }

  static get observedAttributes() { return ['from-rdf']; }

  // Keep-alive: render every tab once into its own persistent pane and
  // switch by toggling visibility, so components are never torn down —
  // audio keeps playing, scroll / login / in-flight state survive.
  get _keepAlive() { return this.hasAttribute('keep-alive'); }

  /**
   * Form TTL describing how to edit this tabs' `from-rdf` subject.
   * sol-tabs and sol-menu share the same `ui:Menu` shape, so they
   * also share the same editor.
   */
  static get editor() {
    return new URL('../data/menu-form.ttl', import.meta.url).href;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'from-rdf' && oldValue !== newValue && this._rendered) {
      this._loadFromRdf(newValue);
    }
  }

  connectedCallback() {
    ensureDocStyle(this.getRootNode(), 'sol-tabs-styles', TABS_CSS);
    if (this._rendered) return;

    const fromRdf = this.getAttribute('from-rdf');

    // Harvest declarative anchors before we overwrite innerHTML.
    const declared = (!fromRdf && this._tabs.length === 0)
      ? this._harvestAnchors() : null;

    // Declarative PAGE-LEVEL action launchers (e.g. a <sol-button> toolbar
    // control). A child is an action — not a tab — when it's NOT an `<a href>`
    // tab anchor; `slot="actions"` stays as an explicit escape hatch (e.g. to
    // mark an <a> as an action, or force the classification). They're detached
    // so they survive the innerHTML reset; _renderBar re-homes them onto the bar
    // (right side). Unlike the per-tab `.sol-tabs-actions` row — which switchTab
    // clears on every switch — these persist across tabs. An inline <sol-button>
    // is auto-wired to this tabs' content area (no `for=` needed).
    this._launchers = Array.from(this.children).filter(
      (el) => el.matches('[slot="actions"]') || !el.matches('a[href]'));
    for (const el of this._launchers) { el.remove(); this._wireInlineAction(el); }

    this.innerHTML = `
      <div class="sol-tabs-bar" role="tablist"></div>
      <div class="sol-tabs-actions"></div>
      <div class="sol-tabs-content"></div>`;
    this._rendered = true;

    // Default actions slot sits between the bar and the content. Tabs
    // that want toolbar buttons (save / zoom / settings / help, etc.)
    // can append into actionsEl. Callers may still override via
    // `tabsEl.actionsEl = someExternalEl` before switchTab.
    if (!this._actionsEl) {
      this._actionsEl = this.querySelector(':scope > .sol-tabs-actions');
    }

    if (fromRdf) {
      this._loadFromRdf(fromRdf);
    } else {
      if (declared?.length) {
        this._tabs = declared;
      }
      this._renderBar();

      if (declared?.length) this._activateInitial();
    }

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  // Fetch a ui:Menu RDF document and render its parts as tabs. This is the
  // exact shape <sol-menu> consumes — ui:parts of ui:Link / ui:Component
  // with ui:label / ui:href / ui:contents / ui:name — so a single RDF
  // document can drive either element. A nested ui:Menu becomes a tab whose
  // body holds a slimmer <sol-tabs variant="sub"> strip of its children.
  async _loadFromRdf(uri) {
    try {
      const result = await loadMenuFromUri(uri, document.baseURI);
      if (!result) return;
      if (result.orientation && !this.hasAttribute('orientation')) {
        this.setAttribute('orientation', result.orientation);
      }
      this._tabs = this._wrapRdfItems(result.items);
      this._renderBar();
      if (this._tabs.length) this._activateInitial();
    } catch (err) {
      console.error('<sol-tabs> from-rdf load failed:', err);
      this.dispatchEvent(new CustomEvent('sol-error', {
        bubbles: true, composed: true,
        detail: { source: 'sol-tabs', kind: 'rdf-load', uri, message: err.message },
      }));
    }
  }

  // Wrap the plain item descriptions from core/menu-rdf.js with render
  // closures. Leaf links/components use the shared factory in
  // core/rdf-render.js; a nested ui:Menu becomes a tab whose body is a
  // <sol-tabs variant="sub"> holding the group's own children.
  _wrapRdfItems(descriptions) {
    const ctx = {
      host: this, baseUrl: import.meta.url,
      sourceName: 'sol-tabs', embedClass: 'sol-tab-embed',
    };
    return descriptions.map(desc => {
      if (desc.type === 'submenu') {
        const children = this._wrapRdfItems(desc.children);
        return {
          name: desc.name,
          id: desc.id,
          render: (body) => {
            const sub = document.createElement('sol-tabs');
            sub.setAttribute('variant', 'sub');
            sub.tabs = children;
            body.appendChild(sub);
            if (children.length) sub.switchTab(children[0].name);
          },
        };
      }
      if (desc.type === 'component') {
        // Command items (ui:name is a registry key, not a tag) are a menu
        // affordance, not content — a tab can't "run" something. Skip them.
        if (isCommandName(desc.tag)) return null;
        return { name: desc.name, id: desc.id, render: renderComponentItem(desc, ctx) };
      }
      return { name: desc.name, id: desc.id, render: renderLinkItem(desc, ctx) };
    }).filter(Boolean);
  }

  // Parse <a href="url" [handler="tag"] [attr=val ...]>Label</a> children
  // into tab descriptors. Each tab's render() creates the component named
  // by the anchor's `handler` attribute (falling back to the sol-tabs-level
  // `handler` attribute, finally to <sol-include>). The href is passed to
  // the created element as both `source` and `endpoint` so components that
  // use either convention (sol-include / sol-live-edit use source, sol-query
  // uses endpoint) pick it up. All other anchor attributes are forwarded.
  // Auto-wire an inline action launcher (<sol-button inline>) to this tabs'
  // content area, so the author needn't repeat a `for=` selector. No-op when it
  // already has `for=` or isn't an inline sol-button.
  _wireInlineAction(el) {
    if (!el.tagName || el.tagName.toLowerCase() !== 'sol-button') return;
    if (!el.hasAttribute('inline') || el.hasAttribute('for')) return;
    if (!this.id) this.id = `sol-tabs-${++_solTabsUid}`;
    el.setAttribute('for', `#${this.id} > .sol-tabs-content`);
  }

  _harvestAnchors() {
    // Anchors marked slot="actions" are launchers, not tabs — skip them here.
    const anchors = Array.from(this.querySelectorAll(':scope > a[href]:not([slot="actions"])'));
    if (!anchors.length) return [];
    // `handler` may be written plain or as `data-handler` (the latter keeps a
    // standard <a> HTML-valid). Same for the forwarded attributes below.
    const parentHandler = (this.getAttribute('data-handler') || this.getAttribute('handler') || '').trim();
    const SKIP = new Set(['href', 'handler', 'data-handler', 'data-tab-id', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy']);
    return anchors.map((a, i) => {
      const label = (a.textContent || '').trim() || `Tab ${i + 1}`;
      const url = a.getAttribute('href');
      const handlerTag = (a.getAttribute('data-handler') || a.getAttribute('handler') || parentHandler || 'sol-include').trim();
      return {
        name: label,
        // The tab id (→ button data-tab-id, for styling/selection) can be set
        // explicitly with data-tab-id, independent of the anchor's id — the
        // latter is forwarded to become the content element's id.
        id: a.dataset.tabId || a.id || undefined,
        render: (body) => {
          ensureHandler(handlerTag, this, import.meta.url, 'sol-tabs');
          const el = document.createElement(handlerTag);
          el.setAttribute('source', url);
          el.setAttribute('endpoint', url);
          for (const attr of a.attributes) {
            if (SKIP.has(attr.name)) continue;
            // `data-*` author attributes forward with the prefix stripped, so a
            // standard <a> stays HTML-valid: data-src → src, data-view → view.
            const name = attr.name.startsWith('data-') ? attr.name.slice(5) : attr.name;
            el.setAttribute(name, attr.value);
          }
          el.classList.add('sol-tab-embed');
          body.appendChild(el);
        },
      };
    });
  }

  get tabs() { return this._tabs; }
  set tabs(arr) {
    this._tabs = arr || [];
    if (this._rendered) this._renderBar();
  }

  get footerEl() { return this._footerEl; }
  set footerEl(el) { this._footerEl = el; }

  get actionsEl() { return this._actionsEl; }
  set actionsEl(el) { this._actionsEl = el; }

  get activeTab() { return this._active; }
  get body() { return this.querySelector(':scope > .sol-tabs-content'); }

  _renderBar() {
    const bar = this.querySelector(':scope > .sol-tabs-bar');
    if (!bar) return;
    bar.innerHTML = '';
    this._btns = {};
    const launchers = this._launchers || [];
    // Hide the bar only when there's nothing to show — a lone tab AND no
    // page-level launchers. Launchers alone keep the bar visible.
    if (this._tabs.length <= 1 && !launchers.length) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    this._tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.textContent = tab.name;
      if (tab.id) btn.dataset.tabId = tab.id;
      btn.onclick = () => this.switchTab(tab.name);
      bar.appendChild(btn);
      this._btns[tab.name] = btn;
    });
    // Page-level action launchers, grouped on the right of the bar. Re-appended
    // on every bar render (so they survive a tabs reload); persist across switches.
    if (launchers.length) {
      const group = document.createElement('span');
      group.className = 'sol-tabs-launch';
      for (const el of launchers) group.appendChild(el);
      bar.appendChild(group);
    }
  }

  // Render every tab once (keep-alive) then show the first, else just
  // show the first (lazy default path).
  _activateInitial() {
    if (!this._tabs.length) return;
    if (this._keepAlive) {
      this.body.innerHTML = '';   // drop any panes from a prior load (reload)
      for (const t of this._tabs) this._ensurePane(t);
    }
    this.switchTab(this._tabs[0].name);
  }

  // Build (once) a persistent pane for a tab and render its content into it.
  _ensurePane(tab) {
    if (tab._pane) return tab._pane;
    const pane = document.createElement('div');
    pane.className = 'sol-tabs-pane';
    if (tab.id) pane.dataset.tabId = tab.id;
    pane.dataset.tabName = tab.name;
    pane.hidden = true;
    this.body.appendChild(pane);
    tab._pane = pane;
    tab.render(pane, this._footerEl, this._actionsEl);
    return pane;
  }

  switchTab(name) {
    const tab = this._tabs.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (!tab) return;
    this._active = tab.name;

    Object.values(this._btns).forEach(b => b.classList.remove('active'));
    if (this._btns[tab.name]) this._btns[tab.name].classList.add('active');

    if (this._keepAlive) {
      // No teardown: ensure this tab's pane exists, then park the others.
      this._ensurePane(tab);
      for (const t of this._tabs) if (t._pane) t._pane.hidden = (t !== tab);
    } else {
      if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }

      const body = this.body;
      body.innerHTML = '';
      body.style.padding = ''; body.style.overflow = ''; body.style.height = '';
      if (this._footerEl)  this._footerEl.innerHTML = '';
      if (this._actionsEl) this._actionsEl.innerHTML = '';

      const cleanup = tab.render(body, this._footerEl, this._actionsEl);
      if (typeof cleanup === 'function') this._cleanup = cleanup;
    }

    this.dispatchEvent(new CustomEvent('sol-tab-change', {
      bubbles: true, composed: true, detail: { name: tab.name },
    }));
  }

  /**
   * Re-read `from-rdf` and rebuild the tab bar. Public hook used by
   * external editors (e.g. dk-settings) after the tabs TTL changes.
   * Tabs declared via light-DOM anchors have no source to re-read;
   * reload is a no-op in that case.
   */
  async reload() {
    const uri = this.getAttribute('from-rdf');
    if (uri) await this._loadFromRdf(uri);
  }

  disconnectedCallback() {
    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
  }
}

define('sol-tabs', SolTabs);
export { SolTabs };
export default SolTabs;
