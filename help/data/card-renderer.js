/**
 * Example custom view renderer for sol-query.
 * Receives (container, data) where data is the W3C SPARQL Query Results JSON
 * envelope: { head: { vars }, results: { bindings } }.
 * Renders each row as a card.
 *
 * Use as: <sol-query ... view="./data/card-renderer.js">
 */
export function render(container, data) {
  const vars     = data.head.vars;
  const bindings = data.results.bindings;

  const shorten = v => v?.value
    ? v.value.replace(/.*[/#]([^/#]+)\/?$/, '$1') || v.value
    : '';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:.75rem;padding:.5rem 0';

  bindings.forEach(row => {
    const card = document.createElement('div');
    card.style.cssText =
      'border:1px solid #ddd;border-radius:6px;padding:.75rem 1rem;' +
      'min-width:160px;max-width:260px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)';

    vars.forEach(v => {
      const cell = row[v];
      if (!cell || !cell.value) return;
      const line = document.createElement('div');
      line.style.cssText = 'margin:.2rem 0;font-size:.88rem';
      const label = document.createElement('span');
      label.style.cssText = 'color:#888;font-size:.78rem;margin-right:.3rem';
      label.textContent = v + ':';
      line.appendChild(label);
      if (cell.type === 'uri') {
        const a = document.createElement('a');
        a.href = cell.value;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = shorten(cell);
        a.style.cssText = 'color:#0066cc;word-break:break-all';
        line.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.textContent = cell.value;
        line.appendChild(span);
      }
      card.appendChild(line);
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
}
