/**
 * <sol-gallery> — pure image-grid display (masonry + lightbox).
 *
 * Source-blind: it renders the ImageItem RDF it is handed and emits events. It
 * does NO network, no search, and knows nothing about Commons / Wikidata /
 * files / SKOS / DCAT. A host (see the `sources/` providers) pumps pages of
 * `schema:ImageObject` records in and decides what a selection means.
 *
 * Display contract
 *   clear()       drop all tiles — a new collection was selected
 *   add(store)    append one page of schema:ImageObject records   ← the seam
 *   end()         the host signals there are no more pages
 * Events out
 *   'item-opened' {detail:{iri}}  a tile's lightbox opened (lazy per-item detail hook)
 *   'load-more'                   scrolled near the end; the host should pump the next page
 *
 * Records are read with `readImageItems` from the shared contract, so the
 * gallery and every provider agree on the vocab without either re-declaring it.
 *
 * @element sol-gallery
 * @example
 *   const g = document.querySelector('sol-gallery');
 *   g.addEventListener('load-more', () => pumpNextPage());
 *   g.clear(); g.add(pageStore); // …; g.end();
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as GALLERY_CSS, sheet as GALLERY_SHEET } from './styles/sol-gallery-css.js';
import { readImageItems } from '../sources/contract.js';

class SolGallery extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** @type {Array} flattened, position-ordered items across all pages. */
    this._items = [];
  }

  connectedCallback() {
    if (this._built) return;            // build once; survives re-attach
    this._built = true;
    adopt(this.shadowRoot, { sheet: GALLERY_SHEET, css: GALLERY_CSS });

    this._main = document.createElement('div');
    this._main.className = 'gallery-main';
    this._status = document.createElement('div');
    this._status.className = 'gallery-status';
    this._status.setAttribute('role', 'status');
    this._status.setAttribute('aria-live', 'polite');
    this._grid = document.createElement('div');
    this._grid.className = 'gallery-grid';
    this._main.append(this._status, this._grid);
    this.shadowRoot.append(this._main);
    this._buildLightbox();

    this._renderEmpty('Pick a collection to see its images.');
  }

  disconnectedCallback() {
    if (this._io) { this._io.disconnect(); this._io = null; }
    document.removeEventListener('keydown', this._onKey);
  }

  setStatus(msg, isError = false) {
    this._status.textContent = msg || '';
    if (isError) this._status.setAttribute('data-error', '');
    else this._status.removeAttribute('data-error');
  }

  /** Show a centred placeholder line in the grid (cleared by the next page). */
  _renderEmpty(text) {
    const empty = document.createElement('div');
    empty.className = 'gallery-empty';
    empty.textContent = text;
    this._grid.replaceChildren(empty);
    this._emptyEl = empty;
  }

  /* ── display contract ───────────────────────────────────────────────────── */

  /** Drop everything for a freshly selected collection; show a loading line. */
  clear() {
    this._items = [];
    this._complete = false;
    this._awaitingPage = false;
    this._removeSentinel();
    this._grid.replaceChildren();
    this._emptyEl = null;
    this.setStatus('Loading images…');
  }

  /** Append one page (an rdflib store of schema:ImageObject records). */
  add(store) {
    const page = readImageItems(store);
    this._awaitingPage = false;
    if (this._emptyEl) { this._emptyEl.remove(); this._emptyEl = null; }

    const start = this._items.length;
    this._items = this._items.concat(page);
    for (let i = 0; i < page.length; i++) {
      this._grid.appendChild(this._thumb(this._items[start + i], start + i));
    }
    this.setStatus(this._countLabel());
    this._armSentinel();                // a page arrived → there may be more
  }

  /** The host has no more pages: remove the sentinel; show empty if needed. */
  end() {
    this._complete = true;
    this._removeSentinel();
    if (!this._items.length) {
      this.setStatus('');
      this._renderEmpty('This collection has no images in its Commons category.');
    } else {
      this.setStatus(this._countLabel());
    }
  }

  _countLabel() {
    const n = this._items.length;
    return `${n} image${n === 1 ? '' : 's'}`;
  }

  /* ── lazy paging (the gallery only ASKS; the host fetches) ───────────────── */

  /** Ensure a sentinel + observer exist so reaching the end emits 'load-more'.
   *  A Load-more button is added as a no-IntersectionObserver fallback. */
  _armSentinel() {
    if (this._complete) return;
    if (!this._sentinel) {
      this._sentinel = document.createElement('div');
      this._sentinel.className = 'gallery-sentinel';
    }
    this._grid.appendChild(this._sentinel);     // keep it last

    if ('IntersectionObserver' in window) {
      if (this._io) this._io.disconnect();
      this._io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) this._requestMore();
      }, { root: this._main, rootMargin: '600px' });
      this._io.observe(this._sentinel);
    } else if (!this._moreBtn) {
      this._moreBtn = document.createElement('button');
      this._moreBtn.type = 'button';
      this._moreBtn.className = 'gallery-more';
      this._moreBtn.textContent = 'Load more';
      this._moreBtn.addEventListener('click', () => this._requestMore());
      this._main.appendChild(this._moreBtn);
    }
  }

  _removeSentinel() {
    if (this._io) { this._io.disconnect(); this._io = null; }
    this._sentinel?.remove();
    this._moreBtn?.remove();
    this._moreBtn = null;
  }

  /** Ask the host for the next page (once; re-armed when add() lands). */
  _requestMore() {
    if (this._complete || this._awaitingPage) return;
    this._awaitingPage = true;
    if (this._io) { this._io.disconnect(); this._io = null; }   // re-armed by add()
    this.dispatchEvent(new CustomEvent('load-more', { bubbles: true, composed: true }));
  }

  /* ── thumbnails ──────────────────────────────────────────────────────────── */

  /** One masonry thumbnail button → opens the lightbox at its index. */
  _thumb(item, index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gallery-thumb';
    b.dataset.index = String(index);
    b.setAttribute('aria-label', item.caption || 'image');
    const el = document.createElement('img');
    el.src = item.thumb;
    el.alt = item.caption || '';
    el.loading = 'lazy';
    if (item.width && item.height) { el.width = item.width; el.height = item.height; }
    el.addEventListener('error', () => b.remove());
    b.appendChild(el);
    b.addEventListener('click', () => this.openLightbox(index));
    return b;
  }

  /* ── lightbox ────────────────────────────────────────────────────────────── */

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
    // Optional ★: shown only when the host opts in via the `favouritable`
    // attribute. The gallery stays source-blind — it just emits the item; the
    // host decides what favouriting means.
    const fav = document.createElement('button');
    fav.type = 'button'; fav.className = 'gallery-lb-fav';
    fav.textContent = '☆'; fav.title = 'Add to favourites'; fav.setAttribute('aria-label', 'Favourite');
    fav.hidden = !this.hasAttribute('favouritable');

    lb.append(close, fav, prev, img, next, caption);
    this.shadowRoot.appendChild(lb);
    this._lb = { lb, img, caption, prev, next, close, fav };

    prev.addEventListener('click', () => this.stepLightbox(-1));
    next.addEventListener('click', () => this.stepLightbox(1));
    close.addEventListener('click', () => this.closeLightbox());
    fav.addEventListener('click', (e) => {
      e.stopPropagation();
      const it = this._items[this._lbIndex];
      if (it) this.dispatchEvent(new CustomEvent('item-favourite', {
        detail: { iri: it.iri, full: it.full, thumb: it.thumb, caption: it.caption, detailUrl: it.detailUrl },
        bubbles: true, composed: true,
      }));
    });
    lb.addEventListener('click', (e) => { if (e.target === lb) this.closeLightbox(); });
    // Click the image to toggle a full-bleed, actual-size (100%) view that pans
    // via scroll; click again (or page / Esc) to return to fit. Only offered
    // when the fit view shows fewer pixels than the image actually has.
    img.addEventListener('click', (e) => { e.stopPropagation(); if (this._canZoom) this.setZoom(!this._lbZoom); });
    img.addEventListener('load', () => this._refreshZoomable());

    this._onKey = (e) => {
      if (this._lb.lb.hidden) return;
      if (e.key === 'Escape') this.closeLightbox();
      else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
      else if (e.key === 'ArrowRight') this.stepLightbox(1);
    };
    document.addEventListener('keydown', this._onKey);
  }

  openLightbox(index) {
    this._lbIndex = index;
    this.showLightboxImage();
    this._lb.lb.hidden = false;
    this._lb.close.focus();
    // Lazy per-item detail hook: a host may listen and enrich (e.g. Wikidata).
    const it = this._items[index];
    if (it) this.dispatchEvent(new CustomEvent('item-opened', {
      detail: { iri: it.iri }, bubbles: true, composed: true,
    }));
  }

  stepLightbox(delta) {
    const imgs = this._items;
    if (!imgs.length) return;
    this._lbIndex = (this._lbIndex + delta + imgs.length) % imgs.length;
    this.showLightboxImage();
  }

  /** Decide whether the current (fit) image can usefully zoom: only when its
   *  natural pixel width exceeds the fit-rendered width. Toggles the no-zoom
   *  class (hides the zoom-in cursor) and gates the click handler. */
  _refreshZoomable() {
    const { lb, img } = this._lb;
    const fitW = this._lbZoom ? 0 : img.getBoundingClientRect().width;
    this._canZoom = !this._lbZoom && img.naturalWidth > Math.ceil(fitW) + 1;
    lb.classList.toggle('no-zoom', !this._canZoom);
  }

  setZoom(on) {
    this._lbZoom = on;
    const { lb, img } = this._lb;
    lb.classList.toggle('zoomed', on);
    if (on) {
      requestAnimationFrame(() => {
        lb.scrollLeft = Math.max(0, (img.scrollWidth - lb.clientWidth) / 2);
        lb.scrollTop = Math.max(0, (img.scrollHeight - lb.clientHeight) / 2);
      });
    }
  }

  showLightboxImage() {
    const it = this._items[this._lbIndex];
    if (!it) return;
    this.setZoom(false);                 // each image starts fit-to-screen
    this._lb.img.src = it.full || it.thumb;
    this._lb.img.alt = it.caption || '';
    const bits = [it.caption, it.author, it.license].filter(Boolean);
    this._lb.caption.textContent = bits.join(' · ');
    if (it.detailUrl) {
      this._lb.caption.append(' ');
      const link = document.createElement('a');
      link.href = it.detailUrl; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = 'View on Commons ↗';
      this._lb.caption.appendChild(link);
    }
    const multi = this._items.length > 1;
    this._lb.prev.style.display = multi ? '' : 'none';
    this._lb.next.style.display = multi ? '' : 'none';
    this._refreshZoomable();             // default to no-zoom until the image loads
  }

  closeLightbox() {
    this.setZoom(false);
    this._lb.lb.hidden = true;
    this._lb.img.removeAttribute('src');
  }
}

define('sol-gallery', SolGallery);

export { SolGallery };
