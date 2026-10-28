// core/rdf-bundle.js — the RDF editing stack as one importable barrel module.
//
// Importing this module IS loading the bundle: the constituents evaluate in
// source order and the module registry dedupes anything already loaded. Pages
// reach it as the importmap name "rdf-bundle" (a manifest shared-modules entry)
// or by its full specifier "sol-components/core/rdf-bundle.js" — e.g. the
// data-edit-shape attribute's handler entry.
//
// The sol-* constituents are imported by PATH, not by their importmap
// nicknames: a CDN that rewrites bare specifiers at publish time (esm.sh) reads
// `sol-form` as an npm package and emits a 404 URL. Paths resolve to the same
// modules the importmap names point at, so instances still dedupe. Real npm
// packages stay bare so the importmap keeps them to one shared instance.
import 'solid-logic';
import './solid-ui-global.js';
import '../web/sol-tree-edit.js';
import '../web/sol-form.js';
import '../web/sol-modal.js';
import '../web/sol-settings.js';
import './edit-placements.js';
