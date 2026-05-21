/**
 * @jest-environment jsdom
 *
 * Tests for <sol-live-edit> — the split-pane live editor:
 *   - shadow-DOM scaffold, observedAttributes
 *   - format selection (attribute, source extension, default)
 *   - canZoom / canStats per format
 *   - content get/set, zoom controls + clamping
 *   - sol-format / sol-zoom / sol-save events
 *   - readonly hides the Save button
 *
 * buildEditor() pulls CodeMirror from esm.sh at runtime, which jest can't
 * resolve — it is mocked here with a small stateful fake editor view.
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../web/utils/code-mirror-editor.js', () => ({
  buildEditor: async () => {
    let doc = '';
    return {
      state: { doc: { toString: () => doc, get length() { return doc.length; } } },
      dispatch: (tr) => { if (tr.changes) doc = tr.changes.insert; },
      destroy: () => {},
    };
  },
}));

const { SolLiveEdit } = await import('../../web/sol-live-edit.js');

window.__SolSuppressDefineWarn = true;

// Pre-register fake renderers/examples so _render()/_init() don't dynamically
// import the real (dependency-heavy) renderer and example modules.
const fakeRenderer = (content, out) => { out.textContent = 'preview'; };
beforeAll(() => {
  SolLiveEdit.registerModules({
    renderers: {
      turtle: fakeRenderer, jsonld: fakeRenderer, csv: fakeRenderer,
      markdown: fakeRenderer, mermaid: fakeRenderer, html: fakeRenderer,
      graphviz: fakeRenderer,
    },
    // The example loader awaits the registered value and calls .catch on
    // it, so register thenables rather than bare strings.
    examples: {
      markdown: Promise.resolve('# example'),
      turtle: Promise.resolve('@prefix x: <x>.'),
      csv: Promise.resolve('a,b\n1,2'),
    },
    help: {
      markdown: { title: 'Markdown Help', sections: [] },
    },
  });
  if (typeof globalThis.fetch === 'undefined') {
    globalThis.fetch = async () => ({
      ok: true, status: 200, text: async () => 'fetched',
      headers: { get: () => '' },
    });
  }
});

afterEach(() => { document.body.innerHTML = ''; });

// Create an editor and run its init synchronously-awaitably (skipping the
// floating async connectedCallback so tests are deterministic).
async function mkEditor(attrs = {}) {
  const el = document.createElement('sol-live-edit');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  await el._init();
  return el;
}

// ── scaffold ────────────────────────────────────────────────────────────────

describe('SolLiveEdit — scaffold', () => {
  test('observes source, format, readonly', () => {
    expect(SolLiveEdit.observedAttributes).toEqual(['source', 'format', 'readonly']);
  });

  test('init builds the toolbar and editor/preview panes', async () => {
    const el = await mkEditor();
    const s = el.shadowRoot;
    expect(s.getElementById('toolbar')).toBeTruthy();
    expect(s.getElementById('svBtn')).toBeTruthy();
    expect(s.getElementById('ep')).toBeTruthy();   // editor pane
    expect(s.getElementById('po')).toBeTruthy();   // preview output
  });
});

// ── format selection ────────────────────────────────────────────────────────

describe('SolLiveEdit — format', () => {
  test('defaults to markdown when nothing is specified', async () => {
    const el = await mkEditor();
    expect(el.format).toBe('markdown');
  });

  test('honours the format attribute', async () => {
    const el = await mkEditor({ format: 'turtle' });
    expect(el.format).toBe('turtle');
  });

  test('infers the format from the source extension', async () => {
    const el = await mkEditor({ source: 'https://pod.example/data.ttl' });
    expect(el.format).toBe('turtle');
  });

  test('canZoom is true for turtle, false for csv', async () => {
    expect((await mkEditor({ format: 'turtle' })).canZoom).toBe(true);
    expect((await mkEditor({ format: 'csv' })).canZoom).toBe(false);
  });

  test('canStats is true only for csv', async () => {
    expect((await mkEditor({ format: 'csv' })).canStats).toBe(true);
    expect((await mkEditor({ format: 'turtle' })).canStats).toBe(false);
  });

  test('sol-format event fires during init', async () => {
    const el = document.createElement('sol-live-edit');
    el.setAttribute('format', 'turtle');
    let detail = null;
    el.addEventListener('sol-format', (e) => { detail = e.detail; });
    await el._init();
    expect(detail).toEqual({ format: 'turtle', canZoom: true, canStats: false });
  });
});

// ── content ─────────────────────────────────────────────────────────────────

describe('SolLiveEdit — content', () => {
  test('content setter/getter round-trips through the editor', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.content = '# Hello';
    expect(el.content).toBe('# Hello');
  });

  test('content is empty before an editor exists', () => {
    const el = document.createElement('sol-live-edit');
    expect(el.content).toBe('');
  });
});

// ── zoom ────────────────────────────────────────────────────────────────────

describe('SolLiveEdit — zoom', () => {
  test('starts at 100% and zoomIn steps by 10%', async () => {
    const el = await mkEditor({ format: 'turtle' });
    expect(el.zoom).toBe(100);
    el.zoomIn();
    expect(el.zoom).toBe(110);
    el.zoomOut();
    expect(el.zoom).toBe(100);
  });

  test('zoomIn emits sol-zoom with the new level', async () => {
    const el = await mkEditor({ format: 'turtle' });
    let detail = null;
    el.addEventListener('sol-zoom', (e) => { detail = e.detail; });
    el.zoomIn();
    expect(detail.pct).toBe(110);
  });

  test('zoom clamps between 20% and 500%', async () => {
    const el = await mkEditor({ format: 'turtle' });
    for (let i = 0; i < 60; i++) el.zoomIn();
    expect(el.zoom).toBe(500);
    for (let i = 0; i < 60; i++) el.zoomOut();
    expect(el.zoom).toBe(20);
  });
});

// ── toolbar / save ──────────────────────────────────────────────────────────

describe('SolLiveEdit — toolbar', () => {
  test('readonly hides the Save button', async () => {
    const el = await mkEditor({ format: 'markdown', readonly: '' });
    expect(el.shadowRoot.getElementById('svBtn').style.display).toBe('none');
  });

  test('save() emits sol-save carrying the current content', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.content = 'draft';
    let detail = null;
    el.addEventListener('sol-save', (e) => { detail = e.detail; });
    el.save();
    expect(detail.content).toBe('draft');
  });

  test('toggleSettings opens the settings panel', async () => {
    const el = await mkEditor({ format: 'markdown' });
    expect(el.shadowRoot.getElementById('cf').classList.contains('on')).toBe(false);
    el.toggleSettings();
    expect(el.shadowRoot.getElementById('cf').classList.contains('on')).toBe(true);
  });
});

// ── _loadSrc ────────────────────────────────────────────────────────────────

const flush = () => new Promise(r => setTimeout(r, 0));

function srcFetch(body, { ok = true, status = 200, contentType = '' } = {}) {
  return async () => ({
    ok, status,
    text: async () => body,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
  });
}

describe('SolLiveEdit — _loadSrc', () => {
  test('loads the document content and fires sol-load', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.fetchFn = srcFetch('# fetched doc');
    let detail = null;
    el.addEventListener('sol-load', (e) => { detail = e.detail; });
    await el._loadSrc('https://pod.example/notes.md');
    expect(el.content).toBe('# fetched doc');
    expect(detail).toEqual({ content: '# fetched doc', url: 'https://pod.example/notes.md' });
  });

  test('adopts the format from the response content-type', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.fetchFn = srcFetch('a,b\n1,2', { contentType: 'text/csv' });
    await el._loadSrc('https://pod.example/data.unknownext');
    expect(el.format).toBe('csv');
  });

  test('a failed load shows an error', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.fetchFn = srcFetch('', { ok: false, status: 500 });
    await el._loadSrc('https://pod.example/missing.md');
    const er = el.shadowRoot.getElementById('er');
    expect(er.classList.contains('on')).toBe(true);
    expect(er.textContent).toMatch(/Load failed.*500/);
  });
});

// ── save to a server ────────────────────────────────────────────────────────

describe('SolLiveEdit — save', () => {
  test('save() PUTs the content to the source URL', async () => {
    const el = await mkEditor({ format: 'turtle', source: 'https://pod.example/x.ttl' });
    const calls = [];
    el.fetchFn = async (url, opts = {}) => {
      calls.push({ url, method: opts.method });
      return { ok: true, status: 200, text: async () => '', headers: { get: () => null } };
    };
    el.content = '@prefix x: <x>.';
    el.save();
    await flush();
    expect(calls).toContainEqual({ url: 'https://pod.example/x.ttl', method: 'PUT' });
  });
});

// ── _change ─────────────────────────────────────────────────────────────────

describe('SolLiveEdit — _change', () => {
  test('an editor change fires sol-change with the current content', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.content = 'draft';
    let detail = null;
    el.addEventListener('sol-change', (e) => { detail = e.detail; });
    el._change();
    if (el._db) clearTimeout(el._db);   // cancel the debounced re-render
    expect(detail).toEqual({ content: 'draft' });
  });
});

// ── attributeChangedCallback ────────────────────────────────────────────────

describe('SolLiveEdit — attributeChangedCallback', () => {
  test('changing the format attribute re-sets the format', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el.setAttribute('format', 'csv');
    await flush();
    expect(el.format).toBe('csv');
  });
});

// ── view configuration ──────────────────────────────────────────────────────

describe('SolLiveEdit — _applyView', () => {
  test('"editor" view hides the preview pane', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el._cfg.view = 'editor';
    el._applyView();
    expect(el.shadowRoot.getElementById('pp').style.display).toBe('none');
    expect(el.shadowRoot.getElementById('ep').style.display).toBe('');
  });

  test('"preview" view hides the editor pane', async () => {
    const el = await mkEditor({ format: 'markdown' });
    el._cfg.view = 'preview';
    el._applyView();
    expect(el.shadowRoot.getElementById('ep').style.display).toBe('none');
    expect(el.shadowRoot.getElementById('pp').style.display).toBe('');
  });
});

// ── help modal ──────────────────────────────────────────────────────────────

describe('SolLiveEdit — toggleHelp', () => {
  test('opens the help modal, and toggling again closes it', async () => {
    const el = await mkEditor({ format: 'markdown' });
    const modal = el.shadowRoot.getElementById('modal');
    await el.toggleHelp();
    expect(modal.classList.contains('on')).toBe(true);
    await el.toggleHelp();
    expect(modal.classList.contains('on')).toBe(false);
  });
});
