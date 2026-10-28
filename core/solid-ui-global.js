// sol-form and shape-to-form draw through window.UI.widgets; solid-ui's ESM
// build no longer sets that global, so this does (a page's own UI wins).
// Imported ahead of the form modules so the global exists before they run.
import * as solidUi from 'solid-ui';

if (typeof window !== 'undefined' && !window.UI) window.UI = solidUi;
