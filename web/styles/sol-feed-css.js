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

  /* ── feed + topic link lists ─────────────────────────────────────────── */
  /* Both feed and topic stack vertically and fill the host. Topic puts a
     fixed-height source pane on top (~5 entries, scrolling for more) and
     the article list below. */
  .sol-feed-list {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  .sol-feed-list.feed  { gap: 0; }
  .sol-feed-list.topic { gap: .9rem; }

  .feed-sources,
  .feed-items {
    margin: 0;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    background: var(--surface, #fff);
  }
  /* Topic view: a touch darker border so the two floating panels stand
     apart from the page; the slightly taller .9rem gap above gives them
     breathing room. */
  .sol-feed-list.topic .feed-sources,
  .sol-feed-list.topic .feed-items { border-color: #6e6e6e; }
  /* topic: the sources pane shows ~5 entries; the rest scroll inside it */
  .feed-sources { flex: 0 0 11rem; overflow: auto; }
  /* the articles list fills whatever height is left in the column */
  .feed-items {
    list-style: none;
    padding: 0;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .feed-source-list { list-style: none; margin: 0; padding: 0; }
  .feed-source-list li + li,
  .feed-items li + li { border-top: 1px solid var(--border, #eee); }

  .feed-link {
    display: block;
    padding: .45rem .7rem;
    /* Article and source links use the theme's link colour (themed
       in root.css for light + dark), with --accent as the legacy
       fallback for pages that load sol-feed without root.css. */
    color: var(--link, var(--accent, #2980b9));
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

  /* ── all view ───────────────────────────────────────────────────────── */
  /* Two-tone defaults: a darker strip behind the top-bar (controls)
     and a lighter strip behind the articles grid, both relative to
     the page --bg via color-mix. Override via
     --feed-top-bar-bg / --feed-articles-bg (or by re-styling the
     "top-bar" / "articles" shadow parts from outside) when the
     defaults don't suit. The two strips sit flush so they read as
     one continuous two-tone panel, rounded at the outer corners. */
  .feed-top-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: .6rem;
    margin: 0;
    padding: .8rem .9rem;
    background: var(--feed-top-bar-bg,
                    color-mix(in srgb, var(--bg, #f5f5f5) 75%, #000));
    border-radius: var(--radius-md, 6px) var(--radius-md, 6px) 0 0;
  }
  .feed-source-buttons {
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    gap: .35rem;
    min-width: 0;
  }
  .feed-source-btn {
    font: inherit;
    font-size: .85em;
    padding: .3rem .9rem;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 999px;
    background: var(--surface, #fff);
    color: var(--text, #212121);
    cursor: pointer;
    white-space: nowrap;
  }
  .feed-source-btn:hover { background: var(--hover, #eaf2fb); }
  .feed-source-btn.selected {
    background: var(--accent, #3498db);
    color: #fff;
    border-color: var(--accent, #3498db);
  }
  .feed-source-btn:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: 2px;
  }

  .feed-picker-toggle {
    font: inherit;
    font-size: 1.2em;
    line-height: 1;
    padding: .25rem .5rem;
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

  /* Two-column picker: left = instruction + topic fieldsets; right = the
     "add topic / add source" forms. */
  .feed-picker {
    flex: 0 0 auto;
    align-self: center;
    width: 100%;
    max-width: 1280px;
    display: grid;
    /* left column carries the topic fieldsets — give it room so each
       fieldset can fit several checkboxes side-by-side. */
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    margin: 0 0 1rem;
  }
  .feed-picker[hidden] { display: none; }
  .feed-picker-left,
  .feed-picker-right { display: flex; flex-direction: column; gap: .55rem; min-width: 0; }
  .feed-picker-instruct {
    margin: 0;
    font-style: italic;
    color: var(--text-muted, #7f8c8d);
    font-size: .9em;
  }
  .feed-picker-note {
    margin: 0;
    font-size: .75em;
    color: var(--text-muted, #7f8c8d);
  }
  .feed-picker-note[data-error] { color: var(--error, #e74c3c); }

  /* Add-topic / add-feed forms are <form>s wrapping a <fieldset>; the
     fieldset carries the visible chrome so its legend sits on the top
     border, matching the .feed-topic source-picker boxes. */
  .feed-add-wrap { margin: 0; }
  .feed-add-form {
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 6px;
    background: var(--surface, #fff);
    margin: 0;
    padding: .2rem .8rem .55rem;     /* match .feed-topic */
    display: flex;
    flex-direction: column;
    gap: .35rem;
  }
  .feed-add-form legend {
    font-size: .74em;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--text-muted, #7f8c8d);
    padding: 0 .3rem;
  }
  .feed-add-form label {
    display: flex;
    flex-direction: column;
    gap: .15rem;
    font-size: .8em;
    color: var(--text, #212121);
  }
  .feed-add-form input,
  .feed-add-form select {
    font: inherit;
    font-size: .9em;
    padding: .2rem .35rem;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: 4px;
    background: var(--surface, #fff);
    color: var(--text, #212121);
  }
  .feed-add-form button[type="submit"] {
    align-self: flex-end;
    font: inherit;
    font-size: .8em;
    padding: .25rem .8rem;
    border: 1px solid var(--accent, #3498db);
    border-radius: 6px;
    background: var(--accent, #3498db);
    color: #fff;
    cursor: pointer;
    margin-top: .15rem;
  }
  .feed-add-form button[type="submit"]:hover { filter: brightness(.94); }
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

  /* Articles container — a grid of horizontal cards for the active
     feed. Sits flush against the top-bar above; together they form a
     two-tone panel (darker strip / lighter strip) framed by rounded
     outer corners. Override --feed-articles-bg to retint, or
     re-style the "articles" shadow part from outside. */
  .feed-articles {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    grid-auto-rows: min-content;
    gap: 1rem;
    padding: 1.4rem 1rem 1rem;
    background: var(--feed-articles-bg,
                    color-mix(in srgb, var(--bg, #f5f5f5) 88%, #000));
    border-radius: 0 0 var(--radius-md, 6px) var(--radius-md, 6px);
  }

  /* Horizontal card: image on the left, title on the right. The outer
     dimensions are fixed so image-less cards keep the same footprint —
     a coloured placeholder block stands in for the missing image. */
  .feed-card {
    display: flex;
    flex-direction: row;
    width: 17rem;
    aspect-ratio: 3 / 2;
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #d0d0d0);
    box-shadow: 0 1px 4px var(--shadow, rgba(0,0,0,0.08));
    text-decoration: none;
    color: var(--text, #212121);
  }
  .feed-card-img {
    flex: 0 0 6rem;
    width: 6rem;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* Stand-in for cards without an image, same size as .feed-card-img. */
  .feed-card.no-image::before {
    content: '';
    flex: 0 0 6rem;
    background: linear-gradient(135deg, var(--accent, #3498db), var(--accent-dark, #2980b9));
  }

  .feed-card-title {
    flex: 1 1 auto;
    margin: 0;
    padding: .55rem .7rem;
    font-family: var(--font-ui, system-ui, sans-serif);
    font-size: .88em;
    font-weight: 400;
    line-height: 1.3;
    /* Article titles are link text — use the theme's link colour
       (themed in root.css for light + dark) so they read as clickable
       even though the whole card is the click target. */
    color: var(--link, var(--accent, #2980b9));
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
  }

  /* ── focus visibility ───────────────────────────────────────────────── */
  .feed-link:focus-visible,
  .feed-card:focus-visible,
  .feed-topic input:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: -2px;
  }

`;

export const sheet = sheetFrom(CSS);
