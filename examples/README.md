# Examples — capability attributes

These pages show the **capability attributes**: load a capability with the
loader, and then plain elements gain a behaviour from a `data-*` attribute — no
extra component to place, no JavaScript on the element.

## Run them

Serve this checkout over http (the loader uses ES modules, which don't run from
`file://`):

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/examples/<page>`.

## The pages

- **`query-attr.html`** — `data-from-query`. Load `data-extend-with="sparql"`,
  put `data-from-query` (plus `endpoint`, `pattern`, `view`) on any element, and
  it runs the query and fills itself in. HTML views render in place; a URL view
  (`view="…/view.js"`) receives the result as W3C SPARQL Results JSON.

- **`editable.html`** — the `rdf` capability's attributes. Load
  `data-extend-with="rdf"`, then:
  - `data-edit-shape` + `data-subject` + `data-edit-mode` make **any** element
    editable from a SHACL shape. `data-edit-mode="inPlace"` edits where the
    element is; `data-edit-mode="collected"` gathers the editor into a
    `<sol-settings>` panel.

## Supporting files

- `profile.shape.ttl`, `sample-profile.ttl` — sample SHACL shape and data the
  pages read.
