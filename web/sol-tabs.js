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
 * render lazily on first switch. Set `data-handler="sol-*"` on the anchor (or
 * on <sol-tabs> as a default) to wrap the URL in that component; otherwise
 * <sol-include> is used. The href is forwarded as both `source` and
 * `endpoint`, and all other anchor attributes pass through — so e.g.
 * `wanted="? ? ?"` on an anchor with `data-handler="sol-query"` just works.
 *
 * The picker and the forwarded attributes are written `data-*` so a standard
 * <a> stays HTML-valid; the `data-` prefix is stripped when forwarding
 * (`data-handler` picks the tag, `data-src` → `src`, `data-view` → `view`, …).
 *
 *   <sol-tabs>
 *     <a href="notes.md">Notes</a>
 *     <a href="data.ttl" data-handler="sol-query" wanted="? ? ?">Table</a>
 *     <a href="lib.ttl" data-handler="ia-player" data-src="lib.ttl">Music</a>
 *   </sol-tabs>
 *
 *   <sol-tabs data-handler="sol-live-edit">
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
 *     <sol-button inline data-handler="sol-include" source="help.html">?</sol-button>
 *   </sol-tabs>
 *
 * RDF usage (opt-in): point `from-rdf` at a ui:Menu document — the same RDF
 * shape <sol-menu> consumes. Each ui:Link / ui:Component part becomes a tab; a
 * nested ui:Menu becomes a tab whose content is a slimmer
 * <sol-tabs variant="sub"> strip of that group's children. `from-rdf` is inert
 * until the `web/menu-from-rdf.js` add-on is imported (the lone rdflib pull —
 * it keeps the declarative path dependency-free); without it this element stays
 * declarative-only and waits for the add-on if one arrives later.
 *
 *   import 'sol-components/menu-from-rdf.js';   // activation
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
import { registerMenuConsumer } from '../core/menu-consumer.js';
import { loadMenuInto } from '../core/menu-load.js';
import { renderComponentItem, renderLinkItem, ensureHandler, isCommandName, dispatchCommand, paramsToObject } from '../core/rdf-render.js';
import { renderIcon } from '../core/utils.js';
import { tabSig, ensurePane, activateInitial, applyMenuItems } from '../core/menu-panes.js';
import { coarseMql, isCoarsePointer, renderNavSheet, removeSheet, syncNav } from '../core/nav-sheet.js';
import { extractTab, extractSubmenu } from '../core/menu-html.js';
import './sol-sheet.js';   // the shared bottom-sheet surface the phone nav slots into

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

  // `from-rdf` rendering is an opt-in capability: importing `web/menu-from-rdf.js`
  // installs the rdflib-backed loader here. Null → this component is declarative-
  // only and carries no rdflib (see core/menu-consumer.js).
  static fromRdfLoader = null;

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
      (el) => el.matches('[slot="actions"]') || !el.matches('a[href], submenu'));
    for (const el of this._launchers) { el.remove(); this._wireInlineAction(el); }

    this.innerHTML = `
      <div class="sol-tabs-bar" role="tablist"></div>
      <div class="sol-tabs-actions"></div>
      <div class="sol-tabs-content"></div>`;
    this._rendered = true;

    // The content region IS the tabpanel — one reused panel, relabelled as the
    // active tab changes (correct whether or not keep-alive parks per-tab panes
    // inside it). Every tab's aria-controls points here.
    const contentEl = this.body;
    contentEl.setAttribute('role', 'tabpanel');
    contentEl.setAttribute('tabindex', '0');
    if (!contentEl.id) contentEl.id = `sol-tabpanel-${++_solTabsUid}`;
    this._panelId = contentEl.id;

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

    // Re-render the bar when the pointer type flips (fine ↔ coarse) so the
    // <select> navigator appears/disappears — chiefly for DevTools device
    // emulation; on a real device it fires once at most. Wired once.
    const mql = this._coarseMql();
    if (mql && !this._mqlWired) {
      this._mqlWired = true;
      this._onPointerFlip = () => this._renderBar();
      mql.addEventListener?.('change', this._onPointerFlip);
    }
  }

  // Fetch a ui:Menu RDF document and render its members as tabs. This is the
  // exact shape <sol-menu> consumes — schema:itemListElement membership of
  // ui:Link / ui:Component members with ui:label / schema:url / ui:contents —
  // so a single RDF document can drive either element. A nested ui:Menu
  // becomes a tab whose body holds a slimmer <sol-tabs variant="sub"> strip
  // of its children.
  async _loadFromRdf(uri) {
    await loadMenuInto(this, uri, {
      sourceName: 'sol-tabs',
      apply: (result) => {
        // A part marked slot="actions" is a toolbar launcher, not a tab — build it
        // as an element on the bar's action row (mirrors the inline non-anchor
        // launchers). In RDF mode these REPLACE any inline launchers (the
        // completeness principle: everything comes from RDF).
        const isAction = (d) => d.type === 'component'
          && (d.params || []).some(([k, v]) => k === 'slot' && v === 'actions');
        const items = result.items || [];
        const actionItems = items.filter(isAction);
        this._tabs = this._wrapRdfItems(items.filter((d) => !isAction(d)));
        if (actionItems.length) {
          this._launchers = actionItems.map((d) => this._buildLauncher(d));
          for (const el of this._launchers) this._wireInlineAction(el);
        }
        this._renderBar();
        if (this._tabs.length) this._activateInitial();
      },
    });
  }

  // Build a toolbar launcher element from an RDF action descriptor (tag =
  // tag, ui:label → text, schema:additionalProperty → attributes; the slot="actions" marker
  // is dropped). Mirrors an inline non-anchor launcher.
  _buildLauncher(desc) {
    // A link part has no component tag — render it as a bar button that opens
    // its href like the help button (an inline overlay in the tab content),
    // but KEEP-ALIVE: the embed mounts once and toggles hidden/shown, so its
    // state survives (help rebuilds each toggle; this preserves it).
    if (desc.type === 'link' && desc.href) return this._buildLinkLauncher(desc);
    const el = document.createElement(desc.tag);
    if (desc.region) el.setAttribute('region', desc.region);
    for (const [k, v] of desc.params || []) {
      if (k === 'slot' && v === 'actions') continue;
      el.setAttribute(k, v);
    }
    // Every launcher gets a hover tooltip — keep an explicit title= param, else
    // fall back to the plugin's name (icon-only buttons need it most).
    if (!el.hasAttribute('title') && desc.name) el.setAttribute('title', desc.name);
    // Only a button carries its label as text (?, A, 🌙); search / login /
    // dropdown render themselves, so a text node would show as a bare word.
    // A `label` attribute overrides the display text — the same convention
    // sol-dropdown-button already honors (the ☰), so a ui:Plugin entry whose
    // ui:label is the card title can still show e.g. "📅" on the bar.
    if (desc.tag === 'sol-button') {
      const labelParam = (desc.params || []).find(([k]) => k === 'label')?.[1];
      const text = labelParam || desc.name;
      if (text) el.textContent = text;
    }
    return el;
  }

  // A link launcher: an icon button on the bar. Its favicon shows as the icon
  // (a URL/data: ui:icon paints as <img>; an emoji paints as text — the same
  // split sol-plugin-manager makes for its catalog cards). Clicking opens the
  // href with window.open: in the desktop app main's setWindowOpenHandler
  // routes that into a NATIVE reader view (no iframe — so cross-origin sites
  // that block framing still load); in a browser it's a normal new tab. This
  // mirrors what a ui:region ui:Tab launcher does (display-target's 'tab' case).
  _buildLinkLauncher(desc) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sol-bar-link';
    const title = desc.name || desc.href;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    const icon = desc.icon || '';
    if (/^(?:https?:\/\/|data:|\.{0,2}\/)/.test(icon)) {
      const img = document.createElement('img');
      img.src = icon; img.alt = '';
      btn.appendChild(img);
    } else {
      btn.textContent = icon || desc.name || '🔗';
    }
    btn.addEventListener('click', () => { if (desc.href) window.open(desc.href, '_blank'); });
    return btn;
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
      const sig = tabSig(desc);
      if (desc.type === 'submenu') {
        const children = this._wrapRdfItems(desc.children);
        return {
          name: desc.name,
          id: desc.id,
          icon: desc.icon,
          sig,
          // A from-rdf submenu renders as a dropdown launcher on the bar (see
          // _buildSubmenuDropdown) — the in-pane render is the fallback used
          // when the dropdown path is unavailable (no from-rdf / no loader).
          isSubmenu: true,
          // The wrapped child descriptors are kept on the tab so the mobile
          // select navigator (_renderSelect) can list a submenu's leaves as an
          // <optgroup> — the bar dropdown loads them too, from the same RDF.
          children,
          render: (body) => this._renderSubmenu(body, desc.children, children, desc.name),
        };
      }
      if (desc.type === 'component') {
        // A command part (its key is a registry key, not a tag) renders by
        // dispatching sol-command; the app's handler may render output into this
        // tab's pane (its region). Fire-and-forget commands leave the pane empty.
        if (isCommandName(desc.tag)) {
          return {
            name: desc.name, id: desc.id, icon: desc.icon, sig, type: desc.type,
            render: (body) => dispatchCommand(this, desc.tag, paramsToObject(desc.params), { id: desc.id, fallbackEl: body }),
          };
        }
        return { name: desc.name, id: desc.id, icon: desc.icon, sig, type: desc.type, render: renderComponentItem(desc, ctx) };
      }
      // A link leaf carries its href/type so the mobile navigator can open it
      // externally (into the dismissible overlay) rather than switching to an
      // empty submenu pane — see _navigateTo.
      return { name: desc.name, id: desc.id, icon: desc.icon, sig, type: desc.type, href: desc.href, render: renderLinkItem(desc, ctx) };
    }).filter(Boolean);
  }

  // Parse <a href="url" [data-handler="tag"] [data-attr=val ...]>Label</a> children
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
    // A <submenu> child (a <label> + its own <a> anchors) is a tab whose pane
    // is a nested sub-tabset of ALL its items — same as a from-rdf submenu.
    const nodes = Array.from(this.querySelectorAll(':scope > a[href]:not([slot="actions"]), :scope > submenu'));
    if (!nodes.length) return [];
    // The picker is `data-handler` (keeps a standard <a> HTML-valid); the
    // `data-` prefix is stripped from the forwarded attributes below.
    const parentHandler = (this.getAttribute('data-handler') || '').trim();
    const SKIP = new Set(['href', 'data-handler', 'data-tab-id', 'target', 'rel', 'download', 'hreflang', 'type', 'referrerpolicy']);
    const linkCtx = {
      host: this, baseUrl: import.meta.url,
      sourceName: 'sol-tabs', embedClass: 'sol-tab-embed',
    };
    const anchorTab = (a, i) => {
      const label = (a.textContent || '').trim() || `Tab ${i + 1}`;
      const url = a.getAttribute('href');
      // A LINK tab — emitTab's no-data-handler, target/region-marked anchor
      // (the HTML spelling of a ui:Link). Rendered through the same
      // renderLinkItem as the from-rdf path, so a links submenu behaves
      // identically whichever side it loaded from.
      if (!a.getAttribute('data-handler') && (a.hasAttribute('target') || a.hasAttribute('region'))) {
        const item = extractTab(a);
        return {
          name: item.name || label,
          id: a.dataset.tabId || a.id || undefined,
          sig: tabSig(item),
          render: renderLinkItem(item, linkCtx),
        };
      }
      const handlerTag = (a.getAttribute('data-handler') || parentHandler || 'sol-include').trim();
      return {
        name: label,
        // The tab id (→ button data-tab-id, for styling/selection) can be set
        // explicitly with data-tab-id, independent of the anchor's id — the
        // latter is forwarded to become the content element's id.
        id: a.dataset.tabId || a.id || undefined,
        // Same normalization as the RDF side, so applyTabs can tell an
        // unchanged tab (keep its pane) from an edited one (re-render).
        sig: tabSig(extractTab(a)),
        render: (body) => {
          // A bare handler (no hyphen, not an element) is a command, not a
          // component: dispatch sol-command and let the app render output into
          // this pane (its region). The forwarded attrs become the params.
          if (isCommandName(handlerTag)) {
            const params = {};
            if (url != null) params.href = url;
            for (const attr of a.attributes) {
              if (SKIP.has(attr.name)) continue;
              const name = attr.name.startsWith('data-') ? attr.name.slice(5) : attr.name;
              params[name] = attr.value;
            }
            dispatchCommand(this, handlerTag, params, { id: a.id || undefined, fallbackEl: body });
            return;
          }
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
    };
    return nodes.map((node, i) => {
      if (node.tagName.toLowerCase() === 'submenu') {
        const label = (node.querySelector(':scope > label')?.textContent || '').trim() || `Tab ${i + 1}`;
        const children = Array.from(node.querySelectorAll(':scope > a[href]')).map((a, j) => anchorTab(a, j));
        const extracted = extractSubmenu(node);   // same anchors, same order
        return {
          name: label,
          id: node.id || undefined,
          sig: tabSig(extracted),
          render: (body) => this._renderSubmenu(body, extracted.children, children, label),
        };
      }
      return anchorTab(node, i);
    });
  }

  // HYBRID submenu pane: a submenu of ONLY components (a multi-plugin tab)
  // stacks them all in the pane; a submenu containing any LINK is
  // navigation — it renders as the nested <sol-tabs variant="sub"> strip
  // (the original submenu rendering, restored verbatim from before the
  // stack change): one child at a time, lazily, links embedding in the
  // pane through renderLinkItem like any other tab content.
  //
  // THE ARTIFACT RULE (same as the builder's chips): a menu item that calls
  // a submenu is NOT also an item on that submenu — a child whose name
  // repeats the submenu's own name is the conversion artifact (the item's
  // pre-submenu assignment carried along) and is never rendered.
  //
  // `descs` are the plain item descriptions, `children` the same items
  // wrapped with render closures (1:1, same order); `parentName` is the
  // submenu tab's own name.
  _renderSubmenu(body, descs, children, parentName) {
    const own = (parentName || '').trim();
    const kept = (descs || [])
      .map((d, i) => ({ d, w: children[i] }))
      .filter(({ d, w }) => w && ((d.name || '').trim() !== own));
    if (!kept.length) return;
    if (!kept.some(({ d }) => d.type === 'link')) {
      return this._renderStack(body, kept.map(({ w }) => w));
    }
    const sub = document.createElement('sol-tabs');
    sub.setAttribute('variant', 'sub');
    // A nested navigation strip is not a user setting — keep its menu editor
    // out of <sol-settings>' collected panels.
    sub.setAttribute('data-settings-skip', '');
    sub.tabs = kept.map(({ w }) => w);
    body.appendChild(sub);
    sub.switchTab(kept[0].w.name);
  }

  // A multi-plugin tab shows ALL its plugins together in the pane — each in
  // its own slot (so keep-alive mounting can't park a sibling), stacked the
  // way a single plugin fills the pane. Nothing to pick; everything is live.
  _renderStack(body, children) {
    body.classList.add('sol-tabs-stack');
    for (const child of children) {
      const slot = document.createElement('div');
      slot.className = 'sol-tabs-stack-item';
      if (child?.name) slot.dataset.tabName = child.name;   // so the mobile select can scroll to a leaf
      body.appendChild(slot);
      child.render(slot);
    }
  }

  get tabs() { return this._tabs; }
  set tabs(arr) {
    this._tabs = arr || [];
    if (this._rendered) this._renderBar();
  }

  // Alias for the generic name the other menu components expose (sol-menu's
  // .items), so a consumer probing either element reads the same property.
  get items() { return this._tabs; }
  set items(arr) { this.tabs = arr; }

  get footerEl() { return this._footerEl; }
  set footerEl(el) { this._footerEl = el; }

  get actionsEl() { return this._actionsEl; }
  set actionsEl(el) { this._actionsEl = el; }

  get activeTab() { return this._active; }
  get body() { return this.querySelector(':scope > .sol-tabs-content'); }

  // The menu document URL behind `from-rdf`, without its #fragment — the base
  // for a submenu's own subject IRI (doc#SubmenuId), used as a dropdown source.
  _menuDocUrl() {
    const v = this.getAttribute('from-rdf') || '';
    return v ? v.split('#')[0] : '';
  }

  // A from-rdf submenu can render as a bar dropdown when we can address its
  // subject (the menu doc URL) and the menu-from-rdf loader is active.
  _canDropdown() {
    return !!this._menuDocUrl() && !!this.constructor.fromRdfLoader;
  }

  // Build a <sol-dropdown-button> for a submenu tab. It loads the submenu's own
  // subject (doc#id) — the same ui:Menu shape the ☰ menu uses — and renders its
  // items as a vertical dropdown. `region="#paneId"` routes a picked item into
  // THIS tab's pane (a keep-alive pane like any other tab's); component-mount's
  // pruneSiblings then makes repeated picks switch within the pane. On a pick we
  // surface that pane by switching to this tab.
  _buildSubmenuDropdown(tab, i) {
    if (!this.id) this.id = `sol-tabs-${++_solTabsUid}`;
    const paneId = `${this.id}__sub__${tab.id || i}`;
    tab._paneId = paneId;
    tab.render = () => {};                 // the pane is filled by the dropdown's picks
    // The pane (region= target) is created by _activateInitial/_ensurePane in
    // keep-alive mode — which dk uses — so #paneId resolves before any pick.
    ensureHandler('sol-dropdown-button', this, import.meta.url, 'sol-tabs');
    const dd = document.createElement('sol-dropdown-button');
    dd.setAttribute('label', `${tab.name} ▾`);   // name + ▾ affordance
    dd.setAttribute('title', tab.name);
    dd.setAttribute('source', `${this._menuDocUrl()}#${tab.id}`);
    dd.setAttribute('region', `#${paneId}`);
    // Mirror the old nested-strip: a submenu launcher is not a user setting —
    // keep its menu editor out of <sol-settings>' collected panels.
    dd.setAttribute('data-settings-skip', '');
    dd.classList.add('sol-tabs-submenu');
    if (tab.id) dd.dataset.tabId = tab.id;
    dd.addEventListener('sol-menu-change', () => this.switchTab(tab.name));
    this._btns[tab.name] = dd;             // switchTab toggles .active on it
    return dd;
  }

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
    this._tabs.forEach((tab, i) => {
      // A submenu tab is a dropdown launcher on the bar (the ☰-menu pattern),
      // not a plain tab button — its items drop down vertically and mount into
      // this tab's own pane. Needs from-rdf (for the submenu's subject IRI) and
      // the menu-from-rdf loader; otherwise it falls back to a plain button
      // whose pane renders the submenu inline.
      if (tab.isSubmenu && tab.id && this._canDropdown()) {
        bar.appendChild(this._buildSubmenuDropdown(tab, i));
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      if (!tab._tabBtnId) tab._tabBtnId = `sol-tab-${++_solTabsUid}`;
      btn.id = tab._tabBtnId;
      btn.dataset.tabName = tab.name;           // reverse lookup for keyboard nav
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', '-1');       // roving: only the active tab is tabbable
      if (this._panelId) btn.setAttribute('aria-controls', this._panelId);
      // ui:icon paints before the name — a URL as <img>, an emoji as text
      // (renderIcon), same treatment sol-menu gives its items.
      if (tab.icon) {
        btn.appendChild(renderIcon(tab.icon, 'sol-tab-icon'));
        btn.appendChild(document.createTextNode(tab.name));
      } else {
        btn.textContent = tab.name;
      }
      btn.title = tab.name;   // hover tooltip (and the full name when a tab label is truncated)
      if (tab.id) btn.dataset.tabId = tab.id;
      btn.onclick = () => this.switchTab(tab.name);
      btn.addEventListener('keydown', (e) => this._onTabKey(e, btn));
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

    // Re-assert the active tab's state onto the freshly-built buttons: a bar
    // re-render creates new elements that would otherwise lose the .active class,
    // aria-selected, and the roving tabindex=0 (switchTab isn't always re-called).
    const ab = this._active && this._btns[this._active];
    if (ab) {
      ab.classList.add('active');
      if (ab.getAttribute('role') === 'tab') { ab.setAttribute('aria-selected', 'true'); ab.setAttribute('tabindex', '0'); }
      if (ab.id) this.body?.setAttribute('aria-labelledby', ab.id);
    }

    // Touch/coarse-pointer devices (phones): collapse the whole strip into a
    // full-width trigger that opens a bottom SHEET — a themed, room-coloured list
    // (submenus as sections, leaves as rows), far better looking and more
    // touch-ergonomic than the OS <select> picker. The buttons / dropdowns /
    // launchers above stay in the DOM (CSS hides them) so the sheet drives them;
    // on a fine-pointer (desktop / Electron) device nothing is built, so the DOM
    // is byte-identical to before.
    if (this._isCoarsePointer()) this._renderNavSheet(bar);
    else this._removeSheet();   // a flip back to fine pointer drops the body-mounted sheet
  }

  // The phone navigator (trigger + bottom sheet) — shared machinery in
  // core/nav-sheet.js, keyed to this element's class prefix and state.
  _coarseMql() { return coarseMql(this); }
  _isCoarsePointer() { return isCoarsePointer(this); }
  _renderNavSheet(bar) { renderNavSheet(this, bar); }
  _removeSheet() { removeSheet(this); }
  _syncNav() { syncNav(this); }

  /**
   * Name a non-room screen on the phone navigator trigger (e.g. the host
   * opened Settings from its own menu, outside the tab set). The override
   * sticks until the next switchTab, which returns the trigger to the
   * active room's name. Pass a falsy value to clear it explicitly.
   * No-op on desktop (no navigator trigger).
   * @param {string|null} text - label to show on the trigger
   */
  setNavLabel(text) {
    this._navLabelOverride = text || null;
    this._syncNav();
  }

  // Keep-alive pane lifecycle — shared machinery in core/menu-panes.js.
  _activateInitial() { activateInitial(this); }
  _ensurePane(tab) { return ensurePane(this, tab); }

  // Arrow-key navigation across the tablist (ARIA tab pattern, automatic
  // activation): Left/Up ↔ Right/Down move to the adjacent tab, Home/End to the
  // ends. Enter/Space activate natively (the tabs are real <button>s). Only plain
  // role="tab" buttons participate; submenu dropdowns keep their own key handling.
  _onTabKey(e, btn) {
    const tabs = Array.from(btn.parentNode.querySelectorAll('[role="tab"]'));
    const i = tabs.indexOf(btn);
    if (i < 0) return;
    let j;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    else return;
    e.preventDefault();
    const next = tabs[j];
    this.switchTab(next.dataset.tabName);   // select — updates aria-selected + roving tabindex
    next.focus();
  }

  switchTab(name, { silent = false } = {}) {
    const tab = this._tabs.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (!tab) return;
    this._active = tab.name;

    Object.values(this._btns).forEach(b => {
      b.classList.remove('active');
      if (b.getAttribute('role') === 'tab') { b.setAttribute('aria-selected', 'false'); b.setAttribute('tabindex', '-1'); }
    });
    const activeBtn = this._btns[tab.name];
    if (activeBtn) {
      activeBtn.classList.add('active');
      if (activeBtn.getAttribute('role') === 'tab') { activeBtn.setAttribute('aria-selected', 'true'); activeBtn.setAttribute('tabindex', '0'); }
    }
    // Relabel the single content tabpanel to name the active tab.
    if (activeBtn?.id) this.body?.setAttribute('aria-labelledby', activeBtn.id);

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

    // `silent` = a programmatic refresh (applyTabs re-asserting the SAME
    // active tab after a live update) — listeners must not mistake it for
    // the user picking a tab (e.g. the host would dismiss its menu pane).
    // Keep the mobile navigator in step when the active tab changes by any path.
    // A switch TO a top-level tab clears any remembered submenu leaf; a leaf pick
    // re-sets _navKey in _navigateTo right after this runs.
    if (this._navTrigger) {
      // Any real tab navigation supersedes a host-set non-tab label
      // (setNavLabel) — the trigger goes back to naming the active room.
      this._navLabelOverride = null;
      if (this._navItems?.some((i) => i.meta.kind === 'tab' && i.meta.name === tab.name)) {
        this._navKey = `t:${tab.name}`;
      } else if (!(this._navKey || '').startsWith(`c:${tab.name}`)) {
        // Switched to a submenu parent by some path OTHER than a known leaf pick
        // (e.g. a restore) — drop the stale key so the trigger shows the parent's
        // own name, not a leftover room.
        this._navKey = null;
      }
      this._syncNav();
    }

    if (!silent) {
      this.dispatchEvent(new CustomEvent('sol-tab-change', {
        bubbles: true, composed: true, detail: { name: tab.name },
      }));
    }
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

  /**
   * Merge an updated set of tabs (the plain item descriptions from
   * core/menu-rdf.js `parseMenuItems`) into the live tab bar IN PLACE, without
   * tearing down the element. Existing tabs are matched by id (falling back to
   * name); a matched tab whose DEFINITION is unchanged (same tabSig — only the
   * label may differ) is REUSED so its keep-alive pane survives, while an
   * edited one is re-rendered from its new definition (its stale pane is
   * dropped). New tabs are added and removed tabs have their pane dropped. The
   * launchers (bar/chrome) and this element's event listeners are untouched.
   * Used by an external editor — dk's Customize save — to reflect a tabs-RDF
   * change immediately, the surgical alternative to a full reload.
   *
   * @param {object[]} items  parseMenuItems output for the tab menu (#Tabs)
   */
  applyTabs(items) { applyMenuItems(this, items); }

  /**
   * Rebuild the page-level launchers from `items` (parseMenuItems output for a
   * bar/actions menu) IN PLACE, KEEPING any existing launcher the `keep`
   * predicate matches (e.g. dk's chrome) rather than re-creating it — so a bar
   * edit doesn't disturb chrome state (re-init a sol-login, reload the ☰ menu).
   * Fresh launchers go first, kept ones after (bar, then chrome). The surgical
   * alternative to a reload for a #Bar change.
   *
   * @param {object[]} items             parseMenuItems output for the bar menu
   * @param {(el:Element)=>boolean} keep predicate marking launchers to preserve
   */
  applyLaunchers(items, keep = () => false) {
    const kept = (this._launchers || []).filter(keep);
    const fresh = (items || []).map((d) => this._buildLauncher(d));
    for (const el of fresh) this._wireInlineAction(el);
    this._launchers = [...fresh, ...kept];
    if (this._rendered) this._renderBar();
  }

  disconnectedCallback() {
    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
    this._removeSheet();   // the sheet lives on <body>, so detach it with the element
  }
}

define('sol-tabs', SolTabs);
registerMenuConsumer(SolTabs);
export { SolTabs };
export default SolTabs;
