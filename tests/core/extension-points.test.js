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
} from '../../core/extension-points.js';

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
