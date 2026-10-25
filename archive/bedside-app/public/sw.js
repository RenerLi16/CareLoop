/* SHELL_CACHE and SHELL_ASSETS are supplied by the static build/server. */
self.addEventListener("install", (event) => {
  // Atomic precaching: a failed download must not replace the working app.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(
        SHELL_ASSETS.map(
          (path) => new Request(path, { cache: "reload", credentials: "omit" }),
        ),
      );
    })(),
  );
  // Deliberately do not skipWaiting: open forms keep their existing app version.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("careloop-shell-") && name !== SHELL_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // Never intercept or cache care data, export files, query strings or other origins.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search ||
    !SHELL_ASSETS.includes(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const response = await cache.match(url.pathname);
      return (
        response ||
        new Response(
          "Offline app files are missing. Reconnect and prepare the offline app again. Your care record is separate.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        )
      );
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHELL_STATUS" || !event.ports[0]) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const entries = await Promise.all(
        SHELL_ASSETS.map((path) => cache.match(path)),
      );
      event.ports[0].postMessage({
        ready: entries.every(Boolean),
        version: SHELL_CACHE,
      });
    })(),
  );
});
