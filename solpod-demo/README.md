# solpod-demo — Solid Web Components ↔ PodOS interop

Two independent web-component libraries — swc's `sol-*` and
[PodOS](https://github.com/pod-os/PodOS)'s `pos-*` — on one page, sharing **one login and one
RDF store**, with **no bridge script**. Inspired by Angelo Veltens'
[integration demo](https://angelo.veltens.org/pod-os/solid-web-comonents-integration.html), but
glueless: the wiring is declared in each library's **`sol-loader` manifest**, and the loader
pairs them automatically. Neither library is patched.

## `pod-os-first.html`

One `sol-loader` tag brings in both libraries:

```html
<script src="../dist/sol-loader.min.js"
        data-stage="local"
        data-manifest="../solpod-demo/pod-os.manifest.json"
        data-bundles="sol-query @pod-os/elements"
        data-extend-with="sparql"></script>
```

- swc loads from the local working tree; its manifest declares `interop.consumes` + `resource`.
- pod-os loads via the local descriptor `pod-os.manifest.json`, which maps `@pod-os/elements` →
  jsDelivr and declares `interop.provides` + `resource`.

The loader's `interop` pass pairs swc's `consumes` with pod-os's `provides`: when pod-os emits
`pod-os:loaded`, the loader hands its rdflib graph to `SolidWebComponents.rdf.useStore` and its
`authenticatedFetch` to `SolidWebComponents.adoptFetch`. Then `pos-*` and `sol-query` render the
same resource on the same graph and session. PodOS's `pod-os:resource-loaded` drives
`sol-query`'s endpoint through the shared `resource` channel.

### Verified (headless, `claude/smoke-tests/cdp-drive.mjs`)
- `SolidWebComponents.rdf.store === os.store.internalStore` — literally the same rdflib graph
  (117 triples for the public profile).
- pod-os's `authenticatedFetch` adopted (`adoptedFetch` set).
- `swc:interop` fired for both `rdf` and `auth` (`pod-os → solid-web-components`).
- pod-os renders "Tim Berners-Lee (solidcommunity.net)"; `sol-query` renders a 26-row SPARQL
  table over the same profile.

### Why PodOS-led
PodOS's `BrowserSession` builds its own inrupt `Session` with no inward hook, so swc can't push a
session _into_ PodOS — but PodOS hands its store + fetch _out_ via `pod-os:loaded`. So the deep
sharing is PodOS-led: PodOS leads auth, swc adopts. (The store lives at
`os.store.internalStore`, not `os.store` — `os.store` is a wrapper with `internalStore` /
`fetcher` / `updater`.)

### Editing a `pos-*` element with swc (no patch)
A `pos-*` element *can* be edited by `sol-form` — it just needs a SHACL shape. With the `rdf`
capability loaded, either:
- add attributes to the element: `shape="…shacl"`, `subject="…uri"` (when the subject isn't in
  `source`/`from-rdf` — `pos-resource` keeps it in `uri`), and `edit="inPlace|collected"`; or
- declare it once in a manifest's `interop.editable` (for elements whose HTML you don't control).

`sol-form` auto-generates the form from the shape; `edit="collected"` routes it into a
`<sol-settings>` panel, `edit="inPlace"` puts a gear on the element. The demo doesn't wire a live
editor only because that needs a SHACL shape authored for the profile (new predicates).
Uses a **public** resource so it renders with no login; sign in via `<pos-login>` for the shared
authenticated path.

## The manifest `interop` contract (generic, in `sol-loader`)

A manifest may carry:
```jsonc
"interop": {
  "provides": { cap: { "service"|"event": "…", "path": "…" } },  // what this lib offers + channel
  "consumes": { cap: { "call": "rdf.useStore" | "adoptFetch" } }, // and which surface method adopts it
  "resource": { "emits":   { "event": "…", "path": "…" },         // shared current-focus channel
                "accepts": { "selector": "…", "attr": "…", "transform": "stripHash" } }
}
```
The loader pairs a `consumes` cap with **another** library's `provides` cap (the "adopt the other
library's provider" rule), reads the value through the declared channel, and invokes a
**whitelisted** surface method (`rdf.useStore` / `adoptFetch` only — never an arbitrary string).
The `resource` channel keeps one current resource: any library's `emits` sets it; the loader
applies it to every other library's `accepts`.

This is fully symmetric — swc's own manifest declares both `provides` (via the host-services
registry) and `consumes`. A foreign library is glueless once it ships (or is described by) a
manifest with an `interop` block; ideally PodOS would publish its own.

## swc changes this relies on (small, additive, opt-in, library-neutral)
- **`core/inrupt-global.js`** + manifest `auth` capability: a shim publishing `window.solidClientAuthn`
  from the ESM inrupt build, so the `auth` capability is self-contained on the local stage.
- **`core/rdf.js#useStore`**: an explicit host adoption now wins over the solid-logic singleton probe.
- **`core/services.js#adoptFetch`** + **`core/auth-fetch.js`**: a host-registered foreign fetch is
  returned by `getAuthFetch()` when no `<sol-login>` is present.
- **`web/sol-loader.js`**: the generic `interop` matchmaker described above (no library names baked in).
