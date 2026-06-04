/**
 * @jest-environment jsdom
 *
 * The general extension-point protocol (core/extension-points.js): a component
 * offers points via `static get extensionPoints()` (or the legacy editor/shape
 * sugar for `edit`); a capability discovers and observes them.
 */
import {
  resolveExtensionPoint,
  resolveExtensionPoints,
  findExtensionPoints,
  observeExtensionPoint,
  registerExtensionPoints,
  registerInteropEditables,
} from '../../core/extension-points.js';
import {
  editorSpecFromDecl,
  editorSubjectOf,
  buildEditorElement,
  triggerSelfEditor,
  editPlacement,
} from '../../core/editor.js';

function defineForeign() {
  const tag = `xp-foreign-${n++}`;
  class Foreign extends HTMLElement {}   // declares NO editor/shape/extensionPoints
  customElements.define(tag, Foreign);
  return tag;
}

let n = 0;
function defineEl(opts) {
  const tag = `xp-el-${n++}`;
  class El extends HTMLElement {}
  if (opts.extensionPoints) Object.defineProperty(El, 'extensionPoints', { get: () => opts.extensionPoints });
  if (opts.shape) Object.defineProperty(El, 'shape', { get: () => opts.shape });
  customElements.define(tag, El);
  return tag;
}

afterEach(() => { document.body.innerHTML = ''; });

test('resolveExtensionPoint reads the extensionPoints map', () => {
  const tag = defineEl({ extensionPoints: { annotate: { vocab: 'v' } } });
  const el = document.createElement(tag);
  expect(resolveExtensionPoint(el.constructor, el, 'annotate')).toEqual({ vocab: 'v' });
  expect(resolveExtensionPoint(el.constructor, el, 'nope')).toBeNull();
});

test('the edit point honors legacy static shape AND the map (sugar for edit)', () => {
  const legacy = defineEl({ shape: 'https://x/s.shacl' });
  const lEl = document.createElement(legacy);
  expect(resolveExtensionPoint(lEl.constructor, lEl, 'edit')).toMatchObject({ tag: 'sol-form' });

  const mapped = defineEl({ extensionPoints: { edit: { shape: 'https://y/s.shacl' } } });
  const mEl = document.createElement(mapped);
  expect(resolveExtensionPoint(mEl.constructor, mEl, 'edit'))
    .toMatchObject({ tag: 'sol-form', attrs: { shape: 'https://y/s.shacl' } });
});

test('resolveExtensionPoints returns edit + other points together', () => {
  const tag = defineEl({ extensionPoints: { edit: { shape: 'https://z/s.shacl' }, annotate: { vocab: 'v' } } });
  const el = document.createElement(tag);
  const pts = resolveExtensionPoints(el.constructor, el);
  expect(Object.keys(pts).sort()).toEqual(['annotate', 'edit']);
  expect(pts.annotate).toEqual({ vocab: 'v' });
  expect(pts.edit).toMatchObject({ tag: 'sol-form' });
});

test('findExtensionPoints walks the document; data-swc-skip opts out', () => {
  const tag = defineEl({ extensionPoints: { annotate: { v: 1 } } });
  const a = document.createElement(tag); document.body.appendChild(a);
  const b = document.createElement(tag); b.setAttribute('data-swc-skip', ''); document.body.appendChild(b);
  const found = findExtensionPoints('annotate').map((f) => f.el);
  expect(found).toContain(a);
  expect(found).not.toContain(b);
});

test('registerExtensionPoints makes a class-less foreign element editable', () => {
  const tag = defineForeign();
  const el = document.createElement(tag);
  el.setAttribute('uri', 'https://pod/thing#it');
  document.body.appendChild(el);

  expect(resolveExtensionPoint(el.constructor, el, 'edit')).toBeNull();   // not editable yet

  registerExtensionPoints(tag, { edit: { shape: 'https://s/p.shacl', subject: { attr: 'uri' }, present: 'collected' } });

  expect(resolveExtensionPoint(el.constructor, el, 'edit')).toMatchObject({
    tag: 'sol-form', attrs: { shape: 'https://s/p.shacl' }, subjectFrom: 'uri', present: 'collected',
  });
  expect(findExtensionPoints('edit').map((f) => f.el)).toContain(el);
});

test('editorSpecFromDecl + subject locator drive buildEditorElement', () => {
  const spec = editorSpecFromDecl({ shape: 'https://s/p.shacl', subject: { attr: 'uri' } });
  expect(spec).toMatchObject({ tag: 'sol-form', subjectFrom: 'uri', present: 'collected' });

  const tag = defineForeign();
  const el = document.createElement(tag);
  el.setAttribute('uri', 'https://pod/p#me');
  expect(editorSubjectOf(el, spec)).toBe('https://pod/p#me');

  const ed = buildEditorElement(el, spec);
  expect(ed.tagName.toLowerCase()).toBe('sol-form');
  expect(ed.getAttribute('subject')).toContain('https://pod/p#me');
  expect(ed.getAttribute('shape')).toBe('https://s/p.shacl');
});

test('editorSpecFromDecl with no shape is not editable', () => {
  expect(editorSpecFromDecl({ subject: { attr: 'uri' } })).toBeNull();
});

test('forms:self yields a self spec; triggerSelfEditor fires the open hook', () => {
  const spec = editorSpecFromDecl({ forms: 'self', open: { event: 'my-edit' } });
  expect(spec).toEqual({ self: true, open: { event: 'my-edit' }, present: 'inPlace' });

  const tag = defineForeign();
  const el = document.createElement(tag);
  expect(buildEditorElement(el, spec)).toBeNull();   // self ⇒ we don't generate a form

  let fired = false;
  el.addEventListener('my-edit', () => { fired = true; });
  expect(triggerSelfEditor(el, spec)).toBe(true);
  expect(fired).toBe(true);
});

test('editPlacement: edit attribute is canonical; default is collected', () => {
  const mk = (attrs) => { const t = defineForeign(); const el = document.createElement(t); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  expect(editPlacement(mk({ edit: 'inPlace' }))).toBe('inPlace');
  expect(editPlacement(mk({ edit: 'inplace' }))).toBe('inPlace');   // case-insensitive
  expect(editPlacement(mk({ edit: 'collected' }))).toBe('collected');
  expect(editPlacement(mk({ 'editor-self': '' }))).toBe('inPlace'); // legacy alias
  expect(editPlacement(mk({}))).toBe('collected');                  // default
  // attribute wins over a manifest present
  expect(editPlacement(mk({ edit: 'collected' }), { present: 'inPlace' })).toBe('collected');
  // manifest present applies when no attribute
  expect(editPlacement(mk({}), { present: 'inPlace' })).toBe('inPlace');
});

test('editorSubjectOf reads an explicit subject= attribute', () => {
  const tag = defineForeign();
  const el = document.createElement(tag);
  el.setAttribute('subject', 'https://pod/s#me');
  expect(editorSubjectOf(el)).toBe('https://pod/s#me');
  // a spec.subjectFrom still wins
  el.setAttribute('uri', 'https://pod/u#it');
  expect(editorSubjectOf(el, { subjectFrom: 'uri' })).toBe('https://pod/u#it');
});

test('canonical data-* attributes drive editing (data-edit-shape/mode/subject)', () => {
  const tag = defineForeign();
  const el = document.createElement(tag);
  el.setAttribute('data-edit-shape', 'https://s/p.shacl');
  el.setAttribute('data-subject', 'https://pod/d#me');
  el.setAttribute('data-edit-mode', 'inPlace');

  const spec = resolveExtensionPoint(el.constructor, el, 'edit');
  expect(spec).toMatchObject({ tag: 'sol-form', attrs: { shape: 'https://s/p.shacl' } });
  expect(editorSubjectOf(el, spec)).toBe('https://pod/d#me');
  expect(editPlacement(el, spec)).toBe('inPlace');
});

test('registerInteropEditables registers entries from the host surface', () => {
  const tag = defineForeign();
  const el = document.createElement(tag);
  el.setAttribute('uri', 'https://pod/x#y');
  document.body.appendChild(el);

  window.SolidWebComponents = window.SolidWebComponents || {};
  window.SolidWebComponents.interop = [
    { name: 'foo', interop: { editable: { [tag]: { shape: 'https://s/x.shacl', subject: { attr: 'uri' } } } } },
  ];
  registerInteropEditables();

  expect(resolveExtensionPoint(el.constructor, el, 'edit')).toMatchObject({ tag: 'sol-form', subjectFrom: 'uri' });
});

test('observeExtensionPoint fires for existing AND late-mounted elements', async () => {
  const tag = defineEl({ extensionPoints: { annotate: { v: 1 } } });
  const a = document.createElement(tag); document.body.appendChild(a);
  const seen = [];
  const off = observeExtensionPoint('annotate', (el) => seen.push(el));
  expect(seen).toContain(a);                       // existing, synchronously

  const b = document.createElement(tag); document.body.appendChild(b);
  await new Promise((r) => setTimeout(r, 90));      // debounced MutationObserver
  expect(seen).toContain(b);                        // late mount
  off();
});
