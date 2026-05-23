// Styles for <sol-time>'s shadow root. Exports the raw `CSS` string plus a
// constructable `sheet`. Variables reference the shared design tokens so the
// component themes with the rest of the suite.
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: inline-block;
    font-family: var(--font-ui, system-ui, sans-serif);
    font-size: var(--font-size, 1rem);
    color: var(--text, #212121);
  }
  .sol-time {
    display: inline-flex;
    align-items: baseline;
    gap: .35rem;
    white-space: nowrap;
    padding: .25rem 0;
  }
  .label {
    color: var(--text-muted, #7f8c8d);
    font-size: .8em;
    text-transform: lowercase;
  }
  .value { font-variant-numeric: tabular-nums; }
  .sep   { color: var(--text-muted, #7f8c8d); opacity: .6; }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
