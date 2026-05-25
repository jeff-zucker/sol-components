import { sheetFrom } from '../../core/adopt.js';
import { BTN_CSS } from './buttons-css.js';

export const CSS = BTN_CSS + `
  /* Hidden by default. Frames embed sol-login for the auth-needed
     listener side-effect; the element surfaces UI only when an auth
     prompt is actively in flight (host gains the 'active' attribute)
     so callers do not need to allocate chrome space for a permanent
     login chip. Hosts that DO want a permanent chip can override
     with style="display: inline-flex". */
  :host { display: none; }
  :host([active]),
  :host([visible]) {
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

  /* Hint shown above the issuer list while auto-login is in flight.
     Names the issuer being signed into and prompts the user to click
     another option in the list to switch. Inserted/removed by
     _showSwitchHint / _hideSwitchHint as part of the auth-needed
     auto-login flow. */
  .switch-hint {
    font-size: 0.78em;
    color: var(--text-muted, #4d4d4d);
    padding: 2px 6px 6px 6px;
    border-bottom: 1px solid var(--border-soft, #e5e5e5);
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

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
