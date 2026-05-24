# Vocab migration — drop the `schema:additionalProperty` PropertyValue indirection

## Status

**Completed 2026-05.** Weather, Time, Calendar, and Menu shapes
plus the corresponding data files (`weather.ttl`, `time.ttl`,
`calendar.ttl`, `menu.ttl`) migrated to direct predicates. The
PropertyValue indirection and the bespoke `swc:` namespace for
configuration properties are gone. The shape-to-form synthetic
property/value commit dance was deleted with them. See
[[INDEX]] for what's next on the form-rendering pipeline.

### Original plan as designed

Came out of the realization that the
PropertyValue indirection pattern (every setting reified as a
`schema:PropertyValue` with `schema:name` + `schema:value`) is both
semantically wrong (latitude isn't an "additional property" of
`<#Settings>`, it's a property of the place it describes) and the
root cause of most of the SHACL gymnastics — qualifiedValueShape
walks, indirect form binding, fragile sh:hasValue matching, the
synthetic property/value commit dance in shape-to-form.

This plan migrates the three current components (sol-weather,
sol-time, sol-calendar) onto direct predicates using existing W3C /
Dublin Core / Schema.org / QUDT / OWL-Time vocabulary. The single
remaining bespoke `swc:` namespace is **eliminated** by the
investigation in [[project-vocab-migration-decisions]] (see "Decision
log" below).

## Target vocabulary

| Setting | Predicate | Vocab | Value type |
|---|---|---|---|
| latitude | `geo:lat` | WGS84 Geo Positioning | `xsd:decimal` |
| longitude | `geo:long` | WGS84 Geo Positioning | `xsd:decimal` |
| place | `schema:addressLocality` | Schema.org | `xsd:string` |
| unit-system pref | `dct:conformsTo` | Dublin Core + QUDT URIs | NamedNode (multi) |
| forecast hours | `time:hours` | OWL Time | `xsd:integer` |
| timezone | `schema:timezone` | Schema.org | `xsd:string` (IANA name) |
| calendar source | `dct:source` | Dublin Core | NamedNode (multi) |
| calendar format | `dct:format` | Dublin Core | `xsd:string` |
| display mode | `ui:view` | UI vocab | `xsd:string` |
| lookahead days | `time:days` | OWL Time | `xsd:integer` |
| max events | `schema:numberOfItems` | Schema.org | `xsd:integer` |

Namespaces in use after migration:

```turtle
@prefix dct:    <http://purl.org/dc/terms/> .
@prefix geo:    <http://www.w3.org/2003/01/geo/wgs84_pos#> .
@prefix qudt:   <http://qudt.org/vocab/sou/> .
@prefix schema: <http://schema.org/> .
@prefix time:   <http://www.w3.org/2006/time#> .
@prefix ui:     <http://www.w3.org/ns/ui#> .
@prefix xsd:    <http://www.w3.org/2001/XMLSchema#> .
```

**No `swc:` namespace.** Every settings predicate is now reachable in
linked-data tooling without a custom vocabulary.

## Target data shape (final state)

```turtle
# data/weather.ttl
<#Settings>
  geo:lat 45.52 ;
  geo:long -122.68 ;
  schema:addressLocality "Portland, OR" ;
  dct:conformsTo qudt:SI , qudt:USCustomaryUnits ;   # "both" → two values
  time:hours 12 .

# data/time.ttl
<#Settings>
  schema:timezone "Asia/Kolkata" .      # IANA name; offset + label derived

# data/calendar.ttl  (per-container <#All>, <#SolidCG>, …)
<#All>
  dct:source <https://www.w3.org/groups/cg/solid/calendar/export/> ,
             <https://www.w3.org/groups/wg/lws/calendar/export/> ,
             <https://calendar.google.com/calendar/ical/…> ;
  dct:format "ics" ;
  ui:view "agenda" ;
  time:days 60 ;
  schema:numberOfItems 200 .
```

## Target SHACL (final state)

```turtle
# shapes/weather-settings.shacl
:WeatherSettingsShape a sh:NodeShape ;
  sh:targetSubjectsOf geo:lat ;
  sh:property [ sh:path geo:lat ;
                sh:datatype xsd:decimal ; sh:minCount 1 ; sh:maxCount 1 ;
                sh:name "Latitude" ] ;
  sh:property [ sh:path geo:long ;
                sh:datatype xsd:decimal ; sh:minCount 1 ; sh:maxCount 1 ;
                sh:name "Longitude" ] ;
  sh:property [ sh:path schema:addressLocality ;
                sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ;
                sh:name "Place" ] ;
  sh:property [ sh:path dct:conformsTo ;
                sh:nodeKind sh:IRI ; sh:minCount 1 ;
                sh:in ( qudt:SI qudt:USCustomaryUnits ) ;
                sh:name "Unit system(s)" ;
                sh:description "Which unit systems to display. Multiple values render side-by-side." ] ;
  sh:property [ sh:path time:hours ;
                sh:datatype xsd:integer ; sh:minCount 1 ; sh:maxCount 1 ;
                sh:name "Forecast window (hours)" ] .
```

No `qualifiedValueShape`, no `sh:hasValue` matching, every constraint
is a single line. Same simplification for time and calendar.

## Component reader code (after)

Currently each component iterates `schema:additionalProperty` looking
for `schema:name === "latitude"`. After migration:

```js
// sol-weather.js (current)
const settings = readSettings(store, subjectNode);   // walks PropertyValues
const lat = parseFloat(settings.latitude);

// sol-weather.js (after)
const lat = store.anyValue(subjectNode, GEO_LAT);    // direct
```

About 10–15 lines deleted per component plus a small refactor of the
shared settings-reader helper.

## What changes in `core/shape-to-form.js`

The current `parseShape` recognises one pattern only — `sh:property` with
`sh:qualifiedValueShape` wrapping a PropertyValue. After migration the
primary pattern becomes the **plain** `sh:property` with `sh:path`
pointing at a real predicate.

`parseShape` returns the same `ShapeProp` descriptor shape, but the
`outerPath` now points at the real predicate (not `schema:additionalProperty`)
and the `key` field becomes the local-part of the path URI (used for
display labels and DOM `data-key` attributes). The qualifiedValueShape
branch is **kept** as a fallback for legacy data (menu attributes, any
pre-migration data still in user pods).

`renderRecordForm`'s rendering loop becomes simpler — no PropertyValue
lookup, no nested blank-node creation, just `subject → predicate → value`
mutations.

## Migration strategy: dual-read transitional period

To avoid a hard cutover and to keep user data in pods working, each
component supports **both** patterns during the transition:

```js
// sol-weather settings reader (transitional)
function readLatitude(store, subj) {
  // Prefer the direct predicate
  const direct = store.anyValue(subj, GEO_LAT);
  if (direct != null) return direct;
  // Fall back to the legacy PropertyValue indirection
  return findPropertyValue(store, subj, 'latitude');
}
```

The SHACL and shape-to-form both grow a `sh:or` (or two parallel
sh:property entries) that accepts either pattern. After a migration
window (a few releases / weeks of dogfooding) the legacy branch is
removed.

## Phases & time estimates

Each phase ends with a passing smoke test (the four-panel
dk-settings page renders + validates + auto-saves cleanly through
the headless browser).

### Phase 1 — Foundation: dual-read support in shape-to-form

Add a direct-predicate branch to `parseShape` / `renderRecordForm` so
the existing PropertyValue path keeps working while the new path is
also recognised. No data or component changes yet; this is purely
the renderer learning a new pattern.

- Update `parseShape` to recognise both:
  - `sh:property [ sh:path <predicate> ; sh:datatype … ; sh:minCount … ; sh:maxCount … ]` (new — direct)
  - `sh:property [ sh:path schema:additionalProperty ; sh:qualifiedValueShape … ]` (legacy)
  - Return a unified `ShapeProp[]` with a `mode: 'direct' | 'propertyValue'` discriminator.
- Update `renderRecordForm` to branch on mode for the per-input commit logic.
- Update `buildShapeInput` (mostly unchanged — it operates on the descriptor, not the data shape).
- Update `_toTypedLiteral` paths and the IRI/NamedNode branch (already handles both via `sh:nodeKind`).
- Smoke test: existing four-panel page still renders + validates + saves.

**Estimate: 2.5 hours.** Most of the work is in `renderRecordForm`'s
commit path; the parser is a fork of the existing function.

### Phase 2 — Weather migration (proof of concept)

- Rewrite `shapes/weather-settings.shacl` to use direct predicates.
- Rewrite `data/weather.ttl` to use direct properties (preserve current Portland values).
- Update `sol-weather.js`'s settings reader for dual-read.
- Update `sol-weather.js`'s `observedAttributes` if the HTML-attribute names should mirror the new predicate local-parts (they don't have to — HTML attrs like `latitude=` can stay).
- Run the full smoke test:
  - Render the form in dk-settings ▸ Weather.
  - Edit each field.
  - Verify auto-save round-trips correctly.
  - Verify SHACL validation passes with the new shape.
  - Verify the live `<sol-weather>` widget on the dashboard re-renders with the saved data.

**Estimate: 1.5 hours.** Single-component scope; the patterns are
straightforward (no multi-valued fields except dct:conformsTo, which
is the only novel piece).

### Phase 3 — Time migration

- Rewrite `shapes/time-settings.shacl` to a single property: `schema:timezone`.
- Rewrite `data/time.ttl` to use `schema:timezone "Asia/Kolkata"` instead of `timezone "Mumbai"` + `timezone-offset 5.5`.
- Update `sol-time.js`'s reader: collapse the two-field model to one IANA-name read; derive display label and offset using `Intl.DateTimeFormat(undefined, { timeZone: '…', timeZoneName: 'short' })`.
- Smoke test as above.

**Estimate: 1.5 hours.** Component reader has more refactoring than
weather because the model collapses two fields to one. The
Intl.DateTimeFormat call is the right tool but needs careful UI
testing against the current display.

### Phase 4 — Calendar migration

- Rewrite `shapes/calendar-settings.shacl` for direct predicates, including the multi-valued `dct:source` (`sh:nodeKind sh:IRI ; sh:minCount 1`, no maxCount).
- Rewrite `data/calendar.ttl` across all four named containers (`<#All>`, `<#SolidCG>`, `<#LWS>`, `<#Extra>`).
- Update `sol-calendar.js`'s reader.
- Verify multi-valued source rendering in the form (the "+ Add another" / "− remove" chrome still appears correctly because cardinality is read from the shape).
- Verify the calendar widget still merges sources correctly after a save.

**Estimate: 2 hours.** The biggest single migration because the file
has four named containers and a multi-valued field. Worth budgeting
extra time for the multi-valued add/remove flow.

### Phase 5 — Remove the legacy qualifiedValueShape path

Once all three components are stable on the direct-predicate path:

- Remove the PropertyValue branch from `parseShape` / `renderRecordForm`.
- Remove the `core/shape-to-form.js` helpers that exist only for the
  PropertyValue case (`createPropertyValue`, the schema:name lookup
  filter, etc.).
- Remove `swc/data/settings-form.ttl` (the generic legacy form TTL
  used pre-shape-driven).
- Keep `swc/data/menu-form.ttl` and the `ui:attribute` Multiple path
  — that's still the right shape for menu-item attributes where the
  keys vary per Component element type.
- Update the help page (`help/sol-form-help.html`) — the "SHACL
  mapping" tab table should drop the PropertyValue pattern from its
  examples and feature the direct-predicate pattern as the canonical
  one.
- Update `scripts/shape2form.mjs` — generated `ui:Form` TTL now uses
  `ui:property <real-predicate>` instead of `ui:property schema:additionalProperty`,
  which means **the generated forms become solid-ui-renderable for
  the first time**. Update the "Caveat" section of the script's
  header comment accordingly.
- Smoke-test the full system one more time.

**Estimate: 1.5 hours.** Mostly deletions + documentation tweaks; the
fresh shape2form regeneration is the only place where new file
content is created.

### Phase 6 — Documentation + memory

- Update [[PLAN-sol-form-redesign]] (the redesign plan) to reference
  this migration as complete.
- Add a memory note (`project-direct-predicate-vocab.md`) recording
  the predicate choices and the URIs used, so future sessions don't
  re-relitigate them.
- Update `help/sol-form-help.html`:
  - Demo tab: the shape2form demo now shows direct properties; update
    the in-page sample data to match.
  - Modes tab: drop the PropertyValue example from the "Where the
    form definition lives" table.
- Cross-reference both shape-to-form's docstring and the
  shape2form.mjs header comment to point to this plan as the
  migration of record.

**Estimate: 1 hour.** Pure doc + memory.

### Total

**Range: 9–11 hours of focused work.** Realistic with cleanup +
verification at each phase. If anything blocks (most likely:
something subtle in the calendar's multi-valued source migration or
the Intl.DateTimeFormat behaviour for the time widget on a headless
browser), add ~2 hours of buffer.

## Decision log

These were debated during the design phase and resolved as listed.
Reopening any of them mid-implementation needs an explicit "no
re-decide latitude → schema:latitude vs geo:lat" check first.

- **`geo:lat` chosen over `schema:latitude`**: WGS84 is older, more
  universally recognised in linked-data, picked up by GeoSPARQL and
  OSM. Schema.org's `schema:latitude` exists and would also work;
  they coexist on `schema:Place` in practice.
- **`dct:conformsTo` + QUDT URIs chosen over `swc:units`**: investigated
  QUDT, vcard, schema.org, BCP47 locale extensions, SKOS notation,
  and others; `dct:conformsTo` + `qudt:SI` / `qudt:USCustomaryUnits`
  is the only legitimate non-bespoke fit found. Multi-valued
  naturally expresses "both" — three legacy string values collapse
  to two URIs with multi-cardinality.
- **`qudt:USCustomaryUnits` not `qudt:ImperialUnits`**: sol-weather's
  current "imperial" label maps to Open-Meteo's `imperial` API
  parameter, which returns °F / mph / inches — these are US Customary,
  not UK Imperial (which has different pints, gallons, etc.).
- **`schema:timezone` collapses `timezone` + `timezone-offset`**:
  the IANA name uniquely determines the offset (including DST
  transitions) and serves as both label source (last segment) and
  computation input. The current `5.5` offset stops working the
  moment India adopts DST; the IANA name doesn't have that problem.
- **`time:hours` / `time:days` accepted despite the domain stretch**:
  their domain is `time:DurationDescription` but RDFS domains aren't
  enforced and the semantic ("forecast lasts N hours / N days") is
  honest. Alternative was `schema:duration` with ISO 8601 strings,
  rejected because it complicated the integer-typed component code.
- **`schema:numberOfItems` over `swc:maxEvents`**: loose semantic
  fit, but legitimate. Used widely for collection caps in schema.org
  consumers.
- **Menu item `ui:attribute` Multiple stays**: the only case where
  PropertyValue indirection is genuinely appropriate — menu Component
  items carry HTML attributes whose names depend on the element being
  instantiated. Schema is open by design.

## Risks

- **`time:hours` / `time:days` domain stretch.** A strict SHACL
  consumer that checks domains might raise an eyebrow. Mitigation:
  if it actually fails for someone, switch those two to `schema:duration`
  with ISO 8601 (`"PT12H"`, `"P60D"`) and update component code to parse.
- **`schema:timezone` IANA-name migration assumes the user wants
  Asia/Kolkata, not literally "Mumbai".** Need to confirm before
  rewriting the file; the user may have intended "Mumbai" as a
  display preference unrelated to IANA.
- **dual-read transition period.** Components have to handle both
  shapes until Phase 5 lands. Small risk of forgetting to remove the
  fallback after migration is verified. Mitigation: explicit "remove
  legacy reader" sub-tasks in Phase 5, and a memory note marking the
  phase complete.
- **Existing user data in pods (if any) still uses PropertyValue.**
  Anyone who's already saved settings via the live `<sol-form>` has
  data in the old shape on disk. The dual-read keeps them working
  during transition; after Phase 5 they'd need a one-time data
  migration. dk's dev data files are easy to rewrite; pod data
  needs a small migrator script if it's deployed.

## Cross-component impact

- **dk-settings**: zero changes. The `buildForm` logic stays the
  same; sol-form internally picks the right rendering branch from
  the shape.
- **`scripts/shape2form.mjs`**: regenerate generated forms. Same code
  path with cleaner output. After migration, the generated `ui:Form`
  TTLs are solid-ui-renderable (the PropertyValue caveat goes away).
- **`help/sol-form-help.html`**: Demo tab + SHACL mapping tab need
  refresh as part of Phase 6.

## Related plans / memory

- [[PLAN-sol-form-redesign]] — the larger sol-form redesign this
  feeds into. Direct-predicate vocab unblocks the cleaner two-attr
  API and the view-mode work, because each shape descriptor binds to
  a real predicate (table cells, autocomplete labels, rolodex
  sort keys all become trivial property reads).
- [[PLAN-sol-tree-edit]] — also benefits: each level of a tree-edit
  drill binds to a real predicate, not a PropertyValue key.
- [[project-solid-logic-singleton-principle]] — the shared store
  everything mutates. Unchanged by the migration.
