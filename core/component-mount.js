// Shared mount-into-target helper used by:
//   - core/rdf-render.js renderComponentItem (menu / tabs item rendering)
//   - web/sol-button.js (declarative launcher in chrome)
//
// Both place a custom-element instance inside a per-named wrapper
// (`<div data-menu-item="<name>" data-keep-alive="true|false">`) under
// a CSS-selector-addressed `target` element, so multiple consumers can
// coexist in the same display area and play nicely with keep-alive.

/**
 * Locate the wrapper a prior mount left in `target` for the given name.
 * Returns null when none exists.
 * @param {HTMLElement} target
 * @param {string} name
 * @returns {HTMLElement | null}
 */
export function findItemWrapper(target, name) {
  if (!target) return null;
  const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(name) : name;
  return target.querySelector(`:scope > [data-menu-item="${esc}"]`);
}

/**
 * Hide every other named wrapper inside `target`. The mount model is
 * "always-persistent tabs" — clicking a menu/button just brings its
 * own wrapper to the foreground and parks the others. Components are
 * never torn down on nav-away, so their internal state (login
 * sessions, scroll position, in-flight fetches, open accordion
 * panels, etc.) survives across menu switches.
 */
export function pruneSiblings(target, activeName) {
  if (!target) return;
  const wraps = target.querySelectorAll(':scope > [data-menu-item]');
  for (const w of wraps) {
    if (w.dataset.menuItem === activeName) continue;
    w.hidden = true;
  }
}

/**
 * Mount (or re-show) a component inside `target`, wrapped for
 * coexistence with siblings.
 *
 * Two modes:
 *   - **Persistent tab** (default, `replace` falsy): each
 *     `(target, name)` pair is created once and reused — clicking
 *     back to the same name just unhides the existing wrapper, so
 *     internal state (login, scroll, in-flight fetches) survives.
 *   - **Shared / overwrite tab** (`replace: true`): the wrapper for
 *     `name` is kept across activations but its component is torn
 *     down and rebuilt with the latest attrs on every call. Useful
 *     for a single "scratch" pane that multiple sources write into
 *     (e.g. external menu links, ad-hoc launchers).
 *
 * @param {object}      o
 * @param {HTMLElement} o.target       Where to mount (typically a linkTarget).
 * @param {string}      o.name         Wrapper id (data-menu-item value).
 * @param {string}      o.tag          Custom-element tag of the component.
 * @param {Iterable<[string, string]>} [o.attrs]  Attributes to set on
 *                       the new component. Re-applied each call in
 *                       replace mode; ignored when reusing in
 *                       persistent mode.
 * @param {string}      [o.embedClass] Optional CSS class added to the
 *                       mounted component (e.g. 'sol-menu-embed').
 * @param {boolean}     [o.replace]    When true, rebuild the inner
 *                       component on every call (the wrapper itself
 *                       persists; only its contents are swapped).
 * @returns {HTMLElement} the wrapper (existing or freshly created).
 */
export function mountInTarget({ target, name, tag, attrs, embedClass, replace }) {
  if (!target || !tag) return null;

  let wrap = findItemWrapper(target, name);
  if (wrap && !replace) {
    pruneSiblings(target, name);
    wrap.hidden = false;
    fireTabActivate(target, name);
    return wrap;
  }

  if (wrap) {
    // Replace mode: rebuild contents but keep the wrapper itself.
    wrap.innerHTML = '';
    wrap.hidden = false;
  } else {
    wrap = document.createElement('div');
    wrap.dataset.menuItem = name;
    target.appendChild(wrap);
  }
  if (replace) wrap.dataset.replace = 'true';

  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of attrs) el.setAttribute(k, v);
  if (embedClass) el.classList.add(embedClass);
  wrap.appendChild(el);

  pruneSiblings(target, name);
  fireTabActivate(target, name);
  return wrap;
}

// Bubble + composed event so menus / buttons elsewhere on the page
// can sync their active-state visuals without each consumer wiring
// its own listener on every possible target.
function fireTabActivate(target, name) {
  target.dispatchEvent(new CustomEvent('sol-tab-activate', {
    bubbles: true, composed: true,
    detail: { name, target },
  }));
}
