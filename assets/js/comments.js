/**
 * Blog comments (2026-11-24, owner t2287u): real comments on blog posts, which the writer
 * can edit or delete afterwards from the same browser. Talks only to the site's own
 * /comments-api/index.php (PHP on the GoDaddy host). Everything is built here, so a page
 * without this script, or a copy of the site without the PHP endpoint (the Vercel preview),
 * shows no comment box at all — never a box that cannot work.
 *
 * Each post has <section data-comments="post-id">. The moderator page has
 * <section data-comments-moderate>.
 */
(function () {
  'use strict';
  var API = '/comments-api/index.php';
  var KEYS = 'lime-comment-keys';
  var NAME = 'lime-comment-name';

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'className') n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function store(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: edits work this visit only */ }
  }
  var memoryKeys = store(KEYS, {});
  function keyFor(id) { return memoryKeys[String(id)]; }
  function setKey(id, token) { memoryKeys[String(id)] = token; save(KEYS, memoryKeys); }
  function dropKey(id) { delete memoryKeys[String(id)]; save(KEYS, memoryKeys); }

  function call(method, params, body) {
    var url = API + (params ? '?' + new URLSearchParams(params).toString() : '');
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      var type = res.headers.get('Content-Type') || '';
      if (type.indexOf('application/json') !== 0) throw new Error('unavailable');
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          var err = new Error(data.error || 'Something went wrong. Please try again.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  var health = null;
  function available() {
    if (!health) health = call('GET', { action: 'health' }).then(function () { return true; }, function () { return false; });
    return health;
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /** Comment text is shown as text, never HTML. Blank lines become paragraphs. */
  function bodyNodes(text) {
    return text.split(/\n\n+/).map(function (para) {
      var p = el('p', { className: 'comment__text' });
      para.split('\n').forEach(function (line, i) {
        if (i) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
      return p;
    });
  }

  function field(labelText, input, hint) {
    var id = 'c' + Math.random().toString(36).slice(2, 9);
    input.id = id;
    return el('p', { className: 'comment-form__field' }, [
      el('label', { for: id, text: labelText }),
      input,
      hint ? el('span', { className: 'comment-form__hint', text: hint }) : null,
    ]);
  }

  function status(node, message, kind) {
    node.textContent = message || '';
    node.className = 'comment-form__status' + (kind ? ' comment-form__status--' + kind : '');
  }

  /* ---------- a post's comments ---------- */

  function mountPost(section) {
    var post = section.getAttribute('data-comments');
    var list = el('ol', { className: 'comment-list', 'data-comment-list': '' });
    var empty = el('p', { className: 'comment-empty', text: 'No comments yet. Yours can be the first.' });
    var holder = section.querySelector('[data-comments-app]');
    holder.textContent = '';

    function render(c) {
      var mine = !!keyFor(c.id);
      var meta = el('p', { className: 'comment__meta' }, [
        el('strong', { className: 'comment__name', text: c.name }),
        el('span', { text: ' · ' }),
        el('time', { datetime: c.created, text: when(c.created) }),
        c.edited ? el('span', { className: 'comment__edited', 'data-edited': '', title: 'Edited ' + when(c.edited), text: ' · edited' }) : null,
      ]);
      var li = el('li', { className: 'comment', 'data-comment-id': String(c.id) }, [meta].concat(bodyNodes(c.body)));
      if (mine) {
        var editBtn = el('button', { type: 'button', className: 'comment__action', text: 'Edit' });
        var delBtn = el('button', { type: 'button', className: 'comment__action', text: 'Delete' });
        editBtn.addEventListener('click', function () { startEdit(li, c); });
        delBtn.addEventListener('click', function () {
          if (!window.confirm('Delete your comment? This cannot be undone.')) return;
          call('POST', null, { action: 'delete', id: c.id, token: keyFor(c.id) }).then(function () {
            dropKey(c.id);
            li.remove();
            if (!list.children.length) list.replaceWith(empty);
          }, function (e) { window.alert(e.message); });
        });
        li.appendChild(el('p', { className: 'comment__actions' }, [el('span', { className: 'comment__mine', text: 'Your comment' }), editBtn, delBtn]));
      }
      return li;
    }

    function startEdit(li, c) {
      var name = el('input', { type: 'text', maxlength: '40', autocomplete: 'nickname', required: '' });
      name.value = c.name;
      var text = el('textarea', { rows: '5', maxlength: '2000', required: '' });
      text.value = c.body;
      var msg = el('p', { className: 'comment-form__status', role: 'status' });
      var saveBtn = el('button', { type: 'submit', className: 'comment-form__submit', text: 'Save changes' });
      var cancel = el('button', { type: 'button', className: 'comment__action', text: 'Cancel' });
      var form = el('form', { className: 'comment-form comment-form--edit', novalidate: '' }, [
        field('Name shown', name), field('Your comment', text), el('p', { className: 'comment-form__buttons' }, [saveBtn, cancel]), msg,
      ]);
      cancel.addEventListener('click', function () { form.replaceWith(render(c)); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        saveBtn.disabled = true;
        call('POST', null, { action: 'edit', id: c.id, token: keyFor(c.id), name: name.value, body: text.value }).then(function (data) {
          form.replaceWith(render(data.comment));
        }, function (e) { saveBtn.disabled = false; status(msg, e.message, 'error'); });
      });
      li.replaceWith(form);
      text.focus();
    }

    function showList(comments) {
      list.textContent = '';
      comments.forEach(function (c) { list.appendChild(render(c)); });
      var current = holder.querySelector('[data-comment-list], .comment-empty');
      var next = comments.length ? list : empty;
      if (current) current.replaceWith(next); else holder.insertBefore(next, holder.firstChild);
    }

    // The new-comment form.
    var opened = Date.now();
    var nameInput = el('input', { type: 'text', maxlength: '40', autocomplete: 'nickname', required: '', 'data-comment-name': '' });
    nameInput.value = store(NAME, '');
    var bodyInput = el('textarea', { rows: '5', maxlength: '2000', required: '', 'data-comment-body': '' });
    // Hidden from people; bots that fill every field get turned away.
    var trap = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var trapWrap = el('p', { className: 'comment-form__trap', 'aria-hidden': 'true' }, [el('label', { text: 'Leave this empty' }), trap]);
    var submit = el('button', { type: 'submit', className: 'comment-form__submit', text: 'Post comment' });
    var msg = el('p', { className: 'comment-form__status', role: 'status' });
    var form = el('form', { className: 'comment-form', novalidate: '', 'data-comment-form': '' }, [
      el('h4', { className: 'comment-form__title', text: 'Add a comment' }),
      field('Name shown with your comment', nameInput, 'A first name or nickname is fine. No email needed.'),
      field('Your comment', bodyInput, 'Plain text. You can edit or delete it later from this browser.'),
      trapWrap,
      el('p', { className: 'comment-form__buttons' }, [submit]),
      msg,
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!nameInput.value.trim() || bodyInput.value.trim().length < 2) {
        status(msg, 'Please add a name and a comment.', 'error');
        return;
      }
      submit.disabled = true;
      status(msg, 'Posting…');
      call('POST', null, {
        action: 'create', post: post, name: nameInput.value, body: bodyInput.value,
        website: trap.value, elapsed: Date.now() - opened,
      }).then(function (data) {
        setKey(data.comment.id, data.token);
        save(NAME, data.comment.name);
        bodyInput.value = '';
        submit.disabled = false;
        status(msg, 'Posted. You can edit or delete it from this browser.', 'ok');
        load();
      }, function (e) { submit.disabled = false; status(msg, e.message, 'error'); });
    });

    function load() {
      return call('GET', { action: 'list', post: post }).then(function (data) { showList(data.comments); });
    }

    holder.appendChild(empty);
    holder.appendChild(form);
    load().catch(function () {
      holder.textContent = '';
      holder.appendChild(el('p', { className: 'comment-empty', text: 'Comments could not load just now. Please try again later.' }));
    });
  }

  /* ---------- moderator page ---------- */

  function mountModerate(section) {
    var app = section.querySelector('[data-comments-app]');
    var csrf = null;

    function passwordForm(setup) {
      app.textContent = '';
      var pw = el('input', { type: 'password', autocomplete: setup ? 'new-password' : 'current-password', required: '', minlength: '10' });
      var pw2 = setup ? el('input', { type: 'password', autocomplete: 'new-password', required: '', minlength: '10' }) : null;
      var btn = el('button', { type: 'submit', className: 'comment-form__submit', text: setup ? 'Create password' : 'Sign in' });
      var msg = el('p', { className: 'comment-form__status', role: 'status' });
      var form = el('form', { className: 'comment-form', novalidate: '' }, [
        el('h2', { text: setup ? 'Create your moderator password' : 'Moderator sign-in' }),
        setup ? el('p', { text: 'This is the first visit. Choose a password of at least 10 characters. Only its scrambled form is stored.' }) : null,
        field('Password', pw),
        setup ? field('Type it again', pw2) : null,
        el('p', { className: 'comment-form__buttons' }, [btn]),
        msg,
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (setup && pw.value !== pw2.value) { status(msg, 'The two passwords do not match.', 'error'); return; }
        btn.disabled = true;
        call('POST', null, { action: setup ? 'mod_setup' : 'mod_login', password: pw.value }).then(function (d) {
          csrf = d.csrf;
          showAll();
        }, function (e) { btn.disabled = false; status(msg, e.message, 'error'); });
      });
      app.appendChild(form);
      pw.focus();
    }

    function showAll() {
      call('POST', null, { action: 'mod_list', csrf: csrf }).then(function (data) {
        app.textContent = '';
        var out = el('button', { type: 'button', className: 'comment__action', text: 'Sign out' });
        out.addEventListener('click', function () { call('POST', null, { action: 'mod_logout' }).then(start); });
        app.appendChild(el('p', { className: 'comment__actions' }, [el('span', { text: data.comments.length + ' comments, newest first.' }), out]));
        var list = el('ol', { className: 'comment-list' });
        data.comments.forEach(function (c) {
          var hide = el('button', { type: 'button', className: 'comment__action', text: c.hidden ? 'Show again' : 'Hide' });
          var del = el('button', { type: 'button', className: 'comment__action', text: 'Delete' });
          hide.addEventListener('click', function () {
            call('POST', null, { action: 'mod_hide', id: c.id, hidden: !c.hidden, csrf: csrf }).then(showAll, function (e) { window.alert(e.message); });
          });
          del.addEventListener('click', function () {
            if (!window.confirm('Delete this comment for good?')) return;
            call('POST', null, { action: 'mod_delete', id: c.id, csrf: csrf }).then(showAll, function (e) { window.alert(e.message); });
          });
          list.appendChild(el('li', { className: 'comment' + (c.hidden ? ' comment--hidden' : '') }, [
            el('p', { className: 'comment__meta' }, [
              el('strong', { className: 'comment__name', text: c.name }),
              el('span', { text: ' · ' + when(c.created) + (c.edited ? ' · edited' : '') + ' · post: ' + c.post + (c.hidden ? ' · HIDDEN' : '') }),
            ]),
          ].concat(bodyNodes(c.body)).concat([el('p', { className: 'comment__actions' }, [hide, del])])));
        });
        app.appendChild(list);
      }, function (e) { if (e.status === 401 || e.status === 403) start(); else window.alert(e.message); });
    }

    function start() {
      call('GET', { action: 'mod_status' }).then(function (s) {
        if (s.signedIn) { csrf = s.csrf; showAll(); }
        else passwordForm(s.needsSetup);
      }, function () {
        app.textContent = 'Comments are not available on this copy of the site.';
      });
    }
    start();
  }

  function init() {
    var posts = document.querySelectorAll('[data-comments]');
    var mod = document.querySelector('[data-comments-moderate]');
    if (!posts.length && !mod) return;
    available().then(function (ok) {
      if (!ok) {
        Array.prototype.forEach.call(posts, function (s) {
          var holder = s.querySelector('[data-comments-app]');
          holder.textContent = 'Comments open on limesignalworks.com.';
        });
        if (mod) mod.querySelector('[data-comments-app]').textContent = 'Comments are not available on this copy of the site.';
        return;
      }
      Array.prototype.forEach.call(posts, mountPost);
      if (mod) mountModerate(mod);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
