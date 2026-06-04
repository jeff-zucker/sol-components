// Shared programmatic defaults — values components fall back to when
// their own attribute isn't set and no RDF source PropertyValue
// supplies it. Lives in a singleton <sol-default> element in the host
// page (see ../web/sol-default.js).
//
// CSS-driven knobs (theme, font-size) belong on :root as custom
// properties, not here. This module is for JS-side values like the
// CORS proxy URL.

import { register as registerService } from './services.js';

/**
 * Read the current value of a named default. Returns the matching
 * attribute on the first <sol-default> element in the document, or
 * null if no element exists or the attribute isn't set.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function getDefault(name) {
  const el = document.querySelector('sol-default');
  if (!el) return null;
  const v = el.getAttribute(name);
  return v == null ? null : v;
}

/**
 * Subscribe to changes on <sol-default>. The handler is invoked with
 * (name, newValue, oldValue) for each attribute change. Returns an
 * unsubscribe function — call it on disconnect to remove the listener.
 *
 * The event is dispatched by sol-default's attributeChangedCallback
 * and bubbles up to document, so this works regardless of where the
 * <sol-default> element sits in the tree.
 *
 * @param {(name: string, newValue: string|null, oldValue: string|null) => void} handler
 * @returns {() => void}
 */
export function onDefaultChange(handler) {
  const fn = (e) => handler(e.detail.name, e.detail.newValue, e.detail.oldValue);
  document.addEventListener('sol-default-change', fn);
  return () => document.removeEventListener('sol-default-change', fn);
}

// Publish shared config as the `defaults` host-service so any component reaches
// it via window.SolidWebComponents.defaults — no import required. Registered
// unconditionally; the getters simply return null when no <sol-default> exists.
registerService('defaults', { get: getDefault, onChange: onDefaultChange });
