// Replaces the previous app shell without reading or deleting any care database.
const CACHE = "careloop-instructor-resolver-1";
const FILES = ["/", "/style.css", "/app.js", "/scheduler.js"];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          key !== CACHE &&
          (key.startsWith("careloop-shell-") ||
            key.startsWith("careloop-instructor-resolver-"))
        )
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !FILES.includes(url.pathname) ||
    url.search
  )
    return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(url.pathname)),
  );
});
