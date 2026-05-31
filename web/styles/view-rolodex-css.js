import { sheetFrom } from '../../core/adopt.js';
import { BTN_CSS } from './buttons-css.js';

export const CSS = BTN_CSS + `
  .sol-view-rolodex {
    display: inline-block;
    min-width: 260px;
    max-width: 100%;
    outline: none;
    font-family: var(--font-ui, system-ui, sans-serif);
    color: var(--text, #212121);
  }
  .sol-view-rolodex:focus-visible .rolodex-card {
    box-shadow: 0 0 0 2px var(--accent, #4a9eff);
  }
  .rolodex-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    margin-bottom: .4rem;
  }
  /* Rolodex nav buttons use .sol-btn .sol-btn-icon. */
  .rolodex-counter {
    font-size: .85em;
    color: var(--text-muted, #666);
  }
  .rolodex-card {
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 6px;
    background: var(--surface, #fff);
    padding: .85rem 1rem;
    box-shadow: 0 1px 3px var(--shadow, rgba(0,0,0,.05));
    cursor: pointer;
    transition: box-shadow .15s;
  }
  .rolodex-card:hover { box-shadow: 0 2px 8px var(--shadow, rgba(0,0,0,.1)); }
  .rolodex-card dl {
    margin: 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: .3rem .85rem;
    align-items: baseline;
  }
  .rolodex-card dt,
  .rolodex-card dd {
    font-size: var(--small-font, 16px);
    line-height: var(--line-height-base, 1.5);
  }
  .rolodex-card dt {
    text-transform: uppercase;
    letter-spacing: .03em;
    color: var(--text-muted, #888);
    font-weight: var(--font-weight-bold, 600);
  }
  .rolodex-card dd {
    margin: 0;
    word-break: break-word;
  }
  .rolodex-card a { color: var(--accent, #0066cc); text-decoration: none; }
  .rolodex-card a:hover { text-decoration: underline; }
  .rolodex-reorder {
    display: flex;
    gap: .25rem;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: .4rem;
  }
  .rolodex-reorder-btn[disabled] { opacity: .35; cursor: not-allowed; }
  .rolodex-pos {
    min-width: 1.75em;
    padding: .1em .45em;
    text-align: center;
    font-variant-numeric: tabular-nums;
    background: var(--focus-bg, #e3f2fd);
    color: var(--accent-dark, #1976d2);
    border-radius: var(--radius-sm, 4px);
    font-size: .9em;
  }
  .rolodex-reorder-hint {
    font-size: .8em;
    color: var(--text-muted, #888);
    font-style: italic;
    margin-right: .35rem;
  }
  /* Jump box: full width of the form it sits above; no native datalist caret. */
  .rolodex-jump { width: 100%; }
  .rolodex-jump-input {
    width: 100%;
    box-sizing: border-box;
    margin: .25rem 0 .5rem;
    padding: .4em .6em;
    border: 1px solid var(--border, #ccc);
    border-radius: var(--radius-sm, 4px);
    font: inherit;
    background: var(--bg, #fff);
    color: inherit;
  }
  .rolodex-jump-input::-webkit-calendar-picker-indicator { display: none !important; }
  .rolodex-jump-input::-webkit-list-button { display: none !important; }
`;
export const sheet = sheetFrom(CSS);
