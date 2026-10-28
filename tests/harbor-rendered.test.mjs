/** Harbor Now pages in a real browser: no horizontal scroll at 1366 and 390, in both palettes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.HARBOR_TEST_PORT || 4292);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const dates = readdirSync(path.join(root, 'harbor-now')).filter((f) => /^\d{4}-/.test(f)).sort();
const PATHS = ['/harbor-now/', `/harbor-now/${dates[0]}/`, `/harbor-now/${dates[Math.floor(dates.length / 2)]}/`, `/harbor-now/${dates.at(-1)}/`];

const startServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', (c) => {
      if (String(c).includes('serving')) { clearTimeout(timer); resolve(child); }
    });
    child.on('error', reject);
  });

test('harbor rendered: no horizontal overflow, no failed requests, at 1366 and 390', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const width of [1366, 390]) {
      for (const p of PATHS) {
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
          assert.ok(await page.isVisible('[data-harbor-notice]'), 'notice is visible');
          await context.close();
        });
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
});
