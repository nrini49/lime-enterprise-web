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

const DEMO_URL = 'https://limesignalworks.pplx.app/';
const LEADERSHIP_URL = 'https://limesignalworks.com';
const LIBRARY_URL = 'https://leadership.limesignalworks.com';
const DEMO_LABEL = 'Open the Rosie Server Demo';
const DEMO_DISCLOSURE =
  'Demonstration environment. Simulated data. No broker connection and no real orders. ' +
  'Not production-ready.';
const DEMO_SIGNIN = 'Perplexity sign-in may be required.';
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
  'schwab',
  'refer a friend',
  'ibkr.com',
  'interactivebrokers.com',
];

/**
 * Access claims that would be false about the demo destination. The host requires a
 * Perplexity sign-in — an anonymous request is answered with HTTP 401 — so the page
 * may not present the demo as open, anonymous, or guaranteed to work.
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
  'soc 2',
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
  clone('script, style, .sr-only').remove();
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
  assert.equal(canonical.demoSignIn, DEMO_SIGNIN);
  assert.equal(canonical.leadershipUrl, LEADERSHIP_URL);
  assert.equal(canonical.leadershipLabel, 'Lime Signalworks');
  assert.equal(canonical.libraryUrl, LIBRARY_URL);
  assert.equal(canonical.libraryLabel, 'LIME Leadership');
  assert.equal(canonical.securitiesDisclaimer, SECURITIES_DISCLAIMER);
  assert.equal(canonical.evaluationDays, 33);
});

test('data: the section order is the translated Site 1 order, with unique ids', () => {
  assert.deepEqual(
    sectionOrder.map((s) => s.id),
    [
      'what-we-do',
      'market-report',
      'commitments',
      'approach',
      'evaluation',
      'who-its-for',
      'where-to-start',
      'pricing',
      'spy-pipeline',
      'how-to-begin',
    ],
  );
  const ids = sectionOrder.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'section ids must be unique');
});

test('data: planned prices are the locked figures', () => {
  assert.deepEqual(
    pricing.rows.map((r) => [r.term, r.price]),
    [
      ['Monthly', '$200'],
      ['Annually', '$1,000'],
    ],
  );
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
  const demoLinks = $(`a[href="${DEMO_URL}"]`);
  assert.equal(demoLinks.length, 1, 'exactly one link to the demo environment');
  const link = demoLinks.first();
  assert.ok(link.hasClass('cta'), 'the demo link is the page call to action');
  const label = norm(link.clone().find('.sr-only, .ext').remove().end().text());
  assert.equal(label, DEMO_LABEL);
  assert.equal(link.attr('target'), '_blank');
  assert.equal(link.attr('rel'), 'noopener noreferrer');
  assert.ok(
    norm(link.find('.sr-only').text()).includes('opens in a new tab'),
    'new-tab behaviour is announced',
  );
});

test('dom: the disclosure is static markup adjacent to the call to action', () => {
  const disclosure = $('[data-demo-disclosure]');
  assert.equal(disclosure.length, 1, 'exactly one disclosure');
  assert.equal(norm(disclosure.text()), DEMO_DISCLOSURE, 'disclosure wording must be exact');

  // Immediately adjacent: same block, and the very next element after the link.
  const link = $(`a[href="${DEMO_URL}"]`).first();
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

test('dom: the sign-in precondition is stated adjacent to the call to action', () => {
  const signin = $('[data-demo-signin]');
  assert.equal(signin.length, 1, 'exactly one sign-in statement');
  assert.equal(norm(signin.text()), DEMO_SIGNIN, 'sign-in wording must be exact');

  // It shares the call-to-action block, immediately after the five-fact disclosure,
  // so a visitor reads it before deciding to click.
  const block = $(`a[href="${DEMO_URL}"]`).first().parent();
  assert.equal(block.find('[data-demo-signin]').length, 1, 'the sign-in fact shares the block');
  assert.equal(
    $('[data-demo-disclosure]').next().get(0),
    signin.get(0),
    'the sign-in fact follows the disclosure directly',
  );

  // Static, visible, unscripted — the same standard the disclosure is held to.
  assert.equal(signin.attr('hidden'), undefined, 'the sign-in fact is not hidden');
  assert.equal(signin.attr('aria-hidden'), undefined, 'the sign-in fact is exposed to AT');
  assert.equal(signin.closest('.sr-only').length, 0, 'the sign-in fact is visible');
  assert.equal(signin.closest('details, dialog, [popover]').length, 0, 'not collapsed content');
  const js = readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
  assert.ok(!js.includes('data-demo-signin'), 'the sign-in fact must not depend on JavaScript');

  // Restated wherever the demo is discussed in prose, not only at the button.
  const howToBegin = norm($('section#how-to-begin').text());
  assert.ok(
    /sign-in may be required/i.test(howToBegin),
    'the section that discusses the demo repeats the access precondition',
  );
});

test('dom: the demo is never presented as open, anonymous, or guaranteed to work', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const claim of FORBIDDEN_ACCESS_CLAIMS) {
    assert.ok(!haystack.includes(claim), `false access claim about the demo: "${claim}"`);
  }
  // The five original facts survive verbatim alongside the sixth.
  for (const fact of [
    'demonstration environment',
    'simulated data',
    'no broker connection',
    'no real orders',
    'not production-ready',
  ]) {
    assert.ok(haystack.includes(fact), `disclosure fact lost: "${fact}"`);
  }
});

/* ---------- evaluation, pricing, SPY boundary, signup ---------- */

test('dom: the evaluation is stated as 33 days, demo and paper only', () => {
  const text = visibleText();
  assert.ok(/free 33-day evaluation/i.test(text), 'the 33-day term is stated plainly');
  assert.ok(/demo and paper mode only/i.test(text), 'demo and paper mode only is stated');
  assert.ok(
    /no real orders/i.test(text) && /no live capital/i.test(text),
    'the no-live-capital boundary is stated',
  );
  assert.ok(
    /(ends automatically|no broker connection)/i.test(text),
    'the end of access or the absence of a broker connection is stated',
  );
});

test('dom: prices are labelled planned, with no purchase control', () => {
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
  assert.ok(/not built/i.test(status), 'the status states that checkout is not built');
  assert.ok(/planned/i.test(status), 'the prices are labelled planned');
  assert.ok(
    /nothing here to buy|no payment can be taken/i.test(status),
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

test('dom: the SPY Pipeline section states the boundary and carries no access control', () => {
  const section = $('section#spy-pipeline');
  assert.equal(section.length, 1);
  const text = norm(section.text());
  assert.ok(/Interactive Brokers paper-trading account/i.test(text), 'the account requirement');
  assert.ok(/not yet built/i.test(text), 'verification is stated as unbuilt');
  assert.ok(
    /does not include or unlock/i.test(text),
    'the evaluation must not be implied to unlock the pipeline',
  );
  assert.equal(section.find('button').length, 0, 'no control in this section');
  assert.equal(section.find('a[href]').length, 0, 'no access or affiliate link in this section');
});

test('dom: signup is marked designed but not built, with no capture of any kind', () => {
  const text = visibleText();
  assert.ok(/designed but not yet built|Designed, not built/i.test(text), 'signup status stated');
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
  const notice = norm($('.panel__note').first().text());
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

test('dom: exactly three off-origin destinations exist — the demo, Site 1, and the Leadership library', () => {
  const hrefs = $('a[href^="http"]')
    .map((_, el) => $(el).attr('href'))
    .get();
  assert.deepEqual([...new Set(hrefs)].sort(), [LEADERSHIP_URL, LIBRARY_URL, DEMO_URL].sort());
  assert.equal(hrefs.length, 3, 'no duplicate off-origin links');
});

test('dom: exactly two reciprocal links exist — Site 1 and the Leadership library, each singular', () => {
  const links = $('[data-sibling-site]');
  assert.equal(links.length, 2, 'exactly two reciprocal links — no alternate paths');

  const leadership = $('[data-sibling-site="leadership"]');
  assert.equal(leadership.length, 1, 'exactly one link to Site 1');
  assert.equal(leadership.attr('href'), LEADERSHIP_URL);
  assert.equal(leadership.get(0).tagName, 'a', 'the reciprocal link is a real anchor');
  const leadershipLabel = norm(leadership.text()).replace(/[↗\s]+$/, '').trim();
  assert.equal(leadershipLabel, 'Lime Signalworks', 'Site 1 reciprocal link label');
  assert.equal(leadership.attr('rel'), 'noopener noreferrer');

  const library = $('[data-sibling-site="library"]');
  assert.equal(library.length, 1, 'exactly one link to the Leadership library');
  assert.equal(library.attr('href'), LIBRARY_URL);
  assert.equal(library.get(0).tagName, 'a', 'the library link is a real anchor');
  const libraryLabel = norm(library.text()).replace(/[↗\s]+$/, '').trim();
  assert.equal(libraryLabel, 'LIME Leadership', 'library reciprocal link label');
  assert.equal(library.attr('rel'), 'noopener noreferrer');

  for (const link of [leadership, library]) {
    assert.equal(link.attr('hidden'), undefined, 'the reciprocal link is not hidden');
    assert.equal(link.attr('aria-hidden'), undefined, 'the reciprocal link is exposed to AT');
    assert.equal(link.closest('.sr-only').length, 0, 'the reciprocal link is visible, not sr-only');
    assert.ok(!link.hasClass('anchor-link'), 'must not reuse the protected anchor-link class');
  }
  assert.equal($(`a[href^="${LEADERSHIP_URL}"]`).length, 1, 'no second path into Site 1');
  assert.equal($(`a[href^="${LIBRARY_URL}"]`).length, 1, 'no second path into the library');
});

/* ---------- footer ---------- */

test('dom: the footer carries the exact securities disclaimer', () => {
  const disclaimer = $('[data-securities-disclaimer]');
  assert.equal(disclaimer.length, 1);
  assert.equal(norm(disclaimer.text()), SECURITIES_DISCLAIMER);
  assert.equal(disclaimer.closest('footer').length, 1, 'the disclaimer sits in the footer');
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
  // Production readiness may only appear as the demo disclosure's own negation.
  const productionMentions = [...visibleText().matchAll(/production[- ]ready/gi)];
  assert.equal(productionMentions.length, 1, 'production-ready is mentioned only once');
  assert.ok(
    DEMO_DISCLOSURE.includes('Not production-ready'),
    'and only inside the negated disclosure',
  );
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
