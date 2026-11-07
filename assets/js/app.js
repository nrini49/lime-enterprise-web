/* Site 2 behaviour: the theme toggle, the narrow-screen masthead menu, and starting
   the header lighthouse loop. The page is complete and readable with JavaScript
   disabled. Scripted controls are created here rather than served in the markup, so a
   visitor without JavaScript is never shown a control that cannot act, and the
   masthead links stay visible. */
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

  /* The starting palette is whatever the markup declares (dark on the homepage, light
     on Harbor Now): the operating system preference is deliberately not consulted, and
     the choice is never persisted to any browser storage. The toggle changes the
     palette for the current page view only. */
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

/* The header lighthouse (2026-11-01) is served as a still poster with no autoplay
   attribute. It starts its quiet loop here, and only when the visitor has not asked
   for reduced motion; without JavaScript it simply stays a still logo. */
(function () {
  'use strict';
  var mark = document.querySelector('video[data-header-logo="lighthouse"]');
  if (!mark || typeof mark.play !== 'function') return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function sync() {
    if (reduce && reduce.matches) {
      mark.pause();
      return;
    }
    mark.muted = true;
    var started = mark.play();
    if (started && typeof started.catch === 'function') started.catch(function () {});
  }
  sync();
  if (reduce && typeof reduce.addEventListener === 'function') reduce.addEventListener('change', sync);
})();

/* Narrow screens (the same breakpoint where the section links leave the desktop header
   grid) collapse .masthead__nav so the Harbor report and the homepage are not covered
   by a wrapping link row. The control is a real button, collapsed by default. Desktop
   keeps the links in place and never shows the button. Nothing is stored. */
(function () {
  'use strict';

  var nav = document.querySelector('.masthead__nav');
  var host = document.querySelector('.masthead__inner');
  if (!nav || !host || !window.matchMedia) return;

  var query = window.matchMedia('(max-width: 61.99rem)');
  var button = null;
  var open = false;

  var ICON_MENU =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var ICON_CLOSE =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function paint() {
    if (!button) return;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    button.classList.toggle('is-open', open);
    button.innerHTML =
      (open ? ICON_CLOSE : ICON_MENU) +
      '<span class="masthead__nav-toggle-label">' +
      (open ? 'Close' : 'Menu') +
      '</span>';
    if (open) nav.removeAttribute('hidden');
    else nav.setAttribute('hidden', '');
  }

  function setOpen(next) {
    open = next;
    paint();
  }

  function ensureButton() {
    if (button) return;
    if (!nav.id) nav.id = 'masthead-nav';
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'masthead__nav-toggle';
    button.setAttribute('aria-controls', nav.id);
    button.setAttribute('data-nav-toggle', '');
    nav.parentNode.insertBefore(button, nav);
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!open);
    });
  }

  function activate() {
    document.documentElement.setAttribute('data-nav-ready', '');
    ensureButton();
    setOpen(false);
  }

  function deactivate() {
    document.documentElement.removeAttribute('data-nav-ready');
    open = false;
    nav.removeAttribute('hidden');
    if (button) {
      button.remove();
      button = null;
    }
  }

  function sync() {
    if (query.matches) {
      if (!button) activate();
    } else if (button) {
      deactivate();
    }
  }

  document.addEventListener('keydown', function (event) {
    if (!button || !open || event.key !== 'Escape') return;
    setOpen(false);
    button.focus();
  });

  document.addEventListener('click', function (event) {
    if (!button || !open) return;
    var target = event.target;
    if (target && host.contains(target)) return;
    setOpen(false);
  });

  nav.addEventListener('click', function (event) {
    if (!button || !open || !event.target.closest) return;
    var link = event.target.closest('a');
    if (!link || !nav.contains(link)) return;
    setOpen(false);
  });

  sync();
  if (typeof query.addEventListener === 'function') query.addEventListener('change', sync);
})();
