/**
 * @jest-environment jsdom
 *
 * The BUILT loader (dist/sol-loader.min.js) publishes the host-services surface.
 * Evaluated with no data-* attributes, so it sets up window.SolidWebComponents
 * without importing any modules. Run `npm run bundle` if this drifts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Each test evals the loader into a fresh global, as a real page has exactly one.
beforeEach(() => {
  delete window.SolidWebComponents;
  document.querySelectorAll('script[type="importmap"]').forEach((s) => s.remove());
});

test('built loader exposes the host-services surface', () => {
  const code = readFileSync(resolve(process.cwd(), 'dist/sol-loader.min.js'), 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
  const SWC = window.SolidWebComponents;

  expect(SWC).toBeDefined();
  expect(SWC.version).toBe('1');
  expect(typeof SWC.services.register).toBe('function');
  expect(typeof SWC.services.whenReady).toBe('function');
  expect(SWC.has('rdf')).toBe(false);

  // a registered service surfaces through the convenience getter + has/capabilities
  SWC.services.register('rdf', { store: { marker: true } });
  expect(SWC.rdf).toEqual({ store: { marker: true } });
  expect(SWC.has('rdf')).toBe(true);              // available as a service
  expect(Array.isArray(SWC.capabilities)).toBe(true); // loaded-capability names (none loaded here)

  // fetch getter falls back to global fetch when no auth service
  expect(typeof SWC.fetch === 'function' || SWC.fetch === undefined).toBe(true);
  SWC.services.register('auth', { fetch: () => 'authed' });
  expect(SWC.fetch()).toBe('authed');

  // on/emit round-trip over the document
  let got;
  const off = SWC.on('eco-test-evt', (e) => { got = e.detail; });
  SWC.emit('eco-test-evt', { a: 1 });
  expect(got).toEqual({ a: 1 });
  off();
});

test('registerCapability merges into the manifest (append, de-duped)', () => {
  const code = readFileSync(resolve(process.cwd(), 'dist/sol-loader.min.js'), 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
  const SWC = window.SolidWebComponents;

  SWC.registerCapability('acme', { modules: ['acme-a', 'acme-b'] });
  expect(SWC.manifest.capabilities.acme.modules).toEqual(['acme-a', 'acme-b']);
  SWC.registerCapability('acme', { modules: ['acme-b', 'acme-c'] }); // dedupe + append
  expect(SWC.manifest.capabilities.acme.modules).toEqual(['acme-a', 'acme-b', 'acme-c']);
});

test('the loader bakes in nothing about swc — manifest starts empty', () => {
  const code = readFileSync(resolve(process.cwd(), 'dist/sol-loader.min.js'), 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
  const SWC = window.SolidWebComponents;
  // No currentScript in eval → no sibling manifest fetched → no baked capabilities.
  expect(SWC.manifest.capabilities).toEqual({});
  // …and the loader source itself carries no baked swc manifest/importmap.
  expect(code).not.toMatch(/__SWC_(MANIFEST|IMPORTMAPS)__/);
  expect(code).not.toContain('"sol-login"');   // no baked capability module list
});
