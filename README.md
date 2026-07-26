# Lime Signalworks — LIME Enterprise (Site 2)

Static enterprise homepage for the LIME Enterprise surface. Root route `/` only, single page with
anchor navigation.

This repository is **not** Site 1 (`lime-web-public`, `limesignalworks.com`). Nothing here deploys
to, reads from, or links into Site 1 beyond the single approved reciprocal link.

## What this surface is

A plain-language enterprise translation of what Site 1 offers, in the same informational order:
what Lime Signalworks does, the daily market situation report, what is and is not committed to,
the positioning, the free 33-day evaluation, who it is for, where to start, planned pricing, the
SPY Pipeline eligibility boundary, and how to begin.

It describes the offer honestly and nothing more. Signup, checkout, SPY eligibility verification,
and affiliate tracking are **not built**, and the page says so rather than rendering controls that
would not work. There are no forms, no email or phone capture, and no purchase buttons.

## Stack

Zero-framework static build. No bundler, no CSS preprocessor, no client framework.

- `data/homepage.json` — **source of truth**: canonical strings, section order, market-report
  example, planned pricing, start cards
- `src/template.html` — page skeleton with `{{TOKEN}}` placeholders
- `src/render.mjs` — build script: JSON + template → `index.html`
- `assets/css/fonts.css` — `@font-face` rules for the three self-hosted OFL 1.1 families
- `assets/fonts/` — vendored woff2 subsets plus the OFL licence text for each family
- `assets/css/base.css` — shared reset, focus-visible, reduced-motion, `.sr-only`
- `assets/css/site.css` — light enterprise design tokens and all component styles
- `assets/js/app.js` — the theme toggle, and nothing else
- `tests/content-invariants.test.mjs` — `node:test` + cheerio content and structure checks
- `tests/theme-rendering.test.mjs` — Playwright checks for painted palette, overflow, keyboard
  order, reduced motion, and the no-JavaScript state
- `scripts/serve.mjs` — local static server
- `scripts/fetch-fonts.mjs` — one-off vendoring helper; regenerates `assets/fonts/` (never run by
  the site)
- `index.html` — **generated artifact**, committed so the site works with no build step

`data/operating-roles.json` and `data/principles.json` are retained source from the earlier
content-integration preview. They are deliberately **not rendered** on this homepage, and a test
asserts that none of their content reaches the page.

## Commands

```bash
npm install          # cheerio, playwright (dev only; no runtime deps)
npm run build        # regenerate index.html from data/homepage.json + src/template.html
npm test             # build, then run both suites
npm run serve        # serve the repo root on http://localhost:4173
```

## Conventions for incremental edits

1. **Never hand-edit `index.html`.** Edit `data/homepage.json` or `src/template.html`, then
   `npm run build`. The build throws on an unreplaced token, on section-order drift against the
   data file, on a duplicate element id, and on an in-page anchor with no target.
2. **Canonical strings live in `data/homepage.json`.** The demo CTA label, its disclosure, the
   securities disclaimer, the reciprocal-link label, and the evaluation length are asserted
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
- **Exactly one demo call to action**, labelled "Open the Rosie Server Demo", pointing at
  `https://limesignalworks.pplx.app/`, with its disclosure rendered as the immediately following
  static element — never a tooltip, toast, modal, or collapsed content.
- **Six static pre-click facts accompany that call to action**: the five-fact disclosure
  (demonstration environment, simulated data, no broker connection, no real orders, not
  production-ready) and the access precondition, "Perplexity sign-in may be required." Access is
  controlled by the destination's host, so the page must never describe the demo as open,
  anonymous, or certain to work, and must not call it the only route that works.
- **Exactly one reciprocal link**, labelled "LIME Leadership", pointing at
  `https://limesignalworks.com`. Those two URLs are the only off-origin destinations on the page.
- The evaluation is stated as **33 days, demo and paper mode only**, with no live capital and no
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
