/**
 * @jest-environment jsdom
 *
 * Tests for core/popup-proxy.js — the parent-side proxy for an OIDC
 * session living in a popup window (sol-login's popup mode):
 *   - serializeRequest / deserializeRequest
 *   - serializeResponse / deserializeResponse  (+ round-trips)
 *   - PopupProxySession: info, fetch proxying, message routing, logout,
 *     popup-closed handling, teardown
 *
 * jsdom implements neither the Fetch API's Response nor ReadableStream,
 * so both are shimmed below — popup-proxy.js references them directly.
 */

if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = class ReadableStream {};
}
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    constructor(body = null, init = {}) {
      this._body = body;
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? '';
      this.headers = init.headers instanceof Headers
        ? init.headers : new Headers(init.headers || []);
      this.ok = this.status >= 200 && this.status < 300;
    }
    async text() {
      if (this._body == null) return '';
      if (this._body instanceof Blob) {
        // jsdom Blobs lack .text(); read via FileReader.
        return new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(fr.error);
          fr.readAsText(this._body);
        });
      }
      return String(this._body);
    }
    async blob() {
      if (this._body instanceof Blob) return this._body;
      return new Blob([this._body == null ? '' : String(this._body)]);
    }
  };
}

const {
  serializeRequest, deserializeRequest,
  serializeResponse, deserializeResponse,
  PopupProxySession,
} = await import('../../core/popup-proxy.js');

const POPUP_SRC = 'sol-popup-auth';
const flush = () => new Promise(r => setTimeout(r, 0));

// ── serializeRequest ────────────────────────────────────────────────────────

describe('serializeRequest', () => {
  test('a plain string URL defaults to a GET with no headers', async () => {
    const { url, init } = await serializeRequest('https://pod/x');
    expect(url).toBe('https://pod/x');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual([]);
  });

  test('upper-cases the method', async () => {
    const { init } = await serializeRequest('https://pod/x', { method: 'post' });
    expect(init.method).toBe('POST');
  });

  test('collects headers from a plain object', async () => {
    const { init } = await serializeRequest('https://pod/x', { headers: { Accept: 'text/turtle' } });
    expect(init.headers).toContainEqual(['Accept', 'text/turtle']);
  });

  test('collects headers from a Headers instance', async () => {
    const { init } = await serializeRequest('https://pod/x', { headers: new Headers({ 'X-A': '1' }) });
    expect(init.headers).toContainEqual(['x-a', '1']);
  });

  test('collects headers from an array of pairs', async () => {
    const { init } = await serializeRequest('https://pod/x', { headers: [['X-B', '2']] });
    expect(init.headers).toContainEqual(['X-B', '2']);
  });

  test('carries a string body through unchanged', async () => {
    const { init } = await serializeRequest('https://pod/x', { method: 'PUT', body: 'payload' });
    expect(init.body).toBe('payload');
  });

  test('reads url/method/headers off a Request-like input object', async () => {
    const { url, init } = await serializeRequest(
      { url: 'https://pod/y', method: 'delete', headers: { 'X-C': '3' } });
    expect(url).toBe('https://pod/y');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toContainEqual(['X-C', '3']);
  });
});

// ── deserializeRequest ──────────────────────────────────────────────────────

describe('deserializeRequest', () => {
  test('rebuilds url and a Headers object', () => {
    const { url, init } = deserializeRequest({
      url: 'https://pod/x', init: { method: 'GET', headers: [['Accept', 'text/turtle']] },
    });
    expect(url).toBe('https://pod/x');
    expect(init.headers.get('Accept')).toBe('text/turtle');
  });

  test('keeps the body for a PUT', () => {
    const { init } = deserializeRequest({
      url: 'https://pod/x', init: { method: 'PUT', headers: [], body: 'data' },
    });
    expect(init.body).toBe('data');
  });

  test('drops any body for a GET request', () => {
    const { init } = deserializeRequest({
      url: 'https://pod/x', init: { method: 'GET', headers: [], body: 'stray' },
    });
    expect(init.body).toBeUndefined();
  });
});

// ── serializeResponse / deserializeResponse ─────────────────────────────────

// A fake fetch Response — serializeResponse only reads ok/status/
// statusText/headers/blob() off it.
function fakeResponse(body, { status = 200, statusText = 'OK', headers = [] } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status, statusText,
    headers: new Headers(headers),
    blob: async () => new Blob([body == null ? '' : String(body)]),
  };
}

describe('serializeResponse', () => {
  test('captures status, statusText, headers, and body', async () => {
    const out = await serializeResponse(fakeResponse('hello', { headers: [['X-H', 'v']] }));
    expect(out.ok).toBe(true);
    expect(out.status).toBe(200);
    expect(out.headers).toContainEqual(['x-h', 'v']);
    expect(out.body).toBeInstanceOf(Blob);
  });

  test('a 204 response carries a null body', async () => {
    const out = await serializeResponse(fakeResponse('ignored', { status: 204, statusText: 'No Content' }));
    expect(out.body).toBe(null);
  });
});

describe('deserializeResponse', () => {
  test('rebuilds a Response with status and body', async () => {
    const resp = deserializeResponse({ status: 200, statusText: 'OK', headers: [], body: 'payload' });
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('payload');
  });

  test('a 304 reply yields a null-body Response', async () => {
    const resp = deserializeResponse({ status: 304, statusText: 'Not Modified', headers: [], body: 'x' });
    expect(await resp.text()).toBe('');
  });

  test('round-trips a response body through serialize + deserialize', async () => {
    const serialized = await serializeResponse(fakeResponse('round-trip-data'));
    const resp = deserializeResponse(serialized);
    expect(await resp.text()).toBe('round-trip-data');
  });
});

// ── PopupProxySession ───────────────────────────────────────────────────────

function makePopup() {
  return {
    posted: [],
    closed: false,
    postMessage(msg) { this.posted.push(msg); },
    close() { this.closed = true; },
  };
}

const _sessions = [];
function mkSession(popup, loginInfo = {}) {
  const s = new PopupProxySession(popup, loginInfo, 'https://app.example');
  _sessions.push(s);
  return s;
}
afterEach(() => {
  // destroy() clears the close-watch interval — leaving it running would
  // keep the jest worker alive.
  while (_sessions.length) _sessions.pop().destroy();
});

function reply(data) {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: POPUP_SRC, ...data },
  }));
}

describe('PopupProxySession — construction', () => {
  test('exposes a logged-in info block built from loginInfo', () => {
    const s = mkSession(makePopup(), {
      webId: 'https://pod/me', sessionId: 'sid-1', issuer: 'https://idp/',
    });
    expect(s.info).toMatchObject({
      isLoggedIn: true, webId: 'https://pod/me', sessionId: 'sid-1', issuer: 'https://idp/',
    });
  });

  test('exposes the side from loginInfo', () => {
    expect(mkSession(makePopup(), { side: 'left' }).side).toBe('left');
  });

  test('popupClosed reflects the popup window state', () => {
    const popup = makePopup();
    const s = mkSession(popup, {});
    expect(s.popupClosed).toBe(false);
    popup.closed = true;
    expect(s.popupClosed).toBe(true);
  });
});

describe('PopupProxySession — fetch proxying', () => {
  test('posts a fetch message and resolves with the popup reply', async () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    const p = s.fetch('https://pod/doc');
    await flush();

    const sent = popup.posted.at(-1);
    expect(sent.type).toBe('fetch');
    expect(sent.source).toBe('sol-popup-parent');
    expect(sent.url).toBe('https://pod/doc');

    reply({ type: 'fetch-reply', id: sent.id, status: 200, statusText: 'OK', headers: [], body: 'doc-body' });
    const resp = await p;
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('doc-body');
  });

  test('rejects when the reply carries an error', async () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    const p = s.fetch('https://pod/doc');
    await flush();
    reply({ type: 'fetch-reply', id: popup.posted.at(-1).id, error: 'boom' });
    await expect(p).rejects.toThrow('boom');
  });

  test('rejects fetch when the session is not logged in', async () => {
    const s = mkSession(makePopup(), { webId: 'w' });
    s.info.isLoggedIn = false;
    await expect(s.fetch('https://pod/doc')).rejects.toThrow(/not logged in/);
  });

  test('rejects fetch when the popup is already closed', async () => {
    const popup = makePopup();
    popup.closed = true;
    const s = mkSession(popup, { webId: 'w' });
    await expect(s.fetch('https://pod/doc')).rejects.toThrow(/popup is closed/);
  });
});

describe('PopupProxySession — message routing', () => {
  test('ignores messages that are not from the popup', async () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    s.fetch('https://pod/doc');
    await flush();
    const id = popup.posted.at(-1).id;

    // Wrong source — must not settle the pending request.
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'someone-else', type: 'fetch-reply', id },
    }));
    expect(s._pending.has(id)).toBe(true);
  });

  test('ignores replies addressed to a different side', async () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w', side: 'left' });
    s.fetch('https://pod/doc');
    await flush();
    const id = popup.posted.at(-1).id;

    reply({ type: 'fetch-reply', id, side: 'right', status: 200, headers: [], body: '' });
    expect(s._pending.has(id)).toBe(true);   // still pending — wrong side

    reply({ type: 'fetch-reply', id, side: 'left', status: 200, headers: [], body: '' });
    expect(s._pending.has(id)).toBe(false);  // matched
  });
});

describe('PopupProxySession — logout and teardown', () => {
  test('logout posts a request, clears the session, and emits a logout event', async () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    let detail = null;
    s.addEventListener('logout', (e) => { detail = e.detail; });

    const p = s.logout();
    await flush();
    const msg = popup.posted.find(m => m.type === 'logout');
    expect(msg).toBeTruthy();
    reply({ type: 'logout-reply', id: msg.id });
    await p;

    expect(s.info.isLoggedIn).toBe(false);
    expect(detail).toEqual({ reason: 'explicit', side: null });
  });

  test('a popup closed out from under us logs the session out', () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    let detail = null;
    s.addEventListener('logout', (e) => { detail = e.detail; });

    popup.closed = true;
    s._handlePopupClosed();

    expect(s.info.isLoggedIn).toBe(false);
    expect(detail.reason).toBe('popup-closed');
  });

  test('destroy() closes the popup', () => {
    const popup = makePopup();
    const s = mkSession(popup, { webId: 'w' });
    s.destroy();
    expect(popup.closed).toBe(true);
  });
});
