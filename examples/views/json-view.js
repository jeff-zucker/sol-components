// A custom view module: receives W3C SPARQL Results JSON and does something with
// it. The data-from-query and data-from-rdf capabilities both call
// render(container, data, el) with the same W3C shape.
export function render(container, data, el) {
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;white-space:pre-wrap;font-size:.8rem;max-height:14rem;overflow:auto';
  pre.textContent = JSON.stringify(data, null, 2);
  container.replaceChildren(pre);
}
