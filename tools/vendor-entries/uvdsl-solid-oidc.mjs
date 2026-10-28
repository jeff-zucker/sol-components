// Vendored entry for @uvdsl/solid-oidc-client-browser.
//
// Re-exports the worker-FREE session: SessionCore (aliased Session) refreshes
// tokens on demand inside authFetch and restores from the refresh token in
// IndexedDB, so no SharedWorker is created. That keeps the client working in
// the Android System WebView (no SharedWorker there) and under the app-shell
// CSP, where serving a module worker is fragile.
//
// vendor.mjs rolls this file up into dist/vendor/@uvdsl-solid-oidc-client-browser.js
// and the importmap binds the bare specifier — and its /core subpath, which
// solid-logic imports for SessionCore — to it, so every module shares one instance.
export { SessionCore as Session, SessionCore, SessionEvents } from '@uvdsl/solid-oidc-client-browser/core';
export { SessionIDB } from '@uvdsl/solid-oidc-client-browser/web';
