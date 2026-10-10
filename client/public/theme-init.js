// Runs before first paint (external file so the CSP can forbid inline scripts).
// Reads only a UI preference; authentication never touches browser storage.
(function () {
  try {
    var t = localStorage.getItem('hi-theme');
    if (t !== 'dark' && t !== 'light') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
  } catch (e) { /* storage unavailable */ }
})();
