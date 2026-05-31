# mloop — SEO Launch & Findability Notes

_Date: 2026-05-31 · Domain: https://mloop.mpump.live_

mloop is a browser loop station / MPC-style sampler, companion to mpump. This
applies the same SEO treatment used on mdrone and mpump, and **takes the site
public** (it was previously blocking all crawlers as pre-release).

## What shipped (v1.1.0, 2026-05-31)

**Launch:**
- `robots.txt` was `User-agent: * / Disallow: /` (blocked everyone). Now **open to
  search engines**, AI-training crawlers blocked (GPTBot, ClaudeBot, CCBot,
  PerplexityBot, etc.), and it advertises the new sitemap. mloop.mpump.live is now
  indexable.

**Architecture (same as mdrone/mpump):**
- **De-cloaked the router** (`scripts/post-build.cjs`): the root stub now forwards
  *every* visitor — humans and crawlers alike — to `app.html`, preserving the share
  payload (`search`+`hash`). No referrer sniffing (the previous search→landing.html
  / else→app.html branch was cloaking).
- **Canonicals consolidated**: root stub canonical → `https://mloop.mpump.live/`
  (was `landing.html`); app shell (`index.html`→`app.html`) now has a canonical →
  `/`; `landing.html` gained a **self-canonical + `robots` meta** (it had neither).
- **Added `sitemap.xml`** (didn't exist): lists `/` and `/landing.html`.

**On-page:**
- `landing.html` `<title>` is now keyword-led ("Browser Loop Station & MPC Sampler —
  Online & Free | mloop"); description sharpened around "loop station" / "MPC-style
  sampler" / "slice" / "sequence". Brand hero H1 ("Sample. Loop. Now.") kept.

## Still manual (do after deploy)
- **Google Search Console / Bing**: verify `mloop.mpump.live`, submit the sitemap,
  Request Indexing for `/` and `/landing.html` (important — the domain was blocked
  until now, so it has zero index presence to build on).
- **Off-page authority** (the real lever, as the mpump audit established): Show HN,
  r/loops, r/WeAreTheMusicMakers, r/edmproduction, web-audio roundups, GitHub repo
  topics. Cross-link from mpump.live (sibling) once mloop is public.

## Keyword targets
**Primary:** `browser loop station`, `online loop station`, `MPC sampler browser`,
`browser sampler`
**Long-tail:** `online looper free`, `record loops in browser`, `MPC-style pads web`,
`slice samples online`, `loop station no install`
**Brand:** `mloop`
