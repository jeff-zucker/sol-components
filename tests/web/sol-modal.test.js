/**
 * @jest-environment jsdom
 *
 * Tests for <sol-modal>:
 *   - imperative open()/close() and handler invocation
 *   - declarative trigger modes (content / component / handler attributes)
 *   - sol-ready / sol-close events, onClose, cleanup
 *   - attributeChangedCallback (title)
 *   - Escape / overlay dismissal
 *   - static SolModal.prompt() and SolModal.choice()
 */

import { SolModal } from '../../web/sol-modal.js';

window.__SolSuppressDefineWarn = true;

function flush() { return new Promise(r => setTimeout(r, 0)); }
function press(key) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

afterEach(() => { document.body.innerHTML = ''; });

// ── observedAttributes ──────────────────────────────────────────────────────

describe('SolModal — observedAttributes', () => {
  test('observes title and size', () => {
    expect(SolModal.observedAttributes).toEqual(['title', 'size']);
  });
});

// ── imperative open/close ───────────────────────────────────────────────────

describe('SolModal — imperative usage', () => {
  test('open() renders the modal shell and appends to the document', () => {
    const m = document.createElement('sol-modal');
    m.modalTitle = 'My Dialog';
    m.handler = (body) => { body.textContent = 'hi'; };
    m.open();

    expect(m.parentNode).toBe(document.body);
    expect(m.shadowRoot.querySelector('.modal')).toBeTruthy();
    expect(m.shadowRoot.querySelector('.modal-title').textContent).toBe('My Dialog');
    expect(m.body.textContent).toBe('hi');
  });

  test('handler receives body, footer, and header-actions elements', () => {
    const m = document.createElement('sol-modal');
    let args = null;
    m.handler = (body, footer, actions) => { args = { body, footer, actions }; };
    m.open();

    expect(args.body).toBe(m.body);
    expect(args.footer).toBe(m.footer);
    expect(args.actions).toBe(m.headerActions);
  });

  test('close() fires sol-close and removes a non-trigger modal', () => {
    const m = document.createElement('sol-modal');
    m.handler = () => {};
    let closed = false;
    m.addEventListener('sol-close', () => { closed = true; });
    m.open();
    m.close();

    expect(closed).toBe(true);
    expect(m.parentNode).toBe(null);
  });

  test('close() runs the cleanup function the handler returned', () => {
    const m = document.createElement('sol-modal');
    let cleaned = false;
    m.handler = () => () => { cleaned = true; };
    m.open();
    m.close();
    expect(cleaned).toBe(true);
  });

  test('onClose callback fires on close', () => {
    const m = document.createElement('sol-modal');
    let via = null;
    m.handler = () => {};
    m.onClose = () => { via = 'onClose'; };
    m.open();
    m.close();
    expect(via).toBe('onClose');
  });

  test('modalTitle getter/setter mirrors the title attribute', () => {
    const m = document.createElement('sol-modal');
    m.modalTitle = 'Set';
    expect(m.getAttribute('title')).toBe('Set');
    expect(m.modalTitle).toBe('Set');
  });

  test('attributeChangedCallback updates the rendered title', () => {
    const m = document.createElement('sol-modal');
    m.handler = () => {};
    m.open();
    m.setAttribute('title', 'Renamed');
    expect(m.shadowRoot.querySelector('.modal-title').textContent).toBe('Renamed');
  });

  test('Escape key closes the modal', () => {
    const m = document.createElement('sol-modal');
    m.handler = () => {};
    let closed = false;
    m.addEventListener('sol-close', () => { closed = true; });
    m.open();
    press('Escape');
    expect(closed).toBe(true);
  });

  test('styles setter accepts an array and ignores non-arrays', () => {
    const m = document.createElement('sol-modal');
    const sheets = [];
    m.styles = sheets;
    expect(m.styles).toBe(sheets);
    m.styles = 'not-an-array';
    expect(m.styles).toEqual([]);
  });
});

// ── declarative trigger modes ───────────────────────────────────────────────

describe('SolModal — declarative trigger', () => {
  test('content attribute renders a trigger button that opens the modal', () => {
    const m = document.createElement('sol-modal');
    m.setAttribute('content', '<p>inline</p>');
    document.body.appendChild(m);

    const btn = m.shadowRoot.querySelector('.modal-trigger');
    expect(btn).toBeTruthy();

    let ready = null;
    m.addEventListener('sol-ready', (e) => { ready = e.detail; });
    btn.click();

    expect(ready.mode).toBe('content');
    expect(m.body.innerHTML).toBe('<p>inline</p>');
  });

  test('component attribute creates that element and forwards extra attributes', () => {
    const m = document.createElement('sol-modal');
    m.setAttribute('component', 'sol-tabs');
    m.setAttribute('title', 'Tabbed');
    m.setAttribute('data-extra', 'passed');
    document.body.appendChild(m);

    let ready = null;
    m.addEventListener('sol-ready', (e) => { ready = e.detail; });
    m.shadowRoot.querySelector('.modal-trigger').click();

    expect(ready.mode).toBe('component');
    expect(ready.element.tagName.toLowerCase()).toBe('sol-tabs');
    expect(ready.element.getAttribute('data-extra')).toBe('passed');
    // OWN_ATTRS (title/component/…) are not forwarded to the inner element.
    expect(ready.element.hasAttribute('title')).toBe(false);
  });

  test('handler attribute resolves a global function', () => {
    window.__modalHandler = (body) => { body.textContent = 'from-global'; };
    const m = document.createElement('sol-modal');
    m.setAttribute('handler', '__modalHandler');
    document.body.appendChild(m);

    let ready = null;
    m.addEventListener('sol-ready', (e) => { ready = e.detail; });
    m.shadowRoot.querySelector('.modal-trigger').click();

    expect(ready.mode).toBe('handler');
    expect(m.body.textContent).toBe('from-global');
    delete window.__modalHandler;
  });

  test('closing a trigger modal restores the trigger button instead of removing', () => {
    const m = document.createElement('sol-modal');
    m.setAttribute('content', '<p>x</p>');
    document.body.appendChild(m);
    m.shadowRoot.querySelector('.modal-trigger').click();
    expect(m.shadowRoot.querySelector('.modal')).toBeTruthy();

    m.close();
    expect(m.parentNode).toBe(document.body);          // not removed
    expect(m.shadowRoot.querySelector('.modal-trigger')).toBeTruthy();
  });
});

// ── static prompt() ─────────────────────────────────────────────────────────

describe('SolModal.prompt', () => {
  test('resolves with the trimmed input value when OK is clicked', async () => {
    const p = SolModal.prompt('Your name?', 'type here');
    const modal = document.querySelector('sol-modal');
    const input = modal.shadowRoot.querySelector('.modal-input');
    input.value = '  Alice  ';
    const ok = [...modal.shadowRoot.querySelectorAll('.modal-footer button')]
      .find(b => b.textContent === 'OK');
    ok.click();
    await expect(p).resolves.toBe('Alice');
  });

  test('resolves with null when Cancel is clicked', async () => {
    const p = SolModal.prompt('Your name?');
    const modal = document.querySelector('sol-modal');
    const cancel = [...modal.shadowRoot.querySelectorAll('.modal-footer button')]
      .find(b => b.textContent === 'Cancel');
    cancel.click();
    await expect(p).resolves.toBe(null);
  });

  test('resolves with null when dismissed via Escape', async () => {
    const p = SolModal.prompt('Your name?');
    press('Escape');
    await expect(p).resolves.toBe(null);
  });
});

// ── static choice() ─────────────────────────────────────────────────────────

describe('SolModal.choice', () => {
  test('resolves with the chosen button value', async () => {
    const p = SolModal.choice({
      title: 'Transfer',
      message: 'Move or copy?',
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Copy', value: 'copy' },
        { label: 'Move', value: 'move', primary: true },
      ],
    });
    const modal = document.querySelector('sol-modal');
    const move = [...modal.shadowRoot.querySelectorAll('.modal-footer button')]
      .find(b => b.textContent === 'Move');
    move.click();
    await expect(p).resolves.toBe('move');
  });

  test('resolves with null when dismissed without a choice', async () => {
    const p = SolModal.choice({ title: 'T', buttons: [{ label: 'Go', value: 'go' }] });
    press('Escape');
    await expect(p).resolves.toBe(null);
  });

  test('runs an optional render callback for extra body content', async () => {
    let rendered = false;
    const p = SolModal.choice({
      title: 'T',
      buttons: [{ label: 'Go', value: 'go' }],
      render: (body) => { rendered = true; body.dataset.custom = '1'; },
    });
    expect(rendered).toBe(true);
    const modal = document.querySelector('sol-modal');
    modal.shadowRoot.querySelector('.modal-footer button').click();
    await p;
  });
});
