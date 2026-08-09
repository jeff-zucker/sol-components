/**
 * <sol-app-builder> — build a standalone app on your pod (app-builder,
 * 2026-07-19). A built app is a pod folder holding readable artifacts:
 *
 *   app.ttl      the app node (schema:WebApplication; name, icon, ui:layout)
 *   layout.ttl   the ui:Layout tree (composed on creation, then editable)
 *   app-menu.ttl the app's menu doc(s) the layout's from-rdf names
 *   index.html   GENERATED from the layout (core/layout-generate.js) — every
 *                element names its module / source / from-rdf visibly
 *   app.css      generated structural CSS (hand-editable)
 *
 *   <sol-app-builder apps-root="/dk-pod/apps/"
 *       catalog="…/plugins-catalog.ttl#Available"></sol-app-builder>
 *
 * Attributes:
 *   apps-root       — container the app folders live in (required). The
 *                     folder IS the registry: a child container holding an
 *                     app.ttl with a schema:WebApplication is an app.
 *   catalog         — plugin catalog (ui:Menu of ui:Plugin entries). Powers
 *                     the plugins pantry (steps 1–2), region drops, and the
 *                     "Add to catalog" publish action. Optional; without it
 *                     those affordances hide.
 *   controls        — CSS selector for an element that receives the top row
 *                     (the app picker, the app's name, and the buttons acting
 *                     ON the app), so a host page can seat them in its own
 *                     header beside its title. Absent: they render in place.
 *   components-base — where generated pages load sol-components from.
 *                     Default /node_modules/sol-components (same-origin);
 *                     set a pinned CDN base for portable app folders.
 *
 * ONE screen. A top row picks the app — Create new app / Edit existing app —
 * and, once one is in play, names it beside buttons for what you can do TO it:
 * edit its metadata (the catalog entry, against :PluginShape) and preview the
 * generated page. Everything else happens in two columns over the POD DOCS,
 * which are the state:
 *   left   — the layout's regions, each a card holding what it carries as
 *            chips (menus, content links, plugins) and taking drops. ✕ removes
 *            a chip or a whole region; a removed region is offered back.
 *   right  — what you can place: Interface elements (menus, bars, and the
 *            standard content links the layout lacks), HTML Content (mint a
 *            new file), and the plugin catalog. Dropping on a MENU chip puts
 *            the item in that menu's document instead of the region; clicking
 *            a menu chip opens its editor (its kind's shape + its items).
 * Saves rewrite layout.ttl via core/layout-serialize.js, and index.html +
 * app.css follow on every save.
 * Renders in LIGHT DOM: the embedded managers pair with the
 * pantry via its `for` selector, which only sees the page DOM.
 *
 * All writes go through solFetch (gate token). No new RDF terms here —
 * layout vocabulary in data/ui-vocab.ttl, shapes in shapes/ui.shacl.
 */

import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';
import { rdf } from '../core/rdf.js';
import { loadRdfStore } from '../core/rdf-utils.js';
import { rdfVal, menuMembers, rdfComponent } from '../core/menu-rdf.js';
import { mintFragment } from '../core/menu-serialize.js';
import { solFetch } from '../core/auth-fetch.js';
import { fetchContainer, deleteFolder } from '../core/pod-ops.js';
import { resolveEditorSpec, buildEditorElement } from '../core/editor.js';
import {
  parseLayoutTree, generateAppHtml, generateAppCss, seedAppMenu, deriveTagFromModule,
} from '../core/layout-generate.js';
import {
  serializeLayout, addLeaf, addLink, removeLeaf, moveNode, removeRegion, insertPart,
  findParentOf, usedTreeFragments,
} from '../core/layout-serialize.js';
import { composeLayoutTurtle, menuOrientationFor } from '../core/layout-compose.js';

const freshFetch = (url, opts) => solFetch(url, { ...(opts || {}), cache: 'no-store' });

const UI     = 'http://www.w3.org/ns/ui#';
const SCHEMA = 'http://schema.org/';
// The drag payload MIME for the Edit-Interface step (list feature / chip
// move). The Add-Plugins pantry uses its own PLUGIN_MIME contract separately.
const SAB_MIME = 'application/x-sab-feature';
// The catalog pantry's own drag contract (sol-menu-manager exports it) — a
// plugin card dropped onto a region on the Add/Edit Features step.
const PLUGIN_MIME = 'application/x-sol-plugin';

// The shipped shape contract: a chip's editor picks the shape whose
// sh:targetClass matches the item's rdf:type (ui:Link → :LinkShape,
// ui:Component → :ComponentShape).
const EDIT_SHAPE_URL = new URL('../shapes/ui.shacl', import.meta.url).href;

const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// One instance id per builder on the page, so ids it mints (tabs, panels, the
// drag-and-drop help text) stay unique when two builders share a document.
let SAB_SEQ = 0;

const slugify = (name) =>
  String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';

// Every app starts from the same full layout — header, both sidebars, main and
// footer, all present as areas the owner strips down with each area's ✕. The
// button bar is NOT one of them: it's a list feature, added where wanted.
const DEFAULT_LAYOUT = {
  sidebars: 'both', footer: true, menuLocation: 'header',
  buttonBar: 'header', hamburger: true,
};

// The areas a layout can hold, and where each belongs. The Interface-elements
// list offers whichever of these the layout is currently WITHOUT — read
// from the layout itself, so a removed area is still on offer after a reload.
// Main is not here: it always stays.
const STANDARD_AREAS = [
  { key: 'Header', label: 'Header', role: 'banner', cls: 'app-banner',
    orientation: 'horizontal', band: 'root' },
  { key: 'Left', label: 'Left sidebar', role: 'complementary', cls: 'app-side-left',
    band: 'middle' },
  { key: 'Right', label: 'Right sidebar', role: 'complementary', cls: 'app-side-right',
    band: 'middle' },
  { key: 'Footer', label: 'Footer', role: 'contentinfo', cls: 'app-footer',
    orientation: 'horizontal', band: 'root' },
];

// An IRI inside an attribute selector — quoted, since it carries # and /.
const cssQuote = (v) => String(v).replace(/["\\]/g, '\\$&');

// An IRI folded into a usable id-attribute fragment (for aria-controls, which
// points by id): non-word characters to hyphens.
const cssId = (v) => String(v).replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');

// A chip's own label, without the ✕ button's glyph — for announcements.
const chipText = (chip) => (chip.firstChild && chip.firstChild.textContent || chip.textContent).trim();

// The four things you do to an app, each rendering into the work area. The
// tabs sit in the top row; picking an app opens on Metadata.
const TABS = [
  { key: 'meta', label: 'Metadata' },
  { key: 'features', label: 'Add Features' },
  { key: 'customize', label: 'Customize' },
  { key: 'preview', label: 'Preview' },
];

// One entry per menu-capable ui:view with a renderer: the Add-Features chip,
// the component leaf it mounts (pre/post params around the from-rdf), the
// seeded menu head, and the surface that edits it. The menu doc's ui:view
// triple is the source of truth; everything here derives from it.
const MENU_VIEWS = {
  Menubar: { label: 'Menubar', icon: '🗂', frag: 'Menubar', file: 'sol-menu.js',
    pre: [], post: [], orientation: 'Horizontal',
    manager: 'sol-menu-manager', shape: 'MenubarMenuShape' },
  MenuButton: { label: 'Button Menu', icon: '☰', frag: 'Menu', file: 'sol-dropdown-button.js',
    pre: [['label', '☰']], post: [], orientation: 'Vertical',
    manager: 'sol-menu-manager', shape: 'MenuButtonMenuShape' },
  Tablist: { label: 'Tabbed Menu', icon: '🗂', frag: 'Tabs', file: 'sol-tabs.js',
    pre: [['keep-alive', '']], post: [], orientation: 'Horizontal',
    manager: 'sol-menu-manager', shape: 'TablistMenuShape' },
  Toolbar: { label: 'Button bar', icon: '🔘', frag: 'Bar', file: 'sol-menu.js',
    pre: [], post: [['class', 'app-bar']], orientation: 'Horizontal',
    manager: 'sol-button-bar-manager', shape: 'ToolbarMenuShape' },
  Tree: { label: 'Tree Menu', icon: '🌳', frag: 'Tree', file: 'sol-menu.js',
    pre: [], post: [], orientation: 'Vertical',
    manager: 'sol-menu-manager', shape: 'TreeMenuShape' },
};

// A content item is a ui:Link naming an html file (the site title, the footer,
// any Content the owner added) — the app's own text, not a foreign page.
const isContentUrl = (url) => !!url && /\.html?($|[?#])/i.test(String(url));

const STARTER_FOOTER = `<p>Built with the Solid App Builder.</p>
`;

const STARTER_CONTENT = `<h1>Hello</h1>
<p>New content — edit it here, or with Live Edit in the pod browser.</p>
`;

const STARTER_START_PAGE = `<h1>Welcome</h1>
<p>This is your app's start-page.html — what the main pane shows until a menu
item opens something into it.</p>
`;

// The banner names the APP. (The two spellings the builder used to seed are
// recognised as "untouched", so an older app's banner can take its name.)
const siteTitleFor = (name) => `<h1>${escHtml(name)}</h1>\n`;
const STOCK_SITE_TITLES = ['<strong>My App</strong>', '<h1>My App</h1>'];
// A banner the builder itself wrote — the stock text, or either spelling of a
// name the app has been called. Anything else is the owner's own text.
const isSeededBanner = (text, names) => STOCK_SITE_TITLES.includes(text)
  || names.filter(Boolean).some((n) => text === `<h1>${escHtml(n)}</h1>`
    || text === `<strong>${escHtml(n)}</strong>`);

// app.ttl: the app node, written whole — the builder owns this file.
const appTurtle = (name, icon) => `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .

:app a schema:WebApplication ;
  schema:name "${String(name).replace(/"/g, '\\"')}" ;${icon ? `
  ui:icon "${String(icon).replace(/"/g, '\\"')}" ;` : ''}
  ui:layout <layout.ttl#Layout> .
`;

// The standard page links — the app's own html content. Like the areas, the
// list offers whichever the layout is WITHOUT, read from the layout itself, so
// the offer survives a reload. Unlike areas they go wherever they're dropped.
const STANDARD_LINKS = [
  { key: 'SiteTitle', label: 'Site Banner', file: 'site-title.html',
    comment: "The site title / banner, from the app's own site-title.html" },
  { key: 'StartPage', label: 'Start Page', file: 'start-page.html',
    comment: "What the main pane shows before a menu item opens into it, from the app's own start-page.html" },
  { key: 'FooterContent', label: 'Footer', file: 'footer.html',
    comment: "The footer, from the app's own footer.html" },
  { key: 'HelpPage', label: 'Help Page', file: 'help.html',
    comment: "The app's help page, from its own help.html" },
];

const starterFor = (file) => ({
  'start-page.html': STARTER_START_PAGE,
  'footer.html': STARTER_FOOTER,
}[file] || '');

// Is this link already somewhere in the layout? Matched on the file it names,
// so a renamed fragment or label still counts.
function hasLink(tree, file) {
  let found = false;
  (function walk(n) {
    if (!n || found) return;
    if (n.kind === 'link') { found = String(n.url || '').split('/').pop() === file; return; }
    if (n.kind === 'region') n.parts.forEach(walk);
  })(tree);
  return found;
}

const classOf = (region) => new Map(region.params || []).get('class') || '';

// A sidebar is told apart by its class (both sides share role complementary);
// header and footer by their landmark role.
const isArea = (region, spec) => (spec.cls.startsWith('app-side')
  ? classOf(region).includes(spec.cls)
  : region.role === spec.role);

function findArea(tree, spec) {
  let hit = null;
  (function walk(r) {
    if (!r || r.kind !== 'region' || hit) return;
    if (isArea(r, spec)) { hit = r; return; }
    r.parts.forEach(walk);
  })(tree);
  return hit;
}

// help.html is opened as a PAGE (the ☰ Help link), so it's a whole document.
// The help page — a FRAGMENT, like the other seeded content: it opens into the
// main pane, so a whole document's <style> would restyle the app around it.
const STARTER_HELP = `<h1>Help</h1>
<p>This is your app's help page — edit help.html to describe your app.</p>
`;

// The theme chrome's ☰ menu — Help (a ui:Link to the app's help.html) plus the
// two standard appearance commands (implemented by web/scripts/app-commands.js,
// which layout-generate emits in every generated head).
const HAMBURGER_MENU_TTL = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .

# The app's ☰ menu — edit via the builder (or any sol-menu-manager).
:MainHamburgerMenu a ui:Menu ;
  ui:label "☰" ;
  ui:view ui:MenuButton ;
  ui:orientation ui:Vertical ;
  schema:itemListElement :Ham-Theme, :Ham-Text-size .

:Theme a ui:Command ;
  ui:label "Theme" ;
  schema:url <app-commands.ttl#toggleTheme> .

:Text-size a ui:Command ;
  ui:label "Text size" ;
  schema:url <app-commands.ttl#cycleFontSize> .

:Ham-Theme a schema:ListItem; schema:item :Theme; schema:position 1.
:Ham-Text-size a schema:ListItem; schema:item :Text-size; schema:position 2.
`;

// The button bar as the builder seeds it: Help, as a ? button beside the ☰.
const BUTTON_BAR_TTL = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .

# The app's button bar — edit via the builder (or any sol-button-bar-manager).
:MainButtonBar a ui:Menu ;
  ui:label "Button bar" ;
  ui:view ui:Toolbar ;
  ui:orientation ui:Horizontal ;
  schema:itemListElement :Bar-Help .

:BarHelp a ui:Link ;
  ui:label "?" ;
  schema:url "help.html" .

:Bar-Help a schema:ListItem; schema:item :BarHelp; schema:position 1.
`;

// The app's command registry document — a ui:Command menu item's schema:url
// names a fragment here; the fragment is the registry key.
const APP_COMMANDS_TTL = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# The app's command registry. Implementations live in sol-components
# web/scripts/app-commands.js (emitted in the generated head); a command
# with no implementation is a no-op.
:toggleTheme a ui:Command ;
  rdfs:comment "Cycle the app between light and dark theme." .
:cycleFontSize a ui:Command ;
  rdfs:comment "Cycle the app text size (16 / 20 / 24 px)." .
`;

// Injected into the PREVIEW frame only: landmark tints so the regions read
// apart at a glance, and a note where a menu has nothing in it.
const PREVIEW_CSS = `
  /* main is the content — it is not outlined as a region */
  header, nav, aside, footer {
    outline: 1px dashed rgba(120, 120, 120, .45); outline-offset: -1px;
  }
  header { background: rgba(31, 97, 141, .10); }
  nav    { background: rgba(31, 97, 141, .16); }
  aside  { background: rgba(31, 97, 141, .05); }
  footer { background: rgba(31, 97, 141, .08); }
  /* An empty menu, drawn as it would look with items in it. The LABEL says
     these are dummies, so they are drawn as solidly as the real thing. */
  .sab-mock { display: inline-flex; align-items: center; gap: .3rem; }
  .sab-mock-item {
    font: max(16px, .9em)/1.3 system-ui, sans-serif;
    color: var(--accent, #1F618D);
    border: 1px solid var(--accent, #1F618D); background: var(--surface, #fff);
    padding: .25rem .7rem; white-space: nowrap;
  }
  /* Not tab-shaped: in a bar they open into a pane elsewhere on the page, so
     an open-bottomed tab would be pinned to nothing. */
  .sab-mock-item { border-radius: .3rem; }
  .sab-mock-tabs .sab-mock-item:first-child { background: var(--accent, #1F618D); color: #fff; }
`;

const CSS = `
sol-app-builder {
  position: relative;
  display: flex; flex-direction: column; min-height: 0; font-size: 1rem;
}
/* Screen-reader-only: the drag-and-drop instructions and the live region. */
sol-app-builder .sab-a11y {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
/* Headings placed inside a legend or wrapping a disclosure button carry no
   visual weight of their own — the legend/button already styles them. */
sol-app-builder .sab-legend-h { font: inherit; color: inherit; display: inline; margin: 0; }
sol-app-builder .sab-el-h { font: inherit; color: inherit; margin: 0; display: block; }
sol-app-builder .sab-tablist { display: flex; gap: .5rem; }
/* Chrome keeps its own size; the step's panel takes what is left. */
sol-app-builder > * { flex: 0 0 auto; }
sol-app-builder > .sab-pane { flex: 1 1 auto; min-height: 0; }
/* Metadata and Preview take the whole width: one column, filling the height. */
sol-app-builder.sab-one-col { display: flex; flex-direction: column; min-height: 0; }
sol-app-builder .sab-pane {
  display: flex; flex-direction: column; min-height: 0;
  padding: .6rem 0 .4rem; overflow: auto;
}
/* the frame IS the content — it fills the pane and scrolls itself */
sol-app-builder .sab-preview-pane { overflow: hidden; }
sol-app-builder .sab-preview-pane > .sab-preview {
  flex: 1 1 auto; width: 100%; min-height: 0; border: 0; display: block;
}
/* fields read badly across a 1920px column */
sol-app-builder .sab-meta-pane > .sab-panel { max-width: 52rem; }
/* The tab in play wears the accent; the rest are quiet until picked. */
sol-app-builder .sab-tab[aria-selected="false"] {
  background: transparent; color: inherit; border-color: var(--border, #9e9e9e);
}
/* Customize: the app's elements, one per line, each unfolding in place. No
   box around the list — the elements ARE the list. */
sol-app-builder .sab-els { display: flex; flex-direction: column; }
sol-app-builder .sab-el { border-bottom: 1px dotted var(--border, #9e9e9e); }
sol-app-builder .sab-el-head {
  width: 100%; text-align: left; font-family: inherit; font-size: 1.2rem;
  padding: .5rem .5rem; border: 0; background: transparent; color: #b45309;
  cursor: pointer;
}
sol-app-builder .sab-el-head::before { content: '▸ '; }
sol-app-builder .sab-el-head[aria-expanded="true"]::before { content: '▾ '; }
sol-app-builder .sab-el-body {
  display: flex; flex-direction: column; gap: .8rem; min-height: 0;
  padding: .2rem .5rem 1rem;
}
[data-theme="dark"] sol-app-builder .sab-el-head { color: #fb923c; }
.sab-top { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 0 0 .75rem; }
/* The picker and the app's actions wear the same chip as a panel's button. */
.sab-top .sab-app-select,
.sab-top .sab-app-btn {
  font-family: inherit; font-size: 1rem; line-height: 1; padding: .3rem .7rem;
  border: 1px solid transparent; border-radius: .3rem;
  background: var(--accent, #1F618D); color: #fff; cursor: pointer;
}
sol-app-builder .sab-app-title { flex: 1 1 auto; font-size: 1.1rem; color: inherit; text-decoration: none; }
sol-app-builder .sab-app-title:hover { text-decoration: underline; }
sol-app-builder .sab-hint { color: var(--text-muted, #4d4d4d); margin: .5rem 0; }
sol-app-builder .sab-error { color: #b00020; margin: .5rem 0; }
sol-app-builder form.sab-new { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .75rem 0; }
sol-app-builder input {
  font-size: 1rem; padding: .4rem .6rem; border-radius: .3rem;
  border: 1px solid var(--input-border, #9aa0a8);
  background: var(--input-bg, #eef); color: var(--input-text, #1a1a1a);
}
sol-app-builder form.sab-new button {
  font-size: 1rem; padding: .45rem .9rem; border-radius: .3rem;
  border: 1px solid transparent; background: var(--accent, #1F618D);
  color: #fff; cursor: pointer;
}
/* ONE screen in two columns: the app picker over the regions on the left, the
   instructions over what you can place on the right. A grid, so both columns'
   panels start on the same line however tall the headers above them are. */
sol-app-builder.sab-two-col {
  /* The catalog column is sized to hold THREE plugin cards on a wide screen:
     a card is 18rem with a .45rem gutter, and the panel adds ~3.4rem of
     padding + border + scrollbar. In rem, so it tracks the text size. The
     left column keeps a 20rem floor, so a narrower screen takes width off
     the catalog (two cards, then one) rather than crushing the regions. */
  --sab-card-w: 18rem;
  --sab-catalog-w: calc(var(--sab-card-w) * 3 + .9rem + 3.4rem);
  display: grid;
  grid-template-columns: minmax(20rem, 1fr) minmax(0, var(--sab-catalog-w));
  grid-template-rows: auto minmax(0, 1fr) auto;
  column-gap: 1rem; min-height: 0;
}
sol-app-builder.sab-two-col > .sab-top { grid-area: 1 / 1; }
/* Nothing in row 1 when the page seats the controls: the columns fill. */
sol-app-builder.sab-two-col:not(:has(> .sab-top)) { grid-template-rows: minmax(0, 1fr) auto; }
sol-app-builder.sab-two-col:not(:has(> .sab-top)) > .sab-areas { grid-area: 1 / 1; }
sol-app-builder.sab-two-col:not(:has(> .sab-top)) > .sab-right { grid-row: 1; }

sol-app-builder.sab-two-col > .sab-areas { grid-area: 2 / 1; }
/* nothing sits above the right column now, so it starts at the top row */
sol-app-builder.sab-two-col > .sab-right { grid-row: 1 / 3; }
sol-app-builder.sab-two-col > .sab-right {
  grid-column: 2; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: 1.4rem;
  padding: .6rem 0 .4rem; overflow: auto;
}
sol-app-builder.sab-two-col > .sab-error { grid-area: 3 / 1 / auto / -1; }
@media (max-width: 64rem) {
  sol-app-builder.sab-two-col { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto; }
  sol-app-builder.sab-two-col > .sab-top { grid-area: auto; }
  sol-app-builder.sab-two-col > .sab-areas,
  sol-app-builder.sab-two-col > .sab-right,
  sol-app-builder.sab-two-col > .sab-error { grid-area: auto; grid-row: auto; }
}
.sab-top .sab-app-btns { margin-left: auto; display: flex; gap: .5rem; }
[data-theme="dark"] .sab-top .sab-app-select,
[data-theme="dark"] .sab-top .sab-app-btn { color: #0f1115; }
.sab-top .sab-tab[aria-selected="false"],
[data-theme="dark"] .sab-top .sab-tab[aria-selected="false"] {
  background: transparent; color: inherit; border-color: var(--border, #9e9e9e);
}
/* Add/Edit Features: the regions as an accordion (left), the catalog (right). */
/* The regions stack, in layout order — the catalog column sits beside them.
   Same breathing room as the panels opposite. */
sol-app-builder .sab-areas {
  flex: 1 1 20rem; min-width: 0;
  display: flex; flex-direction: column; gap: 1.4rem;
  padding: .6rem 0 .4rem;
}
sol-app-builder .sab-right { flex: 1 1 20rem; min-width: 0; display: flex; flex-direction: column; gap: .8rem; }
sol-app-builder .sab-right > sol-plugin-manager { flex: 1 1 auto; min-width: 0; min-height: 0; }
/* A panel: a box with its name on the top border, like the layout areas. */
sol-app-builder .sab-panel {
  position: relative;
  /* the same border the region cards opposite wear */
  border: 2px dotted var(--border, #9e9e9e); border-radius: .5rem;
  /* top padding is clearance under the border button */
  padding: .8rem .8rem .4rem; margin: 0; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: .5rem;
}
/* A panel's action sits on its top border, at the right — the mirror of the
   name on the left. Its own background punches the border line. */
sol-app-builder .sab-panel-btn {
  position: absolute; top: -1.5rem; right: .8rem;
  font-family: inherit; font-size: 1rem; line-height: 1; padding: .3rem .7rem;
  border: 1px solid transparent; border-radius: .3rem;
  background: var(--accent, #1F618D); color: #fff; cursor: pointer;
}
[data-theme="dark"] sol-app-builder .sab-panel-btn { color: #0f1115; }
sol-app-builder .sab-panel > legend { font-size: 1.1rem; padding: 0 .5rem; color: #b45309; }
sol-app-builder .sab-meta-danger { margin-top: 1.5rem; }
sol-app-builder .sab-del-app {
  font-family: inherit; font-size: 1rem; padding: .4rem .8rem;
  border: 1px solid #b00020; border-radius: .3rem;
  background: transparent; color: #b00020; cursor: pointer;
}
sol-app-builder .sab-del-app:hover { background: #b00020; color: #fff; }
[data-theme="dark"] sol-app-builder .sab-del-app { border-color: #ff8a80; color: #ff8a80; }
[data-theme="dark"] sol-app-builder .sab-del-app:hover { background: #ff8a80; color: #0f1115; }
sol-app-builder .sab-panel-fill { flex: 1 1 auto; }
sol-app-builder .sab-panel-fill > sol-plugin-manager { flex: 1 1 auto; min-height: 0; }
sol-app-builder .sab-shelf { flex: 0 0 auto; }
/* A region: a dotted box naming itself on its top border, like step 1's areas. */
sol-app-builder .sab-acc-area {
  position: relative;
  border: 2px dotted var(--border, #9e9e9e); border-radius: .5rem;
  padding: .2rem .8rem .7rem; margin: 0; min-width: 0;
}
sol-app-builder .sab-acc-head {
  font-size: 1.2rem; padding: .1rem .5rem; color: #b45309;
}
sol-app-builder .sab-acc-body > * { min-width: 0; }
sol-app-builder .sab-acc-body {
  display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
  min-height: 2.4rem; padding: .3rem 0 .1rem;
}
/* Narrow: stack the two columns and let the step itself scroll. */
@media (max-width: 48rem) {
  sol-app-builder .sab-areas,
  sol-app-builder .sab-right { overflow: visible; }
}
/* Every panel scrolls its own list — the page never does. */
sol-app-builder .sab-areas,
sol-app-builder .sab-right { min-height: 0; overflow: auto; }
/* The catalog styles itself in its own shadow tree; these vars reach in. */
sol-app-builder sol-plugin-manager {
  --builder-title-display: none;
  --builder-add-display: none;
  --builder-del-fg: #b00020;
  --builder-del-opacity: 1;
  --builder-add-bg: var(--accent, #1F618D);
  --builder-add-fg: #fff;
  --builder-add-border: transparent;
  --builder-add-hover-bg: var(--accent-dark, #2980b9);
  --builder-add-hover-fg: #fff;
}
/* A region's ✕ sits at the far right of its card's upper border. */
sol-app-builder .sab-area-x {
  position: absolute; top: -1.45rem; right: .7rem;
  font-size: 1rem; line-height: 1; padding: .15rem .45rem;
  border: 0; border-radius: .3rem; background: var(--bg, #f5f5f5);
  color: #b00020; cursor: pointer;
}
sol-app-builder .sab-drop-over { outline: 2px solid var(--accent, #1F618D); }
/* A chip in a region and an offering on the right are the same object seen
   before and after placing, so they wear the same pill. */
sol-app-builder .sab-chip,
sol-app-builder .sab-feat {
  display: inline-flex; align-items: center; gap: .3rem; cursor: grab;
  font-size: 1rem; padding: .2rem .6rem; border-radius: 999px;
  border: 1px solid var(--border, #9e9e9e); background: var(--bg, #f5f5f5); color: var(--text, #000);
}
sol-app-builder .sab-chip { padding-right: .3rem; }   /* its ✕ carries the rest */
sol-app-builder .sab-chip-menu { cursor: pointer; }
sol-app-builder .sab-chip-x {
  font-size: 1rem; line-height: 1; padding: .1rem .3rem; border-radius: 999px;
  border: 0; background: transparent; color: #b00020; cursor: pointer;
}
/* Each offering is sized to its own text; they wrap in their panel. */
sol-app-builder .sab-feat { font-family: inherit; text-align: left; width: auto; flex: 0 0 auto; }
sol-app-builder #sab-features,
sol-app-builder #sab-content {
  display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
  min-height: 2.4rem; padding: .3rem 0 .1rem;
}
sol-app-builder .sab-shelf { flex-direction: row; flex-wrap: wrap; }
/* A removed AREA comes back by clicking it — it returns to where it was, so
   there is nowhere to drag it to. */
sol-app-builder button.sab-feat { cursor: pointer; }
/* Dark theme: the dark --accent (#4dabf7) is light — white-on-accent and
   dark-red error text would both fail contrast there. */
[data-theme="dark"] sol-app-builder .sab-steps button[aria-current="step"],
[data-theme="dark"] sol-app-builder .sab-actions button,
[data-theme="dark"] sol-app-builder form.sab-new button {
  color: #0f1115;
}
[data-theme="dark"] sol-app-builder button.sab-quiet { color: inherit; }
[data-theme="dark"] sol-app-builder .sab-error { color: #ff8a80; }
[data-theme="dark"] sol-app-builder .sab-area > legend,
[data-theme="dark"] sol-app-builder .sab-acc-head,
[data-theme="dark"] sol-app-builder sol-plugin-manager {
  --builder-del-fg: #ff8a80;
  --builder-add-fg: #0f1115;
  --builder-add-hover-fg: #0f1115;
}
[data-theme="dark"] sol-app-builder .sab-panel > legend { color: #fb923c; }
/* The dark-red ✕ would fail contrast on the dark surface. */
[data-theme="dark"] sol-app-builder .sab-chip-x,
[data-theme="dark"] sol-app-builder .sab-area-x { color: #ff8a80; }
`;

class SolAppBuilder extends HTMLElement {
  constructor() {
    super();
    this._apps = null;    // [{slug, folder, name, icon}]
    this._app = null;     // the selected one
    this._mode = null;    // 'new' | 'edit' — which top-row button is active (gates the rail)
    this._removed = [];   // elements removed from the layout — offered back in the list
    this._removedSeq = 0;
    this._error = null;
    this._announcedError = null;   // last error announced, so a re-render doesn't repeat it
    this._picked = null;  // keyboard drag-and-drop: the item currently "picked up"
    this._tab = 'meta';   // which of TABS the work area is showing
    this._uid = `sab${++SAB_SEQ}`;
    // A constructor-owned, screen-reader-only node that survives every
    // innerHTML rebuild: the keyboard drag-and-drop instructions, and one
    // polite live region for errors and the "picked up / placed" announcements.
    this._a11y = document.createElement('div');
    this._a11y.className = 'sab-a11y';
    this._a11y.innerHTML =
      `<p id="${this._uid}-dnd-help">Press Enter to pick this item up, then the arrow keys to `
      + `choose a region and Enter to place it there; Escape cancels. Arrow up and down `
      + `reorders an item within its region.</p>`
      + `<p class="sab-live" aria-live="polite"></p>`;
  }

  // Say something to a screen reader once. Clearing then setting on a timeout
  // makes even a repeat of the same words announce, and lands after _render
  // has re-attached the live region.
  _announce(msg) {
    const live = this._a11y.querySelector('.sab-live');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = msg || ''; }, 30);
  }

  connectedCallback() {
    ensureDocStyle(this, 'sol-app-builder-css', CSS);
    this.append(this._a11y);
    // The heavy editors load lazily; the Menus step renders them by tag.
    import('./sol-menu-manager.js').catch(() => {});
    import('./sol-plugin-manager.js').catch(() => {});
    // A host-seated top row is outside this element, so the same handlers
    // listen there too; the guard stops one event running twice if the two
    // scopes ever nest.
    const seen = (e) => { if (e._sabSeen) return true; e._sabSeen = true; return false; };
    const onClick = (e) => { if (!seen(e)) this._onClick(e); };
    const onKeydown = (e) => { if (!seen(e)) this._onKeydown(e); };
    const onChange = (e) => {
      if (!seen(e) && e.target.classList.contains('sab-app-select')) this._pick(e.target.value);
    };
    this.addEventListener('click', onClick);
    this.addEventListener('keydown', onKeydown);
    this.addEventListener('submit', (e) => this._onSubmit(e));
    this.addEventListener('change', onChange);
    const host = this.controlsHost;
    if (host) {
      host.addEventListener('click', onClick);
      host.addEventListener('keydown', onKeydown);
      host.addEventListener('change', onChange);
    }
    // Edit Interface: drag a list feature or a chip onto a layout area.
    // Before a manager sees a drop: a "New HTML Content" card has no url yet,
    // and a menu only takes an item that names one.
    this.addEventListener('drop', (e) => this._mintBeforeDrop(e), true);
    this.addEventListener('dragstart', (e) => this._onFeatureDragStart(e));
    this.addEventListener('dragover', (e) => this._onFeatureDragOver(e));
    this.addEventListener('drop', (e) => this._onFeatureDrop(e));
    this._load();
  }

  get appsRoot() {
    const v = this.getAttribute('apps-root') || '';
    if (!v) return null;
    const url = new URL(v, document.baseURI).href;
    return url.endsWith('/') ? url : url + '/';
  }

  get catalog() { return this.getAttribute('catalog') || null; }

  // The element the top row is rendered into, when the page names one.
  get controlsHost() {
    const sel = this.getAttribute('controls');
    return sel ? document.querySelector(sel) : null;
  }

  get componentsBase() {
    return this.getAttribute('components-base') || '/node_modules/sol-components';
  }

  // ── data loading ─────────────────────────────────────────────────────

  async _load() {
    this._error = null;
    await this._loadApps();
    this._render();
  }

  // The folder IS the registry: list apps-root, keep children whose app.ttl
  // holds a schema:WebApplication.
  async _loadApps() {
    this._apps = [];
    if (!this.appsRoot) { this._error = 'Set apps-root="…" (the container app folders live in).'; return; }
    let children = [];
    try {
      children = (await fetchContainer(this.appsRoot, freshFetch)).filter((c) => c.isContainer);
    } catch {
      return; // container not there yet — created on the first app save
    }
    for (const c of children) {
      try {
        const store = await loadRdfStore(`${c.url}app.ttl`, freshFetch);
        const node = store.any(null, rdf.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          rdf.sym(SCHEMA + 'WebApplication'));
        if (!node) continue;
        this._apps.push({
          slug: c.name,
          folder: c.url,
          name: (store.any(node, rdf.sym(SCHEMA + 'name')) || {}).value || c.name,
          icon: (store.any(node, rdf.sym(UI + 'icon')) || {}).value || '',
        });
      } catch { /* not an app folder */ }
    }
  }

  // ── actions ──────────────────────────────────────────────────────────

  async _createApp(name, icon) {
    const slug = slugify(name);
    const folder = `${this.appsRoot}${slug}/`;
    const probe = await freshFetch(`${folder}app.ttl`).catch(() => null);
    if (probe && probe.ok) { this._error = `An app folder "${slug}" already exists — pick it below instead.`; return; }
    const ttl = appTurtle(name, icon);
    const r = await solFetch(`${folder}app.ttl`, {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: ttl,
    });
    if (!r.ok) { this._error = `Couldn't create ${folder}app.ttl — ${r.status}`; return; }
    this._app = { slug, folder, name, icon };
    this._removed = [];
    await this._ensureLayout(this._app);
    await this._register({ silent: true });   // an app that exists is in the catalog
    await this._loadApps();
    this._render();
  }

  // An app always HAS a layout: compose the full default one (and seed the docs
  // it names) for any app that arrives without a layout.ttl. Existing layouts
  // are left exactly as they are.
  async _ensureLayout(app) {
    const layoutUrl = `${app.folder}layout.ttl`;
    const existing = await freshFetch(layoutUrl).catch(() => null);
    if (existing && existing.ok) return;
    const ttl = composeLayoutTurtle({
      ...DEFAULT_LAYOUT, title: app.name, componentsBase: this.componentsBase,
    });
    const put = await solFetch(layoutUrl, {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: ttl,
    });
    if (!put.ok) { this._error = `Couldn't save layout.ttl — ${put.status}`; return; }
    await this._seedComposedDocs(layoutUrl, DEFAULT_LAYOUT);
    await this._generate({ silent: true });   // born runnable
  }

  // Seed the docs the composed layout names: the three menu docs (MainMenu with
  // its placement orientation, MainButtonBar, MainHamburgerMenu with its Help +
  // appearance commands), and the preset content htmls (site-title, footer, help).
  async _seedComposedDocs(layoutUrl, cfg) {
    const menuDoc = new URL('app-menu.ttl', layoutUrl).href;
    await this._ensureMenuFragment(menuDoc, 'MainMenu',
      seedAppMenu({ label: 'Main menu', fragment: 'MainMenu',
        orientation: menuOrientationFor(cfg.menuLocation), view: 'Menubar' }));
    if (cfg.buttonBar !== 'none') {
      await this._ensureMenuFragment(menuDoc, 'MainButtonBar', BUTTON_BAR_TTL);
      await this._seedIfAbsent(new URL('help.html', layoutUrl).href, STARTER_HELP, 'text/html');
    }
    if (cfg.hamburger) {
      await this._ensureMenuFragment(menuDoc, 'MainHamburgerMenu', HAMBURGER_MENU_TTL);
      await this._seedIfAbsent(new URL('app-commands.ttl', layoutUrl).href, APP_COMMANDS_TTL, 'text/turtle');
    }
    await this._seedIfAbsent(new URL('site-title.html', layoutUrl).href,
      siteTitleFor((this._app && this._app.name) || 'My App'), 'text/html');
    await this._seedIfAbsent(new URL('start-page.html', layoutUrl).href, STARTER_START_PAGE, 'text/html');
    if (cfg.footer) await this._seedIfAbsent(new URL('footer.html', layoutUrl).href, STARTER_FOOTER, 'text/html');
  }

  async _seedIfAbsent(url, body, type) {
    const there = await freshFetch(url).catch(() => null);
    if (there && there.ok) return;
    await solFetch(url, { method: 'PUT', headers: { 'Content-Type': type }, body });
  }

  // A menu DOC can hold several menu fragments (app-menu.ttl#MainMenu,
  // #MainButtonBar, #MainHamburgerMenu): create the doc when absent, APPEND the
  // fragment's block when the doc exists without it (Turtle re-declares prefixes).
  async _ensureMenuFragment(docUrl, fragment, block) {
    const there = await freshFetch(docUrl).catch(() => null);
    if (!there || !there.ok) {
      await solFetch(docUrl, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: block });
      return;
    }
    const text = await there.text();
    if (text.includes(`:${fragment} a ui:Menu`) || text.includes(`#${fragment}>`)) return;
    await solFetch(docUrl, {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' },
      body: `${text}\n${block}`,
    });
  }

  // Compile the layout into the page artifacts. Runs after EVERY layout save
  // (silent) so the app folder is always runnable — there is no publish step
  // holding stale output.
  async _generate({ silent = false } = {}) {
    const app = this._app;
    if (!app) return;
    this._error = null;
    try {
      const layoutUrl = `${app.folder}layout.ttl`;
      const store = await loadRdfStore(layoutUrl, freshFetch);
      const html = generateAppHtml({
        store,
        layoutNode: rdf.sym(`${layoutUrl}#Layout`),
        app: { title: app.name, icon: app.icon },
        componentsBase: this.componentsBase,
        // The app folder is the base: same-origin ui:Link content (site-title /
        // footer html) transcludes via sol-include rather than framing.
        baseUrl: app.folder,
      });
      const css = generateAppCss(store, rdf.sym(`${layoutUrl}#Layout`));
      for (const [name, body, type] of [
        ['index.html', html, 'text/html'],
        ['app.css', css, 'text/css'],
      ]) {
        const r = await solFetch(app.folder + name, {
          method: 'PUT', headers: { 'Content-Type': type }, body,
        });
        if (!r.ok) throw new Error(`${name} — ${r.status}`);
      }
      this._app.generated = true;
    } catch (e) {
      this._error = `Generate failed: ${e.message}`;
    }
    if (!silent) this._render();
  }

  // One ui:Plugin entry (kind ui:Link) in the catalog doc — catalog only, the
  // owner places it via Customize (no menu write). Written automatically when
  // an app is created; _unregister takes it out again when the app is deleted.
  async _register({ silent = false } = {}) {
    const app = this._app;
    if (!app || !this.catalog) return;
    this._error = null;
    const catDoc = new URL(this.catalog.split('#')[0], document.baseURI).href;
    const indexUrl = `${app.folder}index.html`;
    try {
      const store = await loadRdfStore(catDoc, freshFetch);
      const already = store.each(null, rdf.sym(SCHEMA + 'url'), rdf.sym(indexUrl));
      if (already.length) {
        this._app.registered = true;
        await this._checkRegistered(this._app);   // learn which entry it is
        if (!silent) this._render();
        return;
      }
      const taken = new Set(
        (store.statements || [])
          .map((s) => (String(s.subject.value).startsWith(catDoc + '#')
            ? s.subject.value.split('#')[1] : ''))
          .filter(Boolean),
      );
      const frag = mintFragment(app.name, taken);
      const entryTurtle = `
<${catDoc}#${frag}> a <${UI}Plugin> ;
  <${SCHEMA}additionalType> <${UI}Link> ;
  <${UI}label> "${app.name.replace(/"/g, '\\"')}" ;${app.icon ? `
  <${UI}icon> "${app.icon.replace(/"/g, '\\"')}" ;` : ''}
  <${SCHEMA}url> <${indexUrl}> ;
  <${SCHEMA}description> "Built with the app builder." ;
  <http://purl.org/dc/terms/subject> "My Apps" .
`;
      const r = await solFetch(catDoc, {
        method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' },
        body: `INSERT DATA {${entryTurtle}}`,
      });
      if (!r.ok) {
        // CSS's lock can expire mid-PATCH on a large doc (500 "Lock
        // expired") — same failure sol-form works around: fall back to
        // appending the entry (full IRIs, prefix-independent) and PUTting
        // the whole document back.
        const cur = await freshFetch(catDoc);
        if (!cur.ok) throw new Error(`PATCH ${r.status}, re-read ${cur.status}`);
        const put = await solFetch(catDoc, {
          method: 'PUT', headers: { 'Content-Type': 'text/turtle' },
          body: (await cur.text()) + entryTurtle,
        });
        if (!put.ok) throw new Error(`PATCH ${r.status}, PUT ${put.status}`);
      }
      this._app.registered = true;
      this._app.entry = `${catDoc}#${frag}`;
    } catch (e) {
      this._error = `Couldn't add to the catalog: ${e.message}`;
    }
    if (!silent) this._render();
  }

  // Take the app's entry back out of the catalog — the other half of the
  // automatic entry, so deleting an app doesn't leave a card pointing at a
  // folder that is gone. A menu the owner placed it in still names it.
  async _unregister(app) {
    if (!app || !this.catalog) return;
    const catDoc = new URL(this.catalog.split('#')[0], document.baseURI).href;
    const indexUrl = `${app.folder}index.html`;
    try {
      const store = await loadRdfStore(catDoc, freshFetch);
      const entry = (store.statementsMatching(null, rdf.sym(SCHEMA + 'url'),
        rdf.sym(indexUrl)) || []).map((st) => st.subject)[0];
      if (!entry) return;
      // Concrete triples only: a blank-node object can't be named in DELETE DATA.
      const triples = (store.statementsMatching(entry, null, null) || [])
        .filter((st) => st.object.termType !== 'BlankNode')
        .map((st) => `<${entry.value}> <${st.predicate.value}> ${
          st.object.termType === 'Literal'
            ? `"${String(st.object.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
            : `<${st.object.value}>`} .`);
      if (!triples.length) return;
      const r = await solFetch(catDoc, {
        method: 'PATCH', headers: { 'Content-Type': 'application/sparql-update' },
        body: `DELETE DATA {\n${triples.join('\n')}\n}`,
      });
      if (!r.ok) this._error = `Deleted ${app.slug}/, but its catalog entry is still there (${r.status}).`;
    } catch (e) {
      this._error = `Deleted ${app.slug}/, but its catalog entry is still there: ${e.message}`;
    }
  }

  // ── events ───────────────────────────────────────────────────────────

  _onClick(e) {
    const del = e.target.closest('[data-del-app]');
    if (del) { this._deleteApp(del.dataset.delApp); return; }
    const card = e.target.closest('[data-app]');
    if (card) { this._pickApp(card.dataset.app); return; }
    const elAction = e.target.closest('[data-el-action]');
    if (elAction) { this._elementAction(elAction); return; }
    const areaX = e.target.closest('[data-area-action]');
    if (areaX) { this._removeArea(areaX.dataset.area); return; }
    const edit = e.target.closest('[data-edit-node]');
    if (edit) {
      if (edit.getAttribute('aria-expanded') === 'true') this._closeElement(edit.dataset.editNode);
      else this._openElement(edit.dataset.editNode);
      return;
    }
    const restore = e.target.closest('[data-restore-area]');
    if (restore) { this._restoreArea(restore.dataset.restoreArea); return; }
    const menuChip = e.target.closest('.sab-chip-menu[data-node]');
    if (menuChip) { this._editMenuChip(menuChip.dataset.node); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { this._tab = tab.dataset.tab; this._render(); return; }
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'add-plugin') {
        this.querySelector('sol-plugin-manager')?.openCreator?.();
      }
      if (action.dataset.action === 'register') this._register();
    }
  }

  // Keyboard companion to the pointer gestures. Tabs use manual activation
  // (arrows move focus, Enter activates) because a switch loads over the
  // network; chips and offerings drag with a pick-up / choose-region / place
  // flow announced through the live region, so no mouse is needed.
  _onKeydown(e) {
    const key = e.key;
    const space = key === ' ' || key === 'Spacebar';

    // Escape drops an in-progress pick, wherever focus is.
    if (this._picked && key === 'Escape') { e.preventDefault(); this._cancelPick(); return; }

    // Tab strip: move focus and roving tabindex only; Enter/Space fall through
    // to the native button click, which switches the tab.
    const tab = e.target.closest('[role="tab"][data-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      e.preventDefault();
      this._moveTabFocus(tab, key);
      return;
    }

    // While an item is picked up: arrows walk the drop targets, Enter places.
    if (this._picked) {
      if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(key)) {
        e.preventDefault();
        this._stepPickTarget(key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (key === 'Enter' || space) {
        const target = e.target.closest('.sab-drop, .sab-drop-el');
        if (target) { e.preventDefault(); this._dropPicked(target); }
        return;
      }
      return;
    }

    // A menu chip opens its editor on Enter/Space (as clicking does); either
    // chip reorders within its region with Up/Down.
    const menuChip = e.target.closest('.sab-chip-menu[data-node]');
    if (menuChip) {
      if (key === 'Enter' || space) { e.preventDefault(); this._editMenuChip(menuChip.dataset.node); return; }
      if (key === 'ArrowUp' || key === 'ArrowDown') { e.preventDefault(); this._reorderChip(menuChip, key === 'ArrowUp' ? -1 : 1); return; }
      return;
    }
    const chip = e.target.closest('.sab-chip[data-node]');
    if (chip) {
      if (key === 'Enter' || space) {
        e.preventDefault();
        this._pickUp({ label: chipText(chip), sab: { op: 'move', node: chip.dataset.node } }, chip);
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') { e.preventDefault(); this._reorderChip(chip, key === 'ArrowUp' ? -1 : 1); return; }
      return;
    }

    // An offering (a menu/content the app is without). A restore-area offering
    // is a real <button> whose Enter already restores, so leave it be.
    const feat = e.target.closest('.sab-feat[data-feature], [data-content]');
    if (feat && (key === 'Enter' || space) && feat.tagName !== 'BUTTON') {
      e.preventDefault();
      this._pickUpFeature(feat);
    }
  }

  // Move focus along the tab strip and carry the roving tabindex with it,
  // without switching tabs (that waits for Enter/Space).
  _moveTabFocus(tab, key) {
    const list = tab.closest('[role="tablist"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(tab);
    const to = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1
      : key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
        : (i + 1) % tabs.length;
    tabs.forEach((t, n) => t.setAttribute('tabindex', n === to ? '0' : '-1'));
    tabs[to].focus();
  }

  // ── keyboard drag-and-drop ───────────────────────────────────────────

  // Pick an item up: remember it and a way back to its source, mark it, then
  // offer the drop targets and land focus on the first.
  _pickUp(picked, sourceEl) {
    this._picked = { ...picked, sourceId: this._captureFocus() };
    if (sourceEl) sourceEl.setAttribute('data-picked', 'true');
    const targets = this._pickTargets();
    if (!targets.length) { this._picked = null; if (sourceEl) sourceEl.removeAttribute('data-picked'); return; }
    this._announce(`Picked up ${picked.label || 'item'}. Arrow keys choose a region, Enter places it, Escape cancels.`);
    targets[0].focus();
  }

  _pickUpFeature(feat) {
    if (feat.dataset.content) {
      this._pickUp({ label: 'HTML content', plugin: { label: 'Content', newContent: true, icon: '🔗' } }, feat);
      return;
    }
    let spec = null;
    try { spec = JSON.parse(feat.dataset.feature); } catch { spec = null; }
    if (!spec) return;
    const link = spec.op === 'link' && STANDARD_LINKS.find((l) => l.key === spec.key);
    this._pickUp({
      label: feat.textContent.trim(),
      sab: spec,
      plugin: link ? { label: link.label, href: link.file } : null,
    }, feat);
  }

  // The places a picked item may land: region drop zones on Add Features, and
  // element heads on Customize. They are made focusable for the duration.
  _pickTargets() {
    const els = [...this.querySelectorAll('.sab-acc-head.sab-drop, .sab-el-head.sab-drop-el')];
    els.forEach((el) => { if (!el.hasAttribute('tabindex')) el.setAttribute('data-sab-temp-tab', ''); el.setAttribute('tabindex', '-1'); });
    this._picked.targets = els;
    this._picked.ti = 0;
    return els;
  }

  _stepPickTarget(dir) {
    const t = this._picked && this._picked.targets;
    if (!t || !t.length) return;
    this._picked.ti = (this._picked.ti + dir + t.length) % t.length;
    t[this._picked.ti].focus();
  }

  async _dropPicked(target) {
    const picked = this._picked;
    if (!picked) return;
    this._endPick();
    if (target.classList.contains('sab-drop-el')) {
      // Onto an element (Customize): only a plugin or a content page goes in.
      if (picked.plugin) await this._dropOnElement(target.dataset.editNode, picked.plugin);
    } else {
      const regionIri = target.dataset.region;
      if (picked.sab) await this._applyFeaturePayload(picked.sab, regionIri, null);
      else if (picked.plugin) await this._addPlugin(picked.plugin, regionIri);
    }
    this._announce(`Placed ${picked.label || 'item'}.`);
  }

  _cancelPick() {
    const back = this._picked && this._picked.sourceId;
    this._endPick();
    this._announce('Move cancelled.');
    this._restoreFocus(back);
  }

  // Clear picked state and the temporary tabindex/marker it set.
  _endPick() {
    this.querySelectorAll('[data-picked]').forEach((el) => el.removeAttribute('data-picked'));
    (this._picked?.targets || []).forEach((el) => {
      if (el.hasAttribute('data-sab-temp-tab')) { el.removeAttribute('tabindex'); el.removeAttribute('data-sab-temp-tab'); }
    });
    this._picked = null;
  }

  // Up/Down on a focused chip: move it before its previous sibling, or past its
  // next one, within the same region.
  async _reorderChip(chip, dir) {
    const region = chip.closest('[data-region]');
    if (!region) return;
    const regionIri = region.dataset.region;
    const chips = [...region.querySelectorAll('.sab-chip[data-node]')];
    const i = chips.indexOf(chip);
    if (dir < 0) {
      if (i <= 0) return;
      await this._moveChip(chip.dataset.node, regionIri, chips[i - 1].dataset.node);
    } else {
      if (i >= chips.length - 1) return;
      const after = chips[i + 2] ? chips[i + 2].dataset.node : null;   // before the one past the next
      await this._moveChip(chip.dataset.node, regionIri, after);
    }
    this._announce(`Moved ${chipText(chip)}.`);
  }

  // The picker: "" clears, "__new" opens the create form, "__edit" lists the
  // apps to choose from, anything else is an app slug to work on.
  async _pick(value) {
    this._error = null;
    if (value === '__new') {
      this._mode = 'new';
      this._app = null;
      this._render();
      return;
    }
    this._mode = null;
    if (!value) { this._app = null; this._render(); return; }
    await this._pickApp(value);
  }

  // The banner names the app. Rewrite it only while it is still what the
  // builder put there; text the owner wrote is left alone.
  async _nameTheBanner(app, previous) {
    const url = `${app.folder}site-title.html`;
    const res = await freshFetch(url).catch(() => null);
    if (!res || !res.ok) return;
    const text = (await res.text()).trim();
    if (!isSeededBanner(text, [previous, app.name])) return;
    await solFetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: siteTitleFor(app.name),
    });
  }

  // Is this app already in the catalog? Decides whether the preview step needs
  // to offer the entry (apps made before the entry was automatic).
  async _checkRegistered(app) {
    if (!this.catalog) return;
    try {
      const catDoc = new URL(this.catalog.split('#')[0], document.baseURI).href;
      const store = await loadRdfStore(catDoc, freshFetch);
      const hit = (store.statementsMatching(null, rdf.sym(SCHEMA + 'url'),
        rdf.sym(`${app.folder}index.html`)) || [])[0];
      app.registered = !!hit;
      app.entry = hit ? hit.subject.value : null;
    } catch { /* no catalog doc yet — offer the entry */ }
  }

  // Delete an app: the WHOLE folder (layout, menus, generated page, content),
  // after an explicit confirm. Nothing else references it — a catalog entry the
  // owner published stays until they remove it there.
  async _deleteApp(slug) {
    const app = (this._apps || []).find((a) => a.slug === slug);
    if (!app) return;
    if (!window.confirm(
      `Delete "${app.name}" and everything in ${app.slug}/? This can't be undone.`)) return;
    this._error = null;
    await this._unregister(app);
    try {
      await deleteFolder(app.folder, () => solFetch);
    } catch (e) {
      this._error = `Couldn't delete ${app.slug}/ — ${e.message}`;
    }
    if (this._app && this._app.slug === slug) { this._app = null; this._tree = null; }
    await this._loadApps();
    this._render();
  }

  // Pick an existing app to edit: an app with no layout.ttl gets the default
  // one composed for it, so the step always opens on a placeable layout.
  async _pickApp(slug) {
    this._tab = 'meta';
    this._app = (this._apps || []).find((a) => a.slug === slug) || null;
    this._removed = [];
    if (this._app) {
      await this._ensureLayout(this._app);
      await this._nameTheBanner(this._app);
      // The page artifacts are GENERATED: an app built by an older version of
      // the generator still carries its old app.css until something rewrites
      // it. Opening the app is that something.
      await this._generate({ silent: true });
      await this._checkRegistered(this._app);
    }
    this._render();
  }

  _onSubmit(e) {
    if (!e.target.classList.contains('sab-new')) return;
    e.preventDefault();
    const name = e.target.querySelector('[name=app-name]')?.value?.trim();
    const icon = e.target.querySelector('[name=app-icon]')?.value?.trim() || '';
    if (name) this._createApp(name, icon);
  }

  // ── rendering ────────────────────────────────────────────────────────

  // Before an innerHTML rebuild, note what has focus by a stable identity — the
  // nearest ancestor carrying one of these keys, plus an inner class for a
  // button inside it (a chip's ✕). After the rebuild, put focus back on the
  // matching element; a no-match (the focused thing is genuinely gone) does
  // nothing.
  _captureFocus() {
    const a = document.activeElement;
    const host = this.controlsHost;
    if (!a || a === document.body) return null;
    if (!this.contains(a) && !(host && host.contains(a))) return null;
    const keys = ['data-node', 'data-el', 'data-tab', 'data-feature', 'data-content',
      'data-restore-area', 'data-edit-node', 'data-region', 'data-area', 'data-action',
      'data-app', 'data-del-app'];
    for (const k of keys) {
      const holder = a.closest(`[${k}]`);
      if (holder) {
        return {
          sel: `[${k}="${cssQuote(holder.getAttribute(k))}"]`,
          inner: holder === a ? null : (a.classList[0] ? `.${a.classList[0]}` : null),
        };
      }
    }
    if (a.classList.contains('sab-app-select')) return { sel: '.sab-app-select', inner: null };
    return null;
  }

  _restoreFocus(id) {
    if (!id) return;
    for (const scope of [this, this.controlsHost].filter(Boolean)) {
      const holder = scope.querySelector(id.sel);
      if (holder) { ((id.inner && holder.querySelector(id.inner)) || holder).focus?.(); return; }
    }
  }

  _render() {
    const focus = this._captureFocus();
    const app = this._app;
    const opt = (value, label) => `<option value="${escHtml(value)}">${escHtml(label)}</option>`;
    // The picker names the app in play; the buttons beside it act on that app.
    const top = `<div class="sab-top">
      <select class="sab-app-select" aria-label="Choose an App">
        ${opt('', 'Choose an App')}
        ${(this._apps || []).map((a) => `<option value="${escHtml(a.slug)}"
          ${app && app.slug === a.slug ? 'selected' : ''}>${
          escHtml(`${a.icon ? a.icon + ' ' : ''}${a.name}`)}</option>`).join('')}
        ${opt('__new', 'Create new app…')}
      </select>
      ${app ? `<span class="sab-app-btns">
        <span class="sab-tablist" role="tablist" aria-label="What to edit">
        ${TABS.map((t) => {
          // features/customize show two columns — the left one keeps its long-
          // standing id (sab-areas / sab-custom), the right pantry gets a
          // per-instance one; the tab governs both.
          const controls = t.key === 'features' ? `sab-areas ${this._uid}-panel-features-right`
            : t.key === 'customize' ? `sab-custom ${this._uid}-panel-customize-right`
            : `${this._uid}-panel-${t.key}`;
          return `<button type="button" role="tab" class="sab-app-btn sab-tab"
          id="${this._uid}-tab-${t.key}" data-tab="${t.key}"
          aria-controls="${controls}" aria-selected="${this._tab === t.key}"
          tabindex="${this._tab === t.key ? '0' : '-1'}">${t.label}</button>`;
        }).join('')}
        </span>
        ${app.registered === false
          ? '<button type="button" class="sab-app-btn" data-action="register">Add to the plugin catalog</button>'
          : ''}
      </span>` : ''}
    </div>`;
    const err = this._error ? `<p class="sab-error">${escHtml(this._error)}</p>` : '';

    const host = this.controlsHost;
    if (host) host.innerHTML = top;
    if (!app) {
      this.classList.remove('sab-two-col', 'sab-one-col');
      this.innerHTML = (host ? '' : top) + err + (this._mode ? this._render_chooser() : '');
      this.append(this._a11y);
      this._afterRender(focus);
      return;
    }
    // Two of the tabs work in two columns — what the app has on the left, what
    // you can put in it on the right. Metadata and Preview take the whole
    // width. Nothing pops: every tab renders here.
    const twoCol = this._tab === 'features' || this._tab === 'customize';
    this.classList.toggle('sab-two-col', twoCol);
    this.classList.toggle('sab-one-col', !twoCol);
    const body = this._tab === 'features'
      ? `<div class="sab-areas" id="sab-areas" role="tabpanel"
           aria-labelledby="${this._uid}-tab-features"
         ><p class="sab-hint">Loading the layout…</p></div>
         ${this._render_pantry({ panelId: `${this._uid}-panel-features-right` })}`
      : this._tab === 'customize'
        ? `<div class="sab-areas" id="sab-custom" role="tabpanel"
             aria-labelledby="${this._uid}-tab-customize"
           ><p class="sab-hint">Loading the layout…</p></div>
           ${this._render_pantry({ elements: false, target: '#sab-custom', panelId: `${this._uid}-panel-customize-right` })}`
        : this._tab === 'preview'
          ? `<div class="sab-pane sab-preview-pane" role="tabpanel" id="${this._uid}-panel-preview"
               aria-labelledby="${this._uid}-tab-preview"><iframe class="sab-preview"
               src="${escHtml(app.folder)}index.html"
               title="Preview of ${escHtml(app.name)}"></iframe></div>`
          : `<div class="sab-pane sab-meta-pane" role="tabpanel" id="${this._uid}-panel-meta"
              aria-labelledby="${this._uid}-tab-meta"><fieldset class="sab-panel"><legend><h2 class="sab-legend-h">${
              escHtml(app.name)}</h2></legend><div id="sab-meta"></div>
              <div class="sab-meta-danger"><button type="button" class="sab-del-app"
                data-del-app="${escHtml(app.slug)}">Delete this app</button></div>
              </fieldset></div>`;
    this.innerHTML = `${host ? '' : top}${body}${err}`;
    this.append(this._a11y);
    queueMicrotask(() => this._mountTab());
    this._afterRender(focus);
  }

  // The common tail of a render: put focus back where it was, and announce a
  // new error to a screen reader (the visible .sab-error is rebuilt each time,
  // so on its own it never announces).
  _afterRender(focus) {
    this._restoreFocus(focus);
    if (this._error && this._error !== this._announcedError) {
      this._announce(this._error);
      this._announcedError = this._error;
    } else if (!this._error) {
      this._announcedError = null;
    }
  }

  // Fill the tab the work area is showing.
  _mountTab() {
    if (this._tab === 'features' || this._tab === 'customize') return this._mountAreaAccordion();
    if (this._tab === 'preview') {
      const frame = this.querySelector('iframe.sab-preview');
      if (frame) frame.addEventListener('load', () => this._decoratePreview(frame));
      return undefined;
    }
    return this._mountMetaForm();
  }

  // Shown when no app is picked: the create form (picker on "Create new app…"),
  // or a prompt to pick one.
  _render_chooser() {
    if (this._mode === 'new') {
      return `<form class="sab-new">
  <input name="app-name" placeholder="App name" required aria-label="App name">
  <input name="app-icon" placeholder="Icon (emoji or URL)" size="14" aria-label="Icon">
  <button type="submit">Create</button>
</form>`;
    }
    if (this._apps === null) return `<p class="sab-hint">Loading…</p>`;
    if (!this._apps.length) {
      return `<p class="sab-hint">No apps yet under ${escHtml(this.appsRoot || '?')} — pick
        <strong>Create new app…</strong> above to make one.</p>`;
    }
    return `<p class="sab-hint">Pick an app above to work on it.</p>`;
  }

  // ── step 1: Edit Interface (layout areas ← drag from the elements list) ──

  _isChrome(part) {
    if (part.kind === 'link') return true;
    if (part.kind !== 'leaf') return false;
    return ['sol-menu', 'sol-tabs', 'sol-dropdown-button'].includes(part.item.tag);
  }

  _chipHtml(part, { removable = true } = {}) {
    const iri = part.node.value;
    const label = this._chipLabel(part);
    return `<span class="sab-chip" draggable="true" role="listitem" tabindex="0"
      aria-roledescription="movable item" aria-describedby="${this._uid}-dnd-help"
      data-node="${escHtml(iri)}">${escHtml(label)}${
      removable ? `<button type="button" class="sab-chip-x"
      data-el-action="remove" aria-label="Remove ${escHtml(label)}">✕</button>` : ''}</span>`;
  }

  // What a chip calls itself: a menu-consuming element takes the MENU's own
  // label ("Main menu"), not the component's ("Tabbed Menu" — that is its kind).
  _chipLabel(part) {
    const menu = this._menuOf(part);
    const named = menu && this._menuLabels && this._menuLabels.get(menu.source);
    // …unless the label IS the icon (the ☰ menu names itself with its glyph),
    // which would read twice over.
    if (named && named !== this._chipIcon(part)) return named;
    return part.kind === 'link'
      ? (part.label || 'Link')
      : (part.item.name || part.item.tag || 'Item');
  }

  // Every menu label — and declared ui:view — the layout's from-rdf leaves
  // name, read once per document.
  async _loadMenuLabels(tree) {
    this._menuLabels = new Map();
    this._menuViews = new Map();
    const sources = new Set();
    (function walk(n) {
      if (!n) return;
      if (n.kind === 'region') { n.parts.forEach(walk); return; }
      if (n.kind !== 'leaf') return;
      const v = new Map(n.item.params || []).get('from-rdf');
      if (v) sources.add(v);
    })(tree);
    const docs = new Map();
    for (const src of sources) {
      const abs = new URL(src, this._layoutUrl).href;
      const doc = abs.split('#')[0];
      if (!docs.has(doc)) {
        try { docs.set(doc, await loadRdfStore(doc, freshFetch)); } catch { docs.set(doc, null); }
      }
      const store = docs.get(doc);
      const label = store && store.any(rdf.sym(abs), rdf.sym(UI + 'label'));
      if (label && label.value) this._menuLabels.set(abs, label.value);
      const view = store && store.any(rdf.sym(abs), rdf.sym(UI + 'view'));
      if (view && view.value) this._menuViews.set(abs, view.value.split('#').pop());
    }
  }

  // The glyph that stands for what the element IS. Chips read as plain text —
  // this is what a chip must NOT be labelled with (a ☰ menu names itself with
  // its glyph) and what a removed element is remembered by.
  _chipIcon(part) {
    if (part.kind === 'link') return '🔗';
    const menu = this._menuOf(part);
    if (menu && menu.view && MENU_VIEWS[menu.view]) return MENU_VIEWS[menu.view].icon;
    // View-less menu: the legacy mount sniff.
    const tag = part.item.tag;
    const cls = new Map(part.item.params || []).get('class') || '';
    if (tag === 'sol-dropdown-button') return '☰';   // the Button (hamburger) menu
    if (tag === 'sol-tabs') return '🗂';
    if (tag === 'sol-menu') return cls.includes('app-bar') ? '🔘' : '🗂';
    return part.item.icon || '';
  }

  // Right pane: one flat list of draggable Interface elements — the things you can
  // add, plus whatever has been removed from the layout (elements AND areas,
  // all one bin) waiting to go back.
  _renderFeatures() {
    const box = this.querySelector('#sab-features');
    if (!box) return;
    const focus = this._captureFocus();
    const feat = (feature, label) => `<div class="sab-feat" draggable="true" role="button" tabindex="0"
      aria-describedby="${this._uid}-dnd-help"
      data-feature="${escHtml(JSON.stringify(feature))}">${escHtml(label)}</div>`;
    // The areas the layout is WITHOUT — read from the layout, so they stay on
    // offer across reloads. Each always goes back to its own place, so both
    // gestures do the same thing: click it, or drag it onto any area.
    const areaBtn = (key, label) => `<button type="button" class="sab-feat" draggable="true"
      data-restore-area="${escHtml(key)}"
      data-feature="${escHtml(JSON.stringify({ op: 'restore-area', area: key }))}"
      aria-label="Put ${escHtml(label)} back"
      title="Put ${escHtml(label)} back">${escHtml(label)}<span class="sab-chip-icon" aria-hidden="true">↩</span></button>`;
    const missingAreas = this._tree
      ? STANDARD_AREAS.filter((spec) => !findArea(this._tree, spec))
        .map((spec) => areaBtn(spec.key, spec.label)).join('')
      : '';
    const removed = (this._removed || [])
      .map((r) => feat({ op: 'restore', id: r.id, restore: r.restore }, r.label)).join('');
    box.innerHTML = Object.entries(MENU_VIEWS)
      .map(([view, spec]) => feat({ op: 'menu-view', view }, spec.label)).join('')
      + missingAreas + removed;
    this._restoreFocus(focus);
    this._renderContentList();
  }

  // The HTML Content panel: a new file, plus every standard page the layout is
  // currently WITHOUT — they are content, so this is the bin they return to.
  _renderContentList() {
    const box = this.querySelector('#sab-content');
    if (!box) return;
    const focus = this._captureFocus();
    const missing = this._tree
      ? STANDARD_LINKS.filter((l) => !hasLink(this._tree, l.file))
        .map((l) => `<div class="sab-feat" draggable="true" role="button" tabindex="0"
          aria-describedby="${this._uid}-dnd-help"
          data-feature="${escHtml(JSON.stringify({ op: 'link', key: l.key }))}"
          >${escHtml(l.label)}</div>`).join('')
      : '';
    box.innerHTML = `<div class="sab-feat" draggable="true" role="button" tabindex="0"
      aria-describedby="${this._uid}-dnd-help" data-content="new"
      >New HTML Content</div>${missing}`;
    this._restoreFocus(focus);
  }

  async _saveLayout() {
    const body = serializeLayout(this._tree, {
      docUrl: this._layoutUrl,
      comment: 'App layout — owned by the app builder; regenerate index.html after changes.',
    });
    const r = await solFetch(this._layoutUrl, {
      method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body,
    });
    if (!r.ok) { this._error = `Couldn't save layout.ttl — ${r.status}`; return; }
    await this._generate({ silent: true });   // the page follows the layout
  }

  // Add a dropped feature to a region: Content (ui:Link → new html), a Button
  // Menu / Button bar / Tabs (a menu-consuming component with a fresh from-rdf
  // doc), or a catalog Plugin (component leaf, or ui:Link for a link plugin).
  async _addFeature(payload, regionIri) {
    if (!this._tree || !regionIri) return;
    const mod = (file) => `${this.componentsBase}/web/${file}`;
    if (payload.op === 'link') {
      const spec = STANDARD_LINKS.find((l) => l.key === payload.key);
      if (!spec) return;
      addLink(this._tree, regionIri,
        { label: spec.label, url: spec.file, comment: spec.comment }, this._layoutUrl);
      await this._saveLayout();
      await this._seedIfAbsent(new URL(spec.file, this._layoutUrl).href,
        starterFor(spec.file), 'text/html');
    } else if (payload.op === 'menu-view' || payload.op === 'menu' || payload.op === 'bar' || payload.op === 'tabs') {
      // Legacy op spellings map to their views (menu = the ☰ Button Menu).
      const view = payload.view
        || (payload.op === 'menu' ? 'MenuButton' : payload.op === 'bar' ? 'Toolbar' : 'Tablist');
      const spec = MENU_VIEWS[view];
      if (!spec) return;
      const frag = await this._mintMenuFragment(spec.frag);
      const item = { label: spec.label, module: mod(spec.file),
        params: [...spec.pre, ['from-rdf', `app-menu.ttl#${frag}`], ...spec.post] };
      addLeaf(this._tree, regionIri, item, this._layoutUrl);
      await this._saveLayout();
      await this._ensureMenuFragment(new URL('app-menu.ttl', this._layoutUrl).href, frag,
        seedAppMenu({ label: frag, fragment: frag, orientation: spec.orientation, view }));
    } else if (payload.op === 'restore') {
      const rd = payload.restore || {};
      if (rd.type === 'link') addLink(this._tree, regionIri, { label: rd.label, url: rd.url }, this._layoutUrl);
      else addLeaf(this._tree, regionIri, { label: rd.label, module: rd.module, params: rd.params || [] }, this._layoutUrl);
      await this._saveLayout();
      this._removed = this._removed.filter((r) => r.id !== payload.id);   // out of the pantry
    } else return;
    this._renderAreaAccordion();
    this._renderFeatures();
  }

  // The only chip action is Remove (reorder is drag). A removed leaf/link is
  // offered back in the Interface-elements list.
  async _elementAction(btn) {
    const row = btn.closest('[data-node]');
    if (!row || !this._tree || btn.dataset.elAction !== 'remove') return;
    const part = this._findPart(row.dataset.node);
    if (part && part.kind !== 'link') this._removed.push(this._descriptorFor(part));
    removeLeaf(this._tree, row.dataset.node);
    await this._saveLayout();
    this._renderAreaAccordion();
    this._renderFeatures();
  }

  // An area's ✕ takes the region out of the layout and out of the display, and
  // BREAKS IT UP: the area itself goes back on offer in that list, each
  // chip it held goes back to its own bin (a footer's Footer link lands in
  // HTML Content). The area therefore returns empty, and its contents are
  // placed again wherever the owner wants them.
  async _removeArea(regionIri) {
    if (!this._tree || !regionIri) return;
    const cut = removeRegion(this._tree, regionIri);
    if (!cut) return;
    for (const part of this._chipPartsIn(cut.region)) {
      if (part.kind !== 'link') this._removed.push(this._descriptorFor(part));
    }
    await this._saveLayout();
    this._renderAreaAccordion();
    this._renderFeatures();
  }

  // The catalog entry is where the app is named, so a label edited there IS
  // the app's new name: it goes into app.ttl, and from there into the picker,
  // the banner, and the generated page.
  async _adoptEntryName(app) {
    if (!app || !app.entry) return;
    let label = '';
    let icon = '';
    try {
      const store = await loadRdfStore(app.entry.split('#')[0], freshFetch);
      const entry = rdf.sym(app.entry);
      label = (store.any(entry, rdf.sym(UI + 'label')) || {}).value || '';
      icon = (store.any(entry, rdf.sym(UI + 'icon')) || {}).value || '';
    } catch { /* catalog unreadable — leave the app as it is */ }
    if (label && (label !== app.name || icon !== app.icon)) {
      const previous = app.name;
      const r = await solFetch(`${app.folder}app.ttl`, {
        method: 'PUT', headers: { 'Content-Type': 'text/turtle' },
        body: appTurtle(label, icon),
      });
      if (!r.ok) { this._error = `Couldn't rename the app — ${r.status}`; return; }
      app.name = label;
      app.icon = icon;
      if (this._app && this._app.slug === app.slug) {
        this._app.name = label;
        this._app.icon = icon;
      }
      await this._nameTheBanner(app, previous);
      await this._generate({ silent: true });
    }
    await this._loadApps();
  }

  // Preview-only decoration, injected into the frame: each landmark gets its
  // own tint and name, and a menu with nothing in it says so rather than
  // rendering as a blank strip. The generated app carries none of this.
  _decoratePreview(frame) {
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc || !doc.head) return;
    const style = doc.createElement('style');
    style.textContent = PREVIEW_CSS;
    doc.head.appendChild(style);
    // A menu component knows its own items; it reads them asynchronously, so
    // give the read a moment before calling one empty. An empty menu shows
    // DUMMY items of its own kind, so the preview still reads as the app: a
    // tabbed menu shows tabs, a button bar shows buttons.
    let tries = 0;
    const mark = () => {
      // NOT the ☰ — a dropdown button always renders its own trigger, so a
      // mock beside it would be a second, dead hamburger.
      for (const el of doc.querySelectorAll('sol-menu, sol-tabs')) {
        if (el.nextElementSibling && el.nextElementSibling.classList.contains('sab-mock')) continue;
        const items = el.items;
        if (!Array.isArray(items) || items.length) continue;
        el.after(this._mockMenuFor(doc, el));
      }
      if (++tries < 8) setTimeout(mark, 250);
    };
    setTimeout(mark, 250);
  }

  // What an empty menu would look like once it has items — same shape, same
  // place, greyed and labelled so it is never mistaken for real content.
  _mockMenuFor(doc, el) {
    const cls = el.getAttribute('class') || '';
    // Only the BAR is a bar. A plain sol-menu is the Tabbed Menu — what the
    // owner chose, and what the mock must keep calling it.
    const kind = cls.includes('app-bar') ? 'bar' : 'tabs';
    const wrap = doc.createElement('span');
    wrap.className = `sab-mock sab-mock-${kind}`;
    wrap.title = 'nothing in this menu yet — drop a plugin onto it in the builder';
    const labels = kind === 'bar'
      ? ['Dummy button 1', 'Dummy button 2', 'Dummy button 3']
      : ['Dummy tab 1', 'Dummy tab 2', 'Dummy tab 3'];
    for (const text of labels) {
      const item = doc.createElement('span');
      item.className = 'sab-mock-item';
      item.textContent = text;
      wrap.appendChild(item);
    }
    return wrap;
  }

  // One floating, resizable window holding a shape-driven form over `subject`.
  // The shape is picked by the subject's rdf:type (ui:Link / ui:Component /
  // ui:Plugin), so one call serves every editable node.
  async _mountForm(host, subject, onChange, shapeUrl = EDIT_SHAPE_URL) {
    // sol-form's shape-driven fields render through solid-ui, so the editing
    // BUNDLE is what has to arrive — loaded on first use, not up front.
    await import('./sol-form-bundle.js').catch(() => import('./sol-form.js').catch(() => {}));
    const form = document.createElement('sol-form');
    form.recordMode = true;                  // one record — never the rolodex pivot
    form.setAttribute('shape', shapeUrl);
    form.setAttribute('subject', subject);
    const resync = () => onChange && onChange();
    form.addEventListener('sol-form-save', resync);
    form.addEventListener('sol-form-change', resync);
    host.appendChild(form);
    return form;
  }

  // The drag-drop manager under a menu form owns the menu's items; the form's
  // own "menu items" field would double that surface, so this app removes the
  // field from the rendered form — on every (re)render, since the form
  // rebuilds its fields after loads and saves. sol-form itself stays generic.
  _stripFormField(form, key) {
    if (!form) return;
    const root = () => form.shadowRoot || form;
    const strip = () => {
      root().querySelectorAll(`[data-key="${key}"]`).forEach((n) => n.remove());
    };
    strip();
    new MutationObserver(strip).observe(root(), { childList: true, subtree: true });
  }

  // The named file's own text, in a textarea with its own save, under the
  // fields that name it.
  async _appendContentEditor(host, url) {
    const docUrl = new URL(url, this._layoutUrl).href;
    const box = document.createElement('section');
    box.style.cssText = 'display:flex; flex-direction:column; gap:.4rem; margin:.9rem 0 .2rem;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; gap:.6rem; flex-wrap:wrap;';
    const name = document.createElement('strong');
    name.textContent = docUrl.split('/').pop();
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save content';
    save.style.cssText = 'font-size:1rem; padding:.35rem .8rem; border-radius:.3rem;'
      + ' border:1px solid transparent; background:var(--accent, #1F618D); color:#fff; cursor:pointer;';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');   // updated in place — announces its own changes
    status.style.cssText = 'color:var(--text-muted, #4d4d4d);';
    const area = document.createElement('textarea');
    area.rows = 12;
    area.spellcheck = false;
    area.setAttribute('aria-label', `Content of ${name.textContent}`);
    area.style.cssText = 'width:100%; box-sizing:border-box; min-height:12rem; resize:vertical;'
      + ' font-family:var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);'
      + ' font-size:1rem; padding:.5rem; border-radius:.3rem;'
      + ' border:1px solid var(--input-border, #9aa0a8);'
      + ' background:var(--input-bg, #eef); color:var(--input-text, #1a1a1a);';
    head.append(name, save, status);
    box.append(head, area);
    host.appendChild(box);

    const res = await freshFetch(docUrl).catch(() => null);
    if (!res || !res.ok) {
      area.value = '';
      status.textContent = `not there yet — saving creates it`;
    } else {
      area.value = await res.text();
    }
    area.addEventListener('input', () => { status.textContent = ''; });
    save.addEventListener('click', async () => {
      status.textContent = 'Saving…';
      const put = await solFetch(docUrl, {
        method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: area.value,
      }).catch(() => null);
      status.textContent = put && put.ok ? 'Saved' : `Couldn't save (${put ? put.status : 'no reply'})`;
    });
  }

  // Everything in a region that showed as a chip (nested regions included).
  _chipPartsIn(region) {
    const out = [];
    const walk = (r) => {
      if (!r) return;
      if (r.kind === 'region') { r.parts.forEach(walk); return; }
      if (this._isChrome(r)) out.push(r);
    };
    walk(region);
    return out;
  }

  // Put an area back where it belongs, empty — its old contents are waiting in
  // the list.
  async _restoreArea(key) {
    const spec = STANDARD_AREAS.find((a) => a.key === key);
    if (!spec || !this._tree || findArea(this._tree, spec)) return;
    const region = this._newArea(spec);
    let parent, index;
    if (spec.band === 'root') {
      parent = this._tree;
      index = spec.key === 'Header' ? 0 : parent.parts.length;
    } else {
      parent = this._middleBand();
      if (!parent) return;
      const main = parent.parts.findIndex((p) => p.kind === 'region' && p.role === 'main');
      if (main < 0) return;
      index = spec.key === 'Left' ? main : main + 1;
    }
    if (!insertPart(this._tree, parent.node.value, region, index)) return;
    await this._saveLayout();
    this._renderAreaAccordion();
    this._renderFeatures();
  }

  // The horizontal band Main sits in — a sidebar goes beside Main, so a layout
  // whose Main sits straight under the root gets one wrapped around it.
  _middleBand() {
    const main = findArea(this._tree, { role: 'main', cls: '' });
    if (!main) return null;
    const parent = findParentOf(this._tree, main.node.value);
    if (!parent) return null;
    if (parent !== this._tree) return parent;
    const band = this._newArea({
      key: 'Middle', label: 'Middle', role: 'region', cls: '', orientation: 'horizontal',
    });
    band.comment = 'Sidebars and main pane, side by side';
    const i = parent.parts.indexOf(main);
    parent.parts.splice(i, 1, band);
    band.parts.push(main);
    return band;
  }

  // A fresh, empty region for one of the standard areas.
  _newArea(spec) {
    const frag = mintFragment(spec.key, usedTreeFragments(this._tree));
    return {
      kind: 'region',
      node: { value: `${String(this._layoutUrl).split('#')[0]}#${frag}` },
      label: spec.label, comment: null, role: spec.role,
      roleTag: null, additionalTypeIri: null, semantic: null, tag: null,
      orientation: spec.orientation || 'vertical', columns: null,
      params: spec.cls ? [['class', spec.cls]] : [],
      parts: [],
    };
  }

  // Find a leaf/link part in the tree by its node IRI.
  _findPart(iri) {
    let found = null;
    (function walk(r) {
      if (!r) return;
      if (r.kind === 'region') r.parts.forEach(walk);
      else if (r.node && r.node.value === iri) found = r;
    })(this._tree);
    return found;
  }

  // Describe a removed component so it can be re-offered in the list — and
  // restored with its own from-rdf binding, so its menu items come back too.
  _descriptorFor(part) {
    const params = part.item.params || [];
    return {
      id: ++this._removedSeq,
      label: this._chipLabel(part),
      icon: this._chipIcon(part),
      // the component's OWN name, not the display label — restoring must not
      // rename the leaf to whatever its menu happens to be called
      restore: { type: 'component', label: part.item.name, module: part.url, params },
    };
  }

  // Next free fragment in the app's menu doc (app-menu.ttl may hold several
  // menus — #MainMenu, #MainButtonBar, #MainHamburgerMenu, added #Menu/#Tabs…).
  async _mintMenuFragment(base) {
    const docUrl = new URL('app-menu.ttl', this._layoutUrl).href;
    const taken = new Set();
    try {
      const store = await loadRdfStore(docUrl, freshFetch);
      for (const st of store.statementsMatching(null, null, null)) {
        for (const t of [st.subject, st.object]) {
          const v = t && t.value;
          if (typeof v === 'string' && v.startsWith(docUrl + '#')) taken.add(v.slice(docUrl.length + 1));
        }
      }
    } catch { /* newborn doc */ }
    return mintFragment(base, taken);
  }



  // ── step 1 drag & drop: list feature / chip → layout area ───────────

  // A chip (existing element) or a list feature source begins dragging.
  _mintBeforeDrop(e) {
    const mgr = e.target.closest
      && e.target.closest('sol-menu-manager, sol-button-bar-manager');
    if (!mgr) return;
    const types = [...((e.dataTransfer && e.dataTransfer.types) || [])];
    if (!types.includes(PLUGIN_MIME)) return;
    let card = null;
    try { card = JSON.parse(e.dataTransfer.getData(PLUGIN_MIME)); } catch { card = null; }
    if (!card || !card.newContent) return;
    e.preventDefault();
    e.stopPropagation();
    this._resolveNewContent(card).then((item) => mgr.addPlugin(item));
  }

  _onFeatureDragStart(e) {
    const chip = e.target.closest && e.target.closest('.sab-chip[data-node]');
    if (chip) {
      e.dataTransfer.setData(SAB_MIME, JSON.stringify({ op: 'move', node: chip.dataset.node }));
      e.dataTransfer.effectAllowed = 'move';
      return;
    }
    // The content shelf writes the PANTRY's payload, so a region takes it as a
    // ui:Link and a menu takes it as a link item — the same drop either way.
    const content = e.target.closest && e.target.closest('[data-content]');
    if (content) {
      // The file is minted on DROP — a drag can't wait on the pod to say which
      // names are free.
      e.dataTransfer.setData(PLUGIN_MIME,
        JSON.stringify({ label: 'Content', newContent: true, icon: '🔗' }));
      e.dataTransfer.effectAllowed = 'copy';
      return;
    }
    const feat = e.target.closest && e.target.closest('.sab-feat[data-feature]');
    if (feat) {
      e.dataTransfer.setData(SAB_MIME, feat.dataset.feature);
      // A standard page is content: it can go into a region OR into a menu, so
      // it carries both contracts and the drop target decides.
      let spec = null;
      try { spec = JSON.parse(feat.dataset.feature); } catch { spec = null; }
      const link = spec && spec.op === 'link' && STANDARD_LINKS.find((l) => l.key === spec.key);
      if (link) {
        e.dataTransfer.setData(PLUGIN_MIME,
          JSON.stringify({ label: link.label, href: link.file }));
      }
      e.dataTransfer.effectAllowed = 'copy';
    }
  }

  _onFeatureDragOver(e) {
    const drop = e.target.closest && e.target.closest('.sab-drop, .sab-drop-el');
    if (!drop) return;
    const types = [...((e.dataTransfer && e.dataTransfer.types) || [])];
    if (!types.includes(SAB_MIME) && !types.includes(PLUGIN_MIME)) return;
    e.preventDefault();
    this.querySelectorAll('.sab-drop-over').forEach((el) => { if (el !== drop) el.classList.remove('sab-drop-over'); });
    drop.classList.add('sab-drop-over');
  }

  async _onFeatureDrop(e) {
    const types = [...((e.dataTransfer && e.dataTransfer.types) || [])];
    const drop = e.target.closest && e.target.closest('.sab-drop, .sab-drop-el');
    if (!drop) return;
    // Customize: dropped on an element, it goes INTO that element.
    if (drop.classList.contains('sab-drop-el')) {
      let card = null;
      try { card = JSON.parse(e.dataTransfer.getData(PLUGIN_MIME)); } catch { card = null; }
      this.querySelectorAll('.sab-drop-over').forEach((el) => el.classList.remove('sab-drop-over'));
      if (!card) return;
      e.preventDefault();
      await this._dropOnElement(drop.dataset.editNode, card);
      return;
    }
    // A plugin card from the pantry (step 2) — a different contract.
    if (types.includes(PLUGIN_MIME) && !types.includes(SAB_MIME)) {
      let card = null;
      try { card = JSON.parse(e.dataTransfer.getData(PLUGIN_MIME)); } catch { card = null; }
      this.querySelectorAll('.sab-drop-over').forEach((el) => el.classList.remove('sab-drop-over'));
      if (!card) return;
      e.preventDefault();
      await this._addPlugin(card, drop.dataset.region);
      return;
    }
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData(SAB_MIME)); } catch { payload = null; }
    this.querySelectorAll('.sab-drop-over').forEach((el) => el.classList.remove('sab-drop-over'));
    if (!payload) return;
    e.preventDefault();
    // Drop onto a chip = insert before it (reorder); onto the area = append.
    const beforeChip = e.target.closest('.sab-chip[data-node]');
    const beforeIri = beforeChip ? beforeChip.dataset.node : null;
    await this._applyFeaturePayload(payload, drop.dataset.region, beforeIri);
  }

  // The SAB_MIME dispatch, shared by the pointer drop above and the keyboard
  // path below: an area restore, a chip move, or a new feature.
  async _applyFeaturePayload(payload, regionIri, beforeIri) {
    if (!payload) return;
    // An area returns to its own slot — the target region doesn't matter.
    if (payload.op === 'restore-area') { await this._restoreArea(payload.area); return; }
    if (payload.op === 'move') { await this._moveChip(payload.node, regionIri, beforeIri); return; }
    await this._addFeature(payload, regionIri);
  }

  // Move a chip into a region, before `beforeIri` (or to the end when null),
  // then persist and repaint. Returns true when something actually moved.
  async _moveChip(nodeIri, regionIri, beforeIri) {
    if (nodeIri === beforeIri) return false;
    if (!moveNode(this._tree, nodeIri, regionIri, beforeIri)) return false;
    await this._saveLayout();
    this._renderAreaAccordion();
    return true;
  }

  // ── step 2: Add Plugins (catalog pantry + the app's menu managers) ────

  // The catalog column, placed by _render as the component's SECOND column so
  // it runs the whole height — level with the app picker, not with the first
  // region below it.
  // `elements` — the Interface-elements list, which places NEW menus and bars.
  // Customize edits what the app already has, so it shows the rest only.
  // `target` — the column whose menu editors the plugin cards drop into.
  _render_pantry({ elements = true, target = '#sab-areas', panelId = '' } = {}) {
    const idAttr = panelId ? ` id="${panelId}"` : '';
    let html = `<div class="sab-right"${idAttr}>
    ${elements ? `<fieldset class="sab-panel sab-panel-elements"><legend><h2 class="sab-legend-h">Interface elements</h2></legend>
      <div id="sab-features"></div>
    </fieldset>` : ''}
    <fieldset class="sab-panel sab-shelf"><legend><h2 class="sab-legend-h">HTML Content</h2></legend>
      <div id="sab-content"></div>
    </fieldset>`;
    if (this.catalog) {
      // The catalog names itself inside its own shadow tree; the panel's legend
      // says it instead, so the name sits on the border like every other panel —
      // and its own ＋ add is hidden in favour of the one on that border.
      html += `<fieldset class="sab-panel sab-panel-fill"><legend><h2 class="sab-legend-h">Plugins Available</h2></legend>
        <button type="button" class="sab-panel-btn" data-action="add-plugin"
          title="Add plugins">Add plugins</button>
        <sol-plugin-manager grouped source="${escHtml(this.catalog)}"
          for="${escHtml(target)} sol-menu-manager, ${escHtml(target)} sol-button-bar-manager"
          ></sol-plugin-manager>
      </fieldset>`;
    } else {
      html += `<p class="sab-hint">No catalog attribute set — no plugins to place.</p>`;
    }
    return `${html}</div>`;
  }

  // Left: one card per region, holding everything that region carries —
  // menus, content links and plugins alike, all as chips. One card is open at
  // a time; a closed card's header still takes a drop.
  async _mountAreaAccordion() {
    const box = this.querySelector('#sab-areas') || this.querySelector('#sab-custom');
    const app = this._app;
    if (!box || !app) return;
    try {
      this._layoutUrl = `${app.folder}layout.ttl`;
      const store = await loadRdfStore(this._layoutUrl, freshFetch);
      this._tree = parseLayoutTree(store, rdf.sym(`${this._layoutUrl}#Layout`));
      this._paintLayout();
      await this._loadMenuLabels(this._tree);
      this._paintLayout();
    } catch {
      box.innerHTML = `<p class="sab-hint">Couldn't read this app's layout.ttl.</p>`;
    }
  }

  // Whichever column the layout is showing in.
  _paintLayout() {
    this._renderAreaAccordion();
    this._renderFeatures();
    this._renderContentList();
    this._renderCustomList();
  }

  // Every region that can hold parts, in layout order.
  _fillableAreas(region = this._tree, out = []) {
    if (!region || region.kind !== 'region') return out;
    const isWrapper = region.parts.length > 0 && region.parts.every((p) => p.kind === 'region');
    if (!isWrapper) out.push(region);
    region.parts.forEach((p) => this._fillableAreas(p, out));
    return out;
  }

  // The menu document a component reads, the manager that edits it (a bar is
  // flat — no submenus), and the shape its metadata answers to. The menu doc's
  // declared ui:view picks all three; a view-less menu falls back to the
  // legacy mount sniff (class=app-bar / element tag).
  _menuOf(part) {
    if (!part || part.kind !== 'leaf') return null;
    const params = new Map(part.item.params || []);
    const from = params.get('from-rdf');
    if (!from) return null;
    const source = new URL(from, this._layoutUrl).href;
    const view = this._menuViews && this._menuViews.get(source);
    const spec = view && MENU_VIEWS[view];
    if (spec) return { source, view, manager: spec.manager, shape: spec.shape };
    const bar = (params.get('class') || '').includes('app-bar');
    const tag = part.item.tag;
    return {
      source,
      manager: bar ? 'sol-button-bar-manager' : 'sol-menu-manager',
      shape: bar ? 'ToolbarMenuShape'
        : tag === 'sol-dropdown-button' ? 'MenuButtonMenuShape' : 'TablistMenuShape',
    };
  }

  // Every card shows what its region holds. Collapsing them hid most of the
  // app: a region's body IS its chips, so there is nothing to fold away.
  _renderAreaAccordion() {
    const box = this.querySelector('#sab-areas');
    if (!box || !this._tree) return;
    const focus = this._captureFocus();
    box.innerHTML = this._fillableAreas().map((region) => {
      const iri = region.node.value;
      const chips = region.parts
        .filter((p) => p.kind === 'leaf' || p.kind === 'link')
        .map((p) => this._featureChipHtml(p)).join('');
      const label = region.label || 'Region';
      // Main is the one region that stays: it is what the menus open into.
      const x = region.role === 'main' ? '' : `<button type="button" class="sab-area-x"
        data-area-action="remove" data-area="${escHtml(iri)}"
        aria-label="Remove ${escHtml(label)}">✕</button>`;
      return `<fieldset class="sab-acc-area"><legend class="sab-acc-head sab-drop"
        data-region="${escHtml(iri)}"><h3 class="sab-legend-h">${escHtml(label)}</h3></legend>${x}<div
        class="sab-acc-body sab-drop" role="list" data-region="${escHtml(iri)}">${
        chips || '<span class="sab-hint">drop a plugin or content here</span>'}</div></fieldset>`;
    }).join('');
    this._restoreFocus(focus);
  }

  // Customize's left column: everything in the app you can edit, flat and in
  // layout order — links, menus, plugins. Regions are not editable here; they
  // are what Add Features arranges.
  _renderCustomList() {
    const box = this.querySelector('#sab-custom');
    if (!box || !this._tree) return;
    const focus = this._captureFocus();
    const parts = this._fillableAreas()
      .flatMap((region) => region.parts.filter((p) => p.kind === 'leaf' || p.kind === 'link'));
    if (!parts.length) {
      box.innerHTML = '<p class="sab-hint">nothing to edit yet — add features first</p>';
      return;
    }
    box.innerHTML = `<div class="sab-els">${parts.map((part) => {
      const iri = part.node.value;
      return `<div class="sab-el" data-el="${escHtml(iri)}">
        <h3 class="sab-el-h"><button type="button" class="sab-el-head sab-drop-el" aria-expanded="false"
          aria-controls="${this._uid}-elbody-${cssId(iri)}"
          data-edit-node="${escHtml(iri)}">${escHtml(this._chipLabel(part))}</button></h3>
        <div class="sab-el-body" id="${this._uid}-elbody-${cssId(iri)}" hidden></div>
      </div>`;
    }).join('')}</div>`;
    this._restoreFocus(focus);
  }

  // Opening one unfolds it in place: its own fields, plus — for a menu — its
  // items with the pantry's drop zone, and — for a content link — the html
  // file itself. One open at a time.
  // A menu chip says "Edit <name>"; its editor lives on the Customize tab, so
  // go there first and open the row once the list has painted.
  async _editMenuChip(nodeIri) {
    if (this._tab !== 'customize') {
      this._tab = 'customize';
      this._render();
      for (let i = 0; i < 40 && !this.querySelector(`.sab-el[data-el="${cssQuote(nodeIri)}"]`); i++) {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    return this._openElement(nodeIri);
  }

  async _openElement(nodeIri) {
    const box = this.querySelector('#sab-custom');
    const part = this._findPart(nodeIri);
    if (!box || !part) return null;
    const row = box.querySelector(`.sab-el[data-el="${cssQuote(nodeIri)}"]`);
    if (!row) return null;
    const head = row.querySelector('.sab-el-head');
    const host = row.querySelector('.sab-el-body');
    if (head.getAttribute('aria-expanded') === 'true') return host;
    for (const other of box.querySelectorAll('.sab-el')) {
      if (other === row) continue;
      other.querySelector('.sab-el-head').setAttribute('aria-expanded', 'false');
      const body = other.querySelector('.sab-el-body');
      body.hidden = true;
      body.innerHTML = '';
    }
    head.setAttribute('aria-expanded', 'true');
    host.hidden = false;
    host.innerHTML = '';
    const label = this._chipLabel(part);
    const menu = this._menuOf(part);
    // Renaming an element renames its own header.
    const resync = () => this._loadMenuLabels(this._tree)
      .then(() => { head.textContent = this._chipLabel(this._findPart(nodeIri) || part); });
    if (menu) {
      // A form save may have changed the menu's ui:view — the doc is the
      // source of truth, so the mounted component follows it.
      const menuResync = async () => {
        await resync();
        const now = this._menuViews && this._menuViews.get(menu.source);
        if (now !== menu.view) await this._remountMenuView(nodeIri, now);
      };
      const form = await this._mountForm(host, menu.source, menuResync, `${EDIT_SHAPE_URL}#${menu.shape}`);
      this._stripFormField(form, 'itemListElement');
      await import(menu.manager === 'sol-button-bar-manager'
        ? './sol-button-bar-manager.js' : './sol-menu-manager.js').catch(() => {});
      const mgr = document.createElement(menu.manager);
      mgr.setAttribute('source', menu.source);
      mgr.setAttribute('heading', label);
      if (this.catalog) mgr.setAttribute('catalog', this.catalog);
      mgr.addEventListener('sol-menu-built', resync);
      host.appendChild(mgr);
      return host;
    }
    // A plugin answers for ITSELF: the settings its own component declares,
    // not the layout entry that names its module.
    if (part.kind === 'leaf' && await this._mountPluginSettings(host, part)) return host;
    await this._mountForm(host, nodeIri, resync, EDIT_SHAPE_URL);
    if (part.kind === 'link' && isContentUrl(part.url)) {
      await this._appendContentEditor(host, part.url);
    }
    return host;
  }

  // The component's own settings editor — whatever it declares (a shape, or a
  // named editor element). Its module has to arrive first: the form is the
  // class's, not the layout's. False when the plugin declares none.
  async _mountPluginSettings(host, part) {
    const tag = part.item && part.item.tag;
    const module = part.url;
    if (!tag) return false;
    if (!customElements.get(tag)) {
      if (!module) return false;
      try {
        await import(/* @vite-ignore */ module);
        await customElements.whenDefined(tag);
      } catch { return false; }
    }
    const Ctor = customElements.get(tag);
    if (!Ctor) return false;
    // an unattached instance carrying the layout's params, so the editor reads
    // the same subject the running component would
    const probe = document.createElement(tag);
    for (const [k, v] of (part.item.params || [])) probe.setAttribute(k, v);
    const spec = resolveEditorSpec(Ctor, probe);
    if (!spec || spec.self) return false;
    const editor = buildEditorElement(probe, spec);
    if (!editor) return false;
    host.appendChild(editor);
    return true;
  }

  _closeElement(nodeIri) {
    const row = this.querySelector(`.sab-el[data-el="${cssQuote(nodeIri)}"]`);
    if (!row) return;
    row.querySelector('.sab-el-head').setAttribute('aria-expanded', 'false');
    const body = row.querySelector('.sab-el-body');
    body.hidden = true;
    body.innerHTML = '';
  }

  // The menu doc's ui:view changed: remount the layout leaf to the view's
  // component (module, label, params), regenerate the page, and reopen the
  // editor so its form shape and manager re-key to the new view. A view with
  // no menu renderer keeps the current mount — the menu doc still records the
  // owner's choice.
  async _remountMenuView(nodeIri, view) {
    const part = this._findPart(nodeIri);
    if (!part || part.kind !== 'leaf') return;
    const spec = view && MENU_VIEWS[view];
    if (spec) {
      part.url = `${this.componentsBase}/web/${spec.file}`;
      part.item.tag = deriveTagFromModule(part.url);
      part.item.name = spec.label;
      // Rebuild the params around the leaf's own pairs: the old view's owned
      // pairs go (label, keep-alive; the bar's app-bar class token), the new
      // view's come in, everything else (from-rdf, region, custom classes)
      // rides through.
      const params = new Map((part.item.params || []).map(([k, v]) => [k, v]));
      params.delete('label');
      params.delete('keep-alive');
      if (params.has('class')) {
        const cls = params.get('class').split(/\s+/).filter((c) => c && c !== 'app-bar');
        if (cls.length) params.set('class', cls.join(' '));
        else params.delete('class');
      }
      for (const [k, v] of [...spec.pre, ...spec.post]) {
        if (k === 'class' && params.has('class')) params.set('class', `${params.get('class')} ${v}`);
        else params.set(k, v);
      }
      part.item.params = [...params.entries()];
      await this._saveLayout();
    }
    this._paintLayout();
    await this._openElement(nodeIri);
  }

  // A plugin (or a page from the HTML Content shelf) dropped on an element:
  // the element unfolds into its editor and takes the item, the way dropping
  // on a menu works in the pod browser's Customize.
  async _dropOnElement(nodeIri, payload) {
    const part = this._findPart(nodeIri);
    if (!part || !this._menuOf(part)) return;      // only menus and bars hold items
    const host = await this._openElement(nodeIri);
    const mgr = host && host.querySelector('sol-menu-manager, sol-button-bar-manager');
    if (!mgr) return;
    const item = await this._resolveNewContent(payload);
    // the manager reads its menu asynchronously; it can only take an item once
    // it has one to add to
    if (!mgr.placeTargets || !mgr.placeTargets.label) {
      await new Promise((done) => {
        const go = () => { mgr.removeEventListener('sol-menu-built', go); done(); };
        mgr.addEventListener('sol-menu-built', go);
        setTimeout(go, 4000);
      });
    }
    mgr.addPlugin(item);
  }

  // The app's own metadata: the ui:Plugin entry it has in the catalog — label,
  // icon, description, topics. An app made before the entry was automatic has
  // none until the top row's catalog button puts it in.
  async _mountMetaForm() {
    const host = this.querySelector('#sab-meta');
    const app = this._app;
    if (!host || !app) return;
    if (!app.entry) {
      host.innerHTML = `<p class="sab-hint">This app has no catalog entry yet —
        add it above and its metadata appears here.</p>`;
      return;
    }
    await this._mountForm(host, app.entry, () => this._adoptEntryName(app).then(() => this._render()));
  }

  // A chip on this step. A menu chip is also a DROP TARGET (a plugin dropped
  // on it joins the menu instead of the region) and opens the menu's editor.
  _featureChipHtml(part) {
    const menu = this._menuOf(part);
    if (!menu) return this._chipHtml(part);
    const iri = part.node.value;
    const label = this._chipLabel(part);
    return `<span class="sab-chip sab-chip-menu" draggable="true" role="listitem" tabindex="0"
      aria-roledescription="movable item" aria-describedby="${this._uid}-dnd-help"
      data-node="${escHtml(iri)}"
      title="Edit ${escHtml(label)}">${escHtml(label)}<button type="button" class="sab-chip-x"
      data-el-action="remove" aria-label="Remove ${escHtml(label)}">✕</button></span>`;
  }

  // A plugin card dropped on a REGION becomes a layout member: a ui:Link for a
  // link plugin, a ui:Component for a component one. The card carries a TAG,
  // not a module — so the entry's own schema:url is read from the catalog.
  async _addPlugin(payload, regionIri) {
    if (!this._tree || !regionIri) return;
    payload = await this._resolveNewContent(payload);
    const label = payload.label || payload.tag || payload.href || 'Plugin';
    if (payload.href) {
      addLink(this._tree, regionIri, { label, url: payload.href }, this._layoutUrl);
      await this._seedContentFor(payload.href);
    } else {
      const module = await this._pluginModule(payload);
      if (!module) { this._error = `“${label}” names no module — nothing to place.`; this._render(); return; }
      addLeaf(this._tree, regionIri,
        { label, module, params: payload.params || [] }, this._layoutUrl);
    }
    await this._saveLayout();
    this._renderAreaAccordion();
  }

  // "New HTML Content": mint the next free content file, seed it, and hand back
  // a payload naming it. Anything else passes straight through.
  async _resolveNewContent(payload) {
    if (!payload || !payload.newContent) return payload;
    const name = await this._freeHtmlName('content');
    await this._seedIfAbsent(new URL(name, this._layoutUrl).href, STARTER_CONTENT, 'text/html');
    return { ...payload, href: name, label: payload.label || 'Content' };
  }

  async _freeHtmlName(base) {
    for (let n = 0; n < 20; n++) {
      const name = `${base}${n ? `-${n + 1}` : ''}.html`;
      const there = await freshFetch(new URL(name, this._layoutUrl).href).catch(() => null);
      if (!there || !there.ok) return name;
    }
    return `${base}-${Date.now()}.html`;
  }

  // One of the app's own content files: create it if the link is the first
  // thing to name it.
  async _seedContentFor(href) {
    const spec = STANDARD_LINKS.find((l) => l.file === href);
    if (!spec || !this._layoutUrl) return;
    const starter = spec.file === 'help.html' ? STARTER_HELP
      : spec.file === 'site-title.html' ? siteTitleFor((this._app && this._app.name) || 'My App')
        : starterFor(spec.file);
    await this._seedIfAbsent(new URL(spec.file, this._layoutUrl).href, starter, 'text/html');
  }

  // The module URL behind a dropped card: the catalog entry's own schema:url
  // when the card names its entry, else the standard components path.
  async _pluginModule(payload) {
    if (payload.subject) {
      try {
        const store = await loadRdfStore(payload.subject.split('#')[0], freshFetch);
        const url = store.any(rdf.sym(payload.subject), rdf.sym(SCHEMA + 'url'));
        if (url && url.value) return url.value;
      } catch { /* fall through to the standard path */ }
    }
    return payload.tag ? `${this.componentsBase}/web/${payload.tag}.js` : null;
  }


  // The app is written as you work — layout saves regenerate the page, and an
  // app that exists is in the catalog. So this step only SHOWS the result;
  // an app made before that was automatic can still be catalogued by hand.


}

define('sol-app-builder', SolAppBuilder);
export { SolAppBuilder };
export default SolAppBuilder;
