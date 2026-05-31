#!/usr/bin/env node
/**
 * Post-build script: landing page setup.
 * Rename index.html → app.html and write a thin stub index.html that
 * forwards EVERY visitor (humans and crawlers alike) to app.html,
 * preserving the share payload (search + hash).
 *
 * NOTE: the stub deliberately does NOT branch on referrer. Sending search
 * engines to landing.html while sending everyone else to app.html is
 * cloaking (different content for crawlers vs users) and is against
 * search-engine guidelines. Discoverability relies on landing.html being a
 * standalone, indexed, self-canonical page listed in sitemap.xml instead.
 */
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");

fs.renameSync(path.join(dist, "index.html"), path.join(dist, "app.html"));
fs.writeFileSync(
  path.join(dist, "index.html"),
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>mloop — Browser Loop Station & Sampler</title><meta name="description" content="Browser-based loop station & MPC-style sampler. Record, layer, slice, sequence, perform — no install, no subscription, no account."><meta property="og:type" content="website"><meta property="og:title" content="mloop — Browser Loop Station & Sampler"><meta property="og:description" content="Record, layer, slice, sequence, perform — all in your browser. 16 sample pads, 3 loop tracks, 9 effects, KAOS XY pad. Free, no account needed."><meta property="og:url" content="https://mloop.mpump.live/"><meta property="og:image" content="https://mloop.mpump.live/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="mloop — Browser Loop Station & Sampler"><meta name="twitter:description" content="Record, layer, slice, sequence, perform — all in your browser. Free, no install."><meta name="twitter:image" content="https://mloop.mpump.live/og-image.png"><link rel="canonical" href="https://mloop.mpump.live/"><script>(function(){var s=location.search||"";var h=location.hash||"";location.replace("app.html"+s+h);})();</script></head><body><noscript>mloop — Browser Loop Station &amp; Sampler. <a href="landing.html">About mloop</a> · <a href="app.html">Open mloop</a></noscript></body></html>`
);
console.log("Landing page: redirect stub index.html → app.html (no bot detection)");
