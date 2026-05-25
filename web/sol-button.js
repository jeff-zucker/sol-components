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
 *   handler  — tag name of the component to mount (required)
 *   target   — CSS selector for the mount container (required)
 *   name     — wrapper identifier (data-menu-item); defaults to the
 *              element's id if set, otherwise to a slug of source
 *   source   — convenience: copied through to the handler as `source`
 *   replace  — boolean: rebuild the wrapper's contents on every click
 *              instead of reusing them. Pair with a shared `name`
 *              (e.g. "external") so several buttons can write into the
 *              same scratch tab.
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
import { mountInTarget } from '../core/component-mount.js';

const RESERVED = new Set(['handler', 'target', 'name', 'replace', 'class', 'style']);

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
    const handler = this.getAttribute('handler');
    const targetSel = this.getAttribute('target');
    if (!handler) {
      console.warn('<sol-button> requires a `handler` attribute (component tag to mount).');
      return;
    }
    if (!targetSel) {
      console.warn('<sol-button> requires a `target` attribute (CSS selector for mount container).');
      return;
    }
    const target = document.querySelector(targetSel);
    if (!target) {
      console.warn(`<sol-button> target "${targetSel}" not found.`);
      return;
    }

    ensureHandler(handler, this, import.meta.url, 'sol-button');

    const name = this._resolveName();
    const replace = this.hasAttribute('replace');

    // Forward every non-reserved attribute through to the handler.
    const attrs = [];
    for (const a of this.attributes) {
      if (RESERVED.has(a.name)) continue;
      if (a.name.startsWith('aria-')) continue;
      attrs.push([a.name, a.value]);
    }

    const wrapper = mountInTarget({ target, name, tag: handler, attrs, replace });
    this.dispatchEvent(new CustomEvent('sol-button-activate', {
      bubbles: true, composed: true,
      detail: { name, handler, wrapper },
    }));
  }
}

define('sol-button', SolButton);
export { SolButton };
export default SolButton;
