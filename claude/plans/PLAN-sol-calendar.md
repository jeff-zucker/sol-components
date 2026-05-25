# PLAN — `<sol-calendar>`

An inline calendar viewer that takes a public calendar URL (or an RDF-config
pointer to one), fetches and parses it, and renders the events in whatever
space the host page gives the element. Shaped to match the other sol-* web
components: shadow DOM, constructable stylesheet via `core/adopt.js`,
`define()` registration, optional `source="file.ttl#Subject"` PropertyValue
config via `web/utils/rdf-config.js`, and a hand-rolled parser util
following the `web/utils/feed-fetch.js` precedent.

## 1. Where it lives

| Path | Purpose |
| --- | --- |
| `web/sol-calendar.js` | the custom element |
| `web/styles/sol-calendar-css.js` | `CSS` string + constructable `sheet` |
| `web/utils/calendar-fetch.js` | fetch + parse ICS (RFC 5545) + parse a registry TTL |
| `data/calendar-settings.ttl` | single-calendar `<#Settings>` PropertyValue example |
| `data/calendars.ttl` | (optional, see Q2) multi-calendar registry, schema:Event-style |
| `help/sol-calendar-help.html` | one focused help page |
| `claude/smoke-tests/sol-calendar-*.{mjs,html}` | node + browser smoke checks |

One new runtime dep: **`ical.js`** (Mozilla / Kewisch, the de facto RFC
5545 parser). Added to `dependencies` alongside `rdflib`, `dompurify`,
and `marked`. Why a real parser rather than hand-rolling like
`feed-fetch.js`: ICS adds embedded `VTIMEZONE` blocks, recurrence with
`RRULE` / `EXDATE` / `RECURRENCE-ID` overrides, and date-vs-datetime
nuance that's easy to get subtly wrong (a calendar widget that shows
the wrong time silently is worse than no widget). ical.js handles all
of that and is well-maintained. Bundle cost ~100 KB min+gz, in line
with what `rdflib` already adds for the RDF-using components.

## 2. Element shape

```html
<!-- Direct URL, any provider that exports ICS -->
<sol-calendar source="https://calendar.google.com/calendar/ical/.../basic.ics"></sol-calendar>

<!-- Provider helper: build the URL from the calendar id -->
<sol-calendar provider="google" calendar-id="alice@example.org"></sol-calendar>

<!-- Pull URL + provider + view from a TTL config -->
<sol-calendar source="data/calendar-settings.ttl#Settings"></sol-calendar>
```

Attributes (HTML attribute always wins over RDF config — same convention as
sol-time / sol-weather):

| Attribute | Values | Notes |
| --- | --- | --- |
| `source` | URL **or** `file.ttl#Subject` | If it ends in `.ics`, treated as a direct calendar; if the URL has a `#fragment` and is `.ttl`, treated as RDF config. |
| `provider` | `google` \| `proton` \| `apple` \| `outlook` \| `ics` | Default `ics` (no rewriting). Affects URL construction and the header label only — **no auth in v1**. |
| `calendar-id` | provider-specific id | For `google`: the calendar's email/id; for others, currently unused. |
| `view` | `agenda` \| `month` \| `week` \| `day` \| `mini` | See Q1 for scope. |
| `start` | ISO date `YYYY-MM-DD` | Default: today. |
| `window-days` | integer | Agenda lookahead; default 30. |
| `max-events` | integer | Cap on agenda items; default 100. |
| `proxy` | URL pattern | Same shape as sol-feed `proxy=` — prepended to cross-origin fetches because most provider ICS endpoints don't send CORS. |
| `time-zone` | IANA TZ | Default: `Intl.DateTimeFormat().resolvedOptions().timeZone`. |
| `locale` | BCP-47 | Default: browser locale. |

RDF config keys (schema:PropertyValue names) map 1:1 to the HTML attributes
above: `"source"`, `"provider"`, `"calendar-id"`, `"view"`, `"start"`,
`"window-days"`, `"max-events"`, `"proxy"`, `"time-zone"`, `"locale"`.

## 3. Fetching

`calendar-fetch.js` exports:

```js
export async function getCalendarEvents(url, {
  proxy = '',
  provider = 'ics',
  calendarId = '',
  windowDays = 30,
  start = new Date(),
} = {}) { ... }            // → Array<Event>

export function buildProviderUrl(provider, calendarId) { ... }
export function parseICS(text, { start, windowDays } = {}) { ... }
                                   // wraps ical.js; returns the flat
                                   // Event[] shape below with recurrences
                                   // already expanded in [start, start+windowDays).
```

`Event` shape (small, JS-native — ical.js's `ICAL.Component` /
`ICAL.Event` types stay inside the parser util, the render layer only
ever sees plain objects):

```ts
{
  uid: string,
  summary: string,
  description?: string,
  location?: string,
  url?: string,
  start: Date,            // already in local TZ after ical.js conversion
  end:   Date,
  allDay: boolean,
  isRecurringInstance: boolean,   // true if produced by RRULE expansion
  calendar?: string,              // label for multi-calendar merges (v2)
}
```

Provider URL helpers (`buildProviderUrl`):

| provider | URL template |
| --- | --- |
| `google` | `https://calendar.google.com/calendar/ical/<id>/public/basic.ics` |
| `apple` | (pass-through — user provides the `webcal://` / `https://` URL from Share Calendar) |
| `outlook` | (pass-through — Outlook's published-calendar URL) |
| `proton` | (pass-through — Proton's "Share publicly" link) |
| `ics` | (pass-through) |

Only `google` actually composes a URL; the others are pass-through but the
provider attribute still drives the header label, the documented expected
format, and (later) any provider-specific quirks (e.g. Outlook serves text/
calendar with a `text/html` content-type sometimes — we sniff on `BEGIN:VCALENDAR`).

CORS is the practical headache. None of Google / Apple / Outlook / Proton
serve `Access-Control-Allow-Origin: *` on their public ICS endpoints, so
the `proxy=` attribute is doing real work in production. The component
should:
- Try the bare URL first (Solid pods and self-hosted ICS often do CORS),
- On a CORS or network failure, retry through `proxy + encodeURIComponent(url)` if `proxy` is set,
- Render a clear "couldn't fetch — try `proxy=`" empty state otherwise.

This mirrors how `feed-fetch.js` handles RSS today.

## 4. Views

**v1 scope: agenda view only.** Mini and month are designed below and
will land in a v2 patch; the view dispatch is a small switch so adding
them later is a localized change. Week and day are deferred indefinitely
until there's a concrete use case.

`renderAgenda()` (v1): a vertical list grouped by day, each item showing
the time range, summary, location. Scrolls inside the host's box.

```
─── Wed, May 28 ─────────────────────────
  09:30–10:15  Standup
                room 4
  14:00        Coffee with Sam
                Stumptown
─── Fri, May 30 ─────────────────────────
  All day      Conference
```

`renderMonth()` (deferred to v2): traditional 7-col grid. Each cell shows
the date number and up to N event chips (overflow "+3 more"). On click,
the day expands to a popover (built off the existing `sol-modal` styles)
showing the day agenda. The grid uses `display:grid; grid-template-columns:
repeat(7, 1fr)` and stays inside the host's box; the cell heights flex
so it scales with the container per the user's "fit whatever space it is
contained in" requirement.

`renderMini()` (deferred to v2, design locked) — small card showing **today only**, time + summary +
location, scrolling inside if the day is busy. Empty state is a single
muted "Nothing scheduled today." Sized as a dashboard tile so it can sit
next to `<sol-time>` / `<sol-weather>`:

```
┌─ Wed, May 28 ────────────────────┐
│ 09:30  Standup                   │
│ 14:00  Coffee with Sam           │
│        Stumptown                 │
│ 16:00  Code review               │
└──────────────────────────────────┘
```

`renderWeek()`, `renderDay()` are noted in the API but deferred to a
follow-up unless Q1 says otherwise. The view dispatch is a small switch
like sol-feed's, so adding a view is a localized change.

Container-fit behaviour (matches sol-feed):
- `:host { display:flex; flex-direction:column; height:100%; max-height:100vh; }`
- Each view's scroll container has `flex: 1 1 auto; min-height: 0; overflow: auto;`
- The header (provider label + month nav) is `flex: 0 0 auto`.

## 5. RDF / data files

### `data/calendar-settings.ttl` (single calendar, sol-weather pattern)

```ttl
@prefix schema: <http://schema.org/> .
@prefix : <#> .

<#Settings>
  schema:additionalProperty
    <#source>, <#provider>, <#view>, <#window-days>, <#proxy> .

<#source>
  a schema:PropertyValue ;
  schema:name "source"@en ;
  schema:value "https://calendar.google.com/calendar/ical/.../basic.ics" .

<#provider>      a schema:PropertyValue ; schema:name "provider"@en      ; schema:value "google" .
<#view>          a schema:PropertyValue ; schema:name "view"@en          ; schema:value "agenda" .
<#window-days>   a schema:PropertyValue ; schema:name "window-days"@en   ; schema:value 30 .
<#proxy>         a schema:PropertyValue ; schema:name "proxy"@en         ; schema:value "https://corsproxy.example/?url=" .
```

Standard `schema.org/PropertyValue` — no invented predicates (per the
project's "never invent predicates" rule). Uses the **http://schema.org/**
form across TTL, code, and SHACL.

### `data/calendars.ttl` (multi-calendar registry, only if we do Q2)

If we go with a sol-feed-style registry where several calendars can be
ticked on and merged, the right vocabulary needs sign-off (see Q3). Two
sensible candidates I'd want to confirm before using:

- **`schema:` + `dct:`** — `schema:url` for the ICS endpoint, `schema:name`
  for the label, `dct:subject` for a topic, `schema:provider` (literal)
  for the provider hint. Pro: same vocabulary the data files already use.
- **A bookmark-style registry like `data/feeds.ttl`** — reuse `bk:Topic`,
  `bk:hasTopic`, `bk:recalls`, but coin nothing. Pro: identical UX/code
  with sol-feed's "all" picker. Con: bookmarks are semantically about
  pages, not calendars; would want to confirm.

Per the project's "never use unconfirmed RDF predicates" rule I'll wait
for sign-off (Q3) before writing this file.

## 6. Implementation steps

1. **Stub the element** — `web/sol-calendar.js` with `connectedCallback`
   adopt + status strip + view dispatch + the `_applySource` PropertyValue
   reader (copied/adapted from sol-weather).
2. **Add `ical.js` to `dependencies`** in `package.json` and wire it
   into `web/utils/calendar-fetch.js`. The util's job is the thin
   translation layer: `ICAL.parse` → `ICAL.Component` → iterate `VEVENT`
   children → for each, `new ICAL.Event(v)`; if `event.isRecurring()`,
   use `event.iterator()` to walk `next()` instances inside
   `[start, start+windowDays)`; otherwise emit the single instance.
   Map each to the plain `Event` shape above. Render layer never imports
   ical.js directly.
3. **Provider URL builder** (`buildProviderUrl`) and the
   bare-then-proxy fetch fallback.
4. **Agenda view** — render, group by day, expand recurrences within
   `[start, start+windowDays)`.
5. **Styles** — `web/styles/sol-calendar-css.js` referencing the shared
   tokens (`--font-ui`, `--font-size`, `--text`, `--surface`, `--border`,
   `--accent`, `--text-muted`) so it themes alongside sol-feed/sol-weather.
6. **Month view** — grid + day-detail popover (reuse sol-modal styles
   per the styles-layout memory).
7. **Help page** — `help/sol-calendar-help.html`, one focused page
   (per the "one help page per component" rule).
8. **Smoke tests** —
   - `claude/smoke-tests/sol-calendar-ics-parse.mjs` (node, no DOM,
     imports ical.js + our translation layer, runs against a checked-in
     `sample.ics` covering: single events, all-day, TZID, weekly RRULE,
     monthly RRULE, EXDATE, RECURRENCE-ID override),
   - `claude/smoke-tests/sol-calendar-render.mjs` (puppeteer, renders
     the agenda view against the sample file, screenshots it).
9. **Bundle** — `npm run bundle` (swc) + esbuild minify per the
   `always_bundle` memory, then commit.

## 7. Resolved decisions

- **Views in v1**: agenda only. Mini and month designed in §4 and
  deferred to v2. Week/day deferred indefinitely.
- **Multi-calendar**: single calendar per element in v1. Authors place
  multiple `<sol-calendar>` elements if they need more than one.
  Registry follows in v2.
- **Registry vocabulary**: parked until we actually build the registry.
- **Read-only** in v1 — no event creation; CalDAV write-back is a much
  bigger lift and provider ICS export URLs are read-only anyway.
- **Mini empty state**: a single muted "Nothing scheduled today."

## 8. Shipped beyond original v1

The component grew during the dashboard build. What's actually in main
now, beyond the §4 / §7 v1 scope:

- **Multi-source / amalgamated agendas** — promoted from v2. A single
  `source` attribute can hold whitespace-separated URLs, *or* the
  TTL config can declare repeated `"source"` PropertyValues (or one
  PropertyValue with multiple `schema:value` statements — both
  equivalent). `getMergedCalendarEvents` fetches all in parallel via
  `Promise.allSettled`, merges + sorts, with per-feed error isolation
  and a "Loaded N of M" status line. Each event carries a short
  `calendar` label derived from the URL host. Driven from
  `data/calendar-settings.ttl#All` on the dashboard (Solid CG + LWS WG +
  Extra Solid Events from solidproject.org/events).
- **Meeting-URL extraction** — `pickMeetingUrl` derives the summary's
  href in priority order: ICS `URL:` → `LOCATION:` as URL (with
  location-row suppression so the same URL doesn't render twice) →
  first known-platform host in DESCRIPTION (`meet.jit.si`, `zoom.us`,
  `meet.google.com`, `teams.microsoft.com`, `whereby.com`) → first
  URL of any host in DESCRIPTION. Trailing punctuation trimmed.
- **`hide-header` attribute** — boolean. Skips the title + provider
  strip; used on the dashboard where the slot is already labelled.
- **Table-style row layout** — the agenda is now a flat `.cal-row`
  list with three columns (`date | time | event`) instead of grouping
  by day. Same-day repeats render the date column with
  `class="repeat"` + `visibility: hidden` so column alignment stays
  intact while the date itself blanks out. Today's row gets a left
  accent stripe.
- **`rdf-config.js` upgrade** — `loadConfig` now collects repeated
  `"name"` PropertyValues into an array (scalar stays scalar — fully
  backwards compatible). Enables multi-source above and any future
  multi-valued setting.
- **Theme token integration** — `--link` for clickable event summaries
  (themed; falls back to `--accent`), `--accent` for the today stripe.
  Documented in `help/sol-calendar-help.html#tab-theme`.

## 9. Status (2026-05-23)

- ✅ Element + parser + styles + RDF config + bundle
- ✅ Smoke tests: parser (32 assertions) + render (~25 assertions
  including multi-source, meeting URLs, empty-state)
- ✅ Dashboard placement verified visually (playwright + screenshot)
- ✅ Help page covers all current attributes, multi-source, meeting
  URLs, theming, accessibility
- 🅿️ Mini view, month view, week/day views — deferred per §7 still
- 🅿️ Per-event source badge (data is there via the `calendar` field,
  renderer doesn't show it yet) — small follow-up
