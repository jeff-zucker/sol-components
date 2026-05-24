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
import { parseShape, renderRecordForm } from '../core/shape-to-form.js';
import { CSS as FORM_CSS, sheet as formSheet } from './styles/sol-form-css.js';

const AUTOSAVE_DEBOUNCE_MS = 600;

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

  static get observedAttributes() { return ['source', 'subject', 'shape', 'save-to']; }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'source' && this._rendered) this._load();
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
    if (!source && !shape) return;

    const body = this.shadowRoot.querySelector('.sol-form-body');
    body.innerHTML = '<div class="sol-form-loading">Loading form…</div>';
    this._clearStatus();
    this._hideValidation();
    clearTimeout(this._saveTimer);

    try {
      // Form definition (optional in shape-driven mode).
      let formStore = null, formRoot = null;
      if (source) {
        formStore = await loadRdfStore(source);
        formRoot = findForm(formStore, source);
        if (!formRoot) throw new Error('No ui:Form found in ' + source);
      }

      const subjectUri = this.getAttribute('subject');
      const saveTo     = this.getAttribute('save-to');
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
        this._renderFromShape(body, dataStore, subjectNode, docNode);
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

    // Mark the doc as editable so solid-ui fields render as inputs.
    store.updater.editable = (uri) => {
      if (typeof uri === 'object') uri = uri?.value || uri?.uri;
      return true;
    };
    // Swallow inline PATCH attempts — persistence is handled by _save.
    store.updater.update = (deletions, insertions, callback) => {
      if (callback) callback(docUrl, true);
    };

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

  _renderFromShape(body, store, subject, doc) {
    body.innerHTML = '';
    let parsed;
    try {
      parsed = parseShape(this._shapeText, this.getAttribute('shape') || '');
    } catch (err) {
      body.innerHTML = `<div class="sol-form-error">Failed to parse shape: ${this._esc(err.message)}</div>`;
      return;
    }
    if (!parsed.properties.length) {
      body.innerHTML = '<div class="sol-form-error">Shape declares no qualified properties — nothing to render.</div>';
      return;
    }
    const readOnly = this.hasAttribute('no-edit');
    this._shapeCleanup?.();
    this._shapeCleanup = renderRecordForm(body, store, subject, parsed.properties, {
      doc,
      readOnly,
      onChange: () => {
        this.dispatchEvent(new CustomEvent('sol-form-change', {
          bubbles: true, composed: true,
          detail: { subject: this._subject, ok: true, message: '' },
        }));
        if (!this._ordered) this._scheduleAutoSave();
      },
    });
    // Hide the save bar entirely when read-only — nothing to save.
    const saveBar = this.shadowRoot.querySelector('.sol-form-save-bar');
    if (saveBar) saveBar.style.display = readOnly ? 'none' : '';
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

    const turtle = this.getTurtle();
    if (!turtle) { this._setStatus('err', 'Nothing to save'); return; }

    const btn = this.shadowRoot.querySelector('.sol-form-save-btn');
    btn.disabled = true;
    this._setStatus('', 'Saving…');

    try {
      await this._putViaUpdater(turtle);
      this._pendingSave = false;
      this._setStatus('ok', this._ordered ? 'Saved' : 'Auto-saved');
      this.dispatchEvent(new CustomEvent('sol-form-save', {
        bubbles: true, composed: true,
        detail: { subject: this._subject, turtle, target: this._docUrl },
      }));
    } catch (err) {
      this._setStatus('err', err.message || 'Save failed');
    } finally {
      btn.disabled = false;
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
