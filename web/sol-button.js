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
 * Events:
 *   sol-button-activate — detail: { name, handler, wrapper }
 *
 * The trigger button is exposed as `::part(trigger)` for external
 * styling, matching sol-modal's pattern.
 */

import { define } from '../core/define.js';
import { ensureHandler } from '../core/rdf-render.js';
import { displayItem, isExternal } from '../core/display-target.js';

const RESERVED = new Set(['handler', 'region', 'name', 'replace', 'class', 'style']);

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

  _activate() {
    const href = this.getAttribute('source') || null;
    const explicit = this.getAttribute('handler');
    const ensure = (t) => ensureHandler(t, this, import.meta.url, 'sol-button');

    // Forward every non-reserved attribute through to the handler.
    const attrs = [];
    for (const a of this.attributes) {
      if (RESERVED.has(a.name)) continue;
      if (a.name.startsWith('aria-')) continue;
      attrs.push([a.name, a.value]);
    }

    // Content element: explicit handler wins; else infer from origin
    // (same-origin → trusted sol-include, external → iframe).
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
}

define('sol-button', SolButton);
export { SolButton };
export default SolButton;
