/**
 * @jest-environment jsdom
 *
 * Tests for <sol-wac> — the Web Access Control editor:
 *   - getAclUrl: Link-header discovery and the .acl fallback
 *   - getPermissions: own ACL, inherited ACL from a parent, nothing found
 *   - SolWac component: source/fetchFn accessors, load(), save(),
 *     rendering (role form + RDF subtabs), and the sol-wac-* events
 *
 * The ACL pure functions (parseAcl / authsToRoleModel / roleModelToTurtle
 * / adaptInheritedAcl) are exercised separately in security.test.js.
 */

import rdflib from '../__mocks__/rdflib-esm.js';
window.$rdf = rdflib;
window.__SolSuppressDefineWarn = true;

import { SolWac, getAclUrl, getPermissions } from '../../web/sol-wac.js';

const ACL  = 'http://www.w3.org/ns/auth/acl#';
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const FOAF = 'http://xmlns.com/foaf/0.1/';

const flush = (n = 4) => new Promise(r => setTimeout(r, 0))
  .then(() => (n > 1 ? flush(n - 1) : undefined));

afterEach(() => { document.body.innerHTML = ''; });

// An owner Authorization (Read+Control, public) on file.ttl's own ACL.
const OWNER_ACL =
  `<https://pod.example/file.ttl.acl#owner> <${RDF}type> <${ACL}Authorization> .\n` +
  `<https://pod.example/file.ttl.acl#owner> <${ACL}mode> <${ACL}Read> .\n` +
  `<https://pod.example/file.ttl.acl#owner> <${ACL}mode> <${ACL}Control> .\n` +
  `<https://pod.example/file.ttl.acl#owner> <${ACL}agentClass> <${FOAF}Agent> .\n`;

// Fake authenticated fetch: HEAD advertises no acl Link (forcing the .acl
// fallback), GET serves any ACL in `acls`, PUT is recorded.
function mkFetch({ acls = {}, putOk = true } = {}) {
  const puts = [];
  const fn = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (method === 'HEAD') {
      return { ok: true, status: 200, headers: { get: () => null } };
    }
    if (method === 'PUT') {
      puts.push({ url, body: opts.body });
      return putOk
        ? { ok: true, status: 205, statusText: 'Reset Content' }
        : { ok: false, status: 403, statusText: 'Forbidden' };
    }
    if (url in acls) return { ok: true, status: 200, text: async () => acls[url] };
    return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  };
  fn.puts = puts;
  return fn;
}

async function mkWac(source, fetchFn) {
  const el = document.createElement('sol-wac');
  el._fetchFn = fetchFn;                       // bypass the load()-triggering setter
  if (source) el.setAttribute('source', source);
  document.body.appendChild(el);               // connectedCallback → load()
  await flush();
  return el;
}

// ── getAclUrl ───────────────────────────────────────────────────────────────

describe('getAclUrl', () => {
  test('uses the acl Link header when the server advertises one', async () => {
    const fetchFn = async () => ({
      headers: { get: (h) => (h === 'Link' ? '<https://pod.example/special.acl>; rel="acl"' : null) },
    });
    expect(await getAclUrl('https://pod.example/file.ttl', fetchFn))
      .toBe('https://pod.example/special.acl');
  });

  test('falls back to resource + ".acl" when there is no Link header', async () => {
    const fetchFn = async () => ({ headers: { get: () => null } });
    expect(await getAclUrl('https://pod.example/file.ttl', fetchFn))
      .toBe('https://pod.example/file.ttl.acl');
  });

  test('falls back to ".acl" when the HEAD request throws', async () => {
    const fetchFn = async () => { throw new Error('network'); };
    expect(await getAclUrl('https://pod.example/file.ttl', fetchFn))
      .toBe('https://pod.example/file.ttl.acl');
  });
});

// ── getPermissions ──────────────────────────────────────────────────────────

describe('getPermissions', () => {
  test('returns the resource\'s own ACL when one exists', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const perms = await getPermissions('https://pod.example/file.ttl', fetchFn);
    expect(perms.own).toBe(OWNER_ACL);
    expect(perms.aclUrl).toBe('https://pod.example/file.ttl.acl');
    expect(perms.inherited).toBe(null);
  });

  test('inherits a parent container ACL when the resource has none', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/docs/.acl': OWNER_ACL } });
    const perms = await getPermissions('https://pod.example/docs/file.ttl', fetchFn);
    expect(perms.own).toBe(null);
    expect(perms.inherited).toBe(OWNER_ACL);
    expect(perms.inheritedFrom).toBe('https://pod.example/docs/');
  });

  test('returns nulls when no ACL is found anywhere', async () => {
    const fetchFn = mkFetch({ acls: {} });
    const perms = await getPermissions('https://pod.example/docs/file.ttl', fetchFn);
    expect(perms.own).toBe(null);
    expect(perms.inherited).toBe(null);
  });
});

// ── component scaffold ──────────────────────────────────────────────────────

describe('SolWac — accessors', () => {
  test('observes the source attribute', () => {
    expect(SolWac.observedAttributes).toEqual(['source']);
  });

  test('source getter/setter mirrors the attribute', () => {
    const el = document.createElement('sol-wac');
    el.source = 'https://pod.example/x';
    expect(el.getAttribute('source')).toBe('https://pod.example/x');
    el.source = '';
    expect(el.hasAttribute('source')).toBe(false);
  });

  test('fetchFn getter/setter round-trips', () => {
    const el = document.createElement('sol-wac');
    const fn = async () => ({});
    el._fetchFn = fn;
    expect(el.fetchFn).toBe(fn);
  });
});

// ── load ────────────────────────────────────────────────────────────────────

describe('SolWac — load', () => {
  test('loads the ACL and renders the Form / RDF subtabs', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);

    const tabs = el.querySelector('sol-tabs');
    expect(tabs).toBeTruthy();
    const tabNames = [...tabs.querySelectorAll(':scope > .sol-tabs-bar button')]
      .map(b => b.textContent);
    expect(tabNames).toEqual(expect.arrayContaining(['Form', 'RDF']));
  });

  test('parses the ACL into a role model (owner is public here)', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);
    expect(el._model.owner.grant).toBe('public');
  });

  test('a load failure renders an error and fires sol-wac-error', async () => {
    const failing = async () => { throw new Error('offline'); };
    const el = document.createElement('sol-wac');
    el._fetchFn = failing;
    let phase = null;
    el.addEventListener('sol-wac-error', (e) => { phase = e.detail.phase; });
    el.setAttribute('source', 'https://pod.example/file.ttl');
    document.body.appendChild(el);
    await flush();

    expect(el.querySelector('.acl-error')).toBeTruthy();
    expect(phase).toBe('load');
  });

  test('shows an inheritance banner when the ACL is inherited', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/docs/.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/docs/file.ttl', fetchFn);
    const banner = el.querySelector('.acl-banner');
    expect(banner.textContent).toMatch(/Inheriting permissions from https:\/\/pod\.example\/docs\//);
  });
});

// ── rendering ───────────────────────────────────────────────────────────────

describe('SolWac — rendering', () => {
  test('the Form tab renders one row per role', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);
    expect(el.querySelectorAll('.acl-role-row')).toHaveLength(4);   // viewer/poster/editor/owner
  });

  test('the RDF tab shows the raw Turtle in a textarea', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);
    el.querySelector('sol-tabs').switchTab('RDF');
    const ta = el.querySelector('textarea.acl-rdf-editor');
    expect(ta.value).toBe(OWNER_ACL);
  });

  test('a Save button is added to the subtab bar', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);
    expect(el.querySelector('.acl-save-btn')).toBeTruthy();
  });
});

// ── save ────────────────────────────────────────────────────────────────────

describe('SolWac — save', () => {
  test('PUTs the Turtle and fires sol-wac-save + sol-status', async () => {
    const fetchFn = mkFetch({ acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL } });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);

    let saved = null, status = null;
    el.addEventListener('sol-wac-save', (e) => { saved = e.detail; });
    el.addEventListener('sol-status', (e) => { status = e.detail; });
    await el.save();

    expect(fetchFn.puts).toHaveLength(1);
    expect(fetchFn.puts[0].url).toBe('https://pod.example/file.ttl.acl');
    expect(saved).toEqual({ aclUrl: 'https://pod.example/file.ttl.acl' });
    expect(status.type).toBe('success');
  });

  test('does nothing when there is no resolved ACL URL', async () => {
    const el = document.createElement('sol-wac');
    el._fetchFn = mkFetch();
    let fired = false;
    el.addEventListener('sol-wac-save', () => { fired = true; });
    await el.save();
    expect(fired).toBe(false);
  });

  test('a failed PUT fires sol-wac-error and an error status', async () => {
    const fetchFn = mkFetch({
      acls: { 'https://pod.example/file.ttl.acl': OWNER_ACL }, putOk: false,
    });
    const el = await mkWac('https://pod.example/file.ttl', fetchFn);

    let phase = null, status = null;
    el.addEventListener('sol-wac-error', (e) => { phase = e.detail.phase; });
    el.addEventListener('sol-status', (e) => { status = e.detail; });
    await el.save();

    expect(phase).toBe('save');
    expect(status.type).toBe('error');
  });
});

// ── attributeChangedCallback ────────────────────────────────────────────────

describe('SolWac — attributeChangedCallback', () => {
  test('changing source reloads the ACL', async () => {
    const fetchFn = mkFetch({
      acls: {
        'https://pod.example/a.ttl.acl': OWNER_ACL,
        'https://pod.example/b.ttl.acl': OWNER_ACL,
      },
    });
    const el = await mkWac('https://pod.example/a.ttl', fetchFn);
    expect(el._aclUrl).toBe('https://pod.example/a.ttl.acl');

    el.setAttribute('source', 'https://pod.example/b.ttl');
    await flush();
    expect(el._aclUrl).toBe('https://pod.example/b.ttl.acl');
  });
});
