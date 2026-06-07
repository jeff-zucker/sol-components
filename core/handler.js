// handler.js — the `handler` capability (a sol-components capability, loaded on
// demand via the manifest's `data-handler` attribute).
//
// Lets ANY element (a library's own button/menu, a plain link) activate a
// component or a script, with NO display logic here: it catches the activation,
// optionally instantiates a named component, forwards the element's data, and
// fires ONE event — the consuming app decides what happens and where any result
// goes.
//
//   <a data-handler="my-viewer" href="report.ttl" data-mode="compact">Open</a>   <!-- component -->
//   <button data-handler="exportCsv" data-format="utf8">Export</button>          <!-- script -->
//
//   document.addEventListener('interop:activate', (e) => {
//     const { handler, element, data, source } = e.detail;
//     if (element) source.closest('.pane').querySelector('.output').replaceChildren(element);
//     else if (handler === 'exportCsv') exportTheTable(data);
//   });
//
// Zero imports. Activation is delegated at the document level, so dynamically
// added elements and shadow-DOM buttons (composed events) work with no setup.

// A custom-element tag (must contain a hyphen) or an already-registered element
// → instantiate a component; otherwise it's a bare-name action (script).
function isComponentTag(name) {
  return !!name && (name.indexOf('-') !== -1 || !!customElements.get(name));
}

// Collect the element's payload: href (if any) + data-* attributes with the
// `data-` prefix stripped, excluding `data-handler` itself.
function collectData(el) {
  const data = {};
  const href = el.getAttribute && el.getAttribute('href');
  if (href != null) data.href = href;
  const attrs = el.attributes || [];
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.name === 'data-handler') continue;
    if (a.name.indexOf('data-') === 0) data[a.name.slice(5)] = a.value;
  }
  return data;
}

// Forward the payload onto the instantiated component as attributes
// (href → href, data-mode → mode, …). The component reads its own attributes.
function forwardAttrs(target, data) {
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) target.setAttribute(key, data[key]);
  }
}

function activate(el) {
  const name = el.getAttribute('data-handler');
  if (!name) return;
  const data = collectData(el);

  let element = null;
  if (isComponentTag(name)) {
    element = document.createElement(name);
    forwardAttrs(element, data);
  }

  el.dispatchEvent(new CustomEvent('interop:activate', {
    bubbles: true, composed: true,
    detail: { handler: name, element: element, data: data, source: el },
  }));
}

function onClick(e) {
  const el = e.target && e.target.closest && e.target.closest('[data-handler]');
  if (!el) return;
  e.preventDefault();          // don't navigate / submit — the app routes it
  activate(el);
}

function onKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const el = e.target && e.target.closest && e.target.closest('[data-handler]');
  if (!el) return;
  e.preventDefault();
  activate(el);
}

if (typeof document !== 'undefined' && !document.__ciHandlerWired) {
  document.__ciHandlerWired = true;
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
}

export { activate, isComponentTag, collectData };
