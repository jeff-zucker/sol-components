// core/events.js — the canonical table of cross-component event names.
//
// Components coordinate by emitting/observing bubbling+composed CustomEvents on
// the document; this is the single source of truth for the names so authors use
// `SolidWebComponents.EVENTS.LOGIN` instead of hardcoding the string. Published
// onto `window.SolidWebComponents.EVENTS` by core/services.js.
//
// (Component-private events — e.g. sol-tab-change, sol-pod-pods-changed — stay
// local to their component. This table is the *shared* coordination vocabulary
// a third-party author is expected to emit or observe.)

export const EVENTS = Object.freeze({
  READY:          'swc:ready',          // loader finished its auto-load
  CAPABILITY:     'swc:capability',     // a data-extend-with capability finished loading
  OFFER:          'swc:offer',          // a component announces the extension points it offers

  LOGIN:          'sol-login',          // user authenticated
  LOGOUT:         'sol-logout',         // user signed out
  AUTH_NEEDED:    'sol-auth-needed',    // a fetch hit 401; a login listener resolves it

  DEFAULT_CHANGE: 'sol-default-change', // a <sol-default> attribute changed
  COMMAND:        'sol-command',        // an app-registered command (non-component handler)
  ERROR:          'sol-error',          // a component/handler load or validation failure
  FORM_SAVE:      'sol-form-save',      // an editor persisted changes
});

export default EVENTS;
