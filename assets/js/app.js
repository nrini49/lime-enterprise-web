/* Site 2 behaviour: the theme toggle, and nothing else.
   The page is complete and readable with JavaScript disabled. The toggle is created
   here rather than served in the markup, so a visitor without JavaScript is never
   shown a control that cannot act. */
(function () {
  'use strict';

  var root = document.documentElement;
  var host = document.querySelector('.masthead__inner');
  if (!host) return;

  var SUN =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  var MOON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  var toggle = document.createElement('button');
  toggle.className = 'theme-toggle';
  toggle.type = 'button';
  toggle.setAttribute('data-theme-toggle', '');
  host.appendChild(toggle);

  /* Light is the unconditional default for this surface: the operating system
     preference is deliberately not consulted, and the choice is never persisted to any
     browser storage. Every load starts light; the toggle changes the palette for the
     current page view only. */
  var mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  function applyTheme(next) {
    mode = next;
    root.setAttribute('data-theme', mode);
    toggle.setAttribute('aria-label', 'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' mode');
    toggle.innerHTML = mode === 'dark' ? SUN : MOON;
  }

  applyTheme(mode);

  toggle.addEventListener('click', function () {
    applyTheme(mode === 'dark' ? 'light' : 'dark');
  });
})();
