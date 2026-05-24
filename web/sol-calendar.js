/**
 * <sol-calendar> — inline calendar viewer web component.
 *
 * Fetches a public iCalendar (ICS) feed from any provider that exports
 * one — Google Calendar, Apple iCloud, Outlook, Proton Calendar, or a
 * Solid pod — and renders the events as an agenda list that fits
 * whatever container the host page gives it.
 *
 * v1 ships the agenda view only. `mini` (today-only card) and `month`
 * (grid + day popover) are planned and will land as a follow-up; the
 * view dispatch in `connectedCallback` is a switch so adding them is
 * local.
 *
 * Attributes:
 *   source         One or more ICS URLs (whitespace-separated for >1),
 *                  **or** `file.ttl#Subject` PropertyValue config. The
 *                  RDF source may itself declare repeated `"source"`
 *                  values (multi-calendar / amalgamated view), in
 *                  which case events from every feed are fetched in
 *                  parallel and merged into one sorted agenda.
 *   provider       google | apple | outlook | proton | ics  (default: ics)
 *   calendar-id    For provider="google", the calendar email/id; URL is built
 *                  via the public-ICS template. Other providers ignore it.
 *   view           agenda  (only value supported in v1)
 *   start          ISO date YYYY-MM-DD (default: today)
 *   window-days    Agenda lookahead in days (default: 30)
 *   max-events     Cap on rendered events (default: 100)
 *   proxy          CORS proxy pattern — supports `{url}` token or appended
 *   time-zone      IANA TZ override (default: browser's resolved TZ)
 *   locale         BCP-47 (default: browser locale)
 *   hide-header    Boolean — when present, the title + provider strip
 *                  above the agenda is omitted. Useful when the host page
 *                  already labels the slot (dashboards, sidebars).
 *
 * The HTML attribute always wins over the same-named PropertyValue in
 * the RDF `source`, matching the `sol-time` / `sol-weather` convention.
 *
 * @element sol-calendar
 *
 * @example
 *   <!-- Direct URL -->
 *   <sol-calendar
 *     source="https://calendar.google.com/calendar/ical/.../public/basic.ics"
 *     proxy="http://localhost:3002/proxy?uri="></sol-calendar>
 *
 *   <!-- Provider helper builds the URL -->
 *   <sol-calendar provider="google" calendar-id="alice@example.org"></sol-calendar>
 *
 *   <!-- Pull every setting from a PropertyValue TTL -->
 *   <sol-calendar source="data/calendar.ttl#Settings"></sol-calendar>
 */
import { adopt }   from '../core/adopt.js';
import { define }  from '../core/define.js';
import { CSS as CAL_CSS, sheet as CAL_SHEET } from './styles/sol-calendar-css.js';
import { getCalendarEvents, getMergedCalendarEvents, buildProviderUrl }
  from './utils/calendar-fetch.js';
import { loadConfig } from './utils/rdf-config.js';
import { getDefault, onDefaultChange } from '../core/defaults.js';
import { attachEditorSelfGear } from '../core/editor-self.js';

/** Predicate URI → HTML attribute name. After the vocab migration
 *  (see swc/claude/plans/PLAN-vocab-migration.md) calendar settings
 *  use direct predicates from Dublin Core / Schema.org / OWL-Time / UI.
 *  `dct:source` is multi-valued; everything else is single. */
const DCT       = 'http://purl.org/dc/terms/';
const SCHEMA    = 'http://schema.org/';
const TIME_NS   = 'http://www.w3.org/2006/time#';
const UI_NS     = 'http://www.w3.org/ns/ui#';
const CONFIG_MAP = [
  [DCT    + 'format',          'provider'],
  [UI_NS  + 'view',             'view'],
  [TIME_NS + 'days',            'window-days'],
  [SCHEMA + 'numberOfItems',    'max-events'],
];

/** True iff `source` is a `something.ttl#Subject` PropertyValue pointer
 *  rather than a direct calendar URL. The presence of `#` plus the
 *  `.ttl`/`.shacl` extension is the disambiguator — an ICS URL with a
 *  fragment is exotic enough to leave for later. */
function isRdfConfigSource(source) {
  if (!source || !source.includes('#')) return false;
  const path = source.split('#', 1)[0].toLowerCase();
  return path.endsWith('.ttl') || path.endsWith('.shacl');
}

/** Format a Date as the day label used in the agenda's date column,
 *  e.g. "Wed, May 28". Honours the component's `locale` attribute. */
function formatDate(d, locale) {
  return d.toLocaleDateString(locale || undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

/** Compare two Dates for same-day (local TZ). Used to detect repeat
 *  dates in the agenda so the date column can blank-out without
 *  losing its layout slot. */
function sameYMD(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();
}

/** Two-digit zero-padded number — used for the agenda time column so
 *  `09:30` aligns under `14:00`. */
function pad2(n) { return n < 10 ? '0' + n : String(n); }

/** Format the time half of an agenda row: "09:30–10:15", "14:00" if
 *  the event has no end time / a same-instant end, or "All day" when
 *  the event was a DATE-only DTSTART. */
function formatEventTime(ev, locale) {
  if (ev.allDay) return 'All day';
  const start = `${pad2(ev.start.getHours())}:${pad2(ev.start.getMinutes())}`;
  if (!ev.end || ev.end.getTime() === ev.start.getTime()) return start;
  // Don't show the end time if it's the same minute as the start
  // (some ICS sources use zero-duration events as bookmarks).
  const endSameMinute =
    ev.end.getFullYear() === ev.start.getFullYear() &&
    ev.end.getMonth()    === ev.start.getMonth() &&
    ev.end.getDate()     === ev.start.getDate() &&
    ev.end.getHours()    === ev.start.getHours() &&
    ev.end.getMinutes()  === ev.start.getMinutes();
  if (endSameMinute) return start;
  const end = `${pad2(ev.end.getHours())}:${pad2(ev.end.getMinutes())}`;
  return `${start}–${end}`;
}

/** Pretty header label for the title strip. We don't have the calendar's
 *  own X-WR-CALNAME yet (could be added) so this falls back to a clean
 *  rendering of the calendar-id or the URL host. */
function deriveTitle({ source, calendarId }) {
  if (calendarId) return calendarId;
  if (!source) return 'Calendar';
  try { return new URL(source, document.baseURI).hostname; }
  catch { return 'Calendar'; }
}

/**
 * Inline calendar viewer.
 *
 * @class SolCalendar
 * @extends HTMLElement
 */
class SolCalendar extends HTMLElement {
  static get observedAttributes() {
    return [
      'source', 'provider', 'calendar-id', 'view',
      'start', 'window-days', 'max-events', 'proxy',
      'time-zone', 'locale', 'hide-header',
    ];
  }

  /** SHACL shape declaring the fixed schema (predicates + datatypes +
   *  cardinalities). sol-form's shape-driven mode generates a labelled
   *  field per property; only `dct:source` is multi-valued. dk-settings
   *  discovery picks this up. The legacy `editor` (ui:Form TTL) getter
   *  was dropped in the direct-predicate vocab migration — see
   *  swc/claude/plans/PLAN-vocab-migration.md. */
  static get shape() {
    return new URL('../shapes/calendar-settings.shacl', import.meta.url).href;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._controller = null;   // AbortController for the active fetch
    this._refreshMs  = 10 * 60 * 1000;
    this._timer      = null;
  }

  async connectedCallback() {
    adopt(this.shadowRoot, { sheet: CAL_SHEET, css: CAL_CSS });

    this._status = document.createElement('div');
    this._status.className = 'sol-calendar-status';
    this._status.setAttribute('role', 'status');
    this._status.setAttribute('aria-live', 'polite');
    this._status.style.display = 'none';

    this._root = document.createElement('div');
    this._root.className = 'sol-calendar';

    this.shadowRoot.append(this._status, this._root);

    // PropertyValue config first (HTML attributes already win because
    // _applySource only sets attributes that aren't already there).
    await this._applySource();

    try {
      await this._update();
    } catch (e) {
      this._setStatus(e.message || String(e), true);
    }
    this._timer = setInterval(() => this._update().catch(() => {}), this._refreshMs);

    // Re-fetch when <sol-default> changes the proxy at runtime.
    this._unsubDefaults = onDefaultChange((name) => {
      if (name === 'proxy') this.reload().catch(() => {});
    });

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  disconnectedCallback() {
    if (this._controller) this._controller.abort();
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
  }

  /**
   * Re-read `source` and re-fetch calendar events. Public hook used by
   * external editors (e.g. dk-settings) after a configuration file
   * changes.
   */
  async reload() {
    await this._applySource();
    await this._update();
  }

  attributeChangedCallback(_name, oldV, newV) {
    if (oldV !== newV && this.isConnected && this._root) {
      this._update().catch(() => {});
    }
  }

  /** If `source` points at an RDF config file, pull PropertyValue
   *  settings into attributes that aren't already explicitly set on
   *  the HTML element. Skipped when source is empty or looks like a
   *  direct ICS URL. */
  async _applySource() {
    const source = this.getAttribute('source');
    if (!isRdfConfigSource(source)) return;
    try {
      const cfg = await loadConfig(source);
      for (const [predicate, attr] of CONFIG_MAP) {
        if (cfg[predicate] != null && !this.hasAttribute(attr)) {
          this.setAttribute(attr, String(cfg[predicate]));
        }
      }
      // dct:source overrides the element's source (which was the TTL
      // itself). It may be a single URL or a list — re-encode an array
      // as a whitespace-separated string so `_sourceUrls()` can split
      // it back out at render time.
      const dctSource = cfg[DCT + 'source'];
      if (dctSource != null) {
        const encoded = Array.isArray(dctSource) ? dctSource.join(' ') : String(dctSource);
        if (encoded && encoded !== source) this.setAttribute('source', encoded);
      }
    } catch (err) {
      // Bad TTL or missing rdflib — surface in the status strip but
      // keep going; explicit HTML attributes can still drive a render.
      this._setStatus(`Config: ${err.message}`, true);
    }
  }

  /** Split the current `source` attribute into an array of ICS URLs.
   *  Returns [] when source is empty or still an RDF-config pointer
   *  (which only happens during the brief window before _applySource
   *  has rewritten it). Whitespace-separated values become multiple
   *  entries for the amalgamated-calendar path. */
  _sourceUrls() {
    const raw = this.source;
    if (!raw || isRdfConfigSource(raw)) return [];
    return raw.split(/\s+/).filter(Boolean);
  }

  /** Update the polite live region. Pass `isError` to colour it red. */
  _setStatus(msg, isError = false) {
    if (!this._status) return;
    this._status.textContent = msg || '';
    this._status.style.display = msg ? '' : 'none';
    if (isError) this._status.setAttribute('data-error', '');
    else this._status.removeAttribute('data-error');
  }

  /* ── attribute readers ───────────────────────────────────────────── */

  get source()      { return this.getAttribute('source') || ''; }
  get provider()    { return (this.getAttribute('provider') || 'ics').toLowerCase(); }
  get calendarId()  { return this.getAttribute('calendar-id') || ''; }
  get view()        { return (this.getAttribute('view') || 'agenda').toLowerCase(); }
  get proxy()       { return this.getAttribute('proxy') || getDefault('proxy') || ''; }
  get locale()      { return this.getAttribute('locale') || ''; }
  get windowDays()  { return Math.max(1, Number(this.getAttribute('window-days')) || 30); }
  get maxEvents()   { return Math.max(1, Number(this.getAttribute('max-events')) || 100); }
  get startDate() {
    const raw = this.getAttribute('start');
    if (!raw) {
      // Start at midnight local — same-day events that started a few
      // minutes ago still appear, instead of being trimmed by the
      // window cutoff.
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    // YYYY-MM-DD parses as UTC midnight; pin to local midnight so the
    // agenda's day-grouping matches what the user expects.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(raw);
  }

  /* ── fetch + render dispatch ─────────────────────────────────────── */

  async _update() {
    if (!this._root) return;

    // After _applySource, `source` holds either zero URLs (caller is
    // using provider+calendar-id only), one URL, or N whitespace-
    // separated URLs (multi-calendar amalgamation).
    const urls = this._sourceUrls();
    if (!urls.length && !this.calendarId) {
      this._setStatus('No calendar source — set source= or provider= + calendar-id=', true);
      return;
    }

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();
    const signal = this._controller.signal;

    this._setStatus(urls.length > 1
      ? `Loading ${urls.length} calendars…`
      : 'Loading calendar…');

    const opts = {
      provider:   this.provider,
      calendarId: this.calendarId,
      proxy:      this.proxy,
      start:      this.startDate,
      windowDays: this.windowDays,
      maxEvents:  this.maxEvents,
      signal,
    };

    try {
      if (urls.length > 1) {
        // Amalgamated calendar — Promise.allSettled inside, so a single
        // dead feed doesn't blank the rest. Surface the count of
        // failures in the status strip without overriding the events.
        const { events, errors } = await getMergedCalendarEvents(urls, opts);
        this._renderAgenda(events);
        if (errors.length) {
          this._setStatus(
            `Loaded ${urls.length - errors.length} of ${urls.length} calendars — ${errors.length} failed`,
            true);
          // Skip the per-feed warn when the failure is just our own
          // AbortController firing (e.g. a later _update cancelled an
          // in-flight one) — that's expected, not a real failure.
          for (const e of errors) {
            if (/aborted/i.test(e.message)) continue;
            console.warn(`[sol-calendar] ${e.url}: ${e.message}`);
          }
        } else {
          this._setStatus('');
        }
      } else {
        const events = await getCalendarEvents(urls[0] || '', opts);
        this._renderAgenda(events);
        this._setStatus('');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      this._renderEmpty(`Couldn't load calendar: ${e.message}`);
      this._setStatus(e.message || String(e), true);
    }
  }

  _renderEmpty(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'sol-calendar-empty';
    wrap.textContent = msg;
    this._root.replaceChildren(wrap);
  }

  _renderAgenda(events) {
    // hide-header: skip the title + provider strip entirely. Common for
    // dashboards / sidebars that already label the slot themselves.
    const showHeader = !this.hasAttribute('hide-header');
    let header = null;
    if (showHeader) {
      header = document.createElement('div');
      header.className = 'cal-header';
      const title = document.createElement('span');
      title.className = 'cal-title';
      title.textContent = deriveTitle({ source: this.source, calendarId: this.calendarId });
      const prov = document.createElement('span');
      prov.className = 'cal-provider';
      prov.textContent = this.provider;
      header.append(title, prov);
    }

    const list = document.createElement('div');
    list.className = 'cal-agenda';
    list.setAttribute('aria-label', 'Upcoming events');

    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'sol-calendar-empty';
      empty.textContent = `No events in the next ${this.windowDays} days.`;
      list.appendChild(empty);
      this._root.replaceChildren(...(header ? [header, list] : [list]));
      return;
    }

    const today = new Date();
    const ul = document.createElement('ul');
    ul.className = 'cal-rows';

    // Flat list — one row per event, with date / time / event columns.
    // The date is rendered on every row (preserving the grid alignment)
    // but visually blanked when the previous row was the same day, so a
    // run of same-day events reads cleanly without losing the column.
    let prevDate = null;
    for (const ev of events) {
      const li = document.createElement('li');
      li.className = 'cal-row' + (sameYMD(ev.start, today) ? ' today' : '');

      const date = document.createElement('span');
      date.className = 'cal-row-date' + (sameYMD(ev.start, prevDate) ? ' repeat' : '');
      date.textContent = formatDate(ev.start, this.locale);

      const time = document.createElement('span');
      time.className = 'cal-row-time';
      time.textContent = formatEventTime(ev, this.locale);

      const body = document.createElement('div');
      body.className = 'cal-row-body';

      const summary = document.createElement('span');
      summary.className = 'cal-row-summary';
      if (ev.url) {
        const a = document.createElement('a');
        a.href = ev.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = ev.summary || '(untitled)';
        summary.appendChild(a);
      } else {
        summary.textContent = ev.summary || '(untitled)';
      }
      body.appendChild(summary);

      if (ev.location) {
        const loc = document.createElement('span');
        loc.className = 'cal-row-location';
        loc.textContent = ev.location;
        body.appendChild(loc);
      }

      li.append(date, time, body);
      ul.appendChild(li);
      prevDate = ev.start;
    }

    list.appendChild(ul);
    this._root.replaceChildren(...(header ? [header, list] : [list]));
  }
}

define('sol-calendar', SolCalendar);

export { SolCalendar, buildProviderUrl };
