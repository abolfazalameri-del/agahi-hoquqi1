// Applies the saved theme before the page paints (prevents a light→dark flash).
(function () {
  try {
    var s = localStorage.getItem('theme');
    var t = s || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall back to light */ }
})();
