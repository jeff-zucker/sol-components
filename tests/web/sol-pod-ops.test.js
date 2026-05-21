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
