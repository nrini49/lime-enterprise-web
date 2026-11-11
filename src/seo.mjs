/**
 * Crawl files (2026-11-02): sitemap.xml and robots.txt, written at build time.
 * The sitemap lists only indexable pages (index, follow): the home page, Harbor Now and its
 * editions, and Tech Tips. The demo (rosie-demo/, noindex) is deliberately left out.
 * robots.txt blocks nothing.
 */
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export async function buildSeo(root, { origin, tips }) {
  const harborDates = (await readdir(path.join(root, 'harbor-now'))).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
  const entries = [
    { loc: `${origin}/` },
    { loc: `${origin}/harbor-now/`, lastmod: harborDates.at(-1) },
    ...harborDates.map((d) => ({ loc: `${origin}/harbor-now/${d}/`, lastmod: d })),
    { loc: `${origin}/tech-tips/`, lastmod: tips.posts.map((p) => p.updated).sort().at(-1) },
    ...tips.posts.map((p) => ({ loc: `${origin}/tech-tips/${p.slug}/`, lastmod: p.updated })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(root, 'sitemap.xml'), xml, 'utf8');
  const robots = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
  await writeFile(path.join(root, 'robots.txt'), robots, 'utf8');
  return { urls: entries.length };
}
