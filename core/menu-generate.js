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

// A leading documentary comment (item.comment / rdfs:comment), emitted before the
// element so the prose round-trips with the data.
const emitComment = (c) => (c ? `  <!-- ${String(c)} -->\n` : '');

export function emitTab(item, warn = () => {}) {
  if (item.type !== 'component' || !item.tag) {
    warn(`skipping unassigned tab item "${item.name}" — drop a plugin on it first`);
    return '';
  }
  const attrs = attrPairs(item);
  const href = attrs.get('source') ?? '#';
  const id = attrs.get('id') ?? '';
  let out = emitComment(item.comment);
  out += `  <a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ''}\n`;
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
  let out = emitComment(item.comment);
  out += `  <${item.tag}`;
  if (item.region) out += `\n     region="${esc(item.region)}"`;
  for (const [k, v] of attrs) out += v === '' ? `\n     ${k}` : `\n     ${k}="${esc(v)}"`;
  const text = item.tag === 'sol-button' ? item.name : '';
  out += `\n  >${text}</${item.tag}>\n`;
  return out;
}

/**
 * Assemble the full `<sol-tabs>…</sol-tabs>` shell. `currentHtml` supplies the
 * opening tag (preserved verbatim). Tabs and bar items are emitted with their
 * leading comments (rdfs:comment). The chrome block is emitted from `chrome`
 * (parsed #Chrome) when given, else preserved verbatim from `currentHtml`.
 * Returns `{ html, chrome }`; `chrome` is null and `html` '' when the opening tag
 * or the marker block is missing, so callers can refuse to clobber a shell.
 *
 * @param {object} o
 * @param {Array}  o.tabs        parsed #Tabs items (from parseMenuItems)
 * @param {Array}  o.bar         parsed #Bar items
 * @param {Array}  [o.chrome]    parsed #Chrome items; omit to keep the block verbatim
 * @param {string} o.currentHtml the existing html-first.html text
 * @param {(msg:string)=>void} [o.warn]
 */
export function generateShell({ tabs, bar, chrome, currentHtml, warn = () => {} }) {
  const openMatch = currentHtml.match(/<sol-tabs\b[^>]*>/);
  const chromeMatch = currentHtml.match(/([ \t]*<!-- chrome:begin[\s\S]*?<!-- chrome:end -->\n)/);
  if (!openMatch || !chromeMatch) return { html: '', chrome: null };

  // Chrome: emit from #Chrome RDF when modeled (config-editable; comments via
  // rdfs:comment), else preserve the current block verbatim — a safe fallback so
  // the shell never loses its furniture if #Chrome isn't present.
  let chromeBlock;
  if (chrome && chrome.length) {
    const items = chrome.map((c) => emitBarItem(c, warn)).filter(Boolean).join('\n');
    chromeBlock = `  <!-- chrome:begin -->\n${items}\n  <!-- chrome:end -->\n`;
  } else {
    chromeBlock = chromeMatch[1];
  }

  const blocks = [
    ...(tabs || []).map((t) => emitTab(t, warn)),
    ...(bar || []).map((b) => emitBarItem(b, warn)),
  ].filter(Boolean);

  let html = `${openMatch[0]}\n\n`;
  html += blocks.join('\n');
  html += '\n' + chromeBlock;
  html += `\n</sol-tabs>\n`;
  return { html, chrome: chromeBlock };
}
