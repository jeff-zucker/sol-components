// Resolve a component class's editor declaration into a canonical spec
// consumed by both `core/editor-self.js` (inline gear → modal) and
// `web/sol-settings.js` (accordion-mounted editors).
//
// Declarations a component class may carry:
//
//   static get editor()
//     - { inline: true }                  → opt out (sol-feed)
//     - "https://…/form.ttl" (string)     → legacy: sol-form with that ui:Form
//     - { tag, subjectAttr?, attrs? }     → explicit editor (e.g. sol-tree-edit)
//
//   static get shape()
//     - "https://…/shape.shacl"           → implicit sol-form in shape-driven mode
//
//   a `shape="…"` ATTRIBUTE on the instance overrides the class shape — so a
//   generic element (e.g. <sol-default shape="./app-settings.shacl">) is
//   configurable without any class-level declaration. This is what lets
//   sol-settings work with anyone's components.
//
// `editor` takes precedence over `shape`. When neither is set the
// component is not editable; resolveEditorSpec returns null.

/**
 * @param {Function | undefined} Ctor — custom-element class
 * @param {Element} [el] — the instance, so a per-instance `shape` attribute can
 *        override the class shape (and make a class-less element editable).
 * @returns {{tag: string, subjectAttr: string, attrs: object, save: boolean} | null}
 */
export function resolveEditorSpec(Ctor, el) {
  const ed = Ctor && Ctor.editor;
  if (ed && typeof ed === 'object' && ed.inline) return null;

  if (typeof ed === 'string') {
    return { tag: 'sol-form', subjectAttr: 'subject', attrs: { source: ed }, save: true };
  }
  if (ed && typeof ed === 'object') {
    const tag = ed.tag || 'sol-form';
    return {
      tag,
      subjectAttr: ed.subjectAttr || 'subject',
      attrs: { ...(ed.attrs || {}) },
      save: tag === 'sol-form',
    };
  }

  // Instance attribute wins over the class default; either makes it editable.
  // `data-edit-shape` is the canonical capability attribute; bare `shape` is the
  // back-compat alias.
  const shape = (el && el.getAttribute && (el.getAttribute('data-edit-shape') || el.getAttribute('shape'))) ||
                (Ctor && typeof Ctor.shape === 'string' ? Ctor.shape : null);
  if (shape) {
    return { tag: 'sol-form', subjectAttr: 'subject', attrs: { shape }, save: true };
  }
  return null;
}

/**
 * Normalize a manifest-declared edit spec (from a manifest's
 * `interop.editable` map) into the canonical editor spec — so a component that
 * declares NO `static editor`/`shape` (e.g. a foreign library's element) can be
 * made editable purely from a manifest descriptor. The descriptor distinguishes:
 *   - shape            (a) ACCESSIBLE: SHACL for auto-generation; absent ⇒ null
 *   - forms: "self"    (b) the component renders its OWN form; we don't generate
 *   - present          (c) "inline" (button on the element) | "collected" (sol-settings)
 *   - subject.attr         which attribute on the element holds the subject URI
 *   - open                 (self only) how to trigger the component's own editor
 *
 * @param {object} decl
 * @returns {{tag,subjectAttr,attrs,save,subjectFrom?,present?} | {self:true,open,present} | null}
 */
export function editorSpecFromDecl(decl) {
  if (!decl || typeof decl !== 'object') return null;
  if (decl.forms === 'self') {
    return { self: true, open: decl.open || null, present: decl.present || 'inPlace' };
  }
  if (!decl.shape) return null;   // (a) no shape ⇒ not auto-editable
  return {
    tag: 'sol-form',
    subjectAttr: 'subject',
    attrs: { shape: decl.shape },
    save: true,
    subjectFrom: (decl.subject && decl.subject.attr) || null,
    present: decl.present || 'collected',
  };
}

/**
 * Resolve the subject URI being edited from a host component instance.
 * A spec's `subjectFrom` (from a manifest descriptor) wins; otherwise falls
 * back through `source` → `from-rdf` → empty.
 */
export function editorSubjectOf(el, spec) {
  if (spec && spec.subjectFrom) {
    const v = el.getAttribute(spec.subjectFrom);
    if (v) return v;
  }
  // `data-subject="…"` (canonical) / `subject="…"` (alias) is the explicit,
  // foreign-friendly locator (a component whose subject isn't in
  // `source`/`from-rdf` — e.g. a third party's element — just adds it). Then the
  // usual fallbacks.
  return el.getAttribute('data-subject') || el.getAttribute('subject')
      || el.getAttribute('source') || el.getAttribute('from-rdf') || '';
}

/**
 * Where an editable element's form lives:
 *   "inPlace"   — a gear button ON the element (core/editor-self.js)
 *   "collected" — gathered into a <sol-settings> panel
 * The element's `edit="inPlace|collected"` attribute is the canonical control;
 * the legacy `editor-self` attribute (⇒ inPlace) and a manifest descriptor's
 * `present` are honored too. Default: "collected".
 */
export function editPlacement(el, spec) {
  const a = ((el && el.getAttribute && (el.getAttribute('data-edit-mode') || el.getAttribute('edit'))) || '').toLowerCase();
  if (a === 'inplace' || a === 'inline') return 'inPlace';
  if (a === 'collected') return 'collected';
  if (el && el.hasAttribute && el.hasAttribute('editor-self')) return 'inPlace';   // legacy alias
  const p = spec && spec.present && String(spec.present).toLowerCase();
  if (p) return (p === 'inplace' || p === 'inline') ? 'inPlace' : 'collected';
  return 'collected';
}

/**
 * Create the editor element for a component instance, fully wired with
 * subject / save-to / additional attributes. Returns null if the
 * component opts out or has no editor.
 *
 * Caller is responsible for inserting the element into the DOM and
 * listening for `sol-form-save` if it wants to refresh the host.
 */
export function buildEditorElement(el, specOverride) {
  const spec = specOverride || resolveEditorSpec(el.constructor, el);
  if (!spec || spec.self) return null;   // self-editor: caller triggers via its own UI
  const subject = editorSubjectOf(el, spec);

  const editorEl = document.createElement(spec.tag);
  if (subject) {
    const abs = absolute(subject);
    editorEl.setAttribute(spec.subjectAttr, abs);
    if (spec.save) editorEl.setAttribute('save-to', abs);
  }
  for (const [k, v] of Object.entries(spec.attrs)) editorEl.setAttribute(k, v);
  return editorEl;
}

/**
 * Trigger a component's OWN editor (forms:"self" in a manifest descriptor),
 * via the declared `open` hook — a method on the element or an event to
 * dispatch on it. Returns true if a hook fired.
 */
export function triggerSelfEditor(el, spec) {
  const open = spec && spec.open;
  if (!open) return false;
  if (open.method && typeof el[open.method] === 'function') { el[open.method](); return true; }
  if (open.event) { el.dispatchEvent(new CustomEvent(open.event, { bubbles: true, composed: true })); return true; }
  return false;
}

function absolute(uri) {
  try { return new URL(uri, document.baseURI).href; }
  catch { return uri; }
}
