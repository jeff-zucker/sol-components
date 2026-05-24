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
import { attachEditorSelfGear } from '../core/editor-self.js';
import { CSS as TIME_CSS, sheet as TIME_SHEET } from './styles/sol-time-css.js';
import { loadConfig } from './utils/rdf-config.js';

/**
 * Derive the current UTC offset (in hours, possibly fractional) for an
 * IANA timezone name. Returns null if the name is unrecognised.
 *
 * Uses Intl.DateTimeFormat's "shortOffset" timezone name — emitted as
 * strings like `"GMT+5:30"`, `"GMT-04:00"`, or just `"GMT"`. Parses
 * the suffix back to a decimal hours value. Honours DST automatically
 * because the formatter consults the OS / browser's IANA database.
 */
function ianaOffsetHours(iana) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset',
    });
    const parts = fmt.formatToParts(new Date());
    const tz = parts.find(p => p.type === 'timeZoneName')?.value;
    if (!tz) return null;
    // tz looks like "GMT", "GMT+5:30", "GMT-04:00", "UTC+11", …
    if (tz === 'GMT' || tz === 'UTC') return 0;
    const m = tz.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const hours = parseInt(m[2], 10) + (parseInt(m[3] || '0', 10) / 60);
    return sign * hours;
  } catch {
    return null;
  }
}

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

  /** SHACL shape declaring the fixed schema (predicates + datatypes +
   *  cardinalities). sol-form's shape-driven mode generates a labelled
   *  field per property; dk-settings discovery picks this up. The
   *  legacy `editor` (ui:Form TTL) getter was dropped in the
   *  direct-predicate vocab migration — see
   *  swc/claude/plans/PLAN-vocab-migration.md. */
  static get shape() {
    return new URL('../shapes/time-settings.shacl', import.meta.url).href;
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

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  /**
   * Apply config from `source` to attributes the component already
   * observes. Mapping (predicate URI → HTML attribute):
   *   schema:timezone  → time-label   (display label = last IANA segment)
   *                    → time-offset  (UTC offset in hours, derived)
   *
   * The IANA name in schema:timezone fully determines both the label
   * (`"Asia/Kolkata"` → `"Kolkata"`) and the UTC offset (computed via
   * `Intl.DateTimeFormat`, which honors DST). See
   * claude/plans/PLAN-vocab-migration.md for the predicate choice and
   * rationale.
   */
  async _applySource() {
    const source = this.getAttribute('source');
    if (!source) return;
    const SCHEMA = 'http://schema.org/';
    try {
      const cfg = await loadConfig(source);
      const iana = cfg[SCHEMA + 'timezone'];
      if (!iana) return;
      if (!this.hasAttribute('time-label')) {
        // Display label = last path segment (the city/place part).
        const label = String(iana).split('/').pop() || String(iana);
        this.setAttribute('time-label', label);
      }
      if (!this.hasAttribute('time-offset')) {
        const offset = ianaOffsetHours(String(iana));
        if (offset != null) this.setAttribute('time-offset', String(offset));
      }
    } catch (err) {
      console.warn(`[sol-time] source ${source}: ${err.message}`);
    }
  }

  disconnectedCallback() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /**
   * Re-read `source` and re-render. Public hook used by external
   * editors (e.g. dk-settings) after a configuration file changes.
   */
  async reload() {
    await this._applySource();
    this._render();
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
