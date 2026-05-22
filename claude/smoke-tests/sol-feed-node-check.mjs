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

// Bookmark-ontology source list: 3 feeds across 2 topics.
const TTL = `
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix bk: <http://www.w3.org/2002/01/bookmark#> .
<#News> a bk:Topic ; ui:label "News" .
<#Tech> a bk:Topic ; ui:label "Tech" .
:a a ui:Link ; ui:label "Feed A" ; bk:recalls <http://example.org/a.xml> ; bk:hasTopic <#News> .
:b a ui:Link ; ui:label "Feed B" ; bk:recalls <http://example.org/b.xml> ; bk:hasTopic <#Tech> .
:c a ui:Link ; ui:label "Feed C" ; bk:recalls <http://example.org/c.xml> ; bk:hasTopic <#News> .
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

// Stub fetch — Turtle for *.ttl, RSS for everything else.
globalThis.fetch = window.fetch = async (url) => {
  const isTtl = String(url).includes('.ttl');
  return {
    ok: true, status: 200,
    headers: { get: () => (isTtl ? 'text/turtle' : 'application/rss+xml') },
    text: async () => (isTtl ? TTL : RSS),
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

// view="single"
let el = await mount('<sol-feed view="single" source="http://feed/rss"></sol-feed>');
let links = el.shadowRoot.querySelectorAll('.feed-items .feed-link');
if (links.length !== 2) fail(`single: expected 2 article links, got ${links.length}`);
if (links[0].textContent.indexOf('First story') !== 0) fail('single: title wrong');
// window.open creates the reader once; the 2nd click navigates that window
links[0].dispatchEvent(clickEvent());
links[1].dispatchEvent(clickEvent());
if (opened.length !== 1) fail(`single: reader window must open once, got ${opened.length}`);
if (opened[0].name !== 'sol-feed-reader') fail('single: wrong reader window name');
if (!lastWin.location.href.includes('example.org'))
  fail('single: a later click must navigate the existing reader window');

// view="multiple" from an RDF bookmark file
el = await mount('<sol-feed view="multiple" source="data/feeds.ttl"></sol-feed>');
let groups = el.shadowRoot.querySelectorAll('.feed-sources .feed-group-label');
if (groups.length !== 2) fail(`multiple: expected 2 topic groups, got ${groups.length}`);
if (groups[0].textContent !== 'News') fail(`multiple: first group should be News, got ${groups[0].textContent}`);
let srcs = el.shadowRoot.querySelectorAll('.feed-source-list .feed-link');
if (srcs.length !== 3) fail(`multiple: expected 3 sources, got ${srcs.length}`);
if (!el.shadowRoot.querySelector('.feed-link.selected')) fail('multiple: no auto-selected source');
if (!el.shadowRoot.querySelector('.feed-items .feed-link')) fail('multiple: no articles rendered');

// view="news-page" from an RDF bookmark file
el = await mount('<sol-feed view="news-page" source="data/feeds.ttl"></sol-feed>');
let topics = el.shadowRoot.querySelectorAll('.feed-picker .feed-topic');
if (topics.length !== 2) fail(`news: expected 2 topic fieldsets, got ${topics.length}`);
let boxes = el.shadowRoot.querySelectorAll('.feed-picker input[type=checkbox]');
if (boxes.length !== 3) fail(`news: expected 3 checkboxes, got ${boxes.length}`);
if ([...boxes].some(b => b.checked)) fail('news: checkboxes should start unchecked');
if (el.shadowRoot.querySelectorAll('.feed-grid .feed-card').length !== 0)
  fail('news: grid should start empty');

// the picker show/hide toggle
const toggle = el.shadowRoot.querySelector('.feed-picker-toggle');
const picker = el.shadowRoot.querySelector('.feed-picker');
if (!toggle) fail('news: no picker toggle button');
if (picker.hidden) fail('news: picker should start visible');
toggle.dispatchEvent(new window.Event('click'));
if (!picker.hidden) fail('news: toggle did not hide the picker');
toggle.dispatchEvent(new window.Event('click'));
if (picker.hidden) fail('news: toggle did not re-show the picker');

// tick one source — the grid should fill live
boxes[0].checked = true;
boxes[0].dispatchEvent(new window.Event('change'));
await settle();
let cards = el.shadowRoot.querySelectorAll('.feed-grid .feed-card');
if (cards.length !== 2) fail(`news: expected 2 cards after ticking a source, got ${cards.length}`);
opened.length = 0;
lastWin.closed = true;   // simulate the user having closed the reader window
cards[0].dispatchEvent(clickEvent());
if (opened.length !== 1 || opened[0].name !== 'sol-feed-reader')
  fail('news: card click must re-open the reader window once it is closed');
if (!el.shadowRoot.querySelector('.feed-card-img')) fail('news: no card image extracted');
if (!el.shadowRoot.querySelector('.feed-card-overlay')) fail('news: no description overlay');

// selection persists in localStorage — a fresh element restores it
el = await mount('<sol-feed view="news-page" source="data/feeds.ttl"></sol-feed>');
await settle();
const restored = el.shadowRoot.querySelectorAll('.feed-picker input:checked');
if (restored.length !== 1) fail(`news: expected 1 remembered source, got ${restored.length}`);
if (el.shadowRoot.querySelectorAll('.feed-grid .feed-card').length !== 2)
  fail('news: remembered source did not pre-fill the grid');

console.log('PASS: all 3 views render; RDF list grouped by topic; news picker toggles + persists');
