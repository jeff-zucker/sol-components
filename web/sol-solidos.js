import { define } from '../core/define.js';
import { ensureDocStyle } from '../core/adopt.js';
import { getAuthFetch } from '../core/auth-fetch.js';

function getMashlib() {
  const w = typeof window !== 'undefined' ? window : {};
  const g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : w);
  const Mashlib = w.Mashlib || g.Mashlib;
  const SolidLogic = w.SolidLogic || g.SolidLogic;
  const $rdf = w.$rdf || g.$rdf;
  const panes = w.panes || g.panes;
  if (!Mashlib || !panes) return null;
  // mashlib 2.x exposes initMainPage/getOutliner on `panes`, not on the Mashlib
  // global (which is only { versionInfo }). Fall back to panes.* for compat.
  const initMainPage = Mashlib.initMainPage || Mashlib.default?.initMainPage
    || Mashlib.default || panes.initMainPage;
  if (!initMainPage) return null;
  return { Mashlib, initMainPage, SolidLogic, $rdf, panes };
}

// Show mashlib's full SolidOS banner (header) so the embedded data browser looks
// and behaves like SolidOS; only the page footer is suppressed. Mashlib's reads/
// writes go through the page's authenticated fetch (shared in via component-interop;
// see _init), so the banner's own actions inherit the session.
const HOST_CSS = `
  /* min-height (not height) so the element's box grows with the data browser's
     content. The location bar is position:sticky and only stays pinned while its
     containing block (this element's box) is in view — a fixed 100% box is just
     one viewport tall, so a deep getEyeFocus scroll would carry the bar off. */
  sol-solidos { display: block; width: 100%; min-height: 100%; }
  sol-solidos > #PageFooter { display: none; }
  /* mash.css ships a blanket "article, aside, section { display: block }",
     an author rule that defeats the UA's [hidden] { display: none } — the
     empty #NavMenu scaffold then paints as a fixed rail covering the whole
     app on narrow screens (mashlib 3 never fills or toggles it). Inside the
     embed, hidden means hidden. */
  sol-solidos [hidden] { display: none !important; }
  /* Opt-in location bar (has-location-bar) — repoint the browser to any URL.
     Sticky so the data browser's own scroll-to-focus (solid-ui getEyeFocus calls
     window.scrollBy on every GotoSubject, scrolling the page down to the selected
     row) can't carry the bar off the top of the frame. */
  .sol-location-bar {
    position: sticky; top: 0; z-index: 120;   /* above mashlib's fixed banner (z 110) */
    display: flex; gap: 0.4rem; align-items: center;
    padding: 0.35rem 0.5rem; border-bottom: 1px solid #d0d7de;
    background: #f6f8fa; font-family: system-ui, -apple-system, sans-serif;
  }
  .sol-location-bar button {
    border: 1px solid #d0d7de; background: #fff; border-radius: 4px;
    padding: 0.15rem 0.55rem; cursor: pointer; line-height: 1.4; font: inherit;
  }
  .sol-location-bar button:disabled { opacity: 0.45; cursor: default; }
  .sol-location-bar input {
    flex: 1; min-width: 4rem; padding: 0.25rem 0.5rem;
    border: 1px solid #d0d7de; border-radius: 4px; font: inherit;
  }
  .sol-location-bar select {
    border: 1px solid #d0d7de; background: #fff; border-radius: 4px;
    padding: 0.2rem 0.4rem; font: inherit; cursor: pointer;
    min-width: 16rem; max-width: 24rem;
  }
  /* Phone (coarse pointer): the single-row bar overflows a 360px frame
     (Go lands fully off-screen, the URL box gets ~80px). Wrap to two
     rows — Home / Back / Locations on top, full-width URL + Go below —
     and meet the 44px tap minimum. Desktop keeps the one-row bar. */
  @media (hover: none) and (pointer: coarse) {
    .sol-location-bar { flex-wrap: wrap; }
    .sol-location-bar button { min-width: 44px; min-height: 44px; }
    .sol-location-bar select {
      flex: 1 1 auto; min-width: 0; max-width: none; min-height: 44px;
    }
    .sol-location-bar input {
      /* Basis short of the full row: forces the wrap onto a second row
         while leaving Go-button room (44px min-width + padding + gap)
         beside it. */
      order: 9; flex: 1 1 calc(100% - 5rem); min-width: 0;
      min-height: 44px; font-size: 16px;
    }
    .sol-location-bar button[data-act="go"] { flex: 0 0 auto; }
    .sol-location-bar button[data-act="go"] { order: 10; }
  }
`;

class SolSolidos extends HTMLElement {
  static get observedAttributes() { return ['source', 'has-location-bar']; }

  constructor() {
    super();
    this._ready = false;
    this._m = null;
    this._outliner = null;
    this._home = null;     // location-bar "home" target (the initial subject)
    this._hist = [];       // back stack of visited URIs
    this._current = null;  // currently-shown URI (kept in sync via GotoSubject)
    this._locations = [];  // known pod locations (quick-picks) for the location bar
  }

  // Known pod-location quick-picks for the location bar's dropdown. The host (dk)
  // feeds the pods sol-pod has discovered; picking one navigates the browser there.
  // Off (dropdown hidden) until a non-empty list is set.
  set locations(list) {
    this._locations = Array.isArray(list) ? list.filter(Boolean) : [];
    this._renderLocations();
  }
  get locations() { return this._locations.slice(); }

  _renderLocations() {
    // The bar may have been re-seated at body level by _keepBarAlive (solid-ui's
    // mobile layout discards this element) — prefer the kept handle.
    const sel = this._barEl?.querySelector('[data-locations]')
      || this.querySelector('.sol-location-bar [data-locations]');
    if (!sel) return;                          // no bar / not rendered yet
    sel.hidden = this._locations.length === 0;
    sel.textContent = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Locations ▾';
    sel.appendChild(ph);
    for (const raw of this._locations) {
      const url = /\/$/.test(raw) ? raw : `${raw}/`;
      let host = url; try { host = new URL(url).host; } catch (_) { /* keep raw */ }
      const opt = document.createElement('option');
      opt.value = url; opt.textContent = host;
      sel.appendChild(opt);
    }
  }

  connectedCallback() {
    if (this.isConnected && !this._ready) this._init();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === 'source' && oldV !== newV && this._ready) {
      this._goTo(newV);
    }
  }

  // Whether to render the opt-in location bar. Off by default; only consumers
  // that explicitly want it (the main SolidOS browser) set has-location-bar —
  // AddressBook / dokieli / other embeds stay bare.
  _hasBar() {
    return this.hasAttribute('has-location-bar')
      && this.getAttribute('has-location-bar') !== 'false';
  }

  // The SolidOS banner's brand/home link is a real anchor (brand-link="/").
  // In an embedded frame a full navigation to "/" (or the app shell) leaves
  // SolidOS entirely — and on a host that serves "/" as its own app (dk), it's
  // a "wormhole" that blanks the frame. Intercept clicks on root/home links and
  // navigate in-app via GotoSubject (which the host can divert) instead.
  _guardBrandLink() {
    const header = this.querySelector('#mainSolidUiHeader');
    if (!header) return;
    header.addEventListener('click', (e) => {
      const a = (e.composedPath() || []).find((n) => n && n.tagName === 'A' && n.getAttribute && n.getAttribute('href'));
      if (!a) return;
      let url;
      try { url = new URL(a.getAttribute('href'), location.href).href; } catch (_) { return; }
      if (url === location.origin || url === location.origin + '/' || url === location.origin + '/index.html') {
        e.preventDefault();
        e.stopPropagation();
        this._goTo(this._home);
      }
    }, true);
  }

  _goTo(uri, { push = true } = {}) {
    if (!uri || !this._outliner) return;
    const subject = this._m.$rdf.sym(uri);
    // GotoSubject is wrapped (below) to keep the bar in sync; pushing onto the
    // back stack happens there so internal link-clicks are tracked too.
    this._pushNext = push;
    this._outliner.GotoSubject(subject, true, undefined, true, undefined);
  }

  // Resolve user input into a URI: absolute as-is; "/path" → origin-rooted;
  // a bare "host.tld[/...]" → https://; anything else relative to the current page.
  _normalize(v) {
    v = (v || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith('/')) return location.origin + v;
    if (/^[^\s/]+\.[^\s/]+/.test(v)) return 'https://' + v;
    try { return new URL(v, this._current || location.href).href; } catch { return v; }
  }

  _barMarkup() {
    return `
      <div class="sol-location-bar" role="toolbar" aria-label="Location">
        <button type="button" data-act="home" title="Home">🏠</button>
        <button type="button" data-act="back" title="Back" disabled>◀</button>
        <input type="text" data-loc spellcheck="false"
               placeholder="https://your-pod.example/ — type a URL, press Enter"
               aria-label="Location">
        <select data-locations title="Go to a known pod location" aria-label="Go to a known pod location" hidden>
          <option value="">Locations ▾</option>
        </select>
        <button type="button" data-act="go" title="Go">Go</button>
      </div>`;
  }

  _wireBar(home) {
    this._home = home;
    this._current = home;
    const bar = this.querySelector('.sol-location-bar');
    if (!bar) return;
    const input = bar.querySelector('[data-loc]');
    const back = bar.querySelector('[data-act="back"]');
    input.value = home;

    const navigate = () => {
      const uri = this._normalize(input.value);
      if (uri) this._goTo(uri);
    };
    bar.querySelector('[data-act="go"]').addEventListener('click', navigate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });
    bar.querySelector('[data-act="home"]').addEventListener('click', () => this._goTo(this._home));
    // Locations dropdown: picking a pod location fills the box and navigates there,
    // then resets to the placeholder. Populated by `set locations` (fed by the host).
    const locSel = bar.querySelector('[data-locations]');
    if (locSel) locSel.addEventListener('change', () => {
      const uri = locSel.value;
      locSel.value = '';
      if (uri) { input.value = uri; this._goTo(uri); }
    });
    this._renderLocations();   // in case locations arrived before the bar was wired
    back.addEventListener('click', () => {
      if (this._hist.length < 2) return;
      this._hist.pop();                       // drop current
      const prev = this._hist[this._hist.length - 1];
      this._goTo(prev, { push: false });
    });

    // Reflect every navigation (bar-driven, link clicks, programmatic) back into
    // the input + back stack by wrapping the outliner's GotoSubject once.
    if (!this._outliner.__solBarSync) {
      this._outliner.__solBarSync = true;
      const orig = this._outliner.GotoSubject.bind(this._outliner);
      const self = this;
      this._outliner.GotoSubject = function (subject) {
        try {
          const uri = subject && subject.uri;
          if (uri) {
            const push = self._pushNext !== false;
            self._pushNext = true;
            self._current = uri;
            if (push && self._hist[self._hist.length - 1] !== uri) self._hist.push(uri);
            input.value = uri;
            back.disabled = self._hist.length < 2;
          }
        } catch (_) { /* keep navigating regardless */ }
        return orig.apply(this, arguments);
      };
    }
    this._hist = [home];
    back.disabled = true;
  }

  _init() {
    const m = getMashlib();
    if (!m) {
      const w = typeof window !== 'undefined' ? window : {};
      const g = typeof globalThis !== 'undefined' ? globalThis : {};
      console.error('[sol-solidos] getMashlib() returned null. window.Mashlib:', w.Mashlib,
        'globalThis.Mashlib:', g.Mashlib, 'window.panes:', w.panes, 'globalThis.panes:', g.panes);
      this.textContent = 'mashlib not loaded — add <script src="mashlib.js"> to the page';
      return;
    }
    this._m = m;
    ensureDocStyle(document, 'sol-solidos-style', HOST_CSS);

    // Build the DOM structure mashlib 2.x expects (matches its databrowser.html:
    // initMainPage fills #mainSolidUiHeader / #MainContent / #OutlineView /
    // #GlobalDashboard / #NavMenu / #PageFooter by id). The optional location bar
    // is prepended above mashlib's own header.
    const bar = this._hasBar() ? this._barMarkup() : '';
    this.innerHTML = `
      ${bar}
      <solid-ui-header id="mainSolidUiHeader" theme="" layout="" brand-link="/"><span slot="title"></span></solid-ui-header>
      <main id="MainContent" role="main" tabindex="-1" aria-live="polite">
        <div class="app-shell">
          <aside id="NavMenu" class="app-nav" aria-label="Application menu" hidden><div id="NavMenuContent" class="menu-content"></div></aside>
          <div class="app-view">
            <table id="OutlineView" class="outline-view" aria-label="Resource browser"></table>
            <section id="GlobalDashboard" class="global-dashboard" aria-label="Dashboard" hidden></section>
          </div>
        </div>
        <div id="MenuOverlay" class="menu-overlay" hidden aria-hidden="true"></div>
      </main>
      <footer id="PageFooter" role="contentinfo"></footer>
    `;

    const SL = m.SolidLogic?.solidLogicSingleton || m.SolidLogic?.default?.solidLogicSingleton;
    const store = SL?.store;
    const uri = this.getAttribute('source') || window.location.href;

    // Route mashlib's reads/writes through the page's authenticated fetch. A host
    // shares its fetch via component-interop (SolidWebComponents.adoptFetch), which
    // getAuthFetch() returns; solid-logic's boundFetch resolves the global fetch at
    // call time, so overriding it here makes every pane request inherit the session.
    // Resolved per-call so a fetch adopted after init is still honoured.
    if (!window.__solSolidosFetchPatched) {
      window.__solSolidosFetchPatched = true;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const u = typeof input === 'string' ? input
          : (input && (input.url || input.href)) || uri;
        try {
          const f = getAuthFetch(u);
          if (typeof f === 'function') return f(input, init);
        } catch (_) { /* fall through to native */ }
        return nativeFetch(input, init);
      };
    }

    this._home = uri;
    this._outliner = m.panes.getOutliner(document);
    this._guardBrandLink();
    if (this._hasBar()) {
      this._barEl = this.querySelector(':scope > .sol-location-bar');
      this._wireBar(uri);
    }
    this._fitChrome();
    m.initMainPage(store, uri);
    if (this._hasBar()) this._keepBarAlive();

    this._ready = true;
  }

  // solid-ui's MOBILE layout (Android WebView UA) rebuilds the whole BODY from
  // its own template during boot, discarding this element — and the wired
  // location bar with it. Watch for that takeover for a while and re-seat the
  // bar (its listeners ride along) at the top of the rebuilt body; _fitChrome's
  // document fallbacks then fit against the body-level header. On desktop the
  // takeover never happens and this polls to a quiet stop.
  _keepBarAlive() {
    if (!this._barEl || this._barWatch) return;
    let tries = 0;
    this._barWatch = setInterval(() => {
      if (++tries > 40) { clearInterval(this._barWatch); return; }
      if (!this._barEl.isConnected && document.getElementById('MainContent')) {
        document.body.prepend(this._barEl);
        this._renderLocations();
        this._fitChrome();
      }
    }, 500);
  }

  // mashlib's banner (#mainSolidUiHeader) mounts position:fixed;top:0;z-index:110 and
  // would paint over the top of the content — and the location bar when one is on
  // (HOST_CSS keeps the bar on top, z-index 120). This element doesn't use mashlib's
  // own offset (mash.css puts it on an .app-main wrapper this DOM doesn't have), so
  // fit the pieces here: the banner drops below the bar (bar height 0 when absent),
  // the main content's top margin clears the banner, and SolidAppContext.scroll —
  // solid-ui getEyeFocus's viewport-top offset, default 52 — tracks the same chrome
  // height so scroll-to-focus lands rows below the banner instead of under it.
  // The banner upgrades async (custom element) and reflows on the host app's
  // font-size toggle / viewport resize, so re-fit on whenDefined + a ResizeObserver.
  _fitChrome() {
    // Document fallbacks: after solid-ui's mobile body takeover the header /
    // main / bar live at body level, not inside this element (see _keepBarAlive).
    const fit = () => {
      const bar = this._barEl?.isConnected
        ? this._barEl : this.querySelector(':scope > .sol-location-bar');
      const bh = bar ? bar.offsetHeight : 0;
      const hdr = this.querySelector(':scope > #mainSolidUiHeader')
        || document.getElementById('mainSolidUiHeader');
      const main = this.querySelector(':scope > #MainContent')
        || document.getElementById('MainContent');
      if (hdr) hdr.style.top = `${bh}px`;                       // banner sits below the bar
      if (main) main.style.marginTop = `${hdr ? hdr.offsetHeight : 0}px`;  // content clears the banner
      window.SolidAppContext = window.SolidAppContext || {};
      window.SolidAppContext.scroll = bh + (hdr ? hdr.offsetHeight : 0);
    };
    fit();
    requestAnimationFrame(fit);
    customElements.whenDefined?.('solid-ui-header').then(() => requestAnimationFrame(fit)).catch(() => {});
    try {
      const ro = new ResizeObserver(fit);
      const bar = this._barEl || this.querySelector(':scope > .sol-location-bar');
      if (bar) ro.observe(bar);
      const hdr = this.querySelector(':scope > #mainSolidUiHeader')
        || document.getElementById('mainSolidUiHeader');
      if (hdr) ro.observe(hdr);
    } catch (_) { /* no ResizeObserver — the static fits above still run */ }
  }
}

define('sol-solidos', SolSolidos);
export default SolSolidos;
