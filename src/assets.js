import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
export const ASSETS = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/index.html": ["public/index.html", "text/html; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/scheduler.js": ["src/scheduler.js", "text/javascript; charset=utf-8"],
  "/instructions.js": ["src/instructions.js", "text/javascript; charset=utf-8"],
  "/care-plan.js": ["src/care-plan.js", "text/javascript; charset=utf-8"],
};
export const sourceAsset = (route) =>
  readFileSync(path.join(root, ASSETS[route][0]));
export function serviceWorker() {
  const hash = createHash("sha256");
  const worker = readFileSync(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  hash.update(worker);
  for (const route of Object.keys(ASSETS))
    hash.update(route).update(sourceAsset(route));
  return worker
    .replace(
      "careloop-release-VERSION",
      "careloop-release-" + hash.digest("hex").slice(0, 16),
    )
    .replace("/* ASSET_LIST */ []", JSON.stringify(Object.keys(ASSETS)));
}
