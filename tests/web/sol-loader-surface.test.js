/**
 * @jest-environment jsdom
 *
 * The BUILT loader (dist/sol-loader.min.js) publishes the host-services surface.
 * Evaluated with no data-* attributes, so it sets up window.SolidWebComponents
 * without importing any modules. Run `npm run bundle` if this drifts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  expect(SWC.has('rdf')).toBe(true);
  expect(SWC.capabilities).toContain('rdf');

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
