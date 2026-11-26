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
import { compose, analyze, shareWord, moveWord, roughPct, SCHEMA } from '../src/harbor-compose.mjs';
import { isTradingDay, prevTradingDay, expectedEditionDate, tradingDaysLate } from '../src/harbor-calendar.mjs';
import { publicEdition, buildHarbor, buildFreshScript, checkKey, DROPPED_FIELDS, VOICE_DIR } from '../src/harbor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const config = readJson('data/harbor-config.json');
const cal = readJson('data/market-calendar.json');
const sectors = readJson('data/sector-members.json');
const glossary = readJson('data/harbor-glossary.json');
const fixture = (lvl) => readJson(`tests/fixtures/harbor-daily-2026-11-24.${lvl}.json`);
const DATE = '2026-11-24';

/** Deterministic pseudo-random numbers so many different days are exercised. */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const DAYS = (() => {
  const out = [];
  let d = DATE;
  while (out.length < 130) {
    if (isTradingDay(d, cal)) out.unshift(d);
    d = new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  return out;
})();
const allSymbols = () => [
  ...new Set([
    ...config.index_funds.map((f) => f.symbol), ...config.sector_funds, ...config.watchlist_i.symbols,
    ...config.watchlist_ii.symbols, ...Object.values(sectors.sectors).flatMap((x) => x.members), '^VIX', 'XRP',
  ]),
];
/** A random walk per symbol; `drift(sym)` (% per day) can force a direction. */
function syntheticSeries(seed, { vol = 1.5, drift = () => 0 } = {}) {
  const r = rng(seed);
  const series = {};
  for (const s of allSymbols()) {
    let c = 20 + r() * 400;
    const dr = drift(s) ?? (r() - 0.5) * 0.6;
    series[s] = DAYS.map((d) => {
      c *= 1 + (dr + (r() - 0.5) * 2 * vol) / 100;
      return { d, c };
    });
  }
  return series;
}
const make = (series, dataLevel = 'words') => compose({ date: DATE, series, config, sectors, glossary, dataLevel });
const editionText = (ed) =>
  [ed.title, ...(ed.lead || [ed.tag]), ...(ed.convergence ? [ed.convergence.summary, ...ed.convergence.items] : []),
    ...ed.rows.flatMap((r) => [r.read, r.change, r.price, r.high52]), ed.sentiment.label, ed.sentiment.qualifier,
    ed.volatility, ed.tone, ...ed.cluster].join(' \n ');

test('daily: every generated edition passes the Harbor voice gates with no voice file, in both data levels', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const series = syntheticSeries(seed, { vol: seed % 5 === 0 ? 0.2 : 1.8 });
    for (const dataLevel of ['words', 'pct']) {
      // publicEdition throws HarborVoiceError on any directive, advice or "we/our/us" wording.
      const ed = publicEdition(DATE, make(series, dataLevel));
      assert.equal(ed.schema, SCHEMA);
      assert.equal(ed.convergence.items.length, 3, `seed ${seed}: three legs`);
    }
  }
});

test('daily: the edition leads with whether the three lights line up, and the legs follow Rosie\'s rules', () => {
  // Everything climbing steadily: tide rising, hot sector rising, names rising -> all three.
  const up = make(syntheticSeries(11, { vol: 0.3, drift: (s) => (s === '^VIX' ? -0.5 : 0.4 + (s.length % 3) * 0.15) }));
  assert.equal(up.lead.length, 4, 'four opening bullets');
  assert.match(up.lead[0], /^Line-up: all three of my lights today \(lining up: my three signals agree\)$/);
  assert.match(up.lead[1], /^Tide \(index trend\): rising, /);
  assert.match(up.lead[2], /^Hot sector \(strongest vs SPY\): .+, rising with the tide$/);
  assert.match(up.lead[3], /^Top names inside: .+, rising and stronger than SPY$/);
  assert.match(up.title, /^All three line up: indexes rising, .+ leading, .+ strongest inside it$/);
  assert.equal(up._sources.legs.tide, 'yes');
  assert.match(up.convergence.items[0], /^Lined up: the tide\./);
  // Indexes falling, one sector fund rising hard: a crosscurrent, nothing lines up.
  const cross = make(syntheticSeries(12, { vol: 0.3, drift: (s) => (s === 'XLU' ? 0.8 : s === '^VIX' ? 0.5 : -0.5) }));
  assert.equal(cross._sources.hot_sector, 'XLU');
  assert.match(cross.title, /^No line-up: Utilities rising while the indexes are not$/);
  assert.match(cross.lead[2], /^Hot sector \(strongest vs SPY\): Utilities, rising while the tide goes out, a crosscurrent \(a sector moving against the tide\)$/);
  assert.match(cross.lead[0], /^Line-up: none of my three lights today/);
  assert.match(cross.lead[1], /^Tide \(index trend\): going out, /);
});

test('daily: "rising" is Rosie\'s all-three-rising test on daily closes (above a rising trend average)', () => {
  const rows = (f) => DAYS.map((d, i) => ({ d, c: f(i) }));
  assert.equal(analyze(rows((i) => 100 + i), DATE).rising, true);
  assert.equal(analyze(rows((i) => 300 - i), DATE).rising, false);
  assert.equal(analyze(rows((i) => 100 + i), DATE).colour, 'green');
  assert.equal(analyze(rows((i) => 300 - i), DATE).colour, 'red');
  assert.equal(analyze(rows((i) => 100 + i).slice(0, -1), DATE), null, 'no close for the day itself: no read');
});

test('daily: every metaphor is defined in brackets the first time it appears, from the glossary, and only then', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const ed = publicEdition(DATE, make(syntheticSeries(seed, { vol: seed % 3 ? 1.8 : 0.4 })));
    const text = editionText(ed);
    for (const e of glossary.entries) {
      const n = text.split(`(${e.inline})`).length - 1;
      assert.ok(n <= 1, `seed ${seed}: "${e.image}" defined ${n} times`);
    }
    for (const [id, word] of [['tide', 'tide'], ['weather', 'weather'], ['hot_sector', 'hot sector'], ['trend_line', 'trend line']]) {
      const e = glossary.entries.find((x) => x.id === id);
      const first = text.search(new RegExp(`\\b${word}`, 'i'));
      assert.ok(first >= 0, `seed ${seed}: ${id} used`);
      const def = text.indexOf(`(${e.inline})`);
      assert.ok(def > first && def - first < word.length + 8, `seed ${seed}: "${word}" first appears without its meaning`);
    }
  }
});

test('glossary: one image per trading term, each with an inline meaning, a full meaning and the technical term', () => {
  const images = glossary.entries.map((e) => e.image.toLowerCase());
  assert.equal(new Set(images).size, images.length);
  assert.equal(new Set(glossary.entries.map((e) => e.term)).size, glossary.entries.length);
  const byTerm = Object.fromEntries(glossary.entries.map((e) => [e.term, e.image]));
  assert.equal(byTerm['Volatility (VIX)'], 'the weather');
  assert.equal(byTerm.Resistance, 'a headwind');
  assert.equal(byTerm.Support, 'an anchorage');
  assert.equal(byTerm['Market trend (broad indexes)'], 'the tide');
  assert.equal(byTerm.Momentum, 'the wind picking up');
  assert.equal(byTerm['Signal convergence'], 'the lights line up');
  assert.doesNotThrow(() => checkKey(glossary));
});

test('daily: words mode prints no market numbers at all; pct mode prints only rounded % and counts, never prices', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const series = syntheticSeries(seed);
    const words = editionText(publicEdition(DATE, make(series, 'words')));
    assert.doesNotMatch(words, /\d/, `seed ${seed}: words mode has a digit`);
    const pct = editionText(publicEdition(DATE, make(series, 'pct')));
    const stripped = pct.replace(/[+-]?\d+\.\d%/g, '').replace(/\(\d+ of \d+\)/g, '');
    assert.doesNotMatch(stripped, /\d/, `seed ${seed}: pct mode has a number other than a rounded % or a count`);
  }
  assert.equal(roughPct(0.04), '0.0%');
  assert.equal(roughPct(-1.26), '-1.3%');
  assert.equal(roughPct(2.04), '+2.0%');
});

test('daily: only Rosie\'s lists and sector funds; no news, no XRP; Watchlist II named only via Rosie\'s own sector ranking', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const raw = make(syntheticSeries(seed), 'pct');
    const text = JSON.stringify({ ...raw, _sources: undefined });
    assert.doesNotMatch(text, /\bXRP\b/);
    const hotMembers = new Set(sectors.sectors[raw._sources.hot_sector].members);
    const onlyII = config.watchlist_ii.symbols.filter((s) => !config.watchlist_i.symbols.includes(s) && !config.sector_funds.includes(s));
    for (const s of onlyII) {
      if (new RegExp(`\\b${s}\\b`).test(text)) assert.ok(hotMembers.has(s), `seed ${seed}: Watchlist II name ${s} published outside the hot-sector ranking`);
    }
    for (const line of raw.cluster) assert.match(line, /^(Coolest sector|Watchlist I|Watchlist II)\b/);
    assert.deepEqual(Object.keys(raw).sort(), ['_sources', 'cluster', 'convergence', 'data_level', 'lead', 'schema', 'tag', 'title', 'weather']);
    for (const f of ['account', 'checklist', 'body_muted']) assert.ok(!(f in raw) && f in DROPPED_FIELDS);
    assert.doesNotMatch(text, /earnings|catalyst|headline|news|report(s|ed)? (today|tomorrow)/i);
  }
  assert.ok(!config.watchlist_i.symbols.includes('XRP') && !config.watchlist_ii.symbols.includes('XRP'));
  assert.equal(config.watchlist_ii.name_symbols, false, 'Watchlist II stays unnamed as a list (no re-posting of picks)');
  assert.equal(config.data_level, 'words', 'words-only is the default until the lawyer clears percent changes');
});

test('daily: Rosie speaks in the first person, describes, and promises nothing', () => {
  const ed = publicEdition(DATE, fixture('words'));
  assert.match(ed.lead[0], /\bmy three lights\b/);
  const said = editionText(ed).replace('not a survey or a forecast', '');
  assert.doesNotMatch(said, /\b(will|guarantee|expect|forecast(s|ed)?|predict|profit|win(s|ning)?|benefit|promising)\b/i);
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
  const series = syntheticSeries(7);
  delete series.SPY;
  assert.throws(() => make(series), /SPY/);
  const s2 = syntheticSeries(7);
  delete s2['^VIX'];
  assert.throws(() => make(s2), /VIX/);
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
    assert.equal($('[data-harbor-lead] li').length, 4, 'the opening is four bullets');
    assert.equal($('.hn-panel .hn-tag').length, 0, 'no run-on paragraph above the bullets');
    assert.equal($('[data-harbor-convergence] li').length, 3, 'the three lights');
    assert.ok($('[data-harbor-convergence]').index() < $('[data-harbor-table]').closest('.table-wrap').index(), 'the line-up comes before the table');
    assert.equal($('#how-to-read[data-harbor-key]').length, 1);
    assert.equal($('[data-harbor-glossary] dt').length, glossary.entries.length);
    for (const e of glossary.entries) assert.ok($('[data-harbor-glossary]').text().includes(e.meaning), `key shows ${e.id}`);
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

test('daily: the opening is four short bullets, each one idea, never a run-on', () => {
  for (let seed = 1; seed <= 150; seed++) {
    for (const dataLevel of ['words', 'pct']) {
      const ed = publicEdition(DATE, make(syntheticSeries(seed, { vol: seed % 4 ? 1.8 : 0.3 }), dataLevel));
      assert.equal(ed.lead.length, 4, `seed ${seed}: four bullets`);
      ['Line-up: ', 'Tide', 'Hot sector', 'Top names inside: '].forEach((p, i) => assert.ok(ed.lead[i].startsWith(p), `seed ${seed}: bullet ${i + 1} is "${p}"`));
      for (const b of ed.lead) {
        assert.ok(!/\. [A-Z]/.test(b), `seed ${seed}: one sentence per bullet: ${b}`);
        assert.ok(b.split(/\s+/).length <= 22, `seed ${seed}: bullet too long: ${b}`);
      }
    }
  }
});

test('daily: the title, the verdict bullet and the three lights always agree', () => {
  const words = ['none', 'one', 'two', 'all three'];
  for (let seed = 1; seed <= 300; seed++) {
    const raw = make(syntheticSeries(seed, { vol: seed % 3 ? 1.8 : 0.4 }));
    const legs = Object.values(raw._sources.legs);
    const n = legs.filter((l) => l === 'yes').length;
    assert.ok(raw.lead[0].includes(`${words[n]} of my three lights`) || (n === 3 && raw.lead[0].includes('all three of my lights')), `seed ${seed}: verdict ${raw.lead[0]} vs ${legs}`);
    const lead = { 3: /^All three/, 2: /^Two of three/, 1: /^One of three/, 0: /^No line-up/ }[n];
    assert.match(raw.title, lead, `seed ${seed}: title "${raw.title}" vs legs ${legs}`);
    if (raw._sources.legs.names === 'yes') assert.doesNotMatch(raw.title, /no name in it/, `seed ${seed}`);
    const named = /^Top names inside: (?!none)/.test(raw.lead[3]);
    if (/no name in it/.test(raw.title)) assert.ok(!named, `seed ${seed}: title says no name but bullet names some`);
  }
});
