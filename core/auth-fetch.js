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
