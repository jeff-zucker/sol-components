import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';

function getMashlib() {
  const w = typeof window !== 'undefined' ? window : {};
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : w);
  const Mashlib = w.Mashlib || g.Mashlib;
  const SolidLogic = w.SolidLogic || g.SolidLogic;
  const $rdf = w.$rdf || g.$rdf;
  const panes = w.panes || g.panes;
  if (!Mashlib || !panes) return null;
  const initMainPage = Mashlib.initMainPage || Mashlib.default?.initMainPage || Mashlib.default;
  if (!initMainPage) return null;
  return { Mashlib, initMainPage, SolidLogic, $rdf, panes };
}

// Hide mashlib's own header/footer chrome — when sol-solidos is mounted
// inside a host shell (dk), the host already owns login + help/prefs
// affordances, so a duplicate login button in mashlib's header is both
// confusing and broken (popup-mode pod sessions don't reach mashlib's
// default Inrupt session, so its login button stalls). Mashlib's reads
// go through rdflib's patched Fetcher → solFetch → sol-auth-needed →
// the host's <sol-login> chip handles the prompt and retries.
const HOST_CSS = `
  sol-solidos { display: block; width: 100%; height: 100%; }
  sol-solidos > #PageHeader,
  sol-solidos > #PageFooter { display: none; }
`;

class SolSolidos extends HTMLElement {
  static get observedAttributes() { return ['source']; }

  constructor() {
    super();
    this._ready = false;
    this._m = null;
    this._outliner = null;
  }

  connectedCallback() {
    if (this.isConnected && !this._ready) this._init();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'source' && oldV !== newV && this._ready) {
      this._goTo(newV);
    }
  }

  _goTo(uri) {
    if (!uri || !this._outliner) return;
    const subject = this._m.$rdf.sym(uri);
    this._outliner.GotoSubject(subject, true, undefined, true, undefined);
  }

  _init() {
    const m = getMashlib();
    if (!m) {
      const w = typeof window !== 'undefined' ? window : {};
      const g = typeof globalThis !== 'undefined' ? globalThis : {};
      console.error('[sol-solidos] getMashlib() returned null. window.Mashlib:', w.Mashlib,
        'globalThis.Mashlib:', g.Mashlib, 'window.panes:', w.panes, 'globalThis.panes:', g.panes);
      this.textContent = 'mashlib not loaded \u2014 add <script src="mashlib.js"> to the page';
      return;
    }
    this._m = m;
    ensureDocStyle(document, 'sol-solidos-style', HOST_CSS);

    // Build the DOM structure mashlib expects
    this.innerHTML = `
      <header id="PageHeader" role="banner"></header>
      <main id="mainContent" tabindex="-1">
        <div class="TabulatorOutline" id="DummyUUID">
          <table id="outline"></table>
          <div id="GlobalDashboard"></div>
        </div>
      </main>
      <footer id="PageFooter" role="contentinfo"></footer>
    `;

    const SL = m.SolidLogic?.solidLogicSingleton || m.SolidLogic?.default?.solidLogicSingleton;
    const store = SL?.store;
    const uri = this.getAttribute('source') || window.location.href;

    this._outliner = m.panes.getOutliner(document);
    m.initMainPage(store, uri);

    this._ready = true;
  }
}

define('sol-solidos', SolSolidos);
export default SolSolidos;
