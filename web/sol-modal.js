/**
 * <sol-modal> — Generic modal dialog web component.
 * Attributes: title, size ("small" for compact prompts),
 *             source, content, component, handler (declarative trigger mode)
 * Properties: handler (Function), headerActions (Element[]), onClose (Function)
 * Methods: open(), close(), prompt(message, placeholder)
 * Events: sol-ready, sol-close
 *
 * Imperative usage:
 *   const m = document.createElement('sol-modal');
 *   m.modalTitle = 'My File';
 *   m.handler = (body, footer, actions) => {
 *     // Populate the modal body directly, OR insert a <sol-tabs> when the
 *     // caller wants tabbed content.
 *     body.textContent = 'Hello';
 *   };
 *   m.open();
 *
 *   // Prompt dialog:
 *   const val = await SolModal.prompt('Enter name:', 'default');
 *
 * Declarative trigger usage — any of source/content/component/handler turns
 * the element into an inline button; clicking it opens the modal:
 *
 *   <sol-modal source="foo.html">edit foo</sol-modal>
 *   <sol-modal content="<p>hi</p>">show hi</sol-modal>
 *   <sol-modal source="foo.ttl" component="sol-live-edit" format="turtle">
 *     edit foo
 *   </sol-modal>
 *   <sol-modal source="foo.ttl" handler="myHandler">edit foo</sol-modal>
 *
 * When `component` is set, sol-modal creates that element inside the modal
 * body and forwards all attributes (except title/size/component/content/handler)
 * to it.
 *
 * When `handler` is set as an attribute, its value names a global function
 * (e.g. `window[name]`); the modal invokes it as `fn(body, footer, actions,
 * { source, host })`. When `handler` is assigned as a property, the value
 * itself is the function.
 *
 * The trigger button is exposed as `::part(trigger)` for external styling.
 *
 * Events (bubbling, composed):
 *   sol-ready — fires after the body is populated.
 *     detail: { body, mode: 'source'|'content'|'component'|'handler', element }
 *   sol-close — fires when the modal closes.
 */

import { CSS, sheet as MODAL_SHEET } from './styles/sol-modal-css.js';
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';

const OWN_ATTRS = new Set(['title', 'size', 'component', 'content', 'source', 'handler']);

/**
 * Generic modal dialog web component.
 *
 * Imperative usage: create the element, set `modalTitle` and `handler`,
 * then call `open()`. The handler receives `(body, footer, actions)` to
 * populate the modal content.
 *
 * Declarative trigger usage: any of `source`/`content`/`component`/`handler`
 * attributes turns the element into an inline button; clicking opens the modal.
 *
 * @class SolModal
 * @extends HTMLElement
 * @attr {string} title - modal header title
 * @attr {string} size - "small" for compact prompt-style dialogs
 * @attr {string} source - URL to fetch and display (declarative trigger mode)
 * @attr {string} content - inline HTML string to display (declarative trigger mode)
 * @attr {string} component - sol-* tag name to create inside the modal body
 * @attr {string} handler - global function name or Function for custom rendering
 * @property {Function} handler - render callback: fn(body, footer, actions, { source, host })
 * @property {Element[]} headerActions - extra buttons for the modal header
 * @property {Function} onClose - callback invoked when the modal closes
 * @fires sol-ready - detail: { body, mode, element }; body populated
 * @fires sol-close - modal dismissed
 */
class SolModal extends HTMLElement {
  static get observedAttributes() { return ['title', 'size']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._cleanup = null;
    this._onClose = null;
    this._triggerMode = false;
    this._handler = null;
    this._extraStyles = [];
  }

  // Additional stylesheets (CSSStyleSheet instances or raw CSS strings) to
  // adopt into the modal's shadow root on open(). Callers use this when
  // their modal content renders classes defined outside the modal — e.g.
  // <sol-pod> pushing its ACL/editor rules so they reach the modal scope.
  get styles() { return this._extraStyles; }
  set styles(arr) { this._extraStyles = Array.isArray(arr) ? arr : []; }

  _isTriggerUsage() {
    return this.hasAttribute('source')
        || this.hasAttribute('content')
        || this.hasAttribute('component')
        || this.hasAttribute('handler');
  }

  get modalTitle() { return this.getAttribute('title') || ''; }
  set modalTitle(v) { this.setAttribute('title', v); }

  get handler() { return this._handler; }
  set handler(fn) { this._handler = fn; }

  get onClose() { return this._onClose; }
  set onClose(fn) { this._onClose = fn; }

  get body() { return this.shadowRoot.querySelector('.modal-body'); }
  get footer() { return this.shadowRoot.querySelector('.modal-footer'); }
  get headerActions() { return this.shadowRoot.querySelector('.modal-header-actions'); }

  connectedCallback() {
    if (this._isTriggerUsage() && !this.shadowRoot.firstChild) {
      this._triggerMode = true;
      this._renderTrigger();
    }
  }

  _renderTrigger() {
    const s = this.shadowRoot;
    s.innerHTML = `<button class="sol-btn modal-trigger" part="trigger" type="button"><slot>Open</slot></button>`;
    s.adoptedStyleSheets = [];
    adopt(s, { sheet: MODAL_SHEET, css: CSS });
    const btn = s.querySelector('.modal-trigger');
    const a11y = this.getAttribute('aria-label') || this.getAttribute('title');
    if (a11y) btn.setAttribute('aria-label', a11y);
    const tip = this.getAttribute('title');
    if (tip) btn.setAttribute('title', tip);
    btn.addEventListener('click', () => this._openDeclarative());
  }

  _emitReady(body, mode, element = null) {
    this.dispatchEvent(new CustomEvent('sol-ready', {
      bubbles: true, composed: true,
      detail: { body, mode, element }
    }));
  }

  _resolveAttrHandler() {
    const name = this.getAttribute('handler');
    if (!name) return null;
    const fn = (typeof window !== 'undefined' && window[name]) || null;
    return typeof fn === 'function' ? fn : null;
  }

  _openDeclarative() {
    const source        = this.getAttribute('source');
    const content       = this.getAttribute('content');
    const componentName = this.getAttribute('component');
    const host = this;
    const attrHandler = this._resolveAttrHandler();

    this._handler = (body, footer, actions) => {
      if (attrHandler) {
        attrHandler(body, footer, actions, { source, host });
        host._emitReady(body, 'handler', null);
        return;
      }
      if (componentName) {
        const el = document.createElement(componentName);
        for (const a of host.attributes) {
          if (!OWN_ATTRS.has(a.name)) el.setAttribute(a.name, a.value);
        }
        el.className = 'modal-body-component';
        body.appendChild(el);
        host._emitReady(body, 'component', el);
      } else if (source != null) {
        body.textContent = 'Loading...';
        fetch(source)
          .then(r => r.text())
          .then(html => {
            body.innerHTML = html;
            host._emitReady(body, 'source', null);
          })
          .catch(() => { body.textContent = 'Failed to load ' + source; });
      } else if (content != null) {
        body.innerHTML = content;
        host._emitReady(body, 'content', null);
      }
    };
    this.open();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'title') {
      const el = this.shadowRoot.querySelector('.modal-title');
      if (el) el.textContent = newV || '';
    }
  }

  open() {
    this._render();
    if (!this.parentNode) document.body.appendChild(this);
    this._invokeHandler();
  }

  _invokeHandler() {
    if (typeof this._handler !== 'function') return;
    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
    const body = this.body;
    const footer = this.footer;
    const actions = this.headerActions;
    body.innerHTML = '';
    body.style.padding = ''; body.style.overflow = ''; body.style.height = '';
    footer.innerHTML = '';
    if (actions) actions.innerHTML = '';
    const cleanup = this._handler(body, footer, actions);
    if (typeof cleanup === 'function') this._cleanup = cleanup;
  }

  close() {
    if (typeof this._cleanup === 'function') { this._cleanup(); this._cleanup = null; }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    this.dispatchEvent(new CustomEvent('sol-close', { bubbles: true, composed: true }));
    if (this._onClose) this._onClose();
    if (this._triggerMode) {
      this._handler = null;
      this._renderTrigger();
    } else {
      this.remove();
    }
  }

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = `
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-label="${this.modalTitle}">
          <div class="modal-header">
            <span class="modal-title">${this.modalTitle}</span>
            <div class="modal-header-actions"></div>
            <button class="modal-close">\u2715</button>
          </div>
          <div class="modal-body"></div>
          <div class="modal-footer"></div>
        </div>
      </div>`;
    s.adoptedStyleSheets = [];
    adopt(s, { sheet: MODAL_SHEET, css: CSS, extra: this._extraStyles });

    s.querySelector('.modal-close').onclick = () => this.close();
    s.querySelector('.modal-overlay').addEventListener('click', (e) => {
      if (e.target === s.querySelector('.modal-overlay')) this.close();
    });

    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escHandler);
  }

  disconnectedCallback() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }

  /**
   * Static prompt dialog. Returns user input or null.
   * @param {string} message
   * @param {string} placeholder
   * @returns {Promise<string|null>}
   */
  static prompt(message, placeholder = '') {
    return new Promise(resolve => {
      let settled = false;
      const finish = (v) => { if (settled) return; settled = true; resolve(v); };
      const m = document.createElement('sol-modal');
      m.setAttribute('size', 'small');
      m.modalTitle = message;
      m.handler = (body, footer) => {
        const input = document.createElement('input');
        input.className = 'modal-input';
        input.type = 'text';
        input.placeholder = placeholder;
        body.style.padding = '16px 20px';
        body.appendChild(input);

        const ok = document.createElement('button');
        ok.className = 'sol-btn sol-btn-sm sol-btn-primary';
        ok.textContent = 'OK';
        const cancel = document.createElement('button');
        cancel.className = 'sol-btn sol-btn-sm';
        cancel.textContent = 'Cancel';
        footer.appendChild(cancel);
        footer.appendChild(ok);

        const done = (v) => { m.onClose = null; m.close(); finish(v); };
        ok.onclick = () => done(input.value.trim());
        cancel.onclick = () => done(null);
        input.onkeydown = (e) => {
          if (e.key === 'Enter') done(input.value.trim());
          if (e.key === 'Escape') done(null);
        };
        setTimeout(() => input.focus(), 50);
      };
      m.onClose = () => finish(null);
      m.open();
    });
  }

  /**
   * Static choice dialog. Renders a message (optionally with extra
   * body content) and a row of buttons; resolves with the chosen
   * button's `value` (or null if dismissed via Esc / overlay / X).
   *
   *   const pick = await SolModal.choice({
   *     title: 'Transfer "foo.ttl"',
   *     message: 'Move (delete original) or copy (keep original)?',
   *     buttons: [
   *       { label: 'Cancel', value: null },
   *       { label: 'Copy',   value: 'copy' },
   *       { label: 'Move',   value: 'move', primary: true },
   *     ],
   *     // optional: extra body content
   *     render: (body) => { ... },
   *     size: 'small',
   *   });
   *
   * Guarantees the promise resolves exactly once, even if the user
   * clicks a button and the close handler also fires.
   *
   * @param {object}   opts
   * @param {string}   opts.title
   * @param {string=}  opts.message
   * @param {Array<{label:string, value:*, primary?:boolean}>} opts.buttons
   * @param {(body:HTMLElement) => void} [opts.render]
   * @param {string=}  opts.size  - 'small' | 'large' (default 'small')
   * @returns {Promise<*>}
   */
  static choice({ title, message, buttons, render, size = 'small' } = {}) {
    return new Promise(resolve => {
      let settled = false;
      const finish = (v) => { if (settled) return; settled = true; resolve(v); };
      const m = document.createElement('sol-modal');
      m.setAttribute('size', size);
      m.modalTitle = title || '';
      m.handler = (body, footer) => {
        body.style.padding = '16px 20px';
        if (message) {
          const p = document.createElement('p');
          p.style.margin = '0 0 8px';
          p.textContent = message;
          body.appendChild(p);
        }
        if (typeof render === 'function') render(body);

        for (const btn of buttons || []) {
          const el = document.createElement('button');
          el.className = 'sol-btn sol-btn-sm' + (btn.primary ? ' sol-btn-primary' : '');
          el.textContent = btn.label;
          el.onclick = () => { m.onClose = null; m.close(); finish(btn.value); };
          footer.appendChild(el);
        }
      };
      m.onClose = () => finish(null);
      m.open();
    });
  }
}

define('sol-modal', SolModal);
export { SolModal };
export default SolModal;
