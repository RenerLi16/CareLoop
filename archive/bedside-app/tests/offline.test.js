import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  APP_FILES,
  SHELL_ASSETS,
  renderServiceWorker,
  readSourceAsset,
  buildStaticApp,
} from "../src/static-app.js";

test("manifest, app icons and cached files form a complete static app without care data", () => {
  const manifest = JSON.parse(readSourceAsset("/manifest.webmanifest"));
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  );
  for (const icon of manifest.icons) {
    const bytes = readSourceAsset(icon.src),
      size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.ok(SHELL_ASSETS.includes("/offline.js"));
  assert.ok(SHELL_ASSETS.includes("/bedside.js"));
  assert.ok(
    SHELL_ASSETS.every(
      (route) =>
        !route.includes("/api/") &&
        !route.includes("backup") &&
        !route.includes("data/") &&
        !route.includes("?"),
    ),
  );
  assert.match(readSourceAsset("/").toString(), /rel="manifest"/);
});
test("offline version is deterministic and changes with any app file or dependency", () => {
  const original = renderServiceWorker();
  assert.equal(original, renderServiceWorker());
  const changed = renderServiceWorker((route) =>
    route === "/domain.js"
      ? Buffer.concat([readSourceAsset(route), Buffer.from("\n// changed")])
      : readSourceAsset(route),
  );
  assert.notEqual(original.split("\n")[0], changed.split("\n")[0]);
  assert.match(original, /careloop-shell-[a-f0-9]{20}/);
});
test("build produces a deployable static folder, never the database or source server", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "careloop-build-"));
  try {
    buildStaticApp(dir);
    assert.ok(readdirSync(dir).includes("sw.js"));
    assert.ok(readdirSync(dir).includes("index.html"));
    assert.ok(!readdirSync(dir).includes("data"));
    assert.ok(!readdirSync(dir).includes("server.js"));
    assert.equal(
      readFileSync(path.join(dir, "sw.js"), "utf8"),
      renderServiceWorker(),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
function workerHarness() {
  const handlers = {},
    entries = new Map(),
    deleted = [];
  let claimed = 0,
    failInstall = false;
  const cache = {
    async addAll(requests) {
      if (failInstall) throw new Error("download failed");
      for (const request of requests)
        entries.set(new URL(request.url).pathname, new Response("app file"));
    },
    async match(request) {
      const route =
        typeof request === "string" ? request : new URL(request.url).pathname;
      return entries.get(route)?.clone();
    },
  };
  const caches = {
    async open() {
      return cache;
    },
    async keys() {
      return ["unrelated-app", "careloop-shell-old", "careloop-shell-current"];
    },
    async delete(name) {
      deleted.push(name);
      return true;
    },
  };
  const self = {
    location: { origin: "https://careloop.example" },
    addEventListener(name, fn) {
      handlers[name] = fn;
    },
    clients: {
      async claim() {
        claimed++;
      },
    },
    skipWaiting() {
      throw new Error("Must not interrupt an open form");
    },
  };
  class LocalRequest extends Request {
    constructor(url, options) {
      super(new URL(url, self.location.origin), options);
    }
  }
  vm.runInNewContext(
    `const SHELL_CACHE='careloop-shell-current'; const SHELL_ASSETS=${JSON.stringify(SHELL_ASSETS)};\n${readFileSync(new URL("../public/sw.js", import.meta.url), "utf8")}`,
    { self, caches, Request: LocalRequest, URL, Response },
  );
  return {
    handlers,
    entries,
    deleted,
    claimed: () => claimed,
    failInstall: () => {
      failInstall = true;
    },
  };
}
test("worker atomically precaches only app files, leaves updates waiting, and cleans only its old caches", async () => {
  const harness = workerHarness();
  let install;
  harness.handlers.install({
    waitUntil(promise) {
      install = promise;
    },
  });
  await install;
  assert.equal(harness.entries.size, SHELL_ASSETS.length);
  let activate;
  harness.handlers.activate({
    waitUntil(promise) {
      activate = promise;
    },
  });
  await activate;
  assert.deepEqual(harness.deleted, ["careloop-shell-old"]);
  assert.equal(harness.claimed(), 1);
});
test("failed installation cannot activate or remove the working cache", async () => {
  const harness = workerHarness();
  harness.failInstall();
  let install;
  harness.handlers.install({
    waitUntil(promise) {
      install = promise;
    },
  });
  await assert.rejects(install, /download failed/);
  assert.equal(harness.claimed(), 0);
  assert.deepEqual(harness.deleted, []);
});
test("worker does not intercept APIs, export URLs, mutations, query strings or other origins", () => {
  const harness = workerHarness();
  for (const [url, method] of [
    ["https://careloop.example/api/state", "GET"],
    ["https://careloop.example/backup.json", "GET"],
    ["https://careloop.example/app.js?patient=private", "GET"],
    ["https://other.example/app.js", "GET"],
    ["https://careloop.example/", "POST"],
  ]) {
    let intercepted = false;
    harness.handlers.fetch({
      request: new Request(url, { method }),
      respondWith() {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, url);
  }
});
test("cached app files reopen offline and readiness requires every file", async () => {
  const harness = workerHarness();
  let install;
  harness.handlers.install({
    waitUntil(p) {
      install = p;
    },
  });
  await install;
  let response;
  harness.handlers.fetch({
    request: new Request("https://careloop.example/app.js"),
    respondWith(p) {
      response = p;
    },
  });
  assert.equal((await response).status, 200);
  let status, complete;
  harness.handlers.message({
    data: { type: "SHELL_STATUS" },
    ports: [
      {
        postMessage(value) {
          status = value;
        },
      },
    ],
    waitUntil(p) {
      complete = p;
    },
  });
  await complete;
  assert.equal(status.ready, true);
  harness.entries.delete("/app.js");
  harness.handlers.message({
    data: { type: "SHELL_STATUS" },
    ports: [
      {
        postMessage(value) {
          status = value;
        },
      },
    ],
    waitUntil(p) {
      complete = p;
    },
  });
  await complete;
  assert.equal(status.ready, false);
});
