// Styles for <sol-weather>'s shadow root. Exports the raw `CSS` string plus
// a constructable `sheet`. Compact one-line card by default; shows the
// weather icon, current temperature, and rain probability for the next
// `hours-window` hours.
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: inline-block;
    font-family: var(--font-ui, system-ui, sans-serif);
    font-size: var(--font-size, 1rem);
    color: var(--text, #212121);
  }

  .card {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    white-space: nowrap;
    padding: .25rem 0;
  }

  .icon  { font-size: 1.4em; line-height: 1; flex: 0 0 auto; }
  .place {
    color: var(--text-muted, #7f8c8d);
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .temp  { font-variant-numeric: tabular-nums; }
  .stat  {
    color: var(--text-muted, #7f8c8d);
    font-size: .85em;
    font-variant-numeric: tabular-nums;
  }
  .desc  {
    color: var(--text-muted, #7f8c8d);
    font-size: .85em;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error {
    color: var(--error, #c00);
    font-size: .85em;
    padding: .25rem .5rem;
    background: color-mix(in srgb, var(--error, #e74c3c) 10%, transparent);
    border-radius: var(--radius-sm, 4px);
  }
  .error[hidden] { display: none; }

  /* Compact mode (default) hides the verbose textual description; expose
     it through ::part(desc) { display: inline } if a caller wants it. */
  .desc { display: none; }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
