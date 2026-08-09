/**
 * <sol-wac> — Web Access Control (WAC) editor.
 *
 * Displays and edits the ACL for a Solid resource. Renders two subtabs:
 *   - Form: a permissions matrix — one row per "who" (Anyone / Any
 *     logged-in user / one row per specific user-or-group WebID) and one
 *     checkbox column per mode (Read / Append / Write-Delete / Control).
 *     On coarse pointers (phones) the same DOM re-lays via CSS as one
 *     stacked card per who-row with 44px toggle chips per mode; desktop
 *     keeps the table.
 *     Specific rows carry a WebID input plus a user/group selector; an
 *     "Add user or group WebID" button appends further rows. A
 *     container-only checkbox toggles acl:default (apply to contents).
 *   - RDF: raw Turtle in a textarea.
 *
 * Attributes:
 *   source       — resource URL whose ACL should be loaded
 *
 * Properties:
 *   fetchFn      — authenticated fetch (defaults to window.fetch)
 *   source       — mirror of the `source` attribute
 *
 * Methods:
 *   load()       — (re)load the ACL from the server
 *   save()       — validate the current Turtle as RDF, then PUT it to the
 *                  resolved ACL URL; invalid RDF is never saved
 *
 * Events (bubbling, composed):
 *   sol-wac-save   — ACL saved successfully ({ aclUrl })
 *   sol-wac-error  — load, validate or save failed ({ phase, error })
 *   sol-status     — human-readable status ({ message, type })
 */

import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';
import { CSS as WAC_CSS } from './styles/sol-wac-css.js';
import { rdf } from '../core/rdf.js';
import { escapeHtml } from '../core/utils.js';
import './sol-tabs.js';

// ── ACL constants ─────────────────────────────────────────────────────

const ACL = 'http://www.w3.org/ns/auth/acl#';
const FOAF = 'http://xmlns.com/foaf/0.1/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export const MODES = [
  { key: 'read',    label: 'Read',           uri: ACL + 'Read' },
  { key: 'append',  label: 'Append',         uri: ACL + 'Append' },
  { key: 'write',   label: 'Write/Delete',   uri: ACL + 'Write' },
  { key: 'control', label: 'Control Access', uri: ACL + 'Control' },
];

export const AGENT_KINDS = [
  { value: 'agent', label: 'User' },
  { value: 'group', label: 'Group' },
];

const emptyModes = () => ({ read: false, append: false, write: false, control: false });
const hasModes = (modes) => MODES.some(m => modes[m.key]);

// ── ACL discovery ─────────────────────────────────────────────────────

export async function getAclUrl(resourceUrl, fetchFn) {
  try {
    const resp = await fetchFn(resourceUrl, { method: 'HEAD', headers: { 'Cache-Control': 'no-cache' } });
    const link = resp.headers.get('Link') || '';
    const match = link.match(/<([^>]+)>\s*;\s*rel="acl"/);
    if (match) return new URL(match[1], resourceUrl).href;
  } catch (e) {}
  return resourceUrl + '.acl';
}

export async function getPermissions(url, fetchFn) {
  const aclUrl = await getAclUrl(url, fetchFn);
  const ownResp = await fetchFn(aclUrl, { headers: { 'Cache-Control': 'no-cache' } });
  if (ownResp.ok) {
    return { own: await ownResp.text(), aclUrl, inherited: null, inheritedFrom: null };
  }

  const urlObj = new URL(url);
  let parts = urlObj.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  while (parts.length > 0) {
    parts = parts.slice(0, -1);
    const parentUrl = urlObj.origin + '/' + parts.join('/') + (parts.length ? '/' : '');
    const parentAclUrl = await getAclUrl(parentUrl, fetchFn);
    const parentResp = await fetchFn(parentAclUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (parentResp.ok) {
      return { own: null, aclUrl, inherited: await parentResp.text(), inheritedFrom: parentUrl };
    }
  }
  return { own: null, aclUrl, inherited: null, inheritedFrom: null };
}

// ── ACL parsing ───────────────────────────────────────────────────────

export function parseAcl(turtleText, baseUrl) {
  const store = rdf.graph();
  try {
    rdf.parse(turtleText, store, baseUrl, 'text/turtle');
  } catch (e) {
    return [];
  }

  const authSubjects = store
    .each(null, rdf.sym(RDF_TYPE), rdf.sym(ACL + 'Authorization'), null)
    .map(s => s.value);

  const vals = (subject, pred) =>
    store.each(rdf.sym(subject), rdf.sym(pred), null, null).map(n => n.value);

  const auths = [];
  for (const subject of new Set(authSubjects)) {
    const auth = {
      subject,
      modes:        vals(subject, ACL + 'mode'),
      agents:       vals(subject, ACL + 'agent'),
      agentClasses: vals(subject, ACL + 'agentClass'),
      agentGroups:  vals(subject, ACL + 'agentGroup'),
      accessTo:     vals(subject, ACL + 'accessTo'),
      default:      vals(subject, ACL + 'default'),
    };
    if (auth.modes.length > 0) auths.push(auth);
  }
  return auths;
}

export function authsToMatrix(auths) {
  const model = {
    public: emptyModes(),          // acl:agentClass foaf:Agent
    authenticated: emptyModes(),   // acl:agentClass acl:AuthenticatedAgent
    agents: [],                    // { id, kind: 'agent'|'group', modes }
    applyToContents: false,
  };
  const byKey = new Map();
  const mark = (target, uris) => {
    MODES.forEach(m => { if (uris.includes(m.uri)) target[m.key] = true; });
  };
  const agentEntry = (id, kind) => {
    const key = kind + ' ' + id;
    if (!byKey.has(key)) {
      const entry = { id, kind, modes: emptyModes() };
      byKey.set(key, entry);
      model.agents.push(entry);
    }
    return byKey.get(key);
  };

  for (const auth of auths) {
    if (auth.agentClasses.includes(FOAF + 'Agent')) mark(model.public, auth.modes);
    if (auth.agentClasses.includes(ACL + 'AuthenticatedAgent')) mark(model.authenticated, auth.modes);
    auth.agents.forEach(id => mark(agentEntry(id, 'agent').modes, auth.modes));
    auth.agentGroups.forEach(id => mark(agentEntry(id, 'group').modes, auth.modes));
    if (auth.default.length > 0) model.applyToContents = true;
  }
  return model;
}

// Strict parse of `turtleText` as Turtle — { ok, error }. Unlike parseAcl
// (which swallows parse errors and returns []), this reports WHY it failed,
// so save() can refuse to write a broken ACL.
export function validateTurtle(turtleText, baseUrl) {
  try {
    rdf.parse(turtleText || '', rdf.graph(), baseUrl, 'text/turtle');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

export function matrixToTurtle(model, resourceUrl) {
  let turtle = '@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n\n';
  const isContainer = resourceUrl.endsWith('/');

  const block = (frag, modes, agentLine) => {
    turtle += `<#${frag}>\n    a acl:Authorization;\n`;
    turtle += `    acl:accessTo <${resourceUrl}>;\n`;
    if (isContainer && model.applyToContents) turtle += `    acl:default <${resourceUrl}>;\n`;
    turtle += `    acl:mode ${MODES.filter(m => modes[m.key]).map(m => 'acl:' + m.uri.split('#')[1]).join(', ')};\n`;
    turtle += `    ${agentLine}.\n\n`;
  };

  if (hasModes(model.public)) block('public', model.public, 'acl:agentClass foaf:Agent');
  if (hasModes(model.authenticated)) block('authenticated', model.authenticated, 'acl:agentClass acl:AuthenticatedAgent');

  let idx = 0;
  for (const entry of model.agents) {
    const id = (entry.id || '').trim();
    if (!id || !hasModes(entry.modes)) continue;
    idx++;
    block(`agent${idx}`, entry.modes,
      entry.kind === 'group' ? `acl:agentGroup <${id}>` : `acl:agent <${id}>`);
  }
  return turtle;
}

// ── Component ─────────────────────────────────────────────────────────

/**
 * Web Access Control (WAC) editor.
 *
 * Displays and edits the ACL for a Solid resource. Renders a form
 * subtab (a who × mode checkbox matrix) and an RDF subtab (raw Turtle).
 *
 * @class SolWac
 * @extends HTMLElement
 * @attr {string} source - resource URL whose ACL should be loaded
 * @property {Function} fetchFn - authenticated fetch (defaults to window.fetch)
 * @fires sol-wac-save - detail: { aclUrl }; ACL saved
 * @fires sol-wac-error - detail: { phase, error }; load or save failed
 * @fires sol-status - detail: { message, type }
 */
class SolWac extends HTMLElement {
  static get observedAttributes() { return ['source']; }

  constructor() {
    super();
    this._fetchFn = null;
    this._aclUrl = null;
    this._turtle = '';
    this._model = null;
    this._isContainer = false;
    this._isContainerHint = null;
    this._inherited = null;
    this._inheritedFrom = null;
    this._rendered = false;
    this._rdfDirty = false;   // true when the RDF subtab's raw text is the authority
  }

  get source() { return this.getAttribute('source') || ''; }
  set source(v) { if (v) this.setAttribute('source', v); else this.removeAttribute('source'); }

  /** Explicit container-ness from the host (e.g. sol-pod-ops knows the
   *  item). When set, it overrides the URL-shape heuristic — the
   *  folder-only "apply to contents" checkbox must never appear on a
   *  file whatever its URL looks like. */
  get isContainer() { return this._isContainer; }
  set isContainer(v) {
    this._isContainerHint = (v === null || v === undefined) ? null : !!v;
    if (this._rendered && this.source) this.load();
  }

  get fetchFn() { return this._fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null); }
  set fetchFn(fn) { this._fetchFn = fn; if (this._rendered) this.load(); }

  connectedCallback() {
    ensureDocStyle(this.getRootNode(), 'sol-wac-styles', WAC_CSS);
    if (this._rendered) return;
    this._rendered = true;
    if (this.source) this.load();
  }

  attributeChangedCallback(name, _old, _new) {
    if (name === 'source' && this._rendered) this.load();
  }

  async load() {
    const url = this.source;
    if (!url) return;
    this._isContainer = this._isContainerHint ?? url.endsWith('/');
    this.innerHTML = '<div class="acl-banner">Loading permissions…</div>';

    let perms;
    try {
      perms = await getPermissions(url, this.fetchFn);
    } catch (e) {
      this.innerHTML = `<div class="acl-error">Failed to load ACL: ${escapeHtml(e.message)}</div>`;
      this._emit('sol-wac-error', { phase: 'load', error: e });
      return;
    }

    this._aclUrl = perms.aclUrl;
    this._inherited = perms.inherited || null;
    this._inheritedFrom = perms.inheritedFrom || null;
    this._rdfDirty = false;

    if (perms.own) {
      this._turtle = perms.own;
      this._model = authsToMatrix(parseAcl(perms.own, url));
    } else if (perms.inherited) {
      // Children inherit only the parent's acl:default Authorizations.
      const inheritedAuths = parseAcl(perms.inherited, perms.inheritedFrom)
        .filter(a => a.default.length > 0);
      this._model = authsToMatrix(inheritedAuths);
      this._turtle = matrixToTurtle(this._model, url);
    } else {
      this._turtle = '';
      this._model = authsToMatrix([]);
    }
    this._render();
  }

  async save() {
    if (!this._aclUrl) return;
    // The form's model regenerates the Turtle — unless the RDF subtab's raw
    // text was hand-edited last, in which case that text is what gets saved.
    if (!this._rdfDirty && this._model) this._turtle = matrixToTurtle(this._model, this.source);
    const valid = validateTurtle(this._turtle, this._aclUrl);
    if (!valid.ok) {
      this._emit('sol-wac-error', { phase: 'validate', error: new Error(valid.error) });
      this._emit('sol-status', { message: `ACL not saved — invalid RDF: ${valid.error}`, type: 'error' });
      return;
    }
    try {
      const resp = await this.fetchFn(this._aclUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: this._turtle,
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      this._emit('sol-wac-save', { aclUrl: this._aclUrl });
      this._emit('sol-status', { message: 'ACL saved.', type: 'success' });
      this._rdfDirty = false;
      this._inherited = null;
      this._inheritedFrom = null;
      this._renderBanner();
    } catch (e) {
      this._emit('sol-wac-error', { phase: 'save', error: e });
      this._emit('sol-status', { message: `ACL save failed: ${e.message}`, type: 'error' });
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────

  _render() {
    this.innerHTML = '';

    this._bannerEl = document.createElement('div');
    this._renderBanner();
    this.appendChild(this._bannerEl);

    const subtabs = document.createElement('sol-tabs');
    subtabs.setAttribute('variant', 'sub');
    subtabs.tabs = [
      { name: 'Form', render: (body) => this._renderForm(body) },
      { name: 'RDF',  render: (body) => this._renderRdf(body) },
    ];
    this.appendChild(subtabs);

    // sol-tabs renders lazily; dispatch once it's ready
    queueMicrotask(() => {
      subtabs.switchTab('Form');
      const bar = subtabs.querySelector(':scope > .sol-tabs-bar');
      if (bar && !bar.querySelector('.acl-save-btn')) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'sol-btn sol-btn-sm sol-btn-primary acl-save-btn';
        saveBtn.textContent = 'Save ACL';
        saveBtn.onclick = () => this.save();
        bar.appendChild(saveBtn);
      }
    });

  }

  _renderBanner() {
    if (!this._bannerEl) return;
    if (this._inherited && this._inheritedFrom) {
      this._bannerEl.className = 'acl-banner';
      this._bannerEl.textContent =
        `Showing permissions inherited from ${this._inheritedFrom}. Save to apply permissions specific to this resource.`;
      this._bannerEl.style.display = '';
    } else {
      this._bannerEl.textContent = '';
      this._bannerEl.style.display = 'none';
    }
  }

  _renderForm(body) {
    body.innerHTML = '';
    body.appendChild(this._buildMatrixForm(this._model, this._isContainer, () => {
      this._turtle = matrixToTurtle(this._model, this.source);
      this._rdfDirty = false;
    }));
  }

  _renderRdf(body) {
    body.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.className = 'acl-rdf-editor';
    ta.spellcheck = false;
    ta.value = this._turtle;
    // Grow to fit the content — the surrounding pane scrolls, not the textarea.
    const autosize = () => {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight + 4) + 'px';
    };
    ta.addEventListener('input', () => {
      this._turtle = ta.value;
      this._rdfDirty = true;
      autosize();
      // Re-parse so the form view reflects manual edits on next switch.
      try {
        this._model = authsToMatrix(parseAcl(ta.value, this.source));
      } catch (_) { /* leave model as-is on parse error */ }
    });
    body.appendChild(ta);
    queueMicrotask(autosize);
  }

  _buildMatrixForm(model, isContainer, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'acl-matrix-form';

    const table = document.createElement('table');
    table.className = 'acl-matrix';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th'));
    MODES.forEach(m => {
      const th = document.createElement('th');
      th.textContent = m.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    const modeCells = (tr, modes) => {
      MODES.forEach(m => {
        const td = document.createElement('td');
        td.className = 'acl-mode-cell';
        // The label + tag exist for the coarse-pointer layout: the tag is
        // display:none on desktop (checkbox alone, as before), but becomes
        // the 44px chip face of the stacked-card form on phones. The table
        // header is hidden there, so the tag is the only mode name visible.
        const chip = document.createElement('label');
        chip.className = 'acl-mode-chip';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!modes[m.key];
        cb.addEventListener('change', () => { modes[m.key] = cb.checked; onChange(); });
        const tag = document.createElement('span');
        tag.className = 'acl-mode-tag';
        tag.textContent = m.label;
        chip.append(cb, tag);
        td.appendChild(chip);
        tr.appendChild(td);
      });
    };

    const classRow = (label, modes) => {
      const tr = document.createElement('tr');
      const who = document.createElement('td');
      who.className = 'acl-who';
      who.textContent = label;
      tr.appendChild(who);
      modeCells(tr, modes);
      tbody.appendChild(tr);
    };
    classRow('Anyone', model.public);
    classRow('Any logged-in user', model.authenticated);

    const addBtn = document.createElement('button');
    addBtn.className = 'sol-btn sol-btn-sm acl-add-agent';
    addBtn.textContent = '＋ Add user or group WebID';
    const updateAddBtn = () => {
      addBtn.style.display = model.agents.some(a => (a.id || '').trim()) ? '' : 'none';
    };

    const agentRow = (entry) => {
      const tr = document.createElement('tr');
      const who = document.createElement('td');
      who.className = 'acl-who';
      const cell = document.createElement('div');
      cell.className = 'acl-agent-cell';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'acl-webid-input';
      input.placeholder = 'https://example.solidcommunity.net/profile/card#me';
      input.value = entry.id || '';
      input.addEventListener('input', () => {
        entry.id = input.value.trim();
        onChange();
        updateAddBtn();
      });

      const kind = document.createElement('select');
      kind.className = 'acl-kind-select';
      AGENT_KINDS.forEach(k => {
        const o = document.createElement('option');
        o.value = k.value; o.textContent = k.label;
        kind.appendChild(o);
      });
      kind.value = entry.kind;
      kind.addEventListener('change', () => { entry.kind = kind.value; onChange(); });

      cell.append(input, kind);
      who.appendChild(cell);
      tr.appendChild(who);
      modeCells(tr, entry.modes);
      tbody.appendChild(tr);
    };

    if (model.agents.length === 0) {
      model.agents.push({ id: '', kind: 'agent', modes: emptyModes() });
    }
    model.agents.forEach(agentRow);

    addBtn.addEventListener('click', () => {
      const entry = { id: '', kind: 'agent', modes: emptyModes() };
      model.agents.push(entry);
      agentRow(entry);
    });
    updateAddBtn();

    wrap.appendChild(table);
    wrap.appendChild(addBtn);

    if (isContainer) {
      const cbWrap = document.createElement('label');
      cbWrap.className = 'acl-default-wrap acl-default-global';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = model.applyToContents;
      cb.onchange = () => {
        model.applyToContents = cb.checked;
        onChange();
      };
      cbWrap.appendChild(cb);
      cbWrap.appendChild(document.createTextNode('\u00A0Apply to folder contents (acl:default)'));
      wrap.appendChild(cbWrap);
    }
    return wrap;
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

define('sol-wac', SolWac);
export { SolWac };
export default SolWac;
