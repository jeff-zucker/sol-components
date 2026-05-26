/**
 * Minimal CodeMirror 6 editor builder.
 * Used by sol-live-edit when running standalone (not inside the podz bundle).
 * podz itself uses podz-editor.js which has keybinding options and language support.
 */

const ESM = 'https://esm.sh';

const LANG_MAP = {
  ttl:    [`${ESM}/codemirror-lang-turtle`,        m => m.turtle],
  n3:     [`${ESM}/codemirror-lang-turtle`,        m => m.turtle],
  jsonld: [`${ESM}/@codemirror/lang-json@6`,       m => m.json],
  json:   [`${ESM}/@codemirror/lang-json@6`,       m => m.json],
  md:     [`${ESM}/@codemirror/lang-markdown@6`,   m => m.markdown],
  html:   [`${ESM}/@codemirror/lang-html@6`,       m => m.html],
  htm:    [`${ESM}/@codemirror/lang-html@6`,       m => m.html],
  js:     [`${ESM}/@codemirror/lang-javascript@6`, m => m.javascript],
  mjs:    [`${ESM}/@codemirror/lang-javascript@6`, m => m.javascript],
  css:    [`${ESM}/@codemirror/lang-css@6`,        m => m.css],
  xml:    [`${ESM}/@codemirror/lang-xml@6`,        m => m.xml],
  svg:    [`${ESM}/@codemirror/lang-xml@6`,        m => m.xml],
};

/**
 * Create a minimal CodeMirror 6 EditorView in `parent`.
 * @param {Element} parent   — container DOM element
 * @param {string}  ext      — file extension key (e.g. 'ttl', 'md', 'html')
 * @param {ShadowRoot|null} root — shadow root for CSS injection (or null for light DOM)
 * @param {Function} onChange — called when content changes
 * @returns {Promise<EditorView>}
 */
export async function buildEditor(parent, ext, root, onChange) {
  const { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection }
    = await import(`${ESM}/@codemirror/view@6`);
  const { EditorState }
    = await import(`${ESM}/@codemirror/state@6`);
  const { defaultKeymap, history, historyKeymap, indentWithTab }
    = await import(`${ESM}/@codemirror/commands@6`);
  const { syntaxHighlighting, defaultHighlightStyle }
    = await import(`${ESM}/@codemirror/language@6`);

  let langExt = [];
  const langEntry = ext && LANG_MAP[ext];
  if (langEntry) {
    try {
      const [url, pick] = langEntry;
      const m = await import(url);
      const fn = pick(m);
      if (fn) langExt = [fn()];
    } catch (_) { /* CDN miss — degrade silently */ }
  }

  const updateListener = EditorView.updateListener.of(u => {
    if (u.docChanged && onChange) onChange();
  });

  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        history(),
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        ...langExt,
        ...(ext === 'md' ? [EditorView.lineWrapping] : []),
        updateListener,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-editor': { height: '100%' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
        }),
      ],
    }),
    parent,
    root: root || undefined,
  });

  return view;
}
