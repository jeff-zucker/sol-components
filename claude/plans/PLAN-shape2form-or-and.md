# shape2form — support sh:or and sh:and (and the path toward SHACL-C / ShEx)

## Status

**Designed, not built.** The name **shape2form** is now canonical
across the codebase — the tool and helper are intentionally
schema-language-agnostic at the API surface, even though the only
implementation today is SHACL. ShEx and SHACL-C support are on the
roadmap; they share enough conceptually (constraints over a node's
properties) that the descriptor list `parseShape` produces can be
filled from any of them.

This plan adds `sh:or` and `sh:and` to the SHACL reader so a single
shape property can describe a union or intersection of constraints —
the missing piece for "either an IRI OR a string literal," "string
matching at least one of these patterns," "an integer in this range
AND not zero," and similar.

## Why these two first

The big unmapped SHACL constructs from `help/sol-form-help.html`'s
"SHACL mapping" tab are: `sh:pattern`, `sh:minInclusive`,
`sh:maxInclusive`, `sh:minLength`, `sh:maxLength`, `sh:or`, `sh:and`.
Of those:

- `sh:or` is needed *right now* — the calendar source predicate is a
  case where we want **either** a NamedNode IRI **or** a string
  literal URL, because user pods sometimes store one and sometimes
  the other. Without `sh:or` we have to pick one and migrate the
  data (the v1 migration plan picked NamedNode-only, which works
  but is brittle).
- `sh:and` is the natural counterpart and required for "string +
  pattern" and "integer + min/max" combinations once `sh:pattern` /
  `sh:minInclusive` / `sh:maxInclusive` land.
- The range/pattern primitives are smaller, single-property
  additions; they belong to a follow-up batch.

## Semantic model

`sh:or` and `sh:and` take an `rdf:List` of constraint nodes. Each
constraint node has its own `sh:datatype` / `sh:nodeKind` / `sh:in` /
nested `sh:or` etc. — recursively the same shape as a sh:property.

```turtle
# Either an IRI or an xsd:anyURI literal.
sh:property [
  sh:path dct:source ;
  sh:or (
    [ sh:nodeKind sh:IRI ]
    [ sh:datatype xsd:anyURI ]
    [ sh:datatype xsd:string ]
  ) ;
  sh:minCount 1 ;
  sh:name "Source URL" ;
] .
```

```turtle
# A non-zero integer between 1 and 100.
sh:property [
  sh:path schema:numberOfItems ;
  sh:and (
    [ sh:datatype xsd:integer ]
    [ sh:minInclusive 1 ]
    [ sh:maxInclusive 100 ]
  ) ;
  sh:name "Max events (1–100)" ;
] .
```

## Descriptor shape changes

The current `ShapeProp` is one flat record:

```js
{ path, key, datatype, enumOpts, nodeKind, minCount, maxCount, label, description }
```

After this work, each descriptor either carries those primitive
constraints directly (as today), OR carries a `combinator` field that
references a list of nested descriptors:

```js
{
  path, key, minCount, maxCount, label, description,
  combinator: 'or' | 'and',
  alternatives: ShapeConstraint[],   // each is a ShapeProp minus path/key/min/maxCount
}
```

For the common single-constraint case, `combinator` is absent and
the flat fields are populated as today — full backward compatibility.

`ShapeConstraint` is the same record minus the path/cardinality
fields (those live on the outer ShapeProp):

```js
{ datatype, enumOpts, nodeKind, /* future: pattern, minInclusive, maxInclusive */,
  combinator?, alternatives? }
```

Allowing `combinator` inside `alternatives` gives free nesting —
`sh:or (sh:and (a b) sh:or (c d))` Just Works.

## How rendering decides

`buildShapeInput` currently dispatches on the descriptor's primitive
fields (enumOpts first, then nodeKind, then datatype). With
combinators, the dispatch becomes:

- **`sh:or`**: render the widget for the **first matching** alternative
  given the current value. If no current value, render the widget for
  the **first alternative**. UI offers a "type-switcher" affordance
  next to the input (small dropdown of the available alternatives) so
  the user can change between, say, "IRI" and "string" without
  leaving the form. Commit creates the right RDF kind based on the
  active alternative.
- **`sh:and`**: render a single widget that satisfies **all**
  constraints. Combine them: an `sh:and` of `[ datatype xsd:integer ]`
  + `[ minInclusive 1 ]` + `[ maxInclusive 100 ]` becomes
  `<input type="number" min="1" max="100" step="1">`.

The renderer needs a small "merge into one widget" helper for `sh:and`
and a "pick-one + switch UI" helper for `sh:or`.

## API for picking the active alternative

For `sh:or`, the renderer needs to know which alternative is "best"
for a given existing value. A small predicate:

```js
matchesConstraint(node, constraint) → boolean
```

The first alternative that matches the existing value wins on initial
render. If no value, the first alternative declared in the shape
wins (intentional: shape author controls default).

The user-visible type-switcher is a `<select>` placed in the same row
as the input. Its options are the alternatives' labels (sh:name on
each alternative if provided, otherwise an auto-derived label like
"IRI" / "Integer" / "Decimal"). Changing the select swaps the input
widget in place and clears the current value (since the type has
changed).

## CLI behaviour (`scripts/shape2form.mjs`)

The generated `ui:Form` TTL needs to reflect combinators. Two paths:

1. **Lossy projection**: emit only the first alternative as a normal
   ui:* field and add a `# TODO: shape used sh:or — full mapping not
   emitted` comment. Keeps the CLI output usable by solid-ui's
   vanilla renderer, which doesn't understand the union concept.
2. **Faithful but custom**: emit a new `swc:UnionField` with one
   sub-form per alternative. Documents the union accurately but is
   readable only by tools that recognise the custom term.

**Lean toward (1)** — the CLI's audience is documentation + tooling,
not authoring; if you need the union, you author SHACL directly.

`sh:and` collapses cleanly in the CLI: combine the alternative
constraints into one ui:* field with the union of their attributes
(e.g., `ui:IntegerField` + `ui:min` + `ui:max`).

## Path toward SHACL-C / ShEx

These two languages cover roughly the same constraint space as SHACL
but with different surface syntax / parsers. The architectural
move is to **split parsing from descriptor consumption**:

```
shape document (SHACL turtle / SHACL-C / ShEx)
         │
         ▼
   ┌──────────────────┐
   │ parser (per-lang)│  ← parseShape (SHACL today)
   └──────────────────┘  ← parseShaclC (future)
            │             ← parseShex (future)
            ▼
     ShapeProp[]          ← stable contract
            │
            ▼
   renderRecordForm, renderTable, buildShapeInput, …
```

The `parseShape` function today produces the universal descriptor
list; consumers shouldn't have to know what document language
produced it. With the combinator extension, the descriptor list can
represent everything ShEx and SHACL-C express that we care about.

`scripts/shape2form.mjs` then dispatches on the input file's
extension:

- `.shacl` / `.ttl` / `.shacl.ttl` → `parseShape` (SHACL)
- `.shaclc` / `.shc` → `parseShaclC`
- `.shex` / `.shexc` → `parseShex`

Each parser is a separate ~few-hundred-line module; the rendering
half doesn't change.

## Phases & time estimates

### Phase 1 — Descriptor shape changes (no parsing yet)

- Add `combinator` + `alternatives` fields to the `ShapeProp`
  typedef + JSDoc.
- Update existing renderers (`renderRecordForm`, `buildShapeInput`)
  to **branch** on `combinator` presence:
  - Absent → today's flat-field handling.
  - `'or'` → call new `renderOrInput` helper.
  - `'and'` → call new `renderAndInput` helper.
- Stub the two helpers with TODO bodies that just delegate to
  `buildShapeInput` on `alternatives[0]`. Lets the rest land before
  the actual union/intersection logic is wired.
- All existing shapes still render identically.

**Estimate: 1.5 hours.**

### Phase 2 — sh:or parser

- `readShapeProperty` recognises `sh:or` as an alternative to the
  flat constraint fields. When present, recursively read each
  alternative into a `ShapeConstraint` via `readShapeConstraint`
  (the new recursive helper).
- `collectRdfList` already handles the list parsing.
- Tests: parse a shape with sh:or, assert the descriptor's
  `combinator === 'or'` and `alternatives.length === 3`.

**Estimate: 1.5 hours.**

### Phase 3 — sh:or renderer

- Implement `renderOrInput`. Behaviour:
  - On init, find first alternative matching the current value (or
    first alternative if no value).
  - Render that alternative's widget via `buildShapeInput(altDesc, …)`.
  - Render a small type-switcher `<select>` to the left of the input
    (labels = sh:name on each alternative, fallback to derived names).
  - On switcher change, swap the widget + clear value.
  - Commit writes the right RDF kind for the active alternative.
- Add `matchesConstraint(node, constraint)` helper.
- Style additions in `web/styles/sol-form-css.js` for the switcher.

**Estimate: 3 hours.** The type-switcher UI is the bulk of the work;
the underlying logic is straightforward once the descriptor branch
is in place.

### Phase 4 — sh:and parser + renderer

- `readShapeProperty` recognises `sh:and`. Each alternative's
  primitive constraints get parsed the same way as a top-level
  property's constraints — same helper.
- `renderAndInput`: merge alternatives' constraints into a single
  effective descriptor (the most-specific overlap), pass to
  `buildShapeInput`. Conflicts (e.g., datatype xsd:string AND
  datatype xsd:integer) raise an error.
- The merge order matters for HTML5 input attributes — e.g.,
  `minInclusive` becomes `<input min="…">`. Spec out the merge rules
  in JSDoc on the helper.

**Estimate: 2.5 hours.** Includes the merge-conflict handling.

### Phase 5 — CLI projection of combinators

- `scripts/shape2form.mjs` detects combinators on a descriptor and:
  - For `sh:and`: merges into a single ui:* field (same logic as the
    renderer's merge).
  - For `sh:or`: emits the first alternative + a `# TODO: shape
    used sh:or; only the first alternative is reflected` comment.
- Smoke-test against a hand-written shape using `sh:or` for the
  calendar source.

**Estimate: 1.5 hours.**

### Phase 6 — Docs + memory

- Update `help/sol-form-help.html`'s "SHACL mapping" tab — add
  `sh:or` and `sh:and` rows; move `sh:pattern` /
  `sh:minInclusive` / `sh:maxInclusive` / `sh:minLength` /
  `sh:maxLength` into the "not yet" list (they're the next batch).
- Add a memory note: `project-shape2form-combinators.md` capturing
  the descriptor extension and the rendering decisions (especially
  the "first matching alternative" rule for `sh:or`).
- Cross-link from `PLAN-sol-form-redesign` and `PLAN-vocab-migration`
  — the calendar source's "IRI or string" question is best solved
  by `sh:or` once this lands.

**Estimate: 1 hour.**

### Total

**Range: 10–11 hours of focused work.** Slightly more than the
direct-predicate migration because the rendering UI for `sh:or` is
genuinely new (a type-switcher is a small UI primitive in its own
right).

## Open design questions

1. **Type-switcher label derivation.** When the shape author doesn't
   put `sh:name` on each alternative, the switcher needs to derive a
   label. Candidates per primitive: "IRI" for `sh:nodeKind sh:IRI`,
   the local-part of the datatype URI for `sh:datatype` (e.g.,
   "string" / "integer"), "One of …" for `sh:in`. Settle this in
   Phase 3.
2. **Clear vs preserve value on switcher change.** Switching from
   "IRI" to "string" — should the URI string be preserved as a
   literal? Argument for yes: less retyping. Argument for no: the
   value's semantics change. Lean toward **preserve** when both
   alternatives accept the same string representation;
   `sh:nodeKind sh:IRI` → `sh:datatype xsd:string` qualifies (both
   are strings in the input). Otherwise clear.
3. **Validation on the active alternative only, or on all?** With
   `sh:or`, SHACL semantically requires that the value satisfies at
   least one alternative. The renderer needs to surface "this fails
   alternative A but it's OK because alternative B matches" without
   confusing the user. Decision: validate only the **active**
   alternative during editing; SHACL's own validation handles the
   "any-alternative" check at save time.
4. **`sh:and` with disjoint datatypes.** If a shape author writes
   `sh:and ( [ datatype xsd:string ] [ datatype xsd:integer ] )` —
   that's unsatisfiable. The renderer should error loudly rather
   than silently picking one. Decision: throw at parse time; the
   `scripts/shape2form.mjs` CLI surfaces it as a hard error.

## Risks

- **Type-switcher UI feels like form chrome.** It's another widget
  next to every `sh:or` field. Worth designing carefully — maybe a
  small icon-only button that opens a popover, rather than a full
  `<select>` in the row, to avoid making "or"-typed fields look more
  prominent than single-typed ones.
- **Nested combinators get deep visually.** `sh:or (sh:and (…) sh:or (…))`
  could produce a switcher inside a switcher. Probably fine for
  shape authors who know what they're writing, but worth a smoke
  test once Phase 3 lands.
- **The CLI projection loses information for `sh:or`.** Documented in
  the generated TTL header and the help-page caveat, but worth
  re-flagging when ShEx/SHACL-C support adds further constructs that
  also project lossily.

## Related work

- [[PLAN-sol-form-redesign]] — the larger sol-form redesign. The
  combinator extension fits cleanly into the descriptor model that
  plan defines.
- [[PLAN-vocab-migration]] — the immediate vocab migration. `sh:or`
  lands the "IRI **or** string literal" union the calendar source
  question raised; until then, the migration commits to NamedNode-only.
- [[project-pending-attributes-ux]] — the menu attribute UX
  question. `sh:or` could eventually let an attribute value be
  either a literal or an IRI; today it's literal-only.
