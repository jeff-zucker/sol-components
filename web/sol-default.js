/**
 * <sol-default> — Singleton holder for shared programmatic defaults.
 *
 * Place once in the host page; sol-* components consult its
 * attributes as the last fallback for knobs they take (e.g. `proxy`,
 * default issuers list, default endpoint) before reaching for a
 * hard-coded value.
 *
 * Resolution order in each consumer:
 *   1. The component's own HTML attribute
 *   2. The component's RDF source PropertyValue, if applicable
 *   3. This element's matching attribute  (via core/defaults.js getDefault)
 *   4. Hard-coded fallback in the component
 *
 * Reactivity: every attribute change re-dispatches `sol-default-change`
 * (bubbling, composed) with detail `{ name, newValue, oldValue }`. The
 * helper `onDefaultChange` in core/defaults.js wraps that listener.
 *
 * The element renders nothing — it's a configuration record, not UI.
 *
 * Usage:
 *   <sol-default proxy="http://localhost:3002/proxy?uri="></sol-default>
 *
 * @class SolDefault
 * @extends HTMLElement
 * @fires sol-default-change - detail: { name, newValue, oldValue }
 */

import { define } from '../core/define.js';

class SolDefault extends HTMLElement {
  // observedAttributes is intentionally empty: a MutationObserver
  // watches every attribute on the element, so consumers don't have to
  // declare which knobs they care about in advance. (If we listed any
  // name here, attributeChangedCallback would double-fire alongside
  // the observer.)
  static get observedAttributes() { return []; }

  constructor() {
    super();
    this.style.display = 'none';
  }

  connectedCallback() {
    if (this._observer) return;
    this._observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes' || !m.attributeName) continue;
        const name = m.attributeName;
        const newValue = this.getAttribute(name);
        const oldValue = m.oldValue;
        if (newValue === oldValue) continue;
        this._fire(name, newValue, oldValue);
      }
    });
    this._observer.observe(this, { attributes: true, attributeOldValue: true });
  }

  disconnectedCallback() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
  }

  _fire(name, newValue, oldValue) {
    this.dispatchEvent(new CustomEvent('sol-default-change', {
      bubbles: true, composed: true,
      detail: { name, newValue, oldValue },
    }));
  }
}

define('sol-default', SolDefault);
export { SolDefault };
export default SolDefault;
