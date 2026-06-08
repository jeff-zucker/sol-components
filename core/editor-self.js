// Inline edit-in-place: page authors opt a component instance into
// rendering a small gear button by adding the `editor-self` attribute.
// Clicking the gear opens a <sol-modal> containing a <sol-form> bound
// to the component's editor (declared via its static `editor` getter)
// and its current `source` / `from-rdf` subject.
//
// Components call attachEditorSelfGear(this) in connectedCallback
// guarded by `this.hasAttribute('editor-self')`. The helper is a
// no-op for components that opt out via `editor = { inline: true }`.
//
// dk's pages do not exercise this path — every editable component on
// dk is shared-mode (no `editor-self` attribute), edited from
// dk-settings. The helper lives in swc because it's a property of
// the component infrastructure, useful to other consumers.

import { buildEditorElement, resolveEditorSpec } from './editor.js';

const GEAR_CSS = `
.sol-editor-self-gear {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: 1px solid var(--border, #9e9e9e);
  border-radius: var(--radius-sm, 4px);
  background: var(--surface, #fff);
  color: var(--text-muted, #4d4d4d);
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
.sol-editor-self-gear:focus-visible {
  outline: 2px solid var(--accent, #1F618D);
  outline-offset: 1px;
}
`;

let _gearSheet = null;
function gearSheet() {
  if (_gearSheet) return _gearSheet;
  _gearSheet = new CSSStyleSheet();
  _gearSheet.replaceSync(GEAR_CSS);
  return _gearSheet;
}

/**
 * Attach an inline edit gear to a component instance. Idempotent —
 * calling twice on the same element is a no-op.
 *
 * @param {HTMLElement} el - the host component (must have shadowRoot)
 * @returns {HTMLButtonElement | null} the gear button, or null if
 *   the component opted out via `editor = { inline: true }` or has
 *   no editor at all.
 */
export function attachEditorSelfGear(el, spec) {
  // `spec` (from a manifest's interop.editable) lets a FOREIGN element get a
  // gear even though its class declares no editor; otherwise resolve from class.
  if (!(spec || resolveEditorSpec(el.constructor, el))) return null;
  if (el._editorSelfGear) return el._editorSelfGear;

  const root = el.shadowRoot ?? el;
  // Make the host a positioning context so the absolutely-positioned
  // gear anchors correctly. Skip if host CSS already established one.
  if (el.style && !el.style.position) el.style.position = 'relative';

  // Adopt the gear stylesheet into the shadow root (or document for
  // light-DOM hosts).
  if (el.shadowRoot && el.shadowRoot.adoptedStyleSheets) {
    if (!el.shadowRoot.adoptedStyleSheets.includes(gearSheet())) {
      el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, gearSheet()];
    }
  } else if (!document.adoptedStyleSheets.includes(gearSheet())) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, gearSheet()];
  }

  const btn = document.createElement('button');
  btn.className = 'sol-editor-self-gear';
  btn.type = 'button';
  btn.setAttribute('aria-label', `Edit ${el.localName}`);
  btn.textContent = '✏️';   // pencil — edit affordance
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditorModal(el, spec);
  });

  root.appendChild(btn);
  el._editorSelfGear = btn;
  return btn;
}

/**
 * Programmatically open the editor modal for any component. Used by
 * the gear handler above and by external surfaces.
 *
 * @param {HTMLElement} el - the component being edited
 */
export function openEditorModal(el, spec) {
  const editor = buildEditorElement(el, spec);
  if (!editor) return;

  const modal = document.createElement('sol-modal');
  modal.setAttribute('title', `Edit ${el.localName}`);

  // A shape-driven form autosaves on every field change, so sol-form-save
  // fires repeatedly while editing — do NOT close the modal on save. The user
  // closes it via the ✕ / Esc / overlay; we just refresh the host so it
  // reflects the edit.
  const onSaved = () => {
    if (typeof el.reload === 'function') el.reload().catch(() => {});
  };
  editor.addEventListener('sol-form-save', onSaved);

  // sol-modal builds its overlay only on open(), and its body lives in the
  // shadow root (no slot) — so the editor is inserted through the handler the
  // modal invokes on open(), not appended into light DOM.
  modal.handler = (body) => { body.appendChild(editor); };
  document.body.appendChild(modal);
  modal.open();
}
