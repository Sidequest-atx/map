/* SideQuest ATX service worker.
   Pages come from the network, with an offline fallback. Content-hashed build
   assets (/assets/*) and fonts are cached for good. Everything else (poster,
   car models, icons, manifest) is served from cache but refreshed in the
   background, so a new file reaches returning visitors on their next visit.
   VERSION is stamped with a build id at build time (vite.config.ts), so each
   deploy retires the previous cache. */
const VERSION = "sq-__SW_BUILD_ID__";
const SHELL = ["/", "/app", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Only whole, correctly typed answers are kept: never a 206 slice of a video,
// and never the SPA's index.html answering for a .js file that no longer exists.
function cacheable(req, res) {
  if (!res || res.status !== 200 || res.type === "opaque") return false;
  const type = res.headers.get("content-type") || "";
  if (/\.(m?js|css)$/.test(new URL(req.url).pathname) && type.includes("text/html")) return false;
  return true;
}

function keep(req, res) {
  if (cacheable(req, res)) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  // Never cache Mapbox tiles/API.
  if (url.hostname.endsWith("mapbox.com")) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/app").then((r) => r || caches.match("/"))));
    return;
  }

  // Fonts are self-hosted under /fonts/ (the Google hosts stay listed for
  // pages still open from an older build).
  const fonts = url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com");
  if (url.origin !== location.origin && !fonts) return;

  if (fonts || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
    return;
  }

  // Stale-while-revalidate for fixed-name files.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => keep(req, res))
        .catch(() => hit);
      if (hit) {
        e.waitUntil(fresh);
        return hit;
      }
      return fresh;
    }),
  );
});
