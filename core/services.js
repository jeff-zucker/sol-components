// core/services.js — import-side accessor for the host-services registry.
//
// The ecosystem's "share resources without importing each other" surface. The
// loader (web/sol-loader.js) publishes a tiny registry at
// `window.SolidWebComponents.services`; swc capability modules import THIS file
// to register the shared services they provide:
//
//   import { register } from '../core/services.js';
//   register('rdf', rdf);                 // core/rdf.js
//   register('auth', { fetch, manager }); // web/sol-login.js
//   register('defaults', { get, onChange });
//
// Any component (swc's or a third party's) then reads them, import-free, via
// `window.SolidWebComponents.{ rdf, auth, fetch, defaults, has, services }`.
//
// Mirrors core/rdf.js: in the browser everything funnels through the one
// window-shared registry; in Node/jest there's no `window`, so a module-local
// fallback registry is used (preserving test isolation). The registry is
// duck-typed by its methods, so it doesn't matter whether the loader or this
// module created it.

import { EVENTS } from './events.js';

function makeRegistry() {
  const map = new Map();
  const waiters = new Map();
  return {
    register(name, impl) {
      map.set(name, impl);
      const ws = waiters.get(name);
      if (ws) { waiters.delete(name); ws.forEach((fn) => fn(impl)); }
    },
    get(name) { return map.get(name); },
    has(name) { return map.has(name); },
    names() { return Array.from(map.keys()); },
    whenReady(name) {
      if (map.has(name)) return Promise.resolve(map.get(name));
      return new Promise((res) => {
        const a = waiters.get(name) || [];
        a.push(res);
        waiters.set(name, a);
      });
    },
  };
}

let _local = null;

/** The one shared host surface. It is the broker's `window.ComponentInterop`
 *  when component-interop's loader is on the page; `window.SolidWebComponents`
 *  is swc's historical alias for the SAME object. Unifying them here lets swc
 *  work whether the page loaded component-interop's generic loader OR swc's own
 *  (which vendors it). A Node-side stand-in is used in tests without a window. */
export function root() {
  if (typeof window !== 'undefined') {
    const surface = window.ComponentInterop || window.SolidWebComponents || {};
    window.ComponentInterop = surface;
    window.SolidWebComponents = surface;
    return surface;
  }
  return (_local = _local || {});
}

/** The shared services registry — the loader's if present, else one we create. */
export function services() {
  const r = root();
  if (!r.services) r.services = makeRegistry();
  if (!r.EVENTS) r.EVENTS = EVENTS;   // the loader doesn't bake the table
  return r.services;
}

export function register(name, impl) { return services().register(name, impl); }
export function get(name)            { return services().get(name); }
export function has(name)            { return services().has(name); }
export function whenReady(name)      { return services().whenReady(name); }

/**
 * Adopt a foreign authenticated fetch as the page's default authenticated fetch
 * when no <sol-login> is present. This lets swc components ride a session
 * established by another component library (e.g. PodOS, which hands its
 * `authenticatedFetch` out via its `pod-os:loaded` event). getAuthFetch()
 * (core/auth-fetch.js) returns it as the fallback after the <sol-login> lookup.
 * A logged-in <sol-login> still wins — this is the no-sol-login fallback.
 *
 * @param {(input: RequestInfo, init?: RequestInit) => Promise<Response>} fn
 * @param {object} [info]  e.g. { webId }
 * @returns the adopted fetch (or null when cleared)
 */
export function adoptFetch(fn, info) {
  const r = root();
  r.adoptedFetch = (typeof fn === 'function') ? fn : null;
  if (info && info.webId) r.adoptedWebId = info.webId;
  return r.adoptedFetch;
}

// Expose adoptFetch on the host surface so import-free host glue can call
// `window.SolidWebComponents.adoptFetch(fn, { webId })`.
if (typeof window !== 'undefined') {
  const r = root();
  if (!r.adoptFetch) r.adoptFetch = adoptFetch;
  // Register the broker consumer that adopts a foreign authenticated fetch: the
  // loader invokes it for a manifest `consumes: { auth: { call: 'adoptFetch' } }`.
  if (typeof r.registerConsumer === 'function') r.registerConsumer('adoptFetch', (fn) => adoptFetch(fn));
}

export { EVENTS };
