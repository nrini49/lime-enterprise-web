/**
 * New window (2026-11-01): every link that leaves the current page opens in a new window,
 * so focus is not lost and both windows stay open for reference. Scans every built and
 * static HTML page in the repo (run after `npm run build`). Same-page anchors (#...),
 * mailto: and tel: links are exempt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'tests', 'src', 'data', 'scripts']);

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

const EXEMPT = /^(#|mailto:|tel:)/i;
const files = htmlFiles(root);

test('links: the scan covers the home page, Harbor Now and the demo', () => {
  const rel = files.map((f) => path.relative(root, f));
  for (const page of ['index.html', 'harbor-now/index.html', 'rosie-demo/index.html']) {
    assert.ok(rel.includes(page), `${page} is scanned`);
  }
  assert.ok(rel.filter((r) => r.startsWith('harbor-now/')).length > 1, 'Harbor Now editions are scanned');
});

test('links: every link that leaves the page opens in a new window with noopener', () => {
  const missing = [];
  let checked = 0;
  for (const file of files) {
    const $ = cheerio.load(readFileSync(file, 'utf8'));
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href').trim();
      if (EXEMPT.test(href)) return;
      checked += 1;
      const target = $(el).attr('target');
      const rel = ($(el).attr('rel') || '').split(/\s+/);
      if (target !== '_blank' || !rel.includes('noopener')) {
        missing.push(`${path.relative(root, file)}: ${href}`);
      }
    });
  }
  assert.ok(checked > 0, 'some page-leaving links were checked');
  assert.deepEqual(missing, [], `links without target="_blank" rel="noopener":\n${missing.join('\n')}`);
});

test('links: same-page anchors, mailto: and tel: stay in the same window', () => {
  for (const file of files) {
    const $ = cheerio.load(readFileSync(file, 'utf8'));
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href').trim();
      if (!EXEMPT.test(href)) return;
      assert.equal($(el).attr('target'), undefined, `${path.relative(root, file)}: ${href} keeps the same window`);
    });
  }
});
