/**
 * feed-fetch.js — RSS / Atom fetching and parsing for <sol-feed>.
 *
 * Zero-dependency in the common path: `DOMParser` handles both the feed
 * XML and the image / plain-text extraction from item descriptions. Feed
 * content is never returned as live HTML — callers get plain strings only,
 * so there is no sanitization burden on the component.
 *
 * RDF source lists (see `parseSourceList`) are the one exception: they
 * lazily `import()` the project's rdflib wrapper, which the standalone
 * UMD build keeps external.
 */

const domParser = new DOMParser();

/**
 * Prepend a CORS proxy to a URL. The pattern may contain a literal
 * `{url}` placeholder (replaced with the encoded URL); otherwise the
 * encoded URL is appended, matching the legacy `proxy + encodeURI(...)`
 * behaviour.
 *
 * @param {string} url   the target URL
 * @param {string} proxy the proxy pattern, or falsy for a direct fetch
 * @returns {string}
 */
export function applyProxy(url, proxy) {
  if (!proxy) return url;
  if (proxy.includes('{url}')) return proxy.replace('{url}', encodeURIComponent(url));
  return proxy + encodeURI(url);
}

/** Resolve a (possibly relative) URL against the current document. */
function resolveUrl(url) {
  try { return new URL(url, document.baseURI).href; } catch { return url; }
}

/** True when `absUrl` points at a different origin than the page. */
function isCrossOrigin(absUrl) {
  try { return new URL(absUrl).origin !== location.origin; }
  catch { return false; }
}

/**
 * Fetch a feed / source-list URL, routing it through the CORS proxy only
 * when it is cross-origin. A same-origin resource (e.g. your own bookmark
 * file) is fetched directly so the proxy is never asked to relay it.
 */
function feedFetch(url, proxy) {
  const abs = resolveUrl(url);
  return fetch(isCrossOrigin(abs) ? applyProxy(abs, proxy) : abs);
}

/** Strip a wrapping `<![CDATA[ ... ]]>` and trim. */
function stripCdata(s) {
  return (s || '')
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim();
}

/** First descendant element with one of the given (qualified) tag names. */
function firstTag(el, ...tags) {
  for (const tag of tags) {
    const found = el.getElementsByTagName(tag)[0];
    if (found) return found;
  }
  return null;
}

/** Text content of the first matching child tag. */
function tagText(el, ...tags) {
  const found = firstTag(el, ...tags);
  return found ? found.textContent || '' : '';
}

/** Collapse an HTML (or CDATA-wrapped HTML) fragment to plain text. */
function htmlToText(html) {
  if (!html) return '';
  const doc = domParser.parseFromString(stripCdata(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** First `<img src>` found inside an HTML fragment, or null. */
function firstImageIn(html) {
  if (!html) return null;
  const doc = domParser.parseFromString(stripCdata(html), 'text/html');
  const img = doc.querySelector('img[src]');
  return img ? img.getAttribute('src') : null;
}

const IMG_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

/** Pick a representative image URL for an item, trying the richest
 *  feed extensions first and falling back to the description HTML. */
function pickImage(el, descHtml) {
  for (const tag of ['media:thumbnail', 'media:content']) {
    const m = el.getElementsByTagName(tag)[0];
    const u = m && m.getAttribute('url');
    if (u && (!m.getAttribute('type') || /^image\//.test(m.getAttribute('type')))) return u;
  }
  for (const enc of el.getElementsByTagName('enclosure')) {
    const type = enc.getAttribute('type') || '';
    const u = enc.getAttribute('url');
    if (u && (/^image\//.test(type) || IMG_EXT.test(u))) return u;
  }
  const itunes = el.getElementsByTagName('itunes:image')[0];
  if (itunes && itunes.getAttribute('href')) return itunes.getAttribute('href');
  return firstImageIn(descHtml);
}

/** Resolve an item link, keeping the legacy workarounds for feeds that
 *  bury the link inside CDATA / content markup. */
function pickLink(el) {
  let link = '';
  const linkEl = el.getElementsByTagName('link')[0];
  if (linkEl) {
    link = (linkEl.textContent || '').trim();
    if (!link || /\s/.test(link)) link = linkEl.getAttribute('href') || link;
  }
  if (!link || /\s/.test(link)) {
    const content = tagText(el, 'content:encoded', 'content', 'description');
    const m = content && content.match(/href=["']([^"']+)["']/i);
    if (m) link = m[1];
  }
  link = stripCdata(link);
  return link ? link.replace(/^http:/, 'https:') : '';
}

/** Parse one `<item>` / `<entry>` element into a feed-item record. */
function parseItem(el, source) {
  const rawDesc = tagText(el, 'content:encoded', 'description', 'summary', 'content');
  return {
    title:   htmlToText(tagText(el, 'title')) || '(untitled)',
    link:    pickLink(el),
    summary: htmlToText(rawDesc),
    image:   pickImage(el, rawDesc),
    pubDate: (tagText(el, 'pubDate', 'published', 'updated', 'dc:date')).trim(),
    source,
  };
}

/**
 * Fetch and parse a single RSS or Atom feed.
 *
 * @param {string} feedUri              the feed URL
 * @param {{proxy?: string}} [options]  CORS proxy pattern
 * @returns {Promise<Array<object>>}    feed-item records
 */
export async function getFeedItems(feedUri, options = {}) {
  const resp = await feedFetch(feedUri, options.proxy);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching feed`);
  const dom = domParser.parseFromString(await resp.text(), 'text/xml');
  if (dom.getElementsByTagName('parsererror').length) {
    throw new Error('Feed is not well-formed XML');
  }

  const source = htmlToText(
    tagText(dom.documentElement, 'title')
  ) || feedUri;

  let items = Array.from(dom.getElementsByTagName('item'));
  if (!items.length) items = Array.from(dom.getElementsByTagName('entry'));

  return items
    .map(el => parseItem(el, source))
    .filter(it => it.link || it.title !== '(untitled)');
}

/* ── source lists ─────────────────────────────────────────────────────── */

/* Vocabularies the source list may use — the parser accepts both the W3C
 * bookmark ontology (bk:/ui:) and SKOS (skos:/dct:) and treats them as
 * interchangeable. */
const NS = {
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ui:   'http://www.w3.org/ns/ui#',
  bk:   'http://www.w3.org/2002/01/bookmark#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dct:  'http://purl.org/dc/terms/',
};

/** Last path / fragment segment of a URI — a readable fallback label. */
const lastSegment = uri => uri.replace(/[#/]+$/, '').replace(/^.*[#/]/, '') || uri;

/** Drop feeds that repeat a URL, keeping first-seen order. */
function dedupeFeeds(feeds) {
  const seen = new Set();
  return feeds.filter(f => f.url && !seen.has(f.url) && seen.add(f.url));
}

/**
 * Parse a Turtle document and return the feed list scoped to the focus
 * topic's subtree. Accepts BOTH the W3C bookmark ontology and SKOS, in
 * either direction (broader/narrower, topConceptOf/hasTopConcept).
 *
 *   # Bookmark form
 *   <#Feeds> a bk:Topic ; ui:label "Feeds" .
 *   <#News>  a bk:Topic ; ui:label "News" ; bk:subTopicOf <#Feeds> .
 *   :00012   a ui:Link  ; ui:label "NY Times" ;
 *            bk:recalls <https://…/World.xml> ; bk:hasTopic <#News> .
 *
 *   # SKOS form
 *   <#Feeds> a skos:ConceptScheme ; skos:prefLabel "Feeds" .
 *   <#News>  a skos:Concept ; skos:prefLabel "News" ; skos:topConceptOf <#Feeds> .
 *   <https://…/World.xml> dct:title "NY Times" ; dct:subject <#News> .
 *
 * Feeds whose topic falls outside the focus subtree (or isn't a defined
 * topic) are dropped. Requires rdflib on the page.
 */
async function feedsFromRdf(fileUri, focusUri, text) {
  let rdf;
  try { ({ rdf } = await import('../../core/rdf.js')); }
  catch { throw new Error('RDF source lists need rdflib on the page'); }
  if (!rdf.isReady()) throw new Error('rdflib is not available');

  const store = rdf.graph();
  rdf.parse(text, store, fileUri, 'text/turtle');

  const sym = u => rdf.sym(u);
  const valueOf = (subj, pred) => {
    const o = store.any(subj, sym(pred), null);
    return o ? o.value : '';
  };
  /** Yield every URI-valued child of `t` across all hierarchy predicates
   *  in both ontologies, in both directions. */
  const childrenOf = function* (t) {
    const tNode = sym(t);
    // <child> rel <t>  — forward
    for (const pred of [NS.bk + 'subTopicOf', NS.skos + 'broader', NS.skos + 'topConceptOf']) {
      for (const st of store.statementsMatching(null, sym(pred), tNode)) {
        if (st.subject.termType === 'NamedNode') yield st.subject.value;
      }
    }
    // <t> rel <child>  — inverse
    for (const pred of [NS.skos + 'narrower', NS.skos + 'hasTopConcept']) {
      for (const st of store.statementsMatching(tNode, sym(pred), null)) {
        if (st.object.termType === 'NamedNode') yield st.object.value;
      }
    }
  };

  // Topic label table — any defined Topic / Concept / ConceptScheme.
  const topicLabel = new Map();
  const topicTypes = [NS.bk + 'Topic', NS.skos + 'Concept', NS.skos + 'ConceptScheme'];
  const labelPreds = [NS.ui + 'label', NS.skos + 'prefLabel'];
  for (const t of topicTypes) {
    for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(t))) {
      if (topicLabel.has(st.subject.value)) continue;
      let label = '';
      for (const p of labelPreds) {
        label = valueOf(st.subject, p);
        if (label) break;
      }
      topicLabel.set(st.subject.value, label || lastSegment(st.subject.value));
    }
  }

  // Focus subtree: focus + transitive children across both vocabularies.
  const subtree = new Set([focusUri]);
  const queue = [focusUri];
  while (queue.length) {
    const t = queue.shift();
    for (const child of childrenOf(t)) {
      if (!subtree.has(child)) { subtree.add(child); queue.push(child); }
    }
  }

  const feeds = [];

  // Bookmark feeds: ui:Link with bk:recalls / bk:hasTopic / ui:label.
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))) {
    const subj = st.subject;
    const url = valueOf(subj, NS.bk + 'recalls');
    if (!url) continue;
    const topicUri = (store.any(subj, sym(NS.bk + 'hasTopic'), null) || {}).value || '';
    if (!topicUri || !subtree.has(topicUri)) continue;
    feeds.push({
      label: valueOf(subj, NS.ui + 'label') || lastSegment(url),
      url,
      topic: topicLabel.get(topicUri) || lastSegment(topicUri),
      topicUri,
    });
  }

  // SKOS feeds: any subject with dct:subject pointing into the subtree.
  // The feed's IRI is its URL; the label is dct:title (fallback rdfs:label).
  for (const st of store.statementsMatching(null, sym(NS.dct + 'subject'), null)) {
    const subj = st.subject;
    if (subj.termType !== 'NamedNode') continue;
    const topicUri = st.object.value;
    if (!subtree.has(topicUri)) continue;
    feeds.push({
      label: valueOf(subj, NS.dct + 'title')
        || valueOf(subj, 'http://www.w3.org/2000/01/rdf-schema#label')
        || lastSegment(subj.value),
      url: subj.value,
      topic: topicLabel.get(topicUri) || lastSegment(topicUri),
      topicUri,
    });
  }

  // Topics in the focus subtree, in BFS order, with their labels — used by
  // the "add source / add topic" forms in the all view to populate select
  // dropdowns. Detect which ontology family is in use so writers can mint
  // new triples in the same shape.
  const topics = [...subtree].map(uri => ({
    uri,
    label: topicLabel.get(uri) || lastSegment(uri),
  }));
  const hasBookmark = store
    .statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.bk + 'Topic')).length > 0;

  const out = dedupeFeeds(feeds);
  Object.assign(out, {
    topics,
    fileUri,
    focusUri,
    ontology: hasBookmark ? 'bookmark' : 'skos',
  });
  return out;
}

/**
 * Resolve a `source` of the form `<rdfFile>#<Topic>` into the feed list
 * scoped to that topic's `bk:subTopicOf` subtree. The fragment is required
 * — without it the function throws.
 *
 * @param {string} sourceUri            `<rdfFile>#<TopicName>`
 * @param {{proxy?: string}} [options]  CORS proxy pattern (only applied
 *                                      when the file is cross-origin)
 * @returns {Promise<Array<{label:string,url:string,topic:string}>>}
 */
export async function parseSourceList(sourceUri, { proxy } = {}) {
  const abs = resolveUrl(sourceUri || '');
  const hashIdx = abs.indexOf('#');
  if (hashIdx === -1) {
    throw new Error(
      'A topic IRI is required for view="topic" / "all" — e.g. source="feeds.ttl#News"',
    );
  }
  const fileUri = abs.slice(0, hashIdx);
  const resp = await feedFetch(fileUri, proxy);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching source list`);
  return feedsFromRdf(fileUri, abs, await resp.text());
}

/**
 * Like {@link parseSourceList}, but returns the **nested** topic tree rooted
 * at the focus topic rather than a flat source list. `parseSourceList`
 * collapses every leaf onto its immediate topic, which loses the upper
 * grouping tiers; <sol-gallery> needs the full hierarchy (e.g. the
 * Art / Life groups above each image sub-topic).
 *
 * Each node is `{ uri, label, topics: TreeNode[], collections: {label,url}[] }`.
 * Leaves are `a ui:Link` with `bk:recalls` (the URL), `bk:hasTopic` (their
 * topic), and `ui:label`. Subtree membership follows `bk:subTopicOf`
 * (and the SKOS equivalents, for parity with parseSourceList).
 *
 * @param {string} sourceUri            `<rdfFile>#<TopicName>`
 * @param {{proxy?: string}} [options]
 * @returns {Promise<{uri:string,label:string,topics:Array,collections:Array}>}
 */
export async function parseBookmarkTree(sourceUri, { proxy } = {}) {
  const abs = resolveUrl(sourceUri || '');
  const hashIdx = abs.indexOf('#');
  if (hashIdx === -1) {
    throw new Error('A topic IRI is required — e.g. source="images.ttl#Images"');
  }
  const fileUri = abs.slice(0, hashIdx);
  const resp = await feedFetch(fileUri, proxy);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching source list`);

  let rdf;
  try { ({ rdf } = await import('../../core/rdf.js')); }
  catch { throw new Error('RDF source lists need rdflib on the page'); }
  if (!rdf.isReady()) throw new Error('rdflib is not available');

  const store = rdf.graph();
  rdf.parse(await resp.text(), store, fileUri, 'text/turtle');
  const sym = u => rdf.sym(u);
  const valueOf = (subj, pred) => {
    const o = store.any(subj, sym(pred), null);
    return o ? o.value : '';
  };

  // Topic labels (bk:Topic / skos), preferring ui:label then skos:prefLabel.
  const topicLabel = new Map();
  for (const t of [NS.bk + 'Topic', NS.skos + 'Concept', NS.skos + 'ConceptScheme']) {
    for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(t))) {
      if (topicLabel.has(st.subject.value)) continue;
      const label = valueOf(st.subject, NS.ui + 'label')
        || valueOf(st.subject, NS.skos + 'prefLabel')
        || lastSegment(st.subject.value);
      topicLabel.set(st.subject.value, label);
    }
  }

  // Direct child topics of a topic URI (subTopicOf + SKOS, both directions).
  const childTopics = (uri) => {
    const node = sym(uri);
    const out = [];
    for (const pred of [NS.bk + 'subTopicOf', NS.skos + 'broader', NS.skos + 'topConceptOf']) {
      for (const st of store.statementsMatching(null, sym(pred), node)) {
        if (st.subject.termType === 'NamedNode' && topicLabel.has(st.subject.value)) {
          out.push(st.subject.value);
        }
      }
    }
    for (const pred of [NS.skos + 'narrower', NS.skos + 'hasTopConcept']) {
      for (const st of store.statementsMatching(node, sym(pred), null)) {
        if (st.object.termType === 'NamedNode' && topicLabel.has(st.object.value)) {
          out.push(st.object.value);
        }
      }
    }
    return out;
  };

  // Collections (ui:Link leaves) grouped by their bk:hasTopic, in file order.
  const byTopic = new Map();
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))) {
    const subj = st.subject;
    const url = valueOf(subj, NS.bk + 'recalls');
    const topicUri = (store.any(subj, sym(NS.bk + 'hasTopic'), null) || {}).value || '';
    if (!url || !topicUri) continue;
    if (!byTopic.has(topicUri)) byTopic.set(topicUri, []);
    byTopic.get(topicUri).push({ label: valueOf(subj, NS.ui + 'label') || lastSegment(url), url });
  }

  // Build the tree depth-first, guarding against cycles.
  const seen = new Set();
  const build = (uri) => {
    seen.add(uri);
    return {
      uri,
      label: topicLabel.get(uri) || lastSegment(uri),
      collections: byTopic.get(uri) || [],
      topics: childTopics(uri).filter(c => !seen.has(c)).map(build),
    };
  };
  return build(abs);
}

/* ── schema:ItemList readers ──────────────────────────────────────────── */

const SCHEMA = 'http://schema.org/';
const HYDRA  = 'http://www.w3.org/ns/hydra/core#';

/**
 * Parse a Turtle document and return the engines in `<listUri>`'s
 * `schema:itemListElement` set, sorted by `schema:position` (items
 * without a position fall to the end, ties resolved by first-seen
 * triple order).
 *
 *   <#SearchEngines> a schema:ItemList ;
 *     schema:itemListElement :ddg , :google .
 *   :ddg a hydra:IriTemplate ;
 *     dct:title "DuckDuckGo" ; schema:position 1 ;
 *     hydra:template "https://duckduckgo.com/?q={query}" .
 *
 * Each returned record is `{ id, label, template, position }`. `id`
 * is the IRI's fragment (or last path segment); `label` falls back
 * through `dct:title` → `schema:name` → `rdfs:label` → fragment.
 */
async function enginesFromRdf(fileUri, listUri, text) {
  let rdf;
  try { ({ rdf } = await import('../../core/rdf.js')); }
  catch { throw new Error('RDF source lists need rdflib on the page'); }
  if (!rdf.isReady()) throw new Error('rdflib is not available');

  const store = rdf.graph();
  rdf.parse(text, store, fileUri, 'text/turtle');

  const sym = u => rdf.sym(u);
  const valueOf = (subj, pred) => {
    const o = store.any(subj, sym(pred), null);
    return o ? o.value : '';
  };

  const list = sym(listUri);
  const engines = [];
  let seq = 0;
  for (const st of store.statementsMatching(list, sym(SCHEMA + 'itemListElement'), null)) {
    const subj = st.object;
    if (subj.termType !== 'NamedNode') continue;
    const template = valueOf(subj, HYDRA + 'template');
    if (!template) continue;
    const posStr = valueOf(subj, SCHEMA + 'position');
    const position = posStr ? Number(posStr) : Number.POSITIVE_INFINITY;
    engines.push({
      id: lastSegment(subj.value),
      label:
        valueOf(subj, 'http://purl.org/dc/terms/title')
        || valueOf(subj, SCHEMA + 'name')
        || valueOf(subj, 'http://www.w3.org/2000/01/rdf-schema#label')
        || lastSegment(subj.value),
      template,
      position,
      _seq: seq++,
    });
  }
  engines.sort((a, b) => (a.position - b.position) || (a._seq - b._seq));
  return engines.map(({ _seq, ...rest }) => rest);
}

/**
 * Resolve a `source` of the form `<rdfFile>#<ListName>` into a
 * position-sorted array of `{ id, label, template, position }` engine
 * records. The fragment is required.
 *
 * @param {string} sourceUri            `<rdfFile>#<ListName>`
 * @param {{proxy?: string}} [options]  CORS proxy pattern
 */
export async function parseEngineList(sourceUri, { proxy } = {}) {
  const abs = resolveUrl(sourceUri || '');
  const hashIdx = abs.indexOf('#');
  if (hashIdx === -1) {
    throw new Error(
      'An ItemList IRI is required — e.g. source="search-engines.ttl#SearchEngines"',
    );
  }
  const fileUri = abs.slice(0, hashIdx);
  const resp = await feedFetch(fileUri, proxy);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching engine list`);
  return enginesFromRdf(fileUri, abs, await resp.text());
}
