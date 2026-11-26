# Lime Signalworks — LIME Enterprise (Site 2)

Static site for limesignalworks.com, in four pages (split from the single homepage on
2026-11-22) that share one masthead menu:

| Page | URL | File | Built from |
| --- | --- | --- | --- |
| Home | `/` | `index.html` | `src/template.html` sections where `page` is `home` |
| How Rosie Works | `/how-rosie-works/` | `how-rosie-works/index.html` | sections where `page` is `how-rosie-works` |
| Harbor Now | `/harbor-now/` | `harbor-now/index.html` (+ dated editions) | `src/harbor.mjs`, plus sections where `page` is `harbor` and the blog strip |
| Blog | `/blog/` | `blog/index.html` | `data/blog.json` (empty until the first real post) |
| Privacy Policy | `/privacy/` | `privacy/index.html` | `data/legal.json` (not in the main menu; linked from the footer) |
| Terms of Use | `/terms/` | `terms/index.html` | `data/legal.json` (not in the main menu; linked from the footer) |

`data/homepage.json` lists the pages (`pages`) and places every section on one of them
(`sectionOrder[].page`). `src/template.html` still holds each section's markup exactly once;
`src/render.mjs` places it on its page and turns a link to a section on another page into a
page link. The output is plain HTML/CSS/assets with root-relative links: `npm run export`
copies the files to upload into `dist/` (with an `.htaccess` that repeats `vercel.json`'s
redirects for Apache hosts, plus HTTPS, the apex-to-www redirect, a branded 404, and
blocks for source folders). `npm run package:godaddy` builds that set into a zip for
GoDaddy `public_html`. Neither command uploads anything.

This repository is **not** Site 1 (`lime-web-public`, `limesignalworks.com`). Nothing here deploys
to, reads from, or links into Site 1; the sister-site link buttons were removed.

## Blog comments (2026-11-24)

Posts shown in full on `/blog/` take reader comments. A commenter types a name and a comment
(no account, no email). Their browser keeps a private edit key, so they can edit (marked
"edited") or delete their own comment later from that browser.

- `assets/js/comments.js` builds the list and the form, and only when `/comments-api/` answers,
  so the Vercel preview (no PHP; `.vercelignore` leaves the folder out) shows a short note instead.
- `comments-api/index.php` is the whole backend: PHP 7.0+, no database. Comments are a JSON file
  in a private folder beside `public_html` (`~/lime-comments-data/`, created on first use), or, if
  that cannot be created, `comments-api/data/`, which its `.htaccess` refuses to serve.
- Spam: hidden trap field, a 3-second minimum, 5 per 10 minutes and 20 per day per visitor (a
  keyed hash of the IP, kept at most a day), 300 per day site-wide, length and link limits,
  duplicates refused. Text only; nothing is rendered as HTML.
- Moderation: `/blog/moderate/` (unlisted, noindex). The first visit asks the owner to create
  the moderator password (stored hashed; no default). Then hide, show again, or delete any
  comment. To reset the password, delete `lime-comments-data/moderator.json` in cPanel.
- `comments-api/posts.json` is generated from `data/blog.json` by the build.
- Tests: `tests/blog-comments.test.mjs` (the API part runs PHP's built-in server; skipped without php).

## What this surface is

A plain-language enterprise translation of what Site 1 offers, in the same informational order:
what Lime Signalworks does, the daily market situation report, what is and is not committed to,
the positioning, the free one-month evaluation, who it is for, where to start, planned pricing, the
SPY Pipeline eligibility boundary, and how to begin.

It describes the offer honestly and nothing more. Signup, checkout, SPY eligibility verification,
and affiliate tracking are **not built**, and the page says so rather than rendering controls that
would not work. There are no forms, no email or phone capture, and no purchase buttons.

## Stack

Zero-framework static build. No bundler, no CSS preprocessor, no client framework.

- `data/homepage.json` — **source of truth**: canonical strings, section order, market-report
  example, planned pricing, start cards
- `src/template.html` — page skeleton with `{{TOKEN}}` placeholders
- `src/render.mjs` — build script: JSON + template → the four pages and `404.html` (see the table above)
- `src/site.mjs` — the shared page menu, brand link and Harbor Now "Latest from the blog" strip
- `data/blog.json` — blog posts, newest first; empty until a real post exists
- `scripts/export-static.mjs` — `npm run export`: copies the uploadable site into `dist/`
- `scripts/htaccess.mjs` / `scripts/write-htaccess.mjs` — generate `.htaccess` from `vercel.json`
- `scripts/package-godaddy.mjs` — `npm run package:godaddy`: build, export, and zip for `public_html`
- `404.html` — **generated artifact**, branded not-found page, same shell as the other pages
- `.htaccess` — **generated artifact**, Apache rules for GoDaddy; do not hand-edit
- `assets/css/fonts.css` — `@font-face` rules for the three self-hosted OFL 1.1 families
- `assets/fonts/` — vendored woff2 subsets plus the OFL licence text for each family
- `assets/css/base.css` — shared reset, focus-visible, reduced-motion, `.sr-only`
- `assets/css/site.css` — light enterprise design tokens and all component styles
- `assets/js/app.js` — the theme toggle, the header lighthouse loop, and the narrow-screen masthead menu
- `tests/content-invariants.test.mjs` — `node:test` + cheerio content and structure checks
- `tests/theme-rendering.test.mjs` — Playwright checks for painted palette, overflow, keyboard
  order, reduced motion, and the no-JavaScript state
- `scripts/serve.mjs` — local static server
- `scripts/fetch-fonts.mjs` — one-off vendoring helper; regenerates `assets/fonts/` (never run by
  the site)
- `index.html` — **generated artifact**, committed so the site works with no build step
- `rosie-demo-schwab/` — the public Rosie demo linked from the site since 2026-11-22 (Schwab first):
  a static, script-free snapshot of the Rosie Schwab dashboard (nrini49/schwab main d7e8633) with
  invented **sample data**, built by the same method as `rosie-demo/`; checked by
  `tests/rosie-demo-schwab.test.mjs`. The IB demo below stays in place, unlinked.
- `rosie-demo/` — the earlier public Rosie demo (IB): a static, script-free snapshot of the current Rosie IB
  Operator Workstation layout filled with **sample data** (paper account, invented numbers). Every
  control is disabled, there are no forms or network calls, and `tests/rosie-demo.test.mjs`
  enforces that, the sample-data banner, `noindex`, and broker-held (never trailing) stops.
  `assets/img/rosie-schwab-dashboard-preview.png` (Home hero and How Rosie Works) is a 1200×750 screenshot of
  the Rosie Schwab dashboard (nrini49/schwab main d7e8633, render_page.py) rendered offline with invented sample
  data and a sample-data banner: no broker, no account, no network (2026-11-22, owner: early pages show Schwab).

- `data/harbor/<date>.data.json` — Harbor Now editions, copied **unchanged** from
  `lime-web-public/harbor-now/archive/` (47 editions, 2026-07-13 to 2026-09-29)
- `src/harbor.mjs` — called by `src/render.mjs`; renders `harbor-now/index.html` (latest edition +
  archive) and `harbor-now/<date>/index.html`. Public pages are built from an **allowlist** of
  fields; account/broker/mission/checklist material is dropped here (see `DROPPED_FIELDS`), never
  by editing the source JSON. Every page carries the educational-commentary notice; freshness is checked in the
  browser (see "Freshness" below), because a static page is not rebuilt when publishing stops. `vercel.json` redirects `/data/harbor/*` so the unfiltered source is not served here.
- `data/harbor-voice/<date>.json` — the voice layer for Harbor Now. `"rewrites"` maps exact source
  text to the descriptive, first-person wording that renders (no advice: no "protect first", "size
  down", "wait", "no chase", "discipline first"); `"descriptive"` lists text that contains a
  watched word but only describes the market ("SPY holds near flat"). The build **fails** and names
  the string when an edition has directive-looking text (protect, size, wait, avoid, reduce, review,
  chase, stay, hold, trim, buy, sell, add, keep, let, treat, …) with no entry, when advice wording
  would render, or when a voice entry no longer matches its edition. Add the rewrite, then rebuild.
- `harbor-now/` — **generated artifact**, committed like `index.html`
- **Daily editions (2026-11-25).** `.github/workflows/harbor-daily.yml` runs weekdays at 5:30 PM
  New York time (two crons for EST/EDT), skips NYSE holidays (`data/market-calendar.json`, copied
  from Rosie's `market_calendar.py`), and runs `scripts/harbor-daily.mjs`: closes from
  `scripts/harbor-data.mjs` (Tiingo when `TIINGO_API_TOKEN` is set, else Yahoo Finance chart data;
  VIX from Yahoo), sentences from the fixed Rosie templates in `src/harbor-compose.mjs`, symbols
  from `data/harbor-config.json` (Rosie's Watchlist I named, Watchlist II as a group only, the
  four index funds as context, no news, no XRP). `data_level` is `words` (no numbers) until the
  lawyer clears `pct` (rounded % changes); prices are never published. A live run builds, runs
  the Harbor tests (the voice gates are the advice filter), commits, and uploads **only**
  `harbor-now/` over FTPS with the `HARBOR_FTP_*` secrets (skipped cleanly when unset).
  **Dry run is the default**: nothing is committed or uploaded until the repository variable
  `HARBOR_DRY_RUN` is `false`. Try it locally: `node scripts/harbor-daily.mjs --dry-run
  [--date=YYYY-MM-DD] [--data-level=pct]`.
- **Three-way convergence.** Each daily edition leads with whether my three lights line up: (1) the
  tide, the four index funds above rising trend lines; (2) the hot sector, the strongest of the 11
  SPDR sector funds plus SMH against SPY (`data/sector-members.json`, copied from Rosie's
  `lime_sniper_sector_members.json`), rising with the tide or against it (a crosscurrent); (3) the
  strongest rising names inside it, Watchlist I first, then the sector's top holdings. This is the
  daily-close, public-data form of Lime Sniper's "all three rising" filter and sector funnel;
  spans and thresholds stay in code and are never printed. Add `--cache=FILE` to reuse fetched
  closes while testing.
- **Opening bullets (2026-11-26).** Daily editions open with four short bullets (line-up verdict,
  tide, hot sector, top names) instead of a paragraph; each image's short meaning sits in brackets
  the first time it appears. Editions 2026-09-30 to 2026-11-25 were backfilled through the same
  generator and voice gates from Yahoo end-of-day closes.
- **Metaphor glossary.** `data/harbor-glossary.json` maps each image (tide, weather, wind, hot
  sector, crosscurrent, headwind, anchorage…) to one plain meaning and one technical term. Editions
  bracket the plain meaning the first time an image appears, and every page renders the fixed
  "How to read Harbor Now" key (`#how-to-read`) from the same file. The build runs the voice gates
  over the glossary too.
- Freshness: `harbor-now/fresh.js` (generated from `src/harbor-calendar.mjs`) fills a hidden note
  in the browser: soft at 1–2 missed trading days, clear at 3+. Until the first daily edition, a
  calm "Daily editions resume soon" line shows instead.
- `tests/harbor-now.test.mjs`, `tests/harbor-rendered.test.mjs` — Harbor Now build, notice,
  dropped-field, link and overflow checks

`data/operating-roles.json` and `data/principles.json` are retained source from the earlier
content-integration preview. They are deliberately **not rendered** on this homepage, and a test
asserts that none of their content reaches the page.

## Commands

```bash
npm install          # cheerio, playwright (dev only; no runtime deps)
npm run build           # regenerate the four pages, 404.html, and .htaccess
npm test                # build, then run every suite in tests/
npm run export          # copy the uploadable static site into dist/
npm run package:godaddy # build, export, and zip dist/limesignalworks-public_html.zip
npm run serve           # serve the repo root on http://localhost:4173
```

## Conventions for incremental edits

1. **Never hand-edit `index.html`, `404.html`, or `.htaccess`.** Edit `data/homepage.json` or `src/template.html`, then
   `npm run build`. The build throws on an unreplaced token, on section-order drift against the
   data file, on a duplicate element id, and on an in-page anchor with no target.
2. **Canonical strings live in `data/homepage.json`.** The demo CTA label, its disclosure, the
   securities disclaimer, and the evaluation length are asserted
   character-for-character by the tests. Change them in the data file, never in the template.
3. **Add a test with every content rule.** The two suites are the enforcement surface: section
   order, forbidden vocabulary, non-translatable claims, commercial-copy bans, the adjacency of the
   demo disclosure, the pricing and SPY boundaries, and accessibility scaffolding.
4. **No inert control may ship.** Every anchor resolves and every button acts. If a capability is
   not built, state that in prose instead of rendering a control for it.
5. **Design tokens live in `assets/css/site.css`.** Use existing tokens; do not introduce raw hex
   values in component rules. Both palettes must stay WCAG-AA for body text.
6. **No network egress.** The page must never reference a third-party host for fonts, styles,
   scripts, or images. Only the two approved off-origin anchors may point off-site, and only on
   click. Fonts are Archivo (display), Inter (body), and JetBrains Mono (labels), all SIL OFL 1.1
   and vendored into `assets/fonts/` with their licence files. `npm test` enforces this.

## Invariants (do not break)

- **Light is the default palette**, including when the operating system prefers dark and when
  JavaScript is disabled. `data-theme="light"` ships in the markup, `<meta name="color-scheme">`
  declares light, and no `prefers-color-scheme: dark` rule exists. The dark toggle is optional,
  fully functional, and never persisted to any browser storage.
- **Exactly one demo call to action**, labelled "Open the Rosie demo", pointing at the static
  sample-data demo `/rosie-demo-schwab/` on this site (the IB `/rosie-demo/` until 2026-11-22), with its labelling rendered as the immediately
  following static element (never a tooltip, toast, modal, or collapsed content): sample data,
  a paper (practice) account, no broker connection, no real orders, not advice. The hosted demo
  and its sign-in line were retired from the home page on 2026-10-28; the full demo is offered on
  request ("just ask") through the existing contact block. The page must never describe a demo
  as open, anonymous, or certain to work.
- **No sister-site links.** The former "Signals" and "LIME Leadership" footer buttons are gone;
  YouTube is the only off-origin destination on the page.
- The evaluation is stated as **one month, demo and paper mode only**, with no live capital and no
  real orders. There is no ninety-day or no-pay claim on this surface.
- Prices ($20 weekly, $85 monthly, $245 quarterly, $925 annually) are labelled **planned
  post-evaluation enrollment options**, with the absence of checkout stated and no purchase control.
- The market report is presented as a **dated worked example** with a freshness caveat. No
  real-time claim appears unnegated, and the section adds no links.
- The SPY Pipeline section states the Interactive Brokers paper-account requirement and that
  verification is unbuilt. It carries **no button and no link**, and no affiliate URL exists anywhere.
- The footer carries the securities disclaimer verbatim, and the one working contact path: the
  already-public Lime Signalworks email, telephone, and office address as real `mailto:` and `tel:`
  anchors, each rendered exactly once, plus "By appointment." Contact is never a form, a capture
  field, or a backend submission.
- **Rosie speaks in her own first person** (queen-with-a-sense-of-humor voice, 2026-10-29) everywhere
  except Noal's credited blocks. Interactive Brokers and Schwab are both presented as working for
  stocks and ETFs; markets that are not live are flagged "Coming" and say "Not live yet", never
  "in development", "beta" or "preview", and the Rosie hero (`#demo`) shows only what is live.
  Nothing may read as advice ("protect first", "size down", "you should").
- Secular enterprise vocabulary only. No religious, scriptural, metaphysical, or Site 1 metaphor
  register in rendered content **or** metadata. `Rosie` is a retained product name.
- No endorsement, customer, current-operation, live-account, production-readiness, performance,
  certification, or superiority claim.
- No `<img>` elements, no forms, no fields of any kind.

## Accessibility baseline

Semantic landmarks, skip link as the first tab stop, single `h1`, no skipped heading levels,
labelled controls, captioned and scoped data tables, visible `:focus-visible` outlines of at least
2px, ≥44px interactive targets, tab order equal to document order, no horizontal scroll at 1920,
1440, 1280, 414, 375 or 320px in either palette, honoured `prefers-reduced-motion`, and WCAG-AA
contrast for all rendered text in both themes.
