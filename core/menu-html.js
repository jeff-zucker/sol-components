// menu-html — harvest a declarative <sol-tabs> shell back into the menu model
// (the inverse of core/menu-generate.js). Used by the in-app tabs sync to fold a
// hand-edited html-first.html into the RDF: parse the file's <sol-tabs>, extract
// the #Tabs and #Bar items, then merge them into data/tabs.ttl with
// updateMenuInStore (which preserves pantry items + metadata).
//
// NOTE this reads the SOURCE markup (e.g. DOMParser'd file text), not the live
// rendered <sol-tabs> — sol-tabs harvests its anchors and resets its innerHTML on
// render, so the live element no longer holds the original children.
//
// Round-trip fidelity:
//   - Tabs are lossless: id, label (text), tag (data-handler), region, and every
//     attribute survive (source←href, id←id, data-*→param, plain attrs captured).
//   - Bar items are best-effort: emitBarItem does not write a non-button item's
//     label or its RDF fragment to HTML, so the label is recovered from `title`
//     and the fragment is re-minted from the label by updateMenuInStore. Editing
//     a non-button bar label by hand (diverging from its title) won't round-trip;
//     edit bar labels via the builder instead.

// `target` is the HTML spelling of a subset of ui:region (see display-target.js).
// Normalize the two that map cleanly; richer regions are written as region= and
// harvested by the `region` branch below.
function targetToRegion(v) {
  const t = (v || '').toLowerCase();
  if (t === '_blank') return 'tab';
  if (t === '_self') return 'inline';
  return null;
}

// Anchor attributes consumed structurally, not captured as a ui:attribute param.
const TAB_SKIP = new Set(['href', 'id', 'data-handler', 'region', 'target', 'data-tab-id']);

function extractTab(a) {
  const params = [];
  let tag = null;
  let region = null;
  for (const attr of a.attributes) {
    const n = attr.name;
    const v = attr.value;
    if (n === 'href') { params.push(['source', v]); continue; }
    if (n === 'id') { params.push(['id', v]); continue; }
    if (n === 'data-handler') { tag = v; continue; }
    if (n === 'region') { region = v.toLowerCase(); continue; }
    if (n === 'target') { const r = targetToRegion(v); if (r) region = r; continue; }
    if (TAB_SKIP.has(n)) continue;
    if (n.startsWith('data-')) { params.push([n.slice(5), v]); continue; }
    params.push([n, v]);                       // plain attr (rel, download, …) captured as-is
  }
  return {
    type: 'component',
    id: a.getAttribute('id') || undefined,
    name: (a.textContent || '').trim(),
    tag,
    region,
    params,
  };
}

function extractBarItem(el) {
  const params = [];
  let region = null;
  for (const attr of el.attributes) {
    const n = attr.name;
    const v = attr.value;
    if (n === 'region') { region = v.toLowerCase(); continue; }
    params.push([n, v]);                       // bar attrs are emitted/harvested verbatim
  }
  // emitBarItem only writes a sol-button's label as text; recover others from title.
  const name = (el.textContent || '').trim() || el.getAttribute('title') || '';
  return {
    type: 'component',
    id: undefined,                             // no id in bar HTML → updateMenuInStore mints one
    name,
    tag: el.tagName.toLowerCase(),
    region,
    params,
  };
}

/**
 * Harvest a <sol-tabs> element into `{ tabs, bar }` model arrays. Walks the
 * element's children up to the `<!-- chrome:begin -->` comment: `<a href>`
 * children (not slot="actions") are tabs, other elements before the chrome
 * marker are bar items. The chrome block and anything after it is left to the
 * generator to preserve verbatim.
 *
 * @param {Element} tabsEl a <sol-tabs> element (from parsed source markup)
 * @returns {{ tabs: object[], bar: object[] }}
 */
export function extractShell(tabsEl) {
  const tabs = [];
  const bar = [];
  if (!tabsEl) return { tabs, bar };
  for (const node of tabsEl.childNodes) {
    if (node.nodeType === 8 && /chrome:begin/.test(node.textContent || '')) break;  // comment
    if (node.nodeType !== 1) continue;                                              // element only
    const el = /** @type {Element} */ (node);
    if (el.tagName.toLowerCase() === 'a' && el.hasAttribute('href')
        && el.getAttribute('slot') !== 'actions') {
      tabs.push(extractTab(el));
    } else if (el.tagName.toLowerCase() !== 'a') {
      bar.push(extractBarItem(el));
    }
  }
  return { tabs, bar };
}

/**
 * Convenience: parse an html-first.html string and harvest its <sol-tabs>.
 * Browser/jsdom only (uses DOMParser). Returns `{ tabs, bar }` (empty if no
 * <sol-tabs> is found).
 *
 * @param {string} html
 * @returns {{ tabs: object[], bar: object[] }}
 */
export function extractFromHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const tabsEl = doc.querySelector('sol-tabs');
  return extractShell(tabsEl);
}
