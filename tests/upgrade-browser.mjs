import { clickTab, buildAndSave } from "./ui-helpers.mjs";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { ASSETS, sourceAsset, serviceWorker } from "../src/assets.js";
import { emptyRecord } from "../src/record.js";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const legacyHTML = `<!doctype html><title>Old CareLoop</title><h1>Old green app</h1>
<script>navigator.serviceWorker.register('/sw.js');</script>`;
const legacyWorker = `
const CACHE = 'careloop-shell-upgrade-test';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.put('/', new Response(${JSON.stringify(legacyHTML)}, {headers: {'Content-Type':'text/html'}}));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname === '/')
    event.respondWith(caches.match('/'));
});`;
let phase = "legacy";
const server = http.createServer((req, res) => {
  const route = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Cache-Control", "no-store");
  if (route === "/sw.js") {
    res.setHeader("Content-Type", "text/javascript");
    const worker = serviceWorker();
    res.end(
      phase === "legacy"
        ? legacyWorker
        : phase === "next"
          ? worker.replace(/careloop-release-[a-f0-9]+/, "$&-next")
          : worker,
    );
  } else if (phase === "legacy" && route === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(legacyHTML);
  } else if (ASSETS[route]) {
    res.setHeader("Content-Type", ASSETS[route][1]);
    res.end(sourceAsset(route));
  } else {
    res.writeHead(404);
    res.end();
  }
});
let browser;
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const other = await context.newPage();
  await other.goto(url);
  assert.equal(await other.locator("h1").innerText(), "Old green app");

  const saved = JSON.stringify(emptyRecord());
  await page.evaluate(async (saved) => {
    localStorage.setItem("careloop_instructor_resolver_v1", saved);
    localStorage.setItem("legacy-record-sentinel", "keep this record");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("careloop-bedside", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("records");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readwrite");
      transaction.objectStore("records").put("keep old records", "sentinel");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await caches.open("unrelated-app-cache");
  }, saved);

  phase = "blue";
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    const reg = await navigator.serviceWorker.getRegistration();
    return (
      keys.some((key) => key.startsWith("careloop-release-")) &&
      !keys.includes("careloop-shell-upgrade-test") &&
      !reg.waiting &&
      !reg.installing
    );
  });
  // Activation does not force either existing tab to lose its current screen.
  assert.equal(await page.locator("h1").innerText(), "Old green app");
  assert.equal(await other.locator("h1").innerText(), "Old green app");
  await page.reload();
  assert.equal(await page.locator("nav button").count(), 6);
  assert.equal(await page.title(), "CareLoop — Your care plan at home");
  const preserved = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("careloop-bedside");
      request.onsuccess = () => resolve(request.result);
    });
    const oldRecord = await new Promise((resolve) => {
      const request = db
        .transaction("records")
        .objectStore("records")
        .get("sentinel");
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return {
      current: localStorage.getItem("careloop_instructor_resolver_v1"),
      legacy: localStorage.getItem("legacy-record-sentinel"),
      oldRecord,
      unrelatedCache: (await caches.keys()).includes("unrelated-app-cache"),
    };
  });
  assert.deepEqual(preserved, {
    current: saved,
    legacy: "keep this record",
    oldRecord: "keep old records",
    unrelatedCache: true,
  });
  await context.setOffline(true);
  await other.reload();
  assert.equal(await other.locator("nav button").count(), 6);
  await context.setOffline(false);

  // Subsequent blue updates must wait while an entry form is open.
  await clickTab(page, "import");
  await page.locator("#rawText").fill("Unsaved fictional draft");
  phase = "next";
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg.waiting?.state === "installed";
  });
  assert.equal(
    await page.locator("#rawText").inputValue(),
    "Unsaved fictional draft",
  );
  assert.equal(
    (await page.evaluate(() => caches.keys())).filter((key) =>
      key.startsWith("careloop-release-"),
    ).length,
    2,
  );
  console.log(
    "Upgrade checks passed: two old tabs migrate to blue, localStorage and IndexedDB records survive, offline reopening works, and later updates preserve open drafts.",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
