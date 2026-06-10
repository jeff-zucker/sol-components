// Region resolver + mounter for launchers (menu items, sol-button).
//
// The model: content/structure lives in Turtle, all display lives in HTML.
// A launcher decides three things, all resolved here from the DOM:
//
//   where    — `region=` on the launcher / a container / <sol-menu> /
//              <sol-default> (nearest wins). Value is a CSS selector (a
//              persistent pane the author placed) OR a keyword
//              (modal | floating | tab | window) that conjures an ephemeral
//              surface with no author-placed element. A Turtle menu item,
//              which has no HTML element, is routed by a host that claims it
//              by id via `data-for`.
//   how      — the content element: a component tag, a <sol-include> of a
//              same-origin href, or an <iframe> for an external href.
//   lifetime — per pane: component → keep-alive wrapper, doc/iframe → replace.
//
// No RDF display vocabulary is involved; surfaces survive only as the HTML
// keyword values above.

import { mountInTarget } from './component-mount.js';

const SURFACE_KEYWORDS = new Set(['modal', 'floating', 'tab', 'window']);

/** True for a cross-origin http(s) URL. */
export function isExternal(href) {
  if (!href) return false;
  try {
    const u = new URL(href, document.baseURI);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin !== location.origin;
  } catch {
    return false;
  }
}

/** Content element for a link href: same-origin → trusted sol-include
 *  (keep-alive); external → iframe (replace). */
export function contentForHref(href) {
  return isExternal(href)
    ? { tag: 'iframe',      attrs: [['src', href]],                                            replace: true }
    : { tag: 'sol-include', attrs: [['source', href], ['endpoint', href], ['trusted', 'true']], replace: false };
}

function buildElement(tag, attrs = [], embedClass = null) {
  const el = document.createElement(tag);
  for (const [k, v] of attrs) el.setAttribute(k, v);
  if (embedClass) el.classList.add(embedClass);
  return el;
}

function safeQuery(sel) {
  try { return document.querySelector(sel); } catch { return null; }
}

// Find a region/host element that claims this item id via `data-for`
// (space-separated list of ids).
function claimedRegion(id) {
  if (!id) return null;
  for (const el of document.querySelectorAll('[data-for]')) {
    if ((el.getAttribute('data-for') || '').split(/\s+/).includes(id)) return el;
  }
  return null;
}

/**
 * Resolve where a launcher's content should go.
 * @returns {{kind:'element', element:Element} | {kind:'modal'|'floating'|'tab'|'window'} | {kind:null}}
 */
export function resolveRegion(launcher, id, fallbackEl = null) {
  const claimed = claimedRegion(id);
  if (claimed) return { kind: 'element', element: claimed };

  let value = null;
  const scope = launcher && launcher.closest ? launcher.closest('[region]') : null;
  if (scope) value = scope.getAttribute('region');
  if (!value) {
    const def = document.querySelector('sol-default[region]');
    if (def) value = def.getAttribute('region');
  }

  if (!value) return fallbackEl ? { kind: 'element', element: fallbackEl } : { kind: null };

  const kw = value.toLowerCase();
  if (SURFACE_KEYWORDS.has(kw)) return { kind: kw };
  const el = safeQuery(value);
  if (el) return { kind: 'element', element: el };
  return fallbackEl ? { kind: 'element', element: fallbackEl } : { kind: null };
}

/**
 * Place a launcher's content into its resolved region.
 *
 * @param {object} o
 * @param {Element|null} o.launcher   element initiating (for region cascade)
 * @param {string|null}  o.id         item id (for data-for routing)
 * @param {string}       o.name       pane wrapper / surface title
 * @param {string|null}  o.tag        content element tag
 * @param {Array<[string,string]>} [o.attrs]
 * @param {string|null}  o.href       used for tab/window surfaces
 * @param {string|null}  o.contents   literal HTML
 * @param {boolean}      [o.replace]  pane lifetime (true = rebuild each time)
 * @param {string|null}  [o.embedClass]
 * @param {Element|null} [o.fallbackEl] where to mount if no region resolves
 * @param {(tag:string)=>void} [o.ensure] lazy-load hook for conjured hosts
 * @returns {Element|Window|null}
 */
export function displayItem({
  launcher = null, id = null, name = '', tag = null, attrs = [],
  href = null, contents = null, replace = false, embedClass = null,
  fallbackEl = null, ensure = null,
}) {
  const region = resolveRegion(launcher, id, fallbackEl);
  const mount = (host) => {
    if (contents != null) host.innerHTML = contents;
    else if (tag)        host.appendChild(buildElement(tag, attrs, embedClass));
  };

  switch (region.kind) {
    case 'tab':    return href ? window.open(href, '_blank', '') : null;
    case 'window': return href ? window.open(href, '_blank', 'width=900,height=700,menubar=no,toolbar=no') : null;
    case 'modal':    return conjure('sol-modal',  name, mount, ensure);
    case 'floating': return conjure('sol-window', name, mount, ensure);
    case 'element':  return mountInElement(region.element, { tag, attrs, name, replace, contents, embedClass, mount });
    default:         return null;
  }
}

function mountInElement(element, { tag, attrs, name, replace, contents, embedClass, mount }) {
  const t = (element.tagName || '').toLowerCase();

  if (t === 'sol-modal') {
    element.handler = (body) => mount(body);
    element.open();
    return element;
  }
  if (t === 'sol-window') {
    mount(element.body || element);
    return element;
  }
  // A pane: literal HTML replaces its content; otherwise a keep-alive (or
  // replace) named wrapper via the shared mount helper.
  if (contents != null) { element.innerHTML = contents; return element; }
  if (!tag) return null;
  return mountInTarget({ target: element, name, tag, attrs, embedClass, replace });
}

/**
 * Place a command/script's OUTPUT into the launcher's resolved region — the
 * command analogue of displayItem (which mounts a component). The region is
 * resolved the same way (resolveRegion: data-for / region= cascade / fallback),
 * so a button, menu item, or tab pane all target their region uniformly. Lazy
 * by construction: callers invoke this only when the script actually produces
 * output, so a fire-and-forget command never resolves or conjures a surface.
 *
 * @param {object} o
 * @param {Element|null} o.launcher    element initiating (for the region cascade)
 * @param {string|null}  o.id          item id (for data-for routing)
 * @param {Element|null} o.fallbackEl  region when none is declared (e.g. a tab pane)
 * @param {string}       o.name        surface title (modal / window)
 * @param {Element|DocumentFragment|string} o.output  content to mount
 * @param {(tag:string)=>void} [o.ensure] lazy-load hook for conjured surfaces
 * @returns {Element|null}             the host the output was mounted into
 */
export function placeOutput({ launcher = null, id = null, fallbackEl = null, name = '', output = null, ensure = null }) {
  if (output == null) return null;
  const region = resolveRegion(launcher, id, fallbackEl);
  const mount = (host) => {
    if (typeof output === 'string') host.insertAdjacentHTML('beforeend', output);
    else host.appendChild(output);
  };
  switch (region.kind) {
    case 'modal':    return conjure('sol-modal',  name, mount, ensure);
    case 'floating': return conjure('sol-window', name, mount, ensure);
    case 'element':  mount(region.element); return region.element;
    default:         return null;   // tab/window (URL openers) or no region
  }
}

// Conjure an ephemeral host (sol-modal / sol-window) with no author element.
// Deferred via whenDefined so open()/body exist once the module upgrades.
function conjure(hostTag, name, mount, ensure) {
  if (ensure) ensure(hostTag);
  const run = () => {
    const host = document.createElement(hostTag);
    if (name) host.setAttribute('title', name);
    if (hostTag === 'sol-modal') {
      host.handler = (body) => mount(body);
      host.open();
    } else {
      document.body.appendChild(host);
      mount(host.body || host);
    }
    return host;
  };
  if (customElements.get(hostTag)) return run();
  if (typeof customElements !== 'undefined') customElements.whenDefined(hostTag).then(run);
  return null;
}
