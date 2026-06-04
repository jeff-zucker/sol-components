// core/inrupt-global.js — publish the inrupt Session class as the global
// <sol-login> expects, from the manifest-mapped ESM build.
//
// <sol-login> reads the inrupt Session class from `window.solidClientAuthn`
// (a UMD-style global) and throws if it is absent (see web/sol-login.js
// getSessionClass). But the loader manifest maps
// `@inrupt/solid-client-authn-browser` to an ESM build that sets no global, so
// the `auth` capability could only work when the page ALSO loaded a separate
// UMD <script> first. This shim imports the same mapped specifier and publishes
// it at `window.solidClientAuthn`, so `data-extend-with="auth"` is self-contained
// on every stage. It is listed BEFORE `sol-login` in the manifest's `auth`
// capability, so the global is set by the time sol-login runs.
import * as inrupt from '@inrupt/solid-client-authn-browser';

if (typeof window !== 'undefined' && !window.solidClientAuthn) {
  // sol-login looks up `.Session`; the ESM namespace exposes it directly.
  window.solidClientAuthn = inrupt;
}
