// Round-trip verification for core/menu-serialize.js with REAL rdflib.
// (The jest suite maps `rdflib` to a tiny mock with no Collection/serialize,
// so this contract is verified here instead: run `node
// scripts/verify-menu-serialize.mjs` — exits non-zero on failure.)
//
// Asserts, against tests/fixtures/menu-pantry.ttl (a copy of data-kitchen's
// real menu shape):
//   1. parse → serialize → parse is lossless (same item tree, same order)
//   2. pantry subjects (#Forum, #Chat — defined, unreferenced) survive
//   3. edits round-trip: rename, append, reorder, and an item dropped from
//      the menu stays in the document as pantry
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf } from '../core/rdf.js';
import { parseMenuItems } from '../core/menu-rdf.js';
import { rewriteMenuDocument } from '../core/menu-serialize.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = 'https://example.org/menu.ttl';
const MENU = `${DOC}#MainMenu`;
const fixture = readFileSync(join(here, '..', 'tests', 'fixtures', 'menu-pantry.ttl'), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

function parseDoc(ttl) {
  const store = rdf.graph();
  rdf.parse(ttl, store, DOC, 'text/turtle');
  return store;
}
// Strip non-semantic noise for tree comparison.
function normalize(items) {
  return (items || []).map((it) => ({
    type: it.type, id: it.id, name: it.name,
    ...(it.type === 'submenu' ? { children: normalize(it.children) } : {}),
    ...(it.type === 'component' ? { tag: it.tag, params: [...(it.params || [])].sort() } : {}),
    ...(it.type === 'link' ? { href: it.href ?? null, contents: it.contents ?? null } : {}),
    requiresWrite: !!it.requiresWrite,
  }));
}
const subjectPresent = (store, frag) =>
  store.statementsMatching(rdf.sym(`${DOC}#${frag}`), null, null).length > 0;

// ---- 1. lossless round-trip --------------------------------------------
const store1 = parseDoc(fixture);
const tree1 = parseMenuItems(store1, rdf.sym(MENU));
const ttl2 = await rewriteMenuDocument(parseDoc(fixture), DOC,
  [{ iri: MENU, label: 'data-kitchen', orientation: 'horizontal', items: tree1 }]);
const store2 = parseDoc(ttl2);
const tree2 = parseMenuItems(store2, rdf.sym(MENU));
check('round-trip preserves the item tree',
  JSON.stringify(normalize(tree1)) === JSON.stringify(normalize(tree2)),
  JSON.stringify(normalize(tree2)).slice(0, 120));
check('round-trip keeps pantry #Forum', subjectPresent(store2, 'Forum'));
check('round-trip keeps pantry #Chat', subjectPresent(store2, 'Chat'));
check('orientation survives', /Horizontal/.test(ttl2));

// ---- 2. edits: rename + append + reorder + drop -------------------------
const edited = JSON.parse(JSON.stringify(tree1));
edited[0].name = 'Start';                       // rename Home → Start
edited.reverse();                               // reorder
edited.push({ type: 'component', name: 'Music', tag: 'ia-player',
  params: [['source', './plugins/ia-player/libraries/internet_archive_music/index.ttl']] });
const dropped = edited.findIndex((i) => i.name === 'Podz');
const [podz] = edited.splice(dropped, 1);       // drop Podz from the menu

const ttl3 = await rewriteMenuDocument(parseDoc(fixture), DOC,
  [{ iri: MENU, label: 'data-kitchen', orientation: 'horizontal', items: edited }]);
const store3 = parseDoc(ttl3);
const tree3 = parseMenuItems(store3, rdf.sym(MENU));
check('edited tree round-trips',
  JSON.stringify(normalize(tree3)) === JSON.stringify(normalize(edited)),
  JSON.stringify(normalize(tree3)).slice(0, 160));
check('renamed item carries the new label', tree3.some((i) => i.name === 'Start'));
check('appended component minted a fragment id', tree3.some((i) => i.name === 'Music' && i.id));
check('dropped item stays in the doc as pantry', subjectPresent(store3, podz.id));
check('dropped item is out of the menu', !tree3.some((i) => i.id === podz.id));
check('pantry still intact after edits', subjectPresent(store3, 'Forum') && subjectPresent(store3, 'Chat'));

// ---- 3. second rewrite over an already-rewritten doc ---------------------
const ttl4 = await rewriteMenuDocument(parseDoc(ttl3), DOC,
  [{ iri: MENU, label: 'data-kitchen', orientation: 'horizontal', items: tree3 }]);
const store4 = parseDoc(ttl4);
check('idempotent re-rewrite',
  JSON.stringify(normalize(parseMenuItems(store4, rdf.sym(MENU)))) === JSON.stringify(normalize(tree3)));
check('pantry survives repeated rewrites', subjectPresent(store4, 'Forum') && subjectPresent(store4, podz.id));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
