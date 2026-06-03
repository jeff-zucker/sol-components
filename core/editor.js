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
  const shape = (el && el.getAttribute && el.getAttribute('shape')) ||
                (Ctor && typeof Ctor.shape === 'string' ? Ctor.shape : null);
  if (shape) {
    return { tag: 'sol-form', subjectAttr: 'subject', attrs: { shape }, save: true };
  }
  return null;
}

/**
 * Resolve the subject URI being edited from a host component instance.
 * Falls back through `source` → `from-rdf` → empty.
 */
export function editorSubjectOf(el) {
  return el.getAttribute('source') || el.getAttribute('from-rdf') || '';
}

/**
 * Create the editor element for a component instance, fully wired with
 * subject / save-to / additional attributes. Returns null if the
 * component opts out or has no editor.
 *
 * Caller is responsible for inserting the element into the DOM and
 * listening for `sol-form-save` if it wants to refresh the host.
 */
export function buildEditorElement(el) {
  const spec = resolveEditorSpec(el.constructor, el);
  if (!spec) return null;
  const subject = editorSubjectOf(el);

  const editorEl = document.createElement(spec.tag);
  if (subject) {
    const abs = absolute(subject);
    editorEl.setAttribute(spec.subjectAttr, abs);
    if (spec.save) editorEl.setAttribute('save-to', abs);
  }
  for (const [k, v] of Object.entries(spec.attrs)) editorEl.setAttribute(k, v);
  return editorEl;
}

function absolute(uri) {
  try { return new URL(uri, document.baseURI).href; }
  catch { return uri; }
}
