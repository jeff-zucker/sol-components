/**
 * Pod operations — container listing, file operations, discovery.
 * Shared utility used by <sol-pod>.
 */

import { rdf } from './rdf.js';

const LDP_CONTAINS = 'http://www.w3.org/ns/ldp#contains';
const OWL_SAME_AS  = 'http://www.w3.org/2002/07/owl#sameAs';
const PIM_STORAGE  = 'http://www.w3.org/ns/pim/space#storage';
// Per-resource metadata predicates emitted by Solid LDP servers in
// container listings. POSIX_* is the canonical pair (CSS, and NSS via
// the same URI even though it imports as `stat:`). DCT_MODIFIED is
// the human-readable ISO-datetime mirror.
const POSIX_SIZE    = 'http://www.w3.org/ns/posix/stat#size';
const POSIX_MTIME   = 'http://www.w3.org/ns/posix/stat#mtime';
const DCT_MODIFIED  = 'http://purl.org/dc/terms/modified';
const RDF_TYPE      = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// ── MIME types ────────────────────────────────────────────────────────

export const MIME_TYPES = {
  ttl:'text/turtle', n3:'text/n3', jsonld:'application/ld+json',
  json:'application/json', html:'text/html', xml:'application/xml',
  txt:'text/plain', md:'text/markdown', csv:'text/csv',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  svg:'image/svg+xml', pdf:'application/pdf',
  js:'application/javascript', css:'text/css',
  acl:'text/turtle',
};

/** Extension extraction supporting $.ext convention. */
export function extOf(name) {
  const m = name.match(/\$\.([^.]+)$/);
  if (m) return m[1].toLowerCase();
  return name.includes('.') ? name.split('.').pop().toLowerCase() : '';
}

export function contentTypeFor(name, blobType) {
  if (blobType) return blobType;
  return MIME_TYPES[extOf(name)] || 'application/octet-stream';
}

// ── Fetch with timeout ────────────────────────────────────────────────

export function withTimeout(fetchFn, ms = 30000) {
  return async (url, options = {}) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetchFn(url, { ...options, signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`Request timed out after ${ms / 1000}s: ${url}`);
      throw e;
    } finally { clearTimeout(id); }
  };
}

// ── Container listing ─────────────────────────────────────────────────

async function fetchContainerRaw(url, fetchFn) {
  const timedFetch = withTimeout(fetchFn, 30000);
  const resp = await timedFetch(url, { headers: { Accept: 'text/turtle' } });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  const text = await resp.text();

  const store = rdf.graph();
  rdf.parse(text, store, url, 'text/turtle');
  const container = rdf.sym(url);
  return store.each(container, rdf.sym(LDP_CONTAINS), null, null).map(n => {
    const sub = rdf.sym(n.value);
    const num = (pred) => {
      const v = store.any(sub, rdf.sym(pred), null, null);
      if (!v) return null;
      const x = Number(v.value);
      return Number.isFinite(x) ? x : null;
    };
    const str = (pred) => {
      const v = store.any(sub, rdf.sym(pred), null, null);
      return v ? v.value : null;
    };
    return {
      url:      n.value,
      size:     num(POSIX_SIZE),
      mtime:    num(POSIX_MTIME),
      modified: str(DCT_MODIFIED),
      types:    store.each(sub, rdf.sym(RDF_TYPE), null, null).map(t => t.value),
    };
  });
}

function tryDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function mapResources(resources) {
  return resources.map(r => {
    const url = r.url;
    const isContainer = url.endsWith('/');
    const name = isContainer ? url.split('/').slice(-2)[0] : url.split('/').pop();
    const displayName = tryDecode(name);
    // Inferred from the extension (containers are turtle). It's a guess —
    // an extensionless file is 'application/octet-stream'; HEAD the url for
    // the server's authoritative Content-Type.
    const contentType = isContainer ? 'text/turtle' : contentTypeFor(name);
    return {
      url, name, displayName, isContainer, contentType,
      size: r.size, mtime: r.mtime, modified: r.modified, types: r.types,
    };
  }).sort((a, b) => {
    if (a.isContainer === b.isContainer) return a.displayName.localeCompare(b.displayName);
    return a.isContainer ? -1 : 1;
  });
}

export async function fetchContainer(url, fetchFn) {
  const resources = await fetchContainerRaw(url, fetchFn);
  return mapResources(resources);
}

// ── File operations ───────────────────────────────────────────────────

export async function copyFile(sourceUrl, targetContainerUrl, fileName, sourceFetchFn, targetFetchFn) {
  const sf = withTimeout(sourceFetchFn, 60000);
  const resp = await sf(sourceUrl);
  if (!resp.ok) throw new Error(`GET ${sourceUrl} failed: ${resp.status}`);
  const blob = await resp.blob();

  const targetUrl = targetContainerUrl + fileName;
  const tf = withTimeout(targetFetchFn, 60000);
  const put = await tf(targetUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentTypeFor(fileName, blob.type) },
    body: blob
  });
  if (!put.ok) {
    const err = new Error(`PUT failed: ${put.status}`);
    err.needsAuth = put.status === 401 || put.status === 403;
    throw err;
  }
  return { success: true };
}

export async function copyFolder(sourceUrl, targetContainerUrl, folderName, fetchFnForUrl, onProgress) {
  const targetFolderUrl = targetContainerUrl + folderName + '/';
  if (onProgress) onProgress(`Copying folder ${folderName}...`);

  const sourceFetch = fetchFnForUrl(sourceUrl);
  let children;
  try {
    children = await fetchContainerRaw(sourceUrl, sourceFetch);
  } catch (e) {
    return { success: false, error: e.message };
  }

  // Create target folder
  const tf = withTimeout(fetchFnForUrl(targetContainerUrl), 30000);
  const mkdir = await tf(targetFolderUrl, {
    method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: ''
  });
  if (!mkdir.ok && mkdir.status !== 409) {
    return { success: false, error: `Failed to create folder: ${mkdir.status}` };
  }

  let failed = 0;
  for (const child of children) {
    const childUrl = child.url;
    const isContainer = childUrl.endsWith('/');
    const name = isContainer ? childUrl.split('/').slice(-2)[0] : childUrl.split('/').pop();
    if (isContainer) {
      const r = await copyFolder(childUrl, targetFolderUrl, name, fetchFnForUrl, onProgress);
      if (!r.success) failed++;
    } else {
      if (onProgress) onProgress(`Copying ${name}...`);
      try {
        await copyFile(childUrl, targetFolderUrl, name, fetchFnForUrl(childUrl), fetchFnForUrl(targetFolderUrl));
      } catch (e) { failed++; }
    }
  }
  return { success: failed === 0, failed };
}

export async function deleteFolder(url, fetchFnForUrl) {
  let children = [];
  try { children = await fetchContainer(url, fetchFnForUrl(url)); } catch (e) {}
  for (const child of children) {
    if (child.isContainer) {
      await deleteFolder(child.url, fetchFnForUrl);
    } else {
      await fetchFnForUrl(child.url)(child.url, { method: 'DELETE' });
    }
  }
  await fetchFnForUrl(url)(url, { method: 'DELETE' });
}


// ── WebID / storage discovery ─────────────────────────────────────────

export async function discoverOwnerWebIds(origin) {
  origin = origin || window.location.origin;
  const webIds = new Set();

  const addFromTurtle = (text, base) => {
    let m, re;
    re = /<([^>]+)>\s+(?:solid:account|<[^>]*solid[^>]*#account>)\s+<[^>]+>/g;
    while ((m = re.exec(text)) !== null) webIds.add(new URL(m[1], base).href);
    re = /(?:solid:owner|<[^>]*solid[^>]*#owner>)\s+<([^>]+)>/g;
    while ((m = re.exec(text)) !== null) webIds.add(new URL(m[1], base).href);
  };

  const addFromAcl = (text, base) => {
    const blocks = text.split(/\n\s*\n/);
    for (const block of blocks) {
      if (/acl:Control/.test(block)) {
        const re = /acl:agent\s+<([^>]+)>/g;
        let m;
        while ((m = re.exec(block)) !== null) webIds.add(new URL(m[1], base).href);
      }
    }
  };

  let metaUrl = origin + '/.meta';
  let aclUrl  = origin + '/.acl';
  try {
    const resp = await fetch(origin + '/');
    const link = resp.headers.get('Link') || '';
    const mm = link.match(/<([^>]+)>\s*;\s*rel="describedby"/);
    if (mm) metaUrl = new URL(mm[1], origin).href;
    const am = link.match(/<([^>]+)>\s*;\s*rel="acl"/);
    if (am) aclUrl = new URL(am[1], origin).href;
  } catch (e) {}

  if (webIds.size === 0) {
    try {
      const resp = await fetch(metaUrl, { headers: { Accept: 'text/turtle' } });
      if (resp.ok) addFromTurtle(await resp.text(), metaUrl);
    } catch (e) {}
  }

  if (webIds.size === 0) {
    try {
      const resp = await fetch(origin + '/.well-known/solid', {
        headers: { Accept: 'text/turtle, application/ld+json' }
      });
      if (resp.ok) {
        const text = await resp.text();
        addFromTurtle(text, origin + '/.well-known/solid');
        if (webIds.size === 0) {
          try {
            const json = JSON.parse(text);
            for (const key of ['http://www.w3.org/ns/solid/terms#owner', 'http://www.w3.org/ns/solid/terms#account']) {
              const val = json[key];
              if (Array.isArray(val)) val.forEach(v => webIds.add(v['@id'] || v));
              else if (val) webIds.add(val['@id'] || val);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  if (webIds.size === 0) {
    try {
      const resp = await fetch(aclUrl, { headers: { Accept: 'text/turtle' } });
      if (resp.ok) addFromAcl(await resp.text(), aclUrl);
    } catch (e) {}
  }

  return [...webIds];
}

export async function getStoragesFromWebIds(webIds) {
  const storages = new Set();
  const visited = new Set();

  async function processWebId(webId) {
    if (visited.has(webId)) return;
    visited.add(webId);
    const profileDoc = webId.split('#')[0];
    try {
      const store = rdf.graph();
      const fetcher = rdf.fetcher(store);
      await fetcher.load(profileDoc);
      const subj = rdf.sym(webId);
      const found = store.each(subj, rdf.sym(PIM_STORAGE), null, null).map(n => n.value);
      found.forEach(u => storages.add(u));
      // owl:sameAs is symmetric — follow it in BOTH directions so a
      // profile that asserts `<remote> owl:sameAs <local>` chains the
      // same as one that asserts `<local> owl:sameAs <remote>`.
      const forward = store.each(subj, rdf.sym(OWL_SAME_AS), null, null);
      const inverse = store.each(null, rdf.sym(OWL_SAME_AS), subj, null);
      const linked = [...forward, ...inverse].map(n => n.value);
      console.info(`[pod-ops] ${webId} → ${found.length} storage(s), ${linked.length} sameAs link(s)`,
        { storages: found, sameAs: linked });
      for (const next of linked) await processWebId(next);
    } catch (e) {
      console.warn(`[pod-ops] Failed to load profile ${profileDoc} for ${webId}:`, e?.message || e);
    }
  }

  for (const webId of webIds) await processWebId(webId);
  console.info(`[pod-ops] discovery: ${visited.size} WebID(s) walked, ${storages.size} pod(s) found`,
    { webIds: [...visited], storages: [...storages] });
  return [...storages].sort();
}

// ── File-type classification ─────────────────────────────────────────

const TEXT_VIEWABLE = ['txt','md','csv','json','jsonld','ttl','n3','html','xml','svg','js','css'];
const EDITABLE      = ['txt','md','csv','json','jsonld','ttl','n3','html','htm','xml','svg','js','css'];
const IMAGE_TYPES   = ['png','jpg','jpeg','gif','webp','svg','bmp','ico','avif'];
const VIDEO_TYPES   = ['mp4','webm','ogg','mov','m4v'];
const AUDIO_TYPES   = ['mp3','ogg','wav','flac','aac','m4a','opus'];
const PDF_TYPES     = ['pdf'];
const RDF_EXTS      = ['ttl','n3','trig','nq','nt','rdf','jsonld'];

export const isTextViewable = n => TEXT_VIEWABLE.includes(extOf(n));
export const isEditable     = n => EDITABLE.includes(extOf(n));
export const isImage        = n => IMAGE_TYPES.includes(extOf(n));
export const isVideo        = n => VIDEO_TYPES.includes(extOf(n));
export const isAudio        = n => AUDIO_TYPES.includes(extOf(n));
export const isPDF          = n => PDF_TYPES.includes(extOf(n));
export const isViewable     = n => isTextViewable(n) || isImage(n) || isVideo(n) || isAudio(n) || isPDF(n);
export const isRdf          = n => RDF_EXTS.includes(extOf(n));

export const CT_TO_EXT = {
  'text/turtle':'ttl','text/n3':'n3','application/ld+json':'jsonld',
  'application/json':'json','text/html':'html','text/plain':'txt',
  'text/markdown':'md','text/csv':'csv','application/xml':'xml',
  'text/xml':'xml','application/javascript':'js','text/css':'css',
  'image/png':'png','image/jpeg':'jpg','image/svg+xml':'svg',
  'audio/mpeg':'mp3','video/mp4':'mp4','application/pdf':'pdf',
};

export function fileIcon(name) {
  const ext = extOf(name);
  if (!ext && name.endsWith('$')) return '\u{1F517}';
  if (['ttl','n3','trig','nq','nt','rdf','jsonld'].includes(ext)) return '\u{1F537}';
  if (ext === 'json') return '\u{1F4CB}';
  if (['csv','tsv'].includes(ext)) return '\u{1F4CA}';
  if (['md','markdown'].includes(ext)) return '\u{1F4DD}';
  if (ext === 'txt') return '\u{1F4C4}';
  if (ext === 'pdf') return '\u{1F4D5}';
  if (['html','htm'].includes(ext)) return '\u{1F310}';
  if (['js','mjs','cjs','ts'].includes(ext)) return '\u26A1';
  if (['css','scss'].includes(ext)) return '\u{1F3A8}';
  if (['png','jpg','jpeg','gif','webp','avif','bmp','ico'].includes(ext)) return '\u{1F5BC}';
  if (ext === 'svg') return '\u{1F3AD}';
  if (['mp3','ogg','wav','flac','aac','m4a','opus'].includes(ext)) return '\u{1F3B5}';
  if (['mp4','webm','mov','m4v'].includes(ext)) return '\u{1F3AC}';
  if (['zip','tar','gz','bz2','xz','7z'].includes(ext)) return '\u{1F4E6}';
  if (['yaml','yml','toml','ini','env'].includes(ext)) return '\u2699';
  if (ext === 'acl') return '\u{1F512}';
  if (name.startsWith('.')) return '\u{1F527}';
  return '\u{1F4C4}';
}

// ── Live-editor format detection ──────────────────────────────────────

const EXT_TO_LIVE_FORMAT = {
  ttl:'turtle', n3:'turtle', jsonld:'jsonld', csv:'csv', tsv:'csv',
  md:'markdown', markdown:'markdown', mmd:'mermaid', mermaid:'mermaid',
  html:'html', htm:'html', dot:'graphviz', gv:'graphviz',
};

const MIME_TO_LIVE_FORMAT = {
  'text/turtle':'turtle', 'text/n3':'turtle',
  'application/ld+json':'jsonld',
  'text/csv':'csv', 'text/tab-separated-values':'csv',
  'text/markdown':'markdown', 'text/x-markdown':'markdown',
  'text/html':'html',
  'text/x-mermaid':'mermaid',
  'text/vnd.graphviz':'graphviz', 'text/x-dot':'graphviz',
};

export function liveFormatFor(url, mime) {
  if (mime) {
    const f = MIME_TO_LIVE_FORMAT[mime.split(';')[0].trim()];
    if (f) return f;
  }
  if (url) {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const f = EXT_TO_LIVE_FORMAT[ext];
    if (f) return f;
  }
  return null;
}

export function isLiveFormat(url, mime) {
  return !!liveFormatFor(url, mime);
}

