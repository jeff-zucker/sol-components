// Styles for <sol-search>'s shadow root. Two layouts share one stylesheet:
//
//   :host([data-view="button"])  — icon trigger + floating panel.
//   :host([data-view="inline"])  — bare form, no trigger, flows inline.
//
// The component writes the resolved `view` to `dataset.view` on the host so
// these :host() selectors can pick the right rules.
import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: inline-block;
    font-family: var(--font-ui, system-ui, sans-serif);
    font-size: var(--font-size, 1rem);
    color: var(--text, #212121);
  }
  /* Inline mode wants to lay out its form normally; the host shouldn't be
     a stacking context with relative positioning the way the button mode
     needs (so the floating panel positions against the trigger). */
  :host([data-view="button"]) { position: relative; }
  :host([data-view="inline"]) { display: inline-flex; align-items: center; }

  /* ── trigger button (view=button only) ──────────────────────────────── */
  /* Looks like the host text — a single search glyph that adopts the
     surrounding colour, so it sits comfortably in a header strip
     alongside time / weather. */
  button.icon {
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    font-size: 1.2em;
    line-height: 1;
    padding: .15rem .35rem;
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
  }
  button.icon:hover    { background: var(--hover, rgba(0,0,0,.06)); }
  button.icon:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: 2px;
  }

  /* ── floating panel (view=button only) ──────────────────────────────── */
  /* Hidden until [open]; positioning is finalised in JS so the right edge
     of the panel lines up with the right edge of the trigger. */
  .panel {
    position: fixed;
    z-index: 1000;
    display: none;
    min-width: 18rem;
    padding: .75rem;
    background: var(--surface, #fff);
    color: var(--text, #212121);
    border: 1px solid var(--border, #d0d0d0);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 8px 24px rgba(0,0,0,.18);
  }
  .panel[open] { display: block; }

  /* ── form (shared) ──────────────────────────────────────────────────── */
  /* Inline mode flows the row + engines horizontally; the panel mode wraps
     them on top of each other inside the floating box. */
  :host([data-view="inline"]) form.form {
    display: inline-flex;
    align-items: center;
    gap: .6rem;
    flex-wrap: wrap;
  }

  .row { display: flex; gap: .35rem; }

  input.q {
    flex: 1 1 auto;
    min-width: 0;
    padding: .35rem .5rem;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: var(--radius-sm, 4px);
    background: var(--bg, #fff);
    color: var(--text, #212121);
    font: inherit;
  }
  input.q:focus-visible {
    outline: 2px solid var(--accent, #3498db);
    outline-offset: 0;
    border-color: var(--accent, #3498db);
  }
  /* In inline mode the input expands to fill the host's available row
     space (the host itself is inline-flex). A small min-width keeps it
     usable when the host gets squeezed; callers can cap it with their
     own ::part(input) { max-width: … } rule if they want it narrower. */
  :host([data-view="inline"]) input.q {
    flex: 1 1 auto;
    min-width: 8rem;
  }
  /* When the search row is the only content in its column, the form
     itself should stretch so flex children (the input) have room to grow. */
  :host([data-view="inline"]) form.form { flex: 1 1 auto; min-width: 0; }
  :host([data-view="inline"]) .row     { flex: 1 1 auto; min-width: 0; }

  button.go {
    padding: .35rem .7rem;
    border: 1px solid var(--accent, #3498db);
    background: var(--accent, #3498db);
    color: #fff;
    border-radius: var(--radius-sm, 4px);
    font: inherit;
    cursor: pointer;
  }
  button.go:hover {
    background: var(--accent-dark, #2980b9);
    border-color: var(--accent-dark, #2980b9);
  }

  /* .engines is a flex-wrap row of engine radios. When the list is too
     wide for the available width, items continue on subsequent rows.
     .engines-line is a single-flex-item wrapper that forces the
     engines onto their own row below the input + Go row in the
     inline view. */
  .engines-line {
    display: flex;
    align-items: flex-start;
    min-width: 0;
  }
  .engines {
    margin-top: .5rem;
    font-size: .9em;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    /* Centre each row of engines horizontally — applies on both the
       first row and any wrapped rows below it, so the engine block
       reads as a centred cluster under the input. */
    justify-content: center;
    gap: .35rem .9rem;
  }
  /* Inline view: force the engines line onto its own row below the
     input + Go row (so a wide input doesn't share its row with the
     engines). The wrapping itself comes from .engines's flex-wrap. */
  :host([data-view="inline"]) .engines-line {
    flex: 1 1 100%;
    margin-top: 0;
  }
  :host([data-view="inline"]) .engines { margin-top: 0; }

  .engine { display: inline-flex; align-items: center; gap: .25rem; cursor: pointer; white-space: nowrap; flex: 0 0 auto; }

  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
    white-space: nowrap; border: 0;
  }
`;

export const sheet = sheetFrom(CSS);
export default sheet;
