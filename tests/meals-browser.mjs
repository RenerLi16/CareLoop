import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { finishFirstVisit } from "./setup-helper.mjs";
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
  const context = await browser.newContext({
    timezoneId: "America/Los_Angeles",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|Refused/.test(message.text())
    )
      errors.push(message.text());
  });
  await page.clock.install({ time: new Date("2026-10-25T23:00:00Z") }); // 16:00
  await page.clock.pauseAt(new Date("2026-10-25T23:00:00Z"));
  await page.goto(url);
  await finishFirstVisit(page, "Fictional Meal Setup");
  const snapshot = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("careloop_instructor_resolver_v1")),
    );
  assert.equal(await page.locator("#mealSetupCard").isVisible(), true);
  await page.locator('nav [data-t="schedule"]').click();
  assert.equal(await page.locator(".meal-segment").count(), 3);
  assert.equal(
    await page.locator('[data-meal="dinner"]').getAttribute("data-start"),
    "17:30",
  );
  await page.locator('nav [data-t="home"]').click();
  mkdirSync("test-results", { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/meals-today-phone.png",
    fullPage: true,
  });
  await page.locator("#btnSetupMeals").click();
  await page.locator('[name="breakfast-end"]').fill("07:00");
  await page.locator("[data-review-meals]").click();
  assert.match(await page.locator("#meal-error").innerText(), /end later/);
  await page.locator('[name="breakfast-end"]').fill("08:30");
  await page.screenshot({
    path: "test-results/meals-editor-phone.png",
    fullPage: true,
  });
  assert.equal(
    await page
      .locator("#meal-dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.locator("[data-review-meals]").click();
  assert.equal(
    (await snapshot()).mealsConfigured,
    false,
    "Review does not save",
  );
  await page.locator("[data-save-meals]").click();
  await page.locator("#meal-dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator("#mealSetupCard").isHidden(), true);
  assert.equal((await snapshot()).mealsConfigured, true);
  await page.reload();
  assert.equal(await page.locator("#mealSetupCard").isHidden(), true);
  await page.locator("#btnEmptySample").click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("careloop_instructor_resolver_v1"))?.tasks
        .length > 0,
  );
  let before = await snapshot();
  assert.equal(
    before.mealsConfigured,
    true,
    "Loading sample retains chosen meals",
  );
  assert.equal(before.meals.dinner.start, "17:30");
  const evening = before.tasks.find(
    (task) => task.date === "2026-10-25" && task.medId === "m1",
  );
  assert.equal(evening.time, "18:30");
  await page.locator('nav [data-t="about"]').click();
  await page.locator("#btnEditMeals").click();
  await page.locator('[name="dinner-start"]').fill("16:30");
  await page.locator('[name="dinner-end"]').fill("17:30");
  await page.locator("[data-review-meals]").click();
  assert.match(
    await page.locator("#meal-preview").innerText(),
    /18:30 → 17:30/,
  );
  await page.locator("[data-cancel-meals]").click();
  assert.deepEqual(
    await snapshot(),
    before,
    "Cancelling leaves meals and schedule unchanged",
  );
  await page.locator("#btnEditMeals").click();
  await page.locator('[name="dinner-start"]').fill("16:30");
  await page.locator('[name="dinner-end"]').fill("17:30");
  await page.locator("[data-review-meals]").click();
  await page.locator("[data-save-meals]").click();
  await page.locator("#meal-dialog").waitFor({ state: "detached" });
  const changed = await snapshot();
  assert.equal(
    changed.tasks.find((task) => task.id === evening.id).time,
    "17:30",
  );
  assert.equal(changed.tasks.length, before.tasks.length);
  await page.locator('nav [data-t="schedule"]').click();
  const band = page.locator('[data-meal="dinner"]');
  assert.equal(await band.getAttribute("data-start"), "16:30");
  assert.equal(await band.getAttribute("data-end"), "17:30");
  assert.ok(
    Math.abs(
      (await band.evaluate(
        (el) => el.offsetLeft / el.parentElement.clientWidth,
      )) -
        990 / 1440,
    ) < 0.002,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Page contained at ${width}`,
    );
    assert.equal(await page.locator(".meal-segment").count(), 3);
  }
  await page.screenshot({
    path: "test-results/meals-schedule-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/meals-schedule-phone.png",
    fullPage: true,
  });
  await page.clock.setFixedTime(new Date("2026-10-25T23:57:00Z"));
  await page.locator('nav [data-t="home"]').click();
  await page.locator("#btnNextDone").click();
  await page.locator('[name="recordedBy"]').selectOption({ index: 1 });
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#resolution-dialog").waitFor();
  assert.doesNotMatch(
    await page.locator("#resolution-dialog").innerText(),
    /actual time does not fit|No revised schedule/,
  );
  await page.locator("[data-dismiss-resolution]").click();
  const completed = (await snapshot()).tasks.find(
    (task) => task.id === evening.id,
  );
  assert.equal(completed.status, "done");
  assert.equal(new Date(completed.doneAt).getMinutes(), 57);
  await page.locator('nav [data-t="about"]').click();
  await page.locator("#btnEditMeals").click();
  await page.locator('[name="dinner-start"]').fill("16:00");
  await page.locator('[name="dinner-end"]').fill("18:00");
  await page.locator("[data-review-meals]").click();
  await page.locator("[data-save-meals]").click();
  await page.locator("#meal-dialog").waitFor({ state: "detached" });
  assert.deepEqual(
    (await snapshot()).tasks.find((task) => task.id === evening.id),
    completed,
  );
  // A second tab cannot apply a preview based on older settings.
  await page.locator("#btnEditMeals").click();
  await page.locator("[data-review-meals]").click();
  const other = await context.newPage();
  await other.goto(url);
  await other.locator('nav [data-t="about"]').click();
  await other.locator("#btnEditMeals").click();
  await other.locator('[name="dinner-end"]').fill("18:15");
  await other.locator("[data-review-meals]").click();
  await other.locator("[data-save-meals]").click();
  await other.locator("#meal-dialog").waitFor({ state: "detached" });
  await page.locator("[data-save-meals]").click();
  assert.match(
    await page.locator("#meal-error").innerText(),
    /Another tab|changed/,
  );
  assert.equal((await snapshot()).meals.dinner.end, "18:15");
  await page.locator("[data-cancel-meals]").click();
  await other.close();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator('nav [data-t="schedule"]').click();
  assert.equal(
    await page.locator('[data-meal="dinner"]').getAttribute("data-end"),
    "18:15",
  );
  assert.equal(await page.locator("#mealSetupCard").isHidden(), true);
  assert.deepEqual(errors, []);
  console.log(
    "Meal browser checks passed: first-use card, defaults, validation, review/cancel/save, About edits, dose previews, 16:57 completion, preserved records, stale-tab protection, responsive bands, persistence and offline reopening.",
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}
