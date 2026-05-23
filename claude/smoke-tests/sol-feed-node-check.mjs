// Headless smoke check for <sol-feed>: registers the element, mounts each
// view against a stubbed fetch (RSS for feeds, a bookmark-ontology Turtle
// file for the source list), and asserts the expected DOM appears.
// Run from project root:  node claude/smoke-tests/sol-feed-node-check.mjs
import { JSDOM } from 'jsdom';

const RSS = `<?xml version="1.0"?><rss version="2.0"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel><title>Demo Feed</title>
    <item>
      <title>First story</title>
      <link>http://example.org/a</link>
      <description><![CDATA[<p>Body of <img src="http://img/a.jpg"> first.</p>]]></description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>http://example.org/b</link>
      <media:thumbnail url="http://img/b.jpg"/>
      <description>Plain text body</description>
    </item>
  </channel></rss>`;

// Bookmark-ontology source list: a Root topic with News and Tech subtopics,
// three in-tree feeds (A, C in News; B in Tech), and one orphan (D points
// at <#Foo>, which isn't a defined bk:Topic) to exercise the drop-orphan
// rule.
const TTL = `
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix bk: <http://www.w3.org/2002/01/bookmark#> .
<#Root> a bk:Topic ; ui:label "Root" .
<#News> a bk:Topic ; ui:label "News" ; bk:subTopicOf <#Root> .
<#Tech> a bk:Topic ; ui:label "Tech" ; bk:subTopicOf <#Root> .
:a a ui:Link ; ui:label "Feed A" ; bk:recalls <http://example.org/a.xml> ; bk:hasTopic <#News> .
:b a ui:Link ; ui:label "Feed B" ; bk:recalls <http://example.org/b.xml> ; bk:hasTopic <#Tech> .
:c a ui:Link ; ui:label "Feed C" ; bk:recalls <http://example.org/c.xml> ; bk:hasTopic <#News> .
:d a ui:Link ; ui:label "Feed D" ; bk:recalls <http://example.org/d.xml> ; bk:hasTopic <#Foo> .
`;

// SKOS twin: same Root/News/Tech tree but expressed with skos:ConceptScheme
// + skos:Concept + skos:topConceptOf, plus a nested NewsSub reached via
// skos:narrower (inverse direction) to prove both directions work. Feeds
// are subjects with dct:title + dct:subject.
const TTL_SKOS = `
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .
<#Root>    a skos:ConceptScheme ; skos:prefLabel "Root" .
<#News>    a skos:Concept ; skos:prefLabel "News" ; skos:topConceptOf <#Root> .
<#Tech>    a skos:Concept ; skos:prefLabel "Tech" ; skos:topConceptOf <#Root> .
<#NewsSub> a skos:Concept ; skos:prefLabel "NewsSub" .
<#News>    skos:narrower <#NewsSub> .

<http://example.org/a.xml>   dct:title "Feed A"   ; dct:subject <#News> .
<http://example.org/b.xml>   dct:title "Feed B"   ; dct:subject <#Tech> .
<http://example.org/c.xml>   dct:title "Feed C"   ; dct:subject <#News> .
<http://example.org/sub.xml> dct:title "Feed Sub" ; dct:subject <#NewsSub> .
<http://example.org/orph.xml> dct:title "Orphan"  ; dct:subject <#Foo> .
`;

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const k of ['window', 'document', 'HTMLElement', 'customElements',
                 'DOMParser', 'CSSStyleSheet', 'Node'])
  try { globalThis[k] = window[k]; } catch { /* read-only global — skip */ }
// localStorage / location are getter-only globals in modern Node — define
// over them with jsdom's implementations so <sol-feed> can use them.
for (const k of ['localStorage', 'location'])
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });

// Stub fetch — Turtle for *.ttl (SKOS for feeds-skos.ttl, bookmark for the
// rest), RSS for everything else.
globalThis.fetch = window.fetch = async (url) => {
  const u = String(url);
  const isTtl = u.includes('.ttl');
  const text = u.includes('feeds-skos.ttl') ? TTL_SKOS : isTtl ? TTL : RSS;
  return {
    ok: true, status: 200,
    headers: { get: () => (isTtl ? 'text/turtle' : 'application/rss+xml') },
    text: async () => text,
  };
};

// Stub window.open — record calls and hand back a navigable window object.
const opened = [];
let lastWin = null;
window.open = (url, name) => {
  opened.push({ url, name });
  lastWin = { closed: false, focus() {}, location: { href: url } };
  return lastWin;
};
const clickEvent = () => new window.MouseEvent('click', { bubbles: true, cancelable: true });

const fail = m => { console.error('FAIL:', m); process.exit(1); };
const settle = () => new Promise(r => setTimeout(r, 80));

await import('../../web/sol-feed.js');
if (!window.customElements.get('sol-feed')) fail('sol-feed not registered');

async function mount(html) {
  const host = window.document.createElement('div');
  host.innerHTML = html;
  window.document.body.appendChild(host);
  await settle();
  return host.firstElementChild;
}

// ── view="feed" ────────────────────────────────────────────────────────
let el = await mount('<sol-feed view="feed" source="http://feed/rss"></sol-feed>');
let links = el.shadowRoot.querySelectorAll('.feed-items .feed-link');
if (links.length !== 2) fail(`feed: expected 2 article links, got ${links.length}`);
// descriptions are skipped in every view — link text is the article title
if (!links[0].textContent.startsWith('First story'))
  fail(`feed: link text should be the title, got ${JSON.stringify(links[0].textContent.slice(0, 40))}`);
// window.open creates the reader once; the 2nd click navigates that window
links[0].dispatchEvent(clickEvent());
links[1].dispatchEvent(clickEvent());
if (opened.length !== 1) fail(`feed: reader window must open once, got ${opened.length}`);
if (opened[0].name !== 'sol-feed-reader') fail('feed: wrong reader window name');
if (!lastWin.location.href.includes('example.org'))
  fail('feed: a later click must navigate the existing reader window');

// ── view="topic" (subtree = {News}; B & D dropped; no group headings) ──
el = await mount('<sol-feed view="topic" source="data/feeds.ttl#News"></sol-feed>');
let groups = el.shadowRoot.querySelectorAll('.feed-sources .feed-group-label');
if (groups.length !== 0) fail(`topic: expected NO group headings, got ${groups.length}`);
let srcs = el.shadowRoot.querySelectorAll('.feed-source-list .feed-link');
if (srcs.length !== 2) fail(`topic: expected 2 sources (only A,C are News), got ${srcs.length}`);
if (!el.shadowRoot.querySelector('.feed-link.selected')) fail('topic: no auto-selected source');
const articleLink = el.shadowRoot.querySelector('.feed-items .feed-link');
if (!articleLink) fail('topic: no articles rendered');
// topic articles: visible text is the article title; descriptions skipped
if (!articleLink.textContent.startsWith('First story'))
  fail(`topic: article should show the title, got ${JSON.stringify(articleLink.textContent.slice(0, 40))}`);
if (articleLink.title)
  fail(`topic: descriptions must be skipped, got tooltip ${JSON.stringify(articleLink.title)}`);

// ── view="all" (subtree = {Root, News, Tech}; D dropped) ───────────────
el = await mount('<sol-feed view="all" source="data/feeds.ttl#Root"></sol-feed>');
let topics = el.shadowRoot.querySelectorAll('.feed-picker .feed-topic');
if (topics.length !== 2) fail(`all: expected 2 topic fieldsets (News, Tech), got ${topics.length}`);
const legends = [...el.shadowRoot.querySelectorAll('.feed-topic legend')].map(l => l.textContent);
if (!legends.includes('News') || !legends.includes('Tech') || legends.includes('Other'))
  fail(`all: expected legends News/Tech only (no Other), got ${JSON.stringify(legends)}`);
let boxes = el.shadowRoot.querySelectorAll('.feed-picker input[type=checkbox]');
if (boxes.length !== 3) fail(`all: expected 3 checkboxes (A,B,C; D dropped), got ${boxes.length}`);
// first visit: nothing remembered, so the first source is auto-selected
const checkedInit = [...boxes].filter(b => b.checked);
if (checkedInit.length !== 1 || checkedInit[0] !== boxes[0])
  fail(`all: first source should be auto-selected, got checked=${checkedInit.length}`);
// auto-selected source produces one top-bar button, marked selected
const initBtns = el.shadowRoot.querySelectorAll('.feed-source-btn');
if (initBtns.length !== 1)
  fail(`all: expected 1 source button for the auto-selected source, got ${initBtns.length}`);
if (!initBtns[0].classList.contains('selected'))
  fail('all: the only source button should be selected');
if (el.shadowRoot.querySelectorAll('.feed-articles .feed-card').length !== 2)
  fail('all: the auto-selected source should show its 2 articles');

// the picker show/hide toggle — starts hidden, reveals on click
const toggle = el.shadowRoot.querySelector('.feed-picker-toggle');
const picker = el.shadowRoot.querySelector('.feed-picker');
if (!toggle) fail('all: no picker toggle button');
if (!picker.hidden) fail('all: picker should start hidden');
toggle.dispatchEvent(new window.Event('click'));
if (picker.hidden) fail('all: first click should reveal the picker');
toggle.dispatchEvent(new window.Event('click'));
if (!picker.hidden) fail('all: second click should hide the picker again');

// tick a second source — a 2nd button appears and is the new selection
boxes[1].checked = true;
boxes[1].dispatchEvent(new window.Event('change'));
await settle();
const btns2 = el.shadowRoot.querySelectorAll('.feed-source-btn');
if (btns2.length !== 2)
  fail(`all: ticking a 2nd source should add a 2nd button, got ${btns2.length}`);
const selected = el.shadowRoot.querySelectorAll('.feed-source-btn.selected');
if (selected.length !== 1) fail('all: exactly one source button should be selected');
let cards = el.shadowRoot.querySelectorAll('.feed-articles .feed-card');
if (cards.length !== 2)
  fail(`all: expected 2 cards (the newly-selected source's items), got ${cards.length}`);
opened.length = 0;
lastWin.closed = true;   // simulate the user having closed the reader window
cards[0].dispatchEvent(clickEvent());
if (opened.length !== 1 || opened[0].name !== 'sol-feed-reader')
  fail('all: card click must re-open the reader window once it is closed');
if (!el.shadowRoot.querySelector('.feed-card-img')) fail('all: no card image extracted');
if (el.shadowRoot.querySelector('.feed-card-overlay')) fail('all: description overlay must NOT be rendered');
const cardTitle = el.shadowRoot.querySelector('.feed-card-title');
if (!cardTitle) fail('all: each card must show its article title');
if (!cardTitle.textContent.includes('story')) fail(`all: card title text wrong, got ${JSON.stringify(cardTitle.textContent)}`);
if (el.shadowRoot.querySelector('.feed-card-source')) fail('all: card should NOT show its source (top-bar button names it)');
const cardLabels = [...new Set([...cards].map(c => c.getAttribute('aria-label')))].sort();
if (cardLabels.join('|') !== 'First story|Second story')
  fail(`all: card aria-labels should still carry the article titles, got ${JSON.stringify(cardLabels)}`);

// selection persists in localStorage — a fresh element restores it
el = await mount('<sol-feed view="all" source="data/feeds.ttl#Root"></sol-feed>');
await settle();
const restored = el.shadowRoot.querySelectorAll('.feed-picker input:checked');
if (restored.length !== 2) fail(`all: expected 2 remembered sources, got ${restored.length}`);
if (el.shadowRoot.querySelectorAll('.feed-source-btn').length !== 2)
  fail('all: 2 remembered sources should yield 2 top-bar buttons');
if (el.shadowRoot.querySelectorAll('.feed-articles .feed-card').length !== 2)
  fail('all: the first remembered source should be auto-selected and shown');

// ── SKOS encoding: topic + all should match the bookmark behaviour ─────
// view="topic" source="…#News" — subtree = {News, NewsSub via skos:narrower}
el = await mount('<sol-feed view="topic" source="data/feeds-skos.ttl#News"></sol-feed>');
let skosTopicSrcs = el.shadowRoot.querySelectorAll('.feed-source-list .feed-link');
if (skosTopicSrcs.length !== 3)
  fail(`skos topic: expected 3 sources (A, C in News + Sub via narrower), got ${skosTopicSrcs.length}`);
if (el.shadowRoot.querySelectorAll('.feed-sources .feed-group-label').length !== 0)
  fail('skos topic: no group headings in topic view');

// view="all" source="…#Root" — subtree = {Root, News, Tech, NewsSub}
el = await mount('<sol-feed view="all" source="data/feeds-skos.ttl#Root"></sol-feed>');
let skosLegends = [...el.shadowRoot.querySelectorAll('.feed-topic legend')].map(l => l.textContent);
if (!skosLegends.includes('News') || !skosLegends.includes('Tech') || !skosLegends.includes('NewsSub'))
  fail(`skos all: expected legends News/Tech/NewsSub, got ${JSON.stringify(skosLegends)}`);
if (skosLegends.includes('Other'))
  fail('skos all: orphans must be dropped (no Other group)');
let skosBoxes = el.shadowRoot.querySelectorAll('.feed-picker input[type=checkbox]');
if (skosBoxes.length !== 4)
  fail(`skos all: expected 4 checkboxes (A,B,C,Sub; orph dropped), got ${skosBoxes.length}`);

console.log('PASS: bookmark + SKOS source lists; orphans dropped; both hierarchy directions accepted');
