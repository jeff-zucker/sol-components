// core/extension-points.js — the general "a capability discovers & enhances any
// component that offers a named point" protocol. Generalizes the editor/shape
// contract (core/editor.js + sol-settings discovery) so it's no longer just
// about editing.
//
// A COMPONENT author offers points, import-free, with one static getter:
//
//   class AcmeMap extends HTMLElement {
//     static get extensionPoints() {
//       return {
//         edit:     { shape: 'https://acme/map.shacl' }, // the editing capability
//         annotate: { vocab: 'https://acme/notes#' },    // some other capability
//       };
//     }
//   }
//
// A CAPABILITY author (a module loaded via data-extend-with) finds and enhances
// every component offering its point — now or whenever one mounts later:
//
//   observeExtensionPoint('annotate', (el, spec) => enhance(el, spec));
//
// Neither side imports the other; they meet in the DOM. `edit` is special: it
// delegates to core/editor.js so the existing `static get editor()` /
// `static get shape()` / `shape=` attribute all keep working as sugar for it.

import { resolveEditorSpec, editorSpecFromDecl } from './editor.js';

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function safe(fn) { try { return fn(); } catch (_) { return null; } }

// ── externally-registered points ───────────────────────────────────────────
// A component declares points with a `static get extensionPoints()`. But a
// FOREIGN component (another library's element) can't — so a manifest's
// `interop.editable` map lets a host register points for elements matching a
// CSS selector, with no class change and no library patch. findExtensionPoints
// consults this registry alongside class statics, so sol-form/sol-settings
// enhance those elements through the unchanged `edit` protocol.
const _registered = [];   // [{ selector, points }]

/** Register extension points for every element matching `selector`. `points`
 *  is the same shape a class returns from `extensionPoints` (e.g.
 *  `{ edit: { shape, subject:{attr}, forms, present, open } }`). */
export function registerExtensionPoints(selector, points) {
  if (!selector || !points) return;
  _registered.push({ selector: String(selector), points });
  // nudge live observers to re-scan (late registration / already-mounted els)
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('swc:offer', { bubbles: true, composed: true, detail: { selector, points } }));
  }
}

// The raw registered declaration for one point on `el`, or null.
function registeredPoint(el, point) {
  if (!el || typeof el.matches !== 'function') return null;
  for (const r of _registered) {
    if (own(r.points, point) && safe(() => el.matches(r.selector))) return r.points[point];
  }
  return null;
}

// The component's declared point map (guarded — a class getter may throw).
function pointsMap(Ctor) {
  const m = safe(() => (Ctor && Ctor.extensionPoints) || null);
  return (m && typeof m === 'object') ? m : {};
}

// The `edit` point: legacy editor/shape/shape= (editor.js owns the rules), then
// extensionPoints.edit fed back through editor.js so a map-only component works.
function editPoint(Ctor, el) {
  const legacy = safe(() => resolveEditorSpec(Ctor, el));
  if (legacy) return legacy;
  const e = pointsMap(Ctor).edit;
  if (e != null) {
    const synthetic = (typeof e === 'string') ? { editor: e }
      : (e.shape ? { shape: e.shape } : { editor: e });
    const spec = safe(() => resolveEditorSpec(synthetic, el));
    if (spec) return spec;
  }
  // Finally, a manifest-registered edit descriptor for this element.
  return editorSpecFromDecl(registeredPoint(el, 'edit'));
}

/** The spec a component offers for ONE point, or null. */
export function resolveExtensionPoint(Ctor, el, point) {
  if (point === 'edit') return editPoint(Ctor, el);
  const raw = pointsMap(Ctor);
  if (own(raw, point)) return raw[point];
  return registeredPoint(el, point);
}

/** Every point a component offers, as { [point]: spec }. `edit` (if any) is the
 *  editor.js canonical spec; other points are their raw declarations. */
export function resolveExtensionPoints(Ctor, el) {
  const out = {};
  const raw = pointsMap(Ctor);
  for (const k in raw) if (own(raw, k) && k !== 'edit') out[k] = raw[k];
  // manifest-registered non-edit points for this element (class statics win)
  for (const r of _registered) {
    if (!safe(() => el && el.matches && el.matches(r.selector))) continue;
    for (const k in r.points) if (own(r.points, k) && k !== 'edit' && !own(out, k)) out[k] = r.points[k];
  }
  const edit = editPoint(Ctor, el);
  if (edit) out.edit = edit;
  return out;
}

/** Walk the document (crossing shadow roots) for every element offering `point`.
 *  Returns [{ el, spec }]. opts.root (default document), opts.skipAttr (an
 *  attribute that opts an element out; default 'data-swc-skip'). */
export function findExtensionPoints(point, opts) {
  opts = opts || {};
  const skipAttr = opts.skipAttr || 'data-swc-skip';
  const out = [];
  const seen = new WeakSet();
  const visit = (r) => {
    if (!r || !r.querySelectorAll) return;
    for (const el of r.querySelectorAll('*')) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.hasAttribute && el.hasAttribute(skipAttr)) { if (el.shadowRoot) visit(el.shadowRoot); continue; }
      // Resolve against the class statics AND the manifest registry (the latter
      // works even for foreign elements whose ctor declares nothing).
      const ctor = customElements.get(el.localName);
      const spec = safe(() => resolveExtensionPoint(ctor, el, point));
      if (spec) out.push({ el, spec });
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(opts.root || document);
  return out;
}

/** Call onMatch(el, spec) once for every element offering `point` — now and as
 *  components mount later (debounced MutationObserver) or announce via
 *  `swc:offer`. Returns an unsubscribe function. */
export function observeExtensionPoint(point, onMatch, opts) {
  opts = opts || {};
  const matched = new WeakSet();
  const scan = () => {
    for (const { el, spec } of findExtensionPoints(point, opts)) {
      if (matched.has(el)) continue;
      matched.add(el);
      safe(() => onMatch(el, spec));
    }
  };
  scan();
  let timer = null;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(scan, 50); };
  const target = (opts.root && opts.root.documentElement) || document.documentElement || document;
  const mo = new MutationObserver(debounced);
  mo.observe(target, { childList: true, subtree: true });
  document.addEventListener('swc:offer', debounced);
  return () => { mo.disconnect(); clearTimeout(timer); document.removeEventListener('swc:offer', debounced); };
}

/** Announce, for a component that can't declare statically (created dynamically),
 *  the points it offers — capabilities observing those points re-scan. */
export function offerExtensionPoint(el, points) {
  el.dispatchEvent(new CustomEvent('swc:offer', {
    bubbles: true, composed: true, detail: { el, points },
  }));
}

/** Register every `interop.editable` entry the loader collected from the page's
 *  manifests, so a manifest can make any component (its own or a foreign
 *  library's) editable with no class change. Each entry is keyed by CSS
 *  selector → an edit descriptor `{ shape, subject:{attr}, forms, present, open }`.
 *  Idempotent (a one-shot guard avoids double-registering on re-import). */
export function registerInteropEditables() {
  if (typeof window === 'undefined') return;
  const api = window.SolidWebComponents;
  const libs = (api && Array.isArray(api.interop)) ? api.interop : [];
  for (const lib of libs) {
    const editable = lib && lib.interop && lib.interop.editable;
    if (!editable || typeof editable !== 'object') continue;
    const seen = (lib._editableSeen = lib._editableSeen || {});
    for (const selector in editable) {
      if (!own(editable, selector) || seen[selector]) continue;
      seen[selector] = true;
      registerExtensionPoints(selector, { edit: editable[selector] });
    }
  }
  // Inline placement (edit="inPlace" / present:"inPlace") is activated by
  // core/edit-placements.js, loaded with the rdf capability.
}

// Run on import: the rdf capability (sol-form/sol-settings → this module) loads
// after the loader has parsed manifests, so api.interop is already populated.
registerInteropEditables();
