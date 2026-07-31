// Resolve the theme before first paint to avoid a flash of the wrong theme.
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'light';
    globalThis.document.documentElement.dataset.theme = theme;
  } catch {
    globalThis.document.documentElement.dataset.theme = 'light';
  }
})();
