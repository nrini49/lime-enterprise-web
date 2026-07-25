# Lime Signalworks — Enterprise Site 2

Static content-integration preview for the Site 2 enterprise surface. Root route `/` only.

This repository is **not** Site 1 (`lime-web`). Nothing here deploys to or reads from Site 1.

## Status of this surface

Content integration preview. It renders two reviewed content sets — nine operating roles and a
twenty-record principles library — with sourced attribution. It is not a marketing site, does not
describe a product, and makes no claim about readiness, performance, security, or customers.

## Stack

Zero-framework static build. No bundler, no CSS preprocessor, no client framework.

- `data/operating-roles.json` — 9 role records (source of truth)
- `data/principles.json` — 7 themes + 20 principle records A1–A20 (source of truth)
- `src/template.html` — page skeleton with `{{TOKEN}}` placeholders
- `src/render.mjs` — build script: JSON + template → `index.html`, inlines Lucide SVG icons
- `assets/css/fonts.css` — `@font-face` rules for the three self-hosted OFL 1.1 families
- `assets/fonts/` — vendored woff2 subsets plus the OFL licence text for each family
- `assets/css/base.css` — shared reset, focus-visible, reduced-motion, `.sr-only`
- `assets/css/site.css` — "Harbor Station" design tokens and all component styles
- `assets/js/app.js` — theme toggle + library filtering only (progressive enhancement)
- `tests/content-invariants.test.mjs` — `node:test` + cheerio content and invariant checks
- `scripts/serve.mjs` — local static server
- `scripts/fetch-fonts.mjs` — one-off vendoring helper; regenerates `assets/fonts/` (never run by the site)
- `index.html` — **generated artifact**, committed so the site works with no build step

## Commands

```bash
npm install          # cheerio + lucide-static (dev only; no runtime deps)
npm run build        # regenerate index.html from data/ + src/
npm test             # build, then run the invariant test suite (17 checks)
npm run serve        # serve the repo root on http://localhost:4173
```

## Conventions for incremental edits

1. **Never hand-edit `index.html`.** Edit `data/*.json` or `src/template.html`, then `npm run build`.
   The build throws if a template token is left unreplaced or a record references an unknown theme.
2. **Content changes start in the reviewed source documents**, not here. Quote wording, attribution,
   year, and source URL must match the reviewed library exactly. `npm test` asserts exact wording for
   spot-checked records and rejects fragments from non-approved quote sets.
3. **Add a test with every content rule.** `tests/content-invariants.test.mjs` is the enforcement
   surface: record counts, id uniqueness, forbidden vocabulary, commercial-copy bans, quote/CTA
   separation, and accessibility scaffolding are all asserted there.
4. **No rotation, carousel, or timed content.** The full library ships in static HTML; JavaScript may
   only narrow what is already present. The page must remain complete and readable with JS disabled.
5. **Design tokens live in `assets/css/site.css`.** Use existing tokens; do not introduce raw hex
   values in component rules. Both light and dark palettes must stay WCAG-AA for body text.
6. **No network egress.** The page must never reference a third-party host for fonts, styles,
   scripts, or images. Only source-attribution anchors may point off-origin, and only on click.
   Fonts are Archivo (display), Inter (body), and JetBrains Mono (labels), all SIL OFL 1.1 and
   vendored into `assets/fonts/` with their licence files. `npm test` enforces this.

## Invariants (do not break)

- Secular enterprise vocabulary only. No religious framing, no predecessor names or lineage language,
  in rendered content **or** metadata.
- No portrait or likeness imagery of any real person. Abstract role symbols only. There are no
  `<img>` elements in the page.
- No endorsement, customer, performance, readiness, certification, or broker claims.
- Quotes stay visually and structurally separated from any call to action, price, or metric, and the
  standing "attribution is not endorsement" notice must remain on the page.
- Exactly 9 role records and exactly 20 principle records (A1–A20). No additions from other sets.
- Role labels stay in plain occupational English (Systems Steward, Strategist, Communicator,
  Reflective Practitioner, Signal Analyst, Advocate, Long-Horizon Steward, Morale Builder, Early
  Warning Sentinel). The retired ecclesiastical register is in the forbidden-term test list.
- No contact form, no transactional CTA. A single non-transactional in-page anchor is the only CTA.

## Accessibility baseline

Semantic landmarks, skip link, single `h1`, labelled controls, `aria-pressed` filter chips, visible
`:focus-visible` outlines, ≥44px interactive targets, no horizontal scroll at 375px, honoured
`prefers-reduced-motion`, and WCAG-AA contrast for all rendered text in both themes.
