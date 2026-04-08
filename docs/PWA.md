# PWA / Service Worker

mloop is installable as a PWA. Everything needed is already in the repo:

- `public/manifest.json` — app manifest (name, icons, theme color).
- `public/sw.js` — service worker (network-first + versioned cache fallback).
- `index.html` — registers the SW on load, declares `theme-color`, `apple-mobile-web-app-capable`, and the manifest link.

## Cache strategy
`public/sw.js` uses a single versioned cache (`mloop-v5` at time of writing):

- **Install:** pre-caches `index.html`, `manifest.json`, `favicon.svg`.
- **Activate:** deletes stale caches whose name != `CACHE_NAME`.
- **Fetch:**
  - Navigation requests → network first, fall back to cached `index.html`, else `503 Offline`.
  - `recorder-worklet.js` → always network (Firefox cache bug with worklets).
  - `version.json` → always network (update-detection ping), cache fallback.
  - Other same-origin GETs → network first, cache fallback.

## Bumping the cache
When you ship a breaking change (new assets, new worklet shape), bump `CACHE_NAME` in `public/sw.js`. Also bump `public/version.json` so the running tab picks up the update via its in-app version check.

## Testing
```
npm run build && npm run preview
```
Then open DevTools → Application → Service Workers. Verify:
1. `sw.js` is activated.
2. Cache Storage shows `mloop-v5` (or current version).
3. `Offline` checkbox → reload → app still boots from cached `index.html`.

## Parity notes
mpump uses the same network-first + versioned cache shape. Keep this file in sync if the strategies diverge.
