/**
 * <sol-gallery> — Wikimedia Commons image-collection browser.
 *
 * A bookmark/SKOS tree (see data/images.ttl) whose leaves each `bk:recalls`
 * a Wikimedia Commons *category* URL. The component renders, in one shadow
 * root:
 *
 *   • a two-column Miller browser on the left: col 1 stacks the groups
 *     (Art / Life) over the selected group's sub-topics; col 2 lists the
 *     selected sub-topic's collections;
 *   • a masonry image GRID on the right for the selected collection, filled
 *     lazily from the Commons API (CORS-direct, no proxy) and paged on scroll;
 *   • an in-page LIGHTBOX for the full-size image, with ←/→ paging, license
 *     caption, and a link out to the Commons file page.
 *
 * It reuses <sol-feed>'s bookmark-tree parser (parseBookmarkTree) and the
 * shared design-token / adopt plumbing, so it themes with the rest of the
 * suite. Mounting only parses the local TTL — no Commons calls happen until
 * a collection is clicked.
 *
 * Attributes:
 *   source   "<rdfFile>#<Topic>" — the root topic to render (required).
 *   proxy    CORS proxy for fetching a cross-origin TTL source (the Commons
 *            image calls never use it). Falls back to <sol-default>'s proxy.
 *
 * @element sol-gallery
 * @example <sol-gallery source="images.ttl#Images"></sol-gallery>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as GALLERY_CSS, sheet as GALLERY_SHEET } from './styles/sol-gallery-css.js';
import { parseBookmarkTree } from './utils/feed-fetch.js';
import { getCategoryImages } from './utils/commons-fetch.js';
import { getDefault, onDefaultChange } from '../core/defaults.js';

/** How many files to request per Commons page. */
const PAGE_SIZE = 60;

class SolGallery extends HTMLElement {
  /** Inline editor: the tree IS the picker — skip discovery surfaces. */
  static get editor() { return { inline: true }; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** category URL → { images, cont } accumulated across pages. */
    this._cache = new Map();
  }

  async connectedCallback() {
    this.shadowRoot.adoptedStyleSheets = [];
    this.shadowRoot.innerHTML = '';

    this.proxy = this.getAttribute('proxy') || getDefault('proxy') || '';
    this.source = this.getAttribute('source') || '';

    if (!this._unsubDefaults) {
      this._unsubDefaults = onDefaultChange((name) => {
        if (name === 'proxy') this.reload().catch(() => {});
      });
    }

    adopt(this.shadowRoot, { sheet: GALLERY_SHEET, css: GALLERY_CSS });

    // Layout: a two-column Miller browser | main(head + status + grid).
    //   col 1 — groups (Art / Life) on top; the selected group's sub-topics
    //           below; col 2 — the selected sub-topic's collections.
    //   Clicking a collection fills the main image grid. Lightbox last.
    this._sel = document.createElement('nav');
    this._sel.className = 'gallery-cols';
    this._sel.setAttribute('aria-label', 'Collections');

    const col1 = document.createElement('div');
    col1.className = 'gallery-col gallery-col1';
    this._groupsPane = this._pane('gallery-groups', 'Library');
    this._subPane = this._pane('gallery-subtopics', 'Topics');
    col1.append(this._groupsPane, this._subPane);

    const col2 = document.createElement('div');
    col2.className = 'gallery-col gallery-col2';
    this._collPane = this._pane('gallery-collections', 'Collections');
    col2.append(this._collPane);

    this._sel.append(col1, col2);

    this._main = document.createElement('div');
    this._main.className = 'gallery-main';

    this._head = document.createElement('h2');
    this._head.className = 'gallery-head';
    this._status = document.createElement('div');
    this._status.className = 'gallery-status';
    this._status.setAttribute('role', 'status');
    this._status.setAttribute('aria-live', 'polite');
    this._grid = document.createElement('div');
    this._grid.className = 'gallery-grid';
    this._main.append(this._head, this._status, this._grid);

    this.shadowRoot.append(this._sel, this._main);
    this._buildLightbox();

    try {
      await this.renderSelector();
    } catch (e) {
      this.setStatus(e.message || String(e), true);
    }
  }

  /** Build a labelled, scrollable pane (header + an empty <ul> body). */
  _pane(cls, label) {
    const pane = document.createElement('div');
    pane.className = `gallery-pane ${cls}`;
    const head = document.createElement('div');
    head.className = 'gallery-pane-head';
    head.textContent = label;
    const ul = document.createElement('ul');
    ul.className = 'gallery-list';
    pane.append(head, ul);
    pane._list = ul;
    return pane;
  }

  /** Append a hint line into a pane's list (cleared on the next fill). */
  _paneHint(pane, text) {
    const li = document.createElement('li');
    li.className = 'gallery-pane-hint';
    li.textContent = text;
    pane._list.replaceChildren(li);
  }

  async reload() {
    this._cache.clear();
    await this.connectedCallback();
  }

  disconnectedCallback() {
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
    if (this._io) { this._io.disconnect(); this._io = null; }
    document.removeEventListener('keydown', this._onKey);
  }

  setStatus(msg, isError = false) {
    this._status.textContent = msg || '';
    if (isError) this._status.setAttribute('data-error', '');
    else this._status.removeAttribute('data-error');
  }

  /** localStorage key for the last-opened collection (one URL). */
  get selectionKey() {
    return `sol-gallery:collection:${this.source || location.pathname}`;
  }

  /* ── selector (two-column Miller browser) ──────────────────────────────── */

  /** True when a topic node has at least one collection anywhere beneath it. */
  hasContent(node) {
    return node.collections.length > 0 || node.topics.some(t => this.hasContent(t));
  }

  /** Add a row button to a pane's list and return it. */
  _row(pane, cls, label) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `gallery-row ${cls}`;
    b.textContent = label;
    li.appendChild(b);
    pane._list.appendChild(li);
    return b;
  }

  async renderSelector() {
    if (!this.source) { this.setStatus('No source specified', true); return; }
    this.setStatus('Loading collections…');
    const root = await parseBookmarkTree(this.source, { proxy: this.proxy });

    // url → { group, sub } so a remembered collection can repopulate both
    // columns on restore.
    this._locate = new Map();
    this._groupButtons = [];
    this._groupBtnByNode = new Map();

    const groups = root.topics.filter(g => this.hasContent(g));
    this._groupsPane._list.replaceChildren();
    for (const g of groups) {
      const b = this._row(this._groupsPane, 'gallery-group', g.label);
      b.addEventListener('click', () => this.selectGroup(g, b));
      this._groupButtons.push(b);
      this._groupBtnByNode.set(g, b);
      for (const sub of g.topics) {
        for (const coll of sub.collections) this._locate.set(coll.url, { group: g, sub });
      }
    }

    if (!groups.length) { this.setStatus('No collections found', true); return; }
    this.setStatus('');
    this._head.textContent = '';
    this._paneHint(this._subPane, 'Select a library above');
    this._paneHint(this._collPane, 'Select a topic');

    // Restore the last-opened collection: refill both columns, select, load.
    let remembered = null;
    try { remembered = localStorage.getItem(this.selectionKey); } catch {}
    const where = remembered && this._locate.get(remembered);
    if (where) {
      this.selectGroup(where.group, this._groupBtnByNode.get(where.group));
      const subBtn = this._subBtnByNode.get(where.sub);
      if (subBtn) this.selectSubtopic(where.sub, subBtn);
      const collBtn = this._collButtons.find(b => b.dataset.url === remembered);
      if (collBtn) {
        this.selectCollection(remembered, collBtn.textContent, collBtn);
        requestAnimationFrame(() => collBtn.scrollIntoView({ block: 'nearest' }));
      }
    } else {
      // First visit: open the first group so its topics show in col 1.
      if (groups.length) this.selectGroup(groups[0], this._groupButtons[0]);
      this._grid.replaceChildren();
      const hint = document.createElement('div');
      hint.className = 'gallery-empty';
      hint.textContent = 'Pick a collection to see its images.';
      this._grid.appendChild(hint);
    }
  }

  /** Select a group: highlight it and fill col-1's lower pane with its
   *  sub-topics; col 2 resets until a sub-topic is picked. */
  selectGroup(node, btn) {
    this._activeGroup = node;
    for (const b of this._groupButtons) {
      const on = b === btn;
      b.classList.toggle('selected', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }

    this._subButtons = [];
    this._subBtnByNode = new Map();
    this._subPane._list.replaceChildren();
    for (const sub of node.topics.filter(s => this.hasContent(s))) {
      const b = this._row(this._subPane, 'gallery-sub', sub.label);
      b.addEventListener('click', () => this.selectSubtopic(sub, b));
      this._subButtons.push(b);
      this._subBtnByNode.set(sub, b);
    }
    this._collButtons = [];
    this._paneHint(this._collPane, 'Select a topic');
  }

  /** Select a sub-topic: highlight it and fill col 2 with its collections. */
  selectSubtopic(node, btn) {
    this._activeSub = node;
    for (const b of this._subButtons) {
      const on = b === btn;
      b.classList.toggle('selected', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }

    this._collButtons = [];
    this._collPane._list.replaceChildren();
    for (const coll of node.collections) {
      const b = this._row(this._collPane, 'gallery-collection', coll.label);
      b.dataset.url = coll.url;
      b.addEventListener('click', () => this.selectCollection(coll.url, coll.label, b));
      this._collButtons.push(b);
    }
  }

  /* ── grid ─────────────────────────────────────────────────────────────── */

  async selectCollection(url, label, btn) {
    for (const b of this._collButtons) {
      const on = b === btn;
      b.classList.toggle('selected', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
    try { localStorage.setItem(this.selectionKey, url); } catch {}

    this._activeUrl = url;
    this._head.textContent = label;
    this._grid.replaceChildren();
    this.setStatus('Loading images…');
    if (this._io) { this._io.disconnect(); this._io = null; }

    try {
      await this.loadPage(url, /* first */ true);
    } catch (e) {
      this.setStatus(`${label}: ${e.message}`, true);
    }
  }

  /** Fetch one page for `url`, append its thumbs, and wire paging. Guards
   *  against a stale response when the user has since picked another
   *  collection. */
  async loadPage(url, first) {
    const prev = first ? null : (this._cache.get(url) || null);
    const { images, cont } = await getCategoryImages(url, {
      thumbWidth: 300,
      limit: PAGE_SIZE,
      cont: prev ? prev.cont : undefined,
    });
    if (this._activeUrl !== url) return;        // selection changed mid-flight

    const acc = this._cache.get(url) || { images: [], cont: null };
    acc.images = acc.images.concat(images);
    acc.cont = cont;
    this._cache.set(url, acc);

    if (!acc.images.length) {
      this.setStatus('');
      const empty = document.createElement('div');
      empty.className = 'gallery-empty';
      empty.textContent = 'This collection has no images directly in its Commons category.';
      this._grid.replaceChildren(empty);
      return;
    }

    const start = acc.images.length - images.length;
    for (let i = 0; i < images.length; i++) this._grid.appendChild(this.thumb(images[start + i], start + i));
    this.setStatus(`${acc.images.length} image${acc.images.length === 1 ? '' : 's'}` + (cont ? ' (scroll for more)' : ''));
    this.wirePaging(url, cont);
  }

  /** Attach an IntersectionObserver sentinel (with a Load-more fallback)
   *  when more pages remain; remove paging affordances otherwise. */
  wirePaging(url, cont) {
    this._grid.querySelector('.gallery-sentinel')?.remove();
    this._grid.querySelector('.gallery-more')?.remove();
    if (this._io) { this._io.disconnect(); this._io = null; }
    if (!cont) return;

    const sentinel = document.createElement('div');
    sentinel.className = 'gallery-sentinel';
    this._grid.appendChild(sentinel);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'gallery-more';
    more.textContent = 'Load more';
    more.addEventListener('click', () => this.loadPage(url, false).catch(() => {}));
    this._main.appendChild(more);

    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) {
          this._io.disconnect(); this._io = null;
          this.loadPage(url, false).catch(() => {});
        }
      }, { root: this._main, rootMargin: '600px' });
      this._io.observe(sentinel);
    }
  }

  /** One masonry thumbnail button → opens the lightbox at its index. */
  thumb(img, index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gallery-thumb';
    b.dataset.index = String(index);
    b.setAttribute('aria-label', img.title);
    const el = document.createElement('img');
    el.src = img.thumb;
    el.alt = img.title;
    el.loading = 'lazy';
    if (img.width && img.height) { el.width = img.width; el.height = img.height; }
    el.addEventListener('error', () => b.remove());
    b.appendChild(el);
    b.addEventListener('click', () => this.openLightbox(index));
    return b;
  }

  /* ── lightbox ───────────────────────────────────────────────────────── */

  _buildLightbox() {
    const lb = document.createElement('div');
    lb.className = 'gallery-lightbox';
    lb.hidden = true;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');

    const img = document.createElement('img');
    const caption = document.createElement('div');
    caption.className = 'gallery-lb-caption';
    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'gallery-lb-btn gallery-lb-prev';
    prev.textContent = '‹'; prev.setAttribute('aria-label', 'Previous image');
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'gallery-lb-btn gallery-lb-next';
    next.textContent = '›'; next.setAttribute('aria-label', 'Next image');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'gallery-lb-close';
    close.textContent = '✕'; close.setAttribute('aria-label', 'Close');

    lb.append(close, prev, img, next, caption);
    this.shadowRoot.appendChild(lb);
    this._lb = { lb, img, caption, prev, next, close };

    prev.addEventListener('click', () => this.stepLightbox(-1));
    next.addEventListener('click', () => this.stepLightbox(1));
    close.addEventListener('click', () => this.closeLightbox());
    lb.addEventListener('click', (e) => { if (e.target === lb) this.closeLightbox(); });

    this._onKey = (e) => {
      if (this._lb.lb.hidden) return;
      if (e.key === 'Escape') this.closeLightbox();
      else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
      else if (e.key === 'ArrowRight') this.stepLightbox(1);
    };
    document.addEventListener('keydown', this._onKey);
  }

  /** Images currently loaded for the active collection. */
  get _activeImages() {
    return (this._cache.get(this._activeUrl) || {}).images || [];
  }

  openLightbox(index) {
    this._lbIndex = index;
    this.showLightboxImage();
    this._lb.lb.hidden = false;
    this._lb.close.focus();
  }

  stepLightbox(delta) {
    const imgs = this._activeImages;
    if (!imgs.length) return;
    this._lbIndex = (this._lbIndex + delta + imgs.length) % imgs.length;
    this.showLightboxImage();
  }

  showLightboxImage() {
    const imgs = this._activeImages;
    const it = imgs[this._lbIndex];
    if (!it) return;
    this._lb.img.src = it.full || it.thumb;
    this._lb.img.alt = it.title;
    const bits = [it.title];
    if (it.artist) bits.push(it.artist);
    if (it.license) bits.push(it.license);
    this._lb.caption.textContent = bits.filter(Boolean).join(' · ');
    if (it.descUrl) {
      this._lb.caption.append(' ');
      const a = document.createElement('a');
      a.href = it.descUrl; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'View on Commons ↗';
      this._lb.caption.appendChild(a);
    }
    const multi = imgs.length > 1;
    this._lb.prev.style.display = multi ? '' : 'none';
    this._lb.next.style.display = multi ? '' : 'none';
  }

  closeLightbox() {
    this._lb.lb.hidden = true;
    this._lb.img.removeAttribute('src');
  }
}

define('sol-gallery', SolGallery);

export { SolGallery };
