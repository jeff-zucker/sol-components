# sol-settings — discovery-driven editor list

## Status

**Built and shipping** (2026-05). dk's `pages/settings.html` is one
line — `<sol-settings>` — and the component does the rest.

## Motivation

A "Settings" surface for any app is the same job: walk the page,
find every editable widget, present an editor for each. swc owns the
generic implementation; every consumer just drops the element on
the page.

## How it works

```html
<sol-settings></sol-settings>
```

On connect, `<sol-settings>` walks `document` plus every nested
shadow root and finds elements whose custom-element class either:

- declares `static get editor()` returning a rich spec, or
- declares `static get shape()` returning a SHACL URI

Each match becomes one accordion panel. The panel summary shows a
friendly label (`label` attribute on the element, falling back to a
titlecased tag name). The panel body is **lazy-mounted on first
expand** — `<sol-form>` (or another editor declared by the class)
gets created with the host's `source` attribute as its `subject`,
and a `save-to` matching it. On a successful `sol-form-save`, the
source widget's `reload()` is invoked so the change is reflected
without a page refresh.

Editor declaration resolution (in `core/editor.js#resolveEditorSpec`):

- `editor` of `{ inline: true }` → opt out (no panel)
- `editor` string (URI) → `sol-form` with that ui:Form
- `editor` object `{ tag, subjectAttr?, attrs? }` → mount the named
  custom element; subject goes on `subjectAttr` (defaults to
  `subject`) and `attrs` is spread onto the element
- no `editor` but `shape: <URI>` → implicit
  `{ tag: 'sol-form', attrs: { shape } }`
- neither → not editable; skipped

## What it depends on

- `web/sol-accordion.js` — visual host
- `core/editor.js` — `resolveEditorSpec` + `buildEditorElement`
- the discovered components themselves (sol-form / sol-tree-edit /
  …) being already imported in the page

## What we considered but didn't ship

A **declarative** API where the consumer authors `<sol-form>`
children directly inside `<sol-settings>` and the component just
adds the accordion chrome + lazy mount. That's simpler in some
respects (no DOM walk; no convention-driven slug derivation), but
in dk's use case the editable widgets are mounted by other apps
(sol-time/sol-weather/sol-calendar inside the dashboard,
sol-menu in the chrome) and Settings shouldn't have to redeclare
them. Discovery is the right default. If a consumer ever wants
explicit-only mode, an attribute on `<sol-settings>` could turn the
walk off.

## Open follow-ups

- Discovery only sees widgets currently in the DOM. dk's tabs are
  keep-alive so this Just Works — hidden tabs are still in DOM.
  Other apps may need to invoke discovery again when their content
  changes (an attribute or method for that hasn't been needed yet).
- Per-component `reload()` is the post-save refresh hook;
  components without one are still editable, just without the
  in-place re-render.
- See `swc/data/menu-items.shacl` for the `sh:node`-driven nested
  PropertyValue rendering that powers per-menu-item attribute
  editing inside `<sol-tree-edit>` — this is the editor
  `<sol-settings>` discovers and mounts for `<sol-menu>`.
