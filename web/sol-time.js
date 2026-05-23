/**
 * <sol-time> — clock display web component.
 *
 * Always shows local and UTC. An optional third timezone (label + hour
 * offset from UTC) appears when either attribute is set. Updates once
 * a minute.
 *
 * Attributes:
 *   time-label    — short label for an extra timezone (e.g. "tokyo")
 *   time-offset   — that timezone's offset from UTC in hours (e.g. "9")
 *   source        — "file.ttl#Subject" Turtle config in schema.org
 *                   PropertyValue form. Setting names map to the
 *                   matching HTML attributes:
 *                     "timezone"        → time-label
 *                     "timezone-offset" → time-offset
 *                   HTML attributes override the TTL.
 *
 * @element sol-time
 *
 * @example
 *   <sol-time></sol-time>
 *   <sol-time time-label="tokyo" time-offset="9"></sol-time>
 *   <sol-time source="data/time.ttl#Settings"></sol-time>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as TIME_CSS, sheet as TIME_SHEET } from './styles/sol-time-css.js';
import { loadConfig } from './utils/rdf-config.js';

/** Zero-pad a one- or two-digit clock value to two chars. */
function pad2(n) { return n < 10 ? '0' + n : String(n); }

/**
 * Clock display web component.
 *
 * @class SolTime
 * @extends HTMLElement
 */
class SolTime extends HTMLElement {
  static get observedAttributes() {
    return ['time-label', 'time-offset', 'source'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._root = document.createElement('div');
    this._root.className = 'sol-time';
    this._timer = null;
  }

  async connectedCallback() {
    adopt(this.shadowRoot, { sheet: TIME_SHEET, css: TIME_CSS });
    this.shadowRoot.appendChild(this._root);

    // Pull defaults from the configured RDF source; explicit HTML
    // attributes win, so the TTL is a baseline rather than a forced
    // setting. Render once synchronously so the clock isn't blank
    // during the async fetch.
    this._render();
    await this._applySource();
    this._render();
    // Tick once a minute — the seconds are not shown so a finer tick
    // would be pure busywork.
    this._timer = setInterval(() => this._render(), 60_000);
  }

  /**
   * Apply config from `source` to attributes the component already
   * observes. Mapping: "timezone" → time-label,
   * "timezone-offset" → time-offset. Skips any attribute already set
   * in HTML.
   */
  async _applySource() {
    const source = this.getAttribute('source');
    if (!source) return;
    try {
      const cfg = await loadConfig(source);
      if (cfg.timezone && !this.hasAttribute('time-label')) {
        this.setAttribute('time-label', String(cfg.timezone));
      }
      if (cfg['timezone-offset'] != null && !this.hasAttribute('time-offset')) {
        this.setAttribute('time-offset', String(cfg['timezone-offset']));
      }
    } catch (err) {
      console.warn(`[sol-time] source ${source}: ${err.message}`);
    }
  }

  disconnectedCallback() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  _render() {
    const now = new Date();
    const local = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const utc   = pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes());

    // local + gmt are always shown — the three label-value pairs read
    // uniformly (label + value triplets).
    const parts = [
      '<span class="label" part="local-label">local</span>',
      `<span class="value" part="local-time">${local}</span>`,
      '<span class="sep" part="sep">·</span>',
      '<span class="label" part="utc-label">gmt</span>',
      `<span class="value" part="utc-time">${utc}</span>`,
    ];

    const label  = this.getAttribute('time-label');
    const offset = Number(this.getAttribute('time-offset'));
    if (label && Number.isFinite(offset)) {
      const extra = new Date(now.getTime() + offset * 3_600_000);
      const t = pad2(extra.getUTCHours()) + ':' + pad2(extra.getUTCMinutes());
      parts.push(
        '<span class="sep" part="sep">·</span>',
        `<span class="label" part="extra-label">${label}</span>`,
        `<span class="value" part="extra-time">${t}</span>`,
      );
    }

    this._root.innerHTML = parts.join('');
  }
}

define('sol-time', SolTime);
export { SolTime };
