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
  sol-tabs .sol-tab-embed {
    display: flex; flex-direction: column;
    flex: 1; min-height: 0; min-width: 0;
    width: 100%; max-width: 100%;
    overflow: auto;
  }
  sol-tabs[orientation="vertical"] {
    flex-direction: row;
  }
  sol-tabs > .sol-tabs-bar {
    display: flex; flex-shrink: 0;
    border-bottom: 1px solid var(--border, #e0e0e0);
    padding: 0 12px; gap: 2px;
    overflow-x: auto; overflow-y: hidden;
    scrollbar-width: thin;
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
    font-size: 105%;
    color: var(--text-muted, #666);
    cursor: pointer; margin-bottom: -1px; font-family: inherit;
    white-space: nowrap; flex-shrink: 0;
  }
  sol-tabs[variant="sub"] > .sol-tabs-bar > button {
    padding: 8px 14px; font-size: 18px;
    border-bottom-width: 2px;
  }
  sol-tabs > .sol-tabs-bar > button:hover { color: var(--accent-dark, #1976d2); }
  sol-tabs > .sol-tabs-bar > button.active {
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
`;
