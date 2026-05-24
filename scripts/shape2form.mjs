#!/usr/bin/env node
// shape2form — generate a ui:Form TTL from a SHACL shape.
//
// Usage:
//   node scripts/shape2form.mjs <input.shacl> [--out <output.ttl>]
//   node scripts/shape2form.mjs <input.shacl> --stdout
//
// Reads the SHACL shape, runs core/shape-to-form.js's parseShape() to
// get the descriptor list, then emits a ui:Form TTL using
// ui:* vocabulary mapped per the table below.
//
// After the direct-predicate vocab migration
// (claude/plans/PLAN-vocab-migration.md), generated forms point
// `ui:property` at the actual editable predicate (geo:lat, time:hours,
// dct:source, etc.) — so the output is now usable by solid-ui's
// vanilla form renderer in addition to documentation tooling.
//
// What it's for:
//   - A persistent ui:Form artifact alongside each shape (the "third
//     thing" — schema, data, form).
//   - Documentation: a human-readable form spec.
//   - Code review: did the shape map to the form you expected?
//   - Tooling: anything that consumes ui:Form RDF.
//
// Naming: the tool is shape2form (not shacl2form) because the
// descriptor list `parseShape` returns is schema-language-agnostic.
// ShEx and SHACL-C support is on the roadmap;
// see claude/plans/PLAN-shape2form-or-and.md for the combinator
// work that lays the groundwork for those.
//
// Mapping (SHACL construct → ui:* field type):
//   sh:datatype xsd:string    → ui:SingleLineTextField
//   sh:datatype xsd:integer   → ui:IntegerField
//   sh:datatype xsd:decimal   → ui:DecimalField
//   sh:datatype xsd:boolean   → ui:BooleanField
//   sh:datatype xsd:anyURI    → ui:NamedNodeURIField
//   sh:datatype xsd:date      → ui:DateField
//   sh:datatype xsd:dateTime  → ui:DateTimeField
//   sh:nodeKind sh:IRI        → ui:NamedNodeURIField
//   sh:in (literals)          → ui:Choice + auto-generated rdfs:Class
//                                whose instances carry the option labels
//   sh:in (IRIs with rdfs:label) → ui:Choice + ui:from pointing at a class
//                                  whose instances are those IRIs (labels
//                                  copied from the shape)
//   sh:minCount 1             → ui:required true
//   sh:maxCount > 1 or absent → wrapped in ui:Multiple
//   sh:name                   → ui:label
//   sh:description            → rdfs:comment

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseShape } from '../core/shape-to-form.js';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const SH  = 'http://www.w3.org/ns/shacl#';

// --- CLI -----------------------------------------------------------------

function parseArgs(argv) {
  const args = { stdout: false, out: null, input: null, formName: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stdout') args.stdout = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--name') args.formName = argv[++i];
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else if (!args.input) args.input = a;
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  if (!args.input) { printHelp(); process.exit(2); }
  return args;
}

function printHelp() {
  console.error(`shape2form — generate a ui:Form TTL from a SHACL shape

Usage:
  node scripts/shape2form.mjs <input.shacl> [--out <output.ttl>] [--name <FormName>]
  node scripts/shape2form.mjs <input.shacl> --stdout

Options:
  --out <path>    Write the TTL to <path>. Without this flag and without
                  --stdout, the output path is derived: <input-basename>-form.ttl
                  in the same directory.
  --stdout        Write the TTL to stdout instead of a file.
  --name <Name>   Local name for the ui:Form node (default: derived from
                  the input filename, e.g. weather-settings.shacl → WeatherForm).
`);
}

// --- Helpers -------------------------------------------------------------

function deriveFormName(inputPath) {
  const stem = basename(inputPath).replace(/\.[^.]+$/, '');
  return stem
    .replace(/-?settings$/i, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map(seg => seg[0].toUpperCase() + seg.slice(1))
    .join('') + 'Form';
}

function defaultOutPath(inputPath) {
  const stem = basename(inputPath).replace(/\.[^.]+$/, '').replace(/-?settings$/i, '');
  return resolve(dirname(inputPath), `${stem}-form.ttl`);
}

function safeLocalName(key) {
  if (!key) return 'field';
  return key.replace(/[^A-Za-z0-9_-]/g, '_');
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function shortenXsd(uri) {
  return uri && uri.startsWith(XSD) ? `xsd:${uri.slice(XSD.length)}` : `<${uri}>`;
}

// `key` from the new ShapeProp is the local-part of the path URI
// (e.g. "lat" for geo:lat). Returns null for blank labels.
function fieldLocalName(desc) {
  return safeLocalName(desc.key) || 'field';
}

// Map a SHACL property descriptor to its ui:* field type + extra triples.
function mapToUiField(desc, formNs) {
  if (desc.enumOpts) {
    // Build an enum class. If the shape provided rdfs:labels for the
    // options (typical for IRI-valued enums), copy them through;
    // otherwise use the option value itself.
    const className = `${formNs}${capitalize(fieldLocalName(desc))}Type`;
    const instances = desc.enumOpts.map((opt, i) => ({
      uri: `${className}-${safeLocalName(desc.enumLabels?.[i] || opt)}`,
      label: desc.enumLabels?.[i] || opt,
      // For IRI-valued enums, also link the synthesized instance to
      // the canonical URI via owl:sameAs so any downstream tool can
      // dereference back to the original.
      sameAs: desc.nodeKind === SH + 'IRI' ? opt : null,
    }));
    return {
      type: 'ui:Choice',
      from: className,
      classDecl: { className, instances },
      mappedCleanly: true,
    };
  }
  if (desc.nodeKind === SH + 'IRI') {
    return { type: 'ui:NamedNodeURIField', mappedCleanly: true };
  }
  switch (desc.datatype) {
    case XSD + 'string':    return { type: 'ui:SingleLineTextField', mappedCleanly: true };
    case XSD + 'integer':   return { type: 'ui:IntegerField',         mappedCleanly: true };
    case XSD + 'decimal':   return { type: 'ui:DecimalField',         mappedCleanly: true };
    case XSD + 'boolean':   return { type: 'ui:BooleanField',         mappedCleanly: true };
    case XSD + 'anyURI':    return { type: 'ui:NamedNodeURIField',    mappedCleanly: true };
    case XSD + 'date':      return { type: 'ui:DateField',            mappedCleanly: true };
    case XSD + 'dateTime':  return { type: 'ui:DateTimeField',        mappedCleanly: true };
  }
  return {
    type: 'ui:SingleLineTextField',
    mappedCleanly: false,
    fallbackReason: desc.datatype
      ? `unmapped datatype ${shortenXsd(desc.datatype)}`
      : `no datatype, nodeKind, or enum`,
  };
}

// Emit one ui:Form field block. `pathTurtle` is the predicate as it
// should appear in the output ("geo:lat", "dct:source", etc.) using
// whatever prefixes are declared in the header.
function emitField(desc, fieldNs, mapping, pathTurtle) {
  const local = fieldLocalName(desc);
  const lines = [];
  const fieldUri = `${fieldNs}${local}`;
  lines.push(`${fieldUri} a ${mapping.type} ;`);
  lines.push(`  ui:property ${pathTurtle} ;`);
  lines.push(`  ui:label ${jsonQuote(desc.label || desc.key)} ;`);
  if (mapping.from) lines.push(`  ui:from ${mapping.from} ;`);
  if (desc.minCount >= 1 && desc.maxCount === 1) lines.push(`  ui:required true ;`);
  if (desc.description) lines.push(`  rdfs:comment ${jsonQuote(desc.description)} ;`);
  if (!mapping.mappedCleanly) {
    lines.push(`  # TODO: ${mapping.fallbackReason}`);
  }
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/\s*;\s*$/, ' ;');
  lines.push(`  .`);
  return lines.join('\n');
}

function emitMultipleWrapper(desc, fieldNs, pathTurtle) {
  const local = fieldLocalName(desc);
  return [
    `${fieldNs}${local}Multiple a ui:Multiple ;`,
    `  ui:property ${pathTurtle} ;`,
    `  ui:label ${jsonQuote((desc.label || desc.key) + 's')} ;`,
    `  ui:part ${fieldNs}${local} .`,
    ``,
  ].join('\n');
}

function emitChoiceClass({ className, instances }) {
  const lines = [];
  lines.push(`${className} a rdfs:Class .`);
  for (const inst of instances) {
    let line = `${inst.uri} a ${className} ; rdfs:label ${jsonQuote(inst.label)}`;
    if (inst.sameAs) line += ` ; owl:sameAs <${inst.sameAs}>`;
    line += ' .';
    lines.push(line);
  }
  return lines.join('\n');
}

function jsonQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// --- Prefix handling -----------------------------------------------------

// Render a predicate URI as a prefixed name when its namespace matches
// one of the known prefixes; otherwise emit the absolute <URI>.
const KNOWN_PREFIXES = {
  'geo':    'http://www.w3.org/2003/01/geo/wgs84_pos#',
  'schema': 'http://schema.org/',
  'dct':    'http://purl.org/dc/terms/',
  'qudt':   'http://qudt.org/vocab/sou/',
  'time':   'http://www.w3.org/2006/time#',
  'ui':     'http://www.w3.org/ns/ui#',
  'rdfs':   'http://www.w3.org/2000/01/rdf-schema#',
  'rdf':    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'xsd':    XSD,
  'schema_org': 'https://schema.org/',  // tolerate the https variant
};

function pathToTurtle(uri) {
  for (const [prefix, ns] of Object.entries(KNOWN_PREFIXES)) {
    if (uri.startsWith(ns)) {
      const local = uri.slice(ns.length);
      // Only safe to use a prefixed name if the local part is a valid
      // turtle PNAME_LN local. Otherwise fall back to <absolute>.
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(local)) {
        return `${prefix === 'schema_org' ? 'schema' : prefix}:${local}`;
      }
    }
  }
  return `<${uri}>`;
}

// Collect every prefix we actually used in the output, plus the
// always-needed rdfs / owl / ui set. Sorted for readability.
function collectUsedPrefixes(prefixesUsed) {
  const used = new Set(['ui', 'rdfs', 'owl']);
  for (const p of prefixesUsed) used.add(p);
  const out = [];
  // Stable order: ui, rdfs, owl first (they're the form vocab), then alpha.
  const head = ['ui', 'rdfs', 'owl'];
  for (const h of head) if (used.has(h)) out.push(h);
  for (const p of [...used].sort()) if (!head.includes(p)) out.push(p);
  return out;
}

function emitPrefixDecls(prefixes) {
  const lines = [];
  for (const p of prefixes) {
    const ns = p === 'owl' ? 'http://www.w3.org/2002/07/owl#' : KNOWN_PREFIXES[p];
    if (ns) lines.push(`@prefix ${p}: <${ns}> .`);
  }
  return lines.join('\n');
}

// --- Main ----------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input);
const inputText = readFileSync(inputPath, 'utf8');

const inputUrl = pathToFileURL(inputPath).href;
const parsed = parseShape(inputText, inputUrl);

if (!parsed.properties.length) {
  console.error(`No properties found in ${args.input}. Nothing to generate.`);
  process.exit(1);
}

const formName = args.formName || deriveFormName(inputPath);
const formNs   = ':';
const fieldNs  = ':';
const formUri  = `${formNs}${formName}`;

// Build the parts list (one per field; wrap multi-valued in ui:Multiple).
const partTokens = [];
const fieldBlocks = [];
const multipleBlocks = [];
const classDecls = [];
const prefixesUsed = new Set();

const noteUsedPrefix = (turtleName) => {
  const colon = turtleName.indexOf(':');
  if (colon !== -1 && !turtleName.startsWith('<')) prefixesUsed.add(turtleName.slice(0, colon));
};

for (const desc of parsed.properties) {
  const mapping = mapToUiField(desc, formNs);
  if (mapping.classDecl) classDecls.push(mapping.classDecl);

  const pathTurtle = pathToTurtle(desc.path.value);
  noteUsedPrefix(pathTurtle);

  const local = fieldLocalName(desc);
  if (desc.maxCount > 1 || (desc.maxCount === Infinity && desc.minCount >= 1)) {
    partTokens.push(`${fieldNs}${local}Multiple`);
    multipleBlocks.push(emitMultipleWrapper(desc, fieldNs, pathTurtle));
    fieldBlocks.push(emitField(desc, fieldNs, mapping, pathTurtle));
  } else {
    partTokens.push(`${fieldNs}${local}`);
    fieldBlocks.push(emitField(desc, fieldNs, mapping, pathTurtle));
  }
}

const formLabel = formName.replace(/Form$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');

const header = `# Generated by scripts/shape2form.mjs from ${basename(inputPath)}.
# Do not hand-edit — regenerate with:
#   node scripts/shape2form.mjs ${basename(inputPath)}
#
# After the direct-predicate vocab migration
# (see swc/claude/plans/PLAN-vocab-migration.md), \`ui:property\` here
# points at the actual editable predicate. Generated forms are
# solid-ui-renderable for the first time — drop them into a
# <sol-form source="…this-file.ttl" subject="…data.ttl#X"> for the
# legacy form-driven path, or use <sol-form shape="…" subject="…">
# for the same fields rendered via shape-to-form directly.

${emitPrefixDecls(collectUsedPrefixes(prefixesUsed))}

${formUri} a ui:Form ;
  ui:label ${jsonQuote(formLabel)} ;
  ui:parts ( ${partTokens.join(' ')} ) .
`;

const body = [
  ...multipleBlocks,
  ...fieldBlocks,
].join('\n\n');

const classes = classDecls.length
  ? '\n\n# ── Auto-generated classes for sh:in enums ──\n\n' + classDecls.map(emitChoiceClass).join('\n\n')
  : '';

const output = header + '\n' + body + classes + '\n';

if (args.stdout) {
  process.stdout.write(output);
} else {
  const outPath = args.out ? resolve(args.out) : defaultOutPath(inputPath);
  writeFileSync(outPath, output, 'utf8');
  console.error(`Wrote ${outPath}`);
}
