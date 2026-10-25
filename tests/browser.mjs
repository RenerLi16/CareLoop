import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (bytes) => {
      const m = String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (req) =>
    requests.push({
      url: req.url(),
      method: req.method(),
      body: req.postData(),
    }),
  );
  await page.goto(url);
  await page.getByRole("heading", { name: /One tablet/ }).waitFor();
  assert.equal(
    await page.locator("input[type=password], input[type=email]").count(),
    0,
  );
  await page.getByLabel("Patient name or nickname").fill("Fictional Rivera");
  await page.getByLabel("Plan start date", { exact: true }).fill("2026-10-24");
  await page.getByLabel("Caregiver names").fill("Lan\nMinh");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await page.getByRole("button", { name: "Create a care plan" }).click();
  await page.getByRole("button", { name: "Load fictional example" }).click();
  await page
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  assert.equal(await page.locator("[data-med]").count(), 4);
  await page
    .getByRole("button", { name: "Check schedule", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review before publishing" })
    .waitFor();
  for (const checkbox of await page
    .locator("#plan-form input[type=checkbox]")
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Publish 30-day plan" }).click();
  await page.getByRole("heading", { name: "A rhythm for each day." }).waitFor();
  assert.equal(await page.locator(".schedule-row").count(), 4);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.locator("#day-filter").fill("2026-10-24");
  await page.getByRole("button", { name: "Record / assign" }).first().click();
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  await page
    .getByLabel("Recorded by", { exact: true })
    .selectOption({ label: "Lan" });
  await page
    .getByLabel("Actual completion / skip time")
    .fill("2026-10-24T08:05");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.locator(".task.completed").first().waitFor();
  assert.match(
    await page.locator(".task.completed").first().innerText(),
    /by Lan/,
  );
  await page.reload();
  await page.getByRole("heading", { name: "A clearer day ahead." }).waitFor();
  await page.locator("#day-filter").fill("2026-10-24");
  await page.locator(".task.completed").first().waitFor();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/bedside-stage1-desktop.png",
    fullPage: true,
  });
  // A stale edit from a second tab cannot overwrite a newer change.
  const other = await context.newPage();
  await other.goto(url);
  await other.getByRole("heading", { name: "A clearer day ahead." }).waitFor();
  await other.locator("#day-filter").fill("2026-10-24");
  await other
    .getByRole("button", { name: "Edit record", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Edit record", exact: true })
    .first()
    .click();
  await page.getByLabel("Note / reason for correction").fill("First tab saved");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await other.getByLabel("Note / reason for correction").fill("Stale tab edit");
  await other.getByRole("button", { name: "Save record" }).click();
  await other.locator("dialog").waitFor({ state: "detached" });
  await other.getByText("First tab saved", { exact: true }).waitFor();
  assert.equal(
    await other.getByText("Stale tab edit", { exact: true }).count(),
    0,
  );
  // A separate browser context is a separate bedside record, without a shared server database.
  const isolated = await browser.newContext(),
    separate = await isolated.newPage();
  await separate.goto(url);
  await separate.getByRole("button", { name: "Set up this device" }).waitFor();
  // Exercise actual IndexedDB transaction serialization and rollback using the same store as the UI.
  const storageResults = await page.evaluate(async () => {
    const { loadRecord, saveChange } = await import("/storage.js");
    const before = await loadRecord();
    const writes = await Promise.allSettled([
      saveChange({ type: "caregiver", name: "Concurrent A" }, before.version),
      saveChange({ type: "caregiver", name: "Concurrent B" }, before.version),
    ]);
    const after = await loadRecord();
    let rejected = false;
    try {
      await saveChange(
        {
          type: "task",
          patch: {
            id: after.tasks[0].id,
            status: "done",
            recordedBy: "patient",
            actualAt: "invalid",
          },
        },
        after.version,
      );
    } catch {
      rejected = true;
    }
    return {
      fulfilled: writes.filter((x) => x.status === "fulfilled").length,
      conflicts: writes.filter(
        (x) => x.status === "rejected" && x.reason.status === 409,
      ).length,
      versionDelta: after.version - before.version,
      rollback: rejected && (await loadRecord()).version === after.version,
    };
  });
  assert.deepEqual(storageResults, {
    fulfilled: 1,
    conflicts: 1,
    versionDelta: 1,
    rollback: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "A clearer day ahead." }).waitFor();
  await page.getByRole("button", { name: "Care team", exact: true }).click();
  await page.getByLabel("Caregiver name", { exact: true }).fill("Amy");
  await page
    .getByRole("button", { name: "Add caregiver", exact: true })
    .click();
  await page.getByRole("heading", { name: "Amy", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.screenshot({
    path: "test-results/bedside-stage1-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.ok(
    requests.every(
      (r) =>
        r.method === "GET" &&
        !r.body &&
        !r.url.includes("/api/") &&
        r.url.startsWith(url),
    ),
  );
  assert.deepEqual(errors, []);
  // Force an IndexedDB write failure: the form must stay open and the UI must not report a saved task.
  const failureContext = await browser.newContext();
  const failing = await failureContext.newPage();
  await failing.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (globalThis.failCareLoopWrites)
        throw new DOMException("Test quota", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await failing.goto(url);
  await failing.getByLabel("Patient name or nickname").fill("Storage test");
  await failing.evaluate(() => {
    globalThis.failCareLoopWrites = true;
  });
  await failing.getByRole("button", { name: "Set up this device" }).click();
  await failing.locator("#toast.error").waitFor();
  assert.match(
    await failing.locator("#toast").innerText(),
    /storage|quota|saved/i,
  );
  assert.equal(await failing.locator("#setup-form").count(), 1);
  const neverSaved = await failing.evaluate(
    async () => (await (await import("/storage.js")).loadRecord()).profile,
  );
  assert.equal(neverSaved, null);
  // Reopening a page within the same browser profile retains its care record.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await reopened
    .getByRole("heading", { name: "A clearer day ahead." })
    .waitFor();
  await reopened.locator("#day-filter").fill("2026-10-24");
  await reopened.locator(".task.completed").first().waitFor();
  console.log(
    "Stage 1 browser checks passed: account-free setup, local persistence, attribution, isolated profiles, cross-tab conflicts, transaction rollback, failed-save UI, caregiver names, and mobile layout. No care-data network requests.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const closed = once(server, "exit");
    server.kill();
    await closed;
  }
}
