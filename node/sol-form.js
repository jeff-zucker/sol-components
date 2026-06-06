// Node.js programmatic API for sol-form — loads a ui:Form definition,
// populates an rdflib store from a plain JS data object, and serializes
// the result as Turtle.
//
// Usage:
//   import { solForm } from 'sol-components/form';
//   const { turtle } = await solForm({
//     source: 'data/menu-form.ttl',
//     data:   { label: 'My Menu', orientation: 'horizontal', parts: [...] },
//   });

import * as $rdf from 'rdflib';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  UI, RDF, findForm, populateStore, setDefaults, readFormParts,
} from '../core/form-utils.js';

// ─── store loading ──────────────────────────────────────────────────

function loadLocal(filePath) {
  const abs = resolvePath(filePath);
  const text = readFileSync(abs, 'utf-8');
  const store = $rdf.graph();
  const base = pathToFileURL(abs).href;
  $rdf.parse(text, store, base, 'text/turtle');
  return { store, base };
}

async function loadRemote(url) {
  const resp = await fetch(url, {
    headers: { Accept: 'text/turtle, application/rdf+xml;q=0.9, */*;q=0.1' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const text = await resp.text();
  const store = $rdf.graph();
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
  const mime = ct === 'application/rdf+xml' ? 'application/rdf+xml' : 'text/turtle';
  $rdf.parse(text, store, url, mime);
  return { store, base: url };
}

function loadStore(source) {
  if (/^https?:\/\//i.test(source)) return loadRemote(source);
  return loadLocal(source);
}

// ─── public API ─────────────────────────────────────────────────────

/**
 * Load a ui:Form definition and populate it with data.
 *
 * @param {object}  opts
 * @param {string}  opts.source  — path or URL to a Turtle file with a ui:Form
 * @param {object}  [opts.data]  — values keyed by property local name
 * @param {string}  [opts.subject] — URI for the root subject (blank node if omitted)
 * @param {string}  [opts.shape]   — path or URL to a SHACL shapes file (optional)
 * @returns {Promise<{ turtle: string, store: object, subject: object }>}
 */
export async function solForm({ source, data, subject: subjectUri, shape } = {}) {
  if (!source) throw new Error('source is required');

  const { store: formStore, base: formBase } = await loadStore(source);
  const formRoot = findForm(formStore, formBase);
  if (!formRoot) throw new Error('No ui:Form found in ' + source);

  const dataStore = $rdf.graph();
  const docBase = subjectUri ? subjectUri.split('#')[0] : formBase.replace(/[^/]*$/, '_output.ttl');
  const doc = $rdf.sym(docBase);
  const subjectNode = subjectUri ? $rdf.sym(subjectUri) : $rdf.blankNode();

  // Merge form definitions into the data store so populateStore can
  // read field metadata (ui:parts, ui:property, ui:default, etc.)
  for (const st of formStore.statements || formStore.match(null, null, null) || []) {
    if (!dataStore.holds(st.subject, st.predicate, st.object, st.why)) {
      dataStore.add(st.subject, st.predicate, st.object, st.why);
    }
  }

  // Set top-level defaults, then overlay caller-supplied data
  setDefaults(dataStore, formRoot, subjectNode, doc);
  if (data) {
    populateStore(dataStore, formRoot, subjectNode, doc, data, 0);
  }

  // Validate if a SHACL shape was provided
  let validation = null;
  if (shape) {
    validation = await validateShape(dataStore, doc, shape);
  }

  const turtle = $rdf.serialize(doc, dataStore, docBase, 'text/turtle') || '';

  return { turtle, store: dataStore, subject: subjectNode, validation };
}

// ─── SHACL validation (lazy-loaded) ─────────────────────────────────

async function validateShape(dataStore, doc, shapePath) {
  try {
    const { Parser, Store } = await import('n3');
    const SHACLValidator = (await import('rdf-validate-shacl')).default;

    const parseToN3 = (text, baseIRI) => {
      const parser = new Parser({ baseIRI });
      const store = new Store();
      store.addQuads(parser.parse(text));
      return store;
    };

    const dataTurtle = $rdf.serialize(doc, dataStore, doc.value, 'text/turtle') || '';
    if (!dataTurtle) return { conforms: false, results: [{ message: 'No data to validate' }] };

    let shapeText;
    if (/^https?:\/\//i.test(shapePath)) {
      const resp = await fetch(shapePath);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      shapeText = await resp.text();
    } else {
      shapeText = readFileSync(resolvePath(shapePath), 'utf-8');
    }

    const shapesStore = parseToN3(shapeText, shapePath);
    const dataN3 = parseToN3(dataTurtle, doc.value);
    const validator = new SHACLValidator(shapesStore);
    return validator.validate(dataN3);
  } catch (err) {
    return { conforms: true, results: [], error: err.message };
  }
}

export default solForm;
