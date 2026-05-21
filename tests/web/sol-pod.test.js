/**
 * @jest-environment jsdom
 *
 * Tests for <sol-pod> — the pod file-browser component:
 *   - shadow-DOM scaffold and observedAttributes
 *   - property accessors (source / side / login / prefs / gearAction / storages)
 *   - _filterItems (prefs) and _applyFilter (search text)
 *   - _parentOf URL math
 *   - loadContainer → sol-navigate, and the auth-error → sol-auth-needed path
 */

import { jest } from '@jest/globals';

// core/pod-ops.js does real network discovery + container fetches; mock it.
let mockFetchContainer = async () => [];
jest.unstable_mockModule('../../core/pod-ops.js', () => ({
  fileIcon: () => 'I',
  fetchContainer: (...a) => mockFetchContainer(...a),
  discoverOwnerWebIds: async () => [],
  getStoragesFromWebIds: async () => [],
}));

const { SolPod } = await import('../../web/sol-pod.js');

window.__SolSuppressDefineWarn = true;

// jsdom has no global fetch; _fetchFor() falls back to it, so provide a stub.
beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
  }
});

afterEach(() => { document.body.innerHTML = ''; });

// ── scaffold ────────────────────────────────────────────────────────────────

describe('SolPod — scaffold', () => {
  test('observes source, login, gear-action, handler, side', () => {
    expect(SolPod.observedAttributes).toEqual(
      ['source', 'login', 'gear-action', 'handler', 'side']);
  });

  test('connectedCallback renders the select / breadcrumb / filter / tree', () => {
    const el = document.createElement('sol-pod');
    document.body.appendChild(el);
    const s = el.shadowRoot;
    expect(s.querySelector('.pod-select')).toBeTruthy();
    expect(s.querySelector('.breadcrumb')).toBeTruthy();
    expect(s.querySelector('.pod-filter')).toBeTruthy();
    expect(s.querySelector('.tree-wrapper')).toBeTruthy();
  });

  test('default prefs hide dot, hash, and tilde entries', () => {
    const el = document.createElement('sol-pod');
    expect(el.prefs).toEqual({ hideDot: true, hideHash: true, hideTilde: true });
  });
});

// ── property accessors ──────────────────────────────────────────────────────

describe('SolPod — properties', () => {
  test('source getter/setter mirrors the attribute', () => {
    const el = document.createElement('sol-pod');
    el.source = 'https://pod.example/';
    expect(el.getAttribute('source')).toBe('https://pod.example/');
    expect(el.source).toBe('https://pod.example/');
  });

  test('side getter/setter normalises empty to null', () => {
    const el = document.createElement('sol-pod');
    el.side = 'left';
    expect(el.side).toBe('left');
    el.side = '';
    expect(el.side).toBe(null);
  });

  test('login setter resolves a string selector to an element', () => {
    const login = document.createElement('div');
    login.id = 'lg';
    document.body.appendChild(login);
    const el = document.createElement('sol-pod');
    el.login = '#lg';
    expect(el.login).toBe(login);
  });

  test('prefs setter merges into the existing prefs', () => {
    const el = document.createElement('sol-pod');
    el.prefs = { hideDot: false };
    expect(el.prefs).toEqual({ hideDot: false, hideHash: true, hideTilde: true });
  });

  test('gearAction accepts a function or string and rejects others', () => {
    const el = document.createElement('sol-pod');
    const fn = () => {};
    el.gearAction = fn;
    expect(el.gearAction).toBe(fn);
    el.gearAction = 'doThing';
    expect(el.gearAction).toBe('doThing');
    el.gearAction = 123;
    expect(el.gearAction).toBe(null);
  });

  test('setStorages populates the pod <select>', () => {
    const el = document.createElement('sol-pod');
    document.body.appendChild(el);
    el.setStorages(['https://a.pod/', 'https://b.pod/']);
    const opts = [...el.shadowRoot.querySelectorAll('.pod-select option')]
      .map(o => o.value);
    expect(opts).toEqual(expect.arrayContaining(['https://a.pod/', 'https://b.pod/']));
    expect(el.storages).toEqual(['https://a.pod/', 'https://b.pod/']);
  });
});

// ── filtering ───────────────────────────────────────────────────────────────

describe('SolPod — _filterItems (prefs)', () => {
  const items = [
    { name: 'notes.txt' },
    { name: '.acl' },
    { name: '#frag' },
    { name: 'backup~' },
    { name: 'photo.png' },
  ];

  test('hides dot/hash/tilde entries with default prefs', () => {
    const el = document.createElement('sol-pod');
    expect(el._filterItems(items).map(i => i.name)).toEqual(['notes.txt', 'photo.png']);
  });

  test('shows dotfiles when hideDot is turned off', () => {
    const el = document.createElement('sol-pod');
    el.prefs = { hideDot: false };
    expect(el._filterItems(items).map(i => i.name)).toContain('.acl');
  });

  test('filters on displayName when present', () => {
    const el = document.createElement('sol-pod');
    const decoded = [{ name: '%23x', displayName: '#x' }];
    expect(el._filterItems(decoded)).toEqual([]);
  });
});

describe('SolPod — _applyFilter (search text)', () => {
  const items = [{ name: 'Alpha.ttl' }, { name: 'beta.md' }, { name: 'Gamma.txt' }];

  test('returns all items when no filter text is set', () => {
    const el = document.createElement('sol-pod');
    expect(el._applyFilter(items)).toBe(items);
  });

  test('matches case-insensitively on the name', () => {
    const el = document.createElement('sol-pod');
    el._filterText = 'ALPHA';                       // upper-case query, mixed-case name
    expect(el._applyFilter(items).map(i => i.name)).toEqual(['Alpha.ttl']);
  });
});

// ── _parentOf ───────────────────────────────────────────────────────────────

describe('SolPod — _parentOf', () => {
  test('returns the parent container of a nested URL', () => {
    const el = document.createElement('sol-pod');
    el._rootUrl = 'https://pod.example/';
    expect(el._parentOf('https://pod.example/docs/sub/')).toBe('https://pod.example/docs/');
  });

  test('returns null at the root', () => {
    const el = document.createElement('sol-pod');
    el._rootUrl = 'https://pod.example/';
    expect(el._parentOf('https://pod.example/')).toBe(null);
  });

  test('never climbs above the root', () => {
    const el = document.createElement('sol-pod');
    el._rootUrl = 'https://pod.example/docs/';
    expect(el._parentOf('https://pod.example/docs/a/')).toBe('https://pod.example/docs/');
  });
});

// ── loadContainer ───────────────────────────────────────────────────────────

describe('SolPod — loadContainer', () => {
  test('loads, filters, and fires sol-navigate', async () => {
    mockFetchContainer = async () => [
      { name: 'a.txt', url: 'https://pod.example/a.txt', isContainer: false },
      { name: '.hidden', url: 'https://pod.example/.hidden', isContainer: false },
    ];
    const el = document.createElement('sol-pod');
    document.body.appendChild(el);

    let nav = null;
    el.addEventListener('sol-navigate', (e) => { nav = e.detail; });
    await el.loadContainer('https://pod.example/');

    expect(nav).toEqual({ url: 'https://pod.example/' });
    expect(el.currentPath).toBe('https://pod.example/');
    expect(el.items.map(i => i.name)).toEqual(['a.txt']);   // .hidden filtered out
  });

  test('an auth failure fires sol-auth-needed instead', async () => {
    mockFetchContainer = async () => { throw new Error('401 Unauthorized'); };
    const el = document.createElement('sol-pod');
    document.body.appendChild(el);

    let authUrl = null;
    el.addEventListener('sol-auth-needed', (e) => { authUrl = e.detail.url; });
    await el.loadContainer('https://pod.example/private/');

    expect(authUrl).toBe('https://pod.example/private/');
  });
});
