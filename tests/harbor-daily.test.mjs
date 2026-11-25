/**
 * Harbor Now daily publisher (2026-11-25): fixed Rosie templates, Rosie's own
 * watchlists only, words-only by default, NYSE calendar, browser freshness note,
 * and the GitHub Actions workflow's safety switches.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { compose, shareWord, moveWord, roughPct, SCHEMA } from '../src/harbor-compose.mjs';
import { isTradingDay, prevTradingDay, expectedEditionDate, tradingDaysLate } from '../src/harbor-calendar.mjs';
import { publicEdition, buildHarbor, buildFreshScript, DROPPED_FIELDS, VOICE_DIR } from '../src/harbor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const config = readJson('data/harbor-config.json');
const cal = readJson('data/market-calendar.json');
const fixture = (lvl) => readJson(`tests/fixtures/harbor-daily-2026-11-24.${lvl}.json`);

/** Deterministic pseudo-random closes so many different days are exercised. */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function syntheticDay(seed, spread = 3) {
  const r = rng(seed);
  const quotes = {};
  const all = [...config.index_funds.map((f) => f.symbol), ...config.watchlist_i.symbols, ...config.watchlist_ii.symbols];
  for (const s of all) {
    const prev = 20 + r() * 500;
    quotes[s] = { prev, close: prev * (1 + ((r() - 0.5) * 2 * spread) / 100) };
  }
  const vprev = 12 + r() * 20;
  return { quotes, vix: { prev: vprev, close: vprev * (1 + (r() - 0.5) * 0.2) } };
}
const editionText = (ed) =>
  [ed.title, ed.tag, ...ed.rows.flatMap((r) => [r.read, r.change, r.price, r.high52]), ed.sentiment.label, ed.sentiment.qualifier, ed.volatility, ed.tone, ...ed.cluster].join(' \n ');

test('daily: every generated edition passes the Harbor voice gates with no voice file, in both data levels', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const { quotes, vix } = syntheticDay(seed, seed % 4 === 0 ? 0.2 : 3);
    for (const dataLevel of ['words', 'pct']) {
      const raw = compose({ date: '2026-11-24', quotes, vix, config, dataLevel });
      // publicEdition throws HarborVoiceError on any directive, advice or "we/our/us" wording.
      const ed = publicEdition('2026-11-24', raw);
      assert.equal(ed.schema, SCHEMA);
      assert.ok(ed.cluster.length >= 2, `seed ${seed}: watchlist lines present`);
    }
  }
});

test('daily: words mode prints no market numbers at all; pct mode prints only rounded % and counts, never prices', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { quotes, vix } = syntheticDay(seed);
    const words = editionText(publicEdition('2026-11-24', compose({ date: '2026-11-24', quotes, vix, config, dataLevel: 'words' })));
    assert.doesNotMatch(words, /\d/, `seed ${seed}: words mode has a digit`);
    const pct = editionText(publicEdition('2026-11-24', compose({ date: '2026-11-24', quotes, vix, config, dataLevel: 'pct' })));
    const stripped = pct.replace(/[+-]?\d+\.\d%/g, '').replace(/\(\d+ of \d+\)/g, '');
    assert.doesNotMatch(stripped, /\d/, `seed ${seed}: pct mode has a number other than a rounded % or a count`);
  }
  assert.equal(roughPct(0.04), '0.0%');
  assert.equal(roughPct(-1.26), '-1.3%');
  assert.equal(roughPct(2.04), '+2.0%');
});

test('daily: only Rosie\'s watchlists and the four context funds; no news, no XRP, Watchlist II never named', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { quotes, vix } = syntheticDay(seed);
    quotes.XRP = { prev: 1, close: 2 };
    const raw = compose({ date: '2026-11-24', quotes, vix, config, dataLevel: 'pct' });
    const text = JSON.stringify({ ...raw, _sources: undefined });
    assert.doesNotMatch(text, /\bXRP\b/);
    const onlyII = config.watchlist_ii.symbols.filter((s) => !config.watchlist_i.symbols.includes(s));
    for (const s of onlyII) assert.doesNotMatch(text, new RegExp(`\\b${s}\\b`), `seed ${seed}: Watchlist II name ${s} published`);
    for (const line of raw.cluster) assert.match(line, /^(Watchlist I|Watchlist II|Strongest on my Watchlist I|Weakest on my Watchlist I)\b/);
    assert.deepEqual(Object.keys(raw).sort(), ['_sources', 'cluster', 'data_level', 'schema', 'tag', 'title', 'weather']);
    for (const f of ['account', 'checklist', 'body_muted']) assert.ok(!(f in raw) && f in DROPPED_FIELDS);
    assert.doesNotMatch(text, /earnings|catalyst|headline|news|report(s|ed)? (today|tomorrow)/i);
  }
  assert.ok(!config.watchlist_i.symbols.includes('XRP') && !config.watchlist_ii.symbols.includes('XRP'));
  assert.equal(config.watchlist_ii.name_symbols, false, 'Watchlist II stays unnamed (no re-posting of picks)');
  assert.equal(config.data_level, 'words', 'words-only is the default until the lawyer clears percent changes');
});

test('daily: Rosie speaks in the first person and promises nothing', () => {
  const ed = publicEdition('2026-11-24', fixture('words'));
  assert.match(ed.tag, /\bI track\b/);
  assert.match(editionText(ed), /\bmy Watchlist I\b/);
  const said = editionText(ed).replace('not a survey or a forecast', '');
  assert.doesNotMatch(said, /\b(will|guarantee|expect|forecast(s|ed)?|predict|profit|win(s|ning)?)\b/i);
});

test('daily: the word scales read sensibly', () => {
  assert.equal(shareWord(0, 10), 'none');
  assert.equal(shareWord(10, 10), 'all');
  assert.equal(shareWord(8, 10), 'most');
  assert.equal(shareWord(5, 10), 'about half');
  assert.equal(shareWord(1, 10), 'only a few');
  assert.equal(moveWord(0.05), 'closed flat');
  assert.equal(moveWord(-0.6), 'slipped');
  assert.equal(moveWord(2.5), 'jumped');
});

test('daily: missing index-fund or VIX data fails loudly instead of publishing a guess', () => {
  const { quotes, vix } = syntheticDay(7);
  delete quotes.SPY;
  assert.throws(() => compose({ date: '2026-11-24', quotes, vix, config }), /index funds: SPY/);
  assert.throws(() => compose({ date: '2026-11-24', quotes: syntheticDay(7).quotes, vix: null, config }), /VIX/);
});

test('calendar: the copy matches Rosie\'s NYSE table, and holidays, weekends and early closes behave', () => {
  assert.deepEqual(cal.calendar_years, [2026, 2027]);
  assert.equal(Object.keys(cal.full_closures).length, 20);
  assert.equal(Object.keys(cal.early_closes).length, 3);
  assert.equal(isTradingDay('2026-11-26', cal), false, 'Thanksgiving');
  assert.equal(isTradingDay('2026-11-27', cal), true, 'early close is a trading day');
  assert.equal(isTradingDay('2026-11-28', cal), false, 'Saturday');
  assert.equal(isTradingDay('2026-07-03', cal), false, 'observed holiday');
  assert.equal(prevTradingDay('2026-11-27', cal), '2026-11-25');
  assert.equal(prevTradingDay('2026-11-30', cal), '2026-11-27');
});

test('freshness: expected edition date and trading days late follow the calendar', () => {
  assert.equal(expectedEditionDate('2026-11-25', 17 * 60, cal), '2026-11-24', 'before 6:30 PM: yesterday');
  assert.equal(expectedEditionDate('2026-11-25', 18 * 60 + 31, cal), '2026-11-25');
  assert.equal(expectedEditionDate('2026-11-26', 20 * 60, cal), '2026-11-25', 'Thanksgiving: Wednesday');
  assert.equal(expectedEditionDate('2026-11-29', 12 * 60, cal), '2026-11-27', 'Sunday: Friday');
  assert.equal(tradingDaysLate('2026-11-25', '2026-11-25', cal), 0);
  assert.equal(tradingDaysLate('2026-11-25', '2026-11-27', cal), 1, 'Thanksgiving does not count');
  assert.equal(tradingDaysLate('2026-11-24', '2026-11-30', cal), 3);
});

/** Run the generated browser script against a fake page at a fixed New York time. */
function runFresh(latest, isoUtc) {
  const el = { hidden: true, textContent: '', attrs: { 'data-latest': latest }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } };
  const RealDate = Date;
  const fixed = new RealDate(isoUtc).getTime();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
  vm.runInNewContext(buildFreshScript(cal), { document: { querySelector: () => el }, Date: FakeDate, Intl });
  return el;
}

test('freshness: the browser note is hidden when current, soft at one trading day late, clear at three or more', () => {
  // Wed 2026-11-25 8:00 PM ET = 2026-11-26T01:00Z
  let el = runFresh('2026-11-25', '2026-11-26T01:00:00Z');
  assert.equal(el.hidden, true);
  el = runFresh('2026-11-24', '2026-11-26T01:00:00Z');
  assert.equal(el.hidden, false);
  assert.equal(el.attrs['data-level'], 'soft');
  assert.equal(el.textContent, 'The newest edition here is from Tuesday, November 24, 2026. The next one is running late.');
  // Mon 2026-11-30 7:00 PM ET: Wed 25 edition, missing Fri 27 and Mon 30 -> 2 (soft)
  el = runFresh('2026-11-25', '2026-12-01T00:00:00Z');
  assert.equal(el.attrs['data-level'], 'soft');
  // Tue 2026-12-01 7:00 PM ET -> 3 (clear)
  el = runFresh('2026-11-25', '2026-12-02T00:00:00Z');
  assert.equal(el.attrs['data-level'], 'clear');
  assert.equal(el.textContent, 'Harbor Now is behind: the latest edition is from Wednesday, November 25, 2026, and 3 trading days have closed since.');
  // Thanksgiving evening with Wednesday's edition: current.
  assert.equal(runFresh('2026-11-25', '2026-11-27T01:00:00Z').hidden, true);
});

test('render: a words edition shows no price columns; a pct edition shows only the rounded change; heading is "My watchlists"', async () => {
  const { canonical, pages } = readJson('data/homepage.json');
  for (const lvl of ['words', 'pct']) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'harbor-daily-'));
    mkdirSync(path.join(tmp, 'data', 'harbor'), { recursive: true });
    cpSync(path.join(root, 'data', 'harbor'), path.join(tmp, 'data', 'harbor'), { recursive: true });
    cpSync(path.join(root, VOICE_DIR), path.join(tmp, VOICE_DIR), { recursive: true });
    writeFileSync(path.join(tmp, 'data', 'harbor', '2026-11-24.data.json'), JSON.stringify(fixture(lvl)));
    await buildHarbor(tmp, canonical, { pages });
    const $ = cheerio.load(readFileSync(path.join(tmp, 'harbor-now', '2026-11-24', 'index.html'), 'utf8'));
    const heads = $('[data-harbor-table] thead th').map((_, e) => $(e).text().trim()).get();
    assert.deepEqual(heads, lvl === 'words' ? ['Fund and how it closed'] : ['Fund', 'Change']);
    assert.equal($('[data-harbor-table] tbody tr').length, 4);
    assert.equal($('h2.hn-h').filter((_, e) => $(e).text() === 'My watchlists').length, 1);
    if (lvl === 'words') assert.doesNotMatch($('.hn-panel').text() + $('[data-harbor-cluster]').text(), /\d{1,3}\.\d/);
    // The archive's own pages are unchanged in shape: still four columns.
    const old = cheerio.load(readFileSync(path.join(tmp, 'harbor-now', '2026-09-29', 'index.html'), 'utf8'));
    assert.equal(old('[data-harbor-table] thead th').length, 4);
  }
});

test('publisher: skips weekends and NYSE holidays without touching the network', () => {
  for (const [date, why] of [['2026-11-26', 'Thanksgiving'], ['2026-11-28', 'weekend']]) {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'harbor-daily.mjs'), `--date=${date}`, '--dry-run'], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`skip: ${date} is not a trading day: .*${why}`));
  }
});

test('workflow: weekday 5:30 PM ET crons, manual trigger, dry run by default, FTP secrets optional, only harbor-now/ uploaded', () => {
  const wf = readFileSync(path.join(root, '.github', 'workflows', 'harbor-daily.yml'), 'utf8');
  assert.match(wf, /cron: '30 21 \* \* 1-5'/);
  assert.match(wf, /cron: '30 22 \* \* 1-5'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /dry_run:[\s\S]*?default: true/);
  assert.match(wf, /vars\.HARBOR_DRY_RUN == 'false' && 'false' \|\| 'true'/, 'scheduled runs are dry unless the variable says "false"');
  assert.match(wf, /if: steps\.gen\.outputs\.status == 'written'[\s\S]*Commit the edition/);
  assert.match(wf, /Upload skipped/);
  for (const s of ['HARBOR_FTP_HOST', 'HARBOR_FTP_USER', 'HARBOR_FTP_PASSWORD', 'HARBOR_FTP_DIR']) assert.match(wf, new RegExp(`secrets\\.${s}\\b`));
  assert.match(wf, /mirror --reverse --only-newer --verbose harbor-now /);
  assert.doesNotMatch(wf, /--delete/);
  assert.match(wf, /ftp:ssl-force true/);
  assert.match(wf, /--env-password/, 'the password goes by environment, never on the command line');
  assert.doesNotMatch(wf, /echo[^\n]*\$\{?\{?\s*(secrets\.|\w*PASSWORD)/, 'no step prints a secret');
  assert.match(wf, /node --test tests\/harbor-now\.test\.mjs tests\/harbor-daily\.test\.mjs/);
});
