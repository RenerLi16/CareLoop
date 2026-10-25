import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {
  buildStaticApp,
  renderServiceWorker,
  outputName,
  SHELL_ASSETS,
} from "../src/static-app.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const temp = mkdtempSync(path.join(os.tmpdir(), "careloop-offline-"));
const appDir = path.join(temp, "app"),
  profileDir = path.join(temp, "profile");
buildStaticApp(appDir);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0", STATIC_DIR: appDir },
  stdio: ["ignore", "pipe", "inherit"],
});
let context;
const launch = () =>
  chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    viewport: { width: 1024, height: 900 },
    timezoneId: "America/Los_Angeles",
  });
async function waitFor(check, message) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (b) => {
      const m = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  context = await launch();
  const requests = [],
    errors = [];
  context.on("request", (req) =>
    requests.push({
      url: req.url(),
      method: req.method(),
      body: req.postData(),
    }),
  );
  await context.addInitScript(() => {
    // Exercise permission-granted and denied UI branches without claiming an OS grant.
    if (navigator.storage) {
      navigator.storage.persisted = async () =>
        Boolean(globalThis.testPersisted);
      navigator.storage.persist = async () => {
        globalThis.testPersisted = Boolean(globalThis.allowTestPersistence);
        return globalThis.testPersisted;
      };
    }
  });
  let page = context.pages()[0];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T15:10:00Z") });
  await page.goto(url);
  await page
    .getByLabel("Patient name or nickname")
    .fill("Private Offline Patient Marker");
  await page.getByLabel("Plan start date", { exact: true }).fill("2026-10-25");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await page.getByRole("button", { name: "Create a care plan" }).click();
  await page.getByRole("button", { name: "Load fictional example" }).click();
  await page
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  for (const box of await page.locator("#plan-form input[type=checkbox]").all())
    await box.check();
  await page.getByRole("button", { name: "Save 30-day plan" }).click();
  await page.getByRole("heading", { name: "Daily schedule" }).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#device-status[data-offline-ready="true"]').waitFor();
  assert.equal(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    true,
  );
  await page
    .getByRole("button", { name: "Ask browser to protect local storage" })
    .click();
  assert.equal(
    await page.locator("#device-status").getAttribute("data-persistence"),
    "not-granted",
  );
  await page.evaluate(() => {
    globalThis.allowTestPersistence = true;
  });
  await page
    .getByRole("button", { name: "Ask browser to protect local storage" })
    .click();
  await page.locator('#device-status[data-persistence="granted"]').waitFor();
  assert.match(
    await page.locator("#device-status").innerText(),
    /does not prevent manual/,
  );
  const cached = await page.evaluate(async () => {
    const cacheNames = (await caches.keys()).filter((k) =>
      k.startsWith("careloop-shell-"),
    );
    const cache = await caches.open(cacheNames[0]);
    const keys = await cache.keys();
    const texts = await Promise.all(
      keys
        .filter((k) => !k.url.endsWith(".png"))
        .map(async (k) => (await cache.match(k)).text()),
    );
    return {
      paths: keys.map((k) => new URL(k.url).pathname).sort(),
      containsPatient: texts.some((t) =>
        t.includes("Private Offline Patient Marker"),
      ),
    };
  });
  assert.deepEqual(cached.paths, [...SHELL_ASSETS].sort());
  assert.equal(cached.containsPatient, false);
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/stage3-device-status.png",
    fullPage: true,
  });
  // Reload and make a real care entry with the browser completely offline.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
  assert.match(
    await page.locator(".heading .lead").innerText(),
    /Private Offline Patient Marker/,
  );
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  await page.getByLabel("Recorded by", { exact: true }).selectOption("patient");
  await page
    .getByRole("button", { name: "Save completed record", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.locator(".recorded-today").waitFor();
  await page.reload();
  await page.locator(".recorded-today").waitFor();
  assert.match(
    await page.locator(".bedside-progress").innerText(),
    /1\s+Completed/,
  );
  // A downloaded update must wait without replacing the open page or its unsaved draft.
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Add instructions", exact: true })
    .click();
  await page
    .getByLabel("Patient name", { exact: true })
    .fill("Unsaved draft must stay");
  const originalWorker = readFileSync(path.join(appDir, "sw.js"), "utf8");
  writeFileSync(
    path.join(appDir, "app.js"),
    readFileSync(path.join(appDir, "app.js"), "utf8") +
      "\n// test app update\n",
  );
  writeFileSync(
    path.join(appDir, "sw.js"),
    renderServiceWorker((route) =>
      readFileSync(path.join(appDir, outputName(route))),
    ),
  );
  const newCacheName = JSON.parse(
    readFileSync(path.join(appDir, "sw.js"), "utf8")
      .split("\n")[0]
      .match(/= (.*);/)[1],
  );
  assert.notEqual(
    originalWorker,
    readFileSync(path.join(appDir, "sw.js"), "utf8"),
  );
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await waitFor(
    () =>
      page.evaluate(
        async () => (await import("/offline.js")).getDeviceStatus().updateReady,
      ),
    "New worker did not wait for the open page",
  );
  assert.equal(
    await page.getByLabel("Patient name", { exact: true }).inputValue(),
    "Unsaved draft must stay",
  );
  assert.equal(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration()).waiting),
    ),
    true,
  );
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every(
      (req) =>
        req.method === "GET" &&
        !req.body &&
        req.url.startsWith(url) &&
        !req.url.includes("Private%20Offline") &&
        !req.url.includes("/api/"),
    ),
  );
  // Closing all app pages allows activation; this never hot-reloads a form.
  await page.close();
  let waitingWorker;
  await waitFor(async () => {
    for (const worker of context.serviceWorkers()) {
      try {
        if ((await worker.evaluate(() => SHELL_CACHE)) === newCacheName) {
          waitingWorker = worker;
          return true;
        }
      } catch {}
    }
    return false;
  }, "Updated worker was not available");
  await waitFor(async () => {
    try {
      return await waitingWorker.evaluate(
        async () =>
          !(await caches.keys()).some(
            (name) =>
              name.startsWith("careloop-shell-") && name !== SHELL_CACHE,
          ),
      );
    } catch {
      return false;
    }
  }, "Old app caches were not cleaned after closing pages");
  await context.close();
  context = null;
  // Stop the actual server, restart the browser with its same disk profile, and reopen offline.
  const exited = once(server, "exit");
  server.kill();
  await exited;
  context = await launch();
  await context.setOffline(true);
  page = context.pages()[0];
  await page.goto(url);
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await page.locator("#day-filter").fill("2026-10-25");
  await page.locator(".task.completed").first().waitFor();
  assert.match(
    await page.locator(".task.completed").first().innerText(),
    /Patient \/ self/,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('#device-status[data-offline-ready="true"]').waitFor();
  await page.screenshot({
    path: "test-results/stage3-server-stopped.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Add instructions", exact: true })
    .click();
  await page.getByRole("button", { name: "Load fictional example" }).click();
  assert.match(
    await page.locator("#raw-text").inputValue(),
    /FICTIONAL EXAMPLE/,
  );
  console.log(
    "Stage 3 offline checks passed: full app caching, no cached care data, offline recording, browser restart with server stopped, permission UI, and updates waiting without losing drafts.",
  );
} finally {
  await context?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  rmSync(temp, { recursive: true, force: true });
}
