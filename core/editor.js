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
// `editor` takes precedence over `shape`. When neither is set the
// component is not editable; resolveEditorSpec returns null.

/**
 * @param {Function | undefined} Ctor — custom-element class
 * @returns {{tag: string, subjectAttr: string, attrs: object, save: boolean} | null}
 */
export function resolveEditorSpec(Ctor) {
  if (!Ctor) return null;
  const ed = Ctor.editor;
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

  if (typeof Ctor.shape === 'string') {
    return { tag: 'sol-form', subjectAttr: 'subject', attrs: { shape: Ctor.shape }, save: true };
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
  const spec = resolveEditorSpec(el.constructor);
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
