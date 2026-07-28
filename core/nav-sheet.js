// nav-sheet — the coarse-pointer (phone) navigator a menu strip collapses
// into: a full-width trigger button on the bar plus a bottom <sol-sheet>
// mounted on <body> (so it overlays everything and escapes any clipping
// ancestor). Top items are rows; a submenu becomes an accordion group of its
// leaves. Picking a row drives the SAME machinery the bar uses — the host's
// switchTab for a tab, a submenu launcher's .select() for a leaf — so there
// is no parallel render path.
//
// Shared by sol-tabs (today) and sol-menu's strip mode. Every function takes
// the host element first and works against its contract: `_tabs`, `_active`,
// `_launchers`, `_btns`, `switchTab(name)`, plus the nav state it keeps ON
// the host (`_sheet`, `_navTrigger`, `_navItems`, `_groups`, `_openGroup`,
// `_navKey`, `_navLabelOverride`). Class names derive from `host._navPrefix`
// (default "sol-tabs") so each component keeps its own CSS surface. The host
// must have imported web/sol-sheet.js (the surface primitive).

const pfx = (host) => host._navPrefix || 'sol-tabs';

// The phone media — built lazily, kept so a change listener can re-render
// the bar when the pointer type flips (e.g. DevTools device emulation).
export function coarseMql(host) {
  if (host._mqlCoarse === undefined) {
    host._mqlCoarse = (typeof matchMedia === 'function')
      ? matchMedia('(hover: none) and (pointer: coarse)') : null;
  }
  return host._mqlCoarse;
}

export function isCoarsePointer(host) { return !!coarseMql(host)?.matches; }

export function renderNavSheet(host, bar) {
  const p = pfx(host);
  const trig = document.createElement('button');
  trig.type = 'button';
  trig.className = `${p}-navtrigger`;
  trig.setAttribute('aria-haspopup', 'dialog');
  trig.setAttribute('aria-expanded', 'false');
  trig.innerHTML =
    `<span class="${p}-navtrigger-dot" aria-hidden="true"></span>`
    + `<span class="${p}-navtrigger-label"></span>`
    + `<span class="${p}-navtrigger-chev" aria-hidden="true"></span>`;
  trig.addEventListener('click', () => openSheet(host));
  host._navTrigger = trig;
  bar.appendChild(trig);
  buildSheet(host);
  syncNav(host);
}

// (Re)build the bottom sheet from the current tab model, mounted on <body>.
// The surface (scrim, panel, grip, focus trap, Escape, back gesture) is the
// shared <sol-sheet> primitive; this module owns only the LIST it slots in.
export function buildSheet(host) {
  removeSheet(host);
  const p = pfx(host);
  const sheet = document.createElement('sol-sheet');
  sheet.className = `${p}-sheet`;
  sheet.setAttribute('label', 'Go to');
  sheet.addEventListener('sol-close', () => host._navTrigger?.setAttribute('aria-expanded', 'false'));

  const list = document.createElement('div');
  list.className = `${p}-sheet-list`;
  sheet.appendChild(list);

  host._navItems = [];   // { el, meta, key, groupKey } for active-state sync
  host._groups = [];     // { key, head, group } for accordion expand/collapse
  host._openGroup = null;

  // A navigable destination row. `parent` is the list (direct rooms) or a
  // group's inner wrapper (submenu leaves).
  const row = (parent, label, meta, tabId, key, groupKey) => {
    const it = document.createElement('button');
    it.type = 'button';
    it.className = `${p}-sheet-item`;
    if (tabId) it.dataset.tabId = tabId;   // reuses the existing attribute; dk maps a room colour
    it.innerHTML =
      `<span class="${p}-sheet-bar" aria-hidden="true"></span>`
      + `<span class="${p}-sheet-label"></span>`
      + `<span class="${p}-sheet-check" aria-hidden="true"></span>`;
    it.querySelector(`.${p}-sheet-label`).textContent = label;
    it.addEventListener('click', () => { navigateTo(host, meta); closeSheet(host); });
    parent.appendChild(it);
    host._navItems.push({ el: it, meta, key, groupKey });
  };

  // A collapsible group (a submenu): a header row + a hidden wrapper of
  // leaf rows. Returns the inner wrapper to fill. Header toggles the accordion.
  const group = (label, groupKey) => {
    const head = document.createElement('button');
    head.type = 'button';
    head.className = `${p}-sheet-grouphead`;
    head.setAttribute('aria-expanded', 'false');
    head.innerHTML =
      `<span class="${p}-sheet-grouplabel"></span>`
      + `<span class="${p}-sheet-groupchev" aria-hidden="true"></span>`;
    head.querySelector(`.${p}-sheet-grouplabel`).textContent = label;
    head.addEventListener('click', () => toggleGroup(host, groupKey));
    const wrap = document.createElement('div');
    wrap.className = `${p}-sheet-group`;
    const inner = document.createElement('div');
    inner.className = `${p}-sheet-group-inner`;
    wrap.appendChild(inner);
    list.appendChild(head);
    list.appendChild(wrap);
    host._groups.push({ key: groupKey, head, group: wrap });
    return inner;
  };

  for (const tab of host._tabs) {
    if (tab.isSubmenu && Array.isArray(tab.children) && tab.children.length) {
      const gk = `g:${tab.name}`;
      const inner = group(tab.name, gk);
      for (const child of tab.children) {
        // THE ARTIFACT RULE (mirrors the in-pane submenu render): a child
        // whose name repeats the submenu's own is the conversion artifact — skip.
        if (!child?.name || child.name.trim() === tab.name.trim()) continue;
        row(inner, child.name, { kind: 'child', parent: tab.name, child: child.name, link: child.type === 'link' && !!child.href, href: child.href },
            child.id, `c:${tab.name}${child.name}`, gk);
      }
    } else {
      row(list, tab.name, { kind: 'tab', name: tab.name }, tab.id, `t:${tab.name}`, null);
    }
  }
  // Link launchers (.sol-bar-link) → a "Launch" section; chrome controls
  // (search, calendar, ☰, sign-in, …) stay in the slim dock.
  const links = (host._launchers || []).filter(
    (el) => el.classList && el.classList.contains('sol-bar-link'));
  if (links.length) {
    const inner = group('Launch', 'g:Launch');
    links.forEach((el, i) => row(
      inner, (el.getAttribute('aria-label') || el.title || el.textContent || 'Open').trim(),
      { kind: 'launch', el }, null, `l:${i}`, 'g:Launch'));
  }

  document.body.appendChild(sheet);
  host._sheet = sheet;
}

// Accordion: open `key` (collapsing any other), or collapse if already open.
export function toggleGroup(host, key) { setOpenGroup(host, host._openGroup === key ? null : key); }

export function setOpenGroup(host, key) {
  host._openGroup = key;
  for (const g of (host._groups || [])) {
    const on = g.key === key;
    g.group.classList.toggle('expanded', on);
    g.head.classList.toggle('expanded', on);
    g.head.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
}

export function openSheet(host) {
  if (!host._sheet) return;
  syncNav(host);
  // Pre-expand the group holding the current destination, so the sheet opens
  // showing where you are (a leaf's group; a direct room opens all-collapsed).
  const active = (host._navItems || []).find((i) => i.key === host._navKey);
  setOpenGroup(host, active?.groupKey || null);
  // sol-sheet owns focus (trap + restore-to-opener), Escape, the scrim,
  // and the back-gesture contract.
  host._sheet.show();
  host._navTrigger?.setAttribute('aria-expanded', 'true');
}

export function closeSheet(host) { host._sheet?.hide(); }   // aria-expanded resets on sol-close

export function removeSheet(host) {
  if (host._sheet) { host._sheet.remove(); host._sheet = null; }
}

// Reflect the active destination on the trigger (label + room dot) and the
// sheet rows (highlight). `_navKey` is set by navigateTo for a submenu leaf
// (which switchTab alone can't identify); otherwise the active top tab wins.
export function syncNav(host) {
  if (!host._navTrigger) return;
  const p = pfx(host);
  // A host-set override (setNavLabel) names a screen that is NOT one of
  // the rooms (e.g. Settings opened from the ☰ menu) — the trigger shows
  // it and no sheet row highlights until real tab navigation clears it.
  let active = host._navLabelOverride
    ? null
    : (host._navKey ? host._navItems?.find((i) => i.key === host._navKey) : null);
  if (!active && !host._navLabelOverride) {
    active = host._navItems?.find((i) => i.meta.kind === 'tab' && i.meta.name === host._active);
  }
  const label = host._navTrigger.querySelector(`.${p}-navtrigger-label`);
  if (label) {
    label.textContent = host._navLabelOverride
      || (active ? active.el.querySelector(`.${p}-sheet-label`).textContent : (host._active || ''));
  }
  // Carry the active room's id onto the trigger so dk can colour its dot.
  const id = active?.el.dataset.tabId;
  if (id) host._navTrigger.dataset.tabId = id; else delete host._navTrigger.dataset.tabId;
  for (const i of (host._navItems || [])) i.el.classList.toggle('is-active', i === active);
}

// Act on a sheet pick, reusing the bar's own machinery.
export function navigateTo(host, meta) {
  if (meta.kind === 'launch') { meta.el?.click(); return; }
  if (meta.kind === 'tab') { host._navKey = `t:${meta.name}`; host.switchTab(meta.name); return; }
  if (meta.kind === 'child') {
    if (meta.link) {
      // External link leaf — open it (→ the host's dismissible overlay / new
      // tab) and leave the CURRENT room active. A link-only submenu (e.g. Apps)
      // thus never becomes the active tab, so its empty pane is never shown.
      if (meta.href) window.open(meta.href, '_blank');
      return;
    }
    // Remember the leaf (switchTab only knows the parent), surface the pane,
    // then mount the chosen leaf into it.
    host._navKey = `c:${meta.parent}${meta.child}`;
    host.switchTab(meta.parent);
    const dd = host._btns[meta.parent];
    if (dd && typeof dd.select === 'function') {
      dd.select(meta.child);            // the submenu launcher's proven mount path
    } else {
      revealChild(host, meta.parent, meta.child);   // inline-submenu fallback
    }
    syncNav(host);
  }
}

// Fallback leaf reveal when a submenu rendered inline rather than as a bar
// launcher: a nested <sol-tabs> switches to the child; a stacked submenu
// scrolls the child's slot into view.
export function revealChild(host, parentName, childName) {
  const tab = host._tabs.find((t) => t.name === parentName);
  const pane = tab?._pane;
  if (!pane) return;
  const sub = pane.querySelector(':scope sol-tabs');
  if (sub && typeof sub.switchTab === 'function') { sub.switchTab(childName); return; }
  const item = pane.querySelector(`[data-tab-name="${(window.CSS && CSS.escape) ? CSS.escape(childName) : childName}"]`);
  if (item) item.scrollIntoView({ block: 'start' });
}
