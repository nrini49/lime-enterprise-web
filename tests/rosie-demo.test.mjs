/**
 * Public Rosie demo (rosie-demo/): a static snapshot of the current Rosie IB
 * Operator Workstation filled with SAMPLE data. These checks keep it static,
 * inert, honest about being a demo, and free of real account data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(root, 'rosie-demo');
const html = readFileSync(path.join(demoDir, 'index.html'), 'utf8');
const $ = cheerio.load(html);
const text = $('body').text().replace(/\s+/g, ' ');

test('demo: sample-data banner is the first thing in the body', () => {
  const banner = $('#demo-banner');
  assert.equal(banner.length, 1);
  assert.ok(
    banner.text().includes('Demo with sample data. Paper (practice) account. Not real positions, not advice.'),
  );
  assert.equal($('body').children().first().attr('id'), 'demo-banner');
});

test('demo: stays out of search results, as before', () => {
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
});

test('demo: no scripts, no forms, no inline handlers, no network references', () => {
  assert.equal($('script').length, 0, 'no <script>');
  assert.equal($('form').length, 0, 'no <form>');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handlers');
  assert.ok(!/https?:\/\//i.test(html), 'no absolute URLs of any kind');
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/.test(html), 'no network APIs');
  assert.ok(!/\saction=/i.test(html), 'no form actions');
});

test('demo: every control is inert', () => {
  $('button').each((_, b) => {
    assert.ok($(b).is('[disabled]'), `button "${$(b).text().trim()}" must be disabled`);
    assert.equal($(b).attr('type'), 'button');
  });
  $('input, select, textarea').each((_, el) => assert.ok($(el).is('[disabled]'), 'field disabled'));
  $('a').each((_, a) => assert.equal($(a).attr('href'), '/', 'only the site home link remains'));
});

test('demo: no real account data and no operator login', () => {
  assert.ok(!/DUO\d+|U\d{6,}/.test(html), 'no IB account number');
  assert.ok(text.includes('SAMPLE-PAPER'), 'account is labelled sample');
  assert.ok(!/log ?out|log ?in|password/i.test(text), 'no operator login controls');
  assert.ok(!/\.env\b|token|secret|127\.0\.0\.1|localhost|github/i.test(html), 'no internals');
});

test('demo: stops are broker-held protective stops, never trailing', () => {
  assert.ok(!/trail/i.test(html), 'no trailing stops anywhere');
  const stops = $('#panel-stops .stop-cell');
  assert.ok(stops.length > 0);
  stops.each((_, c) => assert.match($(c).text(), /^Held at broker: protective stop STP [\d.]+ x\d+ GTC$/));
});

test('demo: current layout panels are all present, Watchlist II included', () => {
  for (const id of [
    'panel-account-overview', 'panel-account-summary', 'panel-positions', 'panel-stops',
    'panel-working-orders', 'panel-derivatives', 'panel-watchlist', 'panel-watchlist-ii',
    'panel-trade-ticket', 'panel-propose', 'panel-trade-record', 'panel-journal',
    'panel-activity-log', 'panel-operator', 'panel-administrator', 'panel-diagnostics',
  ]) assert.equal($(`#${id}`).length, 1, id);
  const wl2 = $('#panel-watchlist-ii');
  assert.ok(wl2.text().includes('Candidates, not buy signals'));
  assert.ok(wl2.find('.tag.enter').length > 0 && wl2.find('.tag.watch').length > 0,
    'both MEASURED and NEEDS MEASUREMENT badges');
});

test('demo: every local asset it references exists', () => {
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u !== '/');
  assert.ok(refs.includes('static/lighthouse-loop.mp4'));
  for (const r of refs) assert.ok(existsSync(path.join(demoDir, r)), `missing asset ${r}`);
});
