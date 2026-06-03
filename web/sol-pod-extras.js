// sol-pod-extras.js — sol-pod's companions combined into one drop-in.
//
// sol-pod-ops (file-operations panel) and sol-wac (WAC/ACL editor) are the
// "document with pod" companions: sol-pod reaches them via customElements.get
// when present. Neither is useful on its own, so they ship together here
// rather than as two separate files. Load alongside sol-pod.umd; pod and
// sol-live-edit each ship standalone.
//
// UMD build: rdflib/dompurify/marked stay external globals (shared with the
// other pod-family UMDs on the page — no duplication).

import './sol-pod-ops.js';
import './sol-wac.js';

// Surface the JS API on `window.SolPodExtras.*`.
export { SolPodOps } from './sol-pod-ops.js';
export { SolWac } from './sol-wac.js';
