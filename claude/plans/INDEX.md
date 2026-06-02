# swc plans — index

Quick map of what's in `claude/plans/` and where each plan stands.

## Active / not yet started

| Plan | Status | Estimate | Summary |
|---|---|---|---|
| [PLAN-sol-form-redesign](PLAN-sol-form-redesign.md) | Not started | (large) | Two-attribute API (`shape` + `data`), `view=record/rolodex/table/accordion/auto-complete`, `dry-run` attribute. Subsumes sol-tree-edit. |
| [PLAN-shape-file-consolidation](PLAN-shape-file-consolidation.md) | Not started | ~10 h | One SHACL file per editable type, `sh:targetClass` dispatch + `swc:` linkage predicates (`children`, `childClasses`, `drillDown`, `displayLabel`). Prereq for `view=accordion`. |
| [PLAN-shape2form-or-and](PLAN-shape2form-or-and.md) | Not started | ~10–11 h | `sh:or`/`sh:and` support in shape2form (and the renaming from shape**cl**2form). Path to optional ShEx down the road. |
| [PLAN-sol-form-skos](PLAN-sol-form-skos.md) | Not started | ~3–4 h | Wire `solid-ui-skos` into sol-form: import the add-on (activates the SKOS `ui:Choice` decorator) + have shape2form emit `ui:from <scheme>` for SKOS concept properties → transitive SKOS dropdowns + mint in `<sol-form>`. Add-on lives in `packages/solid-ui-skos/`. |
| [PLAN-sol-tree-edit](PLAN-sol-tree-edit.md) | v0 shipped, superseded by redesign | — | Read-render of two-shape tree menus. Will be marked deprecated once `<sol-form view="accordion">` lands. |
| [PLAN-sol-calendar](PLAN-sol-calendar.md) | Pre-existing | — | Calendar component plan (not from this session). |

## Completed

| Plan | Completed | Notes |
|---|---|---|
| [PLAN-sol-settings](PLAN-sol-settings.md) | 2026-05 (shipped); follow-ups closed 2026-05-26 | Discovery-driven `<sol-settings>` (walks doc + shadow roots for `static editor`/`static shape`), accordion with lazy-mount per panel, `sol-tab-activate` re-discovery, public `refresh()` method. All discoverable widgets confirmed to implement `reload()` for post-save refresh. |
| sol-pod/sol-login/sol-menu/sol-include polish + cross-window auth (no dedicated plan) | 2026-05-26 | Tactical pass on dk-solidos auth wiring + supporting swc work. sol-pod: auto-init + single-flight `initialize()`, last-visited-path memory (per pods-group/side), breadcrumb gear routes through `_activateItem` (honors `podClickAction`), container items now carry size/mtime/modified/types from posix:size/posix:mtime/dct:modified/rdf:type, shared `_paintGearIcon` for per-item + breadcrumb gears. sol-login: `BroadcastChannel('sol-auth')` cross-window signaling + `external-auth` attribute (green-button cue) — same channel used by mashlib-in-iframe via `pages/solidos-host.html`. sol-menu: `part="content"`/`part="nav"` hooks; default `.sol-menu-content` overflow flipped to hidden; horizontal nav wraps instead of scrolling. sol-include: `:host` + `.si-content` are flex columns (including via `::slotted` in trusted mode) so children get a definite-height parent. sol-weather: silent fail (hide card on fetch error). New newhelp/* tabbed help pages (pod / menu / query / search / weather). |
| [PLAN-sol-include-trusted-lightdom](PLAN-sol-include-trusted-lightdom.md) | 2026-05-24 | `trusted` content now renders to light DOM (via a shadow `<slot>`) so host CSS reaches in. dk Settings smoke test passes; sol-include help page documents the coupling. |
| [PLAN-vocab-migration](PLAN-vocab-migration.md) | 2026-05 | Migrated weather/time/calendar/menu shapes from `schema:additionalProperty` indirection to direct W3C/Schema.org/DCT/QUDT/OWL-Time predicates. |
| URN settings shape pattern (no dedicated plan file) | 2026-05-25 | weather/time/data-kitchen-settings shapes adopted `swc:<X>File rdfs:subClassOf wd:Q1193846` (stable `urn:swc:shape:<file>:` namespace) + `foaf:primaryTopic`-driven targeting. Data files declare `<> a swc:<X>File ; foaf:primaryTopic <#Settings>`. Renames: `preferences.shacl → data-kitchen-settings.shacl`; `data/{weather,time,calendar}.ttl → *-settings.ttl`; `settings.shacl` deleted. See memory `project_swc_shape_urn_pattern`. |
| sol-form save via `updater.update` | 2026-05-25 | Per-edit PATCH is the save (was layering a full-doc PUT on top). `wireSingleSelectAutosave` switched from PUT-of-filtered-subject to `updater.update`, and re-appends the `<select>` solid-ui's Choice handler detaches. Save button only PUTs for brand-new docs. |

## Reading order if picking up cold

1. **`PLAN-sol-settings`** — Phase 1 builds the reusable
   accordion component; Phase 2 adopts it in dk and deletes
   `src/dk-settings.js`.
2. **`PLAN-shape-file-consolidation`** — prereq for the
   accordion view in sol-form. Also defines the `swc:` vocab
   that several later plans cite.
3. **`PLAN-sol-form-redesign`** — depends on consolidation;
   collapses sol-tree-edit into a `view=accordion` mode.
4. **`PLAN-shape2form-or-and`** — independent, can land any
   time; mostly about the static-form CLI and what it can
   express.

## Cross-cutting work not in any plan

- **Multi-issuer popup login mode**, **writable dev server**,
  **Electron wrapper**, **sol-default RDF backing**, **per-component
  edit-in-place pencil** — all live in dk's
  `claude/plans/PLAN-architecture.md` "Next steps" section.
  Pulling them into focused plans here can wait until each is
  actually picked up.
- **Menu-item "Attributes" UX**: see memory
  `project_pending_attributes_ux.md`. Surfaces three options
  for what to do with the empty `ui:attribute` list on leaf
  menu items.

## Convention

- New plans go in this folder with the prefix `PLAN-`.
- Append a `## Status` line at the top when work begins; update
  it as the plan progresses.
- Link cross-plan with the `[[name]]` form (matched by memory
  links) — easier to follow than hand-rolled paths.
- When a plan completes, move its row from "Active" to
  "Completed" with a date and a short outcome note. Leave the
  file in place — historical context is cheap.
