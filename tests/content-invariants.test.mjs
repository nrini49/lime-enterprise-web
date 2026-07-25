/**
 * Content invariant checks for the Site 2 preview.
 * Validates the data layer and the rendered index.html DOM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

const rolesData = readJson('data/operating-roles.json');
const lib = readJson('data/principles.json');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const $ = cheerio.load(html);

/** Expected roster, in order. */
const EXPECTED_ROLES = [
  ['01', 'Guardian', 'Grace Hopper'],
  ['02', 'Sage', 'Peter Drucker'],
  ['03', 'Herald', 'Barbara Walters'],
  ['04', 'Contemplative', 'Maya Angelou'],
  ['05', 'Watchman', 'Katherine Johnson'],
  ['06', 'Intercessor', 'Eleanor Roosevelt'],
  ['07', 'Shepherd', 'Jack Bogle'],
  ['08', 'Joker', 'Robin Williams'],
  ['09', 'Voice in the Wilderness', 'Rachel Carson'],
];

const EXPECTED_QUOTE_IDS = Array.from({ length: 20 }, (_, i) => `A${i + 1}`);

/**
 * Terms that must never appear in rendered output or metadata.
 * Word-boundary matched to avoid false hits inside ordinary words.
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
  'flame',
  'noah',
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
];

/**
 * Predecessor pairings from the research source. Substring-matched, because the
 * bare first names collide with the names of real modern figures on this page.
 */
const FORBIDDEN_PAIRINGS = [
  'for peter',
  'for solomon',
  'for daniel',
  'for esther',
  'for ruth',
  'for david',
  'for mary',
  'king solomon',
  'mary magdalene',
  'mary of bethany',
  'john the baptist',
  'substitution',
  'substitute for',
];

/** Quote records that must never appear (Group B / reserve / excluded / rev.1-only). */
const FORBIDDEN_QUOTE_FRAGMENTS = [
  'Noah rule',
  'predicting rain',
  'It never was my thinking that made the big money',
  'My position was right but my play was wrong',
  'The market does not beat them',
  'deadly enemies of the speculator',
  'Be fearful when others are greedy',
  'margin of safety',
  'You only have to do a very few things right',
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

test('data: exactly 9 operating roles, in the expected order', () => {
  assert.equal(rolesData.roles.length, 9);
  assert.deepEqual(
    rolesData.roles.map((r) => [r.index, r.role, r.figure]),
    EXPECTED_ROLES,
  );
});

test('data: exactly 20 principle records with ids A1–A20 and no duplicates', () => {
  assert.equal(lib.records.length, 20);
  const ids = lib.records.map((r) => r.id);
  assert.deepEqual([...ids].sort(), [...EXPECTED_QUOTE_IDS].sort());
  assert.equal(new Set(ids).size, 20);
});

test('data: seven themes, every record mapped, every theme populated', () => {
  assert.equal(lib.themes.length, 7);
  const themeIds = new Set(lib.themes.map((t) => t.id));
  for (const record of lib.records) assert.ok(themeIds.has(record.theme), `bad theme ${record.id}`);
  for (const theme of lib.themes) {
    assert.ok(
      lib.records.some((r) => r.theme === theme.id),
      `empty theme ${theme.id}`,
    );
  }
});

test('data: every record carries wording, attribution, source, year and an https url', () => {
  for (const record of lib.records) {
    for (const field of ['quote', 'attribution', 'speaker', 'source', 'year', 'url']) {
      assert.ok(record[field] && String(record[field]).trim().length > 0, `${record.id}.${field}`);
    }
    assert.match(record.url, /^https:\/\//, `${record.id} url must be https`);
    const words = record.quote.trim().split(/\s+/).length;
    assert.ok(words >= 8 && words <= 24, `${record.id} word count out of range: ${words}`);
  }
});

test('data: no worker-facing risk or permission labels leak into the data layer', () => {
  const serialised = JSON.stringify(lib).toLowerCase();
  for (const term of ['orange', 'yellow (medium)', 'permission-risk', 'group b', 'blocker']) {
    assert.ok(!serialised.includes(term), `risk label leaked: ${term}`);
  }
});

test('dom: exactly 9 role entries rendered with unique ids', () => {
  const roles = $('[data-role-id]');
  assert.equal(roles.length, 9);
  const ids = roles.map((_, el) => $(el).attr('data-role-id')).get();
  assert.equal(new Set(ids).size, 9);
  EXPECTED_ROLES.forEach(([index, role, figure], i) => {
    const text = $(roles[i]).text().replace(/\s+/g, ' ');
    assert.ok(text.includes(index), `role ${index} index missing`);
    assert.ok(text.includes(role), `role ${role} title missing`);
    assert.ok(text.includes(figure), `role figure ${figure} missing`);
  });
});

test('dom: exactly 20 quote records rendered with unique ids and exact wording', () => {
  const rendered = $('[data-quote-id]');
  assert.equal(rendered.length, 20);
  const ids = rendered.map((_, el) => $(el).attr('data-quote-id')).get();
  assert.equal(new Set(ids).size, 20);
  assert.deepEqual([...ids].sort(), [...EXPECTED_QUOTE_IDS].sort());

  for (const record of lib.records) {
    const node = $(`[data-quote-id="${record.id}"]`);
    assert.equal(node.length, 1, `${record.id} must render once`);
    assert.equal(
      node.find('blockquote').text().trim(),
      record.quote,
      `${record.id} wording must match the library exactly`,
    );
    assert.equal(node.find('blockquote').attr('cite'), record.url);
    const caption = node.find('figcaption').text().replace(/\s+/g, ' ').trim();
    const expectedCaption = record.attribution.replaceAll('*', '');
    assert.equal(caption, expectedCaption, `${record.id} attribution must match`);
    const link = node.find('a[href]');
    assert.equal(link.attr('href'), record.url, `${record.id} source link`);
    assert.equal(link.attr('target'), '_blank');
    assert.equal(link.attr('rel'), 'noopener noreferrer');
  }
});

test('dom: html element ids are unique across the document', () => {
  const ids = $('[id]')
    .map((_, el) => $(el).attr('id'))
    .get();
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(duplicates, [], `duplicate element ids: ${duplicates.join(', ')}`);
});

test('dom: the exact standing attribution disclaimer is present', () => {
  const notice = $('[data-quote-disclaimer]').text().replace(/\s+/g, ' ');
  assert.ok(notice.includes(lib.standingDisclaimer), 'standing disclaimer wording must be exact');
});

test('dom: no forbidden terms in rendered output or metadata', () => {
  const haystack = `${visibleText()} ${metadataText()}`.toLowerCase();
  for (const term of FORBIDDEN_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'i');
    assert.ok(!pattern.test(haystack), `forbidden term appears in rendered output: "${term}"`);
  }
  for (const pairing of FORBIDDEN_PAIRINGS) {
    assert.ok(!haystack.includes(pairing), `predecessor pairing appears: "${pairing}"`);
  }
});

test('dom: no quote from the rejected, reserve, group B or excluded sets', () => {
  // Case-sensitive: "Be fearful…" is the rejected paraphrase, while A15 legitimately
  // contains the lower-case clause "…to be fearful when others are greedy…" as written
  // in the 1986 letter.
  const haystack = visibleText();
  for (const fragment of FORBIDDEN_QUOTE_FRAGMENTS) {
    assert.ok(
      !haystack.includes(fragment),
      `non-Group-A quotation fragment appears: "${fragment}"`,
    );
  }
  const a15 = $('[data-quote-id="A15"] blockquote').text().trim();
  assert.ok(a15.startsWith('we simply attempt'), 'A15 must keep the letter\u2019s own wording');
});

test('dom: no unsupported commercial claims or transactional controls', () => {
  const haystack = visibleText().toLowerCase();
  for (const phrase of [
    'trusted by',
    'our customers',
    'endorsed by',
    'guaranteed',
    'certified secure',
    'soc 2',
    'best-in-class',
    'industry-leading',
    'get started',
    'sign up',
    'book a demo',
    'buy now',
    'start free trial',
    'per month',
  ]) {
    assert.ok(!haystack.includes(phrase), `unsupported or transactional copy: "${phrase}"`);
  }
  assert.equal($('form').length, 0, 'no forms on this surface');
  assert.equal($('input[type="email"], input[type="tel"]').length, 0, 'no contact capture');
});

test('dom: no portrait or likeness imagery is embedded', () => {
  assert.equal($('img').length, 0, 'no raster imagery is used on this surface');
  const figureNames = rolesData.roles.map((r) => r.figure.toLowerCase());
  const svgLabels = $('svg[aria-label]')
    .map((_, el) => ($(el).attr('aria-label') || '').toLowerCase())
    .get()
    .join(' ');
  for (const name of figureNames) {
    assert.ok(!svgLabels.includes(name), `figure name used as image label: ${name}`);
  }
});

test('dom: quote records are visually separated from the page anchor', () => {
  const anchor = $('.anchor-link');
  assert.equal(anchor.length, 1, 'exactly one non-transactional anchor');
  const anchorSection = anchor.closest('section');
  assert.equal(
    anchorSection.find('[data-quote-id]').length,
    0,
    'the anchor section must contain no quotations',
  );
  const quoteSection = $('#principles');
  assert.equal(quoteSection.find('.anchor-link').length, 0, 'no anchor inside the quote section');
  assert.equal(quoteSection.find('button[data-theme-chip]').length, 8, 'filters only, no CTAs');
  $('[data-quote-id]').each((_, el) => {
    const links = $(el).find('a[href]');
    assert.equal(links.length, 1, 'each record links only to its own source');
  });
});

test('dom: accessibility scaffolding is present', () => {
  assert.equal($('h1').length, 1, 'exactly one h1');
  assert.ok($('a.skip-link').attr('href') === '#main', 'skip link targets main');
  assert.equal($('main#main').length, 1);
  assert.ok($('html').attr('lang'), 'lang attribute set');
  assert.ok($('[data-theme-toggle]').attr('aria-label'), 'theme toggle labelled');
  assert.equal($('[data-result-count]').attr('role'), 'status', 'result count is a live region');
  $('svg').each((_, el) => {
    const svg = $(el);
    const labelled = svg.attr('aria-label') || svg.attr('role') === 'img';
    const hidden = svg.attr('aria-hidden') === 'true';
    assert.ok(labelled || hidden, 'every svg is labelled or hidden from assistive tech');
  });
  $('button').each((_, el) => {
    const button = $(el);
    const text = button.text().replace(/\s+/g, ' ').trim();
    assert.ok(text.length > 0 || button.attr('aria-label'), 'every button has an accessible name');
  });
  assert.equal(
    $('[data-theme-chip][aria-pressed="true"]').length,
    1,
    'exactly one theme filter is pressed by default',
  );
});

test('dom: library filtering is progressive — all records exist without javascript', () => {
  assert.equal($('[data-quote-id][hidden]').length, 0, 'no record ships hidden');
  assert.equal($('[data-theme-group]').length, lib.themes.length);
});

test('dom: status label identifies this surface as a preview', () => {
  const chip = $('.status-chip').text().toLowerCase();
  assert.ok(chip.includes('content integration preview'), 'honest status label present');
  const brand = $('.brand').text().replace(/\s+/g, ' ');
  assert.ok(/Lime Signalworks/i.test(brand) && /Enterprise/i.test(brand), 'Site 2 header identity');
});
