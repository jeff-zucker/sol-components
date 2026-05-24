/**
 * <sol-search> — multi-engine search form, popup or inline.
 *
 * Two layouts, chosen by the `view` attribute:
 *
 *   view="button"  — (default) an icon trigger that opens a floating
 *                    panel on click; the panel positions itself flush
 *                    against the right edge of the trigger. Best for
 *                    headers / toolbars where space is tight.
 *   view="inline"  — the search field, Go button, and engine radios are
 *                    rendered directly with no toggle. Best when you
 *                    already have a dedicated strip for search.
 *
 * Engine sources, in order of precedence:
 *   `source`   — URL of a Turtle file with a bk:Topic and a set of
 *                ui:Link entries (`bk:recalls` = search-URL prefix,
 *                `ui:label` = display name). Parsed through
 *                feed-fetch.js#parseSourceList — the same bookmark-list
 *                utility sol-feed uses, which shares the single rdflib
 *                instance from core/rdf.js.
 *   `engines`  — JSON array of {id,label,url} on the attribute itself.
 *   built-ins  — a sensible default list (DuckDuckGo / Google /
 *                Wikipedia / prefix.cc / LOV / Etymology / YouTube /
 *                Wayback).
 *
 * Submitting opens the result in a shared "reader" window (the same
 * window object is re-used across submissions so it never spawns a new
 * tab per search).
 *
 * Attributes:
 *   view             "button" | "inline"  (default: button)
 *   source           "file.ttl#TopicName" — RDF engines list
 *   engines          JSON array of {id,label,url}
 *   default-engine   id (or url) of the engine that starts selected
 *   placeholder      input placeholder (default: "Search…")
 *
 * @element sol-search
 *
 * @example
 *   <sol-search></sol-search>
 *   <sol-search view="inline" default-engine="ddg"></sol-search>
 *   <sol-search view="inline" source="data/search-engines.ttl#SearchEngines"></sol-search>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { CSS as SEARCH_CSS, sheet as SEARCH_SHEET } from './styles/sol-search-css.js';
import { parseSourceList } from './utils/feed-fetch.js';
import { attachEditorSelfGear } from '../core/editor-self.js';

/** Sensible defaults; callers can override via `engines` or `source`. */
const DEFAULT_ENGINES = [
  { id: 'ddg',     label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'g',       label: 'Google',     url: 'https://www.google.com/search?q=' },
  { id: 'wp',      label: 'Wikipedia',  url: 'https://en.wikipedia.org/w/index.php?search=' },
  { id: 'prefix',  label: 'prefix.cc',  url: 'https://prefix.cc/' },
  { id: 'lov',     label: 'LOV',        url: 'https://lov.linkeddata.es/dataset/lov/terms?q=' },
  { id: 'ety',     label: 'Etymology',  url: 'https://www.etymonline.com/search?q=' },
  { id: 'yt',      label: 'YouTube',    url: 'https://www.youtube.com/results?search_query=' },
  { id: 'wayback', label: 'Wayback',    url: 'https://web.archive.org/web/*/' },
];

/** Shared "reader" window — kept across submissions so the same off-canvas
 *  window is re-used instead of spawning a fresh tab every time. Browsers
 *  clear a window's name on cross-origin navigation, so we cannot look it
 *  up by name later; we keep the handle that window.open() returns. */
let readerWindow = null;

/** A 1024×640 window flush against the right edge, vertically centred. */
function readerFeatures() {
  const w = 1024, h = 640;
  const left = Math.max(0, window.screen.availWidth  - w);
  const top  = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
  return `width=${w},height=${h},left=${left},top=${top}`;
}

/** Open `url` in the shared reader window; returns true when handled. */
function openInReader(url) {
  if (!url) return false;
  if (readerWindow && !readerWindow.closed) {
    readerWindow.location.href = url;
    readerWindow.focus();
    return true;
  }
  readerWindow = window.open(url, 'sol-search-reader', readerFeatures());
  if (readerWindow) { readerWindow.focus(); return true; }
  return false;
}

/** HTML-escape a value for safe interpolation into innerHTML. */
function esc(s) {
  return String(s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/** Derive a stable engine id from its label (slug-ish, lower-case). */
function slugify(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// RDF parsing is delegated to feed-fetch.js#parseSourceList — the same
// utility sol-feed uses for its bookmark/SKOS source files, which routes
// through core/rdf.js (the single rdflib instance the suite shares).

/**
 * Multi-engine search component.
 *
 * @class SolSearch
 * @extends HTMLElement
 */
class SolSearch extends HTMLElement {
  static get observedAttributes() {
    return ['view', 'source', 'engines', 'default-engine', 'placeholder'];
  }

  // No editor form for v0. sol-search's data model uses an inverse
  // relation (`?link bk:hasTopic <#Topic>`) that doesn't map cleanly
  // to ui:Form's ui:Multiple over a forward property. Returning null
  // makes the discovery walk skip this component and the editor-self
  // gear become a no-op. Revisit when ui:Multiple supports inverse
  // membership or the search engines data is migrated to a forward
  // hasMember relation.
  static get editor() { return null; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open    = false;              // only relevant when view=button
    this._engines = DEFAULT_ENGINES;
    this._view    = 'button';           // resolved in connectedCallback
    this._built   = false;              // true once the shadow tree exists
  }

  async connectedCallback() {
    // Reset for the re-entry case (view change triggers a rebuild).
    this.shadowRoot.adoptedStyleSheets = [];
    this.shadowRoot.innerHTML = '';
    adopt(this.shadowRoot, { sheet: SEARCH_SHEET, css: SEARCH_CSS });

    this._view = (this.getAttribute('view') || 'button').toLowerCase();
    // Surface the view on the host so external rules / parts can select on it.
    this.dataset.view = this._view;

    // The form body is shared between layouts — the only difference is
    // whether it's wrapped in an [open]-toggled panel and preceded by a
    // trigger button. The .engines-line wrapper keeps the engines row
    // as a single flex item below the input + Go row; the engines
    // inside flex-wrap onto a second (or third) row as space allows.
    const formHTML = `
      <form class="form" part="form">
        <div class="row">
          <input class="q" type="search" name="q" autocomplete="off" part="input">
          <button class="go" type="submit" part="submit">Go</button>
        </div>
        <div class="engines-line">
          <div class="engines" aria-label="Search engine"></div>
        </div>
      </form>
    `;

    if (this._view === 'inline') {
      // Render the form directly in the shadow root — no trigger, no
      // floating panel, no document-level listeners. Engines simply
      // wrap onto subsequent rows when the list outgrows the
      // viewport.
      const wrap = document.createElement('div');
      wrap.innerHTML = formHTML;
      while (wrap.firstChild) this.shadowRoot.appendChild(wrap.firstChild);
    } else {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <button class="icon" type="button" part="trigger"
                aria-haspopup="dialog" aria-expanded="false" title="Search">⌕</button>
        <div class="panel" role="dialog" aria-modal="false" part="panel">
          ${formHTML}
          <span class="sr-only">Press Escape to close</span>
        </div>
      `;
      while (wrap.firstChild) this.shadowRoot.appendChild(wrap.firstChild);
      this.$btn   = this.shadowRoot.querySelector('button.icon');
      this.$panel = this.shadowRoot.querySelector('.panel');

      this._onDocPointerDown = (e) => {
        const path = e.composedPath?.() ?? [];
        if (!path.includes(this)) this.close();
      };
      this._onDocKeyDown = (e) => { if (e.key === 'Escape') this.close(); };

      this.$btn.addEventListener('click', () => this.toggle());
    }

    this.$form    = this.shadowRoot.querySelector('form.form');
    this.$q       = this.shadowRoot.querySelector('input.q');
    this.$engines = this.shadowRoot.querySelector('.engines');

    this._loadEngines();
    this._renderEngines();
    this._applyPlaceholder();
    this._built = true;

    this.$form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._doSearch();
    });

    // If a `source` is set, fetch + parse it through the shared
    // bookmark-list utility (same code path as sol-feed). The default /
    // engines-attr list is shown in the meantime so the UI is never
    // blank, and stays put if the source request fails.
    const source = this.getAttribute('source');
    if (source) {
      try {
        const list = await parseSourceList(source);
        if (list && list.length) {
          this._engines = list.map((item, i) => ({
            id:    slugify(item.label) || `e${i}`,
            label: item.label,
            url:   item.url,
          }));
          this._renderEngines();
        }
      } catch (err) {
        // Source failed — leave the default / engines-attr list in
        // place; surface to the console so the page author sees it.
        console.warn(`[sol-search] source ${source}: ${err.message}`);
      }
    }

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  disconnectedCallback() {
    if (this._onDocPointerDown) {
      document.removeEventListener('pointerdown', this._onDocPointerDown, { capture: true });
    }
    if (this._onDocKeyDown) {
      document.removeEventListener('keydown', this._onDocKeyDown);
    }
    this._built = false;
  }

  /**
   * Re-read `source` and rebuild the engines panel. Public hook used by
   * external editors (e.g. dk-settings) after the engines TTL changes.
   * sol-search loads its source inline in connectedCallback, so reload
   * tears down and reconnects to walk the same path.
   */
  async reload() {
    this.disconnectedCallback();
    await this.connectedCallback();
  }

  attributeChangedCallback(name) {
    // Static-attribute changes fire after the element is in the DOM but
    // before our first connectedCallback runs (isConnected is already
    // true). Bailing on `_built` is the correct gate — `connectedCallback`
    // applies the attributes in order anyway, and we re-apply on later
    // changes.
    if (!this._built) return;

    // Switching `view` requires a full rebuild — disconnect listeners,
    // clear the root, and re-run connectedCallback (which resets the
    // shadow root and re-loads the source if one is set).
    if (name === 'view') {
      this.disconnectedCallback();
      this.connectedCallback();
      return;
    }
    this._loadEngines();
    this._renderEngines();
    this._applyPlaceholder();
  }

  _loadEngines() {
    // `engines` attribute beats the built-in defaults; an RDF `source`
    // result (resolved in connectedCallback's tail) beats both.
    const enginesAttr = this.getAttribute('engines');
    if (enginesAttr) {
      try {
        const parsed = JSON.parse(enginesAttr);
        if (Array.isArray(parsed) && parsed.length) this._engines = parsed;
      } catch { /* leave whatever was there on bad JSON */ }
    } else if (!this.getAttribute('source')) {
      this._engines = DEFAULT_ENGINES;
    }
    const def = this.getAttribute('default-engine');
    // Allow matching by id or by URL prefix — convenient when defaults
    // are RDF-sourced and ids are slugified labels.
    this._defaultEngine = def
      || this._engines.find(e => /duckduckgo/i.test(e.label))?.id
      || this._engines[0]?.id
      || 'ddg';
  }

  _applyPlaceholder() {
    if (!this.$q) return;
    this.$q.setAttribute('placeholder', this.getAttribute('placeholder') || 'Search…');
  }

  _renderEngines() {
    if (!this.$engines) return;
    // Unique radio-group name per render so repeated re-renders don't
    // accidentally cross-link with stale inputs in the same shadow root.
    const name = `engine-${Math.random().toString(36).slice(2, 8)}`;
    // Radios go directly in .engines — the container is a flex-wrap
    // row, so a list that's too wide for one line continues on a
    // second (or third) row beneath. No track wrapper, no carousel.
    this.$engines.innerHTML = this._engines.map(eng => `
      <label class="engine">
        <input type="radio" name="${name}" value="${esc(eng.id)}">
        <span>${esc(eng.label ?? eng.id)}</span>
      </label>
    `).join('');

    const radios = [...this.shadowRoot.querySelectorAll(`input[name="${name}"]`)];
    const pick = radios.find(r => r.value === this._defaultEngine) || radios[0];
    if (pick) pick.checked = true;
  }

  /* ── view: button (popup) controls ─────────────────────────────────── */

  toggle() {
    if (this._view !== 'button') return;
    this._open ? this.close() : this.openAtButton();
  }

  openAtButton() {
    if (this._view !== 'button') return;
    this._open = true;
    this.$btn.setAttribute('aria-expanded', 'true');
    this.$panel.setAttribute('open', '');

    // Measure once visible, then position so the panel's right edge lines
    // up with the trigger's right edge (drops down-and-left). Clamps into
    // the viewport with a 10px margin.
    this.$panel.style.left = '0px';
    this.$panel.style.top  = '0px';

    const btn   = this.$btn.getBoundingClientRect();
    const panel = this.$panel.getBoundingClientRect();
    const margin = 10;

    let left = btn.right - panel.width;
    let top  = btn.bottom + 4;
    left = Math.max(margin, Math.min(left, window.innerWidth  - panel.width  - margin));
    top  = Math.max(margin, Math.min(top,  window.innerHeight - panel.height - margin));

    this.$panel.style.left = `${left}px`;
    this.$panel.style.top  = `${top}px`;

    document.addEventListener('pointerdown', this._onDocPointerDown, { capture: true });
    document.addEventListener('keydown',     this._onDocKeyDown);
    queueMicrotask(() => this.$q.focus());
  }

  close() {
    if (this._view !== 'button') return;
    if (!this._open) return;
    this._open = false;
    this.$btn.setAttribute('aria-expanded', 'false');
    this.$panel.removeAttribute('open');
    document.removeEventListener('pointerdown', this._onDocPointerDown, { capture: true });
    document.removeEventListener('keydown',     this._onDocKeyDown);
  }

  /* ── shared submit ────────────────────────────────────────────────── */

  _selectedEngine() {
    const checked = this.shadowRoot.querySelector('input[type="radio"]:checked');
    return this._engines.find(e => e.id === checked?.value) || this._engines[0];
  }

  _doSearch() {
    const q = (this.$q.value || '').trim();
    if (!q) return;
    const eng = this._selectedEngine();
    const url = (eng?.url || 'https://duckduckgo.com/?q=') + encodeURIComponent(q);
    if (!openInReader(url)) {
      // Popup blocked; fall through to a normal new-tab open so the user
      // still gets the search result rather than nothing.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    if (this._view === 'button') this.close();
    // Inline view: leave the input populated so the user can refine and
    // submit again without retyping.
  }
}

define('sol-search', SolSearch);
export { SolSearch };
