/**
 * Rendered theme regression checks.
 *
 * A dark-mode failure was reported where html[data-theme='dark'] was set and the body
 * computed background was dark, yet the visible desktop surfaces still painted light.
 * Attribute and body checks alone cannot catch that, so this suite drives the real
 * toggle in a browser and inspects the background actually painted at representative
 * surfaces and at sample points down the page, at mobile, desktop and wide-desktop
 * widths, in both directions of the toggle.
 *
 * Every context here emulates prefers-color-scheme: dark, because Site 2 must open on
 * the light palette regardless of the visitor's operating-system preference, and must
 * not persist the toggle choice to any browser storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.THEME_TEST_PORT || 4291);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const WIDTHS = [
  { width: 1920, height: 1080, label: 'wide desktop' },
  { width: 1440, height: 900, label: 'desktop 1440' },
  { width: 1280, height: 900, label: 'desktop' },
  { width: 414, height: 896, label: 'mobile 414' },
  { width: 375, height: 812, label: 'mobile 375' },
  { width: 320, height: 640, label: 'mobile 320' },
];

/** Surfaces that must follow the active palette. Selector → description. */
const SURFACES = [
  ['html', 'root element'],
  ['body', 'body'],
  ['main#main', 'main'],
  ['.masthead', 'masthead'],
  ['.hero', 'hero'],
  ['#what-we-do', 'what we do section'],
  ['#market-report', 'market report section'],
  ['#evaluation', 'evaluation section'],
  ['#pricing', 'pricing section'],
  ['#spy-pipeline', 'SPY Pipeline section'],
  ['#how-to-begin', 'how to begin section'],
  ['.foot', 'footer'],
];

const DARK_MAX_LUMINANCE = 0.12;
const LIGHT_MIN_LUMINANCE = 0.6;

/** Injected into the page: effective painted background and relative luminance. */
const PAGE_PROBE = `
(() => {
  const parse = (value) => {
    const nums = (value.match(/[\\d.]+%?/g) || []).map((n) =>
      n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n),
    );
    if (/^color\\(/.test(value)) {
      const rgb = nums.slice(0, 3).map((n) => Math.round(n * 255));
      return [...rgb, nums[3] === undefined ? 1 : nums[3]];
    }
    const rgb = nums.slice(0, 3);
    return [...rgb, nums[3] === undefined ? 1 : nums[3]];
  };
  const luminance = ([r, g, b]) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const opaqueBackground = (el) => {
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      const parsed = parse(style.backgroundColor);
      if (!Number.isNaN(parsed[0]) && parsed[3] > 0.5) return parsed.slice(0, 3);
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        const stop = style.backgroundImage.match(/rgba?\\([^)]+\\)|color\\([^)]+\\)/);
        if (stop) {
          const fromImage = parse(stop[0]);
          if (!Number.isNaN(fromImage[0])) return fromImage.slice(0, 3);
        }
      }
      node = node.parentElement;
    }
    return null;
  };
  window.__themeProbe = {
    surface(selector) {
      const el = document.querySelector(selector);
      if (!el) return { missing: true };
      const rgb = opaqueBackground(el);
      const style = getComputedStyle(el);
      return {
        rgb,
        luminance: rgb ? luminance(rgb) : null,
        textLuminance: luminance(parse(style.color).slice(0, 3)),
      };
    },
    atPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el) return { missing: true };
      const rgb = opaqueBackground(el);
      return { tag: el.tagName, rgb, luminance: rgb ? luminance(rgb) : null };
    },
  };
})();
`;

const startServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(PORT)], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('serving')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('error', reject);
  });

/** Sample points: masthead, hero, mid page, and the far bottom-right of the viewport. */
const samplePoints = (width, height) => [
  ['masthead', Math.round(width / 2), 20],
  ['hero', Math.round(width * 0.6), Math.round(height * 0.45)],
  ['right gutter', width - 6, Math.round(height * 0.7)],
  ['bottom edge', width - 6, height - 6],
];

test('rendered theme: every surface follows the palette at 1920, 1440, 1280, 414, 375 and 320', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const { width, height, label } of WIDTHS) {
      await t.test(`${label} (${width}px)`, async () => {
        // A dark operating system is emulated throughout: the default state must
        // still be light, and the toggle must still reach both palettes.
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        const failures = [];
        page.on('pageerror', (err) => failures.push(String(err)));
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(PAGE_PROBE);

        // Light theme is the default state, despite the dark OS preference.
        for (const [selector, description] of SURFACES) {
          const probe = await page.evaluate((s) => window.__themeProbe.surface(s), selector);
          assert.ok(!probe.missing, `${description} missing at ${width}px`);
          assert.ok(
            probe.luminance !== null && probe.luminance > LIGHT_MIN_LUMINANCE,
            `light theme: ${description} painted ${JSON.stringify(probe.rgb)} (luminance ${probe.luminance}) at ${width}px`,
          );
        }

        // Toggle through the real control, exactly as a visitor would.
        await page.click('[data-theme-toggle]');
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        await page.waitForTimeout(400);
        await page.evaluate(PAGE_PROBE);

        for (const [selector, description] of SURFACES) {
          const probe = await page.evaluate((s) => window.__themeProbe.surface(s), selector);
          assert.ok(
            probe.luminance !== null && probe.luminance < DARK_MAX_LUMINANCE,
            `dark theme: ${description} still painted ${JSON.stringify(probe.rgb)} (luminance ${probe.luminance}) at ${width}px`,
          );
          assert.ok(
            probe.textLuminance > 0.4,
            `dark theme: ${description} text is not light at ${width}px`,
          );
        }

        // What is actually painted under representative points of the viewport,
        // including the wide right gutter and the bottom edge where a foreign
        // background would show through on a large desktop.
        for (const [name, x, y] of samplePoints(width, height)) {
          const probe = await page.evaluate(([px, py]) => window.__themeProbe.atPoint(px, py), [x, y]);
          assert.ok(!probe.missing, `no element at ${name} point (${x},${y}) at ${width}px`);
          assert.ok(
            probe.luminance !== null && probe.luminance < DARK_MAX_LUMINANCE,
            `dark theme: ${name} point paints ${JSON.stringify(probe.rgb)} (luminance ${probe.luminance}) at ${width}px`,
          );
        }

        // Scrolled to the end of the document, the last surface must still be dark.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(200);
        await page.evaluate(PAGE_PROBE);
        const bottom = await page.evaluate(
          ([px, py]) => window.__themeProbe.atPoint(px, py),
          [Math.round(width / 2), height - 6],
        );
        assert.ok(
          bottom.luminance !== null && bottom.luminance < DARK_MAX_LUMINANCE,
          `dark theme: document end paints ${JSON.stringify(bottom.rgb)} at ${width}px`,
        );

        // Toggling back must restore the light palette, not a mixed state.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.click('[data-theme-toggle]');
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
        await page.waitForTimeout(400);
        await page.evaluate(PAGE_PROBE);
        for (const [selector, description] of SURFACES) {
          const probe = await page.evaluate((s) => window.__themeProbe.surface(s), selector);
          assert.ok(
            probe.luminance !== null && probe.luminance > LIGHT_MIN_LUMINANCE,
            `restored light theme: ${description} painted ${JSON.stringify(probe.rgb)} at ${width}px`,
          );
        }

        assert.deepEqual(failures, [], `page errors at ${width}px`);
        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered theme: light is the default even when the OS prefers dark', async (t) => {
  // The regression this guards: the surface previously read
  // matchMedia('(prefers-color-scheme: dark)') in JS and carried a
  // @media (prefers-color-scheme: dark) block in CSS, so a visitor whose operating
  // system was set to dark landed on the dark palette. Site 2 must open light for
  // everyone. Every context below emulates a dark operating system.
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const { width, height, label } of WIDTHS) {
      await t.test(`dark OS preference, ${label} (${width}px)`, async () => {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);

        // The emulation really is in effect, otherwise this test proves nothing.
        assert.equal(
          await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches),
          true,
          'the browser must be emulating a dark operating system',
        );

        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          'light',
          `initial theme attribute must be light at ${width}px`,
        );
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
          'light',
          `initial color-scheme must be light at ${width}px`,
        );

        await page.evaluate(PAGE_PROBE);
        for (const [selector, description] of SURFACES) {
          const probe = await page.evaluate((s) => window.__themeProbe.surface(s), selector);
          assert.ok(!probe.missing, `${description} missing at ${width}px`);
          assert.ok(
            probe.luminance !== null && probe.luminance > LIGHT_MIN_LUMINANCE,
            `dark OS: ${description} painted ${JSON.stringify(probe.rgb)} (luminance ${probe.luminance}) at ${width}px`,
          );
        }
        for (const [name, x, y] of samplePoints(width, height)) {
          const probe = await page.evaluate(
            ([px, py]) => window.__themeProbe.atPoint(px, py),
            [x, y],
          );
          assert.ok(!probe.missing, `no element at ${name} point at ${width}px`);
          assert.ok(
            probe.luminance !== null && probe.luminance > LIGHT_MIN_LUMINANCE,
            `dark OS: ${name} point paints ${JSON.stringify(probe.rgb)} at ${width}px`,
          );
        }

        // No horizontal scroll at narrow widths.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        assert.ok(overflow <= 1, `horizontal overflow of ${overflow}px at ${width}px`);

        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered theme: light default survives with JavaScript disabled under a dark OS', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'load' });
    const probe = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { theme: document.documentElement.dataset.theme, scheme: s.colorScheme };
    });
    assert.equal(probe.theme, 'light', 'markup itself must declare the light theme');
    assert.equal(probe.scheme, 'light');
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered theme: toggling light→dark→light writes no browser storage', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });

    const readTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
    assert.equal(await readTheme(), 'light', 'starts light under a dark OS');

    await page.click('[data-theme-toggle]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await readTheme(), 'dark', 'toggle reaches dark');
    assert.equal(
      await page.evaluate(() => document.querySelector('[data-theme-toggle]').getAttribute('aria-label')),
      'Switch to light mode',
      'toggle label tracks the active theme',
    );

    await page.click('[data-theme-toggle]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await readTheme(), 'light', 'toggle returns to light');

    // Nothing may be persisted: no cookies and no web storage entries.
    assert.deepEqual(await context.cookies(), [], 'no cookies are set');
    const storage = await page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
      cookie: document.cookie,
    }));
    assert.deepEqual(storage.local, [], 'localStorage must stay empty');
    assert.deepEqual(storage.session, [], 'sessionStorage must stay empty');
    assert.equal(storage.cookie, '', 'document.cookie must stay empty');

    // A fresh load must therefore come back light, not remember dark.
    await page.click('[data-theme-toggle]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await readTheme(), 'light', 'reload returns to the light default');

    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered theme: the reciprocal LIME Leadership link is visible and focusable', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const { width, height, label } of [
      { width: 1440, height: 900, label: 'desktop 1440' },
      { width: 414, height: 896, label: 'mobile 414' },
      { width: 375, height: 812, label: 'mobile 375' },
      { width: 320, height: 640, label: 'mobile 320' },
    ]) {
      await t.test(`${label} (${width}px)`, async () => {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        const link = page.locator('[data-sibling-site]');

        await link.scrollIntoViewIfNeeded();
        assert.equal(await link.count(), 1, 'exactly one reciprocal link');
        assert.ok(await link.isVisible(), `reciprocal link must be visible at ${width}px`);
        assert.equal((await link.innerText()).replace(/[↗\s]+$/, '').trim(), 'LIME Leadership');
        assert.equal(await link.getAttribute('href'), 'https://limesignalworks.com');

        const box = await link.boundingBox();
        assert.ok(box.height >= 44, `target height ${box.height}px must be at least 44px`);
        assert.ok(box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1, 'within viewport');

        // Keyboard reachable, with a visible focus indicator.
        await link.focus();
        const focus = await page.evaluate(() => {
          const el = document.querySelector('[data-sibling-site]');
          const style = getComputedStyle(el);
          return {
            focused: document.activeElement === el,
            outlineWidth: style.outlineWidth,
            outlineStyle: style.outlineStyle,
          };
        });
        assert.ok(focus.focused, 'reciprocal link is keyboard focusable');
        assert.notEqual(focus.outlineStyle, 'none', 'focus outline is drawn');
        assert.ok(parseFloat(focus.outlineWidth) >= 2, 'focus outline is at least 2px');

        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered theme: the toggle does not rely on background propagation', async () => {
  // A host page or embedding wrapper may paint <html> itself. The site must still
  // paint its own canvas, so <html> carries an explicit themed background and
  // color-scheme in both palettes.
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    const light = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { bg: s.backgroundColor, scheme: s.colorScheme };
    });
    assert.notEqual(light.bg, 'rgba(0, 0, 0, 0)', 'root element must paint its own background');
    assert.equal(light.scheme, 'light');
    await page.click('[data-theme-toggle]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    const dark = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { bg: s.backgroundColor, scheme: s.colorScheme };
    });
    assert.equal(dark.bg, 'rgb(11, 20, 22)', 'root element paints the dark surface');
    assert.equal(dark.scheme, 'dark', 'color-scheme follows the chosen theme');
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: nothing overflows horizontally in either palette', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const { width, height, label } of WIDTHS) {
      await t.test(`${label} (${width}px)`, async () => {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);

        const measure = () =>
          page.evaluate(() => {
            const doc = document.documentElement.scrollWidth - window.innerWidth;
            const wide = [...document.querySelectorAll('body *')]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 && r.height === 0) return false;
                // Scroll containers are permitted to hold wider content.
                if (el.closest('.table-wrap')) return false;
                return r.right > window.innerWidth + 1 || r.left < -1;
              })
              .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
              .slice(0, 5);
            return { doc, wide };
          });

        let m = await measure();
        assert.ok(m.doc <= 1, `light: horizontal overflow of ${m.doc}px at ${width}px`);
        assert.deepEqual(m.wide, [], `light: elements outside the viewport at ${width}px`);

        await page.click('[data-theme-toggle]');
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        m = await measure();
        assert.ok(m.doc <= 1, `dark: horizontal overflow of ${m.doc}px at ${width}px`);
        assert.deepEqual(m.wide, [], `dark: elements outside the viewport at ${width}px`);

        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: the demo disclosure is visible next to the call to action before any click', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const { width, height, label } of WIDTHS) {
      await t.test(`${label} (${width}px)`, async () => {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: 'dark',
        });
        const page = await context.newPage();
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);

        const cta = page.locator('a.cta');
        const disclosure = page.locator('[data-demo-disclosure]');
        await cta.scrollIntoViewIfNeeded();

        assert.equal(await cta.count(), 1, 'exactly one call to action');
        assert.ok(await cta.isVisible(), 'the call to action is visible');
        assert.ok(await disclosure.isVisible(), 'the disclosure is visible without interaction');

        const ctaBox = await cta.boundingBox();
        const discBox = await disclosure.boundingBox();
        assert.ok(ctaBox.height >= 44, `call to action height ${ctaBox.height}px`);
        assert.ok(
          discBox.y >= ctaBox.y + ctaBox.height - 1,
          'the disclosure sits after the call to action',
        );
        assert.ok(
          discBox.y - (ctaBox.y + ctaBox.height) < 40,
          `the disclosure must be adjacent, gap was ${discBox.y - (ctaBox.y + ctaBox.height)}px`,
        );

        // Not hidden by any means the computed style could express.
        const style = await disclosure.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            display: s.display,
            visibility: s.visibility,
            opacity: s.opacity,
            height: el.getBoundingClientRect().height,
          };
        });
        assert.notEqual(style.display, 'none');
        assert.equal(style.visibility, 'visible');
        assert.ok(Number(style.opacity) > 0.95, 'the disclosure is fully opaque');
        assert.ok(style.height > 10, 'the disclosure has real height');

        assert.equal(await cta.getAttribute('href'), 'https://limesignalworks.pplx.app/');
        assert.equal(await cta.getAttribute('target'), '_blank');

        await context.close();
      });
    }
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: anchor navigation moves to each target section', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });

    const navTargets = await page.$$eval('.masthead__nav a', (els) =>
      els.map((el) => el.getAttribute('href')),
    );
    assert.ok(navTargets.length >= 5, 'the nav reflects the section order');
    for (const target of navTargets) {
      await page.click(`.masthead__nav a[href="${target}"]`);
      assert.equal(new URL(page.url()).hash, target, `nav to ${target} sets the fragment`);
      // Smooth scrolling is enabled, so poll until the section has actually arrived.
      // Either it lands clear of the sticky masthead, or the document is already at its
      // end and cannot scroll further.
      await page
        .waitForFunction((sel) => {
          const top = document.querySelector(sel).getBoundingClientRect().top;
          const header = document.querySelector('.masthead').getBoundingClientRect().height;
          const atEnd =
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
          return (top >= header - 8 && top < header + 120) || (atEnd && top < window.innerHeight);
        }, target)
        .catch(() => {
          throw new Error(`nav to ${target} never arrived`);
        });
    }

    // In-page anchors inside the body behave the same way.
    for (const href of await page.$$eval('main a[href^="#"]', (els) =>
      els.map((el) => el.getAttribute('href')),
    )) {
      const exists = await page.evaluate((sel) => Boolean(document.querySelector(sel)), href);
      assert.ok(exists, `in-page anchor ${href} resolves`);
    }

    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: keyboard order reaches every control, each with a visible focus ring', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });

    const expected = await page.$$eval('a[href], button', (els) =>
      els.map((el) => el.tagName.toLowerCase() + (el.className ? `.${el.className}` : '')),
    );

    const seen = [];
    for (let i = 0; i < expected.length; i += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return {
          id: el.tagName.toLowerCase() + (el.className ? `.${el.className}` : ''),
          outlineStyle: s.outlineStyle,
          outlineWidth: parseFloat(s.outlineWidth),
        };
      });
      assert.ok(state, `focus left the document after ${i} tabs`);
      assert.notEqual(state.outlineStyle, 'none', `no focus ring on ${state.id}`);
      assert.ok(state.outlineWidth >= 2, `focus ring on ${state.id} is thinner than 2px`);
      seen.push(state.id);
    }

    // Tab order must follow document order, with nothing skipped and nothing added.
    assert.deepEqual(seen, expected, 'tab order must equal document order');

    // The first stop is the skip link, and it moves focus into main content.
    assert.ok(seen[0].includes('skip-link'), 'the skip link is the first tab stop');

    // The toggle is operable from the keyboard, not the mouse alone.
    await page.focus('[data-theme-toggle]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.keyboard.press(' ');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');

    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: reduced motion is honoured and the toggle still works', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
    assert.equal(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      true,
      'reduced motion must be emulated for this test to mean anything',
    );

    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .map((el) => {
          const s = getComputedStyle(el);
          return [
            ...s.transitionDuration.split(','),
            ...s.animationDuration.split(','),
          ].map((v) => parseFloat(v) || 0);
        })
        .flat()
        .filter((v) => v > 0.001),
    );
    assert.deepEqual(durations, [], 'no motion may run under prefers-reduced-motion');

    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
      'auto',
      'smooth scrolling must be disabled under reduced motion',
    );

    await page.click('[data-theme-toggle]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});

test('rendered: the page is complete and usable with JavaScript disabled', async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(ORIGIN, { waitUntil: 'load' });

    // Every section, the call to action, its disclosure and the reciprocal link are
    // present in the served markup, so nothing essential depends on script.
    for (const selector of [
      'a.cta',
      '[data-demo-disclosure]',
      '[data-sibling-site]',
      '[data-securities-disclaimer]',
      '#what-we-do',
      '#market-report',
      '#pricing',
      '#spy-pipeline',
      '#how-to-begin',
      '[data-pricing-table]',
    ]) {
      assert.ok(await page.locator(selector).isVisible(), `${selector} must render without JS`);
    }
    // No control may be shown that cannot act: the toggle is script-created, so with
    // script disabled the page presents no buttons at all.
    assert.equal(await page.locator('button').count(), 0, 'no inert control without JS');
    assert.equal(
      await page.locator('[data-demo-disclosure]').innerText(),
      'Demonstration environment. Simulated data. No broker connection and no real orders. ' +
        'Not production-ready.',
      'the disclosure wording is served, not scripted',
    );
    // The toggle is the only scripted control; with script off it must still be labelled.
    assert.equal(
      await page.locator('[data-theme-toggle]').count(),
      0,
      'the toggle is absent when the script that operates it has not run',
    );
    await context.close();
  } finally {
    await browser.close();
    server.kill();
  }
});
