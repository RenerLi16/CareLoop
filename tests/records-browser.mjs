import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
const key = "careloop_instructor_resolver_v1",
  pass = "fictional backup passphrase";
const snapshot = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const clickTab = (page, id) => page.locator(`nav [data-t="${id}"]`).click();
async function addPerson(page, name) {
  await clickTab(page, "team");
  const details = page.locator("#caregiverAdd").locator("..");
  if (!(await details.evaluate((element) => element.open)))
    await details.locator("summary").click();
  await page.locator('#caregiverAdd [name="name"]').fill(name);
  await page.locator('#caregiverAdd [name="rel"]').fill("Family");
  await page.locator("#caregiverAdd button").click();
  await page.waitForFunction(
    ({ key, name }) =>
      JSON.parse(localStorage.getItem(key)).team.some((p) => p.name === name),
    { key, name },
  );
}
async function saveDialog(page, { name = "Lan", time, note } = {}) {
  await page.locator("#task-dialog").waitFor();
  await page
    .locator('#record-form [name="recordedBy"]')
    .selectOption({ label: name });
  if (time) await page.locator('#record-form [name="actualAt"]').fill(time);
  if (note !== undefined)
    await page.locator('#record-form [name="note"]').fill(note);
  await page.locator('#record-form button[type="submit"]').click();
}
async function openBackup(page, file) {
  await clickTab(page, "about");
  await page.locator("#backupImport").setInputFiles({
    name: "careloop-backup.json",
    mimeType: "application/json",
    buffer: file,
  });
  await page.locator('[data-recovery-form="unlock"]').waitFor();
}
async function unlock(page, phrase = pass) {
  await page.locator('#recovery-dialog [name="passphrase"]').fill(phrase);
  await page.locator('#recovery-dialog button[type="submit"]').click();
}
async function confirmRestore(page) {
  await page.locator('#recovery-dialog [name="understood"]').check();
  await page.locator('#recovery-dialog [name="confirmation"]').fill("RESTORE");
  await page.locator('#recovery-dialog button[type="submit"]').click();
}
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      const m = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const context = await browser.newContext({
      timezoneId: "America/Los_Angeles",
      acceptDownloads: true,
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await page.goto(url);
  await clickTab(page, "import");
  await page
    .locator("#rawText")
    .fill(
      "Patient: Fictional Record Test Age: 50 Discharged: 2026-10-25\nMEDICATIONS\nAlpha 10 mg once daily\nBeta 5 mg once daily\nCALL THE DOCTOR IF\nFictional warning for review",
    );
  await page.locator("#btnParse").click();
  await page.locator("#fWeigh").uncheck();
  await page.locator("#fSymptoms").uncheck();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  await addPerson(page, "Lan");
  await addPerson(page, "Minh");
  let state = await snapshot(page);
  const alpha = state.tasks.find(
      (t) => t.date === "2026-10-25" && t.label.startsWith("Alpha"),
    ),
    beta = state.tasks.find(
      (t) => t.date === "2026-10-25" && t.label.startsWith("Beta"),
    );
  await clickTab(page, "tasks");
  await page.locator(`[data-done="${alpha.id}"]`).click();
  await saveDialog(page, { time: "2026-10-25T08:00" });
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  state = await snapshot(page);
  assert.equal(
    state.tasks.find((t) => t.id === alpha.id).doneAt,
    new Date("2026-10-25T15:00:00Z").getTime(),
  );
  assert.equal(
    state.tasks.find((t) => t.id === alpha.id).recordedByName,
    "Lan",
  );
  const firstTime = state.tasks.find((t) => t.id === alpha.id).doneAt;
  await page.clock.fastForward(60000);
  await page.locator(`[data-edit="${alpha.id}"]`).click();
  await saveDialog(page);
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  assert.equal(
    (await snapshot(page)).tasks.find((t) => t.id === alpha.id).doneAt,
    firstTime,
  );
  await page.locator(`[data-edit="${alpha.id}"]`).click();
  await saveDialog(page, { time: "2026-10-25T08:15" });
  assert.match(await page.locator("#record-error").innerText(), /reason/);
  assert.equal(
    (await snapshot(page)).tasks.find((t) => t.id === alpha.id).doneAt,
    firstTime,
  );
  await saveDialog(page, { note: "Corrected the actual time" });
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  state = await snapshot(page);
  assert.equal(
    state.tasks.find((t) => t.id === alpha.id).corrections[0].before.doneAt,
    firstTime,
  );
  await page.locator("#dayFilter").selectOption("2026-10-26");
  const future = state.tasks.find(
    (t) => t.date === "2026-10-26" && t.label.startsWith("Alpha"),
  );
  const beforeFuture = await snapshot(page);
  await page.locator(`[data-done="${future.id}"]`).click();
  await saveDialog(page);
  assert.match(await page.locator("#record-error").innerText(), /future day/);
  assert.deepEqual(await snapshot(page), beforeFuture);
  await page.locator("#task-dialog [data-cancel]").click();
  // A stale recording form cannot erase another tab's completed task.
  await page.locator("#dayFilter").selectOption("2026-10-25");
  await page.locator(`[data-edit="${alpha.id}"]`).click();
  const other = await context.newPage();
  await other.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await other.goto(url);
  await clickTab(other, "tasks");
  await other.locator(`[data-done="${beta.id}"]`).click();
  await saveDialog(other, { name: "Minh", time: "2026-10-25T10:00" });
  await other.locator("#task-dialog").waitFor({ state: "detached" });
  await saveDialog(page, {
    time: "2026-10-25T08:30",
    note: "Attempt from stale form",
  });
  assert.match(await page.locator("#record-error").innerText(), /Another tab/);
  state = await snapshot(page);
  assert.equal(state.tasks.find((t) => t.id === beta.id).status, "done");
  assert.equal(
    state.tasks.find((t) => t.id === alpha.id).doneAt,
    new Date("2026-10-25T15:15:00Z").getTime(),
  );
  await page.locator("#task-dialog [data-cancel]").click();
  // Saved plan fields reopen after a browser restart, while local drafts survive navigation.
  await page.reload();
  await clickTab(page, "import");
  assert.equal(
    await page.locator("#fName").inputValue(),
    "Fictional Record Test",
  );
  assert.equal(await page.locator(".mDrug").count(), 2);
  assert.match(await page.locator("#rawText").inputValue(), /Alpha/);
  await page.locator("#fName").fill("Unsaved draft");
  await clickTab(page, "about");
  await clickTab(page, "import");
  assert.equal(await page.locator("#fName").inputValue(), "Unsaved draft");
  await addPerson(other, "Amy");
  await page.locator("#btnGenerate").click();
  assert.match(await page.locator("#saveStatus").innerText(), /Another tab/);
  assert.equal(await page.locator("#fName").inputValue(), "Unsaved draft");
  assert.equal((await snapshot(page)).patient.name, "Fictional Record Test");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#btnReloadPlan").click();
  assert.equal(
    await page.locator("#fName").inputValue(),
    "Fictional Record Test",
  );
  // Renaming a caregiver does not rewrite recorder names on earlier entries.
  await clickTab(page, "team");
  await page.getByText("Edit caregivers", { exact: true }).click();
  const lanId = (await snapshot(page)).team.find((p) => p.name === "Lan").id;
  const lanRow = page.locator(`[data-person="${lanId}"]`);
  await lanRow.locator("[data-name]").fill("Lan updated");
  await lanRow.locator("[data-person-save]").click();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)).team.some(
        (p) => p.name === "Lan updated",
      ),
    key,
  );
  assert.equal(
    (await snapshot(page)).tasks.find((t) => t.id === alpha.id).recordedByName,
    "Lan",
  );
  // Backups are encrypted, reviewed before restore, and guarded against stale previews.
  await clickTab(page, "about");
  await page.locator("#btnBackup").click();
  await page.locator('#recovery-dialog [name="passphrase"]').fill(pass);
  await page.locator('#recovery-dialog [name="repeat"]').fill(pass);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('#recovery-dialog button[type="submit"]').click();
  const download = await downloadPromise,
    file = readFileSync(await download.path());
  assert.ok(!file.toString().includes("Fictional Record Test"));
  assert.equal(JSON.parse(file).format, "careloop-protected-1");
  await page.locator("#recovery-dialog").waitFor({ state: "detached" });
  const backupState = await snapshot(page);
  await openBackup(page, file);
  await unlock(page, "wrong passphrase");
  await page
    .locator("#recovery-error")
    .filter({ hasText: /Could not unlock/ })
    .waitFor();
  assert.deepEqual(await snapshot(page), backupState);
  await unlock(page);
  await page.locator('[data-recovery-form="restore"]').waitFor();
  await addPerson(other, "New after preview");
  await confirmRestore(page);
  await page
    .locator("#recovery-error")
    .filter({ hasText: /Another tab/ })
    .waitFor();
  assert.ok(
    (await snapshot(page)).team.some((p) => p.name === "New after preview"),
  );
  await page.locator('#recovery-dialog [data-recovery="cancel"]').click();
  await openBackup(page, file);
  await unlock(page);
  await page.locator('[data-recovery-form="restore"]').waitFor();
  await confirmRestore(page);
  await page.locator("#recovery-dialog").waitFor({ state: "detached" });
  assert.ok(
    !(await snapshot(page)).team.some((p) => p.name === "New after preview"),
  );
  // Cancel deletion; then delete with explicit confirmation and retain a tombstone.
  await page.locator("#btnReset").click();
  await page.locator('#recovery-dialog [data-recovery="cancel"]').click();
  assert.equal((await snapshot(page)).patient.name, "Fictional Record Test");
  const beforeDelete = await snapshot(page);
  await page.locator("#btnReset").click();
  await page.locator('#recovery-dialog [name="understood"]').check();
  await page.locator('#recovery-dialog [name="confirmation"]').fill("DELETE");
  await page.locator('#recovery-dialog button[type="submit"]').click();
  await page.locator("#recovery-dialog").waitFor({ state: "detached" });
  assert.equal((await snapshot(page)).patient, null);
  assert.ok((await snapshot(page)).revision > beforeDelete.revision);
  await other.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).patient === null,
    key,
  );
  await other.reload();
  assert.equal((await snapshot(other)).patient, null);
  // Recover on a fresh device/browser profile, including offline operation.
  const freshContext = await browser.newContext({
      timezoneId: "America/Los_Angeles",
      acceptDownloads: true,
    }),
    fresh = await freshContext.newPage();
  fresh.on("pageerror", (e) => errors.push(e.message));
  await fresh.clock.install({ time: new Date("2026-11-01T10:30:00Z") });
  await fresh.goto(url);
  await openBackup(fresh, file);
  await unlock(fresh);
  await fresh.locator('[data-recovery-form="restore"]').waitFor();
  await confirmRestore(fresh);
  await fresh.locator("#recovery-dialog").waitFor({ state: "detached" });
  assert.equal((await snapshot(fresh)).patient.name, "Fictional Record Test");
  // Real browser Web Locks serialize simultaneous writers from separate tabs.
  const raceToken = await fresh.evaluate(
      (key) => localStorage.getItem(key),
      key,
    ),
    raceTab = await freshContext.newPage();
  await raceTab.goto(url);
  const attempt = async (target, label) =>
    target.evaluate(
      async ({ token, label }) => {
        const { createRecordStore } = await import("/record-store.js");
        const value = JSON.parse(token);
        value.flags.push(label);
        try {
          await createRecordStore().replace(value, token);
          return "saved";
        } catch (error) {
          return error.name;
        }
      },
      { token: raceToken, label },
    );
  const outcomes = await Promise.all([
    attempt(fresh, "Writer A"),
    attempt(raceTab, "Writer B"),
  ]);
  assert.equal(outcomes.filter((value) => value === "saved").length, 1);
  assert.equal(
    outcomes.filter((value) => value === "StaleRecordError").length,
    1,
  );
  const raceState = await snapshot(fresh);
  assert.equal(
    raceState.flags.filter((flag) => /^Writer /.test(flag)).length,
    1,
  );
  await raceTab.close();
  await fresh.reload();
  // The repeated autumn clock hour has an explicit first/second occurrence choice.
  await clickTab(fresh, "tasks");
  await fresh.locator("#dayFilter").selectOption("2026-11-01");
  const repeated = (await snapshot(fresh)).tasks.find(
    (t) => t.date === "2026-11-01" && t.label.startsWith("Alpha"),
  );
  await fresh.locator(`[data-done="${repeated.id}"]`).click();
  await fresh
    .locator('#record-form [name="recordedBy"]')
    .selectOption({ label: "Me" });
  await fresh
    .locator('#record-form [name="actualAt"]')
    .fill("2026-11-01T01:30");
  await fresh.locator('#record-form [name="actualAt"]').press("Tab");
  assert.equal(await fresh.locator("#clock-choice").isVisible(), true);
  await fresh
    .locator('#record-form [name="occurrence"]')
    .selectOption({ index: 1 });
  await fresh.locator('#record-form button[type="submit"]').click();
  await fresh.locator("#task-dialog").waitFor({ state: "detached" });
  assert.equal(
    (await snapshot(fresh)).tasks.find((t) => t.id === repeated.id).doneAt,
    new Date("2026-11-01T09:30:00Z").getTime(),
  );
  await fresh.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await fresh.waitForFunction(() => navigator.serviceWorker.controller);
  await freshContext.setOffline(true);
  await fresh.reload();
  await clickTab(fresh, "about");
  await fresh.locator("#btnBackup").click();
  await fresh.locator('#recovery-dialog [name="passphrase"]').fill(pass);
  await fresh.locator('#recovery-dialog [name="repeat"]').fill(pass);
  const offlineDownload = fresh.waitForEvent("download");
  await fresh.locator('#recovery-dialog button[type="submit"]').click();
  await offlineDownload;
  mkdirSync("test-results", { recursive: true });
  await fresh.setViewportSize({ width: 390, height: 844 });
  await clickTab(fresh, "tasks");
  await fresh.locator("#dayFilter").selectOption("2026-11-01");
  await fresh.locator(`[data-edit="${repeated.id}"]`).click();
  await fresh.screenshot({
    path: "test-results/record-dialog-phone.png",
    fullPage: true,
  });
  assert.equal(
    await fresh.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Record browser checks passed: actual time/recorder, unchanged timestamps, reasoned corrections, future blocking, stale-form protection, saved-plan drafts, caregiver editing, encrypted backup/restore, stale restore rejection, deletion, fresh-device recovery, repeated clock time and offline export.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}
