import { sheetFrom } from '../../core/adopt.js';

export const CSS = `
  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
    box-sizing: border-box;
  }

  .sol-form-loading,
  .sol-form-error {
    padding: 1em;
  }
  .sol-form-error {
    color: #c00;
    white-space: pre-wrap;
  }

  /* ── form body rendered by solid-ui ── */
  .sol-form-body {
    flex: 1;
    overflow: auto;
    padding: 0.75em;
  }
  .sol-form-body input[type="text"],
  .sol-form-body input[type="url"],
  .sol-form-body select,
  .sol-form-body textarea {
    font-family: inherit;
    font-size: 0.95em;
    padding: 4px 6px;
    border: 1px solid var(--border, #ccc);
    border-radius: 3px;
    box-sizing: border-box;
  }
  .sol-form-body input:focus,
  .sol-form-body select:focus,
  .sol-form-body textarea:focus {
    outline: 2px solid var(--accent, #3b82f6);
    outline-offset: -1px;
  }

  /* ── fallback form renderer ── */
  .sf-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sf-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sf-label {
    font-weight: 500;
    font-size: 0.9em;
    color: var(--text-muted, #374151);
  }
  .sf-multiple {
    border: 1px solid var(--border, #e0e0e0);
    border-radius: 4px;
    padding: 8px;
    background: var(--bg-subtle, rgba(0,0,0,.02));
  }
  .sf-multiple .sf-multiple {
    background: var(--bg-subtle2, rgba(0,0,0,.03));
  }
  .sf-multiple-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .sf-multiple-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-multiple-item {
    border: 1px solid var(--border, #d1d5db);
    border-radius: 4px;
    padding: 8px;
    background: var(--bg, #fff);
  }
  .sf-item-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
    margin-bottom: 6px;
  }
  .sf-btn {
    padding: 2px 8px;
    border: 1px solid var(--border, #d1d5db);
    border-radius: 3px;
    background: var(--bg, #fff);
    cursor: pointer;
    font-size: 0.8em;
    font-family: inherit;
  }
  .sf-btn:hover { background: var(--bg-hover, #f3f4f6); }
  .sf-btn-add {
    background: var(--accent, #3b82f6);
    color: #fff;
    border-color: var(--accent, #3b82f6);
    padding: 3px 12px;
    font-size: 0.85em;
  }
  .sf-btn-add:hover { background: var(--accent-hover, #2563eb); }
  .sf-btn-remove {
    color: #dc2626;
    border-color: #fca5a5;
  }
  .sf-btn-remove:hover { background: #fef2f2; }
  .sf-btn-move {
    font-size: 0.75em;
    padding: 2px 6px;
  }
  .sf-options { margin-top: 4px; }
  .sf-depth-cap {
    color: var(--text-muted, #6b7280);
    font-style: italic;
    font-size: 0.85em;
    padding: 4px;
  }

  /* ── validation errors ── */
  .sol-form-field-error {
    color: #c00;
    font-size: 0.85em;
    margin-top: 2px;
  }
  .sol-form-validation-summary {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 4px;
    padding: 0.5em 0.75em;
    margin-bottom: 0.75em;
    color: #991b1b;
    font-size: 0.9em;
  }
  .sol-form-validation-summary ul {
    margin: 0.25em 0 0 1.25em;
    padding: 0;
  }

  /* ── save bar ── */
  .sol-form-save-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0.75em;
    border-top: 1px solid var(--border, #e0e0e0);
    background: var(--bg-muted, #f9fafb);
  }
  .sol-form-save-options {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9em;
  }
  .sol-form-save-options label {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .sol-form-pod-url {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sol-form-pod-url input {
    flex: 1;
    font-family: inherit;
    font-size: 0.9em;
    padding: 4px 6px;
    border: 1px solid var(--border, #ccc);
    border-radius: 3px;
  }
  .sol-form-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sol-form-btn {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
    font-family: inherit;
  }
  .sol-form-btn-primary {
    background: var(--accent, #3b82f6);
    color: #fff;
  }
  .sol-form-btn-primary:hover {
    background: var(--accent-hover, #2563eb);
  }
  .sol-form-btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  .sol-form-save-status {
    font-size: 0.85em;
    margin-left: 8px;
  }
  .sol-form-save-status.ok { color: #16a34a; }
  .sol-form-save-status.err { color: #c00; }

  /* ── shape-driven mode ── */
  .sol-form-shape-fields {
    display: flex;
    flex-direction: column;
    gap: 0.9em;
  }
  .sol-form-shape-key {
    display: grid;
    grid-template-columns: minmax(10rem, 14rem) 1fr;
    gap: 0.65em 1rem;
    align-items: start;
  }
  .sol-form-shape-label {
    padding-top: 0.4em;
    font-weight: 600;
    color: var(--text, #2c3e50);
    user-select: none;
  }
  .sol-form-shape-rows {
    display: flex;
    flex-direction: column;
    gap: 0.35em;
    min-width: 0;
  }
  .sol-form-shape-row {
    display: flex;
    align-items: center;
    gap: 0.4em;
    min-width: 0;
  }
  .sol-form-shape-input {
    flex: 1 1 auto;
    min-width: 0;
    font: inherit;
    font-size: 0.95em;
    padding: 0.45em 0.55em;
    border: 1px solid var(--border, #d0d0d0);
    border-radius: var(--radius-sm, 4px);
    background: var(--surface, #fff);
    color: var(--text, #000);
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .sol-form-shape-input:focus-visible {
    outline: none;
    border-color: var(--accent, #1F618D);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #1F618D) 22%, transparent);
  }
  .sol-form-shape-input[type="checkbox"] {
    flex: 0 0 auto;
    width: 1.1em;
    height: 1.1em;
    padding: 0;
  }
  .sol-form-shape-add,
  .sol-form-shape-remove {
    grid-column: 2;
    align-self: start;
    font: inherit;
    font-size: 0.85em;
    padding: 0.25em 0.6em;
    border: 1px solid var(--border, #d0d0d0);
    background: var(--surface, #fff);
    color: var(--text-muted, #4d4d4d);
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
  }
  .sol-form-shape-add:hover {
    border-color: var(--accent, #1F618D);
    color: var(--accent, #1F618D);
  }
  .sol-form-shape-remove {
    flex: 0 0 auto;
    width: 1.8em;
    padding: 0;
    line-height: 1;
    color: var(--error, #c00);
    border-color: color-mix(in srgb, var(--error, #c00) 35%, var(--border, #d0d0d0));
  }
  .sol-form-shape-remove:hover {
    background: color-mix(in srgb, var(--error, #c00) 10%, transparent);
  }

  /* Lay the whole shape-driven form out as a grid so labels line up
     in a column across every field, regardless of which solid-ui
     widget renders the row. Each row container uses display:contents
     so the widget's emitted label + input become direct grid items. */
  .sol-form-shape-fields {
    display: grid;
    grid-template-columns: minmax(8rem, max-content) 1fr;
    column-gap: 1rem;
    row-gap: 0.5rem;
    align-items: baseline;
    width: 100%;
  }
  .sol-form-shape-fields > .sol-form-shape-key {
    display: contents;
  }
  /* solid-ui's labels: formFieldName for field types, choiceBox-label
     for Choice. Force right-align + first column. */
  .sol-form-shape-fields .formFieldName,
  .sol-form-shape-fields .choiceBox-label {
    grid-column: 1;
    justify-self: end;
    text-align: right;
    color: var(--accent, #1F618D);
    font-weight: 500;
    padding-top: 0.4em;
  }
  /* solid-ui's value containers: formFieldValue for fields, choiceBox-
     selectBox for Choice. Take the input column and stretch. */
  .sol-form-shape-fields .formFieldValue,
  .sol-form-shape-fields .choiceBox-selectBox {
    grid-column: 2;
    justify-self: stretch;
    min-width: 0;
  }
  .sol-form-shape-fields .formFieldValue > input,
  .sol-form-shape-fields .formFieldValue > select,
  .sol-form-shape-fields .formFieldValue > textarea,
  .sol-form-shape-fields .choiceBox-selectBox select {
    width: 100%;
    max-width: 28rem;
    box-sizing: border-box;
  }
  /* solid-ui's Multiple emits a wrapping container with each item as a
     row; align its label too. */
  .sol-form-shape-fields .choiceBox {
    display: contents;
  }

  /* Read-only ("no-edit") mode: inputs render but the user can't
     change them. Light cosmetic shift to telegraph the mode. */
  .sol-form-shape-readonly .sol-form-shape-input[readonly],
  .sol-form-shape-readonly .sol-form-shape-input:disabled {
    background: color-mix(in srgb, var(--surface, #fff) 90%, var(--border, #d0d0d0));
    color: var(--text-muted, #4d4d4d);
    cursor: default;
  }
  .sol-form-shape-readonly .sol-form-shape-input[readonly]:focus-visible,
  .sol-form-shape-readonly .sol-form-shape-input:disabled:focus-visible {
    outline: 1px dashed var(--border, #d0d0d0);
    box-shadow: none;
  }
  .sol-form-shape-empty {
    color: var(--text-muted, #4d4d4d);
    font-style: italic;
  }
`;

export const sheet = sheetFrom(CSS);
