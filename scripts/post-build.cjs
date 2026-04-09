#!/usr/bin/env node
/**
 * Post-build script: landing page setup.
 * Rename index.html → app.html and write a stub index.html that redirects
 * search-engine visitors to landing.html and everyone else to app.html.
 * Mirrors mpump's approach.
 */
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");

fs.renameSync(path.join(dist, "index.html"), path.join(dist, "app.html"));
fs.writeFileSync(
  path.join(dist, "index.html"),
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>mloop — Browser Loop Station & Sampler</title><meta name="description" content="Browser-based loop station & MPC-style sampler. Record, layer, slice, sequence, perform — no install, no subscription, no account."><meta property="og:type" content="website"><meta property="og:title" content="mloop — Browser Loop Station & Sampler"><meta property="og:description" content="Record, layer, slice, sequence, perform — all in your browser. 16 sample pads, 3 loop tracks, 9 effects, KAOS XY pad. Free, no account needed."><meta property="og:url" content="https://mloop.mpump.live/"><meta property="og:image" content="https://mloop.mpump.live/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="mloop — Browser Loop Station & Sampler"><meta name="twitter:description" content="Record, layer, slice, sequence, perform — all in your browser. Free, no install."><meta name="twitter:image" content="https://mloop.mpump.live/og-image.png"><link rel="canonical" href="https://mloop.mpump.live/landing.html"><script>(function(){var r=document.referrer||"";var fromSearch=/^https?:\\/\\/([^/]+\\.)?(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|startpage|qwant|kagi)\\./i.test(r);location.replace(fromSearch?"landing.html":"app.html");})();</script></head><body><noscript><a href="landing.html">mloop — Browser Loop Station & Sampler</a></noscript></body></html>`
);
console.log("Landing page: redirect index.html → landing.html (search) / app.html (other)");
