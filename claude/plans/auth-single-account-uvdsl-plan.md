# Single-account auth: replace Inrupt with uvdsl across the Solid stack

(At GO time copy this into `sol-components/claude/plans/auth-single-account-uvdsl-plan.md`
— the filename here is harness-pinned.)

## Context

Today the stack supports being logged in to several Solid accounts at once:
sol-components' `AuthManager` keeps a Map of Inrupt `Session`s keyed by
side/tag, popup mode + `core/popup-proxy.js` + per-side namespaced storage
exist solely so two Inrupt sessions can coexist, and podz mounts two
`<sol-pod side=…>` panels that can hold different accounts. Jeff's directive
(2026-09-04): remove simultaneous multi-account login everywhere and replace
`@inrupt/solid-client-authn-browser` with **stock** `@uvdsl/solid-oidc-client-browser`
v0.2.3 (the multi-session patch prepared in `FediPod/claude/uvdsl-pr/` is NOT
being used). Scope: sol-components (sol-login, sol-pod, everything), data-kitchen,
sol-app-builder, FediPod, open-media-player, component-interop.

**The one exception:** sol-pod must still work "logged in" to the local dk pod
AND one remote pod at the same time. This costs nothing extra: dk's local
"login" is the synthetic owner session (`dk-owner-session.js` — plain
`window.fetch`, gate token injected by Electron below the fetch layer, no OIDC),
so it coexists with the single uvdsl OIDC session; per-URL routing via
`sessionCoversOrigin()` (`core/auth-core.js`) already picks local vs remote by
origin and is kept.

Prior work this builds on: `FediPod/claude/plans/swap-inrupt-for-uvdsl.md`
(2026-08-26 — FediPod half approved then; sol-components half was blocked only
by multi-session, now moot). Full current-code maps from three exploration
agents are reflected below.

## uvdsl library facts (verified from source)

- `@uvdsl/solid-oidc-client-browser` 0.2.3, ESM, MIT, dep `jose` (bundled in
  dist builds). ONE session per origin.
- Web build: `Session` (EventTarget) — `login(idp, redirect_uri)` =
  **full-page redirect** (auth code + PKCE + RFC 9207 iss check),
  `handleRedirectFromLogin()`, `restore()` (refresh-token grant),
  `logout()`, `authFetch(input, init?)` (pre-bound), `isActive`, `webId`;
  events `sessionStateChange` / `sessionExpirationWarning` / `sessionExpiration`.
  DPoP keys non-extractable in IndexedDB; background refresh + cross-tab sync
  via **SharedWorker** (constructor creates it unconditionally — throws where
  SharedWorker is missing, notably Android System WebView).
- Core build (`/core`): `SessionCore` + `SessionIDB` — same API, no worker;
  with `SessionIDB` it still restores via refresh token (call `restore()`
  yourself). This is the Android/WebView fallback, and it FIXES the currently
  documented gap "redirect-mode sessions do not survive app restarts".
- Temp login state (verifier, csrf, idp) lives in the initiating tab's
  sessionStorage → `handleRedirectFromLogin()` must run in the tab that called
  `login()` (true under full-page redirect).
- No `issuer` getter on the session — sol-login records the chosen issuer
  itself at login time (one localStorage key) for button repaint,
  `sessionCoversOrigin` issuer-matching, and dk's remember-offer.

## Target architecture (sol-components)

**Session shape stays Inrupt-ish; the Map stays; multi-OIDC goes.**

- `core/inrupt-global.js` → replaced by `core/oidc-global.js` (or renamed in
  place): imports the vendored uvdsl module, exports a factory that returns
  the page's ONE session, wrapped in the existing session shape:
  `{ info: { isLoggedIn, webId, issuer, sessionId }, fetch: session.authFetch,
  logout() }` — so `core/auth-core.js` helpers, dk's synthetic owner session
  (`info`-shaped already), and dk's idp-proxy sessions all keep working with
  minimal churn. Where `SharedWorker` exists use the web `Session` (workerUrl
  passed explicitly to the vendored worker file); else `SessionCore` +
  `SessionIDB`.
- `AuthManager.sessions` Map remains as the seatable registry (apps seat
  synthetic sessions: dk owner, dk idp-proxy), but sol-login only ever mints
  ONE OIDC session, seated under tag `'default'`. dk's owner session moves to
  tag `'local'` (one-line change in dk) so the two never collide. All public
  `tag`/`side` threading is removed: `fetchFor(url)`, `isLoggedIn(url)`,
  `getWebId()`, `ensureAuthenticated(url)`. `getSessionFor`/`makeFetchFor`
  keep walking the Map by `sessionCoversOrigin` — that is the local+remote
  routing the exception needs. `getFirstLoggedIn()` survives (Map may hold
  owner + oidc) but loses its "first of N accounts" meaning.
- **Deleted outright:** popup mode (`_popupLogin`, `_onPopupMessage`),
  `core/popup-proxy.js`, `web/popup-auth-callback.html`, `_sideOrigins` +
  `localStorage['solLoginOrigins']`, `_sessionId(tag,origin)`,
  `setSideOrigin`, `solLoginPendingTag`, the
  `localStorage['solidClientAuthn:currentSession']` boot-restore probe, the
  `side`/`mode`/`popup-callback` attributes, Android popup→redirect coercion
  (everything is redirect), side-scoped `sol-auth-needed` routing.
  (Pending decision 1 below: if Jeff picks "keep popup option", the popup
  page is instead rewritten as a thin uvdsl dance + opener `restore()` —
  no proxy, no namespaced storage.)
- **Login flow (recommended):** redirect-only. `login(issuer)` →
  `session.login(issuer, origin+pathname)`. `initialize()` (still
  single-flight) → `handleRedirectFromLogin()`; if not active, `restore()`
  (silent refresh grant — replaces both Tier-1 popup restore and the
  redirect-mode restore machinery). uvdsl worker events → `_updateUI()` +
  `sol-login`/`sol-logout` dispatch.
- **Events:** `sol-login` detail becomes `{ webId, issuer }` (drop `side`);
  `sol-logout` detail dropped. BroadcastChannel `sol-auth` kept for
  cross-window repaint, messages lose `side`.
- `core/auth-fetch.js`: drop `opts.tag`/`authTag`; `sol-auth-needed` detail
  loses `side`. `solFetch`/`getAuthFetch` signatures otherwise unchanged —
  the ~30 consumer call sites (sol-query, sol-include, sol-form,
  sol-plugin-manager, sol-menu-manager, sol-app-builder, from-query,
  sol-solidos, omp) keep working.
- `web/sol-form.js:38,78` — drop `inrupt.getDefaultSession()`; always
  `solFetch` (already the fallback).
- `web/sol-pod.js`: remove `side` / `login-mode` / `login-callback`
  (attribute removals only — no new attributes anywhere, per standing rule);
  `_fetchFor(url)` = `login.fetchFor(url)`. Panels can still show ANY
  registered pod; per-URL routing supplies owner fetch for local, uvdsl fetch
  for the remote account's pods. `web/sol-pod-ops.js` untouched apart from
  signature check; `web/sol-include.js` sessions-iteration survives as-is.
- `node/sol-login.js`: pending decision 2 (default: untouched this round).
- Build: `tools/external-deps.json` swaps to
  `@uvdsl/solid-oidc-client-browser` (cdn: esm.sh); `npm run build` regenerates
  `dist/vendor/@uvdsl-solid-oidc-client-browser.js` (+ vendored RefreshWorker
  file), `web/sol-load.js` MAP block, `dist/importmap-*.json`,
  `dist/sol-components.manifest.json`; `tools/manifest-base.json:99,158`;
  `package.json` peerDeps + jest moduleNameMapper; `dashboard.html:29`.
- Tests: rewrite `tests/__mocks__/` mock for the uvdsl API; rework
  `tests/web/sol-login.test.js` (single-session AuthManager),
  `tests/web/sol-login-element-extras.test.js`; delete
  `tests/web/sol-login-popup.test.js`, `tests/core/popup-proxy.test.js`;
  update `tests/core/auth-fetch.test.js`; `tests/web/sol-load.test.js` passes
  after regen. Real-OIDC e2e against component-interop's `claude/dev-idp`
  local CSS IdP rig (:3005).
- Docs: `help/sol-login-help.html` (drop mode/side/popup rows + two-account
  example; present-tense only, no history), `help/sol-pod-demo.html`,
  `help/newhelp/#pod.html#`, regenerate `docs/api` (`npm run docs`).
- Version: major bump (attribute/event/API removals; published on npm).
  npm publish waits for its own go.

## data-kitchen

- `src/dk-owner-session.js` — seat owner under `'local'` instead of
  `'default'`; shape unchanged; still kitchen-gated by
  `sol-default[solid-kitchen]`.
- `src/dk-auth-router.js` — remove `#auth=` tag parsing +
  `dk-active-auth-change`; `dkFetch` stays a thin `solFetch`.
- `src/dk-issuers-feed.js` — remember-hook: patched `login(issuerUrl)` (no
  tag); seat the main-proxy session as THE remote session (Map key
  `'default'`); keep `_updateUI`/`_integrateWithRdflib` calls.
- `src/dk-idp-proxy-session.js` — shape already matches the wrapper; single
  remote at a time (main's `_grantSessions` Map stays as a CREDENTIAL vault
  per issuer — remembering several IdPs is fine; only one is live at once).
- `src/dk-wormhole-guard.js` — inrupt key cleanup can stay (legacy sweep);
  no uvdsl equivalent needed (state in IndexedDB, error bounces surface).
- `src/dk-tabs-shell.js:477–481` canWrite unchanged semantically.
- **podz** (`plugins/podz/`): keep BOTH panels and cross-pod drag-copy; strip
  `side` everywhere — `dk-podz.html` (drop `side=`/`login-mode=` attrs),
  `podz.js` (left/right login wiring collapses to one shared login state;
  drop per-side popup comments; `handleDrop` copy path already routes fetch
  per-URL via `fetchFnForUrl`), `podz-pod.js` (drop side params), `podz-auth.js`,
  `podz-state.js` (selection blob keeps left/right POD URLS — those are
  locations, not accounts).
- `plugins/solidos/sol-solidos-host.html` + legacy `solidos-host.html` —
  importmap entries for the inrupt specifier: mashlib still bundles its own
  inrupt; keep the localStorage-hiding shim (protects mashlib from shell
  keys); update only what references sol-components' vendored path/specifier;
  legacy host's `handleIncomingRedirect` drives MASHLIB's session — unchanged.
- Variants (`variants/{web,mobile,netlify}/ui-data/data-kitchen-main-menu.ttl`)
  — chrome-login entries lose the `mode=popup` attribute pair; issuer strings
  stay. `variants/netlify/index.html` checked.
- `plugins/sign-in.ttl` + catalog `:Sign-in` entries — drop `mode=popup` pair.
- `electron-config/main.cjs:574` — popup allowance for `/login/i` frameName:
  under redirect-only nothing names such a window; leave the handler (external
  IdP pages may still open popups) but verify login round-trip in Electron
  (shell navigates to IdP and back; gate re-entry via injected header).
- `esbuild.config.mjs:26` externals: swap specifier.
- **Two-copies rule:** mirror every touched `plugins/`, `ui-data/`, page file
  into `~/solid/dk-pod/dk/…` (podz, solidos hosts, ia-player assets,
  sign-in.ttl, settings/menus).
- `npm run build` (dist bundle) + restart; version bump.
- skills.md/docs: fix stale `window.solidClientAuthn` note (93–96) while
  updating docs for this change.
- Tests: `npm test` (gate/router/proxy/podz-drop-guards etc.); update
  `test/unit/podz-drop-guards.test.mjs` side stubs; smoke probes
  (`diag-auth-*`, `diag-solfetch`, `diag-switch-issuer`,
  `verify-podz-*`, `verify-netlify-variant`, `cdp-verify-android-login-flow`)
  updated to the new contract; run the isolated-instance ones.

## open-media-player

- `src/ia-player/ia3.js` — single-login already; fix couplings: comments and
  `markAuthInflight` naming inrupt; `openPodLoginPicker()` private-API pokes
  (`.auth-btn`, `_handleClick`, `login(issuers[0])`) re-verified against the
  rewritten sol-login; BOOT_AUTH_PARAMS snapshot still valid (uvdsl also
  strips ?code/state on handleRedirect).
- `src/ia-player/ia-rdf.js` — rdflib fetcher integration points re-verified.
- `assets/ia-player-shell.html` — sign-in block survives; drop nothing but
  stale references (hardcoded issuers stay).
- `assets/ia-login-help.html` — rewrite the stale "page must provide
  @inrupt/… as a global" row + flow copy (present tense, no history).
- Delete `demo/inrupt-global.js`; fix `index.html:26–32`.
- `npm run build` → new `dist/ia-player.esm.js` / `omp-images.esm.js`;
  re-seed dk pod copies; version bump; npm republish flagged at zclose.

## FediPod

Execute the already-designed swap (`claude/plans/swap-inrupt-for-uvdsl.md`)
with the two corrections found today:
- Cover BOTH pages: `web/front/run.html` AND `web/front/admin.html` (added
  2026-08-31, after that plan).
- `lib/front-core.mjs` route now at lines 309–311 (drifted).
Steps: `scripts/pin-solid-oidc.mjs` (sha512-pinned tarball → vendored
`web/front/solid-oidc-client.js`, CORE build — one-shot pages need no worker),
rewrite both pages to `SessionCore` (`login`/`handleRedirectFromLogin`/
`authFetch`/`isActive`/`webId`, absolute URLs for DPoP), path swaps in
`netlify/functions/front.mjs`, `packages/fedipod-server/src/handler.ts`
(+ pass `adminPage` — pre-existing gap: `/admin` unclaimed/unserved in the
CSS-component deployment; fix claims + handler), `claims.ts` FRONT_PATHS,
delete `web/front/solid-client-authn.bundle.js`, update
`front-hard-test.mjs` + `server.test.mjs` path assertions, CHANGES.md.
`claude/uvdsl-pr/` (the multi-session patch) is dead per Jeff — leave the
files, mark the plan doc superseded. Deploy/restart of fedipod.net + units:
separate explicit go.

## sol-app-builder

- `catalog.ttl` `<#Sign-in>`: drop the `mode = "popup"` attribute pair
  (1159–1160). `if-logged-in` entries unaffected. No code changes (sc via
  symlink).

## component-interop

- `examples/sol-components.manifest.json:137,196` — import-map entries swap to
  the uvdsl specifier/vendor path (hand-copied snapshot: refresh with `cp`
  from sc `dist/` after sc's build).
- Retire/fix stale `claude/smoke-tests/verify-solpos.mjs:112–114` and
  `claude/orientation.md:168–170`.

## Order of work (one reviewed change per pause, per standing rule)

1. sc core swap (adapter + vendor build + AuthManager + auth-core/auth-fetch).
2. sc sol-login rewrite + deletions (popup files) + sol-pod/sol-form/etc.
3. sc tests + docs + regenerated dist; full sc suite green.
4. dk adaptation (owner tag, router, issuers-feed, podz, variants, mirrors)
   + dk suite + rebuild + smoke probes.
5. omp + rebuild + reseed.
6. FediPod swap + suites.
7. app-builder + ci touch-ups.
8. Version bumps; commits local-only; pushes/publishes/deploys each wait for
   their own go.

## Verification

- Unit: sc jest (full), dk `npm test`, FediPod `agent-smoke` +
  `front-hard-test` + `packages/fedipod-server npm test`, omp `npm test`, ci
  `npm test`.
- Real OIDC round trip headless: ci `claude/dev-idp` CSS IdP (:3005) —
  login → authFetch of a private resource → restore() after reload → logout.
- dk isolated instance (throwaway pod root, spare ports, CDP 9223): local
  owner browsing + interactive remote login to the dev IdP; podz both panels:
  local pod left, remote pod right, drag-copy across; SolidOS pane unaffected.
- Android: SessionCore fallback path exercised via UA/WebView emulation
  (no SharedWorker) + restore-after-reload.
- Live logins with Jeff's real accounts: his to run; report exactly what to
  click.

## Decisions (settled by Jeff, 2026-09-04 — "1 and 1 go auto")

1. **Login flow: redirect-only.** All popup machinery is deleted
   (popup mode, popup-proxy.js, popup-auth-callback.html, mode/popup-callback
   attributes, Electron popup naming). Every interactive login is the
   full-page uvdsl redirect.
2. **node/sol-login.js: untouched this round.** The optional
   `@inrupt/solid-client-authn-node` peer dep remains on the Node side.

GO given for the full plan in auto mode. Commits local-only; NO push, NO npm
publish, NO deploy — each of those waits for its own explicit go.
