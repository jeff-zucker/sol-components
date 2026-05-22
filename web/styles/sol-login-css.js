import { sheetFrom } from '../../core/adopt.js';
import { BTN_CSS } from './buttons-css.js';

export const CSS = BTN_CSS + `
  :host {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    /* Anchor to the theme font token so the button scales with it. */
    font-size: var(--font-size, 20px);
  }

  .auth-status {
    font-size: 0.7em;
    color: var(--text-muted, #666);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }
  .auth-status.logged-in { color: var(--success, #388e3c); }

  /* Match the padding of the pod header controls (select / gear) it
     sits between, so the row reads as one set of controls. */
  .auth-btn { padding: 6px 10px; }

  /* Logged in: the button turns green (green = connected). */
  .auth-btn.logged-in {
    background: var(--success, #388e3c);
    border-color: var(--success, #388e3c);
    color: #fff;
  }
  .auth-btn.logged-in:hover {
    background: var(--success-dark, #2e7d32);
    border-color: var(--success-dark, #2e7d32);
  }

  /* Login button uses .sol-btn .sol-btn-sm; .sol-btn-primary when logged out. */

  .dropdown {
    position: fixed; z-index: 9999;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--shadow, rgba(0,0,0,0.1));
    padding: 8px;
    /* Size to the widest issuer so every entry fits on one line; cap to
       the viewport so it can't run off-screen. */
    width: max-content;
    min-width: 44ch; max-width: 90vw;
    display: none;
  }
  .dropdown.open { display: block; }

  .issuer-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
  .issuer-list:empty { display: none; }

  .issuer-item {
    text-align: left; background: none; border: none;
    padding: 5px 8px; border-radius: 4px;
    cursor: pointer; font-size: 0.84em;
    color: var(--text, #212121);
    white-space: nowrap;
    font-family: inherit;
  }
  .issuer-item:hover { background: var(--hover, #f0f0f0); color: var(--accent, #2196f3); }

  .custom-row { display: flex; gap: 4px; }
  .custom-row .sol-btn { padding: 6px 8px; font-size: 0.82em; }
  .custom-row .issuer-input {
    /* 44ch floor so a full issuer URL is visible; this also drives the
       dropdown's max-content width, so the panel grows to fit it. */
    flex: 1; min-width: 44ch; font-size: 0.82em; padding: 6px 8px;
    background: var(--bg, #f5f5f5);
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
