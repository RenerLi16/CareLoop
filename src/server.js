import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Development/static hosting only. No care-data API, accounts, cookies, or database.
const files = {
  "/bedside.js": ["./bedside.js", "text/javascript; charset=utf-8"],
  "/": ["../public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["../public/app.js", "text/javascript; charset=utf-8"],
  "/storage.js": ["../public/storage.js", "text/javascript; charset=utf-8"],
  "/domain.js": ["./domain.js", "text/javascript; charset=utf-8"],
  "/care-record.js": ["./care-record.js", "text/javascript; charset=utf-8"],
  "/style.css": ["../public/style.css", "text/css; charset=utf-8"],
  "/sample.txt": ["../public/sample.txt", "text/plain; charset=utf-8"],
};
export const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
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
  const file = files[route];
  if (!file) {
    res.writeHead(404);
    res.end("Not found.");
    return;
  }
  try {
    const bytes = readFileSync(
      fileURLToPath(new URL(file[0], import.meta.url)),
    );
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
