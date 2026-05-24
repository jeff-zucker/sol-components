# sol-settings — generalized editor list for any page

## Status

**Designed, not built.** Came out of refactoring dk-settings into a
pages/settings.html snippet + populating script. The script's job
("walk the page for editable widgets, present each in an accordion")
is generic enough that it should live in swc, not duplicated in
every consumer that wants a Settings surface. `<sol-settings>` is
that generalization.

## Motivation

dk's settings UI walked the page (and a manifest) for every element
declaring `static get shape()`, built an accordion row per widget,
and mounted a `<sol-form>` per row. That logic isn't dk-specific —
**any app that has editable widgets wants a "settings" surface that
presents an editor for each**. Today every consumer would have to
re-author that walk + the accordion + the per-widget sol-form
wiring. Bad.

After this plan, the consumer writes:

```html
<sol-settings>
  <sol-form shape="…/weather.shacl" subject="data/weather.ttl#Settings"></sol-form>
  <sol-form shape="…/time.shacl"    subject="data/time.ttl#Settings"></sol-form>
  <sol-form shape="…/calendar.shacl" subject="data/calendar.ttl#All"></sol-form>
  <sol-form shape="…/menu.shacl"     subject="data/menu.ttl#MainMenu" view="accordion"></sol-form>
</sol-settings>
```

…and gets the accordion + labels + lazy mount + auto-save event
plumbing for free. dk's `src/dk-settings.js` disappears entirely.

## API

```html
<sol-settings>
  <sol-form …></sol-form>
  <sol-form …></sol-form>
</sol-settings>
```

**Children** — any number of `<sol-form>` instances. Each becomes one
accordion panel. Other child types are ignored (so a comment or
decorative element won't break the layout).

**Attributes** — none required. Optional future-extension surface:

| Attribute | Type | Purpose |
|---|---|---|
| `discover` | `"live"` / `"registered"` / `"hybrid"` / `"off"` | Auto-discovery mode (see "Discovery modes" below). Defaults to `"off"` for v0 — purely declarative. |
| `label-from` | predicate URI | Predicate the row label is read from on the form's subject. Default: `rdfs:label` → falls back to `ui:label` → falls back to local-part of subject URI. |

**Per-row label derivation order** (when not overridden):

1. `<sol-form>`'s `label` attribute, if explicitly set.
2. The subject node's `rdfs:label` in the loaded data store.
3. The subject's `ui:label`.
4. The shape's `sh:name` on the matching NodeShape.
5. The local-part of the subject URI's fragment.

**Per-row body** — the `<sol-form>` element itself is moved into the
accordion row body. Its existing attributes (shape / subject /
view / no-edit / dry-run / source) carry through unchanged; sol-form
does its own loading and rendering.

**Lazy mount** — sol-settings doesn't pre-mount the inner sol-forms.
It moves them into accordion content slots but defers their
`connectedCallback` work until the corresponding panel opens. The
mechanism is a small move-into-panel-on-toggle dance:

- On construction, sol-settings collects the children but doesn't
  attach them to a live DOM tree yet (held in a DocumentFragment).
- On first panel-open, the corresponding child is moved into the
  panel's body div; its `connectedCallback` fires; sol-form fetches
  shape + data.

For consumers that want eager mount, an `eager` attribute can flip
the default.

**Events** — `sol-form-save` bubbles through the accordion to
sol-settings's host as-is. sol-settings adds no events of its own
in v0; a future `sol-settings-discovered` event could announce the
result of an automatic discovery pass.

## Discovery modes (deferred to v1+)

v0 is **fully declarative** — the consumer enumerates children. That's
the smallest useful component and the easiest to migrate dk-settings
onto without losing anything.

v1+ adds opt-in discovery via the `discover` attribute:

- **`discover="live"`** — walks the document and every open shadow
  root for elements whose constructor has `static get shape()`. For
  each found instance, synthesizes a `<sol-form>` row bound to that
  element's `source` / `from-rdf` attribute. Pure — only edits what's
  on screen.
- **`discover="registered"`** — walks every registered custom-element
  constructor with `static get shape()`. For each type not already
  matched by a live instance or a declared child, uses
  `static get defaultSource()` (a new convention) for the subject.
  Edits everything dk knows about, even when the host tab isn't
  active.
- **`discover="hybrid"`** — live + registered fallback. Live wins
  where instances exist; registered fills in the gaps. The closest
  match to what dk-settings used to do via its KNOWN_WIDGETS
  manifest.

Declared children always survive — discovery only adds to the set
(deduped by `{tag, subject}`).

**Why deferred**: discovery adds three real complications — shadow-
root piercing policy, default-subject convention on types, and
multi-instance disambiguation — none of which dk needs urgently.
Ship the declarative core first; layer discovery on once a real
consumer requests it.

## Shadow-root piercing (when discovery lands)

Discovery walks have to choose: do open shadow roots belong to the
search space?

- **Yes** — sol-include hosts pages/home.html in its shadow, so
  any widget on Home is reachable only through sol-include's shadow.
  Without piercing, discovery misses Home entirely once we've
  refactored Home into a sol-include snippet.
- **No** — a `<sol-rolodex>`'s shadow contains chrome elements that
  match the same selectors; piercing pulls in spurious matches.

**Proposed policy**: pierce `sol-include` shadow roots specifically
(they're a "host this content here" semantic), skip everything else.
Sol-include is a known interop boundary; rolodex / accordion / form
shadows are internal implementation. If a future component wants to
opt in, it declares `static get shadowSearchable() { return true; }`
and discovery picks it up.

## Multi-instance widgets

If the page has two `<sol-feed>` elements visible, both should
become panels. The discovery walk returns both; the declarative
children path naturally handles multiples.

Disambiguating labels: if two rows would have the same display
label, suffix each with the subject's local-part (or first 8
characters of a hash) to keep them distinct. Avoid synthesizing the
labels at parse time — only de-collide on render.

## Where sol-tree-edit fits

After the `<sol-form view="accordion">` work
(see [[PLAN-sol-form-redesign]]), `sol-tree-edit` becomes a special
case of sol-form. The dk Settings menu row becomes:

```html
<sol-form shape="shapes/menu.shacl" subject="data/menu.ttl#MainMenu" view="accordion"></sol-form>
```

sol-settings doesn't need to know it's a tree-shaped editor — it
just sees a `<sol-form>` child and accordions it. The fact that the
form's `view=accordion` renders ITS OWN nested accordion inside is
sol-form's business, not sol-settings's.

This is part of why making sol-settings declarative-first is the
right move — it composes with whatever sol-form decides to render,
no special cases for tree shapes.

## Phases & time estimates

### Phase 1 — Declarative core

- Author `web/sol-settings.js` (~80–120 lines).
- Custom element. On `connectedCallback`, walk children for
  `<sol-form>`, move each into a deferred slot, build the accordion
  structure.
- Label derivation chain as listed in the API section above.
- Lazy mount on panel-open.
- Smoke test against a small fixture page (one sol-form per
  primitive datatype).

**Estimate: 2.5 hours.**

### Phase 2 — Adopt in dk

- Replace `pages/settings.html` with a four-child `<sol-settings>`.
- Delete `src/dk-settings.js`.
- Drop the `./dk-settings.js` import from `src/dk-shell.js`.
- Migrate the `.dk-settings` CSS rules from class selectors to apply
  via `<sol-settings>`'s own styles (or keep them targeting
  `.dk-settings` on a wrapping section in pages/settings.html).
- Smoke test: open Settings tab, expand each row, save a value,
  confirm round-trip.

**Estimate: 1.5 hours.**

### Phase 3 — Help-page demo + docs

- Update `help/sol-form-help.html`'s Demo tab to reference
  sol-settings as the canonical multi-form surface (the existing
  shape2form demo stays, but linked).
- New help page `help/sol-settings-help.html` with the tabbed
  pattern matching other component help pages: Demo / Attributes /
  Lazy mount / (future) Discovery.
- Update `home.html`'s component list with a `sol-settings` row.

**Estimate: 2 hours.**

### Phase 4 — Discovery, when needed

Deferred. Build when a real consumer requests it (probably when
dk grows a second editable surface or when another app wants
"settings everywhere"). Adds the `discover` attribute + the
shadow-piercing policy + the `static get defaultSource()` convention.
Sub-phases:

- 4a. `discover="live"` (~3 hours)
- 4b. `discover="registered"` + `static defaultSource` convention (~2 hours)
- 4c. `discover="hybrid"` (~1 hour after 4a + 4b)

### Total to ship

**~6 hours** for Phases 1–3 (declarative core + dk adoption + docs).
Discovery is +6 hours when its time comes.

## Cross-component impact

| Component | Impact |
|---|---|
| **dk-settings.js** | Deleted. `pages/settings.html` becomes pure HTML with `<sol-settings>` and four `<sol-form>` children. |
| **`<sol-form>`** | No change for v0. When discovery lands and `view=accordion` is the way sol-tree-edit is invoked, sol-settings transparently composes with it. |
| **`<sol-tree-edit>`** | Eventually deprecated in favour of `<sol-form view="accordion">` (see [[PLAN-sol-form-redesign]]). sol-settings doesn't care which is used — both render as `<sol-form>` children. |
| **`<sol-include>`** | Trusted-mode now renders into light DOM (separate change just landed), so sol-settings inside an included snippet inherits host styles cleanly. |
| **shape2form (the CLI + helper)** | Unchanged. sol-settings layers on top of sol-form; shape-to-form is sol-form's own renderer. |

## Open design questions

1. **Should sol-settings wrap its accordion in any chrome (h2,
   hint paragraph)?** dk has both currently. Cleanest: no — chrome
   is consumer-provided around sol-settings (pages/settings.html
   keeps its `<section><header>…</header></section>` wrapper, with
   sol-settings as the next child). sol-settings stays pure
   "accordion of editors."
2. **Lazy mount default vs. eager.** Lazy is the right default
   (sol-form fetches per panel rather than four parallel fetches on
   page load), but eager might be wanted for "see everything at
   once" surfaces. Settle on lazy default, `eager` attribute as
   opt-out.
3. **What if a sol-form child has no `shape` or `source`?** Probably
   skip with a console warning (the form has nothing to render).
   Alternatively, render an empty row with a placeholder error.
   Lean toward skip — silent on the default case, warning in dev.
4. **Reorder controls on the accordion rows?** Initially no — the
   order is the declared child order. If multiple instances of the
   same shape become common, manual reorder via drag handles could
   land in a follow-up.
5. **Saving state of expanded panels.** Should sol-settings remember
   which panel was last open across visits? Probably yes,
   localStorage-keyed by the page URL. Deferred to phase 4 — no
   strong demand yet.

## Risks

- **CSS isolation surprises.** sol-settings is light-DOM by design
  (so host styles reach in). If a consumer's CSS conflicts with
  sol-accordion's injected style (each accordion adopts its own
  CSS via `ensureDocStyle`), there could be cascade collisions.
  Mitigation: sol-settings's accordion children carry a
  `.sol-settings-accordion` class so consumers can scope overrides
  precisely without affecting other accordions on the page.
- **sol-form mounting cost.** Each accordion row that opens triggers
  a shape fetch + a data fetch. For the four rows dk has, that's
  fine. For a hypothetical 50-row Settings page, the per-row cost
  becomes visible. Mitigation deferred until the case shows up.
- **Discovery (when it lands) is a real piece of complexity.**
  Shadow piercing, default-subject convention, dedup — three
  axes that interact. Best mitigation is the deferral to phase 4
  — let dk dogfood declarative-only first; only widen the surface
  when a second consumer actually shows up.

## Related plans / memory

- [[PLAN-sol-form-redesign]] — sol-form's `view=` mode work that
  unifies record / rolodex / table / auto-complete / accordion.
  sol-settings composes with whichever view the inner form uses.
- [[PLAN-sol-tree-edit]] — the standalone tree-edit plan. After
  the view-modes work, the tree-edit role merges into
  `<sol-form view="accordion">` and the standalone component
  becomes redundant; sol-settings doesn't have to know about it
  either way.
- [[PLAN-shape2form-or-and]] — `sh:or` / `sh:and` support in the
  shape→form pipeline. Orthogonal to sol-settings, but every form
  inside sol-settings benefits as that lands.
- [[project-shared-editor-principle]] — the architectural rule
  that every editable sol-* component is configurable from dk
  Settings via sol-form + per-component shape. sol-settings is the
  packaging of that rule for any consumer.
- [[project-direct-predicate-vocab]] — the predicate choices each
  form uses. Unchanged by sol-settings.
