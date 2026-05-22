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

/** Build a feed list from the `<a href>` elements of an HTML page. */
function anchorsFromHtml(html, baseUri) {
  const doc = domParser.parseFromString(html, 'text/html');
  const out = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    let href = a.getAttribute('href');
    try { href = new URL(href, baseUri).href; } catch { /* keep raw */ }
    const label = (a.textContent || '').trim() || a.getAttribute('title') || href;
    out.push({ label, url: href, topic: '' });
  }
  return out;
}

/* Vocabulary used by the bookmark source list (data/feeds.ttl). */
const NS = {
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ui:   'http://www.w3.org/ns/ui#',
  bk:   'http://www.w3.org/2002/01/bookmark#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  dc:   'http://purl.org/dc/elements/1.1/',
};

/** Last path / fragment segment of a URI — a readable fallback label. */
const lastSegment = uri => uri.replace(/[#/]+$/, '').replace(/^.*[#/]/, '') || uri;

/** Drop feeds that repeat a URL, keeping first-seen order. */
function dedupeFeeds(feeds) {
  const seen = new Set();
  return feeds.filter(f => f.url && !seen.has(f.url) && seen.add(f.url));
}

/**
 * Build a feed list from an RDF/Turtle document. The primary shape is the
 * W3C bookmark ontology used by `data/feeds.ttl`:
 *
 *   <#News>  a bk:Topic ; ui:label "News" .
 *   :00012   a ui:Link  ; ui:label "NY Times" ;
 *            bk:recalls <https://…/World.xml> ; bk:hasTopic <#News> .
 *
 * Each `ui:Link` becomes a feed — `ui:label` is the name, `bk:recalls`
 * the feed URL, and `bk:hasTopic` resolves to its topic's `ui:label`.
 * If no `ui:Link` is found the parser falls back to treating any subject
 * with an `rdfs:label`/`dc:title` as a feed. Requires rdflib on the page.
 */
async function feedsFromRdf(sourceUri, text) {
  let rdf;
  try { ({ rdf } = await import('../../core/rdf.js')); }
  catch { throw new Error('RDF source lists need rdflib on the page'); }
  if (!rdf.isReady()) throw new Error('rdflib is not available');

  const store = rdf.graph();
  rdf.parse(text, store, sourceUri, 'text/turtle');

  const sym = u => rdf.sym(u);
  const valueOf = (subj, pred) => {
    const o = store.any(subj, sym(pred), null);
    return o ? o.value : '';
  };

  // Topic URI → display label.
  const topicLabel = new Map();
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.bk + 'Topic'))) {
    topicLabel.set(
      st.subject.value,
      valueOf(st.subject, NS.ui + 'label') || lastSegment(st.subject.value),
    );
  }

  // ui:Link subjects → feeds.
  const feeds = [];
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))) {
    const subj = st.subject;
    const url = valueOf(subj, NS.bk + 'recalls');
    if (!url) continue;
    const topicUri = (store.any(subj, sym(NS.bk + 'hasTopic'), null) || {}).value || '';
    feeds.push({
      label: valueOf(subj, NS.ui + 'label') || lastSegment(url),
      url,
      topic: topicUri ? (topicLabel.get(topicUri) || lastSegment(topicUri)) : '',
    });
  }
  if (feeds.length) return dedupeFeeds(feeds);

  // Fallback for non-bookmark RDF: any labelled subject is a feed.
  const labelled = [];
  for (const pred of [NS.rdfs + 'label', NS.dc + 'title', NS.ui + 'label']) {
    for (const st of store.statementsMatching(null, sym(pred), null)) {
      if (st.subject.termType === 'NamedNode') {
        labelled.push({ label: st.object.value, url: st.subject.value, topic: '' });
      }
    }
  }
  return dedupeFeeds(labelled);
}

/**
 * Resolve a "source list" resource into `[{label, url, topic}]` feeds. The
 * resource may be an HTML page (every `<a href>` is a feed) or an
 * RDF/Turtle bookmark document (every `ui:Link` is a feed). `topic` is the
 * empty string when the resource carries no topic grouping.
 *
 * @param {string} sourceUri            the source-list URL
 * @param {{proxy?: string}} [options]  CORS proxy pattern
 * @returns {Promise<Array<{label:string,url:string,topic:string}>>}
 */
export async function parseSourceList(sourceUri, options = {}) {
  // Resolve to an absolute URL up front: rdflib's parser asserts the
  // document URI is absolute, and relative IRIs in the document need a
  // real base to resolve against.
  const absUri = resolveUrl(sourceUri);
  const resp = await feedFetch(absUri, options.proxy);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching source list`);
  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const text = await resp.text();

  const looksHtml = contentType.includes('html') ||
                    /^\s*<(!doctype|html)/i.test(text);
  return looksHtml
    ? anchorsFromHtml(text, absUri)
    : feedsFromRdf(absUri, text);
}
