import { sheetFrom } from '../../core/adopt.js';
import { BTN_CSS } from './buttons-css.js';

export const CSS = BTN_CSS + `
  :host { display: contents; }

  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(15,17,21,0.62);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
    font-family: var(--font-body, system-ui, -apple-system, sans-serif);
    color: var(--text, #212121);
  }

  .modal {
    background: var(--surface, #fff);
    border: 1px solid var(--border, #9aa3af);
    border-radius: 12px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 4px 10px rgba(15,17,21,0.18),
      0 28px 60px -20px var(--shadow-heavy, rgba(15,17,21,0.45));
    width: calc(100vw - 4vmin);
    height: calc(100vh - 4vmin);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  :host([size="small"]) .modal { max-width: 460px; height: auto; min-height: 0; }
  :host([size="large"]) .modal { max-width: 820px; height: auto; min-height: 0; }

  .modal-header {
    display: flex; align-items: center;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-soft, var(--border, #d6dae2));
    gap: 12px; flex-shrink: 0;
    background: var(--surface, #fff);
  }

  .modal-title {
    flex: 1; font-weight: 600; font-size: 1em;
    letter-spacing: -0.005em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .modal-header-actions {
    display: flex; align-items: center; gap: 6px; margin-right: 4px;
  }

  .modal-close {
    background: none; border: none;
    font-size: 1.15em; line-height: 1;
    color: var(--text-muted, #4a525e); cursor: pointer;
    padding: 6px 10px; border-radius: 6px;
    transition: background 0.12s, color 0.12s;
  }
  .modal-close:hover { background: var(--hover, #eef0f4); color: var(--text, #0f1115); }
  .modal-close:focus-visible {
    outline: 3px solid var(--focus-ring, var(--accent, #1565c0));
    outline-offset: 2px;
  }
  /* modal-close uses raw styles (not .sol-btn) to stay minimal. */

  .modal-body {
    flex: 1; overflow-y: auto; padding: 18px 22px;
    display: flex; flex-direction: column; gap: 12px;
    min-height: 0;
    background: var(--surface, #fff);
  }

  .modal-footer {
    display: flex; gap: 10px; align-items: center;
    padding: 12px 20px;
    border-top: 1px solid var(--border-soft, var(--border, #d6dae2));
    flex-shrink: 0;
    background: var(--surface-2, #f5f6f9);
  }
  .modal-footer:empty { display: none; }

  .modal-zoom-pct { font-size: 0.8em; color: var(--text-muted, #4a525e); min-width: 3em; text-align: center; }

  .modal-input {
    /* Fit-width with a max-width cap; does NOT fill the row. */
    width: min(100%, 50ch);
    min-width: 18ch;
    max-width: 50ch;
    box-sizing: border-box;
    /* Reset UA form-control styling so font + line-height are ours, not
       the browser's per-input-type defaults (which otherwise render in
       e.g. Arial/Helvetica regardless of inherited body font). */
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    line-height: 1.2;
    padding: 0.4em 0.7em;
    border: 1px solid var(--border-soft, var(--border, #d6dae2));
    border-radius: 6px;
    /* Explicit height (not min-height) so input and the adjacent
       .modal-row > .sol-btn are pixel-for-pixel identical. Both compute
       to: 1.2em line + 0.8em vertical padding + 2px border. */
    height: calc(1.2em + 0.8em + 2px);
    background: var(--surface, #fff); color: var(--text, #0f1115);
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .modal-input:focus {
    outline: none;
    border-color: var(--accent, #0f4ea0);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #0f4ea0) 22%, transparent);
  }

  .modal-label { font-size: 0.9em; color: var(--text-muted, #4a525e); }
  .modal-message { padding: 8px 0; color: var(--text-muted, #4a525e); font-size: 0.95em; }
  .modal-message.error { color: var(--error, #b3261e); }
  .modal-note { font-size: 0.8em; color: var(--text-faint, #7a8390); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .modal-info-banner {
    background: var(--warning-bg, #fff4d4);
    border: 1px solid var(--warning-border, #e2b870);
    border-left: 3px solid var(--warning-border, #e2b870);
    border-radius: 6px; padding: 9px 13px;
    font-size: 0.88em; color: var(--warning-text, #5d4037);
    flex-shrink: 0;
  }

  .modal-body-component {
    display: flex; flex-direction: column;
    width: 100%; height: 100%;
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
