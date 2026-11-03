/**
 * Tech Tips (2026-11-02): a technology-only reading space under /tech-tips/.
 * Practical how-tos for running Rosie Keelwise on the customer's own PC. No market talk.
 *
 * Source: data/tech-tips.json. Post text may use only <strong>, <em>, <code> and <kbd>
 * inline; everything else is escaped. The build refuses to write a page that:
 *   - uses advice, promise, performance or result wording (TIPS_BANNED),
 *   - has Rosie's first-person lines slip into "we/our/us",
 *   - lacks the "general information, not financial advice" footer note.
 *
 * Output:
 *   tech-tips/index.html          index of posts
 *   tech-tips/<slug>/index.html   one page per post, with Article JSON-LD
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pluralVoice } from './harbor.mjs';

export const ALLOWED_INLINE = ['strong', 'em', 'code', 'kbd'];

/** Never allowed anywhere in Tech Tips. Lowercased substring / regex checks. */
export const TIPS_BANNED = [
  /you should/i, /\bi recommend/i, /\bwe recommend/i, /\bi promise/i, /guarantee/i,
  /\bprofit/i, /\breturns?\b(?! (to|key))/i, /performance/i, /track record/i, /\bresults?\b/i,
  /\bbuy\b/i, /\bsell\b/i, /\bcrypto/i, /\bforex\b/i, /\bfutures\b/i, /\boptions\b/i,
  /rosie ib\b/i, /rosie schwab/i, /rechtman/i, /\bsignal to\b/i,
];

const esc = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Escape everything, then re-allow the small inline tag set. */
export function inline(s) {
  let out = esc(s);
  for (const t of ALLOWED_INLINE) {
    out = out.replaceAll(`&lt;${t}&gt;`, `<${t}>`).replaceAll(`&lt;/${t}&gt;`, `</${t}>`);
  }
  return out;
}

const plain = (s) => String(s).replace(/<\/?[a-z]+>/g, '');

export class TechTipsError extends Error {}

/** All reader-visible text of a post (or the section), for the gates and the tests. */
export function postText(post) {
  const parts = [post.title, post.description, post.rosie];
  for (const s of post.sections) {
    parts.push(s.heading, s.code || '', ...(s.paragraphs || []), ...(s.steps || []), s.after || '');
  }
  return plain(parts.join(' '));
}

export function checkTips(tips) {
  const problems = [];
  // The footer note says "not financial or investment advice" on purpose; check it separately.
  const texts = [
    ['section', plain([tips.section.title, tips.section.description, tips.section.intro, tips.section.rosie].join(' '))],
    ...tips.posts.map((p) => [p.slug, postText(p)]),
  ];
  for (const [where, text] of texts) {
    for (const r of TIPS_BANNED) if (r.test(text)) problems.push(`${where}: banned wording ${r}`);
  }
  for (const line of [tips.section.rosie, ...tips.posts.map((p) => p.rosie)]) {
    if (!/^From me, Rosie:/.test(line)) problems.push(`Rosie's line must open "From me, Rosie:": ${line}`);
    if (pluralVoice(line)) problems.push(`Rosie says "we/our/us": ${line}`);
  }
  if (!/^General information only, not financial or investment advice\./.test(tips.footerNote)) {
    problems.push('footer note must open "General information only, not financial or investment advice."');
  }
  const slugs = tips.posts.map((p) => p.slug);
  for (const s of slugs) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) problems.push(`unreadable slug: ${s}`);
  if (new Set(slugs).size !== slugs.length) problems.push('duplicate slug');
  for (const p of tips.posts) {
    if (p.description.length > 200) problems.push(`${p.slug}: meta description over 200 characters`);
    const raw = JSON.stringify(p);
    for (const m of raw.matchAll(/<\/?([a-zA-Z][\w-]*)[^>]*>/g)) {
      if (!ALLOWED_INLINE.includes(m[1]) || m[0] !== `<${m[0][1] === '/' ? '/' : ''}${m[1]}>`) problems.push(`${p.slug}: tag ${m[0]}`);
    }
  }
  if (problems.length) throw new TechTipsError(`Tech Tips:\n    - ${problems.join('\n    - ')}`);
}

export async function loadTips(root) {
  return JSON.parse(await readFile(path.join(root, 'data', 'tech-tips.json'), 'utf8'));
}

/** https://<CNAME>, the one origin used for canonical URLs, Open Graph and the sitemap. */
export async function siteOrigin(root) {
  const host = (await readFile(path.join(root, 'CNAME'), 'utf8')).trim();
  return `https://${host}`;
}

const prettyDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const OG_IMAGE = '/assets/img/rosie-portrait.png';

function head({ title, description, url, origin, type, jsonLd }) {
  return `    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="Lime Signalworks" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(origin + OG_IMAGE)}" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <script type="application/ld+json" data-tips-jsonld>${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script>`;
}

const ORG = { '@type': 'Organization', name: 'Lime Signalworks LLC' };

function page({ meta, body, tips, canonical }) {
  const html = `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
${head(meta)}
    <meta name="color-scheme" content="light" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%231f6b45'/%3E%3Cg stroke='%23f4f6f4' stroke-width='2.5' fill='none' stroke-linecap='square'%3E%3Cpath d='M6 21l7-7 5 5 8-8'/%3E%3Cpath d='M6 26h20'/%3E%3C/g%3E%3C/svg%3E" />
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/assets/fonts/archivo-latin.woff2" crossorigin />
    <link rel="stylesheet" href="/assets/css/fonts.css" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/site.css" />
    <link rel="stylesheet" href="/assets/css/tech-tips.css" />
  </head>
  <body class="tt">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead">
      <div class="shell masthead__inner">
        <video class="masthead__logo masthead__lighthouse" src="/assets/img/lighthouse-loop.mp4" poster="/assets/img/lighthouse-poster.png" width="92" height="92" muted loop playsinline preload="metadata" role="img" aria-label="Lime Signalworks logo: a lighthouse shining over the sea" data-header-logo="lighthouse"></video>
        <a class="brand" href="/" target="_blank" rel="noopener noreferrer">
          <span class="brand__name">Lime Signalworks<span class="brand__unit">LIME Enterprise</span></span>
        </a>
        <nav class="masthead__nav" aria-label="Tech Tips">
          <a href="/" target="_blank" rel="noopener noreferrer">Home</a>
          <a href="/tech-tips/" target="_blank" rel="noopener noreferrer" data-tips-nav>Tech Tips</a>
          <a href="/harbor-now/" target="_blank" rel="noopener noreferrer">Daily market report</a>
        </nav>
        <img class="masthead__logo masthead__rosie" src="/assets/img/rosie-portrait.png" width="92" height="92" alt="Rosie: a line-art portrait of a woman beside a small multicolored bar chart" data-header-logo="rosie" />
      </div>
    </header>
    <main id="main">
      <section class="section tt-section">
        <div class="shell">
${body}
          <aside class="notice tt-notice" data-tips-notice>
            <span class="label">Please note</span>
            <p>${esc(tips.footerNote)}</p>
          </aside>
        </div>
      </section>
    </main>
    <footer class="foot">
      <div class="shell foot__grid">
        <div>
          <p class="label">Lime Signalworks LLC · LIME Enterprise</p>
          <p class="foot__note">Tech Tips: practical how-tos for running Rosie Keelwise on your own computer. Technology only.</p>
          <p class="foot__harbor"><a class="anchor-link hn-foot-link" href="/" target="_blank" rel="noopener noreferrer">Back to the home page</a></p>
          <p class="foot__copyright">${esc(canonical.copyright)}</p>
        </div>
        <div>
          <p class="label">Disclaimer</p>
          <p class="foot__disclaimer">${esc(canonical.securitiesDisclaimer)}</p>
          <p class="foot__disclaimer">${esc(canonical.riskDisclosure)}</p>
        </div>
      </div>
    </footer>
    <script src="/assets/js/app.js" defer></script>
  </body>
</html>
`;
  if (!html.includes('data-tips-notice') || !html.includes(esc(tips.footerNote))) {
    throw new TechTipsError(`Tech Tips page ${meta.url} is missing the footer note`);
  }
  return html;
}

function renderSection(s) {
  const paras = (s.paragraphs || []).map((p) => `
            <p>${inline(p)}</p>`).join('');
  const code = s.code ? `
            <pre class="tt-code"><code>${esc(s.code)}</code></pre>` : '';
  const steps = s.steps ? `
            <ol class="tt-steps">${s.steps.map((x) => `
              <li>${inline(x)}</li>`).join('')}
            </ol>` : '';
  const after = s.after ? `
            <p class="tt-after">${inline(s.after)}</p>` : '';
  return `
          <section class="tt-block">
            <h2 class="hn-h">${esc(s.heading)}</h2>${code}${paras}${steps}${after}
          </section>`;
}

const postUrl = (origin, slug) => `${origin}/tech-tips/${slug}/`;

export async function buildTechTips(root, canonical) {
  const tips = await loadTips(root);
  checkTips(tips);
  const origin = await siteOrigin(root);
  const out = path.join(root, 'tech-tips');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const newestFirst = [...tips.posts].sort((a, b) => b.published.localeCompare(a.published));

  const list = newestFirst.map((p) => `
            <li>
              <a href="/tech-tips/${p.slug}/" target="_blank" rel="noopener noreferrer">
                <span class="tt-list__title">${esc(p.title)}</span>
              </a>
              <p class="tt-list__desc">${esc(p.description)}</p>
              <p class="tt-meta"><time datetime="${p.published}">${esc(prettyDate(p.published))}</time></p>
            </li>`).join('');

  const indexUrl = `${origin}/tech-tips/`;
  const indexBody = `          <div class="section__head hn-head">
            <p class="label rule-after">Lime Signalworks · Tech Tips</p>
            <h1 class="hn-h1">${esc(tips.section.title)}</h1>
            <p>${esc(tips.section.intro)}</p>
            <p class="tt-rosie" data-voice="rosie">${esc(tips.section.rosie)}</p>
          </div>
          <ol class="tt-list" data-tips-list>${list}
          </ol>`;
  await writeFile(path.join(out, 'index.html'), page({
    meta: {
      title: tips.section.metaTitle, description: tips.section.description, url: indexUrl, origin, type: 'website',
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Blog', name: `${tips.section.title} | Lime Signalworks`,
        description: tips.section.description, url: indexUrl, inLanguage: 'en-US', publisher: ORG,
        blogPost: newestFirst.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: postUrl(origin, p.slug), datePublished: p.published })),
      },
    },
    body: indexBody, tips, canonical,
  }), 'utf8');

  for (const p of tips.posts) {
    const url = postUrl(origin, p.slug);
    const body = `          <article class="tt-post" data-tips-post="${p.slug}">
          <div class="hn-head">
            <p class="label rule-after"><a href="/tech-tips/" target="_blank" rel="noopener noreferrer">Tech Tips</a> · <time datetime="${p.published}">${esc(prettyDate(p.published))}</time></p>
            <h1 class="hn-h1 tt-h1">${esc(p.title)}</h1>
            <p class="tt-rosie" data-voice="rosie">${esc(p.rosie)}</p>
          </div>${p.sections.map(renderSection).join('')}
          <p class="anchor-row"><a class="anchor-link" href="/tech-tips/" target="_blank" rel="noopener noreferrer">All Tech Tips</a></p>
          </article>`;
    await mkdir(path.join(out, p.slug), { recursive: true });
    await writeFile(path.join(out, p.slug, 'index.html'), page({
      meta: {
        title: `${p.shortTitle} | Lime Signalworks Tech Tips`, description: p.description, url, origin, type: 'article',
        jsonLd: {
          '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description,
          datePublished: p.published, dateModified: p.updated, inLanguage: 'en-US',
          author: ORG, publisher: ORG, mainEntityOfPage: { '@type': 'WebPage', '@id': url }, url,
          image: origin + OG_IMAGE, articleSection: tips.section.title,
        },
      },
      body, tips, canonical,
    }), 'utf8');
  }
  return { count: tips.posts.length, origin, urls: [indexUrl, ...tips.posts.map((p) => postUrl(origin, p.slug))] };
}
