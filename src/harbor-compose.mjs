/**
 * Harbor Now daily edition composer: fixed, first-person sentence templates in
 * Rosie's voice, filled from daily closes. Pure function, no network: the
 * publisher (scripts/harbor-daily.mjs) fetches the closes and calls compose().
 *
 * What an edition is about (owner, 2026-11-25):
 *   Harbor Now is a tour guide to how Rosie's rules read the day. Its core is a
 *   three-way convergence:
 *     1. the tide: the four index funds rising together,
 *     2. the hot sector: the leading sector fund rising with them,
 *     3. the strongest names inside that hot sector (Watchlist I first, then
 *        Rosie's own sector member list).
 *   Every metaphor (tide, weather, hot sector, line up) carries a plain-English
 *   meaning in brackets the first time it appears in an edition.
 *
 * How it mirrors Rosie (nrini49/interactive + schwab, read 2026-11-25):
 *   - "Rising" is the daily form of Lime Sniper's all-three-rising entry filter
 *     (lime_sniper_three_rising.py): close above its trend average AND that
 *     average higher than the session before. Rosie applies it to 1-hour bars;
 *     Harbor Now applies it to daily closes, which public data allows.
 *   - The hot sector is ranked like Rosie's Lime Sniper sector funnel
 *     (lime_sniper_sector.py): strength against SPY over recent sessions plus
 *     today's, across the eleven SPDR sector funds (plus SMH for semis here).
 *   - Index trend colours follow Rosie's regime colours (leader_setup
 *     classify_regime: close against three trend averages).
 *   The page describes these in plain words and never prints the periods,
 *   weights or thresholds.
 *
 * Other rules: Rosie speaks as "I", observes and never advises; no outside news;
 * Watchlist II is described as a group (a Watchlist II name can appear only when
 * Rosie's own sector ranking puts it among the hot sector's strongest names);
 * no XRP; data_level "words" prints no numbers, "pct" adds rounded % changes;
 * prices are never written; the old account / checklist / body_muted fields
 * are never written. Every sentence must pass the Harbor voice gates in
 * src/harbor.mjs with no voice file (tests/harbor-daily.test.mjs).
 */

export const SCHEMA = 'rosie-daily-v1';
export const DATA_LEVELS = ['words', 'pct'];
const FLAT = 0.1; // |%| below this reads as flat

// Rosie's trend averages (lime_sniper_three_rising EMA_PERIOD; leader_setup regime EMAs)
// and sector-funnel lookback (lime_sniper_sector RS_LOOKBACK_DAYS). Code only: never printed.
const RISE_SPAN = 21;
const REGIME_SPANS = [8, 21, 50];
const RS_LOOKBACK = 10;
const TOP_NAMES = 3;

/* ---------- small helpers ---------- */

export function emaLast(values, span) {
  if (values.length < span) return null;
  const k = 2 / (span + 1);
  let e = values.slice(0, span).reduce((a, b) => a + b, 0) / span;
  for (const v of values.slice(span)) e = v * k + e * (1 - k);
  return e;
}

/** Closes up to and including `date`, oldest first. series: [{d, c}] or [[d, c]]. */
export function closesUpTo(series, date) {
  return (series || [])
    .map((x) => (Array.isArray(x) ? { d: x[0], c: x[1] } : x))
    .filter((x) => x.d <= date && Number.isFinite(x.c) && x.c > 0)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

/**
 * One symbol's read for `date`: day change, Rosie's "rising" test, regime colour, and
 * return over the funnel lookback. null when there is no close for `date` itself.
 */
export function analyze(series, date) {
  const rows = closesUpTo(series, date);
  if (rows.length < 2 || rows.at(-1).d !== date) return null;
  const c = rows.map((r) => r.c);
  const last = c.at(-1);
  const prev = c.at(-2);
  const eNow = emaLast(c, RISE_SPAN);
  const ePrev = emaLast(c.slice(0, -1), RISE_SPAN);
  const rising = eNow != null && ePrev != null ? last > eNow && eNow > ePrev : null;
  const [e8, e21, e50] = REGIME_SPANS.map((s) => emaLast(c, s));
  let colour = null;
  if (e8 != null && e21 != null && e50 != null) {
    const a8 = last >= e8, a21 = last >= e21, a50 = last >= e50;
    colour = a8 && a21 && a50 ? 'green' : !a8 && a21 && a50 ? 'amber' : !a21 && a50 ? 'yellow' : !a50 && (a21 || a8) ? 'orange' : 'red';
  }
  const back = c.length > RS_LOOKBACK ? c[c.length - 1 - RS_LOOKBACK] : null;
  return { p: (last / prev - 1) * 100, rising, colour, ret: back ? (last / back - 1) * 100 : null };
}

const dir = (p) => (p >= FLAT ? 1 : p <= -FLAT ? -1 : 0);

/** Rounded, signed percent for pct mode: "+0.5%", "-1.2%", "0.0%". */
export function roughPct(p) {
  const r = Math.round(p * 10) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : '-'}${Math.abs(r).toFixed(1)}%`;
}
const about = (p) => `about ${Math.abs(Math.round(p * 10) / 10).toFixed(1)}%`;

export function moveWord(p) {
  const a = Math.abs(p);
  if (a < FLAT) return 'closed flat';
  if (a < 0.4) return p > 0 ? 'edged up' : 'edged lower';
  if (a < 1) return p > 0 ? 'rose' : 'slipped';
  if (a < 2) return p > 0 ? 'rose firmly' : 'fell firmly';
  return p > 0 ? 'jumped' : 'dropped sharply';
}

/** Share in words: all, most, more than half, about half, fewer than half, only a few, none. */
export function shareWord(k, n) {
  if (!n || k === 0) return 'none';
  if (k === n) return 'all';
  const f = k / n;
  if (f >= 0.75) return 'most';
  if (f > 0.55) return 'more than half';
  if (f >= 0.45) return 'about half';
  if (f > 0.25) return 'fewer than half';
  return 'only a few';
}

const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const trendWords = (a) =>
  a.rising ? 'above a rising trend line' : a.rising === false ? 'not above a rising trend line' : 'trend line not yet measurable';

/** Rosie's sector-funnel score: strength against SPY over recent sessions plus today's. */
const score = (a, spy) => (a.ret != null && spy.ret != null ? a.ret - spy.ret : 0) + (a.p - spy.p);

/* ---------- ranking (used by the publisher too, to fetch the hot sector's members) ---------- */

export function rankSectors(series, date, config) {
  const spy = analyze(series.SPY, date);
  if (!spy) throw new Error('missing SPY closes');
  return config.sector_funds
    .map((etf) => ({ etf, a: analyze(series[etf], date) }))
    .filter((x) => x.a)
    .map((x) => ({ ...x, s: score(x.a, spy) }))
    .sort((x, y) => y.s - x.s || x.etf.localeCompare(y.etf));
}

/** Members of a sector fund, Watchlist I names first (owner: "our watchlist names first"). */
export function sectorCandidates(etf, sectors, config) {
  const members = sectors?.sectors?.[etf]?.members || [];
  const never = new Set(config.never_publish || []);
  const w1 = new Set(config.watchlist_i.symbols);
  const list = members.filter((s) => !never.has(s));
  return [...list.filter((s) => w1.has(s)), ...list.filter((s) => !w1.has(s))];
}

/* ---------- compose ---------- */

/**
 * compose({ date, series: {SYM: [{d, c}, ...]}, config, sectors, dataLevel, source })
 * -> raw edition object for data/harbor/<date>.data.json.
 */
export function compose({ date, series, config, sectors, glossary, dataLevel = config.data_level || 'words', source = '' }) {
  if (!DATA_LEVELS.includes(dataLevel)) throw new Error(`unknown data_level "${dataLevel}"`);
  // Metaphors come from data/harbor-glossary.json: the same image every time, with its plain
  // meaning in brackets the first time it appears in this edition.
  const gl = Object.fromEntries((glossary?.entries || []).map((e) => [e.id, e]));
  for (const id of ['tide', 'trend_line', 'weather', 'wind', 'hot_sector', 'crosscurrent', 'line_up']) {
    if (!gl[id]) throw new Error(`data/harbor-glossary.json has no "${id}" entry`);
  }
  const used = new Set();
  const img = (id, text = gl[id].image, bracket = gl[id].inline) => {
    if (used.has(id)) return text;
    used.add(id);
    return `${text} (${bracket})`;
  };
  const pct = dataLevel === 'pct';
  const never = new Set(config.never_publish || []);
  const funds = config.index_funds.map((f) => ({ ...f, a: analyze(series[f.symbol], date) }));
  const missingFunds = funds.filter((f) => !f.a).map((f) => f.symbol);
  if (missingFunds.length) throw new Error(`missing closes for index funds: ${missingFunds.join(', ')}`);
  const vix = analyze(series['^VIX'], date);
  if (!vix) throw new Error('missing VIX closes');
  const spy = funds.find((f) => f.symbol === 'SPY').a;
  const ranked = rankSectors(series, date, config);
  if (ranked.length < config.sector_funds.length - 2) throw new Error(`sector funds missing: only ${ranked.length} of ${config.sector_funds.length}`);
  const hot = ranked[0];
  const cool = ranked.at(-1);
  const hotName = sectors?.sectors?.[hot.etf]?.name || hot.etf;
  const coolName = sectors?.sectors?.[cool.etf]?.name || cool.etf;

  // ---- leg 1: the tide (four index funds rising together) ----
  const risingFunds = funds.filter((f) => f.a.rising);
  const tide = risingFunds.length === funds.length ? 'rising' : spy.rising && risingFunds.length >= 2 ? 'mixed' : risingFunds.length === 0 ? 'falling' : 'mixed';
  const leg1 = tide === 'rising' ? 'yes' : tide === 'mixed' && spy.rising ? 'partly' : 'no';

  // ---- leg 2: the hot sector rising in step with the tide ----
  const leg2 = hot.a.rising && leg1 !== 'no' ? 'yes' : 'no';
  const divergence = hot.a.rising && leg1 === 'no';

  // ---- leg 3: the strongest rising names inside the hot sector ----
  const cands = sectorCandidates(hot.etf, sectors, config)
    .map((s) => ({ s, a: analyze(series[s], date) }))
    .filter((x) => x.a && x.a.rising)
    .map((x) => ({ ...x, sc: score(x.a, spy) }))
    .filter((x) => x.sc > 0);
  const w1set = new Set(config.watchlist_i.symbols);
  const byScore = (x, y) => y.sc - x.sc || x.s.localeCompare(y.s);
  const fromW1 = cands.filter((x) => w1set.has(x.s)).sort(byScore);
  const others = cands.filter((x) => !w1set.has(x.s)).sort(byScore);
  const top = [...fromW1, ...others].slice(0, TOP_NAMES);
  const leg3 = top.length && leg2 === 'yes' ? 'yes' : 'no';
  const topWords = listWords(top.map((x) => (pct ? `${x.s} (${roughPct(x.a.p)})` : x.s)));

  const legsYes = [leg1, leg2, leg3].filter((l) => l === 'yes').length;

  // ---- title (plain words; metaphors are introduced with meanings in the tag) ----
  let title;
  if (legsYes === 3) title = `All three line up: indexes rising, ${hotName} leading, ${listWords(top.map((x) => x.s))} strongest inside it`;
  else if (leg1 !== 'no' && leg2 === 'yes') title = `Two of three line up: indexes and ${hotName} rising, no name in it stronger than SPY`;
  else if (divergence) title = `No line-up: ${hotName} rising while the indexes are not`;
  else if (leg1 === 'yes') title = `One of three lines up: indexes rising, but ${hotName}, the leading sector, is not`;
  else title = `No line-up today: the indexes are not rising together, ${hotName} leads the sectors`;

  // ---- tag: lead with whether all three line up, metaphors explained on first use ----
  const nWord = ['none', 'one', 'two', 'all three'][legsYes];
  used.add('line_up'); // the line-up image is defined right here, in the edition's first sentence
  const lineUp = legsYes === 3
    ? `All three of my lights line up today (${gl.line_up.inline}).`
    : `${cap(nWord === 'none' ? 'none' : `only ${nWord}`)} of my three lights ${legsYes === 1 ? 'lines' : 'line'} up today (lining up means ${gl.line_up.inline}).`;
  // Functions, so only the chosen sentence spends the first-use definitions.
  const tideLine = {
    rising: () => `${cap(img('tide'))} is rising: all four closed above rising ${img('trend_line', 'trend lines')}`,
    mixed: () => `${cap(img('tide'))} is mixed: ${listWords(risingFunds.map((f) => f.symbol)) || 'none'} closed above rising ${img('trend_line', 'trend lines')}${risingFunds.length ? ', the rest did not' : ''}`,
    falling: () => `${cap(img('tide'))} is going out: none of the four closed above a rising ${img('trend_line', 'trend line')}`,
  }[tide]();
  const sectorLine = divergence
    ? `${img('hot_sector')} is ${hotName}, rising while the tide goes out: ${img('crosscurrent')}`
    : hot.a.rising
      ? `${img('hot_sector')} is ${hotName}, rising with it`
      : `${img('hot_sector')} is ${hotName}, though it is not above a rising trend line`;
  const namesLine = top.length
    ? `Inside ${hotName}, the strongest rising names are ${topWords}.`
    : `Inside ${hotName}, no name on my lists is both rising and stronger than SPY.`;
  const tag = `${lineUp} ${tideLine}. ${cap(sectorLine)}. ${namesLine}`;

  // ---- convergence block ----
  const status = (l) => (l === 'yes' ? 'Lined up' : l === 'partly' ? 'Partly lined up' : 'Not lined up');
  const convergence = {
    summary: legsYes === 3
      ? 'The tide, the hot sector and its strongest names all point the same way today. This is the line-up my rules look for.'
      : `Today ${['none', 'one', 'two'][legsYes]} of the three ${legsYes === 1 ? 'points' : 'point'} the same way. My rules look for all three together.`,
    items: [
      `${status(leg1)}: the tide. ${leg1 === 'yes' ? 'All four index funds closed above rising trend lines' : tide === 'falling' ? 'None of the four index funds closed above a rising trend line' : `${listWords(risingFunds.map((f) => f.symbol))} closed above rising trend lines, ${listWords(funds.filter((f) => !f.a.rising).map((f) => f.symbol))} did not`}.`,
      `${status(leg2)}: the hot sector. ${hotName} (${hot.etf}) leads the sector funds against SPY${pct ? ` and moved ${about(hot.a.p)} ${hot.a.p >= 0 ? 'up' : 'down'}` : ''}, ${trendWords(hot.a)}${divergence ? ', while the indexes are not rising' : ''}.`,
      `${status(leg3)}: the strongest names. ${top.length ? `${topWords} ${top.length === 1 ? 'is' : 'are'} rising and stronger than SPY inside ${hotName}` : `No ${hotName} name on my lists is both rising and stronger than SPY`}${top.length && leg2 !== 'yes' ? ', though the sector itself is not lined up' : ''}.`,
    ],
  };

  // ---- index fund rows ----
  const colourWords = { green: 'above my short, middle and long trend lines, the middle one not pointing up', amber: 'dipped below my short trend line, longer ones intact', yellow: 'below my middle trend line, above the long one', orange: 'below my long trend line', red: 'below my short, middle and long trend lines' };
  const weather = {};
  for (const f of funds) {
    const parts = [cap(moveWord(f.a.p)) + (pct ? `, ${about(f.a.p)}` : '') + ' on the day'];
    parts.push(f.a.rising ? 'above a rising trend line' : f.a.colour ? colourWords[f.a.colour] : trendWords(f.a));
    weather[f.key] = { read: parts.join(', ') };
    if (pct) weather[f.key].change = roughPct(f.a.p);
  }
  const vp = vix.p;
  const sky = vp >= 3 ? 'turned stormy' : vp >= 0.5 ? 'turned choppy' : vp <= -3 ? 'turned much calmer' : vp <= -0.5 ? 'turned calmer' : 'stayed steady';
  weather.volatility = `${cap(img('weather'))} ${sky}${pct ? `: VIX moved ${about(vp)} ${vp >= 0 ? 'higher' : 'lower'}` : ''}`;

  const ups = funds.filter((f) => dir(f.a.p) > 0).map((f) => f.symbol);
  const downs = funds.filter((f) => dir(f.a.p) < 0).map((f) => f.symbol);
  const breadth =
    ups.length === 4 ? 'Gains were broad: all four index funds closed higher on the day'
      : downs.length === 4 ? 'Declines were broad: all four index funds closed lower on the day'
        : !ups.length && !downs.length ? 'A quiet day: all four index funds closed near flat'
          : `A split day: ${listWords(ups) || 'none'} higher, ${listWords(downs) || 'none'} lower on the day`;
  let wind = '';
  if (Math.abs(spy.p) >= 1 && tide !== 'mixed') {
    const withTide = (tide === 'rising' && spy.p > 0) || (tide === 'falling' && spy.p < 0);
    wind = withTide
      ? `. ${cap(img('wind', 'the wind picked up'))}`
      : `. ${cap(img('wind', 'the wind blew against the tide', 'a large move against the direction of the tide'))}`;
  }
  weather.tone = breadth + wind;

  const w1 = config.watchlist_i.symbols.filter((s) => !never.has(s)).map((s) => analyze(series[s], date)).filter(Boolean);
  const w2 = config.watchlist_ii.symbols.filter((s) => !never.has(s)).map((s) => analyze(series[s], date)).filter(Boolean);
  const all = [...w1, ...w2];
  const allRising = all.filter((a) => a.rising).length / (all.length || 1);
  weather.sentiment = {
    label: allRising >= 0.6 ? 'Firm' : allRising <= 0.35 ? 'Soft' : 'Mixed',
    qualifier: 'my own read of how many names on my Watchlist I and Watchlist II sit above rising trend lines, not a survey or a forecast',
  };

  const count = (k, n) => (pct ? ` (${k} of ${n})` : '');
  const w1r = w1.filter((a) => a.rising).length;
  const w2r = w2.filter((a) => a.rising).length;
  const cluster = [
    `Coolest sector: ${coolName} (${cool.etf}), weakest of the sector funds against SPY${pct ? `, ${roughPct(cool.a.p)} on the day` : ''}`,
    `Watchlist I, the names my rules allow me to trade: ${shareWord(w1r, w1.length)} sit above rising trend lines${count(w1r, w1.length)}`,
    `Watchlist II, the candidates I am still measuring: ${shareWord(w2r, w2.length)} sit above rising trend lines${count(w2r, w2.length)}`,
  ];

  return {
    schema: SCHEMA,
    data_level: dataLevel,
    title,
    tag,
    convergence,
    weather,
    cluster,
    _sources: {
      generator: 'scripts/harbor-daily.mjs (fixed templates, src/harbor-compose.mjs)',
      data: source,
      hot_sector: hot.etf,
      sector_rank: ranked.map((x) => x.etf),
      legs: { tide: leg1, hot_sector: leg2, names: leg3 },
    },
  };
}
