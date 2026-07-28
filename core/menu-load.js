// menu-load — the from-rdf loading contract shared by every menu-consuming
// component (sol-menu, sol-tabs, and sol-menu's subclasses): gate on the
// component class's `fromRdfLoader` (installed by web/menu-from-rdf.js),
// defer until it arrives, hand the loaded result to the component's own
// `apply`, and surface failures as a sol-error event. The orientation
// cascade lives here: the RDF's ui:orientation fills the attribute only
// when the mount didn't set one (an explicit attribute always wins).

import { deferUntilLoader } from './menu-consumer.js';

export async function loadMenuInto(host, uri, { sourceName, apply }) {
  const load = host.constructor.fromRdfLoader;
  if (!load) { deferUntilLoader(host); return; }   // wait for the menu-from-rdf add-on
  try {
    const result = await load(uri, document.baseURI);
    if (!result) return;
    if (result.orientation && !host.hasAttribute('orientation')) {
      host.setAttribute('orientation', result.orientation);
    }
    apply(result);
  } catch (err) {
    console.error(`<${sourceName}> from-rdf load failed:`, err);
    host.dispatchEvent(new CustomEvent('sol-error', {
      bubbles: true, composed: true,
      detail: { source: sourceName, kind: 'rdf-load', uri, message: err.message },
    }));
  }
}
