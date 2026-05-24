/**
 * <sol-breadcrumb> — clickable path-strip primitive.
 *
 * Pure UI component. Knows nothing about RDF, navigation, or routing.
 * Wraps declarative `<span data-key="...">` children into a breadcrumb
 * with `>` separators. Earlier segments are clickable; the last is the
 * current location and is shown in a non-clickable style.
 *
 * Click emits a bubbling, composed `sol-breadcrumb-navigate` event
 * with `detail: { key, index, label }`. The host decides what
 * "navigate" means — sol-tree-edit pops its breadcrumb stack;
 * podz might swap a path display; a router might call pushState.
 *
 * @element sol-breadcrumb
 *
 * @fires sol-breadcrumb-navigate — detail: { key, index, label }
 *
 * @example
 *   <sol-breadcrumb>
 *     <span data-key="root">Main Menu</span>
 *     <span data-key="notes">Notes</span>
 *     <span data-key="daily">Daily</span>
 *   </sol-breadcrumb>
 *
 * Children mutate freely; an attached MutationObserver re-renders so
 * the host can push/pop segments by `element.append()` / `.removeChild()`.
 */

import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';

const CSS = `
sol-breadcrumb {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: 0.92rem;
  line-height: 1.5;
}
sol-breadcrumb .sol-breadcrumb-segment {
  cursor: pointer;
  color: var(--accent, #1F618D);
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  text-decoration: none;
  border-radius: 2px;
}
sol-breadcrumb .sol-breadcrumb-segment:hover,
sol-breadcrumb .sol-breadcrumb-segment:focus-visible {
  text-decoration: underline;
  outline: none;
}
sol-breadcrumb .sol-breadcrumb-current {
  color: var(--text, #2c3e50);
  font-weight: 600;
  cursor: default;
}
sol-breadcrumb .sol-breadcrumb-sep {
  color: var(--text-muted, #8a8a8a);
  user-select: none;
}
sol-breadcrumb [data-key] {
  display: none;
}
`;

class SolBreadcrumb extends HTMLElement {
  connectedCallback() {
    ensureDocStyle(this.getRootNode(), 'sol-breadcrumb-styles', CSS);
    this._render();
    // Watch for children being added/removed so callers can mutate
    // the path declaratively (push by appendChild, pop by remove).
    if (!this._observer) {
      this._observer = new MutationObserver(() => this._render());
      this._observer.observe(this, { childList: true, characterData: true, subtree: true });
    }
  }

  disconnectedCallback() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
  }

  _render() {
    // Pull the data-key segments declared by the author; ignore the
    // rendered chrome we add ourselves.
    const segments = Array.from(this.querySelectorAll(':scope > [data-key]'));
    // Remove any previously-rendered chrome.
    for (const el of Array.from(this.children)) {
      if (!el.hasAttribute('data-key')) el.remove();
    }
    if (segments.length === 0) return;

    const lastIdx = segments.length - 1;
    segments.forEach((seg, i) => {
      const key   = seg.dataset.key;
      const label = seg.textContent.trim();
      let node;
      if (i === lastIdx) {
        node = document.createElement('span');
        node.className = 'sol-breadcrumb-current';
        node.setAttribute('aria-current', 'page');
        node.textContent = label;
      } else {
        node = document.createElement('button');
        node.type = 'button';
        node.className = 'sol-breadcrumb-segment';
        node.textContent = label;
        node.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('sol-breadcrumb-navigate', {
            bubbles: true, composed: true,
            detail: { key, index: i, label },
          }));
        });
      }
      this.appendChild(node);
      if (i !== lastIdx) {
        const sep = document.createElement('span');
        sep.className = 'sol-breadcrumb-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '›';
        this.appendChild(sep);
      }
    });
  }
}

define('sol-breadcrumb', SolBreadcrumb);
