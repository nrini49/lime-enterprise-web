/**
 * Buy Rosie landing (2026-11-23 draft): a shareable page for the free month and the
 * proposed price. It uses the same shell and four-link menu as the rest of the site,
 * but is not itself a menu item until Noal decides it should be. No payment form, no
 * registration form, and no charge.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(path.join(root, 'data/homepage.json'), 'utf8'));
const html = readFileSync(path.join(root, 'buy-rosie/index.html'), 'utf8');
const $ = cheerio.load(html);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const text = norm($('body').text());

test('buy-rosie: the landing is built, and is not in the main menu', () => {
  assert.equal(data.offerPage.path, '/buy-rosie/');
  assert.equal(data.offerPage.file, 'buy-rosie/index.html');
  assert.equal(data.offerPage.inNav, false);
  assert.ok(existsSync(path.join(root, 'buy-rosie/index.html')));
  assert.ok(!data.pages.some((p) => p.id === 'buy-rosie'), 'the landing is not a menu page');
  const labels = $('.masthead__nav a')
    .map((_, el) => norm($(el).text()))
    .get();
  assert.deepEqual(labels, ['Home', 'How Rosie Works', 'Harbor Now', 'Blog']);
  assert.equal($('.masthead__nav a[aria-current]').length, 0, 'no menu item is marked current');
});

test('buy-rosie: one h1, and exactly the offer sections', () => {
  assert.equal($('h1').length, 1);
  assert.equal(norm($('h1').text()), 'Buy Rosie');
  const expected = data.sectionOrder.filter((s) => s.page === 'buy-rosie').map((s) => s.id);
  assert.deepEqual($('main section[id]').map((_, el) => $(el).attr('id')).get(), expected);
});

test('buy-rosie: default theme is dark, and Rosie speaks in the first person', () => {
  assert.equal($('html').attr('data-theme'), 'dark');
  assert.equal($('[data-page-head="buy-rosie"] [data-voice="rosie"]').length, 1);
  assert.match(norm($('[data-page-head="buy-rosie"] .page-head__lede').text()), /free month/i);
  assert.match(text, /From Rosie/);
});

test('buy-rosie: proposed price is marked pending, and nothing is charged here', () => {
  assert.ok($('[data-price-pending]').length >= 1);
  assert.match(norm($('[data-price-pending]').first().text()), /pending confirmation/i);
  assert.match(norm($('[data-offer-pricing-status]').text()), /nothing is sold or charged on this site/i);
  const rows = $('[data-offer-pricing-table] tbody tr')
    .toArray()
    .map((tr) => [norm($(tr).find('th').text()), norm($(tr).find('td').text())]);
  assert.deepEqual(rows, data.pricing.rows.map((r) => [r.term, r.price]));
});

test('buy-rosie: honest about what the customer needs, with Schwab named first', () => {
  const need = norm($('#buy-rosie-need').text());
  assert.match(need, /Windows computer/);
  assert.match(need, /https:\/\/127\.0\.0\.1:8182/);
  assert.match(need, /developer account and app/);
  assert.match(need, /still being worked through/);
  const schwab = need.toLowerCase().indexOf('schwab');
  const ib = need.toLowerCase().indexOf('interactive brokers');
  assert.ok(schwab >= 0 && ib >= 0 && schwab < ib, 'Schwab is named before Interactive Brokers');
});

test('buy-rosie: does not promise licensing or a payment form that is not built', () => {
  const pathText = norm($('#buy-rosie-path').text());
  assert.match(pathText, /licensing is not built yet/);
  assert.match(pathText, /signed unlock code/);
  assert.match(pathText, /No payment is taken on this site/);
  assert.equal($('form, input, textarea, select, button').length, 0, 'no form or payment control');
  const purchaseWords = /\b(buy|purchase|enroll|checkout|subscribe|pay now|add to cart)\b/i;
  $('a').each((_, el) => {
    const label = norm($(el).clone().find('.sr-only').remove().end().text());
    assert.ok(!purchaseWords.test(label), `no purchase control: "${label}"`);
  });
});

test('buy-rosie: enrollment is by email, not by phone, and uses the site contact block', () => {
  const begin = norm($('#buy-rosie-begin').text());
  assert.match(begin, /does not begin by phone/);
  assert.match(begin, /registration form/i);
  assert.equal($('#buy-rosie-begin a[href="#contact"]').length, 1);
  assert.equal($('a[href^="mailto:"]').length, 1, 'one mailto, in the footer');
  assert.equal($('#contact').length, 1);
});

test('buy-rosie: slogan once, no rule-based, no forbidden names, no Safety Suit', () => {
  const slogan = /Nothing hidden, except the code/g;
  assert.equal((text.match(slogan) || []).length, 1);
  assert.doesNotMatch(text, /rule-based/i);
  assert.doesNotMatch(text, /sean|rechtman|safety suit/i);
  assert.match(text, /you stay in charge/);
  assert.match(text, /view-only/);
});

test('buy-rosie: home and How Rosie Works send the free-month path here', () => {
  const home = cheerio.load(readFileSync(path.join(root, 'index.html'), 'utf8'));
  assert.equal(home('.hero a.btn--primary').attr('href'), '/buy-rosie/');
  const how = cheerio.load(readFileSync(path.join(root, 'how-rosie-works/index.html'), 'utf8'));
  assert.ok(how('a[href="/buy-rosie/"]').length >= 1);
});
