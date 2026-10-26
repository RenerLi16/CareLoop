import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
export const ASSETS = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/index.html": ["public/index.html", "text/html; charset=utf-8"],
  "/careloop-logo.png": ["public/careloop-logo.png", "image/png"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/manrope-latin.woff2": ["public/manrope-latin.woff2", "font/woff2"],
  "/manrope-vietnamese.woff2": [
    "public/manrope-vietnamese.woff2",
    "font/woff2",
  ],
  "/Manrope-OFL.txt": ["public/Manrope-OFL.txt", "text/plain; charset=utf-8"],
  "/i18n.js": ["public/i18n.js", "text/javascript; charset=utf-8"],
  "/timeline.js": ["public/timeline.js", "text/javascript; charset=utf-8"],
  "/setup.js": ["public/setup.js", "text/javascript; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/scheduler.js": ["src/scheduler.js", "text/javascript; charset=utf-8"],
  "/meals.js": ["src/meals.js", "text/javascript; charset=utf-8"],
  "/meal-settings.js": [
    "src/meal-settings.js",
    "text/javascript; charset=utf-8",
  ],
  "/instructions.js": ["src/instructions.js", "text/javascript; charset=utf-8"],
  "/live-schedule.js": [
    "src/live-schedule.js",
    "text/javascript; charset=utf-8",
  ],
  "/care-plan.js": ["src/care-plan.js", "text/javascript; charset=utf-8"],
  "/record.js": ["src/record.js", "text/javascript; charset=utf-8"],
  "/record-store.js": ["src/record-store.js", "text/javascript; charset=utf-8"],
  "/file-protection.js": [
    "src/file-protection.js",
    "text/javascript; charset=utf-8",
  ],
  "/recovery.js": ["public/recovery.js", "text/javascript; charset=utf-8"],
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
