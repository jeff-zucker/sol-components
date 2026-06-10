import { siblingUrl } from '../../core/here.js';

/**
 * Built-in view renderer for sol-query — "tabs".
 * Turns a result set of URIs + labels into a <sol-tabs> element. Each row
 * becomes one tab: anchor href = link column, anchor text = label column.
 *
 * Column selection: uses vars named `link` + `label` when present,
 * otherwise falls back to the first two columns in order (1st = link,
 * 2nd = label). If only one column is returned, it's used for both.
 *
 * Any additional result columns are forwarded as attributes on the anchor,
 * so <sol-tabs> can pass them through to the panel component. e.g. a query
 * with `?link ?label ?view` lets the `view` value land on the panel element.
 *
 * The data-handler attribute on <sol-query view="tabs"> is forwarded onto the
 * <sol-tabs> element, so authors can choose the component each tab wraps
 * around:
 *   <sol-query view="tabs" data-handler="sol-live-edit" …>
 *
 * Usage: <sol-query view="tabs" endpoint="…" sparql="SELECT ?link ?label …">
 */

export async function render(container, data, host) {
  const vars     = data.head.vars;
  const bindings = data.results.bindings;
  if (!bindings?.length) { container.textContent = 'No results'; return; }

  const hasNamed = vars.includes('link') && vars.includes('label');
  const linkVar  = hasNamed ? 'link'  : vars[0];
  const labelVar = hasNamed ? 'label' : (vars[1] ?? vars[0]);
  const extraVars = vars.filter(v => v !== linkVar && v !== labelVar);

  await import(siblingUrl('../sol-tabs.js', import.meta.url));

  const tabs = document.createElement('sol-tabs');

  // Forward a data-handler from the host sol-query (if any) to the new tabs.
  const handler = host?.getAttribute?.('data-handler');
  if (handler) tabs.setAttribute('data-handler', handler);

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
    tabs.appendChild(a);
  }

  container.appendChild(tabs);
}
