// core/edit-placements.js — activate the `edit="inPlace"` placement.
//
// Loaded as part of the `rdf` capability (so an app that does
// `data-extend-with="rdf"` gets it for free). It walks the page — now and as
// elements mount — for every editable element whose placement resolves to
// "inPlace" and attaches an inline edit gear. "collected" elements are left for
// <sol-settings> to gather. Editability itself comes from the `edit` protocol
// (a `shape="…"` attribute, a class `static extensionPoints`/`shape`, or a
// manifest `interop.editable` descriptor); this module only decides PLACEMENT.
import { observeExtensionPoint } from './extension-points.js';
import { editPlacement } from './editor.js';

let _on = false;
/** Begin attaching inline gears to `edit="inPlace"` (or legacy `editor-self`)
 *  elements. Idempotent. */
export function activateInlinePlacements() {
  if (_on || typeof document === 'undefined') return;
  _on = true;
  observeExtensionPoint('edit', (el, spec) => {
    if (spec && spec.self) return;                       // component edits itself
    if (editPlacement(el, spec) !== 'inPlace') return;   // collected ⇒ sol-settings owns it
    import('./editor-self.js').then(({ attachEditorSelfGear }) => {
      try { attachEditorSelfGear(el, spec); } catch (_) { /* no shadowRoot etc. — skip */ }
    });
  });
}

activateInlinePlacements();
