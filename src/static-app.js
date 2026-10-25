import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
export const APP_FILES = Object.freeze({
  "/plan-views.js": ["src/plan-views.js", "text/javascript; charset=utf-8"],
  "/file-protection.js": [
    "src/file-protection.js",
    "text/javascript; charset=utf-8",
  ],
  "/recovery.js": ["public/recovery.js", "text/javascript; charset=utf-8"],
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript; charset=utf-8"],
  "/offline.js": ["public/offline.js", "text/javascript; charset=utf-8"],
  "/storage.js": ["public/storage.js", "text/javascript; charset=utf-8"],
  "/domain.js": ["src/domain.js", "text/javascript; charset=utf-8"],
  "/bedside.js": ["src/bedside.js", "text/javascript; charset=utf-8"],
  "/care-record.js": ["src/care-record.js", "text/javascript; charset=utf-8"],
  "/style.css": ["public/style.css", "text/css; charset=utf-8"],
  "/sample.txt": ["public/sample.txt", "text/plain; charset=utf-8"],
  "/manifest.webmanifest": [
    "public/manifest.webmanifest",
    "application/manifest+json",
  ],
  "/icons/careloop.svg": ["public/icons/careloop.svg", "image/svg+xml"],
  "/icons/icon-192.png": ["public/icons/icon-192.png", "image/png"],
  "/icons/icon-512.png": ["public/icons/icon-512.png", "image/png"],
  "/icons/maskable-512.png": ["public/icons/maskable-512.png", "image/png"],
  "/icons/apple-touch-icon.png": [
    "public/icons/apple-touch-icon.png",
    "image/png",
  ],
});
export const SHELL_ASSETS = Object.freeze(Object.keys(APP_FILES));
export const outputName = (route) =>
  route === "/" ? "index.html" : route.slice(1);
export const readSourceAsset = (route) =>
  readFileSync(path.join(root, APP_FILES[route][0]));
export function renderServiceWorker(readAsset = readSourceAsset) {
  const body = readFileSync(path.join(root, "public/sw.js"), "utf8");
  const hash = createHash("sha256").update(body);
  for (const route of SHELL_ASSETS) hash.update(route).update(readAsset(route));
  const version = `careloop-shell-${hash.digest("hex").slice(0, 20)}`;
  return `const SHELL_CACHE = ${JSON.stringify(version)};\nconst SHELL_ASSETS = ${JSON.stringify(SHELL_ASSETS)};\n${body}`;
}
export function buildStaticApp(outputDir) {
  const resolved = path.resolve(outputDir);
  if (
    [root, path.join(root, "public"), path.join(root, "src")].includes(resolved)
  )
    throw new Error("Choose an output folder separate from app source.");
  for (const route of SHELL_ASSETS) {
    const target = path.join(resolved, outputName(route));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readSourceAsset(route));
  }
  writeFileSync(path.join(resolved, "sw.js"), renderServiceWorker());
  return resolved;
}
