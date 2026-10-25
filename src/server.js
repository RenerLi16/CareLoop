import http from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/scheduler.js": ["src/scheduler.js", "text/javascript; charset=utf-8"],
  "/sw.js": ["public/sw.js", "text/javascript; charset=utf-8"],
};
export const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-cache");
  // The instructor's compact markup uses inline styles; script remains external.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end("No care-data uploads.");
    return;
  }
  const route = new URL(req.url, "http://localhost").pathname;
  const file = files[route];
  if (!file) {
    res.writeHead(404);
    res.end("Not found.");
    return;
  }
  try {
    let body = readFileSync(path.join(root, ...file[0].split("/")));
    if (route === "/sw.js") {
      res.setHeader("Service-Worker-Allowed", "/");
      const hash = createHash("sha256");
      for (const [file] of Object.values(files))
        hash.update(readFileSync(path.join(root, file)));
      body = Buffer.from(
        body
          .toString()
          .replace(
            "careloop-instructor-resolver-1",
            "careloop-instructor-resolver-" + hash.digest("hex").slice(0, 16),
          ),
      );
    }
    res.writeHead(200, { "Content-Type": file[1] });
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
