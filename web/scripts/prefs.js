(function () {
  var THEME_KEY = 'swc-theme';
  var FONT_KEY  = 'swc-font-size';

  function apply(theme, fontSize) {
    if (theme)    document.documentElement.setAttribute('data-theme', theme);
    if (fontSize) document.documentElement.style.setProperty('--font-size', fontSize);
  }

  try {
    apply(
      localStorage.getItem(THEME_KEY) || 'light',
      localStorage.getItem(FONT_KEY)  || '20px'
    );
  } catch (e) {}

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (d && d.type === 'swc-prefs') apply(d.theme, d.fontSize);
  });

  if (window.parent !== window) {
    try { window.parent.postMessage({ type: 'swc-ready' }, '*'); } catch (e) {}
  }
})();
