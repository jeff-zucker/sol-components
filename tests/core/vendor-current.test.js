// The bundled copies and CDN pins of the RDF stack must match what is installed,
// so a version update cannot land without its bundle being rebuilt
// (`node tools/vendor.mjs`) and its CDN major moved in tools/external-deps.json
// (then `npm run build:importmaps`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');
const { deps } = JSON.parse(read('tools/external-deps.json'));
const cdnMap = JSON.parse(read('dist/importmap-cdn.json')).imports;

describe.each(['rdflib', 'solid-logic', 'solid-ui'])('%s', (name) => {
  const installed = JSON.parse(read(`node_modules/${name}/package.json`)).version;
  const major = installed.split('.')[0];

  test('the bundled copy is the installed version', () => {
    const stamp = read(`dist/vendor/${name}.js`).split('\n', 1)[0];
    expect(stamp).toBe(`/*! vendored ${name}@${installed} */`);
  });

  test('the CDN pin is the installed major version', () => {
    expect(deps[name].cdn).toMatch(new RegExp(`${name}@${major}(/|$)`));
    expect(cdnMap[name]).toBe(deps[name].cdn);
  });
});
