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
 * automatically. Hosts can use `sol-menu`'s `ui:keepAlive` so widgets
 * stay mounted (hidden) when the user navigates to the settings page;
 * otherwise discovery only sees widgets currently in the DOM.
 *
 * Attributes:
 *   none
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
    if (this._built) return;
    this._built = true;
    // Defer one microtask so the surrounding DOM (e.g., a sibling
    // keep-alive wrapper that holds the dashboard widgets) is fully
    // attached before discovery walks.
    queueMicrotask(() => this._build());
  }

  _build() {
    const widgets = this._discover();
    if (!widgets.length) {
      this._empty();
      return;
    }

    const accordion = document.createElement('sol-accordion');
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
        const ctor = customElements.get(el.localName);
        if (!ctor) continue;
        if (resolveEditorSpec(ctor)) {
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

function labelFromTag(tag) {
  return tag
    .replace(/^sol-|^dk-/, '')
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

define('sol-settings', SolSettings);
export { SolSettings };
export default SolSettings;
