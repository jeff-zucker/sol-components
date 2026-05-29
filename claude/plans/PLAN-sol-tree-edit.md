# sol-breadcrumb + sol-tree-edit — drill-down editor for tree-shaped data

## Status

**Built (2026-05-29).** `sol-breadcrumb` + `sol-tree-edit` exist and drive dk's
Main Menu editor. Note: head/item shapes were later consolidated to a single
`menu.shacl` (see PLAN-shape-file-consolidation.md) — `sol-tree-edit` now
selects the head NodeShape by the root's `sh:targetClass` and excludes the
items predicate from the head form. Originally triggered by the dk-settings
Main Menu redesign discussion (2026-05-24). User wants to edit one thing at a time across
hierarchical data; the pattern recurs enough across swc consumers
that the implementation should live in swc, not in dk.

## Motivation

`ui:Multiple`-rendered editors (current menu form, sol-feed picker,
sol-search bookmark list) show the entire list inline with +/− chrome
mixed into the field grid. That violates the "one editable surface
at a time" principle dk-settings is built around, and it gets worse
when items are themselves containers (sub-menus, nested topics).

The drill-down + breadcrumb pattern keeps every depth visually flat:
one form on screen, a breadcrumb above it showing where you are.
Three levels deep looks the same as one level. Recursion is handled
by navigation, not by visual nesting.

Same pattern fits:

- dk-settings ▸ Main Menu (`ui:Menu` with `ui:parts` list)
- dk-settings ▸ feeds (sol-feed's `feeds.ttl#Feeds`)
- dk-settings ▸ search engines (sol-search's `bk:Topic` list, currently
  deferred — see `[[shared-editor-principle]]`)
- podz path bar (just the breadcrumb half)
- future ▸ any tree-shaped editable thing (Solid pod folders,
  query-result groupings, …)

## Architecture: two layered components

### 1. `sol-breadcrumb` — small, focused, no data awareness

Renders a clickable breadcrumb strip from declarative children. No
RDF, no SHACL — purely a UI primitive.

```html
<sol-breadcrumb>
  <span data-key="root">Main Menu</span>
  <span data-key="notes">Notes</span>
  <span data-key="daily">Daily</span>
</sol-breadcrumb>
```

- Earlier segments are clickable links; trailing segment is the
  current location (non-clickable).
- Separator (`>`) is rendered between segments.
- On click, dispatches `sol-breadcrumb-navigate` (bubbles, composed)
  with `detail: { key, index }` where `key` is the segment's
  `data-key` and `index` is its position.
- Updates reactively when children mutate (`MutationObserver` on
  light-DOM children).

**Useful well beyond settings.** podz's current path bar could be
replaced by it. Query-result grouping ancestry could use it. Any
"you are here in a hierarchy" affordance.

Estimate: ~80 lines of source + small CSS. Pure custom element.

### 2. `sol-tree-edit` — the full drill-down editor

Composes `sol-breadcrumb` + `sol-accordion` + `sol-form` (shape-driven
mode). Self-contained: consumer points it at a root subject and
provides the two shapes; it handles everything else.

```html
<sol-tree-edit
   root="data/menu.ttl#MainMenu"
   head-shape="…/shapes/menu-head.shacl"
   item-shape="…/shapes/menu-item.shacl"
   parts="http://www.w3.org/ns/ui#parts"
   drill-when-type="http://www.w3.org/ns/ui#Menu"
   label-property="http://www.w3.org/ns/ui#label">
</sol-tree-edit>
```

**Attribute reference**:

| Attribute            | Purpose |
|----------------------|---------|
| `root`               | Starting subject URI. Can change at runtime — host swaps it to deep-link. |
| `head-shape`         | SHACL shape for the container's own fields (label, orientation, …). Drives the "Menu properties" panel via shape-driven sol-form. |
| `item-shape`         | SHACL shape for one item. Each item accordion mounts a sol-form bound to that item's node. |
| `parts`              | Predicate linking container → ordered list of items. `ui:parts` for menus, `bk:hasMember` for bookmarks, customisable. |
| `drill-when-type`    | rdf:type URI(s) — items of these types become drillable (clicking "Open →" pushes a breadcrumb segment and re-renders the panel at the deeper subject). Space-separated for multiple. |
| `label-property`     | Predicate used for the accordion summary text. Falls back to local-part of the item's URI. |
| `add-types`          | rdf:type URI(s) the "+ Add" button can create. Single type → button creates directly; multiple → button opens a small picker. |

**Internal state (lives in the element):**

- `_stack: Array<{ subject, label }>` — the breadcrumb path. Length 1
  at root, grows on drill, shrinks on back/breadcrumb-click.
- `_currentSubject` — convenience accessor for `_stack[_stack.length-1]`.

**Rendering shape (always, at every depth):**

```
sol-breadcrumb (sol-tree-edit's children)
sol-accordion
  details: "Menu properties"  → sol-form (shape-driven, subject=current)
  details: "Item: <label>"    → sol-form (shape-driven, subject=item)
  …one per item in the parts list…
  details: "Item: <drillable label> ▸ Open"
            → header has Open → button instead of expanding body
  [+ Add item]                 → button row at the bottom
```

**Behaviours:**

- One-at-a-time editing is sol-accordion's built-in exclusive grouping
  (every details shares the same `name`).
- "Open →" on a drillable item: push `{ subject: itemNode, label }`
  onto `_stack`, re-render. Breadcrumb segment becomes clickable.
- Breadcrumb click: pop stack to clicked index, re-render. Restore
  the panel that was open at that level if the host wants (state
  per-level tracked optionally).
- Reorder: ⇧/⇩ buttons on each item's accordion summary mutate the
  parts rdf:List in the store; sol-form's auto-save persists.
- Delete: × button on each item's summary (with confirm).
- Add: bottom row button. If `add-types` is one type, creates a new
  blank node with that type and inserts at the end of the parts list.
  Multi-type opens a small picker first.

**Events (bubbling, composed):**

- `sol-tree-navigate` — breadcrumb moved (push/pop). `detail: { stack }`.
- `sol-tree-add`      — item created. `detail: { item, type }`.
- `sol-tree-remove`   — item deleted. `detail: { item }`.
- `sol-tree-reorder`  — parts list reshuffled. `detail: { items }`.
- (sol-form-save still bubbles up from the inner form.)

Estimate: ~250–350 lines, mostly orchestration. Most of the heavy
lifting (form rendering, validation, save) is already done by sol-form.

## Where each fits in the swc taxonomy

- `core/breadcrumb.js` — no, it's a custom element → goes in `web/`.
- `web/sol-breadcrumb.js` + `web/styles/sol-breadcrumb-css.js`.
- `web/sol-tree-edit.js` + `web/styles/sol-tree-edit-css.js`.
- Bundle inclusion: neither belongs in the lean
  `solid-web-components.bundle.min.js` (matches the existing pattern
  — sol-form isn't there either). Consumers `import` them as ES
  modules through the importmap. dk-shell.js adds the imports when dk
  starts using them.

## Build order

1. **`sol-breadcrumb`** alone — small, immediately useful for podz
   path bar even before tree-edit lands.
2. **`sol-tree-edit`** built on it — first consumer is dk-settings ▸
   Main Menu, replacing the current Multiple-chrome flow.
3. **Port the feeds editor** to use it (drives the design of
   non-recursive consumers — feeds doesn't drill, just has a head +
   flat list).
4. **Port the bookmark editor** to use it (the sol-search topic
   editor that's currently deferred; this would resolve the
   `bk:hasTopic` inverse-relation problem because the form binds
   directly to each bookmark node via its own subject).
5. Optional: **podz path bar** swap.

## Open design questions (revisit when starting work)

- **Multi-type item-shape.** Menu items are `ui:Link` / `ui:Component`
  / `ui:Menu` — three different field sets. Either (a) item-shape is
  a SHACL `sh:or` over three sub-shapes and sol-form's shape-driven
  mode learns to dispatch on `rdf:type`, or (b) `item-shape` becomes
  multi-valued (one per type) and sol-tree-edit picks the right one
  by `rdf:type`. Option (b) is simpler to start.
- **Add-item flow when item-shape doesn't carry sensible defaults.**
  Empty new item appears, user fills fields, autosave fires once
  every required field is set? Or block-save-until-valid? Per
  shape-driven precedent → fire on first commit, validate on save.
- **Drill state persistence.** Should the stack survive a page
  reload? Probably no for v0 (matches Settings' general "always
  start collapsed" stance); revisit if asked.
- **Recursive shape reuse.** Sub-menus use the SAME head/item shapes
  as the top-level menu. The shape files should be authored
  reusably — likely two stand-alone shapes that don't reference
  each other, applied at each level.
- **Where the breadcrumb root label comes from.** For Main Menu,
  it's "Main Menu" — currently dk-settings hardcodes that. Probably
  a `root-label` attribute on sol-tree-edit, default = the root
  subject's `label-property` value.

## Notes / dependencies

- Depends on the shape-driven mode in `sol-form` (already landed).
  See `MEMORY.md` → solid-logic-singleton-store-principle.
- Depends on `sol-accordion`'s exclusive-grouping mode (already
  works — see how dk-settings uses it).
- Depends on every editable component having a SHACL shape (the
  generic settings-form.ttl path is going away in favour of
  per-component shapes).
- Related deferred item: [[project-pending-attributes-ux]] — the
  per-menu-item `ui:attribute` Multiple. When tree-edit lands, that
  Multiple lives inside the item form (one form per item), so the
  add-attribute button no longer pollutes the global menu view.
