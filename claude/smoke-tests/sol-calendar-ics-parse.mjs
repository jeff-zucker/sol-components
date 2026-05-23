// Smoke test for web/utils/calendar-fetch.js — exercises the ical.js
// translation layer against a sample ICS that covers the bits a hand-
// rolled parser would have got subtly wrong: TZID, weekly + monthly
// RRULE, EXDATE, RECURRENCE-ID overrides, and all-day events.
//
// Run from project root:  node claude/smoke-tests/sol-calendar-ics-parse.mjs

import { parseICS, buildProviderUrl, applyProxy } from '../../web/utils/calendar-fetch.js';

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//sol-calendar smoke test//EN
BEGIN:VTIMEZONE
TZID:America/Los_Angeles
BEGIN:STANDARD
DTSTART:20070101T020000
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
TZNAME:PST
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20070101T020000
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
TZNAME:PDT
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:single@example.org
SUMMARY:Single event
LOCATION:Conference room A
DTSTART;TZID=America/Los_Angeles:20260601T090000
DTEND;TZID=America/Los_Angeles:20260601T100000
END:VEVENT
BEGIN:VEVENT
UID:allday@example.org
SUMMARY:All day event
DTSTART;VALUE=DATE:20260603
DTEND;VALUE=DATE:20260604
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.org
SUMMARY:Weekly standup
DTSTART;TZID=America/Los_Angeles:20260601T093000
DTEND;TZID=America/Los_Angeles:20260601T094500
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4
EXDATE;TZID=America/Los_Angeles:20260615T093000
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.org
SUMMARY:Weekly standup (rescheduled)
LOCATION:Room B
RECURRENCE-ID;TZID=America/Los_Angeles:20260608T093000
DTSTART;TZID=America/Los_Angeles:20260608T100000
DTEND;TZID=America/Los_Angeles:20260608T101500
END:VEVENT
BEGIN:VEVENT
UID:monthly@example.org
SUMMARY:Monthly review
DTSTART;TZID=America/Los_Angeles:20260605T140000
DTEND;TZID=America/Los_Angeles:20260605T150000
RRULE:FREQ=MONTHLY;BYMONTHDAY=5;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:past@example.org
SUMMARY:Way in the past
DTSTART;TZID=America/Los_Angeles:20200101T100000
DTEND;TZID=America/Los_Angeles:20200101T110000
END:VEVENT
BEGIN:VEVENT
UID:url@example.org
SUMMARY:Event with URL
DTSTART;TZID=America/Los_Angeles:20260602T120000
DTEND;TZID=America/Los_Angeles:20260602T130000
URL:https://example.org/event-page
END:VEVENT
END:VCALENDAR
`;

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures++; }
}
function section(name) { console.log(`\n— ${name} —`); }

// Window covers June 2026 (entire test period).
const start = new Date(2026, 5, 1);            // June 1 2026 local
const events = parseICS(SAMPLE, { start, windowDays: 60, maxEvents: 1000 });

section('parseICS basics');
ok(Array.isArray(events), 'returns an array');
ok(events.length > 0, `got ${events.length} events`);
ok(events.every((e, i) => i === 0 || events[i - 1].start <= e.start),
   'events are sorted ascending by start');

section('single event');
const single = events.find(e => e.uid === 'single@example.org');
ok(!!single, 'single event present');
ok(single.summary === 'Single event', 'summary parsed');
ok(single.location === 'Conference room A', 'location parsed');
ok(!single.allDay, 'not flagged as all-day');
ok(!single.isRecurringInstance, 'not flagged as recurring');

section('all-day event');
const allday = events.find(e => e.uid === 'allday@example.org');
ok(!!allday, 'all-day event present');
ok(allday.allDay === true, 'allDay flag set');

section('URL property');
const urlEv = events.find(e => e.uid === 'url@example.org');
ok(!!urlEv, 'URL event present');
ok(urlEv.url === 'https://example.org/event-page', 'URL extracted');

section('weekly recurrence');
const weekly = events.filter(e => e.uid === 'weekly@example.org');
// 4 occurrences from COUNT=4, minus 1 EXDATE = 3 remaining.
ok(weekly.length === 3, `weekly expanded to 3 occurrences (got ${weekly.length})`);
ok(weekly.every(e => e.isRecurringInstance), 'all weekly instances flagged recurring');
const rescheduled = weekly.find(e => e.summary === 'Weekly standup (rescheduled)');
ok(!!rescheduled, 'RECURRENCE-ID override is present');
ok(rescheduled && rescheduled.location === 'Room B',
   'override carries its own location');

section('monthly recurrence');
const monthly = events.filter(e => e.uid === 'monthly@example.org');
// COUNT=3, all within the 60-day window? June 5, July 5, Aug 5.
// Window is June 1 + 60 days = July 31, so only June 5 + July 5 are in.
ok(monthly.length === 2, `monthly expanded to 2 occurrences inside window (got ${monthly.length})`);

section('out-of-window event');
const pastEv = events.find(e => e.uid === 'past@example.org');
ok(!pastEv, 'past event was excluded by the window');

section('window edge — narrow window');
const narrow = parseICS(SAMPLE, { start, windowDays: 2, maxEvents: 1000 });
ok(narrow.every(e => e.start < new Date(2026, 5, 3)),
   'narrow window cleanly trims to events before June 3');

section('maxEvents cap');
const capped = parseICS(SAMPLE, { start, windowDays: 60, maxEvents: 2 });
ok(capped.length === 2, `maxEvents=2 stops at 2 events (got ${capped.length})`);

section('buildProviderUrl');
const gurl = buildProviderUrl('google', 'alice@example.org');
ok(gurl && gurl.includes('calendar.google.com'), 'google: composes calendar.google.com URL');
ok(gurl && gurl.includes(encodeURIComponent('alice@example.org')),
   'google: calendar id is URL-encoded');
ok(buildProviderUrl('apple',   'x') === null, 'apple: passes through (returns null)');
ok(buildProviderUrl('outlook', 'x') === null, 'outlook: passes through (returns null)');
ok(buildProviderUrl('proton',  'x') === null, 'proton: passes through (returns null)');
ok(buildProviderUrl('ics',     'x') === null, 'ics: passes through (returns null)');
ok(buildProviderUrl('google',  '')  === null, 'google with empty id: returns null');

section('applyProxy');
ok(applyProxy('', 'https://x/y') === 'https://x/y', 'empty proxy → bare URL');
ok(applyProxy('https://p?u=', 'https://x/y') ===
     'https://p?u=' + encodeURIComponent('https://x/y'),
   'append style');
ok(applyProxy('https://p?u={url}&k=v', 'https://x/y') ===
     'https://p?u=' + encodeURIComponent('https://x/y') + '&k=v',
   'token-substitution style');

console.log('');
if (failures) {
  console.log(`FAIL: ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('OK: all assertions passed');
}
