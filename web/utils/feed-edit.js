/**
 * feed-edit.js — sol-feed's editing operations over a SKOS/DCAT feeds doc.
 *
 * Each operation is a *pure builder* returning `{ deletes, inserts }` arrays of
 * Turtle triple strings; `patchDoc` turns one into a `application/sparql-update`
 * body and PATCHes it to the feeds file (same-origin; no proxy — the CORS proxy
 * is only for cross-origin RSS reads). Splitting build from send keeps the body
 * construction unit-testable without a network.
 *
 * Model (matches libraries/news/feeds.ttl): topics are `skos:Concept`
 * (`skos:prefLabel`, `skos:topConceptOf` the scheme); sources are
 * `dcat:Dataset, rss:channel` with `dct:title` + `dcat:accessURL` +
 * `dcat:theme` → a topic; the `dcat:Catalog` lists every source via
 * `dcat:dataset`. Deleted sources are re-themed to a reserved `#Deleted`
 * concept (NOT `topConceptOf` the scheme, so it never shows as a normal topic).
 */

export const NS = {
  rdf:    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dct:    'http://purl.org/dc/terms/',
  dcat:   'http://www.w3.org/ns/dcat#',
  skos:   'http://www.w3.org/2004/02/skos/core#',
  rss:    'http://purl.org/rss/1.0/',
  schema: 'http://schema.org/',
};

const DEFAULT_PREFIXES = {
  rdf: NS.rdf, dct: NS.dct, dcat: NS.dcat, skos: NS.skos, rss: NS.rss, schema: NS.schema,
};

/** The reserved deleted-bin concept fragment. */
export const BIN_FRAG = 'Deleted';
export const binUriFor = (fileUri) => `${fileUri}#${BIN_FRAG}`;

/** A Turtle string literal (handles quotes / backslashes / newlines). */
export const lit = (s) => JSON.stringify(String(s));

/* ── pure builders → { deletes, inserts } ───────────────────────────────── */

export function renameTopicEdit(topicUri, oldLabel, newLabel) {
  return {
    deletes: [`<${topicUri}> skos:prefLabel ${lit(oldLabel)} .`],
    inserts: [`<${topicUri}> skos:prefLabel ${lit(newLabel)} .`],
  };
}

export function recategorizeEdit(feedUri, fromTopicUri, toTopicUri) {
  if (fromTopicUri === toTopicUri) return { deletes: [], inserts: [] };
  return {
    deletes: [`<${feedUri}> dcat:theme <${fromTopicUri}> .`],
    inserts: [`<${feedUri}> dcat:theme <${toTopicUri}> .`],
  };
}

export function addFeedEdit(feedUri, { title, url, topicUri, catalogUri }) {
  const inserts = [
    `<${feedUri}> a dcat:Dataset, rss:channel ; ` +
      `dct:title ${lit(title)} ; dcat:accessURL <${url}> ; dcat:theme <${topicUri}> .`,
  ];
  if (catalogUri) inserts.push(`<${catalogUri}> dcat:dataset <${feedUri}> .`);
  return { deletes: [], inserts };
}

/** Move a source to the bin (re-theme to #Deleted), creating the bin concept
 *  on first use. `binLabel` only matters when the concept is minted. */
export function deleteToBinEdit(feedUri, fromTopicUri, binUri, { ensureBin = true, binLabel = 'Deleted' } = {}) {
  const inserts = [`<${feedUri}> dcat:theme <${binUri}> .`];
  if (ensureBin) inserts.push(`<${binUri}> a skos:Concept ; skos:prefLabel ${lit(binLabel)} .`);
  return { deletes: [`<${feedUri}> dcat:theme <${fromTopicUri}> .`], inserts };
}

/** Restore from the bin = re-categorize out of #Deleted to a chosen topic. */
export function restoreEdit(feedUri, binUri, toTopicUri) {
  return recategorizeEdit(feedUri, binUri, toTopicUri);
}

/** Set/replace a single subject's ordering position. */
export function reorderEdit(subjectUri, oldPos, newPos) {
  const deletes = oldPos == null ? [] : [`<${subjectUri}> schema:position ${Number(oldPos)} .`];
  return { deletes, inserts: [`<${subjectUri}> schema:position ${Number(newPos)} .`] };
}

/**
 * Re-number a whole ordered list (a topic's sources). Writes `schema:position`
 * 0..n-1 in the new order; only emits triples for items whose position changed.
 * @param {string[]} orderedUris   subjects in their new order
 * @param {Object<string,number>} [oldPos]  uri → its current position (if any)
 */
export function setPositionsEdit(orderedUris, oldPos = {}) {
  const deletes = [], inserts = [];
  orderedUris.forEach((uri, i) => {
    const had = oldPos[uri];
    if (had === i) return;                                  // already correct
    if (had != null) deletes.push(`<${uri}> schema:position ${Number(had)} .`);
    inserts.push(`<${uri}> schema:position ${i} .`);
  });
  return { deletes, inserts };
}

/* ── slug / mint ─────────────────────────────────────────────────────────── */

/** Mint a unique `<fileUri>#feed-<slug>` not colliding with `existingUris`. */
export function mintFeedUri(fileUri, title, existingUris = []) {
  const taken = new Set(existingUris);
  const base = 'feed-' + String(title).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'feed';
  let frag = base, n = 2;
  while (taken.has(`${fileUri}#${frag}`)) frag = `${base}-${n++}`;
  return `${fileUri}#${frag}`;
}

/* ── serialise + send ────────────────────────────────────────────────────── */

export function patchBody({ deletes = [], inserts = [] }, prefixes = DEFAULT_PREFIXES) {
  const pfx = Object.entries(prefixes).map(([k, v]) => `PREFIX ${k}: <${v}>`).join('\n');
  const block = (kw, triples) => `${kw} {\n${triples.map((t) => '  ' + t).join('\n')}\n}`;
  const parts = [];
  if (deletes.length) parts.push(block('DELETE DATA', deletes));
  if (inserts.length) parts.push(block('INSERT DATA', inserts));
  return `${pfx}\n${parts.join(' ;\n')}\n`;
}

/**
 * PATCH the feeds file with one edit. Same-origin, no proxy.
 * @param {string} fileUri
 * @param {{deletes?:string[],inserts?:string[]}} edit
 * @param {{prefixes?:object, fetchImpl?:Function}} [opts]
 */
export async function patchDoc(fileUri, edit, { prefixes = DEFAULT_PREFIXES, fetchImpl } = {}) {
  if (!edit || (!edit.deletes?.length && !edit.inserts?.length)) return;
  const f = fetchImpl || fetch;
  const resp = await f(fileUri, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: patchBody(edit, prefixes),
  });
  if (!resp.ok) throw new Error(`Save failed (HTTP ${resp.status}) — the feeds file must be writable.`);
}
