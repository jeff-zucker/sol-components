# sources/ — headless data-source adapters

An **open set** of importable, source-blind scripts that produce RDF for the
display components (`<sol-gallery>`, …). The split: **providers** acquire data
and emit RDF; **displays** render RDF and nothing else. Neither knows the
other's origin. RDF is the only interchange.

Design spec: `PLAN-source-adapters.md` in the open_media_player repo.

## Files

| file | role |
|---|---|
| `contract.js` | The canonical vocab (schema.org + dcat) + read/write helpers both sides share. `addImageItem`/`readImageItems` (a `schema:ImageObject`), `addCollection`/`readCollections` (a `dcat:Dataset`/`schema:ImageGallery`). Defines the `Provider` typedef. |
| `registry.js` | The open-set slot: `registerProvider` / `providers` / `getProvider` / `providersForKind`. Providers self-register on import; a host iterates the registry to build data-driven UI. Adding a source = a module + one `registerProvider` call, zero host edits. |
| `commons.js` | Shared "Commons category → ImageItem RDF" loader. `imagesToStore` (pure) + `loadCategory` (async-iterable paging). All Commons network access lives here; every image provider's `load()` delegates to it. |
| `commons-file.js` | Image provider over a curated SKOS/DCAT file (omp's `images.ttl`). `catalog()` exposes the local topic tree for the host's selectors; `search()` flattens to CollectionRecord RDF; `load()` → `loadCategory`. Self-registers. |
| `smoke-test.mjs` | Node check of the no-network logic. `node sources/smoke-test.mjs`. |

## The provider interface

```js
{
  id, label, kinds: ['image'], display: 'sol-gallery',
  capabilities: { search, load },
  search?(query, opts) -> AsyncIterable<Store>,   // CollectionRecord pages (no topic)
  load(ref, opts)      -> AsyncIterable<Store>,    // ImageItem pages
}
```

`ref` is opaque to the host (for images, a Commons category URL). Topics/genres
are **local** — owned by the host, never emitted by a provider's `search()`.

## The display contract (what a display consumes/emits)

```
display.clear()            // new collection selected
display.add(store)         // append a page of records  ← the seam
display 'item-opened'      // event → opened item IRI (for lazy per-item detail)
display 'load-more'        // event → host pumps the next page (lazy paging)
```

## Status

Foundation built + node-verified (contract round-trips, paging offsets, real
SKOS/DCAT reads, registry). Still to do: slim `<sol-gallery>` to the display
contract above; a `wikidata-images` provider; host wiring in omp.
