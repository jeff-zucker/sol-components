/**
 * sol-basic.js — curated bundle entry: the everyday-app subset.
 *
 * Registers exactly six author-facing components:
 *   sol-include, sol-button, sol-menu, sol-login, sol-form, sol-settings
 * …plus the helpers those six conjure / instantiate by tag name at runtime.
 * These helpers are COMPOSED INTERNALLY — not meant to be author-placed —
 * but they're global custom elements all the same, so they must be
 * registered for the six to run at full capacity:
 *   sol-accordion   — settings panel chrome (static dep of sol-settings)
 *   sol-default     — singleton holding shared non-CSS defaults (proxy, …)
 *   sol-modal       — the "modal" display surface + the editor-self gear popup
 *   sol-window      — the "floating" display surface
 *   sol-tree-edit   — sol-menu's editor (settings/gear mount it via core/editor)
 *   sol-breadcrumb  — sol-tree-edit's drill-in/out navigation crumb
 * The author-facing surface for the conjured ones is the region KEYWORD
 * (region="modal" / "floating"), not the tag — see core/display-target.js.
 * Nothing else is pulled in.
 *
 * Everything these components need is bundled IN (dompurify, marked, n3,
 * rdf-validate-shacl are inlined). Bring-your-own runtime peers, loaded
 * BEFORE this bundle, IN THIS ORDER (rdflib → solid-logic → solid-ui — a
 * singleton handshake; see project memory):
 *   - rdflib                              → `window.$rdf` (vendored UMD script tag)
 *   - solid-logic                         → singleton rdflib store (ESM, importmap)
 *   - solid-ui                            → `window.UI` widgets (ESM, importmap)
 *   - @inrupt/solid-client-authn-browser  → `window.solidClientAuthn`
 *     (only sol-login; vendored UMD script tag)
 *
 * NOTE: solid-ui/solid-logic ship only as ESM, so a page that uses sol-form
 * or sol-settings needs an importmap for those two plus a tiny bootstrap
 * module that imports them (side-effects window.UI + the store). The
 * include/button/menu/login subset, which never touches window.UI, can run
 * from just the rdflib (+auth) UMD script tags and this bundle.
 */

import './sol-include.js';
import './sol-button.js';
import './sol-menu.js';
import './sol-login.js';
import './sol-form.js';
import './sol-settings.js';   // statically pulls in sol-accordion

// Registered-by-tag helpers the six conjure / instantiate at runtime:
import './sol-default.js';    // singleton holding shared non-CSS defaults (proxy, region…)
import './sol-modal.js';      // modal display surface + editor-self gear popup
import './sol-window.js';     // floating-window display surface
import './sol-tree-edit.js';  // sol-menu's editor
import './sol-breadcrumb.js'; // sol-tree-edit's drill-in/out navigation crumb

// Surface the JS API on `window.SolBasic.*` for hosts that need the class
// symbols, not just the registered custom-element tags.
export { AuthManager } from './sol-login.js';
export { solFetch } from '../core/auth-fetch.js';
