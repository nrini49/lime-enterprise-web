/* Site 2 preview behaviour: theme toggle and principles-library filtering.
   The full library is present in the static HTML; JS only narrows what is shown.
   No rotation, no carousel, no timers. */
(function () {
  'use strict';

  /* ---------- Theme toggle ---------- */
  var root = document.documentElement;
  var toggle = document.querySelector('[data-theme-toggle]');
  var SUN =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  var MOON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  var mode =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  function applyTheme(next) {
    mode = next;
    root.setAttribute('data-theme', mode);
    if (!toggle) return;
    toggle.setAttribute('aria-label', 'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' mode');
    toggle.innerHTML = mode === 'dark' ? SUN : MOON;
  }

  applyTheme(mode);

  if (toggle) {
    toggle.addEventListener('click', function () {
      applyTheme(mode === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Principles library ---------- */
  var search = document.querySelector('[data-principle-search]');
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-theme-chip]'));
  var records = Array.prototype.slice.call(document.querySelectorAll('[data-quote-id]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-theme-group]'));
  var countEl = document.querySelector('[data-result-count]');
  var emptyEl = document.querySelector('[data-empty-state]');

  if (!records.length) return;

  var activeTheme = 'all';
  var total = records.length;

  function currentQuery() {
    return search ? search.value.trim().toLowerCase() : '';
  }

  function apply() {
    var query = currentQuery();
    var shown = 0;

    records.forEach(function (record) {
      var themeOk = activeTheme === 'all' || record.getAttribute('data-theme-id') === activeTheme;
      var textOk = query === '' || (record.getAttribute('data-search') || '').indexOf(query) !== -1;
      var visible = themeOk && textOk;
      record.hidden = !visible;
      if (visible) shown += 1;
    });

    groups.forEach(function (group) {
      var visibleInGroup = Array.prototype.filter.call(
        group.querySelectorAll('[data-quote-id]'),
        function (record) {
          return !record.hidden;
        },
      );
      group.hidden = visibleInGroup.length === 0;
      var label = group.querySelector('[data-theme-count]');
      if (label) {
        label.textContent =
          visibleInGroup.length +
          (query === '' && activeTheme === 'all'
            ? ' records'
            : ' of ' + group.querySelectorAll('[data-quote-id]').length + ' records');
      }
    });

    if (countEl) {
      countEl.textContent =
        shown === total
          ? 'Showing all ' + total + ' records'
          : 'Showing ' + shown + ' of ' + total + ' records';
    }
    if (emptyEl) emptyEl.hidden = shown !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      activeTheme = chip.getAttribute('data-theme-chip');
      chips.forEach(function (other) {
        other.setAttribute('aria-pressed', other === chip ? 'true' : 'false');
      });
      apply();
    });
  });

  if (search) {
    search.addEventListener('input', apply);
    search.addEventListener('search', apply);
  }

  apply();
})();
