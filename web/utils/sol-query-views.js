// Built-in result views, shared by the <sol-query> element (web/sol-query.js)
// and the data-from-query activator (core/from-query.js) so neither pulls in the
// other. Each entry returns the view's render function on demand; the all-in-one
// Rollup bundle inlines these `import()`s, ESM consumers fetch only what they use.
const BUILTIN_VIEW_LOADERS = {
  table:           () => import('../views/table.js'),
  dl:              () => import('../views/dl.js'),
  list:            () => import('../views/list.js'),
  accordion:       () => import('../views/accordion.js'),
  anchorlist:      () => import('../views/anchorlist.js'),
  'auto-complete': () => import('../views/auto-complete.js'),
  menu:            () => import('../views/menu.js'),
  rolodex:         () => import('../views/rolodex.js'),
  select:          () => import('../views/select.js'),
  tabs:            () => import('../views/tabs.js'),
};

// Views whose results go through SparqlResultsRenderer preprocessing (pivot
// s/p/o, group predicates, scalar display); others are called as fn(container,
// data, host).
export const PREPROCESS_VIEWS = new Set(['table', 'dl', 'list']);

const _viewCache = new Map();
export async function loadBuiltinView(name) {
  if (_viewCache.has(name)) return _viewCache.get(name);
  const loader = BUILTIN_VIEW_LOADERS[name];
  if (!loader) return null;
  const mod = await loader();
  const fn  = mod.render ?? mod.default;
  _viewCache.set(name, fn);
  return fn;
}
