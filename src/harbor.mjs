/**
 * Harbor Now: the daily market report, rendered natively on this site.
 *
 * Source: data/harbor/<date>.data.json, copied unchanged from lime-web-public
 * (harbor-now/archive/). The source files are never edited. Everything that is not
 * public market commentary is dropped HERE, in the render step, by an allowlist:
 * only the fields named in PUBLIC_FIELDS reach a page. See DROPPED_FIELDS for what is
 * left out and why.
 *
 * Output:
 *   harbor-now/index.html          latest edition + archive list
 *   harbor-now/<date>/index.html   one page per edition
 */
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export const HARBOR_NOTICE =
  'Educational market commentary, not investment advice. We do not know your situation, ' +
  'and past conditions do not predict future results.';

/** Days after which the latest edition is called out as not current. */
export const STALE_AFTER_DAYS = 3;

/**
 * Fields in the source JSON that are deliberately NOT rendered on the public pages.
 * Kept as data so the build, the tests and the PR description agree.
 */
export const DROPPED_FIELDS = {
  account:
    '"Account & Behavior Stance": "Mission for today" directives, "Broker status" lines ' +
    '(IB paper / Schwab pending) and event-risk posture. Personal account posture, not ' +
    'market commentary.',
  checklist:
    '"Operations Checklist": internal pre-open checks (data flow, broker connections, ' +
    'overnight positions, stop logic). Internal operations detail.',
  body_muted:
    'Closing line ("Cash is safety; let discipline come first." and similar). Personal ' +
    'posture advice.',
  _sources:
    'Internal provenance notes (which tools fetched the data, which lines were drafts ' +
    'awaiting review). Not reader content.',
  'cluster["Behavior rule: …"]':
    'Behavior directives ("do not chase…", "wait for…"). Advice, not description.',
  'cluster clauses':
    'Directive clauses after a semicolon in otherwise descriptive cluster lines ' +
    '("…; verify timing before the next session", "…; do not chase it"). The descriptive ' +
    'part of the line is kept.',
};

/** Canon reference sections dropped from the generic Rosie Canon Rules block. */
export const DROPPED_CANON_SECTIONS = {
  'Behavior Language':
    'Personal posture lines ("patience is the position", "a calm account … is a win"). Reads as advice.',
  'Alert & Control Rules': 'Describes alerts; this site makes no alerts promise.',
};

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Account-number shapes (IB U1234567 / DU1234567, long digit runs, masked numbers). */
const ACCOUNT_NUMBER = /\b(?:D?U\d{5,}|\d{7,})\b|[*xX]{2,}\d{3,}/g;
export const scrub = (s) => String(s).replace(ACCOUNT_NUMBER, '[redacted]');

const DIRECTIVE_CLAUSE =
  /^(do not|don't|verify|review|wait|avoid|keep|protect|size|let|stand aside|consider)\b|permission to chase|not a chase|supports patience/i;

/** A cluster line is kept only if descriptive; directive trailing clauses are cut. */
export function publicClusterLine(line) {
  if (/^\s*behavior rule\s*:/i.test(line)) return null;
  const [head, ...rest] = line.split(/;\s+/);
  const kept = [head, ...rest.filter((c) => !DIRECTIVE_CLAUSE.test(c.trim()))];
  return kept.join('; ');
}

const SYMBOLS = [
  ['spy', 'SPY', 'S&P 500 ETF'],
  ['qqq', 'QQQ', 'Nasdaq 100 ETF'],
  ['dia', 'DIA', 'Dow 30 ETF'],
  ['iwm', 'IWM', 'Russell 2000 ETF'],
];

/** Allowlist projection: the only shape a page is ever rendered from. */
export function publicEdition(date, raw) {
  const wx = raw.weather || {};
  const s = (v) => scrub(v ?? '');
  return {
    date,
    title: s(raw.title),
    tag: s(raw.tag),
    rows: SYMBOLS.filter(([k]) => wx[k]).map(([k, symbol, name]) => ({
      symbol,
      name,
      price: s(wx[k].price),
      change: s(wx[k].change),
      high52: wx[k].high52 ? s(wx[k].high52) : '',
      read: s(wx[k].read),
    })),
    sentiment: { label: s(wx.sentiment?.label), qualifier: s(wx.sentiment?.qualifier) },
    volatility: s(wx.volatility),
    tone: s(wx.tone),
    cluster: (raw.cluster || []).map(publicClusterLine).filter(Boolean).map(s),
  };
}

/* ---------- dates ---------- */

const asUtc = (iso) => new Date(`${iso}T00:00:00Z`);
const fmt = (iso, opts) => asUtc(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
export const longDate = (iso) => fmt(iso, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
export const prettyDate = (iso) => fmt(iso, { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (iso) => fmt(iso, { year: 'numeric', month: 'short', day: 'numeric' });

/** Today's date in New York (the market's zone), or HARBOR_NOW_TODAY for tests. */
export function todayIso() {
  if (process.env.HARBOR_NOW_TODAY) return process.env.HARBOR_NOW_TODAY;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}
export const daysBetween = (a, b) => Math.round((asUtc(b) - asUtc(a)) / 86400000);
export const staleNote = (latestIso) => `Latest edition: ${prettyDate(latestIso)}. Publishing is being restarted.`;

/* ---------- static canon reference (generic Rosie rules, from new.py) ---------- */

const CANON = [
  ['Operator Logic', [
    'Rosie operates in this order: observe, classify, rank, propose, then execute only if allowed.',
    "Rosie's core verdict states are Enter, Watch, and Avoid.",
    'Rosie judges each symbol relative to SPY market weather, not in isolation.',
    'Symbols equal to or slightly stronger than SPY lean favorable for entry; weaker-than-SPY setups are lower quality.',
  ]],
  ['Entry Rules', [
    'Blue progression is light blue to medium blue to dark blue. Weakness progression is yellow to orange to red-orange to red.',
    'Rosie uses the 1-hour chart range tool workflow with recurring 1% or 2% structure bands where relevant.',
    'About 0.5% is treated as the conservative seed-entry strike zone near support.',
    'Rosie prefers entries near a recent low with K line crossing above its signal line, rather than chasing extended price.',
    'If price leaves the entry band, the verdict downgrades from Enter to Watch or Avoid.',
  ]],
  ['Operator Chart Tools', [
    'Range Tool 1: maroon arrows, anchored at the left-side peak, expanded to 0.5%.',
    'Range Tool 2: prior high down to the low, color bar set to light blue.',
    'These tools define the safe strike zone and pullback structure, not a blind trigger.',
  ]],
  ['Risk Rules', [
    'Rosie remains approval-based first, even if fuller automation becomes available later.',
    'No trade is sent unless the route is intentionally armed by the operator.',
    'After each buy, Rosie creates or requires protective stop logic immediately, not as an afterthought.',
    'Stop placement respects structure and the last qualified support area, not an arbitrary fixed percent.',
    'Rosie helps prevent revenge behavior by locking out low-quality re-entries after failed setups until conditions improve.',
    'Near-ATH tape means stops must be respected faster — extended distance to support is lower here.',
  ]],
  ['Performance Rules', [
    'Rosie maintains a journal and performance review trail so rules can be tuned over time.',
    'Canon and tactics stay distinct — doctrine governs what Rosie is allowed to do, tactics govern how Rosie interprets setups inside those bounds.',
  ]],
  ['Canon vs. Tactics', [
    'Harbor Now canon defines sea-state reading and account posture — the top-level doctrine that constrains what Rosie is allowed to do.',
    'Tactics live underneath and may evolve, as long as they remain inside canon.',
    'Changes to canon are rare, deliberate edits, not session-by-session adjustments.',
  ]],
];

const renderCanon = () =>
  CANON.map(
    ([h, items]) => `
              <h3>${esc(h)}</h3>
              <ul class="ticks">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
  ).join('');

/* ---------- page pieces ---------- */

function renderTable(ed) {
  const rows = ed.rows
    .map(
      (r) => `
                <tr>
                  <th scope="row"><span class="sym">${esc(r.symbol)}</span>
                    <span class="sym__name">${esc(r.name)}</span>
                    <span class="hn-read">${esc(r.read)}</span>
                  </th>
                  <td class="num">${esc(r.price)}</td>
                  <td class="num ${r.change.trim().startsWith('-') ? 'num--down' : 'num--up'}">${esc(r.change)}</td>
                  <td class="num hn-hi">${r.high52 ? esc(r.high52) : '&mdash;'}</td>
                </tr>`,
    )
    .join('');
  return `<div class="table-wrap">
              <table class="data-table hn-table" data-harbor-table>
                <caption class="sr-only">Index fund closes, ${esc(longDate(ed.date))}</caption>
                <thead>
                  <tr>
                    <th scope="col">Fund</th>
                    <th scope="col" class="num">Close</th>
                    <th scope="col" class="num">Change</th>
                    <th scope="col" class="num hn-hi">52-wk high</th>
                  </tr>
                </thead>
                <tbody>${rows}
                </tbody>
              </table>
            </div>`;
}

function renderEditionBody(ed, headingLevel = 'h1') {
  const cluster = ed.cluster.length
    ? `
          <h2 class="hn-h">Cluster behavior</h2>
          <ul class="ticks hn-list" data-harbor-cluster>${ed.cluster.map((c) => `
            <li>${esc(c)}</li>`).join('')}
          </ul>`
    : '';
  return `<div class="panel hn-panel">
            <div class="panel__head">
              <p class="label" data-harbor-date>Close of <time datetime="${ed.date}">${esc(longDate(ed.date))}</time></p>
              <p class="flag">Dated report — not real-time data</p>
            </div>
            <${headingLevel} class="hn-title">${esc(ed.title)}</${headingLevel}>
            <p class="hn-tag">${esc(ed.tag)}</p>
            ${renderTable(ed)}
            <dl class="hn-wx">
              <div><dt>Sentiment</dt><dd><strong>${esc(ed.sentiment.label)}</strong> — ${esc(ed.sentiment.qualifier)}</dd></div>
              <div><dt>Volatility (VIX)</dt><dd>${esc(ed.volatility)}</dd></div>
              <div><dt>Tone</dt><dd>${esc(ed.tone)}</dd></div>
            </dl>
          </div>${cluster}`;
}

const notice = () => `<div class="notice hn-notice" data-harbor-notice>
            <span class="label">Please read</span>
            <p>${esc(HARBOR_NOTICE)}</p>
          </div>`;

const stale = (latest, today) =>
  daysBetween(latest, today) > STALE_AFTER_DAYS
    ? `<p class="warm-note hn-stale" data-harbor-stale>${esc(staleNote(latest))}</p>`
    : '';

function page({ title, description, canonicalPath, body, canonical }) {
  const html = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow" />
    <meta name="color-scheme" content="light" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%231f6b45'/%3E%3Cg stroke='%23f4f6f4' stroke-width='2.5' fill='none' stroke-linecap='square'%3E%3Cpath d='M6 21l7-7 5 5 8-8'/%3E%3Cpath d='M6 26h20'/%3E%3C/g%3E%3C/svg%3E" />
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/archivo-latin.woff2" crossorigin />
    <link rel="stylesheet" href="/assets/css/fonts.css" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/site.css" />
  </head>
  <body class="hn">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead">
      <div class="shell masthead__inner">
        <a class="brand" href="/">
          <svg class="brand__mark" width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true"><path d="M4 22l8-8 5 5 9-9" /><path d="M4 27h24" /></svg>
          <span class="brand__name">Lime Signalworks<span class="brand__unit">LIME Enterprise</span></span>
        </a>
        <nav class="masthead__nav" aria-label="Harbor Now">
          <a href="/">Home</a>
          <a href="/harbor-now/" data-harbor-nav>Daily market report</a>
          <a href="/harbor-now/#archive">Archive</a>
        </nav>
      </div>
    </header>
    <main id="main">
      <section class="section hn-section">
        <div class="shell">
${body}
        </div>
      </section>
    </main>
    <footer class="foot">
      <div class="shell foot__grid">
        <div>
          <p class="label">Lime Signalworks LLC · LIME Enterprise</p>
          <p class="foot__note">Harbor Now is the daily market report from Lime Signalworks: a dated, plain-language summary written after the close.</p>
          <p class="foot__harbor"><a class="anchor-link hn-foot-link" href="/">Back to the home page</a></p>
          <p class="foot__copyright">${esc(canonical.copyright)}</p>
        </div>
        <div>
          <p class="label">Disclaimer</p>
          <p class="foot__disclaimer">${esc(HARBOR_NOTICE)}</p>
          <p class="foot__disclaimer">${esc(canonical.securitiesDisclaimer)}</p>
          <p class="foot__disclaimer">${esc(canonical.riskDisclosure)}</p>
        </div>
      </div>
    </footer>
    <script src="/assets/js/app.js" defer></script>
  </body>
</html>
`;
  // Indexable only with the notice in place: refuse to emit an indexable page without it.
  if (!html.includes('data-harbor-notice') || !html.includes(esc(HARBOR_NOTICE))) {
    throw new Error(`Harbor page ${canonicalPath} is missing the required notice`);
  }
  return html;
}

/* ---------- build ---------- */

export async function loadEditions(root) {
  const dir = path.join(root, 'data', 'harbor');
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.data\.json$/.test(f)).sort();
  const editions = [];
  for (const f of files) {
    const date = f.slice(0, 10);
    editions.push(publicEdition(date, JSON.parse(await readFile(path.join(dir, f), 'utf8'))));
  }
  return editions; // oldest first
}

export async function buildHarbor(root, canonical) {
  const editions = await loadEditions(root);
  if (!editions.length) throw new Error('no Harbor Now editions in data/harbor/');
  const today = todayIso();
  const latest = editions[editions.length - 1];
  const out = path.join(root, 'harbor-now');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const newestFirst = [...editions].reverse();
  const archive = newestFirst
    .map(
      (ed) => `
            <li><a href="/harbor-now/${ed.date}/"><time class="hn-arch__date" datetime="${ed.date}">${esc(shortDate(ed.date))}</time><span class="hn-arch__title">${esc(ed.title)}</span></a></li>`,
    )
    .join('');

  const indexBody = `          <div class="section__head hn-head">
            <p class="label rule-after">Harbor Now · Daily market report</p>
            <h1 class="hn-h1">Harbor Now</h1>
            <p>A dated, plain-language read of the market after the close: SPY, QQQ, DIA and IWM, sentiment, volatility and the tone of the day.</p>
            ${stale(latest.date, today)}
          </div>
          ${notice()}
          <p class="label hn-latest-label">Latest edition</p>
          ${renderEditionBody(latest, 'h2')}
          <p class="anchor-row"><a class="anchor-link" href="/harbor-now/${latest.date}/">Open the ${esc(prettyDate(latest.date))} edition</a></p>
          <h2 class="hn-h" id="archive">Archive</h2>
          <p class="hn-count">${editions.length} editions, ${esc(prettyDate(editions[0].date))} to ${esc(prettyDate(latest.date))}.</p>
          <ol class="hn-arch" reversed data-harbor-archive>${archive}
          </ol>`;

  await writeFile(
    path.join(out, 'index.html'),
    page({
      title: 'Harbor Now — daily market report | Lime Signalworks',
      description: `Harbor Now, the Lime Signalworks daily market report. Latest edition: ${prettyDate(latest.date)}.`,
      canonicalPath: '/harbor-now/',
      body: indexBody,
      canonical,
    }),
    'utf8',
  );

  for (let i = 0; i < editions.length; i++) {
    const ed = editions[i];
    const prev = editions[i - 1];
    const next = editions[i + 1];
    const pager = [
      prev ? `<a class="anchor-link" href="/harbor-now/${prev.date}/" rel="prev">&larr; ${esc(prettyDate(prev.date))}</a>` : '',
      `<a class="anchor-link" href="/harbor-now/#archive">All editions</a>`,
      next ? `<a class="anchor-link" href="/harbor-now/${next.date}/" rel="next">${esc(prettyDate(next.date))} &rarr;</a>` : '',
    ].filter(Boolean).join('\n            ');
    const body = `          <div class="hn-head">
            <p class="label rule-after"><a href="/harbor-now/">Harbor Now</a> · ${esc(prettyDate(ed.date))}</p>
            ${stale(latest.date, today)}
          </div>
          ${notice()}
          ${renderEditionBody(ed, 'h1')}
          <details class="hn-canon">
            <summary>Rosie Canon Rules (reference, unchanged day to day)</summary>
            <div class="hn-canon__inner">${renderCanon()}
            </div>
          </details>
          <p class="anchor-row hn-pager">
            ${pager}
          </p>`;
    await mkdir(path.join(out, ed.date), { recursive: true });
    await writeFile(
      path.join(out, ed.date, 'index.html'),
      page({
        title: `Harbor Now — ${prettyDate(ed.date)} | Lime Signalworks`,
        description: `Harbor Now for the close of ${longDate(ed.date)}: ${ed.title}`,
        canonicalPath: `/harbor-now/${ed.date}/`,
        body,
        canonical,
      }),
      'utf8',
    );
  }
  return { count: editions.length, latest: latest.date, stale: daysBetween(latest.date, today) > STALE_AFTER_DAYS };
}
