/**
 * One-off vendoring helper. Downloads the latin and latin-ext woff2 subsets for the
 * three self-hosted OFL 1.1 typefaces into assets/fonts/, then prints the @font-face
 * unicode-range values so assets/css/fonts.css can be kept in sync.
 *
 * The site itself never contacts a font service; this script exists only so the
 * vendored files can be regenerated and audited. Run manually:
 *   node scripts/fetch-fonts.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const FAMILIES = [
  { query: 'Inter:wght@400..700', slug: 'inter' },
  { query: 'Archivo:wght@400..700', slug: 'archivo' },
  { query: 'JetBrains+Mono:wght@400..500', slug: 'jetbrains-mono' },
];

const WANTED = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
};

const outDir = path.resolve(import.meta.dirname, '..', 'assets', 'fonts');
mkdirSync(outDir, { recursive: true });

for (const { query, slug } of FAMILIES) {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${query}&display=swap`,
    { headers: { 'User-Agent': UA } },
  ).then((r) => r.text());

  const blocks = css.split('@font-face').slice(1);
  for (const [subset, range] of Object.entries(WANTED)) {
    const block = blocks.find((b) => b.includes(range));
    if (!block) throw new Error(`${slug}: no ${subset} block found`);
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    const file = `${slug}-${subset}.woff2`;
    writeFileSync(path.join(outDir, file), buf);
    console.log(`${file} — ${(buf.length / 1024).toFixed(1)} kB — ${url}`);
  }
}
