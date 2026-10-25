import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS, sourceAsset, serviceWorker } from "./assets.js";
const staticDirectory = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : null;
export const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end("No care-data uploads.");
    return;
  }
  let route;
  try {
    route = new URL(req.url, "http://localhost").pathname;
  } catch {
    res.writeHead(400);
    res.end("Invalid address.");
    return;
  }
  const file = ASSETS[route];
  if (!file && route !== "/sw.js") {
    res.writeHead(404);
    res.end("Not found.");
    return;
  }
  try {
    const body = staticDirectory
      ? readFileSync(
          path.join(
            staticDirectory,
            route === "/" ? "index.html" : route.slice(1),
          ),
        )
      : route === "/sw.js"
        ? serviceWorker()
        : sourceAsset(route);
    if (route === "/sw.js") res.setHeader("Service-Worker-Allowed", "/");
    res.writeHead(200, {
      "Content-Type":
        route === "/sw.js" ? "text/javascript; charset=utf-8" : file[1],
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(500);
    res.end("App files could not be loaded.");
  }
});
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `CareLoop is running at http://${process.env.HOST || "127.0.0.1"}:${server.address().port}`,
    ),
);
