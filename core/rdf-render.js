// Turns the plain item descriptions produced by core/menu-rdf.js
// (parseMenuItems) into DOM render closures. Shared by <sol-menu> and
// <sol-tabs> so both render the identical ui:Menu RDF shape the same way.
//
// The descriptions are component-agnostic; only the closures below touch
// the DOM. A host element supplies a `ctx`:
//
//   { host, baseUrl, sourceName, embedClass }
//
//   host        — element used for getAttribute('handler') and sol-error
//   baseUrl     — the host module's import.meta.url, for handler resolution
//   sourceName  — host tag name, used in error messages / event detail
//   embedClass  — CSS class added to each embedded element
//                 ('sol-menu-embed' / 'sol-tab-embed')

import { siblingUrl } from './here.js';
import { mountInTarget } from './component-mount.js';

/**
 * Lazy-import a sibling sol-* handler module on first use, so authors
 * don't have to <script> every component a declared item references.
 *
 * @param {string} tag        custom-element tag, e.g. "sol-query"
 * @param {HTMLElement} host  element that emits sol-error on failure
 * @param {string} baseUrl    importing component's import.meta.url
 * @param {string} sourceName host tag name, for the warning / event
 */
export function ensureHandler(tag, host, baseUrl, sourceName) {
  if (!/^sol-[a-z-]+$/.test(tag)) return;
  if (customElements.get(tag)) return;
  import(siblingUrl(`./${tag}.js`, baseUrl)).catch(err => {
    const msg = `<${sourceName}> could not auto-load handler "${tag}" — make sure its module is reachable and any externals are in the importmap (${err.message})`;
    console.warn(msg);
    if (host) host.dispatchEvent(new CustomEvent('sol-error', {
      bubbles: true, composed: true,
      detail: { source: sourceName, kind: 'handler-load', tag, message: err.message },
    }));
  });
}

// Resolve the element a part renders into: an explicit ui:linkTarget
// selector, or the host-provided body when none is given.
function resolveTarget(linkTarget, body) {
  return linkTarget ? document.querySelector(linkTarget) : body;
}

/**
 * Build a render closure for a ui:Component part.
 *
 * When `linkTarget` is set, each item gets its own
 * `<div data-menu-item="Name">` wrapper inside the target. Items
 * marked `keepAlive` keep their wrapper mounted across nav (just
 * toggled `hidden`); non-keep-alive items are recreated on each
 * activation. Without `linkTarget`, the host body is wiped and the
 * component appended directly (legacy behavior).
 *
 * @param {object} desc { name, tag, params, linkTarget, keepAlive }
 * @param {object} ctx  { host, baseUrl, sourceName, embedClass }
 * @returns {(body: HTMLElement) => void}
 */
export function renderComponentItem(desc, ctx) {
  return (body) => {
    const { name, tag, params, linkTarget } = desc;
    if (!tag) return;
    ensureHandler(tag, ctx.host, ctx.baseUrl, ctx.sourceName);

    if (!linkTarget) {
      const el = document.createElement(tag);
      for (const [k, v] of params) el.setAttribute(k, v);
      el.classList.add(ctx.embedClass);
      if (!body) return;
      body.innerHTML = '';
      body.appendChild(el);
      return;
    }

    const target = document.querySelector(linkTarget);
    if (!target) return;
    mountInTarget({ target, name, tag, attrs: params, embedClass: ctx.embedClass });
  };
}

/**
 * Build a render closure for a ui:Link part. A `ui:contents` literal is
 * injected as HTML; otherwise the `ui:href` is wrapped in a handler
 * component (the part's ui:handler, the host's `handler` attribute, or
 * <sol-include>), forwarded as both `source` and `endpoint`.
 *
 * @param {object} desc { href, contents, handlerTag, handlerParams, linkTarget }
 * @param {object} ctx  { host, baseUrl, sourceName, embedClass }
 * @returns {(body: HTMLElement) => void}
 */
export function renderLinkItem(desc, ctx) {
  return (body) => {
    const { name, href, contents, handlerTag, handlerParams, linkTarget } = desc;
    if (contents) {
      const target = resolveTarget(linkTarget, body);
      if (target) target.innerHTML = contents;
      return;
    }
    if (!href) return;
    const tag = handlerTag || ctx.host.getAttribute('handler') || 'sol-include';
    ensureHandler(tag, ctx.host, ctx.baseUrl, ctx.sourceName);

    if (!linkTarget) {
      const el = document.createElement(tag);
      el.setAttribute('source', href);
      el.setAttribute('endpoint', href);
      for (const [k, v] of handlerParams) el.setAttribute(k, v);
      el.classList.add(ctx.embedClass);
      if (!body) return;
      body.innerHTML = '';
      body.appendChild(el);
      return;
    }

    const target = document.querySelector(linkTarget);
    if (!target) return;
    const linkAttrs = [['source', href], ['endpoint', href], ...handlerParams];
    // External links share a single "external" wrapper and overwrite
    // each other; same-origin links keep their own persistent tab.
    const external = isExternalHref(href);
    mountInTarget({
      target,
      name: external ? 'external' : name,
      tag,
      attrs: linkAttrs,
      embedClass: ctx.embedClass,
      replace: external,
    });
  };
}

function isExternalHref(href) {
  if (!href) return false;
  try {
    const u = new URL(href, document.baseURI);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin !== location.origin;
  } catch {
    return false;
  }
}
