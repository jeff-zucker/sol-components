/**
 * <sol-include> — Fetch and display remote content inline.
 *
 * Supports HTML, Markdown, and plain text. Content is sanitized with
 * DOMPurify by default. An optional CSS selector filters to a section
 * of the fetched document.
 *
 * @element sol-include
 * @attr {string} source - URL of the resource to fetch (required)
 * @attr {string} selector - CSS selector — show only matching elements
 * @attr {boolean} raw - show source text verbatim without rendering
 * @attr {boolean} trusted - skip DOMPurify sanitization
 *
 * @example
 * <sol-include source="https://example.org/readme.md"></sol-include>
 * <sol-include source="page.html" selector="article"></sol-include>
 */
import { sanitizeHtml } from '../core/utils.js';
import { define } from '../core/define.js';
import { adopt } from '../core/adopt.js';
import { fetchIncludeContent, filterWithSelector } from '../core/include-core.js';
import { getAuthFetch } from '../core/auth-fetch.js';
import { CSS as INCLUDE_CSS, sheet as includeSheet } from './styles/sol-include-css.js';

function browserContainer(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

/**
 * Fetch and display remote content inline.
 *
 * Supports HTML, Markdown, and plain text. Content is sanitized with
 * DOMPurify by default.
 *
 * @class SolInclude
 * @extends HTMLElement
 * @attr {string} source - URL to fetch (required)
 * @attr {string} selector - CSS selector — show only matching elements
 * @attr {boolean} raw - show source text verbatim
 * @attr {boolean} trusted - skip DOMPurify sanitization, render into LIGHT
 *                 DOM (via a shadow <slot>) so host CSS reaches the content
 *
 * Layout: `:host` is a flex column with `flex: 1 1 auto; min-height: 0` and
 * the `.si-content` wrapper gets the same treatment (matched in both the
 * shadow and trusted-slotted modes), so a definite parent height propagates
 * down to components placed inside (sol-pod, sol-menu, etc.). They can then
 * fill and scroll on their own — sol-include itself never scrolls.
 */
class SolInclude extends HTMLElement {
  static get observedAttributes() {
    return ['source', 'selector', 'raw', 'trusted'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._abortCtl = null;
  }

  connectedCallback()                         { if (this.isConnected) this._load(); }
  attributeChangedCallback(n, oldV, newV)     { if (oldV !== newV && this.isConnected) this._load(); }
  disconnectedCallback()                      { this._abortCtl?.abort(); this._abortCtl = null; }

  // ── Main load ─────────────────────────────────────────────────────────────────
  async _load() {
    const source   = this.getAttribute('source');
    const selector = this.getAttribute('selector') || '';
    const raw      = this.hasAttribute('raw');
    const trusted  = this.hasAttribute('trusted');

    if (!source) { this._show('error', 'No source provided'); return; }

    // Cancel any in-flight load triggered by an earlier attribute change.
    this._abortCtl?.abort();
    const ctl = new AbortController();
    this._abortCtl = ctl;

    this._show('loading', 'Loading…');

    // `login` attribute (CSS selector for a sol-login) overrides auto-discovery.
    const loginSel = this.getAttribute('login');
    const loginEl  = loginSel ? document.querySelector(loginSel) : null;
    const fetchFn  = getAuthFetch(source, { element: loginEl || undefined });

    try {
      // When a selector is present, defer sanitization so the selector can
      // match attributes (e.g. RDFa typeof/rel) that DOMPurify would strip.
      const { type, content } = await fetchIncludeContent(source, {
        raw,
        trusted: trusted || !!selector,
        sanitize: sanitizeHtml,
        signal: ctl.signal,
        fetchFn,
      });

      if (ctl.signal.aborted) return;

      if (type === 'raw') {
        this._showRaw(content);
        return;
      }

      if (selector) {
        const filtered = filterWithSelector(content, selector, browserContainer);
        if (ctl.signal.aborted) return;
        if (filtered === null) {
          this._show('empty', 'No elements matched selector');
          return;
        }
        this._showHtml(trusted ? filtered : await sanitizeHtml(filtered));
      } else {
        this._showHtml(content);
      }
    } catch (err) {
      if (err.name === 'AbortError' || ctl.signal.aborted) return;
      this._show('error', err.message);
      this._fireError('load', err.message);
    }
  }

  _fireError(kind, message) {
    this.dispatchEvent(new CustomEvent('sol-error', {
      bubbles: true, composed: true,
      detail: { source: 'sol-include', kind, message },
    }));
  }

  // ── Display helpers ───────────────────────────────────────────────────────────
  _showHtml(html) {
    this._initShadow();
    const div = document.createElement('div');
    div.className = 'si-content';
    div.innerHTML = html;
    // When the consumer marked the source as `trusted`, render into
    // LIGHT DOM rather than shadow DOM. Trusted content is, by
    // definition, page-authored — it should inherit the host's
    // stylesheets so .my-class rules apply, custom-element CSS lands,
    // etc. The shadow root contains a <slot> in trusted mode so the
    // light-DOM child still gets projected into the host's box.
    // Untrusted content stays in shadow for isolation.
    if (this.hasAttribute('trusted')) {
      this.appendChild(div);
    } else {
      this.shadowRoot.appendChild(div);
    }
  }

  // Remove any prior trusted-mode light-DOM render so reload swaps
  // cleanly without piling stale content next to the new. Called from
  // _initShadow on every state transition; the trusted append path
  // can assume it starts clean.
  _clearLightContent() {
    for (const child of Array.from(this.children)) {
      if (child.classList?.contains('si-content')) child.remove();
    }
  }

  _showRaw(text) {
    this._initShadow();
    const pre = document.createElement('pre');
    pre.className = 'si-raw';
    pre.textContent = text;
    this.shadowRoot.appendChild(pre);
  }

  _show(type, message) {
    this._initShadow();
    const div = document.createElement('div');
    div.className = `si-${type}`;
    if (type === 'error') div.setAttribute('role', 'alert');
    else if (type === 'loading' || type === 'empty') {
      div.setAttribute('role', 'status');
      div.setAttribute('aria-live', 'polite');
    }
    div.textContent = message;
    this.shadowRoot.appendChild(div);
  }

  // Reset for a fresh render. Drops any prior light-DOM content so
  // reload doesn't double-stack, then resets the shadow root. In
  // `trusted` mode the shadow holds a single <slot> so a subsequent
  // light-DOM append shows through; in untrusted mode there's no
  // slot, so any light children stay hidden as before.
  _initShadow() {
    this._clearLightContent();
    this.shadowRoot.innerHTML = this.hasAttribute('trusted') ? '<slot></slot>' : '';
    this.shadowRoot.adoptedStyleSheets = [];
    adopt(this.shadowRoot, { sheet: includeSheet, css: INCLUDE_CSS });
  }
}

define('sol-include', SolInclude);
export { SolInclude };
