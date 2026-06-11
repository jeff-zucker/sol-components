/**
 * @jest-environment jsdom
 *
 * HTML round-trip for the tabs sync: model → generateShell → html →
 * extractShell → model. No rdflib needed (pure string + DOM), so this exercises
 * core/menu-generate.js and core/menu-html.js directly. The RDF half
 * (parseMenuItems / updateMenuInStore) is covered elsewhere.
 */
import { generateShell } from '../../core/menu-generate.js';
import { extractFromHtml } from '../../core/menu-html.js';

const CURRENT = [
  '<sol-tabs id="dk-tabs" keep-alive>',
  '',
  '  <!-- chrome:begin -->',
  '  <sol-button class="omp-help">?</sol-button>',
  '  <!-- chrome:end -->',
  '',
  '</sol-tabs>',
  '',
].join('\n');

const sortParams = (p) => [...p].map(([k, v]) => `${k}=${v}`).sort();

describe('tabs sync HTML round-trip', () => {
  const tabs = [
    { type: 'component', id: 'panel-news', name: '📰 News', tag: 'sol-feed',
      params: [['id', 'panel-news'], ['view', 'threePanel'], ['source', './news.ttl']] },
    { type: 'component', id: 'panel-x', name: '🎛 X', tag: 'sol-include', region: 'modal',
      params: [['id', 'panel-x'], ['source', './x.html'], ['trusted', '']] },
  ];
  const bar = [
    { type: 'component', name: 'Search', tag: 'sol-search',
      params: [['class', 'omp-search'], ['title', 'Search'], ['source', './s.ttl']] },
    { type: 'component', name: 'A', tag: 'sol-button',
      params: [['class', 'omp-fontsize'], ['title', 'Text size']] },
  ];

  const { html, chrome } = generateShell({ tabs, bar, currentHtml: CURRENT });
  const out = extractFromHtml(html);

  test('chrome block + opening tag preserved', () => {
    expect(chrome).toContain('chrome:begin');
    expect(html).toContain('<sol-tabs id="dk-tabs" keep-alive>');
    expect(html).toContain('omp-help');          // chrome kept verbatim
  });

  test('tab count + identity', () => {
    expect(out.tabs).toHaveLength(2);
    expect(out.tabs.map((t) => t.id)).toEqual(['panel-news', 'panel-x']);
    expect(out.tabs.map((t) => t.name)).toEqual(['📰 News', '🎛 X']);
    expect(out.tabs.map((t) => t.tag)).toEqual(['sol-feed', 'sol-include']);
  });

  test('tab params are lossless (order-insensitive)', () => {
    tabs.forEach((orig, i) => {
      expect(sortParams(out.tabs[i].params)).toEqual(sortParams(orig.params));
    });
  });

  test('ui:region survives', () => {
    expect(out.tabs[0].region).toBeFalsy();
    expect(out.tabs[1].region).toBe('modal');
  });

  test('bar items: tag, name, params survive', () => {
    expect(out.bar).toHaveLength(2);
    expect(out.bar.map((b) => b.tag)).toEqual(['sol-search', 'sol-button']);
    expect(out.bar.map((b) => b.name)).toEqual(['Search', 'A']);   // sol-search via title, button via text
    bar.forEach((orig, i) => {
      expect(sortParams(out.bar[i].params)).toEqual(sortParams(orig.params));
    });
  });

  test('chrome elements are NOT harvested as bar items', () => {
    expect(out.bar.every((b) => b.tag !== 'sol-button' || b.name !== '?')).toBe(true);
  });
});

describe('target → ui:region normalization', () => {
  test('target="_blank" harvests as region "tab"; _self as "inline"', () => {
    const html = [
      '<sol-tabs>',
      '  <a href="./a" data-handler="sol-feed" target="_blank">A</a>',
      '  <a href="./b" data-handler="sol-feed" target="_self">B</a>',
      '  <!-- chrome:begin --><!-- chrome:end -->',
      '</sol-tabs>',
    ].join('\n');
    const { tabs } = extractFromHtml(html);
    expect(tabs[0].region).toBe('tab');
    expect(tabs[1].region).toBe('inline');
    // target itself is normalized away, not kept as a param
    expect(tabs[0].params.find(([k]) => k === 'target')).toBeUndefined();
  });
});

describe('capture-all: standard anchor attrs round-trip', () => {
  test('rel survives as a param and re-emits plain', () => {
    const model = [{ type: 'component', name: 'L', tag: 'sol-feed',
      params: [['source', './l'], ['rel', 'noopener']] }];
    const { html } = generateShell({ tabs: model, bar: [], currentHtml: CURRENT });
    expect(html).toContain('rel="noopener"');     // plain, not data-rel
    expect(html).not.toContain('data-rel');
    const { tabs } = extractFromHtml(html);
    expect(tabs[0].params.find(([k]) => k === 'rel')).toEqual(['rel', 'noopener']);
  });
});
