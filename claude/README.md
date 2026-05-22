# claude/

Claude-authored artifacts for this project.

- `smoke-tests/` — checks for eyeballing / verifying components.
  - `sol-feed-node-check.mjs` — headless (jsdom) smoke check for
    `<sol-feed>`; stubs `fetch` and asserts each view renders. Run with
    `node claude/smoke-tests/sol-feed-node-check.mjs`.

The live `<sol-feed>` browser demo now lives in `help/sol-feed-help.html`
(the "Live demo" tab) rather than as a standalone smoke-test page.
