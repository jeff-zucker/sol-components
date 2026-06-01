import assert from 'node:assert';
import {
  renameTopicEdit, recategorizeEdit, addFeedEdit, deleteToBinEdit, restoreEdit,
  reorderEdit, mintFeedUri, patchBody, patchDoc, binUriFor, lit,
} from './feed-edit.js';

let n = 0; const ok = (m) => { console.log('  ✓ ' + m); n++; };
const F = 'http://ex/feeds.ttl';

// rename
let e = renameTopicEdit(F+'#News', 'News', 'World News');
assert.deepEqual(e.deletes, [`<${F}#News> skos:prefLabel "News" .`]);
assert.deepEqual(e.inserts, [`<${F}#News> skos:prefLabel "World News" .`]);
ok('renameTopicEdit swaps prefLabel');

// recategorize + no-op
e = recategorizeEdit(F+'#f1', F+'#News', F+'#Culture');
assert.ok(e.deletes[0].includes('#News') && e.inserts[0].includes('#Culture'));
assert.deepEqual(recategorizeEdit(F+'#f1', F+'#News', F+'#News'), {deletes:[],inserts:[]});
ok('recategorizeEdit moves dcat:theme (no-op when unchanged)');

// add (with + without catalog)
e = addFeedEdit(F+'#feed-x', { title:'X "Y"', url:'http://x/r.xml', topicUri:F+'#News', catalogUri:F+'#catalog' });
assert.ok(e.inserts[0].includes('a dcat:Dataset, rss:channel'));
assert.ok(e.inserts[0].includes('dct:title "X \\"Y\\""'));      // quote escaped
assert.ok(e.inserts[0].includes('dcat:accessURL <http://x/r.xml>'));
assert.equal(e.inserts[1], `<${F}#catalog> dcat:dataset <${F}#feed-x> .`);
ok('addFeedEdit builds dataset + catalog membership, escapes literals');

// delete → bin (ensures bin concept)
const bin = binUriFor(F);
assert.equal(bin, F+'#Deleted');
e = deleteToBinEdit(F+'#f1', F+'#News', bin);
assert.deepEqual(e.deletes, [`<${F}#f1> dcat:theme <${bin}> .`].map(()=>`<${F}#f1> dcat:theme <${F}#News> .`));
assert.ok(e.inserts.some(t => t === `<${F}#f1> dcat:theme <${bin}> .`));
assert.ok(e.inserts.some(t => t.includes('skos:Concept') && t.includes('"Deleted"')));
ok('deleteToBinEdit re-themes to #Deleted and mints the bin concept');

// restore = recategorize out of bin
e = restoreEdit(F+'#f1', bin, F+'#Culture');
assert.ok(e.deletes[0].includes('#Deleted') && e.inserts[0].includes('#Culture'));
ok('restoreEdit re-files out of the bin');

// reorder
e = reorderEdit(F+'#f1', 3, 7);
assert.deepEqual(e.deletes, [`<${F}#f1> schema:position 3 .`]);
assert.deepEqual(e.inserts, [`<${F}#f1> schema:position 7 .`]);
ok('reorderEdit replaces schema:position');

// mint uniqueness
assert.equal(mintFeedUri(F, 'NY Times', []), F+'#feed-ny-times');
assert.equal(mintFeedUri(F, 'NY Times', [F+'#feed-ny-times']), F+'#feed-ny-times-2');
ok('mintFeedUri slugifies + avoids collisions');

// patchBody both sections + prefixes
const body = patchBody(recategorizeEdit(F+'#f1', F+'#News', F+'#Culture'));
assert.ok(body.includes('PREFIX dcat: <http://www.w3.org/ns/dcat#>'));
assert.ok(body.includes('DELETE DATA {') && body.includes('INSERT DATA {') && body.includes(' ;\n'));
assert.ok(patchBody({inserts:['<a> <b> <c> .']}).includes('INSERT DATA') && !patchBody({inserts:['<a> <b> <c> .']}).includes('DELETE'));
ok('patchBody emits prefixes + DELETE/INSERT DATA blocks');

// patchDoc wiring (fake fetch) + no-op skip
let captured = null;
await patchDoc(F, recategorizeEdit(F+'#f1', F+'#News', F+'#Culture'), { fetchImpl: async (u, o) => { captured = {u,o}; return {ok:true}; } });
assert.equal(captured.u, F);
assert.equal(captured.o.method, 'PATCH');
assert.equal(captured.o.headers['Content-Type'], 'application/sparql-update');
let called = false;
await patchDoc(F, {deletes:[],inserts:[]}, { fetchImpl: async () => { called = true; return {ok:true}; } });
assert.equal(called, false, 'no-op edit does not PATCH');
await assert.rejects(() => patchDoc(F, recategorizeEdit(F+'#f1',F+'#a',F+'#b'), { fetchImpl: async()=>({ok:false,status:403}) }), /403/);
ok('patchDoc PATCHes sparql-update, skips no-ops, throws on !ok');

console.log(`\n${n} feed-edit checks passed`);
