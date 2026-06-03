// podz-extras.bundle.js — sibling IIFE bundle for podz hosts.
//
// The "core" bundle (solid-web-components.bundle.min.js) keeps a lean
// 4-component surface — sol-menu, sol-include, sol-query, sol-login —
// for sites that just want the public web-component API.
//
// Podz (and any other multi-pod host) needs more: the modal/tabs UI,
// pod browsing + ops, live editing, and WAC editing. Loading those into
// the core bundle would inflate it for every consumer, so they ship as
// this sibling that podz authors load alongside the core bundle.
//
// Both bundles register their custom elements via `customElements.define`
// at import time. They share runtime peers (rdflib, dompurify, marked
// inline; @inrupt/solid-client-authn-browser via window global; Comunica
// optional) — load the peers once and both bundles see them.
//
// Usage in a podz-style host (`<script>` order matters):
//   <script src=".../vendor/@inrupt-solid-client-authn-browser.umd.js"></script>
//   <script src=".../vendor/@comunica-query-sparql.umd.js"></script>      <!-- optional -->
//   <script src=".../solid-web-components.bundle.min.js"></script>
//   <script src=".../podz-extras.bundle.min.js"></script>
//   <script src="./dist/podz.bundle.min.js" type="module"></script>

import './sol-modal.js';
import './sol-tabs.js';
import './menu-from-rdf.js';   // keep sol-tabs `from-rdf` working in this bundle
import './sol-pod.js';
import './sol-pod-ops.js';
import './sol-live-edit.js';
import './sol-wac.js';

// Re-export class symbols on the IIFE's `window.PodzExtras.*` global so
// hosts can reach for them directly without a second source-import.
export { SolModal } from './sol-modal.js';
export { SolTabs } from './sol-tabs.js';
export { SolPod } from './sol-pod.js';
export { SolPodOps } from './sol-pod-ops.js';
export { SolLiveEdit } from './sol-live-edit.js';
export { SolWac } from './sol-wac.js';
