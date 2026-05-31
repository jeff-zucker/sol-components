/**
 * sources/registry.js — the open-set slot.
 *
 * Providers self-register on import; a host iterates the registry to build its
 * UI (data-driven tabs) instead of hardcoding a provider list. Adding a source
 * is a new module + one `registerProvider` call — zero host edits.
 *
 *   import { commonsFileProvider } from './commons-file.js'; // self-registers
 *   import { providers } from './registry.js';
 *   for (const p of providers()) host.addTab(p);
 */

/** @type {Map<string, import('./contract.js').Provider>} */
const _providers = new Map();

/**
 * Register a provider (idempotent by id; a later call replaces an earlier one).
 * @param {import('./contract.js').Provider} provider
 * @returns {import('./contract.js').Provider} the same provider, for chaining
 */
export function registerProvider(provider) {
  if (!provider || !provider.id) throw new Error('registerProvider: provider needs an id');
  if (typeof provider.load !== 'function') throw new Error(`provider "${provider.id}" needs a load()`);
  _providers.set(provider.id, provider);
  return provider;
}

/** All registered providers, in registration order. */
export function providers() {
  return [..._providers.values()];
}

/** One provider by id, or null. */
export function getProvider(id) {
  return _providers.get(id) || null;
}

/** Providers that yield a given media kind (e.g. 'image'). */
export function providersForKind(kind) {
  return providers().filter((p) => Array.isArray(p.kinds) && p.kinds.includes(kind));
}
