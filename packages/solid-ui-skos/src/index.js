// solid-ui-skos — make solid-ui's ui:Choice SKOS-aware.
//
// Import AFTER solid-ui (which sets window.UI). On import this decorates
// window.UI.widgets.field[ui:Choice]: when the field's ui:from points at a
// skos:ConceptScheme, skos:Collection, or skos:Concept, options are gathered
// by SKOS semantics (./skos-options.js); otherwise it delegates to the
// original rdf:type-based Choice handler, unchanged.
//
//   import 'solid-ui';
//   import 'solid-ui-skos';   // self-registers — that's the whole integration
//
// Field hints (on the ui:Choice field):
//   ui:from <Scheme|Collection|Concept>   — the SKOS source (required to engage)
//   ui:canMintNew true  — add a "+ New…" control that mints a skos:Concept
//
// Uses only public solid-ui exports — solid-ui itself is not patched.

import * as solidUI from 'solid-ui';
import * as solidLogic from 'solid-logic';
import { gatherSkosOptions } from './skos-options.js';
import { mintSkosConcept } from './skos-mint.js';

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SKOS_FROM_TYPES = ['ConceptScheme', 'Collection', 'OrderedCollection', 'Concept'];

// solid-ui's exports (widgets/ns/utils) — the peer the host already brings.
function pickUI(UI) {
  return UI || solidUI.default || solidUI || (typeof window !== 'undefined' ? window.UI : undefined);
}
// The shared rdflib store. solid-logic's singleton is the one solid-ui's own
// widgets read/write; some solid-ui builds also surface it as UI.store.
function pickStore(opts, UI) {
  return opts.store
    || (UI && UI.store)
    || solidLogic.store
    || (solidLogic.solidLogicSingleton && solidLogic.solidLogicSingleton.store)
    || (solidLogic.default && solidLogic.default.store);
}

export function installSkosChoice(UI, opts = {}) {
  UI = pickUI(UI);
  if (!UI || !UI.widgets || !UI.widgets.field) {
    console.warn('[solid-ui-skos] solid-ui not available (need its widgets) — is solid-ui a resolvable peer dependency?');
    return false;
  }
  const kb = pickStore(opts, UI);
  if (!kb || typeof kb.any !== 'function') {
    console.warn('[solid-ui-skos] no rdflib store found — bring solid-logic as a peer, or call installSkosChoice(UI, { store }).');
    return false;
  }
  if (UI.widgets.__skosChoiceInstalled) return true;
  UI.widgets.__skosChoiceInstalled = true;

  const ns = UI.ns;
  const widgets = UI.widgets;
  const ui = ns.ui;
  const sort = typeof widgets.sortByLabel === 'function' ? widgets.sortByLabel : null;

  const isSkosFrom = (from) =>
    !!from && SKOS_FROM_TYPES.some(t => kb.holds(from, ns.rdf('type'), kb.sym(SKOS + t)));
  const editable = (dataDoc) =>
    !!(dataDoc && dataDoc.uri && kb.updater && kb.updater.editable && kb.updater.editable(dataDoc.uri));

  const original = widgets.field[ui('Choice').uri];

  widgets.field[ui('Choice').uri] = function (dom, container, already, subject, form, dataDoc, callbackFunction) {
    const from = kb.any(form, ui('from'));
    if (!isSkosFrom(from)) {
      return original.call(this, dom, container, already, subject, form, dataDoc, callbackFunction);
    }

    const property = kb.any(form, ui('property'));

    // Shell matches solid-ui's choiceBox so styling is consistent.
    const box = dom.createElement('div'); box.setAttribute('class', 'choiceBox');
    const lhs = dom.createElement('div'); lhs.setAttribute('class', 'formFieldName choiceBox-label');
    const rhs = dom.createElement('div'); rhs.setAttribute('class', 'formFieldValue choiceBox-selectBox');
    box.appendChild(lhs); box.appendChild(rhs);
    if (container) container.appendChild(box);
    if (property && typeof widgets.fieldLabel === 'function') {
      lhs.appendChild(widgets.fieldLabel(dom, property, form));
    }

    // (Re)render the value control into rhs. Called again after a mint so the
    // new concept shows up (and selected).
    const paint = () => {
      while (rhs.firstChild) rhs.removeChild(rhs.firstChild);

      const { options, ordered } = gatherSkosOptions(kb, from, dataDoc);
      if (!options.length) {
        console.warn(`[solid-ui-skos] no concepts for ui:from <${from.value}>; empty dropdown.`);
      }
      const possible = (ordered || !sort) ? options : sort(options);
      const opts = { form };
      if (kb.any(form, ui('multiselect'))) opts.multiSelect = true;
      const selector = widgets.makeSelectForOptions(dom, kb, subject, property, possible, opts, dataDoc, callbackFunction);
      if (selector && selector.nodeType) rhs.appendChild(selector);

      // "+ New…" mint control (single-select Choices only; not multiselect).
      if (kb.any(form, ui('canMintNew')) && editable(dataDoc) && !kb.any(form, ui('multiselect'))) {
        const btn = dom.createElement('button');
        btn.setAttribute('type', 'button');
        btn.className = 'skos-mint-btn';
        btn.textContent = '+ New…';
        btn.addEventListener('click', () => {
          const promptBox = mintSkosConcept({
            dom, kb, widgets, subject, predicate: property, from, dataDoc,
            onDone: () => paint(),   // new concept is now placed + is the value
          });
          if (promptBox && promptBox.nodeType) rhs.appendChild(promptBox);
        });
        rhs.appendChild(btn);
      }
    };

    paint();
    return box;
  };

  return true;
}

// Auto-install on import. Works in any module environment that brings the
// peers (solid-ui + solid-logic) — `import 'solid-ui-skos'` is the whole
// integration. For a non-module global build, call
// installSkosChoice(window.UI, { store }) yourself.
try { installSkosChoice(); } catch (e) { /* import-time install best-effort */ }

export { gatherSkosOptions };
export { skosMintStatements } from './skos-mint.js';
