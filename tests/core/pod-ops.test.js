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
} from '../../core/pod-ops.js';

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
