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
import { siteNav, brandLink, blogStrip, legalNav } from './site.mjs';
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import * as harborCalendar from './harbor-calendar.mjs';

export const HARBOR_NOTICE =
  'Educational market commentary, not investment advice. We do not know your situation.';

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

/* ---------- voice: no advice-sounding language on the public pages ---------- */

/**
 * Editions were written with stance lines ("Protect first, wait for…", "no chase", "a day to
 * hold discipline"). The public pages describe the day instead: what it looked and felt like
 * from Rosie's seat, in her own first person ("I", "my seat", "to me"; 2026-10-28 owner
 * decision). Only the legal notice (HARBOR_NOTICE) keeps the company "we". Source JSON is never edited; rewrites live in
 * data/harbor-voice/<date>.json:
 *
 *   { "rewrites":    { "<exact source text>": "<rendered text>" },
 *     "descriptive": [ "<rendered text reviewed as description, kept as-is>" ] }
 *
 * Every rendered string goes through two gates:
 *   1. DIRECTIVE_VOCAB: text that *looks* directive (protect, size, wait, avoid, reduce, review,
 *      chase, stay, hold, trim, buy, sell, add, keep, let, treat, …) must have a rewrite, or be
 *      listed as reviewed "descriptive" (e.g. "SPY holds near flat"). Otherwise the build fails
 *      and names the string, so a new edition with new phrasing gets a rewrite before publishing.
 *   2. ADVICE_BANNED: advice wording that is never allowed on a page, reviewed or not.
 */
export const VOICE_DIR = path.join('data', 'harbor-voice');

/** Proper names that contain a vocabulary word ("JPMorgan Chase", "Best Buy"). */
export const PROPER_NAMES = ['JPMorgan Chase', 'Best Buy', 'On Holding', 'Group Holding'];
const neutral = (s) => PROPER_NAMES.reduce((t, n) => t.split(n).join('[name]'), String(s));

export const DIRECTIVE_VOCAB = new RegExp(
  '\\b(' +
    [
      'protect(s|ing)?', 'protective', 'size[sd]?', 'sizing', 'wait(s|ing)?', 'avoid(s|ing)?', 'reduc(e|es|ing)',
      'review(s|ing)?', 'chas(e|es|ing)', 'stay(s|ing)?', 'hold(s|ing)?', 'trim(s|ming)?', 'buy(s|ing)?',
      'sell(s|ing)?', 'add(s|ing)?', 'keep(s|ing)?', 'let', 'verify', 'treat(s|ing)?', 'consider',
      'participate', 'watch(ing)?', 'forc(e|ing)', 'disciplined?', 'patien(ce|t)', 'should', 'must',
      'needs?', 'warranted', 'matters', 'posture', 'pre-commitment', 'complacent', 'caution',
      'selective', 'selectivity', 'justify', 'reward', 'argues', 'calls for', 'free lunch(es)?',
      'a day to', 'call it', 'read [a-z ]+ as', 'stand aside', 'act',
    ].join('|') +
    ')\\b',
  'i',
);

/** Advice wording that may never render, whatever the voice file says. */
export const ADVICE_BANNED = [
  /protect[- ]first/i, /\bprotect\b/i, /\bsize\b/i, /\bsize down\b/i, /\bsizing\b/i, /\bchas(e|es|ing)\b/i,
  /\bnot a chase\b/i, /\ba day to\b/i, /\bshould\b/i, /\bmust\b/i, /\bdisciplin/i, /\bpatien(ce|t)\b/i,
  /\bwait(s|ing)?\b/i, /\bargues? (for|against)\b/i, /\bcalls for\b/i, /\bwarranted\b/i, /\bstand aside\b/i,
  /\b(do not|don't) [a-z]+/i, /\byou(r|'re)?\b/i, /\bforc(e|ing) a trade\b/i, /\bkeep an eye\b/i,
  /\bfree lunch/i, /\bcomplacent\b/i, /\badding risk\b/i, /\btrade the reaction/i, /\bpre-commitment\b/i,
  /\btreat\b/i, /\bverify\b/i, /\bselectivity\b/i, /\breview the event\b/i, /\breduce\b/i, /\btrim\b/i,
  /\bavoid/, /^Avoid\b/, /\b(buy|sell)\b/, /\blet\b/i, /\bparticipate only\b/i, /\bworth watching\b/i,
  /\bact\b/i, /\bposture favored\b/i, /\bfollow-through still matters\b/i,
];

/**
 * Rosie speaks for herself: a rendered line may say "I", "my" or "me", never the team's "we",
 * "our" or "us" (lowercase "us" only, so the country "US" is not caught).
 */
export const PLURAL_VOICE = /\b(?:[Ww]e|[Ww]e're|[Ww]e’re|[Ww]e've|[Ww]e’ve|[Ww]e'll|[Ww]e’ll|[Oo]ur|[Oo]urs|us)\b/;
export const pluralVoice = (s) => PLURAL_VOICE.test(neutral(s));

export const looksDirective = (s) => DIRECTIVE_VOCAB.test(neutral(s));
export const adviceHits = (s) => ADVICE_BANNED.filter((r) => r.test(neutral(s))).map(String);

export class HarborVoiceError extends Error {}

/* ---------- "How to read Harbor Now" key (2026-11-25) ----------
 * Owner: Harbor Now is a tour guide to how Rosie's rules read the day, and every metaphor
 * needs a plain meaning. The key is fixed text plus the glossary in data/harbor-glossary.json
 * (the same file the daily editions take their images from). It renders on every Harbor
 * page and passes the same advice and voice gates as the editions.
 */
export const HARBOR_KEY = {
  heading: 'How to read Harbor Now',
  intro:
    'Harbor Now is my plain-language tour of how my trading rules read the day. I use a few sea and ' +
    'weather images because they are easier to picture than chart terms. Each one means exactly one ' +
    'thing, listed below, and each edition explains an image in brackets the first time it appears.',
  lightsHeading: 'The three lights I line up',
  lights: [
    ['The tide.', 'The four main index funds (SPY, QQQ, DIA, IWM). The tide is rising when all four close above rising trend lines.'],
    ['The hot sector.', 'The sector fund strongest against SPY over recent sessions and today, and whether it is rising with the tide.'],
    ['The strongest names inside it.', 'Names in that sector, from my Watchlist I first, that are rising and stronger than SPY.'],
  ],
  lightsClose:
    'When all three point the same way, I say the lights line up. That is a description of the day, not a signal to trade.',
  glossaryHeading: 'The images I use, and what they mean',
};

export async function loadGlossary() {
  return JSON.parse(await readFile(new URL('../data/harbor-glossary.json', import.meta.url), 'utf8'));
}

export const keyText = (g, k = HARBOR_KEY) =>
  [k.heading, k.intro, k.lightsHeading, ...k.lights.flat(), k.lightsClose, k.glossaryHeading,
    ...g.entries.flatMap((e) => [e.image, e.inline, e.meaning, e.term])].join(' ');

/** Fails the build if the key or the glossary ever reads as advice or slips into "we". */
export function checkKey(g, k = HARBOR_KEY) {
  const seen = new Set();
  for (const e of g.entries) {
    for (const f of ['id', 'image', 'inline', 'meaning', 'term']) {
      if (!e[f] || typeof e[f] !== 'string') throw new HarborVoiceError(`glossary entry ${e.id || '?'} has no ${f}`);
    }
    if (seen.has(e.image.toLowerCase())) throw new HarborVoiceError(`glossary image "${e.image}" is used twice`);
    seen.add(e.image.toLowerCase());
  }
  const text = keyText(g, k);
  const hits = adviceHits(text);
  if (hits.length) throw new HarborVoiceError(`Harbor key reads as advice: ${hits.join(', ')}`);
  if (pluralVoice(text)) throw new HarborVoiceError('Harbor key says "we/our/us"; Rosie says "I"');
}

function renderKey(g, k = HARBOR_KEY) {
  const lights = k.lights.map(([t, b]) => `
              <li><strong>${esc(t)}</strong> ${esc(b)}</li>`).join('');
  const entries = g.entries.map((e) => `
              <div><dt>${esc(cap1(e.image))} <span class="hn-key__term">${esc(e.term)}</span></dt><dd>${esc(e.meaning)}</dd></div>`).join('');
  return `<div class="hn-guide hn-key" id="how-to-read" data-harbor-key>
            <h2 class="hn-h">${esc(k.heading)}</h2>
            <p>${esc(k.intro)}</p>
            <h3 class="hn-key__h">${esc(k.lightsHeading)}</h3>
            <ol class="hn-guide__list">${lights}
            </ol>
            <p>${esc(k.lightsClose)}</p>
            <h3 class="hn-key__h">${esc(k.glossaryHeading)}</h3>
            <dl class="hn-wx hn-key__list" data-harbor-glossary>${entries}
            </dl>
          </div>`;
}
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/* ---------- "How to use Harbor Now well" (2026-11-01) ---------- */

/**
 * A short reading guide on the Harbor Now index, in Rosie's first person. It is about how
 * to READ the report, never about what to do in the market, and it goes through the same
 * advice gate as the editions (ADVICE_BANNED, no "we/our/us"): buildHarbor fails if a line
 * slips. The stale date is not written here; the page's own restart note shows it.
 */
export const HARBOR_GUIDE = {
  heading: 'How to use Harbor Now well',
  intro:
    'Harbor Now is my dated, after-the-close read of the market. It describes conditions; it ' +
    'recommends nothing. It is a lighthouse, not a steering wheel. These six habits make it read best.',
  habits: [
    ['The date comes first.',
      'Every edition is stamped with the close it describes. Last Tuesday\'s report is history, not ' +
      'news. When the newest edition is more than a few days old, the page says so right at the top.'],
    ['Mood before numbers.',
      'The headline and its one-line summary give the shape of the day in a single breath: broad ' +
      'green, broad red, mixed, calm or jumpy. I take in the mood before any single figure.'],
    ['Four funds, side by side.',
      'SPY, QQQ, DIA and IWM together show whether a move was broad or narrow. One green fund among ' +
      'four red ones is a narrow day, and the report says so plainly.'],
    ['Volatility is the room temperature.',
      'VIX rising or easing shows how nervous the market felt. It colours the day; it predicts nothing.'],
    ['A week tells a story.',
      'One edition is a snapshot. Five in a row, from the archive, show whether calm is settling in ' +
      'or jitters are building.'],
    ['Context for the rules, never a signal.',
      'Harbor Now sits beside the written rules and my Operator Workstation as background. It is ' +
      'never a signal to trade, never a recommendation and never personal advice. The decisions ' +
      'belong to the person who owns the account.'],
  ],
  close:
    'Read that way, Harbor Now is good company: a clear, honest, dated picture of the day, and ' +
    'nothing pretending to be more.',
};

export const guideText = (g = HARBOR_GUIDE) =>
  [g.heading, g.intro, ...g.habits.flat(), g.close].join(' ');

/** Fails the build if the guide ever reads as advice or slips into "we". */
export function checkGuide(g = HARBOR_GUIDE) {
  const text = guideText(g);
  const hits = adviceHits(text);
  if (hits.length) throw new HarborVoiceError(`Harbor guide reads as advice: ${hits.join(', ')}`);
  if (pluralVoice(text)) throw new HarborVoiceError('Harbor guide says "we/our/us"; Rosie says "I"');
}

/**
 * The optional "how to use Harbor Now" video link. Rendered only when
 * canonical.videos.harborHowTo.url holds a real URL; until then nothing shows.
 */
function guideVideo(canonical) {
  const v = canonical && canonical.videos && canonical.videos.harborHowTo;
  if (!v || typeof v.url !== 'string' || !v.url) return '';
  return `
            <p class="video-row"><a class="video-cta" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer" data-video="harbor-how-to"><span class="video-cta__label">${esc(v.label)}</span><span class="ext" aria-hidden="true">&#8599;</span><span class="sr-only"> (opens in a new tab)</span></a></p>`;
}

function renderGuide(canonical, g = HARBOR_GUIDE) {
  const items = g.habits
    .map(([title, body]) => `
              <li><strong>${esc(title)}</strong> ${esc(body)}</li>`)
    .join('');
  return `<div class="hn-guide" id="how-to-use" data-harbor-guide>
            <h2 class="hn-h">${esc(g.heading)}</h2>
            <p>${esc(g.intro)}</p>
            <ol class="hn-guide__list">${items}
            </ol>
            <p class="hn-guide__close">${esc(g.close)}</p>${guideVideo(canonical)}
          </div>`;
}

const EMPTY_VOICE = Object.freeze({ rewrites: {}, descriptive: [] });

export async function loadVoice(root, date) {
  try {
    const v = JSON.parse(await readFile(path.join(root, VOICE_DIR, `${date}.json`), 'utf8'));
    return { rewrites: v.rewrites || {}, descriptive: v.descriptive || [] };
  } catch (e) {
    if (e.code === 'ENOENT') return EMPTY_VOICE;
    throw e;
  }
}

/**
 * Returns speak(field, source, project) for one edition, plus finish() which throws if any
 * directive-looking text has no rewrite, any advice wording would render, or the voice file
 * names text the edition does not contain.
 */
export function voiceFor(date, voice = EMPTY_VOICE) {
  const file = `${VOICE_DIR}/${date}.json`;
  const descriptive = new Set(voice.descriptive);
  const usedRewrites = new Set();
  const usedDescriptive = new Set();
  const unknown = [];
  const banned = [];
  const plural = [];
  const speak = (field, source, project = (x) => x) => {
    const src = String(source ?? '');
    let out;
    if (Object.hasOwn(voice.rewrites, src)) {
      usedRewrites.add(src);
      out = voice.rewrites[src];
    } else {
      out = project(src);
      if (out == null) return null;
      if (looksDirective(out)) {
        if (descriptive.has(out)) usedDescriptive.add(out);
        else unknown.push(`${field}: "${out}"`);
      }
    }
    const hits = adviceHits(out);
    if (hits.length) banned.push(`${field}: "${out}" (${hits.join(', ')})`);
    if (pluralVoice(out)) plural.push(`${field}: "${out}"`);
    return scrub(out);
  };
  const finish = () => {
    const problems = [];
    if (unknown.length) {
      problems.push(
        `directive-looking text with no rewrite. Add each to "rewrites" in ${file} ` +
          `(or to "descriptive" if it only describes the market):\n    - ${unknown.join('\n    - ')}`,
      );
    }
    if (banned.length) problems.push(`advice wording would render:\n    - ${banned.join('\n    - ')}`);
    if (plural.length) {
      problems.push(
        `"we/our/us" would render; Rosie speaks as "I/my/me". Fix in ${file}:\n    - ${plural.join('\n    - ')}`,
      );
    }
    const staleR = Object.keys(voice.rewrites).filter((k) => !usedRewrites.has(k));
    const staleD = [...descriptive].filter((k) => !usedDescriptive.has(k));
    if (staleR.length || staleD.length) {
      problems.push(`${file} names text this edition does not render:\n    - ${[...staleR, ...staleD].join('\n    - ')}`);
    }
    if (problems.length) throw new HarborVoiceError(`Harbor Now ${date}: ${problems.join('\n  ')}`);
  };
  return { speak, finish };
}

const SYMBOLS = [
  ['spy', 'SPY', 'S&P 500 ETF'],
  ['qqq', 'QQQ', 'Nasdaq 100 ETF'],
  ['dia', 'DIA', 'Dow 30 ETF'],
  ['iwm', 'IWM', 'Russell 2000 ETF'],
];

/** Allowlist projection: the only shape a page is ever rendered from, in the site's voice. */
export function publicEdition(date, raw, voice = EMPTY_VOICE) {
  const wx = raw.weather || {};
  const { speak, finish } = voiceFor(date, voice);
  const ed = {
    date,
    // Editions written by the daily publisher (scripts/harbor-daily.mjs) carry a schema;
    // the 47 copied July-September editions do not.
    schema: typeof raw.schema === 'string' ? raw.schema : null,
    title: speak('title', raw.title),
    tag: speak('tag', raw.tag),
    rows: SYMBOLS.filter(([k]) => wx[k]).map(([k, symbol, name]) => ({
      symbol,
      name,
      price: scrub(wx[k].price ?? ''),
      change: scrub(wx[k].change ?? ''),
      high52: wx[k].high52 ? scrub(wx[k].high52) : '',
      read: speak(`${symbol} read`, wx[k].read),
    })),
    sentiment: { label: speak('sentiment label', wx.sentiment?.label), qualifier: speak('sentiment', wx.sentiment?.qualifier) },
    volatility: speak('volatility', wx.volatility),
    tone: speak('tone', wx.tone),
    cluster: (raw.cluster || []).map((c) => speak('cluster', c, publicClusterLine)).filter(Boolean),
    // The daily publisher's three-way line-up (tide, hot sector, strongest names).
    convergence: raw.convergence
      ? {
          summary: speak('convergence summary', raw.convergence.summary),
          items: (raw.convergence.items || []).map((c) => speak('convergence', c)),
        }
      : null,
  };
  finish();
  return ed;
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
    'Rosie prefers entries near a recent low with the K line crossing above its signal line, rather than entries at extended prices.',
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
    'After each entry, Rosie creates or requires protective stop logic immediately, not as an afterthought.',
    'Stop placement respects structure and the last qualified support area, not an arbitrary fixed percent.',
    'Rosie helps prevent revenge behavior by locking out low-quality re-entries after failed setups until conditions improve.',
    'Near all-time highs, Rosie respects stops sooner; the distance back to support is shorter there.',
  ]],
  ['Performance Rules', [
    'Rosie maintains a journal and performance review trail so rules can be tuned over time.',
    'Canon and tactics are kept distinct — doctrine governs what Rosie is allowed to do, tactics govern how Rosie interprets setups inside those bounds.',
  ]],
  ['Canon vs. Tactics', [
    'Harbor Now canon defines how Rosie reads the sea state and runs the account — the top-level doctrine that constrains what Rosie is allowed to do.',
    'Tactics live underneath and may evolve, as long as they remain inside canon.',
    'Changes to canon are rare, deliberate edits, not session-by-session adjustments.',
  ]],
];

/**
 * Canon lines that contain vocabulary words but only describe Rosie (her verdict labels, her
 * protective stop logic). Every other canon line passes the same voice gates as edition text;
 * lines that read as directives were rewritten above (CANON_REWRITTEN lists the originals).
 */
export const CANON_DESCRIPTIVE = [
  "Rosie's core verdict states are Enter, Watch, and Avoid.",
  'After each entry, Rosie creates or requires protective stop logic immediately, not as an afterthought.',
  'If price leaves the entry band, the verdict downgrades from Enter to Watch or Avoid.',
  'Rosie maintains a journal and performance review trail so rules can be tuned over time.',
];
export const CANON_REWRITTEN = {
  'Rosie prefers entries near a recent low with K line crossing above its signal line, rather than chasing extended price.':
    'Rosie prefers entries near a recent low with the K line crossing above its signal line, rather than entries at extended prices.',
  'After each buy, Rosie creates or requires protective stop logic immediately, not as an afterthought.':
    'After each entry, Rosie creates or requires protective stop logic immediately, not as an afterthought.',
  'Near-ATH tape means stops must be respected faster — extended distance to support is lower here.':
    'Near all-time highs, Rosie respects stops sooner; the distance back to support is shorter there.',
  'Canon and tactics stay distinct — doctrine governs what Rosie is allowed to do, tactics govern how Rosie interprets setups inside those bounds.':
    'Canon and tactics are kept distinct — doctrine governs what Rosie is allowed to do, tactics govern how Rosie interprets setups inside those bounds.',
  'Harbor Now canon defines sea-state reading and account posture — the top-level doctrine that constrains what Rosie is allowed to do.':
    'Harbor Now canon defines how Rosie reads the sea state and runs the account — the top-level doctrine that constrains what Rosie is allowed to do.',
};
export const canonLines = () => CANON.flatMap(([h, items]) => [h, ...items]);

/** The canon block passes the same gates as edition text. */
export function checkCanon() {
  const problems = [];
  for (const line of canonLines()) {
    if (looksDirective(line) && !CANON_DESCRIPTIVE.includes(line)) problems.push(`directive-looking canon line: "${line}"`);
    const hits = adviceHits(line);
    if (hits.length) problems.push(`advice wording in canon line: "${line}" (${hits.join(', ')})`);
  }
  if (problems.length) throw new HarborVoiceError(`Harbor Now canon:\n    - ${problems.join('\n    - ')}`);
}

const renderCanon = () =>
  CANON.map(
    ([h, items]) => `
              <h3>${esc(h)}</h3>
              <ul class="ticks">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
  ).join('');

/* ---------- page pieces ---------- */

function renderTable(ed) {
  // Columns appear only when an edition has them: the daily publisher writes no prices
  // (words mode: no numbers at all; pct mode: rounded change only).
  const hasPrice = ed.rows.some((r) => r.price);
  const hasChange = ed.rows.some((r) => r.change);
  const rows = ed.rows
    .map(
      (r) => `
                <tr>
                  <th scope="row"><span class="sym">${esc(r.symbol)}</span>
                    <span class="sym__name">${esc(r.name)}</span>
                    <span class="hn-read">${esc(r.read)}</span>
                  </th>${hasPrice ? `
                  <td class="num">${esc(r.price)}</td>` : ''}${hasChange ? `
                  <td class="num ${r.change.trim().startsWith('-') ? 'num--down' : 'num--up'}">${esc(r.change)}</td>` : ''}${hasPrice ? `
                  <td class="num hn-hi">${r.high52 ? esc(r.high52) : '&mdash;'}</td>` : ''}
                </tr>`,
    )
    .join('');
  return `<div class="table-wrap">
              <table class="data-table hn-table" data-harbor-table>
                <caption class="sr-only">Index fund closes, ${esc(longDate(ed.date))}</caption>
                <thead>
                  <tr>
                    <th scope="col">${hasPrice || hasChange ? 'Fund' : 'Fund and how it closed'}</th>${hasPrice ? `
                    <th scope="col" class="num">Close</th>` : ''}${hasChange ? `
                    <th scope="col" class="num">Change</th>` : ''}${hasPrice ? `
                    <th scope="col" class="num hn-hi">52-wk high</th>` : ''}
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
          <h2 class="hn-h">${ed.schema ? 'My watchlists' : 'Cluster behavior'}</h2>
          <ul class="ticks hn-list" data-harbor-cluster>${ed.cluster.map((c) => `
            <li>${esc(c)}</li>`).join('')}
          </ul>`
    : '';
  const conv = ed.convergence
    ? `
          <div class="hn-conv" data-harbor-convergence>
            <p class="label">Where my signals line up</p>
            <p>${esc(ed.convergence.summary)}</p>
            <ul class="ticks hn-list">${ed.convergence.items.map((c) => `
              <li>${esc(c)}</li>`).join('')}
            </ul>
            <p class="hn-conv__key"><a class="anchor-link" href="#how-to-read">How to read Harbor Now</a></p>
          </div>`
    : '';
  return `<div class="panel hn-panel">
            <div class="panel__head">
              <p class="label" data-harbor-date>Close of <time datetime="${ed.date}">${esc(longDate(ed.date))}</time></p>
              <p class="flag">Dated report — not real-time data</p>
            </div>
            <${headingLevel} class="hn-title">${esc(ed.title)}</${headingLevel}>
            <p class="hn-tag">${esc(ed.tag)}</p>${conv}
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

/* ---------- freshness (2026-11-25) ----------
 * A static page is not rebuilt when publishing stops, so a build-time "stale" check can
 * never fire on the live site. Instead every page carries an empty, hidden note that
 * harbor-now/fresh.js fills in the visitor's browser, counting NYSE trading days (same
 * calendar and code as the publisher) between the newest edition and the newest close an
 * edition should exist for (6:30 PM New York time):
 *   0 late   nothing shown
 *   1-2 late soft note    (data-level="soft")
 *   3+ late  clear notice (data-level="clear")
 * Until the first daily-publisher edition exists, a calm line takes its place instead.
 */
export const RESUME_NOTE = 'Daily editions resume soon; the archive below is from July–September.';
export const FRESH_SOFT_AFTER = 1;
export const FRESH_CLEAR_AFTER = 3;
export const freshSoftText = (pretty) =>
  `The newest edition here is from ${pretty}. The next one is running late.`;
export const freshClearText = (pretty, n) =>
  `Harbor Now is behind: the latest edition is from ${pretty}, and ${n} trading days have closed since.`;

const freshness = (latest, resume) =>
  resume
    ? `<p class="warm-note hn-stale" data-harbor-resume>${esc(RESUME_NOTE)}</p>`
    : `<p class="warm-note hn-stale" data-harbor-fresh data-latest="${esc(latest)}" role="status" hidden></p>`;

/** The browser freshness script, built from the same functions the publisher uses. */
export function buildFreshScript(cal) {
  const fns = ['isTradingDay', 'addDays', 'expectedEditionDate', 'tradingDaysLate', 'nyClock']
    .map((n) => harborCalendar[n].toString().replace(/^export /, ''))
    .join('\n');
  return `/* Harbor Now freshness note. Generated by src/harbor.mjs from src/harbor-calendar.mjs and
   data/market-calendar.json; do not edit. Counts NYSE trading days since the newest edition. */
(function () {
  'use strict';
  var CAL = ${JSON.stringify({ calendar_years: cal.calendar_years, full_closures: cal.full_closures })};
${fns}
  var freshSoftText = ${freshSoftText.toString()};
  var freshClearText = ${freshClearText.toString()};
  var el = document.querySelector('[data-harbor-fresh]');
  if (!el) return;
  var latest = el.getAttribute('data-latest');
  var now = nyClock(new Date());
  var late = tradingDaysLate(latest, expectedEditionDate(now.iso, now.minutes, CAL), CAL);
  if (late < ${FRESH_SOFT_AFTER}) return;
  var pretty = new Date(latest + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  el.textContent = late >= ${FRESH_CLEAR_AFTER} ? freshClearText(pretty, late) : freshSoftText(pretty);
  el.setAttribute('data-level', late >= ${FRESH_CLEAR_AFTER} ? 'clear' : 'soft');
  el.hidden = false;
})();
`;
}

function page({ title, description, canonicalPath, body, canonical, pages, current = false, after = '' }) {
  const html = `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#0b1416" />
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
        <video class="masthead__logo masthead__lighthouse" src="/assets/img/lighthouse-loop.mp4" poster="/assets/img/lighthouse-poster.png" width="92" height="92" muted loop playsinline preload="metadata" role="img" aria-label="Lime Signalworks logo: a lighthouse shining over the sea" data-header-logo="lighthouse"></video>
        <a class="brand" ${brandLink('harbor')}>
          <span class="brand__name">Lime Signalworks<span class="brand__unit">LIME Enterprise</span></span>
        </a>
        <nav class="masthead__nav" aria-label="Site pages">${siteNav(pages, current ? 'harbor' : null)}</nav>
        <img class="masthead__logo masthead__rosie" src="/assets/img/rosie-portrait.png" width="92" height="92" alt="Rosie: a line-art portrait of a woman beside a small multicolored bar chart" data-header-logo="rosie" />
      </div>
    </header>
    <main id="main">
      <section class="section hn-section">
        <div class="shell">
${body}
        </div>
      </section>
${after}
    </main>
    <footer class="foot">
      <div class="shell foot__grid">
        <div>
          <p class="label">Lime Signalworks LLC · LIME Enterprise</p>
          <p class="foot__note">Harbor Now is the daily market report from Lime Signalworks: a dated, plain-language summary written after the close.</p>
          <p class="foot__harbor"><a class="anchor-link hn-foot-link" href="/">Back to the home page</a></p>
          <!-- 2026-11-22 (owner, t1974u): the site's one statement about results sits beside the
               telephone number in the main pages' contact block. Harbor pages carry no phone number
               (they must show no digit runs), so they link to that block instead. -->
          <p class="foot__phone"><a class="anchor-link" href="/#contact">Call or email Lime Signalworks</a></p>
          <p class="foot__copyright">${esc(canonical.copyright)}</p>
          ${legalNav()}
        </div>
        <div>
          <p class="label">Disclaimer</p>
          <p class="foot__disclaimer">${esc(HARBOR_NOTICE)}</p>
          <p class="foot__disclaimer">${esc(canonical.securitiesDisclaimer)}</p>
        </div>
      </div>
    </footer>
    <script src="/assets/js/app.js" defer></script>
    <script src="/harbor-now/fresh.js" defer></script>
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
    const raw = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
    editions.push(publicEdition(date, raw, await loadVoice(root, date)));
  }
  return editions; // oldest first
}

export async function buildHarbor(root, canonical, { pages, harborSections = '', blogPosts = [] } = {}) {
  if (!pages) throw new Error('buildHarbor needs the site pages for the shared menu');
  checkCanon();
  checkGuide();
  const glossary = await loadGlossary();
  checkKey(glossary);
  const editions = await loadEditions(root);
  if (!editions.length) throw new Error('no Harbor Now editions in data/harbor/');
  const latest = editions[editions.length - 1];
  // The calm "resume soon" line shows until the daily publisher's first edition exists.
  const resume = !editions.some((e) => e.schema);
  // The NYSE calendar is part of the code (copied from Rosie), so it is read from this repo
  // even when a test builds editions from a temporary root.
  const cal = JSON.parse(await readFile(new URL('../data/market-calendar.json', import.meta.url), 'utf8'));
  const out = path.join(root, 'harbor-now');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'fresh.js'), buildFreshScript(cal), 'utf8');

  const newestFirst = [...editions].reverse();
  const archive = newestFirst
    .map(
      (ed) => `
            <li><a href="/harbor-now/${ed.date}/"><time class="hn-arch__date" datetime="${ed.date}">${esc(shortDate(ed.date))}</time><span class="hn-arch__title">${esc(ed.title)}</span></a></li>`,
    )
    .join('');

  const indexBody = `          <div class="section__head hn-head">
            <p class="label rule-after">Harbor Now · Daily market report</p>
            <p class="label voice-tag" data-voice-tag>From Rosie</p>
            <h1 class="hn-h1">Harbor Now</h1>
            <p>My dated, plain-language read of the market after the close: SPY, QQQ, DIA and IWM, sentiment, volatility and the tone of the day.</p>
            ${freshness(latest.date, resume)}
          </div>
          ${notice()}
          <p class="label hn-latest-label">Latest edition</p>
          ${renderEditionBody(latest, 'h2')}
          <p class="anchor-row"><a class="btn btn--primary" href="/harbor-now/${latest.date}/">Open the ${esc(prettyDate(latest.date))} edition</a></p>
          ${renderKey(glossary)}
          ${renderGuide(canonical)}
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
      pages,
      current: true,
      // 2026-11-22: the homepage's market-report explainer moved here, and the
      // "Latest from the blog" strip closes the page.
      after: harborSections + '\n' + blogStrip(blogPosts),
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
            <p class="label voice-tag" data-voice-tag>From Rosie</p>
            ${freshness(latest.date, resume)}
          </div>
          ${notice()}
          ${renderEditionBody(ed, 'h1')}
          ${renderKey(glossary)}
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
        pages,
      }),
      'utf8',
    );
  }
  const now = harborCalendar.nyClock(new Date());
  const late = harborCalendar.tradingDaysLate(
    latest.date,
    harborCalendar.expectedEditionDate(todayIso(), process.env.HARBOR_NOW_TODAY ? 24 * 60 : now.minutes, cal),
    cal,
  );
  return { count: editions.length, latest: latest.date, resume, tradingDaysLate: late, stale: late >= FRESH_CLEAR_AFTER };
}
