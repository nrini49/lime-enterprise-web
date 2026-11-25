/**
 * Harbor Now daily edition composer: fixed, first-person sentence templates in
 * Rosie's voice, filled from one day's closes. Pure function, no network: the
 * publisher (scripts/harbor-daily.mjs) fetches the closes and calls compose().
 *
 * Owner decisions (2026-10-28, 2026-11-25):
 *   - Rosie speaks as "I", describes how the day looked, and never advises.
 *   - Only Rosie's own watchlists are covered; the four index funds are context.
 *     No outside news, no catalysts, no earnings calendar.
 *   - Watchlist II is described as a group unless the config says to name it,
 *     so nobody's picks are re-posted.
 *   - data_level "words" (default) prints no market numbers; "pct" adds rounded
 *     percent changes. Prices are never written in either mode.
 *   - The old account / checklist / body_muted fields are never written.
 *
 * Every sentence below must pass the Harbor voice gates in src/harbor.mjs with
 * no voice file (tests/harbor-daily.test.mjs proves it over many synthetic days),
 * so the build itself is the advice filter for every published edition.
 */

export const SCHEMA = 'rosie-daily-v1';
export const DATA_LEVELS = ['words', 'pct'];
const FLAT = 0.1; // |%| below this reads as flat

export const pctChange = (q) => (q && q.prev > 0 && q.close > 0 ? (q.close / q.prev - 1) * 100 : null);

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

/** Share in words: all, most, more than half, about half, fewer than half, a few, none. */
export function shareWord(k, n) {
  if (!n) return 'none';
  if (k === n) return 'all';
  if (k === 0) return 'none';
  const f = k / n;
  if (f >= 0.75) return 'most';
  if (f > 0.55) return 'more than half';
  if (f >= 0.45) return 'about half';
  if (f > 0.25) return 'fewer than half';
  return 'only a few';
}

const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const fundLabel = (sym) => (sym === 'IWM' ? 'small caps (IWM)' : sym);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** {sym: pct} for the symbols that have both closes. */
function moves(symbols, quotes) {
  const out = [];
  for (const s of symbols) {
    const p = pctChange(quotes[s]);
    if (p != null && Number.isFinite(p)) out.push({ s, p });
  }
  return out;
}

function vixPhrase(vp) {
  if (vp >= 3) return { title: 'as volatility jumps', line: 'Volatility jumped: VIX closed well above the day before', word: 'jumped' };
  if (vp >= 0.5) return { title: 'as volatility rises', line: 'Volatility rose: VIX closed above the day before', word: 'rose' };
  if (vp <= -3) return { title: 'as volatility drops', line: 'Volatility dropped: VIX closed well below the day before', word: 'dropped' };
  if (vp <= -0.5) return { title: 'as volatility eases', line: 'Volatility eased: VIX closed below the day before', word: 'eased' };
  return { title: 'with volatility little changed', line: 'Volatility was little changed: VIX closed near the day before', word: 'was little changed' };
}

function groupLines(label, list, spy, pct, nameSymbols, intro) {
  const lines = [];
  if (!list.length) return lines;
  const n = list.length;
  const up = list.filter((m) => dir(m.p) > 0).length;
  const beat = list.filter((m) => m.p - spy > 0.05).length;
  const count = (k) => (pct ? ` (${k} of ${n})` : '');
  lines.push(`${intro}: ${shareWord(up, n)} of the names closed higher${count(up)}, and ${shareWord(beat, n)} did better than SPY${count(beat)}`);
  if (nameSymbols && n >= 6) {
    const sorted = [...list].sort((a, b) => b.p - a.p || a.s.localeCompare(b.s));
    const top = sorted.slice(0, 3);
    const bottom = sorted.slice(-3).reverse();
    const fmt = (xs) => listWords(xs.map((m) => (pct ? `${m.s} (${roughPct(m.p)})` : m.s)));
    lines.push(`Strongest on ${label} today: ${fmt(top)}`);
    lines.push(`Weakest on ${label} today: ${fmt(bottom)}`);
  }
  return lines;
}

/**
 * compose({ date, quotes: {SYM: {prev, close}}, vix: {prev, close}, config, dataLevel, source })
 * -> raw edition object for data/harbor/<date>.data.json.
 */
export function compose({ date, quotes, vix, config, dataLevel = config.data_level || 'words', source = '' }) {
  if (!DATA_LEVELS.includes(dataLevel)) throw new Error(`unknown data_level "${dataLevel}"`);
  const pct = dataLevel === 'pct';
  const never = new Set(config.never_publish || []);
  const funds = config.index_funds.map((f) => ({ ...f, p: pctChange(quotes[f.symbol]) }));
  const missingFunds = funds.filter((f) => f.p == null).map((f) => f.symbol);
  if (missingFunds.length) throw new Error(`missing closes for index funds: ${missingFunds.join(', ')}`);
  const vp = pctChange(vix);
  if (vp == null) throw new Error('missing VIX closes');
  const spy = funds.find((f) => f.symbol === 'SPY').p;
  const fundSyms = new Set(funds.map((f) => f.symbol));
  const pick = (wl) => (wl.symbols || []).filter((s) => !never.has(s) && !fundSyms.has(s));
  const w1 = moves(pick(config.watchlist_i), quotes);
  const w2 = moves(pick(config.watchlist_ii), quotes);

  // ---- index funds (context) ----
  const ups = funds.filter((f) => dir(f.p) > 0);
  const downs = funds.filter((f) => dir(f.p) < 0);
  const byP = [...funds].sort((a, b) => b.p - a.p);
  const best = byP[0];
  const worst = byP.at(-1);
  const vx = vixPhrase(vp);
  let breadth;
  let leader;
  if (ups.length === 4) { breadth = 'Broad green close'; leader = `${fundLabel(best.symbol)} strongest`; }
  else if (downs.length === 4) { breadth = 'Broad red close'; leader = `${fundLabel(worst.symbol)} weakest`; }
  else if (!ups.length && !downs.length) { breadth = 'Quiet, flat close'; leader = 'all four funds near unchanged'; }
  else { breadth = 'Mixed close'; leader = `${fundLabel(best.symbol)} leads, ${fundLabel(worst.symbol)} lags`; }
  const title = `${breadth} — ${leader} ${vx.title}`;

  let fundSummary;
  if (ups.length === 4) fundSummary = 'all four closed higher';
  else if (downs.length === 4) fundSummary = 'all four closed lower';
  else {
    const parts = [];
    if (ups.length) parts.push(`${listWords(ups.map((f) => f.symbol))} closed higher`);
    if (downs.length) parts.push(`${listWords(downs.map((f) => f.symbol))} closed lower`);
    const flats = funds.filter((f) => dir(f.p) === 0);
    if (flats.length) parts.push(`${listWords(flats.map((f) => f.symbol))} closed flat`);
    fundSummary = parts.join(', ');
  }
  const w1up = w1.filter((m) => dir(m.p) > 0).length;
  const tag =
    `Of the four index funds I track for context, ${fundSummary}, and volatility ${vx.word}. ` +
    `On my Watchlist I, ${shareWord(w1up, w1.length)} of the names closed higher${pct ? ` (${w1up} of ${w1.length})` : ''}.`;

  const weather = {};
  for (const f of funds) {
    const rel =
      f.symbol === 'SPY'
        ? 'the broad-market fund I measure the others against'
        : f.p - spy > 0.25 ? 'stronger than SPY' : f.p - spy < -0.25 ? 'weaker than SPY' : 'in line with SPY';
    weather[f.key] = { read: `${cap(moveWord(f.p))}${pct ? `, ${about(f.p)}` : ''}, ${rel}` };
    if (pct) weather[f.key].change = roughPct(f.p);
  }
  weather.volatility = pct ? `${vx.line} (${about(vp)} ${vp >= 0 ? 'higher' : 'lower'})` : vx.line;

  let tone;
  const quiet = funds.every((f) => Math.abs(f.p) < 0.25);
  if (quiet) tone = 'A quiet day, with small moves across the four funds';
  else if (downs.length === 4 && vp >= 0.5) tone = 'A risk-off day: declines were broad and nerves rose';
  else if (ups.length === 4 && vp <= -0.5) tone = 'A risk-on day: gains were broad and nerves eased';
  else if (downs.length === 4) tone = 'Declines were broad across the four funds';
  else if (ups.length === 4) tone = 'Gains were broad across the four funds';
  else if (ups.length === 1) tone = `A narrow day: only ${ups[0].symbol} closed higher among the four funds`;
  else if (downs.length === 1) tone = `A mostly firm day: only ${downs[0].symbol} closed lower among the four funds`;
  else tone = `A split day: ${listWords(ups.map((f) => f.symbol))} higher, ${listWords(downs.map((f) => f.symbol))} lower`;
  weather.tone = tone;

  const all = [...w1, ...w2.filter((m) => !w1.some((x) => x.s === m.s))];
  const allUp = all.filter((m) => dir(m.p) > 0).length / (all.length || 1);
  weather.sentiment = {
    label: allUp >= 0.65 ? 'Firm' : allUp <= 0.35 ? 'Soft' : 'Mixed',
    qualifier: 'my own read of how the names on my Watchlist I and Watchlist II closed, not a survey or a forecast',
  };

  const cluster = [
    ...groupLines('my Watchlist I', w1, spy, pct, config.watchlist_i.name_symbols !== false, 'Watchlist I, the names my rules allow me to trade'),
    ...groupLines('my Watchlist II', w2, spy, pct, config.watchlist_ii.name_symbols === true, 'Watchlist II, the candidates I am still measuring'),
  ];

  return {
    schema: SCHEMA,
    data_level: dataLevel,
    title,
    tag,
    weather,
    cluster,
    _sources: {
      generator: 'scripts/harbor-daily.mjs (fixed templates, src/harbor-compose.mjs)',
      data: source,
      coverage: { watchlist_i: `${w1.length}/${pick(config.watchlist_i).length}`, watchlist_ii: `${w2.length}/${pick(config.watchlist_ii).length}` },
    },
  };
}
