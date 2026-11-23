#!/usr/bin/env node
/**
 * Build the site and pack only the public files into a zip meant for GoDaddy
 * public_html. Does not upload, change DNS, or touch Vercel.
 *
 *   npm run package:godaddy
 *   node scripts/package-godaddy.mjs [path/to/output.zip]
 *
 * The zip has index.html, 404.html, and .htaccess at its root, so unzip it
 * into public_html (after backing up the placeholder index). It does not
 * include /preview/evidence/, source, tests, data, or node_modules.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const defaultZip = path.join(outDir, 'limesignalworks-public_html.zip');
const zipPath = path.resolve(process.argv[2] || defaultZip);

function run(command, args) {
  const res = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

run(process.execPath, [path.join(root, 'src', 'render.mjs')]);
run(process.execPath, [path.join(root, 'scripts', 'write-htaccess.mjs')]);
run(process.execPath, [path.join(root, 'scripts', 'export-static.mjs')]);

if (!existsSync(path.join(outDir, 'index.html')) || !existsSync(path.join(outDir, '.htaccess'))) {
  console.error('export did not produce index.html and .htaccess in dist/');
  process.exit(1);
}

await mkdir(path.dirname(zipPath), { recursive: true });
await rm(zipPath, { force: true });

const py = `
import hashlib, os, sys, zipfile
src, dest = sys.argv[1], sys.argv[2]
files = []
for dirpath, dirnames, filenames in os.walk(src):
    dirnames[:] = sorted(d for d in dirnames if d not in {'.', '..'})
    for name in filenames:
        if name.endswith('.zip'):
            continue
        full = os.path.join(dirpath, name)
        rel = os.path.relpath(full, src).replace(os.sep, '/')
        files.append((rel, full))
files.sort()
with zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for rel, full in files:
        # Paths are relative to the zip root (public_html), including .htaccess.
        zf.write(full, arcname=rel)
print(len(files), os.path.getsize(dest), hashlib.sha256(open(dest, 'rb').read()).hexdigest())
`;

const zipped = spawnSync('python3', ['-c', py, outDir, zipPath], { encoding: 'utf8' });
if (zipped.status !== 0) {
  process.stderr.write(zipped.stderr || zipped.stdout || 'python3 zip failed\n');
  process.exit(zipped.status ?? 1);
}
const [count, size, sha] = (zipped.stdout || '').trim().split(/\s+/);
console.log(`packed ${count} files into ${zipPath} (${size} bytes, sha256 ${sha})`);
