import { siblingUrl } from '../../core/here.js';

/**
 * Built-in view renderer for sol-query — "menu".
 * Turns a result set of URIs + labels into a <sol-menu>. Each row becomes
 * one menu item; clicking loads the URL into the content panel.
 *
 * Column selection: uses vars named `link` + `label` when present,
 * otherwise falls back to the first two columns in order (1st = link,
 * 2nd = label). If only one column is returned, it's used for both.
 *
 * Any additional result columns are forwarded as attributes on the anchor,
 * so <sol-menu> can pass them through to the panel component.
 *
 * A `data-handler` attribute on the host <sol-query> is forwarded to the
 * <sol-menu> element so authors can choose the component each item wraps:
 *   <sol-query view="menu" data-handler="sol-live-edit" …>
 *
 * Usage: <sol-query view="menu" endpoint="…" sparql="SELECT ?link ?label …">
 */

export async function render(container, data, host) {
  const vars     = data.head.vars;
  const bindings = data.results.bindings;
  if (!bindings?.length) { container.textContent = 'No results'; return; }

  const hasNamed = vars.includes('link') && vars.includes('label');
  const linkVar  = hasNamed ? 'link'  : vars[0];
  const labelVar = hasNamed ? 'label' : (vars[1] ?? vars[0]);
  const extraVars = vars.filter(v => v !== linkVar && v !== labelVar);

  await import(siblingUrl('../sol-menu.js', import.meta.url));

  const menu = document.createElement('sol-menu');

  const handler = host?.getAttribute?.('data-handler');
  if (handler) menu.setAttribute('data-handler', handler);
  const orientation = host?.getAttribute?.('orientation');
  if (orientation) menu.setAttribute('orientation', orientation);

  for (const row of bindings) {
    const url   = row[linkVar]?.value;
    const label = row[labelVar]?.value || url || '';
    if (!url) continue;
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.textContent = label;
    for (const v of extraVars) {
      const cell = row[v];
      if (cell?.value != null) a.setAttribute(v, cell.value);
    }
    menu.appendChild(a);
  }

  container.appendChild(menu);
}
