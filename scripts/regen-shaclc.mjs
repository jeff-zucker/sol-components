#!/usr/bin/env node
// Regenerate .shaclc twins for every .shacl in shapes/.
//
// Usage: node scripts/regen-shaclc.mjs [path/to/file.shacl ...]
// With no args, processes every shapes/*.shacl.
//
// .shaclc is a derived artifact — do NOT hand-edit. The .shacl file is the
// canonical source. After modifying a .shacl, run this script to refresh
// its .shaclc twin.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'n3';
import { write } from 'shaclc-write';

const here = dirname(fileURLToPath(import.meta.url));
const shapesDir = join(here, '..', 'shapes');

const explicit = process.argv.slice(2);
const targets = explicit.length
  ? explicit
  : (await readdir(shapesDir))
      .filter((f) => f.endsWith('.shacl'))
      .map((f) => join(shapesDir, f));

// Parse source with callbacks so we can capture its prefix map and feed
// the same names back to shaclc-write. Use a stable synthetic base so
// `<>` and relative IRIs resolve to identifiable strings we can strip
// from the output.
function parseWithPrefixes(ttl, baseIRI) {
  const prefixes = {};
  const quads = [];
  return new Promise((resolve, reject) => {
    new Parser({ baseIRI }).parse(ttl, (err, quad, prefixMap) => {
      if (err) return reject(err);
      if (quad) quads.push(quad);
      else resolve({ quads, prefixes });
    }, (prefix, iri) => {
      prefixes[prefix] = iri.value;
    });
  });
}

let fail = 0;
for (const shaclPath of targets) {
  const shaclcPath = shaclPath.replace(/\.shacl$/, '.shaclc');
  try {
    const ttl = await readFile(shaclPath, 'utf8');
    const BASE = `http://swc.invalid/shapes/${basename(shaclPath, '.shacl')}#`;
    const BASE_BARE = BASE.slice(0, -1); // without the #
    const withBase = /^@base\b/m.test(ttl) ? ttl : `@base <${BASE_BARE}> .\n${ttl}`;
    const { quads, prefixes } = await parseWithPrefixes(withBase, BASE_BARE);

    // Drop the empty-prefix entry (`<#>`); shaclc-write infers it.
    delete prefixes[''];

    const { text } = await write(quads, {
      extendedSyntax: true,
      errorOnUnused: false,
      requireBase: false,
      prefixes,
    });

    // Strip synthetic base back to relative / `<>` form:
    //   <BASE>           → <>          (the file IRI)
    //   <BASE#X>         → <#X>        (preserve in-file fragments)
    //   <http://swc.invalid/data/X> → <../data/X>  (preserve relative siblings)
    let cleaned = text
      .replaceAll(`<${BASE_BARE}>`, '<>')
      .replaceAll(`<${BASE}`, '<#')
      .replaceAll(`<http://swc.invalid/data/`, '<../data/')
      .replace(/^BASE <[^>]+>\n?/m, '');

    // shaclc-write's extended-syntax escape can drop the `.` separator
    // between adjacent turtle statements. Split off the trailing turtle
    // (everything after the last shape `}`) and insert `.` before each
    // bare IRI that starts a new statement.
    const lastBrace = cleaned.lastIndexOf('\n}');
    if (lastBrace !== -1) {
      const head = cleaned.slice(0, lastBrace + 2);
      const tail = cleaned.slice(lastBrace + 2)
        // Two adjacent `>` `<` IRIs with no separator → add `.\n` between.
        .replace(/>(<[A-Za-z][A-Za-z0-9+.\-]*:)/g, '> .\n$1');
      cleaned = head + tail;
    }

    // House style: collapse shaclc-write's multi-line `% … %` annotation
    // blocks onto a single line — `prop type [card] % sh:name "x" ; … % .`
    cleaned = cleaned.replace(
      /[ ]*%\n((?:[ \t]+[^\n]*\n)+?)[ \t]*% \./g,
      (_m, inner) => {
        const body = inner.split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
        return ` % ${body} % .`;
      },
    );
    // …and indent with 4 spaces, not tabs.
    cleaned = cleaned.replace(/^\t+/gm, (t) => '    '.repeat(t.length));

    // No # comment header — per project rule, RDF files (incl. .shaclc)
    // carry no comments. The "auto-generated" fact is documented in
    // claude/ memory, not in the file.
    await writeFile(shaclcPath, cleaned);
    console.log(`✓ ${basename(shaclPath)} → ${basename(shaclcPath)}`);
  } catch (err) {
    console.error(`✗ ${basename(shaclPath)}: ${err.message}`);
    fail++;
  }
}
process.exit(fail ? 1 : 0);
