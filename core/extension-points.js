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

import { resolveEditorSpec } from './editor.js';

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function safe(fn) { try { return fn(); } catch (_) { return null; } }

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
  if (e == null) return null;
  const synthetic = (typeof e === 'string') ? { editor: e }
    : (e.shape ? { shape: e.shape } : { editor: e });
  return safe(() => resolveEditorSpec(synthetic, el));
}

/** The spec a component offers for ONE point, or null. */
export function resolveExtensionPoint(Ctor, el, point) {
  if (point === 'edit') return editPoint(Ctor, el);
  const raw = pointsMap(Ctor);
  return own(raw, point) ? raw[point] : null;
}

/** Every point a component offers, as { [point]: spec }. `edit` (if any) is the
 *  editor.js canonical spec; other points are their raw declarations. */
export function resolveExtensionPoints(Ctor, el) {
  const out = {};
  const raw = pointsMap(Ctor);
  for (const k in raw) if (own(raw, k) && k !== 'edit') out[k] = raw[k];
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
      const ctor = customElements.get(el.localName);
      if (ctor) {
        const spec = safe(() => resolveExtensionPoint(ctor, el, point));
        if (spec) out.push({ el, spec });
      }
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
