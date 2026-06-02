/**
 * <sol-button> — declarative launcher.
 *
 * Renders an HTML button (the slot contents become its label) that, on
 * click, mounts a `<handler source="…" …>` element inside the element
 * identified by `target`. Uses the same `[data-menu-item="<name>"]`
 * wrapper convention sol-menu's ui:Component items use, so a sol-button
 * launcher coexists with menu-driven items in the same display area.
 * Every (target, name) pair is a persistent tab: clicking the button
 * a second time re-shows the existing mount with all its state intact
 * (login sessions, scroll, open panels, in-flight fetches) instead of
 * tearing it down and rebuilding.
 *
 * Reserved attributes (consumed by sol-button itself):
 *   handler  — tag name of the component to mount (optional; when absent,
 *              inferred from `source`: same-origin → sol-include, external
 *              → iframe)
 *   region   — where the content surfaces. A CSS selector (a pane the page
 *              declares) OR a keyword that conjures an ephemeral surface with
 *              no author-placed element: modal | floating | tab | window.
 *              Resolved by cascade — this attribute, else a parent container,
 *              else an enclosing <sol-menu>, else <sol-default>.
 *   inline   — boolean: toggle the content INLINE into a host, non-keep-alive
 *              (see below). The host is resolved through the SAME region cascade
 *              (a parent [region] or <sol-default region="#host">), so the host
 *              can be declared once on <sol-default> rather than on every button.
 *   for      — (inline only) explicit host selector, overriding the cascade;
 *              defaults to the button's own parent when nothing resolves.
 *   name     — wrapper identifier (data-menu-item); defaults to the
 *              element's id if set, otherwise to a slug of source
 *   source   — forwarded to the handler (e.g. sol-include's `source`)
 *   replace  — boolean: rebuild a pane wrapper's contents on every click
 *              instead of reusing them.
 *
 * Every OTHER attribute on sol-button is forwarded as-is to the handler
 * element, so authoring is just like inlining the handler:
 *
 *   <sol-button handler="sol-include" source="pages/settings.html"
 *               target="#dk-content" name="Settings" trusted>
 *     ⚙
 *   </sol-button>
 *
 *   on click → <sol-include source="pages/settings.html" trusted>
 *              gets mounted inside #dk-content > [data-menu-item="Settings"]
 *
 *   <sol-default region="#main"></sol-default>
 *   <sol-button handler="sol-include" inline source="help.html">?</sol-button>
 *
 *   click → toggles <sol-include source="help.html"> inside #main (the host
 *           from the region cascade; a .sol-inline-panel wrapper); click again
 *           removes it. The button gets `open` + aria-expanded while shown.
 *
 * Events:
 *   sol-button-activate — detail: { name, handler, wrapper, open? }
 *     (`open` is present in inline mode: true on show, false on hide)
 *
 * The trigger button is exposed as `::part(trigger)` for external
 * styling, matching sol-modal's pattern.
 */

import { define } from '../core/define.js';
import { ensureHandler } from '../core/rdf-render.js';
import { displayItem, isExternal, resolveRegion } from '../core/display-target.js';

const RESERVED = new Set(['handler', 'region', 'name', 'replace', 'inline', 'for', 'class', 'style']);

class SolButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <button class="sol-btn sol-button-trigger" part="trigger" type="button">
        <slot></slot>
      </button>`;
    const btn = this.shadowRoot.querySelector('.sol-button-trigger');
    const a11y = this.getAttribute('aria-label') || this.getAttribute('title');
    if (a11y) btn.setAttribute('aria-label', a11y);
    const tip = this.getAttribute('title');
    if (tip) btn.setAttribute('title', tip);
    btn.addEventListener('click', () => this._activate());

    // Sync our trigger's active state to the page's current tab so the
    // gear (or any sol-button) lights up while its tab is the visible
    // one, even when activation came from elsewhere.
    this._onTabActivate = (e) => {
      btn.classList.toggle('active', e.detail?.name === this._resolveName());
    };
    document.addEventListener('sol-tab-activate', this._onTabActivate);
  }

  disconnectedCallback() {
    if (this._onTabActivate) {
      document.removeEventListener('sol-tab-activate', this._onTabActivate);
      this._onTabActivate = null;
    }
  }

  _resolveName() {
    return this.getAttribute('name')
        || this.id
        || (this.getAttribute('source') || this.getAttribute('handler') || '').split(/[\/#?]/).filter(Boolean).pop()
        || this.getAttribute('handler');
  }

  /** Compute the content element to mount: explicit `handler` wins; else infer
   *  from the href origin (same-origin → trusted sol-include, external → iframe).
   *  Returns { tag, attrs, href, replace }. */
  _handlerSpec() {
    const href = this.getAttribute('source') || null;
    const explicit = this.getAttribute('handler');
    const attrs = [];
    for (const a of this.attributes) {
      if (RESERVED.has(a.name)) continue;
      if (a.name.startsWith('aria-')) continue;
      attrs.push([a.name, a.value]);
    }
    let tag, replace = this.hasAttribute('replace');
    if (explicit) {
      tag = explicit;
    } else if (href && isExternal(href)) {
      tag = 'iframe';
      attrs.push(['src', href]);
      replace = true;
    } else {
      tag = 'sol-include';
      if (href && !attrs.some(([k]) => k === 'trusted')) attrs.push(['trusted', 'true']);
    }
    return { tag, attrs, href, replace };
  }

  _activate() {
    if (this.hasAttribute('inline')) { this.toggleInline(); return; }

    const { tag, attrs, href, replace } = this._handlerSpec();
    const ensure = (t) => ensureHandler(t, this, import.meta.url, 'sol-button');
    ensure(tag);

    const name = this._resolveName();
    const wrapper = displayItem({
      launcher: this, id: null, name, tag, attrs, href, replace, ensure,
    });
    if (wrapper == null) {
      console.warn('<sol-button>: no region resolved — set region= on the button, a container, <sol-menu>, or <sol-default>.');
    }
    this.dispatchEvent(new CustomEvent('sol-button-activate', {
      bubbles: true, composed: true,
      detail: { name, handler: tag, wrapper },
    }));
  }

  // ── Inline region (region="inline") ─────────────────────────────────────────
  // Toggle the handler INLINE into a page-declared host (`for="<selector>"`,
  // else the button's own parent). Non-keep-alive: the content is built fresh on
  // open and removed on close, so the panel never accumulates state. Open state
  // is reflected as `open` on the host element and aria-expanded on the trigger,
  // so the page can style the trigger (and react via CSS :has()).

  _inlineHost() {
    // Explicit `for` wins; otherwise resolve through the region cascade
    // (a parent [region] or <sol-default region="…">); else the button's parent.
    const sel = this.getAttribute('for');
    if (sel) { try { return document.querySelector(sel); } catch { return null; } }
    const r = resolveRegion(this, this._resolveName());
    return r.kind === 'element' ? r.element : this.parentElement;
  }

  get inlineOpen() { return !!(this._inlinePanel && this._inlinePanel.isConnected); }

  toggleInline() { this.inlineOpen ? this.closeInline() : this.openInline(); }

  openInline() {
    if (this.inlineOpen) return;
    const host = this._inlineHost();
    if (!host) {
      console.warn('<sol-button region="inline">: no host — set for="<selector>" or place the button inside a container.');
      return;
    }
    const { tag, attrs } = this._handlerSpec();
    ensureHandler(tag, this, import.meta.url, 'sol-button');
    const panel = document.createElement('div');
    panel.className = 'sol-inline-panel';
    panel.dataset.solInline = this._resolveName();
    const content = document.createElement(tag);
    for (const [k, v] of attrs) content.setAttribute(k, v);
    panel.appendChild(content);
    host.appendChild(panel);
    this._inlinePanel = panel;
    this._reflectOpen(true);
    this.dispatchEvent(new CustomEvent('sol-button-activate', {
      bubbles: true, composed: true,
      detail: { name: this._resolveName(), handler: tag, wrapper: panel, open: true },
    }));
  }

  closeInline() {
    if (!this.inlineOpen) { this._reflectOpen(false); return; }
    this._inlinePanel.remove();
    this._inlinePanel = null;
    this._reflectOpen(false);
    this.dispatchEvent(new CustomEvent('sol-button-activate', {
      bubbles: true, composed: true,
      detail: { name: this._resolveName(), open: false },
    }));
  }

  /** Public: dismiss the inline panel (e.g. the page closing it on navigation). */
  close() { this.closeInline(); }

  _reflectOpen(open) {
    this.toggleAttribute('open', open);
    const btn = this.shadowRoot.querySelector('.sol-button-trigger');
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('active', open);
    }
  }
}

define('sol-button', SolButton);
export { SolButton };
export default SolButton;
