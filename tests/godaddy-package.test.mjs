/**
 * GoDaddy public_html packaging (draft PR #30): the Apache .htaccess must match
 * vercel.json, the 404 page must stay in the site's style without new promises,
 * and the export must ship only public files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import * as cheerio from 'cheerio';
import { htaccessText, redirectRule } from '../scripts/htaccess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const data = JSON.parse(read('data/homepage.json'));
const { redirects } = JSON.parse(read('vercel.json'));

test('htaccess: committed file matches vercel.json plus the GoDaddy rules', () => {
  const expected = htaccessText(redirects);
  assert.equal(read('.htaccess'), expected, '.htaccess is generated, not hand-edited');
  const text = read('.htaccess');
  assert.match(text, /^Options -Indexes$/m);
  assert.match(text, /^DirectoryIndex index\.html$/m);
  assert.match(text, /^ErrorDocument 404 \/404\.html$/m);
  assert.match(text, /RewriteCond %\{HTTP_HOST\} \^limesignalworks\\\.com\$ \[NC\]/);
  assert.match(text, /RewriteRule \^ https:\/\/www\.limesignalworks\.com%\{REQUEST_URI\} \[R=308,L\]/);
  assert.match(text, /RewriteCond %\{HTTPS\} !=on/);
  assert.match(text, /RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/);
  assert.match(text, /RewriteRule \^\(data\|src\|tests\|scripts\|node_modules\)\(\/\|\$\) - \[F,L\]/);
  assert.match(text, /RewriteRule \^\\\.git - \[F,L\]/);
  for (const r of redirects) {
    assert.ok(text.includes(redirectRule(r)), `missing rule for ${r.source} → ${r.destination}`);
  }
  const harborIdx = text.indexOf('RewriteRule ^data/harbor(/.*)?$ /harbor-now/ [R=302,L]');
  const blockIdx = text.indexOf('RewriteRule ^(data|src|tests|scripts|node_modules)');
  assert.ok(harborIdx !== -1 && blockIdx !== -1 && harborIdx < blockIdx, '/data/harbor redirect sits above the /data/ block');
});

test('404: branded page, dark default, noindex, no forms, no promises', () => {
  const html = read('404.html');
  const $ = cheerio.load(html);
  assert.equal($('html').attr('data-theme'), 'dark');
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
  assert.equal($('meta[name="color-scheme"]').attr('content'), 'dark');
  assert.equal($('h1').length, 1);
  assert.match($('h1').text(), /This page isn't here/);
  assert.equal($('[data-voice="rosie"]').length, 1);
  assert.equal($('form, input, textarea, select, button').length, 0);
  assert.ok($('a[href="/"]').length >= 1, '404 links back to home');
  const nav = $('.masthead__nav a')
    .map((_, el) => ({ text: $(el).text().trim(), href: $(el).attr('href'), current: $(el).attr('aria-current') || null }))
    .get();
  assert.deepEqual(
    nav.map((l) => [l.text, l.href, l.current]),
    data.pages.map((p) => [p.nav, p.path, null]),
  );
  const body = $('body').text().toLowerCase();
  for (const name of ['sean', 'rechtman']) assert.ok(!body.includes(name), `404 names "${name}"`);
  for (const phrase of [
    'profit',
    'guaranteed',
    'safety suit',
    'microsoft certified',
    "you'll make",
    'you will make',
  ]) {
    assert.ok(!body.includes(phrase), `404 must not say "${phrase}"`);
  }
  assert.equal($('[data-securities-disclaimer]').length, 1);
  assert.ok($('[data-risk-disclosure]').length === 1);
  assert.ok($('[data-contact-phone]').length === 1);
  $('a[href^="/"]').each((_, el) => {
    const href = $(el).attr('href');
    const file = path.join(root, href.endsWith('/') ? `${href}index.html` : href);
    assert.ok(existsSync(file), `404 link ${href} has a file behind it`);
  });
  assert.ok(!/\/_vercel|\/api\//.test(html), '404 has no host-specific endpoints');
});

test('export: public_html set has the pages and .htaccess, not source or previews', () => {
  const dest = mkdtempSync(path.join(os.tmpdir(), 'lime-export-'));
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts', 'export-static.mjs'), dest], {
      cwd: root,
      stdio: 'pipe',
    });
    const must = [
      'index.html',
      '404.html',
      '.htaccess',
      'how-rosie-works/index.html',
      'harbor-now/index.html',
      'blog/index.html',
      'get-rosie/index.html',
      'rosie-demo/index.html',
      'rosie-demo-schwab/index.html',
      'assets/css/site.css',
      'assets/js/app.js',
    ];
    for (const rel of must) {
      assert.ok(existsSync(path.join(dest, rel)), `export includes ${rel}`);
    }
    assert.equal(readFileSync(path.join(dest, '.htaccess'), 'utf8'), read('.htaccess'));
    const forbidden = [
      'preview',
      'preview/evidence',
      'data',
      'src',
      'tests',
      'scripts',
      'node_modules',
      'package.json',
      'vercel.json',
      'README.md',
      'CNAME',
    ];
    for (const rel of forbidden) {
      assert.equal(existsSync(path.join(dest, rel)), false, `export must omit ${rel}`);
    }
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});
