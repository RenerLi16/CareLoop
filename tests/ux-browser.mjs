import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { clickTab } from "./ui-helpers.mjs";
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
    server.stdout.on("data", (b) => {
      const match = String(b).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]);
    });
    server.once("error", reject);
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-25T12:00:00") });
  await page.goto(url);
  const snapshot = () =>
    page.evaluate(() =>
      localStorage.getItem("careloop_instructor_resolver_v1"),
    );
  await page.locator("#btnEmptyImport").click();
  await page.locator("#btnDemo").click();
  await page.locator("#btnParse").click();
  if (await page.locator("#ackUnread").count())
    await page.locator("#ackUnread").check();
  await page.locator("#btnGenerate").click();
  assert.equal(await snapshot(), null, "Preview must not save a plan");
  await page.locator("#btnBackToReview").click();
  assert.equal(
    await page.locator(".mDrug").count(),
    4,
    "Back keeps editable details",
  );
  await page.locator("#btnGenerate").click();
  await page.locator("#btnSavePlan").click();
  await page.locator("#p-schedule.on").waitFor();
  assert.ok(await snapshot());
  assert.equal(await page.locator(".schedule-group").count(), 4);
  assert.equal(
    await page.locator(".timing-details").evaluate((e) => e.open),
    false,
  );
  const saved = await snapshot();
  await clickTab(page, "import");
  await page.locator("#fName").fill("Unsaved preview name");
  await page.locator("#btnGenerate").click();
  await page.keyboard.press("Escape");
  assert.equal(await snapshot(), saved, "Cancel must preserve saved plan");
  await clickTab(page, "home");
  const firstPending = JSON.parse(saved)
    .tasks.filter((t) => t.date === "2026-10-25" && t.status === "todo")
    .sort((a, b) => a.time.localeCompare(b.time))[0];
  assert.equal(
    await page.locator("#nextTitle").innerText(),
    firstPending.label,
  );
  await page.locator("#btnNextDone").click();
  await page.locator('[name="recordedBy"]').selectOption({ index: 1 });
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  await page.locator(".completed-tasks summary").click();
  await page.locator("#todayTasks [data-edit]").first().click();
  await page
    .locator('[name="note"]')
    .fill("Corrected actual time after checking the record");
  await page.locator('[name="actualAt"]').fill("2026-10-25T08:15");
  await page.locator('#record-form button[type="submit"]').click();
  await page.locator("#task-dialog").waitFor({ state: "detached" });
  assert.ok(
    JSON.parse(await snapshot()).tasks.some((t) => t.corrections?.length),
  );
  await page.clock.fastForward(30000);
  assert.equal(
    await page.locator(".completed-tasks").evaluate((e) => e.open),
    true,
    "Refreshing the clock keeps completed records expanded",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/refine-today-desktop.png",
    fullPage: true,
  });
  await clickTab(page, "schedule");
  await page.screenshot({
    path: "test-results/refine-plan-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ["home", "schedule", "team", "import", "tasks", "about"]) {
      await clickTab(page, id);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${id}: no page overflow at ${width}`,
      );
      assert.equal(await page.locator("nav [aria-current=page]").count(), 1);
      assert.equal(
        await page.locator("#moreNav").evaluate((e) => e.open),
        false,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await clickTab(page, "home");
  await page.screenshot({
    path: "test-results/refine-today-phone.png",
    fullPage: true,
  });
  await clickTab(page, "tasks");
  await page.screenshot({
    path: "test-results/refine-records-phone.png",
    fullPage: true,
  });
  await clickTab(page, "import");
  await page.screenshot({
    path: "test-results/refine-setup-phone.png",
    fullPage: true,
  });
  // More supports keyboard dismissal and returns focus to its trigger.
  await page.locator("#moreNav summary").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#moreNav").evaluate((e) => e.open), false);
  assert.equal(
    await page
      .locator("#moreNav summary")
      .evaluate((e) => e === document.activeElement),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "UX checks passed: preview/back/save, cancelled edit preservation, Today completion/correction, grouped schedule, mobile navigation/overflow, keyboard dismissal.",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await once(server, "exit");
}
