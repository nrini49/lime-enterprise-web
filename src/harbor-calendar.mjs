/**
 * NYSE trading-day arithmetic for Harbor Now, shared by the daily publisher
 * (scripts/harbor-daily.mjs, run in GitHub Actions) and the browser freshness
 * check (harbor-now/fresh.js, generated from these same functions by
 * src/harbor.mjs so the page and the publisher can never disagree).
 *
 * The calendar data is data/market-calendar.json, copied from Rosie's own
 * market_calendar.py. Every function below is self-contained (no imports, no
 * outer variables) because buildFreshScript() serialises them into the
 * browser script with Function.prototype.toString.
 */

/** Is `iso` (YYYY-MM-DD) an NYSE trading day? Weekends and full closures are not. */
export function isTradingDay(iso, cal) {
  var d = new Date(iso + 'T12:00:00Z');
  var wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  var year = Number(iso.slice(0, 4));
  var known = cal.calendar_years.indexOf(year) !== -1;
  if (known && Object.prototype.hasOwnProperty.call(cal.full_closures, iso)) return false;
  return true;
}

/** The calendar day before / after `iso`. */
export function addDays(iso, n) {
  var d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The trading day strictly before `iso`. */
export function prevTradingDay(iso, cal) {
  var d = addDays(iso, -1);
  for (var i = 0; i < 15 && !isTradingDay(d, cal); i++) d = addDays(d, -1);
  return d;
}

/**
 * The newest close an edition should exist for, given the New York date and
 * minutes after midnight: today once `readyMinutes` (default 6:30 PM ET) has
 * passed on a trading day, otherwise the previous trading day.
 */
export function expectedEditionDate(todayIso, minutesEt, cal, readyMinutes) {
  var ready = readyMinutes == null ? 18 * 60 + 30 : readyMinutes;
  if (isTradingDay(todayIso, cal) && minutesEt >= ready) return todayIso;
  var d = addDays(todayIso, -1);
  for (var i = 0; i < 15 && !isTradingDay(d, cal); i++) d = addDays(d, -1);
  return d;
}

/** Trading days t with latest < t <= expected: how many editions are missing. */
export function tradingDaysLate(latestIso, expectedIso, cal) {
  var n = 0;
  var d = latestIso;
  for (var i = 0; i < 400; i++) {
    d = addDays(d, 1);
    if (d > expectedIso) break;
    if (isTradingDay(d, cal)) n++;
  }
  return n;
}

/** Warning when a date falls outside the copied calendar (weekday fallback). */
export function calendarWarning(iso, cal) {
  var year = Number(iso.slice(0, 4));
  return cal.calendar_years.indexOf(year) === -1
    ? 'market calendar has no data for ' + year + '; weekdays assumed. Extend data/market-calendar.json from Rosie\'s market_calendar.py.'
    : '';
}

/** New York date (YYYY-MM-DD) and minutes after midnight for a Date. */
export function nyClock(date) {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  var get = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
  return { iso: get('year') + '-' + get('month') + '-' + get('day'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
