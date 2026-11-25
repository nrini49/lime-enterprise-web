#!/usr/bin/env node
/**
 * Harbor Now daily publisher: writes one edition for one NYSE close.
 *
 *   node scripts/harbor-daily.mjs [--date=YYYY-MM-DD] [--dry-run] [--scheduled]
 *                                 [--data-level=words|pct] [--force] [--out=FILE]
 *
 *   --date        the close to describe (default: today in New York)
 *   --dry-run     write the edition to dist/harbor-dry-run/ (or --out), never to
 *                 data/harbor/. Also on when HARBOR_DRY_RUN is not "false".
 *   --scheduled   a cron run: skip quietly before 5:15 PM New York time (the
 *                 workflow has one cron for EST and one for EDT) and when the
 *                 edition already exists.
 *   --data-level  override data/harbor-config.json for this run.
 *
 * It skips (exit 0) on weekends and NYSE holidays (data/market-calendar.json),
 * fails (exit 1) when data is missing, and always runs the Harbor voice gates
 * (src/harbor.mjs publicEdition) on what it wrote. A plain-text preview goes to
 * stdout and, in GitHub Actions, to the job summary. Nothing is uploaded here.
 */
import { readFile, writeFile, mkdir, appendFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, rankSectors, sectorCandidates } from '../src/harbor-compose.mjs';
import { isTradingDay, nyClock, calendarWarning } from '../src/harbor-calendar.mjs';
import { publicEdition, longDate, HARBOR_NOTICE } from '../src/harbor.mjs';
import { fetchSeries, chooseProvider } from './harbor-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

async function output(pairs) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''));
}
async function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}
const exists = (p) => access(p).then(() => true, () => false);

/** Plain-text preview of what the page will show (after the voice gates). */
export function previewText(date, raw) {
  const ed = publicEdition(date, raw);
  const lines = [
    `Harbor Now · From Rosie · Close of ${longDate(date)}`,
    `(${HARBOR_NOTICE})`,
    '',
    ed.title,
    ed.tag,
    '',
    ...(ed.convergence ? ['Where my signals line up', ed.convergence.summary, ...ed.convergence.items.map((i) => `- ${i}`), ''] : []),
    ...ed.rows.map((r) => `${r.symbol} (${r.name})${r.change ? ` ${r.change}` : ''}: ${r.read}`),
    '',
    `Sentiment: ${ed.sentiment.label} — ${ed.sentiment.qualifier}`,
    `Volatility (VIX): ${ed.volatility}`,
    `Tone: ${ed.tone}`,
    '',
    'My watchlists',
    ...ed.cluster.map((c) => `- ${c}`),
  ];
  return lines.join('\n');
}

async function main() {
  const now = nyClock(new Date());
  const date = typeof args.date === 'string' ? args.date : now.iso;
  const dry = Boolean(args['dry-run']) || (process.env.HARBOR_DRY_RUN ?? 'true') !== 'false';
  const cal = JSON.parse(await readFile(path.join(root, 'data', 'market-calendar.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(root, 'data', 'harbor-config.json'), 'utf8'));
  const dataLevel = typeof args['data-level'] === 'string' ? args['data-level'] : process.env.HARBOR_DATA_LEVEL || config.data_level;
  const target = path.join(root, 'data', 'harbor', `${date}.data.json`);

  const warn = calendarWarning(date, cal);
  if (warn) console.warn(`warning: ${warn}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad --date "${date}"`);
  if (!isTradingDay(date, cal)) {
    const why = cal.full_closures[date] ? `NYSE holiday (${cal.full_closures[date]})` : 'weekend';
    console.log(`skip: ${date} is not a trading day: ${why}`);
    await output({ status: 'skipped', date, reason: why });
    return;
  }
  if (args.scheduled && date === now.iso && now.minutes < 17 * 60 + 15) {
    console.log('skip: scheduled run before 5:15 PM New York time (the other cron covers today)');
    await output({ status: 'skipped', date, reason: 'before 5:15 PM ET' });
    return;
  }
  if (!dry && !args.force && (await exists(target))) {
    console.log(`skip: data/harbor/${date}.data.json already exists`);
    await output({ status: 'skipped', date, reason: 'edition exists' });
    return;
  }

  const never = new Set(config.never_publish || []);
  const sectors = JSON.parse(await readFile(path.join(root, 'data', 'sector-members.json'), 'utf8'));
  const symbols = [
    ...new Set([
      ...config.index_funds.map((f) => f.symbol),
      ...config.sector_funds,
      ...config.watchlist_i.symbols,
      ...config.watchlist_ii.symbols,
    ]),
  ].filter((s) => !never.has(s));
  const provider = chooseProvider(config.provider);
  // --cache=FILE (local testing only): reuse fetched closes instead of asking the provider again.
  const cacheFile = typeof args.cache === 'string' ? path.resolve(args.cache) : null;
  const cached = cacheFile && (await exists(cacheFile)) ? JSON.parse(await readFile(cacheFile, 'utf8')) : null;
  const first = cached ? { series: cached.series, missing: [], source: cached.source } : await fetchSeries(symbols, date, { provider });
  const vixRes = cached ? { series: {} } : await fetchSeries(['^VIX'], date, { provider: 'yahoo' });
  const series = { ...first.series, ...vixRes.series };
  const missing = [...first.missing];

  const funds = config.index_funds.map((f) => f.symbol);
  const lostFunds = funds.filter((s) => !series[s]);
  if (lostFunds.length) throw new Error(`no ${date} closes for index funds ${lostFunds.join(', ')} (${first.source})`);
  if (!series['^VIX']) throw new Error(`no ${date} close for VIX`);
  for (const [name, list] of [['Watchlist I', config.watchlist_i.symbols], ['Watchlist II', config.watchlist_ii.symbols], ['sector funds', config.sector_funds]]) {
    const l = list.filter((s) => !never.has(s));
    const have = l.filter((s) => series[s]).length;
    if (have / l.length < (config.min_coverage ?? 0.8)) {
      throw new Error(`${name}: closes for only ${have} of ${l.length} symbols (missing ${l.filter((s) => !series[s]).join(', ')})`);
    }
  }
  // Second pass: the hot sector's member list (Rosie's own), for the strongest-names leg.
  const hot = rankSectors(series, date, config)[0];
  const extra = sectorCandidates(hot.etf, sectors, config).filter((s) => !series[s] && !missing.includes(s));
  if (extra.length) {
    const more = await fetchSeries(extra, date, { provider });
    Object.assign(series, more.series);
    missing.push(...more.missing);
  }
  if (missing.length) console.warn(`note: no closes for ${missing.join(', ')}; left out of today's reads`);
  if (cacheFile && !cached) await writeFile(cacheFile, JSON.stringify({ source: first.source, series }), 'utf8');

  const glossary = JSON.parse(await readFile(path.join(root, 'data', 'harbor-glossary.json'), 'utf8'));
  const raw = compose({ date, series, config, sectors, glossary, dataLevel, source: first.source });
  const text = previewText(date, raw); // throws HarborVoiceError if any line reads as advice
  const out = dry
    ? path.resolve(typeof args.out === 'string' ? args.out : path.join(root, 'dist', 'harbor-dry-run', `${date}.data.json`))
    : target;
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  console.log(`${dry ? 'DRY RUN: wrote' : 'wrote'} ${path.relative(root, out)} (data level: ${dataLevel}, ${first.source})\n`);
  console.log(text);
  await summary(`### Harbor Now ${date}${dry ? ' (dry run, not published)' : ''}\n\n\`\`\`\n${text}\n\`\`\``);
  await output({ status: dry ? 'dry-run' : 'written', date, file: path.relative(root, out) });
}

main().catch(async (e) => {
  console.error(`Harbor Now publisher failed: ${e.message}`);
  await summary(`### Harbor Now publisher failed\n\n${e.message}`);
  process.exit(1);
});
