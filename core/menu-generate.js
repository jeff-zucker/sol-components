// menu-generate — render the declarative <sol-tabs> shell HTML from parsed menu
// models (the inverse of core/menu-html.js). Shared by the node tool
// (data-kitchen tools/conversion/generate-html-first.mjs) and the in-app tabs
// sync, so what regenerates is exactly what the parser/harvester round-trips.
//
//   #Tabs → <a> anchors: href=source, id=id, data-handler=ui:name (tag),
//           region=ui:region, other params data-prefixed (standard <a> attrs
//           in ANCHOR_ATTRS emitted plain so the anchor stays HTML-valid).
//   #Bar  → the element named by ui:name with its params verbatim; a sol-button
//           shows its ui:label as text.
//
// The opening `<sol-tabs …>` tag and the chrome block (between
// `<!-- chrome:begin -->` and `<!-- chrome:end -->`) are preserved VERBATIM from
// the current HTML: they are hand-editable shell, not modeled in RDF.

// Standard <a> attributes emitted as-is (NOT data-prefixed), so a hand-authored
// anchor stays HTML-valid and the value harvests straight back. menu-html.js
// imports this same set to invert the mapping. `target` is handled separately
// (it normalizes to ui:region), so it is intentionally NOT listed here.
export const ANCHOR_ATTRS = new Set([
  'rel', 'download', 'hreflang', 'type', 'referrerpolicy', 'ping',
]);

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const attrPairs = (item) => new Map((item.params || []).map(([k, v]) => [k, v]));

export function emitTab(item, warn = () => {}) {
  if (item.type !== 'component' || !item.tag) {
    warn(`skipping unassigned tab item "${item.name}" — drop a plugin on it first`);
    return '';
  }
  const attrs = attrPairs(item);
  const href = attrs.get('source') ?? '#';
  const id = attrs.get('id') ?? '';
  let out = `  <a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ''}\n`;
  out += `     data-handler="${esc(item.tag)}"\n`;
  if (item.region) out += `     region="${esc(item.region)}"\n`;
  for (const [k, v] of attrs) {
    if (k === 'source' || k === 'id') continue;
    const name = ANCHOR_ATTRS.has(k) ? k : `data-${k}`;
    out += v === '' ? `     ${name}\n` : `     ${name}="${esc(v)}"\n`;
  }
  out += `  >${item.name}</a>\n`;
  return out;
}

export function emitBarItem(item, warn = () => {}) {
  if (item.type !== 'component' || !item.tag) {
    warn(`skipping unassigned bar item "${item.name}" — drop a plugin on it first`);
    return '';
  }
  const attrs = attrPairs(item);
  let out = `  <${item.tag}`;
  if (item.region) out += `\n     region="${esc(item.region)}"`;
  for (const [k, v] of attrs) out += v === '' ? `\n     ${k}` : `\n     ${k}="${esc(v)}"`;
  const text = item.tag === 'sol-button' ? item.name : '';
  out += `\n  >${text}</${item.tag}>\n`;
  return out;
}

// Fixed furniture between the tab anchors and the bar elements.
const BAR_COMMENT = `\n  <!-- Actions row. The bar-managed plugins below come from
       data/tabs.ttl#Bar (edited with the bar builder); the chrome block
       (help, ⋮ menu) is fixed shell furniture preserved by the generator. -->\n\n`;

/**
 * Assemble the full `<sol-tabs>…</sol-tabs>` shell. `currentHtml` supplies the
 * opening tag and the chrome block, both preserved verbatim. Returns
 * `{ html, chrome }`; `chrome` is null and `html` '' when the opening tag or the
 * marker block is missing, so callers can refuse to clobber a hand-authored shell.
 *
 * @param {object} o
 * @param {Array}  o.tabs        parsed #Tabs items (from parseMenuItems)
 * @param {Array}  o.bar         parsed #Bar items
 * @param {string} o.currentHtml the existing html-first.html text
 * @param {(msg:string)=>void} [o.warn]
 */
export function generateShell({ tabs, bar, currentHtml, warn = () => {} }) {
  const openMatch = currentHtml.match(/<sol-tabs\b[^>]*>/);
  const chromeMatch = currentHtml.match(/([ \t]*<!-- chrome:begin[\s\S]*?<!-- chrome:end -->\n)/);
  if (!openMatch || !chromeMatch) return { html: '', chrome: null };

  let html = `${openMatch[0]}\n\n`;
  html += (tabs || []).map((t) => emitTab(t, warn)).filter(Boolean).join('\n');
  html += BAR_COMMENT;
  html += (bar || []).map((b) => emitBarItem(b, warn)).filter(Boolean).join('\n');
  html += '\n' + chromeMatch[1];
  html += `\n</sol-tabs>\n`;
  return { html, chrome: chromeMatch[1] };
}
