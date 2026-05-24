// Anti-FOUC theme bootstrap. Inlined into index.html previously, but a
// strict CSP can't allow inline <script>, so it lives here. Synchronous
// + classic script tag in index.html so it runs before the React bundle
// paints the first frame.
(function () {
  try {
    var stored = localStorage.getItem('ks-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
