// Styles for <sol-gallery>'s shadow root. Exports the raw `CSS` string plus a
// constructable `sheet`, matching the other web/styles/*-css.js modules. All
// colours / metrics reference the shared design tokens so the component themes
// with the rest of the suite (see <sol-feed>'s css for the token set).
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: flex;
    flex-direction: row;
    height: 100%;
    max-height: 100vh;
    min-height: 0;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    font-size: var(--font-size, 20px);
    color: var(--text, #212121);
    background: var(--bg, #f5f5f5);
  }
  * { box-sizing: border-box; }

  /* ── left: two-column Miller browser ─────────────────────────────────── */
  .gallery-cols {
    flex: 0 0 auto;
    display: flex;
    min-height: 0;
    background: var(--surface, #fff);
    border-right: 1px solid var(--border, #d0d0d0);
  }
  .gallery-col {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  /* col 1 (groups over sub-topics) and col 2 (collections). */
  .gallery-col1 { flex: 0 0 11rem; border-right: 1px solid var(--border, #d0d0d0); }
  .gallery-col2 { flex: 0 0 14rem; }

  .gallery-pane { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  /* Groups pane sits at the top of col 1 and is only as tall as its rows;
     the sub-topics + collections panes take the rest and scroll. */
  .gallery-groups { flex: 0 0 auto; border-bottom: 1px solid var(--border, #d0d0d0); }
  .gallery-subtopics,
  .gallery-collections { flex: 1 1 auto; }

  .gallery-pane-head {
    flex: 0 0 auto;
    padding: .45rem .6rem .3rem;
    font-size: .68em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted, #7f8c8d);
  }
  .gallery-list {
    list-style: none;
    margin: 0;
    padding: 0 .35rem .6rem;
    overflow: auto;
    min-height: 0;
  }
  .gallery-pane-hint {
    padding: .35rem .5rem;
    font-size: .75em;
    font-style: italic;
    color: var(--text-muted, #7f8c8d);
  }

  .gallery-row {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: .8em;
    padding: .35rem .55rem;
    margin: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text, #212121);
    cursor: pointer;
    line-height: 1.3;
  }
  .gallery-row:hover { background: var(--hover, #eaf2fb); }
  .gallery-row.selected {
    background: var(--focus-bg, #ebf5fb);
    color: var(--selected-fg, var(--link, #2980b9));
    font-weight: 600;
  }
  .gallery-row:focus-visible { outline: 2px solid var(--accent, #3498db); outline-offset: -2px; }
  /* Groups read as section headers; collections read as links. */
  .gallery-group {
    font-size: .82em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .03em;
  }
  .gallery-collection { color: var(--link, var(--accent, #2980b9)); }

  /* ── right: the image grid ───────────────────────────────────────────── */
  .gallery-main {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
  }
  .gallery-head {
    flex: 0 0 auto;
    margin: 0;
    padding: .8rem 1rem .2rem;
    font-family: var(--font-display, var(--font-ui, serif));
    font-size: 1.05em;
    font-weight: 600;
    color: var(--text, #212121);
  }
  .gallery-status {
    flex: 0 0 auto;
    padding: .2rem 1rem .6rem;
    font-size: .78em;
    color: var(--text-muted, #7f8c8d);
  }
  .gallery-status[data-error] { color: var(--error, #e74c3c); }
  .gallery-empty {
    margin: auto;
    padding: 2rem;
    color: var(--text-muted, #7f8c8d);
    font-style: italic;
    text-align: center;
  }

  /* Masonry via CSS multicol — varying-height thumbs flow into columns. */
  .gallery-grid {
    flex: 1 1 auto;
    columns: 220px;
    column-gap: .7rem;
    padding: 0 1rem 1rem;
  }
  .gallery-thumb {
    break-inside: avoid;
    margin: 0 0 .7rem;
    padding: 0;
    border: none;
    width: 100%;
    display: block;
    background: var(--surface, #fff);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 4px var(--shadow, rgba(0,0,0,0.08));
  }
  .gallery-thumb img {
    width: 100%;
    height: auto;
    display: block;
    background: color-mix(in srgb, var(--bg, #ccc) 70%, #000);
  }
  .gallery-thumb:hover { box-shadow: 0 3px 12px var(--shadow, rgba(0,0,0,0.22)); }
  .gallery-thumb:focus-visible { outline: 2px solid var(--accent, #3498db); outline-offset: 2px; }

  .gallery-sentinel { height: 1px; }
  .gallery-more {
    flex: 0 0 auto;
    align-self: center;
    margin: .2rem auto 1rem;
    font: inherit;
    font-size: .8em;
    padding: .35rem 1.1rem;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 999px;
    background: var(--surface, #fff);
    color: var(--text, #212121);
    cursor: pointer;
  }
  .gallery-more:hover { background: var(--hover, #eaf2fb); }

  /* ── lightbox overlay ────────────────────────────────────────────────── */
  .gallery-lightbox {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.86);
    padding: 2.5rem 4rem;
  }
  .gallery-lightbox[hidden] { display: none; }
  .gallery-lightbox img {
    max-width: 100%;
    max-height: calc(100% - 3rem);
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0,0,0,.6);
    cursor: zoom-in;
  }

  /* Actual-size (100%) view: full-bleed, natural pixels, scroll to pan. */
  .gallery-lightbox.zoomed {
    padding: 0;
    display: block;          /* a block scroll container, not the flex box */
    overflow: auto;
  }
  .gallery-lightbox.zoomed img {
    max-width: none;
    max-height: none;
    width: auto;
    height: auto;
    object-fit: none;
    border-radius: 0;
    margin: auto;            /* centre when smaller than the viewport */
    cursor: zoom-out;
  }
  .gallery-lightbox.zoomed .gallery-lb-caption,
  .gallery-lightbox.zoomed .gallery-lb-prev,
  .gallery-lightbox.zoomed .gallery-lb-next { display: none; }
  /* Keep Close reachable while the overlay scrolls. */
  .gallery-lightbox.zoomed .gallery-lb-close { position: fixed; z-index: 1001; }
  .gallery-lb-caption {
    margin-top: .8rem;
    max-width: 60rem;
    text-align: center;
    color: #f0f0f0;
    font-size: .8em;
    line-height: 1.4;
  }
  .gallery-lb-caption a { color: #9cd0ff; }
  .gallery-lb-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 2.2rem;
    line-height: 1;
    width: 3rem;
    height: 4rem;
    border: none;
    border-radius: 8px;
    background: rgba(255,255,255,.1);
    color: #fff;
    cursor: pointer;
  }
  .gallery-lb-btn:hover { background: rgba(255,255,255,.22); }
  .gallery-lb-prev { left: .6rem; }
  .gallery-lb-next { right: .6rem; }
  .gallery-lb-close {
    position: absolute;
    top: .6rem;
    right: .8rem;
    font-size: 1.6rem;
    line-height: 1;
    width: 2.4rem;
    height: 2.4rem;
    border: none;
    border-radius: 8px;
    background: rgba(255,255,255,.1);
    color: #fff;
    cursor: pointer;
  }
  .gallery-lb-close:hover { background: rgba(255,255,255,.22); }
  .gallery-lb-btn:focus-visible,
  .gallery-lb-close:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

export const sheet = sheetFrom(CSS);
