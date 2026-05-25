/**
 * <sol-weather> — current-conditions web component.
 *
 * Renders a compact one-line card (icon · place · temperature · rain stat)
 * using the Open-Meteo public API. Either pass `lat` + `lon` directly or
 * pass `place` and the component will geocode it once.
 *
 * Attributes:
 *   lat            decimal latitude
 *   lon            decimal longitude
 *   place          free-text place name (geocoded via Open-Meteo)
 *   units          "metric" | "imperial" | "both" (default: both)
 *   hours-window   max-precip lookahead, in hours (default: 12)
 *   source         "file.ttl#Subject" Turtle config in schema.org
 *                  PropertyValue form. Setting names map to the
 *                  matching HTML attributes:
 *                    "latitude"        → lat
 *                    "longitude"       → lon
 *                    "place"           → place
 *                    "units"           → units
 *                    "forecast-window" → hours-window
 *                  HTML attributes override the TTL.
 *
 * Refreshes every ten minutes; aborts in-flight fetches on
 * disconnect / re-fetch. Open-Meteo has no API key requirement.
 *
 * @element sol-weather
 *
 * @example
 *   <sol-weather place="Portland, OR"></sol-weather>
 *   <sol-weather lat="45.52" lon="-122.68" units="imperial"></sol-weather>
 *   <sol-weather source="data/weather-settings.ttl#Settings"></sol-weather>
 */
import { adopt } from '../core/adopt.js';
import { define } from '../core/define.js';
import { attachEditorSelfGear } from '../core/editor-self.js';
import { CSS as WEATHER_CSS, sheet as WEATHER_SHEET } from './styles/sol-weather-css.js';
import { loadConfig } from './utils/rdf-config.js';

/** Open-Meteo WMO weather codes → [short description, emoji]. */
const WEATHER_MAP = {
  0:  ['Clear sky',                '☀️'],
  1:  ['Mainly clear',             '🌤️'],
  2:  ['Partly cloudy',            '⛅'],
  3:  ['Overcast',                 '☁️'],
  45: ['Fog',                      '🌫️'],
  48: ['Rime fog',                 '🌫️'],
  51: ['Light drizzle',            '🌦️'],
  53: ['Moderate drizzle',         '🌦️'],
  55: ['Dense drizzle',            '🌧️'],
  56: ['Light freezing drizzle',   '🥶🌧️'],
  57: ['Dense freezing drizzle',   '🥶🌧️'],
  61: ['Slight rain',              '🌧️'],
  63: ['Moderate rain',            '🌧️'],
  65: ['Heavy rain',               '🌧️'],
  66: ['Light freezing rain',      '🥶🌧️'],
  67: ['Heavy freezing rain',      '🥶🌧️'],
  71: ['Slight snow',              '🌨️'],
  73: ['Moderate snow',            '🌨️'],
  75: ['Heavy snow',               '❄️'],
  80: ['Slight rain showers',      '🌧️'],
  81: ['Moderate rain showers',    '🌧️'],
  82: ['Violent rain showers',     '⛈️'],
  95: ['Thunderstorm',             '⛈️'],
  96: ['Thunderstorm w/ hail',     '⛈️'],
  99: ['Severe thunderstorm',      '⛈️'],
};

function cToF(c) { return c * 9 / 5 + 32; }

/**
 * Compact current-conditions web component (Open-Meteo).
 *
 * @class SolWeather
 * @extends HTMLElement
 */
class SolWeather extends HTMLElement {
  static get observedAttributes() {
    return ['lat', 'lon', 'place', 'units', 'hours-window', 'source'];
  }

  /** SHACL shape declaring the fixed schema (predicates + datatypes +
   *  cardinalities). sol-form's shape-driven mode generates a labelled
   *  field per property; dk-settings discovery picks this up. The
   *  legacy `editor` (ui:Form TTL) getter was dropped in the
   *  direct-predicate vocab migration — see
   *  swc/claude/plans/PLAN-vocab-migration.md. */
  static get shape() {
    return new URL('../shapes/weather-settings.shacl', import.meta.url).href;
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._controller = null;     // AbortController for the active fetch
    this._timer      = null;     // re-fetch interval
    this._refreshMs  = 10 * 60 * 1000;
  }

  async connectedCallback() {
    adopt(this.shadowRoot, { sheet: WEATHER_SHEET, css: WEATHER_CSS });

    this._card = document.createElement('div');
    this._card.className = 'card';
    this._card.setAttribute('part', 'card');
    this._card.setAttribute('role', 'region');
    this._card.setAttribute('aria-live', 'polite');
    this._card.innerHTML = `
      <span class="icon"  part="icon">·</span>
      <span class="place" part="place"></span>
      <span class="temp"  part="temp"></span>
      <span class="desc"  part="desc"></span>
      <span class="stat"  part="rain"></span>
    `;
    this._error = document.createElement('div');
    this._error.className = 'error';
    this._error.setAttribute('role', 'alert');
    this._error.hidden = true;
    this.shadowRoot.append(this._card, this._error);

    this._el = {
      icon:  this._card.querySelector('.icon'),
      place: this._card.querySelector('.place'),
      temp:  this._card.querySelector('.temp'),
      desc:  this._card.querySelector('.desc'),
      rain:  this._card.querySelector('.stat'),
    };

    // Pull defaults from the configured RDF source; any HTML attribute
    // that was already set wins (so a page can override one field
    // inline while the rest come from the TTL).
    await this._applySource();

    await this._update();
    this._timer = setInterval(() => this._update(), this._refreshMs);

    if (this.hasAttribute('editor-self')) attachEditorSelfGear(this);
  }

  /**
   * Apply config from `source` to attributes the component already
   * observes. Mapping (predicate URI → HTML attribute):
   *   geo:lat                  → lat
   *   geo:long                 → lon
   *   schema:addressLocality   → place
   *   ui:temperatureUnit       → units   ("metric"/"imperial"/"both")
   *   time:hours               → hours-window
   * Skips any attribute already set in HTML. See
   * claude/plans/PLAN-vocab-migration.md for the predicate choices.
   */
  async _applySource() {
    const source = this.getAttribute('source');
    if (!source) return;
    const GEO    = 'http://www.w3.org/2003/01/geo/wgs84_pos#';
    const SCHEMA = 'http://schema.org/';
    const TIME   = 'http://www.w3.org/2006/time#';
    const UI     = 'http://www.w3.org/ns/ui#';

    try {
      const cfg = await loadConfig(source);
      const setIf = (attr, val) => {
        if (val != null && !this.hasAttribute(attr)) {
          this.setAttribute(attr, String(val));
        }
      };
      setIf('lat',           cfg[GEO    + 'lat']);
      setIf('lon',           cfg[GEO    + 'long']);
      setIf('place',         cfg[SCHEMA + 'addressLocality']);
      setIf('hours-window',  cfg[TIME   + 'hours']);

      // ui:temperatureUnit is single-valued. Map the three instances
      // onto the legacy 'units' attribute the renderer already speaks.
      const tu = cfg[UI + 'temperatureUnit'];
      if (tu != null) {
        const value = Array.isArray(tu) ? tu[0] : tu;
        const units = value === UI + 'Fahrenheit' ? 'imperial'
                    : value === UI + 'Celsius'    ? 'metric'
                    : value === UI + 'Both'       ? 'both'
                    : null;
        if (units) setIf('units', units);
      }
    } catch (err) {
      console.warn(`[sol-weather] source ${source}: ${err.message}`);
    }
  }

  disconnectedCallback() {
    if (this._controller) this._controller.abort();
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /**
   * Re-read `source` and re-fetch weather. Public hook used by external
   * editors (e.g. dk-settings) after a configuration file changes.
   */
  async reload() {
    await this._applySource();
    await this._update();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV !== newV && this.isConnected) this._update();
  }

  get lat()         { return this.getAttribute('lat'); }
  get lon()         { return this.getAttribute('lon'); }
  get placeAttr()   { return this.getAttribute('place'); }
  get units()       { return (this.getAttribute('units') || 'both').toLowerCase(); }
  get hoursWindow() { return Math.max(1, Number(this.getAttribute('hours-window')) || 12); }

  /** Show an error in the inline error strip. The card stays visible so a
   *  later successful refresh just replaces the strip. */
  _showError(msg) {
    if (!this._error) return;
    this._error.hidden = false;
    this._error.textContent = msg;
  }
  _clearError() {
    if (!this._error) return;
    this._error.hidden = true;
    this._error.textContent = '';
  }

  async _update() {
    // `attributeChangedCallback` fires for each statically-set attribute
    // before `connectedCallback` runs, so we can be called before the
    // shadow tree is built. Bail until setup finishes; the tail of
    // `connectedCallback` will re-invoke us.
    if (!this._card) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline — hide the card so it doesn't display stale numbers as if
      // they were current; the next online refresh will repopulate it.
      this._card.style.display = 'none';
      return;
    }
    this._card.style.display = '';

    if (this._controller) this._controller.abort();
    this._controller = new AbortController();
    const signal = this._controller.signal;

    this._clearError();
    this._el.place.textContent = 'Loading…';
    this._el.temp.textContent  = '';
    this._el.icon.textContent  = '·';
    this._el.desc.textContent  = '';
    this._el.rain.textContent  = '';

    let lat = this.lat, lon = this.lon;
    const placeName = this.placeAttr;

    try {
      if ((!lat || !lon) && placeName) {
        const hits = await this._geocode(placeName, signal);
        if (!hits.length) throw new Error('Place not found');
        lat = hits[0].latitude;
        lon = hits[0].longitude;
      }
      if (!lat || !lon) throw new Error('Provide lat & lon, or a place');

      const data = await this._fetchWeather(Number(lat), Number(lon), signal);
      this._render(data, { lat: Number(lat), lon: Number(lon) });
    } catch (err) {
      if (err.name === 'AbortError') return;
      this._el.place.textContent = '';
      this._showError(err.message || String(err));
    }
  }

  async _geocode(q, signal) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('Geocoding failed: ' + res.status);
    const json = await res.json();
    return json.results || [];
  }

  async _fetchWeather(lat, lon, signal) {
    const hourly = [
      'temperature_2m',
      'precipitation_probability',
      'weathercode',
    ].join(',');
    const url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${encodeURIComponent(lat)}`
      + `&longitude=${encodeURIComponent(lon)}`
      + `&current_weather=true&hourly=${hourly}&timezone=auto`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('Weather fetch failed: ' + res.status);
    return res.json();
  }

  _render(data, coords) {
    const cw     = data.current_weather || {};
    const hourly = data.hourly || {};
    const times  = hourly.time || [];

    // Match the current-weather sample against the hourly index; fall
    // back to the nearest hour when the timestamp isn't a perfect match
    // (the API rounds differently across endpoints).
    let idx = times.indexOf(cw.time);
    if (idx === -1 && cw.time) {
      const target = Date.parse(cw.time);
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(Date.parse(times[i]) - target);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      idx = best;
    }
    if (idx < 0) idx = 0;

    const probs       = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    const windowProbs = probs.slice(idx, idx + this.hoursWindow);
    const maxProb     = windowProbs.length ? Math.max(...windowProbs) : null;

    const code    = cw.weathercode;
    const mapping = WEATHER_MAP[code] || ['Unknown', '❔'];
    const cTemp   = Number(cw.temperature);
    const fTemp   = cToF(cTemp);

    let tempText;
    if (this.units === 'metric')        tempText = `${cTemp.toFixed(1)}°C`;
    else if (this.units === 'imperial') tempText = `${fTemp.toFixed(1)}°F`;
    else                                tempText = `${cTemp.toFixed(1)}°C / ${fTemp.toFixed(1)}°F`;

    this._el.icon.textContent  = mapping[1];
    this._el.place.textContent = this.placeAttr
      || `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`;
    this._el.temp.textContent  = tempText;
    this._el.desc.textContent  = mapping[0];
    this._el.rain.textContent  = maxProb != null ? `rain ${maxProb}%` : '';
  }
}

define('sol-weather', SolWeather);
export { SolWeather };
