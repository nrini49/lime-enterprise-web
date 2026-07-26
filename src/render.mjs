#!/usr/bin/env node
/**
 * Build step: render data/homepage.json into a static index.html.
 * data/homepage.json is the single source of truth for canonical strings, the
 * section order, the market-report example, pricing, and the start cards.
 * index.html is generated output.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
                  <th scope="col" class="num">Planned price</th>
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

async function main() {
  const [dataRaw, template] = await Promise.all([
    readFile(path.join(root, 'data', 'homepage.json'), 'utf8'),
    readFile(path.join(root, 'src', 'template.html'), 'utf8'),
  ]);

  const data = JSON.parse(dataRaw);
  const { canonical, sectionOrder, marketReport, pricing, startCards } = data;

  const html = template
    .replaceAll('{{NAV}}', renderNav(sectionOrder))
    .replaceAll(
      '{{DEMO_CTA}}',
      externalLink(canonical.demoUrl, canonical.demoCtaLabel, 'cta'),
    )
    .replaceAll('{{DEMO_DISCLOSURE}}', esc(canonical.demoDisclosure))
    .replaceAll('{{DEMO_SIGNIN}}', esc(canonical.demoSignIn))
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
    .replaceAll(
      '{{LEADERSHIP_LINK}}',
      `<a class="sibling-link" href="${esc(canonical.leadershipUrl)}" rel="noopener noreferrer" ` +
        `data-sibling-site>${esc(canonical.leadershipLabel)}` +
        `<span class="ext" aria-hidden="true">&#8599;</span></a>`,
    )
    .replaceAll('{{SECURITIES_DISCLAIMER}}', esc(canonical.securitiesDisclaimer))
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
      `${pricing.rows.length} planned prices, ${marketReport.rows.length} example report rows`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
