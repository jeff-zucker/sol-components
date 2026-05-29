# Shape-file consolidation — one shape per type, `sh:targetClass` dispatch

> **STATUS (2026-05-29): IMPLEMENTED.** `menu-head.shacl` + `menu-items.shacl`
> removed; `menu.shacl` is the single source (targetClass-keyed Menu/Link/
> Component NodeShapes). `sol-tree-edit` selects the head NodeShape by the
> root's `sh:targetClass` (passes `{subject, dataStore}` to `parseShape`) and
> drops the items predicate (`ui:parts`) from the head form. `sol-menu`'s
> editor points both `head-shape` and `item-shape` at `menu.shacl`. Verified
> live in dk.

## Motivation

Today, editable trees need **two separate SHACL files** that have
to be paired by attribute at the call site. The Main Menu in dk's
Settings:

```html
<sol-tree-edit
  root="data/menu.ttl#MainMenu"
  head-shape="…/menu-head.shacl"
  item-shape="…/menu-items.shacl"
  drill-when-type="http://www.w3.org/ns/ui#Menu"
  …>
```

Three problems compound here:

1. **Authoring friction.** A user wanting to edit a different
   menu-like structure (`ui:Workspace`, a custom `swc:Dashboard`,
   etc.) has to author two SHACL files and remember which goes
   where. The pairing is conventional, not declared anywhere.
2. **Dispatch lives in attributes, not in the shape.** The host
   has to tell sol-tree-edit which item types drill down
   (`drill-when-type="ui:Menu"`). That's a property of the
   *shape* — "a Menu node has children, a Link node doesn't" —
   leaking into call sites.
3. **The pairing isn't reusable.** sol-tree-edit owns the
   head/item composition. A future `<sol-form view="accordion">`
   (see [[PLAN-sol-form-redesign]]) would need to reinvent it.

A consolidated shape file collapses both files into one and lets
sol-form / sol-tree-edit / `view="accordion"` all read the same
description.

## Proposal

**One shape file per editable type.** The file lists multiple
`sh:NodeShape` blocks, each with `sh:targetClass` picking out
which RDF type it edits. A small `swc:` vocabulary describes
*linkage* between shapes — which property holds children, which
class label to show, where to recurse.

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix ui:   <http://www.w3.org/ns/ui#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix swc:  <https://solidos.github.io/solid-web-components/ns#> .

# A Menu has a label, an orientation, and zero-or-more parts.
# When sol-form sees a Menu, it edits the head fields inline and
# delegates the `ui:parts` collection to whichever shapes target
# the classes that may appear in that collection.
[] a sh:NodeShape ;
  sh:targetClass ui:Menu ;
  sh:property [ sh:path ui:label ;       sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path ui:orientation ;                  sh:maxCount 1 ;
                sh:in ( "vertical" "horizontal" ) ] ;
  sh:property [ sh:path ui:linkTarget ;                   sh:maxCount 1 ] ;
  swc:children      ui:parts ;            # collection-valued child path
  swc:childClasses  ( ui:Menu ui:Link ui:Component ) ;  # types allowed as children
  swc:drillDown     true .                # show children as their own panels

# A Link is a leaf — no children, no drilldown.
[] a sh:NodeShape ;
  sh:targetClass ui:Link ;
  rdfs:label "Link" ;
  sh:property [ sh:path ui:label ;  sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path ui:href  ;  sh:minCount 1 ; sh:maxCount 1 ;
                sh:datatype xsd:anyURI ] .

# A Component is also a leaf, but its `ui:name` is the swc tag name.
[] a sh:NodeShape ;
  sh:targetClass ui:Component ;
  rdfs:label "Component" ;
  sh:property [ sh:path ui:name ;     sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path ui:attribute ; sh:maxCount 100 ] .
```

## The new `swc:` predicates

| Predicate | Domain | Range | Meaning |
|---|---|---|---|
| `swc:children` | NodeShape | rdf:Property (often a path to a `rdf:List`) | Path to the child collection. When present, `view=accordion` recurses on each member. |
| `swc:childClasses` | NodeShape | rdf:List of classes | Classes to enumerate when offering "add child of type X". Drives the type-picker dropdown. |
| `swc:drillDown` | NodeShape | xsd:boolean (default false) | Whether the type's instances become their own accordion panel rather than rendering inline. |
| `swc:displayLabel` | NodeShape | rdf:Property | Which predicate of the *instance* to use as its panel label (default `rdfs:label`, then `ui:label`, then local-part). |

Namespace `swc:` resolves to
`https://solidos.github.io/solid-web-components/ns#`. The
namespace document doesn't need to exist for v0 — RDF semantics
are fine with dereferenceable-later IRIs — but should eventually
publish a stub describing each predicate.

## How consumers use it

```html
<!-- One attribute, no head/item split. -->
<sol-form
  view="accordion"
  data="data/menu.ttl#MainMenu"
  shape="shapes/menu.shacl">
</sol-form>
```

sol-form (or whichever sol-* component is doing the rendering):

1. Loads the shape file, indexes its NodeShapes by `sh:targetClass`.
2. Loads the data, looks up the root subject's `rdf:type`.
3. Picks the matching NodeShape. Renders its `sh:property` blocks
   as a form (the "head").
4. If the shape declares `swc:children`, recursively renders each
   child by looking up *its* type's NodeShape — same shape file.
5. `swc:drillDown true` means the child becomes its own
   accordion panel. `false`/absent means the child is rendered
   inline as a nested form.

## Migration

| Step | Effort | Order |
|---|---|---|
| Define the `swc:` predicates in `shapes/swc-vocab.ttl` and add a one-page summary to `help/swc-vocab-help.html` | 1 h | First — gives every later step a citation target |
| Merge `menu-head.shacl` + `menu-items.shacl` → `menu.shacl` with the three `sh:targetClass`-keyed NodeShapes | 1.5 h | Then |
| Teach `core/shape-to-form.js` to honour `sh:targetClass` lookup by data type (currently picks the first NodeShape — works only because every existing shape has exactly one) | 2 h | Then |
| Add `swc:children` / `swc:childClasses` / `swc:drillDown` / `swc:displayLabel` handling — pure additive logic in shape-to-form | 2 h | Then |
| Wire `<sol-form view="accordion">` to use the above (instead of sol-tree-edit's `_renderHead` / `_renderItems` split) | 2.5 h | Then |
| Migrate dk's Settings: drop `head-shape`/`item-shape`/`drill-when-type`, use single `shape="menu.shacl"` | 30 m | Then |
| Deprecate `sol-tree-edit` — leave the file but mark it superseded; downstream tests should switch to `view=accordion` | 30 m | Last |

**Total: ~10 hours.** Half is the shape-to-form changes; the
rest is mechanical.

## Why this beats convention-based shape lookup

An earlier branch of the design considered: "what if the
accordion just took `source=data.ttl#X` and inferred shapes by
convention (look in `shapes/` for files matching the type's
local-part)?"

That fails because:

1. **Conventions need a tie-breaker for collisions.** Two types
   named `Settings` in different vocabularies would fight over
   `Settings.shacl`. The `sh:targetClass` model uses full IRIs
   and never collides.
2. **Multiple shapes per type is legitimate.** Two consumers
   might want different forms over the same `ui:Menu` — one
   read-only, one with delete buttons. A consumer-pointed shape
   file expresses that; convention can't.
3. **Cross-file recursion needs explicit import.** `swc:children`
   tells the renderer "look up child types in *this same file*".
   Cross-file recursion would need `owl:imports` or similar —
   doable but heavier than v0 needs.

Convention-based discovery is still useful as a *fallback* for
zero-config defaults (drop a `<sol-form data="…">` with no
shape, it tries to guess). That can layer on top later.

## Risks / open questions

- **`sh:targetClass` semantics.** SHACL's targetClass selects
  *all* instances of the class for validation; using it for
  *dispatch* (which NodeShape to render which instance with) is
  consistent but not what the spec was designed for. If we ever
  formally validate against these shapes (e.g. before save), the
  dispatch use is compatible — but a future shape file with
  multiple NodeShapes targeting the same class would need a
  disambiguation key (`swc:profile`?).
- **`swc:children` overlaps with `sh:property` + `sh:node`.**
  SHACL already has `sh:node` (a property's value must conform to
  a NodeShape). We're not using `sh:node` because we want
  *dispatch by type*, not validation by reference. A future
  consolidation could unify them, but for v0 keeping `swc:children`
  separate makes the intent loud.
- **Editing collections is still hard.** The current
  sol-tree-edit is read-render only; a v0.x add/remove/reorder
  UI is out of scope here (separate work item under
  [[PLAN-sol-form-redesign]]'s view=accordion section). The
  consolidation makes that work cleaner — adding a child of
  type T queries `swc:childClasses` for the type list — but
  doesn't accelerate it.

## Related

- [[PLAN-sol-form-redesign]] — the `view="accordion"` mode that
  consumes the consolidated shape format. Consolidation is a
  prerequisite for the accordion mode being clean; without it,
  the accordion mode would have to copy sol-tree-edit's
  two-shape attribute surface.
- [[PLAN-shape2form-or-and]] — `sh:or`/`sh:and` support. The
  `swc:childClasses` list is conceptually a constrained `sh:or`
  — "child must conform to one of these shapes". When `sh:or`
  lands we can express childClasses more declaratively, but
  the dedicated predicate stays useful for the dispatch lookup.
- [[PLAN-sol-tree-edit]] — sol-tree-edit's design doc. Should
  be marked superseded once this plan ships.
