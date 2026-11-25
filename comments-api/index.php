<?php
/**
 * Lime Signalworks blog comments — one small PHP endpoint for GoDaddy cPanel hosting.
 *
 * No database to create, no accounts, no third-party service. Comments are kept in a
 * JSON file in a private folder beside public_html (never served), with a file lock.
 *
 *   GET  index.php?action=health
 *   GET  index.php?action=list&post=<post-id>
 *   POST index.php  {"action":"create","post":..,"name":..,"body":..,"website":"",(honeypot) "elapsed":ms}
 *   POST index.php  {"action":"edit","id":..,"token":..,"name":..,"body":..}
 *   POST index.php  {"action":"delete","id":..,"token":..}
 *   Moderator (session cookie + CSRF token):
 *   GET  index.php?action=mod_status
 *   POST {"action":"mod_setup","password":..}   first open only: create the moderator password
 *   POST {"action":"mod_login","password":..} / {"action":"mod_logout"}
 *   POST {"action":"mod_list"} / {"action":"mod_hide","id":..,"hidden":true|false} / {"action":"mod_delete","id":..}
 *
 * A commenter's browser keeps a random edit key for each comment it posted; only the
 * key's SHA-256 is stored. Editing or deleting needs that key. PHP 7.0 or newer.
 */

const LC_NAME_MAX = 40;
const LC_BODY_MIN = 2;
const LC_BODY_MAX = 2000;
const LC_MAX_LINKS = 2;
const LC_MIN_ELAPSED_MS = 3000;          // a person takes longer than this to write a comment
const LC_RATE_SHORT = array(5, 600);     // at most 5 comments per 10 minutes per visitor
const LC_RATE_DAY = array(20, 86400);    // and 20 per day per visitor
const LC_GLOBAL_DAY = 300;               // and 300 per day for the whole site
const LC_LOGIN_FAILS = array(5, 900);    // 5 wrong moderator passwords per 15 minutes per visitor
const LC_PASSWORD_MIN = 10;

/* ---------------- storage ---------------- */

function lc_data_dir() {
    $env = getenv('LIME_COMMENTS_DATA');
    if ($env) {
        if (!is_dir($env)) @mkdir($env, 0700, true);
        return $env;
    }
    // Preferred: a private folder next to public_html (e.g. /home/<user>/lime-comments-data).
    $docroot = isset($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/') : '';
    if ($docroot !== '') {
        $private = dirname($docroot) . '/lime-comments-data';
        if (is_dir($private) || @mkdir($private, 0700, true)) {
            if (is_writable($private)) return $private;
        }
    }
    // Fallback: comments-api/data, which its own .htaccess refuses to serve.
    return __DIR__ . '/data';
}

function lc_storage_kind($dir) {
    return realpath($dir) === realpath(__DIR__ . '/data') ? 'fallback' : 'private';
}

function lc_path($name) {
    return lc_data_dir() . '/' . $name;
}

/** Run $fn with an exclusive lock over the whole store; $fn gets and returns the state. */
function lc_with_store($fn) {
    $dir = lc_data_dir();
    if (!is_dir($dir) || !is_writable($dir)) lc_fail(503, 'Comments are not available right now.');
    $lock = fopen($dir . '/.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) lc_fail(503, 'Comments are busy. Please try again.');
    try {
        $state = lc_read_json('comments.json', array('next_id' => 1, 'comments' => array()));
        $rate = lc_read_json('ratelimit.json', array());
        lc_prune_rate($rate, time());
        $out = $fn($state, $rate);
        lc_write_json('comments.json', $state);
        lc_write_json('ratelimit.json', $rate);
        return $out;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function lc_read_json($name, $default) {
    $file = lc_path($name);
    if (!is_file($file)) return $default;
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : $default;
}

function lc_write_json($name, $data) {
    $file = lc_path($name);
    $tmp = $file . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $file)) {
        lc_fail(503, 'Comments could not be saved. Please try again.');
    }
    @chmod($file, 0600);
}

function lc_secret() {
    $file = lc_path('secret.key');
    if (is_file($file)) {
        $s = trim((string) file_get_contents($file));
        if (strlen($s) >= 32) return $s;
    }
    $s = bin2hex(random_bytes(32));
    file_put_contents($file, $s);
    @chmod($file, 0600);
    return $s;
}

/* ---------------- helpers ---------------- */

function lc_json($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function lc_fail($code, $message) {
    lc_json($code, array('ok' => false, 'error' => $message));
}

function lc_now() {
    return gmdate('Y-m-d\TH:i:s\Z');
}

/** A visitor fingerprint for rate limits only: a keyed hash of the IP, never the IP itself. */
function lc_visitor() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0';
    return substr(hash_hmac('sha256', $ip, lc_secret()), 0, 32);
}

function lc_posts() {
    $file = __DIR__ . '/posts.json';
    $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    return (is_array($data) && isset($data['posts']) && is_array($data['posts'])) ? $data['posts'] : array();
}

function lc_len($s) {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen(utf8_decode($s));
}

/** Plain text only: valid UTF-8, no control characters except newlines, trimmed. */
function lc_clean($s, $multiline) {
    if (!is_string($s)) return '';
    if (!preg_match('//u', $s)) return '';
    $s = str_replace(array("\r\n", "\r"), "\n", $s);
    $s = preg_replace($multiline ? '/[^\P{C}\n]/u' : '/\p{C}/u', '', $s);
    if ($multiline) $s = preg_replace("/\n{3,}/", "\n\n", $s);
    else $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

function lc_check_name($name) {
    $n = lc_len($name);
    if ($n < 1) lc_fail(400, 'Please add a name to show with your comment.');
    if ($n > LC_NAME_MAX) lc_fail(400, 'Please keep the name to ' . LC_NAME_MAX . ' characters or fewer.');
    if (preg_match('~https?://|www\.~i', $name)) lc_fail(400, 'Please leave links out of the name.');
}

function lc_check_body($body) {
    $n = lc_len($body);
    if ($n < LC_BODY_MIN) lc_fail(400, 'Please write a little more.');
    if ($n > LC_BODY_MAX) lc_fail(400, 'Please keep the comment to ' . LC_BODY_MAX . ' characters or fewer.');
    if (preg_match_all('~https?://|www\.~i', $body) > LC_MAX_LINKS) lc_fail(400, 'Please include no more than ' . LC_MAX_LINKS . ' links.');
}

function lc_public($c, $withHidden) {
    $out = array(
        'id' => $c['id'],
        'post' => $c['post'],
        'name' => $c['name'],
        'body' => $c['body'],
        'created' => $c['created'],
        'edited' => isset($c['edited']) ? $c['edited'] : null,
    );
    if ($withHidden) $out['hidden'] = !empty($c['hidden']);
    return $out;
}

function lc_find(&$state, $id) {
    foreach ($state['comments'] as $i => $c) {
        if ((int) $c['id'] === (int) $id) return $i;
    }
    return -1;
}

/** Keep only timestamps still inside the longest window. */
function lc_prune_rate(&$rate, $now) {
    $keep = max(LC_RATE_DAY[1], LC_LOGIN_FAILS[1]);
    foreach ($rate as $k => $times) {
        $times = array_values(array_filter((array) $times, function ($t) use ($now, $keep) { return $t > $now - $keep; }));
        if ($times) $rate[$k] = $times; else unset($rate[$k]);
    }
}

function lc_count_since($times, $since) {
    $n = 0;
    foreach ((array) $times as $t) if ($t > $since) $n++;
    return $n;
}

function lc_input() {
    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) lc_fail(400, 'Bad request.');
    return $data;
}

/** POSTs must be same-site JSON: a cross-site form cannot send this content type without a preflight we never grant. */
function lc_require_same_site_json() {
    $type = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($type, 'application/json') !== 0) lc_fail(415, 'Bad request.');
    if (!empty($_SERVER['HTTP_ORIGIN'])) {
        $host = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
        $self = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) : '';
        if (!$host || strcasecmp($host, $self) !== 0) lc_fail(403, 'Bad request.');
    }
}

/* ---------------- moderator session ---------------- */

function lc_session() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('lime_mod');
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array('lifetime' => 0, 'path' => '/comments-api/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict'));
    } else {
        session_set_cookie_params(0, '/comments-api/; samesite=Strict', '', $secure, true);
    }
    session_start();
}

function lc_is_mod() {
    lc_session();
    return !empty($_SESSION['lime_mod']);
}

function lc_require_mod($in) {
    if (!lc_is_mod()) lc_fail(401, 'Please sign in as the moderator.');
    $csrf = isset($in['csrf']) ? (string) $in['csrf'] : '';
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $csrf)) lc_fail(403, 'Please reload the page and try again.');
}

function lc_mod_hash() {
    $m = lc_read_json('moderator.json', array());
    return isset($m['hash']) ? (string) $m['hash'] : '';
}

function lc_mod_signed_in() {
    lc_session();
    session_regenerate_id(true);
    $_SESSION['lime_mod'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

/* ---------------- routes ---------------- */

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

if ($method === 'GET') {
    $action = isset($_GET['action']) ? (string) $_GET['action'] : '';
    if ($action === 'health') {
        $dir = lc_data_dir();
        $ok = is_dir($dir) && is_writable($dir);
        lc_json($ok ? 200 : 503, array('ok' => $ok, 'storage' => $ok ? lc_storage_kind($dir) : null));
    }
    if ($action === 'list') {
        // Rate-limit codes are kept for at most a day, even when nobody posts for a while.
        $rfile = lc_path('ratelimit.json');
        if (is_file($rfile) && filemtime($rfile) < time() - 3600 && filesize($rfile) > 2) {
            lc_with_store(function (&$state, &$rate) { return null; });
        }
        $post = isset($_GET['post']) ? (string) $_GET['post'] : '';
        if (!in_array($post, lc_posts(), true)) lc_fail(404, 'Unknown post.');
        $state = lc_read_json('comments.json', array('comments' => array()));
        $out = array();
        foreach ($state['comments'] as $c) {
            if ($c['post'] === $post && empty($c['hidden'])) $out[] = lc_public($c, false);
        }
        lc_json(200, array('ok' => true, 'comments' => $out));
    }
    if ($action === 'mod_status') {
        $signed = lc_is_mod();
        lc_json(200, array(
            'ok' => true,
            'needsSetup' => lc_mod_hash() === '',
            'signedIn' => $signed,
            'csrf' => $signed ? $_SESSION['csrf'] : null,
        ));
    }
    lc_fail(404, 'Unknown action.');
}

if ($method !== 'POST') lc_fail(405, 'Bad request.');
lc_require_same_site_json();
$in = lc_input();
$action = isset($in['action']) ? (string) $in['action'] : '';

if ($action === 'create') {
    // Spam checks that need no state: the hidden field must be empty, and it must not be instant.
    if (!empty($in['website'])) lc_fail(400, 'Your comment could not be posted.');
    $elapsed = isset($in['elapsed']) ? (int) $in['elapsed'] : 0;
    if ($elapsed < LC_MIN_ELAPSED_MS) lc_fail(400, 'That was quick. Please wait a moment and post again.');
    $post = isset($in['post']) ? (string) $in['post'] : '';
    if (!in_array($post, lc_posts(), true)) lc_fail(404, 'Unknown post.');
    $name = lc_clean(isset($in['name']) ? $in['name'] : '', false);
    $body = lc_clean(isset($in['body']) ? $in['body'] : '', true);
    lc_check_name($name);
    lc_check_body($body);
    $visitor = lc_visitor();
    $token = bin2hex(random_bytes(24));
    $result = lc_with_store(function (&$state, &$rate) use ($post, $name, $body, $visitor, $token) {
        $now = time();
        lc_prune_rate($rate, $now);
        $mine = isset($rate['c:' . $visitor]) ? $rate['c:' . $visitor] : array();
        $all = isset($rate['all']) ? $rate['all'] : array();
        if (lc_count_since($mine, $now - LC_RATE_SHORT[1]) >= LC_RATE_SHORT[0]
            || lc_count_since($mine, $now - LC_RATE_DAY[1]) >= LC_RATE_DAY[0]) {
            lc_fail(429, 'You have posted several comments in a short time. Please try again later.');
        }
        if (lc_count_since($all, $now - 86400) >= LC_GLOBAL_DAY) {
            lc_fail(429, 'Comments are paused for today. Please try again tomorrow.');
        }
        foreach ($state['comments'] as $c) {
            if ($c['post'] === $post && $c['body'] === $body) lc_fail(400, 'That comment is already posted.');
        }
        $c = array(
            'id' => (int) $state['next_id'],
            'post' => $post,
            'name' => $name,
            'body' => $body,
            'created' => lc_now(),
            'edited' => null,
            'hidden' => false,
            'key' => hash('sha256', $token),
        );
        $state['next_id'] = $c['id'] + 1;
        $state['comments'][] = $c;
        $mine[] = $now;
        $all[] = $now;
        $rate['c:' . $visitor] = $mine;
        $rate['all'] = $all;
        return $c;
    });
    lc_json(201, array('ok' => true, 'comment' => lc_public($result, false), 'token' => $token));
}

if ($action === 'edit' || $action === 'delete') {
    $id = isset($in['id']) ? (int) $in['id'] : 0;
    $token = isset($in['token']) ? (string) $in['token'] : '';
    if ($id < 1 || strlen($token) < 32) lc_fail(403, 'This comment can only be changed from the browser that posted it.');
    $name = $body = null;
    if ($action === 'edit') {
        $name = lc_clean(isset($in['name']) ? $in['name'] : '', false);
        $body = lc_clean(isset($in['body']) ? $in['body'] : '', true);
        lc_check_name($name);
        lc_check_body($body);
    }
    $result = lc_with_store(function (&$state, &$rate) use ($action, $id, $token, $name, $body) {
        $i = lc_find($state, $id);
        if ($i < 0) lc_fail(404, 'That comment is no longer here.');
        if (!hash_equals($state['comments'][$i]['key'], hash('sha256', $token))) {
            lc_fail(403, 'This comment can only be changed from the browser that posted it.');
        }
        if ($action === 'delete') {
            array_splice($state['comments'], $i, 1);
            return null;
        }
        $c = &$state['comments'][$i];
        if ($c['name'] !== $name || $c['body'] !== $body) {
            $c['name'] = $name;
            $c['body'] = $body;
            $c['edited'] = lc_now();
        }
        return $c;
    });
    if ($action === 'delete') lc_json(200, array('ok' => true, 'deleted' => $id));
    lc_json(200, array('ok' => true, 'comment' => lc_public($result, false)));
}

if ($action === 'mod_setup' || $action === 'mod_login') {
    $password = isset($in['password']) ? (string) $in['password'] : '';
    $visitor = lc_visitor();
    // Throttle wrong passwords before checking anything.
    lc_with_store(function (&$state, &$rate) use ($visitor) {
        lc_prune_rate($rate, time());
        $fails = isset($rate['f:' . $visitor]) ? $rate['f:' . $visitor] : array();
        if (lc_count_since($fails, time() - LC_LOGIN_FAILS[1]) >= LC_LOGIN_FAILS[0]) {
            lc_fail(429, 'Too many tries. Please wait 15 minutes.');
        }
    });
    if ($action === 'mod_setup') {
        if (lc_mod_hash() !== '') lc_fail(409, 'The moderator password is already set. Please sign in.');
        if (strlen($password) < LC_PASSWORD_MIN) lc_fail(400, 'Please use at least ' . LC_PASSWORD_MIN . ' characters.');
        $dir = lc_data_dir();
        $lock = fopen($dir . '/.lock', 'c');
        flock($lock, LOCK_EX);
        if (lc_mod_hash() !== '') { flock($lock, LOCK_UN); lc_fail(409, 'The moderator password is already set. Please sign in.'); }
        lc_write_json('moderator.json', array('hash' => password_hash($password, PASSWORD_DEFAULT), 'created' => lc_now()));
        flock($lock, LOCK_UN);
        fclose($lock);
        lc_json(200, array('ok' => true, 'csrf' => lc_mod_signed_in()));
    }
    $hash = lc_mod_hash();
    if ($hash === '' || !password_verify($password, $hash)) {
        lc_with_store(function (&$state, &$rate) use ($visitor) {
            $rate['f:' . $visitor][] = time();
        });
        lc_fail(403, 'That password is not right.');
    }
    lc_json(200, array('ok' => true, 'csrf' => lc_mod_signed_in()));
}

if ($action === 'mod_logout') {
    lc_session();
    $_SESSION = array();
    session_destroy();
    lc_json(200, array('ok' => true));
}

if ($action === 'mod_list') {
    lc_require_mod($in);
    $state = lc_read_json('comments.json', array('comments' => array()));
    $out = array();
    foreach (array_reverse($state['comments']) as $c) $out[] = lc_public($c, true);
    lc_json(200, array('ok' => true, 'comments' => $out));
}

if ($action === 'mod_hide' || $action === 'mod_delete') {
    lc_require_mod($in);
    $id = isset($in['id']) ? (int) $in['id'] : 0;
    $hidden = !empty($in['hidden']);
    $result = lc_with_store(function (&$state, &$rate) use ($action, $id, $hidden) {
        $i = lc_find($state, $id);
        if ($i < 0) lc_fail(404, 'That comment is no longer here.');
        if ($action === 'mod_delete') {
            array_splice($state['comments'], $i, 1);
            return null;
        }
        $state['comments'][$i]['hidden'] = $hidden;
        return $state['comments'][$i];
    });
    if ($action === 'mod_delete') lc_json(200, array('ok' => true, 'deleted' => $id));
    lc_json(200, array('ok' => true, 'comment' => lc_public($result, true)));
}

lc_fail(404, 'Unknown action.');
