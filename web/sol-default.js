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
import { loadConfig } from './utils/rdf-config.js';

class SolDefault extends HTMLElement {
  // observedAttributes is intentionally empty: a MutationObserver
  // watches every attribute on the element, so consumers don't have to
  // declare which knobs they care about in advance. (If we listed any
  // name here, attributeChangedCallback would double-fire alongside
  // the observer.)
  static get observedAttributes() { return []; }

  /** SHACL shape describing the editable knobs (proxy etc.). Shares
   *  preferences.shacl with the chrome's theme / font / editor-keys
   *  knobs so a single sol-form can edit everything together. */
  static get shape() {
    return new URL('../shapes/preferences.shacl', import.meta.url).href;
  }

  constructor() {
    super();
    this.style.display = 'none';
  }

  async connectedCallback() {
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

    // RDF source: pulls each predicate's value into a matching HTML
    // attribute (only when not already set explicitly on the element,
    // so an inline override wins). camelCase predicates kebab-case
    // their attribute name (`ui:defaultIssuers` → `default-issuers`).
    const source = this.getAttribute('source');
    if (source) await this._applySource(source);
  }

  async _applySource(source) {
    try {
      const cfg = await loadConfig(source);
      for (const [predUri, value] of Object.entries(cfg)) {
        const attr = attrFromPredicate(predUri);
        if (!attr) continue;
        if (this.hasAttribute(attr)) continue;   // HTML override wins
        this.setAttribute(attr, Array.isArray(value) ? value.join(' ') : String(value));
      }
    } catch (err) {
      console.warn(`[sol-default] source ${source}: ${err.message}`);
    }
  }

  /** Public hook used by &lt;sol-settings&gt; after a save: re-read the RDF
   *  and re-emit change events for downstream consumers. */
  async reload() {
    const source = this.getAttribute('source');
    if (source) await this._applySource(source);
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

// Map a predicate URI's local name to a kebab-case HTML attribute.
// `http://www.w3.org/ns/ui#proxy`         → `proxy`
// `http://www.w3.org/ns/ui#defaultIssuers` → `default-issuers`
function attrFromPredicate(uri) {
  const i = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  const local = i === -1 ? uri : uri.slice(i + 1);
  if (!local || local === 'type') return null;
  return local.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

define('sol-default', SolDefault);
export { SolDefault };
export default SolDefault;
