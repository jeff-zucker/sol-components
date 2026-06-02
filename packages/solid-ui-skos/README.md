# solid-ui-skos

This library makes [solid-ui](https://github.com/solidos/solid-ui)'s `ui:Choice` form field **SKOS-aware**. If you point a `ui:Choice`'s `ui:from` at a `skos:ConceptScheme`, `skos:Collection`, or `skos:Concept`, the form's dropdown will populate from the SKOS graph, rather than from an `rdf:type`.

```js
import 'rdflib';
import 'solid-logic';
import 'solid-ui';
import 'solid-ui-skos';
```
## Contract

`ui:from <X>` selects the option set by X's SKOS type. Every result renders as
one flat `<select>`.

This mirrors the stock `rdf:type` Choice, which is transitive over
`rdfs:subClassOf`; `skos:broader`/`narrower` is the SKOS analog, so both SKOS
cases return everything *below* X (never X itself):

| `ui:from` → | options |
|---|---|
| `skos:ConceptScheme` | **all** concepts in the scheme — every in-scheme/top concept plus the transitive `narrower` closure |
| `skos:Concept` | **all** narrower concepts (transitive) |
| `skos:Collection` | its `skos:member`s (recurses nested collections) |
| `skos:OrderedCollection` / `skos:memberList` | members **in list order** (not alphabetised) |

If a scheme has no concepts → empty list + a `console.warn`. Labels come from
solid-ui's own `label()` (it already reads `skos:prefLabel`). Non-ordered
option lists are sorted by label.

### Optional field hints

| hint on the `ui:Choice` field | effect |
|---|---|
| `ui:canMintNew true` | adds a **"+ New…"** control that mints a `skos:Concept` (prompts for a `skos:prefLabel`, types it, and places it via `skos:inScheme` / `skos:topConceptOf` / `skos:broader` / `skos:member` so it appears in the same field) |

`ui:canMintNew` applies to single-select fields. Minting drives solid-ui's own
`promptForNew` with `theClass = skos:Concept` and a one-field prefLabel prompt,
then writes the structural triples (see
[`src/skos-mint.js`](src/skos-mint.js) `skosMintStatements`).

## Examples

**Data**
```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<#Images> a skos:ConceptScheme ; skos:prefLabel "Images" .
<#Art>  a skos:Concept ; skos:prefLabel "Art"  ; skos:topConceptOf <#Images> ; skos:narrower <#Painting>, <#Sculpture> .
<#Life> a skos:Concept ; skos:prefLabel "Life" ; skos:topConceptOf <#Images> ; skos:narrower <#Nature> .
<#Painting>  a skos:Concept ; skos:prefLabel "Painting"  ; skos:broader <#Art> .
<#Sculpture> a skos:Concept ; skos:prefLabel "Sculpture" ; skos:broader <#Art> ; skos:narrower <#Marble> .
<#Marble>    a skos:Concept ; skos:prefLabel "Marble"    ; skos:broader <#Sculpture> .
<#Nature>    a skos:Concept ; skos:prefLabel "Nature"    ; skos:broader <#Life> .
```

**Form — a whole scheme**
```turtle
@prefix ui: <http://www.w3.org/ns/ui#> .
<#topicField> a ui:Choice ; ui:label "Topic" ; ui:property <http://www.w3.org/ns/dcat#theme> ;
    ui:from <#Images> .
```
→ `Art, Life, Painting, Sculpture, Marble, Nature` (all concepts in the scheme).

**One branch**: `ui:from <#Art>` → `Painting, Sculpture, Marble` (all narrower).

**Curated subset**: `ui:from <#Faves>` where `<#Faves> a skos:Collection ; skos:member <#News>, <#Culture> .`

## With `<sol-form>` / shape-to-form

`<sol-form>` synthesises the field from a SHACL shape, so emit `ui:from`
via the shaclc annotation block:

```
dcat:theme [1..1] % sh:name "Topic" ; ui:from <feeds.ttl#Feeds> % .
```

No special case needed — the synthesised `ui:Choice` flows through the same
decorated handler.

## API

```js
import { gatherSkosOptions } from 'solid-ui-skos/gather';
// → { options: NamedNode[], ordered: boolean }
const { options, ordered } = gatherSkosOptions(kb, fromNode, dataDoc);

import { skosMintStatements } from 'solid-ui-skos';
```
`gatherSkosOptions` is pure (rdflib-only) and is the exact logic proposed for
upstream solid-ui (see `pr/`), so the add-on is effectively a **polyfill** of
that PR — drop it once solid-ui ships native SKOS support.

## Status

- ✅ Choice enumeration — scheme/concept transitive, Collections (order
  preserved) — unit-tested (`npm test`) **and** headless-smoke-tested in real
  Chrome against real solid-ui.
- ✅ `ui:canMintNew` minting — unit-tested (`skosMintStatements`) and exercised
  in the headless smoke test (mint → place → select).
- ⏳ Autocomplete path for very large schemes (feed members into
  `ui:AutocompleteField`) — not started.

## Requirements

Peer dependencies: `rdflib`, `solid-logic`, `solid-ui` (the standard Solid app
trio — the add-on imports the latter two to self-wire). Browser/DOM at runtime
(solid-ui is browser-only). Unit tests use `rdflib` (`npm test`); a headless
Chrome smoke test lives in `test/smoke/`.

## Transparency

Created, in part, using Claude Opus 4.8.

## License

(c) Jeff Zucker, 2026; may be freely used under an MIT license
