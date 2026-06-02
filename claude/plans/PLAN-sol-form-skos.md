# TODO: wire SKOS support into sol-form

**Status:** NOT done. `solid-ui-skos` exists (in `packages/solid-ui-skos/`,
v0.5.0) and makes solid-ui's `ui:Choice` SKOS-aware, but **sol-form does not
use it yet** — nothing under `web/` or `core/` imports `solid-ui-skos`, and
`shape-to-form` never emits a SKOS `ui:from`. This is the work to make SKOS
dropdowns actually render through `<sol-form>`.

## Background

`solid-ui-skos` decorates `window.UI.widgets.field[ui:Choice]`: when a Choice's
`ui:from` points at a `skos:ConceptScheme` / `skos:Concept` /
`skos:Collection`, its options come from the SKOS graph (transitive — a scheme
yields all its concepts, a concept all its narrower; collections yield members;
`ui:canMintNew` mints + places a `skos:Concept`). `<sol-form>` renders fields
through that same `window.UI.widgets.fieldFunction` dispatch, so once the
decorator is installed a SKOS `ui:Choice` "just works" in sol-form.

Pure logic: `packages/solid-ui-skos/src/skos-options.js` (`gatherSkosOptions`).
Upstream home (eventual): fork `jeff-zucker/solid-ui-jz-skos`, branch
`feat/skos-choice-options` — once merged into solid-ui, drop the add-on.

## What to add

1. **Load the add-on.** Import `solid-ui-skos` wherever sol-form/solid-ui is
   set up (e.g. `web/sol-form.js`, or the consuming app's bundle), AFTER
   solid-ui. It auto-installs (it imports solid-ui + solid-logic itself). Peer
   deps: `rdflib`, `solid-logic`, `solid-ui`.

2. **Make `shape-to-form` emit a SKOS `ui:from`.** `core/shape-to-form.js`
   currently maps `sh:class <X>` → `ui:Choice` with `ui:from <X>` (rdf:type
   enumeration). For SKOS, the field should get `ui:from <scheme|concept|
   collection>` so the decorator engages. Recommended: honor an explicit
   `ui:from` carried in the shaclc `% … %` annotation (decoupled from the
   `sh:class` used for validation), e.g.
   `dcat:theme [1..1] % sh:name "Topic" ; ui:from <feeds.ttl#Feeds> % .`
   (Auto-detecting "sh:class is a skos:Concept in scheme S" is the alternative,
   but explicit is clearer.) Optionally pass `ui:canMintNew` through for
   owner-editable topic fields.

## Why it matters (omp)

The open_media_player News/Images topic dropdowns are currently scoped with
marker classes (`taxo:topic`, `schema:DefinedTerm`) because stock `ui:Choice`
enumerates whole-store by `rdf:type`. Pointing `ui:from` at the SKOS scheme via
this integration gives correct, transitive scoping (and inline concept
minting) without the marker-class workaround.

See `packages/solid-ui-skos/README.md` and `packages/solid-ui-skos/pr/`.
