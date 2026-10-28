/**
 * Harbor Now: the daily market report pages under /harbor-now/.
 * Validates the build of data/harbor/*.data.json into harbor-now/ (run after `npm run build`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {
  HARBOR_NOTICE,
  DROPPED_FIELDS,
  buildHarbor,
  staleNote,
  prettyDate,
  longDate,
  publicClusterLine,
  publicEdition,
  scrub,
  looksDirective,
  adviceHits,
  HarborVoiceError,
  VOICE_DIR,
  CANON_REWRITTEN,
  canonLines,
} from '../src/harbor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data', 'harbor');
const dates = readdirSync(dataDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.data\.json$/.test(f))
  .map((f) => f.slice(0, 10))
  .sort();
const raw = (d) => JSON.parse(readFileSync(path.join(dataDir, `${d}.data.json`), 'utf8'));
const voiceDir = path.join(root, VOICE_DIR);
const voice = (d) => {
  const f = path.join(voiceDir, `${d}.json`);
  if (!existsSync(f)) return { rewrites: {}, descriptive: [] };
  const v = JSON.parse(readFileSync(f, 'utf8'));
  return { rewrites: v.rewrites || {}, descriptive: v.descriptive || [] };
};
/** The edition as it renders: allowlisted and in the site's voice. */
const voiced = (d) => publicEdition(d, raw(d), voice(d));
const load = (rel) => cheerio.load(readFileSync(path.join(root, rel), 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const pages = ['harbor-now/index.html', ...dates.map((d) => `harbor-now/${d}/index.html`)];
const homepage = cheerio.load(readFileSync(path.join(root, 'index.html'), 'utf8'));

/** Visible text: what a reader sees, without scripts or screen-reader-only copy. */
const visible = ($) => {
  const c = cheerio.load($.html());
  c('script, style').remove();
  return norm(c('body').text());
};

test('harbor: the data files are the copied lime-web-public archive, 47 editions', () => {
  assert.equal(dates.length, 47);
  assert.equal(dates[0], '2026-07-13');
  assert.equal(dates.at(-1), '2026-09-29');
});

test('harbor: the index and every archive date have a built page', () => {
  assert.ok(existsSync(path.join(root, 'harbor-now/index.html')), 'harbor-now/index.html is built');
  for (const d of dates) {
    assert.ok(existsSync(path.join(root, `harbor-now/${d}/index.html`)), `missing page for ${d}`);
  }
  const built = readdirSync(path.join(root, 'harbor-now')).filter((f) => /^\d{4}-/.test(f));
  assert.deepEqual(built.sort(), dates, 'no page without a data file, no data file without a page');
});

test('harbor: the index lists every edition, newest first, each linking to its page', () => {
  const $ = load('harbor-now/index.html');
  const hrefs = $('[data-harbor-archive] a')
    .map((_, el) => $(el).attr('href'))
    .get();
  assert.deepEqual(hrefs, [...dates].reverse().map((d) => `/harbor-now/${d}/`));
});

test('harbor: the latest edition is featured with its date shown clearly', () => {
  const $ = load('harbor-now/index.html');
  const latest = dates.at(-1);
  const stamp = $('[data-harbor-date] time');
  assert.equal(stamp.attr('datetime'), latest);
  assert.equal(norm(stamp.text()), longDate(latest));
  assert.equal(norm($('.hn-title').first().text()), voiced(latest).title);
});

test('harbor: every page carries the exact notice, visible and not collapsed', () => {
  for (const rel of pages) {
    const $ = load(rel);
    const n = $('[data-harbor-notice]');
    assert.equal(n.length, 1, `${rel}: exactly one notice block`);
    assert.equal(norm(n.find('p').text()), HARBOR_NOTICE, `${rel}: notice wording`);
    assert.equal(n.closest('details, dialog, [hidden], .sr-only, [aria-hidden]').length, 0, `${rel}: notice is visible`);
    assert.equal(n.closest('main').length, 1, `${rel}: notice sits in the main content`);
    // It comes before the report content.
    const order = $('main').find('[data-harbor-notice], [data-harbor-table]').map((_, el) => $(el).is('[data-harbor-notice]')).get();
    assert.equal(order[0], true, `${rel}: notice precedes the report`);
  }
});

test('harbor: pages are indexable, and only because the notice is present', () => {
  for (const rel of pages) {
    const $ = load(rel);
    assert.equal($('meta[name="robots"]').attr('content'), 'index, follow', rel);
    assert.equal($('[data-harbor-notice]').length, 1, `${rel}: indexable page without the notice`);
  }
});

test('harbor: each edition page shows its own date and its market table', () => {
  for (const d of dates) {
    const $ = load(`harbor-now/${d}/index.html`);
    const stamp = $('[data-harbor-date] time');
    assert.equal(stamp.attr('datetime'), d);
    assert.equal(norm(stamp.text()), longDate(d));
    assert.ok($('title').text().includes(prettyDate(d)), `${d}: title names the date`);
    assert.equal($('h1').length, 1, `${d}: one h1`);
    const syms = $('[data-harbor-table] tbody th .sym').map((_, el) => $(el).text()).get();
    assert.deepEqual(syms, ['SPY', 'QQQ', 'DIA', 'IWM'], `${d}: market table`);
    const r = raw(d);
    const text = visible($);
    for (const k of ['spy', 'qqq', 'dia', 'iwm']) {
      assert.ok(text.includes(r.weather[k].price), `${d}: ${k} price`);
    }
    assert.ok(text.includes(r.weather.sentiment.label), `${d}: sentiment`);
    const ed = voiced(d);
    assert.ok(text.includes(ed.volatility), `${d}: VIX line`);
    assert.ok(text.includes(ed.tone), `${d}: tone`);
  }
});

test('harbor: account, broker, mission, checklist and closing-line fields never render', () => {
  for (const d of dates) {
    const r = raw(d);
    const $ = load(`harbor-now/${d}/index.html`);
    const html = $.html();
    const text = visible($);
    for (const field of ['account', 'checklist']) {
      for (const line of r[field] || []) {
        assert.ok(!text.includes(line), `${d}: ${field} line rendered: ${line}`);
      }
    }
    if (r.body_muted) assert.ok(!text.includes(r.body_muted), `${d}: body_muted rendered`);
    if (r._sources) assert.ok(!text.includes(String(r._sources).slice(0, 40)), `${d}: _sources rendered`);
    for (const word of [
      /broker status/i, /schwab/i, /\bIB\b/, /interactive brokers/i, /mission for today/i,
      /account &(amp;)? behavior stance/i, /operations checklist/i, /behavior rule/i,
      /overnight positions/i, /rosie is the pilot/i, /admiral/i,
    ]) {
      assert.ok(!word.test(text), `${d}: dropped material on the page: ${word}`);
    }
    assert.ok(!/\bD?U\d{5,}\b|\b\d{7,}\b/.test(html), `${d}: account-number shape in the page`);
  }
});

test('harbor: the drop list documents exactly the non-public fields', () => {
  assert.deepEqual(
    Object.keys(DROPPED_FIELDS).sort(),
    ['_sources', 'account', 'body_muted', 'checklist', 'cluster clauses', 'cluster["Behavior rule: …"]'].sort(),
  );
});

test('harbor: cluster lines keep the description and lose directives', () => {
  assert.equal(publicClusterLine('Behavior rule: do not chase a range, wait for the break'), null);
  assert.equal(
    publicClusterLine('Secondary catalyst: Lennar (LEN) is scheduled to report tomorrow; review the event, do not chase it'),
    'Secondary catalyst: Lennar (LEN) is scheduled to report tomorrow',
  );
  assert.equal(
    publicClusterLine('Leadership lane: QQQ rose 0.20%, the only tracked fund higher; SPY, DIA, and IWM declined'),
    'Leadership lane: QQQ rose 0.20%, the only tracked fund higher; SPY, DIA, and IWM declined',
  );
  assert.equal(scrub('Account U1234567 and DU7654321'), 'Account [redacted] and [redacted]');
});

test('harbor: the restart note appears only when the latest edition is more than 3 days old', async () => {
  const latest = dates.at(-1);
  const plus = (n) => new Date(Date.parse(`${latest}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const canonical = JSON.parse(readFileSync(path.join(root, 'data/homepage.json'), 'utf8')).canonical;
  const tmp = mkdtempSync(path.join(tmpdir(), 'harbor-'));
  mkdirSync(path.join(tmp, 'data'), { recursive: true });
  cpSync(dataDir, path.join(tmp, 'data', 'harbor'), { recursive: true });
  cpSync(voiceDir, path.join(tmp, VOICE_DIR), { recursive: true });
  const prev = process.env.HARBOR_NOW_TODAY;
  try {
    for (const [days, expected] of [[0, false], [3, false], [4, true], [29, true]]) {
      process.env.HARBOR_NOW_TODAY = plus(days);
      const res = await buildHarbor(tmp, canonical);
      assert.equal(res.stale, expected, `${days} days old`);
      for (const rel of ['harbor-now/index.html', `harbor-now/${latest}/index.html`, `harbor-now/${dates[0]}/index.html`]) {
        const $ = cheerio.load(readFileSync(path.join(tmp, rel), 'utf8'));
        const note = $('[data-harbor-stale]');
        assert.equal(note.length, expected ? 1 : 0, `${rel} at ${days} days`);
        if (expected) {
          assert.equal(norm(note.text()), staleNote(latest));
          assert.equal(norm(note.text()), `Latest edition: ${prettyDate(latest)}. Publishing is being restarted.`);
        }
        assert.equal($('[data-harbor-notice]').length, 1);
      }
    }
  } finally {
    if (prev === undefined) delete process.env.HARBOR_NOW_TODAY;
    else process.env.HARBOR_NOW_TODAY = prev;
  }
});

test('harbor: no signup, form, capture or alerts promise on any page', () => {
  for (const rel of pages) {
    const $ = load(rel);
    assert.equal($('form, input, textarea, select, button').length, 0, `${rel}: no form controls`);
    const text = visible($).toLowerCase();
    for (const phrase of ['subscribe', 'sign up', 'newsletter', 'notify me', 'get alerts', 'daily alerts', 'alert me', 'join the list']) {
      assert.ok(!text.includes(phrase), `${rel}: "${phrase}"`);
    }
    assert.ok(!/will (resume|return) on|back on [a-z]+ \d/i.test(text), `${rel}: no promised restart date`);
  }
});

test('harbor: every link and asset on the pages resolves to a built file', () => {
  const resolve = (href) => {
    const clean = href.split('#')[0];
    const rel = clean.endsWith('/') ? `${clean}index.html` : clean;
    return path.join(root, rel.replace(/^\//, ''));
  };
  for (const rel of pages) {
    const $ = load(rel);
    const ids = new Set($('[id]').map((_, el) => $(el).attr('id')).get());
    $('a[href], link[href], script[src], img[src]').each((_, el) => {
      const ref = $(el).attr('href') || $(el).attr('src');
      if (/^data:/.test(ref)) return;
      assert.ok(!/^(https?:)?\/\//.test(ref), `${rel}: off-origin reference ${ref}`);
      if (ref.startsWith('#')) {
        assert.ok(ids.has(ref.slice(1)), `${rel}: anchor ${ref} has no target`);
        return;
      }
      assert.ok(ref.startsWith('/'), `${rel}: root-relative reference expected, got ${ref}`);
      assert.ok(existsSync(resolve(ref)), `${rel}: broken reference ${ref}`);
      const frag = ref.split('#')[1];
      if (frag) {
        const target = cheerio.load(readFileSync(resolve(ref), 'utf8'));
        assert.equal(target(`#${frag}`).length, 1, `${rel}: ${ref} fragment has no target`);
      }
    });
    const ids2 = $('[id]').map((_, el) => $(el).attr('id')).get();
    assert.equal(new Set(ids2).size, ids2.length, `${rel}: duplicate ids`);
  }
});

test('harbor: heading levels never skip on any page', () => {
  for (const rel of pages) {
    const $ = load(rel);
    const levels = $('h1, h2, h3, h4, h5, h6').map((_, el) => Number(el.tagName[1])).get();
    assert.equal(levels[0], 1, `${rel}: starts with h1`);
    levels.reduce((p, l) => {
      assert.ok(l <= p + 1, `${rel}: heading jumps h${p} to h${l}`);
      return l;
    }, 1);
  }
});

test('home: the footer links to the daily market report', () => {
  const link = homepage('[data-harbor-link]');
  assert.equal(link.length, 1);
  assert.equal(link.attr('href'), '/harbor-now/');
  assert.equal(norm(link.text()), 'Daily market report');
  assert.equal(link.closest('footer').length, 1);
});

test('vercel: /harbor-now is served here, /daily-alerts still redirects, raw data is not served', () => {
  const v = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const sources = v.redirects.map((r) => r.source);
  assert.ok(!sources.some((s) => s.startsWith('/harbor-now')), 'no /harbor-now redirect');
  assert.ok(sources.includes('/daily-alerts'), '/daily-alerts behaviour unchanged');
  const data = v.redirects.find((r) => r.source === '/data/harbor/:path*');
  assert.ok(data, 'the unfiltered source JSON is not served from this site');
});

/* ---------- voice: descriptive, never advice ---------- */

/** Every source string that can reach a page, with the text it renders as. */
const renderedStrings = (d) => {
  const r = raw(d);
  const wx = r.weather || {};
  const v = voice(d);
  const out = [];
  const add = (field, src, project = (x) => x) => {
    if (src == null) return;
    const rendered = Object.hasOwn(v.rewrites, src) ? v.rewrites[src] : project(src);
    if (rendered != null) out.push({ field, src, rendered });
  };
  add('title', r.title);
  add('tag', r.tag);
  add('tone', wx.tone);
  add('volatility', wx.volatility);
  add('sentiment label', wx.sentiment?.label);
  add('sentiment', wx.sentiment?.qualifier);
  for (const k of ['spy', 'qqq', 'dia', 'iwm']) if (wx[k]) add(`${k} read`, wx[k].read);
  for (const c of r.cluster || []) add('cluster', c, publicClusterLine);
  return out;
};

/** Reader-facing Harbor text: the edition, the canon, the page copy. Legal disclaimers excluded. */
const harborText = ($) => {
  const c = cheerio.load($.html());
  c('script, style, [data-harbor-notice], .foot__disclaimer').remove();
  return norm(c('body').text());
};

// Noal's examples, checked literally in addition to ADVICE_BANNED.
const NOAL_EXAMPLES = [
  /protect first/i, /protect-first/i, /size down/i, /\bwait\b/i, /review the event/i, /do not chase/i,
  /not a chase/i, /no chase/i, /stay disciplined/i, /\bact\/reduce\b/i, /you should/i, /a day to/i,
  /discipline first/i, /hold discipline/i, /argues (for|against)/i, /forcing a trade/i,
];

test('voice: no advice wording appears on any rendered Harbor page', () => {
  for (const rel of pages) {
    const text = harborText(load(rel));
    const hits = adviceHits(text);
    assert.deepEqual(hits, [], `${rel}: advice wording ${hits.join(', ')}`);
    for (const re of NOAL_EXAMPLES) assert.ok(!re.test(text), `${rel}: ${re}`);
  }
});

test('voice: every directive-looking source string has a rewrite or a reviewed "descriptive" entry', () => {
  let rewritten = 0;
  const distinct = new Set();
  for (const d of dates) {
    const v = voice(d);
    const descriptive = new Set(v.descriptive);
    for (const { field, src, rendered } of renderedStrings(d)) {
      if (Object.hasOwn(v.rewrites, src)) {
        rewritten++;
        distinct.add(src);
        assert.notEqual(rendered, src, `${d} ${field}: rewrite is identical to the source`);
        assert.deepEqual(adviceHits(rendered), [], `${d} ${field}: rewrite still reads as advice: ${rendered}`);
      } else if (looksDirective(rendered)) {
        assert.ok(descriptive.has(rendered), `${d} ${field}: no rewrite for "${rendered}"`);
      }
    }
  }
  // 62 rewrites across editions (59 distinct source strings) as of the 2026-09-29 archive.
  assert.ok(rewritten >= 62, `expected at least 62 rewrites, found ${rewritten}`);
  assert.ok(distinct.size >= 59, `expected at least 59 distinct rewritten strings, found ${distinct.size}`);
});

test('voice: every voice file entry matches text in its edition (no stale rewrites)', () => {
  for (const f of readdirSync(voiceDir)) {
    const d = f.slice(0, 10);
    assert.ok(dates.includes(d), `${f}: no edition for this voice file`);
    const strings = renderedStrings(d);
    const v = voice(d);
    for (const k of Object.keys(v.rewrites)) assert.ok(strings.some((s) => s.src === k), `${f}: rewrite key not in edition: ${k}`);
    for (const k of v.descriptive) assert.ok(strings.some((s) => s.rendered === k), `${f}: descriptive entry not in edition: ${k}`);
  }
});

test('voice: rewritten text is what renders, and the stance originals do not', () => {
  for (const d of dates) {
    const text = visible(load(`harbor-now/${d}/index.html`));
    for (const [src, out] of Object.entries(voice(d).rewrites)) {
      assert.ok(text.includes(out), `${d}: rewrite not rendered: ${out}`);
      assert.ok(!text.includes(src), `${d}: original still rendered: ${src}`);
    }
  }
  const text = visible(load(`harbor-now/${dates.at(-1)}/index.html`));
  for (const [orig, now] of Object.entries(CANON_REWRITTEN)) {
    assert.ok(!text.includes(orig), `canon original rendered: ${orig}`);
    assert.ok(text.includes(now), `canon rewrite missing: ${now}`);
  }
  for (const line of canonLines()) assert.deepEqual(adviceHits(line), [], `canon: ${line}`);
});

/** Build a copy of the archive with one edition's source edited, and return the error. */
const buildWith = async (edit, editVoice) => {
  const canonical = JSON.parse(readFileSync(path.join(root, 'data/homepage.json'), 'utf8')).canonical;
  const tmp = mkdtempSync(path.join(tmpdir(), 'harbor-voice-'));
  mkdirSync(path.join(tmp, 'data'), { recursive: true });
  cpSync(dataDir, path.join(tmp, 'data', 'harbor'), { recursive: true });
  cpSync(voiceDir, path.join(tmp, VOICE_DIR), { recursive: true });
  const d = dates.at(-1);
  const r = raw(d);
  edit(r);
  writeFileSync(path.join(tmp, 'data', 'harbor', `${d}.data.json`), JSON.stringify(r));
  if (editVoice) {
    const v = voice(d);
    editVoice(v);
    writeFileSync(path.join(tmp, VOICE_DIR, `${d}.json`), JSON.stringify(v));
  }
  try {
    await buildHarbor(tmp, canonical);
    return null;
  } catch (e) {
    return e;
  }
};

test('voice: the build fails loudly on a new directive string, naming it and the voice file', async () => {
  const phrase = 'Protect first, trim into strength and add on dips';
  const err = await buildWith((r) => { r.weather.tone = phrase; });
  assert.ok(err instanceof HarborVoiceError, 'build should fail');
  assert.match(err.message, /directive-looking text with no rewrite/);
  assert.ok(err.message.includes(`tone: "${phrase}"`), err.message);
  assert.ok(err.message.includes(`${VOICE_DIR}/${dates.at(-1)}.json`), err.message);

  const cluster = 'Rotation note: hold winners and sell weakness into the close';
  const err2 = await buildWith((r) => { r.cluster.push(cluster); });
  assert.ok(err2 instanceof HarborVoiceError);
  assert.ok(err2.message.includes(cluster), err2.message);

  for (const verb of ['protect', 'size', 'wait', 'avoid', 'reduce', 'review', 'chase', 'stay', 'hold', 'trim', 'buy', 'sell', 'add']) {
    assert.ok(looksDirective(`Today: ${verb} the lane`), `vocabulary misses "${verb}"`);
  }
});

test('voice: a reviewed "descriptive" entry cannot let advice wording through, and stale keys fail', async () => {
  const phrase = 'A day to wait — stay disciplined';
  const err = await buildWith((r) => { r.weather.tone = phrase; }, (v) => v.descriptive.push(phrase));
  assert.ok(err instanceof HarborVoiceError, 'build should fail');
  assert.match(err.message, /advice wording would render/);

  const err2 = await buildWith(() => {}, (v) => { v.rewrites['Text that is not in this edition'] = 'x'; });
  assert.ok(err2 instanceof HarborVoiceError, 'stale rewrite should fail');
  assert.match(err2.message, /names text this edition does not render/);

  assert.equal(await buildWith(() => {}), null, 'the unedited archive builds');
});
