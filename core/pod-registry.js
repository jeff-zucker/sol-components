/**
 * core/pod-registry.js — a group-keyed registry of known pod storage URLs.
 *
 * Several <sol-pod>s that share a `pods-group` (or all use the default
 * group) draw from one list, so discovering or adding a pod in one
 * surfaces it in every sibling's selector.
 *
 * The registry is in-memory only. Persistence is left to the host —
 * see <sol-pod>'s seedPods() method and sol-pod-pods-changed event.
 *
 * The reserved group key 'none' yields a fresh, unshared registry on
 * every call — for a <sol-pod> that must stand entirely alone.
 */

const NONE_GROUP    = 'none';
const DEFAULT_GROUP = '__default__';

/** Normalise a pod URL to a trailing-slash form, or null if unusable. */
function normalize(url) {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  return u.endsWith('/') ? u : u + '/';
}

class PodRegistry {
  constructor() {
    this._pods = new Set();
    this._subs = new Set();
  }

  /** Snapshot of known pod URLs, in insertion order. */
  list() { return [...this._pods]; }

  subscribe(fn)   { if (typeof fn === 'function') this._subs.add(fn); }
  unsubscribe(fn) { this._subs.delete(fn); }

  /** Add one URL. See addAll. */
  add(url, opts) { return this.addAll([url], opts); }

  /**
   * Add URLs to the registry. Returns true if anything new was added.
   * Subscribers are notified on a change and passed (snapshot, silent);
   * `silent` (default false) is for host-driven seeding that should not
   * echo back out as a persist-worthy change.
   */
  addAll(urls, { silent = false } = {}) {
    let changed = false;
    for (const raw of urls || []) {
      const u = normalize(raw);
      if (u && !this._pods.has(u)) { this._pods.add(u); changed = true; }
    }
    if (changed) this._notify(silent);
    return changed;
  }

  _notify(silent) {
    const snapshot = this.list();
    for (const fn of this._subs) {
      // A misbehaving subscriber must not stop the others.
      try { fn(snapshot, silent); } catch (e) { /* ignore */ }
    }
  }
}

const registries = new Map();

/**
 * The shared registry for a group key. `'none'` (reserved) returns a
 * brand-new unshared registry every call; any other key — or none —
 * returns the one persistent registry for that group.
 */
export function getRegistry(group) {
  if (group === NONE_GROUP) return new PodRegistry();
  const key = group || DEFAULT_GROUP;
  let reg = registries.get(key);
  if (!reg) { reg = new PodRegistry(); registries.set(key, reg); }
  return reg;
}

/** Test helper — drop every shared registry. */
export function _resetRegistries() { registries.clear(); }
