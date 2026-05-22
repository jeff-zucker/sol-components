/**
 * <sol-feed> — RSS / Atom feed viewer web component.
 *
 * A single shadow-DOM element with three layouts, chosen by the `view`
 * attribute:
 *
 *   view="single"     — render one feed (the `source` URL) as a link list.
 *   view="multiple"   — a sources picker: a side list of feeds; clicking
 *                       one shows its articles in the content pane.
 *   view="news-page"  — a Google-News-like grid: tick which sources you
 *                       want and their articles are merged, randomized,
 *                       and shown as image cards with a description that
 *                       reveals on hover / keyboard focus.
 *
 * For `multiple` / `news-page` the feed list comes from the `source`
 * attribute (an HTML page of links, or an RDF/Turtle document) or, when
 * `source` is absent, from inline `<a href>` children.
 *
 * Attributes:
 *   view    single | multiple | news-page   (default: single)
 *   source  feed URL (single) or source-list URL (multiple / news-page)
 *   proxy   CORS proxy pattern, prepended to every fetched URL
 *
 * @element sol-feed
 *
 * @example
 *   <sol-feed view="single" source="https://example.org/rss.xml"></sol-feed>
 *
 *   <sol-feed view="news-page" proxy="http://localhost:3002/?uri=">
 *     <a href="https://a.example/rss">Site A</a>
 *     <a href="https://b.example/atom">Site B</a>
 *   </sol-feed>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as FEED_CSS, sheet as FEED_SHEET } from './styles/sol-feed-css.js';
import { getFeedItems, parseSourceList } from './utils/feed-fetch.js';

/** Fisher–Yates in-place shuffle. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Human-readable date, or '' when the string is missing / unparseable. */
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The shared "reader" window — the object window.open() returns. */
let readerWindow = null;

/**
 * Window features for the reader window: a 1024×640 window flush against
 * the right edge of the screen and centred vertically. Passing features
 * (the 3rd window.open arg) is what makes it a real window, not a tab.
 */
function readerFeatures() {
  const w = 1024, h = 640;
  const left = Math.max(0, window.screen.availWidth - w);          // flush right
  const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));  // centred
  return `width=${w},height=${h},left=${left},top=${top}`;
}

/**
 * Open an article in the shared "reader" window.
 *
 * window.open() with the features argument creates a real window on the
 * first click. It can't be found again by name later — browsers clear a
 * window's name once it navigates to another origin — so the window object
 * window.open() returns is kept and navigated directly, replacing its
 * content in place instead of opening anything new.
 *
 * @returns {boolean} true when the reader window handled the article; false
 *   when window.open was blocked — the caller then lets the click fall
 *   through and open the link the normal way.
 */
function openInReader(url) {
  if (!url || url === '#') return false;
  if (readerWindow && !readerWindow.closed) {
    readerWindow.location.href = url;                     // reuse — replace content
    readerWindow.focus();
    return true;
  }
  readerWindow = window.open(url, 'sol-feed-reader', readerFeatures());   // create
  if (readerWindow) {
    readerWindow.focus();
    return true;
  }
  return false;   // window.open blocked — fall back to a normal link open
}

/**
 * RSS / Atom feed viewer web component.
 *
 * @class SolFeed
 * @extends HTMLElement
 */
class SolFeed extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** feed URL → parsed items, populated lazily by the news view. */
    this._cache = new Map();
  }

  async connectedCallback() {
    const view = (this.getAttribute('view') || 'single').toLowerCase();
    this.proxy = this.getAttribute('proxy') || '';
    this.source = this.getAttribute('source') || '';

    // Capture inline <a> children before the shadow root hides the light DOM.
    this._inlineSources = Array.from(this.querySelectorAll('a[href]')).map(a => ({
      label: (a.textContent || '').trim() || a.href,
      url: a.href,
      topic: '',
    }));

    adopt(this.shadowRoot, { sheet: FEED_SHEET, css: FEED_CSS });

    this._status = document.createElement('div');
    this._status.className = 'sol-feed-status';
    this._status.setAttribute('role', 'status');
    this._status.setAttribute('aria-live', 'polite');
    this._status.style.display = 'none';

    this._root = document.createElement('div');
    this._root.className = 'sol-feed';

    this.shadowRoot.append(this._status, this._root);

    try {
      if (view === 'multiple') await this.renderMultiple();
      else if (view === 'news-page') await this.renderNews();
      else await this.renderSingle();
    } catch (e) {
      this.setStatus(e.message || String(e), true);
    }
  }

  /** Update the polite live region. Pass `isError` to colour it. */
  setStatus(msg, isError = false) {
    this._status.textContent = msg || '';
    this._status.style.display = msg ? '' : 'none';
    if (isError) this._status.setAttribute('data-error', '');
    else this._status.removeAttribute('data-error');
  }

  /** Resolve the configured feed list — RDF/HTML `source`, else inline. */
  async resolveSources() {
    if (this.source) return parseSourceList(this.source, { proxy: this.proxy });
    return this._inlineSources;
  }

  /**
   * Group feeds by their `topic`, preserving first-seen topic order. When
   * no feed carries a topic the result is a single untitled group, so
   * callers can render grouped and ungrouped lists the same way.
   *
   * @param {Array<{topic?:string}>} feeds
   * @returns {Array<{topic:string, feeds:Array}>}
   */
  groupByTopic(feeds) {
    const order = [];
    const groups = new Map();
    for (const f of feeds) {
      const topic = f.topic || '';
      if (!groups.has(topic)) { groups.set(topic, []); order.push(topic); }
      groups.get(topic).push(f);
    }
    return order.map(topic => ({ topic, feeds: groups.get(topic) }));
  }

  /** Build a `<ul class="feed-items">` of article links. */
  itemsList(items) {
    const ul = document.createElement('ul');
    ul.className = 'feed-items';
    ul.setAttribute('aria-label', 'Articles');

    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'sol-feed-empty';
      li.textContent = 'No articles';
      ul.appendChild(li);
      return ul;
    }

    for (const it of items) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'feed-link';
      a.href = it.link || '#';
      a.textContent = it.title;
      a.addEventListener('click', ev => { if (openInReader(a.href)) ev.preventDefault(); });

      const meta = [it.source, formatDate(it.pubDate)].filter(Boolean).join(' · ');
      if (meta) {
        const span = document.createElement('span');
        span.className = 'feed-link-meta';
        span.textContent = meta;
        a.appendChild(span);
      }
      li.appendChild(a);
      ul.appendChild(li);
    }
    return ul;
  }

  /* ── view: single ─────────────────────────────────────────────────── */

  async renderSingle() {
    if (!this.source) { this.setStatus('No feed source specified', true); return; }
    this.setStatus('Loading feed…');
    const items = await getFeedItems(this.source, { proxy: this.proxy });
    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list single';
    wrap.appendChild(this.itemsList(items));
    this._root.replaceChildren(wrap);
    this.setStatus(items.length ? '' : 'Feed has no items');
  }

  /* ── view: multiple ───────────────────────────────────────────────── */

  async renderMultiple() {
    this.setStatus('Loading sources…');
    const sources = await this.resolveSources();
    if (!sources.length) { this.setStatus('No feed sources found', true); return; }

    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list';

    const nav = document.createElement('nav');
    nav.className = 'feed-sources-nav';
    nav.setAttribute('aria-label', 'Feed sources');
    const sourcesBox = document.createElement('div');
    sourcesBox.className = 'feed-sources';
    nav.appendChild(sourcesBox);

    let itemsUl = document.createElement('ul');
    itemsUl.className = 'feed-items';
    itemsUl.setAttribute('aria-label', 'Articles');

    const allLinks = [];

    const selectSource = async (src, anchor) => {
      allLinks.forEach(a => {
        const on = a === anchor;
        a.classList.toggle('selected', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      this.setStatus(`Loading ${src.label}…`);
      try {
        const fresh = this.itemsList(await getFeedItems(src.url, { proxy: this.proxy }));
        itemsUl.replaceWith(fresh);
        itemsUl = fresh;
        this.setStatus('');
      } catch (e) {
        this.setStatus(`${src.label}: ${e.message}`, true);
      }
    };

    for (const group of this.groupByTopic(sources)) {
      if (group.topic) {
        const heading = document.createElement('div');
        heading.className = 'feed-group-label';
        heading.textContent = group.topic;
        sourcesBox.appendChild(heading);
      }
      const ul = document.createElement('ul');
      ul.className = 'feed-source-list';
      if (group.topic) ul.setAttribute('aria-label', group.topic);
      for (const src of group.feeds) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'feed-link';
        a.href = src.url;
        a.textContent = src.label;
        a.addEventListener('click', ev => { ev.preventDefault(); selectSource(src, a); });
        allLinks.push(a);
        li.appendChild(a);
        ul.appendChild(li);
      }
      sourcesBox.appendChild(ul);
    }

    wrap.append(nav, itemsUl);
    this._root.replaceChildren(wrap);

    selectSource(sources[0], allLinks[0]);
  }

  /* ── view: news-page ──────────────────────────────────────────────── */

  async renderNews() {
    this.setStatus('Loading sources…');
    const sources = await this.resolveSources();
    if (!sources.length) { this.setStatus('No feed sources found', true); return; }

    const remembered = this.loadSelection();

    // A bar with a show/hide toggle for the source picker.
    const bar = document.createElement('div');
    bar.className = 'feed-picker-bar';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'feed-picker-toggle';
    const pickerId = `sol-feed-picker-${Math.random().toString(36).slice(2, 8)}`;
    toggle.setAttribute('aria-controls', pickerId);
    bar.appendChild(toggle);

    const picker = document.createElement('div');
    picker.className = 'feed-picker';
    picker.id = pickerId;

    const grid = document.createElement('div');
    grid.className = 'feed-grid';
    grid.setAttribute('aria-label', 'Articles');

    let i = 0;
    for (const group of this.groupByTopic(sources)) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'feed-topic';
      const legend = document.createElement('legend');
      legend.textContent = group.topic || 'Sources';
      fieldset.appendChild(legend);

      for (const src of group.feeds) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `sol-feed-src-${i++}`;
        cb.value = src.url;
        cb.checked = remembered.includes(src.url);
        cb.addEventListener('change', () => {
          this.saveSelection();
          this.toggleSource(src, cb.checked, grid);
        });
        label.append(cb, document.createTextNode(' ' + src.label));
        fieldset.appendChild(label);
      }
      picker.appendChild(fieldset);
    }

    const setExpanded = open => {
      picker.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide sources' : 'Show sources';
    };
    toggle.addEventListener('click', () => setExpanded(picker.hidden));
    setExpanded(true);

    this._root.replaceChildren(bar, picker, grid);

    // Load whatever sources were remembered from a previous visit.
    const chosen = sources.filter(s => remembered.includes(s.url));
    if (chosen.length) {
      grid.setAttribute('aria-busy', 'true');
      await Promise.all(chosen.map(s => this.ensureSource(s)));
      grid.setAttribute('aria-busy', 'false');
    }
    this.renderGrid(grid);
  }

  /** localStorage key for this element's news-page source selection. */
  get selectionKey() {
    return `sol-feed:selected:${this.source || location.pathname}`;
  }

  /** Read the remembered set of selected feed URLs (empty on any failure). */
  loadSelection() {
    try {
      const raw = localStorage.getItem(this.selectionKey);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  /** Persist the currently-checked feed URLs to localStorage. */
  saveSelection() {
    const urls = Array.from(this.shadowRoot.querySelectorAll('.feed-picker input:checked'))
      .map(cb => cb.value);
    try { localStorage.setItem(this.selectionKey, JSON.stringify(urls)); }
    catch { /* storage unavailable / full — selection just won't persist */ }
  }

  /** Fetch a source into `_cache` once; failures cache as empty. */
  async ensureSource(src) {
    if (this._cache.has(src.url)) return;
    try {
      this._cache.set(src.url, await getFeedItems(src.url, { proxy: this.proxy }));
    } catch (e) {
      this._cache.set(src.url, []);
      console.warn(`[sol-feed] ${src.url}: ${e.message}`);
    }
  }

  /** Live-update handler for a source checkbox. */
  async toggleSource(src, checked, grid) {
    if (checked && !this._cache.has(src.url)) {
      grid.setAttribute('aria-busy', 'true');
      this.setStatus(`Loading ${src.label}…`);
      await this.ensureSource(src);
      grid.setAttribute('aria-busy', 'false');
    }
    this.renderGrid(grid);
  }

  /** Re-render the news grid from whichever sources are currently ticked. */
  renderGrid(grid) {
    const urls = Array.from(
      this.shadowRoot.querySelectorAll('.feed-picker input:checked')
    ).map(cb => cb.value);

    const articles = [];
    for (const url of urls) articles.push(...(this._cache.get(url) || []));
    shuffle(articles);

    if (!articles.length) {
      const empty = document.createElement('div');
      empty.className = 'sol-feed-empty';
      empty.textContent = urls.length
        ? 'No articles from the selected sources'
        : 'Select a source to see articles';
      grid.replaceChildren(empty);
    } else {
      grid.replaceChildren(...articles.map(it => this.newsCard(it)));
    }
    this.setStatus('');
  }

  /** Build one news card — an image link with a reveal-on-focus overlay. */
  newsCard(it) {
    const a = document.createElement('a');
    a.className = 'feed-card';
    a.href = it.link || '#';
    a.addEventListener('click', ev => { if (openInReader(a.href)) ev.preventDefault(); });
    // The visible title + overlay would make a very long accessible name;
    // pin the link's name to the article title instead.
    a.setAttribute('aria-label', it.title);

    if (it.image) {
      const img = document.createElement('img');
      img.className = 'feed-card-img';
      img.src = it.image;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { img.remove(); a.classList.add('no-image'); });
      a.appendChild(img);
    } else {
      a.classList.add('no-image');
    }

    if (it.summary) {
      const overlay = document.createElement('div');
      overlay.className = 'feed-card-overlay';
      overlay.textContent = it.summary;
      a.appendChild(overlay);
    }

    const title = document.createElement('div');
    title.className = 'feed-card-title';
    title.textContent = it.title;
    if (it.source) {
      const src = document.createElement('span');
      src.className = 'feed-card-source';
      src.textContent = it.source;
      title.appendChild(src);
    }
    a.appendChild(title);
    return a;
  }
}

define('sol-feed', SolFeed);

export { SolFeed };
