// Applies the persisted theme before the first paint. Kept as an external
// file so the production CSP can stay `script-src 'self'` with no inline
// script allowances.
(function () {
  try {
    var theme = window.localStorage.getItem('streetlifting.theme.v1') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-streetlifting-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-streetlifting-theme', 'light');
  }
})();
