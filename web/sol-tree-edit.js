/**
 * <sol-tree-edit> — drill-down editor for tree-shaped editable data.
 *
 * Composes <sol-breadcrumb> + <sol-accordion> + <sol-form>'s
 * shape-driven internals into a single editor for a container that has
 * a head (its own properties) plus an ordered list of items (each
 * editable as its own subject). Items can themselves be containers —
 * clicking "Open →" pushes a breadcrumb segment and re-renders at the
 * deeper subject. The page stays visually flat at every depth: one
 * accordion, one breadcrumb, no nested accordions.
 *
 * Two SHACL shapes drive the layout:
 *   head-shape  — sh:property entries for the container's own fields
 *                 (e.g. ui:label, ui:orientation on a ui:Menu).
 *   item-shape  — a SHACL document containing one NodeShape per item
 *                 type (with sh:targetClass on each). sol-tree-edit
 *                 picks the matching shape for each item based on the
 *                 item's rdf:type.
 *
 * Attributes:
 *   root             — starting subject URI (with #fragment).
 *   head-shape       — URI of the head SHACL shape file.
 *   item-shape       — URI of the item shapes file (multiple NodeShapes,
 *                      each with sh:targetClass).
 *   parts            — predicate URI linking container → ordered list of
 *                      items. Default: http://www.w3.org/ns/ui#parts.
 *   drill-when-type  — rdf:type URI(s), space-separated. Items of these
 *                      types render an "Open →" affordance instead of an
 *                      inline form panel. Default: http://www.w3.org/ns/ui#Menu.
 *   label-property   — predicate used for the accordion summary text on
 *                      each item. Default: http://www.w3.org/ns/ui#label.
 *   root-label       — the breadcrumb label for the root subject; falls
 *                      back to the root's label-property value.
 *   head-label       — label for the first accordion section (the head
 *                      form). Default: "Heading".
 *   items-label      — label for the divider between head and items.
 *                      Default: "Items".
 *
 * Events (bubbling, composed):
 *   sol-tree-navigate — detail: { stack }  — after drill / back.
 *   sol-form-save     — bubbles up from the inner sol-form when an edit
 *                       persists.
 */

import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';
import { rdf } from '../core/rdf.js';
import { parseShape, renderRecordForm } from '../core/shape-to-form.js';

const RDF_TYPE  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const UI_PARTS  = 'http://www.w3.org/ns/ui#parts';
const UI_LABEL  = 'http://www.w3.org/ns/ui#label';
const UI_MENU   = 'http://www.w3.org/ns/ui#Menu';
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
const RDF_REST  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
const RDF_NIL   = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';

const CSS = `
sol-tree-edit {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  font-family: var(--font-ui, system-ui, sans-serif);
}
sol-tree-edit .sol-tree-edit-loading,
sol-tree-edit .sol-tree-edit-error {
  padding: 0.6rem 0.9rem;
  color: var(--text-muted, #4d4d4d);
  font-style: italic;
}
sol-tree-edit .sol-tree-edit-error {
  color: var(--error, #c00);
  font-style: normal;
}
sol-tree-edit .sol-tree-edit-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
sol-tree-edit .sol-tree-edit-section-label {
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted, #4d4d4d);
  margin: 0 0.2rem;
}
sol-tree-edit .sol-tree-edit-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
}
sol-tree-edit .sol-tree-edit-open-btn {
  background: none;
  border: 1px solid var(--border, #d0d0d0);
  border-radius: 4px;
  padding: 0.2em 0.7em;
  font: inherit;
  font-size: 0.85em;
  color: var(--accent, #1F618D);
  cursor: pointer;
}
sol-tree-edit .sol-tree-edit-open-btn:hover {
  background: var(--hover, #eaf2fb);
}
sol-tree-edit .sol-tree-edit-add {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--border, #d0d0d0);
  border-radius: 4px;
  padding: 0.35em 0.8em;
  font: inherit;
  font-size: 0.85em;
  color: var(--text-muted, #4d4d4d);
  cursor: pointer;
}
sol-tree-edit .sol-tree-edit-add:hover {
  color: var(--accent, #1F618D);
  border-color: var(--accent, #1F618D);
}
sol-tree-edit .sol-tree-edit-item-controls {
  display: inline-flex;
  gap: 0.2em;
}
sol-tree-edit .sol-tree-edit-item-controls button {
  background: none;
  border: 1px solid var(--border, #d0d0d0);
  border-radius: 4px;
  width: 1.6em; height: 1.6em;
  padding: 0; line-height: 1;
  color: var(--text-muted, #4d4d4d);
  cursor: pointer;
  font-size: 0.85em;
}
sol-tree-edit .sol-tree-edit-item-controls button:hover {
  border-color: var(--accent, #1F618D);
  color: var(--accent, #1F618D);
}
sol-tree-edit .sol-tree-edit-item-controls .sol-tree-edit-remove:hover {
  border-color: var(--error, #c00);
  color: var(--error, #c00);
}
sol-tree-edit .sol-tree-edit-items-divider {
  margin: 0.6rem 0 0.2rem;
  padding: 0 0.3rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, #4d4d4d);
  border-top: 1px solid var(--border-soft, #e0e0e0);
  padding-top: 0.5rem;
}
`;

class SolTreeEdit extends HTMLElement {
  static get observedAttributes() {
    return ['root', 'head-shape', 'item-shape', 'parts', 'drill-when-type',
            'label-property', 'root-label', 'head-label', 'items-label'];
  }

  connectedCallback() {
    ensureDocStyle(this.getRootNode(), 'sol-tree-edit-styles', CSS);
    this._stack = [];   // [{ subject: NamedNode, label: string }, ...]
    this._headShapeText = null;
    this._itemShapeText = null;
    this._headParsed    = null;
    this._itemShapes    = null;   // [{ nodeShape, target: NamedNode, properties: ShapeProp[] }]
    this._rendered = false;

    this._render().catch(err => this._fatal(err));
  }

  attributeChangedCallback(_name, oldV, newV) {
    if (!this._rendered || oldV === newV) return;
    this._stack = [];
    this._render().catch(err => this._fatal(err));
  }

  async _render() {
    this.innerHTML = '<div class="sol-tree-edit-loading">Loading…</div>';

    const rootUri = this.getAttribute('root');
    if (!rootUri) { this._fatal(new Error('sol-tree-edit needs a `root` attribute')); return; }
    const rootAbs = new URL(rootUri, document.baseURI).href;
    const docUrl  = rootAbs.split('#')[0];

    // Load the data document into the singleton store so any other
    // shape-to-form consumer (e.g. dk-settings widgets) shares it.
    await rdf.store.fetcher.load(docUrl);

    // Parse shape files (cache after first load).
    if (!this._headShapeText) {
      const headUri = new URL(this.getAttribute('head-shape'), document.baseURI).href;
      this._headShapeText = await (await fetch(headUri)).text();
      this._headParsed = parseShape(this._headShapeText, headUri);
    }
    if (!this._itemShapeText) {
      const itemUri = new URL(this.getAttribute('item-shape'), document.baseURI).href;
      this._itemShapeText = await (await fetch(itemUri)).text();
      this._itemShapes = this._parseItemShapes(this._itemShapeText, itemUri);
    }

    // Initialise the breadcrumb stack with the root.
    if (this._stack.length === 0) {
      const rootSubj = rdf.sym(rootAbs);
      const labelProp = this._labelProperty();
      const rootLabel = this.getAttribute('root-label')
        || rdf.store.anyValue(rootSubj, labelProp) || lastSegment(rootAbs);
      this._stack.push({ subject: rootSubj, label: rootLabel });
    }

    this._paint();
    this._rendered = true;
  }

  // Parse the item-shape file into a list of { nodeShape, target, properties }.
  // sh:targetClass is the discriminator — picks one shape per item type.
  _parseItemShapes(text, base) {
    const SH = 'http://www.w3.org/ns/shacl#';
    const store = rdf.graph();
    rdf.parse(text, store, base, 'text/turtle');
    const out = [];
    for (const ns of store.each(null, rdf.sym(RDF_TYPE), rdf.sym(SH + 'NodeShape'))) {
      const target = store.any(ns, rdf.sym(SH + 'targetClass'));
      if (!target) continue;
      // Reuse parseShape's property walker by feeding the same text +
      // pulling the properties off the matching NodeShape. parseShape
      // returns the FIRST NodeShape's properties; instead, we walk
      // manually here to get a per-shape parse.
      const props = [];
      for (const p of store.each(ns, rdf.sym(SH + 'property'))) {
        const desc = singleShapePropFromStore(store, p);
        if (desc) props.push(desc);
      }
      out.push({ nodeShape: ns, target, properties: props });
    }
    return out;
  }

  _labelProperty() {
    return rdf.sym(this.getAttribute('label-property') || UI_LABEL);
  }

  _drillTypes() {
    const raw = this.getAttribute('drill-when-type') || UI_MENU;
    return raw.split(/\s+/).filter(Boolean).map(rdf.sym.bind(rdf));
  }

  _partsPredicate() {
    return rdf.sym(this.getAttribute('parts') || UI_PARTS);
  }

  _fatal(err) {
    this.innerHTML = `<div class="sol-tree-edit-error">${err.message}</div>`;
    console.error('[sol-tree-edit]', err);
  }

  // Render the current level: breadcrumb + accordion containing the
  // head form + one panel per item + an Add row.
  _paint() {
    this.innerHTML = '';
    const current = this._stack[this._stack.length - 1];
    const { subject } = current;

    // ── Breadcrumb ─────────────────────────────────────────────────
    // Only render when there's somewhere to go back to — a single
    // segment is just a label, not navigation, and dilutes the page.
    if (this._stack.length > 1) {
      const crumb = document.createElement('sol-breadcrumb');
      this._stack.forEach((s, i) => {
        const seg = document.createElement('span');
        seg.dataset.key = String(i);
        seg.textContent = s.label;
        crumb.appendChild(seg);
      });
      crumb.addEventListener('sol-breadcrumb-navigate', (e) => {
        const idx = e.detail.index;
        this._stack = this._stack.slice(0, idx + 1);
        this._paint();
        this.dispatchEvent(new CustomEvent('sol-tree-navigate', {
          bubbles: true, composed: true, detail: { stack: this._stack.slice() },
        }));
      });
      this.appendChild(crumb);
    }

    // Head and items go into SEPARATE sol-accordion instances so a
    // labelled divider can sit between them. sol-accordion's
    // connectedCallback wipes any non-DIV children of its own light
    // DOM, so a divider can't live inside one accordion — it has to
    // be a sibling between two. Both accordions have their own
    // exclusive group, which means the head panel can stay open while
    // the user expands an item; that's the right UX for "edit one
    // thing at a time within each section."

    // Head form panel.
    const headLabel = this.getAttribute('head-label') || 'Heading';
    const headAccordion = document.createElement('sol-accordion');
    const headPanel = this._buildAccordionPanel(headLabel, () => {
      const body = document.createElement('div');
      renderRecordForm(body, rdf.store, subject, this._headParsed.properties, {
        doc: rdf.sym(this._currentDoc()),
        onChange: () => this._onChange(),
      });
      return body;
    });
    headAccordion.appendChild(headPanel);
    this.appendChild(headAccordion);

    // Items section: labelled divider + a second accordion containing
    // one panel per item.
    const items = this._currentItems(subject);
    if (items.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'sol-tree-edit-items-divider';
      divider.textContent = this.getAttribute('items-label') || 'Items';
      this.appendChild(divider);
    }
    const accordion = document.createElement('sol-accordion');
    const drillTypes = this._drillTypes().map(t => t.value);
    for (const item of items) {
      const itemLabel = rdf.store.anyValue(item, this._labelProperty()) || lastSegment(item.value);
      const itemType = rdf.store.any(item, rdf.sym(RDF_TYPE));
      const isDrillable = !!itemType && drillTypes.includes(itemType.value);

      const summary = document.createElement('div');
      summary.className = 'sol-tree-edit-item-row';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = isDrillable ? `${itemLabel} ▸` : itemLabel;
      summary.appendChild(titleSpan);
      const controls = document.createElement('span');
      controls.className = 'sol-tree-edit-item-controls';
      summary.appendChild(controls);

      const body = document.createElement('div');
      if (isDrillable) {
        // Drillable: body shows "Open →"; expanding the panel doesn't
        // mount a form here — the user drills via the button.
        const open = document.createElement('button');
        open.className = 'sol-tree-edit-open-btn';
        open.type = 'button';
        open.textContent = 'Open →';
        open.addEventListener('click', (e) => {
          e.stopPropagation();
          this._stack.push({ subject: item, label: itemLabel });
          this._paint();
        });
        body.appendChild(open);
      } else {
        // Mount the per-type item form.
        const shape = this._matchItemShape(item);
        if (!shape) {
          body.textContent = '(no shape declared for this item type)';
        } else {
          renderRecordForm(body, rdf.store, item, shape.properties, {
            doc: rdf.sym(this._currentDoc()),
            onChange: () => this._onChange(),
          });
        }
      }

      const panel = document.createElement('div');
      panel.appendChild(summary);
      panel.appendChild(body);
      accordion.appendChild(panel);
    }

    // Only attach the items accordion when there's at least one item;
    // otherwise the empty accordion would dangle below the divider.
    if (items.length > 0) this.appendChild(accordion);

    // Make head + items panels mutually exclusive across the two
    // accordions: opening any details in one closes all open details
    // in the other. sol-accordion's own exclusive grouping is per-
    // instance (each picks a unique <details name=…>), so we wire the
    // cross-accordion coordination ourselves via toggle events.
    const allAccordions = items.length > 0
      ? [headAccordion, accordion]
      : [headAccordion];
    this._bindMutualExclusion(allAccordions);

    // TODO: wire add / remove / reorder. v0 ships read-render of items.
  }

  // Listen for `toggle` events on every <details> in each accordion;
  // when one opens, close any open details in the OTHER accordions.
  // Deferred via setTimeout because sol-accordion's connectedCallback
  // runs synchronously after appendChild but before its child
  // <details> are reachable from outside.
  //
  // Also reconciles the INITIAL state: sol-accordion opens its first
  // details on mount, so without intervention the head's first panel
  // and the items' first panel would both start open. Reconcile by
  // keeping the head's first open and closing every other.
  _bindMutualExclusion(accordions) {
    setTimeout(() => {
      const detailsByAccordion = accordions.map(a => Array.from(a.querySelectorAll('details')));
      // Initial-state reconcile: keep the first open panel found across
      // all accordions; close every other open one. (The first
      // accordion is the head, so its initial-open survives — exactly
      // what we want for the "Menu Heading" default-expanded look.)
      let kept = false;
      for (const group of detailsByAccordion) {
        for (const det of group) {
          if (!det.open) continue;
          if (kept) det.open = false;
          else kept = true;
        }
      }
      detailsByAccordion.forEach((group, i) => {
        for (const det of group) {
          det.addEventListener('toggle', () => {
            if (!det.open) return;
            detailsByAccordion.forEach((other, j) => {
              if (j === i) return;
              for (const sibling of other) {
                if (sibling.open) sibling.open = false;
              }
            });
          });
        }
      });
    }, 0);
  }

  _currentItems(subject) {
    const partsPred = this._partsPredicate();
    const head = rdf.store.any(subject, partsPred);
    if (!head) return [];
    // ui:parts is an rdf:List; rdflib parses turtle list syntax into a
    // Collection node (.elements). For an in-graph first/rest list,
    // walk the chain.
    if (head.termType === 'Collection' && Array.isArray(head.elements)) {
      return head.elements;
    }
    const out = [];
    let node = head;
    while (node && node.value !== RDF_NIL) {
      const first = rdf.store.any(node, rdf.sym(RDF_FIRST));
      if (first) out.push(first);
      node = rdf.store.any(node, rdf.sym(RDF_REST));
    }
    return out;
  }

  _matchItemShape(item) {
    const types = rdf.store.each(item, rdf.sym(RDF_TYPE)).map(t => t.value);
    for (const sh of this._itemShapes || []) {
      if (types.includes(sh.target.value)) return sh;
    }
    return null;
  }

  _buildAccordionPanel(label, contentBuilder) {
    const panel = document.createElement('div');
    const head = document.createElement('div');
    head.textContent = label;
    panel.appendChild(head);
    panel.appendChild(contentBuilder());
    return panel;
  }

  _currentDoc() {
    const rootUri = this.getAttribute('root');
    if (!rootUri) return null;
    return new URL(rootUri, document.baseURI).href.split('#')[0];
  }

  _onChange() {
    // Auto-save flows through the singleton store; sol-form-save event
    // bubbles from each inner renderRecordForm via the store mutations.
    // We just re-paint the current level to pick up any structural
    // changes (e.g., parts list reordering).
    // For v0 keep it minimal — defer to consumer's listening.
  }
}

// Pull the same descriptor fields parseShape uses, but from an
// already-walked shape store. Lifted from core/shape-to-form.js;
// kept inline so sol-tree-edit can parse multi-NodeShape files in one
// pass without re-reading the bytes.
function singleShapePropFromStore(shapeStore, prop) {
  const SH  = 'http://www.w3.org/ns/shacl#';
  const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
  const path = shapeStore.any(prop, rdf.sym(SH + 'path'));
  if (!path) return null;
  const minCount = parseInt(shapeStore.anyValue(prop, rdf.sym(SH + 'minCount')) ?? '0', 10);
  const maxRaw   = shapeStore.anyValue(prop, rdf.sym(SH + 'maxCount'));
  const maxCount = maxRaw == null ? Infinity : parseInt(maxRaw, 10);
  const label    = shapeStore.anyValue(prop, rdf.sym(SH + 'name')) ?? null;
  const description = shapeStore.anyValue(prop, rdf.sym(SH + 'description')) ?? null;
  const dt = shapeStore.any(prop, rdf.sym(SH + 'datatype'));
  const datatype = dt ? dt.value : null;
  const inList = shapeStore.any(prop, rdf.sym(SH + 'in'));
  let enumOpts = null, enumLabels = null;
  if (inList) {
    const items = (inList.termType === 'Collection' && Array.isArray(inList.elements))
      ? inList.elements
      : (() => {
          const out = []; let node = inList;
          while (node && node.value !== RDF_NIL) {
            const first = shapeStore.any(node, rdf.sym(RDF_FIRST));
            if (first) out.push(first);
            node = shapeStore.any(node, rdf.sym(RDF_REST));
          }
          return out;
        })();
    enumOpts = items.map(n => n.value);
    enumLabels = items.map(n => {
      if (n.termType !== 'NamedNode') return n.value;
      const lbl = shapeStore.anyValue(n, rdf.sym(RDFS_LABEL));
      return lbl || n.value;
    });
  }
  const nk = shapeStore.any(prop, rdf.sym(SH + 'nodeKind'));
  const nodeKind = nk ? nk.value : null;
  const key = lastSegment(path.value);
  return { path, key, datatype, enumOpts, enumLabels, nodeKind, minCount, maxCount, label, description };
}

function lastSegment(uri) {
  const i = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
  return i === -1 ? uri : uri.slice(i + 1);
}

define('sol-tree-edit', SolTreeEdit);
