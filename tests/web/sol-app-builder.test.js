/**
 * @jest-environment jsdom
 *
 * <sol-app-builder> — the wizard that builds a standalone app folder on the
 * pod. Network is fully mocked at the module seams (auth-fetch, rdf-utils,
 * pod-ops): a `docs` route table serves GETs, PUT/PATCH bodies are recorded,
 * and loadRdfStore parses route-table Turtle with n3 into the rdflib mock
 * store (the mock's own tokenizer has no lists/blank nodes). There is no
 * layout picker: creating an app COMPOSES the full default layout
 * (core/layout-compose.js) and lands straight on Place Content and UI.
 *
 * Covered:
 *   - the three-step rail renders; steps disabled until an app exists
 *   - Create app → PUT app.ttl (schema:WebApplication + name) → layout.ttl
 *     composed with header/both sidebars/main/footer, seeding app-menu.ttl
 *     (#MainMenu AND #MainHamburgerMenu), app-commands.ttl, help.html
 *   - Place Content and UI: every area is a titled drop target; Add / Remove /
 *     move rewrite layout.ttl via the serializer
 *   - an area's ✕ removes the region and BREAKS IT UP: the area is offered
 *     back under UI elements, each chip it held under its own bin
 *   - Generate PUTs index.html (header/aside/main structure, chrome scripts,
 *     visible from-rdf) + app.css
 *   - the catalog entry is automatic: an INSERT DATA ui:Plugin (kind ui:Link)
 *     on create (whole-doc PUT fallback on lock expiry), a DELETE DATA when
 *     the app is deleted
 *   - clicking a chip opens a floating <sol-window> holding a shape-driven
 *     <sol-form> over that item's node; a CONTENT item (a ui:Link naming an
 *     html file) also gets that file's text in a textarea it can save
 *   - the Plugins step mounts one manager per menu doc + the pantry
 */

import { jest } from '@jest/globals';
import { Parser } from 'n3';
import rdflib from '../__mocks__/rdflib-esm.js';

window.__SolSuppressDefineWarn = true;

let docs = {};       // url → text (GET routes; PUTs land here too)
let writes = [];     // recorded {url, method, body, type}
let patchFails = false; // simulate CSS "Lock expired" 500 on PATCH

function parseInto(text, base) {
  const g = rdflib.graph();
  const conv = (t) =>
    t.termType === 'Literal' ? rdflib.literal(t.value)
      : rdflib.sym(t.termType === 'BlankNode' ? `_:${t.value}` : t.value);
  for (const q of new Parser({ baseIRI: base }).parse(text)) {
    g.add(conv(q.subject), conv(q.predicate), conv(q.object));
  }
  return g;
}

jest.unstable_mockModule('../../core/auth-fetch.js', () => ({
  // sol-modal's chain reaches for these too
  getAuthFetch: () => globalThis.fetch,
  SOL_AUTH_NEEDED: 'sol-auth-needed',
  solFetch: jest.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      const body = docs[String(url).split('#')[0]];
      return { ok: body != null, status: body != null ? 200 : 404, text: async () => body || '' };
    }
    writes.push({
      url: String(url), method, body: opts.body,
      type: opts.headers && opts.headers['Content-Type'],
    });
    if (method === 'PATCH' && patchFails) {
      return { ok: false, status: 500, text: async () => 'Lock expired' };
    }
    if (method === 'PUT') docs[String(url)] = opts.body;
    return { ok: true, status: 201, text: async () => '' };
  }),
}));

jest.unstable_mockModule('../../core/rdf-utils.js', () => ({
  loadRdfStore: jest.fn(async (url) => {
    const doc = String(url).split('#')[0];
    if (docs[doc] == null) throw new Error(`404 ${doc}`);
    return parseInto(docs[doc], doc);
  }),
}));

let containers = {};   // container url → [{url, name, isContainer}]
let deleted = [];      // urls DELETEd through deleteFolder

jest.unstable_mockModule('../../core/pod-ops.js', () => ({
  fetchContainer: jest.fn(async (url) => containers[String(url)] || []),
  deleteFolder: jest.fn(async (url) => { deleted.push(String(url)); }),
}));

await import('../../web/sol-app-builder.js');

const APPS = 'http://pod.test/apps/';
const CATALOG = 'http://pod.test/catalog.ttl#Available';

function settle(ms = 30) { return new Promise((r) => setTimeout(r, ms)); }

beforeEach(() => {
  docs = {};
  writes = [];
  deleted = [];
  containers = {};
  patchFails = false;
  docs['http://pod.test/catalog.ttl'] = `@prefix ui: <http://www.w3.org/ns/ui#> .
<#Available> a ui:Menu ; ui:label "Available" .
`;
});
afterEach(() => { document.body.innerHTML = ''; });

async function mount(attrs = '') {
  document.body.innerHTML = `<sol-app-builder id="b" apps-root="${APPS}"
    catalog="${CATALOG}" ${attrs}></sol-app-builder>`;
  const el = document.getElementById('b');
  await settle();
  return el;
}

// Drive the top-row picker: "__new" opens the create form, a slug opens that app.
async function pick(el, value) {
  const sel = el.querySelector('.sab-app-select');
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

// Move to a tab in the top row.
async function gotoTab(el, key, host = el) {
  host.querySelector(`[data-tab="${key}"]`).click();
  await settle(90);
}

// Open an existing app: the picker lists them. An app opens on Metadata; most
// of what there is to test lives on Add Features.
async function openApp(el, slug, tab = 'features') {
  await pick(el, slug);
  await settle(90);
  if (tab) await gotoTab(el, tab);
}

async function createHello(el, tab = 'features') {
  await pick(el, '__new');
  await settle(1);
  el.querySelector('[name=app-name]').value = 'Hello World';
  el.querySelector('[name=app-icon]').value = '🍳';
  el.querySelector('form.sab-new button[type=submit]').click();
  await settle(90);
  if (tab) await gotoTab(el, tab);
}

test('nothing shows below the picker until something is chosen', async () => {
  const el = await mount();
  const sel = el.querySelector('.sab-app-select');
  expect(sel).toBeTruthy();
  expect(sel.value).toBe('');
  expect([...sel.options].map((o) => o.textContent))
    .toEqual(['Choose an App', 'Create new app…']);   // no apps in this fixture
  // no steps anywhere — one screen
  expect(el.querySelectorAll('[data-step]').length).toBe(0);
  expect(el.querySelector('.sab-areas')).toBeFalsy();
  // and nothing to do TO an app until one is in play
  expect(el.querySelector('[data-action="edit-app"]')).toBeFalsy();
  expect(el.querySelector('[data-action="preview-app"]')).toBeFalsy();
});

test('an app in play brings the four tabs, opening on Metadata', async () => {
  const el = await mount();
  await createHello(el, null);        // no tab click — see where it lands
  await settle();
  const tabs = [...el.querySelectorAll('.sab-app-btns [role="tab"]')];
  expect(tabs.map((b) => b.textContent))
    .toEqual(['Metadata', 'Add Features', 'Customize', 'Preview']);
  expect(tabs.map((b) => b.getAttribute('aria-selected')))
    .toEqual(['true', 'false', 'false', 'false']);
  // every tab has an id and names its panel; the register button is not a tab
  const list = el.querySelector('[role="tablist"]');
  expect(list).toBeTruthy();
  expect(list.querySelector('[data-action="register"]')).toBeFalsy();
  tabs.forEach((t) => {
    expect(t.id).toBeTruthy();
    expect(t.getAttribute('aria-controls')).toBeTruthy();
  });
  // only the SELECTED tab's panel is in the DOM (panels render lazily per tab),
  // and it is a tabpanel labelled by its tab
  const metaPanel = document.getElementById(tabs[0].getAttribute('aria-controls'));
  expect(metaPanel.getAttribute('role')).toBe('tabpanel');
  expect(metaPanel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
  expect(el.querySelector('#sab-meta')).toBeTruthy();
  expect(el.querySelector('.sab-areas')).toBeFalsy();
  // and Add Features is the two-column working screen
  await gotoTab(el, 'features');
  expect(el.querySelector('.sab-areas')).toBeTruthy();
  expect(el.querySelector('.sab-right')).toBeTruthy();
  expect(document.querySelector('sol-window')).toBeFalsy();
});

test('regions and elements are headed, and chips are movable list items', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // each region card's title is a real heading inside its legend
  const head = el.querySelector('.sab-acc-area legend .sab-legend-h');
  expect(head && head.tagName).toBe('H3');
  // chips are list items with a keyboard tab stop and their own Remove name
  const chip = el.querySelector('.sab-chip[data-node]');
  expect(chip.getAttribute('role')).toBe('listitem');
  expect(chip.getAttribute('tabindex')).toBe('0');
  const x = chip.querySelector('.sab-chip-x');
  expect(x.getAttribute('aria-label')).toMatch(/^Remove .+/);
  // the live region and DnD help survive a re-render (same node, still attached)
  const live = el.querySelector('.sab-a11y .sab-live');
  await gotoTab(el, 'customize');
  expect(el.querySelector('.sab-a11y .sab-live')).toBe(live);
});

test('the Preview tab shows the generated page in the work area', async () => {
  const el = await mount();
  await createHello(el);
  await gotoTab(el, 'preview');
  expect(el.querySelector('.sab-error')?.textContent || null).toBe(null);
  // in the page, not a modal or a floating window
  expect(document.querySelector('sol-modal')).toBeFalsy();
  expect(document.querySelector('sol-window')).toBeFalsy();
  const frame = el.querySelector('.sab-preview-pane iframe.sab-preview');
  expect(frame).toBeTruthy();
  expect(frame.getAttribute('src')).toBe(`${APPS}hello-world/index.html`);
});
test('the Metadata tab edits the app entry against the Plugin shape', async () => {
  const el = await mount();
  await createHello(el, 'meta');
  await settle(80);
  const form = el.querySelector('#sab-meta sol-form');
  expect(form).toBeTruthy();
  expect(form.getAttribute('subject')).toBe('http://pod.test/catalog.ttl#Hello-World');
  expect(form.getAttribute('shape')).toMatch(/shapes\/ui\.shacl$/);
  expect(document.querySelector('sol-window')).toBeFalsy();
});
test('the Metadata tab carries a confirm-guarded Delete this app', async () => {
  const el = await mount();
  await createHello(el, 'meta');
  await settle(80);
  const del = el.querySelector('.sab-meta-pane [data-del-app]');
  expect(del).toBeTruthy();
  expect(del.textContent).toBe('Delete this app');
  expect(del.dataset.delApp).toBe('hello-world');

  // declining the confirm deletes nothing
  const realConfirm = window.confirm;
  window.confirm = () => false;
  const before = writes.length;
  del.click();
  await settle(5);
  expect(writes.slice(before).some((w) => w.method === 'DELETE')).toBe(false);
  window.confirm = realConfirm;
});
test('Create app PUTs app.ttl and composes the full layout', async () => {
  const el = await mount();
  await createHello(el);
  const put = writes.find((w) => w.url === `${APPS}hello-world/app.ttl`);
  expect(put).toBeTruthy();
  expect(put.method).toBe('PUT');
  expect(put.body).toContain('a schema:WebApplication');
  expect(put.body).toContain('schema:name "Hello World"');
  expect(put.body).toContain('schema:inLanguage "en"');   // hand-editable, surfaced in app.ttl
  expect(put.body).toContain('ui:layout <layout.ttl#Layout>');
  // no layout picker, no steps — straight to the working screen
  expect(el.querySelector('.sab-areas')).toBeTruthy();

  // the composed layout: header + both sidebars + main + footer
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  expect(layoutPut.body).toContain('xhv:role "banner"');
  expect(layoutPut.body).toContain('xhv:role "contentinfo"');
  expect(layoutPut.body).toContain('app-side-left');
  expect(layoutPut.body).toContain('app-side-right');
  expect(layoutPut.body).not.toMatch(/schema:additionalType|WPSideBar/);
  // header autofill: site title, Tabbed Menu, the ? bar and the ☰
  expect(layoutPut.body).toContain('schema:url <site-title.html>');
  expect(layoutPut.body).toContain('ui:label "Tabbed Menu"');
  expect(layoutPut.body).toContain('ui:label "Button Menu"');
  expect(layoutPut.body).toContain('app-menu.ttl#MainButtonBar');
  // and the bar carries Help as a ? button; the ☰ keeps the appearance commands
  const barDoc = docs[`${APPS}hello-world/app-menu.ttl`];
  expect(barDoc).toContain('ui:label "?"');
  expect(barDoc).toContain('schema:url "help.html"');
  expect(barDoc.split(':MainHamburgerMenu')[1]).not.toContain(':Ham-Help');
  expect(docs[`${APPS}hello-world/help.html`]).toBeTruthy();
  // footer autofill: its Footer link
  expect(layoutPut.body).toContain('ui:label "Footer"');
  expect(layoutPut.body).toContain('schema:url <footer.html>');

  // the docs the layout names are seeded alongside it
  expect(docs[`${APPS}hello-world/site-title.html`]).toBeTruthy();
  expect(docs[`${APPS}hello-world/footer.html`]).toBeTruthy();
  const menuDoc = docs[`${APPS}hello-world/app-menu.ttl`];
  expect(menuDoc).toContain(':MainMenu a ui:Menu');
  expect(menuDoc).toContain(':MainHamburgerMenu a ui:Menu');
  expect(menuDoc).toContain('app-commands.ttl#toggleTheme');
  expect(docs[`${APPS}hello-world/app-commands.ttl`]).toContain(':cycleFontSize a ui:Command');
  expect(docs[`${APPS}hello-world/help.html`]).toContain('<h1>Help</h1>');
  // a FRAGMENT: it opens into the main pane, so it brings no document of its own
  expect(docs[`${APPS}hello-world/help.html`]).not.toContain('<style>');
});

test('an app that already has a layout keeps it — no recompose', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const before = docs[`${APPS}hello-world/layout.ttl`];
  writes = [];
  await el._ensureLayout(el._app);
  expect(writes.length).toBe(0);
  expect(docs[`${APPS}hello-world/layout.ttl`]).toBe(before);
});

// Simulate a native drop carrying the Place-Content MIME payload.
function dropFeature(target, payload) {
  const dt = { types: ['application/x-sab-feature'], getData: () => JSON.stringify(payload), dropEffect: '' };
  target.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: dt }));
}

// Press a key on whatever currently has focus, the way a keyboard user would.
function key(name) {
  (document.activeElement || document.body)
    .dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

const areaTitles = (el) => [...el.querySelectorAll('.sab-acc-area > legend.sab-acc-head')]
  .map((t) => t.textContent);

test('every region is a boxed card whose title sits on its border and is its drop target', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // header, both sidebars, main and footer all show (wrappers — root, Middle —
  // render transparently)
  expect(areaTitles(el)).toEqual(['Header', 'Left sidebar', 'Main', 'Right sidebar', 'Footer']);
  // the title sits on the box's border (a legend) and IS the drop zone
  expect(el.querySelector('fieldset.sab-acc-area > legend.sab-acc-head.sab-drop')).toBeTruthy();
  // autofilled chips
  const headerChips = [...el.querySelectorAll('.sab-acc-area:has(> legend[data-region$="#Header"]) .sab-chip')]
    .map((c) => c.textContent);
  expect(headerChips.some((t) => t.includes('Site Banner'))).toBe(true);
  expect(headerChips.some((t) => t.includes('Main menu'))).toBe(true);
  expect(headerChips.some((t) => t.includes('Button Menu'))).toBe(true);
  expect(headerChips.some((t) => t.includes('Button bar'))).toBe(true);
  const footerChips = [...el.querySelectorAll('.sab-acc-area:has(> legend[data-region$="#Footer"]) .sab-chip')]
    .map((c) => c.textContent);
  expect(footerChips.some((t) => t.includes('Footer'))).toBe(true);
});

test('every area but Main carries a ✕', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const withX = [...el.querySelectorAll('.sab-acc-area')]
    .filter((a) => a.querySelector(':scope > [data-area-action="remove"]'))
    .map((a) => a.querySelector(':scope > legend').textContent);
  expect(withX).toEqual(['Header', 'Left sidebar', 'Right sidebar', 'Footer']);
});

test("an area's ✕ removes the region, offers it back under UI elements, and clicking it restores it", async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  writes = [];
  const leftX = [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Left sidebar')
    .querySelector(':scope > [data-area-action="remove"]');
  leftX.click();
  await settle();
  // gone from the display AND from layout.ttl
  expect(areaTitles(el)).toEqual(['Header', 'Main', 'Right sidebar', 'Footer']);
  let layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  expect(layoutPut.body).not.toContain('app-side-left');
  // offered back as a chip in the UI-elements accordion, keyed by the area
  const back = [...el.querySelectorAll('#sab-features [data-restore-area]')]
    .find((b) => b.textContent.includes('Left sidebar'));
  expect(back).toBeTruthy();
  expect(back.dataset.restoreArea).toBe('Left');

  // click it → back where it was (left of Main), and out of the pantry
  writes = [];
  back.click();
  await settle();
  expect(areaTitles(el)).toEqual(['Header', 'Left sidebar', 'Main', 'Right sidebar', 'Footer']);
  layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('app-side-left');
  expect(el.querySelectorAll('#sab-features [data-restore-area]').length).toBe(0);
});

test("removing an area sends its contents back to their own bins", async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // the footer holds one chip: its Footer link
  writes = [];
  [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Footer')
    .querySelector(':scope > [data-area-action="remove"]').click();
  await settle();
  let layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).not.toContain('footer.html');
  // the AREA is offered under UI elements…
  expect([...el.querySelectorAll('#sab-features [data-restore-area]')]
    .map((b) => b.dataset.restoreArea)).toEqual(['Footer']);
  // …and its content back in the HTML Content bin
  expect([...el.querySelectorAll('#sab-content .sab-feat')]
    .some((f) => f.textContent.includes('Footer'))).toBe(true);

  // the area comes back EMPTY; the link is still waiting to be placed
  writes = [];
  el.querySelector('#sab-features [data-restore-area="Footer"]').click();
  await settle();
  const footer = [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Footer');
  expect(footer.querySelectorAll('.sab-chip').length).toBe(0);
  layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('xhv:role "contentinfo"');
  expect(layoutPut.body).not.toContain('footer.html');

  // dropping the link into it puts the content back
  const payload = JSON.parse([...el.querySelectorAll('#sab-content .sab-feat')]
    .find((f) => f.textContent.includes('Footer')).dataset.feature);
  writes = [];
  dropFeature(el.querySelector('.sab-acc-head[data-region$="#Footer"]'), payload);
  await settle();
  layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('footer.html');
  expect(layoutPut.body).toContain('ui:label "Footer"');
});

test('removing the header sends all three of its chips back', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Header')
    .querySelector(':scope > [data-area-action="remove"]').click();
  await settle();
  // the menus land under UI elements, beside the Header area itself
  const ui = [...el.querySelectorAll('#sab-features .sab-feat')].map((f) => f.textContent.trim());
  expect(ui).toEqual(expect.arrayContaining(['Header↩', 'Button Menu', 'Main menu']));
  // the site banner lands under HTML Content, not with the interface elements
  expect([...el.querySelectorAll('#sab-content .sab-feat')]
    .some((f) => f.textContent.includes('Site Banner'))).toBe(true);
  expect([...el.querySelectorAll('#sab-features .sab-feat')]
    .some((f) => f.textContent.includes('Site Banner'))).toBe(false);
});

test('a removed standard link is offered again and drops back as its own file', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // remove the start page: the list offers it, keyed to its file
  [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.includes('Start Page'))
    .querySelector('[data-el-action="remove"]').click();
  await settle();
  const offer = [...el.querySelectorAll('#sab-content .sab-feat')]
    .find((f) => f.textContent.includes('Start Page'));
  expect(offer).toBeTruthy();
  expect(JSON.parse(offer.dataset.feature)).toEqual({ op: 'link', key: 'StartPage' });

  // drop it into a sidebar instead — same file, new home
  writes = [];
  dropFeature(el.querySelector('.sab-acc-head[data-region$="#Left"]'),
    JSON.parse(offer.dataset.feature));
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('a ui:Link');
  expect(layoutPut.body).toContain('ui:label "Start Page"');
  // same file (the serializer writes same-origin urls path-absolute)
  expect(layoutPut.body).toMatch(/schema:url <[^>]*start-page\.html>/);
  // back in the layout, so no longer on offer
  expect([...el.querySelectorAll('#sab-content .sab-feat')]
    .some((f) => f.textContent.includes('Start Page'))).toBe(false);
});

test('removing a chip rewrites layout.ttl', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  writes = [];
  const hamChip = [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.startsWith('Button Menu'));
  hamChip.querySelector('[data-el-action="remove"]').click();
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  expect(layoutPut.body).not.toContain('sol-dropdown-button');
});

test('removing a chip offers it back in its accordion; restoring re-adds it', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // remove the site-title link chip
  const siteChip = [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.includes('Site Banner'));
  siteChip.querySelector('[data-el-action="remove"]').click();
  await settle();
  // it now shows in the HTML Content list, offered from the layout
  const restore = [...el.querySelectorAll('#sab-content .sab-feat')].find((f) => f.textContent.includes('Site Banner'));
  expect(restore).toBeTruthy();
  const payload = JSON.parse(restore.dataset.feature);
  expect(payload).toEqual({ op: 'link', key: 'SiteTitle' });
  // drop it back onto the Main area → the ui:Link returns
  writes = [];
  dropFeature(el.querySelector('.sab-acc-head[data-region$="#Main"]'), payload);
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('a ui:Link');
  expect(layoutPut.body).toContain('site-title.html');
  // and it's gone from the pantry
  expect([...el.querySelectorAll('#sab-content .sab-feat')].some((f) => f.textContent.includes('Site Banner'))).toBe(false);
});

test('the UI-elements list offers the menu views, and any standard link the layout lacks', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const feats = [...el.querySelectorAll('#sab-features .sab-feat')].map((f) => f.textContent.trim());
  // a full layout already holds all three links, so only the menu views are offered
  expect(feats).toEqual(['Menubar', 'Button Menu', 'Tabbed Menu', 'Button bar', 'Tree Menu']);
  // dropping the Button Menu names it that in the layout too, and the seeded
  // menu declares its view
  writes = [];
  const bmChip = [...el.querySelectorAll('#sab-features .sab-feat')]
    .find((f) => f.textContent.trim() === 'Button Menu');
  dropFeature(el.querySelector('.sab-acc-head[data-region$="#Main"]'),
    JSON.parse(bmChip.dataset.feature));
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('ui:label "Button Menu"');
  expect(writes.some((w) => w.body && w.body.includes('ui:view ui:MenuButton'))).toBe(true);
});

test('dragging a chip to another area moves it (moveNode)', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // the header's nav-menu chip (fragment #Menu) → move it into Main
  const menuChip = [...el.querySelectorAll('.sab-chip')].find((c) => c.dataset.node.endsWith('#Menu'));
  const node = menuChip.dataset.node;
  const mainDrop = el.querySelector('.sab-acc-head[data-region$="#Main"]');
  writes = [];
  dropFeature(mainDrop, { op: 'move', node });
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  // the Menu leaf now sits under :Main, not :Header
  expect(layoutPut.body).toMatch(/:Main-Menu a schema:ListItem; schema:item :Menu/);
});

test('the tab strip is arrow-navigable with a roving tabindex', async () => {
  const el = await mount();
  await createHello(el, null);
  await settle();
  const tabs = [...el.querySelectorAll('[role="tab"]')];
  expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  tabs[0].focus();
  key('ArrowRight');
  // focus and the roving index move, but the tab has NOT switched (manual activation)
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
  expect(el._tab).toBe('meta');
  key('End');
  expect(document.activeElement).toBe(tabs[3]);
});

test('keyboard: pick a chip up, choose a region, place it — same write as a drag', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // a plain (non-menu) chip picks up on Enter; a menu chip's Enter edits instead
  const chip = [...el.querySelectorAll('.sab-chip:not(.sab-chip-menu)[data-node]')][0];
  const node = chip.dataset.node;
  chip.focus();
  writes = [];
  key('Enter');                         // pick up
  expect(el._picked).toBeTruthy();
  // focus is now on a drop target; walk to Main and place
  let guard = 0;
  while (!(document.activeElement.dataset && /#Main$/.test(document.activeElement.dataset.region || '')) && guard++ < 10) {
    key('ArrowDown');
  }
  expect(/#Main$/.test(document.activeElement.dataset.region)).toBe(true);
  key('Enter');                         // place
  await settle();
  expect(el._picked).toBe(null);
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  // the moved leaf now sits under :Main
  const frag = node.split('#')[1];
  expect(layoutPut.body).toMatch(new RegExp(`:Main-${frag} a schema:ListItem; schema:item :${frag}`));
});

test('keyboard: Escape cancels a pick, writing nothing', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const chip = el.querySelector('.sab-chip[data-node]');
  chip.focus();
  writes = [];
  key('Enter');
  expect(el._picked).toBeTruthy();
  key('ArrowDown');
  key('Escape');
  await settle();
  expect(el._picked).toBe(null);
  expect(writes.some((w) => w.method === 'PUT' && /layout\.ttl$/.test(w.url))).toBe(false);
});

test('keyboard: a menu/content offering can be added without a mouse', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // the Footer region was created full; remove it so its page returns to the shelf
  const foot = el.querySelector('.sab-area-x[data-area$="#Footer"]');
  if (foot) { foot.click(); await settle(60); }
  // pick the first offering in the Interface-elements list
  const offer = el.querySelector('#sab-features .sab-feat[role="button"]');
  expect(offer).toBeTruthy();
  offer.focus();
  writes = [];
  key('Enter');
  expect(el._picked).toBeTruthy();
  let guard = 0;
  while (!(document.activeElement.classList && document.activeElement.classList.contains('sab-acc-head')) && guard++ < 12) {
    key('ArrowDown');
  }
  expect(document.activeElement.classList.contains('sab-acc-head')).toBe(true);
  key('Enter');
  await settle();
  expect(el._picked).toBe(null);
  expect(writes.some((w) => w.method === 'PUT' && /layout\.ttl$/.test(w.url))).toBe(true);
});

test('creating an app already writes index.html + app.css and the catalog entry', async () => {
  const el = await mount();
  await createHello(el);
  await settle();

  const html = writes.find((w) => w.url === `${APPS}hello-world/index.html`);
  expect(html).toBeTruthy();
  expect(html.type).toBe('text/html');
  expect(html.body).toContain('<title>Hello World</title>');
  // structure: header banner (holds the site-title link) + asides + main in the middle row
  expect(html.body).toContain('<header class="app-banner app-row" aria-label="Header">');
  expect(html.body).toContain('<sol-include source="site-title.html"');
  expect(html.body).toMatch(/<section[^>]*class="app-row"[\s\S]*?<aside[\s\S]*?<main class="app-main app-col" id="content" aria-label="Main">/);
  expect(html.body).toContain('<footer class="app-footer app-row"');
  // chrome scripts + visible sources
  expect(html.body).toContain('web/scripts/prefs.js');
  expect(html.body).toContain('web/scripts/app-commands.js');
  expect(html.body).toContain('from-rdf="app-menu.ttl#MainHamburgerMenu"');
  expect(html.body).toContain('sol-load.js');
  const css = writes.find((w) => w.url === `${APPS}hello-world/app.css`);
  expect(css).toBeTruthy();
  expect(css.body).toContain('.app-row');
  expect(css.body).toContain('body.app-col > section.app-row');

  // the catalog entry went in without anyone pressing anything
  const patch = writes.find((w) => w.method === 'PATCH');
  expect(patch).toBeTruthy();
  expect(patch.url).toBe('http://pod.test/catalog.ttl');
  expect(patch.type).toBe('application/sparql-update');
  expect(patch.body).toContain('INSERT DATA');
  expect(patch.body).toContain('a <http://www.w3.org/ns/ui#Plugin>');
  expect(patch.body).toContain('<http://schema.org/additionalType> <http://www.w3.org/ns/ui#Link>');
  expect(patch.body).toContain(`<${APPS}hello-world/index.html>`);
  expect(patch.body).toContain('<http://www.w3.org/ns/ui#label> "Hello World"');
  // nothing left to press — it all happened on create
  expect(el.querySelector('[data-action="generate"]')).toBeFalsy();
  expect(el.querySelector('[data-action="register"]')).toBeFalsy();
});

test('every layout change rewrites index.html too', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  writes = [];
  [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.startsWith('Button Menu'))
    .querySelector('[data-el-action="remove"]').click();
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  const htmlPut = writes.find((w) => w.url === `${APPS}hello-world/index.html`);
  expect(layoutPut).toBeTruthy();
  expect(htmlPut).toBeTruthy();
  expect(htmlPut.body).not.toContain('sol-dropdown-button');   // the page followed
});

test('a failed PATCH (CSS lock expired) falls back to whole-doc PUT', async () => {
  patchFails = true;
  const el = await mount();
  await createHello(el);
  await settle();
  const put = writes.find((w) => w.method === 'PUT' && w.url === 'http://pod.test/catalog.ttl');
  expect(put).toBeTruthy();
  expect(put.body).toContain('#Available'); // the original doc is preserved
  expect(put.body).toContain(`<${APPS}hello-world/index.html>`);
  expect(put.body).toContain(`<http://www.w3.org/ns/ui#Plugin>`);
});

// A pantry card carries its own MIME and payload shape.
function dropPlugin(target, payload) {
  const dt = {
    types: ['application/x-sol-plugin'],
    getData: (t) => (t === 'application/x-sol-plugin' ? JSON.stringify(payload) : ''),
    dropEffect: '',
  };
  target.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: dt }));
}

test('Add/Edit Features: one card per region, everything it holds as chips', async () => {
  const el = await mount();
  await createHello(el);
  const heads = [...el.querySelectorAll('.sab-acc-head')].map((h) => h.textContent.trim());
  expect(heads).toEqual(['Header', 'Left sidebar', 'Main', 'Right sidebar', 'Footer']);
  // EVERY region shows what it holds — nothing is folded away
  expect(el.querySelectorAll('.sab-acc-body').length).toBe(5);
  expect([...el.querySelectorAll('.sab-acc-head')].every((h) => h.classList.contains('sab-drop')))
    .toBe(true);
  // the region's own members, menus included — as CHIPS, not cards
  const chips = [...el.querySelectorAll('.sab-acc-body .sab-chip')].map((c) => c.textContent);
  expect(chips.some((t) => t.includes('Site Banner'))).toBe(true);
  expect(chips.some((t) => t.includes('Main menu'))).toBe(true);
  // main and footer show theirs at the same time
  const cardChips = (name) => [...[...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector('.sab-acc-head').textContent.trim() === name)
    .querySelectorAll('.sab-chip')].map((c) => c.textContent).join();
  expect(cardChips('Main')).toContain('Start Page');
  expect(cardChips('Footer')).toContain('Footer');
  // a menu chip opens its editor; it is not a drop target
  const menuChip = [...el.querySelectorAll('.sab-chip-menu')].find((c) => c.textContent.includes('Main menu'));
  expect(menuChip.dataset.menuSrc).toBeUndefined();

  const pantry = el.querySelector('sol-plugin-manager');
  expect(pantry.getAttribute('source')).toBe(CATALOG);
  expect(pantry.hasAttribute('grouped')).toBe(true);
});

test('clicking a menu chip on Add Features opens its editor on Customize', async () => {
  const el = await mount();
  await createHello(el, 'features');
  await settle(60);
  const menuChip = [...el.querySelectorAll('.sab-chip-menu')].find((c) => c.textContent.includes('Main menu'));
  expect(menuChip).toBeTruthy();
  menuChip.click();
  await settle(140);
  // it switched tabs and opened the Main menu row's editor in place
  expect(el._tab).toBe('customize');
  const open = [...el.querySelectorAll('.sab-el')]
    .find((r) => r.querySelector('.sab-el-head')?.getAttribute('aria-expanded') === 'true');
  expect(open).toBeTruthy();
  expect(open.querySelector('.sab-el-head').textContent).toBe('Main menu');
  expect(document.querySelector('sol-window')).toBeFalsy();
});

test('Customize lists the app\u2019s elements — not its regions', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  const heads = [...el.querySelectorAll('#sab-custom .sab-el-head')];
  expect(heads.map((c) => c.textContent))
    .toEqual(['Site Banner', 'Main menu', 'Button bar', 'Button Menu', 'Start Page', 'Footer']);
  // one per line, all closed, and no box around the list
  expect(heads.every((h) => h.getAttribute('aria-expanded') === 'false')).toBe(true);
  expect(el.querySelector('#sab-custom legend')).toBeFalsy();
  // regions are Add Features' business; so is placing new interface elements
  expect(el.querySelector('#sab-custom .sab-acc-area')).toBeFalsy();
  expect(el.querySelector('.sab-panel-elements')).toBeFalsy();
  expect(el.querySelector('#sab-content')).toBeTruthy();
  expect(el.querySelector('sol-plugin-manager').getAttribute('for'))
    .toBe('#sab-custom sol-menu-manager, #sab-custom sol-button-bar-manager');
});

test('clicking an element opens its editor IN the column — the KIND shape plus its items', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Main menu').click();
  await settle(120);
  expect(document.querySelector('sol-window')).toBeFalsy();
  const box = el.querySelector('.sab-el[data-el$="#MainMenu"], .sab-el');
  const open = [...el.querySelectorAll('.sab-el')]
    .find((r) => r.querySelector('.sab-el-head').getAttribute('aria-expanded') === 'true');
  expect(open.querySelector('.sab-el-head').textContent).toBe('Main menu');
  const form = open.querySelector('sol-form');
  // the menu node itself, against the shape for THIS kind of menu
  expect(form.getAttribute('subject')).toBe(`${APPS}hello-world/app-menu.ttl#MainMenu`);
  expect(form.getAttribute('shape')).toMatch(/ui\.shacl#MenubarMenuShape$/);
  // and the manager below it, to see, reorder and drop plugins into
  const mgr = open.querySelector('sol-menu-manager');
  expect(mgr).toBeTruthy();
  expect(mgr.getAttribute('source')).toBe(`${APPS}hello-world/app-menu.ttl#MainMenu`);
  // clicking the open one folds it away again
  open.querySelector('.sab-el-head').click();
  await settle();
  expect(open.querySelector('.sab-el-head').getAttribute('aria-expanded')).toBe('false');
  expect(open.querySelector('sol-form')).toBeFalsy();
  expect(el.querySelectorAll('.sab-el-head').length).toBe(6);
});

test('a plugin element opens the settings ITS component declares', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  customElements.define('sab-probe-plugin', class extends HTMLElement {
    static get shape() { return 'http://pod.test/probe.shacl'; }
  });
  // a plugin whose class declares a shape, placed in the layout
  const region = el._fillableAreas().find((r) => r.role === 'main');
  region.parts.push({
    kind: 'leaf', node: { value: `${APPS}hello-world/layout.ttl#Probe` }, url: 'sab-probe-plugin',
    item: { tag: 'sab-probe-plugin', name: 'Probe', params: [['source', 'http://pod.test/probe.ttl#it']] },
  });
  el._renderCustomList();
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Probe').click();
  await settle(150);
  const form = el.querySelector('#sab-custom sol-form');
  // the component's own shape and subject — NOT the layout entry naming its module
  expect(form.getAttribute('shape')).toBe('http://pod.test/probe.shacl');
  expect(form.getAttribute('subject')).toBe('http://pod.test/probe.ttl#it');
});

test('the ☰ element answers to the MenuButton shape', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Button Menu').click();
  await settle(120);
  expect(el.querySelector('#sab-custom sol-form').getAttribute('shape'))
    .toMatch(/ui\.shacl#MenuButtonMenuShape$/);
});

test('changing the menu doc ui:view remounts the layout leaf and re-keys the editor', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Main menu').click();
  await settle(120);
  // the owner switches Main menu's view to Tabs: the saved doc is the truth
  const menuDoc = `${APPS}hello-world/app-menu.ttl`;
  docs[menuDoc] = docs[menuDoc].replace('ui:view ui:Menubar', 'ui:view ui:Tablist');
  writes = [];
  el.querySelector('#sab-custom sol-form')
    .dispatchEvent(new CustomEvent('sol-form-save', { bubbles: true }));
  await settle(250);
  // the leaf remounted to the Tablist view's component, keeping its own params
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  expect(layoutPut.body).toContain('sol-tabs.js');
  expect(layoutPut.body).toContain('keep-alive');
  expect(layoutPut.body).toContain('app-menu.ttl#MainMenu');   // from-rdf rides through
  // …the page regenerated…
  expect(writes.some((w) => w.url.endsWith('index.html') && w.body.includes('<sol-tabs'))).toBe(true);
  // …and the reopened editor answers to the new view's shape
  const open = [...el.querySelectorAll('.sab-el')]
    .find((r) => r.querySelector('.sab-el-head').getAttribute('aria-expanded') === 'true');
  expect(open.querySelector('sol-form').getAttribute('shape')).toMatch(/#TablistMenuShape$/);
  expect(open.querySelector('sol-menu-manager')).toBeTruthy();
});

test('a plugin dropped on a REGION card lands in that region', async () => {
  docs['http://pod.test/catalog.ttl'] += `
<#Clock> a ui:Plugin ;
  <http://schema.org/additionalType> ui:Component ;
  ui:label "Clock" ;
  <http://schema.org/url> <http://pod.test/components/web/sol-time.js> .
`;
  const el = await mount();
  await createHello(el);
  writes = [];
  dropPlugin(el.querySelector('.sab-acc-body'), {
    label: 'Clock', tag: 'sol-time', params: [['zone', 'UTC']],
    subject: 'http://pod.test/catalog.ttl#Clock',
  });
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut).toBeTruthy();
  expect(layoutPut.body).toContain('ui:label "Clock"');
  // the entry's OWN module, not a guess from the tag (same-origin urls
  // serialize path-absolute)
  expect(layoutPut.body).toContain('schema:url </components/web/sol-time.js>');
  expect(layoutPut.body).toContain('schema:value "UTC"');
  expect(writes.find((w) => w.url === `${APPS}hello-world/index.html`).body).toContain('sol-time');
  expect([...el.querySelectorAll('.sab-acc-body .sab-chip')].some((c) => c.textContent.includes('Clock')))
    .toBe(true);
});

test('a dropped link plugin becomes a ui:Link', async () => {
  const el = await mount();
  await createHello(el);
  writes = [];
  dropPlugin(el.querySelector('.sab-acc-body'),
    { label: 'Docs', href: 'https://docs.example/', icon: '📘' });
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('a ui:Link');
  expect(layoutPut.body).toContain('ui:label "Docs"');
  expect(layoutPut.body).toContain('schema:url <https://docs.example/>');
});

test('a placed plugin shows as a chip in its region', async () => {
  const el = await mount();
  await createHello(el);
  dropPlugin(el.querySelector('.sab-acc-body'),
    { label: 'Clock', tag: 'sol-time', params: [] });
  await settle();
  expect([...el.querySelectorAll('.sab-acc-body .sab-chip')].some((c) => c.textContent.includes('Clock')))
    .toBe(true);
});

test('deleting an app removes the folder and refreshes the picker', async () => {
  docs[`${APPS}old-app/app.ttl`] = `@prefix schema: <http://schema.org/> .
<#app> a schema:WebApplication ; schema:name "Old App" .
`;
  containers[APPS] = [{ url: `${APPS}old-app/`, name: 'old-app', isContainer: true }];
  const el = await mount();
  // the picker lists the app itself
  expect([...el.querySelectorAll('.sab-app-select option')].map((o) => o.value))
    .toEqual(['', 'old-app', '__new']);
  await openApp(el, 'old-app');

  // declining the confirm deletes nothing
  window.confirm = () => false;
  await el._deleteApp('old-app');
  await settle();
  expect(deleted).toEqual([]);

  // confirming deletes the folder; the app is gone from the picker
  window.confirm = () => true;
  delete containers[APPS];
  await el._deleteApp('old-app');
  await settle();
  expect(deleted).toEqual([`${APPS}old-app/`]);
  expect(el.querySelector('[data-app="old-app"]')).toBeFalsy();
});

test('the offer is read from the layout, so it survives a reload', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Right sidebar')
    .querySelector(':scope > [data-area-action="remove"]').click();
  await settle();
  // a fresh element over the SAME pod docs (nothing carried in memory)
  containers[APPS] = [{ url: `${APPS}hello-world/`, name: 'hello-world', isContainer: true }];
  const el2 = await mount();
  await openApp(el2, 'hello-world');
  expect(areaTitles(el2)).toEqual(['Header', 'Left sidebar', 'Main', 'Footer']);
  const back = [...el2.querySelectorAll('#sab-features [data-restore-area]')]
    .find((b) => b.dataset.restoreArea === 'Right');
  expect(back).toBeTruthy();
  // restoring in the new session rebuilds it empty, in its own slot
  writes = [];
  back.click();
  await settle();
  expect(areaTitles(el2)).toEqual(['Header', 'Left sidebar', 'Main', 'Right sidebar', 'Footer']);
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('app-side-right');
  expect(layoutPut.body).toContain('xhv:role "complementary"');
});

test('only the missing areas are offered', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  // a full layout offers none of them
  expect(el.querySelectorAll('#sab-features [data-restore-area]').length).toBe(0);
  for (const name of ['Header', 'Footer']) {
    [...el.querySelectorAll('.sab-acc-area')]
      .find((a) => a.querySelector(':scope > legend').textContent === name)
      .querySelector(':scope > [data-area-action="remove"]').click();
    await settle();
  }
  expect([...el.querySelectorAll('#sab-features [data-restore-area]')]
    .map((b) => b.dataset.restoreArea)).toEqual(['Header', 'Footer']);
});

test('a removed area can be dragged back as well as clicked', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  [...el.querySelectorAll('.sab-acc-area')]
    .find((a) => a.querySelector(':scope > legend').textContent === 'Right sidebar')
    .querySelector(':scope > [data-area-action="remove"]').click();
  await settle();
  const back = el.querySelector('#sab-features [data-restore-area]');
  expect(back.getAttribute('draggable')).toBe('true');
  const payload = JSON.parse(back.dataset.feature);
  expect(payload).toEqual({ op: 'restore-area', area: 'Right' });
  // dropped anywhere — it returns to its own slot, not the drop target
  writes = [];
  dropFeature(el.querySelector('.sab-acc-head[data-region$="#Header"]'), payload);
  await settle();
  expect(areaTitles(el)).toEqual(['Header', 'Left sidebar', 'Main', 'Right sidebar', 'Footer']);
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('app-side-right');
});

test('an element opens against its own node and the shipped shape', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Site Banner').click();
  await settle(80);
  const form = el.querySelector('#sab-custom sol-form');
  expect(form).toBeTruthy();
  // the shape doc is the shipped contract; the subject is the item's own node
  expect(form.getAttribute('shape')).toMatch(/shapes\/ui\.shacl$/);
  expect(form.getAttribute('subject')).toBe(`${APPS}hello-world/layout.ttl#SiteTitle`);
});

test("a chip's ✕ removes it", async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const chip = [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.includes('Site Banner'));
  chip.querySelector('[data-el-action="remove"]').click();
  await settle();
  expect(document.querySelector('sol-window')).toBeFalsy();
  expect([...el.querySelectorAll('.sab-chip')].some((c) => c.textContent.includes('Site Banner'))).toBe(false);
});

test("a content item's editor also holds its html, and saves it", async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Footer').click();
  await settle(80);
  const box = el.querySelector('#sab-custom section');
  expect(box).toBeTruthy();
  expect(box.querySelector('strong').textContent).toBe('footer.html');
  // seeded content, read from the pod doc
  const area = box.querySelector('textarea');
  expect(area.value).toContain('Built with the Solid App Builder');

  // Save content PUTs the textarea back to that file
  writes = [];
  area.value = '<p>New footer.</p>';
  [...box.querySelectorAll('button')].find((b) => b.textContent === 'Save content').click();
  await settle(40);
  const put = writes.find((w) => w.url === `${APPS}hello-world/footer.html`);
  expect(put).toBeTruthy();
  expect(put.method).toBe('PUT');
  expect(put.type).toBe('text/html');
  expect(put.body).toBe('<p>New footer.</p>');
});

test('a component item gets no content textarea', async () => {
  const el = await mount();
  await createHello(el, 'customize');
  [...el.querySelectorAll('.sab-el-head')].find((c) => c.textContent === 'Button Menu').click();
  await settle(80);
  expect(el.querySelector('#sab-custom sol-form')).toBeTruthy();
  expect(el.querySelector('#sab-custom textarea')).toBeFalsy();
});

test("deleting an app takes its catalog entry out too", async () => {
  docs[`${APPS}old-app/app.ttl`] = `@prefix schema: <http://schema.org/> .
<#app> a schema:WebApplication ; schema:name "Old App" .
`;
  docs['http://pod.test/catalog.ttl'] = `@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
<#Available> a ui:Menu ; ui:label "Available" .
<#Old-App> a ui:Plugin ;
  schema:additionalType ui:Link ;
  ui:label "Old App" ;
  schema:url <${APPS}old-app/index.html> .
`;
  containers[APPS] = [{ url: `${APPS}old-app/`, name: 'old-app', isContainer: true }];
  const el = await mount();
  await openApp(el, 'old-app');
  window.confirm = () => true;
  writes = [];
  await el._deleteApp('old-app');
  await settle();
  // the folder went…
  expect(deleted).toEqual([`${APPS}old-app/`]);
  // …and so did its entry, by its concrete triples
  const patch = writes.find((w) => w.method === 'PATCH' && w.url === 'http://pod.test/catalog.ttl');
  expect(patch).toBeTruthy();
  expect(patch.body).toContain('DELETE DATA');
  expect(patch.body).toContain('<http://pod.test/catalog.ttl#Old-App>');
  expect(patch.body).toContain(`<${APPS}old-app/index.html>`);
  expect(patch.body).toContain('<http://www.w3.org/ns/ui#label> "Old App"');
  expect(el.querySelector('.sab-error')).toBeFalsy();
});

test('an app made before the entry was automatic can still be catalogued', async () => {
  docs[`${APPS}legacy/app.ttl`] = `@prefix schema: <http://schema.org/> .
<#app> a schema:WebApplication ; schema:name "Legacy" .
`;
  docs[`${APPS}legacy/layout.ttl`] = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#> .
:Layout a ui:Layout ; ui:label "Legacy" ; xhv:role "document" .
`;
  containers[APPS] = [{ url: `${APPS}legacy/`, name: 'legacy', isContainer: true }];
  const el = await mount();
  await openApp(el, 'legacy');
  const add = el.querySelector('[data-action="register"]');
  expect(add).toBeTruthy();
  writes = [];
  add.click();
  await settle();
  const patch = writes.find((w) => w.method === 'PATCH' && w.url === 'http://pod.test/catalog.ttl');
  expect(patch.body).toContain('INSERT DATA');
  expect(patch.body).toContain(`<${APPS}legacy/index.html>`);
  // offered once — the button is gone now it is in
  expect(el.querySelector('[data-action="register"]')).toBeFalsy();
});

// The catalog as the metadata form leaves it: the app's entry, renamed.
const catalogNaming = (entry, label, icon) => `@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
<#Available> a ui:Menu ; ui:label "Available" .
<${entry}> a ui:Plugin ; ui:label "${label}" ; ui:icon "${icon}" ;
  schema:url <${APPS}hello-world/index.html> .
`;

test('a label edited in the catalog becomes the app\u2019s name everywhere', async () => {
  const el = await mount();
  containers[APPS] = [{ url: `${APPS}hello-world/`, name: 'hello-world', isContainer: true }];
  await createHello(el);
  await settle();
  const entry = el._app.entry;
  expect(entry).toBeTruthy();
  // the banner the builder seeded carries the name it was created with
  expect(docs[`${APPS}hello-world/site-title.html`].trim()).toBe('<h1>Hello World</h1>');

  // the metadata form renames the entry; adopting it is what the editor's
  // save handler does
  docs['http://pod.test/catalog.ttl'] = catalogNaming(entry, 'Kitchen Sink', '\uD83E\uDDFD');
  writes = [];
  await el._adoptEntryName(el._app);
  await settle(60);

  // app.ttl — the picker reads its name from here
  const appTtl = docs[`${APPS}hello-world/app.ttl`];
  expect(appTtl).toContain('schema:name "Kitchen Sink"');
  expect(appTtl).toContain('ui:icon "\uD83E\uDDFD"');
  expect(el._app.name).toBe('Kitchen Sink');
  // the banner follows, and index.html is regenerated
  expect(docs[`${APPS}hello-world/site-title.html`].trim()).toBe('<h1>Kitchen Sink</h1>');
  expect(docs[`${APPS}hello-world/index.html`]).toContain('<title>Kitchen Sink</title>');
});

test('a banner the owner wrote survives a rename', async () => {
  const el = await mount();
  containers[APPS] = [{ url: `${APPS}hello-world/`, name: 'hello-world', isContainer: true }];
  await createHello(el);
  await settle();
  docs[`${APPS}hello-world/site-title.html`] = '<h1>My Own Words</h1>\n';
  docs['http://pod.test/catalog.ttl'] = catalogNaming(el._app.entry, 'Renamed', '\uD83C\uDF73');
  await el._adoptEntryName(el._app);
  await settle(60);
  expect(docs[`${APPS}hello-world/app.ttl`]).toContain('schema:name "Renamed"');
  expect(docs[`${APPS}hello-world/site-title.html`].trim()).toBe('<h1>My Own Words</h1>');
});

test('the picker lists the apps and reflects the one in play', async () => {
  const el = await mount();
  containers[APPS] = [{ url: `${APPS}hello-world/`, name: 'hello-world', isContainer: true }];
  await createHello(el);
  await settle();
  const sel = el.querySelector('.sab-app-select');
  // the picker lists the apps and reflects the one in play
  expect([...sel.options].map((o) => o.value)).toEqual(['', 'hello-world', '__new']);
  expect(sel.value).toBe('hello-world');
  // the picker itself names the app; no separate label, no delete
  expect(el.querySelector('.sab-current')).toBeFalsy();
  expect(el.querySelector('[data-del-app]')).toBeFalsy();
});

test('with no app in play there is nothing beside the picker', async () => {
  const el = await mount();
  expect(el.querySelector('.sab-current')).toBeFalsy();
  await pick(el, '__new');
  expect(el.querySelector('.sab-current')).toBeFalsy();
});

test('clicking a chip does nothing — the item editor moved to the next screen', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const chip = [...el.querySelectorAll('.sab-chip')].find((c) => c.textContent.includes('Site Banner'));
  expect(chip.getAttribute('title')).toBeNull();
  chip.click();
  await settle(60);
  expect(document.querySelector('sol-window')).toBeFalsy();
});

test('the HTML Content panel offers NEW html content', async () => {
  const el = await mount();
  await createHello(el);
  const shelf = el.querySelector('.sab-shelf');
  // the panel names itself on its border
  expect(shelf.querySelector('legend').textContent).toBe('HTML Content');
  expect(el.querySelector('.sab-panel-fill > legend').textContent).toBe('Plugins Available');
  expect(el.querySelector('.sab-panel-fill [data-action="add-plugin"]').textContent).toBe('Add plugins');
  expect([...shelf.querySelectorAll('[data-content]')].map((n) => n.textContent.trim()))
    .toEqual(['New HTML Content']);
  // a full layout lacks only the help page, so that is what else is offered
  expect([...el.querySelectorAll('#sab-content .sab-feat')].map((n) => n.textContent.trim()))
    .toEqual(['New HTML Content', 'Help Page']);
});

test('every chip carries a ✕, standard content links included', async () => {
  const el = await mount();
  await createHello(el);
  const chipFor = (t) => [...el.querySelectorAll('.sab-acc-body .sab-chip')]
    .find((c) => c.textContent.includes(t));
  // every chip is removable here, the standard content links included
  for (const t of ['Site Banner', 'Start Page', 'Footer']) {
    expect(chipFor(t)).toBeTruthy();
    expect(chipFor(t).querySelector('[data-el-action="remove"]')).toBeTruthy();
  }
  // …and so is a plugin placed here
  dropPlugin(el.querySelector('.sab-acc-body'), { label: 'Clock', tag: 'sol-time', params: [] });
  await settle();
  expect(chipFor('Clock').querySelector('[data-el-action="remove"]')).toBeTruthy();
});

test('dropping New HTML Content mints and seeds a fresh file', async () => {
  const el = await mount();
  await createHello(el);
  writes = [];
  dropPlugin(el.querySelector('.sab-acc-body[data-region$="#Main"]'),
    { label: 'Content', newContent: true, icon: '🔗' });
  await settle();
  const seeded = writes.find((w) => w.url === `${APPS}hello-world/content.html`);
  expect(seeded).toBeTruthy();
  expect(seeded.type).toBe('text/html');
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('ui:label "Content"');
  expect(layoutPut.body).toMatch(/schema:url <[^>]*content\.html>/);
});

test('a standard content link dropped on a region becomes a ui:Link', async () => {
  const el = await mount();
  await createHello(el);
  // drop the Footer content into Main (its file already exists)
  writes = [];
  dropPlugin(el.querySelector('.sab-acc-body[data-region$="#Main"]'),
    { label: 'Footer', href: 'footer.html', icon: '🔗' });
  await settle();
  const layoutPut = writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`);
  expect(layoutPut.body).toContain('a ui:Link');
  expect(layoutPut.body).toContain('ui:label "Footer"');
  expect(layoutPut.body).toMatch(/schema:url <[^>]*footer\.html>/);
});

test('a content link dropped on a menu chip lands in the region', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const menuChip = [...el.querySelectorAll('.sab-chip-menu')].find((c) => c.textContent.includes('Main menu'));
  delete docs[`${APPS}hello-world/start-page.html`];
  writes = [];
  dropPlugin(menuChip, { label: 'Start Page', href: 'start-page.html', icon: '🔗' });
  await settle();
  // the LAYOUT took it — menus are edited in their own editor now
  expect(writes.find((w) => w.url === `${APPS}hello-world/app-menu.ttl`)).toBeFalsy();
  expect(writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`).body)
    .toMatch(/schema:url <[^>]*start-page\.html>/);
  // the file the link names is still brought into being
  expect(writes.find((w) => w.url === `${APPS}hello-world/start-page.html`)).toBeTruthy();
});


test('controls="…" seats the top row in the page, and it still works there', async () => {
  document.body.innerHTML = `<div id="host"></div>
    <sol-app-builder id="b2" apps-root="${APPS}" catalog="${CATALOG}"
      controls="#host"></sol-app-builder>`;
  const el = document.getElementById('b2');
  const host = document.getElementById('host');
  containers[APPS] = [{ url: `${APPS}hosted/`, name: 'hosted', isContainer: true }];
  await settle();
  // the picker renders in the HOST, not in the component
  expect(host.querySelector('.sab-app-select')).toBeTruthy();
  expect(el.querySelector('.sab-app-select')).toBeFalsy();

  // and driving it from there works: create an app
  const sel = host.querySelector('.sab-app-select');
  sel.value = '__new';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  el.querySelector('[name=app-name]').value = 'Hosted';
  el.querySelector('form.sab-new button[type=submit]').click();
  await settle(90);
  // the picker and the tabs land in the host too; the work area in the component
  expect(host.querySelector('.sab-app-select').value).toBe('hosted');
  expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.dataset.tab))
    .toEqual(['meta', 'features', 'customize', 'preview']);
  expect(el.querySelector('#sab-meta')).toBeTruthy();
  expect(el.querySelector('.sab-top')).toBeFalsy();
  // and a tab clicked THERE drives the work area here
  await gotoTab(el, 'features', host);
  expect(el.querySelector('.sab-areas')).toBeTruthy();
});

test('a plugin dropped on a menu chip lands in the REGION, not the menu', async () => {
  const el = await mount();
  await createHello(el);
  await settle();
  const menuChip = [...el.querySelectorAll('.sab-chip-menu')].find((c) => c.textContent.includes('Main menu'));
  expect(menuChip.dataset.menuSrc).toBeUndefined();   // no longer a drop target
  writes = [];
  dropPlugin(menuChip, { label: 'Clock', tag: 'sol-time', params: [] });
  await settle();
  // the layout took it; the menu document was not touched
  expect(writes.find((w) => w.url === `${APPS}hello-world/layout.ttl`).body).toContain('ui:label "Clock"');
  expect(writes.find((w) => w.url === `${APPS}hello-world/app-menu.ttl`)).toBeFalsy();
  expect([...el.querySelectorAll('.sab-acc-body .sab-chip')].some((c) => c.textContent.includes('Clock')))
    .toBe(true);
});
