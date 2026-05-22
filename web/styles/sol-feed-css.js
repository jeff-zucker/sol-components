// Styles for <sol-feed>'s shadow root. Exports the raw `CSS` string plus a
// constructable `sheet` (null in non-DOM envs) — the same shape as the
// other web/styles/*-css.js modules. All colours and metrics reference the
// shared design tokens so the component themes with the rest of the suite.
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: flex;
    flex-direction: column;
    /* Respect whatever height the container gives us; with no container
       height, fall back to this viewport cap. Either way the article list
       scrolls inside the component and never overflows its container. */
    height: 100%;
    max-height: 100vh;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    font-size: var(--font-size, 20px);
    color: var(--text, #212121);
  }
  * { box-sizing: border-box; }

  /* The component owns its own scrolling: each view puts the scrollbar on
     its own list/grid, so the status line and news picker stay pinned. */
  .sol-feed { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }

  /* ── status / loading / empty ───────────────────────────────────────── */
  .sol-feed-status {
    flex: 0 0 auto;
    padding: .5rem .75rem;
    color: var(--text-muted, #7f8c8d);
    font-size: .85em;
  }
  .sol-feed-status[data-error] { color: var(--error, #e74c3c); }
  .sol-feed-empty {
    padding: 1rem .75rem;
    color: var(--text-muted, #7f8c8d);
    font-style: italic;
  }

  /* ── shared link list (single + multiple views) ─────────────────────── */
  .sol-feed-list {
    display: flex;
    gap: 1rem;
    align-items: stretch;
    flex: 1 1 auto;
    min-height: 0;
  }
  .sol-feed-list.single { flex-direction: column; gap: 0; }

  .feed-sources-nav { flex: 0 0 14rem; display: flex; }

  .feed-sources,
  .feed-items {
    margin: 0;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    background: var(--surface, #fff);
  }
  /* the lists themselves carry the scrollbar */
  .feed-sources { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .feed-items {
    list-style: none;
    padding: 0;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  /* one <ul> per topic group inside the .feed-sources container */
  .feed-source-list { list-style: none; margin: 0; padding: 0; }
  .feed-source-list li + li,
  .feed-items li + li { border-top: 1px solid var(--border, #eee); }

  .feed-group-label {
    padding: .4rem .7rem .25rem;
    font-size: .72em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--text-muted, #7f8c8d);
    background: var(--hover, #f1f3f5);
    border-top: 1px solid var(--border, #eee);
  }
  .feed-sources > .feed-group-label:first-child { border-top: none; }

  .feed-link {
    display: block;
    padding: .45rem .7rem;
    color: var(--accent, #0066cc);
    text-decoration: none;
    line-height: 1.35;
  }
  .feed-link:hover { background: var(--hover, #eaf2fb); text-decoration: underline; }
  .feed-link.selected {
    background: var(--focus-bg, #ebf5fb);
    font-weight: 600;
  }
  .feed-link .feed-link-meta {
    display: block;
    font-size: .72em;
    color: var(--text-muted, #7f8c8d);
    font-weight: 400;
  }

  /* ── news-page view ─────────────────────────────────────────────────── */
  .feed-picker-bar { flex: 0 0 auto; margin: 0 0 .6rem; }
  .feed-picker-toggle {
    font: inherit;
    font-size: .8em;
    padding: .3rem .85rem;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    background: var(--surface, #fff);
    color: var(--text, #212121);
    cursor: pointer;
  }
  .feed-picker-toggle:hover { background: var(--hover, #eaf2fb); }
  .feed-picker-toggle:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: 2px;
  }

  /* one fieldset (horizontal row of checkboxes) per topic */
  .feed-picker {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: .5rem;
    margin: 0 0 1rem;
  }
  .feed-picker[hidden] { display: none; }
  .feed-topic {
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    background: var(--surface, #fff);
    margin: 0;
    padding: .2rem .8rem .5rem;
    display: flex;
    flex-wrap: wrap;
    gap: .1rem 1.15rem;
  }
  .feed-topic legend {
    font-size: .74em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--text-muted, #7f8c8d);
    padding: 0 .3rem;
  }
  .feed-topic label {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    font-size: .82em;
    cursor: pointer;
    padding: .1rem 0;
  }
  .feed-topic input { cursor: pointer; }

  .feed-grid {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    grid-auto-rows: min-content;
    gap: 1rem;
  }

  .feed-card {
    position: relative;
    display: block;
    aspect-ratio: 3 / 2;
    border-radius: 8px;
    overflow: hidden;
    background: var(--hover, #eaeaea);
    border: 1px solid var(--border, #d0d0d0);
    box-shadow: 0 1px 4px var(--shadow, rgba(0,0,0,0.08));
    text-decoration: none;
    color: #fff;
  }
  .feed-card-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .feed-card.no-image {
    background: linear-gradient(135deg, var(--accent, #3498db), var(--accent-dark, #2980b9));
  }

  /* Title sits in a gradient scrim along the bottom. */
  .feed-card-title {
    position: absolute;
    inset: auto 0 0 0;
    margin: 0;
    padding: 1.6rem .7rem .55rem;
    font-size: .88em;
    font-weight: 600;
    line-height: 1.3;
    background: linear-gradient(transparent, rgba(0,0,0,.82));
    text-shadow: 0 1px 3px rgba(0,0,0,.6);
  }
  .feed-card-source {
    display: block;
    font-size: .72em;
    font-weight: 400;
    opacity: .85;
    margin-top: .15rem;
  }

  /* Description overlay — hidden until hover OR keyboard focus. */
  .feed-card-overlay {
    position: absolute;
    inset: 0;
    padding: .8rem .8rem 2.6rem;
    background: rgba(0,0,0,.82);
    font-size: .8em;
    line-height: 1.4;
    overflow: auto;
    opacity: 0;
    transition: opacity .15s ease;
  }
  .feed-card:hover .feed-card-overlay,
  .feed-card:focus-visible .feed-card-overlay,
  .feed-card:focus-within .feed-card-overlay { opacity: 1; }
  /* When there is no image the overlay text would be unreadable as a
     reveal, so keep it always visible against the gradient. */
  .feed-card.no-image .feed-card-overlay {
    opacity: 1;
    background: transparent;
    padding-top: .7rem;
  }
  .feed-card.no-image .feed-card-title { background: none; }

  /* ── focus visibility ───────────────────────────────────────────────── */
  .feed-link:focus-visible,
  .feed-card:focus-visible,
  .feed-topic input:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: -2px;
  }

  @media (max-width: 34rem) {
    .sol-feed-list { flex-direction: column; }
    .feed-sources-nav { flex-basis: auto; width: 100%; }
  }
`;

export const sheet = sheetFrom(CSS);
