# claude/

Claude-authored artifacts for this project.

- `plans/` — design / migration plans. See `plans/INDEX.md` for the
  current map and status.
- `smoke-tests/` — checks for eyeballing / verifying components.
  - `sol-feed-node-check.mjs` — headless (jsdom) smoke check for
    `<sol-feed>`; stubs `fetch` and asserts each view renders. Run with
    `node claude/smoke-tests/sol-feed-node-check.mjs`.
  - `validate-settings-shapes.mjs` — runs `rdf-validate-shacl` against
    each settings TTL + its matching SHACL shape (weather, time,
    data-kitchen-settings, and the form-demo fixture). Reports
    conform/fail per case. Run with
    `node claude/smoke-tests/validate-settings-shapes.mjs`.
  - `dashboard-render-check.mjs`, `sol-calendar-*.mjs`, etc. — various
    headless probes that grew alongside the components.

The live `<sol-feed>` browser demo now lives in `help/sol-feed-help.html`
(the "Live demo" tab) rather than as a standalone smoke-test page.

## Tooling outside `claude/`

Claude-authored build/repair scripts live in the project's `scripts/`
folder per swc convention (alongside `shape2form.mjs`):

- `scripts/regen-shaclc.mjs` — regenerate every `shapes/*.shaclc`
  twin from its canonical `.shacl` source via `shaclc-write`. Run
  after any `.shacl` edit (see memory rule
  `feedback-regen-shaclc-on-shacl-change`). With no args, processes
  every `.shacl` in `shapes/`; with file args, processes just those.
