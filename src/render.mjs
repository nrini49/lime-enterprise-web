#!/usr/bin/env node
/**
 * Build step: render data/homepage.json into the static site (four menu pages, plus the
 * Get Rosie landing, 2026-11-23). data/homepage.json is the single source of truth for
 * canonical strings, the pages, the section order (and which page each section sits on),
 * the market-report example, pricing, the indicators, the start cards, and the Get Rosie
 * landing (offerPage). src/template.html holds every section's markup once; this script
 * places each section on its page:
 *   index.html                 Home
 *   how-rosie-works/index.html How Rosie Works
 *   harbor-now/                Harbor Now (via src/harbor.mjs, with the market-report section)
 *   blog/index.html            Blog (from data/blog.json)
 *   get-rosie/index.html       Get Rosie landing (not in the main menu)
 *   404.html                   Branded not-found page (same shell; not in the menu)
 * All of these are generated output, committed so the site works with no build step.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildHarbor } from './harbor.mjs';
import { siteNav, brandLink, NEW_WINDOW as SITE_NEW_WINDOW } from './site.mjs';

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

/**
 * Video links (2026-11-01). Every URL comes from canonical.videos in data/homepage.json,
 * the one place to change them. A video whose url is still null never renders a link of
 * its own: the tour button falls back to the existing YouTube channel with an honest
 * label, so a visitor never meets a broken or invented video link. Always a new window.
 */
const PLAY_ICON =
  '<svg class="video-cta__icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.16" />' +
  '<path d="M10 8.2v7.6L16 12z" fill="currentColor" /></svg>';

function videoLink(video, channelUrl, kind) {
  const real = typeof video.url === 'string' && video.url.length > 0;
  const href = real ? video.url : channelUrl;
  const label = real ? video.label : video.fallbackLabel || video.label;
  return (
    `<a class="video-cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer" ` +
    `data-video="${esc(kind)}"${real ? '' : ' data-video-placeholder'}>` +
    `${PLAY_ICON}<span class="video-cta__label">${esc(label)}</span>` +
    `<span class="ext" aria-hidden="true">&#8599;</span>` +
    `<span class="sr-only"> (opens in a new tab)</span></a>`
  );
}

/**
 * New window (2026-11-01): every link that leaves the current page opens in a new window
 * with noopener noreferrer, so focus stays put and both windows stay open for reference.
 * Same-page anchors (#...), mailto: and tel: links are left alone.
 */
const NEW_WINDOW = ' target="_blank" rel="noopener noreferrer"';
const leavesPage = (href) => !/^(#|mailto:|tel:)/i.test(String(href));
const newWindow = (href) => (leavesPage(href) ? NEW_WINDOW : '');

/** A working contact channel: a real mailto:/tel: anchor, never a form. */
const contactLink = (href, label, marker) =>
  `<a class="contact__link" href="${esc(href)}" data-${esc(marker)}>${esc(label)}</a>`;

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

function renderPricingTable(pricing, tableAttr = 'data-pricing-table') {
  const rows = pricing.rows
    .map(
      (r) => `
              <tr>
                <th scope="row">${esc(r.term)}</th>
                <td class="num">${esc(r.price)}</td>
              </tr>`,
    )
    .join('');
  // Price block (2026-11-22, "snap and pop"): the first row shown large, the
  // monthly row under it. Same figures as the table, nothing new.
  const [lead, monthly] = pricing.rows;
  const pending = pricing.pendingConfirmation
    ? `<p class="flag" data-price-pending>${esc(pricing.pendingNote || 'Proposed figures — pending confirmation')}</p>`
    : '';
  return `${pending}<div class="price-hero" data-price-hero>
            <span class="price-hero__term">${esc(lead.term)}</span>
            <strong class="price-hero__amount">${esc(lead.price)}</strong>
            <span class="price-hero__sub">${esc(monthly.term)}: <strong>${esc(monthly.price)}</strong></span>
          </div>
          <div class="table-wrap">
            <table class="data-table" ${tableAttr}>
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
            <a class="card" href="${esc(card.href)}"${newWindow(card.href)}>
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
  const expected = sections;
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
  return `      <section class="section pros" id="pros" aria-labelledby="pros-title" data-voice="rosie">
        <div class="shell">
          <div class="section__head">
            <p class="label rule-after">${esc(eyebrow)}</p>
            <p class="label voice-tag" data-voice-tag>From Rosie</p>
            <h2 id="pros-title">${esc(pros.heading)}</h2>
            <p>${esc(pros.body)}</p>
          </div>
          <div class="tiles pros__habits">
${habits}
          </div>
        </div>
      </section>`;
}

/** Tokens filled in per page, after the shared template tokens. */
const PAGE_TOKENS = ['{{PAGE_TITLE}}', '{{PAGE_DESCRIPTION}}', '{{BRAND_LINK}}', '{{NAV}}'];

/**
 * Split the template's <main> into one chunk per <section id>, each chunk carrying the
 * comments and whitespace that come before it. Sections are never nested.
 */
function splitSections(inner) {
  const chunks = new Map();
  let pos = 0;
  for (const m of inner.matchAll(/<section\b[^>]*\sid="([^"]+)"[\s\S]*?<\/section>/g)) {
    const end = m.index + m[0].length;
    chunks.set(m[1], inner.slice(pos, end));
    pos = end;
  }
  return chunks;
}

/** Buttons: in-page and site links stay in this window; anything else opens a new one. */
const renderButtons = (ctas = []) =>
  ctas
    .map((c) => `<a class="btn btn--${esc(c.kind)}" href="${esc(c.href)}">${esc(c.label)}</a>`)
    .join('\n            ');

/**
 * Video cards (2026-11-22, owner direction "include links for the videos"): a
 * self-hosted thumbnail and YouTube's own title, linking to YouTube in a new window.
 * No embedded player, no autoplay, nothing fetched from YouTube until clicked.
 */
const renderVideoCards = (videos, cls = '') =>
  videos.length
    ? `<ul class="video-cards ${cls}" data-video-cards>${videos
        .map(
          (v) => `
              <li><a class="video-card" href="https://www.youtube.com/watch?v=${esc(v.youtubeId)}"${NEW_WINDOW} data-video="${esc(v.youtubeId)}">
                <span class="video-card__thumb"><img src="/assets/img/video/${esc(v.youtubeId)}.jpg" width="640" height="360" loading="lazy" decoding="async" alt="" /><span class="video-card__play" aria-hidden="true"></span><span class="video-card__time">${esc(v.duration)}</span></span>
                <span class="video-card__title">${esc(v.title)}<span class="sr-only"> (video on YouTube, opens in a new tab)</span></span>
              </a></li>`,
        )
        .join('')}
            </ul>`
    : '';

/** The page heading for every page but Home, whose opening already carries the h1. */
const renderPageHead = (pg, videos) => `
      <div class="page-head${pg.hooks ? ' page-head--hero' : ''}" data-page-head="${esc(pg.id)}">
        <div class="shell">
          <p class="label rule-after">${esc(pg.eyebrow)}</p>
          <h1 class="page-head__title" id="page-title">${esc(pg.heading)}</h1>
          ${
            pg.ledeVoice
              ? `<div class="page-head__voice" data-voice="${esc(pg.ledeVoice)}"><span class="label voice-tag" data-voice-tag>From Rosie</span><p class="page-head__lede">${esc(pg.lede)}</p></div>`
              : `<p class="page-head__lede">${esc(pg.lede)}</p>`
          }${pg.ctas ? `
          <div class="btn-row">${renderButtons(pg.ctas)}</div>` : ''}${
            pg.hooks
              ? `
          <ul class="hooks" data-hooks>${pg.hooks
            .map(
              (h, i) => `
            <li><a class="hook" href="${esc(h.href)}"><span class="hook__n">${String(i + 1).padStart(2, '0')} · ${esc(h.label)}</span><strong class="hook__title">${esc(h.title)}</strong>${h.text ? `<span class="hook__text">${esc(h.text)}</span>` : ''}</a></li>`,
            )
            .join('')}
          </ul>`
              : ''
          }${
            videos.length
              ? `
          <div class="page-head__videos">
            <h2 class="page-head__videos-title" id="videos-title">Short videos</h2>
            ${renderVideoCards(videos)}
          </div>`
              : ''
          }
        </div>
      </div>
`;

/** The blog list, or its coming-soon note while there are no posts. Never invented posts. */
function renderBlog(posts) {
  // 2026-11-22 (owner t1991u): a pinned post stays on top. A post with a body is shown in
  // full here, credited to its author; it ends with a "Share your experience" link to the
  // contact section, because comments are not built yet (no fake comment box).
  const ordered = [...posts.filter((p) => p.pinned), ...posts.filter((p) => !p.pinned)];
  const linkAttrs = (url) => (/^\//.test(url) ? '' : SITE_NEW_WINDOW);
  const fmtDate = (iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const item = (p) =>
    p.body
      ? `
            <li class="blog-list__item blog-post${p.pinned ? ' blog-post--pinned' : ''}" id="${esc(p.id)}" data-blog-post="${esc(p.id)}"${p.author === 'Noal' ? ' data-voice="noal"' : ''}>
              <article aria-labelledby="${esc(p.id)}-title">
                <p class="label blog-post__meta">${p.pinned ? '<span class="blog-post__pin" data-pinned>Pinned</span> ' : ''}<time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time> · By <span data-attribution>${esc(p.author)}</span></p>
                <h3 id="${esc(p.id)}-title" class="blog-post__title">${esc(p.title)}</h3>
                ${p.body.map((para) => `<p>${esc(para)}</p>`).join('\n                ')}
                <p class="btn-row blog-post__share"><a class="btn btn--ghost" href="#contact" data-share-experience>Share your experience</a></p>
              </article>
            </li>`
      : `
            <li class="blog-list__item">
              <p class="label"><time datetime="${esc(p.date)}">${esc(fmtDate(p.date))}</time></p>
              <h3><a href="${esc(p.url)}"${linkAttrs(p.url)}>${esc(p.title)}</a></h3>
              <p>${esc(p.summary)}</p>
            </li>`;
  const list = posts.length
    ? `<ul class="blog-list" data-blog-posts>${ordered.map(item).join('')}
          </ul>`
    : `<div class="blog-empty" data-blog-empty>
            <p class="blog-empty__lead">Posts are coming soon.</p>
            <p>Experiences, Tech Tips and comments will appear here as they are written.
              Until then, you can <a href="#contact">call or email Lime Signalworks</a>.</p>
          </div>`;
  return `
      <section class="section blog" aria-labelledby="blog-posts-title" data-blog>
        <div class="shell">
          <div class="section__head">
            <h2 id="blog-posts-title">Posts</h2>
          </div>
          ${list}
        </div>
      </section>
`;
}

/** The hero's display line: Rosie's own two short sentences, the second in the accent. */
const heroDisplay = ([a, b]) =>
  `<div class="hero__display"><span>${esc(a)}</span> <span class="hero__display-accent">${esc(b)}</span></div>`;

const CHECK =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';


/** The branded 404 page: same masthead, footer and contact as the rest of the site. */
function renderNotFound(pages) {
  const links = pages
    .map(
      (pg) =>
        `<a class="btn btn--${pg.id === 'home' ? 'primary' : 'ghost'}" href="${esc(pg.path)}">${esc(pg.nav)}</a>`,
    )
    .join('\n            ');
  return `
      <div class="page-head" data-page-head="not-found">
        <div class="shell">
          <p class="label rule-after">Lime Signalworks</p>
          <div class="page-head__voice" data-voice="rosie">
            <span class="label voice-tag" data-voice-tag>From Rosie</span>
            <h1 class="page-head__title" id="page-title">This page isn&apos;t here</h1>
            <p class="page-head__lede">I don&apos;t have a page at this address. It may be an old link, or it may have been typed incorrectly. These pages are on this site:</p>
          </div>
          <div class="btn-row">
            ${links}
          </div>
        </div>
      </div>
`;
}

/** Exactly one h1 per page. */
function assertSingleH1(html, file) {
  const n = (html.match(/<h1\b/g) || []).length;
  if (n !== 1) throw new Error(`${file} has ${n} h1 elements; exactly one is required`);
}

async function main() {
  const [dataRaw, template] = await Promise.all([
    readFile(path.join(root, 'data', 'homepage.json'), 'utf8'),
    readFile(path.join(root, 'src', 'template.html'), 'utf8'),
  ]);

  const data = JSON.parse(dataRaw);
  const { canonical, pages, sectionOrder, marketReport, pricing, startCards, indicators, pros, offerPage } = data;
  const blog = JSON.parse(await readFile(path.join(root, 'data', 'blog.json'), 'utf8'));
  const home = pages.find((p) => p.id === 'home');
  const videosFor = (pageId) => (canonical.videos.library || []).filter((v) => v.pages.includes(pageId));

  const html = template
    .replaceAll('{{ROSIE_INTRO}}', esc(canonical.rosieIntro))
    .replaceAll(
      '{{DEMO_CTA}}',
      `<a class="cta" href="${esc(canonical.demoUrl)}"${newWindow(canonical.demoUrl)}>${esc(canonical.demoCtaLabel)}</a>`,
    )
    .replaceAll('{{TOUR_LINK}}', videoLink(canonical.videos.tour, canonical.videos.channelUrl, 'tour'))
    .replaceAll('{{HERO_DISPLAY}}', heroDisplay(home.hero.display))
    .replaceAll('{{HERO_CTAS}}', renderButtons(home.hero.ctas))
    .replaceAll('{{HERO_CHIPS}}', home.hero.chips.map((c) => `<li>${CHECK}<span>${esc(c)}</span></li>`).join(''))
    .replaceAll('{{HOME_VIDEOS}}', renderVideoCards(videosFor('home'), 'video-cards--hero'))
    // 2026-11-22 (owner t1998u): a video beside Rosie's rules and two beside the story.
    .replaceAll('{{RULES_VIDEOS}}', renderVideoCards(videosFor('home-rules'), 'video-cards--hero video-cards--aside'))
    .replaceAll('{{STORY_VIDEOS}}', renderVideoCards(videosFor('home-story'), 'video-cards--hero video-cards--aside'))
    .replaceAll('{{YOUTUBE_CHANNEL_URL}}', esc(canonical.videos.channelUrl))
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
    .replaceAll('{{OFFER_PRICING_TABLE}}', renderPricingTable(pricing, 'data-offer-pricing-table'))
    .replaceAll('{{PRICING_PENDING}}', esc(pricing.pendingNote || 'Proposed figures — pending confirmation'))
    .replaceAll('{{PRICING_STATUS}}', esc(pricing.status))
    .replaceAll('{{PRICING_INCLUDES}}', renderList(pricing.includes))
    .replaceAll('{{PRICING_NOT}}', renderList(pricing.notThis))
    .replaceAll('{{START_CARDS}}', renderCards(startCards))
    .replaceAll('{{PROS}}', renderPros(pros, sectionOrder))
    .replaceAll('{{INDICATORS}}', renderIndicators(indicators))
    .replaceAll('{{SECURITIES_DISCLAIMER}}', esc(canonical.securitiesDisclaimer))
    .replaceAll('{{RISK_DISCLOSURE}}', esc(canonical.riskDisclosure))
    .replaceAll('{{COPYRIGHT}}', esc(canonical.copyright));

  const leftover = html.match(/\{\{[A-Z_]+\}\}/g)?.filter((t) => !PAGE_TOKENS.includes(t));
  if (leftover?.length) throw new Error(`Unreplaced template tokens: ${leftover.join(', ')}`);

  // Every section's markup, keyed by id, with the comments that introduce it.
  const mainOpen = html.indexOf('<main id="main">') + '<main id="main">'.length;
  const mainClose = html.indexOf('</main>');
  const shellBefore = html.slice(0, mainOpen);
  const shellAfter = html.slice(mainClose);
  const chunks = splitSections(html.slice(mainOpen, mainClose));
  const known = sectionOrder.map((s) => s.id);
  const extra = [...chunks.keys()].filter((id) => !known.includes(id));
  if (extra.length) throw new Error(`Sections in the template but not in sectionOrder: ${extra.join(', ')}`);

  // Which page owns each id, so a link to a section on another page becomes a page link.
  const pageOf = new Map();
  for (const s of sectionOrder) {
    const knownPages = new Set([...(pages || []).map((p) => p.id), offerPage?.id].filter(Boolean));
    if (!knownPages.has(s.page)) throw new Error(`Section ${s.id} names unknown page ${s.page}`);
    const chunk = chunks.get(s.id);
    if (!chunk) throw new Error(`Section ${s.id} is in sectionOrder but not in the template`);
    for (const m of chunk.matchAll(/\sid="([^"]+)"/g)) pageOf.set(m[1], s.page);
  }
  const pageById = new Map(pages.map((p) => [p.id, p]));
  if (offerPage) pageById.set(offerPage.id, offerPage);

  const linkAcross = (body, pageId) =>
    body.replace(/href="#([^"]+)"([^>]*)>/g, (m, id, rest) => {
      const owner = pageOf.get(id);
      if (!owner || owner === pageId) return m;
      return `href="${pageById.get(owner).path}#${id}"${rest}>`;
    });

  const results = [];
  for (const pg of pages.filter((p) => p.id !== 'harbor')) {
    const ids = sectionOrder.filter((s) => s.page === pg.id).map((s) => s.id);
    // Section numbers follow the page they land on (data/homepage.json sectionOrder).
    let body = ids
      .map((id) => {
        const eyebrow = sectionOrder.find((s) => s.id === id).eyebrow;
        return chunks.get(id).replace(/<p class="label rule-after">Section \d\d<\/p>/, `<p class="label rule-after">${esc(eyebrow)}</p>`);
      })
      .join('');
    if (pg.heading) body = renderPageHead(pg, videosFor(pg.id)) + body;
    if (pg.id === 'blog') body += renderBlog(blog.posts);
    body = linkAcross(body, pg.id);

    const out = (shellBefore + body + '\n    ' + shellAfter)
      .replaceAll('{{PAGE_TITLE}}', esc(pg.title))
      .replaceAll('{{PAGE_DESCRIPTION}}', esc(pg.description))
      .replaceAll('{{BRAND_LINK}}', brandLink(pg.id))
      .replaceAll('{{NAV}}', siteNav(pages, pg.id));

    assertSectionOrder(out, ids);
    assertUniqueIds(out);
    assertAnchorsResolve(out);
    assertSingleH1(out, pg.file);

    await mkdir(path.dirname(path.join(root, pg.file)), { recursive: true });
    await writeFile(path.join(root, pg.file), out, 'utf8');
    results.push(`${pg.file} (${ids.length} sections)`);
  }
  if (offerPage) {
    const ids = sectionOrder.filter((s) => s.page === offerPage.id).map((s) => s.id);
    let body = ids
      .map((id) => {
        const eyebrow = sectionOrder.find((s) => s.id === id).eyebrow;
        return chunks.get(id).replace(/<p class="label rule-after">Section \d\d<\/p>/, `<p class="label rule-after">${esc(eyebrow)}</p>`);
      })
      .join('');
    if (offerPage.heading) body = renderPageHead(offerPage, videosFor(offerPage.id)) + body;
    body = linkAcross(body, offerPage.id);

    const out = (shellBefore + body + '\n    ' + shellAfter)
      .replaceAll('{{PAGE_TITLE}}', esc(offerPage.title))
      .replaceAll('{{PAGE_DESCRIPTION}}', esc(offerPage.description))
      .replaceAll('{{BRAND_LINK}}', brandLink(offerPage.id))
      .replaceAll('{{NAV}}', siteNav(pages, null));

    assertSectionOrder(out, ids);
    assertUniqueIds(out);
    assertAnchorsResolve(out);
    assertSingleH1(out, offerPage.file);

    await mkdir(path.dirname(path.join(root, offerPage.file)), { recursive: true });
    await writeFile(path.join(root, offerPage.file), out, 'utf8');
    results.push(`${offerPage.file} (${ids.length} sections)`);
  }

  console.log(
    `built ${results.join(', ')} — ${startCards.length} start cards, ` +
      `${pricing.rows.length} prices, ${marketReport.rows.length} example report rows, ${blog.posts.length} blog posts`,
  );

  // Harbor Now: its own editions, plus the sections the data file places on it
  // (the market-report explainer) and the "Latest from the blog" strip at the bottom.
  const harborSections = sectionOrder
    .filter((s) => s.page === 'harbor')
    .map((s) => linkAcross(chunks.get(s.id), 'harbor'))
    .join('');
  const harbor = await buildHarbor(root, canonical, { pages, harborSections, blogPosts: blog.posts });
  console.log(
    `built harbor-now/ — ${harbor.count} editions, latest ${harbor.latest}` +
      (harbor.stale ? ' (stale: restart note shown)' : ''),
  );

  const notFoundBody = renderNotFound(pages);
  let notFound = (shellBefore + notFoundBody + '\n    ' + shellAfter)
    .replaceAll('{{PAGE_TITLE}}', 'Page not found — Lime Signalworks')
    .replaceAll(
      '{{PAGE_DESCRIPTION}}',
      'This address is not a page on Lime Signalworks. The link may be old, or it may have been typed incorrectly.',
    )
    .replaceAll('{{BRAND_LINK}}', 'href="/"')
    .replaceAll('{{NAV}}', siteNav(pages, null));
  notFound = notFound.replace(
    '<meta name="robots" content="index, follow" />',
    '<meta name="robots" content="noindex" />',
  );
  assertSingleH1(notFound, '404.html');
  assertUniqueIds(notFound);
  assertAnchorsResolve(notFound);
  await writeFile(path.join(root, '404.html'), notFound, 'utf8');
  console.log('built 404.html');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
