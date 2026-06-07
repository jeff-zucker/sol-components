// core/activate.js — run a capability's behavior over every element bearing one
// of its attributes, now and as elements mount. This is what makes a capability
// attribute (e.g. data-from-query) work on ANY element, component or not: the
// behavior is injected by a DOM walk, not implemented by the element's class.
//
//   activate('[data-from-query]', (el) => …);   // called once per matching element

/**
 * @param {string} selector — CSS selector for the capability's attribute
 * @param {(el: Element) => void} fn — wiring run once per matching element
 * @returns {() => void} stop the observer
 */
export function activate(selector, fn) {
  if (typeof document === 'undefined') return () => {};
  const seen = new WeakSet();
  const scan = () => {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      try { fn(el); } catch (e) { console.error('[sol-components] activator error for', selector, e); }
    }
  };
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.documentElement || document, { childList: true, subtree: true });
  return () => mo.disconnect();
}
