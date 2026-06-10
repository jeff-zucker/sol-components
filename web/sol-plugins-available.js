/**
 * <sol-plugins-available> — the palette of available plugins: draggable cards
 * the user drops onto a <sol-menu-builder> / <sol-bar-builder> item to say
 * what that item mounts.
 *
 *   <sol-plugins-available source="./data/palette.ttl#Palette"
 *                          for="sol-menu-builder, sol-bar-builder">
 *   </sol-plugins-available>
 *
 * Attributes:
 *   source — a curated ui:Menu document whose ui:Component parts ARE the
 *            catalog: each part's ui:label is the card name, ui:name the
 *            element tag, and its ui:attribute set the default attributes.
 *            (Same shape, same parser as every other menu — the palette is
 *            itself editable with the menu builder.)
 *   for    — selector naming the builder(s) this palette feeds. Drag data
 *            is set globally (any builder accepts it); `for` exists so pages
 *            can declare the pairing and styling/tooling can use it.
 *
 * Drag payload: `application/x-sol-plugin` JSON {label, tag, params}.
 */

import { define } from '../core/define.js';
import { adopt, sheetFrom } from '../core/adopt.js';
import { CSS } from './styles/sol-builders-css.js';
import { rdf } from '../core/rdf.js';
import { loadRdfStore } from '../core/rdf-utils.js';
import { parseMenuItems } from '../core/menu-rdf.js';
import { solFetch } from '../core/auth-fetch.js';
import { PLUGIN_MIME } from './sol-menu-builder.js';

const SHEET = sheetFrom(CSS);

class SolPluginsAvailable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    adopt(this.shadowRoot, { sheet: SHEET, css: CSS });
  }

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._root = document.createElement('div');
    this._root.className = 'builder';
    this.shadowRoot.appendChild(this._root);
    this._load();
  }

  get source() { return this.getAttribute('source') || ''; }

  async _load() {
    if (!this.source) {
      this._root.innerHTML = '<div class="hint">Set source="palette.ttl#Palette" to list available plugins.</div>';
      return;
    }
    try {
      const docUrl = new URL(this.source.split('#')[0], document.baseURI).href;
      const frag = this.source.split('#')[1] || 'Palette';
      const store = await loadRdfStore(docUrl, solFetch);
      const items = parseMenuItems(store, rdf.sym(`${docUrl}#${frag}`));
      this._render(items.filter((i) => i.type === 'component' && i.tag));
    } catch (e) {
      this._root.innerHTML = `<div class="hint">Could not load palette: ${e.message}</div>`;
    }
  }

  _render(plugins) {
    const head = document.createElement('div');
    head.className = 'builder-head';
    const title = document.createElement('span');
    title.className = 'builder-title';
    title.textContent = 'Available plugins';
    const hint = document.createElement('span');
    hint.className = 'builder-status';
    hint.textContent = 'drag onto a menu or bar item';
    head.append(title, hint);

    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const p of plugins) {
      const card = document.createElement('div');
      card.className = 'card';
      card.draggable = true;
      card.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.className = 'card-label';
      label.textContent = p.name || p.tag;
      const tag = document.createElement('span');
      tag.className = 'card-tag';
      tag.textContent = `<${p.tag}>`;
      card.title = (p.params || []).map(([k, v]) => `${k}="${v}"`).join('\n') || 'no default attributes';
      card.append(label, tag);
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(PLUGIN_MIME, JSON.stringify({
          label: p.name || p.tag, tag: p.tag, params: p.params || [],
        }));
        e.dataTransfer.setData('text/plain', p.tag);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      cards.appendChild(card);
    }
    this._root.replaceChildren(head, cards);
  }
}

define('sol-plugins-available', SolPluginsAvailable);
export { SolPluginsAvailable };
export default SolPluginsAvailable;
