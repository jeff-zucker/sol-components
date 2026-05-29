/**
 * <sol-window> — a lightweight in-page floating window.
 *
 * A draggable (by its title bar), resizable panel layered over the page,
 * used as the `floating` region surface (see core/display-target.js).
 * Unlike <sol-modal> it has no backdrop and doesn't trap focus — several
 * can coexist, and the page behind stays interactive.
 *
 * Usage (typically created by the dispatcher, not hand-authored):
 *   const w = document.createElement('sol-window');
 *   w.setAttribute('title', 'Notes');
 *   document.body.appendChild(w);
 *   w.body.appendChild(someElement);
 *
 * Attributes: title
 * Methods:    close()
 * Properties: body (the content container to mount into)
 * Events:     sol-close (bubbling, composed) when dismissed
 *
 * The content container is exposed as `::part(body)` and the title bar as
 * `::part(titlebar)` for external styling.
 */

import { define } from '../core/define.js';

// Stacking counter so a freshly-opened / focused window comes to the front.
let zTop = 1000;

const STYLE = `
  :host {
    position: fixed;
    top: 10vh;
    left: 50%;
    transform: translateX(-50%);
    min-width: 240px;
    min-height: 140px;
    width: 480px;
    height: 360px;
    display: flex;
    flex-direction: column;
    background: var(--surface, #fff);
    color: var(--text, #111);
    border: 1px solid var(--border, #ccc);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,.3);
    overflow: hidden;
    resize: both;
    z-index: 1000;
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: move;
    user-select: none;
    background: var(--surface-2, color-mix(in srgb, var(--surface, #fff) 85%, #000));
    border-bottom: 1px solid var(--border, #ccc);
  }
  .title { flex: 1 1 auto; font: var(--font-ui, 600 13px system-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .close {
    flex: 0 0 auto;
    border: none; background: transparent; color: inherit;
    font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  }
  .close:hover { background: var(--hover, rgba(0,0,0,.1)); }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; }
`;

class SolWindow extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <div class="titlebar" part="titlebar">
        <span class="title">${this.getAttribute('title') || ''}</span>
        <button class="close" part="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="body" part="body"></div>`;

    this.style.zIndex = String(++zTop);
    // Bring to front on any interaction.
    this.addEventListener('pointerdown', () => { this.style.zIndex = String(++zTop); });

    this.shadowRoot.querySelector('.close').addEventListener('click', () => this.close());
    this._wireDrag(this.shadowRoot.querySelector('.titlebar'));
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'title' && this.shadowRoot) {
      const t = this.shadowRoot.querySelector('.title');
      if (t) t.textContent = newV || '';
    }
  }

  /** Content container callers mount into. */
  get body() { return this.shadowRoot.querySelector('.body'); }

  close() {
    this.dispatchEvent(new CustomEvent('sol-close', { bubbles: true, composed: true }));
    this.remove();
  }

  // Drag the window by its title bar. Uses fixed left/top in px; the
  // initial centering transform is cleared on first drag so movement is
  // absolute and predictable.
  _wireDrag(handle) {
    let startX, startY, originLeft, originTop;
    const onMove = (e) => {
      this.style.left = `${originLeft + (e.clientX - startX)}px`;
      this.style.top  = `${originTop  + (e.clientY - startY)}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.close')) return;
      const rect = this.getBoundingClientRect();
      this.style.transform = 'none';
      this.style.left = `${rect.left}px`;
      this.style.top = `${rect.top}px`;
      startX = e.clientX; startY = e.clientY;
      originLeft = rect.left; originTop = rect.top;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }
}

define('sol-window', SolWindow);
export { SolWindow };
export default SolWindow;
