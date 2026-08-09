// layout-generate — compile a ui:Layout tree (+ app metadata) into a full,
// readable standalone app page: index.html + app.css text (app-builder,
// 2026-07-19). Sibling of core/menu-generate.js one level up: that module
// emits the <sol-tabs> fragment from a menu model; this one emits the page
// shell from a layout model, rendering ui:Component leaves through the same
// emitBarItem() so what the page declares is exactly what menus declare.
//
// The RDF is the model; the EMITTED HTML is the artifact. Every element
// names its module / source / from-rdf in visible attributes — regions are
// never conjured from RDF at runtime. Menus stay runtime-rendered
// (sol-tabs/sol-menu from-rdf), so menu edits need no regeneration; only a
// LAYOUT change does.
//
// Tree semantics (see data/ui-vocab.ttl + shapes/ui.shacl):
//   ui:Layout  — a region whose members (positioned schema:itemListElement
//                wrappers, same idiom as menus) render SIMULTANEOUSLY; nested
//                layouts split it, ui:Component leaves are the content.
//                Absent ui:orientation defaults to VERTICAL (a page stacks;
//                menus default horizontal — different medium, different
//                natural axis). ui:columns N renders the parts as a grid.
//   semantic role — an xhv:role (the XHTML/RDFa `role` predicate, an ARIA
//                landmark token) maps to the native element (banner→header,
//                main→main, navigation→nav, contentinfo→footer,
//                complementary→aside, region→section) — the complete landmark
//                set. FALLBACK: a legacy schema:additionalType
//                (SiteNavigationElement→nav) and, for an unmarked region, the
//                root's first unmarked child → <main>. Everything else → <div>.
//   member types — a region's members dispatch on rdf:type: ui:Layout → nested
//                region; ui:Component → a mounted element; ui:Menu → a menu
//                component (sol-menu/sol-tabs) via from-rdf; ui:Link → its
//                schema:url as an include/iframe. (No raw URLs — a URL is
//                always the schema:url inside a Link/Component.)
//   schema:additionalProperty — pairs emitted verbatim on the region's element (class
//                merges with the structural app-row/app-col/app-grid-N; a
//                `role` that named a native element is dropped as redundant).

import { rdf } from './rdf.js';
import { menuMembers, rdfVal, rdfComponent, deriveTagFromModule, viewToken, MENU_VIEW_MOUNTS } from './menu-rdf.js';
import { emitBarItem, esc } from './menu-generate.js';

const UI     = 'http://www.w3.org/ns/ui#';
const RDF    = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS   = 'http://www.w3.org/2000/01/rdf-schema#';
const SCHEMA = 'http://schema.org/';
const XHV    = 'http://www.w3.org/1999/xhtml/vocab#';   // xhv:role — the `role` predicate

const SEMANTIC_TAGS = new Map([
  [SCHEMA + 'SiteNavigationElement', 'nav'],
]);

// ARIA landmark role (an xhv:role token on a region) → the native element that
// carries that role implicitly. This is the PREFERRED way to mark a region's
// semantics (complete — includes `main`, which schema.org's WebPageElement
// family lacks); the schema:additionalType SEMANTIC_TAGS above remain as a
// fallback for older layouts. `region` also requires an accessible name
// (aria-label) to be a landmark — the generator warns if absent.
const ROLE_TAGS = new Map([
  ['banner', 'header'],
  ['main', 'main'],
  ['navigation', 'nav'],
  ['contentinfo', 'footer'],
  ['complementary', 'aside'],
  ['region', 'section'],
]);

// Tags sol-basic already registers — kept in sync with web/sol-basic.js so
// data-components stays minimal (a stale entry only costs one redundant
// token; sol-load imports are idempotent).
const SOL_BASIC_TAGS = new Set([
  'sol-include', 'sol-button', 'sol-dropdown-button', 'sol-menu', 'sol-tabs',
  'sol-accordion', 'sol-rolodex', 'sol-settings-nav',
  'sol-default', 'sol-modal', 'sol-window',
]);

const sym = (iri) => rdf.sym(iri);
const val = (store, subj, iri) => (store.any(subj, sym(iri)) || {}).value || null;

function isType(store, node, typeIri) {
  return store.each(node, sym(RDF + 'type'), null).some((t) => t.value === typeIri);
}

// The kind of a ui:Plugin member (its schema:additionalType — ui:Link etc.).
const pluginKind = (store, node) => val(store, node, SCHEMA + 'additionalType');
const fragmentOf = (iri) => { const i = (iri || '').indexOf('#'); return i >= 0 ? iri.slice(i + 1) : null; };

// Re-relativize an href the Turtle parser resolved to absolute back to a
// doc-relative path (so emitted markup stays origin-portable, matching how the
// doc authored it). External / unparseable hrefs pass through unchanged.
function relativize(href, baseUrl) {
  if (!baseUrl) return href;
  let u, b;
  try { u = new URL(href, baseUrl); b = new URL(baseUrl); } catch { return href; }
  if (u.origin !== b.origin) return href;
  const dir = b.pathname.replace(/[^/]*$/, '');   // base's directory
  const path = u.pathname.startsWith(dir) ? u.pathname.slice(dir.length) : u.pathname;
  return path + u.search + u.hash;
}

// A ui:Link member's content, chosen by URL at BUILD time. "External" means a
// DIFFERENT origin than where the app is served (the layout doc's `baseUrl`) —
// it frames as an <iframe> with the absolute URL; same-origin content
// transcludes via <sol-include> with a doc-relative source. Same element
// choice a menu's ui:Link makes at runtime (display-target's contentForHref),
// so a link renders the same in a layout or a menu. Without a baseUrl, an
// absolute http(s) URL is assumed external.
function contentForHrefBuild(href, baseUrl) {
  let external = false;
  try {
    const u = new URL(href, baseUrl || undefined);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      external = baseUrl ? u.origin !== new URL(baseUrl).origin : true;
    }
  } catch { external = false; }   // relative with no base → same-origin
  if (external) return { tag: 'iframe', attrs: [['src', href]] };
  const src = relativize(href, baseUrl);
  return { tag: 'sol-include', attrs: [['source', src], ['endpoint', src], ['trusted', 'true']] };
}

/**
 * Parse a ui:Layout node (and its subtree) into a plain description:
 *   { kind:'region', node, label, comment, orientation, columns, params,
 *     semantic, parts: [region|leaf …] }
 *   { kind:'leaf', item:{type:'component', tag, params, name, comment}, url }
 */
export function parseLayoutTree(store, node) {
  const kind = pluginKind(store, node);   // schema:additionalType of a ui:Plugin, or null
  const comment = val(store, node, RDFS + 'comment');

  // A mounted custom element: a ui:Component class, or a ui:Plugin of kind
  // ui:Component. The element tag derives from schema:url (rdfComponent).
  if (isType(store, node, UI + 'Component') || kind === UI + 'Component') {
    const { tag, params } = rdfComponent(store, node);
    return {
      kind: 'leaf',
      node,
      url: val(store, node, SCHEMA + 'url'),
      item: { type: 'component', tag, params, name: rdfVal(store, node, 'label') || '', comment },
    };
  }
  // A ui:Menu member → rendered by a menu component via from-rdf; its declared
  // ui:view picks the mount, else the containing region's role infers one.
  if (isType(store, node, UI + 'Menu')) {
    return { kind: 'menu', node, fragment: fragmentOf(node.value), comment,
      view: viewToken(rdfVal(store, node, 'view')) };
  }
  // A ui:Link member (class, or a ui:Plugin of kind ui:Link) → its schema:url,
  // resolved to an include/iframe at emit time.
  if (isType(store, node, UI + 'Link') || kind === UI + 'Link') {
    return { kind: 'link', node, url: val(store, node, SCHEMA + 'url'), label: rdfVal(store, node, 'label'), comment };
  }
  // A ui:Command has no persistent content — meaningless as layout content.
  if (isType(store, node, UI + 'Command') || kind === UI + 'Command') {
    return { kind: 'skip', node };
  }

  const orientationIri = rdfVal(store, node, 'orientation');
  const columns = rdfVal(store, node, 'columns');
  const params = store.each(node, sym(SCHEMA + 'additionalProperty'), null)
    .map((p) => [
      (store.any(p, sym(SCHEMA + 'name')) || {}).value || '',
      (store.any(p, sym(SCHEMA + 'value')) || {}).value || '',
    ])
    .filter(([k]) => k);
  // A region's ARIA landmark role is a first-class xhv:role (the XHTML/RDFa
  // `role` predicate) — NOT an additionalProperty attribute (role selects the
  // element, so it is semantics, not a passthrough attr).
  const role = val(store, node, XHV + 'role');
  const additionalTypeIri = val(store, node, SCHEMA + 'additionalType');
  return {
    kind: 'region',
    node,
    label: rdfVal(store, node, 'label'),
    comment,
    orientation:
      orientationIri && orientationIri.endsWith('Horizontal') ? 'horizontal' : 'vertical',
    columns: columns ? parseInt(columns, 10) : null,
    role,
    // The emitted element: a `role` wins (complete ARIA set incl. main), else
    // the legacy schema:additionalType, else decided by emitRegion (div/main).
    roleTag: (role && ROLE_TAGS.get(role)) || null,
    additionalTypeIri,
    semantic: SEMANTIC_TAGS.get(additionalTypeIri) || null,
    // The resolved native element (header/main/nav/footer/aside/section) from
    // role or the legacy additionalType — what consumers (the builder's
    // schematic + region badges) key off, independent of which mark set it up.
    tag: (role && ROLE_TAGS.get(role)) || SEMANTIC_TAGS.get(additionalTypeIri) || null,
    params,
    parts: menuMembers(store, node).map((el) => parseLayoutTree(store, el)),
  };
}

// Every non-region node in the tree (component leaves, menu / link members).
const walkLeaves = (tree, out = []) => {
  if (tree.kind === 'region') tree.parts.forEach((p) => walkLeaves(p, out));
  else out.push(tree);
  return out;
};

// The structural class carrying a region's flow: grid beats orientation.
const structuralClass = (region) =>
  region.columns ? `app-grid-${region.columns}` : region.orientation === 'horizontal' ? 'app-row' : 'app-col';

// `from-rdf` values of every menu-consuming node — the menu docs the app needs
// seeded (builder uses this to know which fragments to create). Both a
// component leaf carrying a `from-rdf` param and a ui:Menu member (whose
// fragment IS the source) count.
export function menuSourcesIn(tree) {
  const out = new Set();
  for (const l of walkLeaves(tree)) {
    if (l.kind === 'leaf') {
      l.item.params.filter(([k]) => k === 'from-rdf').forEach(([, v]) => out.add(v));
    } else if (l.kind === 'menu') {
      out.add(l.fragment ? `#${l.fragment}` : l.node.value);
    }
  }
  return [...out];
}

// A region is "marked" when it names its own element — by a `role` (preferred)
// or a legacy schema:additionalType. Marked regions are NOT eligible for the
// first-unmarked-<main> fallback, so a fully role-tagged layout never
// auto-claims a <main>: main comes only from role="main".
const isMarked = (region) => !!(region.roleTag || region.semantic);

// Elements that ARE ARIA landmarks — the only ones a ui:label is emitted onto
// as aria-label (a <section> becomes a landmark once it has that name). A plain
// <div> is not a landmark, so a name on it would be inert.
const LANDMARK_TAGS = new Set(['header', 'nav', 'main', 'footer', 'aside', 'section']);

function emitRegion(region, { depth, isMain, warn, baseUrl }) {
  // <main> fallback (legacy / unmarked layouts only): the first UNMARKED region
  // on the primary path becomes <main> unless it wraps nested regions, in which
  // case the claim descends to its first unmarked region child.
  const wraps = isMain && region.parts.some((p) => p.kind === 'region');
  const pad = '  '.repeat(depth);
  const tag = region.roleTag || region.semantic || (isMain && !wraps ? 'main' : 'div');
  const attrs = new Map(region.params);
  // A native landmark element carries its ARIA role implicitly — drop the now
  // -redundant `role` attribute. (An unrecognised role falls through to <div>
  // and its `role` attr is kept, so e.g. role="search" still emits.)
  if (region.roleTag) attrs.delete('role');
  // The main region is the skip link's target, so it needs an id.
  if (tag === 'main' && !attrs.get('id')) attrs.set('id', 'content');
  // A region's ui:label IS its accessible name: emit it as aria-label on the
  // LANDMARK element, unless an explicit aria-label / aria-labelledby already
  // names it (the explicit attribute wins). Skipped on a plain <div> (not a
  // landmark — a name there is inert for AT). The root layout is the <body>
  // (emitted by the caller) and never reaches here, so its label is not emitted.
  if (LANDMARK_TAGS.has(tag) && region.label
      && !attrs.get('aria-label') && !attrs.get('aria-labelledby')) {
    attrs.set('aria-label', region.label);
  }
  // `region` / <section> is a landmark only when it has an accessible name.
  if (region.role === 'region' && !attrs.get('aria-label') && !attrs.get('aria-labelledby')) {
    warn(`region ${region.node.value} has role="region" but no aria-label — it will not be a landmark`);
  }
  const cls = [attrs.get('class'), structuralClass(region)].filter(Boolean).join(' ');
  attrs.delete('class');
  let open = `${pad}<${tag} class="${esc(cls)}"`;
  for (const [k, v] of attrs) open += v === '' ? ` ${k}` : ` ${k}="${esc(v)}"`;
  open += '>';

  let out = region.comment ? `${pad}<!-- ${region.comment} -->\n` : '';
  out += `${open}\n`;
  let claimLeft = wraps;
  for (const part of region.parts) {
    if (part.kind === 'region') {
      const childIsMain = claimLeft && !isMarked(part);
      if (childIsMain) claimLeft = false;
      out += emitRegion(part, { depth: depth + 1, isMain: childIsMain, warn, baseUrl });
    } else {
      out += emitPart(part, depth, region.role, warn, baseUrl);
    }
  }
  // A sidebar collapses: the control sits in its OUTER bottom corner and is
  // part of the emitted markup (web/scripts/app-commands.js drives it).
  if (tag === 'aside') {
    out += `${pad}  <button type="button" class="app-rail-toggle" aria-expanded="true"`
      + ` aria-label="Collapse ${esc(region.label || 'sidebar')}">`
      + `${cls.includes('app-side-right') ? '›' : '‹'}</button>\n`;
  }
  out += `${pad}</${tag}>\n`;
  return out;
}

// Emit a non-region member (component leaf, ui:Menu, ui:Link) inside a region
// at `depth`. Component leaves keep going through menu-generate's emitBarItem
// (page markup === menu markup); menu/link members are resolved to their
// element here. `parentRole` lets a menu pick its presentation.
function emitPart(part, depth, parentRole, warn, baseUrl) {
  if (part.kind === 'skip') { warn(`ui:Command ${part.node.value} skipped — commands are not layout content`); return ''; }
  if (part.kind === 'leaf') {
    // emitBarItem output is 2-space indented; add `depth` levels to nest it.
    const html = emitBarItem(part.item, warn);
    return html ? html.replace(/^(?!\s*$)/gm, '  '.repeat(depth)) : '';
  }
  const indent = '  '.repeat(depth + 1);
  const lead = part.comment ? `${indent}<!-- ${esc(part.comment)} -->\n` : '';
  if (part.kind === 'menu') {
    // The menu's declared ui:view picks the mount. A view-less menu falls back
    // to role inference: in a `navigation` region it reads as a nav list
    // (sol-menu), elsewhere as a tabset (sol-tabs). from-rdf points the
    // component at the menu doc.
    const mount = part.view ? MENU_VIEW_MOUNTS[part.view] : null;
    if (part.view && !mount) warn(`menu ${part.node.value} declares ui:${part.view} — no renderer for that view yet, using the region-role fallback`);
    const tag = mount ? mount.tag : (parentRole === 'navigation' ? 'sol-menu' : 'sol-tabs');
    const cls = mount && mount.class ? ` class="${esc(mount.class)}"` : '';
    const from = part.fragment ? `#${part.fragment}` : part.node.value;
    return `${lead}${indent}<${tag}${cls} from-rdf="${esc(from)}"></${tag}>\n`;
  }
  if (part.kind === 'link') {
    if (!part.url) { warn(`ui:Link ${part.node.value} has no schema:url`); return ''; }
    const { tag, attrs } = contentForHrefBuild(part.url, baseUrl);
    let s = `${lead}${indent}<${tag}`;
    for (const [k, v] of attrs) s += v === '' ? ` ${k}` : ` ${k}="${esc(v)}"`;
    s += `></${tag}>\n`;
    return s;
  }
  return '';
}

const emojiFavicon = (icon) =>
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${icon}</text></svg>`,
  );

/**
 * Emit the full standalone index.html for an app.
 *
 * @param {object} o
 * @param {object} o.store       rdflib store holding the layout doc
 * @param {object} o.layoutNode  the root ui:Layout node (rdf.sym)
 * @param {object} [o.app]       { title, icon } — from the app.ttl node
 * @param {string} [o.componentsBase]  where sol-components is served from;
 *                 same-origin /node_modules default, or a pinned CDN base
 * @param {(msg:string)=>void} [o.warn]
 */
export function generateAppHtml({
  store,
  layoutNode,
  app = {},
  componentsBase = '/node_modules/sol-components',
  baseUrl = null,
  warn = () => {},
}) {
  const lang = app.lang || 'en';
  const tree = parseLayoutTree(store, layoutNode);
  // Only component leaves carry a module tag; menu/link members resolve to
  // sol-basic elements (sol-menu/sol-tabs/sol-include), so they need no token.
  const componentLeaves = walkLeaves(tree).filter((l) => l.kind === 'leaf');

  // sol-* tags boot via sol-load's data-components; anything else names its
  // module in a visible <script type="module"> of its own.
  const solTags = [...new Set(
    componentLeaves.map((l) => l.item.tag).filter((t) => t && t.startsWith('sol-') && !SOL_BASIC_TAGS.has(t)),
  )];
  const foreign = componentLeaves.filter((l) => l.item.tag && !l.item.tag.startsWith('sol-') && l.url);

  const title = app.title || 'App';
  const icon = app.icon || null;
  const iconHref = icon
    ? /^(https?:)?\//.test(icon) ? icon : emojiFavicon(icon)
    : null;

  let head = `  <meta charset="utf-8">\n`;
  head += `  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n`;
  head += `  <title>${esc(title)}</title>\n`;
  if (iconHref) head += `  <link rel="icon" href="${esc(iconHref)}">\n`;
  head += `  <link rel="stylesheet" href="${esc(componentsBase)}/web/styles/root.css">\n`;
  head += `  <link rel="stylesheet" href="app.css">\n`;
  // Standard app chrome: prefs.js re-applies the saved theme/text size before
  // first paint; app-commands.js implements the theme ☰ menu's standard
  // commands (toggleTheme / cycleFontSize) via the sol-command registry.
  head += `  <script src="${esc(componentsBase)}/web/scripts/prefs.js"></script>\n`;
  head += `  <script src="${esc(componentsBase)}/web/scripts/app-commands.js"></script>\n`;
  head += `  <script src="${esc(componentsBase)}/web/sol-load.js"\n`;
  head += `          data-components="${esc(['sol-basic', ...solTags].join(' '))}"></script>\n`;
  for (const f of foreign) {
    head += `  <script type="module" src="${esc(f.url)}"></script>\n`;
  }

  // The root layout IS the body: its structural class goes on <body>, its
  // children emit directly (bodyFromTree). The first unmarked layout child is
  // the page's primary content and emits <main>.
  // The root layout IS the <body>: its class + any other attributes ride onto
  // <body>. Its ROLE is ignored — <body> is implicitly the document, and
  // document/application are the only roles it could carry (the region→element
  // mapping doesn't apply to the page container).
  const rootAttrs = new Map(tree.params);
  const rootCls = [rootAttrs.get('class'), structuralClass(tree)].filter(Boolean).join(' ');
  rootAttrs.delete('class');
  rootAttrs.delete('role');
  let bodyOpen = `<body class="${esc(rootCls)}"`;
  for (const [k, v] of rootAttrs) bodyOpen += v === '' ? ` ${k}` : ` ${k}="${esc(v)}"`;
  bodyOpen += '>';
  const body = bodyFromTree(tree, warn, baseUrl);
  // A keyboard user meets the header, its menu and the rail toggle before the
  // content; the skip link (visible on focus) lets them jump past all of it.
  const skip = `  <a class="skip-link" href="#content">Skip to content</a>`;

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
${head}</head>
${bodyOpen}
${skip}
${body}
</body>
</html>
`;
}

// Emit a root layout's CHILDREN (nav/header/main/…/component leaves) — the
// inner body markup, without the <body> wrapper. Shared by generateAppHtml
// (whole standalone page) and generateLayoutBody (a body FRAGMENT for a host
// that keeps its own <head> and <body> tag, e.g. dk splicing its shell region
// into a hand-authored index.html).
// True when a role="main" appears anywhere in the tree.
const anyExplicitMain = (r) =>
  r.kind === 'region' && (r.roleTag === 'main' || r.parts.some(anyExplicitMain));

function bodyFromTree(tree, warn, baseUrl) {
  // The positional "first unmarked region → <main>" fallback is LEGACY — it
  // must not fire once a layout declares its main explicitly (role="main"),
  // or an unmarked sibling (e.g. dk's menu-pane) would become a second <main>.
  let mainClaimed = anyExplicitMain(tree);
  let out = '';
  for (const part of tree.parts) {
    if (part.kind === 'region') {
      const isMain = !isMarked(part) && !mainClaimed;
      if (isMain) mainClaimed = true;
      out += '\n' + emitRegion(part, { depth: 1, isMain, warn, baseUrl });
    } else {
      const html = emitPart(part, 0, tree.role || null, warn, baseUrl);
      if (html) out += '\n' + html;
    }
  }
  return out;
}


/**
 * Emit just the body region tree of a ui:Layout — the inner markup (nav / main
 * / component leaves), NOT a whole page. For a host that keeps its own <head>
 * and <body> (dk splices this into index.html between markers); the root
 * layout's own structural class is dropped since there is no <body> to carry
 * it (host-owned, and app-col/app-row are inert without the compiler's app.css).
 *
 * @param {object} o
 * @param {object} o.store       rdflib store holding the layout doc
 * @param {object} o.layoutNode  the root ui:Layout node (rdf.sym)
 * @param {(msg:string)=>void} [o.warn]
 * @returns {string} the body fragment (leading newline, no trailing newline)
 */
export function generateLayoutBody({ store, layoutNode, baseUrl = null, warn = () => {} }) {
  return bodyFromTree(parseLayoutTree(store, layoutNode), warn, baseUrl).replace(/\s+$/, '');
}

/**
 * Emit the app's stylesheet: structural flow classes actually used by the
 * tree plus minimal scaffolding. Arrangement CSS lives HERE (hand-editable),
 * not in RDF — the vocabulary carries only orientation and columns.
 */
export function generateAppCss(storeOrTree, layoutNode = null) {
  const tree = layoutNode ? parseLayoutTree(storeOrTree, layoutNode) : storeOrTree;
  const grids = new Set();
  (function walk(r) {
    if (r.kind !== 'region') return;
    if (r.columns) grids.add(r.columns);
    r.parts.forEach(walk);
  })(tree);

  let css = `/* Generated by sol-components layout-generate — hand-editable. */
html, body { height: 100%; }
/* root.css defines the theme vars; the page applies them (data-theme flips
   them, driven by the ☰ menu's toggleTheme command). */
/* The text size lands on the ROOT: the page and its components size themselves
   in rem, which is relative to html — on body it would leave them all fixed. */
html { background: var(--bg); color: var(--text); font-size: var(--font-size); }
body { margin: 0; min-height: 100dvh; overflow: hidden;
       font-family: var(--font-ui); }
/* Off-screen until focused, then it drops into the top-left corner. */
.skip-link {
  position: absolute; left: .5rem; top: -3rem; z-index: 1000;
  padding: .4rem .8rem; border-radius: .3rem;
  background: var(--accent, #1F618D); color: #fff; text-decoration: none;
  transition: top .15s;
}
.skip-link:focus { top: .5rem; }
.app-row { display: flex; flex-direction: row; align-items: center; gap: .5rem; }
.app-col { display: flex; flex-direction: column; }
/* Scroll lives on the content pane, never the page. */
main { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1rem 1.25rem; }
nav, aside { padding: .5rem 1rem; }
/* min-height, not a fixed height: at a larger text size the band grows with
   its content instead of clipping it. */
header { min-height: 4rem; box-sizing: border-box; padding: .25rem 1rem; }
footer { min-height: 3rem; box-sizing: border-box; padding: .25rem 1rem; }
/* Chrome: the bands read as bands. Surface against the page's --bg, with a
   rule between each and the content. */
header { background: var(--surface); border-bottom: 1px solid var(--border); }
footer { background: var(--surface); border-top: 1px solid var(--border);
         color: var(--text-muted); }
nav    { background: var(--surface); border-bottom: 1px solid var(--border); }
aside  { background: var(--surface); }
/* No rule between a left rail and main — the surfaces already differ. */
.app-side-right { border-left: 1px solid var(--border); }
/* Only the MIDDLE band grows — the band is a <section> (sidebars + main) or a
   bare <main>. The banner, nav and footer carry .app-row too, so growing by
   that class would split the page into equal thirds. */
body.app-col > section.app-row,
body.app-col > main { flex: 1 1 auto; min-height: 0; align-items: stretch; }
body.app-col > header,
body.app-col > nav,
body.app-col > footer { flex: 0 0 auto; }
/* Rem, not px: the rail scales with the text size instead of clipping it. */
aside { flex: 0 0 21rem; overflow: auto; position: relative; padding-bottom: 2.6rem; }
/* Collapse control: the rail's outer bottom corner. */
.app-rail-toggle {
  position: absolute; bottom: .5rem; width: 1.8rem; height: 1.8rem; line-height: 1;
  font: inherit; font-size: 1rem; cursor: pointer;
  border: 1px solid var(--border); border-radius: .3rem;
  background: var(--bg); color: var(--text);
}
aside:not(.app-side-right) .app-rail-toggle { left: .5rem; }
.app-side-right .app-rail-toggle { right: .5rem; }
aside.app-rail-collapsed { flex-basis: 2.8rem; overflow: hidden; }
aside.app-rail-collapsed > *:not(.app-rail-toggle) { display: none; }
/* Content the regions transclude brings its own headings and paragraph
   margins; in a bar those inflate its height, so the bar sets the type. The
   banner is the largest thing on the page — a page heading sits under it. */
header :is(h1, h2, h3, p), nav :is(h1, h2, h3, p), footer :is(h1, h2, h3, p) { margin: 0; }
/* The banner's content IS the app title, whatever tag it was written with. */
header :is(h1, h2, h3, strong, b) {
  font-size: 2.4em; line-height: 1.2; font-weight: 700; color: #b45309;
}
/* Headings carry the app's accent-warm colour. */
h1, h2, h3 { color: #b45309; }
[data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3,
[data-theme="dark"] header :is(strong, b) { color: #fb923c; }
main :is(h1, h2) { font-size: 1.2em; }
main > :first-child { margin-top: 0; }
/* Theme chrome: the banner's ☰ sits at the right end of the bar. */
.app-banner > sol-dropdown-button:last-child { margin-left: auto; }
/* A button bar in the banner is pushed to the right (just left of the ☰) —
   the pair travels together, so only the first of them takes the free space. */
.app-banner .app-bar { margin-left: auto; }
.app-banner .app-bar ~ sol-dropdown-button { margin-left: .5rem; }
/* The banner's controls are one set: the bar's buttons and the ☰ read at the
   same size and weight. Both live in a shadow tree — the bar's buttons take
   their size from --font-size, the ☰'s trigger inherits its host's font. */
.app-banner .app-bar { --font-size: 1.4rem; font-weight: 700; }
.app-banner > sol-dropdown-button { font-size: 1.4rem; font-weight: 700; }
`;
  for (const n of [...grids].sort()) {
    css += `.app-grid-${n} { display: grid; grid-template-columns: repeat(${n}, minmax(0, 1fr)); gap: 1rem; }\n`;
  }
  return css;
}

/**
 * Seed Turtle for an app menu doc fragment (the doc a layout's `from-rdf`
 * names). The managers rewrite it from here on; this is only the newborn
 * form. Turtle template rather than the serializer: seeding predates any
 * store/doc to rewrite, and presets ship as authored TTL the same way.
 */
export function seedAppMenu({ label = 'Tabs', fragment = 'Tabs', orientation = 'Horizontal', view = null } = {}) {
  return `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .

# The app's menu — edit via the builder's menu step (or any sol-menu-manager).
# Members arrive as positioned schema:ListItem wrappers (schema:itemListElement);
# a newborn menu simply has none yet.
:${fragment} a ui:Menu ;
  ui:label "${label.replace(/"/g, '\\"')}" ;${view ? `
  ui:view ui:${view} ;` : ''}
  ui:orientation ui:${orientation} .
`;
}

export { deriveTagFromModule };
