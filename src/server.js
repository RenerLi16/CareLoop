import http from "node:http";
import { readFileSync } from "node:fs";

// Development/static hosting only. No care-data API, accounts, cookies, or database.
import {
  APP_FILES,
  outputName,
  readSourceAsset,
  renderServiceWorker,
} from "./static-app.js";
import path from "node:path";
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : null;
const readAsset = (route) =>
  staticDir
    ? readFileSync(path.join(staticDir, outputName(route)))
    : readSourceAsset(route);
export const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
  res.setHeader("Cache-Control", "no-cache");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      Allow: "GET, HEAD",
    });
    res.end("CareLoop saves on this device. This server does not accept data.");
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
  if (route === "/sw.js") {
    try {
      const script = staticDir
        ? readFileSync(path.join(staticDir, "sw.js"))
        : renderServiceWorker();
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
      });
      res.end(req.method === "HEAD" ? undefined : script);
    } catch {
      res.writeHead(500);
      res.end("Offline app files could not be prepared.");
    }
    return;
  }
  const file = APP_FILES[route];
  if (!file) {
    res.writeHead(404);
    res.end("Not found.");
    return;
  }
  try {
    const bytes = readAsset(route);
    res.writeHead(200, { "Content-Type": file[1] });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(500);
    res.end("The app files could not be loaded.");
  }
});
const host = process.env.HOST || "127.0.0.1";
server.listen(Number(process.env.PORT || 3000), host, () =>
  console.log(`CareLoop is running at http://${host}:${server.address().port}`),
);
