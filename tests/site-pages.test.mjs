/**
 * The four-page site (2026-11-22, owner approval t1954u): Home, How Rosie Works,
 * Harbor Now and Blog. Every page carries the same masthead menu, one h1, and only links
 * and assets that resolve to real files, so the output can be uploaded to any static
 * host as plain files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(path.join(root, 'data/homepage.json'), 'utf8'));
const blog = JSON.parse(readFileSync(path.join(root, 'data/blog.json'), 'utf8'));
const { pages, sectionOrder } = data;
const load = (file) => cheerio.load(readFileSync(path.join(root, file), 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

test('site: four pages, each built to its folder', () => {
  assert.deepEqual(pages.map((p) => p.file), ['index.html', 'how-rosie-works/index.html', 'harbor-now/index.html', 'blog/index.html']);
  for (const p of pages) assert.ok(existsSync(path.join(root, p.file)), `${p.file} exists`);
});

test('site: every page has the same four-link menu, with itself marked current', () => {
  for (const p of pages) {
    const $ = load(p.file);
    const links = $('.masthead__nav a')
      .map((_, el) => ({ text: norm($(el).text()), href: $(el).attr('href'), current: $(el).attr('aria-current') || null, target: $(el).attr('target') || null }))
      .get();
    assert.deepEqual(links.map((l) => l.text), pages.map((x) => x.nav), `${p.file}: menu labels`);
    links.forEach((l, i) => {
      if (pages[i].id === p.id) {
        assert.deepEqual([l.href, l.current], ['#main', 'page'], `${p.file}: own entry`);
      } else {
        assert.deepEqual([l.href, l.current, l.target], [pages[i].path, null, null], `${p.file}: link to ${pages[i].id}`);
      }
    });
    assert.equal($('.masthead__nav').attr('aria-label'), 'Site pages');
  }
});

test('site: one h1 per page, and each page holds exactly its sections', () => {
  for (const p of pages) {
    const $ = load(p.file);
    assert.equal($('h1').length, 1, `${p.file}: one h1`);
    const expected = sectionOrder.filter((s) => s.page === p.id).map((s) => s.id);
    const rendered = $('main section[id]').map((_, el) => $(el).attr('id')).get();
    assert.deepEqual(rendered, expected, `${p.file}: sections`);
  }
});

test('site: Home is the short page; How Rosie Works ends with the indicators', () => {
  const words = (file) => norm(load(file)('main').text()).split(' ').length;
  const home = words('index.html');
  const how = words('how-rosie-works/index.html');
  assert.ok(home < how, `Home (${home} words) is shorter than How Rosie Works (${how})`);
  assert.equal(load('how-rosie-works/index.html')('main section[id]').last().attr('id'), 'indicators');
});

test('site: links to another page and its sections resolve', () => {
  for (const p of pages) {
    const $ = load(p.file);
    $('a[href^="/"]').each((_, el) => {
      const href = $(el).attr('href');
      const [pathPart, hash] = href.split('#');
      const file = path.join(root, pathPart.endsWith('/') ? `${pathPart}index.html` : pathPart);
      assert.ok(existsSync(file) && statSync(file).isFile(), `${p.file}: ${href} has a file behind it`);
      if (hash && file.endsWith('.html')) {
        const other = cheerio.load(readFileSync(file, 'utf8'));
        assert.equal(other(`#${hash}`).length, 1, `${p.file}: ${href} target exists`);
      }
    });
  }
});

test('site: assets are root-relative files that exist, with no host-specific paths', () => {
  for (const p of pages) {
    const html = readFileSync(path.join(root, p.file), 'utf8');
    const $ = cheerio.load(html);
    $('[src], link[href], video[poster]').each((_, el) => {
      for (const attr of ['src', 'href', 'poster']) {
        const v = $(el).attr(attr);
        if (!v || v.startsWith('data:') || el.tagName === 'a') continue;
        assert.ok(v.startsWith('/'), `${p.file}: ${attr}="${v}" is root-relative`);
        assert.ok(existsSync(path.join(root, v)), `${p.file}: ${v} exists`);
      }
    });
    assert.ok(!/\/_vercel|\/api\//.test(html), `${p.file}: no host-specific endpoints`);
  }
});

test('blog: an honest empty state until a real post exists, and no comment form', () => {
  const $ = load('blog/index.html');
  assert.equal(norm($('h1').text()), 'Blog');
  if (blog.posts.length === 0) {
    assert.equal($('[data-blog-empty]').length, 1, 'the coming-soon note shows');
    assert.match(norm($('[data-blog-empty]').text()), /Posts are coming soon\./);
    assert.equal($('[data-blog-posts] li').length, 0, 'no invented posts');
  } else {
    assert.equal($('[data-blog-posts] li').length, blog.posts.length);
  }
  assert.equal($('form, input, textarea, select').length, 0, 'no comment backend or form yet');
});

test('harbor: the "Latest from the blog" strip closes the Harbor Now page', () => {
  const $ = load('harbor-now/index.html');
  const strip = $('[data-blog-strip]');
  assert.equal(strip.length, 1);
  assert.ok(strip.is($('main > section').last()), 'the strip is the last section on the page');
  assert.equal(norm(strip.find('h2').text()), 'Latest from the blog');
  assert.equal(strip.find('a[href="/blog/"]').length, 1);
  if (blog.posts.length === 0) assert.equal(strip.find('[data-blog-strip-empty]').length, 1);
  // The report itself is unchanged: latest edition and the full archive.
  assert.ok($('[data-harbor-archive] li').length >= 47);
});

test('site: no page names anyone outside the approved credits', () => {
  for (const p of pages) {
    const text = norm(load(p.file)('body').text()).toLowerCase();
    for (const name of ['sean', 'rechtman']) assert.ok(!text.includes(name), `${p.file} names "${name}"`);
  }
});

// 2026-11-22 (owner t1991u): the first, pinned post anchors the blog. Shown in full, by Noal,
// ending with a "Share your experience" link to the contact section (no comment box yet).
test('blog: the pinned first post is shown in full, by Noal, with a link to share an experience', () => {
  const $ = load('blog/index.html');
  const first = $('[data-blog-posts] > li').first();
  assert.equal(first.attr('data-blog-post'), 'who-judges-rosies-rules');
  assert.equal(first.find('[data-pinned]').length, 1, 'marked as pinned');
  assert.equal(norm(first.find('h3').text()), "Who judges whether Rosie's rules work?");
  assert.equal(first.find('time').attr('datetime'), '2026-11-22');
  assert.equal(norm(first.find('time').text()), 'November 22, 2026');
  assert.equal(norm(first.find('[data-attribution]').text()), 'Noal');
  assert.equal(first.attr('data-voice'), 'noal');
  assert.equal(
    norm(first.find('article > p').not('.label').not('.btn-row').text()),
    "Who judges whether a trading rule works? Not me, and not Rosie. Whether she follows the rules exactly can be checked today. Whether the rules are worth having only shows up over many trades, in real markets, in your own records. That's where you come in. Tell us what you saw: a stop that saved you, a rule that felt too tight, a day you didn't have to watch. Your experience is the test.",
  );
  const share = first.find('a[data-share-experience]');
  assert.equal(norm(share.text()), 'Share your experience');
  assert.equal(share.attr('href'), '#contact');
  assert.equal(share.attr('target'), undefined);
  assert.equal($('#contact').length, 1, 'the contact section is on the page');
  assert.equal($('form, input, textarea, select, button').length, 0, 'no fake comment box');
});
