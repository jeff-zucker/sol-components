// Styles for <sol-calendar>'s shadow root. Exports the raw `CSS` string
// plus a constructable `sheet` — same shape as the other web/styles/*-css.js
// modules. All colours and metrics reference the shared design tokens so
// the component themes with the rest of the suite.
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: flex;
    flex-direction: column;
    /* Respect whatever height the container gives us; with no container
       height, fall back to this viewport cap. Either way the agenda list
       scrolls inside the component and never overflows its container. */
    height: 100%;
    max-height: 100vh;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    font-size: var(--font-size, 20px);
    color: var(--text, #212121);
  }
  * { box-sizing: border-box; }

  .sol-calendar {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* ── status / loading / empty ───────────────────────────────────────── */
  .sol-calendar-status {
    flex: 0 0 auto;
    padding: .5rem .75rem;
    color: var(--text-muted, #7f8c8d);
    font-size: .85em;
  }
  .sol-calendar-status[data-error] { color: var(--error, #e74c3c); }
  .sol-calendar-empty {
    padding: 1rem .75rem;
    color: var(--text-muted, #7f8c8d);
    font-style: italic;
  }

  /* ── header (provider label) ────────────────────────────────────────── */
  .cal-header {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: .75rem;
    padding: .4rem .75rem;
    border-bottom: 1px solid var(--border, #d0d0d0);
    background: var(--surface, #fff);
  }
  .cal-title {
    font-weight: 600;
    font-size: .95em;
    color: var(--text, #212121);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cal-provider {
    color: var(--text-muted, #7f8c8d);
    font-size: .8em;
    text-transform: lowercase;
  }

  /* ── agenda list (table-like: date | time | event per row) ──────────── */
  .cal-agenda {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    margin: .5rem;
  }
  /* No day-header rows — each .cal-row is self-contained with its own
     date column, so the agenda reads as one flat table-like list. */

  .cal-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cal-row {
    display: grid;
    /* Body column is "auto" (not "1fr") so each row's intrinsic
       width is the actual width of its content. That lets host
       pages size the whole calendar to fit-content via
       "width: max-content" — the fr-based version had no
       well-defined max-content, which collapses fit-width sizing.
       NOTE: Don't use backticks in this comment; the surrounding
       JS template literal uses backticks as its delimiter and any
       stray one in the CSS body terminates the string early. */
    grid-template-columns: 7rem 7rem auto;
    column-gap: .75rem;
    align-items: baseline;
    padding: .35rem .75rem;
    border-top: 1px solid color-mix(in srgb, var(--border, #d0d0d0) 50%, transparent);
    font-size: .9em;
  }
  .cal-row:first-child { border-top: none; }
  /* When the row is "today", give a subtle accent stripe at the left so
     it stands out without changing the column widths or alignment. */
  .cal-row.today {
    background: color-mix(in srgb, var(--accent, #3498db) 8%, transparent);
    box-shadow: inset 3px 0 0 var(--accent, #3498db);
  }

  .cal-row-date,
  .cal-row-time {
    color: var(--text-muted, #7f8c8d);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The date repeats on every row. Don't visually emphasise it — the
     event title is the row's primary content. */
  .cal-row-date { font-size: .9em; }
  /* When a date is the same as the row above, the JS adds .repeat —
     keep the column reserved (no layout shift) but hide the text so a
     run of same-day events reads cleanly. */
  .cal-row-date.repeat { visibility: hidden; }

  .cal-row-body { min-width: 0; }
  .cal-row-summary {
    color: var(--text, #212121);
    overflow-wrap: anywhere;
  }
  .cal-row-location {
    display: block;
    color: var(--text-muted, #7f8c8d);
    font-size: .85em;
    margin-top: .1rem;
    overflow-wrap: anywhere;
  }
  .cal-row a {
    /* Use the theme's link colour so a clickable event summary reads as
       a real link (Jitsi / Meet / W3C events-page join URLs) — the
       row's plain text events stay in the regular text colour. */
    color: var(--link, var(--accent, #2980b9));
    text-decoration: none;
  }
  .cal-row a:hover,
  .cal-row a:focus-visible {
    text-decoration: underline;
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
