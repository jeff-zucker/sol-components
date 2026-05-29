import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: flex; flex-direction: row;
    flex: 1; min-height: 0; min-width: 0;
    max-width: 100%; height: 100%;
    overflow: hidden;
    box-sizing: border-box;
    font-family:var(--font-ui) !important;
    font-size: var(--font-size, var(--medium-font, 20px));
  }
  :host([orientation="horizontal"]) {
    flex-direction: column;
  }
  .sol-menu-embed {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0; min-width: 0;
    width: 100%; max-width: 100%;
    overflow: auto;
  }

  .sol-menu-nav {
    display: flex; flex-direction: column;
    flex-shrink: 0;
    min-width: var(--menu-nav-min-width, 140px);
    max-width: var(--menu-nav-max-width, 260px);
    padding: var(--space-md, 8px);
    gap: var(--space-xs, 2px);
    border-right: 1px solid var(--border, #e0e0e0);
    overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin;
    box-sizing: border-box;
  }
  :host([orientation="horizontal"]) > .sol-menu-nav {
    flex-direction: row;
    flex-wrap: wrap;
    min-width: 0; max-width: 100%;
    padding: var(--space-sm, 4px) var(--space-lg, 12px);
    gap: var(--space-sm, 4px);
    border-right: none;
    border-bottom: var(--menu-nav-border-bottom, 1px solid var(--border, #e0e0e0));
    /* No overflow scroll on the nav itself — when items don't fit
       the row (large font, narrow chrome) they wrap onto a second
       row. Scroll bars belong inside component content (sol-pod's
       tree, etc.), not on layout chrome. */
    overflow: visible;
  }

  .sol-menu-nav button {
    background: none; border: none;
    text-align: left;
    padding: var(--menu-button-padding, var(--space-md, 8px) var(--space-lg, 12px));
    border-radius: var(--menu-button-radius, var(--radius-sm, 4px));
    color: var(--text, black) !important;
    cursor: pointer; font-family: inherit;
    white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    font-size: var(--font-size, var(--medium-font, 20px)) !important;
  }
  :host([orientation="horizontal"]) > .sol-menu-nav > button,
  :host([orientation="horizontal"]) > .sol-menu-nav > .sol-menu-group {
    flex-shrink: 0;
  }
  .sol-menu-nav button .sol-menu-icon {
    display: inline-flex; align-items: center;
    vertical-align: middle;
    pointer-events: none;
  }
  .sol-menu-nav button .sol-menu-icon svg {
    fill: currentColor;
  }
  .sol-menu-nav button .sol-menu-icon img {
    height: 1.2em; width: auto;
  }
  .sol-menu-nav button:hover {
    background: var(--menu-hover-bg, var(--hover, #f0f0f0));
    color: var(--menu-hover-color, var(--accent-dark, #1976d2));
  }
  .sol-menu-nav button:focus-visible {
    outline: 2px solid var(--accent, #4a9eff);
    outline-offset: 2px;
  }
  .sol-menu-nav button.active {
    background: var(--menu-active-bg, var(--focus-bg, #e3f2fd)) !important;
    color: var(--menu-active-color, var(--accent-dark, #1976d2)) !important;
    font-weight: var(--font-weight-bold, 600);
  }

  .sol-menu-group {
    position: relative;
    display: block;
  }
  .sol-menu-group-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm, 4px);
  }
  .sol-menu-group-btn::after {
    content: '▸';
    margin-left: auto;
    font-size: var(--small-font, 16px);
    opacity: 0.7;
  }
  :host([orientation="horizontal"]) .sol-menu-nav > .sol-menu-group > .sol-menu-group-btn::after {
    content: '▾';
    margin-left: var(--space-sm, 4px);
  }
  .sol-menu-popup {
    display: none;
    position: fixed;
    min-width: var(--menu-popup-min-width, 160px);
    padding: var(--space-md, 8px);
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-popup, 0 4px 12px rgba(0,0,0,0.12));
    z-index: 1000;
    flex-direction: column;
    gap: var(--space-xs, 2px);
  }
  .sol-menu-group.open > .sol-menu-popup {
    display: flex;
  }

  /* The content area is a light-DOM child of <sol-menu>, projected through
     the shadow slot, so menu-click results land in light DOM and are
     reachable by page CSS and document queries. Style it directly with
     sol-menu > .sol-menu-content { ... } — there is no part() hook.
     overflow:hidden (not auto) by default: app chrome doesn't scroll;
     components placed inside scroll on their own. */
  slot { display: contents; }
  ::slotted(.sol-menu-content) {
    flex: 1 1 0; min-height: 0; min-width: 0;
    max-width: 100%;
    display: flex; flex-direction: column;
    overflow: hidden;
    padding: var(--menu-content-padding, var(--space-xl, 16px) var(--space-xl, 16px));
    box-sizing: border-box;
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
