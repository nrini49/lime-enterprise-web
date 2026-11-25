/**
 * Blog comments (2026-11-24, owner t2287u): real comments that the writer can edit or delete
 * afterwards. Static checks always run; the API checks start PHP's built-in server against
 * comments-api/index.php with a throwaway data folder, and are skipped when php is missing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const blog = JSON.parse(read('data/blog.json'));

/* ---------- static: the blog page ---------- */

test('comments: every full post has a comments section with rules and the not-advice notice', () => {
  const $ = cheerio.load(read('blog/index.html'));
  const full = blog.posts.filter((p) => p.body);
  assert.ok(full.length >= 1);
  for (const p of full) {
    const sec = $(`[data-blog-post="${p.id}"] [data-comments="${p.id}"]`);
    assert.equal(sec.length, 1, `${p.id} has a comments section`);
    assert.equal(norm(sec.find('h4').text()), 'Comments');
    assert.match(norm(sec.find('[data-comment-rules]').text()), /^Comment rules: be kind, stay on topic, no ads/);
    assert.match(norm(sec.find('[data-comment-rules]').text()), /never post account numbers, keys or passwords/);
    assert.match(norm(sec.find('[data-comment-notice]').text()), /not personalized investment advice/);
    assert.equal(sec.find('[data-comments-app]').length, 1);
  }
  // The educational, not-advice footer notice is still on the page.
  assert.match(norm($('[data-securities-disclaimer]').text()), /educational tools and analysis, not personalized investment advice/);
  // The served markup has no box: the script builds it only where the PHP endpoint answers.
  assert.equal($('form, input, textarea, select, button').length, 0);
  assert.equal($('script[src="/assets/js/comments.js"]').length, 1, 'the comments script loads');
  assert.match(norm($('.page-head, header, main').first().text() + $('main').text()), /your comments/);
  assert.ok(!/later, your comments/.test($('main').text()), 'the "later" wording is gone');
});

test('comments: only the blog and moderator pages load the comments script', () => {
  for (const rel of ['index.html', 'how-rosie-works/index.html', 'harbor-now/index.html', 'privacy/index.html', 'terms/index.html']) {
    assert.ok(!read(rel).includes('comments.js'), `${rel} does not load comments.js`);
  }
  const $ = cheerio.load(read('blog/moderate/index.html'));
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex, nofollow');
  assert.equal($('[data-comments-moderate]').length, 1);
  assert.equal($('h1').length, 1);
  assert.equal($('script[src="/assets/js/comments.js"]').length, 1);
  assert.ok(!read('blog/index.html').includes('/blog/moderate'), 'the moderator page is not linked from the blog');
});

test('comments: the script shows comments as text, never HTML, and only talks to the site itself', () => {
  const js = read('assets/js/comments.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'no HTML injection paths');
  assert.ok(js.includes("'/comments-api/index.php'"));
  assert.ok(!/https?:\/\//.test(js.replace(/^\s*\*.*$/gm, '')), 'no outside address in code');
  assert.ok(js.includes('edited'), 'an edited marker is shown');
  assert.ok(js.includes("name: 'website'"), 'the hidden spam trap field exists');
});

test('comments: the posts list for the endpoint matches the blog', () => {
  const posts = JSON.parse(read('comments-api/posts.json')).posts;
  assert.deepEqual(posts, blog.posts.filter((p) => p.body).map((p) => p.id));
});

test('comments: the endpoint folder refuses to serve its data', () => {
  assert.match(read('comments-api/.htaccess'), /Require all denied/);
  assert.match(read('comments-api/.htaccess'), /RewriteRule \^\(data\|posts\\\.json\$\|\\\.\) - \[F,L\]/);
  assert.match(read('comments-api/data/.htaccess'), /Require all denied/);
  assert.match(read('.vercelignore'), /^comments-api\/$/m);
});

test('privacy: says what comment data is stored, briefly', () => {
  const $ = cheerio.load(read('privacy/index.html'));
  const t = norm($('main').text());
  assert.match(t, /The only form is the comment box on blog posts/);
  assert.match(t, /name you choose, your comment, and when it was posted or edited/);
  assert.match(t, /No email address is needed/);
  assert.match(t, /for up to a day/);
  assert.match(t, /GoDaddy/);
});

/* ---------- live: the PHP endpoint ---------- */

const hasPhp = spawnSync('php', ['-v']).status === 0;
const PORT = 48731;
const BASE = `http://127.0.0.1:${PORT}/comments-api/index.php`;
let php;
let dataDir;

async function startPhp() {
  dataDir = mkdtempSync(path.join(tmpdir(), 'lime-comments-'));
  php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], {
    env: { ...process.env, LIME_COMMENTS_DATA: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}?action=health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('php did not start');
}

let cookie = '';
async function api(method, params, body, extra = {}) {
  const url = BASE + (params ? `?${new URLSearchParams(params)}` : '');
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra };
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, data: await r.json(), headers: r.headers };
}
const post = (body, extra) => api('POST', null, body, extra);
const POST_ID = 'who-judges-rosies-rules';
const ok = { action: 'create', post: POST_ID, website: '', elapsed: 5000 };

test('api: post, edit and delete your own comment; others cannot', { skip: !hasPhp && 'php not installed' }, async (t) => {
  await startPhp();
  t.after(() => { php.kill(); rmSync(dataDir, { recursive: true, force: true }); });

  const h = await api('GET', { action: 'health' });
  assert.equal(h.data.ok, true);
  assert.equal(h.headers.get('cache-control'), 'no-store');
  assert.equal((await api('GET', { action: 'list', post: 'nope' })).status, 404);
  assert.deepEqual((await api('GET', { action: 'list', post: POST_ID })).data.comments, []);

  // Validation and spam protection.
  assert.equal((await post({ ...ok, name: 'A', body: 'Hello there', website: 'http://spam' })).status, 400, 'honeypot');
  assert.equal((await post({ ...ok, name: 'A', body: 'Hello there', elapsed: 200 })).status, 400, 'too fast');
  assert.equal((await post({ ...ok, name: '', body: 'Hello there' })).status, 400, 'name required');
  assert.equal((await post({ ...ok, name: 'A', body: 'x' })).status, 400, 'too short');
  assert.equal((await post({ ...ok, name: 'A', body: 'y'.repeat(2001) })).status, 400, 'too long');
  assert.equal((await post({ ...ok, name: 'A', body: 'http://a http://b http://c' })).status, 400, 'too many links');
  assert.equal((await post({ ...ok, post: 'nope', name: 'A', body: 'Hello there' })).status, 404, 'unknown post');
  const form = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=create' });
  assert.equal(form.status, 415, 'plain form posts are refused');
  assert.equal((await post({ ...ok, name: 'A', body: 'Hello there' }, { Origin: 'https://evil.example' })).status, 403, 'other sites refused');

  // Post.
  const c = await post({ ...ok, name: '  Pat \u0007 ', body: 'A stop saved me.\r\n\r\n\r\n<script>alert(1)</script>' });
  assert.equal(c.status, 201);
  assert.equal(c.data.comment.name, 'Pat');
  assert.equal(c.data.comment.body, 'A stop saved me.\n\n<script>alert(1)</script>', 'stored as plain text, newlines normalised');
  assert.equal(c.data.comment.edited, null);
  assert.equal(c.data.token.length, 48);
  assert.equal(c.data.comment.key, undefined);
  const id = c.data.comment.id;
  const list1 = (await api('GET', { action: 'list', post: POST_ID })).data.comments;
  assert.equal(list1.length, 1);
  assert.equal(list1[0].key, undefined, 'the edit key hash is never sent');
  assert.equal((await post({ ...ok, name: 'Pat', body: 'A stop saved me.\n\n<script>alert(1)</script>' })).status, 400, 'duplicate refused');

  // Edit: wrong key refused, right key works and marks it edited.
  assert.equal((await post({ action: 'edit', id, token: 'f'.repeat(48), name: 'Pat', body: 'Changed' })).status, 403);
  assert.equal((await post({ action: 'edit', id, token: '', name: 'Pat', body: 'Changed' })).status, 403);
  const e = await post({ action: 'edit', id, token: c.data.token, name: 'Pat K', body: 'A stop saved me on Tuesday.' });
  assert.equal(e.status, 200);
  assert.equal(e.data.comment.body, 'A stop saved me on Tuesday.');
  assert.equal(e.data.comment.name, 'Pat K');
  assert.match(e.data.comment.edited, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const list2 = (await api('GET', { action: 'list', post: POST_ID })).data.comments;
  assert.equal(list2[0].body, 'A stop saved me on Tuesday.');
  assert.ok(list2[0].edited);

  // Delete: wrong key refused, right key removes it.
  assert.equal((await post({ action: 'delete', id, token: 'a'.repeat(48) })).status, 403);
  assert.equal((await post({ action: 'delete', id, token: c.data.token })).status, 200);
  assert.deepEqual((await api('GET', { action: 'list', post: POST_ID })).data.comments, []);
  assert.equal((await post({ action: 'delete', id, token: c.data.token })).status, 404);

  // Rate limit: 5 per 10 minutes from one visitor (one was already used above).
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await post({ ...ok, name: 'R', body: `Rate test ${i}` })).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 429]);

  // Nothing is stored in the repository; the data folder holds no raw IP.
  assert.ok(!existsSync(path.join(root, 'comments-api', 'data', 'comments.json')));
  const files = readdirSync(dataDir);
  assert.ok(files.includes('comments.json') && files.includes('ratelimit.json'));
  assert.ok(!readFileSync(path.join(dataDir, 'ratelimit.json'), 'utf8').includes('127.0.0.1'));
  assert.ok(!readFileSync(path.join(dataDir, 'comments.json'), 'utf8').includes(c.data.token), 'only the key hash is stored');
});

test('api: the moderator can hide, show and delete any comment', { skip: !hasPhp && 'php not installed' }, async (t) => {
  await startPhp();
  cookie = '';
  t.after(() => { php.kill(); rmSync(dataDir, { recursive: true, force: true }); });

  const c = await post({ ...ok, name: 'Lee', body: 'Rules felt tight.' });
  const id = c.data.comment.id;

  let s = await api('GET', { action: 'mod_status' });
  assert.equal(s.data.needsSetup, true);
  assert.equal(s.data.signedIn, false);
  assert.equal((await post({ action: 'mod_list', csrf: 'x' })).status, 401);
  assert.equal((await post({ action: 'mod_hide', id, hidden: true })).status, 401);
  assert.equal((await post({ action: 'mod_login', password: 'whatever12' })).status, 403, 'no password yet');
  assert.equal((await post({ action: 'mod_setup', password: 'short' })).status, 400);
  const setup = await post({ action: 'mod_setup', password: 'correct horse battery' });
  assert.equal(setup.status, 200);
  const csrf = setup.data.csrf;
  assert.ok(csrf);
  assert.ok(!readFileSync(path.join(dataDir, 'moderator.json'), 'utf8').includes('correct horse'), 'password stored hashed');
  assert.equal((await post({ action: 'mod_setup', password: 'another password' })).status, 409, 'cannot be claimed twice');

  assert.equal((await post({ action: 'mod_hide', id, hidden: true, csrf: 'wrong' })).status, 403, 'CSRF token required');
  const all = await post({ action: 'mod_list', csrf });
  assert.equal(all.data.comments.length, 1);
  assert.equal(all.data.comments[0].hidden, false);

  assert.equal((await post({ action: 'mod_hide', id, hidden: true, csrf })).data.comment.hidden, true);
  assert.deepEqual((await api('GET', { action: 'list', post: POST_ID })).data.comments, [], 'hidden from the public');
  assert.equal((await post({ action: 'mod_hide', id, hidden: false, csrf })).data.comment.hidden, false);
  assert.equal((await api('GET', { action: 'list', post: POST_ID })).data.comments.length, 1, 'shown again');
  assert.equal((await post({ action: 'mod_delete', id, csrf })).status, 200);
  assert.deepEqual((await api('GET', { action: 'list', post: POST_ID })).data.comments, []);

  assert.equal((await post({ action: 'mod_logout' })).status, 200);
  assert.equal((await post({ action: 'mod_list', csrf })).status, 401, 'signed out');
  cookie = '';
  s = await api('GET', { action: 'mod_status' });
  assert.equal(s.data.needsSetup, false);
  const login = await post({ action: 'mod_login', password: 'correct horse battery' });
  assert.equal(login.status, 200);
  assert.equal((await post({ action: 'mod_list', csrf: login.data.csrf })).status, 200);

  // Wrong passwords are throttled.
  cookie = '';
  const tries = [];
  for (let i = 0; i < 6; i++) tries.push((await post({ action: 'mod_login', password: `wrong guess ${i}` })).status);
  // The earlier try before any password existed counts too: 5 wrong in 15 minutes, then a wait.
  assert.deepEqual(tries, [403, 403, 403, 403, 429, 429]);
});
