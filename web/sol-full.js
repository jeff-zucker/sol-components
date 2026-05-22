/**
 * sol-full.js — load every covered component in one tag.
 *
 * Side-effect aggregator: each child module registers its custom element
 * on import. Externals actually imported by the source (rdflib, dompurify,
 * marked) stay bare-specifier and are resolved by the consumer's importmap.
 *
 * Bring-your-own runtime peers (loaded via a `<script>` tag *before* this
 * module so they self-attach to globals the components probe at runtime):
 *   - @inrupt/solid-client-authn-browser  → `window.solidClientAuthn`
 *     (only needed by sol-login)
 *   - @comunica/query-sparql              → `window.Comunica`
 *     (only needed for full SPARQL — LIMIT/OFFSET/ORDER BY/federation —
 *     against RDF documents)
 * The corresponding vendored UMDs live in `dist/vendor/`.
 *
 * Usage:
 *   <script type="importmap" src="dist/importmap-cdn.json"></script>
 *       — or —
 *   <script type="importmap" src="dist/importmap-local.json"></script>
 *
 *   <script type="module" src="web/sol-full.js"></script>
 */

import './sol-menu.js';
import './sol-include.js';
import './sol-query.js';
import './sol-login.js';
import './sol-feed.js';

// TODO: add the rest as their externals get vendored:
//   sol-accordion, sol-modal, sol-tabs, sol-rolodex, sol-live-edit, sol-pod,
//   sol-pod-ops, sol-wac (no extra externals expected — verify and add)
//   sol-form          (requires solid-ui — vendor solid-ui first)
//   sol-solidos       (requires mashlib)
// sol-login is in: it only needs `window.solidClientAuthn` (provided by
// dist/vendor/@inrupt-solid-client-authn-browser.umd.js loaded as a
// `<script>` tag before this aggregator).
