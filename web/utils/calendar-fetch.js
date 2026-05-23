/**
 * calendar-fetch.js — fetch + parse iCalendar (RFC 5545) into plain JS
 * event objects. Thin translation layer over ical.js; nothing in the
 * render layer should ever import ical.js directly.
 *
 * The library handles the parts of RFC 5545 that are genuinely subtle —
 * embedded VTIMEZONE blocks, recurrence (`RRULE` + `EXDATE` +
 * `RECURRENCE-ID` overrides), date-vs-datetime distinction, line
 * unfolding, escape sequences — so this module is mostly bookkeeping:
 * given an URL or a text blob, hand back `Event[]` with recurrences
 * already expanded into a `[start, start + windowDays)` window.
 *
 * Companion to `feed-fetch.js` (RSS/Atom) and `rdf-config.js` (TTL
 * PropertyValue config). Same CORS-then-proxy fetch pattern as
 * `feed-fetch.js` — most provider ICS endpoints (Google, Apple,
 * Outlook, Proton) don't send `Access-Control-Allow-Origin`, so the
 * `proxy` option does real work in practice.
 */

import ICAL from 'ical.js';

/**
 * Plain JS event shape returned to callers. ical.js's `Time`,
 * `Duration`, etc. are converted to native `Date` here so the render
 * layer doesn't need to know about them.
 *
 * @typedef {Object} CalendarEvent
 * @property {string}  uid                   stable identity; recurring instances share the master UID
 * @property {string}  summary               event title (may be empty for malformed ICS)
 * @property {string=} description
 * @property {string=} location
 * @property {string=} url
 * @property {Date}    start                 in the JS engine's local timezone
 * @property {Date}    end
 * @property {boolean} allDay                DTSTART was a DATE (no time component)
 * @property {boolean} isRecurringInstance   true if produced by RRULE expansion
 * @property {string=} calendar              human label for multi-calendar merges (v2)
 */

/**
 * Build a publicly-fetchable ICS URL from a provider + calendar id.
 * Only `google` actually composes a URL today — the rest of the
 * known providers expect the user to paste the share link directly,
 * but they still drive the header label and (later) any provider-
 * specific quirks in the fetch path.
 *
 * @param {string} provider     "google" | "apple" | "outlook" | "proton" | "ics"
 * @param {string} calendarId   provider-specific; for Google, the calendar email/id
 * @returns {string|null}       URL when we can build one, null when the caller should
 *                              fall back to its own explicit URL
 */
export function buildProviderUrl(provider, calendarId) {
  if (!calendarId) return null;
  switch ((provider || '').toLowerCase()) {
    case 'google':
      return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
    default:
      // apple / outlook / proton / ics — pass-through, caller has the URL.
      return null;
  }
}

/**
 * Apply a proxy pattern to a URL. Mirrors `feed-fetch.js`: if the
 * pattern contains the literal token `{url}`, the encoded target
 * replaces it; otherwise the encoded target is appended to the end
 * of the pattern.
 *
 * @param {string} proxy    pattern (empty / null → no proxy)
 * @param {string} target   absolute URL to fetch
 * @returns {string}        the URL to actually request
 */
export function applyProxy(proxy, target) {
  if (!proxy) return target;
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(target));
  return proxy + encodeURIComponent(target);
}

/**
 * Fetch an ICS document, falling back to the proxy on CORS / network
 * failure. Returns the raw text body.
 *
 * @param {string} url
 * @param {{proxy?: string, signal?: AbortSignal}} opts
 */
async function fetchICSText(url, { proxy = '', signal } = {}) {
  // Try bare first — Solid pods and self-hosted ICS often do CORS, and
  // a successful bare fetch saves a hop through the proxy.
  try {
    const resp = await fetch(url, { signal });
    if (resp.ok) {
      const text = await resp.text();
      // Sniff: some servers respond 200 to misrouted requests with HTML.
      if (text.includes('BEGIN:VCALENDAR')) return text;
    }
    // fall through to proxy attempt — server returned non-ICS or non-2xx
  } catch (e) {
    // Network / CORS error — try the proxy if one is configured.
    if (!proxy) throw e;
  }

  if (!proxy) throw new Error(`Couldn't fetch calendar — try setting proxy=`);
  const proxied = applyProxy(proxy, url);
  const resp = await fetch(proxied, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching calendar`);
  const text = await resp.text();
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Proxy returned a non-ICS body');
  }
  return text;
}

/** Convert an ical.js Time to a native JS Date in the local TZ. */
function timeToDate(t) {
  // `toJSDate()` on a date-only Time still returns a Date pinned to
  // 00:00 local; the caller flags it via `allDay` rather than dropping
  // the time component.
  return t.toJSDate();
}

/** Known video-meeting host substrings, in preference order. The
 *  first match in the DESCRIPTION wins over arbitrary other URLs
 *  (so a "see gitter.im/x for chat" line never beats the actual
 *  meet.jit.si link). */
const MEETING_HOSTS = [
  'meet.jit.si',
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
  'whereby.com',
  'us02web.zoom.us', 'us04web.zoom.us', 'us05web.zoom.us', 'us06web.zoom.us',
];

/** Match any `http(s)://…` URL up to whitespace / quote / angle-bracket
 *  / common ICS line-ending punctuation. Tuned to be greedy enough for
 *  query strings but not so greedy that trailing punctuation (".", ",",
 *  ")") becomes part of the URL. */
const URL_RE = /https?:\/\/[^\s<>"'\\]+/g;

/** Trim trailing punctuation that's commonly stuck to a URL when it
 *  sits at the end of a sentence in DESCRIPTION text. */
function trimUrlTail(u) {
  return u.replace(/[.,;:!?\])]+$/, '');
}

/**
 * Pick the best "click target" URL for an event, in priority order:
 *
 *   1. The standard `URL` iCal property.
 *   2. LOCATION if the whole field is a URL (frequent for Jitsi-only
 *      calendars like the Solid CG one).
 *   3. The first URL in DESCRIPTION that matches a known meeting host.
 *   4. The first URL in DESCRIPTION of any host (so the W3C
 *      events-page link still becomes a click target on calendars
 *      that don't carry the join URL inline).
 *
 * Also reports whether LOCATION was consumed as the URL — the caller
 * suppresses the location text-row in that case so the URL doesn't
 * render twice (once as the summary's href, once below as plain text).
 *
 * @param {ICAL.Event} event
 * @returns {{ url: string|undefined, locationIsUrl: boolean }}
 */
function pickMeetingUrl(event) {
  const explicitUrl = event.component.getFirstPropertyValue('url');
  if (explicitUrl) return { url: String(explicitUrl), locationIsUrl: false };

  const loc = event.location || '';
  if (/^https?:\/\/\S+$/i.test(loc.trim())) {
    return { url: trimUrlTail(loc.trim()), locationIsUrl: true };
  }

  const desc = event.description || '';
  const urls = (desc.match(URL_RE) || []).map(trimUrlTail);
  if (!urls.length) return { url: undefined, locationIsUrl: false };

  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (MEETING_HOSTS.some(h => host === h || host.endsWith('.' + h) || host.endsWith(h))) {
        return { url: u, locationIsUrl: false };
      }
    } catch { /* skip malformed */ }
  }
  return { url: urls[0], locationIsUrl: false };
}

/**
 * Translate one ical.js Event (master + an optional recurrence-instance
 * detail) into the flat shape we expose. `details` is what
 * `event.iterator()` hands back when expanding recurrences; for a
 * non-recurring event it's just `{ startDate, endDate }` synthesised
 * from the master.
 */
function toCalendarEvent(event, details, { calendar } = {}) {
  const startTime = details ? details.startDate : event.startDate;
  const endTime   = details ? details.endDate   : event.endDate;
  const { url, locationIsUrl } = pickMeetingUrl(event);
  return {
    uid:                  event.uid || '',
    summary:              event.summary || '',
    description:          event.description || undefined,
    // Drop the location text when it WAS the meeting URL — otherwise
    // the same link renders twice (once as the summary's href, once
    // as plain text below).
    location:             locationIsUrl ? undefined : (event.location || undefined),
    url,
    start:                timeToDate(startTime),
    end:                  endTime ? timeToDate(endTime) : timeToDate(startTime),
    allDay:               !!startTime.isDate,
    // True for every occurrence produced via recurrence expansion —
    // including RECURRENCE-ID overrides, which are themselves single
    // events (so `event.isRecurring()` is false on them) but only
    // exist as part of a recurring series.
    isRecurringInstance:  !!details,
    calendar,
  };
}

/**
 * Parse an ICS text blob and expand recurrences inside the given
 * window. The window is `[start, start + windowDays)`, half-open at
 * the end so an event whose start equals `start + windowDays` is
 * excluded.
 *
 * @param {string} text
 * @param {{start?: Date, windowDays?: number, maxEvents?: number, calendar?: string}} [opts]
 * @returns {CalendarEvent[]} sorted ascending by start
 */
export function parseICS(text, opts = {}) {
  const start      = opts.start instanceof Date ? opts.start : new Date();
  const windowDays = Number.isFinite(opts.windowDays) ? opts.windowDays : 30;
  const maxEvents  = Number.isFinite(opts.maxEvents)  ? opts.maxEvents  : 1000;
  const calendar   = opts.calendar;

  const winStart = start;
  const winEnd   = new Date(start.getTime() + windowDays * 86_400_000);

  const jcal = ICAL.parse(text);
  const root = new ICAL.Component(jcal);

  // Embedded VTIMEZONE blocks need to be registered so any DTSTART
  // with a matching TZID resolves correctly.
  for (const vt of root.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vt);
    if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz.tzid, tz);
  }

  const events = [];
  const vevents = root.getAllSubcomponents('vevent');

  // Two passes for recurring events: first collect any RECURRENCE-ID
  // override instances (they shadow specific occurrences of the master),
  // then iterate the master and substitute overrides as they come up.
  const overridesByUid = new Map();   // uid → Map<recurrence-id ISO, event>
  const masters = [];
  for (const ve of vevents) {
    const ev = new ICAL.Event(ve);
    if (ev.isRecurrenceException()) {
      const key = ev.uid;
      let bucket = overridesByUid.get(key);
      if (!bucket) overridesByUid.set(key, bucket = new Map());
      bucket.set(ev.recurrenceId.toString(), ev);
    } else {
      masters.push(ev);
    }
  }

  // Cap on iterations per master — guards against pathological RRULEs
  // (e.g. `FREQ=SECONDLY` someone might paste in) producing millions of
  // instances before the window check trims them.
  const ITER_CAP = 5000;

  for (const ev of masters) {
    if (events.length >= maxEvents) break;

    if (ev.isRecurring()) {
      const overrides = overridesByUid.get(ev.uid);
      const iter = ev.iterator();
      let next;
      let n = 0;
      while ((next = iter.next()) && n++ < ITER_CAP) {
        const occStartDate = next.toJSDate();
        if (occStartDate >= winEnd) break;
        // Find the duration on either the master or the per-occurrence
        // override; getOccurrenceDetails on the master returns the right
        // end-date and substitutes the override summary/location etc.
        const details = ev.getOccurrenceDetails(next);
        if (details.endDate.toJSDate() < winStart) continue;
        const useEv = overrides && overrides.get(next.toString())
          ? overrides.get(next.toString())
          : ev;
        events.push(toCalendarEvent(useEv, details, { calendar }));
        if (events.length >= maxEvents) break;
      }
    } else {
      const evStart = timeToDate(ev.startDate);
      const evEnd   = ev.endDate ? timeToDate(ev.endDate) : evStart;
      if (evEnd < winStart || evStart >= winEnd) continue;
      events.push(toCalendarEvent(ev, null, { calendar }));
    }
  }

  events.sort((a, b) => a.start - b.start);
  return events;
}

/**
 * Top-level helper: resolve the URL (provider URL builder or pass-
 * through), fetch the ICS text (with proxy fallback), and parse it
 * into the windowed `CalendarEvent[]`.
 *
 * @param {string} url
 * @param {{provider?: string, calendarId?: string, proxy?: string,
 *          start?: Date, windowDays?: number, maxEvents?: number,
 *          calendar?: string, signal?: AbortSignal}} [opts]
 */
export async function getCalendarEvents(url, opts = {}) {
  const built = buildProviderUrl(opts.provider, opts.calendarId);
  const target = built || url;
  if (!target) throw new Error('No calendar URL — supply source= or calendar-id=');
  const text = await fetchICSText(target, { proxy: opts.proxy, signal: opts.signal });
  return parseICS(text, opts);
}

/**
 * Multi-source helper: fetch every URL in parallel and merge the
 * resulting events into one sorted-by-start list. A flaky single feed
 * doesn't blank the whole result — its error is reported in `errors`
 * and the surviving feeds still render.
 *
 * Each merged event carries a `calendar` label derived from the URL
 * (host + first path segment), so the render layer can show the
 * origin if it wants to.
 *
 * @param {string[]} urls
 * @param {{provider?: string, proxy?: string, start?: Date,
 *          windowDays?: number, maxEvents?: number,
 *          signal?: AbortSignal}} [opts]
 * @returns {Promise<{events: CalendarEvent[], errors: {url: string, message: string}[]}>}
 */
export async function getMergedCalendarEvents(urls, opts = {}) {
  if (!urls || !urls.length) {
    throw new Error('No calendar URLs — supply at least one source');
  }

  const settled = await Promise.allSettled(
    urls.map(async (u) => {
      const text = await fetchICSText(u, { proxy: opts.proxy, signal: opts.signal });
      return parseICS(text, { ...opts, calendar: shortLabelFromUrl(u) });
    }),
  );

  const events = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value);
    else errors.push({ url: urls[i], message: r.reason?.message || String(r.reason) });
  });

  events.sort((a, b) => a.start - b.start);
  // The per-feed maxEvents already clipped each one; cap the merged
  // total separately so a couple of big calendars don't blow the cap.
  const cap = Number.isFinite(opts.maxEvents) ? opts.maxEvents : 1000;
  if (events.length > cap) events.length = cap;
  return { events, errors };
}

/** Short, human-ish label for an ICS URL — host + first path segment
 *  trimmed, used as the per-event `calendar` field when merging.
 *  "https://www.w3.org/groups/cg/solid/calendar/export/" → "w3.org/solid"
 *  "https://calendar.google.com/.../basic.ics"            → "google" */
function shortLabelFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'calendar.google.com' || host.endsWith('.google.com')) return 'google';
    // Pick a useful path token: prefer something that isn't generic
    // ("groups", "calendar", "export", etc.). Falls back to the host.
    const skip = new Set(['groups', 'calendar', 'export', 'public', 'ical', 'cg', 'wg']);
    const tok = u.pathname.split('/').find(s => s && !skip.has(s.toLowerCase()));
    return tok ? `${host.split('.').slice(-2, -1)[0] || host}/${tok}` : host;
  } catch {
    return url;
  }
}

export default getCalendarEvents;
