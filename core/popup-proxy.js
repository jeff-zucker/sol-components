/**
 * popup-proxy — parent-side proxy for an OIDC session that lives in a
 * popup window.
 *
 * Phase 0 established that two Inrupt `Session`s cannot coexist in one
 * window (storage gets wiped; restoration redirects top-level). The
 * workaround: each session lives in its own popup window, which holds
 * the real `Session`. The parent never navigates, so multiple popups'
 * sessions coexist. The parent talks to each popup over postMessage.
 *
 * `PopupProxySession` is shape-compatible with the bits of Inrupt's
 * `Session` that callers use — `.info`, `.fetch`, `.logout` — so it can
 * be stored in `AuthManager.sessions` alongside (or instead of) real
 * `Session`s.
 *
 * Wire protocol (both directions use `source` to disambiguate):
 *
 *   parent → popup  { source:'sol-popup-parent', type, id, side, ... }
 *   popup  → parent { source:'sol-popup-auth',   type, id, side, ... }
 *
 *   type 'fetch'        parent→popup  { url, init: SerializedInit }
 *   type 'fetch-reply'  popup→parent  { ok,status,statusText,headers,body } | { error }
 *   type 'logout'       parent→popup  {}
 *   type 'logout-reply' popup→parent  {}
 *   type 'logged-in'    popup→parent  { webId, sessionId, issuer }
 *   type 'login-failed' popup→parent  { error }
 *   type 'popup-ready'  popup→parent  {}
 *
 * Request/response bodies are buffered (not streamed) — fine for pod
 * file ops, which are not huge. Blob and ArrayBuffer survive structured
 * clone; ReadableStream does not, so it is buffered first.
 */

const PARENT_SRC = 'sol-popup-parent';
const POPUP_SRC  = 'sol-popup-auth';

/** Statuses whose Response MUST have a null body. */
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

/**
 * Serialize a fetch `init` (and a Request-ish input) into a structured-
 * cloneable object. Headers → [[k,v]]; a streaming body is buffered to
 * a Blob.
 */
export async function serializeRequest(input, init = {}) {
  const url = typeof input === 'string'
    ? input
    : (input && input.url) || String(input);

  const method = (init.method
    || (typeof input !== 'string' && input && input.method)
    || 'GET').toUpperCase();

  // Merge headers from a Request input and the init.
  const headers = [];
  const collect = (h) => {
    if (!h) return;
    if (typeof h.forEach === 'function' && !(Array.isArray(h))) {
      h.forEach((v, k) => headers.push([k, v]));
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headers.push([k, v]);
    } else {
      for (const k of Object.keys(h)) headers.push([k, h[k]]);
    }
  };
  if (typeof input !== 'string' && input && input.headers) collect(input.headers);
  if (init.headers) collect(init.headers);

  let body = init.body;
  if (body == null && typeof input !== 'string' && input && input.body) {
    // Request input with a body — buffer it.
    body = await input.clone().blob();
  }
  if (body instanceof ReadableStream) {
    body = await new Response(body).blob();
  }
  // Blob, ArrayBuffer, ArrayBufferView, string, URLSearchParams all
  // survive structured clone. FormData does too. Leave as-is.

  return { url, init: { method, headers, body } };
}

/** Reconstruct a fetch call inside the popup from a serialized request. */
export function deserializeRequest(msg) {
  const init = {
    method: msg.init.method,
    headers: new Headers(msg.init.headers || []),
  };
  if (msg.init.body != null && msg.init.method !== 'GET' && msg.init.method !== 'HEAD') {
    init.body = msg.init.body;
  }
  return { url: msg.url, init };
}

/** Serialize a Response (popup side) into a cloneable object. */
export async function serializeResponse(res) {
  const headers = [];
  res.headers.forEach((v, k) => headers.push([k, v]));
  let body = null;
  if (!NULL_BODY_STATUS.has(res.status)) {
    body = await res.blob();
  }
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers,
    body,
  };
}

/** Reconstruct a Response (parent side) from a serialized reply. */
export function deserializeResponse(reply) {
  const init = {
    status: reply.status,
    statusText: reply.statusText,
    headers: new Headers(reply.headers || []),
  };
  const body = NULL_BODY_STATUS.has(reply.status) ? null : reply.body;
  return new Response(body, init);
}

/**
 * Parent-side proxy. Holds a reference to the popup window and forwards
 * `fetch` to it.
 */
export class PopupProxySession extends EventTarget {
  /**
   * @param {Window} popupWindow  the open popup running the callback page
   * @param {Object} loginInfo    { webId, sessionId, issuer, side }
   * @param {string} popupOrigin  origin to postMessage to (same-origin app)
   */
  constructor(popupWindow, loginInfo, popupOrigin) {
    super();
    this._popup = popupWindow;
    this._origin = popupOrigin || (typeof window !== 'undefined' ? window.location.origin : '*');
    this._side = loginInfo.side || null;
    this._reqId = 0;
    this._pending = new Map();

    this.info = {
      isLoggedIn: true,
      sessionId: loginInfo.sessionId || null,
      webId: loginInfo.webId || null,
      issuer: loginInfo.issuer || null,
      clientAppId: loginInfo.clientId || null,
    };

    this._onMessage = (e) => this._handleMessage(e);
    window.addEventListener('message', this._onMessage);

    // Notice if the popup is closed out from under us.
    this._closeWatch = setInterval(() => {
      if (this._popup && this._popup.closed) this._handlePopupClosed();
    }, 1500);
  }

  get side() { return this._side; }
  get popupClosed() { return !this._popup || this._popup.closed; }

  _handleMessage(e) {
    const d = e.data;
    if (!d || d.source !== POPUP_SRC) return;
    if (this._side && d.side && d.side !== this._side) return;
    if (d.type === 'fetch-reply' || d.type === 'logout-reply') {
      const p = this._pending.get(d.id);
      if (p) {
        this._pending.delete(d.id);
        if (d.error) p.reject(new Error(d.error));
        else p.resolve(d);
      }
    }
  }

  _handlePopupClosed() {
    clearInterval(this._closeWatch);
    if (!this.info.isLoggedIn) return;
    this.info.isLoggedIn = false;
    for (const [, p] of this._pending) p.reject(new Error('popup closed'));
    this._pending.clear();
    this.dispatchEvent(new CustomEvent('logout', {
      detail: { reason: 'popup-closed', side: this._side },
    }));
  }

  _post(msg, transfer) {
    if (this.popupClosed) throw new Error('popup is closed');
    msg.source = PARENT_SRC;
    msg.side = this._side;
    this._popup.postMessage(msg, this._origin, transfer || []);
  }

  _request(msg, timeoutMs = 60000) {
    const id = String(++this._reqId);
    msg.id = id;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try {
        this._post(msg);
      } catch (err) {
        this._pending.delete(id);
        reject(err);
        return;
      }
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error('popup request timed out'));
        }
      }, timeoutMs);
    });
  }

  /** Authenticated fetch — proxied to the popup's real Session. */
  fetch = async (input, init) => {
    if (!this.info.isLoggedIn) throw new Error('PopupProxySession: not logged in');
    const serialized = await serializeRequest(input, init);
    const reply = await this._request({ type: 'fetch', ...serialized });
    if (reply.error) throw new Error(reply.error);
    return deserializeResponse(reply);
  };

  async logout() {
    if (!this.popupClosed) {
      try { await this._request({ type: 'logout' }, 5000); } catch (_) { /* ignore */ }
    }
    this.info.isLoggedIn = false;
    this.dispatchEvent(new CustomEvent('logout', { detail: { reason: 'explicit', side: this._side } }));
    this.destroy();
  }

  /** Tear down listeners and close the popup. */
  destroy() {
    clearInterval(this._closeWatch);
    window.removeEventListener('message', this._onMessage);
    if (this._popup && !this._popup.closed) {
      try { this._popup.close(); } catch (_) { /* ignore */ }
    }
    this._popup = null;
  }
}
