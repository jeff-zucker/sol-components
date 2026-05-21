/**
 * @jest-environment jsdom
 *
 * Tests for <sol-pod-ops> — the per-item file-operations panel:
 *   - shadow-DOM scaffold and observedAttributes
 *   - item / fetchFn properties, _fetchFor() resolution
 *   - sol-status / sol-navigate events
 *   - tab construction for containers vs files (via core/pod-ops classifiers)
 */

import { jest } from '@jest/globals';
import { SolPodOps } from '../../web/sol-pod-ops.js';

window.__SolSuppressDefineWarn = true;

function flush(n = 2) {
  return new Promise(r => setTimeout(r, 0)).then(
    () => n > 1 ? flush(n - 1) : undefined);
}

function headResponse(contentType) {
  return {
    ok: true, status: 200,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => '',
    blob: async () => new Blob([]),
  };
}

let origFetch;
beforeEach(() => { origFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = origFetch; document.body.innerHTML = ''; });

function tabNames(podOps) {
  const tabsEl = podOps.shadowRoot.querySelector('sol-tabs');
  if (!tabsEl) return [];
  return [...tabsEl.querySelectorAll(':scope > .sol-tabs-bar button')]
    .map(b => b.textContent);
}

// ── scaffold ────────────────────────────────────────────────────────────────

describe('SolPodOps — scaffold', () => {
  test('observes source and login', () => {
    expect(SolPodOps.observedAttributes).toEqual(['source', 'login']);
  });

  test('connectedCallback renders the wrap/body/footer shell', () => {
    const el = document.createElement('sol-pod-ops');
    document.body.appendChild(el);
    const s = el.shadowRoot;
    expect(s.querySelector('.pod-ops-wrap')).toBeTruthy();
    expect(s.querySelector('.pod-ops-body')).toBeTruthy();
    expect(s.querySelector('.pod-ops-footer')).toBeTruthy();
  });

  test('with no source the body stays on the loading message', async () => {
    const el = document.createElement('sol-pod-ops');
    document.body.appendChild(el);
    await flush();
    expect(el.shadowRoot.querySelector('.modal-message').textContent).toBe('Loading...');
  });
});

// ── property accessors ──────────────────────────────────────────────────────

describe('SolPodOps — properties', () => {
  test('item getter/setter round-trips', () => {
    const el = document.createElement('sol-pod-ops');
    const item = { url: 'https://pod.example/a.txt', name: 'a.txt', isContainer: false };
    el.item = item;
    expect(el.item).toBe(item);
  });

  test('fetchFn getter/setter round-trips, defaulting to null', () => {
    const el = document.createElement('sol-pod-ops');
    expect(el.fetchFn).toBe(null);
    const fn = async () => ({});
    el.fetchFn = fn;
    expect(el.fetchFn).toBe(fn);
  });

  test('_fetchFor prefers an explicit fetchFn', () => {
    const el = document.createElement('sol-pod-ops');
    const fn = async () => ({});
    el.fetchFn = fn;
    expect(el._fetchFor('https://x/')).toBe(fn);
  });

  test('_fetchFor falls back to a linked login element', () => {
    const el = document.createElement('sol-pod-ops');
    const loginFetch = async () => ({});
    el._login = { fetchFor: () => loginFetch };
    expect(el._fetchFor('https://x/')).toBe(loginFetch);
  });

  test('_fetchFor falls back to global fetch when nothing else is set', () => {
    const el = document.createElement('sol-pod-ops');
    expect(el._fetchFor('https://x/')).toBe(fetch);
  });

  test('login attribute resolves to the matching element', () => {
    const login = document.createElement('div');
    login.id = 'the-login';
    document.body.appendChild(login);
    const el = document.createElement('sol-pod-ops');
    el.setAttribute('login', '#the-login');
    document.body.appendChild(el);
    expect(el._login).toBe(login);
  });
});

// ── events ──────────────────────────────────────────────────────────────────

describe('SolPodOps — events', () => {
  test('_emitStatus dispatches a bubbling, composed sol-status', () => {
    const el = document.createElement('sol-pod-ops');
    document.body.appendChild(el);
    let detail = null, composed = false;
    el.addEventListener('sol-status', (e) => { detail = e.detail; composed = e.composed; });
    el._emitStatus('saved', 'success');
    expect(detail).toEqual({ message: 'saved', type: 'success' });
    expect(composed).toBe(true);
  });

  test('_emitNavigate derives the parent container of a file', () => {
    const el = document.createElement('sol-pod-ops');
    document.body.appendChild(el);
    let url = null;
    el.addEventListener('sol-navigate', (e) => { url = e.detail.url; });
    el._emitNavigate({ url: 'https://pod.example/docs/file.ttl', isContainer: false });
    expect(url).toBe('https://pod.example/docs/');
  });

  test('_emitNavigate derives the parent of a container', () => {
    const el = document.createElement('sol-pod-ops');
    document.body.appendChild(el);
    let url = null;
    el.addEventListener('sol-navigate', (e) => { url = e.detail.url; });
    el._emitNavigate({ url: 'https://pod.example/docs/sub/', isContainer: true });
    expect(url).toBe('https://pod.example/docs/');
  });
});

// ── tab construction ────────────────────────────────────────────────────────

describe('SolPodOps — tab construction', () => {
  test('a container offers folder-management tabs', async () => {
    globalThis.fetch = jest.fn(async () => headResponse('text/turtle'));
    const el = document.createElement('sol-pod-ops');
    el.setAttribute('source', 'https://pod.example/docs/');
    document.body.appendChild(el);
    await flush(4);

    expect(tabNames(el)).toEqual(
      ['New File', 'New Folder', 'Download', 'Rename', 'Delete', 'Permissions']);
  });

  test('a non-viewable file omits View/Edit/Graph tabs', async () => {
    globalThis.fetch = jest.fn(async () => headResponse('application/zip'));
    const el = document.createElement('sol-pod-ops');
    el.setAttribute('source', 'https://pod.example/archive.zip');
    document.body.appendChild(el);
    await flush(4);

    const names = tabNames(el);
    expect(names).toEqual(['Download', 'Rename', 'Delete', 'Permissions']);
    expect(names).not.toContain('Graph');
  });

  test('a non-live RDF file offers the Graph tab but not View/Edit', async () => {
    globalThis.fetch = jest.fn(async () => headResponse('application/n-triples'));
    const el = document.createElement('sol-pod-ops');
    el.setAttribute('source', 'https://pod.example/data.nt');
    document.body.appendChild(el);
    await flush(4);

    const names = tabNames(el);
    expect(names).toContain('Graph');
    expect(names).not.toContain('View');
    expect(names).not.toContain('Edit');
  });
});

// ── individual tab render methods ───────────────────────────────────────────
//
// These call the _tab* methods directly with plain body/footer/actions
// elements, so each tab's form and button wiring is tested in isolation
// (no sol-tabs, no default-tab side effects, no CodeMirror).

// Recording fake fetch: GET serves `getText`, writes (PUT/DELETE) succeed
// unless writeOk is false; every call is logged.
function opsFetch({ getText = '', getOk = true, writeOk = true } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method });
    if (method === 'GET') {
      return {
        ok: getOk, status: getOk ? 200 : 404, statusText: getOk ? 'OK' : 'Not Found',
        text: async () => getText,
        blob: async () => ({ type: '', size: getText.length }),
      };
    }
    return { ok: writeOk, status: writeOk ? 200 : 403, statusText: writeOk ? 'OK' : 'Forbidden' };
  };
  fn.calls = calls;
  return fn;
}

function cells() {
  return {
    body: document.createElement('div'),
    footer: document.createElement('div'),
    actions: document.createElement('div'),
  };
}

function mkOps(fetchFn) {
  const el = document.createElement('sol-pod-ops');
  el.fetchFn = fetchFn;
  document.body.appendChild(el);
  return el;
}

const file = (url, name) => ({ url, name, displayName: name, isContainer: false });
const folder = (url, name) => ({ url, name, displayName: name, isContainer: true });
const btnByText = (root, text) =>
  [...root.querySelectorAll('button')].find(b => b.textContent.includes(text));

// ── Rename tab ──────────────────────────────────────────────────────────────

describe('SolPodOps — _tabRename', () => {
  test('renaming a file copies to the new URL and deletes the old', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    const events = [];
    el.addEventListener('sol-status', (e) => events.push(['status', e.detail]));
    el.addEventListener('sol-navigate', () => events.push(['navigate']));

    el._tabRename(file('https://pod.example/docs/old.txt', 'old.txt'), c.body, c.footer, c.actions);
    c.body.querySelector('input').value = 'new.txt';
    btnByText(c.body, 'Rename').click();
    await flush(3);

    const methods = fetchFn.calls.map(x => `${x.method} ${x.url}`);
    expect(methods).toContain('PUT https://pod.example/docs/new.txt');
    expect(methods).toContain('DELETE https://pod.example/docs/old.txt');
    expect(events).toContainEqual(['status', { message: 'Renamed.', type: 'success' }]);
    expect(events).toContainEqual(['navigate']);
  });

  test('renaming to the same name is a no-op', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    el._tabRename(file('https://pod.example/docs/keep.txt', 'keep.txt'), c.body, c.footer, c.actions);
    btnByText(c.body, 'Rename').click();           // input still holds "keep.txt"
    await flush(3);
    expect(fetchFn.calls).toHaveLength(0);
  });

  test('a read failure during rename emits an error status', async () => {
    const fetchFn = opsFetch({ getOk: false });
    const el = mkOps(fetchFn);
    const c = cells();
    let status = null;
    el.addEventListener('sol-status', (e) => { status = e.detail; });
    el._tabRename(file('https://pod.example/docs/old.txt', 'old.txt'), c.body, c.footer, c.actions);
    c.body.querySelector('input').value = 'new.txt';
    btnByText(c.body, 'Rename').click();
    await flush(3);
    expect(status.type).toBe('error');
  });
});

// ── Delete tab ──────────────────────────────────────────────────────────────

describe('SolPodOps — _tabDelete', () => {
  test('deleting a file sends DELETE and emits Deleted + navigate', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    const events = [];
    el.addEventListener('sol-status', (e) => events.push(e.detail));
    el.addEventListener('sol-navigate', () => events.push('nav'));

    el._tabDelete(file('https://pod.example/docs/gone.txt', 'gone.txt'), c.body, c.footer, c.actions);
    btnByText(c.body, 'Delete').click();
    await flush(3);

    expect(fetchFn.calls).toContainEqual({ url: 'https://pod.example/docs/gone.txt', method: 'DELETE' });
    expect(events).toContainEqual({ message: 'Deleted.', type: 'success' });
    expect(events).toContain('nav');
  });

  test('a failed delete emits an error status', async () => {
    const fetchFn = opsFetch({ writeOk: false });
    const el = mkOps(fetchFn);
    const c = cells();
    let status = null;
    el.addEventListener('sol-status', (e) => { status = e.detail; });
    el._tabDelete(file('https://pod.example/docs/gone.txt', 'gone.txt'), c.body, c.footer, c.actions);
    btnByText(c.body, 'Delete').click();
    await flush(3);
    expect(status.type).toBe('error');
  });
});

// ── New File / New Folder tabs ──────────────────────────────────────────────

describe('SolPodOps — _tabNewFile', () => {
  test('creating a file PUTs to container + name and emits Created', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    let status = null;
    el.addEventListener('sol-status', (e) => { status = e.detail; });

    el._tabNewFile(folder('https://pod.example/docs/', 'docs'), c.body, c.footer, c.actions);
    c.body.querySelector('.modal-input').value = 'fresh.ttl';
    btnByText(c.body, 'Create File').click();
    await flush(3);

    expect(fetchFn.calls).toContainEqual({ url: 'https://pod.example/docs/fresh.ttl', method: 'PUT' });
    expect(status).toEqual({ message: 'Created.', type: 'success' });
  });

  test('an empty file name does nothing', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    el._tabNewFile(folder('https://pod.example/docs/', 'docs'), c.body, c.footer, c.actions);
    btnByText(c.body, 'Create File').click();
    await flush(3);
    expect(fetchFn.calls).toHaveLength(0);
  });
});

describe('SolPodOps — _tabNewFolder', () => {
  test('creating a folder PUTs a trailing-slash container URL', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    let status = null;
    el.addEventListener('sol-status', (e) => { status = e.detail; });

    el._tabNewFolder(folder('https://pod.example/docs/', 'docs'), c.body, c.footer, c.actions);
    c.body.querySelector('.modal-input').value = 'sub';
    btnByText(c.body, 'Create Folder').click();
    await flush(3);

    expect(fetchFn.calls).toContainEqual({ url: 'https://pod.example/docs/sub/', method: 'PUT' });
    expect(status).toEqual({ message: 'Created.', type: 'success' });
  });

  test('an empty folder name does nothing', async () => {
    const fetchFn = opsFetch();
    const el = mkOps(fetchFn);
    const c = cells();
    el._tabNewFolder(folder('https://pod.example/docs/', 'docs'), c.body, c.footer, c.actions);
    btnByText(c.body, 'Create Folder').click();
    await flush(3);
    expect(fetchFn.calls).toHaveLength(0);
  });
});

// ── Edit tab ────────────────────────────────────────────────────────────────

describe('SolPodOps — _tabEdit', () => {
  test('loads the file into a textarea and Save PUTs the edited content', async () => {
    const fetchFn = opsFetch({ getText: 'original' });
    const el = mkOps(fetchFn);
    const c = cells();
    let status = null;
    el.addEventListener('sol-status', (e) => { status = e.detail; });

    await el._tabEdit(file('https://pod.example/docs/n.txt', 'n.txt'), 'n.txt', c.body, c.footer, c.actions);
    const ta = c.body.querySelector('textarea.modal-editor');
    expect(ta.value).toBe('original');

    ta.value = 'edited';
    btnByText(c.actions, 'Save').click();
    await flush(3);
    expect(status).toEqual({ message: 'Saved.', type: 'success' });
    expect(fetchFn.calls).toContainEqual({ url: 'https://pod.example/docs/n.txt', method: 'PUT' });
  });
});

// ── Download / Permissions / Graph tabs ─────────────────────────────────────

describe('SolPodOps — _tabDownloadFile', () => {
  test('renders a download button labelled with the file name', () => {
    const el = mkOps(opsFetch());
    const c = cells();
    el._tabDownloadFile(file('https://pod.example/docs/report.pdf', 'report.pdf'), c.body, c.footer, c.actions);
    expect(btnByText(c.body, 'report.pdf')).toBeTruthy();
  });
});

describe('SolPodOps — _tabPermissions', () => {
  test('embeds a <sol-wac> editor pointed at the resource', async () => {
    const el = mkOps(opsFetch());
    const c = cells();
    await el._tabPermissions(file('https://pod.example/docs/n.txt', 'n.txt'), c.body, c.footer, c.actions);
    const wac = c.body.querySelector('sol-wac');
    expect(wac).toBeTruthy();
    expect(wac.getAttribute('source')).toBe('https://pod.example/docs/n.txt');
  });
});

describe('SolPodOps — _tabGraph', () => {
  test('renders a triple table from the resource RDF', async () => {
    const fetchFn = opsFetch({ getText: '<https://ex/s> <https://ex/p> <https://ex/o> .' });
    const el = mkOps(fetchFn);
    const c = cells();
    await el._tabGraph(file('https://pod.example/g.ttl', 'g.ttl'), 'g.ttl', c.body, c.footer, c.actions);
    expect(c.body.querySelector('table.triple-table')).toBeTruthy();
    expect(c.body.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  test('reports when the resource has no triples', async () => {
    const el = mkOps(opsFetch({ getText: '' }));
    const c = cells();
    await el._tabGraph(file('https://pod.example/empty.ttl', 'empty.ttl'), 'empty.ttl', c.body, c.footer, c.actions);
    expect(c.body.textContent).toContain('No triples found');
  });
});
