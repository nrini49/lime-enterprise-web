/** Tech Tips pages in a real browser: no horizontal scroll at 1366 and 390, in both palettes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TIPS_TEST_PORT || 4293);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const tips = JSON.parse(readFileSync(path.join(root, 'data', 'tech-tips.json'), 'utf8'));
const PATHS = ['/tech-tips/', ...tips.posts.map((p) => `/tech-tips/${p.slug}/`), '/robots.txt'];

const startServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', (c) => {
      if (String(c).includes('serving')) { clearTimeout(timer); resolve(child); }
    });
    child.on('error', reject);
  });

test('tech tips rendered: no horizontal overflow, no failed requests, styles applied, at 1366 and 390', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const width of [1366, 390]) {
      for (const p of PATHS.filter((x) => x.endsWith('/'))) {
        await t.test(`${p} at ${width}px`, async () => {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await context.newPage();
          const failed = [];
          page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
          page.on('requestfailed', (r) => failed.push(`failed ${r.url()}`));
          await page.goto(ORIGIN + p, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          for (const theme of ['light', 'dark']) {
            if (theme === 'dark') {
              await page.click('[data-theme-toggle]');
              await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
            }
            const doc = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            assert.ok(doc <= 1, `${theme}: horizontal overflow ${doc}px`);
          }
          assert.deepEqual(failed, []);
          assert.ok(await page.isVisible('[data-tips-notice]'), 'footer note is visible');
          const border = await page.$eval('.tt-rosie', (el) => getComputedStyle(el).borderLeftWidth);
          assert.equal(border, '4px', 'tech-tips.css is applied');
          await context.close();
        });
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
});
