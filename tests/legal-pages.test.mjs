/**
 * Privacy Policy and Terms of Use: short plain-English pages, linked from the
 * footer, not added to the four-item masthead menu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legal = JSON.parse(readFileSync(path.join(root, 'data/legal.json'), 'utf8'));
const site = JSON.parse(readFileSync(path.join(root, 'data/homepage.json'), 'utf8'));
const { redirects } = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const load = (file) => cheerio.load(readFileSync(path.join(root, file), 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

const menuFiles = [
  'index.html',
  'how-rosie-works/index.html',
  'harbor-now/index.html',
  'blog/index.html',
  '404.html',
  'privacy/index.html',
  'terms/index.html',
];

test('legal: both pages are built, dark by default, one h1 each, and stay out of the menu', () => {
  assert.deepEqual(
    legal.pages.map((p) => [p.id, p.path, p.file]),
    [
      ['privacy', '/privacy/', 'privacy/index.html'],
      ['terms', '/terms/', 'terms/index.html'],
    ],
  );
  for (const p of legal.pages) {
    assert.ok(existsSync(path.join(root, p.file)), `${p.file} exists`);
    const $ = load(p.file);
    assert.equal($('html').attr('data-theme'), 'dark', `${p.file} defaults to dark`);
    assert.equal($('meta[name="color-scheme"]').attr('content'), 'dark');
    assert.equal($('h1').length, 1);
    assert.equal(norm($('h1').text()), p.heading);
    assert.equal($('form, input, textarea, select').length, 0, `${p.file} has no forms`);
    const nav = $('.masthead__nav a')
      .map((_, el) => ({ text: norm($(el).text()), href: $(el).attr('href'), current: $(el).attr('aria-current') || null }))
      .get();
    assert.deepEqual(
      nav.map((l) => [l.text, l.href, l.current]),
      site.pages.map((pg) => [pg.nav, pg.path, null]),
      `${p.file} keeps the four-link menu and does not add itself`,
    );
  }
});

test('legal: the pages stay short and readable', () => {
  for (const p of legal.pages) {
    const $ = load(p.file);
    const count = words($('main').text()).length;
    assert.ok(count <= 350, `${p.file} should be about one screen (${count} words in main)`);
    assert.ok($('.prose h2').length >= 4, `${p.file} uses short headings`);
    assert.ok(!/hereinafter|pursuant|hereby|whereas|aforementioned|indemnif/i.test($('main').text()), `${p.file} avoids legalese`);
    assert.ok(!/draft|lawyer|attorney|pending review/i.test($('main').text()), `${p.file} must not mark itself as a draft`);
  }
});

test('legal: footer links appear on every built page, including Harbor editions and 404', () => {
  const files = [...menuFiles];
  for (const d of readdirSync(path.join(root, 'harbor-now'))) {
    if (existsSync(path.join(root, 'harbor-now', d, 'index.html'))) files.push(`harbor-now/${d}/index.html`);
  }
  for (const file of files) {
    const $ = load(file);
    const nav = $('footer .foot__legal');
    assert.equal(nav.length, 1, `${file} has one legal footer nav`);
    assert.equal(nav.attr('aria-label'), 'Legal');
    const links = nav.find('a').toArray().map((el) => [
      norm($(el).text()),
      $(el).attr('href'),
      $(el).attr('target') || null,
    ]);
    assert.deepEqual(
      links,
      [
        ['Privacy Policy', '/privacy/', null],
        ['Terms of Use', '/terms/', null],
      ],
      `${file} footer legal links`,
    );
  }
});

test('legal: truthful product facts, no people, no profit promises, Schwab before IB', () => {
  const privacy = norm(load('privacy/index.html')('main').text());
  const terms = norm(load('terms/index.html')('main').text());
  const both = `${privacy} ${terms}`;

  assert.match(privacy, /Lime Signalworks LLC/);
  assert.match(privacy, /Rosie \(Keelwise\)/);
  assert.match(privacy, /Windows PC/);
  assert.match(privacy, /broker keys/);
  assert.match(privacy, /sign-in tokens/);
  assert.match(privacy, /stay on (that|your|the customer's) PC|stay on that PC/i);
  assert.match(privacy, /do not receive them/i);
  assert.match(privacy, /do not sell them/i);
  assert.match(privacy, /Never send your key or secret to anyone/);
  assert.match(privacy, /no accounts and no forms/i);
  assert.match(privacy, /did not add advertising or analytics/i);
  assert.match(privacy, /GoDaddy/);
  assert.match(privacy, /performance-monitoring script/);
  assert.match(privacy, /Chrome Remote Desktop/);
  assert.match(privacy, /share a code/);
  assert.match(privacy, /end the session at any time/);

  assert.match(terms, /educational tool/i);
  assert.match(terms, /not personalized investment advice/i);
  assert.match(terms, /not a promise of results/i);
  assert.match(terms, /Trading can lose money/);
  assert.match(terms, /You are responsible for your trades/);
  assert.match(terms, /confirm click/);
  assert.match(terms, /Auto mode is optional/);
  assert.match(terms, /Only you can turn it on/);
  assert.match(terms, /Chrome Remote Desktop/);
  assert.ok(!/\bprofit\b/i.test(terms), 'terms must not promise profit; avoid the word');

  for (const name of ['sean', 'rechtman', 'noal', 'noel', 'elliott']) {
    assert.ok(!both.toLowerCase().includes(name), `legal pages must not name "${name}"`);
  }
  assert.ok(!/safety suit/i.test(both));
  assert.ok(!/rules?[-\s]+based/i.test(both));

  const ib = both.toLowerCase().indexOf('interactive brokers');
  const schwab = both.toLowerCase().indexOf('schwab');
  assert.ok(schwab !== -1 && ib !== -1, 'brokers are named');
  assert.ok(schwab < ib, 'Schwab is listed before Interactive Brokers');

  // Contact stays in the existing footer; these pages do not add a second mailto.
  for (const file of ['privacy/index.html', 'terms/index.html']) {
    const $ = load(file);
    assert.equal($('a[href^="mailto:"]').length, 1, `${file} keeps a single mailto, in the footer`);
    assert.equal($('main a[href^="mailto:"]').length, 0);
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href');
      assert.ok($(el).attr('target') === '_blank' && /\bnoopener\b/.test($(el).attr('rel') || ''), `external link must open in a new window: ${href}`);
    });
  }
});

test('legal: old /privacy-policy and /terms-of-use paths redirect to the new pages', () => {
  const map = Object.fromEntries(redirects.map((r) => [r.source, r.destination]));
  assert.equal(map['/privacy-policy'], '/privacy/');
  assert.equal(map['/terms-of-use'], '/terms/');
});
