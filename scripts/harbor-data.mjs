/**
 * Daily closes for the Harbor Now publisher. Two providers:
 *
 *   tiingo  Tiingo end-of-day API (official, free Starter plan: 50 requests an
 *           hour, 500 symbols a month). Used when TIINGO_API_TOKEN is set.
 *   yahoo   Yahoo Finance's public chart endpoint (no key). The fallback, and
 *           always the source for VIX (^VIX), which Tiingo does not carry.
 *
 * About six months of daily closes per symbol, enough for Rosie's trend averages.
 * Neither licence covers public display of raw prices. Harbor Now therefore
 * publishes only words, or rounded percent changes in "pct" mode, never prices.
 *
 * fetchSeries(symbols, date, opts) -> { series: {SYM: [{d, c}]}, missing: [SYM], source }
 */
const UA = 'Mozilla/5.0 (compatible; LimeSignalworks-HarborNow/1.0; +https://www.limesignalworks.com/harbor-now/)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nyDate = (unixSeconds) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(unixSeconds * 1000));

async function getJson(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status}`);
      if (res.status === 404) break;
    } catch (e) {
      last = e;
    }
    await sleep(1500 * (i + 1));
  }
  throw last;
}

/** Yahoo: daily bars for the last six months, keyed by New York date. */
export async function yahooSeries(symbol) {
  const ysym = symbol.replace('.', '-');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=6mo&interval=1d`;
  const j = await getJson(url);
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) return null;
  const closes = r.indicators?.quote?.[0]?.close || [];
  const out = [];
  r.timestamp.forEach((t, i) => {
    if (closes[i] != null) out.push({ d: nyDate(t), c: closes[i] });
  });
  return out;
}

/** Tiingo: raw daily closes for about six months before `date`. */
export async function tiingoSeries(symbol, date, token) {
  const start = new Date(Date.parse(`${date}T12:00:00Z`) - 190 * 86400000).toISOString().slice(0, 10);
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${start}&endDate=${date}&token=${encodeURIComponent(token)}`;
  const rows = await getJson(url);
  if (!Array.isArray(rows)) return null;
  return rows.map((x) => ({ d: String(x.date).slice(0, 10), c: x.close }));
}

export function chooseProvider(setting = 'auto', env = process.env) {
  if (setting === 'tiingo' || (setting === 'auto' && env.TIINGO_API_TOKEN)) {
    if (!env.TIINGO_API_TOKEN) throw new Error('provider "tiingo" needs the TIINGO_API_TOKEN secret');
    return 'tiingo';
  }
  return 'yahoo';
}

export async function fetchSeries(symbols, date, { provider = 'yahoo', env = process.env, pauseMs = 250 } = {}) {
  const series = {};
  const missing = [];
  for (const s of symbols) {
    try {
      const rows =
        provider === 'tiingo' && !s.startsWith('^') ? await tiingoSeries(s, date, env.TIINGO_API_TOKEN) : await yahooSeries(s);
      if (rows && rows.some((x) => x.d === date)) series[s] = rows;
      else missing.push(s);
    } catch {
      missing.push(s);
    }
    await sleep(pauseMs);
  }
  const source =
    provider === 'tiingo'
      ? 'Tiingo end-of-day closes (VIX from Yahoo Finance chart data)'
      : 'Yahoo Finance public chart data (end-of-day closes)';
  return { series, missing, source };
}
