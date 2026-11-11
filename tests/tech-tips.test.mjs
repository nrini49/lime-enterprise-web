/**
 * Tech Tips (/tech-tips/): technology-only how-tos (2026-11-02, owner direction).
 * Validates the build of data/tech-tips.json into tech-tips/, plus sitemap.xml and
 * robots.txt (run after `npm run build`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { checkTips, postText, inline, TechTipsError, TIPS_BANNED } from '../src/tech-tips.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tips = JSON.parse(readFileSync(path.join(root, 'data', 'tech-tips.json'), 'utf8'));
const origin = `https://${readFileSync(path.join(root, 'CNAME'), 'utf8').trim()}`;
const load = (rel) => cheerio.load(readFileSync(path.join(root, rel), 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const pages = [
  ['tech-tips/index.html', '/tech-tips/'],
  ...tips.posts.map((p) => [`tech-tips/${p.slug}/index.html`, `/tech-tips/${p.slug}/`]),
];
const homepage = load('index.html');

test('tips: an index and the two first posts are built, with readable slugs', () => {
  assert.equal(tips.posts.length, 2);
  assert.deepEqual(tips.posts.map((p) => p.slug), [
    'broker-update-reconnect-restart-order',
    'clean-start-stop-windows-without-scary-prompts',
  ]);
  for (const [rel] of pages) assert.ok(existsSync(path.join(root, rel)), rel);
  const $ = load('tech-tips/index.html');
  assert.equal($('[data-tips-list] li').length, 2);
  for (const p of tips.posts) assert.equal($(`[data-tips-list] a[href="/tech-tips/${p.slug}/"]`).length, 1);
});

test('tips: every page is indexable, with title, description, canonical and Open Graph', () => {
  for (const [rel, urlPath] of pages) {
    const $ = load(rel);
    const url = origin + urlPath;
    assert.equal($('meta[name="robots"]').attr('content'), 'index, follow', rel);
    assert.ok(!/noindex|nofollow/i.test($.html()), `${rel}: nothing is noindex`);
    assert.ok($('title').text().length > 10, rel);
    const desc = $('meta[name="description"]').attr('content');
    assert.ok(desc && desc.length >= 50 && desc.length <= 200, `${rel}: description length ${desc && desc.length}`);
    assert.equal($('link[rel="canonical"]').attr('href'), url, rel);
    assert.equal($('meta[property="og:url"]').attr('content'), url, rel);
    assert.equal($('meta[property="og:title"]').attr('content'), $('title').text(), rel);
    assert.equal($('meta[property="og:description"]').attr('content'), desc, rel);
    assert.match($('meta[property="og:image"]').attr('content'), new RegExp(`^${origin}/assets/img/`));
    assert.equal($('meta[property="og:type"]').attr('content'), rel === 'tech-tips/index.html' ? 'website' : 'article');
    assert.equal($('h1').length, 1, `${rel}: one h1`);
  }
});

test('tips: posts carry Article JSON-LD with no ratings, reviews or result claims', () => {
  for (const p of tips.posts) {
    const $ = load(`tech-tips/${p.slug}/index.html`);
    const blocks = $('script[type="application/ld+json"]');
    assert.equal(blocks.length, 1);
    const ld = JSON.parse(blocks.text());
    assert.equal(ld['@context'], 'https://schema.org');
    assert.equal(ld['@type'], 'Article');
    assert.equal(ld.headline, p.title);
    assert.equal(ld.datePublished, p.published);
    assert.equal(ld.mainEntityOfPage['@id'], `${origin}/tech-tips/${p.slug}/`);
    assert.equal(ld.author.name, 'Lime Signalworks LLC', 'authored by the company, not a named person');
    assert.ok(!/rating|review|offer|price|result/i.test(JSON.stringify(Object.keys(ld))), 'no rating/review/offer keys');
    assert.ok(!/aggregateRating|reviewRating|"Review"|"Offer"/.test(blocks.text()));
  }
  const idx = JSON.parse(load('tech-tips/index.html')('script[type="application/ld+json"]').text());
  assert.equal(idx['@type'], 'Blog');
});

test('tips: every page carries the general-information footer note and the site disclaimers', () => {
  for (const [rel] of pages) {
    const $ = load(rel);
    const note = norm($('[data-tips-notice] p').text());
    assert.equal(note, tips.footerNote, rel);
    assert.match(note, /^General information only, not financial or investment advice\./);
    assert.match(note, /not personalized investment advice/, 'matches the site disclaimer wording');
    assert.equal($('.foot__disclaimer').length, 2, `${rel}: securities disclaimer and risk disclosure`);
  }
});

test('tips: plain how-to with numbered steps, no advice, promises, results or real names', () => {
  for (const p of tips.posts) {
    const $ = load(`tech-tips/${p.slug}/index.html`);
    assert.ok($('ol.tt-steps').length >= 2, `${p.slug}: numbered steps`);
    const text = norm($('main').text()).toLowerCase();
    for (const phrase of ['you should', 'i recommend', 'we recommend', 'i promise', 'guarantee', 'profit',
      'track record', 'sean', 'rechtman', 'rosie ib', 'rosie schwab', 'crypto', 'forex', 'futures']) {
      assert.ok(!text.includes(phrase), `${p.slug}: "${phrase}"`);
    }
    for (const broker of ['ameritrade', 'e*trade', 'etrade', 'fidelity', 'robinhood', 'webull', 'tastytrade', 'tradestation']) {
      assert.ok(!text.includes(broker), `${p.slug}: only Interactive Brokers and Schwab are named`);
    }
  }
});

test('tips: Rosie speaks only in her labelled first-person lines, never "we"', () => {
  for (const [rel] of pages) {
    const $ = load(rel);
    const lines = $('[data-voice="rosie"]');
    assert.equal(lines.length, 1, rel);
    assert.match(norm(lines.text()), /^From me, Rosie: I\b/);
    assert.ok(!/\b(we|our|us)\b/i.test(lines.text()), rel);
  }
});

test('tips: post 1 covers the broker-restart checks and the restart order', () => {
  const t = postText(tips.posts[0]);
  for (const re of [/Enable ActiveX and Socket Clients/, /7497.*TWS paper/, /7496.*TWS live/, /4002.*IB Gateway paper/,
    /4001.*IB Gateway live/, /same mode as Rosie/, /only one program can use a given id/, /two-factor \(2FA\)/,
    /your responsibility as the account holder/, /Broker app first\./, /Then Rosie\./,
    /restarting the broker app alone is usually enough/, /netstat -ano \| findstr :7497/]) {
    assert.match(t, re);
  }
  const $ = load(`tech-tips/${tips.posts[0].slug}/index.html`);
  const order = $('h2').map((_, el) => $(el).text()).get();
  assert.ok(order.indexOf('Check these first') < order.indexOf('Restart in the right order'));
});

test('tips: post 1 says Schwab asks for a new sign-in at every start, and carries the broker-messages note', () => {
  const t = postText(tips.posts[0]);
  assert.match(t, /asks for a new Schwab sign-in through your web browser each time she starts/);
  assert.match(t, /each sign-in lasts at most about 7 days/);
  assert.match(t, /no separate re-login button/);
  assert.doesNotMatch(t, /refreshed about every 7 days/);
  // The same note, word for word, as in the Rosie IB and Rosie Schwab operator docs.
  const note = 'Messages from your broker are between you and your broker. You are responsible for the notices, ' +
    'sign-ins, 2-step approvals, access settings and emails your broker sends. ' +
    "I can't tell you what to do about them, so please use your broker's own help or support.";
  assert.ok(tips.posts[0].rosie.endsWith(` ${note}`));
  const $ = load(`tech-tips/${tips.posts[0].slug}/index.html`);
  assert.ok(norm($('[data-voice="rosie"]').text()).endsWith(note));
});

test('tips: post 2 explains the prompt, answers N, and never loosens machine-wide policy', () => {
  const t = postText(tips.posts[1]);
  assert.match(t, /Execution Policy Change/);
  assert.match(t, /Answer N, or just press Enter: N is the default/);
  assert.match(t, /\.bat launchers don't ask to change any PowerShell rule/);
  assert.match(t, /Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass/);
  assert.match(t, /resets by itself when the window closes/);
  assert.doesNotMatch(t, /-Scope (LocalMachine|CurrentUser)|Unrestricted|-Force/);
  assert.doesNotMatch(t, /Set-ExecutionPolicy (RemoteSigned|Bypass|Unrestricted)\b(?! -Scope Process)/);
});

test('tips: the build gate rejects advice wording, "we" from Rosie, a missing note, odd slugs and raw HTML', () => {
  const clone = () => JSON.parse(JSON.stringify(tips));
  const bad = [
    (t) => { t.posts[0].sections[0].paragraphs.push('You should buy more when it dips.'); },
    (t) => { t.posts[1].rosie = 'From me, Rosie: we start quietly.'; },
    (t) => { t.footerNote = 'Tips.'; },
    (t) => { t.posts[0].slug = 'Bad Slug'; },
    (t) => { t.posts[0].sections[0].paragraphs.push('<a href="x">link</a>'); },
    (t) => { t.posts[0].sections[0].paragraphs.push('This guarantees a profit.'); },
  ];
  for (const mutate of bad) {
    const t = clone();
    mutate(t);
    assert.throws(() => checkTips(t), TechTipsError);
  }
  assert.doesNotThrow(() => checkTips(tips));
  assert.equal(inline('<code>x</code><script>y</script>'), '<code>x</code>&lt;script&gt;y&lt;/script&gt;');
  assert.ok(TIPS_BANNED.length > 10);
});

test('home: the footer links to Tech Tips, next to the daily market report', () => {
  const link = homepage('[data-tech-tips-link]');
  assert.equal(link.length, 1);
  assert.equal(link.attr('href'), '/tech-tips/');
  assert.equal(norm(link.text()), 'Tech Tips');
  assert.equal(link.closest('footer').length, 1);
  assert.equal(link.parent().prev().find('[data-harbor-link]').length, 1);
});

test('crawl: sitemap.xml lists the indexable pages including Tech Tips, and robots.txt blocks nothing', () => {
  const xml = readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  const $ = cheerio.load(xml, { xmlMode: true });
  const locs = $('url > loc').map((_, el) => $(el).text()).get();
  for (const [, urlPath] of pages) assert.ok(locs.includes(origin + urlPath), urlPath);
  assert.ok(locs.includes(`${origin}/`));
  assert.ok(locs.includes(`${origin}/harbor-now/`));
  assert.ok(!locs.some((l) => l.includes('rosie-demo')), 'the noindex demo is not in the sitemap');
  assert.equal(new Set(locs).size, locs.length, 'no duplicate URLs');
  for (const l of locs) assert.ok(l.startsWith(`${origin}/`) && l.endsWith('/'), l);
  const robots = readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*$/m);
  assert.doesNotMatch(robots, /^Disallow:\s*\S/m, 'nothing is disallowed');
  assert.match(robots, new RegExp(`^Sitemap: ${origin}/sitemap.xml$`, 'm'));
});
