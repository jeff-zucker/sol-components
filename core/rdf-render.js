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
import { displayItem, contentForHref } from './display-target.js';

/**
 * A ui:Component's `ui:name` is either a custom-element tag (render that
 * component) or a *command* — an opaque registry key the host app resolves.
 * Custom-element names must contain a hyphen (HTML spec), so a bare name that
 * isn't a registered element is a command. The name is NOT a tag, a global, or
 * a script: clicking it dispatches `sol-command` for the app to map; an
 * unregistered key is a no-op. Bounded entirely by the app's registry.
 *
 * @param {string} name  a ui:Component ui:name value
 * @returns {boolean}    true when it should be treated as a command
 */
export function isCommandName(name) {
  if (!name) return false;
  return !name.includes('-') && !customElements.get(name);
}

/** ui:attribute/ui:parameter pairs [[k,v],…] → { k: v, … } command args. */
export function paramsToObject(params) {
  return Object.fromEntries(params || []);
}

/**
 * Dispatch a menu command. `command` is the registry key (from a ui:Component
 * `ui:name`); `params` is the args object. Bubbling + composed so one
 * document-level listener in the host app catches it.
 *
 * @param {HTMLElement} host
 * @param {string} command
 * @param {object} [params]
 */
export function dispatchCommand(host, command, params) {
  host.dispatchEvent(new CustomEvent('sol-command', {
    bubbles: true, composed: true,
    detail: { command, params: params || {}, source: host },
  }));
}

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

/**
 * Build a render closure for a ui:Component part. Placement is resolved from
 * the HTML at click time by the dispatcher (region= cascade off the host,
 * `data-for` claim by this item's id, or the host's own body as fallback).
 * Components default to keep-alive.
 *
 * @param {object} desc { id, name, tag, params }
 * @param {object} ctx  { host, baseUrl, sourceName, embedClass }
 * @returns {(body: HTMLElement) => void}
 */
export function renderComponentItem(desc, ctx) {
  return (body) => {
    const { id, name, tag, params } = desc;
    if (!tag) return;
    const ensure = (t) => ensureHandler(t, ctx.host, ctx.baseUrl, ctx.sourceName);
    ensure(tag);
    displayItem({
      launcher: ctx.host, id, name: name || id,
      tag, attrs: params, replace: false,
      embedClass: ctx.embedClass, fallbackEl: body, ensure,
    });
  };
}

/**
 * Build a render closure for a ui:Link part. A `ui:contents` literal is
 * injected as HTML; otherwise the `ui:href` is rendered by the origin-inferred
 * element (same-origin → trusted `sol-include`, external → `iframe`). A
 * non-default viewer is expressed as a `ui:Component`, not a handler.
 * Placement is resolved from the HTML by the dispatcher (region= / data-for).
 *
 * @param {object} desc { id, name, href, contents }
 * @param {object} ctx  { host, baseUrl, sourceName, embedClass }
 * @returns {(body: HTMLElement) => void}
 */
export function renderLinkItem(desc, ctx) {
  return (body) => {
    const { id, name, href, contents } = desc;
    const ensure = (t) => ensureHandler(t, ctx.host, ctx.baseUrl, ctx.sourceName);

    if (contents != null) {
      displayItem({
        launcher: ctx.host, id, name: name || id, contents,
        embedClass: ctx.embedClass, fallbackEl: body, ensure,
      });
      return;
    }
    if (!href) return;

    const { tag, attrs, replace } = contentForHref(href);
    ensure(tag);

    displayItem({
      launcher: ctx.host, id, name: name || id,
      tag, attrs, href, replace,
      embedClass: ctx.embedClass, fallbackEl: body, ensure,
    });
  };
}
