// mloop service worker — network-first with versioned cache fallback.
// The cache version is bumped via the deploy process (version.json check).
const CACHE_NAME = "mloop-v5";

// Files to pre-cache on install
const PRECACHE = ["./index.html", "./manifest.json", "./favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Delete old caches
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Never cache the AudioWorklet file — Firefox has issues with cached worklets
  if (e.request.url.includes("recorder-worklet.js")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Never cache version.json — must always be fresh for update detection
  if (e.request.url.includes("version.json")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Navigation requests — network first, fallback to cached index.html
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html").then((r) => r || new Response("Offline", { status: 503 })))
    );
    return;
  }

  // Asset requests — network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then((r) => r || new Response("Not found", { status: 404 })))
  );
});
