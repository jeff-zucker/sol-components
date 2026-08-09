// layout-serialize — the write half of core/layout-generate.js's
// parseLayoutTree: turn a (possibly edited) layout tree back into a complete
// layout.ttl Turtle document, plus the pure tree editors the builder's
// element step uses (add / remove / move a ui:Component leaf).
//
// Emission is a string template in the idiom layout-compose.js produces:
// prefixed Turtle, positioned schema:ListItem wrappers
// with DETERMINISTIC `<parentFrag>-<childFrag>` fragments (menu-serialize's
// wrapper convention), schema:additionalProperty blank-node pairs. Same-origin module
// URLs relativize to path form (</node_modules/…>) so a saved layout stays
// portable across hosts.
//
// LIMITATION (by design): this round-trips exactly what parseLayoutTree
// reads — a hand-added triple outside that model is dropped on the next
// builder save. layout.ttl is builder-owned; hand-edit freely, but know a
// save rewrites the whole document. Saves go by whole-doc PUT: schema:additionalProperty
// pairs are blank nodes, which a SPARQL DELETE can't address cleanly.

import { mintFragment } from './menu-serialize.js';
import { deriveTagFromModule } from './menu-rdf.js';

const SCHEMA = 'http://schema.org/';

const fragOf = (node) => {
  const v = (node && node.value) || '';
  const i = v.indexOf('#');
  return i >= 0 ? v.slice(i + 1) : null;
};

const lit = (s) => `"${String(s)
  .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

// schema.org IRIs shorten to schema:Local; anything else stays a full IRI.
const typeTerm = (iri) =>
  iri.startsWith(SCHEMA) ? `schema:${iri.slice(SCHEMA.length)}` : `<${iri}>`;

// Same-origin absolute URL → path-absolute (</node_modules/…>); relative or
// foreign values pass through.
function relativizeUrl(url, docUrl) {
  try {
    const u = new URL(url, docUrl);
    const d = new URL(docUrl);
    if (u.origin === d.origin) return u.pathname + u.search + u.hash;
  } catch { /* not URL-shaped — emit as-is */ }
  return url;
}

const attrList = (params) => params
  .map(([k, v]) => `[ schema:name ${lit(k)} ; schema:value ${lit(v)} ]`)
  .join(' ,\n               ');

/** Every region/leaf fragment used in the tree (wrappers are regenerated). */
export function usedTreeFragments(tree, out = new Set()) {
  const f = fragOf(tree.node);
  if (f) out.add(f);
  if (tree.kind === 'region') tree.parts.forEach((p) => usedTreeFragments(p, out));
  return out;
}

function emitLeaf(leaf, docUrl) {
  const frag = fragOf(leaf.node) || 'item';
  const lines = [`:${frag} a ui:Component`];
  if (leaf.item.name) lines.push(`  ui:label ${lit(leaf.item.name)}`);
  if (leaf.item.comment) lines.push(`  rdfs:comment ${lit(leaf.item.comment)}`);
  if (leaf.url) lines.push(`  schema:url <${relativizeUrl(leaf.url, docUrl)}>`);
  const params = (leaf.item.params || []).filter(([k]) => k);
  if (params.length) lines.push(`  schema:additionalProperty ${attrList(params)}`);
  return lines.join(' ;\n') + ' .\n';
}

// A ui:Link member — first-class layout content (its schema:url transcludes /
// frames at compile time). The composer emits these for the site-title and
// footer slots; the serializer must round-trip them or a save would drop them.
function emitLink(link, docUrl) {
  const frag = fragOf(link.node) || 'link';
  const lines = [`:${frag} a ui:Link`];
  if (link.label) lines.push(`  ui:label ${lit(link.label)}`);
  if (link.comment) lines.push(`  rdfs:comment ${lit(link.comment)}`);
  if (link.url) lines.push(`  schema:url <${relativizeUrl(link.url, docUrl)}>`);
  return lines.join(' ;\n') + ' .\n';
}

function emitRegion(region, docUrl, blocks, wrappers, wrapperTaken, isRoot = false) {
  const frag = fragOf(region.node) || 'Layout';
  const lines = [`:${frag} a ui:Layout`];
  if (region.label) lines.push(`  ui:label ${lit(region.label)}`);
  if (region.comment) lines.push(`  rdfs:comment ${lit(region.comment)}`);
  // A region's landmark is a first-class xhv:role (the XHTML/RDFa `role`
  // predicate). Legacy layouts marked with schema:additionalType round-trip
  // through it only when no role is present.
  if (region.role) lines.push(`  xhv:role ${lit(region.role)}`);
  else if (region.additionalTypeIri) {
    lines.push(`  schema:additionalType ${typeTerm(region.additionalTypeIri)}`);
  }
  if (region.orientation === 'horizontal') lines.push('  ui:orientation ui:Horizontal');
  else if (isRoot) lines.push('  ui:orientation ui:Vertical'); // root declares its axis
  if (region.columns) lines.push(`  ui:columns ${region.columns}`);
  const params = (region.params || []).filter(([k]) => k);
  if (params.length) lines.push(`  schema:additionalProperty ${attrList(params)}`);

  if (region.parts.length) {
    const memberFrags = [];
    const lineGroup = [];
    region.parts.forEach((part, i) => {
      const childFrag = fragOf(part.node) || `item-${i + 1}`;
      const base = `${frag}-${childFrag}`;
      let wrap = base, n = 2;
      while (wrapperTaken.has(wrap)) wrap = `${base}-${n++}`;
      wrapperTaken.add(wrap);
      memberFrags.push(`:${wrap}`);
      lineGroup.push(`:${wrap} a schema:ListItem; schema:item :${childFrag}; schema:position ${i + 1}.`);
    });
    lines.push(`  schema:itemListElement ${memberFrags.join(', ')}`);
    wrappers.push(lineGroup.join('\n'));
  }
  blocks.push(lines.join(' ;\n') + ' .\n');

  // Children: leaves/links directly after their region, child regions after
  // that — the authored presets' reading order.
  for (const part of region.parts) {
    if (part.kind === 'leaf') blocks.push(emitLeaf(part, docUrl));
    else if (part.kind === 'link') blocks.push(emitLink(part, docUrl));
  }
  for (const part of region.parts) {
    if (part.kind === 'region') emitRegion(part, docUrl, blocks, wrappers, wrapperTaken);
  }
}

/**
 * Serialize a layout tree (from parseLayoutTree, possibly edited) into a
 * complete Turtle document.
 *
 * @param {object} tree    root region (kind 'region')
 * @param {object} o
 * @param {string} o.docUrl  the layout doc URL (for URL relativizing)
 * @param {string} [o.comment] leading document comment (without "# ")
 */
export function serializeLayout(tree, { docUrl, comment } = {}) {
  const blocks = [];
  const wrappers = [];
  emitRegion(tree, docUrl || '', blocks, wrappers, new Set(), true);
  let out = `@prefix : <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix schema: <http://schema.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xhv: <http://www.w3.org/1999/xhtml/vocab#> .
`;
  if (comment) out += '\n' + comment.split('\n').map((l) => `# ${l}`.trimEnd()).join('\n') + '\n';
  out += '\n' + blocks.join('\n');
  if (wrappers.length) out += '\n' + wrappers.join('\n\n') + '\n';
  return out;
}

/** Find a region node in the tree by its IRI. */
export function findRegion(tree, regionIri) {
  if (tree.kind !== 'region') return null;
  if (tree.node && tree.node.value === regionIri) return tree;
  for (const part of tree.parts) {
    const hit = findRegion(part, regionIri);
    if (hit) return hit;
  }
  return null;
}

/** The region whose parts contain the node with `iri` (leaf or region). */
export function findParentOf(tree, iri) {
  if (tree.kind !== 'region') return null;
  if (tree.parts.some((p) => p.node && p.node.value === iri)) return tree;
  for (const part of tree.parts) {
    const hit = findParentOf(part, iri);
    if (hit) return hit;
  }
  return null;
}

/**
 * Add a ui:Component leaf to a region. Mutates the tree; returns the leaf.
 *
 * @param {object} tree      root region
 * @param {string} regionIri IRI of the region to add into
 * @param {object} item      { label, module, params?, comment? } — module is
 *                           the component's ES-module URL (tag derives from
 *                           its filename)
 * @param {string} docUrl    the layout doc URL (new fragments live here)
 */
export function addLeaf(tree, regionIri, item, docUrl) {
  const region = findRegion(tree, regionIri);
  if (!region) return null;
  const taken = usedTreeFragments(tree);
  const frag = mintFragment(item.label || 'item', taken);
  const leaf = {
    kind: 'leaf',
    node: { value: `${String(docUrl).split('#')[0]}#${frag}` },
    url: item.module || null,
    item: {
      type: 'component',
      tag: deriveTagFromModule(item.module || ''),
      params: item.params || [],
      name: item.label || '',
      comment: item.comment || null,
    },
  };
  region.parts.push(leaf);
  return leaf;
}

/**
 * Add a ui:Link leaf (transcluded/framed content) to a region. Mutates the
 * tree; returns the link node.
 *
 * @param {object} tree      root region
 * @param {string} regionIri IRI of the region to add into
 * @param {object} item      { label, url, comment? } — url is the link target
 * @param {string} docUrl    the layout doc URL (new fragments live here)
 */
export function addLink(tree, regionIri, item, docUrl) {
  const region = findRegion(tree, regionIri);
  if (!region) return null;
  const taken = usedTreeFragments(tree);
  const frag = mintFragment(item.label || 'link', taken);
  const link = {
    kind: 'link',
    node: { value: `${String(docUrl).split('#')[0]}#${frag}` },
    url: item.url || null,
    label: item.label || '',
    comment: item.comment || null,
  };
  region.parts.push(link);
  return link;
}

/**
 * Move a leaf/link to another region (or reorder within one). Removes it from
 * its current parent and inserts it into `targetRegionIri` — before the part
 * with `beforeIri` if given, else at the end. Regions themselves don't move.
 * Returns true on success.
 */
export function moveNode(tree, nodeIri, targetRegionIri, beforeIri = null) {
  const src = findParentOf(tree, nodeIri);
  const target = findRegion(tree, targetRegionIri);
  if (!src || !target) return false;
  const i = src.parts.findIndex((p) => p.node && p.node.value === nodeIri);
  if (i < 0 || src.parts[i].kind === 'region') return false;
  const [part] = src.parts.splice(i, 1);
  let j = target.parts.length;
  if (beforeIri) {
    const k = target.parts.findIndex((p) => p.node && p.node.value === beforeIri);
    if (k >= 0) j = k;
  }
  target.parts.splice(j, 0, part);
  return true;
}

/** Remove the leaf/link with `leafIri` from wherever it sits. Returns true if found. */
export function removeLeaf(tree, leafIri) {
  const parent = findParentOf(tree, leafIri);
  if (!parent) return false;
  const i = parent.parts.findIndex((p) => p.node && p.node.value === leafIri);
  if (i < 0 || parent.parts[i].kind === 'region') return false;
  parent.parts.splice(i, 1);
  return true;
}

/**
 * Detach a whole region (with everything in it) from its parent. The root has
 * no parent, so it never detaches. Returns { region, parentIri, index } — the
 * record insertPart() needs to put it back — or null.
 */
export function removeRegion(tree, regionIri) {
  const parent = findParentOf(tree, regionIri);
  if (!parent) return null;
  const i = parent.parts.findIndex((p) => p.node && p.node.value === regionIri);
  if (i < 0 || parent.parts[i].kind !== 'region') return null;
  const [region] = parent.parts.splice(i, 1);
  return { region, parentIri: parent.node.value, index: i };
}

/** Put a detached part back into `parentIri` at `index` (clamped to the end). */
export function insertPart(tree, parentIri, part, index) {
  const parent = findRegion(tree, parentIri);
  if (!parent || !part) return false;
  const i = Math.max(0, Math.min(index == null ? parent.parts.length : index, parent.parts.length));
  parent.parts.splice(i, 0, part);
  return true;
}

/** Move the part with `iri` by delta (−1 up / +1 down) within its region. */
export function moveLeaf(tree, iri, delta) {
  const parent = findParentOf(tree, iri);
  if (!parent) return false;
  const i = parent.parts.findIndex((p) => p.node && p.node.value === iri);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= parent.parts.length) return false;
  const [part] = parent.parts.splice(i, 1);
  parent.parts.splice(j, 0, part);
  return true;
}
