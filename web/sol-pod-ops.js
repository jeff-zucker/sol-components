/**
 * <sol-pod-ops> — standalone pod file/folder operations panel.
 * Renders the same tabbed interface as the sol-pod gear-icon modal,
 * but inline (no modal wrapper).
 *
 * Attributes:
 *   source  — URL of the file or container to manage
 *   login   — CSS selector for a <sol-login> element (authenticated fetch)
 *
 * Properties:
 *   item     — { url, name, isContainer, contentType } override (optional)
 *   fetchFn  — custom fetch function
 *
 * Events:
 *   sol-status({ message, type })  — operation feedback
 *   sol-navigate({ url })          — after delete/rename, signals container reload
 */

import { CSS as POD_MODAL_CSS, sheet as POD_MODAL_SHEET } from './styles/sol-pod-modal-css.js';
import { BTN_CSS } from './styles/buttons-css.js';
import { adopt, sheetFrom } from '../core/adopt.js';
import { define } from '../core/define.js';
import { siblingUrl } from '../core/here.js';
import {
  extOf, contentTypeFor,
  fetchContainer, copyFolder, deleteFolder,
  liveFormatFor, isLiveFormat,
  isEditable, isViewable, isRdf, isImage, isVideo, isAudio, isPDF,
  CT_TO_EXT,
} from '../core/pod-ops.js';

const HOST_CSS = BTN_CSS + `
  :host { display: block; }
  .pod-ops-wrap {
    display: flex; flex-direction: column; height: 100%; overflow: hidden;
  }
  .pod-ops-body {
    flex: 1; min-height: 0; overflow: auto; padding: 12px;
    display: flex; flex-direction: column;
  }
  .pod-ops-footer { padding: 6px 12px; font-size: 0.85em; color: var(--text-muted, #666); }
`;

const hostSheet = sheetFrom(HOST_CSS);
let _liveEditLoaded = false;

/**
 * Standalone pod file/folder operations panel.
 *
 * Renders the same tabbed interface as the sol-pod gear-icon modal,
 * but inline. Tabs: Live Edit, View, Edit, Graph, Download, Rename,
 * Delete, Permissions (files); New File, New Folder, Download, Rename,
 * Delete, Permissions (containers).
 *
 * @class SolPodOps
 * @extends HTMLElement
 * @attr {string} source - URL of the file or container to manage
 * @attr {string} login - CSS selector for a sol-login element
 * @property {Object} item - { url, name, isContainer, contentType } override
 * @property {Function} fetchFn - custom fetch function
 * @fires sol-status - detail: { message, type }
 * @fires sol-navigate - detail: { url }
 */
class SolPodOps extends HTMLElement {
  static get observedAttributes() { return ['source', 'login']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._login = null;
    this._item = null;
    this._blobUrl = null;
    this._initialized = false;
  }

  get item() { return this._item; }
  set item(v) { this._item = v; if (this.isConnected) this._load(); }

  get fetchFn() { return this._fetchFn || null; }
  set fetchFn(fn) { this._fetchFn = fn; }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._load();
    }
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    if (name === 'login') {
      const el = typeof newV === 'string' ? document.querySelector(newV) : newV;
      this._login = el;
    }
    if (name === 'source' && this._initialized) this._load();
  }

  _fetchFor(url) {
    if (this._fetchFn) return this._fetchFn;
    if (this._login?.fetchFor) return this._login.fetchFor(url);
    return fetch;
  }

  _render() {
    const s = this.shadowRoot;
    s.innerHTML = `
      <div class="pod-ops-wrap">
        <div class="pod-ops-body"><div class="modal-message">Loading...</div></div>
        <div class="pod-ops-footer"></div>
      </div>`;
    adopt(s, { sheet: hostSheet, css: HOST_CSS });
    if (POD_MODAL_SHEET) {
      s.adoptedStyleSheets = [...s.adoptedStyleSheets, POD_MODAL_SHEET];
    } else {
      const style = document.createElement('style');
      style.textContent = POD_MODAL_CSS;
      s.appendChild(style);
    }
  }

  async _load() {
    const source = this.getAttribute('source');
    if (!source) return;

    let item = this._item;
    if (!item) {
      const isContainer = source.endsWith('/');
      const name = isContainer
        ? source.slice(0, -1).split('/').pop()
        : source.split('/').pop();
      item = { url: source, name, isContainer, contentType: '' };
    }

    // Probe content-type for files
    const displayBase = item.displayName || item.name;
    let effectiveName = displayBase;
    if (!item.isContainer) {
      try {
        const fetchFn = this._fetchFor(item.url);
        const head = await fetchFn(item.url, { method: 'HEAD' });
        const ct = (head.headers.get('Content-Type') || '').split(';')[0].trim();
        if (ct) {
          item.contentType = ct;
          if (!extOf(item.name)) {
            const mapped = CT_TO_EXT[ct];
            if (mapped) effectiveName = displayBase + '.' + mapped;
          }
        }
      } catch {}
    }

    this._buildTabs(item, effectiveName);
  }

  async _buildTabs(item, effectiveName) {
    const hasLive = !item.isContainer && isLiveFormat(item.url, item.contentType);
    const fileTabs = hasLive
      ? ['Live Edit', 'Download', 'Rename', 'Delete', 'Permissions']
      : ['View', 'Edit', 'Graph', 'Download', 'Rename', 'Delete', 'Permissions'];
    const tabDefs = item.isContainer
      ? ['New File', 'New Folder', 'Download', 'Rename', 'Delete', 'Permissions']
      : fileTabs;

    const tabs = tabDefs.filter(name => {
      if (name === 'Edit' && !isEditable(effectiveName)) return false;
      if (name === 'View' && !isViewable(effectiveName)) return false;
      if (name === 'Graph' && !isRdf(effectiveName)) return false;
      return true;
    }).map(name => ({
      name,
      render: (body, footer, actions) => this._renderTab(name.toLowerCase(), item, effectiveName, body, footer, actions)
    }));

    const defaultTab = item.isContainer ? 'New File'
      : hasLive ? 'Live Edit'
      : isRdf(effectiveName) ? 'Graph'
      : isViewable(effectiveName) ? 'View' : 'Rename';

    await import('./sol-tabs.js');
    const body = this.shadowRoot.querySelector('.pod-ops-body');
    const footer = this.shadowRoot.querySelector('.pod-ops-footer');
    body.innerHTML = '';
    body.style.padding = '0';

    // sol-tabs provides its own actions slot between the bar and content;
    // we don't pass actionsEl so toolbar buttons appear flush right at
    // the top of the tab content area.
    const tabsEl = document.createElement('sol-tabs');
    tabsEl.footerEl = footer;
    tabsEl.tabs = tabs;
    body.appendChild(tabsEl);
    tabsEl.switchTab(defaultTab);
  }

  _renderTab(tabName, item, effectiveName, body, footer, actions) {
    switch (tabName) {
      case 'live edit':   return this._tabLive(item, effectiveName, body, footer, actions);
      case 'view':        return this._tabView(item, effectiveName, body, footer, actions);
      case 'edit':        return this._tabEdit(item, effectiveName, body, footer, actions);
      case 'graph':       return this._tabGraph(item, effectiveName, body, footer, actions);
      case 'download':    return item.isContainer ? this._tabDownloadFolder(item, body, footer, actions) : this._tabDownloadFile(item, body, footer, actions);
      case 'rename':      return this._tabRename(item, body, footer, actions);
      case 'delete':      return this._tabDelete(item, body, footer, actions);
      case 'permissions': return this._tabPermissions(item, body, footer, actions);
      case 'new file':    return this._tabNewFile(item, body, footer, actions);
      case 'new folder':  return this._tabNewFolder(item, body, footer, actions);
    }
  }

  // ── Live edit tab ───────────────────────────────────────────────────

  async _tabLive(item, effectiveName, body, footer, actions) {
    body.innerHTML = '<div class="modal-message">Loading...</div>';
    body.style.padding = '0'; body.style.overflow = 'hidden';

    const fmt = liveFormatFor(item.url, item.contentType);

    // Save / Settings / Help / Zoom / Statistics are <sol-live-edit>'s
    // own toolbar now \u2014 the modal tab adds nothing here.
    actions.innerHTML = '';

    const fetchFn = this._fetchFor(item.url);
    const onSave = async (content, url) => {
      try {
        const resp = await fetchFn(url, {
          method: 'PUT', headers: { 'Content-Type': contentTypeFor(effectiveName) },
          body: content,
        });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        this._emitStatus('Saved.', 'success');
      } catch (e) { this._emitStatus(`Save failed: ${e.message}`, 'error'); }
    };

    await this._ensureLiveEdit();
    body.innerHTML = '';
    body.style.height = '100%';

    const el = document.createElement('sol-live-edit');
    el.setAttribute('source', item.url);
    el.setAttribute('format', fmt);
    el.className = 'pod-live-edit';
    if (fetchFn !== fetch) el.fetchFn = fetchFn;
    el.addEventListener('sol-save', async (ev) => {
      await onSave(ev.detail.content, ev.detail.url);
    });
    body.appendChild(el);

    return () => { body.innerHTML = ''; };
  }

  async _ensureLiveEdit() {
    if (_liveEditLoaded || customElements.get('sol-live-edit')) { _liveEditLoaded = true; return; }
    const url = siblingUrl('sol-live-edit.js', import.meta.url);
    await import(url);
    _liveEditLoaded = true;
  }

  // ── View tab ────────────────────────────────────────────────────────

  async _tabView(item, effectiveName, body, footer, actions) {
    const fetchFn = this._fetchFor(item.url);
    body.innerHTML = '<div class="modal-message">Loading...</div>';

    try {
      if (isImage(effectiveName)) {
        const blob = await (await fetchFn(item.url)).blob();
        const url = URL.createObjectURL(blob);
        this._blobUrl = url;
        const img = document.createElement('img');
        img.className = 'modal-media'; img.src = url; img.alt = item.displayName || item.name;
        body.innerHTML = ''; body.appendChild(img);
      } else if (isVideo(effectiveName)) {
        const blob = await (await fetchFn(item.url)).blob();
        const url = URL.createObjectURL(blob);
        this._blobUrl = url;
        const vid = document.createElement('video');
        vid.className = 'modal-media'; vid.src = url; vid.controls = true;
        body.innerHTML = ''; body.appendChild(vid);
      } else if (isAudio(effectiveName)) {
        const blob = await (await fetchFn(item.url)).blob();
        const url = URL.createObjectURL(blob);
        this._blobUrl = url;
        const aud = document.createElement('audio');
        aud.className = 'modal-audio'; aud.src = url; aud.controls = true;
        body.innerHTML = ''; body.appendChild(aud);
      } else if (isPDF(effectiveName)) {
        const blob = await (await fetchFn(item.url)).blob();
        const url = URL.createObjectURL(blob);
        this._blobUrl = url;
        const iframe = document.createElement('iframe');
        iframe.className = 'modal-pdf'; iframe.src = url;
        body.innerHTML = ''; body.appendChild(iframe);
      } else if (extOf(effectiveName) === 'md') {
        const text = await (await fetchFn(item.url)).text();
        try {
          const { marked } = await import('https://esm.sh/marked@9');
          const div = document.createElement('div');
          div.className = 'markdown-preview';
          div.innerHTML = marked.parse(text);
          body.innerHTML = ''; body.appendChild(div);
        } catch {
          body.innerHTML = ''; const pre = document.createElement('pre');
          pre.className = 'modal-preview'; pre.textContent = text;
          body.appendChild(pre);
        }
      } else if (extOf(effectiveName) === 'html' || extOf(effectiveName) === 'htm') {
        const text = await (await fetchFn(item.url)).text();
        const iframe = document.createElement('iframe');
        iframe.className = 'modal-pdf'; iframe.sandbox = 'allow-scripts';
        iframe.srcdoc = text;
        body.innerHTML = ''; body.appendChild(iframe);
      } else {
        const text = await (await fetchFn(item.url)).text();
        const pre = document.createElement('pre');
        pre.className = 'modal-preview'; pre.textContent = text;
        body.innerHTML = ''; body.appendChild(pre);
      }
    } catch (e) {
      body.innerHTML = `<div class="modal-message error">Failed to load: ${e.message}</div>`;
    }
  }

  // ── Edit tab ────────────────────────────────────────────────────────

  async _tabEdit(item, effectiveName, body, footer, actions) {
    const fetchFn = this._fetchFor(item.url);
    body.innerHTML = '<div class="modal-message">Loading...</div>';

    try {
      const text = await (await fetchFn(item.url)).text();
      const ta = document.createElement('textarea');
      ta.className = 'modal-editor'; ta.value = text;
      body.innerHTML = ''; body.appendChild(ta);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'sol-btn sol-btn-sm sol-btn-primary';
      saveBtn.textContent = 'Save';
      saveBtn.onclick = async () => {
        try {
          const resp = await fetchFn(item.url, {
            method: 'PUT',
            headers: { 'Content-Type': contentTypeFor(effectiveName) },
            body: ta.value,
          });
          if (!resp.ok) throw new Error(`${resp.status}`);
          this._emitStatus('Saved.', 'success');
        } catch (e) { this._emitStatus(`Save failed: ${e.message}`, 'error'); }
      };
      if (actions) actions.appendChild(saveBtn);
    } catch (e) {
      body.innerHTML = `<div class="modal-message error">Failed to load: ${e.message}</div>`;
    }
  }

  // ── Graph tab ───────────────────────────────────────────────────────

  async _tabGraph(item, effectiveName, body, footer, actions) {
    const fetchFn = this._fetchFor(item.url);
    body.innerHTML = '<div class="modal-message">Loading RDF graph...</div>';

    try {
      const text = await (await fetchFn(item.url)).text();
      const { rdf } = await import('../core/rdf.js');
      const store = rdf.graph();
      rdf.parse(text, store, item.url, 'text/turtle');
      const triples = store.statements;

      if (triples.length === 0) {
        body.innerHTML = '<div class="modal-message">No triples found.</div>';
        return;
      }

      const table = document.createElement('table');
      table.className = 'triple-table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Subject</th><th>Predicate</th><th>Object</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const t of triples) {
        const tr = document.createElement('tr');
        const short = (v) => {
          const s = v.value || String(v);
          return s.length > 60 ? s.slice(0, 57) + '...' : s;
        };
        tr.innerHTML = `<td>${short(t.subject)}</td><td>${short(t.predicate)}</td><td>${short(t.object)}</td>`;
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      body.innerHTML = '';
      body.appendChild(table);
      footer.innerHTML = `<span class="modal-note">${triples.length} triple(s)</span>`;
    } catch (e) {
      body.innerHTML = `<div class="modal-message error">Parse error: ${e.message}</div>`;
    }
  }

  // ── Download tabs ───────────────────────────────────────────────────

  _tabDownloadFile(item, body, footer, actions) {
    body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'modal-row';
    const display = item.displayName || item.name;
    const msg = document.createElement('div');
    msg.className = 'modal-message';
    msg.append(document.createTextNode('Download '));
    const strong = document.createElement('strong'); strong.textContent = display;
    msg.append(strong);
    const btn = document.createElement('button');
    btn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    btn.textContent = `\u2B07 ${display}`;
    btn.onclick = async () => {
      const fetchFn = this._fetchFor(item.url);
      const resp = await fetchFn(item.url);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = display; a.click();
      URL.revokeObjectURL(url);
    };
    row.append(msg, btn);
    body.appendChild(row);
  }

  async _tabDownloadFolder(item, body, footer, actions) {
    body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'modal-row';
    const display = item.displayName || item.name;
    const msg = document.createElement('div');
    msg.className = 'modal-message';
    msg.append(document.createTextNode('Download folder '));
    const strong = document.createElement('strong'); strong.textContent = display;
    msg.append(strong, document.createTextNode(' as ZIP'));
    const btn = document.createElement('button');
    btn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    btn.textContent = `\u2B07 ${display}.zip`;
    btn.onclick = async () => {
      try {
        const JSZip = (await import('https://esm.sh/jszip@3.10.0')).default;
        const zip = new JSZip();
        const addFolder = async (containerUrl, zipFolder) => {
          const fetchFn = this._fetchFor(containerUrl);
          const items = await fetchContainer(containerUrl, fetchFn);
          for (const child of items) {
            const childDisplay = child.displayName || child.name;
            if (child.isContainer) {
              await addFolder(child.url, zipFolder.folder(childDisplay));
            } else {
              const resp = await fetchFn(child.url);
              zipFolder.file(childDisplay, await resp.blob());
            }
          }
        };
        btn.disabled = true; btn.textContent = 'Downloading...';
        await addFolder(item.url, zip.folder(display));
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = display + '.zip'; a.click();
        URL.revokeObjectURL(url);
        btn.textContent = 'Done!';
      } catch (e) {
        this._emitStatus(`Download failed: ${e.message}`, 'error');
        btn.disabled = false; btn.textContent = `\u2B07 ${display}.zip`;
      }
    };
    row.append(msg, btn);
    body.appendChild(row);
  }

  // ── Rename tab ──────────────────────────────────────────────────────

  _tabRename(item, body, footer, actions) {
    const currentDisplay = item.displayName || item.name;
    const input = document.createElement('input');
    input.className = 'modal-input'; input.type = 'text';
    input.value = currentDisplay;

    const btn = document.createElement('button');
    btn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    btn.textContent = 'Rename';
    btn.onclick = async () => {
      const newName = input.value.trim();
      if (!newName || newName === currentDisplay) return;
      // User typed the decoded form; URL-encode for the request path so
      // names with spaces / unicode / reserved chars produce valid URLs.
      const encodedNew = encodeURIComponent(newName);
      try {
        const fetchFn = this._fetchFor(item.url);
        if (item.isContainer) {
          const parentUrl = item.url.slice(0, item.url.slice(0, -1).lastIndexOf('/') + 1);
          const fetchFnForUrl = (u) => this._fetchFor(u);
          await copyFolder(item.url, parentUrl, encodedNew, fetchFnForUrl, msg => this._emitStatus(msg, ''));
          await deleteFolder(item.url, fetchFnForUrl);
        } else {
          const containerUrl = item.url.substring(0, item.url.lastIndexOf('/') + 1);
          const newUrl = containerUrl + encodedNew;
          const resp = await fetchFn(item.url);
          if (!resp.ok) throw new Error(`Read failed: ${resp.status}`);
          const blob = await resp.blob();
          await fetchFn(newUrl, { method: 'PUT', headers: { 'Content-Type': contentTypeFor(newName) }, body: blob });
          await fetchFn(item.url, { method: 'DELETE' });
        }
        this._emitStatus('Renamed.', 'success');
        this._emitNavigate(item);
      } catch (e) { this._emitStatus(`Rename failed: ${e.message}`, 'error'); }
    };
    const row = document.createElement('div');
    row.className = 'modal-row';
    row.append(input, btn);
    body.innerHTML = ''; body.appendChild(row);
  }

  // ── Delete tab ──────────────────────────────────────────────────────

  _tabDelete(item, body, footer, actions) {
    body.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'modal-row';
    const display = item.displayName || item.name;
    const msg = document.createElement('div');
    msg.className = 'modal-message';
    msg.append(document.createTextNode('Delete '));
    const strong = document.createElement('strong'); strong.textContent = display;
    msg.append(strong, document.createTextNode((item.isContainer ? ' and all its contents' : '') + '?'));
    const btn = document.createElement('button');
    btn.className = 'sol-btn sol-btn-sm sol-btn-danger';
    btn.textContent = 'Delete';
    btn.onclick = async () => {
      try {
        if (item.isContainer) {
          await deleteFolder(item.url, (u) => this._fetchFor(u));
        } else {
          const fetchFn = this._fetchFor(item.url);
          const resp = await fetchFn(item.url, { method: 'DELETE' });
          if (!resp.ok) throw new Error(`${resp.status}`);
        }
        this._emitStatus('Deleted.', 'success');
        this._emitNavigate(item);
      } catch (e) { this._emitStatus(`Delete failed: ${e.message}`, 'error'); }
    };
    row.append(msg, btn);
    body.appendChild(row);
  }

  // ── New File tab ────────────────────────────────────────────────────

  _tabNewFile(item, body, footer, actions) {
    body.innerHTML = '';

    const uploadLabel = document.createElement('div');
    uploadLabel.className = 'modal-label'; uploadLabel.textContent = 'Upload files:';
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.multiple = true;

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    uploadBtn.textContent = 'Upload';
    uploadBtn.onclick = async () => {
      const files = fileInput.files;
      if (!files.length) return;
      for (const file of files) {
        try {
          const fetchFn = this._fetchFor(item.url);
          await fetchFn(item.url + file.name, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || contentTypeFor(file.name) },
            body: file,
          });
        } catch (e) { this._emitStatus(`Upload failed: ${e.message}`, 'error'); return; }
      }
      this._emitStatus('Uploaded.', 'success');
      this._emitNavigate(item);
    };
    const uploadRow = document.createElement('div');
    uploadRow.className = 'modal-row';
    uploadRow.append(fileInput, uploadBtn);
    body.append(uploadLabel, uploadRow);

    const hr = document.createElement('hr');
    hr.className = 'modal-hr';
    body.appendChild(hr);

    const createLabel = document.createElement('div');
    createLabel.className = 'modal-label'; createLabel.textContent = 'Or create a new file:';
    const nameInput = document.createElement('input');
    nameInput.className = 'modal-input'; nameInput.type = 'text';
    nameInput.placeholder = 'filename.ext';
    const contentTA = document.createElement('textarea');
    contentTA.className = 'modal-editor'; contentTA.placeholder = 'File content (optional)';
    contentTA.style.minHeight = '80px';

    const createBtn = document.createElement('button');
    createBtn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    createBtn.textContent = 'Create File';
    createBtn.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      try {
        const fetchFn = this._fetchFor(item.url);
        await fetchFn(item.url + name, {
          method: 'PUT',
          headers: { 'Content-Type': contentTypeFor(name) },
          body: contentTA.value,
        });
        this._emitStatus('Created.', 'success');
        this._emitNavigate(item);
      } catch (e) { this._emitStatus(`Create failed: ${e.message}`, 'error'); }
    };
    const createRow = document.createElement('div');
    createRow.className = 'modal-row';
    createRow.append(nameInput, createBtn);
    body.append(createLabel, createRow, contentTA);
  }

  // ── New Folder tab ──────────────────────────────────────────────────

  _tabNewFolder(item, body, footer, actions) {
    const input = document.createElement('input');
    input.className = 'modal-input'; input.type = 'text';
    input.placeholder = 'Folder name';

    const btn = document.createElement('button');
    btn.className = 'sol-btn sol-btn-sm sol-btn-primary';
    btn.textContent = 'Create Folder';
    btn.onclick = async () => {
      const name = input.value.trim();
      if (!name) return;
      try {
        const fetchFn = this._fetchFor(item.url);
        const url = item.url + name + '/';
        const resp = await fetchFn(url, {
          method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: ''
        });
        if (!resp.ok && resp.status !== 409) throw new Error(`${resp.status}`);
        this._emitStatus('Created.', 'success');
        this._emitNavigate(item);
      } catch (e) { this._emitStatus(`Create failed: ${e.message}`, 'error'); }
    };
    const row = document.createElement('div');
    row.className = 'modal-row';
    row.append(input, btn);
    body.innerHTML = ''; body.appendChild(row);
  }

  // ── Permissions tab ─────────────────────────────────────────────────

  async _tabPermissions(item, body, footer, actions) {
    body.innerHTML = '';
    await import('./sol-wac.js');
    const wac = document.createElement('sol-wac');
    wac.fetchFn = this._fetchFor(item.url);
    wac.setAttribute('source', item.url);
    wac.addEventListener('sol-status', (e) => this._emitStatus(e.detail.message, e.detail.type));
    body.appendChild(wac);
  }

  // ── Events ──────────────────────────────────────────────────────────

  _emitStatus(message, type) {
    this.dispatchEvent(new CustomEvent('sol-status', {
      bubbles: true, composed: true, detail: { message, type }
    }));
  }

  _emitNavigate(item) {
    const containerUrl = item.isContainer
      ? item.url.slice(0, item.url.slice(0, -1).lastIndexOf('/') + 1)
      : item.url.substring(0, item.url.lastIndexOf('/') + 1);
    this.dispatchEvent(new CustomEvent('sol-navigate', {
      bubbles: true, composed: true, detail: { url: containerUrl }
    }));
  }
}

define('sol-pod-ops', SolPodOps);
export { SolPodOps };
export default SolPodOps;
