/**
 * <sol-form> — Generic RDF form renderer.
 *
 * Loads a ui:Form definition from a Turtle source URI and renders it via
 * solid-ui's form field system. Form data lives in an rdflib IndexedFormula
 * and is persisted to a Solid Pod through rdflib's UpdateManager.
 *
 * Save behaviour:
 *   • Non-ordered forms auto-save on every field change (debounced).
 *   • Forms containing a ui:Multiple with ui:ordered true render a Save
 *     button and persist via PUT only when clicked.
 *   • Save location is derived from the `subject` or `save-to` attribute;
 *     if neither is given, the user is prompted inline on first save.
 *
 * Attributes:
 *   source   — URI of a Turtle file containing a ui:Form definition (required)
 *   subject  — URI of an existing RDF resource to edit (optional; blank = new)
 *   shape    — URI of a SHACL shapes file for validation before save (optional)
 *   save-to  — Pre-filled Pod URL for saving (optional)
 *
 * Events (bubbling, composed):
 *   sol-form-change — detail: { subject, ok, message } — every field edit
 *   sol-form-save   — detail: { subject, turtle, target } — after save
 *
 * @class SolForm
 * @extends HTMLElement
 */

import { define } from '../core/define.js';
import { adopt }  from '../core/adopt.js';
import { rdf }    from '../core/rdf.js';
import { loadRdfStore } from '../core/rdf-utils.js';
import { UI, RDF, readFormParts, findForm } from '../core/form-utils.js';
import { parseShape, renderRecordForm, findSubjects } from '../core/shape-to-form.js';
import { CSS as FORM_CSS, sheet as formSheet } from './styles/sol-form-css.js';
import { CSS as ROLODEX_CSS, sheet as rolodexSheet } from './styles/view-rolodex-css.js';

const AUTOSAVE_DEBOUNCE_MS = 600;

// Replace the store's UpdateManager.update with a raw `application/sparql-update`
// PATCH (DELETE DATA / INSERT DATA from the concrete statement arrays solid-ui
// and our rolodex pass). rdflib's own PATCH 500s on the Community Solid Server
// for some documents (large / certain content); a plain sparql-update PATCH is
// what that server reliably accepts — the same workaround the omp player uses
// for its library writes. Idempotent; install once per store. `put` (new-doc
// creation) is left on rdflib. Applied only to editable forms.
function installRawSparqlUpdate(store) {
  const updater = store?.updater;
  if (!updater || updater._rawPatchInstalled) return;
  updater._rawPatchInstalled = true;
  const nt = (s) => `${s.subject.toNT()} ${s.predicate.toNT()} ${s.object.toNT()} .`;
  updater.update = (deletes = [], inserts = [], cb) => {
    deletes = deletes || []; inserts = inserts || [];
    const any = deletes[0] || inserts[0];
    const doc = any && (any.why || any.graph) ? (any.why || any.graph).value : null;
    if (!doc) { cb && cb(null, false, 'sol-form rawPatch: no target document'); return; }
    const parts = [];
    if (deletes.length) parts.push(`DELETE DATA {\n${deletes.map(nt).join('\n')}\n}`);
    if (inserts.length) parts.push(`INSERT DATA {\n${inserts.map(nt).join('\n')}\n}`);
    const body = parts.join(' ;\n');
    // Prefer the logged-in Solid session's fetch (carries the auth token for
    // writes to a protected pod); fall back to the page fetch (public pods,
    // dev). solid-client-authn-browser is exposed as window.solidClientAuthn.
    const session = globalThis.solidClientAuthn?.getDefaultSession?.();
    const fetchFn = (session?.info?.isLoggedIn && session.fetch.bind(session))
      || globalThis.fetch.bind(globalThis);
    Promise.resolve(fetchFn(doc, {
      method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' }, body,
    })).then(async res => {
      if (res && res.ok) {
        for (const s of deletes) store.remove(s);
        for (const s of inserts) store.add(s.subject, s.predicate, s.object, s.why || s.graph);
        cb && cb(doc, true);
      } else {
        console.warn('[sol-form] PATCH failed:', res && res.status, 'on', doc);
        cb && cb(doc, false, `HTTP ${res && res.status}`);
      }
    }).catch(e => cb && cb(doc, false, e.message));
  };
}

class SolForm extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._store      = null;
    this._formNode   = null;
    this._subject    = null;
    this._docNode    = null;
    this._docUrl     = null;
    this._ordered    = false;
    this._rendered   = false;
    this._shapeText  = null;
    this._saveTimer  = null;
    this._pendingSave = false;
  }

  static get observedAttributes() { return ['source', 'subject', 'shape', 'save-to', 'view']; }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if ((name === 'source' || name === 'view') && this._rendered) this._load();
  }

  connectedCallback() {
    if (this._rendered) return;
    this._initShell();
    this._load();
  }

  // ── public API ──

  get store()   { return this._store; }
  get subject() { return this._subject; }

  getTurtle() {
    if (!this._store || !this._docNode) return '';
    return rdf.serialize(this._docNode, this._store, this._docNode.value, 'text/turtle') || '';
  }

  // ── shell ──

  _initShell() {
    const root = this.shadowRoot;
    root.innerHTML = `
      <div class="sol-form-body"></div>
      <div class="sol-form-save-bar">
        <div class="sol-form-validation-summary" style="display:none"></div>
        <div class="sol-form-pod-url" style="display:none">
          <label>Save to:
            <input type="url" placeholder="https://you.pod/path/data.ttl" class="sol-form-pod-input">
          </label>
          <button type="button" class="sol-form-btn sol-form-set-loc">Set</button>
        </div>
        <div class="sol-form-actions">
          <button type="button" class="sol-form-btn sol-form-btn-primary sol-form-save-btn" style="display:none">Save</button>
          <span class="sol-form-save-status"></span>
        </div>
      </div>`;
    adopt(root, { sheet: formSheet, css: FORM_CSS });
    this._rendered = true;

    root.querySelector('.sol-form-set-loc').addEventListener('click', () => this._onSetLocation());
    root.querySelector('.sol-form-save-btn').addEventListener('click', () => this._onSaveClick());
  }

  _showLocationInput(show) {
    const el = this.shadowRoot.querySelector('.sol-form-pod-url');
    el.style.display = show ? 'flex' : 'none';
    if (show) {
      const input = el.querySelector('.sol-form-pod-input');
      if (!input.value && this.getAttribute('save-to')) input.value = this.getAttribute('save-to');
      input.focus();
    }
  }

  _showSaveButton(show) {
    this.shadowRoot.querySelector('.sol-form-save-btn').style.display = show ? '' : 'none';
  }

  // ── loading ──

  async _load() {
    const source = this.getAttribute('source');
    const shape  = this.getAttribute('shape');
    const view   = (this.getAttribute('view') || '').toLowerCase();
    if (!source && !shape) return;

    const body = this.shadowRoot.querySelector('.sol-form-body');
    body.innerHTML = '<div class="sol-form-loading">Loading form…</div>';
    this._clearStatus();
    this._hideValidation();
    clearTimeout(this._saveTimer);

    // Rolodex view: `source` is a data document, `shape` is the per-item
    // shape. We find every subject the shape targets and render one
    // editable record-form per subject, navigable card-by-card.
    if (view === 'rolodex') {
      try {
        if (!shape)  throw new Error('view="rolodex" requires a shape attribute.');
        if (!source) throw new Error('view="rolodex" requires a source data document.');
        await this._renderRolodex(body, source, shape);
      } catch (err) {
        body.innerHTML = `<div class="sol-form-error">${this._esc(err.message)}</div>`;
        console.error('<sol-form view="rolodex"> failed:', err);
      }
      return;
    }

    try {
      // Form definition (optional in shape-driven mode).
      let formStore = null, formRoot = null;
      if (source) {
        formStore = await loadRdfStore(source);
        formRoot = findForm(formStore, source);
        if (!formRoot) throw new Error('No ui:Form found in ' + source);
      }

      const subjectAttr = this.getAttribute('subject');
      const saveTo      = this.getAttribute('save-to');
      // rdflib requires absolute IRIs; absolutize `subject` against the
      // page so consumers can use relative URLs (matching what `shape`
      // and `source` already do via `new URL(…, document.baseURI)`).
      const subjectUri = subjectAttr
        ? new URL(subjectAttr, document.baseURI).href
        : null;
      let dataStore, subjectNode, docNode, docUrl;

      if (subjectUri) {
        docUrl = subjectUri.split('#')[0];
        dataStore = this._initStore(docUrl);
        await dataStore.fetcher.load(docUrl);
        subjectNode = rdf.sym(subjectUri);
        docNode = rdf.sym(docUrl);
      } else {
        // Use save-to as the doc URL when given; otherwise a synthetic local
        // base — _docUrl stays null until the user supplies a real location.
        const baseUri = source || shape;
        const baseDoc = saveTo || new URL('_new.ttl', new URL(baseUri, document.baseURI)).href;
        dataStore = this._initStore(baseDoc);
        docNode = rdf.sym(baseDoc);
        subjectNode = rdf.blankNode();
        docUrl = saveTo || null;
      }

      this._store    = dataStore;
      this._formNode = formRoot;
      this._subject  = subjectNode;
      this._docNode  = docNode;
      this._docUrl   = docUrl;
      // Track whether this form is editing an existing-on-server doc
      // (`true` → per-field PATCH via solid-ui already saved everything;
      // a Save-button click just emits the event) vs. authoring a new
      // doc (`false` → PUT once to create, then flip to true).
      this._docExists = !!docUrl;
      this._ordered  = formStore ? this._hasOrdering(formStore, formRoot) : false;

      if (formStore) {
        // Classic form-driven path: parse the ui:Form and hand to solid-ui.
        this._mergeFormDefs(dataStore, formStore);
        if (shape) await this._loadShape(shape);
        this._renderForm(body, dataStore, subjectNode, formRoot, docNode);
      } else {
        // Shape-driven path: no form TTL, the SHACL shape IS the schema.
        // sol-form walks the shape and generates one labelled field per
        // sh:qualifiedValueShape entry (PropertyValue-style settings).
        await this._loadShape(shape);
        await this._renderFromShape(body, dataStore, subjectNode, docNode);
      }

      this._showSaveButton(this._ordered);

    } catch (err) {
      body.innerHTML = `<div class="sol-form-error">${this._esc(err.message)}</div>`;
      console.error('<sol-form> load failed:', err);
    }
  }

  _initStore(docUrl) {
    // Use the shared singleton (solid-logic's when available; otherwise
    // swc's own lazy graph). That's the same graph solid-ui's modules
    // captured at import time — see core/rdf.js. Everything we add here
    // is immediately visible to solid-ui's field renderers.
    const store = rdf.store;
    if (!store.fetcher) store.fetcher = new (rdf.Fetcher)(store);
    if (!store.updater) store.updater = new (rdf.UpdateManager)(store);

    return store;
  }

  _mergeFormDefs(dataStore, formStore) {
    const stmts = formStore.statements || formStore.match(null, null, null) || [];
    for (const st of stmts) {
      if (!dataStore.holds(st.subject, st.predicate, st.object, st.why)) {
        dataStore.add(st.subject, st.predicate, st.object, st.why);
      }
    }
  }

  // Walk the form definition, returning true if any ui:Multiple has
  // ui:ordered true (directly or in a referenced sub-form).
  _hasOrdering(formStore, formRoot) {
    const TYPE = rdf.sym(RDF + 'type');
    const ORDERED = rdf.sym(UI + 'ordered');
    const PART = rdf.sym(UI + 'part');
    const USE = rdf.sym(UI + 'use');
    const CASE = rdf.sym(UI + 'case');

    const seen = new Set();
    const queue = [formRoot];
    while (queue.length) {
      const node = queue.shift();
      if (!node || !node.value || seen.has(node.value)) continue;
      seen.add(node.value);

      const t = formStore.any(node, TYPE);
      if (t && t.value === UI + 'Multiple' && formStore.anyValue(node, ORDERED) === 'true') {
        return true;
      }

      for (const part of readFormParts(formStore, node)) queue.push(part);
      const subPart = formStore.any(node, PART);
      if (subPart) queue.push(subPart);
      for (const c of formStore.each(node, CASE)) {
        const useForm = formStore.any(c, USE);
        if (useForm) queue.push(useForm);
      }
    }
    return false;
  }

  // ── render via solid-ui ──

  _renderForm(body, store, subject, form, doc) {
    body.innerHTML = '';

    // Bundled solid-ui exposes fieldFunction at window.UI.widgets.fieldFunction
    // (flattened). The older API put it at widgets.forms.fieldFunction. Accept
    // either so sol-form works against both shapes.
    const fieldFunction =
      window.UI?.widgets?.fieldFunction ??
      window.UI?.widgets?.forms?.fieldFunction;
    if (typeof fieldFunction !== 'function') {
      body.innerHTML =
        '<div class="sol-form-error">solid-ui is not loaded — <code>&lt;sol-form&gt;</code> requires it for rendering. Add solid-ui to the page.</div>';
      return;
    }

    // _initStore returned solid-logic's singleton store when available,
    // so solid-ui's captured `kb` already IS `store`. Nothing to swap.
    const renderFn = fieldFunction(document, form);
    if (typeof renderFn !== 'function') {
      body.innerHTML =
        '<div class="sol-form-error">solid-ui could not resolve a renderer for the form root (check the form definition reaches solid-logic).</div>';
      return;
    }
    const widget = renderFn(document, body, {}, subject, form, doc, (ok, msg) => {
      this.dispatchEvent(new CustomEvent('sol-form-change', {
        bubbles: true, composed: true,
        detail: { subject: this._subject, ok, message: msg },
      }));
      if (ok && !this._ordered) this._scheduleAutoSave();
    });
    if (widget && !body.contains(widget)) body.appendChild(widget);
  }

  // solid-logic shares state across module copies via a Symbol.for-keyed
  // singleton on the global object — same lookup it uses internally.
  // When present, this singleton's .store IS sol-form's data store
  // (see _initStore), so there's no swap/restore dance: every component
  // shares the same graph.
  _solidLogicSingleton() {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return null;
    const sym = Symbol.for('solid-logic-singleton');
    return win[sym] || win.SolidLogic || null;
  }

  // ── shape-driven rendering ──
  //
  // When sol-form is given a `shape` attribute and no `source` form,
  // the SHACL shape IS the schema. The heavy lifting (parsing the
  // SHACL, walking sh:property entries with sh:qualifiedValueShape,
  // building typed inputs, binding them back to the store) lives in
  // `core/shape-to-form.js` so it can be reused by sol-tree-edit,
  // future view-mode renderers, and the standalone shape2form demo.
  //
  // sol-form's job here is just: parse + render + wire the onChange
  // callback to the existing autosave + sol-form-change event flow.

  async _renderFromShape(body, store, subject, doc) {
    body.innerHTML = '';
    let parsed;
    try {
      parsed = await parseShape(this._shapeText, this.getAttribute('shape') || '',
                                { dataStore: store, subject });
    } catch (err) {
      body.innerHTML = `<div class="sol-form-error">Failed to parse shape: ${this._esc(err.message)}</div>`;
      return;
    }
    if (!parsed.properties.length) {
      body.innerHTML = '<div class="sol-form-error">Shape declares no qualified properties — nothing to render.</div>';
      return;
    }

    // Container pattern: if the selected shape has a multi-valued
    // property with a nested NodeShape (sh:node), the user data is "a
    // collection of records" — render a rolodex of cards keyed off
    // that property, one per linked record, using the inner shape's
    // own properties. Scalar siblings on the outer shape are
    // intentionally ignored here; the rolodex of records is what the
    // user cares about. First match wins.
    const containerProp = parsed.properties.find(p =>
      (p.maxCount === Infinity || p.maxCount > 1) && p.nestedProperties);
    if (containerProp) {
      const subjects = containerProp.reverse
        ? store.each(null, containerProp.path, subject, doc).filter(n => n)
        : store.each(subject, containerProp.path, null, doc).filter(n => n);
      this._buildRolodexCards(body, store, doc, subjects,
                              containerProp.nestedProperties, containerProp.sortedBy);
      return;
    }

    const readOnly = this.hasAttribute('no-edit');
    this._shapeCleanup?.();
    this._shapeCleanup = renderRecordForm(body, store, subject, parsed.properties, {
      doc,
      readOnly,
      onChange: () => {
        // solid-ui's fieldFunction widgets (basic + Choice via our
        // wireSingleSelectAutosave) PATCH via store.updater.update — that
        // IS the save. We don't autosave on top of that; we just emit the
        // events downstream listeners use to refresh.
        this.dispatchEvent(new CustomEvent('sol-form-change', {
          bubbles: true, composed: true,
          detail: { subject: this._subject, ok: true, message: '' },
        }));
        if (!this._ordered) {
          this.dispatchEvent(new CustomEvent('sol-form-save', {
            bubbles: true, composed: true,
            detail: { subject: this._subject, target: this._docUrl },
          }));
        }
      },
    });
    // Hide the save bar entirely when read-only — nothing to save.
    const saveBar = this.shadowRoot.querySelector('.sol-form-save-bar');
    if (saveBar) saveBar.style.display = readOnly ? 'none' : '';
  }

  // ── rolodex view (one form per matching subject) ──
  //
  // `source` is treated as a data document (not a ui:Form definition).
  // `shape` selects which subjects in that document get a form via its
  // sh:targetClass / sh:targetNode / sh:targetSubjectsOf. Each form is
  // pre-rendered and kept mounted (toggle visibility on nav) so solid-ui
  // widgets keep their state — sol-rolodex's clone-per-flip approach
  // would break live form bindings.
  async _renderRolodex(body, source, shape) {
    await this._loadShape(shape);
    const parsed = await parseShape(this._shapeText, shape || '');
    if (!parsed.properties.length) {
      throw new Error('Shape declares no qualified properties — nothing to render.');
    }

    const docUrl = new URL(source, document.baseURI).href;
    const dataStore = this._initStore(docUrl);
    // Editable rolodexes write through a raw sparql-update PATCH (rdflib's
    // own PATCH 500s on CSS for some docs). Field edits (solid-ui) and our
    // Add / Remove both go through updater.update, so this one swap covers all.
    if (this.hasAttribute('editable')) installRawSparqlUpdate(dataStore);
    await dataStore.fetcher.load(docUrl);
    const docNode = rdf.sym(docUrl);

    const subjects = findSubjects(dataStore, parsed.targets, docNode);

    this._store   = dataStore;
    this._docNode = docNode;
    this._docUrl  = docUrl;

    this._buildRolodexCards(body, dataStore, docNode, subjects, parsed.properties, null, {
      lazy: this.hasAttribute('lazy'),
      editable: this.hasAttribute('editable'),
      targets: parsed.targets,
    });
  }

  // Build the rolodex UI: nav buttons + counter + one pre-rendered card
  // per subject. Used both by view="rolodex" and by the container-pattern
  // detection in _renderFromShape (a shape whose outer property is a
  // multi-valued sh:node onto an inner record shape).
  //
  // When `sortedBy` (NamedNode) is given, cards are sorted by that
  // predicate's integer value on each subject, the matching inner field
  // is hidden, and each card gains ↑/↓ buttons that swap the
  // `sortedBy` value with the previous / next subject (two-statement
  // PATCH via store.updater.update).
  _buildRolodexCards(body, dataStore, docNode, subjects, properties, sortedBy = null, opts = {}) {
    adopt(this.shadowRoot, { sheet: rolodexSheet, css: ROLODEX_CSS });

    // `lazy` mounts only the active record's form (dispose + rebuild on
    // nav) so a rolodex over hundreds of records stays light; safe because
    // fields autosave (no in-progress state to preserve across a flip).
    // sortedBy reorder needs neighbouring cards mounted, so it forces eager.
    const lazy = !!opts.lazy && !sortedBy;
    const editable = !!opts.editable;   // show jump box + Add / Remove
    const targets = opts.targets || {};
    const startIndex = opts.startIndex || 0;
    const RDF_TYPE = rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const lastSeg = u => String(u).replace(/[#/]+$/, '').replace(/^.*[#/]/, '') || u;

    // Mutable copy — Add / Remove splice this list.
    subjects = [...subjects];

    const sortKey = (subj) => {
      if (!sortedBy) return 0;
      const v = dataStore.anyValue(subj, sortedBy, null, docNode);
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    if (sortedBy) subjects.sort((a, b) => sortKey(a) - sortKey(b));

    // Hide the ordering field from each card — the ↑/↓ buttons own it.
    const displayProps = sortedBy
      ? properties.filter(p => !p.path || p.path.value !== sortedBy.value)
      : properties;
    // Label predicate for the jump box: the first scalar field of the shape.
    const labelPred = (displayProps.find(p => p.path) || {}).path || null;
    const labelOf = (subj) =>
      (labelPred && dataStore.anyValue(subj, labelPred, null, docNode)) || lastSeg(subj.value);

    this._rolodexCleanups?.forEach(fn => { try { fn(); } catch (_) {} });
    this._rolodexCleanups = [];

    body.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'sol-view-rolodex';
    wrapper.tabIndex = 0;
    wrapper.style.display = 'block';
    wrapper.style.width = '100%';

    const nav = document.createElement('div');
    nav.className = 'rolodex-nav';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'sol-btn sol-btn-icon rolodex-btn';
    prevBtn.setAttribute('aria-label', 'Previous record');
    prevBtn.textContent = '‹';
    const counter = document.createElement('span');
    counter.className = 'rolodex-counter';
    counter.setAttribute('aria-live', 'polite');
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'sol-btn sol-btn-icon rolodex-btn';
    nextBtn.setAttribute('aria-label', 'Next record');
    nextBtn.textContent = '›';
    nav.append(prevBtn, counter, nextBtn);
    wrapper.appendChild(nav);

    // Jump box: a native <datalist> over record labels (in-memory, no query).
    // Picking / typing an exact label pages the rolodex to that record.
    let jumpInput = null, datalist = null;
    if (editable) {
      const jump = document.createElement('div');
      jump.className = 'rolodex-jump';
      jumpInput = document.createElement('input');
      jumpInput.type = 'text';
      jumpInput.className = 'rolodex-jump-input';
      jumpInput.placeholder = 'Jump to…';
      jumpInput.setAttribute('aria-label', 'Jump to a record');
      const listId = 'rolodex-list-' + Math.random().toString(36).slice(2);
      jumpInput.setAttribute('list', listId);
      datalist = document.createElement('datalist');
      datalist.id = listId;
      jump.append(jumpInput, datalist);
      wrapper.appendChild(jump);
      const tryJump = () => {
        const i = subjects.findIndex(s => labelOf(s) === jumpInput.value);
        if (i >= 0) show(i);
      };
      jumpInput.addEventListener('input', tryJump);
      jumpInput.addEventListener('change', tryJump);
    }

    const card = document.createElement('div');
    card.className = 'rolodex-card';
    card.style.cursor = 'default';
    wrapper.appendChild(card);

    // Add / Remove bar.
    let addBtn = null, removeBtn = null;
    if (editable) {
      const bar = document.createElement('div');
      bar.className = 'rolodex-actions';
      bar.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
      addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'sol-btn rolodex-add';
      addBtn.textContent = '+ Add';
      removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sol-btn rolodex-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.style.marginLeft = 'auto';
      bar.append(addBtn, removeBtn);
      wrapper.appendChild(bar);
    }

    body.appendChild(wrapper);

    const rebuildList = () => {
      if (!datalist) return;
      datalist.replaceChildren(...subjects.map(s => {
        const o = document.createElement('option');
        o.value = labelOf(s);
        return o;
      }));
    };
    rebuildList();

    const emitSave = (subj) => this.dispatchEvent(new CustomEvent('sol-form-save', {
      bubbles: true, composed: true, detail: { subject: subj, target: this._docUrl },
    }));
    const onFieldChange = (subj) => {
      this.dispatchEvent(new CustomEvent('sol-form-change', {
        bubbles: true, composed: true, detail: { subject: subj, ok: true, message: '' },
      }));
      rebuildList();   // a label edit changes the jump options
      emitSave(subj);
    };

    let index = 0;
    let pages = [];   // eager only

    // Render one record's form into `card`, disposing whatever was there.
    const renderInto = (subj) => {
      this._rolodexCleanups.forEach(fn => { try { fn(); } catch (_) {} });
      this._rolodexCleanups = [];
      card.replaceChildren();
      const page = document.createElement('div');
      page.className = 'sol-form-rolodex-page';
      page.dataset.subject = subj.value;
      card.appendChild(page);
      this._rolodexCleanups.push(renderRecordForm(page, dataStore, subj, displayProps, {
        doc: docNode, onChange: () => onFieldChange(subj),
      }));
    };

    // Flush a pending field edit before disposing its widget.
    const flush = () => { const ae = this.shadowRoot.activeElement; if (ae && ae.blur) ae.blur(); };

    let show;
    if (lazy) {
      show = (i) => {
        if (!subjects.length) {
          card.replaceChildren();
          counter.textContent = '0 of 0';
          this._subject = null;
          return;
        }
        flush();
        index = ((i % subjects.length) + subjects.length) % subjects.length;
        renderInto(subjects[index]);
        counter.textContent = `${index + 1} of ${subjects.length}`;
        this._subject = subjects[index];
        if (jumpInput) jumpInput.value = labelOf(subjects[index]);
      };
    } else {
      // Eager: pre-render every card and toggle visibility (preserves widget
      // state across flips; required for the sortedBy reorder controls).
      pages = subjects.map(subj => {
        const page = document.createElement('div');
        page.className = 'sol-form-rolodex-page';
        page.dataset.subject = subj.value;
        card.appendChild(page);
        this._rolodexCleanups.push(renderRecordForm(page, dataStore, subj, displayProps, {
          doc: docNode, onChange: () => onFieldChange(subj),
        }));

        if (sortedBy) {
          const reorder = document.createElement('div');
          reorder.className = 'rolodex-reorder';
          const hint = document.createElement('span');
          hint.className = 'rolodex-reorder-hint';
          hint.textContent = 'Use arrows to change order';
          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'sol-btn sol-btn-icon rolodex-reorder-btn';
          upBtn.setAttribute('aria-label', 'Move up');
          upBtn.textContent = '↑';
          upBtn.addEventListener('click', () => this._swapSortedNeighbor(-1));
          const posSpan = document.createElement('span');
          posSpan.className = 'rolodex-pos';
          posSpan.setAttribute('aria-label', 'Position');
          posSpan.textContent = String(sortKey(subj));
          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'sol-btn sol-btn-icon rolodex-reorder-btn';
          downBtn.setAttribute('aria-label', 'Move down');
          downBtn.textContent = '↓';
          downBtn.addEventListener('click', () => this._swapSortedNeighbor(1));
          reorder.append(hint, upBtn, posSpan, downBtn);
          page.appendChild(reorder);
        }
        return page;
      });

      show = (i) => {
        if (!pages.length) { counter.textContent = '0 of 0'; this._subject = null; return; }
        index = ((i % pages.length) + pages.length) % pages.length;
        pages.forEach((p, j) => { p.hidden = j !== index; });
        counter.textContent = `${index + 1} of ${pages.length}`;
        this._subject = subjects[index];
        if (jumpInput) jumpInput.value = labelOf(subjects[index]);
        if (sortedBy) {
          const cur = pages[index];
          const up = cur.querySelector('.rolodex-reorder-btn[aria-label="Move up"]');
          const dn = cur.querySelector('.rolodex-reorder-btn[aria-label="Move down"]');
          if (up) up.disabled = index === 0;
          if (dn) dn.disabled = index === pages.length - 1;
        }
      };

      this._swapSortedNeighbor = (delta) => {
        const i = index;
        const j = i + delta;
        if (j < 0 || j >= subjects.length) return;
        const a = subjects[i], b = subjects[j];
        const litA = dataStore.any(a, sortedBy, null, docNode);
        const litB = dataStore.any(b, sortedBy, null, docNode);
        if (!litA || !litB) return;
        const olds = [rdf.st(a, sortedBy, litA, docNode), rdf.st(b, sortedBy, litB, docNode)];
        const news = [rdf.st(a, sortedBy, litB, docNode), rdf.st(b, sortedBy, litA, docNode)];
        dataStore.updater.update(olds, news, (_uri, ok) => {
          if (!ok) return;
          [subjects[i], subjects[j]] = [subjects[j], subjects[i]];
          [pages[i], pages[j]] = [pages[j], pages[i]];
          card.insertBefore(pages[Math.min(i, j)], pages[Math.max(i, j)]);
          pages.forEach((p, k) => {
            const span = p.querySelector('.rolodex-pos');
            if (span) span.textContent = String(sortKey(subjects[k]));
          });
          show(j);
          emitSave(a);
        });
      };
    }

    // Re-run the whole build (used by Add / Remove in eager mode, where the
    // pre-rendered `pages` array can't grow / shrink in place).
    const rebuild = (at) => this._buildRolodexCards(
      body, dataStore, docNode, subjects, properties, sortedBy,
      { ...opts, startIndex: at });

    if (addBtn) addBtn.addEventListener('click', () => {
      const id = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
      const subj = rdf.sym(docNode.value.split('#')[0] + '#' + id);
      const inserts = [];
      for (const c of (targets.classes || [])) inserts.push(rdf.st(subj, RDF_TYPE, c, docNode));
      for (const p of (targets.subjectsOf || [])) {
        const ex = dataStore.any(null, p, null, docNode);   // anchor to an existing parent
        if (ex) inserts.push(rdf.st(subj, p, ex, docNode));
      }
      if (!inserts.length) { console.warn('[sol-form] cannot derive a type for the new record'); return; }
      dataStore.updater.update([], inserts, (_u, ok, msg) => {
        if (!ok) { console.warn('[sol-form] add failed:', msg); return; }
        subjects.push(subj);
        rebuildList();
        emitSave(subj);
        if (lazy) show(subjects.length - 1);
        else rebuild(subjects.length - 1);
      });
    });

    if (removeBtn) removeBtn.addEventListener('click', () => {
      if (!subjects.length) return;
      // Two-step confirm on the button itself (no native dialog).
      if (removeBtn.dataset.armed !== '1') {
        removeBtn.dataset.armed = '1';
        removeBtn.textContent = 'Click to confirm';
        clearTimeout(this._removeArmTimer);
        this._removeArmTimer = setTimeout(() => {
          removeBtn.dataset.armed = ''; removeBtn.textContent = 'Remove';
        }, 3000);
        return;
      }
      removeBtn.dataset.armed = ''; removeBtn.textContent = 'Remove';
      const subj = subjects[index];
      const dels = [
        ...dataStore.statementsMatching(subj, null, null, docNode),       // its own triples
        ...dataStore.statementsMatching(null, null, subj, docNode),       // catalog membership etc.
      ];
      dataStore.updater.update(dels.slice(), [], (_u, ok, msg) => {
        if (!ok) { console.warn('[sol-form] remove failed:', msg); return; }
        const at = subjects.indexOf(subj);
        subjects.splice(at, 1);
        rebuildList();
        emitSave(subj);
        const next = Math.min(at, Math.max(0, subjects.length - 1));
        if (lazy) show(next);
        else rebuild(next);
      });
    });

    prevBtn.addEventListener('click', () => show(index - 1));
    nextBtn.addEventListener('click', () => show(index + 1));
    wrapper.addEventListener('keydown', e => {
      if (e.target === jumpInput) return;   // let the jump box use arrows
      if (e.key === 'ArrowLeft')  { e.preventDefault(); show(index - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    if (!subjects.length && editable) { card.replaceChildren(); counter.textContent = '0 of 0'; }
    else show(Math.min(startIndex, subjects.length - 1));

    const saveBar = this.shadowRoot.querySelector('.sol-form-save-bar');
    if (saveBar) saveBar.style.display = 'none';
  }

  // ── save ──

  _scheduleAutoSave() {
    clearTimeout(this._saveTimer);
    this._pendingSave = true;
    this._saveTimer = setTimeout(() => this._save().catch(() => {}), AUTOSAVE_DEBOUNCE_MS);
  }

  // Manual save button (ordered forms).
  _onSaveClick() {
    this._save().catch(() => {});
  }

  // "Set" button next to the save-location input.
  async _onSetLocation() {
    const input = this.shadowRoot.querySelector('.sol-form-pod-input');
    const url = (input.value || '').trim();
    if (!url) { this._setStatus('err', 'Enter a URL'); return; }
    try { new URL(url); } catch { this._setStatus('err', 'Invalid URL'); return; }
    this._docUrl = url;
    // Re-anchor the doc node so the serialized turtle is rooted at the chosen URL.
    this._docNode = rdf.sym(url);
    this._showLocationInput(false);
    if (this._pendingSave || !this._ordered) await this._save().catch(() => {});
  }

  async _save() {
    if (this._shapeText) {
      const report = await this._validate();
      this._showValidation(report);
      if (!report.conforms) return;
    }
    if (!this._docUrl) {
      this._showLocationInput(true);
      this._setStatus('', 'Choose a save location');
      return;
    }

    const btn = this.shadowRoot.querySelector('.sol-form-save-btn');
    if (btn) btn.disabled = true;

    try {
      // For existing docs, each per-field edit already PATCHed via
      // store.updater.update (solid-ui's basic widgets + our
      // wireSingleSelectAutosave). Nothing left to save — just confirm.
      // For brand-new docs (no on-server state yet), do a one-shot PUT
      // to create the file, then flip the flag so subsequent edits flow
      // through the per-field PATCH path normally.
      if (!this._docExists) {
        const turtle = this.getTurtle();
        if (!turtle) { this._setStatus('err', 'Nothing to save'); return; }
        this._setStatus('', 'Saving…');
        await this._putViaUpdater(turtle);
        this._docExists = true;
      }
      this._pendingSave = false;
      this._setStatus('ok', this._ordered ? 'Saved' : 'Auto-saved');
      this.dispatchEvent(new CustomEvent('sol-form-save', {
        bubbles: true, composed: true,
        detail: { subject: this._subject, target: this._docUrl },
      }));
    } catch (err) {
      this._setStatus('err', err.message || 'Save failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // PUT the document via rdflib's UpdateManager.
  _putViaUpdater(turtle) {
    return new Promise((resolve, reject) => {
      const stmts = this._store.statementsMatching(null, null, null, this._docNode);
      this._store.updater.put(this._docNode, stmts, 'text/turtle',
        (uri, ok, errMsg) => ok ? resolve() : reject(new Error(errMsg || 'PUT failed')));
    });
  }

  // ── SHACL validation ──

  async _loadShape(shapeUri) {
    try {
      const resp = await fetch(new URL(shapeUri, document.baseURI).href);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this._shapeText = await resp.text();
    } catch (err) {
      console.warn('<sol-form> could not load shape:', err);
      this._shapeText = null;
    }
  }

  async _validate() {
    if (!this._shapeText) return { conforms: true, results: [] };
    try {
      const { Parser, Store } = await import('n3');
      const SHACLValidator = (await import('rdf-validate-shacl')).default;
      const parseToStore = (text, baseIRI) => {
        const parser = new Parser({ baseIRI });
        const s = new Store();
        s.addQuads(parser.parse(text));
        return s;
      };
      const turtle = this.getTurtle();
      if (!turtle) return { conforms: false, results: [{ message: 'No data to validate' }] };
      const shapesStore = parseToStore(this._shapeText, this.getAttribute('shape') || '');
      const dataStore   = parseToStore(turtle, this._docNode?.value || '');
      return new SHACLValidator(shapesStore).validate(dataStore);
    } catch (err) {
      console.warn('<sol-form> SHACL validation failed:', err);
      return { conforms: true, results: [] };
    }
  }

  _showValidation(report) {
    const el = this.shadowRoot.querySelector('.sol-form-validation-summary');
    if (!report || report.conforms) { el.style.display = 'none'; return; }
    const msgs = Array.from(report.results || []).map(r => {
      const path = r.path ? r.path.value.replace(/.*[/#]/, '') : '';
      const msg = (Array.isArray(r.message) ? r.message[0]?.value : r.message?.value) || 'Validation error';
      return path ? `${path}: ${msg}` : msg;
    });
    el.innerHTML = `<strong>Validation errors:</strong><ul>${msgs.map(m => `<li>${this._esc(m)}</li>`).join('')}</ul>`;
    el.style.display = 'block';
  }

  _hideValidation() {
    const el = this.shadowRoot.querySelector('.sol-form-validation-summary');
    if (el) el.style.display = 'none';
  }

  // ── small UI helpers ──

  _setStatus(cls, msg) {
    const el = this.shadowRoot.querySelector('.sol-form-save-status');
    el.className = 'sol-form-save-status ' + cls;
    el.textContent = msg;
  }

  _clearStatus() {
    const el = this.shadowRoot.querySelector('.sol-form-save-status');
    if (el) { el.className = 'sol-form-save-status'; el.textContent = ''; }
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

define('sol-form', SolForm);
export { SolForm };
export default SolForm;
