/**
 * <sol-menu-manager> — visual editor for a ui:Menu document: build or edit a
 * menu TREE (names of items and submenus; what an item DOES is assigned by
 * dragging a plugin from <sol-plugin-manager> onto it).
 *
 *   <sol-menu-manager source="./data/tabs.ttl#Tabs"></sol-menu-manager>
 *
 * Attributes:
 *   source  — Turtle document + #fragment of the ui:Menu to edit (required).
 *   catalog — Turtle document + #fragment of the plugin catalog (a ui:Menu
 *             of ui:Component/ui:Link entries). When given, chips resolve a
 *             plugin's DISPLAY name from the catalog (matched by what the
 *             item mounts: tag + source attribute, or href) — e.g. "Movies
 *             (Internet Archive)", never "ia-player".
 *   heading — replaces the built-in header title ("Menu: <label>") with the
 *             given text.
 *   accordion — group name; the header becomes a click-to-open toggle, and
 *             opening one manager closes the other members of its group
 *             (each header stays visible). Pairs with `open`:
 *   open    — the manager's body (rows + add input) is shown. Without
 *             `accordion` the body is always shown and `open` is ignored.
 *
 * Editing model:
 *   - every row: ▲▼ position buttons (move among siblings; ends disabled), an
 *     editable name, and
 *     a chip per plugin the item holds (friendly names only — element tags
 *     and URLs are never shown). A multi-plugin item lists ALL its plugins
 *     as chips on the row itself; chips are draggable, so a plugin can be
 *     dragged off an item — and chips are drop targets, so dropping a chip
 *     on another's left/right half REORDERS the plugins within the item.
 *     "Unassigned" items show a drop hint. When a <sol-plugin-manager>
 *     pairs with this box (it sets `editPlugin`), a reference-style chip
 *     also carries ✎ — the plugin's populated entry editor.
 *   - ＋ item appends; ✕ removes from the menu (the item's RDF stays in
 *     the document as "pantry" — recoverable)
 *   - a card dragged from <sol-plugin-manager> DROPPED ON a row assigns
 *     that row's component (its module url + schema:additionalProperty set); dropped between
 *     rows it inserts a new, fully-assigned item there
 *   - a SECOND plugin dropped on an assigned menu item turns it into a
 *     submenu holding both (one plugin = the item opens it directly;
 *     several = the item shows them all); dropping on a submenu row adds
 *     to it. The flat bar variant keeps replace-on-drop.
 *   - every change AUTO-SAVES (debounced ~0.8s after the last edit — no
 *     Save button): the WHOLE Turtle document is rewritten via
 *     core/menu-serialize (pantry subjects preserved) and PUT with solFetch
 *
 * Rows are NOT draggable: position is the ▲▼ buttons, full stop (no
 * drag-to-reorder, no drag-to-another-menu). Rows remain drop TARGETS for
 * plugin cards and for chips dragged off a submenu. Phone (coarse pointer —
 * drag & drop is unreachable) additionally gives submenu chips a trailing ✕.
 * Adding is
 * tap-driven from <sol-plugin-manager> ("Add to…" sheet) via the public API:
 *   addPlugin(payload, {submenuId})  — place a card payload here / in a submenu
 *   placeTargets                     — {label, flat, submenus:[{id,name}]}
 * Both drive the same item factory + auto-save path a drop takes.
 *
 * Events: `sol-menu-built` (detail {source}) after a successful save.
 * Reads/writes the existing ui:Menu vocabulary only — no new RDF terms.
 */

import { define } from '../core/define.js';
import { adopt, sheetFrom } from '../core/adopt.js';
import { CSS } from './styles/sol-builders-css.js';
import { rdf } from '../core/rdf.js';
import { loadRdfStore } from '../core/rdf-utils.js';
import { parseMenuItems, loadReferencedDocs, deriveTagFromModule, commandKeyFromUrl, REGION_KINDS } from '../core/menu-rdf.js';
import { updateMenuInStore, serializeMenuDocument } from '../core/menu-serialize.js';
import { solFetch } from '../core/auth-fetch.js';

// Catalog/menu docs are editable — read them past the renderer's HTTP cache
// (no-store) so an edit (or external sync) isn't masked by a stale copy.
const freshFetch = (url, opts) => solFetch(url, { ...(opts || {}), cache: 'no-store' });

const SHEET = sheetFrom(CSS);
const PLUGIN_MIME = 'application/x-sol-plugin';

// The phone media (same query sol-tabs gates its navigator on). Tap
// affordances — the ▲▼ reorder buttons and the chip ✕ — render only on a
// coarse pointer, so the desktop DOM stays byte-identical.
const COARSE_MQL = (typeof matchMedia === 'function')
  ? matchMedia('(hover: none) and (pointer: coarse)') : null;
const isCoarse = () => !!(COARSE_MQL && COARSE_MQL.matches);

class SolMenuManager extends HTMLElement {
  // Bar variant (sol-button-bar-manager) flips this: depth-1, no submenus.
  static get flat() { return false; }
  static get title() { return 'Menu'; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    adopt(this.shadowRoot, { sheet: SHEET, css: CSS });
    this._items = [];        // the edited tree (parseMenuItems shape)
    // orientation and view start NULL and are set only from ui:orientation /
    // ui:view triples in the loaded doc — a save must never inject either one
    // the doc didn't declare (a flat menu that gains ui:Horizontal would
    // reclassify as a button bar in sol-plugin-manager's slot discovery).
    this._meta = { label: null, orientation: null, view: null, region: null, regionRef: null };
    this._dirty = false;
  }

  connectedCallback() {
    // Another manager saved this document (e.g. the same menu edited on a
    // different subtab) — re-load so this instance never auto-saves a stale
    // tree over it. Skipped while THIS instance has unsaved edits (its own
    // pending save is the newer truth).
    if (!this._onMenuBuilt) {
      this._onMenuBuilt = (e) => {
        if (e.target === this || this._dirty || !this.source) return;
        const src = (e.detail && e.detail.source) || '';
        try {
          const doc = new URL(src.split('#')[0], document.baseURI).href;
          if (doc === this._docUrl()) { this._load(); return; }
          // A save of the catalog this manager labels from (entry edits in
          // the pantry's ✎ editor) — chips carry entry labels/icons, reload.
          const cat = this.getAttribute('catalog');
          if (cat && doc === new URL(cat.split('#')[0], document.baseURI).href) this._load();
        } catch { /* unparseable source — not ours */ }
      };
    }
    document.addEventListener('sol-menu-built', this._onMenuBuilt);
    // Accordion peers: when another member of this group opens, close.
    if (!this._onAccordionOpen) {
      this._onAccordionOpen = (e) => {
        const group = this.getAttribute('accordion');
        if (!group || e.target === this) return;
        if (e.detail && e.detail.group === group) {
          this.removeAttribute('open');
          this._headEl?.setAttribute('aria-expanded', 'false');
        }
      };
    }
    document.addEventListener('sol-accordion-open', this._onAccordionOpen);
    // The app's shell sync (dk-tabs-sync) reports whether the companion HTML
    // regeneration landed for our document. Our own "saved ✓" covers only the
    // RDF PUT — upgrade it when the shell write succeeded too, downgrade to a
    // visible error when it failed. (No sync listener in the app → the plain
    // "saved ✓" simply stands.)
    if (!this._onShellSynced) {
      this._onShellSynced = (e) => {
        const src = (e.detail && e.detail.source) || '';
        try {
          if (new URL(src.split('#')[0], document.baseURI).href !== this._docUrl()) return;
        } catch { return; }
        if (e.detail.ok) this._note('saved ✓ (menu + shell)', 'saved');
        else this._note('saved, but the shell update FAILED — reload may show stale tabs', 'error');
      };
    }
    document.addEventListener('sol-shell-synced', this._onShellSynced);
    // Pointer type flipped (e.g. DevTools device emulation) — re-render so
    // the tap affordances appear/disappear with the media query.
    if (!this._onPointerFlip) this._onPointerFlip = () => this._render();
    COARSE_MQL?.addEventListener?.('change', this._onPointerFlip);
    if (this._built) return;
    this._built = true;
    this._root = document.createElement('div');
    this._root.className = 'builder';
    this.shadowRoot.appendChild(this._root);
    this._load();
  }

  disconnectedCallback() {
    if (this._onMenuBuilt) document.removeEventListener('sol-menu-built', this._onMenuBuilt);
    if (this._onAccordionOpen) document.removeEventListener('sol-accordion-open', this._onAccordionOpen);
    if (this._onShellSynced) document.removeEventListener('sol-shell-synced', this._onShellSynced);
    if (this._onPointerFlip) COARSE_MQL?.removeEventListener?.('change', this._onPointerFlip);
  }

  // ---- tap-to-add (phone) public surface ----------------------------------
  // <sol-plugin-manager>'s "Add to…" sheet drives these instead of drag/drop.

  // Place a plugin payload (the drag-payload shape the catalog cards carry:
  // {label, tag|href, params, icon, manifest, region}) into this menu — at
  // the top level, or inside the submenu whose fragment id is `submenuId`.
  // Same item factory + normalize + auto-save path a drop takes.
  addPlugin(payload, { submenuId = null } = {}) {
    if (!payload || (!payload.tag && !payload.href)) return;
    let siblings = this._items;
    if (submenuId && !this.constructor.flat) {
      const sub = this._items.find((it) => it.type === 'submenu' && it.id === submenuId);
      if (sub) {
        if (!sub.children) sub.children = [];
        siblings = sub.children;
      }
    }
    siblings.push(this._itemFromPlugin(payload));
    this._touch();
  }

  // What an "Add to…" picker needs to offer this manager as a destination:
  // its display label and its submenus (menus only — the flat bar has none).
  // Only saved submenus (with a minted fragment id) are addressable.
  get placeTargets() {
    return {
      label: this.getAttribute('heading')
        || `${this.constructor.title}: ${this._meta.label || ''}`,
      flat: this.constructor.flat,
      submenus: this.constructor.flat ? [] : this._items
        .filter((it) => it.type === 'submenu' && it.id)
        .map(({ id, name }) => ({ id, name })),
    };
  }

  get source() { return this.getAttribute('source') || ''; }

  _docUrl() { return new URL(this.source.split('#')[0], document.baseURI).href; }
  _menuIri() {
    const frag = (this.source.split('#')[1] || '').trim();
    return frag ? `${this._docUrl()}#${frag}` : null;
  }

  // The catalog (when declared) names chips: entry label looked up by what
  // an item mounts — links by href; components by tag, disambiguated by the
  // `source` attribute when several entries share a tag.
  async _loadCatalog() {
    const src = this.getAttribute('catalog');
    if (!src || this._catalog) return;
    try {
      const docUrl = new URL(src.split('#')[0], document.baseURI).href;
      const store = await loadRdfStore(docUrl, freshFetch);
      await loadReferencedDocs(store, docUrl, freshFetch);
      const UI = 'http://www.w3.org/ns/ui#';
      const byHref = new Map();
      const byTag = new Map();
      const byManifest = new Map();   // dct:source (chip identity) → label
      for (const st of store.statementsMatching(null, rdf.sym(UI + 'label'), null)) {
        const subj = st.subject;
        if (!subj.value || !subj.value.startsWith(docUrl + '#')) continue;
        const label = st.object.value;
        // ONE payload predicate — schema:url — read by shape: a tag-shaped
        // module filename names a component; anything else is a link URL.
        const payload = (store.any(subj, rdf.sym('http://schema.org/url')) || {}).value;
        const tag = deriveTagFromModule(payload) || commandKeyFromUrl(payload);
        const href = tag ? null : payload;
        const manifest = (store.any(subj, rdf.sym('http://purl.org/dc/terms/source')) || {}).value;
        if (manifest) byManifest.set(manifest, label);
        if (href) byHref.set(href, label);
        if (tag) {
          let source = null;
          for (const b of store.each(subj, rdf.sym(SCHEMA + 'additionalProperty'), null)) {
            const k = (store.any(b, rdf.sym('http://schema.org/name')) || {}).value;
            if (k === 'source') source = (store.any(b, rdf.sym('http://schema.org/value')) || {}).value || null;
          }
          if (!byTag.has(tag)) byTag.set(tag, []);
          byTag.get(tag).push({ source, label });
        }
      }
      this._catalog = { byHref, byTag, byManifest };
      this._render();
    } catch { /* no catalog — chips fall back to stored / friendly names */ }
  }

  // The catalog display name for what an item/child mounts, or null.
  _catalogName(it) {
    if (!this._catalog) return null;
    // Chip identity first: the entry whose dct:source matches the item's.
    if (it.manifest) {
      const byId = this._catalog.byManifest.get(it.manifest);
      if (byId) return byId;
    }
    if (it.href) return this._catalog.byHref.get(it.href) || null;
    if (!it.tag) return null;
    const candidates = this._catalog.byTag.get(it.tag) || [];
    if (candidates.length === 1) return candidates[0].label;
    const source = (it.params || []).find(([k]) => k === 'source')?.[1] ?? null;
    return candidates.find((c) => c.source && c.source === source)?.label || null;
  }

  async _load() {
    if (!this.source || !this._menuIri()) {
      this._root.innerHTML = '<div class="hint">Set source="menu.ttl#MenuName" to edit a menu.</div>';
      return;
    }
    this._loadCatalog();
    try {
      const store = await loadRdfStore(this._docUrl(), freshFetch);
      await loadReferencedDocs(store, this._docUrl(), freshFetch);
      const menuNode = rdf.sym(this._menuIri());
      this._items = parseMenuItems(store, menuNode);
      const label = store.any(menuNode, rdf.sym('http://www.w3.org/ns/ui#label'));
      this._meta.label = label ? label.value : (this.source.split('#')[1] || 'menu');
      const orient = store.any(menuNode, rdf.sym('http://www.w3.org/ns/ui#orientation'));
      if (orient) this._meta.orientation = orient.value.split('#').pop().toLowerCase();
      const view = store.any(menuNode, rdf.sym('http://www.w3.org/ns/ui#view'));
      if (view) this._meta.view = view.value.split('#').pop();
      // A ui:region KIND (ui:Modal, …) round-trips as a keyword; a TARGET region
      // NODE (e.g. shell:MenuPane) round-trips as a node REFERENCE, so its IRI is
      // preserved verbatim rather than flattened to a token — see emitMenu.
      const region = store.any(menuNode, rdf.sym('http://www.w3.org/ns/ui#region'));
      if (region) {
        const frag = (region.value.split('#').pop() || '').toLowerCase();
        if (region.termType === 'NamedNode' && !REGION_KINDS.has(frag)) {
          this._meta.regionRef = region.value;
          this._meta.region = null;
        } else {
          this._meta.region = frag;
          this._meta.regionRef = null;
        }
      }
    } catch (e) {
      // A 404 just means "new document" — start empty.
      this._items = [];
      this._meta.label = this.source.split('#')[1] || 'menu';
    }
    this._render();
  }

  // ---- rendering ---------------------------------------------------------

  _render() {
    this._root.replaceChildren(this._head(), this._tree(this._items, this._items), this._adders(this._items));
  }

  _head() {
    const head = document.createElement('div');
    head.className = 'builder-head';
    const title = document.createElement('span');
    title.className = 'builder-title';
    title.textContent = this.getAttribute('heading')
      || `${this.constructor.title}: ${this._meta.label || ''}`;
    this._status = document.createElement('span');
    this._status.className = 'builder-status';
    // Accordion: the whole header is the click-to-open toggle. Opening
    // announces the group so the other members close ("exactly one open");
    // clicking the open member is a no-op, so its body never disappears
    // without a replacement.
    const group = this.getAttribute('accordion');
    if (group) {
      const marker = document.createElement('span');
      marker.className = 'builder-disclosure';
      head.prepend(marker);
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.setAttribute('aria-expanded', String(this.hasAttribute('open')));
      const open = () => {
        if (this.hasAttribute('open')) return;
        this.setAttribute('open', '');
        head.setAttribute('aria-expanded', 'true');
        this.dispatchEvent(new CustomEvent('sol-accordion-open', {
          bubbles: true, composed: true, detail: { group },
        }));
      };
      head.addEventListener('click', open);
      head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    }
    this._headEl = head;
    head.append(title, this._status);
    return head;
  }

  _tree(items, siblings) {
    const ul = document.createElement('ul');
    ul.className = 'tree';
    for (const item of items) ul.appendChild(this._row(item, siblings));
    // Dropping a palette card on the list's empty space appends a new item.
    ul.addEventListener('dragover', (e) => {
      if (e.target === ul && this._dragPayload(e)) { e.preventDefault(); }
    });
    ul.addEventListener('drop', (e) => {
      if (e.target !== ul) return;
      const plugin = this._dragPayload(e, true);
      if (plugin) { e.preventDefault(); siblings.push(this._itemFromPlugin(plugin)); this._touch(); }
    });
    return ul;
  }

  _row(item, siblings) {
    const li = document.createElement('li');
    li.className = 'item';
    const row = document.createElement('div');
    row.className = 'row';
    // A row is NOT draggable: position within this list is the ▲▼ buttons, and
    // there is no drag-to-another-menu. It stays a drop TARGET, though — a
    // plugin card from <sol-plugin-manager> dropped on it assigns/adds
    // (see _wireRowDnd). (Reordering plugins WITHIN a submenu is a separate
    // affordance — dragging chips — and is untouched.)

    // Position controls: ▲▼ move this row among its siblings, replacing the
    // former drag grip. Ends are disabled. _touch re-renders, so the disabled
    // state refreshes after every move.
    const idx = siblings.indexOf(item);
    const moveBtn = (delta, arrow, verb, atEnd) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-btn move';
      btn.textContent = arrow;
      btn.disabled = atEnd;
      btn.title = `Move ${verb}`;
      btn.setAttribute('aria-label', `Move ${item.name || 'item'} ${verb}`);
      btn.addEventListener('click', () => {
        const at = siblings.indexOf(item);
        const to = at + delta;
        if (to < 0 || to >= siblings.length) return;
        siblings.splice(at, 1);
        siblings.splice(to, 0, item);
        this._touch();
      });
      return btn;
    };
    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.append(moveBtn(-1, '▲', 'up', idx === 0),
               moveBtn(1, '▼', 'down', idx === siblings.length - 1));

    const label = document.createElement('input');
    label.className = 'label';
    label.value = item.name || '';
    label.placeholder = 'item name';
    label.setAttribute('aria-label', 'Item name');
    label.addEventListener('input', () => { item.name = label.value; this._markDirty(); });

    // Chips speak to the app USER: a plugin's friendly name (loader-manifest
    // meta label, else the plugin's own name) — never element tags or URLs.
    // A multi-plugin item lists EVERY plugin as a chip ON ITS OWN ROW (no
    // nested rows); each chip is draggable, so a plugin can be dragged off
    // the item (or onto another). A link row's NAME already is the plugin's
    // name, so a direct link gets no chip; "unassigned" keeps its drop hint.
    const metaLabel = (tag) => (window.ComponentInterop?.manifest?.meta || {})[tag]?.label;
    // The DISPLAY name: the catalog's label for what it mounts (e.g. "Movies
    // (Internet Archive)") — never the component's name — falling back to
    // the name it was dragged in under, then the loader-manifest label. A
    // chip that would merely repeat its own item's name is an artifact and
    // is not shown.
    const chipText = (it) => {
      const text = this._catalogName(it) || it.name || (it.tag && metaLabel(it.tag)) || '';
      return text.trim() === (item.name || '').trim() ? '' : text;
    };
    // ✎ on a chip: hand the chip's catalog entry to the paired
    // <sol-plugin-manager> (it sets `editPlugin` on discovery/pairing) —
    // same populated shape-form its own cards open. Reference-style items
    // only: the entry IS the config.
    const chipEdit = (chip, it, text) => {
      if (typeof this.editPlugin !== 'function' || !it.entry) return;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'chip-edit';
      edit.textContent = '✎';
      edit.title = `Edit “${text}”`;
      edit.setAttribute('aria-label', edit.title);
      edit.draggable = false;
      edit.addEventListener('mousedown', (e) => e.stopPropagation());
      edit.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
      edit.addEventListener('click', (e) => { e.stopPropagation(); this.editPlugin(it); });
      chip.appendChild(edit);
    };
    const chips = [];
    if (item.type === 'submenu') {
      if (!item.children) item.children = [];
      for (const child of item.children) {
        const text = chipText(child);
        if (!text) continue;
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = text;
        chipEdit(chip, child, text);
        chip.draggable = true;
        chip.addEventListener('dragstart', (e) => {
          this._dragItem = { item: child, siblings: item.children };
          this._setDragData(e, child, item.id ? `${this._docUrl()}#${item.id}` : this._menuIri());
          e.stopPropagation();
        });
        chip.addEventListener('dragend', (e) => this._endItemDrag(e));
        // A chip is also a DROP target for another dragged chip: dropping on
        // its left/right half places the dragged plugin before/after it in
        // this submenu — reordering within the item (or moving in from
        // another row, at an exact position). Palette cards are not handled
        // here — they keep bubbling to the row (assign / add-to-submenu).
        chip.addEventListener('dragover', (e) => {
          const drag = this._dragItem;
          if (!drag || drag.item === child) return;
          e.preventDefault();
          e.stopPropagation();
          const r = chip.getBoundingClientRect();
          const before = e.clientX < r.left + r.width / 2;
          chip.classList.toggle('drop-before', before);
          chip.classList.toggle('drop-after', !before);
        });
        chip.addEventListener('dragleave', () => chip.classList.remove('drop-before', 'drop-after'));
        chip.addEventListener('drop', (e) => {
          const drag = this._dragItem;
          if (!drag || drag.item === child) return;
          e.preventDefault();
          e.stopPropagation();
          const r = chip.getBoundingClientRect();
          const before = e.clientX < r.left + r.width / 2;
          chip.classList.remove('drop-before', 'drop-after');
          const { item: moved, siblings: from } = drag;
          from.splice(from.indexOf(moved), 1);
          const at = item.children.indexOf(child) + (before ? 0 : 1);
          item.children.splice(at, 0, moved);
          this._dragItem = null;   // consumed internally — not a move-out
          this._touch();
        });
        // Phone: chip drag-off is unreachable, so the chip carries its own ✕
        // (remove this plugin from the item; _normalize collapses a submenu
        // reduced to one plugin back into a direct item).
        if (isCoarse()) {
          const x = document.createElement('button');
          x.type = 'button';
          x.className = 'chip-del';
          x.textContent = '✕';
          x.setAttribute('aria-label', `Remove ${text} from ${item.name || 'this item'}`);
          x.addEventListener('click', (e) => {
            e.stopPropagation();
            item.children.splice(item.children.indexOf(child), 1);
            this._touch();
          });
          chip.appendChild(x);
        }
        chips.push(chip);
      }
      if (!chips.length) {
        const hint = document.createElement('span');
        hint.className = 'chip empty';
        hint.textContent = 'drag plugins here';
        chips.push(hint);
      }
    } else if (item.type === 'link') {
      // A link shows its plugin chip too (catalog label, else its own name) —
      // same as a component, so a dropped link reads the same in the editor.
      const friendly = this._catalogName(item) || item.name || '';
      if (friendly) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = friendly;
        chipEdit(chip, item, friendly);
        chips.push(chip);
      }
    } else if (item.tag) {
      // direct items always show their plugin chip (bar buttons included),
      // even when it matches the row's name — the artifact suppression only
      // applies to submenu children above
      const friendly = this._catalogName(item) || metaLabel(item.tag) || '';
      if (friendly) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = friendly;
        chipEdit(chip, item, friendly);
        chips.push(chip);
      }
    } else {
      const chip = document.createElement('span');
      chip.className = 'chip empty';
      chip.textContent = 'unassigned — drop a plugin here';
      chips.push(chip);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-btn danger';
    del.textContent = '✕';
    del.title = 'Remove from this menu (you can drag it back in later)';
    del.setAttribute('aria-label', `Remove ${item.name || 'item'}`);
    del.addEventListener('click', () => {
      siblings.splice(siblings.indexOf(item), 1);
      this._touch();
    });

    // Columns: [▲▼ position] [name field] [plugins — wrapping in their own
    // column, a second row of chips starts under the first chip] [✕ right].
    const chipCol = document.createElement('span');
    chipCol.className = 'chips';
    chipCol.append(...chips);
    row.append(pos, label, chipCol, del);
    li.appendChild(row);

    this._wireRowDnd(row, item, siblings);
    return li;
  }

  // The add row: an input that is BOTH a drop target (drop a plugin card →
  // it joins the menu as a new item) and, for menus, a submenu maker (type
  // a name, Enter → an empty submenu ready for plugins). The flat bar takes
  // drops only.
  _adders(siblings) {
    const div = document.createElement('div');
    div.className = 'adders';
    const input = document.createElement('input');
    input.className = 'add-input';
    input.type = 'text';
    // Coarse pointers have no drag-and-drop — adding goes through the
    // tap-to-add sheet on a catalog card, so the hint says that instead.
    const coarse = typeof matchMedia === 'function'
      && matchMedia('(hover: none) and (pointer: coarse)').matches;
    input.placeholder = this.constructor.flat
      ? (coarse ? 'Tap a plugin below to add it here' : 'Drop a plugin here')
      : (coarse ? 'Tap a plugin below to add it — or type a submenu name'
                : 'Drop a plugin here or type the name of a submenu');
    input.setAttribute('aria-label', input.placeholder);
    if (!this.constructor.flat) {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const name = input.value.trim();
        if (!name) return;
        input.value = '';
        siblings.push({ type: 'submenu', id: null, name, children: [] });
        this._touch();
      });
    }
    input.addEventListener('dragover', (e) => {
      if (this._dragPayload(e)) { e.preventDefault(); input.classList.add('drop-over'); }
    });
    input.addEventListener('dragleave', () => input.classList.remove('drop-over'));
    input.addEventListener('drop', (e) => {
      input.classList.remove('drop-over');
      const plugin = this._dragPayload(e, true);
      if (plugin) {
        e.preventDefault();
        siblings.push(this._itemFromPlugin(plugin));
        this._touch();
      }
    });
    div.appendChild(input);
    return div;
  }

  // ---- drag & drop -------------------------------------------------------
  // Two flows share the row targets: reordering rows among their siblings
  // (internal drag) and accepting plugin cards from <sol-plugin-manager>.

  // A row is a drop TARGET only (rows aren't draggable — position is the ▲▼
  // buttons). It accepts a plugin card from <sol-plugin-manager>, and a chip
  // dragged off a submenu (the `internal` path — chips are still drag sources).
  _wireRowDnd(row, item, siblings) {
    row.addEventListener('dragover', (e) => {
      const plugin = this._dragPayload(e);
      const internal = this._dragItem && this._dragItem.item !== item;
      if (!plugin && !internal) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drop-target', 'drop-before', 'drop-after');
      if (plugin && this._overCentre(row, e)) row.classList.add('drop-target');
      else row.classList.add(this._inUpperHalf(row, e) ? 'drop-before' : 'drop-after');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target', 'drop-before', 'drop-after'));

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const before = this._inUpperHalf(row, e);
      const onRow = this._overCentre(row, e);
      row.classList.remove('drop-target', 'drop-before', 'drop-after');

      const plugin = this._dragPayload(e, true);
      if (plugin) {
        // Dropping on a SUBMENU row adds the plugin to it (menus only — the
        // bar is flat).
        if (onRow && item.type === 'submenu' && !this.constructor.flat) {
          if (!item.children) item.children = [];
          item.children.push(this._itemFromPlugin(plugin));
          this._touch();
          return;
        }
        if (onRow && item.type !== 'submenu') {
          // A second plugin on an already-assigned menu item turns it into a
          // SUBMENU of both: one plugin = the item opens it directly;
          // several = the item shows them all as sub-tabs. (The flat bar
          // keeps replace-on-drop.)
          // The carried-over plugin is named by what IT is (its friendly
          // name) — NEVER by the menu item's own name, which would show the
          // item as a plugin of itself. A NAMELESS assignment (e.g. a stale
          // page include) is an artifact: it is REPLACED by the drop, not
          // carried along as a phantom chip.
          // Name the carried child by what it IS — the catalog entry for its
          // href/tag, else its manifest label — NOT item.name (the menu item's
          // display label, which is typically the new submenu's category name,
          // e.g. "Apps"/"AU"; reusing it makes the first child echo the menu).
          const meta = (window.ComponentInterop?.manifest?.meta || {})[item.tag];
          const carriedName = this._catalogName(item) || meta?.label
            || (item.type === 'link' ? item.name : '');
          if (item.tag || item.href) {
            if (carriedName && !this.constructor.flat) {
              const first = {
                type: item.type, id: null,
                name: carriedName,
                icon: item.icon || undefined,
                tag: item.tag || null,
                params: (item.params || []).map(([k, v]) => [k, v]),
                manifest: item.manifest || undefined,
              };
              if (item.href) { first.href = item.href; if (item.region) first.region = item.region; }
              item.type = 'submenu';
              item.children = [first, this._itemFromPlugin(plugin)];
              item.tag = null;
              item.params = [];
              delete item.href;
              this._touch();
              return;
            }
            // nameless artifact (or the flat bar) → fall through: replace
          }
          // assign this row's content — a component (tag) or a link (href)
          if (plugin.href) {
            item.type = 'link';
            item.href = plugin.href;
            if (plugin.region) item.region = plugin.region;
            item.tag = null;
            item.params = [];
          } else {
            item.type = 'component';
            item.tag = plugin.tag;
            item.params = (plugin.params || []).map(([k, v]) => [k, v]);
            delete item.href;
          }
          item.manifest = plugin.manifest || undefined;   // adopt the chip's identity
          if (!item.name) item.name = plugin.label || plugin.tag || plugin.href;
          if (!item.icon && plugin.icon) item.icon = plugin.icon;
        } else {
          const at = siblings.indexOf(item) + (before ? 0 : 1);
          siblings.splice(at, 0, this._itemFromPlugin(plugin));
        }
        this._touch();
        return;
      }
      if (this._dragItem && this._dragItem.item !== item) {
        const { item: moved, siblings: from } = this._dragItem;
        from.splice(from.indexOf(moved), 1);
        const at = siblings.indexOf(item) + (before ? 0 : 1);
        siblings.splice(at, 0, moved);
        this._dragItem = null;   // consumed internally — not a move-out
        this._touch();
      }
    });
  }

  _dragPayload(e, read = false) {
    if (![...(e.dataTransfer?.types || [])].includes(PLUGIN_MIME)) return null;
    if (!read) return true;
    try { return JSON.parse(e.dataTransfer.getData(PLUGIN_MIME)); } catch { return null; }
  }

  // Outgoing drag for one of OUR items: write the PLUGIN_MIME payload the
  // plugin-manager (the catalog box) understands, in the same shape its own
  // palette cards use. Without this a dragged item carried only text/plain
  // (its display name), which the catalog box then tried to fetch as a
  // manifest URL — a 404. `listIri` is the list this item sits in (the menu
  // for a row, the submenu for a chip).
  _setDragData(e, item, listIri) {
    const p = item.href
      ? { label: item.name || item.href, href: item.href, region: item.region || '', icon: item.icon || '' }
      : { label: item.name || item.tag, tag: item.tag, params: (item.params || []).map(([k, v]) => [k, v]), icon: item.icon || '' };
    if (item.id) { p.subject = `${this._docUrl()}#${item.id}`; p.list = listIri; }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(PLUGIN_MIME, JSON.stringify(p));
    e.dataTransfer.setData('text/plain', item.name || item.tag || item.href || '');
  }

  // A drag of one of our items ended. Internal reorders clear `_dragItem`
  // when they consume it, and a cancelled drag reports dropEffect 'none' — so
  // if `_dragItem` is still set AND a target accepted the drop, the item was
  // moved OUT of this menu (onto the catalog or another menu): remove it here.
  // `_touch` re-normalizes (sole-plugin collapse) and saves.
  _endItemDrag(e) {
    const drag = this._dragItem;
    this._dragItem = null;
    if (!drag || (e.dataTransfer && e.dataTransfer.dropEffect === 'none')) return;
    const at = drag.siblings.indexOf(drag.item);
    if (at >= 0) { drag.siblings.splice(at, 1); this._touch(); }
  }
  _inUpperHalf(row, e) {
    const r = row.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  }
  _overCentre(row, e) {
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y > 0.3 && y < 0.7;
  }

  // A card that carries its catalog identity (manifest = the ui:Plugin entry
  // IRI) becomes a REFERENCE item: its placement wrapper's schema:item points
  // at the bare entry, never an inline copy — the unified model's menus are
  // reference lists.
  // Payload details (label/icon/…) still render the row until the next parse
  // resolves them from the catalog. Manifest-less payloads (hand-entered
  // URLs, legacy docs) keep the old inline form.
  _itemFromPlugin(plugin) {
    if (plugin.href) {
      return {
        type: 'link', id: null,
        name: plugin.label || plugin.href,
        icon: plugin.icon || undefined,
        region: plugin.region || undefined,
        href: plugin.href,
        manifest: plugin.manifest || undefined,
        entry: plugin.manifest || undefined,
      };
    }
    return {
      type: 'component', id: null,
      name: plugin.label || plugin.tag || '',
      icon: plugin.icon || undefined,
      tag: plugin.tag || null,
      params: (plugin.params || []).map(([k, v]) => [k, v]),
      manifest: plugin.manifest || undefined,
      entry: plugin.manifest || undefined,
    };
  }

  // ---- state + save ------------------------------------------------------
  // Auto-save: every edit schedules a save ~0.8s after the LAST edit, so a
  // typing burst in a name field becomes one PUT.

  _markDirty() {
    this._dirty = true;
    this._note('saving…', '');
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 800);
  }
  _touch() { this._normalize(this._items); this._markDirty(); this._render(); }

  // The sole-plugin rule, kept true under drag-off: a submenu reduced to ONE
  // assigned plugin collapses back into a direct item (the tab opens it
  // again). Submenus that are empty or hold unassigned rows are left alone —
  // that's someone building structure by hand.
  _normalize(items) {
    for (const item of items || []) {
      if (item.type !== 'submenu') continue;
      this._normalize(item.children);
      const kids = item.children || [];
      const only = kids.length === 1 ? kids[0] : null;
      if (only && only.type !== 'submenu' && (only.tag || only.href)) {
        item.type = only.type;
        item.tag = only.tag || null;
        item.params = (only.params || []).map(([k, v]) => [k, v]);
        if (only.href) item.href = only.href; else delete item.href;
        if (only.region && !item.region) item.region = only.region;
        if (!item.icon && only.icon) item.icon = only.icon;
        delete item.children;
      }
    }
  }
  _note(msg, cls) {
    if (!this._status) return;
    this._status.textContent = msg;
    this._status.className = `builder-status ${cls || ''}`;
  }

  async _save() {
    if (!this._menuIri()) return;
    this._note('saving…', '');
    try {
      // Rewrite over a FRESH parse so concurrent pantry edits aren't lost.
      let store;
      try { store = await loadRdfStore(this._docUrl(), freshFetch); }
      catch { store = rdf.graph(); }
      updateMenuInStore(store, this._docUrl(), this._menuIri(), {
        label: this._meta.label, orientation: this._meta.orientation,
        view: this._meta.view,
        region: this._meta.region, regionRef: this._meta.regionRef, items: this._items,
      });
      const turtle = await serializeMenuDocument(store, this._docUrl());
      const res = await solFetch(this._docUrl(), {
        method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: turtle,
      });
      if (!res || res.ok === false) throw new Error(`PUT ${this._docUrl()} → ${res && res.status}`);
      this._dirty = false;
      this._note('saved ✓', 'saved');
      this.dispatchEvent(new CustomEvent('sol-menu-built', {
        bubbles: true, composed: true, detail: { source: this.source },
      }));
    } catch (e) {
      this._note(`save failed: ${e.message}`, 'error');
    }
  }
}

define('sol-menu-manager', SolMenuManager);
export { SolMenuManager, PLUGIN_MIME, isCoarse, COARSE_MQL };
export default SolMenuManager;
