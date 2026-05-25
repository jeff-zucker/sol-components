#!/usr/bin/env node
// Smoke test: each settings .shacl + matching .ttl validates as conforming
// under the URN-class + foaf:primaryTopic pattern. Run with:
//   node claude/smoke-tests/validate-settings-shapes.mjs

import { readFile } from 'node:fs/promises';
import { Parser } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import defaultEnv from 'rdf-validate-shacl/src/defaultEnv.js';

const DK   = '/home/jeff/data-kitchen';
const SWC  = '/home/jeff/solid/solid-web-components';

async function loadDataset(ttlPath) {
  const text = await readFile(ttlPath, 'utf8');
  const baseIRI = 'file://' + ttlPath;
  const quads = new Parser({ baseIRI }).parse(text);
  return defaultEnv.dataset(quads);
}

const cases = [
  { shape: `${SWC}/shapes/weather-settings.shacl`,
    data:  `${DK}/data/weather-settings.ttl` },
  { shape: `${SWC}/shapes/time-settings.shacl`,
    data:  `${DK}/data/time-settings.ttl` },
  { shape: `${SWC}/shapes/data-kitchen-settings.shacl`,
    data:  `${DK}/data/data-kitchen-settings.ttl` },
  { shape: `${SWC}/shapes/weather-settings.shacl`,
    data:  `${SWC}/help/data/weather-demo.ttl` },
  { shape: `${SWC}/shapes/weather-settings.shacl`,
    data:  `${SWC}/data/weather-settings.ttl` },
  { shape: `${SWC}/shapes/time-settings.shacl`,
    data:  `${SWC}/data/time-settings.ttl` },
  { shape: `${SWC}/shapes/weather-settings.shacl`,
    data:  `${SWC}/help/data/weather-settings.ttl` },
  { shape: `${SWC}/shapes/time-settings.shacl`,
    data:  `${SWC}/help/data/time-settings.ttl` },
];

let fail = 0;
for (const { shape, data } of cases) {
  const tag = `${data.replace(/^.*\//, '')}  ←  ${shape.replace(/^.*\//, '')}`;
  try {
    const shapes = await loadDataset(shape);
    const dataset = await loadDataset(data);
    // Inline ui-vocab when the shape imports it (into both shapes and data
    // graphs — sh:class checks against the data graph), and drop the
    // owl:imports quad so the validator doesn't try to fetch it itself.
    if (shape.endsWith('weather-settings.shacl') || shape.endsWith('data-kitchen-settings.shacl')) {
      const vocab = await loadDataset(`${SWC}/data/ui-vocab.ttl`);
      for (const q of vocab) { shapes.add(q); dataset.add(q); }
      const imports = defaultEnv.namedNode('http://www.w3.org/2002/07/owl#imports');
      for (const q of [...shapes]) {
        if (q.predicate.equals(imports)) shapes.delete(q);
      }
    }
    const validator = new SHACLValidator(shapes, { factory: defaultEnv });
    const report = await validator.validate(dataset);
    if (report.conforms) {
      console.log(`✓ conforms  ${tag}`);
    } else {
      console.log(`✗ fails     ${tag}`);
      fail++;
      for (const r of report.results || []) {
        const msg = r.message?.[0]?.value || r.message?.value || '(no message)';
        const focus = r.focusNode?.value || '?';
        const path = r.path?.value || '?';
        console.log(`    – ${msg}  [focus=${focus}  path=${path}]`);
      }
    }
  } catch (err) {
    console.log(`✗ error     ${tag}`);
    console.log(`    ${err.stack || err.message}`);
    fail++;
  }
}
process.exit(fail ? 1 : 0);
