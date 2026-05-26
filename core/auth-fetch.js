/**
 * core/auth-fetch.js — page-wide authenticated fetch lookup.
 *
 * Components that need to fetch resources (sol-query for SPARQL endpoints,
 * sol-include for documents, the Comunica adapter, …) call getAuthFetch(url)
 * to obtain a fetch function. If a logged-in <sol-login> is on the page,
 * its session.fetch is returned; otherwise the global fetch is.
 *
 * The component-explicit `login` attribute used by sol-pod / sol-pod-ops /
 * sol-wac still wins — pass `opts.element` here to plumb that through.
 *
 * Lookup is light-DOM only: <sol-login> hidden inside another shadow root
 * isn't auto-discovered. That's by design — cross-shadow auth has to be
 * explicit because the host component can't safely guess the user's intent.
 */

/**
 * Return a fetch function appropriate for `url`. Always returns a usable
 * fetch (never null) — callers can use the result without null-checking.
 *
 * @param {string} url — the URL the caller is about to fetch
 * @param {object} [opts]
 * @param {Element} [opts.element] — explicit sol-login element (overrides lookup)
 * @param {string}  [opts.tag]     — session tag; defaults to the targeted
 *                                   element's `side`, else 'default'
 * @returns {(input: RequestInfo, init?: RequestInit) => Promise<Response>}
 */
export function getAuthFetch(url, opts = {}) {
  const login = opts.element || findFirstSolLogin();
  // Sessions are keyed by tag — a <sol-login>'s `side`. An explicitly
  // targeted element selects its own session by that side; auto-discovered
  // or side-less logins use the 'default' tag.
  const tag = opts.tag
    || (opts.element && typeof opts.element.getAttribute === 'function'
        && opts.element.getAttribute('side'))
    || 'default';
  if (login && typeof login.fetchFor === 'function') {
    try {
      const f = login.fetchFor(url, tag);
      if (typeof f === 'function') return f;
    } catch { /* fall through to global fetch */ }
  }
  // `globalThis.fetch` may be missing in some Node test environments —
  // return undefined so callers fall back to their own default (most use
  // `fetchFn = globalThis.fetch` as the parameter default).
  return typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined;
}

/**
 * Find the first <sol-login> in the document, light-DOM only.
 * Returns null if none is present (or in non-browser environments).
 */
function findFirstSolLogin() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('sol-login');
}

/* ── solFetch: auto-prompt fetch wrapper ──────────────────────────────
 *
 * solFetch(url, opts) wraps fetch and, when the response indicates auth
 * is required, dispatches `sol-auth-needed` on document with a Promise
 * resolver in the detail. A listener (typically <sol-login>) runs the
 * login UI and resolves the promise; solFetch then retries once.
 *
 * Event contract (public API):
 *
 *     document.addEventListener('sol-auth-needed', (e) => {
 *       const { url, response, resolve, reject } = e.detail;
 *       // Run login UI; call resolve(true) when authed, resolve(false)
 *       // to give up, reject(err) on error.
 *     });
 *
 * When no `<sol-login>` is mounted, solFetch falls through to a plain
 * fetch (so swc widgets work in unauthed contexts). When AuthManager
 * already has a covering session, the first request is authenticated
 * and `sol-auth-needed` is never fired.
 *
 * Frame integration: a frame (dk, etc.) just mounts `<sol-login>` once
 * — the listener is attached automatically by sol-login's
 * connectedCallback. The frame supplies `default-issuer` via
 * `<sol-default default-issuer="…">` or on the sol-login element
 * itself; sol-login uses it as the auto-login target.
 */

const AUTH_NEEDED_EVENT = 'sol-auth-needed';
const AUTH_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

function getAuthManager() {
  if (typeof window === 'undefined') return null;
  return window.SolidWebComponents?.AuthManager?.shared || null;
}

function hasLoginListener() {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('sol-login');
}

/** 401 → prompt always. 403 → prompt only when no session is active
 *  (with an active session, 403 means "logged in but not authorized",
 *  re-login won't help, so surface the response as-is). */
function shouldPrompt(response, am) {
  if (response.status === 401) return true;
  if (response.status === 403) {
    if (!am) return true;
    const anyLoggedIn = [...am.sessions.values()].some(s => s.info?.isLoggedIn);
    return !anyLoggedIn;
  }
  return false;
}

function awaitAuth(url, response, side) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok)  => { if (!settled) { settled = true; resolve(!!ok); } };
    const fail   = (err) => { if (!settled) { settled = true; reject(err); } };
    document.dispatchEvent(new CustomEvent(AUTH_NEEDED_EVENT, {
      bubbles: false, composed: false,
      detail: { url, response, side, resolve: finish, reject: fail },
    }));
    setTimeout(() => finish(false), AUTH_PROMPT_TIMEOUT_MS);
  });
}

/**
 * Authenticated fetch with auto-prompt on 401 (and unauthenticated 403).
 * @param {string|URL|Request} url
 * @param {RequestInit} [opts]
 * @returns {Promise<Response>}
 */
export async function solFetch(url, opts) {
  const am = getAuthManager();
  const tag = opts?.authTag;
  const baseFetch = am ? am.fetchFor(url, tag) : (typeof fetch !== 'undefined' ? fetch : null);
  if (!baseFetch) throw new Error('solFetch: no fetch implementation available');

  const response = await baseFetch(url, opts);
  if (!shouldPrompt(response, am)) return response;
  if (!hasLoginListener()) return response;

  const ok = await awaitAuth(url, response, tag);
  if (!ok) return response;

  const retryFetch = (am ?? getAuthManager())?.fetchFor(url, tag) || baseFetch;
  return retryFetch(url, opts);
}

/** Event name listeners subscribe to. Re-exported so callers needn't
 *  string-match. */
export const SOL_AUTH_NEEDED = AUTH_NEEDED_EVENT;
