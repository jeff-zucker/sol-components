let mermaidReady = false;
let _mermaid = null;
let _mmdSeq = 0;

async function ensureMermaid() {
  if (mermaidReady) return _mermaid;
  const m = await import('https://esm.sh/mermaid@10');
  const mermaid = m.default || m.mermaid || m;
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
  _mermaid = mermaid;
  mermaidReady = true;
  return mermaid;
}

export async function renderMermaid(content, outputEl) {
  // Strip %% comment lines ourselves before handing the source to
  // Mermaid — its built-in comment handling is unreliable when a
  // diagram opens with a comment block. %%{…}%% init directives are
  // NOT comments and are kept.
  const trimmed = content
    .split(/\r?\n/)
    .filter(line => !/^\s*%%(?!\{)/.test(line))
    .join('\n')
    .trim();
  if (!trimmed) {
    outputEl.innerHTML = '<p style="padding:1rem;color:#888">Enter a Mermaid diagram above.</p>';
    return;
  }

  let mermaid;
  try {
    mermaid = await ensureMermaid();
  } catch (e) {
    outputEl.innerHTML = '<p style="padding:1rem;color:#c0392b">Failed to load Mermaid library.</p>';
    return;
  }

  const id = 'mmd-' + (++_mmdSeq);
  try {
    const { svg } = await mermaid.render(id, trimmed);
    outputEl.innerHTML = svg;
    // Make the diagram responsive — fit the preview pane as it is
    // resized / zoomed, instead of Mermaid's fixed pixel max-width.
    const svgEl = outputEl.querySelector('svg');
    if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto'; }
  } catch (e) {
    // Mermaid leaves orphan elements on parse errors — clean up
    const orphan = document.getElementById('d' + id);
    if (orphan) orphan.remove();
    outputEl.innerHTML = `<pre style="padding:1rem;color:#c0392b;white-space:pre-wrap;font-size:.85em">Diagram error: ${
      (e.message || String(e)).replace(/<[^>]*>/g, '')
    }</pre>`;
  }
}
