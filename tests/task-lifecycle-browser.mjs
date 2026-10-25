import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const server = spawn(process.execPath, ["src/server.js"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
const key = "careloop_instructor_resolver_v1";
try {
  const url = await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({ timezoneId: "America/Los_Angeles" }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-25T18:59:55Z") });
  await page.clock.pauseAt(new Date("2026-10-25T19:00:00Z"));
  await page.goto(url);
  await page.locator('nav [data-t="import"]').click();
  await page
    .locator("#rawText")
    .fill(
      "Patient: Fictional Lifecycle Age: 50 Discharged: 2026-10-23\nMEDICATIONS\nAlpha 10 mg every 8 hours\nDelta 5 mg every 8 hours\nBeta 20 mg at bedtime",
    );
  await page.locator("#btnParse").click();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  const snapshot = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  let state = await snapshot();
  assert.equal(state.planStartAt, new Date("2026-10-25T19:00:00Z").getTime());
  assert.equal(state.patient.dischargeDate, "2026-10-23");
  assert.ok(state.tasks.every((task) => task.dueAt >= state.planStartAt));
  const first = state.tasks.find((task) => task.label.startsWith("Alpha"));
  const expiredTarget = state.tasks.find((task) =>
    task.label.startsWith("Delta"),
  );
  await page.locator('nav [data-t="home"]').click();
  assert.equal(await page.locator(".overdue-card").count(), 0);
  assert.match(await page.locator("#nextTitle").innerText(), /14:00/);
  await page.clock.fastForward(2 * 3600000);
  await page.locator("#btnNextDone").click();
  await page
    .locator('#record-form [name="recordedBy"]')
    .selectOption({ label: "Me" });
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  assert.equal(
    (await snapshot()).tasks.find((task) => task.id === first.id).status,
    "done",
  );
  await page.clock.fastForward(24 * 3600000);
  assert.equal(
    (await snapshot()).tasks.find((task) => task.id === expiredTarget.id)
      .status,
    "todo",
    "Exactly 24 hours is retained",
  );
  await page.clock.fastForward(30001);
  await page.waitForFunction(
    ({ key, id }) =>
      JSON.parse(localStorage.getItem(key)).tasks.find((task) => task.id === id)
        .status === "discarded",
    { key, id: expiredTarget.id },
  );
  state = await snapshot();
  assert.equal(state.tasks.find((task) => task.id === first.id).status, "done");
  assert.equal(
    await page.locator(`[data-overdue-done="${expiredTarget.id}"]`).count(),
    0,
  );
  await page.reload();
  await page.locator('nav [data-t="tasks"]').click();
  await page.locator("#btnAllDays").click();
  assert.equal(
    await page
      .locator(
        `[data-done="${expiredTarget.id}"],[data-edit="${expiredTarget.id}"]`,
      )
      .count(),
    0,
  );
  assert.equal(await page.locator(`[data-edit="${first.id}"]`).count(), 1);
  await page.locator('nav [data-t="import"]').click();
  await page.locator("#btnGenerate").click();
  await page.locator("#p-schedule.on").waitFor();
  assert.equal((await snapshot()).planStartAt, state.planStartAt);
  assert.equal(
    (await snapshot()).tasks.find((task) => task.id === expiredTarget.id)
      .status,
    "discarded",
  );
  // Catch up after the browser has been closed beyond the expiry threshold.
  await page.clock.setFixedTime(new Date("2026-10-28T19:00:00Z"));
  await page.reload();
  state = await snapshot();
  const now = await page.evaluate(() => Date.now());
  assert.ok(
    state.tasks
      .filter((task) => task.status === "todo")
      .every((task) => now - task.dueAt <= 86400000),
  );
  assert.equal(state.tasks.find((task) => task.id === first.id).status, "done");
  assert.deepEqual(errors, []);
  console.log(
    "Task lifecycle passed: loading old discharges starts now, no initial overdue tasks, strict 24-hour expiry, completed records preserved, hidden discarded items, rebuild/reload persistence, and closed-app catch-up.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}
