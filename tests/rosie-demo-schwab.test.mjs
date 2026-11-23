/**
 * Public Rosie demo, Schwab (rosie-demo-schwab/, 2026-11-22): a static snapshot of the current
 * Rosie Schwab dashboard filled with SAMPLE data. The first customers are Schwab clients, so the
 * site's demo links open this page. Same rules as the IB demo: static, inert, honest about
 * being a demo, and free of real account data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = path.join(root, 'rosie-demo-schwab');
const html = readFileSync(path.join(demoDir, 'index.html'), 'utf8');
const $ = cheerio.load(html);
const text = $('body').text().replace(/\s+/g, ' ');

test('schwab demo: sample-data banner is the first thing in the body', () => {
  const banner = $('#demo-banner');
  assert.equal(banner.length, 1);
  assert.ok(banner.text().includes('Demo with sample data. Paper (practice) account. Not real positions, not advice.'));
  assert.equal($('body').children().first().attr('id'), 'demo-banner');
});

test('schwab demo: stays out of search results', () => {
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
});

test('schwab demo: no scripts, no forms, no inline handlers, no network references', () => {
  assert.equal($('script').length, 0, 'no <script>');
  assert.equal($('form').length, 0, 'no <form>');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handlers');
  assert.ok(!/https?:\/\//i.test(html), 'no absolute URLs of any kind');
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/.test(html), 'no network APIs');
  assert.ok(!/\saction=/i.test(html), 'no form actions');
});

test('schwab demo: every control is inert', () => {
  $('button').each((_, b) => {
    assert.ok($(b).is('[disabled]'), `button "${$(b).text().trim()}" must be disabled`);
    assert.equal($(b).attr('type'), 'button');
  });
  $('input, select, textarea').each((_, el) => assert.ok($(el).is('[disabled]'), 'field disabled'));
  $('a').each((_, a) => assert.equal($(a).attr('href'), '/', 'only the site home link remains'));
});

test('schwab demo: it is the Schwab board, with sample data and no operator tools', () => {
  assert.ok(text.includes('SCHWAB · SAMPLE FEED'), 'the Schwab status chip says sample feed');
  assert.ok(!/SCHWAB CONNECTED|Schwab Live Feed/i.test(text), 'never claims a live Schwab connection');
  assert.ok(!/\bIBKR\b|Rosie IB|Interactive Brokers/.test(text), 'no IB wording on the Schwab demo');
  assert.ok(text.includes('SAMPLE-PAPER'), 'account is labelled sample');
  assert.ok(!/\d{8,}/.test(text), 'no account-number-like digit runs');
  assert.ok(!/log ?out|log ?in\b|sign in/i.test(text), 'no operator login controls');
  assert.ok(!/\.env\b|token|secret|127\.0\.0\.1|localhost|github|Rechtman/i.test(html), 'no internals');
  for (const id of ['panel-operator', 'panel-administrator', 'panel-diagnostics', 'panel-notes-to-operators']) {
    assert.equal($(`[data-state-id="${id}"]`).length, 0, `${id} is not in the public demo`);
  }
});

test('schwab demo: every position has one broker-held protective stop, never trailing', () => {
  assert.ok(!/trail/i.test(text), 'no trailing stops in the visible text');
  const rows = $('details[data-state-id="panel-stops"] table').first().find('tr').slice(1);
  assert.equal(rows.length, 5, 'one row per sample position');
  rows.each((_, r) => assert.match($(r).text().replace(/\s+/g, ' '), /PROTECTED\s*STOP [\d.]+ \(WORKING\)/));
});

test('schwab demo: every local asset it references exists', () => {
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u !== '/');
  for (const r of refs) assert.ok(existsSync(path.join(demoDir, r)), `missing asset ${r}`);
});

// 2026-11-23 (owner t2029u, reviewer feedback: "the trade ticket menu does not work"). The demo is
// static and inert by design, so the Trade Ticket says so where people try it, and the notes no
// longer promise row clicks or sorting on this page.
test('schwab demo: the Trade Ticket says it is a demo picture, and no note promises clicks that do nothing', () => {
  const note = $('details[data-state-id="panel-trade-ticket"] [data-demo-ticket-note]');
  assert.equal(note.length, 1, 'one demo note inside the Trade Ticket');
  assert.match(note.text(), /Demo only/);
  assert.match(note.text(), /Nothing on this page can place an order/);
  assert.ok(!/(^|\. )Click a (row|column)/.test(text), 'no note tells the visitor to click a row or column here');
});
