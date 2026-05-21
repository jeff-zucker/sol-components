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

// ── helpers for the DOM-rendering tests below ───────────────────────────────

function mkPod() {
  const el = document.createElement('sol-pod');
  document.body.appendChild(el);   // connectedCallback → _render()
  return el;
}
function item(name, isContainer = false, displayName) {
  return {
    url: 'https://pod.example/' + name + (isContainer ? '/' : ''),
    name, displayName: displayName || name, isContainer,
  };
}
const fileTreeItems = (el) =>
  [...el.shadowRoot.querySelectorAll('.file-tree > li')];

// ── _renderTree ─────────────────────────────────────────────────────────────

describe('SolPod — _renderTree', () => {
  test('renders one <li> per item, folders flagged by class', () => {
    const el = mkPod();
    el._renderTree([item('docs', true), item('a.txt')]);
    const lis = fileTreeItems(el);
    expect(lis).toHaveLength(2);
    expect(lis[0].className).toBe('folder');
    expect(lis[1].className).toBe('file');
    expect(lis[0].dataset.url).toBe('https://pod.example/docs/');
    expect(lis[1].dataset.index).toBe('1');
  });

  test('an item label carries the icon and display name', () => {
    const el = mkPod();
    el._renderTree([item('photo.png', false, 'photo.png')]);
    const label = fileTreeItems(el)[0].querySelector('.item-label');
    expect(label.textContent).toContain('photo.png');
  });

  test('each item gets a gear button', () => {
    const el = mkPod();
    el._renderTree([item('a.txt')]);
    expect(fileTreeItems(el)[0].querySelector('.item-gear')).toBeTruthy();
  });

  test('an empty container shows the empty-container message', () => {
    const el = mkPod();
    el._renderTree([]);
    expect(el.shadowRoot.querySelector('.tree-wrapper .empty').textContent)
      .toBe('Empty container');
  });

  test('a filter with no matches shows a no-matches message', () => {
    const el = mkPod();
    el._filterText = 'zzz';
    el._renderTree([item('a.txt'), item('b.md')]);
    expect(el.shadowRoot.querySelector('.tree-wrapper .empty').textContent)
      .toBe('No matches for "zzz"');
  });

  test('the filter narrows the rendered items', () => {
    const el = mkPod();
    el._filterText = 'note';
    el._renderTree([item('notes.txt'), item('photo.png')]);
    expect(fileTreeItems(el).map(li => li.dataset.url))
      .toEqual(['https://pod.example/notes.txt']);
  });
});

// ── selection ───────────────────────────────────────────────────────────────

describe('SolPod — selection', () => {
  function rendered() {
    const el = mkPod();
    el._renderTree([item('a.txt'), item('b.txt'), item('c.txt')]);
    return { el, lis: fileTreeItems(el) };
  }
  const click = (li, mods = {}) =>
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, ...mods }));

  test('a plain click selects exactly one item', () => {
    const { lis } = rendered();
    click(lis[0]);
    expect(lis[0].classList.contains('selected')).toBe(true);
    click(lis[1]);
    expect(lis[0].classList.contains('selected')).toBe(false);
    expect(lis[1].classList.contains('selected')).toBe(true);
  });

  test('ctrl-click toggles items into and out of the selection', () => {
    const { lis } = rendered();
    click(lis[0]);
    click(lis[2], { ctrlKey: true });
    expect(lis[0].classList.contains('selected')).toBe(true);
    expect(lis[2].classList.contains('selected')).toBe(true);
    click(lis[0], { ctrlKey: true });
    expect(lis[0].classList.contains('selected')).toBe(false);
  });

  test('shift-click selects a contiguous range', () => {
    const { lis } = rendered();
    click(lis[0]);
    click(lis[2], { shiftKey: true });
    expect(lis.every(li => li.classList.contains('selected'))).toBe(true);
  });
});

// ── _updateBreadcrumb ───────────────────────────────────────────────────────

describe('SolPod — _updateBreadcrumb', () => {
  test('renders a Home button plus one button per path segment', () => {
    const el = mkPod();
    el._rootUrl = 'https://pod.example/';
    el._updateBreadcrumb('https://pod.example/docs/sub/');
    const labels = [...el.shadowRoot.querySelectorAll('.breadcrumb button')]
      .map(b => b.textContent);
    expect(labels).toEqual(['\u{1F3E0}', 'docs', 'sub']);
  });

  test('at the root only the Home button is shown', () => {
    const el = mkPod();
    el._rootUrl = 'https://pod.example/';
    el._updateBreadcrumb('https://pod.example/');
    expect(el.shadowRoot.querySelectorAll('.breadcrumb button')).toHaveLength(1);
  });

  test('the Home button loads the root container', () => {
    const el = mkPod();
    el._rootUrl = 'https://pod.example/';
    el.loadContainer = jest.fn();
    el._updateBreadcrumb('https://pod.example/docs/');
    el.shadowRoot.querySelector('.breadcrumb button').click();
    expect(el.loadContainer).toHaveBeenCalledWith('https://pod.example/');
  });
});

// ── _populateSelect ─────────────────────────────────────────────────────────

describe('SolPod — _populateSelect', () => {
  test('lists each storage plus an "Add a Pod" entry', () => {
    const el = mkPod();
    el._populateSelect(['https://a.pod/', 'https://b.pod/']);
    const opts = [...el.shadowRoot.querySelectorAll('.pod-select option')];
    expect(opts.map(o => o.value)).toEqual(['https://a.pod/', 'https://b.pod/', '__add__']);
  });

  test('shows "No pods found" when the storage list is empty', () => {
    const el = mkPod();
    el._populateSelect([]);
    const opts = [...el.shadowRoot.querySelectorAll('.pod-select option')];
    expect(opts[0].textContent).toBe('No pods found');
  });
});

// ── tree-wrapper status messages ────────────────────────────────────────────

describe('SolPod — _showLoading / _showMessage', () => {
  test('_showLoading puts a loading indicator in the tree wrapper', () => {
    const el = mkPod();
    el._showLoading();
    expect(el.shadowRoot.querySelector('.tree-wrapper .loading').textContent)
      .toBe('Loading...');
  });

  test('_showMessage marks errors with the error class', () => {
    const el = mkPod();
    el._showMessage('went wrong', true);
    const box = el.shadowRoot.querySelector('.tree-wrapper .empty');
    expect(box.classList.contains('error')).toBe(true);
    expect(box.textContent).toBe('went wrong');
  });
});

// ── navigation, gear, drag, events ──────────────────────────────────────────

describe('SolPod — interaction', () => {
  test('clicking a folder loads that container', () => {
    const el = mkPod();
    el.loadContainer = jest.fn();
    el._renderTree([item('docs', true)]);
    fileTreeItems(el)[0].click();
    expect(el.loadContainer).toHaveBeenCalledWith('https://pod.example/docs/');
  });

  test('the gear button invokes a function gearAction with the item', () => {
    const el = mkPod();
    const action = jest.fn();
    el.gearAction = action;
    const it = item('a.txt');
    el._renderTree([it]);
    fileTreeItems(el)[0].querySelector('.item-gear').click();
    expect(action).toHaveBeenCalledWith(it, el);
  });

  test('dragging an item fires sol-drag-start with the dragged items', () => {
    const el = mkPod();
    el._renderTree([item('a.txt')]);
    let detail = null;
    el.addEventListener('sol-drag-start', (e) => { detail = e.detail; });

    const li = fileTreeItems(el)[0];
    const ev = new Event('dragstart', { bubbles: true });
    ev.dataTransfer = { effectAllowed: '', setData() {} };
    li.dispatchEvent(ev);

    expect(detail.items.map(i => i.url)).toEqual(['https://pod.example/a.txt']);
  });

  test('_emitStatus dispatches a bubbling, composed sol-status', () => {
    const el = mkPod();
    let detail = null, composed = false;
    el.addEventListener('sol-status', (e) => { detail = e.detail; composed = e.composed; });
    el._emitStatus('done', 'success');
    expect(detail).toEqual({ message: 'done', type: 'success' });
    expect(composed).toBe(true);
  });
});

// ── initialize / _promptAddPod ──────────────────────────────────────────────

describe('SolPod — initialize', () => {
  test('with a source attribute, loads that container as the root', async () => {
    mockFetchContainer = async () => [item('a.txt')];
    const el = document.createElement('sol-pod');
    el.setAttribute('source', 'https://pod.example/');
    document.body.appendChild(el);
    await el.initialize();
    expect(el.rootUrl).toBe('https://pod.example/');
    expect(el.currentPath).toBe('https://pod.example/');
  });

  test('with no source but preset storages, loads the first storage', async () => {
    mockFetchContainer = async () => [];
    const el = mkPod();
    el.setStorages(['https://first.pod/', 'https://second.pod/']);
    await el.initialize();
    expect(el.rootUrl).toBe('https://first.pod/');
  });
});

describe('SolPod — _promptAddPod', () => {
  test('a new pod URL is added and fires sol-pod-add', async () => {
    mockFetchContainer = async () => [];
    const el = mkPod();
    const realPrompt = window.prompt;
    window.prompt = () => 'https://newpod.example';
    try {
      let added = null;
      el.addEventListener('sol-pod-add', (e) => { added = e.detail.url; });
      await el._promptAddPod();
      expect(added).toBe('https://newpod.example/');     // normalised with trailing slash
      expect(el.storages).toContain('https://newpod.example/');
    } finally {
      window.prompt = realPrompt;
    }
  });

  test('a cancelled prompt adds nothing', async () => {
    const el = mkPod();
    const realPrompt = window.prompt;
    window.prompt = () => null;
    try {
      let fired = false;
      el.addEventListener('sol-pod-add', () => { fired = true; });
      await el._promptAddPod();
      expect(fired).toBe(false);
    } finally {
      window.prompt = realPrompt;
    }
  });
});
