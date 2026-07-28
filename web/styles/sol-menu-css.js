import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  sol-menu {
    display: flex; flex-direction: row;
    flex: 1; min-height: 0; min-width: 0;
    max-width: 100%; height: 100%;
    overflow: hidden;
    box-sizing: border-box;
    font-family:var(--font-ui) !important;
    font-size: var(--font-size, var(--medium-font, 20px));
  }
  sol-menu[orientation="horizontal"] {
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
    border-right: 1px solid var(--menu-border, var(--border, #e0e0e0));
    overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin;
    box-sizing: border-box;
  }
  sol-menu[orientation="horizontal"] > .sol-menu-nav {
    flex-direction: row;
    flex-wrap: wrap;
    min-width: 0; max-width: 100%;
    padding: var(--space-sm, 4px) var(--space-lg, 12px);
    gap: var(--space-sm, 4px);
    border-right: none;
    border-bottom: var(--menu-nav-border-bottom, 1px solid var(--menu-border, var(--border, #e0e0e0)));
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
    color: var(--menu-text, var(--text, black)) !important;
    cursor: pointer; font-family: inherit;
    white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    font-size: var(--font-size, var(--medium-font, 20px)) !important;
  }
  sol-menu[orientation="horizontal"] > .sol-menu-nav > button,
  sol-menu[orientation="horizontal"] > .sol-menu-nav > .sol-menu-group {
    flex-shrink: 0;
  }
  .sol-menu-nav button .sol-menu-icon {
    display: inline-flex; align-items: center;
    vertical-align: middle;
    margin-right: var(--space-md, 8px);
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
  sol-menu[orientation="horizontal"] .sol-menu-nav > .sol-menu-group > .sol-menu-group-btn::after {
    content: '▾';
    margin-left: var(--space-sm, 4px);
  }
  .sol-menu-popup {
    display: none;
    position: fixed;
    min-width: var(--menu-popup-min-width, 160px);
    padding: var(--space-md, 8px);
    background: var(--menu-bg, var(--surface, #fff));
    border: 1px solid var(--menu-border, var(--border, #e0e0e0));
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-popup, 0 4px 12px rgba(0,0,0,0.12));
    z-index: 1000;
    flex-direction: column;
    gap: var(--space-xs, 2px);
  }
  .sol-menu-group.open > .sol-menu-popup {
    display: flex;
  }

  /* ── Tree view (ui:Tree): submenus as inline collapse/expand branches ── */
  .sol-menu-branch { display: block; }
  .sol-menu-branch > .sol-menu-group-btn::after {
    display: inline-block;
    transition: transform .15s ease;
  }
  .sol-menu-branch > .sol-menu-group-btn.open::after { transform: rotate(90deg); }
  .sol-menu-subtree {
    display: flex; flex-direction: column;
    gap: var(--space-xs, 2px);
    padding-left: var(--menu-tree-indent, var(--space-xl, 16px));
  }
  .sol-menu-subtree[hidden] { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .sol-menu-branch > .sol-menu-group-btn::after { transition: none; }
  }

  /* The content area: a direct light-DOM child of <sol-menu>, reachable by
     page CSS and document queries (sol-menu > .sol-menu-content { ... }).
     overflow:hidden (not auto) by default: app chrome doesn't scroll;
     components placed inside scroll on their own. */
  sol-menu > .sol-menu-content {
    flex: 1 1 0; min-height: 0; min-width: 0;
    max-width: 100%;
    display: flex; flex-direction: column;
    overflow: hidden;
    padding: var(--menu-content-padding, var(--space-xl, 16px) var(--space-xl, 16px));
    box-sizing: border-box;
  }

  /* Touch devices: meet the 44px minimum tap target (desktop is unaffected). */
  @media (hover: none) and (pointer: coarse) {
    .sol-menu-nav button { min-height: 44px; }
  }

  /* ── Keep-alive strip mode ──────────────────────────────────────────────
     A <sol-menu keep-alive> renders every top-level item once into its own
     persistent .sol-menu-pane and switches by visibility (mounted components
     are never torn down). */
  sol-menu > .sol-menu-content > .sol-menu-pane {
    display: flex; flex-direction: column;
    flex: 1 1 auto; min-height: 0; min-width: 0;
    max-width: 100%;
  }
  sol-menu > .sol-menu-content > .sol-menu-pane[hidden] { display: none; }

  /* ── Phone navigator (keep-alive strips only) ───────────────────────────
     On a touch / coarse-pointer device the strip swaps its nav for a
     full-width TRIGGER that opens a bottom SHEET (mounted on <body>,
     core/nav-sheet.js): submenus as sections, leaves as rows. Colours come
     from host vars (--surface/--text/--accent and a per-row --row-accent).
     ── the trigger ── */
  .sol-menu-navtrigger { display: none; }
  @media (hover: none) and (pointer: coarse) {
    /* Hide the nav CONTROLS the sheet replaces — buttons and submenu groups. */
    sol-menu[keep-alive] > .sol-menu-nav > button,
    sol-menu[keep-alive] > .sol-menu-nav > .sol-menu-group { display: none; }
    sol-menu[keep-alive] > .sol-menu-nav { flex-wrap: nowrap; padding: 8px 12px; gap: 0; }
    sol-menu[keep-alive] > .sol-menu-nav > .sol-menu-navtrigger {
      display: flex; align-items: center; gap: 10px;
      flex: 1 1 auto; width: 100%; max-width: 100%; box-sizing: border-box;
      min-height: 44px; padding: 0 16px;
      font: inherit; font-size: max(16px, 1em); font-weight: 600;
      color: var(--text, #1a1a1a); text-align: left;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #c8c8c8); border-radius: 999px;
      cursor: pointer;
    }
    .sol-menu-navtrigger-label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sol-menu-navtrigger-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto;
      background: var(--row-accent, var(--accent, #888)); }
    .sol-menu-navtrigger-chev { flex: 0 0 auto; width: 0; height: 0; opacity: .5;
      border-left: 5px solid transparent; border-right: 5px solid transparent;
      border-bottom: 6px solid currentColor; }   /* up-caret: the sheet rises */
  }

  /* ── the sheet (a <sol-sheet> on <body>; only created on coarse pointers).
     Scrim / panel / grip / open-close animation live in sol-sheet's shadow —
     only the slotted LIST and its rows are styled here. ── */
  .sol-menu-sheet-list { overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 10px; }
  .sol-menu-sheet-grouphead {
    display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
    min-height: 46px; padding: 6px 12px; margin: 2px 0 0;
    font: inherit; font-size: max(16px, .82em);
    text-transform: uppercase; letter-spacing: .07em; font-weight: 700;
    color: var(--text-muted, #8a8a8a);
    background: none; border: 0; border-radius: 11px; cursor: pointer; text-align: left;
  }
  .sol-menu-sheet-grouphead:active { background: var(--hover, rgba(0,0,0,.06)); }
  .sol-menu-sheet-grouplabel { flex: 1 1 auto; }
  .sol-menu-sheet-groupchev { flex: 0 0 auto; width: 0; height: 0; opacity: .7;
    border-left: 5px solid transparent; border-right: 5px solid transparent;
    border-top: 6px solid currentColor; transition: transform .2s ease; }
  .sol-menu-sheet-grouphead.expanded .sol-menu-sheet-groupchev { transform: rotate(-180deg); }
  .sol-menu-sheet-group { display: grid; grid-template-rows: 0fr;
    transition: grid-template-rows .24s ease; }
  .sol-menu-sheet-group.expanded { grid-template-rows: 1fr; }
  .sol-menu-sheet-group-inner { overflow: hidden; min-height: 0; }
  .sol-menu-sheet-item {
    display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box;
    min-height: 44px; padding: 4px 12px;
    font: inherit; font-size: max(16px, 1.03em); color: var(--text, #1a1a1a);
    background: none; border: 0; border-radius: 12px; cursor: pointer; text-align: left;
  }
  .sol-menu-sheet-group-inner .sol-menu-sheet-item { padding-left: 22px; }
  .sol-menu-sheet-item:active { background: var(--hover, rgba(0,0,0,.06)); }
  .sol-menu-sheet-bar { flex: 0 0 auto; width: 4px; align-self: stretch; margin: 9px 0;
    border-radius: 2px; background: transparent; }
  .sol-menu-sheet-label { flex: 1 1 auto; }
  .sol-menu-sheet-check { flex: 0 0 auto; width: 17px; text-align: center; opacity: 0;
    color: var(--row-accent, var(--accent, #333)); font-weight: 800; }
  .sol-menu-sheet-check::after { content: '\\2713'; }   /* ✓ */
  .sol-menu-sheet-item.is-active {
    background: color-mix(in srgb, var(--row-accent, var(--accent, #999)) 15%, transparent);
    color: var(--row-accent, var(--accent)); font-weight: 700;
  }
  .sol-menu-sheet-item.is-active .sol-menu-sheet-bar { background: var(--row-accent, var(--accent, #999)); }
  .sol-menu-sheet-item.is-active .sol-menu-sheet-check { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .sol-menu-sheet-group, .sol-menu-sheet-groupchev { transition: none; }
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
