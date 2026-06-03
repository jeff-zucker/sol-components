// solid-web-components.bundle.js — all-in-one IIFE bundle entry.
//
// Imports every covered component for side-effect (custom-element
// registration) AND inlines the externals that are actually pulled in by
// the source (rdflib, dompurify, marked) into one self-contained file.
//
// Bring-your-own runtime peers (loaded via a `<script>` tag *before* this
// bundle so they self-attach to globals the components probe at runtime):
//   - @inrupt/solid-client-authn-browser  → `window.solidClientAuthn`
//     (only needed by sol-login; vendored UMD at
//     dist/vendor/@inrupt-solid-client-authn-browser.umd.js)
//   - @comunica/query-sparql              → `window.Comunica`
//     (only needed for full SPARQL — LIMIT/OFFSET/ORDER BY/federation —
//     against RDF documents; vendored UMD at
//     dist/vendor/@comunica-query-sparql.umd.js). Without it, sol-query
//     falls back to rdflib's local SPARQL engine, which ignores those
//     clauses; it warns to the console when that happens.
//
// Consumer usage: a single script tag, no importmap, peers as above.
//   <script src="https://your-host/dist/solid-web-components.bundle.min.js"></script>
//
// This is the simplest copy-paste path. Components requiring solid-ui or
// mashlib stay out of this bundle for now.

import './sol-menu.js';
import './menu-from-rdf.js';   // keep sol-menu `from-rdf` working in this bundle
import './sol-include.js';
import './sol-query.js';
import './sol-login.js';

// Surface the JS API on `window.SolidWebComponents.*` for hosts that need
// the class symbols, not just the registered custom-element tags.
export { AuthManager } from './sol-login.js';
export { solFetch } from '../core/auth-fetch.js';
