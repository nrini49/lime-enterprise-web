#!/usr/bin/env node
/**
 * Build step: render data/homepage.json into a static index.html.
 * data/homepage.json is the single source of truth for canonical strings, the
 * section order, the market-report example, pricing, the indicators, and the start cards.
 * index.html is generated output.
 * It also renders Harbor Now (data/harbor/*.data.json) into harbor-now/ via src/harbor.mjs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildHarbor } from './harbor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const externalLink = (url, label, className) =>
  `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">` +
  `${esc(label)}<span class="ext" aria-hidden="true">&#8599;</span>` +
  `<span class="sr-only"> (opens in a new tab)</span></a>`;

/** A working contact channel: a real mailto:/tel: anchor, never a form. */
const contactLink = (href, label, marker) =>
  `<a class="contact__link" href="${esc(href)}" data-${esc(marker)}>${esc(label)}</a>`;

function renderNav(sections) {
  return sections
    .filter((s) => s.nav)
    .map((s) => `<a href="#${esc(s.id)}">${esc(s.nav)}</a>`)
    .join('\n          ');
}

function renderMarketTable(report) {
  const rows = report.rows
    .map(
      (r) => `
              <tr>
                <th scope="row"><span class="sym">${esc(r.symbol)}</span>
                  <span class="sym__name">${esc(r.name)}</span>
                </th>
                <td class="num">${esc(r.last)}</td>
                <td class="num ${r.change.startsWith('-') ? 'num--down' : 'num--up'}">${esc(
                  r.change,
                )}</td>
              </tr>`,
    )
    .join('');
  return `<div class="table-wrap">
            <table class="data-table">
              <caption class="sr-only">
                Example market situation report figures, ${esc(report.asOfLabel)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Instrument</th>
                  <th scope="col" class="num">Close</th>
                  <th scope="col" class="num">Change</th>
                </tr>
              </thead>
              <tbody>${rows}
              </tbody>
            </table>
          </div>`;
}

function renderPricingTable(pricing) {
  const rows = pricing.rows
    .map(
      (r) => `
              <tr>
                <th scope="row">${esc(r.term)}</th>
                <td class="num">${esc(r.price)}</td>
              </tr>`,
    )
    .join('');
  return `<div class="table-wrap">
            <table class="data-table" data-pricing-table>
              <caption class="sr-only">${esc(pricing.heading)}</caption>
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col" class="num">Price</th>
                </tr>
              </thead>
              <tbody>${rows}
              </tbody>
            </table>
          </div>`;
}

const renderList = (items) =>
  items.map((item) => `\n                <li>${esc(item)}</li>`).join('');

function renderCards(cards) {
  return cards
    .map(
      (card) => `
            <a class="card" href="${esc(card.href)}">
              <h3>${esc(card.title)}</h3>
              <p>${esc(card.body)}</p>
              <span class="card__go" aria-hidden="true">&#8594;</span>
            </a>`,
    )
    .join('');
}

/**
 * Each indicator is shown as a small framed artwork: an abstract, generated inline SVG
 * drawn only from palette colours (currentColor plus CSS classes), so it follows the
 * light/dark toggle. Decorative, so hidden from assistive tech.
 */
const INDICATOR_ART = {
  weather: `
                <rect class="art__fill-a" x="0" y="0" width="240" height="38" />
                <rect class="art__fill-b" x="0" y="38" width="240" height="38" />
                <rect class="art__fill-c" x="0" y="76" width="240" height="38" />
                <rect class="art__fill-d" x="0" y="114" width="240" height="36" />
                <path class="art__line" d="M0 112 C40 96 60 60 96 66 S150 30 180 44 S224 88 240 80" />`,
  notify: `
                <path class="art__rule" d="M20 40h200M20 75h200M20 110h200" />
                <circle class="art__dot" cx="70" cy="40" r="11" />
                <circle class="art__dot art__dot--soft" cx="120" cy="75" r="11" />
                <circle class="art__dot art__dot--hollow" cx="170" cy="110" r="11" />`,
  exhaustion: `
                <path class="art__rule" d="M16 132h208" />
                <path class="art__line" d="M16 130 C60 126 90 110 116 76 S170 26 196 30 S220 44 224 52" />
                <circle class="art__ring" cx="196" cy="30" r="9" />
                <circle class="art__ring art__ring--b" cx="196" cy="30" r="20" />`,
  stopwatcher: `
                <path class="art__line" d="M16 120 L60 96 L96 104 L140 64 L176 70 L224 30" />
                <path class="art__step" d="M16 132h60v-14h56v-26h52v-22h40" />
                <path class="art__rule" d="M184 20v116" />`,
  filters: `
                <rect class="art__layer" x="40" y="22" width="160" height="14" rx="3" />
                <rect class="art__layer" x="48" y="42" width="144" height="14" rx="3" />
                <rect class="art__layer" x="56" y="62" width="128" height="14" rx="3" />
                <rect class="art__layer" x="64" y="82" width="112" height="14" rx="3" />
                <rect class="art__layer art__layer--open" x="72" y="102" width="96" height="14" rx="3" />
                <path class="art__rule" d="M120 120v18" />`,
};

function renderIndicators(indicators) {
  return indicators
    .map((ind, i) => {
      const technical = ind.technical
        ? `
              <p class="artwork__tech"><span class="label">A little technical</span> ${esc(ind.technical)}</p>`
        : '';
      return `
            <li class="artwork">
              <svg class="artwork__canvas" viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none">${
                INDICATOR_ART[ind.art] || ''
              }
              </svg>
              <p class="artwork__no label">No. ${i + 1}</p>
              <h3>${esc(ind.name)}</h3>
              <p class="artwork__problem"><span class="label">The problem it solves</span> ${esc(ind.problem)}</p>
              <p class="artwork__answer">${esc(ind.answer)}</p>${technical}
            </li>`;
    })
    .join('');
}

/** The rendered section order must equal the order recorded in the data file. */
function assertSectionOrder(html, sections) {
  const rendered = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  const expected = sections.map((s) => s.id);
  if (rendered.join(',') !== expected.join(',')) {
    throw new Error(
      `Section order drift.\n  expected: ${expected.join(', ')}\n  rendered: ${rendered.join(', ')}`,
    );
  }
}

/** No in-page anchor may point at an id that does not exist: that would be an inert control. */
function assertAnchorsResolve(html) {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const broken = [...new Set(targets)].filter((t) => !ids.has(t));
  if (broken.length) throw new Error(`In-page anchors with no target: ${broken.join(', ')}`);
}

/** Element ids must be unique, or duplicate-id anchors resolve unpredictably. */
function assertUniqueIds(html) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length) throw new Error(`Duplicate element ids: ${[...new Set(duplicates)].join(', ')}`);
}

/** "Trading the way the pros do": heading, body and the three habits, all from the JSON. */
function renderPros(pros, sectionOrder) {
  const eyebrow = sectionOrder.find((s) => s.id === 'pros').eyebrow;
  const habits = pros.habits
    .map(
      (h) =>
        `            <div class="tile"><p class="label">${esc(h.label)}</p><p>${esc(h.text)}</p></div>`,
    )
    .join('\n');
  return `      <section class="section pros" id="pros" aria-labelledby="pros-title">
        <div class="shell">
          <div class="section__head">
            <p class="label rule-after">${esc(eyebrow)}</p>
            <h2 id="pros-title">${esc(pros.heading)}</h2>
            <p>${esc(pros.body)}</p>
          </div>
          <div class="tiles pros__habits">
${habits}
          </div>
        </div>
      </section>`;
}

async function main() {
  const [dataRaw, template] = await Promise.all([
    readFile(path.join(root, 'data', 'homepage.json'), 'utf8'),
    readFile(path.join(root, 'src', 'template.html'), 'utf8'),
  ]);

  const data = JSON.parse(dataRaw);
  const { canonical, sectionOrder, marketReport, pricing, startCards, indicators, pros } = data;

  const html = template
    .replaceAll('{{NAV}}', renderNav(sectionOrder))
    .replaceAll(
      '{{DEMO_CTA}}',
      `<a class="cta" href="${esc(canonical.demoUrl)}">${esc(canonical.demoCtaLabel)}</a>`,
    )
    .replaceAll('{{DEMO_DISCLOSURE}}', esc(canonical.demoDisclosure))
    .replaceAll('{{DEMO_ASK}}', esc(canonical.demoAsk))
    .replaceAll('{{CONTACT_EMAIL}}', contactLink(`mailto:${canonical.contact.email}`, canonical.contact.email, 'contact-email'))
    .replaceAll('{{CONTACT_PHONE}}', contactLink(canonical.contact.phoneHref, canonical.contact.phone, 'contact-phone'))
    .replaceAll('{{CONTACT_ADDRESS}}', esc(canonical.contact.address))
    .replaceAll('{{CONTACT_AVAILABILITY}}', esc(canonical.contact.availability))
    .replaceAll('{{MARKET_AS_OF}}', esc(marketReport.asOfLabel))
    .replaceAll('{{MARKET_TABLE}}', renderMarketTable(marketReport))
    .replaceAll('{{MARKET_POSTURE}}', esc(marketReport.posture))
    .replaceAll('{{MARKET_NOTICE}}', esc(marketReport.exampleNotice))
    .replaceAll('{{PRICING_HEADING}}', esc(pricing.heading))
    .replaceAll('{{PRICING_TABLE}}', renderPricingTable(pricing))
    .replaceAll('{{PRICING_STATUS}}', esc(pricing.status))
    .replaceAll('{{PRICING_INCLUDES}}', renderList(pricing.includes))
    .replaceAll('{{PRICING_NOT}}', renderList(pricing.notThis))
    .replaceAll('{{START_CARDS}}', renderCards(startCards))
    .replaceAll('{{PROS}}', renderPros(pros, sectionOrder))
    .replaceAll('{{INDICATORS}}', renderIndicators(indicators))
    .replaceAll('{{SECURITIES_DISCLAIMER}}', esc(canonical.securitiesDisclaimer))
    .replaceAll('{{RISK_DISCLOSURE}}', esc(canonical.riskDisclosure))
    .replaceAll('{{EVAL_DAYS}}', String(canonical.evaluationDays))
    .replaceAll('{{COPYRIGHT}}', esc(canonical.copyright));

  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`Unreplaced template tokens: ${leftover.join(', ')}`);

  assertSectionOrder(html, sectionOrder);
  assertUniqueIds(html);
  assertAnchorsResolve(html);

  await writeFile(path.join(root, 'index.html'), html, 'utf8');
  console.log(
    `built index.html — ${sectionOrder.length} sections, ${startCards.length} start cards, ` +
      `${pricing.rows.length} prices, ${marketReport.rows.length} example report rows`,
  );

  const harbor = await buildHarbor(root, canonical);
  console.log(
    `built harbor-now/ — ${harbor.count} editions, latest ${harbor.latest}` +
      (harbor.stale ? ' (stale: restart note shown)' : ''),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
