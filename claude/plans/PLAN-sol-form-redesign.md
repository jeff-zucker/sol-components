# sol-form — two-attribute API, view modes, shape→form extraction

## Status

**Designed, not built.** Came out of the dk-settings shape-driven work
(2026-05-24): with SHACL now declaring the schema, sol-form's old
`source` / `subject` / `shape` / `save-to` quartet is more attribute
surface than necessary. The redesign reduces it to two pillars
(`shape` + `data`) plus an optional `view=` mode that mirrors
sol-query's existing vocabulary, and extracts the shape→form
rendering into a standalone core helper so other components
(`sol-tree-edit`, future editable variants of sol-query views, etc.)
can reuse it.

## Goals

- **Two-attribute canonical form**: `<sol-form shape="…" data="…">`
  is the minimum a consumer writes. Everything else is inferred or
  optional.
- **Mode-by-attribute**: `view=record | rolodex | table | auto-complete`
  switches presentation without changing the data binding. Same as
  sol-query's `view=` pattern (`web/views/`).
- **Standalone shape→form helper**: extract `core/shape-to-form.js`
  so any swc component (or third-party consumer) can render an
  editable form from a SHACL shape without needing `<sol-form>` as
  the entry point.
- **Backward compatibility**: existing callers using `source` /
  `subject` / `save-to` keep working, with deprecation warnings, for
  at least one minor version.

## API surface (after redesign)

```html
<!-- Canonical: schema + data + (inferred) view. -->
<sol-form shape="foo-settings.shacl" data="data/foo.ttl#Settings"></sol-form>

<!-- No fragment → multi-subject. Defaults to view=rolodex. -->
<sol-form shape="contact-shape.shacl" data="contacts.ttl"></sol-form>

<!-- Explicit view. -->
<sol-form shape="contact-shape.shacl" data="contacts.ttl" view="table"></sol-form>

<!-- Edit-only preview (no PUT). -->
<sol-form shape="…" data="…" dry-run></sol-form>
```

**Attribute reference:**

| Attribute   | Type                         | Default                    | Purpose |
|-------------|------------------------------|----------------------------|---------|
| `shape`     | URI                          | required (or `source`)     | SHACL shape — drives both targeting (which subjects to render) and field generation. |
| `data`      | URI, optionally with `#frag` | required                   | Document URL to read/write. Fragment scopes to a single subject; absence implies "all subjects matching the shape's targets." |
| `view`      | one of: record, rolodex, table, auto-complete | inferred — `record` when `data` has a fragment, `rolodex` otherwise | Presentation mode. Mirrors `<sol-query view=…>`. |
| `dry-run`   | boolean                      | absent                     | Edits stay in-memory; no PUT fires. Useful for previews, demos, smoke tests that shouldn't touch the filesystem. |
| `source`    | URI                          | absent (deprecated)        | Legacy `ui:Form` TTL path. Kept for backward compat — when present, takes precedence over `shape` and uses the existing solid-ui form renderer. New code uses `shape` instead. |
| `subject`   | URI                          | absent (deprecated)        | Alias for `data` with fragment. When set, forwards to `data` with a deprecation warning. |
| `save-to`   | URI                          | absent (deprecated)        | Alias for the document portion of `data`. Forwards similarly. |
| `shape`-derived attributes (unchanged from current sol-form) | | | All other behaviour — validation, save flow, sol-form-save events — stays the same. |

## Save behaviour

- Same as today: every input change mutates the in-memory rdflib
  store synchronously, then debounces 600ms and `PUT`s the entire
  document to `data`'s URL via the UpdateManager.
- The dev server (community-solid-server) accepts PUTs and writes the
  file on disk. That's how the data files got rewritten during the
  shape-driven debugging — every smoke-test `dispatchEvent('change')`
  queued a save. **This is by design** for production but caused
  collateral data loss in testing.
- **`dry-run`** is the new escape hatch. When the attribute is
  present, sol-form sets a flag that short-circuits `_save` →
  `_putViaUpdater` so the file is never touched. Edits still mutate
  the in-memory store and validation still runs; only the
  persistence step is skipped. Test scripts and demos default to
  this; production consumers don't.

## View modes

Each view has its own renderer in `core/shape-views/` (parallel
naming to the existing `web/views/` for sol-query). The cell widget
(`buildShapeInput`) is identical across views — only the layout
differs.

| View | When to use | Renderer | Reuses |
|------|-------------|----------|--------|
| `record` | 1 subject. Settings pages, single-entity editors. | `renderRecordForm` | The existing `_renderFromShape` body — just extracted. |
| `rolodex` | N subjects, card-by-card browse with prev/next. | `renderRolodexForm` | `web/sol-rolodex.js` + `web/views/rolodex.js`. One card per subject, each card hosts a record-style form. |
| `table` | N subjects × M properties, spreadsheet feel. | `renderTableForm` | `web/views/table.js`, made editable. Single-valued properties only — multi-valued shapes degrade gracefully (skip / warn / chip-list). |
| `auto-complete` | Many subjects (50+); user searches first, then a record form pops up for the selection. | `renderAutoCompleteForm` | `web/views/auto-complete.js` + the record renderer wired to the selection event. |

**Default selection:**

- Fragment in `data` → `record` (only one subject is in scope; other
  modes don't make sense).
- No fragment → `rolodex` (good general-case default; cards always
  fit, navigation discoverable, no scaling concerns until 100+).

**Each view's special concerns:**

- **`record`**: nothing new. Today's behaviour, extracted to
  `core/shape-views/record.js` and called from sol-form.

- **`rolodex`**: each subject becomes one `<div>` child of a
  `<sol-rolodex>`. sol-rolodex already provides prev/next + arrow-key
  nav. Adding entries → "+ Add new" button beneath the rolodex that
  creates a new subject, appends a card, advances to it. Deleting
  → trash icon on the card; confirm; remove from store + drop the
  card.

- **`table`**: a row per subject, a column per shape property.
  Editable cells use `buildShapeInput` widgets sized for the cell
  width. Header row shows property labels (from sh:name or
  rdfs:label). Multi-valued properties are the open question — see
  below. Sorting is a nice-to-have v1+ (click column header).

- **`auto-complete`**: top-row search input over each subject's
  display label (configurable property; default rdfs:label or
  sh:hasValue on schema:name path). Below the search, the record
  form for the currently-selected subject (empty / placeholder when
  nothing selected). Useful when rolodex paging is impractical.

## Standalone shape→form helper

**Location**: `core/shape-to-form.js` (new file).

**Three layers**, each pure-functional except where DOM mutation is
inevitable:

```js
// 1. Parse a SHACL document into a normalized form descriptor list.
//    Pure, sync. No DOM, no fetch.
parseShape(shapeText, baseUri) → {
  targets: { node: NamedNode[], classes: NamedNode[], subjectsOf: NamedNode[] },
  properties: ShapeProp[],   // one per sh:property entry on the NodeShape
}

// 2. Apply the parsed targets to a data graph → list of subjects
//    that the shape covers. Pure, sync.
findSubjects(store, targets, baseDoc) → Subject[]

// 3. Render a form for ONE subject into a container. Mutates the
//    DOM and binds input listeners to mutate `store`. Returns a
//    cleanup function that detaches listeners (for view switches).
renderRecordForm(container, store, subject, properties, opts) → () => void

// Shared widget builder, called by every view's renderer.
buildShapeInput(descriptor, currentValue, onChange, opts) → HTMLElement
```

**Plus per-view renderers**, each thin wrappers over the helpers:

```js
// core/shape-views/rolodex.js
renderRolodexForm(container, store, subjects, properties, opts) → cleanup

// core/shape-views/table.js
renderTableForm(container, store, subjects, properties, opts) → cleanup

// core/shape-views/auto-complete.js
renderAutoCompleteForm(container, store, subjects, properties, opts) → cleanup
```

**ShapeProp shape** (one entry per sh:property on the NodeShape):

```js
{
  outerPath: NamedNode,           // sh:path (e.g. schema:additionalProperty)
  key: string | null,             // resolved from sh:hasValue on schema:name in qualifiedValueShape
  datatype: string | null,        // xsd URI string
  enumOpts: string[] | null,      // resolved from sh:in
  nodeKind: string | null,        // sh:IRI etc.
  minCount: number,
  maxCount: number,                // Infinity if absent
  label: string | null,            // sh:name
  description: string | null,      // sh:description
  // … room to grow: sh:pattern, sh:minInclusive, sh:maxInclusive, etc.
}
```

**Why three layers (not one):**

- `parseShape` is reusable for non-rendering uses: validation report
  formatters, shape introspection, codegen.
- `findSubjects` is reusable for any view that needs "which subjects
  am I editing?" — including `sol-tree-edit`'s breadcrumb root lookup.
- The renderers can be picked à la carte without dragging in shape
  parsing they don't need.

## What sol-form becomes after the extraction

```js
// web/sol-form.js — thin shell.
class SolForm extends HTMLElement {
  async _load() {
    const shapeUri = this.getAttribute('shape');
    const dataUri  = this.getAttribute('data')
                  || this.getAttribute('subject');  // legacy alias
    const viewName = this.getAttribute('view') || this._inferView(dataUri);

    const shapeText = await fetch(shapeUri).then(r => r.text());
    const { targets, properties } = parseShape(shapeText, shapeUri);

    const docUrl = dataUri.split('#')[0];
    await rdf.store.fetcher.load(docUrl);
    const subjects = dataUri.includes('#')
      ? [rdf.sym(dataUri)]
      : findSubjects(rdf.store, targets, docUrl);

    const renderer = viewRenderers[viewName];   // record / rolodex / …
    this._cleanup = renderer(this.shadowRoot.querySelector('.sol-form-body'),
                              rdf.store, subjects, properties,
                              { dryRun: this.hasAttribute('dry-run') });
  }
  // … save / validation / event surface unchanged …
}
```

Net effect: ~700 lines today drop to ~250-300, with the heavy
lifting in `core/`.

## Where each piece lands in the swc taxonomy

```
core/shape-to-form.js            parseShape, findSubjects, buildShapeInput
core/shape-views/record.js       renderRecordForm
core/shape-views/rolodex.js      renderRolodexForm
core/shape-views/table.js        renderTableForm
core/shape-views/auto-complete.js  renderAutoCompleteForm

web/sol-form.js                  thin shell (above)
web/styles/sol-form-css.js       shape-driven CSS (already there)
web/styles/shape-views-css.js    new — shared chrome for rolodex/table cards/rows

web/views/table.js               existing, read-only — gets an editable mode
web/views/rolodex.js             existing — unchanged (we wrap, don't modify)
web/views/auto-complete.js       existing — gets a "select reveals form" wrapper
```

`web/views/table.js`'s editable mode is the biggest single uplift —
each cell becomes a `buildShapeInput` widget with the same commit
binding as in record mode. Existing read-only callers (sol-query
defaults) are not affected; the editable mode is opt-in.

## Cross-component impact

- **`sol-tree-edit`** (separate plan, `PLAN-sol-tree-edit.md`) uses
  `parseShape` + `findSubjects` + `renderRecordForm` directly,
  bypassing `<sol-form>`. Without the extraction it would have to
  instantiate one sol-form per level of the drill, each with its
  own shadow root and save timer. With the extraction it's one
  function call per panel.
- **`sol-query`** is the original `view=` consumer. After the
  editable variants exist, sol-query can opt into them via a new
  `editable` flag — making "list pod resources, rename inline"
  flows possible without writing a separate component.
- **`dk-settings`** simplifies: `buildForm` collapses to
  ```js
  form.setAttribute('shape', ctor.shape);
  form.setAttribute('data',  abs);
  // view inferred from fragment presence
  ```
  No more conditional editor/shape branching.
- **Calendar settings** still needs disambiguation (4 named
  containers in one doc). `data="data/calendar.ttl#All"` for the
  specific container, OR `data="data/calendar.ttl"` to see all four
  in a rolodex/table — a side benefit of the design.

## Build order

1. **Extract `core/shape-to-form.js`** from sol-form's current
   private methods. No new functionality — just relocate +
   document. Existing record-mode tests pass unchanged.
2. **Add `view` attribute + `dry-run`** to sol-form. `view=record`
   uses the extracted `renderRecordForm`; default still fragment-
   inferred. Smoke-test that nothing regresses.
3. **`view=rolodex`** — implement `core/shape-views/rolodex.js`
   wrapping `<sol-rolodex>` + record renderer per card. Add a
   "+ Add new" + delete affordances. First consumer: a new dk
   Settings panel for sol-feed's feed list (no fragment in `data`,
   so rolodex is the default).
4. **`view=table`** — make `web/views/table.js` accept an editable
   mode; implement `core/shape-views/table.js`. Settle the
   multi-valued-property design before shipping. Useful first
   consumer: an editable variant of sol-query result tables.
5. **`view=auto-complete`** — `core/shape-views/auto-complete.js`
   composes the existing autocomplete + record renderer. Useful
   for sol-search bookmark editor (many topics, search to edit).
6. **Deprecate** `source` / `subject` / `save-to` aliases — emit
   a console warning each load, with a doc URL.
7. **Migrate dk-settings** to the new two-attribute form. Becomes
   the smoke-test surface for the redesign.

## Open design questions

1. **Multi-valued properties in `view=table`.** Each row is one
   subject, each column one property. Calendar's `source` is
   multi-valued (a list of feed URLs). Options: (a) skip multi-
   valued columns in table mode with a "see record view" link;
   (b) show a single cell holding a chip list with an inline +/−;
   (c) render multiple rows per subject (one per source value),
   breaking the "one row = one subject" invariant. **Lean toward
   (a) initially; revisit if users complain.**
2. **Sort order in `view=table`.** Click header to sort by that
   column. Stable across re-renders. Per-shape default? Probably
   keep it shape-declared (`sh:order` on each property) and let
   click override for the session only.
3. **Pagination.** Rolodex paginates inherently. Table doesn't —
   what happens with 1,000 subjects? Probably introduce
   `page-size` attribute (default 100) and "load more" at bottom.
4. **`view=record` with multi-subject `data` (no fragment).**
   What does it mean? Options: (a) implicitly behave like
   `view=rolodex`; (b) render the first subject and warn; (c)
   error out. (a) is most user-forgiving.
5. **`dry-run` and validation.** Should validation still run in
   `dry-run`? Yes — the in-memory checks are part of the editing
   feedback loop. Only PUT is suppressed.
6. **Per-subject pickup labels.** In rolodex/table/autocomplete,
   each card/row/option needs a display label for the subject.
   Default to `rdfs:label`; fall back to `schema:name`; fall back
   to the local-part of the subject URI. Add a `label-property`
   attribute on sol-form (mirroring sol-tree-edit's same idea).
7. **Editable mode in existing read-only views (`web/views/*.js`).**
   Is the editable variant a separate function (`renderTableEditable`)
   or a flag (`render(..., { editable: true })`)? Flag is less
   churn. Settle this before touching `web/views/table.js`.

## Backward compatibility

- `source` keeps working — runs the existing solid-ui ui:Form
  renderer untouched. Useful for the menu form, search engines
  bookmark editor, and any other consumer with a hand-authored
  form TTL that doesn't have a SHACL shape yet.
- `subject` and `save-to` accepted but logged as deprecated; values
  forwarded to `data` internally.
- The shape-driven path becomes the recommended one for new
  components; existing components migrate at their own pace.

## Related work

- [[PLAN-sol-tree-edit]] — the drill-down editor, consumes
  `parseShape` + `findSubjects` + `renderRecordForm` directly.
- [[project-solid-logic-singleton-principle]] — the store every
  view renderer mutates is the same shared singleton, so all views
  see each other's changes immediately.
- [[project-shared-editor-principle]] — every editable sol-*
  component is configurable from dk Settings. The view modes
  here expand "configurable" to include multi-subject browse,
  table edits, and search-based pickers — without each component
  having to author its own UI.
- [[project-pending-attributes-ux]] — the menu-item attribute
  Multiple question lives inside one record form's body in this
  design, so the question is purely how that ONE Multiple
  presents (collapse the empty list? show always?), not how the
  whole menu does.

## Risks

- **`web/views/table.js`'s editable mode is the biggest unknown.**
  Existing read-only callers (sol-query) must not regress. Worth
  a couple of careful smoke tests covering both modes side by
  side before merging.
- **Auto-save during view switches.** When the user switches
  `view=` while the debounce timer is pending, the next view
  mount could collide with an in-flight PUT. Cleanup function
  returned by each renderer should `clearTimeout(this._saveTimer)`
  and force a final flush (or discard, if `dry-run`) before
  re-renders.
- **Renaming churn.** `subject` → `data` is a visible attribute
  change. Keep the alias warm for at least one cycle, and update
  every existing consumer (dk, podz, any examples in swc's docs)
  in the same PR that lands the alias.
