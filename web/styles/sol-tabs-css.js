// Light-DOM styles for <sol-tabs>. Injected into the element's root
// (document or shadow) once per root via ensureDocStyle.

export const CSS = `
  sol-tabs {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0; min-width: 0;
    max-width: 100%;
    overflow: hidden;
    box-sizing: border-box;
  }
  /* A handler/link/include mounted into a tab pane fills it — whether tagged
     .sol-tab-embed (sol-tabs' own embeds) or .sol-menu-embed (an item picked
     from a submenu dropdown, mounted via sol-menu). Without this an embedded
     iframe collapses to its ~150px intrinsic height → a truncated panel. */
  sol-tabs .sol-tab-embed,
  sol-tabs .sol-tabs-pane .sol-menu-embed {
    display: flex; flex-direction: column;
    flex: 1 1 auto; min-height: 0; min-width: 0;
    width: 100%; max-width: 100%; height: 100%;
    overflow: auto;
  }
  sol-tabs > .sol-tabs-content > .sol-tabs-pane {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0; min-width: 0;
    width: 100%; max-width: 100%;
  }
  sol-tabs > .sol-tabs-content > .sol-tabs-pane[hidden] { display: none; }
  /* the per-item mount wrapper (component-mount.js) is layout-neutral by
     default — inside a tabs pane it must pass the stretch through, or an
     embedded iframe collapses to its 150px default instead of filling the
     remaining space */
  sol-tabs > .sol-tabs-content > [data-menu-item]:not([hidden]),
  sol-tabs > .sol-tabs-content > .sol-tabs-pane > [data-menu-item]:not([hidden]) {
    display: flex; flex-direction: column;
    flex: 1 1 auto; min-height: 0; min-width: 0;
    width: 100%; max-width: 100%;
  }
  sol-tabs iframe.sol-tab-embed { border: 0; }
  /* A multi-plugin tab: every plugin lives in the pane at once, stacked.
     Each slot scrolls ITSELF if its plugin outgrows its share — the pane
     and page never scroll. */
  .sol-tabs-stack { display: flex; flex-direction: column; gap: 12px; }
  .sol-tabs-stack > .sol-tabs-stack-item {
    display: flex; flex-direction: column;
    flex: 1 1 auto; min-height: 0; min-width: 0;
    overflow: auto;
  }
  sol-tabs[orientation="vertical"] {
    flex-direction: row;
  }
  sol-tabs > .sol-tabs-bar {
    display: flex; flex-shrink: 0;
    /* NEVER a horizontal scrollbar — too many tabs wrap to more lines */
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border, #e0e0e0);
    padding: 0 12px; gap: 2px;
    overflow: visible;
  }
  /* Page-level action launchers (slot="actions"), grouped at the right of the
     bar. align-self:center keeps them vertically centred in the bar whatever
     the bar's own align-items is — so an app that bottom-aligns its tabs (the
     tab-into-content metaphor) doesn't drag the launchers down onto the
     content below; the tabs stay flush, the launchers stay centred. */
  sol-tabs > .sol-tabs-bar > .sol-tabs-launch {
    margin-left: auto; flex-shrink: 0; align-self: center;
    display: flex; align-items: center; gap: 6px;
  }
  sol-tabs[orientation="vertical"] > .sol-tabs-bar {
    flex-direction: column;
    border-bottom: none;
    border-right: 1px solid var(--border, #e0e0e0);
    padding: 8px; gap: 2px;
    min-width: 140px; max-width: 260px;
    overflow-x: hidden; overflow-y: auto;
  }
  sol-tabs[orientation="vertical"] > .sol-tabs-bar > button {
    text-align: left;
    border-bottom: none;
    border-left: 3px solid transparent;
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 0;
    overflow: hidden; text-overflow: ellipsis;
  }
  sol-tabs[orientation="vertical"] > .sol-tabs-bar > button.active {
    border-bottom-color: transparent;
    border-left-color: var(--accent-dark, #1976d2);
    background: var(--focus-bg, #e3f2fd);
  }
  sol-tabs[variant="sub"] > .sol-tabs-bar {
    padding: 0; gap: 0; margin-bottom: 12px;
  }
  sol-tabs > .sol-tabs-bar > button {
    background: none; border: none;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    padding: 1rem;
    font-size: max(16px, 105%);
    color: var(--text-muted, #666);
    cursor: pointer; margin-bottom: -1px; font-family: inherit;
    white-space: nowrap; flex-shrink: 0;
  }
  sol-tabs[variant="sub"] > .sol-tabs-bar > button {
    /* Scales with the host's text-size choice (was a fixed 18px, which
       ignored it); .9em keeps the sub strip a step smaller than the main
       tabs, floored at 16px — no text below 16px. */
    padding: 8px 14px; font-size: max(16px, .9em);
    border-bottom-width: 2px;
  }
  sol-tabs > .sol-tabs-bar > button:hover { color: var(--accent-dark, #1976d2); }
  sol-tabs > .sol-tabs-bar > button.active {
    color: var(--accent-dark, #1976d2);
    border-bottom-color: var(--accent-dark, #1976d2);
    font-weight: 600;
  }
  /* A submenu tab is a <sol-dropdown-button> launcher on the bar (sol-tabs.js
     _buildSubmenuDropdown). Style its trigger to read as a tab — same padding,
     colour and active underline as a plain tab button. */
  sol-tabs > .sol-tabs-bar > sol-dropdown-button.sol-tabs-submenu::part(trigger) {
    background: none; border: none;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    padding: 1rem;
    font-size: max(16px, 105%);
    color: var(--text-muted, #666);
    cursor: pointer; margin-bottom: -1px; font-family: inherit;
    white-space: nowrap;
  }
  sol-tabs > .sol-tabs-bar > sol-dropdown-button.sol-tabs-submenu::part(trigger):hover {
    color: var(--accent-dark, #1976d2);
  }
  sol-tabs > .sol-tabs-bar > sol-dropdown-button.sol-tabs-submenu.active::part(trigger) {
    color: var(--accent-dark, #1976d2);
    border-bottom-color: var(--accent-dark, #1976d2);
    font-weight: 600;
  }
  sol-tabs > .sol-tabs-actions {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    padding: 6px 20px;
    font-size: 1em;
    font-family: inherit;
  }
  sol-tabs > .sol-tabs-actions:empty { display: none; }
  sol-tabs > .sol-tabs-content {
    flex: 1 1 auto; min-height: 0; min-width: 0;
    max-width: 100%;
    display: flex; flex-direction: column; gap: 12px;
    overflow: auto;
    padding: 16px 20px;
    box-sizing: border-box;
  }
  sol-tabs[variant="sub"] > .sol-tabs-content { padding: 0; }
  sol-tabs > .sol-tabs-content > * {
    min-width: 0; max-width: 100%;
  }
  sol-tabs > .sol-tabs-content img,
  sol-tabs > .sol-tabs-content video,
  sol-tabs > .sol-tabs-content iframe,
  sol-tabs > .sol-tabs-content table,
  sol-tabs > .sol-tabs-content pre {
    max-width: 100%;
  }
  /* Link launchers (sol-tabs.js _buildLinkLauncher): an icon button on the bar
     whose click toggles a keep-alive embed overlay over the tab content. */
  sol-tabs > .sol-tabs-bar .sol-bar-link {
    display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    padding: 4px; border-radius: 4px; color: inherit;
    font-size: max(20px, 1.25em); line-height: 1; font-family: inherit;
  }
  sol-tabs > .sol-tabs-bar .sol-bar-link:hover { background: var(--focus-bg, #e3f2fd); }
  sol-tabs > .sol-tabs-bar .sol-bar-link[aria-expanded="true"] {
    background: var(--focus-bg, #e3f2fd);
    box-shadow: inset 0 0 0 2px var(--accent-dark, #1976d2);
  }
  sol-tabs > .sol-tabs-bar .sol-bar-link img {
    width: 1.3em; height: 1.3em; object-fit: contain; display: block;
  }
  /* A tab's ui:icon, painted before its name (emoji as text, URL as <img>). */
  sol-tabs > .sol-tabs-bar [role="tab"] .sol-tab-icon {
    display: inline-flex; align-items: center;
    vertical-align: middle;
    margin-right: var(--space-sm, 6px);
    pointer-events: none;
  }
  sol-tabs > .sol-tabs-bar [role="tab"] .sol-tab-icon img {
    width: 1.1em; height: 1.1em; object-fit: contain; display: block;
  }

  /* ── Mobile navigator ───────────────────────────────────────────────────
     On a touch / coarse-pointer device <sol-tabs> swaps its strip for a
     full-width TRIGGER (in the bar) that opens a bottom SHEET (mounted on
     <body>, sol-tabs.js _renderNavSheet): a tactile, themeable, room-coloured
     list — submenus as sections, leaves as rows — far nicer on a phone than a
     horizontal tab strip or the OS <select> picker. Only built on coarse
     pointers, so a fine-pointer (desktop) DOM is unchanged. Colours come from
     host vars (--surface/--text/--accent and a per-row --row-accent), so an app
     themes it without forking the component.
     ── the trigger ── */
  .sol-tabs-navtrigger { display: none; }
  @media (hover: none) and (pointer: coarse) {
    /* Hide the tab CONTROLS the sheet replaces — but NOT the .sol-tabs-launch
       group: those are page-level launchers the host may re-home (dk docks them
       at the bottom of the phone). */
    sol-tabs > .sol-tabs-bar > button,
    sol-tabs > .sol-tabs-bar > sol-dropdown-button { display: none; }
    sol-tabs > .sol-tabs-bar { flex-wrap: nowrap; padding: 8px 12px; gap: 0; }
    sol-tabs > .sol-tabs-bar > .sol-tabs-navtrigger {
      display: flex; align-items: center; gap: 10px;
      flex: 1 1 auto; width: 100%; max-width: 100%; box-sizing: border-box;
      /* One shared chip across the phone (M4): 44px min, 0 16px pad,
         stadium radius, 16px-floor type — the same metrics as the feed's
         source chips and the players' Browse pills. */
      min-height: 44px; padding: 0 16px;
      font: inherit; font-size: max(16px, 1em); font-weight: 600;
      color: var(--text, #1a1a1a); text-align: left;
      background: var(--surface, #fff);
      border: 1px solid var(--border, #c8c8c8); border-radius: 999px;
      cursor: pointer;
    }
    .sol-tabs-navtrigger-label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sol-tabs-navtrigger-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto;
      background: var(--row-accent, var(--accent, #888)); }
    .sol-tabs-navtrigger-chev { flex: 0 0 auto; width: 0; height: 0; opacity: .5;
      border-left: 5px solid transparent; border-right: 5px solid transparent;
      border-bottom: 6px solid currentColor; }   /* up-caret: the sheet rises */
  }

  /* ── the sheet (a <sol-sheet> on <body>; only created on coarse pointers).
     Scrim / panel / grip / open-close animation live in sol-sheet's shadow —
     only the slotted LIST and its rows are styled here. ── */
  .sol-tabs-sheet-list { overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 10px; }
  /* Accordion group header (a submenu / Launch): reads like a section label but
     is a tappable row with a chevron that rotates when its leaves are expanded. */
  .sol-tabs-sheet-grouphead {
    display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
    min-height: 46px; padding: 6px 12px; margin: 2px 0 0;
    font: inherit; font-size: max(16px, .82em);
    letter-spacing: .07em; font-weight: 700;
    color: var(--text-muted, #8a8a8a);
    background: none; border: 0; border-radius: 11px; cursor: pointer; text-align: left;
  }
  .sol-tabs-sheet-grouphead:active { background: var(--hover, rgba(0,0,0,.06)); }
  .sol-tabs-sheet-grouplabel { flex: 1 1 auto; }
  .sol-tabs-sheet-groupchev { flex: 0 0 auto; width: 0; height: 0; opacity: .7;
    border-left: 5px solid transparent; border-right: 5px solid transparent;
    border-top: 6px solid currentColor; transition: transform .2s ease; }
  .sol-tabs-sheet-grouphead.expanded .sol-tabs-sheet-groupchev { transform: rotate(-180deg); }
  /* Collapsible body: grid 0fr→1fr animates height with no magic max-height. */
  .sol-tabs-sheet-group { display: grid; grid-template-rows: 0fr;
    transition: grid-template-rows .24s ease; }
  .sol-tabs-sheet-group.expanded { grid-template-rows: 1fr; }
  .sol-tabs-sheet-group-inner { overflow: hidden; min-height: 0; }
  .sol-tabs-sheet-item {
    display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box;
    min-height: 44px; padding: 4px 12px;
    font: inherit; font-size: max(16px, 1.03em); color: var(--text, #1a1a1a);
    background: none; border: 0; border-radius: 12px; cursor: pointer; text-align: left;
  }
  /* leaves sit indented under their group header */
  .sol-tabs-sheet-group-inner .sol-tabs-sheet-item { padding-left: 22px; }
  .sol-tabs-sheet-item:active { background: var(--hover, rgba(0,0,0,.06)); }
  /* The accent rail shows only on the ACTIVE row (Apple-Music-style: inactive
     rows stay clean text); the transparent rail keeps every label aligned. */
  .sol-tabs-sheet-bar { flex: 0 0 auto; width: 4px; align-self: stretch; margin: 9px 0;
    border-radius: 2px; background: transparent; }
  .sol-tabs-sheet-label { flex: 1 1 auto; }
  .sol-tabs-sheet-check { flex: 0 0 auto; width: 17px; text-align: center; opacity: 0;
    color: var(--row-accent, var(--accent, #333)); font-weight: 800; }
  .sol-tabs-sheet-check::after { content: '\\2713'; }   /* ✓ */
  .sol-tabs-sheet-item.is-active {
    background: color-mix(in srgb, var(--row-accent, var(--accent, #999)) 15%, transparent);
    color: var(--row-accent, var(--accent)); font-weight: 700;
  }
  .sol-tabs-sheet-item.is-active .sol-tabs-sheet-bar { background: var(--row-accent, var(--accent, #999)); }
  .sol-tabs-sheet-item.is-active .sol-tabs-sheet-check { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .sol-tabs-sheet-group, .sol-tabs-sheet-groupchev { transition: none; }
  }
`;
