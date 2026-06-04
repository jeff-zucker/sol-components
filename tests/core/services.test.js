/**
 * @jest-environment jsdom
 *
 * Host-services registry (core/services.js) + that the core modules publish
 * their services on import. This is the surface third-party components use to
 * share resources without importing swc.
 */
import {
  register, get, has, whenReady, services, root, EVENTS,
} from '../../core/services.js';

describe('core/services registry', () => {
  test('register / get / has', () => {
    register('thing', { v: 1 });
    expect(has('thing')).toBe(true);
    expect(get('thing')).toEqual({ v: 1 });
    expect(has('nope')).toBe(false);
  });

  test('whenReady resolves immediately when already registered', async () => {
    register('now', 42);
    await expect(whenReady('now')).resolves.toBe(42);
  });

  test('whenReady resolves when the service registers later', async () => {
    const pending = whenReady('later');
    register('later', 'ok');
    await expect(pending).resolves.toBe('ok');
  });

  test('EVENTS holds the coordination names and is frozen', () => {
    expect(EVENTS.LOGIN).toBe('sol-login');
    expect(EVENTS.READY).toBe('swc:ready');
    expect(EVENTS.DEFAULT_CHANGE).toBe('sol-default-change');
    expect(Object.isFrozen(EVENTS)).toBe(true);
  });

  test('root() exposes the registry + the EVENTS table', () => {
    services();                       // ensure populated
    const r = root();
    expect(typeof r.services.register).toBe('function');
    expect(r.EVENTS).toBe(EVENTS);
  });
});

describe('core modules publish their services on import', () => {
  test('core/rdf.js registers the shared store as "rdf"', async () => {
    const rdfMod = await import('../../core/rdf.js');
    expect(get('rdf')).toBe(rdfMod.rdf);
  });

  test('core/defaults.js registers "defaults" with get/onChange', async () => {
    await import('../../core/defaults.js');
    const d = get('defaults');
    expect(typeof d.get).toBe('function');
    expect(typeof d.onChange).toBe('function');
  });
});
