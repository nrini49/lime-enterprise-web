/**
 * The four-page site (2026-11-22): Home, How Rosie Works, Harbor Now and Blog share one
 * masthead menu. The pages and their order live in data/homepage.json (pages); this
 * module turns them into the same <nav> links on every page, including Harbor Now.
 *
 * Links are root-relative ("/how-rosie-works/"), folder + index.html, so the output runs
 * as plain static files on any host that serves index.html for a folder (Vercel today,
 * GoDaddy later). Following the 2026-11-01 rule, every link that leaves the current page
 * opens in a new window; the current page's own entry is a same-page link to #main,
 * marked aria-current="page".
 */
export const NEW_WINDOW = ' target="_blank" rel="noopener noreferrer"';

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** The shared masthead menu. currentId is the page being rendered, or null. */
export function siteNav(pages, currentId) {
  return pages
    .map((p) =>
      p.id === currentId
        ? `<a href="#main" aria-current="page" data-page-link="${esc(p.id)}">${esc(p.nav)}</a>`
        : `<a href="${esc(p.path)}"${NEW_WINDOW} data-page-link="${esc(p.id)}">${esc(p.nav)}</a>`,
    )
    .join('\n          ');
}

/** The brand link: back to the top on the home page, to the home page elsewhere. */
export const brandLink = (currentId) =>
  currentId === 'home' ? 'href="#main"' : `href="/"${NEW_WINDOW}`;

/** "Latest from the blog": the newest posts (up to three) or an honest empty state. */
export function blogStrip(posts) {
  const latest = posts.slice(0, 3);
  const list = latest.length
    ? `<ul class="blog-strip__list" data-blog-strip-posts>${latest
        .map(
          (p) => `
              <li><a href="${esc(p.url)}"${NEW_WINDOW}><time datetime="${esc(p.date)}">${esc(p.date)}</time> <span>${esc(p.title)}</span></a></li>`,
        )
        .join('')}
            </ul>`
    : `<p class="blog-strip__empty" data-blog-strip-empty>No posts yet. The first ones are coming soon.</p>`;
  return `      <section class="section blog-strip" aria-labelledby="blog-strip-title" data-blog-strip>
        <div class="shell">
          <p class="label rule-after">Lime Signalworks · Blog</p>
          <h2 class="hn-h blog-strip__title" id="blog-strip-title">Latest from the blog</h2>
          ${list}
          <p class="anchor-row"><a class="anchor-link" href="/blog/"${NEW_WINDOW}>Visit the blog</a></p>
        </div>
      </section>`;
}
