// menu-panes — the keep-alive pane machinery a menu strip runs on, shared by
// sol-tabs (today) and sol-menu's strip mode: one persistent pane per item,
// switched by visibility so mounted content is never torn down (audio keeps
// playing, scroll / login / in-flight state survive), plus the change
// signature and in-place merge that let a live menu edit update the strip
// without disturbing unchanged panes.
//
// Every function takes the host element first and works against its
// contract: `_tabs` (the wrapped item list), `_active`, `_keepAlive`,
// `_rendered`, `body`, `_footerEl`/`_actionsEl`, `_renderBar()`,
// `switchTab(name, {silent})`, `_wrapRdfItems(items)`.

import { emitTab } from './menu-generate.js';

// Canonical change-signature of a tab DEFINITION, for the merge: the
// generator's emission is round-trip stable (emitTab ∘ extractTab is the
// identity on its own output), so an UNCHANGED tab gets the same signature
// whether it was harvested from the shell's anchors at load or parsed from
// the RDF on a Customize save. The tab's own label is excluded — a pure
// rename keeps its pane — but submenu children (names included) are in, so
// any structural change re-renders. Params are SORTED first: attribute order
// carries no meaning, and the builder's document rewrite is free to reorder
// schema:additionalProperty entries on every save. Items emitTab skips (links,
// unassigned) fall back to a JSON shape of the same normalized fields.
export const sigNorm = (item, top) => ({
  ...item,
  ...(top ? { name: '' } : {}),
  comment: undefined,
  params: [...(item.params || [])].sort((a, b) =>
    a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1)),
  children: (item.children || []).map((c) => sigNorm(c, false)),
});

export const tabSig = (item) => {
  const n = sigNorm(item, true);
  return emitTab(n, () => {})
    || JSON.stringify([n.type, n.tag || '', n.href || '', n.region || '', n.params,
                       n.children.map((c) => [c.name, c.tag || '', c.href || '', c.params])]);
};

/** Build (once) a persistent pane for a tab and render its content into it. */
export function ensurePane(host, tab, className = 'sol-tabs-pane') {
  if (tab._pane) return tab._pane;
  const pane = document.createElement('div');
  pane.className = className;
  if (tab.id) pane.dataset.tabId = tab.id;
  if (tab._paneId) pane.id = tab._paneId;   // a submenu's region= target
  pane.dataset.tabName = tab.name;
  pane.hidden = true;
  host.body.appendChild(pane);
  tab._pane = pane;
  tab.render(pane, host._footerEl, host._actionsEl);
  return pane;
}

/** Render every tab once (keep-alive) then show the first, else just
 *  show the first (lazy default path). */
export function activateInitial(host, className) {
  if (!host._tabs.length) return;
  if (host._keepAlive) {
    host.body.innerHTML = '';   // drop any panes from a prior load (reload)
    for (const t of host._tabs) ensurePane(host, t, className);
  }
  host.switchTab(host._tabs[0].name);
}

/**
 * Merge an updated set of items (parseMenuItems output) into the live strip
 * IN PLACE, without tearing down the element. Existing items are matched by
 * id (falling back to name); a matched item whose DEFINITION is unchanged
 * (same tabSig — only the label may differ) is REUSED so its keep-alive pane
 * survives, while an edited one is re-rendered from its new definition (its
 * stale pane is dropped). New items are added and removed items have their
 * pane dropped. The host's launchers and event listeners are untouched.
 */
export function applyMenuItems(host, items, className) {
  const wrapped = host._wrapRdfItems(items || []);
  if (!host._rendered) { host._tabs = wrapped; return; }
  // Track the active tab by KEY (it survives the merge even when renamed
  // OR rebuilt) so re-asserting it below is recognized as "same tab".
  const key = (t) => t.id || t.name;
  const prevActive = (host._tabs || []).find((t) => t.name === host._active) || null;
  const activeKey = prevActive ? key(prevActive) : null;
  const prev = new Map((host._tabs || []).map((t) => [key(t), t]));
  const next = wrapped.map((w) => {
    const old = prev.get(key(w));
    // Reuse the old descriptor (and its keep-alive pane) ONLY when the
    // tab's DEFINITION is unchanged — then this is a pure rename/reorder.
    // An EDITED definition (plugin swapped, submenu added, children
    // changed) must win: take the fresh render and drop the stale pane so
    // the tab re-mounts showing what was saved.
    if (old && old.sig === w.sig) { old.name = w.name; return old; }
    if (old && old._pane) { old._pane.remove(); old._pane = null; }
    return w;
  });
  const keep = new Set(next.map(key));
  for (const [k, t] of prev) {
    if (!keep.has(k) && t._pane) { t._pane.remove(); t._pane = null; }
  }
  host._tabs = next;
  host._renderBar();
  if (host._keepAlive) for (const t of host._tabs) ensurePane(host, t, className);
  // Re-assert the selection. Same tab as before (even if rebuilt) →
  // SILENT: this is a live refresh, not a user pick, and must not fire
  // a change event.
  const active = (activeKey != null && next.find((t) => key(t) === activeKey)) || host._tabs[0];
  if (active) host.switchTab(active.name, { silent: activeKey != null && key(active) === activeKey });
}
