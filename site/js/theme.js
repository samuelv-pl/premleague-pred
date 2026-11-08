// Runs before the page paints so there is no flash. Light unless the viewer chose dark.
(function () {
  var t = 'light';
  try { if (localStorage.getItem('s6.theme') === 'dark') t = 'dark'; } catch (e) { /* storage blocked */ }
  document.documentElement.setAttribute('data-theme', t);
})();
