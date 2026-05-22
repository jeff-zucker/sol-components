/**
 * @jest-environment jsdom
 *
 * Tests for <sol-pod> — the pod file-browser component:
 *   - shadow-DOM scaffold and observedAttributes
 *   - property accessors (source / side / login / prefs / podClickAction / storages)
 *   - _filterItems (prefs) and _applyFilter (search text)
 *   - _parentOf URL math
 *   - loadContainer → sol-navigate, and the auth-error → sol-auth-needed path
 */

import { jest } from '@jest/globals';

// core/pod-ops.js does real network discovery + container fetches; mock it.
// All three are reassignable so a test can stage its own response.
let mockFetchContainer = async () => [];
let mockWebIds        = async () => [];
let mockStorages      = async () => [];
jest.unstable_mockModule('../../core/pod-ops.js', () => ({
  fileIcon: () => 'I',
  fetchContainer:        (...a) => mockFetchContainer(...a),
  discoverOwnerWebIds:   (...a) => mockWebIds(...a),
  getStoragesFromWebIds: (...a) => mockStorages(...a),
}));

const { SolPod } = await import('../../web/sol-pod.js');
// sol-pod statically imports sol-modal; same class instance _promptAddPod uses.
const { SolModal } = await import('../../web/sol-modal.js');
// pod-registry is the real module (not mocked) — reset its shared state
// between tests so the module-level registries don't leak across them.
const { _resetRegistries } = await import('../../core/pod-registry.js');

window.__SolSuppressDefineWarn = true;

// jsdom has no global fetch; _fetchFor() falls back to it, so provide a stub.
beforeAll(() => {
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
  }
});

const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  mockFetchContainer = async () => [];
  mockWebIds        = async () => [];
  mockStorages      = async () => [];
});
afterEach(() => { document.body.innerHTML = ''; _resetRegistries(); });

// ── scaffold ────────────────────────────────────────────────────────────────

describe('SolPod — scaffold', () => {
  test('observes source, login, pod-click-action, handler, side', () => {
    expect(SolPod.observedAttributes).toEqual(
      ['source', 'login', 'pod-click-action', 'handler', 'side']);
  });

  test('embeds a sol-login button in the header row', () => {
    const el = document.createElement('sol-pod');
    document.body.appendChild(el);
    const row = el.shadowRoot.querySelector('.pod-header-row');
    const login = row.querySelector('sol-login');
    expect(login).toBeTruthy();
    // ...sitting between the pod select and the settings gear.
    const kids = [...row.children].map(c => c.className || c.tagName.toLowerCase());
    expect(kids).toEqual(['pod-select', 'pod-login', 'pod-settings-btn']);
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

  test('podClickAction accepts a function or string and rejects others', () => {
    const el = document.createElement('sol-pod');
    const fn = () => {};
    el.podClickAction = fn;
    expect(el.podClickAction).toBe(fn);
    el.podClickAction = 'doThing';
    expect(el.podClickAction).toBe('doThing');
    el.podClickAction = 123;
    expect(el.podClickAction).toBe(null);
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

  test('feeds the pod storages to the embedded login as issuers', () => {
    const el = mkPod();
    el.setStorages(['https://a.pod/', 'https://b.pod/']);
    const login = el.shadowRoot.querySelector('sol-login');
    // addIssuer normalises each storage URL to its OIDC issuer origin.
    expect(login.issuers).toEqual(['https://a.pod', 'https://b.pod']);
  });

  test('shows "No pods found" when the storage list is empty', () => {
    const el = mkPod();
    el._populateSelect([]);
    const opts = [...el.shadowRoot.querySelectorAll('.pod-select option')];
    expect(opts[0].textContent).toBe('No pods found');
  });
});

// ── pod registry: discovery + the shared group list ─────────────────────────

describe('SolPod — pod registry', () => {
  test('discover() adds session storages to the group registry', async () => {
    mockWebIds   = async () => ['https://me.example/card#me'];
    mockStorages = async () => ['https://disc.pod/'];
    const el = mkPod();

    const found = await el.discover();
    expect(el.storages).toContain('https://disc.pod/');
    expect(found).toContain('https://disc.pod/');
  });

  test('discovery falls back to the current origin on failure', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockWebIds = async () => { throw new Error('network down'); };
    const el = mkPod();

    await el.discover();
    expect(el.storages.length).toBeGreaterThan(0);
    console.warn.mockRestore();
  });

  test('two pods in the default group share one pod list', () => {
    const a = mkPod();
    const b = mkPod();
    a.setStorages(['https://shared.pod/']);
    expect(b.storages).toContain('https://shared.pod/');
  });

  test("a sibling pod's selector reflects a pod added elsewhere", () => {
    const a = mkPod();
    const b = mkPod();
    a.setStorages(['https://shared.pod/']);
    const bOpts = [...b.shadowRoot.querySelectorAll('.pod-select option')].map(o => o.value);
    expect(bOpts).toContain('https://shared.pod/');
  });

  test('pods-group isolates a pod from the default group', () => {
    const a = mkPod();
    const b = document.createElement('sol-pod');
    b.setAttribute('pods-group', 'other');
    document.body.appendChild(b);

    a.setStorages(['https://a-only.pod/']);
    expect(b.storages).not.toContain('https://a-only.pod/');
  });

  test('pods-group="none" gives each pod a standalone registry', () => {
    const mk = () => {
      const el = document.createElement('sol-pod');
      el.setAttribute('pods-group', 'none');
      document.body.appendChild(el);
      return el;
    };
    const a = mk();
    const b = mk();
    a.setStorages(['https://x.pod/']);
    expect(b.storages).not.toContain('https://x.pod/');
  });

  test('seedPods loads pods without emitting sol-pod-pods-changed', () => {
    const el = mkPod();
    let fired = false;
    el.addEventListener('sol-pod-pods-changed', () => { fired = true; });

    el.seedPods(['https://seed.pod/']);
    expect(el.storages).toContain('https://seed.pod/');
    expect(fired).toBe(false);
  });

  test('a non-silent change emits sol-pod-pods-changed with the new list', () => {
    const el = mkPod();
    let detail = null;
    el.addEventListener('sol-pod-pods-changed', (e) => { detail = e.detail; });

    el.setStorages(['https://new.pod/']);
    expect(detail).toMatchObject({
      group: '__default__',
      pods: expect.arrayContaining(['https://new.pod/']),
    });
  });

  test('discover() emits sol-pod-pods-changed', async () => {
    mockStorages = async () => ['https://disc.pod/'];
    const el = mkPod();
    let detail = null;
    el.addEventListener('sol-pod-pods-changed', (e) => { detail = e.detail; });

    await el.discover();
    expect(detail.pods).toContain('https://disc.pod/');
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

  test('the gear button invokes a function podClickAction with the item', async () => {
    const el = mkPod();
    const action = jest.fn();
    el.podClickAction = action;
    const it = item('a.txt');
    el._renderTree([it]);
    fileTreeItems(el)[0].querySelector('.item-gear').click();
    await flush();
    expect(action).toHaveBeenCalledTimes(1);
    const [passedItem, passedEl] = action.mock.calls[0];
    expect(passedItem.url).toBe(it.url);
    expect(passedEl).toBe(el);
  });

  test('a function podClickAction receives the server Content-Type via a HEAD', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true, status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
    });
    try {
      const el = mkPod();
      let received = null;
      el.podClickAction = (it) => { received = it; };
      el._renderTree([item('photo')]);          // extensionless — no usable inferred type
      fileTreeItems(el)[0].querySelector('.item-gear').click();
      await flush();
      expect(received.contentType).toBe('image/png');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('the gear with no podClickAction and no sol-pod-ops shows a help modal', () => {
    const el = mkPod();
    el._renderTree([item('a.txt')]);
    fileTreeItems(el)[0].querySelector('.item-gear').click();
    const modal = document.querySelector('sol-modal');
    expect(modal).toBeTruthy();
    expect(modal.shadowRoot.textContent).toMatch(/podClickAction/);
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

  test('a comma-separated source populates the dropdown with every pod', async () => {
    mockFetchContainer = async () => [];
    const el = document.createElement('sol-pod');
    el.setAttribute('source', 'https://a.pod/, https://b.pod/');
    document.body.appendChild(el);
    await el.initialize();
    expect(el.storages).toEqual(expect.arrayContaining(['https://a.pod/', 'https://b.pod/']));
    expect(el.rootUrl).toBe('https://a.pod/');
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
    const realPrompt = SolModal.prompt;
    SolModal.prompt = async () => 'https://newpod.example';
    try {
      let added = null;
      el.addEventListener('sol-pod-add', (e) => { added = e.detail.url; });
      await el._promptAddPod();
      expect(added).toBe('https://newpod.example/');     // normalised with trailing slash
      expect(el.storages).toContain('https://newpod.example/');
    } finally {
      SolModal.prompt = realPrompt;
    }
  });

  test('a cancelled prompt adds nothing', async () => {
    const el = mkPod();
    const realPrompt = SolModal.prompt;
    SolModal.prompt = async () => null;
    try {
      let fired = false;
      el.addEventListener('sol-pod-add', () => { fired = true; });
      await el._promptAddPod();
      expect(fired).toBe(false);
    } finally {
      SolModal.prompt = realPrompt;
    }
  });
});

// ── keyboard navigation (_onWrapperKey) ─────────────────────────────────────

describe('SolPod — keyboard navigation', () => {
  function tree(items) {
    const el = mkPod();
    el._renderTree(items);
    const tw = el.shadowRoot.querySelector('.tree-wrapper');
    const press = (key) => tw.dispatchEvent(new KeyboardEvent('keydown', { key }));
    return { el, tw, press };
  }

  test('ArrowDown / ArrowUp move the focus index through the list', () => {
    const { el, press } = tree([item('a.txt'), item('b.txt'), item('c.txt')]);
    press('ArrowDown');
    expect(el._focusIndex).toBe(0);
    press('ArrowDown');
    expect(el._focusIndex).toBe(1);
    press('ArrowUp');
    expect(el._focusIndex).toBe(0);
  });

  test('Home and End jump to the first and last items', () => {
    const { el, press } = tree([item('a.txt'), item('b.txt'), item('c.txt')]);
    press('End');
    expect(el._focusIndex).toBe(2);
    press('Home');
    expect(el._focusIndex).toBe(0);
  });

  test('Enter on a folder loads that container', () => {
    const { el, press } = tree([item('docs', true)]);
    el.loadContainer = jest.fn();
    press('ArrowDown');
    press('Enter');
    expect(el.loadContainer).toHaveBeenCalledWith('https://pod.example/docs/');
  });

  test('Enter on a file activates it through podClickAction', async () => {
    const { el, press } = tree([item('a.txt')]);
    const action = jest.fn();
    el.podClickAction = action;
    press('ArrowDown');
    press('Enter');
    await flush();
    expect(action).toHaveBeenCalled();
  });

  test('Backspace navigates to the parent container', () => {
    const { el, press } = tree([item('a.txt')]);
    el._rootUrl = 'https://pod.example/';
    el._currentPath = 'https://pod.example/docs/';
    el.loadContainer = jest.fn();
    press('Backspace');
    expect(el.loadContainer).toHaveBeenCalledWith('https://pod.example/');
  });

  test('"/" moves focus to the filter input', () => {
    const { el, press } = tree([item('a.txt')]);
    press('/');
    expect(el.shadowRoot.activeElement).toBe(el.shadowRoot.querySelector('.pod-filter'));
  });

  test('Escape clears an active filter', () => {
    const { el, press } = tree([item('a.txt')]);
    el._filterText = 'abc';
    press('Escape');
    expect(el._filterText).toBe('');
  });
});

// ── filter input and pod selector ───────────────────────────────────────────

describe('SolPod — filter input', () => {
  test('typing in the filter narrows the rendered tree', () => {
    const el = mkPod();
    el._renderTree([item('notes.txt'), item('photo.png')]);
    const filter = el.shadowRoot.querySelector('.pod-filter');
    filter.value = 'note';
    filter.dispatchEvent(new Event('input'));
    expect(fileTreeItems(el).map(li => li.dataset.url))
      .toEqual(['https://pod.example/notes.txt']);
  });
});

describe('SolPod — settings UI', () => {
  test('the settings button toggles the prefs panel', () => {
    const el = mkPod();
    const btn = el.shadowRoot.querySelector('.pod-settings-btn');
    const panel = el.shadowRoot.querySelector('.pod-settings');
    expect(panel.classList.contains('open')).toBe(false);
    btn.click();
    expect(panel.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(panel.classList.contains('open')).toBe(false);
  });

  test('clicking outside the panel closes it', () => {
    const el = mkPod();
    const btn = el.shadowRoot.querySelector('.pod-settings-btn');
    const panel = el.shadowRoot.querySelector('.pod-settings');
    btn.click();
    expect(panel.classList.contains('open')).toBe(true);
    document.body.click();                       // a click outside the pod
    expect(panel.classList.contains('open')).toBe(false);
  });

  test('opening the panel reflects the current prefs in the checkboxes', () => {
    const el = mkPod();
    el.prefs = { hideHash: false };
    el.shadowRoot.querySelector('.pod-settings-btn').click();
    const state = {};
    el.shadowRoot.querySelectorAll('.pod-settings input[data-pref]')
      .forEach(cb => { state[cb.dataset.pref] = cb.checked; });
    expect(state).toEqual({ hideDot: true, hideHash: false, hideTilde: true });
  });

  test('toggling a checkbox re-filters the listing without a refetch', async () => {
    mockFetchContainer = async () => [
      { name: 'a.txt', url: 'https://pod.example/a.txt', isContainer: false },
      { name: '.acl', url: 'https://pod.example/.acl', isContainer: false },
    ];
    const el = mkPod();
    await el.loadContainer('https://pod.example/');
    expect(el.items.map(i => i.name)).toEqual(['a.txt']);          // .acl hidden

    el.shadowRoot.querySelector('.pod-settings-btn').click();
    const dotCb = el.shadowRoot.querySelector('.pod-settings input[data-pref="hideDot"]');
    dotCb.checked = false;
    dotCb.dispatchEvent(new Event('change', { bubbles: true }));

    expect(el.prefs.hideDot).toBe(false);
    expect(el.items.map(i => i.name).sort()).toEqual(['.acl', 'a.txt']);
  });
});

describe('SolPod — pod selector', () => {
  test('choosing a storage loads that container', () => {
    const el = mkPod();
    el.setStorages(['https://a.pod/', 'https://b.pod/']);
    el.loadContainer = jest.fn();
    const sel = el.shadowRoot.querySelector('.pod-select');
    sel.value = 'https://b.pod/';
    sel.dispatchEvent(new Event('change'));
    expect(el.loadContainer).toHaveBeenCalledWith('https://b.pod/');
  });
});
