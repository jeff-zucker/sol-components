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
 *
 * For `topic` and `all` the `source` must include a `#TopicName` fragment
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
