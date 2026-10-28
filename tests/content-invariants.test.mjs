/**
 * Content invariants for the Site 2 homepage.
 * Validates data/homepage.json and the rendered index.html DOM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

const data = readJson('data/homepage.json');
const { canonical, sectionOrder, marketReport, pricing, startCards } = data;
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const $ = cheerio.load(html);

// 2026-10-28: the hosted Perplexity demo is retired from the home page at the owner's
// direction. The only demo link is the static sample-data demo at /rosie-demo/ (PR #15),
// and the full demo is offered on request through the contact block.
const DEMO_URL = '/rosie-demo/';
const RETIRED_DEMO_URL = 'https://limesignalworks.pplx.app/';
const LEADERSHIP_URL = 'https://signals.limesignalworks.com';
const LIBRARY_URL = 'https://leadership.limesignalworks.com';
const DEMO_LABEL = 'Open the Rosie demo';
const DEMO_DISCLOSURE =
  'Sample data in a paper (practice) account. No broker connection, no real orders, and nothing here is advice.';
const DEMO_ASK =
  "If you'd like the full demo, just ask. We'll set you up with the whole thing, for free, no strings attached.";
const CONTACT_EMAIL = 'contact@limesignalworks.com';
const CONTACT_TEL_HREF = 'tel:+13802000288';
const CONTACT_PHONE_DISPLAY = '+1 380-200-0288';
const CONTACT_ADDRESS = '2722 Erie Ave, Suite 219, Cincinnati, OH 45208';
const SECURITIES_DISCLAIMER =
  'Lime Signalworks provides educational tools and analysis, not personalized investment ' +
  'advice. Securities trading involves risk of loss. Your decisions and results are your own. ' +
  'Nothing here is an offer to sell or a solicitation to buy any security.';

/**
 * Terms that must never appear in rendered output or metadata. The first block is the
 * religious/scriptural register retired at Gatekeeper correction; the second is the
 * Site 1 metaphor vocabulary excluded by the one-for-one translation map.
 * Word-boundary matched, to avoid false hits inside ordinary words.
 */
const FORBIDDEN_TERMS = [
  'keeper',
  'keepers',
  'scripture',
  'scriptural',
  'biblical',
  'bible',
  'gospel',
  'psalm',
  'apostle',
  'disciple',
  'prayer',
  'pray',
  'fire spirit',
  'fire protocol',
  'flame',
  'noah',
  'noal',
  'ark',
  'flood',
  'jesus',
  'god',
  'lord',
  'solomon',
  'mary magdalene',
  'mary of bethany',
  'esther',
  'the baptist',
  'john the baptist',
  'holy',
  'sacred',
  'divine',
  'guardian',
  'sage',
  'herald',
  'contemplative',
  'watchman',
  'watchmen',
  'intercessor',
  'intercession',
  'shepherd',
  'joker',
  'wilderness',
  // Site 1 metaphor and metaphysical register — excluded from the plain translation.
  'rosy way',
  'rosy path',
  'zero point',
  'frequency',
  'coherence',
  'manifestation',
  'manifest',
  'harbor',
  'harbour',
  'wicket gate',
  'nine doors',
  'metaphor gate',
  'laugh lounge',
  'lighthouse',
  'beacon',
  'safety suit',
  'inner rail',
  'inner posture',
  'guru',
  'market weather',
  'fidelity switch',
  'sea state',
  'amber light',
  'renaissance',
  'cockpit',
  'buy rosie',
];

/** Multi-word Site 1 phrases, substring matched. */
const FORBIDDEN_PHRASES = [
  '3-6-9',
  '369',
  'ocean of resources',
  'will fund you',
  'state of the beggar',
  'state of the source',
  'you have become the shore',
  'rest in the result',
  'the code is active',
  'blueprint is signed',
  'the war is over',
  'your presence is the command',
  'scripture anchor rail',
  'sage missions library',
  "gramma's rule",
  '4-light',
  'four-light',
  'not a cape',
  '33-day fire protocol',
];

/**
 * Non-translatable Site 1 claims (map §7 C1–C10). None may appear on Site 2.
 */
const FORBIDDEN_CLAIMS = [
  '90-day',
  '90 day',
  'ninety days',
  'ninety-day',
  'no-pay',
  'live spy tracking',
  'rosie cockpit is live',
  'begin your ninety',
  'antique method',
  'candlestick',
  'sets a new bar',
  'nothing armed until you say so',
  // 2026-10-26: 'schwab' removed from this list. The home page now names the Schwab
  // version of Rosie under Stocks and ETFs at the owner's direction.
  'refer a friend',
  'ibkr.com',
  'interactivebrokers.com',
];

/**
 * Access claims the page should not make about the demo. The hosted demo is retired
 * (2026-10-28); the list is kept so the page still never presents a demo as open,
 * anonymous, or guaranteed to work.
 */
const FORBIDDEN_ACCESS_CLAIMS = [
  'open to everyone',
  'open to anyone',
  'open to the public',
  'available to everyone',
  'available to anyone',
  'accessible to everyone',
  'accessible to anyone',
  'freely accessible',
  'publicly accessible',
  'anonymous access',
  'anonymously accessible',
  'no sign-in',
  'no signin',
  'no sign in required',
  'no login',
  'no account required',
  'without signing in',
  'without an account',
  'anyone can open',
  'anyone may open',
  'anyone can use',
  'the only way in',
  'only way in that currently works',
  'the only working way',
  'is what is open',
];

/** Unsupported commercial claims and transactional controls. */
const FORBIDDEN_COMMERCIAL = [
  'trusted by',
  'our customers',
  'endorsed by',
  'guaranteed',
  'certified secure',
  'iso 27001',
  'bank-grade',
  'best-in-class',
  'industry-leading',
  'production-grade',
  'enterprise-grade security',
  'get started',
  'sign up',
  'book a demo',
  'buy now',
  'enroll now',
  'start free trial',
  'per month',
];

const visibleText = () => {
  const clone = cheerio.load(html);
  // [data-attribution] marks the owner's own name as the credit on his first-person
  // copy (2026-10-28, assembled home). It is checked separately below and is the only
  // place that name may appear.
  clone('script, style, .sr-only, [data-attribution]').remove();
  return clone('body').text().replace(/\s+/g, ' ');
};

const metadataText = () =>
  [
    $('title').text(),
    $('meta[name="description"]').attr('content') || '',
    $('html').attr('lang') || '',
  ].join(' ');

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/* ---------- data layer ---------- */

test('data: canonical strings are the exact approved wording', () => {
  assert.equal(canonical.demoUrl, DEMO_URL);
  assert.equal(canonical.demoCtaLabel, DEMO_LABEL);
  assert.equal(canonical.demoDisclosure, DEMO_DISCLOSURE);
  assert.equal(canonical.demoAsk, DEMO_ASK);
  assert.equal(canonical.demoSignIn, undefined, 'the sign-in line went with the hosted demo');
  for (const retired of ['leadershipUrl', 'leadershipLabel', 'libraryUrl', 'libraryLabel']) {
    assert.equal(canonical[retired], undefined, `${retired} is retired: the sister-site buttons are gone`);
  }
  assert.equal(canonical.securitiesDisclaimer, SECURITIES_DISCLAIMER);
  assert.equal(canonical.evaluationDays, 33);
});

test('data: the section order is the translated Site 1 order, with unique ids', () => {
  assert.deepEqual(
    sectionOrder.map((s) => s.id),
    [
      // 2026-10-28 (content/assembled-home): the personal opening, life with Rosie,
      // will and won't, evidence tiles, indicators and demo lead the page, in the
      // owner's order; the existing sections follow unchanged.
      'opening',
      'life',
      'will-wont',
      'pros', // 2026-10-28: "Trading the way the pros do", after will-and-won't
      'evidence',
      'indicators',
      'demo',
      'what-we-do',
      'how-it-works',
      'protection',
      'phone',
      'markets',
      'evaluation',
      'pricing',
      'market-report',
      'commitments',
      'partners',
      'how-to-begin',
    ],
  );
  const ids = sectionOrder.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'section ids must be unique');
});

test('data: prices are the locked figures (2026-10-07)', () => {
  assert.deepEqual(
    pricing.rows.map((r) => [r.term, r.price]),
    [
      ['Rosie, paid over 18 months', '$3,300'],
      ['Monthly payment, months 1 to 18', '$183.33'],
      ['Maintenance from month 19', '$330/year'],
    ],
  );
});

test('dom: no retired price appears anywhere', () => {
  const text = visibleText();
  for (const old of ['$200', '$1,000', '$20 ']) {
    assert.ok(!text.includes(old), `retired price on the page: ${old}`);
  }
});

test('data: the market example carries figures and a dated as-of label', () => {
  assert.match(marketReport.asOfLabel, /2026/, 'the example must be dated');
  assert.equal(marketReport.rows.length, 5);
  for (const row of marketReport.rows) {
    for (const field of ['symbol', 'name', 'last', 'change']) {
      assert.ok(norm(String(row[field])).length > 0, `${row.symbol}.${field}`);
    }
    assert.match(row.change, /^[+-]/, `${row.symbol} change must be signed`);
  }
});

test('data: preserved role and principle sources remain intact but unrendered', () => {
  // Kept in source per the task ("preserve reusable role/quote data"), and deliberately
  // not surfaced on the homepage, where they would distract from the offer.
  const roles = readJson('data/operating-roles.json');
  const lib = readJson('data/principles.json');
  assert.equal(roles.roles.length, 9, 'role source preserved');
  assert.equal(lib.records.length, 20, 'principle source preserved');
  assert.equal($('[data-role-id]').length, 0, 'roles must not render on the homepage');
  assert.equal($('[data-quote-id]').length, 0, 'quotations must not render on the homepage');
  const haystack = visibleText();
  for (const record of lib.records) {
    assert.ok(!haystack.includes(record.quote), `quotation leaked into the page: ${record.id}`);
  }
  for (const role of roles.roles) {
    assert.ok(!haystack.includes(role.figure), `role figure leaked into the page: ${role.figure}`);
  }
});

/* ---------- section order and structure ---------- */

test('dom: rendered sections appear in exactly the recorded order', () => {
  const rendered = $('main section')
    .map((_, el) => $(el).attr('id'))
    .get();
  // The hero is the first section and carries no id in the section order list.
  assert.ok($('main section').first().hasClass('hero'), 'the hero opens the page');
  assert.deepEqual(
    rendered.filter(Boolean),
    sectionOrder.map((s) => s.id),
  );
});

test('dom: every section in the order is rendered and labelled', () => {
  for (const section of sectionOrder) {
    const el = $(`section#${section.id}`);
    assert.equal(el.length, 1, `section ${section.id} must render exactly once`);
    const labelledBy = el.attr('aria-labelledby');
    assert.ok(labelledBy, `section ${section.id} must be labelled`);
    assert.equal($(`#${labelledBy}`).length, 1, `${section.id} label target must exist`);
  }
});

test('dom: navigation links match the recorded nav labels and all resolve', () => {
  const navLinks = $('.masthead__nav a');
  const expected = sectionOrder.filter((s) => s.nav);
  assert.equal(navLinks.length, expected.length);
  navLinks.each((i, el) => {
    assert.equal($(el).attr('href'), `#${expected[i].id}`);
    assert.equal(norm($(el).text()), expected[i].nav);
  });
});

test('dom: every in-page anchor resolves to an element that exists', () => {
  const ids = new Set(
    $('[id]')
      .map((_, el) => $(el).attr('id'))
      .get(),
  );
  const targets = $('a[href^="#"]')
    .map((_, el) => $(el).attr('href').slice(1))
    .get();
  assert.ok(targets.length > 0, 'the page uses in-page anchors');
  for (const target of targets) {
    assert.ok(target.length > 0, 'no empty fragment hrefs');
    assert.ok(ids.has(target), `in-page anchor with no target: #${target}`);
  }
});

test('dom: html element ids are unique across the document', () => {
  const ids = $('[id]')
    .map((_, el) => $(el).attr('id'))
    .get();
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(duplicates, [], `duplicate element ids: ${duplicates.join(', ')}`);
});

/* ---------- the demo call to action and its disclosure ---------- */

test('dom: exactly one demo call to action, with the approved label and target', () => {
  const ctas = $('a.cta');
  assert.equal(ctas.length, 1, 'exactly one page call to action');
  const link = ctas.first();
  assert.equal(link.attr('href'), DEMO_URL, 'the call to action opens the sample-data demo');
  assert.equal(norm(link.text()), DEMO_LABEL);
  assert.equal(link.attr('target'), undefined, 'the demo is on this site, so no new tab');
  $('a[href*="rosie-demo"]').each((_, el) => {
    assert.equal($(el).attr('href'), DEMO_URL, 'every demo link points at /rosie-demo/');
  });
});

test('dom: the retired hosted demo leaves no trace on the home page', () => {
  assert.equal($(`a[href="${RETIRED_DEMO_URL}"]`).length, 0, 'no link to the hosted demo');
  assert.equal($('[data-demo-signin]').length, 0, 'no sign-in precondition line');
  for (const term of ['perplexity', 'pplx', 'sign-in may be required']) {
    assert.ok(!html.toLowerCase().includes(term), `retired demo wording left behind: "${term}"`);
  }
});

test('dom: the full demo is offered on request through the existing contact block', () => {
  const ask = $('[data-demo-ask]');
  assert.equal(ask.length, 1, 'one offer next to the demo');
  assert.ok(norm(ask.text()).startsWith(DEMO_ASK), 'the offer wording is exact');
  assert.equal(ask.closest('section#demo').length, 1, 'the offer sits in the demo section');
  assert.equal(ask.find('a[href="#contact"]').length, 1, 'the way to ask is the contact block');
  assert.equal($('#contact[data-contact]').length, 1, 'the contact block it points to exists');
  assert.ok(
    /full demo, just ask/i.test(norm($('section#how-to-begin').text())),
    'the section that discusses the demo repeats the offer',
  );
});

test('dom: the disclosure is static markup adjacent to the call to action', () => {
  const disclosure = $('[data-demo-disclosure]');
  assert.equal(disclosure.length, 1, 'exactly one disclosure');
  assert.equal(norm(disclosure.text()), DEMO_DISCLOSURE, 'disclosure wording must be exact');

  // Immediately adjacent: same block, and the very next element after the link.
  const link = $('a.cta').first();
  const block = link.parent();
  assert.ok(block.hasClass('cta-block'), 'the call to action sits in the disclosure block');
  assert.equal(block.find('[data-demo-disclosure]').length, 1, 'the disclosure shares the block');
  assert.equal(
    link.next().get(0),
    disclosure.get(0),
    'the disclosure is the element immediately after the call to action',
  );

  // Never hidden, collapsed, deferred, or delivered by script.
  assert.equal(disclosure.attr('hidden'), undefined, 'the disclosure is not hidden');
  assert.equal(disclosure.attr('aria-hidden'), undefined, 'the disclosure is exposed to AT');
  assert.equal(disclosure.closest('.sr-only').length, 0, 'the disclosure is visible, not sr-only');
  assert.equal(disclosure.closest('details, dialog, [popover]').length, 0, 'not collapsed content');
  assert.equal(link.attr('title'), undefined, 'the disclosure is not a tooltip');
  const js = readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.ok(
    !js.includes('data-demo-disclosure'),
    'the disclosure must not depend on JavaScript to appear',
  );
});

test('dom: the demo is never presented as open, anonymous, or guaranteed to work', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const claim of FORBIDDEN_ACCESS_CLAIMS) {
    assert.ok(!haystack.includes(claim), `false access claim about the demo: "${claim}"`);
  }
  // The demo stays labelled: sample data, a paper account, no real orders, not advice.
  for (const fact of [
    'sample data',
    'paper (practice) account',
    'no broker connection',
    'no real orders',
    'nothing here is advice',
  ]) {
    assert.ok(haystack.includes(fact), `disclosure fact lost: "${fact}"`);
  }
});

/* ---------- evaluation, pricing, SPY boundary, signup ---------- */

test('dom: the evaluation is stated as 33 days, paper only, no live capital', () => {
  const text = visibleText();
  assert.ok(/free 33-day evaluation/i.test(text), 'the 33-day term is stated plainly');
  assert.ok(/paper account/i.test(text), 'the evaluation runs on a paper account');
  assert.ok(/no live capital/i.test(text), 'the no-live-capital boundary is stated');
  assert.ok(/no real-money orders|no real orders/i.test(text), 'no real-money orders is stated');
});

test('dom: prices carry no online purchase path or purchase control', () => {
  const table = $('[data-pricing-table]');
  assert.equal(table.length, 1, 'exactly one pricing table');
  const rows = table
    .find('tbody tr')
    .map((_, tr) => [
      norm($(tr).find('th').text()),
      norm($(tr).find('td').text()),
    ])
    .get();
  assert.deepEqual(rows.flat(), pricing.rows.flatMap((r) => [r.term, r.price]));

  const status = norm($('[data-pricing-status]').text());
  assert.ok(
    /nothing is sold or charged on this site/i.test(status),
    'the absence of a purchase path is stated',
  );

  const purchaseWords = /\b(buy|purchase|enroll|checkout|subscribe|pay now|add to cart)\b/i;
  $('a, button').each((_, el) => {
    const node = $(el);
    const label = norm(node.clone().find('.sr-only').remove().end().text());
    assert.ok(
      !purchaseWords.test(label),
      `no purchase control may exist: "${label}"`,
    );
  });
});

test('dom: the partners section sends people to contact, with no access control', () => {
  const section = $('section#partners');
  assert.equal(section.length, 1);
  assert.equal(section.find('button').length, 0, 'no control in this section');
  section.find('a[href]').each((_, el) => {
    assert.equal($(el).attr('href'), '#contact', 'the only link goes to the contact details');
  });
});

test('dom: there is no signup or capture of any kind', () => {
  const text = visibleText();
  assert.equal($('form').length, 0, 'no forms on this surface');
  assert.equal($('input, textarea, select').length, 0, 'no fields of any kind');
  assert.equal($('[type="submit"], [type="email"]').length, 0, 'no submit or email control');
  // A contact path exists, but it is a direct channel, never a capture: there is no
  // backend on this surface that could receive a submission.
  assert.ok(!/subscribe|newsletter|join the list|notify me/i.test(text), 'no list capture');
});

test('dom: the contact channels are the approved ones, rendered once each', () => {
  const { contact } = canonical;
  const email = $('[data-contact-email]');
  const phone = $('[data-contact-phone]');

  assert.equal(email.length, 1, 'exactly one email channel — no duplicate paths');
  assert.equal(email.attr('href'), `mailto:${CONTACT_EMAIL}`, 'mailto is correctly encoded');
  assert.equal(norm(email.text()), CONTACT_EMAIL, 'the address is legible, not hidden in a label');

  assert.equal(phone.length, 1, 'exactly one telephone channel');
  assert.equal(phone.attr('href'), CONTACT_TEL_HREF, 'tel: uses the dialable E.164 form');
  assert.equal(norm(phone.text()), CONTACT_PHONE_DISPLAY, 'the number is shown in readable form');

  // Every mailto:/tel: on the page is one of those two, and nothing else.
  assert.equal($('a[href^="mailto:"]').length, 1, 'no second mailto path');
  assert.equal($('a[href^="tel:"]').length, 1, 'no second tel path');

  const block = $('[data-contact]');
  assert.equal(block.length, 1, 'one contact block');
  assert.equal(block.attr('id'), 'contact', 'the block is an anchor target');
  assert.equal(block.closest('footer').length, 1, 'contact sits in the footer translation');
  assert.equal(block.attr('hidden'), undefined, 'the contact block is not hidden');
  assert.equal(block.closest('.sr-only').length, 0, 'the contact block is visible');
  assert.equal(block.closest('details, dialog, [popover]').length, 0, 'not collapsed content');

  const text = norm(block.text());
  assert.ok(text.includes(CONTACT_ADDRESS), 'the office address is rendered');
  assert.ok(text.includes('By appointment'), 'availability is stated');
  assert.equal(contact.email, CONTACT_EMAIL);
  assert.equal(contact.phoneHref, CONTACT_TEL_HREF);
  assert.equal(contact.address, CONTACT_ADDRESS);

  // "How to begin" must route a reader to it, or the path is not usable in practice.
  assert.equal(
    $('section#how-to-begin a[href="#contact"]').length,
    1,
    'how to begin links to the contact block',
  );
});

/* ---------- market report freshness ---------- */

test('dom: the market example is dated and carries a freshness caveat', () => {
  assert.equal(norm($('[data-report-asof]').text()), marketReport.asOfLabel);
  const caveat = norm($('[data-report-caveat]').text());
  assert.ok(/example/i.test(caveat) && /not real-time/i.test(caveat), 'prominent dated caveat');
  const notice = norm($('section#market-report .panel__note').first().text());
  assert.ok(/not current market data/i.test(notice), 'the example is not presented as current');
  const section = $('section#market-report');
  assert.equal(section.find('a[href]').length, 0, 'the report section adds no links');
});

test('dom: every mention of real-time data is negated', () => {
  const text = visibleText();
  for (const match of text.matchAll(/real[- ]time/gi)) {
    const before = text.slice(Math.max(0, match.index - 60), match.index);
    assert.ok(
      /\b(not|never|no|nor)\b[^.]*$/i.test(before),
      `unqualified real-time claim near: "${text.slice(Math.max(0, match.index - 60), match.index + 30)}"`,
    );
  }
});

/* ---------- links off this surface ---------- */

const YOUTUBE_URL = 'https://www.youtube.com/@noelrini3882';
test('dom: exactly one off-origin destination exists — YouTube (the demo is on this site)', () => {
  const hrefs = $('a[href^="http"]')
    .map((_, el) => $(el).attr('href'))
    .get();
  assert.deepEqual([...new Set(hrefs)], [YOUTUBE_URL]);
  assert.equal(hrefs.length, 1, 'no duplicate off-origin links');
});

test('dom: the Signals and LIME Leadership sister-site buttons are gone, with no leftover row', () => {
  assert.equal($('[data-sibling-site]').length, 0, 'no sister-site links');
  assert.equal($('.sibling-link').length, 0, 'no sister-site buttons');
  assert.equal($('.foot__link-row').length, 0, 'no empty link row or dot separator');
  assert.equal($(`a[href^="${LEADERSHIP_URL}"]`).length, 0, 'no link into the Signals site');
  assert.equal($(`a[href^="${LIBRARY_URL}"]`).length, 0, 'no link into the Leadership library');
});

/* ---------- footer ---------- */

test('dom: the footer carries the exact securities disclaimer', () => {
  const disclaimer = $('[data-securities-disclaimer]');
  assert.equal(disclaimer.length, 1);
  assert.equal(norm(disclaimer.text()), SECURITIES_DISCLAIMER);
  assert.equal(disclaimer.closest('footer').length, 1, 'the disclaimer sits in the footer');
});

/* ---------- risk disclosure and roadmap honesty (2026-10-26 rewrite) ---------- */

const RISK_DISCLOSURE =
  'Trading involves risk of loss. Past performance, including paper-trading results, does not ' +
  'guarantee future results. Nothing on this site is investment advice.';

test('dom: the footer carries the plain risk disclosure', () => {
  assert.equal(canonical.riskDisclosure, RISK_DISCLOSURE);
  const el = $('[data-risk-disclosure]');
  assert.equal(el.length, 1);
  assert.equal(norm(el.text()), RISK_DISCLOSURE);
  assert.equal(el.closest('footer').length, 1, 'the risk disclosure sits in the footer');
});

test('dom: markets not yet supported are labelled as in development, never as available', () => {
  const items = $('section#markets .roadmap li');
  assert.equal(items.length, 3);
  const byTitle = Object.fromEntries(
    items.map((_, el) => [[norm($(el).find('h3').text()), norm($(el).find('.flag').text())]]).get(),
  );
  assert.match(byTitle['Stocks and ETFs'], /available today/i);
  for (const later of ['Options and futures', 'Cryptocurrency and forex']) {
    assert.match(byTitle[later], /in development/i, `${later} must be labelled in development`);
    assert.doesNotMatch(byTitle[later], /available/i, `${later} must not read as available`);
  }
  assert.ok(/paper mode today/i.test(visibleText()), 'the Interactive Brokers paper status is stated');
});

test('dom: no promise of profit, perfection, or full replacement of the operator', () => {
  const text = visibleText().toLowerCase();
  for (const phrase of [
    'never loses', 'never lose', 'can\'t lose', 'cannot lose', 'no downside', 'risk-free', 'risk free',
    'only good', 'replaces you', 'completely replaces', 'set it and forget it', 'guaranteed returns',
    'guaranteed profit', 'passive income', 'nothing to disadvantage',
  ]) {
    assert.ok(!text.includes(phrase), `overclaim on the page: "${phrase}"`);
  }
  assert.ok(/you supervise/i.test(text), 'the operator\'s supervisory role is stated');
});

/* ---------- language and claims ---------- */

test('dom: no forbidden Site 1 or scriptural terminology in rendered text or metadata', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'i');
    assert.ok(!pattern.test(haystack), `forbidden term appears in rendered output: "${term}"`);
  }
  for (const phrase of FORBIDDEN_PHRASES) {
    assert.ok(!haystack.includes(phrase), `forbidden phrase appears: "${phrase}"`);
  }
});

test('dom: the pros block is the approved copy, right after will-and-won\'t, naming no one', () => {
  const sec = $('section#pros');
  assert.equal(sec.length, 1);
  assert.equal(sec.prev('section').attr('id'), 'will-wont', 'it follows What Rosie will and won\'t do');
  assert.equal(sec.next('section').attr('id'), 'evidence', 'it comes before Evidence');
  assert.equal(norm(sec.find('h2').text()), 'Trading the way the pros do.');
  assert.equal(norm(sec.find('.section__head > p:not(.label)').text()), data.pros.body);
  assert.equal(
    data.pros.body,
    "The best traders in the world share a few habits: they trade by written rules, they decide what they can lose before they decide what they can win, and they stay consistent when it's hard. Rosie is built on those same habits. And unlike a big firm, she works for one person: you.",
  );
  const body = data.pros.body.toLowerCase();
  for (const h of data.pros.habits) {
    // Each habit tile only restates the body: no extra claims.
    assert.ok(body.includes(h.text.replace(/\.$/, '').toLowerCase()), `habit not from the body: ${h.text}`);
  }
  const text = norm(sec.text()).toLowerCase();
  for (const name of ['renaissance', 'citadel', 'bridgewater', 'two sigma', 'de shaw', 'jane street', 'simons', 'dalio', 'griffin', 'buffett']) {
    assert.ok(!text.includes(name), `the pros block must not name "${name}"`);
  }
});

test('dom: the owner credit appears only as a plain attribution', () => {
  const credits = $('[data-attribution]')
    .map((_, el) => norm($(el).text()))
    .get();
  assert.ok(credits.length <= 3, 'at most the opening label and the two pull-quote credits');
  for (const credit of credits) {
    assert.match(credit, /^(From )?Noal$/, `attribution must be the bare credit, got: "${credit}"`);
  }
});

test('dom: no non-translatable Site 1 claim appears', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const claim of FORBIDDEN_CLAIMS) {
    assert.ok(!haystack.includes(claim), `non-translatable claim appears: "${claim}"`);
  }
});

test('dom: no unsupported commercial, security or superiority claim', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const phrase of FORBIDDEN_COMMERCIAL) {
    assert.ok(!haystack.includes(phrase), `unsupported or transactional copy: "${phrase}"`);
  }
  // SOC 2 may be named only inside the security-standards notice, and only alongside the
  // plain statement that no SOC 2 audit has been completed.
  const socMentions = $('body *')
    .filter((_, el) => $(el).children().length === 0 && /soc 2/i.test($(el).text()));
  socMentions.each((_, el) => {
    const notice = $(el).closest('[data-security-standards]');
    assert.equal(notice.length, 1, 'SOC 2 is mentioned only in the security-standards notice');
    assert.ok(/has not yet completed a soc 2 audit/i.test(norm(notice.text())),
      'the notice states plainly that no SOC 2 audit has been completed');
  });
  assert.ok(!/soc 2 (compliant|certified|certification)/i.test(haystack), 'no SOC 2 compliance claim');

  // Production readiness is never claimed.
  assert.equal([...visibleText().matchAll(/production[- ]ready/gi)].length, 0, 'no production-ready claim');
});

test('dom: the limits of the offer are stated, not softened', () => {
  const text = visibleText();
  assert.ok(/do not guarantee profits/i.test(text), 'the no-guarantee statement is present');
  assert.ok(/cannot eliminate risk/i.test(text), 'the risk statement is present');
  assert.ok(/decisions/i.test(text) && /yours/i.test(text), 'decision ownership is stated');
});

/* ---------- no inert controls ---------- */

test('dom: every interactive control does something', () => {
  $('a').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    assert.ok(href.length > 0, 'every anchor has an href');
    assert.notEqual(href, '#', 'no placeholder anchor');
    assert.ok(!/^javascript:/i.test(href), 'no javascript: anchors');
    assert.equal($(el).attr('aria-disabled'), undefined, 'no disabled-looking links');
  });
  // The theme toggle is the only control on this surface, and it is created by the
  // script that operates it, so the served markup ships no button at all. Nothing
  // visible without JavaScript can therefore be inert.
  assert.equal($('button').length, 0, 'no button ships in the static markup');
  assert.equal($('[role="button"]').length, 0, 'no faux buttons');
  const js = readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.ok(js.includes("createElement('button')"), 'the toggle is created by its own script');
  assert.ok(js.includes('addEventListener'), 'and it is wired to a handler');
});

/* ---------- accessibility scaffolding ---------- */

test('dom: accessibility scaffolding is present', () => {
  assert.equal($('h1').length, 1, 'exactly one h1');
  assert.equal($('a.skip-link').attr('href'), '#main', 'skip link targets main');
  assert.equal($('main#main').length, 1);
  assert.ok($('html').attr('lang'), 'lang attribute set');
  // 2026-08-21: one real product screenshot was deliberately added (the Rosie
  // Interactive mock-preview dashboard) so the homepage shows the actual product
  // instead of describing it in prose alone. This is an intentional, approved
  // change to the original vector-only rule — not a regression. Every <img> on
  // the surface must still be real product imagery with a real, descriptive alt
  // attribute; this guards against silently proliferating raster images later.
  const images = $('img');
  assert.equal(images.length, 1, 'exactly one deliberate product screenshot is used on this surface');
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    assert.ok(alt && alt.length > 20, 'every raster image has a real, descriptive alt attribute');
  });
  $('svg').each((_, el) => {
    const svg = $(el);
    const labelled = svg.attr('aria-label') || svg.attr('role') === 'img';
    const hidden = svg.attr('aria-hidden') === 'true';
    assert.ok(labelled || hidden, 'every svg is labelled or hidden from assistive tech');
  });
  $('button').each((_, el) => {
    const button = $(el);
    assert.ok(
      norm(button.text()).length > 0 || button.attr('aria-label'),
      'every button has an accessible name',
    );
  });
  $('table').each((_, el) => {
    assert.equal($(el).find('caption').length, 1, 'every data table has a caption');
    assert.ok($(el).find('thead th[scope="col"]').length > 0, 'column headers are scoped');
  });
  // Heading order: no level is skipped.
  const levels = $('h1, h2, h3, h4, h5, h6')
    .map((_, el) => Number(el.tagName[1]))
    .get();
  levels.reduce((prev, level) => {
    assert.ok(level <= prev + 1, `heading level jumps from h${prev} to h${level}`);
    return level;
  }, levels[0]);
});

test('dom: start cards are working in-page anchors, one per destination', () => {
  const cards = $('.card');
  assert.equal(cards.length, startCards.length);
  const hrefs = cards.map((_, el) => $(el).attr('href')).get();
  assert.deepEqual(hrefs, startCards.map((c) => c.href));
  assert.equal(new Set(hrefs).size, hrefs.length, 'no duplicate card destinations');
  cards.each((_, el) => {
    assert.equal($(el).find('h3').length, 1, 'each card has one heading');
  });
});

/* ---------- identity ---------- */

test('dom: the masthead names this unit "LIME Enterprise" and keeps the wordmark', () => {
  const brand = norm($('.brand').text());
  assert.ok(brand.includes('Lime Signalworks'), 'the Lime Signalworks wordmark must remain');
  const unit = $('[data-site-unit]');
  assert.equal(unit.length, 1, 'exactly one unit label');
  assert.ok(
    norm(unit.text()).includes('LIME Enterprise'),
    `unit label must read "LIME Enterprise", got: ${norm(unit.text())}`,
  );
  assert.ok(
    $('title').text().includes('LIME Enterprise'),
    'the document title must identify LIME Enterprise',
  );
});

/* ---------- light default and no persistence ---------- */

test('dom: light is the default theme in the served markup', () => {
  assert.equal($('html').attr('data-theme'), 'light', 'root ships data-theme="light"');
  assert.equal($('meta[name="color-scheme"]').attr('content'), 'light');
});

test('css: no prefers-color-scheme rule can force this surface dark', () => {
  const css = ['assets/css/base.css', 'assets/css/site.css', 'assets/css/fonts.css']
    .map((file) => readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.ok(
    !/@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(css),
    'a prefers-color-scheme: dark block would defeat the light default',
  );
});

test('js: the theme choice is never written to persistent browser storage', () => {
  const js = readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  for (const api of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'caches']) {
    assert.ok(!js.includes(api), `theme state must not use ${api}`);
  }
  assert.ok(
    !/matchMedia\s*\(\s*['"]\(prefers-color-scheme/i.test(js),
    'the OS colour preference must not seed the initial theme',
  );
});

/* ---------- no alternate render paths, no network egress ---------- */

test('repo: index.html is the only rendered surface', () => {
  const strays = ['index.htm', 'home.html', 'preview.html', 'roles.html', 'principles.html', 'old'];
  for (const stray of strays) {
    assert.ok(!existsSync(path.join(root, stray)), `stray alternate render path: ${stray}`);
  }
  assert.ok(existsSync(path.join(root, 'index.html')));
});

test('dom: the page makes no external requests of its own', () => {
  const assetAttrs = ['src', 'srcset', 'poster', 'data'];
  $('*').each((_, el) => {
    for (const attr of assetAttrs) {
      const value = $(el).attr(attr);
      if (value) {
        assert.ok(
          !/^(https?:)?\/\//i.test(value.trim()),
          `off-origin asset reference in @${attr}: ${value}`,
        );
      }
    }
  });
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href').trim();
    assert.ok(!/^(https?:)?\/\//i.test(href), `off-origin <link> in the document head: ${href}`);
  });
  assert.equal($('link[rel="preconnect"], link[rel="dns-prefetch"]').length, 0, 'no preconnects');
  assert.ok(!/@import\s+url\(\s*['"]?https?:/i.test(html), 'no remote @import in inline css');
  for (const href of $('a[href^="http"]')
    .map((_, el) => $(el).attr('href'))
    .get()) {
    assert.ok(href.startsWith('https://'), `off-origin link must be https: ${href}`);
  }
});

test('css: stylesheets reference only vendored, self-hosted font files', () => {
  const cssFiles = ['assets/css/fonts.css', 'assets/css/base.css', 'assets/css/site.css'];
  for (const file of cssFiles) {
    const css = readFileSync(path.join(root, file), 'utf8');
    const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1].trim());
    for (const url of urls) {
      assert.ok(
        !/^(https?:)?\/\//i.test(url) && !url.startsWith('//'),
        `remote asset url in ${file}: ${url}`,
      );
    }
    assert.ok(
      !/fonts\.googleapis|gstatic|fontshare|typekit|cdn/i.test(css),
      `cdn reference in ${file}`,
    );
  }
  const fonts = readFileSync(path.join(root, 'assets/css/fonts.css'), 'utf8');
  assert.equal((fonts.match(/@font-face/g) || []).length, 6, 'six vendored subsets declared');
  for (const file of [
    'assets/fonts/inter-latin.woff2',
    'assets/fonts/inter-latin-ext.woff2',
    'assets/fonts/archivo-latin.woff2',
    'assets/fonts/archivo-latin-ext.woff2',
    'assets/fonts/jetbrains-mono-latin.woff2',
    'assets/fonts/jetbrains-mono-latin-ext.woff2',
    'assets/fonts/LICENSE-inter.txt',
    'assets/fonts/LICENSE-archivo.txt',
    'assets/fonts/LICENSE-jetbrains-mono.txt',
  ]) {
    assert.ok(existsSync(path.join(root, file)), `missing vendored font asset: ${file}`);
  }
});
