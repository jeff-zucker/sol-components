# sol-include — trusted content renders to light DOM

## Status

**Completed 2026-05-24.** Verified end-to-end. The implementation
needed a second pass — the original edit appended `.si-content`
to light DOM, but sol-include's shadow root had no `<slot>`, so
the projection didn't happen and the appended div rendered at
0×0. `_initShadow` now injects `<slot></slot>` into the shadow
when trusted; `_clearLightContent` runs at the top of every
`_initShadow` so reloads/state-changes don't accumulate stale
children. Smoke test `dk/claude/smoke-tests/sol-include-trusted.mjs`
walks Home → Settings, asserts:

- `<section class="dk-settings">` is a light-DOM child of
  `<sol-include>` under `.si-content`, not in the shadow root;
- `.dk-settings` host CSS reaches (`max-width: 88rem`,
  `padding: 24px 48px`, h2 styled);
- the inner `<sol-accordion>` is populated with four widget
  panels (`sol-tree-edit`, `sol-form`, `sol-form`, `sol-form`).

All four assertions pass. Help-page sanity (sol-include-help,
sol-form-help) shows no console errors and the docs render. The
help page now also carries a paragraph documenting the
trusted=light-DOM coupling under the `trusted` attribute heading.

## Motivation

`sol-include` uses shadow DOM by design — sensible for *untrusted*
content (DOMPurify-sanitised, isolated from host styles). But for
trusted page snippets (dk's `pages/home.html`, `pages/settings.html`),
shadow DOM creates two problems:

1. **Host CSS doesn't reach in.** `.dk-settings` rules in
   dk-styles.css don't apply to the section inside
   `sol-include.shadowRoot`. The static-settings refactor surfaced
   this concretely: `secPadding: 0px`, `secMaxWidth: none`.
2. **CSS the included content's custom elements expect doesn't
   reach in either.** `<sol-form>` and friends inject their own
   styles via `ensureDocStyle(getRootNode())`, which goes into the
   shadow root — but consumer-side overrides (font-size knobs,
   theme tweaks) don't.

The `trusted` attribute already disables DOMPurify on the fetched
content. It's an opt-in declaration of "I authored this; treat it
as part of my page." Extending it to also mean "render into light
DOM" is a natural alignment — both opt-outs are the consumer's
explicit "I trust this source."

## Behaviour

| Attribute state | Sanitisation | DOM target |
|---|---|---|
| no `trusted` | DOMPurify on fetched HTML | shadow DOM |
| `trusted` | skipped | **light DOM** (under the host `<sol-include>` element) |

Loading and error states still render in shadow (they're internal
sol-include chrome — out-of-band relative to the user's content).
Raw mode (`raw` attribute) still renders in shadow as well.

Reload behaviour: when the source changes (or the element
reconnects), the prior light-DOM content is removed before the
new content is appended. A small `_clearLightContent` helper
iterates direct children for the `.si-content` marker class and
removes them.

## The edit (already in `_showHtml`)

```js
_showHtml(html) {
  this._initShadow();
  const div = document.createElement('div');
  div.className = 'si-content';
  div.innerHTML = html;
  if (this.hasAttribute('trusted')) {
    this._clearLightContent();
    this.appendChild(div);
  } else {
    this.shadowRoot.appendChild(div);
  }
}

_clearLightContent() {
  for (const child of Array.from(this.children)) {
    if (child.classList?.contains('si-content')) child.remove();
  }
}
```

## What's left

All three items from the original "what's left" landed:

1. **Smoke test** ✓ — `dk/claude/smoke-tests/sol-include-trusted.mjs`
   passes against the live CSS server.
2. **Help-page sanity** ✓ — `sol-include-help.html` and
   `sol-form-help.html` both render cleanly with no console
   errors after the slot/light-DOM change.
3. **Documented on the help page** ✓ — paragraph added under
   the `trusted` attribute heading in
   `help/sol-include-help.html`.

Follow-on housekeeping (not blockers, won't be done as part of
this plan):

- **`dk-settings.js`'s shadow-root traversal is now dead code.**
  With `pages/settings.html` in light DOM, `dk-settings.js`'s
  `watch(n.shadowRoot)` branch (~lines 108–111) will never fire
  for the settings include. Leave it; it's cheap and protective.
  When [[PLAN-sol-settings]] phase 2 lands and `dk-settings.js`
  goes away entirely, the question is moot.
- **The `live-edit/csv` externalize fix in `rollup.config.js`.**
  The rebuild for this plan added one line to the
  `stubMissingDynamic` plugin so sol-live-edit's reference to
  the missing `data/live-edit/csv.js` doesn't break the bundle
  build. That dynamic-import path probably wants a real fix
  (either restore the file or trim the reference from
  `sol-live-edit.js`), but it's unrelated to sol-include.

## Risks

- **Two prior consumers exist with `trusted` set who relied on
  shadow encapsulation.** dk's Home + Settings panels are the only
  uses I'm aware of, both deliberately wanting host CSS. If a
  third consumer wanted "trusted (no sanitisation) AND isolated
  (still shadow)," they currently can't express that. Likely fine
  — that pairing is uncommon — but worth flagging if it comes up.
- **Existing `.si-content` class collisions in host CSS.** Host
  pages with their own `.si-content` rule would suddenly affect
  the sol-include content. Vanishingly unlikely (it's a
  swc-internal class name), but if it happens, rename the class
  or scope it via attribute.

## Estimate

**~45 minutes total**: 5 min finishing the edit (already drafted),
20 min smoke-testing dk's Settings tab through the headless
browser, 15 min adding the help-page paragraph, 5 min taking a
verification screenshot.

## Related work

- The dk-settings static page refactor depends on this — without
  it, `.dk-settings` rules don't reach inside the sol-include
  shadow and the panels render unstyled.
- [[PLAN-sol-settings]] — generalises the populated-accordion
  pattern. The Settings page chrome lives in
  `pages/settings.html`, which is exactly the kind of trusted
  snippet this change exists for.
