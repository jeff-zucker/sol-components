/**
 * @jest-environment jsdom
 */

/**
 * Tests for <sol-include> component.
 * Uses jsdom environment with mocked fetch.
 */

// Suppress sol-define duplicate registration warnings
window.__SolSuppressDefineWarn = true;

// Provide marked on window so the lazy loader finds it
window.marked = { parse: (md) => `<p>${md}</p>` };

let _fetchCalls = [];

function mockFetch(body, { contentType = 'text/html', status = 200 } = {}) {
  _fetchCalls = [];
  global.fetch = (url, opts) => {
    _fetchCalls.push({ url, opts });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: new Map([['content-type', contentType]]),
      text: () => Promise.resolve(body),
    });
  };
}

function failFetch(status = 500) {
  _fetchCalls = [];
  global.fetch = (url, opts) => {
    _fetchCalls.push({ url, opts });
    return Promise.resolve({
      ok: false,
      status,
      headers: new Map([['content-type', 'text/plain']]),
      text: () => Promise.resolve('error'),
    });
  };
}

let SolInclude;

beforeAll(async () => {
  ({ SolInclude } = await import('../../web/sol-include.js'));
});

afterEach(() => {
  document.body.innerHTML = '';
  _fetchCalls = [];
  try { delete window.SolidKitchen; } catch { /* ignore */ }
});

function createElement(attrs = {}) {
  const el = document.createElement('sol-include');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  return el;
}

async function mount(attrs = {}) {
  const el = createElement(attrs);
  document.body.appendChild(el);
  await new Promise(r => setTimeout(r, 50));
  return el;
}

function shadowText(el) {
  return el.shadowRoot?.textContent?.trim() || '';
}

function shadowHTML(el) {
  return el.shadowRoot?.innerHTML || '';
}

// ── No source ─────────────────────────────────────────────────────────────

describe('no source', () => {
  test('shows error when source is missing', async () => {
    const el = await mount();
    expect(shadowText(el)).toContain('No source provided');
  });
});

// ── HTML content ──────────────────────────────────────────────────────────

describe('HTML content', () => {
  test('renders HTML from source', async () => {
    mockFetch('<p>Hello World</p>', { contentType: 'text/html' });
    const el = await mount({ source: 'https://example.org/page.html' });
    expect(shadowHTML(el)).toContain('Hello World');
    expect(_fetchCalls[0].url).toBe('https://example.org/page.html');
  });

  test('detects HTML by file extension', async () => {
    mockFetch('<p>From ext</p>', { contentType: 'text/plain' });
    const el = await mount({ source: 'https://example.org/page.html' });
    expect(shadowHTML(el)).toContain('From ext');
    const content = el.shadowRoot.querySelector('.si-content');
    expect(content).not.toBeNull();
  });

  test('detects .htm extension', async () => {
    mockFetch('<p>HTM</p>', { contentType: 'text/plain' });
    const el = await mount({ source: 'https://example.org/page.htm' });
    expect(shadowHTML(el)).toContain('HTM');
  });
});

// ── Markdown content ──────────────────────────────────────────────────────

describe('Markdown content', () => {
  test('renders Markdown via marked', async () => {
    mockFetch('# Hello', { contentType: 'text/markdown' });
    const el = await mount({ source: 'https://example.org/readme.md' });
    expect(shadowHTML(el)).toContain('Hello');
  });

  test('detects Markdown by extension', async () => {
    mockFetch('Some text', { contentType: 'application/octet-stream' });
    const el = await mount({ source: 'https://example.org/readme.md' });
    expect(shadowHTML(el)).toContain('Some text');
  });

  test('detects text/x-markdown content type', async () => {
    mockFetch('X-md content', { contentType: 'text/x-markdown' });
    const el = await mount({ source: 'https://example.org/file.txt' });
    expect(shadowHTML(el)).toContain('X-md content');
  });
});

// ── Raw mode ──────────────────────────────────────────────────────────────

describe('raw attribute', () => {
  test('shows raw source text in <pre>', async () => {
    mockFetch('<p>Not rendered</p>', { contentType: 'text/html' });
    const el = await mount({ source: 'https://example.org/page.html', raw: true });
    const pre = el.shadowRoot.querySelector('.si-raw');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe('<p>Not rendered</p>');
  });

  test('raw mode for non-HTML content', async () => {
    mockFetch('plain text here', { contentType: 'text/plain' });
    const el = await mount({ source: 'https://example.org/data.txt', raw: true });
    const pre = el.shadowRoot.querySelector('.si-raw');
    expect(pre.textContent).toBe('plain text here');
  });
});

// ── Wanted selector ───────────────────────────────────────────────────────

describe('selector attribute', () => {
  test('filters HTML to matching elements', async () => {
    mockFetch('<div><p class="keep">Wanted</p><p class="drop">Dropped</p></div>', { contentType: 'text/html' });
    const el = await mount({ source: 'https://example.org/page.html', selector: '.keep' });
    expect(shadowText(el)).toContain('Wanted');
    expect(shadowText(el)).not.toContain('Dropped');
  });

  test('shows message when no elements match selector', async () => {
    mockFetch('<div><p>Nothing here</p></div>', { contentType: 'text/html' });
    const el = await mount({ source: 'https://example.org/page.html', selector: '.nonexistent' });
    expect(shadowText(el)).toContain('No elements matched selector');
  });
});

// ── Trusted mode ──────────────────────────────────────────────────────────

describe('trusted attribute', () => {
  test('renders HTML without sanitization when trusted', async () => {
    mockFetch('<div>Trusted content</div>', { contentType: 'text/html' });
    const el = await mount({ source: 'https://example.org/page.html', trusted: true });
    // Trusted content renders into LIGHT DOM (see sol-include.js:_showHtml)
    // so host stylesheets reach it; the shadow holds only a <slot>.
    expect(el.innerHTML).toContain('Trusted content');
    expect(el.querySelector('.si-content')).not.toBeNull();
  });
});

// ── Plain text ────────────────────────────────────────────────────────────

describe('plain text content', () => {
  test('shows unknown content types as raw text', async () => {
    mockFetch('Some data', { contentType: 'application/json' });
    const el = await mount({ source: 'https://example.org/data.json' });
    const pre = el.shadowRoot.querySelector('.si-raw');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe('Some data');
  });
});

// ── Fetch errors ──────────────────────────────────────────────────────────

describe('error handling', () => {
  test('shows HTTP error status', async () => {
    failFetch(404);
    const el = await mount({ source: 'https://example.org/missing.html' });
    expect(shadowText(el)).toContain('HTTP 404');
  });

  test('shows network error message', async () => {
    global.fetch = () => Promise.reject(new Error('Network failure'));
    const el = await mount({ source: 'https://example.org/page.html' });
    expect(shadowText(el)).toContain('Network failure');
  });
});

// ── Attribute changes ─────────────────────────────────────────────────────

describe('attribute changes', () => {
  test('reloads when source attribute changes', async () => {
    mockFetch('First', { contentType: 'text/plain' });
    const el = await mount({ source: 'https://example.org/first.txt' });
    expect(shadowText(el)).toContain('First');

    mockFetch('Second', { contentType: 'text/plain' });
    el.setAttribute('source', 'https://example.org/second.txt');
    await new Promise(r => setTimeout(r, 50));
    expect(shadowText(el)).toContain('Second');
  });
});

// ── if-logged-in (login-aware source) ──────────────────────────────────────

describe('if-logged-in attribute', () => {
  test('guest (no session) fetches the plain source', async () => {
    mockFetch('guest help', { contentType: 'text/plain' });
    const el = await mount({ source: 'guest.txt', 'if-logged-in': 'owner.txt' });
    expect(_fetchCalls[0].url).toBe('guest.txt');
    expect(shadowText(el)).toContain('guest help');
  });

  test('window.SolidKitchen is treated exactly as logged-in → fetches the alt', async () => {
    window.SolidKitchen = true;
    mockFetch('owner help', { contentType: 'text/plain' });
    const el = await mount({ source: 'guest.txt', 'if-logged-in': 'owner.txt' });
    expect(_fetchCalls[0].url).toBe('owner.txt');
    expect(shadowText(el)).toContain('owner help');
  });

  test('a logged-in <sol-login> → fetches the alt', async () => {
    const login = document.createElement('sol-login');
    login.isLoggedIn = true;
    document.body.appendChild(login);
    mockFetch('owner help', { contentType: 'text/plain' });
    const el = await mount({ source: 'guest.txt', 'if-logged-in': 'owner.txt' });
    expect(_fetchCalls[0].url).toBe('owner.txt');
  });

  test('re-evaluates on sol-login / sol-logout', async () => {
    const login = document.createElement('sol-login');
    login.isLoggedIn = false;
    document.body.appendChild(login);

    mockFetch('guest help', { contentType: 'text/plain' });
    const el = await mount({ source: 'guest.txt', 'if-logged-in': 'owner.txt' });
    expect(_fetchCalls[0].url).toBe('guest.txt');

    // log in → reloads to the alt
    login.isLoggedIn = true;
    mockFetch('owner help', { contentType: 'text/plain' });
    document.dispatchEvent(new CustomEvent('sol-login', { bubbles: true, composed: true }));
    await new Promise(r => setTimeout(r, 50));
    expect(_fetchCalls[0].url).toBe('owner.txt');

    // log out → reloads back to the plain source
    login.isLoggedIn = false;
    mockFetch('guest help', { contentType: 'text/plain' });
    document.dispatchEvent(new CustomEvent('sol-logout', { bubbles: true, composed: true }));
    await new Promise(r => setTimeout(r, 50));
    expect(_fetchCalls[0].url).toBe('guest.txt');
  });

  test('without if-logged-in, login state is ignored', async () => {
    window.SolidKitchen = true;
    mockFetch('plain', { contentType: 'text/plain' });
    const el = await mount({ source: 'only.txt' });
    expect(_fetchCalls[0].url).toBe('only.txt');
  });
});

// ── Loading state ─────────────────────────────────────────────────────────

describe('loading state', () => {
  test('shows loading message before content arrives', async () => {
    let resolveFetch;
    global.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
    const el = createElement({ source: 'https://example.org/slow.html' });
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 10));
    expect(shadowText(el)).toContain('Loading');

    resolveFetch({
      ok: true, status: 200,
      headers: new Map([['content-type', 'text/html']]),
      text: () => Promise.resolve('<p>Done</p>'),
    });
    await new Promise(r => setTimeout(r, 50));
    expect(shadowHTML(el)).toContain('Done');
  });
});
