#!/usr/bin/env node
/**
 * Copy the built site into dist/ as plain static files, ready to unzip or copy
 * into a host's public_html (GoDaddy cPanel). No Vercel runtime is required.
 *   npm run build && npm run export   →   dist/
 *   npm run package:godaddy           →   dist/ plus a zip
 * dist/ is gitignored. It holds the four pages, 404.html, the Harbor Now
 * editions, the sample-data demos, the assets, and an .htaccess. It does not
 * include /preview/evidence/, source, tests, or data. comments-api/ is the blog
 * comments endpoint (PHP); its stored comments live outside public_html. Nothing here uploads
 * anything; the upload is a separate, manual step after Noal approves.
 */
import { cp, rm, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeHtaccess } from './htaccess.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist'));
const SHIP = [
  'index.html',
  '404.html',
  'how-rosie-works',
  'harbor-now',
  'blog',
  'privacy',
  'terms',
  'rosie-demo',
  'rosie-demo-schwab',
  'assets',
  'comments-api',
];

async function mustExist(rel) {
  try {
    await access(path.join(root, rel));
  } catch {
    throw new Error(`export: ${rel} is missing; run npm run build first`);
  }
}

for (const item of SHIP) await mustExist(item);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// Never ship stored comments from a local test run: only the folder's own .htaccess.
const commentData = path.join(root, 'comments-api', 'data') + path.sep;
const shipIt = (src) => !src.startsWith(commentData) || path.basename(src) === '.htaccess';
for (const item of SHIP) await cp(path.join(root, item), path.join(out, item), { recursive: true, filter: shipIt });
const { redirects } = await writeHtaccess(out, root);
console.log(`exported ${SHIP.join(', ')} and .htaccess (${redirects} redirects) to dist/`);
