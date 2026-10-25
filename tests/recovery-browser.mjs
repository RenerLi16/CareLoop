import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { unlockFile, PROTECTED_FORMAT } from "../src/file-protection.js";
import { SHELL_ASSETS } from "../src/static-app.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
const phrase = "keep this backup phrase privately";
const marker = "Fictional Recovery Patient 測試";
async function downloadBytes(download) {
  const chunks = [];
  for await (const chunk of await download.createReadStream())
    chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function chooseBackup(page, bytes) {
  await page.locator("#backup-upload").setInputFiles({
    name: "careloop-backup.json",
    mimeType: "application/json",
    buffer: bytes,
  });
}
async function deviceData(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
}
async function unlock(page, passphrase) {
  await page.getByLabel("Backup passphrase", { exact: true }).fill(passphrase);
  await page
    .getByRole("button", { name: "Unlock and review", exact: true })
    .click();
}
async function confirmRestore(page) {
  await page.locator("#recovery-dialog input[name=understood]").check();
  await page.getByLabel("Type RESTORE to replace the record").fill("RESTORE");
  await page
    .getByRole("button", { name: "Replace with this backup", exact: true })
    .click();
}
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (bytes) => {
      const m = String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext({
      viewport: { width: 1024, height: 900 },
      timezoneId: "America/Los_Angeles",
    }),
    requests = [],
    errors = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T15:10:00Z") });
  await page.goto(url);
  await page.getByLabel("Patient name or nickname").fill(marker);
  await page.getByLabel("Plan start date", { exact: true }).fill("2026-10-25");
  await page.getByLabel("Caregiver names").fill("Lan");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await page.getByRole("button", { name: "Create a care plan" }).click();
  await page.getByRole("button", { name: "Load fictional example" }).click();
  await page
    .getByRole("button", { name: "Read instructions", exact: true })
    .click();
  for (const checkbox of await page
    .locator("#plan-form input[type=checkbox]")
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Save 30-day plan" }).click();
  await page.getByRole("heading", { name: "Daily schedule" }).waitFor();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  await page
    .getByLabel("Recorded by", { exact: true })
    .selectOption({ label: "Lan" });
  await page.getByRole("button", { name: "Save completed record" }).click();
  await page.locator("dialog").waitFor({ state: "detached" });
  await deviceData(page);
  await page.locator('#device-status[data-offline-ready="true"]').waitFor();
  await page
    .getByRole("button", { name: "Save encrypted backup", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Save an encrypted backup" })
    .waitFor();
  await page
    .getByLabel("Backup passphrase (at least 12 characters)", { exact: true })
    .fill(phrase);
  await page
    .getByLabel("Repeat backup passphrase", { exact: true })
    .fill("different long passphrase");
  await page.getByRole("button", { name: "Encrypt and download" }).click();
  await page.locator("#recovery-error").waitFor();
  assert.match(
    await page.locator("#recovery-error").innerText(),
    /do not match/,
  );
  await page
    .getByLabel("Repeat backup passphrase", { exact: true })
    .fill(phrase);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Encrypt and download" }).click();
  const bytes = await downloadBytes(await downloading);
  await page.locator("#recovery-dialog").waitFor({ state: "detached" });
  const envelope = JSON.parse(bytes),
    backup = await unlockFile(envelope, phrase);
  assert.equal(envelope.format, PROTECTED_FORMAT);
  assert.ok(!bytes.toString().includes(marker));
  assert.ok(!bytes.toString().includes(phrase));
  assert.equal(backup.record.profile.patient, marker);
  assert.equal(
    backup.record.tasks.filter((t) => t.status === "done").length,
    1,
  );
  const before = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.ok(!JSON.stringify(before).includes(phrase));
  // A second tab must lose an open recording form when the shared device record is deleted.
  const other = await context.newPage();
  await other.clock.install({ time: new Date("2026-10-25T15:10:00Z") });
  await other.goto(url);
  await other
    .getByRole("button", { name: "Record this task", exact: true })
    .click();
  await page.getByRole("button", { name: "Review data deletion" }).click();
  await page
    .getByRole("heading", { name: "Delete this browser’s care record?" })
    .waitFor();
  await page.getByLabel("Type DELETE to confirm").fill("WRONG");
  await page
    .getByRole("button", { name: "Delete this browser’s record", exact: true })
    .click();
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).profile.patient,
    marker,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  // Choosing backup first leaves deletion cancelled, even when the export is cancelled.
  await page.getByRole("button", { name: "Review data deletion" }).click();
  await page
    .getByRole("button", { name: "Save an encrypted backup first" })
    .click();
  await page
    .getByRole("heading", { name: "Save an encrypted backup" })
    .waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).profile.patient,
    marker,
  );
  await page.getByRole("button", { name: "Review data deletion" }).click();
  await page.locator("#recovery-dialog input[name=understood]").check();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Delete this browser’s record", exact: true })
    .click();
  await page.locator("#setup-form").waitFor();
  await other.locator("#setup-form").waitFor();
  assert.equal(await other.locator("#task-dialog").count(), 0);
  const empty = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.equal(empty.profile, null);
  assert.deepEqual(empty.tasks, []);
  assert.deepEqual(empty.audit, []);
  // Restore works directly from fresh setup. A wrong passphrase cannot replace the empty record.
  await chooseBackup(page, bytes);
  await page
    .getByRole("heading", { name: "Unlock backup for review" })
    .waitFor();
  await unlock(page, "wrong backup passphrase");
  await page.locator("#recovery-error").waitFor();
  assert.match(
    await page.locator("#recovery-error").innerText(),
    /Could not unlock/,
  );
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).profile,
    null,
  );
  await unlock(page, phrase);
  await page
    .getByRole("heading", { name: "Review before restoring" })
    .waitFor();
  assert.match(
    await page.locator("#recovery-dialog").innerText(),
    /Fictional Recovery Patient/,
  );
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).profile,
    null,
  );
  mkdirSync("test-results", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/stage4-restore-review-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page
      .locator("#recovery-dialog")
      .evaluate((d) => d.scrollWidth > d.clientWidth),
    false,
  );
  // A record created in the other tab while preview is open must not be overwritten.
  await other
    .getByLabel("Patient name or nickname")
    .fill("New record from another tab");
  await other.getByLabel("Plan start date", { exact: true }).fill("2026-10-25");
  await other.getByRole("button", { name: "Set up this device" }).click();
  await other.getByRole("button", { name: "Create a care plan" }).waitFor();
  await confirmRestore(page);
  await page.locator("#recovery-error").waitFor();
  assert.match(
    await page.locator("#recovery-error").innerText(),
    /changed in another tab/,
  );
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).profile.patient,
    "New record from another tab",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await deviceData(page);
  await chooseBackup(page, bytes);
  await unlock(page, phrase);
  await page
    .getByRole("heading", { name: "Review before restoring" })
    .waitFor();
  assert.match(
    await page.locator("#recovery-dialog").innerText(),
    /New record from another tab/,
  );
  await confirmRestore(page);
  await page.locator("#recovery-dialog").waitFor({ state: "detached" });
  await page.locator(".recorded-today").waitFor();
  const restored = await page.evaluate(async () =>
    (await import("/storage.js")).loadRecord(),
  );
  assert.equal(restored.profile.patient, marker);
  assert.deepEqual(restored.tasks, backup.record.tasks);
  assert.deepEqual(restored.team, backup.record.team);
  await deviceData(page);
  // Older plaintext bedside files are reviewed, never silently imported.
  await chooseBackup(page, Buffer.from(JSON.stringify(backup)));
  await page
    .getByRole("heading", { name: "Review before restoring" })
    .waitFor();
  assert.match(
    await page.locator("#recovery-dialog").innerText(),
    /Unencrypted backup/,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const malformed = structuredClone(backup);
  malformed.record.tasks[0].actualAt = "bad";
  await chooseBackup(page, Buffer.from(JSON.stringify(malformed)));
  await page.locator("#toast.error").waitFor();
  assert.equal(
    (
      await page.evaluate(async () =>
        (await import("/storage.js")).loadRecord(),
      )
    ).version,
    restored.version,
  );
  // Native notification contents stay generic; no patient or medication details are included.
  await page.evaluate(() => {
    globalThis.notificationContents = [];
    globalThis.Notification = class {
      static async requestPermission() {
        return "granted";
      }
      constructor(title, options) {
        globalThis.notificationContents.push({ title, ...options });
      }
    };
  });
  await page
    .getByRole("button", { name: "Enable reminders while this page is open" })
    .click();
  await page.clock.fastForward(6 * 60 * 1000);
  const messages = await page.evaluate(() => globalThis.notificationContents);
  assert.ok(messages.length > 0);
  assert.ok(!JSON.stringify(messages).includes(marker));
  assert.ok(!JSON.stringify(messages).includes("Example A"));
  // A protected backup can also be created while the browser is offline.
  await context.setOffline(true);
  await page.reload();
  await deviceData(page);
  await page
    .getByRole("button", { name: "Save encrypted backup", exact: true })
    .click();
  await page
    .getByLabel("Backup passphrase (at least 12 characters)", { exact: true })
    .fill(phrase);
  await page
    .getByLabel("Repeat backup passphrase", { exact: true })
    .fill(phrase);
  const offlineDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Encrypt and download" }).click();
  const offlineBytes = await downloadBytes(await offlineDownload);
  assert.equal(
    (await unlockFile(JSON.parse(offlineBytes), phrase)).record.profile.patient,
    marker,
  );
  const cached = await page.evaluate(async () => {
    const names = await caches.keys(),
      cache = await caches.open(
        names.find((n) => n.startsWith("careloop-shell-")),
      ),
      keys = await cache.keys();
    const text = await Promise.all(
      keys
        .filter((k) => !k.url.endsWith(".png"))
        .map(async (k) => (await cache.match(k)).text()),
    );
    return {
      paths: keys.map((k) => new URL(k.url).pathname).sort(),
      leaked: text.some(
        (t) =>
          t.includes("Fictional Recovery Patient") ||
          t.includes("keep this backup phrase privately"),
      ),
    };
  });
  assert.deepEqual(cached.paths, [...SHELL_ASSETS].sort());
  assert.equal(cached.leaked, false);
  assert.ok(
    requests.every(
      (request) =>
        request.method === "GET" &&
        !request.body &&
        request.url.startsWith(url) &&
        !new URL(request.url).search &&
        !request.url.includes("/api/"),
    ),
  );
  assert.equal(await page.locator("input[type=password]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Stage 4 recovery checks passed: encrypted downloads, wrong-password rejection, reviewed restores, stale-restore protection, fresh-device recovery, deletion cancellation/cross-tab reset, legacy import review, generic notifications and offline export. No care-data uploads or cache leaks.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}
