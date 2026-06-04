# SWC capability model — components + attributes + ambient services

**Status:** design note. Captures the contract for what each `sol-loader` capability
(`data-extend-with="…"`) gives a consuming app. Some of it is implemented today; the rest is
proposed, marked **[proposed]**. The goal is one consistent rule so apps reason about capabilities
the same way every time.

## The rule

A capability is three things:

1. **Components** — custom elements it registers (`sol-*`).
2. **Attributes** — a cross-cutting `data-*` vocabulary that works on **any** element (a `sol-*`
   element, a foreign library's element, or a plain `<div>`), interpreted by the capability's
   runtime.
3. **Ambient services** — page-wide behavior with no per-element markup.

An app opts in once (`data-extend-with="rdf auth sparql"`) and then just adds tags and attributes;
nothing else is needed in the page or a manifest.

**Prefix: `data-*`, decided.** The capability attributes are usable on **non-component** elements —
`data-from-query` populates any element, `data-from-rdf` renders into any container, and the edit
attributes can host a gear on a plain element. Non-`data-` attributes on standard elements are
invalid HTML, so the cross-cutting vocabulary is `data-*` throughout. (Component-specific attributes
that only ever sit on a `sol-*` element — `source`, `endpoint`, `shape`, sol-menu's `from-rdf` — stay
bare and remain accepted as aliases of their `data-*` capability form.)

## The three capabilities

### `rdf`
| | |
|---|---|
| **Components** | `sol-form`, `sol-settings` |
| **Attributes** | `data-edit-shape="…shacl"` + `data-edit-mode="inPlace\|collected"` (+ `data-subject="…uri"`) → auto-generated editor on any element (today implemented as `shape=` / `edit=` / `subject=`, kept as aliases — see *Implemented*). `data-from-rdf="…ttl"` → **load** RDF from a Turtle document into the shared store and hand the element the **same W3C SPARQL Results JSON** that `data-from-query` returns — the document's triples as `?s ?p ?o` bindings (it does **not** render). Delivery: `el.swcData` + a `view="…/view.js"` module's `render(container, data, el)`. **Implemented.** |
| **Ambient** | — |

### `auth`
| | |
|---|---|
| **Components** | `sol-login` |
| **Attributes** | — |
| **Ambient** | an authenticated fetch is available to every component (a `<sol-login>` session, or a host-adopted fetch via `SolidWebComponents.adoptFetch`). **Implemented.** |

### `sparql`
| | |
|---|---|
| **Components** | `sol-query` |
| **Attributes** | `data-from-query` → run a SPARQL query for any element, configured by **the full `sol-query` attribute set on the same element** (`endpoint`, `sparql`, `view`, `pattern`, `var-*`, …). HTML views (`table`/`list`/…) **replace** the element's content; a URL view (`view="…/view.js"`) gets the results object — the W3C SPARQL 1.1 Query Results JSON — via `render(container, data, el)`. |
| **Ambient** | — |

`auth` being attribute-free is correct: it's a *service*, not a per-element behavior. The
asymmetry with `rdf`/`sparql` is a feature, not an inconsistency.

## What's implemented today (the editing strand)

The `rdf` editing path already works as attributes, just under the current names:

- `shape="…shacl"` on **any** element makes it editable (`core/editor.js#resolveEditorSpec` reads
  the instance attribute — no class declaration, no manifest).
- `subject="…uri"` locates the subject when it isn't in `source`/`from-rdf` (e.g. a foreign
  element that keeps it in `uri`).
- `edit="inPlace|collected"` chooses placement (`core/editor.js#editPlacement`): `inPlace` = a
  gear on the element; `collected` = gathered into a `<sol-settings>` panel. Legacy `editor-self`
  is an alias for `edit="inPlace"`.
- Activated by `core/edit-placements.js`, which the `rdf` capability loads.
- For elements whose HTML you don't control, the same thing is declarable in a manifest's
  `interop.editable` block (selector → `{ shape, subject:{attr}, forms, present, open }`).

So the canonical `data-edit-shape` / `data-edit-mode` are an **alias layer over working behavior**,
not new machinery: `data-edit-shape` ← `shape`, `data-edit-mode` ← `edit`, `subject=` stays. The
remaining work is adding the `data-*` canonical names + reading `data-edit-mode` in
`editPlacement` (currently reads `edit`).

## Naming — decided

1. **`data-edit-shape` / `data-edit-mode`** are canonical (was the `edit-access` question;
   **`edit-mode`** is the chosen placement word — "access" was dropped to avoid colliding with WAC
   access-control). The current `shape=` / `edit=` remain as back-compat aliases.
2. **`data-from-rdf`** generalizes the existing `from-rdf`. Reconcile, don't overload: **one
   attribute, one job** — it *renders* an element's content from RDF via the `ui:` ontology; it must
   not double as the edit subject locator (that's `subject=` / `data-subject=`). sol-menu's bare
   `from-rdf` stays as the legacy alias of `data-from-rdf`.
3. **Prefix `data-*`** across the cross-cutting vocabulary (see *The rule* — these attributes are
   usable on non-component elements, so `data-*` is the spec-clean choice). Bare component attrs
   remain as aliases.

## Rendering & query config — settled

`data-from-query` reuses **the existing `sol-query` attribute vocabulary** on the same element
(`endpoint`, `sparql`, `view`, `pattern`, `var-*`) — no new query knobs to invent. Rendering:
- **HTML views replace** the element's content (`view="table|list|…"` → the activator owns
  `innerHTML`; don't hand-author content there).
- **Data object**: a URL view module (`view="…/view.js"`) receives `render(container, data, el)`
  where `data` is the **W3C SPARQL 1.1 Query Results JSON** (verify at build that the results object
  handed to custom views is exactly that shape, vs. an internal binding form).

## Precedence — settled: augment

When a capability attribute lands on a component that already owns its content (e.g.
`data-from-query` on `<sol-feed>`), it **augments** — the capability's contribution is added
alongside the component's own behavior, not replacing it. (Distinct from the render-target rule
above, where the capability owns a plain element it's explicitly told to fill.)

## Two structural recommendations

1. **Declare each capability's attribute vocabulary in the manifest — decided.** e.g.
   `capabilities.rdf.attributes: ["data-edit-shape","data-edit-mode","data-from-rdf"]`. It becomes
   self-documenting, and the loader emits a **`console.warn`** when a declared attribute is present
   on the page but its capability wasn't loaded (*"you used `data-from-query` but didn't
   `data-extend-with="sparql"`"*) — a dev-time DX aid that keeps the loader generic (it just reads
   the list). Independence: capabilities do **not** imply one another — `sparql`/`rdf` use the
   ambient authenticated fetch *if* `auth` is loaded, but work unauthenticated otherwise.
2. **One activator module per capability**, modeled on `core/edit-placements.js`: a small module
   the capability loads that `observeExtensionPoint`/walks the DOM for its attributes and wires the
   behavior. So `rdf` ships the edit activator + a `data-from-rdf` activator; `sparql` ships a
   `data-from-query` activator; `auth` ships none (ambient). Uniform and opt-in.

## Decisions (all settled)

- **Names:** `data-edit-shape`, `data-edit-mode`, `data-subject`, `data-from-rdf`,
  `data-from-query` (bare `shape`/`edit`/`subject`/`from-rdf` remain as aliases).
- **Prefix:** `data-*` for the cross-cutting vocabulary (usable on non-component elements).
- **`data-edit-mode`** values `inPlace|collected` (dropped "access" → WAC collision).
- **`data-from-query`** reuses the `sol-query` attribute set (`endpoint`/`sparql`/`view`/…);
  HTML views **replace** content; a URL view receives the W3C SPARQL JSON results object.
- **`data-from-rdf`** = load data from a TTL document (as the existing `from-rdf`), render via the
  `ui:` ontology; read-only.
- **Precedence:** **augment** on content-owning components; **replace** when filling a plain
  element it's told to render into.
- **Capabilities are independent**; auth is ambient (used if loaded, optional otherwise).
- **Manifest declares each capability's `attributes`**; loader `console.warn`s on use-without-load.
- **Store precedence** unchanged: explicit adoption wins → else solid-logic liveStore → else fresh
  graph (the liveStore-idle-when-also-adopting case is accepted).

Verified at build: the results object handed to a custom view IS the W3C SPARQL 1.1 Query Results
JSON envelope (`core/utils.js#w3c` → `{ head:{vars}, results:{bindings} }`).

**`data-from-rdf` — settled & implemented.** Both capabilities emit the **same** W3C SPARQL
Results JSON: `data-from-query` from a `SELECT`, `data-from-rdf` from the loaded document's triples
as `?s ?p ?o` bindings. Delivery for `data-from-rdf`: the object is set as `el.swcData` and passed
to a `view="…/view.js"` module via `render(container, data, el)` (no built-in render).

Observed (pre-existing, out of scope): the vendored **Comunica** browser build throws
`(0, …tracingChannel) is not a function` — a Node-only API in the bundle — so full SPARQL
`SELECT` via Comunica fails and `sol-query` falls back to rdflib (triple-pattern path works;
`view="table"` over a plain endpoint works).
