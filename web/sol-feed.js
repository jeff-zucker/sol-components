/**
 * <sol-feed> — RSS / Atom feed viewer web component.
 *
 * A single shadow-DOM element with three layouts, chosen by the `view`
 * attribute:
 *
 *   view="feed"   — render one feed (the `source` URL) as a link list.
 *   view="topic"  — sources picker scoped to one topic and its
 *                   `bk:subTopicOf` subtree; a side list of feeds, and
 *                   clicking one shows its articles in the content pane.
 *   view="all"    — Google-News-like grid scoped to a root topic and its
 *                   full subtree; tick which sources you want and their
 *                   articles are merged, randomised, and shown as image
 *                   cards with a description that reveals on hover or
 *                   keyboard focus.
 *   view="topics" — a "newsstand": one column per topic in the subtree,
 *                   each listing that topic's sources. Clicking a source
 *                   shows its articles as image cards (same cards as
 *                   `all`) in a grid below the columns.
 *
 * For `topic`, `topics` and `all` the `source` must include a `#TopicName` fragment
 * pointing at a `bk:Topic` in an RDF/Turtle bookmark document (see
 * data/feeds.ttl). Feeds whose `bk:hasTopic` is outside the subtree or
 * isn't a defined topic show up under a catch-all "Other" group.
 *
 * Attributes:
 *   view              feed | topic | all   (default: feed)
 *   source            feed URL (feed) or "<rdfFile>#<Topic>" (topic / all)
 *   proxy             CORS proxy pattern, prepended to cross-origin fetches
 *   default-selected  (view="all" only) comma- or pipe-separated list
 *                     of feed labels / URL substrings to auto-check
 *                     on the user's first visit (when localStorage is
 *                     empty). Case-insensitive substring match against
 *                     each feed's label OR URL. Falls back to checking
 *                     the first feed when no item matches.
 *   select-first      (view="topics" only) boolean — when present and no
 *                     source is remembered, auto-select the first source
 *                     and load its articles (a cold start lands on real
 *                     articles). Off by default, so mounting stays
 *                     network-free until the user picks a source.
 *
 * @element sol-feed
 *
 * @example
 *   <sol-feed view="feed"  source="https://example.org/rss.xml"></sol-feed>
 *   <sol-feed view="topic" source="data/feeds.ttl#News"></sol-feed>
 *   <sol-feed view="all"   source="data/feeds.ttl#Feeds"></sol-feed>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as FEED_CSS, sheet as FEED_SHEET } from './styles/sol-feed-css.js';
import {
  renameTopicEdit, recategorizeEdit, addFeedEdit, deleteToBinEdit, restoreEdit,
  setPositionsEdit, mintFeedUri, patchDoc, purgeFeed, binUriFor,
} from './utils/feed-edit.js';
import { getFeedItems, parseSourceList } from './utils/feed-fetch.js';
import { getDefault, onDefaultChange } from '../core/defaults.js';

/** Human-readable date, or '' when the string is missing / unparseable. */
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Parse a pubDate string to milliseconds; missing / unparseable → 0. */
function dateMs(s) {
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Build a `.sol-feed-empty` placeholder with the given message. */
function emptyEl(msg) {
  const div = document.createElement('div');
  div.className = 'sol-feed-empty';
  div.textContent = msg;
  return div;
}

/** Sanitise a label into a URI-safe fragment (alnum + _.-). */
function sanitizeFragment(label) {
  return label.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '') || 'topic';
}

/** Standard RDF / SKOS / bookmark predicates and types used for writing. */
const W = {
  rdfType: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  bkTopic: 'http://www.w3.org/2002/01/bookmark#Topic',
  bkSubTopicOf: 'http://www.w3.org/2002/01/bookmark#subTopicOf',
  bkHasTopic: 'http://www.w3.org/2002/01/bookmark#hasTopic',
  bkRecalls: 'http://www.w3.org/2002/01/bookmark#recalls',
  uiLink: 'http://www.w3.org/ns/ui#Link',
  uiLabel: 'http://www.w3.org/ns/ui#label',
  skosConcept: 'http://www.w3.org/2004/02/skos/core#Concept',
  skosBroader: 'http://www.w3.org/2004/02/skos/core#broader',
  skosPrefLabel: 'http://www.w3.org/2004/02/skos/core#prefLabel',
  dctTitle: 'http://purl.org/dc/terms/title',
  dctSubject: 'http://purl.org/dc/terms/subject',
  rssChannel: 'http://purl.org/rss/1.0/channel',
};

/**
 * Re-fetch the bookmark/SKOS file, add the supplied (s,p,o) triples to its
 * rdflib store, serialise it back to Turtle, and PUT it to the same URL.
 * Returns true on success, throws on failure (the caller surfaces the
 * error in the UI). For files served read-only (static dev servers, plain
 * GitHub Pages, etc.) the PUT will fail with HTTP 405 and the caller
 * should treat that as expected.
 */
async function writeRdfAdditions(fileUri, triples) {
  const { rdf } = await import('../core/rdf.js');
  if (!rdf.isReady()) throw new Error('rdflib is not available');
  // Route both the GET and the PUT through solFetch so a protected
  // source triggers the chrome's login flow + auto-retry instead of
  // a silent 401.
  const { solFetch } = await import('../core/auth-fetch.js');

  const resp = await solFetch(fileUri);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching source`);
  const text = await resp.text();

  const store = rdf.graph();
  rdf.parse(text, store, fileUri, 'text/turtle');

  for (const [s, p, o] of triples) {
    store.add(rdf.sym(s), rdf.sym(p), o.literal ? rdf.literal(o.value) : rdf.sym(o));
  }

  // rdflib.serialize is sync when no callback is supplied; allow async fallback.
  let serialized;
  try {
    serialized = rdf.serialize(null, store, fileUri, 'text/turtle');
  } catch {
    serialized = await new Promise((resolve, reject) => {
      rdf.serialize(null, store, fileUri, 'text/turtle', (err, out) => {
        if (err) reject(err); else resolve(out);
      });
    });
  }

  const put = await solFetch(fileUri, {
    method: 'PUT',
    headers: { 'content-type': 'text/turtle' },
    body: serialized,
  });
  if (!put.ok) throw new Error(`HTTP ${put.status} saving to source`);
  return true;
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
  /**
   * sol-feed's own picker IS the editor — adding/removing feeds and
   * toggling which sources are shown happens inline in the rendered
   * UI. `{ inline: true }` signals to discovery surfaces (dk-settings)
   * and to the editor-self gear helper to skip this component.
   */
  static get editor() { return { inline: true }; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    /** feed URL → parsed items, populated lazily by the news view. */
    this._cache = new Map();
    /** current topics-view mode ('topics' | 'bin') — survives reload so a
     *  reload racing a viewDeleted click can't clobber the open bin. */
    this._view = 'topics';
    /** monotonic render token; async renders bail if superseded. */
    this._nav = 0;
  }

  async connectedCallback() {
    // Reset shadow root on re-entry (e.g. reload() after sol-default change).
    this.shadowRoot.adoptedStyleSheets = [];
    this.shadowRoot.innerHTML = '';

    const view = (this.getAttribute('view') || 'feed').toLowerCase();
    this.proxy = this.getAttribute('proxy') || getDefault('proxy') || '';
    this.source = this.getAttribute('source') || '';

    // Re-fetch when <sol-default>'s proxy changes at runtime. Cleaned up
    // in disconnectedCallback. Guard so reconnects don't stack handlers.
    if (!this._unsubDefaults) {
      this._unsubDefaults = onDefaultChange((name) => {
        if (name === 'proxy') this.reload().catch(() => {});
      });
    }

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
      if (view === 'topic') await this.renderTopic();
      // Re-entering while the deleted bin is open (e.g. a reload races a
      // viewDeleted click) must re-render the BIN, not clobber it with the
      // normal columns — the bin is the user's current view.
      else if (view === 'topics') await (this._view === 'bin' ? this._openBin() : this.renderTopics());
      else if (view === 'all') await this.renderAll();
      else await this.renderFeed();
    } catch (e) {
      this.setStatus(e.message || String(e), true);
    }
  }

  /**
   * Re-read attributes (including the proxy fallback from <sol-default>)
   * and rebuild the shadow DOM + refetch. Public hook for external
   * editors and for default-change reactions.
   */
  async reload() {
    this._cache?.clear();
    await this.connectedCallback();
  }

  disconnectedCallback() {
    if (this._unsubDefaults) { this._unsubDefaults(); this._unsubDefaults = null; }
    if (this._scrollIO) { this._scrollIO.disconnect(); this._scrollIO = null; }
  }

  /** Update the polite live region. Pass `isError` to colour it. */
  setStatus(msg, isError = false) {
    this._status.textContent = msg || '';
    this._status.style.display = msg ? '' : 'none';
    if (isError) this._status.setAttribute('data-error', '');
    else this._status.removeAttribute('data-error');
  }

  /** Resolve the configured feed list from the RDF bookmark source. */
  async resolveSources() {
    return parseSourceList(this.source, { proxy: this.proxy });
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
      a.textContent = it.title || '(untitled)';
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

  /* ── view: feed ───────────────────────────────────────────────────── */

  async renderFeed() {
    if (!this.source) { this.setStatus('No feed source specified', true); return; }
    this.setStatus('Loading feed…');
    const items = await getFeedItems(this.source, { proxy: this.proxy });
    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list feed';
    wrap.appendChild(this.itemsList(items));
    this._root.replaceChildren(wrap);
    this.setStatus(items.length ? '' : 'Feed has no items');
  }

  /* ── view: topic ──────────────────────────────────────────────────── */

  async renderTopic() {
    // Build the layout first so loading messages land in the article area
    // rather than the status strip above the source pane.
    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list topic';

    const sourcesNav = document.createElement('nav');
    sourcesNav.className = 'feed-sources';
    sourcesNav.setAttribute('aria-label', 'Feeds');

    let itemsUl = document.createElement('ul');
    itemsUl.className = 'feed-items';
    itemsUl.setAttribute('aria-label', 'Articles');

    /** Replace the article list with a single message line — used for
     *  loading and error states so they show where the articles will. */
    const showItemsMessage = (msg, isError = false) => {
      const fresh = document.createElement('ul');
      fresh.className = 'feed-items';
      fresh.setAttribute('aria-label', 'Articles');
      const li = document.createElement('li');
      li.className = 'sol-feed-empty';
      if (isError) li.setAttribute('data-error', '');
      li.textContent = msg;
      fresh.appendChild(li);
      itemsUl.replaceWith(fresh);
      itemsUl = fresh;
    };

    showItemsMessage('Loading feeds…');
    wrap.append(sourcesNav, itemsUl);
    this._root.replaceChildren(wrap);

    let sources;
    try {
      sources = await this.resolveSources();
    } catch (e) {
      showItemsMessage(e.message || String(e), true);
      return;
    }
    if (!sources.length) {
      showItemsMessage('No feeds found', true);
      return;
    }

    const allLinks = [];

    const selectSource = async (src, anchor) => {
      allLinks.forEach(a => {
        const on = a === anchor;
        a.classList.toggle('selected', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      showItemsMessage(`Loading ${src.label}…`);
      try {
        const items = await getFeedItems(src.url, { proxy: this.proxy });
        const fresh = this.itemsList(items);
        itemsUl.replaceWith(fresh);
        itemsUl = fresh;
      } catch (e) {
        showItemsMessage(`${src.label}: ${e.message}`, true);
      }
    };

    // Flat source list — topic view is scoped to one subtree, so the
    // per-topic headings are omitted by user request.
    const sourceListUl = document.createElement('ul');
    sourceListUl.className = 'feed-source-list';
    for (const src of sources) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'feed-link';
      a.href = src.url;
      a.textContent = src.label;
      a.addEventListener('click', ev => { ev.preventDefault(); selectSource(src, a); });
      allLinks.push(a);
      li.appendChild(a);
      sourceListUl.appendChild(li);
    }
    sourcesNav.appendChild(sourceListUl);

    selectSource(sources[0], allLinks[0]);
  }

  /* ── view: all ────────────────────────────────────────────────────── */

  async renderAll() {
    this.setStatus('Loading feeds…');
    const sources = await this.resolveSources();
    if (!sources.length) { this.setStatus('No feeds found', true); return; }

    const remembered = this.loadSelection();

    // Top bar: one button per selected source (flush left) + the gear
    // toggle pushed to the right edge.
    const bar = document.createElement('div');
    bar.className = 'feed-top-bar';
    // Expose as a shadow part so host pages can style the top-bar
    // strip (source-pills + gear) via ::part(top-bar).
    bar.setAttribute('part', 'top-bar');
    const sourceButtons = document.createElement('div');
    sourceButtons.className = 'feed-source-buttons';
    sourceButtons.setAttribute('role', 'tablist');
    sourceButtons.setAttribute('aria-label', 'Selected feeds');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'feed-picker-toggle';
    toggle.textContent = '⚙';
    const pickerId = `sol-feed-picker-${Math.random().toString(36).slice(2, 8)}`;
    toggle.setAttribute('aria-controls', pickerId);
    bar.append(sourceButtons, toggle);

    const picker = document.createElement('div');
    picker.className = 'feed-picker';
    picker.id = pickerId;

    const articles = document.createElement('div');
    articles.className = 'feed-articles';
    // Expose as a shadow part so host pages can style the article
    // grid background / padding / etc. via ::part(articles) without
    // having to wrap the whole component.
    articles.setAttribute('part', 'articles');
    articles.setAttribute('aria-label', 'Articles');

    /** Render one feed's items into the articles container, newest first. */
    const renderArticles = (items) => {
      if (!items.length) {
        articles.replaceChildren(emptyEl('No articles'));
        return;
      }
      const sorted = items.slice().sort(
        (a, b) => dateMs(b.pubDate) - dateMs(a.pubDate),
      );
      articles.replaceChildren(...sorted.map(it => this.newsCard(it)));
    };

    /** Make the given source the active tab — highlight its button,
     *  fetch its items if needed, and render them. */
    const selectSource = async (src) => {
      [...sourceButtons.children].forEach(btn => {
        const on = btn.dataset.feedUrl === src.url;
        btn.classList.toggle('selected', on);
        if (on) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
      });
      this.setStatus(`Loading ${src.label}…`);
      try {
        if (!this._cache.has(src.url)) await this.ensureSource(src);
        renderArticles(this._cache.get(src.url) || []);
        this.setStatus('');
      } catch (e) {
        this.setStatus(`${src.label}: ${e.message}`, true);
      }
    };

    const addSourceButton = (src) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'feed-source-btn';
      btn.dataset.feedUrl = src.url;
      btn.textContent = src.label;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => selectSource(src));
      sourceButtons.appendChild(btn);
      return btn;
    };

    /** Currently-checked sources in `bk:hasTopic` order — every group
     *  from groupByTopic, only the ones with a ticked checkbox. */
    const chosenInTopicOrder = () => {
      const checked = new Set(
        [...picker.querySelectorAll('input:checked')].map(cb => cb.value),
      );
      const out = [];
      for (const group of this.groupByTopic(sources)) {
        for (const src of group.feeds) {
          if (checked.has(src.url)) out.push(src);
        }
      }
      return out;
    };

    /** Rebuild the top-bar buttons from scratch, in topic order. The caller
     *  is responsible for re-applying the .selected highlight afterwards. */
    const rebuildSourceButtons = () => {
      sourceButtons.replaceChildren();
      for (const src of chosenInTopicOrder()) addSourceButton(src);
    };

    /** Picker checkbox change — rebuild the top-bar in topic order, then
     *  point the selection at either the newly-ticked source or the new
     *  topic-first when the previously-selected one has just been removed. */
    const onPickerChange = async (src, checked) => {
      this.saveSelection();
      const prevSelectedUrl = sourceButtons.querySelector('.feed-source-btn.selected')
        ?.dataset.feedUrl;
      rebuildSourceButtons();
      if (checked) {
        await selectSource(src);
      } else if (prevSelectedUrl === src.url) {
        const firstBtn = sourceButtons.querySelector('.feed-source-btn');
        if (firstBtn) {
          const fallback = sources.find(s => s.url === firstBtn.dataset.feedUrl);
          if (fallback) await selectSource(fallback);
        } else {
          articles.replaceChildren(emptyEl('Select a feed to see articles'));
          this.setStatus('');
        }
      } else if (prevSelectedUrl) {
        const sameBtn = [...sourceButtons.children]
          .find(b => b.dataset.feedUrl === prevSelectedUrl);
        if (sameBtn) sameBtn.classList.add('selected');
      }
    };

    // Two columns: left is the topic fieldsets the user ticks; right is
    // the "add topic / add feed" forms that mint new triples (attempted
    // PUT-back to the RDF source).
    const pickerLeft = document.createElement('div');
    pickerLeft.className = 'feed-picker-left';

    const pickerRight = document.createElement('div');
    pickerRight.className = 'feed-picker-right';

    let cbIdx = 0;
    /** fieldset per topic label, keyed by topic label so add-source can
     *  insert a new checkbox into the right group. */
    const fieldsetByTopic = new Map();
    const buildFieldset = (topicLabel) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'feed-topic';
      const legend = document.createElement('legend');
      legend.textContent = topicLabel || 'Sources';
      fieldset.appendChild(legend);
      fieldsetByTopic.set(topicLabel || '', fieldset);
      pickerLeft.appendChild(fieldset);
      return fieldset;
    };
    const addCheckbox = (fieldset, src) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `sol-feed-src-${cbIdx++}`;
      cb.value = src.url;
      cb.checked = remembered.includes(src.url);
      cb.addEventListener('change', () => onPickerChange(src, cb.checked));
      label.append(cb, document.createTextNode(' ' + src.label));
      fieldset.appendChild(label);
      return cb;
    };
    for (const group of this.groupByTopic(sources)) {
      const fieldset = buildFieldset(group.topic);
      for (const src of group.feeds) addCheckbox(fieldset, src);
    }

    // ── Add-topic / add-source forms ───────────────────────────────────
    // Topic URIs come from the RDF parse (attached by parseSourceList).
    /** @type {Array<{uri:string,label:string}>} */
    const topicList = (sources.topics || []).slice();
    const ontology = sources.ontology || 'bookmark';
    const fileUri = sources.fileUri || this.source.split('#')[0];
    const focusUri = sources.focusUri || this.source;
    const status = document.createElement('p');
    status.className = 'feed-picker-note';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const refreshTopicSelects = () => {
      // Feeds (the root concept scheme / focus topic) is never an option —
      // new feeds attach to a leaf topic.
      const options = topicList.filter(t => t.uri !== focusUri);
      for (const sel of pickerRight.querySelectorAll('[data-role="topic-select"]')) {
        const current = sel.value;
        sel.replaceChildren(...options.map(t => {
          const opt = document.createElement('option');
          opt.value = t.uri;
          opt.textContent = t.label;
          return opt;
        }));
        if ([...sel.options].some(o => o.value === current)) sel.value = current;
      }
    };

    const topicForm = document.createElement('form');
    topicForm.className = 'feed-add-wrap';
    topicForm.innerHTML = `
      <fieldset class="feed-add-form">
        <legend>Add topic</legend>
        <label>Label
          <input name="label" required>
        </label>
        <button type="submit">Add topic</button>
      </fieldset>
    `;

    const sourceForm = document.createElement('form');
    sourceForm.className = 'feed-add-wrap';
    sourceForm.innerHTML = `
      <fieldset class="feed-add-form">
        <legend>Add feed</legend>
        <label>Feed URL
          <input name="url" type="url" required placeholder="https://example.org/rss.xml">
        </label>
        <label>Label
          <input name="label" required>
        </label>
        <label>Topic
          <select name="topic" data-role="topic-select"></select>
        </label>
        <button type="submit">Add feed</button>
      </fieldset>
    `;

    pickerRight.append(topicForm, sourceForm, status);
    refreshTopicSelects();

    /** Apply an addition: update the local DOM immediately, then attempt
     *  to persist the new triples back to the source file. */
    const applyAddition = async ({ kind, src, topic, triples }) => {
      // Local UI update first — the user sees the addition even if
      // the PUT fails (which is normal for read-only static demos).
      if (kind === 'topic') {
        topicList.push(topic);
        refreshTopicSelects();
        if (!fieldsetByTopic.has(topic.label)) buildFieldset(topic.label);
      } else if (kind === 'source' && src) {
        let fieldset = fieldsetByTopic.get(src.topic);
        if (!fieldset) fieldset = buildFieldset(src.topic);
        const cb = addCheckbox(fieldset, src);
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      }
      // Try to persist.
      status.removeAttribute('data-error');
      status.textContent = 'Saving…';
      try {
        await writeRdfAdditions(fileUri, triples);
        status.textContent = 'Saved to feed library.';
      } catch (e) {
        status.setAttribute('data-error', '');
        status.textContent = `Added locally; save failed (${e.message}).`;
      }
    };

    topicForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = new FormData(topicForm);
      const labelVal = String(data.get('label') || '').trim();
      // All new topics nest under the focus (Feeds) — no user choice.
      const parentUri = focusUri;
      if (!labelVal) return;
      // Mint a URI for the new topic; ensure uniqueness.
      let frag = sanitizeFragment(labelVal);
      let uri = `${fileUri}#${frag}`;
      let n = 2;
      while (topicList.some(t => t.uri === uri)) uri = `${fileUri}#${frag}_${n++}`;
      const lit = { literal: true, value: labelVal };
      const triples = ontology === 'skos'
        ? [
            [uri, W.rdfType, W.skosConcept],
            [uri, W.skosPrefLabel, lit],
            [uri, W.skosBroader, parentUri],
          ]
        : [
            [uri, W.rdfType, W.bkTopic],
            [uri, W.uiLabel, lit],
            [uri, W.bkSubTopicOf, parentUri],
          ];
      await applyAddition({ kind: 'topic', topic: { uri, label: labelVal }, triples });
      topicForm.reset();
    });

    sourceForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = new FormData(sourceForm);
      const url = String(data.get('url') || '').trim();
      const labelVal = String(data.get('label') || '').trim();
      const topicUri = String(data.get('topic') || '');
      if (!url || !labelVal || !topicUri) return;
      const topicLabel = (topicList.find(t => t.uri === topicUri) || {}).label || '';
      const lit = { literal: true, value: labelVal };
      // New feed: add as the URL itself plus an `a rss:channel` typing.
      const triples = [[url, W.rdfType, W.rssChannel]];
      if (ontology === 'skos') {
        triples.push([url, W.dctTitle, lit]);
        triples.push([url, W.dctSubject, topicUri]);
      } else {
        // Bookmark: also create a ui:Link proxy keyed off a derived id.
        const proxy = `${fileUri}#feed-${sanitizeFragment(labelVal)}-${Date.now().toString(36)}`;
        triples.push([proxy, W.rdfType, W.uiLink]);
        triples.push([proxy, W.uiLabel, lit]);
        triples.push([proxy, W.bkRecalls, url]);
        triples.push([proxy, W.bkHasTopic, topicUri]);
      }
      const newSrc = { label: labelVal, url, topic: topicLabel, topicUri };
      sources.push(newSrc);
      await applyAddition({ kind: 'source', src: newSrc, triples });
      sourceForm.reset();
    });

    picker.append(pickerLeft, pickerRight);

    const setExpanded = open => {
      picker.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Hide feeds' : 'Show feeds');
    };
    toggle.addEventListener('click', () => setExpanded(picker.hidden));
    setExpanded(false);

    if (!remembered.length) {
      // First visit on this page — nothing in localStorage yet.
      // Honour an explicit `default-selected` attribute: a comma- or
      // pipe-separated list of feed labels (or any unique substring
      // of a label / URL). Matching is case-insensitive and uses
      // substring containment so "guardian" picks "The Guardian" and
      // "boingboing.net" works just as well. Falls back to the first
      // checkbox when the attribute is absent or matches nothing.
      const defaults = (this.getAttribute('default-selected') || '')
        .split(/[|,]/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      let matched = false;
      if (defaults.length) {
        for (const cb of picker.querySelectorAll('input[type=checkbox]')) {
          const src = sources.find(s => s.url === cb.value);
          if (!src) continue;
          const hay = `${(src.label || '').toLowerCase()} ${(src.url || '').toLowerCase()}`;
          if (defaults.some(d => hay.includes(d))) {
            cb.checked = true;
            matched = true;
          }
        }
      }
      if (!matched) {
        const firstCb = picker.querySelector('input[type=checkbox]');
        if (firstCb) firstCb.checked = true;
      }
    }

    this._root.replaceChildren(bar, picker, articles);

    const chosen = chosenInTopicOrder();
    rebuildSourceButtons();
    if (chosen.length) {
      articles.setAttribute('aria-busy', 'true');
      await Promise.all(chosen.map(s => this.ensureSource(s)));
      articles.setAttribute('aria-busy', 'false');
      this.saveSelection();
      await selectSource(chosen[0]);
    } else {
      articles.replaceChildren(emptyEl('Select a feed to see articles'));
      this.setStatus('');
    }
  }

  /* ── view: topics ─────────────────────────────────────────────────── */

  /**
   * "Newsstand" view: one column per topic in the source subtree, each
   * listing that topic's sources. Clicking a source loads its articles
   * into an image-card grid below the columns — the same cards as the
   * `all` view (so `newsCard` wires the shared reader window for free).
   * No source is auto-selected, so mounting issues no feed network calls
   * until the user picks one.
   */
  async renderTopics() {
    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list topics';

    const columns = document.createElement('div');
    columns.className = 'feed-topic-columns';
    columns.setAttribute('role', 'tablist');
    columns.setAttribute('aria-label', 'Topics');

    const articles = document.createElement('div');
    articles.className = 'feed-articles';
    articles.setAttribute('part', 'articles');
    articles.setAttribute('aria-label', 'Articles');

    wrap.append(columns, articles);
    this._root.replaceChildren(wrap);

    /** Loading / error / empty messages land in the articles area (where
     *  the cards will appear) rather than the status strip above the
     *  topic columns. */
    const showMsg = (text, isError = false) => {
      const el = emptyEl(text);
      if (isError) el.setAttribute('data-error', '');
      articles.replaceChildren(el);
    };

    if (!this.source) { showMsg('No feed source specified', true); return; }

    showMsg('Loading feeds…');
    let sources;
    try {
      sources = await this.resolveSources();
    } catch (e) {
      showMsg(e.message || String(e), true);
      return;
    }
    if (!sources.length) { showMsg('No feeds found', true); return; }

    /** Every source anchor (to clear others' highlight) plus src↔anchor
     *  pairs (to restore the remembered selection on mount). */
    const allLinks = [];
    const entries = [];

    /** Render one source's items into the grid, newest first. */
    const renderArticles = (items) => {
      if (!items.length) { articles.replaceChildren(emptyEl('No articles')); return; }
      const sorted = items.slice().sort((a, b) => dateMs(b.pubDate) - dateMs(a.pubDate));
      articles.replaceChildren(...sorted.map(it => this.newsCard(it)));
    };

    const selectSource = async (src, anchor) => {
      allLinks.forEach(a => {
        const on = a === anchor;
        a.classList.toggle('selected', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      try { localStorage.setItem(this.topicsSelectionKey, src.url); } catch {}
      articles.setAttribute('aria-busy', 'true');
      showMsg(`Loading ${src.label}…`);
      try {
        if (!this._cache.has(src.url)) await this.ensureSource(src);
        renderArticles(this._cache.get(src.url) || []);
      } catch (e) {
        showMsg(`${src.label}: ${e.message}`, true);
      } finally {
        articles.setAttribute('aria-busy', 'false');
      }
    };

    // Editing context (used by the edit helpers below) + the column set.
    const editable = this.editable;
    this._fileUri = sources.fileUri;
    this._catalogUri = sources.catalogUri;
    this._binUri = binUriFor(sources.fileUri);
    this._allTopics = (sources.topics || []).filter(t => t.uri !== sources.focusUri);
    this._allFeedUris = sources.map(f => f.uri).filter(Boolean);

    // Non-editable: one column per topic that HAS feeds (first-seen order).
    // Editable: one column per topic in the scheme — including empty ones —
    // so you can rename / add anywhere; carry the topic IRI for edits.
    let groups;
    if (editable) {
      const byUri = new Map();
      for (const f of sources) (byUri.get(f.topicUri) || byUri.set(f.topicUri, []).get(f.topicUri)).push(f);
      groups = this._allTopics.map(t => ({ topic: t.label, topicUri: t.uri, feeds: byUri.get(t.uri) || [] }));
    } else {
      groups = this.groupByTopic(sources).map(g => ({ ...g, topicUri: g.feeds[0]?.topicUri }));
    }

    // Honour a saved order (schema:position); items without one keep file
    // order (stable sort). Stash per-topic ordered lists so reorder can
    // recompute positions.
    for (const g of groups) g.feeds = [...g.feeds].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
    if (editable) this._feedsByTopic = new Map(groups.map(g => [g.topicUri, g.feeds]));

    for (const group of groups) {
      const col = document.createElement('section');
      col.className = 'feed-topic-column';
      if (editable && group.topicUri) this._wireColumnDrop(col, group.topicUri);

      const head = document.createElement('h2');
      head.className = 'feed-topic-head';
      head.textContent = group.topic || 'Sources';

      if (editable && group.topicUri) {
        head.classList.add('editable');
        head.title = 'Click to rename';
        head.addEventListener('click', () => this._renameTopicInline(head, group));
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'feed-add-source';
        addBtn.textContent = '+';
        addBtn.title = `Add a feed to ${group.topic}`;
        addBtn.setAttribute('aria-label', addBtn.title);
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); this._addFeedForm(col, group); });
        const headWrap = document.createElement('div');
        headWrap.className = 'feed-topic-headwrap';
        headWrap.append(head, addBtn);
        col.appendChild(headWrap);
      } else {
        col.appendChild(head);
      }

      const list = document.createElement('ul');
      list.className = 'feed-source-list feed-topic-col-list';
      for (const src of group.feeds) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'feed-link';
        a.href = src.url;
        a.textContent = src.label;
        a.setAttribute('role', 'tab');
        a.addEventListener('click', ev => { ev.preventDefault(); selectSource(src, a); });
        allLinks.push(a);
        entries.push({ src, a });
        li.appendChild(a);
        if (editable) {
          li.classList.add('editable-row');
          this._wireSourceDrag(li, src);
          this._wireRowDrop(li, src);
          li.appendChild(this._deleteButton(src, li));
        }
        list.appendChild(li);
      }
      col.appendChild(list);
      columns.appendChild(col);
    }

    // Restore the last-selected source (and reload its articles) if it's
    // still present; otherwise prompt for a pick.
    let remembered = null;
    try { remembered = localStorage.getItem(this.topicsSelectionKey); } catch {}
    const match = remembered && entries.find(e => e.src.url === remembered);
    let selected = null;
    if (match) {
      selectSource(match.src, match.a);
      selected = match.a;
    } else if (this.hasAttribute('select-first') && entries.length) {
      // Opt-in: with nothing remembered, open the first source so a cold
      // start lands on real articles instead of a "pick a source" prompt.
      // (Off by default — keeps mounting network-free for other consumers.)
      selectSource(entries[0].src, entries[0].a);
      selected = entries[0].a;
    } else {
      showMsg('Select a source to see articles');
    }
    if (selected) this._scrollSourceIntoView(selected);
  }

  /** Bring a source anchor into view within its scrollable column. At startup
   *  the feed is usually rendered inside a still-hidden tab pane (sol-tabs
   *  keep-alive renders every pane while hidden), where scrollIntoView is a
   *  no-op for lack of a layout box. So when hidden, wait for the host to
   *  become visible (one-shot IntersectionObserver) and scroll then. */
  _scrollSourceIntoView(anchor) {
    if (!anchor) return;
    const doScroll = () => requestAnimationFrame(() => anchor.scrollIntoView({ block: 'nearest' }));
    if (this.offsetParent !== null) { doScroll(); return; }   // already visible
    this._scrollIO?.disconnect();
    this._scrollIO = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        this._scrollIO.disconnect(); this._scrollIO = null;
        doScroll();
      }
    });
    this._scrollIO.observe(this);
  }

  /* ── editing (view="topics" + the `editable` attribute) ─────────────────
   * All edits PATCH the same-origin feeds file (sparql-update) then reload so
   * the view re-renders from the saved doc. Owner-gating is the host's job
   * (it sets/clears the `editable` attribute). */

  get editable() { return this.hasAttribute('editable'); }

  /** Host hook routed from the app chrome (⋮ → "View deleted"). */
  appAction(name) {
    if (name === 'viewDeleted') return this._openBin();
  }

  /** PATCH one edit, then reload the normal view. */
  async _edit(editObj) {
    this._view = 'topics';            // a normal-view edit returns to the columns
    try {
      await patchDoc(this._fileUri, editObj);
      await this.reload();
    } catch (e) {
      this.setStatus(e.message || 'Edit failed', true);
    }
  }

  /** Replace a topic head with an inline rename input. */
  _renameTopicInline(head, group) {
    const old = group.topic;
    const input = document.createElement('input');
    input.className = 'feed-topic-rename';
    input.value = old;
    head.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const val = input.value.trim();
      if (val && val !== old) this._edit(renameTopicEdit(group.topicUri, old, val));
      else input.replaceWith(head);               // unchanged → restore
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; input.replaceWith(head); }
    });
    input.addEventListener('blur', commit);
  }

  /** Inline "add a feed to this topic" form, inserted under the topic head. */
  _addFeedForm(col, group) {
    if (col.querySelector('.feed-add-form')) return;
    const form = document.createElement('form');
    form.className = 'feed-add-form';
    const title = document.createElement('input');
    title.className = 'feed-add-input'; title.placeholder = 'Feed name'; title.required = true;
    const url = document.createElement('input');
    url.className = 'feed-add-input'; url.type = 'url'; url.placeholder = 'RSS URL'; url.required = true;
    const row = document.createElement('div'); row.className = 'feed-add-row';
    const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'primary'; ok.textContent = 'Add';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    row.append(ok, cancel);
    form.append(title, url, row);
    col.insertBefore(form, col.children[1] || null);   // after the head wrap
    title.focus();
    cancel.addEventListener('click', () => form.remove());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = title.value.trim(), u = url.value.trim();
      if (!t || !u) return;
      const feedUri = mintFeedUri(this._fileUri, t, this._allFeedUris);
      this._edit(addFeedEdit(feedUri, { title: t, url: u, topicUri: group.topicUri, catalogUri: this._catalogUri }));
    });
  }

  /** Make a source row draggable (records the dragged feed + its topic). */
  _wireSourceDrag(li, src) {
    li.draggable = true;
    li.addEventListener('dragstart', (e) => {
      this._dragFeed = { uri: src.uri, fromTopicUri: src.topicUri };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', src.uri); } catch {}
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); this._dragFeed = null; });
  }

  /** Make a topic column a drop target. Cross-topic drop = re-categorize;
   *  same-topic drop on empty column area = reorder to the end. (Row-level
   *  drops handle precise reorder and stopPropagation, so this only fires on
   *  the empty space below the list.) */
  _wireColumnDrop(col, topicUri) {
    col.addEventListener('dragover', (e) => {
      if (!this._dragFeed) return;
      e.preventDefault();
      col.classList.add('drop-target');
    });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
    col.addEventListener('drop', (e) => {
      col.classList.remove('drop-target');
      const d = this._dragFeed;
      if (!d) return;
      e.preventDefault();
      if (d.fromTopicUri === topicUri) this._reorder(topicUri, d.uri, null, false);   // → end
      else this._edit(recategorizeEdit(d.uri, d.fromTopicUri, topicUri));
    });
  }

  /** A source row as a drop target: same-topic → reorder (insert before/after
   *  by cursor position); cross-topic → re-categorize. stopPropagation keeps
   *  the column handler for empty-area drops only. */
  _wireRowDrop(li, src) {
    const before = (e) => {
      const r = li.getBoundingClientRect();
      return (e.clientY - r.top) < r.height / 2;
    };
    li.addEventListener('dragover', (e) => {
      const d = this._dragFeed;
      if (!d || d.uri === src.uri) return;
      e.preventDefault(); e.stopPropagation();
      const b = before(e);
      li.classList.toggle('drop-before', b);
      li.classList.toggle('drop-after', !b);
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
    li.addEventListener('drop', (e) => {
      const d = this._dragFeed;
      li.classList.remove('drop-before', 'drop-after');
      if (!d || d.uri === src.uri) return;
      e.preventDefault(); e.stopPropagation();
      if (d.fromTopicUri === src.topicUri) this._reorder(src.topicUri, d.uri, src.uri, before(e));
      else this._edit(recategorizeEdit(d.uri, d.fromTopicUri, src.topicUri));
    });
  }

  /** Move `draggedUri` before/after `targetUri` (or to the end when null)
   *  within a topic, then re-number schema:position for that topic. */
  _reorder(topicUri, draggedUri, targetUri, before) {
    const feeds = this._feedsByTopic?.get(topicUri) || [];
    const oldPos = {};
    feeds.forEach((f) => { if (f.position != null) oldPos[f.uri] = f.position; });
    const order = feeds.map((f) => f.uri).filter((u) => u !== draggedUri);
    let idx = targetUri ? order.indexOf(targetUri) : order.length;
    if (idx < 0) idx = order.length;
    if (!before && targetUri) idx += 1;
    order.splice(idx, 0, draggedUri);
    this._edit(setPositionsEdit(order, oldPos));
  }

  /** The ✕ delete control on a source row → asks to confirm first. */
  _deleteButton(src, li) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'feed-del';
    b.textContent = '✕';
    b.title = `Delete ${src.label}`;
    b.setAttribute('aria-label', `Delete ${src.label}`);
    b.addEventListener('click', (e) => { e.stopPropagation(); this._confirmDelete(li, src); });
    return b;
  }

  /** Inline confirm replacing the row: «Delete "X"? [Delete] [Cancel]». */
  _confirmDelete(li, src) {
    if (li.querySelector('.feed-del-confirm')) return;
    const orig = [...li.childNodes];
    li.classList.add('confirming');
    const wrap = document.createElement('div');
    wrap.className = 'feed-del-confirm';
    const q = document.createElement('span');
    q.className = 'feed-del-q';
    q.textContent = `Delete “${src.label}”?`;
    const yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'feed-del-yes'; yes.textContent = 'Delete';
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'feed-del-no'; no.textContent = 'Cancel';
    wrap.append(q, yes, no);
    li.replaceChildren(wrap);
    no.focus();
    no.addEventListener('click', () => { li.classList.remove('confirming'); li.replaceChildren(...orig); });
    yes.addEventListener('click', () => this._edit(deleteToBinEdit(src.uri, src.topicUri, this._binUri)));
  }

  /** Render the deleted bin: each deleted feed with a "restore to <topic>". */
  async _openBin() {
    this._view = 'bin';                         // sticky: a reload re-renders the bin
    const nav = ++this._nav;
    if (!this._fileUri) {                        // not rendered yet — derive
      const abs = new URL(this.source, location.href).href;
      this._fileUri = abs.split('#')[0];
      this._binUri = binUriFor(this._fileUri);
    }
    const wrap = document.createElement('div');
    wrap.className = 'sol-feed-list topics feed-bin-view';
    const bar = document.createElement('div'); bar.className = 'feed-bin-bar';
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'feed-bin-back'; back.textContent = '← Back to feeds';
    back.addEventListener('click', () => { this._view = 'topics'; this.reload(); });
    const title = document.createElement('span'); title.className = 'feed-bin-title'; title.textContent = 'Deleted feeds';
    bar.append(back, title);
    const list = document.createElement('ul'); list.className = 'feed-source-list feed-bin-list';
    wrap.append(bar, list);
    this._root.replaceChildren(wrap);

    let binFeeds = [];
    try { binFeeds = await parseSourceList(this._binUri, { proxy: this.proxy }); } catch { /* empty bin */ }
    if (nav !== this._nav) return;               // superseded by a newer navigation
    if (!binFeeds.length) {
      const li = document.createElement('li'); li.className = 'sol-feed-empty'; li.textContent = 'Nothing deleted.';
      list.appendChild(li); return;
    }
    const topics = this._allTopics || [];
    for (const src of binFeeds) {
      const li = document.createElement('li'); li.className = 'feed-bin-row';
      const name = document.createElement('span'); name.className = 'feed-bin-name'; name.textContent = src.label;
      const sel = document.createElement('select'); sel.className = 'feed-bin-restore-to'; sel.setAttribute('aria-label', 'Restore to topic');
      for (const t of topics) { const o = document.createElement('option'); o.value = t.uri; o.textContent = t.label; sel.appendChild(o); }
      const restore = document.createElement('button');
      restore.type = 'button'; restore.className = 'feed-bin-restore'; restore.textContent = 'Restore';
      restore.addEventListener('click', async () => {
        try { await patchDoc(this._fileUri, restoreEdit(src.uri, this._binUri, sel.value)); await this._openBin(); }
        catch (e) { this.setStatus(e.message, true); }
      });
      const purge = document.createElement('button');
      purge.type = 'button'; purge.className = 'feed-bin-purge'; purge.textContent = 'Delete forever';
      purge.addEventListener('click', () => this._confirmPurge(li, src));
      li.append(name, sel, restore, purge);
      list.appendChild(li);
    }
  }

  /** Inline confirm for a PERMANENT delete from the bin (no undo). */
  _confirmPurge(li, src) {
    if (li.querySelector('.feed-del-confirm')) return;
    const orig = [...li.childNodes];
    const wrap = document.createElement('div');
    wrap.className = 'feed-del-confirm';
    const q = document.createElement('span');
    q.className = 'feed-del-q';
    q.textContent = `Permanently delete “${src.label}”? This can't be undone.`;
    const yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'feed-del-yes'; yes.textContent = 'Delete forever';
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'feed-del-no'; no.textContent = 'Cancel';
    wrap.append(q, yes, no);
    li.replaceChildren(wrap);
    no.focus();
    no.addEventListener('click', () => li.replaceChildren(...orig));
    yes.addEventListener('click', async () => {
      try { await purgeFeed(this._fileUri, src.uri, { catalogUri: this._catalogUri }); await this._openBin(); }
      catch (e) { this.setStatus(e.message, true); }
    });
  }

  /** localStorage key for the topics-view selected source (one URL). */
  get topicsSelectionKey() {
    return `sol-feed:topic-source:${this.source || location.pathname}`;
  }

  /** localStorage key for this element's all-view source selection. */
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

    // Title only — the source name is the row header, so the card just
    // shows the article title over the image (gradient scrim at the bottom).
    const title = document.createElement('div');
    title.className = 'feed-card-title';
    title.textContent = it.title || '';
    a.appendChild(title);

    return a;
  }
}

define('sol-feed', SolFeed);

export { SolFeed };
