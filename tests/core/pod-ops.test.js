/**
 * Tests for the pure (no-I/O) helpers in core/pod-ops.js:
 *   - extOf / contentTypeFor and the MIME tables
 *   - file-type classifiers (isEditable / isViewable / isRdf / isImage / …)
 *   - fileIcon
 *   - liveFormatFor / isLiveFormat
 *   - withTimeout (deterministic, exercised with a fake fetch — no network)
 *
 * The network functions (fetchContainer, copyFolder, discovery, …) are
 * covered indirectly by the sol-pod component tests and are not unit-tested
 * here.
 */

import {
  extOf, contentTypeFor, MIME_TYPES, CT_TO_EXT,
  isTextViewable, isEditable, isImage, isVideo, isAudio, isPDF,
  isViewable, isRdf, fileIcon,
  liveFormatFor, isLiveFormat, withTimeout,
  fetchContainer, copyFile, copyFolder, deleteFolder,
  discoverOwnerWebIds, getStoragesFromWebIds,
} from '../../core/pod-ops.js';

// Fake HTTP response. `core/pod-ops.js` only ever reads .ok/.status/
// .statusText/.text()/.blob()/.headers.get() off a response.
function res(body = '', { ok = true, status = 200, link = '' } = {}) {
  return {
    ok, status, statusText: ok ? 'OK' : 'Error',
    text: async () => body,
    blob: async () => ({ type: '', size: body.length }),
    headers: { get: (h) => (h.toLowerCase() === 'link' ? link : null) },
  };
}

// ── extOf ───────────────────────────────────────────────────────────────────

describe('extOf', () => {
  test('extracts a lower-cased extension', () => {
    expect(extOf('notes.TTL')).toBe('ttl');
    expect(extOf('photo.png')).toBe('png');
  });

  test('uses the last segment for multi-dot names', () => {
    expect(extOf('archive.tar.gz')).toBe('gz');
  });

  test('returns empty string when there is no extension', () => {
    expect(extOf('README')).toBe('');
    expect(extOf('trailingdot.')).toBe('');
  });

  test('honours the $.ext convention', () => {
    expect(extOf('resource$.ttl')).toBe('ttl');
    expect(extOf('data$.jsonld')).toBe('jsonld');
  });

  test('a dotfile name is treated as an extension', () => {
    expect(extOf('.acl')).toBe('acl');
  });
});

// ── contentTypeFor ──────────────────────────────────────────────────────────

describe('contentTypeFor', () => {
  test('maps a known extension to its MIME type', () => {
    expect(contentTypeFor('data.ttl')).toBe('text/turtle');
    expect(contentTypeFor('page.html')).toBe('text/html');
  });

  test('falls back to application/octet-stream for unknown extensions', () => {
    expect(contentTypeFor('mystery.xyz')).toBe('application/octet-stream');
  });

  test('an explicit blob type overrides the extension lookup', () => {
    expect(contentTypeFor('data.ttl', 'image/png')).toBe('image/png');
  });
});

describe('MIME tables', () => {
  test('MIME_TYPES covers common Solid formats', () => {
    expect(MIME_TYPES.ttl).toBe('text/turtle');
    expect(MIME_TYPES.jsonld).toBe('application/ld+json');
    expect(MIME_TYPES.acl).toBe('text/turtle');
  });

  test('CT_TO_EXT is roughly the inverse of MIME_TYPES', () => {
    expect(CT_TO_EXT['text/turtle']).toBe('ttl');
    expect(CT_TO_EXT['application/ld+json']).toBe('jsonld');
  });
});

// ── file-type classifiers ───────────────────────────────────────────────────

describe('file-type classifiers', () => {
  test('isEditable covers text formats but not binaries', () => {
    expect(isEditable('a.txt')).toBe(true);
    expect(isEditable('a.ttl')).toBe(true);
    expect(isEditable('a.png')).toBe(false);
    expect(isEditable('a.zip')).toBe(false);
  });

  test('isTextViewable covers text formats', () => {
    expect(isTextViewable('a.md')).toBe(true);
    expect(isTextViewable('a.mp4')).toBe(false);
  });

  test('isRdf recognises RDF serialisations', () => {
    expect(isRdf('g.ttl')).toBe(true);
    expect(isRdf('g.nt')).toBe(true);
    expect(isRdf('g.jsonld')).toBe(true);
    expect(isRdf('g.txt')).toBe(false);
  });

  test('isImage / isVideo / isAudio / isPDF classify media', () => {
    expect(isImage('p.jpeg')).toBe(true);
    expect(isVideo('m.webm')).toBe(true);
    expect(isAudio('s.flac')).toBe(true);
    expect(isPDF('doc.pdf')).toBe(true);
    expect(isImage('doc.pdf')).toBe(false);
  });

  test('isViewable is the union of text + media types', () => {
    expect(isViewable('a.txt')).toBe(true);     // text
    expect(isViewable('a.png')).toBe(true);     // image
    expect(isViewable('a.mp3')).toBe(true);     // audio
    expect(isViewable('a.zip')).toBe(false);    // neither
  });

  test('svg counts as both viewable text and an image', () => {
    expect(isImage('icon.svg')).toBe(true);
    expect(isTextViewable('icon.svg')).toBe(true);
  });
});

// ── fileIcon ────────────────────────────────────────────────────────────────

describe('fileIcon', () => {
  test('picks format-specific icons', () => {
    expect(fileIcon('graph.ttl')).toBe('\u{1F537}');   // RDF
    expect(fileIcon('data.json')).toBe('\u{1F4CB}');
    expect(fileIcon('table.csv')).toBe('\u{1F4CA}');
    expect(fileIcon('notes.md')).toBe('\u{1F4DD}');
    expect(fileIcon('photo.png')).toBe('\u{1F5BC}');
    expect(fileIcon('archive.zip')).toBe('\u{1F4E6}');
  });

  test('the .acl extension gets the lock icon', () => {
    expect(fileIcon('resource.acl')).toBe('\u{1F512}');
  });

  test('a hidden dotfile with no known extension gets the wrench icon', () => {
    expect(fileIcon('.bashrc')).toBe('\u{1F527}');
  });

  test('falls back to a plain document icon for unknown types', () => {
    expect(fileIcon('mystery.xyz')).toBe('\u{1F4C4}');
  });
});

// ── liveFormatFor / isLiveFormat ────────────────────────────────────────────

describe('liveFormatFor', () => {
  test('maps a URL extension to a live-editor format', () => {
    expect(liveFormatFor('https://pod/a.ttl')).toBe('turtle');
    expect(liveFormatFor('https://pod/a.csv')).toBe('csv');
    expect(liveFormatFor('https://pod/a.md')).toBe('markdown');
    expect(liveFormatFor('https://pod/a.dot')).toBe('graphviz');
  });

  test('returns null for a non-live-editable extension', () => {
    expect(liveFormatFor('https://pod/a.txt')).toBe(null);
    expect(liveFormatFor('https://pod/a.png')).toBe(null);
  });

  test('strips a query string before reading the extension', () => {
    expect(liveFormatFor('https://pod/a.ttl?v=2')).toBe('turtle');
  });

  test('a MIME type takes precedence over the URL extension', () => {
    expect(liveFormatFor('https://pod/a.txt', 'text/turtle')).toBe('turtle');
  });

  test('ignores MIME parameters such as charset', () => {
    expect(liveFormatFor(null, 'text/html; charset=utf-8')).toBe('html');
  });

  test('isLiveFormat is the boolean form', () => {
    expect(isLiveFormat('https://pod/a.ttl')).toBe(true);
    expect(isLiveFormat('https://pod/a.txt')).toBe(false);
  });
});

// ── withTimeout ─────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  test('passes the call through and forwards an abort signal', async () => {
    let received = null;
    const fakeFetch = async (url, opts) => { received = { url, opts }; return { ok: true }; };
    const resp = await withTimeout(fakeFetch, 1000)('https://pod/x');
    expect(resp).toEqual({ ok: true });
    expect(received.url).toBe('https://pod/x');
    expect(received.opts.signal).toBeInstanceOf(AbortSignal);
  });

  test('translates an AbortError into a descriptive timeout error', async () => {
    const abortingFetch = async () => {
      const e = new Error('aborted'); e.name = 'AbortError'; throw e;
    };
    await expect(withTimeout(abortingFetch, 5000)('https://pod/slow'))
      .rejects.toThrow(/timed out after 5s/);
  });

  test('re-throws non-abort errors unchanged', async () => {
    const failingFetch = async () => { throw new Error('network down'); };
    await expect(withTimeout(failingFetch, 1000)('https://pod/x'))
      .rejects.toThrow('network down');
  });

  test('preserves caller-supplied request options', async () => {
    let received = null;
    const fakeFetch = async (url, opts) => { received = opts; return { ok: true }; };
    await withTimeout(fakeFetch, 1000)('https://pod/x', { method: 'PUT', body: 'data' });
    expect(received.method).toBe('PUT');
    expect(received.body).toBe('data');
  });
});

// ── fetchContainer ──────────────────────────────────────────────────────────

describe('fetchContainer', () => {
  const CU = 'https://pod.example/docs/';
  const listing =
    `<${CU}> <http://www.w3.org/ns/ldp#contains> ` +
    `<${CU}sub/>, <${CU}notes.txt>, <${CU}a%20b.md> .`;

  test('maps ldp:contains entries, containers first then alphabetical', async () => {
    const items = await fetchContainer(CU, async () => res(listing));
    expect(items.map(i => i.name)).toEqual(['sub', 'a%20b.md', 'notes.txt']);
  });

  test('flags containers by their trailing slash', async () => {
    const items = await fetchContainer(CU, async () => res(listing));
    const byName = Object.fromEntries(items.map(i => [i.name, i]));
    expect(byName['sub'].isContainer).toBe(true);
    expect(byName['notes.txt'].isContainer).toBe(false);
  });

  test('decodes displayName but keeps the raw name', async () => {
    const items = await fetchContainer(CU, async () => res(listing));
    const ab = items.find(i => i.name === 'a%20b.md');
    expect(ab.displayName).toBe('a b.md');
  });

  test('a container name strips the trailing slash', async () => {
    const items = await fetchContainer(CU, async () => res(listing));
    expect(items.find(i => i.isContainer).name).toBe('sub');
  });

  test('an empty container yields no items', async () => {
    const items = await fetchContainer(CU, async () => res(''));
    expect(items).toEqual([]);
  });

  test('a non-ok response throws with the status', async () => {
    await expect(fetchContainer(CU, async () => res('', { ok: false, status: 404 })))
      .rejects.toThrow(/404/);
  });

  test('infers a contentType from the extension (turtle for containers)', async () => {
    const items = await fetchContainer(CU, async () => res(listing));
    const byName = Object.fromEntries(items.map(i => [i.name, i]));
    expect(byName['sub'].contentType).toBe('text/turtle');
    expect(byName['notes.txt'].contentType).toBe('text/plain');
    expect(byName['a%20b.md'].contentType).toBe('text/markdown');
  });
});

// ── copyFile ────────────────────────────────────────────────────────────────

describe('copyFile', () => {
  test('GETs the source and PUTs it to the target container', async () => {
    let put = null;
    const srcFetch = async () => res('body');
    const tgtFetch = async (url, opts) => { put = { url, opts }; return res('', { status: 201 }); };
    const r = await copyFile('https://a/x.ttl', 'https://b/dir/', 'x.ttl', srcFetch, tgtFetch);

    expect(r).toEqual({ success: true });
    expect(put.url).toBe('https://b/dir/x.ttl');
    expect(put.opts.method).toBe('PUT');
    expect(put.opts.headers['Content-Type']).toBe('text/turtle');
  });

  test('a failed source GET throws', async () => {
    const srcFetch = async () => res('', { ok: false, status: 404 });
    await expect(copyFile('https://a/x', 'https://b/', 'x', srcFetch, async () => res('')))
      .rejects.toThrow(/GET .* failed: 404/);
  });

  test('a 403 on PUT throws an error flagged needsAuth', async () => {
    const err = await copyFile(
      'https://a/x', 'https://b/', 'x',
      async () => res('body'),
      async () => res('', { ok: false, status: 403 }),
    ).catch(e => e);
    expect(err.message).toMatch(/PUT failed: 403/);
    expect(err.needsAuth).toBe(true);
  });

  test('a 500 on PUT throws but does not flag needsAuth', async () => {
    const err = await copyFile(
      'https://a/x', 'https://b/', 'x',
      async () => res('body'),
      async () => res('', { ok: false, status: 500 }),
    ).catch(e => e);
    expect(err.needsAuth).toBe(false);
  });
});

// A fake pod filesystem: GET of a known container URL returns its turtle
// listing, any other GET returns file content, PUT/DELETE just succeed.
function fakeFs(containers = {}) {
  const calls = [];
  const fn = async (reqUrl, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url: reqUrl, method });
    if (method === 'GET') {
      return reqUrl in containers ? res(containers[reqUrl]) : res('file-content');
    }
    return res('', { status: 201 });
  };
  return { fetchFnForUrl: () => fn, calls };
}

// ── copyFolder ──────────────────────────────────────────────────────────────

describe('copyFolder', () => {
  test('creates the target folder for an empty source', async () => {
    const fs = fakeFs({ 'https://src/folder/': '' });
    const progress = [];
    const r = await copyFolder('https://src/folder/', 'https://dst/', 'folder',
      fs.fetchFnForUrl, m => progress.push(m));

    expect(r).toEqual({ success: true, failed: 0 });
    expect(fs.calls).toContainEqual({ url: 'https://dst/folder/', method: 'PUT' });
    expect(progress.length).toBeGreaterThan(0);
  });

  test('copies each child file into the new folder', async () => {
    const fs = fakeFs({
      'https://src/folder/':
        '<https://src/folder/> <http://www.w3.org/ns/ldp#contains> <https://src/folder/f.txt> .',
    });
    const r = await copyFolder('https://src/folder/', 'https://dst/', 'folder',
      fs.fetchFnForUrl, () => {});

    expect(r.success).toBe(true);
    expect(fs.calls).toContainEqual({ url: 'https://dst/folder/f.txt', method: 'PUT' });
  });
});

// ── deleteFolder ────────────────────────────────────────────────────────────

describe('deleteFolder', () => {
  test('deletes child resources and then the folder itself', async () => {
    const fs = fakeFs({
      'https://x/folder/':
        '<https://x/folder/> <http://www.w3.org/ns/ldp#contains> <https://x/folder/a.txt> .',
    });
    await deleteFolder('https://x/folder/', fs.fetchFnForUrl);

    const deletes = fs.calls.filter(c => c.method === 'DELETE').map(c => c.url);
    expect(deletes).toContain('https://x/folder/a.txt');
    expect(deletes).toContain('https://x/folder/');
  });
});

// ── discoverOwnerWebIds ─────────────────────────────────────────────────────

describe('discoverOwnerWebIds', () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  test('reads the owner WebID from the pod .meta document', async () => {
    const origin = 'https://pod.example';
    globalThis.fetch = async (url) => {
      if (url === origin + '/') return res('');
      if (url === origin + '/.meta') return res(
        `<${origin}/> <http://www.w3.org/ns/solid/terms#owner> <${origin}/profile/card#me> .`);
      return res('', { ok: false, status: 404 });
    };
    expect(await discoverOwnerWebIds(origin)).toEqual([origin + '/profile/card#me']);
  });

  test('falls back to the Control agents in the root .acl', async () => {
    const origin = 'https://pod.example';
    globalThis.fetch = async (url) => {
      if (url === origin + '/') return res('');
      if (url === origin + '/.acl') return res(
        `<#owner> a <http://www.w3.org/ns/auth/acl#Authorization> ; ` +
        `acl:mode acl:Control ; acl:agent <${origin}/profile/card#me> .`);
      return res('', { ok: false, status: 404 });
    };
    expect(await discoverOwnerWebIds(origin)).toEqual([origin + '/profile/card#me']);
  });

  test('returns an empty list when nothing advertises an owner', async () => {
    globalThis.fetch = async () => res('', { ok: false, status: 404 });
    expect(await discoverOwnerWebIds('https://blank.example')).toEqual([]);
  });
});

// ── getStoragesFromWebIds ───────────────────────────────────────────────────

describe('getStoragesFromWebIds', () => {
  let realFetch;
  beforeEach(() => { realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = realFetch; });

  test('reads pim:storage from each WebID profile', async () => {
    const webId = 'https://pod.example/profile/card#me';
    globalThis.fetch = async (url) => {
      if (url === 'https://pod.example/profile/card') return res(
        `<${webId}> <http://www.w3.org/ns/pim/space#storage> <https://pod.example/> .`);
      return res('', { ok: false, status: 404 });
    };
    expect(await getStoragesFromWebIds([webId])).toEqual(['https://pod.example/']);
  });

  test('returns an empty list when a profile declares no storage', async () => {
    const webId = 'https://pod.example/profile/card#me';
    globalThis.fetch = async () => res(
      `<${webId}> <http://xmlns.com/foaf/0.1/name> "Alice" .`);
    expect(await getStoragesFromWebIds([webId])).toEqual([]);
  });
});
