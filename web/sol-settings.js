/**
 * <sol-settings> — discovery-driven settings page.
 *
 * Walks the current document (crossing into every shadow root) for
 * elements whose custom-element class declares an editor (`static get
 * editor()` or `static get shape()`). For each, builds one accordion
 * panel: summary shows a friendly label, body lazy-mounts the
 * declared editor element on first expand, wired with the host's
 * `source` / `from-rdf` subject. On successful save the host
 * component's `reload()` (if present) is invoked.
 *
 * No configuration: drop a `<sol-settings></sol-settings>` anywhere
 * on the page; widgets elsewhere on the page are picked up
 * automatically. Hosts can render widgets into a keep-alive region pane so
 * they stay mounted (hidden) when the user navigates to the settings page;
 * otherwise discovery only sees widgets currently in the DOM.
 *
 * Attributes:
 *   none
 *
 * Methods:
 *   refresh() — re-walk and rebuild the accordion if the widget set
 *               has changed (signature: tag + subject). Cheap no-op
 *               when nothing changed. Use from consumer code when a
 *               new editable widget is mounted after sol-settings
 *               connected. (Tab activation triggers this automatically
 *               via the sol-tab-activate listener.)
 *
 * Events (consumed):
 *   sol-form-save — bubbling from any embedded editor; triggers
 *                   `host.reload()` on the corresponding source widget.
 */

import { define } from '../core/define.js';
import { buildEditorElement, resolveEditorSpec } from '../core/editor.js';
import './sol-accordion.js';

class SolSettings extends HTMLElement {
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    // Defer one microtask so the surrounding DOM (e.g., a sibling
    // keep-alive wrapper that holds the dashboard widgets) is fully
    // attached before discovery walks.
    queueMicrotask(() => this._build());

    // Re-discover when the editable-component set changes. Generic trigger: a
    // debounced MutationObserver on the whole document — works with any app, no
    // swc-specific navigation needed. `sol-tab-activate` stays as an extra hint
    // for keep-alive tab UIs (harmless if no one fires it). The rebuild only
    // happens when the discovered set actually changed (signature compare).
    this._rebuild = () => {
      if (this.offsetParent === null) return;   // we're hidden; ignore
      this._rebuildIfChanged();
    };
    this._mo = new MutationObserver(() => {
      clearTimeout(this._moTimer);
      this._moTimer = setTimeout(this._rebuild, 50);
    });
    this._mo.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('sol-tab-activate', this._rebuild);
  }

  disconnectedCallback() {
    if (this._mo) { this._mo.disconnect(); this._mo = null; }
    clearTimeout(this._moTimer);
    if (this._rebuild) {
      document.removeEventListener('sol-tab-activate', this._rebuild);
      this._rebuild = null;
    }
  }

  _build() {
    const widgets = this._discover();
    this._lastSignature = signatureOf(widgets);
    this.innerHTML = '';
    if (!widgets.length) {
      this._empty();
      return;
    }

    const accordion = document.createElement('sol-accordion');
    accordion.setAttribute('start-closed', '');
    widgets.forEach((w, i) => {
      const panel = document.createElement('div');
      const head = document.createElement('div');
      head.textContent = w.label;
      const body = document.createElement('div');
      body.className = 'sol-settings-slot';
      body.dataset.widgetIdx = String(i);
      panel.append(head, body);
      accordion.appendChild(panel);
    });
    this.appendChild(accordion);

    // sol-accordion runs synchronously on connect; once it has cloned
    // the author divs into <details>, attach lazy-mount handlers.
    Promise.resolve().then(() => this._wireLazy(accordion, widgets));
  }

  _rebuildIfChanged() {
    const widgets = this._discover();
    const sig = signatureOf(widgets);
    if (sig === this._lastSignature) return;
    this._build();
  }

  refresh() { this._rebuildIfChanged(); }

  _empty() {
    const note = document.createElement('p');
    note.className = 'sol-settings-empty';
    note.textContent = 'No editable widgets found on this page.';
    this.appendChild(note);
  }

  _wireLazy(accordion, widgets) {
    const detailsList = accordion.querySelectorAll('details');
    detailsList.forEach((det, i) => {
      const widget = widgets[i];
      if (!widget) return;
      const section = det.querySelector('.accordion-content-section');
      if (!section) return;
      let mounted = false;
      const mount = () => {
        if (mounted) return;
        mounted = true;
        section.innerHTML = '';
        const editor = buildEditorElement(widget.el);
        if (!editor) {
          section.textContent = 'No editor available.';
          return;
        }
        editor.addEventListener('sol-form-save', () => {
          if (typeof widget.el.reload === 'function') {
            widget.el.reload().catch(() => {});
          }
        });
        section.appendChild(editor);
      };
      if (det.open) mount();
      det.addEventListener('toggle', () => { if (det.open) mount(); });
    });
  }

  _discover() {
    const found = [];
    const seen = new WeakSet();
    const visit = (root) => {
      if (!root || !root.querySelectorAll) return;
      for (const el of root.querySelectorAll('*')) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el === this || this.contains(el)) continue;
        // Opt-out: a host can mark an element it doesn't want surfaced as a
        // settings panel (e.g. a page-config element whose class declares a
        // shape for a different app, or one whose bundled shape URL won't
        // resolve in this app's build).
        if (el.hasAttribute('data-settings-skip')) { if (el.shadowRoot) visit(el.shadowRoot); continue; }
        const ctor = customElements.get(el.localName);
        if (!ctor) continue;
        // A class's editor/shape getter may throw (e.g. import.meta.url maths
        // that breaks once bundled); never let one bad widget abort discovery.
        let spec = null;
        try { spec = resolveEditorSpec(ctor, el); } catch (_) { spec = null; }
        if (spec) {
          found.push({
            el,
            label: el.getAttribute('label') || labelFromTag(el.localName),
          });
        }
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(document);
    return found;
  }
}

// Fallback label when an element has no `label` attribute. Drops the leading
// vendor-prefix segment (sol-, dk-, my-, …) generically and title-cases the
// rest — `sol-weather` → "Weather", `my-thing` → "Thing", `sol-dropdown-button`
// → "Dropdown Button". Any component can override with an explicit `label`.
function labelFromTag(tag) {
  return tag
    .replace(/^[a-z0-9]+-/, '')
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Stable identity for a discovered widget set, used to detect when a
 *  later re-discovery has actually changed anything. Tag + subject is
 *  enough — two instances of the same widget with the same source
 *  would render an identical accordion panel. */
function signatureOf(widgets) {
  return widgets
    .map(w => `${w.el.localName}#${w.el.getAttribute('source') || w.el.getAttribute('from-rdf') || ''}`)
    .sort()
    .join('|');
}

define('sol-settings', SolSettings);
export { SolSettings };
export default SolSettings;
