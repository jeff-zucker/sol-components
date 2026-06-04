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

/** The `window.SolidWebComponents` object (created if missing), or a Node-side
 *  stand-in so registration works in tests without a `window`. */
export function root() {
  if (typeof window !== 'undefined') {
    return (window.SolidWebComponents = window.SolidWebComponents || {});
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

export { EVENTS };
