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
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 1;
}
.sol-editor-self-gear:focus,
:host(:hover) .sol-editor-self-gear,
.sol-editor-self-gear:hover {
  opacity: 1;
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
export function attachEditorSelfGear(el) {
  const editor = el.constructor?.editor;
  if (!editor || (typeof editor === 'object' && editor.inline)) return null;
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
  btn.setAttribute('aria-label', `Edit ${el.localName} settings`);
  btn.textContent = '⚙';   // ⚙
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditorModal(el, editor);
  });

  root.appendChild(btn);
  el._editorSelfGear = btn;
  return btn;
}

/**
 * Programmatically open the editor modal for any component. Used by
 * the gear handler above and by external surfaces (dk-settings).
 *
 * @param {HTMLElement} el - the component being edited
 * @param {string} [editorOverride] - optional explicit editor URI
 *   (defaults to `el.constructor.editor`)
 */
export function openEditorModal(el, editorOverride) {
  const editor = editorOverride ?? el.constructor?.editor;
  if (!editor || (typeof editor === 'object' && editor.inline)) return;

  const subject = el.getAttribute('source')
               || el.getAttribute('from-rdf')
               || '';

  const modal = document.createElement('sol-modal');
  modal.setAttribute('title', `Edit ${el.localName}`);
  modal.setAttribute('open', '');

  const form = document.createElement('sol-form');
  form.setAttribute('source', editor);
  if (subject) {
    form.setAttribute('subject', subject);
    form.setAttribute('save-to', subject);
  }
  form.addEventListener('sol-form-save', () => {
    if (typeof el.reload === 'function') el.reload().catch(() => {});
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  });

  modal.appendChild(form);
  document.body.appendChild(modal);
}
