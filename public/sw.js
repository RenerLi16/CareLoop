// Cache application files only. Records stay in browser storage.
const CACHE = "careloop-release-VERSION";
const FILES = /* ASSET_LIST */ [];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          key !== CACHE &&
          [
            "careloop-release-",
            "careloop-shell-",
            "careloop-instructor-resolver-",
          ].some((prefix) => key.startsWith(prefix))
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
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) return response;
        return (await caches.match(url.pathname)) || response;
      })
      .catch(() => caches.match(url.pathname)),
  );
});
