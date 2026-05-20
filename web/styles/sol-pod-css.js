// Styles for <sol-pod>'s own shadow root — the pod header, breadcrumb,
// tree, and status toast. Rules rendered inside sol-modal's shadow root
// live in sol-pod-modal-css.js instead.
import { sheetFrom } from '../../core/adopt.js';
import { BTN_CSS } from './buttons-css.js';

export const CSS = BTN_CSS + `
  :host {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface, #fff);
    border-radius: 8px;
    box-shadow: 0 2px 8px var(--shadow, rgba(0,0,0,0.1));
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--text, #212121);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .pod-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border, #e0e0e0);
    flex-shrink: 0;
    display: flex; flex-direction: column; gap: 6px;
  }
  .pod-header-row {
    display: flex; align-items: center; gap: 6px;
  }
  .pod-header select {
    flex: 1; padding: 6px 10px;
    border: 1px solid var(--border, #e0e0e0); border-radius: 4px;
    font-size: 0.9em;
    background: var(--surface, #fff); color: var(--text, #212121);
    font-family: inherit;
  }

  .breadcrumb {
    padding: 10px 20px;
    background: var(--surface-2, #f9f9f9);
    border-bottom: 1px solid var(--border, #e0e0e0);
    font-size: 0.9em; color: var(--text-muted, #666);
    flex-shrink: 0;
  }
  .breadcrumb button {
    padding: 4px 8px; font-size: 0.9em; margin-right: 5px;
    background: var(--surface-2, #f9f9f9); border: none;
    color: var(--text-muted, #666); cursor: pointer;
    border-radius: 4px; font-family: inherit;
  }
  .breadcrumb button:hover { background: var(--hover, #f0f0f0); color: var(--accent, #2196f3); }

  .pod-filter-row {
    padding: 6px 14px;
    border-bottom: 1px solid var(--border-soft, var(--border, #e0e0e0));
    background: var(--surface, #fff);
    flex-shrink: 0;
  }
  .pod-filter {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 4px;
    background: var(--surface, #fff);
    color: var(--text, #212121);
    font-family: inherit; font-size: 0.85em;
    box-sizing: border-box;
  }
  .pod-filter::placeholder { color: var(--text-faint, #999); }
  .pod-filter:focus {
    outline: none;
    border-color: var(--accent, #2196f3);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #2196f3) 22%, transparent);
  }

  .tree-wrapper {
    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px;
    outline: none;
  }
  .tree-wrapper:focus-visible {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent, #2196f3) 35%, transparent);
  }
  .file-tree { list-style: none; }
  .file-tree li {
    display: flex; align-items: center;
    padding: 6px 12px; margin: 4px 0;
    border-radius: 4px; cursor: pointer;
    transition: background 0.2s; outline: none;
  }
  .file-tree li:hover { background: var(--hover, #f0f0f0); }
  .file-tree li:focus { background: var(--focus-bg, #e3f2fd); box-shadow: 0 0 0 2px var(--accent, #2196f3); }

  .item-label { flex: 1; word-break: break-word; min-width: 0; }

  .item-gear {
    flex-shrink: 0; background: none; border: none;
    padding: 2px 6px; font-size: 1em;
    color: var(--text-faint, #999); cursor: pointer;
    border-radius: 4px; margin-left: 6px;
    transition: color 0.15s;
  }
  .item-gear:hover { color: var(--accent-dark, #1976d2); background: var(--focus-bg, #e3f2fd); }

  .file-tree .folder { font-weight: 500; color: var(--folder-color, var(--accent-dark, #1976d2)); }
  .file-tree .file   { color: var(--file-color, #424242); }
  .file-tree li[draggable="true"] { cursor: grab; }
  .file-tree li.dragging { opacity: 0.5; cursor: grabbing; }
  .file-tree li.selected {
    background: var(--selected-bg, #c8e6f5);
    box-shadow: 0 0 0 1px var(--accent, #2196f3) inset;
  }
  .file-tree li.selected:hover { background: var(--selected-hover, #b0d8ef); }

  .drag-over .tree-wrapper {
    background: var(--focus-bg, #e3f2fd);
    outline: 2px dashed #4caf50; outline-offset: -2px;
  }

  .loading { padding: 20px; text-align: center; color: var(--text-faint, #999); }
  .empty { padding: 20px; text-align: center; color: var(--text-faint, #999); font-style: italic; }

  .status-toast {
    position: fixed; top: 52px; left: 50%; transform: translateX(-50%);
    z-index: 9998; display: none;
    align-items: center; gap: 10px;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 6px; padding: 8px 10px 8px 14px;
    font-size: 0.85em;
    box-shadow: 0 3px 14px var(--shadow, rgba(0,0,0,0.1));
    max-width: 420px; min-width: 160px;
    transition: opacity 0.4s ease;
  }
  .status-toast.error { background: #fff0f0; border-color: #f5c6cb; color: #c0392b; }
  .status-toast.success { color: var(--success, #388e3c); }
  .status-toast-close {
    background: none; border: none; cursor: pointer;
    font-size: 1.1em; color: inherit; opacity: 0.55;
    padding: 0 4px; line-height: 1; flex-shrink: 0;
  }
  .status-toast-close:hover { opacity: 1; }

  button { font-family: inherit; }
  button:focus { outline: 2px solid var(--accent, #2196f3); outline-offset: 2px; }
  /* Breadcrumb buttons use .sol-btn .sol-btn-sm .sol-btn-ghost. */
`;

export const sheet = sheetFrom(CSS);
export default sheet;
