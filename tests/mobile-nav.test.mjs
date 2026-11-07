/**
 * Narrow-screen masthead menu: collapsed by default, reopened from a labelled button,
 * every link still reachable. Desktop keeps the links visible and shows no button.
 * Without JavaScript the links stay in the page. Only .masthead__nav is collapsed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.NAV_TEST_PORT || 4293);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const startServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', (c) => {
      if (String(c).includes('serving')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
  });

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('mobile nav: Harbor Now and the homepage collapse only the masthead links', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    await t.test('phones start collapsed, links reopen, Harbor content stays', async () => {
      for (const width of [360, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 800 } });
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/harbor-now/`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);

        const button = page.locator('[data-nav-toggle]');
        assert.equal(await button.count(), 1, `menu button at ${width}`);
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
        assert.equal(await button.getAttribute('aria-controls'), 'masthead-nav');
        assert.equal(await button.getAttribute('aria-label'), 'Open menu');
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `button target at ${width}`);

        const closed = await page.evaluate(() => {
          const nav = document.querySelector('.masthead__nav');
          const header = document.querySelector('.masthead').getBoundingClientRect();
          const h1 = document.querySelector('h1').getBoundingClientRect();
          const notice = document.querySelector('[data-harbor-notice]').getBoundingClientRect();
          const archive = document.querySelector('[data-harbor-archive]');
          return {
            hidden: nav.hasAttribute('hidden'),
            display: getComputedStyle(nav).display,
            links: nav.querySelectorAll('a').length,
            headerH: header.height,
            h1Top: h1.top,
            headerBottom: header.bottom,
            noticeTop: notice.top,
            archiveLinks: archive.querySelectorAll('a').length,
            theme: document.documentElement.dataset.theme,
          };
        });
        assert.equal(closed.hidden, true, `nav hidden at ${width}`);
        assert.equal(closed.display, 'none');
        assert.equal(closed.links, 3);
        assert.equal(closed.theme, 'light', 'Harbor Now keeps its light default');
        assert.ok(closed.headerH < (width === 390 ? 100 : 160), `header ${closed.headerH}px at ${width}`);
        assert.ok(closed.h1Top >= closed.headerBottom - 1, 'the title is not under the header');
        assert.ok(closed.h1Top < 800, 'the title is on the first screen');
        assert.ok(closed.noticeTop < 800, 'the notice is on the first screen');
        assert.ok(closed.archiveLinks >= 47, 'the archive is still in the page');
        assert.ok((await overflow(page)) <= 1, `overflow at ${width}`);

        await button.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded') === 'true');
        const labels = await page.locator('.masthead__nav a').allInnerTexts();
        assert.deepEqual(labels.map((s) => s.trim()), ['Home', 'Daily market report', 'Archive']);
        for (const link of await page.locator('.masthead__nav a').all()) {
          assert.ok(await link.isVisible());
          const linkBox = await link.boundingBox();
          assert.ok(linkBox.height >= 44, 'open link target');
        }
        assert.equal(await button.getAttribute('aria-label'), 'Close menu');
        assert.ok((await overflow(page)) <= 1, `open overflow at ${width}`);

        await page.keyboard.press('Tab');
        const onLink = await page.evaluate(() => document.activeElement.closest('.masthead__nav a')?.textContent.trim());
        assert.equal(onLink, 'Home', 'the first link is the next tab stop');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded') === 'false');
        assert.equal(
          await page.evaluate(() => document.activeElement.getAttribute('data-nav-toggle')),
          '',
          'Escape returns focus to the menu button',
        );
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.masthead__nav')).display), 'none');

        await context.close();
      }
    });

    await t.test('homepage phones collapse the section links and can reach every one', async () => {
      for (const width of [360, 390, 320]) {
        const context = await browser.newContext({
          viewport: { width, height: 800 },
          colorScheme: 'light',
        });
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
        assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'false');
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.querySelector('.masthead__nav')).display),
          'none',
        );
        assert.ok((await overflow(page)) <= 1, `home overflow at ${width}`);
        const intro = await page.locator('[data-rosie-intro]').boundingBox();
        const header = await page.locator('.masthead').boundingBox();
        assert.ok(intro.y >= header.y + header.height - 1, 'the introduction is not covered');

        await page.click('[data-nav-toggle]');
        const hrefs = await page.locator('.masthead__nav a').evaluateAll((els) =>
          els.map((el) => el.getAttribute('href')),
        );
        assert.ok(hrefs.length >= 11, 'every section link is still in the menu');
        for (const href of hrefs) assert.ok(href.startsWith('#'), href);
        assert.ok((await overflow(page)) <= 1, `home open overflow at ${width}`);

        const last = page.locator('.masthead__nav a').last();
        await last.focus();
        const lastBox = await last.boundingBox();
        assert.ok(lastBox, 'the last link can be focused');
        assert.ok(lastBox.y >= 0 && lastBox.y + lastBox.height <= 800, 'the last link scrolls into view');

        await page.click('.masthead__nav a[href="#pricing"]');
        await page.waitForFunction(() => location.hash === '#pricing');
        await page.waitForFunction(() => document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded') === 'false');
        await page
          .waitForFunction(() => {
            const top = document.querySelector('#pricing').getBoundingClientRect().top;
            const headerH = document.querySelector('.masthead').getBoundingClientRect().height;
            const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
            return (top >= headerH - 8 && top < headerH + 140) || (atEnd && top < window.innerHeight);
          })
          .catch(() => {
            throw new Error(`pricing did not clear the compact header at ${width}`);
          });
        await context.close();
      }
    });

    await t.test('desktop keeps the links and does not show a menu button', async () => {
      for (const [path, width] of [
        ['/harbor-now/', 1280],
        ['/harbor-now/2026-09-29/', 1440],
        ['/', 1280],
      ]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('[data-nav-toggle]').count(), 0, `no button on ${path} at ${width}`);
        assert.equal(await page.locator('html').getAttribute('data-nav-ready'), null);
        const nav = await page.evaluate(() => {
          const el = document.querySelector('.masthead__nav');
          const box = el.getBoundingClientRect();
          return {
            hidden: el.hasAttribute('hidden'),
            display: getComputedStyle(el).display,
            links: el.querySelectorAll('a').length,
            h: box.height,
            w: box.width,
          };
        });
        assert.equal(nav.hidden, false);
        assert.notEqual(nav.display, 'none');
        assert.ok(nav.links >= 3);
        assert.ok(nav.h > 20 && nav.h < 80, `desktop nav height ${nav.h}`);
        assert.ok(nav.w > 200, 'desktop nav stays in the header band');
        assert.ok((await overflow(page)) <= 1);
        await context.close();
      }
    });

    await t.test('without JavaScript the links stay visible and no button is shown', async () => {
      for (const path of ['/harbor-now/', '/']) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 800 },
          javaScriptEnabled: false,
        });
        const page = await context.newPage();
        await page.goto(ORIGIN + path, { waitUntil: 'load' });
        assert.equal(await page.locator('button').count(), 0);
        assert.equal(await page.locator('[data-nav-toggle]').count(), 0);
        const nav = page.locator('.masthead__nav');
        assert.ok(await nav.isVisible());
        assert.ok((await nav.locator('a').count()) >= 3);
        await context.close();
      }
    });
  } finally {
    await browser.close();
    server.kill();
  }
});
