/**
 * @jest-environment jsdom
 */

// Tests for the render dispatch in core/from-query.js — chiefly the "plain text
// host → textContent" behaviour, plus regressions for the list / img shapes and the
// custom-element (renders-itself) path. We call renderInto directly with a synthetic
// W3C SPARQL 1.1 Results JSON, so no query engine runs.

window.__SolSuppressDefineWarn = true;

import { renderInto } from '../../core/from-query.js';

const cell = (value, type = 'literal') => ({ type, value });
const data = (vars, rows) => ({ head: { vars }, results: { bindings: rows } });

describe('from-query renderInto: plain text hosts', () => {
  test('<h1> shows a single result as its textContent', () => {
    const h1 = document.createElement('h1');
    renderInto(h1, data(['name'], [{ name: cell('Ada') }]));
    expect(h1.textContent).toBe('Ada');
  });

  test('several rows are joined with ", "', () => {
    const span = document.createElement('span');
    renderInto(span, data(['name'], [{ name: cell('Ada') }, { name: cell('Alan') }]));
    expect(span.textContent).toBe('Ada, Alan');
  });

  test('empty results clear the host', () => {
    const p = document.createElement('p');
    p.textContent = 'Loading…';
    renderInto(p, data(['name'], []));
    expect(p.textContent).toBe('');
  });

  test('uses textContent, not innerHTML — markup in a literal is not parsed', () => {
    const span = document.createElement('span');
    renderInto(span, data(['v'], [{ v: cell('<b>boom</b>') }]));
    expect(span.textContent).toBe('<b>boom</b>');
    expect(span.children.length).toBe(0);          // never became a real <b>
  });

  test('every host still gets swcData and a bubbling sol-data-ready event', () => {
    const p = document.createElement('p');
    let detail;
    p.addEventListener('sol-data-ready', (e) => { detail = e.detail.data; });
    const d = data(['name'], [{ name: cell('Ada') }]);
    renderInto(p, d);
    expect(p.swcData).toBe(d);
    expect(detail).toBe(d);
  });
});

describe('from-query renderInto: other shapes still work', () => {
  test('<ul> → one <li> per row', () => {
    const ul = document.createElement('ul');
    renderInto(ul, data(['name'], [{ name: cell('Ada') }, { name: cell('Alan') }]));
    const lis = ul.querySelectorAll('li');
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe('Ada');
  });

  test('<img> → src set to the first result value', () => {
    const img = document.createElement('img');
    renderInto(img, data(['photo'], [{ photo: cell('http://x/a.png', 'uri') }]));
    expect(img.getAttribute('src')).toBe('http://x/a.png');
  });

  test('a custom element renders itself — its content is not replaced with text', () => {
    const el = document.createElement('x-foo');
    el.textContent = 'loading';
    const d = data(['name'], [{ name: cell('Ada') }]);
    renderInto(el, d);
    expect(el.textContent).toBe('');     // loading indicator cleared, value NOT injected
    expect(el.swcData).toBe(d);
  });
});
