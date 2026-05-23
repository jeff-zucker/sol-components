// Headless smoke check for <sol-calendar>: registers the element, stubs
// fetch with a small ICS, mounts the agenda view, and asserts the day
// groupings + event rendering look right. Mirrors the jsdom pattern in
// sol-feed-node-check.mjs (no playwright/puppeteer needed).
//
// Run from project root:  node claude/smoke-tests/sol-calendar-render.mjs

import { JSDOM } from 'jsdom';

// A handful of events one week from "today" so the assertions don't drift
// across calendar dates: we anchor on the system clock and add days.
const today = new Date();
today.setHours(0, 0, 0, 0);
function plus(days, hours = 0, mins = 0) {
  const d = new Date(today.getTime() + days * 86_400_000);
  d.setHours(hours, mins, 0, 0);
  return d;
}
function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
function ymdhms(d) {
  return `${ymd(d)}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`;
}

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//sol-calendar smoke test//EN
BEGIN:VEVENT
UID:standup@example.org
SUMMARY:Standup
DTSTART:${ymdhms(plus(1, 9, 30))}
DTEND:${ymdhms(plus(1, 10, 0))}
LOCATION:Room 4
END:VEVENT
BEGIN:VEVENT
UID:coffee@example.org
SUMMARY:Coffee with Sam
DTSTART:${ymdhms(plus(1, 14, 0))}
DTEND:${ymdhms(plus(1, 15, 0))}
LOCATION:Stumptown
URL:https://example.org/coffee
END:VEVENT
BEGIN:VEVENT
UID:conf@example.org
SUMMARY:Conference
DTSTART;VALUE=DATE:${ymd(plus(3))}
DTEND;VALUE=DATE:${ymd(plus(4))}
END:VEVENT
END:VCALENDAR
`;

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const k of ['window', 'document', 'HTMLElement', 'customElements',
                 'DOMParser', 'CSSStyleSheet', 'Node', 'MouseEvent']) {
  try { globalThis[k] = window[k]; } catch { /* read-only — skip */ }
}
Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true });
// jsdom sets navigator.onLine to true; sol-calendar honours it.

// Stub fetch — return the ICS for anything that looks like a calendar URL.
globalThis.fetch = window.fetch = async () => ({
  ok: true, status: 200,
  headers: { get: () => 'text/calendar' },
  text: async () => ICS,
});

// AbortController exists in jsdom; signal is silently ignored by our stub.

const fail = m => { console.error('FAIL:', m); process.exit(1); };
const settle = (ms = 80) => new Promise(r => setTimeout(r, ms));

await import('../../web/sol-calendar.js');
if (!window.customElements.get('sol-calendar')) fail('sol-calendar not registered');

const host = window.document.createElement('div');
host.innerHTML = `<sol-calendar source="https://example.org/cal.ics" window-days="14"></sol-calendar>`;
window.document.body.appendChild(host);
const el = host.firstElementChild;
// Let connectedCallback's await chain settle.
await settle(150);

const root = el.shadowRoot;
const header = root.querySelector('.cal-header .cal-title');
if (!header) fail('agenda header title not rendered');
if (!/example\.org/.test(header.textContent))
  fail(`expected title to mention example.org host, got "${header.textContent}"`);

const provider = root.querySelector('.cal-header .cal-provider');
if (!provider || provider.textContent.trim() !== 'ics')
  fail(`provider label should be "ics", got "${provider && provider.textContent}"`);

// Flat row list — three events total. No day grouping in v1.1; each
// row has its own date / time / summary columns.
const rows = root.querySelectorAll('.cal-agenda .cal-row');
if (rows.length !== 3) fail(`expected 3 rows, got ${rows.length}`);

const summaries = [...root.querySelectorAll('.cal-row-summary')].map(s => s.textContent.trim());
if (!summaries.includes('Standup')) fail('Standup event missing');
if (!summaries.includes('Coffee with Sam')) fail('Coffee event missing');
if (!summaries.includes('Conference')) fail('Conference event missing');

// Locations: standup in Room 4, coffee in Stumptown; conference has none.
const locations = [...root.querySelectorAll('.cal-row-location')].map(l => l.textContent.trim());
if (!locations.includes('Room 4')) fail('Room 4 location missing');
if (!locations.includes('Stumptown')) fail('Stumptown location missing');

// The coffee event has a URL — its summary should be wrapped in an <a>.
const coffeeRow = [...root.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'Coffee with Sam');
const coffeeAnchor = coffeeRow.querySelector('.cal-row-summary a');
if (!coffeeAnchor) fail('Coffee summary should be a link (event has URL)');
if (coffeeAnchor.getAttribute('href') !== 'https://example.org/coffee')
  fail(`coffee link href wrong: ${coffeeAnchor.getAttribute('href')}`);
if (coffeeAnchor.getAttribute('rel') !== 'noopener noreferrer')
  fail('coffee link should have rel="noopener noreferrer"');

// The conference is an all-day event — its time column should say "All day".
const confRow = [...root.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'Conference');
const confTime = confRow.querySelector('.cal-row-time')?.textContent.trim();
if (confTime !== 'All day') fail(`Conference time should be "All day", got "${confTime}"`);

// Standup time should be "HH:MM–HH:MM" (range with en dash).
const standupRow = [...root.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'Standup');
const standupTime = standupRow.querySelector('.cal-row-time')?.textContent.trim();
if (!/^\d\d:\d\d–\d\d:\d\d$/.test(standupTime))
  fail(`Standup time should be "HH:MM–HH:MM", got "${standupTime}"`);

// Same-day events: standup and coffee are on the same day, so the
// coffee row's date should be marked .repeat (visually hidden but
// the column is still present for alignment).
const coffeeDate = coffeeRow.querySelector('.cal-row-date');
if (!coffeeDate || !coffeeDate.classList.contains('repeat'))
  fail('coffee row should have a .cal-row-date.repeat (same day as standup)');
const standupDate = standupRow.querySelector('.cal-row-date');
if (!standupDate || standupDate.classList.contains('repeat'))
  fail('standup row should have a visible (non-.repeat) date');

// Empty-state path: a calendar with no events in the window.
globalThis.fetch = window.fetch = async () => ({
  ok: true, status: 200,
  headers: { get: () => 'text/calendar' },
  text: async () => `BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n`,
});
const host2 = window.document.createElement('div');
host2.innerHTML = `<sol-calendar source="https://example.org/empty.ics" window-days="7"></sol-calendar>`;
window.document.body.appendChild(host2);
await settle(150);
const empty = host2.firstElementChild.shadowRoot.querySelector('.cal-agenda .sol-calendar-empty');
if (!empty) fail('empty calendar should render an empty placeholder');
if (!/next 7 days/.test(empty.textContent))
  fail(`empty placeholder should mention "next 7 days", got "${empty.textContent}"`);

// Multi-source path: two URLs in `source`, served different events
// from a fetch stub that routes by URL. The agenda should merge and
// sort by start time.
const ICS_A = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a@example.org
SUMMARY:From feed A
DTSTART:${ymdhms(plus(2, 11, 0))}
DTEND:${ymdhms(plus(2, 12, 0))}
END:VEVENT
END:VCALENDAR
`;
const ICS_B = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:b@example.org
SUMMARY:From feed B
DTSTART:${ymdhms(plus(2, 9, 0))}
DTEND:${ymdhms(plus(2, 10, 0))}
END:VEVENT
END:VCALENDAR
`;
globalThis.fetch = window.fetch = async (u) => {
  const url = String(u);
  const body = url.includes('feed-b') ? ICS_B : ICS_A;
  return {
    ok: true, status: 200,
    headers: { get: () => 'text/calendar' },
    text: async () => body,
  };
};
const host3 = window.document.createElement('div');
host3.innerHTML =
  `<sol-calendar source="https://example.org/feed-a.ics https://example.org/feed-b.ics" window-days="7"></sol-calendar>`;
window.document.body.appendChild(host3);
await settle(200);
const multiRows = host3.firstElementChild.shadowRoot.querySelectorAll('.cal-agenda .cal-row');
if (multiRows.length !== 2)
  fail(`multi-source should render 2 merged rows, got ${multiRows.length}`);
const multiSummaries = [...multiRows].map(r =>
  r.querySelector('.cal-row-summary')?.textContent.trim());
// Feed B's 09:00 should sort before feed A's 11:00.
if (multiSummaries[0] !== 'From feed B' || multiSummaries[1] !== 'From feed A') {
  fail(`merged events should be start-sorted (B then A), got ${JSON.stringify(multiSummaries)}`);
}

// Meeting-URL extraction: LOCATION-is-URL, URL-in-DESCRIPTION, and
// known-platform priority over arbitrary URLs.
const ICS_MEETINGS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:jitsi-loc@example.org
SUMMARY:Solid CG Call
DTSTART:${ymdhms(plus(2, 9, 0))}
DTEND:${ymdhms(plus(2, 10, 0))}
LOCATION:https://meet.jit.si/solid-cg
END:VEVENT
BEGIN:VEVENT
UID:desc-only@example.org
SUMMARY:LWS Meeting
DTSTART:${ymdhms(plus(2, 11, 0))}
DTEND:${ymdhms(plus(2, 12, 0))}
DESCRIPTION:See https://www.w3.org/events/meetings/abc/ for details and https://gitter.im/lws/chat for chat
END:VEVENT
BEGIN:VEVENT
UID:platform-pref@example.org
SUMMARY:Office Hours
DTSTART:${ymdhms(plus(2, 13, 0))}
DTEND:${ymdhms(plus(2, 14, 0))}
DESCRIPTION:Notes at https://docs.example/foo. Join with Google Meet: https://meet.google.com/abc-defg-hij
END:VEVENT
END:VCALENDAR
`;
globalThis.fetch = window.fetch = async () => ({
  ok: true, status: 200,
  headers: { get: () => 'text/calendar' },
  text: async () => ICS_MEETINGS,
});
const host4 = window.document.createElement('div');
host4.innerHTML = `<sol-calendar source="https://example.org/meetings.ics" window-days="7"></sol-calendar>`;
window.document.body.appendChild(host4);
await settle(200);
const mRoot = host4.firstElementChild.shadowRoot;

// Case 1: LOCATION is a URL → summary becomes a link, no .cal-row-location row.
const cgRow = [...mRoot.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'Solid CG Call');
const cgLink = cgRow?.querySelector('.cal-row-summary a');
if (!cgLink) fail('Solid CG Call summary should be a link (LOCATION is a URL)');
if (cgLink.getAttribute('href') !== 'https://meet.jit.si/solid-cg')
  fail(`Solid CG link href wrong: ${cgLink?.getAttribute('href')}`);
if (cgRow?.querySelector('.cal-row-location'))
  fail('Solid CG row should not render LOCATION text — the URL was consumed as href');

// Case 2: URL in DESCRIPTION → summary becomes that link. With no
// known-platform match, the first URL wins (W3C events page).
const lwsRow = [...mRoot.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'LWS Meeting');
const lwsLink = lwsRow?.querySelector('.cal-row-summary a');
if (!lwsLink) fail('LWS Meeting summary should be a link (URL in DESCRIPTION)');
if (lwsLink.getAttribute('href') !== 'https://www.w3.org/events/meetings/abc/')
  fail(`LWS link should be the W3C events page, got ${lwsLink?.getAttribute('href')}`);

// Case 3: Description has multiple URLs — known meeting platform
// (meet.google.com) wins over an arbitrary docs URL.
const officeRow = [...mRoot.querySelectorAll('.cal-row')].find(li =>
  li.querySelector('.cal-row-summary')?.textContent.trim() === 'Office Hours');
const officeLink = officeRow?.querySelector('.cal-row-summary a');
if (!officeLink) fail('Office Hours summary should be a link');
if (officeLink.getAttribute('href') !== 'https://meet.google.com/abc-defg-hij')
  fail(`Office Hours should prefer meet.google.com over docs link, got ${officeLink?.getAttribute('href')}`);

console.log('OK: sol-calendar render smoke check passed');
