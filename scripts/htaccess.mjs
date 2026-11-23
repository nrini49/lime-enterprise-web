/**
 * Apache .htaccess for GoDaddy cPanel (and any Apache host).
 * Path redirects are generated from vercel.json so they stay in sync with Vercel.
 * Also: HTTPS, apex → www (308, as on the Vercel project), no directory listing,
 * a branded 404, and a forbid-list so a whole-repo upload cannot serve source.
 *
 *   node scripts/write-htaccess.mjs        # writes ./.htaccess
 *   npm run export / npm run package:godaddy  # include it in the upload set
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DOMAIN = 'limesignalworks.com';
const WWW = `www.${DOMAIN}`;
const HOST_RE = DOMAIN.replace(/\./g, '\\.');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn one vercel.json redirect into a mod_rewrite rule. */
export function redirectRule(r) {
  const code = r.permanent ? 301 : 302;
  if (r.source.includes(':path*')) {
    const prefix = escapeRegex(r.source.replace(/\/:path\*$/, '').replace(/^\//, ''));
    return `  RewriteRule ^${prefix}(/.*)?$ ${r.destination} [R=${code},L]`;
  }
  const page = escapeRegex(r.source.replace(/^\//, ''));
  return `  RewriteRule ^${page}/?$ ${r.destination} [R=${code},L]`;
}

export function htaccessText(redirects) {
  const rules = redirects.map(redirectRule).join('\n');
  return `# Lime Signalworks — Apache rules for GoDaddy cPanel (Web Hosting Deluxe).
# Path redirects are generated from vercel.json. Do not hand-edit the rule list;
# change vercel.json and run \`npm run build\` (or node scripts/write-htaccess.mjs).

DirectoryIndex index.html
Options -Indexes
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Apex → https://www in one hop (Vercel uses 308 for this).
  RewriteCond %{HTTP_HOST} ^${HOST_RE}$ [NC]
  RewriteRule ^ https://${WWW}%{REQUEST_URI} [R=308,L]

  # HTTP on www (or any other host) → HTTPS on the same host.
  RewriteCond %{HTTPS} !=on
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

  # Old paths, matching vercel.json (301 unless marked otherwise).
  # /data/harbor/* is a 302 to /harbor-now/, and must sit above the /data/ block.
${rules}

  # If the whole repo is uploaded by mistake, do not serve source or internals.
  RewriteRule ^(data|src|tests|scripts|node_modules)(/|$) - [F,L]
  RewriteRule ^(package(-lock)?\\.json|vercel\\.json|README\\.md|CNAME|\\.gitignore)$ - [F,L]
  RewriteRule ^\\.git - [F,L]
</IfModule>
`;
}

export async function writeHtaccess(destDir, repoDir = destDir) {
  const raw = await readFile(path.join(repoDir, 'vercel.json'), 'utf8');
  const { redirects = [] } = JSON.parse(raw);
  const text = htaccessText(redirects);
  const dest = path.join(destDir, '.htaccess');
  await writeFile(dest, text, 'utf8');
  return { dest, redirects: redirects.length, text };
}
