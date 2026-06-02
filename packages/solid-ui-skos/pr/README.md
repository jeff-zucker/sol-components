# PR: native SKOS support for `ui:Choice` in solid-ui

> Companion to the `solid-ui-skos` add-on (the parent package). The add-on is a
> runtime polyfill; this is the same behaviour integrated *in place* (no
> decorator). Once merged, the add-on becomes a no-op and can be dropped.

**Applied** on a fork: `jeff-zucker/solid-ui-jz-skos`, branch
`feat/skos-choice-options` (no upstream PR opened yet). Changes live in
`src/widgets/forms.js`, with jest tests in
`test/unit/widgets/forms/skosOptions.test.ts`.

## Summary

Today `ui:Choice` enumerates options as `kb.each(undefined, rdf:type, uiFrom,
formDoc)` (+ `findMembersNT`, which is transitive over `rdfs:subClassOf`). When
`ui:from` points at a `skos:ConceptScheme` / `skos:Collection` / `skos:Concept`,
gather by SKOS semantics instead. **Backward-compatible**: pointing `ui:from`
at any of those yields *nothing* today, so no existing form regresses.

### Behaviour

Parity with the existing rdf:type Choice (transitive over `rdfs:subClassOf`);
`skos:broader`/`narrower` is the SKOS analog, so both concept cases are
transitive (everything below X, never X itself):

| `ui:from` → | options |
|---|---|
| `skos:ConceptScheme` | **all** concepts in the scheme (every in-scheme/top concept + transitive `narrower` closure) |
| `skos:Concept` | **all** narrower concepts (transitive) |
| `skos:Collection` | `skos:member`s (nested collections recursed) |
| `skos:OrderedCollection` / `skos:memberList` | members in list order (not sorted) |

No new ontology terms. Labels already work via solid-ui's `label()`
(`skos:prefLabel`).

## (1) Add the gather function

Add `gatherSkosOptions` (verbatim from the add-on's
[`src/skos-options.js`](../src/skos-options.js) — pure, rdflib-only) to
`src/widgets/forms.js` and export it. Pure → unit-testable, and the add-on uses
the identical logic.

## (2) Splice into the Choice field

In the `ui:Choice` field handler (`field[ns.ui('Choice').uri]`), inside
`getSelectorOptions(dataSource)`, before the existing `rdf:type` gather:

```js
const SKOS = 'http://www.w3.org/2004/02/skos/core#'
const isSkosFrom = t => kb.holds(uiFrom, ns.rdf('type'), kb.sym(SKOS + t))
if (isSkosFrom('ConceptScheme') || isSkosFrom('Collection') ||
    isSkosFrom('OrderedCollection') || isSkosFrom('Concept')) {
  return gatherSkosOptions(kb, uiFrom, dataSource).options
}
```

(`gatherSkosOptions` returns `{ options, ordered }`; ordered collections set
`ordered:true` so callers can skip alphabetising — the add-on does, and the
in-tree select already preserves insertion order for the returned array.)

## (3) Minting — `ui:canMintNew` on a SKOS Choice

A SKOS Choice keeps the `ui:canMintNew` affordance class-backed Choices have —
otherwise it's a regression, and the generic mint produces an **untyped,
unplaced orphan node** (it types the new node as `ui:from`, i.e. the scheme).
So minting is made SKOS-correct:

- `makeSelectForChoice` types the minted node from **`options.mintClass`**
  (falling back to `ui:from`), fixing the mistype — backward-compatible.
- For a SKOS `ui:from` + `ui:canMintNew`, the Choice field sets
  `mintClass = skos:Concept`, a one-field `skos:prefLabel` `subForm`, and a
  `mintStatementsFun` = **`skosMintStatements`** that places the new concept:
  scheme → `skos:inScheme` + `skos:topConceptOf` (a new top concept); concept →
  `skos:broader` (+ inherited `skos:inScheme`); collection → `skos:member`.

So the minted concept is typed and placed, and shows up in the same field.
`skosMintStatements` is exported + unit-tested.

## Tests

`test/unit/widgets/forms/skosOptions.test.ts` (jest, jsdom) covers:
`gatherSkosOptions` (scheme→all, concept→all narrower, in-scheme-only scheme,
empty, collection, ordered `memberList`); `skosMintStatements` (scheme /
concept / collection placement); and jsdom **integration** — rendering the
`ui:Choice` field, the `ui:canMintNew` "create new" option, and a full
mint→place→select. All pass (`npx jest`).

## Rejected

- **Hierarchical / cascading (drill-down) picker.** A SKOS analogue of
  `ui:Classifier` over `skos:broader`/`narrower` is **not planned** — results
  stay a single flat `<select>`. Recorded as a deliberately rejected option.

## Out of scope (later)

- Autocomplete path for very large schemes (feed members into
  `ui:AutocompleteField`).
