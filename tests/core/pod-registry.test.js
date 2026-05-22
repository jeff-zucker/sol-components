/**
 * Tests for core/pod-registry.js — the group-keyed registry of known
 * pod storage URLs that backs <sol-pod>'s shared selector.
 */

import { jest } from '@jest/globals';
import { getRegistry, _resetRegistries } from '../../core/pod-registry.js';

beforeEach(() => _resetRegistries());

describe('getRegistry — group keying', () => {
  test('the same key returns the same registry', () => {
    expect(getRegistry('a')).toBe(getRegistry('a'));
  });

  test('different keys return different registries', () => {
    expect(getRegistry('a')).not.toBe(getRegistry('b'));
  });

  test('no key falls back to one shared default group', () => {
    expect(getRegistry()).toBe(getRegistry());
    expect(getRegistry(undefined)).toBe(getRegistry(null));
  });

  test('the reserved "none" key returns a fresh registry every call', () => {
    expect(getRegistry('none')).not.toBe(getRegistry('none'));
  });
});

describe('PodRegistry — add / list', () => {
  test('add normalises a URL to a trailing slash', () => {
    const reg = getRegistry('t');
    reg.add('https://pod.example');
    expect(reg.list()).toEqual(['https://pod.example/']);
  });

  test('addAll dedupes and reports whether anything changed', () => {
    const reg = getRegistry('t');
    expect(reg.addAll(['https://a/', 'https://b/'])).toBe(true);
    expect(reg.addAll(['https://a/'])).toBe(false);     // already known
    expect(reg.list()).toEqual(['https://a/', 'https://b/']);
  });

  test('blank / non-string entries are ignored', () => {
    const reg = getRegistry('t');
    reg.addAll(['', '  ', null, undefined, 42, 'https://ok/']);
    expect(reg.list()).toEqual(['https://ok/']);
  });

  test('list returns a copy — mutating it does not affect the registry', () => {
    const reg = getRegistry('t');
    reg.add('https://a/');
    reg.list().push('https://evil/');
    expect(reg.list()).toEqual(['https://a/']);
  });
});

describe('PodRegistry — subscriptions', () => {
  test('a subscriber is notified with the snapshot on a change', () => {
    const reg = getRegistry('t');
    const fn = jest.fn();
    reg.subscribe(fn);
    reg.add('https://a/');
    expect(fn).toHaveBeenCalledWith(['https://a/'], false);
  });

  test('no notification when nothing changed', () => {
    const reg = getRegistry('t');
    reg.add('https://a/');
    const fn = jest.fn();
    reg.subscribe(fn);
    reg.add('https://a/');                 // duplicate — no change
    expect(fn).not.toHaveBeenCalled();
  });

  test('the silent flag is passed through to subscribers', () => {
    const reg = getRegistry('t');
    const fn = jest.fn();
    reg.subscribe(fn);
    reg.addAll(['https://a/'], { silent: true });
    expect(fn).toHaveBeenCalledWith(['https://a/'], true);
  });

  test('an unsubscribed listener is no longer notified', () => {
    const reg = getRegistry('t');
    const fn = jest.fn();
    reg.subscribe(fn);
    reg.unsubscribe(fn);
    reg.add('https://a/');
    expect(fn).not.toHaveBeenCalled();
  });

  test('a throwing subscriber does not stop the others', () => {
    const reg = getRegistry('t');
    const good = jest.fn();
    reg.subscribe(() => { throw new Error('bad subscriber'); });
    reg.subscribe(good);
    expect(() => reg.add('https://a/')).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

describe('_resetRegistries', () => {
  test('drops shared registries so a later getRegistry starts empty', () => {
    getRegistry('t').add('https://a/');
    _resetRegistries();
    expect(getRegistry('t').list()).toEqual([]);
  });
});
