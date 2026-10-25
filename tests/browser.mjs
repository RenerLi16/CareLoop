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
    timezoneId: "America/Los_Angeles",
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
  await page.clock.install({ time: new Date("2026-10-25T15:10:00.000Z") });
  await page.goto(url);
  await page.getByRole("heading", { name: "Set up CareLoop" }).waitFor();
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
  await page.getByRole("button", { name: "Save 30-day plan" }).click();
  await page.getByRole("heading", { name: "Daily schedule" }).waitFor();
  assert.equal(await page.locator(".medicine-rules tbody tr").count(), 4);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await page.locator("#day-filter").fill("2026-10-24");
  await page.locator('#record-list [data-action="edit-task"]').first().click();
  await page.getByRole("radio", { name: "Completed", exact: true }).check();
  await page
    .getByLabel("Recorded by", { exact: true })
    .selectOption({ label: "Lan" });
  await page.getByLabel("Actual time (device time)").fill("2026-10-24T08:05");
  await page.getByRole("button", { name: "Save completed record" }).click();
  await page.locator(".task.completed").first().waitFor();
  assert.match(
    await page.locator(".task.completed").first().innerText(),
    /by Lan/,
  );
  await page.reload();
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await page.locator("#day-filter").fill("2026-10-24");
  await page.locator(".task.completed").first().waitFor();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/bedside-stage2-records.png",
    fullPage: true,
  });
  // A stale edit from a second tab cannot overwrite a newer change.
  const other = await context.newPage();
  await other.goto(url);
  await other.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await other.getByRole("button", { name: "Records", exact: true }).click();
  await other.locator("#day-filter").fill("2026-10-24");
  await other
    .locator('.task.completed [data-action="edit-task"]')
    .first()
    .click();
  await page
    .locator('.task.completed [data-action="edit-task"]')
    .first()
    .click();
  await page.getByText("Assignment and notes", { exact: true }).click();
  await page.getByLabel("Note / reason for correction").fill("First tab saved");
  await page.getByRole("button", { name: "Save completed record" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await other.getByText("Assignment and notes", { exact: true }).click();
  await other.getByLabel("Note / reason for correction").fill("Stale tab edit");
  await other.getByRole("button", { name: "Save completed record" }).click();
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
  // Today always remains on the current patient-local date, regardless of Records filters.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  assert.equal(await page.locator("#day-filter").count(), 0);
  assert.match(await page.locator(".heading .lead").innerText(), /October 25/);
  assert.match(await page.locator("#next-task-title").innerText(), /Example A/);
  assert.equal(
    await page
      .locator(
        'nav [data-tab="plan"], nav [data-tab="settings"], nav [data-tab="team"]',
      )
      .count(),
    3,
  );
  await page.screenshot({
    path: "test-results/bedside-stage2-desktop.png",
    fullPage: true,
  });
  // The focused task opens a simple completed-entry form; cancel does not save it.
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("radio", { name: "Completed", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await page.getByLabel("Recorded by", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.locator(".assignment-details").getAttribute("open"),
    null,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.match(await page.locator("#next-task-title").innerText(), /Example A/);
  // Skipping a weight task requires attribution and time, but no invented measurement.
  const weightRow = page
    .locator(".bedside-task")
    .filter({ hasText: "Record weight" });
  await weightRow.getByRole("button", { name: /Record task/ }).click();
  await page.getByRole("radio", { name: "Skipped", exact: true }).check();
  await page.getByLabel("Recorded by", { exact: true }).selectOption("patient");
  assert.equal(
    await page.getByLabel("Recorded weight", { exact: true }).isVisible(),
    false,
  );
  await page
    .getByRole("button", { name: "Save skipped record", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page.locator(".recorded-today").waitFor();
  assert.match(
    await page.locator(".bedside-progress").innerText(),
    /1\s+Skipped/,
  );
  await page.locator(".recorded-today summary").click();
  assert.match(
    await page.locator(".recorded-today").innerText(),
    /Record weight/,
  );
  // Management is explicit and can be exited without publishing a plan.
  await page
    .getByRole("button", { name: "Read discharge", exact: true })
    .click();
  await page
    .getByLabel("Patient name", { exact: true })
    .fill("Unsaved draft name");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Read discharge", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Patient name", { exact: true }).inputValue(),
    "Unsaved draft name",
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  assert.match(
    await page.locator(".heading .lead").innerText(),
    /Fictional Rivera/,
  );
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
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await page.getByRole("button", { name: "Care team", exact: true }).click();
  await page.getByLabel("Caregiver name", { exact: true }).fill("Amy");
  await page
    .getByRole("button", { name: "Add caregiver", exact: true })
    .click();
  await page.getByRole("heading", { name: "Amy", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.screenshot({
    path: "test-results/bedside-stage2-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  // Tablet layout and explicit assignment-only saving remain usable with large touch targets.
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.ok(
    (
      await page
        .getByRole("button", { name: "Record this task", exact: true })
        .boundingBox()
    ).height >= 58,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "test-results/bedside-stage2-tablet.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  await page
    .getByRole("radio", {
      name: "Leave pending / assignment only",
      exact: true,
    })
    .check();
  assert.equal(
    await page.getByLabel("Recorded by", { exact: true }).isVisible(),
    false,
  );
  await page.getByText("Assignment and notes", { exact: true }).click();
  await page
    .getByLabel("Assigned caregiver", { exact: true })
    .selectOption({ label: "Minh" });
  await page
    .getByRole("button", { name: "Save assignment / reopen task", exact: true })
    .click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await page
    .locator(".bedside-focus")
    .getByText("Minh", { exact: true })
    .waitFor();
  assert.match(await page.locator("#next-task-title").innerText(), /Example A/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Recorded by", { exact: true }).inputValue(),
    "",
  );
  await page.screenshot({
    path: "test-results/bedside-stage2-recording-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page
      .locator("#task-dialog")
      .evaluate((d) => d.scrollWidth > d.clientWidth),
    false,
  );
  await page.keyboard.press("Escape");
  await page.locator("dialog").waitFor({ state: "detached" });
  // A storage failure must leave the actual recording form open with a persistent error.
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  await page.getByLabel("Recorded by", { exact: true }).selectOption("patient");
  const versionBeforeFailure = await page.evaluate(async () => {
    const before = await (await import("/storage.js")).loadRecord();
    globalThis.originalCareLoopPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Test quota", "QuotaExceededError");
    };
    return before.version;
  });
  await page
    .getByRole("button", { name: "Save completed record", exact: true })
    .click();
  await page.locator("#task-error").waitFor();
  assert.match(await page.locator("#task-error").innerText(), /Not saved/);
  assert.equal(await page.locator("#task-dialog[open]").count(), 1);
  const versionAfterFailure = await page.evaluate(async () => {
    IDBObjectStore.prototype.put = globalThis.originalCareLoopPut;
    return (await (await import("/storage.js")).loadRecord()).version;
  });
  assert.equal(versionAfterFailure, versionBeforeFailure);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
  await reopened.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await reopened.getByRole("button", { name: "Records", exact: true }).click();
  await reopened.locator("#day-filter").fill("2026-10-24");
  await reopened.locator(".task.completed").first().waitFor();
  console.log(
    "Stage 2 browser checks passed: local persistence, cross-tab conflicts, current-day focus, skipped measurements, assignment-only recording, management navigation, phone/tablet layouts, and no care-data network requests.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const closed = once(server, "exit");
    server.kill();
    await closed;
  }
}
