/**
 * sol-basic.js — bundle entry: the no-RDF, html-first tier.
 *
 * Registers the everyday UI primitives that work from plain HTML and never
 * need the RDF / Solid stack at runtime:
 *   sol-button, sol-dropdown-button, sol-include, sol-menu, sol-tabs,
 *   sol-accordion, sol-rolodex
 * …plus the registered-by-tag helpers these conjure / instantiate at runtime:
 *   sol-default     — singleton holding shared non-CSS defaults (proxy, region…)
 *   sol-modal       — the "modal" display surface + the editor-self gear popup
 *   sol-window      — the "floating" display surface
 * The author-facing surface for the conjured ones is the region KEYWORD
 * (region="modal" / "floating"), not the tag — see core/display-target.js.
 *
 * sol-menu's EDITOR (sol-tree-edit + sol-breadcrumb) is NOT here: editing a
 * menu reads/writes it as RDF (SHACL + Turtle), so it's part of the solid-ui
 * editing stack — loaded via sol-loader's `rdf` capability (or the importmap +
 * module recipe). sol-menu conjures sol-tree-edit by tag when it's present.
 *
 * Deliberately NOT here (they need the RDF / Solid stack):
 *   sol-login, sol-form, sol-settings, sol-query, sol-solidos.
 * Also NOT here: `menu-from-rdf` — driving the menu family from RDF is the
 * opt-in add-on that pulls rdflib; load `dist/menu-from-rdf.umd.min.js`
 * alongside this bundle when a page wants `from-rdf`. Keeping it out is what
 * keeps this tier truly dependency-free.
 *
 * dompurify and marked (sol-include's sanitiser / Markdown renderer) are the
 * only third-party code, and they're bundled IN. There is no rdflib peer.
 */

import './sol-include.js';
import './sol-button.js';
import './sol-dropdown-button.js';
import './sol-menu.js';
import './sol-tabs.js';
import './sol-accordion.js';
import './sol-rolodex.js';

// Registered-by-tag helpers the primitives conjure / instantiate at runtime:
import './sol-default.js';    // singleton holding shared non-CSS defaults (proxy, region…)
import './sol-modal.js';      // modal display surface + editor-self gear popup
import './sol-window.js';     // floating-window display surface

// Surface the JS API on `window.SolBasic.*` for hosts that need the class
// symbols, not just the registered custom-element tags.
export { SolButton } from './sol-button.js';
export { SolDropdownButton } from './sol-dropdown-button.js';
export { SolInclude } from './sol-include.js';
export { SolMenu } from './sol-menu.js';
export { SolTabs } from './sol-tabs.js';
