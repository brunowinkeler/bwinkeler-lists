// Resolve the theme before first paint to avoid a flash of the wrong theme.
(function () {
  var theme = 'light';
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch {
    // Ignore storage failures (e.g. private browsing).
  }
  globalThis.document.documentElement.dataset.theme = theme;
  // Keeps the installed-app status bar in step with the theme.
  var meta = globalThis.document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d13' : '#f5f6fb');
})();
